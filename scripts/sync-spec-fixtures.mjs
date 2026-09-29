#!/usr/bin/env node
/**
 * Copie versionnée des fixtures de conformité de la couche 4 (ingestion) de
 * izo/hyperfocale-spec vers tests/fixtures/spec-ingestion/.
 *
 * La spec possède les fixtures cross-language ; ce dépôt en garde une copie à
 * une ref épinglée, écrite dans tests/fixtures/spec-ingestion/SOURCE, pour que
 * les tests ne dépendent ni du réseau ni de l'état d'un autre checkout.
 *
 * Usage :
 *   node scripts/sync-spec-fixtures.mjs --ref <ref> [--repo <url | chemin local>]
 *       Copie les fixtures de <ref> (branche, tag, commit) et épingle le commit.
 *       --repo : défaut https://github.com/izo/hyperfocale-spec.git.
 *   node scripts/sync-spec-fixtures.mjs --path <dossier>
 *       Copie un dossier local (arbre de travail d'un checkout de la spec, ou
 *       son sous-dossier fixtures/) sans épingler — pour itérer, pas pour
 *       committer.
 *   node scripts/sync-spec-fixtures.mjs --check
 *       Vérifie que la copie correspond octet pour octet au commit épinglé de
 *       SOURCE. Code 1 sinon.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TARGET = join(ROOT, 'tests', 'fixtures', 'spec-ingestion');
const UPSTREAM = 'https://github.com/izo/hyperfocale-spec.git';

function fail(message, code = 2) {
  process.stderr.write(`[sync-spec-fixtures] ✗ ${message}\n`);
  process.exit(code);
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--check') out.check = true;
    else if (key === '--ref' || key === '--repo' || key === '--path') {
      const value = argv[++i];
      if (value === undefined) fail(`${key} attend une valeur.`);
      out[key.slice(2)] = value;
    } else fail(`option inconnue : ${key}`);
  }
  return out;
}

const git = (cwd, ...rest) => execFileSync('git', rest, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** Extrait fixtures/ d'un commit dans un dossier temporaire ; rend [dossier fixtures, commit]. */
function extract(repo, ref) {
  const work = mkdtempSync(join(tmpdir(), 'hf-spec-fixtures-'));
  let source = repo;
  if (!existsSync(join(repo, '.git')) && !existsSync(join(repo, 'HEAD'))) {
    // Dépôt distant : fetch superficiel de la ref (branche, tag ou commit).
    source = join(work, 'repo');
    mkdirSync(source);
    git(source, 'init', '--quiet');
    git(source, 'fetch', '--quiet', '--depth', '1', repo, ref);
    ref = 'FETCH_HEAD';
  }
  const commit = git(source, 'rev-parse', `${ref}^{commit}`);
  const tar = join(work, 'fixtures.tar');
  git(source, 'archive', '--format=tar', '-o', tar, commit, 'fixtures');
  const out = join(work, 'out');
  mkdirSync(out);
  execFileSync('tar', ['-xf', tar, '-C', out]);
  return { dir: join(out, 'fixtures'), commit, cleanup: () => rmSync(work, { recursive: true, force: true }) };
}

/** Liste récursive des fichiers d'un dossier, chemins relatifs triés. */
function files(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const abs = join(d, name);
      if (statSync(abs).isDirectory()) walk(abs);
      else out.push(relative(dir, abs));
    }
  };
  walk(dir);
  return out.sort();
}

/** Remplace la copie par `fixtures/ingestion` (+ son .gitattributes) de `fixturesDir`. */
function install(fixturesDir, sourceLines) {
  const ingestion = join(fixturesDir, 'ingestion');
  if (!existsSync(join(ingestion, 'README.md'))) fail(`pas de fixtures/ingestion/README.md sous ${fixturesDir}.`);
  rmSync(TARGET, { recursive: true, force: true });
  cpSync(ingestion, TARGET, { recursive: true });
  // Octets exacts : la règle « * -text » de la spec doit couvrir la copie aussi.
  const attributes = join(fixturesDir, '.gitattributes');
  writeFileSync(join(TARGET, '.gitattributes'), existsSync(attributes) ? readFileSync(attributes) : '* -text\n');
  writeFileSync(join(TARGET, 'SOURCE'), `${sourceLines.join('\n')}\n`);
}

function readSource() {
  const file = join(TARGET, 'SOURCE');
  if (!existsSync(file)) fail('tests/fixtures/spec-ingestion/SOURCE absent.');
  return Object.fromEntries(
    readFileSync(file, 'utf-8')
      .split('\n')
      .filter((line) => line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );
}

const opts = args(process.argv.slice(2));

if (opts.check) {
  const source = readSource();
  if (source.commit === undefined) fail('copie non épinglée (synchronisée depuis un dossier local).', 1);
  const { dir, cleanup } = extract(opts.repo ?? source.repo ?? UPSTREAM, source.commit);
  try {
    const expected = files(join(dir, 'ingestion'));
    const actual = files(TARGET).filter((f) => f !== 'SOURCE' && f !== '.gitattributes');
    const drift = [
      ...expected.filter((f) => !actual.includes(f)).map((f) => `manquant : ${f}`),
      ...actual.filter((f) => !expected.includes(f)).map((f) => `en trop : ${f}`),
      ...expected
        .filter((f) => actual.includes(f))
        .filter((f) => !readFileSync(join(dir, 'ingestion', f)).equals(readFileSync(join(TARGET, f))))
        .map((f) => `modifié : ${f}`),
    ];
    if (drift.length > 0) fail(`la copie diverge du commit ${source.commit} :\n  ${drift.join('\n  ')}`, 1);
    process.stdout.write(`[sync-spec-fixtures] ✓ ${expected.length} fichiers conformes au commit ${source.commit}\n`);
  } finally {
    cleanup();
  }
} else if (opts.path !== undefined) {
  const base = resolve(opts.path);
  const fixturesDir = existsSync(join(base, 'fixtures', 'ingestion')) ? join(base, 'fixtures') : base;
  install(fixturesDir, [`repo=local:${base}`, 'ref=(arbre de travail, non épinglé)']);
  process.stdout.write(`[sync-spec-fixtures] ✓ copié depuis ${fixturesDir} — non épinglé, à resynchroniser par --ref avant commit\n`);
} else if (opts.ref !== undefined) {
  const repo = opts.repo ?? UPSTREAM;
  const { dir, commit, cleanup } = extract(repo, opts.ref);
  try {
    const upstream = existsSync(repo) ? UPSTREAM : repo;
    install(dir, [`repo=${upstream}`, `ref=${opts.ref}`, `commit=${commit}`]);
    process.stdout.write(`[sync-spec-fixtures] ✓ fixtures de ${opts.ref} (${commit}) copiées dans tests/fixtures/spec-ingestion/\n`);
  } finally {
    cleanup();
  }
} else {
  fail('préciser --ref <ref>, --path <dossier> ou --check.');
}
