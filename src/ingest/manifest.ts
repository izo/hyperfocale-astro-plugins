import { basename, compareCanonical, dirname, isImagePath, joinPath } from './paths.js';
import type { ContentSnapshot, SnapshotEntry } from './types.js';

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
