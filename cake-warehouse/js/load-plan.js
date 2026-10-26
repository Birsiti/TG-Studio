// изменено 2026-10-26 10:00
/* Расчёт погрузки рейса — чистые функции, без DOM (проверяются в node: db/test_load_plan.js).
   Вариант «Б»: ящик = один товар, не привязан к точке; водитель набирает заказ точки из общих ящиков.
   1. Порядок объезда: склад → точки → склад, кратчайший круг (до 10 точек — точный перебор, больше — ближайший + 2-opt).
   2. Ящики: по итогу рейса, ceil(шт / шт в ящике); «шт в ящике» не задано (=1) — берём оценку по категории.
   3. Каждому ящику — точка, где его откроют первым. Кто нужен позже — глубже от двери и ниже в столбе
      (последним погрузили — первым выгрузили). Места у стены за столбом у прохода — только для самых поздних.
   4. Листы точек: что взять и из какого столба; после каждой точки — сколько ящиков опустело и есть ли куда ставить. */
window.CakeLoad = (function(){
  "use strict";

  const DEFAULTS = {
    bodyL: 5000, bodyW: 2100,        // кузов внутри, мм (будка Газели AK 7453-6: 5 × 2,1 м)
    aisle: 600,                      // проход по центру, мм; 0 — без прохода (грузим от двери рядами)
    boxL: 600, boxW: 400,            // ящик, мм
    layersCake: 13, layersOther: 13, // слоёв в столбе (ящики пластиковые — высота не важна, но не больше 13)
    estCake: 2, estOther: 10,        // если «шт в ящике» не задано
    serviceMin: 10, speedKmh: 45, roadK: 1.3
  };

  /* ---------- маршрут ---------- */
  const rad = x=> x * Math.PI / 180;
  function km(a, b){
    const d1 = rad(b.lat - a.lat), d2 = rad(b.lon - a.lon);
    const h = Math.sin(d1 / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(d2 / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  }
  // Длина круга: 0 — склад, order — индексы точек 1..n
  const tourLen = (D, order)=> { let s = 0, prev = 0; order.forEach(i=>{ s += D[prev][i]; prev = i; }); return s + D[prev][0]; };

  // Кратчайший круг. pts[0] — склад. Возвращает порядок индексов 1..n.
  // Круг в обе стороны одной длины — начинаем с ближней к складу точки.
  function bestOrder(pts){
    const o = shortest(pts);
    return o.length > 1 && km(pts[0], pts[o[0]]) > km(pts[0], pts[o[o.length - 1]]) ? o.reverse() : o;
  }
  function shortest(pts){
    const n = pts.length - 1;
    if(n <= 1) return n ? [1] : [];
    const D = pts.map(a=> pts.map(b=> km(a, b)));
    if(n <= 10){  // Хелд–Карп: 2^10 * 10 * 10 — мгновенно
      const N = 1 << n, dp = new Float64Array(N * n).fill(Infinity), par = new Int8Array(N * n).fill(-1);
      for(let j = 0; j < n; j++) dp[(1 << j) * n + j] = D[0][j + 1];
      for(let m = 1; m < N; m++) for(let j = 0; j < n; j++){
        const v = dp[m * n + j]; if(!(m & (1 << j)) || v === Infinity) continue;
        for(let k = 0; k < n; k++){ if(m & (1 << k)) continue;
          const m2 = m | (1 << k), c = v + D[j + 1][k + 1];
          if(c < dp[m2 * n + k]){ dp[m2 * n + k] = c; par[m2 * n + k] = j; } }
      }
      let best = Infinity, last = 0; const full = N - 1;
      for(let j = 0; j < n; j++){ const c = dp[full * n + j] + D[j + 1][0]; if(c < best){ best = c; last = j; } }
      const out = []; let m = full, j = last;
      while(j >= 0){ out.push(j + 1); const p = par[m * n + j]; m ^= (1 << j); j = p; }
      return out.reverse();
    }
    // ближайший сосед + 2-opt
    const left = new Set(Array.from({length:n}, (_, i)=> i + 1)), order = [];
    let cur = 0;
    while(left.size){ let b = -1, bd = Infinity; left.forEach(i=>{ if(D[cur][i] < bd){ bd = D[cur][i]; b = i; } }); order.push(b); left.delete(b); cur = b; }
    let better = true;
    while(better){ better = false;
      for(let i = 0; i < n - 1; i++) for(let k = i + 1; k < n; k++){
        const t = order.slice(0, i).concat(order.slice(i, k + 1).reverse(), order.slice(k + 1));
        if(tourLen(D, t) + 1e-9 < tourLen(D, order)){ order.splice(0, n, ...t); better = true; }
      }
    }
    return order;
  }

  // Время и пробег по прямой с поправкой на дороги (точнее — в Яндекс Картах)
  function legs(sklad, stops, cfg){
    const pts = [sklad].concat(stops.map(s=> s.geo)).concat([sklad]);
    let kmSum = 0, min = 0; const out = [];
    for(let i = 1; i < pts.length; i++){
      const a = pts[i - 1], b = pts[i], d = a && b ? km(a, b) * cfg.roadK : 0;
      kmSum += d; min += d / cfg.speedKmh * 60 + (i < pts.length - 1 ? cfg.serviceMin : 0);
      out.push({km:d, kmSum, min});
    }
    return {legs:out, km:kmSum, min};
  }

  /* ---------- ящики ---------- */
  const isCake = p=> /торт/i.test(p.cat || '');
  // Шт в ящике: задано (>1) — как есть; не задано — оценка (флаг est)
  function perBox(p, cfg){
    if(p.perBox > 1) return {n:p.perBox, est:false};
    return {n: isCake(p) ? cfg.estCake : cfg.estOther, est:true};
  }

  /* Главный расчёт.
     stops: [{pointId, name, address, geo|null, lines:[{productId, qty}]}] — уже в порядке объезда
     products: справочник; cfg: настройки кузова */
  function plan(stops, products, cfg){
    cfg = Object.assign({}, DEFAULTS, cfg || {});
    const P = id=> products.find(x=> x.id === id) || {id, name:'?', cat:'', weightG:0, perBox:1};
    const S = stops.length;
    // спрос по товарам и точкам
    const need = {};
    stops.forEach((s, si)=> s.lines.forEach(l=>{
      if(!l.qty) return;
      const r = need[l.productId] || (need[l.productId] = {productId:l.productId, by:new Array(S).fill(0), total:0});
      r.by[si] += l.qty; r.total += l.qty;
    }));
    // ящики: по порядку выдачи; ящик k открывают на точке, где накопленный спрос превысил k*pb
    const boxes = [], items = [];
    Object.values(need).forEach(r=>{
      const p = P(r.productId), pb = perBox(p, cfg), n = Math.ceil(r.total / pb.n);
      const cum = []; r.by.reduce((a, q, i)=> (cum[i] = a + q), 0);
      const item = {productId:p.id, name:p.name, weightG:p.weightG || 0, cake:isCake(p), cat:p.cat, total:r.total, by:r.by, perBox:pb.n, est:pb.est, boxes:n, boxKg:(p.weightG || 0) * Math.min(pb.n, r.total) / 1000, boxIds:[]};
      for(let k = 0; k < n; k++){
        const from = k * pb.n, qty = Math.min(pb.n, r.total - from);
        const open = cum.findIndex(c=> c > from);                       // первая точка, где из ящика берут
        const empty = cum.findIndex(c=> c >= from + qty);               // точка, где ящик опустеет
        const b = {id:boxes.length + 1, productId:p.id, name:p.name, weightG:p.weightG || 0, cake:item.cake, est:pb.est, qty, kg:(p.weightG || 0) * qty / 1000, open, empty, k};
        boxes.push(b); item.boxIds.push(b.id);
      }
      items.push(item);
    });

    // места в кузове
    const slots = layout(cfg);
    // порядок заполнения: сначала самые недоступные места (у стены за столбом, у кабины)
    const fillOrder = slots.slice().sort((a, b)=> b.cost - a.cost);
    // ящики: сначала нужные позже; торты и остальное — в разные столбы
    // при равной точке открытия — сначала те, что опустеют позже: последние в очереди (они могут уйти в проход) освобождают его быстрее
    const queue = boxes.slice().sort((a, b)=> b.open - a.open || b.empty - a.empty || (a.cake === b.cake ? 0 : a.cake ? -1 : 1) || a.name.localeCompare(b.name, 'ru') || a.k - b.k);
    const stacks = []; let si = 0; const openStack = {cake:null, other:null};
    const over = [];
    queue.forEach(b=>{
      const key = b.cake ? 'cake' : 'other', cap = b.cake ? cfg.layersCake : cfg.layersOther;
      let st = openStack[key];
      if(!st || st.boxes.length >= cap){
        if(si >= fillOrder.length){ over.push(b); return; }
        st = {slot:fillOrder[si++], cake:b.cake, cap, boxes:[]};
        stacks.push(st); openStack[key] = st;
      }
      st.boxes.push(b);   // снизу вверх: позже нужные — ниже
    });
    // Не влезло — ставим в проход у двери (до 3 рядов): это ящики первых точек, их выгружают первыми,
    // и проход открывается после точки aisleFreeAfter
    let aisleFreeAfter = -1;
    if(over.length && cfg.aisle >= Math.min(cfg.boxL, cfg.boxW) && slots.geom){
      const across = cfg.aisle >= cfg.boxL ? cfg.boxL : cfg.boxW, along = across === cfg.boxL ? cfg.boxW : cfg.boxL;
      const aisleSlots = []; for(let r = 0; r < Math.min(3, Math.floor(cfg.bodyL / along)); r++) aisleSlots.push({row:r, col:0, side:'A', deep:0, cost:-1, across, along, aisle:true});
      const rest = over.splice(0), open2 = {cake:null, other:null}; let ai = 0;
      rest.forEach(b=>{
        const key = b.cake ? 'cake' : 'other', cap = b.cake ? cfg.layersCake : cfg.layersOther;
        let st = open2[key];
        if(!st || st.boxes.length >= cap){
          if(ai >= aisleSlots.length){ over.push(b); return; }
          st = {slot:aisleSlots[ai++], cake:b.cake, cap, boxes:[], aisle:true}; stacks.push(st); open2[key] = st;
        }
        st.boxes.push(b);
        aisleFreeAfter = Math.max(aisleFreeAfter, b.empty);
      });
      slots.aisle = aisleSlots.slice(0, ai);
    }
    // номера столбов: от двери к кабине, слева направо — как их видит водитель с двери
    stacks.sort((a, b)=> a.slot.row - b.slot.row || (a.slot.aisle ? 0 : a.slot.col) - (b.slot.aisle ? 0 : b.slot.col));
    stacks.forEach((st, i)=>{ st.id = i + 1; st.boxes.forEach((b, j)=>{ b.stack = st.id; b.layer = j + 1; }); });

    // листы точек и пустая тара
    const byId = {}; boxes.forEach(b=> byId[b.id] = b);
    const left = {}; boxes.forEach(b=> left[b.id] = b.qty);
    const sheets = stops.map((s, i)=>{
      const take = [];
      items.forEach(it=>{
        let q = it.by[i]; if(!q) return;
        const from = [];
        it.boxIds.forEach(id=>{ if(!q || !left[id]) return; const t = Math.min(q, left[id]); left[id] -= t; q -= t; from.push({box:byId[id], qty:t}); });
        take.push({item:it, qty:it.by[i], from});
      });
      take.sort((a, b)=> (a.from[0] && a.from[0].box.stack || 999) - (b.from[0] && b.from[0].box.stack || 999));
      const emptied = boxes.filter(b=> b.empty === i).length;
      return {stop:s, i, take, emptied};
    });
    // пустые ящики: место есть, если пустых не больше, чем свободных слоёв в уже стоящих столбах + свободных мест
    let emptyTotal = 0;
    sheets.forEach((sh, i)=>{
      emptyTotal += sh.emptied;
      const full = boxes.filter(b=> b.empty > i && b.stack).length;
      const capAll = slots.length * cfg.layersOther;
      sh.emptyTotal = emptyTotal; sh.fullLeft = full; sh.fits = full + emptyTotal <= capAll;
    });
    const kg = boxes.reduce((s, b)=> s + b.kg, 0);
    return {cfg, items, boxes, stacks, slots, over, sheets, kg, unknown:items.filter(x=> x.est), inAisle:stacks.filter(s=> s.aisle).reduce((a, s)=> a + s.boxes.length, 0), aisleFreeAfter};
  }

  /* Места столбов на полу. row — от двери (0) к кабине; col — слева направо, если смотреть с двери.
     cost — насколько трудно добраться: дальше от двери дороже, место у стены за другим столбом — намного дороже. */
  function layout(cfg){
    const out = [];
    if(cfg.aisle > 0){
      const side = (cfg.bodyW - cfg.aisle) / 2;
      // ориентацию ящика выбираем по числу мест
      const opt = [[cfg.boxL, cfg.boxW], [cfg.boxW, cfg.boxL]].map(([across, along])=>({across, along, deep:Math.floor(side / across), rows:Math.floor(cfg.bodyL / along)}))
        .filter(o=> o.deep > 0).sort((a, b)=> b.deep * b.rows - a.deep * a.rows)[0];
      if(!opt) return out;
      for(let r = 0; r < opt.rows; r++) for(let d = 0; d < opt.deep; d++){
        out.push({row:r, col:-(d + 1), side:'L', deep:d, cost:r + d * 1000, across:opt.across, along:opt.along});  // слева, d=0 — у прохода
        out.push({row:r, col:d + 1, side:'R', deep:d, cost:r + d * 1000, across:opt.across, along:opt.along});
      }
      out.geom = {mode:'aisle', side, deep:opt.deep, rows:opt.rows, across:opt.across, along:opt.along};
    }else{
      const opt = [[cfg.boxL, cfg.boxW], [cfg.boxW, cfg.boxL]].map(([across, along])=>({across, along, cols:Math.floor(cfg.bodyW / across), rows:Math.floor(cfg.bodyL / along)}))
        .sort((a, b)=> b.cols * b.rows - a.cols * a.rows)[0];
      for(let r = 0; r < opt.rows; r++) for(let c = 0; c < opt.cols; c++) out.push({row:r, col:c, side:'', deep:0, cost:r * 10 + Math.abs(c - (opt.cols - 1) / 2), across:opt.across, along:opt.along});
      out.geom = {mode:'rows', cols:opt.cols, rows:opt.rows, across:opt.across, along:opt.along};
    }
    return out;
  }

  // Ссылка на маршрут в Яндекс Картах: склад → точки → склад (координаты, без координат — по адресу)
  function yandexUrl(sklad, stops){
    const p = x=> x.geo ? `${x.geo.lat.toFixed(5)},${x.geo.lon.toFixed(5)}` : encodeURIComponent(x.address);
    const sk = `${sklad.lat.toFixed(5)},${sklad.lon.toFixed(5)}`;
    return `https://yandex.by/maps/?rtext=${[sk].concat(stops.map(p), [sk]).join('~')}&rtt=auto`;
  }

  return {DEFAULTS, km, bestOrder, legs, plan, layout, yandexUrl, perBox, isCake};
})();
if(typeof module !== 'undefined') module.exports = window.CakeLoad;
