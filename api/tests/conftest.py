# изменено 2026-10-08 02:30
import os
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ["TGS_DATA_DIR"] = tempfile.mkdtemp(prefix="tgs-test-")
os.environ.setdefault("TGS_RATE_ALL", "100000")
os.environ.setdefault("TGS_RATE_WRITE", "100000")

from fastapi.testclient import TestClient  # noqa: E402

import server  # noqa: E402
from bots import BOTS  # noqa: E402


@pytest.fixture(scope="module")
def client():
    for b in BOTS.values():
        b.reset()
    server.limiter.reset()
    with TestClient(server.app) as c:
        yield c


def call(tc, bot, action, /, user="web-testuser01", **payload):
    body = {"action": action, **payload}
    if user is not None:
        body["userId"] = user
    import json
    r = tc.post(f"/api/{bot}", content=json.dumps(body), headers={"Content-Type": "text/plain;charset=utf-8"})
    return r.json()


@pytest.fixture
def api(client):
    def _f(bot, action, /, user="web-testuser01", **payload):
        return call(client, bot, action, user=user, **payload)
    return _f
