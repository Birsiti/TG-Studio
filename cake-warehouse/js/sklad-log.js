// изменено 2026-10-17 01:30
/* Вкладка «Журнал»: все движения тортов, фильтры и CSV. */
(function(){
  "use strict";
  const {html, icon, $, $$, date: D, num, haptic} = Kit;
  const {api, P, W, L, C, S, T, CATS, byCat, filterRows, nameKey, pcs, fail, stockOf, loadStock} = Cake;

  const RANGES = [['0','Сегодня'], ['6','7 дней'], ['29','30 дней']];
  let logRange = '6', logType = '', LOG = [];
  async function renderLog(){
    $('#logRange').innerHTML = String(html`${RANGES.map(([v, l])=>html`<button type="button" class="chip${logRange === v ? ' is-on' : ''}" data-r="${v}">${l}</button>`)}`);
    $('#logType').innerHTML = String(html`<button type="button" class="chip${logType ? '' : ' is-on'}" data-y="">Все</button>${Object.entries(Cake.refs.moveTypes).map(([k, l])=>html`<button type="button" class="chip${logType === k ? ' is-on' : ''}" data-y="${k}">${l}</button>`)}`);
    const r = await api('getMoves', {from:D.add(D.today(), -parseInt(logRange, 10)), to:D.today(), type:logType || undefined});
    if(!r.ok){ fail(r); return; }
    LOG = r.moves;
    let last = '';
    $('#logList').innerHTML = LOG.length ? String(html`${LOG.map(m=>{
      const head = m.date !== last ? html`<div class="eyebrow" style="margin:16px 0 6px">${D.label(m.date)}</div>` : ''; last = m.date;
      return html`${head}<div class="row" style="cursor:default"><span class="row-main"><span class="row-title">${L(m.productId)}</span>
        <span class="row-sub">${Cake.refs.moveTypes[m.type]}${m.cityId ? ' · ' + C(m.cityId).name : ''}${m.note ? ' · ' + m.note : ''}</span></span>
        <span class="row-end"><span class="qty" style="color:${m.qty < 0 ? 'var(--danger)' : 'var(--ok)'}">${m.qty > 0 ? '+' : '−'}${Math.abs(m.qty)}</span></span></div>`;
    })}`) : String(html`<div class="empty">${icon('list')}<div class="empty-title">Движений нет</div></div>`);
  }
  Kit.on($('#logRange'), 'click', '[data-r]', (e, el)=>{ logRange = el.dataset.r; haptic('select'); renderLog(); });
  Kit.on($('#logType'), 'click', '[data-y]', (e, el)=>{ logType = el.dataset.y; haptic('select'); renderLog(); });
  $('#logCsv').addEventListener('click', ()=>{
    Kit.csv(`sklad-${D.today()}.csv`, [['Дата','Тип','Категория','Наименование','Вес, г','Кол-во','Город','Рейс','Комментарий']].concat(
      LOG.map(m=>[m.date, Cake.refs.moveTypes[m.type], P(m.productId).cat, P(m.productId).name, P(m.productId).weightG, m.qty, m.cityId ? C(m.cityId).name : '', m.tripId || '', m.note])));
  });

  Cake.tabs.log = renderLog;
})();
