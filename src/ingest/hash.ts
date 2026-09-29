import { compareCanonical } from './paths.js';
import type { HashMap, SnapshotEntry } from './types.js';

/** Taille d'un bloc du content hash Dropbox (§4.4) : 4 Mio. */
export const DROPBOX_BLOCK_SIZE = 4 * 1024 * 1024;

const encoder = new TextEncoder();

/** Hexadécimal minuscule d'une suite d'octets. */
export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let hex = '';
  for (const byte of view) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

/** Octets UTF-8 d'une chaîne. */
export function utf8(text: string): Uint8Array {
  return encoder.encode(text);
}

// WebCrypto attend un `BufferSource` adossé à un `ArrayBuffer` ; une vue sur un
// `SharedArrayBuffer` est refusée par les types. On passe la vue telle quelle.
function digestInput(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes as Uint8Array<ArrayBuffer>;
}

/** SHA-256 hexadécimal via WebCrypto — Node, navigateurs, Workers. */
export async function sha256Hex(bytes: Uint8Array | string): Promise<string> {
  const data = typeof bytes === 'string' ? utf8(bytes) : bytes;
  return toHex(await crypto.subtle.digest('SHA-256', digestInput(data)));
}

/**
 * Content hash Dropbox via WebCrypto (§4.4) : SHA-256 de chaque bloc de 4 Mio,
 * concaténation des digests **binaires**, SHA-256 du tout. Fichier vide →
 * SHA-256 de la chaîne vide.
 *
 * Tient tout le contenu en mémoire ; `./ingest/fs` fournit la version en flux.
 */
export async function dropboxContentHash(bytes: Uint8Array): Promise<string> {
  const digests = new Uint8Array(Math.ceil(bytes.length / DROPBOX_BLOCK_SIZE) * 32);
  for (let offset = 0, i = 0; offset < bytes.length; offset += DROPBOX_BLOCK_SIZE, i++) {
    const block = bytes.subarray(offset, offset + DROPBOX_BLOCK_SIZE);
    digests.set(new Uint8Array(await crypto.subtle.digest('SHA-256', digestInput(block))), i * 32);
  }
  return toHex(await crypto.subtle.digest('SHA-256', digests));
}

/**
 * Rang de préférence d'un algorithme (§4.4) : `sha256`, puis `dropbox`, puis
 * les autres par ordre alphabétique.
 */
function preferenceOrder(a: string, b: string): number {
  const rank = (alg: string) => (alg === 'sha256' ? 0 : alg === 'dropbox' ? 1 : 2);
  return rank(a) - rank(b) || compareCanonical(a, b);
}

/** Algorithme admis à la comparaison : enregistré, ou préfixé `x-` (§4.4). */
function isComparable(alg: string): boolean {
  return alg === 'sha256' || alg === 'dropbox' || alg.startsWith('x-');
}

/**
 * Premier algorithme commun à deux jeux d'empreintes, dans l'ordre de
 * préférence du contrat (§4.4) — ou `null` s'ils n'en partagent aucun. Un nom
 * ni enregistré ni préfixé `x-` n'entre dans aucune comparaison.
 */
export function commonHashAlgorithm(a: HashMap | undefined, b: HashMap | undefined): string | null {
  if (a === undefined || b === undefined) return null;
  const shared = Object.keys(a).filter((alg) => isComparable(alg) && Object.hasOwn(b, alg));
  if (shared.length === 0) return null;
  return shared.sort(preferenceOrder)[0] as string;
}

/** Verdict de comparaison du contenu de deux entrées (règle 1 de §4.7). */
export type ContentComparison = 'same' | 'different' | 'incomparable';

/**
 * Compare deux entrées selon la règle 1 de §4.7.
 *
 * `kind` ou `size` différents → `different`, sans regarder les empreintes.
 * Sinon on compare le premier algorithme commun ; s'il n'y en a aucun, le
 * verdict est `incomparable` — que l'appelant traite comme une modification :
 * jamais « inchangé » par défaut.
 */
export function compareEntryContent(a: SnapshotEntry, b: SnapshotEntry): ContentComparison {
  if (a.kind !== b.kind) return 'different';
  return compareSizeAndHashes(a, b);
}

/**
 * Comme `compareEntryContent`, sans `kind` : pour un déplacement (§4.7,
 * règle 3), `kind` dérive du chemin, qui change par définition.
 */
export function compareSizeAndHashes(a: SnapshotEntry, b: SnapshotEntry): ContentComparison {
  if (a.size !== b.size) return 'different';
  const alg = commonHashAlgorithm(a.hashes, b.hashes);
  if (alg === null) return 'incomparable';
  return a.hashes?.[alg] === b.hashes?.[alg] ? 'same' : 'different';
}

/** Ligne canonique d'une entrée pour l'identifiant de snapshot (§4.6). */
function idLine(entry: SnapshotEntry): string {
  const hashes = Object.entries(entry.hashes ?? {})
    .sort(([a], [b]) => compareCanonical(a, b))
    .map(([alg, hex]) => `${alg}=${hex}`)
    .join(',');
  return `${entry.path}\t${entry.kind}\t${entry.size}\t${hashes}\n`;
}

/**
 * Identifiant d'un snapshot (§4.6) : `sha256:` + SHA-256 de la concaténation,
 * dans l'ordre canonique, des lignes `<path>\t<kind>\t<size>\t<alg>=<hex>,…\n`.
 *
 * `identity`, `modifiedAt`, `state`, `createdAt` et `source` n'y entrent pas :
 * même état source et mêmes algorithmes → même identifiant.
 */
export async function computeSnapshotId(entries: readonly SnapshotEntry[]): Promise<string> {
  const lines = [...entries].sort((a, b) => compareCanonical(a.path, b.path)).map(idLine);
  return `sha256:${await sha256Hex(lines.join(''))}`;
}
