import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  // Server output: the menu now lives in D1, editable from /admin, so pages
  // that show it (/, /menu) read live at request time instead of from a
  // build-time JSON file.
  output: 'server',
  adapter: cloudflare({
    imageService: 'passthrough', // D1/R2-backed photos are pre-sized on upload
  }),
  build: { inlineStylesheets: 'auto' },
});
