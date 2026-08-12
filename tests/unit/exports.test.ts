import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));

// Liste dérivée du filesystem, et non maintenue à la main : un composant ajouté
// à src/components/ est couvert d'office. La liste en dur précédente n'en
// connaissait que quatre — SeriesAttachments, SeriesFilter, SeriesMap et
// SeriesMasonry ont ainsi pu être livrés sans entrée dans le champ `exports`,
// donc sans être importables par un site consommateur.
const ASTRO_COMPONENTS = readdirSync(resolve(ROOT, 'src', 'components'))
  .filter((file) => file.endsWith('.astro'))
  .map((file) => file.replace(/\.astro$/, ''))
  .sort();

describe('package exports — composants .astro', () => {
  it('découvre les composants de src/components/', () => {
    expect(ASTRO_COMPONENTS.length).toBeGreaterThan(0);
  });

  for (const name of ASTRO_COMPONENTS) {
    const exportKey = `./components/${name}.astro`;
    const expectedDist = `./dist/components/${name}.astro`;

    it(`expose ${exportKey} dans le champ exports`, () => {
      expect(pkg.exports[exportKey]).toBe(expectedDist);
    });

    it(`dist/${name}.astro existe sur le filesystem (après build)`, () => {
      const distPath = resolve(ROOT, 'dist', 'components', `${name}.astro`);
      expect(existsSync(distPath)).toBe(true);
    });
  }
});

// ─── Vocabulaires du schéma exposés à la racine ──────────────────────────────

/**
 * Même principe que la liste de composants ci-dessus : dérivée du module, pas
 * maintenue à la main.
 *
 * Régression : `schema.ts` porte trois vocabulaires publics — `CONTENT_TYPES`,
 * `ATTACHMENT_KINDS`, `EMBED_PLATFORMS` — et seul le premier était réexporté par
 * l'entrée racine. Les deux autres n'étaient atteignables que via `/helpers`,
 * sous-chemin qui importe `astro:content` et n'est donc pas chargeable hors
 * runtime Astro. Un consommateur écrivant un formulaire ou un lint n'avait aucun
 * moyen simple de connaître les valeurs licites.
 */
describe('package exports — vocabulaires du schéma', () => {
  it('réexporte à la racine tous les vocabulaires de schema.ts', async () => {
    const schema = await import('../../src/schema.js');
    const root = await import('../../src/index.js');

    // Un vocabulaire : export SCREAMING_SNAKE dont la valeur est un tableau.
    const vocabularies = Object.keys(schema).filter(
      (key) => /^[A-Z][A-Z0-9_]*$/.test(key) && Array.isArray((schema as Record<string, unknown>)[key]),
    );

    expect(vocabularies.length).toBeGreaterThan(0);
    expect(Object.keys(root)).toEqual(expect.arrayContaining(vocabularies));
  });

  it('expose les trois vocabulaires connus', async () => {
    const root = await import('../../src/index.js');
    expect(root.CONTENT_TYPES).toEqual(['series', 'section']);
    expect(root.ATTACHMENT_KINDS).toEqual(['video', 'audio', 'document', 'file']);
    expect(root.EMBED_PLATFORMS).toEqual([
      'vimeo',
      'youtube',
      'dailymotion',
      'soundcloud',
      'bandcamp',
      'spotify',
    ]);
  });
});
