# @izo/hyperfocale

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Astro](https://img.shields.io/badge/Astro-6.x-FF5D01?logo=astro&logoColor=white)](https://astro.build)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![GitHub Packages](https://img.shields.io/badge/GitHub%20Packages-%40izo%2Fhyperfocale-24292e?logo=github)](https://github.com/izo/hyperfocale-astro-plugins/packages)

> Transformez un dossier de photos en galerie complète — routes, pagination, lightbox et thème — sans écrire une seule page Astro.

Plugin d'intégration **Astro 6** pour sites de photographie. Ajoute en une ligne de config un système complet de **séries photo** : content collection, routes automatiques, composants, helpers TypeScript et thème CSS configurable.

---

## Fonctionnalités

- **Zéro config requise** — une ligne dans `astro.config.mjs` suffit
- **CLI `init`** — crée ou met à jour `src/content.config.ts` automatiquement
- **Routes injectées** — `/series/`, `/series/[slug]/`, pagination native
- **4 composants prêts** — `SeriesCard`, `SeriesList`, `SeriesGallery`, `SeriesLightbox`
- **Lightbox native** — navigation clavier ←/→/Esc, aucune dépendance externe
- **Thème configurable** — CSS custom properties `--hf-*` surchargeables
- **Schéma extensible** — ajoutez vos champs via `.extend()` Zod
- **Images optimisées** — WebP, srcset et dimensions générés au build par Astro
- **TypeScript first** — types complets, 0 erreur de compilation garantie

---

## Installation

### 1. Configurer l'accès GitHub Packages

Ce package est distribué via GitHub Packages. Créez un [Personal Access Token](https://github.com/settings/tokens) avec le scope `read:packages`, puis ajoutez-le à votre `~/.npmrc` global :

```bash
echo "//npm.pkg.github.com/:_authToken=VOTRE_TOKEN" >> ~/.npmrc
```

Ajoutez ensuite un fichier `.npmrc` **à la racine de votre projet** :

```
@izo:registry=https://npm.pkg.github.com
```

### 2. Installer le plugin

```bash
npm install @izo/hyperfocale
```

### 3. Initialiser la content collection

```bash
npx hyperfocale init
```

Le CLI crée ou met à jour `src/content.config.ts` pour enregistrer la collection `series`. Idempotent — relancez-le sans risque si le fichier existe déjà.

### 4. Activer l'intégration

```ts
// astro.config.mjs
import { defineConfig } from 'astro/config';
import hyperfocale from '@izo/hyperfocale';

export default defineConfig({
  integrations: [
    hyperfocale({
      prefix: '/series',  // préfixe des routes  (défaut)
      pageSize: 12,       // images par page     (défaut)
      theme: 'auto',      // 'light' | 'dark' | 'auto'  (défaut)
    }),
  ],
});
```

C'est tout — votre site génère maintenant des routes `/series/` automatiquement.

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

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `title` | `string` | oui | Titre de la série |
| `date` | `date` | oui | Date (tri décroissant sur la liste) |
| `description` | `string` | non | Description courte affichée sur la card |
| `cover` | `image` | non | Couverture — première image si absent |
| `location` | `string` | non | Lieu associé à la série |

---

## Routes générées

| Route | Description |
|-------|-------------|
| `/series/` | Liste de toutes les séries (date décroissante) |
| `/series/[slug]/` | Page d'une série — body + galerie paginée |
| `/series/[slug]/[page]/` | Pages suivantes de la galerie |

Le préfixe `/series` est configurable via l'option `prefix`.

---

## Composants

```ts
import {
  SeriesCard,
  SeriesList,
  SeriesGallery,
  SeriesLightbox,
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
