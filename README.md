# @regrets/hyperfocale

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Astro](https://img.shields.io/badge/Astro-7.x-FF5D01?logo=astro&logoColor=white)](https://astro.build)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![npm](https://img.shields.io/badge/npm-%40regrets%2Fhyperfocale-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/@regrets/hyperfocale)

> Transformez un dossier de photos en galerie complète — routes, pagination, lightbox et thème — sans écrire une seule page Astro.

> **Spec** : [`izo/hyperfocale-spec`](https://github.com/izo/hyperfocale-spec), **2.11-draft**. Depuis la v0.20.0, le plugin couvre la v2.11 : les originaux (§1.9) sont ignorés — ni galerie, ni pièce jointe, ni fichier copié au build —, la garde les retire du snapshot publié (§4.11), et le profil `project` (G.12) a son preset. Un dossier de travail se publie toujours par export, jamais tel quel (G.12).

Plugin d'intégration **Astro 7** pour sites de photographie. Ajoute en une ligne de config un système complet de **séries photo** : content collection, routes automatiques, composants, helpers TypeScript et thème CSS configurable.

---

## Fonctionnalités

- **Zéro config requise** — une ligne dans `astro.config.mjs` suffit
- **CLI `init`** — crée ou met à jour `src/content.config.ts` automatiquement
- **Ingestion** — snapshot, diff, validation et providers filesystem, Dropbox et WebDAV (`/ingest`, spec couche 4) : le provider alimente un dossier, le Content Layer lit ce dossier
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
| `project` | `work` | `/suivi` | `true` | Un projet photo en cours (dossier de travail) |

Les douze profils de l'Annexe G sont couverts. Seuls `series`, `press`, `event` et `project` exigent une date : ailleurs le contenu est intemporel — une recette, un lieu, une démo non datée restent valides.

`project` (G.12) décrit un dossier de travail, pas une publication : sa collection est `work` et non le `projects` de l'annexe, déjà pris par `portfolio` depuis la 0.8.0. Le schéma accepte son bloc `project:` (`status`, `stage`, `client`, `contact`, `start`, `end`, `due`, `deliverables`, `tasks`) sans jamais échouer — statut inconnu et clés inconnues conservés — mais aucun composant ne le rend : un adaptateur web ne DOIT PAS l'exposer. Statuts connus : `PROJECT_STATUSES`.

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

Le tableau `images:` accepte **quatre formes**, mélangeables — les deux premières sont celles de la spec (§1.5, §1.5.1), les deux autres des extensions du plugin pour curer l'ordre et les `alt` d'images locales :

```yaml
images:
  - url: "https://cdn.exemple.com/01.jpg"   # forme longue (§1.5)
    alt: "Shibuya de nuit"
  - "./media/04.jpg"                        # forme courte, relative à index.md (§1.5.1, v2.12)
  - file: "02.jpg"                          # fichier de media/, par nom
    alt: "Ruelle de Golden Gai"
  - src: "./media/03.jpg"                   # asset traité par image() du site
```

Une `url` — longue ou courte — est absolue, absolue au site (`/…`) ou relative à `index.md` (`./media/01.jpg`) : elle se résout comme une entrée du manifeste, une entrée relative devenant un asset optimisé de `media/` (spec 2.12). C'est la place d'un **ordre éditorial** : dans une source distante (Dropbox, WebDAV), un ordre de galerie qui n'est pas l'ordre alphabétique des noms s'écrit dans `images:`, jamais dans un `images.json` — l'ingestion le classe `derived` et le régénère, l'ordre de l'auteur serait perdu sans diagnostic (§1.5.1).

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

### Props communes — langue, libellés, options par instance

Les 9 composants acceptent, en plus de leurs props propres :

| Prop | Type | Défaut | Description |
|------|------|--------|-------------|
| `locale` | `string` (BCP 47) | `'fr'` | Langue des libellés, des dates (`Intl.DateTimeFormat`), des nombres et tailles de fichier (`Intl.NumberFormat`) et des pluriels (`Intl.PluralRules`) |
| `labels` | `Partial<HyperfocaleLabels>` | — | Surcharges de libellés, clé par clé (voir *Libellés*) |
| `class` | `string` | — | Classe(s) ajoutée(s) à l'élément racine |
| `data-*`, `aria-*` | `unknown` | — | Reportés tels quels sur l'élément racine (une valeur `false` ou `undefined` est omise) ; un `aria-label` passé remplace celui du composant |

Les composants qui émettent un titre — `SeriesAttachments`, `SeriesEmbeds`, `SeriesCard` (et `SeriesList`, qui le transmet à ses cartes) — acceptent `headingLevel` (`1`–`6`, défaut `2`) pour s'insérer dans la hiérarchie de la page.

Sans `locale`, tout s'affiche comme avant la 0.23.0 : en français.

### Libellés — `HF_LABELS`

Le plugin livre deux dictionnaires complets, `fr` et `en`, exportés et typés :

```ts
import { HF_LABELS, resolveLabels, formatDate, formatFileSize } from '@regrets/hyperfocale/i18n';
// aussi exportés par '@regrets/hyperfocale/components'
```

Résolution d'un libellé : `labels` de l'instance → langue de la locale (`en-GB` → `en`) → `en` → `fr`. Une langue sans dictionnaire (`es`, `ja`, `ko`…) affiche donc les libellés anglais, mais ses dates, nombres et pluriels suivent bien la locale : passez `labels` pour traduire le texte. Les dates de frontmatter sont lues en UTC (une date `2024-03-01` ne recule pas d'un jour à l'ouest de Greenwich).

Les clés sont **stables** — en renommer ou en retirer une est un changement cassant. Les valeurs sont des gabarits à paramètres `{nom}` ; les clés plurielles prennent un objet indexé par catégorie CLDR (`one`, `other`… — `other` obligatoire).

| Clé | Composant | Paramètres | `fr` | `en` |
|-----|-----------|-----------|------|------|
| `card.link` | SeriesCard (`aria-label` du lien) | `{title}` | Voir la série : {title} | View series: {title} |
| `card.coverAlt` | SeriesCard (`alt` de repli) | `{title}` | Couverture de la série {title} | Cover of the series {title} |
| `list.empty` | SeriesList | — | Aucune série disponible pour le moment. | No series available yet. |
| `image.alt` | SeriesGallery, SeriesMasonry (`alt` de repli) | `{n}` | Photo {n} | Photo {n} |
| `gallery.label` | SeriesGallery | — | Galerie photos | Photo gallery |
| `gallery.open` | SeriesGallery | `{n}` | Ouvrir l'image {n} | Open image {n} |
| `pagination.label` | SeriesGallery | — | Pagination de la galerie | Gallery pagination |
| `pagination.prev` | SeriesGallery | — | Page précédente | Previous page |
| `pagination.next` | SeriesGallery | — | Page suivante | Next page |
| `pagination.page` | SeriesGallery | `{n}` | Page {n} | Page {n} |
| `lightbox.label` | SeriesLightbox | — | Visionneuse d'images | Image viewer |
| `lightbox.close` | SeriesLightbox | — | Fermer la visionneuse | Close the viewer |
| `lightbox.prev` | SeriesLightbox | — | Image précédente | Previous image |
| `lightbox.next` | SeriesLightbox | — | Image suivante | Next image |
| `lightbox.imageAlt` | SeriesLightbox (client) | `{n}` `{total}` | Image {n} sur {total} | Image {n} of {total} |
| `lightbox.counter` | SeriesLightbox (client) | `{n}` `{total}` | {n} / {total} | {n} / {total} |
| `attachments.heading` | SeriesAttachments | — | Documents | Documents |
| `size.byte` · `size.kilobyte` · `size.megabyte` · `size.gigabyte` | SeriesAttachments | `{n}` (déjà localisé) | {n} o · Ko · Mo · Go | {n} B · KB · MB · GB |
| `embeds.heading` | SeriesEmbeds | — | Vidéos | Videos |
| `embeds.play` | SeriesEmbeds (lecteur d'écran) | `{label}` | Lire {label} | Play {label} |
| `filter.tags` | SeriesFilter | — | Tags | Tags |
| `filter.tagList` | SeriesFilter (`aria-label`) | `{tags}` | Tags : {tags} | Tags: {tags} |
| `filter.year` | SeriesFilter | — | Année | Year |
| `filter.allYears` | SeriesFilter | — | Toutes | All |
| `filter.location` | SeriesFilter | — | Lieu | Location |
| `filter.locationPlaceholder` | SeriesFilter | — | Filtrer par lieu… | Filter by location… |
| `filter.reset` | SeriesFilter | — | Réinitialiser | Reset |
| `filter.count` | SeriesFilter (client, pluriel sur `{shown}`) | `{shown}` `{total}` | {shown} série(s) affichée(s) sur {total} | {shown} series shown of {total} |
| `map.label` | SeriesMap | — | Carte géographique des séries | Map of the series |
| `map.empty` | SeriesMap | — | Aucune série avec coordonnées GPS. | No series with GPS coordinates. |
| `map.count` | SeriesMap (pluriel sur `{count}`) | `{count}` | {count} série(s) géolocalisée(s) | {count} geotagged series |

Fonctions exportées (pures, sans Astro) : `resolveLabels(locale?, overrides?)`, `formatLabel(template, params)`, `pluralLabel(forms, count, locale, params)`, `formatDate(date, locale, options?)`, `formatFileSize(bytes, locale, labels?)`. Types : `HyperfocaleLabels`, `HyperfocaleLabelKey`, `HfPluralForms`, `HeadingLevel`, `HyperfocaleInstanceProps`.

### Exemple — bouton de téléchargement sur un site multilingue (mathieu-drouet.com)

Un site anglais par défaut, en cinq langues (fr en es ja ko), au dark mode par classe `.dark` et à ses propres jetons, sans le thème du plugin (`theme: 'none'`). Le ZIP d'une série est produit par le site et servi depuis son bucket : c'est un `Attachment` comme un autre.

```astro
---
import SeriesAttachments from '@regrets/hyperfocale/components/SeriesAttachments.astro';
import type { Attachment, HyperfocaleLabels } from '@regrets/hyperfocale/components';

const { locale } = Astro.props; // 'en' | 'fr' | 'es' | 'ja' | 'ko'

// fr et en sont livrés ; les autres langues traduisent ce qu'elles affichent.
const labels: Partial<Record<string, Partial<HyperfocaleLabels>>> = {
  en: { 'attachments.heading': 'Download' },
  fr: { 'attachments.heading': 'Télécharger' },
  ja: { 'attachments.heading': 'ダウンロード' },
};

const zip: Attachment = {
  src: `/media/archives/${slug}/${slug}.zip`,
  kind: 'file',
  title: `${title} — full series`,
  size: 48_234_496,
};
---

<SeriesAttachments
  attachments={[zip]}
  locale={locale}
  labels={labels[locale]}
  headingLevel={3}
  class="mt-8"
  data-track="series-download"
/>
<!-- en : « Download », « 46.0 MB » · fr : « Télécharger », « 46,0 Mo » · ja : « ダウンロード », « 46.0 MB » -->
```

Et les jetons, mappés sur ceux du site (voir *Thème* pour la liste complète) :

```css
/* Sur l'élément qui porte .dark (ici <html>) : les var() sont résolues là où
   elles sont déclarées, donc la bascule .dark suit sans rien dupliquer. */
:root {
  --hf-color-text: var(--foreground);
  --hf-color-text-muted: var(--muted-foreground);
  --hf-color-surface: var(--card);
  --hf-color-border: var(--border);
  --hf-color-accent: var(--primary);
  --hf-color-on-accent: var(--primary-foreground);
  --hf-attachments-bg: var(--card);
  --hf-attachments-bg-hover: var(--accent);
  --hf-font-sans: var(--font-sans);
  --hf-card-radius: var(--radius);
}
```

### `<SeriesCard series={s} />`

Card d'aperçu : cover, titre, date, description.

| Prop | Type | Défaut | Description |
|------|------|--------|-------------|
| `series` | `Series` | — | Série à présenter |
| `prefix` | `string` | `/series` | Préfixe du lien |
| `headingLevel` | `1`–`6` | `2` | Niveau du titre de la carte |

### `<SeriesList series={arr} columns={3} />`

Grille responsive de `SeriesCard`.

| Prop | Type | Défaut | Description |
|------|------|--------|-------------|
| `series` | `Series[]` | — | Tableau de séries |
| `columns` | `number` | `3` | Nombre de colonnes |
| `prefix` | `string` | `/series` | Préfixe des liens |
| `headingLevel` | `1`–`6` | `2` | Transmis à chaque `SeriesCard` |

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

### `<SeriesAttachments attachments={att} heading="Documents" headingLevel={2} />`

Liste les documents joints non-image d'une série (vidéo, audio, PDF, fichiers). Alimenté par `getSeriesAttachments()`.

| Prop | Type | Défaut | Description |
|------|------|--------|-------------|
| `attachments` | `Attachment[]` | — | Documents joints résolus |
| `heading` | `string` | libellé `attachments.heading` | Titre de la section (prioritaire sur `labels`) |
| `headingLevel` | `1`–`6` | `2` | Niveau du titre de section |

Les tailles (`size`, en octets) s'affichent selon la locale : `2,4 Mo` en `fr`, `2.4 MB` en `en`.

### `<SeriesEmbeds embeds={emb} heading="Vidéos" headingLevel={2} />`

Rend les contenus embarqués d'une série (§1.11) **en façade** : le poster s'affiche, l'iframe n'est insérée qu'au clic. Alimenté par `getSeriesEmbeds()`.

| Prop | Type | Défaut | Description |
|------|------|--------|-------------|
| `embeds` | `Embed[]` | — | Contenus embarqués résolus |
| `heading` | `string` | libellé `embeds.heading` | Titre de la section (prioritaire sur `labels`) |
| `headingLevel` | `1`–`6` | `2` | Niveau du titre de section |

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

Les séries sont passées au script client dans un `<script type="application/json">` (avant la 0.23.0, ce JSON n'était pas rendu et le filtre restait inerte, #138). Un seul `SeriesFilter` par page : ses identifiants sont fixes.

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

### `getAllSeries(collectionName?)`

La collection **brute**, telle que la rend Astro : aucun filtre, aucun tri. Sections, brouillons et dépubliés compris.

Pour le consommateur qui a ses propres règles de visibilité, de tri ou de pagination et ne peut pas hériter de celles du plugin. Sans lui, il devrait appeler `getCollection()` en direct et réimplémenter le cache que ce module tient déjà.

```ts
const brut = await getAllSeries('series_fr');
const visibles = brut.filter((s) => !s.data.private);  // règle propre au site
```

> Le tableau rendu est celui du cache — ne pas le muter. Trier ou filtrer se fait sur une copie : `[...await getAllSeries()]`.

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

Classe un fichier selon son extension : `'video' | 'audio' | 'document' | 'file'`. Retourne `null` pour une image, pour un original (RAW, sidecar — §1.9, v2.11) ou pour `index.md`. Ne lève jamais d'erreur (extension inconnue → `'file'`). Synchrone.

```ts
classifyAttachment('interview.mp3'); // → 'audio'
classifyAttachment('01.jpg');        // → null (alimente la galerie, pas les pièces jointes)
classifyAttachment('DSCF0001.RAF');  // → null (original : ignoré, ni galerie ni pièce jointe)
```

### `isOriginal(filename)`

`true` si l'extension — ce qui suit le dernier point, en minuscules — appartient à la liste fermée des originaux (`ORIGINAL_EXTENSIONS`, exportée à la racine). Un original n'alimente ni la galerie, ni les pièces jointes, ni le fallback de couverture ; le glob des documents joints l'exclut avant le build, si bien qu'il n'est jamais copié dans `dist/`. L'exclusion du glob est insensible à la casse, comme la liste : Vite comparant à la casse près, chaque lettre y est une classe (`[rR][aA][fF]`), si bien que `.raf`, `.RAF` et `.Raf` sont tous trois écartés avant le build.

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

## Corpus hors de `src/content/` — `/loader` et `/media`

Les helpers ci-dessus trouvent `media/` et `images.json` par `import.meta.glob`, donc sous `src/content/` seulement, et dans le runtime Astro seulement. Un site dont le corpus vit ailleurs — un dossier public, un dossier matérialisé par l'ingestion — et dont les médias sont servis d'ailleurs (un bucket) emploie à la place deux sous-chemins qui ne dépendent ni de l'un ni de l'autre :

| Import | Rôle | Runtime |
|--------|------|---------|
| `@regrets/hyperfocale/loader` | `seriesLoader()` — loader Content Layer, repli de locale, préparation du frontmatter, exclusion des sections ; `fallbackField()`, `stringifyTags()` — préparations prêtes à l'emploi ; `readSeriesMedia()` — lit `images.json` et la liste de `media/` d'une série | Node (build) |
| `@regrets/hyperfocale/media` | `resolveSeriesMedia()` — galerie, couverture, documents joints, en fonction pure ; `IMAGE_EXTENSIONS`, `ORIGINAL_EXTENSIONS`, `isImagePath`, `isOriginal`, `classifyAttachment`, `parseImageManifest` | Partout : ni `node:*`, ni `astro`, ni `zod` |

### `seriesLoader(options)`

- **Découverte (§1.2)** : tout dossier de `base` qui porte un fichier index est une entrée, à toute profondeur — sections (§1.10), conteneurs et sous-séries (§1.8) compris. Jamais de descente dans `media/`, ni dans un dossier exclu (§4.2 : `.*`, `Thumbs.db`… plus vos règles `exclude`), ni à travers un lien symbolique. Identifiant : le chemin du dossier relatif à `base` (`music/concerts/2010/the-wombats-paris-2010`), `index` pour `base` lui-même ; `generateId` pour en décider autrement (une collision lève une erreur).
- **Repli de locale (Annexe F, stratégie 2)** : sans `locale`, chaque dossier fournit son `index.md` ; avec `locale: 'en'`, son `index.en.md`, sinon son `index.md` (`fallback: false` pour ne pas retomber). Une collection par locale donne la stratégie 3.
- **Frontmatter entier, validé** : tout le frontmatter passe à `parseData`, donc au schéma de la collection, sans liste blanche — un champ propre au site arrive dans `entry.data`, une entrée invalide fait échouer le build. Le frontmatter est lu par `parseFrontmatter` d'`astro/markdown`, le parseur de `glob()`.
- **Préparation (`prepare`)** : une fonction, ou une liste appliquée dans l'ordre, qui reçoit le frontmatter brut **avant** `parseData` et rend celui qui sera validé — voir ci-dessous.
- **Sections (§1.10)** : `sections: 'exclude'` écarte de la collection les `index.md` en `type: section`, avant `generateId`, `prepare` et `parseData`. Par défaut (`include`), elles y restent, comme avec `glob()`. Le discriminant est le seul `type` écrit dans le fichier : une série sans `date` reste une série — invalide.
- **Body** : `entry.body`, et rendu en HTML au chargement pour que `render(entry)` fonctionne (`render: false` pour s'en passer). En développement, toute modification d'un `.md` sous `base` recharge la collection.

| Option | Type | Défaut |
|--------|------|--------|
| `base` | `string \| URL` — relatif à la racine du projet, absolu, ou `file:` | — |
| `locale` | `string` — `[a-z]{2}(-[A-Z]{2})?` | aucune |
| `fallback` | `boolean` | `true` |
| `render` | `boolean` | `true` |
| `exclude` | `(string \| RegExp \| (path) => boolean)[]` — règles de §4.2 | `[]` |
| `generateId` | `({ path, file, data }) => string` | chemin du dossier |
| `prepare` | `SeriesPrepare \| SeriesPrepare[]` — `(frontmatter, ctx) => objet` (ou `Promise`) | aucune |
| `sections` | `'include' \| 'exclude'` | `'include'` |

#### Préparer le frontmatter avant la validation — `prepare`

Le schéma de la collection est le contrat du site ; il peut exiger plus que la spec (un identifiant pour des apps, une description pour le SEO). Tant que le corpus ne le respecte pas partout, `prepare` pose des replis **avant** `parseData` — et les dit, au lieu de laisser le build échouer ou les données disparaître en silence. Le jour où le corpus est corrigé, on retire le repli.

`ctx` porte :

| Champ | Contenu |
|-------|---------|
| `id` | identifiant de l'entrée (`generateId`, sinon le chemin du dossier) |
| `path` | dossier relatif à `base`, POSIX, NFC — `''` pour `base` |
| `slug` | dernier segment de `path` (§1.2) |
| `file` | fichier index lu (`index.md`, `index.en.md`) |
| `filePath` | ce fichier, relatif à la racine du projet — celui d'`entry.filePath` |
| `locale` | locale du fichier lu : `en` pour `index.en.md`, `undefined` pour `index.md`, même quand la collection en `en` s'y est repliée |
| `collectionLocale` | l'option `locale` de la collection |
| `warn(message)` | signale un repli ; les signalements de même message forment **un** avertissement en fin de chargement, avec le nombre d'entrées et leurs identifiants |

Une préparation qui lève, ou qui ne rend pas un objet, fait échouer l'entrée comme une entrée invalide : le chargement s'arrête sur un message qui nomme le fichier. Le cache en tient compte : une entrée est revalidée si son fichier **ou** son frontmatter préparé change.

Deux préparations courantes sont fournies :

| Préparation | Effet |
|-------------|-------|
| `fallbackField(field, value, { warn? })` | `field` absent — `undefined`, `null` ou chaîne vide — reçoit `value`, ou `value(frontmatter, ctx)` si c'est une fonction. Signalé (`warn: false` pour se taire, une chaîne pour un message propre). |
| `stringifyTags({ field?, warn? })` | En YAML, `tags: [2004]` est un entier : les nombres et booléens d'une liste de tags deviennent des chaînes, et c'est signalé. Une date ou un objet est laissé au schéma. |

### `resolveSeriesMedia({ frontmatter, manifest?, mediaFiles?, url? })`

Prend le frontmatter, le texte (ou la valeur) d'`images.json` et la liste des fichiers de `media/` ; ne lit rien. Rend `{ source, images, cover?, attachments, diagnostics }` :

- **`images`** — priorité `images:` du frontmatter > `images.json` > scan de `media/` (§1.5.1). Les deux listes écrites gardent leur ordre ; une entrée est une chaîne ou `{ url, alt?, width?, height? }`, l'URL étant absolue, absolue au site, ou relative au fichier index (`./media/01.jpg`, §1.5.1, v2.12 pour `images:`). Le scan ne prend que `media/` même — aucune récursion, les sous-séries ont leur propre `media/` (§1.8) —, dans l'ordre canonique (octets UTF-8, celui de `buildImagesManifest`), moins les vignettes d'embeds (§1.11). Un original (§1.9) n'y entre jamais.
- **`cover`** — `cover` du frontmatter, sinon la première image : la première entrée du manifeste quand il y en a un (§1.6, §1.5.1). Un `cover` qui ne désigne pas une image, ou qu'on sait absent, retombe sur ce défaut. Vers une sous-série (`./the-wombats/media/01.jpg`), il est rendu sans vérification.
- **`attachments`** — `files:` du frontmatter > clé `files` du manifeste > fichiers de `media/` ni images ni originaux, triés et enrichis par `attachments:` (§1.9).
- **`diagnostics`** — jamais d'exception : une anomalie devient un diagnostic aux codes et sévérités de §4.10 (`images-conflict`, `images-json-invalid`, `media-nested`, `cover-not-found`, `cover-not-image`, `attachment-not-found`), et la résolution continue avec le repli de la spec. Les corpus de fixtures de la spec sont rejoués par les tests : sur chaque série, ces diagnostics sont exactement ceux qu'attend la fixture de validation.

`url(path)` rend l'URL publiée d'un fichier local à partir de son chemin relatif au dossier de la série (`media/01.jpg`), NFC, non encodé ; défaut `./<path>`. Chaque image locale garde ce chemin dans `path`. Sans `mediaFiles` (`media/` inconnu, médias distants), rien n'est scanné et les références vers `media/` ne sont pas vérifiées.

### Exemple — corpus sous `public/content`, médias dans un bucket

C'est le cas de `mathieu-drouet.com` : `public/content` est un lien vers le dépôt de contenu, les archives existent en anglais (`index.en.md`) et en français (`index.md`, langue d'origine), et les médias sont servis par un Worker sous `/content/…` depuis R2. `images.json` y est la liste de ce que contient le bucket : il fait foi même quand `media/` est vide sur le disque du build.

Son contrat exige `series_id` (la clé primaire de ses apps iOS, tvOS et Android) et `description`, que des séries anciennes n'ont pas encore ; quelques-unes portent une année en tag (`- 2004`, un entier en YAML). Ses rubriques (`archives/music/index.md`, `type: section`) ont leur propre page et n'appartiennent pas à la collection des séries.

```ts
// src/content.config.ts
import { defineCollection, z } from 'astro:content';
import { baseSeriesSchema } from '@regrets/hyperfocale';
import { fallbackField, seriesLoader, stringifyTags } from '@regrets/hyperfocale/loader';

const schema = () =>
  baseSeriesSchema({ dateRequired: true }).safeExtend({
    series_id: z.string(),
    description: z.string(),
    artist: z.string().optional(),
  });

// Replis à retirer quand le corpus est corrigé à la source. Chacun produit un
// avertissement par build : « series_id absent — repli sur le nom du dossier
// (…) — 53 entrée(s) : music/concerts/2005/la-rumeur, … (+43) ».
const prepare = [
  fallbackField('series_id', (_, { slug }) => slug, {
    warn: 'series_id absent — repli sur le nom du dossier (un renommage changerait l\'identifiant des apps)',
  }),
  fallbackField('description', ''),
  stringifyTags(),
];

export const collections = {
  series: defineCollection({
    // index.en.md, sinon index.md ; rubriques écartées
    loader: seriesLoader({ base: 'public/content/archives', locale: 'en', sections: 'exclude', prepare }),
    schema,
  }),
  series_fr: defineCollection({
    loader: seriesLoader({ base: 'public/content/archives', sections: 'exclude', prepare }), // index.md
    schema,
  }),
};
```

Les rubriques se lisent alors à part — une seconde collection sur la même `base`, avec `sections: 'include'` et un filtre sur `type`, ou directement depuis le disque.

```astro
---
// src/pages/archives/[...slug].astro
import { getCollection, render } from 'astro:content';
import { readSeriesMedia } from '@regrets/hyperfocale/loader';
import { resolveSeriesMedia } from '@regrets/hyperfocale/media';

export async function getStaticPaths() {
  return (await getCollection('series')).map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}

const { entry } = Astro.props;
const { Content } = await render(entry);
const { images, cover, attachments, diagnostics } = resolveSeriesMedia({
  frontmatter: entry.data,
  // { manifest: texte d'images.json | null, mediaFiles: [{ name, size }] | null }
  ...(await readSeriesMedia(`public/content/archives/${entry.id}`)),
  // Clé publique d'un fichier local : celle du bucket, servie par le Worker.
  url: (path) => `/content/archives/${entry.id}/${path}`,
});
for (const d of diagnostics) console.warn(`[${entry.id}] ${d.code} : ${d.message}`);
---
```

Une entrée de manifeste absolue au site (`/content/archives/…/media/01.jpg`) est rendue telle quelle ; une entrée relative passe par `url`. Les noms de fichiers ne sont pas encodés : encodez dans `url` si vos clés le demandent. Hors d'un composant — un script de génération d'API, un Worker —, `resolveSeriesMedia` s'appelle de la même façon avec ce que vous avez lu du disque ou du bucket.

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

### Jetons

Depuis la 0.23.0, **aucun composant ne porte de couleur en dur** : toute couleur passe par un jeton `--hf-*` (vérifié par `tests/unit/tokens.test.ts`). Les longueurs (rayons, espacements, durées, police) gardent un repli dans le composant ; les couleurs n'en ont pas, et un jeton de couleur non défini laisse la propriété hériter (texte) ou rester transparente (fond).

| Jeton | Rôle | Défaut clair |
|-------|------|--------------|
| `--hf-color-bg` | Fond des champs (filtre) | `#ffffff` |
| `--hf-color-surface` | Fond des cartes, liens de documents, façades | `#f5f5f5` |
| `--hf-color-text` | Texte principal | `#111111` |
| `--hf-color-text-muted` | Texte secondaire (dates, tailles, légendes) | `#666666` |
| `--hf-color-accent` | Accent : focus, page courante, tag coché, marqueur | `#0066ff` |
| `--hf-color-on-accent` | Texte posé sur l'accent | `#ffffff` |
| `--hf-color-border` | Bordures, fond des vignettes en chargement | `#e0e0e0` |
| `--hf-color-overlay` | Fond de la lightbox, pastille de lecture | `rgba(0,0,0,.85)` |
| `--hf-color-text-overlay` | Texte et icônes sur l'overlay | `#ffffff` |
| `--hf-color-text-overlay-muted` | Compteur de la lightbox | `rgba(255,255,255,.75)` |
| `--hf-color-btn-overlay-hover` | Survol des boutons de la lightbox | `rgba(255,255,255,.15)` |
| `--hf-color-scrim` | Voile au survol d'une façade d'embed | `rgba(0,0,0,.15)` |
| `--hf-font-sans` | Police | `system-ui, …` |
| `--hf-gallery-gap` | Gouttière des grilles | `0.5rem` |
| `--hf-card-radius` | Rayon commun | `4px` |
| `--hf-card-shadow` | Ombre des cartes et des entrées du filtre | `0 2px 8px rgba(0,0,0,.08)` |
| `--hf-card-shadow-hover` | Ombre d'une carte survolée | `0 4px 16px rgba(0,0,0,.12)` |
| `--hf-transition` | Transition commune | `200ms ease` |
| `--hf-masonry-columns` | Colonnes de `SeriesMasonry` | `3` |
| `--hf-masonry-gap` | Gouttière de `SeriesMasonry` | `var(--hf-gallery-gap)` |
| `--hf-map-bg` | Fond de `SeriesMap` | `#d4dde8` |
| `--hf-map-stroke` | Contour de `SeriesMap` | `#b0bec5` |
| `--hf-map-marker` | Marqueur | `var(--hf-color-accent)` |
| `--hf-map-marker-hover` | Marqueur survolé | `#004db3` |
| `--hf-filter-bg` | Fond des contrôles du filtre | `var(--hf-color-surface)` |
| `--hf-filter-border` | Bordure des contrôles du filtre et de la carte | `var(--hf-color-border)` |
| `--hf-filter-radius` | Rayon des contrôles du filtre | `var(--hf-card-radius)` |
| `--hf-attachments-gap` | Marge au-dessus des documents | `2rem` |
| `--hf-attachments-radius` | Rayon des documents | `var(--hf-card-radius)` |
| `--hf-attachments-bg` | Fond d'un document (et d'un embed en lien) | `var(--hf-color-surface)` |
| `--hf-attachments-bg-hover` | Fond d'un document survolé | `var(--hf-color-border)` |
| `--hf-embeds-gap` | Marge au-dessus des embeds | `var(--hf-attachments-gap)` |
| `--hf-embeds-item-gap` | Écart entre deux embeds | `2rem` |
| `--hf-embeds-radius` | Rayon des embeds | `var(--hf-card-radius)` |
| `--hf-lineup-gap` | Écart du line-up (routes) | `3rem` |
| `--hf-lineup-heading-size` | Titre du line-up (routes) | `1.3rem` |

**Site à ses propres jetons et à son propre dark mode** (`theme: 'none'`, `.dark` par classe…) : déclarez les jetons `--hf-*` comme alias des vôtres, sur l'élément qui porte la classe de thème (`:root` si c'est `<html>`). Une `var()` se résout là où elle est déclarée : la bascule de vos jetons entraîne celle des `--hf-*` sans rien dupliquer. Exemple complet : *Composants → Exemple — bouton de téléchargement*. Rendez-vous au moins les jetons de couleur des composants que vous affichez — la lightbox, sans `--hf-color-overlay`, aurait un fond transparent.

### Couche data seule — `theme: 'none'`

Le thème part sur **toutes** les pages du site, pas seulement les routes injectées.
C'est voulu : un site qui rend `SeriesGallery` ou `SeriesLightbox` dans ses propres
pages en a besoin. `injectRoutes: false` ne le coupe donc pas — les deux options sont
indépendantes, et c'est l'usage des **composants** qui commande, pas celui des routes.

Un site qui n'utilise **ni les routes ni les composants** — schéma et helpers seulement,
pages entièrement maison — ne lit aucune des custom properties `--hf-*`. Elles
partaient malgré tout sur chacune de ses pages : mesuré sur un site réel à **1 643 octets,
29 % de son bundle CSS**, entièrement mort. Coupez-les :

```js
hyperfocale({
  injectRoutes: false,   // je câble mes propres pages
  theme: 'none',         // …et je n'affiche aucun composant du plugin
})
```

Gardez `theme: 'auto'` dès que vous rendez un composant du plugin — ou, en `theme: 'none'`,
mappez ses jetons sur les vôtres (voir *Jetons*) : sans l'un ni l'autre, il s'affichera sans couleurs.

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

### Vocabulaires du schéma

Les valeurs licites des champs contraints sont exportées par l'entrée racine — utiles pour construire un `<select>`, écrire un lint de contenu ou valider un import depuis un CMS :

```ts
import { CONTENT_TYPES, ATTACHMENT_KINDS, EMBED_PLATFORMS } from '@regrets/hyperfocale';

CONTENT_TYPES     // ['series', 'section']
ATTACHMENT_KINDS  // ['video', 'audio', 'document', 'file']
EMBED_PLATFORMS   // ['vimeo', 'youtube', 'dailymotion', 'soundcloud', 'bandcamp', 'spotify']
```

Les types correspondants suivent le même chemin : `ContentType`, `AttachmentKind`, `EmbedPlatform`, ainsi que `Attachment`, `Embed`, `SeriesData` et `SectionData`.

Importez-les depuis la **racine**, jamais depuis `@regrets/hyperfocale/helpers` : ce sous-chemin importe `astro:content` et n'est pas chargeable hors d'un runtime Astro — un script Node, un formulaire d'admin ou un test unitaire échouerait à l'import.

> `EMBED_PLATFORMS` est une liste **ouverte**, pas une contrainte : une plateforme absente reste licite au schéma et dégrade en lien dans `<SeriesEmbeds>`. La liste sert à reconnaître ce que le plugin sait jouer en façade, pas à refuser le reste.

---

## CLI

```bash
npx hyperfocale              # = npx hyperfocale init
npx hyperfocale init
npx hyperfocale validate <dossier> [--root <chemin>[:nodate]]… [--ignore <règle>]… [--astro-schema] [--json]
npx hyperfocale snapshot <dossier> [-o snapshot.json] [--ignore <règle>]… [--json]
npx hyperfocale diff <base.json> <target.json> [--json]
```

`init` reste la commande par défaut. Il crée ou met à jour `src/content.config.ts` dans le projet consommateur. Trois comportements :

1. **Fichier absent** → crée le fichier avec le template minimal
2. **Fichier existant sans `series`** → injecte l'import et l'entrée dans l'objet `collections`
3. **Collection déjà présente** → no-op (idempotent)

`validate`, `snapshot` et `diff` sont les commandes d'ingestion — voir [Ingestion](#ingestion). Codes de sortie : **0** ok, **1** au moins un diagnostic de sévérité `error`, **2** mauvais usage (commande, option ou argument invalide).

---

## Ingestion

Implémentation TypeScript de référence de la **couche 4 de la spec** (§4.1–4.13, introduite en 2.10-draft, projection publiable de la 2.11 comprise) : comment un corpus édité ailleurs — Dropbox, WebDAV, un disque — devient un **snapshot** complet et reproductible, se compare au dernier snapshot publié, se valide, puis se matérialise dans le dossier que lit Astro.

> **Astro-native, sans exception.** Le provider alimente un dossier ; le Content Layer lit ce dossier. Rien de ce module n'est chargé par l'intégration Astro, aucune requête de visiteur ne contacte un provider, et un site construit depuis la révision N fonctionne sans accès à la source. Changer de provider ne touche ni une page, ni un composant, ni une route.

```
source éditoriale ── provider ──► ContentSnapshot N+1 ── diffSnapshots ──► ContentChangeSet (contre N publié)
                                        validateSnapshot + guardChangeSet  (une erreur : rien n'est publié)
                                        materializeSnapshot ──► dossier du corpus ──► Content Layer ──► astro build
```

### Sous-chemins

| Import | Contenu | Runtime |
|---|---|---|
| `@regrets/hyperfocale/ingest` | types du contrat, `normalizePath`, `classifyPath`, `isExcluded`, `compareCanonical`, `computeSnapshotId`, `createSnapshot`, `parseSnapshot`, `publishable`, `isOriginalPath`, `isOriginalEntry`, `ORIGINAL_EXTENSIONS`, `applyDelta`, `diffSnapshots`, `validateSnapshot`, `guardChangeSet`, `summarizeChangeSet`, `buildImagesManifest`, `buildSeriesImagesManifest`, `declaresImages`, `waitForQuiescence`, `isPublicationTransition` | agnostique — WebCrypto, aucun `node:*` |
| `@regrets/hyperfocale/ingest/fs` | `FilesystemProvider`, `hashFile`, `hashBytes`, `materializeSnapshot` | Node |
| `@regrets/hyperfocale/ingest/dropbox` | `DropboxClient`, `DropboxProvider`, `verifyDropboxSignature`, `dropboxChallenge` | agnostique — `fetch` + WebCrypto, importable dans un Worker |
| `@regrets/hyperfocale/ingest/webdav` | `WebDAVProvider` | agnostique — `fetch` |

L'entrée racine n'importe rien de ces sous-chemins ; un test le vérifie sur les sources et sur `dist/`.

### Le contrat en bref

- **Snapshot** (§4.5) — liste complète des fichiers : chemins POSIX relatifs, NFC, triés par octets UTF-8 ; `kind` (`content`, `media`, `derived`, `other`) déduit du chemin ; empreintes `sha256`, `dropbox` ou `x-*`. Son `id` est le SHA-256 d'une ligne canonique par entrée : même état, mêmes algorithmes → même `id`, quelle que soit l'implémentation.
- **Incomplet ≠ suppression.** `createSnapshot` exige `complete` sans valeur par défaut ; un listing qui a raté une page est `complete: false`, et la validation comme la garde le rendent impubliable. `applyDelta` refuse un curseur expiré (`CursorResetError`) plutôt que de l'interpréter comme « tout a été supprimé ».
- **Changeset** (§4.7) — `added`, `modified`, `deleted`, `moved` ; les déplacements s'infèrent par `identity` puis par contenu, et un appariement ambigu n'en invente aucun.
- **Diagnostics** (§4.10) — comparés par triplet `code` + `severity` + `path`. Toute erreur interdit la publication automatique. La validation porte sur des **racines** (`roots: [{ path: 'series' }, { path: 'pages', dateRequired: false }]`) ; hors racines, les fichiers sont copiés, pas validés. Par défaut, la sortie est exactement celle de la spec — la même que toute autre implémentation. Avec `astroSchema: true` (`--astro-schema` en CLI), les champs sont en plus confrontés à `baseSeriesSchema` : ce que le build refuserait sans que le contrat le code remonte en `x-schema-invalid`.
- **Octets vérifiés** (§4.4) — tout ce qui est lu (validation, garde, matérialisation) est confronté à l'empreinte de l'entrée : un fichier qui a changé depuis le listing (`entry-hash-mismatch`) rend le snapshot impubliable. Une entrée `placeholder` (non téléchargée) ou `conflict` (copie conflictuelle) n'est jamais lue et bloque la publication.
- **Garde** (§4.11) — `guardChangeSet(changeSet, base, target, { read, policy })` applique des seuils fournis par le site : suppressions massives, déplacements massifs, fichier trop lourd. Toujours actives : snapshot incomplet ou vide, et série privée (`private: true` sur l'un de ses fichiers index) qui ne l'est plus dans target. La garde est *fail-closed* côté base : un fichier index illisible (non matérialisé, octets divergents, frontmatter illisible) y rend la série privée par prudence.
- **Originaux** (§1.9, §4.11, v2.11) — le snapshot d'une source garde ses RAW et sidecars ; le snapshot **publié** n'en a jamais. `publishable(target)` les retire (`id` recalculé) : c'est vers lui que va le diff de publication, c'est lui qu'on matérialise et qu'on enregistre. La validation porte sur `target` tel quel. La garde rapporte l'exclusion en `guard-originals-excluded` (`info`, champs `count` et `bytes`) et n'évalue `guard-oversize` que sur la projection : un RAW de 80 Mo ne bloque pas une publication dont il est exclu.
- **Manifeste dérivé** (§1.5.1, v2.12) — `images.json` est une donnée `derived` qu'un outil d'ingestion PEUT régénérer, mais il NE DOIT PAS en produire pour une série dont l'`index.md` porte `images:` : il violerait lui-même la règle d'exclusivité (`images-conflict`). `buildSeriesImagesManifest(snapshot, dir, { read, urlFor? })` lit le fichier index et rend `null` dans ce cas — ou quand le frontmatter est illisible ; sinon le manifeste de `buildImagesManifest`, qui, lui, ne lit pas le frontmatter.

### Providers

| Provider | Capacités | Particularités |
|---|---|---|
| `FilesystemProvider` | lecture/écriture locales, `sha256` + `dropbox` calculés | hachage en flux, dossiers exclus jamais parcourus ; lien symbolique écarté par défaut (`followSymlinks` pour suivre ceux qui restent sous `root`), erreur de lecture → `complete: false` avec le motif dans `problems` |
| `DropboxProvider` | lecture/écriture distantes, incrémental, identité stable, webhook, `dropbox` | OAuth avec ou sans secret (PKCE), retry 429/5xx avec `Retry-After` plafonné (`maxRetryWait`, 60 s), upload par session au-delà de 150 Mio, casse des dossiers reconstruite ; les erreurs ne recopient jamais le corps de la réponse |
| `WebDAVProvider` | lecture/écriture distantes, `x-etag` | PROPFIND `Depth: 1` récursif, ETag conservé tel que rendu par le serveur ; fichier sans taille → `complete: false` ; identifiants jamais dans une erreur |

Un pipeline ne suppose jamais une capacité absente : sans webhook, il réconcilie périodiquement ; sans incrémental, il relit le listing complet (`waitForQuiescence` compare alors des listings successifs).

Le webhook Dropbox n'est qu'un **déclencheur** : `dropboxChallenge(url)` répond à la vérification, `verifyDropboxSignature(rawBody, header, appSecret)` authentifie la notification. Le Worker qui les appelle ne lit jamais Dropbox.

### Orchestration minimale

```ts
import { readFile, writeFile } from 'node:fs/promises';
import { createSnapshot, diffSnapshots, guardChangeSet, parseSnapshot, publishable, validateSnapshot } from '@regrets/hyperfocale/ingest';
import { FilesystemProvider, materializeSnapshot } from '@regrets/hyperfocale/ingest/fs';
import { DropboxClient, DropboxProvider } from '@regrets/hyperfocale/ingest/dropbox';

const source = new DropboxProvider({
  client: new DropboxClient({ refreshToken: process.env.DROPBOX_REFRESH_TOKEN, appKey: process.env.DROPBOX_APP_KEY }),
  root: '/Mon site',
  ignore: ['_todo/'],
});
const corpus = new FilesystemProvider({ root: 'content' }); // le dossier que lit le Content Layer

// 1. Dernier état publié (versionné avec le site) et état courant de la source.
const base = parseSnapshot(await readFile('.hyperfocale/snapshot.json', 'utf-8'));
const listing = await source.list();
const target = await createSnapshot(listing.entries, {
  complete: listing.complete,
  source: { provider: 'dropbox', revision: listing.revision },
});

// 2. Diff, validation, garde : une seule erreur, et rien n'est publié.
//    Le diff va vers la projection publiable : les originaux (RAW, sidecars)
//    restent dans la source, jamais dans le site (§4.11).
const published = await publishable(target);
const changeSet = diffSnapshots(base, published);
const diagnostics = [
  ...(await validateSnapshot(target, { read: (path) => source.read(path), roots: [{ path: 'series' }] })),
  ...(await guardChangeSet(changeSet, base, target, {
    read: (side, path) => (side === 'base' ? corpus.read(path) : source.read(path)),
    policy: { maxDeletedSeries: 5, maxDeletedMediaRatio: 0.2 },
  })),
];
if (diagnostics.some((d) => d.severity === 'error')) throw new Error('publication refusée');

// 3. Matérialisation, puis le nouvel état publié. `astro build` lit `content/`
//    comme n'importe quel corpus Hyperfocale.
await materializeSnapshot(changeSet, { targetDir: 'content', read: (path) => source.read(path) });
await writeFile('.hyperfocale/snapshot.json', `${JSON.stringify(published, null, 2)}\n`);
```

#### Ce que garantit `materializeSnapshot`, et ce qu'il ne garantit pas

- **Confinement** : aucune écriture, suppression ni renommage hors de `targetDir`. Un chemin non conforme au §4.1 (`..`, `/` initial…) ou dont un composant sous `targetDir` est un lien symbolique — le fichier compris — lève `UnsafePathError` avant toute opération ; le contrôle est refait juste avant d'appliquer. `targetDir` lui-même peut être un lien : c'est le choix de l'appelant.
- **Tout ou rien à la lecture** : tout ce qui doit être écrit est lu et vérifié contre son empreinte (`sha256`, puis `dropbox`) *avant* la moindre modification. Une empreinte divergente (`ContentMismatchError`) ou une lecture en échec laisse le dossier intact.
- **Pas de perte** : une erreur d'entrée-sortie *pendant* l'application laisse le dossier à moitié à jour, mais conserve le dossier de transit (`.hyperfocale-materialize-…`), qui porte les fichiers lus et les sources des déplacements.
- **Rien hors du changeset** n'est supprimé ; les dossiers vidés sont retirés, jusqu'au premier qui ne l'est pas.
- **Non garanti** : l'exclusion d'un autre processus qui modifierait `targetDir` pendant l'opération. Le contrôle des liens réduit la fenêtre, il ne la ferme pas.

La réplication des médias vers un stockage objet, le déploiement et les redirections des séries déplacées (`summarizeChangeSet`) appartiennent au site.

### Conformité

Le module passe toutes les fixtures cross-language de la spec (`fixtures/ingestion/`), les mêmes que lit le CMS Swift : les **109 fixtures** de `izo/hyperfocale-spec main@18f48de` — 6 vecteurs de hash, 5 jeux de chemins, 7 identifiants, 26 snapshots de corpus, 44 validations, 15 diffs, 6 gardes —, rejouées par 119 tests (les 10 autres vérifient la présence et l'épinglage de la copie). Elles sont copiées à une ref épinglée sous `tests/fixtures/spec-ingestion/` :

```bash
npm run fixtures:sync -- --ref <ref>   # recopie les fixtures d'une ref de izo/hyperfocale-spec et l'épingle dans SOURCE
npm run fixtures:check                 # vérifie la copie octet pour octet contre le commit épinglé
```

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
