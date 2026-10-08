# изменено 2026-10-08 03:22
import httpx
import pytest

import importlib

studio = importlib.import_module("bots.studio")  # модуль, а не одноимённый объект Bot из bots/__init__

KEY = "owner-secret"
LEAD = {"name": "Анна", "phone": "+375291234567", "business": "Кофейня", "task": "Предзаказ кофе в Telegram", "budget": "До 500 BYN"}


@pytest.fixture
def hook(monkeypatch):
    """Перехват пересылки на воркер: копим отправленные JSON."""
    sent = []

    class Resp:
        status_code = 200

        def json(self):
            return {"ok": True}

    def fake_post(url, json=None, **kw):
        sent.append((url, json))
        return Resp()

    monkeypatch.setattr(studio, "WEBHOOK", "https://hook.example/leads")
    monkeypatch.setattr(httpx, "post", fake_post)
    return sent


@pytest.fixture(autouse=True)
def owner_key(monkeypatch):
    monkeypatch.setattr(studio, "STUDIO_KEY", KEY)


def test_lead_saved_and_forwarded(api, hook):
    r = api("studio", "createLead", tg_id="123456", **LEAD)
    assert r["ok"] and r["id"].startswith("L-")
    assert "_background" not in r
    # тот же JSON, что раньше слал order-bot
    assert hook == [("https://hook.example/leads", {**LEAD, "tg_id": "123456"})]
    leads = api("studio", "getLeads", key=KEY)["leads"]
    mine = next(x for x in leads if x["id"] == r["id"])
    assert mine["forwarded"] is True and mine["status"] == "new"


def test_lead_kept_when_webhook_down(api, monkeypatch):
    def boom(*a, **kw):
        raise httpx.ConnectError("down")
    monkeypatch.setattr(studio, "WEBHOOK", "https://hook.example/leads")
    monkeypatch.setattr(httpx, "post", boom)
    r = api("studio", "createLead", **LEAD)
    assert r["ok"]
    mine = next(x for x in api("studio", "getLeads", key=KEY)["leads"] if x["id"] == r["id"])
    assert mine["forwarded"] is False


def test_lead_validation(api, hook):
    assert api("studio", "createLead", **{**LEAD, "phone": "+79991234567"})["error"] == "bad_request"
    assert api("studio", "createLead", **{**LEAD, "task": "x"})["error"] == "bad_request"
    assert api("studio", "createLead", **{**LEAD, "budget": "миллион"})["error"] == "bad_request"
    assert hook == []


def test_lead_status(api, hook):
    lid = api("studio", "createLead", **LEAD)["id"]
    assert api("studio", "setLeadStatus", id=lid, status="won")["error"] == "not_found"  # без ключа — чужие заявки не трогаем
    r = api("studio", "setLeadStatus", id=lid, status="contacted", note="Созвонились", key=KEY)
    assert r["lead"]["status"] == "contacted" and r["lead"]["note"] == "Созвонились"
    assert api("studio", "getLeads", status="contacted", key=KEY)["counts"]["contacted"] >= 1
    assert api("studio", "setLeadStatus", id="L-nope", status="won")["error"] == "not_found"


def test_dashboard_and_pause(api):
    d = api("studio", "getDashboard", logLimit=10)
    s = d["stats"]
    assert d["ok"] and s["sentTotal"] > 300 and len(s["daily"]) == 14 and len(d["log"]) == 10
    assert s["companiesTotal"] == sum(n[2] for n in studio.NICHES.values())
    assert 0 < s["bounceRatePct"] < 10
    assert api("studio", "updateConfig", paused=True)["config"]["paused"] is True
    assert api("studio", "getDashboard")["stats"]["paused"] is True
    assert api("studio", "updateConfig", dailyLimit=1)["error"] == "bad_request"
    assert api("studio", "updateConfig", dailyLimit=60)["config"]["dailyLimit"] == 60


def test_companies_search(api):
    r = api("studio", "getCompanies", niche="Барбершопы")
    assert r["companies"] and all(c["niche"] == "Барбершопы" for c in r["companies"])
    q = api("studio", "getCompanies", q="БАРБЕР")["companies"]
    assert q and all("барбер" in c["company"].lower() for c in q)


def test_lead_flood_limited(client, hook):
    import json
    body = json.dumps({"action": "createLead", **LEAD})
    res = [client.post("/api/studio", content=body, headers={"cf-connecting-ip": "203.0.113.7"}).json() for _ in range(6)]
    assert all(r["ok"] for r in res[:5]) and res[5]["error"] == "rate_limited"


def test_real_leads_hidden_without_key(api, hook):
    lid = api("studio", "createLead", **{**LEAD, "phone": "+375297654321"})["id"]
    public = api("studio", "getLeads")
    assert public["owner"] is False and public["leads"] and all(x["id"] != lid for x in public["leads"])
    assert all(x["phone"] != "+375297654321" for x in public["leads"])
    assert api("studio", "getLeads", key="wrong")["owner"] is False
    owner = api("studio", "getLeads", key=KEY)
    assert owner["owner"] is True and any(x["id"] == lid for x in owner["leads"])
