import { computeSnapshotId } from './hash.js';
import { collisionKey, compareCanonical, dirname } from './paths.js';
import { ENTRY_KINDS } from './types.js';
import type {
  ContentSnapshot,
  EntryKind,
  ProviderDelta,
  ProviderListing,
  SnapshotEntry,
  SnapshotSource,
} from './types.js';

/** Options de `createSnapshot`. */
export interface CreateSnapshotOptions {
  /**
   * Obligatoire, et sans valeur par défaut à dessein : un snapshot déclaré
   * complet à tort autorise des suppressions (§1, invariant 3). Passer
   * `listing.complete`.
   */
  readonly complete: boolean;
  /** Défaut : maintenant. */
  readonly createdAt?: string | Date;
  readonly source?: SnapshotSource;
}

/**
 * Construit un ContentSnapshot v1 (§4.5) : entrées triées dans l'ordre
 * canonique, identifiant calculé (§4.6).
 *
 * Ne valide pas — `validateSnapshot` s'en charge et rend des diagnostics. Seul
 * un doublon exact de chemin lève : ce n'est pas un contenu invalide, c'est un
 * listing incohérent, que rien en aval ne saurait interpréter.
 */
export async function createSnapshot(
  entries: readonly SnapshotEntry[],
  options: CreateSnapshotOptions,
): Promise<ContentSnapshot> {
  const sorted = [...entries].sort((a, b) => compareCanonical(a.path, b.path));
  for (let i = 1; i < sorted.length; i++) {
    if ((sorted[i] as SnapshotEntry).path === (sorted[i - 1] as SnapshotEntry).path) {
      throw new Error(`[hyperfocale] createSnapshot : chemin en double « ${(sorted[i] as SnapshotEntry).path} ».`);
    }
  }
  const createdAt =
    options.createdAt === undefined
      ? new Date().toISOString()
      : typeof options.createdAt === 'string'
        ? options.createdAt
        : options.createdAt.toISOString();

  return {
    format: 'hyperfocale.snapshot',
    version: 1,
    id: await computeSnapshotId(sorted),
    createdAt,
    complete: options.complete,
    ...(options.source !== undefined ? { source: options.source } : {}),
    entries: sorted,
  };
}

/** Code d'une erreur de lecture de snapshot. */
export type SnapshotFormatErrorCode = 'snapshot-version-unsupported' | 'snapshot-invalid';

/** Snapshot illisible : format inconnu, version non supportée, champ invalide. */
export class SnapshotFormatError extends Error {
  readonly code: SnapshotFormatErrorCode;

  constructor(code: SnapshotFormatErrorCode, message: string) {
    super(`[hyperfocale] ${message}`);
    this.name = 'SnapshotFormatError';
    this.code = code;
  }
}

const KINDS = new Set<string>(ENTRY_KINDS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkEntry(raw: unknown, index: number): SnapshotEntry {
  const fail = (what: string): never => {
    throw new SnapshotFormatError('snapshot-invalid', `entries[${index}] : ${what}.`);
  };
  if (!isRecord(raw)) return fail('objet attendu');
  if (typeof raw.path !== 'string') fail('`path` doit être une chaîne');
  if (typeof raw.kind !== 'string' || !KINDS.has(raw.kind)) fail('`kind` inconnu');
  if (typeof raw.size !== 'number' || !Number.isInteger(raw.size) || raw.size < 0) {
    fail('`size` doit être un entier positif ou nul');
  }
  if (raw.hashes !== undefined) {
    if (!isRecord(raw.hashes)) fail('`hashes` doit être un objet');
    for (const value of Object.values(raw.hashes as Record<string, unknown>)) {
      if (typeof value !== 'string') fail('chaque empreinte doit être une chaîne');
    }
  }
  if (raw.state !== undefined && raw.state !== 'materialized' && raw.state !== 'placeholder') {
    fail('`state` inconnu');
  }
  for (const key of ['identity', 'modifiedAt'] as const) {
    if (raw[key] !== undefined && typeof raw[key] !== 'string') fail(`\`${key}\` doit être une chaîne`);
  }
  // Champs inconnus conservés tels quels (passthrough, §4.5).
  return raw as unknown as SnapshotEntry;
}

/**
 * Lit un ContentSnapshot (§4.5) depuis du JSON ou un objet déjà parsé.
 *
 * Refuse une version inconnue (`snapshot-version-unsupported`) — un lecteur
 * n'interprète jamais un format qu'il ne connaît pas. Conserve les champs
 * inconnus. Ne recalcule pas l'identifiant et ne réordonne pas les entrées.
 *
 * @throws {SnapshotFormatError}
 */
export function parseSnapshot(input: string | unknown): ContentSnapshot {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (err) {
      throw new SnapshotFormatError('snapshot-invalid', `JSON illisible (${(err as Error).message}).`);
    }
  }
  if (!isRecord(raw)) throw new SnapshotFormatError('snapshot-invalid', 'objet attendu.');
  if (raw.format !== 'hyperfocale.snapshot') {
    throw new SnapshotFormatError('snapshot-invalid', `format « ${String(raw.format)} » inconnu.`);
  }
  if (raw.version !== 1) {
    throw new SnapshotFormatError(
      'snapshot-version-unsupported',
      `version ${String(raw.version)} non supportée (seule la version 1 est connue).`,
    );
  }
  if (typeof raw.id !== 'string') throw new SnapshotFormatError('snapshot-invalid', '`id` manquant.');
  if (typeof raw.createdAt !== 'string') {
    throw new SnapshotFormatError('snapshot-invalid', '`createdAt` manquant.');
  }
  if (typeof raw.complete !== 'boolean') {
    throw new SnapshotFormatError('snapshot-invalid', '`complete` doit être un booléen.');
  }
  if (raw.source !== undefined && !isRecord(raw.source)) {
    throw new SnapshotFormatError('snapshot-invalid', '`source` doit être un objet.');
  }
  if (!Array.isArray(raw.entries)) {
    throw new SnapshotFormatError('snapshot-invalid', '`entries` doit être un tableau.');
  }
  const entries = raw.entries.map(checkEntry);
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.path)) {
      throw new SnapshotFormatError('snapshot-invalid', `chemin en double « ${entry.path} ».`);
    }
    seen.add(entry.path);
  }
  return { ...raw, entries } as unknown as ContentSnapshot;
}

/** Le curseur d'un provider a expiré : seul un listing complet fait foi. */
export class CursorResetError extends Error {
  constructor(message = 'le curseur a expiré — un listing complet (list()) est requis.') {
    super(`[hyperfocale] ${message}`);
    this.name = 'CursorResetError';
  }
}

/**
 * Applique un delta de provider à un état connu et rend le listing résultant.
 *
 * - Suppressions d'abord, puis upserts : un chemin supprimé puis recréé dans le
 *   même delta subsiste. `DropboxProvider.changes` replie déjà les opérations
 *   dans cet ordre.
 * - Une suppression de `p` retire `p` et tout `p/…`.
 * - Les chemins se rapprochent au repli de casse près (§4.1) : pour un provider
 *   insensible à la casse, `Foo/a.jpg` et `foo/a.jpg` sont le même fichier. Un
 *   upsert garde la casse des dossiers déjà connus — Dropbox ne garantit la
 *   casse que du dernier segment d'un chemin.
 * - `reset` : lève `CursorResetError`. Un curseur expiré n'est jamais
 *   interprété comme « tout a été supprimé ».
 *
 * `complete` est hérité de l'état de départ : un delta ne rend pas complet un
 * listing qui ne l'était pas.
 *
 * @throws {CursorResetError}
 */
export function applyDelta(base: ContentSnapshot | ProviderListing, delta: ProviderDelta): ProviderListing {
  if (delta.reset === true) throw new CursorResetError();

  const byKey = new Map<string, SnapshotEntry>();
  for (const entry of base.entries) byKey.set(collisionKey(entry.path), entry);

  for (const deleted of delta.deletions) {
    const key = collisionKey(deleted);
    for (const existing of [...byKey.keys()]) {
      if (existing === key || existing.startsWith(`${key}/`)) byKey.delete(existing);
    }
  }

  // Casse connue de chaque dossier, clé de collision → chemin tel qu'écrit.
  const folders = new Map<string, string>();
  const registerFolders = (path: string) => {
    for (let dir = dirname(path); dir !== ''; dir = dirname(dir)) {
      const key = collisionKey(dir);
      if (folders.has(key)) break;
      folders.set(key, dir);
    }
  };
  for (const entry of byKey.values()) registerFolders(entry.path);

  for (const upsert of delta.upserts) {
    const path = alignFolderCase(upsert.path, folders);
    byKey.set(collisionKey(path), path === upsert.path ? upsert : { ...upsert, path });
    registerFolders(path);
  }

  const entries = [...byKey.values()].sort((a, b) => compareCanonical(a.path, b.path));
  return { entries, complete: base.complete, cursor: delta.cursor };
}

/** Réécrit les dossiers d'un chemin avec la casse déjà connue, du plus profond au plus haut. */
function alignFolderCase(path: string, folders: ReadonlyMap<string, string>): string {
  for (let dir = dirname(path); dir !== ''; dir = dirname(dir)) {
    const known = folders.get(collisionKey(dir));
    if (known !== undefined) return known === dir ? path : `${known}${path.slice(dir.length)}`;
  }
  return path;
}

/** Nombre d'entrées d'une classe donnée. */
export function countKind(entries: readonly SnapshotEntry[], kind: EntryKind): number {
  return entries.reduce((n, entry) => (entry.kind === kind ? n + 1 : n), 0);
}
