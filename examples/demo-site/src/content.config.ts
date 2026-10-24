import { seriesCollection } from 'virtual:hyperfocale/collection';
import { baseSeriesSchema } from '@regrets/hyperfocale';
import { seriesLoader } from '@regrets/hyperfocale/loader';
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

// Corpus rangé hors de `src/content/` (#130) : une collection par locale
// (Annexe F, stratégie 3), chacune avec le repli `index.<locale>.md` → `index.md`
// (stratégie 2).
const corpusSchema = baseSeriesSchema({ dateRequired: true });

export const collections = {
  series: seriesCollection,
  brands: defineCollection({
    loader: glob({ pattern: '**/index.{md,mdx}', base: './src/content/brands' }),
    schema: baseSeriesSchema({ dateRequired: false }),
  }),
  corpus_fr: defineCollection({ loader: seriesLoader({ base: 'corpus' }), schema: corpusSchema }),
  corpus_en: defineCollection({ loader: seriesLoader({ base: 'corpus', locale: 'en' }), schema: corpusSchema }),
};
