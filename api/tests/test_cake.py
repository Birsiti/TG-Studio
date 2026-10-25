# изменено 2026-10-18 12:00
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
    pavel = lambda: next(d for d in api("cake", "getTara")["drivers"] if d["id"] == "dr-pavel")["tara"]["box"]  # noqa: E731
    tara0 = pavel()
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
    tara1 = pavel()
    # выдали 4, вернул 3 → долг водителя вырос на 1
    assert (tara1["issued"], tara1["returned"], tara1["debt"]) == (tara0["issued"] + 4, tara0["returned"] + 3, tara0["debt"] + 1)
    assert any(t["id"] == trip["id"] for t in api("cake", "getMyTrips", driverId="dr-pavel")["trips"])
    assert api("cake", "getMyTrips", driverId="dr-pavel")["taraDebt"] == [{"taraId": "box", "qty": tara1["debt"]}]


def test_ship_checks(api):
    t = api("cake", "saveTrip", cityId="pinsk", lines=[{"productId": "p004", "qty": 10**5}])["trip"]
    assert api("cake", "shipTrip", id=t["id"])["error"] == "bad_request"  # нет водителя
    api("cake", "saveTrip", id=t["id"], cityId="pinsk", driverId="dr-ivan", lines=[{"productId": "p004", "qty": 10**5}])
    assert api("cake", "shipTrip", id=t["id"])["error"] == "no_stock"
    assert api("cake", "cancelTrip", id=t["id"])["trip"]["status"] == "cancelled"


def test_tara_shifts_overview_refs(api):
    r = api("cake", "taraMove", driverId="dr-ivan", taraId="box", qty=5, kind="out")
    b = r["debt"]
    assert api("cake", "taraMove", driverId="dr-ivan", taraId="box", qty=2, kind="back")["debt"] == b - 2
    assert api("cake", "taraMove", driverId="dr-ivan", taraId="box", qty=1, kind="writeoff")["debt"] == b - 3
    assert api("cake", "taraMove", driverId="dr-ivan", taraId="box", qty=b, kind="back")["error"] == "bad_request"
    assert api("cake", "taraMove", driverId="sk-anna", taraId="box", qty=1, kind="out")["error"] == "not_found"
    t = api("cake", "getTara")
    box = t["types"][0]
    assert box["inStock"] == box["total"] - box["atDrivers"] - box["lost"] and box["lost"] >= 1
    assert sum(d["tara"]["box"]["debt"] for d in t["drivers"]) == box["atDrivers"]
    assert api("cake", "setShift", date=T(), staffIds=["dr-ivan", "sk-anna", "ghost"])["staffIds"] == ["dr-ivan", "sk-anna"]
    assert api("cake", "getShifts")["days"][T()] == ["dr-ivan", "sk-anna"]
    o = api("cake", "getOverview")
    assert o["ok"] and len(o["series"]) == 14 and o["stockTotal"] > 0 and o["byCity"]
    p = api("cake", "saveProduct", name="Шоколадный", sku="T-200", weightG=900, shelfDays=5, minQty=4)["product"]
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
    assert sum(1 for p in r["products"] if len(p["id"]) == 4) == 99 and r["cats"][0] == "Торт"
    names = {(p["cat"], p["name"], p["weightG"]) for p in r["products"]}
    assert ("Венский десерт", "Вишня в коньяке", 620) in names and ("Набор пирожных", "Honey Бум фисташка", 310) in names
    assert {t["name"] for t in r["tara"]} == {"Ящик"}
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


def test_driver_sees_only_own(api, monkeypatch):
    """Водитель: свои рейсы и отчёт. Склад, справочники и чужие рейсы — нет."""
    monkeypatch.setenv("TGS_CAKE_ADMINS", "111")
    api("cake", "saveStaff", user="111", id="dr-ivan", name="Иван Водитель", role="driver", tgId="777")
    api("cake", "saveStaff", user="111", id="sk-test", name="Кладовщик Тест", role="storekeeper", tgId="888")
    for act in ("getTrips", "getStock", "adjustStock", "saveStaff", "getOrders"):
        assert api("cake", act, user="777")["error"] == "forbidden", act
    assert api("cake", "getMyTrips", user="777")["driver"]["id"] == "dr-ivan" and api("cake", "getRefs", user="777")["ok"]
    assert api("cake", "getTrips", user="888")["ok"]
    assert api("cake", "saveStaff", user="888", name="Чужой", role="storekeeper", tgId="999")["error"] == "forbidden"
    api("cake", "addIncome", user="111", lines=[{"productId": "p003", "qty": 5}])
    other = api("cake", "saveTrip", user="111", cityId="lida", driverId="dr-pavel", lines=[{"productId": "p003", "qty": 1}])["trip"]
    api("cake", "shipTrip", user="111", id=other["id"])
    assert api("cake", "reportTrip", user="777", id=other["id"])["error"] == "forbidden"  # чужой рейс


def test_token_without_admins_is_closed(api, monkeypatch):
    tok = "123456:TEST-token"
    monkeypatch.setenv("TGS_CAKE_BOT_TOKEN", tok)
    assert api("cake", "getStock", initData=_signed(tok, 4242))["error"] == "forbidden"  # подписан, но не сотрудник


def test_close_trip_returns_and_tara_checked(api):
    api("cake", "addIncome", lines=[{"productId": "p003", "qty": 5}])
    t = api("cake", "saveTrip", cityId="lida", driverId="dr-pavel", lines=[{"productId": "p003", "qty": 5}])["trip"]
    api("cake", "shipTrip", id=t["id"])
    q = stock_of(api, "p003")
    dup = [{"productId": "p003", "back": 5}, {"productId": "p003", "back": 5}]
    assert api("cake", "closeTrip", id=t["id"], returns=dup)["error"] == "bad_request"  # дважды — не удваиваем остаток
    assert api("cake", "closeTrip", id=t["id"], taraBack=[{"taraId": "box", "qty": 99999}])["error"] == "bad_request"
    assert stock_of(api, "p003") == q
    assert api("cake", "closeTrip", id=t["id"], returns=[{"productId": "p003", "back": 5}])["trip"]["status"] == "closed"
    assert stock_of(api, "p003") == q + 5


def test_route_city_survives_rename(api):
    pts = api("cake", "getOrders")["points"]
    c = next(x for x in api("cake", "getRefs")["cities"] if x["id"] == "route-2")
    api("cake", "saveCity", id="route-2", name="Маршрут 2 (Минск)", code=c["code"])
    from bots.cake import bot as cake_bot
    cake_bot._ready = False  # перезапуск: миграция не заводит второй «Маршрут 2»
    assert sum(1 for x in api("cake", "getRefs")["cities"] if x["name"].startswith("Маршрут 2")) == 1 and pts


def test_huge_number_is_bad_request(api):
    assert api("cake", "addIncome", lines=[{"productId": "p003", "qty": "1e400"}])["error"] == "bad_request"


def test_odometer_and_driver_stats(api, monkeypatch):
    api("cake", "addIncome", lines=[{"productId": "p003", "qty": 10}])
    t = api("cake", "saveTrip", cityId="lida", driverId="dr-pavel", lines=[{"productId": "p003", "qty": 10}],
            taraOut=[{"taraId": "box", "qty": 2}])["trip"]
    assert api("cake", "setOdometer", id=t["id"], kind="out", km=1000)["error"] == "bad_state"  # ещё на сборке
    api("cake", "shipTrip", id=t["id"])
    assert api("cake", "setOdometer", id=t["id"], kind="back", km=1100)["error"] == "bad_request"  # сначала выезд
    assert api("cake", "setOdometer", id=t["id"], kind="out", km=1000)["trip"]["odoOut"] == 1000
    assert api("cake", "setOdometer", id=t["id"], kind="back", km=990)["error"] == "bad_request"   # меньше выезда
    assert api("cake", "setOdometer", id=t["id"], kind="back", km=9000)["error"] == "bad_request"  # опечатка
    assert api("cake", "setOdometer", id=t["id"], kind="back", km=1185)["trip"]["odoBack"] == 1185
    api("cake", "reportTrip", id=t["id"], returns=[{"productId": "p003", "back": 3}])
    api("cake", "closeTrip", id=t["id"], returns=[{"productId": "p003", "back": 2}], taraBack=[{"taraId": "box", "qty": 1}])
    t2 = api("cake", "saveTrip", cityId="lida", driverId="dr-pavel", lines=[{"productId": "p003", "qty": 1}])["trip"]
    api("cake", "shipTrip", id=t2["id"])
    api("cake", "setOdometer", id=t2["id"], kind="out", km=1200)  # 15 км между рейсами
    d = next(x for x in api("cake", "getDriverStats")["drivers"] if x["driverId"] == "dr-pavel")
    assert d["km"] >= 185 and d["kmGap"] >= 15 and d["shortage"] >= 1 and d["back"] >= 2 and d["taraDebt"] >= 1
    # водитель — только свой рейс
    monkeypatch.setenv("TGS_CAKE_ADMINS", "111")
    api("cake", "saveStaff", user="111", id="dr-ivan", name="Иван Водитель", role="driver", tgId="777")
    assert api("cake", "setOdometer", user="777", id=t2["id"], kind="back", km=1250)["error"] == "forbidden"
    assert api("cake", "getDriverStats", user="777")["error"] == "forbidden"


def test_odometer_migration_into_old_db(api):
    """База iMac создана без спидометра — колонки добавятся при старте, рейсы целы."""
    from bots.cake import bot as cake_bot
    n = len(api("cake", "getTrips")["trips"])
    conn = cake_bot.connect()
    conn.executescript("ALTER TABLE trips DROP COLUMN odo_out; ALTER TABLE trips DROP COLUMN odo_back;")
    conn.close()
    cake_bot._ready = False
    r = api("cake", "getTrips")["trips"]
    assert len(r) == n and all("odoOut" in t for t in r)


def test_hired_driver(api):
    """Водитель свой или наёмный (фирма-перевозчик); кладовщик наёмным не бывает. Старая база — колонки миграцией."""
    s = api("cake", "saveStaff", id="dr-pavel", name="Павел Гриб", role="driver", hired=True, carrier="ИП Петров")["staff"]
    assert s["hired"] is True and s["carrier"] == "ИП Петров"
    s = api("cake", "saveStaff", id="dr-pavel", name="Павел Гриб", role="driver", hired=False, carrier="ИП Петров")["staff"]
    assert s["hired"] is False and s["carrier"] == ""
    assert api("cake", "saveStaff", name="Кладовщик", role="storekeeper", hired=True)["staff"]["hired"] is False
    api("cake", "saveStaff", id="dr-pavel", name="Павел Гриб", role="driver", hired=True)
    from bots.cake import bot as cake_bot
    conn = cake_bot.connect()
    conn.executescript("ALTER TABLE staff DROP COLUMN hired; ALTER TABLE staff DROP COLUMN carrier;")
    conn.close()
    cake_bot._ready = False
    st = api("cake", "getRefs")["staff"]
    assert all(x["hired"] is False for x in st) and any(x["id"] == "dr-pavel" for x in st)


def test_visits(api, monkeypatch):
    """Кто заходит: бот отмечает /start (isNew — впервые), страницы — hello; список видит только руководитель."""
    assert api("cake", "logVisit", tgId="555", name="Новый Человек", username="newbie")["isNew"] is True
    assert api("cake", "logVisit", tgId="555", name="Новый Человек")["isNew"] is False
    assert api("cake", "logVisit", tgId="55a")["error"] == "bad_request"
    v = api("cake", "getVisits")
    p = next(x for x in v["people"] if x["tgId"] == "555")
    assert p["starts"] == 2 and p["username"] == "newbie" and p["role"] is None
    assert len([x for x in v["log"] if x["tgId"] == "555"]) == 1  # повтор за 30 минут — одна строка журнала
    monkeypatch.setenv("TGS_CAKE_ADMINS", "111")
    api("cake", "saveStaff", user="111", id="dr-ivan", name="Иван Водитель", role="driver", tgId="777")
    assert api("cake", "hello", user="777", page="driver")["ok"]
    assert api("cake", "getVisits", user="777")["error"] == "forbidden"
    assert api("cake", "logVisit", user="777", tgId="777")["error"] == "forbidden"
    v = api("cake", "getVisits", user="111")
    me = next(x for x in v["people"] if x["tgId"] == "777")
    assert me["role"] == "driver" and me["opens"] == 1 and me["staffName"] == "Иван Водитель"


def test_logist_role(api, monkeypatch):
    """Логист — права склада (заявки, рейсы, статистика водителей), но не «Люди» и не «Кто заходит»."""
    monkeypatch.setenv("TGS_CAKE_ADMINS", "111")
    assert api("cake", "saveStaff", user="111", id="lg-test", name="Логист Тест", role="logist", tgId="999")["staff"]["role"] == "logist"
    for act in ("getOrders", "getTrips", "getDriverStats", "getTara"):
        assert api("cake", act, user="999")["ok"], act
    assert api("cake", "savePoint", user="999", customer="Кафе", address="ул. Тест, 1", route="Маршрут 9")["ok"]
    assert api("cake", "getVisits", user="999")["error"] == "forbidden"
    assert api("cake", "saveStaff", user="999", name="Хакер", role="driver")["error"] == "forbidden"


def _contact(token, uid, phone="375291112233", age=0):
    """Ответ Telegram.WebApp.requestContact: contact=…&auth_date=…&hash=… (подпись токеном бота)."""
    import hashlib, hmac, json, time
    from urllib.parse import urlencode
    data = {"contact": json.dumps({"phone_number": phone, "first_name": "Т", "user_id": uid}), "auth_date": str(int(time.time()) - age)}
    check = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    data["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(data)


def test_signup_and_access(api, monkeypatch):
    """«Я сотрудник Милано»: заявка → руководитель даёт роль → человек в «Людях» и работает по роли."""
    tok = "123456:TEST-token"
    monkeypatch.setenv("TGS_CAKE_BOT_TOKEN", tok)
    monkeypatch.setenv("TGS_CAKE_ADMINS", "111")
    monkeypatch.setenv("TGS_CAKE_SERVICE_KEY", "s3cret-key-for-bot")
    mine = lambda uid, act, **kw: api("cake", act, user=None, initData=_signed(tok, uid), **kw)
    me = mine(4401, "getMe")
    assert me["ok"] and me["access"] is False and me["signup"] is None and me["staff"] is None
    assert mine(4401, "getStock")["error"] == "forbidden"  # допуска нет
    assert mine(4401, "getSignups")["error"] == "forbidden"
    assert mine(4401, "signup", lastName="Л", firstName="Анна", phone="+375291112233")["error"] == "bad_request"
    r = mine(4401, "signup", lastName="Литвинов", firstName="Антон", contact=_contact(tok, 4401))
    assert r["signup"]["phone"] == "+375291112233" and r["signup"]["phoneOk"] and r["signup"]["status"] == "pending"
    r = mine(4402, "signup", lastName="Петров", firstName="Пётр", contact=_contact(tok, 4401))  # чужой телефон не берём
    assert r["signup"]["phoneOk"] is False if r.get("ok") else r["error"] == "bad_request"
    r = mine(4403, "signup", lastName="Сидоров", firstName="Сидор", contact=_contact(tok, 4403, age=7200), phone="+375441234567")
    assert r["signup"]["phoneOk"] is False and r["signup"]["phone"] == "+375441234567"  # подпись устарела → вручную
    assert mine(4401, "getMe")["signup"]["status"] == "pending"
    pend = api("cake", "getSignups", user="111", initData=_signed(tok, 111))
    assert {x["tgId"] for x in pend["signups"]} >= {"4401", "4403"}
    assert mine(4401, "decideSignup", tgId="4401", role="driver")["error"] == "forbidden"  # сам себе роль не даст
    adm = lambda act, **kw: api("cake", act, user=None, initData=_signed(tok, 111), **kw)
    ok = adm("decideSignup", tgId="4401", role="storekeeper")
    assert ok["staff"]["name"] == "Литвинов Антон" and ok["staff"]["role"] == "storekeeper" and ok["staff"]["tgId"] == "4401"
    me = mine(4401, "getMe")
    assert me["access"] and me["role"] == "storekeeper" and me["staff"]["phone"] == "+375291112233"
    assert mine(4401, "getStock")["ok"] and mine(4401, "saveStaff", name="Хакер", role="driver")["error"] == "forbidden"
    assert adm("decideSignup", tgId="4403", reject=True)["staff"] is None
    assert mine(4403, "getMe")["signup"]["status"] == "rejected" and mine(4403, "getStock")["error"] == "forbidden"
    assert mine(4403, "signup", lastName="Сидоров", firstName="Сидор", phone="+375441234567")["error"] == "forbidden"
    assert "4401" not in {x["tgId"] for x in adm("getSignups")["signups"]}
    assert api("cake", "getSignups", user=None, serviceKey="s3cret-key-for-bot")["ok"]  # бот читает список со служебным ключом


def test_manager_role_and_delete(api, monkeypatch):
    """Руководитель из заявки — права как у TGS_CAKE_ADMINS; повторное решение отклоняется; удаление сотрудника."""
    tok = "123456:TEST-token"
    monkeypatch.setenv("TGS_CAKE_BOT_TOKEN", tok)
    monkeypatch.setenv("TGS_CAKE_ADMINS", "111")
    monkeypatch.setenv("TGS_CAKE_SERVICE_KEY", "s3cret-key-for-bot")
    mine = lambda uid, act, **kw: api("cake", act, user=None, initData=_signed(tok, uid), **kw)
    bot = lambda act, **kw: api("cake", act, user=None, serviceKey="s3cret-key-for-bot", **kw)
    mine(5501, "signup", lastName="Главный", firstName="Пётр", phone="+375291000001")
    mine(5502, "signup", lastName="Новый", firstName="Иван", phone="+375291000002")
    m = bot("decideSignup", tgId="5501", role="manager")["staff"]  # кнопка в Telegram — бот со служебным ключом
    assert m["role"] == "manager" and bot("decideSignup", tgId="5501", role="driver")["error"] == "conflict"
    me = mine(5501, "getMe")
    assert me["access"] and me["role"] == "admin" and me["staff"]["role"] == "manager"
    assert mine(5501, "getSignups")["ok"] and mine(5501, "getVisits")["ok"]  # руководитель видит всё
    d = mine(5501, "decideSignup", tgId="5502", role="driver")["staff"]
    assert mine(5502, "getMyTrips")["ok"] and mine(5502, "getStock")["error"] == "forbidden"
    assert mine(5502, "deleteStaff", id=m["id"])["error"] == "forbidden"
    assert mine(5501, "deleteStaff", id=m["id"])["error"] == "bad_request"  # себя нельзя
    assert mine(5501, "deleteStaff", id=d["id"])["ok"]
    me = mine(5502, "getMe")
    assert me["access"] is False and me["signup"] is None  # можно зарегистрироваться заново
    assert mine(5502, "getMyTrips")["error"] == "forbidden"
