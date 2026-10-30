/**
 * Tris de `querySeries` et `getSections` (CODE-007, #158) : l'ordre canonique
 * NFC de §1.6 plutôt qu'une collation locale, et un vrai mélange pour `random`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

type Entry = { id: string; collection: string; data: Record<string, unknown>; body: string };

const entry = (id: string, data: Record<string, unknown> = {}): Entry => ({
  id,
  collection: 'series',
  data: { title: id, draft: false, published: true, featured: false, tags: [], date: new Date('2024-01-01'), ...data },
  body: '',
});

let corpus: Entry[] = [];

vi.mock('astro:content', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getCollection: async () => corpus,
}));

const { querySeries, getSections, resetSeriesCache } = await import('../../src/helpers/index.js');

beforeEach(() => {
  resetSeriesCache();
});

describe("querySeries — sort: 'title'", () => {
  it("suit l'ordre canonique (points de code), pas la collation de la locale", async () => {
    // `localeCompare` placerait « a » avant « B » ; l'ordre canonique, « B » avant « a ».
    corpus = [entry('s1', { title: 'a' }), entry('s2', { title: 'B' }), entry('s3', { title: 'C' })];
    const { items } = await querySeries({ sort: 'title' });
    expect(items.map((s) => s.data.title)).toEqual(['B', 'C', 'a']);
  });

  it('compare en NFC : « é » décomposé et précomposé sont égaux', async () => {
    corpus = [entry('s1', { title: 'éte' }), entry('s2', { title: 'éte' })];
    const { items } = await querySeries({ sort: 'title' });
    expect(items.map((s) => s.id)).toEqual(['s1', 's2']);
  });
});

describe("querySeries — sort: 'random'", () => {
  const ids = Array.from({ length: 30 }, (_, i) => `s${String(i).padStart(2, '0')}`);
  beforeEach(() => {
    corpus = ids.map((id) => entry(id));
  });

  it('est déterministe avec une graine, et conserve tous les éléments', async () => {
    const a = (await querySeries({ sort: 'random', seed: 7 })).items.map((s) => s.id);
    const b = (await querySeries({ sort: 'random', seed: 7 })).items.map((s) => s.id);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual(ids);
  });

  it('change avec la graine, et mélange réellement', async () => {
    const a = (await querySeries({ sort: 'random', seed: 1 })).items.map((s) => s.id);
    const b = (await querySeries({ sort: 'random', seed: 2 })).items.map((s) => s.id);
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(ids);
  });

  it('sans graine, rend une permutation complète', async () => {
    const { items } = await querySeries({ sort: 'random' });
    expect(items.map((s) => s.id).sort()).toEqual(ids);
  });

  it("n'a pas de biais sensible : chaque élément atterrit en tête à peu près aussi souvent", async () => {
    corpus = ['x', 'y', 'z'].map((id) => entry(id));
    const firsts: Record<string, number> = { x: 0, y: 0, z: 0 };
    for (let seed = 1; seed <= 900; seed++) {
      const first = (await querySeries({ sort: 'random', seed })).items[0]?.id as string;
      firsts[first] = (firsts[first] ?? 0) + 1;
    }
    for (const n of Object.values(firsts)) expect(n).toBeGreaterThan(220);
  });

  it("`featured: 'first'` remonte les mis en avant, le reste reste mélangé", async () => {
    corpus = ids.map((id, i) => entry(id, { featured: i === 5 }));
    const { items } = await querySeries({ sort: 'random', seed: 3, featured: 'first' });
    expect(items[0]?.id).toBe('s05');
    expect(items.map((s) => s.id).slice(1)).not.toEqual(ids.filter((id) => id !== 's05'));
  });
});

describe('getSections', () => {
  it("trie par id dans l'ordre canonique", async () => {
    corpus = [
      entry('b', { type: 'section' }),
      entry('A', { type: 'section' }),
      entry('a', { type: 'section' }),
      entry('serie'),
    ];
    expect((await getSections()).map((s) => s.id)).toEqual(['A', 'a', 'b']);
  });
});
