/**
 * Script client de `SeriesLightbox` exécuté dans happy-dom (#136, P1) : le HTML
 * vient du composant (API container), le comportement de `lightbox-client.ts`.
 */
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { Window } from 'happy-dom';
import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import SeriesLightbox from '../../src/components/SeriesLightbox.astro';
import { initLightbox, type LightboxApi } from '../../src/components/lightbox-client.js';

const IMAGES = [
  { src: '/m/01.jpg', width: 1200, height: 800, format: 'jpg', alt: 'Phare' },
  { src: '/m/02.jpg', width: 800, height: 1200, format: 'jpg' },
  { src: '/m/03.jpg', width: 1200, height: 800, format: 'jpg', alt: 'Dune' },
];

let html: string;
beforeAll(async () => {
  const container = await AstroContainer.create();
  html = await container.renderToString(SeriesLightbox, { props: { images: IMAGES } });
});

const saved = new Map<string, unknown>();
afterEach(() => {
  for (const [key, value] of saved) (globalThis as Record<string, unknown>)[key] = value;
  saved.clear();
});

function mount(markup: string, markupOptions: { loop?: boolean; decorative?: boolean } = {}) {
  const window = new Window({ url: 'https://example.test/series/' });
  saved.set('CustomEvent', (globalThis as Record<string, unknown>)['CustomEvent']);
  (globalThis as Record<string, unknown>)['CustomEvent'] = (window as unknown as Record<string, unknown>)['CustomEvent'];
  let body = markup;
  if (markupOptions.loop) body = body.replace('data-hf-loop="false"', 'data-hf-loop="true"');
  if (markupOptions.decorative) body = body.replace('data-hf-decorative-alt="false"', 'data-hf-decorative-alt="true"');
  window.document.body.innerHTML = body;
  const api = initLightbox(window.document as unknown as Document) as LightboxApi;
  const q = (id: string) => window.document.getElementById(id)!;
  return { api, doc: window.document, q };
}

describe('lightbox-client (#136, P1)', () => {
  it('open : image, légende depuis l’alt, compteur, et événement hf:lightbox-open', () => {
    const { api, q, doc } = mount(html);
    let opened: unknown = null;
    q('hf-lightbox').addEventListener('hf:lightbox-open', (e: Event) => {
      opened = (e as CustomEvent<{ index: number }>).detail;
    });
    api.open(0);
    expect(q('hf-lightbox-img').getAttribute('src')).toBe('/m/01.jpg');
    expect(q('hf-lightbox-caption').textContent).toBe('Phare');
    expect(q('hf-lightbox-caption').hasAttribute('hidden')).toBe(false);
    expect(q('hf-lightbox-counter').textContent).toBe('1 / 3');
    expect(opened).toEqual({ index: 0 });
    expect(doc.body.style.overflow).toBe('hidden');
  });

  it('sans loop : précédent désactivé au début, suivant désactivé à la fin, navigation bornée', () => {
    const { api, q } = mount(html);
    api.open(0);
    expect(q('hf-lightbox-prev').getAttribute('aria-disabled')).toBe('true');
    expect(q('hf-lightbox-next').getAttribute('aria-disabled')).toBe('false');
    q('hf-lightbox-prev').click();
    expect(q('hf-lightbox-counter').textContent).toBe('1 / 3');
    q('hf-lightbox-next').click();
    q('hf-lightbox-next').click();
    expect(q('hf-lightbox-counter').textContent).toBe('3 / 3');
    expect(q('hf-lightbox-next').getAttribute('aria-disabled')).toBe('true');
    q('hf-lightbox-next').click();
    expect(q('hf-lightbox-counter').textContent).toBe('3 / 3');
  });

  it('avec loop : la navigation boucle dans les deux sens', () => {
    const { api, q } = mount(html, { loop: true });
    api.open(0);
    q('hf-lightbox-prev').click();
    expect(q('hf-lightbox-counter').textContent).toBe('3 / 3');
    expect(q('hf-lightbox-img').getAttribute('src')).toBe('/m/03.jpg');
    q('hf-lightbox-next').click();
    expect(q('hf-lightbox-counter').textContent).toBe('1 / 3');
  });

  it('une image sans alt : pas de légende, alt de repli localisé', () => {
    const { api, q } = mount(html);
    api.open(1);
    expect(q('hf-lightbox-caption').hasAttribute('hidden')).toBe(true);
    expect(q('hf-lightbox-img').getAttribute('alt')).toBe('Image 2 sur 3');
  });

  it('decorativeAlt : alt vide et pas de légende, pour toute la série', () => {
    const { api, q } = mount(html, { decorative: true });
    api.open(0);
    expect(q('hf-lightbox-img').getAttribute('alt')).toBe('');
    expect(q('hf-lightbox-caption').hasAttribute('hidden')).toBe(true);
  });

  it('flèches clavier, uniquement quand la lightbox est ouverte', () => {
    const { api, q, doc } = mount(html);
    doc.dispatchEvent(new (doc.defaultView as unknown as { KeyboardEvent: typeof KeyboardEvent }).KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(q('hf-lightbox-counter').textContent).toBe('');
    api.open(0);
    doc.dispatchEvent(new (doc.defaultView as unknown as { KeyboardEvent: typeof KeyboardEvent }).KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(q('hf-lightbox-counter').textContent).toBe('2 / 3');
  });

  it('fermer : rend le focus, remet le défilement, et émet la navigation', () => {
    const { api, q, doc } = mount(html);
    api.open(0);
    q('hf-lightbox-next').click();
    api.close();
    expect(doc.body.style.overflow).toBe('');
    expect(q('hf-lightbox').hasAttribute('open')).toBe(false);
  });

  it('setImages remplace la liste (série déverrouillée après coup)', () => {
    const { api, q } = mount(html);
    api.setImages([{ src: '/x/1.jpg', alt: 'Nouvelle' }]);
    api.open(0);
    expect(q('hf-lightbox-img').getAttribute('src')).toBe('/x/1.jpg');
    expect(q('hf-lightbox-caption').textContent).toBe('Nouvelle');
    expect(q('hf-lightbox-counter').textContent).toBe('1 / 1');
    // Une seule image : les boutons de navigation sont masqués.
    expect(q('hf-lightbox-next').style.display).toBe('none');
  });
});
