/**
 * Repli d'erreur des images réécrites par un `imageProvider` (#136, P0), exécuté
 * dans happy-dom : une image dont l'URL réécrite échoue retombe sur son URL
 * d'origine, une seule fois, sans `srcset`.
 */
import { Window } from 'happy-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { initImageFallback } from '../../src/components/image-fallback.js';

const saved = new Map<string, unknown>();
afterEach(() => {
  for (const [key, value] of saved) (globalThis as Record<string, unknown>)[key] = value;
  saved.clear();
});

function mount(markup: string) {
  const window = new Window({ url: 'https://example.test/series/' });
  for (const key of ['HTMLImageElement', 'Event'] as const) {
    saved.set(key, (globalThis as Record<string, unknown>)[key]);
    (globalThis as Record<string, unknown>)[key] = (window as unknown as Record<string, unknown>)[key];
  }
  window.document.body.innerHTML = markup;
  initImageFallback(window.document as unknown as Document);
  return window.document;
}

describe('image-fallback (#136, P0)', () => {
  it('une image réécrite en erreur retombe sur son URL d’origine, sans srcset', () => {
    const doc = mount(
      '<img id="a" src="/cdn-cgi/image/width=600/https://r2.example/01.jpg" srcset="x 600w" sizes="100vw" data-hf-fallback="https://r2.example/01.jpg">',
    );
    const img = doc.getElementById('a')!;
    img.dispatchEvent(new (globalThis as unknown as { Event: typeof Event }).Event('error'));
    expect(img.getAttribute('src')).toBe('https://r2.example/01.jpg');
    expect(img.hasAttribute('srcset')).toBe(false);
    expect(img.hasAttribute('sizes')).toBe(false);
  });

  it('une image sans data-hf-fallback n’est pas touchée', () => {
    const doc = mount('<img id="b" src="https://r2.example/02.jpg">');
    const img = doc.getElementById('b')!;
    img.dispatchEvent(new (globalThis as unknown as { Event: typeof Event }).Event('error'));
    expect(img.getAttribute('src')).toBe('https://r2.example/02.jpg');
  });

  it('si l’URL d’origine échoue aussi, pas de boucle', () => {
    const doc = mount('<img id="c" src="https://r2.example/03.jpg" data-hf-fallback="https://r2.example/03.jpg">');
    const img = doc.getElementById('c')!;
    img.dispatchEvent(new (globalThis as unknown as { Event: typeof Event }).Event('error'));
    expect(img.getAttribute('src')).toBe('https://r2.example/03.jpg');
  });
});
