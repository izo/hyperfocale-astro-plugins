#!/usr/bin/env node
/**
 * Copie versionnée des fixtures de conformité de izo/hyperfocale-spec :
 *
 *   fixtures/ingestion/ → tests/fixtures/spec-ingestion/   (couche 4, ingestion)
 *   fixtures/format/    → tests/fixtures/spec-format/      (couche 1, fonctions pures)
 *
 * La spec possède les fixtures cross-language ; ce dépôt en garde une copie à
 * une ref épinglée, écrite dans le fichier SOURCE de chaque dossier copié, pour
 * que les tests ne dépendent ni du réseau ni de l'état d'un autre checkout. Les
 * deux copies sont synchronisées ensemble, au même commit.
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
 *       Vérifie que chaque copie correspond octet pour octet au commit épinglé de
 *       son SOURCE. Code 1 sinon.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
/** Les dossiers de fixtures copiés : leur nom dans la spec, et leur destination ici. */
const SETS = [
  { name: 'ingestion', target: join(ROOT, 'tests', 'fixtures', 'spec-ingestion') },
  { name: 'format', target: join(ROOT, 'tests', 'fixtures', 'spec-format') },
];
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

/**
 * Remplace chaque copie par le dossier de même nom de `fixturesDir` (+ son
 * .gitattributes). Rien n'est touché si l'un des dossiers manque.
 */
function install(fixturesDir, sourceLines) {
  for (const { name } of SETS) {
    if (!existsSync(join(fixturesDir, name, 'README.md'))) fail(`pas de fixtures/${name}/README.md sous ${fixturesDir}.`);
  }
  // Octets exacts : la règle « * -text » de la spec doit couvrir les copies aussi.
  const attributes = join(fixturesDir, '.gitattributes');
  for (const { name, target } of SETS) {
    rmSync(target, { recursive: true, force: true });
    cpSync(join(fixturesDir, name), target, { recursive: true });
    writeFileSync(join(target, '.gitattributes'), existsSync(attributes) ? readFileSync(attributes) : '* -text\n');
    writeFileSync(join(target, 'SOURCE'), `${sourceLines.join('\n')}\n`);
  }
}

function readSource({ target }) {
  const file = join(target, 'SOURCE');
  if (!existsSync(file)) fail(`${relative(ROOT, file)} absent.`);
  return Object.fromEntries(
    readFileSync(file, 'utf-8')
      .split('\n')
      .filter((line) => line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );
}

const opts = args(process.argv.slice(2));

if (opts.check) {
  // Une extraction par (dépôt, commit) : les copies épinglées au même commit la partagent.
  const extractions = new Map();
  const extracted = (repo, commit) => {
    const key = `${repo}\n${commit}`;
    if (!extractions.has(key)) extractions.set(key, extract(repo, commit));
    return extractions.get(key);
  };
  const drift = [];
  let checked = 0;
  try {
    for (const set of SETS) {
      const source = readSource(set);
      if (source.commit === undefined) fail(`copie ${set.name} non épinglée (synchronisée depuis un dossier local).`, 1);
      const { dir } = extracted(opts.repo ?? source.repo ?? UPSTREAM, source.commit);
      const expected = files(join(dir, set.name));
      const actual = files(set.target).filter((f) => f !== 'SOURCE' && f !== '.gitattributes');
      const problems = [
        ...expected.filter((f) => !actual.includes(f)).map((f) => `manquant : ${f}`),
        ...actual.filter((f) => !expected.includes(f)).map((f) => `en trop : ${f}`),
        ...expected
          .filter((f) => actual.includes(f))
          .filter((f) => !readFileSync(join(dir, set.name, f)).equals(readFileSync(join(set.target, f))))
          .map((f) => `modifié : ${f}`),
      ];
      if (problems.length > 0) {
        drift.push(`la copie ${set.name} diverge du commit ${source.commit} :\n  ${problems.join('\n  ')}`);
      } else {
        checked += expected.length;
        process.stdout.write(`[sync-spec-fixtures] ✓ ${set.name} : ${expected.length} fichiers conformes au commit ${source.commit}\n`);
      }
    }
  } finally {
    for (const { cleanup } of extractions.values()) cleanup();
  }
  if (drift.length > 0) fail(drift.join('\n'), 1);
  process.stdout.write(`[sync-spec-fixtures] ✓ ${checked} fichiers au total\n`);
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
    const targets = SETS.map(({ target }) => `${relative(ROOT, target)}/`).join(', ');
    process.stdout.write(`[sync-spec-fixtures] ✓ fixtures de ${opts.ref} (${commit}) copiées dans ${targets}\n`);
  } finally {
    cleanup();
  }
} else {
  fail('préciser --ref <ref>, --path <dossier> ou --check.');
}
