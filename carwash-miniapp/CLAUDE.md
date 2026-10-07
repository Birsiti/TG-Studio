<!-- изменено 2026-10-08 02:15 -->
<!-- изменено -->
# carwash-miniapp — БЛЕСК

Telegram Mini App автомойки «БЛЕСК» (Минск). Три роли — отдельные файлы,
имена и пути менять нельзя (на них ведут кнопки Web App в LEADTEX):

| Файл | Роль |
|---|---|
| `client.html` | Визард записи: авто → услуги → дата/время → контакты → билет, «Мои записи» (шторка), удаление сохранённой машины долгим нажатием на чип. |
| `admin.html` | Ресепшн: вкладки Сегодня / Смена / Поиск / Расписание / Услуги. |
| `owner.html` | Владелец: Обзор (выручка, KPI, график, топ услуг, CSV) / Боксы / Персонал / Склад / Магазин. |
| `brand.css` | Фирменный слой: токены светлой/тёмной темы, шрифты (Unbounded + Manrope + JetBrains Mono), «глянцевая» витрина, номерной знак BY, билет. |
| `mock.js` | Офлайн-двойник API — тот же контракт action, состояние в localStorage (общее для трёх ролей в одном браузере). |
| `staff.js` | Общий модуль «Смена / Персонал / Зарплата» для admin и owner. |
| `Code.gs`, `BACKEND-README.md` | **Архив** старого бэкенда на Google Apps Script + Sheets. Не удалять, не развивать. |

## Архитектура (с 2026-10-08)

- Общий рантайм и компоненты — `../kit/core.js` и `../kit/base.css` (см.
  skill miniapp-style, раздел «kit/»). Порядок в `<head>`:
  `telegram-web-app.js` → `../kit/core.js` → `../kit/base.css` → `brand.css`
  → `mock.js` → (`staff.js`).
- Бэкенд — `api/bots/carwash.py` (FastAPI + SQLite, `https://api.tg-studio.xyz/api/carwash`).
  Если API недоступен, `Kit.createApi` тихо уходит в `CarwashMock` и
  остаётся в демо-режиме до перезагрузки страницы.
- Для проверки с локальным API: `client.html?api=http://localhost:8097`.
- Тема — только светлая/тёмная (панель по кнопке-солнышку), скины и
  палитры убраны. Одна фирменная палитра: петроль/аква.

## Контракт (кратко)

Клиент: getServices{audience:'client'}, getSchedule, getSlots{date},
createBooking{date,time,car{number,brand,model,carClass,id?},serviceIds[],contact{name,phone}},
cancelBooking{id}, getMyBookings, getMyProfile, getMyCars, saveCar, deleteCar.
Админ: getBookings{from?,to?}, updateBookingStatus, assignBookingStaff, getShift,
setShift, getDaySlots, blockSlot, unblockSlot, saveService, deleteService,
saveSchedule, addClosedDate, removeClosedDate.
Владелец: getOverview, getOverviewRange{from,to}, getBays/saveBay/deleteBay,
getStaff/saveStaff/deleteStaff, payStaff, getPayouts, getInventory/…, getShop/….

Важно:
- **Цену считает сервер** по serviceIds и классу авто; клиентские суммы игнорируются.
- Слот = 30 минут, одна запись на слот; уникальность гарантирует частичный
  уникальный индекс SQLite + `BEGIN IMMEDIATE`.
- Время везде `HH:MM`.
- `accruedMonth` сотрудника = начислено за месяц (процент с выполненных
  записей или ставка × смены) − выплаты месяца; отрицательное — аванс.
- Нет выбора мастера клиентом (в отличие от барбершопа) — исполнителя
  назначает админ в карточке записи из тех, кто на смене.
- Телефон — маска +375 XX-XXX-XX-XX (`Kit.phone`).
