// Data access for the menu, backed by D1. Replaces the old static import of
// src/data/menu.json — every page that shows the menu now reads it live, so
// an admin edit shows up on the next page load with no rebuild.
//
// Shape matches what MenuItem.astro / PhotoSlot.astro already expect, so the
// components themselves needed no changes — only their data source did.

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number | null;
  veg: boolean;
  photo: string | null; // -> served at /uploads/menu/<photo>.jpg, see [...key].ts
  available: boolean;
  tags: string[];
}

export interface MenuCategory {
  id: string;
  name: string;
  blurb: string;
  items: MenuItem[];
}

export interface Menu {
  status: 'placeholder' | 'live';
  categories: MenuCategory[];
}

type D1 = App.Locals['runtime']['env']['DB'];

interface ItemRow {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: number | null;
  veg: number;
  photo_key: string | null;
  bestseller: number;
  available: number;
  sort_order: number;
  updated_at: string;
}

interface CategoryRow {
  id: string;
  name: string;
  blurb: string;
  sort_order: number;
}

const photoIdFromKey = (key: string | null) =>
  key ? key.replace(/^menu\//, '').replace(/\.[a-z0-9]+$/i, '') : null;

/** Just the banner state — cheap enough for every page to call via Base.astro. */
export async function getMenuStatus(db: D1): Promise<'placeholder' | 'live'> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'menu_status'").first<{ value: string }>();
  return (row?.value as 'placeholder' | 'live') ?? 'placeholder';
}

/**
 * Real min/max of priced, available items — for the JSON-LD Restaurant's
 * priceRange, so it tracks whatever's actually on the menu instead of
 * drifting from a string someone typed in once. A single indexed aggregate,
 * cheap enough for every page to call alongside getMenuStatus above.
 */
export async function getPriceRange(db: D1): Promise<{ min: number; max: number } | null> {
  const row = await db
    .prepare('SELECT MIN(price) as min, MAX(price) as max FROM items WHERE available = 1 AND price IS NOT NULL')
    .first<{ min: number | null; max: number | null }>();
  if (!row || row.min == null || row.max == null) return null;
  return { min: row.min, max: row.max };
}

/**
 * Same as getMenu, but never throws — a transient D1 hiccup shouldn't crash
 * every page that shows the menu with a raw 500. Callers check `error` and
 * degrade appropriately (the homepage's dish ribbon just goes quiet with an
 * empty list; /menu itself needs to show something explicit instead of a
 * silently empty grid).
 */
export async function getMenuSafe(db: D1): Promise<{ menu: Menu; error: boolean }> {
  try {
    return { menu: await getMenu(db), error: false };
  } catch {
    return { menu: { status: 'live', categories: [] }, error: true };
  }
}

/** Everything the public site needs: categories with their available-first ordering intact. */
export async function getMenu(db: D1): Promise<Menu> {
  const [{ results: cats }, { results: items }, status] = await Promise.all([
    db.prepare('SELECT id, name, blurb, sort_order FROM categories ORDER BY sort_order').all<CategoryRow>(),
    db
      .prepare('SELECT * FROM items ORDER BY category_id, sort_order')
      .all<ItemRow>(),
    db.prepare("SELECT value FROM settings WHERE key = 'menu_status'").first<{ value: string }>(),
  ]);

  const byCategory = new Map<string, MenuItem[]>();
  for (const row of items) {
    const list = byCategory.get(row.category_id) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      description: row.description,
      price: row.price,
      veg: !!row.veg,
      photo: photoIdFromKey(row.photo_key),
      available: !!row.available,
      tags: row.bestseller ? ['bestseller'] : [],
    });
    byCategory.set(row.category_id, list);
  }

  return {
    status: (status?.value as 'placeholder' | 'live') ?? 'placeholder',
    categories: cats.map((c) => ({
      id: c.id,
      name: c.name,
      blurb: c.blurb,
      items: byCategory.get(c.id) ?? [],
    })),
  };
}

/** Every item, including unavailable ones — what the admin list needs. */
export async function getAllItemsForAdmin(db: D1) {
  const { results } = await db
    .prepare(
      `SELECT i.*, c.name as category_name
       FROM items i JOIN categories c ON c.id = i.category_id
       ORDER BY c.sort_order, i.sort_order`,
    )
    .all<ItemRow & { category_name: string }>();
  return results;
}

export async function getCategories(db: D1) {
  const { results } = await db
    .prepare('SELECT id, name, blurb, sort_order FROM categories ORDER BY sort_order')
    .all<CategoryRow>();
  return results;
}

export async function getItem(db: D1, id: string) {
  return db.prepare('SELECT * FROM items WHERE id = ?').bind(id).first<ItemRow>();
}

export interface ItemInput {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number | null;
  veg: boolean;
  bestseller: boolean;
  available: boolean;
}

export async function createItem(db: D1, input: ItemInput, photoKey: string | null) {
  // sort_order comes from a subquery in the same statement, not a prior
  // SELECT — two admins (or two tabs) adding to the same category at once
  // can't both read the same MAX and land on the same sort_order.
  await db
    .prepare(
      `INSERT INTO items (id, category_id, name, description, price, veg, photo_key, bestseller, available, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM items WHERE category_id = ?))`,
    )
    .bind(
      input.id,
      input.categoryId,
      input.name,
      input.description,
      input.price,
      input.veg ? 1 : 0,
      photoKey,
      input.bestseller ? 1 : 0,
      input.available ? 1 : 0,
      input.categoryId,
    )
    .run();
}

export async function updateItem(db: D1, id: string, input: ItemInput, photoKey: string | null | undefined) {
  const setPhoto = photoKey !== undefined;
  await db
    .prepare(
      `UPDATE items SET category_id=?, name=?, description=?, price=?, veg=?, bestseller=?, available=?,
       updated_at=datetime('now') ${setPhoto ? ', photo_key=?' : ''} WHERE id=?`,
    )
    .bind(
      ...(setPhoto
        ? [
            input.categoryId, input.name, input.description, input.price, input.veg ? 1 : 0,
            input.bestseller ? 1 : 0, input.available ? 1 : 0, photoKey, id,
          ]
        : [
            input.categoryId, input.name, input.description, input.price, input.veg ? 1 : 0,
            input.bestseller ? 1 : 0, input.available ? 1 : 0, id,
          ]),
    )
    .run();
}

export async function deleteItem(db: D1, id: string) {
  await db.prepare('DELETE FROM items WHERE id = ?').bind(id).run();
}

/** Swaps sort_order with the adjacent item in the same category — a no-op at either edge. */
export async function moveItem(db: D1, id: string, direction: 'up' | 'down'): Promise<void> {
  const item = await db
    .prepare('SELECT category_id, sort_order FROM items WHERE id = ?')
    .bind(id)
    .first<{ category_id: string; sort_order: number }>();
  if (!item) return;

  const cmp = direction === 'up' ? '<' : '>';
  const order = direction === 'up' ? 'DESC' : 'ASC';
  const neighbor = await db
    .prepare(`SELECT id, sort_order FROM items WHERE category_id = ? AND sort_order ${cmp} ? ORDER BY sort_order ${order} LIMIT 1`)
    .bind(item.category_id, item.sort_order)
    .first<{ id: string; sort_order: number }>();
  if (!neighbor) return;

  // batch(), not two sequential .run()s — a double-click firing this twice
  // in short succession must not interleave with itself and leave both rows
  // on the same sort_order.
  await db.batch([
    db.prepare('UPDATE items SET sort_order = ? WHERE id = ?').bind(neighbor.sort_order, id),
    db.prepare('UPDATE items SET sort_order = ? WHERE id = ?').bind(item.sort_order, neighbor.id),
  ]);
}

export async function setMenuStatus(db: D1, status: 'placeholder' | 'live') {
  await db
    .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('menu_status', ?)")
    .bind(status)
    .run();
}

/** id derived from a name, uniqued against existing ids by appending -2, -3, ... */
export async function slugifyUnique(db: D1, name: string): Promise<string> {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
  let candidate = base;
  let n = 2;
  while (await db.prepare('SELECT 1 FROM items WHERE id = ?').bind(candidate).first()) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

/** Same slugging as slugifyUnique, checked against categories instead of items. */
export async function slugifyUniqueCategory(db: D1, name: string): Promise<string> {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'category';
  let candidate = base;
  let n = 2;
  while (await db.prepare('SELECT 1 FROM categories WHERE id = ?').bind(candidate).first()) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

export async function createCategory(db: D1, input: { name: string; blurb: string }): Promise<string> {
  const id = await slugifyUniqueCategory(db, input.name);
  // sort_order via subquery, same reasoning as createItem above.
  await db
    .prepare(
      'INSERT INTO categories (id, name, blurb, sort_order) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM categories))',
    )
    .bind(id, input.name, input.blurb)
    .run();
  return id;
}

export async function updateCategory(db: D1, id: string, input: { name: string; blurb: string }) {
  await db.prepare('UPDATE categories SET name = ?, blurb = ? WHERE id = ?').bind(input.name, input.blurb, id).run();
}

/** Categories with a live item count, for the admin list (and to gate deletion). */
export async function getCategoriesWithCounts(db: D1) {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.name, c.blurb, c.sort_order, COUNT(i.id) as item_count
       FROM categories c LEFT JOIN items i ON i.category_id = c.id
       GROUP BY c.id ORDER BY c.sort_order`,
    )
    .all<CategoryRow & { item_count: number }>();
  return results;
}

/** Swaps sort_order with the adjacent category — a no-op at either edge. */
export async function moveCategory(db: D1, id: string, direction: 'up' | 'down'): Promise<void> {
  const cat = await db.prepare('SELECT sort_order FROM categories WHERE id = ?').bind(id).first<{ sort_order: number }>();
  if (!cat) return;

  const cmp = direction === 'up' ? '<' : '>';
  const order = direction === 'up' ? 'DESC' : 'ASC';
  const neighbor = await db
    .prepare(`SELECT id, sort_order FROM categories WHERE sort_order ${cmp} ? ORDER BY sort_order ${order} LIMIT 1`)
    .bind(cat.sort_order)
    .first<{ id: string; sort_order: number }>();
  if (!neighbor) return;

  await db.batch([
    db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?').bind(neighbor.sort_order, id),
    db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?').bind(cat.sort_order, neighbor.id),
  ]);
}

/** Refuses to delete a category that still has items — the caller checks
 * item_count from getCategoriesWithCounts first; this is the last-line guard.
 * The has-items check and the delete are one statement, not a SELECT
 * followed by a DELETE, so an item created in between (another tab, or a
 * request that raced this one) can't slip through and get orphaned. */
export async function deleteCategory(db: D1, id: string): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM categories WHERE id = ? AND NOT EXISTS (SELECT 1 FROM items WHERE category_id = ?)')
    .bind(id, id)
    .run();
  return result.meta.changes > 0;
}
