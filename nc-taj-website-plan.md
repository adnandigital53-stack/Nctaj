# NC Taj — Website Plan

> **Build priority, above everything else in this document:** premium feel, genuinely
> good UI, eye-pleasing, attractive. Where a choice below trades polish for
> convenience, polish wins.

## Business Overview
- **Restaurant:** NC Taj — *NC = Noorani Canteen*
- **Established:** 1987
- **Cuisine:** Biryani & Rice, Gravies & Curries, Snacks & Starters, Egg
  Specials, Roti & Bread, Desserts, Coffee & Drinks — veg & non-veg. Taken from
  the restaurant's live Swiggy listing (52 items, 2026-09-24), which supersedes
  the earlier menu poster transcription.
- **Model:** Delivery-only (no dine-in) — currently live on Swiggy, Zomato, Magicpin
- **Location / hours / contact number:** *TBD — required before launch*

**On the 1987 line:** always write it as "Since 1987", never as a year count
("39 years"), so the copy never goes stale and never needs a yearly edit.

## Website Goals
1. Look genuinely appetizing — food photography does most of the work
2. Make the menu easy to browse (veg/non-veg, categories, photos per item)
3. Get people to order — measured by outbound clicks to the delivery apps
4. Build a brand identity on a real foundation — Noorani Canteen, since 1987

## Naming & Terminology (canonical — use these exact strings everywhere)

The earlier draft drifted between three names for the drinks category and two
labels for the order action. These become literal UI text, so they are fixed here.

| Thing | Canonical string |
|---|---|
| Menu categories | **Biryani & Rice** · **Gravies & Curries** · **Snacks & Starters** · **Egg Specials** · **Roti & Bread** · **Desserts** · **Coffee & Drinks** |
| Nav item / page title | **Order** |
| Every call-to-action button | **Order Now** |
| Aggregator strip under the hero | **Order on Swiggy · Zomato · Magicpin** |
| Veg/non-veg filter labels | **All** · **Veg** · **Non-veg** |
| Heritage line | **Since 1987** |

## Site Structure

Mobile-first: every page is designed at 390px wide first, then scaled up.
Traffic will arrive from Instagram bios and WhatsApp forwards, so the phone
layout is the real design, not an afterthought.

| Page | Purpose | Mobile notes |
|---|---|---|
| Home | Hero food photo, tagline, "Order Now", "Since 1987" line, category highlights | Sticky bottom **Order Now** bar from first scroll |
| Menu | The four categories, veg/non-veg filter, photo + price per item | Sticky filter control; thumbs lazy-loaded |
| Order | Direct links to Swiggy / Zomato / Magicpin listings | Three large tap targets, no other content competing |
| About | Noorani Canteen since 1987 — the story that no competitor has | Short. One good photo beats three paragraphs |
| Contact | WhatsApp, phone, address, hours, social links | Tap-to-call and tap-to-WhatsApp, not plain text |

**Contact is not optional.** For a delivery-only brand with no dine-in presence it
is the main trust signal, and it is a prerequisite for payment-gateway activation
if the cart is ever built. About is what carries the 1987 story, so it stays too.

## Design Direction

**Tone:** heritage-premium, not cold-luxury. Noorani Canteen is a 1987 canteen,
not a fine-dining startup — the site should feel *earned* and warm, not minimal
and clinical. Dark and rich, with age as an asset.

**Style:** near-black background, warm saffron accent, cream text. Dark makes
food photography pop and reads high-quality without leaning on a colour trend.

### Palette (contrast-checked against WCAG)

| Token | Hex | Contrast on `#0E0E10` | Use |
|---|---|---|---|
| Background | `#0E0E10` | — | Page base |
| Surface | `#17171A` | — | Cards, menu item tiles |
| Cream (body) | `#F5EFE6` | **16.87:1** | All body copy, headings |
| Cream muted | `#B5ADA1` | **8.68:1** | Secondary text, descriptions |
| Saffron (accent) | `#E8A33D` | **8.94:1** | CTAs, prices, active states, rules |
| Terracotta | `#C0603C` | **4.57:1** | Large display text and decoration **only** |
| Veg mark | `#4CAF50` | **6.94:1** | Veg indicator |
| Non-veg mark | `#C0392B` | **3.55:1** | Non-veg indicator (icon, 3:1 bar) |

**Rules that follow from those numbers:**
- **Saffron is the primary accent, not terracotta.** Saffron clears body-text
  contrast everywhere (8.94:1); terracotta only just clears it on the page
  background (4.57:1) and *fails* on card surfaces (4.24:1).
- **Terracotta never appears as small text.** Large headings, dividers and
  decorative fills only.
- **Saffron buttons take near-black labels** (`#0E0E10` on `#E8A33D` = 8.94:1).
  Cream on saffron is 1.89:1 and is unreadable — never ship it.
- Veg/non-veg use the standard mark (filled shape inside a square outline). The
  outline is what keeps the non-veg maroon legible on card surfaces.

### Typography
- **Headings:** a warm display serif — *Fraunces* (first choice) or *Marcellus*.
  Both carry age and warmth without looking like a template.
- **Body / UI:** *Inter*. Clean, excellent at small sizes on Android.
- Two families maximum, Latin subset only, `font-display: swap`.

### Photography
Hero-driven. This is the single biggest risk in the build: if the photos are
weak, nothing else in this document saves the site.

**Hard rule — no stock food photos.** Stock biryani is the same failure as lorem
ipsum: customers who have actually ordered from you will notice, and it reads as
a brand pretending. If real photos aren't ready, the launch waits.

Shot list (a phone camera in daylight is enough):
- One hero: biryani, 45° or overhead, on a dark matte surface, side window light,
  no flash, no direct sun
- One photo per menu item — **same angle, same distance, same surface for every
  item.** Consistency is what reads premium, not equipment
- 3–4 atmosphere shots for About: the kitchen, hands at work, the dum pot

**Interim exception (2026-09-24):** 51 of 52 menu photos are currently the
restaurant's own Swiggy listing photos — extracted from the live listing,
cropped and digitally enhanced (sharpened, upscaled, colour-corrected), not
new photography and not generic stock. They're a real step up from "Photo
pending," but they're inconsistent with each other (different angles,
surfaces, at least one Swiggy marketing badge baked into the pixels) and
capped in quality by a compressed phone-screenshot source. `menu.json` stays
`"status": "placeholder"` until the shot list above replaces them — that's
what the hard rule above still means for launch.

### Logo
No logo yet. Plan a simple wordmark as part of the build, with a **NC TAJ /
SINCE 1987** lockup — the date is the differentiator, so it belongs in the mark.
Launching on typography alone is acceptable.

## Ordering (initial build)

"Order on Swiggy / Zomato / Magicpin" buttons linking straight to the existing
listings. No cart, no payment processing, no backend.

Placements: hero strip, sticky mobile bar, end of the Menu page, Order page,
footer.

## Analytics & Click Tracking

Outbound clicks are the only conversion signal the site can observe, so they get
tracked from day one. **GA4** (free, standard) unless there's a reason to prefer
Plausible.

Events:

| Event | Parameters |
|---|---|
| `order_click` | `platform`: swiggy \| zomato \| magicpin · `placement`: hero \| sticky \| menu \| order_page \| footer |
| `menu_filter` | `filter`: all \| veg \| nonveg |
| `whatsapp_click` | `placement` |
| `call_click` | `placement` |

**Known limitation, stated honestly:** the site can count clicks *out*; the
aggregators count orders *in*. Nothing joins the two, so treat click counts as a
directional signal, not a conversion rate.

## Performance & Mobile-First

A slow premium site is not premium. Heavy hero photography on Indian 4G is the
most likely way this build fails in the real world.

- **LCP ≤ 2.5s** on a mid-range Android over 4G
- Hero image **≤ 200KB** (AVIF with WebP fallback)
- Menu thumbnails **≤ 60KB** each, lazy-loaded below the fold
- Total initial payload **≤ 1MB**
- `srcset` at 400 / 800 / 1200 / 1600px
- Tap targets ≥ 44px; no interaction that depends on hover

## Technical Notes (for the Claude Code build)

- **Stack:** **Astro**, static output. It gives component reuse and built-in
  image optimisation (automatic AVIF/WebP + `srcset`), which is exactly the
  performance requirement above. Plain HTML/CSS/JS remains a valid fallback if a
  zero-build-step site is preferred — but then image optimisation becomes manual.
- **Menu data lives in one file: `menu.json`.** Nothing about the menu is
  hardcoded in markup. Shape:

  ```json
  {
    "categories": [
      {
        "id": "biryani",
        "name": "Biryani",
        "blurb": "one line of character, not just a header",
        "items": [
          {
            "id": "chicken-dum-biryani",
            "name": "Chicken Dum Biryani",
            "description": "",
            "price": 0,
            "veg": false,
            "photo": "/img/menu/chicken-dum-biryani.avif",
            "available": true,
            "tags": ["bestseller"]
          }
        ]
      }
    ]
  }
  ```

- **Menu updates:** handled through Claude for now — prices, new items and the
  `available` flag are edits to `menu.json`, not code changes. A manual
  self-serve editor is on the deferred list.
- **Hosting:** **Cloudflare Pages**, static. Unlimited bandwidth on the free
  tier (this site will be mostly photography), the densest edge presence in
  India, no non-commercial licence restriction, and it deploys from GitHub so
  a push updates the live site with no terminal involved. Netlify is an equally
  easy second choice; Vercel's free Hobby tier is non-commercial only, and
  Firebase Hosting meters free transfer at ~360MB/day and deploys via CLI.
  Until a domain is bought the site runs on the platform subdomain — link
  previews and anything printed or posted will need redoing when the domain
  moves, so buy it before anything goes on packaging or Instagram.

- **Hosting does not lock in the backend.** A static frontend can call an API on
  any host, so the add-on phase is not constrained by this choice. If it stays
  on Cloudflare the upgrade path is in the same account and the same deploy
  pipeline: **Workers** for the cart/checkout API and the payment webhook,
  **D1** for order storage, **R2** for images if they outgrow the repo — all
  with usable free tiers. Firebase's equivalent (Cloud Functions) requires
  leaving the free plan. Supabase paired with any host is also viable. None of
  this needs deciding now, and nothing about it is harder for having started on
  Pages.

## Competitor Notes
*From nandhanarestaurants.com and Hotel Pai Vista's restaurant page*

**Avoid:**
- Templated, page-builder look (heavy WordPress/Elementor feel, a whole section
  duplicated on one site) — NC Taj should read custom-built
- Generic/corporate tone — one site is really a hotel-booking page with
  restaurants attached; its CTAs say "Book Now" instead of anything food-specific
- Unfinished copy going live — one site still has "lorem ipsum" under its hero
  images. **Hard rule: nothing ships without real copy, and nothing ships with
  stock food photos**
- No visible ordering path on either site — a real gap the Swiggy/Zomato/Magicpin
  buttons close immediately

**Worth borrowing:**
- A short personality blurb per menu category instead of a flat list — biryani,
  North Indian, desserts and coffee each get a line of character
- A compact "available on" strip near the hero — NC Taj's version:
  "Order on Swiggy · Zomato · Magicpin" directly under the hero

**What neither has:** a story. Noorani Canteen has been feeding people since
1987. That is the one thing a competitor cannot copy, and it should be visible
above the fold, not buried on About.

## Open Items (blocking launch)

| # | Item | Owner | Target | Blocking? |
|---|---|---|---|---|
| 1 | Parotha's price — never appeared unobstructed in any source screenshot | TBD | TBD | **Yes** — only item still showing "Price TBC" |
| 2 | Real food photography (see shot list) — replaces the interim Swiggy-sourced photos | TBD | TBD | **Yes — blocks launch** |
| 3 | Copy: tagline, About story, category blurbs | TBD | TBD | **Yes** — currently placeholder prose |
| 4 | Logo — wordmark now, or launch on type only | TBD | TBD | No |
| 5 | Google Business Profile | TBD | TBD | No |

**Decided (2026-09-24):** menu prices ship as Swiggy's current price exactly as
shown, discounts included (e.g. Biryani Rice at ₹85 off a ₹142 MRP) — not the
standing price. Owner's call, to be revisited later rather than held up now.

**Done:** location, hours and both phone numbers · WhatsApp · Swiggy / Zomato /
Magicpin listing links · FSSAI licence number · link previews (image built;
activates when `siteUrl` is set) · full 52-item menu transcribed from the live
Swiggy listing, deduplicated, recategorised into 7 categories · interim photos
for 51 of 52 items (see the Photography section's 2026-09-24 note).

## Deferred — after the main site is done, in this order

1. **GA4 measurement ID.** The property has to be created in the owner's Google
   account; the site then needs only the `G-XXXXXXXXXX` string. Until it lands,
   click events still fire and queue to `dataLayer` — nothing is lost from the
   code side, but nothing is being recorded either.
2. **Google Maps link, Instagram and Facebook** — small additions to
   `site.json`; the Contact page and footer pick them up automatically.
3. **Legal pages** — Terms, Privacy Policy, Refund & Cancellation, Shipping &
   Delivery. Not just good practice: Razorpay and Cashfree will not activate an
   account without them live on the site.
4. **Manual menu editing** — a self-serve way to add items and change prices
   without going through Claude.
5. **Domain name** + matching business email.
6. **Cart + checkout + payments.** *This book stays closed until everything
   above is finished.* When it opens, the blocker is not the payment gateway —
   it is fulfilment (who delivers, how the kitchen is notified of an order,
   delivery radius, minimum order, delivery fee, GST, refunds). Gateway KYC
   (GST/PAN, business bank account) is genuinely not urgent — but business
   registration and FSSAI paperwork can take weeks, so start those early if this
   phase is wanted soon.
