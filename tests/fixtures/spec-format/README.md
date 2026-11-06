# Fixtures de conformité — Couche 1 (Format)

Cas de conformité des **fonctions pures** de la couche 1 de `spec-hyperfocale.md` : celles dont le résultat se décrit par des données, sans rendu ni système de fichiers. Les évolutions 2.13 à 2.16 de la couche 1 (tri, pagination, parent d'une sous-série) n'avaient aucun jeu de conformité : « conforme v2.16 » était un jugement par relecture de code. Même convention que `fixtures/ingestion/` : fichiers UTF-8, comparés après parsing, octets exacts (`fixtures/.gitattributes`), toute évolution de la règle met à jour la fixture dans la même révision.

| Fichier | Règle | Contenu |
|---|---|---|
| `sort-series.json` | §1.6, *Tri des séries* | `cases[]` : `series` (`path`, `title`, `date` facultative, chaîne telle qu'écrite dans le frontmatter), `dateRequired`, `expected` (les `path`, dans l'ordre du listing). Date calendaire décroissante, sans date en dernier, puis titre, puis chemin ; comparaisons sur les octets UTF-8 du texte en NFC. |
| `series-parent.json` | §1.8, §1.10 | `cases[]` : `folders[]` (`path`, `kind` : `series` ou `section`) — les dossiers qui portent un fichier index ; `expected` donne le parent de chaque série (`null` : aucun). Un dossier de rangement, sans `index.md`, n'est pas dans `folders` ; ni lui ni une page de section n'est un parent. |
| `routes.json` | §1.6, *URLs* | `cases[]` : `series` (chemins) et `requests[]` (`url`, `expected` : `series`, `gallery` avec `page`, ou `none`). Pagination `page/<n>` (n ≥ 2, sans zéro initial), sous-série dont le slug est un nombre, segment réservé. |

Les validations de la couche 1 qui passent par des diagnostics (`date-missing`, `date-invalid`, `type-invalid`, `nesting-too-deep`, `cover-*`…) sont dans `fixtures/ingestion/validation/` : elles sont exprimées en diagnostics, donc partagées avec la couche 4.

## Ce que la couche 1 ne teste pas mécaniquement

Le **rendu** : body avant la galerie, lightbox, composants (couches 2 et 3), flux de syndication, mise en page. Aucune fixture n'en juge ; un adaptateur s'éprouve par ses propres tests et par la lecture de §2.0. Ce jeu ne couvre que ce qui se décrit par des entrées et des sorties.
