CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, amount INTEGER NOT NULL,
  created_at INTEGER NOT NULL, checkout TEXT, checked_at INTEGER
);
CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id, checked_at);
CREATE TABLE IF NOT EXISTS payments (
  charge TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL, refunded INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS payments_user ON payments(user_id, refunded, expires_at);
