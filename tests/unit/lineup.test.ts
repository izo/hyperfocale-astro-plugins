/**
 * Line-up des sous-séries d'un conteneur — spec §1.8 (H2).
 *
 * Un conteneur est une série dont un sous-dossier porte lui aussi un `index.md`
 * (un festival et ses concerts). Le piège est de le confondre avec le rangement
 * de §1.2 : `archives/music/concerts/<slug>/` est une série rangée à quatre
 * segments, pas une sous-série de quatrième niveau. D'où la règle testée ici —
 * seul un segment de profondeur compte comme sous-série.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

type Entry = { id: string; collection: string; data: Record<string, unknown>; body: string };

const entry = (id: string, data: Record<string, unknown> = {}): Entry => ({
  id,
  collection: 'series',
  data: { title: id, published: true, draft: false, featured: false, tags: [], ...data },
  body: '',
});

const CORPUS: Entry[] = [
  entry('festival-2024', { date: new Date('2024-07-20') }),
  entry('festival-2024/set-aurore', { date: new Date('2024-07-21'), lineup_order: 2 }),
  entry('festival-2024/set-crepuscule', { date: new Date('2024-07-20'), lineup_order: 1 }),
  // Rangée trois segments plus bas : ce n'est pas une sous-série du festival.
  entry('festival-2024/set-aurore/detail/gros-plans', { date: new Date('2024-07-22') }),
  // Une section posée dans le conteneur n'est pas un contenu (§1.10).
  entry('festival-2024/coulisses', { type: 'section' }),
  // Série voisine dont le slug commence par le même texte, sans être dedans.
  entry('festival-2024-bis', { date: new Date('2024-08-01') }),
  entry('bretagne-2024', { date: new Date('2024-06-15') }),
];

vi.mock('astro:content', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getCollection: async () => CORPUS,
}));

const { getSubSeries, resetSeriesCache } = await import('../../src/helpers/index.js');

beforeEach(() => resetSeriesCache());

describe('getSubSeries — périmètre (§1.8)', () => {
  it('retourne les séries situées exactement un segment plus bas', async () => {
    const ids = (await getSubSeries('festival-2024')).map((s) => s.id);
    expect(ids).toEqual(['festival-2024/set-crepuscule', 'festival-2024/set-aurore']);
  });

  it('écarte une série rangée plus profond — ce n’est pas une sous-série', async () => {
    // §1.8 limite l'imbrication à un niveau ; au-delà, c'est du rangement §1.2.
    const ids = (await getSubSeries('festival-2024')).map((s) => s.id);
    expect(ids).not.toContain('festival-2024/set-aurore/detail/gros-plans');
  });

  it('écarte une section posée dans le conteneur (§1.10)', async () => {
    const ids = (await getSubSeries('festival-2024')).map((s) => s.id);
    expect(ids).not.toContain('festival-2024/coulisses');
  });

  it('ne confond pas un slug voisin avec un enfant', async () => {
    // `festival-2024-bis` commence par `festival-2024` sans être dedans :
    // un simple startsWith() sans le séparateur l'aurait embarqué.
    const ids = (await getSubSeries('festival-2024')).map((s) => s.id);
    expect(ids).not.toContain('festival-2024-bis');
  });

  it('retourne un tableau vide pour une série ordinaire', async () => {
    expect(await getSubSeries('bretagne-2024')).toEqual([]);
  });

  it('retourne un tableau vide pour un slug inexistant', async () => {
    expect(await getSubSeries('nexiste-pas')).toEqual([]);
  });
});

describe('getSubSeries — tri (§1.8)', () => {
  it('`lineup_order` prime sur la date', async () => {
    // set-crepuscule est le plus ancien (20/07) mais porte lineup_order: 1 ;
    // set-aurore est le plus récent (21/07) avec lineup_order: 2. Un tri par
    // date seule les aurait inversés.
    const ids = (await getSubSeries('festival-2024')).map((s) => s.id);
    expect(ids[0]).toBe('festival-2024/set-crepuscule');
    expect(ids[1]).toBe('festival-2024/set-aurore');
  });

  it('sans `lineup_order`, tri par date décroissante', async () => {
    const ids = (await getSubSeries('sans-ordre')).map((s) => s.id);
    expect(ids).toEqual(['sans-ordre/recente', 'sans-ordre/ancienne']);
  });

  it('les sous-séries ordonnées passent devant celles qui ne le sont pas', async () => {
    const ids = (await getSubSeries('mixte')).map((s) => s.id);
    expect(ids).toEqual(['mixte/ordonnee', 'mixte/recente', 'mixte/ancienne']);
  });
});

// Corpus complémentaire pour les deux derniers cas de tri.
CORPUS.push(
  entry('sans-ordre', { date: new Date('2024-01-01') }),
  entry('sans-ordre/ancienne', { date: new Date('2024-01-02') }),
  entry('sans-ordre/recente', { date: new Date('2024-05-02') }),
  entry('mixte', { date: new Date('2024-01-01') }),
  entry('mixte/ancienne', { date: new Date('2024-01-02') }),
  entry('mixte/recente', { date: new Date('2024-05-02') }),
  entry('mixte/ordonnee', { date: new Date('2023-01-01'), lineup_order: 1 }),
);
