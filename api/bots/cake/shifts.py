# изменено 2026-10-17 01:30
"""Смены: кто работает в день."""
from __future__ import annotations

from core import Ctx, add_days, rows, v_date, v_list
from bots.cake.base import action


@action("getShifts")
def get_shifts(ctx: Ctx, p: dict) -> dict:
    frm = v_date(p, "from", required=False) or ctx.today
    to = v_date(p, "to", required=False) or add_days(frm, 6)
    days: dict[str, list[str]] = {}
    for r in rows(ctx.conn, "SELECT * FROM shifts WHERE date BETWEEN ? AND ? ORDER BY date", (frm, to)):
        days.setdefault(r["date"], []).append(r["staff_id"])
    return {"days": days, "from": frm, "to": to}


@action("setShift", write=True)
def set_shift(ctx: Ctx, p: dict) -> dict:
    day = v_date(p, "date")
    ids = [x for x in v_list(p, "staffIds", max_items=100) if isinstance(x, str)]
    valid = {r["id"] for r in rows(ctx.conn, "SELECT id FROM staff")}
    ids = [x for x in dict.fromkeys(ids) if x in valid]
    ctx.conn.execute("DELETE FROM shifts WHERE date=?", (day,))
    ctx.conn.executemany("INSERT INTO shifts(date,staff_id) VALUES(?,?)", [(day, x) for x in ids])
    return {"date": day, "staffIds": ids}
