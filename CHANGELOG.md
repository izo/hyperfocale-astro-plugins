# Changelog

Toutes les modifications notables de ce projet sont documentées ici.

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/)
Versioning : [Semantic Versioning](https://semver.org/lang/fr/)

---

## [Non publié]

### Ajouté

- **Contenus embarqués (spec §1.11)** — le champ `embeds`, pour un média hébergé par une plateforme tierce et joué dans la page : Vimeo, YouTube, Dailymotion, SoundCloud, Bandcamp, Spotify. `url` est le seul champ requis ; `platform`, `id`, `title`, `description`, `poster`, `width` et `height` sont optionnels.

  Le plugin n'avait **aucune** notion de média hébergé ailleurs. `attachments[]` ne référence que des fichiers de `media/`, `files[]` n'a ni vignette ni dimensions, et `SeriesAttachments` rend un `<video>` natif — incapable de produire le lecteur d'un tiers. Un site portant de la vidéo devait donc étendre le schéma lui-même.

  - `getSeriesEmbeds(slug, series?)` résout les entrées dans l'ordre du tableau, sans tri, et calcule un `playable` : `platform` reconnue **et** `id` présent.
  - `<SeriesEmbeds>` les rend **en façade** — le poster s'affiche, l'iframe n'arrive qu'au clic. Onze lecteurs montés d'emblée plombent la page, et chacun dépose ses cookies avant qu'on ait demandé à voir la vidéo. La façade est un `<a href>` : sans JavaScript elle reste un lien fonctionnel, jamais un bouton mort.
  - La liste des plateformes est **ouverte**. Une valeur inconnue reste licite et dégrade en lien — un `z.enum()` ferait échouer un build sur du contenu que la spec tient pour valide.
  - La construction de l'URL de lecture vit dans le composant, pas dans le schéma : §1.11 ne fige aucun gabarit d'iframe, les hébergeurs changeant les leurs plus vite qu'une spec ne se réédite.

- **Un poster n'est pas une photo de la série.** Une image de `media/` désignée par `embeds[].poster` est désormais **exclue du scan de galerie**. C'est la seule exception au principe « toute image de `media/` alimente la galerie » : sans elle, une série de trois vidéos afficherait trois vignettes parasites, et une série qui n'est *que* de la vidéo se retrouverait avec une galerie faite de ses propres posters. L'exclusion ne porte que sur le scan — `images:` et `images.json` sont des listes écrites, ce qu'elles nomment est voulu.

### Rétro-compatibilité

Aucun changement cassant. `embeds` est un champ nouveau : aucun contenu existant ne le porte, donc aucune galerie ne change. L'exclusion des posters ne s'applique qu'aux séries portant un `embeds:`.

## [0.16.0] — 2026-08-12

Referme le point *Connu* de la 0.15.0 : l'option `theme` agit enfin sur l'apparence.

### Corrigé

- **`theme: 'light'` et `theme: 'dark'` n'avaient aucun effet** (#FE-012). Lève le point *Connu* de la 0.15.0 ci-dessous. `base.css` articule ses trois blocs sur `data-hf-theme`, attribut que **rien n'écrivait** ; `import.meta.env.HYPERFOCALE_THEME` était bien défini et lu nulle part. Tout site retombait donc sur le comportement `'auto'` : celui qui demandait `'light'` obtenait quand même le sombre sous `prefers-color-scheme: dark`.

  L'attribut est désormais posé par un script inline sur le stage `head-inline`, exécuté en synchrone dans le `<head>` — donc avant le premier paint, sans transition visible. Le poser en SSR aurait été plus direct et sans JavaScript, mais n'aurait couvert que le layout de repli interne : dès qu'un site passe son propre `layout`, ou rend `SeriesGallery` dans ses pages, le plugin ne rend plus le `<html>`. Or c'est le cas que le README recommande.

  `'auto'` et `'none'` n'émettent rien — le premier parce que le CSS nu se comporte déjà ainsi, le second parce qu'aucune feuille n'est servie. Sans JavaScript, on retombe sur `'auto'`, soit exactement le comportement d'avant ce correctif : la dégradation n'est pas une régression.

  Le CSS n'est pas touché : il était déjà écrit pour ces trois blocs, il lui manquait l'attribut qui les sélectionne.

### Rétro-compatibilité

Aucun changement cassant, mais **un changement de rendu** : un site qui passait `theme: 'light'` ou `theme: 'dark'` voyait jusqu'ici le comportement `'auto'`, et va désormais obtenir ce qu'il demandait. C'est la correction attendue ; elle reste visible.

---

## [0.15.0] — 2026-08-12

Le premier site à monter le plugin en **couche data seule** — schéma et helpers, pages entièrement maison — a montré que le thème partait quand même. Il peut désormais être coupé. Aucun changement cassant.

### Ajouté

- **`theme: 'none'`** — n'injecte aucune feuille de style. Le thème partait jusqu'ici sur **toutes** les pages du site, inconditionnellement : `injectScript('page-ssr', …)` était appelé hors du garde `injectRoutes`. Un site montant le plugin en couche data — schéma et helpers, pages entièrement maison, aucun composant du plugin rendu — embarquait donc les 30 custom properties `--hf-*` sur chacune de ses pages sans qu'une seule règle les lise. Mesuré sur `laurenceguenoun.com` : **1 643 octets, 29 % de son bundle CSS**, entièrement mort.

  Le correctif est une valeur d'opt-out, **pas** un garde sur `injectRoutes`. Les deux options restent indépendantes à dessein : un site peut parfaitement couper les routes injectées et rendre `SeriesGallery` ou `SeriesLightbox` dans ses propres pages — ceux-là ont besoin du thème. C'est l'usage des composants qui commande, pas celui des routes. Lier les deux aurait privé cet usage de ses styles, en silence.

  Non cassant : le défaut reste `'auto'`, et `'light'`/`'dark'`/`'auto'` injectent comme avant.

### Corrigé

- **La ligne de log annonçait un préfixe de routes inexistant.** Avec `injectRoutes: false`, « Initialisation hyperfocale (prefix: /series, …) » laissait croire que des routes étaient montées sous `/series`, alors qu'il n'en existait aucune. Le préfixe n'est désormais annoncé que s'il sert : `routes: /series` ou `routes: aucune`.

### Connu

- **L'option `theme` reste sans effet sur l'apparence.** `theme: 'light'` et `theme: 'dark'` ne changent rien : la valeur est posée dans `import.meta.env.HYPERFOCALE_THEME`, que rien ne lit, et aucun code n'écrit l'attribut `data-hf-theme` sur lequel `base.css` articule ses trois blocs. La feuille part toujours entière, donc le comportement est toujours celui d'`auto`. Cette version n'y touche pas — le corriger change ce qui est servi aux sites existants, ce qui relève d'un correctif de comportement à part entière. `'none'`, lui, agit bien : il ne s'agit pas de choisir un thème mais de n'en injecter aucun.

### Rétro-compatibilité

Aucun changement cassant. Le défaut reste `'auto'` ; `'light'`, `'dark'` et `'auto'` injectent la feuille exactement comme avant. Un site qui ne passe pas `theme` ne voit aucune différence, hormis une ligne de log plus exacte.

**Mise en garde de mesure** : sur un site où la coupure fait passer une feuille sous le seuil d'inlining d'Astro (4 ko), celui-ci se met à la recopier dans chaque page — l'économie peut se retourner en surcoût. Observé sur `laurenceguenoun.com` : **+40 040 octets** au total, jusqu'à ce que `build.inlineStylesheets: 'never'` rétablisse la feuille partagée. Vérifiez le poids produit après la bascule, pas seulement les octets retirés.

---

## [0.14.0] — 2026-08-12

Les onze profils de l'Annexe G sont couverts, et le dernier écart de fond entre les presets et l'annexe est refermé. Aucun changement cassant.

### Ajouté

- **Les cinq profils manquants de l'Annexe G** ([#60](https://github.com/izo/hyperfocale-astro-plugins/issues/60)) : `event` (`events`, `/evenements`, daté), `app` (`apps`, `/applications`), `book` (`books`, `/livres`), `place` (`places`, `/lieux`), `screen` (`screens`, `/ecrans`). Les onze profils de l'annexe sont désormais couverts. `collectionName` et `dateRequired` sont ceux de l'annexe ; seuls les préfixes sont localisés en français, comme les six premiers. Le bloc d'extension propre à chaque profil (`book:`, `place:`…) traverse le schéma sans validation — sa forme est décrite par l'annexe, pas contrainte par le plugin.

### Corrigé

- **Le preset `music` refusait une sortie non datée** ([#62](https://github.com/izo/hyperfocale-astro-plugins/issues/62)). `src/presets.ts` portait `dateRequired: true` depuis la 0.8.0, là où l'Annexe G.8 de la spec déclare la date de sortie **optionnelle** — « démos et sorties non datées restent valides ». Un site configuré `preset: 'music'` cassait donc au build sur un contenu que la spec tient pour valide, et que `hyperfocale-cms` produit. C'était le dernier écart de fond entre les presets et l'annexe. La spec fait foi : le plugin s'aligne. Relâcher une obligation n'est pas cassant — tout contenu qui passait continue de passer.

### Déprécié

- **`published: boolean`** ([#61](https://github.com/izo/hyperfocale-astro-plugins/issues/61)). `published: false` fait exactement ce que fait `draft: true`, en logique inverse : deux façons d'écrire la même chose, dont une seule est standardisée par la spec (§1.3). §0.5 relevait la redondance depuis la v2.1 en la laissant « à arbitrer » ; c'est `draft` qui reste.

  Le champ continue de fonctionner à l'identique — aucun site ne casse. Un build qui rencontre une série `published: false` l'annonce **une fois**, en nommant les séries concernées : le message part du chemin caché de `getCollection`, pas des filtres, sans quoi il se répéterait à chaque page générée. `published: true` reste muet, Zod appliquant ce défaut de toute façon — un `true` écrit n'est plus distinguable d'un champ absent.

  L'option `querySeries({ published })` suit le même sort. Retrait des deux en 1.0.

  Migration : remplacer `published: false` par `draft: true`, supprimer les `published: true` — ils ne faisaient rien.

### Rétro-compatibilité

Aucun changement cassant. `music` relâche une obligation — tout contenu qui passait passe encore ; `published` est déprécié, pas retiré ; les cinq profils ajoutés n'affectent aucun preset existant.

---

## [0.13.0] — 2026-08-04

### Corrigé

- **`images[]` acceptait moins de formes que les helpers n'en traitent** (gap M3). `getSeriesImages()` gère trois formes d'entrée — `url` (mode distant §1.5), `file` (média local référencé par nom), `src` (asset déjà traité par `image()`) — mais le schéma ne validait que la première. Une entrée `{ file: '01.jpg' }` était donc **rejetée par Zod avant d'atteindre le helper qui savait la lire** : la fonctionnalité existait sans être atteignable. Le champ accepte désormais une union des trois formes, mélangeables dans un même tableau. `url` reste la seule forme normative et vient en premier ; les deux autres sont documentées comme des extensions du plugin.

### Vérifié

- **Cover de conteneur traversant un sous-dossier** (gap M4, spec §1.8) : le demo-site porte un `cover: "./set-aurore/media/01.png"`, dérogation explicite au « pas de récursion dans `media/` » de §1.6. Trois rapports de conformité successifs avaient noté ce point « plausible mais non exercé » ; il est maintenant couvert par un test e2e, lui-même validé par mutation — retirer le `cover` le fait échouer, sans quoi il serait passé sur le repli.

Avec ces deux points, la matrice de conformité ne contient plus ni ❌ ni ❓.

### Rétro-compatibilité

Aucun changement cassant : l'union élargit ce que le schéma accepte, elle ne retire rien. Un frontmatter valide en 0.12.0 le reste.

---

## [0.12.0] — 2026-08-04

### Ajouté

- **Line-up des sous-séries** (spec §1.8, gap H2) : `getSubSeries(containerId)` retourne les sous-séries d'une série conteneur, et la page de détail les affiche automatiquement. C'était la dernière fonctionnalité *positivement absente* du rapport de conformité — aucune fonction ne reliait un conteneur à ses sous-séries. Le helper ne retient que les entrées situées **exactement un segment plus bas** : §1.8 limite l'imbrication à un niveau, et `archives/music/concerts/<slug>/` est une série *rangée* (§1.2), pas une sous-série de quatrième niveau. Tri par `lineup_order` croissant, date décroissante à défaut ; le champ est ajouté au schéma. Deux tokens `--hf-lineup-gap` et `--hf-lineup-heading-size`.
- **Option `imageOptimization`** (`'auto' | 'disabled'`, gap ARCH-004) : `'disabled'` sert les fichiers d'origine sans passer par `astro:assets`, pour un site dont les images sont déjà optimisées en amont. Les dimensions restent transmises au HTML — les omettre échangerait un problème d'optimisation contre des décalages de mise en page.
- **`getCollectionFetchCount()`** et le flag `HYPERFOCALE_DEBUG_CACHE=1` (gap ARCH-005) : comptent les appels réels à `getCollection`. La mesure sur un build de **126 séries produisant 127 pages donne un seul appel** — le cache module-level survit à l'ensemble du build SSG. Le `warmSeriesCache()` que la carte envisageait aurait été du code mort ; il n'est pas ajouté.
- **Documentation de l'option `preset`** : elle existait depuis la 0.8.0 sans figurer dans le README. La table des six profils y est ajoutée, avec la raison des préfixes francisés (§2.0.1 : la colonne `prefix` de l'Annexe G est une recommandation).

### Changé

- **Le preset canonique s'appelle `series`** (gap H1), nom standardisé par l'Annexe G de la spec — il s'appelait `photo`, si bien qu'un site suivant la documentation de la spec ne trouvait pas le preset qu'elle nomme. C'était le dernier écart de vocabulaire relevé par §0.5.
- **Le `srcset` haute densité est omis en développement.** Quand un site délègue l'optimisation à son hébergeur (Vercel, Netlify, Cloudflare), les URLs générées pointent vers un endpoint inexistant en local : chaque variante répondait 404. Le rendu de production est inchangé.

### Corrigé

- **`cover` avec `imageOptimization: 'disabled'`** tombait sur la branche placeholder de `<SeriesCard>`, l'image de repli n'étant calculée que lorsque `cover` est absent. Une branche explicite sert le `cover` en `<img>` brut.

### Rétro-compatibilité

`photo` reste accepté comme alias de `series`, avec un avertissement au build, et sera retiré en 1.0 : renommer un vocabulaire ne justifie pas de casser les sites existants du jour au lendemain. Aucun autre changement cassant — les défauts reproduisent le comportement 0.11.0.

---

## [0.11.0] — 2026-08-04

### Ajouté

- **`pageSize` dans `PaginationResult<T>`** (spec §3.2, gap M1) : `paginateImages()` retourne désormais la taille de page effective, aux côtés de `items`, `totalPages` et `currentPage`. Le type `PaginatedImages` de la spec la porte ; un consommateur qui n'avait pas conservé la valeur passée devait la redéduire pour calculer l'index absolu d'une image ou dimensionner un squelette de chargement. Gap signalé dans trois rapports de conformité consécutifs — juin, juillet, août.

### Rétro-compatibilité

Aucun changement cassant. L'ajout d'une propriété au résultat n'affecte pas le code qui le lit ; seul un code qui *implémenterait* `PaginationResult<T>` à la main serait concerné, cas improbable pour un type de retour.

---

## [0.10.0] — 2026-08-04

### Ajouté

Manifeste d'images externalisé — implémentation de la spec Hyperfocale **v2.6-draft §1.5.1** (#SPEC-002, gap critique C2 de l'audit du 2026-07-27) :

- **`images.json` à côté d'`index.md`** pilote la galerie. Priorité : `images:` du frontmatter > `images.json` > scan de `media/`. L'ordre du tableau fait foi — le tri alphabétique de §1.6 ne s'applique pas, un manifeste étant une donnée ordonnée et non un scan.
- **Formes courte et longue** : une entrée chaîne équivaut à `{ "url": <chaîne> }` ; la forme objet accepte les clés d'une entrée `images:` (`url`, `alt`, `width`, `height`).
- **Résolution des trois formes d'URL** : absolue (`https://…`), absolue au site (`/…`), ou relative à `index.md` (`./media/01.jpg`). Seule la dernière désigne un asset local : elle est résolue via le glob, donc optimisée par Astro avec ses dimensions réelles.
- **Clé `files` optionnelle** : alimente `getSeriesAttachments()` avec les mêmes entrées qu'en §1.9 mode distant. `images.json` est lui-même exclu des documents joints — c'est un fichier de métadonnées, au même titre qu'`index.md`.
- **Couverture** : `cover` du frontmatter, sinon la première entrée du manifeste (et non la première par ordre alphabétique).
- **`parseImageManifest()`** exporté, avec les types `ImageManifest` et `ManifestImage`.
- **Tests** : `tests/unit/manifest.test.ts` (15 cas) et 6 cas e2e — le demo-site porte `manifeste-2024/`, dont le manifeste ordonne les images 03/01/02, à rebours de l'alphabétique.

Le manifeste est chargé en `?raw` puis parsé dans un `try`, et non importé comme JSON : un import ferait échouer Vite au parsing **avant** tout `catch`, alors que §1.5.1 impose un repli sur `media/` sans jamais casser le build. JSON illisible, clé `images` absente ou non-tableau : repli silencieux, avertissement en console.

Les trois modes étant exclusifs par série, une série portant à la fois un `images:` et un `images.json` déclenche un avertissement — le frontmatter l'emporte.

### Rétro-compatibilité

Aucun changement cassant. Une série sans `images.json` conserve exactement le comportement 0.9.0.

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
