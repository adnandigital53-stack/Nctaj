# NC Taj

Website for **NC Taj** (Noorani Canteen, est. 1987) — a delivery-only kitchen
listed on Swiggy, Zomato and Magicpin.

Astro on Cloudflare Workers, `output: 'server'` — every page reads the menu
live from D1 on every request, so an edit made in `/admin` shows up
immediately, no rebuild or redeploy. Photos live in R2. The design rationale
(palette contrast math, canonical terminology, tone) lives in
[`nc-taj-website-plan.md`](./nc-taj-website-plan.md) — it's the original
brief, not a changelog, so read it for *why*, not for current state.

## Architecture

| Piece | What it's for |
|---|---|
| **D1** (`nctaj-menu`) | Categories, items, the placeholder/live toggle — all admin-editable |
| **R2** (`nctaj-menu-images`) | Item photos, both the original seed set and anything uploaded via `/admin` |
| **KV** (`SESSION`) | Login rate-limiting only (not Astro's session API — auth is a signed cookie, see below) |
| **Cloudflare Workers** | Runs the whole site — no separate backend/API |

## Running it locally

```bash
npm install
cp .dev.vars.example .dev.vars   # then set a real ADMIN_PASSWORD in it
npm run db:migrate:local          # creates the local D1 schema
npm run db:seed:local             # loads the 52-item starter menu
npm run dev                       # http://localhost:4321
```

`wrangler` simulates D1/R2/KV locally with no network access needed — nothing
above talks to a real Cloudflare account until you deploy.

### Viewing it on a phone

This is a mobile-first site, so check it on a real phone rather than only in
a desktop window.

```bash
npm run dev:lan        # or: npm run preview:lan for the built site
```

`--host` binds to `0.0.0.0` instead of localhost, and Astro prints a second
**Network:** URL (e.g. `http://192.168.1.x:4321/`). Open that on your phone
with both devices on the same Wi-Fi.

If it doesn't load: the two devices are on different networks (guest Wi-Fi and
main, or the phone is on mobile data), or the machine's firewall is blocking
the port — macOS and Windows both prompt the first time, and the prompt has to
be allowed.

## The admin panel

`/admin` — password from the `ADMIN_PASSWORD` secret (`.dev.vars` locally,
`wrangler secret put ADMIN_PASSWORD` in production). A signed, httpOnly
cookie carries a 12-hour session; 5 wrong passwords from one IP locks out
login attempts for 15 minutes.

From there:

- **Dashboard** (`/admin`) — every item across every category, reorder with
  the ↑/↓ buttons, hide/show without deleting, filter by name, flip the
  placeholder/live banner. Each row shows a relative "edited Xh ago",
  reading `items.updated_at`.
- **Categories** (`/admin/categories`) — add, rename, reorder, delete (only
  once empty).
- **Add/edit an item** (`/admin/items/new`, `/admin/items/<id>`) — name,
  category, price (blank → "Price TBC"), description, veg/bestseller flags,
  and a photo. **Duplicate** on the edit page copies everything including the
  photo, starting hidden with the bestseller flag cleared, so it's a starting
  point to edit rather than something that goes live immediately under the
  same name as the original.
- Photos are compressed to ≤1280px JPEG **in the browser** before upload
  (`src/scripts/photo-compress.ts`), then sniffed server-side by magic bytes
  (`src/lib/image-sniff.ts`) — the declared MIME type is never trusted.

Every write is wrapped in try/catch: a transient D1/R2 failure lands you back
on the same filled-in form with a retry message and logs the real error via
`console.error` (visible in `wrangler tail` / the Cloudflare dashboard once
deployed), instead of losing your place to a raw error page.

## Checks

```bash
npm run check              # contrast (public) + behaviour — safe, read-only
npm run check:contrast     # WCAG AA on every public page, post-cascade
npm run check:behaviour    # filters, nav, analytics, motion, tap targets, overflow
npm run check:admin        # admin double-submit guard, toasts, login — MUTATES local D1
npm run check:admin-a11y   # WCAG AA + mobile checks for /admin/* — read-only
```

All five run against a **running dev or preview server** (`npm run dev` or
`npm run preview` in another terminal). `check:admin` and `check:admin-a11y`
also need `ADMIN_PASSWORD` in `.dev.vars` to log in, and both refuse to run
against anything but the local D1 simulator — `check:admin` creates and
deletes a throwaway category to prove the double-submit guard actually
prevents duplicates (not just that a DOM flag flips), so it must never touch
real data.

`check:contrast` renders each page and measures the colours the browser
actually paints, compositing translucent layers — it exists because a CSS
specificity accident once repainted the header CTA cream-on-saffron (1.89:1),
and reading the stylesheet would not have caught it. `check:admin-a11y` is
the same idea for `/admin/*`, added once there was real styling there to
check (see the [Notes](#notes) below).

## Deploying

```bash
npm run cf:types            # regenerate worker-configuration.d.ts after any wrangler.jsonc change
npm run db:migrate:remote   # apply any new migration to the real D1 database
npm run deploy               # build + wrangler deploy
```

First-time setup on a fresh Cloudflare account: create the D1 database, R2
bucket and KV namespace named in `wrangler.jsonc`, set them there, then run
`wrangler secret put ADMIN_PASSWORD`. `.github/workflows/provision-cloudflare.yml`
automates all of that (D1/R2/KV creation and setting the `ADMIN_PASSWORD`
secret) from `CLOUDFLARE_API_TOKEN` and `ADMIN_PASSWORD` GitHub secrets, if
you'd rather not do it by hand.

After the first deploy, set `siteUrl` in `site.json` to the live URL — that
switches on `og:url`, `og:image`, the canonical tags and the JSON-LD
`Restaurant` structured data, so WhatsApp/social link previews and Google's
rich results start working. Validate previews at
`developers.facebook.com/tools/debug/`, which also clears the cache if the
image changes later.

`public/og.jpg` (1200×630) is a typographic card rendered from the design
system, not real food photography — regenerate it from `scripts/og-template`
once real photos exist.

## Going live

The orange preview banner and `"Price TBC"`-style placeholders are driven by
one toggle — **Go live** on the admin dashboard — not a file edit. Before
flipping it:

- [ ] Real menu items and prices (via `/admin`, not a JSON file)
- [ ] Real photography uploaded per item — no stock food photos
- [ ] Phone, WhatsApp, address, hours, listing URLs in `site.json`
- [ ] Real About/Contact copy
- [ ] `siteUrl` set (see Deploying, above)
- [ ] Flip **Go live**

Already done, contrary to what an older version of this file said: the
self-serve menu editor and the WhatsApp cart are both live (see Architecture
and PWA below). Genuinely still open: a GA4 measurement ID (analytics events
already fire and queue to `dataLayer` either way, so adding the ID later
starts collection with no other change), a Maps link, and social links —
all three are plain fields in `site.json`.

## PWA & offline

`public/sw.js` is network-first for every navigation — this site's entire
point is a live D1 read on every request, so the service worker never caches
an HTML response, only falling back to a precached `/offline` page on a
genuine network failure. Static, content-hashed assets and R2 photos are
cached opportunistically. It never touches `/admin/*` at all. Registration
(in `Base.astro`) is gated to production builds, so it can't interfere with
`astro dev`.

Every response also carries `Cache-Control: no-store` (except `/uploads/*`,
which is content-hashed and safe to cache forever) — so a returning visitor
never sees a stale menu, price, or "closed" state served from their
browser's own HTTP cache. If a new service worker takes over an already-open
tab (a real deploy, not a first visit), the page reloads itself once to pick
up the new code, rather than silently running stale JS until the next manual
refresh.

`manifest.webmanifest` supports "add to home screen" with shortcuts to Order
and Menu.

### Push notifications

Visitors can tick "Notify me about new dishes & offers" in the footer to
subscribe; `/admin/notifications` lets the admin compose a title, message,
and optional link and send it to everyone subscribed. There's no
third-party service (OneSignal, Firebase, etc.) involved — it's a
self-hosted Web Push implementation using only the browser's native Push
API and VAPID (RFC 8292), so there's nothing to sign up for and no external
account depends on this working.

- `src/lib/web-push.ts` — hand-written encryption (RFC 8291) and VAPID JWT
  signing, using only Cloudflare Workers' `crypto.subtle` (no npm
  dependency; `web-push`/`http_ece` aren't Workers-compatible). Cross-checked
  against those two packages' real source as an independent oracle, and
  proven end-to-end by decrypting a real notification sent through the
  actual admin form against a local fake push endpoint — the plaintext
  came back byte-for-byte correct.
- `push_subscriptions` (D1) stores one row per subscribed browser.
  `/api/push/subscribe` and `/api/push/unsubscribe` manage rows;
  `/admin/notifications` prunes a subscription automatically if the push
  service reports it's gone (410/404) rather than erroring on it forever.
- **What's verified vs. not:** the crypto, the wire format, and the
  service worker's `showNotification`/`notificationclick` display logic
  are all tested directly. What can't be tested from this sandbox is a real
  phone/browser subscribing through Google's or Mozilla's actual push
  infrastructure and receiving a real notification — that network path is
  blocked here. After deploying, set the real secret and test on an actual
  device:

  ```bash
  npx wrangler secret put VAPID_PRIVATE_KEY_JWK
  ```

  (paste the JWK value from your local `.dev.vars` — the matching public
  key is already committed in `wrangler.jsonc`, so don't regenerate the
  pair, just carry the existing private key into production). Then open the
  live site on a phone, tick the checkbox, and send a test notification from
  `/admin/notifications`.

### Turning this into an "app"

This is already a fully installable PWA — "Add to Home Screen" on Android
or "Add to Dock"/"Add to Home Screen" on iOS/desktop gives it its own icon,
launches without browser chrome, and works offline (see above). For most
purposes that already *is* "the app."

Actually listing it on the Google Play Store or Apple App Store is a
separate, larger effort this repo can't finish on its own, because it
needs accounts only the site owner can create:

- **Google Play**: wrap this PWA as a Trusted Web Activity (via
  [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) or
  [PWABuilder](https://www.pwabuilder.com/)) and submit it through a Google
  Play Developer account (one-time $25 fee).
- **Apple App Store**: iOS doesn't support TWAs; it'd need a thin native
  wrapper (e.g. Capacitor) around this same site, submitted through an
  Apple Developer Program account ($99/year), and is a materially bigger
  effort than the Android path.

Both require the account holder's own identity/payment details to create,
so that first step has to happen outside this codebase. **This is parked,
not scheduled** — nothing here happens until the owner explicitly asks for
it (see the deferred list in `nc-taj-website-plan.md`, item 7, last in
line). Once an account exists and the owner asks, the packaging step
itself is mechanical.

## Security

- Session auth is a signed cookie (HMAC over an expiry, keyed by
  `ADMIN_PASSWORD`), not a session table — see `src/lib/auth.ts`.
- `src/middleware.ts` sets CSP, HSTS, `X-Frame-Options`,
  `Cross-Origin-Opener-Policy`, `Referrer-Policy` and `Permissions-Policy` on
  every response, and `Cache-Control: no-store` on every D1-backed page (see
  PWA & offline, above) so nothing is ever served stale from a visitor's own
  browser cache.
- Uploaded photos are sniffed by magic bytes server-side
  (`src/lib/image-sniff.ts`), never trusted by declared MIME type alone.

## Notes

- Saffron `#E8A33D` is the primary accent. Terracotta `#C0603C` is **large
  text only** — it measures 4.24:1 on card surfaces and fails for body copy.
  `#C0392B` (the non-veg mark) only clears the 3:1 bar required for a
  graphical icon, not the 4.5:1 a11y floor for text — it's a border/icon
  color, and anywhere it's used as text color instead
  (`.pill--nonveg`, `.btn--danger` in `AdminLayout.astro`) uses `#f3b9b0`
  instead, which does clear it.
- Buttons on saffron take near-black labels. Cream on saffron is 1.89:1.
- `--header-h` is measured at runtime; sticky offsets and scroll anchors
  derive from it, so the preview banner can appear or vanish without
  breaking layout.
- Egg dishes are marked `veg: false`, following the usual Indian convention.
- `AdminLayout.astro`'s `<style>` is `is:global`, not scoped — every admin
  page renders its own markup and only reaches the layout through
  `<slot />`, and Astro's scoping never tags slotted content with the
  parent's scope attribute. A scoped block here would silently match
  nothing a page actually renders — which is exactly what happened before
  this was fixed, with no error to surface it. Confirmed live via
  `getComputedStyle`, not assumed from reading the component.
