# изменено 2026-10-17 01:30
"""Оформление листа сборки: формат чисел, названия, ячейки и стили для печати A4."""
from __future__ import annotations

import html


def weight(g: int) -> str:
    return f"{g} г" if g < 1000 else f"{g / 1000:g} кг".replace(".", ",")


def kg(x: float) -> str:
    return f"{x:.3f}".replace(".", ",")


def esc(x) -> str:
    return html.escape(str(x))


def title(cat: str, name: str, w: int) -> str:
    """«Торт «Пражский» 1 кг»; если в названии уже есть кавычки — не оборачиваем второй раз."""
    n = name if "«" in name else f"«{name}»"
    return esc(f"{cat} {n} {weight(w)}")


def split_cell(split: str) -> str:
    """'1103609:2 1103342:1б' → №3609: 2 · №3342: 1 бонус (бонус словом, чтобы «1б» не читали как «16»)."""
    out = []
    for part in split.split(" "):
        num, q = part.split(":")
        bonus = q.endswith("б")
        q = q.rstrip("б")
        out.append(f"№{esc(num[-4:])}: <b>{esc(q)}</b>" + (" <span class=bonus>бонус</span>" if bonus else ""))
    return " &nbsp; ".join(out)


CSS = """
@page { size: A4; margin: 12mm 10mm; }
* { box-sizing: border-box; }
body { font: 12pt/1.3 Arial, sans-serif; color: #000; margin: 0; }
.sheet { page-break-after: always; }
.sheet:last-child { page-break-after: auto; }
h1 { font-size: 16pt; margin: 0 0 6px; text-align: center; }
.meta { margin: 0 0 8px; }
.meta b { font-weight: bold; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
th { background: #e6e6e6; font-size: 10pt; }
td.n, th.n { text-align: center; white-space: nowrap; }
td.place { font-size: 15pt; font-weight: bold; text-align: center; width: 16mm; }
td.box { width: 9mm; }
td.qty { font-size: 14pt; font-weight: bold; text-align: center; width: 18mm; }
td.split { font-size: 10pt; }
tr.noplace td { background: #f3f3f3; }
tr.total td { font-weight: bold; }
.bonus { font-size: 9pt; border: 1px solid #000; padding: 0 3px; margin-left: 4px; }
.hint { font-size: 9pt; color: #444; margin-top: 4px; }
.sign { margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; font-size: 11pt; }
.sign div { border-bottom: 1px solid #000; padding-top: 18px; }
.warn { border: 2px solid #000; padding: 4px 8px; margin: 6px 0; font-weight: bold; }
"""


def place_cell(place) -> str:
    return f'<td class="place">{esc(place)}</td>' if place else '<td class="place" style="font-size:9pt">нет места</td>'


def page(title: str, body: str) -> str:
    return f'<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>{esc(title)}</title><style>{CSS}</style></head><body>{body}</body></html>'
