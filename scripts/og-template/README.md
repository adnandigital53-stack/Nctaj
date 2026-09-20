# Link-preview card

`card.html` renders the 1200×630 image at `public/og.jpg`. Fonts are embedded
as base64 so it renders identically anywhere, with no network access.

Regenerate after editing (needs a Chromium available to Playwright):

```js
import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1200, height: 630 } });
const p = await ctx.newPage();
await p.goto('file://' + process.cwd() + '/scripts/og-template/card.html');
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: 'public/og.jpg', type: 'jpeg', quality: 92 });
await b.close();
```

Keep it as JPEG: the grain texture makes PNG ~590KB, which is large enough
that WhatsApp becomes unreliable about generating a thumbnail. JPEG q92 is
82KB for the same result.
