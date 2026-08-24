/* ============================================================
   bootstrap.js — общая логика для всех Mini App мойки
   (client.html / admin.html / owner.html подключают этот файл)

   Что внутри: Telegram WebApp init, haptic(), определение
   tenant_id, загрузка CONFIG из реестра с откатом на демо-конфиг.

   Как использовать в HTML-файле:
     1. Перед подключением этого файла объявить:
          const REGISTRY_URL = "...";      // общий на все мойки
          const DEMO_CONFIG = {...};       // свои поля под роль
     2. <script src="bootstrap.js"></script>
     3. В своём коде: await App.loadConfig() → вернёт CONFIG,
        App.tg / App.tgUser / App.haptic() — уже готовы к использованию.
   ============================================================ */

const App = (function(){
  "use strict";

  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;

  function initTelegram(){
    if(!tg) return;
    try{
      tg.ready(); tg.expand();
      tg.MainButton && tg.MainButton.hide();
    }catch(e){}
  }
  initTelegram();

  // Промис-обёртка над confirm — showConfirm внутри Telegram, window.confirm
  // ТОЛЬКО как фолбэк вне Telegram. Использовать вместо голого confirm()/alert().
  function confirmAsync(message){
    return new Promise((resolve)=>{
      if(tg && tg.showConfirm && tg.isVersionAtLeast && tg.isVersionAtLeast('6.2')){
        try{ tg.showConfirm(message, resolve); return; }catch(e){}
      }
      resolve(window.confirm(message));
    });
  }

  function alertAsync(message){
    return new Promise((resolve)=>{
      if(tg && tg.showAlert && tg.isVersionAtLeast && tg.isVersionAtLeast('6.2')){
        try{ tg.showAlert(message, resolve); return; }catch(e){}
      }
      window.alert(message);
      resolve();
    });
  }

  function haptic(type){
    if(tg && tg.HapticFeedback){
      try{
        if(type==='success') tg.HapticFeedback.notificationOccurred('success');
        else if(type==='error') tg.HapticFeedback.notificationOccurred('error');
        else tg.HapticFeedback.impactOccurred('light');
      }catch(e){}
    }
  }

  function setChrome(bgHex, headerHex){
    if(!tg) return;
    try{
      tg.setBackgroundColor && tg.setBackgroundColor(bgHex);
      tg.setHeaderColor && tg.setHeaderColor(headerHex);
    }catch(e){}
  }

  /* ============ MODE (светлая/тёмная версия текущего бренда) ============
     Независимо от data-theme (бренд мойки, задаётся владельцем через
     CONFIG) — data-mode выбирает каждый пользователь лично. Приоритет:
     сохранённый личный выбор > tg.colorScheme > prefers-color-scheme > light. */
  const MODE_KEY = 'cw_mode_override';

  function resolveMode(){
    try{
      const saved = localStorage.getItem(MODE_KEY);
      if(saved === 'light' || saved === 'dark') return saved;
    }catch(e){}
    if(tg && tg.colorScheme) return tg.colorScheme;
    try{ if(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'; }catch(e){}
    return 'light';
  }

  function applyMode(mode){
    document.body.dataset.mode = mode;
    try{ localStorage.setItem(MODE_KEY, mode); }catch(e){}
    const cs = getComputedStyle(document.body);
    setChrome(cs.getPropertyValue('--bg').trim(), cs.getPropertyValue('--surface').trim());
  }

  function toggleMode(){
    const next = document.body.dataset.mode === 'dark' ? 'light' : 'dark';
    applyMode(next);
    return next;
  }

  function getMode(){ return document.body.dataset.mode || 'light'; }

  // Выставляется сразу при загрузке скрипта — до отрисовки экрана
  // (тег <body> уже распарсен на этот момент, .app и её содержимое — ещё нет).
  document.body.dataset.mode = resolveMode();

  /* ============ BRAND (цветовая схема карточек: avtohimiya/voda/chrome/mercedes/telegram) ============
     Личный выбор каждого пользователя (client/admin/owner — общий механизм
     на все три роли), applyBrand() применяет его мгновенно из localStorage.
     Помимо этого client.html/admin.html/owner.html при загрузке вызывают
     api('getMyTheme', {userId: tgUser.id}) и, если на сервере (лист "ТЕМЫ" в
     Google Sheets, см. Code.gs) сохранена другая схема — досинхронизируют её
     через applyBrand(). При выборе схемы через openBrandSheet() каждый файл
     сам вызывает api('saveTheme', {userId, theme}) после applyBrand(). Это
     нужно, чтобы личная схема не терялась, когда Telegram WebView чистит
     localStorage, и не путалась при тестировании разных ролей с одного
     телефона — раньше все три файла делили один и тот же ключ localStorage.
     Общий "бренд мойки по умолчанию" для реальных клиентов, которого раньше
     касался комментарий здесь — отдельная, ещё не реализованная фича на
     уровне реестра (saveSettings в CONFIG), с личной темой пользователя её
     путать не нужно. */
  const BRAND_KEY = 'cw_theme_override';
  const BRAND_LIST = ['avtohimiya', 'voda', 'chrome', 'mercedes', 'telegram'];

  function resolveBrand(configTheme){
    try{
      const saved = localStorage.getItem(BRAND_KEY);
      if(saved && BRAND_LIST.includes(saved)) return saved;
    }catch(e){}
    return (configTheme && BRAND_LIST.includes(configTheme)) ? configTheme : 'avtohimiya';
  }

  function applyBrand(theme){
    if(!BRAND_LIST.includes(theme)) return;
    document.body.dataset.theme = theme;
    try{ localStorage.setItem(BRAND_KEY, theme); }catch(e){}
    const cs = getComputedStyle(document.body);
    setChrome(cs.getPropertyValue('--bg').trim(), cs.getPropertyValue('--surface').trim());
  }

  function getBrand(){ return document.body.dataset.theme || 'avtohimiya'; }

  const tgUser = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user : {id:'demo-user'};

  function resolveTenantId(){
    const urlParams = new URLSearchParams(window.location.search);
    if(urlParams.get('tenant')) return urlParams.get('tenant');
    try{ if(tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) return tg.initDataUnsafe.start_param; }catch(e){}
    return null;
  }

  async function loadConfig(){
    const tenantId = resolveTenantId();
    const registryUrl = (typeof REGISTRY_URL !== 'undefined') ? REGISTRY_URL : null;
    const demoConfig = (typeof DEMO_CONFIG !== 'undefined') ? DEMO_CONFIG : {status:'active'};
    if(!tenantId || !registryUrl || registryUrl.indexOf('PASTE_') === 0){
      return Object.assign({}, demoConfig, {_demo:true});
    }
    try{
      const res = await fetch(registryUrl + '?action=getTenantConfig&tenant=' + encodeURIComponent(tenantId));
      if(!res.ok) throw new Error('registry error');
      const data = await res.json();
      if(!data.ok || !data.config) throw new Error('tenant not found');
      return data.config;
    }catch(e){
      return Object.assign({}, demoConfig, {_demo:true});
    }
  }

  return { tg, tgUser, haptic, setChrome, resolveTenantId, loadConfig, applyMode, toggleMode, getMode, confirmAsync, alertAsync, resolveBrand, applyBrand, getBrand, BRAND_LIST };
})();
