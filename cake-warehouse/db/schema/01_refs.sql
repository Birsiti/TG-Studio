-- изменено 2026-10-17 01:30
-- Справочники: категории, товары (с местом на складе), маршруты, заказчики, точки, люди, тара, смены.

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
-- Оборотные ящики числятся за водителем: выдали при отгрузке → вернул →
-- долг = сумма tara_moves по водителю.
--
-- Создать базу:  cat schema/*.sql | sqlite3 cake.db && sqlite3 cake.db < seed.sql
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
  place        INTEGER CHECK (place IS NULL OR place > 0), -- место на складе: № по кругу против часовой стрелки от двери
  shelf_days   INTEGER CHECK (shelf_days IS NULL OR shelf_days > 0),
  min_qty      INTEGER NOT NULL DEFAULT 0 CHECK (min_qty >= 0),
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort         INTEGER NOT NULL DEFAULT 0,
  -- одно название бывает в разных весах (Сникерс 0,4 и 0,8 кг)
  UNIQUE (category_id, name, weight_g)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_products_sku ON products(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_products_place ON products(place);

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
  name   TEXT    NOT NULL UNIQUE,                -- Ящик (если ящики разных сетей — отдельные виды)
  total  INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0)  -- всего в обороте
);

CREATE TABLE IF NOT EXISTS shifts (
  date      TEXT    NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  staff_id  INTEGER NOT NULL REFERENCES staff(id),
  PRIMARY KEY (date, staff_id)
);
