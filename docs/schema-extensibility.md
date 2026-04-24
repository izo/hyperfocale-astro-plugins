# Extensibilité du schéma — Plugin `hyperfocale`

Le plugin fournit un schéma Zod de base pour la collection `series`.  
Ce guide explique comment l'étendre pour ajouter des champs custom sans modifier le plugin.

---

## Schéma de base

Le plugin exporte `seriesSchema` depuis son point d'entrée principal :

```ts
import { seriesSchema } from '@izo/hyperfocale';
```

Ce schéma couvre les champs fondamentaux :

| Champ         | Type     | Requis | Description                              |
|---------------|----------|--------|------------------------------------------|
| `title`       | `string` | oui    | Titre de la série                        |
| `date`        | `date`   | oui    | Date (tri décroissant sur la liste)      |
| `description` | `string` | non    | Description courte                       |
| `cover`       | `image`  | non    | Couverture (optimisée par Astro)         |
| `location`    | `string` | non    | Lieu de la série                         |

---

## Surcharger la collection `series`

Par défaut, `src/content.config.ts` utilise le module virtuel du plugin :

```ts
// src/content.config.ts — configuration minimale
import { seriesCollection } from 'virtual:hyperfocale/collection';

export const collections = { series: seriesCollection };
```

Pour étendre le schéma, remplacer par une définition manuelle qui appelle `.extend()` :

```ts
// src/content.config.ts — avec extension du schéma
import { defineCollection } from 'astro:content';
import { seriesSchema } from '@izo/hyperfocale';
import { z } from 'zod';

export const collections = {
  series: defineCollection({
    type: 'content',
    schema: (ctx) =>
      seriesSchema(ctx).extend({
        // vos champs custom ici
      }),
  }),
};
```

> `seriesSchema` est une fonction qui prend un `SchemaContext` (le paramètre `ctx` ci-dessus).  
> Ce contexte fournit notamment `{ image }` pour les champs de type image Astro.  
> Appeler `.extend()` sur le résultat crée un nouveau schéma Zod qui inclut les champs de base **et** vos champs custom.

---

## Exemples d'extensions

### `tags` — Filtrage par catégorie

```ts
schema: (ctx) =>
  seriesSchema(ctx).extend({
    tags: z.array(z.string()).optional(),
    // usage dans index.md :
    // tags: [portrait, nature, voyage]
  }),
```

Utilisation dans une page Astro :

```astro
---
import { getCollection } from 'astro:content';

const allSeries = await getCollection('series');
const portraitSeries = allSeries.filter(
  (s) => s.data.tags?.includes('portrait')
);
---
```

---

### `draft` — Masquer une série en cours d'édition

```ts
schema: (ctx) =>
  seriesSchema(ctx).extend({
    draft: z.boolean().default(false),
  }),
```

Filtrer les drafts en production :

```astro
---
import { getCollection } from 'astro:content';

const series = await getCollection('series', ({ data }) => {
  return import.meta.env.PROD ? !data.draft : true;
});
---
```

---

### `camera` — Matériel utilisé

```ts
schema: (ctx) =>
  seriesSchema(ctx).extend({
    camera: z.string().optional(),
    lens: z.string().optional(),
    // usage dans index.md :
    // camera: "Sony A7 IV"
    // lens: "Sigma 35mm f/1.4"
  }),
```

Afficher dans un composant custom :

```astro
---
const { series } = Astro.props;
---
{series.data.camera && (
  <p class="camera-info">
    Prise avec {series.data.camera}
    {series.data.lens && ` · ${series.data.lens}`}
  </p>
)}
```

---

### `externalUrl` — Lien vers une galerie externe

```ts
schema: (ctx) =>
  seriesSchema(ctx).extend({
    externalUrl: z.string().url().optional(),
    // usage dans index.md :
    // externalUrl: "https://flickr.com/photos/..."
  }),
```

---

### Combinaison de plusieurs extensions

Toutes les extensions peuvent être combinées en un seul appel `.extend()` :

```ts
// src/content.config.ts — exemple complet
import { defineCollection } from 'astro:content';
import { seriesSchema } from '@izo/hyperfocale';
import { z } from 'zod';

export const collections = {
  series: defineCollection({
    type: 'content',
    schema: (ctx) =>
      seriesSchema(ctx).extend({
        // Filtrage et organisation
        tags: z.array(z.string()).optional(),
        draft: z.boolean().default(false),

        // Informations techniques
        camera: z.string().optional(),
        lens: z.string().optional(),
        film: z.string().optional(),

        // Liens externes
        externalUrl: z.string().url().optional(),

        // Métadonnées supplémentaires
        featured: z.boolean().default(false),
        color: z.string().optional(), // couleur dominante hex
      }),
  }),
};
```

---

## Typage TypeScript des champs étendus

Astro infère automatiquement les types depuis le schéma Zod.  
Pour accéder aux champs custom avec un typage correct, utiliser `CollectionEntry` :

```ts
import type { CollectionEntry } from 'astro:content';

type ExtendedSeries = CollectionEntry<'series'>;
// ExtendedSeries['data'] inclut tous les champs de base + vos extensions

// Accès typé :
const serie: ExtendedSeries = await getEntry('series', 'bretagne-2024');
serie.data.tags;       // string[] | undefined
serie.data.draft;      // boolean
serie.data.camera;     // string | undefined
```

---

## Limites

- Les champs custom **ne sont pas** connus des composants et helpers fournis par le plugin (`SeriesCard`, `SeriesList`, etc.).  
  Pour les afficher, créer des composants custom dans votre projet.

- La surcharge de la collection **remplace** le module virtuel `virtual:hyperfocale/collection`.  
  Ne pas importer les deux en même temps dans `content.config.ts`.

- Les helpers `getSeriesList()`, `getSeriesBySlug()`, etc. retournent le type `Series` du plugin, qui ne connaît pas vos extensions.  
  Préférer `getCollection('series')` directement depuis `astro:content` pour accéder aux champs custom.

---

## Fichiers de référence

- Schéma de base : [`src/schema.ts`](../src/schema.ts)
- Module virtuel : [`src/index.ts`](../src/index.ts) (section `virtualModulePlugin`)
- Exemple d'utilisation : [`examples/demo-site/src/content.config.ts`](../examples/demo-site/src/content.config.ts)
