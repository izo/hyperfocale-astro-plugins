# @regrets/hyperfocale

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Astro](https://img.shields.io/badge/Astro-7.x-FF5D01?logo=astro&logoColor=white)](https://astro.build)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![npm](https://img.shields.io/badge/npm-%40regrets%2Fhyperfocale-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/@regrets/hyperfocale)

> Transformez un dossier de photos en galerie complète — routes, pagination, lightbox et thème — sans écrire une seule page Astro.

Plugin d'intégration **Astro 7** pour sites de photographie. Ajoute en une ligne de config un système complet de **séries photo** : content collection, routes automatiques, composants, helpers TypeScript et thème CSS configurable.

---

## Fonctionnalités

- **Zéro config requise** — une ligne dans `astro.config.mjs` suffit
- **CLI `init`** — crée ou met à jour `src/content.config.ts` automatiquement
- **Routes injectées** — `/series/`, `/series/[slug]/`, pagination native
- **9 composants prêts** — `SeriesCard`, `SeriesList`, `SeriesGallery`, `SeriesLightbox`, `SeriesAttachments`, `SeriesEmbeds`, `SeriesFilter`, `SeriesMap`, `SeriesMasonry`
- **Contenus embarqués** — Vimeo, YouTube, SoundCloud… chargés en façade, l'iframe n'arrive qu'au clic
- **Lightbox native** — navigation clavier ←/→/Esc, aucune dépendance externe
- **Thème configurable** — CSS custom properties `--hf-*` surchargeables
- **Schéma extensible** — ajoutez vos champs via `.extend()` Zod
- **Images optimisées** — WebP, srcset et dimensions générés au build par Astro
- **TypeScript first** — types complets, 0 erreur de compilation garantie

---

## Installation

### 1. Installer le plugin

```bash
npm install @regrets/hyperfocale
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
import hyperfocale from '@regrets/hyperfocale';

export default defineConfig({
  integrations: [
    hyperfocale({
      prefix: '/series',  // préfixe des routes           (défaut)
      pageSize: 12,       // images par page              (défaut)
      theme: 'auto',      // 'light' | 'dark' | 'auto' | 'none'  (défaut 'auto')
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
| `preset` | `PresetName` | — | Profil de domaine : pré-remplit `prefix`, `collectionName` et `dateRequired` (voir ci-dessous). Toute option explicite l'emporte. |
| `prefix` | `string` | `'/series'` | Préfixe des routes injectées. Doit commencer par `/`. |
| `pageSize` | `number` | `12` | Nombre d'images par page dans la galerie paginée (≥ 1). |
| `theme` | `'light' \| 'dark' \| 'auto' \| 'none'` | `'auto'` | Thème CSS injecté. `'auto'` suit `prefers-color-scheme`. `'none'` n'injecte **aucune** feuille — voir *Couche data seule*. |
| `collectionName` | `string` | `'series'` | Nom de la content collection à enregistrer. Les helpers lisent cette collection et ses `media/` — y compris sous un autre nom (`projects` avec le preset `portfolio`). |
| `dateRequired` | `boolean` | `true` | Si `false`, le champ `date` devient optionnel (collections non temporelles : marques, produits). |
| `imageOptimization` | `'auto' \| 'disabled'` | `'auto'` | `'disabled'` sert les fichiers d'origine sans passer par `astro:assets` (voir *Déploiement*). |

### Profils de domaine (`preset`)

Le plugin ne sert pas que des galeries photo. Un `preset` pré-remplit les trois options structurantes d'un domaine — ces profils sont standardisés en Annexe G de la spec :

```js
hyperfocale({ preset: 'portfolio' })   // → collection `projects`, routes sous /projets
```

| Preset | Collection | Préfixe | `dateRequired` | L'atome |
|--------|-----------|---------|----------------|---------|
| `series` | `series` | `/series` | `true` | Une série photo |
| `portfolio` | `projects` | `/projets` | `false` | Un projet |
| `music` | `albums` | `/discographie` | `false` | Une sortie (album, EP, single) |
| `catalog` | `items` | `/catalogue` | `false` | Une pièce du catalogue |
| `press` | `articles` | `/presse` | `true` | Un article |
| `recipe` | `recipes` | `/recettes` | `false` | Une recette |
| `event` | `events` | `/evenements` | `true` | Un événement |
| `app` | `apps` | `/applications` | `false` | Une application |
| `book` | `books` | `/livres` | `false` | Un livre lu |
| `place` | `places` | `/lieux` | `false` | Un lieu |
| `screen` | `screens` | `/ecrans` | `false` | Un écran |

Les onze profils de l'Annexe G sont couverts. Seul `series`, `press` et `event` exigent une date : ailleurs le contenu est intemporel — une recette, un lieu, une démo non datée restent valides.

Toute option explicite l'emporte sur le preset : `hyperfocale({ preset: 'music', prefix: '/albums' })` garde la collection `albums` mais sert `/albums`.

Les préfixes sont localisés en français. La spec les donne en anglais, mais sa colonne `prefix` est une **recommandation** — §2.0.1 autorise un preset à fixer le sien.

Chaque profil se dote de son propre bloc d'extension au frontmatter — `music:`, `book:`, `place:`… Le schéma les laisse passer tels quels (`z.looseObject`) : leur forme est décrite par l'Annexe G, pas validée par le plugin.

> **`photo` est déprécié.** C'était le nom du profil canonique avant que l'Annexe G ne le standardise sous le nom `series`. Il continue de fonctionner à l'identique, avec un avertissement au build, et sera retiré en 1.0.

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

Le schéma Zod complet (`seriesSchema`) accepte 19 champs. Seul `title` est toujours requis ; `date` l'est sauf si `dateRequired: false` ou `type: section`. Le schéma est en mode `looseObject` — vos champs custom passent sans configuration.

| Champ | Type | Défaut | Description |
|-------|------|--------|-------------|
| `title` | `string` | — (requis) | Titre de la série |
| `date` | `date` | — (requis¹) | Date ISO. Tri décroissant sur la liste |
| `type` | `'series' \| 'section'` | `'series'` | `section` → page d'index de rubrique, pas une série (voir ci-dessous) |
| `description` | `string` | — | Description courte affichée sur la card |
| `cover` | `image` | — | Couverture. Première image si absent (`getSeriesCover`) |
| `location` | `string` | — | Lieu associé à la série |
| `lang` | `string` | — | Code langue (ex. `fr`, `en`) |
| `published` | `boolean` | `true` | **Déprécié** — `false` → masquée en production. Faites `draft: true` (voir ci-dessous) |
| `draft` | `boolean` | `false` | `true` → masquée en production (visible en dev) |
| `featured` | `boolean` | `false` | Mise en avant (`querySeries({ featured })`) |
| `tags` | `string[]` | `[]` | Tags libres (`getAllTags`, filtre `querySeries`) |
| `lineup_order` | `number` | — | Ordre d'une sous-série dans le line-up de son conteneur (§1.8) |
| `alt_description` | `string` | — | Texte alternatif de la série |
| `private` | `boolean` | `false` | Marque la série comme privée |
| `download` | `boolean` | `false` | Autorise le téléchargement des originaux |
| `iptc` | `object` | — | Métadonnées IPTC (voir ci-dessous) |
| `images` | `ImageEntry[]` | — | Liste d'images curée — trois formes acceptées (voir ci-dessous) |
| `attachments` | `AttachmentMeta[]` | — | Métadonnées des documents joints locaux |
| `files` | `RemoteFile[]` | — | Documents joints en mode distant |
| `embeds` | `Embed[]` | — | Médias hébergés chez un tiers et joués dans la page — Vimeo, YouTube, SoundCloud… (§1.11, voir ci-dessous) |

¹ Optionnel si l'intégration est configurée avec `dateRequired: false`, ou si l'entrée déclare `type: section`.

> **`published` est déprécié.** `published: false` fait exactement ce que fait `draft: true`, en logique inverse — deux façons d'écrire la même chose, dont une seule est standardisée par la spec (§1.3). C'est `draft` qui reste.
>
> Le champ continue de fonctionner à l'identique et sera retiré en 1.0. Un build qui rencontre une série `published: false` l'annonce une fois, en nommant les séries concernées. La migration : remplacer `published: false` par `draft: true`, et supprimer les `published: true` — ils ne faisaient rien.
>
> `querySeries({ published })` suit le même sort : préférez `querySeries({ draft })`.

**Bloc `iptc`** (tous optionnels, mode `looseObject`) : `creator`, `credit`, `copyright`, `keywords[]`, `city`, `province`, `country`, `country_code`, `camera`, `lens`, `film`, `headline`, `instructions`, `source`, `gps: { lat, lng }`.

Le champ `iptc.gps` alimente `<SeriesMap>`.

---

## Modes avancés

### Pages d'index de section

Un corpus un peu grand range ses séries par rubriques. Un `index.md` posé sur un dossier de rangement n'est pas une série : il n'a pas de date, et il n'a rien à faire dans la liste des séries. Il se déclare `type: section` (spec §1.10) :

```yaml
---
type: section
title: "Archives"
description: "Séries anciennes, rangées par époque."
---

Texte affiché en tête de la page de rubrique.
```

`date` n'est alors pas requise, et l'entrée est écartée de `getSeriesList()`, `querySeries()`, `getAllTags()`, `getAllCollections()` et des routes générées. Les séries rangées dans le dossier restent, elles, des séries à part entière.

Deux helpers pour construire la page de rubrique :

```ts
const sections = await getSections();       // → les entrées `type: section`, triées par slug
if (isSection(entry)) { /* … */ }           // → discriminant explicite
```

La distinction se lit **uniquement** dans `type` : une série sans `date` reste une série invalide, jamais une section devinée.

### Séries imbriquées (conteneur)

Une **série conteneur** regroupe des sous-séries liées éditorialement — un festival et ses concerts, un mariage et ses moments (spec §1.8). Elle reste une série à part entière : son propre `index.md` daté, sa galerie éventuelle, et en fin de page le **line-up** de ses sous-séries.

```
src/content/series/festival-2024/
├── index.md              ← le conteneur (title + date requis)
├── media/                ← optionnel : ses photos propres
├── set-aurore/
│   ├── index.md
│   └── media/
└── set-crepuscule/…
```

Les deux niveaux d'URL sont générés automatiquement : `/series/festival-2024/` et `/series/festival-2024/set-aurore/`. Le line-up s'affiche sur la page du conteneur, sans configuration.

**Ne pas confondre avec le rangement.** `archives/music/concerts/<slug>/` est une série rangée en profondeur, pas une sous-série : aucun dossier traversé ne porte d'`index.md`. L'imbrication commence quand un dossier **porteur d'un `index.md`** en contient un autre — et elle est limitée à un niveau.

Le line-up est trié par date décroissante. Pour un ordre éditorial, `lineup_order` prime :

```yaml
# festival-2024/set-crepuscule/index.md
lineup_order: 1   # passe devant, quelle que soit sa date
```

Les sous-séries sans `lineup_order` suivent celles qui en ont, entre elles par date décroissante. Le helper est exposé pour composer vos propres pages :

```ts
const lineup = await getSubSeries('festival-2024');  // Series[]
```

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

Le tableau `images:` accepte **trois formes**, mélangeables — la première est celle de la spec §1.5, les deux autres sont des extensions du plugin pour curer l'ordre et les `alt` d'images locales :

```yaml
images:
  - url: "https://cdn.exemple.com/01.jpg"   # distante (§1.5)
    alt: "Shibuya de nuit"
  - file: "02.jpg"                          # fichier de media/, par nom
    alt: "Ruelle de Golden Gai"
  - src: "./media/03.jpg"                   # asset traité par image() du site
```

Les documents joints **locaux** (tout fichier non-image dans `media/`) sont détectés automatiquement ; le bloc `attachments:` permet d'y attacher un titre/description :

```yaml
attachments:
  - file: "interview.mp3"
    title: "Entretien avec l'artiste"
    description: "12 min, français"
```

### Manifeste d'images externalisé

Le tableau `images:` du frontmatter suppose une liste écrite à la main. Dès qu'elle est **générée** — synchronisation CDN, pipeline d'optimisation, export depuis un catalogue — l'inscrire dans le frontmatter mélange donnée dérivée et donnée éditoriale : chaque resynchronisation réécrit `index.md` et pollue son historique Git.

Un fichier `images.json` posé à côté d'`index.md` isole cette liste (spec §1.5.1) :

```
bretagne-2024/
├── index.md
├── images.json
└── media/
```

```json
{
  "images": [
    { "url": "./media/03.jpg", "alt": "Phare de la Pointe Saint-Mathieu" },
    "./media/01.jpg",
    { "url": "https://cdn.exemple.com/bretagne/final.jpg", "width": 3000, "height": 2000 }
  ],
  "files": [
    { "url": "https://cdn.exemple.com/bretagne/carnet.pdf", "title": "Carnet" }
  ]
}
```

Les deux formes sont acceptées : une chaîne équivaut à `{ "url": <chaîne> }`.

| Règle | Comportement |
|-------|--------------|
| Priorité | `images:` du frontmatter > `images.json` > scan de `media/` |
| Ordre | L'ordre du tableau fait foi — aucun tri alphabétique |
| Résolution | URL absolue (`https://…`), chemin absolu au site (`/…`), ou relatif à `index.md` (`./media/01.jpg`). Seul le relatif désigne un asset local : il est résolu par Astro, donc optimisé, avec ses dimensions réelles |
| Couverture | `cover` du frontmatter, sinon la première entrée du tableau |
| Robustesse | JSON illisible, clé `images` absente ou non-tableau : repli silencieux sur `media/`, avec un avertissement en console. **Jamais d'échec de build** |

Les trois modes sont exclusifs par série. Une série portant à la fois un `images:` et un `images.json` déclenche un avertissement — le frontmatter l'emporte.

### Déploiement et optimisation des images

Par défaut, `astro:assets` traite les images au build : conversion WebP, dimensions, et `srcset` haute densité pour les écrans Retina.

**Le `srcset` est omis en développement.** Quand un site délègue l'optimisation à son hébergeur — `@astrojs/vercel`, `@astrojs/netlify`, Cloudflare Images — les URLs générées pointent vers un endpoint (`/_vercel/image?…`) qui n'existe pas en local : chaque variante du `srcset` répondrait 404. Le rendu de production est inchangé.

Si vos images sont déjà optimisées en amont, ou servies par un CDN qui s'en charge, court-circuitez le traitement :

```js
hyperfocale({ imageOptimization: 'disabled' })
```

Les fichiers de `media/` sont alors servis tels quels, sans conversion ni redimensionnement. Les dimensions déclarées restent transmises au HTML, ce qui préserve la réservation d'espace et évite les décalages de mise en page.

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
  SeriesEmbeds,
  SeriesFilter,
  SeriesMap,
  SeriesMasonry,
} from '@regrets/hyperfocale/components';
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

### `<SeriesEmbeds embeds={emb} heading="Vidéos" />`

Rend les contenus embarqués d'une série (§1.11) **en façade** : le poster s'affiche, l'iframe n'est insérée qu'au clic. Alimenté par `getSeriesEmbeds()`.

| Prop | Type | Défaut | Description |
|------|------|--------|-------------|
| `embeds` | `Embed[]` | — | Contenus embarqués résolus |
| `heading` | `string` | `« Vidéos »` | Titre de la section |

Deux raisons à la façade : onze lecteurs montés d'emblée plombent la page, et chacun dépose ses cookies avant même qu'on ait demandé à voir la vidéo. La façade est un `<a href>` vers la page de l'hébergeur — sans JavaScript elle reste un lien fonctionnel, il n'y a jamais de bouton mort.

Un embed dont `platform` n'est pas reconnue, ou dont l'`id` manque, se rend en lien : c'est la dégradation prévue par la spec, et elle vaut pour tout hébergeur que le plugin ne connaît pas.

⚠️ **Beaucoup d'hébergeurs restreignent leur lecteur au domaine déclaré.** Un embed qui refuse de se lancer en local n'est pas nécessairement cassé — c'est un contrôle à faire en production, pas au build.

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
} from '@regrets/hyperfocale/helpers';
```

Tous les helpers qui lisent la collection acceptent un **nom de collection Astro** en
dernier argument. Sans argument, ils lisent celle qu'a configurée l'intégration
(`collectionName`), sinon `series` — le comportement historique.

C'est ce qu'attend un site **multilingue** qui tient une collection par locale : sans cet
argument, les helpers servaient la première collection interrogée à toutes les requêtes
suivantes du même build, silencieusement.

```ts
const en = await getSeriesList();              // collection configurée
const fr = await getSeriesList('series_fr');   // une autre collection du même build
```

Concerne `getSeriesList`, `getSeriesBySlug`, `getSections`, `getSubSeries`, `getAllTags`,
`getAllCollections`, et `querySeries` via l'option `collectionName`. Le cache est indexé
par collection : une lecture par collection et par build, pas une pour toutes.

### `getSeriesList(collectionName?)`

Toutes les séries triées par date décroissante. Écarte les pages d'index de section (`type: section`).

```ts
const series = await getSeriesList();
// Series[]
```

### `getSections()` · `isSection(entry)`

Les pages d'index de section (spec §1.10) — ce que `getSeriesList()` écarte.

```ts
const sections = await getSections();  // Series[], triées par slug
isSection(entry);                      // boolean
```

### `getSubSeries(containerId)`

Les sous-séries d'une série conteneur (§1.8), triées par `lineup_order` puis par date décroissante. Vide pour une série ordinaire.

```ts
const lineup = await getSubSeries('festival-2024');
// Series[] — uniquement les entrées un segment plus bas
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
const { items, totalPages, currentPage, pageSize } = paginateImages(images, 12, 1);
```

### `querySeries(options)`

API de requête flexible — remplace `getSeriesList()` dès qu'il faut filtrer, trier ou paginer. Retourne `{ items, pagination }`.

```ts
const { items, pagination } = await querySeries({
  collectionName: 'series_fr', // collection Astro à lire (défaut : celle configurée)
  collection: 'voyages',      // premier segment du slug — à ne pas confondre
  tags: ['argentique'],       // ET-logique (tous les tags requis)
  featured: 'first',          // true = seulement featured · 'first' = remontées en tête
  exclude: ['voyages/asie/tokyo-2024'],
  draft: false,               // défaut false — `published` est déprécié, cf. frontmatter
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

### `getSeriesEmbeds(slug, series?)`

Contenus embarqués d'une série (`Embed[]`), **dans l'ordre du tableau** — aucun tri. Chaque entrée reçoit un `playable` calculé : `platform` reconnue **et** `id` présent.

```ts
const embeds = await getSeriesEmbeds('documentaire-2024', serie);
// Embed[] : { url, playable, platform?, id?, title?, description?, poster?, width?, height? }
```

```yaml
embeds:
  - url: "https://vimeo.com/123831041"
    platform: vimeo          # vimeo · youtube · dailymotion · soundcloud · bandcamp · spotify
    id: "123831041"          # l'identifiant chez l'hébergeur, pas l'URL
    title: "Le film"
    description: "74 min"
    poster: "./media/poster.jpg"
    width: 1920
    height: 1080
```

**`url` est le seul champ requis**, et c'est délibéré : elle suffit à un rendu valide. La liste des plateformes est **ouverte** — une valeur inconnue reste licite, l'embed dégrade simplement en lien.

> ⚠️ **Un poster n'est pas une photo de la série.** Une image de `media/` référencée par `embeds[].poster` est **exclue du scan de galerie**. C'est la seule exception au principe « toute image de `media/` alimente la galerie » : sans elle, une série de trois vidéos afficherait trois vignettes parasites. L'exclusion ne porte que sur le scan — `images:` et `images.json` sont des listes écrites, ce qu'elles nomment est voulu.

**Frontière avec `getSeriesAttachments()`** : c'est **où vit l'octet**, pas la nature du média.

| | Document joint §1.9 | Contenu embarqué §1.11 |
|---|---|---|
| Un `.mp4` dans `media/` | ✅ | ✗ |
| Un `.mp4` sur son propre CDN (`files:`) | ✅ | ✗ |
| Une vidéo Vimeo | ✗ | ✅ |

On sert l'octet d'un attachment et une balise native le lit ; l'embed commence là où c'est le lecteur de quelqu'un d'autre qui rend le média.

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

### `getCollectionFetchCount()`

Nombre d'appels réels à `getCollection` depuis le chargement du module — un par *cache miss*. Sert à vérifier que le cache tient sur un build donné.

```bash
HYPERFOCALE_DEBUG_CACHE=1 astro build
# [hyperfocale] getCollection("series") — appel #1, 126 entrées
```

Mesuré sur un build de **126 séries produisant 127 pages : un seul appel**. Le cache module-level survit à l'ensemble du build SSG ; aucun préchauffage explicite n'est nécessaire.

### `resetSeriesCache()`

Réinitialise le cache module-level. À appeler dans les teardowns de tests pour éviter les fuites entre cas.

```ts
afterEach(() => resetSeriesCache());
```

---

## Thème

Le plugin injecte un thème CSS via l'option `theme` (`'light'`, `'dark'`, `'auto'`, `'none'`).

| Valeur | Effet |
|--------|-------|
| `'auto'` *(défaut)* | Suit `prefers-color-scheme` |
| `'light'` | Palette claire, quelle que soit la préférence système |
| `'dark'` | Palette sombre, quelle que soit la préférence système |
| `'none'` | Aucune feuille injectée — voir *Couche data seule* |

`'light'` et `'dark'` posent `data-hf-theme` sur `<html>` par un script inline
exécuté dans le `<head>`, donc avant le premier rendu — le thème demandé s'affiche
sans transition visible. Le plugin ne rendant le `<html>` que sur son layout de
repli, c'est ce qui permet à l'option de valoir aussi sous votre propre layout et
dans vos pages maison.

Sans JavaScript, l'attribut n'est pas posé et le thème retombe sur `'auto'`.

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

### Couche data seule — `theme: 'none'`

Le thème part sur **toutes** les pages du site, pas seulement les routes injectées.
C'est voulu : un site qui rend `SeriesGallery` ou `SeriesLightbox` dans ses propres
pages en a besoin. `injectRoutes: false` ne le coupe donc pas — les deux options sont
indépendantes, et c'est l'usage des **composants** qui commande, pas celui des routes.

Un site qui n'utilise **ni les routes ni les composants** — schéma et helpers seulement,
pages entièrement maison — ne lit aucune des 30 custom properties `--hf-*`. Elles
partaient malgré tout sur chacune de ses pages : mesuré sur un site réel à **1 643 octets,
29 % de son bundle CSS**, entièrement mort. Coupez-les :

```js
hyperfocale({
  injectRoutes: false,   // je câble mes propres pages
  theme: 'none',         // …et je n'affiche aucun composant du plugin
})
```

Gardez `theme: 'auto'` dès que vous rendez un seul composant du plugin, faute de quoi il
s'affichera sans styles.

---

## Étendre le schéma

Pour ajouter des champs custom au frontmatter, utilisez `.extend()` sur le schéma de base :

```ts
// src/content.config.ts
import { defineCollection } from 'astro:content';
import { seriesSchema } from '@regrets/hyperfocale';
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
