import type { AstroIntegration } from 'astro';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { PRESETS, resolvePreset, type PresetName } from './presets.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const VIRTUAL_MODULE_ID = 'virtual:hyperfocale/collection';
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;

const VIRTUAL_LAYOUT_ID = 'virtual:hyperfocale/layout';
const RESOLVED_VIRTUAL_LAYOUT_ID = `\0${VIRTUAL_LAYOUT_ID}`;

/**
 * Options de configuration du plugin `hyperfocale`.
 */
export interface HyperfocaleOptions {
  /**
   * Preset de domaine : pré-remplit `prefix`, `collectionName` et `dateRequired`
   * pour un usage courant (`photo`, `portfolio`, `music`, `catalog`, `press`, `recipe`).
   * Toute option fournie explicitement l'emporte sur la valeur du preset.
   */
  preset?: PresetName;

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

  /**
   * Chemin (relatif à la racine du projet) d'un layout `.astro` du site consommateur
   * qui enveloppe les routes injectées. Le layout reçoit les props
   * `{ title, description, ogImage?, lang?, schema? }` et rend le contenu via `<slot />`.
   * Absent → layout brut interne (document HTML minimal), comportement historique.
   */
  layout?: string;

  /**
   * Disposition de la galerie : `'grid'` (vignettes carrées recadrées) ou
   * `'column'` (colonne pleine largeur, ratios naturels préservés — ne recadre pas
   * les diptyques ni les portraits).
   * @default 'grid'
   */
  galleryLayout?: 'grid' | 'column';

  /**
   * Injecter les routes automatiques (`/{prefix}/`, `/{prefix}/[...slug]/`…).
   * À `false`, le site consommateur câble ses propres pages avec les helpers et composants.
   * @default true
   */
  injectRoutes?: boolean;

  /**
   * Injecter la route d'index `/{prefix}/` (liste des séries).
   * À `false`, seules les pages de détail sont injectées — le site consommateur
   * fournit sa propre page d'index (ex. `src/pages/series/index.astro`) sans
   * collision de route. Sans effet si `injectRoutes` est `false`.
   * @default true
   */
  listRoute?: boolean;
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
  /** Chemin du layout consommateur, ou `undefined` pour le layout brut interne. */
  layout: string | undefined;
  galleryLayout: 'grid' | 'column';
  injectRoutes: boolean;
  listRoute: boolean;
}

/**
 * Normalise et valide les options du plugin.
 */
function normalizeOptions(options: HyperfocaleOptions = {}): NormalizedHyperfocaleOptions {
  const preset = options.preset === undefined ? undefined : resolvePreset(options.preset);
  if (options.preset !== undefined && preset === undefined) {
    throw new Error(
      `[hyperfocale] L'option "preset" est inconnue. Valeurs acceptées: ${Object.keys(PRESETS).join(', ')}. Reçu: ${options.preset}`,
    );
  }

  const rawPrefix = options.prefix ?? preset?.prefix ?? '/series';
  const pageSize = options.pageSize ?? 12;
  const theme = options.theme ?? 'auto';
  const collectionName = options.collectionName ?? preset?.collectionName ?? 'series';
  const dateRequired = options.dateRequired ?? preset?.dateRequired ?? true;
  const layout = options.layout;
  const galleryLayout = options.galleryLayout ?? 'grid';
  const injectRoutes = options.injectRoutes ?? true;
  const listRoute = options.listRoute ?? true;

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
  if (!['grid', 'column'].includes(galleryLayout)) {
    throw new Error(`[hyperfocale] L'option "galleryLayout" doit être 'grid' ou 'column'. Reçu: ${galleryLayout}`);
  }

  const prefix = rawPrefix.endsWith('/') ? rawPrefix.slice(0, -1) : rawPrefix;
  return { prefix, pageSize, theme, collectionName, dateRequired, layout, galleryLayout, injectRoutes, listRoute };
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
  const { prefix, pageSize, theme, collectionName, dateRequired, layout, galleryLayout, injectRoutes, listRoute } =
    normalizeOptions(options);
  const routesDir = resolve(__dirname, 'routes');
  const themeFile = resolve(__dirname, 'theme', 'base.css');
  // Layout de repli interne, utilisé quand l'option `layout` n'est pas fournie.
  const bareLayoutFile = resolve(__dirname, 'layouts', 'BareLayout.astro');

  return {
    name: 'hyperfocale',
    hooks: {
      'astro:config:setup': ({ injectRoute, injectScript, updateConfig, logger, config }) => {
        logger.info(`Initialisation hyperfocale (prefix: ${prefix}, collection: ${collectionName}, theme: ${theme})`);

        // Vérifier que src/content.config.ts référence la collection. On accepte
        // soit le module virtuel `seriesCollection`, soit une déclaration maison
        // basée sur les builders exportés (`seriesSchema`/`baseSeriesSchema`) — un
        // site consommateur qui étend le schéma n'utilise pas `seriesCollection`.
        const contentConfig = resolve(fileURLToPath(config.root), 'src/content.config.ts');
        const registered =
          existsSync(contentConfig) &&
          new RegExp(`seriesCollection|seriesSchema|baseSeriesSchema|content/${collectionName}\\b`).test(
            readFileSync(contentConfig, 'utf-8'),
          );
        if (!registered) {
          logger.warn(
            `La collection "${collectionName}" n'est pas enregistrée.\n` +
            `  → Lancez : npx hyperfocale init`,
          );
        }

        // Chemin absolu du layout qui enveloppe les routes injectées :
        // celui du site consommateur si fourni, sinon le layout brut interne.
        const layoutFile = layout ? resolve(fileURLToPath(config.root), layout) : bareLayoutFile;

        if (injectRoutes) {
          if (listRoute) {
            injectRoute({
              pattern: `${prefix}/`,
              entrypoint: resolve(routesDir, 'series-list.astro'),
              prerender: true,
            });
          }

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
        }

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
            if (id === VIRTUAL_LAYOUT_ID) {
              return RESOLVED_VIRTUAL_LAYOUT_ID;
            }
            return undefined;
          },
          load(id) {
            // Ré-export du layout (consommateur ou repli interne) pour les routes injectées.
            if (id === RESOLVED_VIRTUAL_LAYOUT_ID) {
              return `export { default } from ${JSON.stringify(layoutFile)};`;
            }
            if (id === RESOLVED_VIRTUAL_MODULE_ID) {
              const dateField = dateRequired
                ? `date: z.coerce.date(),`
                : `date: z.coerce.date().optional(),`;

              return `
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

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

const remoteImageSchema = z.object({
  url: z.url(),
  alt: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export const seriesCollection = defineCollection({
  loader: glob({ pattern: '**/index.{md,mdx}', base: './src/content/${collectionName}' }),
  schema: ({ image }) => z.looseObject({
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
  }),
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
              'import.meta.env.HYPERFOCALE_GALLERY_LAYOUT': JSON.stringify(galleryLayout),
            },
          },
        });
      },
    },
  };
}

export { seriesSchema, baseSeriesSchema } from './schema.js';
export type { SeriesData, SeriesDataOptionalDate } from './schema.js';
export { PRESETS, resolvePreset } from './presets.js';
export type { PresetName, PresetConfig } from './presets.js';
