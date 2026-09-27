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
  const { max } = (await db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) as max FROM items WHERE category_id = ?')
    .bind(input.categoryId)
    .first<{ max: number }>())!;
  await db
    .prepare(
      `INSERT INTO items (id, category_id, name, description, price, veg, photo_key, bestseller, available, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      max + 1,
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
  const { max } = (await db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) as max FROM categories')
    .first<{ max: number }>())!;
  await db
    .prepare('INSERT INTO categories (id, name, blurb, sort_order) VALUES (?, ?, ?, ?)')
    .bind(id, input.name, input.blurb, max + 1)
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

/** Refuses to delete a category that still has items — the caller checks
 * item_count from getCategoriesWithCounts first; this is the last-line guard. */
export async function deleteCategory(db: D1, id: string): Promise<boolean> {
  const { count } = (await db
    .prepare('SELECT COUNT(*) as count FROM items WHERE category_id = ?')
    .bind(id)
    .first<{ count: number }>())!;
  if (count > 0) return false;
  await db.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
  return true;
}
