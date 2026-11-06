import { describe, expect, it } from 'vitest';
import { PREVIEW_LENGTH, preview, truncate } from '../../src/preview.js';

describe('truncate', () => {
  it('laisse intact un texte qui tient', () => {
    expect(truncate('x'.repeat(PREVIEW_LENGTH))).toBe('x'.repeat(PREVIEW_LENGTH));
  });

  it('coupe au-delà de la limite et le dit', () => {
    expect(truncate('x'.repeat(PREVIEW_LENGTH + 1))).toBe(`${'x'.repeat(PREVIEW_LENGTH)}…`);
  });

  it('ne laisse pas une moitié de paire de substitution', () => {
    const text = `${'x'.repeat(PREVIEW_LENGTH - 1)}😀suite`;
    const cut = truncate(text);
    expect(cut).toBe(`${'x'.repeat(PREVIEW_LENGTH - 1)}…`);
    expect(() => encodeURIComponent(cut)).not.toThrow();
  });
});

describe('preview', () => {
  it('tronque une chaîne', () => {
    expect(preview('a'.repeat(100_000)).length).toBe(PREVIEW_LENGTH + 1);
  });

  it('rend un scalaire tel quel', () => {
    expect([preview(5), preview(true), preview(null), preview(undefined)]).toEqual(['5', 'true', 'null', 'undefined']);
  });

  it('ne recopie ni une liste ni un mapping', () => {
    expect(preview(Array(50_000).fill('a'.repeat(100)))).toBe('une liste de 50000 éléments');
    expect(preview(['a'])).toBe('une liste d\'un élément');
    expect(preview({ k: 'a'.repeat(100_000) })).toBe('un mapping');
  });

  it('une date se lit, valide ou non', () => {
    expect(preview(new Date('2024-06-01T00:00:00Z'))).toBe('2024-06-01T00:00:00.000Z');
    expect(preview(new Date('nope'))).toBe('une date invalide');
  });
});
