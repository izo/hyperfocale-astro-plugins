import { defineConfig } from 'tsup';
import { cpSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    // Entrée à part entière : le module virtuel `virtual:hyperfocale/collection`
    // importe `dist/schema.js` par chemin absolu pour ne pas redéclarer le shape.
    schema: 'src/schema.ts',
    'components/index': 'src/components/index.ts',
    'helpers/index': 'src/helpers/index.ts',
    'cli/init': 'src/cli/init.ts',
    // Résolveur de médias pur (aucun node:*, ni astro, ni zod) et loader Content
    // Layer (Node) : lisent un corpus rangé hors de `src/content/` (#130).
    media: 'src/media.ts',
    // Libellés et formats des composants (#136) — pur, chargeable partout.
    i18n: 'src/i18n.ts',
    // Outils internes des composants, importés par les `.astro` copiés dans
    // dist/components/ (hors champ `exports`).
    'components/runtime': 'src/components/runtime.ts',
    // Script client de SeriesFilter, importé par son `<script>` (#136, W4).
    'components/filter-client': 'src/components/filter-client.ts',
    // Repli d'erreur des images réécrites par un `imageProvider` (#136, P0).
    'components/image-fallback': 'src/components/image-fallback.ts',
    loader: 'src/loader.ts',
    // Contrat d'ingestion : sous-chemins additifs, jamais importés par
    // l'intégration. `ingest/index`, `ingest/dropbox` et `ingest/webdav`
    // restent sans module `node:*` (vérifié par tests/unit/ingest/exports.test.ts).
    'ingest/index': 'src/ingest/index.ts',
    'ingest/fs': 'src/ingest/fs.ts',
    'ingest/dropbox': 'src/ingest/dropbox.ts',
    'ingest/webdav': 'src/ingest/webdav.ts',
  },
  format: ['esm'],
  // Déclarations émises séparément par `tsc --emitDeclarationOnly` (script build) :
  // le bundler de dts de tsup (rollup-plugin-dts) plante sous Node récent
  // (`useCaseSensitiveFileNames`). tsc est plus robuste et suffit ici.
  dts: false,
  clean: true,
  // `.astro` : le barrel des composants les réexporte en chemins relatifs,
  // copiés à côté par `onSuccess` ; esbuild ne sait pas les compiler.
  external: ['astro', 'astro:content', 'astro:assets', 'zod', /\.astro$/],
  // Copier les fichiers .astro (routes, composants, thème) dans dist/
  // car tsup ne compile que les fichiers TypeScript
  onSuccess: async () => {
    const dirs = ['routes', 'components', 'theme', 'layouts'];
    for (const dir of dirs) {
      cpSync(resolve('src', dir), resolve('dist', dir), {
        recursive: true,
        filter: (src) => !src.endsWith('.ts'),
      });
    }
    console.log('[tsup] .astro et .css copiés dans dist/');
  },
});
