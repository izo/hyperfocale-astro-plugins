# Audit qualité de code & architecture — `@izo/hyperfocale` v0.4.0

**Date** : 2026-06-24
**Périmètre** : intégralité de `src/` (TypeScript, composants Astro, routes, schéma Zod, CLI, thème CSS)
**Nature** : librairie / intégration Astro 6 publiée (GitHub Packages)
**Mode** : READ-ONLY — aucun fichier modifié

---

## Résumé exécutif

Le plugin est bien structuré pour sa taille (~1400 lignes), avec une séparation claire des responsabilités (intégration / schéma / helpers / composants / routes / CLI), des conventions de nommage cohérentes (`hf-*`, JSDoc systématique en français), une accessibilité soignée (focus trap, `aria-*`, `prefers-reduced-motion` partiellement) et un typage globalement strict (tsconfig `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`).

Cependant l'audit révèle **un bug critique de build** (API Astro legacy `series.render()` qui n'existe plus en Astro 6), une **double source de vérité pour le schéma Zod** (le module virtuel inline dans `index.ts` diverge de `schema.ts` en syntaxe — Zod 3 vs Zod 4 — et en contenu), et une **incohérence systémique autour du champ `date`** : la feature `dateRequired: false` est annoncée publiquement mais provoque un crash au build sur trois fichiers qui déréférencent `date` sans garde. Le mode distant (`images[]`) est par ailleurs ignoré sur les pages de galerie ≥ 2.

Ces défauts ne sont pas détectés par la suite de tests (56/56 verts) parce que les e2e ne couvrent ni `dateRequired: false`, ni les séries multi-pages, ni le mode distant paginé.

### Score qualité : **6.5 / 10**

| Dimension | Note | Commentaire |
|-----------|------|-------------|
| Architecture & séparation | 8/10 | Modules cohérents, couplage faible, barrel exports propres |
| Typage TypeScript | 6/10 | tsconfig strict mais casts `as` masquant des incohérences réelles (`date`, `image()`) |
| Robustesse / edge cases | 5/10 | Bug `render()`, `date` non gardée, mode distant cassé en pagination |
| Cohérence / DRY | 5/10 | Schéma Zod dupliqué et désynchronisé, logique de normalisation de préfixe répétée 5× |
| API publique & exports | 7/10 | Helpers clairs mais `getSeriesBySlug` mort, exports `.astro` fragiles |
| Schéma Zod & props | 6/10 | Bon design, mais syntaxe mixte Zod 3/4 et typage `date` trompeur |

---

## Findings par sévérité

### 🔴 CRITIQUE

#### C1 — API Astro legacy `series.render()` casse le build des séries multi-pages
**Fichier** : `src/routes/series-page.astro:57`

```ts
const { Content } = await series.render();
```

La méthode `entry.render()` a été **supprimée d'Astro** (dépréciée en Astro 4, retirée en Astro 5+). En Astro 6 il faut la fonction nommée `render(entry)` importée depuis `astro:content` — ce que fait correctement le fichier frère `series-detail.astro:30` (`const { Content } = await render(series);`). L'import `import { render } from 'astro:content'` est d'ailleurs déjà présent en tête de `series-page.astro:2` mais **n'est pas utilisé**.

**Impact** : toute série comportant plus d'une page de galerie (`images > pageSize`) génère une route `[slug]/[page]/` qui échoue au build (`series.render is not a function`). Non couvert par les e2e (aucune série de démo ne dépasse `pageSize=12`).

**Reco** : remplacer par `const { Content } = await render(series);` (identique à `series-detail.astro:30`).

---

#### C2 — Le champ `date` est déréférencé sans garde alors que `dateRequired: false` est une feature publique
**Fichiers** :
- `src/components/SeriesCard.astro:15` — `date.toLocaleDateString(...)`
- `src/components/SeriesCard.astro:49` — `date.toISOString()`
- `src/routes/series-detail.astro:46-47` — `series.data.date.toISOString()` / `.toLocaleDateString(...)`
- `src/routes/series-page.astro:73-74` — idem

L'option `dateRequired: false` (documentée dans `HyperfocaleOptions.dateRequired`, `index.ts:46`, et dans le schéma `index.ts:155`) rend `date` **optionnel** dans la collection. Mais ces quatre emplacements appellent directement `date.toISOString()` / `.toLocaleDateString()` sans vérifier la présence. À l'inverse, `getSeriesList` (`helpers/index.ts:38-39`) traite déjà `date` défensivement comme `Date | undefined`.

Le typage masque le problème : `SeriesData.date` est déclaré **non-optionnel** (`schema.ts:101`, `date: Date`), donc le compilateur ne signale rien, mais à l'exécution Astro fournit `date: undefined` quand `dateRequired: false`.

**Impact** : crash au build (`Cannot read properties of undefined (reading 'toISOString')`) dès qu'une collection utilise `dateRequired: false` et affiche un `SeriesCard` ou une page de série. La feature annoncée est inutilisable de bout en bout.

**Reco** :
1. Garder l'affichage de date derrière `{date && (...)}` dans les trois `.astro`.
2. Aligner le typage : exposer `SeriesData.date?: Date` (ou utiliser `SeriesDataOptionalDate` partout) pour que TS force la garde au lieu de la masquer.

---

### 🟠 HAUT

#### H1 — Mode distant (`images[]`) ignoré sur les pages de galerie ≥ 2
**Fichier** : `src/routes/series-page.astro:47`

```ts
const allImages = await getSeriesImages(slug);   // ← 2e argument `series` manquant
```

`getSeriesImages(slug, series?)` (`helpers/index.ts:66-75`) ne lit le mode distant `series.data.images[]` que si le 2e argument `series` est fourni. Ici il est omis alors que `series` est disponible dans `Astro.props` (utilisé lignes 65, 73, 76). Conséquence : pour une série en mode distant, **la page 1 (`series-detail.astro:24`, qui passe bien `series`) affiche les images distantes, mais les pages 2..N retombent sur le scan local `import.meta.glob` et renvoient une galerie vide** (ou incohérente).

**Reco** : `const allImages = await getSeriesImages(slug, series);`.

---

#### H2 — Double source de vérité pour le schéma Zod, désynchronisée et en syntaxe Zod 3
**Fichiers** : `src/index.ts:157-201` (module virtuel inline) vs `src/schema.ts:17-91`

Le même schéma `series` existe en **deux exemplaires** :
- `schema.ts` : syntaxe **Zod 4** — `z.looseObject(...)` (`:17`, `:78`), `z.url()` (`:37`).
- module virtuel inliné dans `index.ts` : syntaxe **Zod 3** — `.passthrough()` (`:176`, `:199`), `z.string().url()` (`:179`).

Or `package.json` déclare `zod: ^4.0.0` en peerDependency. En Zod 4, `.passthrough()` et `z.string().url()` sont **dépréciés** (warnings de dépréciation, retrait annoncé en Zod 5). Le module virtuel — c'est-à-dire le schéma **réellement consommé** par les sites via `virtual:hyperfocale/collection` — est donc sur l'API legacy, tandis que `schema.ts` (exporté publiquement mais jamais branché sur le runtime) est modernisé.

Au-delà de la dette : risque de **divergence fonctionnelle silencieuse**. Toute évolution du schéma doit être répliquée manuellement aux deux endroits ; rien ne le garantit (le commentaire `index.ts:150` justifie l'inlining par la résolution de chemin src/dist, mais n'empêche pas la dérive).

**Reco** :
1. Uniformiser sur Zod 4 dans le module virtuel : `.passthrough()` → `z.looseObject(...)`, `z.string().url()` → `z.url()`.
2. À terme, dériver la string du module virtuel depuis une source unique (générer le code inline à partir d'une description partagée, ou documenter explicitement le contrat de synchronisation avec un test qui parse les deux et compare les `shape`).

---

#### H3 — Cast `as Date | undefined` qui contredit le type déclaré et trahit l'incohérence du modèle
**Fichier** : `src/helpers/index.ts:38-39`

```ts
const dateA = (a.data.date as Date | undefined)?.getTime() ?? 0;
const dateB = (b.data.date as Date | undefined)?.getTime() ?? 0;
```

Le cast force `date` en `Date | undefined` alors que le type inféré de `CollectionEntry<'series'>.data.date` est `Date` (cf. `SeriesData.date: Date`). Ce cast est la preuve que l'auteur **sait** que `date` peut être `undefined` à l'exécution (mode `dateRequired:false`), mais le contourne localement par un `as` au lieu de corriger le type source — ce qui laisse C2 non détecté ailleurs. Symptôme d'un modèle de données incohérent (cf. C2/H2).

**Reco** : corriger le type de `SeriesData.date` en `date?: Date` (ou typer la collection avec une union selon l'option). Le `as` disparaît alors naturellement et le compilateur protège les sites d'appel.

---

### 🟡 MOYEN

#### M1 — `getSeriesBySlug` exporté dans l'API publique mais jamais utilisé ni couvert en intégration
**Fichier** : `src/helpers/index.ts:48-54`
Le helper n'est appelé par aucune route (toutes passent par `getStaticPaths` + `Astro.props`). Il fait partie de l'API publique (documenté dans le README du demo-site), donc à conserver, mais son comportement d'erreur (`throw` si introuvable, `:51`) n'est testé qu'en unit éventuellement, jamais en conditions réelles. À garder mais à couvrir par un test dédié, ou à documenter comme « API consommateur uniquement ».

#### M2 — Logique de normalisation du préfixe dupliquée 5 fois
**Fichiers** : `index.ts:83`, `SeriesCard.astro:21`, `SeriesGallery.astro:22` (`baseUrl`), `series-detail.astro:27`, `series-page.astro:54`
Le motif `x.endsWith('/') ? x.slice(0, -1) : x` est répété à l'identique cinq fois. Extraire un util `stripTrailingSlash(s: string)` (ou `normalizePrefix`) dans un module partagé réduit la dette et garantit la cohérence si la règle évolue.

#### M3 — Calcul N+1 de `getSeriesImages` au build (pagination)
**Fichier** : `src/routes/series-page.astro:15-18` puis `:47`
`getStaticPaths` appelle `getSeriesImages(s.id, s)` pour **chaque** série afin de calculer `totalPages`, puis chaque page re-scanne `import.meta.glob` via `getSeriesImages(slug)`. Sur un site à nombreuses séries/images, le scan glob (eager, `helpers/index.ts:78`) est ré-exécuté pour chaque page générée. Acceptable à petite échelle, mais à surveiller. Reco : mémoïser le résultat de `import.meta.glob` (constante module-level) — il est statique au build.

#### M4 — Cast de props `image as Parameters<typeof Image>[0]['src']` masquant l'incompatibilité local/distant
**Fichier** : `src/components/SeriesGallery.astro:49` (et `schema.ts:82` `image() as z.ZodTypeAny`)
Le composant `<Image>` d'`astro:assets` attend un `ImageMetadata` Astro (objet avec `src/width/height/format` issu de l'optimiseur), or en mode distant `getSeriesImages` fabrique un objet `{ src: url, width: 0, height: 0, format }` (`helpers/index.ts:69-74`). Le cast force le passage mais : (a) `width/height = 0` produit un markup invalide ; (b) `<Image>` ne sait pas optimiser une URL distante sans `width/height` réels. Le mode distant + `<Image>` est donc fragile. Reco : pour le mode distant, basculer sur `<img>` natif (comme la lightbox `SeriesLightbox.astro:43`) ou exiger `width/height` dans `remoteImageSchema`.

#### M5 — `format` déduit par `url.split('.').pop()` non fiable
**Fichier** : `src/helpers/index.ts:73`
`format: img.url.split('.').pop() ?? 'jpg'` casse sur les URLs CDN avec query string (`?w=800`) ou sans extension (`/image/12345`). Reco : nettoyer la query string (`new URL(url).pathname`) ou rendre `format` optionnel et le laisser indéterminé en distant.

#### M6 — CLI : injection par regex fragile dans `content.config.ts`
**Fichier** : `src/cli/init.ts:56`
`updated.match(/export\s+const\s+collections\s*=\s*\{([^}]*)\}/s)` échoue silencieusement si l'objet `collections` contient des accolades imbriquées (ex. une collection définie inline `{ schema: z.object({...}) }`) : `[^}]*` s'arrête à la première `}`. Le fallback (`:70`) crée alors un **second** `export const collections`, produisant un fichier invalide (double déclaration). Reco : détecter ce cas (présence d'un `export const collections` déjà matché partiellement) et avertir plutôt que d'ajouter en aveugle ; idéalement parser via un AST léger ou au minimum documenter la limite.

---

### 🟢 BAS

#### B1 — `theme` injecté mais jamais appliqué au DOM
**Fichier** : `src/index.ts:213` (`HYPERFOCALE_THEME`) + `theme/base.css`
L'option `theme` est validée, exposée via `import.meta.env.HYPERFOCALE_THEME` et le CSS gère `[data-hf-theme="light|dark"]`, mais **aucun code ne pose l'attribut `data-hf-theme`** sur `<html>`. Le thème `'light'`/`'dark'` explicite est donc inopérant ; seul `'auto'` (media query, `base.css:46`) fonctionne. Reco : injecter `data-hf-theme={theme}` dans le `<html>` des routes, ou via un `injectScript('before-hydration', ...)`.

#### B2 — `<img>` lightbox sans `width`/`height` → CLS potentiel
**Fichier** : `src/components/SeriesLightbox.astro:43-49`
L'image de la lightbox n'a pas de dimensions, alors que les données `width/height` sont sérialisées (`:68`) mais non utilisées au rendu. Reco : appliquer `width`/`height` depuis `images[current]` dans `show()` (`:88-97`).

#### B3 — `prefers-reduced-motion` non respecté
**Fichiers** : `SeriesCard.astro:61` (transitions transform), `SeriesGallery.astro`, `SeriesLightbox.astro`
Plusieurs `transition`/`transform` animés sans `@media (prefers-reduced-motion: reduce)`. Accessibilité. Reco : neutraliser les transitions sous cette media query dans `base.css`.

#### B4 — `import.meta.env.DEV` pour le filtrage `draft` dans une lib statique
**Fichier** : `src/helpers/index.ts:34`
`if (import.meta.env.DEV) return true;` montre tous les drafts en dev. Correct, mais le commentaire parle de « production » sans préciser que c'est `DEV` (build `astro build` = `DEV` false). Cohérent mais à documenter pour éviter la confusion `DEV` vs `import.meta.env.PROD`.

#### B5 — Barrel `components/index.ts` n'exporte aucun composant, seulement des types
**Fichier** : `src/components/index.ts:11-12`
Le commentaire explique le choix (les `.astro` sont résolus par leurs entrypoints), mais `import { SeriesCard } from '@izo/hyperfocale/components'` (suggéré ligne 2) **ne fonctionnera pas** — seuls les sous-chemins `./components/SeriesCard.astro` du `package.json` marchent. Reco : corriger le commentaire trompeur, ou réellement re-exporter les composants si Astro le permet.

#### B6 — `lang="fr"` codé en dur dans les routes injectées
**Fichiers** : `series-list.astro:10`, `series-detail.astro:34`, `series-page.astro:61`
Le `<html lang="fr">` est figé alors que le schéma expose `lang` par série (`schema.ts:84`) et que le plugin se veut multi-collection/multilingue. Reco : dériver `lang` de la série quand disponible.

#### B7 — `alt` générique sur les images de galerie et lightbox
**Fichiers** : `SeriesGallery.astro:51` (`Photo ${n}`), `SeriesLightbox.astro:93` (`Image ${n} sur ${m}`)
Le mode distant fournit pourtant `images[].alt` (`schema.ts:38`), ignoré au rendu. Accessibilité. Reco : utiliser `img.alt` quand présent, fallback sur le libellé générique.

---

## Dette technique (synthèse)

| # | Dette | Effort | Priorité |
|---|-------|--------|----------|
| H2 | Schéma Zod dupliqué (index.ts inline ↔ schema.ts), syntaxe Zod 3 dans le module virtuel | M | Haute |
| C2/H3 | Modèle `date` incohérent (type non-optionnel vs runtime optionnel) | S | Haute |
| M2 | `stripTrailingSlash` dupliqué ×5 | S | Moyenne |
| M3 | Scan `import.meta.glob` non mémoïsé (N+1 au build) | S | Moyenne |
| M4/M5 | Mode distant + `<Image>` fragile, `format` déduit de l'URL | M | Moyenne |
| B1 | Option `theme` explicite inopérante | S | Basse |

**Couverture de test manquante (cause racine de la non-détection de C1/C2/H1)** : aucun test e2e ne couvre (a) une série multi-pages (`images > pageSize`), (b) `dateRequired: false`, (c) le mode distant `images[]`. Ce sont précisément les trois axes où se concentrent les bugs.

---

## Quick wins (effort minimal, fort impact)

1. **C1** — `series-page.astro:57` : `series.render()` → `render(series)`. Une ligne, débloque le build multi-pages.
2. **H1** — `series-page.astro:47` : ajouter l'argument `series` à `getSeriesImages`. Une ligne, répare le mode distant paginé.
3. **C2** — entourer les 4 affichages de date d'une garde `{date && ...}` + passer `SeriesData.date?` en optionnel. Rend `dateRequired:false` réellement utilisable.
4. **H2** — dans le module virtuel `index.ts`, `.passthrough()` → `z.looseObject`, `z.string().url()` → `z.url()`. Aligne sur Zod 4.
5. **M2** — extraire `stripTrailingSlash()` et l'utiliser aux 5 emplacements.
6. **B5** — corriger le commentaire trompeur de `components/index.ts:2`.

---

## Conclusion

Architecture saine et code lisible, mais la note est tirée vers le bas par un **bug de build critique** (`render()` legacy), une feature publique cassée de bout en bout (`dateRequired:false` + `date` non gardée), un **mode distant à moitié branché** (pages ≥ 2), et une **dette de duplication de schéma** qui crée un risque de divergence permanent. Les quatre premiers quick wins (≈ 6 lignes au total) suffisent à éliminer les findings critiques. La priorité structurelle reste l'unification du schéma Zod (H2) et la cohérence du modèle `date` (C2/H3), à accompagner de tests e2e sur les trois scénarios non couverts.
