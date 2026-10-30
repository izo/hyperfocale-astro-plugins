// Barrel export pour les composants Astro du plugin hyperfocale
// Importez via : import { SeriesCard, SeriesList, SeriesGallery, SeriesLightbox } from '@regrets/hyperfocale/components'
//
// Les `.astro` ne sont pas compilés par tsup : ils sont copiés tels quels dans
// dist/components/, et ces réexports restent des imports relatifs (`external`
// dans tsup.config.ts), résolus par Vite chez le site consommateur. Avant ce
// réexport, le barrel n'exposait que les libellés : l'import nommé que montre
// le README échouait au build (MISSING_EXPORT).
export { default as SeriesCard } from './SeriesCard.astro';
export { default as SeriesList } from './SeriesList.astro';
export { default as SeriesGallery } from './SeriesGallery.astro';
export { default as SeriesLightbox } from './SeriesLightbox.astro';
export { default as SeriesMasonry } from './SeriesMasonry.astro';
export { default as SeriesAttachments } from './SeriesAttachments.astro';
export { default as SeriesEmbeds } from './SeriesEmbeds.astro';
export { default as SeriesFilter } from './SeriesFilter.astro';
export { default as SeriesMap } from './SeriesMap.astro';
export { default as SeriesPagination } from './SeriesPagination.astro';
export { default as SeriesLineup } from './SeriesLineup.astro';

export type {
  Series,
  ImageMetadata,
  PaginationResult,
  QuerySeriesOptions,
  QueryResult,
  SerializedSeries,
  Attachment,
  AttachmentKind,
  Embed,
  EmbedPlatform,
} from '../helpers/index.js';
export type { SeriesData, SeriesDataOptionalDate } from '../schema.js';

// Libellés et formats (#136) — mêmes valeurs que `@regrets/hyperfocale/i18n`.
export {
  HF_LABELS,
  HF_DEFAULT_LOCALE,
  resolveLabels,
  formatLabel,
  pluralLabel,
  formatDate,
  formatFileSize,
} from '../i18n.js';
export type { HyperfocaleLabels, HyperfocaleLabelKey, HfPluralForms, HeadingLevel } from '../i18n.js';
// JSON à injecter dans un `<script>` via `set:html` : `<` échappé en `\u003c` (#138).
// Pour les layouts de site, qui reçoivent `schema` en objet (README, *Layout du site*).
export { scriptJson } from './runtime.js';
export type {
  InstanceProps as HyperfocaleInstanceProps,
  SeriesAttachmentItem,
  AttachmentLinkAttrs,
} from './runtime.js';
