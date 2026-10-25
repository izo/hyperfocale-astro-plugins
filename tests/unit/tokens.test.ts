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
// Feuilles propres à un composant (publiées sous `/styles/*.css`, émises à la
// demande) : mêmes règles que les `<style>` des composants.
const SHEETS = readdirSync(resolve(ROOT, 'src/theme')).filter((f) => f.endsWith('.css') && f !== 'base.css');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8');
const styleOf = (src: string) => [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');

const theme = read('src/theme/base.css');
const defined = new Set([...theme.matchAll(/(--hf-[\w-]+)\s*:/g)].map((m) => m[1]));
const readme = read('README.md');

describe('jetons CSS', () => {
  it('découvre la feuille de SeriesAttachments', () => {
    expect(SHEETS).toContain('attachments.css');
  });

  const sources: Array<[string, string, string]> = [
    ...COMPONENTS.map((file): [string, string, string] => {
      const src = read(`src/components/${file}`);
      return [file, src, styleOf(src)];
    }),
    ...SHEETS.map((file): [string, string, string] => {
      const src = read(`src/theme/${file}`);
      return [file, src, src.replace(/\/\*[\s\S]*?\*\//g, '')];
    }),
  ];

  for (const [file, src, css] of sources) {
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

  it('typographie : --hf-font-mono et tailles des documents joints définis par le thème', () => {
    for (const token of [
      '--hf-font-mono',
      '--hf-attachments-font-size-heading',
      '--hf-attachments-font-size-title',
      '--hf-attachments-font-size-meta',
      '--hf-attachments-font-size-size',
      '--hf-attachments-font-size-kind',
      '--hf-attachments-font-size-badge',
      '--hf-attachments-badge-font',
    ]) {
      expect(defined, token).toContain(token);
    }
  });

  it('chaque longueur ou police lue par attachments.css garde un repli (site en theme: none)', () => {
    const css = read('src/theme/attachments.css');
    const bare = [...css.matchAll(/var\((--hf-(?!color-)[\w-]+)\)/g)].map((m) => m[1]);
    expect(bare).toEqual([]);
  });

  it("SeriesAttachments n'a pas de <style> statique : sa feuille n'est émise que s'il rend quelque chose", () => {
    const src = read('src/components/SeriesAttachments.astro');
    expect(src).not.toMatch(/^<style(?![^>]*is:inline)/m);
  });

  it('chaque jeton du thème est documenté dans le README', () => {
    const undocumented = [...defined].filter((t) => !readme.includes(`\`${t}\``));
    expect(undocumented).toEqual([]);
  });
});
