-- plan §3
CREATE TABLE technologies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  min_wall_mm REAL NOT NULL
);

CREATE TABLE materials (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  technology_id TEXT NOT NULL REFERENCES technologies(id),
  price_per_cm3 REAL NOT NULL, -- USD
  colors TEXT NOT NULL DEFAULT '[]', -- JSON array of color names
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE executors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  technology_ids TEXT NOT NULL DEFAULT '[]', -- JSON array
  build_x_mm REAL NOT NULL,
  build_y_mm REAL NOT NULL,
  build_z_mm REAL NOT NULL,
  lead_days_min INTEGER NOT NULL,
  lead_days_max INTEGER NOT NULL,
  pickup_address TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL -- JSON
);

CREATE TABLE models (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  units TEXT NOT NULL CHECK (units IN ('mm', 'in')),
  bbox TEXT, -- JSON [x, y, z] in mm
  volume_cm3 REAL,
  email TEXT,
  expires_at TEXT NOT NULL
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  public_no TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  address TEXT, -- JSON
  shipping_cents INTEGER,
  tax_cents INTEGER,
  total_cents INTEGER,
  status TEXT NOT NULL,
  tracking_no TEXT,
  stripe_session_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  model_id TEXT NOT NULL REFERENCES models(id),
  material_id TEXT NOT NULL REFERENCES materials(id),
  color TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL
);

CREATE TABLE status_history (
  order_id INTEGER NOT NULL REFERENCES orders(id),
  status TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  note TEXT
);

CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_models_expires ON models(expires_at);
CREATE INDEX idx_status_history_order ON status_history(order_id);
