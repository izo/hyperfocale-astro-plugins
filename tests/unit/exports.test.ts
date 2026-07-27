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
