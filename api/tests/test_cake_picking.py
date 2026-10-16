# изменено 2026-10-17 02:30
"""Сборка по кругу: заявки с фото, галочки, места, точки, миграция в старую базу."""
from bots.cake import bot as cake_bot

# «Итого» с бумаги: (кол-во без бонусов, грузовых мест) — как в cake-warehouse/db/check_db.py
PAPER = {"1103561": (17, 17), "1103455": (78, 78), "1103609": (50, 52), "1103617": (6, 6)}


def order(api, num):
    return next(o for o in api("cake", "getOrders", date="2026-10-17")["orders"] if o["num"] == num)


def test_orders_from_photos_match_paper(api):
    r = api("cake", "getOrders", date="2026-10-17")
    assert len(r["orders"]) == 11 and r["routes"] == ["Маршрут 2", "Маршрут 3"] and len(r["points"]) == 24
    for num, (qty, places) in PAPER.items():
        o = order(api, num)
        q = sum(ln["qty"] for ln in o["lines"])
        assert (q, q + sum(ln["bonus"] for ln in o["lines"])) == (qty, places), num
    assert order(api, "1103609")["route"] == "Маршрут 3"


def test_pick_cycle(api):
    o = order(api, "1103617")
    assert o["status"] == "new" and o["checked"] == []
    assert api("cake", "finishPick", id=o["id"], picker="Кобзев")["error"] == "bad_state"  # не всё отмечено
    pid = o["lines"][0]["productId"]
    assert api("cake", "checkLine", id=o["id"], productId=pid)["order"]["checked"] == [pid]
    assert api("cake", "checkLine", id=o["id"], productId=pid, done=False)["order"]["checked"] == []
    assert api("cake", "checkLine", id=o["id"], productId="p001")["error"] == "not_found"
    api("cake", "checkLine", id=o["id"], productId=pid)
    done = api("cake", "finishPick", id=o["id"], picker="Кобзев", boxes=2)["order"]
    assert done["status"] == "picked" and done["picker"] == "Кобзев" and done["boxes"] == 2
    assert api("cake", "checkLine", id=o["id"], productId=pid)["error"] == "bad_state"
    assert api("cake", "deleteOrder", id=o["id"])["error"] == "bad_state"
    assert api("cake", "reopenPick", id=o["id"])["order"]["status"] == "new"


def test_save_order_and_places(api):
    pts = api("cake", "getOrders")["points"]
    r = api("cake", "saveOrder", num="2000001", date="2026-10-20", pointId=pts[0]["id"],
            lines=[{"productId": "p002", "qty": 3}, {"productId": "p002", "qty": 1, "bonus": 1}])
    o = r["order"]
    assert o["lines"] == [{"productId": "p002", "qty": 4, "bonus": 1}] and o["route"] == pts[0]["route"]
    assert api("cake", "saveOrder", num="2000001", pointId=pts[0]["id"], lines=[{"productId": "p002", "qty": 1}])["error"] == "bad_request"
    assert api("cake", "saveOrder", num="2000002", pointId="nope", lines=[{"productId": "p002", "qty": 1}])["error"] == "not_found"
    assert api("cake", "saveOrder", num="2000003", pointId=pts[0]["id"], lines=[])["error"] == "bad_request"
    api("cake", "checkLine", id=o["id"], productId="p002")
    r = api("cake", "saveOrder", id=o["id"], num="2000001", date="2026-10-20", pointId=pts[0]["id"],
            lines=[{"productId": "p002", "qty": 2}, {"productId": "p003", "qty": 1}])
    assert r["order"]["checked"] == ["p002"]  # отметка уцелевшей строки сохраняется
    assert "2026-10-20" in api("cake", "getOrders", date="2026-10-20")["dates"]
    assert api("cake", "deleteOrder", id=o["id"])["ok"]
    assert api("cake", "savePlaces", places=[{"productId": "p002", "place": 7}, {"productId": "p003", "place": 2}])["places"] == {"p002": 7, "p003": 2}
    assert api("cake", "savePlaces", places=[{"productId": "p002", "place": 0}])["places"] == {"p003": 2}
    p = api("cake", "savePoint", customer="Тест", address="г. Минск, ул. Тестовая, 1", route="Маршрут 9")["point"]
    assert p["route"] == "Маршрут 9" and "Маршрут 9" in api("cake", "getOrders")["routes"]


def test_migration_into_old_db(client, api):
    """База, созданная до сборки: таблиц заявок нет — при старте они появятся и заполнятся один раз."""
    conn = cake_bot.connect()
    conn.executescript("DROP TABLE orders; DROP TABLE points; DROP TABLE places; DELETE FROM meta WHERE k='orders_v1';")
    conn.close()
    cake_bot._ready = False
    assert len(api("cake", "getOrders", date="2026-10-17")["orders"]) == 11
    cake_bot._ready = False  # повторный старт — без дублей
    assert len(api("cake", "getOrders", date="2026-10-17")["orders"]) == 11
