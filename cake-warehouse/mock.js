// изменено 2026-10-16 23:00
/* ============================================================
   mock.js — офлайн-двойник API склада (api/bots/cake.py).
   Тот же контракт action; состояние в localStorage, общее для
   sklad / driver / admin в одном браузере.
   ============================================================ */
window.CakeMock = (function(){
  "use strict";
  var KEY = 'tgs-mock-cake-v3';
  var D = Kit.date;
  var MOVE_TYPES = {'in':'Приход', ship:'Отгрузка', 'return':'Возврат', writeoff:'Списание', adjust:'Инвентаризация'};
  // сгенерировано из api/bots/cake.py (CATALOG) — правьте там и перегенерируйте
  var CATS = ["Торт", "Венский десерт", "Пирожное", "Набор пирожных", "Сладости мучные"];
  var PRODUCTS = [
    ["p001", "Торт", "Муравейка", 550],
    ["p002", "Торт", "Грильяжный", 800],
    ["p003", "Торт", "Домашний", 850],
    ["p004", "Торт", "Йогуртовый с персиком", 950],
    ["p005", "Торт", "Лесная ягодка", 1000],
    ["p006", "Торт", "Лаванда", 850],
    ["p007", "Торт", "Наполеон домашний", 1000],
    ["p008", "Торт", "Панчо", 1000],
    ["p009", "Торт", "Полесье", 1000],
    ["p010", "Торт", "Смородинка", 850],
    ["p011", "Торт", "Смородинка", 1300],
    ["p012", "Торт", "Съешь меня карамельный", 500],
    ["p013", "Торт", "Съешь меня карамельный", 950],
    ["p014", "Торт", "Съешь меня трюфельный", 500],
    ["p015", "Торт", "Творожный «Фруктовый»", 950],
    ["p016", "Торт", "Творожный «Бруснично-грушевый»", 1000],
    ["p017", "Торт", "Творожный «Блуберри»", 1000],
    ["p018", "Торт", "Юбилейный", 1000],
    ["p019", "Торт", "Вкус наслаждения", 500],
    ["p020", "Торт", "Трюфельный", 1500],
    ["p021", "Торт", "Царское удовольствие", 900],
    ["p022", "Торт", "Какао-пломбир", 900],
    ["p023", "Торт", "Шокобанан", 1000],
    ["p024", "Торт", "Вкусненький", 1000],
    ["p025", "Торт", "Пражский", 1000],
    ["p026", "Торт", "Санкт-Петербург", 1000],
    ["p027", "Торт", "Санкт-Петербург", 2000],
    ["p028", "Торт", "Ассорти «Трио»", 2000],
    ["p029", "Торт", "Дамские пальчики", 1000],
    ["p030", "Торт", "Клубника-банан", 850],
    ["p031", "Торт", "Крещатик", 1000],
    ["p032", "Торт", "Кучерявый", 1000],
    ["p033", "Торт", "Кучерявый", 1500],
    ["p034", "Торт", "Лакомка", 900],
    ["p035", "Торт", "Экзотик", 1500],
    ["p036", "Торт", "Баунти", 1000],
    ["p037", "Торт", "Вишня в шоколаде", 1000],
    ["p038", "Венский десерт", "Клубника, ананас", 620],
    ["p039", "Венский десерт", "Вишня в коньяке", 620],
    ["p040", "Венский десерт", "Клубничный", 620],
    ["p041", "Венский десерт", "Голубичный", 600],
    ["p042", "Венский десерт", "Ягодная поляна", 600],
    ["p043", "Венский десерт", "Киви, персик", 600],
    ["p044", "Венский десерт", "Вишня, малина, ежевика, голубика", 600],
    ["p045", "Венский десерт", "Голубика, ежевика, малина", 600],
    ["p046", "Венский десерт", "Манго, папайя", 620],
    ["p047", "Венский десерт", "Тропический", 620],
    ["p048", "Венский десерт", "Фруктовый коктейль", 620],
    ["p049", "Пирожное", "Картошка с натур. сгущ.", 390],
    ["p050", "Пирожное", "Картошка", 360],
    ["p051", "Пирожное", "Фисташковое", 470],
    ["p052", "Пирожное", "Шоколадно-банановое", 360],
    ["p053", "Пирожное", "Муравейка", 450],
    ["p054", "Пирожное", "Пражское", 360],
    ["p055", "Пирожное", "Эклер на сливочном масле", 250],
    ["p056", "Пирожное", "Клубника-маракуйя", 360],
    ["p057", "Пирожное", "Лакомка", 420],
    ["p058", "Пирожное", "Пломбир в шоколаде", 250],
    ["p059", "Пирожное", "Кольцо творожное, заварное", 250],
    ["p060", "Пирожное", "Кольцо заварное сметанное", 250],
    ["p061", "Пирожное", "Заварное с варёной сгущёнкой", 265],
    ["p062", "Пирожное", "Клубничное наслаждение", 380],
    ["p063", "Пирожное", "Юмбрик творожный", 240],
    ["p064", "Пирожное", "Лаванда", 470],
    ["p065", "Пирожное", "Эклер заварной", 75],
    ["p066", "Пирожное", "Эклер творожный", 75],
    ["p067", "Пирожное", "Ёж ореховый", 80],
    ["p068", "Пирожное", "Медок", 75],
    ["p069", "Пирожное", "Рафаэлка", 50],
    ["p070", "Набор пирожных", "Рафаэлка", 200],
    ["p071", "Набор пирожных", "Эклер творожный", 300],
    ["p072", "Набор пирожных", "Эклер заварной", 300],
    ["p073", "Набор пирожных", "Медок", 300],
    ["p074", "Набор пирожных", "Ёж ореховый", 400],
    ["p075", "Набор пирожных", "Царское удовольствие", 250],
    ["p076", "Набор пирожных", "Царское удовольствие с орехом", 250],
    ["p077", "Набор пирожных", "Наполеон", 225],
    ["p078", "Набор пирожных", "Вишня в шоколаде", 340],
    ["p079", "Набор пирожных", "Honey Бум нутелла", 310],
    ["p080", "Набор пирожных", "Honey Бум солёная карамель", 310],
    ["p081", "Набор пирожных", "Honey Бум фисташка", 310],
    ["p082", "Набор пирожных", "Заварные пирожные", 256],
    ["p083", "Сладости мучные", "Птичье молоко фрукт ассорти", 350],
    ["p084", "Сладости мучные", "Птичье молоко", 500],
    ["p085", "Сладости мучные", "Эстерхази", 850],
    ["p086", "Сладости мучные", "Эстерхази", 425],
    ["p087", "Сладости мучные", "Сникерс", 800],
    ["p088", "Сладости мучные", "Сникерс", 400],
    ["p089", "Сладости мучные", "Сказка", 650],
    ["p090", "Сладости мучные", "Сластена", 800],
    ["p091", "Сладости мучные", "Маффин шоколадный", 70],
    ["p092", "Сладости мучные", "Вафельная трубочка с вар. сгущ.", 65],
    ["p093", "Сладости мучные", "Рулет бисквитный «Мохито»", 500],
    ["p094", "Сладости мучные", "Рулет бисквитный «Нежная лаванда»", 500]
  ];
  var CITIES = [['brest','Брест','БРС'],['grodno','Гродно','ГРД'],['gomel','Гомель','ГМЛ'],['mogilev','Могилёв','МГЛ'],
    ['vitebsk','Витебск','ВТБ'],['baranovichi','Барановичи','БРН'],['pinsk','Пинск','ПНС'],['lida','Лида','ЛИД']];
  var STAFF = [['sk-anna','Анна Литвинович','storekeeper','+375291234501',''],['sk-oleg','Олег Ткачук','storekeeper','+375291234502',''],
    ['dr-ivan','Иван Кравец','driver','+375291234511','Iveco Daily · 4521 AB-7'],['dr-sergey','Сергей Мороз','driver','+375291234512','ГАЗель Next · 7718 KE-7'],
    ['dr-pavel','Павел Гриб','driver','+375291234513','Ford Transit · 3304 MO-7'],['dr-artur','Артур Лис','driver','+375291234514','Iveco Daily · 0912 HA-7']];

  function rng(seed){ var s = seed >>> 0; return function(){ s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function ri(r, a, b){ return a + Math.floor(r() * (b - a + 1)); }
  function sample(r, arr, n){ var a = arr.slice(), out = []; while(out.length < n && a.length) out.push(a.splice(Math.floor(r() * a.length), 1)[0]); return out; }
  function now(){ return new Date().toISOString(); }
  function err(code, message){ return {ok:false, error:code, message:message || ''}; }

  var S = null;
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }
  function load(){
    if(S) return S;
    try{ S = JSON.parse(localStorage.getItem(KEY)); }catch(e){ S = null; }
    if(!S || S.v !== 3) { S = seed(); save(); }
    return S;
  }

  function seed(){
    var r = rng(42), today = D.today();
    var st = {v:3, products:[], cities:[], staff:[], tara:[], moves:[], trips:[], taraMoves:[], shifts:{}, moveId:0, taraId:0, num:0};
    PRODUCTS.forEach(function(p, i){ st.products.push({id:p[0], cat:p[1], name:p[2], sku:'', weightG:p[3], shelfDays:0, minQty:0, sort:i, active:true}); });
    CITIES.forEach(function(c, i){ st.cities.push({id:c[0], name:c[1], code:c[2], sort:i, active:true}); });
    STAFF.forEach(function(s){ st.staff.push({id:s[0], name:s[1], role:s[2], phone:s[3], car:s[4], tgId:'', active:true}); });
    st.tara = [{id:'box', name:'Ящик', total:500, sort:0, active:true}];
    var drivers = ['dr-ivan','dr-sergey','dr-pavel','dr-artur'], pids = PRODUCTS.map(function(p){ return p[0]; }), cids = CITIES.map(function(c){ return c[0]; });
    var stock = {}; pids.forEach(function(p){ stock[p] = 0; });
    function mv(type, day, pid, q, extra){ st.moves.push(Object.assign({id:++st.moveId, type:type, date:day, productId:pid, qty:q, cityId:null, tripId:null, note:'', createdAt:now()}, extra || {})); stock[pid] += q; }
    function tm(day, tid, drv, kind, q, cid, trip){ if(q) st.taraMoves.push({id:++st.taraId, date:day, taraId:tid, driverId:drv, kind:kind, qty:kind === 'out' ? q : -q, cityId:cid, tripId:trip || null, note:''}); }
    for(var back = 14; back >= 0; back--){
      var day = D.add(today, -back);
      st.shifts[day] = [back % 2 ? 'sk-oleg' : 'sk-anna'].concat(sample(r, drivers, 3));
      sample(r, pids, 45).forEach(function(p){ mv('in', day, p, ri(r, 4, 12), {note:'Цех'}); });
      if(back === 0) break;
      sample(r, cids, 4).forEach(function(cid){
        var tid = 'R-S' + (++st.num), lines = [];
        sample(r, pids, 14).forEach(function(pid){ var q = Math.min(stock[pid], ri(r, 1, 5)); if(q){ lines.push({productId:pid, qty:q}); mv('ship', day, pid, -q, {cityId:cid, tripId:tid}); } });
        var drv = drivers[ri(r, 0, 3)];
        var crates = Math.floor(lines.reduce(function(s, l){ return s + l.qty; }, 0) / 2) + 1, backCr = Math.max(0, crates - [0, 0, 0, 1, 2][ri(r, 0, 4)]);
        tm(day, 'box', drv, 'out', crates, cid, tid); tm(day, 'box', drv, 'back', backCr, cid, tid);
        var closed = lines.map(function(l){ var b = r() < .25 ? 1 : 0; if(b) mv('return', day, l.productId, b, {cityId:cid, tripId:tid}); return Object.assign({}, l, {back:b, spoiled:0, delivered:l.qty - b}); });
        st.trips.push({id:tid, num:st.num, date:day, cityId:cid, driverId:drv, status:'closed', lines:closed,
          taraOut:[{taraId:'box', qty:crates}], taraBack:[{taraId:'box', qty:backCr}], report:'', note:'', createdAt:day + 'T07:20:00', shippedAt:day + 'T07:40:00', reportedAt:null, closedAt:day + 'T18:30:00'});
      });
    }
    [['shipped','brest','dr-ivan'],['draft','gomel','dr-sergey']].forEach(function(t){
      var tid = 'R-S' + (++st.num), lines = sample(r, pids, 12).map(function(p){ return {productId:p, qty:Math.min(stock[p], ri(r, 1, 4))}; }).filter(function(l){ return l.qty; });
      var tara = [{taraId:'box', qty:16}];
      if(t[0] === 'shipped'){ lines.forEach(function(l){ mv('ship', today, l.productId, -l.qty, {cityId:t[1], tripId:tid}); }); tara.forEach(function(l){ tm(today, l.taraId, t[2], 'out', l.qty, t[1], tid); }); }
      st.trips.push({id:tid, num:st.num, date:today, cityId:t[1], driverId:t[2], status:t[0], lines:lines, taraOut:tara, taraBack:[], report:'', note:'', createdAt:now(), shippedAt:t[0] === 'shipped' ? now() : null, reportedAt:null, closedAt:null});
    });
    return st;
  }

  function stockMap(){ var m = {}; S.moves.forEach(function(x){ m[x.productId] = (m[x.productId] || 0) + x.qty; }); return m; }
  // долг ящиков: ключ «водитель|вид тары»
  function taraDebt(){ var m = {}; S.taraMoves.forEach(function(x){ var k = x.driverId + '|' + x.taraId; m[k] = (m[k] || 0) + x.qty; }); return m; }
  function byId(list, id){ for(var i = 0; i < list.length; i++) if(list[i].id === id) return list[i]; return null; }
  function addMove(type, pid, q, extra){ S.moves.push(Object.assign({id:++S.moveId, type:type, date:D.today(), productId:pid, qty:q, cityId:null, tripId:null, note:'', createdAt:now()}, extra || {})); }
  function addTara(tid, drv, kind, q, cid, trip, note){ S.taraMoves.push({id:++S.taraId, date:D.today(), taraId:tid, driverId:drv, kind:kind, qty:kind === 'out' ? Math.abs(q) : -Math.abs(q), cityId:cid || null, tripId:trip || null, note:note || ''}); }
  function lines(arr, allowEmpty){
    var m = {}, out = [];
    (arr || []).forEach(function(x){ var q = Math.max(0, parseInt(x.qty, 10) || 0); if(q && byId(S.products, x.productId)) m[x.productId] = (m[x.productId] || 0) + q; });
    Object.keys(m).forEach(function(k){ out.push({productId:k, qty:m[k]}); });
    if(!out.length && !allowEmpty) return null;
    return out;
  }
  function taraLines(arr){ var m = {}, out = []; (arr || []).forEach(function(x){ var q = parseInt(x.qty, 10) || 0; if(q > 0) m[x.taraId] = (m[x.taraId] || 0) + q; }); Object.keys(m).forEach(function(k){ out.push({taraId:k, qty:m[k]}); }); return out; }
  function shortage(ls){
    var st = stockMap(), short = [];
    ls.forEach(function(l){ var have = st[l.productId] || 0; if(l.qty > have) short.push(byId(S.products, l.productId).name + ': есть ' + have + ', нужно ' + l.qty); });
    return short.length ? 'Не хватает: ' + short.join('; ') : '';
  }
  function returns(arr, trip){
    var shipped = {}; trip.lines.forEach(function(l){ shipped[l.productId] = l.qty; });
    var out = [];
    for(var i = 0; i < (arr || []).length; i++){
      var x = arr[i], b = parseInt(x.back, 10) || 0, s = parseInt(x.spoiled, 10) || 0;
      if(!(x.productId in shipped) || b < 0 || s < 0 || b + s > shipped[x.productId]) return null;
      if(b || s) out.push({productId:x.productId, back:b, spoiled:s});
    }
    return out;
  }
  function upsert(list, obj){ var o = byId(list, obj.id); if(o) Object.assign(o, obj); else list.push(obj); return byId(list, obj.id); }
  function inRange(d, a, b){ return d >= a && d <= b; }

  var A = {
    getRefs: function(){ return {products:S.products, cities:S.cities, staff:S.staff, tara:S.tara, moveTypes:MOVE_TYPES, cats:CATS}; },
    getMe: function(){ return {staff:null, restricted:false}; },
    saveProduct: function(p){ if(!p.name || p.name.length < 2) return err('bad_request', 'Название'); return {product:upsert(S.products, {id:p.id || Kit.uid('p'), cat:p.cat || CATS[0], name:p.name, sku:p.sku || '', weightG:+p.weightG || 0, shelfDays:+p.shelfDays || 0, minQty:+p.minQty || 0, sort:p.sort != null ? p.sort : S.products.length, active:p.active !== false})}; },
    saveCity: function(p){ if(!p.name || p.name.length < 2) return err('bad_request', 'Название'); return {city:upsert(S.cities, {id:p.id || Kit.uid('c'), name:p.name, code:String(p.code || '').toUpperCase().slice(0, 4), sort:S.cities.length, active:p.active !== false})}; },
    saveStaff: function(p){ if(!p.name || p.name.length < 2) return err('bad_request', 'Имя'); if(p.tgId && !/^\d+$/.test(p.tgId)) return err('bad_request', 'tgId: только цифры'); return {staff:upsert(S.staff, {id:p.id || Kit.uid('s'), name:p.name, role:p.role, phone:p.phone || '', car:p.car || '', tgId:p.tgId || '', active:p.active !== false})}; },
    saveTara: function(p){ if(!p.name || p.name.length < 2) return err('bad_request', 'Название'); return {tara:upsert(S.tara, {id:p.id || Kit.uid('t'), name:p.name, total:+p.total || 0, sort:S.tara.length, active:p.active !== false})}; },

    getStock: function(){
      var st = stockMap(), lastIn = {}, road = {};
      S.moves.forEach(function(m){ if(m.type === 'in' && (!lastIn[m.productId] || m.date > lastIn[m.productId])) lastIn[m.productId] = m.date; });
      S.trips.forEach(function(t){ if(t.status === 'shipped' || t.status === 'reported') t.lines.forEach(function(l){ road[l.productId] = (road[l.productId] || 0) + l.qty; }); });
      var items = S.products.filter(function(p){ return p.active || st[p.id]; }).map(function(p){ return Object.assign({}, p, {qty:st[p.id] || 0, lastIn:lastIn[p.id] || null, onRoad:road[p.id] || 0}); });
      return {items:items, total:items.reduce(function(s, i){ return s + i.qty; }, 0)};
    },
    addIncome: function(p){ var ls = lines(p.lines); if(!ls) return err('bad_request', 'Пустой список'); ls.forEach(function(l){ addMove('in', l.productId, l.qty, {date:p.date || D.today(), note:p.note || ''}); }); return {added:ls.reduce(function(s, l){ return s + l.qty; }, 0)}; },
    writeOff: function(p){ var q = parseInt(p.qty, 10) || 0; if(q < 1 || !p.reason) return err('bad_request'); var s = shortage([{productId:p.productId, qty:q}]); if(s) return err('no_stock', s); addMove('writeoff', p.productId, -q, {note:p.reason}); return {qty:stockMap()[p.productId] || 0}; },
    adjustStock: function(p){ var a = parseInt(p.actual, 10); if(!(a >= 0)) return err('bad_request'); var d = a - (stockMap()[p.productId] || 0); if(d) addMove('adjust', p.productId, d, {note:p.note || 'Пересчёт'}); return {delta:d, qty:a}; },
    getMoves: function(p){ var to = p.to || D.today(), from = p.from || D.add(to, -6); return {from:from, to:to, moves:S.moves.filter(function(m){ return inRange(m.date, from, to) && (!p.type || m.type === p.type); }).sort(function(a, b){ return a.date === b.date ? b.id - a.id : (a.date < b.date ? 1 : -1); }).slice(0, 500)}; },

    getTrips: function(p){ var from = p.from || D.add(D.today(), -7), to = p.to || D.add(D.today(), 7); return {trips:S.trips.filter(function(t){ return inRange(t.date, from, to) || /draft|shipped|reported/.test(t.status); }).sort(function(a, b){ return a.date === b.date ? b.num - a.num : (a.date < b.date ? 1 : -1); })}; },
    saveTrip: function(p){
      if(!byId(S.cities, p.cityId)) return err('not_found', 'Нет такого города');
      var ls = lines(p.lines, true), data = {date:p.date || D.today(), cityId:p.cityId, driverId:p.driverId || null, lines:ls, taraOut:taraLines(p.taraOut), note:p.note || ''};
      if(p.id){ var t = byId(S.trips, p.id); if(!t) return err('not_found'); if(t.status !== 'draft') return err('bad_state', 'Отгруженный рейс не редактируется'); Object.assign(t, data); return {trip:t}; }
      var nt = Object.assign({id:'R-' + Kit.uid('M').slice(2), num:++S.num, status:'draft', taraBack:[], report:'', createdAt:now(), shippedAt:null, reportedAt:null, closedAt:null}, data);
      S.trips.push(nt); return {trip:nt};
    },
    shipTrip: function(p){
      var t = byId(S.trips, p.id); if(!t) return err('not_found'); if(t.status !== 'draft') return err('bad_state', 'Рейс уже отгружен');
      if(!t.lines.length) return err('bad_request', 'В рейсе нет тортов'); if(!t.driverId) return err('bad_request', 'Не выбран водитель');
      var s = shortage(t.lines); if(s) return err('no_stock', s);
      t.lines.forEach(function(l){ addMove('ship', l.productId, -l.qty, {cityId:t.cityId, tripId:t.id}); });
      t.taraOut.forEach(function(l){ addTara(l.taraId, t.driverId, 'out', l.qty, t.cityId, t.id); });
      t.status = 'shipped'; t.shippedAt = now(); return {trip:t};
    },
    cancelTrip: function(p){ var t = byId(S.trips, p.id); if(!t) return err('not_found'); if(t.status !== 'draft') return err('bad_state', 'Отменить можно только рейс на сборке'); t.status = 'cancelled'; return {trip:t}; },
    reportTrip: function(p){
      var t = byId(S.trips, p.id); if(!t) return err('not_found'); if(!/shipped|reported/.test(t.status)) return err('bad_state', 'Рейс не в пути');
      var rs = returns(p.returns, t); if(!rs) return err('bad_request', 'Возврат больше, чем уехало');
      t.report = JSON.stringify({returns:rs, taraBack:taraLines(p.taraBack), comment:p.comment || ''}); t.status = 'reported'; t.reportedAt = now(); return {trip:t};
    },
    closeTrip: function(p){
      var t = byId(S.trips, p.id); if(!t) return err('not_found'); if(!/shipped|reported/.test(t.status)) return err('bad_state', 'Рейс не в пути');
      var rs = returns(p.returns, t); if(!rs) return err('bad_request', 'Возврат больше, чем уехало');
      var tb = taraLines(p.taraBack), by = {};
      rs.forEach(function(r){ by[r.productId] = r; if(r.back) addMove('return', r.productId, r.back, {cityId:t.cityId, tripId:t.id}); });
      tb.forEach(function(l){ addTara(l.taraId, t.driverId, 'back', l.qty, t.cityId, t.id); });
      t.lines = t.lines.map(function(l){ var r = by[l.productId] || {}, b = r.back || 0, s = r.spoiled || 0; return Object.assign({}, l, {back:b, spoiled:s, delivered:l.qty - b - s}); });
      t.taraBack = tb; t.status = 'closed'; t.closedAt = now(); return {trip:t};
    },
    getMyTrips: function(p){
      var d = p.driverId && byId(S.staff, p.driverId); if(!d) return {driver:null, trips:[]};
      var since = D.add(D.today(), -14), debt = taraDebt();
      var taraDebtList = S.tara.map(function(t){ return {taraId:t.id, qty:debt[d.id + '|' + t.id] || 0}; }).filter(function(x){ return x.qty; });
      return {driver:d, taraDebt:taraDebtList, trips:S.trips.filter(function(t){ return t.driverId === d.id && t.status !== 'cancelled' && (/draft|shipped|reported/.test(t.status) || t.date >= since); }).sort(function(a, b){ return a.date === b.date ? b.num - a.num : (a.date < b.date ? 1 : -1); }).slice(0, 30)};
    },

    getTara: function(){
      var agg = {};
      S.taraMoves.forEach(function(x){ var k = x.driverId + '|' + x.taraId + '|' + x.kind; agg[k] = (agg[k] || 0) + x.qty; });
      var g = function(d, t, k){ return agg[d + '|' + t + '|' + k] || 0; };
      var types = S.tara.map(function(t){
        var at = 0, lost = 0;
        Object.keys(agg).forEach(function(k){ var p = k.split('|'); if(p[1] === t.id){ at += agg[k]; if(p[2] === 'writeoff') lost -= agg[k]; } });
        return Object.assign({}, t, {atDrivers:at, lost:lost, inStock:t.total - at - lost});
      });
      var drivers = S.staff.filter(function(s){ return s.role === 'driver'; }).map(function(d){
        var per = {}, debt = 0, any = false;
        S.tara.forEach(function(t){
          var o = g(d.id, t.id, 'out'), b = g(d.id, t.id, 'back'), w = g(d.id, t.id, 'writeoff');
          per[t.id] = {issued:o, returned:-b, lost:-w, debt:o + b + w}; debt += o + b + w; if(o) any = true;
        });
        return Object.assign({}, d, {tara:per, debt:debt, _any:any});
      }).filter(function(d){ return d.active || d.debt || d._any; }).sort(function(a, b){ return b.debt - a.debt; });
      return {types:types, drivers:drivers, history:S.taraMoves.slice(-100).reverse()};
    },
    taraMove: function(p){
      var q = parseInt(p.qty, 10) || 0, d = byId(S.staff, p.driverId);
      if(q < 1 || !/^(out|back|writeoff)$/.test(p.kind)) return err('bad_request');
      if(!d || d.role !== 'driver') return err('not_found', 'Нет такого водителя');
      var debt = taraDebt()[d.id + '|' + p.taraId] || 0;
      if(p.kind !== 'out' && q > debt) return err('bad_request', 'У водителя на руках только ' + debt);
      addTara(p.taraId, d.id, p.kind, q, null, null, p.note);
      return {debt:taraDebt()[d.id + '|' + p.taraId] || 0};
    },

    getShifts: function(p){ var from = p.from || D.today(), to = p.to || D.add(from, 6), days = {}; Object.keys(S.shifts).forEach(function(d){ if(inRange(d, from, to) && S.shifts[d].length) days[d] = S.shifts[d]; }); return {days:days, from:from, to:to}; },
    setShift: function(p){ var ids = (p.staffIds || []).filter(function(id, i, a){ return byId(S.staff, id) && a.indexOf(id) === i; }); S.shifts[p.date] = ids; return {date:p.date, staffIds:ids}; },

    getOverview: function(p){
      var days = p.days || 14, today = D.today(), from = D.add(today, -(days - 1)), byDay = {}, byCity = {}, top = {}, ret = 0, wo = 0;
      S.moves.forEach(function(m){
        if(m.date < from) return;
        if(m.type === 'ship'){ byDay[m.date] = (byDay[m.date] || 0) - m.qty; byCity[m.cityId] = (byCity[m.cityId] || 0) - m.qty; top[m.productId] = (top[m.productId] || 0) - m.qty; }
        if(m.type === 'return') ret += m.qty;
        if(m.type === 'writeoff') wo -= m.qty;
      });
      var series = []; for(var i = 0; i < days; i++){ var d = D.add(from, i); series.push({date:d, value:byDay[d] || 0}); }
      var st = stockMap(), trips = {draft:0, shipped:0, reported:0}, debt = taraDebt(), taraOut = 0;
      S.trips.forEach(function(t){ if(t.status in trips) trips[t.status]++; });
      Object.keys(debt).forEach(function(k){ taraOut += debt[k]; });
      function sorted(o, key){ return Object.keys(o).map(function(k){ var r = {qty:o[k]}; r[key] = k; return r; }).sort(function(a, b){ return b.qty - a.qty; }); }
      return {stockTotal:Object.keys(st).reduce(function(s, k){ return s + st[k]; }, 0),
        lowStock:S.products.filter(function(x){ return x.active && x.minQty && (st[x.id] || 0) < x.minQty; }).map(function(x){ return x.name; }),
        shippedToday:byDay[today] || 0, shippedPeriod:series.reduce(function(s, x){ return s + x.value; }, 0), returnedPeriod:ret, writtenOffPeriod:wo,
        trips:trips, series:series, byCity:sorted(byCity, 'cityId'), topProducts:sorted(top, 'productId').slice(0, 5), taraOut:taraOut, onShift:S.shifts[today] || []};
    }
  };

  return function(action, payload){
    load();
    var fn = A[action];
    if(!fn) return {ok:false, error:'unknown_action'};
    var res = fn(payload || {});
    if(res && res.ok === false) return res;
    save();
    return Object.assign({ok:true}, res);
  };
})();
