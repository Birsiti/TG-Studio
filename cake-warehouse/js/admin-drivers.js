// изменено 2026-10-17 21:00
/* Руководитель, вкладка «Водители»: рейсы, точки, км по спидометру, возвраты, брак,
   недостача и ящики по каждому водителю за период (getDriverStats). */
window.CakeDriverStats = (function(){
  "use strict";
  const {html, icon, $, date: D, num, haptic} = Kit;
  const PERIODS = [[7, '7 дней'], [30, '30 дней'], [90, '3 месяца']];
  const KINDS = [['all', 'Все'], ['own', 'Свои'], ['hired', 'Наёмные']];
  let days = 30, kind = 'all', api = null, staff = [];
  const hiredOf = id=> !!(staff.find(x=>x.id === id) || {}).hired;

  async function render(apiFn, staffList){
    api = apiFn; staff = staffList || [];
    $('#drPeriod').innerHTML = String(html`${PERIODS.map(([d, t])=>html`<button class="chip${d === days ? ' is-on' : ''}" type="button" data-d="${d}">${t}</button>`)}`);
    $('#drKind').innerHTML = String(html`${KINDS.map(([k, t])=>html`<button class="chip${k === kind ? ' is-on' : ''}" type="button" data-k="${k}">${t}</button>`)}`);
    const to = D.today(), r = await api('getDriverStats', {from:D.add(to, -(days - 1)), to});
    if(!r.ok){ Kit.toast(r.message || 'Не получилось', 'error'); return; }
    const L = r.drivers.filter(d=> kind === 'all' || (kind === 'hired') === hiredOf(d.driverId)), sum = k=> L.reduce((s, d)=>s + d[k], 0);
    $('#drSub').textContent = `${D.label(r.from)} — ${D.label(r.to)}`;
    $('#drStats').innerHTML = String(html`
      <div class="stat"><div class="stat-label">Рейсов</div><div class="stat-value">${num(sum('trips'))}</div><div class="stat-delta">точек ${num(sum('points'))}</div></div>
      <div class="stat"><div class="stat-label">Пробег</div><div class="stat-value">${num(sum('km'))}</div><div class="stat-delta">км по спидометру</div></div>
      <div class="stat"><div class="stat-label">Возвраты</div><div class="stat-value">${num(sum('back') + sum('spoiled'))}</div><div class="stat-delta">брак ${num(sum('spoiled'))}</div></div>
      <div class="stat"><div class="stat-label">Недостача</div><div class="stat-value">${num(sum('shortage'))}</div><div class="stat-delta ${sum('shortage') ? 'down' : ''}">шт по отчётам</div></div>`);
    $('#drList').innerHTML = L.length ? String(html`${L.map(card)}`)
      : String(html`<div class="empty">${icon('truck')}<div class="empty-title">Рейсов нет</div>За этот период ${kind === 'own' ? 'свои водители' : kind === 'hired' ? 'наёмные водители' : 'водители'} не ездили</div>`);
  }

  function card(d){
    const s = staff.find(x=>x.id === d.driverId) || {name:'?', car:''};
    const ret = d.back + d.spoiled, pct = d.shipped ? Math.round(100 * ret / d.shipped) : 0;
    const perTrip = d.trips - d.noOdo ? Math.round(d.km / (d.trips - d.noOdo)) : 0;
    const row = (k, v, warn)=> html`<div class="kv"><span class="k">${k}</span><span class="v mono${warn ? ' is-low' : ''}">${v}</span></div>`;
    return html`<div class="card section">
      <div class="row-title" style="font-weight:700">${s.name}</div><div class="hint" style="margin:2px 0 6px">${s.hired ? 'наёмный' + (s.carrier ? ' · ' + s.carrier : '') : 'своя машина'} · ${s.car || 'машина не указана'}</div>
      ${row('Рейсов · точек', `${d.trips} · ${d.points}`)}
      ${row('Пробег', d.km ? `${num(d.km)} км · ${num(perTrip)} на рейс` : '—')}
      ${d.kmGap ? row('Между рейсами', `${num(d.kmGap)} км`, d.kmGap > d.km * 0.1) : ''}
      ${d.noOdo ? row('Без спидометра', `${d.noOdo} рейс.`, true) : ''}
      ${row('Отгружено', `${num(d.shipped)} шт`)}
      ${row('Вернул', `${num(d.back)} целых · ${num(d.spoiled)} брак · ${pct}%`, pct >= 10)}
      ${row('Недостача', d.shortage ? `${num(d.shortage)} шт` : 'нет', d.shortage > 0)}
      ${row('Ящики на руках', num(d.taraDebt))}
    </div>`;
  }

  Kit.on($('#drPeriod'), 'click', '[data-d]', (e, el)=>{ days = +el.dataset.d; haptic('select'); render(api, staff); });
  Kit.on($('#drKind'), 'click', '[data-k]', (e, el)=>{ kind = el.dataset.k; haptic('select'); render(api, staff); });
  return render;
})();
