# Audit complet — @izo/hyperfocale v0.4.0

**Date :** 2026-06-24  
**Version auditée :** 0.4.0 (commit bdb8a4c)  
**Tests :** 56/56 ✅  
**Rapports détaillés :** `audit-code-2026-06-24.md` · `audit-perf-2026-06-24.md` · `audit-a11y-2026-06-24.md` · `audit-securite-2026-06-24.md`

---

## Scores

| Axe | Score | Critiques | Hauts | Moyens | Bas |
|-----|-------|-----------|-------|--------|-----|
| Code & architecture | 6.5/10 | 2 | 3 | 6 | 7 |
| Performance (build-time) | 5.5/10 | 2 | 3 | 3 | 2 |
| Accessibilité (WCAG 2.1 AA) | 6.0/10 | 3 | 4 | 5 | 3 |
| Sécurité (OWASP-like) | 8.5/10 | 0 | 0 | 2 | 4 |
| **Moyenne pondérée** | **6.6/10** | **7** | **10** | **16** | **16** |

---

## Blockers publication

**0 CRITIQUE en sécurité. Aucun blocker de publication.**

Les 7 findings Critique des axes code/perf/a11y sont des **régressions fonctionnelles ou violations WCAG** — ils justifient une 0.4.1 rapide mais ne bloquent pas la distribution du package actuel.

---

## Findings Critique — priorité absolue

### Code C1 — `series.render()` casse le build multi-pages
- **Fichier :** `src/routes/series-page.astro` (lignes appel render)
- **Problème :** API `render()` supprimée dans Astro 5+. Build échoue pour toute série avec `>1` page de galerie.
- **Reco :** Migrer vers `render(series)` importé de `astro:content` ou supprimer l'appel si non-nécessaire.

### Code C2 — `date` déréférencée sans garde (`dateRequired: false`)
- **Fichier :** `src/helpers/` + routes
- **Problème :** `dateRequired` est une option publique (valeur par défaut `false`) mais le code accède à `series.data.date` sans vérifier l'absence. Runtime crash si le consommateur n'a pas de champ `date`.
- **Reco :** Ajouter une garde `if (series.data.date)` partout où la valeur est utilisée.

### Perf C-01 — `getCollection` appelé sans cache (N×/page, N×/build)
- **Fichier :** `src/helpers/` + routes
- **Problème :** Confirme le ticket **#MVP-003** [P0]. Chaque helper (`getSeriesList`, `getSeriesBySlug`, `getSeriesImages`, etc.) appelle `getCollection` indépendamment. Sur un site avec N pages × M séries, c'est N×M appels.
- **Reco :** Singleton mémoïsé en module-scope (Map ou module-level variable) — voir rapport détaillé pour le pattern exact.

### Perf C-02 — Double scan images dans `series-page.astro`
- **Fichier :** `src/routes/series-page.astro`
- **Problème :** `import.meta.glob` + `getSeriesImages` invoqués deux fois par page rendue.
- **Reco :** Appel unique, résultat passé en prop aux composants.

### A11y C1 — Alt non descriptif dans la lightbox (`Image N sur M`)
- **Fichier :** `SeriesLightbox.astro:93`
- **WCAG :** 1.1.1 Contenu non textuel (Niveau A)
- **Problème :** Le texte alternatif est généré algorithmiquement (`Image 1 sur 10`) — aucune description de l'image pour les lecteurs d'écran.
- **Reco :** Transmettre le champ `alt` (ou `title`) dans le JSON sérialisé des images.

### A11y C2 — Alt générique dans la galerie (`Photo N`)
- **Fichier :** `SeriesGallery.astro:53`
- **WCAG :** 1.1.1 Contenu non textuel (Niveau A)
- **Problème :** Même cause racine que C1 — le schéma Zod ne transporte pas de champ `alt` pour les images.
- **Reco :** Ajouter un champ optionnel `alt` dans `ImageMetadata` (schéma Zod) et le propager dans les composants.
- **Note :** Ce finding est lié à **#DATA-002** [P0] (Enrichir le schéma Zod).

### A11y C3 — Boutons pagination désactivés non sémantiques
- **Fichier :** `SeriesGallery.astro:70,94`
- **WCAG :** 2.1.1 Clavier (A), 4.1.2 Nom, rôle, valeur (A)
- **Problème :** `<span aria-disabled>` utilisé à la place de `<button disabled>` — les lecteurs d'écran n'annoncent pas l'état désactivé.
- **Reco :** Remplacer par `<button disabled>` avec style CSS approprié.

---

## Findings Haut — priorité élevée

| Axe | ID | Fichier | Problème | Reco courte |
|----|-----|---------|---------|------------|
| Code | H1 | `src/routes/series-page.astro` | Mode images distantes (`images[]`) ignoré sur pages ≥ 2 | Propager `images[]` à toutes les pages |
| Code | H2 | `src/index.ts` + `src/schema.ts` | Schéma Zod dupliqué, désynchronisé, syntaxe Zod 3 résiduelle | Source unique dans `schema.ts`, module virtuel pointe dessus |
| Code | H3 | `src/helpers/` | Cast `as Date \| undefined` masquant incohérence modèle | Unifier le type `date` (optionnel ou requis, pas les deux) |
| Perf | H-01 | `src/helpers/images.ts` | `import.meta.glob` recalculé à chaque `getSeriesImages` | Hisser le glob en module-scope |
| Perf | H-02 | `SeriesLightbox.astro` | Toutes les images sérialisées dans le HTML même sans lightbox | Lazy-load JSON ou pagination côté client |
| Perf | H-03 | `src/routes/series-page.astro` | `render(series)` appelé sur chaque page de pagination | Appel unique, cache résultat |
| A11y | H1 | `src/theme/base.css:30` | Absence `prefers-reduced-motion` | Ajouter media query dans `base.css` |
| A11y | H2 | `src/routes/` | Absence de `<main>` + `lang` inadapté en pagination | Ajouter `<main>`, `lang` dynamique |
| A11y | H3 | Routes pagination | Liens numérotés sans `aria-label` descriptif | `aria-label="Page 3"` sur chaque lien |
| A11y | H4 | Routes | Lien de retour sans texte descriptif | Texte visible ou `aria-label` |

---

## Sécurité — aucun blocker

Score 8.5/10. Bonnes pratiques validées : pas de secret exposé, pas de `postinstall` dangereux, validation des options de l'intégration, `files` npm propre.

Deux Moyens à corriger avant la prochaine mineure :
- **M-1** `cli/init.ts:56-64` — Fusion `content.config.ts` par regex fragile, sans sauvegarde. Ajouter backup ou mode dry-run.
- **M-2** `cli/init.ts:45,52` — Idempotence basée sur `includes(string)` : risque de faux positifs. Utiliser une détection AST ou regex bornée.

---

## Convergences inter-axes (mêmes causes racines)

| Cause racine | Axes touchés | Tickets liés |
|-------------|-------------|-------------|
| Schéma Zod sans champ `alt` pour les images | Code (H2) + A11y (C1, C2) | **#DATA-002** [P0] |
| `getCollection` non mémoïsé | Code (M3) + Perf (C-01) | **#MVP-003** [P0] |
| Mode images distantes incomplet | Code (H1) | — |
| `prefers-reduced-motion` absent | Code (B3) + A11y (H1) | — |
| `lang` hardcodé FR | Code (B6) + A11y (H2) | — |

---

## Prochaines étapes recommandées

### Court terme — patch 0.4.1

1. **Fixer Code C1** (`series.render()`) — bloquant build multi-pages
2. **Fixer Code C2** (garde sur `date`) — crash runtime consommateur
3. **Fixer A11y C3** (`<button disabled>`) — WCAG A, 30 min
4. **Implémenter #MVP-003** (cache singleton) — P0 déjà au todo

### Moyen terme — mineure 0.5.0

5. **Enrichir schéma Zod** avec champ `alt` (#DATA-002 P0) — résout A11y C1 + C2 simultanément
6. **Implémenter #ARCH-003** (routes catch-all hiérarchiques)
7. **Unifier le schéma Zod** (Code H2) — source unique, fin de la double source
8. **Corriger CLI** (Sécurité M-1, M-2) — robustesse pour les consommateurs
9. **Ajouter `prefers-reduced-motion`** dans `base.css`

### Backlog

10. `querySeries()` avec filtres (#DATA-003 P1)
11. Cover fallback (#MVP-004 P1)
12. Mode distant complet (Code H1)
