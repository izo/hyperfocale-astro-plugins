# hyperfocale — Plugin Astro 7

Plugin d'intégration Astro pour contenu structuré en séries. La photo à l'origine ; onze profils de domaine depuis, standardisés en Annexe G de la spec — série, portfolio, musique, catalogue, presse, recettes, événements, apps, livres, lieux, écrans. Publié sur le **npm public** : `@regrets/hyperfocale`. Peer deps : `astro ^7`, `zod ^4`.

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
  components/       ← 9 composants Astro (SeriesCard, SeriesList, SeriesGallery, SeriesLightbox,
                       SeriesAttachments, SeriesEmbeds, SeriesFilter, SeriesMap, SeriesMasonry)
  routes/           ← pages Astro injectées via injectRoute()
  theme/            ← base.css avec custom properties --hf-*
  ingest/           ← contrat d'ingestion (spec couche 4) : snapshot, diff, validation, garde,
                       providers fs/Dropbox/WebDAV — jamais importé par l'intégration
  cli/              ← bin `hyperfocale` : init (défaut), validate, snapshot, diff
tests/
  __mocks__/        ← mocks astro:content et astro:assets (modules virtuels hors runtime)
  unit/             ← tests helpers + schéma Zod ; unit/ingest/ = contrat d'ingestion
  e2e/              ← tests routes via astro build statique
  fixtures/spec-ingestion/ ← copie épinglée des fixtures de la spec (npm run fixtures:sync / fixtures:check)
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
npx hyperfocale init                     # défaut quand aucune commande n'est donnée
npx hyperfocale validate <dossier> [--root <chemin>[:nodate]]… [--ignore <règle>]… [--astro-schema] [--json]
npx hyperfocale snapshot <dossier> [-o fichier] [--ignore <règle>]… [--json]
npx hyperfocale diff <base.json> <target.json> [--json]
```

`init` crée ou met à jour `src/content.config.ts` dans le projet consommateur pour enregistrer la collection `series`. Trois comportements :
1. Fichier absent → crée le fichier avec le template minimal.
2. Fichier existant sans `series` → injecte l'import et l'entrée dans l'export collections existant.
3. Collection déjà présente → no-op (idempotent).

Codes de sortie des commandes d'ingestion : 0 ok, 1 diagnostic `error`, 2 mauvais usage. Une commande inconnue rend 2 — elle ne lance plus `init`.

Point d'entrée : `src/cli/init.ts` → `dist/cli/init.js` (entry tsup `cli/init`), qui délègue à `src/cli/main.ts`. Les commandes d'ingestion (`src/cli/ingest.ts`) sont importées à la demande : `init` ne charge ni js-yaml ni `src/ingest/`.
Déclaré dans `package.json` : `"bin": { "hyperfocale": "./dist/cli/init.js" }`.

## Exports

| Import | Source |
|--------|--------|
| `import hyperfocale from '@regrets/hyperfocale'` | `src/index.ts` — intégration Astro |
| `import { ... } from '@regrets/hyperfocale/components'` | `src/components/index.ts` |
| `import { ... } from '@regrets/hyperfocale/helpers'` | `src/helpers/index.ts` |
| `import { seriesCollection } from 'virtual:hyperfocale/collection'` | module virtuel Vite |
| `import { ... } from '@regrets/hyperfocale/ingest'` | `src/ingest/index.ts` — contrat d'ingestion, agnostique (WebCrypto) |
| `import { ... } from '@regrets/hyperfocale/ingest/fs'` | `src/ingest/fs.ts` — `FilesystemProvider`, `hashFile`, `materializeSnapshot` (Node) |
| `import { ... } from '@regrets/hyperfocale/ingest/dropbox'` | `src/ingest/dropbox.ts` — client, provider, webhook (fetch + WebCrypto) |
| `import { ... } from '@regrets/hyperfocale/ingest/webdav'` | `src/ingest/webdav.ts` — `WebDAVProvider` (fetch) |
| `npx hyperfocale [init\|validate\|snapshot\|diff]` | `src/cli/init.ts` — CLI |

Les **trois vocabulaires** du schéma — `CONTENT_TYPES`, `ATTACHMENT_KINDS`, `EMBED_PLATFORMS` — sont exportés par l'entrée racine, pas seulement par `/helpers` : ce sous-chemin importe `astro:content` et n'est donc pas chargeable hors runtime Astro. Un formulaire, un lint ou un import CMS a besoin des valeurs licites sans monter Astro. Tout nouveau vocabulaire public doit être réexporté à la racine — un test le vérifie en dérivant la liste depuis `schema.ts`.

## Ingestion — invariants

- **Frontières** : `./ingest`, `./ingest/dropbox` et `./ingest/webdav` n'importent aucun module `node:*` (importables dans un Worker) ; seul `./ingest/fs` touche Node. L'entrée racine n'importe rien de `src/ingest/`. `tests/unit/ingest/exports.test.ts` le vérifie sur les sources et sur `dist/` — tsup retire le préfixe `node:` au bundle, le test regarde aussi les noms nus.
- **La spec fait foi** (`izo/hyperfocale-spec`, couche 4, §4.1–4.13) et ses fixtures sont normatives : `tests/unit/ingest/conformance.test.ts` les parcourt toutes. Une évolution du contrat se fait dans la spec, puis `npm run fixtures:sync -- --ref <ref>` ; ne jamais éditer `tests/fixtures/spec-ingestion/` à la main (`npm run fixtures:check` le détecte).
- **Diagnostics** : triplet `code` + `severity` + `path` (`""` pour le snapshot entier), un seul par couple `(code, path)`. Un contrôle hors contrat se code `x-*` et reste **optionnel** : `x-schema-invalid` (violations de `baseSeriesSchema`) n'est produit qu'avec `astroSchema: true`, sinon la sortie diverge des fixtures et des autres implémentations.
- **Frontmatter** : YAML 1.2 *core* (une date reste une chaîne), pas le schéma par défaut de js-yaml qu'emploie Astro — la validation juge le texte écrit.
- **Incomplet ≠ suppression** : `createSnapshot` exige `complete` sans défaut ; `applyDelta` lève `CursorResetError` sur un curseur expiré.
- **Confinement** : `materializeSnapshot` et `FilesystemProvider.read/write` refusent tout chemin qui traverse un lien symbolique sous leur racine (`UnsafePathError`) ; le listing filesystem écarte les liens par défaut (`followSymlinks` pour suivre ceux qui restent sous `root`). `materializeSnapshot` lit et vérifie tout avant d'appliquer. Toute évolution de ces fonctions garde ces tests (`tests/unit/ingest/fs.test.ts`).
