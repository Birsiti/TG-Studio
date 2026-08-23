---
name: miniapp-style
description: >-
  Технические и дизайн-конвенции Студии ботов для одностраничных HTML
  Telegram Mini App (клиентские визарды, админ-панели, дашборды владельца,
  формы заявок). Использовать ВСЕГДА при создании, правке или ревью любого
  HTML-файла для Telegram Mini App, даже если пользователь просто говорит
  "сделай HTML", "накидай мини-апп", "как в Мойке/Прокате/ВЕРСТА" или
  упоминает LEADTEX — не дожидаться явного запроса "используй наш стиль".
  Покрывает CSS-переменные светлой/тёмной темы, шрифтовую пару, boilerplate
  Telegram WebApp SDK (haptics, safe-area, тема, confirm, back-button),
  маску телефона +375, известные баги WebApp и их фиксы, повторяющиеся
  UI-компоненты (chips, phone-field, submit-bar, success-panel), структуру
  ролей (client/admin/owner/driver) и подключение готового файла к боту
  в LEADTEX через кнопку типа Web App.
---

# Стиль Mini App — Студия ботов

Единый технический и визуальный фундамент для всех проектов Студии ботов
(Мойка, Прокат-Инструмента, ВЕРСТА, барбершоп-варианты, order-bot, most-cafe
и новые). Каждый новый проект = новый файл (или набор файлов по ролям) поверх
этого фундамента, с собственной акцентной палитрой и текстами под нишу.

## Стек проекта (контекст, не переопределять без просьбы)

Одностраничный HTML (без сборки) → GitHub Pages → открывается как Telegram
Mini App из бота, собранного в LEADTEX (no-code). Бэкенд — Google Apps
Script, база — Google Sheets. Репозиторий называть `<проект>-miniapp`
(пример: `toolrent-miniapp`, `versta-miniapp`).

## Чек-лист перед сдачей любого HTML-файла

Быстрая проверка, если что-то в Mini App работает «не так» — 90% багов
ловятся здесь, до анализа CSS:

1. В `<head>` подключён `<script src="https://telegram.org/js/telegram-web-app.js"></script>` — до inline-скрипта определения темы (см. «Тема» ниже)?
2. `initTelegram()` реально вызывается в конце скрипта (`initTelegram();`)?
3. Внутри неё есть `tg.ready(); tg.expand();`?
4. `padding-bottom` нижнего контента учитывает `--safe-bottom` через `max()` (см. «Известные баги» ниже)?

## Тема: адаптивная светлая/тёмная (не «всегда тёмная»)

Telegram может открыть Mini App в любой из двух тем пользователя — фиксировать
только тёмную нельзя, приложение обязано подстраиваться. Базовый тон бренда
студии тёмный (техно-эстетика), поэтому дефолт при отсутствии сигнала —
тёмный, но оба варианта должны быть определены и рабочими.

```css
:root{
  --radius:14px; --radius-sm:10px;
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}
:root[data-theme="dark"]{
  --bg:#111417; --surface:#1A1E22; --surface-2:#20252A; --surface-3:#262B31;
  --ink:#EDEFF0; --ink-soft:#8C949C; --ink-faint:#565D64;
  --accent:#2AABEE; --accent-dark:#1B8FCB; --accent-soft:rgba(42,171,238,.14);
  --ok:#38A89D; --ok-soft:rgba(56,168,157,.14);
  --danger:#E5626A; --danger-soft:rgba(229,98,106,.12);
  --line:#2A2F35; --line-strong:#3A414A;
}
:root[data-theme="light"]{
  --bg:#F4F6F8; --surface:#FFFFFF; --surface-2:#EEF1F4; --surface-3:#E4E8EC;
  --ink:#171A1D; --ink-soft:#5B6570; --ink-faint:#98A1AA;
  --accent:#2AABEE; --accent-dark:#1B8FCB; --accent-soft:rgba(42,171,238,.12);
  --ok:#2E9B8F; --ok-soft:rgba(46,155,143,.12);
  --danger:#D6505A; --danger-soft:rgba(214,80,90,.10);
  --line:#E2E6EA; --line-strong:#CDD3D9;
}
```

Меняется под проект: `--accent`/`--accent-dark`/`--accent-soft` в обеих темах
(например янтарный+бирюзовый для ВЕРСТА и барбершопа) — держать значение
одинаковым в dark/light, если сам акцент не требует адаптации для контраста.
Не менять: имена и роль остальных переменных, структуру двух блоков
`[data-theme]` — от них зависят повторяющиеся компоненты ниже.

Установка темы — синхронно в `<head>`, до первой отрисовки (иначе будет
вспышка не той темой):

```html
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<script>
(function(){
  var tg = window.Telegram && window.Telegram.WebApp;
  var scheme = (tg && tg.colorScheme) ? tg.colorScheme
    : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.setAttribute('data-theme', scheme);
})();
</script>
```

## Шрифтовая тройка

- **Заголовки/UI-лейблы кнопок** — геометричный дисплейный шрифт: Chakra
  Petch (по умолчанию) или Oswald для более «дорожного» проекта (ВЕРСТА).
- **Основной текст** — гуманистический санс: Inter (по умолчанию) или
  Manrope.
- **Данные, метки полей, таймкоды, суммы, телефон** — JetBrains Mono всегда.
  Это фирменный приём студии: он держит «техно»-ощущение интерфейса на любой
  нише.

```css
@import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap');
```

## Telegram WebApp boilerplate

Вставлять в каждый файл без изменений (кроме `haptic` — вызывать в нужных
местах: успех отправки/ошибка/тап):

```js
const tg = window.Telegram ? window.Telegram.WebApp : null;

function haptic(style) {
  if (tg && tg.HapticFeedback) {
    if (["success","error","warning"].includes(style)) tg.HapticFeedback.notificationOccurred(style);
    else tg.HapticFeedback.impactOccurred(style || "light");
  }
}

function applyTelegramTheme(){
  const scheme = (tg && tg.colorScheme) ? tg.colorScheme
    : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.setAttribute('data-theme', scheme);
  if (tg) {
    const s = getComputedStyle(document.documentElement);
    try { tg.setHeaderColor(s.getPropertyValue("--surface").trim()); tg.setBackgroundColor(s.getPropertyValue("--bg").trim()); } catch(e) {}
  }
}

// Промис-обёртка над confirm — showConfirm внутри Telegram, window.confirm
// ТОЛЬКО как фолбэк вне Telegram. Не звать window.confirm напрямую в коде.
function confirmAsync(message){
  return new Promise((resolve)=>{
    if (tg && tg.showConfirm && tg.isVersionAtLeast && tg.isVersionAtLeast('6.2')) {
      try { tg.showConfirm(message, resolve); return; } catch(e) {}
    }
    resolve(window.confirm(message));
  });
}

function initTelegram() {
  if (!tg) return;
  tg.ready(); tg.expand();
  applyTelegramTheme();
  tg.onEvent && tg.onEvent('themeChanged', applyTelegramTheme);
  if (tg.isVersionAtLeast && tg.isVersionAtLeast('7.7')) { try { tg.disableVerticalSwipes(); } catch(e) {} }
}
```

`tg.BackButton` — показывать `.show()` при открытии любого sheet/шага
визарда и `.hide()` при закрытии, `onClick` закрывает текущий sheet (не
`tg.close()` и не `history.back()` — так пользователь не выходит из
Mini App случайно одним тапом).

## Телефон — маска +375, всегда

Поле телефона никогда не текстовый `<input>` в свободной форме. Префикс
страны фиксирован и не редактируется пользователем, дальше — авто-форматирование
по мере ввода в блоки `XX-XXX-XX-XX` (белорусский мобильный: 2 цифры
оператора + 7 цифр номера).

```html
<div class="phone-field">
  <span class="phone-prefix">+375</span>
  <input type="tel" class="phone-input" id="phone" inputmode="numeric" placeholder="29-123-45-67" maxlength="12">
</div>
```

```css
.phone-field{ display:flex; align-items:center; gap:8px; min-height:44px; background:var(--surface-2); border:1px solid var(--line); border-radius:var(--radius-sm); padding:0 12px; }
.phone-prefix{ font-family:'JetBrains Mono',monospace; font-weight:600; color:var(--ink-soft); flex:none; }
.phone-input{ flex:1; min-height:44px; border:none; background:transparent; color:var(--ink); font-family:'JetBrains Mono',monospace; font-size:16px; }
.phone-input:focus{ outline:none; }
```

```js
const PHONE_PREFIX = '+375'; // менять только если проект не для рынка Беларуси

function bindPhoneMask(el){
  el.addEventListener('input', ()=>{
    const digits = el.value.replace(/\D/g,'').slice(0,9);
    let out = digits;
    if (digits.length > 2) out = digits.slice(0,2) + '-' + digits.slice(2);
    if (digits.length > 5) out = digits.slice(0,2) + '-' + digits.slice(2,5) + '-' + digits.slice(5);
    if (digits.length > 7) out = digits.slice(0,2) + '-' + digits.slice(2,5) + '-' + digits.slice(5,7) + '-' + digits.slice(7);
    el.value = out;
  });
}

function fullPhone(el){ return PHONE_PREFIX + el.value.replace(/\D/g,''); } // +375291234567 для payload
function isPhoneValid(el){ return el.value.replace(/\D/g,'').length === 9; }
```

`fullPhone()` — то, что кладётся в payload на бэкенд (E.164 без пробелов и
дефисов), в UI пользователь всегда видит и вводит только форматированный
хвост после несъёмного `+375`. Валидные коды операторов РБ — 25/29/33/44,
но строгую проверку по коду в демо-режиме не делать (только длина в 9 цифр)
— это излишняя строгость для mock-этапа.

## Известные баги Telegram WebApp — фиксить сразу, не дожидаясь жалобы

1. **`env(safe-area-inset-*)` возвращает 0** внутри Telegram WebApp на части
   устройств. Первым делом проверить, что в `<meta name="viewport">` стоит
   `viewport-fit=cover` — без него сафари/Telegram WebView не отдают
   реальное значение вообще:
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover">
   ```
   Даже с `viewport-fit=cover` не полагаться только на `env()` — всегда
   задавать гарантированный минимум:
   ```css
   padding-bottom: max(80px, calc(40px + var(--safe-bottom)));
   ```
   Для админ/владелец-экранов с более плотным нижним баром — минимум
   100px вместо 80px.

2. **Bottom sheet «подглядывает» снизу в закрытом состоянии.** Не
   использовать `translateY(100%)` в одиночку — при неточном расчёте
   высоты полоска шторки видна на экране. Комбинировать три свойства:
   ```css
   .sheet{transform:translateY(110%); opacity:0; visibility:hidden; transition:transform .25s, opacity .25s;}
   .sheet.open{transform:translateY(0); opacity:1; visibility:visible;}
   ```

3. **Пропущен `<script src="https://telegram.org/js/telegram-web-app.js">` в
   `<head>`.** Без него `window.Telegram` не определён, `tg` становится
   `null`, и `initTelegram()` тихо выходит на первой строке (`if (!tg)
   return;`) — без ошибок в консоли, без видимых следов. Внешне страница
   выглядит рабочей (тема, вёрстка, кнопки), но Mini App не разворачивается
   на весь экран (Telegram показывает дефолтную компактную высоту ~половина
   экрана вместо full height) и не получает тему/haptics/safe-area от
   клиента. Это самая частая причина жалобы «почему один экран открывается
   на пол-экрана, а другой на весь» — проверять эту строку первой при любой
   такой жалобе, до разбора CSS.

## Повторяющиеся UI-компоненты

- **Chip-group (сегменты/фильтры/бюджетные вилки)** — pill-кнопки с
  `min-height:44px` (тач-таргет), активное состояние — заливка
  `--accent`. Реализация через `<label class="chip"><input type="radio"…>`
  для доступности и работы без JS-обвеса на клики.
- **Phone-field** — см. раздел «Телефон» выше. Всегда, без исключений, если
  в форме есть номер телефона.
- **Submit-bar** — фиксированная нижняя панель с одной главной кнопкой,
  `padding-bottom: calc(12px + var(--safe-bottom))`, спиннер вставляется
  перед лейблом на время загрузки, а не поверх кнопки.
- **Success-panel** — отдельный экран-состояние (не модалка) с иконкой в
  круге `--ok-soft`, коротким текстом и ссылкой «сделать ещё раз» вместо
  автоматического редиректа.
- **Back-button в шапке** — 44×44px, вызывает `tg.close()` если открыт как
  Mini App, иначе `history.back()`. (Не путать с `tg.BackButton` нативной
  кнопки Telegram, описанной выше в boilerplate — эта своя, внутриэкранная.)

## Структура ролей (для многоролевых проектов)

Каждая роль — отдельный HTML-файл с общим дизайн-каркасом, но своими
mock-данными (не синхронизировать моки между ролями на этапе демо — это
осознанно, синхронизация приходит с бэкендом):

- `client.html` — визард клиента (шаги → summary → «тикет»)
- `admin.html` — операционная панель (сегодня / список / поиск+фильтр)
- `owner.html` — аналитика (выручка, топы, утилизация, CSV-экспорт)
- `driver.html` — только если в домене есть исполнитель на выезде

## Подключение готового файла к боту в LEADTEX

Файл сам по себе — просто HTML на GitHub Pages, ссылка на него ничего не
открывает внутри Telegram, пока её не подключили в боте правильным типом
кнопки (обычная URL-кнопка откроет системный браузер, а не Mini App).

В сценарии бота (LEADTEX, `app.leadteh.ru`) в блоке **«Кнопки»** у каждой
кнопки, которая должна открывать Mini App:

1. Открыть настройку кнопки (шестерёнка на кнопке в редакторе сценария).
2. **Тип кнопки → Web App** (не «Ссылка» — та откроет обычный браузер).
3. **URL** — прямая ссылка на опубликованный файл, например
   `https://birsiti.github.io/<repo>/client.html`.
4. Сохранить.

Портфолио-бот студии (`@TG_Studio_BY` / `t.me/tg_studio_BY_bot`) устроен
как меню кнопок такого типа, по одной на кейс (Блеск, Верста, Барбершоп,
Аренда инструмента, Бот-визитка) плюс «Заказать бота» — тот же паттерн
масштабируется на любое число демо-кейсов, просто новая кнопка Web App на
новый файл.

## Ролевое ветвление сценария по тегу

Кроме «своя роль = свой Web App-файл» (см. «Структура ролей» выше), в самом
сценарии LEADTEX роль можно разделить ещё до Mini App — блоком **«Условие»**
(Да/Нет) сразу после «Старт», который проверяет **тег пользователя**
(теги назначаются администратором боту вручную/по правилу). Если у
пользователя есть тег владельца — сценарий ведёт в ветку с
дополнительными кнопками (аналитика, служебные функции), которых нет у
обычного клиента. Это не альтернатива ролевым HTML-файлам, а
дополнительный уровень: тег решает, **какие кнопки вообще видны** в
сценарии бота, а отдельный `role.html` — что открывается **внутри**
Mini App после нажатия. Комбинировать оба уровня — нормальный паттерн для
проектов с владельцем/админом, которым нужны скрытые от клиента функции.

## Типовая структура сценария в LEADTEX

Разбор реального сценария портфолио-бота — шаблон для новых кейсов, не
изобретать заново под каждый проект:

```
Старт
  └─ Условие (Да/Нет — тег пользователя, см. «Ролевое ветвление по тегу»)
       └─ Приветствие (Цепочка сообщений)
            кнопки: [аналитика/статистика] · Меню
            └─ «Меню» → Главное меню (Цепочка сообщений)
                 кнопки: [Кейс 1] · [Кейс 2] · ... · Заказать бота · Любая другая фраза
                 └─ [Кейс N] → Блок кейса (Цепочка сообщений)
                      кнопки: Меню клиента · Меню администратора · Меню владельца · [Меню водителя — если в домене есть исполнитель на выезде]
                      В меню · Любая другая фраза
                      └─ [Меню роли] → Кнопка Web App → конкретный `role.html` на GitHub Pages
```

Правила, которые видны из этой структуры и стоит повторять в новых
сценариях:

- **Каждый уровень меню — это один блок «Цепочка сообщений»**, не отдельные
  сообщения вразнобой — так весь уровень редактируется в одном месте.
- **«В меню» есть в каждом блоке кейса** — без него пользователь, зайдя в
  конкретный кейс, не может вернуться наверх иначе как перезапуском бота.
- **«Любая другая фраза» есть на каждом уровне** — перехватывает
  нестандартный ввод (опечатка, произвольный текст), чтобы бот не терялся
  молча.
- Роль (клиент/администратор/владелец/водитель) — это отдельная кнопка
  Web App на отдельный HTML-файл (`client.html`, `admin.html`, `owner.html`,
  `driver.html` — см. «Структура ролей» выше), а не разные экраны внутри
  одного файла с переключателем.

## Чего не делать

- Не подключать сборщики/фреймворки — только ванильные HTML/CSS/JS в
  одном файле.
- Не хранить токены и ключи в клиентском коде дольше, чем на этапе
  быстрого старта — предупреждать пользователя, если видишь `botToken`
  или похожий секрет прямо в `<script>`, и предлагать перенос на бэкенд.
- Не менять структуру CSS-переменных и boilerplate-функции без явной
  просьбы — они одинаковы во всех проектах студии специально, чтобы
  новый файл собирался за минуты, а не с нуля.
- Не звать `window.confirm`/`window.alert` напрямую — только через
  `confirmAsync()` (см. boilerplate), иначе внутри Telegram это выглядит
  чужеродно или вовсе блокируется.
