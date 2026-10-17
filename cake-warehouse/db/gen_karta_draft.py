# изменено 2026-10-17 20:10
"""Черновик карты склада (db/places-photos.csv) → karta-draft.js (места по фото для демо) и places_data.py.

    python3 cake-warehouse/db/gen_karta_draft.py

Заодно пишет api/bots/cake/places_data.py: места тортов из ассортимента — API ставит их
в базу один раз (дальше места меняют только в приложении, последнее сохранение остаётся).

Строка с product_id — торт из ассортимента; без него — новый товар (название, категория
и вес — догадка из подписи, на странице их можно поправить). note — вопрос к руководителю.
"""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC, OUT = HERE / "places-photos.csv", HERE.parent / "karta-draft.js"
API = HERE.parent.parent / "api" / "bots" / "cake" / "places_data.py"  # места по фото — сеются в базу один раз
CAT_OF = [("венский", "Венский десерт"), ("набор", "Набор пирожных"), ("сладости", "Сладости мучные"),
          ("пирожное", "Пирожное"), ("торт", "Торт"), ("трубочка", "Сладости мучные")]


def guess(name: str) -> tuple[str, str]:
    """«Киевский (торт)» → («Киевский», «Торт»)."""
    m = re.match(r"^(.*?)\s*\(([^)]*)\)\s*$", name)
    clean, hint = (m.group(1), m.group(2)) if m else (name, name)
    low = (hint + " " + name).lower()
    return clean.strip(), next((c for k, c in CAT_OF if k in low), "Торт")


def main() -> None:
    rows = csv.DictReader(line for line in SRC.read_text(encoding="utf-8").splitlines() if not line.startswith("#"))
    out = []
    for r in rows:
        name, cat = guess(r["name"])
        out.append({"place": int(r["place"]), "productId": r["product_id"] or None, "name": name, "cat": cat,
                    "weightG": int(r["weight_g"]) if r["weight_g"] else 0, "note": r["note"]})
    OUT.write_text("// изменено 2026-10-17 07:50\n"
                   "// СГЕНЕРИРОВАНО db/gen_karta_draft.py из db/places-photos.csv — руками не править.\n"
                   "window.CakeKartaDraft = " + json.dumps(out, ensure_ascii=False, indent=0) + ";\n", encoding="utf-8")
    places = {x["productId"]: x["place"] for x in out if x["productId"]}
    API.write_text("# изменено 2026-10-17 10:30\n"
                   '"""СГЕНЕРИРОВАНО cake-warehouse/db/gen_karta_draft.py из db/places-photos.csv — руками не править.\n'
                   'Места на складе по фото (обход по часовой от двери): товар → номер места."""\n\n'
                   "PLACES = " + json.dumps(places, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")
    print(f"{OUT.name}: {len(out)} мест, новых товаров {sum(1 for x in out if not x['productId'])}, вопросов {sum(1 for x in out if x['note'])}")


if __name__ == "__main__":
    main()
