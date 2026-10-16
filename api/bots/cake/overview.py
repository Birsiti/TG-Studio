# изменено 2026-10-17 01:30
"""Сводка руководителя: остаток, отгрузки по дням и городам, ходовые торты, ящики."""
from __future__ import annotations

from core import Ctx, add_days, rows, scalar, v_int
from bots.cake.base import _stock_map, _tara_debt, action


@action("getOverview")
def get_overview(ctx: Ctx, p: dict) -> dict:
    c, today = ctx.conn, ctx.today
    days = v_int(p, "days", lo=7, hi=60, required=False, default=14)
    frm = add_days(today, -(days - 1))
    by_day = {r["date"]: -r["q"] for r in rows(c, "SELECT date, SUM(qty) q FROM moves WHERE type='ship' AND date>=? GROUP BY date", (frm,))}
    series = [{"date": add_days(frm, i), "value": by_day.get(add_days(frm, i), 0)} for i in range(days)]
    by_city = rows(c, "SELECT city_id, -SUM(qty) q FROM moves WHERE type='ship' AND date>=? GROUP BY city_id ORDER BY q DESC", (frm,))
    top = rows(c, "SELECT product_id, -SUM(qty) q FROM moves WHERE type='ship' AND date>=? GROUP BY product_id ORDER BY q DESC LIMIT 5", (frm,))
    returned = scalar(c, "SELECT COALESCE(SUM(qty),0) FROM moves WHERE type='return' AND date>=?", (frm,))
    written = -scalar(c, "SELECT COALESCE(SUM(qty),0) FROM moves WHERE type='writeoff' AND date>=?", (frm,))
    stock = _stock_map(c)
    low = [r["name"] for r in rows(c, "SELECT * FROM products WHERE active=1 AND min_qty>0") if stock.get(r["id"], 0) < r["min_qty"]]
    st = {r["status"]: r["n"] for r in rows(c, "SELECT status, COUNT(*) n FROM trips WHERE status IN ('draft','shipped','reported') GROUP BY status")}
    return {
        "stockTotal": sum(stock.values()), "lowStock": low,
        "shippedToday": by_day.get(today, 0), "shippedPeriod": sum(by_day.values()),
        "returnedPeriod": returned, "writtenOffPeriod": written,
        "trips": {"draft": st.get("draft", 0), "shipped": st.get("shipped", 0), "reported": st.get("reported", 0)},
        "series": series,
        "byCity": [{"cityId": r["city_id"], "qty": r["q"]} for r in by_city],
        "topProducts": [{"productId": r["product_id"], "qty": r["q"]} for r in top],
        "taraOut": sum(q for q in _tara_debt(c).values()),
        "onShift": [r["staff_id"] for r in rows(c, "SELECT staff_id FROM shifts WHERE date=?", (today,))],
    }
