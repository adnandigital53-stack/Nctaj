-- Web Push subscriptions from visitors who ticked the "notify me" checkbox
-- (src/components/Footer.astro). One row per browser subscription — a
-- visitor on two devices gets two rows, which is correct: each device has
-- its own encryption keys and needs its own push sent to it.

CREATE TABLE push_subscriptions (
  endpoint   TEXT PRIMARY KEY,  -- the push service URL, unique per subscription
  p256dh     TEXT NOT NULL,     -- subscriber's public key, for payload encryption (RFC 8291)
  auth       TEXT NOT NULL,     -- subscriber's auth secret, same purpose
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
