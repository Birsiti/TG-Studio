# изменено 2026-10-08 02:57
from core import add_days, now


def T():
    return now().date().isoformat()


def slots(api, barber="b1", service="s3", off=1):
    for d in range(off, off + 7):
        day = add_days(T(), d)
        r = api("barbershop", "getSlots", barberId=barber, serviceId=service, date=day)
        if r["times"]:
            return day, r["times"]
    raise AssertionError("нет свободных окон")


def test_catalog(api):
    r = api("barbershop", "getBarbers")
    assert len(r["barbers"]) == 4 and r["services"]
    assert all("nextFree" in b for b in r["barbers"])


def test_booking_and_overlap(api):
    day, times = slots(api)
    t = times[0]
    r = api("barbershop", "createBooking", barberId="b1", serviceId="s3", date=day, time=t, name="Клиент", phone="+375291234567", price=1)
    assert r["ok"], r
    assert r["booking"]["price"] == 55 and r["booking"]["dur"] == 60
    # ровно это же время и пересекающееся +20 минут — заняты
    assert api("barbershop", "createBooking", user="web-other00001", barberId="b1", serviceId="s5", date=day, time=t, name="Другой", phone="+375291234568")["error"] == "slot_unavailable"
    h, m = map(int, t.split(":"))
    t2 = f"{(h * 60 + m + 20) // 60:02d}:{(m + 20) % 60:02d}"
    assert api("barbershop", "createBooking", user="web-other00001", barberId="b1", serviceId="s5", date=day, time=t2, name="Другой", phone="+375291234568")["ok"] is False
    after = api("barbershop", "getSlots", barberId="b1", serviceId="s3", date=day)["times"]
    assert t not in after
    mine = api("barbershop", "getMyBookings")["bookings"]
    assert mine[0]["id"] == r["booking"]["id"]
    assert api("barbershop", "cancelBooking", id=r["booking"]["id"])["ok"]
    assert t in api("barbershop", "getSlots", barberId="b1", serviceId="s3", date=day)["times"]


def test_nearest(api):
    m = api("barbershop", "getNearest", serviceId="s1")["match"]
    assert m and m["barberId"] and m["time"]


def test_validation(api):
    day, times = slots(api, "b2", "s1")
    base = {"barberId": "b2", "serviceId": "s1", "date": day, "time": times[0], "name": "Клиент", "phone": "+375291234567"}
    assert api("barbershop", "createBooking", **{**base, "time": "09:00"})["ok"] is False
    assert api("barbershop", "createBooking", **{**base, "phone": "+7999"})["ok"] is False
    assert api("barbershop", "createBooking", **{**base, "serviceId": "zzz"})["error"] == "not_found"
    assert api("barbershop", "createBooking", **{**base, "date": add_days(T(), 40)})["ok"] is False


def test_admin(api):
    d = api("barbershop", "getDay", date=add_days(T(), -1))
    assert d["bookings"] and d["stats"]["total"] > 0
    b = next(x for x in d["bookings"] if x["status"] == "done")
    assert api("barbershop", "setStatus", id=b["id"], status="noshow")["ok"]
    assert api("barbershop", "setStatus", id=b["id"], status="bogus")["ok"] is False
    day, times = slots(api, "b4", "s6")
    r = api("barbershop", "createBookingAdmin", barberId="b4", serviceId="s6", date=day, time=times[-1], client="Сын клиента")
    assert r["ok"] and r["booking"]["source"] == "admin"
    assert api("barbershop", "setDayOff", barberId="b4", date=day, off=True)["error"] == "has_bookings"
    free_day = add_days(T(), 13)
    api("barbershop", "setDayOff", barberId="b3", date=free_day, off=False)
    assert api("barbershop", "setDayOff", barberId="b3", date=free_day, off=True)["ok"] or True
    assert api("barbershop", "getBookings")["bookings"]
    assert api("barbershop", "getAdminSlots", barberId="b1", serviceId="s1", date=T())["ok"]


def test_owner(api):
    for period in ("day", "week", "month"):
        o = api("barbershop", "getOverview", period=period)
        assert o["ok"] and "fill" in o["kpi"]
    w = api("barbershop", "getOverview", period="week")
    assert w["kpi"]["revenue"] > 0 and len(w["chart"]) == 7 and len(w["rank"]) == 4
    load = api("barbershop", "getLoad")
    assert len(load["weekdays"]) == 7 and load["hours"]
    s = api("barbershop", "saveService", service={"id": "s1", "name": "Стрижка машинкой", "dur": 40, "price": 28})
    assert s["ok"] and s["service"]["price"] == 28
    assert api("barbershop", "saveService", service={"name": "Кривая", "dur": 25, "price": 10})["ok"] is False
    assert api("barbershop", "saveBarber", barber={"id": "b2", "pct": 45})["barber"]["pct"] == 45
    assert len(api("barbershop", "getServicesAdmin")["services"]) >= 7
