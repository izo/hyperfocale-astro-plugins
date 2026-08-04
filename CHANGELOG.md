# Changelog

Toutes les modifications notables de ce projet sont documentées ici.

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/)
Versioning : [Semantic Versioning](https://semver.org/lang/fr/)

---

## [0.9.0] — 2026-08-04

### Changé

- **Le paquet est renommé `@regrets/hyperfocale`** (auparavant `@izo/hyperfocale`). Le scope `@izo` ne correspondait à aucun compte ni organisation npm : toute tentative de publication se soldait par un 404 sur le `PUT`. Aucune version n'ayant jamais été publiée sous l'ancien nom, ce renommage ne casse aucune installation existante — il n'y a rien à migrer. L'identifiant de l'intégration, le module virtuel (`virtual:hyperfocale/collection`), la commande `npx hyperfocale init` et les préfixes CSS `--hf-*` sont inchangés.

### Ajouté

Page d'index de section — implémentation de la spec Hyperfocale **v2.6-draft §1.10** (#SPEC-001, gap critique C1 de l'audit du 2026-07-27) :

- **Champ `type`** (`'series' | 'section'`, défaut `'series'`) : un `index.md` déclarant `type: section` est une page de rangement, pas une série — pas de galerie, pas de date, absente des listings. `CONTENT_TYPES`, `ContentType` et `SectionData` sont exportés.
- **`date` conditionnelle** : non requise pour une section, inchangée pour une série. Elle est déclarée optionnelle dans le shape puis rendue obligatoire par un `.check()` qui épargne les sections — un champ ne pouvant être requis conditionnellement dans un shape Zod. `.check()` survit à `.extend()`, ce dont dépend l'API d'extension (#DATA-004) ; c'est couvert par un test.
- **Exclusion des listings** : `getSeriesList`, `querySeries`, `getAllTags` et `getAllCollections` écartent les sections, donc aucune route n'est générée pour elles.
- **`isSection(entry)` et `getSections()`** : de quoi bâtir une page de rubrique (titre, body, puis les séries rangées dans le dossier).
- **Tests** : `tests/unit/sections.test.ts` (13 cas) et 4 cas e2e — le demo-site porte une section `archives/` avec une série enfant.

La distinction série / section se lit **uniquement** dans `type`, jamais dans l'absence de `date` : une série non datée reste une série invalide (§1.10, règle « discriminant explicite »).

### Corrigé

- **Module virtuel en retard sur le schéma** : `virtual:hyperfocale/collection` redéclarait le shape en dur dans une chaîne de caractères, et avait déjà divergé de `src/schema.ts` — ni `attachments`, ni `files` (§1.9). Tout site passant par `seriesCollection` héritait donc d'un schéma en retard d'une version de spec. Le module virtuel délègue désormais à `seriesSchema()`, importé depuis `dist/schema.js` (nouvelle entrée `tsup` : un ré-export de 195 B vers le chunk partagé, sans duplication du code). Sans ce changement, le correctif §1.10 n'atteignait aucun site consommateur.

### Rétro-compatibilité

`type` devient un champ **réservé au core**, conformément à §1.10 : un site qui l'utilisait comme champ libre (le mode `looseObject` le laissait passer) verra son contenu rejeté. Vérifié sans collision sur le corpus de `mathieu-drouet.com` (332 fichiers). Aucun autre changement cassant : l'absence de `type` vaut `series`, le comportement de tout contenu antérieur à la v2.6.

---

## [0.8.0] — 2026-07-27

### Ajouté

- **Presets de domaine** (option `preset`) : `photo`, `portfolio`, `music`, `catalog`, `press`, `recipe` pré-remplissent `prefix`, `collectionName` et `dateRequired` en une seule option. Toute option fournie explicitement l'emporte sur la valeur du preset. `PRESETS`, `resolvePreset`, `PresetName` et `PresetConfig` sont exportés depuis le point d'entrée ; un preset inconnu lève une erreur explicite.
- **Option `listRoute`** (défaut `true`) : à `false`, la route d'index `/{prefix}/` n'est pas injectée, laissant le site fournir sa propre page d'index sans collision de route. Les routes de détail et de pagination restent injectées.
- **Tests** : `tests/unit/presets.test.ts` (table des presets, intégration de l'option) et couverture des routes réellement injectées — `listRoute`, `injectRoutes` et répercussion du prefix d'un preset sont vérifiés sur les patterns passés à `injectRoute`, non plus seulement sur l'acceptation de l'option.

### Corrigé

- **Composants inaccessibles à l'import** : `<SeriesFilter>`, `<SeriesMap>` et `<SeriesMasonry>` étaient bien livrés dans `dist/components/` mais ne figuraient dans aucune entrée `exports` du `package.json` — un site consommateur ne pouvait pas les importer. Les trois entrées sont ajoutées. Cause racine : le test de packaging maintenait sa liste de composants en dur (4 sur 8) ; elle est désormais dérivée de `src/components/`, ce qui couvre d'office les composants futurs.

### Rétro-compatibilité

Aucun changement cassant : `preset` et `listRoute` ont des défauts qui reproduisent le comportement 0.7.0.

---

## [0.7.0] — 2026-07-27

### Ajouté

Documents joints — implémentation de la spec Hyperfocale **v2.5-draft §1.9** (`media/` étendu à tous les types de documents ; motivé par l'export SPIP → Hyperfocale du plugin spip2astro) :

- **Schéma** (#DATA-007) : bloc frontmatter optionnel `attachments:` (`file`, `title?`, `description?`) et champ `files[]` en mode distant (`url`, `title?`, `kind?`, `size?`). Types `Attachment` et `AttachmentKind` exportés, `SeriesData` étendu.
- **`classifyAttachment(filename)`** (#MVP-006) : classification par extension (`video` / `audio` / `document` / `file`), insensible à la casse ; retourne `null` pour les images et `index.md` ; toute extension inconnue tombe en `file` (ne lève jamais d'erreur).
- **`getSeriesAttachments(slug, series?)`** (#MVP-006) : glob complet des non-images de `media/` (tri alphabétique), fusion des métadonnées du bloc `attachments:` (libellé par défaut : nom de fichier), priorité à `files[]` en mode distant.
- **`<SeriesAttachments>`** (#FE-011) : liste des pièces jointes rendue **après** la galerie dans `series-detail.astro` (invariant §1.9) ; lecteurs natifs `<video>` / `<audio>` pour ces classes, lien de téléchargement (extension + taille formatée) pour `document` / `file` ; rien n'est rendu si la liste est vide ; `prefers-reduced-motion` et focus visible respectés.
- **Design tokens** : `--hf-attachments-gap`, `--hf-attachments-radius`, `--hf-attachments-bg`, `--hf-attachments-bg-hover`.
- **Tests** : `tests/unit/attachments.test.ts` (classification, mode distant, schéma).

Consommation du plugin par un site au design soigné (dogfooding sur laurenceguenoun.com) : consommer le plugin sans perdre son chrome, ses ratios d'image ni son texte alternatif.

- **Slot de layout** (option `layout`) : les routes injectées s'enveloppent dans un layout `.astro` du site consommateur via le module virtuel `virtual:hyperfocale/layout` (repli sur un `BareLayout` interne). Contrat de props : `{ title, description, ogImage?, lang?, schema? }`. Option `injectRoutes` pour laisser le consommateur câbler entièrement ses propres pages.
- **`galleryLayout: 'grid' | 'column'`** (défaut `grid`) : le mode `column` rend une galerie en colonne pleine largeur aux ratios naturels — ne recadre pas les diptyques ni les portraits.
- **Images locales ordonnées avec alt** : `getSeriesImages` accepte un `images[]` local (`{ src: <asset image()>, alt }` ou `{ file, alt }`), en plus du mode distant — préserve l'ordre curé et l'alt là où le glob alphabétique n'en portait aucun. `SeriesGallery` utilise `image.alt`.
- **Tests** : `tests/unit/consumer-options.test.ts` (images locales ordre + alt, régression du mode distant, validation des options).

### Corrigé

- **Lightbox muette** : les données d'images étaient injectées via `<script>{JSON.stringify(...)}</script>`, non évalué par Astro 7. Passage à `is:inline set:html`.
- **Build des déclarations** : `dts: false` (tsup) + `tsc --emitDeclarationOnly` dans le script `build`. Le bundler `rollup-plugin-dts` plantait sous Node récent (`useCaseSensitiveFileNames`), bloquant `prepare`/`prepublishOnly` — donc l'installation en dépendance locale et la publication.

### Rétro-compatibilité

Aucun changement cassant : les deux blocs de frontmatter sont optionnels, le glob d'images est inchangé, et les séries sans documents joints se comportent exactement comme avant. Les nouvelles options ont toutes un défaut qui reproduit le comportement 0.6.0.

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
