# изменено 2026-10-17 01:30
"""Перегенерировать каталог демо-режима (mock-data.js) из api/bots/cake/catalog.py.

    python3 cake-warehouse/db/gen_mock_catalog.py

Меняет только блок CATS/PRODUCTS между строкой «// сгенерировано…» и «];».
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "api"))
from bots.cake.catalog import CATS, SEED_PRODUCTS  # noqa: E402

TARGET = ROOT / "cake-warehouse" / "mock-data.js"


def main() -> None:
    s = TARGET.read_text(encoding="utf-8")
    rows = ",\n    ".join(json.dumps([pid, cat, name, w], ensure_ascii=False) for pid, cat, name, w in SEED_PRODUCTS)
    block = ("  // сгенерировано db/gen_mock_catalog.py из api/bots/cake/catalog.py — руками не править\n"
             f"  var CATS = {json.dumps(list(CATS), ensure_ascii=False)};\n  var PRODUCTS = [\n    {rows}\n  ];\n")
    new, n = re.subn(r"  // сгенерировано[^\n]*\n  var CATS = [^\n]*\n  var PRODUCTS = \[\n.*?\n  \];\n", lambda m: block, s, flags=re.S)
    if n != 1:
        sys.exit("Не найден блок каталога в mock-data.js")
    TARGET.write_text(new, encoding="utf-8")
    print(f"mock-data.js: {len(SEED_PRODUCTS)} товаров")


if __name__ == "__main__":
    main()
