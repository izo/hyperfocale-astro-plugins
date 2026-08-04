# Hyperfocale — Site Exemple

Mini-site Astro 6 qui consomme le plugin `hyperfocale` en lien local.  
Il démontre l'intégration complète : routes automatiques, content collection, composants, helpers, et thème.

---

## Structure

```
examples/demo-site/
├── astro.config.mjs          ← intégration hyperfocale configurée
├── package.json              ← dépendance sur "@regrets/hyperfocale": "../../"
├── tsconfig.json
└── src/
    ├── content.config.ts     ← enregistrement de la collection `series`
    ├── content/
    │   └── series/
    │       ├── bretagne-2024/
    │       │   ├── index.md        ← métadonnées + texte
    │       │   └── media/          ← photos (01.png, 02.png...)
    │       ├── tokyo-automne/
    │       └── islande-2023/
    ├── layouts/
    │   └── Layout.astro      ← layout HTML global
    └── pages/
        └── index.astro       ← page d'accueil avec CTA vers /series/
```

---

## Lancer le site exemple

### 1. Build du plugin (depuis la racine du repo)

```bash
# Depuis /hyperfocale-astro-plugins
npm run build
```

Cette commande génère le dossier `dist/` contenant le plugin compilé.

### 2. Installer les dépendances du demo-site

```bash
cd examples/demo-site
npm install
```

La dépendance `"@regrets/hyperfocale": "../../"` dans `package.json` pointe directement  
vers la racine du repo — npm crée automatiquement un lien local lors du `npm install`.

### 3. Démarrer le serveur de développement

```bash
npm run dev
```

Ouvrir http://localhost:4321

### 4. Builder en production

```bash
npm run build
npm run preview
```

---

## Ce que démontre ce site

### Routes automatiques (sans écrire une seule page Astro)

Le plugin injecte ces routes via `injectRoute()` :

| URL | Description |
|-----|-------------|
| `/series/` | Liste de toutes les séries |
| `/series/bretagne-2024/` | Page de la série Bretagne |
| `/series/bretagne-2024/2/` | Page 2 de la galerie (si > pageSize images) |
| `/series/tokyo-automne/` | Page de la série Tokyo |
| `/series/islande-2023/` | Page de la série Islande |

### Content Collection automatique

Le fichier `src/content.config.ts` n'a besoin que de 2 lignes :

```ts
import { seriesCollection } from 'virtual:hyperfocale/collection';
export const collections = { series: seriesCollection };
```

Le schéma Zod complet (`title`, `date`, `description`, `cover`, `location`) est fourni par le plugin.

### Utilisation des composants

Les composants peuvent être importés dans n'importe quelle page custom :

```astro
---
import { SeriesList, SeriesCard } from '@regrets/hyperfocale/components';
import { getSeriesList } from '@regrets/hyperfocale/helpers';

const series = await getSeriesList();
---

<SeriesList series={series} columns={3} />
```

### Utilisation des helpers

```ts
import { getSeriesList, getSeriesBySlug, getSeriesImages, paginateImages } from '@regrets/hyperfocale/helpers';

// Toutes les séries (tri date décroissante)
const allSeries = await getSeriesList();

// Une série par son slug
const serie = await getSeriesBySlug('bretagne-2024');

// Images d'une série
const images = await getSeriesImages('bretagne-2024');

// Pagination
const { items, totalPages, currentPage } = paginateImages(images, 12, 1);
```

### Personnalisation du thème

Surcharger les custom properties dans votre CSS global :

```css
:root {
  --hf-color-accent: #e85d04;    /* orange au lieu de bleu */
  --hf-gallery-gap: 1rem;        /* plus d'espace entre les photos */
  --hf-card-radius: 8px;         /* coins plus arrondis */
}
```

---

## Ajouter une nouvelle série

1. Créer `src/content/series/<slug>/`
2. Créer `src/content/series/<slug>/index.md` :
   ```yaml
   ---
   title: "Mon titre"
   date: 2024-01-15
   description: "Description optionnelle"
   cover: "./media/01.jpg"   # optionnel
   location: "Lieu"          # optionnel
   ---

   Texte affiché avant la galerie.
   ```
3. Ajouter les photos dans `src/content/series/<slug>/media/`
4. La série apparaît automatiquement sur `/series/`

---

## Étendre le schéma

Pour ajouter des champs custom (non inclus dans le plugin) :

```ts
// src/content.config.ts
import { defineCollection } from 'astro:content';
import { seriesSchema } from '@regrets/hyperfocale';
import { z } from 'zod';

const extendedSchema = ({ image }: { image: () => import('zod').ZodType }) =>
  seriesSchema({ image }).extend({
    tags: z.array(z.string()).optional(),
    draft: z.boolean().default(false),
    camera: z.string().optional(),
  });

export const collections = {
  series: defineCollection({ type: 'content', schema: extendedSchema }),
};
```

Voir `docs/schema-extensibility.md` pour la documentation complète.
