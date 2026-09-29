import { basename, compareCanonical, dirname, isIndexFile } from './paths.js';
import { indexFolders, owningFolder } from './series.js';
import type { ContentChangeSet, ContentSnapshot, SnapshotEntry } from './types.js';

/** Série déplacée : son dossier a changé de chemin. */
export interface MovedSeries {
  readonly from: string;
  readonly to: string;
}

/** Résumé d'un changeset à l'échelle des séries. */
export interface ChangeSetSummary {
  /** Dossiers de série (porteurs d'un fichier index, sections comprises), triés. */
  readonly series: {
    readonly added: readonly string[];
    readonly modified: readonly string[];
    readonly deleted: readonly string[];
    readonly moved: readonly MovedSeries[];
  };
  /** Nombre d'entrées par nature de changement. */
  readonly entries: {
    readonly added: number;
    readonly modified: number;
    readonly deleted: number;
    readonly moved: number;
  };
}

/**
 * Résume un changeset en séries ajoutées, modifiées, supprimées et déplacées.
 *
 * Une série est un dossier porteur d'un fichier index. Elle est **déplacée**
 * quand l'un de ses fichiers index a été déplacé (§2.7) vers un dossier qui
 * n'était pas une série, depuis un dossier qui n'en est plus une : renommer une
 * section de rangement qui contient N séries produit N séries déplacées. Une
 * série déplacée n'apparaît ni en ajout, ni en suppression, ni en modification.
 *
 * Une série est **modifiée** quand un changement touche un fichier dont elle
 * est le dossier de série le plus proche — un changement dans une sous-série
 * est imputé à la sous-série, pas à son conteneur.
 */
export function summarizeChangeSet(
  changeSet: ContentChangeSet,
  base: ContentSnapshot | null,
  target: ContentSnapshot,
): ChangeSetSummary {
  const baseFolders = indexFolders(base?.entries ?? []);
  const targetFolders = indexFolders(target.entries);

  const moved = new Map<string, string>();
  for (const move of changeSet.moved) {
    if (!isIndexFile(basename(move.from)) || !isIndexFile(basename(move.to))) continue;
    const from = dirname(move.from);
    const to = dirname(move.to);
    if (from === to || targetFolders.has(from) || baseFolders.has(to) || moved.has(from)) continue;
    moved.set(from, to);
  }
  const movedTargets = new Set(moved.values());

  const added = [...targetFolders.keys()].filter((folder) => !baseFolders.has(folder) && !movedTargets.has(folder));
  const deleted = [...baseFolders.keys()].filter((folder) => !targetFolders.has(folder) && !moved.has(folder));

  const modified = new Set<string>();
  const touch = (entry: SnapshotEntry, folders: ReadonlyMap<string, unknown>) => {
    const folder = owningFolder(entry.path, folders);
    if (folder !== null && baseFolders.has(folder) && targetFolders.has(folder)) modified.add(folder);
  };
  for (const entry of changeSet.added) touch(entry, targetFolders);
  for (const entry of changeSet.deleted) touch(entry, baseFolders);
  for (const { before, after } of changeSet.modified) {
    touch(before, baseFolders);
    touch(after, targetFolders);
  }
  for (const { before, after } of changeSet.moved) {
    touch(before, baseFolders);
    touch(after, targetFolders);
  }

  return {
    series: {
      added: added.sort(compareCanonical),
      modified: [...modified].sort(compareCanonical),
      deleted: deleted.sort(compareCanonical),
      moved: [...moved].map(([from, to]) => ({ from, to })).sort((a, b) => compareCanonical(a.to, b.to)),
    },
    entries: {
      added: changeSet.added.length,
      modified: changeSet.modified.length,
      deleted: changeSet.deleted.length,
      moved: changeSet.moved.length,
    },
  };
}
