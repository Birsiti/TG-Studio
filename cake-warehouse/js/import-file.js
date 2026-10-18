// изменено 2026-10-18 12:00
/* Загрузка из файла (Excel .xlsx/.xls или CSV): приход с производства и заявки магазинов.
   Шапку таблицы ищем сами по словам («Наименование», «Кол-во», «Заказчик», «Адрес», «Маршрут», «№ заявки»…),
   торт сопоставляем с ассортиментом по названию и весу (вес из названия «0,8 кг» или колонки «Вес»).
   Что не узналось — выбрать вручную или пропустить. Приход заполняет поля вкладки (провести — «Оприходовать»),
   заявки заводятся сразу (savePoint + saveOrder — те же проверки, что при ручном вводе). */
(function(){
  "use strict";
  const {html, icon, $, $$, date: D, num, haptic} = Kit;
  const {api, W, fail} = Cake;
  const XLSX_URLS = ['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
                     'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'];
  const SAMPLES = {income:'samples/prihod-primer.xlsx', orders:'samples/zayavki-primer.xlsx'};

  /* ---------- чтение файла ---------- */
  function loadScript(url){
    return new Promise((ok, no)=>{ const s = document.createElement('script'); s.src = url; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  }
  async function xlsx(){
    for(const u of XLSX_URLS){ if(window.XLSX) break; try{ await loadScript(u); }catch(e){} }
    if(!window.XLSX) throw new Error('Не удалось загрузить чтение Excel — проверьте интернет или сохраните файл как CSV');
    return window.XLSX;
  }
  function parseCsv(text){
    const first = text.split(/\r?\n/).find(l=>l.trim()) || '';
    const sep = [';', '\t', ','].sort((a, b)=> first.split(b).length - first.split(a).length)[0];
    const out = []; let row = [], cell = '', q = false;
    for(let i = 0; i < text.length; i++){
      const c = text[i];
      if(q){ if(c === '"' && text[i + 1] === '"'){ cell += '"'; i++; } else if(c === '"') q = false; else cell += c; }
      else if(c === '"') q = true;
      else if(c === sep){ row.push(cell); cell = ''; }
      else if(c === '\n' || c === '\r'){ if(c === '\r' && text[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if(cell || row.length){ row.push(cell); out.push(row); }
    return out;
  }
  async function readRows(file){
    if(/\.(csv|txt)$/i.test(file.name)) return parseCsv((await file.text()).replace(/^﻿/, ''));
    const X = await xlsx();
    const wb = X.read(await file.arrayBuffer(), {type:'array', cellDates:true});
    // первый лист, где есть строки
    for(const n of wb.SheetNames){ const r = X.utils.sheet_to_json(wb.Sheets[n], {header:1, raw:true, defval:''}); if(r.length) return r; }
    return [];
  }

  /* ---------- шапка ---------- */
  const COLS = {
    name: /наимен|товар|номенклат|назван|продукц|позици/,
    qty: /^кол|количеств|^шт(?![а-я])|кол\.?-?во|^заказано/,
    weight: /вес|масса/,
    bonus: /бонус/,
    customer: /заказчик|покупател|магазин|точк|получател|клиент|контрагент/,
    address: /адрес/,
    route: /маршрут/,
    num: /заявк|номер|^№$|^№\s*док/,
    date: /^дата/
  };
  const low = v=> String(v == null ? '' : v).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  function findHeader(rows){
    for(let i = 0; i < Math.min(rows.length, 40); i++){
      const map = {};
      rows[i].forEach((v, j)=>{
        const h = low(v); if(!h || /п\/п/.test(h)) return;
        for(const k of Object.keys(COLS)) if(map[k] === undefined && COLS[k].test(h)){ map[k] = j; break; }
      });
      if(map.name !== undefined && map.qty !== undefined) return {at:i, map, kg:map.weight !== undefined && /кг/.test(low(rows[i][map.weight]))};
    }
    return null;
  }

  /* ---------- торт по названию и весу ---------- */
  const STOP = new Set(['торт', 'торты', 'пирожное', 'пирожные', 'десерт', 'венский', 'набор', 'наборы', 'сладости', 'мучные', 'шт', 'кг', 'г', 'гр', 'ооо', 'оао']);
  function weightIn(s){
    const m = low(s).match(/(\d+(?:[.,]\d+)?)\s*(кг|гр|г)(?![а-яa-z])/);
    if(!m) return 0;
    const v = parseFloat(m[1].replace(',', '.'));
    return Math.round(m[2] === 'кг' ? v * 1000 : v);
  }
  function tokens(s){
    return low(s).replace(/(\d+(?:[.,]\d+)?)\s*(кг|гр|г)(?![а-яa-z])/g, ' ').replace(/[«»"'„“”().,;:!?\/\\+\-–—№]/g, ' ')
      .split(' ').filter(t=>t && !STOP.has(t) && !/^\d+$/.test(t));
  }
  const same = (a, b)=> a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));
  function score(a, b){
    if(!a.length || !b.length) return 0;
    const hit = a.filter(t=>b.some(u=>same(t, u))).length;
    return 2 * hit / (a.length + b.length);
  }
  let catalog = null;
  function match(name, weightG, qty){
    if(!catalog || catalog.refs !== Cake.refs) catalog = {refs:Cake.refs, list:Cake.refs.products.filter(p=>p.active).map(p=>({p, t:tokens(p.name)}))};
    const t = tokens(name);
    let best = 0, cands = [];
    for(const c of catalog.list){
      const s = score(t, c.t);
      if(s > best + 0.001){ best = s; cands = [c.p]; } else if(Math.abs(s - best) <= 0.001) cands.push(c.p);
    }
    if(best < 0.5) return null;
    if(cands.length === 1) return cands[0];
    const w = weightIn(name) || weightG;
    const near = (g, x)=> Math.abs(g - x) <= g * 0.03;
    if(w){ const byW = cands.filter(p=>near(p.weightG, w)); if(byW.length) cands = byW; else if(qty > 1){ const byQ = cands.filter(p=>near(p.weightG, w / qty)); if(byQ.length) cands = byQ; } }
    if(cands.length > 1){ const n = low(name), byCat = cands.filter(p=>n.includes(low(p.cat).split(' ')[0].slice(0, 6))); if(byCat.length) cands = byCat; }
    return cands.length === 1 ? cands[0] : null;  // одно название в разных весах без веса — пусть выберут
  }

  /* ---------- строки файла → позиции ---------- */
  const cellNum = v=> typeof v === 'number' ? v : parseFloat(String(v).replace(/\s/g, '').replace(',', '.')) || 0;
  function cellDate(v){
    if(v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
    const m = String(v).match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
    if(!m) return '';
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  function parse(rows){
    const h = findHeader(rows);
    if(!h) return {error:'Не нашёл в файле колонки «Наименование» и «Количество». Посмотрите пример файла.'};
    const g = (r, k)=> h.map[k] === undefined ? '' : r[h.map[k]];
    const items = [];
    let carry = {};  // заказчик/адрес/№ часто стоят только в первой строке заявки
    for(const r of rows.slice(h.at + 1)){
      const name = String(g(r, 'name') || '').trim(), qty = Math.round(cellNum(g(r, 'qty')));
      ['customer', 'address', 'route', 'num', 'date'].forEach(k=>{ const v = g(r, k); if(String(v).trim()) carry[k] = v; });
      if(!name || /^итого|^всего/i.test(name)) continue;
      if(qty <= 0) continue;
      let w = cellNum(g(r, 'weight'));
      if(w && (h.kg || w < 20)) w = Math.round(w * 1000);
      items.push({name, qty, bonus:Math.max(0, Math.round(cellNum(g(r, 'bonus')))), weightG:w,
        customer:String(carry.customer || '').trim(), address:String(carry.address || '').trim(), route:String(carry.route || '').trim(),
        num:String(carry.num || '').trim().replace(/^№\s*/, ''), date:cellDate(carry.date || ''), productId:(match(name, w, qty) || {}).id || ''});
    }
    if(!items.length) return {error:'В файле нет строк с количеством больше нуля.'};
    return {items, hasCustomer:h.map.customer !== undefined};
  }

  /* ---------- окно предпросмотра ---------- */
  const productOptions = sel=> html`<option value="">— пропустить —</option>${Cake.CATS().map(c=>{
      const ps = Cake.refs.products.filter(p=>p.active && p.cat === c);
      return ps.length ? html`<optgroup label="${c}">${ps.map(p=>html`<option value="${p.id}"${p.id === sel ? Kit.raw(' selected') : ''}>${p.name}, ${W(p.weightG)}</option>`)}</optgroup>` : '';
    })}`;

  function sampleBtn(kind){
    return html`<button class="link-btn" type="button" data-sample="${kind}">${icon('download')}Пример файла</button>`;
  }
  function openSample(kind){
    const url = new URL(SAMPLES[kind], location.href).href, tg = Kit.tg;
    if(tg && tg.downloadFile){ try{ tg.downloadFile({url, file_name:url.split('/').pop()}); return; }catch(e){} }
    Kit.openLink(url);
  }

  // Выбрать файл → предпросмотр → onApply(items) с узнанными тортами
  function pick(kind, onApply){
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv';
    inp.addEventListener('change', async ()=>{
      const f = inp.files && inp.files[0]; if(!f) return;
      let res;
      try{ res = parse(await readRows(f)); }catch(e){ res = {error:e.message || 'Не получилось прочитать файл'}; }
      if(res.error){ haptic('error'); Kit.sheet({title:'Файл не подошёл', body:html`<p>${res.error}</p><div class="section">${sampleBtn(kind)}</div>`}).el.addEventListener('click', e=>{ const b = e.target.closest('[data-sample]'); if(b) openSample(b.dataset.sample); }); return; }
      preview(kind, f.name, res, onApply);
    });
    inp.click();
  }

  function preview(kind, fileName, res, onApply){
    const items = res.items, bad = items.filter(x=>!x.productId);
    const ok = ()=> items.filter(x=>x.productId);
    const groups = kind === 'orders' ? groupOrders(items) : [];
    const sh = Kit.sheet({title:kind === 'orders' ? 'Заявки из файла' : 'Приход из файла', sub:fileName, body:html`
      <div class="kv"><span class="k">Строк с тортами</span><span class="v mono">${items.length}</span></div>
      <div class="kv"><span class="k">Узнал автоматически</span><span class="v mono">${items.length - bad.length}</span></div>
      <div class="kv"><span class="k">Штук всего</span><span class="v mono">${num(items.reduce((s, x)=>s + x.qty, 0))}</span></div>
      ${kind === 'orders' ? html`<div class="kv"><span class="k">Заявок</span><span class="v mono">${groups.length}</span></div>
        ${!res.hasCustomer ? html`<p class="hint section">В файле нет колонки «Заказчик» — все строки станут одной заявкой.</p>` : ''}
        <div class="list section">${groups.map(gr=>html`<div class="row"><span class="row-main"><span class="row-title">${gr.num ? '№' + gr.num + ' · ' : ''}${gr.customer || 'без заказчика'}</span>
          <span class="row-sub">${gr.route || 'маршрут не указан'} · ${gr.items.length} поз. · ${gr.items.reduce((s, x)=>s + x.qty, 0)} шт</span></span></div>`)}</div>` : ''}
      ${bad.length ? html`<div class="section"><div class="eyebrow" style="margin-bottom:8px">Не узнал — выберите торт (${bad.length})</div>
        ${bad.map((x, i)=>html`<label class="field section"><span class="field-label">${x.name} — ${x.qty} шт</span><select class="input select" data-fix="${items.indexOf(x)}">${productOptions('')}</select></label>`)}</div>` : ''}
      <div class="section">${sampleBtn(kind)}</div>`,
      actions:html`<button class="btn btn-primary btn-block" type="button" data-go>${kind === 'orders' ? 'Завести заявки' : 'Заполнить приход'}</button>`});
    sh.el.addEventListener('change', e=>{ const s = e.target.closest('[data-fix]'); if(s) items[+s.dataset.fix].productId = s.value; });
    sh.el.addEventListener('click', async e=>{
      const s = e.target.closest('[data-sample]'); if(s){ openSample(s.dataset.sample); return; }
      const b = e.target.closest('[data-go]'); if(!b) return;
      if(!ok().length){ Kit.toast('Нет ни одного узнанного торта', 'error'); return; }
      Kit.busy(b, true);
      const done = await onApply(kind === 'orders' ? groupOrders(ok()) : ok(), fileName);
      Kit.busy(b, false);
      if(done !== false) sh.close();
    });
  }

  // Строки → заявки: по № заявки, без него — по заказчику и адресу
  function groupOrders(items){
    const m = new Map();
    for(const x of items){
      const key = x.num || (low(x.customer) + '|' + low(x.address));
      if(!m.has(key)) m.set(key, {num:x.num, customer:x.customer, address:x.address, route:x.route, date:x.date, items:[]});
      m.get(key).items.push(x);
    }
    return [...m.values()];
  }

  /* ---------- применить ---------- */
  // Приход: прибавить к полям вкладки, провести кладовщик нажмёт сам
  function importIncome(){
    pick('income', (items, fileName)=>{
      let n = 0;
      for(const x of items){
        const el = $(`[data-in="${x.productId}"]`); if(!el) continue;
        el.value = (parseInt(el.value, 10) || 0) + x.qty + x.bonus; n++;
      }
      if(!$('#inNote').value.trim()) $('#inNote').value = fileName.replace(/\.\w+$/, '').slice(0, 200);
      $('#inList').dispatchEvent(new Event('input'));
      haptic('success'); Kit.toast(`Заполнено ${n} позиций — проверьте и нажмите «Оприходовать»`, 'ok');
    });
  }

  // Заявки: точку находим по заказчику и адресу (или заводим), заявку — saveOrder
  function importOrders(){
    pick('orders', async (groups, fileName)=>{
      const PK = Cake.pick;
      if(!PK.points.length){ const r = await api('getOrders', PK.date ? {date:PK.date} : {}); if(r.ok) Object.assign(PK, {points:r.points, date:PK.date || r.date}); }
      const key = (c, a)=> low(c) + '|' + low(a);
      const points = new Map(PK.points.map(p=>[key(p.customer, p.address), p]));
      const day = PK.date || D.today(), stamp = day.slice(8, 10) + day.slice(5, 7);
      let made = 0, n = 0; const errs = [];
      for(const gr of groups){
        n++;
        const customer = gr.customer || 'Заказчик из файла', address = gr.address || customer;
        let pt = points.get(key(customer, address));
        if(!pt){
          const r = await api('savePoint', {customer:customer.slice(0, 80), address:(address.length >= 3 ? address : address + ' —').slice(0, 200), route:gr.route.slice(0, 40)});
          if(!r.ok){ errs.push(`${customer}: ${r.message || r.error}`); continue; }
          pt = r.point; points.set(key(customer, address), pt);
        }
        const lines = gr.items.map(x=>({productId:x.productId, qty:x.qty, bonus:x.bonus}));
        const r = await api('saveOrder', {num:(gr.num || `Ф${stamp}-${n}`).slice(0, 20), date:gr.date || day, pointId:pt.id, lines, comment:`Из файла ${fileName}`.slice(0, 300)});
        if(!r.ok){ errs.push(`${gr.num ? '№' + gr.num : customer}: ${r.message || r.error}`); continue; }
        made++;
      }
      const firstDate = (groups.find(g=>g.date) || {}).date;
      if(firstDate) PK.date = firstDate;
      await PK.reload();
      if(errs.length) Kit.sheet({title:`Заведено ${made} из ${groups.length}`, body:html`<p class="hint">Не загрузились:</p>${errs.map(e=>html`<div class="kv"><span class="k">${e}</span></div>`)}`});
      else Kit.toast(`Заведено заявок: ${made}`, 'ok');
      haptic(made ? 'success' : 'error');
    });
  }

  Cake.importFile = {income:importIncome, orders:importOrders, parse, match, parseCsv};
})();
