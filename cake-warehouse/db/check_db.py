# изменено 2026-10-17 00:30
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
    shipped = -one("SELECT SUM(qty) FROM stock_moves WHERE type = 'ship'")[0]
    print(f"✔ отгрузка листа М3: {shipped} шт")

    # ящики за водителем: выдали 14 по листу, вернул 12, один утерял
    conn.execute("UPDATE tara_types SET total = 500 WHERE id = 1")
    conn.execute("INSERT INTO staff (id, name, role) VALUES (10, 'Водитель Тест', 'driver'), (11, 'Кладовщик Тест', 'storekeeper')")
    conn.execute("UPDATE route_sheets SET driver_id = 10 WHERE id = ?", (sid,))
    conn.execute("INSERT INTO tara_moves (date, tara_id, driver_id, kind, qty, sheet_id) VALUES ('2026-10-17', 1, 10, 'out', 14, ?)", (sid,))
    conn.execute("INSERT INTO tara_moves (date, tara_id, driver_id, kind, qty, sheet_id) VALUES ('2026-10-17', 1, 10, 'back', -12, ?)", (sid,))
    conn.execute("INSERT INTO tara_moves (date, tara_id, driver_id, kind, qty) VALUES ('2026-10-18', 1, 10, 'writeoff', -1)")
    got = one("SELECT issued, returned, lost, debt FROM v_driver_tara WHERE driver_id = 10")
    assert got == (14, 12, 1, 1), got
    assert one("SELECT issued, returned, not_returned FROM v_sheet_tara WHERE sheet_id = ?", (sid,)) == (14, 12, 2)
    assert one("SELECT at_drivers, lost, in_stock FROM v_tara_stock") == (1, 1, 498)
    expect_error(conn, "INSERT INTO tara_moves (date, tara_id, driver_id, kind, qty) VALUES ('2026-10-18', 1, 10, 'back', -2)",
                 what="вернул больше, чем на руках")
    expect_error(conn, "INSERT INTO tara_moves (date, tara_id, driver_id, kind, qty) VALUES ('2026-10-18', 1, 11, 'out', 3)",
                 what="ящики на кладовщика")
    expect_error(conn, "INSERT INTO tara_moves (date, tara_id, driver_id, kind, qty) VALUES ('2026-10-18', 1, 10, 'out', -3)",
                 what="выдача с минусом")
    print("✔ ящики: водителю выдано 14, вернул 12, утерял 1 → долг 1; на складе 498 из 500")

    # лист сборки по кругу: строки по номеру места, без места — в конце
    conn.execute("UPDATE products SET place = 100 - id")  # условная карта: чем больше id, тем раньше на круге
    conn.execute("UPDATE products SET place = NULL WHERE name = 'Экзотик'")
    seq = [r[0] for r in conn.execute("SELECT name FROM v_pick_order WHERE number = '1103609' ORDER BY pick_seq, cat_sort, name")]
    assert seq[-1] == "Экзотик" and len(seq) == 22, seq
    places = [r[0] for r in conn.execute("SELECT place FROM v_pick_order WHERE number = '1103609' AND place IS NOT NULL ORDER BY pick_seq")]
    assert places == sorted(places)
    route = conn.execute("SELECT qty, split FROM v_pick_route WHERE route = 'Маршрут 3' AND name = 'Грильяжный'").fetchone()
    assert route == (2, "1103609:2б"), route
    total = one("SELECT SUM(qty) FROM v_pick_route WHERE route = 'Маршрут 3' AND date = '2026-10-17'")[0]
    assert total == 105, total
    print("✔ лист сборки: строки по местам, без места — в конце; маршрут 3 за круг — 105 шт с раскладкой по заявкам")

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
