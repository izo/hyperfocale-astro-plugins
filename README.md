# @izo/hyperfocale

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Astro](https://img.shields.io/badge/Astro-7.x-FF5D01?logo=astro&logoColor=white)](https://astro.build)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![npm](https://img.shields.io/badge/npm-%40izo%2Fhyperfocale-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/@izo/hyperfocale)

> Transformez un dossier de photos en galerie complète — routes, pagination, lightbox et thème — sans écrire une seule page Astro.

Plugin d'intégration **Astro 7** pour sites de photographie. Ajoute en une ligne de config un système complet de **séries photo** : content collection, routes automatiques, composants, helpers TypeScript et thème CSS configurable.

---

## Fonctionnalités

- **Zéro config requise** — une ligne dans `astro.config.mjs` suffit
- **CLI `init`** — crée ou met à jour `src/content.config.ts` automatiquement
- **Routes injectées** — `/series/`, `/series/[slug]/`, pagination native
- **8 composants prêts** — `SeriesCard`, `SeriesList`, `SeriesGallery`, `SeriesLightbox`, `SeriesAttachments`, `SeriesFilter`, `SeriesMap`, `SeriesMasonry`
- **Lightbox native** — navigation clavier ←/→/Esc, aucune dépendance externe
- **Thème configurable** — CSS custom properties `--hf-*` surchargeables
- **Schéma extensible** — ajoutez vos champs via `.extend()` Zod
- **Images optimisées** — WebP, srcset et dimensions générés au build par Astro
- **TypeScript first** — types complets, 0 erreur de compilation garantie

---

## Installation

### 1. Installer le plugin

```bash
npm install @izo/hyperfocale
```

Aucun registre à configurer, aucun jeton : le paquet est publié sur le npm
public. *(Il vivait sur GitHub Packages, qui exige une authentification même
pour un paquet public — donc un jeton en local, en CI et au déploiement de
chaque site consommateur.)*

### 2. Initialiser la content collection

```bash
npx hyperfocale init
```

Le CLI crée ou met à jour `src/content.config.ts` pour enregistrer la collection `series`. Idempotent — relancez-le sans risque si le fichier existe déjà.

### 3. Activer l'intégration

```ts
// astro.config.mjs
import { defineConfig } from 'astro/config';
import hyperfocale from '@izo/hyperfocale';

export default defineConfig({
  integrations: [
    hyperfocale({
      prefix: '/series',  // préfixe des routes           (défaut)
      pageSize: 12,       // images par page              (défaut)
      theme: 'auto',      // 'light' | 'dark' | 'auto'    (défaut)
      collectionName: 'series', // nom de la collection   (défaut)
      dateRequired: true,       // `date` obligatoire      (défaut)
    }),
  ],
});
```

C'est tout — votre site génère maintenant des routes `/series/` automatiquement.

### Options

| Option | Type | Défaut | Description |
|--------|------|--------|-------------|
| `prefix` | `string` | `'/series'` | Préfixe des routes injectées. Doit commencer par `/`. |
| `pageSize` | `number` | `12` | Nombre d'images par page dans la galerie paginée (≥ 1). |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'auto'` | Thème CSS injecté. `'auto'` suit `prefers-color-scheme`. |
| `collectionName` | `string` | `'series'` | Nom de la content collection à enregistrer. Les helpers lisent cette collection et ses `media/` — y compris sous un autre nom (`projects` avec le preset `portfolio`). |
| `dateRequired` | `boolean` | `true` | Si `false`, le champ `date` devient optionnel (collections non temporelles : marques, produits). |

---

## Ajouter une série

Créez un dossier dans `src/content/series/` :

```
src/content/series/bretagne-2024/
├── index.md
└── media/
    ├── 01.jpg
    ├── 02.jpg
    └── 03.webp
```

```yaml
# src/content/series/bretagne-2024/index.md
---
title: "Bretagne 2024"
date: 2024-06-15
description: "Côtes sauvages du Finistère"
cover: "./media/01.jpg"
location: "Finistère, France"
---

Texte libre affiché avant la galerie de photos.
```

La série apparaît automatiquement sur `/series/`. Formats acceptés : `.jpg` `.jpeg` `.png` `.webp` `.avif`

### Champs du frontmatter

Le schéma Zod complet (`seriesSchema`) accepte 17 champs. Seul `title` est toujours requis ; `date` l'est sauf si `dateRequired: false`. Le schéma est en mode `looseObject` — vos champs custom passent sans configuration.

| Champ | Type | Défaut | Description |
|-------|------|--------|-------------|
| `title` | `string` | — (requis) | Titre de la série |
| `date` | `date` | — (requis¹) | Date ISO. Tri décroissant sur la liste |
| `description` | `string` | — | Description courte affichée sur la card |
| `cover` | `image` | — | Couverture. Première image si absent (`getSeriesCover`) |
| `location` | `string` | — | Lieu associé à la série |
| `lang` | `string` | — | Code langue (ex. `fr`, `en`) |
| `published` | `boolean` | `true` | `false` → masquée en production (visible en dev) |
| `draft` | `boolean` | `false` | `true` → masquée en production (visible en dev) |
| `featured` | `boolean` | `false` | Mise en avant (`querySeries({ featured })`) |
| `tags` | `string[]` | `[]` | Tags libres (`getAllTags`, filtre `querySeries`) |
| `alt_description` | `string` | — | Texte alternatif de la série |
| `private` | `boolean` | `false` | Marque la série comme privée |
| `download` | `boolean` | `false` | Autorise le téléchargement des originaux |
| `iptc` | `object` | — | Métadonnées IPTC (voir ci-dessous) |
| `images` | `RemoteImage[]` | — | Images en mode distant (voir ci-dessous) |
| `attachments` | `AttachmentMeta[]` | — | Métadonnées des documents joints locaux |
| `files` | `RemoteFile[]` | — | Documents joints en mode distant |

¹ Optionnel si l'intégration est configurée avec `dateRequired: false`.

**Bloc `iptc`** (tous optionnels, mode `looseObject`) : `creator`, `credit`, `copyright`, `keywords[]`, `city`, `province`, `country`, `country_code`, `camera`, `lens`, `film`, `headline`, `instructions`, `source`, `gps: { lat, lng }`.

Le champ `iptc.gps` alimente `<SeriesMap>`.

---

## Modes avancés

### Collections hiérarchiques

Les slugs peuvent être imbriqués : un dossier `voyages/asie/tokyo-2024/` produit le slug `voyages/asie/tokyo-2024`, servi par les routes catch-all. Le premier segment est la **collection parente**, exploitable via les helpers :

```ts
getParentCollection('voyages/asie/tokyo-2024'); // → 'voyages'
const cols = await getAllCollections();          // → [{ slug: 'voyages', count: 12 }, …]
const asie = await querySeries({ collection: 'voyages' });
```

### Images et documents distants

Par défaut, les images sont lues dans `media/` et optimisées par Astro. Vous pouvez à la place référencer des URL distantes dans le frontmatter — elles **priment** sur `media/` :

```yaml
# Images hébergées ailleurs (CDN, S3…)
images:
  - url: "https://cdn.exemple.com/tokyo/01.jpg"
    alt: "Shibuya de nuit"
    width: 1600
    height: 1067

# Documents joints distants
files:
  - url: "https://cdn.exemple.com/tokyo/carnet.pdf"
    title: "Carnet de voyage"
    kind: document   # video | audio | document | file (auto-détecté si absent)
```

Les documents joints **locaux** (tout fichier non-image dans `media/`) sont détectés automatiquement ; le bloc `attachments:` permet d'y attacher un titre/description :

```yaml
attachments:
  - file: "interview.mp3"
    title: "Entretien avec l'artiste"
    description: "12 min, français"
```

---

## Routes générées

| Route | Description |
|-------|-------------|
| `/series/` | Liste de toutes les séries (date décroissante) |
| `/series/[slug]/` | Page d'une série — body + galerie paginée |
| `/series/[slug]/[page]/` | Pages suivantes de la galerie |

Le préfixe `/series` est configurable via l'option `prefix`. Les slugs hiérarchiques (`voyages/asie/tokyo-2024`) sont gérés par des routes catch-all.

---

## Composants

```ts
import {
  SeriesCard,
  SeriesList,
  SeriesGallery,
  SeriesLightbox,
  SeriesAttachments,
  SeriesFilter,
  SeriesMap,
  SeriesMasonry,
} from '@izo/hyperfocale/components';
```

### `<SeriesCard series={s} />`

Card d'aperçu : cover, titre, date, description.

| Prop | Type | Requis |
|------|------|--------|
| `series` | `Series` | oui |

### `<SeriesList series={arr} columns={3} />`

Grille responsive de `SeriesCard`.

| Prop | Type | Défaut | Description |
|------|------|--------|-------------|
| `series` | `Series[]` | — | Tableau de séries |
| `columns` | `number` | `3` | Nombre de colonnes |

### `<SeriesGallery images={imgs} page={1} totalPages={3} baseUrl="/series/slug" />`

Galerie paginée avec navigation entre les pages.

| Prop | Type | Description |
|------|------|-------------|
| `images` | `Image[]` | Images de la page courante |
| `page` | `number` | Numéro de page courant |
| `totalPages` | `number` | Nombre total de pages |
| `baseUrl` | `string` | URL de base pour la pagination |

### `<SeriesLightbox images={allImgs} />`

Visionneuse plein écran. S'ouvre au clic sur une image, navigation ←/→/Esc.

| Prop | Type | Description |
|------|------|-------------|
| `images` | `Image[]` | Toutes les images de la série |

### `<SeriesMasonry images={imgs} columns={3} />`

Galerie en maçonnerie (colonnes de hauteurs variables), alternative à `SeriesGallery`.

| Prop | Type | Défaut | Description |
|------|------|--------|-------------|
| `images` | `ImageMetadata[]` | — | Images à afficher |
| `columns` | `number` | `3` | Nombre de colonnes |

### `<SeriesAttachments attachments={att} heading="Documents" />`

Liste les documents joints non-image d'une série (vidéo, audio, PDF, fichiers). Alimenté par `getSeriesAttachments()`.

| Prop | Type | Défaut | Description |
|------|------|--------|-------------|
| `attachments` | `Attachment[]` | — | Documents joints résolus |
| `heading` | `string` | `« Documents »` | Titre de la section |

### `<SeriesFilter series={arr} filters={['tags','date','location']} />`

Filtres interactifs (par tags, année, lieu) sur une liste de séries.

| Prop | Type | Défaut | Description |
|------|------|--------|-------------|
| `series` | `Series[]` | — | Séries à filtrer |
| `filters` | `('tags' \| 'date' \| 'location')[]` | tous | Filtres actifs |
| `prefix` | `string` | `/series` | Préfixe des liens générés |

### `<SeriesMap series={arr} height="400px" />`

Carte des séries géolocalisées (coordonnées lues dans `iptc.gps`).

| Prop | Type | Défaut | Description |
|------|------|--------|-------------|
| `series` | `Series[]` | — | Séries à placer sur la carte |
| `height` | `string` | — | Hauteur CSS de la carte |
| `prefix` | `string` | `/series` | Préfixe des liens générés |

---

## Helpers

```ts
import {
  getSeriesList,
  getSeriesBySlug,
  getSeriesImages,
  paginateImages,
} from '@izo/hyperfocale/helpers';
```

### `getSeriesList()`

Toutes les séries triées par date décroissante.

```ts
const series = await getSeriesList();
// Series[]
```

### `getSeriesBySlug(slug)`

Une série par son slug. Lève une erreur si introuvable.

```ts
const serie = await getSeriesBySlug('bretagne-2024');
// Series
```

### `getSeriesImages(slug)`

Images d'une série, triées alphabétiquement.

```ts
const images = await getSeriesImages('bretagne-2024');
// ImageMetadata[]
```

### `paginateImages(images, pageSize, page)`

Découpe un tableau d'images en pages.

```ts
const { items, totalPages, currentPage } = paginateImages(images, 12, 1);
```

### `querySeries(options)`

API de requête flexible — remplace `getSeriesList()` dès qu'il faut filtrer, trier ou paginer. Retourne `{ items, pagination }`.

```ts
const { items, pagination } = await querySeries({
  collection: 'voyages',      // premier segment du slug
  tags: ['argentique'],       // ET-logique (tous les tags requis)
  featured: 'first',          // true = seulement featured · 'first' = remontées en tête
  exclude: ['voyages/asie/tokyo-2024'],
  published: true,            // défaut true
  draft: false,               // défaut false
  sort: 'date',               // 'date' (défaut) | 'title' | 'random'
  limit: 12,
  offset: 0,
});
// pagination: { currentPage, totalPages, totalItems, hasNext, hasPrev }
```

### `getSeriesAttachments(slug, series?)`

Documents joints non-image d'une série (`Attachment[]`), triés alphabétiquement. Mode distant (`files[]`) prioritaire, sinon détection des non-images de `media/`. Les métadonnées du bloc `attachments:` sont fusionnées par nom de fichier.

```ts
const docs = await getSeriesAttachments('bretagne-2024', serie);
// Attachment[] : { src, kind: 'video'|'audio'|'document'|'file', title, description?, size? }
```

### `getSeriesCover(slug, series?)`

Première image de la série comme cover de fallback. `undefined` si aucune image.

```ts
const cover = await getSeriesCover('bretagne-2024');
// ImageMetadata | undefined
```

### `getAllTags()` · `getAllCollections()`

Agrégations sur toute la collection, triées par fréquence décroissante.

```ts
const tags = await getAllTags();          // [{ name: 'argentique', count: 8 }, …]
const cols = await getAllCollections();   // [{ slug: 'voyages', name: 'voyages', count: 12 }, …]
```

### `getParentCollection(id)`

Premier segment d'un slug hiérarchique, ou `null` pour un slug plat. Synchrone.

```ts
getParentCollection('voyages/asie/tokyo-2024'); // → 'voyages'
getParentCollection('bretagne-2024');           // → null
```

### `classifyAttachment(filename)`

Classe un fichier selon son extension : `'video' | 'audio' | 'document' | 'file'`. Retourne `null` pour une image ou `index.md`. Ne lève jamais d'erreur (extension inconnue → `'file'`). Synchrone.

```ts
classifyAttachment('interview.mp3'); // → 'audio'
classifyAttachment('01.jpg');        // → null (alimente la galerie, pas les pièces jointes)
```

### `serializeSeries(series)`

Version JSON-sérialisable d'une série pour les Astro Islands (React, Vue, Svelte…). Les `Date` deviennent des chaînes ISO ; la méthode `render` est omise.

```ts
const data = serializeSeries(serie); // { id, collection, body?, data: { …, date?: string } }
```

### `resetSeriesCache()`

Réinitialise le cache module-level. À appeler dans les teardowns de tests pour éviter les fuites entre cas.

```ts
afterEach(() => resetSeriesCache());
```

---

## Thème

Le plugin injecte un thème CSS configurable via l'option `theme` (`'light'`, `'dark'`, `'auto'`).

Surchargez les variables dans votre CSS global pour personnaliser l'apparence :

```css
:root {
  --hf-color-bg:      #ffffff;
  --hf-color-text:    #111111;
  --hf-color-accent:  #0066ff;
  --hf-font-sans:     system-ui, sans-serif;
  --hf-gallery-gap:   0.5rem;
  --hf-card-radius:   4px;
}
```

---

## Étendre le schéma

Pour ajouter des champs custom au frontmatter, utilisez `.extend()` sur le schéma de base :

```ts
// src/content.config.ts
import { defineCollection } from 'astro:content';
import { seriesSchema } from '@izo/hyperfocale';
import { z } from 'zod';

export const collections = {
  series: defineCollection({
    type: 'content',
    schema: (ctx) =>
      seriesSchema(ctx).extend({
        tags:        z.array(z.string()).optional(),
        draft:       z.boolean().default(false),
        camera:      z.string().optional(),
        externalUrl: z.string().url().optional(),
      }),
  }),
};
```

> Voir [`docs/schema-extensibility.md`](docs/schema-extensibility.md) pour la documentation complète et les exemples de typage TypeScript.

---

## CLI

```bash
npx hyperfocale init
```

Crée ou met à jour `src/content.config.ts` dans le projet consommateur. Trois comportements :

1. **Fichier absent** → crée le fichier avec le template minimal
2. **Fichier existant sans `series`** → injecte l'import et l'entrée dans l'objet `collections`
3. **Collection déjà présente** → no-op (idempotent)

---

## Développement

```bash
# Depuis la racine du repo
npm run build        # tsup → dist/ (ESM + types)
npm run dev          # tsup --watch
npm run typecheck    # tsc --noEmit
npm run test:unit    # tests unitaires (~1s)
npm test             # tous les tests, build Astro inclus (~60s)
npm run pack:dry     # vérifier le contenu du package
```

Voir [`examples/demo-site/`](examples/demo-site/) pour un site consommateur complet.

---

## Licence

[MIT](LICENSE) — © 2026 Mathieu Drouet
