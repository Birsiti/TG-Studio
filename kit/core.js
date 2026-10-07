// изменено 2026-10-08 02:15
/* ============================================================
   kit/core.js — общий рантайм всех Mini App студии TG-Studio.

   Подключать в <head> СИНХРОННО (без defer), сразу после
   telegram-web-app.js — тогда тема ставится до первой отрисовки:

     <script src="https://telegram.org/js/telegram-web-app.js"></script>
     <script src="../kit/core.js"></script>
     <link rel="stylesheet" href="../kit/base.css">
     <link rel="stylesheet" href="brand.css">

   Что внутри (всё в глобальном объекте Kit):
     Kit.tg / Kit.user          — Telegram WebApp и пользователь (userId)
     Kit.theme                  — Авто/Тёмная/Светлая + панель по кнопке-солнышку
     Kit.createApi({bot, mock}) — fetch к https://api.tg-studio.xyz/api/<bot>
                                  с тихим откатом на моки
     Kit.sheet / Kit.toast / Kit.confirm / Kit.back — шторки, тосты,
                                  подтверждения, нативная кнопка «Назад»
     Kit.phone                  — маска +375 XX-XXX-XX-XX
     Kit.date / Kit.money       — даты и деньги
     Kit.html / Kit.esc         — безопасная сборка разметки (экранирование)
     Kit.icon                   — SVG-иконки (никаких эмодзи)
     Kit.fit                    — подгон шрифта по ширине вместо переноса слов
     Kit.tabs / Kit.chart / Kit.csv — нижние вкладки, графики, выгрузка
   ============================================================ */
(function(){
  "use strict";

  var tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
  // Внутри браузера telegram-web-app.js тоже создаёт объект WebApp, но с
  // platform "unknown" — считаем «настоящим» Telegram только известные платформы.
  var inTelegram = !!(tg && tg.platform && tg.platform !== 'unknown');
  var root = document.documentElement;

  function store(key, val){
    try{
      if(val === undefined) return localStorage.getItem(key);
      if(val === null) localStorage.removeItem(key); else localStorage.setItem(key, val);
    }catch(e){ return null; }
  }
  function versionAtLeast(v){ try{ return !!(tg && tg.isVersionAtLeast && tg.isVersionAtLeast(v)); }catch(e){ return false; } }

  /* ============ ТЕМА ============ */
  var THEME_KEY = 'tgs-theme';
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;

  function themeChoice(){
    var v = store(THEME_KEY);
    return (v === 'light' || v === 'dark') ? v : 'auto';
  }
  function resolvedTheme(){
    var c = themeChoice();
    if(c !== 'auto') return c;
    if(inTelegram && tg.colorScheme) return tg.colorScheme;
    return (mq && mq.matches) ? 'dark' : 'light';
  }
  function cssVar(name){ return getComputedStyle(root).getPropertyValue(name).trim(); }
  function paintChrome(){
    var bg = cssVar('--bg'), head = cssVar('--header-bg') || bg;
    var meta = document.querySelector('meta[name="theme-color"]');
    if(!meta){ meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
    if(bg) meta.content = bg;
    if(!inTelegram || !bg) return;
    try{ tg.setBackgroundColor(bg); }catch(e){}
    try{ tg.setHeaderColor(head && head.charAt(0) === '#' ? head : bg); }catch(e){}
    if(versionAtLeast('7.10')){ try{ tg.setBottomBarColor(bg); }catch(e){} }
  }
  function applyTheme(){
    var t = resolvedTheme();
    root.setAttribute('data-theme', t);
    root.style.colorScheme = t;
    // цвета шапки Telegram берём из CSS-токенов — после загрузки стилей
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paintChrome, {once:true});
    else paintChrome();
    document.querySelectorAll('[data-theme-toggle]').forEach(function(b){ b.setAttribute('data-choice', themeChoice()); });
  }
  applyTheme(); // синхронно, до первой отрисовки
  if(mq && mq.addEventListener) mq.addEventListener('change', function(){ if(themeChoice() === 'auto') applyTheme(); });
  if(tg && tg.onEvent) tg.onEvent('themeChanged', function(){ if(themeChoice() === 'auto') applyTheme(); });

  /* ============ TELEGRAM ============ */
  function haptic(kind){
    if(!inTelegram || !tg.HapticFeedback) return;
    try{
      if(kind === 'success' || kind === 'error' || kind === 'warning') tg.HapticFeedback.notificationOccurred(kind);
      else if(kind === 'select') tg.HapticFeedback.selectionChanged();
      else tg.HapticFeedback.impactOccurred(kind || 'light');
    }catch(e){}
  }

  function syncSafeArea(){
    if(!inTelegram) return;
    var s = tg.safeAreaInset || {}, c = tg.contentSafeAreaInset || {};
    root.style.setProperty('--tg-safe-top', ((s.top||0) + (c.top||0)) + 'px');
    root.style.setProperty('--tg-safe-bottom', ((s.bottom||0) + (c.bottom||0)) + 'px');
  }

  if(tg){
    try{ tg.ready(); }catch(e){}
    if(inTelegram){
      try{ tg.expand(); }catch(e){}
      if(versionAtLeast('7.7')){ try{ tg.disableVerticalSwipes(); }catch(e){} }
      syncSafeArea();
      if(tg.onEvent){
        tg.onEvent('safeAreaChanged', syncSafeArea);
        tg.onEvent('contentSafeAreaChanged', syncSafeArea);
      }
    }
  }

  /* ============ ПОЛЬЗОВАТЕЛЬ ============
     userId — из tg.initDataUnsafe.user.id; вне Telegram — постоянный
     web-id из localStorage (чтобы «Мои записи» не терялись между заходами). */
  function webId(){
    var id = store('tgs-web-id');
    if(id && /^web-[a-z0-9]{8,32}$/.test(id)) return id;
    var rnd = '';
    try{
      var a = new Uint8Array(8); crypto.getRandomValues(a);
      rnd = Array.prototype.map.call(a, function(x){ return ('0' + x.toString(16)).slice(-2); }).join('');
    }catch(e){ rnd = (Math.random().toString(16).slice(2) + Date.now().toString(16)).slice(0, 16); }
    id = 'web-' + rnd;
    store('tgs-web-id', id);
    return id;
  }
  var tgUser = (inTelegram && tg.initDataUnsafe && tg.initDataUnsafe.user) || null;
  var user = {
    id: tgUser ? String(tgUser.id) : webId(),
    firstName: tgUser ? (tgUser.first_name || '') : '',
    lastName: tgUser ? (tgUser.last_name || '') : '',
    username: tgUser ? (tgUser.username || '') : '',
    isTelegram: !!tgUser
  };

  /* ============ РАЗМЕТКА: экранирование ============ */
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function Raw(s){ this.s = s; }
  Raw.prototype.toString = function(){ return this.s; };
  function toHtml(v){
    if(v instanceof Raw) return v.s;
    if(Array.isArray(v)) return v.map(toHtml).join('');
    if(v == null || v === false || v === true) return '';
    return esc(v);
  }
  // html`<b>${userText}</b>` — всё подставленное экранируется, кроме
  // результатов html``/Kit.raw()/Kit.icon(). Массивы склеиваются.
  function html(strings){
    var out = '';
    for(var i = 0; i < strings.length; i++){
      out += strings[i];
      if(i + 1 < arguments.length) out += toHtml(arguments[i + 1]);
    }
    return new Raw(out);
  }
  function raw(s){ return new Raw(String(s)); }

  function $(sel, ctx){ return (ctx || document).querySelector(sel); }
  function $$(sel, ctx){ return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function on(el, type, selector, fn){
    el.addEventListener(type, function(e){
      var t = e.target.closest(selector);
      if(t && el.contains(t)) fn.call(t, e, t);
    });
  }

  /* ============ ИКОНКИ (24×24, обводка, в духе Lucide) ============ */
  var ICONS = {
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon:'<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2z"/>',
    auto:'<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>',
    x:'<path d="M18 6 6 18M6 6l12 12"/>',
    check:'<path d="M20 6 9 17l-5-5"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    minus:'<path d="M5 12h14"/>',
    left:'<path d="m15 18-6-6 6-6"/>',
    right:'<path d="m9 18 6-6-6-6"/>',
    down:'<path d="m6 9 6 6 6-6"/>',
    up:'<path d="m18 15-6-6-6 6"/>',
    arrowRight:'<path d="M5 12h14M13 6l6 6-6 6"/>',
    swap:'<path d="M7 4 3 8l4 4"/><path d="M3 8h14"/><path d="m17 20 4-4-4-4"/><path d="M21 16H7"/>',
    phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    calendar:'<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    list:'<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    chart:'<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-6"/>',
    bars:'<path d="M5 20V10M12 20V4M19 20v-7"/>',
    box:'<path d="M21 8 12 3 3 8l9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>',
    bag:'<path d="M6 7h12l1 14H5L6 7z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/>',
    cart:'<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2.5 3h3l2.4 12.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21.5 8H6.5"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    sliders:'<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    trash:'<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    archive:'<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
    restore:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    wallet:'<path d="M20 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-2"/><path d="M22 11h-5a2 2 0 0 0 0 4h5z"/>',
    cash:'<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    card:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
    pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    route:'<circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M12 19h4.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H12"/>',
    bus:'<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 3v8M16 3v8"/><circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/><path d="M6 18v3M18 18v3"/>',
    ticket:'<path d="M3 7a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-3a2 2 0 0 0 0-4z"/><path d="M14 5v2M14 11v2M14 17v2"/>',
    seat:'<path d="M7 13V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v8"/><path d="M4 13h16v4H4zM6 17v4M18 17v4"/>',
    fuel:'<path d="M3 22V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17M2 22h14M7 8h4"/><path d="M15 12h2a2 2 0 0 1 2 2v3a1.5 1.5 0 0 0 3 0V9l-3-3"/>',
    gauge:'<path d="M12 14l4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>',
    wrench:'<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
    drill:'<path d="M3 7h10l2 2h4v3h-4l-2 2H9"/><path d="M7 14l-2 7h4l1-7"/><path d="M19 10.5h3"/>',
    hammer:'<path d="m15 12-8.5 8.5a2.1 2.1 0 0 1-3-3L12 9"/><path d="M17.6 15 22 10.6M20.9 11.7l-6.6-6.6a4 4 0 0 0-5.6 0L8 5.8l8.2 8.2"/>',
    saw:'<path d="M3 17 17 3l4 4L7 21z"/><path d="M8 12l2 2M11 9l2 2M14 6l2 2"/>',
    ladder:'<path d="M7 2v20M17 2v20M7 6h10M7 11h10M7 16h10"/>',
    plug:'<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0z"/><path d="M12 18v4"/>',
    scissors:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
    razor:'<path d="M4 20 15 9"/><path d="M13 3l8 8-4 4-8-8z"/><path d="M4 20l-1 1"/>',
    comb:'<path d="M3 8h18v4H3z"/><path d="M5 12v6M8 12v6M11 12v6M14 12v6M17 12v6M20 12v4"/>',
    beard:'<path d="M5 8c0 7 3 12 7 12s7-5 7-12"/><path d="M9 14c1 1 2 1.5 3 1.5s2-.5 3-1.5"/><path d="M8 8V5M16 8V5"/>',
    coffee:'<path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M6 2v2M10 2v2M14 2v2"/>',
    cup:'<path d="M5 8h14l-1.5 12a2 2 0 0 1-2 1.8h-7a2 2 0 0 1-2-1.8z"/><path d="M4 8h16M8 8l1-5h6l1 5"/>',
    croissant:'<path d="M4.6 13.1a2 2 0 0 1 1.3-3.4C7 9.5 8 10 8.8 10.8"/><path d="M19.4 13.1a2 2 0 0 0-1.3-3.4C17 9.5 16 10 15.2 10.8"/><path d="M8 18c-2-1-3.5-3-3.4-4.9M16 18c2-1 3.5-3 3.4-4.9"/><path d="M8.8 10.8 12 6l3.2 4.8L12 19z"/>',
    bowl:'<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M7 21h10M12 3c1 1.5-1 2.5 0 4M8 4c1 1.5-1 2.5 0 4M16 4c1 1.5-1 2.5 0 4"/>',
    fork:'<path d="M7 2v8a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V2M9 12v10M17 2c-2 2-3 5-3 8h3v12"/>',
    leaf:'<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M2 21c0-3 1.9-5.4 5.2-6.1 2.4-.5 4.8-2 5.8-3.9"/>',
    flame:'<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.3.4 1.5 1.6 2.8 2.5 2.8z"/>',
    star:'<path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"/>',
    heart:'<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
    gift:'<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    percent:'<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    tag:'<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    droplet:'<path d="M12 2.7s6.5 7.2 6.5 11.8a6.5 6.5 0 0 1-13 0C5.5 9.9 12 2.7 12 2.7z"/>',
    sparkle:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    car:'<path d="M5 17h14v-5l-2-5H7l-2 5z"/><path d="M3 12h18M5 17v2M19 17v2"/><circle cx="8" cy="14.5" r="1"/><circle cx="16" cy="14.5" r="1"/>',
    seatClean:'<path d="M8 4h6a2 2 0 0 1 2 2v7H8z"/><path d="M6 13h12l1 4H5zM7 17v3M17 17v3"/>',
    alert:'<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    lock:'<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    refresh:'<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
    filter:'<path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/>',
    download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    home:'<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    send:'<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
    message:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    bell:'<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
    shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    key:'<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14.5 8.5l2 2"/>',
    copy:'<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    layers:'<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    bays:'<rect x="3" y="3" width="7" height="18" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    truck:'<path d="M1 4h14v12H1zM15 9h4l3 3v4h-7"/><circle cx="5.5" cy="18.5" r="2"/><circle cx="18.5" cy="18.5" r="2"/>',
    receipt:'<path d="M4 2v20l3-2 3 2 2-2 2 2 3-2 3 2V2l-3 2-3-2-2 2-2-2-3 2z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    clipboard:'<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 2h6v4H9zM9 12h6M9 16h4"/>',
    target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    zap:'<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    link:'<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    play:'<path d="M6 4v16l14-8z"/>',
    pause:'<path d="M7 4h3v16H7zM14 4h3v16h-3z"/>',
    flag:'<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
    dot:'<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
    more:'<circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="19" cy="12" r="1.2" fill="currentColor"/>',
    logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    bot:'<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 14h.01M15 14h.01M2 13v3M22 13v3"/><circle cx="12" cy="3" r="1"/>',
    rocket:'<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22 22 0 0 1-4 2z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>'
  };
  function icon(name, cls){
    var p = ICONS[name] || ICONS.dot;
    return raw('<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>');
  }

  /* ============ ДАТЫ ============ */
  var MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  var MONTHS_SHORT = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
  var DOW = ['вс','пн','вт','ср','чт','пт','сб'];
  var DOW_LONG = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  var date = {
    key: function(d){ d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); },
    parse: function(k){ var p = String(k).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); },
    today: function(){ return date.key(new Date()); },
    add: function(k, n){ var d = date.parse(k); d.setDate(d.getDate() + n); return date.key(d); },
    diff: function(a, b){ return Math.round((date.parse(b) - date.parse(a)) / 86400000); },
    dow: function(k){ return DOW[date.parse(k).getDay()]; },
    dowLong: function(k){ return DOW_LONG[date.parse(k).getDay()]; },
    day: function(k){ return date.parse(k).getDate(); },
    monthShort: function(k){ return MONTHS_SHORT[date.parse(k).getMonth()]; },
    // «12 октября»
    long: function(k){ var d = date.parse(k); return d.getDate() + ' ' + MONTHS[d.getMonth()]; },
    // «Сегодня» / «Завтра» / «пт, 12 окт»
    label: function(k){
      var t = date.today();
      if(k === t) return 'Сегодня';
      if(k === date.add(t, 1)) return 'Завтра';
      if(k === date.add(t, -1)) return 'Вчера';
      var d = date.parse(k);
      return DOW[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()];
    },
    // «Сегодня, 14:30» / «12 октября, 14:30»
    when: function(k, time){
      var t = date.today(), base = (k === t) ? 'Сегодня' : (k === date.add(t, 1)) ? 'Завтра' : date.long(k);
      return time ? base + ', ' + time : base;
    },
    nowMinutes: function(){ var d = new Date(); return d.getHours() * 60 + d.getMinutes(); },
    toMinutes: function(hm){ var p = String(hm).split(':').map(Number); return p[0] * 60 + (p[1] || 0); },
    fromMinutes: function(m){ return Math.floor(m / 60) + ':' + pad(m % 60); },
    monthName: function(i){ return ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'][i]; },
    MONTHS: MONTHS, DOW: DOW
  };

  /* ============ ДЕНЬГИ / ЧИСЛА ============ */
  function num(n, frac){
    n = Number(n) || 0;
    var s = n.toLocaleString('ru-RU', {minimumFractionDigits: frac || 0, maximumFractionDigits: frac == null ? (n % 1 ? 2 : 0) : frac});
    return s.replace(/\s/g, ' ');
  }
  function money(n, cur){ return num(n) + ' ' + (cur || 'BYN'); }
  function moneyRange(a, b, cur){ return (a === b || !b) ? money(a, cur) : num(a) + '–' + num(b) + ' ' + (cur || 'BYN'); }
  function plural(n, one, few, many){
    n = Math.abs(n) % 100; var n1 = n % 10;
    if(n > 10 && n < 20) return many;
    if(n1 > 1 && n1 < 5) return few;
    if(n1 === 1) return one;
    return many;
  }

  /* ============ ТЕЛЕФОН: +375 XX-XXX-XX-XX ============ */
  var PHONE_PREFIX = '+375';
  function phoneDigits(v){
    var d = String(v || '').replace(/\D/g, '');
    if(d.length > 9 && d.indexOf('375') === 0) d = d.slice(3);
    if(d.length > 9 && d.charAt(0) === '8') d = d.slice(1);
    return d.slice(0, 9);
  }
  function phoneMask(d){
    var out = d.slice(0, 2);
    if(d.length > 2) out += '-' + d.slice(2, 5);
    if(d.length > 5) out += '-' + d.slice(5, 7);
    if(d.length > 7) out += '-' + d.slice(7, 9);
    return out;
  }
  var phone = {
    bind: function(el){
      el.setAttribute('inputmode', 'numeric');
      el.setAttribute('autocomplete', 'tel-national');
      el.setAttribute('maxlength', '12');
      if(!el.placeholder) el.placeholder = '29-123-45-67';
      el.addEventListener('input', function(){
        var caretDigits = (el.value.slice(0, el.selectionStart || 0).match(/\d/g) || []).length;
        var d = phoneDigits(el.value);
        el.value = phoneMask(d);
        // держим каретку после того же количества цифр
        var pos = 0, seen = 0;
        while(pos < el.value.length && seen < caretDigits){ if(/\d/.test(el.value[pos])) seen++; pos++; }
        try{ el.setSelectionRange(pos, pos); }catch(e){}
      });
    },
    value: function(el){ var d = phoneDigits(el.value); return d.length === 9 ? PHONE_PREFIX + d : ''; },
    valid: function(el){ return phoneDigits(el.value).length === 9; },
    set: function(el, e164){ el.value = phoneMask(phoneDigits(e164)); },
    pretty: function(e164){
      var d = phoneDigits(e164);
      if(d.length !== 9) return String(e164 || '');
      return PHONE_PREFIX + ' ' + d.slice(0, 2) + ' ' + d.slice(2, 5) + '-' + d.slice(5, 7) + '-' + d.slice(7);
    },
    field: function(id, value){
      return html`<div class="phone-field"><span class="phone-prefix">+375</span><input type="tel" class="phone-input" id="${id}" inputmode="numeric" placeholder="29-123-45-67" maxlength="12" value="${value ? phoneMask(phoneDigits(value)) : ''}"></div>`;
    },
    PREFIX: PHONE_PREFIX
  };

  /* ============ НАТИВНАЯ «НАЗАД» ============
     Стек обработчиков: каждая открытая шторка/шаг кладёт свой, кнопка
     Telegram «Назад» видна, пока стек не пуст, и зовёт верхний. */
  var backStack = [];
  function backRefresh(){
    if(!inTelegram || !tg.BackButton) return;
    try{ backStack.length ? tg.BackButton.show() : tg.BackButton.hide(); }catch(e){}
  }
  if(inTelegram && tg.BackButton){
    try{ tg.BackButton.onClick(function(){ var fn = backStack[backStack.length - 1]; if(fn) fn(); }); }catch(e){}
  }
  var back = {
    push: function(fn){ backStack.push(fn); backRefresh(); },
    pop: function(fn){ var i = backStack.lastIndexOf(fn); if(i > -1) backStack.splice(i, 1); backRefresh(); },
    clear: function(){ backStack.length = 0; backRefresh(); }
  };

  /* ============ ШТОРКИ ============ */
  var sheetLayer = null;
  function ensureLayer(){
    if(sheetLayer) return sheetLayer;
    sheetLayer = document.createElement('div');
    sheetLayer.className = 'sheet-layer';
    document.body.appendChild(sheetLayer);
    return sheetLayer;
  }
  // Kit.sheet({title, sub, body: html|Node, actions: html, onClose, className})
  // → {el, body, close()}. Можно открывать поверх другой шторки.
  function sheet(opts){
    opts = opts || {};
    var layer = ensureLayer();
    var wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = '<div class="sheet-scrim"></div><div class="sheet ' + (opts.className || '') + '" role="dialog" aria-modal="true">' +
      '<div class="sheet-grip"></div>' +
      (opts.title ? '<div class="sheet-head"><div class="sheet-titles"><div class="sheet-title">' + esc(opts.title) + '</div>' + (opts.sub ? '<div class="sheet-sub">' + esc(opts.sub) + '</div>' : '') + '</div><button class="icon-btn sheet-x" type="button" aria-label="Закрыть">' + icon('x') + '</button></div>' : '') +
      '<div class="sheet-body"></div>' +
      (opts.actions ? '<div class="sheet-actions">' + toHtml(opts.actions) + '</div>' : '') +
      '</div>';
    var body = wrap.querySelector('.sheet-body');
    if(opts.body instanceof Node) body.appendChild(opts.body); else body.innerHTML = toHtml(opts.body || '');
    layer.appendChild(wrap);
    document.body.classList.add('has-sheet');
    var closed = false;
    function close(){
      if(closed) return; closed = true;
      back.pop(close);
      wrap.classList.remove('open');
      setTimeout(function(){
        wrap.remove();
        if(!layer.children.length) document.body.classList.remove('has-sheet');
      }, 260);
      if(opts.onClose) opts.onClose();
    }
    wrap.querySelector('.sheet-scrim').addEventListener('click', close);
    var x = wrap.querySelector('.sheet-x'); if(x) x.addEventListener('click', close);
    back.push(close);
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ wrap.classList.add('open'); }); });
    haptic('light');
    return {el: wrap.querySelector('.sheet'), body: body, close: close, $: function(s){ return wrap.querySelector(s); }};
  }

  /* ============ ТОСТЫ ============ */
  var toastEl = null, toastTimer = null;
  function toast(msg, kind){
    if(!toastEl){ toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.className = 'toast' + (kind ? ' toast-' + kind : '');
    toastEl.innerHTML = toHtml(icon(kind === 'error' ? 'alert' : kind === 'ok' ? 'check' : 'info')) + '<span>' + esc(msg) + '</span>';
    requestAnimationFrame(function(){ toastEl.classList.add('show'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toastEl.classList.remove('show'); }, 2600);
    if(kind === 'error') haptic('error'); else if(kind === 'ok') haptic('success');
  }

  /* ============ ПОДТВЕРЖДЕНИЕ ============
     В Telegram — нативный showConfirm, в браузере — своя шторка
     (window.confirm не зовём никогда). */
  function confirmAsync(message, okLabel, danger){
    return new Promise(function(resolve){
      if(inTelegram && tg.showConfirm && versionAtLeast('6.2')){
        try{ tg.showConfirm(message, function(ok){ resolve(!!ok); }); return; }catch(e){}
      }
      var done = false;
      var s = sheet({
        title: 'Подтвердите действие',
        body: html`<p class="confirm-text">${message}</p>`,
        actions: html`<button class="btn btn-ghost" data-act="no" type="button">Отмена</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="yes" type="button">${okLabel || 'Да'}</button>`,
        onClose: function(){ if(!done){ done = true; resolve(false); } }
      });
      s.$('[data-act="no"]').addEventListener('click', function(){ s.close(); });
      s.$('[data-act="yes"]').addEventListener('click', function(){ done = true; resolve(true); s.close(); });
    });
  }

  /* ============ ПАНЕЛЬ ТЕМЫ (кнопка-солнышко в шапке) ============ */
  var themePanel = null;
  function closeThemePanel(){
    if(!themePanel) return;
    var p = themePanel; themePanel = null;
    p.classList.remove('open');
    back.pop(closeThemePanel);
    setTimeout(function(){ p.remove(); }, 200);
  }
  function openThemePanel(btn){
    if(themePanel){ closeThemePanel(); return; }
    var cur = themeChoice();
    var opts = [['auto','Авто','auto'],['dark','Тёмная','moon'],['light','Светлая','sun']];
    var p = document.createElement('div');
    p.className = 'theme-panel';
    p.setAttribute('role', 'menu');
    p.innerHTML = '<div class="theme-panel-title">Оформление</div>' + opts.map(function(o){
      return '<button type="button" role="menuitemradio" aria-checked="' + (cur === o[0]) + '" class="theme-opt' + (cur === o[0] ? ' is-on' : '') + '" data-v="' + o[0] + '">' + toHtml(icon(o[2])) + '<span>' + o[1] + '</span>' + toHtml(icon('check', 'theme-tick')) + '</button>';
    }).join('');
    document.body.appendChild(p);
    var r = btn.getBoundingClientRect();
    p.style.top = Math.round(r.bottom + 8) + 'px';
    p.style.right = Math.max(12, Math.round(window.innerWidth - r.right)) + 'px';
    themePanel = p;
    back.push(closeThemePanel);
    requestAnimationFrame(function(){ p.classList.add('open'); });
    p.addEventListener('click', function(e){
      var o = e.target.closest('.theme-opt'); if(!o) return;
      setTheme(o.getAttribute('data-v'));
      p.querySelectorAll('.theme-opt').forEach(function(x){ var on = x === o; x.classList.toggle('is-on', on); x.setAttribute('aria-checked', on); });
      haptic('select');
      setTimeout(closeThemePanel, 160); // после выбора панель закрывается сама
    });
    haptic('light');
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest('[data-theme-toggle]');
    if(b){ e.preventDefault(); openThemePanel(b); return; }
    if(themePanel && !e.target.closest('.theme-panel')) closeThemePanel();
  });
  window.addEventListener('resize', closeThemePanel);
  function setTheme(v){
    store(THEME_KEY, v === 'auto' ? null : v);
    root.classList.add('theme-anim');
    applyTheme();
    setTimeout(function(){ root.classList.remove('theme-anim'); }, 400);
    document.dispatchEvent(new CustomEvent('kit:theme', {detail: resolvedTheme()}));
  }
  function themeButton(){
    return html`<button class="icon-btn" type="button" data-theme-toggle aria-label="Оформление">${icon('sun')}</button>`;
  }

  /* ============ ПОДГОН ШРИФТА ============
     Элементы с [data-fit] не переносятся (nowrap) — если текст не влез,
     шрифт уменьшается до data-fit-min (по умолчанию 12px). */
  function fit(el){
    el.style.fontSize = '';
    if(!el.clientWidth || el.scrollWidth <= el.clientWidth + 0.5) return;
    var base = parseFloat(getComputedStyle(el).fontSize);
    var min = parseFloat(el.getAttribute('data-fit')) || 12;
    var size = Math.max(min, Math.floor(base * el.clientWidth / el.scrollWidth * 10) / 10);
    el.style.fontSize = size + 'px';
    var guard = 12;
    while(guard-- && size > min && el.scrollWidth > el.clientWidth + 0.5){ size -= 0.5; el.style.fontSize = size + 'px'; }
  }
  var fitQueued = false;
  function fitAll(){
    if(fitQueued) return; fitQueued = true;
    requestAnimationFrame(function(){ fitQueued = false; $$('[data-fit]').forEach(fit); });
  }
  window.addEventListener('resize', fitAll);
  document.addEventListener('DOMContentLoaded', function(){
    fitAll();
    if(window.MutationObserver) new MutationObserver(fitAll).observe(document.body, {childList:true, subtree:true, characterData:true});
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);
    document.querySelectorAll('[data-theme-toggle]').forEach(function(b){
      b.setAttribute('data-choice', themeChoice());
      if(!b.innerHTML.trim()) b.innerHTML = String(icon('sun'));
    });
  });

  /* ============ API ============
     POST https://api.tg-studio.xyz/api/<bot>, тело {action, userId, ...payload},
     Content-Type text/plain (без CORS-preflight). Ответ {ok, ...}.
     Если API недоступен (сеть, таймаут, 5xx, не-JSON) — тихо уходим на
     mock(action, payload) и остаёмся в демо-режиме до перезагрузки, чтобы
     живые и моковые данные не перемешивались. Ошибки валидации ({ok:false})
     — это ответ сервера, их не подменяем моками.
     Для локальной проверки: ?api=http://localhost:8097 (только localhost). */
  var API_BASE = 'https://api.tg-studio.xyz';
  (function(){
    try{
      var q = new URLSearchParams(location.search).get('api');
      if(q && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(q)) API_BASE = q;
    }catch(e){}
  })();
  function clone(x){ return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function createApi(cfg){
    var url = API_BASE + '/api/' + cfg.bot;
    var state = {mode: 'unknown'}; // unknown → live | demo
    function viaMock(action, payload){
      state.mode = 'demo';
      return new Promise(function(resolve){
        setTimeout(function(){
          var res;
          try{ res = cfg.mock ? cfg.mock(action, payload) : {ok:false, error:'offline'}; }
          catch(e){ console.error('[mock]', action, e); res = {ok:false, error:'mock_error'}; }
          Promise.resolve(res).then(function(r){ resolve(clone(r) || {ok:false, error:'unknown_action'}); });
        }, 140);
      });
    }
    function api(action, payload){
      payload = Object.assign({userId: user.id}, payload || {});
      if(state.mode === 'demo') return viaMock(action, payload);
      var ctrl = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function(){ if(ctrl) ctrl.abort(); }, state.mode === 'live' ? 12000 : 6000);
      return fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify(Object.assign({action: action}, payload)),
        signal: ctrl ? ctrl.signal : undefined
      }).then(function(r){
        clearTimeout(timer);
        if(r.status >= 500) throw new Error('http ' + r.status);
        return r.json().catch(function(){ throw new Error('bad json'); });
      }).then(function(data){
        if(!data || typeof data.ok !== 'boolean') throw new Error('bad shape');
        state.mode = 'live';
        if(!data.ok && data.error === 'rate_limited') toast('Слишком много запросов — подождите минуту', 'error');
        return data;
      }).catch(function(err){
        clearTimeout(timer);
        if(state.mode === 'live') return {ok:false, error:'network'}; // связь была — не подменяем данные
        console.info('[Kit] API недоступен, демо-режим:', err && err.message);
        return viaMock(action, payload);
      });
    }
    api.mode = function(){ return state.mode; };
    api.url = url;
    return api;
  }

  /* ============ НИЖНИЕ ВКЛАДКИ ============
     <nav class="tabbar"><button data-tab="x">…</button></nav> + <section data-panel="x">.
     Kit.tabs({onChange(tab, first)}) */
  function tabs(opts){
    opts = opts || {};
    var bar = $(opts.bar || '.tabbar');
    var seen = {};
    var key = 'tgs-tab:' + location.pathname;
    function show(name, silent){
      $$('[data-tab]', bar).forEach(function(b){ var on = b.getAttribute('data-tab') === name; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on); });
      $$('[data-panel]').forEach(function(p){ p.hidden = p.getAttribute('data-panel') !== name; });
      try{ sessionStorage.setItem(key, name); }catch(e){}
      window.scrollTo(0, 0);
      if(!silent) haptic('select');
      var first = !seen[name]; seen[name] = true;
      if(opts.onChange) opts.onChange(name, first);
    }
    bar.addEventListener('click', function(e){ var b = e.target.closest('[data-tab]'); if(b) show(b.getAttribute('data-tab')); });
    var start = opts.initial || $('[data-tab]', bar).getAttribute('data-tab');
    try{ var saved = sessionStorage.getItem(key); if(saved && $('[data-tab="' + saved + '"]', bar)) start = saved; }catch(e){}
    show(start, true);
    return {show: show};
  }

  /* ============ ГРАФИКИ ============ */
  var chart = {
    // Столбики: data=[{label, value, sub?}] → html
    bars: function(data, o){
      o = o || {};
      var max = Math.max.apply(null, data.map(function(d){ return d.value; }).concat([1]));
      var hi = o.highlightLast ? data.length - 1 : -1;
      return html`<div class="bars${data.length > 10 ? ' bars-dense' : ''}" role="img" aria-label="${o.label || 'График'}">${data.map(function(d, i){
        var h = Math.max(2, Math.round(d.value / max * 100));
        return html`<div class="bar${i === hi ? ' is-hi' : ''}"><div class="bar-val">${d.value && data.length <= 10 ? (o.short ? o.short(d.value) : num(d.value)) : ''}</div><div class="bar-col"><div class="bar-fill" style="height:${h}%"></div></div><div class="bar-lbl">${d.label}</div></div>`;
      })}</div>`;
    },
    // Горизонтальные полосы-рейтинг: data=[{name, value, note?}]
    rank: function(data, o){
      o = o || {};
      var max = Math.max.apply(null, data.map(function(d){ return d.value; }).concat([1]));
      if(!data.length) return html`<div class="empty-mini">Пока нет данных</div>`;
      return html`<div class="rank">${data.map(function(d, i){
        return html`<div class="rank-row"><div class="rank-top"><span class="rank-n">${i + 1}</span><span class="rank-name">${d.name}</span><span class="rank-val">${o.format ? o.format(d.value) : num(d.value)}</span></div><div class="rank-track"><div class="rank-fill" style="width:${Math.max(3, Math.round(d.value / max * 100))}%"></div></div>${d.note ? html`<div class="rank-note">${d.note}</div>` : ''}</div>`;
      })}</div>`;
    }
  };

  /* ============ CSV ============ */
  function csv(filename, rows){
    var text = rows.map(function(r){ return r.map(function(c){ c = String(c == null ? '' : c); return /[";\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(';'); }).join('\n');
    var blob = new Blob(['﻿' + text], {type: 'text/csv;charset=utf-8'});
    try{
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(a.href); }, 2000);
      toast('Файл ' + filename + ' сохранён', 'ok');
    }catch(e){
      if(navigator.clipboard) navigator.clipboard.writeText(text).then(function(){ toast('CSV скопирован в буфер', 'ok'); });
    }
  }

  /* ============ ПРОЧЕЕ ============ */
  function busy(btn, on){
    if(!btn) return;
    if(on){ btn.disabled = true; btn.classList.add('is-busy'); }
    else { btn.disabled = false; btn.classList.remove('is-busy'); }
  }
  function openLink(url){
    if(/^tel:/.test(url)){ location.href = url; return; }
    if(inTelegram && /^https:\/\/t\.me\//.test(url) && tg.openTelegramLink){ try{ tg.openTelegramLink(url); return; }catch(e){} }
    if(inTelegram && tg.openLink){ try{ tg.openLink(url); return; }catch(e){} }
    window.open(url, '_blank');
  }
  function uid(prefix){ return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(); }
  function initials(name){ return String(name || '').trim().split(/\s+/).map(function(w){ return w.charAt(0); }).slice(0, 2).join('').toUpperCase(); }
  function debounce(fn, ms){ var t; return function(){ var a = arguments, s = this; clearTimeout(t); t = setTimeout(function(){ fn.apply(s, a); }, ms || 200); }; }
  function ready(fn){ if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

  window.Kit = {
    tg: tg, inTelegram: inTelegram, user: user,
    haptic: haptic, back: back, sheet: sheet, toast: toast, confirm: confirmAsync,
    theme: {choice: themeChoice, resolved: resolvedTheme, set: setTheme, button: themeButton},
    phone: phone, date: date, num: num, money: money, moneyRange: moneyRange, plural: plural,
    html: html, raw: raw, esc: esc, $: $, $$: $$, on: on,
    icon: icon, ICONS: ICONS, fit: fit, fitAll: fitAll,
    createApi: createApi, tabs: tabs, chart: chart, csv: csv,
    busy: busy, openLink: openLink, uid: uid, initials: initials, debounce: debounce, ready: ready,
    store: store
  };
})();
