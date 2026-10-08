# изменено 2026-10-08 03:10
def test_menu(api):
    r = api("most", "getMenu")
    assert r["ok"] and len(r["items"]) >= 15 and r["config"]["deliveryZones"]
    cap = next(i for i in r["items"] if i["id"] == 3)
    assert cap["modifiers"][0]["id"] == "milk"


def test_order_pricing_server_side(api):
    lines = [{"itemId": 3, "qty": 2, "mods": {"milk": "oat"}, "unit": 0.01}, {"itemId": 16, "qty": 1}]
    q = api("most", "quote", lines=lines, promo="most10")
    # капучино 6.20 + овсяное 0.60 = 6.80 × 2 + пян-се 6.50 = 20.10, скидка 10% = 2.01
    assert q["subtotal"] == 20.1 and q["discount"] == 2.01 and q["total"] == 18.09
    r = api("most", "createOrder", lines=lines, type="pickup", pickupTime="15", promo="MOST10", total=1)
    assert r["ok"], r
    o = r["order"]
    assert o["total"] == 18.09 and o["status"] == "new" and "Овсяное" in o["lines"][0]["n"]
    assert api("most", "getOrder", id=o["id"])["order"]["id"] == o["id"]
    assert api("most", "getOrder", user="web-stranger01", id=o["id"])["error"] == "not_found"
    assert api("most", "getMyOrders")["orders"][0]["id"] == o["id"]


def test_delivery_zones(api):
    lines = [{"itemId": 6, "qty": 1}]
    near = api("most", "createOrder", user="web-deliver001", lines=lines, type="delivery", geo={"lat": 53.925, "lng": 27.60}, phone="+375291112233")
    assert near["ok"] and near["order"]["deliveryFee"] == 3.0
    far = api("most", "createOrder", user="web-deliver001", lines=lines, type="delivery", geo={"lat": 54.5, "lng": 28.5}, phone="+375291112233")
    assert far["error"] == "out_of_zone"
    manual = api("most", "createOrder", user="web-deliver001", lines=lines, type="delivery", address="ул. Кульман, 9", phone="+375291112233")
    assert manual["ok"] and manual["order"]["deliveryFee"] == 6.0
    assert api("most", "createOrder", user="web-deliver001", lines=lines, type="delivery", address="ул. Кульман, 9")["ok"] is False  # нет телефона


def test_validation(api):
    assert api("most", "createOrder", lines=[], type="pickup")["error"] == "empty_cart"
    assert api("most", "createOrder", lines=[{"itemId": 999, "qty": 1}], type="pickup")["error"] == "bad_item"
    assert api("most", "createOrder", lines=[{"itemId": 19, "qty": 1}], type="pickup")["error"] == "out_of_stock"
    assert api("most", "createOrder", lines=[{"itemId": 3, "qty": 1, "mods": {"milk": "gold"}}], type="pickup")["ok"] is False
    assert api("most", "createOrder", lines=[{"itemId": 3, "qty": 50}], type="pickup")["ok"] is False
    assert api("most", "checkPromo", code="FREE")["error"] == "bad_promo"
    assert api("most", "checkPromo", code="bridge15")["percent"] == 15


def test_admin_flow(api):
    r = api("most", "simulateOrder")
    assert r["ok"]
    oid = r["order"]["id"]
    for expected in ["preparing", "ready", "done"]:
        assert api("most", "advanceOrder", id=oid)["status"] == expected
    assert api("most", "advanceOrder", id=oid)["error"] == "bad_state"
    assert any(o["id"] == oid for o in api("most", "getOrders")["orders"])
    assert api("most", "setAccepting", accepting=False)["accepting"] is False
    assert api("most", "createOrder", lines=[{"itemId": 1, "qty": 1}], type="pickup")["error"] == "paused"
    assert api("most", "setAccepting", accepting=True)["accepting"] is True


def test_menu_admin_and_settings(api):
    d = api("most", "saveDish", dish={"cat": "bakery", "icon": "bun", "price": 5.5, "name": {"ru": "Пирожок с капустой", "cn": "白菜包"}, "desc": {"ru": "печёный"}})
    assert d["ok"]
    iid = d["dish"]["id"]
    assert api("most", "toggleStock", id=iid)["ok"] and api("most", "toggleHit", id=iid)["ok"]
    items = {i["id"]: i for i in api("most", "getMenuAdmin")["items"]}
    assert items[iid]["inStock"] is False and items[iid]["hit"] is True
    assert api("most", "saveDish", dish={"cat": "nope", "icon": "bun", "price": 5, "name": {"ru": "X"}})["ok"] is False
    assert api("most", "deleteDish", id=iid)["ok"]
    s = api("most", "saveSettings", workHours={"from": "09:00", "to": "21:00"}, pickupEtaMin=10,
            deliveryZones=[{"maxKm": 2, "fee": 3, "eta": 15}, {"maxKm": 5, "fee": 6, "eta": 30}])
    assert s["ok"] and s["config"]["workHours"]["to"] == "21:00" and len(s["config"]["deliveryZones"]) == 2
    assert api("most", "saveSettings", workHours={"from": "21:00", "to": "09:00"})["ok"] is False


def test_stats(api):
    for period in ("today", "week", "month"):
        st = api("most", "getStats", period=period)["stats"]
        assert "revenue" in st and st["hours"]
    m = api("most", "getStats", period="month")["stats"]
    assert m["count"] > 500 and m["top"] and len(m["chart"]) == 30
