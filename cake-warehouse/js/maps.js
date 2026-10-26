// изменено 2026-10-26 22:50
/* Адреса точек на карте: одна точка — поиск по адресу (Яндекс Карты, в Беларуси точнее с адресами),
   весь рейс — маршрут через все точки в Google Картах. Google берёт в одну ссылку не больше 11 точек
   (откуда, 9 промежуточных, куда), поэтому длинный рейс делится на части, каждая следующая начинается
   там, где кончилась прежняя. */
window.CakeMap = (function(){
  "use strict";
  const BASE = 'https://yandex.by/maps/';
  const MAX = 11;
  const enc = s=> encodeURIComponent(String(s || '').trim());
  // адрес без страны Google ищет по всему миру — добавляем; «широта,долгота» оставляем как есть
  const place = s=> { s = String(s || '').trim(); return /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(s) || /беларусь/i.test(s) ? s : s + ', Беларусь'; };
  function parts(pts){
    const out = [];
    for(let i = 0; i < pts.length - 1; i += MAX - 1) out.push(pts.slice(i, i + MAX));
    return out;
  }
  const gurl = chunk=> `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${enc(chunk[0])}&destination=${enc(chunk[chunk.length - 1])}`
    + (chunk.length > 2 ? `&waypoints=${chunk.slice(1, -1).map(enc).join('%7C')}` : '');
  return {
    one: addr=> Kit.openLink(`${BASE}?text=${enc(addr)}`),
    // addrs — по порядку объезда; в начале и в конце можно дать склад («широта,долгота»)
    route: addrs=>{
      const pts = addrs.filter(Boolean).map(place), ch = parts(pts);
      if(!ch.length) return;
      if(ch.length === 1) return Kit.openLink(gurl(ch[0]));
      const html = Kit.html, from = ch.map((c, i)=> i * (MAX - 1) + 1);
      const sh = Kit.sheet({title:'Маршрут на карте', sub:`${pts.length} точек — Google берёт по ${MAX} за раз, части идут одна за другой`, body: html`
        <div class="list">${ch.map((c, i)=> html`<button class="row" type="button" data-part="${i}"><span class="row-main"><span class="row-title">Часть ${i + 1}</span><span class="row-sub">точки ${from[i]}–${from[i] + c.length - 1}</span></span></button>`)}</div>`});
      Kit.on(sh.el, 'click', '[data-part]', (e, el)=> Kit.openLink(gurl(ch[+el.dataset.part])));
    }
  };
})();
