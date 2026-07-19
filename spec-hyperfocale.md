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

Dernier audit : [`docs/reports/conformite-spec-2026-06-24.md`](docs/reports/conformite-spec-2026-06-24.md).

L'implémentation courante (v0.7.0) couvre notamment : schéma étendu (IPTC, images
et fichiers distants, attachments, tags, published/draft/featured), slugs
hiérarchiques, `querySeries`, helpers de collections/tags. Se reporter à l'audit
pour le score et les écarts restants.
