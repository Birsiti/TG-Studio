# изменено 2026-10-25 18:30
"""Рейсы: сборка → отгрузка → отчёт водителя → приёмка; рейсы водителя."""
from __future__ import annotations

from core import ApiError, Ctx, add_days, iso_now, jdump, jload, new_id, one, rows, scalar, v_date, v_id, v_int, v_list, v_str
from bots.cake.base import (_add_move, _add_tara, _check_stock, _get_trip, _lines, _restricted, _staff, _tara_debt,
                            _tara_lines, _trip, action)
from bots.cake.schema import MAX_LINES, MAX_QTY
from bots.cake.orders_seed import route_city
from bots.cake.stops import check_ship, sync_trip, trip_out, with_stops


@action("getTrips")
def get_trips(ctx: Ctx, p: dict) -> dict:
    to = v_date(p, "to", required=False) or add_days(ctx.today, 7)
    frm = v_date(p, "from", required=False) or add_days(ctx.today, -7)
    rs = rows(ctx.conn, "SELECT * FROM trips WHERE (date BETWEEN ? AND ?) OR status IN ('draft','shipped','reported') "
                        "ORDER BY date DESC, num DESC", (frm, to))
    return {"trips": with_stops(ctx.conn, [_trip(r) for r in rs])}


def default_car(conn, driver_id: str | None) -> str:
    """Машина по умолчанию — та, на которой водитель ездил в последнем рейсе, иначе его закреплённая."""
    if not driver_id:
        return ""
    last = scalar(conn, "SELECT car FROM trips WHERE driver_id=? AND car<>'' AND status<>'cancelled' ORDER BY date DESC, num DESC LIMIT 1", (driver_id,))
    return last or scalar(conn, "SELECT car FROM staff WHERE id=?", (driver_id,)) or ""


def _trip_fields(ctx: Ctx, p: dict) -> tuple:
    route = v_str(p, "route", required=False, max_len=40)  # без города — направление по маршруту заявок
    city = v_id(p, "cityId", required=not route) or route_city(ctx.conn, route)
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
        old = _get_trip(ctx.conn, tid)
        ctx.conn.execute("UPDATE trips SET date=?,city_id=?,driver_id=?,lines=?,tara_out=?,note=? WHERE id=?", (*f, tid))
        if f[2] != old["driver_id"] or not old["car"]:
            ctx.conn.execute("UPDATE trips SET car=? WHERE id=?", (v_str(p, "car", required=False, max_len=80) or default_car(ctx.conn, f[2]), tid))
    else:
        tid = new_id("R")
        num = (scalar(ctx.conn, "SELECT MAX(num) FROM trips") or 0) + 1
        ctx.conn.execute("INSERT INTO trips(date,city_id,driver_id,lines,tara_out,note,id,num,status,created_at) "
                         "VALUES(?,?,?,?,?,?,?,?,'draft',?)", (*f, tid, num, iso_now()))
        ctx.conn.execute("UPDATE trips SET car=? WHERE id=?", (v_str(p, "car", required=False, max_len=80) or default_car(ctx.conn, f[2]), tid))
    sync_trip(ctx.conn, tid)  # с заявками торты и ящики — из заявок, не из формы
    return {"trip": trip_out(ctx.conn, tid)}


@action("shipTrip", write=True)
def ship_trip(ctx: Ctx, p: dict) -> dict:
    t = _get_trip(ctx.conn, v_id(p, "id"))
    if t["status"] != "draft":
        raise ApiError("bad_state", "Рейс уже отгружен")
    check_ship(ctx.conn, t["id"])
    t = _get_trip(ctx.conn, t["id"])
    lines = jload(t["lines"], [])
    if not lines:
        raise ApiError("bad_request", "В рейсе нет тортов")
    if not t["driver_id"]:
        raise ApiError("bad_request", "Не выбран водитель")
    _check_stock(ctx.conn, lines)
    # водитель на погрузке — сдаёт ящики с прошлых рейсов (отдельно на склад он не поедет)
    back = _tara_lines(ctx.conn, p, "taraBack")
    debt = _tara_debt(ctx.conn)
    for ln in back:
        has = debt.get((t["driver_id"], ln["taraId"]), 0)
        if ln["qty"] > has:
            raise ApiError("bad_request", f"У водителя на руках только {has}")
    for ln in back:
        _add_tara(ctx, ctx.today, ln["taraId"], t["driver_id"], "back", ln["qty"], city=t["city_id"],
                  note=f"Сдал при погрузке рейса №{t['num']}")
    for ln in lines:
        _add_move(ctx, "ship", ctx.today, ln["productId"], -ln["qty"], city=t["city_id"], trip=t["id"])
    for ln in jload(t["tara_out"], []):
        _add_tara(ctx, ctx.today, ln["taraId"], t["driver_id"], "out", ln["qty"], city=t["city_id"], trip=t["id"])
    ctx.conn.execute("UPDATE trips SET status='shipped', shipped_at=? WHERE id=?", (iso_now(), t["id"]))
    return {"trip": trip_out(ctx.conn, t["id"])}


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
    """Рейсы водителя: по tg_id; руководитель и открытое демо — по driverId из запроса (посмотреть экран любого водителя)."""
    me = ctx.user and one(ctx.conn, "SELECT * FROM staff WHERE tg_id=? AND tg_id<>'' AND role='driver'", (ctx.user,))
    did = me["id"] if me else (v_id(p, "driverId", required=False) if ctx.role == "admin" or not _restricted() else None)
    if not did:
        return {"driver": None, "trips": []}
    rs = rows(ctx.conn, "SELECT * FROM trips WHERE driver_id=? AND status<>'cancelled' AND "
                        "(status IN ('draft','shipped','reported') OR date>=?) ORDER BY date DESC, num DESC LIMIT 30",
              (did, add_days(ctx.today, -14)))
    drv = one(ctx.conn, "SELECT * FROM staff WHERE id=?", (did,))
    debt = [{"taraId": tid, "qty": q} for (d, tid), q in _tara_debt(ctx.conn).items() if d == did and q]
    return {"driver": _staff(drv) if drv else None, "trips": with_stops(ctx.conn, [_trip(r) for r in rs]), "taraDebt": debt}


@action("getCrew")
def get_crew(ctx: Ctx, p: dict) -> dict:
    """Кого посадить в рейс: у каждого водителя — когда ездил последним, на какой машине, сколько раз на этом направлении,
    на смене ли он и не занят ли другим рейсом в этот день. Плюс парк: все машины, что встречались у водителей и в рейсах."""
    c = ctx.conn
    day = v_date(p, "date", required=False) or ctx.today
    city = v_id(p, "cityId", required=False)
    skip = v_id(p, "tripId", required=False)  # текущий рейс не считаем «занятостью»
    on_shift = {r["staff_id"] for r in rows(c, "SELECT staff_id FROM shifts WHERE date=?", (day,))}
    busy: dict[str, list[int]] = {}
    for r in rows(c, "SELECT id, num, driver_id FROM trips WHERE date=? AND driver_id IS NOT NULL AND status NOT IN ('cancelled','closed')", (day,)):
        if r["id"] != skip:
            busy.setdefault(r["driver_id"], []).append(r["num"])
    out, cars = [], {}
    for s in rows(c, "SELECT * FROM staff WHERE role='driver' AND active=1 ORDER BY name"):
        last = one(c, "SELECT date, car, city_id FROM trips WHERE driver_id=? AND status<>'cancelled' ORDER BY date DESC, num DESC LIMIT 1", (s["id"],))
        here = rows(c, "SELECT date FROM trips WHERE driver_id=? AND city_id=? AND status<>'cancelled' ORDER BY date DESC", (s["id"], city)) if city else []
        out.append({**_staff(s), "carDefault": default_car(c, s["id"]), "lastDate": last["date"] if last else None,
                    "lastCar": last["car"] if last else "", "lastCityId": last["city_id"] if last else None,
                    "onRoute": len(here), "lastOnRoute": here[0]["date"] if here else None,
                    "onShift": s["id"] in on_shift, "busy": busy.get(s["id"], [])})
        if s["car"]:
            cars.setdefault(s["car"], s["name"])
    for r in rows(c, "SELECT car, driver_id FROM trips WHERE car<>'' ORDER BY date DESC, num DESC LIMIT 200"):
        cars.setdefault(r["car"], scalar(c, "SELECT name FROM staff WHERE id=?", (r["driver_id"],)) or "")
    return {"drivers": out, "cars": [{"car": k, "who": v} for k, v in cars.items()]}


@action("setTripCrew", write=True)
def set_trip_crew(ctx: Ctx, p: dict) -> dict:
    """Водитель и машина рейса. Водителя можно менять до отгрузки (ящики и остаток привязаны к нему после), машину — пока рейс не закрыт."""
    t = _get_trip(ctx.conn, v_id(p, "id"))
    if t["status"] in ("closed", "cancelled"):
        raise ApiError("bad_state", "Рейс уже закрыт")
    driver = t["driver_id"]
    if "driverId" in p:
        new = v_id(p, "driverId", required=False) or None
        if new != driver and t["status"] != "draft":
            raise ApiError("bad_state", "Водителя меняют до отгрузки: ящики после неё записаны на него")
        if new and not scalar(ctx.conn, "SELECT 1 FROM staff WHERE id=? AND role='driver' AND active=1", (new,)):
            raise ApiError("not_found", "Нет такого водителя")
        driver = new
    car = v_str(p, "car", required=False, max_len=80) if "car" in p else (default_car(ctx.conn, driver) if driver != t["driver_id"] else t["car"])
    ctx.conn.execute("UPDATE trips SET driver_id=?, car=? WHERE id=?", (driver, car, t["id"]))
    return {"trip": trip_out(ctx.conn, t["id"])}
