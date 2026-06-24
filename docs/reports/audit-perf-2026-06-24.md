# Audit de Performance — @izo/hyperfocale v0.4.0

**Date :** 2026-06-24
**Auditeur :** Agent perf-auditor (Claude Sonnet 4.6)
**Périmètre :** Librairie Astro — build statique, pas de runtime serveur

---

## Résumé exécutif

**Score global : 5.5 / 10**

Le plugin est fonctionnel et suit les bonnes pratiques Astro (SSG, `astro:assets`, lazy loading). Cependant, deux problèmes structurels de coût build-time sont avérés et documentés dans le backlog (#MVP-003, #ARCH-005) : `getCollection` est appelé sans mémoïsation à chaque route, et `getSeriesImages` rescanne toutes les images à chaque invocation. Le JS client (lightbox) est minimal et bien conçu ; le CSS injecté est raisonnable. Les principales pertes sont au build.

| Sévérité | Nombre |
|----------|--------|
| Critique | 2 |
| Haut | 3 |
| Moyen | 3 |
| Faible | 2 |

---

## Verdict explicite sur #MVP-003 (cache singleton)

**RÉEL et confirmé.** `getCollection` est invoqué **3 fois distinctes** lors d'un build avec des séries paginées :

1. `src/routes/series-list.astro:6` — `getSeriesList()` pour afficher la liste
2. `src/routes/series-detail.astro:7` — `getSeriesList()` dans `getStaticPaths()`
3. `src/routes/series-page.astro:11` — `getSeriesList()` dans `getStaticPaths()`

Chaque appel déclenche une lecture complète de la collection. Il n'existe aucune mémoïsation (pas de `Map`, pas de variable module-level, pas de closure). Avec N séries et plusieurs pages chacune, la complexité est O(routes × getCollection), soit un appel par route générée plutôt que 1 appel global.

De plus, dans `series-page.astro:16`, `getSeriesImages(s.id, s)` est appelé **pour chaque série** dans la boucle `getStaticPaths`, ce qui signifie N rescans du glob `import.meta.glob`. Puis, lors du rendu de la page, `getSeriesImages(slug)` est appelé **une seconde fois** à la ligne 47 sans utiliser les `props` déjà calculées — doublon explicite.

---

## Findings détaillés

### CRITIQUE

#### C-01 — Appels répétés `getCollection` sans cache (N+1 build-time)

**Fichiers :**
- `src/helpers/index.ts:33` — `getCollection('series', ...)`
- `src/routes/series-list.astro:6` — appel #1
- `src/routes/series-detail.astro:7` — appel #2 dans `getStaticPaths()`
- `src/routes/series-page.astro:11` — appel #3 dans `getStaticPaths()`

**Problème :** Trois appels `getSeriesList()` indépendants lors d'un build. Chacun relit toute la collection, applique le filtre draft, et re-trie par date. Le tri `O(n log n)` est effectué 3 fois à chaque build. Sur 50 séries, c'est 3 lectures complètes + 3 tris.

**Recommandation :** Introduire un singleton de module via une variable module-level dans `helpers/index.ts` :

```typescript
let _seriesCache: Series[] | undefined;

export async function getSeriesList(): Promise<Series[]> {
  if (_seriesCache) return _seriesCache;
  const all = await getCollection('series', (entry) => {
    if (import.meta.env.DEV) return true;
    return !entry.data.draft;
  });
  _seriesCache = all.sort(...);
  return _seriesCache;
}
```

Note : En build statique Astro (Vite), les modules ESM sont évalués une seule fois par processus — un singleton module-level fonctionne correctement.

---

#### C-02 — Double scan des images dans `series-page.astro`

**Fichiers :**
- `src/routes/series-page.astro:16` — `getSeriesImages(s.id, s)` dans la boucle `getStaticPaths`
- `src/routes/series-page.astro:47` — `getSeriesImages(slug)` au rendu, **sans passer `series`** en prop

**Problème :** Pour chaque série paginée, `getSeriesImages` est d'abord appelé dans `getStaticPaths` pour calculer `totalPages`, puis rappelé au rendu de chaque page sans utiliser `series` comme prop (l'argument `series` est omis, donc le mode distant n'est même pas utilisé). Avec N séries ayant P pages chacune, cela génère N appels en `getStaticPaths` + N×P appels au rendu — soit un facteur P de surcoût.

De plus, le second appel (ligne 47) n'utilise pas l'objet `series` disponible dans les props, ce qui signifie que pour les séries en mode distant (`images[]` dans le frontmatter), la branche d'optimisation est court-circuitée et le glob est exécuté inutilement.

**Recommandation :**
1. Passer `allImages` comme prop depuis `getStaticPaths` (comme `series-detail.astro` le fait avec `series`).
2. Remplacer l'appel ligne 47 par `const allImages = await getSeriesImages(slug, series);` pour activer le court-circuit mode distant.

---

### HAUT

#### H-01 — Recalcul du glob `import.meta.glob` à chaque appel `getSeriesImages`

**Fichier :** `src/helpers/index.ts:78-97`

**Problème :** `import.meta.glob(...)` avec `{ eager: true }` est statique (résolu par Vite au build), mais le filtrage `Object.entries(allImages).filter(...)` et le tri `.sort(...)` sont exécutés à chaque appel de `getSeriesImages`. Si 10 séries ont 3 pages chacune, `getSeriesImages` est appelé ~30 fois pour re-filtrer le même objet. Le tri localeCompare sur les chemins est recalculé autant de fois.

**Recommandation :** Mémoïser le résultat par slug :

```typescript
const _imageCache = new Map<string, ImageMetadata[]>();

export async function getSeriesImages(slug: string, series?: Series): Promise<ImageMetadata[]> {
  const cacheKey = slug;
  if (_imageCache.has(cacheKey)) return _imageCache.get(cacheKey)!;
  // ... calcul existant ...
  _imageCache.set(cacheKey, result);
  return result;
}
```

---

#### H-02 — Sérialisation de toutes les images dans le HTML (lightbox)

**Fichier :** `src/components/SeriesLightbox.astro:67-69`

**Problème :** La lightbox sérialise `allImages` (toutes les images de la série, pas seulement la page courante) dans un bloc `<script type="application/json">` embarqué dans chaque page HTML. Si une série a 200 images avec des URLs longues ou des dimensions, le JSON peut peser plusieurs Ko par page (N pages × taille JSON identique = duplication pure).

Le même JSON est dupliqué sur toutes les pages de pagination d'une même série.

**Recommandation :**
- Limiter la sérialisation aux images de la page courante + charger les autres via un fetch lazy au premier `open()`.
- Ou utiliser un `data-*` minimal sur chaque `<button>` de galerie et construire le tableau client-side depuis le DOM (évite le JSON embed).
- À minima, ne pas dupliquer sur chaque page : centraliser dans un endpoint JSON statique généré une fois par série.

---

#### H-03 — `render(series)` appelé sur chaque page de pagination (series-page.astro)

**Fichier :** `src/routes/series-page.astro:57`

**Problème :** La méthode `series.render()` (API dépréciée, ligne 57 utilise l'ancienne API `series.render()` au lieu de `render(series)` comme series-detail.astro) est appelée sur chaque page de pagination (pages 2, 3…), même si le contenu Markdown est identique sur toutes les pages. Cela signifie que le MDX/Markdown est compilé N fois pour la même série (une fois par page de pagination).

Note : La ligne 57 utilise `await series.render()` (API Astro 4/5) alors que `series-detail.astro:30` utilise `await render(series)` (API Astro 6 correcte). Il y a donc aussi une inconsistance d'API.

**Recommandation :**
- Si le corps Markdown n'est pas nécessaire sur les pages 2+, le supprimer du template (réduction du temps de render ET du HTML généré).
- Sinon, utiliser l'API unifiée `render(series)` (import depuis `astro:content`) pour la cohérence avec Astro 6.

---

### MOYEN

#### M-01 — Dimensions fixes hardcodées dans les composants (600×400)

**Fichiers :**
- `src/components/SeriesCard.astro:32` — `width={600} height={400}`
- `src/components/SeriesGallery.astro:52` — `width={600} height={400}`

**Problème :** Toutes les images de couverture et de galerie sont redimensionnées à 600×400 px indépendamment de leur taille d'affichage réelle (la grille peut afficher des images à 220px comme à 600px selon le viewport). Pas d'attribut `sizes` ni de `srcset` exploitant les formats générés par `astro:assets`.

**Recommandation :** Ajouter un attribut `widths` pour générer plusieurs variantes et un `sizes` descriptor :

```astro
<Image
  src={cover}
  alt={...}
  widths={[300, 600, 900]}
  sizes="(max-width: 600px) 100vw, (max-width: 900px) 50vw, 33vw"
  class="hf-card__image"
  loading="lazy"
/>
```

---

#### M-02 — Pas de `loading="lazy"` sur la première image de galerie

**Fichier :** `src/components/SeriesGallery.astro:53`

**Problème :** Toutes les images de la galerie utilisent `loading="lazy"`, y compris la première qui est above-the-fold. La première image devrait utiliser `loading="eager"` (ou `fetchpriority="high"`) pour un meilleur LCP sur desktop.

**Recommandation :**

```astro
<Image
  loading={i === 0 ? 'eager' : 'lazy'}
  fetchpriority={i === 0 ? 'high' : undefined}
  ...
/>
```

---

#### M-03 — CSS dupliqué entre composants (fallback values)

**Fichiers :**
- `src/components/SeriesCard.astro:57-133`
- `src/components/SeriesGallery.astro:117-217`
- `src/components/SeriesLightbox.astro:153-247`
- `src/theme/base.css:1-67`

**Problème :** Les valeurs de fallback CSS (`#f5f5f5`, `#e0e0e0`, `#111`, `4px`, `200ms ease`, `#0066ff`) sont répétées inline dans chaque composant via `var(--hf-xyz, fallback)`. Si `base.css` est correctement injecté (ce qui est le cas via `injectScript`), les fallbacks sont redondants et gonflent le CSS scopé de chaque composant.

**Recommandation :** Supprimer les valeurs de fallback dans les composants et se fier exclusivement aux custom properties définies dans `base.css`. Cela réduit le CSS scopé de ~20% et évite des inconsistances si les fallbacks divergent.

---

### FAIBLE

#### F-01 — Listeners `keydown` globaux non nettoyés (lightbox)

**Fichier :** `src/components/SeriesLightbox.astro:126`

**Problème :** `document.addEventListener('keydown', ...)` est ajouté sans `{ once: true }` ni `removeEventListener`. En navigation SPA (View Transitions Astro), ce listener s'accumule à chaque chargement de page.

**Recommandation :** Utiliser `document.addEventListener('astro:before-swap', cleanup)` pour retirer le listener, ou passer à un AbortController.

---

#### F-02 — `import.meta.env.HYPERFOCALE_PREFIX` recalculé à chaque rendu route

**Fichiers :**
- `src/routes/series-detail.astro:14`
- `src/routes/series-page.astro:31-32`
- `src/routes/series-list.astro:5`

**Problème :** La normalisation du préfixe (`prefix.endsWith('/') ? prefix.slice(0, -1) : prefix`) est répétée dans chaque fichier de route. C'est un recalcul trivial mais redondant — la valeur est déjà normalisée à l'initialisation dans `src/index.ts:83`.

**Recommandation :** Exporter une constante normalisée depuis les helpers ou s'assurer que `HYPERFOCALE_PREFIX` injecté via `vite.define` est toujours sans slash final (ce que `normalizeOptions` fait déjà — il suffit d'utiliser directement la valeur sans re-normaliser).

---

## Où ajouter cache / mémoïsation

| Où | Quoi | Impact estimé |
|----|------|--------------|
| `src/helpers/index.ts` après ligne 31 | Variable module-level `_seriesCache` | Réduit 3 appels `getCollection` → 1 |
| `src/helpers/index.ts` avant ligne 66 | `Map<string, ImageMetadata[]>` pour `getSeriesImages` | Réduit N×P rescans → N |
| `src/routes/series-page.astro:14-28` | Passer `allImages` en prop depuis `getStaticPaths` | Élimine N×(P-1) appels redondants |
| `src/routes/series-page.astro:47` | Passer `series` comme second arg à `getSeriesImages` | Active court-circuit mode distant |

**Gain estimé (collection de 20 séries, 3 pages/série) :**
- Avant cache : ~63 appels `getSeriesImages` + 3 appels `getCollection`
- Après cache : ~20 appels `getSeriesImages` + 1 appel `getCollection`
- Réduction : ~70% des I/O répétées au build

---

## CSS & Thème

`src/theme/base.css` est minimaliste et bien structuré (67 lignes, custom properties, dark mode via media query et data-attribute). Pas de problème structurel. Le CSS scopé par composant est injecté par Astro (pas de duplication entre pages). Seule amélioration : supprimer les fallbacks redondants (voir M-03).

## JS Client

Le JS embarqué (lightbox + listeners galerie) est du JavaScript vanilla pur, ~2 Ko non minifié, zéro dépendance externe. Pas d'hydratation Astro Island. C'est une force du design. Seul risque : accumulation de listeners en mode View Transitions (F-01).
