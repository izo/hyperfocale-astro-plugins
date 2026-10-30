# hyperfocale — Plugin Astro 7

Plugin d'intégration Astro pour contenu structuré en séries. La photo à l'origine ; onze profils de domaine depuis, standardisés en Annexe G de la spec — série, portfolio, musique, catalogue, presse, recettes, événements, apps, livres, lieux, écrans. Publié sur le **npm public** : `@regrets/hyperfocale`. Peer deps : `astro ^7`, `zod ^4`.

> Le paquet vivait sur GitHub Packages, qui réclame une authentification même pour un paquet public : chaque site consommateur devait porter un jeton `read:packages` en local, en CI **et** au déploiement. La publication demande désormais un secret `NPM_TOKEN` ; l'installation ne demande plus rien.

> Spec canonique (source de vérité) : dépôt externe `izo/hyperfocale-spec` — voir `spec-hyperfocale.md`.

## Commandes

```bash
npm run build        # tsup → dist/ (ESM + types)
npm run typecheck    # tsc --noEmit (0 erreur attendu)
npm test             # tous les tests (unit + e2e) — lent (~60s, build Astro inclus)
npm run test:unit    # tests unitaires + rendu des composants (~20s)
npm run test:e2e     # tests e2e uniquement — buildent le plugin + demo-site
npm run pack:dry     # vérifier le contenu du package avant publication
npm run dev          # tsup --watch (développement)
```

## Architecture

```
src/
  index.ts          ← point d'entrée de l'intégration (fonction `hyperfocale(options)`, options, module virtuel Vite)
  schema.ts         ← schéma Zod de la collection (`seriesSchema` / `baseSeriesSchema`)
  helpers/          ← API publique TypeScript (getSeriesList, getSeriesBySlug, etc.) — lit src/content/ par import.meta.glob
  i18n.ts           ← libellés fr/en (HF_LABELS), formats Intl (dates, pluriels, tailles) — pur
  media.ts          ← résolveur de médias pur (galerie, couverture, documents joints) + primitives partagées avec helpers/
  loader.ts         ← loader Content Layer pour un corpus hors de src/content/ (repli index.<locale>.md → index.md)
  components/       ← 11 composants Astro (SeriesCard, SeriesList, SeriesGallery, SeriesLightbox,
                       SeriesAttachments, SeriesEmbeds, SeriesFilter, SeriesMap, SeriesMasonry,
                       SeriesPagination, SeriesLineup)
                       + runtime.ts (outils internes : attributs passés, headingLevel, pagination, JSON de script)
  routes/           ← pages Astro injectées via injectRoute()
  theme/            ← base.css avec custom properties --hf-*
  ingest/           ← contrat d'ingestion (spec couche 4) : snapshot, diff, validation, garde,
                       providers fs/Dropbox/WebDAV — jamais importé par l'intégration
  cli/              ← bin `hyperfocale` : init (défaut), validate, snapshot, diff
tests/
  __mocks__/        ← mocks astro:content et astro:assets (modules virtuels hors runtime)
  unit/             ← tests helpers + schéma Zod ; unit/ingest/ = contrat d'ingestion
  components/       ← rendu des 11 composants (API container d'Astro, vitest.components.config.ts)
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

**Primitives de médias** : `classifyAttachment`, `isOriginal`, `parseImageManifest`, `posterFilenames` vivent dans `src/media.ts` et `/helpers` les réexporte — `/helpers` importe `astro:content`, `/media` doit rester chargeable partout (`tests/unit/ingest/exports.test.ts` le vérifie). La résolution de références relatives et la lecture d'`images.json` sont dans `src/ingest/paths.ts` et `src/ingest/manifest.ts`, partagées avec la validation : une seule implémentation de §1.5.1.

**Composants — i18n, jetons, options par instance** (#136) : aucun libellé ni aucune couleur en dur dans `src/components/*.astro`. Un libellé = une clé de `HyperfocaleLabels` (`src/i18n.ts`), présente en `fr` **et** en `en` (test) ; une couleur = un jeton `--hf-*` défini dans `theme/base.css` **et** documenté au README (`tests/unit/tokens.test.ts`). Chaque composant accepte `locale`, `labels`, `class`, `data-*`/`aria-*` (via `passthroughAttrs` de `components/runtime.ts`) ; locale par défaut `fr`. Les `.astro` importent `./runtime.js` — entrée tsup `components/runtime`, sans quoi `dist/components/` ne la trouverait pas. Un JSON passé à un script client va par `set:html={scriptJson(…)}` (jamais `{}` dans un `<script>`, #138). Les tests de rendu (`npm run test:components`, inclus dans `test:unit`) forcent `imageOptimization: 'disabled'`.

**Feuilles émises à la demande** (#136, 0.24.0) : `SeriesAttachments` n'a pas de `<style>` scopé. Sa feuille vit dans `src/theme/attachments.css` (publiée `@regrets/hyperfocale/styles/attachments.css`, importée en `?raw` par le composant) et part dans un `<style data-hf-styles="attachments">` une fois par page (`claimStyles(Astro.request, …)` de `runtime.ts`), seulement si le composant rend quelque chose, sauf `componentStyles: 'none'` / `unstyled`. Sélecteurs d'une classe, hors couche, sans `:where()` — mesures et raison au README (*Thème → Feuilles des composants et cascade layers*) : ne pas les passer en `:where()` ni en `@layer` d'office. Une feuille de `src/theme/` (hors `base.css`) doit avoir son entrée `./styles/<nom>.css` dans `exports` (test). `vitest.components.config.ts` a `css: true`, sans quoi `?raw` d'un `.css` rend `''`. Un balisage de titre dynamique (`<Heading>`) dans un composant à `<style>` scopé reçoit `data-astro-cid-…="true"` (Astro le traite en composant) — inoffensif, encore présent sur `SeriesEmbeds`/`SeriesCard`.

**Gardes des composants** : `tests/components/labels-sentinel.test.ts` rend les 11 composants avec un dictionnaire sentinelle — un texte lisible écrit en dur dans un `.astro` le fait échouer ; ajouter un composant ou une branche qui émet du texte = l'ajouter aux `CASES`. Le JS client de `SeriesFilter` vit dans `components/filter-client.ts`, celui de `SeriesLightbox` dans `components/lightbox-client.ts`, le repli d'image dans `components/image-fallback.ts` : entrées tsup comme `runtime`, testées en happy-dom (`tests/components/*-client.test.ts`, `filter-client.test.ts`).

## CLI

```bash
npx hyperfocale init [--collection <nom>] # défaut quand aucune commande n'est donnée
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
| `import { ... } from '@regrets/hyperfocale/i18n'` | `src/i18n.ts` — `HF_LABELS`, `resolveLabels`, `formatDate`, `formatFileSize`, `pluralLabel` — pur (aussi réexporté par `/components`) |
| `import { ... } from '@regrets/hyperfocale/media'` | `src/media.ts` — `resolveSeriesMedia` et primitives de médias, purs (ni `node:*`, ni astro, ni zod) |
| `@import "@regrets/hyperfocale/styles/attachments.css" layer(components);` | `src/theme/attachments.css` — feuille de `SeriesAttachments`, pour `componentStyles: 'none'` |
| `import { ... } from '@regrets/hyperfocale/loader'` | `src/loader.ts` — `seriesLoader` (Content Layer, repli de locale, `prepare` avant `parseData`, `sections`), `fallbackField`, `stringifyTags`, `readSeriesMedia` (Node) |
| `import { seriesCollection } from 'virtual:hyperfocale/collection'` | module virtuel Vite |
| `import { ... } from '@regrets/hyperfocale/ingest'` | `src/ingest/index.ts` — contrat d'ingestion, agnostique (WebCrypto) |
| `import { ... } from '@regrets/hyperfocale/ingest/fs'` | `src/ingest/fs.ts` — `FilesystemProvider`, `hashFile`, `materializeSnapshot` (Node) |
| `import { ... } from '@regrets/hyperfocale/ingest/dropbox'` | `src/ingest/dropbox.ts` — client, provider, webhook (fetch + WebCrypto) |
| `import { ... } from '@regrets/hyperfocale/ingest/webdav'` | `src/ingest/webdav.ts` — `WebDAVProvider` (fetch) |
| `npx hyperfocale [init\|validate\|snapshot\|diff]` | `src/cli/init.ts` — CLI |

Les **vocabulaires** du schéma — `CONTENT_TYPES`, `ATTACHMENT_KINDS`, `EMBED_PLATFORMS`, `ORIGINAL_EXTENSIONS`, `PROJECT_STATUSES` — sont exportés par l'entrée racine, pas seulement par `/helpers` : ce sous-chemin importe `astro:content` et n'est donc pas chargeable hors runtime Astro. Un formulaire, un lint ou un import CMS a besoin des valeurs licites sans monter Astro. Tout nouveau vocabulaire public doit être réexporté à la racine — un test le vérifie en dérivant la liste depuis `schema.ts`.

## Ingestion — invariants

- **Frontières** : `./ingest`, `./ingest/dropbox` et `./ingest/webdav` n'importent aucun module `node:*` (importables dans un Worker) ; seul `./ingest/fs` touche Node. L'entrée racine n'importe rien de `src/ingest/`. `tests/unit/ingest/exports.test.ts` le vérifie sur les sources et sur `dist/` — tsup retire le préfixe `node:` au bundle, le test regarde aussi les noms nus.
- **La spec fait foi** (`izo/hyperfocale-spec`, couche 4, §4.1–4.13) et ses fixtures sont normatives : `tests/unit/ingest/conformance.test.ts` les parcourt toutes. Une évolution du contrat se fait dans la spec, puis `npm run fixtures:sync -- --ref <ref>` ; ne jamais éditer `tests/fixtures/spec-ingestion/` à la main (`npm run fixtures:check` le détecte).
- **Diagnostics** : triplet `code` + `severity` + `path` (`""` pour le snapshot entier), un seul par couple `(code, path)`. Un contrôle hors contrat se code `x-*` et reste **optionnel** : `x-schema-invalid` (violations de `baseSeriesSchema`) n'est produit qu'avec `astroSchema: true`, sinon la sortie diverge des fixtures et des autres implémentations.
- **Frontmatter** : YAML 1.2 *core* (une date reste une chaîne), pas le schéma par défaut de js-yaml qu'emploie Astro — la validation juge le texte écrit.
- **Originaux** (§1.9, v2.11) : la liste fermée vit en trois endroits — `ORIGINAL_EXTENSIONS` de `schema.ts`, sa copie dans `ingest/paths.ts` (le sous-chemin n'importe pas zod) et le motif littéral du glob des documents joints dans `helpers/index.ts` (Vite n'accepte qu'un littéral), écrit sous forme insensible à la casse — une classe par lettre, `[rR][aA][fF]` : Vite compare à la casse près, et nommer `raf` et `RAF` laissait passer `.Raf` (#125). `tests/unit/originals.test.ts` vérifie que les trois concordent avec la spec, et que le motif est exactement la forme dérivée de la liste. L'exclusion se fait dans le glob : filtré au rendu seulement, un `.RAF` serait quand même émis au build.
- **Projection publiable** : le diff de publication part de `publishable(target)`, la validation de `target`. `guardChangeSet` garde la signature de la spec (`target` = la source).
- **Incomplet ≠ suppression** : `createSnapshot` exige `complete` sans défaut ; `applyDelta` lève `CursorResetError` sur un curseur expiré.
- **Confinement** : `materializeSnapshot` et `FilesystemProvider.read/write` refusent tout chemin qui traverse un lien symbolique sous leur racine (`UnsafePathError`) ; le listing filesystem écarte les liens par défaut (`followSymlinks` pour suivre ceux qui restent sous `root`). `materializeSnapshot` lit et vérifie tout avant d'appliquer. Toute évolution de ces fonctions garde ces tests (`tests/unit/ingest/fs.test.ts`).
