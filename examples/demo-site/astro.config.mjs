import { defineConfig } from 'astro/config';
import hyperfocale from '@regrets/hyperfocale';

export default defineConfig({
  // `site` est requis par `feeds` : les URLs des flux et du sitemap sont absolues.
  site: 'https://demo.hyperfocale.example',
  integrations: [
    hyperfocale({
      prefix: '/series',
      pageSize: 4,
      theme: 'auto',
      feeds: true,
    }),
  ],
});
