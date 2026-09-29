import { finalizeDiagnostics } from './diff.js';
import { parseFrontmatter } from './frontmatter.js';
import { verifyEntryBytes } from './hash.js';
import { basename, compareCanonical, dirname, isIndexFile } from './paths.js';
import { indexFolders } from './series.js';
import { countKind } from './snapshot.js';
import type { ContentChangeSet, ContentSnapshot, Diagnostic, EntryKind, SnapshotEntry } from './types.js';

/**
 * Seuils de la garde de publication (§4.11), tous facultatifs. Le mécanisme
 * est générique, les seuils appartiennent au consumer ; un seuil absent
 * désactive son contrôle.
 */
export interface GuardPolicy {
  /** Au-delà de ce nombre de séries supprimées : `guard-mass-deletion`. */
  readonly maxDeletedSeries?: number;
  /** Au-delà de cette fraction (0–1) des médias de base supprimés : `guard-mass-deletion`. */
  readonly maxDeletedMediaRatio?: number;
  /** Au-delà de ce nombre de séries déplacées : `guard-mass-move` (warning). */
  readonly maxMovedSeries?: number;
  /** Taille maximale par classe d'entrée, en octets : `guard-oversize`. */
  readonly maxFileBytes?: Partial<Record<EntryKind, number>>;
}

/** Côté du changeset dont on lit un fichier. */
export type GuardSide = 'base' | 'target';

/** Options de `guardChangeSet` (§4.11). */
export interface GuardOptions {
  /**
   * Octets du fichier `path` dans `base` ou dans `target`. La garde lit les
   * fichiers index pour connaître la confidentialité des séries.
   */
  readonly read: (side: GuardSide, path: string) => Promise<Uint8Array | string>;
  readonly policy: GuardPolicy;
}

function guard(code: Diagnostic['code'], severity: Diagnostic['severity'], path: string, message: string): Diagnostic {
  return { code, severity, path, message, rule: '§4.11' };
}

/**
 * Garde de publication (§4.11) : rend des diagnostics `guard-*`. Une erreur
 * interdit l'auto-publication — la décision reste au consumer.
 *
 * - `guard-snapshot-incomplete`, `guard-snapshot-empty`, `guard-private-exposed` :
 *   toujours évaluées ;
 * - `guard-mass-deletion` : séries supprimées > `maxDeletedSeries`, ou médias
 *   supprimés > `maxDeletedMediaRatio` × médias de base. Une série supprimée
 *   est un dossier porteur dans base qui ne l'est plus dans target, et dont
 *   aucun fichier index n'est la source d'un `moved` ;
 * - `guard-mass-move` (warning) : séries déplacées — dossiers distincts parmi
 *   les `from` des `moved` qui désignent un fichier index — > `maxMovedSeries` ;
 * - `guard-private-exposed` : une série privée dans base (au moins un fichier
 *   index matérialisé déclare `private: true`, booléen YAML), présente dans
 *   target — au même chemin, ou à la destination de ses fichiers index
 *   déplacés — et qui n'y est plus privée. Diagnostic sur son dossier dans
 *   target ; supprimer une série privée n'est pas l'exposer ;
 * - `guard-oversize` : une entrée de target dépasse `maxFileBytes[kind]`.
 *
 * Les octets lus sont vérifiés contre l'empreinte (§4.4) : un fichier qui
 * diverge produit `entry-hash-mismatch` et ne déclare rien.
 *
 * Seules sont lues les séries de base dont un fichier index a changé — les
 * autres gardent, à l'octet près, la confidentialité qu'elles avaient.
 */
export async function guardChangeSet(
  changeSet: ContentChangeSet,
  base: ContentSnapshot | null,
  target: ContentSnapshot,
  options: GuardOptions,
): Promise<Diagnostic[]> {
  const { read, policy } = options;
  const { maxDeletedSeries, maxDeletedMediaRatio, maxMovedSeries, maxFileBytes } = policy;
  const diagnostics: Diagnostic[] = [];

  if (!target.complete) {
    diagnostics.push(guard('guard-snapshot-incomplete', 'error', '', 'Snapshot incomplet : publication interdite.'));
  }
  if (countKind(target.entries, 'content') === 0) {
    diagnostics.push(guard('guard-snapshot-empty', 'error', '', 'Snapshot sans contenu : publication interdite.'));
  }

  const baseFolders = indexFolders(base?.entries ?? []);
  const targetFolders = indexFolders(target.entries);
  const movedIndexes = changeSet.moved.filter((move) => isIndexFile(basename(move.from)));
  const movedSeries = new Set(movedIndexes.map((move) => dirname(move.from)));

  // Un seul `guard-mass-deletion` par changeset (au plus un diagnostic par
  // couple code/chemin, §4.10) : ses motifs se cumulent dans le message.
  const massDeletion: string[] = [];
  if (maxDeletedSeries !== undefined) {
    const deleted = [...baseFolders.keys()].filter((folder) => !targetFolders.has(folder) && !movedSeries.has(folder));
    if (deleted.length > maxDeletedSeries) {
      massDeletion.push(`${deleted.length} séries supprimées (seuil : ${maxDeletedSeries})`);
    }
  }
  if (maxDeletedMediaRatio !== undefined) {
    const baseMedia = countKind(base?.entries ?? [], 'media');
    const deletedMedia = countKind(changeSet.deleted, 'media');
    if (deletedMedia > maxDeletedMediaRatio * baseMedia) {
      massDeletion.push(`${deletedMedia} médias supprimés sur ${baseMedia} (seuil : ${maxDeletedMediaRatio * 100} %)`);
    }
  }
  if (massDeletion.length > 0) {
    diagnostics.push(guard('guard-mass-deletion', 'error', '', `${massDeletion.join(' ; ')}.`));
  }
  if (maxMovedSeries !== undefined && movedSeries.size > maxMovedSeries) {
    diagnostics.push(
      guard('guard-mass-move', 'warning', '', `${movedSeries.size} séries déplacées (seuil : ${maxMovedSeries}).`),
    );
  }

  if (base !== null) {
    const entries = { base: new Map(base.entries.map((e) => [e.path, e])), target: new Map(target.entries.map((e) => [e.path, e])) };
    // Une série est privée si l'un de ses fichiers index matérialisés, aux
    // octets conformes, déclare `private: true` (booléen, pas la chaîne).
    const isPrivate = async (side: GuardSide, indexPaths: readonly string[]): Promise<boolean> => {
      for (const path of indexPaths) {
        const entry = entries[side].get(path) as SnapshotEntry;
        if ((entry.state ?? 'materialized') !== 'materialized') continue;
        const content = await read(side, path);
        if (!(await verifyEntryBytes(entry, content))) {
          diagnostics.push({
            code: 'entry-hash-mismatch',
            severity: 'error',
            path,
            message: `Octets lus (${side}) différents de l'empreinte : le fichier a changé depuis le listing.`,
            rule: '§4.4',
          });
          continue;
        }
        const result = parseFrontmatter(content);
        if (result.status === 'ok' && result.data.private === true) return true;
      }
      return false;
    };

    const changedIndexes = new Set([
      ...changeSet.modified.map((m) => m.path),
      ...changeSet.deleted.map((e) => e.path),
      ...changeSet.moved.map((m) => m.from),
    ]);
    for (const [folder, indexPaths] of baseFolders) {
      if (!indexPaths.some((path) => changedIndexes.has(path))) continue;
      if (!(await isPrivate('base', indexPaths))) continue;
      // Homologue dans target : même dossier s'il porte encore un fichier
      // index, sinon la destination du premier fichier index déplacé.
      const firstMove = movedIndexes
        .filter((move) => dirname(move.from) === folder)
        .sort((a, b) => compareCanonical(a.from, b.from))[0];
      const homologue = targetFolders.has(folder) ? folder : firstMove !== undefined ? dirname(firstMove.to) : null;
      if (homologue === null) continue;
      if (!(await isPrivate('target', targetFolders.get(homologue) ?? []))) {
        diagnostics.push(
          guard('guard-private-exposed', 'error', homologue, `« ${folder} » était privée et ne l'est plus.`),
        );
      }
    }
  }

  if (maxFileBytes !== undefined) {
    for (const entry of target.entries) {
      const limit = maxFileBytes[entry.kind];
      if (limit !== undefined && entry.size > limit) {
        diagnostics.push(
          guard('guard-oversize', 'error', entry.path, `${entry.size} octets (seuil ${entry.kind} : ${limit}).`),
        );
      }
    }
  }

  return finalizeDiagnostics(diagnostics);
}
