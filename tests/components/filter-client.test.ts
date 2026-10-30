/**
 * Script client de `SeriesFilter` exécuté pour de vrai (#136, W4 de la revue de #139).
 *
 * Le HTML vient du composant (API container), le DOM de happy-dom : on vérifie
 * ce que voit un visiteur — entrées masquées, compteur, événement — et non la
 * seule présence du JSON (déjà couverte par render.test.ts). Avant la 0.23.0, le
 * JSON n'était pas rendu et le filtre restait inerte sans qu'aucun test le voie.
 *
 * L'environnement reste `node` (le container d'Astro en a besoin) ; happy-dom
 * fournit une `Window` dont on prête `FormData`, `CustomEvent`… au script le
 * temps du test.
 */
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import SeriesFilter from '../../src/components/SeriesFilter.astro';
import { initSeriesFilter } from '../../src/components/filter-client.js';

const series = (id: string, data: Record<string, unknown>) => ({ id, collection: 'series', body: '', data: { title: id, ...data } });
const SERIES = [
  series('bretagne', { title: 'Bretagne', date: new Date('2024-03-01T00:00:00Z'), tags: ['mer', 'ouest'], location: 'Brest' }),
  series('alpes', { title: 'Alpes', date: new Date('2022-07-14T00:00:00Z'), tags: ['montagne'], location: 'Chamonix' }),
  series('cotentin', { title: 'Cotentin', date: new Date('2024-09-01T00:00:00Z'), tags: ['mer'], location: 'Cherbourg' }),
];

let html: string;
let htmlEn: string;
beforeAll(async () => {
  const container = await AstroContainer.create();
  html = await container.renderToString(SeriesFilter, { props: { series: SERIES } });
  htmlEn = await container.renderToString(SeriesFilter, { props: { series: SERIES, locale: 'en' } });
});

const GLOBALS = ['FormData', 'CustomEvent', 'Event', 'HTMLInputElement'] as const;
const saved = new Map<string, unknown>();
afterEach(() => {
  for (const [key, value] of saved) (globalThis as Record<string, unknown>)[key] = value;
  saved.clear();
});

function mount(markup: string) {
  const window = new Window({ url: 'https://example.test/series/' });
  for (const key of GLOBALS) {
    saved.set(key, (globalThis as Record<string, unknown>)[key]);
    (globalThis as Record<string, unknown>)[key] = (window as unknown as Record<string, unknown>)[key];
  }
  const document = window.document;
  document.body.innerHTML = markup;
  const events: string[][] = [];
  document.addEventListener('hf:filter-change', (e) =>
    events.push((e as unknown as CustomEvent<{ series: Array<{ id: string }> }>).detail.series.map((s) => s.id)),
  );
  expect(initSeriesFilter(document as unknown as Document)).toBe(true);

  const $ = <T>(selector: string) => document.querySelector(selector) as unknown as T;
  const form = $<HTMLFormElement>('#hf-filter-form');
  const visible = () =>
    [...document.querySelectorAll('#hf-filter-list [data-id]')]
      .filter((li) => !(li as unknown as HTMLElement).hidden)
      .map((li) => li.getAttribute('data-id'));
  const count = () => $<HTMLElement>('#hf-filter-count').textContent;
  const fire = (target: unknown, type: 'change' | 'input') =>
    (target as EventTarget).dispatchEvent(new window.Event(type, { bubbles: true }) as unknown as Event);
  const tag = (value: string) => $<HTMLInputElement>(`input[name="tag"][value="${value}"]`);
  return { window, document, form, visible, count, fire, tag, $, events };
}

describe('SeriesFilter — script client (happy-dom)', () => {
  it('sans filtre : tout est visible, compteur vide', () => {
    const { visible, count } = mount(html);
    expect(visible()).toEqual(['bretagne', 'alpes', 'cotentin']);
    expect(count()).toBe('');
  });

  it('tag : masque les séries sans le tag, compteur au pluriel (fr)', () => {
    const { visible, count, fire, tag, events } = mount(html);
    tag('mer').checked = true;
    fire(tag('mer'), 'change');
    expect(visible()).toEqual(['bretagne', 'cotentin']);
    expect(count()).toBe('2 séries affichées sur 3');
    expect(events.at(-1)).toEqual(['bretagne', 'cotentin']);
  });

  it('plusieurs tags : intersection ; singulier quand une seule reste', () => {
    const { visible, count, fire, tag } = mount(html);
    tag('mer').checked = true;
    tag('ouest').checked = true;
    fire(tag('ouest'), 'change');
    expect(visible()).toEqual(['bretagne']);
    expect(count()).toBe('1 série affichée sur 3');
  });

  it('année', () => {
    const { visible, fire, $ } = mount(html);
    const year = $<HTMLSelectElement>('#hf-filter-year');
    year.value = '2024';
    fire(year, 'change');
    expect(visible()).toEqual(['bretagne', 'cotentin']);
  });

  it('lieu : saisie, insensible à la casse', () => {
    const { visible, fire, $ } = mount(html);
    const input = $<HTMLInputElement>('#hf-filter-location');
    input.value = '  CHER ';
    fire(input, 'input');
    expect(visible()).toEqual(['cotentin']);
  });

  it('aucune correspondance : liste vide, compteur à zéro (en)', () => {
    const { visible, count, fire, $ } = mount(htmlEn);
    const input = $<HTMLInputElement>('#hf-filter-location');
    input.value = 'Lyon';
    fire(input, 'input');
    expect(visible()).toEqual([]);
    expect(count()).toBe('0 series shown of 3');
  });

  it('réinitialisation : tout réapparaît', async () => {
    const { visible, count, fire, tag, form } = mount(html);
    tag('montagne').checked = true;
    fire(tag('montagne'), 'change');
    expect(visible()).toEqual(['alpes']);
    form.reset();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(visible()).toEqual(['bretagne', 'alpes', 'cotentin']);
    expect(count()).toBe('');
  });

  it('balisage incomplet : ne lève pas, rend false', () => {
    const window = new Window();
    window.document.body.innerHTML = '<div></div>';
    expect(initSeriesFilter(window.document as unknown as Document)).toBe(false);
  });
});

describe('câblage de SeriesFilter.astro (régression #138)', () => {
  it('le <script> du composant importe et appelle initSeriesFilter', () => {
    const source = readFileSync(new URL('../../src/components/SeriesFilter.astro', import.meta.url), 'utf8');
    const script = source.slice(source.lastIndexOf('<script'));
    expect(script).toMatch(/import\s*\{\s*initSeriesFilter\s*\}\s*from\s*['"]\.\/filter-client\.js['"]/);
    expect(script).toMatch(/^\s*initSeriesFilter\(\s*\)\s*;?\s*$/m);
  });
});

describe('SeriesFilter — recherche, facettes, index distant (#136, P3)', () => {
  const custom = (id: string, data: Record<string, unknown>, collection = 'series') => ({
    id,
    collection,
    body: '',
    data: { title: id, ...data },
  });

  async function markupOf(series: unknown[], extra: Record<string, unknown> = {}) {
    const container = await AstroContainer.create();
    return container.renderToString(SeriesFilter, { props: { series, ...extra } as never });
  }

  it('recherche plein texte : insensible à la casse et aux accents, sur la description', async () => {
    const markup = await markupOf([
      custom('cotes', { title: 'Sauvages', description: 'Côtes sauvages' }),
      custom('plaines', { title: 'Plaines', description: 'Champs ouverts' }),
    ]);
    const { visible, fire, $ } = mount(markup);
    const search = $<HTMLInputElement>('#hf-filter-search');
    search.value = 'COTES sauv';
    fire(search, 'input');
    expect(visible()).toEqual(['cotes']);
    search.value = 'champs ouverts';
    fire(search, 'input');
    expect(visible()).toEqual(['plaines']);
  });

  it('facette collection : liste déroulante, filtre sur la collection', async () => {
    const markup = await markupOf([
      custom('a', { title: 'A' }, 'archives'),
      custom('b', { title: 'B' }, 'series'),
      custom('c', { title: 'C' }, 'archives'),
    ], { filters: ['collection'] });
    const { visible, fire, $ } = mount(markup);
    const select = $<HTMLSelectElement>('#hf-filter-collection');
    expect(select).not.toBeNull();
    select.value = 'archives';
    fire(select, 'change');
    expect(visible()).toEqual(['a', 'c']);
  });

  it('facette visibilité : n’apparaît qu’avec une série privée, filtre public / privé', async () => {
    const markup = await markupOf([
      custom('pub', { title: 'Pub' }),
      custom('priv', { title: 'Priv', private: true }),
    ], { filters: ['visibility'] });
    const { visible, fire, $ } = mount(markup);
    const select = $<HTMLSelectElement>('#hf-filter-visibility');
    select.value = 'private';
    fire(select, 'change');
    expect(visible()).toEqual(['priv']);
    select.value = 'public';
    fire(select, 'change');
    expect(visible()).toEqual(['pub']);
  });

  it('sans série privée, la facette visibilité ne s’affiche pas', async () => {
    const markup = await markupOf([custom('pub', { title: 'Pub' })], { filters: ['visibility'] });
    expect(markup).not.toContain('id="hf-filter-visibility"');
  });

  describe('index distant', () => {
    const realFetch = globalThis.fetch;
    afterEach(() => {
      globalThis.fetch = realFetch;
    });

    it('chargé à la première interaction, puis la liste est rendue depuis le <template>', async () => {
      const markup = await markupOf([custom('local', { title: 'Locale' })], { indexUrl: 'https://idx.example/index.json' });
      const index = [
        { id: 'x1', title: 'Première', date: 2021, tags: ['mer'], location: 'Brest', url: '/series/x1/' },
        { id: 'x2', title: 'Deuxième', date: null, tags: [], location: null, url: '/series/x2/' },
      ];
      const calls: string[] = [];
      globalThis.fetch = (async (url: string) => {
        calls.push(url);
        return { ok: true, json: async () => index } as unknown as Response;
      }) as typeof fetch;

      const { visible, fire, $, document, count } = mount(markup);
      expect(calls).toEqual([]);
      fire($<HTMLInputElement>('#hf-filter-search'), 'input');
      await new Promise((resolve) => setTimeout(resolve, 5));

      expect(calls).toEqual(['https://idx.example/index.json']);
      expect(visible()).toEqual(['x1', 'x2']);
      expect(document.querySelector('[data-id="x1"] .hf-filter__title')?.textContent).toBe('Première');
      expect(document.querySelector('[data-id="x1"] .hf-filter__meta')?.textContent).toBe('2021 · Brest');
      expect(document.querySelector('[data-id="x2"] .hf-filter__chips')).toBeNull();
      expect(count()).toBe('');
    });

    it('un titre venu de l’index reste du texte : aucun élément créé', async () => {
      const markup = await markupOf([], { indexUrl: 'https://idx.example/index.json' });
      globalThis.fetch = (async () =>
        ({
          ok: true,
          json: async () => [{ id: 'evil', title: '<img src=x onerror=alert(1)>', date: null, tags: [], location: null, url: '/s/evil/' }],
        }) as unknown as Response) as typeof fetch;
      const { fire, $, document } = mount(markup);
      fire($<HTMLInputElement>('#hf-filter-search'), 'input');
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(document.querySelector('[data-id="evil"] .hf-filter__title')?.textContent).toBe('<img src=x onerror=alert(1)>');
      expect(document.querySelector('[data-id="evil"] img')).toBeNull();
    });

    it('échec du chargement : la liste rendue au serveur reste, sans erreur', async () => {
      const markup = await markupOf([custom('local', { title: 'Locale' })], { indexUrl: 'https://idx.example/index.json' });
      globalThis.fetch = (async () => {
        throw new Error('réseau');
      }) as typeof fetch;
      const { visible, fire, $ } = mount(markup);
      fire($<HTMLInputElement>('#hf-filter-search'), 'input');
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(visible()).toEqual(['local']);
    });
  });
});
