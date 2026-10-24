/**
 * Jetons CSS (#136) : aucune couleur en dur dans les composants, chaque
 * `--hf-*` lu par un composant est défini par le thème, et chaque jeton du
 * thème est documenté dans le README — pour qu'un site en `theme: 'none'`
 * sache quoi mapper.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const COMPONENTS = readdirSync(resolve(ROOT, 'src/components')).filter((f) => f.endsWith('.astro'));
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8');
const styleOf = (src: string) => [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');

const theme = read('src/theme/base.css');
const defined = new Set([...theme.matchAll(/(--hf-[\w-]+)\s*:/g)].map((m) => m[1]));
const readme = read('README.md');

describe('jetons CSS', () => {
  for (const file of COMPONENTS) {
    const src = read(`src/components/${file}`);
    const css = styleOf(src);

    it(`${file} : aucune couleur en dur dans les styles`, () => {
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(css).not.toMatch(/\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/);
      expect(css).not.toMatch(/:\s*(?:white|black)\b/);
    });

    it(`${file} : chaque --hf-* employé est défini par le thème`, () => {
      const used = new Set([...src.matchAll(/var\((--hf-[\w-]+)/g)].map((m) => m[1]));
      const missing = [...used].filter((t) => !defined.has(t) && !src.includes(`${t}:`));
      expect(missing).toEqual([]);
    });
  }

  it('chaque jeton du thème est documenté dans le README', () => {
    const undocumented = [...defined].filter((t) => !readme.includes(`\`${t}\``));
    expect(undocumented).toEqual([]);
  });
});
