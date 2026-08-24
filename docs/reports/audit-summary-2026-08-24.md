# Audit consolidé — hyperfocale 0.18.0

> Généré le 2026-08-24 · commit `9f2b285` · mode `blackemperor audit`
> Audit précédent : [`audit-summary-2026-06-24.md`](audit-summary-2026-06-24.md) (v0.5.0)

## Scores

| Axe | Score | Évolution vs 2026-06-24 |
|-----|-------|--------------------------|
| Code / architecture | **8,5/10** | ↗ périmètre triplé, dette non accumulée |
| Performance | **9/10** | ↗ zéro framework client, JS inline borné |
| Accessibilité | **8/10** | → base solide, lightbox à vérifier au clavier |
| Sécurité | **5/10** | ↘ **deux XSS stockés confirmés** (nouveaux composants) |
| Documentation (`CLAUDE.md`) | **10/10** | ↗ corrigée le jour même |

**Verdict — ne pas publier de nouvelle version avant correction de `#SEC-001`.**
Le paquet 0.18.0 déjà en ligne porte la faille : les deux sites d'injection existent
depuis 0.16.0 (`BareLayout`) et bien avant pour la lightbox.

---

## 🚨 Sécurité — 2 findings HAUTS, confirmés par build

### `#SEC-001` · Rupture de `<script>` par les données de contenu

Deux emplacements sérialisent des données de contenu avec `JSON.stringify` puis les
injectent via `set:html` dans un `<script>`. `JSON.stringify` **n'échappe ni `<` ni `/`** :
une valeur contenant `</script>` ferme la balise et tout ce qui suit devient du HTML actif.

| # | Fichier | Champ vecteur | Portée |
|---|---------|---------------|--------|
| a | `src/layouts/BareLayout.astro:29` | `title`, `description` de la série (JSON-LD) | **toute route injectée** sur le layout de repli |
| b | `src/components/SeriesLightbox.astro:74` | `images[].alt` | toute page rendant la lightbox |

Le cas (a) est le plus large : `title` est **obligatoire** sur chaque série, et
`BareLayout` est le layout servi par défaut quand le site ne passe pas le sien.

**Preuve** — page construite puis `astro build` réel, HTML inspecté :

```
alt = photo</script><img src=x onerror=AUDIT_XSS_MARKER>
```

rendu dans `dist/` :

```html
<script type="application/json" id="hf-lightbox-data">[{…,"alt":"photo</script>
<img src=x onerror=AUDIT_XSS_MARKER>"}]</script>
```

Le marqueur se trouve **après** la fermeture du script : il est sorti de la zone JSON.
Page de test supprimée après vérification.

**Modèle de menace** — le contenu d'un SSG est en principe écrit par l'auteur du site,
ce qui limiterait l'impact à de l'auto-XSS. Deux raisons de ne pas s'en contenter :

1. `images.json` (§1.5.1) est **produit par des outils** — `hyperfocale-exporter` lit les
   métadonnées d'images, `hyperfocale-cms` écrit le frontmatter. Un `alt` peut donc venir
   d'un champ IPTC sans jamais passer sous les yeux d'un humain.
2. Un CMS multi-utilisateurs rend le frontmatter semi-hostile par construction.

**Correctif** (une ligne par site, sans changement d'API) :

```ts
const safe = JSON.stringify(data).replace(/</g, '\\u003c');
```

`<` est un échappement JSON valide : `JSON.parse` rend le `<` d'origine, et la
séquence `</script>` ne peut plus apparaître littéralement. Même traitement pour le
JSON-LD de `BareLayout`.

**Test de non-régression à ajouter** : une série au `title` contenant `</script>`, buildée
en e2e, dont le HTML ne doit pas contenir la séquence hors de la balise.

### `#SEC-002` · `embeds[].id` interpolé sans contrainte dans les URL de lecture

`src/components/SeriesEmbeds.astro:29-47` construit l'URL du lecteur par interpolation
directe, alors que le schéma déclare `id: z.string().optional()` — **aucun format imposé**
(`src/schema.ts:136`), et `playable` ne vérifie qu'une chose : chaîne non vide.

```ts
return `https://player.vimeo.com/video/${embed.id}?autoplay=1`;
```

Un `id` valant `123?autoplay=0&x=` ou `../../autre-chemin` détourne l'URL produite. Le cas
SoundCloud est le plus fragile — l'id atterrit dans un paramètre `url=` déjà encodé, où un
`&` casse la structure.

Ce n'est **pas** un XSS : Astro échappe les attributs, et le préfixe `https://<hôte>/`
reste en place. L'impact se limite au détournement de l'URL vers une autre ressource du
même hébergeur.

**Correctif** : `encodeURIComponent(embed.id)` à l'interpolation, ou un `z.string().regex(/^[\w-]+$/)`
au schéma. La première option est préférable — elle ne rejette aucun contenu que la spec
tient pour valide, ce qui est la ligne suivie pour les plateformes inconnues.

---

## Code & architecture — 8,5/10

| Indicateur | Valeur |
|---|---|
| `src/` TypeScript | 6 fichiers · 1 794 lignes |
| `src/` Astro | 13 fichiers · 2 086 lignes |
| Tests | 16 fichiers · 2 482 lignes — **1,38× le TypeScript**, 0,64× tout `src/` |
| `any` · `@ts-ignore` · `!.` | **0** |
| `console.*` non gardés | **0** (le seul `console.info` est derrière `HYPERFOCALE_DEBUG_CACHE`) |
| `TODO` / `FIXME` / `HACK` | **0** |
| Fichier `src/` non importé | **0** |

Deux fonctions dépassent 90 lignes dans `src/helpers/index.ts` — `parseImageManifest` (93)
et `getSeriesImages` (92). Les deux traitent les trois formes d'entrée du manifeste ; leur
longueur vient de la couverture des cas, pas d'un enchevêtrement. Pas d'action recommandée.

## Performance — 9/10

`dist/` publié : **224 Ko**, 32 fichiers. Aucun framework client — le JS envoyé au
navigateur est inline et borné :

| Composant | JS inline |
|---|---|
| `SeriesLightbox` | 5 633 c. |
| `SeriesFilter` | 2 463 c. |
| `SeriesEmbeds` | 1 169 c. |
| `SeriesGallery` | 401 c. |
| `SeriesMasonry` | 263 c. |

`loading` et `decoding` sont posés sur les images des cinq composants concernés. Les embeds
sont rendus en façade — l'iframe tierce n'arrive qu'au clic, ce qui évite à la fois le coût
de chargement et le dépôt de cookies non sollicité.

## Accessibilité — 8/10

Vérifié sur balises multi-lignes, pas au `grep` naïf :

- **7 `<img>` sur 7** portent un `alt` ✅
- **5 `<button>` sur 5** ont un nom accessible (4 `aria-label`, 1 texte) ✅
- `aria-*` présents sur les 8 composants interactifs ; `role` sur `SeriesFilter`,
  `SeriesLightbox`, `SeriesMap`

**Non vérifié automatiquement** — la lightbox est un dialogue : piège de focus, `Escape`,
restitution du focus à la fermeture et `aria-modal` demandent un test clavier réel. C'est
la seule raison pour laquelle cet axe n'est pas noté plus haut.

## Documentation — 10/10

`CLAUDE.md` contrôlé fait par fait : **7 commandes déclarées sur 7** existent dans
`package.json`, **11 chemins déclarés sur 11** existent sur le disque. Les écarts relevés
en début de session (8 composants annoncés au lieu de 9, périmètre réduit à la photo) ont
été corrigés dans la PR #84.

---

## Actions retenues

| Priorité | Carte | Effort |
|---|---|---|
| 🔴 P0 | `#SEC-001` — échapper `<` avant injection dans `<script>` (2 sites) | S |
| 🟠 P1 | `#SEC-002` — encoder `embeds[].id` dans les URL de lecture | XS |
| 🟡 P2 | `#TEST-004` — couvrir `getSeriesCover`, `serializeSeries`, `getParentCollection` | S |

## Ce que cet audit n'a pas couvert

- **Test clavier réel de la lightbox** — demande un navigateur, pas une analyse statique.
- **Conformité à la spec 2.9-draft** — le dernier relevé (96 %) date de la 2.7-draft. C'est
  le mode `review` qui répond à cette question, pas celui-ci.
- **Audit de dépendances transitif** — traité le jour même par Dependabot : zéro alerte
  ouverte après le passage de `nanoid` en 3.3.18.
