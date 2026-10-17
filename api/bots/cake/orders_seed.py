# изменено 2026-10-17 18:10
"""Сборка в уже работающей базе: недостающие колонки, маршруты как направления рейсов,
точки и заявки с фото накладных (orders_data.py) — один раз."""
from __future__ import annotations

from datetime import datetime

from core import iso_now, jdump, new_id, scalar
from bots.cake import orders_1810, orders_1810b, orders_1810c
from bots.cake.catalog import SEED_PRODUCTS

ADDED_PLACES = {"p095": 22, "p099": 54}  # Красный бархат, Ягодное наслаждение
from bots.cake.orders_data import DAY, ORDERS, POINTS
from bots.cake.places_data import PLACES


def route_city(conn, route: str) -> str:
    """Маршрут — направление рейса, как город: строка в cities (создаётся при нужде).
    «Маршрут 2» — всегда route-2, даже если город переименовали: иначе рейсы разъедутся по двум городам."""
    digits = "".join(ch for ch in route if ch.isdigit())
    cid = (digits and scalar(conn, "SELECT id FROM cities WHERE id=?", (f"route-{digits}",))) or scalar(conn, "SELECT id FROM cities WHERE name=?", (route,))
    if cid:
        return cid
    cid = f"route-{digits}" if digits and not scalar(conn, "SELECT 1 FROM cities WHERE id=?", (f"route-{digits}",)) else new_id("c")
    sort = (scalar(conn, "SELECT MIN(sort) FROM cities") or 0) - 1  # маршруты — первыми в списке
    conn.execute("INSERT INTO cities(id,name,code,sort) VALUES(?,?,?,?)", (cid, route, ("М" + digits)[:4] if digits else route[:3].upper(), sort))
    return cid


def migrate_picking(conn, now: datetime) -> None:
    if "per_box" not in {r["name"] for r in conn.execute("PRAGMA table_info(products)").fetchall()}:
        conn.execute("ALTER TABLE products ADD COLUMN per_box INTEGER NOT NULL DEFAULT 1")  # шт в грузовом месте
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(orders)").fetchall()}
    if "trip_id" not in cols:  # базы, созданные до связи заявок с рейсами
        conn.execute("ALTER TABLE orders ADD COLUMN trip_id TEXT")
    seed_orders(conn, now)
    seed_places(conn)
    seed_added_products(conn)
    seed_batch(conn, "orders_1810", orders_1810.POINTS, orders_1810.ORDERS, orders_1810.DAY)
    seed_batch(conn, "orders_1810b", orders_1810b.POINTS, orders_1810b.ORDERS, orders_1810b.DAY)
    seed_batch(conn, "orders_1810c", orders_1810c.POINTS, orders_1810c.ORDERS, orders_1810c.DAY)
    seed_per_box(conn)
    routes = [r["route"] for r in conn.execute("SELECT DISTINCT route FROM points WHERE route<>'' ORDER BY route").fetchall()]
    for i, route in enumerate(routes):  # маршруты — первыми и по порядку: 2, 3, … (каждый старт, идемпотентно)
        conn.execute("UPDATE cities SET sort=? WHERE id=?", (i - len(routes), route_city(conn, route)))


def seed_places(conn) -> None:
    """Места по фото — один раз. Дальше их меняют в приложении, и в базе остаётся последнее сохранение
    (уже заданное место не перетираем)."""
    if scalar(conn, "SELECT v FROM meta WHERE k='places_v1'") is not None:
        return
    for pid, place in PLACES.items():
        conn.execute("INSERT OR IGNORE INTO places(product_id,place) SELECT id,? FROM products WHERE id=?", (place, pid))
    conn.execute("INSERT INTO meta(k,v) VALUES('places_v1',?)", (iso_now(),))


def seed_added_products(conn) -> None:
    """Товары, добавленные в каталог после запуска (catalog.ADDED), — в рабочую базу.
    Если такой торт уже завели руками (та же категория, название и вес) — второй не создаём."""
    have = {(r["cat"], r["name"], r["weight_g"]) for r in conn.execute("SELECT cat, name, weight_g FROM products").fetchall()}
    for i, (pid, cat, name, w) in enumerate(SEED_PRODUCTS):
        if (cat, name, w) not in have:
            conn.execute("INSERT OR IGNORE INTO products(id,cat,name,weight_g,sort,seed) VALUES(?,?,?,?,?,1)", (pid, cat, name, w, i))
    for pid, place in ADDED_PLACES.items():  # новые товары с карты склада по фото
        conn.execute("INSERT OR IGNORE INTO places(product_id,place) SELECT id,? FROM products WHERE id=?", (place, pid))


def seed_per_box(conn) -> None:
    """«Шт в коробке» мелких пирожных по колонке «груз. мест» накладных — один раз и только там,
    где ещё стоит 1 (заданное в приложении не перетираем)."""
    if scalar(conn, "SELECT v FROM meta WHERE k='perbox_v1'") is not None:
        return
    for (cat, name, w), n in orders_1810b.PER_BOX.items():
        conn.execute("UPDATE products SET per_box=? WHERE cat=? AND name=? AND weight_g=? AND per_box=1", (n, cat, name, w))
    conn.execute("INSERT INTO meta(k,v) VALUES('perbox_v1',?)", (iso_now(),))


def seed_orders(conn, now: datetime) -> None:
    seed_batch(conn, "orders_v1", POINTS, ORDERS, DAY)


def seed_batch(conn, flag: str, points: list, orders: dict, day: str) -> None:
    """Точки и заявки с фото накладных — один раз (флаг в meta): дальше их меняют в приложении."""
    if scalar(conn, "SELECT v FROM meta WHERE k=?", (flag,)) is not None:
        return
    pid_of = {(r["cat"], r["name"], r["weight_g"]): r["id"]
              for r in conn.execute("SELECT id, cat, name, weight_g FROM products").fetchall()}
    base = scalar(conn, "SELECT COUNT(*) FROM points") or 0
    for i, (key, customer, route, code, address, *_rest) in enumerate(points, base):
        conn.execute("INSERT OR IGNORE INTO points(id,customer,address,route,code,sort,seed) VALUES(?,?,?,?,?,?,1)",
                     (key, customer, address, route, code or "", i))
    route_of = {key: route for key, _c, route, *_ in points}
    for num, (point, comment, items) in orders.items():
        lines: dict[str, dict] = {}
        for cat, name, w, qty, _places, is_bonus in items:  # бонусная строка — вся без оплаты
            pid = pid_of.get((cat, name, w))
            if not pid:
                continue  # товар удалён из справочника — заявку переносим без него
            ln = lines.setdefault(pid, {"productId": pid, "qty": 0, "bonus": 0})
            ln["bonus" if is_bonus else "qty"] += qty
        conn.execute("INSERT OR IGNORE INTO orders(id,num,date,point_id,route,comment,lines,created_at,seed) "
                     "VALUES(?,?,?,?,?,?,?,?,1)",
                     ("O-" + num, num, day, point, route_of[point], comment or "", jdump(list(lines.values())), iso_now()))
    conn.execute("INSERT INTO meta(k,v) VALUES(?,?)", (flag, iso_now()))
