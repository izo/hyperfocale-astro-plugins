import { describe, expect, it } from 'vitest';
import { PUBLICATION_STATES, isPublicationTransition } from '../../../src/ingest/index.js';
import type { PublicationState } from '../../../src/ingest/index.js';

describe('isPublicationTransition (§4.9)', () => {
  it('amorçage : sourceDirty, ou sourceSynced depuis une production existante', () => {
    expect(PUBLICATION_STATES.filter((to) => isPublicationTransition(null, to))).toEqual(['sourceDirty', 'sourceSynced']);
  });

  it('chemin nominal, nouvel essai et divergence', () => {
    const allowed: Array<[PublicationState, PublicationState]> = [
      ['sourceDirty', 'snapshotPending'],
      ['snapshotPending', 'validating'],
      ['validating', 'publishing'],
      ['publishing', 'published'],
      ['published', 'sourceSynced'],
      ['failed', 'snapshotPending'],
      ['sourceSynced', 'sourceDirty'],
      ['published', 'sourceDirty'],
      ['failed', 'sourceDirty'],
      ['conflict', 'sourceDirty'],
    ];
    for (const [from, to] of allowed) expect(isPublicationTransition(from, to), `${from} → ${to}`).toBe(true);
  });

  it('tout état peut échouer ou entrer en conflit, pas l\'amorçage', () => {
    for (const from of PUBLICATION_STATES) {
      expect(isPublicationTransition(from, 'failed')).toBe(true);
      expect(isPublicationTransition(from, 'conflict')).toBe(true);
    }
    expect(isPublicationTransition(null, 'failed')).toBe(false);
  });

  it('la liste est exhaustive : le reste est interdit', () => {
    const forbidden: Array<[PublicationState | null, PublicationState]> = [
      [null, 'published'],
      ['sourceDirty', 'published'],
      ['validating', 'published'],
      ['snapshotPending', 'publishing'],
      ['conflict', 'snapshotPending'],
      ['sourceSynced', 'snapshotPending'],
      ['published', 'publishing'],
    ];
    for (const [from, to] of forbidden) expect(isPublicationTransition(from, to), `${from} → ${to}`).toBe(false);
  });
});
