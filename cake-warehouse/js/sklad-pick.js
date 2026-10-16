// изменено 2026-10-17 11:55
/* Вкладка «Сборка»: заявки на дату и лист с галочками в порядке обхода склада
   (по часовой стрелке от двери). Сейчас — по заявке, со следующей недели — весь маршрут за круг. */
(function(){
  "use strict";
  const {html, icon, $, $$, date: D, haptic} = Kit;
  const {api, L, W, P, fail} = Cake;

  const PK = Cake.pick = {orders:[], points:[], routes:[], places:{}, dates:[], date:'', route:'', mode:'order'};
  const pt = id=> PK.points.find(x=>x.id === id) || {customer:'?', address:''};
  const placeOf = pid=> PK.places[pid] || 0;
  // Порядок круга: по месту, без места — в конце, внутри — по названию
  const byPlace = (a, b)=> (placeOf(a.productId) || 1e6) - (placeOf(b.productId) || 1e6) || L(a.productId).localeCompare(L(b.productId), 'ru');
  const total = o=> o.lines.reduce((s, l)=>s + l.qty + l.bonus, 0);
  // Грузовых мест: N шт в одной коробке (perBox у товара) — 10 пирожных = 1 место
  const boxes = o=> o.lines.reduce((s, l)=>s + Math.ceil((l.qty + l.bonus) / (P(l.productId).perBox || 1)), 0);
  const shortNum = n=> String(n).slice(-4);
  const qtyCell = (q, b)=> !q && b ? html`<span class="qty">${b}<span class="qty-unit">бонус</span></span>`
    : html`<span class="qty">${q}${b ? html`<span class="qty-unit">+${b} бонус</span>` : ''}</span>`;

  async function load(day){
    const r = await api('getOrders', day ? {date:day} : {});
    if(!r.ok){ fail(r); return false; }
    Object.assign(PK, {orders:r.orders, points:r.points, routes:r.routes, places:r.places, dates:r.dates, date:r.date});
    if(PK.route && !PK.routes.includes(PK.route)) PK.route = '';
    return true;
  }
  PK.reload = async ()=>{ if(await load(PK.date)) draw(); };

  async function renderPick(){ if(await load(PK.date)) draw(); }

  function draw(){
    const dates = PK.dates.includes(PK.date) ? PK.dates : PK.dates.concat(PK.date).sort();
    $('#pkDates').innerHTML = String(html`${dates.slice(-10).map(d=>html`<button class="chip${d === PK.date ? ' is-on' : ''}" type="button" data-d="${d}">${D.label(d)}</button>`)}`);
    $('#pkRoutes').innerHTML = String(html`<button class="chip${!PK.route ? ' is-on' : ''}" type="button" data-r="">Все</button>${PK.routes.map(r=>html`<button class="chip${r === PK.route ? ' is-on' : ''}" type="button" data-r="${r}">${r}</button>`)}`);
    $$('#pkMode button').forEach(b=> b.classList.toggle('is-on', b.dataset.m === PK.mode));
    $('#pkMode').hidden = !PK.route;
    const list = PK.orders.filter(o=>!PK.route || o.route === PK.route);
    const unplaced = PK.orders.some(o=>o.lines.some(l=>!placeOf(l.productId)));
    $('#pkNote').innerHTML = unplaced ? String(html`<p class="mode-note">Не у всех тортов задано место на складе — такие строки идут в конце листа. ${html`<button class="link-btn" type="button" data-places>Задать места</button>`}</p>`) : '';
    if(PK.route && PK.mode === 'route'){
      const free = list.filter(o=>!o.tripId), ready = free.length && free.every(o=>o.status === 'picked');
      $('#pkList').innerHTML = String(html`${routeSheet(list)}${free.length ? html`<button class="btn ${ready ? 'btn-primary' : 'btn-ghost'} btn-block section" type="button" data-ship>${icon('truck')}${ready ? 'Отгрузить маршрут водителю' : `Собрано ${free.length - free.filter(o=>o.status !== 'picked').length} из ${free.length} — отгрузка после сборки`}</button>` : html`<p class="hint section">Все заявки маршрута уже в рейсе — смотрите вкладку «Рейсы».</p>`}`);
      return;
    }
    $('#pkList').innerHTML = list.length ? String(html`${list.map(card)}`)
      : String(html`<div class="empty">${icon('route')}<div class="empty-title">Заявок нет</div>На ${D.label(PK.date)} заявок не внесено</div>`);
  }

  function card(o){
    const p = pt(o.pointId), done = o.status === 'picked', n = o.lines.length, c = o.checked.length;
    const st = o.tripId ? ['В рейсе', 'pill-info'] : done ? ['Собрано', 'pill-ok'] : c ? [`${c} из ${n}`, 'pill-warn'] : ['Ждёт', 'pill-muted'];
    return html`<button class="pick-card${done ? ' is-done' : ''}" type="button" data-o="${o.id}">
      <span class="pick-card-main"><span class="pick-card-title">№${o.num} · ${p.customer}</span>
        <span class="pick-card-sub">${p.address}</span>
        <span class="pick-card-sub">${o.route} · ${total(o)} шт · мест ${boxes(o)}${o.comment ? ' · ' + o.comment : ''}</span></span>
      <span class="pill ${st[1]}">${st[0]}</span></button>`;
  }

  // Весь маршрут за один круг: сколько взять с каждого места и как разложить по заявкам
  function routeSheet(list){
    const sum = {};
    list.forEach(o=> o.lines.forEach(l=>{
      const s = sum[l.productId] || (sum[l.productId] = {productId:l.productId, qty:0, bonus:0, by:[]});
      s.qty += l.qty; s.bonus += l.bonus; s.by.push(`№${shortNum(o.num)}: ${l.qty + l.bonus}`);
    }));
    const rows = Object.values(sum).sort(byPlace);
    if(!rows.length) return html`<div class="empty">${icon('route')}<div class="empty-title">Заявок нет</div></div>`;
    return html`<p class="hint">${list.length} заявок · ${rows.reduce((s, r)=>s + r.qty + r.bonus, 0)} шт. Берём всё за один круг, на середине раскладываем по заявкам.</p>
      <div class="card section">${rows.map(r=>html`<div class="pick-row is-static">
        <span class="place${placeOf(r.productId) ? '' : ' is-none'}">${placeOf(r.productId) || '—'}</span>
        <span class="pick-name">${Kit.nobr(P(r.productId).name)}<small>${W(P(r.productId).weightG)} · ${r.by.join(' · ')}</small></span>
        ${qtyCell(r.qty, r.bonus)}</div>`)}</div>`;
  }

  // Лист заявки с галочками
  function openOrder(o){
    const p = pt(o.pointId);
    const body = ()=>{
      const done = o.status === 'picked';
      return html`<div class="progress"><span style="width:${Math.round(100 * o.checked.length / o.lines.length)}%"></span></div>
        ${o.comment ? html`<p class="hint">${o.comment}</p>` : ''}
        <div class="section">${o.lines.slice().sort(byPlace).map(l=>{ const on = o.checked.includes(l.productId); return html`
          <button class="pick-row${on ? ' is-on' : ''}" type="button" data-l="${l.productId}" ${done ? 'disabled' : ''}>
            <span class="place${placeOf(l.productId) ? '' : ' is-none'}">${placeOf(l.productId) || '—'}</span>
            <span class="pick-name">${Kit.nobr(P(l.productId).name)}<small>${W(P(l.productId).weightG)}</small></span>
            ${qtyCell(l.qty, l.bonus)}
            <span class="pick-box">${on ? icon('check') : ''}</span></button>`; })}</div>
        ${done && o.boxes != null ? html`<div class="kv"><span class="k">Ящиков</span><span class="v">${o.boxes}</span></div>` : ''}`;
    };
    const sub = ()=> `${p.customer} · ${o.route} · ${o.checked.length} из ${o.lines.length}`;
    const actions = ()=> o.status === 'picked' ? html`<button class="btn btn-ghost btn-block" type="button" data-a="reopen">${icon('restore')}Вернуть в сборку</button>`
      : html`<button class="btn btn-ghost" type="button" data-a="edit">${icon('edit')}Изменить</button><button class="btn btn-primary" type="button" data-a="finish">${icon('check')}Собрано</button>`;
    const sh = Kit.sheet({title:`Заявка №${o.num}`, sub:sub(), body:body(), actions:actions()});
    const redraw = ()=>{ sh.body.innerHTML = String(body()); const s = $('.sheet-sub', sh.el); if(s) s.textContent = sub(); const a = $('.sheet-actions', sh.el); if(a) a.innerHTML = String(actions()); };
    Kit.on(sh.el, 'click', '[data-l]', async (e, el)=>{
      const pid = el.dataset.l, done = !o.checked.includes(pid);
      o.checked = done ? o.checked.concat(pid) : o.checked.filter(x=>x !== pid);  // сразу, без ожидания сервера
      haptic('select'); redraw();
      const r = await api('checkLine', {id:o.id, productId:pid, done});
      if(!r.ok){ fail(r); await PK.reload(); sh.close(); return; }
      Object.assign(o, r.order); redraw(); draw();
    });
    Kit.on(sh.el, 'click', '[data-a]', async (e, el)=>{
      const a = el.dataset.a;
      if(a === 'edit'){ sh.close(); Cake.editOrder(o); return; }
      if(a === 'reopen'){ const r = await api('reopenPick', {id:o.id}); if(!r.ok){ fail(r); return; } Object.assign(o, r.order); redraw(); draw(); return; }
      const left = o.lines.length - o.checked.length;
      // Собрали, не отмечая по строкам, — одно подтверждение вместо 14 галочек
      if(left && !await Kit.confirm(`Не отмечено строк: ${left} из ${o.lines.length}. Всё уже собрано? Отметим все строки разом.`, 'Да, всё собрано')) return;
      finish(o, ()=>{ redraw(); draw(); }, left > 0);
    });
  }

  // Собирает вся смена — кто собрал не спрашиваем; ящики (оборотная тара) — по желанию
  function finish(o, after, all){
    const sh = Kit.sheet({title:'Заявка собрана', sub:`№${o.num}`, body: html`
      <label class="field"><span class="field-label">Количество ящиков</span><input class="input" id="pkBoxes" type="number" inputmode="numeric" min="0" placeholder="не обязательно"></label>`,
      actions: html`<button class="btn btn-primary btn-block" type="button" data-ok>${icon('check')}Готово</button>`});
    Kit.on(sh.el, 'click', '[data-ok]', async (e, el)=>{
      const boxes = $('#pkBoxes', sh.el).value;
      Kit.busy(el, true);
      const r = await api('finishPick', Object.assign({id:o.id}, boxes !== '' ? {boxes:+boxes} : {}, all ? {all:true} : {}));
      Kit.busy(el, false);
      if(!r.ok){ fail(r); return; }
      Object.assign(o, r.order); haptic('success'); Kit.toast(`Заявка №${o.num} собрана`, 'ok'); sh.close(); after();
    });
  }

  Kit.on($('#pkDates'), 'click', '[data-d]', async (e, el)=>{ haptic('select'); PK.date = el.dataset.d; await renderPick(); });
  Kit.on($('#pkRoutes'), 'click', '[data-r]', (e, el)=>{ haptic('select'); PK.route = el.dataset.r; if(!PK.route) PK.mode = 'order'; draw(); });
  Kit.on($('#pkMode'), 'click', '[data-m]', (e, el)=>{ haptic('select'); PK.mode = el.dataset.m; draw(); });
  Kit.on($('#pkList'), 'click', '[data-o]', (e, el)=> openOrder(PK.orders.find(x=>x.id === el.dataset.o)));
  Kit.on($('#pkNote'), 'click', '[data-places]', ()=> Cake.editPlaces());
  Kit.on($('#pkList'), 'click', '[data-ship]', ()=> Cake.shipRoute(PK.orders.filter(o=>o.route === PK.route && !o.tripId)));

  Cake.tabs.pick = renderPick;
})();
