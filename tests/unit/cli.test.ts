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
