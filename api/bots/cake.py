# изменено 2026-10-16 21:00
"""Склад тортов с развозом по городам (cake-warehouse/*.html).

Рабочий учёт, а не витрина: нет ежедневного «освежения» и нет удаления
старых строк — журнал движений хранится целиком.

Модель:
  products — ассортимент; cities — города развоза; staff — кладовщики и
  водители (tg_id связывает сотрудника с Telegram); tara_types — виды
  оборотной тары.
  moves — журнал движений торта, qty со знаком (+ приход/возврат/плюс
  инвентаризации, − отгрузка/списание). Остаток = SUM(qty).
  trips — рейс в город: draft (сборка) → shipped (в пути) → reported
  (водитель сдал отчёт) → closed (кладовщик принял); draft → cancelled.
  tara_moves — долг тары по городам, qty со знаком (+ уехала в город,
  − вернулась). На складе = tara_types.total − долг всех городов.
  shifts — кто на смене в день.

Доступ: если задана TGS_CAKE_ADMINS (tg id через запятую), работать могут
только эти id и активные сотрудники с заполненным tg_id. Пусто — открыто
(демо). Если задан TGS_CAKE_BOT_TOKEN, каждый запрос обязан нести initData,
подписанный этим ботом; id пользователя берётся из подписи, а не из userId.
TGS_CAKE_SERVICE_KEY — служебный ключ бота склада (cake-bot): с ним проходит
всё, без подписи и списка.
"""
from __future__ import annotations

import hmac
import os
import random
from datetime import datetime

from core import (ApiError, Bot, Ctx, add_days, iso_now, jdump, jload, new_id, one, rows, scalar, v_bool, v_date,
                  v_enum, v_id, v_int, v_list, v_phone, v_str, verify_init_data)

SCHEMA = """
CREATE TABLE IF NOT EXISTS products(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, cat TEXT NOT NULL DEFAULT '', sku TEXT NOT NULL DEFAULT '', weight_g INTEGER NOT NULL DEFAULT 0,
  shelf_days INTEGER NOT NULL DEFAULT 0, min_qty INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1, seed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS cities(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1, seed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS staff(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '',
  car TEXT NOT NULL DEFAULT '', tg_id TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
  seed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS tara_types(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, total INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1, seed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS moves(
  id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, date TEXT NOT NULL, product_id TEXT NOT NULL,
  qty INTEGER NOT NULL, city_id TEXT, trip_id TEXT, note TEXT NOT NULL DEFAULT '', user_id TEXT,
  created_at TEXT NOT NULL, seed INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS cm_date ON moves(date);
CREATE INDEX IF NOT EXISTS cm_prod ON moves(product_id);
CREATE TABLE IF NOT EXISTS trips(
  id TEXT PRIMARY KEY, num INTEGER NOT NULL, date TEXT NOT NULL, city_id TEXT NOT NULL, driver_id TEXT,
  status TEXT NOT NULL, lines TEXT NOT NULL DEFAULT '[]', tara_out TEXT NOT NULL DEFAULT '[]',
  tara_back TEXT NOT NULL DEFAULT '[]', report TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, shipped_at TEXT, reported_at TEXT, closed_at TEXT, seed INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS ct_date ON trips(date);
CREATE TABLE IF NOT EXISTS tara_moves(
  id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, tara_id TEXT NOT NULL, city_id TEXT NOT NULL,
  qty INTEGER NOT NULL, trip_id TEXT, note TEXT NOT NULL DEFAULT '', user_id TEXT, created_at TEXT NOT NULL,
  seed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS shifts(date TEXT NOT NULL, staff_id TEXT NOT NULL, PRIMARY KEY(date, staff_id));
"""

MOVE_TYPES = {"in": "Приход", "ship": "Отгрузка", "return": "Возврат", "writeoff": "Списание", "adjust": "Инвентаризация"}
TRIP_STATUSES = ("draft", "shipped", "reported", "closed", "cancelled")
ROLES = ("storekeeper", "driver")
MAX_LINES = 150
MAX_QTY = 100000

# Ассортимент по заявкам клиента (фото накладных от 17.10.2026): категория, название, вес единицы, г
CATS = ("Торт", "Венский десерт", "Пирожное", "Набор пирожных", "Сладости мучные")
CATALOG = {
    "Торт": [
        ("Муравейка", 550), ("Грильяжный", 800), ("Домашний", 850), ("Йогуртовый с персиком", 950),
        ("Лесная ягодка", 1000), ("Лаванда", 850), ("Наполеон домашний", 1000), ("Панчо", 1000), ("Полесье", 1000),
        ("Смородинка", 850), ("Смородинка", 1300), ("Съешь меня карамельный", 500), ("Съешь меня карамельный", 950),
        ("Съешь меня трюфельный", 500), ("Творожный «Фруктовый»", 950), ("Творожный «Бруснично-грушевый»", 1000),
        ("Творожный «Блуберри»", 1000), ("Юбилейный", 1000), ("Вкус наслаждения", 500), ("Трюфельный", 1500),
        ("Царское удовольствие", 900), ("Какао-пломбир", 900), ("Шокобанан", 1000), ("Вкусненький", 1000),
        ("Пражский", 1000), ("Санкт-Петербург", 1000), ("Санкт-Петербург", 2000), ("Ассорти «Трио»", 2000),
        ("Дамские пальчики", 1000), ("Клубника-банан", 850), ("Крещатик", 1000), ("Кучерявый", 1000),
        ("Кучерявый", 1500), ("Лакомка", 900), ("Экзотик", 1500), ("Баунти", 1000), ("Вишня в шоколаде", 1000),
    ],
    "Венский десерт": [
        ("Клубника, ананас", 620), ("Вишня в коньяке", 620), ("Клубничный", 620), ("Голубичный", 600),
        ("Ягодная поляна", 600), ("Киви, персик", 600), ("Вишня, малина, ежевика, голубика", 600),
        ("Голубика, ежевика, малина", 600), ("Манго, папайя", 620), ("Тропический", 620), ("Фруктовый коктейль", 620),
    ],
    "Пирожное": [
        ("Картошка с натур. сгущ.", 390), ("Картошка", 360), ("Фисташковое", 470), ("Шоколадно-банановое", 360),
        ("Муравейка", 450), ("Пражское", 360), ("Эклер на сливочном масле", 250), ("Клубника-маракуйя", 360),
        ("Лакомка", 420), ("Пломбир в шоколаде", 250), ("Кольцо творожное, заварное", 250),
        ("Кольцо заварное сметанное", 250), ("Заварное с варёной сгущёнкой", 265), ("Клубничное наслаждение", 380),
        ("Юмбрик творожный", 240), ("Лаванда", 470), ("Эклер заварной", 75), ("Эклер творожный", 75),
        ("Ёж ореховый", 80), ("Медок", 75), ("Рафаэлка", 50),
    ],
    "Набор пирожных": [
        ("Рафаэлка", 200), ("Эклер творожный", 300), ("Эклер заварной", 300), ("Медок", 300), ("Ёж ореховый", 400),
        ("Царское удовольствие", 250), ("Царское удовольствие с орехом", 250), ("Наполеон", 225),
        ("Вишня в шоколаде", 340), ("Honey Бум нутелла", 310), ("Honey Бум солёная карамель", 310),
        ("Honey Бум фисташка", 310), ("Заварные пирожные", 256),
    ],
    "Сладости мучные": [
        ("Птичье молоко фрукт ассорти", 350), ("Птичье молоко", 500), ("Эстерхази", 850), ("Эстерхази", 425),
        ("Сникерс", 800), ("Сникерс", 400), ("Сказка", 650), ("Сластена", 800), ("Маффин шоколадный", 70),
        ("Вафельная трубочка с вар. сгущ.", 65), ("Рулет бисквитный «Мохито»", 500),
        ("Рулет бисквитный «Нежная лаванда»", 500),
    ],
}
SEED_PRODUCTS = [(f"p{i + 1:03d}", cat, name, w) for i, (cat, name, w) in
                 enumerate((c, n, w) for c in CATS for n, w in CATALOG[c])]
SEED_CITIES = [("brest", "Брест", "БРС"), ("grodno", "Гродно", "ГРД"), ("gomel", "Гомель", "ГМЛ"),
               ("mogilev", "Могилёв", "МГЛ"), ("vitebsk", "Витебск", "ВТБ"), ("baranovichi", "Барановичи", "БРН"),
               ("pinsk", "Пинск", "ПНС"), ("lida", "Лида", "ЛИД")]
SEED_STAFF = [
    ("sk-anna", "Анна Литвинович", "storekeeper", "+375291234501", ""),
    ("sk-oleg", "Олег Ткачук", "storekeeper", "+375291234502", ""),
    ("dr-ivan", "Иван Кравец", "driver", "+375291234511", "Iveco Daily · 4521 AB-7"),
    ("dr-sergey", "Сергей Мороз", "driver", "+375291234512", "ГАЗель Next · 7718 KE-7"),
    ("dr-pavel", "Павел Гриб", "driver", "+375291234513", "Ford Transit · 3304 MO-7"),
    ("dr-artur", "Артур Лис", "driver", "+375291234514", "Iveco Daily · 0912 HA-7"),
]
SEED_TARA = [("box", "Ящик", 500), ("stack", "Стопка", 150)]


# сид объявлен ниже — оборачиваем, чтобы декораторы action видели bot
bot = Bot("cake", SCHEMA, lambda conn, now: seed(conn, now))


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


def _guard(ctx: Ctx, p: dict) -> None:
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
    if not admins:
        return
    u = ctx.user
    if u and (u in admins or scalar(ctx.conn, "SELECT 1 FROM staff WHERE tg_id=? AND active=1", (u,))):
        return
    raise ApiError("forbidden", "Нет доступа к складу")


def action(name: str, write: bool = False):
    def deco(fn):
        def wrapped(ctx: Ctx, p: dict) -> dict:
            _guard(ctx, p)
            return fn(ctx, p)
        return bot.action(name, write)(wrapped)
    return deco


# ============ ВЫДАЧА ============

def _product(r):
    return {"id": r["id"], "name": r["name"], "cat": r["cat"], "sku": r["sku"], "weightG": r["weight_g"], "shelfDays": r["shelf_days"],
            "minQty": r["min_qty"], "sort": r["sort"], "active": bool(r["active"])}


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
            "closedAt": r["closed_at"]}


def _move(r):
    return {"id": r["id"], "type": r["type"], "date": r["date"], "productId": r["product_id"], "qty": r["qty"],
            "cityId": r["city_id"], "tripId": r["trip_id"], "note": r["note"], "createdAt": r["created_at"]}


def _stock_map(conn) -> dict[str, int]:
    return {r["product_id"]: r["q"] for r in rows(conn, "SELECT product_id, SUM(qty) q FROM moves GROUP BY product_id")}


def _tara_debt(conn) -> dict[tuple[str, str], int]:
    return {(r["city_id"], r["tara_id"]): r["q"]
            for r in rows(conn, "SELECT city_id, tara_id, SUM(qty) q FROM tara_moves GROUP BY city_id, tara_id")}


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


def _add_tara(ctx: Ctx, day: str, tid: str, city: str, qty: int, *, trip=None, note="", seed=0):
    ctx.conn.execute("INSERT INTO tara_moves(date,tara_id,city_id,qty,trip_id,note,user_id,created_at,seed) "
                     "VALUES(?,?,?,?,?,?,?,?,?)", (day, tid, city, qty, trip, note, ctx.user, iso_now(), seed))


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


# ============ СПРАВОЧНИКИ ============

@action("getRefs")
def get_refs(ctx: Ctx, p: dict) -> dict:
    c = ctx.conn
    return {
        "products": [_product(r) for r in rows(c, "SELECT * FROM products ORDER BY sort, name")],
        "cities": [_city(r) for r in rows(c, "SELECT * FROM cities ORDER BY sort, name")],
        "staff": [_staff(r) for r in rows(c, "SELECT * FROM staff ORDER BY role DESC, name")],
        "tara": [_tara(r) for r in rows(c, "SELECT * FROM tara_types ORDER BY sort, name")],
        "moveTypes": MOVE_TYPES, "cats": list(CATS),
    }


def _next_sort(conn, table: str) -> int:
    return (scalar(conn, f"SELECT MAX(sort) FROM {table}") or 0) + 1


@action("saveProduct", write=True)
def save_product(ctx: Ctx, p: dict) -> dict:
    pid = v_id(p, "id", required=False) or new_id("p")
    old = one(ctx.conn, "SELECT * FROM products WHERE id=?", (pid,))
    data = (v_str(p, "name", min_len=2, max_len=80), v_str(p, "cat", required=False, max_len=40) or CATS[0],
            v_str(p, "sku", required=False, max_len=30),
            v_int(p, "weightG", hi=100000, required=False), v_int(p, "shelfDays", hi=365, required=False),
            v_int(p, "minQty", hi=MAX_QTY, required=False), 1 if v_bool(p, "active", default=True) else 0)
    if old:
        ctx.conn.execute("UPDATE products SET name=?,cat=?,sku=?,weight_g=?,shelf_days=?,min_qty=?,active=? WHERE id=?", (*data, pid))
    else:
        ctx.conn.execute("INSERT INTO products(name,cat,sku,weight_g,shelf_days,min_qty,active,id,sort) VALUES(?,?,?,?,?,?,?,?,?)",
                         (*data, pid, _next_sort(ctx.conn, "products")))
    return {"product": _product(one(ctx.conn, "SELECT * FROM products WHERE id=?", (pid,)))}


@action("saveCity", write=True)
def save_city(ctx: Ctx, p: dict) -> dict:
    cid = v_id(p, "id", required=False) or new_id("c")
    data = (v_str(p, "name", min_len=2, max_len=60), v_str(p, "code", required=False, max_len=4).upper(),
            1 if v_bool(p, "active", default=True) else 0)
    if one(ctx.conn, "SELECT 1 FROM cities WHERE id=?", (cid,)):
        ctx.conn.execute("UPDATE cities SET name=?,code=?,active=? WHERE id=?", (*data, cid))
    else:
        ctx.conn.execute("INSERT INTO cities(name,code,active,id,sort) VALUES(?,?,?,?,?)", (*data, cid, _next_sort(ctx.conn, "cities")))
    return {"city": _city(one(ctx.conn, "SELECT * FROM cities WHERE id=?", (cid,)))}


@action("saveStaff", write=True)
def save_staff(ctx: Ctx, p: dict) -> dict:
    sid = v_id(p, "id", required=False) or new_id("s")
    tg = v_str(p, "tgId", required=False, max_len=15)
    if tg and not tg.isdigit():
        raise ApiError("bad_request", "tgId: только цифры")
    data = (v_str(p, "name", min_len=2, max_len=80), v_enum(p, "role", ROLES), v_phone(p, "phone", required=False),
            v_str(p, "car", required=False, max_len=80), tg, 1 if v_bool(p, "active", default=True) else 0)
    if one(ctx.conn, "SELECT 1 FROM staff WHERE id=?", (sid,)):
        ctx.conn.execute("UPDATE staff SET name=?,role=?,phone=?,car=?,tg_id=?,active=? WHERE id=?", (*data, sid))
    else:
        ctx.conn.execute("INSERT INTO staff(name,role,phone,car,tg_id,active,id) VALUES(?,?,?,?,?,?,?)", (*data, sid))
    return {"staff": _staff(one(ctx.conn, "SELECT * FROM staff WHERE id=?", (sid,)))}


@action("saveTara", write=True)
def save_tara(ctx: Ctx, p: dict) -> dict:
    tid = v_id(p, "id", required=False) or new_id("t")
    data = (v_str(p, "name", min_len=2, max_len=60), v_int(p, "total", hi=MAX_QTY, required=False),
            1 if v_bool(p, "active", default=True) else 0)
    if one(ctx.conn, "SELECT 1 FROM tara_types WHERE id=?", (tid,)):
        ctx.conn.execute("UPDATE tara_types SET name=?,total=?,active=? WHERE id=?", (*data, tid))
    else:
        ctx.conn.execute("INSERT INTO tara_types(name,total,active,id,sort) VALUES(?,?,?,?,?)", (*data, tid, _next_sort(ctx.conn, "tara_types")))
    return {"tara": _tara(one(ctx.conn, "SELECT * FROM tara_types WHERE id=?", (tid,)))}


@action("getMe")
def get_me(ctx: Ctx, p: dict) -> dict:
    me = ctx.user and one(ctx.conn, "SELECT * FROM staff WHERE tg_id=? AND tg_id<>''", (ctx.user,))
    return {"staff": _staff(me) if me else None, "restricted": _restricted()}


# ============ ОСТАТКИ И ДВИЖЕНИЯ ============

@action("getStock")
def get_stock(ctx: Ctx, p: dict) -> dict:
    c = ctx.conn
    stock = _stock_map(c)
    last_in = {r["product_id"]: r["d"] for r in rows(c, "SELECT product_id, MAX(date) d FROM moves WHERE type='in' GROUP BY product_id")}
    on_road = {}
    for t in rows(c, "SELECT lines FROM trips WHERE status IN ('shipped','reported')"):
        for ln in jload(t["lines"], []):
            on_road[ln["productId"]] = on_road.get(ln["productId"], 0) + ln["qty"]
    items = []
    for r in rows(c, "SELECT * FROM products ORDER BY sort, name"):
        q = stock.get(r["id"], 0)
        if not r["active"] and not q:
            continue
        items.append({**_product(r), "qty": q, "lastIn": last_in.get(r["id"]), "onRoad": on_road.get(r["id"], 0)})
    return {"items": items, "total": sum(i["qty"] for i in items)}


@action("addIncome", write=True)
def add_income(ctx: Ctx, p: dict) -> dict:
    day = v_date(p, "date", required=False) or ctx.today
    note = v_str(p, "note", required=False, max_len=200)
    lines = _lines(ctx.conn, p)
    for ln in lines:
        _add_move(ctx, "in", day, ln["productId"], ln["qty"], note=note)
    return {"added": sum(ln["qty"] for ln in lines)}


@action("writeOff", write=True)
def write_off(ctx: Ctx, p: dict) -> dict:
    pid = v_id(p, "productId")
    q = v_int(p, "qty", lo=1, hi=MAX_QTY)
    reason = v_str(p, "reason", min_len=2, max_len=200)
    _check_stock(ctx.conn, [{"productId": pid, "qty": q}])
    _add_move(ctx, "writeoff", ctx.today, pid, -q, note=reason)
    return {"qty": _stock_map(ctx.conn).get(pid, 0)}


@action("adjustStock", write=True)
def adjust_stock(ctx: Ctx, p: dict) -> dict:
    """Инвентаризация: actual — сколько насчитали; пишем разницу."""
    pid = v_id(p, "productId")
    if not scalar(ctx.conn, "SELECT 1 FROM products WHERE id=?", (pid,)):
        raise ApiError("not_found", "Нет такого торта")
    actual = v_int(p, "actual", hi=MAX_QTY)
    delta = actual - _stock_map(ctx.conn).get(pid, 0)
    if delta:
        _add_move(ctx, "adjust", ctx.today, pid, delta, note=v_str(p, "note", required=False, max_len=200) or "Пересчёт")
    return {"delta": delta, "qty": actual}


@action("getMoves")
def get_moves(ctx: Ctx, p: dict) -> dict:
    to = v_date(p, "to", required=False) or ctx.today
    frm = v_date(p, "from", required=False) or add_days(to, -6)
    t = v_enum(p, "type", list(MOVE_TYPES), required=False)
    q = "SELECT * FROM moves WHERE date BETWEEN ? AND ?" + (" AND type=?" if t else "") + " ORDER BY date DESC, id DESC LIMIT 500"
    return {"moves": [_move(r) for r in rows(ctx.conn, q, (frm, to, t) if t else (frm, to))], "from": frm, "to": to}


# ============ РЕЙСЫ ============

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
        _add_tara(ctx, ctx.today, ln["taraId"], t["city_id"], ln["qty"], trip=t["id"])
    ctx.conn.execute("UPDATE trips SET status='shipped', shipped_at=? WHERE id=?", (iso_now(), t["id"]))
    return {"trip": _trip(_get_trip(ctx.conn, t["id"]))}


@action("cancelTrip", write=True)
def cancel_trip(ctx: Ctx, p: dict) -> dict:
    t = _get_trip(ctx.conn, v_id(p, "id"))
    if t["status"] != "draft":
        raise ApiError("bad_state", "Отменить можно только рейс на сборке")
    ctx.conn.execute("UPDATE trips SET status='cancelled' WHERE id=?", (t["id"],))
    return {"trip": _trip(_get_trip(ctx.conn, t["id"]))}


def _returns(ctx: Ctx, p: dict, trip: dict) -> list[dict]:
    """[{productId, back, spoiled}] — не больше, чем уехало в рейсе."""
    shipped = {ln["productId"]: ln["qty"] for ln in jload(trip["lines"], [])}
    out = []
    for x in v_list(p, "returns", max_items=MAX_LINES, required=False):
        if not isinstance(x, dict):
            raise ApiError("bad_request", "returns: ожидается объект")
        pid = v_id(x, "productId")
        back = v_int(x, "back", hi=MAX_QTY, required=False)
        spoiled = v_int(x, "spoiled", hi=MAX_QTY, required=False)
        if pid not in shipped:
            raise ApiError("bad_request", "Этого торта не было в рейсе")
        if back + spoiled > shipped[pid]:
            raise ApiError("bad_request", "Возврат больше, чем уехало")
        if back or spoiled:
            out.append({"productId": pid, "back": back, "spoiled": spoiled})
    return out


@action("reportTrip", write=True)
def report_trip(ctx: Ctx, p: dict) -> dict:
    """Водитель: рейс развезён, вот что везу обратно."""
    t = _get_trip(ctx.conn, v_id(p, "id"))
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
    for r in rets:
        if r["back"]:
            _add_move(ctx, "return", ctx.today, r["productId"], r["back"], city=t["city_id"], trip=t["id"])
    for ln in tara_back:
        _add_tara(ctx, ctx.today, ln["taraId"], t["city_id"], -ln["qty"], trip=t["id"])
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
    return {"driver": _staff(drv) if drv else None, "trips": [_trip(r) for r in rs]}


# ============ ТАРА ============

@action("getTara")
def get_tara(ctx: Ctx, p: dict) -> dict:
    debt = _tara_debt(ctx.conn)
    types = [_tara(r) for r in rows(ctx.conn, "SELECT * FROM tara_types ORDER BY sort, name")]
    out_total = {t["id"]: sum(q for (c, tid), q in debt.items() if tid == t["id"]) for t in types}
    for t in types:
        t["out"] = out_total[t["id"]]
        t["inStock"] = t["total"] - t["out"]
    cities = []
    for c in rows(ctx.conn, "SELECT * FROM cities ORDER BY sort, name"):
        b = {t["id"]: debt.get((c["id"], t["id"]), 0) for t in types}
        if c["active"] or any(b.values()):
            cities.append({**_city(c), "balance": b})
    hist = [{"id": r["id"], "date": r["date"], "taraId": r["tara_id"], "cityId": r["city_id"], "qty": r["qty"],
             "tripId": r["trip_id"], "note": r["note"]}
            for r in rows(ctx.conn, "SELECT * FROM tara_moves ORDER BY id DESC LIMIT 60")]
    return {"types": types, "cities": cities, "history": hist}


@action("taraMove", write=True)
def tara_move(ctx: Ctx, p: dict) -> dict:
    """Ручное движение тары вне рейса: dir=out — отдали городу, in — город вернул."""
    city = v_id(p, "cityId")
    if not scalar(ctx.conn, "SELECT 1 FROM cities WHERE id=?", (city,)):
        raise ApiError("not_found", "Нет такого города")
    tid = v_id(p, "taraId")
    if not scalar(ctx.conn, "SELECT 1 FROM tara_types WHERE id=?", (tid,)):
        raise ApiError("not_found", "Нет такой тары")
    q = v_int(p, "qty", lo=1, hi=MAX_QTY)
    sign = 1 if v_enum(p, "dir", ("out", "in")) == "out" else -1
    _add_tara(ctx, ctx.today, tid, city, sign * q, note=v_str(p, "note", required=False, max_len=200))
    return {"balance": _tara_debt(ctx.conn).get((city, tid), 0)}


# ============ СМЕНЫ ============

@action("getShifts")
def get_shifts(ctx: Ctx, p: dict) -> dict:
    frm = v_date(p, "from", required=False) or ctx.today
    to = v_date(p, "to", required=False) or add_days(frm, 6)
    days: dict[str, list[str]] = {}
    for r in rows(ctx.conn, "SELECT * FROM shifts WHERE date BETWEEN ? AND ? ORDER BY date", (frm, to)):
        days.setdefault(r["date"], []).append(r["staff_id"])
    return {"days": days, "from": frm, "to": to}


@action("setShift", write=True)
def set_shift(ctx: Ctx, p: dict) -> dict:
    day = v_date(p, "date")
    ids = [x for x in v_list(p, "staffIds", max_items=100) if isinstance(x, str)]
    valid = {r["id"] for r in rows(ctx.conn, "SELECT id FROM staff")}
    ids = [x for x in dict.fromkeys(ids) if x in valid]
    ctx.conn.execute("DELETE FROM shifts WHERE date=?", (day,))
    ctx.conn.executemany("INSERT INTO shifts(date,staff_id) VALUES(?,?)", [(day, x) for x in ids])
    return {"date": day, "staffIds": ids}


# ============ СВОДКА ============

@action("getOverview")
def get_overview(ctx: Ctx, p: dict) -> dict:
    c, today = ctx.conn, ctx.today
    days = v_int(p, "days", lo=7, hi=60, required=False, default=14)
    frm = add_days(today, -(days - 1))
    by_day = {r["date"]: -r["q"] for r in rows(c, "SELECT date, SUM(qty) q FROM moves WHERE type='ship' AND date>=? GROUP BY date", (frm,))}
    series = [{"date": add_days(frm, i), "value": by_day.get(add_days(frm, i), 0)} for i in range(days)]
    by_city = rows(c, "SELECT city_id, -SUM(qty) q FROM moves WHERE type='ship' AND date>=? GROUP BY city_id ORDER BY q DESC", (frm,))
    top = rows(c, "SELECT product_id, -SUM(qty) q FROM moves WHERE type='ship' AND date>=? GROUP BY product_id ORDER BY q DESC LIMIT 5", (frm,))
    returned = scalar(c, "SELECT COALESCE(SUM(qty),0) FROM moves WHERE type='return' AND date>=?", (frm,))
    written = -scalar(c, "SELECT COALESCE(SUM(qty),0) FROM moves WHERE type='writeoff' AND date>=?", (frm,))
    stock = _stock_map(c)
    low = [r["name"] for r in rows(c, "SELECT * FROM products WHERE active=1 AND min_qty>0") if stock.get(r["id"], 0) < r["min_qty"]]
    st = {r["status"]: r["n"] for r in rows(c, "SELECT status, COUNT(*) n FROM trips WHERE status IN ('draft','shipped','reported') GROUP BY status")}
    return {
        "stockTotal": sum(stock.values()), "lowStock": low,
        "shippedToday": by_day.get(today, 0), "shippedPeriod": sum(by_day.values()),
        "returnedPeriod": returned, "writtenOffPeriod": written,
        "trips": {"draft": st.get("draft", 0), "shipped": st.get("shipped", 0), "reported": st.get("reported", 0)},
        "series": series,
        "byCity": [{"cityId": r["city_id"], "qty": r["q"]} for r in by_city],
        "topProducts": [{"productId": r["product_id"], "qty": r["q"]} for r in top],
        "taraOut": sum(q for q in _tara_debt(c).values()),
        "onShift": [r["staff_id"] for r in rows(c, "SELECT staff_id FROM shifts WHERE date=?", (today,))],
    }


# ============ ДЕМО-ДАННЫЕ ============

def seed(conn, now: datetime) -> None:
    rnd = random.Random(42)
    today = now.date().isoformat()
    for i, (pid, cat, name, w) in enumerate(SEED_PRODUCTS):
        conn.execute("INSERT INTO products(id,cat,name,weight_g,sort,seed) VALUES(?,?,?,?,?,1)", (pid, cat, name, w, i))
    for i, (cid, name, code) in enumerate(SEED_CITIES):
        conn.execute("INSERT INTO cities(id,name,code,sort,seed) VALUES(?,?,?,?,1)", (cid, name, code, i))
    for sid, name, role, phone, car in SEED_STAFF:
        conn.execute("INSERT INTO staff(id,name,role,phone,car,seed) VALUES(?,?,?,?,?,1)", (sid, name, role, phone, car))
    for i, (tid, name, total) in enumerate(SEED_TARA):
        conn.execute("INSERT INTO tara_types(id,name,total,sort,seed) VALUES(?,?,?,?,1)", (tid, name, total, i))

    ctx = Ctx(conn=conn, user=None, ip="seed", now=now)
    drivers = [s[0] for s in SEED_STAFF if s[2] == "driver"]
    keepers = [s[0] for s in SEED_STAFF if s[2] == "storekeeper"]
    pids = [x[0] for x in SEED_PRODUCTS]
    cities = [x[0] for x in SEED_CITIES]
    num = 0
    stock = {pid: 0 for pid in pids}

    def add(type_, day, pid, q, **kw):
        _add_move(ctx, type_, day, pid, q, seed=1, **kw)
        stock[pid] += q

    for back in range(20, -1, -1):
        day = add_days(today, -back)
        conn.executemany("INSERT INTO shifts(date,staff_id) VALUES(?,?)",
                         [(day, keepers[back % 2])] + [(day, d) for d in rnd.sample(drivers, 3)])
        for pid in rnd.sample(pids, 45):  # утренний приход с производства
            add("in", day, pid, rnd.randint(4, 12), note="Цех")
        if back == 0:
            break  # сегодняшние рейсы ниже: часть на сборке, часть в пути
        for cid in rnd.sample(cities, 4):
            num += 1
            tid = f"R-S{num:04d}"
            lines = []
            for pid in rnd.sample(pids, 14):
                q = min(stock[pid], rnd.randint(1, 5))
                if q:
                    lines.append({"productId": pid, "qty": q})
                    add("ship", day, pid, -q, city=cid, trip=tid)
            crates = sum(ln["qty"] for ln in lines) // 2 + 1
            _add_tara(ctx, day, "box", cid, crates, trip=tid, seed=1)
            back_crates = crates - rnd.randint(0, 3)
            _add_tara(ctx, day, "box", cid, -back_crates, trip=tid, seed=1)
            closed = []
            for ln in lines:
                b = rnd.choice([0, 0, 0, 1])
                s = rnd.choice([0, 0, 0, 0, 1]) if ln["qty"] - b > 1 else 0
                if b:
                    add("return", day, ln["productId"], b, city=cid, trip=tid)
                closed.append({**ln, "back": b, "spoiled": s, "delivered": ln["qty"] - b - s})
            ts = f"{day}T07:{rnd.randint(10, 59)}:00+03:00"
            conn.execute("INSERT INTO trips(id,num,date,city_id,driver_id,status,lines,tara_out,tara_back,created_at,"
                         "shipped_at,closed_at,seed) VALUES(?,?,?,?,?,'closed',?,?,?,?,?,?,1)",
                         (tid, num, day, cid, rnd.choice(drivers), jdump(closed), jdump([{"taraId": "box", "qty": crates}]),
                          jdump([{"taraId": "box", "qty": back_crates}]), ts, ts, f"{day}T18:30:00+03:00"))
        for pid in rnd.sample(pids, 1):
            if stock[pid] > 2:
                add("writeoff", day, pid, -1, note="Истёк срок")

    # сегодня: один рейс в пути, один на сборке
    for status, cid, drv in (("shipped", "brest", drivers[0]), ("draft", "gomel", drivers[1])):
        num += 1
        tid = f"R-S{num:04d}"
        lines = [{"productId": pid, "qty": min(stock[pid], rnd.randint(1, 4))} for pid in rnd.sample(pids, 12)]
        lines = [ln for ln in lines if ln["qty"]]
        tara = [{"taraId": "box", "qty": 16}, {"taraId": "stack", "qty": 2}]
        if status == "shipped":
            for ln in lines:
                add("ship", today, ln["productId"], -ln["qty"], city=cid, trip=tid)
            for ln in tara:
                _add_tara(ctx, today, ln["taraId"], cid, ln["qty"], trip=tid, seed=1)
        conn.execute("INSERT INTO trips(id,num,date,city_id,driver_id,status,lines,tara_out,created_at,shipped_at,seed) "
                     "VALUES(?,?,?,?,?,?,?,?,?,?,1)",
                     (tid, num, today, cid, drv, status, jdump(lines), jdump(tara), iso_now(),
                      iso_now() if status == "shipped" else None))

