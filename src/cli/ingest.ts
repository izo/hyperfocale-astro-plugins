/**
 * Commandes d'ingestion du CLI : `validate`, `snapshot`, `diff`.
 *
 * Minces enveloppes autour de `@regrets/hyperfocale/ingest` et de son provider
 * filesystem : toute la logique vit dans le module, le CLI ne fait que lire
 * des arguments et écrire un rapport.
 */

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SnapshotFormatError,
  createSnapshot,
  diffSnapshots,
  normalizePath,
  parseSnapshot,
  summarizeChangeSet,
  validateSnapshot,
} from '../ingest/index.js';
import type { ContentSnapshot, Diagnostic, ValidationRoot } from '../ingest/index.js';
import { FilesystemProvider } from '../ingest/fs.js';
import { EXIT, type CliIO } from './io.js';

type Command = 'validate' | 'snapshot' | 'diff';

/** Arguments analysés. */
interface Parsed {
  positional: string[];
  roots: ValidationRoot[];
  ignore: string[];
  output?: string;
  json: boolean;
}

class UsageError extends Error {}

const OPTIONS: Record<Command, ReadonlySet<string>> = {
  validate: new Set(['--root', '--ignore', '--json']),
  snapshot: new Set(['-o', '--output', '--ignore', '--json']),
  diff: new Set(['--json']),
};

/** `archives`, `./archives/`, `archives:nodate` → racine de validation. */
function parseRoot(value: string): ValidationRoot {
  const nodate = value.endsWith(':nodate');
  const raw = (nodate ? value.slice(0, -':nodate'.length) : value).replace(/^\.(\/|$)/, '').replace(/\/+$/, '');
  if (raw !== '' && !normalizePath(raw).valid) throw new UsageError(`racine invalide : « ${value} »`);
  return { path: raw.normalize('NFC'), dateRequired: !nodate };
}

function parseArgs(command: Command, argv: readonly string[]): Parsed {
  const parsed: Parsed = { positional: [], roots: [], ignore: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (!arg.startsWith('-') || arg === '-') {
      parsed.positional.push(arg);
      continue;
    }
    if (!OPTIONS[command].has(arg)) throw new UsageError(`option inconnue pour ${command} : ${arg}`);
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }
    const value = argv[++i];
    if (value === undefined) throw new UsageError(`${arg} attend une valeur`);
    if (arg === '--root') parsed.roots.push(parseRoot(value));
    else if (arg === '--ignore') parsed.ignore.push(value);
    else parsed.output = value;
  }
  const expected = command === 'diff' ? 2 : 1;
  if (parsed.positional.length !== expected) {
    throw new UsageError(
      command === 'diff' ? 'diff attend deux fichiers : <base.json> <target.json>' : `${command} attend un dossier`,
    );
  }
  return parsed;
}

const SYMBOL = { error: '✗', warning: '⚠', info: 'ℹ' } as const;

function formatDiagnostics(diagnostics: readonly Diagnostic[]): string {
  return diagnostics
    .map((d) => `  ${SYMBOL[d.severity]} ${d.severity.padEnd(7)} ${d.code.padEnd(28)} ${d.path || '(snapshot)'} — ${d.message}\n`)
    .join('');
}

function tally(diagnostics: readonly Diagnostic[]): string {
  const count = (severity: Diagnostic['severity']) => diagnostics.filter((d) => d.severity === severity).length;
  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
  return `${plural(count('error'), 'erreur')}, ${plural(count('warning'), 'avertissement')}, ${count('info')} info`;
}

const hasErrors = (diagnostics: readonly Diagnostic[]) => diagnostics.some((d) => d.severity === 'error');

/** Snapshot d'un dossier par le provider filesystem. */
async function snapshotDirectory(dir: string, ignore: readonly string[]) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new UsageError(`dossier introuvable : ${dir}`);
  const provider = new FilesystemProvider({ root: dir, ignore });
  const listing = await provider.list();
  const snapshot = await createSnapshot(listing.entries, {
    complete: listing.complete,
    source: { provider: 'filesystem' },
  });
  return { provider, snapshot };
}

async function validate(args: Parsed, io: CliIO): Promise<number> {
  const dir = resolve(io.cwd, args.positional[0] as string);
  const { provider, snapshot } = await snapshotDirectory(dir, args.ignore);
  const diagnostics = await validateSnapshot(snapshot, {
    read: (path) => provider.read(path),
    ...(args.roots.length > 0 ? { roots: args.roots } : {}),
  });
  if (args.json) {
    io.stdout(
      `${JSON.stringify({ snapshot: snapshot.id, complete: snapshot.complete, entries: snapshot.entries.length, diagnostics }, null, 2)}\n`,
    );
  } else {
    io.stdout(`[hyperfocale] validate ${args.positional[0]} — ${snapshot.entries.length} entrées, ${snapshot.id}\n`);
    io.stdout(formatDiagnostics(diagnostics));
    io.stdout(
      diagnostics.length === 0
        ? '[hyperfocale] ✓ aucun diagnostic\n'
        : `[hyperfocale] ${hasErrors(diagnostics) ? '✗' : '✓'} ${tally(diagnostics)}\n`,
    );
  }
  return hasErrors(diagnostics) ? EXIT.diagnostics : EXIT.ok;
}

async function snapshot(args: Parsed, io: CliIO): Promise<number> {
  const { snapshot } = await snapshotDirectory(resolve(io.cwd, args.positional[0] as string), args.ignore);
  const json = `${JSON.stringify(snapshot, null, 2)}\n`;
  if (args.output === undefined) {
    io.stdout(json);
  } else {
    const output = resolve(io.cwd, args.output);
    writeFileSync(output, json, 'utf-8');
    io.stdout(
      args.json
        ? `${JSON.stringify({ output: args.output, snapshot: snapshot.id, complete: snapshot.complete, entries: snapshot.entries.length }, null, 2)}\n`
        : `[hyperfocale] ✓ ${args.output} — ${snapshot.entries.length} entrées, ${snapshot.id}\n`,
    );
  }
  if (!snapshot.complete) {
    io.stderr('[hyperfocale] ✗ snapshot-incomplete : une lecture a échoué, le snapshot est impubliable.\n');
    return EXIT.diagnostics;
  }
  return EXIT.ok;
}

function readSnapshot(file: string, io: CliIO): ContentSnapshot {
  let text: string;
  try {
    text = readFileSync(resolve(io.cwd, file), 'utf-8');
  } catch {
    throw new UsageError(`fichier illisible : ${file}`);
  }
  try {
    return parseSnapshot(text);
  } catch (err) {
    if (err instanceof SnapshotFormatError && err.code === 'snapshot-version-unsupported') throw err;
    throw new UsageError(`${file} n'est pas un snapshot : ${(err as Error).message}`);
  }
}

async function diff(args: Parsed, io: CliIO): Promise<number> {
  const [baseFile, targetFile] = args.positional as [string, string];
  const base = readSnapshot(baseFile, io);
  const target = readSnapshot(targetFile, io);
  const changeSet = diffSnapshots(base, target);
  if (args.json) {
    io.stdout(`${JSON.stringify(changeSet, null, 2)}\n`);
  } else {
    const summary = summarizeChangeSet(changeSet, base, target);
    const lines = [
      `[hyperfocale] diff ${changeSet.base} → ${changeSet.target}\n`,
      ...changeSet.added.map((e) => `  + ajouté   ${e.path}\n`),
      ...changeSet.modified.map((m) => `  ~ modifié  ${m.path}\n`),
      ...changeSet.deleted.map((e) => `  - supprimé ${e.path}\n`),
      ...changeSet.moved.map((m) => `  → déplacé  ${m.from} → ${m.to}${m.modified ? ' (modifié)' : ''}\n`),
      formatDiagnostics(changeSet.diagnostics),
      `[hyperfocale] séries : ${summary.series.added.length} ajoutée(s), ${summary.series.modified.length} modifiée(s), ` +
        `${summary.series.deleted.length} supprimée(s), ${summary.series.moved.length} déplacée(s)\n`,
    ];
    io.stdout(lines.join(''));
  }
  return hasErrors(changeSet.diagnostics) ? EXIT.diagnostics : EXIT.ok;
}

/** Exécute une commande d'ingestion ; rend le code de sortie. */
export async function runIngestCommand(command: Command, argv: readonly string[], io: CliIO): Promise<number> {
  try {
    const args = parseArgs(command, argv);
    if (command === 'validate') return await validate(args, io);
    if (command === 'snapshot') return await snapshot(args, io);
    return await diff(args, io);
  } catch (err) {
    if (err instanceof UsageError) {
      io.stderr(`[hyperfocale] ✗ ${err.message}\n  hyperfocale --help pour l'usage.\n`);
      return EXIT.usage;
    }
    if (err instanceof SnapshotFormatError) {
      io.stderr(`[hyperfocale] ✗ ${err.code} : ${err.message}\n`);
      return EXIT.diagnostics;
    }
    throw err;
  }
}
