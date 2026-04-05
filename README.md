# hyperfocale

Plugin Astro 6 pour sites de photographie. Gestion complète de **séries photo** : content collection, routes automatiques, composants et thème.

## Installation

```bash
# Lien local (monorepo ou workspace)
npm link
```

```bash
# Initialiser la content collection (à lancer une seule fois dans le projet consommateur)
npx hyperfocale init
```

Le CLI crée ou met à jour `src/content.config.ts` pour enregistrer la collection `series`. Idempotent : relancer sans risque si le fichier existe déjà.

```ts
// astro.config.mjs
import { defineConfig } from 'astro/config';
import hyperfocale from 'hyperfocale';

export default defineConfig({
  integrations: [
    hyperfocale({
      prefix: '/series',  // défaut
      pageSize: 12,       // défaut
      theme: 'auto',      // 'light' | 'dark' | 'auto'
    }),
  ],
});
```

## Ajouter une série

```
src/content/series/bretagne-2024/
├── index.md
└── media/
    ├── 01.jpg
    └── 02.jpg
```

```yaml
---
title: "Bretagne 2024"
date: 2024-06-15
description: "Côtes sauvages du Finistère"
cover: "./media/01.jpg"
location: "Finistère, France"
---

Texte libre affiché avant la galerie.
```

Formats acceptés : `.jpg` `.jpeg` `.png` `.webp` `.avif`

## Routes générées

| Route | Description |
|-------|-------------|
| `/series/` | Liste des séries (date décroissante) |
| `/series/[slug]/` | Page d'une série |
| `/series/[slug]/[page]/` | Pagination de la galerie |

## Composants

```ts
import { SeriesCard, SeriesList, SeriesGallery, SeriesLightbox } from 'hyperfocale/components';
```

| Composant | Description |
|-----------|-------------|
| `<SeriesCard series={s} />` | Card avec cover, titre, date, description |
| `<SeriesList series={arr} columns={3} />` | Grille de cards |
| `<SeriesGallery images={imgs} page={1} totalPages={3} baseUrl="/series/slug" />` | Galerie paginée |
| `<SeriesLightbox images={allImgs} />` | Visionneuse plein écran (←/→/Esc) |

## Helpers

```ts
import { getSeriesList, getSeriesBySlug, getSeriesImages, paginateImages } from 'hyperfocale/helpers';

const series  = await getSeriesList();
const serie   = await getSeriesBySlug('bretagne-2024');
const images  = await getSeriesImages('bretagne-2024');
const { items, totalPages, currentPage } = paginateImages(images, 12, 1);
```

## Thème

Surchargeable via CSS custom properties :

```css
:root {
  --hf-color-bg: #ffffff;
  --hf-color-text: #111111;
  --hf-color-accent: #0066ff;
  --hf-font-sans: system-ui, sans-serif;
  --hf-gallery-gap: 0.5rem;
  --hf-card-radius: 4px;
}
```

## Étendre le schéma

```ts
// src/content.config.ts
import { seriesCollection } from 'virtual:hyperfocale/collection';
import { z } from 'astro:content';

export const collections = {
  series: seriesCollection.extend({ tags: z.string().array().optional() }),
};
```

## Développement

```bash
npm test          # 40 tests (unit + e2e)
npm run build     # tsup → dist/
npm run typecheck # tsc --noEmit
```

Voir `examples/demo-site/` pour un site consommateur complet.
Voir `docs/schema-extensibility.md` pour les extensions de schéma.
