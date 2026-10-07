// изменено 2026-10-08 02:57
/* ============================================================
   mock.js — офлайн-двойник API барбершопа (api/bots/barbershop.py).
   Сетка 20 минут, запись занимает длительность услуги. Состояние в
   localStorage, общее для client/admin/owner в одном браузере.
   ============================================================ */
window.BarberMock = (function(){
  "use strict";
  const KEY = 'tgs-mock-barbershop-v2';
  const D = Kit.date;
  const OPEN = 600, CLOSE = 1260, SUN_OPEN = 660, SUN_CLOSE = 1140, STEP = 20, AHEAD = 14;
  const BARBERS = [
    ['b1','Игорь Соколов','Классика и опасная бритва','8 лет за креслом','#B08D57',4.9,'Работает по классической школе — ножницы, филировка, горячее полотенце перед бритьём. Тишина или разговор — как вам удобнее.'],
    ['b2','Артём Волков','Фейды и текстурные стрижки','5 лет за креслом','#7A1E2C',4.8,'Чёткие переходы и современные формы. Смотрит референсы и честно скажет, что подойдёт под форму лица.'],
    ['b3','Максим Орлов','Бороды и усы','6 лет за креслом','#4F6B4A',4.9,'Оформление и уход за бородой — от лёгкой коррекции до полного скульптурирования по форме лица.'],
    ['b4','Денис Крылов','Детские и семейные стрижки','4 года за креслом','#8A6A3A',4.7,'Терпеливо работает с детьми и найдёт подход даже к тем, кто стрижку не любит. Отцы с сыновьями — без очереди друг за другом.']];
  const SERVICES = [['s1','Стрижка машинкой',30,26,'Одна или две насадки, окантовка, мытьё головы.'],['s2','Стрижка ножницами',40,38,'Классическая или современная форма, укладка.'],['s3','Стрижка + борода',60,55,'Комплекс: стрижка и оформление бороды, горячее полотенце.'],['s4','Королевское бритьё',40,38,'Опасная бритва, распаривание, компресс и бальзам.'],['s5','Оформление бороды',20,30,'Форма, окантовка, масло для бороды.'],['s6','Детская стрижка',30,25,'До 12 лет. Мультики на планшете — в комплекте.'],['s7','Камуфляж седины',20,28,'Тонирование волос или бороды, 5–10 минут выдержки.']];
  const CLIENTS = ['Павел Гриц','Роман Зайцев','Илья Швец','Никита Бык','Сергей Дуб','Егор Линь','Антон Вербицкий','Глеб Санько','Кирилл Ус','Вадим Король','Тимур Ясин','Олег Пинчук'];
  const DOW = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  const pad = n=> (n < 10 ? '0' : '') + n;
  const hm = m=> pad(Math.floor(m / 60)) + ':' + pad(m % 60);
  const wd = day=> (D.parse(day).getDay() + 6) % 7;
  const hours = day=> wd(day) === 6 ? [SUN_OPEN, SUN_CLOSE] : [OPEN, CLOSE];
  const nowMin = ()=> D.nowMinutes();
  function rng(seed){ let s = seed >>> 0; return ()=>{ s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  let S = null;
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }
  const isOff = (bid, day)=> S.off.indexOf(bid + '|' + day) > -1;
  function busy(bid, day, ex){ return S.bookings.filter(b=>b.barberId === bid && b.date === day && b.id !== ex && (b.status === 'wait' || b.status === 'chair' || b.status === 'done')).map(b=>[b.start, b.start + b.dur]); }
  function free(bid, day, dur, after){
    if(isOff(bid, day)) return [];
    const [o, c] = hours(day), bz = busy(bid, day), out = [];
    for(let s = o; s <= c - dur; s += STEP){ if(s <= after) continue; if(bz.every(([a, b])=> s >= b || s + dur <= a)) out.push(s); }
    return out;
  }
  function barberOut(b){ return {id:b.id, name:b.name, spec:b.spec, exp:b.exp, bio:b.bio, color:b.color, rating:b.rating, initials:b.name.split(' ').map(w=>w[0]).join('').slice(0, 2).toUpperCase(), active:b.active, pct:b.pct}; }
  function bOut(r){ const b = S.barbers.find(x=>x.id === r.barberId); return {id:r.id, barberId:r.barberId, barber:b ? b.name : '—', serviceId:r.serviceId, service:r.service, date:r.date, time:hm(r.start), end:hm(r.start + r.dur), dur:r.dur, price:r.price, client:r.client, phone:r.phone, status:r.status, source:r.source, createdAt:r.createdAt}; }
  function seedDays(r, today, from, to){
    const pool = []; S.services.forEach(s=>{ const w = {s1:5, s2:4, s3:4, s4:2, s5:3, s6:2, s7:1}[s.id] || 1; for(let i = 0; i < w; i++) pool.push(s); });
    for(let off = from; off <= to; off++){
      const day = D.add(today, off), w = wd(day);
      let load = {4:.85, 5:.92, 6:.55}[w] || .62; if(off > 0) load *= Math.max(.2, .85 - off * .08);
      S.barbers.forEach((b, bi)=>{
        if((bi * 3 + D.diff('2026-01-05', day)) % 7 === 0){ if(!S.bookings.some(x=>x.barberId === b.id && x.date === day)) S.off.push(b.id + '|' + day); return; }
        const [o, c] = hours(day); let t = o;
        while(t < c - 20){
          if(r() > load){ t += STEP; continue; }
          const s = pool[Math.floor(r() * pool.length)]; if(t + s.dur > c) break;
          const past = off < 0 || (off === 0 && t + s.dur <= nowMin()), chair = off === 0 && t <= nowMin() && nowMin() < t + s.dur;
          let st = past ? (r() < .04 ? 'noshow' : 'done') : (chair ? 'chair' : 'wait'); if(!past && r() < .05) st = 'cancelled';
          S.bookings.push({id:'BR-' + Math.floor(r() * 1e10).toString(16), barberId:b.id, serviceId:s.id, service:s.name, date:day, start:t, dur:s.dur, price:s.price, client:CLIENTS[Math.floor(r() * CLIENTS.length)], phone:'+37529' + (1000000 + Math.floor(r() * 8999999)), userId:null, status:st, source:r() < .7 ? 'app' : 'admin', createdAt:D.add(day, -2) + 'T12:00:00', seed:true});
          t += s.dur + (r() < .5 ? STEP : 0);
        }
      });
    }
  }
  function init(){
    try{ S = JSON.parse(localStorage.getItem(KEY) || 'null'); }catch(e){ S = null; }
    const today = D.today();
    if(S && S.day === today) return;
    if(S){
      S.bookings.forEach(b=>{ if(b.date < today && (b.status === 'wait' || b.status === 'chair')) b.status = 'done'; });
      const last = S.bookings.reduce((m, b)=> b.seed && b.date > m ? b.date : m, today);
      seedDays(rng(Date.now() & 0xffff), today, Math.max(1, D.diff(today, last) + 1), 7);
      S.day = today; save(); return;
    }
    S = {day:today, off:[], bookings:[],
      barbers:BARBERS.map((b, i)=>({id:b[0], name:b[1], spec:b[2], exp:b[3], color:b[4], rating:b[5], bio:b[6], pct:40, active:true, sort:i})),
      services:SERVICES.map((s, i)=>({id:s[0], name:s[1], dur:s[2], price:s[3], desc:s[4], active:true, sort:i}))};
    seedDays(rng(3), today, -35, 7); save();
  }
  const ok = x=> Object.assign({ok:true}, x || {});
  const err = (c, m)=> ({ok:false, error:c, message:m});
  function nearest(bid, dur){
    for(let off = 0; off < AHEAD; off++){ const day = D.add(D.today(), off), f = free(bid, day, dur, off === 0 ? nowMin() + 15 : -1); if(f.length) return {date:day, time:hm(f[0])}; }
    return null;
  }
  const svc = id=> S.services.find(s=>s.id === id && s.active);
  const brb = id=> S.barbers.find(b=>b.id === id && b.active);
  function capacity(from, to){
    let cap = 0;
    for(let d = from; d <= to; d = D.add(d, 1)){ const [o, c] = hours(d); S.barbers.forEach(b=>{ if(b.active && !isOff(b.id, d)) cap += c - o; }); }
    return cap;
  }
  const H = {
    getBarbers(){ return ok({barbers:S.barbers.filter(b=>b.active).map(b=>Object.assign(barberOut(b), {nextFree:nearest(b.id, 30), reviews:40 + Math.round(b.rating * 31) % 90})), services:S.services.filter(s=>s.active), hours:{open:'10:00', close:'21:00', sunOpen:'11:00', sunClose:'19:00'}, address:'Минск, ул. Октябрьская, 16', phone:'+375291234567'}); },
    getSlots(p){ const s = svc(p.serviceId); if(!s || !brb(p.barberId)) return err('not_found'); return ok({times:free(p.barberId, p.date, s.dur, p.date === D.today() ? nowMin() + 15 : -1).map(hm), dayOff:isOff(p.barberId, p.date)}); },
    getNearest(p){
      const s = svc(p.serviceId); if(!s) return err('not_found'); let best = null;
      S.barbers.filter(b=>b.active).forEach(b=>{ const n = nearest(b.id, s.dur); if(n && (!best || (n.date + n.time) < (best.date + best.time))) best = Object.assign(n, {barberId:b.id, barber:b.name}); });
      return ok({match:best});
    },
    createBooking(p){
      const s = svc(p.serviceId), b = brb(p.barberId); if(!s || !b) return err('not_found');
      if(!/^\+375\d{9}$/.test(p.phone || '')) return err('bad_request');
      const start = D.toMinutes(p.time);
      if(free(b.id, p.date, s.dur, p.date === D.today() ? nowMin() : -1).indexOf(start) < 0) return err('slot_unavailable');
      const r = {id:Kit.uid('BR'), barberId:b.id, serviceId:s.id, service:s.name, date:p.date, start, dur:s.dur, price:s.price, client:p.name, phone:p.phone, userId:p.userId, status:'wait', source:'app', createdAt:new Date().toISOString()};
      S.bookings.push(r); save(); return ok({booking:bOut(r)});
    },
    getMyBookings(p){ return ok({bookings:S.bookings.filter(b=>b.userId === p.userId).sort((a, b)=>(b.date + hm(b.start)).localeCompare(a.date + hm(a.start))).map(bOut)}); },
    cancelBooking(p){ const r = S.bookings.find(x=>x.id === p.id && x.userId === p.userId); if(!r) return err('not_found'); if(r.status !== 'wait') return err('bad_state'); r.status = 'cancelled'; save(); return ok(); },
    getDay(p){
      const day = p.date || D.today(), list = S.bookings.filter(b=>b.date === day).sort((a, b)=>a.start - b.start), act = list.filter(b=>b.status !== 'cancelled');
      let freeT = 0;
      const barbers = S.barbers.filter(b=>b.active).map(b=>{ const off = isOff(b.id, day), [o, c] = hours(day), bz = list.filter(x=>x.barberId === b.id && ['wait','chair','done'].indexOf(x.status) > -1).reduce((a, x)=>a + x.dur, 0), f = off ? 0 : free(b.id, day, 30, day === D.today() ? nowMin() : -1).length; freeT += f;
        return Object.assign(barberOut(b), {dayOff:off, loadPct:off ? 0 : Math.round(bz / (c - o) * 100), free:f, count:list.filter(x=>x.barberId === b.id && x.status !== 'cancelled').length}); });
      return ok({date:day, bookings:list.map(bOut), barbers, stats:{total:act.length, done:act.filter(b=>b.status === 'done').length, chair:act.filter(b=>b.status === 'chair').length, free:freeT, revenue:act.filter(b=>b.status !== 'noshow').reduce((a, b)=>a + b.price, 0)}});
    },
    setStatus(p){ const r = S.bookings.find(x=>x.id === p.id); if(!r) return err('not_found'); r.status = p.status; save(); return ok(); },
    createBookingAdmin(p){
      const s = svc(p.serviceId), b = brb(p.barberId); if(!s || !b) return err('not_found');
      const day = p.date || D.today(), start = D.toMinutes(p.time);
      if(free(b.id, day, s.dur, -1).indexOf(start) < 0) return err('slot_unavailable', 'Мастер занят в это время');
      const r = {id:Kit.uid('BR'), barberId:b.id, serviceId:s.id, service:s.name, date:day, start, dur:s.dur, price:s.price, client:p.client, phone:p.phone || '', userId:null, status:'wait', source:'admin', createdAt:new Date().toISOString()};
      S.bookings.push(r); save(); return ok({booking:bOut(r)});
    },
    getAdminSlots(p){ const s = svc(p.serviceId); if(!s) return err('not_found'); const day = p.date || D.today(); return ok({times:free(p.barberId, day, s.dur, day === D.today() ? nowMin() - 30 : -1).map(hm)}); },
    setDayOff(p){
      const k = p.barberId + '|' + p.date;
      if(p.off){ if(S.bookings.some(b=>b.barberId === p.barberId && b.date === p.date && (b.status === 'wait' || b.status === 'chair'))) return err('has_bookings', 'У мастера есть записи на этот день'); if(S.off.indexOf(k) < 0) S.off.push(k); }
      else S.off = S.off.filter(x=>x !== k);
      save(); return ok();
    },
    getBookings(p){ const from = p.from || D.add(D.today(), -7), to = p.to || D.add(D.today(), AHEAD); return ok({bookings:S.bookings.filter(b=>b.date >= from && b.date <= to).sort((a, b)=>(b.date + hm(b.start)).localeCompare(a.date + hm(a.start))).slice(0, 500).map(bOut)}); },
    getOverview(p){
      const t = D.today(), from = {day:t, week:D.add(t, -6), month:D.add(t, -29)}[p.period || 'week'];
      const rs = S.bookings.filter(b=>b.date >= from && b.date <= t && ['done','chair','wait'].indexOf(b.status) > -1), done = rs.filter(b=>b.status === 'done'), rev = done.reduce((a, b)=>a + b.price, 0);
      const cap = capacity(from, t), days = D.diff(from, t) + 1, chart = [];
      for(let i = 0; i < days; i++){ const d = D.add(from, i); chart.push({date:d, label:days <= 7 ? DOW[wd(d)] : String(D.day(d)), revenue:done.filter(b=>b.date === d).reduce((a, b)=>a + b.price, 0)}); }
      const rank = S.barbers.filter(b=>b.active).map(b=>{ const m = done.filter(x=>x.barberId === b.id), r = m.reduce((a, x)=>a + x.price, 0); return Object.assign(barberOut(b), {bookings:m.length, revenue:r, payout:Math.round(r * b.pct / 100)}); }).sort((a, b)=>b.revenue - a.revenue);
      const sv = {}; done.forEach(b=>{ sv[b.service] = sv[b.service] || {name:b.service, revenue:0, count:0}; sv[b.service].revenue += b.price; sv[b.service].count++; });
      return ok({kpi:{revenue:rev, count:done.length, avg:done.length ? Math.round(rev / done.length) : 0, fill:cap ? Math.round(rs.reduce((a, b)=>a + b.dur, 0) / cap * 100) : 0, noshow:S.bookings.filter(b=>b.date >= from && b.date <= t && b.status === 'noshow').length}, chart, rank, services:Object.values(sv).sort((a, b)=>b.revenue - a.revenue)});
    },
    getLoad(){
      const from = D.add(D.today(), -27), out = [];
      for(let w = 0; w < 7; w++){ let bz = 0, cap = 0; for(let i = 0; i < 28; i++){ const d = D.add(from, i); if(wd(d) !== w) continue; cap += capacity(d, d); bz += S.bookings.filter(b=>b.date === d && ['done','chair','wait'].indexOf(b.status) > -1).reduce((a, b)=>a + b.dur, 0); } out.push({day:DOW[w], pct:cap ? Math.round(bz / cap * 100) : 0}); }
      const hrs = []; for(let h = 10; h < 21; h++) hrs.push({hour:h + ':00', count:S.bookings.filter(b=>b.date >= from && b.date <= D.today() && ['done','chair','wait'].indexOf(b.status) > -1 && b.start >= h * 60 && b.start < h * 60 + 60).length});
      return ok({weekdays:out, hours:hrs});
    },
    getServicesAdmin(){ return ok({services:S.services}); },
    saveService(p){
      const s = p.service; if(!s.name || s.name.length < 3) return err('bad_request'); if(s.dur % 20) return err('bad_request', 'Длительность кратна 20 минутам');
      let x = s.id && S.services.find(y=>y.id === s.id);
      if(x) Object.assign(x, {name:s.name, dur:+s.dur, price:+s.price, desc:s.desc || '', active:s.active !== false});
      else { x = {id:Kit.uid('s'), name:s.name, dur:+s.dur, price:+s.price, desc:s.desc || '', active:s.active !== false, sort:99}; S.services.push(x); }
      save(); return ok({service:x});
    },
    saveBarber(p){ const b = S.barbers.find(x=>x.id === p.barber.id); if(!b) return err('not_found'); if(p.barber.pct) b.pct = +p.barber.pct; if(p.barber.spec) b.spec = p.barber.spec; if('active' in p.barber) b.active = !!p.barber.active; save(); return ok({barber:barberOut(b)}); },
    getBarbersAdmin(){ return ok({barbers:S.barbers.map(barberOut)}); }
  };
  return function(action, payload){
    if(!S) init();
    const h = H[action];
    return h ? h(payload || {}) : {ok:false, error:'unknown_action'};
  };
})();
