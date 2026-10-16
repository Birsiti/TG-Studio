# изменено 2026-10-16 22:00
"""Собирает базу во временный файл из schema.sql + seed.sql и проверяет её.

    python3 cake-warehouse/db/check_db.py            — проверка
    python3 cake-warehouse/db/check_db.py cake.db    — собрать базу в файл (если его нет)
"""
from __future__ import annotations

import sqlite3
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build_seed import EXPECTED  # noqa: E402


def build(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript((HERE / "schema.sql").read_text(encoding="utf-8"))
    conn.executescript((HERE / "seed.sql").read_text(encoding="utf-8"))
    return conn


def expect_error(conn, sql, args=(), what=""):
    # точка отката: откатываем только эту попытку, а не всю проверку
    conn.execute("SAVEPOINT expect")
    try:
        conn.execute(sql, args)
    except sqlite3.DatabaseError:
        conn.execute("ROLLBACK TO expect")
        return
    finally:
        conn.execute("RELEASE expect")
    raise AssertionError(f"ожидалась ошибка: {what}")


def check(conn: sqlite3.Connection) -> None:
    one = lambda sql, a=(): conn.execute(sql, a).fetchone()  # noqa: E731
    assert one("PRAGMA foreign_key_check") is None, "битые внешние ключи"
    assert one("PRAGMA integrity_check")[0] == "ok"
    assert one("SELECT COUNT(*) FROM products")[0] == 94
    assert one("SELECT COUNT(*) FROM order_lines WHERE product_id IS NULL")[0] == 0

    # каждая заявка = «Итого» с бумаги
    for number, (qty, places, kg) in EXPECTED.items():
        got = one("SELECT qty, places, weight_kg FROM v_order_totals WHERE number = ?", (number,))
        assert got == (qty, places, kg), f"заявка {number}: {got} ≠ {(qty, places, kg)}"
    print(f"✔ {len(EXPECTED)} заявок сходятся с «Итого» накладных (штуки, места, вес)")

    # приход, сводная, остаток
    conn.execute("INSERT INTO stock_moves (type, date, product_id, qty, note) "
                 "SELECT 'in', '2026-10-17', id, 30, 'Цех' FROM products")
    short = conn.execute("SELECT name, need, have FROM v_route_shortage WHERE route = 'Маршрут 3'").fetchall()
    assert short == [], short
    top = conn.execute("SELECT name, weight_g, qty FROM v_route_summary WHERE route = 'Маршрут 3' "
                       "ORDER BY qty DESC, name LIMIT 3").fetchall()
    print("✔ сводная Маршрута 3, топ:", "; ".join(f"{n} {w} г — {q}" for n, w, q in top))

    # лист сборки и привязка заявок
    conn.execute("INSERT INTO route_sheets (route_id, date, picker_name, boxes, stacks) VALUES (2, '2026-10-17', 'Кобзев', 14, 3)")
    sid = one("SELECT last_insert_rowid()")[0]
    conn.execute("UPDATE orders SET sheet_id = ? WHERE route_id = 2 AND date = '2026-10-17'", (sid,))
    expect_error(conn, "UPDATE orders SET sheet_id = ? WHERE number = '1103561'", (sid,), "заявка М2 в сводную М3")

    # отгрузка по листу: списание всех строк
    conn.execute("INSERT INTO stock_moves (type, date, product_id, qty, order_id, sheet_id) "
                 "SELECT 'ship', o.date, l.product_id, -l.qty, o.id, o.sheet_id FROM orders o "
                 "JOIN order_lines l ON l.order_id = o.id WHERE o.sheet_id = ?", (sid,))
    conn.execute("INSERT INTO tara_moves (date, tara_id, point_id, qty, sheet_id) VALUES ('2026-10-17', 1, 13, 4, ?)", (sid,))
    conn.execute("INSERT INTO tara_moves (date, tara_id, point_id, qty, sheet_id) VALUES ('2026-10-17', 1, 13, -3, ?)", (sid,))
    assert one("SELECT qty FROM v_tara_debt WHERE point_id = 13")[0] == 1
    shipped = -one("SELECT SUM(qty) FROM stock_moves WHERE type = 'ship'")[0]
    print(f"✔ отгрузка листа М3: {shipped} шт, долг тары точки — 1 ящик")

    # защита учёта
    expect_error(conn, "UPDATE stock_moves SET qty = 1 WHERE id = 1", what="правка журнала")
    expect_error(conn, "DELETE FROM stock_moves WHERE id = 1", what="удаление из журнала")
    expect_error(conn, "INSERT INTO stock_moves (type, date, product_id, qty) VALUES ('ship', '2026-10-17', 1, 5)",
                 what="отгрузка с плюсом")
    expect_error(conn, "INSERT INTO order_lines (order_id, line_no, product_id, qty, places) VALUES (1, 99, 999, 1, 1)",
                 what="несуществующий товар")
    expect_error(conn, "INSERT INTO staff (name, role, phone) VALUES ('Тест', 'driver', '80291234567')", what="телефон не +375")
    expect_error(conn, "INSERT INTO products (category_id, name, weight_g) VALUES (1, 'Муравейка', 550)", what="дубль товара")
    print("✔ журнал не правится и не удаляется; знаки, ссылки, телефон и дубли проверяются")
    conn.rollback()


def main() -> None:
    if len(sys.argv) > 1:
        target = Path(sys.argv[1])
        if target.exists():
            sys.exit(f"{target} уже есть — не перезаписываю")
        build(target).commit()
        print(f"База создана: {target}")
        return
    with tempfile.TemporaryDirectory() as d:
        conn = build(Path(d) / "cake.db")
        check(conn)
        conn.close()
    print("Всё в порядке.")


if __name__ == "__main__":
    main()
