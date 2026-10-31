/**
 * Loader Content Layer — `@regrets/hyperfocale/loader` (#130).
 *
 * Le loader est exercé sur les corpus de fixtures de la spec, rangés hors de
 * `src/content/` (tests/fixtures/spec-ingestion/corpora/), avec un
 * `LoaderContext` minimal : un store en mémoire et un `parseData` qui applique
 * `baseSeriesSchema`, comme le ferait Astro avec le schéma de la collection.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { LoaderContext } from 'astro/loaders';
import { z } from 'zod';
import { fallbackField, seriesLoader, stringifyTags } from '../../src/loader.js';
import type { SeriesLoaderOptions, SeriesPrepare, SeriesPrepareContext } from '../../src/loader.js';
import { baseSeriesSchema } from '../../src/schema.js';
import { parseFrontmatter as parseCore } from '../../src/ingest/frontmatter.js';

const FIXTURES = resolve(__dirname, '../fixtures/spec-ingestion');
const ROOT = resolve(__dirname, '../..');

interface StoredEntry {
  id: string;
  data: Record<string, unknown>;
  body?: string;
  filePath?: string;
  digest?: string | number;
  rendered?: { html: string };
  assetImports?: string[];
}

interface Schema {
  safeParse(data: unknown): { success: true; data: unknown } | { success: false; error: { issues: Array<{ message: string }> } };
}

function makeContext(root = ROOT, schema: Schema = baseSeriesSchema({ dateRequired: true })) {
  const entries = new Map<string, StoredEntry>();
  const parseData = vi.fn(async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
    const result = schema.safeParse(data);
    if (!result.success) throw new Error(`${id} : ${result.error.issues.map((i) => i.message).join(' ; ')}`);
    return result.data as Record<string, unknown>;
  });
  const renderMarkdown = vi.fn(async (content: string) => ({ html: `<p>${content.trim()}</p>`, metadata: {} }));
  const context = {
    collection: 'series',
    config: { root: pathToFileURL(`${root}/`) },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    store: {
      get: (id: string) => entries.get(id),
      set: (entry: StoredEntry) => {
        entries.set(entry.id, entry);
        return true;
      },
      delete: (id: string) => void entries.delete(id),
      keys: () => [...entries.keys()],
      clear: () => entries.clear(),
      has: (id: string) => entries.has(id),
    },
    parseData,
    renderMarkdown,
    generateDigest: (value: string) => {
      let hash = 0;
      for (let i = 0; i < value.length; i++) hash = (Math.imul(hash, 31) + value.charCodeAt(i)) | 0;
      return String(hash);
    },
  };
  return { context: context as unknown as LoaderContext, entries, parseData, renderMarkdown, logger: context.logger };
}

async function load(corpus: string, options: Omit<SeriesLoaderOptions, 'base'> = {}, schema?: Schema) {
  const ctx = makeContext(ROOT, schema);
  await seriesLoader({ base: join(FIXTURES, 'corpora', corpus), ...options }).load(ctx.context);
  return ctx;
}

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Corpus temporaire : `{ 'a/index.md': '…' }`. */
function corpus(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'hf-loader-'));
  temps.push(dir);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

describe('seriesLoader — découverte (§1.2)', () => {
  it('minimal : une entrée, identifiant = chemin du dossier, filePath relatif au projet', async () => {
    const { entries, parseData } = await load('minimal');
    expect([...entries.keys()]).toEqual(['series/bretagne-2024']);
    const entry = entries.get('series/bretagne-2024')!;
    expect(entry.data.title).toBe('Bretagne 2024');
    expect(entry.data.date).toEqual(new Date('2024-06-15'));
    expect(entry.filePath).toBe('tests/fixtures/spec-ingestion/corpora/minimal/series/bretagne-2024/index.md');
    expect(entry.body).toContain('Texte libre');
    expect(entry.rendered?.html).toContain('Texte libre');
    expect(parseData).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'series/bretagne-2024', filePath: expect.stringMatching(/bretagne-2024\/index\.md$/) }),
    );
  });

  it('nested : toute profondeur, sections, conteneur et sous-séries ; jamais media/', async () => {
    const { entries } = await load('nested');
    expect([...entries.keys()]).toEqual([
      'index',
      'archives/festivals/printemps-bourges-2008',
      'archives/festivals/printemps-bourges-2008/the-kooks',
      'archives/festivals/printemps-bourges-2008/the-wombats',
      'archives/music',
      'archives/music/concerts',
      'archives/music/concerts/2010/the-wombats-paris-2010',
    ]);
    expect(entries.get('archives/music')?.data.type).toBe('section');
  });

  it('exclusions §4.2 et règles du site', async () => {
    const dir = corpus({
      'a/index.md': '---\ntitle: A\ndate: 2024-01-01\n---\n',
      '.cache/b/index.md': '---\ntitle: B\ndate: 2024-01-01\n---\n',
      '_todo/c/index.md': '---\ntitle: C\ndate: 2024-01-01\n---\n',
      'a/media/d/index.md': '---\ntitle: D\ndate: 2024-01-01\n---\n',
    });
    const ctx = makeContext();
    await seriesLoader({ base: dir, exclude: ['_todo/'] }).load(ctx.context);
    expect([...ctx.entries.keys()]).toEqual(['a']);
  });

  it('base absente : avertissement, collection vide', async () => {
    const { entries, logger } = await load('n-existe-pas');
    expect(entries.size).toBe(0);
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});

describe('seriesLoader — repli de locale (Annexe F, stratégie 2)', () => {
  const title = async (options: Omit<SeriesLoaderOptions, 'base'>) =>
    (await load('i18n', options)).entries.get('series/bretagne-2024')?.data.title;

  it('sans locale : index.md', async () => {
    expect(await title({})).toBe('Bretagne 2024');
  });

  it('locale présente : index.<locale>.md', async () => {
    expect(await title({ locale: 'en' })).toBe('Brittany 2024');
    expect(await title({ locale: 'pt-BR' })).toBe('Bretanha 2024');
  });

  it('locale absente du dossier : repli sur index.md', async () => {
    expect(await title({ locale: 'es' })).toBe('Bretagne 2024');
  });

  it('fallback: false : pas de repli', async () => {
    expect(await title({ locale: 'es', fallback: false })).toBeUndefined();
  });

  it('une seule entrée par dossier, quelle que soit la locale ; index.english.md n\'est pas un fichier index', async () => {
    for (const locale of [undefined, 'en', 'pt-BR']) {
      const { entries } = await load('i18n', locale === undefined ? {} : { locale });
      expect([...entries.keys()]).toEqual(['series/bretagne-2024']);
    }
  });

  it('locale invalide : erreur à la déclaration', () => {
    expect(() => seriesLoader({ base: '.', locale: 'EN' })).toThrow(/locale/);
    expect(() => seriesLoader({ base: '.', locale: 'english' })).toThrow(/locale/);
  });

  it('dossier sans index.md : absent de la collection par défaut, présent dans sa locale', async () => {
    expect((await load('invalid-index-default-missing')).entries.size).toBe(0);
    expect((await load('invalid-index-default-missing', { locale: 'en' })).entries.size).toBe(1);
  });
});

describe('seriesLoader — frontmatter et schéma', () => {
  it('passthrough de tout le frontmatter, champs inconnus compris (§1.3, §2.0)', async () => {
    const dir = corpus({
      'concerts/la-rumeur/index.md': [
        '---',
        'title: La Rumeur',
        'date: 2005-02-24',
        'artist: La Rumeur',
        'genres: [rap]',
        'updated: 2026-10-01',
        'lineup_order: 2',
        'images:',
        '  - url: https://cdn.example.com/01.jpg',
        'spip_urls: [a, b]',
        '---',
        'Corps.',
      ].join('\n'),
    });
    const ctx = makeContext();
    await seriesLoader({ base: dir }).load(ctx.context);
    const data = ctx.entries.get('concerts/la-rumeur')!.data;
    expect(data).toMatchObject({
      artist: 'La Rumeur',
      genres: ['rap'],
      lineup_order: 2,
      images: [{ url: 'https://cdn.example.com/01.jpg' }],
      spip_urls: ['a', 'b'],
    });
    expect(data.updated).toBeInstanceOf(Date);
  });

  it('blocs de profil transmis (G.12)', async () => {
    const { entries } = await load('originals');
    const data = entries.get('projects/mariage-dupont-2026')!.data as { project: { client: string }; draft: boolean };
    expect(data.project.client).toBe('Famille Dupont');
    expect(data.draft).toBe(true);
  });

  it('une entrée que le schéma refuse fait échouer le chargement', async () => {
    await expect(load('invalid-title-missing')).rejects.toThrow(/series\/bretagne-2024/);
  });

  it('render: false garde le body sans le rendre', async () => {
    const { entries, renderMarkdown } = await load('minimal', { render: false });
    expect(entries.get('series/bretagne-2024')?.rendered).toBeUndefined();
    expect(entries.get('series/bretagne-2024')?.body).toContain('Texte libre');
    expect(renderMarkdown).not.toHaveBeenCalled();
  });

  it('generateId : identifiant du site, collision refusée', async () => {
    const dir = corpus({
      'a/x/index.md': '---\ntitle: A\ndate: 2024-01-01\n---\n',
      'b/x/index.md': '---\ntitle: B\ndate: 2024-01-01\n---\n',
    });
    const byFolder = makeContext();
    await seriesLoader({ base: dir, generateId: ({ path }) => path.replace('/', '--') }).load(byFolder.context);
    expect([...byFolder.entries.keys()]).toEqual(['a--x', 'b--x']);

    const bySlug = makeContext();
    await expect(
      seriesLoader({ base: dir, generateId: ({ path }) => path.split('/').pop()! }).load(bySlug.context),
    ).rejects.toThrow(/« x »/);
  });
});

describe('seriesLoader — rechargement', () => {
  it('une entrée inchangée n\'est pas revalidée ; une entrée disparue est retirée', async () => {
    const dir = corpus({
      'a/index.md': '---\ntitle: A\ndate: 2024-01-01\n---\n',
      'b/index.md': '---\ntitle: B\ndate: 2024-01-01\n---\n',
    });
    const ctx = makeContext();
    const loader = seriesLoader({ base: dir });
    await loader.load(ctx.context);
    expect(ctx.parseData).toHaveBeenCalledTimes(2);

    rmSync(join(dir, 'b'), { recursive: true });
    writeFileSync(join(dir, 'a/index.md'), '---\ntitle: A2\ndate: 2024-01-01\n---\n');
    await loader.load(ctx.context);
    expect([...ctx.entries.keys()]).toEqual(['a']);
    expect(ctx.entries.get('a')?.data.title).toBe('A2');
    expect(ctx.parseData).toHaveBeenCalledTimes(3);

    await loader.load(ctx.context);
    expect(ctx.parseData).toHaveBeenCalledTimes(3);
  });

  it('le changement de fichier retenu (index.md → index.en.md) recharge l\'entrée', async () => {
    const dir = corpus({ 'a/index.md': '---\ntitle: A\ndate: 2024-01-01\n---\n' });
    const ctx = makeContext();
    const loader = seriesLoader({ base: dir, locale: 'en' });
    await loader.load(ctx.context);
    writeFileSync(join(dir, 'a/index.en.md'), '---\ntitle: A en\ndate: 2024-01-01\n---\n');
    await loader.load(ctx.context);
    expect(ctx.entries.get('a')?.data.title).toBe('A en');
  });
});

/** Schéma qui accepte tout : pour observer le loader sans juger le contenu. */
const permissive: Schema = z.looseObject({});

/**
 * Contrat d'un site qui exige ce que la spec laisse facultatif — celui de
 * mathieu-drouet.com : `series_id` (clé primaire de ses apps), `description`,
 * des tags textuels.
 */
const siteSchema: Schema = baseSeriesSchema({ dateRequired: true }).safeExtend({
  series_id: z.string().min(1),
  description: z.string(),
  tags: z.array(z.string()).default([]),
});

/** Les replis de mathieu-drouet.com (#135), avec les préparations fournies. */
const siteFallbacks: SeriesPrepare[] = [
  fallbackField('series_id', (_, { slug }: SeriesPrepareContext) => slug, {
    warn: 'series_id absent — repli sur le nom du dossier',
  }),
  fallbackField('description', ''),
  stringifyTags(),
];

describe('seriesLoader — prepare (#135)', () => {
  it('contexte : id, chemin, slug, fichier lu, locale résolue', async () => {
    const seen: Array<Omit<SeriesPrepareContext, 'warn'>> = [];
    const spy: SeriesPrepare = (data, { warn: _warn, ...ctx }) => {
      seen.push(ctx);
      return data;
    };
    await load('i18n', { prepare: spy });
    await load('i18n', { locale: 'en', prepare: spy });
    await load('i18n', { locale: 'es', prepare: spy });
    const common = {
      id: 'series/bretagne-2024',
      path: 'series/bretagne-2024',
      slug: 'bretagne-2024',
    };
    const at = (file: string) => `tests/fixtures/spec-ingestion/corpora/i18n/series/bretagne-2024/${file}`;
    expect(seen).toEqual([
      { ...common, file: 'index.md', filePath: at('index.md'), locale: undefined, collectionLocale: undefined },
      { ...common, file: 'index.en.md', filePath: at('index.en.md'), locale: 'en', collectionLocale: 'en' },
      // Repli : la collection est en `es`, le fichier lu est `index.md`.
      { ...common, file: 'index.md', filePath: at('index.md'), locale: undefined, collectionLocale: 'es' },
    ]);
  });

  it('id de generateId ; slug vide pour la racine de base', async () => {
    const ids: Array<[string, string, string]> = [];
    await load('nested', {
      generateId: ({ path }) => (path === '' ? 'racine' : path.replaceAll('/', '--')),
      prepare: (data, { id, path, slug }) => {
        ids.push([id, path, slug]);
        return data;
      },
    }, permissive);
    expect(ids).toContainEqual(['racine', '', '']);
    expect(ids).toContainEqual(['archives--music--concerts--2010--the-wombats-paris-2010', 'archives/music/concerts/2010/the-wombats-paris-2010', 'the-wombats-paris-2010']);
  });

  it('s\'exécute avant la validation : un repli rend valide une entrée que le schéma refusait', async () => {
    // Sans prepare, `invalid-title-missing` fait échouer le chargement (voir plus haut).
    const prepare = vi.fn<SeriesPrepare>((data) => (typeof data.title === 'string' && data.title.trim() !== '' ? data : { ...data, title: 'Sans titre' }));
    const { entries, parseData } = await load('invalid-title-missing', { prepare });
    expect([...entries.keys()].sort()).toEqual(['series/bretagne-2024', 'series/titre-vide-2024']);
    for (const entry of entries.values()) expect(entry.data.title).toBe('Sans titre');
    // Ordre d'appel : chaque prepare précède le parseData de la même entrée,
    // et parseData reçoit le frontmatter préparé.
    expect(prepare).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 2; i++) {
      expect(prepare.mock.invocationCallOrder[i]).toBeLessThan(parseData.mock.invocationCallOrder[i]!);
      expect(parseData.mock.calls[i]![0].data).toBe(prepare.mock.results[i]!.value);
    }
  });

  it('une liste de préparations s\'applique dans l\'ordre ; une préparation peut être asynchrone', async () => {
    const { entries } = await load('minimal', {
      prepare: [
        async (data) => ({ ...data, trace: ['a'] }),
        (data) => ({ ...data, trace: [...(data.trace as string[]), 'b'] }),
      ],
    });
    expect(entries.get('series/bretagne-2024')?.data.trace).toEqual(['a', 'b']);
  });

  it('une préparation qui lève fait échouer l\'entrée, avec son chemin', async () => {
    const boom = new Error('champ illisible');
    const failing = load('minimal', {
      prepare: () => {
        throw boom;
      },
    });
    await expect(failing).rejects.toThrow(
      'prepare a échoué sur tests/fixtures/spec-ingestion/corpora/minimal/series/bretagne-2024/index.md (« series/bretagne-2024 ») — champ illisible',
    );
    await expect(failing).rejects.toMatchObject({ cause: boom });
  });

  it('une préparation qui ne rend pas un objet fait échouer l\'entrée', async () => {
    for (const value of [undefined, null, [], 'x']) {
      await expect(load('minimal', { prepare: () => value as never })).rejects.toThrow(/prepare doit rendre un objet — .*bretagne-2024\/index\.md/);
    }
  });

  it('avertissements regroupés : un par message, avec le nombre et les identifiants', async () => {
    const { logger } = await load('invalid-title-missing', {
      prepare: (data, { warn, slug }) => {
        warn('titre absent');
        if (slug === 'bretagne-2024') warn('autre');
        warn('titre absent');
        return { ...data, title: 'T' };
      },
    });
    expect(logger.warn.mock.calls).toEqual([
      ['titre absent — 2 entrée(s) : series/bretagne-2024, series/titre-vide-2024'],
      ['autre — 1 entrée(s) : series/bretagne-2024'],
    ]);
  });

  it('avertissements émis même si une entrée suivante échoue', async () => {
    const dir = corpus({
      'a/index.md': '---\ntitle: A\ndate: 2024-01-01\n---\n',
      'b/index.md': '---\ndate: 2024-01-01\n---\n',
    });
    const ctx = makeContext();
    await expect(
      seriesLoader({ base: dir, prepare: (data, { warn }) => (warn('vu'), data) }).load(ctx.context),
    ).rejects.toThrow(/b/);
    expect(ctx.logger.warn).toHaveBeenCalledWith('vu — 2 entrée(s) : a, b');
  });

  it('cache : revalidation quand le résultat de prepare change, avertissement à chaque chargement', async () => {
    const dir = corpus({ 'a/index.md': '---\ntitle: A\ndate: 2024-01-01\n---\n' });
    const ctx = makeContext();
    let suffix = '';
    const loader = seriesLoader({
      base: dir,
      prepare: (data, { warn }) => {
        warn('repli');
        return { ...data, title: `${String(data.title)}${suffix}` };
      },
    });
    await loader.load(ctx.context);
    await loader.load(ctx.context);
    expect(ctx.parseData).toHaveBeenCalledTimes(1);
    expect(ctx.logger.warn).toHaveBeenCalledTimes(2);

    suffix = ' (corrigé)';
    await loader.load(ctx.context);
    expect(ctx.parseData).toHaveBeenCalledTimes(2);
    expect(ctx.entries.get('a')?.data.title).toBe('A (corrigé)');
  });
});

describe('seriesLoader — préparations fournies', () => {
  const ctx = (warn = vi.fn()): SeriesPrepareContext => ({
    id: 'music/concerts/la-rumeur',
    path: 'music/concerts/la-rumeur',
    slug: 'la-rumeur',
    file: 'index.md',
    filePath: 'content/music/concerts/la-rumeur/index.md',
    locale: undefined,
    collectionLocale: undefined,
    warn,
  });

  it('fallbackField : absent, null ou vide → repli signalé ; présent → inchangé', async () => {
    const step = fallbackField('series_id', (_: unknown, { slug }: SeriesPrepareContext) => slug);
    for (const data of [{}, { series_id: null }, { series_id: '' }, { series_id: '  ' }]) {
      const warn = vi.fn();
      expect(await step(data, ctx(warn))).toEqual({ series_id: 'la-rumeur' });
      expect(warn).toHaveBeenCalledWith('`series_id` absent — valeur de repli appliquée');
    }
    const warn = vi.fn();
    const data = { series_id: 'lr-2005' };
    expect(await step(data, ctx(warn))).toBe(data);
    expect(warn).not.toHaveBeenCalled();
  });

  it('fallbackField : valeur fixe, message propre ou silence ; le frontmatter reçu n\'est pas modifié', async () => {
    const data = { title: 'T' };
    const warn = vi.fn();
    expect(await fallbackField('description', '', { warn: 'sans description' })(data, ctx(warn))).toEqual({ title: 'T', description: '' });
    expect(warn).toHaveBeenCalledWith('sans description');
    expect(data).toEqual({ title: 'T' });

    const quiet = vi.fn();
    await fallbackField('description', '', { warn: false })({}, ctx(quiet));
    expect(quiet).not.toHaveBeenCalled();
  });

  it('stringifyTags : nombres et booléens en chaînes, signalé ; le reste au schéma', async () => {
    const date = new Date('2004-05-01');
    const warn = vi.fn();
    expect(await stringifyTags()({ tags: [2004, 'live', true, date] }, ctx(warn))).toEqual({ tags: ['2004', 'live', 'true', date] });
    expect(warn).toHaveBeenCalledWith('`tags` : valeurs non textuelles converties en chaînes');

    const untouched = vi.fn();
    const data = { tags: ['live'] };
    expect(await stringifyTags()(data, ctx(untouched))).toBe(data);
    expect(await stringifyTags()({ tags: 2004 }, ctx(untouched))).toEqual({ tags: 2004 });
    expect(untouched).not.toHaveBeenCalled();

    expect(await stringifyTags({ field: 'genres', warn: false })({ genres: [1] }, ctx(untouched))).toEqual({ genres: ['1'] });
    expect(untouched).not.toHaveBeenCalled();
  });

  it('bout à bout : tags YAML numériques, series_id et description absents', async () => {
    const dir = corpus({
      'concerts/la-rumeur-2005/index.md': '---\ntitle: La Rumeur\ndate: 2005-02-24\ntags:\n  - 2005\n  - rap\n---\n',
      'concerts/iam-2006/index.md': '---\ntitle: IAM\ndate: 2006-03-01\nseries_id: iam-2006-marseille\ndescription: Marseille\n---\n',
    });
    const without = makeContext(ROOT, siteSchema);
    await expect(seriesLoader({ base: dir }).load(without.context)).rejects.toThrow(/la-rumeur-2005/);

    const ctx = makeContext(ROOT, siteSchema);
    await seriesLoader({ base: dir, prepare: siteFallbacks }).load(ctx.context);
    expect(ctx.entries.get('concerts/la-rumeur-2005')?.data).toMatchObject({ series_id: 'la-rumeur-2005', description: '', tags: ['2005', 'rap'] });
    expect(ctx.entries.get('concerts/iam-2006')?.data).toMatchObject({ series_id: 'iam-2006-marseille', description: 'Marseille' });
    expect(ctx.logger.warn.mock.calls.flat()).toEqual([
      'series_id absent — repli sur le nom du dossier — 1 entrée(s) : concerts/la-rumeur-2005',
      '`description` absent — valeur de repli appliquée — 1 entrée(s) : concerts/la-rumeur-2005',
      '`tags` : valeurs non textuelles converties en chaînes — 1 entrée(s) : concerts/la-rumeur-2005',
    ]);
  });
});

describe('seriesLoader — sections (§1.10, #135)', () => {
  it('défaut include : les pages d\'index de section restent dans la collection (comportement 0.21.0)', async () => {
    const { entries } = await load('nested');
    expect(entries.has('archives/music')).toBe(true);
    expect(entries.has('index')).toBe(true);
  });

  it('exclude : écartées avant generateId, prepare et parseData', async () => {
    const generateId = vi.fn(({ path }: { path: string }) => path || 'index');
    const prepare = vi.fn<SeriesPrepare>((data) => data);
    const { entries, parseData } = await load('nested', { sections: 'exclude', generateId, prepare });
    expect([...entries.keys()]).toEqual([
      'archives/festivals/printemps-bourges-2008',
      'archives/festivals/printemps-bourges-2008/the-kooks',
      'archives/festivals/printemps-bourges-2008/the-wombats',
      'archives/music/concerts/2010/the-wombats-paris-2010',
    ]);
    for (const spy of [generateId, prepare, parseData]) expect(spy).toHaveBeenCalledTimes(4);
  });

  it('exclude : une série devenue section est retirée au rechargement', async () => {
    const dir = corpus({ 'a/index.md': '---\ntitle: A\ndate: 2024-01-01\n---\n' });
    const ctx = makeContext();
    const loader = seriesLoader({ base: dir, sections: 'exclude' });
    await loader.load(ctx.context);
    expect([...ctx.entries.keys()]).toEqual(['a']);
    writeFileSync(join(dir, 'a/index.md'), '---\ntype: section\ntitle: A\n---\n');
    await loader.load(ctx.context);
    expect(ctx.entries.size).toBe(0);
  });

  it('le discriminant est `type` seul : une série sans date reste une série (invalide)', async () => {
    await expect(load('invalid-date-missing', { sections: 'exclude' })).rejects.toThrow(/series\/bretagne-2024/);
  });

  it('valeur inconnue : erreur à la déclaration', () => {
    expect(() => seriesLoader({ base: '.', sections: 'skip' as never })).toThrow(/sections/);
  });
});

/** Dossiers porteur d'un `index.md` d'un corpus, relatifs à sa racine. */
function indexFolders(root: string, rel = ''): string[] {
  const dir = join(root, rel);
  const names = readdirSync(dir);
  const here = names.includes('index.md') ? [rel] : [];
  const below = names
    .filter((n) => n !== 'media' && !n.startsWith('.') && statSync(join(dir, n)).isDirectory())
    .flatMap((n) => indexFolders(root, rel === '' ? n : `${rel}/${n}`));
  return [...here, ...below];
}

const CORPORA = readdirSync(join(FIXTURES, 'corpora')).filter((n) => statSync(join(FIXTURES, 'corpora', n)).isDirectory()).sort();

describe('seriesLoader — rejeu des corpus de la spec (#135)', () => {
  it.each(CORPORA)('%s : exclude retire exactement les `type: section`, que prepare ne voit jamais', async (name) => {
    const root = join(FIXTURES, 'corpora', name);
    // Référence indépendante du loader : le frontmatter lu en YAML 1.2 core,
    // comme la validation (§4.10).
    const all = new Map<string, boolean>();
    for (const folder of indexFolders(root)) {
      const parsed = parseCore(readFileSync(join(root, folder, 'index.md')));
      all.set(folder === '' ? 'index' : folder, parsed.status === 'ok' && parsed.data.type === 'section');
    }
    const sections = [...all].filter(([, s]) => s).map(([id]) => id);

    const include = await load(name, {}, permissive).catch(() => null);
    if (include === null) {
      // Seul un frontmatter illisible empêche la lecture (§4.10 frontmatter-invalid).
      expect(name).toBe('invalid-frontmatter-invalid');
      return;
    }
    expect([...include.entries.keys()].sort()).toEqual([...all.keys()].sort());

    const prepared: string[] = [];
    const exclude = await load(name, { sections: 'exclude', prepare: (d, { id }) => (prepared.push(id), d) }, permissive);
    const kept = [...all.keys()].filter((id) => !sections.includes(id)).sort();
    expect([...exclude.entries.keys()].sort()).toEqual(kept);
    expect(prepared.sort()).toEqual(kept);
  });

  it('au moins un corpus porte des sections', async () => {
    const { entries } = await load('nested', {}, permissive);
    expect([...entries.values()].filter((e) => e.data.type === 'section').length).toBeGreaterThan(0);
  });

  it.each(CORPORA)('%s : avec les replis du site, son contrat passe partout où passe celui de la spec', async (name) => {
    const spec = await load(name, { sections: 'exclude' }).catch(() => null);
    if (spec === null) return; // corpus invalide au sens de la spec : hors sujet
    const site = await load(name, { sections: 'exclude', prepare: siteFallbacks }, siteSchema);
    expect([...site.entries.keys()]).toEqual([...spec.entries.keys()]);
    for (const [id, entry] of site.entries) {
      const raw = spec.entries.get(id)!.data;
      expect(entry.data.series_id).toBe(raw.series_id ?? id.slice(id.lastIndexOf('/') + 1));
      expect(entry.data.description).toBe(raw.description ?? '');
    }
  });

  it('les corpus valides ne passent pas le contrat du site sans replis', async () => {
    await expect(load('minimal', { sections: 'exclude' }, siteSchema)).rejects.toThrow(/series\/bretagne-2024/);
  });
});

describe('seriesLoader — rechargement incrémental du watcher (#158, PERF-010)', () => {
  type Handler = (path: string) => Promise<void> | void;

  /** Contexte avec un watcher qui garde ses écouteurs, pour émettre les événements à la main. */
  function withWatcher(ctx: ReturnType<typeof makeContext>) {
    const handlers = new Map<string, Handler[]>();
    (ctx.context as unknown as { watcher: unknown }).watcher = {
      add: vi.fn(),
      on: (event: string, handler: Handler) => {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      },
    };
    return async (event: 'add' | 'change' | 'unlink', path: string) => {
      for (const handler of handlers.get(event) ?? []) await handler(path);
    };
  }

  const md = (title: string, extra = '') => `---\ntitle: ${title}\ndate: 2024-01-01\n${extra}---\n`;

  function setup(files: Record<string, string>, options: Omit<SeriesLoaderOptions, 'base'> = {}) {
    const dir = corpus(files);
    const ctx = makeContext();
    const prepared: string[] = [];
    const prepare: SeriesPrepare = (data, { id }) => {
      prepared.push(id);
      return data;
    };
    const emit = withWatcher(ctx);
    const loader = seriesLoader({ base: dir, prepare, ...options });
    return { dir, ctx, emit, prepared, loader };
  }

  it('l\'édition d\'un fichier connu ne retraite que ce fichier', async () => {
    const { dir, ctx, emit, prepared, loader } = setup({
      'a/index.md': md('A'),
      'b/index.md': md('B'),
      'c/index.md': md('C'),
    });
    await loader.load(ctx.context);
    expect(prepared).toEqual(['a', 'b', 'c']);

    writeFileSync(join(dir, 'b/index.md'), md('B2'));
    await emit('change', join(dir, 'b/index.md'));

    expect(prepared).toEqual(['a', 'b', 'c', 'b']);
    expect(ctx.entries.get('b')?.data.title).toBe('B2');
    expect(ctx.entries.get('a')?.data.title).toBe('A');
    expect([...ctx.entries.keys()].sort()).toEqual(['a', 'b', 'c']);
  });

  it('une édition sans effet sur le contenu ne revalide rien', async () => {
    const { dir, ctx, emit, loader } = setup({ 'a/index.md': md('A') });
    await loader.load(ctx.context);
    const parsed = ctx.parseData.mock.calls.length;
    await emit('change', join(dir, 'a/index.md'));
    expect(ctx.parseData.mock.calls.length).toBe(parsed);
  });

  it('un ajout relance la synchronisation complète', async () => {
    const { dir, ctx, emit, prepared, loader } = setup({ 'a/index.md': md('A') });
    await loader.load(ctx.context);
    mkdirSync(join(dir, 'n'));
    writeFileSync(join(dir, 'n/index.md'), md('N'));
    await emit('add', join(dir, 'n/index.md'));
    expect([...ctx.entries.keys()].sort()).toEqual(['a', 'n']);
    expect(prepared.filter((id) => id === 'a')).toHaveLength(2);
  });

  it('une suppression retire l\'entrée', async () => {
    const { dir, ctx, emit, loader } = setup({ 'a/index.md': md('A'), 'b/index.md': md('B') });
    await loader.load(ctx.context);
    rmSync(join(dir, 'b'), { recursive: true });
    await emit('unlink', join(dir, 'b/index.md'));
    expect([...ctx.entries.keys()]).toEqual(['a']);
  });

  it('un identifiant qui change retombe sur la synchronisation complète : l\'ancien disparaît', async () => {
    const { dir, ctx, emit, loader } = setup(
      { 'a/index.md': md('A', 'slug_site: un\n') },
      { generateId: ({ data }) => String(data.slug_site) },
    );
    await loader.load(ctx.context);
    expect([...ctx.entries.keys()]).toEqual(['un']);
    writeFileSync(join(dir, 'a/index.md'), md('A', 'slug_site: deux\n'));
    await emit('change', join(dir, 'a/index.md'));
    expect([...ctx.entries.keys()]).toEqual(['deux']);
  });

  it('une série devenue rubrique (sections: exclude) est retirée', async () => {
    const { dir, ctx, emit, loader } = setup(
      { 'a/index.md': md('A'), 'b/index.md': md('B') },
      { sections: 'exclude' },
    );
    await loader.load(ctx.context);
    writeFileSync(join(dir, 'b/index.md'), md('B', 'type: section\n'));
    await emit('change', join(dir, 'b/index.md'));
    expect([...ctx.entries.keys()]).toEqual(['a']);
  });

  it('un fichier hors collection ne déclenche rien de coûteux : événement ignoré', async () => {
    const { dir, ctx, emit, prepared, loader } = setup({ 'a/index.md': md('A') });
    await loader.load(ctx.context);
    await emit('change', join(dir, 'a/notes.txt'));
    expect(prepared).toEqual(['a']);
  });

  it('un fichier md inconnu (non retenu comme index) relance la synchronisation complète', async () => {
    const { dir, ctx, emit, prepared, loader } = setup({
      'a/index.md': md('A'),
      'a/index.en.md': md('A en'),
    });
    await loader.load(ctx.context);
    await emit('change', join(dir, 'a/index.en.md'));
    expect(prepared.filter((id) => id === 'a')).toHaveLength(2);
  });
});
