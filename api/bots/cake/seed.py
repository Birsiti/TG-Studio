# изменено 2026-10-17 01:30
"""Демо-данные при первом запуске: 20 дней приходов, рейсов, ящиков и смен."""
from __future__ import annotations

import random
from datetime import datetime

from core import Ctx, add_days, iso_now, jdump
from bots.cake.base import _add_move, _add_tara
from bots.cake.catalog import SEED_CITIES, SEED_PRODUCTS, SEED_STAFF, SEED_TARA


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
            drv = rnd.choice(drivers)
            crates = sum(ln["qty"] for ln in lines) // 2 + 1
            _add_tara(ctx, day, "box", drv, "out", crates, city=cid, trip=tid, seed=1)
            back_crates = max(0, crates - rnd.choice([0, 0, 0, 1, 2]))
            if back_crates:
                _add_tara(ctx, day, "box", drv, "back", back_crates, city=cid, trip=tid, seed=1)
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
                         (tid, num, day, cid, drv, jdump(closed), jdump([{"taraId": "box", "qty": crates}]),
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
        tara = [{"taraId": "box", "qty": 16}]
        if status == "shipped":
            for ln in lines:
                add("ship", today, ln["productId"], -ln["qty"], city=cid, trip=tid)
            for ln in tara:
                _add_tara(ctx, today, ln["taraId"], drv, "out", ln["qty"], city=cid, trip=tid, seed=1)
        conn.execute("INSERT INTO trips(id,num,date,city_id,driver_id,status,lines,tara_out,created_at,shipped_at,seed) "
                     "VALUES(?,?,?,?,?,?,?,?,?,?,1)",
                     (tid, num, today, cid, drv, status, jdump(lines), jdump(tara), iso_now(),
                      iso_now() if status == "shipped" else None))
