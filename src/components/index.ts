// Barrel export pour les composants Astro du plugin hyperfocale
// Importez via : import { SeriesCard, SeriesList, SeriesGallery, SeriesLightbox } from '@regrets/hyperfocale/components'

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
export type {
  InstanceProps as HyperfocaleInstanceProps,
  SeriesAttachmentItem,
  AttachmentLinkAttrs,
} from './runtime.js';
