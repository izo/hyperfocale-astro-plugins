/** `paginationItems` — pagination compacte (#136, P2). */
import { describe, expect, it } from 'vitest';
import { paginationItems } from '../../src/components/runtime.js';

describe('paginationItems', () => {
  it('jusqu’à sept pages : tout affiché, sans trou', () => {
    expect(paginationItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(paginationItems(1, 1)).toEqual([1]);
    expect(paginationItems(1, 0)).toEqual([]);
  });

  it('au début : pas de trou avant', () => {
    expect(paginationItems(1, 20)).toEqual([1, 2, 'gap', 20]);
  });

  it('au milieu : trous des deux côtés, voisines de la courante', () => {
    expect(paginationItems(10, 20)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20]);
  });

  it('à la fin : pas de trou après', () => {
    expect(paginationItems(20, 20)).toEqual([1, 'gap', 19, 20]);
  });

  it('chaque suite de pages masquées devient un trou', () => {
    expect(paginationItems(4, 9)).toEqual([1, 'gap', 3, 4, 5, 'gap', 9]);
  });
});
