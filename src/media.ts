/**
 * `@regrets/hyperfocale/media` — résolution des médias d'une série, en
 * fonction pure.
 *
 * Les helpers de `/helpers` lisent `media/` et `images.json` par
 * `import.meta.glob` : ils ne voient qu'un corpus rangé sous `src/content/`, et
 * ne s'exécutent que dans le runtime Astro. Ce module prend les mêmes décisions
 * (§1.5, §1.5.1, §1.6, §1.8, §1.9, §1.11) sur des données qu'on lui passe — le
 * frontmatter, le texte d'`images.json`, la liste des fichiers de `media/` —
 * et ne lit rien lui-même. Un site dont le corpus vit ailleurs (un dossier
 * public, un bucket) les obtient comme il veut et appelle `resolveSeriesMedia`.
 *
 * Aucun module `node:*`, ni `astro`, ni `zod` : il s'importe dans un script
 * Node comme dans un Worker.
 */

import type { Attachment, AttachmentKind } from './schema.js';
import type { DiagnosticCode, Severity } from './ingest/types.js';
import {
  basename,
  compareCanonical,
  dirname,
  extensionOf,
  IMAGE_EXTENSIONS,
  isExcluded,
  isImagePath,
  isOriginalPath,
  isRelativeReference,
  ORIGINAL_EXTENSIONS,
  resolveReference,
} from './ingest/paths.js';
import { manifestEntryReferences, readImagesManifest } from './ingest/manifest.js';
import type { ManifestProblem } from './ingest/manifest.js';

export type { Attachment, AttachmentKind } from './schema.js';
export { IMAGE_EXTENSIONS, isImagePath, ORIGINAL_EXTENSIONS };

// ── Primitives ──────────────────────────────────────────────────────────────

/** Classes de documents joints par extension (spec §1.9). */
const ATTACHMENT_KIND_BY_EXTENSION: Readonly<Record<string, AttachmentKind>> = {
  mp4: 'video', webm: 'video', mov: 'video', m4v: 'video',
  mp3: 'audio', m4a: 'audio', ogg: 'audio', wav: 'audio', flac: 'audio',
  pdf: 'document', epub: 'document', txt: 'document', md: 'document',
};

/** Retire la query string et le fragment d'une URL. */
function stripQuery(url: string): string {
  return url.split(/[?#]/)[0] ?? url;
}

/**
 * Le fichier est-il un original (spec §1.9, v2.11) — RAW ou sidecar ?
 * L'extension seule décide, en minuscules : `DSCF0001.RAF` en est un,
 * `DSCF0001.raf.jpg` est une image. La query string d'une URL est ignorée.
 */
export function isOriginal(filename: string): boolean {
  return isOriginalPath(stripQuery(filename));
}

/**
 * Classe un fichier de `media/` selon la spec §1.9.
 * Retourne `null` pour une image (qui alimente la galerie, pas les pièces jointes),
 * pour un original (RAW, sidecar — ignoré, ni galerie ni pièce jointe, v2.11)
 * et pour les fichiers de métadonnées — `index.md`, ainsi que `images.json`, qui
 * « n'est jamais un média ni un document joint » (§1.5.1).
 * Toute extension inconnue tombe dans la classe `file` — ne lève jamais d'erreur.
 */
export function classifyAttachment(filename: string): AttachmentKind | null {
  const lower = basename(filename).toLowerCase();
  if (lower === 'index.md' || lower === 'images.json') return null;
  const ext = extensionOf(filename);
  if (ext === null) return 'file';
  if (isImagePath(filename) || isOriginalPath(filename)) return null;
  return ATTACHMENT_KIND_BY_EXTENSION[ext] ?? 'file';
}

/** Entrée d'images d'un manifeste — forme courte (chaîne) ou longue (objet). */
export type ManifestImage = string | { url?: string; alt?: string; width?: number; height?: number };

/** Contenu utile d'un `images.json` (spec §1.5.1). */
export interface ImageManifest {
  images: ManifestImage[];
  files?: Array<{ url: string; title?: string; kind?: AttachmentKind; size?: number }>;
}

const MANIFEST_PROBLEMS: Readonly<Record<ManifestProblem, string>> = {
  json: "n'est pas un JSON valide",
  'not-object': 'ne contient pas un objet',
  images: ': la clé "images" est absente ou n\'est pas un tableau',
};

/**
 * Parse un `images.json` (spec §1.5.1). Retourne `null` sur toute anomalie —
 * JSON illisible, racine non objet, clé `images` absente ou non-tableau — après
 * un avertissement : l'appelant se rabat alors sur `media/`. Ne lève jamais.
 *
 * `resolveSeriesMedia` fait la même lecture sans rien écrire en console : il
 * rend l'anomalie en diagnostic `images-json-invalid`.
 */
export function parseImageManifest(raw: string, source = 'images.json'): ImageManifest | null {
  const result = readImagesManifest(raw);
  if (!result.ok) {
    console.warn(`[hyperfocale] ${source} ${MANIFEST_PROBLEMS[result.problem]} — repli sur media/.`);
    return null;
  }
  return result.manifest as unknown as ImageManifest;
}

/**
 * Noms de fichiers de `media/` servant de vignette à un embed (§1.11).
 *
 * Ne retient que les posters en chemin relatif : une URL absolue ne désigne
 * aucun fichier local, elle n'a donc rien à exclure du scan. Le dossier n'entre
 * pas dans le calcul — les posters d'une série ne peuvent désigner que son
 * propre `media/`, §1.6 interdisant la récursion.
 */
export function posterFilenames(embeds: unknown): Set<string> {
  const names = new Set<string>();
  if (!Array.isArray(embeds)) return names;
  for (const embed of embeds) {
    const poster = isRecord(embed) ? embed.poster : undefined;
    if (typeof poster !== 'string' || poster === '' || !isRelativeReference(poster)) continue;
    const filename = basename(poster.replace(/^\.\//, '')).trim();
    if (filename !== '') names.add(filename.normalize('NFC'));
  }
  return names;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ── Résolveur ───────────────────────────────────────────────────────────────

/**
 * Un fichier de `media/` : son nom (relatif à `media/`), ou un objet qui porte
 * aussi sa taille en octets — reprise dans `Attachment.size`.
 */
export type MediaFile = string | { readonly name: string; readonly size?: number };

/** Entrée de `resolveSeriesMedia`. */
export interface ResolveSeriesMediaInput {
  /** Frontmatter de la série, brut ou validé — seules `images`, `files`, `cover`, `attachments` et `embeds` sont lues. */
  readonly frontmatter: Readonly<Record<string, unknown>>;
  /**
   * `images.json` posé à côté du fichier index : son texte, ou sa valeur déjà
   * parsée. `null` ou absent : la série n'en a pas.
   */
  readonly manifest?: unknown;
  /**
   * Fichiers de `media/`, noms relatifs à ce dossier, dans n'importe quel
   * ordre. `null` ou absent : `media/` est inconnu (médias distants, bucket non
   * listé) — rien n'est alors scanné, et les références vers `media/` ne sont
   * pas vérifiées.
   */
  readonly mediaFiles?: readonly MediaFile[] | null;
  /**
   * URL publiée d'un fichier local, à partir de son chemin relatif au dossier
   * de la série (`media/01.jpg`, `the-wombats/media/01.jpg`), normalisé NFC,
   * non encodé. Défaut : `./<chemin>`, la forme relative de §3.2.
   */
  readonly url?: (path: string) => string;
}

/** Image résolue (spec §3.2, `Image`). */
export interface ResolvedImage {
  /** URL publiée — absolue, absolue au site, ou rendue par l'option `url`. */
  readonly src: string;
  /** Chemin relatif au dossier de la série, quand l'image est un fichier local. */
  readonly path?: string;
  readonly alt?: string;
  readonly width?: number;
  readonly height?: number;
  /** `srcset` déjà formé, typiquement par un `ImageProvider`. */
  readonly srcset?: string;
  /** `sizes` accompagnant `srcset`. */
  readonly sizes?: string;
}

/** Taille d'affichage visée, en CSS px, transmise à un `ImageProvider`. */
export interface ImageRequest {
  readonly width: number;
  readonly height?: number;
}

/**
 * Fournisseur d'image, passé par instance à un composant (`imageProvider`) :
 * reçoit une image résolue et la taille visée, rend l'image à servir. Il sert à
 * brancher un redimensionnement à la volée (Cloudflare Image Resizing, un
 * service d'images, un CDN) sans que le plugin connaisse l'hébergeur.
 */
export type ImageProvider = (image: ResolvedImage, request: ImageRequest) => ResolvedImage;

/**
 * Vrai pour une image résolue par l'appelant (`ResolvedImage`), faux pour un
 * `ImageMetadata` d'Astro : celui-ci porte toujours `format`, et le rendre passe
 * par `astro:assets`, pas par le fournisseur.
 */
export function isResolvedImage(image: unknown): image is ResolvedImage {
  return (
    typeof image === 'object' &&
    image !== null &&
    typeof (image as { src?: unknown }).src === 'string' &&
    !('format' in image)
  );
}

/** Applique le fournisseur à une image résolue ; sans fournisseur, l'image passe telle quelle. */
export function applyImageProvider(
  image: ResolvedImage,
  request: ImageRequest,
  provider?: ImageProvider,
): ResolvedImage {
  return provider ? provider(image, request) : image;
}

/** Codes de diagnostic de §4.10 que le résolveur peut produire. */
export type MediaDiagnosticCode = Extract<
  DiagnosticCode,
  'images-conflict' | 'images-json-invalid' | 'media-nested' | 'cover-not-found' | 'cover-not-image' | 'attachment-not-found'
>;

/** Anomalie relevée en résolvant — mêmes codes et sévérités qu'en §4.10. */
export interface MediaDiagnostic {
  readonly code: MediaDiagnosticCode;
  readonly severity: Severity;
  readonly message: string;
}

/** D'où viennent les images de la galerie (§1.5.1, « Priorité »). */
export type ImageSource = 'frontmatter' | 'manifest' | 'media' | 'none';

/** Résultat de `resolveSeriesMedia`. */
export interface ResolvedSeriesMedia {
  readonly source: ImageSource;
  /** Images de la galerie, dans l'ordre d'affichage. */
  readonly images: ResolvedImage[];
  /** Couverture (§1.6) ; absente quand la série n'a aucune image. */
  readonly cover?: ResolvedImage;
  /** Documents joints (§1.9) : ni images ni originaux. */
  readonly attachments: Attachment[];
  readonly diagnostics: MediaDiagnostic[];
}

const SEVERITY: Readonly<Record<MediaDiagnosticCode, Severity>> = {
  'images-conflict': 'error',
  'media-nested': 'error',
  'cover-not-image': 'error',
  'images-json-invalid': 'warning',
  'cover-not-found': 'warning',
  'attachment-not-found': 'warning',
};

/** Une clé de valeur `null` vaut absente (§4.10, règle 6). */
function field(data: Readonly<Record<string, unknown>>, key: string): unknown {
  return data[key] === null ? undefined : data[key];
}

function isAbsoluteUrl(ref: string): boolean {
  return !isRelativeReference(ref);
}

function dimensions(entry: Record<string, unknown>): Pick<ResolvedImage, 'alt' | 'width' | 'height'> {
  return {
    ...(typeof entry.alt === 'string' ? { alt: entry.alt } : {}),
    ...(typeof entry.width === 'number' ? { width: entry.width } : {}),
    ...(typeof entry.height === 'number' ? { height: entry.height } : {}),
  };
}

/**
 * Résout les médias d'une série — galerie, couverture, documents joints —
 * selon la spec, sans rien lire : tout vient de `input`.
 *
 * **Galerie** (§1.5, §1.5.1, §1.6) — priorité `images:` du frontmatter >
 * `images.json` > scan de `media/` :
 * - `images:` et le manifeste gardent l'ordre de leur tableau ; une entrée est
 *   une chaîne ou un objet `{ url, alt?, width?, height? }` (formes courte et
 *   longue), l'URL étant absolue, absolue au site, ou relative au fichier index.
 *   Le frontmatter accepte aussi les deux extensions du plugin, `{ file }` (nom
 *   dans `media/`) et `{ src }` (image déjà traitée par Astro) ;
 * - le scan ne retient que les images de `media/` même — aucune récursion
 *   (§1.8 : les sous-séries ont leur propre `media/`) —, triées dans l'ordre
 *   canonique (octets UTF-8, celui de `buildImagesManifest`), moins les
 *   vignettes d'embeds (§1.11) ;
 * - un original (§1.9) n'y entre jamais, ni un fichier exclu (§4.2).
 *
 * **Couverture** (§1.6, §1.5.1) — `cover` du frontmatter ; sinon la première
 * image de la galerie, donc la première entrée du manifeste quand il y en a
 * un. Un `cover` qui ne désigne pas une image (`cover-not-image`) ou qu'on sait
 * absent (`cover-not-found`) retombe sur ce défaut. Un `cover` qui traverse
 * une sous-série (§1.8, `./the-wombats/media/01.jpg`) est rendu sans
 * vérification : le résolveur ne voit que le `media/` de la série.
 *
 * **Documents joints** (§1.9) — `files:` du frontmatter > clé `files` du
 * manifeste > fichiers de `media/` qui ne sont ni images ni originaux, triés,
 * enrichis par le bloc `attachments:`.
 *
 * Ne lève jamais : une anomalie devient un diagnostic (codes et sévérités de
 * §4.10), et la résolution continue avec le repli que la spec prévoit.
 */
export function resolveSeriesMedia(input: ResolveSeriesMediaInput): ResolvedSeriesMedia {
  const fm = input.frontmatter;
  const url = input.url ?? ((path: string) => `./${path}`);
  const diagnostics: MediaDiagnostic[] = [];
  const report = (code: MediaDiagnosticCode, message: string) => {
    if (!diagnostics.some((d) => d.code === code && d.message === message)) {
      diagnostics.push({ code, severity: SEVERITY[code], message });
    }
  };

  // ── media/ ────────────────────────────────────────────────────────────────
  const listing = input.mediaFiles == null ? null : new Map<string, number | undefined>();
  if (listing !== null) {
    for (const file of input.mediaFiles as readonly MediaFile[]) {
      const raw = typeof file === 'string' ? file : file.name;
      const name = raw.normalize('NFC').replace(/^\.\//, '');
      if (name === '' || isExcluded(name)) continue;
      if (name.includes('/')) {
        report('media-nested', `« media/${name} » : \`media/\` est plat, pas de sous-dossier (§1.2) — ignoré.`);
        continue;
      }
      listing.set(name, typeof file === 'string' ? undefined : file.size);
    }
  }
  const inMedia = (target: string) => dirname(target) === 'media' && listing?.has(basename(target)) === true;

  // ── images.json ───────────────────────────────────────────────────────────
  const manifestPresent = input.manifest !== undefined && input.manifest !== null;
  let manifest: { images: readonly unknown[]; files?: readonly unknown[] } | null = null;
  if (manifestPresent) {
    const result = readImagesManifest(input.manifest);
    if (result.ok) manifest = result.manifest;
    else report('images-json-invalid', `images.json ${MANIFEST_PROBLEMS[result.problem]} — repli sur media/.`);
  }

  // ── Galerie ───────────────────────────────────────────────────────────────
  const frontImages = field(fm, 'images');
  if (frontImages !== undefined && manifestPresent) {
    report('images-conflict', '`images:` du frontmatter et `images.json` dans la même série : le frontmatter l\'emporte (§1.5.1).');
  }

  /** Résout une URL de §1.5.1 ; `null` pour un original, un non-image local ou une référence hors corpus. */
  const fromRef = (ref: string): ResolvedImage | null => {
    if (isOriginal(ref)) return null;
    if (isAbsoluteUrl(ref)) return { src: ref };
    const target = resolveReference('', ref);
    if (target === null || target === '' || !isImagePath(target)) return null;
    return { src: url(target), path: target };
  };

  // Entrées brutes gardées en regard des images, pour retrouver la couverture.
  const gallery: Array<{ image: ResolvedImage; raw: unknown }> = [];
  let source: ImageSource = 'none';

  if (Array.isArray(frontImages) && frontImages.length > 0) {
    source = 'frontmatter';
    for (const entry of frontImages) {
      let image: ResolvedImage | null = null;
      if (typeof entry === 'string') {
        image = fromRef(entry);
      } else if (isRecord(entry)) {
        if (typeof entry.url === 'string' && entry.url !== '') {
          const base = fromRef(entry.url);
          image = base && { ...base, ...dimensions(entry) };
        } else if (typeof entry.file === 'string' && entry.file !== '') {
          const name = basename(entry.file.replace(/^\.\//, '')).normalize('NFC');
          const target = `media/${name}`;
          if (isImagePath(name) && (listing === null || listing.has(name))) {
            image = { src: url(target), path: target, ...dimensions(entry) };
          }
        } else if (isRecord(entry.src) && typeof entry.src.src === 'string') {
          image = { src: entry.src.src, ...dimensions(entry.src), ...dimensions(entry) };
        }
      }
      if (image !== null) gallery.push({ image, raw: entry });
    }
  } else if (manifest !== null) {
    source = 'manifest';
    for (const entry of manifest.images) {
      const ref = typeof entry === 'string' ? entry : isRecord(entry) && typeof entry.url === 'string' ? entry.url : '';
      const base = ref === '' ? null : fromRef(ref);
      if (base !== null) gallery.push({ image: isRecord(entry) ? { ...base, ...dimensions(entry) } : base, raw: entry });
    }
  } else if (listing !== null) {
    source = 'media';
    const posters = posterFilenames(field(fm, 'embeds'));
    const names = [...listing.keys()].filter((name) => isImagePath(name) && !posters.has(name)).sort(compareCanonical);
    for (const name of names) {
      const target = `media/${name}`;
      gallery.push({ image: { src: url(target), path: target }, raw: `./${target}` });
    }
  }
  const images = gallery.map((g) => g.image);

  // ── Couverture ────────────────────────────────────────────────────────────
  let cover: ResolvedImage | undefined = images[0];
  const coverField = field(fm, 'cover');
  if (typeof coverField === 'string' && coverField !== '') {
    if (isAbsoluteUrl(coverField)) {
      cover = images.find((image) => image.src === coverField) ?? { src: coverField };
    } else {
      const target = resolveReference('', coverField);
      const notImage = !isImagePath(coverField);
      if (notImage) report('cover-not-image', `\`cover\` « ${coverField} » ne désigne pas une image (§1.9).`);
      const matched =
        target === null
          ? undefined
          : gallery.find(({ image, raw }) => image.path === target || manifestEntryReferences(raw, '', target));
      // Vérifiable : la cible est dans `media/` et l'on connaît `media/` ou la liste d'images.
      const checkable = target !== null && dirname(target) === 'media' && (listing !== null || source !== 'none');
      const missing = target === null || (matched === undefined && !inMedia(target) && checkable);
      if (missing) report('cover-not-found', `\`cover\` « ${coverField} » introuvable.`);
      if (!notImage && !missing && target !== null) {
        cover = matched?.image ?? { src: url(target), path: target };
      }
    }
  } else if (isRecord(coverField) && typeof coverField.src === 'string') {
    // `cover` déjà traité par `image()` d'Astro.
    cover = { src: coverField.src, ...dimensions(coverField) };
  }

  // ── Documents joints ──────────────────────────────────────────────────────
  const remote = (entries: readonly unknown[]): Attachment[] =>
    entries.flatMap((entry): Attachment[] => {
      if (!isRecord(entry) || typeof entry.url !== 'string' || entry.url === '' || isOriginal(entry.url)) return [];
      const target = isRelativeReference(entry.url) ? resolveReference('', entry.url) : null;
      if (isRelativeReference(entry.url) && target === null) return [];
      const clean = stripQuery(entry.url);
      return [{
        src: target === null ? entry.url : url(target),
        kind: typeof entry.kind === 'string' ? (entry.kind as AttachmentKind) : (classifyAttachment(clean) ?? 'file'),
        title: typeof entry.title === 'string' ? entry.title : basename(clean),
        ...(typeof entry.size === 'number' ? { size: entry.size } : {}),
      }];
    });

  // Le bloc `attachments:` est vérifié quel que soit le mode (§4.10, règle 12).
  const meta = new Map<string, { title?: string; description?: string }>();
  const attachmentsField = field(fm, 'attachments');
  if (Array.isArray(attachmentsField)) {
    attachmentsField.forEach((entry, i) => {
      const file = isRecord(entry) ? entry.file : undefined;
      const target = typeof file === 'string' && isRelativeReference(file) ? resolveReference('', file) : null;
      if (target === null || dirname(target) !== 'media') {
        report('attachment-not-found', `\`attachments[${i}]\` (« ${String(file)} ») ne désigne pas un fichier de \`media/\`.`);
        return;
      }
      if (isOriginalPath(target)) {
        report('attachment-not-found', `\`attachments[${i}]\` (« ${file} ») : un original n'est pas un document joint.`);
        return;
      }
      if (listing !== null && !listing.has(basename(target))) {
        report('attachment-not-found', `\`attachments[${i}]\` (« ${file} ») absent de \`media/\`.`);
        return;
      }
      const record = entry as Record<string, unknown>;
      meta.set(basename(target), {
        ...(typeof record.title === 'string' ? { title: record.title } : {}),
        ...(typeof record.description === 'string' ? { description: record.description } : {}),
      });
    });
  }

  let attachments: Attachment[] = [];
  const frontFiles = field(fm, 'files');
  if (Array.isArray(frontFiles) && frontFiles.length > 0) {
    attachments = remote(frontFiles);
  } else if (manifest?.files !== undefined && manifest.files.length > 0) {
    attachments = remote(manifest.files);
  } else if (listing !== null) {
    attachments = [...listing.keys()]
      .filter((name) => classifyAttachment(name) !== null)
      .sort(compareCanonical)
      .map((name) => {
        const info = meta.get(name);
        const size = listing.get(name);
        return {
          src: url(`media/${name}`),
          kind: classifyAttachment(name) as AttachmentKind,
          title: info?.title ?? name,
          ...(info?.description !== undefined ? { description: info.description } : {}),
          ...(size !== undefined ? { size } : {}),
        };
      });
  }

  return { source, images, ...(cover !== undefined ? { cover } : {}), attachments, diagnostics };
}
