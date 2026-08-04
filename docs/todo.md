---
kanban-plugin: board
project: hyperfocale
version: "0.11.0"
updated: 2026-08-04
priorities:
  P0: Critique (bloquant)
  P1: Élevée (important)
  P2: Moyenne (utile)
  P3: Faible (nice-to-have)
efforts:
  XS: "< 30min"
  S: 1-2h
  M: 2-4h
  L: 4-8h
  XL: 1-2j
  XXL: 3-5j
prefixes:
  SETUP: Configuration, structure du package
  ARCH: Fondations, patterns, intégration Astro
  DATA: Schéma Zod, Content Collection
  MVP: Helpers TypeScript, logique métier
  FE: Composants Astro, thème CSS
  TEST: Tests unitaires et d'intégration
  DOC: Documentation, exemples
  DEPLOY: Distribution privée, packaging
---

## Backlog

- [ ] #ARCH-004 [P3] Adapter les images pour les déploiements avec optimisation côté serveur #images #effort-s
  **Zone** : `src/helpers/index.ts`, `src/components/`
  **Effort** : S (1-2h)
  **Dépendances** : #MVP-001

  **Contexte** : certains hébergeurs (Vercel, Netlify Image CDN, Cloudflare) optimisent les images à la volée. En dev local, les endpoints d'optimisation n'existent pas → 404. Ce comportement doit être détecté automatiquement.

  **Checklist** :
  - [ ] Détecter `import.meta.env.DEV` → désactiver srcSet dynamique en dev
  - [ ] Option `imageOptimization?: 'auto' | 'disabled'` dans `HyperfocaleOptions` (défaut : `'auto'`)
  - [ ] Documenter la limitation dans `README.md` (section "Déploiement")

- [ ] #ARCH-005 [P3] Cache build-time pour `getCollection` #performance #effort-m
  **Zone** : `src/helpers/index.ts`
  **Effort** : M (2-4h)
  **Dépendances** : #MVP-003

  **Contexte** : sur de grands catalogues (500+ séries), chaque route appellera `getCollection` séparément si le cache singleton du module n'est pas partagé entre les workers Vite. Évaluer et documenter les limites.

  **Checklist** :
  - [ ] Mesurer le nombre d'appels `getCollection` sur un build avec 100+ séries (via log de debug)
  - [ ] Documenter le comportement réel du cache module-level dans le contexte SSG d'Astro 7
  - [ ] Si nécessaire : proposer un helper `warmSeriesCache()` à appeler explicitement en `getStaticPaths`

## Todo

## In Progress

## Blocked

## Review

## Done

- [x] #DOC-007 [P2] Re-vérifier la conformité après §1.10 et §1.5.1 #spec #effort-s
  > ✅ **Terminé** le 2026-08-04
  **Zone** : `docs/reports/`
  **Résumé** : audit de **v0.10.0** contre la spec **v2.7-draft** → `docs/reports/conformite-spec-2026-08-04.md`. Score **92 %** (77 % au 27/07), **aucun gap critique restant** : C1 (§1.10) et C2 (§1.5.1) sont refermés, et M3 (dérive du module virtuel) avec eux — sa gravité avait été sous-estimée, il annulait la portée de C1 pour tout site passant par `hyperfocale init`. Le ❓ de §1.2 est levé : le demo-site porte désormais une série rangée à deux niveaux, assertée en e2e. Les presets passent de ⚠️ *déviant* à 🟡 *partiel* sans que le plugin change — l'Annexe G v2.7 a standardisé quatre profils repris du plugin et tranché que les préfixes localisés sont conformes ; seul `photo` → `series` reste. Gaps ouverts : line-up §1.8 (H2), et `pageSize` (M1), signalé pour la troisième fois consécutive pour un quart de journée d'effort. Correction à porter côté spec : §0.5 décrit encore le plugin en v0.8.0 avec §1.10 ❌.

- [x] #SPEC-002 [P1] Manifeste d'images externalisé (§1.5.1) — `images.json` #spec #effort-m
  > ✅ **Terminé** le 2026-08-04
  **Zone** : `src/helpers/index.ts`
  **Résumé** : gap critique C2 de l'audit du 27/07 refermé. `getSeriesImages` lit un `images.json` posé à côté d'`index.md` — priorité `images:` > `images.json` > scan de `media/`, ordre du tableau préservé (aucun tri). Formes courte (chaîne) et longue (objet) acceptées ; résolution des trois formes d'URL (absolue, absolue au site, relative à `index.md` — cette dernière passant par le glob pour récupérer dimensions réelles et optimisation Astro). La clé `files` alimente `getSeriesAttachments` (§1.9 mode distant), et `images.json` est exclu des documents joints. **Choix technique** : le manifeste est chargé en `?raw` puis parsé dans un `try`, et non importé comme JSON — un import ferait échouer Vite au parsing avant tout `catch`, alors que §1.5.1 impose un repli sur `media/` sans jamais casser le build. Un `images:` et un `images.json` sur la même série déclenchent un avertissement (règle d'exclusivité). 15 tests unitaires + 6 e2e (le demo-site porte `manifeste-2024/`, dont le manifeste ordonne 03/01/02 à rebours de l'alphabétique).

- [x] #SPEC-001 [P1] Page d'index de section (§1.10) — champ `type` #spec #effort-m
  > ✅ **Terminé** le 2026-08-04
  **Zone** : `src/schema.ts`, `src/helpers/index.ts`, `src/index.ts`, `tsup.config.ts`
  **Résumé** : gap critique C1 de l'audit du 27/07 refermé. Champ `type: 'series' | 'section'` (défaut `series`) au schéma ; `date` déclarée optionnelle dans le shape puis rendue obligatoire par un `.check()` qui épargne les sections — un champ ne pouvant être requis conditionnellement dans un shape Zod, et `.check()` survivant à `.extend()` (API d'extension #DATA-004 préservée). `isSection()` et `getSections()` exportés ; sections écartées de `getSeriesList`, `querySeries`, `getAllTags`, `getAllCollections` et donc des routes générées. **Effet de bord corrigé** : le module virtuel `virtual:hyperfocale/collection` redéclarait le shape en dur et avait déjà divergé de `src/schema.ts` (ni `attachments`, ni `files`, §1.9) — il délègue désormais à `seriesSchema()`, importé depuis `dist/schema.js` (nouvelle entrée tsup, ré-export de 195 B vers le chunk partagé). 13 tests unitaires + 4 e2e ; le demo-site porte une section `archives/` avec une série enfant.

- [x] #DOC-006 [P2] Re-vérifier la conformité à la spec canonique `izo/hyperfocale-spec` #spec #effort-s
  > ✅ **Terminé** le 2026-07-27
  **Zone** : `docs/reports/`
  **Résumé** : audit de `@izo/hyperfocale` **v0.8.0** contre la spec **v2.6-draft** (le rapport précédent portait sur v0.4.0 ↔ v2.4-draft) → `docs/reports/conformite-spec-2026-07-27.md`. Score **77 %**, 2 gaps critiques ouverts en `#SPEC-001` et `#SPEC-002`. Progrès depuis le 24/06 : §1.9 documents joints complet (9/9), §3.1 composants 7/7, fallback de cover corrigé, `alt` sur `ImageMetadata`, swipe tactile, `series.render()` déprécié remplacé. Deux corrections portées **côté spec** : §0.5 la décrivait encore en v0.4.0 (PR spec #9) et quatre presets du plugin n'étaient standardisés nulle part (PR spec #10, Annexe G v2.7-draft).

- [x] #DOC-005 [P2] README : helpers et schéma complets documentés #docs #effort-m
  > ✅ **Terminé** le 2026-07-20
  **Zone** : `README.md`
  **Résumé** : sections détaillées pour les 8 helpers restants (`querySeries`, `getSeriesAttachments`, `getSeriesCover`, `getAllTags`, `getAllCollections`, `getParentCollection`, `classifyAttachment`, `serializeSeries`, `resetSeriesCache`) avec signatures et exemples ; tableau complet du schéma (17 champs + bloc IPTC) ; table des 5 options d'intégration (`prefix`, `pageSize`, `theme`, `collectionName`, `dateRequired`) ; section « Modes avancés » (slugs hiérarchiques, images/fichiers distants, `attachments:`).

- [x] #DOC-003 [P2] Docs alignées Astro 7 + 8 composants #docs #effort-s
  > ✅ **Terminé** le 2026-07-19
  **Zone** : `CLAUDE.md`, `README.md`
  **Résumé** : corrigé « Astro 6 » → « Astro 7 » (titre, prose, badges, note module virtuel), badge TypeScript 5.x → 7.x, liste des composants portée de 4 à 8 (CLAUDE.md + README), ajout des 4 composants manquants (`SeriesAttachments`, `SeriesFilter`, `SeriesMap`, `SeriesMasonry`) et d'un récap des helpers additionnels dans le README.

- [x] #DOC-004 [P2] `spec-hyperfocale.md` racine → pointeur vers la spec canonique #docs #effort-xs
  > ✅ **Terminé** le 2026-07-19
  **Zone** : `spec-hyperfocale.md`
  **Résumé** : remplacé l'instantané périmé (Astro 6, 5 champs, 4 helpers) par un pointeur vers `izo/hyperfocale-spec` (source de vérité canonique) + rappel de la contrainte de conformité et lien vers l'audit.

- [x] #DATA-007 [P1] Documents joints — schéma `attachments:` + `files[]` distant (spec §1.9) #schema #effort-s
  > ✅ **Terminé** le 2026-07-09

- [x] #MVP-006 [P1] Helper `getSeriesAttachments()` — non-images de `media/` classés par type #helpers #effort-s
  > ✅ **Terminé** le 2026-07-09

- [x] #FE-011 [P2] Composant `<SeriesAttachments>` — pièces jointes après la galerie #composants #effort-m
  > ✅ **Terminé** le 2026-07-09

- [x] #DATA-004 [P2] API d'extension du schéma — `baseSeriesSchema` + champs personnalisés #schema #effort-s
- [x] #DATA-005 [P2] Helpers `getAllTags()` et `getAllCollections()` #helpers #effort-s
- [x] #FE-006 [P2] Renforcer le système de design tokens CSS #theme #effort-m
- [x] #FE-007 [P2] Composant `<SeriesMasonry>` (layout masonry CSS) #composants #effort-m
- [x] #FE-009 [P2] Composant `<SeriesMap>` — carte des séries géolocalisées (IPTC GPS) #composants #effort-l
- [x] #FE-010 [P2] Composant `<SeriesFilter>` — filtrage tags / date / lieu #composants #effort-l

## Archive

- [x] #MVP-005 [P2] Sérialisation JSON-safe pour islands (`serializeSeries`) #effort-xs
- [x] #DATA-003 [P1] `querySeries()` — API de requête avec filtres et pagination #effort-m
- [x] #DATA-002 [P0] Enrichir le schéma Zod — champs communs galerie #effort-s
- [x] #ARCH-003 [P0] Routes catch-all pour collections hiérarchiques #effort-m
- [x] #MVP-003 [P0] Cache singleton — éviter N appels `getCollection` #effort-s
- [x] #DATA-006 [P1] Champ `alt` dans `ImageMetadata` (galerie + lightbox) #effort-xs
- [x] #FE-008 [P1] Swipe tactile dans `<SeriesLightbox>` #effort-s
- [x] #MVP-004 [P1] Cover fallback — première image alphabétique #effort-xs
- [x] #DEPLOY-002 [P2] CLI `hyperfocale init` #effort-s (2026-04-05)
- [x] #DEPLOY-001 [P3] Packaging npm privé #effort-m (2026-04-05)
- [x] #TEST-003 [P3] Tests e2e des routes automatiques #effort-xl (2026-04-05)
- [x] #DOC-002 [P3] Documenter l'API d'extensibilité du schéma #effort-s (2026-04-05)
- [x] #DOC-001 [P3] Exemple complet de site consommateur (`examples/demo-site/`) #effort-l (2026-04-05)
- [x] #SETUP-001 [P0] Initialiser la structure du package #effort-m
- [x] #ARCH-001 [P0] Intégration Astro (`defineIntegration`) #effort-m
- [x] #DATA-001 [P0] Injecter le schéma Zod de la collection `series` #effort-m
- [x] #ARCH-002 [P0] Injecter les routes automatiques via `injectRoute()` #effort-m
- [x] #MVP-001 [P1] Implémenter les helpers TypeScript #effort-m
- [x] #MVP-002 [P1] Logique des routes (pages Astro) #effort-l
- [x] #FE-001 [P1] Composant `<SeriesCard>` #effort-s
- [x] #FE-002 [P1] Composant `<SeriesList>` #effort-s
- [x] #FE-003 [P1] Composant `<SeriesGallery>` #effort-m
- [x] #FE-004 [P1] Composant `<SeriesLightbox>` #effort-m
- [x] #FE-005 [P2] Thème CSS et custom properties `--hf-*` #effort-m
- [x] #TEST-001 [P2] Tests unitaires des helpers #effort-m
- [x] #TEST-002 [P2] Tests du schéma Zod #effort-s

%% kanban:settings
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false,true,true]}
%%
