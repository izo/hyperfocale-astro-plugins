import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));

const ASTRO_COMPONENTS = [
  'SeriesCard',
  'SeriesList',
  'SeriesGallery',
  'SeriesLightbox',
];

describe('package exports — composants .astro', () => {
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
