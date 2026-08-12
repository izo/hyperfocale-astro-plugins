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

  it('accepte imageOptimization: auto | disabled', () => {
    expect(() => hyperfocale({ imageOptimization: 'auto' })).not.toThrow();
    expect(() => hyperfocale({ imageOptimization: 'disabled' })).not.toThrow();
  });

  it('rejette un imageOptimization inconnu', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => hyperfocale({ imageOptimization: 'off' as any })).toThrowError(/imageOptimization/);
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

// ─── Feuille de thème effectivement injectée (`theme: 'none'`) ───────────────

/**
 * Même principe que `injectedPatterns`, côté `injectScript` : accepter
 * `theme: 'none'` ne prouve rien, c'est l'absence d'injection qu'il faut voir.
 *
 * Régression d'origine : `injectScript` était appelé inconditionnellement, hors
 * du garde `injectRoutes`. Un site montant le plugin en couche data embarquait
 * les 30 custom properties `--hf-*` sur toutes ses pages — mesuré à 1 643 octets,
 * 29 % de son bundle CSS — sans qu'une seule règle les lise.
 */
function injectedScriptEntries(
  options: Parameters<typeof hyperfocale>[0] = {},
): Array<{ stage: string; content: string }> {
  const scripts: Array<{ stage: string; content: string }> = [];
  const setup = hyperfocale(options).hooks['astro:config:setup'];
  if (!setup) throw new Error('hook astro:config:setup absent de l’intégration');
  setup({
    injectRoute: () => {},
    injectScript: (stage: string, content: string) => void scripts.push({ stage, content }),
    updateConfig: () => {},
    logger: { info: () => {}, warn: () => {} },
    config: { root: new URL('file:///tmp/hyperfocale-test/') },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return scripts;
}

/** La feuille de style seule — l'attribut `data-hf-theme` part sur un autre stage. */
function injectedScripts(options: Parameters<typeof hyperfocale>[0] = {}): string[] {
  return injectedScriptEntries(options)
    .filter((s) => s.stage === 'page-ssr')
    .map((s) => s.content);
}

describe("thème injecté", () => {
  it('injecte base.css par défaut', () => {
    const scripts = injectedScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toMatch(/theme[/\\]base\.css/);
  });

  it("theme: 'none' n'injecte aucune feuille", () => {
    expect(injectedScripts({ theme: 'none' })).toEqual([]);
  });

  it.each(['light', 'dark', 'auto'] as const)(
    "theme: '%s' injecte toujours la feuille",
    (theme) => {
      expect(injectedScripts({ theme })).toHaveLength(1);
    },
  );

  it("injectRoutes: false n'implique pas la coupure du thème", () => {
    // Les deux options sont indépendantes à dessein : un site peut câbler ses
    // propres pages avec SeriesGallery, qui a besoin des variables --hf-*.
    expect(injectedScripts({ injectRoutes: false })).toHaveLength(1);
  });

  it("theme: 'none' n'empêche pas l'injection des routes", () => {
    expect(injectedPatterns({ theme: 'none' })).toHaveLength(3);
  });

  it('rejette un thème inconnu', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => hyperfocale({ theme: 'nope' as any })).toThrowError(/theme/);
  });
});

// ─── `data-hf-theme` effectivement posé (#FE-012) ────────────────────────────

/**
 * `base.css` articule ses trois blocs sur `data-hf-theme` — attribut que rien
 * n'écrivait. `theme: 'light'` et `theme: 'dark'` étaient donc sans effet : tout
 * site retombait sur `auto`, et celui qui demandait `'light'` obtenait quand même
 * le sombre sous `prefers-color-scheme: dark`.
 *
 * Ce qui compte ici n'est pas qu'un script soit émis, mais **sur quel stage** :
 * `head-inline` s'exécute en synchrone dans le `<head>`, donc avant le premier
 * paint. Le poser sur `page` ou `before-hydration` rendrait la bonne valeur après
 * un flash de thème.
 */
const themeAttrScripts = (options: Parameters<typeof hyperfocale>[0] = {}) =>
  injectedScriptEntries(options).filter((s) => s.stage === 'head-inline');

describe('attribut data-hf-theme', () => {
  it.each(['light', 'dark'] as const)("theme: '%s' pose l’attribut", (theme) => {
    const [script, ...extra] = themeAttrScripts({ theme });
    expect(extra).toEqual([]);
    expect(script?.content).toContain('documentElement');
    expect(script?.content).toContain(`"${theme}"`);
  });

  it('émet sur `head-inline`, avant le premier paint', () => {
    // Sur un autre stage, la valeur arriverait après un flash de thème.
    expect(themeAttrScripts({ theme: 'dark' })).toHaveLength(1);
    expect(injectedScriptEntries({ theme: 'dark' }).map((s) => s.stage))
      .toEqual(['page-ssr', 'head-inline']);
  });

  it.each(['auto', 'none'] as const)("theme: '%s' ne pose aucun attribut", (theme) => {
    // `auto` : le CSS nu se comporte déjà ainsi, l'attribut ne servirait à rien.
    // `none` : aucune feuille n'est servie, il n'y a rien à piloter.
    expect(themeAttrScripts({ theme })).toEqual([]);
  });

  it('le défaut ne pose aucun attribut', () => {
    expect(themeAttrScripts()).toEqual([]);
  });

  it('la valeur part sérialisée, pas interpolée nue', () => {
    // Le contenu est inline dans le `<head>` : une valeur interpolée sans
    // guillemets y serait lue comme un identifiant, pas comme une chaîne.
    // `theme` est validé en amont, mais la sérialisation ne doit pas en dépendre.
    const [script] = themeAttrScripts({ theme: 'light' });
    expect(script?.content).toContain('"light"');
  });

  it("l’attribut suit le thème même sans routes injectées", () => {
    // Un site en couche data qui rend `SeriesGallery` dans ses propres pages a
    // besoin du thème demandé, pas seulement de la feuille.
    expect(themeAttrScripts({ theme: 'dark', injectRoutes: false })).toHaveLength(1);
  });
});
