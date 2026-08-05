# Бэкенд мойки — установка

Один Apps Script + одна Google-таблица на одну мойку. Обслуживает все три Mini App (client/admin/owner) через единый `api(action, payload)`.

## 1. Создать таблицу и вкладки

Создать новую Google Таблицу, в ней — 11 вкладок **с точно такими названиями и заголовками колонок в первой строке** (регистр важен):

### УСЛУГИ
```
id | category | name | price_legkovoy_min | price_legkovoy_max | price_krossover_min | price_krossover_max | price_vnedorozhnik_min | price_vnedorozhnik_max | price_minivan_min | price_minivan_max | desc | visible
```

### ЗАПИСИ
```
id | date | time | car_number | car_brand | car_model | car_class | services | price_min | price_max | client_name | client_phone | client_tg_id | status | assigned_staff_id | created_at
```
`services` — названия услуг через `|`. `status` — по-английски: `pending`/`confirmed`/`done`/`cancelled`.

### МАШИНЫ
```
id | tg_id | number | brand | model | car_class | last_used_at
```

### ПЕРСОНАЛ
```
id | name | role | pay_type | rate | phone | shifts_month | accrued_month
```
`pay_type` — `percent` или `fixed`.

### СМЕНЫ
```
date | staff_ids
```
`staff_ids` — id сотрудников через запятую.

### РАСПИСАНИЕ
```
weekday | open | from | to
```
Ровно 7 строк с `weekday` = `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun`. Создать их заранее вручную, например:
```
mon  TRUE   09:00  20:00
tue  TRUE   09:00  20:00
wed  TRUE   09:00  20:00
thu  TRUE   09:00  20:00
fri  TRUE   09:00  20:00
sat  TRUE   10:00  18:00
sun  FALSE  10:00  18:00
```

### ЗАКРЫТЫЕ_ДАТЫ
```
date
```

### СЛОТЫ_БЛОК
```
date | time
```

### БОКСЫ
```
id | name | status | note | today_count | today_revenue
```
`status` — `free` / `busy` / `maintenance`.

### СКЛАД
```
id | name | unit | qty | min | price
```

### МАГАЗИН
```
id | name | price | stock | visible
```

## 2. Установить скрипт

1. В таблице: **Расширения → Apps Script**
2. Стереть содержимое `Code.gs` по умолчанию, вставить весь код из `Code.gs` этого пакета
3. Сохранить (значок дискеты)

## 3. Развернуть как веб-приложение

1. **Развернуть → Новое развёртывание**
2. Тип: **Веб-приложение**
3. **Выполнять как:** я (ваш аккаунт)
4. **Доступ:** Все (Anyone) — обязательно, иначе Mini App не сможет достучаться
5. **Развернуть**, разрешить доступ при запросе
6. Скопировать **URL веб-приложения** (вида `https://script.google.com/macros/s/.../exec`)

## 4. Подключить к Mini App

В `client.html`, `admin.html`, `owner.html` — в блоке `DEMO_CONFIG` заменить:
```js
apiUrl: "PASTE_APPS_SCRIPT_URL_HERE"
```
на скопированный URL. Это временно, пока не сделан реестр — после него `apiUrl` будет приходить оттуда, а не лежать в файле.

## Важно про CORS

Fetch в трёх html-файлах специально использует `Content-Type: text/plain`, а не `application/json` — это чтобы избежать CORS preflight-запроса, на который Apps Script не умеет отвечать. **Не меняйте это обратно на `application/json`**, иначе все запросы к реальному бэкенду начнут падать в демо-режим молча (сработает `catch` в `api()`, ошибка не будет видна пользователю).

## Ограничения этой версии

- **Аналитика владельца** (`getOverview`) считается на лету из листа ЗАПИСИ при каждом запросе — при большом числе записей (тысячи+) может быть медленно. Если станет проблемой, добавим кэш.
- **Фонд оплаты (payroll)** — приблизительная оценка: % от выручки для мойщиков по назначенным записям + пропорциональная доля фиксированной ставки администраторов. Не бухгалтерский расчёт, а ориентир.
- **Боксы (todayCount/todayRevenue)** — пока не привязаны к записям (нет поля "бокс" у записи), это просто редактируемые вручную числа. Привязка — следующий шаг, если понадобится.
- Одна таблица = одна мойка. Мультитенантность (несколько моек на одном скрипте) сюда не заложена — по архитектуре у каждой мойки свой Apps Script.
