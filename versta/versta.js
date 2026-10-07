// изменено 2026-10-08 02:48
/* ============================================================
   versta.js — общее для ролей ВЕРСТЫ: код маршрута, длительность,
   заполненность, статусы пассажиров и поездки.
   ============================================================ */
window.V = (function(){
  "use strict";
  const {html, icon} = Kit;
  function code(c, sm){ return html`<span class="rcode${sm ? ' sm' : ''}">${c}</span>`; }
  function dur(min){ const h = Math.floor(min / 60), m = min % 60; return h ? h + ' ч' + (m ? ' ' + m + ' мин' : '') : m + ' мин'; }
  function fill(filled, total){
    const r = total ? filled / total : 0;
    return html`<div class="fill"><i class="${r >= 1 ? 'full' : r >= .7 ? 'mid' : ''}" style="width:${Math.min(100, Math.round(r * 100))}%"></i></div>`;
  }
  const PAX = {'ожидание':['Ждёт','pill-muted'], 'посажен':['В салоне','pill-ok'], 'не пришёл':['Не пришёл','pill-danger'], 'cancelled':['Отменил','pill-muted']};
  function pax(s){ const x = PAX[s] || [s, '']; return html`<span class="pill ${x[1]}">${x[0]}</span>`; }
  const DRV = {'ожидание':['По расписанию','pill-muted'], 'в пути':['В пути','pill-accent'], 'завершён':['Завершён','pill-ok']};
  function drv(s){ const x = DRV[s] || [s, '']; return html`<span class="pill ${x[1]}">${x[0]}</span>`; }
  function addMin(hm, m){ const t = Kit.date.toMinutes(hm) + m; const h = Math.floor(t / 60) % 24, mm = t % 60; return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm; }
  function phoneLink(p){ return html`<a class="mono" href="tel:${p}">${Kit.phone.pretty(p)}</a>`; }
  return {code, dur, fill, pax, drv, addMin, phoneLink, icon};
})();
