// изменено 2026-10-22 23:40
/* Экран руководителя склада: сводка, смены, справочники. */
(function(){
  "use strict";
  const {html, icon, $, $$, date: D, num, haptic} = Kit;
  const api = Kit.createApi({bot:'cake', mock: window.CakeMock});
  $('#mark').innerHTML = icon('grid');
  $('#refreshBtn').innerHTML = icon('refresh');
  $$('[data-ic]').forEach(el=> el.outerHTML = String(icon(el.dataset.ic)));

  const ROLE = {storekeeper:'Кладовщик', logist:'Логист', driver:'Водитель'};
  let REFS = {products:[], cities:[], staff:[], tara:[]};
  const fail = r=> { Kit.toast(r.message || 'Не получилось', 'error'); haptic('error'); };
  const P = id=> REFS.products.find(x=>x.id === id) || {name:'?'};
  const W = g=> !g ? '' : g < 1000 ? g + ' г' : String(g / 1000).replace('.', ',') + ' кг';
  const L = id=> { const p = P(id); return p.name + (p.weightG ? ', ' + W(p.weightG) : ''); };
  const C = id=> REFS.cities.find(x=>x.id === id) || {name:'?'};
  async function loadRefs(){
    const r = await api('getRefs'); if(r.ok) REFS = r; else fail(r);
    if(r.ok && !loadRefs.hello){ loadRefs.hello = true; api('hello', {page:'admin'}); }  // журнал «кто заходит»
    if(api.mode() === 'demo') $('#modeNote').innerHTML = String(html`<p class="mode-note">Демо-версия: данные примерные и хранятся только в этом телефоне.</p>`);
  }

  /* ============ СВОДКА ============ */
  async function renderOverview(){
    const o = await api('getOverview', {days:14});
    if(!o.ok){ fail(o); return; }
    const shift = o.onShift.map(id=>REFS.staff.find(s=>s.id === id)).filter(Boolean);
    $('#ovSub').textContent = `${D.label(D.today())} · на смене ${shift.length ? shift.map(s=>s.name.split(' ')[0]).join(', ') : 'никого'}`;
    $('#ovLow').innerHTML = o.lowStock.length ? String(html`<p class="mode-note">${icon('alert')} Мало на складе: ${o.lowStock.join(', ')}</p>`) : '';
    $('#ovStats').innerHTML = String(html`
      <div class="stat"><div class="stat-label">На складе</div><div class="stat-value">${num(o.stockTotal)}</div><div class="stat-delta">тортов</div></div>
      <div class="stat"><div class="stat-label">Отгружено сегодня</div><div class="stat-value">${num(o.shippedToday)}</div><div class="stat-delta">за 14 дн ${num(o.shippedPeriod)}</div></div>
      <div class="stat"><div class="stat-label">Рейсы</div><div class="stat-value">${o.trips.shipped}</div><div class="stat-delta">в пути · сборка ${o.trips.draft} · приёмка ${o.trips.reported}</div></div>
      <div class="stat"><div class="stat-label">Ящики у водителей</div><div class="stat-value">${num(o.taraOut)}</div><div class="stat-delta">долг</div></div>
      <div class="stat"><div class="stat-label">Возвраты</div><div class="stat-value">${num(o.returnedPeriod)}</div><div class="stat-delta">за 14 дн</div></div>
      <div class="stat"><div class="stat-label">Списано</div><div class="stat-value">${num(o.writtenOffPeriod)}</div><div class="stat-delta ${o.writtenOffPeriod ? 'down' : ''}">за 14 дн</div></div>`);
    $('#ovChart').innerHTML = String(Kit.chart.bars(o.series.map(s=>({label:String(D.day(s.date)), value:s.value})), {highlightLast:true, label:'Отгрузки по дням'}));
    $('#ovCities').innerHTML = String(Kit.chart.rank(o.byCity.map(c=>({name:C(c.cityId).name, value:c.qty}))));
    $('#ovTop').innerHTML = String(Kit.chart.rank(o.topProducts.map(p=>({name:L(p.productId), value:p.qty}))));
  }

  /* ============ СМЕНЫ ============ */
  let shDay = D.today(), SHIFTS = {};
  async function renderShifts(){
    const from = D.add(D.today(), -1), to = D.add(D.today(), 12);
    const r = await api('getShifts', {from, to});
    if(!r.ok){ fail(r); return; }
    SHIFTS = r.days;
    const days = []; for(let k = from; k <= to; k = D.add(k, 1)) days.push(k);
    $('#shDays').innerHTML = String(html`${days.map(k=>html`<button type="button" class="day${k === shDay ? ' is-on' : ''}" data-day="${k}"><span class="day-dow">${k === D.today() ? 'сег' : D.dow(k)}</span><span class="day-num">${D.day(k)}</span></button>`)}`);
    drawShift();
  }
  function drawShift(){
    const on = new Set(SHIFTS[shDay] || []);
    const grp = role=> REFS.staff.filter(s=>s.role === role && (s.active || on.has(s.id)));
    $('#shList').innerHTML = String(html`${['storekeeper','driver'].map(role=>html`<div class="section"><div class="section-head"><h2 class="section-title">${role === 'driver' ? 'Водители' : 'Кладовщики'}</h2><span class="hint">${grp(role).filter(s=>on.has(s.id)).length} из ${grp(role).length}</span></div>
      <div class="list">${grp(role).map(s=>html`<label class="row"><span class="avatar">${Kit.initials(s.name)}</span><span class="row-main"><span class="row-title">${s.name}</span><span class="row-sub">${s.car || Kit.phone.pretty(s.phone)}</span></span>
        <span class="switch"><input type="checkbox" data-s="${s.id}" ${on.has(s.id) ? Kit.raw('checked') : ''} aria-label="На смене"><span></span></span></label>`)}</div></div>`)}`);
  }
  Kit.on($('#shDays'), 'click', '[data-day]', (e, el)=>{ shDay = el.dataset.day; $$('#shDays .day').forEach(b=>b.classList.toggle('is-on', b === el)); haptic('select'); drawShift(); });
  $('#shList').addEventListener('change', async e=>{
    if(!e.target.dataset.s) return;
    const ids = $$('#shList [data-s]').filter(x=>x.checked).map(x=>x.dataset.s);
    haptic('select');
    const r = await api('setShift', {date:shDay, staffIds:ids});
    if(!r.ok){ fail(r); e.target.checked = !e.target.checked; return; }
    SHIFTS[shDay] = r.staffIds;
    drawShift();
  });

  /* ============ СПРАВОЧНИКИ ============ */
  const KINDS = {
    products:{label:'Торты', add:'Новый торт', save:'saveProduct', key:'product',
      sub:x=>`${x.cat}${x.weightG ? '' : ' · вес —'}${x.perBox > 1 ? ' · ' + x.perBox + ' шт в коробке' : ''}${x.shelfDays ? ' · ' + x.shelfDays + ' сут' : ''}${x.minQty ? ' · мин. ' + x.minQty : ''}`,
      fields:x=>html`<label class="field"><span class="field-label">Название</span><input class="input" name="name" maxlength="80" value="${x.name || ''}"></label>
        <label class="field section"><span class="field-label">Категория</span><select class="select" name="cat">${REFS.cats.map(c=>html`<option value="${c}" ${(x.cat || REFS.cats[0]) === c ? Kit.raw('selected') : ''}>${c}</option>`)}</select></label>
        <div class="field-row section"><label class="field"><span class="field-label">Артикул</span><input class="input" name="sku" maxlength="30" value="${x.sku || ''}"></label>
        <label class="field"><span class="field-label">Вес, г</span><input class="input" name="weightG" type="number" inputmode="numeric" value="${x.weightG || ''}"></label></div>
        <div class="field-row section"><label class="field"><span class="field-label">Срок, суток</span><input class="input" name="shelfDays" type="number" inputmode="numeric" value="${x.shelfDays || ''}"></label>
        <label class="field"><span class="field-label">Мин. остаток</span><input class="input" name="minQty" type="number" inputmode="numeric" value="${x.minQty || ''}"></label></div>
        <label class="field section"><span class="field-label">Штук в одном грузовом месте (коробке)</span><input class="input" name="perBox" type="number" inputmode="numeric" min="1" value="${x.perBox || 1}"></label>`},
    cities:{label:'Города', add:'Новый город', save:'saveCity', key:'city', sub:x=>x.code || '—',
      fields:x=>html`<div class="field-row"><label class="field"><span class="field-label">Город</span><input class="input" name="name" maxlength="60" value="${x.name || ''}"></label>
        <label class="field" style="flex:0 0 110px"><span class="field-label">Код</span><input class="input mono" name="code" maxlength="4" value="${x.code || ''}" placeholder="БРС"></label></div>`},
    staff:{label:'Люди', add:'Новый сотрудник', save:'saveStaff', key:'staff',
      sub:x=>`${ROLE[x.role]}${x.role === 'driver' ? (x.hired ? ' · наёмный' + (x.carrier ? ' (' + x.carrier + ')' : '') : ' · свой') : ''}${x.car ? ' · ' + x.car : ''}${x.tgId ? ' · TG ' + x.tgId : ''}`,
      fields:x=>html`<label class="field"><span class="field-label">Имя и фамилия</span><input class="input" name="name" maxlength="80" value="${x.name || ''}"></label>
        <div class="seg section" id="fRole">${Object.keys(ROLE).map(k=>html`<button type="button" data-v="${k}" class="${(x.role || 'driver') === k ? 'is-on' : ''}">${ROLE[k]}</button>`)}</div>
        <div class="field section"><span class="field-label">Телефон</span><div id="fPhone"></div></div>
        <div class="section" id="fCarBox"${(x.role || 'driver') === 'driver' ? '' : Kit.raw(' hidden')}><span class="field-label">Чья машина</span>
          <div class="seg" id="fHired"><button type="button" data-v="0" class="${x.hired ? '' : 'is-on'}">Своя (фирмы)</button><button type="button" data-v="1" class="${x.hired ? 'is-on' : ''}">Наёмный</button></div>
          <label class="field section" id="fCarrierBox"${x.hired ? '' : Kit.raw(' hidden')}><span class="field-label">Фирма-перевозчик</span><input class="input" name="carrier" maxlength="80" value="${x.carrier || ''}" placeholder="ИП Петров"></label></div>
        <label class="field section"><span class="field-label">Машина и номер</span><input class="input" name="car" maxlength="80" value="${x.car || ''}" placeholder="Iveco Daily · 4521 AB-7"></label>
        <label class="field section"><span class="field-label">Telegram id — для входа в рабочем режиме</span><input class="input mono" name="tgId" inputmode="numeric" maxlength="15" value="${x.tgId || ''}"></label>`},
    tara:{label:'Тара', add:'Новый вид тары', save:'saveTara', key:'tara', sub:x=>`всего ${num(x.total)} шт`,
      fields:x=>html`<label class="field"><span class="field-label">Название</span><input class="input" name="name" maxlength="60" value="${x.name || ''}"></label>
        <label class="field section"><span class="field-label">Всего в обороте, шт</span><input class="input" name="total" type="number" inputmode="numeric" value="${x.total || ''}"></label>`}
  };
  let kind = 'products';
  function renderRefs(){
    $('#refSeg').innerHTML = String(html`${Object.keys(KINDS).map(k=>html`<button type="button" data-k="${k}" class="${k === kind ? 'is-on' : ''}">${KINDS[k].label}</button>`)}`);
    $('#refAdd').innerHTML = String(html`${icon('plus')}${KINDS[kind].add}`);
    $('#refBoxes').hidden = kind !== 'products';
    $('#refBoxes').innerHTML = String(html`${icon('truck')}Заполнить «шт в ящике»`);
    $('#refVisits').hidden = kind !== 'staff';
    $('#refVisits').innerHTML = String(html`${icon('users')}Кто заходит в бота`);
    const list = REFS[kind];
    $('#refList').innerHTML = String(html`<div class="list">${list.map(x=>html`<button class="row" type="button" data-id="${x.id}"${x.active ? '' : Kit.raw(' style="opacity:.55"')}>
      ${kind === 'cities' ? html`<span class="row-code"><span class="code">${x.code || '—'}</span></span>` : kind === 'staff' ? html`<span class="avatar">${Kit.initials(x.name)}</span>` : kind === 'products' ? (window.CakePhotos && CakePhotos.of(x) ? html`<img class="thumb" src="${CakePhotos.of(x)}" alt="" loading="lazy" width="44" height="44">` : html`<span class="thumb thumb-none" aria-hidden="true"></span>`) : ''}
      <span class="row-main"><span class="row-title">${Kit.nobr(x.name)}${kind === 'products' && x.weightG ? html` <span class="hint nowrap">${W(x.weightG)}</span>` : ''}</span><span class="row-sub">${KINDS[kind].sub(x)}${x.active ? '' : ' · скрыт'}</span></span>${icon('right', 'row-chev')}</button>`)}</div>`);
  }
  Kit.on($('#refSeg'), 'click', '[data-k]', (e, el)=>{ kind = el.dataset.k; haptic('select'); renderRefs(); });
  $('#refAdd').addEventListener('click', ()=> editRef({active:true}));
  $('#refVisits').addEventListener('click', openVisits);
  $('#refBoxes').addEventListener('click', openBoxes);

  /* Быстрое заполнение «шт в ящике» (perBox): список по категориям, число в строке сохраняется сразу.
     perBox = 1 считаем «не задано» (так по умолчанию); не знаешь — оставь пустым. */
  function openBoxes(){
    const list = REFS.products.filter(x=>x.active);
    const todo = ()=> list.filter(x=>!(x.perBox > 1)).length;
    const row = x=> html`<div class="row" data-b="${x.id}"><span class="row-main"><span class="row-title">${Kit.nobr(x.name)}${x.weightG ? html` <span class="hint nowrap">${W(x.weightG)}</span>` : ''}</span></span>
      <input class="input" style="width:84px;flex:none;text-align:center;font-weight:700" type="number" inputmode="numeric" min="1" max="1000" placeholder="шт" aria-label="Штук в ящике: ${x.name}" value="${x.perBox > 1 ? x.perBox : ''}"></div>`;
    const sh = Kit.sheet({title:'Штук в ящике', sub:`не задано: ${todo()} из ${list.length}`,
      body: html`<p class="hint">Впиши число — оно сохранится сразу. Не знаешь — оставь пустым.</p>
        ${REFS.cats.map(c=> list.some(x=>x.cat === c) ? html`<div class="section"><div class="eyebrow" style="margin-bottom:8px">${c}</div><div class="list">${list.filter(x=>x.cat === c).map(row)}</div></div>` : '')}`});
    sh.el.addEventListener('change', async e=>{
      const r0 = e.target.closest('[data-b]'); if(!r0) return;
      const x = list.find(y=>y.id === r0.dataset.b), v = parseInt(e.target.value, 10);
      if(!(v >= 1 && v <= 1000)){ e.target.value = x.perBox > 1 ? x.perBox : ''; return; }
      if(v === x.perBox) return;
      const r = await api('saveProduct', {id:x.id, name:x.name, cat:x.cat, sku:x.sku || '', weightG:x.weightG || '', shelfDays:x.shelfDays || '', minQty:x.minQty || '', perBox:v, active:x.active});
      if(!r.ok){ fail(r); e.target.value = x.perBox > 1 ? x.perBox : ''; return; }
      x.perBox = r.product.perBox; haptic('success');
      sh.el.querySelector('.sheet-sub').textContent = `не задано: ${todo()} из ${list.length}`;
    });
  }

  /* Кто заходит: все, кто писал боту или открывал приложение, и последние входы */
  const WHERE = {bot:'бот', sklad:'склад', admin:'сводка', driver:'водитель'};
  const ROLE_ALL = Object.assign({admin:'Руководитель'}, ROLE);
  const at = s=> D.when(s.slice(0, 10), s.slice(11, 16));
  async function openVisits(){
    const r = await api('getVisits', {limit:100});
    if(!r.ok){ fail(r); return; }
    const who = v=> v.staffName || v.name || 'без имени';
    const byId = {}; r.people.forEach(v=> byId[v.tgId] = v);
    const sh = Kit.sheet({title:'Кто заходит', sub:`${r.people.length} чел. · новые приходят вам в личку`, body: r.people.length ? html`
      <div class="list">${r.people.map(v=>html`<div class="row"><span class="avatar">${Kit.initials(who(v))}</span>
        <span class="row-main"><span class="row-title">${who(v)}${v.username ? html` <span class="hint">@${v.username}</span>` : ''}</span>
          <span class="row-sub">${v.role ? ROLE_ALL[v.role] : html`<b style="color:var(--danger)">нет доступа</b>`} · ${at(v.lastAt)}</span>
          <span class="row-sub">id ${v.tgId} · бот ${v.starts} · прил. ${v.opens}</span></span>
        ${v.role ? '' : html`<button class="icon-btn" type="button" data-add="${v.tgId}" aria-label="Добавить в Люди">${icon('plus')}</button>`}</div>`)}</div>
      <p class="hint section">«+» — добавить человека в «Люди» с его Telegram id.</p>
      <div class="section"><div class="eyebrow" style="margin-bottom:8px">Последние входы</div>
        ${r.log.map(l=>html`<div class="kv"><span class="k">${at(l.at)} · ${WHERE[l.page] || l.page}</span><span class="v">${byId[l.tgId] ? who(byId[l.tgId]) : l.tgId}</span></div>`)}</div>`
      : html`<div class="empty">${icon('users')}<div class="empty-title">Пока никого</div>Здесь появятся все, кто напишет боту или откроет склад</div>`});
    Kit.on(sh.el, 'click', '[data-add]', (e, el)=>{
      const v = byId[el.dataset.add]; sh.close();
      editRef({active:true, role:'driver', tgId:v.tgId, name:v.name});
    });
  }
  Kit.on($('#refList'), 'click', '[data-id]', (e, el)=> editRef(REFS[kind].find(x=>x.id === el.dataset.id)));

  function editRef(x){
    const K = KINDS[kind];
    const sh = Kit.sheet({title:x.id ? x.name : K.add, body: html`${K.fields(x)}
      <label class="row section" style="padding:0;border:0"><span class="row-main"><span class="row-title">Активен</span><span class="row-sub">Скрытые не предлагаются в рейсах и приходе</span></span>
        <span class="switch"><input type="checkbox" id="fAct" ${x.active !== false ? Kit.raw('checked') : ''}><span></span></span></label>`,
      actions: html`<button class="btn btn-primary btn-block" type="button" id="fSave">Сохранить</button>`});
    let role = x.role || 'driver', hired = !!x.hired;
    if(kind === 'staff'){
      Kit.on(sh.$('#fHired'), 'click', '[data-v]', (e, el)=>{ hired = el.dataset.v === '1'; $$('#fHired button', sh.el).forEach(b=>b.classList.toggle('is-on', b === el)); sh.$('#fCarrierBox').hidden = !hired; haptic('select'); });
      sh.$('#fPhone').innerHTML = String(Kit.phone.field('fPh', x.phone || ''));
      Kit.phone.bind(sh.$('#fPh'));
      Kit.on(sh.$('#fRole'), 'click', '[data-v]', (e, el)=>{ role = el.dataset.v; $$('#fRole button', sh.el).forEach(b=>b.classList.toggle('is-on', b === el)); sh.$('#fCarBox').hidden = role !== 'driver'; haptic('select'); });
    }
    sh.$('#fSave').addEventListener('click', async ()=>{
      const p = {id:x.id, active:sh.$('#fAct').checked};
      $$('[name]', sh.el).forEach(el=> p[el.name] = el.value.trim());
      if(kind === 'staff'){ p.role = role; p.phone = Kit.phone.value(sh.$('#fPh')) || undefined; p.hired = role === 'driver' && hired; }
      Kit.busy(sh.$('#fSave'), true);
      const r = await api(K.save, p);
      Kit.busy(sh.$('#fSave'), false);
      if(!r.ok){ fail(r); return; }
      haptic('success'); sh.close(); Kit.toast('Сохранено', 'ok');
      await loadRefs(); renderRefs();
    });
  }

  /* ============ СТАРТ ============ */
  const RENDER = {overview:renderOverview, drivers:()=>window.CakeDriverStats(api, REFS.staff), shifts:renderShifts, refs:renderRefs};
  let current = 'overview';
  $('#refreshBtn').addEventListener('click', async ()=>{ haptic('light'); await loadRefs(); RENDER[current](); });
  Kit.ready(async ()=>{ await loadRefs(); Kit.tabs({onChange(tab){ current = tab; RENDER[tab](); }}); });
})();
