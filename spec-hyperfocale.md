# Spécification — pointeur

> ⚠️ Ce fichier **n'est pas** la spécification. La source de vérité canonique du
> format Hyperfocale vit dans un dépôt séparé.

## Source de vérité

La spec officielle est maintenue dans **[`izo/hyperfocale-spec`](https://github.com/izo/hyperfocale-spec)**
(fichier `spec-hyperfocale.md`). C'est un format **portable** (SSG, Obsidian, CMS
headless) ; ce plugin n'en est que l'**adaptateur Astro** (couche 2).

Lire la spec à jour :

```bash
gh api -H "Accept: application/vnd.github.raw" \
  repos/izo/hyperfocale-spec/contents/spec-hyperfocale.md
```

## Pourquoi pas de copie locale

Toute copie de la spec ici dériverait de l'originale. Le plugin doit **toujours
rester conforme** à la spec canonique : chaque écart spec↔code est une dette à
corriger, pas une décision à laisser filer.

- Avant toute PR touchant `src/schema.ts`, `src/helpers/`, `src/components/`,
  `src/routes/` : vérifier la conformité avec la spec canonique.
- Quand la spec évolue : évaluer l'impact et ouvrir les tickets nécessaires.

Une seule exception : les **fixtures de conformité** de la spec, copiées à un
commit épinglé sous `tests/fixtures/`. Elles ne s'éditent jamais à la main
(`npm run fixtures:sync` les met à jour, `npm run fixtures:check` vérifie la copie).

## Où lire quoi

Ce fichier ne porte aucun numéro de version : un numéro écrit ici dérive.
Chaque valeur se lit à sa source.

| Question | Source |
|---|---|
| Quelle est la version courante de la spec ? | L'en-tête de `spec-hyperfocale.md` dans `izo/hyperfocale-spec`, lignes **Version** et **Dernière révision**. Elles sont en tête du fichier : lire le fichier avec la commande du bloc ci-dessus. |
| Où en est la conformité du plugin ? | §0.5 de la spec (« État des implémentations de référence »). C'est lui qui fait foi, pas ce fichier. |
| Quelle version du plugin est dans ce dépôt ? | Le champ `version` de `package.json`. |
| Quelle version du plugin est publiée sur npm ? | `npm view @regrets/hyperfocale version`. Elle peut être en retard sur `package.json` : une version n'est publiée que lorsqu'un tag `vX.Y.Z` est poussé (`docs/publication.md`). |
| Quel état de la spec les tests rejouent-ils ? | Le commit épinglé dans `tests/fixtures/spec-ingestion/SOURCE` et `tests/fixtures/spec-format/SOURCE`. |
| Qu'a couvert chaque version du plugin ? | `CHANGELOG.md`. Une section datée est une version qui a un numéro ; elle n'est sortie que si npm la porte (`npm view @regrets/hyperfocale version`). La section « Non publié » est ce qui n'a pas encore de numéro. |

Les audits datés de `docs/reports/` sont des archives.
