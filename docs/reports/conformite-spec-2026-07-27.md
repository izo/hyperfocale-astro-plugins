# Rapport de conformité spec↔code — `@izo/hyperfocale` v0.8.0

**Date** : 2026-07-27
**Spec auditée** : Hyperfocale v2.6-draft (révision 2026-07-26)
**Plugin audité** : `@izo/hyperfocale` v0.8.0 (`package.json:3`)
**Rapport précédent** : `docs/reports/conformite-spec-2026-06-24.md` — spec v2.4-draft / plugin v0.4.0
**Périmètre** : §0 (contrat minimum), §1.2 (profondeur de rangement, delta v2.6), §1.3 (frontmatter), §1.5 (mode distant), §1.5.1 (manifeste `images.json`, nouveau v2.6), §1.6 (règles métier), §1.8 (séries imbriquées), §1.9 (documents joints, v2.5), §1.10 (page d'index de section, nouveau v2.6), §2.0 (contrat d'adaptateur), §2.0.1 (presets de domaine), §2.1 (adaptateur Astro), §3.1/§3.2/§3.3 (composants UI, types, interactions)
**Mode** : read-only sur `src/` et `tests/` — seule écriture : ce rapport

**Légende des statuts** : ✅ Conforme · 🟡 Partiel · ❌ Absent · ⚠️ Déviant (implémenté mais non aligné sur la spec) · ❓ Non vérifiable (aucun test / démo ne l'exerce, jugement basé sur lecture de code uniquement)

---

## 1. Score global de conformité

| Périmètre | Total | ✅ | 🟡 | ❌ | ⚠️ | ❓ |
|-----------|-------|----|----|----|----|----|
| §2.0 Contrat d'adaptateur (MUST) | 11 | 9 | 0 | 2 | 0 | 0 |
| §2.0.1 Presets de domaine (COULD) | 1 | 0 | 0 | 0 | 1 | 0 |
| §2.1 Adaptateur Astro | 6 | 5 | 1 | 0 | 0 | 0 |
| §1.2 Profondeur de rangement (v2.6) | 1 | 0 | 0 | 0 | 0 | 1 |
| §1.3 Frontmatter (core + workflow + IPTC) | 24 | 23 | 0 | 1 | 0 | 0 |
| §1.5 Mode distant | 4 | 4 | 0 | 0 | 0 | 0 |
| §1.5.1 Manifeste `images.json` (v2.6) | 5 | 0 | 0 | 5 | 0 | 0 |
| §1.6 Règles métier | 11 | 11 | 0 | 0 | 0 | 0 |
| §1.8 Séries imbriquées | 6 | 2 | 0 | 1 | 0 | 3 |
| §1.9 Documents joints (v2.5) | 9 | 9 | 0 | 0 | 0 | 0 |
| §1.10 Page d'index de section (v2.6) | 6 | 0 | 0 | 6 | 0 | 0 |
| §3.1 Composants UI | 7 | 7 | 0 | 0 | 0 | 0 |
| §3.2 Types partagés | 4 | 2 | 2 | 0 | 0 | 0 |
| §3.3 Interactions requises | 5 | 5 | 0 | 0 | 0 | 0 |
| **TOTAL** | **100** | **77** | **3** | **15** | **1** | **4** |

**Score global : 77 % conformes (77/100)** — 78,5 % si les 🟡 comptent à 50 % et les ❓ sont exclus du calcul.

### Comparaison au rapport du 24/06/2026

Le rapport précédent portait sur un périmètre plus étroit (60 exigences, pas de §1.9/§1.10/§1.5.1/§1.2, pas de §3.1 complet) et affichait **70 % (42/60)**. Les deux scores ne sont pas directement comparables terme à terme (le dénominateur a changé avec les nouvelles sections v2.5/v2.6), mais sur le périmètre **commun** :

| Sous-périmètre commun | 24/06 (v0.4.0) | 27/07 (v0.8.0) | Évolution |
|---|---|---|---|
| §2.0 Contrat d'adaptateur | 8/8 ✅ | 9/11 ✅ (2 nouvelles obligations v2.6 absentes) | ↔ sur le socle v2.4, nouveau retard sur v2.6 |
| §2.0.1 Presets | 🟡 partiel (non exposé) | ⚠️ déviant (exposé mais vocabulaire non conforme) | changement de nature du gap, pas résolu |
| §1.6 Règles métier | 5/6 (fallback cover manquant) | 11/11 | **progrès** — H4 corrigé |
| §1.8 Séries imbriquées | 0/5 ❌ | 2 ✅ / 1 ❌ / 3 ❓ | **progrès net**, mais incomplet et non vérifié |
| §3.1 Composants UI | 4/6 | 7/7 | **progrès** — `SeriesMap`, `SeriesFilter`, `SeriesAttachments` livrés |
| §3.2 Types partagés | 3✅/1🟡 (sur 4, `alt` manquant) | 2✅/2🟡 (sur 4, `alt` corrigé, `pageSize` toujours absent) | **progrès partiel** |
| §3.3 Interactions | 4/5 (swipe absent) | 5/5 | **progrès** — H1 corrigé |
| Route `series-page.astro` API dépréciée | ⚠️ `series.render()` | ✅ `render(series)` | **progrès** — M6 corrigé |

**Nouveaux gaps introduits par la spec v2.5/v2.6, absents du rapport précédent car hors périmètre à l'époque** : §1.10 (page d'index de section, 0/6), §1.5.1 (manifeste `images.json`, 0/5). Ces deux gaps sont **Critiques** au sens MUST (§2.0 les liste explicitement comme obligations de conformité v2.6).

---

## 2. Matrice de conformité détaillée

### §0 — Contrat minimum d'un lecteur Hyperfocale

| Obligation (§0, DOIT) | Fichier impl | Statut | Note |
|---|---|---|---|
| Parser le frontmatter YAML | Astro content layer (`glob()` loader) | ✅ | Délégué à Astro |
| Exiger `title`+`date`, ignorer champs inconnus | `src/schema.ts:85-86`, `z.looseObject` | ✅ | |
| Scanner `media/` trié alpha, séparer images / documents joints | `src/helpers/index.ts:136-146` (images), `:204-211` (attachments) | ✅ | |
| `cover` ou 1ère image comme couverture, jamais un document joint | `src/components/SeriesCard.astro:20`, `src/helpers/index.ts:344-347` (`getSeriesCover`) | ✅ | `getSeriesImages` ne retourne jamais un fichier non-image |
| Exclure `draft: true` des listings publics | `src/helpers/index.ts:60-64` | ✅ | |
| Rendre le body Markdown | `src/routes/series-detail.astro:41,64` | ✅ | `render(series)` — API Astro 6/7 correcte |
| Ne jamais échouer sur un type de fichier inconnu dans `media/` | `src/helpers/index.ts:164-172` (`classifyAttachment`) | ✅ | Toute extension inconnue tombe dans la classe `file` |
| Ne pas traiter comme une série un `index.md` `type: section` (§1.10) | Aucun — pas de champ `type` dans `src/schema.ts` ni `src/index.ts` | ❌ | Voir §1.10 ci-dessous. **Risque de régression** : avec `dateRequired: true` (défaut), un `index.md` `type: section` sans `date` provoque un échec de validation Zod au build, pas seulement une mauvaise classification |

**7/8 obligations du contrat minimum satisfaites.** Le point 8 (introduit v2.6) est la seule absence, mais elle est plus grave qu'une simple non-conformité : elle peut **casser le build** d'un site consommateur qui adopte le pattern `type: section` documenté par la spec.

---

### §2.0 — Contrat d'adaptateur (MUST)

| Obligation spec | Fichier impl | Statut | Note |
|---|---|---|---|
| Lire `title`, `date`, `description`, `cover`, `location`, `draft`, `lang` | `src/schema.ts:85-93` | ✅ | |
| Ignorer les champs inconnus (passthrough) | `src/schema.ts:84` (`z.looseObject`) | ✅ | |
| Transmettre `iptc.*` et champs supplémentaires | `src/schema.ts:17-33,97` | ✅ | |
| Scanner `media/` (glob alphabétique) | `src/helpers/index.ts:136-146` | ✅ | |
| Exposer les documents joints (§1.9, conformité v2.5) | `src/helpers/index.ts:180-221` (`getSeriesAttachments`), `src/components/SeriesAttachments.astro` | ✅ | Voir détail §1.9 |
| Supporter le mode distant (`images[]`/`files[]`) | `src/helpers/index.ts:97-147`, `:184-192` | ✅ | |
| Distinguer les sections (`type: section`, conformité v2.6) | — | ❌ | Aucune trace de `type` dans `src/schema.ts`, `src/index.ts` ou `src/helpers/index.ts` |
| Supporter le manifeste `images.json` (§1.5.1, conformité v2.6) | — | ❌ | `grep -rn "images.json"` sur `src/` : aucun résultat |
| Respecter `draft` | `src/helpers/index.ts:60-64` | ✅ | |
| Trier par date desc | `src/helpers/index.ts:65-69` | ✅ | |
| Exposer le body | `src/routes/series-detail.astro:41,64`, `src/routes/series-page.astro:66` | ✅ | Les deux routes utilisent désormais `render(series)` (l'API dépréciée `series.render()` relevée en juin a disparu) |

**9/11 obligations MUST satisfaites.** Les deux absences (`type: section`, `images.json`) sont exactement les deux nouvelles obligations de conformité v2.6 — le plugin est à jour sur v2.5 (documents joints) mais pas sur v2.6.

---

### §2.0.1 — Presets de domaine (COULD, mais évalué explicitement à la demande)

Le plugin **implémente** le mécanisme de preset depuis la 0.8.0 (`src/presets.ts`, option `preset` dans `HyperfocaleOptions` — `src/index.ts:19-25`), ce qui referme le gap « non exposé » du rapport de juin. Mais le contenu dévie fortement de ce que documente la spec.

#### Priorité des options explicites — ✅ conforme

`src/index.ts:119,122,123` :
```ts
const rawPrefix = options.prefix ?? preset?.prefix ?? '/series';
const collectionName = options.collectionName ?? preset?.collectionName ?? 'series';
const dateRequired = options.dateRequired ?? preset?.dateRequired ?? true;
```
Toute option explicite l'emporte sur le preset, qui l'emporte sur le défaut — conforme à « Toute option fournie explicitement l'emporte sur la valeur du preset » (spec, exemple §2.0.1).

#### Contraintes structurelles — ✅ conformes

`src/presets.ts:3-7` (`PresetConfig`) ne porte que `collectionName`, `prefix`, `dateRequired` — aucun champ core n'est renommé, aucun preset ne supprime `title` (`src/schema.ts:85` reste inconditionnel), aucun preset ne touche au slug. Conforme aux interdits de §2.0.1 (« NE DOIT PAS renommer les champs core / modifier le slug regex / supprimer une obligation »).

#### Vocabulaire des presets — ⚠️ déviant

| Preset spec (Annexe G) | Preset plugin | Correspondance |
|---|---|---|
| `series` (canonique) | `photo` | ⚠️ nom différent — `PRESETS.photo` (`src/presets.ts:10`) a les mêmes valeurs (`collectionName: 'series', prefix: '/series', dateRequired: true`) mais un nom absent de la spec |
| `event` | — | ❌ absent |
| `recipe` | `recipe` | ⚠️ nom identique, **valeurs différentes** : spec = `collection 'recipes', prefix /recipes` (§G.2, ligne `hyperfocale({ preset: 'recipe' })`) ; plugin (`src/presets.ts:15`) = `collectionName: 'recipes', prefix: '/recettes'` — préfixe francisé, non conforme à l'exemple normatif |
| `app` | — | ❌ absent |
| `book` | — | ❌ absent |
| `place` | — | ❌ absent |
| `screen` | — | ❌ absent |
| — | `portfolio`, `music`, `catalog`, `press` | Presets propres au plugin, sans équivalent dans l'Annexe G |

Confirmé par le test `tests/unit/presets.test.ts:5-56`, qui fixe explicitement `PRESETS.recipe.prefix === '/recettes'` et la liste `photo/portfolio/music/catalog/press/recipe` — ce n'est pas un oubli, c'est le comportement voulu et testé.

**Verdict** : le mécanisme de presets (§2.0.1) est structurellement conforme, mais **aucun des 6 presets exposés ne reproduit fidèlement un profil de l'Annexe G**, y compris le seul nom partagé (`recipe`), dont le préfixe diverge de l'exemple normatif de la spec. Un site qui suit la doc spec telle quelle (`hyperfocale({ preset: 'recipe' })` en attendant `/recipes`) obtiendrait `/recettes` avec ce plugin. C'est une **déviation**, pas une simple absence — à distinguer du jugement « partiel » du rapport de juin, qui portait sur l'absence pure et simple du mécanisme.

---

### §2.1 — Adaptateur Astro (spécifique)

| Exigence spec | Fichier impl | Statut | Note |
|---|---|---|---|
| Collection enregistrée via API Astro Content Layer | `src/index.ts:242-291` (module virtuel), loader `glob()` | ✅ | |
| Route `/<prefix>/` | `src/index.ts:193-199`, `src/routes/series-list.astro` | ✅ | Désactivable via `listRoute: false` (extension) |
| Route `/<prefix>/[slug]/` | `src/index.ts:201-205`, `src/routes/series-detail.astro` | ✅ | Pattern `[...slug]` (catch-all), pas `[slug]` — voir §1.2/§1.8 |
| Route `/<prefix>/[slug]/[page]/` | `src/index.ts:207-211`, `src/routes/series-page.astro` | ✅ | |
| Composants `SeriesCard/List/Gallery/Lightbox` (+ `SeriesAttachments` depuis v2.5) exposés | `src/components/*.astro`, `package.json:29-36` (exports map par fichier) | ✅ | Tous présents, plus `SeriesMap`/`SeriesFilter`/`SeriesMasonry` en bonus |
| Import path `hyperfocale/astro/components` | `package.json:28-36` | 🟡 | Toujours `@izo/hyperfocale/components/<Nom>.astro`, pas `hyperfocale/astro/components` — écart de nommage de package inchangé depuis juin |

**5/6 ✅, 1/6 🟡** — inchangé depuis le rapport de juin sur ce point précis.

---

### §1.2 — Profondeur de rangement *(clarifié v2.6)*

| Obligation spec | Fichier impl | Statut | Note |
|---|---|---|---|
| Découverte des séries par parcours **récursif** de `<content-root>` | `src/index.ts:272` : `glob({ pattern: '**/index.{md,mdx}', base: './src/content/${collectionName}' })` | ❓ | Le pattern `**` est récursif par construction (loader `astro/loaders`), ce qui est architecturalement conforme à l'exigence. **Non vérifié empiriquement** : aucun contenu du `examples/demo-site` (`bretagne-2024`, `islande-2023`, `tokyo-automne`, `chateau-bellevue`, `maison-leda` — tous à un seul niveau) ni aucun test (`tests/e2e/routes.test.ts`, `tests/unit/helpers.test.ts`) n'exerce un dossier rangé à 2+ niveaux de profondeur. Je ne peux donc pas confirmer que le `id` généré par le loader correspond au chemin relatif complet (identité par chemin, spec §1.2) plutôt qu'au seul nom de dossier. |
| Slug = dernier segment, chemin = clé de routage | `src/routes/series-detail.astro:8-14` (`params: { slug: s.id }`) sur route `[...slug]` | ❓ | Cohérent avec le comportement documenté du loader `glob()` d'Astro (id = chemin relatif sans extension), mais même réserve que ci-dessus — non testé dans ce dépôt |

Recommandation : ajouter un cas de test e2e avec une série rangée à 2+ niveaux (`series/archives/music/concerts/<slug>/`) pour lever cette incertitude, qui conditionne aussi la conformité de facto de §1.8 (voir plus bas).

---

### §1.3 — Frontmatter : champs du schéma Zod

#### Core + workflow

| Champ spec | Requis spec | Présent impl | Type impl | Conforme |
|---|---|---|---|---|
| `title` | oui | ✅ `schema.ts:85` | `z.string()` | ✅ |
| `date` | oui (configurable) | ✅ `schema.ts:86` | `z.coerce.date()` (opt. si `dateRequired: false`) | ✅ |
| `description` | non | ✅ `schema.ts:87` | `z.string().optional()` | ✅ |
| `cover` | non | ✅ `schema.ts:121` (`seriesSchema`) | `image().optional()` | ✅ |
| `location` | non | ✅ `schema.ts:88` | `z.string().optional()` | ✅ |
| `draft` | non, défaut `false` | ✅ `schema.ts:91` | `z.boolean().default(false)` | ✅ |
| `lang` | non | ✅ `schema.ts:89` | `z.string().optional()` | ✅ |
| `featured` | non, défaut `false` | ✅ `schema.ts:92` | `z.boolean().default(false)` | ✅ |
| `tags` | non | ✅ `schema.ts:93` | `z.array(z.string()).default([])` | ✅ |
| `type` (`series`\|`section`, défaut `series`) *(introduit v2.6)* | non | ❌ | Absent de `src/schema.ts` et du module virtuel `src/index.ts:273-289` | ❌ — voir §1.10 |

**9/10.**

#### Extension IPTC — inchangé, toujours complet

Les 14 champs IPTC (`creator`, `credit`, `copyright`, `keywords`, `city`, `province`, `country`, `country_code`, `camera`, `lens`, `film`, `headline`, `instructions`, `source`, `gps`) sont tous présents dans `iptcSchema` (`src/schema.ts:17-33`), en `z.looseObject` pour le passthrough `iptc.custom.*`. **14/14 ✅.**

#### Extensions non-spec présentes dans `schema.ts`

`published`, `private`, `download`, `alt_description` (`src/schema.ts:90,95,96,94`) — aucune n'est dans la spec. `published` est explicitement documenté par la spec elle-même (§0.5) comme « redondant avec `draft`, à arbitrer » ; les trois autres sont des extensions propres au plugin, passthrough-safe mais hors contrat.

---

### §1.5 — Mode distant

| Règle spec | Fichier impl | Statut |
|---|---|---|
| `images[]` prioritaire sur `media/` | `src/helpers/index.ts:104` | ✅ |
| Fallback sur `media/` si absent | `src/helpers/index.ts:136` | ✅ |
| Modes mutuellement exclusifs | Par construction (branchement `if (imageList...)`) | ✅ |
| `url` requis, `alt`/`width`/`height` optionnels | `src/schema.ts:36-41` (`remoteImageSchema`) | ✅ |

**4/4 ✅.** Note de qualité (hors périmètre spec, pas comptée dans le score) : `getSeriesImages` (`src/helpers/index.ts:97-134`) accepte en réalité 3 formes d'entrée dans `images[]` — asset local (`src`), fichier référencé par nom (`file`), URL distante (`url`) — mais `remoteImageSchema` (`src/schema.ts:36-41`) exige `url: z.url()` sans le rendre optionnel. Une entrée `images: [{ file: '01.jpg' }]` (sans `url`) échouerait donc à la validation Zod avant même d'atteindre `getSeriesImages`. Cette 2ᵉ forme (`file:`) est une extension du plugin non documentée par la spec ; son schéma de validation semble incohérent avec son implémentation, mais ce n'est pas une exigence spec — signalé pour information, non compté dans les gaps.

---

### §1.5.1 — Manifeste d'images externalisé (`images.json`) *(introduit v2.6, MUST pour la conformité v2.6)*

| Règle spec | Fichier impl | Statut |
|---|---|---|
| Priorité `images:` > `images.json` > `media/` | — | ❌ |
| Formes courte (`["url1","url2"]`) et longue (`[{url,alt,width,height}]`) | — | ❌ |
| Ordre du tableau fait foi (pas de tri alphabétique) | — | ❌ |
| Résolution URL absolue / chemin absolu site / chemin relatif à `index.md` | — | ❌ |
| Robustesse : JSON illisible ou clé absente → fallback `media/` sans échec de build | — | ❌ |

`grep -rn "images\.json\|manifest" src/ tests/` ne retourne aucun résultat. **0/5 — absence totale.** C'est l'un des deux gaps qui font que le plugin n'est pas conforme v2.6 au sens de §2.0.

---

### §1.6 — Règles métier

| Règle spec | Fichier impl | Statut | Note |
|---|---|---|---|
| Scan `media/*.{jpg,jpeg,png,webp,avif,tiff}`, pas de récursion | `src/helpers/index.ts:26-29` (glob hoisté) | ✅ | |
| Tri alphabétique des images | `src/helpers/index.ts:141-144` | ✅ | `.localeCompare()` |
| `cover` frontmatter ou fallback 1ère image alphabétique | `src/components/SeriesCard.astro:20` | ✅ | **Corrigé depuis juin (H4)** : `fallbackImage = !cover ? (await getSeriesImages(...))[0] : undefined` |
| Body Markdown affiché avant la galerie | `src/routes/series-detail.astro:62-73` | ✅ | |
| Pagination configurable, défaut 12 | `src/index.ts:120` | ✅ | |
| Lightbox charge toutes les images | `src/routes/series-detail.astro:69`, `SeriesGallery.astro:120` | ✅ | `allImages` passé à `SeriesLightbox` |
| Tri des séries date desc par défaut | `src/helpers/index.ts:65-69` | ✅ | |
| Drafts exclus en production | `src/helpers/index.ts:60-64` | ✅ | |
| Route `/<prefix>/` | `src/index.ts:193-199` | ✅ | |
| Route `/<prefix>/<slug>/` | `src/index.ts:201-205` | ✅ | |
| Route `/<prefix>/<slug>/<page>/` | `src/index.ts:207-211` | ✅ | |

**11/11 ✅ — section entièrement conforme**, contre 5/6 en juin. Le seul gap relevé alors (fallback cover, H4) est corrigé.

---

### §1.8 — Séries imbriquées (conteneur)

| Obligation spec | Fichier impl | Statut | Note |
|---|---|---|---|
| Route `/<prefix>/<conteneur>/` générée automatiquement depuis le filesystem | `src/routes/series-detail.astro:8-14` (`params: { slug: s.id }` sur `[...slug]`), `src/helpers/index.ts:57-70` (`getSeriesList` récupère tous les `index.md`, y compris conteneurs) | ❓ | Mécanisme générique plausible (le conteneur a son propre `index.md`, donc sa propre entrée de collection, donc sa propre page via le catch-all) — mais non exercé par un test ou un contenu de démo avec un vrai conteneur (`examples/demo-site` n'en a aucun) |
| Route `/<prefix>/<conteneur>/<sous-slug>/` générée automatiquement | idem — la sous-série a son propre `index.md`, id hiérarchique `conteneur/sous-slug` | ❓ | Même réserve — dépend du comportement du loader `glob()` d'Astro sur les ids hiérarchiques, non vérifié dans ce dépôt |
| Page conteneur : body + galerie propre éventuelle **+ liste des sous-séries (line-up)** | — | ❌ | Aucune fonction dans `src/helpers/index.ts` ne récupère les sous-séries d'un conteneur donné (`getParentCollection` ne renvoie que le 1er segment, pas une relation parent→enfants) ; `series-detail.astro` n'affiche que `series.data` — pas de line-up |
| Cover du conteneur traversant un sous-dossier (`./sous-slug/media/01.jpg`) | Résolution `image()` native Astro (relative au fichier) | ❓ | Devrait fonctionner via la résolution de chemin native d'Astro, mais pas testé spécifiquement avec ce cas |
| Listing global : aplatir par défaut (recommandé) | `src/helpers/index.ts:57-70` (`getSeriesList` retourne tout, sans distinction conteneur/sous-série) | ✅ | Comportement flat de facto — conforme au défaut recommandé |
| Compatibilité minimum si non supporté (ne pas crasher, indexer le conteneur comme série normale) | idem | ✅ | Devenu sans objet : le plugin va au-delà du minimum de compatibilité (tente le support réel), mais celui-ci reste incomplet |

**Verdict** : progrès net par rapport à juin (0/5 ❌), grâce à l'architecture générique (glob récursif + route catch-all `[...slug]`) qui produit *mécaniquement* une bonne partie du comportement attendu, sans code dédié à §1.8. Mais **aucun test ni contenu de démo ne le prouve**, et la fonctionnalité de line-up (liste des sous-séries sur la page conteneur) est **positivement absente** — pas un doute, une vérification négative (`getParentCollection` et `series-detail.astro` ne portent aucune logique de ce type).

---

### §1.9 — Documents joints (tous types de médias)

| Règle spec | Fichier impl | Statut | Note |
|---|---|---|---|
| Classification par extension : `image`/`video`/`audio`/`document`/`file` | `src/helpers/index.ts:150-172` (`classifyAttachment`, `ATTACHMENT_KIND_BY_EXTENSION`) | ✅ | Extension inconnue → `file`, jamais d'erreur |
| Galerie réservée à la classe `image` | `src/helpers/index.ts:26-29` (glob images), `:33-39` (glob attachments, exclut explicitement les extensions image) | ✅ | |
| Pièces jointes listées après la galerie, triées alpha | `src/routes/series-detail.astro:76` (`<SeriesAttachments>` après `<SeriesGallery>`), `src/helpers/index.ts:211` (`.sort(...localeCompare)`) | ✅ | |
| `cover` ne référence jamais un document joint | `src/helpers/index.ts:344-347` (`getSeriesCover` délègue à `getSeriesImages`, qui ne retourne que des images) | ✅ | |
| Lecteurs intégrés `video`/`audio` | `src/components/SeriesAttachments.astro:32-42` (`<video>`/`<audio controls>`) | ✅ | |
| `index.md` jamais document joint | `src/helpers/index.ts:166` (`classifyAttachment` retourne `null` pour `index.md`) | ✅ | |
| Bloc frontmatter `attachments:` (title/description par fichier) | `src/schema.ts:47-51,99`, `src/helpers/index.ts:195-200` (fusion par nom de fichier) | ✅ | |
| Mode distant `files[]`, priorité sur `media/` | `src/schema.ts:54-59,100`, `src/helpers/index.ts:184-192` | ✅ | |
| Robustesse : ne jamais échouer sur un fichier inconnu | `src/helpers/index.ts:168` (`ATTACHMENT_KIND_BY_EXTENSION[ext] ?? 'file'`) | ✅ | |

**9/9 ✅ — section entièrement conforme.** C'était le gap principal de la spec v2.5, absent du périmètre de juin ; il est intégralement comblé en 0.8.0, y compris le composant `SeriesAttachments` de §3.1.

**Réserve de qualité (non comptée dans le score, car passthrough Zod compense fonctionnellement)** : le module virtuel codegen dans `src/index.ts:273-289` (schéma utilisé par `virtual:hyperfocale/collection`, celui que branche `npx hyperfocale init` — `src/cli/init.ts:15-22`) **n'inclut pas** les champs `attachments` et `files`, contrairement à `baseSeriesSchema` dans `src/schema.ts:99-100`. Les deux définitions de schéma ont divergé. Comme le schéma reste un `z.looseObject`, les champs passent quand même (non filtrés), donc `getSeriesAttachments` fonctionne malgré tout — mais sans validation Zod ni valeurs par défaut sur ces clés pour l'installation par défaut (`hyperfocale init`), et les casts `as Array<...>` dans `src/helpers/index.ts:184,196` sont le symptôme direct de cette absence de typage.

---

### §1.10 — Page d'index de section *(introduit v2.6, MUST pour la conformité v2.6)*

| Règle spec | Fichier impl | Statut |
|---|---|---|
| Champ core `type` (`series` par défaut, `section` alternative normative) | — | ❌ |
| `index.md` `type: section` exclu des listings de séries | — | ❌ |
| `date` non requise pour une section | — | ❌ |
| Pas de galerie pour une section | — | ❌ (sans objet, car aucune distinction section/série) |
| Génération d'une page de section (body + liste des contenus) | — | ❌ |
| Exclusion des flux de syndication / tri par date | — | ❌ (Annexe E non implémentée de toute façon, voir prochaines étapes) |

**0/6 — absence totale**, confirmée par `grep -n "\btype\b" src/schema.ts src/index.ts` (aucune occurrence liée à une valeur `section`) et `grep -rn "'section'|\"section\""` (aucun résultat).

**Conséquence pratique plus grave qu'une simple non-conformité** : la spec elle-même documente que le comportement d'un adaptateur pré-v2.6 sur un `index.md` `type: section` est d'« échouer sur `date`... c'est précisément le comportement que cette section corrige » (Changelog v2.6). Avec `dateRequired: true` (défaut du plugin — `src/schema.ts:83`), un site qui adopte ce pattern documenté par la spec canonique verrait son build Astro échouer à la validation de collection (`date` manquante) sur ces fichiers, plutôt que de les traiter silencieusement comme des sections. Ce n'est donc pas seulement un gap fonctionnel : c'est une **incompatibilité active** avec le contenu réel qui a motivé cette clarification de spec — le round-trip du 27/07 sur les 332 séries de `mathieu-drouet.com` (voir Changelog spec, §1.10) a justement révélé 5 fichiers de ce type.

---

### §3.1 — Composants UI

| Composant spec | Présent impl | Props minimales spec | Props impl | Statut |
|---|---|---|---|---|
| `SeriesCard` | ✅ `SeriesCard.astro` | `series: Series` | `series`, `prefix?` | ✅ |
| `SeriesList` | ✅ `SeriesList.astro` | `series: Series[]`, `columns?` | `series`, `columns?`, `prefix?` | ✅ |
| `SeriesGallery` | ✅ `SeriesGallery.astro` | `images`, `page`, `totalPages`, `baseUrl` | `images`, `allImages`, `page`, `totalPages`, `baseUrl` | ✅ |
| `SeriesLightbox` | ✅ `SeriesLightbox.astro` | `images: Image[]` | `images: ImageMetadata[]` | ✅ |
| `SeriesMap` | ✅ `SeriesMap.astro` | `series: Series[]` (filtrées `iptc.gps`) | `series`, `height?`, `prefix?` — filtre bien sur `iptc.gps` (`SeriesMap.astro:22-28`) | ✅ **(nouveau depuis juin)** |
| `SeriesFilter` | ✅ `SeriesFilter.astro` | `series: Series[]`, `filters: FilterConfig` | `series`, `filters?: Array<'tags'\|'date'\|'location'>`, `prefix?` | ✅ **(nouveau depuis juin)** |
| `SeriesAttachments` *(vocabulaire ajouté en spec v2.5)* | ✅ `SeriesAttachments.astro` | `attachments: Attachment[]` | `attachments`, `heading?` | ✅ **(nouveau depuis juin)** |

**7/7 ✅ — section entièrement conforme**, contre 4/6 en juin (`SeriesMap`/`SeriesFilter` absents alors ; `SeriesAttachments` n'existait même pas dans la spec auditée). Bonus hors-spec : `SeriesMasonry.astro` (disposition masonry, sans équivalent dans le vocabulaire §3.1).

---

### §3.2 — Types de données partagés

| Type spec | Présent impl | Statut | Note |
|---|---|---|---|
| `Series` | `src/helpers/index.ts:5` (`type Series = CollectionEntry<'series'>`) | 🟡 | Toujours délégué à Astro (`.data.*`/`.id`, pas d'objet plat) ; `attachments`/`images` ne sont pas des propriétés directes, il faut appeler `getSeriesAttachments()`/`getSeriesImages()` séparément — déviation jugée acceptable (contrainte du type `CollectionEntry` d'Astro), inchangée depuis juin |
| `Image` | `src/helpers/index.ts:14-20` (`ImageMetadata`) | ✅ | **Corrigé depuis juin (H5)** : `alt?: string` maintenant présent |
| `Attachment` *(nouveau en spec v2.5)* | `src/schema.ts:176-182` | ✅ | Correspond exactement à l'interface spec : `src`, `kind`, `title?`, `description?`, `size?` |
| `IPTCMetadata` | `src/schema.ts:17-33` (+ `SeriesData`) | ✅ | Tous les champs présents, `[key: string]: unknown` via `looseObject` |
| `PaginatedImages` | `src/helpers/index.ts:8-12` (`PaginationResult<T>`) | 🟡 | `items`, `currentPage`, `totalPages` présents — **`pageSize` toujours absent**, non corrigé depuis juin (M2) |

**2/4 ✅, 2/4 🟡** (le score global compte `Series`+`Image`+`Attachment`+`IPTCMetadata`+`PaginatedImages` = 5 items dans le tableau ci-dessus, mais `Attachment` est une addition v2.5 comptée séparément dans le total §1.9 pour éviter le double-comptage — dans le tableau §3.2 du score global, 4 items sont comptés : `Series`, `Image`, `IPTCMetadata`, `PaginatedImages`).

---

### §3.3 — Interactions requises

| Interaction spec | Implémentation | Statut | Note |
|---|---|---|---|
| Clic sur image → ouvre la lightbox | `src/components/SeriesGallery.astro:122-131` | ✅ | |
| Navigation lightbox : ← → clavier | `src/components/SeriesLightbox.astro:143-147` | ✅ | |
| Navigation lightbox : swipe tactile | `src/components/SeriesLightbox.astro:126-135` | ✅ | **Corrigé depuis juin (H1)** : `touchstart`/`touchend`, seuil de delta 50px, `{ passive: true }` |
| Fermeture lightbox : Esc, clic overlay, bouton | `src/components/SeriesLightbox.astro:113-140,145` | ✅ | |
| Pagination galerie | `src/components/SeriesGallery.astro:77-117` | ✅ | `rel=prev/next`, `aria-label` |
| Lazy loading hors viewport | `src/components/SeriesGallery.astro:69`, `SeriesCard.astro:36,44` | ✅ | `loading="lazy"` (SHOULD, satisfait) |

**5/5 ✅ — section entièrement conforme**, contre 4/5 en juin (swipe manquant, désormais présent).

---

## 3. Gaps par priorité

### Critique (MUST de la spec, absent)

| # | Section spec | Exigence | État actuel | Effort estimé |
|---|---|---|---|---|
| C1 | §1.10 / §0 / §2.0 | Page d'index de section (`type: section`) : champ `type`, exclusion des listings, non-échec sur `date` absente | Totalement absent — **risque de casser le build** sur du contenu réel conforme à la spec (cf. justification changelog v2.6, 5 fichiers observés sur le corpus de référence) | M (1,5–2j : champ `type` optionnel dans le schéma, filtrage dans `getSeriesList`/`getAllSeriesCached`, route de section optionnelle) |
| C2 | §1.5.1 / §2.0 | Manifeste `images.json` : lecture, priorité sur `media/`, formes courte/longue, fallback robuste | Totalement absent — `grep` ne trouve aucune trace | M (1,5–2j : lecture du fichier annexe dans `getSeriesImages`, résolution des 3 formes d'URL, gestion d'erreur non bloquante) |

### Haut (SHOULD de la spec, absent ou partiel, ou déviation significative d'un mécanisme MUST-adjacent)

| # | Section spec | Exigence | État actuel | Effort estimé |
|---|---|---|---|---|
| H1 | §2.0.1 / Annexe G | Vocabulaire des presets aligné sur l'Annexe G (`series`, `event`, `recipe`, `app`, `book`, `place`, `screen`) | Le mécanisme est fonctionnel mais expose un vocabulaire entièrement différent (`photo`, `portfolio`, `music`, `catalog`, `press`, `recipe`), y compris un `recipe` avec un préfixe (`/recettes`) qui diverge de l'exemple normatif (`/recipes`) | S–M (1j : ajouter les presets manquants de l'Annexe G en plus des presets existants, aligner `recipe.prefix`) |
| H2 | §1.8 | Line-up des sous-séries sur la page conteneur | Absent — aucune fonction ne relie un conteneur à ses sous-séries | M (1–2j : fonction `getSubSeries(containerId)` basée sur `entry.id.startsWith(containerId + '/')` à un seul niveau, affichage dans `series-detail.astro`) |
| H3 | §1.2 / §1.8 | Vérification empirique de la découverte récursive et du routage hiérarchique | Architecture plausible mais non testée (aucun contenu de démo à 2+ niveaux, aucun test e2e) | S (0,5j : ajouter un dossier de démo rangé/imbriqué + assertions e2e) |

### Moyen (COULD, ou défaut de précision / cohérence interne)

| # | Section spec | Exigence | État actuel | Effort estimé |
|---|---|---|---|---|
| M1 | §3.2 | `pageSize` absent de `PaginationResult<T>` (`src/helpers/index.ts:8-12`) | Toujours absent, gap identique au rapport de juin (M2), non corrigé | XS (0,25j) |
| M2 | §1.8 | `lineup_order` (tri alternatif des sous-séries, PEUT) | Absent du schéma | S (0,5j, dépend de H2) |
| M3 | Interne | Dérive entre `baseSeriesSchema` (`src/schema.ts:82-101`, avec `attachments`/`files`) et le schéma codegen du module virtuel (`src/index.ts:273-289`, sans `attachments`/`files`) — installation par défaut (`hyperfocale init`) moins bien typée que l'API `baseSeriesSchema` exportée | Fonctionnellement compensé par `z.looseObject`, mais source de confusion et de `as` non sûrs (`src/helpers/index.ts:184,196`) | S (0,5j : générer le module virtuel à partir de `baseSeriesSchema` au lieu de dupliquer la liste des champs en template string) |
| M4 | Annexe A | CLI `hyperfocale-lint` | Absent (inchangé depuis juin) | M |
| M5 | Annexe E | Flux RSS / JSON Feed | Absent (inchangé depuis juin) | M |
| M6 | §1.5 (extension plugin, hors spec) | `remoteImageSchema` (`src/schema.ts:36-41`) exige `url` alors que `getSeriesImages` supporte aussi des entrées `file:`/`src:` sans `url` | Incohérence interne probable (non testée) — signalé pour information | XS |

---

## 4. Tableau comparatif schéma spec v2.6-draft vs `schema.ts`

| Champ | Requis spec | Présent `schema.ts` | Type `schema.ts` | Delta |
|---|---|---|---|---|
| `title` | oui | ✅ `:85` | `z.string()` | — |
| `date` | oui (configurable) | ✅ `:86` | `z.coerce.date()` (opt. si `dateRequired:false`) | — |
| `description` | non | ✅ `:87` | `z.string().optional()` | — |
| `cover` | non | ✅ `:121` | `image().optional()` | — |
| `location` | non | ✅ `:88` | `z.string().optional()` | — |
| `draft` | non | ✅ `:91` | `z.boolean().default(false)` | — |
| `lang` | non | ✅ `:89` | `z.string().optional()` | — |
| `featured` | non | ✅ `:92` | `z.boolean().default(false)` | — |
| `tags` | non | ✅ `:93` | `z.array(z.string()).default([])` | Spec : `.optional()` implicite ; impl : défaut `[]` — équivalent fonctionnellement |
| `type` (`series`\|`section`) *(v2.6)* | non, réservé | ❌ | Absent | **Gap C1** |
| `iptc.*` (14 champs) | non | ✅ `:17-33,97` | `iptcSchema` (looseObject) | — |
| `images[]` (mode distant, §1.5) | non | ✅ `:36-41,98` | `z.array(remoteImageSchema)` | `url` non-optionnel malgré le support `file:`/`src:` dans les helpers (M6) |
| `images.json` (manifeste, §1.5.1) *(v2.6)* | — (fichier annexe, pas un champ) | ❌ | Non lu | **Gap C2** |
| `attachments[]` (§1.9) | non | ✅ `:47-51,99` | `z.array(attachmentMetaSchema)` | Absent du module virtuel codegen (M3) |
| `files[]` (mode distant, §1.9) | non | ✅ `:54-59,100` | `z.array(remoteFileSchema)` | Absent du module virtuel codegen (M3) |
| `lineup_order` (§1.8, PEUT) | non | ❌ | Absent | Gap M2 |
| Passthrough racine | MUST | ✅ `:84` | `z.looseObject()` | — |
| `published`, `private`, `download`, `alt_description` | — (hors spec) | ✅ `:90,94-96` | Extensions plugin | `published` documenté par la spec (§0.5) comme redondant avec `draft` |

---

## 5. Prochaines étapes

### Sprint 1 — Corrections rapides (< 1j)

1. **M1** — Ajouter `pageSize: number` à `PaginationResult<T>` (`src/helpers/index.ts:8-12`) et le retourner dans `paginateImages()`.
2. **M3** — Générer le schéma du module virtuel (`src/index.ts:273-289`) depuis `baseSeriesSchema` plutôt que de dupliquer la liste des champs en template string, pour supprimer la dérive `attachments`/`files`.
3. **M6** — Rendre `url` optionnel dans `remoteImageSchema` (`src/schema.ts:36-41`) ou documenter clairement que `file:`/`src:` sont des extensions nécessitant un schéma personnalisé côté site consommateur.

### Sprint 2 — Conformité v2.6 (Critique, 3–4j, C1 + C2)

4. **C1** — Implémenter §1.10 : champ `type` optionnel (`'series' | 'section'`, défaut `'series'`) dans `baseSeriesSchema` et le module virtuel ; filtrer les entrées `type: 'section'` hors de `getSeriesList()`/`getAllSeriesCached()` ; rendre `date` optionnelle dès que `type === 'section'` (contournement du problème de build identifié) ; envisager une route de section optionnelle (body + liste des contenus).
5. **C2** — Implémenter §1.5.1 : lecture d'un `images.json` annexe dans `getSeriesImages()`, priorité `images:` > `images.json` > `media/`, support des formes courte/longue, résolution des 3 types de chemins, fallback silencieux sur `media/` en cas de JSON invalide.

### Sprint 3 — Séries imbriquées, finalisation (1,5–2,5j, H2 + H3)

6. **H2** — Ajouter `getSubSeries(containerId)` dans `src/helpers/index.ts` et afficher le line-up dans `series-detail.astro` quand des sous-séries existent.
7. **H3** — Ajouter un cas de démo rangé (`examples/demo-site/src/content/series/archives/test/<slug>/`) et un cas imbriqué (conteneur + 2 sous-séries), avec assertions e2e sur les deux niveaux d'URL générés, pour transformer les ❓ de §1.2/§1.8 en ✅ ou ❌ vérifiés.

### Sprint 4 — Presets alignés spec (1j, H1)

8. **H1** — Ajouter les presets `event`, `app`, `book`, `place`, `screen` de l'Annexe G (ou a minima documenter explicitement que les presets du plugin sont une extension propriétaire distincte du vocabulaire spec) ; corriger `PRESETS.recipe.prefix` vers `/recipes` ou clarifier pourquoi la version francisée est un choix assumé.

### Reporté (inchangé depuis juin, hors delta v2.6)

9. **M4/M5** — CLI `hyperfocale-lint`, flux RSS/JSON Feed (Annexes A et E).

### Correction à porter côté dépôt spec (pas côté plugin)

10. **§0.5 de la spec** décrit le plugin Astro comme étant en version **v0.4.0**, avec la ligne « Documents joints (§1.9) ❌ — à implémenter ». C'est **obsolète depuis la 0.8.0** : les documents joints sont intégralement implémentés (§1.9 de ce rapport, 9/9 ✅). Le tableau §0.5 devrait être mis à jour côté `hyperfocale-spec` pour refléter : la version 0.8.0, l'implémentation de §1.9, l'apparition du mécanisme de presets (`src/presets.ts`) avec sa déviation de vocabulaire (§2.0.1 de ce rapport), et les deux gaps v2.6 restants (§1.5.1, §1.10).

---

## 6. Résumé exécutif

Le plugin `@izo/hyperfocale` v0.8.0 a **comblé la quasi-totalité des gaps identifiés en juin** : fallback de couverture (H4), champ `alt` (H5), swipe tactile (H1), API `render()` dépréciée (M6), et surtout les composants `SeriesMap`/`SeriesFilter` (H2/H3 de juin) sont désormais livrés. La spec v2.5 (documents joints, §1.9) est intégralement implémentée — schéma, helpers, composant `SeriesAttachments` — alors qu'elle était hors périmètre du rapport précédent.

Deux gaps **Critiques** subsistent, tous deux liés à la **spec v2.6** (révision du 26/07, soit la veille de cet audit) : le manifeste `images.json` (§1.5.1) et la page d'index de section (§1.10). Le second n'est pas qu'une absence fonctionnelle — avec `dateRequired: true` par défaut, il peut **faire échouer le build** d'un site qui adopte le pattern `type: section` que la spec documente désormais comme normatif, exactement le scénario que la clarification v2.6 visait à corriger.

Le mécanisme de presets de domaine (§2.0.1), noté « partiel » en juin faute d'implémentation, est maintenant pleinement fonctionnel mais **dévie du vocabulaire standardisé de l'Annexe G** : sur les 6 presets exposés (`photo`, `portfolio`, `music`, `catalog`, `press`, `recipe`), aucun ne reproduit exactement un profil spec, y compris le seul nom partagé (`recipe`, dont le préfixe diverge). C'est un jugement qualitativement différent de juin — le gap n'est plus une absence, c'est un choix de conception qui s'écarte de l'interopérabilité visée par la spec.

Les séries imbriquées (§1.8), notées 0/5 en juin, bénéficient d'un progrès architectural notable — la combinaison glob récursif + route catch-all `[...slug]` produit *mécaniquement* le routage à deux niveaux attendu, sans code dédié — mais ce comportement n'est vérifié par aucun test ni contenu de démo (statut ❓, pas ✅), et la fonctionnalité de line-up (liste des sous-séries sur la page conteneur) est positivement absente.
