/**
 * Plusieurs collections Astro dans un même build (#237, étape 2).
 *
 * Les helpers lisaient `COLLECTION_NAME` — une constante de module figée à
 * l'import — derrière un cache scalaire. Un site multilingue qui tient une
 * collection par locale (`series` pour l'anglais, `series_fr` pour le français)
 * recevait donc la **première** collection interrogée à toutes les requêtes
 * suivantes, silencieusement : des titres anglais sur les pages françaises,
 * sans erreur ni avertissement.
 *
 * Ce que ces tests tiennent :
 *   1. chaque fonction publique accepte une collection explicite ;
 *   2. le cache est indexé par collection et ne mélange pas deux corpus ;
 *   3. l'absence d'argument garde le comportement historique.
 *
 * Le point 2 est le cœur de la régression : un cache scalaire fait passer
 * 1. et 3. tout en servant le mauvais corpus.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

type Entry = { id: string; collection: string; data: Record<string, unknown>; body: string };

const entry = (collection: string, id: string, data: Record<string, unknown> = {}): Entry => ({
  id,
  collection,
  data: { published: true, draft: false, featured: false, tags: [], ...data },
  body: '',
});

const EN: Entry[] = [
  entry('series', 'music/rennes-2024', {
    title: 'Rennes 2024', date: new Date('2024-05-01'), tags: ['concert', 'live'],
  }),
  entry('series', 'fashion/lookbook-ss24', {
    title: 'Lookbook SS24', date: new Date('2024-03-10'), tags: ['studio'],
  }),
];

const FR: Entry[] = [
  entry('series_fr', 'music/rennes-2024', {
    title: 'Rennes 2024 — édition française', date: new Date('2024-05-01'), tags: ['concert'],
  }),
];

const CORPUS: Record<string, Entry[]> = { series: EN, series_fr: FR };

// Compte les lectures réelles, par collection — c'est la preuve que le cache
// est bien indexé et pas seulement que les résultats diffèrent.
const fetches: string[] = [];

vi.mock('astro:content', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getCollection: async (name: string) => {
    fetches.push(name);
    return CORPUS[name] ?? [];
  },
}));

const {
  getSeriesList,
  getSeriesBySlug,
  querySeries,
  getAllTags,
  getAllCollections,
  resetSeriesCache,
  getCollectionFetchCount,
} = await import('../../src/helpers/index.js');

describe('helpers — collection Astro explicite', () => {
  beforeEach(() => {
    resetSeriesCache();
    fetches.length = 0;
  });

  it('sans argument, lit la collection par défaut — comportement historique', async () => {
    const list = await getSeriesList();
    expect(list.map((s) => s.id)).toEqual(['music/rennes-2024', 'fashion/lookbook-ss24']);
    expect(fetches).toEqual(['series']);
  });

  it('avec une collection explicite, lit celle-là', async () => {
    const list = await getSeriesList('series_fr');
    expect(list).toHaveLength(1);
    expect(list[0]?.data.title).toBe('Rennes 2024 — édition française');
    expect(fetches).toEqual(['series_fr']);
  });

  it('ne sert pas le corpus de la première collection à la seconde', async () => {
    const en = await getSeriesList('series');
    const fr = await getSeriesList('series_fr');

    expect(en).toHaveLength(2);
    expect(fr).toHaveLength(1);
    expect(fr[0]?.data.title).not.toBe(en[0]?.data.title);
    // Deux collections distinctes → deux lectures. Un cache scalaire n'en ferait qu'une.
    expect(fetches).toEqual(['series', 'series_fr']);
  });

  it('met en cache par collection — une seule lecture par collection', async () => {
    await getSeriesList('series');
    await getSeriesList('series');
    await getSeriesList('series_fr');
    await getSeriesList('series_fr');

    expect(fetches).toEqual(['series', 'series_fr']);
    expect(getCollectionFetchCount()).toBe(2);
  });

  it('resetSeriesCache() vide toutes les collections, pas seulement la dernière', async () => {
    await getSeriesList('series');
    await getSeriesList('series_fr');
    resetSeriesCache();
    fetches.length = 0;

    await getSeriesList('series');
    expect(fetches).toEqual(['series']);
  });

  it('getSeriesBySlug résout le même slug dans deux collections différentes', async () => {
    const en = await getSeriesBySlug('music/rennes-2024', 'series');
    const fr = await getSeriesBySlug('music/rennes-2024', 'series_fr');

    expect(en.data.title).toBe('Rennes 2024');
    expect(fr.data.title).toBe('Rennes 2024 — édition française');
  });

  it('querySeries accepte collectionName, distinct du filtre de slug `collection`', async () => {
    const fr = await querySeries({ collectionName: 'series_fr' });
    expect(fr.items).toHaveLength(1);

    // Les deux options cohabitent : `collectionName` choisit la collection,
    // `collection` filtre sur le premier segment du slug à l'intérieur.
    const enMusic = await querySeries({ collectionName: 'series', collection: 'music' });
    expect(enMusic.items.map((s) => s.id)).toEqual(['music/rennes-2024']);

    const enFashion = await querySeries({ collectionName: 'series', collection: 'fashion' });
    expect(enFashion.items.map((s) => s.id)).toEqual(['fashion/lookbook-ss24']);
  });

  it('getAllTags et getAllCollections comptent par collection', async () => {
    const tagsEn = await getAllTags('series');
    const tagsFr = await getAllTags('series_fr');
    expect(tagsEn.map((t) => t.name).sort()).toEqual(['concert', 'live', 'studio']);
    expect(tagsFr.map((t) => t.name)).toEqual(['concert']);

    const colsEn = await getAllCollections('series');
    const colsFr = await getAllCollections('series_fr');
    expect(colsEn.map((c) => c.slug).sort()).toEqual(['fashion', 'music']);
    expect(colsFr.map((c) => c.slug)).toEqual(['music']);
  });

  it('une collection inconnue rend une liste vide, sans lever', async () => {
    await expect(getSeriesList('series_xx')).resolves.toEqual([]);
  });
});
