# изменено 2026-10-17 05:00
"""Сборка в уже работающей базе: недостающие колонки, маршруты как направления рейсов,
точки и заявки с фото накладных (orders_data.py) — один раз."""
from __future__ import annotations

from datetime import datetime

from core import iso_now, jdump, new_id, scalar
from bots.cake.orders_data import DAY, ORDERS, POINTS


def route_city(conn, route: str) -> str:
    """Маршрут — направление рейса, как город: строка в cities с тем же названием (создаётся при нужде)."""
    cid = scalar(conn, "SELECT id FROM cities WHERE name=?", (route,))
    if cid:
        return cid
    digits = "".join(ch for ch in route if ch.isdigit())
    cid = f"route-{digits}" if digits and not scalar(conn, "SELECT 1 FROM cities WHERE id=?", (f"route-{digits}",)) else new_id("c")
    sort = (scalar(conn, "SELECT MIN(sort) FROM cities") or 0) - 1  # маршруты — первыми в списке
    conn.execute("INSERT INTO cities(id,name,code,sort) VALUES(?,?,?,?)", (cid, route, ("М" + digits)[:4] if digits else route[:3].upper(), sort))
    return cid


def migrate_picking(conn, now: datetime) -> None:
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(orders)").fetchall()}
    if "trip_id" not in cols:  # базы, созданные до связи заявок с рейсами
        conn.execute("ALTER TABLE orders ADD COLUMN trip_id TEXT")
    seed_orders(conn, now)
    routes = [r["route"] for r in conn.execute("SELECT DISTINCT route FROM points WHERE route<>'' ORDER BY route").fetchall()]
    for i, route in enumerate(routes):  # маршруты — первыми и по порядку: 2, 3, … (каждый старт, идемпотентно)
        conn.execute("UPDATE cities SET sort=? WHERE id=?", (i - len(routes), route_city(conn, route)))


def seed_orders(conn, now: datetime) -> None:
    if scalar(conn, "SELECT v FROM meta WHERE k='orders_v1'") is not None:
        return
    pid_of = {(r["cat"], r["name"], r["weight_g"]): r["id"]
              for r in conn.execute("SELECT id, cat, name, weight_g FROM products").fetchall()}
    for i, (key, customer, route, code, address, *_rest) in enumerate(POINTS):
        conn.execute("INSERT OR IGNORE INTO points(id,customer,address,route,code,sort,seed) VALUES(?,?,?,?,?,?,1)",
                     (key, customer, address, route, code or "", i))
    route_of = {key: route for key, _c, route, *_ in POINTS}
    for num, (point, comment, items) in ORDERS.items():
        lines: dict[str, dict] = {}
        for cat, name, w, qty, _places, is_bonus in items:  # бонусная строка — вся без оплаты
            pid = pid_of.get((cat, name, w))
            if not pid:
                continue  # товар удалён из справочника — заявку переносим без него
            ln = lines.setdefault(pid, {"productId": pid, "qty": 0, "bonus": 0})
            ln["bonus" if is_bonus else "qty"] += qty
        conn.execute("INSERT OR IGNORE INTO orders(id,num,date,point_id,route,comment,lines,created_at,seed) "
                     "VALUES(?,?,?,?,?,?,?,?,1)",
                     ("O-" + num, num, DAY, point, route_of[point], comment or "", jdump(list(lines.values())), iso_now()))
    conn.execute("INSERT INTO meta(k,v) VALUES('orders_v1',?)", (iso_now(),))
