# Rapport de conformité spec↔code — `@regrets/hyperfocale` v0.10.0

**Date** : 2026-08-04
**Spec auditée** : Hyperfocale v2.7-draft (`izo/hyperfocale-spec`, commit `04ca57b`)
**Plugin audité** : `@regrets/hyperfocale` v0.10.0 (`package.json:3`)
**Rapport précédent** : `docs/reports/conformite-spec-2026-07-27.md` — spec v2.6-draft / plugin v0.8.0
**Périmètre** : identique au rapport du 27/07, pour rester comparable terme à terme
**Mode** : read-only sur `src/` et `tests/` — seule écriture : ce rapport

**Légende** : ✅ Conforme · 🟡 Partiel · ❌ Absent · ⚠️ Déviant · ❓ Non vérifiable (aucun test ne l'exerce)

> **Le paquet a changé de nom** : `@izo/hyperfocale` → `@regrets/hyperfocale` (2026-08-04). Le scope `@izo` ne correspondait à aucun compte npm ; aucune version n'ayant jamais été publiée sous l'ancien nom, ce renommage ne casse aucune installation. Sans incidence sur la conformité.

---

## 1. Score global de conformité

| Périmètre | Total | ✅ | 🟡 | ❌ | ⚠️ | ❓ |
|-----------|-------|----|----|----|----|----|
| §2.0 Contrat d'adaptateur (MUST) | 11 | 11 | 0 | 0 | 0 | 0 |
| §2.0.1 Presets de domaine (COULD) | 1 | 0 | 1 | 0 | 0 | 0 |
| §2.1 Adaptateur Astro | 6 | 5 | 1 | 0 | 0 | 0 |
| §1.2 Profondeur de rangement | 1 | 1 | 0 | 0 | 0 | 0 |
| §1.3 Frontmatter (core + workflow + IPTC) | 24 | 24 | 0 | 0 | 0 | 0 |
| §1.5 Mode distant | 4 | 4 | 0 | 0 | 0 | 0 |
| §1.5.1 Manifeste `images.json` | 5 | 5 | 0 | 0 | 0 | 0 |
| §1.6 Règles métier | 11 | 11 | 0 | 0 | 0 | 0 |
| §1.8 Séries imbriquées | 6 | 3 | 0 | 1 | 0 | 2 |
| §1.9 Documents joints | 9 | 9 | 0 | 0 | 0 | 0 |
| §1.10 Page d'index de section | 6 | 5 | 1 | 0 | 0 | 0 |
| §3.1 Composants UI | 7 | 7 | 0 | 0 | 0 | 0 |
| §3.2 Types partagés | 4 | 2 | 2 | 0 | 0 | 0 |
| §3.3 Interactions requises | 5 | 5 | 0 | 0 | 0 | 0 |
| **TOTAL** | **100** | **92** | **5** | **1** | **0** | **2** |

**Score global : 92 % (92/100)** — 96,4 % si les 🟡 comptent à 50 % et les ❓ sont exclus du calcul.

### Comparaison au rapport du 27/07/2026

| Périmètre | 27/07 (v0.8.0) | 04/08 (v0.10.0) | Évolution |
|---|---|---|---|
| §2.0 Contrat d'adaptateur | 9/11 | **11/11** | **+2** — les deux obligations v2.6 sont satisfaites |
| §2.0.1 Presets | ⚠️ déviant | 🟡 partiel | **requalifié** — voir ci-dessous, le changement vient de la spec |
| §1.2 Profondeur | 1 ❓ | **1 ✅** | **vérifié empiriquement** |
| §1.3 Frontmatter | 23/24 | **24/24** | **+1** — champ `type` |
| §1.5.1 Manifeste | 0/5 ❌ | **5/5 ✅** | **+5** — gap C2 refermé |
| §1.8 Séries imbriquées | 2✅/1❌/3❓ | 3✅/1❌/2❓ | **+1** — routage à 2 niveaux prouvé |
| §1.10 Page de section | 0/6 ❌ | **5✅/1🟡** | **+5** — gap C1 refermé |
| **Total** | **77 %** | **92 %** | **+15 points** |

Les deux gaps **Critiques** du rapport précédent sont refermés. **Aucun gap critique ne subsiste.**

---

## 2. Ce qui a changé depuis le 27/07

### C1 — §1.10 Page d'index de section : refermé

`src/schema.ts:98` ajoute le champ `type` (`'series' | 'section'`, défaut `'series'`). L'implémentation mérite une note technique : `date` ne peut pas être requise conditionnellement dans un shape Zod, elle est donc déclarée optionnelle puis rendue obligatoire par un `.check()` qui épargne les sections (`src/schema.ts:124-134`). `.check()` survit à `.extend()`, ce dont dépend l'API d'extension `baseSeriesSchema` (#DATA-004) — c'est explicitement couvert par un test (`tests/unit/sections.test.ts:61`).

Le point le plus important de ce correctif n'est pas le champ lui-même mais **la manière dont il est lu**. La spec est catégorique (§1.10, « discriminant explicite ») :

> « Un adaptateur ne DOIT jamais la deviner (par l'absence de `date`, par la présence de sous-dossiers, ou autrement) : une série sans `date` reste une série invalide. »

`isSection()` (`src/helpers/index.ts:211`) ne teste que `type`. Une série sans date reste une série invalide — c'est testé (`tests/unit/sections.test.ts:28`).

| Règle §1.10 | Impl | Statut |
|---|---|---|
| Champ core `type` (`series` par défaut) | `src/schema.ts:98` | ✅ |
| `type: section` exclu des listings | `src/helpers/index.ts:235` (`getSeriesList`), `:505` (`querySeries`), `getAllTags`, `getAllCollections` | ✅ |
| `date` non requise pour une section | `src/schema.ts:124-134` | ✅ |
| Pas de galerie pour une section | Aucune route générée (exclue de `getSeriesList`, source des `getStaticPaths`) | ✅ |
| Génération d'une page de section (body + contenus) | `getSections()` exposé, aucune route injectée | 🟡 |
| Exclusion du tri par date et des flux | `getSeriesList` / `querySeries` | ✅ |

Le 🟡 est assumé : la spec dit « un adaptateur **PEUT** lui générer une page de section » — c'est une faculté, pas une obligation. Le plugin fournit la matière (`getSections()`, `isSection()`) et laisse le site consommateur composer sa page de rubrique. Le compter ✅ serait généreux, ❌ serait faux.

### C2 — §1.5.1 Manifeste `images.json` : refermé

| Règle §1.5.1 | Impl | Statut |
|---|---|---|
| Priorité `images:` > `images.json` > `media/` | `src/helpers/index.ts:325` (après le frontmatter, avant le glob) | ✅ |
| Formes courte et longue | `resolveManifestImage()` — `src/helpers/index.ts:166` | ✅ |
| Ordre du tableau fait foi | Aucun `.sort()` sur ce chemin ; testé e2e sur un manifeste ordonné 03/01/02 | ✅ |
| Résolution des 3 formes d'URL | `src/helpers/index.ts:178-192` | ✅ |
| Robustesse : jamais d'échec de build | `parseImageManifest()` — `src/helpers/index.ts:111` | ✅ |

La robustesse mérite un mot, parce qu'elle a dicté l'implémentation. Le manifeste est chargé en **`?raw` puis parsé dans un `try`** (`src/helpers/index.ts:66-70`), et non importé comme JSON : un import ferait échouer Vite **au parsing**, avant que le moindre `catch` ne s'exécute. Or §1.5.1 impose le contraire — « JSON illisible […] l'adaptateur DOIT se rabattre sur `media/` […] Jamais d'échec de build ». Un fichier produit par un pipeline tiers est précisément celui qui peut arriver tronqué.

Au-delà des 5 règles comptées, la clé `files` du manifeste alimente `getSeriesAttachments()` (`src/helpers/index.ts:395`), et `images.json` est exclu des documents joints (`classifyAttachment`, `src/helpers/index.ts:358`) — « c'est un fichier de métadonnées, au même titre qu'`index.md` ».

### §1.2 — Profondeur de rangement : le ❓ est levé

Le rapport précédent ne pouvait pas confirmer que l'`id` généré par le loader correspond au chemin relatif complet. `examples/demo-site` porte désormais `series/archives/concerts-2023/`, une série rangée à deux niveaux, et `tests/e2e/routes.test.ts:239` assert que `series/archives/concerts-2023/index.html` est bien généré. **Découverte récursive et routage hiérarchique sont vérifiés empiriquement**, plus seulement plausibles.

### M3 — Dérive du module virtuel : corrigée

Le rapport précédent signalait que le schéma codegen du module virtuel avait divergé de `baseSeriesSchema` — ni `attachments`, ni `files` (§1.9). Tout site passant par `virtual:hyperfocale/collection`, c'est-à-dire l'installation par défaut de `npx hyperfocale init`, héritait donc d'un schéma en retard d'une version de spec.

Le module virtuel délègue désormais à `seriesSchema()` (`src/index.ts:239-252`), importé depuis `dist/schema.js`. **Une seule définition du schéma existe.** Ce n'était pas cosmétique : sans cette correction, le correctif §1.10 n'aurait atteint aucun site consommateur.

### §2.0.1 — Presets : requalifié ⚠️ → 🟡, sans que le plugin change

Le rapport du 27/07 notait ce point ⚠️ *déviant* : aucun des 6 presets ne reproduisait un profil de l'Annexe G. **La spec a bougé, pas le plugin.** L'Annexe G v2.7 (PR spec #10, issue de cet audit) a standardisé quatre profils repris du plugin — `portfolio`, `music`, `catalog`, `press` — et §0.5 tranche désormais explicitement le statut des préfixes localisés :

> « Les prefix divergents ne sont pas des non-conformités — la colonne de l'Annexe G est un **prefix recommandé**, et un preset PEUT fixer le sien (§2.0.1) ; le plugin les a simplement localisés en français. »

| Preset plugin | Nom Annexe G | État |
|---|---|---|
| `recipe`, `portfolio`, `music`, `catalog`, `press` | identiques | ✅ conformes (préfixes localisés, autorisé) |
| `photo` | `series` | ⚠️ **seul écart réel** — `series` est le nom standardisé du profil canonique |
| — | `event`, `app`, `book`, `place`, `screen` | non implémentés (COULD) |

**5 presets sur 6 sont conformes en nom.** Le seul écart restant est `photo` → `series`, un renommage cassant à cadrer dans une version majeure. D'où 🟡 et non ✅.

---

## 3. Gaps restants

### Critique

**Aucun.**

### Haut

| # | Section | Exigence | État | Effort |
|---|---|---|---|---|
| H1 | §2.0.1 / Annexe G | Renommer le preset `photo` en `series` | Seul écart de vocabulaire subsistant ; changement cassant | XS (0,25j) + cycle de version majeure |
| H2 | §1.8 | Line-up des sous-séries sur la page conteneur | Absent — inchangé. Aucune fonction ne relie un conteneur à ses sous-séries | M (1–2j) |
| H3 | §1.8 | Vérification empirique du cas **conteneur** (série datée contenant des sous-séries) | Le routage à 2 niveaux est prouvé (§1.2), mais le cas conteneur §1.8 — un `index.md` daté avec sa propre galerie **et** des sous-séries — n'est exercé par aucun contenu de démo | S (0,5j) |

### Moyen

| # | Section | Exigence | État | Effort |
|---|---|---|---|---|
| M1 | §3.2 | `pageSize` absent de `PaginationResult<T>` (`src/helpers/index.ts:26-30`) | Inchangé depuis juin — c'est le plus vieux gap ouvert du plugin, signalé pour la troisième fois | XS (0,25j) |
| M2 | §1.8 | `lineup_order` (tri alternatif des sous-séries, PEUT) | Absent du schéma ; dépend de H2 | S (0,5j) |
| M3 | §1.5 | `remoteImageSchema` (`src/schema.ts:49-53`) exige `url` alors que `getSeriesImages` accepte aussi `file:`/`src:` | Inchangé. Une entrée `images: [{ file: '01.jpg' }]` échoue à la validation Zod avant d'atteindre le helper | XS |
| M4 | §1.10 | Route de section optionnelle (body + liste des contenus) | `getSections()` est exposé, la route ne l'est pas. La spec dit « PEUT » | S (0,5j) |
| M5 | Annexe A | CLI `hyperfocale-lint` | Absent (inchangé) | M |
| M6 | Annexe E | Flux RSS / JSON Feed | Absent (inchangé) | M |

Le gap `pageSize` (M1) traverse maintenant trois rapports consécutifs — juin, juillet, août — pour un quart de journée d'effort. Soit il est traité, soit il devrait être explicitement écarté du périmètre.

---

## 4. Correction à porter côté dépôt spec

§0.5 de `spec-hyperfocale.md` décrit encore le plugin en **v0.8.0**, avec la ligne :

```
| Page d'index de section (§1.10) | ❌ | Introduite en v2.6-draft — non implémentée |
```

C'est obsolète depuis la 0.10.0. Le tableau devrait refléter :

- version **0.10.0** (et le nom `@regrets/hyperfocale`)
- §1.10 **✅** — champ `type`, exclusion des listings, `date` conditionnelle
- §1.5.1 **✅** — manifeste `images.json`, ligne à ajouter (absente du tableau actuel)
- socle **Astro 7.1.6**

C'est le pendant exact de la correction portée le 27/07 (PR spec #9) : la spec décrit l'état du plugin, elle prend du retard à chaque livraison de celui-ci.

---

## 5. Résumé exécutif

Le plugin passe de **77 % à 92 %** de conformité, et **aucun gap critique ne subsiste**. Les deux MUST de la v2.6 — page d'index de section (§1.10) et manifeste d'images externalisé (§1.5.1) — sont implémentés, testés et publiés.

Trois observations méritent d'être retenues au-delà du score :

**Le gap §1.10 n'était pas qu'une non-conformité.** Un `index.md` portant `type: section` cassait le build d'un site consommateur, puisque `date` était requise sans condition. Cinq fichiers du corpus de `mathieu-drouet.com` étaient dans ce cas. Le correctif ne referme pas seulement une ligne de matrice : il débloque du contenu réel.

**Une correction en a révélé une autre.** En implémentant §1.10, on a découvert que le module virtuel redéclarait le schéma en dur et avait déjà divergé de `src/schema.ts` sur §1.9. Tout site passant par l'installation par défaut héritait d'un schéma en retard. Sans cette seconde correction, la première n'aurait atteint personne — c'est le gap M3 du rapport précédent, dont la gravité réelle avait été sous-estimée (il y était noté « fonctionnellement compensé par `z.looseObject` »).

**Un progrès est venu de la spec, pas du code.** Le vocabulaire des presets, noté ⚠️ *déviant* en juillet, est requalifié 🟡 *partiel* : l'Annexe G v2.7 a standardisé quatre profils repris du plugin, et a tranché que les préfixes localisés sont conformes. Cinq presets sur six sont désormais alignés. C'est le bénéfice direct d'un audit qui remonte ses constats **des deux côtés** — plugin et spec — plutôt que de traiter la spec comme immuable.

Ce qui reste tient en une ligne : le line-up des séries imbriquées (§1.8, H2) est la seule fonctionnalité positivement absente, et `pageSize` (M1) traîne depuis trois rapports pour un quart de journée d'effort.
