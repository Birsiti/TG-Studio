# изменено 2026-10-18 16:00
"""Фото и файлы заявок (снимок бумажной заявки, PDF от точки) и «отметить все заявки дня собранными».

Файл лежит на диске iMac: TGS_DATA_DIR/cake-files/<id>; в базе — имя, тип, размер.
Изображения экран уже сжимает до ~1600 px, так что держим до 3 МБ на файл."""
from __future__ import annotations

import base64
import binascii

from core import DATA_DIR, ApiError, Ctx, iso_now, jdump, jload, new_id, one, rows, scalar, v_date, v_id, v_str
from bots.cake.base import action
from bots.cake.picking import _get_order, _order

FILES_DIR = DATA_DIR / "cake-files"
MIMES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
MAX_FILE = 3 * 1024 * 1024
MAX_PER_ORDER = 10


def _path(fid: str):
    return FILES_DIR / fid


def drop_files(conn, order_id: str) -> None:
    for r in rows(conn, "SELECT id FROM order_files WHERE order_id=?", (order_id,)):
        _path(r["id"]).unlink(missing_ok=True)
    conn.execute("DELETE FROM order_files WHERE order_id=?", (order_id,))


@action("addOrderFile", write=True)
def add_order_file(ctx: Ctx, p: dict) -> dict:
    return {"file": save_file(ctx, _get_order(ctx.conn, v_id(p, "orderId")), p)}


def save_file(ctx: Ctx, o: dict, p: dict, default_name: str = "") -> dict:
    """Файл к заявке из {name, mime, data(base64)}: проверки, диск, строка в order_files."""
    mime = v_str(p, "mime", max_len=40)
    if mime not in MIMES:
        raise ApiError("bad_request", "Можно фото (JPEG, PNG) или PDF")
    raw = p.get("data")
    if not isinstance(raw, str) or not raw:
        raise ApiError("bad_request", "Нет файла")
    try:
        data = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError):
        raise ApiError("bad_request", "Файл повреждён")
    if not data or len(data) > MAX_FILE:
        raise ApiError("bad_request", "Файл больше 3 МБ")
    if scalar(ctx.conn, "SELECT COUNT(*) FROM order_files WHERE order_id=?", (o["id"],)) >= MAX_PER_ORDER:
        raise ApiError("bad_request", f"У заявки уже {MAX_PER_ORDER} файлов")
    fid = new_id("F")
    FILES_DIR.mkdir(parents=True, exist_ok=True)
    _path(fid).write_bytes(data)
    name = default_name or v_str(p, "name", required=False, max_len=120) or ("Фото" if mime.startswith("image/") else "Файл")
    ctx.conn.execute("INSERT INTO order_files(id,order_id,name,mime,size,created_at) VALUES(?,?,?,?,?,?)",
                     (fid, o["id"], name, mime, len(data), iso_now()))
    return {"id": fid, "name": name, "mime": mime, "size": len(data)}


@action("getOrderFile")
def get_order_file(ctx: Ctx, p: dict) -> dict:
    f = one(ctx.conn, "SELECT * FROM order_files WHERE id=?", (v_id(p, "id"),))
    path = f and _path(f["id"])
    if not f or not path.exists():
        raise ApiError("not_found", "Файл не найден")
    return {"file": {"id": f["id"], "name": f["name"], "mime": f["mime"], "size": f["size"],
                     "data": base64.b64encode(path.read_bytes()).decode()}}


@action("deleteOrderFile", write=True)
def delete_order_file(ctx: Ctx, p: dict) -> dict:
    f = one(ctx.conn, "SELECT * FROM order_files WHERE id=?", (v_id(p, "id"),))
    if not f:
        raise ApiError("not_found", "Файл не найден")
    ctx.conn.execute("DELETE FROM order_files WHERE id=?", (f["id"],))
    _path(f["id"]).unlink(missing_ok=True)
    return {}


@action("finishAll", write=True)
def finish_all(ctx: Ctx, p: dict) -> dict:
    """Все несобранные заявки дня (и маршрута) — собраны: собирали по бумаге, в приложении не отмечали.
    Ящики не известны — остаются пустыми, их можно указать при отгрузке рейса."""
    day = v_date(p, "date")
    route = v_str(p, "route", required=False, max_len=40)
    q = "SELECT * FROM orders WHERE date=? AND status='new'" + (" AND route=?" if route else "")
    rs = rows(ctx.conn, q, (day, route) if route else (day,))
    for r in rs:
        ctx.conn.execute("UPDATE orders SET status='picked', checked=?, picked_at=? WHERE id=?",
                         (jdump([ln["productId"] for ln in jload(r["lines"], [])]), iso_now(), r["id"]))
    return {"done": len(rs), "orders": [_order(_get_order(ctx.conn, r["id"])) for r in rs]}
