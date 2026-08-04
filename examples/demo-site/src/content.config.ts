import { seriesCollection } from 'virtual:hyperfocale/collection';
import { baseSeriesSchema } from '@regrets/hyperfocale';
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

export const collections = {
  series: seriesCollection,
  brands: defineCollection({
    loader: glob({ pattern: '**/index.{md,mdx}', base: './src/content/brands' }),
    schema: baseSeriesSchema({ dateRequired: false }),
  }),
};
