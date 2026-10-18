# изменено 2026-10-18 16:00
"""Точки рейса: логист добавляет водителю заявки (№, заказчик, адрес) — это его маршрут.
Торты и ящики рейса считаются из заявок (sync_trip): при каждом изменении заявки и перед отгрузкой."""
from __future__ import annotations

from core import ApiError, Ctx, iso_now, jdump, jload, one, rows, scalar, v_id, v_int, v_list, v_str
from bots.cake.base import _get_trip, _trip, action
from bots.cake.schema import MAX_QTY

MAX_STOPS = 60
STOP_PHOTO = "Фото с точки"  # так называются фото водителя в файлах заявки — склад видит их в карточке заявки
MAX_STOP_PHOTOS = 6


def stops_of(conn, trip_ids: list[str]) -> dict[str, list[dict]]:
    if not trip_ids:
        return {}
    out: dict[str, list[dict]] = {}
    q = ",".join("?" * len(trip_ids))
    photos = {r["order_id"]: r["n"] for r in rows(conn, f"SELECT f.order_id, COUNT(*) n FROM order_files f JOIN orders o ON o.id=f.order_id "
                                                        f"WHERE o.trip_id IN ({q}) AND f.name=? GROUP BY f.order_id", (*trip_ids, STOP_PHOTO))}
    for r in rows(conn, f"SELECT o.*, p.customer, p.address, s.ok AS s_ok, s.lines AS s_lines, s.comment AS s_comment, s.at AS s_at "
                        f"FROM orders o JOIN points p ON p.id=o.point_id LEFT JOIN stop_reports s ON s.order_id=o.id "
                        f"WHERE o.trip_id IN ({q}) ORDER BY o.stop, o.num", trip_ids):
        ls = jload(r["lines"], [])
        out.setdefault(r["trip_id"], []).append({
            "orderId": r["id"], "num": r["num"], "pointId": r["point_id"], "customer": r["customer"], "address": r["address"],
            "route": r["route"], "status": r["status"], "boxes": r["boxes"], "comment": r["comment"], "lines": ls,
            "qty": sum(ln["qty"] + ln.get("bonus", 0) for ln in ls), "photos": photos.get(r["id"], 0),
            "report": {"ok": bool(r["s_ok"]), "lines": jload(r["s_lines"], []), "comment": r["s_comment"], "at": r["s_at"]}
            if r["s_at"] else None})
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


def _driver_stop(ctx: Ctx, oid: str) -> tuple[dict, dict]:
    """Заявка-точка рейса, который сейчас у водителя (в пути или ждёт приёмки); водитель — только своего рейса."""
    o = one(ctx.conn, "SELECT * FROM orders WHERE id=?", (oid,))
    if not o or not o["trip_id"]:
        raise ApiError("not_found", "Точка не найдена")
    t = _get_trip(ctx.conn, o["trip_id"])
    if getattr(ctx, "role", "admin") == "driver" and t["driver_id"] != scalar(ctx.conn, "SELECT id FROM staff WHERE tg_id=? AND tg_id<>''", (ctx.user,)):
        raise ApiError("forbidden", "Это не ваш рейс")
    if t["status"] not in ("shipped", "reported"):
        raise ApiError("bad_state", "Рейс не в пути")
    return o, t


@action("reportStop", write=True)
def report_stop(ctx: Ctx, p: dict) -> dict:
    """Водитель сдал точку: по строкам заявки — недостача, брак, пересорт (привезли не тот торт).
    Без строк — «всё сдано». Повторно — перезаписывает, пока склад не принял рейс."""
    o, t = _driver_stop(ctx, v_id(p, "orderId"))
    have = {}
    for ln in jload(o["lines"], []):
        have[ln["productId"]] = have.get(ln["productId"], 0) + ln["qty"] + ln.get("bonus", 0)
    out, seen = [], set()
    for x in v_list(p, "lines", max_items=200, required=False):
        if not isinstance(x, dict):
            raise ApiError("bad_request", "lines: ожидается объект")
        pid = v_id(x, "productId")
        if pid not in have:
            raise ApiError("not_found", "Этого торта нет в заявке")
        if pid in seen:
            raise ApiError("bad_request", "Торт в отчёте дважды")
        seen.add(pid)
        short, spoiled, resort = (v_int(x, k, lo=0, hi=MAX_QTY, required=False) or 0 for k in ("short", "spoiled", "resort"))
        if short + spoiled + resort > have[pid]:
            raise ApiError("bad_request", f"Замечаний больше, чем везли: {have[pid]} шт")
        to = v_id(x, "resortTo", required=False) if resort else None
        if to and not scalar(ctx.conn, "SELECT 1 FROM products WHERE id=?", (to,)):
            raise ApiError("not_found", "Нет такого торта")
        if short or spoiled or resort:
            out.append({"productId": pid, "short": short, "spoiled": spoiled, "resort": resort, **({"resortTo": to} if to else {})})
    comment = v_str(p, "comment", required=False, max_len=300)
    ok = not out and not comment
    ctx.conn.execute("INSERT INTO stop_reports(order_id,trip_id,ok,lines,comment,at) VALUES(?,?,?,?,?,?) "
                     "ON CONFLICT(order_id) DO UPDATE SET trip_id=excluded.trip_id, ok=excluded.ok, lines=excluded.lines, "
                     "comment=excluded.comment, at=excluded.at", (o["id"], t["id"], int(ok), jdump(out), comment, iso_now()))
    return {"trip": trip_out(ctx.conn, t["id"])}


@action("addStopPhoto", write=True)
def add_stop_photo(ctx: Ctx, p: dict) -> dict:
    """Фотофиксация на точке (брак, недостача, накладная с отметкой) — в файлы заявки, склад видит в карточке."""
    from bots.cake.order_files import save_file  # поздний импорт: order_files тянет picking
    o, _t = _driver_stop(ctx, v_id(p, "orderId"))
    if scalar(ctx.conn, "SELECT COUNT(*) FROM order_files WHERE order_id=? AND name=?", (o["id"], STOP_PHOTO)) >= MAX_STOP_PHOTOS:
        raise ApiError("bad_request", f"С точки уже {MAX_STOP_PHOTOS} фото")
    if not str(p.get("mime", "")).startswith("image/"):
        raise ApiError("bad_request", "Можно только фото")
    return {"file": save_file(ctx, o, p, STOP_PHOTO)}

