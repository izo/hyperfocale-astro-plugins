import { baseSeriesSchema } from '../schema.js';
import { mapConcurrent } from './concurrency.js';
import { compareDiagnostics } from './diff.js';
import { decodeText, parseFrontmatter } from './frontmatter.js';
import {
  basename,
  collisionKey,
  compareCanonical,
  dirname,
  isDefaultIndexFile,
  isImagePath,
  isWithin,
  joinPath,
  normalizePath,
} from './paths.js';
import { indexFolders, primaryIndex } from './series.js';
import type { ContentSnapshot, Diagnostic, DiagnosticCode, ReadFn, Severity } from './types.js';

/** Racine de corpus soumise à validation (§2.10). */
export interface ValidationRoot {
  /** Chemin relatif à la racine du corpus ; `''` = tout le corpus. */
  readonly path: string;
  /** `false` : les séries de cette racine ne sont pas datées. Défaut `true`. */
  readonly dateRequired?: boolean;
}

/** Options de `validateSnapshot`. */
export interface ValidateSnapshotOptions {
  /** Lit les fichiers index et les `images.json`. */
  readonly read: ReadFn;
  /** Défaut : une racine unique `''`, `dateRequired: true`. */
  readonly roots?: readonly ValidationRoot[];
  /** Lectures simultanées. Défaut 16. */
  readonly concurrency?: number;
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const ISO_DATE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[Tt ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[Zz]|[+-]\d{2}(?::?\d{2})?)?)?$/;

// Règle de la spec invoquée par chaque code, reportée dans `Diagnostic.rule`.
const RULES: Partial<Record<DiagnosticCode, string>> = {
  'snapshot-version-unsupported': '§2.5',
  'snapshot-incomplete': '§2.5',
  'snapshot-empty': '§2.10',
  'entry-path-invalid': '§2.1',
  'entry-path-collision': '§2.1',
  'entry-hash-missing': '§2.4',
  'entry-not-materialized': '§2.5',
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
};

const SEVERITIES: Record<string, Severity> = {
  'media-orphan': 'warning',
  'index-default-missing': 'warning',
  'section-has-media': 'warning',
  'cover-not-found': 'warning',
  'images-json-invalid': 'warning',
  'attachment-not-found': 'warning',
};

function diagnostic(code: DiagnosticCode, path: string | undefined, message: string): Diagnostic {
  const rule = RULES[code];
  return {
    code,
    severity: SEVERITIES[code] ?? 'error',
    ...(path !== undefined ? { path } : {}),
    message,
    ...(rule !== undefined ? { rule } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `date` est-elle une date ISO 8601 (§1.3) — calendrier compris ? */
function isIsoDate(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const m = ISO_DATE.exec(value.trim());
  if (m === null) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const calendar = new Date(Date.UTC(year, month - 1, day));
  return calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day && !Number.isNaN(Date.parse(value));
}

/** Chemin relatif (`./media/01.jpg`) — ni URL, ni chemin absolu au site. */
function isRelativeReference(ref: string): boolean {
  return !URL_SCHEME.test(ref) && !ref.startsWith('/');
}

/** Résout une référence relative depuis un dossier ; `null` si elle sort du corpus. */
function resolveReference(folder: string, ref: string): string | null {
  const stack: string[] = [];
  for (const segment of joinPath(folder, ref.normalize('NFC')).split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (stack.length === 0) return null;
      stack.pop();
    } else {
      stack.push(segment);
    }
  }
  return stack.join('/');
}

/** Chemin d'URL décodé d'une entrée de manifeste absolue (`https://…` ou `/…`). */
function manifestUrlPath(ref: string): string {
  let pathname = ref;
  try {
    pathname = new URL(ref, 'https://manifest.invalid').pathname;
  } catch {
    // Référence malformée : comparée telle quelle.
  }
  try {
    return decodeURIComponent(pathname).normalize('NFC');
  } catch {
    return pathname.normalize('NFC');
  }
}

/** Lecture parsée d'un `images.json` : entrées d'images, ou `null` si invalide. */
function parseManifest(raw: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) && Array.isArray(parsed.images) ? parsed.images : null;
  } catch {
    return null;
  }
}

/** Le manifeste référence-t-il le fichier `target` (chemin relatif au corpus) ? */
function manifestReferences(images: readonly unknown[], folder: string, target: string): boolean {
  return images.some((image) => {
    const ref = typeof image === 'string' ? image : isRecord(image) && typeof image.url === 'string' ? image.url : null;
    if (ref === null || ref === '') return false;
    if (isRelativeReference(ref)) return resolveReference(folder, ref) === target;
    const urlPath = manifestUrlPath(ref);
    return urlPath === `/${target}` || urlPath.endsWith(`/${target}`);
  });
}

/** Fichier index parsé. */
interface ParsedIndex {
  readonly path: string;
  readonly folder: string;
  readonly data: Record<string, unknown> | null;
}

/**
 * Valide un snapshot contre le contrat d'ingestion et le format Hyperfocale
 * (§2.10). Rend des diagnostics triés par chemin puis par code ; une liste sans
 * `error` autorise la publication, du point de vue du format.
 *
 * Les contrôles d'entrée (chemin, collision, empreinte, matérialisation)
 * portent sur tout le snapshot ; les contrôles de structure et de frontmatter
 * sur les seules racines configurées — hors racines, les fichiers sont copiés,
 * pas validés.
 *
 * Les champs du frontmatter sont confrontés à `baseSeriesSchema`, le schéma
 * même du build Astro. Une violation qui n'a pas de code propre au §2.10
 * (`tags: "x"`, `featured: "oui"`) remonte en `frontmatter-invalid` : un
 * frontmatter que le build refuserait ne passe pas la validation en silence.
 */
export async function validateSnapshot(
  snapshot: ContentSnapshot,
  options: ValidateSnapshotOptions,
): Promise<Diagnostic[]> {
  if ((snapshot as { version: unknown }).version !== 1) {
    return [
      diagnostic(
        'snapshot-version-unsupported',
        undefined,
        `Version de snapshot ${String((snapshot as { version: unknown }).version)} non supportée.`,
      ),
    ];
  }

  const roots = options.roots ?? [{ path: '', dateRequired: true }];
  const diagnostics: Diagnostic[] = [];
  const push = (code: DiagnosticCode, path: string | undefined, message: string) =>
    diagnostics.push(diagnostic(code, path, message));

  // ── Snapshot ──────────────────────────────────────────────────────────────
  if (!snapshot.complete) {
    push('snapshot-incomplete', undefined, 'Listing incomplet : aucune publication, donc aucune suppression.');
  }
  if (!snapshot.entries.some((entry) => entry.kind === 'content')) {
    push('snapshot-empty', undefined, 'Aucune entrée de contenu : le snapshot est vide.');
  }

  // ── Entrées ───────────────────────────────────────────────────────────────
  const collisions = new Map<string, string>();
  for (const entry of [...snapshot.entries].sort((a, b) => compareCanonical(a.path, b.path))) {
    const normalized = normalizePath(entry.path);
    if (!normalized.valid) {
      push('entry-path-invalid', entry.path, `Chemin invalide : ${normalized.reason}.`);
    } else if (normalized.path !== entry.path) {
      push('entry-path-invalid', entry.path, 'Chemin non normalisé NFC.');
    }
    const key = collisionKey(entry.path);
    const first = collisions.get(key);
    if (first !== undefined) {
      push('entry-path-collision', entry.path, `Collision avec « ${first} » (casse ou normalisation Unicode).`);
    } else {
      collisions.set(key, entry.path);
    }
    if (entry.state === 'placeholder') {
      push('entry-not-materialized', entry.path, 'Fichier non matérialisé (placeholder) : publication impossible.');
    } else if (entry.hashes === undefined || Object.keys(entry.hashes).length === 0) {
      push('entry-hash-missing', entry.path, 'Entrée matérialisée sans empreinte.');
    }
  }

  // ── Structure (racines configurées) ───────────────────────────────────────
  const rootOf = (path: string): ValidationRoot | undefined => {
    let best: ValidationRoot | undefined;
    for (const root of roots) {
      if (isWithin(path, root.path) && (best === undefined || root.path.length > best.path.length)) best = root;
    }
    return best;
  };
  const scoped = snapshot.entries.filter((entry) => rootOf(entry.path) !== undefined);
  const paths = new Set(snapshot.entries.map((entry) => entry.path));
  const folders = indexFolders(scoped);

  const read = async (path: string) => decodeText(await options.read(path));
  const indexPaths = [...folders.values()].flat();
  const parsed = await mapConcurrent(indexPaths, options.concurrency ?? 16, async (path): Promise<ParsedIndex> => {
    const folder = dirname(path);
    const result = parseFrontmatter(await read(path));
    if (result.status === 'missing') {
      push('frontmatter-missing', path, 'Fichier index sans bloc de frontmatter `---` initial.');
      return { path, folder, data: null };
    }
    if (result.status === 'invalid') {
      push('frontmatter-invalid', path, `Frontmatter illisible : ${result.reason}.`);
      return { path, folder, data: null };
    }
    return { path, folder, data: result.data };
  });
  const indexByPath = new Map(parsed.map((index) => [index.path, index]));

  // Nature d'un dossier, lue dans son fichier index de référence.
  const isSection = (folder: string): boolean =>
    indexByPath.get(primaryIndex(folders.get(folder) as string[]))?.data?.type === 'section';

  for (const [folder, indexes] of folders) {
    const root = rootOf(folder) as ValidationRoot;
    if (folder !== root.path && !SLUG.test(basename(folder))) {
      push('slug-invalid', folder, `« ${basename(folder)} » ne suit pas ^[a-z0-9]+(-[a-z0-9]+)*$.`);
    }
    if (!indexes.some((path) => isDefaultIndexFile(basename(path)))) {
      push('index-default-missing', folder, 'Fichier index de langue sans `index.md` par défaut.');
    }
    if (isSection(folder)) {
      if (scoped.some((entry) => entry.path.startsWith(`${joinPath(folder, 'media')}/`))) {
        push('section-has-media', folder, 'Une page de section ne porte pas de `media/`.');
      }
      continue;
    }
    // Imbrication : on compte les dossiers de série ancêtres, sections exclues.
    let seriesAncestors = 0;
    for (let dir = folder; dir !== ''; ) {
      dir = dirname(dir);
      if (folders.has(dir) && !isSection(dir)) seriesAncestors++;
    }
    if (seriesAncestors >= 2) {
      push('nesting-too-deep', folder, 'Série sous une sous-série : l\'imbrication est limitée à un niveau.');
    }
  }

  const nested = new Set<string>();
  const mediaDirs = new Set<string>();
  for (const entry of scoped) {
    const segments = entry.path.split('/');
    for (let i = 0; i < segments.length - 1; i++) {
      if (segments[i] !== 'media') continue;
      mediaDirs.add(segments.slice(0, i + 1).join('/'));
      if (i < segments.length - 2) nested.add(segments.slice(0, i + 2).join('/'));
    }
  }
  for (const dir of nested) {
    if (![...nested].some((other) => other !== dir && isWithin(dir, other))) {
      push('media-nested', dir, '`media/` est plat : pas de sous-dossier.');
    }
  }
  for (const dir of mediaDirs) {
    if (!folders.has(dirname(dir))) {
      push('media-orphan', dir, '`media/` sans fichier index dans son dossier parent.');
    }
  }

  // ── images.json ───────────────────────────────────────────────────────────
  const manifests = new Map<string, unknown[] | null>();
  const manifestPaths = scoped.filter((entry) => basename(entry.path) === 'images.json').map((entry) => entry.path);
  await mapConcurrent(manifestPaths, options.concurrency ?? 16, async (path) => {
    const images = parseManifest(await read(path));
    manifests.set(dirname(path), images);
    if (images === null) {
      push('images-json-invalid', path, 'JSON illisible, ou clé `images` absente ou non tableau : repli sur `media/`.');
    }
  });

  // ── Frontmatter, fichier par fichier ──────────────────────────────────────
  for (const { path, folder, data } of parsed) {
    if (data === null) continue;
    const root = rootOf(path) as ValidationRoot;

    const type = data.type;
    if (type !== undefined && type !== 'series' && type !== 'section') {
      push('type-invalid', path, `\`type\` vaut « ${String(type)} » : attendu \`series\` ou \`section\`.`);
    }
    if (typeof data.title !== 'string' || data.title.trim() === '') {
      push('title-missing', path, '`title` absent ou vide.');
    }
    if (data.date === undefined || data.date === null) {
      if ((root.dateRequired ?? true) && type !== 'section') {
        push('date-missing', path, '`date` requise pour une série (une section se déclare `type: section`).');
      }
    } else if (!isIsoDate(data.date)) {
      push('date-invalid', path, `\`date\` n'est pas une date ISO 8601 : « ${String(data.date)} ».`);
    }

    const embeds = Array.isArray(data.embeds) ? data.embeds : [];
    const embedsWithoutUrl = new Set<number>();
    embeds.forEach((embed, i) => {
      if (isRecord(embed) && (typeof embed.url !== 'string' || embed.url === '')) {
        embedsWithoutUrl.add(i);
        push('embed-url-missing', path, `\`embeds[${i}]\` sans \`url\`.`);
      }
    });

    // Le reste du schéma : ce que le build refuserait. `title`, `date`, `type`
    // et `embeds[].url` manquante ont leurs codes propres, ci-dessus.
    const schema = baseSeriesSchema({ dateRequired: false }).safeParse(data);
    if (!schema.success) {
      const issues = schema.error.issues.filter((issue) => {
        const [head, index, field] = issue.path;
        if (head === 'title' || head === 'date' || head === 'type') return false;
        return !(head === 'embeds' && field === 'url' && embedsWithoutUrl.has(index as number));
      });
      if (issues.length > 0) {
        const detail = issues.map((issue) => `${issue.path.join('.') || '(racine)'} : ${issue.message}`).join(' ; ');
        push('frontmatter-invalid', path, `Champs refusés par le schéma : ${detail}.`);
      }
    }

    const manifest = manifests.get(folder);
    if (data.images !== undefined && data.images !== null && manifests.has(folder)) {
      push('images-conflict', path, '`images:` du frontmatter et `images.json` dans la même série.');
    }

    if (typeof data.cover === 'string' && data.cover !== '' && isRelativeReference(data.cover)) {
      const target = resolveReference(folder, data.cover);
      if (!isImagePath(target ?? data.cover)) {
        push('cover-not-image', path, `\`cover\` « ${data.cover} » ne désigne pas une image.`);
      } else if (
        target === null ||
        (!paths.has(target) && !(Array.isArray(manifest) && manifestReferences(manifest, folder, target)))
      ) {
        push('cover-not-found', path, `\`cover\` « ${data.cover} » introuvable.`);
      }
    }

    if (Array.isArray(data.attachments)) {
      const mediaDir = joinPath(folder, 'media');
      for (const attachment of data.attachments) {
        if (!isRecord(attachment) || typeof attachment.file !== 'string') continue;
        const file = attachment.file;
        const target = file.includes('/') ? resolveReference(folder, file) : joinPath(mediaDir, file.normalize('NFC'));
        if (target === null || dirname(target) !== mediaDir || !paths.has(target)) {
          push('attachment-not-found', path, `Pièce jointe « ${file} » absente de \`media/\`.`);
        }
      }
    }
  }

  return diagnostics.sort(compareDiagnostics);
}
