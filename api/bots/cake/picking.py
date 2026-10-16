# изменено 2026-10-17 02:20
"""Сборка по кругу: заявки точек на дату, лист с галочками, места тортов на складе, точки разгрузки.

Остаток сборка не трогает — торты списываются отгрузкой рейса (trips.py).
Порядок строк (по месту на складе) считает экран: места отдаются картой productId → №.
"""
from __future__ import annotations

from core import ApiError, Ctx, add_days, iso_now, jdump, jload, new_id, one, rows, scalar, v_bool, v_date, v_id, v_int, v_list, v_str
from bots.cake.base import _next_sort, action
from bots.cake.schema import MAX_LINES, MAX_QTY

MAX_PLACE = 9999


def _order(r) -> dict:
    return {"id": r["id"], "num": r["num"], "date": r["date"], "pointId": r["point_id"], "route": r["route"],
            "comment": r["comment"], "lines": jload(r["lines"], []), "checked": jload(r["checked"], []),
            "status": r["status"], "picker": r["picker"], "boxes": r["boxes"], "pickedAt": r["picked_at"]}


def _point(r) -> dict:
    return {"id": r["id"], "customer": r["customer"], "address": r["address"], "route": r["route"], "code": r["code"],
            "active": bool(r["active"])}


def _get_order(conn, oid: str) -> dict:
    r = one(conn, "SELECT * FROM orders WHERE id=?", (oid,))
    if not r:
        raise ApiError("not_found", "Заявка не найдена")
    return r


def _places(conn) -> dict[str, int]:
    return {r["product_id"]: r["place"] for r in rows(conn, "SELECT product_id, place FROM places")}


@action("getOrders")
def get_orders(ctx: Ctx, p: dict) -> dict:
    """Заявки на дату (по умолчанию — ближайшая дата с заявками, не раньше чем неделю назад) + точки и места."""
    dates = [r["date"] for r in rows(ctx.conn, "SELECT DISTINCT date FROM orders WHERE date >= ? ORDER BY date",
                                     (add_days(ctx.today, -30),))]
    day = v_date(p, "date", required=False)
    if not day:
        fresh = [d for d in dates if d >= add_days(ctx.today, -7)]
        day = next((d for d in fresh if d >= ctx.today), fresh[-1] if fresh else ctx.today)
    rs = rows(ctx.conn, "SELECT * FROM orders WHERE date=? ORDER BY route, num", (day,))
    points = rows(ctx.conn, "SELECT * FROM points ORDER BY route, sort")
    return {"date": day, "dates": dates, "orders": [_order(r) for r in rs], "points": [_point(r) for r in points],
            "routes": sorted({r["route"] for r in points if r["route"] and r["active"]}), "places": _places(ctx.conn)}


def _order_lines(conn, p: dict) -> list[dict]:
    out: dict[str, dict] = {}
    for x in v_list(p, "lines", max_items=MAX_LINES):
        if not isinstance(x, dict):
            raise ApiError("bad_request", "lines: ожидается объект")
        pid = v_id(x, "productId")
        q = v_int(x, "qty", lo=0, hi=MAX_QTY)
        b = v_int(x, "bonus", lo=0, hi=MAX_QTY, required=False)
        if not scalar(conn, "SELECT 1 FROM products WHERE id=?", (pid,)):
            raise ApiError("not_found", "Нет такого торта")
        if q or b:
            ln = out.setdefault(pid, {"productId": pid, "qty": 0, "bonus": 0})
            ln["qty"] += q
            ln["bonus"] += b
    if not out:
        raise ApiError("bad_request", "В заявке нет тортов")
    return list(out.values())


@action("saveOrder", write=True)
def save_order(ctx: Ctx, p: dict) -> dict:
    oid = v_id(p, "id", required=False)
    num = v_str(p, "num", min_len=1, max_len=20)
    point = one(ctx.conn, "SELECT * FROM points WHERE id=?", (v_id(p, "pointId"),))
    if not point:
        raise ApiError("not_found", "Нет такой точки")
    if scalar(ctx.conn, "SELECT 1 FROM orders WHERE num=? AND id<>?", (num, oid or "")):
        raise ApiError("bad_request", f"Заявка №{num} уже есть")
    f = (num, v_date(p, "date", required=False) or ctx.today, point["id"], point["route"],
         v_str(p, "comment", required=False, max_len=300), jdump(_order_lines(ctx.conn, p)))
    if oid:
        if _get_order(ctx.conn, oid)["status"] != "new":
            raise ApiError("bad_state", "Собранная заявка не редактируется — сначала «Вернуть в сборку»")
        # строки поменялись — отметки снимаем только с удалённых тортов
        keep = {ln["productId"] for ln in jload(f[5], [])}
        checked = [x for x in jload(_get_order(ctx.conn, oid)["checked"], []) if x in keep]
        ctx.conn.execute("UPDATE orders SET num=?,date=?,point_id=?,route=?,comment=?,lines=?,checked=? WHERE id=?",
                         (*f, jdump(checked), oid))
    else:
        oid = new_id("O")
        ctx.conn.execute("INSERT INTO orders(num,date,point_id,route,comment,lines,id,created_at) VALUES(?,?,?,?,?,?,?,?)",
                         (*f, oid, iso_now()))
    return {"order": _order(_get_order(ctx.conn, oid))}


@action("deleteOrder", write=True)
def delete_order(ctx: Ctx, p: dict) -> dict:
    o = _get_order(ctx.conn, v_id(p, "id"))
    if o["status"] != "new":
        raise ApiError("bad_state", "Собранную заявку удалить нельзя")
    ctx.conn.execute("DELETE FROM orders WHERE id=?", (o["id"],))
    return {}


@action("checkLine", write=True)
def check_line(ctx: Ctx, p: dict) -> dict:
    """Галочка «взял» у строки заявки. Видна всем — можно собирать вдвоём."""
    o = _get_order(ctx.conn, v_id(p, "id"))
    if o["status"] != "new":
        raise ApiError("bad_state", "Заявка уже собрана")
    pid = v_id(p, "productId")
    if pid not in {ln["productId"] for ln in jload(o["lines"], [])}:
        raise ApiError("not_found", "Этого торта нет в заявке")
    checked = [x for x in jload(o["checked"], []) if x != pid]
    if v_bool(p, "done", default=True):
        checked.append(pid)
    ctx.conn.execute("UPDATE orders SET checked=? WHERE id=?", (jdump(checked), o["id"]))
    return {"order": _order(_get_order(ctx.conn, o["id"]))}


@action("finishPick", write=True)
def finish_pick(ctx: Ctx, p: dict) -> dict:
    o = _get_order(ctx.conn, v_id(p, "id"))
    if o["status"] != "new":
        raise ApiError("bad_state", "Заявка уже собрана")
    left = {ln["productId"] for ln in jload(o["lines"], [])} - set(jload(o["checked"], []))
    if left:
        raise ApiError("bad_state", f"Не отмечено строк: {len(left)}")
    ctx.conn.execute("UPDATE orders SET status='picked', picker=?, boxes=?, picked_at=? WHERE id=?",
                     (v_str(p, "picker", min_len=1, max_len=60), v_int(p, "boxes", lo=0, hi=999, required=False, default=None),
                      iso_now(), o["id"]))
    return {"order": _order(_get_order(ctx.conn, o["id"]))}


@action("reopenPick", write=True)
def reopen_pick(ctx: Ctx, p: dict) -> dict:
    o = _get_order(ctx.conn, v_id(p, "id"))
    ctx.conn.execute("UPDATE orders SET status='new', picked_at=NULL WHERE id=?", (o["id"],))
    return {"order": _order(_get_order(ctx.conn, o["id"]))}


@action("savePlaces", write=True)
def save_places(ctx: Ctx, p: dict) -> dict:
    """Карта склада: [{productId, place}] — place пусто/0 убирает место (торт уйдёт в конец листа)."""
    n = 0
    for x in v_list(p, "places", max_items=500):
        if not isinstance(x, dict):
            raise ApiError("bad_request", "places: ожидается объект")
        pid = v_id(x, "productId")
        place = v_int(x, "place", lo=0, hi=MAX_PLACE, required=False)
        if not scalar(ctx.conn, "SELECT 1 FROM products WHERE id=?", (pid,)):
            raise ApiError("not_found", "Нет такого торта")
        if place:
            ctx.conn.execute("INSERT INTO places(product_id,place) VALUES(?,?) "
                             "ON CONFLICT(product_id) DO UPDATE SET place=excluded.place", (pid, place))
        else:
            ctx.conn.execute("DELETE FROM places WHERE product_id=?", (pid,))
        n += 1
    return {"saved": n, "places": _places(ctx.conn)}


@action("savePoint", write=True)
def save_point(ctx: Ctx, p: dict) -> dict:
    pid = v_id(p, "id", required=False)
    f = (v_str(p, "customer", min_len=1, max_len=80), v_str(p, "address", min_len=3, max_len=200),
         v_str(p, "route", required=False, max_len=40), v_str(p, "code", required=False, max_len=20),
         1 if v_bool(p, "active", default=True) else 0)
    if pid:
        if not scalar(ctx.conn, "SELECT 1 FROM points WHERE id=?", (pid,)):
            raise ApiError("not_found", "Нет такой точки")
        ctx.conn.execute("UPDATE points SET customer=?,address=?,route=?,code=?,active=? WHERE id=?", (*f, pid))
    else:
        pid = new_id("T")
        ctx.conn.execute("INSERT INTO points(customer,address,route,code,active,id,sort) VALUES(?,?,?,?,?,?,?)",
                         (*f, pid, _next_sort(ctx.conn, "points")))
    return {"point": _point(one(ctx.conn, "SELECT * FROM points WHERE id=?", (pid,)))}
