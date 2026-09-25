-- Categories and items backing /menu and /admin. Replaces src/data/menu.json
-- as the source of truth once seeded — see scripts/seed-db.mjs.

CREATE TABLE categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  blurb      TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL
);

CREATE TABLE items (
  id          TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price       INTEGER,               -- rupees, whole number; NULL -> "Price TBC"
  veg         INTEGER NOT NULL,       -- 0 or 1
  photo_key   TEXT,                   -- R2 object key (menu/<id>-<ts>.jpg), or NULL
  bestseller  INTEGER NOT NULL DEFAULT 0,
  available   INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_items_category ON items(category_id);

-- Single-row key/value store for site-wide toggles the admin can flip
-- (currently just the "placeholder"/"live" banner state).
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES ('menu_status', 'placeholder');
