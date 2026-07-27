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

Dernier audit : [`docs/reports/conformite-spec-2026-07-27.md`](docs/reports/conformite-spec-2026-07-27.md)
— **v0.8.0 contre la spec v2.6-draft, score 77 %**.

L'implémentation courante couvre notamment : schéma étendu (IPTC, images et
fichiers distants, `attachments`, tags, `published`/`draft`/`featured`), slugs
hiérarchiques, `querySeries`, helpers de collections/tags, documents joints
(§1.9) et presets de domaine (§2.0.1).

Deux écarts **critiques** restent ouverts, tous deux introduits par la v2.6 :

- **§1.10 page d'index de section** (`#SPEC-001`) — le champ `type` est absent et
  `date` est requise par défaut : un `index.md` déclarant `type: section` **casse
  le build**. C'est le seul écart qui fait échouer du contenu conforme.
- **§1.5.1 manifeste `images.json`** (`#SPEC-002`) — non implémenté.

Se reporter à l'audit pour la matrice complète et les écarts de moindre priorité.
