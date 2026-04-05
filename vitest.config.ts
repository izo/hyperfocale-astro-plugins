import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      // Mock des modules virtuels Astro non disponibles hors du runtime Astro
      'astro:content': '/tests/__mocks__/astro-content.ts',
      'astro:assets': '/tests/__mocks__/astro-assets.ts',
    },
  },
});
