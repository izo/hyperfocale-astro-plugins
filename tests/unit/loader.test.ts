/**
 * Loader Content Layer — `@regrets/hyperfocale/loader` (#130).
 *
 * Le loader est exercé sur les corpus de fixtures de la spec, rangés hors de
 * `src/content/` (tests/fixtures/spec-ingestion/corpora/), avec un
 * `LoaderContext` minimal : un store en mémoire et un `parseData` qui applique
 * `baseSeriesSchema`, comme le ferait Astro avec le schéma de la collection.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { LoaderContext } from 'astro/loaders';
import { seriesLoader } from '../../src/loader.js';
import type { SeriesLoaderOptions } from '../../src/loader.js';
import { baseSeriesSchema } from '../../src/schema.js';

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

function makeContext(root = ROOT) {
  const entries = new Map<string, StoredEntry>();
  const schema = baseSeriesSchema({ dateRequired: true });
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

async function load(corpus: string, options: Omit<SeriesLoaderOptions, 'base'> = {}) {
  const ctx = makeContext();
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
