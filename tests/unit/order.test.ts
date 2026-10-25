/**
 * Ordres de la spec — §1.6 (2.13 et 2.15).
 *
 * « Alphabétique » est l'ordre canonique de §4.1, pas une collation locale ; les
 * séries se trient par date calendaire décroissante, à égalité par titre puis
 * chemin, les séries sans date en dernier.
 */

import { describe, it, expect } from 'vitest';
import { calendarDay, compareNFC, compareSeriesOrder } from '../../src/order.js';

const serie = (id: string, title: string, date?: unknown) => ({ id, data: { title, date } });
const ordre = (...series: ReturnType<typeof serie>[]) => [...series].sort(compareSeriesOrder).map((s) => s.id);

describe('compareNFC — ordre canonique (§1.6, §4.1)', () => {
  it('ne trie pas les nombres « naturellement » : 10.jpg précède 9.jpg', () => {
    expect(['9.jpg', '10.jpg'].sort(compareNFC)).toEqual(['10.jpg', '9.jpg']);
  });

  it('distingue la casse : B.jpg précède a.jpg', () => {
    expect(['a.jpg', 'B.jpg'].sort(compareNFC)).toEqual(['B.jpg', 'a.jpg']);
  });

  it('DSCF0002.JPG précède dscf0001.jpg', () => {
    expect(['dscf0001.jpg', 'DSCF0002.JPG'].sort(compareNFC)).toEqual(['DSCF0002.JPG', 'dscf0001.jpg']);
  });

  it('égalise les deux formes Unicode d’un même texte (NFC)', () => {
    expect(compareNFC('été.jpg', 'été.jpg')).toBe(0);
  });

  it('compare par points de code, non par unités UTF-16', () => {
    // U+FF5E (BMP) < U+1F600 (hors BMP) en points de code, mais l'inverse en UTF-16.
    expect(compareNFC('\u{1F600}', '～')).toBeGreaterThan(0);
  });
});

describe('calendarDay', () => {
  it('rend le jour écrit pour une date sans heure', () => {
    expect(calendarDay(new Date('2024-06-15'))).toBe('2024-06-15');
  });

  it('ignore l’heure', () => {
    expect(calendarDay(new Date('2024-06-15T08:00:00Z'))).toBe('2024-06-15');
    expect(calendarDay(new Date('2024-06-15T23:59:00Z'))).toBe('2024-06-15');
  });

  it('rend null pour une valeur absente, invalide ou qui n’est pas une date', () => {
    expect(calendarDay(undefined)).toBeNull();
    expect(calendarDay(new Date('pas une date'))).toBeNull();
    expect(calendarDay('2024-06-15')).toBeNull();
  });
});

describe('compareSeriesOrder — ordre des séries (§1.6, 2.15)', () => {
  it('date décroissante', () => {
    expect(
      ordre(serie('a', 'A', new Date('2024-01-01')), serie('b', 'B', new Date('2024-03-01')), serie('c', 'C', new Date('2024-02-01'))),
    ).toEqual(['b', 'c', 'a']);
  });

  it('à date égale, titre croissant', () => {
    const d = new Date('2024-06-15');
    expect(ordre(serie('z', 'Zèbre', d), serie('a', 'abeille', d), serie('m', 'Marée', d))).toEqual(['m', 'z', 'a']);
  });

  it('à date et titre égaux, chemin croissant', () => {
    const d = new Date('2024-06-15');
    expect(ordre(serie('b/x', 'Même titre', d), serie('a/x', 'Même titre', d))).toEqual(['a/x', 'b/x']);
  });

  it('l’heure ne départage pas : deux séries du même jour se trient par titre', () => {
    expect(
      ordre(
        serie('tard', 'Z', new Date('2024-06-15T22:00:00Z')),
        serie('tot', 'A', new Date('2024-06-15T06:00:00Z')),
      ),
    ).toEqual(['tot', 'tard']);
  });

  it('les séries sans date viennent après les datées, triées par titre puis chemin', () => {
    expect(
      ordre(
        serie('sans-b', 'B'),
        serie('ancienne', 'Ancienne', new Date('1999-01-01')),
        serie('sans-a', 'A'),
        serie('recente', 'Récente', new Date('2025-01-01')),
      ),
    ).toEqual(['recente', 'ancienne', 'sans-a', 'sans-b']);
  });

  it('est stable d’une exécution à l’autre, quel que soit l’ordre d’entrée', () => {
    const d = new Date('2024-06-15');
    const a = [serie('1', 'A', d), serie('2', 'B', d), serie('3', 'C', d)];
    expect(ordre(...a)).toEqual(ordre(...[...a].reverse()));
  });
});
