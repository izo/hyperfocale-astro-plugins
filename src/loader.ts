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
 * Avant la validation, `prepare` laisse le site normaliser le frontmatter —
 * replis d'un champ que son contrat exige, typage YAML (`fallbackField`,
 * `stringifyTags`) — et chaque repli appliqué se dit en un avertissement
 * groupé. `sections: 'exclude'` écarte les pages d'index de section (§1.10)
 * d'une collection de séries.
 *
 * Node seulement (lecture du disque) ; les médias se résolvent à part, avec
 * `readSeriesMedia` puis `resolveSeriesMedia` (`@regrets/hyperfocale/media`).
 */

import type { Loader, LoaderContext } from 'astro/loaders';
import { parseFrontmatter } from 'astro/markdown';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mapConcurrent } from './ingest/concurrency.js';
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

/** Ce que reçoit `prepare`, en plus du frontmatter. */
export interface SeriesPrepareContext {
  /** Identifiant de l'entrée (celui de `generateId`, sinon le chemin du dossier). */
  readonly id: string;
  /** Dossier du contenu, relatif à `base`, POSIX, NFC — `''` pour `base` lui-même. */
  readonly path: string;
  /** Dernier segment de `path` : le slug de §1.2 (`''` pour `base` lui-même). */
  readonly slug: string;
  /** Nom du fichier index lu (`index.md`, `index.en.md`). */
  readonly file: string;
  /** Chemin du fichier index, relatif à la racine du projet, POSIX — celui d'`entry.filePath`. */
  readonly filePath: string;
  /**
   * Locale du fichier lu : `en` pour `index.en.md`, `undefined` pour
   * `index.md` (langue par défaut du corpus) — y compris quand la collection,
   * déclarée en `en`, s'est repliée sur `index.md`.
   */
  readonly locale: string | undefined;
  /** Locale déclarée pour la collection (option `locale`), `undefined` sans. */
  readonly collectionLocale: string | undefined;
  /**
   * Signale un repli appliqué à cette entrée. Les signalements de même
   * message sont regroupés en **un** avertissement à la fin du chargement,
   * avec le nombre d'entrées et leurs identifiants.
   */
  warn(message: string): void;
}

/**
 * Normalisation du frontmatter avant `parseData`. Rend le frontmatter à
 * valider ; peut être asynchrone. Une exception fait échouer l'entrée — et le
 * chargement — comme une entrée invalide.
 */
export type SeriesPrepare = (
  frontmatter: Record<string, unknown>,
  context: SeriesPrepareContext,
) => Record<string, unknown> | Promise<Record<string, unknown>>;

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
  /**
   * Normalisation du frontmatter **avant** `parseData` — une fonction, ou une
   * liste appliquée dans l'ordre. Elle reçoit le frontmatter brut (après
   * `generateId`) et rend celui qui sera validé ; c'est aussi ce que voit le
   * cache : une entrée n'est revalidée que si son fichier ou le résultat de
   * `prepare` change. Absente : le frontmatter passe tel quel.
   */
  readonly prepare?: SeriesPrepare | readonly SeriesPrepare[];
  /**
   * Pages d'index de section (`type: section`, §1.10). `include` (défaut) les
   * garde dans la collection, comme `glob()` ; `exclude` les écarte avant
   * `generateId`, `prepare` et `parseData` — pour une collection qui ne doit
   * contenir que des séries. Le discriminant est le seul `type` écrit dans le
   * fichier, jamais deviné (§1.10).
   */
  readonly sections?: 'include' | 'exclude';
}

/** Absent au sens d'un repli : `undefined`, `null`, ou une chaîne vide une fois rognée. */
function isMissing(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

/** Options communes des préparations fournies. */
export interface PrepareWarnOptions {
  /**
   * Message de l'avertissement groupé quand la préparation modifie l'entrée ;
   * `false` pour se taire. Défaut : un message qui nomme le champ.
   */
  readonly warn?: string | false;
}

/**
 * Préparation : donne une valeur à `field` quand il est absent (`undefined`,
 * `null` ou chaîne vide), et le signale. `value` est une valeur, ou une
 * fonction du frontmatter et du contexte — `(_, { slug }) => slug` pour un
 * identifiant dérivé du dossier. Le frontmatter reçu n'est pas modifié : la
 * préparation rend une copie.
 *
 * @example
 * seriesLoader({ base, prepare: [fallbackField('description', '')] })
 */
export function fallbackField(
  field: string,
  value: (frontmatter: Record<string, unknown>, context: SeriesPrepareContext) => unknown,
  options?: PrepareWarnOptions,
): SeriesPrepare;
export function fallbackField(field: string, value: unknown, options?: PrepareWarnOptions): SeriesPrepare;
export function fallbackField(field: string, value: unknown, options: PrepareWarnOptions = {}): SeriesPrepare {
  const message = options.warn ?? `\`${field}\` absent — valeur de repli appliquée`;
  return (frontmatter, context) => {
    if (!isMissing(frontmatter[field])) return frontmatter;
    const fallback = typeof value === 'function'
      ? (value as (frontmatter: Record<string, unknown>, context: SeriesPrepareContext) => unknown)(frontmatter, context)
      : value;
    if (message !== false) context.warn(message);
    return { ...frontmatter, [field]: fallback };
  };
}

/**
 * Préparation : les tags scalaires non textuels deviennent des chaînes. En
 * YAML, `tags: [2004]` est un entier et `tags: [true]` un booléen, que
 * `tags: string[]` (§1.3) refuse ; ils sont convertis par `String()`, et
 * signalés. Une autre valeur (date, objet) est laissée au schéma. Un `tags`
 * scalaire (`tags: 2004`) n'est pas mis en liste.
 */
export function stringifyTags(options: PrepareWarnOptions & { readonly field?: string } = {}): SeriesPrepare {
  const field = options.field ?? 'tags';
  const message = options.warn ?? `\`${field}\` : valeurs non textuelles converties en chaînes`;
  return (frontmatter, context) => {
    const tags = frontmatter[field];
    if (!Array.isArray(tags)) return frontmatter;
    const scalar = (tag: unknown) => typeof tag === 'number' || typeof tag === 'boolean' || typeof tag === 'bigint';
    if (!tags.some(scalar)) return frontmatter;
    if (message !== false) context.warn(message);
    return { ...frontmatter, [field]: tags.map((tag) => (scalar(tag) ? String(tag) : tag)) };
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function listSome(ids: readonly string[], max = 10): string {
  return ids.slice(0, max).join(', ') + (ids.length > max ? ` … (+${ids.length - max})` : '');
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

/** Lectures simultanées de fichiers index par `sync()`. */
const READ_CONCURRENCY = 16;

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
 *
 * @example
 * // Replis d'un contrat de site, rubriques écartées.
 * seriesLoader({
 *   base: 'public/content/archives',
 *   sections: 'exclude',
 *   prepare: [
 *     fallbackField('series_id', (_, { slug }) => slug, { warn: 'series_id absent — repli sur le nom du dossier' }),
 *     fallbackField('description', ''),
 *     stringifyTags(),
 *   ],
 * });
 */
export function seriesLoader(options: SeriesLoaderOptions): Loader {
  const { locale, fallback = true, render = true, exclude = [], generateId, sections = 'include' } = options;
  if (locale !== undefined && !LANG.test(locale)) {
    throw new Error(`[hyperfocale] seriesLoader : locale « ${locale} » invalide — attendu [a-z]{2}(-[A-Z]{2})? (Annexe F).`);
  }
  if (sections !== 'include' && sections !== 'exclude') {
    throw new Error(`[hyperfocale] seriesLoader : sections « ${String(sections)} » invalide — attendu 'include' ou 'exclude'.`);
  }
  const prepares: readonly SeriesPrepare[] =
    options.prepare === undefined ? [] : typeof options.prepare === 'function' ? [options.prepare] : options.prepare;

  return {
    name: locale === undefined ? 'hyperfocale-series-loader' : `hyperfocale-series-loader-${locale}`,
    load: async (context: LoaderContext) => {
      const projectRoot = fileURLToPath(context.config.root);
      const base = toPath(options.base, projectRoot);

      /** Applique les préparations dans l'ordre ; une exception devient une entrée invalide. */
      const prepareEntry = async (
        frontmatter: Record<string, unknown>,
        ctx: SeriesPrepareContext,
      ): Promise<Record<string, unknown>> => {
        let data = frontmatter;
        for (const step of prepares) {
          let next: unknown;
          try {
            next = await step(data, ctx);
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            throw new Error(`[hyperfocale] seriesLoader : prepare a échoué sur ${ctx.filePath} (« ${ctx.id} ») — ${reason}`, {
              cause: error,
            });
          }
          if (!isRecord(next)) {
            throw new Error(`[hyperfocale] seriesLoader : prepare doit rendre un objet — ${ctx.filePath} (« ${ctx.id} »).`);
          }
          data = next;
        }
        return data;
      };

      /** Fichier index retenu → identifiant, tel que le dernier `sync()` complet l'a établi. */
      let owners = new Map<string, string>();

      /**
       * Traite un fichier index : lecture déjà faite, identifiant, `prepare`, cache
       * par empreinte, validation, `store.set`. Partagé par la synchronisation
       * complète et par la mise à jour d'un seul fichier.
       *
       * Rend `skipped` pour une rubrique écartée (`sections: 'exclude'`), `diverged`
       * quand `expectedId` est donné et que l'identifiant calculé n'est plus le
       * même — rien n'est alors écrit —, `unchanged` pour une entrée au cache
       * valide, `processed` sinon.
       */
      const processEntry = async (
        found: Found,
        contents: string,
        seen: Map<string, string>,
        untouched: Set<string>,
        warnings: Map<string, string[]>,
        expectedId?: string,
      ): Promise<'skipped' | 'diverged' | 'unchanged' | 'processed'> => {
        const abs = join(found.dir, found.file);
        const { frontmatter, content } = parseFrontmatter(contents);
        // §1.10 : le discriminant est `type`, tel qu'écrit dans le fichier.
        if (sections === 'exclude' && frontmatter.type === 'section') return 'skipped';
        const id = generateId?.({ path: found.path, file: found.file, data: frontmatter }) ?? (found.path === '' ? 'index' : found.path);
        if (expectedId !== undefined && id !== expectedId) return 'diverged';
        const previous = seen.get(id);
        if (previous !== undefined) {
          throw new Error(`[hyperfocale] seriesLoader : identifiant « ${id} » produit par ${previous} et ${abs}.`);
        }
        seen.set(id, abs);
        untouched.delete(id);

        const filePath = posix(relative(projectRoot, abs));
        const data = prepares.length === 0 ? frontmatter : await prepareEntry(frontmatter, {
          id,
          path: found.path,
          slug: found.path.slice(found.path.lastIndexOf('/') + 1),
          file: found.file,
          filePath,
          locale: found.file === 'index.md' ? undefined : locale,
          collectionLocale: locale,
          warn: (message: string) => {
            const ids = warnings.get(message) ?? [];
            if (!ids.includes(id)) ids.push(id);
            warnings.set(message, ids);
          },
        });

        // Avec `prepare`, le cache porte aussi sur le frontmatter préparé :
        // une préparation qui change (repli retiré, nouvelle règle) revalide.
        // Un résultat qui ne se sérialise pas n'est jamais tenu pour inchangé.
        let prepared: string | null = '';
        if (prepares.length > 0) {
          try {
            prepared = `\n${JSON.stringify(data)}`;
          } catch {
            prepared = null;
          }
        }
        const digest = context.generateDigest(`${found.file}\n${contents}${prepared ?? ''}`);
        const existing = context.store.get(id);
        if (prepared !== null && existing !== undefined && existing.digest === digest && existing.filePath === filePath) {
          // Ce que fait `glob()` pour une entrée inchangée : redéclarer ses
          // images au graphe de modules. La méthode n'est pas dans le type
          // public de `DataStore`, d'où l'appel optionnel.
          const store = context.store as typeof context.store & {
            addAssetImports?: (assets: string[], filePath: string) => void;
          };
          if (existing.assetImports?.length) store.addAssetImports?.(existing.assetImports, filePath);
          return 'unchanged';
        }

        const parsed = await context.parseData({ id, data, filePath: abs });
        const rendered = render ? await context.renderMarkdown(content, { fileURL: pathToFileURL(abs) }) : undefined;
        context.store.set({
          id,
          data: parsed,
          body: content,
          filePath,
          digest,
          ...(rendered !== undefined ? { rendered } : {}),
          ...(rendered?.metadata?.imagePaths?.length ? { assetImports: rendered.metadata.imagePaths } : {}),
        });
        return 'processed';
      };

      const flushWarnings = (warnings: Map<string, string[]>) => {
        for (const [message, ids] of warnings) {
          context.logger.warn(`${message} — ${ids.length} entrée(s) : ${listSome(ids)}`);
        }
      };

      const sync = async () => {
        const exists = await stat(base).then((s) => s.isDirectory(), () => false);
        if (!exists) {
          context.logger.warn(`Dossier de contenu introuvable : ${base}`);
          context.store.clear();
          owners = new Map();
          return;
        }
        const untouched = new Set(context.store.keys());
        const seen = new Map<string, string>();
        const warnings = new Map<string, string[]>();
        try {
          const discovered = await discover(base, locale, fallback, exclude);
          // Lectures en parallèle (PERF-010) : le reste de la boucle reste ordonné
          // — détection des collisions d'identifiant, avertissements, `store.set`.
          const files = await mapConcurrent(discovered, READ_CONCURRENCY, (found) =>
            readFile(join(found.dir, found.file), 'utf-8'),
          );
          for (const [position, found] of discovered.entries()) {
            await processEntry(found, files[position] as string, seen, untouched, warnings);
          }
          owners = new Map([...seen].map(([id, abs]) => [abs, id]));
        } finally {
          flushWarnings(warnings);
        }
        for (const id of untouched) context.store.delete(id);
      };

      /**
       * Met à jour **un seul** fichier index déjà connu (PERF-010) : on ne relit ni ne
       * retraite les autres. Rend `false` quand ce n'est pas possible sans la
       * synchronisation complète — fichier inconnu, illisible, rubrique écartée,
       * identifiant devenu autre : l'appelant retombe alors sur `sync()`.
       */
      const syncOne = async (abs: string): Promise<boolean> => {
        const id = owners.get(abs);
        if (id === undefined) return false;
        const contents = await readFile(abs, 'utf-8').catch(() => null);
        if (contents === null) return false;
        const dir = dirname(abs);
        const found: Found = {
          dir,
          path: posix(relative(base, dir)).normalize('NFC'),
          file: basename(abs),
        };
        const warnings = new Map<string, string[]>();
        let outcome: Awaited<ReturnType<typeof processEntry>>;
        try {
          outcome = await processEntry(found, contents, new Map(), new Set(), warnings, id);
        } finally {
          flushWarnings(warnings);
        }
        return outcome === 'processed' || outcome === 'unchanged';
      };

      await sync();

      const { watcher } = context;
      if (watcher === undefined) return;
      watcher.add(base);
      const relevant = (changed: string) => changed.startsWith(base) && changed.endsWith('.md');
      const onStructureChange = async (changed: string) => {
        if (!relevant(changed)) return;
        context.logger.info(`Contenu modifié : ${posix(relative(projectRoot, changed))} — rechargement`);
        await sync();
      };
      // Une édition de fichier connu ne retraite que ce fichier ; un ajout ou une
      // suppression change la découverte, donc relance la synchronisation complète.
      const onEdit = async (changed: string) => {
        if (!relevant(changed)) return;
        context.logger.info(`Contenu modifié : ${posix(relative(projectRoot, changed))} — rechargement`);
        if (!(await syncOne(changed))) await sync();
      };
      watcher.on('add', onStructureChange);
      watcher.on('change', onEdit);
      watcher.on('unlink', onStructureChange);
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
