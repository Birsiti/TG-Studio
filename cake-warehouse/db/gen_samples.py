# изменено 2026-10-18 12:00
"""Примеры файлов для «Загрузить из файла» (js/import-file.js) → cake-warehouse/samples/*.xlsx.

    python3 cake-warehouse/db/gen_samples.py

Приход — как накладная цеха (№ п/п, Наименование с весом, Кол-во). Заявки — строки по магазинам:
№ заявки, Заказчик, Адрес, Маршрут, Наименование, Кол-во, Бонус. Названия нарочно «как в накладной»
(«Торт Сникерс 0,8 кг»), чтобы на показе было видно, что торт узнаётся по названию и весу.
"""
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font

OUT = Path(__file__).resolve().parents[1] / "samples"

INCOME = [("Торт Муравейка 0,55 кг", 24), ("Торт Грильяжный 0,8кг", 18), ("Торт «Панчо» 1 кг", 30),
          ("Десерт венский Сникерс 0,8 кг", 20), ("Десерт венский Сникерс 0,4 кг", 16), ("Пирожное Эклер на сливочном масле 250 г", 40),
          ("Пирожное Лакомка 420 г", 25), ("Торт Наполеон домашний 1 кг", 12), ("Пирожное Красный бархат 500 г", 15),
          ("Набор пирожных «Ягодное наслаждение» 380 г", 10)]

ORDERS = [
    ("Ф-2001", "Вкусно и Полезно ООО", "г. Минск, ул. Нарочанская, д. 17 (больница №2)", "Маршрут 2",
     [("Торт Муравейка 0,55 кг", 6, 0), ("Торт Панчо 1 кг", 4, 1), ("Пирожное Эклер на сливочном масле 250 г", 10, 0)]),
    ("Ф-2002", "Зорина ОАО", "г. Минск, ул. Гинтовта, 12", "Маршрут 2",
     [("Десерт венский Сникерс 0,8 кг", 5, 0), ("Торт Грильяжный 0,8кг", 3, 0), ("Пирожное Лакомка 420 г", 8, 0)]),
    ("Ф-2003", "Кафе «Сладкий дом»", "г. Минск, пр-т Независимости, 95", "Маршрут 3",
     [("Торт Наполеон домашний 1 кг", 4, 0), ("Пирожное Красный бархат 500 г", 6, 0), ("Набор «Ягодное наслаждение» 380 г", 3, 0)]),
]


def sheet(ws, head, rows):
    ws.append(head)
    for c in ws[1]:
        c.font = Font(bold=True)
    for r in rows:
        ws.append(r)
    for col, w in zip("ABCDEFG", (14, 30, 46, 14, 44, 10, 10)):
        ws.column_dimensions[col].width = w


def main():
    OUT.mkdir(exist_ok=True)
    wb = Workbook()
    ws = wb.active
    ws.title = "Приход"
    ws.append(["Накладная цеха № 154 от 18.10.2026 (пример)"])
    ws.append([])
    ws.append(["№ п/п", "Наименование", "Кол-во, шт"])
    for c in ws[3]:
        c.font = Font(bold=True)
    for i, (n, q) in enumerate(INCOME, 1):
        ws.append([i, n, q])
    ws.append(["", "Итого", sum(q for _, q in INCOME)])
    ws.column_dimensions["B"].width = 46
    wb.save(OUT / "prihod-primer.xlsx")

    wb = Workbook()
    rows = [(num, cust, addr, route, n, q, b) for num, cust, addr, route, lines in ORDERS for n, q, b in lines]
    sheet(wb.active, ["№ заявки", "Заказчик", "Адрес", "Маршрут", "Наименование", "Кол-во", "Бонус"], rows)
    wb.active.title = "Заявки"
    wb.save(OUT / "zayavki-primer.xlsx")
    print("samples:", sorted(p.name for p in OUT.iterdir()))


if __name__ == "__main__":
    main()
