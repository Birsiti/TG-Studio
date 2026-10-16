# изменено 2026-10-17 02:00
"""Генерирует seed.sql из каталога API и данных заявок от 17.10.2026.

    python3 cake-warehouse/db/build_seed.py   (из корня репозитория)

Ассортимент берётся из api/bots/cake/catalog.py (CATALOG) — один источник правды.
Заявки внесены только полностью видимые на фото; каждая сверена со строкой
«Итого» накладной (штук без бонусов и вес) — см. EXPECTED и check_db.py.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "api"))
from bots.cake import CATALOG, CATS  # noqa: E402

OUT = Path(__file__).with_name("seed.sql")

# «Весовой» в заявках (в колонке «Весовой» указан вес)
WEIGHTED = {("Торт", "Вкус наслаждения", 500), ("Торт", "Трюфельный", 1500), ("Торт", "Санкт-Петербург", 2000),
            ("Торт", "Смородинка", 1300), ("Торт", "Ассорти «Трио»", 2000), ("Торт", "Съешь меня карамельный", 950),
            ("Торт", "Кучерявый", 1500), ("Торт", "Экзотик", 1500), ("Торт", "Вишня в шоколаде", 1000),
            ("Сладости мучные", "Рулет бисквитный «Нежная лаванда»", 500), ("Пирожное", "Эклер заварной", 75),
            ("Пирожное", "Эклер творожный", 75), ("Пирожное", "Ёж ореховый", 80), ("Пирожное", "Медок", 75),
            ("Пирожное", "Рафаэлка", 50), ("Сладости мучные", "Маффин шоколадный", 70)}

from bots.cake.orders_data import CUSTOMERS, DAY, ORDERS, POINTS, ROUTES  # noqa: E402  (данные заявок — общие с API)

ROUTE_OF = {key: route for key, _c, route, *_ in POINTS}

# «Итого» с бумаги: (кол-во без бонусов, грузовых мест, вес кг) — проверяется в check_db.py
EXPECTED = {"1103561": (17, 17, 6.410), "1103455": (78, 78, 33.680), "1103462": (20, 20, 7.340),
            "1103342": (22, 22, 9.870), "1103471": (6, 6, 3.525), "1103477": (1, 1, 0.500),
            "1103487": (8, 8, 6.250), "1103500": (3, 3, 2.800), "1103549": (7, 7, 3.500),
            "1103609": (50, 52, 45.875), "1103617": (6, 6, 1.350)}


def q(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def main() -> None:
    out = ["-- изменено 2026-10-16 23:00",
           "-- СГЕНЕРИРОВАНО build_seed.py — правьте генератор, а не этот файл.",
           "-- Ассортимент: api/bots/cake/catalog.py (CATALOG). Заказчики, точки, заявки: фото от 17.10.2026 (../source/).",
           "PRAGMA foreign_keys = ON;", "BEGIN;", ""]
    out.append("INSERT INTO categories (id, name, sort) VALUES")
    out.append(",\n".join(f"  ({i + 1}, {q(c)}, {i})" for i, c in enumerate(CATS)) + ";\n")

    rows, pid = [], 0
    for ci, cat in enumerate(CATS):
        for name, w in CATALOG[cat]:
            pid += 1
            rows.append(f"  ({pid}, {ci + 1}, {q(name)}, {w}, {1 if (cat, name, w) in WEIGHTED else 0}, {pid})")
    out.append("INSERT INTO products (id, category_id, name, weight_g, is_weighted, sort) VALUES")
    out.append(",\n".join(rows) + ";\n")

    out.append("INSERT INTO routes (id, name, sort) VALUES")
    out.append(",\n".join(f"  ({i + 1}, {q(r)}, {i})" for i, r in enumerate(ROUTES)) + ";\n")
    out.append("INSERT INTO customers (id, name) VALUES")
    out.append(",\n".join(f"  ({i + 1}, {q(c)})" for i, c in enumerate(CUSTOMERS)) + ";\n")

    pts = []
    for i, (key, cust, route, code, addr, dfrom, dto, note) in enumerate(POINTS):
        pts.append(f"  ({i + 1}, {CUSTOMERS.index(cust) + 1}, {ROUTES.index(route) + 1}, {q(code)}, {q(addr)}, "
                   f"{q(dfrom)}, {q(dto)}, {q(note)})")
    out.append("INSERT INTO points (id, customer_id, route_id, store_code, address, delivery_from, delivery_to, note) VALUES")
    out.append(",\n".join(pts) + ";\n")

    out.append("INSERT INTO tara_types (id, name, total) VALUES (1, 'Ящик', 0);  -- сколько ящиков в обороте — посчитать на складе\n")

    point_id = {key: i + 1 for i, (key, *_r) in enumerate(POINTS)}
    oid = 0
    for number, (key, comment, lines) in ORDERS.items():
        oid += 1
        out.append(f"-- Заявка № {number} · {ROUTE_OF[key]}")
        out.append(f"INSERT INTO orders (id, number, date, point_id, route_id, comment) VALUES "
                   f"({oid}, {q(number)}, {q(DAY)}, {point_id[key]}, {ROUTES.index(ROUTE_OF[key]) + 1}, {q(comment)});")
        ls = []
        for n, (cat, name, w, qty, places, bonus) in enumerate(lines, 1):
            prod = (f"(SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id "
                    f"WHERE c.name = {q(cat)} AND p.name = {q(name)} AND p.weight_g = {w})")
            ls.append(f"  ({oid}, {n}, {prod}, {qty}, {places}, {bonus})")
        out.append("INSERT INTO order_lines (order_id, line_no, product_id, qty, places, is_bonus) VALUES")
        out.append(",\n".join(ls) + ";\n")

    out.append("COMMIT;")
    OUT.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {pid} товаров, {len(POINTS)} точек, {len(ORDERS)} заявок")


if __name__ == "__main__":
    main()
