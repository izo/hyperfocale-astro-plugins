import type { PublicationState } from './types.js';

// Transitions explicites de §4.9, hors « tout état → failed / conflict ».
const TRANSITIONS: ReadonlyMap<PublicationState | null, readonly PublicationState[]> = new Map<
  PublicationState | null,
  readonly PublicationState[]
>([
  // Amorçage : état initial avant toute publication, ou mise en service du
  // pipeline sur une production existante, depuis un snapshot déjà publié.
  [null, ['sourceDirty', 'sourceSynced']],
  ['sourceDirty', ['snapshotPending']],
  ['snapshotPending', ['validating']],
  ['validating', ['publishing']],
  ['publishing', ['published']],
  ['published', ['sourceSynced', 'sourceDirty']],
  ['sourceSynced', ['sourceDirty']],
  ['failed', ['sourceDirty', 'snapshotPending']],
  ['conflict', ['sourceDirty']],
]);

/**
 * La transition d'état de publication `from` → `to` est-elle permise (§4.9) ?
 * `from` à `null` : amorçage, vers `sourceDirty` ou `sourceSynced`. La liste de
 * la spec est exhaustive — toute autre transition est interdite —, et tout état
 * peut passer à `failed` ou à `conflict`.
 */
export function isPublicationTransition(from: PublicationState | null, to: PublicationState): boolean {
  if (from !== null && (to === 'failed' || to === 'conflict')) return true;
  return TRANSITIONS.get(from)?.includes(to) ?? false;
}
