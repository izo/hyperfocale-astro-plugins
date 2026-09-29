/**
 * `@regrets/hyperfocale/ingest/fs` — provider filesystem et matérialisation.
 *
 * Node uniquement (`node:fs`, `node:crypto`). Le reste du contrat vit dans
 * `@regrets/hyperfocale/ingest`, qui n'importe rien de ce module.
 */

import { createHash, randomBytes, type Hash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readdir, readFile, realpath, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { mapConcurrent } from './concurrency.js';
import { DROPBOX_BLOCK_SIZE } from './hash.js';
import { classifyPath, compareCanonical, isExcluded, normalizePath } from './paths.js';
import type { ExclusionRule } from './paths.js';
import type {
  ContentChangeSet,
  ContentProvider,
  HashMap,
  ListingProblem,
  MovedEntry,
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
  /**
   * Suit les liens symboliques dont la cible reste sous `root` (chemin réel).
   * Défaut `false` : tout lien, vers un fichier ou un dossier, est écarté du
   * listing, qui devient `complete: false` avec le motif dans `problems`.
   */
  readonly followSymlinks?: boolean;
}

/**
 * Provider filesystem : parcours récursif d'un dossier local.
 *
 * - Exclusions du contrat (§4.2) et du consumer appliquées dès le dossier : un
 *   `.git/` n'est jamais parcouru.
 * - Chemins normalisés NFC — APFS rend les noms tels qu'écrits, souvent NFD
 *   depuis le Finder. Un chemin invalide au sens du §4.1 (`\` dans un nom sous
 *   Linux) est listé tel quel : c'est à `validateSnapshot` de le signaler.
 * - Liens symboliques : écartés par défaut, le listing devenant incomplet — un
 *   lien peut faire entrer dans le corpus ce qui n'est pas sous `root`. Avec
 *   `followSymlinks`, seuls sont suivis ceux dont le chemin réel reste sous
 *   `root` ; les autres, et les cycles, rendent le listing incomplet.
 * - Une erreur de lecture n'interrompt pas le parcours : l'entrée manque, et
 *   le listing est déclaré `complete: false` — donc impubliable. `problems`
 *   dit pourquoi.
 * - `read` et `write` refusent tout chemin qui sortirait de `root` : segment
 *   `..`, ou lien symbolique (hors du chemin réel de `root` avec
 *   `followSymlinks`, quel qu'il soit sans).
 */
export class FilesystemProvider implements ContentProvider {
  readonly type = 'filesystem';
  readonly capabilities: ProviderCapabilities;
  private readonly root: string;
  private readonly ignore: readonly ExclusionRule[];
  private readonly algorithms: readonly LocalHashAlgorithm[];
  private readonly concurrency: number;
  private readonly followSymlinks: boolean;
  // Chemin sur le disque de chaque entrée du dernier listing — il peut différer
  // du chemin NFC du contrat sur un filesystem sensible à la normalisation.
  private onDisk = new Map<string, string>();

  constructor(options: FilesystemProviderOptions) {
    this.root = options.root;
    this.ignore = options.ignore ?? [];
    this.algorithms = options.hashAlgorithms ?? ALL_ALGORITHMS;
    this.concurrency = options.concurrency ?? 8;
    this.followSymlinks = options.followSymlinks ?? false;
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
    const problems: ListingProblem[] = [];
    const files: Array<{ path: string; abs: string }> = [];
    const realRoot = await realpath(this.root);
    const visited = new Set<string>([realRoot]);
    const excluded = (path: string) => isExcluded(path, this.ignore) || isExcluded(`${path}/`, this.ignore);

    // `rawDir` : chemin tel que sur le disque (un filesystem Linux distingue NFC
    // et NFD) ; `relDir` : le même, normalisé, pour le contrat.
    const walk = async (rawDir: string, relDir: string): Promise<void> => {
      opts.signal?.throwIfAborted();
      let dirents;
      try {
        dirents = await readdir(join(this.root, rawDir), { withFileTypes: true });
      } catch (err) {
        if (rawDir === '') throw err;
        problems.push({ path: relDir, reason: `dossier illisible (${(err as Error).message})` });
        return;
      }
      for (const dirent of dirents) {
        const path = (relDir === '' ? dirent.name : `${relDir}/${dirent.name}`).normalize('NFC');
        const raw = join(rawDir, dirent.name);
        const abs = join(this.root, raw);
        if (dirent.isDirectory()) {
          if (!isExcluded(`${path}/`, this.ignore)) await walk(raw, path);
          continue;
        }
        if (dirent.isSymbolicLink()) {
          if (excluded(path)) continue;
          if (!this.followSymlinks) {
            problems.push({ path, reason: 'lien symbolique non suivi (followSymlinks: false)' });
            continue;
          }
          let real: string;
          let info;
          try {
            real = await realpath(abs);
            info = await stat(real);
          } catch (err) {
            problems.push({ path, reason: `lien symbolique cassé (${(err as Error).message})` });
            continue;
          }
          if (real !== realRoot && !real.startsWith(`${realRoot}${sep}`)) {
            problems.push({ path, reason: 'lien symbolique hors de la racine' });
          } else if (info.isDirectory()) {
            if (visited.has(real)) problems.push({ path, reason: 'lien symbolique en cycle' });
            else {
              visited.add(real);
              if (!isExcluded(`${path}/`, this.ignore)) await walk(raw, path);
            }
          } else if (info.isFile()) {
            files.push({ path, abs });
          }
          continue;
        }
        if (dirent.isFile() && !isExcluded(path, this.ignore)) files.push({ path, abs });
      }
    };
    await walk('', '');

    const entries = await mapConcurrent(files, this.concurrency, async ({ path, abs }) => {
      opts.signal?.throwIfAborted();
      try {
        const [info, { size, hashes }] = await Promise.all([stat(abs), hashFile(abs, this.algorithms)]);
        return { path, kind: classifyPath(path), size, hashes, modifiedAt: info.mtime.toISOString() } as SnapshotEntry;
      } catch (err) {
        problems.push({ path, reason: `fichier illisible (${(err as Error).message})` });
        return null;
      }
    });

    // Deux noms qui ne diffèrent que par la forme Unicode (possible sous Linux)
    // donnent le même chemin NFC : on n'en garde qu'un, et le listing n'est plus
    // fidèle — donc incomplet.
    const listed: SnapshotEntry[] = [];
    for (const entry of entries.filter((e): e is SnapshotEntry => e !== null).sort((a, b) => compareCanonical(a.path, b.path))) {
      if (listed.at(-1)?.path === entry.path) {
        problems.push({ path: entry.path, reason: 'deux noms de même forme NFC' });
        continue;
      }
      listed.push(entry);
    }
    this.onDisk = new Map(files.map(({ path, abs }) => [path, abs]));
    problems.sort((a, b) => compareCanonical(a.path, b.path));
    return { entries: listed, complete: problems.length === 0, ...(problems.length > 0 ? { problems } : {}) };
  }

  /** Chemin absolu confiné à `root`, selon la politique de liens symboliques. */
  private async confined(path: string): Promise<string> {
    const abs = resolveInside(this.root, path);
    if (!this.followSymlinks) {
      await assertNoSymlink(this.root, path);
      return abs;
    }
    const realRoot = await realpath(this.root);
    // Le chemin réel du plus proche ancêtre existant doit rester sous `root`
    // (qui existe : `realpath` vient de le résoudre, la remontée s'y arrête).
    for (let probe = abs; ; ) {
      try {
        const real = await realpath(probe);
        if (real !== realRoot && !real.startsWith(`${realRoot}${sep}`)) throw new UnsafePathError(path, relative(this.root, probe));
        return abs;
      } catch (err) {
        const parent = dirname(probe);
        if (err instanceof UnsafePathError || parent === probe) throw err;
        probe = parent;
      }
    }
  }

  async read(path: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.onDisk.get(path) ?? (await this.confined(path))));
  }

  async write(path: string, bytes: Uint8Array): Promise<SnapshotEntry> {
    const abs = await this.confined(path);
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

/** Le contenu lu ne correspond pas à l'empreinte du snapshot (§4.4). */
export class ContentMismatchError extends Error {
  readonly code = 'entry-hash-mismatch';
  readonly path: string;

  constructor(path: string, algorithm: string) {
    super(`[hyperfocale] « ${path} » : le contenu lu ne correspond pas à l'empreinte ${algorithm} du snapshot.`);
    this.name = 'ContentMismatchError';
    this.path = path;
  }
}

/** Un chemin traverserait un lien symbolique : l'écriture pourrait sortir du dossier cible. */
export class UnsafePathError extends Error {
  readonly code = 'unsafe-path';
  readonly path: string;

  constructor(path: string, link: string) {
    super(`[hyperfocale] « ${path} » traverse le lien symbolique « ${link} » : opération refusée.`);
    this.name = 'UnsafePathError';
    this.path = path;
  }
}

/**
 * Vérifie qu'aucun composant de `path` sous `root` — le fichier compris — n'est
 * un lien symbolique. `root` lui-même peut en être un : c'est le choix de
 * l'appelant. Un composant absent arrête l'examen : ce qui n'existe pas encore
 * sera créé comme dossier ordinaire.
 */
async function assertNoSymlink(root: string, path: string): Promise<void> {
  const segments = path.split('/');
  for (let i = 1; i <= segments.length; i++) {
    const prefix = segments.slice(0, i).join('/');
    let info;
    try {
      info = await lstat(join(root, ...segments.slice(0, i)));
    } catch {
      return;
    }
    if (info.isSymbolicLink()) throw new UnsafePathError(path, prefix);
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
  /** Fichiers écrits depuis `read` : ajouts, modifications, déplacements relus. */
  readonly written: number;
  /** Déplacements appliqués, par renommage local ou relus. */
  readonly moved: number;
  /** Fichiers effectivement supprimés. */
  readonly deleted: number;
}

/**
 * Applique un changeset à un dossier qui reflète l'état `base` pour le mettre
 * dans l'état `target`, en trois temps :
 *
 * 1. **contrôle** — chaque chemin est valide au sens du §4.1 et aucun de ses
 *    composants sous `targetDir` n'est un lien symbolique (`UnsafePathError`) :
 *    rien ne s'écrit, ne se supprime ni ne se renomme hors de `targetDir` ;
 * 2. **lecture** — tout ce qui doit être écrit est lu et vérifié contre son
 *    empreinte *avant* la moindre modification, dans un dossier de transit
 *    (`.hyperfocale-…`, exclu de tout snapshot). Un contenu divergent
 *    (`ContentMismatchError`) ou une lecture en échec laisse le dossier intact ;
 * 3. **application** — suppressions, déplacements (en deux temps via le
 *    transit : un fichier peut en remplacer un autre, ou devenir dossier), puis
 *    mise en place des fichiers lus, chacun par un `rename`.
 *
 * Un déplacement dont la source manque localement, ou dont le contenu a
 * changé, est relu. Ne supprime jamais un chemin absent du changeset ; les
 * dossiers laissés vides sont retirés en remontant tant qu'ils sont vides — un
 * `.DS_Store` suffit à arrêter la remontée.
 */
export async function materializeSnapshot(
  changeSet: ContentChangeSet,
  options: MaterializeOptions,
): Promise<MaterializeResult> {
  const { targetDir } = options;
  const verify = options.verify ?? true;
  const concurrency = options.concurrency ?? 4;

  // 1. Contrôle, avant toute écriture.
  const abs = (path: string) => resolveInside(targetDir, path);
  const touched = [
    ...changeSet.deleted.map((e) => e.path),
    ...changeSet.added.map((e) => e.path),
    ...changeSet.modified.map((m) => m.path),
    ...changeSet.moved.flatMap((m) => [m.from, m.to]),
  ];
  for (const path of touched) {
    abs(path);
    await assertNoSymlink(targetDir, path);
  }

  const localMoves = new Set<number>();
  for (const [i, move] of changeSet.moved.entries()) {
    if (!move.modified && (await exists(abs(move.from)))) localMoves.add(i);
  }
  const toFetch: SnapshotEntry[] = [
    ...changeSet.added,
    ...changeSet.modified.map((m) => m.after),
    ...changeSet.moved.filter((_, i) => !localMoves.has(i)).map((m) => m.after),
  ];

  // 2. Lecture et vérification de tout ce qui sera écrit.
  const staging = join(targetDir, `.hyperfocale-materialize-${randomBytes(6).toString('hex')}`);
  await mkdir(staging, { recursive: true });
  try {
    await mapConcurrent(toFetch, concurrency, async (entry, i) => {
      const bytes = await options.read(entry.path);
      if (verify) {
        const expected = entry.hashes ?? {};
        const algorithms = ALL_ALGORITHMS.filter((alg) => expected[alg] !== undefined);
        const actual = hashBytes(bytes, algorithms);
        for (const alg of algorithms) {
          if (actual[alg] !== expected[alg]) throw new ContentMismatchError(entry.path, alg);
        }
      }
      await writeFile(join(staging, `in-${i}`), bytes);
    });
  } catch (err) {
    await rm(staging, { recursive: true, force: true });
    throw err;
  }

  // 3. Application. Les chemins sont recontrôlés : la lecture a pu être longue.
  // Sur une erreur d'entrée-sortie ici, le transit est conservé — il porte les
  // fichiers lus et les sources des déplacements — pour qu'aucun octet ne se perde.
  try {
    for (const path of touched) await assertNoSymlink(targetDir, path);
  } catch (err) {
    await rm(staging, { recursive: true, force: true });
    throw err;
  }
  const vacated = new Set<string>();
  let deleted = 0;
  for (const entry of changeSet.deleted) {
    const file = abs(entry.path);
    if (await exists(file)) {
      await rm(file, { force: true });
      deleted++;
    }
    vacated.add(dirname(file));
  }
  for (const [i, move] of changeSet.moved.entries()) {
    const from = abs(move.from);
    if (localMoves.has(i)) await rename(from, join(staging, `mv-${i}`));
    else if (await exists(from)) await rm(from, { force: true });
    vacated.add(dirname(from));
  }
  await pruneEmptyDirs(vacated, targetDir);

  const place = async (parked: string, path: string) => {
    const to = abs(path);
    await mkdir(dirname(to), { recursive: true });
    await rename(parked, to);
  };
  for (const i of localMoves) await place(join(staging, `mv-${i}`), (changeSet.moved[i] as MovedEntry).to);
  for (const [i, entry] of toFetch.entries()) await place(join(staging, `in-${i}`), entry.path);

  await rm(staging, { recursive: true, force: true });
  return { written: toFetch.length, moved: changeSet.moved.length, deleted };
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
