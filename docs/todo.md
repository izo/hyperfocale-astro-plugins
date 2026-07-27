---
kanban-plugin: board
project: hyperfocale
version: "0.7.0"
updated: 2026-07-20
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

- [ ] #SPEC-001 [P1] Page d'index de section (§1.10) — champ `type` #spec #effort-m
  **Zone** : `src/schema.ts`, `src/helpers/index.ts`, `src/index.ts`
  **Effort** : M (1,5-2j)
  **Dépendances** : —

  **Contexte** : gap **critique** C1 de l'audit du 2026-07-27. §1.10 (introduit v2.6) définit `type: section` pour les pages de rangement, qui n'ont pas de `date`. Le plugin n'a aucun champ `type` (`src/schema.ts`), et `date` est requise par défaut (`src/schema.ts:86`) — un `index.md` conforme à la v2.6 **casse donc le build Astro**. Cinq fichiers du corpus de `mathieu-drouet.com` sont dans ce cas.

  **Checklist** :
  - [ ] Champ `type` optionnel (défaut `series`, valeur alternative `section`) au schéma
  - [ ] `date` non requise quand `type: section`, sans toucher au défaut des séries
  - [ ] Exclure les sections des listings, flux et tri par date (`getSeriesList`, cache)
  - [ ] Tests : une section ne casse pas le build et n'apparaît pas dans les listings

- [ ] #SPEC-002 [P1] Manifeste d'images externalisé (§1.5.1) — `images.json` #spec #effort-m
  **Zone** : `src/helpers/index.ts`
  **Effort** : M (1,5-2j)
  **Dépendances** : —

  **Contexte** : gap **critique** C2 de l'audit du 2026-07-27. §1.5.1 (introduit v2.6) permet d'externaliser l'ordre et les métadonnées des images dans un `images.json` prioritaire sur le glob de `media/`. Aucune trace dans `src/`.

  **Checklist** :
  - [ ] Lecture de `images.json` dans `getSeriesImages`, prioritaire sur le glob
  - [ ] Formes courte et longue d'entrée, résolution des URLs
  - [ ] Fallback non bloquant si le fichier est absent ou malformé
  - [ ] Tests : priorité sur le glob, ordre préservé, tolérance aux erreurs

## In Progress

## Blocked

## Review

## Done

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
