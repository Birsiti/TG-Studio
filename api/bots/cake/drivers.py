# изменено 2026-10-17 15:00
"""Спидометр рейса (выезд / возврат) и статистика по водителям за период."""
from __future__ import annotations

from core import ApiError, Ctx, add_days, jload, rows, scalar, v_date, v_enum, v_id, v_int
from bots.cake.base import _get_trip, _tara_debt, _trip, action

MAX_ODO = 9_999_999   # км на одометре
MAX_RUN = 3000        # км за один рейс — больше значит опечатка


@action("setOdometer", write=True)
def set_odometer(ctx: Ctx, p: dict) -> dict:
    """Показание спидометра: kind=out — на выезде, back — при возврате. Водитель — только свой рейс."""
    t = _get_trip(ctx.conn, v_id(p, "id"))
    if getattr(ctx, "role", "admin") == "driver" and t["driver_id"] != scalar(ctx.conn, "SELECT id FROM staff WHERE tg_id=? AND tg_id<>''", (ctx.user,)):
        raise ApiError("forbidden", "Это не ваш рейс")
    if t["status"] not in ("shipped", "reported", "closed"):
        raise ApiError("bad_state", "Рейс ещё не отгружен")
    kind = v_enum(p, "kind", ("out", "back"))
    km = v_int(p, "km", lo=0, hi=MAX_ODO)
    out = km if kind == "out" else t["odo_out"]
    back = km if kind == "back" else t["odo_back"]
    if kind == "back" and out is None:
        raise ApiError("bad_request", "Сначала укажите спидометр на выезде")
    if out is not None and back is not None and not 0 <= back - out <= MAX_RUN:
        raise ApiError("bad_request", f"Пробег {back - out} км — проверьте показания")
    ctx.conn.execute(f"UPDATE trips SET odo_{kind}=? WHERE id=?", (km, t["id"]))
    return {"trip": _trip(_get_trip(ctx.conn, t["id"]))}


def _report_back(report: str) -> dict[str, int]:
    """Сколько водитель заявил к возврату (целые + брак) по торту — из его отчёта."""
    rep = jload(report, {}) if report else {}
    return {r["productId"]: r.get("back", 0) + r.get("spoiled", 0) for r in (rep or {}).get("returns", [])}


@action("getDriverStats")
def get_driver_stats(ctx: Ctx, p: dict) -> dict:
    """По водителю за период: рейсы, точки, км по спидометру, отгружено, возвраты, брак,
    недостача (заявил в отчёте больше, чем принял склад), ящики на руках, км между рейсами."""
    c = ctx.conn
    to = v_date(p, "to", required=False) or ctx.today
    frm = v_date(p, "from", required=False) or add_days(to, -29)
    trips = rows(c, "SELECT * FROM trips WHERE driver_id IS NOT NULL AND status IN ('shipped','reported','closed') "
                    "AND date BETWEEN ? AND ? ORDER BY driver_id, date, num", (frm, to))
    points = {r["trip_id"]: r["n"] for r in rows(c, "SELECT trip_id, COUNT(DISTINCT point_id) n FROM orders WHERE trip_id IS NOT NULL GROUP BY trip_id")}
    debt = _tara_debt(c)
    out: dict[str, dict] = {}
    last_back: dict[str, int] = {}
    for t in trips:
        d = out.setdefault(t["driver_id"], {"driverId": t["driver_id"], "trips": 0, "points": 0, "km": 0, "kmGap": 0, "noOdo": 0,
                                            "shipped": 0, "back": 0, "spoiled": 0, "shortage": 0, "taraDebt": 0})
        d["trips"] += 1
        d["points"] += points.get(t["id"], 1)  # рейс без заявок — одна точка (город)
        lines = jload(t["lines"], [])
        d["shipped"] += sum(ln["qty"] for ln in lines)
        if t["odo_out"] is not None and t["odo_back"] is not None:
            d["km"] += t["odo_back"] - t["odo_out"]
        else:
            d["noOdo"] += 1
        prev = last_back.get(t["driver_id"])  # пробег между рейсами: выезд этого − возврат прошлого
        if prev is not None and t["odo_out"] is not None and t["odo_out"] > prev:
            d["kmGap"] += t["odo_out"] - prev
        if t["odo_back"] is not None:
            last_back[t["driver_id"]] = t["odo_back"]
        if t["status"] == "closed":
            d["back"] += sum(ln.get("back", 0) for ln in lines)
            d["spoiled"] += sum(ln.get("spoiled", 0) for ln in lines)
            said = _report_back(t["report"])
            got = {ln["productId"]: ln.get("back", 0) + ln.get("spoiled", 0) for ln in lines}
            d["shortage"] += sum(max(0, q - got.get(pid, 0)) for pid, q in said.items())
    for (drv, _tid), q in debt.items():
        if drv in out:
            out[drv]["taraDebt"] += q
    return {"from": frm, "to": to, "drivers": sorted(out.values(), key=lambda d: -d["trips"])}
