/**
 * Behaviour checks against a running build (npm run preview).
 * Expectations are derived from menu.json so they survive menu edits.
 *
 *   node scripts/check-behaviour.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:4321';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const menu = JSON.parse(readFileSync(new URL('../src/data/menu.json', import.meta.url)));
const items = menu.categories.flatMap((c) => c.items.filter((i) => i.available));
const TOTAL = items.length;
const VEG = items.filter((i) => i.veg).length;
const NONVEG = TOTAL - VEG;

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass, detail });

const b = await chromium.launch({ executablePath: EXEC });

// ---- menu filter ----
let ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
let p = await ctx.newPage();
await p.goto(`${BASE}/menu`, { waitUntil: 'load' });

check('all items visible initially', (await p.locator('.item:not([hidden])').count()) === TOTAL);

await p.getByRole('button', { name: 'Veg', exact: true }).click();
await p.waitForTimeout(200);
check(
  'veg filter shows only veg',
  (await p.locator('.item:not([hidden])').count()) === VEG &&
    (await p.locator('.item:not([hidden])[data-veg="false"]').count()) === 0,
);

await p.getByRole('button', { name: 'Non-veg', exact: true }).click();
await p.waitForTimeout(200);
check(
  'non-veg filter shows only non-veg',
  (await p.locator('.item:not([hidden])').count()) === NONVEG &&
    (await p.locator('.item:not([hidden])[data-veg="true"]').count()) === 0,
);

// an all-non-veg category must be collapsed while the non-veg filter is off...
const allNonVegCats = menu.categories.filter((c) => c.items.every((i) => !i.veg)).map((c) => c.id);
// (currently showing non-veg, so these must be VISIBLE)
for (const id of allNonVegCats) {
  check(`category "${id}" visible under non-veg`, (await p.locator(`#${id}`).evaluate((el) => el.hidden)) === false);
}

// ...and collapse under the veg filter
await p.getByRole('button', { name: 'Veg', exact: true }).click();
await p.waitForTimeout(200);
for (const id of allNonVegCats) {
  check(`category "${id}" collapses under veg`, (await p.locator(`#${id}`).evaluate((el) => el.hidden)) === true);
}

// any all-veg category must collapse under the non-veg filter
const allVegCats = menu.categories.filter((c) => c.items.every((i) => i.veg)).map((c) => c.id);
if (allVegCats.length) {
  await p.getByRole('button', { name: 'Non-veg', exact: true }).click();
  await p.waitForTimeout(200);
  for (const id of allVegCats) {
    check(`category "${id}" collapses under non-veg`, (await p.locator(`#${id}`).evaluate((el) => el.hidden)) === true);
  }
}

// a category the menu never renders must not be queried at all
const emptyCats = menu.categories.filter((c) => !c.items.some((i) => i.available)).map((c) => c.id);
for (const id of emptyCats) {
  check(`empty category "${id}" is not rendered`, (await p.locator(`#${id}`).count()) === 0);
}

await p.getByRole('button', { name: 'All', exact: true }).click();
await p.waitForTimeout(200);
check('all restores', (await p.locator('.item:not([hidden])').count()) === TOTAL);

// ---- analytics ----
// preventDefault, otherwise navigation wipes dataLayer before we read it.
await p.goto(`${BASE}/`, { waitUntil: 'load' });
const event = await p.evaluate(() => {
  window.dataLayer = [];
  const a = document.querySelector('a.btn--primary[data-placement="hero"]');
  a.addEventListener('click', (e) => e.preventDefault(), { once: true });
  a.click();
  return window.dataLayer[0] ?? null;
});
check(
  'order_click fires with placement',
  event?.event === 'order_click' && event?.placement === 'hero',
  JSON.stringify(event),
);
// ---- client-side navigation (ClientRouter) ----
// Soft navigation doesn't re-run inline scripts the way a full load does,
// so the filter and the persisted header are re-checked after a link click.
await p.goto(`${BASE}/`, { waitUntil: 'load' });
await p.locator('a[href="/menu"]').first().click();
await p.waitForURL('**/menu');
await p.waitForTimeout(500);

check('soft nav renders the menu', (await p.locator('.item').count()) === TOTAL);

await p.getByRole('button', { name: 'Veg', exact: true }).click();
await p.waitForTimeout(250);
check(
  'filter works after soft nav',
  (await p.locator('.item:not([hidden])').count()) === VEG,
  `saw ${await p.locator('.item:not([hidden])').count()}, expected ${VEG}`,
);

check(
  'header survives soft nav',
  (await p.locator('.header').count()) === 1 && (await p.locator('.burger').count()) === 1,
);

// --header-h must still be a real measurement, not the CSS fallback
const hh = await p.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--header-h').trim(),
);
check('header height re-measured after soft nav', /^\d+(\.\d+)?px$/.test(hh) && parseFloat(hh) > 40, `--header-h = ${hh}`);

await ctx.close();

// ---- mobile ----
ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
p = await ctx.newPage();
await p.goto(`${BASE}/`, { waitUntil: 'load' });

check('mobile nav closed at rest', await p.locator('.mobile-nav').evaluate((el) => el.getBoundingClientRect().height < 5));
await p.locator('.burger').click();
await p.waitForTimeout(450);
check(
  'mobile nav opens',
  (await p.locator('.mobile-nav').evaluate((el) => el.getBoundingClientRect().height > 100)) &&
    (await p.locator('.burger').getAttribute('aria-expanded')) === 'true',
);
await p.locator('.burger').click();
await p.waitForTimeout(400);

await p.evaluate(() => window.scrollTo(0, 900));
await p.waitForTimeout(600);
check('sticky order bar appears on scroll', await p.locator('.order-bar').evaluate((el) => el.classList.contains('is-visible')));

const small = await p.evaluate(() =>
  [...document.querySelectorAll('a, button')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.height > 0 && r.height < 44 && !el.closest('.footer') && !el.classList.contains('strip__item');
    })
    .map((el) => `${el.className || el.tagName}:${Math.round(el.getBoundingClientRect().height)}px`),
);
check('tap targets >= 44px', small.length === 0, small.join(', '));

check('no horizontal scroll at 390px', !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));

await ctx.close();
await b.close();

let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.pass || !r.detail ? '' : '  — ' + r.detail}`);
  if (!r.pass) failed++;
}
console.log(failed ? `\n${failed} FAILED` : `\nall ${results.length} behaviour checks passed`);
process.exit(failed ? 1 : 0);
