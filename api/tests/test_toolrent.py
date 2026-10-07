# изменено 2026-10-08 02:30
from core import add_days, now


def T():
    return now().date().isoformat()


def book(api, user="web-tooluser01", **over):
    p = {"modelId": "m9", "from": add_days(T(), 5), "to": add_days(T(), 7), "method": "pickup",
         "name": "Иван Петров", "phone": "+375291234567", "idDoc": "mp1234567"}
    p.update(over)
    return api("toolrent", "createBooking", user=user, **p)


def test_models_and_config(api):
    r = api("toolrent", "getModels")
    assert r["ok"] and len(r["models"]) >= 8 and r["config"]["deliveryZones"]
    m = r["models"][0]
    assert {"freeToday", "totalQty", "price", "deposit"} <= set(m)


def test_quote_discount_and_delivery(api):
    q = api("toolrent", "quote", modelId="m1", **{"from": add_days(T(), 1), "to": add_days(T(), 7)}, method="delivery", zone="z2", returnMethod="courier")["quote"]
    # 7 суток × 18 = 126, скидка 20% = 25.2, доставка 30 × 2
    assert q["days"] == 7 and q["rent"] == 126 and q["discount"] == 25.2 and q["deliveryFee"] == 60 and q["total"] == 160.8


def test_booking_flow_and_availability(api):
    before = api("toolrent", "checkAvailability", modelId="m9", **{"from": add_days(T(), 5), "to": add_days(T(), 7)})
    r = book(api)
    assert r["ok"], r
    b = r["booking"]
    assert b["status"] == "pending" and b["total"] == 16 * 3 * 0.9
    after = api("toolrent", "checkAvailability", modelId="m9", **{"from": add_days(T(), 5), "to": add_days(T(), 7)})
    assert after["free"] == before["free"] - 1
    ext = api("toolrent", "extendBooking", user="web-tooluser01", id=b["id"], newTo=add_days(T(), 9))
    assert ext["ok"] and ext["booking"]["days"] == 5
    assert api("toolrent", "cancelBooking", user="web-other00001", id=b["id"])["error"] == "not_found"
    assert api("toolrent", "cancelBooking", user="web-tooluser01", id=b["id"])["ok"]
    mine = api("toolrent", "getMyBookings", user="web-tooluser01")["bookings"]
    assert mine[0]["status"] == "cancelled"


def test_sold_out(api):
    # у m12 две единицы — третья бронь на те же даты не пройдёт
    d = {"modelId": "m12", "from": add_days(T(), 20), "to": add_days(T(), 21)}
    assert book(api, user="web-sold000001", **d)["ok"]
    assert book(api, user="web-sold000002", **d)["ok"]
    r = book(api, user="web-sold000003", **d)
    assert r == {"ok": False, "error": "unavailable", "message": "На эти даты всё занято"}


def test_validation(api):
    assert book(api, phone="12345")["ok"] is False
    assert book(api, method="delivery")["ok"] is False  # нет адреса и слота
    assert book(api, **{"from": add_days(T(), -3)})["ok"] is False
    assert book(api, **{"to": add_days(T(), 60)})["ok"] is False
    assert book(api, modelId="nope")["error"] == "not_found"
    ok = book(api, user="web-deliv00001", method="delivery", address="ул. Тестовая, 1", slot="day", zone="z1")
    assert ok["ok"] and ok["booking"]["deliveryFee"] == 15


def test_admin_handout_return_and_repair(api):
    today = api("toolrent", "getToday")
    assert today["handout"] and today["ret"] and today["stats"]["overdue"] >= 1
    b = today["handout"][0]
    units = api("toolrent", "getFreeUnits", modelId=b["modelId"])["units"]
    assert units
    assert api("toolrent", "checkOut", bookingId=b["id"], unitId=units[0]["id"], condition="ok")["ok"]
    assert api("toolrent", "checkOut", bookingId=b["id"], unitId=units[0]["id"])["error"] == "bad_state"
    ub = api("toolrent", "getUnitBooking", unitId=units[0]["id"])
    assert ub["booking"]["id"] == b["id"]
    back = api("toolrent", "checkIn", bookingId=b["id"], damaged=True, comment="Скол на корпусе")
    assert back["ok"]
    util = api("toolrent", "getUtilization")
    assert any(r["unitId"] == units[0]["id"] and r["status"] == "in_repair" for r in util["repairs"])
    assert api("toolrent", "setUnitStatus", unitId=units[0]["id"], status="free")["ok"]
    assert api("toolrent", "addUnit", modelId="m7")["unit"]["num"] == 5


def test_manual_booking_and_delivery_status(api):
    r = api("toolrent", "createBookingManual", modelId="m6", **{"from": T(), "to": add_days(T(), 1)}, method="delivery",
            address="ул. Есенина, 16", slot="evening", client="Тест Админ", phone="+375447778899")
    assert r["ok"] and r["booking"]["source"] == "admin"
    assert api("toolrent", "setDeliveryStatus", bookingId=r["orderId"], status="on_way")["ok"]
    assert api("toolrent", "setDeliveryStatus", bookingId=r["orderId"], status="lost")["ok"] is False


def test_owner(api):
    ov = api("toolrent", "getOverview")["data"]
    assert ov["month"]["count"] >= 0 and len(ov["week7"]) == 7 and ov["topModels"]
    cu = api("toolrent", "getOverview", **{"from": add_days(T(), -29), "to": T()})["data"]
    assert len(cu["week7"]) == 30 and "custom" in cu
    od = api("toolrent", "getOverdue")["list"]
    assert od and od[0]["daysLate"] > 0 and od[0]["debt"] > 0
    assert api("toolrent", "nudgeClient", id=od[0]["id"])["ok"]
    cat = api("toolrent", "getCatalog")
    assert cat["models"] and cat["icons"]
    upd = api("toolrent", "updateModel", modelId="m1", price=19, specs="800 Вт", description="Новый текст")
    assert upd["ok"] and upd["model"]["price"] == 19 and upd["model"]["name"] == "Перфоратор Bosch GBH 2-26"
    assert api("toolrent", "updateModel", modelId="m1", photoUrl="javascript:alert(1)")["ok"] is False
    new = api("toolrent", "updateModel", name="Отбойный молоток", cat="build", price=40, deposit=300, icon="drill")
    assert new["ok"] and new["model"]["id"]
    assert api("toolrent", "setModelActive", modelId=new["model"]["id"], active=False)["ok"]
    exp = api("toolrent", "getBookingsForExport")
    assert exp["bookings"]
