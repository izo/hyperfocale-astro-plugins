import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Rendu des composants `.astro` : config dédiée (plugins Vite d'Astro),
    // vitest.components.config.ts — lancée par `npm run test:unit`.
    exclude: ['**/node_modules/**', 'tests/components/**'],
    environment: 'node',
    // Les tests e2e lancent un vrai build Astro — timeout plus long
    testTimeout: 180_000,
    hookTimeout: 180_000,
    // Couverture (#158, CODE-009) : un rapport, pas un seuil. Mesure les tests
    // unitaires (`npm run test:coverage`) ; les composants `.astro` ont leur propre
    // config et ne sont pas instrumentés ici.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage',
    },
  },
  resolve: {
    alias: {
      // Mock des modules virtuels Astro non disponibles hors du runtime Astro
      'astro:content': '/tests/__mocks__/astro-content.ts',
      'astro:assets': '/tests/__mocks__/astro-assets.ts',
    },
  },
});
