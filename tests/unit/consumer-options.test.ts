import { describe, it, expect } from 'vitest';
import hyperfocale from '../../src/index.js';
import { getSeriesImages, resetSeriesCache } from '../../src/helpers/index.js';
import type { Series } from '../../src/helpers/index.js';

// Fabrique une entrée `series` minimale portant un `images[]` de frontmatter.
function makeSeries(images: unknown[]): Series {
  return {
    id: 'demo',
    collection: 'series',
    data: { title: 'Demo', images },
    body: '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// ─── getSeriesImages : images locales (asset) avec ordre + alt (A3) ──────────

describe('getSeriesImages — mode local asset', () => {
  it("préserve l'ordre du frontmatter et attache l'alt", async () => {
    resetSeriesCache();
    const series = makeSeries([
      { src: { src: '/a/02.jpg', width: 800, height: 600, format: 'jpg' }, alt: 'deux' },
      { src: { src: '/a/01.jpg', width: 800, height: 600, format: 'jpg' }, alt: 'un' },
    ]);
    const images = await getSeriesImages('demo', series);
    expect(images).toHaveLength(2);
    // L'ordre suit le tableau, pas l'alphabétique.
    expect(images[0]?.src).toBe('/a/02.jpg');
    expect(images[0]?.alt).toBe('deux');
    expect(images[1]?.src).toBe('/a/01.jpg');
    expect(images[1]?.alt).toBe('un');
  });

  it("n'ajoute pas de clé alt quand elle est absente", async () => {
    resetSeriesCache();
    const series = makeSeries([{ src: { src: '/a/01.jpg', width: 1, height: 1, format: 'jpg' } }]);
    const images = await getSeriesImages('demo', series);
    expect(images[0]?.src).toBe('/a/01.jpg');
    expect('alt' in (images[0] as object)).toBe(false);
  });
});

// ─── getSeriesImages : mode distant (régression, spec §1.5) ──────────────────

describe('getSeriesImages — mode distant', () => {
  it('mappe les entrées url + alt', async () => {
    resetSeriesCache();
    const series = makeSeries([
      { url: 'https://cdn.test/x.jpg', alt: 'x', width: 100, height: 50 },
    ]);
    const images = await getSeriesImages('demo', series);
    expect(images[0]?.src).toBe('https://cdn.test/x.jpg');
    expect(images[0]?.alt).toBe('x');
    expect(images[0]?.width).toBe(100);
    expect(images[0]?.format).toBe('jpg');
  });
});

// ─── Validation des options de l'intégration (A1/A2) ─────────────────────────

describe('options hyperfocale', () => {
  it('accepte les nouvelles options valides', () => {
    expect(() =>
      hyperfocale({
        galleryLayout: 'column',
        injectRoutes: false,
        listRoute: false,
        layout: './src/layouts/Base.astro',
      }),
    ).not.toThrow();
  });

  it('rejette un galleryLayout inconnu', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => hyperfocale({ galleryLayout: 'nope' as any })).toThrowError(/galleryLayout/);
  });

  it('galleryLayout défaut = grid (ne lève pas)', () => {
    expect(() => hyperfocale({})).not.toThrow();
  });
});

// ─── Routes effectivement injectées (`listRoute`, `injectRoutes`) ────────────

/**
 * Exécute le hook `astro:config:setup` de l'intégration et retourne les
 * patterns réellement passés à `injectRoute`. Vérifier l'acceptation d'une
 * option ne dit rien de son effet : `listRoute` n'existe que pour supprimer
 * une injection, c'est donc l'injection qu'il faut observer.
 */
function injectedPatterns(options: Parameters<typeof hyperfocale>[0] = {}): string[] {
  const patterns: string[] = [];
  const setup = hyperfocale(options).hooks['astro:config:setup'];
  if (!setup) throw new Error('hook astro:config:setup absent de l’intégration');
  setup({
    injectRoute: (route: { pattern: string }) => void patterns.push(route.pattern),
    injectScript: () => {},
    updateConfig: () => {},
    logger: { info: () => {}, warn: () => {} },
    config: { root: new URL('file:///tmp/hyperfocale-test/') },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return patterns;
}

describe('routes injectées', () => {
  it('injecte index + détail + pagination par défaut', () => {
    expect(injectedPatterns()).toEqual([
      '/series/',
      '/series/[...slug]/',
      '/series/[...slug]/[page]/',
    ]);
  });

  it("listRoute: false retire l'index et conserve les autres routes", () => {
    const patterns = injectedPatterns({ listRoute: false });
    expect(patterns).not.toContain('/series/');
    expect(patterns).toEqual(['/series/[...slug]/', '/series/[...slug]/[page]/']);
  });

  it("injectRoutes: false n'injecte aucune route", () => {
    expect(injectedPatterns({ injectRoutes: false })).toEqual([]);
  });

  it('le prefix du preset se répercute sur les patterns', () => {
    expect(injectedPatterns({ preset: 'recipe' })).toEqual([
      '/recettes/',
      '/recettes/[...slug]/',
      '/recettes/[...slug]/[page]/',
    ]);
  });
});
