import { compareDiagnostics } from './diff.js';
import { decodeText, parseFrontmatter } from './frontmatter.js';
import { basename, dirname, isIndexFile } from './paths.js';
import { countKind } from './snapshot.js';
import { summarizeChangeSet } from './summary.js';
import type { ContentChangeSet, ContentSnapshot, Diagnostic, EntryKind, ReadFn, SnapshotEntry } from './types.js';

/**
 * Seuils de la garde de publication (§2.11). Le mécanisme est générique, les
 * seuils appartiennent au consumer ; un seuil absent désactive son contrôle.
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

/**
 * Lecture des fichiers index de part et d'autre du changeset — nécessaire au
 * contrôle `guard-private-exposed`, qui compare le flag `private` de base et
 * de target. Seuls les fichiers index dont le contenu a changé sont lus.
 */
export interface GuardReaders {
  readonly readBase: ReadFn;
  readonly readTarget: ReadFn;
}

function guard(code: Diagnostic['code'], severity: Diagnostic['severity'], message: string, path?: string): Diagnostic {
  return { code, severity, ...(path !== undefined ? { path } : {}), message, rule: '§2.11' };
}

async function isPrivate(read: ReadFn, path: string): Promise<boolean> {
  const result = parseFrontmatter(decodeText(await read(path)));
  return result.status === 'ok' && result.data.private === true;
}

/**
 * Garde de publication (§2.11) : rend des diagnostics `guard-*`. Une erreur
 * interdit l'auto-publication — la décision reste au consumer.
 *
 * - `guard-snapshot-incomplete`, `guard-snapshot-empty` : toujours actifs, non
 *   désactivables ;
 * - `guard-mass-deletion` : séries supprimées > `maxDeletedSeries`, ou médias
 *   supprimés > `maxDeletedMediaRatio` × médias de base ;
 * - `guard-mass-move` (warning) : séries déplacées > `maxMovedSeries` ;
 * - `guard-private-exposed` : un fichier index `private: true` dans base ne
 *   l'est plus dans target (flag retiré ou passé à `false`), à chemin constant
 *   ou après déplacement ;
 * - `guard-oversize` : une entrée ajoutée, modifiée ou déplacée dépasse
 *   `maxFileBytes[kind]`.
 */
export async function guardChangeSet(
  changeSet: ContentChangeSet,
  base: ContentSnapshot | null,
  target: ContentSnapshot,
  policy: GuardPolicy,
  readers: GuardReaders,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];

  if (!target.complete) {
    diagnostics.push(guard('guard-snapshot-incomplete', 'error', 'Snapshot incomplet : publication interdite.'));
  }
  if (countKind(target.entries, 'content') === 0) {
    diagnostics.push(guard('guard-snapshot-empty', 'error', 'Snapshot sans contenu : publication interdite.'));
  }

  const summary = summarizeChangeSet(changeSet, base, target);
  const { maxDeletedSeries, maxDeletedMediaRatio, maxMovedSeries, maxFileBytes } = policy;

  if (maxDeletedSeries !== undefined && summary.series.deleted.length > maxDeletedSeries) {
    diagnostics.push(
      guard(
        'guard-mass-deletion',
        'error',
        `${summary.series.deleted.length} séries supprimées (seuil : ${maxDeletedSeries}).`,
      ),
    );
  }
  if (maxDeletedMediaRatio !== undefined) {
    const baseMedia = countKind(base?.entries ?? [], 'media');
    const deletedMedia = countKind(changeSet.deleted, 'media');
    if (deletedMedia > maxDeletedMediaRatio * baseMedia) {
      diagnostics.push(
        guard(
          'guard-mass-deletion',
          'error',
          `${deletedMedia} médias supprimés sur ${baseMedia} (seuil : ${maxDeletedMediaRatio * 100} %).`,
        ),
      );
    }
  }
  if (maxMovedSeries !== undefined && summary.series.moved.length > maxMovedSeries) {
    diagnostics.push(
      guard('guard-mass-move', 'warning', `${summary.series.moved.length} séries déplacées (seuil : ${maxMovedSeries}).`),
    );
  }

  // Fichiers index dont le contenu a changé, sur place ou en se déplaçant : un
  // move à contenu identique garde son flag, inutile de le relire.
  const candidates: Array<{ from: string; to: string }> = [
    ...changeSet.modified.map(({ path }) => ({ from: path, to: path })),
    ...changeSet.moved.filter((move) => move.modified).map(({ from, to }) => ({ from, to })),
  ].filter(({ from, to }) => isIndexFile(basename(from)) && isIndexFile(basename(to)));
  for (const { from, to } of candidates) {
    if ((await isPrivate(readers.readBase, from)) && !(await isPrivate(readers.readTarget, to))) {
      diagnostics.push(
        guard('guard-private-exposed', 'error', `« ${from} » était privée et ne l'est plus.`, dirname(to)),
      );
    }
  }

  if (maxFileBytes !== undefined) {
    const incoming: SnapshotEntry[] = [
      ...changeSet.added,
      ...changeSet.modified.map(({ after }) => after),
      ...changeSet.moved.map(({ after }) => after),
    ];
    for (const entry of incoming) {
      const limit = maxFileBytes[entry.kind];
      if (limit !== undefined && entry.size > limit) {
        diagnostics.push(
          guard('guard-oversize', 'error', `${entry.size} octets (seuil ${entry.kind} : ${limit}).`, entry.path),
        );
      }
    }
  }

  return diagnostics.sort(compareDiagnostics);
}
