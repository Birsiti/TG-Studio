# изменено 2026-10-16 20:05
from core import now


def T():
    return now().date().isoformat()


def stock_of(api, pid):
    return next(i["qty"] for i in api("cake", "getStock")["items"] if i["id"] == pid)


def test_refs_and_seed(api):
    r = api("cake", "getRefs")
    assert r["ok"] and len(r["products"]) >= 10 and len(r["cities"]) >= 8 and r["tara"]
    assert {s["role"] for s in r["staff"]} == {"storekeeper", "driver"}
    s = api("cake", "getStock")
    assert s["total"] > 0 and all(i["qty"] >= 0 for i in s["items"])


def test_income_writeoff_adjust(api):
    q0 = stock_of(api, "p002")
    assert api("cake", "addIncome", lines=[{"productId": "p002", "qty": 5}, {"productId": "p002", "qty": 2}])["added"] == 7
    assert stock_of(api, "p002") == q0 + 7
    assert api("cake", "writeOff", productId="p002", qty=1, reason="Помят")["qty"] == q0 + 6
    assert api("cake", "writeOff", productId="p002", qty=10**5, reason="x x")["error"] == "no_stock"
    r = api("cake", "adjustStock", productId="p002", actual=q0)
    assert r["delta"] == -6 and stock_of(api, "p002") == q0
    types = {m["type"] for m in api("cake", "getMoves", **{"from": T(), "to": T()})["moves"]}
    assert {"in", "writeoff", "adjust"} <= types
    assert api("cake", "addIncome", lines=[])["error"] == "bad_request"
    assert api("cake", "addIncome", lines=[{"productId": "nope", "qty": 1}])["error"] == "not_found"


def test_trip_full_cycle(api):
    api("cake", "addIncome", lines=[{"productId": "p003", "qty": 10}])
    q0 = stock_of(api, "p003")
    tara0 = next(c for c in api("cake", "getTara")["cities"] if c["id"] == "lida")["balance"]["box"]
    r = api("cake", "saveTrip", cityId="lida", driverId="dr-pavel", lines=[{"productId": "p003", "qty": 6}],
            taraOut=[{"taraId": "box", "qty": 4}])
    trip = r["trip"]
    assert trip["status"] == "draft" and stock_of(api, "p003") == q0  # сборка не трогает остаток
    assert api("cake", "shipTrip", id=trip["id"])["trip"]["status"] == "shipped"
    assert stock_of(api, "p003") == q0 - 6
    assert api("cake", "saveTrip", id=trip["id"], cityId="lida", lines=[])["error"] == "bad_state"
    assert api("cake", "cancelTrip", id=trip["id"])["error"] == "bad_state"
    # водитель видит рейс и сдаёт отчёт
    my = api("cake", "getMyTrips", driverId="dr-pavel")
    assert any(t["id"] == trip["id"] for t in my["trips"])
    bad = api("cake", "reportTrip", id=trip["id"], returns=[{"productId": "p003", "back": 5, "spoiled": 2}])
    assert bad["error"] == "bad_request"
    rep = api("cake", "reportTrip", id=trip["id"], returns=[{"productId": "p003", "back": 1, "spoiled": 1}],
              taraBack=[{"taraId": "box", "qty": 3}])
    assert rep["trip"]["status"] == "reported"
    # кладовщик принимает
    cl = api("cake", "closeTrip", id=trip["id"], returns=[{"productId": "p003", "back": 1, "spoiled": 1}],
             taraBack=[{"taraId": "box", "qty": 3}])["trip"]
    assert cl["status"] == "closed" and cl["lines"][0]["delivered"] == 4
    assert stock_of(api, "p003") == q0 - 5
    tara1 = next(c for c in api("cake", "getTara")["cities"] if c["id"] == "lida")["balance"]["box"]
    assert tara1 == tara0 + 1


def test_ship_checks(api):
    t = api("cake", "saveTrip", cityId="pinsk", lines=[{"productId": "p004", "qty": 10**5}])["trip"]
    assert api("cake", "shipTrip", id=t["id"])["error"] == "bad_request"  # нет водителя
    api("cake", "saveTrip", id=t["id"], cityId="pinsk", driverId="dr-ivan", lines=[{"productId": "p004", "qty": 10**5}])
    assert api("cake", "shipTrip", id=t["id"])["error"] == "no_stock"
    assert api("cake", "cancelTrip", id=t["id"])["trip"]["status"] == "cancelled"


def test_tara_shifts_overview_refs(api):
    r = api("cake", "taraMove", cityId="vitebsk", taraId="stack", qty=2, dir="out")
    b = r["balance"]
    assert api("cake", "taraMove", cityId="vitebsk", taraId="stack", qty=2, dir="in")["balance"] == b - 2
    assert api("cake", "setShift", date=T(), staffIds=["dr-ivan", "sk-anna", "ghost"])["staffIds"] == ["dr-ivan", "sk-anna"]
    assert api("cake", "getShifts")["days"][T()] == ["dr-ivan", "sk-anna"]
    o = api("cake", "getOverview")
    assert o["ok"] and len(o["series"]) == 14 and o["stockTotal"] > 0 and o["byCity"]
    p = api("cake", "saveProduct", name="Шоколадный", sku="T-200", shelfDays=5, minQty=4)["product"]
    assert p["id"] and api("cake", "saveCity", name="Слуцк", code="слц")["city"]["code"] == "СЛЦ"
    assert api("cake", "saveStaff", name="Тест Водитель", role="driver", tgId="12ab")["error"] == "bad_request"


def test_access_list(api, monkeypatch):
    monkeypatch.setenv("TGS_CAKE_ADMINS", "111")
    assert api("cake", "getStock", user="web-stranger01")["error"] == "forbidden"
    assert api("cake", "getStock", user="111")["ok"]
    api("cake", "saveStaff", user="111", id="dr-artur", name="Артур Лис", role="driver", tgId="222")
    assert api("cake", "getMyTrips", user="222")["driver"]["id"] == "dr-artur"
    assert api("cake", "getMe", user="222")["restricted"] is True


def test_catalog_from_client(api):
    r = api("cake", "getRefs")
    assert sum(1 for p in r["products"] if len(p["id"]) == 4) == 94 and r["cats"][0] == "Торт"
    names = {(p["cat"], p["name"], p["weightG"]) for p in r["products"]}
    assert ("Венский десерт", "Вишня в коньяке", 620) in names and ("Набор пирожных", "Honey Бум фисташка", 310) in names
    assert {t["name"] for t in r["tara"]} == {"Ящик", "Стопка"}
    p = api("cake", "saveProduct", name="Медовик", cat="Торт", weightG=1000)["product"]
    assert p["cat"] == "Торт" and p["weightG"] == 1000


def _signed(token, uid, age=0):
    import hashlib, hmac, json, time
    from urllib.parse import urlencode
    data = {"auth_date": str(int(time.time()) - age), "query_id": "AAH", "user": json.dumps({"id": uid, "first_name": "Тест"})}
    check = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    data["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(data)


def test_bot_token_signature(api, monkeypatch):
    tok = "123456:TEST-token"
    monkeypatch.setenv("TGS_CAKE_BOT_TOKEN", tok)
    monkeypatch.setenv("TGS_CAKE_ADMINS", "555")
    assert api("cake", "getStock", user="555")["error"] == "forbidden"  # userId без подписи не верим
    assert api("cake", "getStock", user="999", initData=_signed(tok, 555))["ok"]  # id берётся из подписи
    assert api("cake", "getStock", user="555", initData=_signed("other:token", 555))["error"] == "forbidden"
    assert api("cake", "getStock", user="555", initData=_signed(tok, 555, age=3 * 86400))["error"] == "forbidden"
    assert api("cake", "getStock", initData=_signed(tok, 777))["error"] == "forbidden"  # подписан, но не в списке
    bad = _signed(tok, 555).replace("%22id%22%3A+555", "%22id%22%3A+556")
    assert api("cake", "getStock", initData=bad)["error"] == "forbidden"
    assert api("cake", "getMe", initData=_signed(tok, 555))["restricted"] is True


def test_service_key_for_bot(api, monkeypatch):
    monkeypatch.setenv("TGS_CAKE_BOT_TOKEN", "123456:TEST-token")
    monkeypatch.setenv("TGS_CAKE_SERVICE_KEY", "s3cret-key-for-bot")
    assert api("cake", "getRefs", user=None)["error"] == "forbidden"
    assert api("cake", "getRefs", user=None, serviceKey="wrong")["error"] == "forbidden"
    assert api("cake", "getRefs", user=None, serviceKey="s3cret-key-for-bot")["ok"]
    assert api("cake", "getTrips", user=None, serviceKey="s3cret-key-for-bot")["ok"]
