/** Frontmatter hostile (SEC-010, #158) : plafonds de taille et d'alias. */
import { describe, expect, it } from 'vitest';
import { MAX_FRONTMATTER_BYTES, parseFrontmatter } from '../../../src/ingest/frontmatter.js';

const doc = (yaml: string) => `---\n${yaml}\n---\ncorps\n`;

describe('parseFrontmatter — bornes', () => {
  it('lit un frontmatter ordinaire', () => {
    expect(parseFrontmatter(doc('title: T\ntags: [a, b]'))).toEqual({ status: 'ok', data: { title: 'T', tags: ['a', 'b'] } });
  });

  it('refuse un bloc de plus de 256 Kio', () => {
    const result = parseFrontmatter(doc(`title: T\nnote: "${'x'.repeat(MAX_FRONTMATTER_BYTES)}"`));
    expect(result).toMatchObject({ status: 'invalid' });
    expect((result as { reason: string }).reason).toContain('256 Kio');
  });

  it('accepte un bloc juste sous le plafond', () => {
    const result = parseFrontmatter(doc(`title: T\nnote: "${'x'.repeat(MAX_FRONTMATTER_BYTES - 100)}"`));
    expect(result.status).toBe('ok');
  });

  it('refuse une bombe d\'alias, sans lever', () => {
    const levels = ['a0: &a0 [x, x, x, x, x, x, x, x, x]'];
    for (let i = 1; i < 12; i++) levels.push(`a${i}: &a${i} [${Array(9).fill(`*a${i - 1}`).join(', ')}]`);
    expect(parseFrontmatter(doc(`title: T\n${levels.join('\n')}`)).status).toBe('invalid');
  });

  it('tolère quelques alias', () => {
    expect(parseFrontmatter(doc('title: T\nbase: &b {w: 1}\nautre: *b')).status).toBe('ok');
  });
});
