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
const STATES = new Set(['materialized', 'placeholder', 'conflict']);
const HEX64 = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Rejet structurel d'un document (§4.5), dans l'ordre de la spec : `format`,
 * puis `version`, puis les champs requis. `null` si le document a la forme
 * d'un snapshot — ses entrées restent à vérifier une à une.
 */
export function snapshotStructureError(raw: unknown): { code: SnapshotFormatErrorCode; message: string } | null {
  if (!isRecord(raw) || raw.format !== 'hyperfocale.snapshot') {
    return { code: 'snapshot-invalid', message: `ce n'est pas un snapshot (format « ${String(isRecord(raw) ? raw.format : raw)} »).` };
  }
  if (raw.version !== 1) {
    return {
      code: 'snapshot-version-unsupported',
      message: `version ${String(raw.version)} non supportée (seule la version 1 est connue).`,
    };
  }
  if (typeof raw.id !== 'string') return { code: 'snapshot-invalid', message: '`id` doit être une chaîne.' };
  if (typeof raw.createdAt !== 'string') return { code: 'snapshot-invalid', message: '`createdAt` doit être une chaîne.' };
  if (typeof raw.complete !== 'boolean') return { code: 'snapshot-invalid', message: '`complete` doit être un booléen.' };
  if (!Array.isArray(raw.entries)) return { code: 'snapshot-invalid', message: '`entries` doit être un tableau.' };
  return null;
}

/**
 * Motif d'invalidité structurelle d'une entrée (§4.5, `entry-invalid`), ou
 * `null`. Les champs inconnus ne sont pas examinés (passthrough).
 */
export function entryStructureError(raw: unknown): string | null {
  if (!isRecord(raw)) return 'objet attendu';
  if (typeof raw.path !== 'string') return '`path` doit être une chaîne';
  if (typeof raw.kind !== 'string' || !KINDS.has(raw.kind)) return `\`kind\` inconnu (« ${String(raw.kind)} »)`;
  if (typeof raw.size !== 'number' || !Number.isInteger(raw.size) || raw.size < 0) {
    return '`size` doit être un entier positif ou nul';
  }
  if (raw.state !== undefined && (typeof raw.state !== 'string' || !STATES.has(raw.state))) {
    return `\`state\` inconnu (« ${String(raw.state)} »)`;
  }
  if (raw.hashes !== undefined) {
    if (!isRecord(raw.hashes)) return '`hashes` doit être un objet';
    for (const [alg, value] of Object.entries(raw.hashes)) {
      if (alg === 'sha256' || alg === 'dropbox') {
        if (typeof value !== 'string' || !HEX64.test(value)) return `\`${alg}\` doit faire 64 chiffres hexadécimaux minuscules`;
      } else if (alg.startsWith('x-')) {
        if (typeof value !== 'string') return `\`${alg}\` doit être une chaîne`;
      } else {
        return `algorithme « ${alg} » ni enregistré ni préfixé \`x-\``;
      }
    }
  }
  return null;
}

/**
 * Lit un ContentSnapshot (§4.5) depuis du JSON ou un objet déjà parsé.
 *
 * Applique le rejet structurel de la spec : ce qui n'est pas un snapshot, une
 * version inconnue — un lecteur n'interprète jamais un format qu'il ne connaît
 * pas —, un champ requis mal typé, une entrée structurellement invalide ou un
 * chemin en double lèvent. Conserve les champs inconnus. Ne recalcule pas
 * l'identifiant et ne réordonne pas les entrées : c'est le rôle de
 * `validateSnapshot`, qui rend des diagnostics au lieu de lever.
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
  const structure = snapshotStructureError(raw);
  if (structure !== null) throw new SnapshotFormatError(structure.code, structure.message);

  const entries = (raw as { entries: unknown[] }).entries;
  const seen = new Set<string>();
  entries.forEach((entry, index) => {
    const error = entryStructureError(entry);
    if (error !== null) throw new SnapshotFormatError('snapshot-invalid', `entries[${index}] : ${error}.`);
    const { path } = entry as SnapshotEntry;
    if (seen.has(path)) throw new SnapshotFormatError('snapshot-invalid', `chemin en double « ${path} ».`);
    seen.add(path);
  });
  return raw as ContentSnapshot;
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
