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
 * Métadonnées d'image (mode local via import.meta.glob, ou mode distant via `images[]`).
 */
export interface ImageMetadata {
  src: string;
  width: number;
  height: number;
  format: string;
}

/**
 * Retourne toutes les séries triées par date décroissante (les plus récentes en premier).
 * Les séries `draft: true` sont exclues en production (spec §1.6).
 */
export async function getSeriesList(): Promise<Series[]> {
  const all = await getCollection('series', (entry: Series) => {
    if (import.meta.env.DEV) return true;
    return !entry.data.draft;
  });
  return all.sort((a: Series, b: Series) => {
    const dateA = (a.data.date as Date | undefined)?.getTime() ?? 0;
    const dateB = (b.data.date as Date | undefined)?.getTime() ?? 0;
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
 * Retourne toutes les images d'une série, triées alphabétiquement par nom de fichier.
 *
 * v0.3.0 — Mode distant (spec §1.5) :
 * Si le frontmatter de la série contient un tableau `images`, ces URLs sont retournées
 * directement à la place des fichiers locaux dans `media/`. Les deux modes sont
 * mutuellement exclusifs par série (spec §1.5, règles du mode distant).
 *
 * v0.3.0 — Formats ajoutés : `.tiff` (spec §1.2).
 */
export async function getSeriesImages(slug: string, series?: Series): Promise<ImageMetadata[]> {
  // Mode distant : `images[]` dans le frontmatter a priorité (spec §1.5)
  if (series?.data.images && series.data.images.length > 0) {
    return series.data.images.map((img: { url: string; alt?: string; width?: number; height?: number }) => ({
      src: img.url,
      width: img.width ?? 0,
      height: img.height ?? 0,
      format: img.url.split('.').pop() ?? 'jpg',
    }));
  }

  // Mode local : scan de media/ trié alphabétiquement (spec §1.6)
  const allImages = import.meta.glob<{ default: ImageMetadata }>(
    '/src/content/series/*/media/*.{jpg,jpeg,png,webp,avif,tiff}',
    { eager: true },
  );

  // Le slug peut contenir "/index" si la collection utilise type:'content' legacy.
  // On normalise en extrayant uniquement le nom du dossier.
  const dirSlug = slug.replace(/\/index$/, '');

  return Object.entries(allImages)
    .filter(([path]) => {
      const match = path.match(/\/src\/content\/series\/([^/]+)\/media\//);
      return match !== null && match[1] === dirSlug;
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
  page: number,
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
