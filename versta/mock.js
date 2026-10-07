// изменено 2026-10-08 02:48
/* ============================================================
   mock.js — офлайн-двойник API ВЕРСТЫ (api/bots/versta.py).
   Один контракт на все шесть ролей; состояние в localStorage, общее
   для ролей в одном браузере (бронь клиента видна диспетчеру и
   водителю, поломка водителя — механику).
   Окно рейсов в моке: 14 дней назад и 7 вперёд.
   ============================================================ */
window.VerstaMock = (function(){
  "use strict";
  const KEY = 'tgs-mock-versta-v3';
  const D = Kit.date;
  const CORR = [
    ['M1', 22, [['Минск, Центральный автовокзал',0],['Барановичи, АВ',90],['Кобрин',165],['Брест, АВ',195]]],
    ['M5', 20, [['Минск, Восточный автовокзал',0],['Бобруйск, АВ',100],['Жлобин',150],['Гомель, АВ',205]]],
    ['M6', 21, [['Минск, Центральный автовокзал',0],['Ивенец',55],['Лида, АВ',150],['Гродно, АВ',215]]],
    ['M3', 19, [['Минск, Центральный автовокзал',0],['Плещеницы',60],['Лепель',130],['Витебск, АВ',200]]],
    ['M4', 16, [['Минск, Восточный автовокзал',0],['Червень',45],['Березино',80],['Могилёв, АВ',140]]]
  ];
  const OUT = ['06:20','08:45','14:15','19:40'], BACK = ['06:50','10:30','15:40','18:20'];
  const DRIVERS = [['dr1','Сергей Ковалёв','+375291234501'],['dr2','Алексей Дайнеко','+375297654302'],['dr3','Игорь Русак','+375445550103'],['dr4','Павел Шпак','+375333210004'],['dr5','Виктор Лис','+375296661205'],['dr6','Андрей Кот','+375257770406'],['dr7','Олег Сыч','+375291002007'],['dr8','Николай Бобр','+375447003008'],['dr9','Дмитрий Жук','+375335004009'],['dr10','Руслан Гайко','+375296005010']];
  const NAMES = ['Анна Ковалёва','Дмитрий Соколов','Ирина Петрова','Максим Гриб','Ольга Шевченко','Павел Литвин','Наталья Волк','Виктор Мороз','Екатерина Жук','Роман Савич','Татьяна Бондарь','Юлия Ракович'];
  const DOCS = ['ОСГО (автогражданка)','Гостехосмотр','Тахограф — калибровка','Огнетушитель — перезарядка','Аптечка — срок годности'];
  const CHECKLIST = ['Тормозная система и стояночный тормоз','Рулевое управление, отсутствие люфта','Шины: давление, износ, порезы','Внешние световые приборы и указатели','Стеклоочистители и омыватель','Ремни безопасности всех мест','Аптечка, огнетушитель, знак аварийной остановки','Отопитель салона, отсутствие посторонних запахов','Уровни: масло ДВС, охлаждающая и тормозная жидкость','Чистота салона и стёкол, зеркала, тахограф'];
  const city = n=> n.split(',')[0].trim();
  const pad = n=> (n < 10 ? '0' : '') + n;
  const hm = m=> pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60);
  const mins = t=> D.toMinutes(t);
  const nowMin = ()=> D.nowMinutes();
  function rng(seed){ let s = seed >>> 0; return ()=>{ s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  const pick = (r, a)=> a[Math.floor(r() * a.length)];
  const code = r=> pick(r, 'ABCEHKMPTX'.split('')) + pick(r, 'ABCEHKMPTX'.split('')) + (1000 + Math.floor(r() * 9000));
  let S = null;
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }

  function route(id){
    const r = S.routes.find(x=>x.id === id), c = CORR.find(x=>x[0] === r.code);
    let pts = c[2].map(p=>({name:p[0], offset:p[1]}));
    if(city(pts[0].name) !== r.from){ const tot = pts[pts.length - 1].offset; pts = pts.slice().reverse().map(p=>({name:p.name, offset:tot - p.offset})); }
    return {id:r.id, code:r.code, from:r.from, to:r.to, fullPrice:c[1], points:pts};
  }
  const seg = (rt, a, b)=> Math.max(5, Math.round((rt.points[b].offset - rt.points[a].offset) * rt.fullPrice / rt.points[rt.points.length - 1].offset));
  const filled = tid=> S.bookings.filter(b=>b.tripId === tid && b.status !== 'cancelled').reduce((a, b)=>a + b.seats, 0);
  const driver = id=> { const d = DRIVERS.find(x=>x[0] === id); return d ? {id:d[0], name:d[1], phone:d[2]} : null; };

  function tripOut(t, withB){
    const rt = route(t.routeId), f = filled(t.id), dur = rt.points[rt.points.length - 1].offset;
    const v = t.vehicle && S.fleet.find(x=>x.plate === t.vehicle);
    const o = {id:t.id, routeId:rt.id, code:rt.code, from:rt.from, to:rt.to, date:t.date, time:t.time, arrival:hm(mins(t.time) + dur), duration:dur,
      seatsTotal:t.seatsTotal, filled:f, free:Math.max(0, t.seatsTotal - f), fullPrice:rt.fullPrice, points:rt.points, cancelled:!!t.cancelled,
      driverStatus:t.driverStatus, alert:t.alert || null, driver:driver(t.driverId), vehicle:v ? {plate:v.plate, model:v.model, seats:v.seats} : null};
    if(withB) o.bookings = S.bookings.filter(b=>b.tripId === t.id && b.status !== 'cancelled').sort((a, b)=>a.pickupIdx - b.pickupIdx).map(b=>bShort(b, rt));
    return o;
  }
  function bShort(b, rt){ return {id:b.id, code:b.code, name:b.name, phone:b.phone, seats:b.seats, pickupIdx:b.pickupIdx, dropoffIdx:b.dropoffIdx, pickup:rt.points[b.pickupIdx].name, dropoff:rt.points[b.dropoffIdx].name, price:b.price, status:b.status}; }
  function bFull(b){
    const t = S.trips.find(x=>x.id === b.tripId), tr = tripOut(t), o = bShort(b, {points:tr.points}), dep = mins(t.time);
    return Object.assign(o, {tripId:t.id, route:tr.code, from:tr.from, to:tr.to, date:t.date, time:t.time, pickupTime:hm(dep + tr.points[b.pickupIdx].offset), dropoffTime:hm(dep + tr.points[b.dropoffIdx].offset),
      cancelled:b.status === 'cancelled' || tr.cancelled, tripCancelled:tr.cancelled, driverStatus:tr.driverStatus, driver:tr.driver, vehicle:tr.vehicle, createdAt:b.createdAt});
  }

  function genWindow(r, today, from, to){
    for(let off = from; off <= to; off++){
      const day = D.add(today, off), wd = (D.parse(day).getDay() + 6) % 7;
      S.templates.forEach(tp=>{
        if(!tp.active || tp.days.indexOf(wd) < 0) return;
        const id = 'T-' + day.replace(/-/g, '') + '-' + tp.routeId + '-' + tp.time.replace(':', '');
        if(S.trips.some(t=>t.id === id)) return;
        const rt = route(tp.routeId), dur = rt.points[rt.points.length - 1].offset;
        const t = {id, routeId:tp.routeId, date:day, time:tp.time, seatsTotal:tp.seatsTotal, driverId:null, vehicle:null, cancelled:false, driverStatus:'ожидание', alert:null, templateId:tp.id, seed:true};
        const tm = mins(tp.time);
        if(off < 0 || (off === 0 && tm + dur < nowMin())) t.driverStatus = 'завершён'; else if(off === 0 && tm <= nowMin()) t.driverStatus = 'в пути';
        S.trips.push(t);
        let dens = (wd === 4 || wd === 6) ? 1.25 : .9; if(off > 0) dens *= Math.max(.15, .8 - off * .1);
        const n = Math.floor(r() * dens * 8), past = off < 0 || (off === 0 && tm < nowMin() - 60), last = rt.points.length - 1;
        let f = 0;
        for(let i = 0; i < n; i++){
          const seats = r() < .7 ? 1 : 2; if(f + seats > 15) break;
          const a = r() < .4 ? Math.floor(r() * last) : 0, b = r() < .4 ? a + 1 + Math.floor(r() * (last - a)) : last;
          S.bookings.push({id:'B-' + Math.floor(r() * 1e10).toString(16), code:code(r), tripId:id, userId:null, name:pick(r, NAMES), phone:'+37529' + (1000000 + Math.floor(r() * 8999999)),
            seats, pickupIdx:a, dropoffIdx:b, price:seg(rt, a, b) * seats, status:past ? (r() < .07 ? 'не пришёл' : 'посажен') : 'ожидание', createdAt:D.add(day, -1) + 'T12:00:00'});
          f += seats;
        }
      });
      assignDay(r, day, today);
    }
  }
  // водители и машины без пересечений по времени (+40 минут на отдых)
  function assignDay(r, day, today){
    const busyD = {}, busyV = {}, inService = ['AI 1234-7','AI 5821-7','AI 7743-7','AI 6604-7'], all = inService.concat(['AI 0092-7','AI 3310-7']);
    DRIVERS.forEach(d=> busyD[d[0]] = 0); all.forEach(p=> busyV[p] = 0);
    S.trips.filter(t=>t.date === day && t.seed && !t.driverId).sort((a, b)=>a.time.localeCompare(b.time)).forEach(t=>{
      if(day >= today && r() < .12) return;
      const rt = route(t.routeId), start = mins(t.time), end = start + rt.points[rt.points.length - 1].offset + 40;
      const fd = Object.keys(busyD).filter(k=>busyD[k] <= start); if(!fd.length) return;
      const d = pick(r, fd), fv = (day < today ? all : inService).filter(p=>busyV[p] <= start), v = fv.length ? pick(r, fv) : null;
      busyD[d] = end; if(v) busyV[v] = end; t.driverId = d; t.vehicle = v;
    });
  }
  function init(){
    try{ S = JSON.parse(localStorage.getItem(KEY) || 'null'); }catch(e){ S = null; }
    const today = D.today();
    if(S && S.day === today) return;
    if(S){
      S.trips.forEach(t=>{ if(t.date < today && !t.cancelled) t.driverStatus = 'завершён'; });
      S.bookings.forEach(b=>{ if(b.status === 'ожидание'){ const t = S.trips.find(x=>x.id === b.tripId); if(t && t.date < today) b.status = 'посажен'; } });
      genWindow(rng(Date.now() & 0xffff), today, -14, 7);
      const old = D.add(today, -20); S.trips = S.trips.filter(t=>t.date >= old); const ids = new Set(S.trips.map(t=>t.id)); S.bookings = S.bookings.filter(b=>ids.has(b.tripId));
      S.day = today; save(); return;
    }
    S = {day:today, routes:[], templates:[], trips:[], bookings:[], seq:{defect:1051, waybill:419}};
    CORR.forEach(c=>{
      const a = city(c[2][0][0]), b = city(c[2][c[2].length - 1][0]);
      S.routes.push({id:c[0] + 'f', code:c[0], from:a, to:b}, {id:c[0] + 'b', code:c[0], from:b, to:a});
      OUT.forEach(t=> S.templates.push({id:'tp-' + c[0] + 'f-' + t.slice(0, 2), routeId:c[0] + 'f', time:t, seatsTotal:16, days:[0,1,2,3,4,5,6], active:true}));
      BACK.forEach(t=> S.templates.push({id:'tp-' + c[0] + 'b-' + t.slice(0, 2), routeId:c[0] + 'b', time:t, seatsTotal:16, days:[0,1,2,3,4,5,6], active:true}));
    });
    const doc = arr=> { const o = {}; DOCS.forEach((k, i)=> o[k] = D.add(today, arr[i])); return o; };
    S.fleet = [
      {plate:'AI 1234-7', model:'Mercedes-Benz Sprinter', year:2019, seats:16, odo:341987, status:'в строю', repairNote:'', docs:doc([74,188,410,19,150]), lastService:{km:335000, date:D.add(today, -24), text:'ТО, полный объём'}},
      {plate:'AI 5821-7', model:'Mercedes-Benz Sprinter', year:2021, seats:16, odo:268450, status:'в строю', repairNote:'', docs:doc([-3,96,300,120,60]), lastService:{km:255000, date:D.add(today, -40), text:'ТО + замена передних колодок'}},
      {plate:'AI 0092-7', model:'Ford Transit', year:2018, seats:18, odo:402300, status:'в ремонте', repairNote:'Замена комплекта сцепления — заявка D-1042', docs:doc([40,12,210,90,200]), lastService:{km:390000, date:D.add(today, -70), text:'ТО, полный объём'}},
      {plate:'AI 7743-7', model:'Mercedes-Benz Sprinter', year:2020, seats:16, odo:288300, status:'в строю', repairNote:'', docs:doc([150,250,500,240,330]), lastService:{km:285000, date:D.add(today, -12), text:'ТО, полный объём'}},
      {plate:'AI 3310-7', model:'Peugeot Boxer', year:2017, seats:19, odo:375640, status:'ожидает з/ч', repairNote:'Ожидается моторчик отопителя — заявка D-1049', docs:doc([58,9,120,70,-10]), lastService:{km:358000, date:D.add(today, -95), text:'ТО + замена ремня ГРМ'}},
      {plate:'AI 6604-7', model:'Volkswagen Crafter', year:2022, seats:18, odo:96120, status:'в строю', repairNote:'', docs:doc([210,390,600,300,400]), lastService:{km:90000, date:D.add(today, -30), text:'Гарантийное ТО-1 у дилера'}}];
    S.reg = [['AI 3310-7','ТО — полный объём',15000,358000],['AI 3310-7','Тормозные колодки, передние',30000,347000],['AI 3310-7','Сезонная замена шин',null,null,182,-150],['AI 5821-7','ТО — полный объём',15000,255000],['AI 5821-7','Замена масла ДВС и фильтров',10000,262000],['AI 1234-7','ТО — полный объём',15000,335000],['AI 1234-7','Замена тормозной жидкости',null,null,730,-672],['AI 7743-7','ТО — полный объём',15000,285000],['AI 7743-7','Ремень ГРМ + ролики',90000,210000],['AI 6604-7','Гарантийное ТО-2 (дилер)',15000,90000],['AI 0092-7','ТО — полный объём',15000,390000]]
      .map((x, i)=>({id:'rg' + (i + 1), plate:x[0], kind:x[1], everyKm:x[2], lastKm:x[3], everyDays:x[4] || null, lastDate:x[5] != null ? D.add(today, x[5]) : null}));
    const L = (a, w, t)=>({t:D.add(today, a), who:w, text:t});
    S.defects = [
      {id:'D-1042', plate:'AI 0092-7', opened:D.add(today, -2), closed:null, source:'водитель', reporter:'Павел Шпак', ctx:'рейс M4 08:45 Минск → Могилёв', title:'Пробуксовка сцепления, педаль проваливается', detail:'При переключении на 3–4 передачу обороты растут, скорость не набирается. Запах гари.', priority:'критично', status:'в работе', parts:'Комплект сцепления LUK', downtime:3, log:[L(-2,'Диспетчер','Рейс снят, ТС отбуксировано в парк'), L(-1,'Механик','Износ ведомого диска, заказан комплект сцепления')]},
      {id:'D-1048', plate:'AI 6604-7', opened:today, closed:null, source:'водитель', reporter:'Игорь Русак', ctx:'выезд из парка, рейс M6 08:45', title:'Стук в передней подвеске справа', detail:'На скорости от 60 км/ч по ямам металлический стук спереди справа.', priority:'критично', status:'новая', parts:'', downtime:0, log:[]},
      {id:'D-1049', plate:'AI 3310-7', opened:D.add(today, -1), closed:null, source:'плановый осмотр', reporter:'Механик', ctx:'плановый осмотр парка', title:'Не работает отопитель салона', detail:'Печка не подаёт тёплый воздух.', priority:'плановая', status:'в работе', parts:'Моторчик вентилятора отопителя', downtime:0, log:[L(-1,'Механик','Заказан моторчик')]},
      {id:'D-1051', plate:'AI 7743-7', opened:today, closed:null, source:'водитель', reporter:'Павел Шпак', ctx:'рейс M4 06:20 Минск → Могилёв', title:'Задняя дверь закрывается со второго раза', detail:'Нижний фиксатор замка подклинивает.', priority:'плановая', status:'новая', parts:'', downtime:0, log:[]},
      {id:'D-1030', plate:'AI 1234-7', opened:D.add(today, -6), closed:D.add(today, -5), source:'плановый осмотр', reporter:'Механик', ctx:'предрейсовый осмотр', title:'Люфт рулевого колеса', detail:'Люфт на грани нормы.', priority:'плановая', status:'устранено', parts:'—', downtime:0, log:[L(-6,'Механик','Подтяжка рулевого редуктора'), L(-5,'Механик','Люфт в норме, заявка закрыта')]}];
    S.shifts = {}; S.shifts[today] = [
      {plate:'AI 1234-7', driverId:'dr1', first:'06:20 · M1 Минск → Брест', trips:2, insp:{status:'допущен', time:'05:38', odo:341987, waybill:'ПЛ-000418', note:''}},
      {plate:'AI 7743-7', driverId:'dr4', first:'06:20 · M4 Минск → Могилёв', trips:3, insp:{status:'допущен', time:'05:44', odo:288300, waybill:'ПЛ-000419', note:'Долит омыватель'}},
      {plate:'AI 5821-7', driverId:'dr2', first:'08:45 · M5 Минск → Гомель', trips:2, insp:null},
      {plate:'AI 6604-7', driverId:'dr3', first:'08:45 · M6 Минск → Гродно', trips:2, insp:{status:'не допущен', time:'07:05', odo:96120, waybill:null, note:'Стук в передней подвеске справа. На линию не выпускать.', defectId:'D-1048'}},
      {plate:'AI 3310-7', driverId:null, first:'14:15 · M3 Минск → Витебск', trips:1, insp:null}];
    const R = (a)=> a.map((x, i)=>({id:'r' + i, from:x[0], to:x[1], price:x[2]}));
    S.tenants = [
      {id:'tn1', name:'ВЕРСТА Минск', city:'Минск', status:'активен', commission:12, joined:'2026-03-14', routes:R([['Минск','Брест',22],['Минск','Гомель',20],['Минск','Гродно',21],['Минск','Витебск',19],['Минск','Могилёв',16]]), drivers:DRIVERS.slice(0, 4).map((d, i)=>({id:'d' + i, name:d[1], phone:d[2]})), vehicles:[['AI 1234-7','Mercedes Sprinter',16],['AI 5821-7','Mercedes Sprinter',16],['AI 0092-7','Ford Transit',18],['AI 7743-7','Mercedes Sprinter',16]].map((v, i)=>({id:'v' + i, plate:v[0], model:v[1], seats:v[2]}))},
      {id:'tn2', name:'Гродно-Экспресс', city:'Гродно', status:'активен', commission:15, joined:'2026-05-02', routes:R([['Гродно','Лида',18],['Гродно','Слоним',14],['Гродно','Ивье',12]]), drivers:[{id:'d0', name:'Виктор Янковский', phone:'+375296001122'},{id:'d1', name:'Дмитрий Реут', phone:'+375296003344'}], vehicles:[{id:'v0', plate:'AK 3311-4', model:'Mercedes Vito', seats:14},{id:'v1', plate:'AK 9087-4', model:'Ford Transit', seats:16}]},
      {id:'tn3', name:'Полесье Тревел', city:'Брест', status:'активен', commission:10, joined:'2026-06-18', routes:R([['Брест','Пинск',16],['Брест','Кобрин',8],['Пинск','Столин',11],['Брест','Иваново',10]]), drivers:[{id:'d0', name:'Николай Ковальчук', phone:'+375297001100'},{id:'d1', name:'Андрей Пилипчук', phone:'+375297002200'},{id:'d2', name:'Сергей Бондарук', phone:'+375297003300'}], vehicles:[{id:'v0', plate:'AE 2201-1', model:'Mercedes Sprinter', seats:16},{id:'v1', plate:'AE 4456-1', model:'Peugeot Boxer', seats:16},{id:'v2', plate:'AE 8890-1', model:'Mercedes Vito', seats:14}]},
      {id:'tn4', name:'Витебск Авто', city:'Витебск', status:'приостановлен', commission:14, joined:'2026-01-20', routes:R([['Витебск','Полоцк',13],['Витебск','Орша',10]]), drivers:[{id:'d0', name:'Олег Мельник', phone:'+375298001100'},{id:'d1', name:'Виталий Гром', phone:'+375298002200'}], vehicles:[{id:'v0', plate:'AB 1120-2', model:'Ford Transit', seats:18},{id:'v1', plate:'AB 5567-2', model:'Mercedes Sprinter', seats:16}]},
      {id:'tn5', name:'Могилёв Линии', city:'Могилёв', status:'подключается', commission:12, joined:'2026-07-19', routes:[], drivers:[], vehicles:[]}];
    genWindow(rng(5), today, -14, 7);
    save();
  }
  const ok = x=> Object.assign({ok:true}, x || {});
  const err = (c, m)=> ({ok:false, error:c, message:m});
  const trip = id=> S.trips.find(t=>t.id === id);
  function regState(it, odo){
    if(it.everyKm){ const due = it.lastKm + it.everyKm, rem = due - odo; return {overdue:rem < 0, soon:rem >= 0 && rem < 1500, remainKm:rem, dueKm:due, estDays:Math.round(rem / 420)}; }
    const dd = D.add(it.lastDate, it.everyDays), rd = D.diff(D.today(), dd); return {overdue:rd < 0, soon:rd >= 0 && rd < 14, remainDays:rd, dueDate:dd, estDays:rd};
  }
  function vehOut(v){
    return Object.assign({}, v, {docs:Object.keys(v.docs).map(k=>({name:k, until:v.docs[k], days:D.diff(D.today(), v.docs[k])})),
      reg:S.reg.filter(r=>r.plate === v.plate).map(r=>Object.assign(regState(r, v.odo), {id:r.id, kind:r.kind, everyKm:r.everyKm, everyDays:r.everyDays})),
      openDefects:S.defects.filter(d=>d.plate === v.plate && d.status !== 'устранено' && d.status !== 'отклонено').length});
  }
  function newDefect(plate, title, detail, priority, source, reporter, ctx){
    S.seq.defect++; const d = {id:'D-' + S.seq.defect, plate, opened:D.today(), closed:null, source, reporter, ctx:ctx || '', title, detail:detail || '', priority, status:'новая', parts:'', downtime:0, log:[]};
    S.defects.unshift(d); return d.id;
  }
  function tenantOut(t){
    let rev, trips;
    if(t.id === 'tn1'){ const from = D.add(D.today(), -29); const ids = new Set(S.trips.filter(x=>x.date >= from && x.date <= D.today() && !x.cancelled).map(x=>x.id)); rev = S.bookings.filter(b=>ids.has(b.tripId) && b.status === 'посажен').reduce((a, b)=>a + b.price, 0); trips = ids.size; }
    else { const h = t.name.split('').reduce((a, c)=>a + c.charCodeAt(0), 0); const k = t.status === 'приостановлен' ? .2 : 1; rev = t.status === 'подключается' ? 0 : (2400 + h * 37 % 9000) * k; trips = t.status === 'подключается' ? 0 : Math.round((40 + h % 120) * k); }
    return Object.assign({}, t, {stats:{revenue:Math.round(rev), trips, commission:Math.round(rev * t.commission / 100)}});
  }

  const H = {
    getDirections(){ const c = {}; S.routes.forEach(r=>{ (c[r.from] = c[r.from] || []).push(r.to); }); return ok({cities:Object.keys(c).sort(), connections:c, popular:S.routes.filter(r=>/f$/.test(r.id)).map(r=>[r.from, r.to]), maxSeats:6}); },
    getTrips(p){
      const r = S.routes.find(x=>x.from === p.from && x.to === p.to); if(!r) return ok({route:null, trips:[]});
      const rt = route(r.id), t0 = D.today();
      return ok({route:rt, trips:S.trips.filter(t=>t.routeId === r.id && t.date === p.date && !t.cancelled).sort((a, b)=>a.time.localeCompare(b.time)).map(t=>{ const o = tripOut(t); delete o.points; o.departed = p.date < t0 || (p.date === t0 && mins(t.time) <= nowMin()); return o; })});
    },
    createBooking(p){
      const t = trip(p.tripId); if(!t || t.cancelled) return err('not_found');
      const rt = route(t.routeId), last = rt.points.length - 1;
      if(!(p.dropoffIdx > p.pickupIdx) || p.pickupIdx < 0 || p.dropoffIdx > last) return err('bad_request', 'Высадка должна быть после посадки');
      if(!(p.seats >= 1 && p.seats <= 6)) return err('bad_request');
      if(!/^\+375\d{9}$/.test(p.phone || '')) return err('bad_request', 'Телефон');
      if(t.date < D.today() || (t.date === D.today() && mins(t.time) + rt.points[p.pickupIdx].offset <= nowMin())) return err('departed', 'Маршрутка уже ушла');
      if(filled(t.id) + p.seats > t.seatsTotal) return err('no_seats', 'Свободных мест меньше, чем нужно');
      const b = {id:Kit.uid('B'), code:code(Math.random), tripId:t.id, userId:p.userId, name:p.name, phone:p.phone, seats:p.seats, pickupIdx:p.pickupIdx, dropoffIdx:p.dropoffIdx, price:seg(rt, p.pickupIdx, p.dropoffIdx) * p.seats, status:'ожидание', createdAt:new Date().toISOString()};
      S.bookings.push(b); save(); return ok({booking:bFull(b)});
    },
    getMyBookings(p){ return ok({bookings:S.bookings.filter(b=>b.userId === p.userId).map(bFull).sort((a, b)=>(b.date + b.time).localeCompare(a.date + a.time))}); },
    cancelBooking(p){ const b = S.bookings.find(x=>x.id === p.id && x.userId === p.userId); if(!b) return err('not_found'); if(b.status !== 'ожидание') return err('bad_state'); b.status = 'cancelled'; save(); return ok(); },
    getRefs(){ return ok({routes:S.routes.map(r=>{ const x = route(r.id); delete x.points; return x; }), drivers:DRIVERS.map(d=>({id:d[0], name:d[1], phone:d[2]})), vehicles:S.fleet.map(v=>({plate:v.plate, model:v.model, seats:v.seats, status:v.status}))}); },
    getDay(p){
      const day = p.date || D.today();
      const list = S.trips.filter(t=>t.date === day).sort((a, b)=>a.time.localeCompare(b.time) || a.routeId.localeCompare(b.routeId)).map(t=>{ const o = tripOut(t); delete o.points; o.passengers = S.bookings.filter(b=>b.tripId === t.id && b.status !== 'cancelled').length; return o; });
      const act = list.filter(t=>!t.cancelled);
      return ok({date:day, trips:list, stats:{trips:act.length, seats:act.reduce((a, t)=>a + t.filled, 0), capacity:act.reduce((a, t)=>a + t.seatsTotal, 0), noDriver:act.filter(t=>!t.driver).length, alerts:act.filter(t=>t.alert).length}});
    },
    getTrip(p){ const t = trip(p.id); return t ? ok({trip:tripOut(t, true)}) : err('not_found'); },
    updateTrip(p){
      const t = trip(p.id); if(!t) return err('not_found');
      if('driverId' in p) t.driverId = p.driverId || null;
      if('vehicle' in p) t.vehicle = p.vehicle || null;
      if('cancelled' in p) t.cancelled = !!p.cancelled;
      if(p.dismissAlert) t.alert = null;
      save(); return ok({trip:tripOut(t, true)});
    },
    setBookingStatus(p){ const b = S.bookings.find(x=>x.id === p.id && x.status !== 'cancelled'); if(!b) return err('not_found'); b.status = p.status; save(); return ok(); },
    getTemplates(){ return ok({templates:S.templates.map(tp=>{ const r = route(tp.routeId); return Object.assign({}, tp, {code:r.code, from:r.from, to:r.to}); })}); },
    saveTemplate(p){
      if(!p.days || !p.days.length) return err('bad_request', 'Выберите дни');
      let tp = p.id && S.templates.find(x=>x.id === p.id);
      if(tp) Object.assign(tp, {routeId:p.routeId, time:p.time, seatsTotal:p.seatsTotal, days:p.days, active:p.active !== false});
      else { tp = {id:Kit.uid('tp'), routeId:p.routeId, time:p.time, seatsTotal:p.seatsTotal, days:p.days, active:p.active !== false}; S.templates.push(tp); }
      let n = 0;
      if(tp.active) for(let off = 0; off < 8; off++){
        const day = D.add(D.today(), off), wd = (D.parse(day).getDay() + 6) % 7;
        if(tp.days.indexOf(wd) < 0 || (off === 0 && mins(tp.time) <= nowMin())) continue;
        const id = 'T-' + day.replace(/-/g, '') + '-' + tp.routeId + '-' + tp.time.replace(':', '');
        if(!S.trips.some(t=>t.routeId === tp.routeId && t.date === day && t.time === tp.time)){ S.trips.push({id, routeId:tp.routeId, date:day, time:tp.time, seatsTotal:tp.seatsTotal, driverId:null, vehicle:null, cancelled:false, driverStatus:'ожидание', alert:null, templateId:tp.id}); n++; }
      }
      save(); const r = route(tp.routeId); return ok({template:Object.assign({}, tp, {code:r.code, from:r.from, to:r.to}), tripsCreated:n});
    },
    deleteTemplate(p){
      S.trips = S.trips.filter(t=> !(t.templateId === p.id && t.date > D.today() && !S.bookings.some(b=>b.tripId === t.id && b.status !== 'cancelled')));
      S.templates = S.templates.filter(x=>x.id !== p.id); save(); return ok();
    },
    getBookings(p){
      const from = p.date || D.add(D.today(), -1), to = p.date || D.add(D.today(), 3);
      return ok({bookings:S.bookings.filter(b=>{ const t = trip(b.tripId); return t && t.date >= from && t.date <= to; }).map(bFull).sort((a, b)=>(a.date + a.time).localeCompare(b.date + b.time)).slice(0, 400)});
    },
    getDrivers(){ return ok({drivers:DRIVERS.map(d=>({id:d[0], name:d[1], phone:d[2], tripsToday:S.trips.filter(t=>t.driverId === d[0] && t.date === D.today() && !t.cancelled).length}))}); },
    getDriverTrips(p){ const t1 = D.add(D.today(), 1); return ok({trips:S.trips.filter(t=>t.driverId === p.driverId && t.date >= D.today() && t.date <= t1).sort((a, b)=>(a.date + a.time).localeCompare(b.date + b.time)).map(t=>tripOut(t, true))}); },
    setDriverStatus(p){
      const t = trip(p.id); if(!t) return err('not_found'); t.driverStatus = p.status;
      if(p.status === 'завершён'){ S.bookings.forEach(b=>{ if(b.tripId === t.id && b.status === 'ожидание') b.status = 'не пришёл'; }); const v = S.fleet.find(x=>x.plate === t.vehicle); if(v) v.odo += Math.round(route(t.routeId).points.slice(-1)[0].offset * 1.15); }
      save(); return ok();
    },
    driverAlert(p){
      const t = trip(p.tripId); if(!t) return err('not_found');
      if(!p.type){ t.alert = null; save(); return ok({alert:null}); }
      const n = new Date(), al = {type:p.type, time:pad(n.getHours()) + ':' + pad(n.getMinutes())};
      if(p.type === 'поломка' && t.vehicle){ const r = route(t.routeId), d = driver(t.driverId); al.defectId = newDefect(t.vehicle, p.note || 'Водитель сообщил о поломке на рейсе', '', 'критично', 'водитель', d ? d.name : 'Водитель', 'рейс ' + r.code + ' ' + t.time + ' ' + r.from + ' → ' + r.to); }
      t.alert = al; save(); return ok({alert:al});
    },
    getFleet(){ return ok({fleet:S.fleet.map(vehOut), dailyKm:420}); },
    updateVehicle(p){
      const v = S.fleet.find(x=>x.plate === p.plate); if(!v) return err('not_found');
      if(p.status) v.status = p.status; if('repairNote' in p) v.repairNote = p.repairNote; if(v.status === 'в строю') v.repairNote = '';
      if(p.odo && p.odo >= v.odo) v.odo = p.odo; if(p.doc) v.docs[p.doc.name] = p.doc.until;
      save(); return ok({vehicle:vehOut(v)});
    },
    getRelease(){
      const t = D.today(); if(!S.shifts[t]) S.shifts[t] = [];
      const plates = S.shifts[t].map(s=>s.plate);
      return ok({shifts:S.shifts[t].map(s=>{ const v = S.fleet.find(x=>x.plate === s.plate), d = driver(s.driverId); return Object.assign({}, s, {driver:d ? d.name : null, model:v.model, seats:v.seats, odo:v.odo}); }),
        idle:S.fleet.filter(v=>plates.indexOf(v.plate) < 0).map(v=>v.plate), checklist:CHECKLIST, driverAlerts:S.defects.filter(d=>d.source === 'водитель' && d.opened === t).length});
    },
    inspect(p){
      const s = (S.shifts[D.today()] || []).find(x=>x.plate === p.plate), v = S.fleet.find(x=>x.plate === p.plate); if(!s || !v) return err('not_found');
      const n = new Date(), ins = {status:p.passed ? 'допущен' : 'не допущен', time:pad(n.getHours()) + ':' + pad(n.getMinutes()), odo:p.odo, note:p.note || '', waybill:null, failed:p.failed || []};
      if(p.passed){ S.seq.waybill++; ins.waybill = 'ПЛ-' + String(S.seq.waybill).padStart(6, '0'); }
      else { const d = driver(s.driverId); ins.defectId = newDefect(p.plate, p.note || (ins.failed[0] || 'Не допущен к выпуску'), ins.failed.join(', '), 'критично', 'выпуск на линию', 'Механик', 'предрейсовый осмотр, водитель ' + (d ? d.name : '—')); }
      s.insp = ins; if(p.odo > v.odo) v.odo = p.odo; save(); return ok({insp:ins});
    },
    getDefects(){ return ok({defects:S.defects.slice().sort((a, b)=> ((a.status === 'устранено' || a.status === 'отклонено') - (b.status === 'устранено' || b.status === 'отклонено')) || ((a.priority === 'плановая') - (b.priority === 'плановая')) || b.opened.localeCompare(a.opened))}); },
    createDefect(p){ const id = newDefect(p.plate, p.title, p.detail, p.priority, 'плановый осмотр', 'Механик', p.ctx); save(); return ok({defect:S.defects.find(d=>d.id === id)}); },
    updateDefect(p){
      const d = S.defects.find(x=>x.id === p.id); if(!d) return err('not_found');
      if(p.note) d.log.push({t:D.today(), who:'Механик', text:p.note});
      if(p.status && p.status !== d.status){ d.log.push({t:D.today(), who:'Механик', text:'Статус: ' + p.status}); d.status = p.status; }
      if('parts' in p) d.parts = p.parts;
      if((d.status === 'устранено' || d.status === 'отклонено') && !d.closed) d.closed = D.today();
      const v = S.fleet.find(x=>x.plate === d.plate);
      if(v && d.status === 'устранено' && !S.defects.some(x=>x.plate === d.plate && x.priority === 'критично' && x.status !== 'устранено' && x.status !== 'отклонено')){ v.status = 'в строю'; v.repairNote = ''; }
      else if(v && d.priority === 'критично' && (d.status === 'в работе' || d.status === 'ожидает з/ч')){ v.status = d.status === 'в работе' ? 'в ремонте' : 'ожидает з/ч'; v.repairNote = d.title + ' — заявка ' + d.id; }
      save(); return ok({defect:d});
    },
    regDone(p){ const it = S.reg.find(x=>x.id === p.id); if(!it) return err('not_found'); const v = S.fleet.find(x=>x.plate === it.plate), km = p.km || v.odo; if(it.everyKm) it.lastKm = km; else it.lastDate = D.today(); v.lastService = {km, date:D.today(), text:p.note || it.kind}; save(); return ok(); },
    getOwnerStats(p){
      const days = p.days || 7, from = D.add(D.today(), -(days - 1)), DOW = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
      const trips = S.trips.filter(t=>t.date >= from && t.date <= D.today() && !t.cancelled), daily = {}, ra = {}, da = {}; let cap = 0, fil = 0;
      trips.forEach(t=>{
        const bs = S.bookings.filter(b=>b.tripId === t.id && b.status !== 'cancelled'), rev = bs.filter(b=>b.status === 'посажен').reduce((a, b)=>a + b.price, 0), seats = bs.reduce((a, b)=>a + b.seats, 0);
        daily[t.date] = (daily[t.date] || 0) + rev; cap += t.seatsTotal; fil += seats;
        const r = ra[t.routeId] = ra[t.routeId] || {revenue:0, filled:0, cap:0, trips:0}; r.revenue += rev; r.filled += seats; r.cap += t.seatsTotal; r.trips++;
        if(t.driverId){ const d = da[t.driverId] = da[t.driverId] || {trips:0, passengers:0, noShows:0, filled:0, cap:0, revenue:0}; d.trips++; d.passengers += bs.filter(b=>b.status === 'посажен').reduce((a, b)=>a + b.seats, 0); d.noShows += bs.filter(b=>b.status === 'не пришёл').length; d.filled += seats; d.cap += t.seatsTotal; d.revenue += rev; }
      });
      const chart = []; for(let i = 0; i < days; i++){ const d = D.add(from, i); chart.push({date:d, dow:DOW[D.parse(d).getDay()], revenue:Math.round(daily[d] || 0)}); }
      return ok({days, chart, totalRevenue:chart.reduce((a, c)=>a + c.revenue, 0), todayRevenue:chart[chart.length - 1].revenue,
        todayBookings:S.bookings.filter(b=>{ const t = trip(b.tripId); return t && t.date === D.today() && b.status !== 'cancelled'; }).length, avgOccupancy:cap ? Math.round(fil / cap * 100) : 0,
        routes:Object.keys(ra).map(k=>{ const r = route(k); return {code:r.code, from:r.from, to:r.to, revenue:Math.round(ra[k].revenue), occ:Math.round(ra[k].filled / ra[k].cap * 100), trips:ra[k].trips}; }).sort((a, b)=>b.revenue - a.revenue),
        drivers:Object.keys(da).map(k=>{ const d = driver(k), x = da[k]; return {id:k, name:d.name, trips:x.trips, passengers:x.passengers, noShows:x.noShows, occ:Math.round(x.filled / x.cap * 100), revenue:Math.round(x.revenue)}; }).sort((a, b)=>b.passengers - a.passengers)});
    },
    getTenants(){ return ok({tenants:S.tenants.slice().sort((a, b)=>a.joined.localeCompare(b.joined)).map(tenantOut)}); },
    saveTenant(p){
      const t = p.tenant; if(!t.name || !t.city) return err('bad_request'); if(!(t.commission >= 0 && t.commission <= 50)) return err('bad_request', 'Комиссия 0–50%');
      let x = t.id && S.tenants.find(y=>y.id === t.id);
      const data = {name:t.name, city:t.city, status:t.status || 'подключается', commission:+t.commission, routes:t.routes || [], drivers:t.drivers || [], vehicles:t.vehicles || []};
      if(x) Object.assign(x, data); else { x = Object.assign({id:Kit.uid('tn'), joined:D.today()}, data); S.tenants.push(x); }
      save(); return ok({tenant:tenantOut(x)});
    }
  };
  return function(action, payload){
    if(!S) init();
    const h = H[action];
    return h ? h(payload || {}) : {ok:false, error:'unknown_action'};
  };
})();
