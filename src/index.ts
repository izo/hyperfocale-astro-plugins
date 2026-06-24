import type { AstroIntegration } from 'astro';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const VIRTUAL_MODULE_ID = 'virtual:hyperfocale/collection';
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;

/**
 * Options de configuration du plugin `hyperfocale`.
 */
export interface HyperfocaleOptions {
  /**
   * Préfixe des routes automatiques.
   * @default '/series'
   */
  prefix?: string;

  /**
   * Nombre d'images par page dans la galerie.
   * @default 12
   */
  pageSize?: number;

  /**
   * Thème visuel : clair, sombre, ou selon l'OS.
   * @default 'auto'
   */
  theme?: 'light' | 'dark' | 'auto';

  /**
   * Nom de la collection Astro Content dans content.config.ts.
   * Permet d'utiliser le plugin pour des collections non-photo (ex: `brands-fr`).
   * @default 'series'
   */
  collectionName?: string;

  /**
   * Si `false`, le champ `date` du schéma devient optionnel.
   * Utile pour des collections dont le contenu n'est pas lié à une date (marques, produits…).
   * @default true
   */
  dateRequired?: boolean;
}

/**
 * Options normalisées (toutes les valeurs présentes).
 */
export interface NormalizedHyperfocaleOptions {
  prefix: string;
  pageSize: number;
  theme: 'light' | 'dark' | 'auto';
  collectionName: string;
  dateRequired: boolean;
}

/**
 * Normalise et valide les options du plugin.
 */
function normalizeOptions(options: HyperfocaleOptions = {}): NormalizedHyperfocaleOptions {
  const rawPrefix = options.prefix ?? '/series';
  const pageSize = options.pageSize ?? 12;
  const theme = options.theme ?? 'auto';
  const collectionName = options.collectionName ?? 'series';
  const dateRequired = options.dateRequired ?? true;

  if (!rawPrefix.startsWith('/')) {
    throw new Error(`[hyperfocale] L'option "prefix" doit être une chaîne commençant par "/". Reçu: ${rawPrefix}`);
  }
  if (pageSize < 1) {
    throw new Error(`[hyperfocale] L'option "pageSize" doit être un entier >= 1. Reçu: ${pageSize}`);
  }
  if (!['light', 'dark', 'auto'].includes(theme)) {
    throw new Error(`[hyperfocale] L'option "theme" doit être 'light', 'dark' ou 'auto'. Reçu: ${theme}`);
  }
  if (!collectionName || collectionName.trim() === '') {
    throw new Error(`[hyperfocale] L'option "collectionName" ne peut pas être vide.`);
  }

  const prefix = rawPrefix.endsWith('/') ? rawPrefix.slice(0, -1) : rawPrefix;
  return { prefix, pageSize, theme, collectionName, dateRequired };
}

/**
 * Intégration Astro `hyperfocale`.
 *
 * Ajoute :
 * - La collection `series` (ou nom personnalisé via `collectionName`)
 * - Les routes `/{prefix}/`, `/{prefix}/[slug]/`, `/{prefix}/[slug]/[page]/`
 * - Le thème CSS configurable
 */
export default function hyperfocale(options: HyperfocaleOptions = {}): AstroIntegration {
  const { prefix, pageSize, theme, collectionName, dateRequired } = normalizeOptions(options);
  const routesDir = resolve(__dirname, 'routes');
  const themeFile = resolve(__dirname, 'theme', 'base.css');

  return {
    name: 'hyperfocale',
    hooks: {
      'astro:config:setup': ({ injectRoute, injectScript, updateConfig, logger, config }) => {
        logger.info(`Initialisation hyperfocale (prefix: ${prefix}, collection: ${collectionName}, theme: ${theme})`);

        // Vérifier que src/content.config.ts référence la collection
        const contentConfig = resolve(fileURLToPath(config.root), 'src/content.config.ts');
        if (!existsSync(contentConfig) || !readFileSync(contentConfig, 'utf-8').includes('seriesCollection')) {
          logger.warn(
            `La collection "series" n'est pas enregistrée.\n` +
            `  → Lancez : npx hyperfocale init`,
          );
        }

        injectRoute({
          pattern: `${prefix}/`,
          entrypoint: resolve(routesDir, 'series-list.astro'),
          prerender: true,
        });

        injectRoute({
          pattern: `${prefix}/[...slug]/`,
          entrypoint: resolve(routesDir, 'series-detail.astro'),
          prerender: true,
        });

        injectRoute({
          pattern: `${prefix}/[...slug]/[page]/`,
          entrypoint: resolve(routesDir, 'series-page.astro'),
          prerender: true,
        });

        injectScript('page-ssr', `import "${themeFile}";`);

        // Usage dans src/content.config.ts du projet consommateur :
        //   import { seriesCollection } from 'virtual:hyperfocale/collection';
        //   export const collections = { series: seriesCollection };
        // Si collectionName est personnalisé, déclarez la collection avec le bon nom :
        //   export const collections = { 'brands-fr': seriesCollection };
        const virtualModulePlugin: Plugin = {
          name: 'vite-plugin-hyperfocale-virtual',
          resolveId(id) {
            if (id === VIRTUAL_MODULE_ID) {
              return RESOLVED_VIRTUAL_MODULE_ID;
            }
            return undefined;
          },
          load(id) {
            if (id === RESOLVED_VIRTUAL_MODULE_ID) {
              // Le schéma est inliné pour éviter les problèmes de résolution
              // de chemin entre src/ et dist/ au runtime Astro.
              // dateRequired contrôle si la date est obligatoire ou optionnelle.
              const dateField = dateRequired
                ? `date: z.coerce.date(),`
                : `date: z.coerce.date().optional(),`;

              return `
import { defineCollection, z } from 'astro:content';

const iptcSchema = z.object({
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
}).passthrough();

const remoteImageSchema = z.object({
  url: z.string().url(),
  alt: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export const seriesCollection = defineCollection({
  type: 'content',
  schema: ({ image }) => z.object({
    title: z.string(),
    ${dateField}
    description: z.string().optional(),
    cover: image().optional(),
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
  }).passthrough(),
});
`;
            }
            return undefined;
          },
        };

        updateConfig({
          vite: {
            plugins: [virtualModulePlugin],
            define: {
              'import.meta.env.HYPERFOCALE_PREFIX': JSON.stringify(prefix),
              'import.meta.env.HYPERFOCALE_PAGE_SIZE': JSON.stringify(pageSize),
              'import.meta.env.HYPERFOCALE_THEME': JSON.stringify(theme),
              'import.meta.env.HYPERFOCALE_COLLECTION_NAME': JSON.stringify(collectionName),
              'import.meta.env.HYPERFOCALE_DATE_REQUIRED': JSON.stringify(dateRequired),
            },
          },
        });
      },
    },
  };
}

export { seriesSchema } from './schema.js';
export type { SeriesData } from './schema.js';
