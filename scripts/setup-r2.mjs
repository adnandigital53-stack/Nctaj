/**
 * Uploads the starter menu photos to the real R2 bucket and links each one to
 * its item — but only for items that have no photo yet. Unlike seed-db.mjs it
 * never deletes or rewrites menu rows, so prices, names and photos edited in
 * /admin survive. Safe to re-run.
 *
 *   node scripts/setup-r2.mjs        (needs CLOUDFLARE_API_TOKEN)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const menu = JSON.parse(readFileSync(path.join(ROOT, 'src/data/menu.json'), 'utf8'));
const esc = (v) => `'${String(v).replace(/'/g, "''")}'`;

const updates = [];
let failed = 0;
for (const c of menu.categories) {
  for (const item of c.items) {
    if (!item.photo) continue;
    const key = `menu/${item.photo}.jpg`;
    try {
      execFileSync(
        'npx',
        ['wrangler', 'r2', 'object', 'put', `nctaj-menu-images/${key}`, '--file', path.join(ROOT, 'src/assets/menu', `${item.photo}.jpg`), '--remote'],
        { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] },
      );
      updates.push(`UPDATE items SET photo_key = ${esc(key)} WHERE id = ${esc(item.id)} AND photo_key IS NULL;`);
    } catch (err) {
      failed++;
      console.warn(`  failed ${key}: ${err.message.split('\n')[0]}`);
    }
  }
}
console.log(`Uploaded ${updates.length} photos${failed ? `, ${failed} failed` : ''}.`);
if (failed) process.exitCode = 1;
if (!updates.length) process.exit();

const sqlPath = path.join(ROOT, '.setup-r2.sql');
writeFileSync(sqlPath, updates.join('\n') + '\n');
execFileSync('npx', ['wrangler', 'd1', 'execute', 'nctaj-menu', '--remote', '--file', sqlPath], { cwd: ROOT, stdio: 'inherit' });
unlinkSync(sqlPath);
execFileSync(
  'npx',
  ['wrangler', 'd1', 'execute', 'nctaj-menu', '--remote', '--command',
    'SELECT COUNT(*) AS items, SUM(photo_key IS NOT NULL) AS with_photo FROM items'],
  { cwd: ROOT, stdio: 'inherit' },
);
