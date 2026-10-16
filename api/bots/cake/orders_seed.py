# изменено 2026-10-17 02:10
"""Точки и заявки с фото накладных (orders_data.py) — в базу один раз, и в новую, и в уже работающую."""
from __future__ import annotations

from datetime import datetime

from core import iso_now, jdump, scalar
from bots.cake.orders_data import DAY, ORDERS, POINTS


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
