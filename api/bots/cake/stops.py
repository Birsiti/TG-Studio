# изменено 2026-10-18 13:00
"""Точки рейса: логист добавляет водителю заявки (№, заказчик, адрес) — это его маршрут.
Торты и ящики рейса считаются из заявок (sync_trip): при каждом изменении заявки и перед отгрузкой."""
from __future__ import annotations

from core import ApiError, Ctx, jdump, jload, rows, scalar, v_id, v_list
from bots.cake.base import _get_trip, _trip, action

MAX_STOPS = 60


def stops_of(conn, trip_ids: list[str]) -> dict[str, list[dict]]:
    if not trip_ids:
        return {}
    out: dict[str, list[dict]] = {}
    for r in rows(conn, f"SELECT o.*, p.customer, p.address FROM orders o JOIN points p ON p.id=o.point_id "
                        f"WHERE o.trip_id IN ({','.join('?' * len(trip_ids))}) ORDER BY o.stop, o.num", trip_ids):
        ls = jload(r["lines"], [])
        out.setdefault(r["trip_id"], []).append({
            "orderId": r["id"], "num": r["num"], "pointId": r["point_id"], "customer": r["customer"], "address": r["address"],
            "route": r["route"], "status": r["status"], "boxes": r["boxes"], "comment": r["comment"],
            "qty": sum(ln["qty"] + ln.get("bonus", 0) for ln in ls)})
    return out


def with_stops(conn, trips: list[dict]) -> list[dict]:
    by = stops_of(conn, [t["id"] for t in trips])
    for t in trips:
        t["stops"] = by.get(t["id"], [])
    return trips


def trip_out(conn, tid: str) -> dict:
    return with_stops(conn, [_trip(_get_trip(conn, tid))])[0]


def sync_trip(conn, tid: str | None) -> None:
    """Рейс на сборке с заявками: торты = сумма строк заявок (с бонусом), ящики = сумма ящиков собранных заявок."""
    if not tid:
        return
    t = _get_trip(conn, tid)
    rs = rows(conn, "SELECT * FROM orders WHERE trip_id=?", (tid,))
    if t["status"] != "draft" or not rs:
        return
    lines: dict[str, int] = {}
    boxes = 0
    for r in rs:
        for ln in jload(r["lines"], []):
            lines[ln["productId"]] = lines.get(ln["productId"], 0) + ln["qty"] + ln.get("bonus", 0)
        boxes += r["boxes"] or 0
    box = scalar(conn, "SELECT id FROM tara_types WHERE active=1 ORDER BY sort LIMIT 1")
    conn.execute("UPDATE trips SET lines=?, tara_out=? WHERE id=?",
                 (jdump([{"productId": k, "qty": v} for k, v in lines.items() if v]),
                  jdump([{"taraId": box, "qty": boxes}] if box and boxes else []), tid))


def check_ship(conn, tid: str) -> None:
    """Перед отгрузкой: все заявки рейса собраны и с тортами; торты и ящики — свежие из заявок."""
    rs = rows(conn, "SELECT * FROM orders WHERE trip_id=? ORDER BY stop, num", (tid,))
    left = [r["num"] for r in rs if r["status"] != "picked"]
    if left:
        raise ApiError("bad_state", "Не собраны: №" + ", №".join(left))
    bare = [r["num"] for r in rs if not jload(r["lines"], [])]
    if bare:
        raise ApiError("bad_state", "Внесите торты в заявки по фото: №" + ", №".join(bare))
    sync_trip(conn, tid)


@action("setTripOrders", write=True)
def set_trip_orders(ctx: Ctx, p: dict) -> dict:
    """Заявки рейса по порядку объезда. Только рейс на сборке; заявки — той же даты и не в другом рейсе."""
    t = _get_trip(ctx.conn, v_id(p, "id"))
    if t["status"] != "draft":
        raise ApiError("bad_state", "Отгруженный рейс не редактируется")
    ids = [x for x in dict.fromkeys(v_list(p, "orderIds", max_items=MAX_STOPS)) if isinstance(x, str)]
    found = {r["id"]: r for r in rows(ctx.conn, f"SELECT * FROM orders WHERE id IN ({','.join('?' * len(ids))})", ids)} if ids else {}
    for oid in ids:
        r = found.get(oid)
        if not r:
            raise ApiError("not_found", "Заявка не найдена")
        if r["date"] != t["date"]:
            raise ApiError("bad_request", f"Заявка №{r['num']} на другую дату")
        if r["trip_id"] and r["trip_id"] != t["id"]:
            raise ApiError("bad_state", f"Заявка №{r['num']} уже в другом рейсе")
    ctx.conn.execute("UPDATE orders SET trip_id=NULL, stop=0 WHERE trip_id=?", (t["id"],))
    for i, oid in enumerate(ids, 1):
        ctx.conn.execute("UPDATE orders SET trip_id=?, stop=? WHERE id=?", (t["id"], i, oid))
    if ids:
        sync_trip(ctx.conn, t["id"])
        ctx.conn.execute("UPDATE trips SET note=? WHERE id=? AND (note='' OR note LIKE 'Заявки: №%')",
                         ("Заявки: №" + ", №".join(found[i]["num"] for i in ids), t["id"]))
    return {"trip": trip_out(ctx.conn, t["id"])}
