-- изменено 2026-10-17 01:30
-- Журналы: движения тортов (остаток = сумма) и ящиков за водителями.

-- ---------- Журналы ----------

CREATE TABLE IF NOT EXISTS stock_moves (
  id          INTEGER PRIMARY KEY,
  type        TEXT    NOT NULL CHECK (type IN ('in', 'ship', 'return', 'writeoff', 'adjust')),
  date        TEXT    NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  product_id  INTEGER NOT NULL REFERENCES products(id),
  qty         INTEGER NOT NULL CHECK (qty <> 0),  -- + приход/возврат, − отгрузка/списание
  order_id    INTEGER REFERENCES orders(id),
  sheet_id    INTEGER REFERENCES route_sheets(id),
  note        TEXT,                               -- «Цех», причина списания
  staff_id    INTEGER REFERENCES staff(id),       -- кто провёл
  created_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  CHECK ((type IN ('in', 'return') AND qty > 0) OR (type IN ('ship', 'writeoff') AND qty < 0) OR type = 'adjust')
);
CREATE INDEX IF NOT EXISTS ix_moves_product ON stock_moves(product_id);
CREATE INDEX IF NOT EXISTS ix_moves_date ON stock_moves(date, type);

-- Ящики за водителем: out — выдали (обычно при отгрузке сводной), back — вернул,
-- writeoff — утерял/сломал (долг списан, ящиков в обороте меньше)
CREATE TABLE IF NOT EXISTS tara_moves (
  id          INTEGER PRIMARY KEY,
  date        TEXT    NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  tara_id     INTEGER NOT NULL REFERENCES tara_types(id),
  driver_id   INTEGER NOT NULL REFERENCES staff(id),
  kind        TEXT    NOT NULL CHECK (kind IN ('out', 'back', 'writeoff')),
  qty         INTEGER NOT NULL,                   -- + выдали, − вернул/списан
  sheet_id    INTEGER REFERENCES route_sheets(id),
  point_id    INTEGER REFERENCES points(id),      -- если известно, на какой точке остались
  note        TEXT,
  staff_id    INTEGER REFERENCES staff(id),       -- кто провёл
  created_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  CHECK ((kind = 'out' AND qty > 0) OR (kind IN ('back', 'writeoff') AND qty < 0))
);
CREATE INDEX IF NOT EXISTS ix_tara_driver ON tara_moves(driver_id, tara_id);
CREATE INDEX IF NOT EXISTS ix_tara_sheet ON tara_moves(sheet_id);
