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
**2.11-draft** au 2026-10-20. L'état de conformité du plugin y est tenu en
**§0.5** : c'est lui qui fait foi, pas ce fichier.

Au 2026-10-20, v0.19.0 : conforme v2.10 (contrat d'adaptateur, Annexe G jusqu'à
G.10, §1.11, couche 4). Restent ouverts par la v2.11 (#121) :

- **Originaux (§1.9)** — un RAW ou un `.xmp` de `media/` tombe encore en
  document joint `file`, donc proposé en téléchargement ;
- **Garde §4.11** — ni projection publiable, ni `guard-originals-excluded` ;
- **Profil `project` (G.12)** — non couvert (COULD).

Les audits datés de `docs/reports/` sont des archives.
