// изменено 2026-10-18 13:00
/* Экран водителя: мои рейсы, долг по ящикам, отчёт о возврате. */
(function(){
  "use strict";
  const {html, icon, $, $$, date: D, num, haptic} = Kit;
  const api = Kit.createApi({bot:'cake', mock: window.CakeMock});
  $('#mark').innerHTML = icon('truck');
  $('#refreshBtn').innerHTML = icon('refresh');

  const ST = {draft:['Собирается на складе','pill-warn'], shipped:['В пути','pill-info'], reported:['Отчёт сдан','pill-accent'], closed:['Принят складом','pill-ok']};
  const PICK_KEY = 'tgs-cake-driver';
  let REFS = null, ME = null, TRIPS = [], DEBT = [], restricted = false;
  const P = id=> REFS.products.find(x=>x.id === id) || {name:'?'};
  const W = g=> !g ? '' : g < 1000 ? g + ' г' : String(g / 1000).replace('.', ',') + ' кг';
  const L = id=> { const p = P(id); return p.name + (p.weightG ? ', ' + W(p.weightG) : ''); };
  const C = id=> REFS.cities.find(x=>x.id === id) || {name:'?', code:'—'};
  const T = id=> REFS.tara.find(x=>x.id === id) || {name:'?'};
  const fail = r=> { Kit.toast(r.message || 'Не получилось', 'error'); haptic('error'); };

  async function load(){
    const refs = await api('getRefs'), me = await api('getMe');  // по очереди: первый ответ решает, сервер или демо
    if(api.mode() === 'demo') $('#modeNote').innerHTML = String(html`<p class="mode-note">Демо-версия: данные примерные и хранятся только в этом телефоне.</p>`);
    if(!refs.ok){ $('#view').innerHTML = String(html`<div class="empty">${icon('lock')}<div class="empty-title">Нет доступа</div>Попросите кладовщика добавить ваш Telegram в список водителей</div>`); return; }
    REFS = refs; restricted = me.ok && me.restricted;
    if(!load.hello){ load.hello = true; api('hello', {page:'driver'}); }  // журнал «кто заходит»
    const picked = Kit.store(PICK_KEY);
    const r = await api('getMyTrips', {driverId:(me.ok && me.staff) ? undefined : picked || undefined});
    ME = r.ok ? r.driver : null; TRIPS = r.ok ? r.trips : []; DEBT = (r.ok && r.taraDebt) || [];
    render();
  }

  function render(){
    if(!ME){ return renderPick(); }
    const active = TRIPS.filter(t=>/draft|shipped|reported/.test(t.status));
    const done = TRIPS.filter(t=>t.status === 'closed');
    $('#view').innerHTML = String(html`
      <div class="page-head"><h1 class="page-title">${ME.name.split(' ')[0]}, привет</h1>
        <p class="page-sub">${ME.car || 'Машина не указана'} ${restricted ? '' : html`· <button class="link-btn" type="button" id="swap">сменить водителя</button>`}</p></div>
      <p><span class="thermo">+2…+6 °C в кузове</span></p>
      ${DEBT.length ? html`<div class="card section" style="display:flex;align-items:center;gap:12px">${icon('layers')}<span style="flex:1">Ящиков на руках — верните на склад</span><span class="qty is-low">${DEBT.reduce((a, d)=>a + d.qty, 0)}</span></div>` : ''}
      <div class="section"><div class="section-head"><h2 class="section-title">Текущие рейсы</h2></div>
        ${active.length ? active.map(card) : html`<div class="empty">${icon('truck')}<div class="empty-title">Рейсов нет</div>Склад ещё не назначил вам рейс</div>`}</div>
      ${done.length ? html`<div class="section"><div class="section-head"><h2 class="section-title">Последние</h2></div>${done.slice(0, 8).map(card)}</div>` : ''}`);
  }
  function card(t){
    const c = C(t.cityId), st = ST[t.status], total = t.lines.reduce((s, l)=>s + l.qty, 0);
    return html`<div class="waybill"><button class="waybill-head" type="button" data-t="${t.id}">
        <span class="code is-accent">${c.code}</span>
        <span class="waybill-main"><span class="waybill-title">${c.name}\u00a0·\u00a0№${t.num}</span><span class="waybill-sub" style="display:block">${D.label(t.date)}</span></span>
        <span class="pill ${st[1]}">${st[0]}</span></button>
      <div class="waybill-tear"></div>
      <div class="waybill-body">${(t.stops || []).length ? html`<span>Точек <b>${t.stops.length}</b></span>` : ''}<span>Тортов <b>${total}</b></span>${t.taraOut.map(l=>html`<span>${T(l.taraId).name.split(' ')[0]} <b>${l.qty}</b></span>`)}</div></div>`;
  }

  function renderPick(){
    const drivers = REFS.staff.filter(s=>s.role === 'driver' && s.active);
    $('#view').innerHTML = String(html`<div class="page-head"><h1 class="page-title">Кто за рулём?</h1>
      <p class="page-sub">${restricted ? 'Ваш Telegram не привязан к водителю — попросите кладовщика указать ваш id' : 'Демо: выберите водителя. В рабочем режиме бот узнаёт водителя по Telegram.'}</p></div>
      ${restricted ? '' : html`<div class="list">${drivers.map(d=>html`<button class="row" type="button" data-pick="${d.id}"><span class="avatar">${Kit.initials(d.name)}</span>
        <span class="row-main"><span class="row-title">${d.name}</span><span class="row-sub">${d.car}</span></span>${icon('right', 'row-chev')}</button>`)}</div>`}`);
  }

  Kit.on($('#view'), 'click', '[data-pick]', (e, el)=>{ Kit.store(PICK_KEY, el.dataset.pick); haptic('select'); load(); });
  Kit.on($('#view'), 'click', '#swap', ()=>{ ME = null; Kit.store(PICK_KEY, ''); renderPick(); });
  Kit.on($('#view'), 'click', '[data-t]', (e, el)=> openTrip(TRIPS.find(x=>x.id === el.dataset.t)));

  function openTrip(t){
    if(!t) return;
    const c = C(t.cityId);
    const sh = Kit.sheet({title:`${c.name} · №${t.num}`, sub:`${D.label(t.date)} · ${ST[t.status][0]}`, body: html`
      ${stopsBlock(t)}
      <div class="eyebrow${(t.stops || []).length ? ' section' : ''}" style="margin-bottom:8px">Везёте</div>
      ${t.lines.map(l=>html`<div class="kv"><span class="k">${L(l.productId)}</span><span class="v mono">${l.qty}${t.status === 'closed' ? ' → ' + l.delivered : ''}</span></div>`)}
      ${t.taraOut.length ? html`<div class="eyebrow section" style="margin-bottom:8px">Тара</div>${t.taraOut.map(l=>html`<div class="kv"><span class="k">${T(l.taraId).name}</span><span class="v mono">${l.qty}</span></div>`)}` : ''}
      ${t.note ? html`<p class="hint section">${t.note}</p>` : ''}
      ${odoBlock(t)}`,
      actions: t.status === 'shipped' && t.odoOut == null ? html`<button class="btn btn-primary btn-block" type="button" id="goOut">${icon('truck')}Выезжаю</button>`
        : /shipped|reported/.test(t.status) ? html`<button class="btn btn-primary btn-block" type="button" id="goRep">${icon('clipboard')}${t.status === 'reported' ? 'Исправить отчёт' : 'Сдать рейс'}</button>` : ''});
    Kit.on(sh.el, 'click', '[data-map]', (e, el)=>{ haptic('light'); CakeMap.one(el.dataset.map); });
    const all = sh.$('#mapAll'); if(all) all.addEventListener('click', ()=>{ haptic('light'); CakeMap.route(t.stops.map(s=>s.address)); });
    const b = sh.$('#goRep'); if(b) b.addEventListener('click', ()=>{ sh.close(); report(t); });
    const go = sh.$('#goOut'); if(go) go.addEventListener('click', async ()=>{
      const km = odoValue(sh.$('#odoOut')); if(km == null) return;
      Kit.busy(go, true); const r = await api('setOdometer', {id:t.id, kind:'out', km}); Kit.busy(go, false);
      if(!r.ok){ fail(r); return; }
      haptic('success'); sh.close(); Kit.toast('Хорошей дороги!', 'ok'); load();
    });
  }

  // Маршрут: заявки по порядку объезда — №, заказчик, адрес, сколько везти, кнопка на карту
  function stopsBlock(t){
    const S = t.stops || [];
    if(!S.length) return '';
    return html`<div class="section-head" style="margin-bottom:8px"><span class="eyebrow">Маршрут · ${S.length} ${S.length === 1 ? 'точка' : S.length < 5 ? 'точки' : 'точек'}</span></div>
      ${S.length > 1 ? html`<button class="btn btn-ghost btn-block" type="button" id="mapAll" style="margin-bottom:8px">${icon('route')}Весь маршрут на карте</button>` : ''}
      <div class="list">${S.map((s, i)=>html`<div class="row stop-row"><span class="avatar">${i + 1}</span>
        <span class="row-main"><span class="row-title">№${s.num} · ${s.customer}</span>
          <span class="row-sub">${s.address}</span>
          <span class="row-sub">${s.qty} шт${s.boxes ? ' · ящиков ' + s.boxes : ''}${s.comment ? ' · ' + s.comment : ''}</span></span>
        <button class="icon-btn" type="button" data-map="${s.address}" aria-label="На карте">${icon('pin')}</button></div>`)}</div>`;
  }

  // Спидометр: на выезде — поле перед «Выезжаю», потом — показания и пробег
  function odoBlock(t){
    if(t.status === 'shipped' && t.odoOut == null) return html`<label class="field section"><span class="field-label">Спидометр на выезде, км</span>
      <input class="input" id="odoOut" type="number" inputmode="numeric" min="0" placeholder="например 84 310"></label>`;
    if(t.odoOut == null) return '';
    return html`<div class="eyebrow section" style="margin-bottom:8px">Спидометр</div>
      <div class="kv"><span class="k">Выезд</span><span class="v mono">${num(t.odoOut)} км</span></div>
      ${t.odoBack != null ? html`<div class="kv"><span class="k">Возврат</span><span class="v mono">${num(t.odoBack)} км</span></div>
        <div class="kv"><span class="k">Пробег</span><span class="v mono">${num(t.odoBack - t.odoOut)} км</span></div>` : ''}`;
  }
  function odoValue(el){
    const v = String(el.value).replace(/\s/g, '');
    if(!/^\d{1,7}$/.test(v)){ Kit.toast('Укажите показания спидометра', 'error'); haptic('warning'); el.focus(); return null; }
    return +v;
  }

  function report(t){
    const rep = t.report ? JSON.parse(t.report) : {returns:[], taraBack:[], comment:''};
    const rb = {}; rep.returns.forEach(r=> rb[r.productId] = r);
    const tb = {}; rep.taraBack.forEach(l=> tb[l.taraId] = l.qty);
    const sh = Kit.sheet({title:'Отчёт по рейсу', sub:`${C(t.cityId).name} · что везёте обратно`, body: html`
      <div class="field-row">
        ${t.odoOut == null ? html`<label class="field"><span class="field-label">Спидометр на выезде</span><input class="input" id="rOut" type="number" inputmode="numeric" min="0"></label>` : ''}
        <label class="field"><span class="field-label">Спидометр сейчас, км</span><input class="input" id="rBack" type="number" inputmode="numeric" min="0" value="${t.odoBack != null ? t.odoBack : ''}" placeholder="${t.odoOut != null ? 'на выезде ' + num(t.odoOut) : ''}"></label>
      </div>
      <div class="qrow section" style="color:var(--ink-3);font-size:13px"><span class="qrow-name" style="font-weight:400">Торт</span><span style="width:84px;text-align:center">Целые</span><span style="width:84px;text-align:center">Брак</span></div>
      ${t.lines.map(l=>html`<div class="qrow"><span class="qrow-name">${Kit.nobr(P(l.productId).name)}<small>${W(P(l.productId).weightG)} · увезли ${l.qty}</small></span>
        <input class="input" type="number" inputmode="numeric" min="0" placeholder="0" data-back="${l.productId}" value="${(rb[l.productId] || {}).back || ''}">
        <input class="input" type="number" inputmode="numeric" min="0" placeholder="0" data-spoil="${l.productId}" value="${(rb[l.productId] || {}).spoiled || ''}"></div>`)}
      ${t.taraOut.length ? html`<div class="eyebrow section" style="margin-bottom:4px">Ящики сдаю</div>
        ${t.taraOut.map(l=>html`<div class="qrow"><span class="qrow-name">${T(l.taraId).name}<small>увезли ${l.qty}</small></span><input class="input" type="number" inputmode="numeric" min="0" placeholder="0" data-tb="${l.taraId}" value="${tb[l.taraId] != null ? tb[l.taraId] : ''}"></div>`)}` : ''}
      <label class="field section"><span class="field-label">Комментарий для склада</span><textarea class="textarea" id="rCom" maxlength="300" rows="2">${rep.comment || ''}</textarea></label>`,
      actions: html`<button class="btn btn-primary btn-block" type="button" id="rGo">${icon('send')}Отправить на склад</button>`});
    sh.$('#rGo').addEventListener('click', async ()=>{
      const v = el=> parseInt(el.value, 10) || 0;
      const returns = t.lines.map(l=>({productId:l.productId, back:v(sh.$(`[data-back="${l.productId}"]`)), spoiled:v(sh.$(`[data-spoil="${l.productId}"]`))})).filter(r=>r.back || r.spoiled);
      const taraBack = $$('[data-tb]', sh.el).map(el=>({taraId:el.dataset.tb, qty:v(el)})).filter(l=>l.qty > 0);
      const out = sh.$('#rOut') ? odoValue(sh.$('#rOut')) : t.odoOut; if(out == null) return;
      const back = odoValue(sh.$('#rBack')); if(back == null) return;
      Kit.busy(sh.$('#rGo'), true);
      for(const [kind, km] of [['out', out], ['back', back]]){
        if(km === (kind === 'out' ? t.odoOut : t.odoBack)) continue;
        const o = await api('setOdometer', {id:t.id, kind, km});
        if(!o.ok){ Kit.busy(sh.$('#rGo'), false); fail(o); return; }
        t[kind === 'out' ? 'odoOut' : 'odoBack'] = km;
      }
      const r = await api('reportTrip', {id:t.id, returns, taraBack, comment:sh.$('#rCom').value.trim()});
      Kit.busy(sh.$('#rGo'), false);
      if(!r.ok){ fail(r); return; }
      haptic('success'); sh.close(); Kit.toast('Отчёт отправлен — склад примет рейс', 'ok'); load();
    });
  }

  $('#refreshBtn').addEventListener('click', ()=>{ haptic('light'); load(); });
  Kit.ready(load);
})();
