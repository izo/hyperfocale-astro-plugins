/**
 * Line-up des sous-séries d'un conteneur — spec §1.8 (H2).
 *
 * Un conteneur est une série dont un sous-dossier porte lui aussi un `index.md`
 * (un festival et ses concerts). Le piège est de le confondre avec le rangement
 * de §1.2 : `archives/music/concerts/<slug>/` est une série rangée à quatre
 * segments, pas une sous-série de quatrième niveau. D'où la règle testée ici : le parent d'une série est son
 * plus proche ancêtre qui est une série (spec 2.15) — un dossier de rangement
 * intercalé ne change rien, une section est transparente.
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
  it('retourne les sous-séries directes du conteneur', async () => {
    const ids = (await getSubSeries('festival-2024')).map((s) => s.id);
    expect(ids).toEqual(['festival-2024/set-crepuscule', 'festival-2024/set-aurore']);
  });

  it('une série sous une sous-série appartient à celle-ci, pas au conteneur', async () => {
    // Son plus proche ancêtre qui est une série est `set-aurore` (le dossier
    // `detail/` n'a pas d'index.md : c'est du rangement §1.2). La structure est
    // trop profonde pour la spec (`nesting-too-deep`, §4.10), mais le parent est clair.
    const ids = (await getSubSeries('festival-2024')).map((s) => s.id);
    expect(ids).not.toContain('festival-2024/set-aurore/detail/gros-plans');
    expect((await getSubSeries('festival-2024/set-aurore')).map((s) => s.id)).toEqual([
      'festival-2024/set-aurore/detail/gros-plans',
    ]);
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

describe('getSubSeries — rangement et sections intercalés (§1.8, 2.15)', () => {
  it('une sous-série atteinte à travers un dossier de rangement reste celle du conteneur', async () => {
    // `lots/` n'a pas d'index.md : c'est un rangement, pas un conteneur.
    const ids = (await getSubSeries('rangement-2024')).map((s) => s.id);
    expect(ids).toContain('rangement-2024/lots/set-nuit');
  });

  it('une page de section intercalée est transparente', async () => {
    // Comme pour `nesting-too-deep` (§4.10), qui ne compte pas les sections.
    const ids = (await getSubSeries('rangement-2024')).map((s) => s.id);
    expect(ids).toContain('rangement-2024/archives-section/set-cave');
    expect(ids).not.toContain('rangement-2024/archives-section');
  });

  it('range directes et indirectes dans l’ordre de la spec (date décroissante)', async () => {
    const ids = (await getSubSeries('rangement-2024')).map((s) => s.id);
    expect(ids).toEqual([
      'rangement-2024/archives-section/set-cave',
      'rangement-2024/lots/set-nuit',
      'rangement-2024/set-jour',
    ]);
  });

  it('l’ancêtre le plus proche l’emporte sur un conteneur plus lointain', async () => {
    // `rangement-2024/lots/set-nuit` est une série : ce qui est dessous est à elle.
    expect((await getSubSeries('rangement-2024/lots/set-nuit')).map((s) => s.id)).toEqual([
      'rangement-2024/lots/set-nuit/final',
    ]);
    expect((await getSubSeries('rangement-2024')).map((s) => s.id)).not.toContain(
      'rangement-2024/lots/set-nuit/final',
    );
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
  // Rangement et section intercalés entre un conteneur et ses sous-séries.
  entry('rangement-2024', { date: new Date('2024-07-01') }),
  entry('rangement-2024/set-jour', { date: new Date('2024-07-01') }),
  entry('rangement-2024/lots/set-nuit', { date: new Date('2024-07-02') }),
  entry('rangement-2024/lots/set-nuit/final', { date: new Date('2024-07-04') }),
  entry('rangement-2024/archives-section', { type: 'section' }),
  entry('rangement-2024/archives-section/set-cave', { date: new Date('2024-07-03') }),
  entry('sans-ordre', { date: new Date('2024-01-01') }),
  entry('sans-ordre/ancienne', { date: new Date('2024-01-02') }),
  entry('sans-ordre/recente', { date: new Date('2024-05-02') }),
  entry('mixte', { date: new Date('2024-01-01') }),
  entry('mixte/ancienne', { date: new Date('2024-01-02') }),
  entry('mixte/recente', { date: new Date('2024-05-02') }),
  entry('mixte/ordonnee', { date: new Date('2023-01-01'), lineup_order: 1 }),
);

describe('getSubSeries — table des enfants mémoïsée (PERF-002, #158)', () => {
  it('rend le même résultat à chaque appel, sans partager le tableau', async () => {
    const first = await getSubSeries('festival-2024');
    first.reverse();
    first.pop();
    const second = await getSubSeries('festival-2024');
    expect(second.map((s) => s.id)).toEqual(['festival-2024/set-crepuscule', 'festival-2024/set-aurore']);
  });

  it('un parent sans sous-série, ou inconnu, rend un tableau vide', async () => {
    expect(await getSubSeries('bretagne-2024')).toEqual([]);
    expect(await getSubSeries('inconnu')).toEqual([]);
  });

  it('ne relit la collection qu\'une fois pour une série d\'appels', async () => {
    const { getCollectionFetchCount } = await import('../../src/helpers/index.js');
    for (let i = 0; i < 20; i++) await getSubSeries('festival-2024');
    expect(getCollectionFetchCount()).toBe(1);
  });
});
