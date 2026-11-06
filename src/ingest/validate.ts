import { MAX_READ_BYTES } from './bounds.js';
import { mapConcurrent } from './concurrency.js';
import { finalizeDiagnostics } from './diff.js';
import { decodeUtf8, parseFrontmatter } from './frontmatter.js';
import { computeSnapshotId, verifyEntryBytes } from './hash.js';
import { manifestEntryReferences, manifestEntryUrl, readImagesManifest } from './manifest.js';
import type { ImagesManifestDocument } from './manifest.js';
import {
  basename,
  classifyPath,
  collisionKey,
  compareCanonical,
  dirname,
  isDefaultIndexFile,
  isActiveContentPath,
  isExcluded,
  isForbiddenIndexFile,
  isImagePath,
  isOriginalPath,
  isRelativeReference,
  isWithin,
  joinPath,
  normalizePath,
  referenceProblem,
  resolveReference,
  urlFieldProblem,
} from './paths.js';
import type { UrlFieldOptions, UrlFieldProblem } from './paths.js';
import { indexFolders, primaryIndex } from './series.js';
import { entryStructureError, snapshotStructureError } from './snapshot.js';
import { writtenDay } from '../written-date.js';
import type { ContentSnapshot, Diagnostic, DiagnosticCode, ReadFn, Severity, SnapshotEntry } from './types.js';

/** Racine de corpus soumise à validation (§4.10). */
export interface ValidationRoot {
  /** Chemin relatif à la racine du corpus ; `''` = tout le corpus. */
  readonly path: string;
  /** `false` : les séries de cette racine ne sont pas datées. Défaut `true`. */
  readonly dateRequired?: boolean;
}

/** Options de `validateSnapshot`. */
export interface ValidateSnapshotOptions {
  /** Lit les fichiers index et les `images.json` (matérialisés, des racines seulement). */
  readonly read: ReadFn;
  /** Défaut : une racine unique `''`, `dateRequired: true`. */
  readonly roots?: readonly ValidationRoot[];
  /** Lectures simultanées. Défaut 16. */
  readonly concurrency?: number;
  /**
   * Confronte aussi chaque frontmatter à `baseSeriesSchema`, le schéma du build
   * Astro : ce que le build refuserait sans que le §4.10 le code (`tags: solo`)
   * remonte en `x-schema-invalid` (error). Désactivé par défaut : la sortie est
   * alors exactement celle de la spec, identique à toute autre implémentation.
   */
  readonly astroSchema?: boolean;
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Règle de la spec invoquée par chaque code, reportée dans `Diagnostic.rule`.
const RULES: Partial<Record<DiagnosticCode, string>> = {
  'snapshot-invalid': '§4.5',
  'snapshot-version-unsupported': '§4.5',
  'snapshot-incomplete': '§4.5',
  'snapshot-empty': '§4.10',
  'snapshot-id-mismatch': '§4.6',
  'entry-invalid': '§4.5',
  'entry-path-invalid': '§4.1',
  'entry-kind-mismatch': '§4.3',
  'entry-path-collision': '§4.1',
  'entry-hash-missing': '§4.4',
  'entry-not-materialized': '§4.5',
  'entry-hash-mismatch': '§4.4',
  'entry-conflict': '§4.5',
  'slug-invalid': '§1.2',
  'media-nested': '§1.2',
  'media-orphan': '§1.2',
  'index-default-missing': 'Annexe F',
  'nesting-too-deep': '§1.8',
  'section-has-media': '§1.10',
  'frontmatter-missing': '§1.3',
  'frontmatter-invalid': '§1.3',
  'title-missing': '§1.3',
  'date-missing': '§1.3',
  'date-invalid': '§1.3',
  'type-invalid': '§1.10',
  'cover-not-found': '§1.3',
  'cover-not-image': '§1.9',
  'images-conflict': '§1.5.1',
  'images-json-invalid': '§1.5.1',
  'attachment-not-found': '§1.9',
  'embed-url-missing': '§1.11',
  'gps-precision-excessive': '§1.12',
  'attachment-active-content': '§1.12',
  'private-type-invalid': '§1.12',
  'private-key-suspect': '§1.12',
  'index-mdx-forbidden': '§1.12',
  'url-scheme-forbidden': '§1.12',
  'reference-unsafe': '§1.12',
  'x-schema-invalid': '§2.1',
};

const WARNINGS = new Set<DiagnosticCode>([
  'media-orphan',
  'index-default-missing',
  'section-has-media',
  'cover-not-found',
  'images-json-invalid',
  'attachment-not-found',
  'gps-precision-excessive',
  'attachment-active-content',
  'private-key-suspect',
]);

function diagnostic(code: DiagnosticCode, path: string, message: string): Diagnostic {
  const rule = RULES[code];
  const severity: Severity = WARNINGS.has(code) ? 'warning' : 'error';
  return { code, severity, path, message, ...(rule !== undefined ? { rule } : {}) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Une clé de valeur `null` vaut absente (§4.10, règle 6). */
function field(data: Record<string, unknown>, key: string): unknown {
  return data[key] === null ? undefined : data[key];
}

/** Date ISO 8601 valide au sens de §4.10, règle 8 — calendrier et horloge compris. */
function isIsoDate(value: unknown): boolean {
  return typeof value === 'string' && writtenDay(value) !== null;
}

/** Clé qui ne diffère de `private` que par la casse, des espaces, `_` ou `-` (§4.10, règle 7). */
function isPrivateLookalike(key: string): boolean {
  return key !== 'private' && key.toLowerCase().replace(/[\s_-]/g, '') === 'private';
}

/** Valeur numérique qui n'égale pas son arrondi à deux décimales (§4.10, règle 18). */
function hasExcessivePrecision(value: unknown): boolean {
  return typeof value === 'number' && Math.abs(value - Math.round(value * 100) / 100) > 1e-9;
}

/** Contenu d'un `images.json`, ou `null` s'il est invalide (§1.5.1). */
function parseManifest(content: Uint8Array | string): ImagesManifestDocument | null {
  const text = decodeUtf8(content);
  if (text === null) return null;
  const result = readImagesManifest(text);
  return result.ok ? result.manifest : null;
}

const URL_PROBLEMS: Readonly<Record<UrlFieldProblem, string>> = {
  'url-scheme-forbidden':
    'forme d\'URL refusée : seuls un chemin relatif, un chemin absolu au site et `http:` ou `https:` sont admis (§1.12).',
  'reference-unsafe':
    'référence non sûre : `\\`, caractère de contrôle, `%2e`, `%2f`, `%5c` ou sortie de la racine du corpus (§1.12).',
};

/** Diagnostic d'une valeur de champ d'URL — message et valeur écrite, sans la décoder. */
function urlProblemMessage(label: string, value: string, problem: UrlFieldProblem): string {
  return `${label} ${JSON.stringify(value)} : ${URL_PROBLEMS[problem]}`;
}

/** Chemin d'une valeur dans le frontmatter, pour le message : `images[2].url`. */
function fieldLabel(at: ReadonlyArray<string | number>): string {
  return at.map((key, i) => (typeof key === 'number' ? `[${key}]` : i === 0 ? key : `.${key}`)).join('');
}

/** Le manifeste référence-t-il `target` (§4.10, règle 9) ? */
function manifestReferences(images: readonly unknown[], folder: string, target: string): boolean {
  return images.some((image) => manifestEntryReferences(image, folder, target));
}

/**
 * Schéma du build, chargé à la demande : `zod` n'entre dans le graphe
 * d'imports de `./ingest` que si l'appelant demande `astroSchema`.
 */
async function loadSeriesSchema() {
  const { baseSeriesSchema } = await import('../schema.js');
  return baseSeriesSchema({ dateRequired: false });
}

/** Fichier index lu : `data` à `null` s'il est illisible ou non lu (placeholder, conflit, octets divergents). */
interface ParsedIndex {
  readonly path: string;
  readonly folder: string;
  readonly data: Record<string, unknown> | null;
}

/**
 * Valide un snapshot contre le contrat d'ingestion et le format Hyperfocale
 * (§4.10). Rend des diagnostics triés par chemin puis par code, un seul par
 * couple `(code, path)` ; une liste sans `error` autorise la publication, du
 * point de vue du format.
 *
 * Les contrôles d'entrée (`snapshot-*`, `entry-*`) portent sur tout le
 * snapshot ; les contrôles de structure et de frontmatter sur les seules
 * racines configurées — hors racines, les fichiers sont copiés, pas validés.
 * Un snapshot se vérifie, il ne se croit pas sur parole : sa structure d'abord
 * (un document mal formé ne produit que `snapshot-invalid`), puis son `id`,
 * recalculé, et ses `kind`, confrontés au chemin. Une entrée structurellement
 * invalide ou au chemin invalide est écartée de tout le reste ; une entrée
 * `placeholder` ou `conflict` n'est jamais lue ; les octets lus sont vérifiés
 * contre l'empreinte, et un fichier qui a changé depuis le listing
 * (`entry-hash-mismatch`) est traité comme non lu.
 *
 * `snapshot` est un document JSON supposé être un snapshot : il n'a pas besoin
 * d'être passé par `parseSnapshot`, dont le rejet structurel lève au lieu de
 * diagnostiquer.
 *
 * Avec `astroSchema`, les champs sont en plus confrontés à `baseSeriesSchema`,
 * le schéma du build Astro : une violation sans code propre au contrat
 * (`tags: solo`, `featured: "oui"`) remonte en `x-schema-invalid` (error) —
 * préfixe `x-` réservé aux contrôles propres à une implémentation.
 */
export async function validateSnapshot(
  snapshot: ContentSnapshot | unknown,
  options: ValidateSnapshotOptions,
): Promise<Diagnostic[]> {
  const structure = snapshotStructureError(snapshot);
  if (structure !== null) return [diagnostic(structure.code, '', `Document rejeté : ${structure.message}`)];
  const document = snapshot as { id: string; complete: boolean; entries: unknown[] };

  const roots = options.roots ?? [{ path: '', dateRequired: true }];
  const concurrency = options.concurrency ?? 16;
  const diagnostics: Diagnostic[] = [];
  const push = (code: DiagnosticCode, path: string, message: string) => diagnostics.push(diagnostic(code, path, message));

  if (!document.complete) {
    push('snapshot-incomplete', '', 'Listing incomplet : aucune publication, donc aucune suppression.');
  }

  // ── Entrées ───────────────────────────────────────────────────────────────
  const wellFormed: SnapshotEntry[] = [];
  for (const raw of document.entries) {
    const error = entryStructureError(raw);
    if (error === null) {
      wellFormed.push(raw as SnapshotEntry);
    } else {
      const path = typeof (raw as { path?: unknown } | null)?.path === 'string' ? (raw as { path: string }).path : '';
      push('entry-invalid', path, `Entrée invalide : ${error}.`);
    }
  }
  // L'identifiant ne se recalcule que sur des entrées toutes bien formées.
  if (wellFormed.length === document.entries.length) {
    const recomputed = await computeSnapshotId(wellFormed);
    if (recomputed !== document.id) {
      push('snapshot-id-mismatch', '', `\`id\` déclaré ${document.id}, recalculé ${recomputed}.`);
    }
  }

  const retained: SnapshotEntry[] = [];
  for (const entry of wellFormed) {
    const normalized = normalizePath(entry.path);
    if (!normalized.valid) {
      push('entry-path-invalid', entry.path, `Chemin invalide : ${normalized.reason}.`);
    } else if (normalized.path !== entry.path) {
      push('entry-path-invalid', entry.path, 'Chemin non normalisé NFC.');
    } else if (isExcluded(entry.path)) {
      push('entry-path-invalid', entry.path, 'Chemin exclu (§4.2) : il n\'a pas sa place dans un snapshot.');
    } else {
      const kind = classifyPath(entry.path);
      if (kind !== entry.kind) {
        push('entry-kind-mismatch', entry.path, `\`kind\` déclaré « ${entry.kind} », classification « ${kind} ».`);
      }
      retained.push(kind === entry.kind ? entry : { ...entry, kind });
    }
  }
  retained.sort((a, b) => compareCanonical(a.path, b.path));

  if (!retained.some((entry) => entry.kind === 'content')) {
    push('snapshot-empty', '', 'Aucune entrée de contenu : le snapshot est vide.');
  }
  const collisions = new Map<string, string>();
  for (const entry of retained) {
    const key = collisionKey(entry.path);
    const first = collisions.get(key);
    if (first !== undefined) {
      push('entry-path-collision', entry.path, `Collision avec « ${first} » (casse ou normalisation Unicode).`);
    } else {
      collisions.set(key, entry.path);
    }
    if (entry.state === 'placeholder') {
      push('entry-not-materialized', entry.path, 'Fichier non matérialisé (placeholder) : publication impossible.');
    } else if (entry.state === 'conflict') {
      push('entry-conflict', entry.path, 'Conflit de version signalé par le provider : publication impossible.');
    } else if (entry.hashes === undefined || Object.keys(entry.hashes).length === 0) {
      push('entry-hash-missing', entry.path, 'Entrée matérialisée sans empreinte.');
    }
  }

  // ── Racines ───────────────────────────────────────────────────────────────
  const rootOf = (path: string): ValidationRoot | undefined => {
    let best: ValidationRoot | undefined;
    for (const root of roots) {
      if (isWithin(path, root.path) && (best === undefined || root.path.length > best.path.length)) best = root;
    }
    return best;
  };
  const scoped = retained.filter((entry) => rootOf(entry.path) !== undefined);
  const byPath = new Map(retained.map((entry) => [entry.path, entry]));
  const folders = indexFolders(scoped);

  // ── Lecture ───────────────────────────────────────────────────────────────
  // Seules les entrées matérialisées se lisent, et leurs octets se vérifient.
  const readable = (path: string) => (byPath.get(path)?.state ?? 'materialized') === 'materialized';
  // Borne de §1.12, jugée sur la taille déclarée : un fichier trop gros n'est pas lu.
  const oversize = (path: string) => (byPath.get(path) as SnapshotEntry).size > MAX_READ_BYTES;
  const readVerified = async (path: string): Promise<Uint8Array | string | null> => {
    const content = await options.read(path);
    if (await verifyEntryBytes(byPath.get(path) as SnapshotEntry, content)) return content;
    push('entry-hash-mismatch', path, 'Octets lus différents de l\'empreinte : modifié depuis le listing, un nouveau listing s\'impose.');
    return null;
  };
  const indexPaths = [...folders.values()].flat();
  const parsed = await mapConcurrent(indexPaths, concurrency, async (path): Promise<ParsedIndex> => {
    const folder = dirname(path);
    if (readable(path) && oversize(path)) {
      push('frontmatter-invalid', path, `Frontmatter illisible : fichier de plus de ${MAX_READ_BYTES} octets, non lu (§1.12).`);
      return { path, folder, data: null };
    }
    const content = readable(path) ? await readVerified(path) : null;
    if (content === null) return { path, folder, data: null };
    const result = parseFrontmatter(content);
    if (result.status === 'missing') {
      push('frontmatter-missing', path, 'Fichier index sans bloc de frontmatter `---` refermé.');
      return { path, folder, data: null };
    }
    if (result.status === 'invalid') {
      push('frontmatter-invalid', path, `Frontmatter illisible : ${result.reason}.`);
      return { path, folder, data: null };
    }
    return { path, folder, data: result.data };
  });
  const indexByPath = new Map(parsed.map((index) => [index.path, index]));

  const manifests = new Map<string, readonly unknown[] | null>();
  const manifestPaths = scoped.filter((e) => basename(e.path) === 'images.json' && readable(e.path)).map((e) => e.path);
  await mapConcurrent(manifestPaths, concurrency, async (path) => {
    let document: ImagesManifestDocument | null = null;
    if (!oversize(path)) {
      const content = await readVerified(path);
      if (content === null) return;
      document = parseManifest(content);
    }
    const images = document?.images ?? null;
    manifests.set(dirname(path), images);
    if (document !== null) {
      // Règles 15 et 17 sur les entrées du manifeste : le diagnostic porte sur `images.json`.
      const folder = dirname(path);
      const escapesRoot = (reference: string) => resolveReference(folder, reference) === null;
      const check = (value: string | null, label: string, options: UrlFieldOptions = {}) => {
        const problem = value === null ? null : urlFieldProblem(value, { ...options, escapesRoot });
        if (value !== null && problem !== null) push(problem, path, urlProblemMessage(label, value, problem));
      };
      document.images.forEach((entry, i) => check(manifestEntryUrl(entry), `\`images[${i}]\``));
      document.files?.forEach((entry, i) => {
        check(isRecord(entry) && typeof entry.url === 'string' ? entry.url : null, `\`files[${i}].url\``);
      });
    }
    if (images === null) {
      push(
        'images-json-invalid',
        path,
        'JSON illisible, bornes de lecture franchies (§1.12), racine non objet, ou clé `images` absente ou non tableau.',
      );
    }
  });

  // ── Structure ─────────────────────────────────────────────────────────────
  // Nature d'un dossier porteur (règle 13) : illisible, placeholder ou conflit → série.
  const isSection = (folder: string): boolean =>
    field(indexByPath.get(primaryIndex(folders.get(folder) as string[]))?.data ?? {}, 'type') === 'section';

  for (const [folder, indexes] of folders) {
    const root = rootOf(folder) as ValidationRoot;
    if (folder !== root.path && !SLUG.test(basename(folder))) {
      push('slug-invalid', folder, `« ${basename(folder)} » ne suit pas ^[a-z0-9]+(-[a-z0-9]+)*$.`);
    }
    if (!indexes.some((path) => isDefaultIndexFile(basename(path)))) {
      push('index-default-missing', folder, 'Fichier index de langue sans `index.md`.');
    }
    if (isSection(folder)) {
      const media = `${joinPath(folder, 'media')}/`;
      if (scoped.some((entry) => entry.path.startsWith(media))) {
        push('section-has-media', folder, 'Une page de section ne porte pas de `media/`.');
      }
      continue;
    }
    // Ancêtres porteurs de type série situés dans la racine, racine comprise.
    let seriesAncestors = 0;
    for (let dir = folder; dir !== root.path && dir !== ''; ) {
      dir = dirname(dir);
      if (isWithin(dir, root.path) && folders.has(dir) && !isSection(dir)) seriesAncestors++;
    }
    if (seriesAncestors >= 2) {
      push('nesting-too-deep', folder, 'Série sous une sous-série : l\'imbrication est limitée à un niveau.');
    }
  }

  // `index-mdx-forbidden` et règle 16 : le chemin seul décide, l'état de l'entrée
  // n'y change rien et le fichier n'est pas lu.
  for (const entry of scoped) {
    if (entry.kind === 'content' && isForbiddenIndexFile(basename(entry.path))) {
      push('index-mdx-forbidden', entry.path, 'MDX est du code exécutable : seul `index.md` (ou `index.<lang>.md`) porte une série (§1.12).');
    }
    if (entry.kind === 'media' && isActiveContentPath(entry.path)) {
      push('attachment-active-content', entry.path, 'Document joint de contenu actif : à servir de façon isolée (§1.12).');
    }
  }

  // `media-nested` et `media-orphan` ne regardent que les segments sous la racine.
  for (const entry of scoped) {
    const root = rootOf(entry.path) as ValidationRoot;
    const prefix = root.path === '' ? '' : `${root.path}/`;
    const segments = entry.path.slice(prefix.length).split('/');
    const at = (n: number) => prefix + segments.slice(0, n).join('/');
    for (let i = 0; i < segments.length - 1; i++) {
      if (segments[i] === 'media' && !folders.has(dirname(at(i + 1)))) {
        push('media-orphan', at(i + 1), '`media/` sans fichier index dans son dossier parent.');
      }
    }
    const nested = segments.slice(0, -2).indexOf('media');
    if (nested !== -1) push('media-nested', at(nested + 2), '`media/` est plat : pas de sous-dossier.');
  }

  // ── Frontmatter, fichier par fichier ──────────────────────────────────────
  for (const { path, folder, data } of parsed) {
    if (data === null) continue;
    const root = rootOf(path) as ValidationRoot;

    const type = field(data, 'type');
    if (type !== undefined && type !== 'series' && type !== 'section') {
      push('type-invalid', path, `\`type\` vaut « ${String(type)} » : attendu \`series\` ou \`section\`.`);
    }
    const section = type === 'section';
    const privateValue = field(data, 'private');
    if (privateValue !== undefined && typeof privateValue !== 'boolean') {
      push('private-type-invalid', path, '`private` doit être un booléen YAML (`true` ou `false`) : toute autre valeur est une erreur, jamais un contenu public.');
    }
    if (Object.keys(data).some(isPrivateLookalike)) {
      push('private-key-suspect', path, 'Une clé ne diffère de `private` que par la casse, des espaces, `_` ou `-` : elle ne protège rien.');
    }
    const gps = isRecord(data.iptc) ? data.iptc.gps : undefined;
    if (isRecord(gps) && (hasExcessivePrecision(gps.lat) || hasExcessivePrecision(gps.lng))) {
      push('gps-precision-excessive', path, '`iptc.gps` a plus de 2 décimales (≈ 1,1 km) : une position précise publiée est irréversible (§1.12).');
    }
    const title = field(data, 'title');
    if (typeof title !== 'string' || title.length === 0) push('title-missing', path, '`title` absent ou vide.');
    const date = field(data, 'date');
    if (date === undefined) {
      if ((root.dateRequired ?? true) && !section) {
        push('date-missing', path, '`date` requise pour une série (une section se déclare `type: section`).');
      }
    } else if (!section && !isIsoDate(date)) {
      push('date-invalid', path, `\`date\` n'est pas une date ISO 8601 valide : « ${String(date)} ».`);
    }

    // Règles 15 et 17 : une valeur refusée ne subit aucun autre contrôle, et un
    // seul diagnostic la désigne. `flagged` retient les chemins des valeurs
    // refusées pour que `x-schema-invalid` ne les redouble pas.
    const flagged: Array<ReadonlyArray<string | number>> = [];
    const escapesRoot = (reference: string) => resolveReference(folder, reference) === null;
    const checkUrl = (value: unknown, at: ReadonlyArray<string | number>, options: UrlFieldOptions = {}): boolean => {
      if (typeof value !== 'string') return false;
      const problem = urlFieldProblem(value, { ...options, escapesRoot });
      if (problem === null) return false;
      push(problem, path, urlProblemMessage(`\`${fieldLabel(at)}\``, value, problem));
      flagged.push(at);
      return true;
    };

    // Deux règles indépendantes, qui se cumulent (règle 10) : l'extension pour
    // `cover-not-image`, l'existence pour `cover-not-found`.
    const cover = field(data, 'cover');
    const coverRefused = checkUrl(cover, ['cover']);
    if (!coverRefused && typeof cover === 'string' && isRelativeReference(cover)) {
      const target = resolveReference(folder, cover);
      const manifest = manifests.get(folder);
      if (!isImagePath(cover)) {
        push('cover-not-image', path, `\`cover\` « ${cover} » ne désigne pas une image.`);
      }
      if (
        target === null ||
        (!byPath.has(target) && !(Array.isArray(manifest) && manifestReferences(manifest, folder, target)))
      ) {
        push('cover-not-found', path, `\`cover\` « ${cover} » introuvable.`);
      }
    }

    const images = field(data, 'images');
    if (images !== undefined && byPath.has(joinPath(folder, 'images.json'))) {
      push('images-conflict', path, '`images:` du frontmatter et `images.json` dans la même série.');
    }
    if (Array.isArray(images)) {
      images.forEach((entry, i) => {
        if (isRecord(entry)) checkUrl(entry.url, ['images', i, 'url']);
        else checkUrl(entry, ['images', i]);
      });
    }
    const files = field(data, 'files');
    if (Array.isArray(files)) {
      files.forEach((entry, i) => {
        if (isRecord(entry)) checkUrl(entry.url, ['files', i, 'url']);
      });
    }

    const attachments = field(data, 'attachments');
    if (Array.isArray(attachments)) {
      const mediaDir = joinPath(folder, 'media');
      for (const [i, attachment] of attachments.entries()) {
        const file = isRecord(attachment) ? attachment.file : undefined;
        if (typeof file === 'string' && referenceProblem(file, escapesRoot) !== null) {
          push('reference-unsafe', path, urlProblemMessage(`\`attachments[${i}].file\``, file, 'reference-unsafe'));
          flagged.push(['attachments', i, 'file']);
          continue;
        }
        const target = typeof file === 'string' && isRelativeReference(file) ? resolveReference(folder, file) : null;
        if (target === null || dirname(target) !== mediaDir || !byPath.has(target)) {
          push('attachment-not-found', path, `Pièce jointe « ${String(file)} » absente de \`media/\`.`);
        } else if (isOriginalPath(target)) {
          // Un original n'est pas un document joint (§1.9, règle 12) : le
          // fichier existe, mais l'entrée ne désigne rien de publiable.
          push('attachment-not-found', path, `Pièce jointe « ${String(file)} » : un original n'est pas un document joint.`);
        }
      }
    }

    const embeds = field(data, 'embeds');
    if (Array.isArray(embeds)) {
      embeds.forEach((embed, i) => {
        if (!isRecord(embed) || typeof embed.url !== 'string' || embed.url === '') {
          push('embed-url-missing', path, `\`embeds[${i}]\` sans \`url\`.`);
        }
        if (isRecord(embed)) {
          checkUrl(embed.url, ['embeds', i, 'url'], { httpOnly: true });
          checkUrl(embed.poster, ['embeds', i, 'poster']);
        }
      });
    }

    // Le schéma du build, pour ce que le §4.10 ne code pas. `title`, `type`,
    // `private`, les `embeds`, la `date` d'une série et les `null` (valent
    // absents) sont déjà couverts. La `date` d'une section échappe au §4.10 mais pas au
    // build : elle passe ici.
    if (options.astroSchema !== true) continue;
    const present = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== null));
    const schema = (await loadSeriesSchema()).safeParse(present);
    if (!schema.success) {
      const covered = new Set(section ? ['title', 'type', 'private', 'embeds'] : ['title', 'date', 'type', 'private', 'embeds']);
      const refused = (issue: { readonly path: ReadonlyArray<PropertyKey> }) =>
        flagged.some((at) => {
          const common = Math.min(at.length, issue.path.length);
          return at.slice(0, common).every((key, i) => String(key) === String(issue.path[i]));
        });
      const issues = schema.error.issues.filter((issue) => !covered.has(String(issue.path[0])) && !refused(issue));
      if (issues.length > 0) {
        const detail = issues.map((issue) => `${issue.path.join('.') || '(racine)'} : ${issue.message}`).join(' ; ');
        push('x-schema-invalid', path, `Champs refusés par le schéma du build : ${detail}.`);
      }
    }
  }

  return finalizeDiagnostics(diagnostics);
}
