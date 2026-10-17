# изменено 2026-10-17 19:10
"""Сгенерировать mock-orders.js (точки и заявки демо-режима) из api/bots/cake/orders_data.py.

    python3 cake-warehouse/db/gen_mock_orders.py

В демо заявки получают сегодняшнюю дату (ставит mock-picking.js), строки — те же,
что на фото накладных, бонусная строка — в поле bonus.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "api"))
from bots.cake.catalog import SEED_PRODUCTS  # noqa: E402
from bots.cake.orders_data import ORDERS, POINTS  # noqa: E402
from bots.cake import orders_1810, orders_1810b, orders_1810c  # noqa: E402

TARGET = ROOT / "cake-warehouse" / "mock-orders.js"


def build(POINTS, ORDERS):
    pid_of = {(cat, name, w): pid for pid, cat, name, w in SEED_PRODUCTS}
    points = [{"id": k, "customer": c, "address": a, "route": r, "code": code or "", "active": True}
              for k, c, r, code, a, *_ in POINTS]
    route_of = {p["id"]: p["route"] for p in points}
    orders = []
    for num, (point, comment, items) in ORDERS.items():
        lines: dict[str, dict] = {}
        for cat, name, w, qty, _places, is_bonus in items:
            ln = lines.setdefault(pid_of[(cat, name, w)], {"productId": pid_of[(cat, name, w)], "qty": 0, "bonus": 0})
            ln["bonus" if is_bonus else "qty"] += qty
        orders.append({"id": "O-" + num, "num": num, "pointId": point, "route": route_of[point], "comment": comment or "",
                       "lines": list(lines.values())})
    return points, orders


def main() -> None:
    points, orders = build(POINTS, ORDERS)
    # пачки после запуска — досеиваются в старое демо по своему ключу, со своей датой
    batches = []
    for key, mod in (("batch1810", orders_1810), ("batch1810b", orders_1810b), ("batch1810c", orders_1810c)):
        bp, bo = build(mod.POINTS, mod.ORDERS)
        batches.append({"key": key, "day": mod.DAY, "points": bp, "orders": bo})
    per_box = {pid: n for pid, cat, name, w in SEED_PRODUCTS for (c, nm, ww), n in orders_1810b.PER_BOX.items() if (cat, name, w) == (c, nm, ww)}
    dump = lambda x: json.dumps(x, ensure_ascii=False, separators=(",", ":"))  # noqa: E731
    TARGET.write_text(
        "// изменено 2026-10-17 02:40\n"
        "// СГЕНЕРИРОВАНО db/gen_mock_orders.py из api/bots/cake/orders_data.py — руками не править.\n"
        "// Точки разгрузки и заявки с фото накладных для демо-режима.\n"
        f"window.CakeMockOrders = {{\n  points: {dump(points)},\n  orders: {dump(orders)},\n"
        f"  batches: {dump(batches)},\n  perBox: {dump(per_box)}\n}};\n", encoding="utf-8")
    print(f"{TARGET.relative_to(ROOT)}: {len(points)} точек, {len(orders)} заявок")


if __name__ == "__main__":
    main()
