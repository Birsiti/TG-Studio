// изменено 2026-10-18 16:30
/* Вкладка «Рейсы»: сборка → отгрузка → приёмка с возвратом тортов и ящиков. */
(function(){
  "use strict";
  const {html, icon, $, $$, date: D, num, haptic} = Kit;
  const {api, P, W, L, C, S, T, CATS, byCat, filterRows, nameKey, pcs, fail, stockOf, loadStock} = Cake;

  const TRIP_ST = {draft:['На сборке','pill-warn'], shipped:['В пути','pill-info'], reported:['Ждёт приёмки','pill-accent'], closed:['Закрыт','pill-ok'], cancelled:['Отменён','pill-muted']};
  let TRIPS = [], SHIFT = [];

  async function renderTrips(){
    const [r, s] = await Promise.all([api('getTrips'), api('getShifts', {from:D.today(), to:D.today()})]);
    if(!r.ok){ fail(r); return; }
    TRIPS = r.trips; SHIFT = (s.ok && s.days[D.today()]) || [];
    const groups = [['reported','Ждут приёмки'], ['draft','На сборке'], ['shipped','В пути'], ['closed','Закрытые']];
    const out = groups.map(([st, title])=>{
      let list = TRIPS.filter(t=>t.status === st);
      if(st === 'closed') list = list.slice(0, 15);
      if(!list.length) return '';
      return html`<div class="section"><div class="section-head"><h2 class="section-title">${title}</h2><span class="hint">${list.length}</span></div>${list.map(waybill)}</div>`;
    });
    $('#tripList').innerHTML = TRIPS.length ? String(html`${out}`) : String(html`<div class="empty">${icon('truck')}<div class="empty-title">Рейсов пока нет</div>Соберите первый рейс в город</div>`);
  }
  function waybill(t){
    const c = C(t.cityId), d = S(t.driverId), st = TRIP_ST[t.status];
    const total = t.lines.reduce((s, l)=>s + l.qty, 0);
    const tara = t.taraOut.map(l=>`${T(l.taraId).name.split(' ')[0]} ${l.qty}`).join(', ');
    return html`<div class="waybill"><button class="waybill-head" type="button" data-t="${t.id}">
        <span class="code is-accent">${c.code || c.name.slice(0, 3).toUpperCase()}</span>
        <span class="waybill-main"><span class="waybill-title">${c.name}\u00a0·\u00a0№${t.num}</span>
          <span class="waybill-sub" style="display:block">${D.label(t.date)} · ${d ? d.name : 'водитель не выбран'}</span></span>
        <span class="pill ${st[1]}">${st[0]}</span></button>
      <div class="waybill-tear"></div>
      <div class="waybill-body">${(t.stops || []).length ? html`<span>Точек <b>${t.stops.length}</b></span>` : ''}<span>Тортов <b>${total}</b></span><span>Позиций <b>${t.lines.length}</b></span>${tara ? html`<span>Тара <b>${tara}</b></span>` : ''}</div></div>`;
  }
  Kit.on($('#tripList'), 'click', '[data-t]', (e, el)=> openTrip(TRIPS.find(x=>x.id === el.dataset.t)));
  $('#tripAdd').addEventListener('click', ()=> editTrip(null));

  function openTrip(t){
    if(!t) return;
    const c = C(t.cityId), d = S(t.driverId);
    const rep = t.report ? JSON.parse(t.report) : null;
    const closed = t.status === 'closed';
    const sh = Kit.sheet({title:`${c.name} · №${t.num}`, sub:`${D.label(t.date)} · ${TRIP_ST[t.status][0]}`, body: html`
      <div class="kv"><span class="k">Водитель</span><span class="v">${d ? d.name : '—'}</span></div>
      ${d && (d.car || d.hired) ? html`<div class="kv"><span class="k">Машина</span><span class="v">${d.hired ? `наёмная${d.carrier ? ' · ' + d.carrier : ''}${d.car ? ' · ' : ''}` : ''}${d.car || ''}</span></div>` : ''}
      ${t.odoOut != null ? html`<div class="kv"><span class="k">Спидометр</span><span class="v mono">${num(t.odoOut)}${t.odoBack != null ? ` → ${num(t.odoBack)} · ${num(t.odoBack - t.odoOut)} км` : ' → в пути'}</span></div>` : ''}
      ${t.note ? html`<div class="kv"><span class="k">Комментарий</span><span class="v">${t.note}</span></div>` : ''}
      ${stopsView(t)}
      <div class="section"><div class="eyebrow" style="margin-bottom:8px">Состав</div>
        ${t.lines.map(l=>html`<div class="kv"><span class="k">${L(l.productId)}</span><span class="v mono">${l.qty}${closed ? html` <span class="hint">→ ${l.delivered}${l.back ? ' · возв ' + l.back : ''}${l.spoiled ? ' · брак ' + l.spoiled : ''}</span>` : ''}</span></div>`)}</div>
      ${t.taraOut.length ? html`<div class="section"><div class="eyebrow" style="margin-bottom:8px">Тара</div>${t.taraOut.map(l=>{ const b = (t.taraBack.find(x=>x.taraId === l.taraId) || {}).qty; return html`<div class="kv"><span class="k">${T(l.taraId).name}</span><span class="v mono">${l.qty}${closed ? ' → вернули ' + (b || 0) : ''}</span></div>`; })}</div>` : ''}
      ${rep ? html`<div class="section"><div class="eyebrow" style="margin-bottom:8px">Отчёт водителя</div><p class="hint">Возврат: ${rep.returns.length ? rep.returns.map(r=>`${L(r.productId)} — ${r.back}${r.spoiled ? ' (брак ' + r.spoiled + ')' : ''}`).join(', ') : 'нет'}. Тара: ${rep.taraBack.map(l=>T(l.taraId).name + ' ' + l.qty).join(', ') || 'нет'}.${rep.comment ? ' «' + rep.comment + '»' : ''}</p></div>` : ''}`,
      actions: t.status === 'draft' ? html`<button class="btn btn-ghost" type="button" data-a="edit">${icon('edit')}Изменить</button><button class="btn btn-primary" type="button" data-a="ship">${icon('truck')}Отгрузить</button>`
        : /shipped|reported/.test(t.status) ? html`<button class="btn btn-primary btn-block" type="button" data-a="close">${icon('check')}Принять рейс</button>` : ''});
    Kit.on(sh.el, 'click', '[data-map]', (e, el)=>{ haptic('light'); CakeMap.one(el.dataset.map); });
    Kit.on(sh.el, 'click', '#mapAll', ()=>{ haptic('light'); CakeMap.route(t.stops.map(s=>s.address)); });
    Kit.on(sh.el, 'click', '[data-a]', async (e, el)=>{
      const a = el.dataset.a;
      if(a === 'edit'){ sh.close(); editTrip(t); return; }
      if(a === 'close'){ sh.close(); acceptTrip(t); return; }
      Kit.busy(el, true); const tara = await api('getTara'); Kit.busy(el, false);
      const d = tara.ok && (tara.drivers.find(x=>x.id === t.driverId) || null);
      const debt = d ? Cake.refs.tara.filter(x=>(d.tara[x.id] || {}).debt > 0).map(x=>({taraId:x.id, qty:d.tara[x.id].debt})) : [];
      const total = t.lines.reduce((s, l)=>s + l.qty, 0);
      if(!debt.length){
        if(!await Kit.confirm(`Отгрузить ${total} шт в ${c.name}? Остаток спишется со склада.`, 'Отгрузить')) return;
        return ship(el, {id:t.id});
      }
      shipSheet(t, d, debt, total, c, ()=>{ sh.close(); });
    });
    async function ship(el, payload, after){
      Kit.busy(el, true); const r = await api('shipTrip', payload); Kit.busy(el, false);
      if(!r.ok){ fail(r); return; }
      const back = (payload.taraBack || []).reduce((s, l)=>s + l.qty, 0);
      haptic('success'); Kit.toast(back ? `Рейс отгружен, принято ящиков: ${back}` : 'Рейс отгружен', 'ok'); sh.close(); if(after) after(); renderTrips(); loadStock();
    }
    // Водитель на погрузке — заодно сдаёт ящики с прошлых рейсов: кладовщик отмечает, сколько принял
    function shipSheet(t, d, debt, total, c, closeTrip){
      const s2 = Kit.sheet({title:`Отгрузка рейса №${t.num}`, sub:`${c.name} · ${total} шт · остаток спишется со склада`, body: html`
        <div class="eyebrow" style="margin-bottom:4px">Ящики с прошлых рейсов</div>
        <p class="hint" style="margin:0 0 8px">${d.name.split(' ')[0]} на погрузке — примите у него пустые ящики. Сколько сдал сейчас?</p>
        ${debt.map(x=>html`<div class="qrow"><span class="qrow-name">${T(x.taraId).name}<small>на руках ${x.qty}</small></span>
          <button class="chip" type="button" data-all="${x.taraId}" data-n="${x.qty}">все ${x.qty}</button>
          <input class="input" type="number" inputmode="numeric" min="0" max="${x.qty}" placeholder="0" data-tb="${x.taraId}"></div>`)}
        <p class="hint section">Не сдал — оставьте 0: ящики останутся за ним, их видно во вкладке «Ящики».${t.taraOut.length ? ` В этот рейс берёт: ${t.taraOut.map(l=>T(l.taraId).name + ' ' + l.qty).join(', ')}.` : ''}</p>`,
        actions: html`<button class="btn btn-primary btn-block" type="button" id="sGo">${icon('truck')}Отгрузить</button>`});
      Kit.on(s2.el, 'click', '[data-all]', (e, el)=>{ s2.$(`[data-tb="${el.dataset.all}"]`).value = el.dataset.n; haptic('select'); });
      s2.$('#sGo').addEventListener('click', ()=>{
        const taraBack = $$('[data-tb]', s2.el).map(el=>({taraId:el.dataset.tb, qty:parseInt(el.value, 10) || 0})).filter(l=>l.qty > 0);
        ship(s2.$('#sGo'), {id:t.id, taraBack}, ()=>{ s2.close(); closeTrip(); });
      });
    }
  }

  // Точки рейса: № заявки, заказчик, адрес, штук; кнопка на карту
  const ORD_ST = {new:['Собирается','pill-warn'], picked:['Собрано','pill-ok']};
  // На сборке — собрана ли заявка; в пути и после — сдал ли водитель точку и с какими замечаниями
  function stopPill(t, s){
    if(t.status === 'draft') return html`<span class="pill ${ORD_ST[s.status][1]}">${ORD_ST[s.status][0]}</span>`;
    if(!s.report) return html`<span class="pill pill-muted">Не сдана</span>`;
    return s.report.ok ? html`<span class="pill pill-ok">Сдана</span>` : html`<span class="pill pill-warn">С замечаниями</span>`;
  }
  const stopIssues = rep=> [rep.lines.map(l=>{
      const what = [l.short && 'недостача ' + l.short, l.spoiled && 'брак ' + l.spoiled, l.resort && `пересорт ${l.resort}${l.resortTo ? ' (привезли ' + P(l.resortTo).name + ')' : ''}`].filter(Boolean).join(', ');
      return `${P(l.productId).name}: ${what}`; }).join('; '), rep.comment && `«${rep.comment}»`].filter(Boolean).join(' · ');

  function stopsView(t){
    const S = t.stops || [];
    if(!S.length) return '';
    return html`<div class="section"><div class="section-head" style="margin-bottom:8px"><span class="eyebrow">Маршрут · точек ${S.length}</span>
        ${S.length > 1 ? html`<button class="link-btn" type="button" id="mapAll">${icon('route')}на карте</button>` : ''}</div>
      <div class="list">${S.map((s, i)=>html`<div class="row stop-row"><span class="avatar">${i + 1}</span>
        <span class="row-main"><span class="row-title">№${s.num} · ${s.customer}</span><span class="row-sub">${s.address}</span>
          <span class="row-sub">${s.qty} шт${s.boxes ? ' · ящиков ' + s.boxes : ''} · ${stopPill(t, s)}</span>
          ${s.report && !s.report.ok ? html`<span class="row-sub stop-issues">${stopIssues(s.report)}</span>` : ''}
          ${s.photos ? html`<span class="row-sub">фото с точки: ${s.photos} — в карточке заявки</span>` : ''}</span>
        <button class="icon-btn" type="button" data-map="${s.address}" aria-label="На карте">${icon('pin')}</button></div>`)}</div></div>`;
  }

  async function editTrip(t){
    await loadStock();
    const st = {date:t ? t.date : D.today(), cityId:t ? t.cityId : '', driverId:t ? t.driverId : ''};
    const qty = {}; (t ? t.lines : []).forEach(l=> qty[l.productId] = l.qty);
    const tq = {}; (t ? t.taraOut : []).forEach(l=> tq[l.taraId] = l.qty);
    const drivers = Cake.refs.staff.filter(s=>s.role === 'driver' && s.active).sort((a, b)=> SHIFT.includes(b.id) - SHIFT.includes(a.id));
    const days = [0, 1, 2].map(n=>D.add(D.today(), n));
    if(t && !days.includes(t.date)) days.unshift(t.date);
    const sh = Kit.sheet({title:t ? `Рейс №${t.num}` : 'Новый рейс', sub:'Сборка: остаток спишется при отгрузке', body: html`
      <div class="eyebrow" style="margin-bottom:8px">Дата</div>
      <div class="chips" id="eDate">${days.map(d=>html`<button type="button" class="chip${st.date === d ? ' is-on' : ''}" data-v="${d}">${D.label(d)}</button>`)}</div>
      <div class="eyebrow section" style="margin-bottom:8px">Куда — маршрут или город <span class="hint" style="text-transform:none;letter-spacing:0">(с заявками — сам)</span></div>
      <div class="chips" id="eCity">${Cake.refs.cities.filter(c=>c.active || c.id === st.cityId).map(c=>html`<button type="button" class="chip${st.cityId === c.id ? ' is-on' : ''}" data-v="${c.id}">${c.name}</button>`)}</div>
      <div class="eyebrow section" style="margin-bottom:8px">Водитель</div>
      <div class="chips" id="eDrv">${drivers.map(s=>html`<button type="button" class="chip${st.driverId === s.id ? ' is-on' : ''}" data-v="${s.id}">${s.name.split(' ')[0]}${s.hired ? ' · наём.' : ''}${SHIFT.includes(s.id) ? ' · на смене' : ''}</button>`)}</div>
      <div class="section-head section" style="margin-bottom:8px"><span class="eyebrow">Заявки — точки маршрута</span><span class="hint" id="eOrdSum"></span></div>
      <p class="hint" style="margin:0 0 8px">Отмечайте по порядку объезда — номер у заявки и есть порядок. Водитель увидит адреса и кнопки на карту.</p>
      <div class="chips scroll" id="eRoutes"></div>
      <div class="list" id="eOrders" style="margin-top:8px"></div>
      <div id="eTorts">
      <div class="section-head section" style="margin-bottom:8px"><span class="eyebrow">Торты</span><span class="hint" id="eSum"></span></div>
      <div class="search">${icon('search')}<input class="input" id="eQ" type="search" placeholder="Найти торт" autocomplete="off"></div>
      <div class="chips" style="margin-top:8px"><button type="button" class="chip" id="eOnly">Только выбранные</button></div>
      <div id="eList">${byCat(Cake.refs.products.filter(p=>p.active || qty[p.id]), p=>html`<div class="qrow${qty[p.id] ? ' is-on' : ''}" data-name="${nameKey(p)}"><span class="qrow-name">${Kit.nobr(p.name)}<small>${W(p.weightG)} · на складе ${stockOf(p.id)}</small></span>
        <input class="input" type="number" inputmode="numeric" min="0" placeholder="0" data-q="${p.id}" value="${qty[p.id] || ''}"></div>`)}</div>
      <div class="eyebrow section" style="margin-bottom:4px">Ящики водителю</div>
      <div>${Cake.refs.tara.filter(x=>x.active).map(x=>html`<div class="qrow"><span class="qrow-name">${x.name}</span><input class="input" type="number" inputmode="numeric" min="0" placeholder="0" data-tq="${x.id}" value="${tq[x.id] || ''}"></div>`)}</div>
      </div>
      <p class="hint section" id="eFromOrders" hidden>Торты и ящики рейса считаются из выбранных заявок — отгрузить можно, когда все они собраны.</p>
      <label class="field section"><span class="field-label">Комментарий</span><input class="input" id="eNote" maxlength="300" value="${t ? t.note : ''}"></label>`,
      actions: html`${t ? html`<button class="btn btn-danger-soft" type="button" id="eCancel">Отменить рейс</button>` : ''}<button class="btn btn-primary" type="button" id="eSave">Сохранить</button>`});
    [['#eDate','date'], ['#eCity','cityId'], ['#eDrv','driverId']].forEach(([sel, key])=>{
      Kit.on(sh.$(sel), 'click', '[data-v]', (e, el)=>{ st[key] = el.dataset.v; $$(sel + ' .chip', sh.el).forEach(b=>b.classList.toggle('is-on', b === el)); haptic('select');
        if(key === 'date') loadOrders(); else if(key === 'cityId'){ route = routeOf(); drawOrders(); } });
    });
    // Заявки на дату рейса: свободные и уже в этом рейсе; выбор по порядку = порядок точек
    let ORD = [], PTS = [], sel = (t && t.stops || []).map(s=>s.orderId), route = '';
    const routeOf = ()=>{ const n = (Cake.refs.cities.find(c=>c.id === st.cityId) || {}).name; return ORD.some(o=>o.route === n) ? n : ''; };
    const ptOf = id=> PTS.find(x=>x.id === id) || {customer:'?', address:''};
    const qtyOf = o=> o.lines.reduce((s, l)=>s + l.qty + (l.bonus || 0), 0);
    async function loadOrders(){
      const r = await api('getOrders', {date:st.date});
      ORD = r.ok ? r.orders.filter(o=>!o.tripId || (t && o.tripId === t.id)) : []; PTS = r.ok ? r.points : [];
      sel = sel.filter(id=>ORD.some(o=>o.id === id)); route = routeOf(); drawOrders();
    }
    function drawOrders(){
      const routes = [...new Set(ORD.map(o=>o.route).filter(Boolean))].sort();
      sh.$('#eRoutes').innerHTML = String(html`<button class="chip${!route ? ' is-on' : ''}" type="button" data-r="">Все · ${ORD.length}</button>${routes.map(r=>html`<button class="chip${r === route ? ' is-on' : ''}" type="button" data-r="${r}">${r}</button>`)}`);
      const list = ORD.filter(o=>!route || o.route === route || sel.includes(o.id)).sort((a, b)=> (sel.indexOf(a.id) + 1 || 999) - (sel.indexOf(b.id) + 1 || 999) || a.num.localeCompare(b.num));
      sh.$('#eOrders').innerHTML = list.length ? String(html`${list.map(o=>{ const p = ptOf(o.pointId), i = sel.indexOf(o.id); return html`<button class="row pick-row${i >= 0 ? ' is-on' : ''}" type="button" data-o="${o.id}">
          <span class="pick-box">${i >= 0 ? i + 1 : ''}</span>
          <span class="row-main"><span class="row-title">№${o.num} · ${p.customer}</span><span class="row-sub">${p.address}</span>
            <span class="row-sub">${o.route || 'без маршрута'} · ${qtyOf(o)} шт · <span class="pill ${ORD_ST[o.status][1]}">${ORD_ST[o.status][0]}</span></span></span></button>`; })}`)
        : String(html`<div class="empty" style="padding:16px">${icon('route')}<div class="empty-title">Свободных заявок нет</div>На ${D.label(st.date)} заявок без рейса нет</div>`);
      const n = sel.length, pcsSel = ORD.filter(o=>sel.includes(o.id)).reduce((s, o)=>s + qtyOf(o), 0);
      sh.$('#eOrdSum').textContent = n ? `${n} точ. · ${pcs(pcsSel)}` : '';
      sh.$('#eTorts').hidden = !!n; sh.$('#eFromOrders').hidden = !n;
    }
    Kit.on(sh.$('#eRoutes'), 'click', '[data-r]', (e, el)=>{ route = el.dataset.r; haptic('select'); drawOrders(); });
    Kit.on(sh.$('#eOrders'), 'click', '[data-o]', (e, el)=>{ const id = el.dataset.o, i = sel.indexOf(id); if(i >= 0) sel.splice(i, 1); else sel.push(id); haptic('select'); drawOrders(); });
    loadOrders();
    let only = false;
    const eSum = ()=>{ const ls = $$('[data-q]', sh.el).map(el=>parseInt(el.value, 10) || 0).filter(Boolean); sh.$('#eSum').textContent = ls.length ? `${ls.length} поз. · ${pcs(ls.reduce((a, b)=>a + b, 0))}` : ''; };
    const eFilter = ()=>{ filterRows(sh.$('#eList'), sh.$('#eQ').value); if(only){ $$('[data-name]', sh.el).forEach(r=>{ if(!r.classList.contains('is-on')) r.hidden = true; }); $$('.cat-group', sh.el).forEach(g=> g.hidden = !$$('[data-name]', g).some(r=>!r.hidden)); } };
    eSum();
    sh.el.addEventListener('input', e=>{ const r = e.target.closest('.qrow'); if(r && e.target.dataset.q){ r.classList.toggle('is-on', (parseInt(e.target.value, 10) || 0) > 0); eSum(); } });
    sh.$('#eQ').addEventListener('input', Kit.debounce(eFilter, 100));
    sh.$('#eOnly').addEventListener('click', ()=>{ only = !only; sh.$('#eOnly').classList.toggle('is-on', only); haptic('select'); eFilter(); });
    sh.$('#eSave').addEventListener('click', async ()=>{
      // направление рейса не выбрано — сервер возьмёт маршрут первой заявки
      const byRoute = !st.cityId && sel.length ? ((ORD.find(o=>o.id === sel[0]) || {}).route || '') : '';
      if(!st.cityId && !byRoute){ Kit.toast('Выберите маршрут или город — или отметьте заявки', 'error'); return; }
      const lines = $$('[data-q]', sh.el).map(el=>({productId:el.dataset.q, qty:parseInt(el.value, 10) || 0})).filter(l=>l.qty > 0);
      const over = sel.length ? [] : lines.filter(l=>l.qty > stockOf(l.productId));
      if(over.length) Kit.toast('Больше, чем на складе: ' + over.map(l=>L(l.productId)).join(', '), 'error');
      const taraOut = $$('[data-tq]', sh.el).map(el=>({taraId:el.dataset.tq, qty:parseInt(el.value, 10) || 0})).filter(l=>l.qty > 0);
      Kit.busy(sh.$('#eSave'), true);
      let r = await api('saveTrip', {id:t ? t.id : undefined, date:st.date, cityId:st.cityId || undefined, route:byRoute || undefined, driverId:st.driverId || undefined, lines:sel.length ? [] : lines, taraOut:sel.length ? [] : taraOut, note:sh.$('#eNote').value.trim()});
      if(r.ok && (sel.length || (t && (t.stops || []).length))) r = await api('setTripOrders', {id:r.trip.id, orderIds:sel});
      Kit.busy(sh.$('#eSave'), false);
      if(!r.ok){ fail(r); renderTrips(); return; }
      if(byRoute) await Cake.loadRefs();  // мог появиться новый маршрут-направление
      haptic('success'); sh.close(); renderTrips(); openTrip(r.trip);
    });
    if(t) sh.$('#eCancel').addEventListener('click', async ()=>{
      if(!await Kit.confirm('Отменить рейс? Восстановить его будет нельзя.', 'Отменить рейс', true)) return;
      const r = await api('cancelTrip', {id:t.id});
      if(!r.ok){ fail(r); return; }
      sh.close(); Kit.toast('Рейс отменён'); renderTrips();
    });
  }

  function acceptTrip(t){
    const rep = t.report ? JSON.parse(t.report) : {returns:[], taraBack:[]};
    const rb = {}; rep.returns.forEach(r=> rb[r.productId] = r);
    const tb = {}; rep.taraBack.forEach(l=> tb[l.taraId] = l.qty);
    const sh = Kit.sheet({title:`Приёмка · ${C(t.cityId).name} №${t.num}`, sub:rep.returns.length || rep.taraBack.length ? 'Заполнено по отчёту водителя — сверьте' : 'Что вернулось из рейса', body: html`
      <div class="qrow" style="color:var(--ink-3);font-size:13px"><span class="qrow-name" style="font-weight:400">Торт · уехало</span><span style="width:84px;text-align:center">Годные</span><span style="width:84px;text-align:center">Брак</span></div>
      ${t.lines.map(l=>html`<div class="qrow"><span class="qrow-name">${Kit.nobr(P(l.productId).name)}<small>${W(P(l.productId).weightG)} · уехало ${l.qty}</small></span>
        <input class="input" type="number" inputmode="numeric" min="0" max="${l.qty}" placeholder="0" data-back="${l.productId}" value="${(rb[l.productId] || {}).back || ''}">
        <input class="input" type="number" inputmode="numeric" min="0" max="${l.qty}" placeholder="0" data-spoil="${l.productId}" value="${(rb[l.productId] || {}).spoiled || ''}"></div>`)}
      <p class="hint">Годные вернутся на остаток. Брак уже списан отгрузкой — просто фиксируется в рейсе.</p>
      ${t.taraOut.length ? html`<div class="eyebrow section" style="margin-bottom:4px">Ящики вернул</div>
        ${t.taraOut.map(l=>html`<div class="qrow"><span class="qrow-name">${T(l.taraId).name}<small>уехало ${l.qty}</small></span><input class="input" type="number" inputmode="numeric" min="0" placeholder="0" data-tb="${l.taraId}" value="${tb[l.taraId] != null ? tb[l.taraId] : l.qty}"></div>`)}` : ''}`,
      actions: html`<button class="btn btn-primary btn-block" type="button" id="aGo">${icon('check')}Закрыть рейс</button>`});
    sh.$('#aGo').addEventListener('click', async ()=>{
      const v = el=> parseInt(el.value, 10) || 0;
      const returns = t.lines.map(l=>({productId:l.productId, back:v(sh.$(`[data-back="${l.productId}"]`)), spoiled:v(sh.$(`[data-spoil="${l.productId}"]`))})).filter(r=>r.back || r.spoiled);
      const taraBack = $$('[data-tb]', sh.el).map(el=>({taraId:el.dataset.tb, qty:v(el)})).filter(l=>l.qty > 0);
      Kit.busy(sh.$('#aGo'), true);
      const r = await api('closeTrip', {id:t.id, returns, taraBack});
      Kit.busy(sh.$('#aGo'), false);
      if(!r.ok){ fail(r); return; }
      haptic('success'); sh.close(); Kit.toast('Рейс закрыт', 'ok'); renderTrips(); loadStock();
    });
  }

  Cake.tabs.trips = renderTrips;
})();
