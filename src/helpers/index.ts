import { getCollection, getEntry } from 'astro:content';
import type { CollectionEntry } from 'astro:content';

/**
 * Type représentant une entrée de la collection `series`.
 */
export type Series = CollectionEntry<'series'>;

/**
 * Résultat de la pagination d'images.
 */
export interface PaginationResult<T> {
  items: T[];
  totalPages: number;
  currentPage: number;
}

/**
 * Retourne toutes les séries triées par date décroissante (les plus récentes en premier).
 */
export async function getSeriesList(): Promise<Series[]> {
  const all = await getCollection('series');
  return all.sort((a: Series, b: Series) => {
    const dateA = a.data.date.getTime();
    const dateB = b.data.date.getTime();
    return dateB - dateA;
  });
}

/**
 * Retourne une série par son slug.
 * Lève une erreur si la série est introuvable.
 */
export async function getSeriesBySlug(slug: string): Promise<Series> {
  const entry = await getEntry('series', slug);
  if (!entry) {
    throw new Error(`[hyperfocale] Série introuvable pour le slug : "${slug}"`);
  }
  return entry;
}

/**
 * Métadonnées d'image importée dynamiquement.
 */
export interface ImageMetadata {
  src: string;
  width: number;
  height: number;
  format: string;
}

/**
 * Retourne toutes les images d'une série, triées alphabétiquement par nom de fichier.
 */
export async function getSeriesImages(slug: string): Promise<ImageMetadata[]> {
  const allImages = import.meta.glob<{ default: ImageMetadata }>(
    '/src/content/series/*/media/*.{jpg,jpeg,png,webp,avif}',
    { eager: true }
  );

  return Object.entries(allImages)
    .filter(([path]) => {
      const match = path.match(/\/src\/content\/series\/([^/]+)\/media\//);
      return match !== null && match[1] === slug;
    })
    .sort(([pathA], [pathB]) => {
      const fileA = pathA.split('/').pop() ?? '';
      const fileB = pathB.split('/').pop() ?? '';
      return fileA.localeCompare(fileB);
    })
    .map(([, module]) => module.default);
}

/**
 * Découpe un tableau d'éléments en pages et retourne la page demandée.
 *
 * @param items - Tableau complet d'éléments
 * @param pageSize - Nombre d'éléments par page
 * @param page - Numéro de la page demandée (1-indexed)
 */
export function paginateImages<T>(
  items: T[],
  pageSize: number,
  page: number
): PaginationResult<T> {
  if (pageSize < 1) {
    throw new Error(`[hyperfocale] pageSize doit être >= 1. Reçu: ${pageSize}`);
  }
  if (page < 1) {
    throw new Error(`[hyperfocale] page doit être >= 1. Reçu: ${page}`);
  }

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;

  return {
    items: items.slice(start, end),
    totalPages,
    currentPage,
  };
}
