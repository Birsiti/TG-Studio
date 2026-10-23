// изменено 2026-10-23 05:00
/* Экран «Погрузка»: маршрут на дату → порядок объезда, кузов сверху (столбы ящиков у прохода),
   лист каждой точки для водителя, ящики и бирки. Расчёт — в js/load-plan.js (CakeLoad).
   Открывается из «Заявки → Весь маршрут» (?date=…&route=…). Порядок точек и размеры — в этом телефоне. */
(function(){
  "use strict";
  const {html, icon, $, $$, date: D, num, haptic} = Kit;
  const {api, fail} = Cake;
  const G = window.CakeGeo, LP = window.CakeLoad;
  $('#mark').innerHTML = icon('truck');
  $('#cfgBtn').innerHTML = icon('settings');

  const CFG_KEY = 'cake-load-cfg', ORDER_KEY = 'cake-load-order';
  const read = (k, d)=> { try{ return JSON.parse(localStorage.getItem(k)) || d; }catch(e){ return d; } };
  const write = (k, v)=> { try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} };
  let cfg = Object.assign({}, LP.DEFAULTS, read(CFG_KEY, {}));
  const q = new URLSearchParams(location.search);
  const ST = {date:q.get('date') || '', route:q.get('route') || '', view:['route','body','stops','boxes'].includes(q.get('view')) ? q.get('view') : 'route', orders:[], points:[], routes:[], dates:[], stops:[], plan:null, find:''};

  Kit.back.push(()=> history.length > 1 ? history.back() : location.replace('logist.html'));

  const kg = x=> x < 10 ? x.toFixed(1).replace('.', ',') : String(Math.round(x));
  const hm = m=> { m = Math.round(m); return m < 60 ? m + ' мин' : Math.floor(m / 60) + ' ч ' + String(m % 60).padStart(2, '0') + ' мин'; };
  const W = g=> !g ? '' : g < 1000 ? g + ' г' : String(g / 1000).replace('.', ',') + ' кг';
  const nameW = it=> it.name + (it.weightG ? ', ' + W(it.weightG) : '');

  async function load(day){
    const r = await api('getOrders', day ? {date:day} : {});
    if(!r.ok){ fail(r); return false; }
    Object.assign(ST, {orders:r.orders, points:r.points, routes:r.routes, dates:r.dates, date:r.date});
    if(!ST.route || !ST.routes.includes(ST.route)) ST.route = ST.routes.find(rt=> r.orders.some(o=> o.route === rt)) || '';
    return true;
  }

  // Точки маршрута на дату: заявки одной точки складываем; порядок — сохранённый вручную или лучший
  function buildStops(){
    const list = ST.orders.filter(o=> o.route === ST.route);
    const free = list.filter(o=> !o.tripId), use = free.length ? free : list;
    const by = {};
    use.forEach(o=>{
      const p = ST.points.find(x=> x.id === o.pointId) || {id:o.pointId, customer:'?', address:''};
      const s = by[p.id] || (by[p.id] = {pointId:p.id, name:p.customer, address:p.address, geo:G.points[p.id] || null, nums:[], noLines:0, lines:{}});
      s.nums.push(o.num); if(!o.lines.length) s.noLines++;
      o.lines.forEach(l=> s.lines[l.productId] = (s.lines[l.productId] || 0) + l.qty + l.bonus);
    });
    let stops = Object.values(by).map(s=> Object.assign(s, {lines:Object.entries(s.lines).map(([productId, qty])=>({productId, qty}))}));
    const saved = read(ORDER_KEY, {})[ST.date + '|' + ST.route];
    if(saved && saved.length === stops.length && stops.every(s=> saved.includes(s.pointId))) stops.sort((a, b)=> saved.indexOf(a.pointId) - saved.indexOf(b.pointId));
    else stops = bestStops(stops);
    ST.stops = stops; ST.manual = !!(saved && saved.length === stops.length);
  }
  function bestStops(stops){
    const g = stops.filter(s=> s.geo), no = stops.filter(s=> !s.geo);
    return LP.bestOrder([G.sklad].concat(g.map(s=> s.geo))).map(i=> g[i - 1]).concat(no);
  }
  function saveOrder(){ const all = read(ORDER_KEY, {}); all[ST.date + '|' + ST.route] = ST.stops.map(s=> s.pointId); write(ORDER_KEY, all); ST.manual = true; }
  function resetOrder(){ const all = read(ORDER_KEY, {}); delete all[ST.date + '|' + ST.route]; write(ORDER_KEY, all); ST.stops = bestStops(ST.stops); ST.manual = false; }

  function recalc(){ ST.plan = ST.stops.length ? LP.plan(ST.stops, Cake.refs.products, cfg) : null; }

  /* ============ ОТРИСОВКА ============ */
  function draw(){
    const dates = ST.dates.includes(ST.date) ? ST.dates : ST.dates.concat(ST.date).sort();
    $('#ldDates').innerHTML = String(html`${dates.slice(-10).map(d=>html`<button class="chip${d === ST.date ? ' is-on' : ''}" type="button" data-d="${d}">${D.label(d)}</button>`)}`);
    const withOrders = ST.routes.filter(r=> ST.orders.some(o=> o.route === r));
    $('#ldRoutes').innerHTML = String(html`${withOrders.map(r=>html`<button class="chip${r === ST.route ? ' is-on' : ''}" type="button" data-r="${r}">${r}</button>`)}`);
    $$('#ldSeg button').forEach(b=> b.classList.toggle('is-on', b.dataset.v === ST.view));
    const P = ST.plan;
    if(!P){ $('#ldView').innerHTML = String(html`<div class="empty">${icon('route')}<div class="empty-title">Нет заявок</div>На ${D.label(ST.date)} по маршрутам заявок не внесено</div>`); $('#ldSub').textContent = ''; return; }
    const lg = LP.legs(G.sklad, ST.stops, cfg);
    $('#ldSub').textContent = `${ST.stops.length} точек · ${num(P.items.reduce((s, x)=> s + x.total, 0))} шт · ${P.boxes.length} ящиков · ≈ ${Math.round(P.kg)} кг · ≈ ${Math.round(lg.km)} км`;
    $('#ldView').innerHTML = String(({route:viewRoute, body:viewBody, stops:viewStops, boxes:viewBoxes})[ST.view](P, lg));
  }

  const warnings = P=> html`${P.inAisle ? html`<p class="mode-note">${icon('alert')} В столбы у бортов не влезло ${P.inAisle} ящ. — они стоят в проходе у двери: это товар первых точек. Проход освободится после точки ${P.aisleFreeAfter + 1}.</p>` : ''}
    ${P.over.length ? html`<p class="mode-note">${icon('alert')} Не помещается совсем: ${P.over.length} ящ. Нужен кузов длиннее или второй рейс — или больше слоёв в настройках.</p>` : ''}
    ${P.unknown.length ? html`<p class="mode-note">«Шт в ящике» не задано у ${P.unknown.length} поз. — посчитано примерно (торты по ${cfg.estCake}, остальное по ${cfg.estOther}): ${P.unknown.slice(0, 3).map(x=> x.name).join(', ')}${P.unknown.length > 3 ? ` и ещё ${P.unknown.length - 3}` : ''}. Список — во вкладке «Ящики».</p>` : ''}
    ${ST.stops.some(s=> s.noLines) ? html`<p class="mode-note">Есть заявки «по фото» без строк — их товар в расчёт не попал.</p>` : ''}`;

  /* ---- Маршрут ---- */
  function viewRoute(P, lg){
    const noGeo = ST.stops.filter(s=> !s.geo).length;
    return html`<div class="stats">
        <div class="stat"><div class="stat-label">Пробег</div><div class="stat-value">≈ ${Math.round(lg.km)} км</div><div class="stat-delta">склад → точки → склад</div></div>
        <div class="stat"><div class="stat-label">Время</div><div class="stat-value">≈ ${hm(lg.min)}</div><div class="stat-delta">с остановками по ${cfg.serviceMin} мин</div></div></div>
      <button class="btn btn-primary btn-block section" type="button" data-ymap>${icon('route')}Открыть маршрут в Яндекс Картах</button>
      <p class="hint section">${ST.manual ? 'Порядок изменён вручную. ' : 'Порядок подобран по кратчайшему кругу. '}Пробег и время — по прямой с поправкой на дороги, точные — в Яндекс Картах.${noGeo ? ` У ${noGeo} точек нет координат — они в конце, переставьте вручную.` : ''}</p>
      <div class="list section">
        <div class="row"><span class="row-icon">${icon('home')}</span><span class="row-main"><span class="row-title">Склад</span><span class="row-sub">${G.sklad.name}</span></span></div>
        ${ST.stops.map((s, i)=>html`<div class="row">
          <span class="stop-num">${i + 1}</span>
          <span class="row-main"><span class="row-title">${s.name}</span><span class="row-sub">${s.address}${s.geo ? (s.geo.q && s.geo.q !== 'точно' ? ' · на карте ' + s.geo.q : '') : ' · нет координат'}</span>
            <span class="row-sub">${s.lines.reduce((a, l)=> a + l.qty, 0)} шт · ≈ ${lg.legs[i].km.toFixed(1).replace('.', ',')} км от предыдущей · заявки ${s.nums.map(n=> '№' + String(n).slice(-4)).join(', ')}</span></span>
          <span class="row-end ld-move"><button class="icon-btn" type="button" data-up="${i}" aria-label="Выше"${i ? '' : Kit.raw(' disabled')}>${icon('up')}</button><button class="icon-btn" type="button" data-down="${i}" aria-label="Ниже"${i < ST.stops.length - 1 ? '' : Kit.raw(' disabled')}>${icon('down')}</button></span></div>`)}
        <div class="row"><span class="row-icon">${icon('home')}</span><span class="row-main"><span class="row-title">Склад</span><span class="row-sub">≈ ${lg.legs[ST.stops.length].km.toFixed(1).replace('.', ',')} км назад · пустые ящики: ${P.boxes.length}</span></span></div>
      </div>
      ${ST.manual ? html`<button class="btn btn-ghost btn-block section" type="button" data-best>${icon('refresh')}Вернуть лучший порядок</button>` : ''}
      <p class="hint section">Поменяли порядок — раскладка в кузове и листы точек пересчитываются сразу: ящики для первых точек встают ближе к двери и сверху.</p>`;
  }

  /* ---- Кузов сверху ---- */
  function viewBody(P){
    const geo = P.slots.geom, sc = 300 / cfg.bodyW;                      // мм → px, ширина рисунка 300
    const BW = cfg.bodyW * sc, BL = cfg.bodyL * sc, X0 = 10, Y0 = 44;
    const at = st=>{ const s = st.slot, w = s.across * sc, h = s.along * sc;
      const x = s.aisle ? X0 + geo.side * sc + (cfg.aisle - s.across) * sc / 2 : geo.mode === 'aisle' ? (s.side === 'L' ? X0 + geo.side * sc - (s.deep + 1) * w : X0 + (geo.side + cfg.aisle) * sc + s.deep * w) : X0 + s.col * w;
      const y = Y0 + BL - (s.row + 1) * h; return {x, y, w, h}; };
    const fq = ST.find.trim().toLowerCase();
    const hit = st=> fq && st.boxes.some(b=> b.name.toLowerCase().includes(fq));
    const used = new Set(P.stacks.map(st=> st.slot));
    const cells = P.stacks.map(st=>{ const r = at(st), top = st.boxes[st.boxes.length - 1];
      return html`<g class="ld-cell${st.cake ? ' is-cake' : ''}${hit(st) ? ' is-hit' : fq ? ' is-dim' : ''}" data-st="${st.id}" tabindex="0" role="button" aria-label="Столб ${st.id}: ${st.boxes.length} ящиков">
        <rect x="${r.x + 2}" y="${r.y + 2}" width="${r.w - 4}" height="${r.h - 4}" rx="6"/>
        <text x="${r.x + r.w / 2}" y="${r.y + 21}" class="ld-n">${st.id}</text>
        <text x="${r.x + r.w / 2}" y="${r.y + 37}" class="ld-s">${st.boxes.length} сл</text>
        <text x="${r.x + r.w / 2}" y="${r.y + 52}" class="ld-s">т.${top.open + 1}</text></g>`; });
    const free = P.slots.filter(s=> !used.has(s)).map(s=>{ const r = at({slot:s});
      return html`<rect class="ld-free" x="${r.x + 2}" y="${r.y + 2}" width="${r.w - 4}" height="${r.h - 4}" rx="6"/>`; });
    const aisle = geo.mode === 'aisle' ? html`<rect class="ld-aisle" x="${X0 + geo.side * sc}" y="${Y0}" width="${cfg.aisle * sc}" height="${BL}"/>
      <text class="ld-lbl" x="${X0 + (geo.side + cfg.aisle / 2) * sc}" y="${Y0 + BL / 2}" transform="rotate(-90 ${X0 + (geo.side + cfg.aisle / 2) * sc} ${Y0 + BL / 2})">проход ${cfg.aisle / 10} см</text>` : '';
    return html`${warnings(P)}
      <label class="field"><span class="field-label">Найти товар в кузове</span><input class="input" id="ldFind" type="search" placeholder="Наполеон, Смородинка…" value="${ST.find}" autocomplete="off"></label>
      <div class="card section ld-truck"><svg viewBox="0 0 ${BW + 2 * X0} ${BL + Y0 + 34}" role="img" aria-label="Кузов сверху">
        <rect class="ld-cab" x="${X0 + 20}" y="6" width="${BW - 40}" height="${Y0 - 12}" rx="12"/><text class="ld-lbl" x="${X0 + BW / 2}" y="${Y0 / 2 + 5}">кабина</text>
        <rect class="ld-floor" x="${X0}" y="${Y0}" width="${BW}" height="${BL}" rx="4"/>
        ${aisle}${free}${cells}
        <text class="ld-lbl" x="${X0 + BW / 2}" y="${Y0 + BL + 24}">дверь · отсюда водитель берёт</text></svg></div>
      <p class="hint section">Цифра — номер столба, «т.N» — для какой точки верхний ящик. Розовые — торты (до ${cfg.layersCake} слоёв), серые — остальное (до ${cfg.layersOther}). Нажмите на столб — что в нём по слоям. Пунктир — свободно, сюда пустые ящики.</p>
      <div class="stats section"><div class="stat"><div class="stat-label">Столбов</div><div class="stat-value">${P.stacks.length} из ${P.slots.length}</div><div class="stat-delta">${geo.mode === 'aisle' ? `по ${geo.deep} от прохода с каждой стороны` : 'рядами от двери'}</div></div>
        <div class="stat"><div class="stat-label">Груз</div><div class="stat-value">≈ ${Math.round(P.kg)} кг</div><div class="stat-delta">${P.boxes.length} ящиков${P.inAisle ? ` · в проходе ${P.inAisle}` : ''}${P.over.length ? ` · не влезло ${P.over.length}` : ''}</div></div></div>
      <button class="btn btn-ghost btn-block section" type="button" data-cfg>${icon('settings')}Кузов ${cfg.bodyL / 1000}×${cfg.bodyW / 1000} м · ящик ${cfg.boxL / 10}×${cfg.boxW / 10} см — изменить</button>`;
  }
  function openStack(id){
    const st = ST.plan.stacks.find(s=> s.id === id); if(!st) return;
    const side = st.slot.aisle ? 'в проходе' : st.slot.side ? (st.slot.side === 'L' ? 'слева' : 'справа') + (st.slot.deep ? ', у стены' : ', у прохода') : '';
    Kit.sheet({title:`Столб ${st.id}`, sub:`${st.boxes.length} ящ. · ≈ ${kg(st.boxes.reduce((s, b)=> s + b.kg, 0))} кг · ${st.slot.row + 1}-й ряд от двери${side ? ', ' + side : ''}`,
      body: html`<p class="hint">Сверху вниз. «Точка» — где из ящика начнут брать.</p><div class="list section">${st.boxes.slice().reverse().map(b=>html`<div class="row">
        <span class="stop-num">${b.layer}</span><span class="row-main"><span class="row-title">${b.name}${b.weightG ? html` <span class="hint nowrap">${W(b.weightG)}</span>` : ''}${b.est ? ' ≈' : ''}</span>
        <span class="row-sub">${b.qty} шт · точка ${b.open + 1}: ${ST.stops[b.open].name}</span></span></div>`)}</div>`});
  }

  /* ---- Листы точек ---- */
  function viewStops(P){
    return html`${warnings(P)}<p class="hint">Что взять на каждой точке и из какого столба. Берём сверху; опустевший ящик — пустым на свободное место.</p>
      ${P.sheets.map(sh=>html`<div class="card section">
        <div class="section-head"><h2 class="section-title">${sh.i + 1}. ${sh.stop.name}</h2><button class="icon-btn" type="button" data-map="${sh.i}" aria-label="На карте">${icon('pin')}</button></div>
        <p class="hint">${sh.stop.address}</p>
        ${sh.take.map(t=>html`<div class="kv"><span class="k">${nameW(t.item)}${t.item.est ? ' ≈' : ''}</span><span class="v">${t.qty} шт · ${t.from.map(f=> f.box.stack ? `ст.${f.box.stack}/${f.box.layer}` : 'не влезло').filter((x, j, a)=> a.indexOf(x) === j).join(', ')}</span></div>`)}
        <p class="hint section">Опустеет ящиков: ${sh.emptied} · пустых в кузове: ${sh.emptyTotal}${sh.fits ? '' : html` · <b style="color:var(--danger)">пустым не хватит места</b>`}</p></div>`)}`;
  }

  /* ---- Ящики и бирки ---- */
  function viewBoxes(P){
    const items = P.items.slice().sort((a, b)=> b.boxes - a.boxes || a.name.localeCompare(b.name, 'ru'));
    return html`${warnings(P)}<div class="list">${items.map(it=>html`<div class="row"><span class="row-main"><span class="row-title">${it.name}${it.weightG ? html` <span class="hint nowrap">${W(it.weightG)}</span>` : ''}</span>
        <span class="row-sub">${it.total} шт · по ${it.perBox}${it.est ? ' (примерно)' : ''} в ящике · ящик ≈ ${kg(it.boxKg)} кг · точек ${it.by.filter(Boolean).length}</span></span>
        <span class="row-end"><span class="pill ${it.est ? 'pill-warn' : 'pill-muted'} no-dot">${it.boxes} ящ.</span></span></div>`)}</div>
      <button class="btn btn-ghost btn-block section" type="button" data-tags>${icon('copy')}Бирки на ящики — скопировать таблицу</button>
      <p class="hint section">Бирка: столб/слой, товар, штук, точка. Таблицу можно вставить в Excel и напечатать.</p>`;
  }
  function copyTags(){
    const rows = [['Ящик', 'Столб', 'Слой', 'Товар', 'Вес', 'Шт', 'Точка', 'Маршрут', 'Дата']];
    ST.plan.boxes.slice().sort((a, b)=> (a.stack || 999) - (b.stack || 999) || (b.layer || 0) - (a.layer || 0)).forEach(b=>
      rows.push([b.id, b.stack || 'не влезло', b.layer || '', b.name + (b.est ? ' (≈)' : ''), W(b.weightG), b.qty, `${b.open + 1}. ${ST.stops[b.open].name}`, ST.route, ST.date]));
    Kit.csv(`birki-${ST.route}-${ST.date}.csv`, rows);
  }

  /* ---- Размеры ---- */
  const FIELDS = [['bodyL', 'Кузов: длина, мм'], ['bodyW', 'Кузов: ширина, мм'], ['aisle', 'Проход, мм (0 — без прохода)'], ['boxL', 'Ящик: длина, мм'], ['boxW', 'Ящик: ширина, мм'],
    ['layersCake', 'Слоёв тортов в столбе'], ['layersOther', 'Слоёв остального'], ['estCake', 'Не задано «шт в ящике»: торты'], ['estOther', 'Не задано: остальное'], ['serviceMin', 'Минут на точке']];
  function openCfg(){
    const sh = Kit.sheet({title:'Кузов и ящики', sub:'Сохраняется в этом телефоне',
      body: html`<div class="ld-cfg">${FIELDS.map(([k, t])=>html`<label class="field"><span class="field-label">${t}</span><input class="input" name="${k}" type="number" inputmode="numeric" min="0" value="${cfg[k]}"></label>`)}</div>
        <p class="hint section">Пока размеров нет, стоят примерные: кузов 4×2 м, ящик 60×40 см.</p>`,
      actions: html`<button class="btn btn-ghost" type="button" id="cfgReset">Как было</button><button class="btn btn-primary" type="button" id="cfgSave">Пересчитать</button>`});
    sh.$('#cfgSave').addEventListener('click', ()=>{
      const n = {}; $$('[name]', sh.el).forEach(el=>{ const v = parseInt(el.value, 10); n[el.name] = v >= 0 ? v : LP.DEFAULTS[el.name]; });
      ['bodyL', 'bodyW', 'boxL', 'boxW', 'layersCake', 'layersOther', 'estCake', 'estOther'].forEach(k=>{ if(!(n[k] > 0)) n[k] = LP.DEFAULTS[k]; });
      if(n.aisle >= n.bodyW){ Kit.toast('Проход шире кузова', 'error'); return; }
      cfg = Object.assign({}, LP.DEFAULTS, n); write(CFG_KEY, n); haptic('success'); sh.close(); recalc(); draw();
    });
    sh.$('#cfgReset').addEventListener('click', ()=>{ cfg = Object.assign({}, LP.DEFAULTS); write(CFG_KEY, {}); sh.close(); recalc(); draw(); });
  }

  /* ============ СОБЫТИЯ ============ */
  Kit.on($('#ldDates'), 'click', '[data-d]', async (e, el)=>{ haptic('select'); if(await load(el.dataset.d)){ buildStops(); recalc(); draw(); } });
  Kit.on($('#ldRoutes'), 'click', '[data-r]', (e, el)=>{ haptic('select'); ST.route = el.dataset.r; ST.find = ''; buildStops(); recalc(); draw(); });
  Kit.on($('#ldSeg'), 'click', '[data-v]', (e, el)=>{ haptic('select'); ST.view = el.dataset.v; draw(); });
  $('#cfgBtn').addEventListener('click', openCfg);
  const V = $('#ldView');
  Kit.on(V, 'click', '[data-up]', (e, el)=>{ const i = +el.dataset.up; if(i < 1) return; [ST.stops[i - 1], ST.stops[i]] = [ST.stops[i], ST.stops[i - 1]]; saveOrder(); haptic('select'); recalc(); draw(); });
  Kit.on(V, 'click', '[data-down]', (e, el)=>{ const i = +el.dataset.down; if(i >= ST.stops.length - 1) return; [ST.stops[i + 1], ST.stops[i]] = [ST.stops[i], ST.stops[i + 1]]; saveOrder(); haptic('select'); recalc(); draw(); });
  Kit.on(V, 'click', '[data-best]', ()=>{ resetOrder(); haptic('success'); recalc(); draw(); });
  Kit.on(V, 'click', '[data-ymap]', ()=> Kit.openLink(LP.yandexUrl(G.sklad, ST.stops)));
  Kit.on(V, 'click', '[data-map]', (e, el)=> CakeMap.one(ST.stops[+el.dataset.map].address));
  Kit.on(V, 'click', '[data-st]', (e, el)=> openStack(+el.dataset.st));
  Kit.on(V, 'keydown', '[data-st]', (e, el)=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openStack(+el.dataset.st); } });
  Kit.on(V, 'click', '[data-cfg]', openCfg);
  Kit.on(V, 'click', '[data-tags]', copyTags);
  // поиск без перерисовки поля: подсвечиваем столбы
  V.addEventListener('input', e=>{
    if(e.target.id !== 'ldFind') return;
    ST.find = e.target.value; const fq = ST.find.trim().toLowerCase();
    $$('.ld-cell', V).forEach(c=>{ const st = ST.plan.stacks.find(s=> s.id === +c.dataset.st), h = fq && st.boxes.some(b=> b.name.toLowerCase().includes(fq));
      c.classList.toggle('is-hit', !!h); c.classList.toggle('is-dim', !!fq && !h); });
  });

  Kit.ready(async ()=>{
    await Cake.loadRefs();
    if(!(Cake.refs.products || []).length){ V.innerHTML = String(html`<div class="empty">${icon('lock')}<div class="empty-title">Нет доступа</div>Откройте склад из бота</div>`); return; }
    if(await load(ST.date)){ buildStops(); recalc(); draw(); }
  });
})();
