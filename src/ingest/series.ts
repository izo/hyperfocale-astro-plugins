import { basename, compareCanonical, dirname, isDefaultIndexFile, isIndexFile } from './paths.js';
import type { SnapshotEntry } from './types.js';

/**
 * Dossiers porteurs d'un fichier index — une « série » au sens du contrat
 * d'ingestion, sections comprises (§4.10) — avec leurs fichiers index triés.
 */
export function indexFolders(entries: readonly SnapshotEntry[]): Map<string, string[]> {
  const folders = new Map<string, string[]>();
  for (const entry of entries) {
    if (entry.kind !== 'content' || !isIndexFile(basename(entry.path))) continue;
    const folder = dirname(entry.path);
    const list = folders.get(folder) ?? [];
    list.push(entry.path);
    folders.set(folder, list);
  }
  for (const list of folders.values()) list.sort(compareCanonical);
  return folders;
}

/**
 * Fichier index de référence d'un dossier : `index.md`, sinon `index.mdx`,
 * sinon le premier `index.<lang>.md` dans l'ordre canonique.
 */
export function primaryIndex(indexPaths: readonly string[]): string {
  return (
    indexPaths.find((path) => basename(path) === 'index.md') ??
    indexPaths.find((path) => isDefaultIndexFile(basename(path))) ??
    (indexPaths[0] as string)
  );
}

/** Dossier de série le plus proche qui contient `path` — `null` si aucun. */
export function owningFolder(path: string, folders: ReadonlyMap<string, unknown>): string | null {
  for (let dir = dirname(path); ; dir = dirname(dir)) {
    if (folders.has(dir)) return dir;
    if (dir === '') return null;
  }
}
