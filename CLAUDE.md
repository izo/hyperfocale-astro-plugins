# hyperfocale — Plugin Astro 7

Plugin d'intégration Astro pour galeries photo (séries). Publié sur le **npm public** : `@izo/hyperfocale`. Peer deps : `astro ^7`, `zod ^4`.

> Le paquet vivait sur GitHub Packages, qui réclame une authentification même pour un paquet public : chaque site consommateur devait porter un jeton `read:packages` en local, en CI **et** au déploiement. La publication demande désormais un secret `NPM_TOKEN` ; l'installation ne demande plus rien.

> Spec canonique (source de vérité) : dépôt externe `izo/hyperfocale-spec` — voir `spec-hyperfocale.md`.

## Commandes

```bash
npm run build        # tsup → dist/ (ESM + types)
npm run typecheck    # tsc --noEmit (0 erreur attendu)
npm test             # tous les tests (unit + e2e) — lent (~60s, build Astro inclus)
npm run test:unit    # tests unitaires uniquement (~1s)
npm run test:e2e     # tests e2e uniquement — buildent le plugin + demo-site
npm run pack:dry     # vérifier le contenu du package avant publication
npm run dev          # tsup --watch (développement)
```

## Architecture

```
src/
  index.ts          ← point d'entrée de l'intégration (defineIntegration, options)
  schema.ts         ← schéma Zod de la collection + module virtuel Vite
  helpers/          ← API publique TypeScript (getSeriesList, getSeriesBySlug, etc.)
  components/       ← 8 composants Astro (SeriesCard, SeriesList, SeriesGallery, SeriesLightbox, SeriesAttachments, SeriesFilter, SeriesMap, SeriesMasonry)
  routes/           ← pages Astro injectées via injectRoute()
  theme/            ← base.css avec custom properties --hf-*
tests/
  __mocks__/        ← mocks astro:content et astro:assets (modules virtuels hors runtime)
  unit/             ← tests helpers + schéma Zod
  e2e/              ← tests routes via astro build statique
examples/demo-site/ ← site consommateur pour tester le plugin en conditions réelles
dist/               ← build tsup (gitignored)
```

## Gotchas

**Build** : `tsup` ne compile que les `.ts`. Les fichiers `.astro` et `.css` sont copiés dans `dist/` via le hook `onSuccess` de `tsup.config.ts`. Ne pas oublier de relancer le build si un composant Astro change.

**Tests e2e** : stratégie build statique — pas de Playwright, pas de serveur. Les tests lancent `astro build` sur le demo-site, puis analysent les HTML générés. Timeout à 180s. Lancer `npm run test:unit` en dev, `npm test` uniquement avant commit.

**Mocks Astro** : `astro:content` et `astro:assets` sont des modules virtuels inexistants hors du runtime Astro. Des mocks manuels dans `tests/__mocks__/` sont aliasés dans `vitest.config.ts`.

**Module virtuel** : `virtual:hyperfocale/collection` expose le schéma Zod au site consommateur. L'import dans `src/content.config.ts` est obligatoire — l'injection automatique n'est pas supportée par l'API Astro 7.

**Peer deps** : `astro` et `zod` sont des peer dependencies. Ne pas les ajouter en dépendances directes.

## CLI

```bash
npx hyperfocale init
```

Crée ou met à jour `src/content.config.ts` dans le projet consommateur pour enregistrer la collection `series`. Trois comportements :
1. Fichier absent → crée le fichier avec le template minimal.
2. Fichier existant sans `series` → injecte l'import et l'entrée dans l'export collections existant.
3. Collection déjà présente → no-op (idempotent).

Point d'entrée : `src/cli/init.ts` → `dist/cli/init.js` (entry tsup `cli/init`).
Déclaré dans `package.json` : `"bin": { "hyperfocale": "./dist/cli/init.js" }`.

## Exports

| Import | Source |
|--------|--------|
| `import hyperfocale from '@izo/hyperfocale'` | `src/index.ts` — intégration Astro |
| `import { ... } from '@izo/hyperfocale/components'` | `src/components/index.ts` |
| `import { ... } from '@izo/hyperfocale/helpers'` | `src/helpers/index.ts` |
| `import { seriesCollection } from 'virtual:hyperfocale/collection'` | module virtuel Vite |
| `npx hyperfocale init` | `src/cli/init.ts` — CLI d'initialisation |
