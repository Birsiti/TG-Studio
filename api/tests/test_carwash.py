# изменено 2026-10-08 02:15
import json
from concurrent.futures import ThreadPoolExecutor

from core import add_days, now


def free_slot(api, days_ahead=1):
    day = add_days(now().date().isoformat(), days_ahead)
    slots = api("carwash", "getSlots", date=day)["slots"]
    free = [s["time"] for s in slots if not s["disabled"]]
    return day, free


def booking_payload(day, time, **over):
    p = {"date": day, "time": time, "car": {"number": "1234 ab-7", "brand": "Kia", "model": "Rio", "carClass": "krossover"},
         "serviceIds": ["wash-standard", "ex-tires"], "contact": {"name": "Тест", "phone": "+375291234567"}}
    p.update(over)
    return p


def test_health(client):
    r = client.get("/health").json()
    assert r["ok"] and "carwash" in r["bots"]


def test_services_client_hides_invisible(api):
    cats = api("carwash", "getServices", audience="client")["categories"]
    assert cats and all("visible" not in it for c in cats for it in c["items"])
    admin = api("carwash", "getServices")["categories"]
    assert all("visible" in it for c in admin for it in c["items"])


def test_create_booking_server_price(api):
    day, free = free_slot(api, 2)
    r = api("carwash", "createBooking", **booking_payload(day, free[0], priceMin=1, priceMax=1))
    assert r["ok"], r
    b = r["booking"]
    # кроссовер: стандарт 35–40 + чернение 6–8 — клиентские priceMin/Max игнорируются
    assert (b["priceMin"], b["priceMax"]) == (41, 48)
    assert b["services"] == ["Стандарт", "Чернение резины"]
    assert b["car"]["number"] == "1234 AB-7"
    # слот теперь занят
    again = api("carwash", "createBooking", **booking_payload(day, free[0]))
    assert again == {"ok": False, "error": "slot_unavailable"}
    mine = api("carwash", "getMyBookings")["bookings"]
    assert mine[0]["id"] == b["id"]
    assert api("carwash", "getMyProfile")["profile"]["phone"] == "+375291234567"
    cars = api("carwash", "getMyCars")["cars"]
    assert cars[0]["number"] == "1234 AB-7"
    # чужой пользователь не может отменить
    assert api("carwash", "cancelBooking", user="web-otheruser1", id=b["id"])["error"] == "not_found"
    assert api("carwash", "cancelBooking", id=b["id"])["ok"]
    assert api("carwash", "getMyBookings")["bookings"][0]["status"] == "Отменена"


def test_validation(api):
    day, free = free_slot(api, 3)
    bad = [
        booking_payload(day, free[0], contact={"name": "Тест", "phone": "123"}),
        booking_payload(day, free[0], serviceIds=["nope"]),
        booking_payload(day, "25:00"),
        booking_payload("2020-01-01", free[0]),
        booking_payload(day, free[0], car={"number": "x", "carClass": "legkovoy"}),
        booking_payload(day, free[0], car={"number": "1234 AB-7", "carClass": "tank"}),
    ]
    for p in bad:
        r = api("carwash", "createBooking", **p)
        assert r["ok"] is False, p
    assert api("carwash", "createBooking", user=None, **booking_payload(day, free[0]))["error"] == "no_user"


def test_concurrent_booking_one_wins(client):
    from conftest import call
    day = add_days(now().date().isoformat(), 4)
    slots = call(client, "carwash", "getSlots", date=day)["slots"]
    t = [s["time"] for s in slots if not s["disabled"]][-1]

    def go(i):
        return call(client, "carwash", "createBooking", user=f"web-race{i:06d}x", **booking_payload(day, t))

    with ThreadPoolExecutor(8) as ex:
        results = list(ex.map(go, range(8)))
    assert sum(1 for r in results if r["ok"]) == 1
    assert all(r["error"] == "slot_unavailable" for r in results if not r["ok"])


def test_admin_flow(api):
    bookings = api("carwash", "getBookings")["bookings"]
    today = now().date().isoformat()
    b = next(x for x in bookings if x["date"] >= today and x["status"] != "cancelled")
    assert api("carwash", "updateBookingStatus", id=b["id"], status="done")["ok"]
    assert api("carwash", "updateBookingStatus", id=b["id"], status="weird")["ok"] is False
    assert api("carwash", "assignBookingStaff", id=b["id"], staffId="st-artem")["ok"]
    assert api("carwash", "setShift", date=today, staffIds=["st-artem", "st-ilya", "ghost"])["ok"]
    assert api("carwash", "getShift", date=today)["staffIds"] == ["st-artem", "st-ilya"]
    day, free = free_slot(api, 5)
    assert api("carwash", "blockSlot", date=day, time=free[0])["ok"]
    states = {s["time"]: s["state"] for s in api("carwash", "getDaySlots", date=day)["slots"]}
    assert states[free[0]] == "blocked"
    assert api("carwash", "unblockSlot", date=day, time=free[0])["ok"]
    assert api("carwash", "addClosedDate", date=add_days(today, 9))["ok"]
    assert api("carwash", "getSlots", date=add_days(today, 9))["slots"] == []
    assert api("carwash", "removeClosedDate", date=add_days(today, 9))["ok"]
    sched = api("carwash", "getSchedule")["schedule"]
    sched["sun"] = {"open": False, "from": "10:00", "to": "18:00"}
    assert api("carwash", "saveSchedule", schedule=sched)["ok"]
    assert api("carwash", "getSchedule")["schedule"]["sun"]["open"] is False


def test_service_crud(api):
    item = {"name": "Мойка радиатора", "desc": "", "visible": False,
            "price": {c: [20, 30] for c in ["legkovoy", "krossover", "vnedorozhnik", "minivan"]}}
    r = api("carwash", "saveService", category="Доп. услуги", item=item)
    assert r["ok"] and r["item"]["visible"] is False
    sid = r["item"]["id"]
    client_ids = [it["id"] for c in api("carwash", "getServices", audience="client")["categories"] for it in c["items"]]
    assert sid not in client_ids
    assert api("carwash", "deleteService", id=sid)["ok"]


def test_staff_and_payout(api):
    r = api("carwash", "saveStaff", staff={"name": "Новый Мойщик", "role": "Мойщик", "payType": "percent", "rate": 25, "phone": "+375291110000"})
    assert r["ok"]
    sid = r["staff"]["id"]
    before = next(s for s in api("carwash", "getStaff")["staff"] if s["id"] == "st-artem")
    pay = api("carwash", "payStaff", staffId="st-artem", amount=100)
    assert pay["ok"] and round(pay["remainingAccrued"], 2) == round(before["accruedMonth"] - 100, 2)
    assert api("carwash", "payStaff", staffId="st-artem", amount=-5)["ok"] is False
    assert any(p["staffId"] == "st-artem" for p in api("carwash", "getPayouts", staffId="st-artem")["payouts"])
    assert api("carwash", "saveStaff", staff={"id": sid, "name": "Новый Мойщик", "role": "Мойщик", "payType": "percent", "rate": 25, "active": False})["ok"]
    assert api("carwash", "deleteStaff", id=sid)["ok"]


def test_owner_crud_and_overview(api):
    ov = api("carwash", "getOverview")
    assert ov["overview"]["month"]["revenue"] > 0
    assert len(ov["chart"]) == 7 and ov["topServices"]
    today = now().date().isoformat()
    rng = api("carwash", "getOverviewRange", **{"from": add_days(today, -29), "to": today})
    assert len(rng["chart"]) == 30
    assert api("carwash", "getOverviewRange", **{"from": "2020-01-01", "to": today})["ok"] is False
    bay = api("carwash", "saveBay", bay={"name": "Бокс 5", "status": "free"})
    assert bay["ok"] and api("carwash", "deleteBay", id=bay["bay"]["id"])["ok"]
    inv = api("carwash", "saveInventoryItem", item={"name": "Полироль", "unit": "л", "qty": 3, "min": 2, "price": 30})
    assert inv["ok"] and api("carwash", "deleteInventoryItem", id=inv["item"]["id"])["ok"]
    shop = api("carwash", "saveShopItem", item={"name": "Губка", "price": 4.5, "stock": 10, "visible": True})
    assert shop["ok"] and api("carwash", "deleteShopItem", id=shop["item"]["id"])["ok"]
    assert all(i["visible"] for i in api("carwash", "getShop", audience="client")["items"])


def test_transport_guards(client):
    r = client.post("/api/carwash", content="not json", headers={"Content-Type": "text/plain"})
    assert r.status_code == 400 and r.json()["error"] == "bad_json"
    r = client.post("/api/carwash", content=json.dumps({"action": "x" * 10, "pad": "a" * 70000}))
    assert r.status_code == 413
    r = client.post("/api/nobot", content=json.dumps({"action": "getServices"}))
    assert r.status_code == 404
    r = client.post("/api/carwash", content=json.dumps({"action": "dropTables"}))
    assert r.json()["error"] == "unknown_action"


def test_cors(client):
    r = client.post("/api/carwash", content=json.dumps({"action": "getServices"}), headers={"Origin": "https://birsiti.github.io"})
    assert r.headers.get("access-control-allow-origin") == "https://birsiti.github.io"
    r = client.post("/api/carwash", content=json.dumps({"action": "getServices"}), headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in r.headers
    r = client.post("/api/carwash", content=json.dumps({"action": "getServices"}), headers={"Origin": "https://demo.tg-studio.xyz"})
    assert r.headers.get("access-control-allow-origin") == "https://demo.tg-studio.xyz"


def test_rate_limit(client, monkeypatch):
    import server
    monkeypatch.setattr(server, "RATE_ALL", 3)
    server.limiter.reset()
    codes = [client.post("/api/carwash", content=json.dumps({"action": "getServices"}), headers={"cf-connecting-ip": "9.9.9.9"}).status_code
             for _ in range(5)]
    assert codes[:3] == [200, 200, 200] and codes[3] == 429
    server.limiter.reset()
