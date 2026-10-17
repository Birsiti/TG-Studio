<!-- изменено 2026-10-17 17:00 -->
# Разработка

## Правило размера

Файл — одна тема и не больше ~200 строк. Растёт — делим по смыслу
(вкладка, модуль API, раздел схемы). Исключение — сгенерированные данные
(`seed.sql`, каталог в `mock-data.js`).

## Структура

```
cake-warehouse/                 Mini App (GitHub Pages)
  sklad.html  driver.html  admin.html   разметка экранов (имена не менять — на них кнопки бота)
  brand.css                      фирменный слой поверх ../kit/base.css
  js/common.js                   window.Cake: API, справочники, остатки, помощники
  js/sklad-stock.js              вкладка «Остатки»
  js/sklad-income.js             вкладка «Приход»
  js/sklad-pick.js               вкладка «Сборка»: заявки, лист по кругу, весь маршрут
  js/sklad-pick-edit.js          ввод заявки, места на складе
  js/sklad-pick-files.js         фото и файлы заявки (сжатие в телефоне)
  mock-files.js                  демо: файлы заявок в localStorage, finishAll
  js/sklad-trips.js              вкладка «Рейсы»
  js/sklad-tara.js               вкладка «Ящики»
  js/sklad-log.js                вкладка «Журнал»
  js/sklad-main.js               запуск экрана кладовщика
  js/driver.js  js/admin.js      экраны водителя и руководителя
  proverka.html js/proverka*.js  проверка карты склада по фото (karta-draft.js из db/places-photos.csv)
  mock-data.js                   демо: каталог (генерируется), справочники, история
  mock.js                        демо: двойник API в localStorage (CakeMock.register — для других тем)
  mock-orders.js                 демо: точки и заявки с фото (генерируется db/gen_mock_orders.py)
  mock-picking.js                демо: действия сборки
  mock-drivers.js                демо: спидометр и статистика водителей (двойник drivers.py)
  js/admin-drivers.js            руководитель: вкладка «Водители»
  db/                            SQL-база под маршруты, листы сборки по кругу
  docs/                          эта документация
  source/                        фото заявок клиента
  karta-sklada.xlsx              бланк карты склада

api/bots/cake/                  API (FastAPI + SQLite, общий сервер студии api/)
  __init__.py   bot и регистрация модулей
  schema.py     таблицы и константы        catalog.py   ассортимент и демо-справочники
  base.py       доступ, выдача JSON, общие проверки
  refs.py  stock.py  trips.py  tara.py  shifts.py  overview.py  picking.py  drivers.py   действия по темам
  orders_data.py  orders_seed.py  заявки с фото (общие с db/) и их перенос в базу
  seed.py       демо-данные при первом запуске
api/tests/test_cake.py, test_cake_picking.py   тесты API

cake-bot/                       Telegram-бот (Node 18+, iMac)
  src/   config, telegram, api, store, roles, events, texts, commands, watch, digest-job, index
  test/  логика без Telegram
```

Порядок скриптов на странице кладовщика: `telegram-web-app.js` →
`../kit/core.js` → `mock-data.js` → `mock-orders.js` → `mock.js` → `mock-drivers.js` → `mock-picking.js` → `js/common.js` →
вкладки → `js/sklad-main.js`. Вкладка регистрирует отрисовку в
`Cake.tabs.<имя>`, общие данные — `Cake.refs`, `Cake.stock`.

## Тесты

```bash
cd api && python3 -m pytest -q                 # API, все боты студии
cd cake-bot && npm test                        # логика бота
python3 cake-warehouse/db/check_db.py          # SQL-схема, заявки = «Итого» накладных
```

Интерфейс проверяется в браузере на ширине 375 px, светлая и тёмная
тема, в двух режимах:
- с API: `python3 -m http.server` в корне, API на `:8097`, страница с `?api=http://localhost:8097`;
- демо: адрес API недоступен → работает `mock.js`.

## Как добавить

**Действие API.** В модуле по теме:
```python
@action("name", write=True)          # write — транзакция на запись
def name(ctx: Ctx, p: dict) -> dict:
    ...
    return {"result": ...}           # сервер добавит ok: true
```
Ошибка — `raise ApiError("code", "текст")`. Такое же действие — в
`mock.js` (объект `A`) с **теми же проверками и текстами ошибок**, иначе демо
ведёт себя иначе, чем сервер. Тест — в `test_cake.py`. Если действие нужно
водителю — добавить в `DRIVER_ACTIONS` (`base.py`), иначе водитель получит
`forbidden`.

**Колонку в существующую таблицу.** Только через `migrate_picking`
(`orders_seed.py`): `PRAGMA table_info` → `ALTER TABLE`, разовые данные — под
флагом в `meta`. На iMac рабочая база, пересоздавать её нельзя.

**Вкладку кладовщика.** Секция `<section data-panel="x">` и кнопка
`data-tab="x"` в `sklad.html`, файл `js/sklad-x.js` по образцу соседних
(обёртка, `Cake.tabs.x = render`), подключить перед `sklad-main.js`.

**Товар в каталог.** `api/bots/cake/catalog.py` → затем
`python3 cake-warehouse/db/gen_mock_catalog.py` (демо) и
`python3 cake-warehouse/db/build_seed.py` (SQL-база).

## Выкладка

1. Тесты (выше) и проверка в браузере.
2. `python3 cake-warehouse/db/bump_version.py` — метка `?v=` на скрипты,
   иначе Telegram минут 10 показывает старые файлы.
3. Коммит и push в `cake-warehouse`.
4. Страницы: скопировать изменённые файлы `cake-warehouse/` (и `kit/core.js`,
   если менялся) в рабочую копию ветки `gh-pages` (`git worktree add … origin/gh-pages`),
   коммит, `git push origin <ветка>:gh-pages`. Сверить `cmp` — ничего не забыто.
5. Сервер и бот на iMac — по порядку из [status.md](status.md#как-обновляется-imac).

Сценарии в браузере (Playwright) с API: перед каждым сценарием свежая база
и перезапуск сервера — иначе 429 (лимит запросов) или старый процесс на
удалённой базе («no such table»). Быстрые клики по строкам сборки с живым
сервером — ждать ответа, кнопки шторки перерисовываются.

## Соглашения студии

- Первая строка изменённого файла — `изменено ГГГГ-ММ-ДД ЧЧ:ММ`.
- Стиль и компоненты Mini App — skill `miniapp-style`, общий код — `kit/`.
- Без hover, кнопки ≥44 px, поля ≥16 px, иконки только SVG (`Kit.icon`).
- Секреты — только в окружении на iMac, никогда в репозитории.
