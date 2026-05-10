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
 * Schéma Zod de la collection `series`.
 * Injecté automatiquement par le plugin via l'API Astro 6.
 *
 * Le type de retour est inféré directement depuis `z.object()` afin que
 * `.extend()` bénéficie d'une inférence complète dans les projets consommateurs.
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
  return z.object({
    title: z.string(),
    date: dateRequired ? z.coerce.date() : z.coerce.date().optional(),
    description: z.string().optional(),
    cover: (image() as z.ZodTypeAny).optional(),
    location: z.string().optional(),
  });
}

/**
 * Type des données d'une série (frontmatter).
 * Défini manuellement pour éviter les conflits de types zod entre versions.
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
}

/**
 * Variante de `SeriesData` pour les collections où `date` est optionnelle
 * (`dateRequired: false`).
 */
export interface SeriesDataOptionalDate extends Omit<SeriesData, 'date'> {
  date?: Date;
}
