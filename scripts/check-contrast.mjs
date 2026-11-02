/**
 * Renders every page and asserts that text actually meets WCAG AA once the
 * cascade has had its say. Catches specificity accidents that a static read
 * of the stylesheet misses (e.g. a nav rule repainting a CTA label).
 *
 *   node scripts/check-contrast.mjs            # against astro preview
 *   BASE=http://localhost:4321 node scripts/...
 */
import { chromium } from 'playwright';
import { checkPageContrast } from './lib/contrast.mjs';

const BASE = process.env.BASE || 'http://localhost:4321';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PAGES = ['/', '/menu', '/order', '/about', '/contact'];

const browser = await chromium.launch({ executablePath: EXEC });
const page = await browser.newPage();
const failures = [];

for (const path of PAGES) {
  failures.push(...(await checkPageContrast(page, BASE, path)));
}

await browser.close();

if (failures.length) {
  console.error(`✗ ${failures.length} contrast failure(s):\n` + failures.map((f) => '  ' + f).join('\n'));
  process.exit(1);
}
console.log(`✓ contrast AA passes on ${PAGES.length} pages`);
