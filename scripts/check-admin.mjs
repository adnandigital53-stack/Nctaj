/**
 * Behaviour checks for the admin portal — login, the double-submit guard on
 * forms, and the flash-message toasts. Separate from check-behaviour.mjs
 * (which is read-only) because these create and delete a throwaway category
 * to exercise real form submissions, so this must only ever run against the
 * local D1 simulator, never a real database.
 *
 *   node scripts/check-admin.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

if (process.env.D1_REMOTE) {
  console.error('✗ refusing to run: this script creates and deletes real data and must not target a remote D1.');
  process.exit(1);
}

const BASE = process.env.BASE || 'http://localhost:4321';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const devVars = readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8');
const passwordMatch = devVars.match(/ADMIN_PASSWORD="?([^"\n]*)"?/);
if (!passwordMatch) {
  console.error('✗ could not read ADMIN_PASSWORD from .dev.vars');
  process.exit(1);
}
const ADMIN_PASSWORD = passwordMatch[1].trim();

function d1Query(sql) {
  const out = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'nctaj-menu', '--local', '--json', '--command', sql],
    { cwd: new URL('..', import.meta.url), encoding: 'utf8' },
  );
  return JSON.parse(out)[0].results;
}

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass, detail });

// locator.count() has proven unreliable against this app in this
// environment right after a synchronous DOM mutation or navigation (see the
// matching note in check-behaviour.mjs) — it can settle on a stale count a
// beat later than document.querySelectorAll, what actually drives
// rendering. Every count here goes through evaluate instead.
const count = (page, sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);

const b = await chromium.launch({ executablePath: EXEC });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
ctx.on('dialog', (d) => d.accept());
const p = await ctx.newPage();

// ---- login ----
await p.goto(`${BASE}/admin/login`, { waitUntil: 'load' });
await p.fill('input[name="password"]', 'definitely-the-wrong-password');
await p.click('button[type="submit"]');
await p.waitForLoadState('load');
check('wrong password stays on login with an error', p.url().endsWith('/admin/login') && (await count(p, '.error')) === 1);

await p.fill('input[name="password"]', ADMIN_PASSWORD);
await p.click('button[type="submit"]');
await p.waitForLoadState('load');
check('correct password reaches /admin', /\/admin\/?$/.test(new URL(p.url()).pathname));

// ---- categories: double-submit guard, then toast ----
await p.goto(`${BASE}/admin/categories`, { waitUntil: 'load' });

const testName = `Test Category ${Date.now()}`;

// Delay the POST so a double-click's race window is guaranteed to land
// inside it — without this, both requests could complete too fast on
// localhost for the race to ever actually occur.
await p.route(`${BASE}/admin/categories`, async (route) => {
  if (route.request().method() === 'POST') {
    await new Promise((r) => setTimeout(r, 800));
  }
  await route.continue();
});

await p.locator('#new-name').fill(testName);
// Three synchronous native clicks in one script, not three separate
// Playwright .click() calls — Playwright serializes its own actions on a
// page behind a pending navigation, which would hide the exact race a real
// impatient double-click produces. Dispatching the DOM clicks directly
// reproduces that race: the first click's submit handler disables the
// button before the event loop yields, so the second and third clicks on
// an already-disabled button dispatch no events at all.
await p.evaluate(() => {
  const form = [...document.querySelectorAll('form')].find((f) => f.querySelector('input[name="_action"][value="create"]'));
  const btn = form.querySelector('button[type="submit"]');
  btn.click();
  btn.click();
  btn.click();
});
await p.waitForLoadState('load');
await p.unroute(`${BASE}/admin/categories`);

const created = d1Query(`SELECT id FROM categories WHERE name = '${testName.replace(/'/g, "''")}'`);
check('a rapid triple-click creates exactly one category, not three', created.length === 1, `found ${created.length}`);

const flashInfo = await p.evaluate((name) => {
  const els = [...document.querySelectorAll('.flash')];
  const el = els[0];
  return {
    count: els.length,
    includesName: el?.textContent?.includes(name) ?? false,
    role: el?.getAttribute('role') ?? null,
    hasCloseBtn: !!el?.querySelector('.flash__close'),
  };
}, testName);
check('toast appears after creating a category', flashInfo.count === 1 && flashInfo.includesName, JSON.stringify(flashInfo));
check('toast is announced to assistive tech', flashInfo.role === 'status');
check('toast has a manual close button', flashInfo.hasCloseBtn);

await p.evaluate(() => document.querySelector('.flash__close')?.click());
await p.waitForTimeout(400); // fade-out animation
check('toast dismisses on manual close', (await count(p, '.flash')) === 0);

// ---- clean up: delete the test category ----
// The name only ever appears inside an <input value>, never as rendered
// text, so this can't be found by hasText — the delete form's own
// data-name attribute is the reliable anchor.
const deleteSel = `form.cat-delete-form[data-name="${testName}"]`;
// waitForLoadState('load') alone proved unreliable here — the extra async
// hop through the confirm()-dialog handler below means it can resolve
// before the delete's own navigation actually lands. Waiting on the
// specific POST response is unambiguous.
await Promise.all([
  p.waitForResponse((res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/admin/categories'),
  // The click's own evaluate() can report "execution context destroyed" if
  // the navigation it triggers wins the race before this call returns —
  // expected here, since waitForResponse above is what actually confirms
  // the delete happened.
  p.evaluate((sel) => document.querySelector(sel)?.querySelector('button[type="submit"]')?.click(), deleteSel).catch(() => {}),
]);
await p.waitForTimeout(200);
check('test category no longer listed after delete', (await count(p, deleteSel)) === 0);

await ctx.close();
await b.close();

let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.pass || !r.detail ? '' : '  — ' + r.detail}`);
  if (!r.pass) failed++;
}
console.log(failed ? `\n${failed} FAILED` : `\nall ${results.length} admin checks passed`);
process.exit(failed ? 1 : 0);
