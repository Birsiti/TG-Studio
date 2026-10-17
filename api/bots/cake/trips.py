# изменено 2026-10-17 04:00
"""Рейсы: сборка → отгрузка → отчёт водителя → приёмка; рейсы водителя."""
from __future__ import annotations

from core import ApiError, Ctx, add_days, iso_now, jdump, jload, new_id, one, rows, scalar, v_date, v_id, v_int, v_list, v_str
from bots.cake.base import (_add_move, _add_tara, _check_stock, _get_trip, _lines, _restricted, _staff, _tara_debt,
                            _tara_lines, _trip, action)
from bots.cake.schema import MAX_LINES, MAX_QTY


@action("getTrips")
def get_trips(ctx: Ctx, p: dict) -> dict:
    to = v_date(p, "to", required=False) or add_days(ctx.today, 7)
    frm = v_date(p, "from", required=False) or add_days(ctx.today, -7)
    rs = rows(ctx.conn, "SELECT * FROM trips WHERE (date BETWEEN ? AND ?) OR status IN ('draft','shipped','reported') "
                        "ORDER BY date DESC, num DESC", (frm, to))
    return {"trips": [_trip(r) for r in rs]}


def _trip_fields(ctx: Ctx, p: dict) -> tuple:
    city = v_id(p, "cityId")
    if not scalar(ctx.conn, "SELECT 1 FROM cities WHERE id=?", (city,)):
        raise ApiError("not_found", "Нет такого города")
    driver = v_id(p, "driverId", required=False)
    if driver and not scalar(ctx.conn, "SELECT 1 FROM staff WHERE id=? AND role='driver'", (driver,)):
        raise ApiError("not_found", "Нет такого водителя")
    return (v_date(p, "date", required=False) or ctx.today, city, driver,
            jdump(_lines(ctx.conn, p, allow_empty=True)), jdump(_tara_lines(ctx.conn, p, "taraOut")),
            v_str(p, "note", required=False, max_len=300))


@action("saveTrip", write=True)
def save_trip(ctx: Ctx, p: dict) -> dict:
    tid = v_id(p, "id", required=False)
    f = _trip_fields(ctx, p)
    if tid:
        if _get_trip(ctx.conn, tid)["status"] != "draft":
            raise ApiError("bad_state", "Отгруженный рейс не редактируется")
        ctx.conn.execute("UPDATE trips SET date=?,city_id=?,driver_id=?,lines=?,tara_out=?,note=? WHERE id=?", (*f, tid))
    else:
        tid = new_id("R")
        num = (scalar(ctx.conn, "SELECT MAX(num) FROM trips") or 0) + 1
        ctx.conn.execute("INSERT INTO trips(date,city_id,driver_id,lines,tara_out,note,id,num,status,created_at) "
                         "VALUES(?,?,?,?,?,?,?,?,'draft',?)", (*f, tid, num, iso_now()))
    return {"trip": _trip(_get_trip(ctx.conn, tid))}


@action("shipTrip", write=True)
def ship_trip(ctx: Ctx, p: dict) -> dict:
    t = _get_trip(ctx.conn, v_id(p, "id"))
    if t["status"] != "draft":
        raise ApiError("bad_state", "Рейс уже отгружен")
    lines = jload(t["lines"], [])
    if not lines:
        raise ApiError("bad_request", "В рейсе нет тортов")
    if not t["driver_id"]:
        raise ApiError("bad_request", "Не выбран водитель")
    _check_stock(ctx.conn, lines)
    for ln in lines:
        _add_move(ctx, "ship", ctx.today, ln["productId"], -ln["qty"], city=t["city_id"], trip=t["id"])
    for ln in jload(t["tara_out"], []):
        _add_tara(ctx, ctx.today, ln["taraId"], t["driver_id"], "out", ln["qty"], city=t["city_id"], trip=t["id"])
    ctx.conn.execute("UPDATE trips SET status='shipped', shipped_at=? WHERE id=?", (iso_now(), t["id"]))
    return {"trip": _trip(_get_trip(ctx.conn, t["id"]))}


@action("cancelTrip", write=True)
def cancel_trip(ctx: Ctx, p: dict) -> dict:
    t = _get_trip(ctx.conn, v_id(p, "id"))
    if t["status"] != "draft":
        raise ApiError("bad_state", "Отменить можно только рейс на сборке")
    ctx.conn.execute("UPDATE trips SET status='cancelled' WHERE id=?", (t["id"],))
    ctx.conn.execute("UPDATE orders SET trip_id=NULL WHERE trip_id=?", (t["id"],))  # заявки маршрута снова можно отгрузить
    return {"trip": _trip(_get_trip(ctx.conn, t["id"]))}


def _returns(ctx: Ctx, p: dict, trip: dict) -> list[dict]:
    """[{productId, back, spoiled}] — не больше, чем уехало в рейсе."""
    shipped = {ln["productId"]: ln["qty"] for ln in jload(trip["lines"], [])}
    out, seen = [], set()
    for x in v_list(p, "returns", max_items=MAX_LINES, required=False):
        if not isinstance(x, dict):
            raise ApiError("bad_request", "returns: ожидается объект")
        pid = v_id(x, "productId")
        back = v_int(x, "back", hi=MAX_QTY, required=False)
        spoiled = v_int(x, "spoiled", hi=MAX_QTY, required=False)
        if pid not in shipped:
            raise ApiError("bad_request", "Этого торта не было в рейсе")
        if pid in seen:  # повтор строки удвоил бы возврат на остаток
            raise ApiError("bad_request", "Торт в возврате дважды")
        seen.add(pid)
        if back + spoiled > shipped[pid]:
            raise ApiError("bad_request", "Возврат больше, чем уехало")
        if back or spoiled:
            out.append({"productId": pid, "back": back, "spoiled": spoiled})
    return out


@action("reportTrip", write=True)
def report_trip(ctx: Ctx, p: dict) -> dict:
    """Водитель: рейс развезён, вот что везу обратно."""
    t = _get_trip(ctx.conn, v_id(p, "id"))
    if getattr(ctx, "role", "admin") == "driver" and t["driver_id"] != scalar(ctx.conn, "SELECT id FROM staff WHERE tg_id=? AND tg_id<>''", (ctx.user,)):
        raise ApiError("forbidden", "Это не ваш рейс")
    if t["status"] not in ("shipped", "reported"):
        raise ApiError("bad_state", "Рейс не в пути")
    report = {"returns": _returns(ctx, p, t), "taraBack": _tara_lines(ctx.conn, p, "taraBack"),
              "comment": v_str(p, "comment", required=False, max_len=300)}
    ctx.conn.execute("UPDATE trips SET status='reported', report=?, reported_at=? WHERE id=?", (jdump(report), iso_now(), t["id"]))
    return {"trip": _trip(_get_trip(ctx.conn, t["id"]))}


@action("closeTrip", write=True)
def close_trip(ctx: Ctx, p: dict) -> dict:
    """Кладовщик принимает рейс: годные возвраты — на остаток, брак — в списание
    (уже вычтен отгрузкой, повторно не пишем), тара — снимается с долга города."""
    t = _get_trip(ctx.conn, v_id(p, "id"))
    if t["status"] not in ("shipped", "reported"):
        raise ApiError("bad_state", "Рейс не в пути")
    rets = _returns(ctx, p, t)
    tara_back = _tara_lines(ctx.conn, p, "taraBack")
    debt = _tara_debt(ctx.conn)
    for ln in tara_back:  # как в taraMove: вернуть можно не больше, чем на руках у водителя
        has = debt.get((t["driver_id"], ln["taraId"]), 0)
        if ln["qty"] > has:
            raise ApiError("bad_request", f"У водителя на руках только {has}")
    for r in rets:
        if r["back"]:
            _add_move(ctx, "return", ctx.today, r["productId"], r["back"], city=t["city_id"], trip=t["id"])
    for ln in tara_back:
        _add_tara(ctx, ctx.today, ln["taraId"], t["driver_id"], "back", ln["qty"], city=t["city_id"], trip=t["id"])
    lines = []
    by = {r["productId"]: r for r in rets}
    for ln in jload(t["lines"], []):
        r = by.get(ln["productId"], {})
        back, spoiled = r.get("back", 0), r.get("spoiled", 0)
        lines.append({**ln, "back": back, "spoiled": spoiled, "delivered": ln["qty"] - back - spoiled})
    ctx.conn.execute("UPDATE trips SET status='closed', lines=?, tara_back=?, closed_at=? WHERE id=?",
                     (jdump(lines), jdump(tara_back), iso_now(), t["id"]))
    return {"trip": _trip(_get_trip(ctx.conn, t["id"]))}


@action("getMyTrips")
def get_my_trips(ctx: Ctx, p: dict) -> dict:
    """Рейсы водителя: по tg_id, а в открытом демо — по driverId из запроса."""
    me = ctx.user and one(ctx.conn, "SELECT * FROM staff WHERE tg_id=? AND tg_id<>'' AND role='driver'", (ctx.user,))
    did = me["id"] if me else (None if _restricted() else v_id(p, "driverId", required=False))
    if not did:
        return {"driver": None, "trips": []}
    rs = rows(ctx.conn, "SELECT * FROM trips WHERE driver_id=? AND status<>'cancelled' AND "
                        "(status IN ('draft','shipped','reported') OR date>=?) ORDER BY date DESC, num DESC LIMIT 30",
              (did, add_days(ctx.today, -14)))
    drv = one(ctx.conn, "SELECT * FROM staff WHERE id=?", (did,))
    debt = [{"taraId": tid, "qty": q} for (d, tid), q in _tara_debt(ctx.conn).items() if d == did and q]
    return {"driver": _staff(drv) if drv else None, "trips": [_trip(r) for r in rs], "taraDebt": debt}
