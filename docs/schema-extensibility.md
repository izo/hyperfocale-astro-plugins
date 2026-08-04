# Extensibilité du schéma

Le plugin expose deux fonctions pour définir le schéma de votre collection :

| Fonction | Quand l'utiliser |
|----------|-----------------|
| `seriesSchema(ctx)` | Usage standard — inclut `cover` (image traitée par Astro) |
| `baseSeriesSchema()` | Extension personnalisée — sans `cover`, utilisable hors `defineCollection` |

## Champs disponibles par défaut

| Champ | Type | Défaut | Description |
|-------|------|--------|-------------|
| `title` | `string` | requis | Titre de la série |
| `date` | `Date` | requis¹ | Date de la série |
| `description` | `string?` | — | Description courte |
| `cover` | `image?` | — | Image de couverture (traitée par Astro) |
| `location` | `string?` | — | Lieu de prise de vue |
| `lang` | `string?` | — | Code ISO 639-1 de la langue |
| `published` | `boolean` | `true` | Visibilité en production |
| `draft` | `boolean` | `false` | Mode brouillon |
| `featured` | `boolean` | `false` | Mise en avant dans les listings |
| `tags` | `string[]` | `[]` | Tags éditoriaux |
| `alt_description` | `string?` | — | Description alternative (a11y) |
| `private` | `boolean` | `false` | Série privée (non indexée) |
| `download` | `boolean` | `false` | Téléchargement autorisé |
| `iptc` | `object?` | — | Métadonnées IPTC structurées |
| `images` | `array?` | — | Mode distant — URLs CDN |

¹ Optionnel si `dateRequired: false` est passé.

## Étendre le schéma

### Ajouter des champs personnalisés

```ts
// src/content.config.ts
import { defineCollection } from 'astro:content';
import { baseSeriesSchema } from '@regrets/hyperfocale';
import { z } from 'zod';

export const collections = {
  series: defineCollection({
    schema: (ctx) =>
      baseSeriesSchema().extend({
        cover: ctx.image().optional(),   // réintégrer cover si besoin
        camera: z.string().optional(),
        film: z.string().optional(),
        aperture: z.number().optional(),
      }),
  }),
};
```

### Sans date (marques, produits, portfolios)

```ts
export const collections = {
  brands: defineCollection({
    schema: (ctx) =>
      baseSeriesSchema({ dateRequired: false }).extend({
        cover: ctx.image().optional(),
        logo: ctx.image().optional(),
        founded: z.number().optional(),
      }),
  }),
};
```

### Plusieurs collections avec des schémas différents

```ts
export const collections = {
  series: defineCollection({ schema: seriesSchema }),
  brands: defineCollection({
    schema: (ctx) =>
      baseSeriesSchema({ dateRequired: false }).extend({
        cover: ctx.image().optional(),
        logo: ctx.image(),
      }),
  }),
};
```

## Utiliser les helpers avec un schéma étendu

Les champs personnalisés sont accessibles via cast :

```ts
import { getSeriesList } from '@regrets/hyperfocale/helpers';

const series = await getSeriesList();
const cameras = series.map((s) => (s.data as Record<string, unknown>).camera as string | undefined);
```

Pour un typage fort, déclarez une interface locale :

```ts
interface MySeriesData {
  camera?: string;
  film?: string;
}

const data = series.map((s) => s.data as MySeriesData);
```
