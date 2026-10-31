# Publier une version

`@regrets/hyperfocale` est publié sur le **npm public**. Une publication se déclenche par un **tag `vX.Y.Z` poussé sur le dépôt** : le workflow `.github/workflows/publish.yml` fait le reste. Ce document décrit la marche à suivre, de la préparation à la vérification.

## En bref

1. Une PR de release prépare la version (numéro, CHANGELOG) et est fusionnée dans `main`.
2. Quelqu'un pousse le tag `vX.Y.Z` sur le commit fusionné.
3. Le workflow vérifie, empaquette, puis publie.
4. On vérifie que la version est en ligne.

L'étape 2 est **humaine** : voir « Qui fait quoi » plus bas.

## 1. Préparer la version

Sur une branche `release/X.Y.Z` partie de `main` à jour :

- **Numéro** : `npm version X.Y.Z --no-git-tag-version` met à jour `package.json` et `package-lock.json`, sans créer de tag ni de commit. Mettre aussi `version` à jour dans l'en-tête de `docs/todo.md`.
- **Lockfile de la démo** : `examples/demo-site/package-lock.json` enregistre la version du plugin lié. Il change quand les tests e2e lancent leur `npm install` : le commiter avec le reste.
- **CHANGELOG** : la section `## [Non publié]` devient `## [X.Y.Z] — AAAA-MM-JJ — titre court`, et une section `## [Non publié]` vide reste en tête. Un seul titre par type (`### Ajouté`, `### Modifié`, `### Corrigé`, `### Performance`…) dans une version, chaque entrée une seule fois, sans en changer le texte en les rangeant.
- **Contrôles** :
  ```bash
  npm run typecheck
  npm run build
  npm test                 # unitaires, composants, e2e
  npm run pack:dry         # contenu du paquet
  ```
  `npm test` demande **Node ≥ 22.23.4** : Astro refuse de construire le site de démo sur une version plus ancienne, et les e2e échouent alors avec « Node.js … is not supported by Astro ».
- **Contenu du paquet** : dans la sortie de `pack:dry`, vérifier que ce qui est nouveau y figure (composants `.astro`, routes et scripts compilés de `dist/`, entrées de `exports`). Un fichier absent du paquet est un fichier absent chez les sites.

Ouvrir la PR vers `main`, attendre que le job `build` de la CI soit vert, puis fusionner **en squash**. Le job `e2e` de la CI ne tourne que chaque lundi ou à la demande : il apparaît « skipped » sur une PR, c'est normal.

## 2. Pousser le tag

Une fois la PR fusionnée, depuis un clone à jour :

```bash
git fetch origin
git tag vX.Y.Z <sha-du-commit-de-release-sur-main>
git push origin vX.Y.Z
```

Le tag doit **égaler** `package.json#version` précédé de `v`. Il se pose sur le commit de `main` qui porte le numéro, pas sur une branche.

## 3. Ce que fait le workflow

Deux jobs, pour que le code des devDependencies (`tsc`, `vitest`, `esbuild`…) ne tourne jamais là où se trouve le moyen de publier (#154) :

| Job | Rôle | Accès |
|---|---|---|
| `verify` | Refuse un lancement hors tag, vérifie que le tag égale la version du `package.json`, puis `npm ci`, `npm run typecheck`, `npm run test:unit`, `npm pack` | Aucun secret, aucun jeton OIDC |
| `publish` | Récupère le tarball de `verify` et le publie : `npm publish ./pkg/*.tgz --provenance --access public --ignore-scripts` | Ne fait ni checkout ni `npm ci` |

Il publie avec une **provenance** npm (`id-token: write`) : la page du paquet sur npmjs.com indique le dépôt, le workflow et le commit d'origine. `--access public` est indispensable : un paquet scopé serait sinon publié « restricted ».

Un lancement manuel (`workflow_dispatch`) est refusé s'il ne part pas d'un tag.

## 4. Vérifier

- L'onglet **Actions** du dépôt : les jobs `verify` et `publish` de l'exécution déclenchée par le tag doivent être verts.
- `npm view @regrets/hyperfocale version` rend `X.Y.Z`.
- La page du paquet sur npmjs.com affiche le badge de provenance.

## Le jeton npm, et sa suppression (#154)

Tant que le paquet n'a pas de **Trusted Publisher**, le job `publish` s'authentifie avec le secret de dépôt `NPM_TOKEN` (un jeton npm de type « Automation »).

Pour s'en passer :

1. Sur npmjs.com, dans les réglages du paquet `@regrets/hyperfocale`, ajouter un **Trusted Publisher** : fournisseur GitHub Actions, dépôt `izo/hyperfocale-astro-plugins`, workflow `publish.yml`.
2. Supprimer le secret `NPM_TOKEN` du dépôt GitHub (Settings → Secrets and variables → Actions).
3. Retirer la variable `NODE_AUTH_TOKEN` du job `publish` de `publish.yml`.

Les étapes 1 et 2 demandent le compte npm et les droits d'administration du dépôt ; l'étape 3 est un changement de code, à ne fusionner **qu'après** les deux premières, sans quoi la publication casse.

## En cas d'erreur

- **Le workflow refuse le tag** : le tag ne correspond pas à `package.json#version`. Supprimer le tag distant (`git push origin :refs/tags/vX.Y.Z`), corriger, recréer.
- **Une version est publiée mais défectueuse** : npm ne laisse pas republier le même numéro. Corriger par une version de patch. Pour avertir les utilisateurs de la version fautive : `npm deprecate @regrets/hyperfocale@X.Y.Z "message"`. `npm unpublish` est très restreint (délai court, aucun dépendant) : à ne pas compter dessus.
- **`verify` échoue** : rien n'a été publié, puisque `publish` attend `verify`. Corriger sur `main`, puis déplacer ou recréer le tag sur le nouveau commit.

## Qui fait quoi

Une session d'assistant (Claude Code) prépare la PR de release et la fait fusionner, mais **ne pousse pas le tag** : publier est une action publique et définitive, que son contrôle de permissions refuse (« Create Public Surface »). La personne qui publie pousse le tag, ou ajoute explicitement la permission à la session.
