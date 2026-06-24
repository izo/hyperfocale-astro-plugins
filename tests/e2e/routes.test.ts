/**
 * Tests e2e des routes automatiques injectées par le plugin hyperfocale.
 *
 * Stratégie : builder le demo-site avec `astro build`, puis analyser
 * les fichiers HTML générés pour vérifier les routes et leur contenu.
 *
 * Pourquoi ce choix :
 * - Pas de Playwright (règle projet)
 * - Pas de @astrojs/test-utils (non installé)
 * - Le build statique Astro est déterministe et vérifiable via le filesystem
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const DEMO_SITE = resolve(ROOT, 'examples/demo-site');
const DEMO_DIST = resolve(DEMO_SITE, 'dist');

/**
 * Builder le plugin puis le demo-site une seule fois avant tous les tests.
 * Timeout élevé car `astro build` peut prendre 30-60s.
 */
beforeAll(async () => {
  // 1. Builder le plugin (génère dist/)
  execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'pipe' });

  // 2. Installer les deps du demo-site (crée le symlink @izo/hyperfocale → ../../)
  execFileSync('npm', ['install', '--prefer-offline'], { cwd: DEMO_SITE, stdio: 'pipe' });

  // 3. Builder le demo-site (génère examples/demo-site/dist/)
  execFileSync('npm', ['run', 'build'], {
    cwd: DEMO_SITE,
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: 'production' },
  });
}, 180_000);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function htmlOf(relPath: string): string {
  const abs = resolve(DEMO_DIST, relPath);
  if (!existsSync(abs)) {
    throw new Error(`Fichier HTML non généré : ${abs}`);
  }
  return readFileSync(abs, 'utf-8');
}

function fileExists(relPath: string): boolean {
  return existsSync(resolve(DEMO_DIST, relPath));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests — Structure de build
// ─────────────────────────────────────────────────────────────────────────────

describe('build du plugin', () => {
  it('génère dist/index.js', () => {
    expect(existsSync(resolve(ROOT, 'dist/index.js'))).toBe(true);
  });

  it('génère dist/helpers/index.js', () => {
    expect(existsSync(resolve(ROOT, 'dist/helpers/index.js'))).toBe(true);
  });

  it('génère dist/components/index.js', () => {
    expect(existsSync(resolve(ROOT, 'dist/components/index.js'))).toBe(true);
  });

  it('copie dist/routes/*.astro', () => {
    expect(existsSync(resolve(ROOT, 'dist/routes/series-list.astro'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'dist/routes/series-detail.astro'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'dist/routes/series-page.astro'))).toBe(true);
  });

  it('copie dist/theme/base.css', () => {
    expect(existsSync(resolve(ROOT, 'dist/theme/base.css'))).toBe(true);
  });

  it('copie dist/components/*.astro', () => {
    expect(existsSync(resolve(ROOT, 'dist/components/SeriesCard.astro'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'dist/components/SeriesList.astro'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'dist/components/SeriesGallery.astro'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'dist/components/SeriesLightbox.astro'))).toBe(true);
  });

  it('dist/index.js peut être chargé par Node.js sans erreur (pas d\'import astro: au top-level)', () => {
    // Si le build du demo-site a réussi (beforeAll), c'est que dist/index.js
    // est chargeable par Node.js — preuve que les imports astro: sont confinés
    // dans le module virtuel (template literal) et non au top-level du module.
    expect(existsSync(resolve(DEMO_DIST, 'series/index.html'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests — Routes générées par le demo-site
// ─────────────────────────────────────────────────────────────────────────────

describe('route /series/ (liste des séries)', () => {
  it('génère le fichier series/index.html', () => {
    expect(fileExists('series/index.html')).toBe(true);
  });

  it('contient la structure HTML de base', () => {
    const html = htmlOf('series/index.html');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('contient le titre "Séries photo"', () => {
    const html = htmlOf('series/index.html');
    expect(html).toContain('Séries photo');
  });

  it('contient le thème CSS injecté (custom properties --hf-*)', () => {
    const html = htmlOf('series/index.html');
    expect(html).toContain('--hf-color-bg');
    expect(html).toContain('--hf-color-accent');
    expect(html).toContain('--hf-gallery-gap');
  });

  it('contient le composant SeriesList (classe .hf-series-list)', () => {
    const html = htmlOf('series/index.html');
    expect(html).toContain('hf-series-list');
  });

  it('contient les styles du mode sombre (prefers-color-scheme)', () => {
    const html = htmlOf('series/index.html');
    expect(html).toContain('prefers-color-scheme');
    expect(html).toContain('dark');
  });
});

describe('route /index.html (page d\'accueil)', () => {
  it('génère le fichier index.html', () => {
    expect(fileExists('index.html')).toBe(true);
  });

  it('contient le titre "Hyperfocale Demo"', () => {
    const html = htmlOf('index.html');
    expect(html).toContain('Hyperfocale Demo');
  });

  it('contient un lien vers /series/', () => {
    const html = htmlOf('index.html');
    expect(html).toContain('/series/');
  });

  it('contient le thème CSS injecté', () => {
    const html = htmlOf('index.html');
    expect(html).toContain('--hf-color-bg');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests — Intégration du plugin (contenu de dist/index.js)
// ─────────────────────────────────────────────────────────────────────────────

describe('intégration hyperfocale (dist/index.js)', () => {
  const indexContent = readFileSync(resolve(ROOT, 'dist/index.js'), 'utf-8');

  it('exporte la fonction hyperfocale par défaut', () => {
    expect(indexContent).toContain('function hyperfocale');
  });

  it('injecte les 3 routes via injectRoute()', () => {
    expect(indexContent).toContain('series-list.astro');
    expect(indexContent).toContain('series-detail.astro');
    expect(indexContent).toContain('series-page.astro');
  });

  it('configure le module virtuel virtual:hyperfocale/collection', () => {
    expect(indexContent).toContain('virtual:hyperfocale/collection');
  });

  it('injecte le CSS du thème via injectScript', () => {
    expect(indexContent).toContain('injectScript');
    expect(indexContent).toContain('base.css');
  });

  it('utilise vite.define pour passer les options aux routes', () => {
    expect(indexContent).toContain('HYPERFOCALE_PREFIX');
    expect(indexContent).toContain('HYPERFOCALE_PAGE_SIZE');
    expect(indexContent).toContain('HYPERFOCALE_THEME');
  });

  it('utilise le loader Content Layer glob (pas de type: content)', () => {
    expect(indexContent).not.toContain("type: 'content'");
    expect(indexContent).toContain('astro/loaders');
    expect(indexContent).toContain('loader: glob(');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests — Routes inexistantes (404)
// ─────────────────────────────────────────────────────────────────────────────

describe('routes inexistantes', () => {
  it('ne génère pas de fichier pour un slug inexistant', () => {
    // Un slug qui n'existe pas ne doit pas avoir de fichier HTML
    expect(fileExists('series/slug-inexistant/index.html')).toBe(false);
  });

  it('ne génère pas de page 2 quand pageSize >= nombre d\'images', () => {
    // Le demo-site a pageSize=4 et 4 images par série -> pas de page 2
    // (même si la collection était peuplée)
    expect(fileExists('series/bretagne-2024/2/index.html')).toBe(false);
  });
});
