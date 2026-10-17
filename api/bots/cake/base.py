# изменено 2026-10-17 12:40
"""Объект bot, проверка доступа, выдача строк в JSON и общие проверки строк."""
from __future__ import annotations

import hmac
import logging
import os

from core import ApiError, Bot, Ctx, iso_now, jload, one, rows, scalar, v_id, v_int, v_list, verify_init_data
from bots.cake.schema import MAX_LINES, MAX_QTY, SCHEMA


def _seed(conn, now):
    from bots.cake.seed import seed  # поздний импорт: seed пользуется помощниками отсюда
    seed(conn, now)


def _migrate(conn, now):
    from bots.cake.orders_seed import migrate_picking  # сборка — и в уже работающие базы
    migrate_picking(conn, now)
    if "odo_out" not in {r["name"] for r in conn.execute("PRAGMA table_info(trips)").fetchall()}:
        conn.execute("ALTER TABLE trips ADD COLUMN odo_out INTEGER")  # спидометр — в базы, созданные раньше
        conn.execute("ALTER TABLE trips ADD COLUMN odo_back INTEGER")


bot = Bot("cake", SCHEMA, _seed, migrate=_migrate)


# ============ ДОСТУП ============

def _restricted() -> bool:
    return bool(_admins() or os.environ.get("TGS_CAKE_BOT_TOKEN"))


def _admins() -> set[str]:
    return {x.strip() for x in os.environ.get("TGS_CAKE_ADMINS", "").split(",") if x.strip()}


def _service(p: dict) -> bool:
    """Бот склада (cake-bot) на том же iMac ходит со служебным ключом."""
    key = os.environ.get("TGS_CAKE_SERVICE_KEY", "")
    got = p.get("serviceKey")
    return bool(key) and isinstance(got, str) and hmac.compare_digest(got.encode(), key.encode())


# Водитель видит только своё: рейсы и отчёт о возврате. Остальное — склад (кладовщик и руководитель).
DRIVER_ACTIONS = {"getMe", "getRefs", "getMyTrips", "reportTrip", "setOdometer"}
ADMIN_ACTIONS = {"saveStaff"}  # кого пускать в приложение — решает только руководитель
_warned = False


def _guard(ctx: Ctx, p: dict, name: str = "") -> None:
    global _warned
    ctx.role = "admin"  # открытое демо и служебный ключ бота — без ограничений
    if _service(p):
        ctx.user = None
        return
    # С токеном бота (TGS_CAKE_BOT_TOKEN) верим только подписанному initData:
    # userId из запроса подделать нельзя, без подписи — отказ.
    token = os.environ.get("TGS_CAKE_BOT_TOKEN", "")
    if token:
        uid = verify_init_data(p.get("initData"), token)
        if not uid:
            raise ApiError("forbidden", "Откройте приложение из бота")
        ctx.user = uid
    admins = _admins()
    if not admins and not token:
        return
    if admins and not token and not _warned:
        _warned = True  # userId без подписи подделать легко — боевой режим только вместе с токеном
        logging.getLogger("cake").warning("TGS_CAKE_ADMINS без TGS_CAKE_BOT_TOKEN: userId не проверяется подписью")
    u = ctx.user
    role = "admin" if u and u in admins else (u and scalar(ctx.conn, "SELECT role FROM staff WHERE tg_id=? AND tg_id<>'' AND active=1", (u,)))
    if not role:
        raise ApiError("forbidden", "Нет доступа к складу")
    if (role == "driver" and name not in DRIVER_ACTIONS) or (role != "admin" and name in ADMIN_ACTIONS):
        raise ApiError("forbidden", "Нет доступа")
    ctx.role = role


def action(name: str, write: bool = False):
    def deco(fn):
        def wrapped(ctx: Ctx, p: dict) -> dict:
            _guard(ctx, p, name)
            return fn(ctx, p)
        return bot.action(name, write)(wrapped)
    return deco


# ============ ВЫДАЧА ============

def _product(r):
    return {"id": r["id"], "name": r["name"], "cat": r["cat"], "sku": r["sku"], "weightG": r["weight_g"], "shelfDays": r["shelf_days"],
            "minQty": r["min_qty"], "perBox": r["per_box"], "sort": r["sort"], "active": bool(r["active"])}


def _city(r):
    return {"id": r["id"], "name": r["name"], "code": r["code"], "sort": r["sort"], "active": bool(r["active"])}


def _staff(r):
    return {"id": r["id"], "name": r["name"], "role": r["role"], "phone": r["phone"], "car": r["car"],
            "tgId": r["tg_id"], "active": bool(r["active"])}


def _tara(r):
    return {"id": r["id"], "name": r["name"], "total": r["total"], "sort": r["sort"], "active": bool(r["active"])}


def _trip(r):
    return {"id": r["id"], "num": r["num"], "date": r["date"], "cityId": r["city_id"], "driverId": r["driver_id"],
            "status": r["status"], "lines": jload(r["lines"], []), "taraOut": jload(r["tara_out"], []),
            "taraBack": jload(r["tara_back"], []), "report": r["report"], "note": r["note"],
            "createdAt": r["created_at"], "shippedAt": r["shipped_at"], "reportedAt": r["reported_at"],
            "closedAt": r["closed_at"], "odoOut": r["odo_out"], "odoBack": r["odo_back"]}


def _move(r):
    return {"id": r["id"], "type": r["type"], "date": r["date"], "productId": r["product_id"], "qty": r["qty"],
            "cityId": r["city_id"], "tripId": r["trip_id"], "note": r["note"], "createdAt": r["created_at"]}


def _stock_map(conn) -> dict[str, int]:
    return {r["product_id"]: r["q"] for r in rows(conn, "SELECT product_id, SUM(qty) q FROM moves GROUP BY product_id")}


def _tara_debt(conn) -> dict[tuple[str, str], int]:
    """(водитель, вид тары) → сколько у него на руках."""
    return {(r["driver_id"], r["tara_id"]): r["q"]
            for r in rows(conn, "SELECT driver_id, tara_id, SUM(qty) q FROM tara_moves GROUP BY driver_id, tara_id")}


def _get_trip(conn, tid: str) -> dict:
    r = one(conn, "SELECT * FROM trips WHERE id=?", (tid,))
    if not r:
        raise ApiError("not_found", "Рейс не найден")
    return r


# ============ ВАЛИДАЦИЯ СТРОК ============

def _lines(conn, p: dict, key: str = "lines", *, allow_empty: bool = False) -> list[dict]:
    """[{productId, qty}] → схлопнутые строки с qty > 0 по существующим товарам."""
    out: dict[str, int] = {}
    for x in v_list(p, key, max_items=MAX_LINES, required=not allow_empty):
        if not isinstance(x, dict):
            raise ApiError("bad_request", f"{key}: ожидается объект")
        pid = v_id(x, "productId")
        q = v_int(x, "qty", lo=0, hi=MAX_QTY)
        if not scalar(conn, "SELECT 1 FROM products WHERE id=?", (pid,)):
            raise ApiError("not_found", "Нет такого торта")
        if q:
            out[pid] = out.get(pid, 0) + q
    if not out and not allow_empty:
        raise ApiError("bad_request", "Пустой список")
    return [{"productId": k, "qty": v} for k, v in out.items()]


def _tara_lines(conn, p: dict, key: str) -> list[dict]:
    out: dict[str, int] = {}
    for x in v_list(p, key, max_items=20, required=False):
        if not isinstance(x, dict):
            raise ApiError("bad_request", f"{key}: ожидается объект")
        tid = v_id(x, "taraId")
        q = v_int(x, "qty", lo=0, hi=MAX_QTY)
        if not scalar(conn, "SELECT 1 FROM tara_types WHERE id=?", (tid,)):
            raise ApiError("not_found", "Нет такой тары")
        if q:
            out[tid] = out.get(tid, 0) + q
    return [{"taraId": k, "qty": v} for k, v in out.items()]


def _add_move(ctx: Ctx, type_: str, day: str, pid: str, qty: int, *, city=None, trip=None, note="", seed=0):
    ctx.conn.execute("INSERT INTO moves(type,date,product_id,qty,city_id,trip_id,note,user_id,created_at,seed) "
                     "VALUES(?,?,?,?,?,?,?,?,?,?)", (type_, day, pid, qty, city, trip, note, ctx.user, iso_now(), seed))


def _add_tara(ctx: Ctx, day: str, tid: str, driver: str, kind: str, qty: int, *, city=None, trip=None, note="", seed=0):
    """qty без знака; знак задаёт kind: out — на водителя, back/writeoff — с водителя."""
    qty = abs(qty) if kind == "out" else -abs(qty)
    ctx.conn.execute("INSERT INTO tara_moves(date,tara_id,driver_id,kind,city_id,qty,trip_id,note,user_id,created_at,seed) "
                     "VALUES(?,?,?,?,?,?,?,?,?,?,?)", (day, tid, driver, kind, city, qty, trip, note, ctx.user, iso_now(), seed))


def _check_stock(conn, lines: list[dict]) -> None:
    stock = _stock_map(conn)
    short = []
    for ln in lines:
        have = stock.get(ln["productId"], 0)
        if ln["qty"] > have:
            name = scalar(conn, "SELECT name FROM products WHERE id=?", (ln["productId"],))
            short.append(f"{name}: есть {have}, нужно {ln['qty']}")
    if short:
        raise ApiError("no_stock", "Не хватает: " + "; ".join(short))


def _next_sort(conn, table: str) -> int:
    return (scalar(conn, f"SELECT MAX(sort) FROM {table}") or 0) + 1
