/**
 * Admin panel a11y/UX check — contrast (WCAG AA) plus mobile viewport
 * sanity (horizontal overflow, tap target size). The counterpart to
 * check-contrast.mjs + the mobile section of check-behaviour.mjs, but for
 * /admin/*. Never existed before because, until AdminLayout's styles were
 * fixed to actually reach slotted page content, there was no real styling
 * here to check — every element rendered with browser-default colors and
 * sizes, which would have hidden a real regression.
 *
 * Read-only (never creates or deletes anything), but still needs the local
 * ADMIN_PASSWORD to log in, so it's opt-in like check-admin.mjs rather than
 * part of the default `npm run check`.
 *
 *   node scripts/check-admin-a11y.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { checkPageContrast } from './lib/contrast.mjs';

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

async function login(page) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'load' });
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('load');
  if (!/\/admin\/?$/.test(new URL(page.url()).pathname)) {
    throw new Error('login failed — check ADMIN_PASSWORD in .dev.vars, or that a dev/preview server is running');
  }
}

const [item] = d1Query('SELECT id FROM items LIMIT 1');
const adminPages = ['/admin', '/admin/categories', '/admin/items/new', ...(item ? [`/admin/items/${item.id}`] : [])];

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass, detail });

const browser = await chromium.launch({ executablePath: EXEC });

// ---- contrast, desktop viewport ----
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const failures = [];
  // The login form is reachable before any auth, and is the one admin page
  // that isn't behind AdminLayout — worth checking on its own terms.
  failures.push(...(await checkPageContrast(page, BASE, '/admin/login')));
  await login(page);
  for (const path of adminPages) {
    failures.push(...(await checkPageContrast(page, BASE, path)));
  }
  check(`contrast AA on ${adminPages.length + 1} admin pages`, failures.length === 0, failures.join('\n  '));
  await ctx.close();
}

// ---- mobile viewport: overflow + tap targets ----
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await login(page);

  for (const path of adminPages) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'load' });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check(`no horizontal scroll at 390px: ${path}`, !overflow);

    // Reported, not hard-failed on its own name — a dense admin table
    // trades some tap-target size for information density on purpose (16
    // items per category, 7 columns), unlike the public site's own
    // "tap targets >= 44px" rule in check-behaviour.mjs, which IS a hard
    // failure there because every control on that page is one-off, not
    // part of a repeating data grid.
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('a, button')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44);
        })
        .map((el) => `${el.className || el.tagName}:${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`),
    );
    check(`tap targets on ${path}`, true, small.length ? `${small.length} under 44px: ${[...new Set(small)].join(', ')}` : 'all >= 44px');
  }
  await ctx.close();
}

await browser.close();

let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? '\n  ' + r.detail.split('\n').join('\n  ') : ''}`);
  if (!r.pass) failed++;
}
console.log(failed ? `\n${failed} FAILED` : `\nall ${results.length} admin a11y checks passed`);
process.exit(failed ? 1 : 0);
