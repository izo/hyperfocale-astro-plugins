import { finalizeDiagnostics } from './diff.js';
import { parseFrontmatter } from './frontmatter.js';
import { basename, dirname, isIndexFile } from './paths.js';
import { indexFolders } from './series.js';
import { countKind } from './snapshot.js';
import type { ContentChangeSet, ContentSnapshot, Diagnostic, EntryKind, ReadFn } from './types.js';

/**
 * Seuils de la garde de publication (§4.11). Le mécanisme est générique, les
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
 * Lecture des fichiers index de part et d'autre du changeset — nécessaire à
 * `guard-private-exposed`, qui compare le champ `private` de base et de
 * target. Seuls les fichiers index dont le contenu a changé sont lus.
 */
export interface GuardReaders {
  readonly readBase: ReadFn;
  readonly readTarget: ReadFn;
}

function guard(code: Diagnostic['code'], severity: Diagnostic['severity'], path: string, message: string): Diagnostic {
  return { code, severity, path, message, rule: '§4.11' };
}

async function isPrivate(read: ReadFn, path: string): Promise<boolean> {
  const result = parseFrontmatter(await read(path));
  return result.status === 'ok' && result.data.private === true;
}

/**
 * Garde de publication (§4.11) : rend des diagnostics `guard-*`. Une erreur
 * interdit l'auto-publication — la décision reste au consumer.
 *
 * - `guard-snapshot-incomplete`, `guard-snapshot-empty` : toujours actifs ;
 * - `guard-mass-deletion` : séries supprimées > `maxDeletedSeries`, ou médias
 *   supprimés > `maxDeletedMediaRatio` × médias de base. Une série supprimée
 *   est un dossier porteur dans base qui ne l'est plus dans target, et dont
 *   aucun fichier index n'est la source d'un `moved` ;
 * - `guard-mass-move` (warning) : séries déplacées — dossiers distincts parmi
 *   les `from` des `moved` qui désignent un fichier index — > `maxMovedSeries` ;
 * - `guard-private-exposed` : un fichier index `private: true` dans base ne
 *   l'est plus dans target (champ retiré ou passé à `false`), suivi jusqu'à sa
 *   destination s'il a été déplacé ;
 * - `guard-oversize` : une entrée de target dépasse `maxFileBytes[kind]`.
 *
 * `private` n'est pas un champ du format mais une extension de site : la garde
 * s'applique aux corpus qui l'emploient. D'où `readers`, sans lesquels elle ne
 * saurait rien du contenu des fichiers index.
 */
export async function guardChangeSet(
  changeSet: ContentChangeSet,
  base: ContentSnapshot | null,
  target: ContentSnapshot,
  policy: GuardPolicy,
  readers: GuardReaders,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const { maxDeletedSeries, maxDeletedMediaRatio, maxMovedSeries, maxFileBytes } = policy;

  if (!target.complete) {
    diagnostics.push(guard('guard-snapshot-incomplete', 'error', '', 'Snapshot incomplet : publication interdite.'));
  }
  if (countKind(target.entries, 'content') === 0) {
    diagnostics.push(guard('guard-snapshot-empty', 'error', '', 'Snapshot sans contenu : publication interdite.'));
  }

  const movedIndexes = changeSet.moved.filter((move) => isIndexFile(basename(move.from)));
  const movedSeries = new Set(movedIndexes.map((move) => dirname(move.from)));

  // Un seul `guard-mass-deletion` par changeset (au plus un diagnostic par
  // couple code/chemin, §4.10) : ses motifs se cumulent dans le message.
  const massDeletion: string[] = [];
  if (maxDeletedSeries !== undefined) {
    const targetFolders = indexFolders(target.entries);
    const deleted = [...indexFolders(base?.entries ?? []).keys()].filter(
      (folder) => !targetFolders.has(folder) && !movedSeries.has(folder),
    );
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

  // Fichiers index dont le contenu a changé, sur place ou en se déplaçant : un
  // move à contenu identique garde son champ, inutile de le relire.
  const candidates = [
    ...changeSet.modified.map(({ path }) => ({ from: path, to: path })),
    ...movedIndexes.filter((move) => move.modified).map(({ from, to }) => ({ from, to })),
  ].filter(({ from }) => isIndexFile(basename(from)));
  for (const { from, to } of candidates) {
    if ((await isPrivate(readers.readBase, from)) && !(await isPrivate(readers.readTarget, to))) {
      diagnostics.push(guard('guard-private-exposed', 'error', to, `« ${from} » était privée et ne l'est plus.`));
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
