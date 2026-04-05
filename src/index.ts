import type { AstroIntegration } from 'astro';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

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
}

/**
 * Options normalisées (toutes les valeurs présentes).
 */
export interface NormalizedHyperfocaleOptions {
  prefix: string;
  pageSize: number;
  theme: 'light' | 'dark' | 'auto';
}

/**
 * Normalise et valide les options du plugin.
 */
function normalizeOptions(options: HyperfocaleOptions = {}): NormalizedHyperfocaleOptions {
  const prefix = options.prefix ?? '/series';
  const pageSize = options.pageSize ?? 12;
  const theme = options.theme ?? 'auto';

  if (typeof prefix !== 'string' || !prefix.startsWith('/')) {
    throw new Error(`[hyperfocale] L'option "prefix" doit être une chaîne commençant par "/". Reçu: ${prefix}`);
  }
  if (typeof pageSize !== 'number' || pageSize < 1) {
    throw new Error(`[hyperfocale] L'option "pageSize" doit être un entier >= 1. Reçu: ${pageSize}`);
  }
  if (!['light', 'dark', 'auto'].includes(theme)) {
    throw new Error(`[hyperfocale] L'option "theme" doit être 'light', 'dark' ou 'auto'. Reçu: ${theme}`);
  }

  return { prefix, pageSize, theme };
}

/**
 * Intégration Astro `hyperfocale`.
 *
 * Ajoute :
 * - La collection `series` (schéma Zod automatique)
 * - Les routes `/series/`, `/series/[slug]/`, `/series/[slug]/[page]/`
 * - Le thème CSS configurable
 */
export default function hyperfocale(options: HyperfocaleOptions = {}): AstroIntegration {
  const normalizedOptions = normalizeOptions(options);
  const { prefix, theme } = normalizedOptions;

  // Normalise le préfixe : retire le slash final
  const normalizedPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;

  return {
    name: 'hyperfocale',
    hooks: {
      'astro:config:setup': ({ injectRoute, injectScript, updateConfig, logger }) => {
        logger.info(`Initialisation hyperfocale (prefix: ${normalizedPrefix}, theme: ${theme})`);

        // Injection des routes automatiques
        const routesDir = resolve(__dirname, 'routes');

        injectRoute({
          pattern: `${normalizedPrefix}/`,
          entrypoint: resolve(routesDir, 'series-list.astro'),
          prerender: true,
        });

        injectRoute({
          pattern: `${normalizedPrefix}/[slug]/`,
          entrypoint: resolve(routesDir, 'series-detail.astro'),
          prerender: true,
        });

        injectRoute({
          pattern: `${normalizedPrefix}/[slug]/[page]/`,
          entrypoint: resolve(routesDir, 'series-page.astro'),
          prerender: true,
        });

        // Injection du CSS thème
        const themeFile = resolve(__dirname, 'theme', 'base.css');
        injectScript('page-ssr', `import "${themeFile}";`);

        // Plugin Vite : module virtuel `virtual:hyperfocale/collection`
        // Permet à l'utilisateur d'importer la définition de collection prête à l'emploi.
        // Usage dans src/content.config.ts :
        //   import { seriesCollection } from 'virtual:hyperfocale/collection';
        //   export const collections = { series: seriesCollection };
        const virtualModulePlugin: Plugin = {
          name: 'vite-plugin-hyperfocale-virtual',
          resolveId(id) {
            if (id === 'virtual:hyperfocale/collection') {
              return '\0virtual:hyperfocale/collection';
            }
            return undefined;
          },
          load(id) {
            if (id === '\0virtual:hyperfocale/collection') {
              // Chemin absolu vers le fichier schema.ts compilé
              const schemaPath = resolve(__dirname, 'schema.js').replace(/\\/g, '/');
              return `
import { defineCollection } from 'astro:content';
import { seriesSchema } from '${schemaPath}';

export const seriesCollection = defineCollection({
  type: 'content',
  schema: seriesSchema,
});
`;
            }
            return undefined;
          },
        };

        // Partage des options normalisées via les define Vite
        updateConfig({
          vite: {
            plugins: [virtualModulePlugin],
            define: {
              'import.meta.env.HYPERFOCALE_PREFIX': JSON.stringify(normalizedPrefix),
              'import.meta.env.HYPERFOCALE_PAGE_SIZE': JSON.stringify(normalizedOptions.pageSize),
              'import.meta.env.HYPERFOCALE_THEME': JSON.stringify(theme),
            },
          },
        });
      },
    },
  };
}

// Re-exports pour utilisation par le site consommateur
export { seriesSchema } from './schema.js';
export type { SeriesData } from './schema.js';
