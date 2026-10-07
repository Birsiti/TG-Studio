# изменено 2026-10-08 02:15
"""Автомойка «БЛЕСК» — повторяет контракт action из carwash-miniapp/Code.gs
(кроме getMyTheme/saveTheme: тема теперь личная настройка в браузере).

Отличия от Apps Script-версии, важные для фронта:
  * createBooking принимает serviceIds — цену и названия считает сервер;
  * время слотов в формате HH:MM;
  * shiftsMonth/accruedMonth у персонала считаются из смен, выполненных
    записей и выплат текущего месяца (а не хранятся вручную).
"""
from __future__ import annotations

import random
from datetime import datetime

from core import (ApiError, Bot, Ctx, add_days, cap_rows, hm_to_min, iso_now, jdump, jload, min_to_hm,
                  new_id, one, rows, scalar, upsert, v_bool, v_date, v_enum, v_id, v_ids, v_int, v_num,
                  v_obj, v_phone, v_str, v_time)

CAR_CLASSES = ["legkovoy", "krossover", "vnedorozhnik", "minivan"]
STATUSES = ["pending", "confirmed", "done", "cancelled"]
STATUS_RU = {"pending": "Ожидает", "confirmed": "Подтверждена", "done": "Выполнена", "cancelled": "Отменена"}
WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
SLOT_STEP = 30
BOOK_AHEAD_DAYS = 30

SCHEMA = """
CREATE TABLE IF NOT EXISTS services(
  id TEXT PRIMARY KEY, category TEXT NOT NULL, name TEXT NOT NULL, descr TEXT NOT NULL DEFAULT '',
  prices TEXT NOT NULL, visible INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0, seed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS bookings(
  id TEXT PRIMARY KEY, date TEXT NOT NULL, time TEXT NOT NULL,
  car_number TEXT NOT NULL, car_brand TEXT NOT NULL DEFAULT '', car_model TEXT NOT NULL DEFAULT '', car_class TEXT NOT NULL,
  services TEXT NOT NULL, service_ids TEXT NOT NULL DEFAULT '[]', price_min REAL NOT NULL, price_max REAL NOT NULL,
  client_name TEXT NOT NULL, client_phone TEXT NOT NULL, user_id TEXT,
  status TEXT NOT NULL, staff_id TEXT, created_at TEXT NOT NULL, seed INTEGER NOT NULL DEFAULT 0);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_slot ON bookings(date, time) WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS bookings_date ON bookings(date);
CREATE TABLE IF NOT EXISTS cars(
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, number TEXT NOT NULL, brand TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '',
  car_class TEXT NOT NULL DEFAULT '', last_used_at TEXT NOT NULL, seed INTEGER NOT NULL DEFAULT 0, UNIQUE(user_id, number));
CREATE TABLE IF NOT EXISTS staff(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, pay_type TEXT NOT NULL, rate REAL NOT NULL,
  phone TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, seed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS shifts(date TEXT PRIMARY KEY, staff_ids TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS schedule(weekday TEXT PRIMARY KEY, open INTEGER NOT NULL, from_t TEXT NOT NULL, to_t TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS closed_dates(date TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS blocked_slots(date TEXT NOT NULL, time TEXT NOT NULL, PRIMARY KEY(date, time));
CREATE TABLE IF NOT EXISTS bays(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
  today_count INTEGER NOT NULL DEFAULT 0, today_revenue REAL NOT NULL DEFAULT 0, seed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS inventory(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, unit TEXT NOT NULL, qty REAL NOT NULL, min REAL NOT NULL, price REAL NOT NULL,
  seed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS shop(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL, stock INTEGER NOT NULL, visible INTEGER NOT NULL DEFAULT 1,
  seed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS payouts(
  id TEXT PRIMARY KEY, staff_id TEXT NOT NULL, amount REAL NOT NULL, date TEXT NOT NULL, created_at TEXT NOT NULL,
  seed INTEGER NOT NULL DEFAULT 0);
"""

LIMITS = {"bookings": 6000, "cars": 3000, "services": 80, "staff": 60, "bays": 20, "inventory": 120,
          "shop": 120, "payouts": 3000, "blocked_slots": 2000, "closed_dates": 400}
PER_USER_ACTIVE_BOOKINGS = 8
PER_USER_CARS = 10

# ============ ДЕМО-ДАННЫЕ ============
SEED_SERVICES = [
    ("Мойка", [
        ("wash-express", "Экспресс-смыв кузова", {"legkovoy": [8, 8], "krossover": [9, 9], "vnedorozhnik": [10, 10], "minivan": [12, 12]}, "Активная пена и смыв под давлением — 10 минут."),
        ("wash-contactless", "Бесконтактная мойка", {"legkovoy": [15, 15], "krossover": [18, 18], "vnedorozhnik": [20, 20], "minivan": [24, 24]}, "Двухфазная химия, ополаскивание осмосом, сушка."),
        ("wash-standard", "Стандарт", {"legkovoy": [30, 35], "krossover": [35, 40], "vnedorozhnik": [40, 45], "minivan": [45, 50]}, "Предмойка, ручная мойка кузова, воск, сушка кузова и проёмов, коврики."),
        ("wash-lux", "Люкс", {"legkovoy": [50, 60], "krossover": [55, 65], "vnedorozhnik": [60, 70], "minivan": [65, 75]}, "Всё из «Стандарта» + пылесос салона и багажника, пластик, стёкла изнутри."),
        ("wash-nano", "Nano-комплекс", {"legkovoy": [85, 100], "krossover": [90, 105], "vnedorozhnik": [95, 110], "minivan": [100, 115]}, "Nano-шампунь и консервант, полная уборка салона, чернение шин."),
    ]),
    ("Салон", [
        ("in-vacuum", "Пылесос салона", {"legkovoy": [12, 20], "krossover": [14, 24], "vnedorozhnik": [16, 28], "minivan": [18, 30]}, ""),
        ("in-plastic", "Чистка и полироль пластика", {"legkovoy": [20, 30], "krossover": [22, 32], "vnedorozhnik": [25, 35], "minivan": [28, 38]}, ""),
        ("in-seat", "Химчистка сиденья", {"legkovoy": [35, 60], "krossover": [35, 60], "vnedorozhnik": [35, 60], "minivan": [35, 60]}, "Цена за одно сиденье, ткань или кожа."),
        ("in-full", "Полная химчистка салона", {"legkovoy": [220, 450], "krossover": [260, 520], "vnedorozhnik": [300, 600], "minivan": [320, 650]}, "Пол, потолок, сиденья, двери, багажник. Сушка до 6 часов."),
    ]),
    ("Детейлинг", [
        ("det-headlights", "Полировка фар (пара)", {"legkovoy": [60, 120], "krossover": [60, 120], "vnedorozhnik": [60, 120], "minivan": [60, 120]}, ""),
        ("det-wax", "Твёрдый воск", {"legkovoy": [70, 90], "krossover": [80, 100], "vnedorozhnik": [90, 110], "minivan": [95, 120]}, "Блеск и защита до 2 месяцев."),
        ("det-polish", "Полировка кузова", {"legkovoy": [350, 900], "krossover": [400, 1000], "vnedorozhnik": [450, 1100], "minivan": [500, 1200]}, "Абразивная двухэтапная полировка."),
        ("det-ceramic", "Керамика", {"legkovoy": [900, 1600], "krossover": [1000, 1800], "vnedorozhnik": [1100, 2000], "minivan": [1200, 2100]}, "Защитное покрытие кузова на 1–2 года."),
    ]),
    ("Доп. услуги", [
        ("ex-tires", "Чернение резины", {"legkovoy": [6, 8], "krossover": [6, 8], "vnedorozhnik": [8, 10], "minivan": [8, 10]}, ""),
        ("ex-engine", "Мойка двигателя", {"legkovoy": [35, 60], "krossover": [35, 60], "vnedorozhnik": [40, 70], "minivan": [40, 70]}, ""),
        ("ex-rain", "Антидождь на лобовое", {"legkovoy": [25, 40], "krossover": [25, 40], "vnedorozhnik": [25, 40], "minivan": [30, 45]}, ""),
        ("ex-disks", "Мойка дисков с химией", {"legkovoy": [10, 15], "krossover": [12, 18], "vnedorozhnik": [14, 20], "minivan": [14, 20]}, ""),
    ]),
]

SEED_STAFF = [
    ("st-artem", "Артём Ковалёв", "Мойщик", "percent", 30, "+375291112233"),
    ("st-ilya", "Илья Савицкий", "Мойщик", "percent", 30, "+375296667788"),
    ("st-maxim", "Максим Жук", "Детейлер", "percent", 35, "+375447778899"),
    ("st-denis", "Денис Лапко", "Мойщик", "percent", 28, "+375333334455"),
    ("st-olga", "Ольга Мельник", "Администратор", "fixed", 70, "+375255556677"),
]

FIRST_NAMES = ["Алексей", "Мария", "Сергей", "Анна", "Дмитрий", "Екатерина", "Павел", "Ольга", "Игорь", "Наталья",
               "Андрей", "Юлия", "Виктор", "Татьяна", "Никита", "Ирина", "Роман", "Светлана", "Кирилл", "Елена"]
CARS = [("Volkswagen", "Polo", "legkovoy"), ("Toyota", "Camry", "legkovoy"), ("Kia", "Sportage", "krossover"),
        ("Hyundai", "Tucson", "krossover"), ("Geely", "Coolray", "krossover"), ("BMW", "X5", "vnedorozhnik"),
        ("Toyota", "Land Cruiser Prado", "vnedorozhnik"), ("Renault", "Logan", "legkovoy"), ("Skoda", "Octavia", "legkovoy"),
        ("Mercedes-Benz", "Vito", "minivan"), ("Volkswagen", "Touran", "minivan"), ("Lada", "Vesta", "legkovoy"),
        ("Audi", "Q5", "krossover"), ("Haval", "Jolion", "krossover"), ("Nissan", "Qashqai", "krossover")]
POPULAR = ["wash-standard", "wash-standard", "wash-lux", "wash-contactless", "wash-express", "wash-lux", "wash-nano",
           "wash-standard", "in-vacuum", "wash-contactless"]
EXTRAS = ["ex-tires", "ex-disks", "in-vacuum", "in-plastic", "ex-rain", "det-wax", "ex-engine", "det-headlights", "in-seat"]
RARE = ["in-full", "det-polish", "det-ceramic"]


def _plate(rng: random.Random) -> str:
    letters = "ABEIKMHOPCTX"
    return f"{rng.randint(1000, 9999)} {rng.choice(letters)}{rng.choice(letters)}-{rng.choice([7, 7, 7, 5, 1, 6])}"


def _phone(rng: random.Random) -> str:
    return "+375" + rng.choice(["29", "33", "44", "25"]) + str(rng.randint(1000000, 9999999))


def _service_map(conn) -> dict:
    return {r["id"]: r for r in rows(conn, "SELECT * FROM services")}


def _price(svc_map: dict, ids: list[str], car_class: str) -> tuple[float, float, list[str]]:
    lo = hi = 0.0
    names = []
    for sid in ids:
        s = svc_map[sid]
        pr = jload(s["prices"], {}).get(car_class, [0, 0])
        lo += float(pr[0])
        hi += float(pr[1])
        names.append(s["name"])
    return lo, hi, names


def _seed_bookings(conn, rng: random.Random, today: str, from_off: int, to_off: int, now_min: int) -> None:
    svc = _service_map(conn)
    sched = _schedule_map(conn)
    staff_ids = [s[0] for s in SEED_STAFF if s[3] == "percent"]
    for off in range(from_off, to_off + 1):
        day = add_days(today, off)
        times = _day_times(day, sched)
        if not times:
            continue
        weekday = WEEKDAYS[datetime.fromisoformat(day).weekday()]
        base = 0.62 if weekday in ("fri", "sat") else 0.45 if weekday == "sun" else 0.5
        if off > 0:
            base *= max(0.15, 0.75 - off * 0.09)  # будущее заполнено реже
        on_shift = rng.sample(staff_ids, 3)
        if off <= 0:
            upsert(conn, "shifts", "date", {"date": day, "staff_ids": jdump(on_shift + ["st-olga"])})
        for t in times:
            if rng.random() > base:
                continue
            if off == 0 and hm_to_min(t) > now_min - 30 and rng.random() < 0.5:
                continue
            exists = scalar(conn, "SELECT 1 FROM bookings WHERE date=? AND time=? AND status<>'cancelled'", (day, t))
            if exists:
                continue
            brand, model, cls = rng.choice(CARS)
            ids = [rng.choice(POPULAR)]
            if rng.random() < 0.45:
                ids.append(rng.choice(EXTRAS))
            if rng.random() < 0.025:
                ids.append(rng.choice(RARE))
            ids = list(dict.fromkeys(ids))
            lo, hi, names = _price(svc, ids, cls)
            if off < 0 or (off == 0 and hm_to_min(t) < now_min - 60):
                status = "cancelled" if rng.random() < 0.06 else "done"
                staff = rng.choice(on_shift) if status == "done" else None
            else:
                status = "pending" if rng.random() < 0.25 else "confirmed"
                staff = rng.choice(on_shift) if off == 0 and rng.random() < 0.5 else None
            conn.execute(
                "INSERT INTO bookings(id,date,time,car_number,car_brand,car_model,car_class,services,service_ids,price_min,price_max,"
                "client_name,client_phone,user_id,status,staff_id,created_at,seed) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)",
                (new_id("BLK"), day, t, _plate(rng), brand, model, cls, jdump(names), jdump(ids), lo, hi,
                 rng.choice(FIRST_NAMES), _phone(rng), None, status, staff, f"{add_days(day, -rng.randint(0, 3))}T10:00:00+03:00"),
            )


def seed(conn, now: datetime) -> None:
    rng = random.Random(7)
    today = now.date().isoformat()
    sort = 0
    for cat, items in SEED_SERVICES:
        for sid, name, prices, descr in items:
            sort += 1
            conn.execute("INSERT INTO services(id,category,name,descr,prices,visible,sort,seed) VALUES(?,?,?,?,?,1,?,1)",
                         (sid, cat, name, descr, jdump(prices), sort))
    for wd in WEEKDAYS:
        conn.execute("INSERT INTO schedule(weekday,open,from_t,to_t) VALUES(?,?,?,?)",
                     (wd, 1, "10:00" if wd == "sun" else "08:00", "18:00" if wd == "sun" else "21:00"))
    for sid, name, role, pay, rate, phone in SEED_STAFF:
        conn.execute("INSERT INTO staff(id,name,role,pay_type,rate,phone,active,seed) VALUES(?,?,?,?,?,?,1,1)",
                     (sid, name, role, pay, rate, phone))
    conn.execute("INSERT INTO staff(id,name,role,pay_type,rate,phone,active,seed) VALUES('st-vlad','Владислав Гук','Мойщик','percent',28,'+375297001020',0,1)")
    for bid, name, status, note, cnt, rev in [
        ("bay-1", "Бокс 1 · ручная мойка", "busy", "Kia Sportage, Люкс", 7, 340),
        ("bay-2", "Бокс 2 · ручная мойка", "free", "", 6, 265),
        ("bay-3", "Бокс 3 · детейлинг", "busy", "Полировка, до 17:00", 2, 610),
        ("bay-4", "Бесконтакт · самообслуживание", "repair", "Замена форсунки, до завтра", 0, 0),
    ]:
        conn.execute("INSERT INTO bays(id,name,status,note,today_count,today_revenue,seed) VALUES(?,?,?,?,?,?,1)",
                     (bid, name, status, note, cnt, rev))
    for iid, name, unit, qty, mn, price in [
        ("inv-foam", "Активная пена Grass", "л", 42, 20, 6.8), ("inv-shampoo", "Шампунь ручной мойки", "л", 18, 10, 9.5),
        ("inv-wax", "Холодный воск", "л", 6, 8, 21), ("inv-nano", "Nano-консервант", "л", 3, 4, 48),
        ("inv-tire", "Чернитель резины", "л", 9, 5, 14), ("inv-micro", "Микрофибра 40×40", "шт", 64, 40, 3.2),
        ("inv-chem", "Химия для химчистки", "л", 11, 6, 26), ("inv-glass", "Очиститель стёкол", "л", 7, 5, 8.4),
    ]:
        conn.execute("INSERT INTO inventory(id,name,unit,qty,min,price,seed) VALUES(?,?,?,?,?,?,1)", (iid, name, unit, qty, mn, price))
    for sid, name, price, stock, vis in [
        ("shop-fresh", "Ароматизатор «Морской бриз»", 9, 24, 1), ("shop-cloth", "Набор микрофибры, 3 шт", 15, 18, 1),
        ("shop-shampoo", "Автошампунь, 1 л", 18, 12, 1), ("shop-glass", "Омыватель −20°, 4 л", 16, 30, 1),
        ("shop-wax", "Быстрый воск-спрей", 32, 8, 1), ("shop-gift", "Подарочный сертификат 100 BYN", 100, 99, 0),
    ]:
        conn.execute("INSERT INTO shop(id,name,price,stock,visible,seed) VALUES(?,?,?,?,?,1)", (sid, name, price, stock, vis))
    _seed_bookings(conn, rng, today, -35, 10, now.hour * 60 + now.minute)
    month_start = today[:8] + "01"
    for sid, amount, off in [("st-artem", 300, 0), ("st-ilya", 250, 1), ("st-maxim", 400, 0)]:
        day = max(month_start, add_days(today, -3 - off))
        conn.execute("INSERT INTO payouts(id,staff_id,amount,date,created_at,seed) VALUES(?,?,?,?,?,1)",
                     (new_id("pay"), sid, amount, day, f"{day}T18:00:00+03:00"))


def refresh(conn, now: datetime) -> None:
    """Раз в сутки: досеять демо-записи на ближайшие дни и закрыть прошедшие,
    чтобы аналитика и расписание всегда выглядели «живыми»."""
    today = now.date().isoformat()
    last_seed_day = scalar(conn, "SELECT MAX(date) FROM bookings WHERE seed=1") or today
    conn.execute("UPDATE bookings SET status='done' WHERE seed=1 AND date<? AND status IN ('pending','confirmed')", (today,))
    start = max(1, (datetime.fromisoformat(last_seed_day).date() - now.date()).days + 1)
    rng = random.Random(today)
    if start <= 10:
        _seed_bookings(conn, rng, today, start, 10, 0)
    # дни без смен в прошлом (если сервер стоял) — заполним, чтобы не было «дыр»
    for off in range(-35, 0):
        day = add_days(today, off)
        if scalar(conn, "SELECT 1 FROM bookings WHERE date=?", (day,)) is None:
            _seed_bookings(conn, rng, today, off, off, 0)
    conn.execute("DELETE FROM bookings WHERE seed=1 AND date<?", (add_days(today, -120),))


# ============ РАСПИСАНИЕ / СЛОТЫ ============

def _schedule_map(conn) -> dict:
    return {r["weekday"]: {"open": bool(r["open"]), "from": r["from_t"], "to": r["to_t"]}
            for r in rows(conn, "SELECT * FROM schedule")}


def _day_times(day: str, sched: dict, closed: set | None = None) -> list[str]:
    if closed and day in closed:
        return []
    d = sched.get(WEEKDAYS[datetime.fromisoformat(day).weekday()])
    if not d or not d["open"]:
        return []
    start, end = hm_to_min(d["from"]), hm_to_min(d["to"])
    return [min_to_hm(m) for m in range(start, end, SLOT_STEP)]


def _slot_states(conn, day: str) -> list[dict]:
    closed = {r["date"] for r in rows(conn, "SELECT date FROM closed_dates")}
    times = _day_times(day, _schedule_map(conn), closed)
    if not times:
        return []
    booked = {r["time"]: r["id"] for r in rows(conn, "SELECT id,time FROM bookings WHERE date=? AND status<>'cancelled'", (day,))}
    blocked = {r["time"] for r in rows(conn, "SELECT time FROM blocked_slots WHERE date=?", (day,))}
    out = []
    for t in times:
        if t in booked:
            out.append({"time": t, "state": "booked", "bookingId": booked[t]})
        elif t in blocked:
            out.append({"time": t, "state": "blocked"})
        else:
            out.append({"time": t, "state": "free"})
    return out


# ============ ПРЕДСТАВЛЕНИЯ ============

def _booking_client(r: dict) -> dict:
    return {
        "id": r["id"], "date": r["date"], "time": r["time"],
        "car": {"number": r["car_number"], "brand": r["car_brand"], "model": r["car_model"], "carClass": r["car_class"]},
        "services": jload(r["services"], []), "priceMin": r["price_min"], "priceMax": r["price_max"],
        "contact": {"name": r["client_name"], "phone": r["client_phone"]},
        "status": STATUS_RU.get(r["status"], r["status"]), "state": r["status"],
    }


def _booking_admin(r: dict) -> dict:
    return {
        "id": r["id"], "date": r["date"], "time": r["time"],
        "car": {"number": r["car_number"], "brand": r["car_brand"], "model": r["car_model"], "carClass": r["car_class"]},
        "services": jload(r["services"], []), "priceMin": r["price_min"], "priceMax": r["price_max"],
        "contact": {"name": r["client_name"], "phone": r["client_phone"]},
        "status": r["status"], "assignedStaffId": r["staff_id"],
    }


def _service_out(r: dict, admin: bool) -> dict:
    item = {"id": r["id"], "name": r["name"], "price": jload(r["prices"], {})}
    if r["descr"]:
        item["desc"] = r["descr"]
    if admin:
        item["visible"] = bool(r["visible"])
    return item


bot = Bot("carwash", SCHEMA, seed, refresh)


# ============ КЛИЕНТ ============

@bot.action("getServices")
def get_services(c: Ctx, p: dict):
    admin = p.get("audience") != "client"
    q = "SELECT * FROM services" + ("" if admin else " WHERE visible=1") + " ORDER BY sort, rowid"
    cats: dict[str, list] = {}
    for r in rows(c.conn, q):
        cats.setdefault(r["category"], []).append(_service_out(r, admin))
    return {"categories": [{"category": k, "items": v} for k, v in cats.items()]}


@bot.action("getSchedule")
def get_schedule(c: Ctx, p: dict):
    closed = [r["date"] for r in rows(c.conn, "SELECT date FROM closed_dates WHERE date>=? ORDER BY date", (c.today,))]
    return {"schedule": _schedule_map(c.conn), "closedDates": closed}


@bot.action("getSlots")
def get_slots(c: Ctx, p: dict):
    day = v_date(p, "date")
    now_min = c.now.hour * 60 + c.now.minute
    out = []
    for s in _slot_states(c.conn, day):
        disabled = s["state"] != "free" or day < c.today or (day == c.today and hm_to_min(s["time"]) <= now_min)
        out.append({"time": s["time"], "disabled": disabled})
    return {"slots": out}


def _car_payload(p: dict) -> dict:
    car = v_obj(p, "car")
    number = v_str(car, "number", max_len=14, min_len=4).upper()
    return {
        "number": number,
        "brand": v_str(car, "brand", max_len=40, required=False),
        "model": v_str(car, "model", max_len=40, required=False),
        "carClass": v_enum(car, "carClass", CAR_CLASSES),
        "id": v_id(car, "id", required=False),
    }


@bot.action("createBooking", write=True)
def create_booking(c: Ctx, p: dict):
    user = c.need_user()
    day = v_date(p, "date")
    t = v_time(p, "time")
    car = _car_payload(p)
    ids = v_ids(p, "serviceIds", max_items=12)
    if not ids:
        raise ApiError("bad_request", "Выберите услугу")
    contact = v_obj(p, "contact")
    name = v_str(contact, "name", max_len=60, min_len=2)
    phone = v_phone(contact, "phone")
    if day < c.today or day > add_days(c.today, BOOK_AHEAD_DAYS):
        raise ApiError("bad_date")
    svc = {r["id"]: r for r in rows(c.conn, "SELECT * FROM services WHERE visible=1")}
    if any(i not in svc for i in ids):
        raise ApiError("bad_service")
    slot = next((s for s in _slot_states(c.conn, day) if s["time"] == t), None)
    now_min = c.now.hour * 60 + c.now.minute
    if not slot or slot["state"] != "free" or (day == c.today and hm_to_min(t) <= now_min):
        raise ApiError("slot_unavailable")
    active = scalar(c.conn, "SELECT COUNT(*) FROM bookings WHERE user_id=? AND date>=? AND status IN ('pending','confirmed')", (user, c.today))
    if active >= PER_USER_ACTIVE_BOOKINGS:
        raise ApiError("too_many", "Слишком много активных записей")
    lo, hi, names = _price(svc, ids, car["carClass"])
    cap_rows(c.conn, "bookings", LIMITS["bookings"])
    bid = new_id("BLK")
    c.conn.execute(
        "INSERT INTO bookings(id,date,time,car_number,car_brand,car_model,car_class,services,service_ids,price_min,price_max,"
        "client_name,client_phone,user_id,status,staff_id,created_at,seed) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)",
        (bid, day, t, car["number"], car["brand"], car["model"], car["carClass"], jdump(names), jdump(ids), lo, hi,
         name, phone, user, "confirmed", None, iso_now()),
    )
    _save_car(c, user, car)
    return {"booking": _booking_client(one(c.conn, "SELECT * FROM bookings WHERE id=?", (bid,)))}


@bot.action("cancelBooking", write=True)
def cancel_booking(c: Ctx, p: dict):
    user = c.need_user()
    bid = v_id(p, "id")
    r = one(c.conn, "SELECT * FROM bookings WHERE id=?", (bid,))
    if not r or r["user_id"] != user:
        raise ApiError("not_found")
    if r["status"] in ("done", "cancelled"):
        raise ApiError("bad_state")
    c.conn.execute("UPDATE bookings SET status='cancelled' WHERE id=?", (bid,))
    return {}


@bot.action("getMyBookings")
def get_my_bookings(c: Ctx, p: dict):
    user = c.need_user()
    rs = rows(c.conn, "SELECT * FROM bookings WHERE user_id=? ORDER BY date DESC, time DESC LIMIT 50", (user,))
    return {"bookings": [_booking_client(r) for r in rs]}


@bot.action("getMyProfile")
def get_my_profile(c: Ctx, p: dict):
    user = c.need_user()
    r = one(c.conn, "SELECT client_name, client_phone FROM bookings WHERE user_id=? ORDER BY created_at DESC LIMIT 1", (user,))
    return {"profile": {"name": r["client_name"], "phone": r["client_phone"]} if r else None}


def _car_out(r: dict) -> dict:
    ts = datetime.fromisoformat(r["last_used_at"]).timestamp() * 1000
    return {"id": r["id"], "number": r["number"], "brand": r["brand"], "model": r["model"], "carClass": r["car_class"],
            "lastUsedAt": int(ts)}


def _save_car(c: Ctx, user: str, car: dict) -> dict:
    existing = None
    if car.get("id"):
        existing = one(c.conn, "SELECT * FROM cars WHERE id=? AND user_id=?", (car["id"], user))
    if not existing:
        existing = one(c.conn, "SELECT * FROM cars WHERE user_id=? AND number=?", (user, car["number"]))
    if not existing:
        n = scalar(c.conn, "SELECT COUNT(*) FROM cars WHERE user_id=?", (user,))
        if n >= PER_USER_CARS:
            c.conn.execute("DELETE FROM cars WHERE id=(SELECT id FROM cars WHERE user_id=? ORDER BY last_used_at LIMIT 1)", (user,))
        cap_rows(c.conn, "cars", LIMITS["cars"])
    cid = existing["id"] if existing else new_id("car")
    c.conn.execute(
        "INSERT INTO cars(id,user_id,number,brand,model,car_class,last_used_at) VALUES(?,?,?,?,?,?,?) "
        "ON CONFLICT(id) DO UPDATE SET number=excluded.number, brand=excluded.brand, model=excluded.model, "
        "car_class=excluded.car_class, last_used_at=excluded.last_used_at",
        (cid, user, car["number"], car["brand"], car["model"], car["carClass"], iso_now()),
    )
    return _car_out(one(c.conn, "SELECT * FROM cars WHERE id=?", (cid,)))


@bot.action("getMyCars")
def get_my_cars(c: Ctx, p: dict):
    user = c.need_user()
    return {"cars": [_car_out(r) for r in rows(c.conn, "SELECT * FROM cars WHERE user_id=? ORDER BY last_used_at DESC", (user,))]}


@bot.action("saveCar", write=True)
def save_car(c: Ctx, p: dict):
    user = c.need_user()
    return {"car": _save_car(c, user, _car_payload(p))}


@bot.action("deleteCar", write=True)
def delete_car(c: Ctx, p: dict):
    user = c.need_user()
    c.conn.execute("DELETE FROM cars WHERE id=? AND user_id=?", (v_id(p, "id"), user))
    return {}


# ============ АДМИНИСТРАТОР ============

@bot.action("getBookings")
def get_bookings(c: Ctx, p: dict):
    frm = v_date(p, "from", required=False, default=add_days(c.today, -14))
    to = v_date(p, "to", required=False, default=add_days(c.today, BOOK_AHEAD_DAYS))
    rs = rows(c.conn, "SELECT * FROM bookings WHERE date BETWEEN ? AND ? ORDER BY date, time", (frm, to))
    return {"bookings": [_booking_admin(r) for r in rs]}


@bot.action("updateBookingStatus", write=True)
def update_booking_status(c: Ctx, p: dict):
    bid = v_id(p, "id")
    status = v_enum(p, "status", STATUSES)
    r = one(c.conn, "SELECT * FROM bookings WHERE id=?", (bid,))
    if not r:
        raise ApiError("not_found")
    if r["status"] == "cancelled" and status != "cancelled":
        busy = scalar(c.conn, "SELECT 1 FROM bookings WHERE date=? AND time=? AND status<>'cancelled' AND id<>?", (r["date"], r["time"], bid))
        if busy:
            raise ApiError("slot_unavailable")
    c.conn.execute("UPDATE bookings SET status=? WHERE id=?", (status, bid))
    return {}


@bot.action("assignBookingStaff", write=True)
def assign_booking_staff(c: Ctx, p: dict):
    bid = v_id(p, "id")
    sid = v_id(p, "staffId", required=False)
    if sid and not one(c.conn, "SELECT 1 FROM staff WHERE id=?", (sid,)):
        raise ApiError("not_found")
    cur = c.conn.execute("UPDATE bookings SET staff_id=? WHERE id=?", (sid, bid))
    if cur.rowcount == 0:
        raise ApiError("not_found")
    return {}


@bot.action("getShift")
def get_shift(c: Ctx, p: dict):
    day = v_date(p, "date", required=False, default=c.today)
    r = one(c.conn, "SELECT staff_ids FROM shifts WHERE date=?", (day,))
    return {"date": day, "staffIds": jload(r["staff_ids"], []) if r else []}


@bot.action("setShift", write=True)
def set_shift(c: Ctx, p: dict):
    day = v_date(p, "date", required=False, default=c.today)
    ids = v_ids(p, "staffIds", max_items=40, required=False)
    known = {r["id"] for r in rows(c.conn, "SELECT id FROM staff")}
    ids = [i for i in ids if i in known]
    upsert(c.conn, "shifts", "date", {"date": day, "staff_ids": jdump(ids)})
    return {}


@bot.action("getDaySlots")
def get_day_slots(c: Ctx, p: dict):
    return {"slots": _slot_states(c.conn, v_date(p, "date"))}


@bot.action("blockSlot", write=True)
def block_slot(c: Ctx, p: dict):
    day, t = v_date(p, "date"), v_time(p, "time")
    if scalar(c.conn, "SELECT COUNT(*) FROM blocked_slots") >= LIMITS["blocked_slots"]:
        c.conn.execute("DELETE FROM blocked_slots WHERE date<?", (c.today,))
    c.conn.execute("INSERT OR IGNORE INTO blocked_slots(date,time) VALUES(?,?)", (day, t))
    return {}


@bot.action("unblockSlot", write=True)
def unblock_slot(c: Ctx, p: dict):
    c.conn.execute("DELETE FROM blocked_slots WHERE date=? AND time=?", (v_date(p, "date"), v_time(p, "time")))
    return {}


@bot.action("saveService", write=True)
def save_service(c: Ctx, p: dict):
    category = v_str(p, "category", max_len=40, min_len=1)
    it = v_obj(p, "item")
    name = v_str(it, "name", max_len=80, min_len=2)
    descr = v_str(it, "desc", max_len=400, required=False)
    price_in = v_obj(it, "price")
    prices = {}
    for cls in CAR_CLASSES:
        pair = price_in.get(cls)
        if not isinstance(pair, list) or len(pair) != 2:
            raise ApiError("bad_request", f"price.{cls}")
        lo = v_num({"v": pair[0]}, "v", hi=100000)
        hi = v_num({"v": pair[1]}, "v", hi=100000)
        if hi < lo:
            lo, hi = hi, lo
        prices[cls] = [lo, hi]
    visible = v_bool(it, "visible", default=True)
    sid = v_id(it, "id", required=False)
    if sid and one(c.conn, "SELECT 1 FROM services WHERE id=?", (sid,)):
        c.conn.execute("UPDATE services SET category=?, name=?, descr=?, prices=?, visible=? WHERE id=?",
                       (category, name, descr, jdump(prices), int(visible), sid))
    else:
        if scalar(c.conn, "SELECT COUNT(*) FROM services") >= LIMITS["services"]:
            raise ApiError("limit")
        sid = new_id("svc")
        sort = (scalar(c.conn, "SELECT MAX(sort) FROM services") or 0) + 1
        c.conn.execute("INSERT INTO services(id,category,name,descr,prices,visible,sort) VALUES(?,?,?,?,?,?,?)",
                       (sid, category, name, descr, jdump(prices), int(visible), sort))
    return {"item": _service_out(one(c.conn, "SELECT * FROM services WHERE id=?", (sid,)), True)}


@bot.action("deleteService", write=True)
def delete_service(c: Ctx, p: dict):
    c.conn.execute("DELETE FROM services WHERE id=?", (v_id(p, "id"),))
    return {}


@bot.action("saveSchedule", write=True)
def save_schedule(c: Ctx, p: dict):
    sched = v_obj(p, "schedule")
    for wd, d in sched.items():
        if wd not in WEEKDAYS or not isinstance(d, dict):
            raise ApiError("bad_request", "schedule")
        frm, to = v_time(d, "from"), v_time(d, "to")
        if hm_to_min(to) <= hm_to_min(frm):
            raise ApiError("bad_request", "Время закрытия раньше открытия")
        upsert(c.conn, "schedule", "weekday", {"weekday": wd, "open": int(v_bool(d, "open")), "from_t": frm, "to_t": to})
    return {}


@bot.action("addClosedDate", write=True)
def add_closed_date(c: Ctx, p: dict):
    day = v_date(p, "date")
    if scalar(c.conn, "SELECT COUNT(*) FROM closed_dates") >= LIMITS["closed_dates"]:
        c.conn.execute("DELETE FROM closed_dates WHERE date<?", (c.today,))
    c.conn.execute("INSERT OR IGNORE INTO closed_dates(date) VALUES(?)", (day,))
    return {}


@bot.action("removeClosedDate", write=True)
def remove_closed_date(c: Ctx, p: dict):
    c.conn.execute("DELETE FROM closed_dates WHERE date=?", (v_date(p, "date"),))
    return {}


# ============ ПЕРСОНАЛ ============

def _month_start(today: str) -> str:
    return today[:8] + "01"


def _staff_out(c: Ctx, r: dict) -> dict:
    ms = _month_start(c.today)
    shifts = rows(c.conn, "SELECT staff_ids FROM shifts WHERE date BETWEEN ? AND ?", (ms, c.today))
    shifts_month = sum(1 for s in shifts if r["id"] in jload(s["staff_ids"], []))
    if r["pay_type"] == "percent":
        rev = scalar(c.conn, "SELECT COALESCE(SUM(price_min),0) FROM bookings WHERE staff_id=? AND status='done' AND date BETWEEN ? AND ?",
                     (r["id"], ms, c.today))
        earned = rev * r["rate"] / 100
    else:
        earned = shifts_month * r["rate"]
    paid = scalar(c.conn, "SELECT COALESCE(SUM(amount),0) FROM payouts WHERE staff_id=? AND date>=?", (r["id"], ms))
    return {"id": r["id"], "name": r["name"], "role": r["role"], "payType": r["pay_type"], "rate": r["rate"],
            "phone": r["phone"], "shiftsMonth": shifts_month, "earnedMonth": round(earned, 2),
            "paidMonth": round(paid, 2), "accruedMonth": round(earned - paid, 2), "active": bool(r["active"])}


@bot.action("getStaff")
def get_staff(c: Ctx, p: dict):
    return {"staff": [_staff_out(c, r) for r in rows(c.conn, "SELECT * FROM staff ORDER BY active DESC, name")]}


@bot.action("saveStaff", write=True)
def save_staff(c: Ctx, p: dict):
    s = v_obj(p, "staff")
    data = {
        "name": v_str(s, "name", max_len=60, min_len=2),
        "role": v_str(s, "role", max_len=40, min_len=2),
        "pay_type": v_enum(s, "payType", ["percent", "fixed"]),
        "rate": v_num(s, "rate", hi=10000),
        "phone": v_phone(s, "phone", required=False),
        "active": int(v_bool(s, "active", default=True)),
    }
    if data["pay_type"] == "percent" and data["rate"] > 100:
        raise ApiError("bad_request", "Процент не больше 100")
    sid = v_id(s, "id", required=False)
    if sid and one(c.conn, "SELECT 1 FROM staff WHERE id=?", (sid,)):
        c.conn.execute("UPDATE staff SET name=?, role=?, pay_type=?, rate=?, phone=?, active=? WHERE id=?",
                       (*data.values(), sid))
    else:
        if scalar(c.conn, "SELECT COUNT(*) FROM staff") >= LIMITS["staff"]:
            raise ApiError("limit")
        sid = new_id("st")
        c.conn.execute("INSERT INTO staff(id,name,role,pay_type,rate,phone,active) VALUES(?,?,?,?,?,?,?)", (sid, *data.values()))
    return {"staff": _staff_out(c, one(c.conn, "SELECT * FROM staff WHERE id=?", (sid,)))}


@bot.action("deleteStaff", write=True)
def delete_staff(c: Ctx, p: dict):
    sid = v_id(p, "id")
    c.conn.execute("DELETE FROM staff WHERE id=?", (sid,))
    c.conn.execute("UPDATE bookings SET staff_id=NULL WHERE staff_id=?", (sid,))
    return {}


@bot.action("payStaff", write=True)
def pay_staff(c: Ctx, p: dict):
    sid = v_id(p, "staffId")
    amount = v_num(p, "amount", lo=0.01, hi=100000)
    r = one(c.conn, "SELECT * FROM staff WHERE id=?", (sid,))
    if not r:
        raise ApiError("not_found")
    cap_rows(c.conn, "payouts", LIMITS["payouts"])
    pid = new_id("pay")
    c.conn.execute("INSERT INTO payouts(id,staff_id,amount,date,created_at) VALUES(?,?,?,?,?)", (pid, sid, amount, c.today, iso_now()))
    st = _staff_out(c, r)
    return {"payout": {"id": pid, "staffId": sid, "amount": amount, "date": c.today}, "remainingAccrued": st["accruedMonth"]}


@bot.action("getPayouts")
def get_payouts(c: Ctx, p: dict):
    sid = v_id(p, "staffId", required=False)
    q = "SELECT * FROM payouts" + (" WHERE staff_id=?" if sid else "") + " ORDER BY date DESC, created_at DESC LIMIT 100"
    rs = rows(c.conn, q, (sid,) if sid else ())
    return {"payouts": [{"id": r["id"], "staffId": r["staff_id"], "amount": r["amount"], "date": r["date"]} for r in rs]}


# ============ БОКСЫ / СКЛАД / МАГАЗИН ============

def _bay_out(r):
    return {"id": r["id"], "name": r["name"], "status": r["status"], "note": r["note"],
            "todayCount": r["today_count"], "todayRevenue": r["today_revenue"]}


@bot.action("getBays")
def get_bays(c: Ctx, p: dict):
    return {"bays": [_bay_out(r) for r in rows(c.conn, "SELECT * FROM bays ORDER BY rowid")]}


@bot.action("saveBay", write=True)
def save_bay(c: Ctx, p: dict):
    b = v_obj(p, "bay")
    data = {"name": v_str(b, "name", max_len=60, min_len=2), "status": v_enum(b, "status", ["free", "busy", "repair"]),
            "note": v_str(b, "note", max_len=120, required=False), "today_count": v_int(b, "todayCount", hi=500, required=False),
            "today_revenue": v_num(b, "todayRevenue", hi=1e6, required=False)}
    bid = v_id(b, "id", required=False)
    if bid and one(c.conn, "SELECT 1 FROM bays WHERE id=?", (bid,)):
        c.conn.execute("UPDATE bays SET name=?, status=?, note=?, today_count=?, today_revenue=? WHERE id=?", (*data.values(), bid))
    else:
        if scalar(c.conn, "SELECT COUNT(*) FROM bays") >= LIMITS["bays"]:
            raise ApiError("limit")
        bid = new_id("bay")
        c.conn.execute("INSERT INTO bays(id,name,status,note,today_count,today_revenue) VALUES(?,?,?,?,?,?)", (bid, *data.values()))
    return {"bay": _bay_out(one(c.conn, "SELECT * FROM bays WHERE id=?", (bid,)))}


@bot.action("deleteBay", write=True)
def delete_bay(c: Ctx, p: dict):
    c.conn.execute("DELETE FROM bays WHERE id=?", (v_id(p, "id"),))
    return {}


def _inv_out(r):
    return {"id": r["id"], "name": r["name"], "unit": r["unit"], "qty": r["qty"], "min": r["min"], "price": r["price"]}


@bot.action("getInventory")
def get_inventory(c: Ctx, p: dict):
    return {"items": [_inv_out(r) for r in rows(c.conn, "SELECT * FROM inventory ORDER BY name")]}


@bot.action("saveInventoryItem", write=True)
def save_inventory_item(c: Ctx, p: dict):
    it = v_obj(p, "item")
    data = {"name": v_str(it, "name", max_len=60, min_len=2), "unit": v_str(it, "unit", max_len=10, min_len=1),
            "qty": v_num(it, "qty", hi=1e6), "min": v_num(it, "min", hi=1e6), "price": v_num(it, "price", hi=1e6)}
    iid = v_id(it, "id", required=False)
    if iid and one(c.conn, "SELECT 1 FROM inventory WHERE id=?", (iid,)):
        c.conn.execute("UPDATE inventory SET name=?, unit=?, qty=?, min=?, price=? WHERE id=?", (*data.values(), iid))
    else:
        if scalar(c.conn, "SELECT COUNT(*) FROM inventory") >= LIMITS["inventory"]:
            raise ApiError("limit")
        iid = new_id("inv")
        c.conn.execute("INSERT INTO inventory(id,name,unit,qty,min,price) VALUES(?,?,?,?,?,?)", (iid, *data.values()))
    return {"item": _inv_out(one(c.conn, "SELECT * FROM inventory WHERE id=?", (iid,)))}


@bot.action("deleteInventoryItem", write=True)
def delete_inventory_item(c: Ctx, p: dict):
    c.conn.execute("DELETE FROM inventory WHERE id=?", (v_id(p, "id"),))
    return {}


def _shop_out(r):
    return {"id": r["id"], "name": r["name"], "price": r["price"], "stock": r["stock"], "visible": bool(r["visible"])}


@bot.action("getShop")
def get_shop(c: Ctx, p: dict):
    q = "SELECT * FROM shop" + (" WHERE visible=1 AND stock>0" if p.get("audience") == "client" else "") + " ORDER BY rowid"
    return {"items": [_shop_out(r) for r in rows(c.conn, q)]}


@bot.action("saveShopItem", write=True)
def save_shop_item(c: Ctx, p: dict):
    it = v_obj(p, "item")
    data = {"name": v_str(it, "name", max_len=60, min_len=2), "price": v_num(it, "price", hi=1e5),
            "stock": v_int(it, "stock", hi=100000), "visible": int(v_bool(it, "visible", default=True))}
    sid = v_id(it, "id", required=False)
    if sid and one(c.conn, "SELECT 1 FROM shop WHERE id=?", (sid,)):
        c.conn.execute("UPDATE shop SET name=?, price=?, stock=?, visible=? WHERE id=?", (*data.values(), sid))
    else:
        if scalar(c.conn, "SELECT COUNT(*) FROM shop") >= LIMITS["shop"]:
            raise ApiError("limit")
        sid = new_id("shop")
        c.conn.execute("INSERT INTO shop(id,name,price,stock,visible) VALUES(?,?,?,?,?)", (sid, *data.values()))
    return {"item": _shop_out(one(c.conn, "SELECT * FROM shop WHERE id=?", (sid,)))}


@bot.action("deleteShopItem", write=True)
def delete_shop_item(c: Ctx, p: dict):
    c.conn.execute("DELETE FROM shop WHERE id=?", (v_id(p, "id"),))
    return {}


# ============ ОБЗОР (владелец) ============
DOW_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]


def _summary(c: Ctx, frm: str, to: str) -> dict:
    r = one(c.conn, "SELECT COUNT(*) n, COALESCE(SUM(price_min),0) rev FROM bookings WHERE status<>'cancelled' AND date BETWEEN ? AND ?",
            (frm, to))
    n, rev = r["n"], r["rev"]
    cancelled = scalar(c.conn, "SELECT COUNT(*) FROM bookings WHERE status='cancelled' AND date BETWEEN ? AND ?", (frm, to))
    return {"revenue": round(rev, 2), "bookings": n, "avgCheck": round(rev / n) if n else 0,
            "payroll": _payroll(c, frm, to), "cancelled": cancelled}


def _payroll(c: Ctx, frm: str, to: str) -> int:
    total = 0.0
    staff = {r["id"]: r for r in rows(c.conn, "SELECT * FROM staff")}
    for r in rows(c.conn, "SELECT staff_id, SUM(price_min) s FROM bookings WHERE status='done' AND staff_id IS NOT NULL AND date BETWEEN ? AND ? GROUP BY staff_id", (frm, to)):
        s = staff.get(r["staff_id"])
        if s and s["pay_type"] == "percent":
            total += r["s"] * s["rate"] / 100
    for sh in rows(c.conn, "SELECT staff_ids FROM shifts WHERE date BETWEEN ? AND ?", (frm, to)):
        for sid in jload(sh["staff_ids"], []):
            s = staff.get(sid)
            if s and s["pay_type"] == "fixed":
                total += s["rate"]
    return round(total)


def _chart_and_top(c: Ctx, frm: str, to: str) -> tuple[list, list]:
    by_day = {r["date"]: r["s"] for r in rows(c.conn, "SELECT date, SUM(price_min) s FROM bookings WHERE status<>'cancelled' AND date BETWEEN ? AND ? GROUP BY date", (frm, to))}
    chart = []
    day = frm
    span = (datetime.fromisoformat(to) - datetime.fromisoformat(frm)).days
    while day <= to:
        d = datetime.fromisoformat(day)
        label = DOW_RU[d.weekday()] if span <= 7 else str(d.day)
        chart.append({"d": label, "date": day, "v": round(by_day.get(day, 0))})
        day = add_days(day, 1)
    agg: dict[str, list] = {}
    svc = _service_map(c.conn)
    for r in rows(c.conn, "SELECT services, service_ids, car_class, price_min FROM bookings WHERE status<>'cancelled' AND date BETWEEN ? AND ?", (frm, to)):
        names = jload(r["services"], [])
        # выручка записи делится между услугами пропорционально их цене
        ids = jload(r["service_ids"], [])
        weights = [jload(svc[i]["prices"], {}).get(r["car_class"], [1, 1])[0] if i in svc else 1 for i in ids] or [1] * len(names)
        tot = sum(weights) or 1
        for name, w in zip(names, weights):
            a = agg.setdefault(name, [0.0, 0])
            a[0] += r["price_min"] * w / tot
            a[1] += 1
    top = sorted(({"name": k, "revenue": round(v[0]), "count": v[1]} for k, v in agg.items()), key=lambda x: -x["revenue"])[:5]
    return chart, top


@bot.action("getOverview")
def get_overview(c: Ctx, p: dict):
    t = c.today
    week = add_days(t, -6)
    ms = _month_start(t)
    prev_week = (add_days(t, -13), add_days(t, -7))
    chart, top = _chart_and_top(c, week, t)
    return {"overview": {"today": _summary(c, t, t), "week": _summary(c, week, t), "month": _summary(c, ms, t),
                         "prevWeek": _summary(c, *prev_week)},
            "chart": chart, "topServices": top}


@bot.action("getOverviewRange")
def get_overview_range(c: Ctx, p: dict):
    frm, to = v_date(p, "from"), v_date(p, "to")
    if to < frm:
        frm, to = to, frm
    if (datetime.fromisoformat(to) - datetime.fromisoformat(frm)).days > 92:
        raise ApiError("bad_request", "Период не больше 3 месяцев")
    chart, top = _chart_and_top(c, frm, to)
    return {"overview": {"custom": _summary(c, frm, to)}, "chart": chart, "topServices": top}
