# NC Taj

Website for **NC Taj** (Noorani Canteen, est. 1987) — a delivery-only kitchen
listed on Swiggy, Zomato and Magicpin.

Static Astro site, no backend. The full brief lives in
[`nc-taj-website-plan.md`](./nc-taj-website-plan.md) — read it before changing
the palette, the terminology or the performance budget.

## Running it

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # static output to dist/
npm run preview    # serve the built site
```

## Checks

Both run against a **running preview server** (`npm run preview` in another
terminal):

```bash
npm run check             # both
npm run check:contrast    # WCAG AA on every page, post-cascade
npm run check:behaviour   # filters, nav, analytics, tap targets, overflow
```

`check:contrast` renders each page and measures the colours the browser
actually paints, compositing translucent layers. It exists because a CSS
specificity accident once repainted the header CTA cream-on-saffron (1.89:1) —
reading the stylesheet would not have caught it.

`check:behaviour` derives its expectations from `menu.json`, so editing the menu
does not break the tests.

## Editing the menu

Everything lives in **`src/data/menu.json`**. No markup changes needed.

```jsonc
{
  "status": "placeholder",   // "live" hides the preview banner + shows prices
  "categories": [
    {
      "id": "biryani",       // also the anchor: /menu#biryani
      "name": "Biryani",
      "blurb": "One line of character.",
      "items": [
        {
          "id": "chicken-dum-biryani",
          "name": "Chicken Dum Biryani",
          "description": "Shown under the name.",
          "price": 320,           // number, or null → renders "Price TBC"
          "veg": false,           // drives the veg/non-veg mark + filter
          "photo": "/img/menu/chicken-dum-biryani.avif",  // or null
          "available": true,      // false removes it from the site entirely
          "tags": ["bestseller"]  // "bestseller" renders a chip
        }
      ]
    }
  ]
}
```

Site-wide details — phone, WhatsApp, address, hours, aggregator links, GA4 ID,
FSSAI number — live in **`src/data/site.json`**. Anything left `null` renders as
"coming soon" rather than as a dead link, so a half-filled config never ships
something broken.

## Going live

This build is a **preview**. The orange banner is rendered automatically while
`menu.json` has `"status": "placeholder"`, and disappears on its own once set to
`"live"`. Before flipping it:

- [ ] Real menu items and prices in `menu.json`
- [ ] Real photography (see the shot list in the plan) — **no stock food photos**
- [ ] Phone, WhatsApp, address, hours in `site.json`
- [ ] Swiggy / Zomato / Magicpin listing URLs in `site.json`
- [ ] GA4 measurement ID in `site.json` (until then, events queue to `dataLayer`)
- [ ] `"status": "live"`

Deferred, in order: OG/WhatsApp previews → FSSAI number → legal pages → a
self-serve menu editor → domain → cart and checkout. See the plan.

## Photography

`PhotoSlot.astro` renders a designed placeholder when `photo` is `null`. When
real photos land, swap its `<img>` for Astro's `<Image />` to get automatic
AVIF/WebP and `srcset` — that is most of the performance budget handled.

Budget: LCP ≤ 2.5s on mid-range Android over 4G, hero ≤ 200KB, thumbs ≤ 60KB,
total initial payload ≤ 1MB. The current build ships ~7KB gzipped and no JS
bundle, so the entire budget is available for images.

## Notes

- Saffron `#E8A33D` is the primary accent. Terracotta `#C0603C` is **large text
  only** — it measures 4.24:1 on card surfaces and fails for body copy.
- Buttons on saffron take near-black labels. Cream on saffron is 1.89:1.
- `--header-h` is measured at runtime; sticky offsets and scroll anchors derive
  from it, so the preview banner can appear or vanish without breaking layout.
- Egg dishes are marked `veg: false`, following the usual Indian convention.
