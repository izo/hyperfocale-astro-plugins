/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

/**
 * Tests de rendu des composants `.astro` (#136, #138) — API container d'Astro.
 *
 * Config séparée de `vitest.config.ts` : compiler un `.astro` demande les
 * plugins Vite d'Astro (`getViteConfig`), que les tests unitaires n'ont pas à
 * charger. `astro:content` reste mocké (aucune collection ici) ; `astro:assets`
 * est le vrai module, mais les tests passent `imageOptimization: 'disabled'`
 * (rendu en `<img>` du fichier d'origine), comme un site qui n'optimise pas.
 */
export default getViteConfig(
  {
    test: {
      include: ['tests/components/**/*.test.ts'],
      environment: 'node',
      testTimeout: 60_000,
    },
    resolve: {
      alias: {
        'astro:content': '/tests/__mocks__/astro-content.ts',
      },
    },
    define: {
      'import.meta.env.HYPERFOCALE_IMAGE_OPTIMIZATION': JSON.stringify('disabled'),
    },
  },
  { logLevel: 'error' },
);
