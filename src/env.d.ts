/// <reference types="astro/client" />

// worker-configuration.d.ts is generated (`npm run cf:types`) and gitignored —
// it declares the global `Env`/`Cloudflare.Env` interface (DB, MENU_IMAGES,
// SESSION, ASSETS, and ADMIN_PASSWORD — wrangler picks the secret up from
// .dev.vars locally). Bindings are read via `import { env } from
// 'cloudflare:workers'`, not `Astro.locals.runtime.env` (removed in Astro v6).
type Runtime = import('@astrojs/cloudflare').Runtime;

declare namespace App {
  interface Locals extends Runtime {
    /** Set by src/middleware.ts once a request's admin cookie is verified. */
    isAdmin?: boolean;
  }
}
