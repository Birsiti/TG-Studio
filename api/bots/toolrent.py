# изменено 2026-10-08 02:30
"""Прокат инструмента — контракт спроектирован по мок-функциям
toolrent-miniapp (client/admin/owner).

Модель: модели инструмента (каталог) → физические единицы (units) с
номерами → брони на период [from, to] включительно. Свободный остаток
считается по дням: ёмкость (единицы не в ремонте/списании) минус
максимум одновременных броней в любой из дней периода.

Статусы брони: pending (ждёт выдачи) → active (выдан) → returned;
cancelled. overdue — вычисляемый: active и to < сегодня.
"""
from __future__ import annotations

import random
from datetime import datetime

from core import (ApiError, Bot, Ctx, add_days, cap_rows, iso_now, jdump, jload, new_id, one, rows, scalar, v_bool,
                  v_date, v_enum, v_id, v_int, v_num, v_obj, v_phone, v_str)

SCHEMA = """
CREATE TABLE IF NOT EXISTS categories(id TEXT PRIMARY KEY, name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS models(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, cat TEXT NOT NULL, price REAL NOT NULL, deposit REAL NOT NULL DEFAULT 0,
  specs TEXT NOT NULL DEFAULT '', descr TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT 'drill', photo_url TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, seed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS units(
  id TEXT PRIMARY KEY, model_id TEXT NOT NULL, num INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'free',
  booking_id TEXT, seed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS bookings(
  id TEXT PRIMARY KEY, num INTEGER NOT NULL, model_id TEXT NOT NULL, unit_id TEXT, user_id TEXT,
  client TEXT NOT NULL, phone TEXT NOT NULL, id_doc TEXT NOT NULL DEFAULT '',
  date_from TEXT NOT NULL, date_to TEXT NOT NULL, method TEXT NOT NULL, address TEXT NOT NULL DEFAULT '',
  zone TEXT NOT NULL DEFAULT '', slot TEXT NOT NULL DEFAULT '', return_method TEXT NOT NULL DEFAULT 'self',
  status TEXT NOT NULL, days INTEGER NOT NULL, rent REAL NOT NULL, discount REAL NOT NULL DEFAULT 0,
  delivery_fee REAL NOT NULL DEFAULT 0, total REAL NOT NULL, deposit REAL NOT NULL DEFAULT 0,
  delivery_status TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, issued_at TEXT, returned_at TEXT,
  condition_out TEXT NOT NULL DEFAULT '', condition_in TEXT NOT NULL DEFAULT '', comment TEXT NOT NULL DEFAULT '',
  late_fee REAL NOT NULL DEFAULT 0, nudged_at TEXT, source TEXT NOT NULL DEFAULT 'app', seed INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS tb_model ON bookings(model_id, status);
CREATE INDEX IF NOT EXISTS tb_user ON bookings(user_id);
CREATE TABLE IF NOT EXISTS repairs(
  id TEXT PRIMARY KEY, unit_id TEXT NOT NULL, model_id TEXT NOT NULL, opened TEXT NOT NULL, closed TEXT,
  note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'in_repair', seed INTEGER NOT NULL DEFAULT 0);
"""

CONFIG = {
    "businessName": "Прокат-Инструмент",
    "phone": "+375291234567",
    "pickupPoints": [{"id": "p1", "name": "Склад на Промышленной, 12", "hours": "Пн–Сб 9:00–19:00"}],
    "deliveryZones": [{"id": "z1", "name": "В пределах МКАД", "fee": 15}, {"id": "z2", "name": "За МКАД, до 20 км", "fee": 30}],
    "deliverySlots": [{"id": "morning", "name": "Утро", "time": "9:00–12:00"}, {"id": "day", "name": "День", "time": "12:00–17:00"},
                      {"id": "evening", "name": "Вечер", "time": "17:00–20:00"}],
    "discounts": [{"days": 3, "pct": 10}, {"days": 7, "pct": 20}],
    "maxDays": 30,
}
ZONES = {z["id"]: z for z in CONFIG["deliveryZones"]}
SLOTS = {s["id"] for s in CONFIG["deliverySlots"]}
LIMITS = {"bookings": 5000, "units": 300, "models": 60, "repairs": 1000}
PER_USER_ACTIVE = 6
ICONS = ["drill", "grinder", "mixer", "scaffold", "trimmer", "mower", "level", "cutter", "saw", "vacuum", "sander", "generator", "ladder"]

SEED_CATS = [("elec", "Электро"), ("build", "Стройка"), ("garden", "Сад"), ("measure", "Замер"), ("clean", "Уборка")]
SEED_MODELS = [
    ("m1", "Перфоратор Bosch GBH 2-26", "elec", 18, 150, "drill", "800 Вт · SDS-plus · 2,7 кг", "Сверление в бетоне, кирпиче и камне. Три режима: сверление, удар, долбление. В комплекте кейс, бур SDS-plus 8 мм и пика.", 5),
    ("m2", "Болгарка Makita 230 мм", "elec", 14, 120, "grinder", "2000 Вт · диск 230 мм · 5,2 кг", "Резка металла, камня и плитки. Плавный пуск, защита от перегрузки. Диск в комплект не входит.", 4),
    ("m3", "Бетономешалка 130 л", "build", 25, 300, "mixer", "130 л · 550 Вт · на колёсах", "Бетон, раствор, штукатурка. Стальная рама на колёсах, выдаётся вымытой.", 3),
    ("m4", "Леса рамные 4×2 м", "build", 32, 250, "scaffold", "высота 4 м · площадка 2 м · до 200 кг", "Оцинкованная сталь, монтаж без инструмента. Инструкция и стопоры в комплекте.", 3),
    ("m5", "Триммер бензиновый Huter", "garden", 20, 150, "trimmer", "25,4 см³ · леска + нож · 6,4 кг", "Для газона и высокой травы. Катушка и металлический нож в комплекте. Топливо — АИ-92 с маслом 1:40.", 6),
    ("m6", "Газонокосилка Bosch Rotak", "garden", 28, 200, "mower", "1600 Вт · ширина 36 см · мешок 45 л", "Для ровных участков. Высота среза 25–75 мм. Нужен удлинитель от 15 м.", 3),
    ("m7", "Лазерный нивелир ADA", "measure", 15, 200, "level", "360° · до 30 м · IP54", "Строит горизонтальную и вертикальную плоскости. Штатив и очки в комплекте.", 4),
    ("m8", "Штроборез Metabo", "elec", 22, 200, "cutter", "1800 Вт · глубина 40 мм", "Каналы под кабель в бетоне и кирпиче. Вместе со строительным пылесосом — без пыли.", 2),
    ("m9", "Пила циркулярная Makita", "elec", 16, 150, "saw", "1200 Вт · диск 190 мм · 4 кг", "Ровный рез доски, фанеры, ОСП. Направляющая шина по запросу.", 3),
    ("m10", "Пылесос строительный Kärcher", "clean", 17, 120, "vacuum", "1300 Вт · бак 25 л · сухая/влажная", "Пыль, мусор, вода. Розетка для инструмента с автозапуском.", 4),
    ("m11", "Шлифмашина для стен «жираф»", "build", 30, 300, "sander", "750 Вт · круг 225 мм · подсветка", "Шлифовка шпаклёвки на стенах и потолке. Подключается к пылесосу.", 2),
    ("m12", "Генератор бензиновый 3 кВт", "elec", 35, 400, "generator", "3 кВт · 230 В · 15 л бак", "Резервное питание дачи или стройки. До 10 часов на баке. Выдаётся с маслом, без топлива.", 2),
]
CLIENTS = [("Игорь Савчук", "+375291112233"), ("Наталья Дрозд", "+375334445566"), ("Пётр Мельник", "+375257778899"),
           ("Сергей Ким", "+375290001122"), ("Анна Реут", "+375292223344"), ("Дмитрий Волк", "+375335556677"),
           ("Олег Юрчик", "+375253332211"), ("Марина Лис", "+375447001122"), ("Виктор Гончар", "+375296543210"),
           ("Елена Бобр", "+375339876543"), ("Артур Климович", "+375441239876"), ("ООО «СтройДом»", "+375291000000")]
ADDRESSES = ["ул. Сурганова, 43", "пр-т Независимости, 120", "ул. Немига, 5", "ул. Козлова, 8", "д. Ждановичи, ул. Садовая, 3",
             "ул. Есенина, 16", "ул. Притыцкого, 77", "Колодищи, ул. Лесная, 12"]


def _price(model: dict, days: int, method: str, zone: str, return_method: str) -> dict:
    rent = model["price"] * days
    pct = 0
    for d in CONFIG["discounts"]:
        if days >= d["days"]:
            pct = d["pct"]
    discount = round(rent * pct / 100, 2)
    fee = 0.0
    if method == "delivery":
        z = ZONES.get(zone) or ZONES["z1"]
        fee = z["fee"] * (2 if return_method == "courier" else 1)
    total = round(rent - discount + fee, 2)
    return {"days": days, "rent": rent, "discountPct": pct, "discount": discount, "deliveryFee": fee, "total": total,
            "deposit": model["deposit"]}


def _days(frm: str, to: str) -> int:
    return (datetime.fromisoformat(to) - datetime.fromisoformat(frm)).days + 1


def _capacity(conn, model_id: str) -> int:
    return scalar(conn, "SELECT COUNT(*) FROM units WHERE model_id=? AND status IN ('free','rented')", (model_id,))


def _busy_max(conn, model_id: str, frm: str, to: str, today: str, exclude: str | None = None) -> int:
    """Максимум одновременных броней модели в любой день [frm, to]."""
    q = "SELECT id, date_from, date_to, status FROM bookings WHERE model_id=? AND status IN ('pending','active') AND date_from<=? "
    rs = rows(conn, q, (model_id, max(to, today)))
    spans = []
    for r in rs:
        if r["id"] == exclude:
            continue
        end = r["date_to"]
        if r["status"] == "active" and end < today:
            end = today  # просроченный ещё не вернули — занят как минимум сегодня
        if r["date_from"] <= to and frm <= end:
            spans.append((r["date_from"], end))
    peak = 0
    day = frm
    while day <= to:
        peak = max(peak, sum(1 for a, b in spans if a <= day <= b))
        day = add_days(day, 1)
    return peak


def _free(conn, model_id, frm, to, today, exclude=None) -> tuple[int, int]:
    total = _capacity(conn, model_id)
    return max(0, total - _busy_max(conn, model_id, frm, to, today, exclude)), total


def _num(conn) -> int:
    return (scalar(conn, "SELECT MAX(num) FROM bookings") or 1000) + 1


def _status_of(r: dict, today: str) -> str:
    if r["status"] == "active" and r["date_to"] < today:
        return "overdue"
    return r["status"]


def _booking_out(conn, r: dict, today: str, full: bool = False) -> dict:
    m = one(conn, "SELECT name FROM models WHERE id=?", (r["model_id"],))
    u = one(conn, "SELECT num FROM units WHERE id=?", (r["unit_id"],)) if r["unit_id"] else None
    st = _status_of(r, today)
    out = {"id": r["id"], "num": r["num"], "modelId": r["model_id"], "model": m["name"] if m else "—",
           "from": r["date_from"], "to": r["date_to"], "status": st, "method": r["method"],
           "days": r["days"], "total": r["total"], "rent": r["rent"], "discount": r["discount"],
           "deliveryFee": r["delivery_fee"], "deposit": r["deposit"], "address": r["address"],
           "slot": r["slot"], "returnMethod": r["return_method"], "deliveryStatus": r["delivery_status"],
           "unitNum": u["num"] if u else None, "unitId": r["unit_id"], "createdAt": r["created_at"],
           "issuedAt": r["issued_at"], "returnedAt": r["returned_at"]}
    if st == "overdue":
        late = (datetime.fromisoformat(today) - datetime.fromisoformat(r["date_to"])).days
        price = scalar(conn, "SELECT price FROM models WHERE id=?", (r["model_id"],)) or 0
        out["daysLate"] = late
        out["debt"] = late * price
    if full:
        out.update({"client": r["client"], "phone": r["phone"], "idDoc": r["id_doc"], "conditionOut": r["condition_out"],
                    "conditionIn": r["condition_in"], "comment": r["comment"], "nudgedAt": r["nudged_at"],
                    "lateFee": r["late_fee"], "source": r["source"]})
    return out


def _model_out(r: dict) -> dict:
    return {"id": r["id"], "name": r["name"], "cat": r["cat"], "price": r["price"], "deposit": r["deposit"],
            "specs": r["specs"], "description": r["descr"], "icon": r["icon"], "photoUrl": r["photo_url"],
            "active": bool(r["active"])}


# ============ ДЕМО ============

def _insert_booking(conn, rng, model, frm, to, status, today, client=None, unit=None, method=None):
    days = _days(frm, to)
    method = method or ("delivery" if rng.random() < 0.35 else "pickup")
    zone = rng.choice(["z1", "z1", "z2"]) if method == "delivery" else ""
    ret = rng.choice(["self", "courier"]) if method == "delivery" else "self"
    pr = _price(model, days, method, zone, ret)
    name, phone = client or rng.choice(CLIENTS)
    num = _num(conn)
    bid = f"ZK-{num}"
    issued = f"{frm}T10:00:00+03:00" if status in ("active", "returned") else None
    returned = f"{to}T18:00:00+03:00" if status == "returned" else None
    conn.execute(
        "INSERT INTO bookings(id,num,model_id,unit_id,user_id,client,phone,id_doc,date_from,date_to,method,address,zone,slot,"
        "return_method,status,days,rent,discount,delivery_fee,total,deposit,delivery_status,created_at,issued_at,returned_at,"
        "condition_out,condition_in,seed) VALUES(?,?,?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)",
        (bid, num, model["id"], unit, name, phone, "MP" + str(rng.randint(1000000, 9999999)), frm, to, method,
         rng.choice(ADDRESSES) if method == "delivery" else "", zone, rng.choice(list(SLOTS)) if method == "delivery" else "",
         ret, status, days, pr["rent"], pr["discount"], pr["deliveryFee"], pr["total"], pr["deposit"],
         "delivered" if method == "delivery" and status in ("active", "returned") else "", f"{add_days(frm, -rng.randint(0, 4))}T12:00:00+03:00",
         issued, returned, "ok" if issued else "", "ok" if returned else ""))
    return bid


def seed(conn, now: datetime) -> None:
    rng = random.Random(11)
    today = now.date().isoformat()
    for i, (cid, name) in enumerate(SEED_CATS):
        conn.execute("INSERT INTO categories(id,name,sort) VALUES(?,?,?)", (cid, name, i))
    models = []
    for i, (mid, name, cat, price, dep, icon, specs, descr, qty) in enumerate(SEED_MODELS):
        conn.execute("INSERT INTO models(id,name,cat,price,deposit,specs,descr,icon,sort,seed) VALUES(?,?,?,?,?,?,?,?,?,1)",
                     (mid, name, cat, price, dep, specs, descr, icon, i))
        for n in range(1, qty + 1):
            conn.execute("INSERT INTO units(id,model_id,num,status,seed) VALUES(?,?,?,'free',1)", (f"{mid}-{n}", mid, n))
        models.append(one(conn, "SELECT * FROM models WHERE id=?", (mid,)))
    popular = [m for m in models for _ in range({"m1": 6, "m2": 5, "m5": 4, "m10": 4, "m3": 3}.get(m["id"], 2))]
    # история за ~45 дней — возвращённые
    for off in range(-45, -1):
        for _ in range(rng.choice([2, 3, 3, 4, 5])):
            m = rng.choice(popular)
            frm = add_days(today, off)
            to = add_days(frm, rng.choice([0, 1, 1, 2, 2, 3, 4, 6]))
            if to >= today:
                continue
            free, _ = _free(conn, m["id"], frm, to, today)
            if free > 0:
                _insert_booking(conn, rng, m, frm, to, "cancelled" if rng.random() < 0.05 else "returned", today,
                                client=rng.choice(CLIENTS[:5]) if rng.random() < 0.45 else None)
    # выданы сейчас (в т.ч. два просроченных)
    active_plan = [("m1", -2, 2), ("m1", -1, 3), ("m2", -3, 0), ("m3", -4, 1), ("m5", -1, 1), ("m5", -2, 0),
                   ("m10", -1, 2), ("m4", -2, 4), ("m6", -6, -2), ("m2", -8, -3)]
    for mid, a, b in active_plan:
        m = next(x for x in models if x["id"] == mid)
        unit = scalar(conn, "SELECT id FROM units WHERE model_id=? AND status='free' ORDER BY num LIMIT 1", (mid,))
        bid = _insert_booking(conn, rng, m, add_days(today, a), add_days(today, b), "active", today, unit=unit)
        conn.execute("UPDATE units SET status='rented', booking_id=? WHERE id=?", (bid, unit))
    # ждут выдачи: сегодня, завтра и дальше
    for mid, a, b in [("m1", 0, 2), ("m4", 0, 5), ("m7", 0, 1), ("m3", 1, 3), ("m8", 1, 2), ("m5", 2, 4), ("m9", 3, 3), ("m12", 4, 6)]:
        m = next(x for x in models if x["id"] == mid)
        _insert_booking(conn, rng, m, add_days(today, a), add_days(today, b), "pending", today)
    # ремонт
    conn.execute("UPDATE units SET status='repair' WHERE id IN ('m1-5','m11-2')")
    for uid, mid, opened, closed, note, st in [
        ("m1-5", "m1", add_days(today, -5), None, "Трещина корпуса, сломана боковая ручка", "in_repair"),
        ("m11-2", "m11", add_days(today, -2), None, "Не крутится круг — щётки двигателя", "in_repair"),
        ("m2-4", "m2", add_days(today, -19), add_days(today, -14), "Замена защитного кожуха", "fixed"),
        ("m5-2", "m5", add_days(today, -27), add_days(today, -25), "Обрыв катушки с леской", "fixed"),
    ]:
        conn.execute("INSERT INTO repairs(id,unit_id,model_id,opened,closed,note,status,seed) VALUES(?,?,?,?,?,?,?,1)",
                     (new_id("rp"), uid, mid, opened, closed, note, st))


def refresh(conn, now: datetime) -> None:
    """Раз в сутки: демо-выдачи «возвращаются», ждущие — «выдаются», чтобы
    сегодняшние экраны админа не пустели."""
    today = now.date().isoformat()
    rng = random.Random(today)
    for r in rows(conn, "SELECT * FROM bookings WHERE seed=1 AND status='active' AND date_to<?", (add_days(today, -6),)):
        conn.execute("UPDATE bookings SET status='returned', returned_at=?, condition_in='ok' WHERE id=?", (iso_now(), r["id"]))
        conn.execute("UPDATE units SET status='free', booking_id=NULL WHERE booking_id=?", (r["id"],))
    for r in rows(conn, "SELECT * FROM bookings WHERE seed=1 AND status='pending' AND date_from<?", (today,)):
        unit = scalar(conn, "SELECT id FROM units WHERE model_id=? AND status='free' ORDER BY num LIMIT 1", (r["model_id"],))
        if unit:
            conn.execute("UPDATE bookings SET status='active', unit_id=?, issued_at=?, condition_out='ok' WHERE id=?", (unit, iso_now(), r["id"]))
            conn.execute("UPDATE units SET status='rented', booking_id=? WHERE id=?", (r["id"], unit))
        else:
            conn.execute("UPDATE bookings SET status='cancelled' WHERE id=?", (r["id"],))
    pending_today = scalar(conn, "SELECT COUNT(*) FROM bookings WHERE status='pending' AND date_from<=?", (add_days(today, 1),))
    models = rows(conn, "SELECT * FROM models WHERE active=1")
    for _ in range(max(0, 4 - pending_today)):
        m = rng.choice(models)
        frm = add_days(today, rng.choice([0, 0, 1]))
        to = add_days(frm, rng.choice([1, 2, 3]))
        if _free(conn, m["id"], frm, to, today)[0] > 0:
            _insert_booking(conn, rng, m, frm, to, "pending", today)


bot = Bot("toolrent", SCHEMA, seed, refresh)


# ============ КЛИЕНТ ============

@bot.action("getModels")
def get_models(c: Ctx, p: dict):
    cats = [{"id": r["id"], "name": r["name"]} for r in rows(c.conn, "SELECT * FROM categories ORDER BY sort")]
    models = []
    for r in rows(c.conn, "SELECT * FROM models WHERE active=1 ORDER BY sort, rowid"):
        m = _model_out(r)
        m["freeToday"], m["totalQty"] = _free(c.conn, r["id"], c.today, c.today, c.today)
        models.append(m)
    return {"categories": cats, "models": models, "config": CONFIG}


def _period(c: Ctx, p: dict, allow_past=False) -> tuple[str, str]:
    frm, to = v_date(p, "from"), v_date(p, "to")
    if to < frm:
        raise ApiError("bad_request", "Дата возврата раньше выдачи")
    if not allow_past and frm < c.today:
        raise ApiError("bad_date", "Дата в прошлом")
    if frm > add_days(c.today, 90):
        raise ApiError("bad_date", "Бронь не дальше 90 дней")
    if _days(frm, to) > CONFIG["maxDays"]:
        raise ApiError("bad_request", f"Не больше {CONFIG['maxDays']} суток")
    return frm, to


def _model(c: Ctx, model_id: str) -> dict:
    m = one(c.conn, "SELECT * FROM models WHERE id=? AND active=1", (model_id,))
    if not m:
        raise ApiError("not_found")
    return m


@bot.action("checkAvailability")
def check_availability(c: Ctx, p: dict):
    m = _model(c, v_id(p, "modelId"))
    frm, to = _period(c, p)
    free, total = _free(c.conn, m["id"], frm, to, c.today)
    return {"free": free, "total": total}


def _delivery(p: dict) -> dict:
    method = v_enum(p, "method", ["pickup", "delivery"])
    if method == "pickup":
        return {"method": "pickup", "zone": "", "address": "", "slot": "", "returnMethod": "self"}
    return {"method": "delivery", "zone": v_enum(p, "zone", list(ZONES), required=False, default="z1"),
            "address": v_str(p, "address", max_len=160, min_len=5), "slot": v_enum(p, "slot", list(SLOTS)),
            "returnMethod": v_enum(p, "returnMethod", ["self", "courier"], required=False, default="self")}


@bot.action("quote")
def quote(c: Ctx, p: dict):
    m = _model(c, v_id(p, "modelId"))
    frm, to = _period(c, p)
    method = v_enum(p, "method", ["pickup", "delivery"], required=False, default="pickup")
    zone = v_enum(p, "zone", list(ZONES), required=False, default="z1")
    ret = v_enum(p, "returnMethod", ["self", "courier"], required=False, default="self")
    return {"quote": _price(m, _days(frm, to), method, zone, ret)}


@bot.action("createBooking", write=True)
def create_booking(c: Ctx, p: dict):
    user = c.need_user()
    m = _model(c, v_id(p, "modelId"))
    frm, to = _period(c, p)
    d = _delivery(p)
    name = v_str(p, "name", max_len=80, min_len=3)
    phone = v_phone(p, "phone")
    id_doc = v_str(p, "idDoc", max_len=20, min_len=4).upper()
    act = scalar(c.conn, "SELECT COUNT(*) FROM bookings WHERE user_id=? AND status IN ('pending','active')", (user,))
    if act >= PER_USER_ACTIVE:
        raise ApiError("too_many")
    if _free(c.conn, m["id"], frm, to, c.today)[0] <= 0:
        raise ApiError("unavailable", "На эти даты всё занято")
    cap_rows(c.conn, "bookings", LIMITS["bookings"])
    pr = _price(m, _days(frm, to), d["method"], d["zone"], d["returnMethod"])
    num = _num(c.conn)
    bid = f"ZK-{num}"
    c.conn.execute(
        "INSERT INTO bookings(id,num,model_id,user_id,client,phone,id_doc,date_from,date_to,method,address,zone,slot,return_method,"
        "status,days,rent,discount,delivery_fee,total,deposit,delivery_status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?,?,?,?,?,?,?)",
        (bid, num, m["id"], user, name, phone, id_doc, frm, to, d["method"], d["address"], d["zone"], d["slot"], d["returnMethod"],
         pr["days"], pr["rent"], pr["discount"], pr["deliveryFee"], pr["total"], pr["deposit"],
         "new" if d["method"] == "delivery" else "", iso_now()))
    return {"booking": _booking_out(c.conn, one(c.conn, "SELECT * FROM bookings WHERE id=?", (bid,)), c.today), "orderId": bid}


@bot.action("getMyBookings")
def get_my_bookings(c: Ctx, p: dict):
    user = c.need_user()
    rs = rows(c.conn, "SELECT * FROM bookings WHERE user_id=? ORDER BY created_at DESC LIMIT 40", (user,))
    return {"bookings": [_booking_out(c.conn, r, c.today) for r in rs]}


@bot.action("cancelBooking", write=True)
def cancel_booking(c: Ctx, p: dict):
    user = c.need_user()
    r = one(c.conn, "SELECT * FROM bookings WHERE id=? AND user_id=?", (v_id(p, "id"), user))
    if not r:
        raise ApiError("not_found")
    if r["status"] != "pending":
        raise ApiError("bad_state", "Инструмент уже выдан")
    c.conn.execute("UPDATE bookings SET status='cancelled' WHERE id=?", (r["id"],))
    return {}


@bot.action("extendBooking", write=True)
def extend_booking(c: Ctx, p: dict):
    user = c.need_user()
    r = one(c.conn, "SELECT * FROM bookings WHERE id=? AND user_id=?", (v_id(p, "id"), user))
    if not r:
        raise ApiError("not_found")
    if r["status"] not in ("active", "pending"):
        raise ApiError("bad_state")
    new_to = v_date(p, "newTo")
    if new_to <= r["date_to"] or _days(r["date_from"], new_to) > CONFIG["maxDays"]:
        raise ApiError("bad_request", "Неверная новая дата")
    free, _ = _free(c.conn, r["model_id"], add_days(r["date_to"], 1), new_to, c.today, exclude=r["id"])
    if free <= 0:
        raise ApiError("unavailable", "На эти даты продлить нельзя")
    m = one(c.conn, "SELECT * FROM models WHERE id=?", (r["model_id"],))
    pr = _price(m, _days(r["date_from"], new_to), r["method"], r["zone"], r["return_method"])
    c.conn.execute("UPDATE bookings SET date_to=?, days=?, rent=?, discount=?, total=? WHERE id=?",
                   (new_to, pr["days"], pr["rent"], pr["discount"], pr["total"], r["id"]))
    return {"booking": _booking_out(c.conn, one(c.conn, "SELECT * FROM bookings WHERE id=?", (r["id"],)), c.today)}


# ============ АДМИН ============

@bot.action("getToday")
def get_today(c: Ctx, p: dict):
    t = c.today
    handout = rows(c.conn, "SELECT * FROM bookings WHERE status='pending' AND date_from<=? ORDER BY date_from, num", (add_days(t, 1),))
    ret = rows(c.conn, "SELECT * FROM bookings WHERE status='active' AND date_to<=? ORDER BY date_to, num", (add_days(t, 1),))
    deliveries = rows(c.conn, "SELECT * FROM bookings WHERE method='delivery' AND status='pending' AND date_from<=? ORDER BY date_from", (add_days(t, 1),))
    stats = {
        "rented": scalar(c.conn, "SELECT COUNT(*) FROM units WHERE status='rented'"),
        "free": scalar(c.conn, "SELECT COUNT(*) FROM units WHERE status='free'"),
        "repair": scalar(c.conn, "SELECT COUNT(*) FROM units WHERE status='repair'"),
        "overdue": scalar(c.conn, "SELECT COUNT(*) FROM bookings WHERE status='active' AND date_to<?", (t,)),
    }
    f = lambda rs: [_booking_out(c.conn, r, t, full=True) for r in rs]  # noqa: E731
    return {"handout": f(handout), "ret": f(ret), "deliveries": f(deliveries), "stats": stats}


@bot.action("getUnits")
def get_units(c: Ctx, p: dict):
    units = []
    for r in rows(c.conn, "SELECT * FROM units WHERE status<>'retired' ORDER BY model_id, num"):
        units.append({"id": r["id"], "modelId": r["model_id"], "num": r["num"], "status": r["status"], "bookingId": r["booking_id"]})
    models = [_model_out(r) for r in rows(c.conn, "SELECT * FROM models ORDER BY sort, rowid")]
    cats = [{"id": r["id"], "name": r["name"]} for r in rows(c.conn, "SELECT * FROM categories ORDER BY sort")]
    return {"units": units, "models": models, "categories": cats}


@bot.action("getFreeUnits")
def get_free_units(c: Ctx, p: dict):
    rs = rows(c.conn, "SELECT * FROM units WHERE model_id=? AND status='free' ORDER BY num", (v_id(p, "modelId"),))
    return {"units": [{"id": r["id"], "num": r["num"]} for r in rs]}


@bot.action("getUnitBooking")
def get_unit_booking(c: Ctx, p: dict):
    u = one(c.conn, "SELECT * FROM units WHERE id=?", (v_id(p, "unitId"),))
    if not u:
        raise ApiError("not_found")
    b = one(c.conn, "SELECT * FROM bookings WHERE id=?", (u["booking_id"],)) if u["booking_id"] else None
    repair = one(c.conn, "SELECT * FROM repairs WHERE unit_id=? AND status='in_repair' ORDER BY opened DESC LIMIT 1", (u["id"],))
    hist = rows(c.conn, "SELECT * FROM bookings WHERE unit_id=? AND status='returned' ORDER BY returned_at DESC LIMIT 5", (u["id"],))
    return {"booking": _booking_out(c.conn, b, c.today, full=True) if b else None,
            "repair": {"note": repair["note"], "opened": repair["opened"]} if repair else None,
            "history": [_booking_out(c.conn, h, c.today, full=True) for h in hist]}


@bot.action("checkOut", write=True)
def check_out(c: Ctx, p: dict):
    b = one(c.conn, "SELECT * FROM bookings WHERE id=?", (v_id(p, "bookingId"),))
    if not b or b["status"] != "pending":
        raise ApiError("bad_state")
    u = one(c.conn, "SELECT * FROM units WHERE id=? AND model_id=? AND status='free'", (v_id(p, "unitId"), b["model_id"]))
    if not u:
        raise ApiError("unit_busy", "Эта единица уже занята")
    cond = v_enum(p, "condition", ["ok", "bad"], required=False, default="ok")
    comment = v_str(p, "comment", max_len=300, required=False)
    c.conn.execute("UPDATE bookings SET status='active', unit_id=?, issued_at=?, condition_out=?, comment=?, "
                   "delivery_status=CASE WHEN method='delivery' THEN 'delivered' ELSE delivery_status END WHERE id=?",
                   (u["id"], iso_now(), cond, comment, b["id"]))
    c.conn.execute("UPDATE units SET status='rented', booking_id=? WHERE id=?", (b["id"], u["id"]))
    return {}


@bot.action("checkIn", write=True)
def check_in(c: Ctx, p: dict):
    b = one(c.conn, "SELECT * FROM bookings WHERE id=?", (v_id(p, "bookingId"),))
    if not b or b["status"] != "active":
        raise ApiError("bad_state")
    damaged = v_bool(p, "damaged")
    comment = v_str(p, "comment", max_len=300, required=False)
    late = max(0, (datetime.fromisoformat(c.today) - datetime.fromisoformat(b["date_to"])).days)
    price = scalar(c.conn, "SELECT price FROM models WHERE id=?", (b["model_id"],)) or 0
    c.conn.execute("UPDATE bookings SET status='returned', returned_at=?, condition_in=?, comment=TRIM(comment||' '||?), late_fee=? WHERE id=?",
                   (iso_now(), "bad" if damaged else "ok", comment, late * price, b["id"]))
    if b["unit_id"]:
        c.conn.execute("UPDATE units SET status=?, booking_id=NULL WHERE id=?", ("repair" if damaged else "free", b["unit_id"]))
        if damaged:
            cap_rows(c.conn, "repairs", LIMITS["repairs"])
            c.conn.execute("INSERT INTO repairs(id,unit_id,model_id,opened,note,status) VALUES(?,?,?,?,?,'in_repair')",
                           (new_id("rp"), b["unit_id"], b["model_id"], c.today, comment or "Повреждение при возврате"))
    return {"lateFee": late * price}


@bot.action("setUnitStatus", write=True)
def set_unit_status(c: Ctx, p: dict):
    u = one(c.conn, "SELECT * FROM units WHERE id=?", (v_id(p, "unitId"),))
    if not u:
        raise ApiError("not_found")
    status = v_enum(p, "status", ["free", "repair", "retired"])
    if u["status"] == "rented":
        raise ApiError("bad_state", "Единица в аренде")
    note = v_str(p, "note", max_len=200, required=False)
    c.conn.execute("UPDATE units SET status=? WHERE id=?", (status, u["id"]))
    if status == "repair" and u["status"] != "repair":
        cap_rows(c.conn, "repairs", LIMITS["repairs"])
        c.conn.execute("INSERT INTO repairs(id,unit_id,model_id,opened,note,status) VALUES(?,?,?,?,?,'in_repair')",
                       (new_id("rp"), u["id"], u["model_id"], c.today, note or "Плановый ремонт"))
    if u["status"] == "repair" and status != "repair":
        c.conn.execute("UPDATE repairs SET status='fixed', closed=? WHERE unit_id=? AND status='in_repair'", (c.today, u["id"]))
    return {}


@bot.action("addUnit", write=True)
def add_unit(c: Ctx, p: dict):
    m = _model(c, v_id(p, "modelId"))
    if scalar(c.conn, "SELECT COUNT(*) FROM units") >= LIMITS["units"]:
        raise ApiError("limit")
    n = (scalar(c.conn, "SELECT MAX(num) FROM units WHERE model_id=?", (m["id"],)) or 0) + 1
    uid = f"{m['id']}-{n}"
    c.conn.execute("INSERT INTO units(id,model_id,num,status) VALUES(?,?,?,'free')", (uid, m["id"], n))
    return {"unit": {"id": uid, "modelId": m["id"], "num": n, "status": "free"}}


@bot.action("updateModel", write=True)
def update_model(c: Ctx, p: dict):
    mid = v_id(p, "modelId", required=False)
    data = {
        "name": v_str(p, "name", max_len=80, min_len=3, required=False),
        "specs": v_str(p, "specs", max_len=120, required=False),
        "descr": v_str(p, "description", max_len=600, required=False, multiline=True),
        "photo_url": v_str(p, "photoUrl", max_len=300, required=False),
        "price": v_num(p, "price", lo=1, hi=10000, required=False, default=None),
        "deposit": v_num(p, "deposit", hi=100000, required=False, default=None),
        "cat": v_id(p, "cat", required=False),
        "icon": v_enum(p, "icon", ICONS, required=False, default=None),
    }
    if data["photo_url"] and not data["photo_url"].startswith("https://"):
        raise ApiError("bad_request", "Фото — только https-ссылка")
    if data["cat"] and not one(c.conn, "SELECT 1 FROM categories WHERE id=?", (data["cat"],)):
        raise ApiError("bad_request", "Нет такой категории")
    if mid and one(c.conn, "SELECT 1 FROM models WHERE id=?", (mid,)):
        # обновляем только поля, которые пришли в запросе
        keys = {"name": "name", "specs": "specs", "description": "descr", "photoUrl": "photo_url", "price": "price",
                "deposit": "deposit", "cat": "cat", "icon": "icon"}
        sets = {col: data[col] for k, col in keys.items() if k in p and (data[col] not in (None, "") or col in ("specs", "descr", "photo_url"))}
        if not sets:
            raise ApiError("bad_request", "Нечего сохранять")
        c.conn.execute(f"UPDATE models SET {','.join(k + '=?' for k in sets)} WHERE id=?", (*sets.values(), mid))
    else:
        if not data["name"] or not data["price"] or not data["cat"]:
            raise ApiError("bad_request", "Название, категория и цена обязательны")
        if scalar(c.conn, "SELECT COUNT(*) FROM models") >= LIMITS["models"]:
            raise ApiError("limit")
        mid = new_id("m")
        c.conn.execute("INSERT INTO models(id,name,cat,price,deposit,specs,descr,icon,photo_url,sort) VALUES(?,?,?,?,?,?,?,?,?,?)",
                       (mid, data["name"], data["cat"], data["price"], data["deposit"] or 0, data["specs"], data["descr"],
                        data["icon"] or "drill", data["photo_url"], 100))
        c.conn.execute("INSERT INTO units(id,model_id,num,status) VALUES(?,?,1,'free')", (f"{mid}-1", mid))
    return {"model": _model_out(one(c.conn, "SELECT * FROM models WHERE id=?", (mid,)))}


@bot.action("getAllBookings")
def get_all_bookings(c: Ctx, p: dict):
    rs = rows(c.conn, "SELECT * FROM bookings WHERE date_to>=? ORDER BY date_from DESC, num DESC LIMIT 300", (add_days(c.today, -30),))
    return {"bookings": [_booking_out(c.conn, r, c.today, full=True) for r in rs]}


@bot.action("createBookingManual", write=True)
def create_booking_manual(c: Ctx, p: dict):
    m = _model(c, v_id(p, "modelId"))
    frm, to = _period(c, p)
    d = _delivery(p)
    client = v_str(p, "client", max_len=80, min_len=2)
    phone = v_phone(p, "phone")
    if _free(c.conn, m["id"], frm, to, c.today)[0] <= 0:
        raise ApiError("unavailable", "На эти даты всё занято")
    cap_rows(c.conn, "bookings", LIMITS["bookings"])
    pr = _price(m, _days(frm, to), d["method"], d["zone"], d["returnMethod"])
    num = _num(c.conn)
    bid = f"ZK-{num}"
    c.conn.execute(
        "INSERT INTO bookings(id,num,model_id,client,phone,date_from,date_to,method,address,zone,slot,return_method,status,days,rent,"
        "discount,delivery_fee,total,deposit,delivery_status,created_at,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?,?,?,?,?,?,?,'admin')",
        (bid, num, m["id"], client, phone, frm, to, d["method"], d["address"], d["zone"], d["slot"], d["returnMethod"],
         pr["days"], pr["rent"], pr["discount"], pr["deliveryFee"], pr["total"], pr["deposit"],
         "new" if d["method"] == "delivery" else "", iso_now()))
    return {"orderId": bid, "booking": _booking_out(c.conn, one(c.conn, "SELECT * FROM bookings WHERE id=?", (bid,)), c.today, full=True)}


@bot.action("setDeliveryStatus", write=True)
def set_delivery_status(c: Ctx, p: dict):
    st = v_enum(p, "status", ["new", "on_way", "delivered"])
    cur = c.conn.execute("UPDATE bookings SET delivery_status=? WHERE id=? AND method='delivery'", (st, v_id(p, "bookingId")))
    if cur.rowcount == 0:
        raise ApiError("not_found")
    return {}


# ============ ВЛАДЕЛЕЦ ============
DOW = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]


def _revenue_rows(c: Ctx, frm: str, to: str):
    # выручка относится к дню выдачи (оплата при получении)
    return rows(c.conn, "SELECT * FROM bookings WHERE status IN ('active','returned') AND date_from BETWEEN ? AND ?", (frm, to))


def _sum(rs) -> dict:
    rev = sum(r["total"] + r["late_fee"] for r in rs)
    pick = sum(r["total"] for r in rs if r["method"] == "pickup")
    return {"revenue": round(rev, 2), "count": len(rs), "pickup": round(pick, 2), "delivery": round(rev - pick, 2),
            "avg": round(rev / len(rs)) if rs else 0}


@bot.action("getOverview")
def get_overview(c: Ctx, p: dict):
    t = c.today
    frm = v_date(p, "from", required=False, default=None)
    to = v_date(p, "to", required=False, default=None)
    data = {"today": _sum(_revenue_rows(c, t, t)), "week": _sum(_revenue_rows(c, add_days(t, -6), t)),
            "month": _sum(_revenue_rows(c, t[:8] + "01", t)), "prevWeek": _sum(_revenue_rows(c, add_days(t, -13), add_days(t, -7)))}
    cf, ct = (frm, to) if frm and to else (add_days(t, -6), t)
    if (datetime.fromisoformat(ct) - datetime.fromisoformat(cf)).days > 92:
        raise ApiError("bad_request", "Период не больше 3 месяцев")
    if frm and to:
        data["custom"] = _sum(_revenue_rows(c, cf, ct))
    chart, day = [], cf
    span = (datetime.fromisoformat(ct) - datetime.fromisoformat(cf)).days
    while day <= ct:
        rs = _revenue_rows(c, day, day)
        d = datetime.fromisoformat(day)
        chart.append({"day": DOW[d.weekday()] if span <= 7 else str(d.day), "date": day, "revenue": round(sum(r["total"] for r in rs))})
        day = add_days(day, 1)
    rs = _revenue_rows(c, cf, ct)
    models = {r["id"]: r["name"] for r in rows(c.conn, "SELECT id,name FROM models")}
    tm, tc = {}, {}
    for r in rs:
        a = tm.setdefault(models.get(r["model_id"], "—"), [0, 0]); a[0] += r["total"]; a[1] += 1
        b = tc.setdefault(r["client"], [0, 0]); b[0] += r["total"]; b[1] += 1
    top_m = sorted(({"name": k, "revenue": round(v[0]), "bookings": v[1]} for k, v in tm.items()), key=lambda x: -x["revenue"])[:5]
    top_c = sorted(({"name": k, "revenue": round(v[0]), "bookings": v[1]} for k, v in tc.items()), key=lambda x: (-x["bookings"], -x["revenue"]))[:5]
    data.update({"week7": chart, "topModels": top_m, "topClients": top_c})
    return {"data": data}


@bot.action("getUtilization")
def get_utilization(c: Ctx, p: dict):
    t = c.today
    frm = add_days(t, -29)
    out = []
    for m in rows(c.conn, "SELECT * FROM models WHERE active=1 ORDER BY sort"):
        qty = scalar(c.conn, "SELECT COUNT(*) FROM units WHERE model_id=? AND status<>'retired'", (m["id"],))
        busy_days = 0
        for r in rows(c.conn, "SELECT date_from, date_to, status, returned_at FROM bookings WHERE model_id=? AND status IN ('active','returned') AND date_to>=? AND date_from<=?",
                      (m["id"], frm, t)):
            a = max(r["date_from"], frm)
            b = min(t if r["status"] == "active" else r["date_to"], t)
            if b >= a:
                busy_days += _days(a, b)
        pct = round(busy_days / (qty * 30) * 100) if qty else 0
        rev = scalar(c.conn, "SELECT COALESCE(SUM(total),0) FROM bookings WHERE model_id=? AND status IN ('active','returned') AND date_from>=?", (m["id"], frm))
        out.append({"id": m["id"], "name": m["name"], "totalQty": qty, "pct": min(100, pct), "revenue": round(rev)})
    out.sort(key=lambda x: -x["pct"])
    models = {r["id"]: r["name"] for r in rows(c.conn, "SELECT id,name FROM models")}
    repairs = []
    for r in rows(c.conn, "SELECT r.*, u.num FROM repairs r LEFT JOIN units u ON u.id=r.unit_id ORDER BY r.status='fixed', r.opened DESC LIMIT 30"):
        repairs.append({"id": r["id"], "model": models.get(r["model_id"], "—"), "unit": f"№{r['num']}" if r["num"] else "—",
                        "unitId": r["unit_id"], "date": r["opened"], "closed": r["closed"], "status": r["status"], "note": r["note"]})
    return {"list": out, "repairs": repairs}


@bot.action("getOverdue")
def get_overdue(c: Ctx, p: dict):
    rs = rows(c.conn, "SELECT * FROM bookings WHERE status='active' AND date_to<? ORDER BY date_to", (c.today,))
    out = []
    for r in rs:
        b = _booking_out(c.conn, r, c.today, full=True)
        b["dailyPrice"] = scalar(c.conn, "SELECT price FROM models WHERE id=?", (r["model_id"],))
        out.append(b)
    return {"list": out}


@bot.action("nudgeClient", write=True)
def nudge_client(c: Ctx, p: dict):
    cur = c.conn.execute("UPDATE bookings SET nudged_at=? WHERE id=? AND status='active'", (iso_now(), v_id(p, "id")))
    if cur.rowcount == 0:
        raise ApiError("not_found")
    return {"nudgedAt": iso_now()}


@bot.action("getCatalog")
def get_catalog(c: Ctx, p: dict):
    cats = {r["id"]: r["name"] for r in rows(c.conn, "SELECT * FROM categories")}
    out = []
    for r in rows(c.conn, "SELECT * FROM models ORDER BY sort, rowid"):
        m = _model_out(r)
        m["catName"] = cats.get(r["cat"], "")
        m["totalQty"] = scalar(c.conn, "SELECT COUNT(*) FROM units WHERE model_id=? AND status<>'retired'", (r["id"],))
        out.append(m)
    return {"models": out, "categories": [{"id": k, "name": v} for k, v in cats.items()], "icons": ICONS}


@bot.action("setModelActive", write=True)
def set_model_active(c: Ctx, p: dict):
    cur = c.conn.execute("UPDATE models SET active=? WHERE id=?", (int(v_bool(p, "active")), v_id(p, "modelId")))
    if cur.rowcount == 0:
        raise ApiError("not_found")
    return {}


@bot.action("getBookingsForExport")
def get_bookings_for_export(c: Ctx, p: dict):
    frm = v_date(p, "from", required=False, default=add_days(c.today, -30))
    to = v_date(p, "to", required=False, default=c.today)
    rs = rows(c.conn, "SELECT * FROM bookings WHERE date_from BETWEEN ? AND ? ORDER BY date_from", (frm, to))
    return {"bookings": [_booking_out(c.conn, r, c.today, full=True) for r in rs]}
