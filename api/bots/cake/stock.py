# изменено 2026-10-17 01:30
"""Остатки, приход, списание, инвентаризация, журнал движений."""
from __future__ import annotations

from core import ApiError, Ctx, add_days, jload, rows, scalar, v_date, v_enum, v_id, v_int, v_str
from bots.cake.base import _add_move, _check_stock, _lines, _move, _product, _stock_map, action
from bots.cake.schema import MAX_QTY, MOVE_TYPES


@action("getStock")
def get_stock(ctx: Ctx, p: dict) -> dict:
    c = ctx.conn
    stock = _stock_map(c)
    last_in = {r["product_id"]: r["d"] for r in rows(c, "SELECT product_id, MAX(date) d FROM moves WHERE type='in' GROUP BY product_id")}
    on_road = {}
    for t in rows(c, "SELECT lines FROM trips WHERE status IN ('shipped','reported')"):
        for ln in jload(t["lines"], []):
            on_road[ln["productId"]] = on_road.get(ln["productId"], 0) + ln["qty"]
    items = []
    for r in rows(c, "SELECT * FROM products ORDER BY sort, name"):
        q = stock.get(r["id"], 0)
        if not r["active"] and not q:
            continue
        items.append({**_product(r), "qty": q, "lastIn": last_in.get(r["id"]), "onRoad": on_road.get(r["id"], 0)})
    return {"items": items, "total": sum(i["qty"] for i in items)}


@action("addIncome", write=True)
def add_income(ctx: Ctx, p: dict) -> dict:
    day = v_date(p, "date", required=False) or ctx.today
    note = v_str(p, "note", required=False, max_len=200)
    lines = _lines(ctx.conn, p)
    for ln in lines:
        _add_move(ctx, "in", day, ln["productId"], ln["qty"], note=note)
    return {"added": sum(ln["qty"] for ln in lines)}


@action("writeOff", write=True)
def write_off(ctx: Ctx, p: dict) -> dict:
    pid = v_id(p, "productId")
    q = v_int(p, "qty", lo=1, hi=MAX_QTY)
    reason = v_str(p, "reason", min_len=2, max_len=200)
    _check_stock(ctx.conn, [{"productId": pid, "qty": q}])
    _add_move(ctx, "writeoff", ctx.today, pid, -q, note=reason)
    return {"qty": _stock_map(ctx.conn).get(pid, 0)}


@action("adjustStock", write=True)
def adjust_stock(ctx: Ctx, p: dict) -> dict:
    """Инвентаризация: actual — сколько насчитали; пишем разницу."""
    pid = v_id(p, "productId")
    if not scalar(ctx.conn, "SELECT 1 FROM products WHERE id=?", (pid,)):
        raise ApiError("not_found", "Нет такого торта")
    actual = v_int(p, "actual", hi=MAX_QTY)
    delta = actual - _stock_map(ctx.conn).get(pid, 0)
    if delta:
        _add_move(ctx, "adjust", ctx.today, pid, delta, note=v_str(p, "note", required=False, max_len=200) or "Пересчёт")
    return {"delta": delta, "qty": actual}


@action("getMoves")
def get_moves(ctx: Ctx, p: dict) -> dict:
    to = v_date(p, "to", required=False) or ctx.today
    frm = v_date(p, "from", required=False) or add_days(to, -6)
    t = v_enum(p, "type", list(MOVE_TYPES), required=False)
    q = "SELECT * FROM moves WHERE date BETWEEN ? AND ?" + (" AND type=?" if t else "") + " ORDER BY date DESC, id DESC LIMIT 5000"  # сводка за день не должна обрезаться
    return {"moves": [_move(r) for r in rows(ctx.conn, q, (frm, to, t) if t else (frm, to))], "from": frm, "to": to}
