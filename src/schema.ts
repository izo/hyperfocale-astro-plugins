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
 * Schéma Zod de la collection `series`.
 * Injecté automatiquement par le plugin via l'API Astro 6.
 *
 * v0.3.0 — Conformité spec Hyperfocale v2.1 :
 * - `lang` : code ISO 639-1 de la langue de la série
 * - `draft` : masqué en production si `true`
 * - `featured` : mise en avant dans les listings
 * - `tags` : tags éditoriaux libres (distincts de `iptc.keywords`)
 * - `iptc` : bloc structuré de métadonnées IPTC en `looseObject` pour `iptc.custom.*`
 * - `images` : mode distant — URLs CDN à la place de `media/` local
 * - `looseObject` racine : champs inconnus transmis sans erreur
 *
 * @param context - Contexte Astro (fournit `image()`)
 * @param options - Options du schéma (ex: `dateRequired: false`)
 *
 * @example Usage standard (date obligatoire) :
 * ```ts
 * const series = defineCollection({ schema: seriesSchema });
 * ```
 *
 * @example Sans date (marques, produits) :
 * ```ts
 * const brands = defineCollection({
 *   schema: (ctx) => seriesSchema(ctx, { dateRequired: false }).extend({
 *     logo: ctx.image().optional(),
 *   }),
 * });
 * ```
 */
export function seriesSchema(
  { image }: SchemaContext,
  options: SeriesSchemaOptions = {},
) {
  const dateRequired = options.dateRequired ?? true;
  return z.looseObject({
    title: z.string(),
    date: dateRequired ? z.coerce.date() : z.coerce.date().optional(),
    description: z.string().optional(),
    cover: (image() as z.ZodTypeAny).optional(),
    location: z.string().optional(),
    lang: z.string().optional(),
    draft: z.boolean().default(false),
    featured: z.boolean().default(false),
    tags: z.array(z.string()).optional(),
    iptc: iptcSchema.optional(),
    images: z.array(remoteImageSchema).optional(),
  });
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
  draft: boolean;
  featured: boolean;
  tags?: string[];
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
