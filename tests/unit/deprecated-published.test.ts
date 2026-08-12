/**
 * Dépréciation de `published` — #61.
 *
 * `published: false` fait ce que fait `draft: true`, en logique inverse. La spec
 * §0.5 relevait la redondance depuis la v2.1 ; l'arbitrage retenu est de garder
 * `draft`, seul champ qu'elle standardise (§1.3), et de déprécier l'autre sans
 * le retirer — un site qui l'emploie ne doit pas casser d'une version à l'autre.
 *
 * Ce que ces tests garantissent : le champ agit encore, et il le fait savoir.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type Entry = { id: string; collection: string; data: Record<string, unknown>; body: string };

const entry = (id: string, data: Record<string, unknown> = {}): Entry => ({
  id,
  collection: 'series',
  data: { title: id, published: true, draft: false, featured: false, tags: [], ...data },
  body: '',
});

const WITH_PUBLISHED: Entry[] = [
  entry('visible', { date: new Date('2024-06-15') }),
  entry('masquee-par-published', { date: new Date('2024-06-14'), published: false }),
  entry('masquee-par-draft', { date: new Date('2024-06-13'), draft: true }),
];

// Le même corpus, migré : `published: false` remplacé par `draft: true`.
const MIGRATED: Entry[] = [
  entry('visible', { date: new Date('2024-06-15') }),
  entry('masquee-par-published', { date: new Date('2024-06-14'), draft: true }),
  entry('masquee-par-draft', { date: new Date('2024-06-13'), draft: true }),
];

// `vi.mock` est hoisté : le corpus doit être une variable que le mock relit à
// chaque appel, faute de quoi les deux cas demanderaient deux fichiers.
let corpus: Entry[] = WITH_PUBLISHED;

vi.mock('astro:content', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getCollection: async () => corpus,
}));

const { getSeriesList, querySeries, resetSeriesCache } = await import('../../src/helpers/index.js');

const silenceWarn = () => vi.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  corpus = WITH_PUBLISHED;
  resetSeriesCache();
});
afterEach(() => vi.restoreAllMocks());

describe('`published` reste agissant', () => {
  it('`published: false` masque encore, comme `draft: true`', async () => {
    silenceWarn();
    // `getSeriesList()` ne filtre qu'en production — en dev tout remonte.
    const hidden = await querySeries({ published: false });
    expect(hidden.items.map((s) => s.id)).toEqual(['masquee-par-published']);
  });

  it('`querySeries({ draft })` ignore le masquage par `published`', async () => {
    silenceWarn();
    const drafts = await querySeries({ draft: true });
    expect(drafts.items.map((s) => s.id)).toEqual(['masquee-par-draft']);
  });

  it('les deux champs se combinent sans se contredire', async () => {
    silenceWarn();
    const visible = await querySeries({});
    expect(visible.items.map((s) => s.id)).toEqual(['visible']);
  });

  it('`getSeriesList()` reste utilisable — le champ ne casse rien', async () => {
    silenceWarn();
    expect((await getSeriesList()).length).toBeGreaterThan(0);
  });
});

describe('avertissement de dépréciation', () => {
  it('nomme le remplaçant et les séries concernées', async () => {
    const warn = silenceWarn();
    await getSeriesList();
    const message = warn.mock.calls[0]?.[0] as string;
    expect(message).toContain('déprécié');
    expect(message).toContain('draft: true');
    expect(message).toContain('masquee-par-published');
  });

  it('ne se déclenche qu’une fois par build, quel que soit le nombre d’appels', async () => {
    const warn = silenceWarn();
    await getSeriesList();
    await querySeries({});
    await getSeriesList();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('reste muet sur un corpus migré', async () => {
    // Les entrées y portent `published: true` — le défaut, que Zod applique de
    // toute façon : un `true` écrit n'est plus distinguable d'un champ absent.
    // Seul `false` a un effet, donc seul `false` mérite l'avertissement.
    corpus = MIGRATED;
    resetSeriesCache();
    const warn = silenceWarn();
    await getSeriesList();
    expect(warn).not.toHaveBeenCalled();
  });

  it('le corpus migré masque exactement les mêmes séries', async () => {
    silenceWarn();
    const before = (await querySeries({})).items.map((s) => s.id);
    corpus = MIGRATED;
    resetSeriesCache();
    const after = (await querySeries({})).items.map((s) => s.id);
    expect(after).toEqual(before);
  });
});
