# изменено 2026-10-08 02:57
"""Барбершоп «БРИТВА» — контракт спроектирован по мок-функциям
barbershop-client/-admin/-owner.

Сетка — 20 минут. Запись занимает столько ячеек, сколько длится услуга,
у одного мастера записи не пересекаются (проверка в BEGIN IMMEDIATE).
Статусы: wait (ждём) → chair (в кресле) → done; cancelled, noshow.
"""
from __future__ import annotations

import random
from datetime import datetime

from core import (ApiError, Bot, Ctx, add_days, cap_rows, hm_to_min, iso_now, min_to_hm, new_id, one, rows, scalar,
                  v_bool, v_date, v_enum, v_id, v_int, v_obj, v_phone, v_str, v_time)

SCHEMA = """
CREATE TABLE IF NOT EXISTS barbers(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, spec TEXT NOT NULL, exp TEXT NOT NULL, bio TEXT NOT NULL, color TEXT NOT NULL,
  rating REAL NOT NULL, pct INTEGER NOT NULL DEFAULT 40, active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS services(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, dur INTEGER NOT NULL, price REAL NOT NULL, descr TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS days_off(barber_id TEXT NOT NULL, date TEXT NOT NULL, PRIMARY KEY(barber_id, date));
CREATE TABLE IF NOT EXISTS bookings(
  id TEXT PRIMARY KEY, barber_id TEXT NOT NULL, service_id TEXT NOT NULL, service TEXT NOT NULL, date TEXT NOT NULL,
  start INTEGER NOT NULL, dur INTEGER NOT NULL, price REAL NOT NULL, client TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '',
  user_id TEXT, status TEXT NOT NULL DEFAULT 'wait', source TEXT NOT NULL DEFAULT 'app', created_at TEXT NOT NULL,
  seed INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS bb_day ON bookings(date, barber_id);
CREATE INDEX IF NOT EXISTS bb_user ON bookings(user_id);
"""

OPEN, CLOSE, STEP = 10 * 60, 21 * 60, 20
SUN_OPEN, SUN_CLOSE = 11 * 60, 19 * 60
AHEAD = 14
ACTIVE = ("wait", "chair")
LIMITS = {"bookings": 8000, "services": 40, "barbers": 20}
PER_USER_ACTIVE = 4

SEED_BARBERS = [
    ("b1", "Игорь Соколов", "Классика и опасная бритва", "8 лет за креслом", "#B08D57", 4.9,
     "Работает по классической школе — ножницы, филировка, горячее полотенце перед бритьём. Тишина или разговор — как вам удобнее."),
    ("b2", "Артём Волков", "Фейды и текстурные стрижки", "5 лет за креслом", "#7A1E2C", 4.8,
     "Чёткие переходы и современные формы. Смотрит референсы и честно скажет, что подойдёт под форму лица."),
    ("b3", "Максим Орлов", "Бороды и усы", "6 лет за креслом", "#4F6B4A", 4.9,
     "Оформление и уход за бородой — от лёгкой коррекции до полного скульптурирования по форме лица."),
    ("b4", "Денис Крылов", "Детские и семейные стрижки", "4 года за креслом", "#8A6A3A", 4.7,
     "Терпеливо работает с детьми и найдёт подход даже к тем, кто стрижку не любит. Отцы с сыновьями — без очереди друг за другом."),
]
SEED_SERVICES = [
    ("s1", "Стрижка машинкой", 30, 26, "Одна или две насадки, окантовка, мытьё головы."),
    ("s2", "Стрижка ножницами", 40, 38, "Классическая или современная форма, укладка."),
    ("s3", "Стрижка + борода", 60, 55, "Комплекс: стрижка и оформление бороды, горячее полотенце."),
    ("s4", "Королевское бритьё", 40, 38, "Опасная бритва, распаривание, компресс и бальзам."),
    ("s5", "Оформление бороды", 20, 30, "Форма, окантовка, масло для бороды."),
    ("s6", "Детская стрижка", 30, 25, "До 12 лет. Мультики на планшете — в комплекте."),
    ("s7", "Камуфляж седины", 20, 28, "Тонирование волос или бороды, 5–10 минут выдержки."),
]
CLIENTS = ["Павел Гриц", "Роман Зайцев", "Илья Швец", "Никита Бык", "Сергей Дуб", "Егор Линь", "Антон Вербицкий", "Глеб Санько",
           "Кирилл Ус", "Вадим Король", "Тимур Ясин", "Олег Пинчук", "Станислав Рак", "Юрий Ласка", "Марк Сидорович", "Ян Брыль"]


def _hours(day: str) -> tuple[int, int]:
    return (SUN_OPEN, SUN_CLOSE) if datetime.fromisoformat(day).weekday() == 6 else (OPEN, CLOSE)


def _busy(conn, barber_id: str, day: str, exclude: str | None = None) -> list[tuple[int, int]]:
    return [(r["start"], r["start"] + r["dur"]) for r in rows(
        conn, "SELECT id, start, dur FROM bookings WHERE barber_id=? AND date=? AND status IN ('wait','chair','done')", (barber_id, day))
        if r["id"] != exclude]


def _free_starts(conn, barber_id: str, day: str, dur: int, after_min: int = -1) -> list[int]:
    if scalar(conn, "SELECT 1 FROM days_off WHERE barber_id=? AND date=?", (barber_id, day)):
        return []
    o, c = _hours(day)
    busy = _busy(conn, barber_id, day)
    out = []
    for s in range(o, c - dur + 1, STEP):
        if s <= after_min:
            continue
        if all(s >= b or s + dur <= a for a, b in busy):
            out.append(s)
    return out


def _now_min(c: Ctx) -> int:
    return c.now.hour * 60 + c.now.minute


def _barber_out(r: dict) -> dict:
    return {"id": r["id"], "name": r["name"], "spec": r["spec"], "exp": r["exp"], "bio": r["bio"], "color": r["color"],
            "rating": r["rating"], "initials": "".join(w[0] for w in r["name"].split()[:2]).upper(), "active": bool(r["active"]), "pct": r["pct"]}


def _svc_out(r: dict) -> dict:
    return {"id": r["id"], "name": r["name"], "dur": r["dur"], "price": r["price"], "desc": r["descr"], "active": bool(r["active"])}


def _booking_out(conn, r: dict) -> dict:
    b = one(conn, "SELECT name FROM barbers WHERE id=?", (r["barber_id"],))
    return {"id": r["id"], "barberId": r["barber_id"], "barber": b["name"] if b else "—", "serviceId": r["service_id"], "service": r["service"],
            "date": r["date"], "time": min_to_hm(r["start"]), "end": min_to_hm(r["start"] + r["dur"]), "dur": r["dur"], "price": r["price"],
            "client": r["client"], "phone": r["phone"], "status": r["status"], "source": r["source"], "createdAt": r["created_at"]}


# ============ ДЕМО ============

def _seed_days(conn, rng, today: str, now_min: int, frm: int, to: int) -> None:
    svcs = rows(conn, "SELECT * FROM services WHERE active=1")
    weights = {"s1": 5, "s2": 4, "s3": 4, "s4": 2, "s5": 3, "s6": 2, "s7": 1}
    pool = [s for s in svcs for _ in range(weights.get(s["id"], 1))]
    barbers = [r["id"] for r in rows(conn, "SELECT id FROM barbers WHERE active=1")]
    for off in range(frm, to + 1):
        day = add_days(today, off)
        wd = datetime.fromisoformat(day).weekday()
        load = {4: 0.85, 5: 0.92, 6: 0.55}.get(wd, 0.62)
        if off > 0:
            load *= max(0.2, 0.85 - off * 0.08)
        for bid in barbers:
            # у каждого мастера выходной раз в неделю
            if (sum(map(ord, bid)) + datetime.fromisoformat(day).toordinal()) % 7 == 0:
                if not scalar(conn, "SELECT 1 FROM bookings WHERE barber_id=? AND date=?", (bid, day)):
                    conn.execute("INSERT OR IGNORE INTO days_off(barber_id,date) VALUES(?,?)", (bid, day))
                continue
            o, c = _hours(day)
            t = o
            while t < c - 20:
                if rng.random() > load:
                    t += STEP
                    continue
                s = rng.choice(pool)
                if t + s["dur"] > c:
                    break
                past_end = off < 0 or (off == 0 and t + s["dur"] <= now_min)
                in_chair = off == 0 and t <= now_min < t + s["dur"]
                status = ("noshow" if rng.random() < 0.04 else "done") if past_end else ("chair" if in_chair else "wait")
                if not past_end and rng.random() < 0.05:
                    status = "cancelled"
                conn.execute("INSERT INTO bookings(id,barber_id,service_id,service,date,start,dur,price,client,phone,user_id,status,source,created_at,seed) "
                             "VALUES(?,?,?,?,?,?,?,?,?,?,NULL,?,?,?,1)",
                             (new_id("BR"), bid, s["id"], s["name"], day, t, s["dur"], s["price"], rng.choice(CLIENTS),
                              "+37529" + str(rng.randint(1000000, 9999999)), status, "app" if rng.random() < 0.7 else "admin",
                              f"{add_days(day, -rng.randint(0, 5))}T12:00:00+03:00"))
                t += s["dur"] + (STEP if rng.random() < 0.5 else 0)


def seed(conn, now: datetime) -> None:
    rng = random.Random(3)
    for i, (bid, name, spec, exp, color, rating, bio) in enumerate(SEED_BARBERS):
        conn.execute("INSERT INTO barbers(id,name,spec,exp,bio,color,rating,sort) VALUES(?,?,?,?,?,?,?,?)", (bid, name, spec, exp, bio, color, rating, i))
    for i, (sid, name, dur, price, descr) in enumerate(SEED_SERVICES):
        conn.execute("INSERT INTO services(id,name,dur,price,descr,sort) VALUES(?,?,?,?,?,?)", (sid, name, dur, price, descr, i))
    _seed_days(conn, rng, now.date().isoformat(), now.hour * 60 + now.minute, -35, 7)


def refresh(conn, now: datetime) -> None:
    today = now.date().isoformat()
    conn.execute("UPDATE bookings SET status='done' WHERE seed=1 AND date<? AND status IN ('wait','chair')", (today,))
    last = scalar(conn, "SELECT MAX(date) FROM bookings WHERE seed=1") or today
    start = max(1, (datetime.fromisoformat(last) - datetime.fromisoformat(today)).days + 1)
    if start <= 7:
        _seed_days(conn, random.Random(today), today, 0, start, 7)
    conn.execute("DELETE FROM bookings WHERE seed=1 AND date<?", (add_days(today, -120),))


bot = Bot("barbershop", SCHEMA, seed, refresh)


# ============ КЛИЕНТ ============

def _nearest(c: Ctx, barber_id: str, dur: int) -> dict | None:
    for off in range(0, AHEAD):
        day = add_days(c.today, off)
        starts = _free_starts(c.conn, barber_id, day, dur, _now_min(c) + 15 if off == 0 else -1)
        if starts:
            return {"date": day, "time": min_to_hm(starts[0])}
    return None


@bot.action("getBarbers")
def get_barbers(c: Ctx, p: dict):
    svcs = [_svc_out(r) for r in rows(c.conn, "SELECT * FROM services WHERE active=1 ORDER BY sort")]
    barbers = []
    for r in rows(c.conn, "SELECT * FROM barbers WHERE active=1 ORDER BY sort"):
        b = _barber_out(r)
        b["nextFree"] = _nearest(c, r["id"], 30)
        b["reviews"] = 40 + int(r["rating"] * 31) % 90
        barbers.append(b)
    return {"barbers": barbers, "services": svcs, "hours": {"open": min_to_hm(OPEN), "close": min_to_hm(CLOSE), "sunOpen": min_to_hm(SUN_OPEN), "sunClose": min_to_hm(SUN_CLOSE)},
            "address": "Минск, ул. Октябрьская, 16", "phone": "+375291234567"}


def _svc(c: Ctx, sid: str) -> dict:
    s = one(c.conn, "SELECT * FROM services WHERE id=? AND active=1", (sid,))
    if not s:
        raise ApiError("not_found")
    return s


def _barber(c: Ctx, bid: str) -> dict:
    b = one(c.conn, "SELECT * FROM barbers WHERE id=? AND active=1", (bid,))
    if not b:
        raise ApiError("not_found")
    return b


@bot.action("getSlots")
def get_slots(c: Ctx, p: dict):
    b = _barber(c, v_id(p, "barberId"))
    s = _svc(c, v_id(p, "serviceId"))
    day = v_date(p, "date")
    if day < c.today or day > add_days(c.today, AHEAD):
        return {"times": [], "dayOff": False}
    off = bool(scalar(c.conn, "SELECT 1 FROM days_off WHERE barber_id=? AND date=?", (b["id"], day)))
    starts = _free_starts(c.conn, b["id"], day, s["dur"], _now_min(c) + 15 if day == c.today else -1)
    return {"times": [min_to_hm(x) for x in starts], "dayOff": off}


@bot.action("getNearest")
def get_nearest(c: Ctx, p: dict):
    s = _svc(c, v_id(p, "serviceId"))
    best = None
    for b in rows(c.conn, "SELECT * FROM barbers WHERE active=1 ORDER BY sort"):
        n = _nearest(c, b["id"], s["dur"])
        if n and (best is None or (n["date"], n["time"].zfill(5)) < (best["date"], best["time"].zfill(5))):
            best = {**n, "barberId": b["id"], "barber": b["name"]}
    return {"match": best}


@bot.action("createBooking", write=True)
def create_booking(c: Ctx, p: dict):
    user = c.need_user()
    b = _barber(c, v_id(p, "barberId"))
    s = _svc(c, v_id(p, "serviceId"))
    day = v_date(p, "date")
    start = hm_to_min(v_time(p, "time"))
    name = v_str(p, "name", max_len=60, min_len=2)
    phone = v_phone(p, "phone")
    if day < c.today or day > add_days(c.today, AHEAD):
        raise ApiError("bad_date")
    if scalar(c.conn, "SELECT COUNT(*) FROM bookings WHERE user_id=? AND date>=? AND status IN ('wait','chair')", (user, c.today)) >= PER_USER_ACTIVE:
        raise ApiError("too_many")
    if start not in _free_starts(c.conn, b["id"], day, s["dur"], _now_min(c) if day == c.today else -1):
        raise ApiError("slot_unavailable")
    cap_rows(c.conn, "bookings", LIMITS["bookings"])
    bid = new_id("BR")
    c.conn.execute("INSERT INTO bookings(id,barber_id,service_id,service,date,start,dur,price,client,phone,user_id,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'wait',?)",
                   (bid, b["id"], s["id"], s["name"], day, start, s["dur"], s["price"], name, phone, user, iso_now()))
    return {"booking": _booking_out(c.conn, one(c.conn, "SELECT * FROM bookings WHERE id=?", (bid,)))}


@bot.action("getMyBookings")
def get_my_bookings(c: Ctx, p: dict):
    user = c.need_user()
    rs = rows(c.conn, "SELECT * FROM bookings WHERE user_id=? ORDER BY date DESC, start DESC LIMIT 30", (user,))
    return {"bookings": [_booking_out(c.conn, r) for r in rs]}


@bot.action("cancelBooking", write=True)
def cancel_booking(c: Ctx, p: dict):
    user = c.need_user()
    r = one(c.conn, "SELECT * FROM bookings WHERE id=? AND user_id=?", (v_id(p, "id"), user))
    if not r:
        raise ApiError("not_found")
    if r["status"] != "wait":
        raise ApiError("bad_state")
    c.conn.execute("UPDATE bookings SET status='cancelled' WHERE id=?", (r["id"],))
    return {}


# ============ АДМИН ============

@bot.action("getDay")
def get_day(c: Ctx, p: dict):
    day = v_date(p, "date", required=False, default=c.today)
    rs = rows(c.conn, "SELECT * FROM bookings WHERE date=? ORDER BY start, barber_id", (day,))
    barbers = []
    free_total = 0
    for b in rows(c.conn, "SELECT * FROM barbers WHERE active=1 ORDER BY sort"):
        off = bool(scalar(c.conn, "SELECT 1 FROM days_off WHERE barber_id=? AND date=?", (b["id"], day)))
        o, cl = _hours(day)
        busy = sum(r["dur"] for r in rs if r["barber_id"] == b["id"] and r["status"] in ("wait", "chair", "done"))
        free = 0 if off else len(_free_starts(c.conn, b["id"], day, 30, _now_min(c) if day == c.today else -1))
        free_total += free
        barbers.append({**_barber_out(b), "dayOff": off, "loadPct": 0 if off else round(busy / (cl - o) * 100), "free": free,
                        "count": sum(1 for r in rs if r["barber_id"] == b["id"] and r["status"] not in ("cancelled",))})
    act = [r for r in rs if r["status"] not in ("cancelled",)]
    return {"date": day, "bookings": [_booking_out(c.conn, r) for r in rs], "barbers": barbers,
            "stats": {"total": len(act), "done": sum(1 for r in act if r["status"] == "done"), "chair": sum(1 for r in act if r["status"] == "chair"),
                      "free": free_total, "revenue": sum(r["price"] for r in act if r["status"] != "noshow")}}


@bot.action("setStatus", write=True)
def set_status(c: Ctx, p: dict):
    st = v_enum(p, "status", ["wait", "chair", "done", "cancelled", "noshow"])
    r = one(c.conn, "SELECT * FROM bookings WHERE id=?", (v_id(p, "id"),))
    if not r:
        raise ApiError("not_found")
    if r["status"] in ("cancelled", "noshow") and st in ("wait", "chair", "done"):
        busy = [x for x in _busy(c.conn, r["barber_id"], r["date"], exclude=r["id"])]
        if any(not (r["start"] >= b or r["start"] + r["dur"] <= a) for a, b in busy):
            raise ApiError("slot_unavailable")
    c.conn.execute("UPDATE bookings SET status=? WHERE id=?", (st, r["id"]))
    return {}


@bot.action("createBookingAdmin", write=True)
def create_booking_admin(c: Ctx, p: dict):
    b = _barber(c, v_id(p, "barberId"))
    s = _svc(c, v_id(p, "serviceId"))
    day = v_date(p, "date", required=False, default=c.today)
    start = hm_to_min(v_time(p, "time"))
    client = v_str(p, "client", max_len=60, min_len=2)
    phone = v_phone(p, "phone", required=False)
    if day < c.today or day > add_days(c.today, AHEAD):
        raise ApiError("bad_date")
    if start not in _free_starts(c.conn, b["id"], day, s["dur"]):
        raise ApiError("slot_unavailable", "Мастер занят в это время")
    cap_rows(c.conn, "bookings", LIMITS["bookings"])
    bid = new_id("BR")
    c.conn.execute("INSERT INTO bookings(id,barber_id,service_id,service,date,start,dur,price,client,phone,status,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,'wait','admin',?)",
                   (bid, b["id"], s["id"], s["name"], day, start, s["dur"], s["price"], client, phone, iso_now()))
    return {"booking": _booking_out(c.conn, one(c.conn, "SELECT * FROM bookings WHERE id=?", (bid,)))}


@bot.action("getAdminSlots")
def get_admin_slots(c: Ctx, p: dict):
    b = _barber(c, v_id(p, "barberId"))
    s = _svc(c, v_id(p, "serviceId"))
    day = v_date(p, "date", required=False, default=c.today)
    return {"times": [min_to_hm(x) for x in _free_starts(c.conn, b["id"], day, s["dur"], _now_min(c) - 30 if day == c.today else -1)]}


@bot.action("setDayOff", write=True)
def set_day_off(c: Ctx, p: dict):
    b = _barber(c, v_id(p, "barberId"))
    day = v_date(p, "date")
    off = v_bool(p, "off")
    if off:
        if scalar(c.conn, "SELECT 1 FROM bookings WHERE barber_id=? AND date=? AND status IN ('wait','chair')", (b["id"], day)):
            raise ApiError("has_bookings", "У мастера есть записи на этот день")
        c.conn.execute("INSERT OR IGNORE INTO days_off(barber_id,date) VALUES(?,?)", (b["id"], day))
    else:
        c.conn.execute("DELETE FROM days_off WHERE barber_id=? AND date=?", (b["id"], day))
    return {}


@bot.action("getBookings")
def get_bookings(c: Ctx, p: dict):
    frm = v_date(p, "from", required=False, default=add_days(c.today, -7))
    to = v_date(p, "to", required=False, default=add_days(c.today, AHEAD))
    rs = rows(c.conn, "SELECT * FROM bookings WHERE date BETWEEN ? AND ? ORDER BY date DESC, start DESC LIMIT 500", (frm, to))
    return {"bookings": [_booking_out(c.conn, r) for r in rs]}


# ============ ВЛАДЕЛЕЦ ============
DOW = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]


@bot.action("getOverview")
def get_overview(c: Ctx, p: dict):
    period = v_enum(p, "period", ["day", "week", "month"], required=False, default="week")
    t = c.today
    frm = {"day": t, "week": add_days(t, -6), "month": add_days(t, -29)}[period]
    rs = rows(c.conn, "SELECT * FROM bookings WHERE date BETWEEN ? AND ? AND status IN ('done','chair','wait')", (frm, t))
    done = [r for r in rs if r["status"] == "done"]
    revenue = sum(r["price"] for r in done)
    barbers = rows(c.conn, "SELECT * FROM barbers WHERE active=1 ORDER BY sort")
    days = (datetime.fromisoformat(t) - datetime.fromisoformat(frm)).days + 1
    cap = 0
    for i in range(days):
        day = add_days(frm, i)
        o, cl = _hours(day)
        for b in barbers:
            if not scalar(c.conn, "SELECT 1 FROM days_off WHERE barber_id=? AND date=?", (b["id"], day)):
                cap += cl - o
    fill = round(sum(r["dur"] for r in rs) / cap * 100) if cap else 0
    chart = []
    for i in range(days):
        day = add_days(frm, i)
        chart.append({"date": day, "label": DOW[datetime.fromisoformat(day).weekday()] if days <= 7 else str(int(day[8:])),
                      "revenue": round(sum(r["price"] for r in done if r["date"] == day))})
    rank = []
    for b in barbers:
        mine = [r for r in done if r["barber_id"] == b["id"]]
        rank.append({**_barber_out(b), "bookings": len(mine), "revenue": round(sum(r["price"] for r in mine)),
                     "payout": round(sum(r["price"] for r in mine) * b["pct"] / 100)})
    rank.sort(key=lambda x: -x["revenue"])
    svc = {}
    for r in done:
        a = svc.setdefault(r["service"], [0, 0]); a[0] += r["price"]; a[1] += 1
    top = sorted(({"name": k, "revenue": round(v[0]), "count": v[1]} for k, v in svc.items()), key=lambda x: -x["revenue"])
    noshow = scalar(c.conn, "SELECT COUNT(*) FROM bookings WHERE date BETWEEN ? AND ? AND status='noshow'", (frm, t))
    return {"kpi": {"revenue": round(revenue), "count": len(done), "avg": round(revenue / len(done)) if done else 0, "fill": fill, "noshow": noshow},
            "chart": chart, "rank": rank, "services": top}


@bot.action("getLoad")
def get_load(c: Ctx, p: dict):
    frm = add_days(c.today, -27)
    out = []
    for wd in range(7):
        days = [add_days(frm, i) for i in range(28) if datetime.fromisoformat(add_days(frm, i)).weekday() == wd]
        busy = cap = 0
        for day in days:
            o, cl = _hours(day)
            for b in rows(c.conn, "SELECT id FROM barbers WHERE active=1"):
                if not scalar(c.conn, "SELECT 1 FROM days_off WHERE barber_id=? AND date=?", (b["id"], day)):
                    cap += cl - o
            busy += scalar(c.conn, "SELECT COALESCE(SUM(dur),0) FROM bookings WHERE date=? AND status IN ('done','chair','wait')", (day,))
        out.append({"day": DOW[wd], "pct": round(busy / cap * 100) if cap else 0})
    hours = []
    for h in range(10, 21):
        n = scalar(c.conn, "SELECT COUNT(*) FROM bookings WHERE date BETWEEN ? AND ? AND status IN ('done','chair','wait') AND start>=? AND start<?",
                   (frm, c.today, h * 60, h * 60 + 60))
        hours.append({"hour": f"{h}:00", "count": n})
    return {"weekdays": out, "hours": hours}


@bot.action("getServicesAdmin")
def get_services_admin(c: Ctx, p: dict):
    return {"services": [_svc_out(r) for r in rows(c.conn, "SELECT * FROM services ORDER BY sort")]}


@bot.action("saveService", write=True)
def save_service(c: Ctx, p: dict):
    s = v_obj(p, "service")
    data = {"name": v_str(s, "name", max_len=60, min_len=3), "dur": v_int(s, "dur", lo=10, hi=180),
            "price": float(v_int(s, "price", lo=1, hi=1000)), "descr": v_str(s, "desc", max_len=200, required=False),
            "active": int(v_bool(s, "active", default=True))}
    if data["dur"] % STEP:
        raise ApiError("bad_request", "Длительность кратна 20 минутам")
    sid = v_id(s, "id", required=False)
    if sid and one(c.conn, "SELECT 1 FROM services WHERE id=?", (sid,)):
        c.conn.execute("UPDATE services SET name=?, dur=?, price=?, descr=?, active=? WHERE id=?", (*data.values(), sid))
    else:
        if scalar(c.conn, "SELECT COUNT(*) FROM services") >= LIMITS["services"]:
            raise ApiError("limit")
        sid = new_id("s")
        c.conn.execute("INSERT INTO services(id,name,dur,price,descr,active,sort) VALUES(?,?,?,?,?,?,99)", (sid, *data.values()))
    return {"service": _svc_out(one(c.conn, "SELECT * FROM services WHERE id=?", (sid,)))}


@bot.action("saveBarber", write=True)
def save_barber(c: Ctx, p: dict):
    b = v_obj(p, "barber")
    bid = v_id(b, "id")
    r = one(c.conn, "SELECT * FROM barbers WHERE id=?", (bid,))
    if not r:
        raise ApiError("not_found")
    pct = v_int(b, "pct", lo=10, hi=80, required=False, default=r["pct"])
    spec = v_str(b, "spec", max_len=60, required=False, default=r["spec"]) or r["spec"]
    active = int(v_bool(b, "active", default=bool(r["active"])))
    c.conn.execute("UPDATE barbers SET pct=?, spec=?, active=? WHERE id=?", (pct, spec, active, bid))
    return {"barber": _barber_out(one(c.conn, "SELECT * FROM barbers WHERE id=?", (bid,)))}


@bot.action("getBarbersAdmin")
def get_barbers_admin(c: Ctx, p: dict):
    return {"barbers": [_barber_out(r) for r in rows(c.conn, "SELECT * FROM barbers ORDER BY sort")]}
