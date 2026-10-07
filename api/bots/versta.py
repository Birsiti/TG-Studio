# изменено 2026-10-08 02:48
"""ВЕРСТА — междугородние маршрутки. Контракт спроектирован по мок-функциям
шести ролей versta/: client, admin (диспетчер), driver, mechanic, owner,
platform (кабинет платформы для нескольких перевозчиков).

Коридоры — линии с остановками и смещением в минутах от начальной точки;
направление (route) — коридор в одну сторону. Рейсы генерируются из
шаблонов расписания. Бронь — места на рейсе между двумя остановками,
цена сегмента считается сервером пропорционально времени в пути.
"""
from __future__ import annotations

import random
from datetime import datetime

from core import (ApiError, Bot, Ctx, add_days, cap_rows, hm_to_min, iso_now, jdump, jload, min_to_hm, new_id, one, rows,
                  scalar, upsert, v_bool, v_date, v_enum, v_id, v_int, v_list, v_obj, v_phone, v_str, v_time)

SCHEMA = """
CREATE TABLE IF NOT EXISTS corridors(code TEXT PRIMARY KEY, full_price REAL NOT NULL, points TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS routes(id TEXT PRIMARY KEY, code TEXT NOT NULL, from_city TEXT NOT NULL, to_city TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS drivers(id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS vehicles(
  plate TEXT PRIMARY KEY, model TEXT NOT NULL, year INTEGER NOT NULL, seats INTEGER NOT NULL, odo INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'в строю', repair_note TEXT NOT NULL DEFAULT '', docs TEXT NOT NULL DEFAULT '{}',
  last_service TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS templates(
  id TEXT PRIMARY KEY, route_id TEXT NOT NULL, time TEXT NOT NULL, seats_total INTEGER NOT NULL, days TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1, seed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS trips(
  id TEXT PRIMARY KEY, route_id TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL, seats_total INTEGER NOT NULL,
  driver_id TEXT, vehicle TEXT, cancelled INTEGER NOT NULL DEFAULT 0, driver_status TEXT NOT NULL DEFAULT 'ожидание',
  alert TEXT, template_id TEXT, seed INTEGER NOT NULL DEFAULT 0, UNIQUE(route_id, date, time));
CREATE INDEX IF NOT EXISTS trips_date ON trips(date);
CREATE TABLE IF NOT EXISTS bookings(
  id TEXT PRIMARY KEY, code TEXT NOT NULL, trip_id TEXT NOT NULL, user_id TEXT, name TEXT NOT NULL, phone TEXT NOT NULL,
  seats INTEGER NOT NULL, pickup_idx INTEGER NOT NULL, dropoff_idx INTEGER NOT NULL, price REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'ожидание', created_at TEXT NOT NULL, seed INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS vb_trip ON bookings(trip_id);
CREATE INDEX IF NOT EXISTS vb_user ON bookings(user_id);
CREATE TABLE IF NOT EXISTS reg_items(
  id TEXT PRIMARY KEY, plate TEXT NOT NULL, kind TEXT NOT NULL, every_km INTEGER, last_km INTEGER, every_days INTEGER, last_date TEXT);
CREATE TABLE IF NOT EXISTS defects(
  id TEXT PRIMARY KEY, num INTEGER NOT NULL, plate TEXT NOT NULL, opened TEXT NOT NULL, closed TEXT, source TEXT NOT NULL,
  reporter TEXT NOT NULL, ctx TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL, status TEXT NOT NULL, parts TEXT NOT NULL DEFAULT '', downtime INTEGER NOT NULL DEFAULT 0,
  log TEXT NOT NULL DEFAULT '[]', seed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS shifts(
  date TEXT NOT NULL, plate TEXT NOT NULL, driver_id TEXT, first TEXT NOT NULL DEFAULT '', trips INTEGER NOT NULL DEFAULT 0,
  insp TEXT, PRIMARY KEY(date, plate));
CREATE TABLE IF NOT EXISTS tenants(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL, status TEXT NOT NULL, commission REAL NOT NULL, joined TEXT NOT NULL,
  routes TEXT NOT NULL DEFAULT '[]', drivers TEXT NOT NULL DEFAULT '[]', vehicles TEXT NOT NULL DEFAULT '[]', seed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS counters(k TEXT PRIMARY KEY, v INTEGER NOT NULL);
"""

CORRIDORS = [
    ("M1", 22, [("Минск, Центральный автовокзал", 0), ("Барановичи, АВ", 90), ("Кобрин", 165), ("Брест, АВ", 195)]),
    ("M5", 20, [("Минск, Восточный автовокзал", 0), ("Бобруйск, АВ", 100), ("Жлобин", 150), ("Гомель, АВ", 205)]),
    ("M6", 21, [("Минск, Центральный автовокзал", 0), ("Ивенец", 55), ("Лида, АВ", 150), ("Гродно, АВ", 215)]),
    ("M3", 19, [("Минск, Центральный автовокзал", 0), ("Плещеницы", 60), ("Лепель", 130), ("Витебск, АВ", 200)]),
    ("M4", 16, [("Минск, Восточный автовокзал", 0), ("Червень", 45), ("Березино", 80), ("Могилёв, АВ", 140)]),
]
OUT_TIMES = ["06:20", "08:45", "14:15", "19:40"]
BACK_TIMES = ["06:50", "10:30", "15:40", "18:20"]
SEATS = 16
MAX_BOOK_SEATS = 6
DRIVERS = [("dr1", "Сергей Ковалёв", "+375291234501"), ("dr2", "Алексей Дайнеко", "+375297654302"),
           ("dr3", "Игорь Русак", "+375445550103"), ("dr4", "Павел Шпак", "+375333210004"),
           ("dr5", "Виктор Лис", "+375296661205"), ("dr6", "Андрей Кот", "+375257770406"),
           ("dr7", "Олег Сыч", "+375291002007"), ("dr8", "Николай Бобр", "+375447003008"),
           ("dr9", "Дмитрий Жук", "+375335004009"), ("dr10", "Руслан Гайко", "+375296005010")]
NAMES = ["Анна Ковалёва", "Дмитрий Соколов", "Ирина Петрова", "Максим Гриб", "Ольга Шевченко", "Павел Литвин", "Наталья Волк",
         "Виктор Мороз", "Екатерина Жук", "Роман Савич", "Татьяна Бондарь", "Андрей Кот", "Юлия Ракович", "Олег Сыч"]
DOCS = ["ОСГО (автогражданка)", "Гостехосмотр", "Тахограф — калибровка", "Огнетушитель — перезарядка", "Аптечка — срок годности"]
CHECKLIST = ["Тормозная система и стояночный тормоз", "Рулевое управление, отсутствие люфта", "Шины: давление, износ, порезы",
             "Внешние световые приборы и указатели", "Стеклоочистители и омыватель", "Ремни безопасности всех мест",
             "Аптечка, огнетушитель, знак аварийной остановки", "Отопитель салона, отсутствие посторонних запахов",
             "Уровни: масло ДВС, охлаждающая и тормозная жидкость", "Чистота салона и стёкол, зеркала, тахограф"]
DAILY_KM = 420
B_STATUSES = ["ожидание", "посажен", "не пришёл"]
LIMITS = {"bookings": 20000, "templates": 80, "defects": 600, "tenants": 40}
PER_USER_ACTIVE = 6


def city(name: str) -> str:
    return name.split(",")[0].strip()


def _counter(conn, k: str, start: int) -> int:
    v = scalar(conn, "SELECT v FROM counters WHERE k=?", (k,))
    v = (v or start) + 1
    upsert(conn, "counters", "k", {"k": k, "v": v})
    return v


def _route(conn, rid: str) -> dict:
    r = one(conn, "SELECT * FROM routes WHERE id=?", (rid,))
    if not r:
        raise ApiError("not_found")
    c = one(conn, "SELECT * FROM corridors WHERE code=?", (r["code"],))
    pts = jload(c["points"], [])
    if city(pts[0]["name"]) != r["from_city"]:
        total = pts[-1]["offset"]
        pts = [{"name": p["name"], "offset": total - p["offset"]} for p in reversed(pts)]
    return {"id": r["id"], "code": r["code"], "from": r["from_city"], "to": r["to_city"], "fullPrice": c["full_price"], "points": pts}


def _seg_price(route: dict, a: int, b: int) -> int:
    pts = route["points"]
    per_min = route["fullPrice"] / pts[-1]["offset"]
    return max(5, round((pts[b]["offset"] - pts[a]["offset"]) * per_min))


def _filled(conn, trip_id: str) -> int:
    return scalar(conn, "SELECT COALESCE(SUM(seats),0) FROM bookings WHERE trip_id=? AND status<>'cancelled'", (trip_id,))


def _ticket_code(rng=None) -> str:
    alphabet = "ABCEHKMPTX"
    r = rng or random.SystemRandom()
    return "".join(r.choice(alphabet) for _ in range(2)) + str(r.randint(1000, 9999))


# ============ ДЕМО ============

def _insert_trip(conn, route_id, day, t, tpl_id, rng, today, seed=1):
    tid = f"T-{day.replace('-', '')}-{route_id}-{t.replace(':', '')}"
    if scalar(conn, "SELECT 1 FROM trips WHERE id=?", (tid,)):
        return None
    conn.execute("INSERT INTO trips(id,route_id,date,time,seats_total,template_id,seed) VALUES(?,?,?,?,?,?,?)",
                 (tid, route_id, day, t, SEATS, tpl_id, seed))
    return tid


def _assign_day(conn, day: str, today: str, rng) -> None:
    """Жадно раздаём водителей и машины так, чтобы у одного водителя/машины
    рейсы не пересекались по времени (+40 минут на отдых и посадку)."""
    trips = rows(conn, "SELECT t.id, t.time, t.route_id FROM trips t WHERE t.date=? AND t.driver_id IS NULL AND t.seed=1 ORDER BY t.time", (day,))
    if not trips:
        return
    dur = {r["id"]: jload(one(conn, "SELECT points FROM corridors WHERE code=?", (r["code"],))["points"], [])[-1]["offset"]
           for r in rows(conn, "SELECT id, code FROM routes")}
    drv = {d[0]: 0 for d in DRIVERS}
    veh = {r["plate"]: 0 for r in rows(conn, "SELECT plate FROM vehicles")}
    in_service = {r["plate"] for r in rows(conn, "SELECT plate FROM vehicles WHERE status='в строю'")}
    for t in trips:
        if day >= today and rng.random() < 0.12:
            continue  # часть будущих рейсов — «без водителя», работа диспетчеру
        start = hm_to_min(t["time"])
        end = start + dur[t["route_id"]] + 40
        free_d = [d for d, busy in drv.items() if busy <= start]
        if not free_d:
            continue
        d = rng.choice(free_d)
        pool = [p for p, busy in veh.items() if busy <= start and (p in in_service or day < today)]
        v = rng.choice(pool) if pool else None
        drv[d] = end
        if v:
            veh[v] = end
        conn.execute("UPDATE trips SET driver_id=?, vehicle=? WHERE id=?", (d, v, t["id"]))


def _seed_bookings(conn, tid, route, day, today, now_min, rng, density):
    n = int(rng.random() * density * 8)
    filled = 0
    past = day < today or (day == today and hm_to_min(scalar(conn, "SELECT time FROM trips WHERE id=?", (tid,))) < now_min - 60)
    last = len(route["points"]) - 1
    for _ in range(n):
        seats = 1 if rng.random() < 0.7 else 2
        if filled + seats > SEATS - 1:
            break
        a = rng.randint(0, last - 1) if rng.random() < 0.4 else 0
        b = rng.randint(a + 1, last) if rng.random() < 0.4 else last
        status = ("не пришёл" if rng.random() < 0.07 else "посажен") if past else "ожидание"
        conn.execute("INSERT INTO bookings(id,code,trip_id,user_id,name,phone,seats,pickup_idx,dropoff_idx,price,status,created_at,seed) "
                     "VALUES(?,?,?,NULL,?,?,?,?,?,?,?,?,1)",
                     (new_id("B"), _ticket_code(rng), tid, rng.choice(NAMES), "+37529" + str(rng.randint(1000000, 9999999)),
                      seats, a, b, _seg_price(route, a, b) * seats, status, f"{add_days(day, -rng.randint(0, 3))}T12:00:00+03:00"))
        filled += seats


def _gen_window(conn, today: str, now_min: int, from_off: int, to_off: int, rng) -> None:
    tpls = rows(conn, "SELECT * FROM templates WHERE active=1")
    routes = {r["id"]: _route(conn, r["id"]) for r in rows(conn, "SELECT id FROM routes")}
    for off in range(from_off, to_off + 1):
        day = add_days(today, off)
        wd = datetime.fromisoformat(day).weekday()
        for tp in tpls:
            if wd not in jload(tp["days"], []):
                continue
            tid = _insert_trip(conn, tp["route_id"], day, tp["time"], tp["id"], rng, today)
            if not tid:
                continue
            dens = 1.25 if wd in (4, 6) else 0.9
            if off > 0:
                dens *= max(0.15, 0.8 - off * 0.1)
            _seed_bookings(conn, tid, routes[tp["route_id"]], day, today, now_min, rng, dens)
            t_min = hm_to_min(tp["time"])
            dur = routes[tp["route_id"]]["points"][-1]["offset"]
            if day < today or (day == today and t_min + dur < now_min):
                conn.execute("UPDATE trips SET driver_status='завершён' WHERE id=?", (tid,))
            elif day == today and t_min <= now_min:
                conn.execute("UPDATE trips SET driver_status='в пути' WHERE id=?", (tid,))
        _assign_day(conn, day, today, rng)


def seed(conn, now: datetime) -> None:
    rng = random.Random(5)
    today = now.date().isoformat()
    now_min = now.hour * 60 + now.minute
    for code, price, pts in CORRIDORS:
        conn.execute("INSERT INTO corridors(code,full_price,points) VALUES(?,?,?)",
                     (code, price, jdump([{"name": n, "offset": o} for n, o in pts])))
        a, b = city(pts[0][0]), city(pts[-1][0])
        conn.execute("INSERT INTO routes(id,code,from_city,to_city) VALUES(?,?,?,?)", (f"{code}f", code, a, b))
        conn.execute("INSERT INTO routes(id,code,from_city,to_city) VALUES(?,?,?,?)", (f"{code}b", code, b, a))
        for t in OUT_TIMES:
            conn.execute("INSERT INTO templates(id,route_id,time,seats_total,days,seed) VALUES(?,?,?,?,?,1)", (f"tp-{code}f-{t[:2]}", f"{code}f", t, SEATS, "[0,1,2,3,4,5,6]"))
        for t in BACK_TIMES:
            conn.execute("INSERT INTO templates(id,route_id,time,seats_total,days,seed) VALUES(?,?,?,?,?,1)", (f"tp-{code}b-{t[:2]}", f"{code}b", t, SEATS, "[0,1,2,3,4,5,6]"))
    for did, name, phone in DRIVERS:
        conn.execute("INSERT INTO drivers(id,name,phone) VALUES(?,?,?)", (did, name, phone))
    fleet = [
        ("AI 1234-7", "Mercedes-Benz Sprinter", 2019, 16, 341987, "в строю", "", [74, 188, 410, 19, 150], (335000, -24, "ТО, полный объём (масло, фильтры, диагностика ходовой)")),
        ("AI 5821-7", "Mercedes-Benz Sprinter", 2021, 16, 268450, "в строю", "", [-3, 96, 300, 120, 60], (255000, -40, "ТО + замена передних колодок")),
        ("AI 0092-7", "Ford Transit", 2018, 18, 402300, "в ремонте", "Замена комплекта сцепления — заявка D-1042", [40, 12, 210, 90, 200], (390000, -70, "ТО, полный объём")),
        ("AI 7743-7", "Mercedes-Benz Sprinter", 2020, 16, 288300, "в строю", "", [150, 250, 500, 240, 330], (285000, -12, "ТО, полный объём")),
        ("AI 3310-7", "Peugeot Boxer", 2017, 19, 375640, "ожидает з/ч", "Ожидается моторчик отопителя салона — заявка D-1049", [58, 9, 120, 70, -10], (358000, -95, "ТО + замена ремня ГРМ")),
        ("AI 6604-7", "Volkswagen Crafter", 2022, 18, 96120, "в строю", "", [210, 390, 600, 300, 400], (90000, -30, "Гарантийное ТО-1 у дилера")),
    ]
    for plate, model, year, seats, odo, st, note, docs, (km, d, txt) in fleet:
        conn.execute("INSERT INTO vehicles(plate,model,year,seats,odo,status,repair_note,docs,last_service) VALUES(?,?,?,?,?,?,?,?,?)",
                     (plate, model, year, seats, odo, st, note, jdump({k: add_days(today, n) for k, n in zip(DOCS, docs)}),
                      jdump({"km": km, "date": add_days(today, d), "text": txt})))
    reg = [("AI 3310-7", "ТО — полный объём", 15000, 358000, None, None), ("AI 3310-7", "Тормозные колодки, передние", 30000, 347000, None, None),
           ("AI 3310-7", "Сезонная замена шин", None, None, 182, -150), ("AI 5821-7", "ТО — полный объём", 15000, 255000, None, None),
           ("AI 5821-7", "Замена масла ДВС и фильтров", 10000, 262000, None, None), ("AI 1234-7", "ТО — полный объём", 15000, 335000, None, None),
           ("AI 1234-7", "Замена тормозной жидкости", None, None, 730, -672), ("AI 7743-7", "ТО — полный объём", 15000, 285000, None, None),
           ("AI 7743-7", "Ремень ГРМ + ролики", 90000, 210000, None, None), ("AI 6604-7", "Гарантийное ТО-2 (дилер)", 15000, 90000, None, None),
           ("AI 6604-7", "Сезонная замена шин", None, None, 182, -150), ("AI 0092-7", "ТО — полный объём", 15000, 390000, None, None)]
    for i, (plate, kind, ekm, lkm, edays, ldate) in enumerate(reg):
        conn.execute("INSERT INTO reg_items(id,plate,kind,every_km,last_km,every_days,last_date) VALUES(?,?,?,?,?,?,?)",
                     (f"rg{i + 1}", plate, kind, ekm, lkm, edays, add_days(today, ldate) if ldate is not None else None))
    defects = [
        (1042, "AI 0092-7", -2, None, "водитель", "Павел Шпак", "рейс M4 08:45 Минск → Могилёв", "Пробуксовка сцепления, педаль проваливается",
         "При переключении на 3–4 передачу обороты растут, скорость не набирается. Запах гари. Рейс прерван в Червене.", "критично", "в работе",
         "Комплект сцепления LUK", 3, [(-2, "Диспетчер", "Рейс снят, ТС отбуксировано в парк"), (-1, "Механик", "Износ ведомого диска, заказан комплект сцепления")]),
        (1048, "AI 6604-7", 0, None, "водитель", "Игорь Русак", "выезд из парка, рейс M6 08:45", "Стук в передней подвеске справа",
         "На скорости от 60 км/ч по ямам металлический стук спереди справа. Подозрение на стойку стабилизатора.", "критично", "новая", "", 0, []),
        (1049, "AI 3310-7", -1, None, "плановый осмотр", "Механик", "плановый осмотр парка", "Не работает отопитель салона",
         "Печка не подаёт тёплый воздух. Вероятно неисправен моторчик вентилятора.", "плановая", "в работе", "Моторчик вентилятора отопителя", 0,
         [(-1, "Механик", "Заказан моторчик, до поставки — короткие дневные рейсы")]),
        (1039, "AI 5821-7", -4, None, "водитель", "Алексей Дайнеко", "рейс M5 Минск → Гомель", "Скол на лобовом стекле",
         "Прилетел камень на трассе. Скол около 5 мм вне зоны обзора водителя.", "плановая", "в работе", "Ремонт скола у подрядчика", 0,
         [(-3, "Механик", "Записаны на ремонт скола, эксплуатацию допускаю")]),
        (1051, "AI 7743-7", 0, None, "водитель", "Павел Шпак", "рейс M4 06:20 Минск → Могилёв", "Задняя дверь закрывается со второго раза",
         "Нижний фиксатор замка подклинивает.", "плановая", "новая", "", 0, []),
        (1030, "AI 1234-7", -6, -5, "плановый осмотр", "Механик", "предрейсовый осмотр", "Люфт рулевого колеса",
         "Люфт на грани нормы, взят на контроль.", "плановая", "устранено", "—", 0,
         [(-6, "Механик", "Подтяжка рулевого редуктора"), (-5, "Механик", "Повторная проверка — люфт в норме, заявка закрыта")]),
    ]
    for num, plate, op, cl, src, rep, ctx, title, det, pr, st, parts, dt, log in defects:
        conn.execute("INSERT INTO defects(id,num,plate,opened,closed,source,reporter,ctx,title,detail,priority,status,parts,downtime,log,seed) "
                     "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)",
                     (f"D-{num}", num, plate, add_days(today, op), add_days(today, cl) if cl is not None else None, src, rep, ctx, title, det,
                      pr, st, parts, dt, jdump([{"t": add_days(today, a), "who": w, "text": tx} for a, w, tx in log])))
    upsert(conn, "counters", "k", {"k": "defect", "v": 1051})
    upsert(conn, "counters", "k", {"k": "waybill", "v": 419})
    _seed_shifts(conn, today)
    _gen_window(conn, today, now_min, -30, 7, rng)
    tenants = [
        ("tn1", "ВЕРСТА Минск", "Минск", "активен", 12, "2026-03-14", [["Минск", "Брест", 22], ["Минск", "Гомель", 20], ["Минск", "Гродно", 21], ["Минск", "Витебск", 19], ["Минск", "Могилёв", 16]], [d[1:] for d in DRIVERS[:4]], [["AI 1234-7", "Mercedes Sprinter", 16], ["AI 5821-7", "Mercedes Sprinter", 16], ["AI 0092-7", "Ford Transit", 18], ["AI 7743-7", "Mercedes Sprinter", 16]]),
        ("tn2", "Гродно-Экспресс", "Гродно", "активен", 15, "2026-05-02", [["Гродно", "Лида", 18], ["Гродно", "Слоним", 14], ["Гродно", "Ивье", 12]], [["Виктор Янковский", "+375296001122"], ["Дмитрий Реут", "+375296003344"]], [["AK 3311-4", "Mercedes Vito", 14], ["AK 9087-4", "Ford Transit", 16]]),
        ("tn3", "Полесье Тревел", "Брест", "активен", 10, "2026-06-18", [["Брест", "Пинск", 16], ["Брест", "Кобрин", 8], ["Пинск", "Столин", 11], ["Брест", "Иваново", 10]], [["Николай Ковальчук", "+375297001100"], ["Андрей Пилипчук", "+375297002200"], ["Сергей Бондарук", "+375297003300"]], [["AE 2201-1", "Mercedes Sprinter", 16], ["AE 4456-1", "Peugeot Boxer", 16], ["AE 8890-1", "Mercedes Vito", 14]]),
        ("tn4", "Витебск Авто", "Витебск", "приостановлен", 14, "2026-01-20", [["Витебск", "Полоцк", 13], ["Витебск", "Орша", 10]], [["Олег Мельник", "+375298001100"], ["Виталий Гром", "+375298002200"]], [["AB 1120-2", "Ford Transit", 18], ["AB 5567-2", "Mercedes Sprinter", 16]]),
        ("tn5", "Могилёв Линии", "Могилёв", "подключается", 12, "2026-07-19", [], [], []),
    ]
    for tid, name, c, st, com, joined, rts, drs, vhs in tenants:
        conn.execute("INSERT INTO tenants(id,name,city,status,commission,joined,routes,drivers,vehicles,seed) VALUES(?,?,?,?,?,?,?,?,?,1)",
                     (tid, name, c, st, com, joined,
                      jdump([{"id": f"r{i}", "from": a, "to": b, "price": p} for i, (a, b, p) in enumerate(rts)]),
                      jdump([{"id": f"d{i}", "name": n, "phone": ph} for i, (n, ph) in enumerate(drs)]),
                      jdump([{"id": f"v{i}", "plate": pl, "model": m, "seats": s} for i, (pl, m, s) in enumerate(vhs)])))


def _seed_shifts(conn, today: str) -> None:
    plan = [("AI 1234-7", "dr1", "06:20 · M1 Минск → Брест", 2, {"status": "допущен", "time": "05:38", "odo": 341987, "waybill": "ПЛ-000418", "note": ""}),
            ("AI 7743-7", "dr4", "06:20 · M4 Минск → Могилёв", 3, {"status": "допущен", "time": "05:44", "odo": 288300, "waybill": "ПЛ-000419", "note": "Долит омыватель"}),
            ("AI 5821-7", "dr2", "08:45 · M5 Минск → Гомель", 2, None),
            ("AI 6604-7", "dr3", "08:45 · M6 Минск → Гродно", 2, {"status": "не допущен", "time": "07:05", "odo": 96120, "waybill": None,
                                                                  "note": "Стук в передней подвеске справа. На линию не выпускать до устранения.", "defectId": "D-1048"}),
            ("AI 3310-7", None, "14:15 · M3 Минск → Витебск", 1, None)]
    for plate, drv, first, n, insp in plan:
        conn.execute("INSERT OR REPLACE INTO shifts(date,plate,driver_id,first,trips,insp) VALUES(?,?,?,?,?,?)",
                     (today, plate, drv, first, n, jdump(insp) if insp else None))


def refresh(conn, now: datetime) -> None:
    today = now.date().isoformat()
    rng = random.Random(today)
    conn.execute("UPDATE bookings SET status='посажен' WHERE seed=1 AND status='ожидание' AND trip_id IN (SELECT id FROM trips WHERE date<?)", (today,))
    conn.execute("UPDATE trips SET driver_status='завершён' WHERE date<? AND cancelled=0", (today,))
    _gen_window(conn, today, now.hour * 60 + now.minute, -30, 7, rng)
    if not scalar(conn, "SELECT 1 FROM shifts WHERE date=?", (today,)):
        _seed_shifts(conn, today)
    old = add_days(today, -60)
    conn.execute("DELETE FROM bookings WHERE seed=1 AND trip_id IN (SELECT id FROM trips WHERE date<?)", (old,))
    conn.execute("DELETE FROM trips WHERE seed=1 AND date<?", (old,))
    conn.execute("DELETE FROM shifts WHERE date<?", (old,))


bot = Bot("versta", SCHEMA, seed, refresh)


# ============ ПРЕДСТАВЛЕНИЯ ============

def _driver(conn, did):
    return one(conn, "SELECT * FROM drivers WHERE id=?", (did,)) if did else None


def _trip_out(conn, t: dict, route: dict | None = None, with_bookings=False) -> dict:
    route = route or _route(conn, t["route_id"])
    filled = _filled(conn, t["id"])
    d = _driver(conn, t["driver_id"])
    v = one(conn, "SELECT plate, model, seats FROM vehicles WHERE plate=?", (t["vehicle"],)) if t["vehicle"] else None
    dur = route["points"][-1]["offset"]
    out = {"id": t["id"], "routeId": route["id"], "code": route["code"], "from": route["from"], "to": route["to"], "date": t["date"],
           "time": t["time"], "arrival": min_to_hm((hm_to_min(t["time"]) + dur) % 1440), "duration": dur, "seatsTotal": t["seats_total"],
           "filled": filled, "free": max(0, t["seats_total"] - filled), "fullPrice": route["fullPrice"], "points": route["points"],
           "cancelled": bool(t["cancelled"]), "driverStatus": t["driver_status"], "alert": jload(t["alert"], None),
           "driver": {"id": d["id"], "name": d["name"], "phone": d["phone"]} if d else None,
           "vehicle": v}
    if with_bookings:
        bs = rows(conn, "SELECT * FROM bookings WHERE trip_id=? AND status<>'cancelled' ORDER BY pickup_idx, created_at", (t["id"],))
        out["bookings"] = [_booking_short(b, route) for b in bs]
    return out


def _booking_short(b: dict, route: dict) -> dict:
    return {"id": b["id"], "code": b["code"], "name": b["name"], "phone": b["phone"], "seats": b["seats"], "pickupIdx": b["pickup_idx"],
            "dropoffIdx": b["dropoff_idx"], "pickup": route["points"][b["pickup_idx"]]["name"], "dropoff": route["points"][b["dropoff_idx"]]["name"],
            "price": b["price"], "status": b["status"]}


def _booking_full(conn, b: dict) -> dict:
    t = one(conn, "SELECT * FROM trips WHERE id=?", (b["trip_id"],))
    trip = _trip_out(conn, t)
    route = {"points": trip["points"]}
    pick = route["points"][b["pickup_idx"]]
    drop = route["points"][b["dropoff_idx"]]
    dep = hm_to_min(t["time"])
    out = _booking_short(b, route)
    out.update({"tripId": t["id"], "code": b["code"], "route": trip["code"], "from": trip["from"], "to": trip["to"], "date": t["date"],
                "time": t["time"], "pickupTime": min_to_hm((dep + pick["offset"]) % 1440), "dropoffTime": min_to_hm((dep + drop["offset"]) % 1440),
                "cancelled": b["status"] == "cancelled" or trip["cancelled"], "tripCancelled": trip["cancelled"],
                "driverStatus": trip["driverStatus"], "driver": trip["driver"], "vehicle": trip["vehicle"], "createdAt": b["created_at"]})
    return out


# ============ КЛИЕНТ ============

@bot.action("getDirections")
def get_directions(c: Ctx, p: dict):
    conns: dict[str, list] = {}
    for r in rows(c.conn, "SELECT DISTINCT from_city, to_city FROM routes"):
        conns.setdefault(r["from_city"], []).append(r["to_city"])
    popular = [[r["from_city"], r["to_city"]] for r in rows(c.conn, "SELECT from_city, to_city FROM routes WHERE id LIKE '%f' ORDER BY code")]
    return {"cities": sorted(conns), "connections": conns, "popular": popular, "maxSeats": MAX_BOOK_SEATS}


@bot.action("getTrips")
def get_trips(c: Ctx, p: dict):
    frm = v_str(p, "from", max_len=40)
    to = v_str(p, "to", max_len=40)
    day = v_date(p, "date")
    r = one(c.conn, "SELECT id FROM routes WHERE from_city=? AND to_city=?", (frm, to))
    if not r:
        return {"route": None, "trips": []}
    route = _route(c.conn, r["id"])
    now_min = c.now.hour * 60 + c.now.minute
    out = []
    for t in rows(c.conn, "SELECT * FROM trips WHERE route_id=? AND date=? AND cancelled=0 ORDER BY time", (r["id"], day)):
        tr = _trip_out(c.conn, t, route)
        tr["departed"] = day < c.today or (day == c.today and hm_to_min(t["time"]) <= now_min)
        tr.pop("points")
        out.append(tr)
    return {"route": route, "trips": out}


@bot.action("createBooking", write=True)
def create_booking(c: Ctx, p: dict):
    user = c.need_user()
    t = one(c.conn, "SELECT * FROM trips WHERE id=?", (v_id(p, "tripId"),))
    if not t or t["cancelled"]:
        raise ApiError("not_found")
    route = _route(c.conn, t["route_id"])
    last = len(route["points"]) - 1
    a = v_int(p, "pickupIdx", lo=0, hi=last - 1)
    b = v_int(p, "dropoffIdx", lo=1, hi=last)
    if b <= a:
        raise ApiError("bad_request", "Высадка должна быть после посадки")
    seats = v_int(p, "seats", lo=1, hi=MAX_BOOK_SEATS)
    name = v_str(p, "name", max_len=60, min_len=2)
    phone = v_phone(p, "phone")
    dep = hm_to_min(t["time"]) + route["points"][a]["offset"]
    if t["date"] < c.today or (t["date"] == c.today and dep <= c.now.hour * 60 + c.now.minute):
        raise ApiError("departed", "Маршрутка уже ушла")
    if scalar(c.conn, "SELECT COUNT(*) FROM bookings b JOIN trips t ON t.id=b.trip_id WHERE b.user_id=? AND b.status='ожидание' AND t.date>=?", (user, c.today)) >= PER_USER_ACTIVE:
        raise ApiError("too_many")
    if _filled(c.conn, t["id"]) + seats > t["seats_total"]:
        raise ApiError("no_seats", "Свободных мест меньше, чем нужно")
    cap_rows(c.conn, "bookings", LIMITS["bookings"])
    bid = new_id("B")
    c.conn.execute("INSERT INTO bookings(id,code,trip_id,user_id,name,phone,seats,pickup_idx,dropoff_idx,price,status,created_at) "
                   "VALUES(?,?,?,?,?,?,?,?,?,?, 'ожидание', ?)",
                   (bid, _ticket_code(), t["id"], user, name, phone, seats, a, b, _seg_price(route, a, b) * seats, iso_now()))
    return {"booking": _booking_full(c.conn, one(c.conn, "SELECT * FROM bookings WHERE id=?", (bid,)))}


@bot.action("getMyBookings")
def get_my_bookings(c: Ctx, p: dict):
    user = c.need_user()
    rs = rows(c.conn, "SELECT b.* FROM bookings b JOIN trips t ON t.id=b.trip_id WHERE b.user_id=? ORDER BY t.date DESC, t.time DESC LIMIT 30", (user,))
    return {"bookings": [_booking_full(c.conn, b) for b in rs]}


@bot.action("cancelBooking", write=True)
def cancel_booking(c: Ctx, p: dict):
    user = c.need_user()
    b = one(c.conn, "SELECT * FROM bookings WHERE id=? AND user_id=?", (v_id(p, "id"), user))
    if not b:
        raise ApiError("not_found")
    if b["status"] != "ожидание":
        raise ApiError("bad_state")
    c.conn.execute("UPDATE bookings SET status='cancelled' WHERE id=?", (b["id"],))
    return {}


# ============ ДИСПЕТЧЕР ============

@bot.action("getRefs")
def get_refs(c: Ctx, p: dict):
    routes = [_route(c.conn, r["id"]) for r in rows(c.conn, "SELECT id FROM routes ORDER BY code, id DESC")]
    for r in routes:
        r.pop("points")
    drivers = [{"id": d["id"], "name": d["name"], "phone": d["phone"]} for d in rows(c.conn, "SELECT * FROM drivers WHERE active=1 ORDER BY name")]
    vehicles = [{"plate": v["plate"], "model": v["model"], "seats": v["seats"], "status": v["status"]} for v in rows(c.conn, "SELECT * FROM vehicles ORDER BY plate")]
    return {"routes": routes, "drivers": drivers, "vehicles": vehicles}


@bot.action("getDay")
def get_day(c: Ctx, p: dict):
    day = v_date(p, "date", required=False, default=c.today)
    routes = {}
    out = []
    for t in rows(c.conn, "SELECT * FROM trips WHERE date=? ORDER BY time, route_id", (day,)):
        if t["route_id"] not in routes:
            routes[t["route_id"]] = _route(c.conn, t["route_id"])
        tr = _trip_out(c.conn, t, routes[t["route_id"]])
        tr.pop("points")
        tr["passengers"] = scalar(c.conn, "SELECT COUNT(*) FROM bookings WHERE trip_id=? AND status<>'cancelled'", (t["id"],))
        out.append(tr)
    act = [t for t in out if not t["cancelled"]]
    stats = {"trips": len(act), "seats": sum(t["filled"] for t in act), "capacity": sum(t["seatsTotal"] for t in act),
             "noDriver": sum(1 for t in act if not t["driver"]), "alerts": sum(1 for t in act if t["alert"])}
    return {"date": day, "trips": out, "stats": stats}


@bot.action("getTrip")
def get_trip(c: Ctx, p: dict):
    t = one(c.conn, "SELECT * FROM trips WHERE id=?", (v_id(p, "id"),))
    if not t:
        raise ApiError("not_found")
    return {"trip": _trip_out(c.conn, t, with_bookings=True)}


@bot.action("updateTrip", write=True)
def update_trip(c: Ctx, p: dict):
    t = one(c.conn, "SELECT * FROM trips WHERE id=?", (v_id(p, "id"),))
    if not t:
        raise ApiError("not_found")
    if "driverId" in p:
        did = v_id(p, "driverId", required=False)
        if did and not _driver(c.conn, did):
            raise ApiError("not_found")
        c.conn.execute("UPDATE trips SET driver_id=? WHERE id=?", (did, t["id"]))
    if "vehicle" in p:
        plate = v_str(p, "vehicle", max_len=12, required=False) or None
        if plate and not one(c.conn, "SELECT 1 FROM vehicles WHERE plate=?", (plate,)):
            raise ApiError("not_found")
        c.conn.execute("UPDATE trips SET vehicle=? WHERE id=?", (plate, t["id"]))
    if "cancelled" in p:
        c.conn.execute("UPDATE trips SET cancelled=? WHERE id=?", (int(v_bool(p, "cancelled")), t["id"]))
    if v_bool(p, "dismissAlert"):
        c.conn.execute("UPDATE trips SET alert=NULL WHERE id=?", (t["id"],))
    return {"trip": _trip_out(c.conn, one(c.conn, "SELECT * FROM trips WHERE id=?", (t["id"],)), with_bookings=True)}


@bot.action("setBookingStatus", write=True)
def set_booking_status(c: Ctx, p: dict):
    st = v_enum(p, "status", B_STATUSES)
    cur = c.conn.execute("UPDATE bookings SET status=? WHERE id=? AND status<>'cancelled'", (st, v_id(p, "id")))
    if cur.rowcount == 0:
        raise ApiError("not_found")
    return {}


def _tpl_out(conn, t):
    r = _route(conn, t["route_id"])
    return {"id": t["id"], "routeId": t["route_id"], "code": r["code"], "from": r["from"], "to": r["to"], "time": t["time"],
            "seatsTotal": t["seats_total"], "days": jload(t["days"], []), "active": bool(t["active"])}


@bot.action("getTemplates")
def get_templates(c: Ctx, p: dict):
    return {"templates": [_tpl_out(c.conn, t) for t in rows(c.conn, "SELECT * FROM templates ORDER BY route_id, time")]}


@bot.action("saveTemplate", write=True)
def save_template(c: Ctx, p: dict):
    rid = v_id(p, "routeId")
    _route(c.conn, rid)
    t = v_time(p, "time")
    seats = v_int(p, "seatsTotal", lo=4, hi=30)
    days = sorted({v_int({"d": d}, "d", lo=0, hi=6) for d in v_list(p, "days", max_items=7)})
    if not days:
        raise ApiError("bad_request", "Выберите дни")
    active = v_bool(p, "active", default=True)
    tid = v_id(p, "id", required=False)
    if tid and one(c.conn, "SELECT 1 FROM templates WHERE id=?", (tid,)):
        c.conn.execute("UPDATE templates SET route_id=?, time=?, seats_total=?, days=?, active=? WHERE id=?", (rid, t, seats, jdump(days), int(active), tid))
    else:
        if scalar(c.conn, "SELECT COUNT(*) FROM templates") >= LIMITS["templates"]:
            raise ApiError("limit")
        tid = new_id("tp")
        c.conn.execute("INSERT INTO templates(id,route_id,time,seats_total,days,active) VALUES(?,?,?,?,?,?)", (tid, rid, t, seats, jdump(days), int(active)))
    created = 0
    if active:
        for off in range(0, 8):
            day = add_days(c.today, off)
            if datetime.fromisoformat(day).weekday() not in days:
                continue
            if day == c.today and hm_to_min(t) <= c.now.hour * 60 + c.now.minute:
                continue
            exists = scalar(c.conn, "SELECT 1 FROM trips WHERE route_id=? AND date=? AND time=?", (rid, day, t))
            if not exists:
                c.conn.execute("INSERT INTO trips(id,route_id,date,time,seats_total,template_id) VALUES(?,?,?,?,?,?)",
                               (f"T-{day.replace('-', '')}-{rid}-{t.replace(':', '')}", rid, day, t, seats, tid))
                created += 1
    return {"template": _tpl_out(c.conn, one(c.conn, "SELECT * FROM templates WHERE id=?", (tid,))), "tripsCreated": created}


@bot.action("deleteTemplate", write=True)
def delete_template(c: Ctx, p: dict):
    tid = v_id(p, "id")
    # будущие рейсы шаблона без пассажиров удаляем, с пассажирами — оставляем
    for t in rows(c.conn, "SELECT id FROM trips WHERE template_id=? AND date>?", (tid, c.today)):
        if not scalar(c.conn, "SELECT 1 FROM bookings WHERE trip_id=? AND status<>'cancelled'", (t["id"],)):
            c.conn.execute("DELETE FROM trips WHERE id=?", (t["id"],))
    c.conn.execute("DELETE FROM templates WHERE id=?", (tid,))
    return {}


@bot.action("getBookings")
def get_bookings(c: Ctx, p: dict):
    day = v_date(p, "date", required=False, default=None)
    q = "SELECT b.* FROM bookings b JOIN trips t ON t.id=b.trip_id WHERE " + ("t.date=?" if day else "t.date BETWEEN ? AND ?")
    args = (day,) if day else (add_days(c.today, -1), add_days(c.today, 3))
    rs = rows(c.conn, q + " ORDER BY t.date, t.time LIMIT 400", args)
    return {"bookings": [_booking_full(c.conn, b) for b in rs]}


# ============ ВОДИТЕЛЬ ============

@bot.action("getDrivers")
def get_drivers(c: Ctx, p: dict):
    out = []
    for d in rows(c.conn, "SELECT * FROM drivers WHERE active=1 ORDER BY name"):
        n = scalar(c.conn, "SELECT COUNT(*) FROM trips WHERE driver_id=? AND date=? AND cancelled=0", (d["id"], c.today))
        out.append({"id": d["id"], "name": d["name"], "phone": d["phone"], "tripsToday": n})
    return {"drivers": out}


@bot.action("getDriverTrips")
def get_driver_trips(c: Ctx, p: dict):
    did = v_id(p, "driverId")
    if not _driver(c.conn, did):
        raise ApiError("not_found")
    out = []
    for t in rows(c.conn, "SELECT * FROM trips WHERE driver_id=? AND date BETWEEN ? AND ? ORDER BY date, time", (did, c.today, add_days(c.today, 1))):
        out.append(_trip_out(c.conn, t, with_bookings=True))
    return {"trips": out}


@bot.action("setDriverStatus", write=True)
def set_driver_status(c: Ctx, p: dict):
    st = v_enum(p, "status", ["ожидание", "в пути", "завершён"])
    t = one(c.conn, "SELECT * FROM trips WHERE id=?", (v_id(p, "id"),))
    if not t:
        raise ApiError("not_found")
    c.conn.execute("UPDATE trips SET driver_status=? WHERE id=?", (st, t["id"]))
    if st == "завершён":
        c.conn.execute("UPDATE bookings SET status='не пришёл' WHERE trip_id=? AND status='ожидание'", (t["id"],))
        if t["vehicle"]:
            r = _route(c.conn, t["route_id"])
            km = round(r["points"][-1]["offset"] * 1.15)  # ~70 км/ч
            c.conn.execute("UPDATE vehicles SET odo=odo+? WHERE plate=?", (km, t["vehicle"]))
    return {}


@bot.action("driverAlert", write=True)
def driver_alert(c: Ctx, p: dict):
    t = one(c.conn, "SELECT * FROM trips WHERE id=?", (v_id(p, "tripId"),))
    if not t:
        raise ApiError("not_found")
    kind = v_enum(p, "type", ["опаздываю", "поломка"], required=False, default=None)
    if kind is None:
        c.conn.execute("UPDATE trips SET alert=NULL WHERE id=?", (t["id"],))
        return {"alert": None}
    alert = {"type": kind, "time": f"{c.now.hour:02d}:{c.now.minute:02d}"}
    defect_id = None
    if kind == "поломка" and t["vehicle"]:
        # поломка с рейса сразу становится заявкой у механика
        r = _route(c.conn, t["route_id"])
        d = _driver(c.conn, t["driver_id"])
        defect_id = _create_defect(c, t["vehicle"], v_str(p, "note", max_len=200, required=False) or "Водитель сообщил о поломке на рейсе",
                                   "", "критично", "водитель", d["name"] if d else "Водитель", f"рейс {r['code']} {t['time']} {r['from']} → {r['to']}")
        alert["defectId"] = defect_id
    c.conn.execute("UPDATE trips SET alert=? WHERE id=?", (jdump(alert), t["id"]))
    return {"alert": alert}


# ============ МЕХАНИК ============

def _days_until(c: Ctx, d: str) -> int:
    return (datetime.fromisoformat(d) - datetime.fromisoformat(c.today)).days


def _reg_state(c: Ctx, it: dict, odo: int) -> dict:
    if it["every_km"]:
        due = it["last_km"] + it["every_km"]
        remain = due - odo
        return {"overdue": remain < 0, "soon": 0 <= remain < 1500, "remainKm": remain, "dueKm": due,
                "estDays": round(remain / DAILY_KM)}
    due_date = add_days(it["last_date"], it["every_days"])
    rd = _days_until(c, due_date)
    return {"overdue": rd < 0, "soon": 0 <= rd < 14, "remainDays": rd, "dueDate": due_date, "estDays": rd}


def _vehicle_out(c: Ctx, v: dict) -> dict:
    docs = jload(v["docs"], {})
    reg = [_reg_state(c, it, v["odo"]) | {"id": it["id"], "kind": it["kind"], "everyKm": it["every_km"], "everyDays": it["every_days"]}
           for it in rows(c.conn, "SELECT * FROM reg_items WHERE plate=?", (v["plate"],))]
    return {"plate": v["plate"], "model": v["model"], "year": v["year"], "seats": v["seats"], "odo": v["odo"], "status": v["status"],
            "repairNote": v["repair_note"], "docs": [{"name": k, "until": d, "days": _days_until(c, d)} for k, d in docs.items()],
            "lastService": jload(v["last_service"], {}), "reg": reg,
            "openDefects": scalar(c.conn, "SELECT COUNT(*) FROM defects WHERE plate=? AND status NOT IN ('устранено','отклонено')", (v["plate"],))}


@bot.action("getFleet")
def get_fleet(c: Ctx, p: dict):
    return {"fleet": [_vehicle_out(c, v) for v in rows(c.conn, "SELECT * FROM vehicles ORDER BY plate")], "dailyKm": DAILY_KM}


@bot.action("updateVehicle", write=True)
def update_vehicle(c: Ctx, p: dict):
    v = one(c.conn, "SELECT * FROM vehicles WHERE plate=?", (v_str(p, "plate", max_len=12),))
    if not v:
        raise ApiError("not_found")
    st = v_enum(p, "status", ["в строю", "в ремонте", "ожидает з/ч"], required=False, default=v["status"])
    note = v_str(p, "repairNote", max_len=200, required=False, default=v["repair_note"]) if "repairNote" in p else v["repair_note"]
    odo = v_int(p, "odo", lo=v["odo"], hi=3_000_000, required=False, default=v["odo"])
    docs = jload(v["docs"], {})
    if "doc" in p:
        d = v_obj(p, "doc")
        name = v_enum(d, "name", DOCS)
        docs[name] = v_date(d, "until")
    c.conn.execute("UPDATE vehicles SET status=?, repair_note=?, odo=?, docs=? WHERE plate=?", (st, "" if st == "в строю" else note, odo, jdump(docs), v["plate"]))
    return {"vehicle": _vehicle_out(c, one(c.conn, "SELECT * FROM vehicles WHERE plate=?", (v["plate"],)))}


@bot.action("getRelease")
def get_release(c: Ctx, p: dict):
    out = []
    for s in rows(c.conn, "SELECT * FROM shifts WHERE date=? ORDER BY first", (c.today,)):
        d = _driver(c.conn, s["driver_id"])
        v = one(c.conn, "SELECT * FROM vehicles WHERE plate=?", (s["plate"],))
        out.append({"plate": s["plate"], "driver": d["name"] if d else None, "first": s["first"], "trips": s["trips"],
                    "model": v["model"] if v else "", "seats": v["seats"] if v else 0, "odo": v["odo"] if v else 0,
                    "insp": jload(s["insp"], None)})
    idle = [p_["plate"] for p_ in rows(c.conn, "SELECT plate FROM vehicles WHERE plate NOT IN (SELECT plate FROM shifts WHERE date=?)", (c.today,))]
    alerts = scalar(c.conn, "SELECT COUNT(*) FROM defects WHERE source='водитель' AND opened=?", (c.today,))
    return {"shifts": out, "idle": idle, "checklist": CHECKLIST, "driverAlerts": alerts}


@bot.action("inspect", write=True)
def inspect(c: Ctx, p: dict):
    plate = v_str(p, "plate", max_len=12)
    s = one(c.conn, "SELECT * FROM shifts WHERE date=? AND plate=?", (c.today, plate))
    v = one(c.conn, "SELECT * FROM vehicles WHERE plate=?", (plate,))
    if not s or not v:
        raise ApiError("not_found")
    passed = v_bool(p, "passed")
    odo = v_int(p, "odo", lo=v["odo"], hi=v["odo"] + 5000)
    note = v_str(p, "note", max_len=300, required=False)
    failed = [x for x in v_list(p, "failed", max_items=len(CHECKLIST), required=False) if x in CHECKLIST]
    insp = {"status": "допущен" if passed else "не допущен", "time": f"{c.now.hour:02d}:{c.now.minute:02d}", "odo": odo, "note": note,
            "waybill": None, "failed": failed}
    if passed:
        insp["waybill"] = f"ПЛ-{_counter(c.conn, 'waybill', 419):06d}"
    else:
        d = _driver(c.conn, s["driver_id"])
        insp["defectId"] = _create_defect(c, plate, note or (failed[0] if failed else "Не допущен к выпуску"), ", ".join(failed),
                                          "критично", "выпуск на линию", "Механик", f"предрейсовый осмотр, водитель {d['name'] if d else '—'}")
    c.conn.execute("UPDATE shifts SET insp=? WHERE date=? AND plate=?", (jdump(insp), c.today, plate))
    c.conn.execute("UPDATE vehicles SET odo=? WHERE plate=?", (odo, plate))
    return {"insp": insp}


def _defect_out(r):
    return {"id": r["id"], "plate": r["plate"], "opened": r["opened"], "closed": r["closed"], "source": r["source"], "reporter": r["reporter"],
            "ctx": r["ctx"], "title": r["title"], "detail": r["detail"], "priority": r["priority"], "status": r["status"],
            "parts": r["parts"], "downtime": r["downtime"], "log": jload(r["log"], [])}


def _create_defect(c: Ctx, plate, title, detail, priority, source, reporter, ctx) -> str:
    cap_rows(c.conn, "defects", LIMITS["defects"])
    num = _counter(c.conn, "defect", 1051)
    did = f"D-{num}"
    c.conn.execute("INSERT INTO defects(id,num,plate,opened,source,reporter,ctx,title,detail,priority,status) VALUES(?,?,?,?,?,?,?,?,?,?,'новая')",
                   (did, num, plate, c.today, source, reporter, ctx, title, detail, priority))
    return did


@bot.action("getDefects")
def get_defects(c: Ctx, p: dict):
    rs = rows(c.conn, "SELECT * FROM defects ORDER BY status IN ('устранено','отклонено'), priority='плановая', opened DESC LIMIT 100")
    return {"defects": [_defect_out(r) for r in rs]}


@bot.action("createDefect", write=True)
def create_defect(c: Ctx, p: dict):
    plate = v_str(p, "plate", max_len=12)
    if not one(c.conn, "SELECT 1 FROM vehicles WHERE plate=?", (plate,)):
        raise ApiError("not_found")
    did = _create_defect(c, plate, v_str(p, "title", max_len=120, min_len=4), v_str(p, "detail", max_len=600, required=False, multiline=True),
                         v_enum(p, "priority", ["критично", "плановая"]), "плановый осмотр", "Механик", v_str(p, "ctx", max_len=120, required=False))
    return {"defect": _defect_out(one(c.conn, "SELECT * FROM defects WHERE id=?", (did,)))}


@bot.action("updateDefect", write=True)
def update_defect(c: Ctx, p: dict):
    d = one(c.conn, "SELECT * FROM defects WHERE id=?", (v_id(p, "id"),))
    if not d:
        raise ApiError("not_found")
    st = v_enum(p, "status", ["новая", "в работе", "ожидает з/ч", "устранено", "отклонено"], required=False, default=d["status"])
    parts = v_str(p, "parts", max_len=200, required=False, default=d["parts"]) if "parts" in p else d["parts"]
    note = v_str(p, "note", max_len=300, required=False)
    log = jload(d["log"], [])
    if note:
        log.append({"t": c.today, "who": "Механик", "text": note})
    if st != d["status"]:
        log.append({"t": c.today, "who": "Механик", "text": f"Статус: {st}"})
    closed = c.today if st in ("устранено", "отклонено") and not d["closed"] else d["closed"]
    c.conn.execute("UPDATE defects SET status=?, parts=?, log=?, closed=? WHERE id=?", (st, parts, jdump(log[-30:]), closed, d["id"]))
    if st == "устранено":
        left = scalar(c.conn, "SELECT COUNT(*) FROM defects WHERE plate=? AND priority='критично' AND status NOT IN ('устранено','отклонено')", (d["plate"],))
        if not left:
            c.conn.execute("UPDATE vehicles SET status='в строю', repair_note='' WHERE plate=?", (d["plate"],))
    elif st in ("в работе", "ожидает з/ч") and d["priority"] == "критично":
        c.conn.execute("UPDATE vehicles SET status=?, repair_note=? WHERE plate=?",
                       ("в ремонте" if st == "в работе" else "ожидает з/ч", f"{d['title']} — заявка {d['id']}", d["plate"]))
    return {"defect": _defect_out(one(c.conn, "SELECT * FROM defects WHERE id=?", (d["id"],)))}


@bot.action("regDone", write=True)
def reg_done(c: Ctx, p: dict):
    it = one(c.conn, "SELECT * FROM reg_items WHERE id=?", (v_id(p, "id"),))
    if not it:
        raise ApiError("not_found")
    v = one(c.conn, "SELECT * FROM vehicles WHERE plate=?", (it["plate"],))
    km = v_int(p, "km", lo=0, hi=3_000_000, required=False, default=v["odo"])
    if it["every_km"]:
        c.conn.execute("UPDATE reg_items SET last_km=? WHERE id=?", (km, it["id"]))
    else:
        c.conn.execute("UPDATE reg_items SET last_date=? WHERE id=?", (c.today, it["id"]))
    text = v_str(p, "note", max_len=200, required=False) or it["kind"]
    c.conn.execute("UPDATE vehicles SET last_service=? WHERE plate=?", (jdump({"km": km, "date": c.today, "text": text}), it["plate"]))
    return {}


# ============ ВЛАДЕЛЕЦ ============

@bot.action("getOwnerStats")
def get_owner_stats(c: Ctx, p: dict):
    days = v_int(p, "days", lo=1, hi=31, required=False, default=7)
    frm = add_days(c.today, -(days - 1))
    trips = rows(c.conn, "SELECT * FROM trips WHERE date BETWEEN ? AND ? AND cancelled=0", (frm, c.today))
    by_trip = {r["trip_id"]: r for r in rows(c.conn, "SELECT trip_id, SUM(CASE WHEN status='посажен' THEN price ELSE 0 END) rev, "
                                                       "SUM(seats) seats, SUM(CASE WHEN status='посажен' THEN seats ELSE 0 END) boarded, "
                                                       "SUM(CASE WHEN status='не пришёл' THEN 1 ELSE 0 END) noshow, COUNT(*) n "
                                                       "FROM bookings b JOIN trips t ON t.id=b.trip_id WHERE t.date BETWEEN ? AND ? AND b.status<>'cancelled' GROUP BY trip_id", (frm, c.today))}
    routes = {r["id"]: _route(c.conn, r["id"]) for r in rows(c.conn, "SELECT id FROM routes")}
    drivers = {d["id"]: d["name"] for d in rows(c.conn, "SELECT * FROM drivers")}
    daily, r_agg, d_agg = {}, {}, {}
    cap = filled = 0
    for t in trips:
        b = by_trip.get(t["id"], {"rev": 0, "seats": 0, "boarded": 0, "noshow": 0, "n": 0})
        daily[t["date"]] = daily.get(t["date"], 0) + (b["rev"] or 0)
        cap += t["seats_total"]
        filled += b["seats"] or 0
        ra = r_agg.setdefault(t["route_id"], {"revenue": 0, "filled": 0, "cap": 0, "trips": 0})
        ra["revenue"] += b["rev"] or 0; ra["filled"] += b["seats"] or 0; ra["cap"] += t["seats_total"]; ra["trips"] += 1
        if t["driver_id"]:
            da = d_agg.setdefault(t["driver_id"], {"trips": 0, "passengers": 0, "noShows": 0, "filled": 0, "cap": 0, "revenue": 0})
            da["trips"] += 1; da["passengers"] += b["boarded"] or 0; da["noShows"] += b["noshow"] or 0
            da["filled"] += b["seats"] or 0; da["cap"] += t["seats_total"]; da["revenue"] += b["rev"] or 0
    chart = []
    for i in range(days):
        day = add_days(frm, i)
        chart.append({"date": day, "dow": ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"][datetime.fromisoformat(day).weekday()], "revenue": round(daily.get(day, 0))})
    today_bookings = scalar(c.conn, "SELECT COUNT(*) FROM bookings b JOIN trips t ON t.id=b.trip_id WHERE t.date=? AND b.status<>'cancelled'", (c.today,))
    route_list = sorted(({"code": routes[k]["code"], "from": routes[k]["from"], "to": routes[k]["to"], "revenue": round(v["revenue"]),
                          "occ": round(v["filled"] / v["cap"] * 100) if v["cap"] else 0, "trips": v["trips"]} for k, v in r_agg.items()),
                        key=lambda x: -x["revenue"])
    driver_list = sorted(({"id": k, "name": drivers.get(k, "—"), "trips": v["trips"], "passengers": v["passengers"], "noShows": v["noShows"],
                           "occ": round(v["filled"] / v["cap"] * 100) if v["cap"] else 0, "revenue": round(v["revenue"])} for k, v in d_agg.items()),
                         key=lambda x: -x["passengers"])
    total = sum(x["revenue"] for x in chart)
    return {"days": days, "chart": chart, "totalRevenue": total, "todayRevenue": chart[-1]["revenue"], "todayBookings": today_bookings,
            "avgOccupancy": round(filled / cap * 100) if cap else 0, "routes": route_list, "drivers": driver_list}


# ============ ПЛАТФОРМА ============

def _tenant_out(conn, t: dict, today: str) -> dict:
    out = {"id": t["id"], "name": t["name"], "city": t["city"], "status": t["status"], "commission": t["commission"], "joined": t["joined"],
           "routes": jload(t["routes"], []), "drivers": jload(t["drivers"], []), "vehicles": jload(t["vehicles"], [])}
    if t["id"] == "tn1":  # ВЕРСТА Минск — реальные цифры из своей базы
        frm = add_days(today, -29)
        rev = scalar(conn, "SELECT COALESCE(SUM(price),0) FROM bookings b JOIN trips t ON t.id=b.trip_id WHERE b.status='посажен' AND t.date BETWEEN ? AND ?", (frm, today))
        trips = scalar(conn, "SELECT COUNT(*) FROM trips WHERE date BETWEEN ? AND ? AND cancelled=0", (frm, today))
    else:
        h = sum(ord(ch) for ch in t["name"])
        rev = 0 if t["status"] == "подключается" else (2400 + h * 37 % 9000) * (0.2 if t["status"] == "приостановлен" else 1)
        trips = 0 if t["status"] == "подключается" else round((40 + h % 120) * (0.2 if t["status"] == "приостановлен" else 1))
    out["stats"] = {"revenue": round(rev), "trips": trips, "commission": round(rev * t["commission"] / 100)}
    return out


@bot.action("getTenants")
def get_tenants(c: Ctx, p: dict):
    return {"tenants": [_tenant_out(c.conn, t, c.today) for t in rows(c.conn, "SELECT * FROM tenants ORDER BY joined")]}


def _clean_list(items, fields):
    out = []
    for i, it in enumerate(items[:40]):
        if not isinstance(it, dict):
            raise ApiError("bad_request")
        row = {"id": v_str(it, "id", max_len=20, required=False) or f"x{i}"}
        for k, kind in fields.items():
            if kind == "str":
                row[k] = v_str(it, k, max_len=60, min_len=1)
            elif kind == "phone":
                row[k] = v_phone(it, k)
            else:
                row[k] = v_int(it, k, lo=1, hi=500)
        out.append(row)
    return out


@bot.action("saveTenant", write=True)
def save_tenant(c: Ctx, p: dict):
    t = v_obj(p, "tenant")
    data = {"name": v_str(t, "name", max_len=60, min_len=2), "city": v_str(t, "city", max_len=40, min_len=2),
            "status": v_enum(t, "status", ["активен", "приостановлен", "подключается"], required=False, default="подключается"),
            "commission": v_int(t, "commission", lo=0, hi=50),
            "routes": jdump(_clean_list(v_list(t, "routes", max_items=40, required=False), {"from": "str", "to": "str", "price": "int"})),
            "drivers": jdump(_clean_list(v_list(t, "drivers", max_items=40, required=False), {"name": "str", "phone": "phone"})),
            "vehicles": jdump(_clean_list(v_list(t, "vehicles", max_items=40, required=False), {"plate": "str", "model": "str", "seats": "int"}))}
    tid = v_id(t, "id", required=False)
    if tid and one(c.conn, "SELECT 1 FROM tenants WHERE id=?", (tid,)):
        c.conn.execute("UPDATE tenants SET name=?, city=?, status=?, commission=?, routes=?, drivers=?, vehicles=? WHERE id=?", (*data.values(), tid))
    else:
        if scalar(c.conn, "SELECT COUNT(*) FROM tenants") >= LIMITS["tenants"]:
            raise ApiError("limit")
        tid = new_id("tn")
        c.conn.execute("INSERT INTO tenants(id,name,city,status,commission,routes,drivers,vehicles,joined) VALUES(?,?,?,?,?,?,?,?,?)",
                       (tid, *data.values(), c.today))
    return {"tenant": _tenant_out(c.conn, one(c.conn, "SELECT * FROM tenants WHERE id=?", (tid,)), c.today)}
