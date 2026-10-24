/**
 * `@regrets/hyperfocale/loader` — loader Content Layer pour un corpus
 * Hyperfocale rangé dans un dossier quelconque.
 *
 * La collection que pose l'intégration lit `src/content/<collection>/` par
 * `glob()`, et les helpers y trouvent `media/` et `images.json` par
 * `import.meta.glob`. Un site dont le corpus vit ailleurs — `public/content`,
 * un dossier matérialisé par l'ingestion — et dont les médias sont servis
 * d'ailleurs (un bucket) a besoin de deux choses que `glob()` ne fait pas :
 *
 * - le **repli de locale** par fichiers frères (Annexe F, stratégie 2) : la
 *   collection d'une locale lit `index.<locale>.md`, sinon `index.md` ;
 * - la **découverte §1.2** : tout dossier porteur d'un fichier index est un
 *   contenu, à toute profondeur, `media/` exclu.
 *
 * Tout le frontmatter passe au schéma de la collection (`parseData`), sans
 * liste blanche : les extensions de site (§1.3, passthrough) arrivent dans
 * `entry.data`, et une entrée invalide fait échouer le build, comme avec
 * `glob()`. Le frontmatter est lu par `parseFrontmatter` d'`astro/markdown`, le
 * même parseur que `glob()`.
 *
 * Node seulement (lecture du disque) ; les médias se résolvent à part, avec
 * `readSeriesMedia` puis `resolveSeriesMedia` (`@regrets/hyperfocale/media`).
 */

import type { Loader, LoaderContext } from 'astro/loaders';
import { parseFrontmatter } from 'astro/markdown';
import { readdir, readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compareCanonical, isExcluded } from './ingest/paths.js';
import type { ExclusionRule } from './ingest/paths.js';
import type { MediaFile } from './media.js';

export type { ExclusionRule } from './ingest/paths.js';

const LANG = /^[a-z]{2}(?:-[A-Z]{2})?$/;

/** Ce que reçoit `generateId`. */
export interface GenerateSeriesIdOptions {
  /** Dossier du contenu, relatif à `base`, POSIX, NFC — `''` pour `base` lui-même. */
  readonly path: string;
  /** Nom du fichier index retenu (`index.md`, `index.en.md`). */
  readonly file: string;
  /** Frontmatter brut, avant validation. */
  readonly data: Record<string, unknown>;
}

/** Options de `seriesLoader`. */
export interface SeriesLoaderOptions {
  /**
   * Racine du corpus : chemin relatif à la racine du projet Astro, chemin
   * absolu, ou URL `file:`. Peut traverser un lien symbolique.
   */
  readonly base: string | URL;
  /**
   * Locale de la collection (`en`, `pt-BR` — `[a-z]{2}(-[A-Z]{2})?`, Annexe F).
   * Absente : seuls les `index.md` sont lus. Présente : `index.<locale>.md`,
   * sinon `index.md` (voir `fallback`).
   */
  readonly locale?: string;
  /** Avec `locale`, retomber sur `index.md` quand `index.<locale>.md` manque. Défaut `true`. */
  readonly fallback?: boolean;
  /**
   * Rendre le body en HTML au chargement (`renderMarkdown`), pour que
   * `render(entry)` fonctionne. Défaut `true`, comme `glob()`. `false` garde
   * seulement `entry.body`.
   */
  readonly render?: boolean;
  /** Dossiers et fichiers à ignorer en plus des exclusions d'office (§4.2 : `.*`, `Thumbs.db`…). */
  readonly exclude?: readonly ExclusionRule[];
  /**
   * Identifiant d'une entrée. Défaut : le chemin du dossier relatif à `base`
   * (`music/concerts/2010/the-wombats-paris-2010`), `index` pour `base` lui-même.
   */
  readonly generateId?: (options: GenerateSeriesIdOptions) => string;
}

/** Un dossier porteur, et le fichier index retenu pour la locale. */
interface Found {
  readonly dir: string;
  readonly path: string;
  readonly file: string;
}

function toPath(base: string | URL, root: string): string {
  if (base instanceof URL) return fileURLToPath(base);
  if (base.startsWith('file:')) return fileURLToPath(base);
  return isAbsolute(base) ? base : resolve(root, base);
}

function posix(path: string): string {
  return path.split(sep).join('/');
}

/** Fichier index d'un dossier pour la locale, ou `null`. */
function pickIndex(files: ReadonlySet<string>, locale: string | undefined, fallback: boolean): string | null {
  if (locale !== undefined) {
    const localized = `index.${locale}.md`;
    if (files.has(localized)) return localized;
    if (!fallback) return null;
  }
  return files.has('index.md') ? 'index.md' : null;
}

/**
 * Parcourt `root` : tout dossier porteur d'un fichier index pour la locale est
 * un contenu (§1.2), à toute profondeur. On ne descend ni dans `media/` (plat,
 * §1.2), ni dans un dossier exclu, ni à travers un lien symbolique.
 */
async function discover(
  root: string,
  locale: string | undefined,
  fallback: boolean,
  exclude: readonly ExclusionRule[],
): Promise<Found[]> {
  const found: Found[] = [];
  const visit = async (dir: string, rel: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = new Set<string>();
    const subdirs: Array<{ name: string; rel: string }> = [];
    for (const entry of entries) {
      const name = entry.name.normalize('NFC');
      const childRel = rel === '' ? name : `${rel}/${name}`;
      if (entry.isFile()) {
        if (!isExcluded(childRel, exclude)) files.add(name);
      } else if (entry.isDirectory() && name !== 'media' && !isExcluded(`${childRel}/`, exclude)) {
        subdirs.push({ name: entry.name, rel: childRel });
      }
    }
    const file = pickIndex(files, locale, fallback);
    if (file !== null) found.push({ dir, path: rel, file });
    for (const sub of subdirs) await visit(join(dir, sub.name), sub.rel);
  };
  await visit(root, '');
  return found.sort((a, b) => compareCanonical(a.path, b.path));
}

/**
 * Loader Content Layer d'un corpus Hyperfocale (§1.2, Annexe F stratégie 2).
 *
 * @example
 * // src/content.config.ts — une collection par locale (Annexe F, stratégie 3),
 * // chacune avec le repli de la stratégie 2.
 * import { defineCollection } from 'astro:content';
 * import { baseSeriesSchema } from '@regrets/hyperfocale';
 * import { seriesLoader } from '@regrets/hyperfocale/loader';
 *
 * const schema = baseSeriesSchema({ dateRequired: true });
 * export const collections = {
 *   series: defineCollection({ loader: seriesLoader({ base: 'public/content/archives', locale: 'en' }), schema }),
 *   series_fr: defineCollection({ loader: seriesLoader({ base: 'public/content/archives' }), schema }),
 * };
 */
export function seriesLoader(options: SeriesLoaderOptions): Loader {
  const { locale, fallback = true, render = true, exclude = [], generateId } = options;
  if (locale !== undefined && !LANG.test(locale)) {
    throw new Error(`[hyperfocale] seriesLoader : locale « ${locale} » invalide — attendu [a-z]{2}(-[A-Z]{2})? (Annexe F).`);
  }

  return {
    name: locale === undefined ? 'hyperfocale-series-loader' : `hyperfocale-series-loader-${locale}`,
    load: async (context: LoaderContext) => {
      const projectRoot = fileURLToPath(context.config.root);
      const base = toPath(options.base, projectRoot);

      const sync = async () => {
        const exists = await stat(base).then((s) => s.isDirectory(), () => false);
        if (!exists) {
          context.logger.warn(`Dossier de contenu introuvable : ${base}`);
          context.store.clear();
          return;
        }
        const untouched = new Set(context.store.keys());
        const seen = new Map<string, string>();
        for (const found of await discover(base, locale, fallback, exclude)) {
          const abs = join(found.dir, found.file);
          const contents = await readFile(abs, 'utf-8');
          const { frontmatter, content } = parseFrontmatter(contents);
          const id = generateId?.({ path: found.path, file: found.file, data: frontmatter }) ?? (found.path === '' ? 'index' : found.path);
          const previous = seen.get(id);
          if (previous !== undefined) {
            throw new Error(`[hyperfocale] seriesLoader : identifiant « ${id} » produit par ${previous} et ${abs}.`);
          }
          seen.set(id, abs);
          untouched.delete(id);

          const filePath = posix(relative(projectRoot, abs));
          const digest = context.generateDigest(`${found.file}\n${contents}`);
          const existing = context.store.get(id);
          if (existing !== undefined && existing.digest === digest && existing.filePath === filePath) {
            // Ce que fait `glob()` pour une entrée inchangée : redéclarer ses
            // images au graphe de modules. La méthode n'est pas dans le type
            // public de `DataStore`, d'où l'appel optionnel.
            const store = context.store as typeof context.store & {
              addAssetImports?: (assets: string[], filePath: string) => void;
            };
            if (existing.assetImports?.length) store.addAssetImports?.(existing.assetImports, filePath);
            continue;
          }

          const data = await context.parseData({ id, data: frontmatter, filePath: abs });
          const rendered = render ? await context.renderMarkdown(content, { fileURL: pathToFileURL(abs) }) : undefined;
          context.store.set({
            id,
            data,
            body: content,
            filePath,
            digest,
            ...(rendered !== undefined ? { rendered } : {}),
            ...(rendered?.metadata?.imagePaths?.length ? { assetImports: rendered.metadata.imagePaths } : {}),
          });
        }
        for (const id of untouched) context.store.delete(id);
      };

      await sync();

      const { watcher } = context;
      if (watcher === undefined) return;
      watcher.add(base);
      const onChange = async (changed: string) => {
        if (!changed.startsWith(base) || !changed.endsWith('.md')) return;
        context.logger.info(`Contenu modifié : ${posix(relative(projectRoot, changed))} — rechargement`);
        await sync();
      };
      watcher.on('add', onChange);
      watcher.on('change', onChange);
      watcher.on('unlink', onChange);
    },
  };
}

/** Ce que `readSeriesMedia` rend, prêt pour `resolveSeriesMedia`. */
export interface SeriesMediaListing {
  /** Texte d'`images.json`, `null` si la série n'en a pas. */
  readonly manifest: string | null;
  /**
   * Fichiers de `media/` avec leur taille, `null` si le dossier n'existe pas.
   * Un sous-dossier y figure sous la forme `nom/` : le résolveur le signale
   * (`media-nested`) et l'ignore.
   */
  readonly mediaFiles: MediaFile[] | null;
}

/**
 * Lit `images.json` et la liste de `media/` d'un dossier de série, sans
 * descendre dans les sous-dossiers (§1.6, §1.8). Noms en NFC.
 *
 * @example
 * const dir = join('public/content/archives', entry.id);
 * const media = resolveSeriesMedia({ frontmatter: entry.data, ...(await readSeriesMedia(dir)) });
 */
export async function readSeriesMedia(seriesDir: string | URL): Promise<SeriesMediaListing> {
  const dir = seriesDir instanceof URL ? fileURLToPath(seriesDir) : seriesDir;
  const manifest = await readFile(join(dir, 'images.json'), 'utf-8').catch(() => null);
  const mediaDir = join(dir, 'media');
  const entries = await readdir(mediaDir, { withFileTypes: true }).catch(() => null);
  if (entries === null) return { manifest, mediaFiles: null };
  const mediaFiles: MediaFile[] = [];
  for (const entry of entries) {
    const name = entry.name.normalize('NFC');
    if (entry.isDirectory()) {
      mediaFiles.push(`${name}/`);
    } else if (entry.isFile()) {
      const { size } = await stat(join(mediaDir, entry.name));
      mediaFiles.push({ name, size });
    }
  }
  return { manifest, mediaFiles };
}
