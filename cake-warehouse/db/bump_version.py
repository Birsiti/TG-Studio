# изменено 2026-10-17 11:30
"""Метка версии на скрипты и стили страниц (?v=…), чтобы Telegram не держал старые файлы в кэше.

    python3 cake-warehouse/db/bump_version.py      # перед каждой выкладкой на gh-pages
"""
from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCAL = re.compile(r'((?:src|href)="(?!https?:|#)[^"?]+\.(?:js|css))(?:\?v=[^"]*)?"')


def main() -> None:
    v = datetime.now().strftime("%y%m%d%H%M")
    for page in sorted(ROOT.glob("*.html")):
        text = page.read_text(encoding="utf-8")
        new, n = LOCAL.subn(rf'\1?v={v}"', text)
        if new != text:
            page.write_text(new, encoding="utf-8")
        print(f"{page.name}: {n} файлов, v={v}")


if __name__ == "__main__":
    main()
