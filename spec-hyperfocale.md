# Spécification — Plugin Astro `hyperfocale`

> Plugin Astro 6 pour sites de photographie. Fournit un système complet de gestion de **séries photo** : content collection, routes automatiques, composants, helpers et thème.

---

## Vue d'ensemble

`hyperfocale` est une **intégration Astro standard** qui ajoute en une ligne de config :

- Un schéma Content Collection pour les séries photo
- Des routes automatiques (`/series/`, `/series/[slug]`)
- Des composants Astro prêts à l'emploi
- Des helpers TypeScript pour requêter les séries
- Un thème visuel configurable

**Statut** : privé (monorepo ou lien local), pas encore publié sur npm.

---

## Installation & configuration

```ts
// astro.config.mjs
import { defineConfig } from 'astro/config';
import hyperfocale from './packages/hyperfocale'; // ou chemin monorepo

export default defineConfig({
  integrations: [
    hyperfocale({
      // options (toutes optionnelles)
      prefix: '/series',         // préfixe des routes (défaut : '/series')
      pageSize: 12,              // images par page dans la galerie (défaut : 12)
      theme: 'dark',             // 'light' | 'dark' | 'auto' (défaut : 'auto')
    }),
  ],
});
```

---

## Concept : la série

Une **série** est l'unité de contenu fondamentale. Elle regroupe un ensemble de photographies autour d'un sujet, d'un lieu ou d'un moment cohérent.

Chaque série est **autonome** : toutes ses données (métadonnées + médias) vivent dans un seul dossier.

---

## Structure filesystem

```
src/content/series/<slug>/
├── index.md          ← métadonnées + texte libre (frontmatter + body)
└── media/            ← images de la série (pas de sous-dossiers)
    ├── 01.jpg
    ├── 02.jpg
    └── ...
```

- **`<slug>`** : identifiant unique, utilisé dans l'URL (`/series/<slug>`). Minuscules, tirets, sans espaces ni caractères spéciaux.
- **`index.md`** : définition de la série (voir Frontmatter).
- **`media/`** : images à la racine uniquement. Formats acceptés : `.jpg`, `.jpeg`, `.png`, `.webp`, `.avif`.

---

## Frontmatter (`index.md`)

| Champ         | Type     | Requis | Description                                                                                     |
|---------------|----------|--------|-------------------------------------------------------------------------------------------------|
| `title`       | `string` | oui    | Titre de la série                                                                               |
| `date`        | `date`   | oui    | Date de la série (utilisée pour le tri)                                                         |
| `description` | `string` | non    | Description courte, affichée sur la card et la page                                             |
| `cover`       | `image`  | non    | Image de couverture (chemin relatif vers `media/`). Si absent, première image alphabétique.     |
| `location`    | `string` | non    | Lieu associé à la série                                                                         |

### Exemple

```yaml
---
title: "Bretagne 2024"
date: 2024-06-15
description: "Côtes sauvages du Finistère"
cover: "./media/01.jpg"
location: "Finistère, France"
---

Texte libre affiché **avant** la galerie de photos.
```

---

## Schéma Zod (injecté automatiquement)

Le plugin enregistre la collection `series` dans `src/content.config.ts` via l'API d'intégration Astro 6. L'utilisateur n'a pas à écrire ce schéma manuellement.

```ts
// Schéma interne du plugin
const series = defineCollection({
  type: 'content',
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      description: z.string().optional(),
      cover: image().optional(),
      location: z.string().optional(),
    }),
});
```

---

## Routes automatiques

Le plugin injecte les routes suivantes via `injectRoute()` :

| Route                  | Page générée                                      |
|------------------------|---------------------------------------------------|
| `/series/`             | Liste de toutes les séries (tri date décroissante) |
| `/series/[slug]/`      | Page d'une série (body + galerie paginée)         |
| `/series/[slug]/[page]/` | Pages suivantes de la galerie                   |

Le préfixe `/series` est configurable via l'option `prefix`.

---

## Composants exposés

Le plugin exporte des composants Astro utilisables dans n'importe quelle page du site consommateur.

```ts
import {
  SeriesCard,
  SeriesList,
  SeriesGallery,
  SeriesLightbox,
} from '@izo/hyperfocale/components';
```

### `<SeriesCard>`

Card d'aperçu d'une série. Affiche la cover, le titre, la date, la description.

| Prop      | Type     | Requis | Description                  |
|-----------|----------|--------|------------------------------|
| `series`  | `Series` | oui    | Objet série retourné par les helpers |

### `<SeriesList>`

Grille de `SeriesCard`. Accepte un tableau de séries.

| Prop       | Type       | Requis | Description                        |
|------------|------------|--------|------------------------------------|
| `series`   | `Series[]` | oui    | Tableau de séries                  |
| `columns`  | `number`   | non    | Nombre de colonnes (défaut : 3)    |

### `<SeriesGallery>`

Galerie paginée des images d'une série.

| Prop        | Type       | Requis | Description                                          |
|-------------|------------|--------|------------------------------------------------------|
| `images`    | `Image[]`  | oui    | Images de la page courante                           |
| `page`      | `number`   | oui    | Numéro de page courant                               |
| `totalPages`| `number`   | oui    | Nombre total de pages                                |
| `baseUrl`   | `string`   | oui    | URL de base pour la pagination (`/series/<slug>`)    |

### `<SeriesLightbox>`

Visionneuse plein écran. S'ouvre au clic sur une image de la galerie. Navigation clavier (←/→/Esc).

| Prop      | Type      | Requis | Description                |
|-----------|-----------|--------|----------------------------|
| `images`  | `Image[]` | oui    | Toutes les images de la série (pas seulement la page) |

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

Retourne toutes les séries triées par date décroissante.

```ts
const series = await getSeriesList();
// Series[]
```

### `getSeriesBySlug(slug: string)`

Retourne une série par son slug. Lève une erreur si introuvable.

```ts
const series = await getSeriesBySlug('bretagne-2024');
// Series
```

### `getSeriesImages(slug: string)`

Retourne toutes les images d'une série, triées alphabétiquement.

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

Le plugin inclut un thème visuel (CSS) configurable.

### Options

| Option  | Valeurs                    | Défaut   | Description                              |
|---------|----------------------------|----------|------------------------------------------|
| `theme` | `'light'` \| `'dark'` \| `'auto'` | `'auto'` | Mode clair, sombre, ou selon l'OS |

### Personnalisation

Le thème expose des **CSS custom properties** surchargeables dans le CSS du site consommateur :

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

---

## Règles métier

### Images

- Glob pattern : `./media/*.{jpg,jpeg,png,webp,avif}` (pas de récursion).
- Tri alphabétique par nom de fichier. Nommage recommandé : `01.jpg`, `02.jpg`... (padding à 2 chiffres minimum pour garantir l'ordre au-delà de 9 images).
- La `cover` du frontmatter, ou à défaut la première image alphabétique.
- Optimisation au build : Astro génère WebP, srcset, dimensions.

### Affichage d'une série

- Le **body markdown** s'affiche **avant** la galerie.
- La galerie est **paginée** (`pageSize` configurable, défaut : 12).
- La lightbox charge **toutes les images** de la série (pas seulement la page courante) pour permettre la navigation complète.

### Tri des séries

- Date décroissante sur la liste (les plus récentes en premier).

### URLs

- Format : `/<prefix>/<slug>/` (trailing slash Astro).
- Pagination : `/<prefix>/<slug>/<page>/` (à partir de la page 2).
- Exemple : `bretagne-2024` → `/series/bretagne-2024/`, `/series/bretagne-2024/2/`...

---

## Ajouter une série (côté utilisateur)

1. Créer `src/content/series/<slug>/`
2. Créer `index.md` avec au minimum `title` et `date`
3. Ajouter les photos dans `media/`
4. La série apparaît automatiquement sur le site

---

## Extensibilité

Pour étendre le schéma (hors périmètre du plugin) :

1. Surcharger la collection `series` dans `src/content.config.ts` du projet consommateur
2. Utiliser les nouveaux champs dans des composants custom

Exemples d'extensions possibles :

| Champ         | Type       | Usage                              |
|---------------|------------|------------------------------------|
| `tags`        | `string[]` | Filtrage par catégorie             |
| `draft`       | `boolean`  | Masquer une série en cours d'édition |
| `camera`      | `string`   | Matériel utilisé                   |
| `externalUrl` | `string`   | Lien vers une galerie externe      |
