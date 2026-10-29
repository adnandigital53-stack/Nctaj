-- One row per push campaign sent from /admin/notifications, so the admin can
-- see what already went out. Not a delivery receipt per subscriber — just the
-- campaign and its aggregate outcome.

CREATE TABLE sent_notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  url        TEXT NOT NULL,
  sent       INTEGER NOT NULL,  -- subscribers the push service accepted
  total      INTEGER NOT NULL,  -- subscribers attempted
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
