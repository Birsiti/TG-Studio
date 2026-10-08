// изменено 2026-10-08 03:10
/* ============================================================
   mock.js — офлайн-двойник API кафе «МОСТ» (api/bots/most.py).
   Тот же контракт для гостя и админки; состояние в localStorage —
   заказ гостя сразу появляется в ленте админки в этом же браузере.
   ============================================================ */
window.MostMock = (function(){
  "use strict";
  const KEY = 'tgs-mock-most-v3';
  const D = Kit.date;
  const DEFAULTS = {businessName:'Мост', phone:'+375291234567', address:'просп. Независимости, 58, 1 этаж', coords:{lat:53.9228, lng:27.5995},
    workHours:{from:'08:00', to:'20:00'}, pickupEtaMin:12, deliveryZones:[{maxKm:1.5, fee:3, eta:15}, {maxKm:4, fee:5.5, eta:25}, {maxKm:8, fee:8, eta:35}],
    manualDeliveryFee:6, manualDeliveryEta:40, accepting:true};
  const PROMO = {MOST10:10, BRIDGE15:15};
  const FLOW = ['new','preparing','ready','done'];
  const M = (id, ru, cn, opts)=>({id, label:{ru, cn}, options:opts.map(o=>({id:o[0], label:{ru:o[1], cn:o[2]}, price:o[3]}))});
  const MILK = M('milk','Молоко','奶',[['regular','Обычное','普通',0],['oat','Овсяное','燕麦',.6],['soy','Соевое','豆奶',.6]]);
  const CATS = [['fusion','Фьюжн','融合'],['coffee','Кофе','咖啡'],['lunch','Обед','午餐'],['bakery','Выпечка','烘焙'],['drinks','Напитки','饮品']];
  const ITEMS = [
    [16,'fusion','bun',6.5,1,1,'Пян-се с курицей','鸡肉蒸包','паровая булка, сычуаньский соус','四川风味酱汁',[]],
    [17,'fusion','onigiri',7.2,0,1,'Онигири с копчёной сельдью','熏鲱鱼饭团','рис, нори, белорусский акцент','米饭配熏鲱鱼',[]],
    [18,'fusion','pancake',8.9,1,1,'Драники, соус чили-мёд','辣蜜土豆饼','хрустящие, к обеду или перекусу','香脆可口',[M('sauce','Соус','酱料',[['chilihoney','Чили-мёд','辣蜜酱',0],['sourcream','Сметана','酸奶油',0]])]],
    [19,'fusion','dumpling',7.5,0,0,'Момо, картофель-грибы','土豆蘑菇饺子','на пару, соевый соус','清蒸配酱油',[]],
    [20,'fusion','rice',9.8,0,1,'Рис с говядиной и квашеной капустой','酸菜牛肉饭','вок, кунжут, зелёный лук','炒锅·芝麻·葱',[]],
    [1,'coffee','espresso',3.8,0,1,'Эспрессо','浓缩咖啡','двойная порция','双份',[]],
    [2,'coffee','cup',4.5,0,1,'Американо','美式咖啡','классический, без молока','不加奶',[]],
    [3,'coffee','latte',6.2,1,1,'Капучино','卡布奇诺','мягкая молочная пенка','细腻奶泡',[MILK]],
    [4,'coffee','latte',6.5,0,1,'Латте','拿铁','обычное, овсяное или соевое','可选普通/燕麦/豆奶',[MILK]],
    [5,'coffee','latte',7.8,0,1,'Раф на овсяном','燕麦拿铁','ванильный сироп','香草糖浆',[M('syrup','Сироп','糖浆',[['vanilla','Ваниль','香草',0],['caramel','Карамель','焦糖',0],['hazelnut','Лесной орех','榛子',0]])]],
    [6,'lunch','soup',12.5,1,1,'Бизнес-ланч №1','商务套餐 1号','борщ · котлета · гречка','甜菜汤·肉饼·荞麦',[]],
    [7,'lunch','noodles',12.9,0,1,'Бизнес-ланч №2','商务套餐 2号','суп-лапша · курица · рис','鸡肉汤面·米饭',[]],
    [8,'lunch','salad',9.4,0,1,'Салат с курицей','鸡肉沙拉','свежие овощи, гриль','新鲜蔬菜·烤鸡',[]],
    [9,'lunch','sandwich',7.9,0,1,'Тёплый сэндвич','热三明治','ветчина, сыр, томат','火腿·奶酪·番茄',[]],
    [10,'bakery','croissant',4.9,0,1,'Круассан','牛角包','классический сливочный','黄油经典款',[]],
    [11,'bakery','cake',6.9,0,0,'Чизкейк','芝士蛋糕','нью-йоркский','纽约风味',[]],
    [12,'bakery','cookie',3.2,0,1,'Овсяное печенье','燕麦饼干','с изюмом','含葡萄干',[]],
    [13,'drinks','water',2.5,0,1,'Вода негазированная','矿泉水','0,5 л','0.5升',[]],
    [14,'drinks','tea',3.5,0,1,'Чай чёрный / улун','红茶/乌龙茶','листовой','茶叶冲泡',[]],
    [15,'drinks','lemonade',5.9,0,1,'Домашний лимонад','自制柠檬水','мята, имбирь','薄荷·姜',[M('sweet','Сладость','甜度',[['normal','Обычная','正常',0],['less','Меньше сахара','少糖',0]])]]];
  const NAMES = ['Аня','Ли Вэй','Дмитрий','Чжан Мин','Ольга','Ксения','Ван Лэй','Павел','Юля','Артём'];
  const STREETS = ['ул. Сурганова, 24','просп. Независимости, 95','ул. Кульман, 9','ул. Платонова, 1Б','ул. Козлова, 12'];
  const r2 = n=> Math.round(n * 100) / 100;
  function rng(seed){ let s = seed >>> 0; return ()=>{ s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  let S = null;
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }
  function hav(a, b){ const R = 6371, dLa = (b.lat - a.lat) * Math.PI / 180, dLn = (b.lng - a.lng) * Math.PI / 180; const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLn / 2) ** 2; return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)); }
  function price(lines){
    const out = []; let sub = 0;
    for(const ln of lines){
      const it = S.items.find(i=>i.id === ln.itemId); if(!it) return {error:'bad_item'}; if(!it.inStock) return {error:'out_of_stock'};
      if(!(ln.qty >= 1 && ln.qty <= 20)) return {error:'bad_request'};
      let unit = it.price; const labels = [];
      for(const g of it.modifiers){ const ch = (ln.mods || {})[g.id] || g.options[0].id, o = g.options.find(x=>x.id === ch); if(!o) return {error:'bad_request'}; unit += o.price; if(o !== g.options[0] || o.price) labels.push(o.label.ru); }
      unit = r2(unit);
      out.push({itemId:it.id, qty:ln.qty, mods:ln.mods || {}, unit, n:it.name.ru + (labels.length ? ' (' + labels.join(', ') + ')' : ''), cn:it.name.cn, icon:it.icon});
      sub += unit * ln.qty;
    }
    return {lines:out, sub:r2(sub)};
  }
  function busy(){ return S.orders.filter(o=>o.date === D.today() && (o.status === 'new' || o.status === 'preparing')).length; }
  function seed(r, day, now){
    const pool = []; const w = {3:8, 6:6, 16:5, 4:5, 18:4, 10:4, 7:3, 2:3}; S.items.filter(i=>i.inStock).forEach(i=>{ for(let k = 0; k < (w[i.id] || 1); k++) pool.push(i); });
    const n = (D.parse(day).getDay() % 6 === 0) ? 34 + Math.floor(r() * 18) : 26 + Math.floor(r() * 14);
    for(let k = 0; k < n; k++){
      const hrs = [8,9,9,10,11,12,12,13,13,13,14,15,16,17,18,18,19], h = hrs[Math.floor(r() * hrs.length)], mi = Math.floor(r() * 60);
      const created = new Date(D.parse(day)); created.setHours(h, mi, 0, 0);
      if(day === D.today() && created > now) continue;
      const lines = {}; const cnt = 1 + Math.floor(r() * 3);
      for(let j = 0; j < cnt; j++){ const it = pool[Math.floor(r() * pool.length)]; lines[it.id] = lines[it.id] || {itemId:it.id, qty:0, mods:{}}; lines[it.id].qty += r() < .8 ? 1 : 2; }
      const pr = price(Object.values(lines)), del = r() < .4, z = DEFAULTS.deliveryZones[Math.floor(r() * 3)], eta = del ? z.eta : 12, promo = r() < .08 ? 'MOST10' : '', disc = promo ? r2(pr.sub * .1) : 0;
      const age = (now - created) / 60000, st = day < D.today() || age > eta + 25 ? 'done' : age > eta ? 'ready' : age > 4 ? 'preparing' : 'new';
      S.num++;
      S.orders.push({id:'M-' + S.num, num:S.num, userId:null, createdAt:created.toISOString(), date:day, type:del ? 'delivery' : 'pickup', readyAt:new Date(+created + eta * 60000).toISOString(),
        lines:pr.lines, subtotal:pr.sub, discount:disc, promo, deliveryFee:del ? z.fee : 0, total:r2(pr.sub - disc + (del ? z.fee : 0)), address:del ? STREETS[Math.floor(r() * STREETS.length)] : '',
        distanceKm:del ? Math.round(r() * z.maxKm * 10) / 10 : null, phone:del ? '+37529' + (1000000 + Math.floor(r() * 8999999)) : '', name:NAMES[Math.floor(r() * NAMES.length)], note:'', status:st});
    }
  }
  function init(){
    try{ S = JSON.parse(localStorage.getItem(KEY) || 'null'); }catch(e){ S = null; }
    const today = D.today(), now = new Date();
    if(S && S.day === today) return;
    if(S){ S.orders.forEach(o=>{ if(o.date < today && ['new','preparing','ready'].indexOf(o.status) > -1) o.status = 'done'; }); const r = rng(Date.now() & 0xffff); const last = S.day; for(let d = D.add(last, 1); d <= today; d = D.add(d, 1)) seed(r, d, now); S.day = today; S.orders = S.orders.filter(o=>o.date >= D.add(today, -35)); save(); return; }
    S = {day:today, num:100, cfg:JSON.parse(JSON.stringify(DEFAULTS)), cats:CATS.map(c=>({id:c[0], ru:c[1], cn:c[2]})), orders:[],
      items:ITEMS.map((x, i)=>({id:x[0], cat:x[1], icon:x[2], price:x[3], hit:!!x[4], inStock:!!x[5], name:{ru:x[6], cn:x[7]}, desc:{ru:x[8], cn:x[9]}, modifiers:x[10], sort:i}))};
    const r = rng(9); for(let off = -30; off <= 0; off++) seed(r, D.add(today, off), now);
    save();
  }
  const ok = x=> Object.assign({ok:true}, x || {});
  const err = (c, m)=> ({ok:false, error:c, message:m});
  function isOpen(){ const m = D.nowMinutes(); return m >= D.toMinutes(S.cfg.workHours.from) && m < D.toMinutes(S.cfg.workHours.to); }
  function delivery(p){
    if(p.geo && p.geo.lat){ const km = Math.round(hav(S.cfg.coords, p.geo) * 10) / 10, z = S.cfg.deliveryZones.find(x=>km <= x.maxKm); if(!z) return {error:'out_of_zone'}; return {fee:z.fee, eta:z.eta, km, address:p.address || 'по геопозиции'}; }
    if(!p.address || p.address.trim().length < 5) return {error:'bad_request'};
    return {fee:S.cfg.manualDeliveryFee, eta:S.cfg.manualDeliveryEta, km:null, address:p.address};
  }
  const H = {
    getMenu(){ const b = busy(); return ok({categories:S.cats, items:S.items.slice().sort((a, b)=>a.sort - b.sort), config:Object.assign({}, S.cfg, {openNow:isOpen(), queue:b, pickupEtaNow:S.cfg.pickupEtaMin + Math.min(15, b * 2)})}); },
    checkPromo(p){ const c = String(p.code || '').toUpperCase(); return PROMO[c] ? ok({code:c, percent:PROMO[c]}) : err('bad_promo'); },
    quote(p){
      const pr = price(p.lines || []); if(pr.error) return err(pr.error);
      const pct = PROMO[String(p.promo || '').toUpperCase()] || 0, disc = r2(pr.sub * pct / 100);
      let d = {fee:0, eta:S.cfg.pickupEtaMin, km:null};
      if(p.type === 'delivery' && (p.geo || p.address)){ d = delivery(p); if(d.error) return err(d.error); }
      return ok({subtotal:pr.sub, discount:disc, deliveryFee:d.fee, total:r2(pr.sub - disc + d.fee), eta:d.eta, distanceKm:d.km});
    },
    createOrder(p){
      if(!S.cfg.accepting) return err('paused', 'Кафе временно не принимает заказы');
      const pr = price(p.lines || []); if(pr.error) return err(pr.error); if(!pr.lines.length) return err('empty_cart');
      const code = String(p.promo || '').toUpperCase(); if(code && !PROMO[code]) return err('bad_promo');
      const disc = r2(pr.sub * (PROMO[code] || 0) / 100); let d = {fee:0, km:null, address:''}, eta;
      if(p.type === 'delivery'){ d = delivery(p); if(d.error) return err(d.error); if(!/^\+375\d{9}$/.test(p.phone || '')) return err('bad_request', 'Телефон'); eta = d.eta; }
      else eta = Math.max(S.cfg.pickupEtaMin + Math.min(15, busy() * 2), p.pickupTime && p.pickupTime !== 'now' ? +p.pickupTime : 0);
      S.num++; const now = new Date();
      const o = {id:'M-' + S.num, num:S.num, userId:p.userId, createdAt:now.toISOString(), date:D.today(), type:p.type, readyAt:new Date(+now + eta * 60000).toISOString(), lines:pr.lines,
        subtotal:pr.sub, discount:disc, promo:code, deliveryFee:d.fee, total:r2(pr.sub - disc + d.fee), address:d.address, distanceKm:d.km, phone:p.phone || '', name:p.name || '', note:p.note || '', status:'new'};
      S.orders.push(o); save(); return ok({order:o, orderId:o.id});
    },
    getMyOrders(p){ return ok({orders:S.orders.filter(o=>o.userId === p.userId).sort((a, b)=>b.createdAt.localeCompare(a.createdAt)).slice(0, 20)}); },
    getOrder(p){ const o = S.orders.find(x=>x.id === p.id && x.userId === p.userId); return o ? ok({order:o}) : err('not_found'); },
    getOrders(){ return ok({orders:S.orders.filter(o=>o.date === D.today() || ['new','preparing','ready'].indexOf(o.status) > -1).sort((a, b)=>b.createdAt.localeCompare(a.createdAt)).slice(0, 150).map(o=>Object.assign({time:new Date(o.createdAt).toTimeString().slice(0, 5)}, o)), accepting:S.cfg.accepting}); },
    advanceOrder(p){ const o = S.orders.find(x=>x.id === p.id); if(!o) return err('not_found'); const i = FLOW.indexOf(o.status); if(i < 0 || i >= 3) return err('bad_state'); o.status = FLOW[i + 1]; save(); return ok({status:o.status}); },
    cancelOrder(p){ const o = S.orders.find(x=>x.id === p.id && ['new','preparing','ready'].indexOf(x.status) > -1); if(!o) return err('bad_state'); o.status = 'cancelled'; save(); return ok(); },
    simulateOrder(){
      const r = Math.random, av = S.items.filter(i=>i.inStock), lines = []; const n = 1 + Math.floor(r() * 3);
      for(let i = 0; i < n; i++){ const it = av[Math.floor(r() * av.length)]; if(!lines.some(l=>l.itemId === it.id)) lines.push({itemId:it.id, qty:r() < .7 ? 1 : 2, mods:{}}); }
      const pr = price(lines), del = r() < .35, z = S.cfg.deliveryZones[Math.floor(r() * S.cfg.deliveryZones.length)], now = new Date();
      S.num++;
      const o = {id:'M-' + S.num, num:S.num, userId:null, createdAt:now.toISOString(), date:D.today(), type:del ? 'delivery' : 'pickup', readyAt:new Date(+now + (del ? z.eta : S.cfg.pickupEtaMin) * 60000).toISOString(),
        lines:pr.lines, subtotal:pr.sub, discount:0, promo:'', deliveryFee:del ? z.fee : 0, total:r2(pr.sub + (del ? z.fee : 0)), address:del ? STREETS[Math.floor(r() * STREETS.length)] : '', distanceKm:del ? Math.round(r() * z.maxKm * 10) / 10 : null,
        phone:del ? '+37529' + (1000000 + Math.floor(r() * 8999999)) : '', name:NAMES[Math.floor(r() * NAMES.length)], note:'', status:'new'};
      S.orders.push(o); save(); return ok({order:o});
    },
    getMenuAdmin(){ return ok({categories:S.cats, items:S.items.slice().sort((a, b)=>a.sort - b.sort), icons:Dish.ICONS}); },
    saveDish(p){
      const d = p.dish; if(!S.cats.some(c=>c.id === d.cat)) return err('bad_request', 'Нет такой категории'); if(!d.name || !d.name.ru || d.name.ru.length < 2) return err('bad_request');
      let it = d.id && S.items.find(i=>i.id === d.id);
      const data = {cat:d.cat, icon:d.icon, price:+d.price, name:{ru:d.name.ru, cn:d.name.cn || ''}, desc:{ru:(d.desc || {}).ru || '', cn:(d.desc || {}).cn || ''}, hit:!!d.hit, inStock:d.inStock !== false};
      if(it) Object.assign(it, data); else { it = Object.assign({id:Math.max(...S.items.map(i=>i.id)) + 1, modifiers:[], sort:99}, data); S.items.push(it); }
      save(); return ok({dish:it});
    },
    deleteDish(p){ S.items = S.items.filter(i=>i.id !== p.id); save(); return ok(); },
    toggleStock(p){ const it = S.items.find(i=>i.id === p.id); if(!it) return err('not_found'); it.inStock = !it.inStock; save(); return ok(); },
    toggleHit(p){ const it = S.items.find(i=>i.id === p.id); if(!it) return err('not_found'); it.hit = !it.hit; save(); return ok(); },
    getStats(p){
      const t = D.today(), from = {today:t, week:D.add(t, -6), month:D.add(t, -29)}[p.period || 'today'];
      const rs = S.orders.filter(o=>o.date >= from && o.date <= t && o.status !== 'cancelled'), rev = rs.reduce((a, o)=>a + o.total, 0), pick = rs.filter(o=>o.type === 'pickup').length, n = rs.length;
      const top = {}, hours = Array(24).fill(0);
      rs.forEach(o=>{ hours[new Date(o.createdAt).getHours()]++; o.lines.forEach(l=>{ const k = l.itemId; top[k] = top[k] || {id:k, name:{ru:l.n.split(' (')[0], cn:l.cn || ''}, count:0, revenue:0}; top[k].count += l.qty; top[k].revenue += l.unit * l.qty; }); });
      const days = D.diff(from, t) + 1, chart = [], DOW = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
      for(let i = 0; i < days; i++){ const d = D.add(from, i); chart.push({date:d, label:days <= 7 ? DOW[D.parse(d).getDay()] : String(D.day(d)), revenue:Math.round(rs.filter(o=>o.date === d).reduce((a, o)=>a + o.total, 0))}); }
      return ok({stats:{revenue:r2(rev), count:n, avg:n ? r2(rev / n) : 0, pickupPct:n ? Math.round(pick / n * 100) : 0, deliveryPct:n ? 100 - Math.round(pick / n * 100) : 0, promoCount:rs.filter(o=>o.promo).length,
        top:Object.values(top).sort((a, b)=>b.count - a.count).slice(0, 6), chart, hours:Array.from({length:13}, (_, i)=>({hour:i + 8, count:hours[i + 8]}))}});
    },
    getSettings(){ return ok({config:S.cfg, promos:Object.keys(PROMO).map(k=>({code:k, percent:PROMO[k]}))}); },
    saveSettings(p){
      if(p.workHours && p.workHours.to <= p.workHours.from) return err('bad_request', 'Закрытие раньше открытия');
      ['phone','address','workHours','pickupEtaMin'].forEach(k=>{ if(k in p) S.cfg[k] = p[k]; });
      if(p.deliveryZones) S.cfg.deliveryZones = p.deliveryZones.map((z, i)=>({maxKm:z.maxKm || (S.cfg.deliveryZones[i] || {maxKm:10}).maxKm, fee:+z.fee, eta:+z.eta})).sort((a, b)=>a.maxKm - b.maxKm);
      save(); return ok({config:S.cfg});
    },
    setAccepting(p){ S.cfg.accepting = p.accepting !== false; save(); return ok({accepting:S.cfg.accepting}); }
  };
  return function(action, payload){
    if(!S) init();
    const h = H[action];
    return h ? h(payload || {}) : {ok:false, error:'unknown_action'};
  };
})();
