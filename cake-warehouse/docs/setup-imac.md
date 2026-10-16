<!-- изменено 2026-10-16 22:50 -->
# Установка на iMac

Всё работает на iMac: API (Python) с базой SQLite и бот (Node.js).
Наружу API открыт через Cloudflare Tunnel (`https://api.tg-studio.xyz`),
бот сам ходит в Telegram — входящих соединений ему не нужно.

## 1. Что нужно

```bash
brew install python@3.12 node
git clone https://github.com/birsiti/TG-Studio.git ~/tg-studio
```

## 2. API

Общая установка API студии — `api/README.md` (venv, launchd, туннель).
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
Проверка: `curl https://api.tg-studio.xyz/health` → в списке есть `cake`.

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
launchctl kickstart -k gui/$(id -u)/xyz.tg-studio.api
cd cake-bot && npm install && launchctl kickstart -k gui/$(id -u)/com.tgstudio.cake-bot
```

## Бэкап

```bash
sqlite3 "$TGS_DATA_DIR/cake.db" ".backup $HOME/backup/cake-$(date +%F).db"
```

Хорошо добавить в cron/launchd раз в день.

## Смена токена бота

@BotFather → `/revoke` → новый токен → `bash cake-bot/install.sh`,
на вопрос «Заменить?» ответить `y`. Скрипт обновит бота и API.

Код и страницы трогать не нужно.

## Если что-то не работает

| Признак | Что проверить |
|---|---|
| В приложении «Демо-режим» | API запущен? `curl …/health`; туннель Cloudflare |
| «Откройте приложение из бота» | Открыто по ссылке, а не кнопкой; или токен в API от другого бота |
| «Нет доступа к складу» | Telegram id человека в справочнике «Люди» или в `TGS_CAKE_ADMINS` |
| Бот молчит | `npm run check`; `err.log`; не запущен ли этот бот ещё где-то |
| Нет уведомлений | У водителя/кладовщика заполнен Telegram id и он нажал /start в боте |
