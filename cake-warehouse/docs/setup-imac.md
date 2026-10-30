<!-- изменено 2026-10-17 01:20 -->
# Установка на iMac

Всё работает на iMac: API (Python) с базой SQLite и бот (Node.js).
Наружу API открывается через Cloudflare Tunnel (`https://api.tg-studio.xyz`;
на iMac пока **не подключён** — есть туннели budni и spihki, решает Денис;
без него страницы на github.io работают в демо-режиме),
бот сам ходит в Telegram — входящих соединений ему не нужно.

## 1. Что нужно

Python 3.12 и Node.js 18–20, клон репозитория:

```bash
brew install python@3.12 node
git clone https://github.com/birsiti/TG-Studio.git ~/tg-studio
```

**macOS 10.15 Catalina (наш iMac).** brew эту систему не поддерживает и
собирает всё из исходников — не использовать.
- Python 3.12 — установщик `.pkg` с python.org → `/usr/local/bin/python3.12`.
- Node — **только ветка 20** (Node 22+ на Catalina не запускается), готовая
  сборка в `~/.local/node`:
  ```bash
  V=v20.20.2   # последняя 20.x с nodejs.org/dist/latest-v20.x/
  mkdir -p ~/.local && cd ~/.local
  curl -fsSLO https://nodejs.org/dist/$V/node-$V-darwin-x64.tar.gz
  tar xzf node-$V-darwin-x64.tar.gz && rm node-$V-darwin-x64.tar.gz
  ln -sfn node-$V-darwin-x64 node
  echo 'export PATH="$HOME/.local/node/bin:$PATH"' >> ~/.zprofile
  ```
  Новый терминал (или по ssh `export PATH="$HOME/.local/node/bin:$PATH"`)
  перед `install.sh` — скрипт возьмёт путь к node и пропишет его в автозапуск.

## 2. API

Общая установка API студии — `api/README.md` (venv, launchd, туннель).
**Порт 8098**: 8097 на iMac занят витриной studio.tg-studio.xyz
(`~/tgstudio-bot`, `uvicorn web:app`) — её не трогать. В plist API —
`--port 8098`, проверка — `curl http://127.0.0.1:8098/health`; в
`cake-bot/.env` — `API_URL=http://127.0.0.1:8098/api/cake` (по умолчанию).
Для склада в plist API (`~/Library/LaunchAgents/xyz.tg-studio.api.plist`,
раздел `EnvironmentVariables`) добавьте:

| Переменная | Значение | Зачем |
|---|---|---|
| `TGS_CAKE_BOT_TOKEN` | токен бота от @BotFather | Проверка подписи Telegram: без неё сервер не отвечает |
| `TGS_CAKE_ADMINS` | Telegram id руководителей через запятую | Кто руководитель; остальные — из справочника «Люди» |
| `TGS_CAKE_SERVICE_KEY` | `openssl rand -hex 24` | Ключ, по которому бот ходит в API |

Без этих переменных склад работает как открытое демо — для запуска
обязательны все три.

Перезапуск: `launchctl kickstart -k gui/$(id -u)/xyz.tg-studio.api`.
Проверка: `curl http://127.0.0.1:8098/health` → в списке есть `cake`
(снаружи, когда будет туннель, — `curl https://api.tg-studio.xyz/health`).
На iMac (HDD, диск заполнен на 99%) холодный запуск API — **до 2 минут**: время
уходит на чтение FastAPI с диска, сам код грузится за 0,5 с. Перед перезапуском
прогрейте: `(cd ~/tg-studio/api && .venv/bin/python -c "import server")` — тогда
перезапуск занимает секунды. В plist API и бота нужен
`ProcessType=Interactive` (его ставит `install.sh`): без него launchd
запускает их как фоновые с урезанным диском — старт 29 с вместо 1 с.
После перезапуска ждите `/health` в цикле:
`until curl -sf http://127.0.0.1:8098/health >/dev/null; do sleep 5; done`

База: `TGS_DATA_DIR/cake.db`. При первом запуске она создаётся с
демо-данными. **Перед боевым запуском** остановите API, удалите
`cake.db`, `cake.db-wal`, `cake.db-shm`, замените демо-справочники в
`api/bots/cake/catalog.py` (или заведите через «Справочники») и запустите.

## 3. Бот

Как в проекте такси: бот живёт на iMac (`.env` + автозапуск launchd), без LEADTEX.
Одна команда:

```bash
cd ~/tg-studio/cake-bot && bash install.sh
```

Скрипт спросит токен (ввод скрыт), снимет чужой webhook, попросит
написать боту `/start` с телефона руководителя и сам возьмёт его id,
запишет `.env` (с новым `SERVICE_KEY`), впишет те же значения в plist API
и перезапустит его, поставит автозапуск бота и покажет `npm run check`.
Повторный запуск безопасен — так же меняется токен.

Если API студии на iMac не установлен, бот всё равно ответит
руководителю кнопками, а экраны откроются в демо-режиме.

Вручную: `cp .env.example .env`, заполнить, `npm run check`, `npm start`.
Логи — `cake-bot/out.log`, `err.log`.

## 4. Страницы

Страницы публикуются на GitHub Pages
(`https://birsiti.github.io/TG-Studio/cake-warehouse/sklad.html` и т.д.)
после попадания ветки в основную. Бот сам показывает кнопки на них.
Постоянная кнопка меню — @BotFather → Bot Settings → Menu Button.

> Если склад подключён в LEADTEX тем же токеном — бот `cake-bot` нельзя
> запускать одновременно: Telegram отдаёт сообщения только одному.

## Обновление

```bash
cd ~/tg-studio && git pull
(cd api && .venv/bin/python -c "import server")   # прогрев: файлы в кэш ОС, пока старый API ещё работает
launchctl kickstart -k gui/$(id -u)/xyz.tg-studio.api
cd cake-bot && npm install && launchctl kickstart -k gui/$(id -u)/com.tgstudio.cake-bot
# ждём готовности API (с прогревом — секунды, без него на iMac до 2 минут)
until curl -sf http://127.0.0.1:8098/health >/dev/null; do sleep 5; done
npm run check
```

## Бэкап

```bash
sqlite3 "$TGS_DATA_DIR/cake.db" ".backup $HOME/backup/cake-$(date +%F).db"
```

Хорошо добавить в cron/launchd раз в день.

## Смена токена бота

@BotFather → `/revoke` → новый токен → `bash cake-bot/install.sh`,
на вопрос «Заменить?» ответить `y`. Скрипт обновит бота и API.

Без терминала (по ssh, через Claude Code) вопрос не задаётся и старый
токен остаётся — новый передаётся только так:
```bash
cd ~/tg-studio/cake-bot && CAKE_TOKEN='новый токен' bash install.sh </dev/null
```
id руководителя и служебный ключ возьмутся из `.env`.

Код и страницы трогать не нужно.

## Если что-то не работает

| Признак | Что проверить |
|---|---|
| В приложении «Демо-режим» | API запущен? `curl …/health`; туннель Cloudflare |
| «Откройте приложение из бота» | Открыто по ссылке, а не кнопкой; или токен в API от другого бота |
| «Нет доступа к складу» | Telegram id человека в справочнике «Люди» или в `TGS_CAKE_ADMINS` |
| Бот молчит | `npm run check`; `err.log`; не запущен ли этот бот ещё где-то |
| Нет уведомлений | У водителя/кладовщика заполнен Telegram id и он нажал /start в боте |
