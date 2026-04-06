---
kanban-plugin: board
project: hyperfocale
version: "0.1.0"
updated: 2026-04-06
priorities:
  P0: Critique (bloquant)
  P1: Élevée (important)
  P2: Moyenne (utile)
  P3: Faible (nice-to-have)
efforts:
  XS: "< 30min"
  S: 1-2h
  M: 2-4h
  L: 4-8h
  XL: 1-2j
  XXL: 3-5j
prefixes:
  SETUP: Configuration, structure du package
  ARCH: Fondations, patterns, intégration Astro
  DATA: Schéma Zod, Content Collection
  MVP: Helpers TypeScript, logique métier
  FE: Composants Astro, thème CSS
  TEST: Tests unitaires et d'intégration
  DOC: Documentation, exemples
  DEPLOY: Distribution privée, packaging
---

## Backlog

- [ ] #DATA-004 [P2] API d'extension du schéma — champs métadonnées personnalisés #schema #effort-s
  **Zone** : `src/schema.ts`, `docs/schema-extensibility.md`
  **Effort** : S (1-2h)
  **Dépendances** : #DATA-002

  **Contexte** : le plugin expose un schéma minimal. Les sites consommateurs ont des besoins variés (musique, mode, voyage…). L'extension doit rester simple sans fork du plugin.

  **Checklist** :
  - [ ] Exporter `baseSeriesSchema` (champs fondamentaux uniquement) en plus du schéma complet
  - [ ] Documenter le pattern d'extension via `seriesCollection.extend({...})` dans `src/content.config.ts`
  - [ ] Exemple dans `docs/schema-extensibility.md` : ajout de `camera`, `film`, `location`, `tags` libres
  - [ ] S'assurer que les helpers (`getSeriesList`, `getSeriesBySlug`) fonctionnent avec les champs étendus via generics TypeScript

- [ ] #DATA-005 [P2] Ajouter `getAllTags()` et `getAllCollections()` aux helpers #helpers #effort-s
  **Zone** : `src/helpers/index.ts`
  **Effort** : S (1-2h)
  **Dépendances** : #DATA-002, #ARCH-003

  **Checklist** :
  - [ ] `getAllTags()` : retourne `{ name: string, count: number }[]` trié par count décroissant — ne fonctionne que si le schéma étendu inclut `tags: z.array(z.string())`
  - [ ] `getAllCollections()` : retourne `{ slug: string, name: string, count: number }[]` en extrayant le premier segment du chemin de chaque série
  - [ ] Documenter que `getAllTags()` est un no-op si `tags` n'est pas dans le schéma du site consommateur

- [ ] #FE-006 [P2] Renforcer le système de design tokens CSS #theme #effort-m
  **Zone** : `src/theme/base.css`, `src/components/`
  **Effort** : M (2-4h)
  **Dépendances** : #FE-005

  **Contexte** : le thème actuel expose des tokens `--hf-*` avec des valeurs hex hardcodées dans les composants. Un site consommateur doit pouvoir brancher son propre design system sans surcharger chaque token.

  **Checklist** :
  - [ ] Supprimer toutes les valeurs hex hardcodées des composants `.astro` (tout passe par les variables `--hf-*`)
  - [ ] Découper en couches : `base.css` (reset + structure) / `theme-light.css` / `theme-dark.css` (valeurs séparées)
  - [ ] Ajouter une classe `.hf-root` sur le wrapper de chaque composant pour limiter la cascade
  - [ ] Documenter la liste complète des variables surchargeables dans `README.md`

- [ ] #FE-007 [P2] Créer un composant `<SeriesMasonry>` (layout masonry CSS) #composants #effort-m
  **Zone** : `src/components/`
  **Effort** : M (2-4h)
  **Dépendances** : #FE-003

  **Checklist** :
  - [ ] Layout CSS columns (pas de JS, pas de librairie externe)
  - [ ] Props : `images: ImageMetadata[]`, `columns?: number` (défaut : 3)
  - [ ] Aspect ratio préservé sur chaque image
  - [ ] Transitions `opacity` et `transform` uniquement
  - [ ] Alternative à `<SeriesGallery>` (grille uniforme) — exposé dans `hyperfocale/components`

- [ ] #MVP-005 [P2] Sérialisation JSON-safe pour islands interactives (`serializeSeries`) #helpers #effort-xs
  **Zone** : `src/helpers/index.ts`
  **Effort** : XS (< 30min)
  **Dépendances** : #MVP-001

  **Contexte** : dans une architecture Islands (React, Vue, Svelte), les props passées depuis Astro doivent être JSON-serialisables. `Date` n'est pas sérialisable → erreur silencieuse au runtime.

  **Checklist** :
  - [ ] `serializeSeries(series)` : convertit `Date` → `string` ISO, retourne un objet plain JSON
  - [ ] `serializeSeriesList(series[])` : variante tableau
  - [ ] Exporter les types `SerializedSeries` correspondants
  - [ ] Tester que le résultat passe `JSON.stringify` / `JSON.parse` sans perte

- [ ] #ARCH-004 [P3] Adapter les images pour les déploiements avec optimisation côté serveur #images #effort-s
  **Zone** : `src/helpers/index.ts`, `src/components/`
  **Effort** : S (1-2h)
  **Dépendances** : #MVP-001

  **Contexte** : certains hébergeurs (Vercel, Netlify Image CDN, Cloudflare) optimisent les images à la volée. En dev local, les endpoints d'optimisation n'existent pas → 404. Ce comportement doit être détecté automatiquement.

  **Checklist** :
  - [ ] Détecter `import.meta.env.DEV` → désactiver srcSet dynamique en dev
  - [ ] Option `imageOptimization?: 'auto' | 'disabled'` dans `HyperfocaleOptions` (défaut : `'auto'`)
  - [ ] Documenter la limitation dans `README.md` (section "Déploiement")

- [ ] #ARCH-005 [P3] Cache build-time pour `getCollection` #performance #effort-m
  **Zone** : `src/helpers/index.ts`
  **Effort** : M (2-4h)
  **Dépendances** : #MVP-003

  **Contexte** : sur de grands catalogues (500+ séries), chaque route appellera `getCollection` séparément si le cache singleton du module n'est pas partagé entre les workers Vite. Évaluer et documenter les limites.

  **Checklist** :
  - [ ] Mesurer le nombre d'appels `getCollection` sur un build avec 100+ séries (via log de debug)
  - [ ] Documenter le comportement réel du cache module-level dans le contexte SSG d'Astro 6
  - [ ] Si nécessaire : proposer un helper `warmSeriesCache()` à appeler explicitement en `getStaticPaths`

## Todo

- [ ] #DATA-003 [P1] `querySeries()` — API de requête avec filtres et pagination #helpers #effort-m
  **Zone** : `src/helpers/index.ts`
  **Effort** : M (2-4h)
  **Dépendances** : #DATA-002, #MVP-003

  **Contexte** : `getSeriesList()` retourne toutes les séries triées. Dès qu'un site a des pages de collection, de tag, ou de la pagination, il a besoin de filtres. Remplacer par `querySeries(options)` tout en gardant `getSeriesList()` comme alias simplifié.

  **Checklist** :
  - [ ] Filtre `collection?: string` — premier segment du chemin (si hiérarchie activée)
  - [ ] Filtre `tags?: string[]` — ET logique (toutes les tags doivent être présentes)
  - [ ] Filtre `featured?: boolean | 'first'` — `'first'` remonte les featured en tête de liste
  - [ ] Filtre `exclude?: string[]` — exclut des slugs précis
  - [ ] Filtre `published?: boolean` (défaut `true`), `draft?: boolean` (défaut `false`)
  - [ ] Sort : `'date'` (défaut), `'title'`, `'random'`
  - [ ] Pagination : `limit?`, `offset?` → retourner `{ items, pagination: { currentPage, totalPages, totalItems, hasNext, hasPrev } }`

- [ ] #DATA-002 [P0] Enrichir le schéma Zod — champs communs à tout site de galerie #schema #effort-s
  **Zone** : `src/schema.ts`, `src/index.ts` (module virtuel)
  **Effort** : S (1-2h)
  **Dépendances** : #DATA-001

  **Contexte** : le schéma actuel (`title`, `date`, `description`, `cover`, `location`) est minimal. Ces champs supplémentaires sont utiles pour n'importe quel site de galerie photo, indépendamment du domaine (musique, mode, voyage…).

  **Checklist** :
  - [ ] `published: z.boolean().default(true)` — contrôle la visibilité publique
  - [ ] `draft: z.boolean().default(false)` — masque une série en cours d'édition
  - [ ] `featured: z.boolean().default(false)` — mise en avant éditoriale
  - [ ] `tags: z.array(z.string()).default([])` — catégorisation libre (actuellement absent du schéma)
  - [ ] `alt_description: z.string().optional()` — description alternative pour l'accessibilité des images
  - [ ] `private: z.boolean().default(false)` — série protégée (accès restreint, la logique de gate est à implémenter côté site consommateur)
  - [ ] `download: z.boolean().default(false)` — autorise le téléchargement des originaux (la génération du ZIP est à implémenter côté site consommateur)
  - [ ] Mettre à jour le module virtuel Vite et le type `SeriesData` exporté

- [ ] #ARCH-003 [P0] Routes catch-all pour collections hiérarchiques #routes #effort-m
  **Zone** : `src/routes/`, `src/index.ts`
  **Effort** : M (2-4h)
  **Dépendances** : #ARCH-002

  **Contexte** : le routing actuel suppose un seul niveau de slug (`/series/mon-slug`). Un site réel organise souvent le contenu en catégories imbriquées (ex: `/series/voyages/asie/tokyo-2024`). Le catch-all Astro (`[...slug].astro`) gère nativement cette arborescence.

  **Checklist** :
  - [ ] Remplacer la route `/series/[slug]/` par `/series/[...slug]/` (catch-all multi-niveaux)
  - [ ] Adapter `getSeriesBySlug` pour accepter les IDs hiérarchiques (chemin complet depuis `series/`)
  - [ ] Helper `getParentCollection(id)` : extrait le premier segment du chemin pour les pages de collection
  - [ ] Tester avec des slugs à 1, 2 et 3 niveaux de profondeur

- [ ] #MVP-003 [P0] Cache singleton — éviter N appels `getCollection` par page #performance #effort-s
  **Zone** : `src/helpers/index.ts`
  **Effort** : S (1-2h)
  **Dépendances** : #MVP-001

  **Checklist** :
  - [ ] Variable module-level `_allSeries: Series[] | null = null`
  - [ ] `getAllSeriesCached()` : retourne le cache ou appelle `getCollection` une seule fois
  - [ ] `resetSeriesCache()` exportée pour les tests (évite les effets de bord entre suites)
  - [ ] Ajouter au mock `tests/__mocks__/` si nécessaire

- [ ] #MVP-004 [P1] Cover fallback — première image alphabétique si `cover` absent #helpers #effort-xs
  **Zone** : `src/helpers/index.ts`
  **Effort** : XS (< 30min)
  **Dépendances** : #MVP-001

  **Checklist** :
  - [ ] `getSeriesCover(slug, coverPath?)` : retourne `coverPath` si défini, sinon la première image alphabétique du glob
  - [ ] Utiliser dans `SeriesCard.astro` et `series-detail.astro` pour remplacer le placeholder SVG par une vraie image quand possible

## In Progress

## Blocked

## Done

- [x] #DEPLOY-002 [P2] Ajouter le CLI `hyperfocale init` #cli #effort-s
  > ✅ **Terminé** le 2026-04-05

  **Zone** : `src/cli/init.ts`, `package.json`, `tsup.config.ts`
  **Effort** : S (1-2h)
  **Dépendances** : #DEPLOY-001

  **Checklist** :
  - [x] Créer `src/cli/init.ts` avec shebang `#!/usr/bin/env node`
  - [x] Déclarer `"bin": { "hyperfocale": "./dist/cli/init.js" }` dans `package.json`
  - [x] Ajouter l'entry `'cli/init': 'src/cli/init.ts'` dans `tsup.config.ts`
  - [x] Comportements : créer / patcher / no-op (idempotent)
  - [x] Intégration : avertissement dans `astro:config:setup` si collection absente

  **Résumé** : CLI `npx hyperfocale init` qui crée ou met à jour `src/content.config.ts` du projet consommateur. Gère 3 cas : fichier absent (création), export collections existant (injection de series), pas d'export (ajout en fin de fichier).

- [x] #DEPLOY-001 [P3] Préparer le packaging npm privé #distribution #effort-m
  > ✅ **Terminé** le 2026-04-05

  **Zone** : `package.json`, `tsup.config.ts`
  **Effort** : M (2-4h)
  **Dépendances** : #SETUP-001, #ARCH-001

  **Checklist** :
  - [x] Configurer les exports `package.json` (`hyperfocale/components`, `hyperfocale/helpers`)
  - [x] Configurer tsup pour bundler le plugin (avec copie des .astro dans dist/)
  - [x] Vérifier que le package fonctionne en lien local (symlink `node_modules/hyperfocale -> ../../..`)

  **Résumé** : package.json enrichi (keywords, sideEffects, scripts test:unit/test:e2e, prepublishOnly, pack:dry). Package : 29 fichiers, 11.6 kB. Lien local via `"hyperfocale": "../../"` vérifié fonctionnel.

- [x] #TEST-003 [P3] Tests e2e des routes automatiques #tests #effort-xl
  > ✅ **Terminé** le 2026-04-05

  **Zone** : `tests/e2e/`
  **Effort** : XL (1-2j)
  **Dépendances** : #ARCH-002, #MVP-001, #MVP-002

  **Checklist** :
  - [x] Setup environnement de test Astro (vitest + build statique)
  - [x] Tester `/series/` renvoie la liste (HTML généré, CSS thème, composant SeriesList)
  - [x] Tester `/index.html` page d'accueil (lien vers /series/, CSS thème)
  - [x] Tester la structure du build plugin (dist/routes, dist/theme, dist/components)
  - [x] Tester 404 sur slug inexistant (pas de fichier HTML généré)
  - [x] Tester absence de page 2 quand pageSize >= images

  **Résumé** : 24 tests e2e dans `tests/e2e/routes.test.ts`. Stratégie : `astro build` via `execFileSync` dans `beforeAll`, puis analyse des fichiers HTML générés. Correction de bugs : tsup copie les .astro dans dist/, schéma utilise zod, syntaxe import.meta.env corrigée.

- [x] #DOC-002 [P3] Documenter l'API d'extensibilité du schéma #docs #effort-s
  > ✅ **Terminé** le 2026-04-05

  **Zone** : `docs/`
  **Effort** : S (1-2h)
  **Dépendances** : #DATA-001

  **Checklist** :
  - [x] Documenter comment surcharger la collection `series`
  - [x] Exemples : tags, draft, camera, externalUrl

  **Résumé** : Fichier `docs/schema-extensibility.md` avec guide complet, 5 exemples d'extensions, typage TypeScript et limites.

- [x] #DOC-001 [P3] Écrire un exemple complet de site consommateur #docs #effort-l
  > ✅ **Terminé** le 2026-04-05

  **Zone** : `examples/demo-site/`
  **Effort** : L (4-8h)

  **Checklist** :
  - [x] Créer un mini-site Astro 6 qui consomme le plugin en local
  - [x] Ajouter 2-3 séries photo fictives avec vraies images (bretagne-2024, tokyo-automne, islande-2023)
  - [x] Documenter les étapes dans un README d'exemple

  **Résumé** : Mini-site complet avec astro.config.mjs, content.config.ts, layout, page d'accueil, 3 séries fictives (4 images PNG chacune) et README détaillé.
  **Commits** : (voir ci-dessous)

- [x] #SETUP-001 [P0] Initialiser la structure du package `hyperfocale` #setup #effort-m

  **Zone** : `src/`
  **Effort** : M (2-4h)

  **Checklist** :
  - [x] Créer `package.json` avec `name: "hyperfocale"`, `type: "module"`, `exports`
  - [x] Créer `tsconfig.json` strict (Astro 6 compatible)
  - [x] Créer l'arborescence : `src/index.ts`, `src/components/`, `src/helpers/`, `src/theme/`
  - [x] Installer les dépendances : `astro` (peer), `zod` (peer)

- [x] #ARCH-001 [P0] Implémenter l'intégration Astro (`defineIntegration`) #integration #effort-m

  **Zone** : `src/index.ts`
  **Effort** : M (2-4h)
  **Dépendances** : #SETUP-001

  **Checklist** :
  - [x] Déclarer l'intégration avec `name: "hyperfocale"` et options typées (`prefix`, `pageSize`, `theme`)
  - [x] Valider et normaliser les options dans le hook `astro:config:setup`
  - [x] Exposer la fonction d'intégration comme export par défaut
  - [x] TypeScript : interface `HyperfocaleOptions` exportée

- [x] #DATA-001 [P0] Injecter le schéma Zod de la collection `series` #schema #effort-m

  **Zone** : `src/schema.ts`, hook `astro:config:setup`
  **Effort** : M (2-4h)
  **Dépendances** : #ARCH-001

  **Checklist** :
  - [x] Définir le schéma Zod : `title`, `date`, `description`, `cover`, `location`
  - [x] Utiliser un module virtuel Vite `virtual:hyperfocale/collection` pour exposer la collection prête à l'emploi
  - [x] Exporter le type `SeriesData` inféré depuis le schéma
  - Note: En Astro 6, l'injection automatique de collection sans action utilisateur n'est pas supportée par l'API d'intégration. Le module virtuel `virtual:hyperfocale/collection` fournit `seriesCollection` prête à être ajoutée dans `src/content.config.ts`.

- [x] #ARCH-002 [P0] Injecter les routes automatiques via `injectRoute()` #routes #effort-m

  **Zone** : `src/index.ts`, `src/routes/`
  **Effort** : M (2-4h)
  **Dépendances** : #ARCH-001

  **Checklist** :
  - [x] Créer `src/routes/series-list.astro` (route `/series/`)
  - [x] Créer `src/routes/series-detail.astro` (route `/series/[slug]/`)
  - [x] Créer `src/routes/series-page.astro` (route `/series/[slug]/[page]/`)
  - [x] Injecter les 3 routes depuis `astro:config:setup` en respectant l'option `prefix`

- [x] #MVP-001 [P1] Implémenter les helpers TypeScript #helpers #effort-m

  **Zone** : `src/helpers/index.ts`
  **Effort** : M (2-4h)
  **Dépendances** : #DATA-001

  **Checklist** :
  - [x] `getSeriesList()` : retourne toutes les séries triées par date décroissante
  - [x] `getSeriesBySlug(slug)` : retourne une série ou lève une erreur si absente
  - [x] `getSeriesImages(slug)` : glob `/src/content/series/*/media/*.{jpg,jpeg,png,webp,avif}`, tri alphabétique
  - [x] `paginateImages(images, pageSize, page)` : retourne `{ items, totalPages, currentPage }`
  - [x] Typage strict TypeScript pour tous les retours

- [x] #MVP-002 [P1] Implémenter la logique des routes (pages Astro) #routes #effort-l

  **Zone** : `src/routes/`
  **Effort** : L (4-8h)
  **Dépendances** : #ARCH-002, #MVP-001

  **Checklist** :
  - [x] `series-list.astro` : appelle `getSeriesList()`, passe à `<SeriesList>`
  - [x] `series-detail.astro` : `getStaticPaths()` sur toutes les séries, page 1 de la galerie
  - [x] `series-page.astro` : `getStaticPaths()` avec pagination, page N de la galerie
  - [x] Gestion 404 si slug inexistant
  - [x] Affichage du body markdown avant la galerie

- [x] #FE-001 [P1] Créer le composant `<SeriesCard>` #composants #effort-s

  **Zone** : `src/components/SeriesCard.astro`
  **Effort** : S (1-2h)
  **Dépendances** : #DATA-001

  **Checklist** :
  - [x] Props : `series: Series` (requis)
  - [x] Affiche : cover (Image Astro optimisée), titre, date formatée, description
  - [x] Lien cliquable vers `/series/[slug]/`
  - [x] Fallback si pas de cover (placeholder SVG)

- [x] #FE-002 [P1] Créer le composant `<SeriesList>` #composants #effort-s

  **Zone** : `src/components/SeriesList.astro`
  **Effort** : S (1-2h)
  **Dépendances** : #FE-001

  **Checklist** :
  - [x] Props : `series: Series[]` (requis), `columns?: number` (défaut 3)
  - [x] Grille CSS responsive avec `columns` variable
  - [x] Boucle sur `<SeriesCard>` pour chaque série

- [x] #FE-003 [P1] Créer le composant `<SeriesGallery>` #composants #effort-m

  **Zone** : `src/components/SeriesGallery.astro`
  **Effort** : M (2-4h)
  **Dépendances** : #MVP-001

  **Checklist** :
  - [x] Props : `images`, `page`, `totalPages`, `baseUrl` (+ `allImages` pour lightbox)
  - [x] Grille d'images optimisées (Astro `<Image>`)
  - [x] Pagination : liens précédent/suivant, numéros de pages
  - [x] URL page 1 = `/<prefix>/<slug>/`, page N = `/<prefix>/<slug>/N/`
  - [x] Chaque image déclenche ouverture de `<SeriesLightbox>`

- [x] #FE-004 [P1] Créer le composant `<SeriesLightbox>` #composants #effort-m

  **Zone** : `src/components/SeriesLightbox.astro`
  **Effort** : M (2-4h)
  **Dépendances** : #FE-003

  **Checklist** :
  - [x] Props : `images: ImageMetadata[]` (toutes les images de la série)
  - [x] Visionneuse plein écran (overlay)
  - [x] Navigation clavier : ← / → pour changer d'image, Esc pour fermer
  - [x] JavaScript minimal côté client (vanilla, pas de librairie)
  - [x] Accessible : focus trap, aria-labels

- [x] #FE-005 [P2] Implémenter le thème CSS et les custom properties #theme #effort-m

  **Zone** : `src/theme/`
  **Effort** : M (2-4h)
  **Dépendances** : #ARCH-001

  **Checklist** :
  - [x] Créer `src/theme/base.css` avec les custom properties `--hf-*`
  - [x] Implémenter les variantes `light` / `dark` / `auto` (media query `prefers-color-scheme`)
  - [x] Injecter le CSS dans le hook `astro:config:setup` via `injectScript`
  - [x] Documenter les propriétés surchargeables dans un commentaire CSS

- [x] #TEST-001 [P2] Tests unitaires des helpers #tests #effort-m

  **Zone** : `tests/unit/`
  **Effort** : M (2-4h)
  **Dépendances** : #MVP-001

  **Checklist** :
  - [x] Setup vitest
  - [x] Tester `paginateImages` : calcul correct de `totalPages`, `currentPage`, slice `items`
  - [x] Tester erreur sur pageSize invalide
  - Note: `getSeriesBySlug` et `getSeriesList` nécessitent le runtime Astro, non testables en unitaire pur

- [x] #TEST-002 [P2] Tests du schéma Zod #tests #effort-s

  **Zone** : `tests/unit/schema.test.ts`
  **Effort** : S (1-2h)
  **Dépendances** : #DATA-001

  **Checklist** :
  - [x] Valider les champs requis (`title`, `date`)
  - [x] Valider les optionnels (`description`, `cover`, `location`)
  - [x] Tester les cas d'erreur (date invalide, title manquant)

## Archive

%% kanban:settings
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false,true,true]}
%%
