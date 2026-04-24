import { defineConfig } from 'astro/config';
import hyperfocale from '@izo/hyperfocale';

export default defineConfig({
  integrations: [
    hyperfocale({
      prefix: '/series',
      pageSize: 4,
      theme: 'auto',
    }),
  ],
});
