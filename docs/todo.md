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

- [ ] #DOC-006 [P2] Re-vérifier la conformité à la spec canonique `izo/hyperfocale-spec` #spec #effort-s
  **Zone** : `docs/reports/`, `src/`
  **Effort** : S (1-2h)
  **Dépendances** : —

  **Contexte** : dernier audit de conformité daté du 2026-06-24 (70 %). Le code a évolué depuis (v0.7.0). Rafraîchir le score contre la version courante de la spec canonique.

  **Checklist** :
  - [ ] Lire la spec à jour : `gh api repos/izo/hyperfocale-spec/contents/spec-hyperfocale.md --jq '.content' | base64 -d`
  - [ ] Comparer §1.x / §3.x aux implémentations `src/schema.ts`, `src/helpers/`, `src/components/`
  - [ ] Mettre à jour `docs/reports/conformite-spec-<date>.md` avec le nouveau score et les écarts restants

## In Progress

## Blocked

## Review

## Done

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
