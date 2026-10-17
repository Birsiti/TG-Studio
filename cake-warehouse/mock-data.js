// изменено 2026-10-17 09:00
/* Данные демо-режима: каталог (сгенерирован из api/bots/cake/catalog.py),
   демо-справочники и генерация истории за 2 недели. Логика — в mock.js. */
window.CakeMockData = (function(){
  "use strict";
  var D = Kit.date;
  var MOVE_TYPES = {'in':'Приход', ship:'Отгрузка', 'return':'Возврат', writeoff:'Списание', adjust:'Инвентаризация'};
  // сгенерировано db/gen_mock_catalog.py из api/bots/cake/catalog.py — руками не править
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
    ["p094", "Сладости мучные", "Рулет бисквитный «Нежная лаванда»", 500],
    ["p095", "Пирожное", "Красный бархат", 500],
    ["p096", "Пирожное", "Наполеон", 75],
    ["p097", "Торт", "Вкус наслаждения", 1000]
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

  function seed(){
    var r = rng(42), today = D.today();
    var st = {v:3, products:[], cities:[], staff:[], tara:[], moves:[], trips:[], taraMoves:[], shifts:{}, moveId:0, taraId:0, num:0};
    PRODUCTS.forEach(function(p, i){ st.products.push({id:p[0], cat:p[1], name:p[2], sku:'', weightG:p[3], shelfDays:0, minQty:0, perBox:1, sort:i, active:true}); });
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

  return {MOVE_TYPES:MOVE_TYPES, CATS:CATS, PRODUCTS:PRODUCTS, seed:seed};
})();
