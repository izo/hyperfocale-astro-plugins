/**
 * Script client de `SeriesPoll` exécuté pour de vrai (happy-dom) : le HTML vient
 * du composant (API container), le formulaire est construit par le script.
 */
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { Window } from 'happy-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import SeriesPoll from '../../src/components/SeriesPoll.astro';
import { initSeriesPolls, mountSeriesPoll, type PollOptions } from '../../src/components/poll-client.js';
import { HF_LABELS } from '../../src/i18n.js';

const IMAGES = [
  { file: 'media/a.jpg', src: '/a.jpg' },
  { file: 'media/b.jpg', src: '/b.jpg', alt: 'Portrait' },
];
const PROPS = { series: 'clients/dupont', endpoint: '/api/poll', images: IMAGES, headers: { 'X-Token': 'tok' } };

let html: string;
let htmlEn: string;
beforeAll(async () => {
  const container = await AstroContainer.create();
  html = await container.renderToString(SeriesPoll, { props: PROPS });
  htmlEn = await container.renderToString(SeriesPoll, { props: { ...PROPS, locale: 'en' } });
});

const savedFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = savedFetch;
});

type Call = { url: string; init?: RequestInit };

function mount(markup: string, { state = { submitted: false, scores: {} } as unknown, postStatus = 200 } = {}) {
  const window = new Window({ url: 'https://example.test/s/' });
  const document = window.document;
  document.body.innerHTML = markup;
  const calls: Call[] = [];
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (init?.method === 'POST') return new Response('{}', { status: postStatus });
    return new Response(JSON.stringify(state), { status: 200 });
  }) as unknown as typeof fetch;
  const events: Array<{ scores: Record<string, number>; restored: boolean }> = [];
  document.addEventListener('hf:poll-submitted', (e) => events.push((e as unknown as CustomEvent).detail));
  expect(initSeriesPolls(document as unknown as Document)).toBe(1);
  const $ = <T>(selector: string) => document.querySelector(selector) as unknown as T;
  const $$ = <T>(selector: string) => [...document.querySelectorAll(selector)] as unknown as T[];
  const rate = (index: number, score: number) => {
    const input = $$<HTMLInputElement>(`.hf-poll__item:nth-child(${index + 1}) input`)[score - 1]!;
    input.checked = true;
    input.dispatchEvent(new window.Event('change', { bubbles: true }) as unknown as Event);
  };
  const submit = () => $<HTMLFormElement>('.hf-poll__form').dispatchEvent(new window.Event('submit', { cancelable: true }) as unknown as Event);
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { document, calls, events, $, $$, rate, submit, settle };
}

describe('SeriesPoll — rendu', () => {
  it('n’émet rien sans image', async () => {
    const container = await AstroContainer.create();
    const empty = await container.renderToString(SeriesPoll, { props: { ...PROPS, images: [] } });
    expect(empty).not.toContain('data-hf-poll');
    expect(empty).not.toContain('data-hf-styles');
  });

  it('émet sa feuille, sauf unstyled', async () => {
    expect(html).toContain('data-hf-styles="poll"');
    const container = await AstroContainer.create();
    expect(await container.renderToString(SeriesPoll, { props: { ...PROPS, unstyled: true } })).not.toContain('data-hf-styles');
  });

  it('le JSON des données échappe < (une valeur ne ferme pas la balise script)', async () => {
    const container = await AstroContainer.create();
    const out = await container.renderToString(SeriesPoll, { props: { ...PROPS, series: '</script><b>' } });
    expect(out).not.toContain('</script><b>');
  });
});

describe('SeriesPoll — script client (happy-dom)', () => {
  it('au départ : invitation, formulaire fermé, état lu avec les en-têtes du site', async () => {
    const { $, calls, settle } = mount(html);
    await settle();
    expect($<HTMLElement>('.hf-poll__status').textContent).toBe(HF_LABELS.fr['poll.intro']);
    expect($<HTMLElement>('.hf-poll__closed button').textContent).toBe(HF_LABELS.fr['poll.start']);
    expect($<HTMLFormElement>('.hf-poll__form').hidden).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('/api/poll?series=clients%2Fdupont');
    expect((calls[0]!.init?.headers as Record<string, string>)['X-Token']).toBe('tok');
  });

  it('une note par image, alt de repli, légende par groupe', () => {
    const { $$ } = mount(html);
    expect($$('.hf-poll__item')).toHaveLength(2);
    expect($$('.hf-poll__item:first-child input')).toHaveLength(5);
    expect($$<HTMLImageElement>('.hf-poll__image').map((i) => i.alt)).toEqual(['Photo 1 sur 2', 'Portrait']);
    expect($$<HTMLElement>('.hf-poll__legend')[1]!.textContent).toBe('Note de la photo 2 sur 2');
  });

  it('libellés de la locale', () => {
    const { $ } = mount(htmlEn);
    expect($<HTMLElement>('.hf-poll__heading').textContent).toBe(HF_LABELS.en['poll.heading']);
    expect($<HTMLElement>('.hf-poll__closed button').textContent).toBe(HF_LABELS.en['poll.start']);
  });

  it('l’envoi reste désactivé tant qu’une image n’est pas notée, et rien ne part', async () => {
    const { $, rate, submit, calls, settle } = mount(html);
    $<HTMLButtonElement>('.hf-poll__closed button').click();
    expect($<HTMLFormElement>('.hf-poll__form').hidden).toBe(false);
    const button = $<HTMLButtonElement>('.hf-poll__form button[type="submit"]');
    expect(button.disabled).toBe(true);
    rate(0, 4);
    expect(button.disabled).toBe(true);
    expect($<HTMLElement>('.hf-poll__progress').textContent).toBe('1 / 2 photos notées');
    submit();
    await settle();
    expect(calls.filter((c) => c.init?.method === 'POST')).toEqual([]);
  });

  it('toutes notées : envoi, confirmation, événement', async () => {
    const { $, rate, submit, calls, events, settle } = mount(html);
    $<HTMLButtonElement>('.hf-poll__closed button').click();
    rate(0, 4);
    rate(1, 2);
    expect($<HTMLButtonElement>('.hf-poll__form button[type="submit"]').disabled).toBe(false);
    submit();
    await settle();
    const post = calls.find((c) => c.init?.method === 'POST')!;
    expect(post.url).toBe('/api/poll');
    expect(JSON.parse(String(post.init!.body))).toEqual({ series: 'clients/dupont', scores: { 'media/a.jpg': 4, 'media/b.jpg': 2 } });
    expect((post.init!.headers as Record<string, string>)['X-Token']).toBe('tok');
    expect($<HTMLFormElement>('.hf-poll__form').hidden).toBe(true);
    expect($<HTMLElement>('.hf-poll__status').textContent).toBe(HF_LABELS.fr['poll.thanks']);
    expect($<HTMLElement>('.hf-poll__closed button').textContent).toBe(HF_LABELS.fr['poll.edit']);
    expect(events).toEqual([{ series: 'clients/dupont', scores: { 'media/a.jpg': 4, 'media/b.jpg': 2 }, restored: false }]);
  });

  it('échec du serveur : message d’erreur, le formulaire reste ouvert, pas d’événement', async () => {
    const { $, rate, submit, events, settle } = mount(html, { postStatus: 500 });
    $<HTMLButtonElement>('.hf-poll__closed button').click();
    rate(0, 4);
    rate(1, 2);
    submit();
    await settle();
    expect($<HTMLElement>('.hf-poll__error').hidden).toBe(false);
    expect($<HTMLFormElement>('.hf-poll__form').hidden).toBe(false);
    expect($<HTMLButtonElement>('.hf-poll__form button[type="submit"]').disabled).toBe(false);
    expect(events).toEqual([]);
  });

  it('réponse déjà enregistrée : notes reprises, événement marqué restored', async () => {
    const { $, $$, events, settle } = mount(html, { state: { submitted: true, scores: { 'media/a.jpg': 5, 'media/b.jpg': 1 } } });
    await settle();
    expect($<HTMLElement>('.hf-poll__status').textContent).toBe(HF_LABELS.fr['poll.thanks']);
    expect($$<HTMLInputElement>('input').filter((i) => i.checked).map((i) => i.value)).toEqual(['5', '1']);
    expect(events).toEqual([{ series: 'clients/dupont', scores: { 'media/a.jpg': 5, 'media/b.jpg': 1 }, restored: true }]);
  });

  it('un état incomplet ou invalide du serveur ne vaut pas réponse', async () => {
    const { $, events, settle } = mount(html, { state: { submitted: true, scores: { 'media/a.jpg': 9 } } });
    await settle();
    expect($<HTMLElement>('.hf-poll__status').textContent).toBe(HF_LABELS.fr['poll.intro']);
    expect(events).toEqual([]);
  });
});

describe('mountSeriesPoll — monté par un îlot du site', () => {
  const labels = Object.fromEntries(
    Object.entries(HF_LABELS.fr).filter(([k]) => k.startsWith('poll.')).map(([k, v]) => [k.slice(5), v]),
  ) as unknown as PollOptions['labels'];

  it('rend null sans image, et destroy() vide la racine', () => {
    const window = new Window();
    globalThis.fetch = vi.fn(async () => new Response('{}')) as unknown as typeof fetch;
    const root = window.document.createElement('div') as unknown as HTMLElement;
    expect(mountSeriesPoll(root, { series: 's', endpoint: '/p', images: [], labels })).toBeNull();
    const handle = mountSeriesPoll(root, { series: 's', endpoint: '/p', images: IMAGES, labels, headingLevel: 3 })!;
    expect(root.querySelector('h3')?.textContent).toBe(labels.heading);
    handle.destroy();
    expect(root.children).toHaveLength(0);
  });
});
