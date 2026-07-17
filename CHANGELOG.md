# Changelog

Toutes les modifications notables de ce projet sont documentées ici.

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/)
Versioning : [Semantic Versioning](https://semver.org/lang/fr/)

---

## [Non publié]

### Corrigé

- **Build cassé sous TypeScript 7** : le portage natif TypeScript 7 (tsgo) n'expose pas l'API compilateur classique (`createProgram`, `createCompilerHost`…) dont dépend `rollup-plugin-dts`, le générateur de types utilisé par `tsup` avec `dts: true`. `npm run build` échouait donc à l'émission des `.d.ts` (`Cannot read properties of undefined (reading 'useCaseSensitiveFileNames')`), rendant le package impubliable. Les déclarations sont désormais émises par `tsc --emitDeclarationOnly` (`tsup` passe en `dts: false`) ; la sortie `dist/` est identique.
- **Composants absents du champ `exports`** : `<SeriesMasonry>`, `<SeriesMap>` et `<SeriesFilter>` étaient buildés dans `dist/` mais non déclarés dans `package.json#exports`, donc inaccessibles à l'import (`@izo/hyperfocale/components/SeriesMap.astro`, etc.) puisqu'un champ `exports` bloque tout sous-chemin non listé. Les trois entrées manquantes ont été ajoutées.
- **Désynchronisation du schéma** : le module virtuel `virtual:hyperfocale/collection` inlinait une copie du schéma Zod qui ne contenait pas les champs `attachments` / `files` ajoutés en 0.7.0. Il se branche désormais sur la source unique `seriesSchema` de `src/schema.ts` (`schema: (ctx) => seriesSchema(ctx, { dateRequired })`), éliminant toute dérive future.
- **Accessibilité (WCAG 2.1 AA)** :
  - `<SeriesGallery>` : le texte alternatif des vignettes utilise désormais `image.alt` (mode distant / IPTC) avant de retomber sur le libellé ordinal `Photo N` (1.1.1).
  - `<SeriesGallery>` : les boutons de pagination désactivés passent de `<span aria-disabled>` à `<button disabled>` natif, correctement restitué par les lecteurs d'écran (2.1.1, 4.1.2).
  - `base.css` : règle globale `prefers-reduced-motion` scopée aux éléments `hf-*` (galerie, lightbox, pagination) — neutralise transitions/animations sans toucher aux styles du site consommateur (2.3.3).

### Modifié

- Documentation (`README`, `CLAUDE.md`) : références « Astro 6 » → « Astro 7 », badges Astro 7.x / TypeScript 7.x.

---

## [0.7.0] — 2026-07-09

### Ajouté

Documents joints — implémentation de la spec Hyperfocale **v2.5-draft §1.9** (`media/` étendu à tous les types de documents ; motivé par l'export SPIP → Hyperfocale du plugin spip2astro) :

- **Schéma** (#DATA-007) : bloc frontmatter optionnel `attachments:` (`file`, `title?`, `description?`) et champ `files[]` en mode distant (`url`, `title?`, `kind?`, `size?`). Types `Attachment` et `AttachmentKind` exportés, `SeriesData` étendu.
- **`classifyAttachment(filename)`** (#MVP-006) : classification par extension (`video` / `audio` / `document` / `file`), insensible à la casse ; retourne `null` pour les images et `index.md` ; toute extension inconnue tombe en `file` (ne lève jamais d'erreur).
- **`getSeriesAttachments(slug, series?)`** (#MVP-006) : glob complet des non-images de `media/` (tri alphabétique), fusion des métadonnées du bloc `attachments:` (libellé par défaut : nom de fichier), priorité à `files[]` en mode distant.
- **`<SeriesAttachments>`** (#FE-011) : liste des pièces jointes rendue **après** la galerie dans `series-detail.astro` (invariant §1.9) ; lecteurs natifs `<video>` / `<audio>` pour ces classes, lien de téléchargement (extension + taille formatée) pour `document` / `file` ; rien n'est rendu si la liste est vide ; `prefers-reduced-motion` et focus visible respectés.
- **Design tokens** : `--hf-attachments-gap`, `--hf-attachments-radius`, `--hf-attachments-bg`, `--hf-attachments-bg-hover`.
- **Tests** : `tests/unit/attachments.test.ts` (classification, mode distant, schéma).

### Rétro-compatibilité

Aucun changement cassant : les deux blocs de frontmatter sont optionnels, le glob d'images est inchangé, et les séries sans documents joints se comportent exactement comme avant.

---

## [0.6.0] — 2026-06-24

### Changements cassants

- **Astro 7 uniquement** : la peer dependency `astro` passe de `^6.0.0` à `^7.0.0`. Les sites encore en Astro 6 doivent d'abord migrer.
- **`type: 'content'` supprimé** : le module virtuel `virtual:hyperfocale/collection` utilise désormais l'API Content Layer (`loader: glob(...)`). L'import `from 'virtual:hyperfocale/collection'` dans `src/content.config.ts` reste identique — seule la définition interne change.

### Modifié

- **Module virtuel** (`#ARCH-006`) : `defineCollection({ type: 'content', ... })` → `defineCollection({ loader: glob({ pattern: '**/index.{md,mdx}', base: './src/content/${collectionName}' }), ... })`. L'option `collectionName` contrôle désormais aussi le `base` du loader.
- **Schéma inline** : cohérence avec `src/schema.ts` — `z.object({}).passthrough()` → `z.looseObject({})`, `z.string().url()` → `z.url()`.
- `devDependencies.astro` et `peerDependencies.astro` passent en `^7.0.0`.
- `examples/demo-site` : ajout de la collection `brands` (sans date) via `baseSeriesSchema({ dateRequired: false })` + `glob` loader — démontre l'usage multi-collection sans double instance du plugin.

### IDs Content Layer

Avec le `glob` loader d'Astro, `entry.id` est le chemin relatif à `base` sans extension, avec le suffixe `/index` retiré automatiquement :

| Fichier | `entry.id` |
|---------|------------|
| `bretagne-2024/index.md` | `bretagne-2024` |
| `voyages/asie/tokyo-2024/index.md` | `voyages/asie/tokyo-2024` |

Les helpers (`getSeriesBySlug`, `getSeriesList`, `querySeries`) utilisaient déjà `entry.id` — aucune régression sur les slugs hiérarchiques.

---

## [0.5.0] — 2026-06-24

### Ajouté

- **`querySeries(options)`** — API de requête flexible : filtres `collection`, `tags` (ET-logique), `featured`, `exclude`, `published`, `draft` ; tri `date` / `title` / `random` ; pagination avec `limit` / `offset` (#DATA-003)
- **`getAllTags()`** — retourne tous les tags distincts avec leur fréquence (#DATA-005)
- **`getAllCollections()`** — retourne les collections parentes (premier segment du slug) avec leur nombre de séries (#DATA-005)
- **`getSeriesCover(slug, series?)`** — cover de fallback : première image alphabétique si `cover` absent du frontmatter (#MVP-004)
- **`serializeSeries(series)`** + type `SerializedSeries` — version JSON-safe pour Astro Islands (Date → ISO string) (#MVP-005)
- **`baseSeriesSchema(options?)`** — schéma de base sans `cover`, extensible via `.extend()` sans `SchemaContext` (#DATA-004)
- **`<SeriesMasonry>`** — layout masonry CSS columns, sans JS, `prefers-reduced-motion` (#FE-007)
- **`<SeriesMap>`** — carte SVG schématique depuis `iptc.gps`, marqueurs cliquables, fallback si aucune coordonnée (#FE-009)
- **`<SeriesFilter>`** — filtrage client-side par tags / date / lieu, événement DOM `hf:filter-change` pour intégration custom (#FE-010)
- **Champ `alt?`** dans `ImageMetadata` — propagé depuis `remoteImageSchema` et utilisé dans `SeriesLightbox` (#DATA-006)
- **Nouveaux champs de schéma** : `published` (défaut `true`), `alt_description`, `private` (défaut `false`), `download` (défaut `false`) ; `tags` devient `string[]` avec défaut `[]` (#DATA-002)
- **Routes catch-all** `[...slug]` — support des slugs hiérarchiques (`pays/ville/serie`) (#ARCH-003)
- **`getParentCollection(id)`** — extrait le premier segment d'un slug hiérarchique (#ARCH-003)
- **Cache singleton** `_seriesCache` — un seul appel `getCollection` par build SSG (#MVP-003)
- **Design tokens CSS** : `--hf-color-text-overlay`, `--hf-color-text-overlay-muted`, `--hf-color-btn-overlay-hover`, `--hf-map-*`, `--hf-filter-*`, `--hf-masonry-*` (#FE-006)
- **`docs/schema-extensibility.md`** — guide d'extension du schéma avec exemples (#DATA-004)

### Modifié

- `SeriesCard` : cover de fallback (première image) si `cover` absent ; garde `date instanceof Date` (#MVP-004)
- `SeriesLightbox` : swipe tactile `touchstart`/`touchend` (seuil 50px, `{ passive: true }`) ; `alt` de l'image utilisé si disponible ; valeurs hex remplacées par variables CSS (#FE-008, #FE-006)
- `seriesSchema()` délègue maintenant à `baseSeriesSchema().extend({ cover })` — aucun changement de comportement

### Corrigé

- `series.render()` → `render(series)` (API Astro 6) dans `series-page.astro`
- Garde `date instanceof Date` dans les routes et composants (`dateRequired: false` supporté)
- `getSeriesImages` passe `series` sur les pages ≥ 2 (mode distant CDN)

---

## [0.4.0] — 2026-06-06

### Changements cassants
- **Zod 3 n'est plus supporté** : la peer dependency `zod` passe de `^3.0.0 || ^4.0.0` à `^4.0.0`. Les sites consommateurs encore en zod 3 doivent migrer vers zod 4 avant de mettre à jour ce plugin.

### Modifié
- **Schéma modernisé pour zod 4** (équivalences fonctionnelles, aucun changement de comportement de validation) :
  - `iptcSchema` et `seriesSchema()` : `.passthrough()` → `z.looseObject()`
  - `remoteImageSchema.url` : `z.string().url()` → `z.url()`

### Corrigé
- **Build/typecheck cassés sur installation propre** : le callback de filtre dans `getSeriesList` (`getCollection('series', …)`) était inféré en `any` implicite sous `strict` (la collection `series` n'est pas définie côté plugin). Param typé explicitement `(entry: Series)`.

---

## [0.3.0] — 2026-05-23

### Ajouté
- **Conformité spec Hyperfocale v2.1** — schéma étendu sur `seriesCollection` (virtual module) et `seriesSchema()` :
  - `lang` : code ISO 639-1 de la langue de la série
  - `draft` : masqué en production si `true` (défaut `false`)
  - `featured` : mise en avant dans les listings (défaut `false`)
  - `tags` : tags éditoriaux libres, distincts de `iptc.keywords`
  - `iptc` : bloc structuré de métadonnées IPTC (`creator`, `credit`, `copyright`, `keywords`, `city`, `province`, `country`, `country_code`, `camera`, `lens`, `film`, `headline`, `instructions`, `source`, `gps`) + `.passthrough()` pour `iptc.custom.*`
  - `images` : mode distant — URLs CDN (format `{ url, alt?, width?, height? }`) à la place des fichiers `media/` locaux
  - `.passthrough()` racine : champs inconnus transmis sans erreur de validation
- **Mode distant** (`getSeriesImages`) : si `images[]` est présent dans le frontmatter, ces URLs sont retournées directement (priorité sur `media/`). Les deux modes sont mutuellement exclusifs par série.
- **Filtrage `draft`** (`getSeriesList`) : les séries `draft: true` sont exclues en production (toujours visibles en `DEV`).
- **Format `.tiff`** ajouté au glob `media/` dans `getSeriesImages`.
- **Normalisation slug** dans `getSeriesImages` : le suffixe `/index` est retiré pour compatibilité avec les collections legacy Astro (`type: 'content'`).

### Corrigé
- `series-detail.astro` et `series-page.astro` : `render()` migré vers l'API Astro moderne (`import { render } from 'astro:content'` à la place de `entry.render()`). Compatibilité assurée avec les content loaders Astro 5+.
- `getSeriesImages(slug, series?)` : le second argument `series` est maintenant passé depuis les routes pour activer le mode distant.

### Types exportés
- `SeriesSchemaOptions` — options de `seriesSchema()` (existe depuis 0.2.0, maintenant documenté)
- `SeriesDataOptionalDate` — variante sans `date` (inchangé)

---

## [0.2.0] — 2026-04-27

### Ajouté
- Option `collectionName` : permet de nommer la collection Astro Content (défaut : `'series'`).
  Utile pour des collections non-photo comme `brands-fr`, `products`, etc.
  La variable d'environnement `HYPERFOCALE_COLLECTION_NAME` est exposée au build.
- Option `dateRequired` : si `false`, le champ `date` du schéma devient optionnel (défaut : `true`).
  Rétrocompatible — les projets existants ne sont pas affectés.
- Type `SeriesDataOptionalDate` : variante de `SeriesData` exportée pour les collections sans date.
- `seriesSchema()` accepte un 2e paramètre `options: { dateRequired? }` pour l'extensibilité via `.extend()`.
- Tests unitaires pour `dateRequired: false` (4 nouveaux cas dans `schema.test.ts`).
- Logs intégration mis à jour : affiche `collection` en plus de `prefix` et `theme`.

### Cas d'usage motivant (Maison Léda)
Ces options ont été conçues pour des collections de marques (vins, spiritueux) qui ont :
un `nom`, un `texte` (markdown), un `logo`, des `images` et des `pdfs` — mais pas de `date`.
Voir `examples/demo-brands/` (à venir).

---

## [0.1.1] — 2026-04-24

### Corrigé
- Vulnérabilités devDep : `astro` devDep mis à jour vers `^6.1.6` (CVE XSS dans `define:vars`)
- Vulnérabilités devDep : `vitest` mis à jour de `^2.0.0` vers `^4.0.0` (CVE Vite path traversal + WebSocket)
- Script `prepare` ajouté pour garantir le build avant validation du champ `bin` lors de `npm publish`

### Modifié
- Package renommé en `@izo/hyperfocale` et publié sur GitHub Packages
- README entièrement réécrit : guide d'installation GitHub Packages, référence complète des composants, helpers, thème, schéma extensible
- `examples/demo-site` mis à jour pour utiliser `@izo/hyperfocale`
- Tous les imports dans la documentation propagés vers `@izo/hyperfocale`

### Ajouté
- Fichier `LICENSE` (MIT)
- Fichier `.npmrc` pour le registry GitHub Packages (`@izo:registry=https://npm.pkg.github.com`)
- Champs `repository`, `homepage`, `bugs` dans `package.json`

---

## [0.1.0] — 2026-04-24

### Ajouté
- Intégration Astro 6 : `defineIntegration`, options `prefix`, `pageSize`, `theme`
- Content Collection `series` avec schéma Zod (`title`, `date`, `description`, `cover`, `location`)
- Module virtuel `virtual:hyperfocale/collection` pour l'extensibilité du schéma
- Routes injectées : `/series/`, `/series/[slug]/`, `/series/[slug]/[page]/`
- Composants Astro : `SeriesCard`, `SeriesList`, `SeriesGallery`, `SeriesLightbox`
- Helpers TypeScript : `getSeriesList`, `getSeriesBySlug`, `getSeriesImages`, `paginateImages`
- Thème CSS avec custom properties `--hf-*` (light / dark / auto)
- CLI `npx hyperfocale init` — crée ou met à jour `src/content.config.ts` (idempotent)
- Build tsup : ESM + types `.d.ts`, hook de copie `.astro` et `.css`
- Suite de tests : 16 tests unitaires (schema + helpers) + 24 tests e2e (build statique Astro)
- Site exemple complet dans `examples/demo-site/`
