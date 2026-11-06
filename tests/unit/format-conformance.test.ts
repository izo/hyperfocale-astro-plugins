/**
 * Conformité de la couche 1 (format) : rejoue `fixtures/format/` de la spec,
 * copiées à une ref épinglée dans tests/fixtures/spec-format/ (`npm run
 * fixtures:sync`, jamais éditées à la main).
 *
 * - `sort-series.json`  → `getSeriesList` et `compareSeriesOrder` (§1.6, *Tri des séries*),
 *   avec une `date` qui passe par `baseSeriesSchema`, comme sous Astro ;
 * - `series-parent.json` → `getSubSeries` (§1.8, §1.10) ;
 * - `routes.json` → non rejoué : voir le `todo` en fin de fichier.
 *
 * Chaque cas du fichier devient un test : une fixture ajoutée à la spec est
 * rejouée sans toucher à ce fichier.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compareSeriesOrder } from '../../src/order.js';
import { baseSeriesSchema } from '../../src/schema.js';

type Entry = { id: string; collection: string; data: Record<string, unknown>; body: string };

let corpus: Entry[] = [];

vi.mock('astro:content', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getCollection: async () => corpus,
}));

const { getSeriesList, getSubSeries, resetSeriesCache } = await import('../../src/helpers/index.js');

const DIR = resolve(__dirname, '../fixtures/spec-format');
const fixture = <T>(file: string): T => JSON.parse(readFileSync(resolve(DIR, file), 'utf-8')) as T;

interface SortCase {
  name: string;
  description: string;
  dateRequired: boolean;
  series: Array<{ path: string; title: string; date?: string }>;
  expected: string[];
}

interface ParentCase {
  name: string;
  description: string;
  folders: Array<{ path: string; kind: 'series' | 'section' }>;
  expected: Record<string, string | null>;
}

const SORT = fixture<{ cases: SortCase[] }>('sort-series.json').cases;
const PARENT = fixture<{ cases: ParentCase[] }>('series-parent.json').cases;

/** Identifiant d'un dossier : son chemin, `index` pour la racine du corpus (comme `seriesLoader`). */
const idOf = (path: string): string => (path === '' ? 'index' : path);

beforeEach(() => {
  resetSeriesCache();
});

describe('fixtures de la couche 1 — épinglage', () => {
  it('la copie est épinglée à un commit de la spec', () => {
    const source = readFileSync(resolve(DIR, 'SOURCE'), 'utf-8');
    expect(source).toMatch(/^commit=[0-9a-f]{40}$/m);
  });

  it('chaque fichier porte des cas', () => {
    expect(SORT.length).toBeGreaterThan(0);
    expect(PARENT.length).toBeGreaterThan(0);
  });
});

describe('sort-series.json — tri des séries (§1.6)', () => {
  const entriesOf = (c: SortCase): Entry[] => {
    const schema = baseSeriesSchema({ dateRequired: c.dateRequired });
    return c.series.map((s) => ({
      id: s.path,
      collection: 'series',
      body: '',
      data: schema.parse({ title: s.title, ...(s.date !== undefined ? { date: s.date } : {}) }) as Record<string, unknown>,
    }));
  };

  for (const c of SORT) {
    describe(c.name, () => {
      it('getSeriesList rend l\'ordre attendu', async () => {
        corpus = entriesOf(c);
        expect((await getSeriesList()).map((s) => s.id)).toEqual(c.expected);
      });

      it('l\'ordre ne dépend pas de celui des entrées reçues', async () => {
        corpus = entriesOf(c).reverse();
        expect((await getSeriesList()).map((s) => s.id)).toEqual(c.expected);
      });

      it('compareSeriesOrder rend l\'ordre attendu', () => {
        expect(entriesOf(c).sort(compareSeriesOrder).map((s) => s.id)).toEqual(c.expected);
      });
    });
  }
});

describe('series-parent.json — parent d\'une série (§1.8, §1.10)', () => {
  const entriesOf = (c: ParentCase): Entry[] =>
    c.folders.map((folder) => ({
      id: idOf(folder.path),
      collection: 'series',
      body: '',
      data: { title: folder.path || 'racine', type: folder.kind, draft: false, published: true },
    }));

  for (const c of PARENT) {
    it(c.name, async () => {
      corpus = entriesOf(c);
      const series = c.folders.filter((folder) => folder.kind === 'series').map((folder) => idOf(folder.path));
      const parents: Record<string, string | null> = {};
      for (const id of series) parents[id] = null;
      for (const container of series) {
        for (const child of await getSubSeries(container)) parents[child.id] = container;
      }
      expect(parents).toEqual(c.expected);
    });
  }
});

describe('routes.json — URLs et pagination (§1.6)', () => {
  // Le plugin n'a pas de fonction pure qui résolve une URL en série ou en page de
  // galerie : le routage est celui d'Astro, par les routes injectées
  // `[...slug]/`, `[...slug]/page/[n]/` et `[...slug]/[page]/` (src/routes/*.astro),
  // dont les `getStaticPaths` dépendent de `astro:content` et des images de
  // `media/` lues par `import.meta.glob`. Rejouer ces cas exigerait de réécrire le
  // routeur dans le test — ce qui n'éprouverait pas le plugin.
  it.todo('rejouer routes.json : demande une fonction pure de résolution d\'URL, que le plugin n\'expose pas');
});
