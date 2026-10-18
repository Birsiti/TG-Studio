<!-- изменено 2026-10-18 16:30 -->
# API склада

```
POST https://api.tg-studio.xyz/api/cake
Content-Type: text/plain;charset=utf-8          (простой CORS-запрос без preflight)
{"action": "getStock", "userId": "...", "initData": "...", ...параметры}
→ {"ok": true, ...}  |  {"ok": false, "error": "код", "message": "текст"}
```

Код: `api/bots/cake/` (по модулю на тему), тесты: `api/tests/test_cake.py`.
Из страниц запросы шлёт `Kit.createApi` (`kit/core.js`): сам добавляет
`userId` и, внутри Telegram, `initData`. Если сервер недоступен —
тихо переходит на `mock.js` (тот же контракт в браузере).

## Доступ (`base.py`)

1. `serviceKey` = `TGS_CAKE_SERVICE_KEY` → пропуск (бот склада).
2. Задан `TGS_CAKE_BOT_TOKEN` → нужен `initData`, подписанный этим ботом
   (HMAC, не старше 24 ч); пользователь берётся из подписи.
3. Задан `TGS_CAKE_ADMINS` → пускаются эти id и активные сотрудники с
   этим `tgId`. Иначе — открытое демо.

## Справочники (`refs.py`)

| Действие | Параметры | Ответ |
|---|---|---|
| `getRefs` | — | `products`, `cities`, `staff`, `tara`, `moveTypes`, `cats` |
| `getMe` | — | `staff` (кто я по Telegram id или null), `restricted` |
| `saveProduct` | `id?`, `name`, `cat`, `sku`, `weightG` (обязателен — вес с упаковки), `shelfDays`, `minQty`, `perBox` (шт в 1 грузовом месте, по умолчанию 1), `active` | `product`; при правке не переданные вес и `perBox` остаются прежними |
| `saveCity` | `id?`, `name`, `code`, `active` | `city` |
| `reportStop` | `orderId` (точка рейса в пути), `lines` [{productId, short, spoiled, resort, resortTo?}], `comment` — водитель только своего рейса | `trip` (точки с `report`) |
| `addStopPhoto` | `orderId`, `mime` (фото), `data` (base64) — до 6 фото с точки | `file` |
| `shipTrip` | `id`, `taraBack?` [{taraId, qty}] — ящики с прошлых рейсов, сданные на погрузке (не больше долга водителя) | `trip` |
| `setTripOrders` | `id` (рейс на сборке), `orderIds` — заявки по порядку объезда (той же даты, не в другом рейсе; `[]` — снять) | `trip` |
| `logVisit` | `tgId`, `name?`, `username?` — бот (служебный ключ), человек написал боту | `isNew` |
| `hello` | `page` (`sklad`/`admin`/`driver`) — страница открылась, пишет `ctx.user` | — |
| `getVisits` | `limit?` — только руководитель | `people` (tgId, имя, @ник, роль или null, первый/последний вход, бот/приложение), `log` |
| `saveStaff` | `id?`, `name`, `role` (`storekeeper`/`driver`), `phone` (+375…), `car`, `hired` (наёмный, только водитель), `carrier` (фирма-перевозчик, только у наёмного), `tgId` (цифры), `active` | `staff` |
| `saveTara` | `id?`, `name`, `total`, `active` | `tara` |

Без `id` — создать, с `id` — изменить. Удаления нет: `active:false` скрывает.

## Остатки (`stock.py`)

| Действие | Параметры | Ответ |
|---|---|---|
| `getStock` | — | `items[]` (товар + `qty`, `lastIn`, `onRoad`), `total` |
| `addIncome` | `date?`, `note?`, `lines[{productId, qty}]` | `added` |
| `writeOff` | `productId`, `qty`, `reason` | `qty` (новый остаток); `no_stock` если не хватает |
| `adjustStock` | `productId`, `actual`, `note?` | `delta`, `qty` |
| `getMoves` | `from?`, `to?`, `type?` (`in`/`ship`/`return`/`writeoff`/`adjust`) | `moves[]` (до 500) |

## Рейсы (`trips.py`)

Статусы: `draft` → `shipped` → `reported` → `closed`; `draft` → `cancelled`.

| Действие | Параметры | Что делает |
|---|---|---|
| `getTrips` | `from?`, `to?` | Рейсы ±7 дней + все незакрытые |
| `saveTrip` | `id?`, `date?`, `cityId`, `driverId?`, `lines[{productId, qty}]`, `taraOut[{taraId, qty}]`, `note?` | Создать/изменить черновик |
| `shipTrip` | `id` | Проверить остаток, списать торты, записать ящики на водителя → `shipped` |
| `cancelTrip` | `id` | Только черновик → `cancelled` |
| `reportTrip` | `id`, `returns[{productId, back, spoiled}]`, `taraBack[]`, `comment?` | Отчёт водителя → `reported` |
| `closeTrip` | `id`, `returns[]`, `taraBack[]` | Годные — на остаток, ящики — с долга → `closed`; в строках `delivered` |
| `getMyTrips` | `driverId?` (только в открытом демо) | `driver`, `trips`, `taraDebt` |
| `setOdometer` | `id`, `kind` out/back, `km` | Спидометр рейса (`odoOut`/`odoBack` в рейсе). Водитель — свой рейс; back ≥ out, пробег ≤ 3000 км |
| `getDriverStats` | `from?`, `to?` (по умолчанию 30 дней) | `drivers[{driverId, trips, points, km, kmGap, noOdo, shipped, back, spoiled, shortage, taraDebt}]` |

## Ящики (`tara.py`)

| Действие | Параметры | Ответ |
|---|---|---|
| `getTara` | — | `types[]` (`total`, `atDrivers`, `lost`, `inStock`), `drivers[]` (`tara[id]: issued/returned/lost/debt`, `debt`), `history[]` |
| `taraMove` | `driverId`, `taraId`, `qty`, `kind` (`out`/`back`/`writeoff`), `note?` | `debt`; вернуть/списать больше долга нельзя |

## Сборка (`picking.py`)

Заявки точек и лист сборки. Остаток не трогает — торты списывает отгрузка
рейса. Порядок строк по месту на складе считает экран (места — в ответе).

| Действие | Параметры | Ответ / что делает |
|---|---|---|
| `getOrders` | `date?` (по умолчанию ближайшая дата с заявками) | `date`, `dates[]`, `orders[]`, `points[]`, `routes[]`, `places{productId: №}` |
| `saveOrder` | `id?`, `num`, `date?`, `pointId`, `comment?`, `lines[{productId, qty, bonus?}]` | `order`; маршрут берётся у точки; номер уникален; собранная не правится |
| `deleteOrder` | `id` | только несобранная |
| `checkLine` | `id`, `productId`, `done?` (по умолчанию `true`) | `order` с обновлёнными `checked` |
| `finishPick` | `id`, `picker?` (смена собирает вместе — не спрашиваем), `boxes?`, `all?` (отметить все строки) | `status: picked`; `bad_state`, если отмечено не всё |
| `finishAll` | `date`, `route?` | Все несобранные заявки дня — «Собрано» (собирали по бумаге); ящики пустые |
| `addOrderFile` | `orderId`, `mime` (jpeg/png/webp/pdf), `data` (base64, ≤ 3 МБ), `name?` | Фото/файл заявки → `file`; на диске `TGS_DATA_DIR/cake-files/`. Тело запроса склада — до 4 МБ |
| `getOrderFile` / `deleteOrderFile` | `id` | Файл с `data` (base64) / удалить |
| `reopenPick` | `id` | обратно `new`; нельзя, если заявка уже в рейсе |
| `routeToTrip` | `date`, `route`, `driverId?` | Все заявки маршрута на дату без рейса должны быть собраны → черновик рейса: торты с бонусами, ящики — сумма по заявкам, в комментарии номера заявок; `trip`, `orders`. Отмена рейса освобождает заявки |
| `savePlaces` | `places[{productId, place}]` (0 — убрать место) | `saved`, `places` |
| `savePoint` | `id?`, `customer`, `address`, `route?`, `code?`, `active?` | `point` |

Заявка: `num`, `date`, `pointId`, `route`, `comment`, `lines[{productId, qty,
bonus}]`, `checked[productId]`, `status` (`new` → `picked`), `picker`, `boxes`,
`pickedAt`, `tripId`. Маршрут — направление рейса, как город: строка в `cities`
с тем же названием (создаётся сама). Заявки с фото накладных (`orders_data.py`) попадают в базу
один раз — и в новую, и в уже работающую (`migrate` в `core.Bot`).

## Смены и сводка (`shifts.py`, `overview.py`)

| Действие | Параметры | Ответ |
|---|---|---|
| `getShifts` | `from?`, `to?` | `days{date: [staffId]}` |
| `setShift` | `date`, `staffIds[]` | Заменяет список на день |
| `getOverview` | `days?` (7–60, по умолчанию 14) | `stockTotal`, `lowStock`, `shippedToday`, `shippedPeriod`, `returnedPeriod`, `writtenOffPeriod`, `trips`, `series`, `byCity`, `topProducts`, `taraOut`, `onShift` |

## Ошибки

| Код | Когда |
|---|---|
| `bad_request` | Неверное поле (в `message` — какое) |
| `not_found` | Нет товара, рейса, водителя, города |
| `no_stock` | Не хватает остатка (в `message` — чего и сколько) |
| `bad_state` | Действие не для этого статуса рейса |
| `forbidden` | Нет подписи бота или нет в списке доступа |
| `rate_limited` | Больше 120 запросов/мин (30 изменяющих) с IP |

Общие коды сервера — в `api/README.md`.
