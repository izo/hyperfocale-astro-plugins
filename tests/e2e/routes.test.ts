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

  // 2. Installer les deps du demo-site (crée le symlink @regrets/hyperfocale → ../../)
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

// ─────────────────────────────────────────────────────────────────────────────
// Tests — Page d'index de section (spec §1.10, #SPEC-001)
// ─────────────────────────────────────────────────────────────────────────────

describe('page d\'index de section (§1.10)', () => {
  // Le seul fait que `beforeAll` ait abouti prouve le correctif central :
  // `archives/index.md` porte `type: section` et n'a pas de `date`, ce qui
  // faisait échouer la validation de la collection — donc tout le build.
  it('le build passe avec un index.md `type: section` sans date', () => {
    expect(fileExists('series/index.html')).toBe(true);
  });

  it('la section n\'apparaît pas dans le listing des séries', () => {
    const html = htmlOf('series/index.html');
    expect(html).not.toContain('Archives');
    expect(html).not.toContain('href="/series/archives/"');
  });

  it('aucune page de galerie n\'est générée pour la section', () => {
    expect(fileExists('series/archives/index.html')).toBe(false);
  });

  it('les séries rangées dans la section restent des séries à part entière', () => {
    expect(fileExists('series/archives/concerts-2023/index.html')).toBe(true);
    expect(htmlOf('series/index.html')).toContain('Concerts 2023');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests — Line-up des sous-séries (spec §1.8, H2)
// ─────────────────────────────────────────────────────────────────────────────

describe('série conteneur et line-up (§1.8)', () => {
  // `festival-2024/` porte son propre index.md daté, sa galerie, et deux
  // sous-séries. Leurs `lineup_order` contredisent volontairement les dates :
  // un line-up trié chronologiquement les afficherait dans l'autre sens.
  const container = () => htmlOf('series/festival-2024/index.html');

  it('génère les deux niveaux d\'URL', () => {
    expect(fileExists('series/festival-2024/index.html')).toBe(true);
    expect(fileExists('series/festival-2024/set-aurore/index.html')).toBe(true);
    expect(fileExists('series/festival-2024/set-crepuscule/index.html')).toBe(true);
  });

  it('affiche le line-up sur la page du conteneur', () => {
    const html = container();
    // `class="hf-lineup"` et non `hf-lineup` : le <style> scopé de la route
    // injecte la règle CSS dans toutes les pages, rendue ou non.
    expect(html).toContain('class="hf-lineup"');
    expect(html).toContain('Set du crépuscule');
    expect(html).toContain('Set de l\'aurore');
  });

  it('le conteneur garde sa galerie propre', () => {
    // §1.8 : « body + galerie propre éventuelle + liste des sous-séries ».
    expect(container()).toContain('hf-gallery');
  });

  it('`lineup_order` pilote l\'ordre, pas la date', () => {
    const html = container();
    // set-crepuscule (20/07, order 1) doit précéder set-aurore (21/07, order 2).
    expect(html.indexOf('Set du crépuscule')).toBeLessThan(html.indexOf('Set de l\'aurore'));
  });

  it('une série ordinaire n\'affiche aucun line-up', () => {
    expect(htmlOf('series/bretagne-2024/index.html')).not.toContain('class="hf-lineup"');
  });

  it('le cover du conteneur traverse un sous-dossier', () => {
    // §1.8 : « le `cover` du conteneur PEUT pointer vers une image d'une
    // sous-série, en chemin relatif » — dérogation explicite au « pas de
    // récursion dans media/ » de §1.6.
    //
    // Que le build aboutisse est déjà une preuve : `image()` valide le chemin
    // au schéma, un cover irrésolu ferait échouer la collection. Reste à
    // vérifier que la card emprunte la branche `cover` et non le repli sur la
    // première image — `data-image-component` marque le rendu par `<Image>`,
    // là où le repli sert un `<img>` brut.
    const list = htmlOf('series/index.html');
    const cards = [...list.matchAll(/<article class="hf-card"[\s\S]*?<\/article>/g)].map((m) => m[0]);
    const card = cards.find((c) => c.includes('href="/series/festival-2024/"'));
    expect(card).toBeDefined();
    expect(card).toContain('data-image-component');
    expect(card).toContain('alt="Couverture de la série Festival 2024"');
    expect(card).not.toContain('hf-card__placeholder');
    // Le chemin relatif est résolu, pas servi tel quel.
    expect(card).not.toContain('./set-aurore/');
  });

  it('les sous-séries restent listées dans l\'index global', () => {
    // §1.8 : « Listing global : aplatir par défaut ».
    const list = htmlOf('series/index.html');
    expect(list).toContain('Festival 2024');
    expect(list).toContain('Set de l\'aurore');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests — Manifeste d'images externalisé (spec §1.5.1, #SPEC-002)
// ─────────────────────────────────────────────────────────────────────────────

describe('manifeste d\'images externalisé (§1.5.1)', () => {
  // `manifeste-2024/` porte trois images nommées 01/02/03 et un images.json qui
  // les ordonne 03, 01, 02 : si la galerie sortait dans l'ordre alphabétique,
  // c'est que le manifeste n'a pas été lu.
  const gallery = () => htmlOf('series/manifeste-2024/index.html');

  it('génère la page de la série', () => {
    expect(fileExists('series/manifeste-2024/index.html')).toBe(true);
  });

  it('l\'ordre du manifeste prime sur le tri alphabétique de media/', () => {
    // L'ordre se lit dans les `alt`, pas dans les noms d'assets générés :
    // Astro déduplique les images par contenu, si bien qu'un fichier peut
    // sortir sous le nom d'un homonyme d'une autre série.
    const html = gallery();
    const troisieme = html.indexOf('Troisième vue');   // ./media/03.png, 1re du manifeste
    const premiere = html.indexOf('alt="Photo 2"');    // ./media/01.png, forme courte, 2e
    const deuxieme = html.indexOf('Deuxième vue');     // ./media/02.png, 3e
    expect(troisieme).toBeGreaterThan(-1);
    expect(premiere).toBeGreaterThan(-1);
    expect(deuxieme).toBeGreaterThan(-1);
    expect(troisieme).toBeLessThan(premiere);
    expect(premiere).toBeLessThan(deuxieme);
  });

  it('les chemins relatifs sont résolus en assets Astro optimisés', () => {
    // Une URL brute `./media/03.png` signalerait une résolution manquée.
    expect(gallery()).not.toContain('./media/03.png');
  });

  it('la forme longue porte son `alt` jusqu\'au HTML', () => {
    expect(gallery()).toContain('Troisième vue, posée en tête par le manifeste');
  });

  it('la forme courte est acceptée sans alt', () => {
    // `"./media/01.png"` équivaut à `{ "url": "./media/01.png" }` — elle doit
    // produire une image, avec l'alt de repli du composant.
    const images = gallery().match(/<img[^>]*class="hf-gallery__img"/g) ?? [];
    expect(images).toHaveLength(3);
    expect(gallery()).toContain('alt="Photo 2"');
  });

  it('images.json n\'est pas rendu comme document joint', () => {
    // Le nom du fichier apparaît dans la description et le body de la série —
    // ce qui compte est qu'aucune section de pièces jointes ne soit rendue.
    // (`.hf-attachments` figure dans le CSS inline ; `class="hf-attachments`
    // n'apparaît que si le composant a rendu quelque chose.)
    expect(gallery()).not.toContain('class="hf-attachments');
  });
});
