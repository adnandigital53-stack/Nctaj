/**
 * Behaviour checks against a running dev/preview server.
 * Expectations are derived from the live D1 database (the real source of
 * truth since the admin portal shipped), not the static seed file — those
 * two diverge the moment anyone edits an item, and a check pinned to the
 * seed file would then be testing the wrong thing.
 *
 *   node scripts/check-behaviour.mjs
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE || 'http://localhost:4321';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const D1_MODE = process.env.D1_REMOTE ? '--remote' : '--local';

function d1Query(sql) {
  const out = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'nctaj-menu', D1_MODE, '--json', '--command', sql],
    { cwd: new URL('..', import.meta.url), encoding: 'utf8' },
  );
  return JSON.parse(out)[0].results;
}

const menu = {
  categories: d1Query('SELECT id, name FROM categories ORDER BY sort_order').map((c) => ({
    ...c,
    items: d1Query(`SELECT * FROM items WHERE category_id = '${c.id}' AND available = 1 ORDER BY sort_order`).map(
      (i) => ({ id: i.id, name: i.name, veg: !!i.veg }),
    ),
  })),
};
const items = menu.categories.flatMap((c) => c.items);
const TOTAL = items.length;
const VEG = items.filter((i) => i.veg).length;
const NONVEG = TOTAL - VEG;

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass, detail });

// `page.locator(sel).count()` has proven unreliable against this page in this
// environment — it settles on a stale, too-high count for `.item` selectors
// a beat after a synchronous DOM mutation (52 elements, many toggling
// `hidden` at once), while the page's own `document.querySelectorAll` (what
// actually drives rendering, and what a real visitor's browser also runs)
// consistently reports the correct number at the same instant. Verified with
// a live diff harness: `locator.count()` reads 38 and stays there over the
// next half second while `evaluate(() => querySelectorAll(...).length)` on
// the very same page, same moment, reads the correct 34 throughout — so
// every `.item` count in this file goes through `evaluate` instead.
const count = (page, sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);

const b = await chromium.launch({ executablePath: EXEC });

// ---- menu filter ----
let ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
let p = await ctx.newPage();
await p.goto(`${BASE}/menu`, { waitUntil: 'load' });

check('all items visible initially', (await count(p, '.item:not([hidden])')) === TOTAL);

await p.getByRole('button', { name: 'Veg', exact: true }).click();
await p.waitForTimeout(200);
check(
  'veg filter shows only veg',
  (await count(p, '.item:not([hidden])')) === VEG &&
    (await count(p, '.item:not([hidden])[data-veg="false"]')) === 0,
);

await p.getByRole('button', { name: 'Non-veg', exact: true }).click();
await p.waitForTimeout(200);
check(
  'non-veg filter shows only non-veg',
  (await count(p, '.item:not([hidden])')) === NONVEG &&
    (await count(p, '.item:not([hidden])[data-veg="true"]')) === 0,
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

// a category the menu never renders must not be queried at all. (The D1
// query above already filters to available=1, unlike the old in-memory
// menu.json read, so "empty" here just means zero rows came back.)
const emptyCats = menu.categories.filter((c) => c.items.length === 0).map((c) => c.id);
for (const id of emptyCats) {
  check(`empty category "${id}" is not rendered`, (await p.locator(`#${id}`).count()) === 0);
}

await p.getByRole('button', { name: 'All', exact: true }).click();
await p.waitForTimeout(200);
check('all restores', (await count(p, '.item:not([hidden])')) === TOTAL);

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
// ---- live open/closed status ----
// Pinned clock, because the whole point is that it reads the kitchen's
// timezone (Asia/Kolkata, UTC+5:30) and not the visitor's.
{
  const cases = [
    { utc: '2026-06-15T06:30:00Z', ist: '12:00', cls: 'is-open',   text: /open now/i },
    { utc: '2026-06-15T21:30:00Z', ist: '03:00', cls: 'is-closed', text: /closed/i },
    { utc: '2026-06-15T17:00:00Z', ist: '22:30', cls: 'is-soon',   text: /closing in 30 min/i },
  ];

  for (const c of cases) {
    const tzCtx = await b.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'America/New_York' });
    await tzCtx.clock.setFixedTime(new Date(c.utc));
    const tp = await tzCtx.newPage();
    await tp.goto(`${BASE}/`, { waitUntil: 'load' });
    await tp.waitForTimeout(400);

    const el = tp.locator('.status--hero');
    const visible = await el.isVisible();
    const cls = await el.getAttribute('class');
    const txt = (await el.locator('.status__text').textContent()) ?? '';

    check(
      `status at ${c.ist} IST → ${c.cls}`,
      visible && cls.includes(c.cls) && c.text.test(txt),
      `visible=${visible} class="${cls}" text="${txt}"`,
    );
    await tzCtx.close();
  }
}

// ---- menu jump chips ----
{
  const jctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const jp = await jctx.newPage();
  await jp.goto(`${BASE}/menu`, { waitUntil: 'load' });
  await jp.waitForTimeout(400);

  const live = menu.categories.filter((c) => c.items.length > 0);
  check('a jump chip per rendered category', (await jp.locator('[data-jump]').count()) === live.length);

  // scroll-spy marks the category you're looking at
  const target = live[live.length - 1].id;
  await jp.locator(`#${target}`).scrollIntoViewIfNeeded();
  await jp.evaluate(() => window.scrollBy(0, 120));
  await jp.waitForTimeout(700);
  check(
    'scroll-spy marks the visible category',
    (await jp.locator(`[data-jump="${target}"]`).getAttribute('aria-current')) === 'true',
  );

  check('scroll progress bar present', (await jp.locator('.progress').count()) === 1);
  await jctx.close();
}

// ---- client-side navigation (ClientRouter) ----
// Soft navigation doesn't re-run inline scripts the way a full load does,
// so the filter and the persisted header are re-checked after a link click.
await p.goto(`${BASE}/`, { waitUntil: 'load' });
await p.locator('a[href="/menu"]').first().click();
await p.waitForURL('**/menu');
await p.waitForTimeout(500);

check('soft nav renders the menu', (await count(p, '.item')) === TOTAL);

await p.getByRole('button', { name: 'Veg', exact: true }).click();
await p.waitForTimeout(250);
check(
  'filter works after soft nav',
  (await count(p, '.item:not([hidden])')) === VEG,
  `saw ${await count(p, '.item:not([hidden])')}, expected ${VEG}`,
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

const wordsOffset = (page) => page.evaluate(() =>
  [...document.querySelectorAll('.hero .split .w > span')].filter((el) => {
    const t = getComputedStyle(el).transform;
    if (t === 'none') return false;
    const m = t.match(/matrix\(([^)]+)\)/);
    return !m || Math.abs(parseFloat(m[1].split(',')[5])) > 0.5;
  }).length,
);

// ---- premium motion ----
{
  const mctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const mp = await mctx.newPage();

  // Regression: entrance animations used to hold `transform: none` and cancel
  // the hover lift. It measured 0px for a whole round without anyone noticing.
  for (const [url, sel] of [['/menu', '.item'], ['/', 'a.card.reveal']]) {
    await mp.goto(`${BASE}${url}`, { waitUntil: 'load' });
    await mp.waitForTimeout(1500);
    const card = mp.locator(sel).first();
    await card.scrollIntoViewIfNeeded();
    await mp.waitForTimeout(1200);
    await mp.mouse.move(5, 5);
    await mp.waitForTimeout(500);
    const before = (await card.boundingBox()).y;
    await card.hover();
    await mp.waitForTimeout(700);
    const lift = before - (await card.boundingBox()).y;
    check(`hover lift works on ${url} ${sel}`, lift >= 4, `lifted ${lift.toFixed(1)}px`);
  }

  // Headline words rise out of their masks and come to rest.
  await mp.goto(`${BASE}/`, { waitUntil: 'load' });
  // Chrome restores the previous scroll position on a same-URL navigation,
  // which would put the hero off screen and (correctly) pause the embers.
  await mp.evaluate(() => window.scrollTo(0, 0));
  await mp.waitForTimeout(2400);
  const stuck = await wordsOffset(mp);
  check('headline words finish rising', stuck === 0, `${stuck} words still offset`);

  // Embers run while the hero is on screen and pause when it isn't.
  const running = () => mp.evaluate(() => window.__nctaj?.embersRunning === true);
  check('embers running on the hero', await running());
  check('ember canvas faded in', await mp.locator('.embers.is-live').count() === 1);
  await mp.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await mp.waitForTimeout(600);
  check('embers pause when the hero is off screen', !(await running()));
  await mp.evaluate(() => window.scrollTo(0, 0));
  await mp.waitForTimeout(600);
  check('embers resume when it comes back', await running());

  // Soft navigation must stop the loop, and returning must restart it.
  await mp.locator('.nav a[href="/menu"]').click();
  await mp.waitForURL('**/menu');
  await mp.waitForTimeout(600);
  check('embers stop after navigating away', !(await running()));
  await mp.locator('.wordmark').click();
  await mp.waitForURL(`${BASE}/`);
  await mp.waitForTimeout(900);
  check('embers restart after navigating back', await running());

  // Dish ribbon: two identical sets so the loop is seamless.
  const sets = await mp.locator('.ribbon__set').evaluateAll((els) =>
    els.map((el) => el.querySelectorAll('.ribbon__item').length),
  );
  check('ribbon has two matching sets of every dish', sets.length === 2 && sets[0] === TOTAL && sets[1] === TOTAL, JSON.stringify(sets));
  check('ribbon hidden from screen readers', (await mp.locator('.ribbon').getAttribute('aria-hidden')) === 'true');

  // Magnetic pull on primary buttons, released on leave.
  const btn = mp.locator('.hero__actions .btn--primary');
  const bb = await btn.boundingBox();
  await mp.mouse.move(bb.x + bb.width - 6, bb.y + 6);
  await mp.waitForTimeout(150);
  const pulled = await btn.evaluate((el) => el.style.translate);
  await mp.mouse.move(5, 5);
  await mp.waitForTimeout(150);
  const released = await btn.evaluate((el) => el.style.translate);
  check('primary button pulls toward the cursor', pulled !== '' && released === '', `pulled="${pulled}" released="${released}"`);

  await mctx.close();
}

// ---- reduced motion: everything calm, nothing hidden ----
{
  const rctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const rp = await rctx.newPage();
  await rp.goto(`${BASE}/`, { waitUntil: 'load' });
  await rp.waitForTimeout(300);
  check('reduced motion: no embers', !(await rp.evaluate(() => window.__nctaj?.embersRunning === true)));
  const offset = await wordsOffset(rp);
  check('reduced motion: headline readable immediately', offset === 0, `${offset} words offset`);
  const ribbonAnim = await rp.locator('.ribbon__track').evaluate((el) => getComputedStyle(el).animationName);
  check('reduced motion: ribbon still', ribbonAnim === 'none', ribbonAnim);
  await rctx.close();
}

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
