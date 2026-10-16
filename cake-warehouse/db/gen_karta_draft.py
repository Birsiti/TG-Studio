# изменено 2026-10-17 07:50
"""Черновик карты склада (db/places-photos.csv) → karta-draft.js для страницы проверки (proverka.html).

    python3 cake-warehouse/db/gen_karta_draft.py

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
    print(f"{OUT.name}: {len(out)} мест, новых товаров {sum(1 for x in out if not x['productId'])}, вопросов {sum(1 for x in out if x['note'])}")


if __name__ == "__main__":
    main()
