# изменено 2026-10-08 03:22
"""TG-Studio: заявки из order-bot и аутрич-дашборд.

Заявка сохраняется в studio.db и после ответа клиенту пересылается тем же
JSON, что раньше слал order-bot, на Cloudflare-воркер уведомлений
(TGS_LEADS_WEBHOOK, по умолчанию https://tg-studio-leads.birsiti.workers.dev).
Если воркер недоступен — заявка всё равно в базе, флаг forwarded=0.

Аутрич: старый бэкенд (Apps Script) отключён, поэтому рассылка — на демо-
данных: база компаний по нишам, журнал отправок за месяц; в рабочее время
«отправки» досчитываются по ходу дня, пока кампания не на паузе.
"""
from __future__ import annotations

import hmac
import logging
import os
import random
from datetime import datetime, timedelta

from core import (ApiError, Bot, Ctx, add_days, cap_rows, jdump, jload, new_id, one, rows, scalar, upsert,
                  v_bool, v_enum, v_int, v_phone, v_str)

log = logging.getLogger("tgs.studio")
WEBHOOK = os.environ.get("TGS_LEADS_WEBHOOK", "https://tg-studio-leads.birsiti.workers.dev").strip()
# Ключ владельца: без него API отдаёт только демо-заявки (seed=1), реальные
# заявки с телефонами видны лишь в dashboard.html?key=<TGS_STUDIO_KEY>.
STUDIO_KEY = os.environ.get("TGS_STUDIO_KEY", "").strip()

SCHEMA = """
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY, created_at TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, business TEXT NOT NULL DEFAULT '',
  task TEXT NOT NULL, budget TEXT NOT NULL, tg_id TEXT NOT NULL DEFAULT '', user_id TEXT, ip TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new', note TEXT NOT NULL DEFAULT '', forwarded INTEGER NOT NULL DEFAULT 0, seed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS leads_created ON leads(created_at);
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY, company TEXT NOT NULL, email TEXT NOT NULL, niche TEXT NOT NULL, city TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', sent_at TEXT
);
CREATE INDEX IF NOT EXISTS companies_status ON companies(status);
CREATE TABLE IF NOT EXISTS sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company_id TEXT NOT NULL, ts TEXT NOT NULL, date TEXT NOT NULL, status TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sends_date ON sends(date);
CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);
"""

BUDGETS = ("До 500 BYN", "500–1500 BYN", "1500+ BYN", "Обсудим", "не выбран")
LEAD_STATUSES = ("new", "contacted", "won", "lost")
LIMITS = {"leads": 400}
DEFAULTS = {"paused": False, "dailyLimit": 40}
DAY_FROM, DAY_TO = 9, 18  # окно рассылки, часы

NICHES = {
    "Автомойки": (["Мойка", "Автомойка", "Детейлинг", "Автоспа"], ["Блеск", "Аква", "Капля", "Пена", "Самурай", "Люкс", "Фонтан", "Чистюля", "Мокрый асфальт", "Профи"], 260),
    "Барбершопы": (["Барбершоп", "Барбер", "Мужская парикмахерская"], ["Бритва", "Борода", "Ножницы", "Джентльмен", "Олд Скул", "Топор", "Фигаро", "Усы", "Чуб", "Лезвие"], 300),
    "Кафе и кофейни": (["Кафе", "Кофейня", "Кофе-бар", "Бистро"], ["Мост", "Зерно", "Корица", "Бублик", "Тмин", "Рогалик", "Лагом", "Март", "Эспрессо", "Фабрика"], 380),
    "Прокат инструмента": (["Прокат", "Аренда инструмента", "Инструмент-прокат"], ["Перфоратор", "Мастер", "Стройка", "Домкрат", "Шуруп", "Профинструмент"], 140),
    "Перевозки": (["Перевозки", "Маршрутки", "Трансфер"], ["Верста", "Магистраль", "Путь", "Дорога", "Экспресс", "Вояж"], 120),
    "Салоны красоты": (["Салон", "Студия красоты", "Ногтевая студия"], ["Шарм", "Аура", "Мята", "Лаванда", "Бархат", "Пион", "Муза", "Ирис", "Глянец"], 340),
}
DISTRICTS = ("Уручье", "Немига", "Каменная Горка", "Малиновка", "Серебрянка", "Зелёный Луг", "Сухарево", "Лошица", "Чижовка", "Восток")
CITIES = ("Минск", "Минск", "Минск", "Гомель", "Брест", "Гродно", "Витебск", "Могилёв")
DOMAINS = ("gmail.com", "mail.ru", "yandex.by", "tut.by")
TR = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюя", ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s", "t", "u", "f", "h", "ts", "ch", "sh", "sch", "", "y", "", "e", "yu", "ya"]))
SEED_LEADS = [
    (-19, "Андрей", "+375291234501", "Автомойка, 3 поста", "Онлайн-запись на мойку и напоминания клиентам", "500–1500 BYN", "won"),
    (-15, "Ольга", "+375447778812", "Салон красоты", "Запись к мастерам, чтобы администратор не сидел на телефоне", "500–1500 BYN", "contacted"),
    (-11, "Дмитрий", "+375336541122", "Кофейня у метро", "Предзаказ кофе с самовывозом", "До 500 BYN", "won"),
    (-8, "Сергей", "+375295550033", "Прокат инструмента", "Каталог и бронь инструмента по датам", "1500+ BYN", "contacted"),
    (-5, "Наталья", "+375257001144", "Маршрутные перевозки", "Продажа мест и рассадка в маршрутках", "Обсудим", "lost"),
    (-3, "Игорь", "+375296667788", "Барбершоп", "Запись к барберам и программа лояльности", "500–1500 BYN", "new"),
    (-1, "Виктория", "+375441112299", "Доставка цветов", "Каталог букетов и оплата в Telegram", "не выбран", "new"),
    (0, "Павел", "+375293334455", "Шиномонтаж", "Сезонная запись на шиномонтаж", "До 500 BYN", "new"),
]


def _slug(s: str) -> str:
    out = "".join(TR.get(ch, ch) for ch in s.lower())
    return "".join(ch for ch in out if ch.isascii() and ch.isalnum())


def _settings(conn) -> dict:
    cfg = dict(DEFAULTS)
    for r in rows(conn, "SELECT k, v FROM settings"):
        cfg[r["k"]] = jload(r["v"], cfg.get(r["k"]))
    return cfg


def _outcome(rng: random.Random) -> str:
    x = rng.random()
    return "bounced" if x < 0.04 else "replied" if x < 0.10 else "sent"


def _send_many(conn, rng: random.Random, day: str, stamps: list[datetime]) -> int:
    """Отправить письма следующим компаниям из очереди с заданными метками времени."""
    if not stamps:
        return 0
    queue = rows(conn, "SELECT id FROM companies WHERE status='queued' ORDER BY rowid LIMIT ?", (len(stamps),))
    for comp, ts in zip(queue, stamps):
        st = _outcome(rng)
        iso = ts.replace(microsecond=0).isoformat()
        conn.execute("INSERT INTO sends(company_id, ts, date, status) VALUES(?,?,?,?)", (comp["id"], iso, day, "bounced" if st == "bounced" else "sent"))
        conn.execute("UPDATE companies SET status=?, sent_at=? WHERE id=?", (st, iso, comp["id"]))
    return len(queue)


def _day_stamps(rng: random.Random, day: str, n: int, tz, until: datetime | None = None) -> list[datetime]:
    base = datetime.fromisoformat(day).replace(tzinfo=tz)
    span = (DAY_TO - DAY_FROM) * 3600
    out = sorted(base + timedelta(seconds=DAY_FROM * 3600 + rng.randrange(span)) for _ in range(n))
    return [t for t in out if until is None or t <= until]


def seed(conn, now_dt: datetime) -> None:
    rng = random.Random(11)
    used = set()
    comps = []
    for niche, (kinds, names, count) in NICHES.items():
        for i in range(count):
            kind, nm, city = rng.choice(kinds), rng.choice(names), rng.choice(CITIES)
            base = f"{kind} «{nm}»" + (f" · {city}" if city != "Минск" else "")
            title, k = base, 2
            while title in used:  # одноимённые точки различаем районом/номером филиала
                title = f"{base} · {rng.choice(DISTRICTS)}" if city == "Минск" and k < 6 else f"{base} · филиал {k}"
                k += 1
            used.add(title)
            email = f"{_slug(nm)}{'' if rng.random() < .5 else rng.randrange(1, 99)}.{_slug(city)[:5]}@{rng.choice(DOMAINS)}"
            comps.append((new_id("c"), title, email, niche, city))
    rng.shuffle(comps)
    conn.executemany("INSERT INTO companies(id,company,email,niche,city) VALUES(?,?,?,?,?)", comps)
    today = now_dt.date().isoformat()
    for off in range(-30, 0):
        day = add_days(today, off)
        if datetime.fromisoformat(day).weekday() == 6:
            continue  # по воскресеньям не шлём
        _send_many(conn, rng, day, _day_stamps(rng, day, rng.randint(28, 40), now_dt.tzinfo))
    for off, name, phone, biz, task, budget, st in SEED_LEADS:
        ts = (now_dt.replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(days=off, minutes=rng.randrange(-60, 420)))
        if ts > now_dt:
            ts = now_dt - timedelta(minutes=rng.randrange(5, 50))
        conn.execute("INSERT INTO leads(id,created_at,name,phone,business,task,budget,status,forwarded,seed) VALUES(?,?,?,?,?,?,?,?,1,1)",
                     (new_id("L"), ts.replace(microsecond=0).isoformat(), name, phone, biz, task, budget, st))


def refresh(conn, now_dt: datetime) -> None:
    """Раз в день: если очередь почти пуста — вернуть старые контакты в очередь,
    чтобы демо-рассылка не заканчивалась; чистить журнал старше 120 дней."""
    if scalar(conn, "SELECT COUNT(*) FROM companies WHERE status='queued'") < 100:
        conn.execute("UPDATE companies SET status='queued', sent_at=NULL WHERE id IN (SELECT id FROM companies WHERE status IN ('sent','bounced') ORDER BY sent_at LIMIT 300)")
    conn.execute("DELETE FROM sends WHERE date<?", (add_days(now_dt.date().isoformat(), -120),))


bot = Bot("studio", SCHEMA, seed, refresh)


def _tick(c: Ctx, cfg: dict) -> None:
    """Досчитать сегодняшние отправки пропорционально прошедшему рабочему времени."""
    if cfg["paused"] or c.now.weekday() == 6:
        return
    h = c.now.hour + c.now.minute / 60
    frac = min(1.0, max(0.0, (h - DAY_FROM) / (DAY_TO - DAY_FROM)))
    target = int(cfg["dailyLimit"] * frac * 0.85)
    done = scalar(c.conn, "SELECT COUNT(*) FROM sends WHERE date=?", (c.today,))
    if target > done:
        rng = random.Random(c.now.timestamp())
        last = scalar(c.conn, "SELECT MAX(ts) FROM sends WHERE date=?", (c.today,))
        start = datetime.fromisoformat(last) if last else c.now.replace(hour=DAY_FROM, minute=0, second=0, microsecond=0)
        span = max(60, int((c.now - start).total_seconds()))
        stamps = sorted(start + timedelta(seconds=rng.randrange(1, span)) for _ in range(target - done))
        _send_many(c.conn, rng, c.today, stamps)


# ---------- заявки ----------

def _is_owner(p: dict) -> bool:
    key = str(p.get("key") or "")
    return bool(STUDIO_KEY) and hmac.compare_digest(key.encode(), STUDIO_KEY.encode())


def _scope(p: dict) -> str:
    return "1=1" if _is_owner(p) else "seed=1"


def _lead_out(r: dict) -> dict:
    return {"id": r["id"], "createdAt": r["created_at"], "name": r["name"], "phone": r["phone"], "business": r["business"],
            "task": r["task"], "budget": r["budget"], "tgId": r["tg_id"], "status": r["status"], "note": r["note"], "forwarded": bool(r["forwarded"])}


def forward_lead(lead_id: str, payload: dict) -> None:
    """POST заявки на воркер уведомлений (после ответа клиенту)."""
    if not WEBHOOK:
        return
    import httpx
    try:
        r = httpx.post(WEBHOOK, json=payload, timeout=10, headers={"User-Agent": "TG-Studio-API/1.0"})
        ok = r.status_code < 300 and (r.json() or {}).get("ok") is True
    except Exception as e:  # сеть, не-JSON — заявка остаётся в базе
        log.warning("lead %s: webhook failed: %s", lead_id, e)
        ok = False
    if ok:
        conn = bot.connect()
        try:
            conn.execute("UPDATE leads SET forwarded=1 WHERE id=?", (lead_id,))
        finally:
            conn.close()
    else:
        log.warning("lead %s: webhook did not confirm", lead_id)


@bot.action("createLead", write=True)
def create_lead(c: Ctx, p: dict):
    name = v_str(p, "name", max_len=80, min_len=2)
    phone = v_phone(p, "phone")
    business = v_str(p, "business", max_len=120, required=False)
    task = v_str(p, "task", max_len=1000, min_len=5)
    budget = v_enum(p, "budget", BUDGETS, required=False, default="не выбран")
    tg_id = str(p.get("tg_id") or "")[:20]
    if tg_id and not tg_id.isdigit():
        raise ApiError("bad_request", "tg_id")
    since = (c.now - timedelta(minutes=10)).isoformat()
    if c.ip and scalar(c.conn, "SELECT COUNT(*) FROM leads WHERE ip=? AND created_at>=?", (c.ip, since)) >= 5:
        raise ApiError("rate_limited", "Слишком много заявок — попробуйте позже", 429)
    cap_rows(c.conn, "leads", LIMITS["leads"])
    lid = new_id("L")
    c.conn.execute("INSERT INTO leads(id,created_at,name,phone,business,task,budget,tg_id,user_id,ip) VALUES(?,?,?,?,?,?,?,?,?,?)",
                   (lid, c.now.replace(microsecond=0).isoformat(), name, phone, business, task, budget, tg_id, c.user, c.ip))
    # тот же JSON, что order-bot слал на воркер напрямую
    fwd = {"name": name, "phone": phone, "business": business, "task": task, "budget": budget, "tg_id": tg_id}
    return {"id": lid, "_background": lambda: forward_lead(lid, fwd)}


@bot.action("getLeads")
def get_leads(c: Ctx, p: dict):
    st = v_enum(p, "status", ("all",) + LEAD_STATUSES, required=False, default="all")
    scope = _scope(p)
    rs = rows(c.conn, f"SELECT * FROM leads WHERE {scope}" + ("" if st == "all" else " AND status=?") + " ORDER BY created_at DESC LIMIT 100",
              () if st == "all" else (st,))
    counts = {r["status"]: r["n"] for r in rows(c.conn, f"SELECT status, COUNT(*) n FROM leads WHERE {scope} GROUP BY status")}
    return {"leads": [_lead_out(r) for r in rs], "counts": {s: counts.get(s, 0) for s in LEAD_STATUSES}, "owner": _is_owner(p)}


@bot.action("setLeadStatus", write=True)
def set_lead_status(c: Ctx, p: dict):
    lid = v_str(p, "id", max_len=20)
    fields = {"status": v_enum(p, "status", LEAD_STATUSES)}
    if "note" in p:
        fields["note"] = v_str(p, "note", max_len=300, required=False)
    cur = c.conn.execute("UPDATE leads SET " + ",".join(f"{k}=?" for k in fields) + f" WHERE id=? AND {_scope(p)}", (*fields.values(), lid))
    if cur.rowcount == 0:
        raise ApiError("not_found")
    return {"lead": _lead_out(one(c.conn, "SELECT * FROM leads WHERE id=?", (lid,)))}


# ---------- аутрич ----------

@bot.action("getDashboard", write=True)
def get_dashboard(c: Ctx, p: dict):
    cfg = _settings(c.conn)
    _tick(c, cfg)
    limit = v_int(p, "logLimit", lo=1, hi=50, required=False, default=15)
    by_status = {r["status"]: r["n"] for r in rows(c.conn, "SELECT status, COUNT(*) n FROM companies GROUP BY status")}
    sent_total = scalar(c.conn, "SELECT COUNT(*) FROM sends")
    bounced = scalar(c.conn, "SELECT COUNT(*) FROM sends WHERE status='bounced'")
    replied = by_status.get("replied", 0)
    daily = []
    for off in range(-13, 1):
        d = add_days(c.today, off)
        daily.append({"date": d, "count": scalar(c.conn, "SELECT COUNT(*) FROM sends WHERE date=?", (d,))})
    niches = [{"niche": r["niche"], "total": r["total"], "sent": r["sent"], "replied": r["replied"]} for r in rows(c.conn,
              "SELECT niche, COUNT(*) total, SUM(status<>'queued') sent, SUM(status='replied') replied FROM companies GROUP BY niche ORDER BY total DESC")]
    log_rows = rows(c.conn, "SELECT s.ts, s.status sst, c.company, c.email, c.niche, c.status cst FROM sends s JOIN companies c ON c.id=s.company_id "
                            "ORDER BY s.ts DESC, s.id DESC LIMIT ?", (limit,))
    inbound_new = scalar(c.conn, f"SELECT COUNT(*) FROM leads WHERE status='new' AND {_scope(p)}")
    return {"stats": {
        "sentToday": daily[-1]["count"], "dailyLimit": cfg["dailyLimit"], "paused": cfg["paused"],
        "sentTotal": sent_total, "companiesTotal": sum(by_status.values()), "queued": by_status.get("queued", 0),
        "bounceRatePct": round(bounced / sent_total * 100, 1) if sent_total else 0.0,
        "replied": replied, "replyRatePct": round(replied / sent_total * 100, 1) if sent_total else 0.0,
        "byStatus": by_status, "daily": daily, "byNiche": niches, "inboundNew": inbound_new},
        "log": [{"ts": r["ts"], "company": r["company"], "email": r["email"], "niche": r["niche"],
                 "status": "replied" if r["cst"] == "replied" and r["sst"] == "sent" else r["sst"]} for r in log_rows]}


@bot.action("updateConfig", write=True)
def update_config(c: Ctx, p: dict):
    if "paused" in p:
        upsert(c.conn, "settings", "k", {"k": "paused", "v": jdump(v_bool(p, "paused"))})
    if "dailyLimit" in p:
        upsert(c.conn, "settings", "k", {"k": "dailyLimit", "v": jdump(v_int(p, "dailyLimit", lo=5, hi=200))})
    return {"config": _settings(c.conn)}


@bot.action("getCompanies")
def get_companies(c: Ctx, p: dict):
    niche = v_str(p, "niche", max_len=40, required=False)
    st = v_enum(p, "status", ("all", "queued", "sent", "bounced", "replied"), required=False, default="all")
    q = v_str(p, "q", max_len=60, required=False).lower()
    where, args = [], []
    if niche:
        where.append("niche=?"); args.append(niche)
    if st != "all":
        where.append("status=?"); args.append(st)
    rs = rows(c.conn, "SELECT * FROM companies" + (" WHERE " + " AND ".join(where) if where else "") +
              " ORDER BY (sent_at IS NULL), sent_at DESC", tuple(args))
    if q:  # lower() в SQLite не знает кириллицу — фильтруем в Python
        rs = [r for r in rs if q in r["company"].lower() or q in r["email"]]
    rs = rs[:60]
    return {"companies": [{"id": r["id"], "company": r["company"], "email": r["email"], "niche": r["niche"], "city": r["city"],
                           "status": r["status"], "sentAt": r["sent_at"]} for r in rs]}
