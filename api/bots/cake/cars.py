# изменено 2026-10-25 21:00
"""Парк: машины, кто за рулём (меняет руководитель), занятость в пути.
Машина — строка «марка · госномер», как в staff.car и trips.car; отдельный список (cars) — для машин без водителя."""
from __future__ import annotations

from core import ApiError, Ctx, iso_now, one, rows, scalar, v_id, v_str
from bots.cake.base import action


def in_transit(conn, driver: str | None = None, car: str | None = None, skip: str | None = None) -> dict | None:
    """Рейс «в пути» (отгружен, водитель ещё не сдал отчёт), в котором уже занят водитель или машина."""
    for col, val in (("driver_id", driver), ("car", car)):
        if val:
            r = one(conn, f"SELECT id, num, driver_id, car FROM trips WHERE {col}=? AND status='shipped' AND seed=0 AND id<>? ORDER BY num DESC LIMIT 1", (val, skip or ""))
            if r:
                return {**r, "by": col}
    return None


def fleet(conn) -> list[dict]:
    names = {}
    for r in rows(conn, "SELECT car FROM cars"):
        names.setdefault(r["car"], None)
    for r in rows(conn, "SELECT id, name, car FROM staff WHERE role='driver' AND active=1 AND car<>'' ORDER BY name"):
        names[r["car"]] = r  # за машиной закреплён водитель
    for r in rows(conn, "SELECT DISTINCT car FROM trips WHERE car<>'' AND status<>'cancelled'"):
        names.setdefault(r["car"], None)
    out = []
    for car, who in names.items():
        busy = one(conn, "SELECT num FROM trips WHERE car=? AND status='shipped' AND seed=0 ORDER BY num DESC LIMIT 1", (car,))
        out.append({"car": car, "driverId": who["id"] if who else None, "driverName": who["name"] if who else "",
                    "busy": busy["num"] if busy else None})
    return sorted(out, key=lambda x: x["car"].lower())


@action("getCars")
def get_cars(ctx: Ctx, p: dict) -> dict:
    return {"cars": fleet(ctx.conn)}


@action("saveCar", write=True)
def save_car(ctx: Ctx, p: dict) -> dict:
    """Завести машину и/или посадить за руль водителя. driverId пустой — машина без водителя.
    Машина одна на водителя: прежняя машина водителя остаётся в парке, прежний водитель этой машины освобождается."""
    c = ctx.conn
    car = v_str(p, "car", min_len=3, max_len=80)
    c.execute("INSERT OR IGNORE INTO cars(car, created_at) VALUES(?,?)", (car, iso_now()))
    if "driverId" in p:
        did = v_id(p, "driverId", required=False) or None
        if did:
            if not scalar(c, "SELECT 1 FROM staff WHERE id=? AND role='driver' AND active=1", (did,)):
                raise ApiError("not_found", "Нет такого водителя")
            busy = in_transit(c, driver=did)
            if busy and busy["car"] != car:
                raise ApiError("bad_state", f"Этот водитель сейчас в рейсе №{busy['num']}: сначала он должен вернуться")
            old = scalar(c, "SELECT car FROM staff WHERE id=?", (did,))
            if old and old != car:
                c.execute("INSERT OR IGNORE INTO cars(car, created_at) VALUES(?,?)", (old, iso_now()))
        c.execute("UPDATE staff SET car='' WHERE car=? AND role='driver' AND id IS NOT ?", (car, did))
        if did:
            c.execute("UPDATE staff SET car=? WHERE id=?", (car, did))
    return {"cars": fleet(c)}
