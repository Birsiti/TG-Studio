-- изменено 2026-10-16 22:00
-- ============================================================
-- ТОРТОВОЗ — база склада тортов (SQLite 3.35+, файл на iMac).
--
-- Процесс по заявкам клиента (фото накладных от 17.10.2026):
--   заказчик (сеть) → точка разгрузки (адрес, маршрут, время доставки)
--   → заявка на дату (строки: товар, кол-во, грузовых мест, бонус)
--   → сводная заявка маршрута на дату = лист сборки
--     («Сборку осуществил (ФИО)», «Количество ящиков», «Количество стопок»)
--   → отгрузка водителю → развоз по точкам → возвраты и тара.
--
-- Остаток не хранится полем, а считается суммой журнала stock_moves
-- (qty со знаком) — так учёт нельзя «тихо» поправить задним числом.
-- Долг тары по точкам — так же, суммой tara_moves.
--
-- Создать базу:  sqlite3 cake.db < schema.sql && sqlite3 cake.db < seed.sql
-- ============================================================

PRAGMA foreign_keys = ON;

-- ---------- Справочники ----------

CREATE TABLE IF NOT EXISTS categories (
  id    INTEGER PRIMARY KEY,
  name  TEXT    NOT NULL UNIQUE,                 -- Торт, Венский десерт, Пирожное…
  sort  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id           INTEGER PRIMARY KEY,
  category_id  INTEGER NOT NULL REFERENCES categories(id),
  name         TEXT    NOT NULL,                 -- «Съешь меня карамельный»
  weight_g     INTEGER NOT NULL CHECK (weight_g > 0),  -- вес единицы
  is_weighted  INTEGER NOT NULL DEFAULT 0 CHECK (is_weighted IN (0, 1)), -- «Весовой» в заявке
  sku          TEXT,                             -- артикул (заполнит клиент)
  shelf_days   INTEGER CHECK (shelf_days IS NULL OR shelf_days > 0),
  min_qty      INTEGER NOT NULL DEFAULT 0 CHECK (min_qty >= 0),
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort         INTEGER NOT NULL DEFAULT 0,
  -- одно название бывает в разных весах (Сникерс 0,4 и 0,8 кг)
  UNIQUE (category_id, name, weight_g)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_products_sku ON products(sku) WHERE sku IS NOT NULL;

CREATE TABLE IF NOT EXISTS routes (
  id      INTEGER PRIMARY KEY,
  name    TEXT    NOT NULL UNIQUE,               -- «Маршрут 2»
  active  INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS customers (
  id     INTEGER PRIMARY KEY,
  name   TEXT    NOT NULL UNIQUE,                -- «Санта Ритейл», «Белвиллесден ИУП»
  unp    TEXT,                                   -- УНП (если понадобится для накладных)
  phone  TEXT,
  note   TEXT
);

-- Точка разгрузки: магазин заказчика по адресу, закреплён за маршрутом
CREATE TABLE IF NOT EXISTS points (
  id             INTEGER PRIMARY KEY,
  customer_id    INTEGER NOT NULL REFERENCES customers(id),
  route_id       INTEGER REFERENCES routes(id),  -- маршрут по умолчанию
  store_code     TEXT,                           -- номер магазина сети (Доброном 3104)
  address        TEXT    NOT NULL,
  delivery_from  TEXT CHECK (delivery_from IS NULL OR delivery_from GLOB '[0-2][0-9]:[0-5][0-9]'),
  delivery_to    TEXT CHECK (delivery_to   IS NULL OR delivery_to   GLOB '[0-2][0-9]:[0-5][0-9]'),
  route_order    INTEGER,                        -- порядок объезда на маршруте
  note           TEXT,
  active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  UNIQUE (customer_id, address)
);
CREATE INDEX IF NOT EXISTS ix_points_route ON points(route_id, route_order);

CREATE TABLE IF NOT EXISTS staff (
  id      INTEGER PRIMARY KEY,
  name    TEXT    NOT NULL,
  role    TEXT    NOT NULL CHECK (role IN ('admin', 'storekeeper', 'picker', 'driver')),
  phone   TEXT CHECK (phone IS NULL OR phone GLOB '+375[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
  tg_id   TEXT UNIQUE,                           -- вход в Mini App и уведомления бота
  car     TEXT,                                  -- водителю: машина и номер
  active  INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS tara_types (
  id     INTEGER PRIMARY KEY,
  name   TEXT    NOT NULL UNIQUE,                -- Ящик, Стопка
  total  INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0)  -- всего в обороте
);

CREATE TABLE IF NOT EXISTS shifts (
  date      TEXT    NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  staff_id  INTEGER NOT NULL REFERENCES staff(id),
  PRIMARY KEY (date, staff_id)
);

-- ---------- Сводная заявка маршрута = лист сборки и рейс ----------

CREATE TABLE IF NOT EXISTS route_sheets (
  id           INTEGER PRIMARY KEY,
  route_id     INTEGER NOT NULL REFERENCES routes(id),
  date         TEXT    NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  status       TEXT    NOT NULL DEFAULT 'picking'
               CHECK (status IN ('picking', 'picked', 'shipped', 'closed', 'cancelled')),
  picker_id    INTEGER REFERENCES staff(id),     -- «Сборку осуществил (ФИО)»
  picker_name  TEXT,                             -- если сборщик не в справочнике
  boxes        INTEGER CHECK (boxes  IS NULL OR boxes  >= 0),  -- «Количество ящиков»
  stacks       INTEGER CHECK (stacks IS NULL OR stacks >= 0),  -- «Количество стопок»
  driver_id    INTEGER REFERENCES staff(id),
  created_at   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  picked_at    TEXT,
  shipped_at   TEXT,
  closed_at    TEXT,
  UNIQUE (route_id, date)
);

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

CREATE TABLE IF NOT EXISTS tara_moves (
  id          INTEGER PRIMARY KEY,
  date        TEXT    NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  tara_id     INTEGER NOT NULL REFERENCES tara_types(id),
  point_id    INTEGER NOT NULL REFERENCES points(id),
  qty         INTEGER NOT NULL CHECK (qty <> 0),  -- + оставили на точке, − забрали
  sheet_id    INTEGER REFERENCES route_sheets(id),
  note        TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS ix_tara_point ON tara_moves(point_id, tara_id);

-- Журнал нельзя править задним числом: только новые записи
CREATE TRIGGER IF NOT EXISTS trg_stock_moves_no_update BEFORE UPDATE ON stock_moves
BEGIN SELECT RAISE(ABORT, 'Журнал движений не редактируется — сделайте корректировку (adjust)'); END;
CREATE TRIGGER IF NOT EXISTS trg_stock_moves_no_delete BEFORE DELETE ON stock_moves
BEGIN SELECT RAISE(ABORT, 'Журнал движений не удаляется — сделайте корректировку (adjust)'); END;
CREATE TRIGGER IF NOT EXISTS trg_tara_moves_no_update BEFORE UPDATE ON tara_moves
BEGIN SELECT RAISE(ABORT, 'Журнал тары не редактируется'); END;
CREATE TRIGGER IF NOT EXISTS trg_tara_moves_no_delete BEFORE DELETE ON tara_moves
BEGIN SELECT RAISE(ABORT, 'Журнал тары не удаляется'); END;

-- Заявку в сводную можно положить только своего маршрута и своей даты
CREATE TRIGGER IF NOT EXISTS trg_orders_sheet_match BEFORE UPDATE OF sheet_id ON orders
WHEN NEW.sheet_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM route_sheets s WHERE s.id = NEW.sheet_id AND s.route_id = NEW.route_id AND s.date = NEW.date)
BEGIN SELECT RAISE(ABORT, 'Сводная другого маршрута или даты'); END;

-- ---------- Представления ----------

-- Остаток по товарам
CREATE VIEW IF NOT EXISTS v_stock AS
SELECT p.id AS product_id, c.name AS category, p.name, p.weight_g,
       COALESCE(SUM(m.qty), 0) AS qty, p.min_qty,
       COALESCE(SUM(m.qty), 0) < p.min_qty AS is_low
FROM products p
JOIN categories c ON c.id = p.category_id
LEFT JOIN stock_moves m ON m.product_id = p.id
GROUP BY p.id;

-- Итоги заявки — как строка «Итого» в накладной
CREATE VIEW IF NOT EXISTS v_order_totals AS
SELECT o.id AS order_id, o.number, o.date, r.name AS route, cu.name AS customer, pt.address,
       SUM(CASE WHEN l.is_bonus = 0 THEN l.qty ELSE 0 END) AS qty,
       SUM(l.places) AS places,
       ROUND(SUM(l.qty * p.weight_g) / 1000.0, 3) AS weight_kg
FROM orders o
JOIN routes r ON r.id = o.route_id
JOIN points pt ON pt.id = o.point_id
JOIN customers cu ON cu.id = pt.customer_id
JOIN order_lines l ON l.order_id = o.id
JOIN products p ON p.id = l.product_id
GROUP BY o.id;

-- Сводная заявка за период по маршруту — лист сборки (товар, кол-во, общий вес)
CREATE VIEW IF NOT EXISTS v_route_summary AS
SELECT o.date, r.name AS route, c.sort AS cat_sort, c.name AS category, p.id AS product_id, p.name, p.weight_g,
       SUM(l.qty) AS qty, SUM(l.places) AS places,
       ROUND(SUM(l.qty * p.weight_g) / 1000.0, 3) AS weight_kg,
       COUNT(DISTINCT o.id) AS orders
FROM orders o
JOIN routes r ON r.id = o.route_id
JOIN order_lines l ON l.order_id = o.id
JOIN products p ON p.id = l.product_id
JOIN categories c ON c.id = p.category_id
WHERE o.status <> 'cancelled'
GROUP BY o.date, r.id, p.id;

-- Хватает ли остатка на сводную
CREATE VIEW IF NOT EXISTS v_route_shortage AS
SELECT s.date, s.route, s.name, s.weight_g, s.qty AS need, st.qty AS have, s.qty - st.qty AS short
FROM v_route_summary s
JOIN v_stock st ON st.product_id = s.product_id
WHERE s.qty > st.qty;

-- Долг тары по точкам
CREATE VIEW IF NOT EXISTS v_tara_debt AS
SELECT pt.id AS point_id, cu.name AS customer, pt.address, r.name AS route, t.name AS tara, SUM(m.qty) AS qty
FROM tara_moves m
JOIN points pt ON pt.id = m.point_id
JOIN customers cu ON cu.id = pt.customer_id
LEFT JOIN routes r ON r.id = pt.route_id
JOIN tara_types t ON t.id = m.tara_id
GROUP BY pt.id, t.id
HAVING SUM(m.qty) <> 0;

-- Тара на складе = всего в обороте − на точках
CREATE VIEW IF NOT EXISTS v_tara_stock AS
SELECT t.id AS tara_id, t.name, t.total, COALESCE(SUM(m.qty), 0) AS at_points,
       t.total - COALESCE(SUM(m.qty), 0) AS in_stock
FROM tara_types t
LEFT JOIN tara_moves m ON m.tara_id = t.id
GROUP BY t.id;
