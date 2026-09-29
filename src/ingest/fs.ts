/**
 * `@regrets/hyperfocale/ingest/fs` — provider filesystem et matérialisation.
 *
 * Node uniquement (`node:fs`, `node:crypto`). Le reste du contrat vit dans
 * `@regrets/hyperfocale/ingest`, qui n'importe rien de ce module.
 */

import { createHash, randomBytes, type Hash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readdir, readFile, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { mapConcurrent } from './concurrency.js';
import { DROPBOX_BLOCK_SIZE } from './hash.js';
import { classifyPath, compareCanonical, isExcluded, normalizePath } from './paths.js';
import type { ExclusionRule } from './paths.js';
import type {
  ContentChangeSet,
  ContentProvider,
  HashMap,
  ProviderCallOptions,
  ProviderCapabilities,
  ProviderListing,
  SnapshotEntry,
} from './types.js';

/** Algorithmes calculables localement (§4.4). */
export type LocalHashAlgorithm = 'sha256' | 'dropbox';

const ALL_ALGORITHMS: readonly LocalHashAlgorithm[] = ['sha256', 'dropbox'];

/**
 * Hachage en flux des deux algorithmes enregistrés, en une seule passe.
 * Le content hash Dropbox découpe le flux en blocs de 4 Mio quelle que soit la
 * taille des morceaux reçus.
 */
class StreamHasher {
  private readonly sha?: Hash;
  private readonly dropbox?: Hash;
  private block: Hash | undefined;
  private blockFill = 0;
  size = 0;

  constructor(algorithms: readonly LocalHashAlgorithm[]) {
    if (algorithms.includes('sha256')) this.sha = createHash('sha256');
    if (algorithms.includes('dropbox')) this.dropbox = createHash('sha256');
  }

  update(chunk: Uint8Array): void {
    this.size += chunk.length;
    this.sha?.update(chunk);
    if (this.dropbox === undefined) return;
    for (let offset = 0; offset < chunk.length; ) {
      const take = Math.min(DROPBOX_BLOCK_SIZE - this.blockFill, chunk.length - offset);
      this.block ??= createHash('sha256');
      this.block.update(chunk.subarray(offset, offset + take));
      this.blockFill += take;
      offset += take;
      if (this.blockFill === DROPBOX_BLOCK_SIZE) this.flushBlock();
    }
  }

  private flushBlock(): void {
    if (this.block === undefined) return;
    this.dropbox?.update(this.block.digest());
    this.block = undefined;
    this.blockFill = 0;
  }

  digest(): Record<string, string> {
    const hashes: Record<string, string> = {};
    if (this.sha !== undefined) hashes.sha256 = this.sha.digest('hex');
    if (this.dropbox !== undefined) {
      this.flushBlock();
      hashes.dropbox = this.dropbox.digest('hex');
    }
    return hashes;
  }
}

/** Empreintes (`sha256`, `dropbox`) d'octets en mémoire. */
export function hashBytes(bytes: Uint8Array, algorithms: readonly LocalHashAlgorithm[] = ALL_ALGORITHMS): HashMap {
  const hasher = new StreamHasher(algorithms);
  hasher.update(bytes);
  return hasher.digest();
}

/** Taille et empreintes d'un fichier, lu en flux — jamais chargé en entier. */
export async function hashFile(
  file: string,
  algorithms: readonly LocalHashAlgorithm[] = ALL_ALGORITHMS,
): Promise<{ size: number; hashes: HashMap }> {
  const hasher = new StreamHasher(algorithms);
  for await (const chunk of createReadStream(file, { highWaterMark: 1024 * 1024 })) {
    hasher.update(chunk as Buffer);
  }
  return { size: hasher.size, hashes: hasher.digest() };
}

/** Options du `FilesystemProvider`. */
export interface FilesystemProviderOptions {
  /** Dossier racine du corpus. */
  readonly root: string;
  /** Exclusions du consumer, en plus de celles du contrat (§4.2). */
  readonly ignore?: readonly ExclusionRule[];
  /** Défaut : `sha256` et `dropbox`. */
  readonly hashAlgorithms?: readonly LocalHashAlgorithm[];
  /** Fichiers hachés simultanément. Défaut 8. */
  readonly concurrency?: number;
}

/**
 * Provider filesystem : parcours récursif d'un dossier local.
 *
 * - Exclusions du contrat (§4.2) et du consumer appliquées dès le dossier : un
 *   `.git/` n'est jamais parcouru.
 * - Chemins normalisés NFC — APFS rend les noms tels qu'écrits, souvent NFD
 *   depuis le Finder. Un chemin invalide au sens du §4.1 (`\` dans un nom sous
 *   Linux) est listé tel quel : c'est à `validateSnapshot` de le signaler.
 * - Un lien symbolique vers un fichier est suivi ; vers un dossier, ignoré
 *   (pas de cycle possible).
 * - Une erreur de lecture n'interrompt pas le parcours : l'entrée manque, et
 *   le listing est déclaré `complete: false` — donc impubliable.
 */
export class FilesystemProvider implements ContentProvider {
  readonly type = 'filesystem';
  readonly capabilities: ProviderCapabilities;
  private readonly root: string;
  private readonly ignore: readonly ExclusionRule[];
  private readonly algorithms: readonly LocalHashAlgorithm[];
  private readonly concurrency: number;
  // Chemin sur le disque de chaque entrée du dernier listing — il peut différer
  // du chemin NFC du contrat sur un filesystem sensible à la normalisation.
  private onDisk = new Map<string, string>();

  constructor(options: FilesystemProviderOptions) {
    this.root = options.root;
    this.ignore = options.ignore ?? [];
    this.algorithms = options.hashAlgorithms ?? ALL_ALGORITHMS;
    this.concurrency = options.concurrency ?? 8;
    this.capabilities = {
      localRead: true,
      localWrite: true,
      remoteRead: false,
      remoteWrite: false,
      incrementalChanges: false,
      stableIdentity: false,
      serverWebhook: false,
      clientChangeObservation: false,
      materializationAware: false,
      hashAlgorithms: [...this.algorithms],
    };
  }

  async list(opts: ProviderCallOptions = {}): Promise<ProviderListing> {
    let complete = true;
    const files: Array<{ path: string; abs: string }> = [];

    // `rawDir` : chemin tel que sur le disque (un filesystem Linux distingue NFC
    // et NFD) ; `relDir` : le même, normalisé, pour le contrat.
    const walk = async (rawDir: string, relDir: string): Promise<void> => {
      opts.signal?.throwIfAborted();
      let dirents;
      try {
        dirents = await readdir(join(this.root, rawDir), { withFileTypes: true });
      } catch (err) {
        if (rawDir === '') throw err;
        complete = false;
        return;
      }
      for (const dirent of dirents) {
        const path = (relDir === '' ? dirent.name : `${relDir}/${dirent.name}`).normalize('NFC');
        const raw = join(rawDir, dirent.name);
        if (dirent.isDirectory()) {
          if (!isExcluded(`${path}/`, this.ignore)) await walk(raw, path);
          continue;
        }
        if (isExcluded(path, this.ignore)) continue;
        const abs = join(this.root, raw);
        let isFile = dirent.isFile();
        if (dirent.isSymbolicLink()) {
          try {
            isFile = (await stat(abs)).isFile();
          } catch {
            complete = false;
            continue;
          }
        }
        if (isFile) files.push({ path, abs });
      }
    };
    await walk('', '');

    const entries = await mapConcurrent(files, this.concurrency, async ({ path, abs }) => {
      opts.signal?.throwIfAborted();
      try {
        const [info, { size, hashes }] = await Promise.all([stat(abs), hashFile(abs, this.algorithms)]);
        return { path, kind: classifyPath(path), size, hashes, modifiedAt: info.mtime.toISOString() } as SnapshotEntry;
      } catch {
        complete = false;
        return null;
      }
    });

    // Deux noms qui ne diffèrent que par la forme Unicode (possible sous Linux)
    // donnent le même chemin NFC : on n'en garde qu'un, et le listing n'est plus
    // fidèle — donc incomplet.
    const listed: SnapshotEntry[] = [];
    for (const entry of entries.filter((e): e is SnapshotEntry => e !== null).sort((a, b) => compareCanonical(a.path, b.path))) {
      if (listed.at(-1)?.path === entry.path) {
        complete = false;
        continue;
      }
      listed.push(entry);
    }
    this.onDisk = new Map(files.map(({ path, abs }) => [path, abs]));
    return { entries: listed, complete };
  }

  async read(path: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.onDisk.get(path) ?? resolveInside(this.root, path)));
  }

  async write(path: string, bytes: Uint8Array): Promise<SnapshotEntry> {
    const abs = resolveInside(this.root, path);
    await writeAtomic(abs, bytes);
    const info = await stat(abs);
    return {
      path,
      kind: classifyPath(path),
      size: bytes.length,
      hashes: hashBytes(bytes, this.algorithms),
      modifiedAt: info.mtime.toISOString(),
    };
  }
}

/**
 * Chemin absolu d'une entrée sous `root`. Refuse tout chemin invalide au sens
 * du §4.1 : c'est ce qui garantit qu'aucun `..` ni chemin absolu ne sort de la
 * racine.
 */
function resolveInside(root: string, path: string): string {
  const normalized = normalizePath(path);
  if (!normalized.valid || normalized.path !== path) {
    throw new Error(`[hyperfocale] chemin refusé « ${path} » : ${normalized.reason ?? 'non NFC'}.`);
  }
  return join(root, ...path.split('/'));
}

/** Écrit via un fichier temporaire voisin puis `rename` : jamais de fichier à moitié écrit. */
async function writeAtomic(abs: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(abs), { recursive: true });
  const tmp = `${abs}.hyperfocale-${randomBytes(6).toString('hex')}.tmp`;
  try {
    await writeFile(tmp, bytes);
    await rename(tmp, abs);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

async function exists(abs: string): Promise<boolean> {
  try {
    await lstat(abs);
    return true;
  } catch {
    return false;
  }
}

/** Le contenu lu ne correspond pas à l'empreinte du snapshot. */
export class ContentMismatchError extends Error {
  readonly path: string;

  constructor(path: string, algorithm: string) {
    super(`[hyperfocale] « ${path} » : le contenu lu ne correspond pas à l'empreinte ${algorithm} du snapshot.`);
    this.name = 'ContentMismatchError';
    this.path = path;
  }
}

/** Options de `materializeSnapshot`. */
export interface MaterializeOptions {
  /** Dossier à mettre dans l'état de target. */
  readonly targetDir: string;
  /** Octets d'une entrée de target (typiquement `provider.read`). */
  readonly read: (path: string) => Promise<Uint8Array>;
  /**
   * Vérifie chaque contenu lu contre les empreintes `sha256` / `dropbox` de
   * l'entrée — le fichier a pu changer chez le provider depuis le listing.
   * Défaut `true`. Sans algorithme vérifiable (`x-etag` seul), pas de contrôle.
   */
  readonly verify?: boolean;
  /** Lectures simultanées. Défaut 4. */
  readonly concurrency?: number;
}

/** Bilan d'une matérialisation. */
export interface MaterializeResult {
  readonly written: number;
  readonly moved: number;
  readonly deleted: number;
}

/**
 * Applique un changeset à un dossier qui reflète l'état `base` pour le mettre
 * dans l'état `target`.
 *
 * 1. suppressions ;
 * 2. déplacements, en deux temps via un dossier temporaire (`.hyperfocale-…`,
 *    exclu de tout snapshot) : un fichier peut en remplacer un autre, ou un
 *    fichier devenir dossier ;
 * 3. ajouts et modifications, écrits de façon atomique.
 *
 * Un déplacement dont la source manque localement, ou dont le contenu a
 * changé, est relu depuis `read`. Ne supprime jamais un chemin absent du
 * changeset ; les dossiers laissés vides par une suppression ou un
 * déplacement sont retirés, en remontant tant qu'ils sont vides — un
 * `.DS_Store` suffit à arrêter la remontée.
 */
export async function materializeSnapshot(
  changeSet: ContentChangeSet,
  options: MaterializeOptions,
): Promise<MaterializeResult> {
  const { targetDir } = options;
  const verify = options.verify ?? true;
  const concurrency = options.concurrency ?? 4;
  const vacated = new Set<string>();

  const fetchVerified = async (entry: SnapshotEntry): Promise<Uint8Array> => {
    const bytes = await options.read(entry.path);
    if (verify) {
      const expected = entry.hashes ?? {};
      const algorithms = ALL_ALGORITHMS.filter((alg) => expected[alg] !== undefined);
      if (algorithms.length > 0) {
        const actual = hashBytes(bytes, algorithms);
        for (const alg of algorithms) {
          if (actual[alg] !== expected[alg]) throw new ContentMismatchError(entry.path, alg);
        }
      }
    }
    return bytes;
  };

  // Chemins validés d'entrée de jeu : aucune écriture si l'un d'eux est refusé.
  const abs = (path: string) => resolveInside(targetDir, path);
  for (const e of changeSet.deleted) abs(e.path);
  for (const e of changeSet.added) abs(e.path);
  for (const m of changeSet.modified) abs(m.path);
  for (const m of changeSet.moved) {
    abs(m.from);
    abs(m.to);
  }

  let deleted = 0;
  for (const entry of changeSet.deleted) {
    const file = abs(entry.path);
    if (await exists(file)) {
      await rm(file, { force: true });
      deleted++;
    }
    vacated.add(dirname(file));
  }

  const staging = join(targetDir, `.hyperfocale-materialize-${randomBytes(6).toString('hex')}`);
  const staged = new Map<number, string>();
  for (const [i, move] of changeSet.moved.entries()) {
    const from = abs(move.from);
    if (move.modified || !(await exists(from))) {
      if (await exists(from)) await rm(from, { force: true });
    } else {
      await mkdir(staging, { recursive: true });
      const parked = join(staging, String(i));
      await rename(from, parked);
      staged.set(i, parked);
    }
    vacated.add(dirname(from));
  }

  await pruneEmptyDirs(vacated, targetDir);

  const toFetch: SnapshotEntry[] = [...changeSet.added, ...changeSet.modified.map((m) => m.after)];
  for (const [i, move] of changeSet.moved.entries()) {
    const parked = staged.get(i);
    if (parked === undefined) {
      toFetch.push(move.after);
      continue;
    }
    const to = abs(move.to);
    await mkdir(dirname(to), { recursive: true });
    await rename(parked, to);
  }
  if (staged.size > 0) await rm(staging, { recursive: true, force: true });

  await mapConcurrent(toFetch, concurrency, async (entry) => writeAtomic(abs(entry.path), await fetchVerified(entry)));

  return {
    written: changeSet.added.length + changeSet.modified.length,
    moved: changeSet.moved.length,
    deleted,
  };
}

/** Retire les dossiers vides, en remontant jusqu'à `root` exclu. */
async function pruneEmptyDirs(dirs: Iterable<string>, root: string): Promise<void> {
  const stop = root.endsWith(sep) ? root.slice(0, -1) : root;
  // Du plus profond au moins profond, pour qu'un parent soit vidé avant d'être testé.
  const ordered = [...dirs].sort((a, b) => b.length - a.length);
  for (let dir of ordered) {
    while (dir.length > stop.length && dir.startsWith(stop)) {
      try {
        await rmdir(dir);
      } catch {
        break; // non vide, ou déjà retiré
      }
      dir = dirname(dir);
    }
  }
}
