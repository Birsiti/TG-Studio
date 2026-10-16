# изменено 2026-10-17 08:50
"""Справочники: торты, города, сотрудники, тара; кто я."""
from __future__ import annotations

from core import ApiError, Ctx, new_id, one, rows, v_bool, v_enum, v_id, v_int, v_phone, v_str
from bots.cake.base import _city, _next_sort, _product, _restricted, _staff, _tara, action
from bots.cake.catalog import CATS
from bots.cake.schema import MAX_QTY, MOVE_TYPES, ROLES


# ============ СПРАВОЧНИКИ ============

@action("getRefs")
def get_refs(ctx: Ctx, p: dict) -> dict:
    c = ctx.conn
    return {
        "products": [_product(r) for r in rows(c, "SELECT * FROM products ORDER BY sort, name")],
        "cities": [_city(r) for r in rows(c, "SELECT * FROM cities ORDER BY sort, name")],
        "staff": [_staff(r) for r in rows(c, "SELECT * FROM staff ORDER BY role DESC, name")],
        "tara": [_tara(r) for r in rows(c, "SELECT * FROM tara_types ORDER BY sort, name")],
        "moveTypes": MOVE_TYPES, "cats": list(CATS),
    }

@action("saveProduct", write=True)
def save_product(ctx: Ctx, p: dict) -> dict:
    pid = v_id(p, "id", required=False) or new_id("p")
    old = one(ctx.conn, "SELECT * FROM products WHERE id=?", (pid,))
    w = v_int(p, "weightG", lo=1, hi=100000, required=False, default=old["weight_g"] if old else 0)
    if not w:
        raise ApiError("bad_request", "Укажите вес, г — как на упаковке")
    data = (v_str(p, "name", min_len=2, max_len=80), v_str(p, "cat", required=False, max_len=40) or CATS[0],
            v_str(p, "sku", required=False, max_len=30),
            w, v_int(p, "shelfDays", hi=365, required=False),
            v_int(p, "minQty", hi=MAX_QTY, required=False),
            v_int(p, "perBox", lo=1, hi=1000, required=False, default=old["per_box"] if old else 1),
            1 if v_bool(p, "active", default=True) else 0)
    if old:
        ctx.conn.execute("UPDATE products SET name=?,cat=?,sku=?,weight_g=?,shelf_days=?,min_qty=?,per_box=?,active=? WHERE id=?", (*data, pid))
    else:
        ctx.conn.execute("INSERT INTO products(name,cat,sku,weight_g,shelf_days,min_qty,per_box,active,id,sort) VALUES(?,?,?,?,?,?,?,?,?,?)",
                         (*data, pid, _next_sort(ctx.conn, "products")))
    return {"product": _product(one(ctx.conn, "SELECT * FROM products WHERE id=?", (pid,)))}


@action("saveCity", write=True)
def save_city(ctx: Ctx, p: dict) -> dict:
    cid = v_id(p, "id", required=False) or new_id("c")
    data = (v_str(p, "name", min_len=2, max_len=60), v_str(p, "code", required=False, max_len=4).upper(),
            1 if v_bool(p, "active", default=True) else 0)
    if one(ctx.conn, "SELECT 1 FROM cities WHERE id=?", (cid,)):
        ctx.conn.execute("UPDATE cities SET name=?,code=?,active=? WHERE id=?", (*data, cid))
    else:
        ctx.conn.execute("INSERT INTO cities(name,code,active,id,sort) VALUES(?,?,?,?,?)", (*data, cid, _next_sort(ctx.conn, "cities")))
    return {"city": _city(one(ctx.conn, "SELECT * FROM cities WHERE id=?", (cid,)))}


@action("saveStaff", write=True)
def save_staff(ctx: Ctx, p: dict) -> dict:
    sid = v_id(p, "id", required=False) or new_id("s")
    tg = v_str(p, "tgId", required=False, max_len=15)
    if tg and not tg.isdigit():
        raise ApiError("bad_request", "tgId: только цифры")
    data = (v_str(p, "name", min_len=2, max_len=80), v_enum(p, "role", ROLES), v_phone(p, "phone", required=False),
            v_str(p, "car", required=False, max_len=80), tg, 1 if v_bool(p, "active", default=True) else 0)
    if one(ctx.conn, "SELECT 1 FROM staff WHERE id=?", (sid,)):
        ctx.conn.execute("UPDATE staff SET name=?,role=?,phone=?,car=?,tg_id=?,active=? WHERE id=?", (*data, sid))
    else:
        ctx.conn.execute("INSERT INTO staff(name,role,phone,car,tg_id,active,id) VALUES(?,?,?,?,?,?,?)", (*data, sid))
    return {"staff": _staff(one(ctx.conn, "SELECT * FROM staff WHERE id=?", (sid,)))}


@action("saveTara", write=True)
def save_tara(ctx: Ctx, p: dict) -> dict:
    tid = v_id(p, "id", required=False) or new_id("t")
    data = (v_str(p, "name", min_len=2, max_len=60), v_int(p, "total", hi=MAX_QTY, required=False),
            1 if v_bool(p, "active", default=True) else 0)
    if one(ctx.conn, "SELECT 1 FROM tara_types WHERE id=?", (tid,)):
        ctx.conn.execute("UPDATE tara_types SET name=?,total=?,active=? WHERE id=?", (*data, tid))
    else:
        ctx.conn.execute("INSERT INTO tara_types(name,total,active,id,sort) VALUES(?,?,?,?,?)", (*data, tid, _next_sort(ctx.conn, "tara_types")))
    return {"tara": _tara(one(ctx.conn, "SELECT * FROM tara_types WHERE id=?", (tid,)))}


@action("getMe")
def get_me(ctx: Ctx, p: dict) -> dict:
    me = ctx.user and one(ctx.conn, "SELECT * FROM staff WHERE tg_id=? AND tg_id<>''", (ctx.user,))
    return {"staff": _staff(me) if me else None, "restricted": _restricted()}
