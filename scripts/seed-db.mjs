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

const lines = ['DELETE FROM items;', 'DELETE FROM categories;'];
menu.categories.forEach((c, ci) => {
  lines.push(
    `INSERT INTO categories (id, name, blurb, sort_order) VALUES (${esc(c.id)}, ${esc(c.name)}, ${esc(c.blurb)}, ${ci});`,
  );
  c.items.forEach((item, ii) => {
    const photoKey = item.photo ? `menu/${item.photo}.jpg` : null;
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

console.log(`Seeding D1 (${mode}): ${menu.categories.length} categories, ${lines.length - 3} items...`);
execFileSync('npx', ['wrangler', 'd1', 'execute', 'nctaj-menu', mode, '--file', sqlPath], {
  cwd: ROOT,
  stdio: 'inherit',
});
unlinkSync(sqlPath);

console.log('\nUploading photos to R2...');
let uploaded = 0;
for (const c of menu.categories) {
  for (const item of c.items) {
    if (!item.photo) continue;
    const localPath = path.join(ROOT, 'src/assets/menu', `${item.photo}.jpg`);
    const key = `menu/${item.photo}.jpg`;
    execFileSync(
      'npx',
      ['wrangler', 'r2', 'object', 'put', `nctaj-menu-images/${key}`, '--file', localPath, mode],
      { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] },
    );
    uploaded++;
  }
}
console.log(`Uploaded ${uploaded} photos.`);
console.log('\nDone.');
