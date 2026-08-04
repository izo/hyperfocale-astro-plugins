import type { AstroIntegration } from 'astro';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { PRESETS, resolvePreset, type PresetName, type DeprecatedPresetName } from './presets.js';

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
   * Profil de domaine : pré-remplit `prefix`, `collectionName` et `dateRequired`
   * (`series`, `portfolio`, `music`, `catalog`, `press`, `recipe` — Annexe G de
   * la spec). Toute option fournie explicitement l'emporte sur le preset.
   *
   * `photo` reste accepté comme alias de `series`, avec un avertissement.
   */
  preset?: PresetName | DeprecatedPresetName;

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
   * Traitement des images par `astro:assets`.
   *
   * `'auto'` (défaut) laisse Astro optimiser : conversion WebP, dimensions,
   * et `srcset` haute densité en production. Le `srcset` est omis en dev, où
   * les endpoints d'optimisation d'un hébergeur (Vercel, Netlify, Cloudflare)
   * n'existent pas et répondraient 404 sur chaque variante.
   *
   * `'disabled'` sert les fichiers d'origine, sans passer par `astro:assets` —
   * pour un site dont les images sont déjà optimisées en amont, ou servies par
   * un CDN qui s'en charge.
   *
   * @default 'auto'
   */
  imageOptimization?: 'auto' | 'disabled';

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
  imageOptimization: 'auto' | 'disabled';
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
  const imageOptimization = options.imageOptimization ?? 'auto';
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
  if (!['auto', 'disabled'].includes(imageOptimization)) {
    throw new Error(`[hyperfocale] L'option "imageOptimization" doit être 'auto' ou 'disabled'. Reçu: ${imageOptimization}`);
  }

  const prefix = rawPrefix.endsWith('/') ? rawPrefix.slice(0, -1) : rawPrefix;
  return { prefix, pageSize, theme, collectionName, dateRequired, layout, galleryLayout, imageOptimization, injectRoutes, listRoute };
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
  const { prefix, pageSize, theme, collectionName, dateRequired, layout, galleryLayout, imageOptimization, injectRoutes, listRoute } =
    normalizeOptions(options);
  const routesDir = resolve(__dirname, 'routes');
  const themeFile = resolve(__dirname, 'theme', 'base.css');
  // Layout de repli interne, utilisé quand l'option `layout` n'est pas fournie.
  const bareLayoutFile = resolve(__dirname, 'layouts', 'BareLayout.astro');
  // Source unique du schéma, importée par le module virtuel `…/collection`.
  const schemaFile = resolve(__dirname, 'schema.js');

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
              // Le module virtuel délègue à `seriesSchema()` au lieu de redéclarer
              // le shape : la copie textuelle qui vivait ici avait déjà divergé de
              // `src/schema.ts` (ni `attachments`, ni `files`, §1.9), et les sites
              // qui l'utilisent héritaient d'un schéma en retard sur la spec.
              return `
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { seriesSchema } from ${JSON.stringify(schemaFile)};

export const seriesCollection = defineCollection({
  loader: glob({ pattern: '**/index.{md,mdx}', base: './src/content/${collectionName}' }),
  schema: (ctx) => seriesSchema(ctx, { dateRequired: ${JSON.stringify(dateRequired)} }),
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
              'import.meta.env.HYPERFOCALE_IMAGE_OPTIMIZATION': JSON.stringify(imageOptimization),
            },
          },
        });
      },
    },
  };
}

export { seriesSchema, baseSeriesSchema, CONTENT_TYPES } from './schema.js';
export type { SeriesData, SeriesDataOptionalDate, SectionData, ContentType } from './schema.js';
export { PRESETS, PRESET_ALIASES, resolvePreset } from './presets.js';
export type { PresetName, DeprecatedPresetName, PresetConfig } from './presets.js';
