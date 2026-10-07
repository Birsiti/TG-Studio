# изменено 2026-10-08 02:15
"""API студии TG-Studio: один процесс на все боты.

Запуск:  uvicorn server:app --port 8097   (из папки api/)

  POST /api/<бот>   тело {action, userId, ...}, Content-Type text/plain
                    (простой CORS-запрос без preflight) → {ok, ...}
  GET  /health      проверка живости
"""
from __future__ import annotations

import json
import logging
import os
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool

from core import ApiError, iso_now
from bots import BOTS

log = logging.getLogger("tgs-api")

MAX_BODY = 64 * 1024
RATE_WINDOW = 60.0
RATE_ALL = int(os.environ.get("TGS_RATE_ALL", "120"))      # запросов в минуту с одного IP
RATE_WRITE = int(os.environ.get("TGS_RATE_WRITE", "30"))   # изменяющих запросов в минуту

ORIGIN_RE = r"^https://([a-z0-9-]+\.)*github\.io$|^https://([a-z0-9-]+\.)*tg-studio\.xyz$|^https?://(localhost|127\.0\.0\.1)(:\d+)?$"

app = FastAPI(title="TG-Studio API", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=ORIGIN_RE,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
    max_age=86400,
)


class RateLimiter:
    """Скользящее окно по IP, в памяти процесса."""

    def __init__(self):
        self.hits: dict[str, deque] = defaultdict(deque)
        self.lock = Lock()
        self.last_sweep = time.monotonic()

    def allow(self, key: str, limit: int) -> bool:
        t = time.monotonic()
        with self.lock:
            q = self.hits[key]
            while q and t - q[0] > RATE_WINDOW:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(t)
            if t - self.last_sweep > 300:
                for k in [k for k, v in self.hits.items() if not v or t - v[-1] > RATE_WINDOW]:
                    del self.hits[k]
                self.last_sweep = t
            return True

    def reset(self):
        with self.lock:
            self.hits.clear()


limiter = RateLimiter()


def client_ip(request: Request) -> str:
    # За Cloudflare Tunnel реальный адрес — в cf-connecting-ip
    ip = request.headers.get("cf-connecting-ip")
    if not ip:
        xff = request.headers.get("x-forwarded-for", "")
        ip = xff.split(",")[0].strip() if xff else ""
    if not ip and request.client:
        ip = request.client.host
    return (ip or "unknown")[:64]


def fail(code: str, status: int = 200, message: str = "") -> JSONResponse:
    body = {"ok": False, "error": code}
    if message:
        body["message"] = message
    return JSONResponse(body, status_code=status)


@app.get("/health")
def health():
    return {"ok": True, "time": iso_now(), "bots": sorted(BOTS)}


@app.post("/api/{bot_name}")
async def handle(bot_name: str, request: Request):
    bot = BOTS.get(bot_name)
    if bot is None:
        return fail("unknown_bot", 404)

    ip = client_ip(request)
    if not limiter.allow("all:" + ip, RATE_ALL):
        return fail("rate_limited", 429)

    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_BODY:
        return fail("too_large", 413)
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_BODY:
            return fail("too_large", 413)
        chunks.append(chunk)
    try:
        payload = json.loads(b"".join(chunks).decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return fail("bad_json", 400)
    if not isinstance(payload, dict) or not isinstance(payload.get("action"), str):
        return fail("bad_request", 400)

    action = payload["action"]
    act = bot.actions.get(action)
    if act is None:
        return fail("unknown_action", 400)
    if act.write and not limiter.allow("w:" + ip, RATE_WRITE):
        return fail("rate_limited", 429)

    try:
        result = await run_in_threadpool(bot.handle, action, payload, ip)
    except ApiError as e:
        return fail(e.code, e.status, e.message)
    except Exception:  # noqa: BLE001 — не отдаём трейсбек наружу
        log.exception("action %s/%s failed", bot_name, action)
        return fail("server_error", 500)

    # обработчик может вернуть фоновую задачу (например, переслать заявку
    # дальше) — она выполнится после ответа клиенту, уже после COMMIT
    bg = result.pop("_background", None)
    return JSONResponse(result, background=BackgroundTask(bg) if bg else None)
