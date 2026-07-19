import { defineConfig } from 'tsup';
import { cpSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'components/index': 'src/components/index.ts',
    'helpers/index': 'src/helpers/index.ts',
    'cli/init': 'src/cli/init.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  external: ['astro', 'astro:content', 'astro:assets', 'zod'],
  // Copier les fichiers .astro (routes, composants, thème) dans dist/
  // car tsup ne compile que les fichiers TypeScript
  onSuccess: async () => {
    const dirs = ['routes', 'components', 'theme', 'layouts'];
    for (const dir of dirs) {
      cpSync(resolve('src', dir), resolve('dist', dir), {
        recursive: true,
        filter: (src) => !src.endsWith('.ts'),
      });
    }
    console.log('[tsup] .astro et .css copiés dans dist/');
  },
});
