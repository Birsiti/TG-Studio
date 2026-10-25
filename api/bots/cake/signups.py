# изменено 2026-10-25 12:00
"""Заявки «Я сотрудник Милано»: человек оставляет фамилию, имя и телефон из Telegram,
руководитель даёт роль (кладовщик, логист, водитель) или отказывает.
Допуска нет, пока руководитель не решил: signup/getMe открыты всем, остальное — по роли (base._guard)."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
from urllib.parse import parse_qsl

from core import ApiError, Ctx, iso_now, new_id, now, one, rows, v_bool, v_enum, v_id, v_phone, v_str
from bots.cake.base import _staff, action
from bots.cake.schema import ROLES

CONTACT_MAX_AGE = 3600  # подпись телефона от Telegram живёт час


def verified_phone(contact, user: str) -> str:
    """Телефон из ответа Telegram.WebApp.requestContact (строка `contact=…&auth_date=…&hash=…`).
    Подпись — токеном бота, как у initData; телефон должен быть самого пользователя. Пусто — не подтверждён."""
    token = os.environ.get("TGS_CAKE_BOT_TOKEN", "")
    if not token or not isinstance(contact, str) or not contact or len(contact) > 2048:
        return ""
    try:
        pairs = dict(parse_qsl(contact, keep_blank_values=True, strict_parsing=True))
        got = pairs.pop("hash", "")
        check = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))
        secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(hmac.new(secret, check.encode(), hashlib.sha256).hexdigest(), got):
            return ""
        c = json.loads(pairs.get("contact", "{}"))
        if now().timestamp() - int(pairs.get("auth_date", "0")) > CONTACT_MAX_AGE or str(c.get("user_id")) != user:
            return ""
        digits = re.sub(r"\D", "", str(c.get("phone_number", "")))
    except (ValueError, AttributeError, TypeError):
        return ""
    return "+" + digits if 9 <= len(digits) <= 15 else ""


def _signup(r) -> dict:
    return {"tgId": r["tg_id"], "lastName": r["last_name"], "firstName": r["first_name"], "phone": r["phone"],
            "phoneOk": bool(r["phone_ok"]), "username": r["username"], "status": r["status"], "createdAt": r["created_at"]}


@action("signup", write=True)
def signup(ctx: Ctx, p: dict) -> dict:
    """Оставить заявку. Телефон: подписанный из Telegram (contact) или введённый вручную (там, где requestContact недоступен)."""
    if not ctx.user:
        raise ApiError("bad_request", "Откройте приложение из бота")
    if ctx.role is not None:
        return {"signup": None}  # допуск уже есть
    old = one(ctx.conn, "SELECT status FROM signups WHERE tg_id=?", (ctx.user,))
    if old and old["status"] == "rejected":
        raise ApiError("forbidden", "Руководитель отказал в допуске")
    last, first = v_str(p, "lastName", min_len=2, max_len=40), v_str(p, "firstName", min_len=2, max_len=40)
    phone = verified_phone(p.get("contact"), ctx.user)
    ok = 1 if phone else 0
    if not phone:
        phone = v_phone(p, "phone")
    user = v_str(p, "username", required=False, max_len=40)
    if old:
        ctx.conn.execute("UPDATE signups SET last_name=?,first_name=?,phone=?,phone_ok=?,username=?,created_at=? WHERE tg_id=?",
                         (last, first, phone, ok, user, iso_now(), ctx.user))
    else:
        ctx.conn.execute("INSERT INTO signups(tg_id,last_name,first_name,phone,phone_ok,username,created_at) VALUES(?,?,?,?,?,?,?)",
                         (ctx.user, last, first, phone, ok, user, iso_now()))
    return {"signup": _signup(one(ctx.conn, "SELECT * FROM signups WHERE tg_id=?", (ctx.user,)))}


@action("getSignups")
def get_signups(ctx: Ctx, p: dict) -> dict:
    """Руководитель: заявки, ожидающие решения (и бот — со служебным ключом)."""
    return {"signups": [_signup(r) for r in rows(ctx.conn, "SELECT * FROM signups WHERE status='pending' ORDER BY created_at")]}


@action("decideSignup", write=True)
def decide_signup(ctx: Ctx, p: dict) -> dict:
    """Руководитель: дать роль (role) — человек появляется в «Людях» — или отказать (reject)."""
    tg = v_str(p, "tgId", max_len=15)
    su = one(ctx.conn, "SELECT * FROM signups WHERE tg_id=?", (tg,))
    if not su:
        raise ApiError("not_found", "Заявки нет")
    if v_bool(p, "reject", default=False):
        ctx.conn.execute("UPDATE signups SET status='rejected', decided_at=? WHERE tg_id=?", (iso_now(), tg))
        return {"staff": None}
    role = v_enum(p, "role", ROLES)
    name = f"{su['last_name']} {su['first_name']}".strip()
    old = one(ctx.conn, "SELECT id FROM staff WHERE tg_id=?", (tg,))
    if old:
        ctx.conn.execute("UPDATE staff SET name=?,role=?,phone=?,active=1 WHERE id=?", (name, role, su["phone"], old["id"]))
        sid = old["id"]
    else:
        sid = new_id("s")
        ctx.conn.execute("INSERT INTO staff(id,name,role,phone,tg_id,active) VALUES(?,?,?,?,?,1)", (sid, name, role, su["phone"], tg))
    ctx.conn.execute("UPDATE signups SET status='approved', decided_at=? WHERE tg_id=?", (iso_now(), tg))
    return {"staff": _staff(one(ctx.conn, "SELECT * FROM staff WHERE id=?", (sid,)))}
