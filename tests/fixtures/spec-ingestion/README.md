# Fixtures de conformité — Couche 4 (Ingestion)

Corpus de conformité **cross-language** de la couche 4 de `spec-hyperfocale.md` (§4.1 à §4.12). Toute implémentation du contrat d'ingestion — plugin TypeScript `@regrets/hyperfocale`, CMS Swift, outil tiers — DOIT produire exactement les résultats attendus ici. Ces fichiers sont normatifs au même titre que la prose : en cas de désaccord entre une fixture et le texte, c'est un défaut de la spec, à remonter sur [izo/hyperfocale-spec](https://github.com/izo/hyperfocale-spec/issues) avant tout code divergent.

Un consommateur copie ce dossier à une **ref git épinglée** (commit ou tag) et parcourt toutes les fixtures dans ses tests. Toute évolution du contrat met à jour les fixtures dans la même PR que la prose (epic [#23](https://github.com/izo/hyperfocale-spec/issues/23)).

## Arborescence

```
fixtures/ingestion/
├── README.md
├── corpora/<nom>/…            corpus filesystem d'entrée
├── snapshots/<nom>.json       snapshot attendu de corpora/<nom>
├── validation/<cas>.json      diagnostics attendus de la validation
├── diff/<cas>.json            ContentChangeSet attendu entre deux snapshots
├── guard/<cas>.json           diagnostics attendus de la garde de publication
├── snapshot-id/<cas>.json     identifiant attendu d'une liste d'entrées
├── paths/<cas>.json           normalisation, validité, exclusion, classification, collisions
└── hashes/vectors.json        vecteurs de hash sha256 et dropbox
```

## Conventions communes

- **Encodage** : tous les fichiers sont en UTF-8. Les fichiers JSON sont comparés **après parsing**, jamais textuellement (ordre des clés et indentation libres).
- **Octets exacts** : `fixtures/.gitattributes` désactive toute conversion de fin de ligne. Un checkout qui réécrirait `\n` en `\r\n` changerait les hashes attendus.
- **Échappement** : les fixtures `paths/`, `snapshot-id/` et `validation/entry-path-*.json` écrivent tout caractère non ASCII en `\uXXXX`, pour qu'une forme NFD, un homoglyphe (Α grec, K Kelvin) ou un caractère de contrôle restent visibles. Le parsing JSON rend les mêmes chaînes.
- **Ordre canonique** : tri par la séquence d'octets **UTF-8** du chemin (§4.1) — ni UTF-16, ni collation locale.
- **Diagnostics** : on compare le triplet **`code` + `severity` + `path`**, jamais `message` ni `rule`. Les listes attendues sont triées par `path` (ordre canonique) puis par `code` (ordre des octets), et ne contiennent jamais deux fois le même couple `(code, path)`. Un diagnostic qui porte sur le snapshot entier a pour `path` la chaîne vide `""`.

## Formats

### `corpora/<nom>/`

Arborescence d'entrée. Un provider filesystem la parcourt récursivement ; chaque fichier devient une entrée dont le chemin est relatif à `corpora/<nom>/`, en POSIX, normalisé NFC, exclusions §4.2 appliquées. Les médias sont de petits fichiers de quelques octets : l'extension suffit à la classification, le contenu (le chemin du fichier suivi de `\n`) ne sert qu'à rendre chaque hash unique. `corpora/attachments/…/media/notes.txt` est volontairement vide (0 octet).

| Corpus | Ce qu'il couvre | Diagnostics attendus |
|---|---|---|
| `minimal` | une série canonique | aucun |
| `nested` | sections §1.10 (dont la racine du corpus), section dans une section, rangement profond §1.2, conteneur §1.8 dont la couverture traverse une sous-série | aucun |
| `i18n` | `index.md` + `index.en.md` + `index.pt-BR.md` ; `index.english.md` n'est pas un fichier index | aucun |
| `manifest` | couverture trouvée dans `images.json` par suffixe (chemin absolu au site) et par résolution (chemin relatif) ; manifeste + médias locaux | aucun |
| `attachments` | documents joints §1.9, fichier vide | aucun |
| `embeds` | contenus embarqués §1.11, plateforme inconnue, poster en couverture | aucun |
| `roots` | racines de validation (`validation/roots.json`, `validation/roots-default.json`) | selon la racine |
| `invalid-<code>` | un corpus par diagnostic de validation `error` ou `warning` qui dépend du contenu | exactement `<code>` |
| `cover-cumulative` | `cover` relatif vers un document joint absent : deux diagnostics sur le même fichier | `cover-not-found` + `cover-not-image` |

### `snapshots/<nom>.json`

Snapshot attendu de `corpora/<nom>` (§4.5) : `createdAt` figé à `1970-01-01T00:00:00.000Z`, `complete: true`, pas de `source`, hashes `sha256` **et** `dropbox`, ni `identity`, ni `modifiedAt`, ni `state` (valeur par défaut).

Comparaison : `format`, `version`, `id`, `complete`, et pour chaque entrée `path`, `kind`, `size`, `hashes`. `createdAt` et les champs informatifs ajoutés par une implémentation (`modifiedAt`…) sont ignorés. L'`id` dépend des algorithmes présents : une implémentation qui calcule d'autres algorithmes compare sur `sha256` + `dropbox` seuls.

### `validation/<cas>.json`

```json
{ "description": "…", "corpus": "<nom>", "roots": [{ "path": "", "dateRequired": true }], "expected": [ { "code", "severity", "path" } ] }
```

- Avec `corpus` : le snapshot validé est `snapshots/<corpus>.json`, et `read(path)` rend les octets de `corpora/<corpus>/<path>`.
- Avec `snapshot` + `files` (au lieu de `corpus`) : le snapshot est donné inline, et `read(path)` rend les octets UTF-8 de `files[path]`. Ces octets correspondent au hash de l'entrée, sauf dans `validation/entry-hash-mismatch.json`, qui teste précisément l'écart. `files` contient tout ce que la validation a le droit de lire ; une lecture hors de `files` est un défaut d'implémentation (par exemple lire un fichier `placeholder`). Cette forme couvre les diagnostics qui ne dépendent que du snapshot (`snapshot-*`, `entry-*`) et le cas de collision de casse.
- `roots` est toujours explicite, même quand c'est la racine par défaut.

### `diff/<cas>.json`

```json
{ "description": "…", "base": <snapshot | null>, "target": <snapshot>, "expected": <ContentChangeSet> }
```

Comparaison : `format`, `version`, `base`, `target` à l'identique ; `added`, `modified`, `deleted`, `moved` égaux en profondeur, dans l'ordre (§4.7, règle 6), les entrées étant comparées comme objets JSON complets (`identity` et `modifiedAt` compris) ; `diagnostics` par `code` + `severity` + `path`.

### `guard/<cas>.json`

```json
{ "description": "…", "base": <snapshot | null>, "target": <snapshot>, "changeSet": <ContentChangeSet>,
  "files": { "base": { "<chemin>": "<texte>" }, "target": { … } }, "policy": { … }, "expected": [ { "code", "severity", "path" } ] }
```

`changeSet` est le diff de `base` vers `target`, fourni pour tester la garde indépendamment du diff (il est égal à ce que produit §4.7). `read(côté, chemin)` rend les octets UTF-8 de `files[côté][chemin]` ; une lecture hors de `files` est un défaut d'implémentation. Ces octets correspondent au hash de l'entrée, sauf `series/divergente-2024/index.md` côté `base` dans `guard/private-fail-closed.json`, qui teste précisément l'écart. `policy` est toujours explicite. Comparaison des diagnostics : comme pour `validation/`.

### `snapshot-id/<cas>.json`

```json
{ "description": "…", "entries": [ … ], "expectedCanonical": "<chaîne L>", "expectedId": "sha256:…" }
```

`entries` peut être dans un ordre quelconque : le calcul trie. `expectedCanonical` est la chaîne `L` de §4.6, fournie pour le débogage ; seule `expectedId` est normative.

### `paths/<cas>.json`

```json
{ "description": "…", "input": ["…"], "expected": [ { "path", "valid", "kind", "excluded" } ], "collisions": ["…"] }
```

Pour chaque chaîne de `input`, dans le même ordre :

- `path` = forme NFC de l'entrée (la normalisation ne corrige rien d'autre : un `/` initial reste un `/` initial) ;
- `valid` = conformité syntaxique de `path` à §4.1 ;
- `excluded` = `path` relève d'une exclusion §4.2 ;
- `kind` = classification §4.3 si `valid` et non `excluded`, sinon `null`.

`valid` et `excluded` sont **indépendants** : un segment `..` rend un chemin invalide *et* exclu (il commence par un point). Un outil d'ingestion applique d'abord l'exclusion — l'entrée disparaît sans diagnostic —, puis la validité : un chemin non exclu et invalide produit `entry-path-invalid`. Dans un snapshot, une entrée DOIT être `valid` et non `excluded` (§4.5).

`collisions` : parmi les chemins de `expected` valides et non exclus, triés dans l'ordre canonique, chaque chemin qui suit le premier de son groupe de collision (égalité après NFC puis minuscule simple, §4.1), sans doublon, dans l'ordre canonique. C'est l'ensemble des chemins qui recevraient `entry-path-collision`.

### `hashes/vectors.json`

**`hashes/vectors.json` fait foi** pour les vecteurs `sha256` et `dropbox` (§4.4) ; ce README n'en recopie aucune valeur. `input.utf8` désigne les octets UTF-8 d'une chaîne ; `input.repeat` désigne `count` fois l'octet `byte`. Les vecteurs couvrent le fichier vide, `abc`, un bloc Dropbox plein (4 194 304 octets nuls), un bloc plein plus un octet, **5 000 000 octets nuls** et deux blocs pleins. **Aucun fichier de plus de 4 Mio n'est versionné** : les vecteurs multi-blocs se génèrent.

Le hash `dropbox` d'un fichier vide est le SHA-256 de la chaîne vide (aucun bloc) : il est égal à son `sha256`. Pour un fichier non vide d'au plus un bloc, `dropbox` = SHA-256 du digest **binaire** SHA-256 du contenu — jamais du digest hexadécimal.

## Prérequis d'une implémentation conforme

Toute implémentation conforme DOIT savoir calculer `sha256` **et** `dropbox` : les snapshots des fixtures portent les deux, et leurs `id` en dépendent. Elle compare et trie les chemins sur leurs octets UTF-8 (ou leurs points de code) — en Swift, sur `unicodeScalars` ou `utf8`, jamais sur `String`, dont `==` identifie les formes NFC et NFD (§4.1).

## Pourquoi il n'y a pas de corpus `collision` sur disque

Deux fichiers qui ne diffèrent que par la casse ne peuvent pas coexister sur un volume insensible à la casse — APFS et HFS+ dans leur configuration par défaut, NTFS, et Dropbox lui-même. Versionné, un tel corpus serait fusionné en silence au checkout sur macOS ou Windows, et la fixture mentirait. La collision est donc exprimée sans disque :

- `paths/collision.json` — casse ASCII, équivalence NFC, et les points de code où minuscule simple et minuscule complète divergent (`İ`, sigma final) ;
- `validation/entry-path-collision.json` — snapshot inline, diagnostic `entry-path-collision`.

Pour la même raison, aucun corpus ne contient deux noms égaux après repli de casse, ni de nom de fichier non ASCII : la normalisation NFC se teste dans `paths/` et `snapshot-id/`, pas au travers d'un système de fichiers qui normalise lui-même.

## Couverture des diagnostics

| Code | Fixture |
|---|---|
| `snapshot-invalid` | `validation/snapshot-invalid-format.json`, `validation/snapshot-invalid-complete.json`, `validation/snapshot-invalid-entries.json` |
| `snapshot-version-unsupported` | `validation/snapshot-version-unsupported.json` |
| `snapshot-id-mismatch` | `validation/snapshot-id-mismatch.json` |
| `snapshot-incomplete` | `validation/snapshot-incomplete.json` |
| `snapshot-empty` | `validation/snapshot-empty.json`, `validation/snapshot-empty-no-content.json` |
| `entry-invalid` | `validation/entry-invalid.json` |
| `entry-path-invalid` | `validation/entry-path-invalid.json` |
| `entry-path-collision` | `validation/entry-path-collision.json` |
| `entry-kind-mismatch` | `validation/entry-kind-mismatch.json` |
| `entry-hash-missing` | `validation/entry-hash-missing.json` |
| `entry-not-materialized` | `validation/entry-not-materialized.json` |
| `entry-conflict` | `validation/entry-conflict.json` |
| `entry-hash-mismatch` | `validation/entry-hash-mismatch.json` |
| `slug-invalid` … `embed-url-missing` | `validation/invalid-<code>.json` (corpus `invalid-<code>`), plus `validation/roots-default.json` |
| `hash-incomparable` | `diff/incomparable.json` |
| `move-ambiguous` | `diff/ambiguous.json` |

| Garde (§4.11) | Fixture |
|---|---|
| `guard-mass-deletion` | `guard/mass-deletion-series.json` (séries), `guard/mass-deletion-media.json` (ratio de médias) |
| `guard-mass-move` | `guard/mass-move.json` |
| `guard-private-exposed` | `guard/private-exposed.json`, `guard/private-fail-closed.json` (fail-closed côté `base` : octets divergents, `placeholder`, frontmatter illisible) |
| `guard-snapshot-incomplete`, `guard-snapshot-empty`, `guard-oversize` | `guard/always-active.json` |

Chaque fixture de garde fixe sa `policy` : les seuils réels appartiennent au consommateur.

## Diffs couverts

`initial` (base `null`), `added`, `modified`, `deleted`, `moved-identity` (l'identité résout ce que le contenu laisserait ambigu), `moved-content`, `moved-and-modified`, `moved-identity-resized` (move par identité sans algorithme commun, taille ou `kind` changé : pas de `hash-incomparable`), `ambiguous`, `ambiguous-one-to-two` (1 supprimé : 2 ajoutés), `identity-duplicated` (identité portée par deux entrées : pas de move par identité), `incomparable` (changement de provider, taille différente, move par identité sans algorithme commun), `hash-preference` (sha256 > dropbox > `x-*` alphabétique), `rename-series-folder` (N moves), `idempotence` (`diff(S, S)` vide, entrée `placeholder` comprise).

## Provenance des valeurs attendues

Les hashes, identifiants, changesets et diagnostics ont été calculés par un script jetable qui implémente la couche 4 (non versionné : ce dépôt ne contient aucun code). Chaque résultat a été confronté à une attente écrite à la main avant écriture, puis recoupé par des implémentations indépendantes : `shasum` + `xxd` pour les vecteurs de hash, un second calcul en Python pour tous les `id` de snapshot et toutes les chaînes canoniques.
