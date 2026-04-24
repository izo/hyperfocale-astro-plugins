# Changelog

Toutes les modifications notables de ce projet sont documentées ici.

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/)
Versioning : [Semantic Versioning](https://semver.org/lang/fr/)

---

## [0.1.1] — 2026-04-24

### Corrigé
- Vulnérabilités devDep : `astro` devDep mis à jour vers `^6.1.6` (CVE XSS dans `define:vars`)
- Vulnérabilités devDep : `vitest` mis à jour de `^2.0.0` vers `^4.0.0` (CVE Vite path traversal + WebSocket)
- Script `prepare` ajouté pour garantir le build avant validation du champ `bin` lors de `npm publish`

### Modifié
- Package renommé en `@izo/hyperfocale` et publié sur GitHub Packages
- README entièrement réécrit : guide d'installation GitHub Packages, référence complète des composants, helpers, thème, schéma extensible
- `examples/demo-site` mis à jour pour utiliser `@izo/hyperfocale`
- Tous les imports dans la documentation propagés vers `@izo/hyperfocale`

### Ajouté
- Fichier `LICENSE` (MIT)
- Fichier `.npmrc` pour le registry GitHub Packages (`@izo:registry=https://npm.pkg.github.com`)
- Champs `repository`, `homepage`, `bugs` dans `package.json`

---

## [0.1.0] — 2026-04-24

### Ajouté
- Intégration Astro 6 : `defineIntegration`, options `prefix`, `pageSize`, `theme`
- Content Collection `series` avec schéma Zod (`title`, `date`, `description`, `cover`, `location`)
- Module virtuel `virtual:hyperfocale/collection` pour l'extensibilité du schéma
- Routes injectées : `/series/`, `/series/[slug]/`, `/series/[slug]/[page]/`
- Composants Astro : `SeriesCard`, `SeriesList`, `SeriesGallery`, `SeriesLightbox`
- Helpers TypeScript : `getSeriesList`, `getSeriesBySlug`, `getSeriesImages`, `paginateImages`
- Thème CSS avec custom properties `--hf-*` (light / dark / auto)
- CLI `npx hyperfocale init` — crée ou met à jour `src/content.config.ts` (idempotent)
- Build tsup : ESM + types `.d.ts`, hook de copie `.astro` et `.css`
- Suite de tests : 16 tests unitaires (schema + helpers) + 24 tests e2e (build statique Astro)
- Site exemple complet dans `examples/demo-site/`
