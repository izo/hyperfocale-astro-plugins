import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { main } from '../../src/cli/main.js';

const ROOT = resolve(__dirname, '../..');
const CORPORA = resolve(ROOT, 'tests/fixtures/spec-ingestion/corpora');

let work: string;
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'hf-cli-'));
});
afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

async function run(...argv: string[]) {
  let stdout = '';
  let stderr = '';
  const code = await main(argv, { stdout: (t) => void (stdout += t), stderr: (t) => void (stderr += t), cwd: work });
  return { code, stdout, stderr };
}

function tree(files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(work, path)), { recursive: true });
    writeFileSync(join(work, path), content);
  }
}

describe('CLI — init reste la commande par défaut', () => {
  it('sans argument : crée src/content.config.ts', async () => {
    const { code, stdout } = await run();
    expect(code).toBe(0);
    expect(stdout).toContain('Créé : src/content.config.ts');
    expect(readFileSync(join(work, 'src/content.config.ts'), 'utf-8')).toContain('series: seriesCollection');
  });

  it('init explicite : idempotent', async () => {
    await run('init');
    const { code, stdout } = await run('init');
    expect(code).toBe(0);
    expect(stdout).toContain('Aucune modification nécessaire');
  });

  it('--help : 0 ; commande inconnue : 2', async () => {
    expect((await run('--help')).code).toBe(0);
    expect((await run('--help')).stdout).toContain('validate <dossier>');
    const unknown = await run('publish');
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain('Commande inconnue');
    expect(existsSync(join(work, 'src/content.config.ts'))).toBe(false);
  });
});

describe('CLI — init sur un content.config.ts existant (#153)', () => {
  const CONFIG = 'src/content.config.ts';
  const read = (name = CONFIG) => readFileSync(join(work, name), 'utf-8');

  it('fusion triviale : ajoute la clé et l\'import, avec sauvegarde', async () => {
    const original = `import { other } from './other';\n\nexport const collections = {\n  other,\n};\n`;
    tree({ [CONFIG]: original });
    const { code, stdout } = await run('init');
    expect(code).toBe(0);
    expect(stdout).toContain('Collection "series" ajoutée');
    const updated = read();
    expect(updated).toContain(`import { seriesCollection } from 'virtual:hyperfocale/collection';`);
    expect(updated).toMatch(/other,\n\s+series: seriesCollection,\n\};/);
    expect(read(`${CONFIG}.bak`)).toBe(original);
  });

  it('fusion triviale sans virgule finale', async () => {
    tree({ [CONFIG]: `export const collections = { other }\n` });
    expect((await run('init')).code).toBe(0);
    expect(read()).toContain('other,\n  series: seriesCollection,');
  });

  it('objet imbriqué : fichier intact, lignes à ajouter affichées', async () => {
    const original = `import { defineCollection, z } from 'astro:content';\nexport const collections = { blog: defineCollection({ schema: z.object({ title: z.string() }) }), };\n`;
    tree({ [CONFIG]: original });
    const { code, stdout } = await run('init');
    expect(code).toBe(0);
    expect(stdout).toContain("n'a pas été modifié");
    expect(stdout).toContain('series: seriesCollection');
    expect(read()).toBe(original);
    expect(existsSync(join(work, `${CONFIG}.bak`))).toBe(false);
  });

  it('variante d\'espacement `series : seriesCollection` : idempotent, pas de double injection', async () => {
    const original = `import { seriesCollection } from 'virtual:hyperfocale/collection';\nexport const collections = {\n  series : seriesCollection,\n};\n`;
    tree({ [CONFIG]: original });
    const { code, stdout } = await run('init');
    expect(code).toBe(0);
    expect(stdout).toContain('Aucune modification nécessaire');
    expect(read()).toBe(original);
  });

  it('clé en commentaire : ne compte pas comme présente', async () => {
    tree({ [CONFIG]: `export const collections = {\n  // series: seriesCollection,\n  other,\n};\n` });
    expect((await run('init')).code).toBe(0);
    const updated = read();
    expect(updated.match(/series: seriesCollection/g)).toHaveLength(2);
    expect(updated).toMatch(/other,\n\s+series: seriesCollection,/);
  });

  it('accolade dans une chaîne ou un commentaire : ne perturbe pas la fusion', async () => {
    tree({ [CONFIG]: `export const collections = {\n  other, // fin } de liste\n};\n` });
    expect((await run('init')).code).toBe(0);
    expect(read()).toBe(
      `import { seriesCollection } from 'virtual:hyperfocale/collection';\nexport const collections = {\n  other,\n  series: seriesCollection, // fin } de liste\n};\n`,
    );
  });

  it('`collections` déclaré autrement : fichier intact', async () => {
    const original = `const collections = { other };\nexport { collections };\n`;
    tree({ [CONFIG]: original });
    const { code, stdout } = await run('init');
    expect(code).toBe(0);
    expect(stdout).toContain("n'a pas été modifié");
    expect(read()).toBe(original);
  });

  it('sans export collections : l\'ajoute, avec sauvegarde', async () => {
    const original = `import { z } from 'astro:content';\n`;
    tree({ [CONFIG]: original });
    expect((await run('init')).code).toBe(0);
    expect(read()).toContain('export const collections = {\n  series: seriesCollection,\n};');
    expect(read(`${CONFIG}.bak`)).toBe(original);
  });

  it('une sauvegarde existante n\'est jamais écrasée', async () => {
    tree({ [CONFIG]: `export const collections = { other };\n`, [`${CONFIG}.bak`]: 'ancienne sauvegarde' });
    expect((await run('init')).code).toBe(0);
    expect(read(`${CONFIG}.bak`)).toBe('ancienne sauvegarde');
    expect(read(`${CONFIG}.bak.1`)).toBe(`export const collections = { other };\n`);
  });
});

describe('CLI — init --collection (CODE-006, #158)', () => {
  const CONFIG = 'src/content.config.ts';
  const read = () => readFileSync(join(work, CONFIG), 'utf-8');

  it('crée la collection au nom demandé', async () => {
    const { code, stdout } = await run('init', '--collection', 'projects');
    expect(code).toBe(0);
    expect(stdout).toContain('La collection "projects" est prête');
    expect(read()).toContain('projects: seriesCollection');
    expect(read()).not.toContain('series: seriesCollection');
  });

  it('forme --collection=nom, et clé entre apostrophes si ce n\'est pas un identifiant', async () => {
    expect((await run('init', '--collection=brands-fr')).code).toBe(0);
    expect(read()).toContain("'brands-fr': seriesCollection");
  });

  it('fusionne dans un fichier existant, et reste idempotent', async () => {
    tree({ [CONFIG]: `export const collections = { other };\n` });
    expect((await run('init', '--collection', 'projects')).code).toBe(0);
    expect(read()).toMatch(/other,\n\s+projects: seriesCollection,/);
    const again = await run('init', '--collection', 'projects');
    expect(again.stdout).toContain('Aucune modification nécessaire');
    expect(read().match(/projects: seriesCollection/g)).toHaveLength(1);
  });

  it('une clé entre apostrophes déjà présente est reconnue', async () => {
    tree({ [CONFIG]: `export const collections = {\n  'brands-fr': seriesCollection,\n};\n` });
    expect((await run('init', '--collection', 'brands-fr')).stdout).toContain('Aucune modification nécessaire');
  });

  it('refuse un nom invalide : 2, aucun fichier', async () => {
    const { code, stderr } = await run('init', '--collection', "a'b");
    expect(code).toBe(2);
    expect(stderr).toContain('Nom de collection invalide');
    expect(existsSync(join(work, CONFIG))).toBe(false);
  });

  it('refuse un argument inconnu : 2', async () => {
    expect((await run('init', '--nope')).code).toBe(2);
    expect((await run('init', '--collection')).code).toBe(2);
  });
});

describe('CLI — validate', () => {
  it('corpus conforme : 0', async () => {
    const { code, stdout } = await run('validate', join(CORPORA, 'minimal'));
    expect(code).toBe(0);
    expect(stdout).toContain('aucun diagnostic');
  });

  it('diagnostic error : 1, avec code et chemin', async () => {
    const { code, stdout } = await run('validate', join(CORPORA, 'invalid-slug-invalid'));
    expect(code).toBe(1);
    expect(stdout).toMatch(/✗ error\s+slug-invalid\s+\S+/);
    expect(stdout).toContain('1 erreur');
  });

  it('warning seul : 0', async () => {
    expect((await run('validate', join(CORPORA, 'invalid-media-orphan'))).code).toBe(0);
  });

  it('--json et --root : les triplets des fixtures roots et roots-default', async () => {
    for (const name of ['roots', 'roots-default']) {
      const fixture = JSON.parse(readFileSync(resolve(ROOT, `tests/fixtures/spec-ingestion/validation/${name}.json`), 'utf-8'));
      const rootArgs = (fixture.roots as Array<{ path: string; dateRequired: boolean }>).flatMap((r) => [
        '--root',
        `${r.path === '' ? '.' : r.path}${r.dateRequired ? '' : ':nodate'}`,
      ]);
      const { code, stdout } = await run('validate', join(CORPORA, fixture.corpus), '--json', ...rootArgs);
      const report = JSON.parse(stdout);
      expect(report.snapshot).toMatch(/^sha256:/);
      expect(report.diagnostics.map(({ code: c, severity, path }: Record<string, string>) => ({ code: c, severity, path }))).toEqual(
        fixture.expected,
      );
      expect(code).toBe(fixture.expected.some((d: { severity: string }) => d.severity === 'error') ? 1 : 0);
    }
  });

  it('--json : rapport complet', async () => {
    const { stdout } = await run('validate', join(CORPORA, 'minimal'), '--json');
    const report = JSON.parse(stdout);
    expect(report).toMatchObject({ complete: true, diagnostics: [] });
    expect(report.entries).toBeGreaterThan(0);
  });

  it('--astro-schema ajoute x-schema-invalid', async () => {
    tree({ 'c/ok/index.md': '---\ntitle: T\ndate: 2024-01-01\ntags: solo\n---\n' });
    expect((await run('validate', 'c')).code).toBe(0);
    const strict = await run('validate', 'c', '--astro-schema');
    expect(strict.code).toBe(1);
    expect(strict.stdout).toContain('x-schema-invalid');
  });

  it('--ignore exclut un dossier du corpus', async () => {
    tree({ 'c/ok/index.md': '---\ntitle: T\ndate: 2024-01-01\n---\n', 'c/_todo/Brouillon/index.md': 'sans frontmatter' });
    expect((await run('validate', 'c')).code).toBe(1);
    expect((await run('validate', 'c', '--ignore', '_todo/')).code).toBe(0);
  });

  it.each([
    [['validate'], 'attend un dossier'],
    [['validate', 'absent'], 'dossier introuvable'],
    [['validate', '.', '--bogus'], 'option inconnue'],
    [['validate', '.', '--root'], 'attend une valeur'],
    [['validate', '.', '--root', '../x'], 'racine invalide'],
  ])('mauvais usage %j : 2', async (argv, message) => {
    const { code, stderr } = await run(...argv);
    expect(code).toBe(2);
    expect(stderr).toContain(message);
  });
});

describe('CLI — snapshot', () => {
  it('sur la sortie standard : le snapshot de la fixture', async () => {
    const { code, stdout } = await run('snapshot', join(CORPORA, 'minimal'));
    const expected = JSON.parse(readFileSync(resolve(ROOT, 'tests/fixtures/spec-ingestion/snapshots/minimal.json'), 'utf-8'));
    expect(code).toBe(0);
    const snapshot = JSON.parse(stdout);
    expect(snapshot.id).toBe(expected.id);
    expect(snapshot.complete).toBe(true);
  });

  it('-o : écrit le fichier, résumé lisible ou JSON', async () => {
    const readable = await run('snapshot', join(CORPORA, 'minimal'), '-o', 'snap.json');
    expect(readable.code).toBe(0);
    expect(readable.stdout).toContain('✓ snap.json');
    expect(JSON.parse(readFileSync(join(work, 'snap.json'), 'utf-8')).format).toBe('hyperfocale.snapshot');
    const json = await run('snapshot', join(CORPORA, 'minimal'), '--output', 'snap2.json', '--json');
    expect(JSON.parse(json.stdout)).toMatchObject({ output: 'snap2.json', complete: true });
  });
});

describe('CLI — diff', () => {
  const fixture = JSON.parse(readFileSync(resolve(ROOT, 'tests/fixtures/spec-ingestion/diff/moved-and-modified.json'), 'utf-8'));

  it('lisible et --json', async () => {
    writeFileSync(join(work, 'base.json'), JSON.stringify(fixture.base));
    writeFileSync(join(work, 'target.json'), JSON.stringify(fixture.target));
    const readable = await run('diff', 'base.json', 'target.json');
    expect(readable.code).toBe(0);
    expect(readable.stdout).toContain('→ déplacé');
    expect(readable.stdout).toContain('séries :');
    const json = await run('diff', 'base.json', 'target.json', '--json');
    const changeSet = JSON.parse(json.stdout);
    expect(changeSet.moved).toEqual(fixture.expected.moved);
  });

  it('version inconnue : 1 ; fichier absent ou non snapshot : 2', async () => {
    writeFileSync(join(work, 'v2.json'), JSON.stringify({ ...fixture.target, version: 2 }));
    writeFileSync(join(work, 'target.json'), JSON.stringify(fixture.target));
    writeFileSync(join(work, 'junk.json'), '{"hello": 1}');
    const v2 = await run('diff', 'v2.json', 'target.json');
    expect(v2.code).toBe(1);
    expect(v2.stderr).toContain('snapshot-version-unsupported');
    expect((await run('diff', 'absent.json', 'target.json')).code).toBe(2);
    expect((await run('diff', 'junk.json', 'target.json')).code).toBe(2);
    expect((await run('diff', 'target.json')).code).toBe(2);
  });
});

describe('CLI — bin compilé', () => {
  const bin = resolve(ROOT, 'dist/cli/init.js');

  // Lancé dans le dossier temporaire : un dist/ antérieur aux commandes
  // d'ingestion exécuterait `init`, qui écrit dans le dossier courant.
  it.skipIf(!existsSync(bin))('dist/cli/init.js route validate et rend le code de sortie', () => {
    const out = execFileSync('node', [bin, 'validate', join(CORPORA, 'minimal')], { encoding: 'utf-8', cwd: work });
    expect(out).toContain('aucun diagnostic');
    let status = 0;
    try {
      execFileSync('node', [bin, 'validate', join(CORPORA, 'invalid-title-missing')], { stdio: 'pipe', cwd: work });
    } catch (err) {
      status = (err as { status: number }).status;
    }
    expect(status).toBe(1);
  });
});
