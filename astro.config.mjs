import { defineConfig } from 'astro/config';

export default defineConfig({
  // Static output — no backend. See nc-taj-website-plan.md.
  output: 'static',
  build: { inlineStylesheets: 'auto' },
});
