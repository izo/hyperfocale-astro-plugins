import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Les tests e2e lancent un vrai build Astro — timeout plus long
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
  resolve: {
    alias: {
      // Mock des modules virtuels Astro non disponibles hors du runtime Astro
      'astro:content': '/tests/__mocks__/astro-content.ts',
      'astro:assets': '/tests/__mocks__/astro-assets.ts',
    },
  },
});
