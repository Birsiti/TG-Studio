# изменено 2026-10-17 01:30
"""Лист сборки по кругу склада (против часовой стрелки от двери).

    # одна заявка
    python3 cake-warehouse/db/pick_sheet.py --order 1103609
    # весь маршрут за один круг (+ листы заявок для раскладки на середине)
    python3 cake-warehouse/db/pick_sheet.py --route "Маршрут 3" --date 2026-10-17

Порядок строк — номер места товара (products.place). Места берутся из
places.csv (заполняется из бланка «Карта склада», см. import_places.py).
Товары без места идут в конец листа с пометкой «нет места».
Результат — HTML для печати в out/ и, если есть Chromium, PDF рядом.
"""
from __future__ import annotations

import argparse
import csv
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import dbutil  # noqa: E402
from pick_render import esc, kg, page, place_cell, split_cell, title  # noqa: E402

PLACES = HERE / "places.csv"


def open_db(db: str | None) -> sqlite3.Connection:
    conn = sqlite3.connect(db) if db else dbutil.build(sqlite3.connect(":memory:"))  # по умолчанию — временная
    apply_places(conn)
    return conn


def apply_places(conn: sqlite3.Connection) -> int:
    """places.csv: place;category;name;weight_g. Пустое место — товар без места."""
    if not PLACES.exists():
        return 0
    n = 0
    with PLACES.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f, delimiter=";"):
            place = (row.get("place") or "").strip()
            if not place:
                continue
            cur = conn.execute(
                "UPDATE products SET place = ? WHERE weight_g = ? AND name = ? AND category_id = "
                "(SELECT id FROM categories WHERE name = ?)",
                (int(place), int(row["weight_g"]), row["name"], row["category"]))
            n += cur.rowcount
    return n


def order_sheet(conn, number: str) -> str:
    head = conn.execute("""
        SELECT o.number, o.date, r.name, cu.name, pt.address, pt.store_code, o.comment
        FROM orders o JOIN routes r ON r.id = o.route_id JOIN points pt ON pt.id = o.point_id
        JOIN customers cu ON cu.id = pt.customer_id WHERE o.number = ?""", (number,)).fetchone()
    if not head:
        raise SystemExit(f"Заявка {number} не найдена")
    num, day, route, customer, address, code, comment = head
    rows = conn.execute("""SELECT place, name, weight_g, category, qty, places, is_bonus FROM v_pick_order
                           WHERE number = ? ORDER BY pick_seq, cat_sort, name, weight_g""", (number,)).fetchall()
    tr, qty_sum, places_sum, w_sum, no_place = [], 0, 0, 0.0, 0
    for i, (place, name, w, cat, qty, places, bonus) in enumerate(rows, 1):
        no_place += place is None
        qty_sum += 0 if bonus else qty
        places_sum += places
        w_sum += qty * w / 1000
        tr.append(f'<tr class="{"noplace" if place is None else ""}"><td class="box"></td>{place_cell(place)}'
                  f'<td>{title(cat, name, w)}{"<span class=bonus>бонус</span>" if bonus else ""}</td>'
                  f'<td class="qty">{qty}</td><td class="n">{places}</td><td class="n">{kg(qty * w / 1000)}</td></tr>')
    d = "-".join(reversed(day.split("-"))).replace("-", ".")
    return f"""<section class="sheet">
<h1>Лист сборки · Заявка № {esc(num)} от {d}</h1>
<p class="meta"><b>Заказчик:</b> {esc(customer)}{f" · магазин {esc(code)}" if code else ""} &nbsp; <b>Пункт разгрузки:</b> {esc(address)}<br>
<b>{esc(route)}</b>{f" &nbsp; <b>Комментарий:</b> {esc(comment)}" if comment else ""}</p>
{f'<p class="warn">Без места на складе: {no_place} поз. — они в конце листа</p>' if no_place else ""}
<table><thead><tr><th class="n">✓</th><th class="n">Место</th><th>Наименование</th><th class="n">Кол-во</th><th class="n">Мест</th><th class="n">Вес, кг</th></tr></thead>
<tbody>{"".join(tr)}
<tr class="total"><td colspan="3" style="text-align:right">Итого:</td><td class="qty">{qty_sum}</td><td class="n">{places_sum}</td><td class="n">{kg(w_sum)}</td></tr>
</tbody></table>
<p class="hint">Строки идут по кругу склада против часовой стрелки от двери. Бонусные позиции в «Итого» по кол-ву не входят.</p>
<div class="sign"><div>Сборку осуществил (ФИО)</div><div>Количество ящиков</div><div>Количество стопок</div></div>
</section>"""


def route_sheet(conn, route: str, day: str) -> tuple[str, list[str]]:
    rows = conn.execute("""SELECT place, category, name, weight_g, qty, places, split FROM v_pick_route
                           WHERE route = ? AND date = ? ORDER BY pick_seq, cat_sort, name, weight_g""", (route, day)).fetchall()
    if not rows:
        raise SystemExit(f"Нет заявок: {route} на {day}")
    orders = [r[0] for r in conn.execute("SELECT number FROM orders WHERE route_id = (SELECT id FROM routes WHERE name = ?) "
                                         "AND date = ? AND status <> 'cancelled' ORDER BY number", (route, day))]
    tr, qty_sum, w_sum, no_place = [], 0, 0.0, 0
    for place, cat, name, w, qty, places, split in rows:
        no_place += place is None
        qty_sum += qty
        w_sum += qty * w / 1000
        parts = split_cell(split)
        tr.append(f'<tr class="{"noplace" if place is None else ""}"><td class="box"></td>{place_cell(place)}'
                  f'<td>{title(cat, name, w)}</td><td class="qty">{qty}</td>'
                  f'<td class="split">{parts}</td></tr>')
    d = ".".join(reversed(day.split("-")))
    sheet = f"""<section class="sheet">
<h1>Сборка маршрута · {esc(route)} · {d}</h1>
<p class="meta">Один круг по складу: берём общее количество, на середине раскладываем по заявкам
(в колонке «Раскладка» — последние 4 цифры номера заявки и сколько ей). Заявок: <b>{len(orders)}</b> — {", ".join(orders)}</p>
{f'<p class="warn">Без места на складе: {no_place} поз. — они в конце листа</p>' if no_place else ""}
<table><thead><tr><th class="n">✓</th><th class="n">Место</th><th>Наименование</th><th class="n">Всего</th><th>Раскладка</th></tr></thead>
<tbody>{"".join(tr)}
<tr class="total"><td colspan="3" style="text-align:right">Итого:</td><td class="qty">{qty_sum}</td><td>{kg(w_sum)} кг</td></tr>
</tbody></table>
<div class="sign"><div>Сборку осуществил (ФИО)</div><div>Количество ящиков</div><div>Количество стопок</div></div>
</section>"""
    return sheet, orders


def to_pdf(html_path: Path) -> Path | None:
    """PDF через headless Chromium, если он есть (на iMac — Google Chrome)."""
    pdf = html_path.with_suffix(".pdf")
    for exe in ("/opt/pw-browsers/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                shutil.which("chromium") or "", shutil.which("google-chrome") or ""):
        if exe and Path(exe).exists():
            with tempfile.TemporaryDirectory() as prof:
                subprocess.run([exe, "--headless", "--no-sandbox", "--disable-gpu", f"--user-data-dir={prof}",
                                "--no-pdf-header-footer", f"--print-to-pdf={pdf}", html_path.as_uri()],
                               check=True, capture_output=True, timeout=60)
            return pdf
    return None


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--order", help="номер заявки")
    ap.add_argument("--route", help="маршрут, например «Маршрут 3»")
    ap.add_argument("--date", help="дата YYYY-MM-DD (для --route)")
    ap.add_argument("--db", help="файл базы (по умолчанию — временная из schema/*.sql + seed.sql)")
    ap.add_argument("--out", default=str(HERE / "out"), help="куда сохранить")
    a = ap.parse_args()
    conn = open_db(a.db)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    if a.order:
        name, body = f"sborka-{a.order}", order_sheet(conn, a.order)
    elif a.route and a.date:
        sheet, orders = route_sheet(conn, a.route, a.date)
        # за маршрутной — листы заявок, чтобы сверить раскладку на середине
        name, body = f"sborka-{a.route.replace(' ', '')}-{a.date}", sheet + "".join(order_sheet(conn, n) for n in orders)
    else:
        ap.error("нужен --order или --route с --date")
    path = out / f"{name}.html"
    path.write_text(page(name, body), encoding="utf-8")
    pdf = to_pdf(path)
    print(path, pdf or "(PDF: Chromium не найден — откройте HTML и напечатайте)", sep="\n")


if __name__ == "__main__":
    main()
