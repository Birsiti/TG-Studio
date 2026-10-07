// изменено 2026-10-08 02:15
/* ============================================================
   mock.js — офлайн-двойник API мойки (api/bots/carwash.py).
   Работает, когда https://api.tg-studio.xyz недоступен: тот же
   контракт action, состояние в localStorage (общее для client/admin/
   owner в одном браузере — запись клиента сразу видна админу).
   ============================================================ */
window.CarwashMock = (function(){
  "use strict";
  var KEY = 'tgs-mock-carwash-v2';
  var D = Kit.date;
  var CLASSES = ['legkovoy','krossover','vnedorozhnik','minivan'];
  var STATUS_RU = {pending:'Ожидает', confirmed:'Подтверждена', done:'Выполнена', cancelled:'Отменена'};
  var WD = ['sun','mon','tue','wed','thu','fri','sat'];

  function P(a,b,c,d){ return {legkovoy:a, krossover:b, vnedorozhnik:c, minivan:d}; }
  var SERVICES = [
    ['Мойка','wash-express','Экспресс-смыв кузова',P([8,8],[9,9],[10,10],[12,12]),'Активная пена и смыв под давлением — 10 минут.'],
    ['Мойка','wash-contactless','Бесконтактная мойка',P([15,15],[18,18],[20,20],[24,24]),'Двухфазная химия, ополаскивание осмосом, сушка.'],
    ['Мойка','wash-standard','Стандарт',P([30,35],[35,40],[40,45],[45,50]),'Предмойка, ручная мойка кузова, воск, сушка кузова и проёмов, коврики.'],
    ['Мойка','wash-lux','Люкс',P([50,60],[55,65],[60,70],[65,75]),'Всё из «Стандарта» + пылесос салона и багажника, пластик, стёкла изнутри.'],
    ['Мойка','wash-nano','Nano-комплекс',P([85,100],[90,105],[95,110],[100,115]),'Nano-шампунь и консервант, полная уборка салона, чернение шин.'],
    ['Салон','in-vacuum','Пылесос салона',P([12,20],[14,24],[16,28],[18,30]),''],
    ['Салон','in-plastic','Чистка и полироль пластика',P([20,30],[22,32],[25,35],[28,38]),''],
    ['Салон','in-seat','Химчистка сиденья',P([35,60],[35,60],[35,60],[35,60]),'Цена за одно сиденье, ткань или кожа.'],
    ['Салон','in-full','Полная химчистка салона',P([220,450],[260,520],[300,600],[320,650]),'Пол, потолок, сиденья, двери, багажник. Сушка до 6 часов.'],
    ['Детейлинг','det-headlights','Полировка фар (пара)',P([60,120],[60,120],[60,120],[60,120]),''],
    ['Детейлинг','det-wax','Твёрдый воск',P([70,90],[80,100],[90,110],[95,120]),'Блеск и защита до 2 месяцев.'],
    ['Детейлинг','det-polish','Полировка кузова',P([350,900],[400,1000],[450,1100],[500,1200]),'Абразивная двухэтапная полировка.'],
    ['Детейлинг','det-ceramic','Керамика',P([900,1600],[1000,1800],[1100,2000],[1200,2100]),'Защитное покрытие кузова на 1–2 года.'],
    ['Доп. услуги','ex-tires','Чернение резины',P([6,8],[6,8],[8,10],[8,10]),''],
    ['Доп. услуги','ex-engine','Мойка двигателя',P([35,60],[35,60],[40,70],[40,70]),''],
    ['Доп. услуги','ex-rain','Антидождь на лобовое',P([25,40],[25,40],[25,40],[30,45]),''],
    ['Доп. услуги','ex-disks','Мойка дисков с химией',P([10,15],[12,18],[14,20],[14,20]),'']
  ];
  var STAFF = [
    ['st-artem','Артём Ковалёв','Мойщик','percent',30,'+375291112233',true],
    ['st-ilya','Илья Савицкий','Мойщик','percent',30,'+375296667788',true],
    ['st-maxim','Максим Жук','Детейлер','percent',35,'+375447778899',true],
    ['st-denis','Денис Лапко','Мойщик','percent',28,'+375333334455',true],
    ['st-olga','Ольга Мельник','Администратор','fixed',70,'+375255556677',true],
    ['st-vlad','Владислав Гук','Мойщик','percent',28,'+375297001020',false]
  ];
  var NAMES = ['Алексей','Мария','Сергей','Анна','Дмитрий','Екатерина','Павел','Ольга','Игорь','Наталья','Андрей','Юлия','Виктор','Никита','Ирина'];
  var CARS = [['Volkswagen','Polo','legkovoy'],['Toyota','Camry','legkovoy'],['Kia','Sportage','krossover'],['Hyundai','Tucson','krossover'],['Geely','Coolray','krossover'],['BMW','X5','vnedorozhnik'],['Toyota','Land Cruiser Prado','vnedorozhnik'],['Renault','Logan','legkovoy'],['Skoda','Octavia','legkovoy'],['Mercedes-Benz','Vito','minivan'],['Haval','Jolion','krossover']];
  var POPULAR = ['wash-standard','wash-standard','wash-lux','wash-contactless','wash-express','wash-lux','wash-nano','in-vacuum'];
  var EXTRAS = ['ex-tires','ex-disks','in-vacuum','in-plastic','ex-rain','det-wax'];

  function rng(seed){ var s = seed >>> 0; return function(){ s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function pick(r, a){ return a[Math.floor(r() * a.length)]; }
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function hm(m){ return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function mins(t){ var p = t.split(':'); return +p[0] * 60 + +p[1]; }
  function id(prefix){ return prefix + '-' + Math.random().toString(16).slice(2, 8).toUpperCase(); }
  function nowMin(){ var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }

  var S = null;
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }
  function svcMap(){ var m = {}; S.services.forEach(function(s){ m[s.id] = s; }); return m; }
  function price(ids, cls){
    var m = svcMap(), lo = 0, hi = 0, names = [];
    ids.forEach(function(i){ var s = m[i]; if(!s) return; var p = s.price[cls] || [0,0]; lo += p[0]; hi += p[1]; names.push(s.name); });
    return {lo:lo, hi:hi, names:names};
  }
  function dayTimes(day){
    if(S.closed.indexOf(day) > -1) return [];
    var d = S.schedule[WD[D.parse(day).getDay()]];
    if(!d || !d.open) return [];
    var out = []; for(var m = mins(d.from); m < mins(d.to); m += 30) out.push(hm(m));
    return out;
  }
  function slotStates(day){
    return dayTimes(day).map(function(t){
      var b = S.bookings.find(function(x){ return x.date === day && x.time === t && x.status !== 'cancelled'; });
      if(b) return {time:t, state:'booked', bookingId:b.id};
      if(S.blocked.some(function(x){ return x.date === day && x.time === t; })) return {time:t, state:'blocked'};
      return {time:t, state:'free'};
    });
  }

  function seedBookings(r, today, from, to){
    var pay = STAFF.filter(function(s){ return s[3] === 'percent' && s[6]; }).map(function(s){ return s[0]; });
    for(var off = from; off <= to; off++){
      var day = D.add(today, off), wd = WD[D.parse(day).getDay()];
      var base = (wd === 'fri' || wd === 'sat') ? .6 : wd === 'sun' ? .45 : .5;
      if(off > 0) base *= Math.max(.15, .75 - off * .09);
      var crew = pay.slice().sort(function(){ return r() - .5; }).slice(0, 3);
      if(off <= 0) S.shifts[day] = crew.concat(['st-olga']);
      dayTimes(day).forEach(function(t){
        if(r() > base) return;
        if(off === 0 && mins(t) > nowMin() - 30 && r() < .5) return;
        if(S.bookings.some(function(x){ return x.date === day && x.time === t && x.status !== 'cancelled'; })) return;
        var car = pick(r, CARS), ids = [pick(r, POPULAR)];
        if(r() < .45) ids.push(pick(r, EXTRAS));
        ids = ids.filter(function(x, i){ return ids.indexOf(x) === i; });
        var pr = price(ids, car[2]), past = off < 0 || (off === 0 && mins(t) < nowMin() - 60);
        var status = past ? (r() < .06 ? 'cancelled' : 'done') : (r() < .25 ? 'pending' : 'confirmed');
        S.bookings.push({id:'BLK-' + Math.floor(r() * 0xFFFFFF).toString(16).toUpperCase(), date:day, time:t,
          car:{number:(1000 + Math.floor(r() * 9000)) + ' ' + pick(r, 'ABEIKMHOPCTX'.split('')) + pick(r, 'ABEIKMHOPCTX'.split('')) + '-7', brand:car[0], model:car[1], carClass:car[2]},
          serviceIds:ids, services:pr.names, priceMin:pr.lo, priceMax:pr.hi,
          contact:{name:pick(r, NAMES), phone:'+37529' + (1000000 + Math.floor(r() * 8999999))},
          userId:null, status:status, staffId:(status === 'done' || (off === 0 && r() < .5)) && status !== 'cancelled' ? pick(r, crew) : null, createdAt:Date.now()});
      });
    }
  }

  function init(){
    try{ S = JSON.parse(localStorage.getItem(KEY) || 'null'); }catch(e){ S = null; }
    var today = D.today();
    if(S && S.day === today) return;
    if(S){ // новый день — закрыть прошедшее и досеять будущее
      S.bookings.forEach(function(b){ if(b.date < today && (b.status === 'pending' || b.status === 'confirmed')) b.status = 'done'; });
      var last = S.bookings.reduce(function(m, b){ return b.date > m ? b.date : m; }, today);
      seedBookings(rng(Date.now() & 0xffff), today, Math.max(1, D.diff(today, last) + 1), 10);
      S.day = today; save(); return;
    }
    S = {day:today, services:[], bookings:[], cars:[], shifts:{}, blocked:[], closed:[], payouts:[], schedule:{}};
    SERVICES.forEach(function(s, i){ S.services.push({category:s[0], id:s[1], name:s[2], price:s[3], desc:s[4], visible:true, sort:i}); });
    WD.forEach(function(w){ S.schedule[w] = {open:true, from:w === 'sun' ? '10:00' : '08:00', to:w === 'sun' ? '18:00' : '21:00'}; });
    S.staff = STAFF.map(function(s){ return {id:s[0], name:s[1], role:s[2], payType:s[3], rate:s[4], phone:s[5], active:s[6]}; });
    S.bays = [
      {id:'bay-1', name:'Бокс 1 · ручная мойка', status:'busy', note:'Kia Sportage, Люкс', todayCount:7, todayRevenue:340},
      {id:'bay-2', name:'Бокс 2 · ручная мойка', status:'free', note:'', todayCount:6, todayRevenue:265},
      {id:'bay-3', name:'Бокс 3 · детейлинг', status:'busy', note:'Полировка, до 17:00', todayCount:2, todayRevenue:610},
      {id:'bay-4', name:'Бесконтакт · самообслуживание', status:'repair', note:'Замена форсунки, до завтра', todayCount:0, todayRevenue:0}];
    S.inventory = [['inv-foam','Активная пена Grass','л',42,20,6.8],['inv-shampoo','Шампунь ручной мойки','л',18,10,9.5],['inv-wax','Холодный воск','л',6,8,21],['inv-nano','Nano-консервант','л',3,4,48],['inv-tire','Чернитель резины','л',9,5,14],['inv-micro','Микрофибра 40×40','шт',64,40,3.2],['inv-chem','Химия для химчистки','л',11,6,26],['inv-glass','Очиститель стёкол','л',7,5,8.4]]
      .map(function(x){ return {id:x[0], name:x[1], unit:x[2], qty:x[3], min:x[4], price:x[5]}; });
    S.shop = [['shop-fresh','Ароматизатор «Морской бриз»',9,24,true],['shop-cloth','Набор микрофибры, 3 шт',15,18,true],['shop-shampoo','Автошампунь, 1 л',18,12,true],['shop-glass','Омыватель −20°, 4 л',16,30,true],['shop-wax','Быстрый воск-спрей',32,8,true],['shop-gift','Подарочный сертификат 100 BYN',100,99,false]]
      .map(function(x){ return {id:x[0], name:x[1], price:x[2], stock:x[3], visible:x[4]}; });
    seedBookings(rng(7), today, -35, 10);
    var ms = today.slice(0, 8) + '01';
    S.payouts = [{id:'pay-1', staffId:'st-artem', amount:300, date:D.add(today, -3) < ms ? ms : D.add(today, -3)},
                 {id:'pay-2', staffId:'st-maxim', amount:400, date:D.add(today, -3) < ms ? ms : D.add(today, -3)}];
    S.cars = []; save();
  }

  function clientBooking(b){
    return {id:b.id, date:b.date, time:b.time, car:b.car, services:b.services, priceMin:b.priceMin, priceMax:b.priceMax, contact:b.contact, status:STATUS_RU[b.status], state:b.status};
  }
  function adminBooking(b){
    return {id:b.id, date:b.date, time:b.time, car:b.car, services:b.services, priceMin:b.priceMin, priceMax:b.priceMax, contact:b.contact, status:b.status, assignedStaffId:b.staffId};
  }
  function staffOut(s){
    var today = D.today(), ms = today.slice(0, 8) + '01';
    var shifts = Object.keys(S.shifts).filter(function(d){ return d >= ms && d <= today && S.shifts[d].indexOf(s.id) > -1; }).length;
    var earned = s.payType === 'percent'
      ? S.bookings.filter(function(b){ return b.staffId === s.id && b.status === 'done' && b.date >= ms && b.date <= today; }).reduce(function(a, b){ return a + b.priceMin; }, 0) * s.rate / 100
      : shifts * s.rate;
    var paid = S.payouts.filter(function(p){ return p.staffId === s.id && p.date >= ms; }).reduce(function(a, p){ return a + p.amount; }, 0);
    return Object.assign({}, s, {shiftsMonth:shifts, earnedMonth:Math.round(earned * 100) / 100, paidMonth:paid, accruedMonth:Math.round((earned - paid) * 100) / 100});
  }
  function summary(from, to){
    var list = S.bookings.filter(function(b){ return b.date >= from && b.date <= to; });
    var act = list.filter(function(b){ return b.status !== 'cancelled'; });
    var rev = act.reduce(function(a, b){ return a + b.priceMin; }, 0);
    var payroll = 0, staff = {};
    S.staff.forEach(function(s){ staff[s.id] = s; });
    act.forEach(function(b){ var s = staff[b.staffId]; if(b.status === 'done' && s && s.payType === 'percent') payroll += b.priceMin * s.rate / 100; });
    Object.keys(S.shifts).forEach(function(d){ if(d >= from && d <= to) S.shifts[d].forEach(function(id){ var s = staff[id]; if(s && s.payType === 'fixed') payroll += s.rate; }); });
    return {revenue:rev, bookings:act.length, avgCheck:act.length ? Math.round(rev / act.length) : 0, payroll:Math.round(payroll), cancelled:list.length - act.length};
  }
  function chartTop(from, to){
    var chart = [], span = D.diff(from, to), DOW = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
    for(var d = from; d <= to; d = D.add(d, 1)){
      var v = S.bookings.filter(function(b){ return b.date === d && b.status !== 'cancelled'; }).reduce(function(a, b){ return a + b.priceMin; }, 0);
      chart.push({d: span <= 7 ? DOW[D.parse(d).getDay()] : String(D.day(d)), date:d, v:Math.round(v)});
    }
    var agg = {}, m = svcMap();
    S.bookings.forEach(function(b){
      if(b.status === 'cancelled' || b.date < from || b.date > to) return;
      var w = (b.serviceIds || []).map(function(i){ return m[i] ? (m[i].price[b.car.carClass] || [1])[0] : 1; });
      var tot = w.reduce(function(a, x){ return a + x; }, 0) || 1;
      b.services.forEach(function(n, i){ agg[n] = agg[n] || {name:n, revenue:0, count:0}; agg[n].revenue += b.priceMin * (w[i] || 1) / tot; agg[n].count++; });
    });
    var top = Object.keys(agg).map(function(k){ agg[k].revenue = Math.round(agg[k].revenue); return agg[k]; }).sort(function(a, b){ return b.revenue - a.revenue; }).slice(0, 5);
    return {chart:chart, topServices:top};
  }
  function crud(list, item, prefix){
    var i = item.id ? S[list].findIndex(function(x){ return x.id === item.id; }) : -1;
    if(i > -1) S[list][i] = Object.assign(S[list][i], item); else { item.id = id(prefix); S[list].push(item); }
    save(); return S[list][i > -1 ? i : S[list].length - 1];
  }
  function del(list, itemId){ S[list] = S[list].filter(function(x){ return x.id !== itemId; }); save(); return {ok:true}; }

  var H = {
    getServices: function(p){
      var cats = {}, order = [];
      S.services.slice().sort(function(a, b){ return a.sort - b.sort; }).forEach(function(s){
        if(p.audience === 'client' && !s.visible) return;
        if(!cats[s.category]){ cats[s.category] = []; order.push(s.category); }
        var it = {id:s.id, name:s.name, price:s.price}; if(s.desc) it.desc = s.desc; if(p.audience !== 'client') it.visible = s.visible;
        cats[s.category].push(it);
      });
      return {ok:true, categories:order.map(function(c){ return {category:c, items:cats[c]}; })};
    },
    getSchedule: function(){ return {ok:true, schedule:S.schedule, closedDates:S.closed.filter(function(d){ return d >= D.today(); }).sort()}; },
    getSlots: function(p){
      var today = D.today();
      return {ok:true, slots:slotStates(p.date).map(function(s){ return {time:s.time, disabled:s.state !== 'free' || p.date < today || (p.date === today && mins(s.time) <= nowMin())}; })};
    },
    createBooking: function(p){
      var ids = p.serviceIds || [], m = svcMap();
      if(!ids.length || ids.some(function(i){ return !m[i]; })) return {ok:false, error:'bad_service'};
      var st = slotStates(p.date).find(function(s){ return s.time === p.time; });
      if(!st || st.state !== 'free') return {ok:false, error:'slot_unavailable'};
      var pr = price(ids, p.car.carClass);
      var b = {id:id('BLK'), date:p.date, time:p.time, car:{number:String(p.car.number).toUpperCase(), brand:p.car.brand || '', model:p.car.model || '', carClass:p.car.carClass},
        serviceIds:ids, services:pr.names, priceMin:pr.lo, priceMax:pr.hi, contact:p.contact, userId:p.userId, status:'confirmed', staffId:null, createdAt:Date.now()};
      S.bookings.push(b); H.saveCar(p); save();
      return {ok:true, booking:clientBooking(b)};
    },
    cancelBooking: function(p){
      var b = S.bookings.find(function(x){ return x.id === p.id && x.userId === p.userId; });
      if(!b) return {ok:false, error:'not_found'};
      b.status = 'cancelled'; save(); return {ok:true};
    },
    getMyBookings: function(p){
      return {ok:true, bookings:S.bookings.filter(function(b){ return b.userId === p.userId; }).sort(function(a, b){ return (b.date + b.time).localeCompare(a.date + a.time); }).map(clientBooking)};
    },
    getMyProfile: function(p){
      var mine = S.bookings.filter(function(b){ return b.userId === p.userId; }).sort(function(a, b){ return b.createdAt - a.createdAt; });
      return {ok:true, profile:mine.length ? {name:mine[0].contact.name, phone:mine[0].contact.phone} : null};
    },
    getMyCars: function(p){
      return {ok:true, cars:S.cars.filter(function(c){ return c.userId === p.userId; }).sort(function(a, b){ return b.lastUsedAt - a.lastUsedAt; })};
    },
    saveCar: function(p){
      var num = String(p.car.number || '').trim().toUpperCase();
      var c = S.cars.find(function(x){ return x.userId === p.userId && (x.id === p.car.id || x.number === num); });
      if(c) Object.assign(c, {number:num, brand:p.car.brand || '', model:p.car.model || '', carClass:p.car.carClass, lastUsedAt:Date.now()});
      else { c = {id:id('car'), userId:p.userId, number:num, brand:p.car.brand || '', model:p.car.model || '', carClass:p.car.carClass, lastUsedAt:Date.now()}; S.cars.push(c); }
      save(); return {ok:true, car:c};
    },
    deleteCar: function(p){ S.cars = S.cars.filter(function(c){ return !(c.id === p.id && c.userId === p.userId); }); save(); return {ok:true}; },

    getBookings: function(p){
      var from = p.from || D.add(D.today(), -14), to = p.to || D.add(D.today(), 30);
      return {ok:true, bookings:S.bookings.filter(function(b){ return b.date >= from && b.date <= to; }).sort(function(a, b){ return (a.date + a.time).localeCompare(b.date + b.time); }).map(adminBooking)};
    },
    updateBookingStatus: function(p){ var b = S.bookings.find(function(x){ return x.id === p.id; }); if(!b) return {ok:false, error:'not_found'}; b.status = p.status; save(); return {ok:true}; },
    assignBookingStaff: function(p){ var b = S.bookings.find(function(x){ return x.id === p.id; }); if(!b) return {ok:false, error:'not_found'}; b.staffId = p.staffId || null; save(); return {ok:true}; },
    getShift: function(p){ var d = p.date || D.today(); return {ok:true, date:d, staffIds:S.shifts[d] || []}; },
    setShift: function(p){ S.shifts[p.date || D.today()] = p.staffIds || []; save(); return {ok:true}; },
    getDaySlots: function(p){ return {ok:true, slots:slotStates(p.date)}; },
    blockSlot: function(p){ if(!S.blocked.some(function(x){ return x.date === p.date && x.time === p.time; })) S.blocked.push({date:p.date, time:p.time}); save(); return {ok:true}; },
    unblockSlot: function(p){ S.blocked = S.blocked.filter(function(x){ return !(x.date === p.date && x.time === p.time); }); save(); return {ok:true}; },
    saveService: function(p){
      var it = p.item, ex = it.id && S.services.find(function(s){ return s.id === it.id; });
      if(ex) Object.assign(ex, {category:p.category, name:it.name, desc:it.desc || '', price:it.price, visible:it.visible !== false});
      else { ex = {id:id('svc'), category:p.category, name:it.name, desc:it.desc || '', price:it.price, visible:it.visible !== false, sort:S.services.length}; S.services.push(ex); }
      save(); return {ok:true, item:{id:ex.id, name:ex.name, desc:ex.desc, price:ex.price, visible:ex.visible}};
    },
    deleteService: function(p){ return del('services', p.id); },
    saveSchedule: function(p){ Object.keys(p.schedule).forEach(function(k){ S.schedule[k] = p.schedule[k]; }); save(); return {ok:true}; },
    addClosedDate: function(p){ if(S.closed.indexOf(p.date) < 0) S.closed.push(p.date); save(); return {ok:true}; },
    removeClosedDate: function(p){ S.closed = S.closed.filter(function(d){ return d !== p.date; }); save(); return {ok:true}; },

    getStaff: function(){ return {ok:true, staff:S.staff.map(staffOut)}; },
    saveStaff: function(p){ var s = Object.assign({}, p.staff); ['shiftsMonth','earnedMonth','paidMonth','accruedMonth'].forEach(function(k){ delete s[k]; }); if(s.active === undefined) s.active = true; return {ok:true, staff:staffOut(crud('staff', s, 'st'))}; },
    deleteStaff: function(p){ S.bookings.forEach(function(b){ if(b.staffId === p.id) b.staffId = null; }); return del('staff', p.id); },
    payStaff: function(p){
      var s = S.staff.find(function(x){ return x.id === p.staffId; }); if(!s) return {ok:false, error:'not_found'};
      if(!(p.amount > 0)) return {ok:false, error:'bad_request'};
      var pay = {id:id('pay'), staffId:s.id, amount:Number(p.amount), date:D.today()}; S.payouts.unshift(pay); save();
      return {ok:true, payout:pay, remainingAccrued:staffOut(s).accruedMonth};
    },
    getPayouts: function(p){ return {ok:true, payouts:S.payouts.filter(function(x){ return !p.staffId || x.staffId === p.staffId; })}; },
    getBays: function(){ return {ok:true, bays:S.bays}; },
    saveBay: function(p){ return {ok:true, bay:crud('bays', p.bay, 'bay')}; },
    deleteBay: function(p){ return del('bays', p.id); },
    getInventory: function(){ return {ok:true, items:S.inventory}; },
    saveInventoryItem: function(p){ return {ok:true, item:crud('inventory', p.item, 'inv')}; },
    deleteInventoryItem: function(p){ return del('inventory', p.id); },
    getShop: function(p){ return {ok:true, items:S.shop.filter(function(x){ return p.audience !== 'client' || (x.visible && x.stock > 0); })}; },
    saveShopItem: function(p){ return {ok:true, item:crud('shop', p.item, 'shop')}; },
    deleteShopItem: function(p){ return del('shop', p.id); },
    getOverview: function(){
      var t = D.today(), w = D.add(t, -6), ct = chartTop(w, t);
      return {ok:true, overview:{today:summary(t, t), week:summary(w, t), month:summary(t.slice(0, 8) + '01', t), prevWeek:summary(D.add(t, -13), D.add(t, -7))}, chart:ct.chart, topServices:ct.topServices};
    },
    getOverviewRange: function(p){ var ct = chartTop(p.from, p.to); return {ok:true, overview:{custom:summary(p.from, p.to)}, chart:ct.chart, topServices:ct.topServices}; }
  };

  return function(action, payload){
    if(!S) init();
    var h = H[action];
    return h ? h(payload || {}) : {ok:false, error:'unknown_action'};
  };
})();
