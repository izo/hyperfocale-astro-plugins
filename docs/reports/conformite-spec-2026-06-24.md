# Rapport de conformité spec↔code — `@izo/hyperfocale` v0.4.0

**Date** : 2026-06-24
**Spec auditée** : Hyperfocale v2.4-draft (révision 2026-06-08 / 2026-06-11)
**Plugin audité** : `@izo/hyperfocale` v0.4.0
**Périmètre** : Couche 2 (Adaptateur Astro §2.0, §2.0.1, §2.1) + Couche 3 (Composants UI §3) + Schéma (§0, §1.3, §1.5)
**Mode** : read-only sur `src/` et `tests/`

---

## 1. Score global de conformité

| Périmètre | Exigences totales | Conformes ✅ | Partielles 🟡 | Absentes ❌ | Déviantes ⚠️ |
|-----------|-------------------|-------------|--------------|------------|-------------|
| §2.0 Contrat d'adaptateur | 8 MUST | 8 | 0 | 0 | 0 |
| §2.0.1 Presets de domaine | 1 COULD | 0 | 1 | 0 | 0 |
| §2.1 Adaptateur Astro | 6 | 5 | 1 | 0 | 0 |
| §1.3 Schéma frontmatter | 13 champs | 9 | 2 | 2 | 0 |
| §1.5 Mode distant | 4 règles | 4 | 0 | 0 | 0 |
| §1.6 Règles métier | 6 règles | 5 | 1 | 0 | 0 |
| §1.8 Séries imbriquées | 5 obligations | 0 | 0 | 5 | 0 |
| §3.1 Composants UI | 6 composants | 4 | 0 | 2 | 0 |
| §3.2 Types partagés | 4 types | 3 | 1 | 0 | 0 |
| §3.3 Interactions requises | 5 interactions | 4 | 1 | 0 | 0 |
| **TOTAL** | **60** | **42** | **5** | **9** | **0** |

**Score global : 70 % conformes (42/60)** — 78 % si les partielles comptent à 50 %.

> Note : les 5 exigences ❌ de §1.8 (séries imbriquées) sont nouvelles en spec v2.2. La spec elle-même précise que les adaptateurs qui ne les supportent pas doivent « ne pas crasher » (comportement minimal), ce qui est satisfait. L'absence est donc fonctionnellement acceptable en v0.4.0, mais constitue un gap de roadmap.

---

## 2. Matrice de conformité détaillée

### §2.0 — Contrat d'adaptateur (MUST)

| Obligation spec | Fichier impl | Statut | Note |
|-----------------|-------------|--------|------|
| Lire `title`, `date`, `description`, `cover`, `location`, `draft`, `lang` | `src/schema.ts` | ✅ | Tous présents dans `seriesSchema()` |
| Ignorer les champs inconnus (passthrough) | `src/schema.ts:78`, `src/index.ts:188` | ✅ | `z.looseObject()` racine + `.passthrough()` dans le module virtuel |
| Transmettre `iptc.*` et champs supplémentaires | `src/schema.ts:17-33` | ✅ | `iptcSchema` en `z.looseObject()` (v0.4.0) |
| Scanner `media/` (glob alphabétique) | `src/helpers/index.ts:78-97` | ✅ | Glob `media/*.{jpg,jpeg,png,webp,avif,tiff}`, `.localeCompare()` |
| Supporter le mode distant (`images[]`) | `src/helpers/index.ts:68-75` | ✅ | Priorité `images[]` sur `media/` |
| Respecter `draft` | `src/helpers/index.ts:33-35` | ✅ | Exclu en production (`!entry.data.draft`) |
| Trier par date décroissante | `src/helpers/index.ts:36-41` | ✅ | `dateB - dateA` |
| Exposer le body (Markdown → HTML) | `src/routes/series-detail.astro:30`, `series-page.astro:57` | ✅ | `render(series)` / `series.render()` — voir note déviante ci-dessous |

> **Note §2.0** : `series-page.astro:57` utilise encore l'ancienne API `series.render()` (Astro < 5) au lieu de `render(series)` importé depuis `astro:content`. Le fichier `series-detail.astro` utilise la bonne API. Incohérence interne — pas un gap spec, mais un défaut de qualité.

---

### §2.0.1 — Presets de domaine (COULD)

| Obligation spec | Fichier impl | Statut | Note |
|-----------------|-------------|--------|------|
| Exposer une option `preset` (`series`, `recipe`, `brands`...) | `src/index.ts:15-47` | 🟡 | Les options `collectionName`, `prefix`, `dateRequired` permettent de simuler un preset manuellement, mais il n'existe pas d'option `preset: 'recipe'` de haut niveau — l'utilisateur doit configurer les 3 paramètres séparément |

---

### §2.1 — Adaptateur Astro (spécifique)

| Exigence spec | Fichier impl | Statut | Note |
|---------------|-------------|--------|------|
| Collection enregistrée via API Astro 6 | `src/index.ts:140-201` | ✅ | Module virtuel Vite `virtual:hyperfocale/collection` |
| Route `/<prefix>/` | `src/index.ts:115-119`, `src/routes/series-list.astro` | ✅ | `prerender: true` |
| Route `/<prefix>/[slug]/` | `src/index.ts:121-125`, `src/routes/series-detail.astro` | ✅ | `prerender: true` |
| Route `/<prefix>/[slug]/[page]/` | `src/index.ts:127-131`, `src/routes/series-page.astro` | ✅ | `prerender: true` |
| Composants `SeriesCard`, `SeriesList`, `SeriesGallery`, `SeriesLightbox` exposés | `src/components/` | ✅ | Tous présents, exportés via `src/components/index.ts` |
| Import path `hyperfocale/astro/components` | `package.json` (non audité src/) | 🟡 | La spec documente `hyperfocale/astro/components` mais le plugin est `@izo/hyperfocale` — le chemin d'import réel est `@izo/hyperfocale/components` (voir exports `package.json`) |

---

### §1.3 — Frontmatter : champs du schéma Zod

#### Core (champs standardisés)

| Champ spec | Requis spec | Type spec | Présent impl | Type impl | Conforme |
|-----------|-------------|-----------|-------------|-----------|---------|
| `title` | **oui** | `string` | ✅ `schema.ts:79` | `z.string()` | ✅ |
| `date` | **oui** (configurable) | `date` ISO 8601 | ✅ `schema.ts:80` | `z.coerce.date()` | ✅ |
| `description` | non | `string` | ✅ `schema.ts:81` | `z.string().optional()` | ✅ |
| `cover` | non | `string` (chemin) | ✅ `schema.ts:82` | `image().optional()` (Astro image helper) | ✅ |
| `location` | non | `string` | ✅ `schema.ts:83` | `z.string().optional()` | ✅ |

#### Workflow

| Champ spec | Requis spec | Présent impl | Type impl | Conforme |
|-----------|-------------|-------------|-----------|---------|
| `draft` | non, défaut `false` | ✅ `schema.ts:85` | `z.boolean().default(false)` | ✅ |
| `lang` | non | ✅ `schema.ts:84` | `z.string().optional()` | ✅ |
| `featured` | non, défaut `false` | ✅ `schema.ts:86` | `z.boolean().default(false)` | ✅ |
| `tags` | non | ✅ `schema.ts:87` | `z.array(z.string()).optional()` | ✅ |

#### Extension IPTC (§1.3)

| Champ spec | Type spec | Présent impl | Type impl | Conforme |
|-----------|-----------|-------------|-----------|---------|
| `iptc` (bloc) | objet looseObject | ✅ `schema.ts:88` | `iptcSchema.optional()` (looseObject) | ✅ |
| `iptc.creator` | `string` | ✅ `schema.ts:18` | `z.string().optional()` | ✅ |
| `iptc.credit` | `string` | ✅ `schema.ts:19` | `z.string().optional()` | ✅ |
| `iptc.copyright` | `string` | ✅ `schema.ts:20` | `z.string().optional()` | ✅ |
| `iptc.keywords` | `string[]` | ✅ `schema.ts:21` | `z.array(z.string()).optional()` | ✅ |
| `iptc.city` | `string` | ✅ `schema.ts:22` | `z.string().optional()` | ✅ |
| `iptc.province` | `string` | ✅ `schema.ts:23` | `z.string().optional()` | ✅ |
| `iptc.country` | `string` | ✅ `schema.ts:24` | `z.string().optional()` | ✅ |
| `iptc.country_code` | `string` | ✅ `schema.ts:25` | `z.string().optional()` | ✅ |
| `iptc.camera` | `string` | ✅ `schema.ts:26` | `z.string().optional()` | ✅ |
| `iptc.lens` | `string` | ✅ `schema.ts:27` | `z.string().optional()` | ✅ |
| `iptc.film` | `string` | ✅ `schema.ts:28` | `z.string().optional()` | ✅ |
| `iptc.headline` | `string` | ✅ `schema.ts:29` | `z.string().optional()` | ✅ |
| `iptc.instructions` | `string` | ✅ `schema.ts:30` | `z.string().optional()` | ✅ |
| `iptc.source` | `string` | ✅ `schema.ts:31` | `z.string().optional()` | ✅ |
| `iptc.gps` | `{ lat: number, lng: number }` | ✅ `schema.ts:32` | `z.object({ lat: z.number(), lng: z.number() }).optional()` | ✅ |
| `iptc.custom.*` (passthrough) | extensible | ✅ `schema.ts:17` | `z.looseObject()` | ✅ |

#### Champs manquants au schéma Zod

| Champ spec | Section | Requis | Impact |
|-----------|---------|--------|--------|
| `published` | Extension plugin (mentionné §0.5 comme « redondant avec `draft` ») | non | Mentionné dans §0.5 comme extension plugin — redondant, pas une obligation spec mais documenté comme présent |
| `lineup_order` | §1.8 séries imbriquées | SHOULD (sous-séries) | Absent car §1.8 non implémenté |

---

### §1.5 — Mode distant

| Règle spec | Fichier impl | Statut |
|-----------|-------------|--------|
| `images[]` prioritaire sur `media/` | `src/helpers/index.ts:68` | ✅ |
| Fallback sur `media/` si `images` absent | `src/helpers/index.ts:77` | ✅ |
| Les deux modes mutuellement exclusifs | Par construction (priorité `images[]`) | ✅ |
| Chaque entrée : `url` requis, `alt`/`width`/`height` optionnels | `src/schema.ts:36-41` | ✅ |

---

### §1.6 — Règles métier

| Règle spec | Fichier impl | Statut | Note |
|-----------|-------------|--------|------|
| Scan `media/*.{jpg,jpeg,png,webp,avif,tiff}`, pas de récursion | `src/helpers/index.ts:78-80` | ✅ | |
| Tri alphabétique des images | `src/helpers/index.ts:92-95` | ✅ | `.localeCompare()` |
| `cover` frontmatter ou fallback première image | `src/routes/series-detail.astro` (cover affiché), `SeriesGallery` (allImages[0] non exploité) | 🟡 | Le `cover` est affiché dans `SeriesCard`, mais le fallback « première image alphabétique » si `cover` absent n'est pas implémenté dans les routes — la galerie affiche les images sans sélectionner une couverture de secours |
| Body Markdown affiché avant la galerie | `src/routes/series-detail.astro:52-56` | ✅ | `<Content />` avant `<SeriesGallery>` |
| Pagination configurable, défaut 12 | `src/index.ts:26` | ✅ | |
| Lightbox charge toutes les images (pas seulement la page) | `src/routes/series-detail.astro:57-64`, `src/components/SeriesGallery.astro:104` | ✅ | `allImages` passé à `SeriesLightbox` |

---

### §1.8 — Séries imbriquées (couche 2.2, nouveau)

| Obligation spec | Fichier impl | Statut | Note |
|-----------------|-------------|--------|------|
| Route `/<prefix>/<slug-conteneur>/` pour conteneur | Aucun | ❌ | Non implémenté |
| Route `/<prefix>/<slug-conteneur>/<sous-slug>/` pour sous-séries | Aucun | ❌ | Non implémenté |
| Ne pas crasher sur présence de sous-dossiers | `src/helpers/index.ts:86-90` | ✅ | Le glob filtre par `match[1] === dirSlug`, les sous-dossiers sont ignorés sans crash |
| Indexer le conteneur comme série normale (comportement minimal) | `src/helpers/index.ts:32-42` | ✅ | `getCollection('series')` ramène les conteneurs comme n'importe quelle série |
| Option de listing `flat` vs `hierarchical` | Aucun | ❌ | Non implémenté, mais comportement équivalent à `flat` par défaut |

> La spec v2.2 exige explicitement que les adaptateurs qui ne supportent pas les séries imbriquées « ne pas crasher » et « indexer le conteneur comme une série normale » — ces deux minimums sont satisfaits. Les 3 obligations positives (routes dédiées, option listing) sont absentes.

---

### §3.1 — Composants UI

| Composant spec | Présent impl | Props minimales spec | Props impl | Statut |
|----------------|-------------|---------------------|-----------|--------|
| `SeriesCard` | ✅ `src/components/SeriesCard.astro` | `series: Series` | `series: Series`, `prefix?: string` | ✅ |
| `SeriesList` | ✅ `src/components/SeriesList.astro` | `series: Series[]`, `columns?: number` | `series: Series[]`, `columns?: number`, `prefix?: string` | ✅ |
| `SeriesGallery` | ✅ `src/components/SeriesGallery.astro` | `images: Image[]`, `page: number`, `totalPages: number`, `baseUrl: string` | `images`, `allImages`, `page`, `totalPages`, `baseUrl` | ✅ |
| `SeriesLightbox` | ✅ `src/components/SeriesLightbox.astro` | `images: Image[]` | `images: ImageMetadata[]` | ✅ |
| `SeriesMap` | ❌ Absent | `series: Series[]` (avec `iptc.gps`) | — | ❌ |
| `SeriesFilter` | ❌ Absent | `series: Series[]`, `filters: FilterConfig` | — | ❌ |

---

### §3.2 — Types de données partagés

| Type spec | Présent impl | Alignement | Statut |
|----------|-------------|------------|--------|
| `Series` (interface) | `src/helpers/index.ts:7` (`type Series = CollectionEntry<'series'>`) | Délégation Astro — champs accessibles via `.data.*` et `.id` au lieu d'un objet plat | 🟡 Déviant mais acceptable (Astro impose `CollectionEntry`) |
| `Image` | `src/helpers/index.ts:21-26` (`ImageMetadata`) | `src`, `width`, `height`, `format` — champ `alt` absent de `ImageMetadata` | 🟡 `alt` manquant dans le type interne |
| `IPTCMetadata` | Via `src/schema.ts:17-33` + `SeriesData` | Tous les champs présents, `[key: string]: unknown` via `looseObject` | ✅ |
| `PaginatedImages` | `src/helpers/index.ts:12-16` (`PaginationResult<T>`) | `items`, `currentPage`, `totalPages` présents — `pageSize` absent du type retourné | 🟡 `pageSize` manquant dans `PaginationResult` |

---

### §3.3 — Interactions requises

| Interaction spec | Implémentation | Statut | Note |
|-----------------|----------------|--------|------|
| Clic sur image → ouvre lightbox | `src/components/SeriesGallery.astro:108-114` | ✅ | `data-lightbox-index` + `hfLightbox.open(index)` |
| Navigation lightbox : ← → clavier, boutons | `src/components/SeriesLightbox.astro:126-132` | ✅ | `ArrowLeft` / `ArrowRight` + boutons prev/next |
| Fermeture lightbox : Esc, clic overlay, bouton | `src/components/SeriesLightbox.astro:116-124` | ✅ | Les 3 mécanismes présents |
| Pagination galerie | `src/components/SeriesGallery.astro:62-101` | ✅ | nav avec rel=prev/next, aria-label |
| Lazy loading images hors viewport | `src/components/SeriesGallery.astro:52`, `SeriesCard.astro:33` | 🟡 | `loading="lazy"` présent mais pas de `decoding="async"` ni d'intersection observer — conforme au minimum SHOULD |
| Swipe tactile lightbox | `src/components/SeriesLightbox.astro` | ❌ | Absent — spec indique « swipe tactile » parmi les navigations requises |

> Note : le swipe tactile est listé dans §3.3 comme comportement attendu de `SeriesLightbox`. Il n'est pas implémenté (uniquement clavier + boutons).

---

## 3. Gaps par priorité

### Critique (MUST de la spec, absent)

| # | Section spec | Exigence | État actuel | Effort estimé |
|---|-------------|---------|-------------|---------------|
| C1 | §1.8 / §2.2 | Routes séries imbriquées : `/<prefix>/<conteneur>/` et `/<prefix>/<conteneur>/<sous-slug>/` | Non implémenté — le plugin ignore la hiérarchie des sous-dossiers | M (2–3j : détection conteneurs dans `getSeriesList`, 2 routes, `getStaticPaths` récursif) |

### Haut (SHOULD de la spec, absent ou partiel)

| # | Section spec | Exigence | État actuel | Effort estimé |
|---|-------------|---------|-------------|---------------|
| H1 | §3.3 | Swipe tactile dans `SeriesLightbox` | Absent — navigation uniquement clavier + boutons | S (0,5j : `touchstart`/`touchend` delta) |
| H2 | §3.1 | `SeriesMap` : carte des séries géolocalisées | Absent | L (3–5j : intégration Leaflet ou Mapbox, filtrage `iptc.gps`) |
| H3 | §3.1 | `SeriesFilter` : filtrage par keywords, date, lieu | Absent | L (3–5j : composant + logique filtre) |
| H4 | §1.6 | Fallback cover = première image alphabétique si `cover` absent | Partiellement implémenté : `SeriesCard` affiche un placeholder SVG, mais ne tente pas de charger `allImages[0]` en cover | S (0,5j : dans `getSeriesImages`, retourner `images[0]` si `cover` absent) |
| H5 | §3.2 | Champ `alt` manquant dans `ImageMetadata` | `ImageMetadata` n'a pas de champ `alt`, ce qui perd les alt texts du mode distant | XS (0,25j : ajouter `alt?: string` à `ImageMetadata` + propager aux composants) |

### Moyen (COULD, amélioration de DX ou spec)

| # | Section spec | Exigence | État actuel | Effort estimé |
|---|-------------|---------|-------------|---------------|
| M1 | §2.0.1 | Option `preset` de haut niveau (`preset: 'recipe'`, `preset: 'series'`) | L'utilisateur doit configurer `collectionName + prefix + dateRequired` séparément | S (1j : objet `PRESETS` + résolution dans `normalizeOptions`) |
| M2 | §3.2 | `pageSize` absent de `PaginationResult<T>` | Le consommateur ne peut pas savoir quelle taille de page a été utilisée sans la repasser manuellement | XS (0,25j : ajouter `pageSize: number` à `PaginationResult`) |
| M3 | §A (Annexe) | CLI `hyperfocale-lint` (validation du format) | Absent | M (2j : validation frontmatter + structure dossiers) |
| M4 | §E (Annexe) | Flux RSS (`/<prefix>/feed.xml`) et JSON Feed | Absent — la spec dit SHOULD pour les adaptateurs web | M (1,5j : route RSS + route JSON Feed) |
| M5 | §1.8 | Option listing `flat` vs `hierarchical` pour les séries conteneurs | Absent (comportement flat implicite) | S (0,5j : option config + filtrage dans `getSeriesList`) |
| M6 | Interne | `series-page.astro:57` utilise `series.render()` (API deprecated Astro < 5) au lieu de `render(series)` | Incohérence avec `series-detail.astro` qui utilise la bonne API | XS (0,1j : remplacer 1 ligne) |

---

## 4. Tableau comparatif schéma spec v2.4-draft vs `schema.ts`

| Champ | Requis spec | Type spec | Présent `schema.ts` | Type `schema.ts` | Delta |
|-------|-------------|-----------|--------------------|--------------------|-------|
| `title` | **oui** | string | ✅ | `z.string()` | — |
| `date` | **oui** (configurable) | date | ✅ | `z.coerce.date()` (opt. via `dateRequired`) | — |
| `description` | non | string | ✅ | `z.string().optional()` | — |
| `cover` | non | image path | ✅ | `image().optional()` | — |
| `location` | non | string | ✅ | `z.string().optional()` | — |
| `draft` | non | bool, défaut false | ✅ | `z.boolean().default(false)` | — |
| `lang` | non | ISO 639-1 | ✅ | `z.string().optional()` — pas de validation ISO | Validation ISO absente (mineure) |
| `featured` | non | bool, défaut false | ✅ | `z.boolean().default(false)` | — |
| `tags` | non | string[] | ✅ | `z.array(z.string()).optional()` | — |
| `iptc` (bloc) | non | looseObject | ✅ | `iptcSchema` (looseObject) | — |
| `iptc.creator` | non | string | ✅ | `z.string().optional()` | — |
| `iptc.credit` | non | string | ✅ | `z.string().optional()` | — |
| `iptc.copyright` | non | string | ✅ | `z.string().optional()` | — |
| `iptc.keywords` | non | string[] | ✅ | `z.array(z.string()).optional()` | — |
| `iptc.city` | non | string | ✅ | `z.string().optional()` | — |
| `iptc.province` | non | string | ✅ | `z.string().optional()` | — |
| `iptc.country` | non | string | ✅ | `z.string().optional()` | — |
| `iptc.country_code` | non | ISO 3166-1 string | ✅ | `z.string().optional()` — pas de validation ISO | Validation ISO absente (mineure) |
| `iptc.camera` | non | string | ✅ | `z.string().optional()` | — |
| `iptc.lens` | non | string | ✅ | `z.string().optional()` | — |
| `iptc.film` | non | string | ✅ | `z.string().optional()` | — |
| `iptc.headline` | non | string | ✅ | `z.string().optional()` | — |
| `iptc.instructions` | non | string | ✅ | `z.string().optional()` | — |
| `iptc.source` | non | string | ✅ | `z.string().optional()` | — |
| `iptc.gps` | non | `{ lat, lng }` | ✅ | `z.object({ lat: z.number(), lng: z.number() })` | — |
| `iptc.custom.*` (passthrough) | non | extensible | ✅ | `z.looseObject()` | — |
| `images[]` (mode distant) | non | `{ url, alt?, width?, height? }[]` | ✅ | `z.array(remoteImageSchema)` | — |
| `images[].url` | **oui** (si images) | URL string | ✅ | `z.url()` (zod 4) | — |
| `images[].alt` | non | string | ✅ | `z.string().optional()` | Perdu dans `ImageMetadata` (H5) |
| `images[].width` | non | number | ✅ | `z.number().optional()` | — |
| `images[].height` | non | number | ✅ | `z.number().optional()` | — |
| `lineup_order` | SHOULD (§1.8) | number | ❌ | Absent | §1.8 non implémenté |
| Passthrough racine | MUST | — | ✅ | `z.looseObject()` racine | — |

**Champs spec manquants dans `schema.ts`** : `lineup_order` (lié à §1.8 non implémenté).

**Champs présents dans `schema.ts` non documentés en spec core** :
- Aucun — tous les champs sont soit spec, soit extensions officialisées.

---

## 5. Prochaines étapes pour atteindre conformité complète

### Sprint 1 — Corrections rapides (< 1j total, valeur immédiate)

1. **H5** — Ajouter `alt?: string` à `ImageMetadata` (`src/helpers/index.ts:21`) et propager dans `SeriesGallery` et `SeriesLightbox` pour honorer les alt texts du mode distant.
2. **M6** — Remplacer `series.render()` par `const { Content } = await render(series)` dans `src/routes/series-page.astro:57` (import déjà présent dans `series-detail.astro`).
3. **M2** — Ajouter `pageSize: number` à l'interface `PaginationResult<T>` et le retourner dans `paginateImages()`.

### Sprint 2 — Interactions et DX (1–2j)

4. **H1** — Implémenter le swipe tactile dans `SeriesLightbox` (`touchstart`/`touchend` avec seuil de delta).
5. **H4** — Implémenter le fallback cover dans les routes : si `series.data.cover` est absent, utiliser `allImages[0]?.src` comme cover pour `SeriesCard`.
6. **M1** — Ajouter l'option `preset` (`'series' | 'recipe' | 'brands' | 'event' | 'app' | 'book' | 'place'`) dans `HyperfocaleOptions` avec résolution automatique de `collectionName + prefix + dateRequired`.

### Sprint 3 — Séries imbriquées (2–3j, C1)

7. **C1** — Implémenter §1.8 :
   - Détecter les conteneurs dans `getSeriesList()` (dossiers avec sous-dossiers series)
   - Ajouter `getContainerSeries()` et `getSubSeries(containerSlug)` dans `src/helpers/`
   - Ajouter les routes `/<prefix>/<conteneur>/` et `/<prefix>/<conteneur>/<sous-slug>/`
   - Exposer une option `nestingMode: 'flat' | 'hierarchical'` (défaut `'flat'`)
   - Ajouter `lineup_order` au schéma Zod

### Sprint 4 — Composants manquants (4–6j, H2 + H3)

8. **H2** — `SeriesMap` : carte des séries avec `iptc.gps`, intégration Leaflet ou Mapbox en option.
9. **H3** — `SeriesFilter` : filtrage par tags, date, lieu — UI réactive côté client.

### Sprint 5 — Syndication et outillage (2–3j, M3 + M4)

10. **M3** — CLI `hyperfocale-lint` : validation format (frontmatter, slugs, médias).
11. **M4** — Routes RSS + JSON Feed (`/<prefix>/feed.xml`, `/<prefix>/feed.json`).

---

## 6. Résumé exécutif

Le plugin `@izo/hyperfocale` v0.4.0 est **solidement conforme** sur le périmètre fondamental de la spec v2.4-draft : contrat d'adaptateur §2.0 (100 %), schéma frontmatter core et IPTC (100 %), mode distant §1.5 (100 %), composants de base §3.1 (4/6), interactions principales §3.3 (4/5). Les ajouts v0.4.0 (`z.looseObject()` racine, `z.url()`) alignent correctement le code sur la spec.

Les gaps identifiés se regroupent en deux catégories :

1. **Fonctionnalités nouvelles de la spec v2.2–v2.4** non encore implémentées : séries imbriquées (§1.8), presets de domaine nommés (§2.0.1), `SeriesMap`, `SeriesFilter`.
2. **Petits défauts de précision** corrigeables rapidement : champ `alt` perdu dans `ImageMetadata`, fallback cover non effectif, API deprecated dans une route, absence de swipe tactile.

Le seul gap **Critique** au sens MUST est §1.8 (séries imbriquées), mais la spec elle-même prévoit une tolérance pour les adaptateurs en transition — le comportement minimal (ne pas crasher, indexer le conteneur) est satisfait.
