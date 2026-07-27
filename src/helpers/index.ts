import { getCollection } from 'astro:content';
import type { CollectionEntry, CollectionKey } from 'astro:content';
import type { Attachment, AttachmentKind } from '../schema.js';

/**
 * Nom de la collection lue par les helpers.
 *
 * Injecté par l'intégration via `define` Vite (même mécanisme que
 * `HYPERFOCALE_PREFIX` côté composants et routes). Absent — tests unitaires,
 * ou import des helpers sans l'intégration — on retombe sur `series`, le
 * défaut historique : aucun site existant ne change de comportement.
 */
const COLLECTION_NAME: string =
  (import.meta.env.HYPERFOCALE_COLLECTION_NAME as string | undefined) ?? 'series';

/**
 * Une entrée de la collection, quel que soit son nom.
 *
 * `CollectionEntry<'series'>` ne compilait que sur un site possédant une
 * collection littéralement nommée `series` : chez un consommateur qui suit
 * le preset `portfolio` (collection `projects`), le type était une erreur.
 */
export type Series = CollectionEntry<CollectionKey>;
export type { Attachment, AttachmentKind } from '../schema.js';

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
//
// Le motif ne PEUT PAS porter le nom de collection : `import.meta.glob` est
// analysé statiquement par Vite et n'accepte qu'un littéral. On globe donc
// tout `src/content/`, et `matchMedia()` filtre par collection à l'exécution.
const _imageGlob = import.meta.glob<{ default: ImageMetadata }>(
  '/src/content/**/media/*.{jpg,jpeg,png,webp,avif,tiff}',
  { eager: true },
);

// Glob des documents joints — tout media/ sauf les extensions image (spec §1.9, #MVP-006).
// `query: '?url'` fait servir les fichiers comme assets statiques et retourne leur URL.
const _attachmentGlob = import.meta.glob<string>(
  [
    '/src/content/**/media/*',
    '!/src/content/**/media/*.{jpg,jpeg,png,webp,avif,tiff}',
  ],
  { eager: true, query: '?url', import: 'default' },
);

/** `/src/content/<collection>/<dirSlug>/media/<filename>` */
const MEDIA_PATH = /^\/src\/content\/([^/]+)\/(.+)\/media\/([^/]+)$/;

/**
 * Décompose un chemin de `media/`, et écarte les collections voisines.
 * Retourne `null` si le chemin n'appartient pas à la collection visée.
 *
 * @internal Exporté pour les tests — le glob étant statique, c'est ici que
 * se joue l'appartenance à la collection.
 */
export function matchMedia(
  path: string,
  collection: string = COLLECTION_NAME,
): { dirSlug: string; filename: string } | null {
  const m = MEDIA_PATH.exec(path);
  if (m === null || m[1] !== collection) return null;
  return { dirSlug: m[2] as string, filename: m[3] as string };
}

async function getAllSeriesCached(): Promise<Series[]> {
  if (_seriesCache !== null) return _seriesCache;
  const result = await getCollection(COLLECTION_NAME as CollectionKey);
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
 * Retourne toutes les images d'une série.
 *
 * Si `series.data.images` est défini, il pilote l'ordre et l'alt (spec §1.5).
 * Trois formes d'entrée sont acceptées, dans l'ordre de priorité :
 *   1. `{ src: <asset image()>, alt? }` — asset local traité par `astro:assets`
 *      (ordre curé + alt + optimisation WebP/srcset).
 *   2. `{ file: '01.jpg', alt? }` — fichier de `media/` référencé par nom.
 *   3. `{ url, alt?, width?, height? }` — image distante.
 *
 * Sinon, fallback : glob de `media/` trié alphabétiquement (sans alt).
 */
export async function getSeriesImages(slug: string, series?: Series): Promise<ImageMetadata[]> {
  const imageList = series?.data.images as
    | Array<{ src?: ImageMetadata; file?: string; url?: string; alt?: string; width?: number; height?: number }>
    | undefined;

  const dirSlug = slug.replace(/\/index$/, '');

  if (imageList && imageList.length > 0) {
    return imageList
      .map((img): ImageMetadata | null => {
        // 1) Asset local traité par astro:assets (`src: image()`)
        if (img.src && typeof img.src === 'object') {
          return { ...img.src, ...(img.alt !== undefined ? { alt: img.alt } : {}) };
        }
        // 2) Fichier local de media/ référencé par nom (`file: '01.jpg'`)
        if (typeof img.file === 'string') {
          const fileName = img.file;
          const found = Object.entries(_imageGlob).find(([path]) => {
            const m = matchMedia(path);
            return m !== null && m.dirSlug === dirSlug && m.filename === fileName;
          });
          if (!found) return null;
          return { ...found[1].default, ...(img.alt !== undefined ? { alt: img.alt } : {}) };
        }
        // 3) Image distante (`url`)
        if (typeof img.url === 'string') {
          return {
            src: img.url,
            width: img.width ?? 0,
            height: img.height ?? 0,
            format: img.url.split('.').pop() ?? 'jpg',
            ...(img.alt !== undefined ? { alt: img.alt } : {}),
          };
        }
        return null;
      })
      .filter((img): img is ImageMetadata => img !== null);
  }

  return Object.entries(_imageGlob)
    .filter(([path]) => matchMedia(path)?.dirSlug === dirSlug)
    .sort(([pathA], [pathB]) => {
      const fileA = pathA.split('/').pop() ?? '';
      const fileB = pathB.split('/').pop() ?? '';
      return fileA.localeCompare(fileB);
    })
    .map(([, module]) => module.default);
}

// Classes de documents joints par extension (spec §1.9)
const ATTACHMENT_KIND_BY_EXTENSION: Record<string, AttachmentKind> = {
  mp4: 'video', webm: 'video', mov: 'video', m4v: 'video',
  mp3: 'audio', m4a: 'audio', ogg: 'audio', wav: 'audio', flac: 'audio',
  pdf: 'document', epub: 'document', txt: 'document', md: 'document',
};

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'tiff']);

/**
 * Classe un fichier de `media/` selon la spec §1.9.
 * Retourne `null` pour une image (qui alimente la galerie, pas les pièces jointes)
 * et pour `index.md` (fichier de métadonnées, jamais un document joint).
 * Toute extension inconnue tombe dans la classe `file` — ne lève jamais d'erreur.
 */
export function classifyAttachment(filename: string): AttachmentKind | null {
  const base = filename.split('/').pop() ?? filename;
  if (base.toLowerCase() === 'index.md') return null;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return 'file';
  const ext = base.slice(dot + 1).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return null;
  return ATTACHMENT_KIND_BY_EXTENSION[ext] ?? 'file';
}

/**
 * Retourne les documents joints (non-images) d'une série, triés alphabétiquement (spec §1.9).
 * Mode distant prioritaire si `series.data.files` est défini.
 * Les métadonnées du bloc frontmatter `attachments:` (title/description) sont fusionnées
 * par nom de fichier ; à défaut, le libellé est le nom de fichier.
 */
export async function getSeriesAttachments(slug: string, series?: Series): Promise<Attachment[]> {
  const data = series?.data as Record<string, unknown> | undefined;

  // Mode distant (spec §1.9) : `files[]` a priorité sur les non-images de media/
  const remoteFiles = data?.files as Array<{ url: string; title?: string; kind?: AttachmentKind; size?: number }> | undefined;
  if (remoteFiles && remoteFiles.length > 0) {
    return remoteFiles.map((f) => ({
      src: f.url,
      kind: f.kind ?? classifyAttachment(f.url.split('?')[0] ?? f.url) ?? 'file',
      title: f.title ?? (f.url.split('/').pop() ?? f.url),
      ...(f.size !== undefined && { size: f.size }),
    }));
  }

  // Métadonnées frontmatter indexées par nom de fichier (bloc `attachments:`)
  const metaByFilename = new Map<string, { title?: string; description?: string }>();
  const metaList = data?.attachments as Array<{ file: string; title?: string; description?: string }> | undefined;
  for (const meta of metaList ?? []) {
    const base = meta.file.split('/').pop();
    if (base) metaByFilename.set(base, meta);
  }

  const dirSlug = slug.replace(/\/index$/, '');

  return Object.entries(_attachmentGlob)
    .filter(([path]) => matchMedia(path)?.dirSlug === dirSlug)
    .map(([path, url]) => ({ path, url, filename: path.split('/').pop() ?? path }))
    .filter(({ filename }) => classifyAttachment(filename) !== null)
    .sort((a, b) => a.filename.localeCompare(b.filename))
    .map(({ url, filename }) => {
      const meta = metaByFilename.get(filename);
      return {
        src: url,
        kind: classifyAttachment(filename) ?? 'file',
        title: meta?.title ?? filename,
        ...(meta?.description !== undefined && { description: meta.description }),
      };
    });
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
