import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';

export type Series = CollectionEntry<'series'>;

export interface PaginationResult<T> {
  items: T[];
  totalPages: number;
  currentPage: number;
}

export interface ImageMetadata {
  src: string;
  width: number;
  height: number;
  format: string;
  alt?: string;
}

// Cache module-level — évite N appels getCollection par build (#MVP-003)
let _seriesCache: Series[] | null = null;

// Glob hoissé — évalué une seule fois par Vite au build, supporte les slugs hiérarchiques (#ARCH-003)
const _imageGlob = import.meta.glob<{ default: ImageMetadata }>(
  '/src/content/series/**/media/*.{jpg,jpeg,png,webp,avif,tiff}',
  { eager: true },
);

async function getAllSeriesCached(): Promise<Series[]> {
  if (_seriesCache !== null) return _seriesCache;
  const result = await getCollection('series');
  _seriesCache = result;
  return result;
}

/** Réinitialise le cache — à appeler dans les teardowns de tests. */
export function resetSeriesCache(): void {
  _seriesCache = null;
}

/**
 * Retourne toutes les séries publiées, triées par date décroissante.
 * Exclut `draft: true` et `published: false` en production (spec §1.6).
 */
export async function getSeriesList(): Promise<Series[]> {
  const all = await getAllSeriesCached();
  return all
    .filter((entry: Series) => {
      if (import.meta.env.DEV) return true;
      const published = (entry.data as Record<string, unknown>).published ?? true;
      return !entry.data.draft && published !== false;
    })
    .sort((a: Series, b: Series) => {
      const dateA = (a.data.date as Date | undefined)?.getTime() ?? 0;
      const dateB = (b.data.date as Date | undefined)?.getTime() ?? 0;
      return dateB - dateA;
    });
}

/**
 * Retourne une série par son slug (plat ou hiérarchique).
 * Lève une erreur si la série est introuvable.
 */
export async function getSeriesBySlug(slug: string): Promise<Series> {
  const all = await getAllSeriesCached();
  const entry = all.find((s) => s.id === slug);
  if (!entry) {
    throw new Error(`[hyperfocale] Série introuvable pour le slug : "${slug}"`);
  }
  return entry;
}

/**
 * Retourne toutes les images d'une série, triées alphabétiquement.
 * Mode distant prioritaire si `series.data.images` est défini (spec §1.5).
 */
export async function getSeriesImages(slug: string, series?: Series): Promise<ImageMetadata[]> {
  const remoteImages = series?.data.images as Array<{ url: string; alt?: string; width?: number; height?: number }> | undefined;
  if (remoteImages && remoteImages.length > 0) {
    return remoteImages.map((img) => ({
      src: img.url,
      width: img.width ?? 0,
      height: img.height ?? 0,
      format: img.url.split('.').pop() ?? 'jpg',
      ...(img.alt !== undefined && { alt: img.alt }),
    }));
  }

  const dirSlug = slug.replace(/\/index$/, '');

  return Object.entries(_imageGlob)
    .filter(([path]) => {
      const match = path.match(/\/src\/content\/series\/(.+)\/media\//);
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

  return {
    items: items.slice(start, start + pageSize),
    totalPages,
    currentPage,
  };
}

export interface QuerySeriesOptions {
  /** Filtre sur le premier segment du slug (collection parente). */
  collection?: string;
  /** Filtre ET-logique sur les tags (toutes les tags doivent être présentes). */
  tags?: string[];
  /**
   * `true` → uniquement les séries featured.
   * `'first'` → toutes les séries, featured remontées en tête.
   */
  featured?: boolean | 'first';
  /** Slugs à exclure explicitement. */
  exclude?: string[];
  /** Filtre sur `published` (défaut `true`). */
  published?: boolean;
  /** Filtre sur `draft` (défaut `false`). */
  draft?: boolean;
  /** Tri : `'date'` (défaut) | `'title'` | `'random'`. */
  sort?: 'date' | 'title' | 'random';
  /** Nombre maximum d'éléments retournés. */
  limit?: number;
  /** Index de départ (0-indexed). */
  offset?: number;
}

export interface QueryResult<T> {
  items: T[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * API de requête flexible sur la collection `series`.
 * Remplace `getSeriesList()` pour les cas nécessitant filtres, tri ou pagination.
 */
export async function querySeries(options: QuerySeriesOptions = {}): Promise<QueryResult<Series>> {
  const {
    collection,
    tags,
    featured,
    exclude,
    published = true,
    draft = false,
    sort = 'date',
    limit,
    offset = 0,
  } = options;

  const d = (s: Series) => s.data as Record<string, unknown>;

  const filtered = (await getAllSeriesCached()).filter((entry) => {
    if ((d(entry).published ?? true) !== published) return false;
    if ((d(entry).draft ?? false) !== draft) return false;
    if (featured === true && !d(entry).featured) return false;
    if (collection !== undefined && getParentCollection(entry.id) !== collection) return false;
    if (tags && tags.length > 0) {
      const entryTags = (d(entry).tags as string[]) ?? [];
      if (!tags.every((t) => entryTags.includes(t))) return false;
    }
    if (exclude && exclude.includes(entry.id)) return false;
    return true;
  });

  filtered.sort((a, b) => {
    if (featured === 'first') {
      const aF = d(a).featured ? 1 : 0;
      const bF = d(b).featured ? 1 : 0;
      if (aF !== bF) return bF - aF;
    }
    if (sort === 'title') return String(a.data.title).localeCompare(String(b.data.title));
    if (sort === 'random') return Math.random() - 0.5;
    const dateA = (a.data.date as Date | undefined)?.getTime() ?? 0;
    const dateB = (b.data.date as Date | undefined)?.getTime() ?? 0;
    return dateB - dateA;
  });

  const totalItems = filtered.length;
  const items = filtered.slice(offset, limit !== undefined ? offset + limit : undefined);
  const totalPages = limit !== undefined ? Math.max(1, Math.ceil(totalItems / limit)) : 1;
  const currentPage = limit !== undefined ? Math.floor(offset / limit) + 1 : 1;

  return {
    items,
    pagination: { currentPage, totalPages, totalItems, hasNext: currentPage < totalPages, hasPrev: currentPage > 1 },
  };
}

/**
 * Retourne la première image d'une série comme cover de fallback (spec §1.6).
 * Retourne `undefined` si aucune image n'est trouvée.
 */
export async function getSeriesCover(slug: string, series?: Series): Promise<ImageMetadata | undefined> {
  const images = await getSeriesImages(slug, series);
  return images[0];
}

/**
 * Extrait le nom de la collection parente depuis un slug hiérarchique.
 * Retourne `null` pour un slug plat (un seul niveau).
 *
 * @example getParentCollection('voyages/asie/tokyo-2024') → 'voyages'
 * @example getParentCollection('bretagne-2024') → null
 */
export function getParentCollection(id: string): string | null {
  const slash = id.indexOf('/');
  return slash !== -1 ? id.slice(0, slash) : null;
}

/**
 * Retourne tous les tags distincts de la collection, triés par fréquence décroissante.
 * No-op si `tags` n'est pas dans le schéma du site consommateur (#DATA-005).
 */
export async function getAllTags(): Promise<{ name: string; count: number }[]> {
  const all = await getAllSeriesCached();
  const counts = new Map<string, number>();
  for (const entry of all) {
    const tags = ((entry.data as Record<string, unknown>).tags as string[] | undefined) ?? [];
    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Retourne toutes les collections parentes (premier segment du slug),
 * triées par nombre de séries décroissant (#DATA-005).
 */
export async function getAllCollections(): Promise<{ slug: string; name: string; count: number }[]> {
  const all = await getAllSeriesCached();
  const counts = new Map<string, number>();
  for (const entry of all) {
    const parent = getParentCollection(entry.id);
    if (parent !== null) counts.set(parent, (counts.get(parent) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([slug, count]) => ({ slug, name: slug, count }))
    .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
}

/**
 * Version JSON-sérialisable de `Series` pour les Astro Islands (React, Vue, Svelte…).
 * Les `Date` sont converties en chaînes ISO ; la méthode `render` est omise (#MVP-005).
 */
export type SerializedSeries = {
  id: string;
  collection: string;
  body?: string;
  data: Record<string, unknown> & { date?: string };
};

export function serializeSeries(series: Series): SerializedSeries {
  const { date, ...restData } = series.data as Record<string, unknown>;
  return {
    id: series.id,
    collection: series.collection,
    ...(series.body !== undefined ? { body: series.body } : {}),
    data: {
      ...restData,
      ...(date instanceof Date ? { date: date.toISOString() } : {}),
    },
  };
}
