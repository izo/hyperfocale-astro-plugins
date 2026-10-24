import { basename, compareCanonical, dirname, isImagePath, isRelativeReference, joinPath, resolveReference } from './paths.js';
import type { ContentSnapshot, SnapshotEntry } from './types.js';

/**
 * Contenu d'un `images.json` lisible (§1.5.1), entrées telles qu'écrites : une
 * entrée d'`images` est une chaîne (forme courte) ou un objet `{ url, … }`
 * (forme longue) ; `files` reprend les entrées de §1.9, mode distant.
 */
export interface ImagesManifestDocument {
  readonly images: readonly unknown[];
  readonly files?: readonly unknown[];
}

/** Motif pour lequel un `images.json` est inutilisable (§1.5.1, « Robustesse »). */
export type ManifestProblem = 'json' | 'not-object' | 'images';

/** Résultat de `readImagesManifest`. */
export type ManifestReadResult =
  | { readonly ok: true; readonly manifest: ImagesManifestDocument }
  | { readonly ok: false; readonly problem: ManifestProblem };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Lit un `images.json` (§1.5.1) sans jamais lever : JSON illisible, racine qui
 * n'est pas un objet, clé `images` absente ou non tableau rendent `ok: false` —
 * l'appelant se rabat alors sur `media/`. Une clé `files` qui n'est pas un
 * tableau est ignorée, sans invalider le manifeste.
 *
 * `input` est le texte du fichier, ou sa valeur déjà parsée : une chaîne est
 * toujours lue comme du texte JSON (une racine chaîne serait de toute façon
 * invalide).
 */
export function readImagesManifest(input: unknown): ManifestReadResult {
  let parsed: unknown = input;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch {
      return { ok: false, problem: 'json' };
    }
  }
  if (!isRecord(parsed)) return { ok: false, problem: 'not-object' };
  if (!Array.isArray(parsed.images)) return { ok: false, problem: 'images' };
  return {
    ok: true,
    manifest: { images: parsed.images, ...(Array.isArray(parsed.files) ? { files: parsed.files } : {}) },
  };
}

/** URL d'une entrée d'`images` — forme courte ou longue —, `null` si elle n'en a pas. */
export function manifestEntryUrl(entry: unknown): string | null {
  if (typeof entry === 'string') return entry === '' ? null : entry;
  if (isRecord(entry) && typeof entry.url === 'string' && entry.url !== '') return entry.url;
  return null;
}

/**
 * L'entrée désigne-t-elle `target`, chemin relatif à la racine du corpus
 * (§4.10, règle 9) ? Une entrée relative si elle s'y résout depuis `folder` ;
 * une entrée absolue (chemin au site ou URL) si elle se termine par `/<target>`.
 */
export function manifestEntryReferences(entry: unknown, folder: string, target: string): boolean {
  const ref = manifestEntryUrl(entry);
  if (ref === null) return false;
  return isRelativeReference(ref) ? resolveReference(folder, ref) === target : ref.endsWith(`/${target}`);
}

/** Options de `buildImagesManifest`. */
export interface BuildImagesManifestOptions {
  /**
   * URL publiée d'une image. Défaut : chemin relatif à `index.md`
   * (`./media/01.jpg`), forme que tout adaptateur v2.6 résout (§1.5.1).
   */
  readonly urlFor?: (entry: SnapshotEntry) => string;
}

/** `images.json`, forme courte (§1.5.1). */
export interface ImagesManifest {
  readonly images: string[];
}

/**
 * Construit l'`images.json` d'une série depuis un snapshot (§1.5.1, forme
 * courte) : les images du `media/` de la série — images seulement, pas les
 * documents joints (§1.9) — dans l'ordre alphabétique de leur nom.
 *
 * L'ordre alphabétique est l'ordre canonique du contrat (octets UTF-8, §4.1),
 * pas une collation locale : deux implémentations produisent le même fichier.
 *
 * Ne lit pas le frontmatter : pour décider s'il faut écrire le manifeste — pas
 * pour une série qui porte `images:` (§1.5.1, v2.12) —, passer par
 * `buildSeriesImagesManifest`.
 */
export function buildImagesManifest(
  snapshot: ContentSnapshot,
  seriesDir: string,
  options: BuildImagesManifestOptions = {},
): ImagesManifest {
  const mediaDir = joinPath(seriesDir, 'media');
  const urlFor = options.urlFor ?? ((entry: SnapshotEntry) => `./media/${basename(entry.path)}`);
  const images = snapshot.entries
    .filter((entry) => entry.kind === 'media' && dirname(entry.path) === mediaDir && isImagePath(entry.path))
    .sort((a, b) => compareCanonical(basename(a.path), basename(b.path)))
    .map(urlFor);
  return { images };
}
