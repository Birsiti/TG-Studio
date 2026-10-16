# изменено 2026-10-16 17:30
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
    q0 = stock_of(api, "medovik")
    assert api("cake", "addIncome", lines=[{"productId": "medovik", "qty": 5}, {"productId": "medovik", "qty": 2}])["added"] == 7
    assert stock_of(api, "medovik") == q0 + 7
    assert api("cake", "writeOff", productId="medovik", qty=1, reason="Помят")["qty"] == q0 + 6
    assert api("cake", "writeOff", productId="medovik", qty=10**5, reason="x x")["error"] == "no_stock"
    r = api("cake", "adjustStock", productId="medovik", actual=q0)
    assert r["delta"] == -6 and stock_of(api, "medovik") == q0
    types = {m["type"] for m in api("cake", "getMoves", **{"from": T(), "to": T()})["moves"]}
    assert {"in", "writeoff", "adjust"} <= types
    assert api("cake", "addIncome", lines=[])["error"] == "bad_request"
    assert api("cake", "addIncome", lines=[{"productId": "nope", "qty": 1}])["error"] == "not_found"


def test_trip_full_cycle(api):
    api("cake", "addIncome", lines=[{"productId": "praga", "qty": 10}])
    q0 = stock_of(api, "praga")
    tara0 = next(c for c in api("cake", "getTara")["cities"] if c["id"] == "lida")["balance"]["crate"]
    r = api("cake", "saveTrip", cityId="lida", driverId="dr-pavel", lines=[{"productId": "praga", "qty": 6}],
            taraOut=[{"taraId": "crate", "qty": 4}])
    trip = r["trip"]
    assert trip["status"] == "draft" and stock_of(api, "praga") == q0  # сборка не трогает остаток
    assert api("cake", "shipTrip", id=trip["id"])["trip"]["status"] == "shipped"
    assert stock_of(api, "praga") == q0 - 6
    assert api("cake", "saveTrip", id=trip["id"], cityId="lida", lines=[])["error"] == "bad_state"
    assert api("cake", "cancelTrip", id=trip["id"])["error"] == "bad_state"
    # водитель видит рейс и сдаёт отчёт
    my = api("cake", "getMyTrips", driverId="dr-pavel")
    assert any(t["id"] == trip["id"] for t in my["trips"])
    bad = api("cake", "reportTrip", id=trip["id"], returns=[{"productId": "praga", "back": 5, "spoiled": 2}])
    assert bad["error"] == "bad_request"
    rep = api("cake", "reportTrip", id=trip["id"], returns=[{"productId": "praga", "back": 1, "spoiled": 1}],
              taraBack=[{"taraId": "crate", "qty": 3}])
    assert rep["trip"]["status"] == "reported"
    # кладовщик принимает
    cl = api("cake", "closeTrip", id=trip["id"], returns=[{"productId": "praga", "back": 1, "spoiled": 1}],
             taraBack=[{"taraId": "crate", "qty": 3}])["trip"]
    assert cl["status"] == "closed" and cl["lines"][0]["delivered"] == 4
    assert stock_of(api, "praga") == q0 - 5
    tara1 = next(c for c in api("cake", "getTara")["cities"] if c["id"] == "lida")["balance"]["crate"]
    assert tara1 == tara0 + 1


def test_ship_checks(api):
    t = api("cake", "saveTrip", cityId="pinsk", lines=[{"productId": "velvet", "qty": 10**5}])["trip"]
    assert api("cake", "shipTrip", id=t["id"])["error"] == "bad_request"  # нет водителя
    api("cake", "saveTrip", id=t["id"], cityId="pinsk", driverId="dr-ivan", lines=[{"productId": "velvet", "qty": 10**5}])
    assert api("cake", "shipTrip", id=t["id"])["error"] == "no_stock"
    assert api("cake", "cancelTrip", id=t["id"])["trip"]["status"] == "cancelled"


def test_tara_shifts_overview_refs(api):
    r = api("cake", "taraMove", cityId="vitebsk", taraId="thermo", qty=2, dir="out")
    b = r["balance"]
    assert api("cake", "taraMove", cityId="vitebsk", taraId="thermo", qty=2, dir="in")["balance"] == b - 2
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
