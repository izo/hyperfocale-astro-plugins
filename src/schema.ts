import { z } from 'zod';
import type { SchemaContext } from 'astro:content';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyZodObject = ReturnType<typeof z.object<any>>;

/**
 * Schéma Zod de la collection `series`.
 * Injecté automatiquement par le plugin via l'API Astro 6.
 */
export function seriesSchema({ image }: SchemaContext): AnyZodObject {
  return z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cover: (image() as any).optional(),
    location: z.string().optional(),
  });
}

/**
 * Type des données d'une série (frontmatter).
 * Défini manuellement pour éviter les conflits de types zod entre versions.
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
