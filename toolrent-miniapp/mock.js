// изменено 2026-10-08 02:30
/* ============================================================
   mock.js — офлайн-двойник API проката (api/bots/toolrent.py).
   Тот же контракт action; состояние в localStorage, общее для
   client/admin/owner в одном браузере.
   ============================================================ */
window.ToolrentMock = (function(){
  "use strict";
  const KEY = 'tgs-mock-toolrent-v2';
  const D = Kit.date;
  const CONFIG = {
    businessName:'Прокат-Инструмент', phone:'+375291234567',
    pickupPoints:[{id:'p1', name:'Склад на Промышленной, 12', hours:'Пн–Сб 9:00–19:00'}],
    deliveryZones:[{id:'z1', name:'В пределах МКАД', fee:15}, {id:'z2', name:'За МКАД, до 20 км', fee:30}],
    deliverySlots:[{id:'morning', name:'Утро', time:'9:00–12:00'}, {id:'day', name:'День', time:'12:00–17:00'}, {id:'evening', name:'Вечер', time:'17:00–20:00'}],
    discounts:[{days:3, pct:10}, {days:7, pct:20}], maxDays:30
  };
  const CATS = [['elec','Электро'],['build','Стройка'],['garden','Сад'],['measure','Замер'],['clean','Уборка']];
  const MODELS = [
    ['m1','Перфоратор Bosch GBH 2-26','elec',18,150,'drill','800 Вт · SDS-plus · 2,7 кг','Сверление в бетоне, кирпиче и камне. Три режима: сверление, удар, долбление. В комплекте кейс, бур SDS-plus 8 мм и пика.',5],
    ['m2','Болгарка Makita 230 мм','elec',14,120,'grinder','2000 Вт · диск 230 мм · 5,2 кг','Резка металла, камня и плитки. Плавный пуск, защита от перегрузки. Диск в комплект не входит.',4],
    ['m3','Бетономешалка 130 л','build',25,300,'mixer','130 л · 550 Вт · на колёсах','Бетон, раствор, штукатурка. Стальная рама на колёсах, выдаётся вымытой.',3],
    ['m4','Леса рамные 4×2 м','build',32,250,'scaffold','высота 4 м · площадка 2 м · до 200 кг','Оцинкованная сталь, монтаж без инструмента. Инструкция и стопоры в комплекте.',3],
    ['m5','Триммер бензиновый Huter','garden',20,150,'trimmer','25,4 см³ · леска + нож · 6,4 кг','Для газона и высокой травы. Катушка и металлический нож в комплекте. Топливо — АИ-92 с маслом 1:40.',6],
    ['m6','Газонокосилка Bosch Rotak','garden',28,200,'mower','1600 Вт · ширина 36 см · мешок 45 л','Для ровных участков. Высота среза 25–75 мм. Нужен удлинитель от 15 м.',3],
    ['m7','Лазерный нивелир ADA','measure',15,200,'level','360° · до 30 м · IP54','Строит горизонтальную и вертикальную плоскости. Штатив и очки в комплекте.',4],
    ['m8','Штроборез Metabo','elec',22,200,'cutter','1800 Вт · глубина 40 мм','Каналы под кабель в бетоне и кирпиче. Вместе со строительным пылесосом — без пыли.',2],
    ['m9','Пила циркулярная Makita','elec',16,150,'saw','1200 Вт · диск 190 мм · 4 кг','Ровный рез доски, фанеры, ОСП. Направляющая шина по запросу.',3],
    ['m10','Пылесос строительный Kärcher','clean',17,120,'vacuum','1300 Вт · бак 25 л · сухая/влажная','Пыль, мусор, вода. Розетка для инструмента с автозапуском.',4],
    ['m11','Шлифмашина для стен «жираф»','build',30,300,'sander','750 Вт · круг 225 мм · подсветка','Шлифовка шпаклёвки на стенах и потолке. Подключается к пылесосу.',2],
    ['m12','Генератор бензиновый 3 кВт','elec',35,400,'generator','3 кВт · 230 В · 15 л бак','Резервное питание дачи или стройки. До 10 часов на баке. Выдаётся с маслом, без топлива.',2]
  ];
  const CLIENTS = [['Игорь Савчук','+375291112233'],['Наталья Дрозд','+375334445566'],['Пётр Мельник','+375257778899'],['Сергей Ким','+375290001122'],['Анна Реут','+375292223344'],['Дмитрий Волк','+375335556677'],['Олег Юрчик','+375253332211'],['Марина Лис','+375447001122'],['Виктор Гончар','+375296543210'],['ООО «СтройДом»','+375291000000']];
  const ADDR = ['ул. Сурганова, 43','пр-т Независимости, 120','ул. Немига, 5','ул. Козлова, 8','ул. Есенина, 16','Колодищи, ул. Лесная, 12'];

  function rng(seed){ let s = seed >>> 0; return ()=>{ s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  let S = null;
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }
  const days = (a, b)=> D.diff(a, b) + 1;
  const model = id => S.models.find(m=>m.id === id);
  function price(m, n, method, zone, ret){
    const rent = m.price * n;
    let pct = 0; CONFIG.discounts.forEach(d=>{ if(n >= d.days) pct = d.pct; });
    const discount = Math.round(rent * pct) / 100;
    let fee = 0;
    if(method === 'delivery'){ const z = CONFIG.deliveryZones.find(x=>x.id === zone) || CONFIG.deliveryZones[0]; fee = z.fee * (ret === 'courier' ? 2 : 1); }
    return {days:n, rent, discountPct:pct, discount, deliveryFee:fee, total:Math.round((rent - discount + fee) * 100) / 100, deposit:m.deposit};
  }
  function capacity(mid){ return S.units.filter(u=>u.modelId === mid && (u.status === 'free' || u.status === 'rented')).length; }
  function busyMax(mid, from, to, exclude){
    const today = D.today();
    const spans = S.bookings.filter(b=>b.modelId === mid && (b.status === 'pending' || b.status === 'active') && b.id !== exclude)
      .map(b=>[b.from, b.status === 'active' && b.to < today ? today : b.to]).filter(([a, b])=> a <= to && from <= b);
    let peak = 0;
    for(let d = from; d <= to; d = D.add(d, 1)) peak = Math.max(peak, spans.filter(([a, b])=> a <= d && d <= b).length);
    return peak;
  }
  function free(mid, from, to, ex){ const t = capacity(mid); return [Math.max(0, t - busyMax(mid, from, to, ex)), t]; }
  function statusOf(b){ return b.status === 'active' && b.to < D.today() ? 'overdue' : b.status; }
  function out(b, full){
    const m = model(b.modelId), u = S.units.find(x=>x.id === b.unitId), st = statusOf(b);
    const o = {id:b.id, num:b.num, modelId:b.modelId, model:m ? m.name : '—', from:b.from, to:b.to, status:st, method:b.method,
      days:b.days, total:b.total, rent:b.rent, discount:b.discount, deliveryFee:b.deliveryFee, deposit:b.deposit, address:b.address,
      slot:b.slot, returnMethod:b.returnMethod, deliveryStatus:b.deliveryStatus, unitNum:u ? u.num : null, unitId:b.unitId,
      createdAt:b.createdAt, issuedAt:b.issuedAt, returnedAt:b.returnedAt};
    if(st === 'overdue'){ o.daysLate = D.diff(b.to, D.today()); o.debt = o.daysLate * (m ? m.price : 0); }
    if(full) Object.assign(o, {client:b.client, phone:b.phone, idDoc:b.idDoc, conditionOut:b.conditionOut, conditionIn:b.conditionIn, comment:b.comment, nudgedAt:b.nudgedAt, lateFee:b.lateFee || 0, source:b.source || 'app'});
    return o;
  }
  function add(r, m, from, to, status, opts){
    opts = opts || {};
    const method = opts.method || (r() < .35 ? 'delivery' : 'pickup');
    const zone = method === 'delivery' ? (r() < .7 ? 'z1' : 'z2') : '', ret = method === 'delivery' ? (r() < .5 ? 'courier' : 'self') : 'self';
    const pr = price(m, days(from, to), method, zone, ret), c = opts.client || CLIENTS[Math.floor(r() * CLIENTS.length)];
    S.num++;
    const b = {id:'ZK-' + S.num, num:S.num, modelId:m.id, unitId:opts.unit || null, userId:opts.userId || null, client:c[0], phone:c[1], idDoc:'MP' + Math.floor(1000000 + r() * 8999999),
      from, to, method, address:method === 'delivery' ? ADDR[Math.floor(r() * ADDR.length)] : '', zone, slot:method === 'delivery' ? 'day' : '', returnMethod:ret,
      status, days:pr.days, rent:pr.rent, discount:pr.discount, deliveryFee:pr.deliveryFee, total:pr.total, deposit:pr.deposit,
      deliveryStatus:method === 'delivery' ? (status === 'pending' ? 'new' : 'delivered') : '', createdAt:D.add(from, -1) + 'T12:00:00',
      issuedAt:(status === 'active' || status === 'returned') ? from + 'T10:00:00' : null, returnedAt:status === 'returned' ? to + 'T18:00:00' : null,
      conditionOut:status === 'active' || status === 'returned' ? 'ok' : '', conditionIn:status === 'returned' ? 'ok' : '', comment:'', lateFee:0, source:opts.source || 'app'};
    S.bookings.push(b); return b;
  }
  function init(){
    try{ S = JSON.parse(localStorage.getItem(KEY) || 'null'); }catch(e){ S = null; }
    if(S && S.day === D.today()) return;
    const today = D.today(), r = rng(11);
    S = {day:today, num:1000, cats:CATS.map(c=>({id:c[0], name:c[1]})), models:[], units:[], bookings:[], repairs:[]};
    MODELS.forEach((m, i)=>{
      S.models.push({id:m[0], name:m[1], cat:m[2], price:m[3], deposit:m[4], icon:m[5], specs:m[6], description:m[7], photoUrl:'', active:true, sort:i});
      for(let n = 1; n <= m[8]; n++) S.units.push({id:m[0] + '-' + n, modelId:m[0], num:n, status:'free', bookingId:null});
    });
    const pop = [];
    S.models.forEach(m=>{ const w = {m1:6, m2:5, m5:4, m10:4, m3:3}[m.id] || 2; for(let i = 0; i < w; i++) pop.push(m); });
    for(let off = -45; off < -1; off++){
      const n = [2,3,3,4,5][Math.floor(r() * 5)];
      for(let i = 0; i < n; i++){
        const m = pop[Math.floor(r() * pop.length)], from = D.add(today, off), to = D.add(from, [0,1,1,2,2,3,4,6][Math.floor(r() * 8)]);
        if(to >= today || free(m.id, from, to)[0] <= 0) continue;
        add(r, m, from, to, r() < .05 ? 'cancelled' : 'returned', {client: r() < .45 ? CLIENTS[Math.floor(r() * 5)] : null});
      }
    }
    [['m1',-2,2],['m1',-1,3],['m2',-3,0],['m3',-4,1],['m5',-1,1],['m5',-2,0],['m10',-1,2],['m4',-2,4],['m6',-6,-2],['m2',-8,-3]].forEach(([mid, a, b])=>{
      const u = S.units.find(x=>x.modelId === mid && x.status === 'free');
      const bk = add(r, model(mid), D.add(today, a), D.add(today, b), 'active', {unit:u.id});
      u.status = 'rented'; u.bookingId = bk.id;
    });
    [['m1',0,2],['m4',0,5],['m7',0,1],['m3',1,3],['m8',1,2],['m5',2,4],['m9',3,3],['m12',4,6]].forEach(([mid, a, b])=> add(r, model(mid), D.add(today, a), D.add(today, b), 'pending'));
    ['m1-5','m11-2'].forEach(id=>{ S.units.find(u=>u.id === id).status = 'repair'; });
    S.repairs = [
      {id:'rp1', unitId:'m1-5', modelId:'m1', opened:D.add(today, -5), closed:null, note:'Трещина корпуса, сломана боковая ручка', status:'in_repair'},
      {id:'rp2', unitId:'m11-2', modelId:'m11', opened:D.add(today, -2), closed:null, note:'Не крутится круг — щётки двигателя', status:'in_repair'},
      {id:'rp3', unitId:'m2-4', modelId:'m2', opened:D.add(today, -19), closed:D.add(today, -14), note:'Замена защитного кожуха', status:'fixed'},
      {id:'rp4', unitId:'m5-2', modelId:'m5', opened:D.add(today, -27), closed:D.add(today, -25), note:'Обрыв катушки с леской', status:'fixed'}];
    save();
  }
  const ok = x=> Object.assign({ok:true}, x || {});
  const err = (code, message)=> ({ok:false, error:code, message});
  function revRows(from, to){ return S.bookings.filter(b=>(b.status === 'active' || b.status === 'returned') && b.from >= from && b.from <= to); }
  function sum(rs){ const rev = rs.reduce((a, b)=>a + b.total + (b.lateFee || 0), 0), pick = rs.filter(b=>b.method === 'pickup').reduce((a, b)=>a + b.total, 0);
    return {revenue:Math.round(rev * 100) / 100, count:rs.length, pickup:pick, delivery:Math.round((rev - pick) * 100) / 100, avg:rs.length ? Math.round(rev / rs.length) : 0}; }
  function repair(u, note){ S.repairs.unshift({id:Kit.uid('rp'), unitId:u.id, modelId:u.modelId, opened:D.today(), closed:null, note:note || 'Плановый ремонт', status:'in_repair'}); }
  function validPeriod(p){
    if(!p.from || !p.to || p.to < p.from) return 'Дата возврата раньше выдачи';
    if(p.from < D.today()) return 'Дата в прошлом';
    if(days(p.from, p.to) > CONFIG.maxDays) return 'Не больше ' + CONFIG.maxDays + ' суток';
    return null;
  }

  const H = {
    getModels(){ const t = D.today(); return ok({categories:S.cats, config:CONFIG, models:S.models.filter(m=>m.active).map(m=>{ const f = free(m.id, t, t); return Object.assign({}, m, {freeToday:f[0], totalQty:f[1]}); })}); },
    checkAvailability(p){ const e = validPeriod(p); if(e) return err('bad_request', e); const f = free(p.modelId, p.from, p.to); return ok({free:f[0], total:f[1]}); },
    quote(p){ const m = model(p.modelId); if(!m) return err('not_found'); return ok({quote:price(m, days(p.from, p.to), p.method || 'pickup', p.zone || 'z1', p.returnMethod || 'self')}); },
    createBooking(p){
      const m = model(p.modelId); if(!m) return err('not_found');
      const e = validPeriod(p); if(e) return err('bad_request', e);
      if(free(m.id, p.from, p.to)[0] <= 0) return err('unavailable', 'На эти даты всё занято');
      const pr = price(m, days(p.from, p.to), p.method, p.zone, p.returnMethod);
      S.num++;
      const b = {id:'ZK-' + S.num, num:S.num, modelId:m.id, unitId:null, userId:p.userId, client:p.name, phone:p.phone, idDoc:String(p.idDoc || '').toUpperCase(), from:p.from, to:p.to,
        method:p.method, address:p.address || '', zone:p.zone || '', slot:p.slot || '', returnMethod:p.returnMethod || 'self', status:'pending',
        days:pr.days, rent:pr.rent, discount:pr.discount, deliveryFee:pr.deliveryFee, total:pr.total, deposit:pr.deposit,
        deliveryStatus:p.method === 'delivery' ? 'new' : '', createdAt:new Date().toISOString(), issuedAt:null, returnedAt:null, conditionOut:'', conditionIn:'', comment:'', lateFee:0};
      S.bookings.push(b); save(); return ok({booking:out(b), orderId:b.id});
    },
    getMyBookings(p){ return ok({bookings:S.bookings.filter(b=>b.userId === p.userId).sort((a, b)=> b.createdAt.localeCompare(a.createdAt)).map(b=>out(b))}); },
    cancelBooking(p){ const b = S.bookings.find(x=>x.id === p.id && x.userId === p.userId); if(!b) return err('not_found'); if(b.status !== 'pending') return err('bad_state', 'Инструмент уже выдан'); b.status = 'cancelled'; save(); return ok(); },
    extendBooking(p){
      const b = S.bookings.find(x=>x.id === p.id && x.userId === p.userId); if(!b) return err('not_found');
      if(!p.newTo || p.newTo <= b.to) return err('bad_request', 'Неверная новая дата');
      if(free(b.modelId, D.add(b.to, 1), p.newTo, b.id)[0] <= 0) return err('unavailable', 'На эти даты продлить нельзя');
      const pr = price(model(b.modelId), days(b.from, p.newTo), b.method, b.zone, b.returnMethod);
      Object.assign(b, {to:p.newTo, days:pr.days, rent:pr.rent, discount:pr.discount, total:pr.total}); save(); return ok({booking:out(b)});
    },
    getToday(){
      const t = D.today(), t1 = D.add(t, 1);
      const handout = S.bookings.filter(b=>b.status === 'pending' && b.from <= t1).sort((a, b)=>a.from.localeCompare(b.from));
      const ret = S.bookings.filter(b=>b.status === 'active' && b.to <= t1).sort((a, b)=>a.to.localeCompare(b.to));
      const del = handout.filter(b=>b.method === 'delivery');
      const st = s=> S.units.filter(u=>u.status === s).length;
      return ok({handout:handout.map(b=>out(b, true)), ret:ret.map(b=>out(b, true)), deliveries:del.map(b=>out(b, true)),
        stats:{rented:st('rented'), free:st('free'), repair:st('repair'), overdue:S.bookings.filter(b=>statusOf(b) === 'overdue').length}});
    },
    getUnits(){ return ok({units:S.units.filter(u=>u.status !== 'retired'), models:S.models, categories:S.cats}); },
    getFreeUnits(p){ return ok({units:S.units.filter(u=>u.modelId === p.modelId && u.status === 'free').map(u=>({id:u.id, num:u.num}))}); },
    getUnitBooking(p){
      const u = S.units.find(x=>x.id === p.unitId); if(!u) return err('not_found');
      const b = u.bookingId && S.bookings.find(x=>x.id === u.bookingId), rp = S.repairs.find(x=>x.unitId === u.id && x.status === 'in_repair');
      return ok({booking:b ? out(b, true) : null, repair:rp ? {note:rp.note, opened:rp.opened} : null,
        history:S.bookings.filter(x=>x.unitId === u.id && x.status === 'returned').slice(-5).reverse().map(x=>out(x, true))});
    },
    checkOut(p){
      const b = S.bookings.find(x=>x.id === p.bookingId); if(!b || b.status !== 'pending') return err('bad_state');
      const u = S.units.find(x=>x.id === p.unitId && x.modelId === b.modelId && x.status === 'free'); if(!u) return err('unit_busy', 'Эта единица уже занята');
      Object.assign(b, {status:'active', unitId:u.id, issuedAt:new Date().toISOString(), conditionOut:p.condition || 'ok', comment:p.comment || ''});
      if(b.method === 'delivery') b.deliveryStatus = 'delivered';
      u.status = 'rented'; u.bookingId = b.id; save(); return ok();
    },
    checkIn(p){
      const b = S.bookings.find(x=>x.id === p.bookingId); if(!b || b.status !== 'active') return err('bad_state');
      const late = Math.max(0, D.diff(b.to, D.today())), fee = late * model(b.modelId).price;
      Object.assign(b, {status:'returned', returnedAt:new Date().toISOString(), conditionIn:p.damaged ? 'bad' : 'ok', comment:((b.comment || '') + ' ' + (p.comment || '')).trim(), lateFee:fee});
      const u = S.units.find(x=>x.id === b.unitId);
      if(u){ u.status = p.damaged ? 'repair' : 'free'; u.bookingId = null; if(p.damaged) repair(u, p.comment || 'Повреждение при возврате'); }
      save(); return ok({lateFee:fee});
    },
    setUnitStatus(p){
      const u = S.units.find(x=>x.id === p.unitId); if(!u) return err('not_found'); if(u.status === 'rented') return err('bad_state', 'Единица в аренде');
      if(p.status === 'repair' && u.status !== 'repair') repair(u, p.note);
      if(u.status === 'repair' && p.status !== 'repair') S.repairs.forEach(x=>{ if(x.unitId === u.id && x.status === 'in_repair'){ x.status = 'fixed'; x.closed = D.today(); } });
      u.status = p.status; save(); return ok();
    },
    addUnit(p){ const n = Math.max(0, ...S.units.filter(u=>u.modelId === p.modelId).map(u=>u.num)) + 1; const u = {id:p.modelId + '-' + n, modelId:p.modelId, num:n, status:'free', bookingId:null}; S.units.push(u); save(); return ok({unit:u}); },
    updateModel(p){
      if(p.photoUrl && !/^https:\/\//.test(p.photoUrl)) return err('bad_request', 'Фото — только https-ссылка');
      let m = p.modelId && model(p.modelId);
      const map = {name:'name', specs:'specs', description:'description', photoUrl:'photoUrl', price:'price', deposit:'deposit', cat:'cat', icon:'icon'};
      if(m){ Object.keys(map).forEach(k=>{ if(k in p && (p[k] !== '' || ['specs','description','photoUrl'].includes(k))) m[map[k]] = p[k]; }); }
      else {
        if(!p.name || !p.price || !p.cat) return err('bad_request', 'Название, категория и цена обязательны');
        m = {id:Kit.uid('m'), name:p.name, cat:p.cat, price:p.price, deposit:p.deposit || 0, icon:p.icon || 'drill', specs:p.specs || '', description:p.description || '', photoUrl:p.photoUrl || '', active:true, sort:100};
        S.models.push(m); S.units.push({id:m.id + '-1', modelId:m.id, num:1, status:'free', bookingId:null});
      }
      save(); return ok({model:m});
    },
    setModelActive(p){ const m = model(p.modelId); if(!m) return err('not_found'); m.active = !!p.active; save(); return ok(); },
    getAllBookings(){ const lim = D.add(D.today(), -30); return ok({bookings:S.bookings.filter(b=>b.to >= lim).sort((a, b)=> b.from.localeCompare(a.from) || b.num - a.num).map(b=>out(b, true))}); },
    createBookingManual(p){
      const m = model(p.modelId); if(!m) return err('not_found');
      const e = validPeriod(p); if(e) return err('bad_request', e);
      if(free(m.id, p.from, p.to)[0] <= 0) return err('unavailable', 'На эти даты всё занято');
      const b = add(()=>.5, m, p.from, p.to, 'pending', {method:p.method, client:[p.client, p.phone], source:'admin'});
      Object.assign(b, {address:p.address || '', slot:p.slot || '', zone:p.zone || (p.method === 'delivery' ? 'z1' : ''), returnMethod:p.returnMethod || 'self', createdAt:new Date().toISOString()});
      const pr = price(m, days(p.from, p.to), p.method, b.zone, b.returnMethod); Object.assign(b, {total:pr.total, deliveryFee:pr.deliveryFee, discount:pr.discount, rent:pr.rent});
      save(); return ok({orderId:b.id, booking:out(b, true)});
    },
    setDeliveryStatus(p){ const b = S.bookings.find(x=>x.id === p.bookingId && x.method === 'delivery'); if(!b) return err('not_found'); b.deliveryStatus = p.status; save(); return ok(); },
    getOverview(p){
      const t = D.today(), data = {today:sum(revRows(t, t)), week:sum(revRows(D.add(t, -6), t)), month:sum(revRows(t.slice(0, 8) + '01', t)), prevWeek:sum(revRows(D.add(t, -13), D.add(t, -7)))};
      const cf = p.from && p.to ? p.from : D.add(t, -6), ct = p.from && p.to ? p.to : t;
      if(p.from && p.to) data.custom = sum(revRows(cf, ct));
      const span = D.diff(cf, ct), DOW = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
      data.week7 = [];
      for(let d = cf; d <= ct; d = D.add(d, 1)) data.week7.push({day:span <= 7 ? DOW[D.parse(d).getDay()] : String(D.day(d)), date:d, revenue:Math.round(revRows(d, d).reduce((a, b)=>a + b.total, 0))});
      const tm = {}, tc = {};
      revRows(cf, ct).forEach(b=>{ const n = model(b.modelId).name; tm[n] = tm[n] || {name:n, revenue:0, bookings:0}; tm[n].revenue += b.total; tm[n].bookings++; tc[b.client] = tc[b.client] || {name:b.client, revenue:0, bookings:0}; tc[b.client].revenue += b.total; tc[b.client].bookings++; });
      data.topModels = Object.values(tm).sort((a, b)=>b.revenue - a.revenue).slice(0, 5).map(x=>Object.assign(x, {revenue:Math.round(x.revenue)}));
      data.topClients = Object.values(tc).sort((a, b)=>b.bookings - a.bookings || b.revenue - a.revenue).slice(0, 5).map(x=>Object.assign(x, {revenue:Math.round(x.revenue)}));
      return ok({data});
    },
    getUtilization(){
      const t = D.today(), from = D.add(t, -29);
      const list = S.models.filter(m=>m.active).map(m=>{
        const qty = S.units.filter(u=>u.modelId === m.id && u.status !== 'retired').length;
        let busy = 0;
        S.bookings.filter(b=>b.modelId === m.id && (b.status === 'active' || b.status === 'returned') && b.to >= from && b.from <= t).forEach(b=>{
          const a = b.from > from ? b.from : from, e = (b.status === 'active' ? t : (b.to < t ? b.to : t)); if(e >= a) busy += days(a, e); });
        return {id:m.id, name:m.name, totalQty:qty, pct:Math.min(100, qty ? Math.round(busy / (qty * 30) * 100) : 0),
          revenue:Math.round(S.bookings.filter(b=>b.modelId === m.id && (b.status === 'active' || b.status === 'returned') && b.from >= from).reduce((a, b)=>a + b.total, 0))};
      }).sort((a, b)=>b.pct - a.pct);
      const repairs = S.repairs.slice().sort((a, b)=> (a.status === 'fixed') - (b.status === 'fixed') || b.opened.localeCompare(a.opened)).map(r=>{
        const u = S.units.find(x=>x.id === r.unitId); return {id:r.id, model:model(r.modelId).name, unit:u ? '№' + u.num : '—', unitId:r.unitId, date:r.opened, closed:r.closed, status:r.status, note:r.note}; });
      return ok({list, repairs});
    },
    getOverdue(){ return ok({list:S.bookings.filter(b=>statusOf(b) === 'overdue').sort((a, b)=>a.to.localeCompare(b.to)).map(b=>Object.assign(out(b, true), {dailyPrice:model(b.modelId).price}))}); },
    nudgeClient(p){ const b = S.bookings.find(x=>x.id === p.id && x.status === 'active'); if(!b) return err('not_found'); b.nudgedAt = new Date().toISOString(); save(); return ok({nudgedAt:b.nudgedAt}); },
    getCatalog(){ return ok({models:S.models.map(m=>Object.assign({}, m, {catName:(S.cats.find(c=>c.id === m.cat) || {}).name || '', totalQty:S.units.filter(u=>u.modelId === m.id && u.status !== 'retired').length})), categories:S.cats, icons:Tools.ICONS}); },
    getBookingsForExport(p){ const from = p.from || D.add(D.today(), -30), to = p.to || D.today(); return ok({bookings:S.bookings.filter(b=>b.from >= from && b.from <= to).sort((a, b)=>a.from.localeCompare(b.from)).map(b=>out(b, true))}); }
  };

  return function(action, payload){
    if(!S) init();
    const h = H[action];
    return h ? h(payload || {}) : {ok:false, error:'unknown_action'};
  };
})();
