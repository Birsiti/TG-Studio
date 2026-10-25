// изменено 2026-10-25 17:20
/* Экран водителя: мои рейсы, долг по ящикам, отчёт о возврате. */
(function(){
  "use strict";
  const {html, icon, $, $$, date: D, num, haptic} = Kit;
  const api = Kit.createApi({bot:'cake', mock: window.CakeMock});
  $('#mark').innerHTML = icon('truck');
  $('#refreshBtn').innerHTML = icon('refresh');

  const ST = {draft:['Собирается на складе','pill-warn'], shipped:['В пути','pill-info'], reported:['Отчёт сдан','pill-accent'], closed:['Принят складом','pill-ok']};
  const PICK_KEY = 'tgs-cake-driver';
  let REFS = null, ME = null, TRIPS = [], DEBT = [], restricted = false, boss = false;
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
    REFS = refs; boss = me.ok && me.role === 'admin'; restricted = me.ok && me.restricted && !boss;  // руководитель выбирает водителя и смотрит его экран
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
      <div class="page-head"><h1 class="page-title">${boss ? ME.name : ME.name.split(' ')[0] + ', привет'}</h1>
        <p class="page-sub">${ME.car || 'Машина не указана'}${boss ? (ME.hired ? ' · наёмный' + (ME.carrier ? ' (' + ME.carrier + ')' : '') : ' · своя машина') : ''} ${restricted ? '' : html`· <button class="link-btn" type="button" id="swap">сменить водителя</button>`}</p></div>
      ${boss ? html`<div class="section" id="drvStats"></div>` : html`<p><span class="thermo">+2…+6 °C в кузове</span></p>`}
      ${DEBT.length && !boss ? html`<div class="card section" style="display:flex;align-items:center;gap:12px">${icon('layers')}<span style="flex:1">Ящиков на руках — верните на склад</span><span class="qty is-low">${DEBT.reduce((a, d)=>a + d.qty, 0)}</span></div>` : ''}
      <div class="section"><div class="section-head"><h2 class="section-title">Текущие рейсы</h2></div>
        ${active.length ? active.map(card) : html`<div class="empty">${icon('truck')}<div class="empty-title">Рейсов нет</div>Склад ещё не назначил вам рейс</div>`}</div>
      ${done.length ? html`<div class="section"><div class="section-head"><h2 class="section-title">Последние</h2></div>${done.slice(0, 8).map(card)}</div>` : ''}`);
    if(boss) renderStats();
  }
  /* Руководитель открыл водителя — сверху его статистика за период (getDriverStats, как во вкладке «Водители» сводки) */
  let statDays = 30;
  async function renderStats(){
    const box = $('#drvStats'); if(!box || !ME) return;
    const to = D.today(), r = await api('getDriverStats', {from:D.add(to, -(statDays - 1)), to});
    if(!$('#drvStats')) return;
    const s = (r.ok && r.drivers.find(x=>x.driverId === ME.id)) || {trips:0, points:0, km:0, kmGap:0, noOdo:0, shipped:0, back:0, spoiled:0, shortage:0, taraDebt:DEBT.reduce((a, x)=>a + x.qty, 0)};
    const ret = s.back + s.spoiled, pct = s.shipped ? Math.round(100 * ret / s.shipped) : 0;
    const perTrip = s.trips - s.noOdo ? Math.round(s.km / (s.trips - s.noOdo)) : 0;
    const row = (k, v, warn)=> html`<div class="kv"><span class="k">${k}</span><span class="v mono${warn ? ' is-low' : ''}">${v}</span></div>`;
    $('#drvStats').innerHTML = String(html`
      <div class="section-head"><h2 class="section-title">Статистика</h2></div>
      <div class="chips scroll" id="drvDays">${[[7, '7 дней'], [30, '30 дней'], [90, '3 месяца']].map(([n, t])=>html`<button class="chip${n === statDays ? ' is-on' : ''}" type="button" data-sd="${n}">${t}</button>`)}</div>
      <div class="stats section">
        <div class="stat"><div class="stat-label">Рейсов</div><div class="stat-value">${num(s.trips)}</div><div class="stat-delta">точек ${num(s.points)}</div></div>
        <div class="stat"><div class="stat-label">Пробег</div><div class="stat-value">${num(s.km)}</div><div class="stat-delta">км${perTrip ? ' · ' + num(perTrip) + ' на рейс' : ''}</div></div>
        <div class="stat"><div class="stat-label">Отгружено</div><div class="stat-value">${num(s.shipped)}</div><div class="stat-delta">шт тортов</div></div>
        <div class="stat"><div class="stat-label">Возвраты</div><div class="stat-value">${num(ret)}</div><div class="stat-delta ${pct >= 10 ? 'down' : ''}">${pct}% · брак ${num(s.spoiled)}</div></div>
      </div>
      <div class="card section">
        ${row('Недостача по отчётам', s.shortage ? num(s.shortage) + ' шт' : 'нет', s.shortage > 0)}
        ${row('Ящики на руках', num(s.taraDebt), s.taraDebt > 0)}
        ${s.kmGap ? row('Пробег между рейсами', num(s.kmGap) + ' км', s.kmGap > s.km * 0.1) : ''}
        ${s.noOdo ? row('Рейсов без спидометра', String(s.noOdo), true) : ''}
      </div>`);
  }
  Kit.on($('#view'), 'click', '[data-sd]', (e, el)=>{ statDays = +el.dataset.sd; haptic('select'); renderStats(); });

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
      <p class="page-sub">${restricted ? 'Ваш Telegram не привязан к водителю — попросите кладовщика указать ваш id' : boss ? 'Выберите водителя — откроется его экран, как у него в телефоне' : 'Демо: выберите водителя. В рабочем режиме бот узнаёт водителя по Telegram.'}</p></div>
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
      ${t.taraOut.length ? html`<div class="eyebrow section" style="margin-bottom:8px">Тара</div>${t.taraOut.map(l=>html`<div class="kv"><span class="k">${T(l.taraId).name} в этом рейсе</span><span class="v mono">${l.qty}</span></div>`)}` : ''}
      ${boxesNote(t)}
      ${t.note ? html`<p class="hint section">${t.note}</p>` : ''}
      ${odoBlock(t)}`,
      // спидометр — рядом с кнопкой: эта полоса остаётся над клавиатурой, поле в карточке клавиатура закрывала
      actions: t.status === 'shipped' && t.odoOut == null ? html`<input class="input odo-input" id="odoOut" type="number" inputmode="numeric" min="0" placeholder="Спидометр, км" aria-label="Спидометр на выезде, км">
        <button class="btn btn-primary" type="button" id="goOut">${icon('truck')}Выезжаю</button>`
        : /shipped|reported/.test(t.status) ? html`<button class="btn btn-primary btn-block" type="button" id="goRep">${icon('clipboard')}${t.status === 'reported' ? 'Исправить отчёт' : 'Сдать рейс'}</button>` : ''});
    Kit.on(sh.el, 'click', '[data-map]', (e, el)=>{ haptic('light'); CakeMap.one(el.dataset.map); });
    Kit.on(sh.el, 'click', '[data-stop]', (e, el)=>{ if(e.target.closest('[data-map]')) return; haptic('light'); sh.close(); openStop(t, t.stops.find(s=>s.orderId === el.dataset.stop)); });
    const all = sh.$('#mapAll'); if(all) all.addEventListener('click', ()=>{ haptic('light'); CakeMap.route(t.stops.map(s=>s.address)); });
    const b = sh.$('#goRep'); if(b) b.addEventListener('click', async ()=>{
      const left = (t.stops || []).filter(s=>!s.report).length;
      if(left && !await Kit.confirm(`Не сданы точки: ${left} из ${t.stops.length}. Всё равно сдать рейс?`, 'Сдать рейс')) return;
      sh.close(); report(t);
    });
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
    const done = S.filter(s=>s.report).length, live = /shipped|reported/.test(t.status);
    return html`<div class="section-head" style="margin-bottom:8px"><span class="eyebrow">Маршрут · ${S.length} ${S.length === 1 ? 'точка' : S.length < 5 ? 'точки' : 'точек'}</span>
        ${live ? html`<span class="hint">сдано ${done} из ${S.length}</span>` : ''}</div>
      ${S.length > 1 ? html`<button class="btn btn-ghost btn-block" type="button" id="mapAll" style="margin-bottom:8px">${icon('route')}Весь маршрут на карте</button>` : ''}
      ${live && done < S.length ? html`<p class="hint" style="margin:0 0 8px">Нажмите на точку, чтобы сдать её: всё в порядке или недостача, брак, пересорт с фото.</p>` : ''}
      <div class="list">${S.map((s, i)=>{ const st = stopState(s); return html`<div class="row stop-row" data-stop="${s.orderId}" role="button" tabindex="0"><span class="avatar">${i + 1}</span>
        <span class="row-main"><span class="row-title">№${s.num} · ${s.customer}</span>
          <span class="row-sub">${s.address}</span>
          <span class="row-sub">${s.qty} шт${s.boxes ? ' · ящиков ' + s.boxes : ''}${s.comment ? ' · ' + s.comment : ''}</span>
          ${st ? html`<span class="row-sub"><span class="pill ${st[1]}">${st[0]}</span>${s.photos ? html` <span class="hint">фото ${s.photos}</span>` : ''}</span>` : ''}</span>
        <button class="icon-btn" type="button" data-map="${s.address}" aria-label="На карте">${icon('pin')}</button></div>`; })}</div>`;
  }
  const stopState = s=> !s.report ? null : s.report.ok ? ['Сдано', 'pill-ok'] : ['Сдано с замечаниями', 'pill-warn'];
  const issueText = rep=> rep.lines.map(l=>[l.short && 'недостача ' + l.short, l.spoiled && 'брак ' + l.spoiled, l.resort && 'пересорт ' + l.resort].filter(Boolean).map(x=>`${P(l.productId).name}: ${x}`).join(', ')).join('; ');

  // Сдать точку: всё в порядке — одной кнопкой; замечания — по строкам заявки (недостача, брак, пересорт), фото и комментарий
  function openStop(t, s){
    if(!s) return;
    const live = /shipped|reported/.test(t.status), rep = s.report, prev = {};
    (rep ? rep.lines : []).forEach(l=> prev[l.productId] = l);
    let issues = !!(rep && !rep.ok), photos = [];
    const opt = sel=> html`<option value="">что привезли вместо — выберите</option>${REFS.products.filter(p=>p.active).map(p=>html`<option value="${p.id}"${p.id === sel ? Kit.raw(' selected') : ''}>${p.name}, ${W(p.weightG)}</option>`)}`;
    const n = (pid, k)=> (prev[pid] || {})[k] || '';
    const sh = Kit.sheet({title:`Точка №${s.num}`, sub:`${s.customer} · ${s.qty} шт`, body: html`
      <div class="kv"><span class="k">Адрес</span><span class="v">${s.address}</span></div>
      ${s.comment ? html`<div class="kv"><span class="k">Заметка</span><span class="v">${s.comment}</span></div>` : ''}
      <button class="btn btn-ghost btn-block section" type="button" data-map="${s.address}">${icon('pin')}Открыть на карте</button>
      ${rep ? html`<p class="hint section"><span class="pill ${stopState(s)[1]}">${stopState(s)[0]}</span> ${D.when(rep.at.slice(0, 10), rep.at.slice(11, 16))}${rep.ok ? '' : ' · ' + issueText(rep)}${rep.comment ? ' · «' + rep.comment + '»' : ''}</p>` : ''}
      <div class="section-head section" style="margin-bottom:4px"><span class="eyebrow">Отдать</span><span class="hint" id="spHint">${issues ? 'недостача · брак · пересорт' : ''}</span></div>
      ${s.lines.map(l=>html`<div class="stop-line" data-line="${l.productId}">
        <div class="qrow"><span class="qrow-name">${Kit.nobr(P(l.productId).name)}<small>${W(P(l.productId).weightG)}</small></span><span class="mono" style="font-weight:700">${l.qty + (l.bonus || 0)}</span></div>
        <div class="stop-issue" ${issues ? '' : Kit.raw('hidden')}>
          <label><span>Недостача</span><input class="input" type="number" inputmode="numeric" min="0" data-k="short" value="${n(l.productId, 'short')}" placeholder="0"></label>
          <label><span>Брак</span><input class="input" type="number" inputmode="numeric" min="0" data-k="spoiled" value="${n(l.productId, 'spoiled')}" placeholder="0"></label>
          <label><span>Пересорт</span><input class="input" type="number" inputmode="numeric" min="0" data-k="resort" value="${n(l.productId, 'resort')}" placeholder="0"></label>
        </div>
        <select class="input select stop-resort" data-k="resortTo" ${n(l.productId, 'resort') ? '' : Kit.raw('hidden')}>${opt(n(l.productId, 'resortTo'))}</select></div>`)}
      <div id="spMore" ${issues ? '' : Kit.raw('hidden')}>
        <div class="section"><span class="field-label">Фото: брак, коробки, накладная с отметкой${s.photos ? ` · уже ${s.photos}` : ''}</span>
          <label class="btn btn-ghost btn-block" style="margin-top:6px">${icon('plus')}Сфотографировать / выбрать<input type="file" accept="image/*" multiple hidden id="spFile"></label>
          <div class="pick-files section" id="spThumbs"></div></div>
        <label class="field section"><span class="field-label">Комментарий</span><textarea class="textarea" id="spCom" maxlength="300" rows="2" placeholder="Что случилось, кто принял">${rep ? rep.comment : ''}</textarea></label>
      </div>`,
      actions: !live ? '' : html`<button class="btn btn-ghost" type="button" id="spIssue" ${issues ? Kit.raw('hidden') : ''}>${icon('alert')}Есть замечания</button>
        <button class="btn btn-primary" type="button" id="spGo">${icon('check')}<span id="spGoText">${issues ? 'Сдать с замечаниями' : 'Всё сдано'}</span></button>`});
    Kit.on(sh.el, 'click', '[data-map]', (e, el)=>{ haptic('light'); CakeMap.one(el.dataset.map); });
    if(!live) return;
    const setIssues = ()=>{ issues = true; $$('.stop-issue', sh.el).forEach(x=> x.hidden = false); sh.$('#spMore').hidden = false; sh.$('#spIssue').hidden = true;
      sh.$('#spGoText').textContent = 'Сдать с замечаниями'; sh.$('#spHint').textContent = 'недостача · брак · пересорт'; haptic('select'); };
    sh.$('#spIssue').addEventListener('click', setIssues);
    sh.el.addEventListener('input', e=>{ if(e.target.dataset.k === 'resort'){ const box = e.target.closest('.stop-line'); $('.stop-resort', box).hidden = !(parseInt(e.target.value, 10) > 0); } });
    sh.$('#spFile').addEventListener('change', async e=>{
      const got = await Cake.files.prepare(e.target.files); e.target.value = '';
      photos = photos.concat(got).slice(0, 6);
      sh.$('#spThumbs').innerHTML = String(html`${photos.map(f=>html`<span class="pick-file"><img alt="" src="data:${f.mime};base64,${f.data}"></span>`)}`);
    });
    sh.$('#spGo').addEventListener('click', async ()=>{
      const v = (box, k)=> parseInt($(`[data-k="${k}"]`, box).value, 10) || 0;
      const lines = issues ? $$('.stop-line', sh.el).map(box=>({productId:box.dataset.line, short:v(box, 'short'), spoiled:v(box, 'spoiled'), resort:v(box, 'resort'), resortTo:$('[data-k="resortTo"]', box).value || undefined}))
        .filter(l=>l.short || l.spoiled || l.resort) : [];
      const comment = issues ? sh.$('#spCom').value.trim() : '';
      if(issues && !lines.length && !comment && !photos.length){ Kit.toast('Укажите, что не так: количество, комментарий или фото', 'error'); haptic('warning'); return; }
      const go = sh.$('#spGo'); Kit.busy(go, true);
      const r = await api('reportStop', {orderId:s.orderId, lines, comment});
      if(!r.ok){ Kit.busy(go, false); fail(r); return; }
      for(const f of photos){ const x = await api('addStopPhoto', Object.assign({orderId:s.orderId}, f)); if(!x.ok){ fail(x); break; } }
      Kit.busy(go, false); haptic('success'); sh.close();
      Kit.toast(lines.length || comment ? 'Точка сдана с замечаниями — склад увидит' : 'Точка сдана', 'ok');
      await load(); openTrip(TRIPS.find(x=>x.id === t.id));
    });
  }

  // Спидометр: на выезде — поле перед «Выезжаю», потом — показания и пробег
  function odoBlock(t){
    if(t.status === 'shipped' && t.odoOut == null) return html`<p class="hint section">Перед выездом впишите спидометр внизу и нажмите «Выезжаю».</p>`;
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

  // Ящики: на погрузке сдать пустые с прошлых рейсов (отдельно на склад не ездить), в конце — что вернул
  function boxesNote(t){
    const onHands = DEBT.reduce((a, d)=>a + d.qty, 0);
    if(!onHands) return '';
    if(t.status === 'draft') return html`<p class="mode-note section">${icon('layers')} На руках ${onHands} ящ. с прошлых рейсов — сдайте кладовщику при погрузке.</p>`;
    if(/shipped|reported/.test(t.status)) return html`<div class="kv"><span class="k">Всего ящиков на руках</span><span class="v mono">${onHands}</span></div>`;
    return '';
  }

  // Брак с точек — сразу в отчёт рейса (водитель везёт его обратно)
  function fromStops(t){
    const m = {};
    (t.stops || []).forEach(s=> (s.report ? s.report.lines : []).forEach(l=>{ if(l.spoiled) m[l.productId] = (m[l.productId] || 0) + l.spoiled; }));
    return Object.keys(m).map(pid=>({productId:pid, back:0, spoiled:m[pid]}));
  }

  function report(t){
    const rep = t.report ? JSON.parse(t.report) : {returns:fromStops(t), taraBack:[], comment:''};
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
        ${DEBT.reduce((a, d)=>a + d.qty, 0) > t.taraOut.reduce((a, l)=>a + l.qty, 0) ? html`<p class="hint" style="margin:0 0 4px">Всего на руках ${DEBT.reduce((a, d)=>a + d.qty, 0)} — можно сдать и ящики с прошлых рейсов.</p>` : ''}
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
