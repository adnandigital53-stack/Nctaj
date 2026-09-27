/**
 * One-time seed: loads src/data/menu.json into D1 and uploads every item's
 * photo to R2, using the exact category/item shape the site shipped with
 * before the backend existed. Safe to re-run — it wipes and reinserts.
 *
 * Local (no Cloudflare account needed):
 *   node scripts/seed-db.mjs --local
 *
 * Production (needs a real database_id/bucket_name in wrangler.jsonc and
 * `wrangler login` or CLOUDFLARE_API_TOKEN):
 *   node scripts/seed-db.mjs --remote
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mode = process.argv.includes('--remote') ? '--remote' : '--local';

const menu = JSON.parse(readFileSync(path.join(ROOT, 'src/data/menu.json'), 'utf8'));

const esc = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const bool = (v) => (v ? 1 : 0);

// Uploads happen before the D1 insert, not after: if a photo fails to
// upload (e.g. R2 isn't enabled on the account yet), the item's row must
// not get a photo_key pointing at an object that doesn't exist — that
// renders as a broken image, worse than the site's own "Photo pending"
// placeholder for a genuinely absent photo.
console.log('Uploading photos to R2...');
let uploaded = 0;
let failed = 0;
const uploadedKeys = new Set();
for (const c of menu.categories) {
  for (const item of c.items) {
    if (!item.photo) continue;
    const localPath = path.join(ROOT, 'src/assets/menu', `${item.photo}.jpg`);
    const key = `menu/${item.photo}.jpg`;
    try {
      execFileSync(
        'npx',
        ['wrangler', 'r2', 'object', 'put', `nctaj-menu-images/${key}`, '--file', localPath, mode],
        { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] },
      );
      uploadedKeys.add(item.photo);
      uploaded++;
    } catch (err) {
      failed++;
      console.warn(`  skipped ${key}: ${err.message.split('\n')[0]}`);
    }
  }
}
console.log(`Uploaded ${uploaded} photos${failed ? `, ${failed} skipped (bucket not ready yet — items will show 'Photo pending' until re-seeded)` : ''}.`);

const lines = ['DELETE FROM items;', 'DELETE FROM categories;'];
menu.categories.forEach((c, ci) => {
  lines.push(
    `INSERT INTO categories (id, name, blurb, sort_order) VALUES (${esc(c.id)}, ${esc(c.name)}, ${esc(c.blurb)}, ${ci});`,
  );
  c.items.forEach((item, ii) => {
    const photoKey = item.photo && uploadedKeys.has(item.photo) ? `menu/${item.photo}.jpg` : null;
    lines.push(
      `INSERT INTO items (id, category_id, name, description, price, veg, photo_key, bestseller, available, sort_order) VALUES ` +
        `(${esc(item.id)}, ${esc(c.id)}, ${esc(item.name)}, ${esc(item.description || '')}, ${item.price ?? 'NULL'}, ` +
        `${bool(item.veg)}, ${esc(photoKey)}, ${bool(item.tags?.includes('bestseller'))}, ${bool(item.available)}, ${ii});`,
    );
  });
});
lines.push(`INSERT OR REPLACE INTO settings (key, value) VALUES ('menu_status', '${menu.status}');`);

const sqlPath = path.join(ROOT, '.seed.sql');
writeFileSync(sqlPath, lines.join('\n') + '\n');

console.log(`\nSeeding D1 (${mode}): ${menu.categories.length} categories, ${lines.length - 3} items...`);
execFileSync('npx', ['wrangler', 'd1', 'execute', 'nctaj-menu', mode, '--file', sqlPath], {
  cwd: ROOT,
  stdio: 'inherit',
});
unlinkSync(sqlPath);

console.log('\nDone.');
