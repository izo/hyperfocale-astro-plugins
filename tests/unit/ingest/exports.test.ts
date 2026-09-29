/**
 * Frontières du contrat d'ingestion dans le paquet.
 *
 * - `./ingest`, `./ingest/dropbox` et `./ingest/webdav` s'importent dans un
 *   Worker : aucun module `node:*` (ni builtin nu) dans leur graphe d'imports ;
 * - l'intégration Astro (`.`) ne charge rien du contrat d'ingestion.
 *
 * Vérifié deux fois : sur les sources, et sur `dist/` (après build), où tsup a
 * pu redistribuer le code entre chunks partagés.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, relative, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));

// Imports et réexports à l'exécution — `import type` / `export type` exclus :
// TypeScript les efface.
const IMPORT = /(?:^|[;\s])(?:import|export)\s+(?!type\b)(?:[^'"`;]*?\sfrom\s*)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

const BUILTINS = new Set(builtinModules);
const isNode = (specifier: string) => specifier.startsWith('node:') || BUILTINS.has(specifier.split('/')[0] as string);

/** Graphe d'imports relatifs depuis `entry` : fichiers atteints et spécificateurs externes. */
function graph(entry: string, resolveFile: (from: string, specifier: string) => string) {
  const files = new Set<string>();
  const external = new Map<string, string>();
  const visit = (file: string) => {
    if (files.has(file)) return;
    files.add(file);
    for (const match of readFileSync(file, 'utf-8').matchAll(IMPORT)) {
      const specifier = (match[1] ?? match[2]) as string;
      if (specifier.startsWith('.')) visit(resolveFile(file, specifier));
      else external.set(specifier, relative(ROOT, file));
    }
  };
  visit(entry);
  return { files, external };
}

const fromSource = (from: string, specifier: string) => resolve(dirname(from), specifier.replace(/\.js$/, '.ts'));
const fromDist = (from: string, specifier: string) => resolve(dirname(from), specifier);

const AGNOSTIC = ['index', 'dropbox', 'webdav'];

describe('ingest — exports du paquet', () => {
  it.each(['', '/fs', '/dropbox', '/webdav'])('./ingest%s est exporté avec ses types', (suffix) => {
    const file = suffix === '' ? 'index' : suffix.slice(1);
    expect(pkg.exports[`./ingest${suffix}`]).toEqual({
      types: `./dist/ingest/${file}.d.ts`,
      import: `./dist/ingest/${file}.js`,
    });
  });

  it.each(['index', 'fs', 'dropbox', 'webdav'])('dist/ingest/%s.js et .d.ts existent (après build)', (file) => {
    expect(existsSync(resolve(ROOT, 'dist/ingest', `${file}.js`))).toBe(true);
    expect(existsSync(resolve(ROOT, 'dist/ingest', `${file}.d.ts`))).toBe(true);
  });

  it('js-yaml est une dépendance déclarée, pas une peer ni une dev', () => {
    expect(pkg.dependencies['js-yaml']).toBeDefined();
  });
});

describe('ingest — aucun module node:* hors ./ingest/fs', () => {
  for (const name of AGNOSTIC) {
    it(`src/ingest/${name}.ts`, () => {
      const { external } = graph(resolve(ROOT, 'src/ingest', `${name}.ts`), fromSource);
      const offenders = [...external].filter(([specifier]) => isNode(specifier) || specifier.startsWith('astro'));
      expect(offenders).toEqual([]);
    });

    it(`dist/ingest/${name}.js (après build)`, () => {
      const { external } = graph(resolve(ROOT, 'dist/ingest', `${name}.js`), fromDist);
      expect([...external].filter(([specifier]) => isNode(specifier))).toEqual([]);
    });
  }

  it('le scanner détecte bien node:* là où il y en a (ingest/fs)', () => {
    const { external } = graph(resolve(ROOT, 'src/ingest/fs.ts'), fromSource);
    expect([...external.keys()].some(isNode)).toBe(true);
  });
});

describe('ingest — l\'intégration Astro n\'en charge rien', () => {
  it('src/index.ts n\'atteint aucun fichier de src/ingest/', () => {
    const { files } = graph(resolve(ROOT, 'src/index.ts'), fromSource);
    expect([...files].map((f) => relative(ROOT, f)).filter((f) => f.startsWith('src/ingest/'))).toEqual([]);
  });

  it('dist/index.js n\'atteint aucun code d\'ingestion (après build)', () => {
    const { files } = graph(resolve(ROOT, 'dist/index.js'), fromDist);
    const leaking = [...files].filter((file) => /hyperfocale\.(snapshot|changeset)/.test(readFileSync(file, 'utf-8')));
    expect(leaking.map((f) => relative(ROOT, f))).toEqual([]);
  });

  it('le bin n\'importe les commandes d\'ingestion qu\'à la demande', () => {
    const source = readFileSync(resolve(ROOT, 'src/cli/main.ts'), 'utf-8');
    expect(source).toMatch(/await import\('\.\/ingest\.js'\)/);
    const { files } = graph(resolve(ROOT, 'src/cli/init-config.ts'), fromSource);
    expect([...files].some((f) => f.includes('/ingest/'))).toBe(false);
  });
});
