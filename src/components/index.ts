// Barrel export pour les composants Astro du plugin hyperfocale
// Importez via : import { SeriesCard, SeriesList, SeriesGallery, SeriesLightbox } from 'hyperfocale/components'
//
// Note: les fichiers .astro sont re-exportés par l'intégration via les entrypoints.
// Ce fichier permet aux IDEs d'avoir les types — les imports réels fonctionnent
// car Astro résout les .astro lors du build.

// Les re-exports .astro sont gérés à l'exécution par Astro.
// On exporte uniquement les types utilitaires ici.

export type { Series, ImageMetadata, PaginationResult } from '../helpers/index.js';
export type { SeriesData } from '../schema.js';
