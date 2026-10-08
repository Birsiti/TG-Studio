# изменено 2026-10-08 03:10
"""Кафе «МОСТ» (белорусско-китайский фьюжн) — контракт спроектирован по
мок-функциям most-cafe-bot / most-cafe-admin.

Меню двуязычное (ru/cn), у блюд есть модификаторы с доплатой. Заказ —
самовывоз ко времени или доставка (зона по расстоянию от кафе по
геопозиции, при ручном адресе — фиксированный тариф). Цены, скидка по
промокоду, доставка и итог считаются на сервере.
Статусы: new → preparing → ready → done; cancelled.
"""
from __future__ import annotations

import math
import random
from datetime import datetime, timedelta

from core import (ApiError, Bot, Ctx, add_days, cap_rows, jdump, jload, one, rows, scalar, upsert, v_bool,
                  v_enum, v_int, v_list, v_num, v_obj, v_phone, v_str, v_time)

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS categories(id TEXT PRIMARY KEY, ru TEXT NOT NULL, cn TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS items(
  id INTEGER PRIMARY KEY, cat TEXT NOT NULL, icon TEXT NOT NULL, price REAL NOT NULL, hit INTEGER NOT NULL DEFAULT 0,
  in_stock INTEGER NOT NULL DEFAULT 1, name_ru TEXT NOT NULL, name_cn TEXT NOT NULL DEFAULT '', desc_ru TEXT NOT NULL DEFAULT '',
  desc_cn TEXT NOT NULL DEFAULT '', modifiers TEXT NOT NULL DEFAULT '[]', sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS orders(
  id TEXT PRIMARY KEY, num INTEGER NOT NULL, user_id TEXT, created_at TEXT NOT NULL, date TEXT NOT NULL, type TEXT NOT NULL,
  ready_at TEXT NOT NULL, lines TEXT NOT NULL, subtotal REAL NOT NULL, discount REAL NOT NULL DEFAULT 0, promo TEXT NOT NULL DEFAULT '',
  delivery_fee REAL NOT NULL DEFAULT 0, total REAL NOT NULL, address TEXT NOT NULL DEFAULT '', distance_km REAL,
  phone TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'new',
  lang TEXT NOT NULL DEFAULT 'ru', seed INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS mo_date ON orders(date);
CREATE INDEX IF NOT EXISTS mo_user ON orders(user_id);
"""

DEFAULTS = {
    "businessName": "Мост", "phone": "+375291234567", "address": "просп. Независимости, 58, 1 этаж",
    "coords": {"lat": 53.9228, "lng": 27.5995}, "workHours": {"from": "08:00", "to": "20:00"}, "pickupEtaMin": 12,
    "deliveryZones": [{"maxKm": 1.5, "fee": 3.0, "eta": 15}, {"maxKm": 4, "fee": 5.5, "eta": 25}, {"maxKm": 8, "fee": 8.0, "eta": 35}],
    "manualDeliveryFee": 6.0, "manualDeliveryEta": 40, "accepting": True,
}
PROMO = {"MOST10": 10, "BRIDGE15": 15}
STATUS_FLOW = ["new", "preparing", "ready", "done"]
ICONS = ["dumpling", "onigiri", "pancake", "espresso", "cup", "latte", "soup", "noodles", "salad", "sandwich", "croissant",
         "cake", "cookie", "water", "tea", "lemonade", "rice", "bun"]
LIMITS = {"orders": 12000, "items": 80}
PER_USER_OPEN = 4


def _mod(mid, ru, cn, opts):
    return {"id": mid, "label": {"ru": ru, "cn": cn}, "options": [{"id": o[0], "label": {"ru": o[1], "cn": o[2]}, "price": o[3]} for o in opts]}


MILK = _mod("milk", "Молоко", "奶", [("regular", "Обычное", "普通", 0), ("oat", "Овсяное", "燕麦", 0.6), ("soy", "Соевое", "豆奶", 0.6)])
SEED_CATS = [("fusion", "Фьюжн", "融合"), ("coffee", "Кофе", "咖啡"), ("lunch", "Обед", "午餐"), ("bakery", "Выпечка", "烘焙"), ("drinks", "Напитки", "饮品")]
SEED_ITEMS = [
    (16, "fusion", "bun", 6.5, 1, 1, "Пян-се с курицей", "鸡肉蒸包", "паровая булка, сычуаньский соус", "四川风味酱汁", []),
    (17, "fusion", "onigiri", 7.2, 0, 1, "Онигири с копчёной сельдью", "熏鲱鱼饭团", "рис, нори, белорусский акцент", "米饭配熏鲱鱼", []),
    (18, "fusion", "pancake", 8.9, 1, 1, "Драники, соус чили-мёд", "辣蜜土豆饼", "хрустящие, к обеду или перекусу", "香脆可口",
     [_mod("sauce", "Соус", "酱料", [("chilihoney", "Чили-мёд", "辣蜜酱", 0), ("sourcream", "Сметана", "酸奶油", 0)])]),
    (19, "fusion", "dumpling", 7.5, 0, 0, "Момо, картофель-грибы", "土豆蘑菇饺子", "на пару, соевый соус", "清蒸配酱油", []),
    (20, "fusion", "rice", 9.8, 0, 1, "Рис с говядиной и квашеной капустой", "酸菜牛肉饭", "вок, кунжут, зелёный лук", "炒锅·芝麻·葱", []),
    (1, "coffee", "espresso", 3.8, 0, 1, "Эспрессо", "浓缩咖啡", "двойная порция", "双份", []),
    (2, "coffee", "cup", 4.5, 0, 1, "Американо", "美式咖啡", "классический, без молока", "不加奶", []),
    (3, "coffee", "latte", 6.2, 1, 1, "Капучино", "卡布奇诺", "мягкая молочная пенка", "细腻奶泡", [MILK]),
    (4, "coffee", "latte", 6.5, 0, 1, "Латте", "拿铁", "обычное, овсяное или соевое", "可选普通/燕麦/豆奶", [MILK]),
    (5, "coffee", "latte", 7.8, 0, 1, "Раф на овсяном", "燕麦拿铁", "ванильный сироп", "香草糖浆",
     [_mod("syrup", "Сироп", "糖浆", [("vanilla", "Ваниль", "香草", 0), ("caramel", "Карамель", "焦糖", 0), ("hazelnut", "Лесной орех", "榛子", 0)])]),
    (6, "lunch", "soup", 12.5, 1, 1, "Бизнес-ланч №1", "商务套餐 1号", "борщ · котлета · гречка", "甜菜汤·肉饼·荞麦", []),
    (7, "lunch", "noodles", 12.9, 0, 1, "Бизнес-ланч №2", "商务套餐 2号", "суп-лапша · курица · рис", "鸡肉汤面·米饭", []),
    (8, "lunch", "salad", 9.4, 0, 1, "Салат с курицей", "鸡肉沙拉", "свежие овощи, гриль", "新鲜蔬菜·烤鸡", []),
    (9, "lunch", "sandwich", 7.9, 0, 1, "Тёплый сэндвич", "热三明治", "ветчина, сыр, томат", "火腿·奶酪·番茄", []),
    (10, "bakery", "croissant", 4.9, 0, 1, "Круассан", "牛角包", "классический сливочный", "黄油经典款", []),
    (11, "bakery", "cake", 6.9, 0, 0, "Чизкейк", "芝士蛋糕", "нью-йоркский", "纽约风味", []),
    (12, "bakery", "cookie", 3.2, 0, 1, "Овсяное печенье", "燕麦饼干", "с изюмом", "含葡萄干", []),
    (13, "drinks", "water", 2.5, 0, 1, "Вода негазированная", "矿泉水", "0,5 л", "0.5升", []),
    (14, "drinks", "tea", 3.5, 0, 1, "Чай чёрный / улун", "红茶/乌龙茶", "листовой", "茶叶冲泡", []),
    (15, "drinks", "lemonade", 5.9, 0, 1, "Домашний лимонад", "自制柠檬水", "мята, имбирь", "薄荷·姜",
     [_mod("sweet", "Сладость", "甜度", [("normal", "Обычная", "正常", 0), ("less", "Меньше сахара", "少糖", 0)])]),
]
NAMES = ["Аня", "Ли Вэй", "Дмитрий", "Чжан Мин", "Ольга", "Ксения", "Ван Лэй", "Павел", "Юля", "Артём", "Сюй Цин", "Марина"]
STREETS = ["ул. Сурганова, 24", "просп. Независимости, 95", "ул. Кульман, 9", "ул. Платонова, 1Б", "ул. Козлова, 12", "ул. Волгоградская, 6"]


def _settings(conn) -> dict:
    out = dict(DEFAULTS)
    for r in rows(conn, "SELECT * FROM settings"):
        out[r["k"]] = jload(r["v"], out.get(r["k"]))
    return out


def _item_out(r: dict) -> dict:
    return {"id": r["id"], "cat": r["cat"], "icon": r["icon"], "price": r["price"], "hit": bool(r["hit"]), "inStock": bool(r["in_stock"]),
            "name": {"ru": r["name_ru"], "cn": r["name_cn"]}, "desc": {"ru": r["desc_ru"], "cn": r["desc_cn"]}, "modifiers": jload(r["modifiers"], [])}


def _haversine(a: dict, b: dict) -> float:
    r = 6371
    dlat, dlng = math.radians(b["lat"] - a["lat"]), math.radians(b["lng"] - a["lng"])
    h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a["lat"])) * math.cos(math.radians(b["lat"])) * math.sin(dlng / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h))


def _num(conn) -> int:
    return (scalar(conn, "SELECT MAX(num) FROM orders") or 100) + 1


def _order_out(r: dict) -> dict:
    return {"id": r["id"], "num": r["num"], "createdAt": r["created_at"], "type": r["type"], "readyAt": r["ready_at"],
            "time": r["created_at"][11:16], "lines": jload(r["lines"], []), "subtotal": r["subtotal"], "discount": r["discount"],
            "promo": r["promo"], "deliveryFee": r["delivery_fee"], "total": r["total"], "address": r["address"],
            "distanceKm": r["distance_km"], "phone": r["phone"], "name": r["name"], "note": r["note"], "status": r["status"]}


def _price_lines(conn, lines_in: list, lang: str = "ru") -> tuple[list, float]:
    """Проверка корзины и расчёт цен: только позиции из меню, в наличии,
    модификаторы — из списка блюда. Возвращает строки заказа и сумму."""
    out, subtotal = [], 0.0
    for ln in lines_in:
        if not isinstance(ln, dict):
            raise ApiError("bad_request")
        iid = v_int(ln, "itemId", lo=1, hi=100000)
        qty = v_int(ln, "qty", lo=1, hi=20)
        it = one(conn, "SELECT * FROM items WHERE id=?", (iid,))
        if not it:
            raise ApiError("bad_item", "Позиции нет в меню")
        if not it["in_stock"]:
            raise ApiError("out_of_stock", it["name_ru"])
        mods_in = ln.get("mods") or {}
        if not isinstance(mods_in, dict):
            raise ApiError("bad_request")
        unit = it["price"]
        labels = []
        for grp in jload(it["modifiers"], []):
            chosen = mods_in.get(grp["id"]) or grp["options"][0]["id"]
            opt = next((o for o in grp["options"] if o["id"] == chosen), None)
            if not opt:
                raise ApiError("bad_request", "Неизвестный модификатор")
            unit += opt["price"]
            if opt is not grp["options"][0] or opt["price"]:
                labels.append(opt["label"]["ru"])
        unit = round(unit, 2)
        out.append({"itemId": iid, "qty": qty, "mods": {k: v for k, v in mods_in.items() if isinstance(v, str)}, "unit": unit,
                    "n": it["name_ru"] + (f" ({', '.join(labels)})" if labels else ""), "cn": it["name_cn"], "icon": it["icon"]})
        subtotal += unit * qty
    return out, round(subtotal, 2)


# ============ ДЕМО ============

def _seed_orders(conn, rng, today: str, now_dt: datetime, frm: int, to: int) -> None:
    items = rows(conn, "SELECT * FROM items")
    weights = {3: 8, 6: 6, 16: 5, 4: 5, 18: 4, 10: 4, 7: 3, 2: 3, 1: 2, 15: 2, 8: 2, 9: 2, 14: 2, 12: 2, 17: 2, 20: 2, 5: 2, 13: 1}
    pool = [i for i in items if i["in_stock"] for _ in range(weights.get(i["id"], 1))]
    cfg = DEFAULTS
    for off in range(frm, to + 1):
        day = add_days(today, off)
        wd = datetime.fromisoformat(day).weekday()
        n = rng.randint(26, 40) if wd < 5 else rng.randint(34, 52)
        for _ in range(n):
            # пики: утро кофе, обед, вечер
            hour = rng.choices([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], weights=[6, 8, 5, 4, 10, 12, 7, 4, 4, 5, 5, 3])[0]
            minute = rng.randint(0, 59)
            created = datetime.fromisoformat(f"{day}T{hour:02d}:{minute:02d}:00").replace(tzinfo=now_dt.tzinfo)
            if off == 0 and created > now_dt:
                continue
            k = rng.choice([1, 1, 2, 2, 2, 3, 3, 4])
            lines = []
            for it in rng.sample(pool, k):
                lines.append({"itemId": it["id"], "qty": 1 if rng.random() < 0.8 else 2, "mods": {}})
            # дубликаты позиций схлопываем
            merged = {}
            for ln in lines:
                merged.setdefault(ln["itemId"], {"itemId": ln["itemId"], "qty": 0, "mods": {}})["qty"] += ln["qty"]
            priced, subtotal = _price_lines(conn, list(merged.values()))
            typ = "delivery" if rng.random() < 0.4 else "pickup"
            fee = eta = 0
            dist = None
            if typ == "delivery":
                z = rng.choice(cfg["deliveryZones"])
                fee, eta, dist = z["fee"], z["eta"], round(rng.uniform(0.5, z["maxKm"]), 1)
            else:
                eta = cfg["pickupEtaMin"]
            promo = "MOST10" if rng.random() < 0.08 else ""
            disc = round(subtotal * PROMO.get(promo, 0) / 100, 2)
            ready = created + timedelta(minutes=eta)
            age = (now_dt - created).total_seconds() / 60
            if off < 0 or age > eta + 25:
                status = "cancelled" if rng.random() < 0.02 else "done"
            elif age > eta:
                status = "ready"
            elif age > 4:
                status = "preparing"
            else:
                status = "new"
            num = _num(conn)
            conn.execute(
                "INSERT INTO orders(id,num,user_id,created_at,date,type,ready_at,lines,subtotal,discount,promo,delivery_fee,total,address,distance_km,"
                "phone,name,note,status,seed) VALUES(?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)",
                (f"M-{num}", num, created.isoformat(), day, typ, ready.isoformat(), jdump(priced), subtotal, disc, promo, fee,
                 round(subtotal - disc + fee, 2), rng.choice(STREETS) if typ == "delivery" else "", dist,
                 "+37529" + str(rng.randint(1000000, 9999999)) if typ == "delivery" else "", rng.choice(NAMES), "", status))


def seed(conn, now_dt: datetime) -> None:
    rng = random.Random(9)
    for i, (cid, ru, cn) in enumerate(SEED_CATS):
        conn.execute("INSERT INTO categories(id,ru,cn,sort) VALUES(?,?,?,?)", (cid, ru, cn, i))
    for i, (iid, cat, icon, price, hit, stock, nru, ncn, dru, dcn, mods) in enumerate(SEED_ITEMS):
        conn.execute("INSERT INTO items(id,cat,icon,price,hit,in_stock,name_ru,name_cn,desc_ru,desc_cn,modifiers,sort) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                     (iid, cat, icon, price, hit, stock, nru, ncn, dru, dcn, jdump(mods), i))
    _seed_orders(conn, rng, now_dt.date().isoformat(), now_dt, -35, 0)


def refresh(conn, now_dt: datetime) -> None:
    today = now_dt.date().isoformat()
    conn.execute("UPDATE orders SET status='done' WHERE date<? AND status IN ('new','preparing','ready')", (today,))
    last = scalar(conn, "SELECT MAX(date) FROM orders WHERE seed=1") or today
    for off in range(-35, 1):
        day = add_days(today, off)
        if day > last:
            _seed_orders(conn, random.Random(day), today, now_dt, off, off)
    conn.execute("DELETE FROM orders WHERE seed=1 AND date<?", (add_days(today, -120),))


bot = Bot("most", SCHEMA, seed, refresh)


def _is_open(c: Ctx, cfg: dict) -> bool:
    m = c.now.hour * 60 + c.now.minute
    f = int(cfg["workHours"]["from"][:2]) * 60 + int(cfg["workHours"]["from"][3:])
    t = int(cfg["workHours"]["to"][:2]) * 60 + int(cfg["workHours"]["to"][3:])
    return f <= m < t


# ============ КЛИЕНТ ============

@bot.action("getMenu")
def get_menu(c: Ctx, p: dict):
    cfg = _settings(c.conn)
    cats = [{"id": r["id"], "ru": r["ru"], "cn": r["cn"]} for r in rows(c.conn, "SELECT * FROM categories ORDER BY sort")]
    items = [_item_out(r) for r in rows(c.conn, "SELECT * FROM items ORDER BY sort, id")]
    busy = scalar(c.conn, "SELECT COUNT(*) FROM orders WHERE date=? AND status IN ('new','preparing')", (c.today,))
    return {"categories": cats, "items": items, "config": {**cfg, "openNow": _is_open(c, cfg), "queue": busy,
                                                            "pickupEtaNow": cfg["pickupEtaMin"] + min(15, busy * 2)}}


@bot.action("checkPromo")
def check_promo(c: Ctx, p: dict):
    code = v_str(p, "code", max_len=20).upper()
    if code not in PROMO:
        raise ApiError("bad_promo")
    return {"code": code, "percent": PROMO[code]}


def _delivery(c: Ctx, p: dict, cfg: dict) -> dict:
    geo = p.get("geo")
    if isinstance(geo, dict) and geo:
        lat = v_num(geo, "lat", lo=-90, hi=90)
        lng = v_num(geo, "lng", lo=-180, hi=180)
        km = round(_haversine(cfg["coords"], {"lat": lat, "lng": lng}), 1)
        zone = next((z for z in cfg["deliveryZones"] if km <= z["maxKm"]), None)
        if not zone:
            raise ApiError("out_of_zone", "Слишком далеко для доставки")
        return {"fee": zone["fee"], "eta": zone["eta"], "km": km, "address": v_str(p, "address", max_len=160, required=False) or "по геопозиции"}
    address = v_str(p, "address", max_len=160, min_len=5)
    return {"fee": cfg["manualDeliveryFee"], "eta": cfg["manualDeliveryEta"], "km": None, "address": address}


@bot.action("quote")
def quote(c: Ctx, p: dict):
    cfg = _settings(c.conn)
    lines, subtotal = _price_lines(c.conn, v_list(p, "lines", max_items=30))
    code = v_str(p, "promo", max_len=20, required=False).upper()
    pct = PROMO.get(code, 0)
    disc = round(subtotal * pct / 100, 2)
    typ = v_enum(p, "type", ["pickup", "delivery"], required=False, default="pickup")
    d = {"fee": 0, "eta": cfg["pickupEtaMin"], "km": None}
    if typ == "delivery" and (p.get("geo") or p.get("address")):
        d = _delivery(c, p, cfg)
    return {"subtotal": subtotal, "discount": disc, "deliveryFee": d["fee"], "total": round(subtotal - disc + d["fee"], 2), "eta": d["eta"], "distanceKm": d["km"]}


@bot.action("createOrder", write=True)
def create_order(c: Ctx, p: dict):
    user = c.need_user()
    cfg = _settings(c.conn)
    if not cfg.get("accepting", True):
        raise ApiError("paused", "Кафе временно не принимает заказы")
    lines, subtotal = _price_lines(c.conn, v_list(p, "lines", max_items=30))
    if not lines:
        raise ApiError("empty_cart")
    typ = v_enum(p, "type", ["pickup", "delivery"])
    note = v_str(p, "note", max_len=200, required=False)
    name = v_str(p, "name", max_len=40, required=False)
    code = v_str(p, "promo", max_len=20, required=False).upper()
    if code and code not in PROMO:
        raise ApiError("bad_promo")
    disc = round(subtotal * PROMO.get(code, 0) / 100, 2)
    if typ == "delivery":
        d = _delivery(c, p, cfg)
        phone = v_phone(p, "phone")
        eta = d["eta"]
    else:
        d = {"fee": 0, "km": None, "address": ""}
        phone = v_phone(p, "phone", required=False)
        pick = v_enum(p, "pickupTime", ["now", "15", "30"], required=False, default="now")
        busy = scalar(c.conn, "SELECT COUNT(*) FROM orders WHERE date=? AND status IN ('new','preparing')", (c.today,))
        eta = max(cfg["pickupEtaMin"] + min(15, busy * 2), 0 if pick == "now" else int(pick))
    if scalar(c.conn, "SELECT COUNT(*) FROM orders WHERE user_id=? AND status IN ('new','preparing','ready')", (user,)) >= PER_USER_OPEN:
        raise ApiError("too_many")
    cap_rows(c.conn, "orders", LIMITS["orders"])
    num = _num(c.conn)
    created = c.now.replace(microsecond=0)
    oid = f"M-{num}"
    c.conn.execute(
        "INSERT INTO orders(id,num,user_id,created_at,date,type,ready_at,lines,subtotal,discount,promo,delivery_fee,total,address,distance_km,phone,name,note,status,lang) "
        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'new',?)",
        (oid, num, user, created.isoformat(), c.today, typ, (created + timedelta(minutes=eta)).isoformat(), jdump(lines), subtotal, disc, code,
         d["fee"], round(subtotal - disc + d["fee"], 2), d["address"], d["km"], phone, name, note, v_enum(p, "lang", ["ru", "cn"], required=False, default="ru")))
    return {"order": _order_out(one(c.conn, "SELECT * FROM orders WHERE id=?", (oid,))), "orderId": oid}


@bot.action("getMyOrders")
def get_my_orders(c: Ctx, p: dict):
    user = c.need_user()
    return {"orders": [_order_out(r) for r in rows(c.conn, "SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 20", (user,))]}


@bot.action("getOrder")
def get_order(c: Ctx, p: dict):
    user = c.need_user()
    r = one(c.conn, "SELECT * FROM orders WHERE id=? AND user_id=?", (v_str(p, "id", max_len=20), user))
    if not r:
        raise ApiError("not_found")
    return {"order": _order_out(r)}


# ============ АДМИН ============

@bot.action("getOrders")
def get_orders(c: Ctx, p: dict):
    rs = rows(c.conn, "SELECT * FROM orders WHERE date=? OR status IN ('new','preparing','ready') ORDER BY created_at DESC LIMIT 150", (c.today,))
    return {"orders": [_order_out(r) for r in rs], "accepting": _settings(c.conn).get("accepting", True)}


@bot.action("advanceOrder", write=True)
def advance_order(c: Ctx, p: dict):
    r = one(c.conn, "SELECT * FROM orders WHERE id=?", (v_str(p, "id", max_len=20),))
    if not r:
        raise ApiError("not_found")
    if r["status"] not in STATUS_FLOW[:-1]:
        raise ApiError("bad_state")
    nxt = STATUS_FLOW[STATUS_FLOW.index(r["status"]) + 1]
    c.conn.execute("UPDATE orders SET status=? WHERE id=?", (nxt, r["id"]))
    return {"status": nxt}


@bot.action("cancelOrder", write=True)
def cancel_order(c: Ctx, p: dict):
    cur = c.conn.execute("UPDATE orders SET status='cancelled' WHERE id=? AND status IN ('new','preparing','ready')", (v_str(p, "id", max_len=20),))
    if cur.rowcount == 0:
        raise ApiError("bad_state")
    return {}


@bot.action("simulateOrder", write=True)
def simulate_order(c: Ctx, p: dict):
    """Демо: «пришёл заказ» от случайного гостя — чтобы показать живую ленту."""
    rng = random.Random()
    items = rows(c.conn, "SELECT id FROM items WHERE in_stock=1")
    lines = [{"itemId": i["id"], "qty": rng.choice([1, 1, 2]), "mods": {}} for i in rng.sample(items, rng.randint(1, 3))]
    priced, subtotal = _price_lines(c.conn, lines)
    cfg = _settings(c.conn)
    typ = rng.choice(["pickup", "pickup", "delivery"])
    z = rng.choice(cfg["deliveryZones"])
    fee = z["fee"] if typ == "delivery" else 0
    cap_rows(c.conn, "orders", LIMITS["orders"])
    num = _num(c.conn)
    created = c.now.replace(microsecond=0)
    c.conn.execute("INSERT INTO orders(id,num,created_at,date,type,ready_at,lines,subtotal,delivery_fee,total,address,distance_km,phone,name,status) "
                   "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'new')",
                   (f"M-{num}", num, created.isoformat(), c.today, typ, (created + timedelta(minutes=z["eta"] if typ == "delivery" else cfg["pickupEtaMin"])).isoformat(),
                    jdump(priced), subtotal, fee, round(subtotal + fee, 2), rng.choice(STREETS) if typ == "delivery" else "",
                    round(rng.uniform(0.6, z["maxKm"]), 1) if typ == "delivery" else None,
                    "+37529" + str(rng.randint(1000000, 9999999)) if typ == "delivery" else "", rng.choice(NAMES)))
    return {"order": _order_out(one(c.conn, "SELECT * FROM orders WHERE id=?", (f"M-{num}",)))}


@bot.action("getMenuAdmin")
def get_menu_admin(c: Ctx, p: dict):
    cats = [{"id": r["id"], "ru": r["ru"], "cn": r["cn"]} for r in rows(c.conn, "SELECT * FROM categories ORDER BY sort")]
    return {"categories": cats, "items": [_item_out(r) for r in rows(c.conn, "SELECT * FROM items ORDER BY sort, id")], "icons": ICONS}


@bot.action("saveDish", write=True)
def save_dish(c: Ctx, p: dict):
    d = v_obj(p, "dish")
    name = v_obj(d, "name")
    desc = v_obj(d, "desc", required=False)
    cat = v_str(d, "cat", max_len=20)
    if not one(c.conn, "SELECT 1 FROM categories WHERE id=?", (cat,)):
        raise ApiError("bad_request", "Нет такой категории")
    data = {"cat": cat, "icon": v_enum(d, "icon", ICONS), "price": v_num(d, "price", lo=0.1, hi=500),
            "name_ru": v_str(name, "ru", max_len=60, min_len=2), "name_cn": v_str(name, "cn", max_len=40, required=False),
            "desc_ru": v_str(desc, "ru", max_len=120, required=False), "desc_cn": v_str(desc, "cn", max_len=80, required=False),
            "hit": int(v_bool(d, "hit")), "in_stock": int(v_bool(d, "inStock", default=True))}
    iid = d.get("id")
    if iid is not None and one(c.conn, "SELECT 1 FROM items WHERE id=?", (v_int(d, "id", lo=1, hi=100000),)):
        iid = int(iid)
        c.conn.execute("UPDATE items SET cat=?, icon=?, price=?, name_ru=?, name_cn=?, desc_ru=?, desc_cn=?, hit=?, in_stock=? WHERE id=?", (*data.values(), iid))
    else:
        if scalar(c.conn, "SELECT COUNT(*) FROM items") >= LIMITS["items"]:
            raise ApiError("limit")
        iid = (scalar(c.conn, "SELECT MAX(id) FROM items") or 0) + 1
        c.conn.execute("INSERT INTO items(id,cat,icon,price,name_ru,name_cn,desc_ru,desc_cn,hit,in_stock,sort) VALUES(?,?,?,?,?,?,?,?,?,?,99)", (iid, *data.values()))
    return {"dish": _item_out(one(c.conn, "SELECT * FROM items WHERE id=?", (iid,)))}


@bot.action("deleteDish", write=True)
def delete_dish(c: Ctx, p: dict):
    c.conn.execute("DELETE FROM items WHERE id=?", (v_int(p, "id", lo=1, hi=100000),))
    return {}


@bot.action("toggleStock", write=True)
def toggle_stock(c: Ctx, p: dict):
    cur = c.conn.execute("UPDATE items SET in_stock=1-in_stock WHERE id=?", (v_int(p, "id", lo=1, hi=100000),))
    if cur.rowcount == 0:
        raise ApiError("not_found")
    return {}


@bot.action("toggleHit", write=True)
def toggle_hit(c: Ctx, p: dict):
    cur = c.conn.execute("UPDATE items SET hit=1-hit WHERE id=?", (v_int(p, "id", lo=1, hi=100000),))
    if cur.rowcount == 0:
        raise ApiError("not_found")
    return {}


@bot.action("getStats")
def get_stats(c: Ctx, p: dict):
    period = v_enum(p, "period", ["today", "week", "month"], required=False, default="today")
    frm = {"today": c.today, "week": add_days(c.today, -6), "month": add_days(c.today, -29)}[period]
    rs = rows(c.conn, "SELECT * FROM orders WHERE date BETWEEN ? AND ? AND status<>'cancelled'", (frm, c.today))
    rev = sum(r["total"] for r in rs)
    pick = sum(1 for r in rs if r["type"] == "pickup")
    top: dict[int, dict] = {}
    hours = [0] * 24
    for r in rs:
        hours[int(r["created_at"][11:13])] += 1
        for ln in jload(r["lines"], []):
            t = top.setdefault(ln["itemId"], {"id": ln["itemId"], "name": {"ru": ln["n"].split(" (")[0], "cn": ln.get("cn", "")}, "count": 0, "revenue": 0})
            t["count"] += ln["qty"]; t["revenue"] += ln["unit"] * ln["qty"]
    days = (datetime.fromisoformat(c.today) - datetime.fromisoformat(frm)).days + 1
    chart = []
    for i in range(days):
        day = add_days(frm, i)
        chart.append({"date": day, "label": ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"][datetime.fromisoformat(day).weekday()] if days <= 7 else str(int(day[8:])),
                      "revenue": round(sum(r["total"] for r in rs if r["date"] == day))})
    n = len(rs)
    return {"stats": {"revenue": round(rev, 2), "count": n, "avg": round(rev / n, 2) if n else 0,
                      "pickupPct": round(pick / n * 100) if n else 0, "deliveryPct": 100 - round(pick / n * 100) if n else 0,
                      "promoCount": sum(1 for r in rs if r["promo"]),
                      "top": sorted(top.values(), key=lambda x: -x["count"])[:6], "chart": chart,
                      "hours": [{"hour": h, "count": hours[h]} for h in range(8, 21)]}}


@bot.action("getSettings")
def get_settings(c: Ctx, p: dict):
    return {"config": _settings(c.conn), "promos": [{"code": k, "percent": v} for k, v in PROMO.items()]}


@bot.action("saveSettings", write=True)
def save_settings(c: Ctx, p: dict):
    cfg = _settings(c.conn)
    if "phone" in p:
        upsert(c.conn, "settings", "k", {"k": "phone", "v": jdump(v_phone(p, "phone"))})
    if "address" in p:
        upsert(c.conn, "settings", "k", {"k": "address", "v": jdump(v_str(p, "address", max_len=100, min_len=5))})
    if "workHours" in p:
        wh = v_obj(p, "workHours")
        f, t = v_time(wh, "from"), v_time(wh, "to")
        if t <= f:
            raise ApiError("bad_request", "Закрытие раньше открытия")
        upsert(c.conn, "settings", "k", {"k": "workHours", "v": jdump({"from": f, "to": t})})
    if "pickupEtaMin" in p:
        upsert(c.conn, "settings", "k", {"k": "pickupEtaMin", "v": jdump(v_int(p, "pickupEtaMin", lo=5, hi=90))})
    if "deliveryZones" in p:
        zones_in = v_list(p, "deliveryZones", max_items=5)
        zones = []
        for i, z in enumerate(zones_in):
            if not isinstance(z, dict):
                raise ApiError("bad_request")
            base = cfg["deliveryZones"][i] if i < len(cfg["deliveryZones"]) else {"maxKm": 10}
            zones.append({"maxKm": v_num(z, "maxKm", lo=0.5, hi=30, required=False, default=base["maxKm"]),
                          "fee": v_num(z, "fee", hi=100), "eta": v_int(z, "eta", lo=5, hi=180)})
        zones.sort(key=lambda z: z["maxKm"])
        upsert(c.conn, "settings", "k", {"k": "deliveryZones", "v": jdump(zones)})
    return {"config": _settings(c.conn)}


@bot.action("setAccepting", write=True)
def set_accepting(c: Ctx, p: dict):
    upsert(c.conn, "settings", "k", {"k": "accepting", "v": jdump(v_bool(p, "accepting", default=True))})
    return {"accepting": _settings(c.conn)["accepting"]}
