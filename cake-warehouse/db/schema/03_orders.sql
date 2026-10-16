-- изменено 2026-10-17 01:30
-- Заявки клиента, их строки и возвраты с точек.

-- ---------- Заявки ----------

CREATE TABLE IF NOT EXISTS orders (
  id          INTEGER PRIMARY KEY,
  number      TEXT    NOT NULL UNIQUE,           -- номер заявки клиента: 1103561
  date        TEXT    NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  point_id    INTEGER NOT NULL REFERENCES points(id),
  route_id    INTEGER NOT NULL REFERENCES routes(id),  -- маршрут в этой заявке (может отличаться от точки)
  sheet_id    INTEGER REFERENCES route_sheets(id),     -- в какую сводную попала
  comment     TEXT,                              -- «Доставка в 14:20», «Грильяжный — 2 бонуса»
  status      TEXT    NOT NULL DEFAULT 'new'
              CHECK (status IN ('new', 'picked', 'shipped', 'delivered', 'closed', 'cancelled')),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS ix_orders_route_date ON orders(route_id, date);
CREATE INDEX IF NOT EXISTS ix_orders_sheet ON orders(sheet_id);

CREATE TABLE IF NOT EXISTS order_lines (
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  line_no     INTEGER NOT NULL,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  qty         INTEGER NOT NULL CHECK (qty > 0),  -- «Кол-во», штук
  places      INTEGER NOT NULL CHECK (places > 0), -- «Кол-во груз. мест» (эклеры 75 г: 40 шт = 4 места)
  is_bonus    INTEGER NOT NULL DEFAULT 0 CHECK (is_bonus IN (0, 1)), -- «Бонус» — без оплаты
  picked_qty  INTEGER CHECK (picked_qty IS NULL OR picked_qty >= 0), -- собрано по факту
  PRIMARY KEY (order_id, line_no)
);
CREATE INDEX IF NOT EXISTS ix_order_lines_product ON order_lines(product_id);

-- Что вернулось с точки: годное → обратно на остаток, брак → только фиксируется
CREATE TABLE IF NOT EXISTS order_returns (
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  back        INTEGER NOT NULL DEFAULT 0 CHECK (back >= 0),
  spoiled     INTEGER NOT NULL DEFAULT 0 CHECK (spoiled >= 0),
  reason      TEXT,
  PRIMARY KEY (order_id, product_id)
);
