// изменено 2026-10-18 13:00
/* Адреса точек на карте: одна точка — поиск по адресу, весь рейс — маршрут от «где я» через все точки.
   Яндекс Карты (в Беларуси точнее с адресами); в Telegram ссылка откроет приложение карт или браузер. */
window.CakeMap = (function(){
  "use strict";
  const BASE = 'https://yandex.by/maps/';
  const enc = s=> encodeURIComponent(String(s || '').trim());
  return {
    one: addr=> Kit.openLink(`${BASE}?text=${enc(addr)}`),
    route: addrs=> Kit.openLink(`${BASE}?rtext=~${addrs.filter(Boolean).map(enc).join('~')}&rtt=auto`)
  };
})();
