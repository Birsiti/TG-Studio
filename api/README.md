<!-- изменено 2026-10-08 02:15 -->
<!-- изменено -->
# API студии TG-Studio

Один процесс на Python 3.12 (FastAPI + SQLite) обслуживает все демо-боты
студии. У каждого бота — своя база `data/<бот>.db`, создаётся и
засеивается красивыми демо-данными при первом запросе (включая историю за
месяц, чтобы аналитика владельца не была пустой). Раз в сутки демо
«освежается»: прошедшие записи закрываются, на ближайшие дни досеиваются новые.

## Быстрый старт

```bash
cd api
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --port 8097
curl http://localhost:8097/health
pytest -q            # тесты всех ботов
```

## Протокол

```
POST /api/<бот>        тело: {"action": "...", "userId": "...", ...payload}
                       Content-Type: text/plain (простой CORS-запрос без preflight)
                       ответ: {"ok": true, ...} | {"ok": false, "error": "code"}
GET  /health           {"ok": true, "time": ..., "bots": [...]}
```

Боты: `carwash`, `toolrent`, `versta`, `barbershop`, `most`, `studio`.

- **userId** — `tg.initDataUnsafe.user.id` из Telegram, вне Telegram —
  постоянный `web-…` id из localStorage (это делает `kit/core.js`).
- **CORS** — `*.github.io`, `*.tg-studio.xyz`, `localhost`/`127.0.0.1`.
- **Лимит частоты** — по IP (`cf-connecting-ip`, затем `x-forwarded-for`):
  120 запросов/мин, из них 30 изменяющих. Ответ 429 `rate_limited`.
- **Тело** ≤ 64 КБ (413 `too_large`).
- **Валидация** всех полей на сервере (`core.py`: `v_str`, `v_phone`, `v_date`…),
  **цены считает сервер**, слоты пишутся атомарно (`BEGIN IMMEDIATE` +
  уникальные индексы).
- **Публичное демо**: у таблиц есть потолок строк; при переполнении
  удаляются самые старые пользовательские строки (`seed=0`), демо-данные
  не трогаются. Плюс лимиты на пользователя (активные записи, машины и т.п.).
- Коды ошибок: `bad_request`, `bad_json`, `unknown_action`, `unknown_bot`,
  `no_user`, `not_found`, `slot_unavailable`, `limit`, `too_many`,
  `rate_limited`, `too_large`, `server_error`.

Фронт (`kit/core.js` → `Kit.createApi`) при недоступности API тихо
переключается на моки (`<бот>/mock.js`) — демо никогда не ломается.
Для локальной проверки фронта с живым API: `…/client.html?api=http://localhost:8097`.

## Переменные окружения

| Переменная | По умолчанию | Что делает |
|---|---|---|
| `TGS_DATA_DIR` | `api/data` | Где лежат базы `*.db` |
| `TGS_RATE_ALL` | `120` | Запросов в минуту с IP |
| `TGS_RATE_WRITE` | `30` | Изменяющих запросов в минуту с IP |
| `TGS_LEADS_WEBHOOK` | `https://tg-studio-leads.birsiti.workers.dev` | Куда пересылать заявки studio (пусто — не пересылать) |

## Структура

```
server.py        HTTP: маршрут /api/<бот>, CORS, лимиты, размер тела
core.py          SQLite на бота, реестр action, валидация, сид/освежение
bots/<бот>.py    схема, демо-данные и обработчики action
tests/           pytest (FastAPI TestClient) — на каждого бота
```

Новый action: `@bot.action("name", write=True)` в `bots/<бот>.py`, функция
`(ctx, payload) -> dict`. `write=True` — транзакция `BEGIN IMMEDIATE`.

## Сброс демо

Остановить сервер и удалить `data/<бот>.db` (+ `-wal`, `-shm`) — при
следующем запросе база создастся заново с демо-данными.

## Выкатка на iMac (api.tg-studio.xyz)

1. Python 3.12: `brew install python@3.12`.
2. Код: `git clone https://github.com/birsiti/TG-Studio.git ~/tg-studio && cd ~/tg-studio/api`,
   затем venv и `pip install -r requirements.txt` (см. «Быстрый старт»).
3. Автозапуск через launchd — `~/Library/LaunchAgents/xyz.tg-studio.api.plist`:

   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0"><dict>
     <key>Label</key><string>xyz.tg-studio.api</string>
     <key>WorkingDirectory</key><string>/Users/USER/tg-studio/api</string>
     <key>ProgramArguments</key><array>
       <string>/Users/USER/tg-studio/api/.venv/bin/uvicorn</string>
       <string>server:app</string><string>--host</string><string>127.0.0.1</string>
       <string>--port</string><string>8097</string><string>--proxy-headers</string>
     </array>
     <key>EnvironmentVariables</key><dict><key>TGS_DATA_DIR</key><string>/Users/USER/tg-studio-data</string></dict>
     <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
     <key>StandardOutPath</key><string>/Users/USER/Library/Logs/tgs-api.log</string>
     <key>StandardErrorPath</key><string>/Users/USER/Library/Logs/tgs-api.log</string>
   </dict></plist>
   ```

   `launchctl load ~/Library/LaunchAgents/xyz.tg-studio.api.plist`
4. Наружу — Cloudflare Tunnel: `cloudflared tunnel create tgs-api`,
   в `~/.cloudflared/config.yml` — `ingress: - hostname: api.tg-studio.xyz
   service: http://127.0.0.1:8097` и `- service: http_status:404`, затем
   `cloudflared tunnel route dns tgs-api api.tg-studio.xyz` и
   `sudo cloudflared service install`. Cloudflare сам передаёт
   `cf-connecting-ip` — по нему считается лимит частоты.
5. Проверка: `curl https://api.tg-studio.xyz/health`.
6. Бэкап: базы — обычные файлы SQLite; горячая копия:
   `sqlite3 data/carwash.db ".backup backup/carwash-$(date +%F).db"`.
7. Обновление: `git pull && launchctl kickstart -k gui/$(id -u)/xyz.tg-studio.api`.

## Ограничения демо

- `initDataUnsafe` не проверяется по подписи бота — для публичного демо
  этого достаточно; для боевого клиента нужно проверять `initData`
  (HMAC с токеном бота) и закрыть admin/owner-action по списку id.
- Админские и владельческие action не требуют авторизации — это витрина.
