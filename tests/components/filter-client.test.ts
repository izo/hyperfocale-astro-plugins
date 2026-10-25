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
