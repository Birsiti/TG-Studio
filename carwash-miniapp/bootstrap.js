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
  if(tg){
    try{
      tg.ready(); tg.expand();
      tg.MainButton && tg.MainButton.hide();
    }catch(e){}
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

  return { tg, tgUser, haptic, setChrome, resolveTenantId, loadConfig };
})();
