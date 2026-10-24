// Séparé de manifest.ts : lire le frontmatter tire js-yaml, et manifest.ts est
// importé par le sous-chemin /media, qui doit rester sans dépendance externe.
import { parseFrontmatter } from './frontmatter.js';
import { buildImagesManifest } from './manifest.js';
import type { BuildImagesManifestOptions, ImagesManifest } from './manifest.js';
import { basename, compareCanonical, dirname, isIndexFile } from './paths.js';
import { primaryIndex } from './series.js';
import type { ContentSnapshot, ReadFn } from './types.js';

/**
 * Le frontmatter porte-t-il `images:` (§1.5) ? Une clé de valeur `null` vaut
 * absente (§4.10, règle 6) ; un tableau vide la porte — c'est le critère
 * d'`images-conflict`.
 */
export function declaresImages(frontmatter: Readonly<Record<string, unknown>>): boolean {
  return frontmatter.images !== undefined && frontmatter.images !== null;
}

/** Options de `buildSeriesImagesManifest`. */
export interface BuildSeriesImagesManifestOptions extends BuildImagesManifestOptions {
  /** Lit le fichier index de la série (chemin relatif à la racine du snapshot). */
  readonly read: ReadFn;
}

/**
 * `images.json` dérivé d'une série, **ou `null` quand il ne faut pas en écrire**
 * (§1.5.1, v2.12) : un outil d'ingestion NE DOIT PAS produire de manifeste pour
 * une série dont l'`index.md` porte `images:` — il violerait lui-même la règle
 * d'exclusivité (`images-conflict`, §4.10). C'est là que vit l'ordre éditorial
 * d'une source distante.
 *
 * Lit le fichier index de référence du dossier (`index.md`, sinon `index.mdx`,
 * sinon le premier `index.<lang>.md`). `null` aussi quand le dossier ne porte
 * aucun fichier index, ou que son frontmatter est absent ou illisible : on ne
 * sait pas alors s'il porte `images:`, et la validation bloque de toute façon
 * la publication (`frontmatter-missing`, `frontmatter-invalid`).
 *
 * Sinon, le manifeste de `buildImagesManifest` — que l'appelant n'écrit pas
 * non plus s'il est vide, s'il le souhaite.
 */
export async function buildSeriesImagesManifest(
  snapshot: ContentSnapshot,
  seriesDir: string,
  options: BuildSeriesImagesManifestOptions,
): Promise<ImagesManifest | null> {
  const indexPaths = snapshot.entries
    .filter((entry) => entry.kind === 'content' && dirname(entry.path) === seriesDir && isIndexFile(basename(entry.path)))
    .map((entry) => entry.path)
    .sort(compareCanonical);
  if (indexPaths.length === 0) return null;
  const parsed = parseFrontmatter(await options.read(primaryIndex(indexPaths)));
  if (parsed.status !== 'ok' || declaresImages(parsed.data)) return null;
  return buildImagesManifest(snapshot, seriesDir, options);
}
