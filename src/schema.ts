import { z } from 'zod';
import type { SchemaContext } from 'astro:content';

/**
 * Options de génération du schéma series.
 */
export interface SeriesSchemaOptions {
  /**
   * Si `false`, le champ `date` est optionnel dans le schéma.
   * Utile pour des collections non temporelles (marques, produits…).
   * @default true
   */
  dateRequired?: boolean;
}

/**
 * Natures de contenu reconnues (spec §1.10).
 *
 * `section` désigne une page d'index de section — un dossier de rangement
 * (`archives/music/index.md`) qui n'est pas une série : pas de galerie, pas de
 * date, absente des listings. L'absence du champ vaut `series`, comportement
 * de tout le contenu antérieur à la v2.6.
 */
export const CONTENT_TYPES = ['series', 'section'] as const;

/** Nature d'un contenu (spec §1.10). */
export type ContentType = (typeof CONTENT_TYPES)[number];

/** Schéma du bloc `iptc.*` (spec §1.3). */
const iptcSchema = z.looseObject({
  creator: z.string().optional(),
  credit: z.string().optional(),
  copyright: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  country: z.string().optional(),
  country_code: z.string().optional(),
  camera: z.string().optional(),
  lens: z.string().optional(),
  film: z.string().optional(),
  headline: z.string().optional(),
  instructions: z.string().optional(),
  source: z.string().optional(),
  gps: z.object({ lat: z.number(), lng: z.number() }).optional(),
});

/** Schéma d'une image en mode distant (spec §1.5). */
const remoteImageSchema = z.object({
  url: z.url(),
  alt: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

/** Classes de documents joints non-image (spec §1.9). */
export const ATTACHMENT_KINDS = ['video', 'audio', 'document', 'file'] as const;

/** Métadonnées optionnelles d'un document joint local — bloc `attachments:` (spec §1.9). */
const attachmentMetaSchema = z.object({
  file: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
});

/** Schéma d'un document joint en mode distant — champ `files[]` (spec §1.9). */
const remoteFileSchema = z.object({
  url: z.url(),
  title: z.string().optional(),
  kind: z.enum(ATTACHMENT_KINDS).optional(),
  size: z.number().optional(),
});

/**
 * Schéma de base sans `cover` — utilisable sans `SchemaContext` (#DATA-004).
 *
 * Permet aux sites consommateurs d'étendre le schéma sans dépendance
 * au contexte Astro :
 *
 * ```ts
 * // src/content.config.ts du site consommateur
 * import { baseSeriesSchema } from '@regrets/hyperfocale';
 *
 * export const collections = {
 *   series: defineCollection({
 *     schema: (ctx) => baseSeriesSchema({ dateRequired: false }).extend({
 *       cover: ctx.image().optional(),
 *       camera: z.string().optional(),
 *       film: z.string().optional(),
 *     }),
 *   }),
 * };
 * ```
 */
export function baseSeriesSchema(options: SeriesSchemaOptions = {}) {
  const { dateRequired = true } = options;
  const schema = z.looseObject({
    type: z.enum(CONTENT_TYPES).default('series'),
    title: z.string(),
    // `date` est déclarée optionnelle ici, puis rendue obligatoire par le
    // `check` ci-dessous : une page d'index de section (§1.10) n'est pas datée,
    // là où une série l'est. Un champ ne pouvant être requis conditionnellement
    // dans un shape Zod, l'arbitrage se fait après coup — et `.check()` survit
    // à `.extend()`, ce dont dépend l'API d'extension (#DATA-004).
    date: z.coerce.date().optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    lang: z.string().optional(),
    published: z.boolean().default(true),
    draft: z.boolean().default(false),
    featured: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    // Tri d'une sous-série dans le line-up de son conteneur (spec §1.8).
    // Absent, la sous-série se range par date décroissante.
    lineup_order: z.number().optional(),
    alt_description: z.string().optional(),
    private: z.boolean().default(false),
    download: z.boolean().default(false),
    iptc: iptcSchema.optional(),
    images: z.array(remoteImageSchema).optional(),
    attachments: z.array(attachmentMetaSchema).optional(),
    files: z.array(remoteFileSchema).optional(),
  });

  if (!dateRequired) return schema;

  return schema.check((ctx) => {
    if (ctx.value.type === 'section' || ctx.value.date !== undefined) return;
    ctx.issues.push({
      code: 'custom',
      path: ['date'],
      input: ctx.value.date,
      message:
        'Le champ `date` est requis pour une série. ' +
        'Une page de rangement se déclare `type: section` et n\'est alors pas datée (spec §1.10).',
    });
  });
}

/**
 * Schéma complet avec `cover` (image traitée par Astro).
 * Nécessite `SchemaContext` car `image()` est fourni par `defineCollection`.
 *
 * @example Usage standard :
 * ```ts
 * const series = defineCollection({ schema: seriesSchema });
 * ```
 *
 * @example Sans date (marques, produits) :
 * ```ts
 * const brands = defineCollection({
 *   schema: (ctx) => seriesSchema(ctx, { dateRequired: false }),
 * });
 * ```
 */
export function seriesSchema({ image }: SchemaContext, options: SeriesSchemaOptions = {}) {
  return baseSeriesSchema(options).extend({ cover: (image() as z.ZodTypeAny).optional() });
}

/**
 * Type des données d'une série (frontmatter).
 *
 * Quand `dateRequired: false` est passé à `seriesSchema()`, `date` sera `undefined`
 * pour les entrées sans date. Utilisez `SeriesDataOptionalDate` dans ce cas.
 */
export interface SeriesData {
  /** Nature du contenu (spec §1.10). Absent du frontmatter → `series`. */
  type: ContentType;
  title: string;
  date: Date;
  description?: string;
  cover?: {
    src: string;
    width: number;
    height: number;
    format: string;
  };
  location?: string;
  lang?: string;
  published: boolean;
  draft: boolean;
  featured: boolean;
  tags: string[];
  /** Tri d'une sous-série dans le line-up de son conteneur (spec §1.8). */
  lineup_order?: number;
  alt_description?: string;
  private: boolean;
  download: boolean;
  iptc?: Record<string, unknown>;
  images?: Array<{
    url: string;
    alt?: string;
    width?: number;
    height?: number;
  }>;
  attachments?: Array<{
    file: string;
    title?: string;
    description?: string;
  }>;
  files?: Array<{
    url: string;
    title?: string;
    kind?: AttachmentKind;
    size?: number;
  }>;
}

/** Classe d'un document joint (spec §1.9). */
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/**
 * Document joint résolu — retourné par `getSeriesAttachments()` (spec §3.2).
 * `src` est un chemin relatif (mode local) ou une URL (mode distant).
 */
export interface Attachment {
  src: string;
  kind: AttachmentKind;
  title?: string;
  description?: string;
  size?: number;
}

/**
 * Variante de `SeriesData` pour les collections où `date` est optionnelle
 * (`dateRequired: false`).
 */
export interface SeriesDataOptionalDate extends Omit<SeriesData, 'date'> {
  date?: Date;
}

/**
 * Données d'une page d'index de section (spec §1.10).
 *
 * Une section range des séries sans en être une : `date` est sans objet, et si
 * elle est présente, aucun tri ne s'appuie dessus.
 */
export interface SectionData extends Omit<SeriesData, 'type' | 'date'> {
  type: 'section';
  date?: Date;
}
