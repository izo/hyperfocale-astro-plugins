# Audit de sécurité — @izo/hyperfocale v0.4.0

**Date** : 2026-06-24
**Périmètre** : plugin d'intégration Astro 6 (librairie SSG publiée sur npm / GitHub Packages)
**Méthode** : revue statique READ-ONLY, sévérité OWASP-like (Critique / Haut / Moyen / Bas)
**Auditeur** : audit défensif autorisé (propriétaire du repo)

---

## Résumé exécutif

`@izo/hyperfocale` est une librairie **SSG pure** : tout le rendu se produit au build (`prerender: true` sur toutes les routes injectées), à partir de contenu **contrôlé par l'auteur du site consommateur** (frontmatter Markdown, fichiers `media/`). Il n'y a ni serveur runtime, ni endpoint dynamique, ni entrée d'un tiers non authentifié. Cette architecture **réduit drastiquement la surface d'attaque** : la quasi-totalité des données traitées relèvent du modèle de confiance « celui qui fournit les données contrôle déjà le HTML ».

Aucune vulnérabilité **Critique** ni **Haute** n'a été identifiée. Les findings réels portent sur l'**intégrité** (CLI qui réécrit un fichier du consommateur via une regex fragile, sans sauvegarde) et sur des **durcissements défensifs** (validation d'URL, sérialisation JSON en contexte `<script>`). Le package publié est propre : pas de secret, pas de script `postinstall`, pas de fichier sensible exposé.

**Score sécurité : 8.5 / 10**

Décote principalement due à : (1) la fonction de fusion du CLI qui peut corrompre `content.config.ts` sur certaines structures (intégrité, pas confidentialité), (2) l'absence de défense en profondeur sur le schéma d'URL distant et la sérialisation lightbox.

---

## Décompte des findings

| Sévérité | Nombre |
|----------|--------|
| Critique | 0 |
| Haut     | 0 |
| Moyen    | 2 |
| Bas      | 4 |
| Info     | 3 |

**Blockers : 0 CRITIQUE.** Aucun blocage pour publication. Les deux findings Moyens sont des améliorations recommandées avant la prochaine release mineure.

---

## Findings Moyen

### M-1 — Fusion de `content.config.ts` par regex fragile : risque de corruption du fichier consommateur
**Fichier** : `src/cli/init.ts:56-63`
**CWE** : CWE-20 (Improper Input Validation) / intégrité de fichier
**Catégorie OWASP** : A08 — Software & Data Integrity

**Description**
La regex de détection de l'export existant est :
```js
updated.match(/export\s+const\s+collections\s*=\s*\{([^}]*)\}/s)
```
`[^}]*` s'arrête au **premier** `}` rencontré. Si le `content.config.ts` du consommateur contient un objet imbriqué dans `collections` (cas courant et légitime, ex. `series: defineCollection({ schema: z.object({ ... }) })`, ou une collection déclarée inline avec une accolade), la regex capture une sous-chaîne tronquée. Le `replace` (ligne 60-63) réinjecte alors un bloc mal formé : le fichier résultant est syntaxiquement cassé.

**Vecteur d'attaque**
Pas un vecteur d'attaque externe — c'est un **risque d'intégrité** déclenché par la structure légitime du fichier cible. Le CLI écrit sans sauvegarde préalable (`writeFileSync` ligne 64), donc le fichier d'origine du consommateur est écrasé et perdu en cas de mauvaise fusion.

**Impact**
Corruption silencieuse du fichier de configuration de contenu du projet consommateur. Build Astro cassé côté utilisateur, perte de la config manuelle. Modéré : réversible via git si le consommateur versionne, mais surprenant et non documenté.

**Recommandation**
- Avant tout `writeFileSync` sur un fichier **existant**, écrire une copie de sauvegarde (`content.config.ts.bak`) ou refuser la modification automatique et afficher les 2 lignes à coller manuellement.
- Remplacer la fusion par regex par un parsing plus robuste (équilibrage d'accolades) **ou** restreindre la fusion automatique au cas trivial (objet `collections` à une seule profondeur) et tomber en mode « instructions manuelles » sinon.
- À défaut, documenter explicitement la limite et tester l'idempotence sur un fichier à objet imbriqué.

---

### M-2 — Idempotence basée sur `includes(string)` : faux positifs/négatifs possibles
**Fichier** : `src/cli/init.ts:45,52`
**CWE** : CWE-697 (Incorrect Comparison)
**Catégorie OWASP** : A08 — Software & Data Integrity

**Description**
La détection « collection déjà présente » repose sur `existing.includes('series: seriesCollection')` (ligne 45) et `existing.includes(VIRTUAL_IMPORT)` (ligne 52), une comparaison de sous-chaîne textuelle exacte. Conséquences :
- Variantes d'espacement légitimes (`series:seriesCollection`, `series : seriesCollection`, alias renommé) **ne sont pas** détectées → double injection possible (la regex de M-1 réinjecte une 2ᵉ entrée `series`).
- Le `VIRTUAL_IMPORT` est comparé caractère par caractère (guillemets simples imposés) ; un import équivalent avec guillemets doubles passe inaperçu → import dupliqué.
- Une chaîne `series: seriesCollection` présente **en commentaire** déclenche un faux « déjà présent » et empêche l'injection réelle.

**Impact**
Non-idempotence dans les cas non triviaux : config dupliquée (clé `series` en double dans l'objet → la 2ᵉ écrase silencieusement, ou erreur de build), ou no-op erroné. Intégrité de la config consommateur.

**Recommandation**
Normaliser la détection (regex tolérante aux espaces sur la clé `series`, ou parsing AST léger). Couvrir par un test unitaire les cas : guillemets doubles, espaces variables, clé en commentaire.

---

## Findings Bas

### B-1 — `z.url()` accepte des schémas d'URL dangereux (`javascript:`, `data:`) pour les images distantes
**Fichier** : `src/schema.ts:37` (`remoteImageSchema.url`) et `src/index.ts:179-182` (schéma inliné du module virtuel)
**CWE** : CWE-79 (XSS) — défense en profondeur
**Catégorie OWASP** : A03 — Injection

**Description**
`z.url()` (Zod 4) valide la forme d'une URL mais **n'impose pas le schéma** : `javascript:alert(1)`, `data:text/html,...` et `vbscript:` passent la validation. Ces URLs proviennent du frontmatter `images[]` (mode distant) et sont propagées par `getSeriesImages` (`helpers/index.ts:69-74`) jusqu'à l'attribut `src` des `<img>` de la lightbox (`SeriesLightbox.astro:92`, via JSON) et de la galerie.

**Pourquoi seulement Bas (et pas Haut)**
1. Les URLs ne sont injectées que dans un attribut **`src` d'`<img>`**, pas dans `href` ni dans un gestionnaire d'événement : `javascript:` sur `<img src>` **ne s'exécute pas** dans les navigateurs modernes (contrairement à `<a href>`). Le vecteur XSS direct est donc inerte ici.
2. La donnée est **trusted** : l'auteur du site contrôle déjà tout le HTML via le Markdown rendu (`<Content />`). Un attaquant qui contrôle le frontmatter contrôle déjà la page.

**Impact**
Faible. Au pire `data:`/`javascript:` produit une image cassée. Le risque ne devient réel que si une future évolution rend ces URLs dans un `href` ou un composant tiers.

**Recommandation (défense en profondeur)**
Restreindre le protocole : `z.url().refine(u => /^https?:\/\//i.test(u), 'URL http(s) attendue')`. Aligner les deux définitions (`schema.ts` et le bloc inliné de `index.ts`).

---

### B-2 — Sérialisation JSON dans un `<script>` sans neutralisation de `</script>`
**Fichier** : `src/components/SeriesLightbox.astro:67-69`
**CWE** : CWE-79 (XSS) — défense en profondeur
**Catégorie OWASP** : A03 — Injection

**Description**
```astro
<script type="application/json" id="hf-lightbox-data">
  {JSON.stringify(images.map((img) => ({ src: img.src, width: img.width, height: img.height })))}
</script>
```
Le contenu d'un élément `<script>` n'est **pas** soumis à l'échappement HTML d'Astro (contexte « raw text element »). Si une valeur de `src` contient la séquence `</script>` (ou `<!--`), le parser HTML ferme prématurément la balise script, ce qui permet d'injecter du balisage arbitraire dans la page générée.

**Pourquoi seulement Bas**
- En mode local, `img.src` est une URL d'asset générée par Astro (`import.meta.glob`) — pas d'attaquant. En mode distant, `src` provient du frontmatter **trusted** de l'auteur (cf. B-1). Le scénario suppose que l'auteur s'auto-attaque, ce qui n'a pas de sens dans un contexte SSG.

**Impact**
Théorique pour le modèle SSG. Réel uniquement si, à terme, des données non fiables alimentent `images[]` (ex. import depuis une source externe au build).

**Recommandation**
Neutraliser la fermeture de balise lors de la sérialisation :
```js
JSON.stringify(...).replace(/</g, '\\u003c')
```
Pattern standard pour injecter du JSON dans `<script>`. Coût nul, supprime définitivement la classe de bug.

---

### B-3 — `looseObject` / `.passthrough()` : champs frontmatter inconnus propagés sans contrôle
**Fichier** : `src/schema.ts:17,78` (`z.looseObject`) et `src/index.ts:176,199` (`.passthrough()`)
**CWE** : CWE-915 (Improperly Controlled Modification of Object Attributes)
**Catégorie OWASP** : A04 — Insecure Design

**Description**
Le schéma racine et le bloc `iptc` acceptent et conservent tout champ inconnu (`looseObject` / `passthrough`, choix documenté pour `iptc.custom.*` et la transmission de champs spec). Ces champs arbitraires se retrouvent dans `series.data` et sont accessibles aux composants/templates du consommateur.

**Pourquoi seulement Bas**
Aucun de ces champs inconnus n'est rendu non échappé par les composants du plugin (les composants n'utilisent que `title`, `date`, `description`, `cover`, `location`, `images`, tous via interpolation Astro échappée). C'est un choix de design assumé et la donnée est trusted.

**Impact**
Faible aujourd'hui. Risque latent : un consommateur qui itère sur `Object.entries(series.data)` et rend les valeurs sans échappement hériterait du contenu non validé.

**Recommandation**
Conserver `looseObject` est acceptable, mais documenter que les champs `passthrough` ne sont **pas** validés ni assainis, et que le consommateur ne doit pas les rendre via `set:html`. Optionnellement, borner les types primitifs des champs IPTC connus.

---

### B-4 — Champs texte non bornés en longueur (`title`, `description`, `tags`, etc.)
**Fichier** : `src/schema.ts:79-89`
**CWE** : CWE-1284 (Improper Validation of Specified Quantity in Input)
**Catégorie OWASP** : A04 — Insecure Design

**Description**
Tous les `z.string()` du schéma sont sans `.max()`. `tags`, `keywords`, `images` sont des tableaux sans borne de cardinalité.

**Pourquoi seulement Bas**
Contexte SSG, données auteur. Pas de risque DoS runtime (tout est figé au build). Au pire, un build local lent.

**Recommandation**
Optionnel : ajouter des bornes raisonnables (`title` max ~200, `description` max ~5000) pour fiabiliser le rendu et signaler les erreurs de saisie tôt. Priorité basse.

---

## Findings Info / Bonnes pratiques validées

### I-1 — Publication npm : package propre ✅
**Fichier** : `package.json:43-46`, sortie `npm pack --dry-run`
Le tarball ne contient que `LICENSE`, `README.md`, `dist/` et `src/` (champ `files`). **Aucun** `.env`, fichier de test, secret, ou `.git` exposé. Pas de `.npmignore` mais le champ `files` (allowlist) est plus sûr qu'une denylist. RAS.

### I-2 — Scripts de cycle de vie npm sans danger ✅
**Fichier** : `package.json` scripts
`prepare` → `npm run build` (tsup) et `prepublishOnly` → `typecheck` + `test:unit`. **Aucun `postinstall`** : l'installation chez le consommateur n'exécute aucun code arbitraire du plugin. C'est la bonne pratique attendue d'une librairie.

### I-3 — Validation des options d'intégration et des chemins de route ✅
**Fichier** : `src/index.ts:63-85`, `src/routes/*.astro`
`normalizeOptions` valide `prefix` (doit commencer par `/`), `pageSize` (≥ 1), `theme` (enum), `collectionName` (non vide), et lève des erreurs explicites. Les routes valident `slug`/`page` et redirigent vers `/404` sur entrée invalide (`series-detail.astro:20`, `series-page.astro:37,43,50`). `getSeriesImages` filtre les chemins via une regex ancrée sur `/src/content/series/<dir>/media/` (`helpers/index.ts:88-91`) — pas de path traversal exploitable (les chemins proviennent d'`import.meta.glob`, résolus au build, pas d'entrée utilisateur). `cli/init.ts` cible un chemin figé (`process.cwd()/src/content.config.ts`) — **pas de path traversal** (aucun argument de chemin accepté).

---

## Synthèse des recommandations priorisées

| Priorité | Action | Fichier |
|----------|--------|---------|
| 1 (Moyen) | Sauvegarde avant réécriture + fusion robuste / fallback manuel | `cli/init.ts:56-64` |
| 2 (Moyen) | Détection d'idempotence tolérante (espaces, guillemets, commentaires) | `cli/init.ts:45,52` |
| 3 (Bas)  | Restreindre `z.url()` aux schémas `http(s)` | `schema.ts:37`, `index.ts:179` |
| 4 (Bas)  | Échapper `<` dans le JSON injecté en `<script>` | `SeriesLightbox.astro:68` |
| 5 (Bas)  | Documenter le non-assainissement des champs `passthrough` | `schema.ts:17,78` |
| 6 (Bas)  | Bornes de longueur optionnelles sur les champs texte | `schema.ts:79-89` |

---

## Verdict

**Score : 8.5 / 10. Aucun blocker.**

Posture de sécurité solide pour une librairie SSG. La surface d'attaque réseau/runtime est nulle par conception (prerender intégral, données trusted). Les findings réels concernent l'**intégrité du fichier consommateur** réécrit par le CLI (M-1, M-2) — à corriger avant la prochaine release pour éviter une corruption silencieuse côté utilisateur — et des **durcissements défense-en-profondeur** (B-1 à B-4) sans risque exploitable dans le modèle de menace actuel. Publication npm exemplaire (pas de postinstall, pas de secret, allowlist `files`).
