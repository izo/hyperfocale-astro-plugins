/**
 * Couverture de trois helpers publics restés sans aucun test (#TEST-004).
 *
 * Repérés par l'audit du 2026-08-24 : `getSeriesCover`, `serializeSeries` et
 * `getParentCollection` sont exportés par l'API publique et n'apparaissaient
 * nulle part dans `tests/`. Le ratio global du dépôt est pourtant bon — c'était
 * un trou ponctuel, pas une négligence de fond.
 */

import { describe, it, expect } from 'vitest';
import {
  getSeriesCover,
  getParentCollection,
  serializeSeries,
  resetSeriesCache,
} from '../../src/helpers/index.js';
import type { Series } from '../../src/helpers/index.js';

/** Entrée `series` minimale — même fabrique que les autres suites unitaires. */
function makeSeries(data: Record<string, unknown>, extra: Record<string, unknown> = {}): Series {
  return {
    id: 'demo',
    collection: 'series',
    data: { title: 'Demo', ...data },
    body: '',
    ...extra,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// ─── getParentCollection (spec §1.7) ─────────────────────────────────────────

describe('getParentCollection', () => {
  it('extrait le premier segment d\'un slug hiérarchique', () => {
    expect(getParentCollection('voyages/asie/tokyo-2024')).toBe('voyages');
  });

  it('extrait le parent d\'un slug à deux niveaux', () => {
    expect(getParentCollection('music/festival-2024')).toBe('music');
  });

  it('retourne null pour un slug plat', () => {
    expect(getParentCollection('bretagne-2024')).toBeNull();
  });

  it('retourne null pour une chaîne vide', () => {
    expect(getParentCollection('')).toBeNull();
  });

  it('retourne une chaîne vide sur un slash en tête — le segment est vide, pas absent', () => {
    // Cas dégénéré : `/x` a bien un parent au sens de la fonction, il est vide.
    // Documenté ici pour que le jour où ce comportement change, il change
    // délibérément.
    expect(getParentCollection('/tokyo-2024')).toBe('');
  });

  it('ne retient que le premier segment, jamais le dernier', () => {
    // Garde contre une inversion : `lastIndexOf` au lieu d'`indexOf` rendrait
    // 'voyages/asie' et passerait les trois premiers tests.
    expect(getParentCollection('voyages/asie/tokyo')).not.toBe('voyages/asie');
  });
});

// ─── serializeSeries (#MVP-005) ──────────────────────────────────────────────

describe('serializeSeries', () => {
  it('convertit la date en chaîne ISO', () => {
    const series = makeSeries({ date: new Date('2024-06-15T00:00:00.000Z') });
    const out = serializeSeries(series);
    expect(out.data['date']).toBe('2024-06-15T00:00:00.000Z');
    expect(typeof out.data['date']).toBe('string');
  });

  it('reporte id et collection', () => {
    const out = serializeSeries(makeSeries({}));
    expect(out.id).toBe('demo');
    expect(out.collection).toBe('series');
  });

  it('préserve les autres champs de data', () => {
    const out = serializeSeries(makeSeries({ title: 'Bretagne', location: 'Finistère' }));
    expect(out.data['title']).toBe('Bretagne');
    expect(out.data['location']).toBe('Finistère');
  });

  it('omet la clé date quand elle est absente', () => {
    const out = serializeSeries(makeSeries({}));
    expect('date' in out.data).toBe(false);
  });

  it('omet la clé date quand la valeur n\'est pas une Date', () => {
    // Le schéma garantit une `Date`, mais `serializeSeries` accepte n'importe
    // quelle `Series` — dont une construite à la main par un consommateur.
    const out = serializeSeries(makeSeries({ date: '2024-06-15' }));
    expect('date' in out.data).toBe(false);
  });

  it('omet la méthode render — c\'est la raison d\'être de la fonction', () => {
    // Une `Series` brute n'est pas sérialisable en JSON : `render` est une
    // fonction, et une île React la recevrait comme `undefined` après passage
    // de props. Le test garde ce contrat.
    const series = makeSeries({}, { render: () => Promise.resolve({ Content: null }) });
    const out = serializeSeries(series);
    expect('render' in out).toBe(false);
    expect(() => JSON.stringify(out)).not.toThrow();
  });

  it('reporte le body quand il est présent', () => {
    expect(serializeSeries(makeSeries({}, { body: 'texte' })).body).toBe('texte');
  });

  it('omet la clé body quand elle est absente', () => {
    const series = { id: 'demo', collection: 'series', data: { title: 'Demo' } } as unknown as Series;
    expect('body' in serializeSeries(series)).toBe(false);
  });

  it('ne mute pas la série passée en argument', () => {
    const date = new Date('2024-06-15T00:00:00.000Z');
    const series = makeSeries({ date });
    serializeSeries(series);
    expect(series.data['date']).toBeInstanceOf(Date);
  });
});

// ─── getSeriesCover (spec §1.6) ──────────────────────────────────────────────

describe('getSeriesCover', () => {
  it('retourne la première image de la série', async () => {
    resetSeriesCache();
    const series = makeSeries({
      images: [
        { url: 'https://cdn.test/01.jpg', alt: 'un', width: 100, height: 50 },
        { url: 'https://cdn.test/02.jpg', alt: 'deux', width: 100, height: 50 },
      ],
    });
    const cover = await getSeriesCover('demo', series);
    expect(cover?.src).toBe('https://cdn.test/01.jpg');
    expect(cover?.alt).toBe('un');
  });

  it('suit l\'ordre du frontmatter, pas l\'alphabétique', async () => {
    // Garde contre un tri introduit en amont : c'est `images[]` qui fait foi.
    resetSeriesCache();
    const series = makeSeries({
      images: [
        { url: 'https://cdn.test/zzz.jpg', width: 1, height: 1 },
        { url: 'https://cdn.test/aaa.jpg', width: 1, height: 1 },
      ],
    });
    expect((await getSeriesCover('demo', series))?.src).toBe('https://cdn.test/zzz.jpg');
  });

  it('retourne undefined quand la série n\'a aucune image', async () => {
    resetSeriesCache();
    expect(await getSeriesCover('demo', makeSeries({}))).toBeUndefined();
  });

  it('retourne undefined sur un tableau images vide', async () => {
    resetSeriesCache();
    expect(await getSeriesCover('demo', makeSeries({ images: [] }))).toBeUndefined();
  });
});
