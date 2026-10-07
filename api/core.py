# изменено 2026-10-08 02:48
"""Общее ядро API студии: SQLite на бота, реестр action, валидация,
лимиты строк, демо-сид и ежедневное «освежение» демо-данных.

Каждый бот (bots/<name>.py) создаёт объект Bot, описывает схему, сид и
регистрирует обработчики декоратором @bot.action("name", write=True).
Обработчик получает (ctx, payload) и возвращает dict — к нему сервер
добавит ok=True. Ошибка бизнес-логики — raise ApiError("code").
"""
from __future__ import annotations

import json
import os
import re
import secrets
import sqlite3
import threading
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Callable
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Europe/Minsk")
DATA_DIR = Path(os.environ.get("TGS_DATA_DIR", Path(__file__).resolve().parent / "data"))


class ApiError(Exception):
    """Ожидаемая ошибка: отдаём клиенту {ok:false, error:code}."""

    def __init__(self, code: str, message: str = "", status: int = 200):
        super().__init__(code)
        self.code = code
        self.message = message
        self.status = status


# ============ ВРЕМЯ ============

def now() -> datetime:
    return datetime.now(TZ)


def today_str(d: datetime | None = None) -> str:
    return (d or now()).date().isoformat()


def add_days(day: str, n: int) -> str:
    return (date.fromisoformat(day) + timedelta(days=n)).isoformat()


def iso_now() -> str:
    return now().replace(microsecond=0).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(5).upper()}"


def hm_to_min(hm: str) -> int:
    h, m = hm.split(":")
    return int(h) * 60 + int(m)


def min_to_hm(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


# ============ ВАЛИДАЦИЯ ============
_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_ID = re.compile(r"^[A-Za-z0-9_\-]{1,40}$")
_USER = re.compile(r"^(\d{1,15}|web-[a-z0-9]{8,32})$")
_TIME = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")
_PHONE = re.compile(r"^\+375\d{9}$")

_MISSING = object()


def _get(p: dict, key: str, required: bool, default: Any):
    v = p.get(key, _MISSING) if isinstance(p, dict) else _MISSING
    if v is _MISSING or v is None or v == "":
        if required:
            raise ApiError("bad_request", f"{key}: обязательное поле")
        return _MISSING
    return v


def v_str(p: dict, key: str, *, max_len: int = 200, min_len: int = 0, required: bool = True,
          default: Any = "", multiline: bool = False) -> str:
    v = _get(p, key, required, default)
    if v is _MISSING:
        return default
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        v = str(v)
    if not isinstance(v, str):
        raise ApiError("bad_request", f"{key}: ожидается строка")
    v = v.strip()
    if not multiline:
        v = re.sub(r"\s+", " ", v)
    v = _CTRL.sub("", v)
    if len(v) > max_len:
        raise ApiError("bad_request", f"{key}: слишком длинно")
    if len(v) < min_len:
        raise ApiError("bad_request", f"{key}: слишком коротко")
    return v


def v_int(p: dict, key: str, *, lo: int = 0, hi: int = 10**9, required: bool = True, default: Any = 0) -> int:
    v = _get(p, key, required, default)
    if v is _MISSING:
        return default
    if isinstance(v, bool):
        raise ApiError("bad_request", f"{key}: ожидается число")
    try:
        f = float(v)
    except (TypeError, ValueError):
        raise ApiError("bad_request", f"{key}: ожидается число")
    if f != f or f != int(f):
        raise ApiError("bad_request", f"{key}: ожидается целое")
    i = int(f)
    if not lo <= i <= hi:
        raise ApiError("bad_request", f"{key}: вне диапазона")
    return i


def v_num(p: dict, key: str, *, lo: float = 0, hi: float = 1e9, required: bool = True, default: Any = 0.0) -> float:
    v = _get(p, key, required, default)
    if v is _MISSING:
        return default
    if isinstance(v, bool):
        raise ApiError("bad_request", f"{key}: ожидается число")
    try:
        f = float(v)
    except (TypeError, ValueError):
        raise ApiError("bad_request", f"{key}: ожидается число")
    if f != f or not lo <= f <= hi:
        raise ApiError("bad_request", f"{key}: вне диапазона")
    return round(f, 2)


def v_bool(p: dict, key: str, *, default: bool = False) -> bool:
    v = p.get(key, default) if isinstance(p, dict) else default
    if isinstance(v, bool):
        return v
    if v in (0, 1):
        return bool(v)
    if isinstance(v, str) and v.lower() in ("true", "false"):
        return v.lower() == "true"
    if v is None:
        return default
    raise ApiError("bad_request", f"{key}: ожидается true/false")


def v_enum(p: dict, key: str, options, *, required: bool = True, default: Any = None):
    v = _get(p, key, required, default)
    if v is _MISSING:
        return default
    if v not in options:
        raise ApiError("bad_request", f"{key}: недопустимое значение")
    return v


def v_id(p: dict, key: str, *, required: bool = True, default: Any = None):
    v = _get(p, key, required, default)
    if v is _MISSING:
        return default
    if not isinstance(v, str) or not _ID.match(v):
        raise ApiError("bad_request", f"{key}: неверный id")
    return v


def v_date(p: dict, key: str, *, required: bool = True, default: Any = None) -> str:
    v = _get(p, key, required, default)
    if v is _MISSING:
        return default
    s = str(v)
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        raise ApiError("bad_request", f"{key}: неверная дата")
    try:
        return date.fromisoformat(s).isoformat()
    except ValueError:
        raise ApiError("bad_request", f"{key}: неверная дата")


def v_time(p: dict, key: str, *, required: bool = True, default: Any = None) -> str:
    v = _get(p, key, required, default)
    if v is _MISSING:
        return default
    m = _TIME.match(str(v))
    if not m:
        raise ApiError("bad_request", f"{key}: неверное время")
    return f"{int(m.group(1)):02d}:{m.group(2)}"


def v_phone(p: dict, key: str, *, required: bool = True, default: Any = "") -> str:
    v = _get(p, key, required, default)
    if v is _MISSING:
        return default
    s = re.sub(r"[\s\-()]", "", str(v))
    if not _PHONE.match(s):
        raise ApiError("bad_request", f"{key}: телефон в формате +375XXXXXXXXX")
    return s


def v_obj(p: dict, key: str, *, required: bool = True) -> dict:
    v = _get(p, key, required, {})
    if v is _MISSING:
        return {}
    if not isinstance(v, dict):
        raise ApiError("bad_request", f"{key}: ожидается объект")
    return v


def v_list(p: dict, key: str, *, max_items: int = 50, required: bool = True) -> list:
    v = _get(p, key, required, [])
    if v is _MISSING:
        return []
    if not isinstance(v, list):
        raise ApiError("bad_request", f"{key}: ожидается список")
    if len(v) > max_items:
        raise ApiError("bad_request", f"{key}: слишком много элементов")
    return v


def v_ids(p: dict, key: str, *, max_items: int = 50, required: bool = True) -> list[str]:
    out = []
    for x in v_list(p, key, max_items=max_items, required=required):
        if not isinstance(x, str) or not _ID.match(x):
            raise ApiError("bad_request", f"{key}: неверный id")
        if x not in out:
            out.append(x)
    return out


def valid_user(v: Any) -> str | None:
    if isinstance(v, (int,)) and not isinstance(v, bool):
        v = str(v)
    if isinstance(v, str) and _USER.match(v):
        return v
    return None


# ============ БАЗА ============

def dict_row(cursor, row):
    return {d[0]: row[i] for i, d in enumerate(cursor.description)}


def rows(conn, sql: str, args=()) -> list[dict]:
    return conn.execute(sql, args).fetchall()


def one(conn, sql: str, args=()) -> dict | None:
    return conn.execute(sql, args).fetchone()


def scalar(conn, sql: str, args=()):
    r = conn.execute(sql, args).fetchone()
    return None if r is None else next(iter(r.values()))


def jdump(x) -> str:
    return json.dumps(x, ensure_ascii=False, separators=(",", ":"))


def jload(s, default=None):
    if s is None or s == "":
        return default
    try:
        return json.loads(s)
    except (TypeError, ValueError):
        return default


def cap_rows(conn, table: str, limit: int, where: str = "1=1", args=()) -> None:
    """Ограничение числа строк публичного демо: если таблица переполнена,
    удаляем самые старые строки, созданные пользователями (seed=0)."""
    n = scalar(conn, f"SELECT COUNT(*) FROM {table} WHERE {where}", args)
    if n is not None and n >= limit:
        extra = n - limit + 1
        conn.execute(
            f"DELETE FROM {table} WHERE rowid IN (SELECT rowid FROM {table} WHERE seed=0 AND {where} ORDER BY rowid LIMIT ?)",
            (*args, extra),
        )
        n2 = scalar(conn, f"SELECT COUNT(*) FROM {table} WHERE {where}", args)
        if n2 >= limit:
            raise ApiError("limit", "Демо-база заполнена")


def upsert(conn, table: str, key: str, data: dict) -> None:
    cols = list(data.keys())
    sql = (f"INSERT INTO {table} ({','.join(cols)}) VALUES ({','.join('?' * len(cols))}) "
           f"ON CONFLICT({key}) DO UPDATE SET " + ",".join(f"{c}=excluded.{c}" for c in cols if c != key))
    conn.execute(sql, [data[c] for c in cols])


@dataclass
class Ctx:
    conn: sqlite3.Connection
    user: str | None
    ip: str
    now: datetime = field(default_factory=now)

    @property
    def today(self) -> str:
        return self.now.date().isoformat()

    def need_user(self) -> str:
        if not self.user:
            raise ApiError("no_user", "Нет userId")
        return self.user


@dataclass
class Action:
    fn: Callable[[Ctx, dict], dict]
    write: bool


class Bot:
    def __init__(self, name: str, schema: str, seed: Callable[[sqlite3.Connection, datetime], None],
                 refresh: Callable[[sqlite3.Connection, datetime], None] | None = None):
        self.name = name
        self.schema = schema
        self.seed = seed
        self.refresh = refresh
        self.actions: dict[str, Action] = {}
        self._ready = False
        self._refreshed_on: str | None = None
        self._lock = threading.Lock()

    def action(self, name: str, write: bool = False):
        def deco(fn):
            self.actions[name] = Action(fn, write)
            return fn
        return deco

    # ---- соединение ----
    @property
    def path(self) -> Path:
        return DATA_DIR / f"{self.name}.db"

    def connect(self) -> sqlite3.Connection:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.path, timeout=15, isolation_level=None, check_same_thread=False)
        conn.row_factory = dict_row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=15000")
        return conn

    def ensure(self) -> None:
        """Схема + сид при первом запуске + ежедневное освежение демо."""
        today = today_str()
        if self._ready and self._refreshed_on == today:
            return
        with self._lock:
            conn = self.connect()
            try:
                if not self._ready:
                    conn.execute("PRAGMA journal_mode=WAL")
                    conn.executescript("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);\n" + self.schema)
                    conn.execute("BEGIN IMMEDIATE")
                    try:
                        if scalar(conn, "SELECT v FROM meta WHERE k='seeded'") is None:
                            self.seed(conn, now())
                            conn.execute("INSERT INTO meta(k,v) VALUES('seeded',?)", (iso_now(),))
                            conn.execute("INSERT OR REPLACE INTO meta(k,v) VALUES('refreshed_on',?)", (today,))
                        conn.execute("COMMIT")
                    except Exception:
                        conn.execute("ROLLBACK")
                        raise
                    self._ready = True
                if self.refresh is not None:
                    conn.execute("BEGIN IMMEDIATE")
                    try:
                        last = scalar(conn, "SELECT v FROM meta WHERE k='refreshed_on'")
                        if last != today:
                            self.refresh(conn, now())
                            conn.execute("INSERT OR REPLACE INTO meta(k,v) VALUES('refreshed_on',?)", (today,))
                        conn.execute("COMMIT")
                    except Exception:
                        conn.execute("ROLLBACK")
                        raise
                self._refreshed_on = today
            finally:
                conn.close()

    def handle(self, action: str, payload: dict, ip: str) -> dict:
        act = self.actions.get(action)
        if act is None:
            raise ApiError("unknown_action", action)
        self.ensure()
        conn = self.connect()
        try:
            conn.execute("BEGIN IMMEDIATE" if act.write else "BEGIN")
            try:
                ctx = Ctx(conn=conn, user=valid_user(payload.get("userId")), ip=ip)
                result = act.fn(ctx, payload) or {}
                conn.execute("COMMIT")
            except BaseException:
                conn.execute("ROLLBACK")
                raise
        finally:
            conn.close()
        return {"ok": True, **result}

    def reset(self) -> None:
        """Удалить базу (следующий запрос пересоздаст и засеет её)."""
        for suffix in ("", "-wal", "-shm"):
            p = Path(str(self.path) + suffix)
            if p.exists():
                p.unlink()
        self._ready = False
        self._refreshed_on = None
