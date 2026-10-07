# изменено 2026-10-08 02:48
from core import add_days, now


def T():
    return now().date().isoformat()


def future_trip(api, frm="Минск", to="Брест", off=1):
    r = api("versta", "getTrips", **{"from": frm, "to": to, "date": add_days(T(), off)})
    return r["route"], [t for t in r["trips"] if not t["departed"] and t["free"] > 0]


def test_directions(api):
    d = api("versta", "getDirections")
    assert "Минск" in d["cities"] and "Брест" in d["connections"]["Минск"] and d["connections"]["Брест"] == ["Минск"]


def test_booking_price_and_seats(api):
    route, trips = future_trip(api)
    t = trips[0]
    # Минск → Барановичи: 90 из 195 минут от 22 BYN = 10 BYN за место
    r = api("versta", "createBooking", tripId=t["id"], pickupIdx=0, dropoffIdx=1, seats=2, name="Пассажир", phone="+375291112233", price=1)
    assert r["ok"], r
    b = r["booking"]
    assert b["price"] == 20 and b["pickup"].startswith("Минск") and b["code"]
    after = [x for x in api("versta", "getTrips", **{"from": "Минск", "to": "Брест", "date": add_days(T(), 1)})["trips"] if x["id"] == t["id"]][0]
    assert after["free"] == t["free"] - 2
    mine = api("versta", "getMyBookings")["bookings"]
    assert mine[0]["id"] == b["id"]
    assert api("versta", "cancelBooking", user="web-someone0001", id=b["id"])["error"] == "not_found"
    assert api("versta", "cancelBooking", id=b["id"])["ok"]


def test_booking_validation(api):
    route, trips = future_trip(api, "Гомель", "Минск", 2)
    t = trips[0]
    base = {"tripId": t["id"], "pickupIdx": 0, "dropoffIdx": 3, "seats": 1, "name": "Тест", "phone": "+375291112233"}
    assert api("versta", "createBooking", **{**base, "dropoffIdx": 0})["ok"] is False
    assert api("versta", "createBooking", **{**base, "seats": 7})["ok"] is False
    assert api("versta", "createBooking", **{**base, "phone": "8029"})["ok"] is False
    assert api("versta", "createBooking", **{**base, "tripId": "nope"})["error"] == "not_found"
    big = api("versta", "createBooking", user="web-bigseats01", **{**base, "seats": 6})
    assert big["ok"] or big["error"] == "no_seats"


def test_no_overbooking(api):
    route, trips = future_trip(api, "Минск", "Могилёв", 3)
    t = trips[-1]
    ok = 0
    for i in range(6):
        r = api("versta", "createBooking", user=f"web-fill{i:06d}x", tripId=t["id"], pickupIdx=0, dropoffIdx=3, seats=6, name="Группа", phone="+375291112233")
        ok += r["ok"]
        if not r["ok"]:
            assert r["error"] == "no_seats"
    trip = api("versta", "getTrip", id=t["id"])["trip"]
    assert trip["filled"] <= trip["seatsTotal"]


def test_dispatcher(api):
    day = api("versta", "getDay", date=add_days(T(), 1))
    assert day["trips"] and day["stats"]["capacity"] > 0
    t = day["trips"][0]
    refs = api("versta", "getRefs")
    upd = api("versta", "updateTrip", id=t["id"], driverId=refs["drivers"][0]["id"], vehicle=refs["vehicles"][0]["plate"])
    assert upd["ok"] and upd["trip"]["driver"]["id"] == refs["drivers"][0]["id"]
    assert api("versta", "updateTrip", id=t["id"], cancelled=True)["trip"]["cancelled"] is True
    assert api("versta", "updateTrip", id=t["id"], cancelled=False)["ok"]
    full = api("versta", "getTrip", id=t["id"])["trip"]
    if full["bookings"]:
        assert api("versta", "setBookingStatus", id=full["bookings"][0]["id"], status="посажен")["ok"]
    assert api("versta", "getBookings")["bookings"]


def test_templates(api):
    tpl = api("versta", "saveTemplate", routeId="M1f", time="12:05", seatsTotal=18, days=[0, 1, 2, 3, 4, 5, 6])
    assert tpl["ok"] and tpl["tripsCreated"] >= 7
    assert any(x["id"] == tpl["template"]["id"] for x in api("versta", "getTemplates")["templates"])
    assert api("versta", "saveTemplate", routeId="M1f", time="12:05", seatsTotal=18, days=[])["ok"] is False
    assert api("versta", "deleteTemplate", id=tpl["template"]["id"])["ok"]


def test_driver_and_mechanic_link(api):
    drivers = api("versta", "getDrivers")["drivers"]
    d = drivers[0]
    trips = api("versta", "getDriverTrips", driverId=d["id"])["trips"]
    assert trips
    t = next((x for x in trips if x["vehicle"]), trips[0])
    assert api("versta", "setDriverStatus", id=t["id"], status="в пути")["ok"]
    al = api("versta", "driverAlert", tripId=t["id"], type="поломка", note="Горит check engine")
    assert al["ok"]
    if t["vehicle"]:
        did = al["alert"]["defectId"]
        defects = api("versta", "getDefects")["defects"]
        assert any(x["id"] == did and x["source"] == "водитель" for x in defects)
        up = api("versta", "updateDefect", id=did, status="в работе", note="Диагностика")
        assert up["ok"] and up["defect"]["log"]
        fleet = {v["plate"]: v for v in api("versta", "getFleet")["fleet"]}
        assert fleet[t["vehicle"]["plate"]]["status"] == "в ремонте"
        assert api("versta", "updateDefect", id=did, status="устранено")["ok"]
    assert api("versta", "driverAlert", tripId=t["id"])["alert"] is None
    assert api("versta", "setDriverStatus", id=t["id"], status="завершён")["ok"]


def test_mechanic_release_and_reg(api):
    rel = api("versta", "getRelease")
    assert rel["shifts"] and rel["checklist"]
    pending = [s for s in rel["shifts"] if not s["insp"]]
    s = pending[0]
    r = api("versta", "inspect", plate=s["plate"], passed=True, odo=s["odo"] + 12, note="")
    assert r["ok"] and r["insp"]["waybill"].startswith("ПЛ-")
    s2 = pending[1]
    r2 = api("versta", "inspect", plate=s2["plate"], passed=False, odo=s2["odo"], failed=["Шины: давление, износ, порезы"], note="Грыжа на заднем колесе")
    assert r2["ok"] and r2["insp"]["defectId"]
    fleet = api("versta", "getFleet")["fleet"]
    reg = fleet[0]["reg"][0]
    assert api("versta", "regDone", id=reg["id"], km=fleet[0]["odo"])["ok"]
    assert api("versta", "updateVehicle", plate=fleet[0]["plate"], doc={"name": "Гостехосмотр", "until": add_days(T(), 365)})["ok"]
    assert api("versta", "createDefect", plate=fleet[0]["plate"], title="Скрипит дверь", priority="плановая")["ok"]


def test_owner_and_platform(api):
    st = api("versta", "getOwnerStats")
    assert len(st["chart"]) == 7 and st["totalRevenue"] > 0 and st["routes"] and st["drivers"]
    assert len(api("versta", "getOwnerStats", days=30)["chart"]) == 30
    ten = api("versta", "getTenants")["tenants"]
    assert len(ten) >= 5
    new = api("versta", "saveTenant", tenant={"name": "Лида-Тур", "city": "Лида", "commission": 11,
                                              "routes": [{"from": "Лида", "to": "Минск", "price": 17}],
                                              "drivers": [{"name": "Иван Лидский", "phone": "+375291234567"}],
                                              "vehicles": [{"plate": "AO 1111-4", "model": "Ford Transit", "seats": 18}]})
    assert new["ok"] and new["tenant"]["status"] == "подключается"
    t = new["tenant"]
    t["status"] = "активен"
    assert api("versta", "saveTenant", tenant=t)["tenant"]["status"] == "активен"
    assert api("versta", "saveTenant", tenant={**t, "commission": 99})["ok"] is False
