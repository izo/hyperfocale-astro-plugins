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

/**
 * Schéma de base sans `cover` — utilisable sans `SchemaContext` (#DATA-004).
 *
 * Permet aux sites consommateurs d'étendre le schéma sans dépendance
 * au contexte Astro :
 *
 * ```ts
 * // src/content.config.ts du site consommateur
 * import { baseSeriesSchema } from '@izo/hyperfocale';
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
  return z.looseObject({
    title: z.string(),
    date: dateRequired ? z.coerce.date() : z.coerce.date().optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    lang: z.string().optional(),
    published: z.boolean().default(true),
    draft: z.boolean().default(false),
    featured: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    alt_description: z.string().optional(),
    private: z.boolean().default(false),
    download: z.boolean().default(false),
    iptc: iptcSchema.optional(),
    images: z.array(remoteImageSchema).optional(),
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
}

/**
 * Variante de `SeriesData` pour les collections où `date` est optionnelle
 * (`dateRequired: false`).
 */
export interface SeriesDataOptionalDate extends Omit<SeriesData, 'date'> {
  date?: Date;
}
