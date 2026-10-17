# изменено 2026-10-17 16:00
"""Сборка по кругу: заявки точек на дату, лист с галочками, места тортов на складе, точки разгрузки.

Остаток сборка не трогает — торты списываются отгрузкой рейса (trips.py).
Порядок строк (по месту на складе) считает экран: места отдаются картой productId → №.
"""
from __future__ import annotations

from core import ApiError, Ctx, add_days, iso_now, jdump, jload, new_id, one, rows, scalar, v_bool, v_date, v_id, v_int, v_list, v_str
from bots.cake.base import _get_trip, _next_sort, _trip, action
from bots.cake.orders_seed import route_city
from bots.cake.schema import MAX_LINES, MAX_QTY

MAX_PLACE = 9999


def _order(r) -> dict:
    return {"id": r["id"], "num": r["num"], "date": r["date"], "pointId": r["point_id"], "route": r["route"],
            "comment": r["comment"], "lines": jload(r["lines"], []), "checked": jload(r["checked"], []),
            "status": r["status"], "picker": r["picker"], "boxes": r["boxes"], "pickedAt": r["picked_at"], "tripId": r["trip_id"]}


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
    files: dict[str, list] = {}
    for f in rows(ctx.conn, "SELECT o.* FROM order_files o JOIN orders r ON r.id=o.order_id WHERE r.date=? ORDER BY o.created_at", (day,)):
        files.setdefault(f["order_id"], []).append({"id": f["id"], "name": f["name"], "mime": f["mime"], "size": f["size"]})
    return {"date": day, "dates": dates, "orders": [dict(_order(r), files=files.get(r["id"], [])) for r in rs], "points": [_point(r) for r in points],
            "routes": sorted({r["route"] for r in points if r["route"] and r["active"]}), "places": _places(ctx.conn)}


def _order_lines(conn, p: dict) -> list[dict]:
    out: dict[str, dict] = {}
    for x in v_list(p, "lines", max_items=MAX_LINES, required=False):
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
    return list(out.values())  # пусто можно: заявка «по фото», строки внесут позже


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
    from bots.cake.order_files import drop_files  # поздний импорт: order_files пользуется помощниками отсюда
    drop_files(ctx.conn, o["id"])
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
    picker = v_str(p, "picker", required=False, max_len=60)  # смена собирает вместе — не обязательно
    boxes = v_int(p, "boxes", lo=0, hi=999, required=False, default=None)
    lines = [ln["productId"] for ln in jload(o["lines"], [])]
    if v_bool(p, "all", default=False):  # «Всё уже собрано» — отметить все строки разом
        ctx.conn.execute("UPDATE orders SET checked=? WHERE id=?", (jdump(lines), o["id"]))
    left = set(lines) - set(jload(scalar(ctx.conn, "SELECT checked FROM orders WHERE id=?", (o["id"],)), []))
    if left:
        raise ApiError("bad_state", f"Не отмечено строк: {len(left)}")
    ctx.conn.execute("UPDATE orders SET status='picked', picker=?, boxes=?, picked_at=? WHERE id=?",
                     (picker, boxes, iso_now(), o["id"]))
    return {"order": _order(_get_order(ctx.conn, o["id"]))}


@action("reopenPick", write=True)
def reopen_pick(ctx: Ctx, p: dict) -> dict:
    o = _get_order(ctx.conn, v_id(p, "id"))
    if o["trip_id"]:
        raise ApiError("bad_state", "Заявка уже в рейсе — сначала отмените рейс")
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


@action("routeToTrip", write=True)
def route_to_trip(ctx: Ctx, p: dict) -> dict:
    """Собранные заявки маршрута на дату → черновик рейса водителю (торты с бонусами, ящики — сумма по заявкам).
    Дальше обычная цепочка рейса: «Отгрузить» спишет остаток и запишет ящики на водителя."""
    day, route = v_date(p, "date"), v_str(p, "route", min_len=1, max_len=40)
    rs = rows(ctx.conn, "SELECT * FROM orders WHERE date=? AND route=? AND trip_id IS NULL ORDER BY num", (day, route))
    if not rs:
        raise ApiError("not_found", "Нет заявок маршрута без рейса")
    left = [r["num"] for r in rs if r["status"] != "picked"]
    if left:
        raise ApiError("bad_state", "Не собраны: №" + ", №".join(left))
    bare = [r["num"] for r in rs if not jload(r["lines"], [])]
    if bare:  # рейс списывает остаток по строкам — без них отгрузить нечего
        raise ApiError("bad_state", "Внесите торты в заявки по фото: №" + ", №".join(bare))
    driver = v_id(p, "driverId", required=False)
    if driver and not scalar(ctx.conn, "SELECT 1 FROM staff WHERE id=? AND role='driver'", (driver,)):
        raise ApiError("not_found", "Нет такого водителя")
    lines: dict[str, int] = {}
    boxes = 0
    for r in rs:
        for ln in jload(r["lines"], []):
            lines[ln["productId"]] = lines.get(ln["productId"], 0) + ln["qty"] + ln.get("bonus", 0)
        boxes += r["boxes"] or 0
    box = scalar(ctx.conn, "SELECT id FROM tara_types WHERE active=1 ORDER BY sort LIMIT 1")
    tid, num = new_id("R"), (scalar(ctx.conn, "SELECT MAX(num) FROM trips") or 0) + 1
    ctx.conn.execute("INSERT INTO trips(id,num,date,city_id,driver_id,status,lines,tara_out,note,created_at) "
                     "VALUES(?,?,?,?,?,'draft',?,?,?,?)",
                     (tid, num, day, route_city(ctx.conn, route), driver,
                      jdump([{"productId": k, "qty": v} for k, v in lines.items()]),
                      jdump([{"taraId": box, "qty": boxes}] if box and boxes else []),
                      "Заявки: №" + ", №".join(r["num"] for r in rs), iso_now()))
    ctx.conn.execute(f"UPDATE orders SET trip_id=? WHERE id IN ({','.join('?' * len(rs))})", (tid, *[r["id"] for r in rs]))
    return {"trip": _trip(_get_trip(ctx.conn, tid)), "orders": len(rs)}
