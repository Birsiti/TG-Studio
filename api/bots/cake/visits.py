# изменено 2026-10-18 09:00
"""Кто и когда заходит: /start и сообщения боту (бот присылает logVisit со служебным ключом)
и открытия приложения (hello со страницы). Руководитель смотрит getVisits.
Журнал входов — не учёт: держим последние LOG_KEEP строк."""
from __future__ import annotations

from core import ApiError, Ctx, iso_now, one, rows, scalar, v_enum, v_int, v_str
from bots.cake.base import _admins, action

LOG_KEEP = 5000
PAGES = ("sklad", "admin", "driver", "bot")
QUIET_MIN = 30  # повторные открытия той же страницы чаще раза в 30 минут в журнал не пишем


def _touch(c, tg: str, kind: str, page: str, name: str = "", username: str = "") -> bool:
    """Отметить вход; True — человек пришёл впервые."""
    at = iso_now()
    old = one(c, "SELECT * FROM visitors WHERE tg_id=?", (tg,))
    col = "starts" if kind == "bot" else "opens"
    if old:
        c.execute(f"UPDATE visitors SET last_at=?, last_page=?, {col}={col}+1, name=CASE WHEN ?<>'' THEN ? ELSE name END,"
                  " username=CASE WHEN ?<>'' THEN ? ELSE username END WHERE tg_id=?", (at, page, name, name, username, username, tg))
    else:
        c.execute(f"INSERT INTO visitors(tg_id,name,username,first_at,last_at,last_page,{col}) VALUES(?,?,?,?,?,?,1)",
                  (tg, name, username, at, at, page))
    last = one(c, "SELECT at FROM visit_log WHERE tg_id=? AND page=? ORDER BY id DESC LIMIT 1", (tg, page))
    if not last or scalar(c, "SELECT (julianday(?) - julianday(?)) * 1440 >= ?", (at[:19], last["at"][:19], QUIET_MIN)):
        c.execute("INSERT INTO visit_log(tg_id,at,page) VALUES(?,?,?)", (tg, at, page))
        c.execute("DELETE FROM visit_log WHERE id <= (SELECT MAX(id) FROM visit_log) - ?", (LOG_KEEP,))
    return not old


@action("logVisit", write=True)
def log_visit(ctx: Ctx, p: dict) -> dict:
    """Бот (служебный ключ; в ADMIN_ACTIONS — сотрудникам недоступно): человек написал боту. isNew — пришёл впервые (бот сообщит руководителю)."""
    tg = v_str(p, "tgId", max_len=15)
    if not tg.isdigit():
        raise ApiError("bad_request", "tgId: только цифры")
    new = _touch(ctx.conn, tg, "bot", "bot", v_str(p, "name", required=False, max_len=80), v_str(p, "username", required=False, max_len=40))
    return {"isNew": new}


@action("hello", write=True)
def hello(ctx: Ctx, p: dict) -> dict:
    """Страница открылась (sklad / admin / driver)."""
    if ctx.user:
        _touch(ctx.conn, ctx.user, "app", v_enum(p, "page", PAGES[:3]))
    return {}


@action("getVisits")
def get_visits(ctx: Ctx, p: dict) -> dict:
    """Руководитель: все, кто заходил (с ролью или «нет доступа»), и последние входы."""
    c, admins = ctx.conn, _admins()
    staff = {r["tg_id"]: r for r in rows(c, "SELECT * FROM staff WHERE tg_id<>''")}

    def who(tg):
        s = staff.get(tg)
        role = "admin" if tg in admins else (s["role"] if s and s["active"] else None)
        return {"staffId": s["id"] if s else None, "staffName": s["name"] if s else "", "role": role}

    people = [{"tgId": r["tg_id"], "name": r["name"], "username": r["username"], "firstAt": r["first_at"], "lastAt": r["last_at"],
               "lastPage": r["last_page"], "starts": r["starts"], "opens": r["opens"], **who(r["tg_id"])}
              for r in rows(c, "SELECT * FROM visitors ORDER BY last_at DESC")]
    limit = v_int(p, "limit", lo=1, hi=1000, required=False) or 200
    log = [{"tgId": r["tg_id"], "at": r["at"], "page": r["page"]} for r in rows(c, "SELECT * FROM visit_log ORDER BY id DESC LIMIT ?", (limit,))]
    return {"people": people, "log": log}
