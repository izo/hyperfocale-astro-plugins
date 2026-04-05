import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'components/index': 'src/components/index.ts',
    'helpers/index': 'src/helpers/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  external: ['astro', 'astro:content', 'astro:assets', 'zod'],
  // Astro .astro files are not bundled by tsup — they ship as-is from src/
  // Only TypeScript files are compiled
});
