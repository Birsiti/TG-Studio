# изменено 2026-10-17 01:30
"""Оборотные ящики за водителями: выдано, вернул, утерял, долг."""
from __future__ import annotations

from core import ApiError, Ctx, rows, scalar, v_enum, v_id, v_int, v_str
from bots.cake.base import _add_tara, _staff, _tara, _tara_debt, action
from bots.cake.schema import MAX_QTY


@action("getTara")
def get_tara(ctx: Ctx, p: dict) -> dict:
    """Ящики по водителям: выдано, вернул, утеряно, долг; по виду тары — сколько на складе."""
    c = ctx.conn
    types = [_tara(r) for r in rows(c, "SELECT * FROM tara_types ORDER BY sort, name")]
    agg = {(r["driver_id"], r["tara_id"], r["kind"]): r["q"] for r in rows(
        c, "SELECT driver_id, tara_id, kind, SUM(qty) q FROM tara_moves GROUP BY driver_id, tara_id, kind")}
    for t in types:
        t["atDrivers"] = sum(q for (d, tid, k), q in agg.items() if tid == t["id"])
        t["lost"] = -sum(q for (d, tid, k), q in agg.items() if tid == t["id"] and k == "writeoff")
        t["inStock"] = t["total"] - t["atDrivers"] - t["lost"]
    drivers = []
    for d in rows(c, "SELECT * FROM staff WHERE role='driver' ORDER BY name"):
        per = {}
        for t in types:
            g = lambda k: agg.get((d["id"], t["id"], k), 0)  # noqa: E731
            per[t["id"]] = {"issued": g("out"), "returned": -g("back"), "lost": -g("writeoff"),
                            "debt": g("out") + g("back") + g("writeoff")}
        if d["active"] or any(v["debt"] or v["issued"] for v in per.values()):
            drivers.append({**_staff(d), "tara": per, "debt": sum(v["debt"] for v in per.values())})
    drivers.sort(key=lambda x: -x["debt"])
    hist = [{"id": r["id"], "date": r["date"], "taraId": r["tara_id"], "driverId": r["driver_id"], "kind": r["kind"],
             "qty": r["qty"], "cityId": r["city_id"], "tripId": r["trip_id"], "note": r["note"]}
            for r in rows(c, "SELECT * FROM tara_moves ORDER BY id DESC LIMIT 100")]
    return {"types": types, "drivers": drivers, "history": hist}


@action("taraMove", write=True)
def tara_move(ctx: Ctx, p: dict) -> dict:
    """Ящики вне рейса: kind=out — выдали водителю, back — вернул, writeoff — утеряны (списать долг)."""
    driver = v_id(p, "driverId")
    if not scalar(ctx.conn, "SELECT 1 FROM staff WHERE id=? AND role='driver'", (driver,)):
        raise ApiError("not_found", "Нет такого водителя")
    tid = v_id(p, "taraId")
    if not scalar(ctx.conn, "SELECT 1 FROM tara_types WHERE id=?", (tid,)):
        raise ApiError("not_found", "Нет такой тары")
    q = v_int(p, "qty", lo=1, hi=MAX_QTY)
    kind = v_enum(p, "kind", ("out", "back", "writeoff"))
    debt = _tara_debt(ctx.conn).get((driver, tid), 0)
    if kind != "out" and q > debt:
        raise ApiError("bad_request", f"У водителя на руках только {debt}")
    _add_tara(ctx, ctx.today, tid, driver, kind, q, note=v_str(p, "note", required=False, max_len=200))
    return {"debt": _tara_debt(ctx.conn).get((driver, tid), 0)}
