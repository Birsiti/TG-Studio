# изменено 2026-10-17 08:50
"""Схема базы склада (SQLite) и общие константы."""

SCHEMA = """
CREATE TABLE IF NOT EXISTS products(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, cat TEXT NOT NULL DEFAULT '', sku TEXT NOT NULL DEFAULT '', weight_g INTEGER NOT NULL DEFAULT 0,
  shelf_days INTEGER NOT NULL DEFAULT 0, min_qty INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0,
  per_box INTEGER NOT NULL DEFAULT 1,  -- штук в одном грузовом месте (коробке): пирожные 10 шт = 1 место
  active INTEGER NOT NULL DEFAULT 1, seed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS cities(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1, seed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS staff(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '',
  car TEXT NOT NULL DEFAULT '', tg_id TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
  seed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS tara_types(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, total INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1, seed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS moves(
  id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, date TEXT NOT NULL, product_id TEXT NOT NULL,
  qty INTEGER NOT NULL, city_id TEXT, trip_id TEXT, note TEXT NOT NULL DEFAULT '', user_id TEXT,
  created_at TEXT NOT NULL, seed INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS cm_date ON moves(date);
CREATE INDEX IF NOT EXISTS cm_prod ON moves(product_id);
CREATE TABLE IF NOT EXISTS trips(
  id TEXT PRIMARY KEY, num INTEGER NOT NULL, date TEXT NOT NULL, city_id TEXT NOT NULL, driver_id TEXT,
  status TEXT NOT NULL, lines TEXT NOT NULL DEFAULT '[]', tara_out TEXT NOT NULL DEFAULT '[]',
  tara_back TEXT NOT NULL DEFAULT '[]', report TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, shipped_at TEXT, reported_at TEXT, closed_at TEXT, seed INTEGER NOT NULL DEFAULT 0,
  odo_out INTEGER, odo_back INTEGER);  -- спидометр на выезде и при возврате, км
CREATE INDEX IF NOT EXISTS ct_date ON trips(date);
CREATE TABLE IF NOT EXISTS tara_moves(
  id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, tara_id TEXT NOT NULL, driver_id TEXT NOT NULL,
  city_id TEXT, kind TEXT NOT NULL DEFAULT 'out',
  qty INTEGER NOT NULL, trip_id TEXT, note TEXT NOT NULL DEFAULT '', user_id TEXT, created_at TEXT NOT NULL,
  seed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS shifts(date TEXT NOT NULL, staff_id TEXT NOT NULL, PRIMARY KEY(date, staff_id));
-- Сборка по кругу: место торта на складе (№ по кругу по часовой от двери), точки разгрузки, заявки
CREATE TABLE IF NOT EXISTS places(product_id TEXT PRIMARY KEY, place INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS points(
  id TEXT PRIMARY KEY, customer TEXT NOT NULL, address TEXT NOT NULL, route TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  seed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS orders(
  id TEXT PRIMARY KEY, num TEXT NOT NULL UNIQUE, date TEXT NOT NULL, point_id TEXT NOT NULL, route TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '', lines TEXT NOT NULL DEFAULT '[]', checked TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'new', picker TEXT NOT NULL DEFAULT '', boxes INTEGER, picked_at TEXT,
  trip_id TEXT, created_at TEXT NOT NULL, seed INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS co_date ON orders(date, route);
"""

MOVE_TYPES = {"in": "Приход", "ship": "Отгрузка", "return": "Возврат", "writeoff": "Списание", "adjust": "Инвентаризация"}
TRIP_STATUSES = ("draft", "shipped", "reported", "closed", "cancelled")
ROLES = ("storekeeper", "driver")
ORDER_STATUSES = ("new", "picked")  # собирается → собрано
MAX_LINES = 150
MAX_QTY = 100000
