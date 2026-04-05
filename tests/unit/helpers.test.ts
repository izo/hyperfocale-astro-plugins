import { describe, it, expect } from 'vitest';
import { paginateImages } from '../../src/helpers/index.js';

// ─── paginateImages ────────────────────────────────────────────────────────

describe('paginateImages', () => {
  const makeImages = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      src: `/img/${String(i + 1).padStart(2, '0')}.jpg`,
      width: 800,
      height: 600,
      format: 'jpg',
    }));

  it('retourne la page 1 correctement', () => {
    const images = makeImages(30);
    const result = paginateImages(images, 12, 1);
    expect(result.currentPage).toBe(1);
    expect(result.totalPages).toBe(3);
    expect(result.items).toHaveLength(12);
    expect(result.items[0]?.src).toBe('/img/01.jpg');
  });

  it('retourne la page 2 correctement', () => {
    const images = makeImages(30);
    const result = paginateImages(images, 12, 2);
    expect(result.currentPage).toBe(2);
    expect(result.totalPages).toBe(3);
    expect(result.items).toHaveLength(12);
    expect(result.items[0]?.src).toBe('/img/13.jpg');
  });

  it('retourne la dernière page (partielle)', () => {
    const images = makeImages(25);
    const result = paginateImages(images, 12, 3);
    expect(result.currentPage).toBe(3);
    expect(result.totalPages).toBe(3);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.src).toBe('/img/25.jpg');
  });

  it('retourne totalPages = 1 pour tableau vide', () => {
    const result = paginateImages([], 12, 1);
    expect(result.totalPages).toBe(1);
    expect(result.currentPage).toBe(1);
    expect(result.items).toHaveLength(0);
  });

  it('borne currentPage au maximum si page demandée > totalPages', () => {
    const images = makeImages(5);
    const result = paginateImages(images, 12, 99);
    expect(result.currentPage).toBe(1);
    expect(result.items).toHaveLength(5);
  });

  it('calcule correctement totalPages avec division exacte', () => {
    const images = makeImages(12);
    const result = paginateImages(images, 12, 1);
    expect(result.totalPages).toBe(1);
    expect(result.items).toHaveLength(12);
  });

  it('lève une erreur si pageSize < 1', () => {
    expect(() => paginateImages([], 0, 1)).toThrowError(/pageSize/);
  });

  it('lève une erreur si page < 1', () => {
    expect(() => paginateImages([], 12, 0)).toThrowError(/page/);
  });
});
