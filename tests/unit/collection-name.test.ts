/**
 * Les helpers doivent lire la collection configurée, pas `series` en dur.
 *
 * Régression : `getCollection('series')` et le glob `/src/content/series/**`
 * étaient écrits en dur, alors que l'intégration expose `collectionName` et
 * définit `import.meta.env.HYPERFOCALE_COLLECTION_NAME`. Un site suivant le
 * preset `portfolio` (collection `projects`) recevait donc des helpers
 * aveugles : aucune image, aucun document joint, aucune série.
 *
 * Le glob de Vite étant statiquement analysé, il ne peut pas porter le nom
 * de collection — il ratisse tout `src/content/` et `matchMedia()` filtre.
 * C'est donc `matchMedia()` qui porte l'appartenance, et c'est elle qu'on teste.
 */

import { describe, it, expect } from 'vitest';
import { matchMedia } from '../../src/helpers/index.js';

describe('matchMedia — appartenance à la collection', () => {
  it('accepte un chemin de la collection visée', () => {
    expect(
      matchMedia('/src/content/projects/monoboard/media/logo.png', 'projects'),
    ).toEqual({ dirSlug: 'monoboard', filename: 'logo.png' });
  });

  it('rejette une collection voisine — le cœur de la régression', () => {
    // Le glob ratisse tout src/content/ : sans ce filtre, les médias d'une
    // autre collection remonteraient dans la galerie.
    expect(
      matchMedia('/src/content/series/bretagne-2024/media/01.jpg', 'projects'),
    ).toBeNull();
  });

  it('accepte la collection `series` — comportement historique intact', () => {
    expect(
      matchMedia('/src/content/series/bretagne-2024/media/01.jpg', 'series'),
    ).toEqual({ dirSlug: 'bretagne-2024', filename: '01.jpg' });
  });

  it('préserve les slugs hiérarchiques (#ARCH-003)', () => {
    expect(
      matchMedia('/src/content/series/voyages/asie/tokyo/media/02.jpg', 'series'),
    ).toEqual({ dirSlug: 'voyages/asie/tokyo', filename: '02.jpg' });
  });

  it('ignore un fichier hors de media/', () => {
    expect(
      matchMedia('/src/content/series/bretagne-2024/index.md', 'series'),
    ).toBeNull();
  });

  it('ignore un chemin hors de src/content/', () => {
    expect(matchMedia('/public/media/logo.png', 'series')).toBeNull();
  });

  it('retombe sur `series` quand la collection n’est pas précisée', () => {
    // import.meta.env.HYPERFOCALE_COLLECTION_NAME est absent hors intégration :
    // aucun site existant ne change de comportement.
    expect(matchMedia('/src/content/series/x/media/01.jpg')).toEqual({
      dirSlug: 'x',
      filename: '01.jpg',
    });
    expect(matchMedia('/src/content/projects/x/media/01.jpg')).toBeNull();
  });
});
