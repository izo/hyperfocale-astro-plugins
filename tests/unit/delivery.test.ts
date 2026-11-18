/**
 * Profil Livraison : primitives pures du sondage (`@regrets/hyperfocale/delivery`).
 */
import { describe, expect, it } from 'vitest';
import {
  POLL_SCORES,
  RESPONSES_DIR,
  buildPollDocument,
  parsePollDocument,
  pollReportPath,
  pollResponsePath,
  readDelivery,
  renderPoll,
  scoresByFile,
  validateScores,
} from '../../src/delivery.js';

const FILES = ['media/a.jpg', 'media/b.jpg'];

describe('échelle et emplacements', () => {
  it('échelle fixe de 1 à 5', () => {
    expect(POLL_SCORES).toEqual([1, 2, 3, 4, 5]);
  });

  it('une réponse se range sous le dossier réservé, par chemin de série', () => {
    expect(RESPONSES_DIR).toBe('_responses');
    expect(pollResponsePath('clients/dupont')).toBe('_responses/clients/dupont/poll.json');
    expect(pollReportPath('clients/dupont')).toBe('_responses/clients/dupont/poll.md');
  });
});

describe('readDelivery', () => {
  it('lit le bloc delivery:', () => {
    expect(readDelivery({ delivery: { download: true, poll: true } })).toEqual({ download: true, poll: true });
    expect(readDelivery({ delivery: { poll: true } })).toEqual({ download: false, poll: true });
  });

  it.each([
    ['bloc absent', {}],
    ['frontmatter absent', null],
    ['bloc non objet', { delivery: true }],
    ['bloc liste', { delivery: [{ poll: true }] }],
    ['chaîne "true"', { delivery: { poll: 'true', download: 'yes' } }],
    ['entier', { delivery: { poll: 1, download: 1 } }],
  ])('seul un booléen true active un champ : %s', (_label, frontmatter) => {
    expect(readDelivery(frontmatter)).toEqual({ download: false, poll: false });
  });
});

describe('validateScores', () => {
  it('accepte une note entière de 1 à 5 par image, dans l’ordre de la série', () => {
    expect(validateScores(FILES, { 'media/b.jpg': 5, 'media/a.jpg': 1 })).toEqual([
      { file: 'media/a.jpg', score: 1 },
      { file: 'media/b.jpg', score: 5 },
    ]);
  });

  it.each([
    ['image manquante', { 'media/a.jpg': 3 }],
    ['image inconnue en plus', { 'media/a.jpg': 3, 'media/b.jpg': 3, 'media/c.jpg': 3 }],
    ['image inconnue à la place', { 'media/a.jpg': 3, 'media/z.jpg': 3 }],
    ['note 0', { 'media/a.jpg': 0, 'media/b.jpg': 3 }],
    ['note 6', { 'media/a.jpg': 6, 'media/b.jpg': 3 }],
    ['note décimale', { 'media/a.jpg': 2.5, 'media/b.jpg': 3 }],
    ['note en chaîne', { 'media/a.jpg': '3', 'media/b.jpg': 3 }],
    ['tableau', [3, 3]],
    ['null', null],
  ])('refuse : %s', (_label, input) => {
    expect(validateScores(FILES, input)).toBeNull();
  });

  it('refuse tout envoi pour une série sans image', () => {
    expect(validateScores([], {})).toBeNull();
  });

  it('ne lit pas le prototype', () => {
    expect(validateScores(['constructor'], {})).toBeNull();
    expect(validateScores(['__proto__'], JSON.parse('{"__proto__": 3}'))).toEqual([{ file: '__proto__', score: 3 }]);
  });
});

describe('document de réponse', () => {
  const scores = [
    { file: 'media/a.jpg', score: 2 },
    { file: 'media/b.jpg', score: 4 },
  ];
  const first = buildPollDocument('clients/dupont', scores, null, new Date('2026-11-18T10:00:00Z'));

  it('version 1, dates du premier et du dernier envoi', () => {
    expect(first).toEqual({
      version: 1,
      series: 'clients/dupont',
      submitted_at: '2026-11-18T10:00:00.000Z',
      updated_at: '2026-11-18T10:00:00.000Z',
      scores,
    });
    const second = buildPollDocument('clients/dupont', scores, first, new Date('2026-11-19T09:00:00Z'));
    expect(second.submitted_at).toBe(first.submitted_at);
    expect(second.updated_at).toBe('2026-11-19T09:00:00.000Z');
  });

  it('se relit, et refuse un document étranger', () => {
    expect(parsePollDocument(JSON.stringify(first))).toEqual(first);
    expect(scoresByFile(first)).toEqual({ 'media/a.jpg': 2, 'media/b.jpg': 4 });
    for (const raw of ['pas du json', 'null', '{"version":2}', JSON.stringify({ ...first, scores: [{ file: 'a', score: 9 }] }), JSON.stringify({ ...first, scores: 'x' })]) {
      expect(parsePollDocument(raw), raw).toBeNull();
    }
  });

  it('rendu lisible : images classées par note, modification mentionnée seulement si elle a eu lieu', () => {
    const md = renderPoll(first, { title: 'Dupont' });
    expect(md).toContain('# Sondage — Dupont');
    expect(md).toContain('| 4 / 5 | b.jpg |');
    expect(md.indexOf('b.jpg')).toBeLessThan(md.indexOf('a.jpg'));
    expect(md).not.toContain('Modifié');
    const edited = renderPoll({ ...first, updated_at: '2026-11-19T08:30:00.000Z' }, { locale: 'en' });
    expect(edited).toContain('# Poll — clients/dupont');
    expect(edited).toContain('- Edited on : 2026-11-19 08:30 UTC');
  });

  it('un nom de fichier ne casse pas le tableau', () => {
    const md = renderPoll({ ...first, scores: [{ file: 'media/a|b.jpg', score: 3 }] });
    expect(md).toContain('| 3 / 5 | a\\|b.jpg |');
  });
});
