import { defineConfig } from 'astro/config';
import hyperfocale from 'hyperfocale';

export default defineConfig({
  integrations: [
    hyperfocale({
      prefix: '/series',
      pageSize: 4,
      theme: 'auto',
    }),
  ],
});
