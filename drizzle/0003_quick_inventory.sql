CREATE TABLE IF NOT EXISTS quick_inventory_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  item_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS quick_inventory_items_tenant_idx
  ON quick_inventory_items (tenant_id, created_at);
