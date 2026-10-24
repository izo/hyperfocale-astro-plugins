# Spécification — pointeur

> ⚠️ Ce fichier **n'est pas** la spécification. La source de vérité canonique du
> format Hyperfocale vit dans un dépôt séparé.

## Source de vérité

La spec officielle est maintenue dans **[`izo/hyperfocale-spec`](https://github.com/izo/hyperfocale-spec)**
(fichier `spec-hyperfocale.md`). C'est un format **portable** (SSG, Obsidian, CMS
headless) ; ce plugin n'en est que l'**adaptateur Astro** (couche 2).

Lire la spec à jour :

```bash
gh api repos/izo/hyperfocale-spec/contents/spec-hyperfocale.md --jq '.content' | base64 -d
```

## Pourquoi pas de copie locale

Toute copie de la spec ici dériverait de l'originale. Le plugin doit **toujours
rester conforme** à la spec canonique : chaque écart spec↔code est une dette à
corriger, pas une décision à laisser filer.

- Avant toute PR touchant `src/schema.ts`, `src/helpers/`, `src/components/`,
  `src/routes/` : vérifier la conformité avec la spec canonique.
- Quand la spec évolue : évaluer l'impact et ouvrir les tickets nécessaires.

## Conformité à date

La version courante de la spec est celle de l'en-tête de la canonique —
**2.12-draft** au 2026-10-24 (`izo/hyperfocale-spec#35`). L'état de conformité
du plugin y est tenu en **§0.5** : c'est lui qui fait foi, pas ce fichier.

Au 2026-10-24, **v0.20.0** (publiée sur npm le 2026-10-21, `latest`) : conforme
v2.11. Les trois points que la v2.11 avait rouverts (#121, fermée) sont couverts
— voir le CHANGELOG, section 0.20.0 :

- **Originaux (§1.9)** — `ORIGINAL_EXTENSIONS`, `isOriginal()` : un RAW ou un
  sidecar de `media/` n'alimente plus ni la galerie, ni les documents joints, ni
  la couverture, et il est écarté dès le glob, sans égard à la casse (#125) ;
- **Garde §4.11** — `publishable(snapshot)`, `guard-originals-excluded`
  (`count`, `bytes`), `guard-oversize` évaluée sur la projection ;
- **Profil `project` (G.12)** — preset `project` et bloc `project:` au schéma.

Écart assumé : la collection du preset `project` est `work`, pas `projects`,
qu'occupe `portfolio` depuis la 0.8.0.

Restent ouverts par la v2.12 (§1.5.1, ordre éditorial des images) :

- **Entrées locales de `images:`** — une entrée relative (`./media/01.jpg`) doit
  se résoudre comme une entrée relative du manifeste. Le schéma refuse encore
  une URL relative (`z.url()`) et la forme courte (chaîne), et `getSeriesImages`
  sert l'entrée telle quelle au lieu de la chercher dans `media/` ;
- **Manifeste dérivé** — l'ingestion ne doit pas produire d'`images.json` pour
  une série dont l'`index.md` porte `images:` ; `buildImagesManifest` ne lit
  pas le frontmatter.

Les audits datés de `docs/reports/` sont des archives.
