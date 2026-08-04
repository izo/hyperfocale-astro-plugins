# Rapport de conformité spec↔code — `@regrets/hyperfocale` v0.12.0

**Date** : 2026-08-04 (seconde passe de la journée)
**Spec auditée** : Hyperfocale v2.7-draft (`izo/hyperfocale-spec`, commit `e58fd60`)
**Plugin audité** : `@regrets/hyperfocale` v0.12.0 (`package.json:3`)
**Rapport précédent** : `docs/reports/conformite-spec-2026-08-04.md` — même spec / plugin v0.10.0
**Périmètre** : identique aux deux rapports précédents, pour rester comparable terme à terme
**Mode** : read-only sur `src/` et `tests/` — seule écriture : ce rapport

**Légende** : ✅ Conforme · 🟡 Partiel · ❌ Absent · ⚠️ Déviant · ❓ Non vérifiable

---

## 1. Score global

| Périmètre | Total | ✅ | 🟡 | ❌ | ⚠️ | ❓ |
|-----------|-------|----|----|----|----|----|
| §2.0 Contrat d'adaptateur (MUST) | 11 | 11 | 0 | 0 | 0 | 0 |
| §2.0.1 Presets de domaine (COULD) | 1 | 1 | 0 | 0 | 0 | 0 |
| §2.1 Adaptateur Astro | 6 | 5 | 1 | 0 | 0 | 0 |
| §1.2 Profondeur de rangement | 1 | 1 | 0 | 0 | 0 | 0 |
| §1.3 Frontmatter (core + workflow + IPTC) | 24 | 24 | 0 | 0 | 0 | 0 |
| §1.5 Mode distant | 4 | 4 | 0 | 0 | 0 | 0 |
| §1.5.1 Manifeste `images.json` | 5 | 5 | 0 | 0 | 0 | 0 |
| §1.6 Règles métier | 11 | 11 | 0 | 0 | 0 | 0 |
| §1.8 Séries imbriquées | 6 | 5 | 0 | 0 | 0 | 1 |
| §1.9 Documents joints | 9 | 9 | 0 | 0 | 0 | 0 |
| §1.10 Page d'index de section | 6 | 5 | 1 | 0 | 0 | 0 |
| §3.1 Composants UI | 7 | 7 | 0 | 0 | 0 | 0 |
| §3.2 Types partagés | 4 | 3 | 1 | 0 | 0 | 0 |
| §3.3 Interactions requises | 5 | 5 | 0 | 0 | 0 | 0 |
| **TOTAL** | **100** | **96** | **3** | **0** | **0** | **1** |

**Score global : 96 % (96/100)** — 98,5 % si les 🟡 comptent à 50 % et le ❓ est exclu.

**Aucun ❌ ne subsiste dans la matrice.** C'est le premier rapport dans ce cas.

### Trajectoire de la journée

| | 27/07 (v0.8.0) | 04/08 matin (v0.10.0) | 04/08 soir (v0.12.0) |
|---|---|---|---|
| Score | 77 % | 92 % | **96 %** |
| Gaps critiques | 2 | 0 | 0 |
| ❌ dans la matrice | 15 | 1 | **0** |

---

## 2. Ce qui a changé depuis la passe du matin

### §1.8 Séries imbriquées : de 3✅/1❌/2❓ à 5✅/1❓

Le seul ❌ de la matrice précédente — le line-up — est implémenté (`getSubSeries`, `src/helpers/index.ts:296`), et deux des trois ❓ sont levés par le contenu de démo.

| Obligation §1.8 | Statut | Note |
|---|---|---|
| Route `/<prefix>/<conteneur>/` générée automatiquement | ✅ | `examples/demo-site` porte `festival-2024/`, conteneur daté avec sa galerie propre et deux sous-séries ; `tests/e2e/routes.test.ts` assert sa page. **Vérifié empiriquement**, contre ❓ au matin |
| Route `/<prefix>/<conteneur>/<sous-slug>/` | ✅ | Idem — les deux sous-séries ont leur page |
| Page conteneur : body + galerie propre + line-up | ✅ | `src/routes/series-detail.astro` — le line-up est rendu après les documents joints, l'invariant §1.9 est préservé |
| Cover du conteneur traversant un sous-dossier | ❓ | Résolution `image()` native d'Astro, plausible mais non exercée : aucune série de démo n'a de `cover` pointant vers `./sous-slug/media/…` |
| Listing global aplati par défaut | ✅ | |
| Compatibilité minimum | ✅ | |

Le point à retenir de l'implémentation n'est pas le helper mais **son périmètre**. §1.8 limite l'imbrication à un niveau et distingue explicitement le conteneur du rangement de §1.2 :

> « `archives/music/concerts/2010/<slug>/` est une série rangée à quatre segments de profondeur — pas une sous-série de quatrième niveau. […] L'imbrication commence quand un dossier **porteur d'un `index.md`** en contient un autre. »

`getSubSeries()` ne retient donc que les entrées situées exactement un segment plus bas. Trois cas limites sont verrouillés par les tests, dont `festival-2024-bis` face au conteneur `festival-2024` : un `startsWith()` sans séparateur l'aurait embarqué.

Le champ `lineup_order` (`src/schema.ts:115`) referme au passage le gap **M2**, qui dépendait de celui-ci.

### §2.0.1 Presets : 🟡 → ✅

Le dernier écart de vocabulaire est refermé. Les six presets portent les noms de l'Annexe G (`src/presets.ts:23`) ; `photo` reste un alias déprécié qui résout à l'identique en avertissant, retiré en 1.0.

La table `PRESETS` ne porte que les noms de l'annexe, les alias vivant dans `PRESET_ALIASES` — de sorte que le message d'erreur d'un preset inconnu ne suggère jamais un nom déprécié.

Les préfixes restent localisés en français, ce que §2.0.1 autorise explicitement et que §0.5 de la spec confirme depuis la v2.7.

### §3.2 Types partagés : `pageSize` livré

`PaginationResult<T>` porte désormais `pageSize` (`src/helpers/index.ts:37`, retourné en `:521`). Gap **M1**, signalé dans trois rapports consécutifs — juin, juillet, août — pour un quart de journée d'effort.

Reste 🟡 sur ce périmètre : le type `Series` est toujours délégué à `CollectionEntry` d'Astro plutôt qu'exposé en objet plat. C'est une contrainte du runtime, pas un oubli — inchangé et assumé depuis juin.

---

## 3. Gaps restants

### Critique

**Aucun.**

### Haut

**Aucun.** H1 et H2, les deux derniers, sont refermés.

### Moyen

| # | Section | Exigence | État | Effort |
|---|---|---|---|---|
| M1 | §1.10 | Route de section optionnelle (body + liste des contenus) | `getSections()` et `isSection()` sont exposés, la route ne l'est pas. §1.10 la donne en **PEUT** — le plugin fournit la matière, le site compose sa page | S (0,5j) |
| M2 | §2.1 | Import path `hyperfocale/astro/components` | Toujours `@regrets/hyperfocale/components/<Nom>.astro`. Écart de nommage de package, inchangé depuis juin | S |
| M3 | §1.5 | `remoteImageSchema` (`src/schema.ts:49-53`) exige `url` alors que `getSeriesImages` accepte aussi `file:`/`src:` | Inchangé. Une entrée `images: [{ file: '01.jpg' }]` échoue à la validation Zod avant d'atteindre le helper | XS |
| M4 | §1.8 | Cover de conteneur traversant un sous-dossier | Non exercé par le demo-site — seul ❓ restant de la matrice | XS (ajouter un `cover: './set-aurore/media/01.png'` au conteneur de démo) |
| M5 | Annexe A | CLI `hyperfocale-lint` | Absent (inchangé depuis juin) | M |
| M6 | Annexe E | Flux RSS / JSON Feed | Absent (inchangé depuis juin) | M |

M4 est le moins cher de la liste et transformerait le dernier ❓ en verdict. M3 traîne depuis juillet pour un effort comparable.

---

## 4. Hors périmètre spec — dette interne refermée

Deux cartes du backlog ne correspondent à aucune exigence de la spec, mais méritent d'être consignées :

**ARCH-004** — option `imageOptimization` et `srcset` omis en développement. Quand un site délègue l'optimisation à son hébergeur, les URLs générées pointent vers un endpoint inexistant en local et chaque variante répondait 404.

**ARCH-005** — la mesure a tranché **contre** l'implémentation. Un build de 126 séries produisant 127 pages ne déclenche **qu'un seul appel** à `getCollection` : le cache module-level survit à l'ensemble du build SSG. Le `warmSeriesCache()` que la carte envisageait « si nécessaire » aurait été du code mort. Ce qui est livré à la place — `getCollectionFetchCount()` et le flag `HYPERFOCALE_DEBUG_CACHE=1` — permet de rejouer la mesure après une montée de version d'Astro qui changerait le découpage en chunks.

**Le backlog du plugin est vide.** Ni Todo, ni Backlog, ni Blocked.

---

## 5. Résumé exécutif

Le plugin passe de **92 % à 96 %**, et pour la première fois **aucun ❌ ne subsiste dans la matrice de conformité**. Les quatre gaps ouverts au matin — H1, H2, M1, M2 — sont refermés dans la journée.

Trois observations méritent d'être retenues au-delà du score :

**Le dernier ❌ était une fonctionnalité, pas une négligence.** Le line-up de §1.8 demandait de trancher ce qu'est une sous-série — question que la spec traite explicitement, en distinguant l'imbrication (§1.8, un niveau) du rangement (§1.2, profondeur libre). Un helper naïf aurait confondu les deux ; c'est ce que les tests verrouillent.

**Un gap s'est refermé sans écrire de code.** ARCH-005 demandait de mesurer avant de décider. La mesure a montré que le correctif envisagé était inutile. Refuser d'implémenter est ici le livrable — accompagné de l'instrument qui permettra de reposer la question à bon escient.

**Un progrès est venu de la spec, pas du plugin — puis le plugin a rattrapé le reste.** L'Annexe G v2.7, issue de l'audit de juillet, avait standardisé quatre profils repris du plugin ; la v0.12.0 aligne le cinquième. Le cycle spec ↔ implémentation a fonctionné dans les deux sens en une semaine.

Ce qui reste tient en deux lignes : le dernier ❓ (cover de conteneur traversant) coûte un fichier de démo, et `remoteImageSchema` (M3) valide un contrat plus étroit que ce que les helpers acceptent réellement.
