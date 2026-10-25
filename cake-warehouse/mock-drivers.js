// изменено 2026-10-25 19:00
/* ============================================================
   mock-drivers.js — спидометр рейса, статистика водителей и «кто заходит» в демо-режиме
   (двойник api/bots/cake/drivers.py, те же проверки и тексты ошибок).
   ============================================================ */
(function(){
  "use strict";
  var U = CakeMock.util, err = U.err, byId = U.byId, D = Kit.date;
  var MAX_RUN = 3000;

  // Старое демо без спидометра: прошедшим рейсам — правдоподобные показания, один раз
  function st(){
    var S = U.state();
    if(!S.odoV1){
      var odo = {};
      S.trips.slice().sort(function(a, b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : a.num - b.num; }).forEach(function(t){
        if(t.odoOut === undefined) t.odoOut = null;
        if(t.odoBack === undefined) t.odoBack = null;
        if(!t.driverId || !/shipped|reported|closed/.test(t.status)) return;
        var o = (odo[t.driverId] || 84000 + t.driverId.length * 1311) + (t.num % 3 === 0 ? 12 : 0);
        t.odoOut = o;
        if(t.status !== 'shipped'){ t.odoBack = o + 90 + (t.num * 37) % 160; odo[t.driverId] = t.odoBack; } else odo[t.driverId] = o;
      });
      S.odoV1 = true;
    }
    return S;
  }
  function reported(t){
    var rep = {}; try{ rep = t.report ? JSON.parse(t.report) : {}; }catch(e){}
    var m = {}; (rep.returns || []).forEach(function(r){ m[r.productId] = (r.back || 0) + (r.spoiled || 0); }); return m;
  }

  CakeMock.register({
    setOdometer: function(p){
      var S = st(), t = byId(S.trips, p.id); if(!t) return err('not_found', 'Рейс не найден');
      if(!/shipped|reported|closed/.test(t.status)) return err('bad_state', 'Рейс ещё не отгружен');
      if(p.kind !== 'out' && p.kind !== 'back') return err('bad_request', 'kind: out или back');
      var km = parseInt(p.km, 10); if(!(km >= 0) || String(p.km).trim() === '') return err('bad_request', 'km: ожидается число');
      var out = p.kind === 'out' ? km : t.odoOut, back = p.kind === 'back' ? km : t.odoBack;
      if(p.kind === 'back' && out == null) return err('bad_request', 'Сначала укажите спидометр на выезде');
      if(out != null && back != null && !(back - out >= 0 && back - out <= MAX_RUN)) return err('bad_request', 'Пробег ' + (back - out) + ' км — проверьте показания');
      t[p.kind === 'out' ? 'odoOut' : 'odoBack'] = km;
      return {trip:t};
    },
    getDriverStats: function(p){
      var S = st(), to = p.to || D.today(), from = p.from || D.add(to, -29), out = {}, last = {}, pts = {};
      (S.orders || []).forEach(function(o){ if(o.tripId){ (pts[o.tripId] = pts[o.tripId] || {})[o.pointId] = 1; } });
      S.trips.filter(function(t){ return t.driverId && /shipped|reported|closed/.test(t.status) && t.date >= from && t.date <= to; })
        .sort(function(a, b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : a.num - b.num; })
        .forEach(function(t){
          var d = out[t.driverId] || (out[t.driverId] = {driverId:t.driverId, trips:0, points:0, km:0, kmGap:0, noOdo:0, shipped:0, back:0, spoiled:0, shortage:0, taraDebt:0});
          d.trips++; d.points += pts[t.id] ? Object.keys(pts[t.id]).length : 1;
          d.shipped += t.lines.reduce(function(s, l){ return s + l.qty; }, 0);
          if(t.odoOut != null && t.odoBack != null) d.km += t.odoBack - t.odoOut; else d.noOdo++;
          var prev = last[t.driverId]; if(prev != null && t.odoOut != null && t.odoOut > prev) d.kmGap += t.odoOut - prev;
          if(t.odoBack != null) last[t.driverId] = t.odoBack;
          if(t.status === 'closed'){
            var got = {};
            t.lines.forEach(function(l){ d.back += l.back || 0; d.spoiled += l.spoiled || 0; got[l.productId] = (l.back || 0) + (l.spoiled || 0); });
            var said = reported(t); Object.keys(said).forEach(function(k){ d.shortage += Math.max(0, said[k] - (got[k] || 0)); });
          }
        });
      S.taraMoves.forEach(function(m){ if(out[m.driverId]) out[m.driverId].taraDebt += m.qty; });
      return {from:from, to:to, drivers:Object.keys(out).map(function(k){ return out[k]; }).sort(function(a, b){ return b.trips - a.trips; })};
    }
  });

  // Кто заходит (двойник visits.py): в демо видно только этот телефон
  var QUIET_MIN = 30, LOG_KEEP = 5000;
  function touch(S, tg, page, name, username){
    S.visitors = S.visitors || []; S.visitLog = S.visitLog || [];
    var at = U.now(), v = byId(S.visitors, tg), col = page === 'bot' ? 'starts' : 'opens';
    if(v){ v.lastAt = at; v.lastPage = page; v[col]++; if(name) v.name = name; if(username) v.username = username; }
    else { v = {id:tg, tgId:tg, name:name || '', username:username || '', firstAt:at, lastAt:at, lastPage:page, starts:0, opens:0}; v[col] = 1; S.visitors.push(v); }
    var last = S.visitLog.filter(function(x){ return x.tgId === tg && x.page === page; }).pop();
    if(!last || (Date.parse(at) - Date.parse(last.at)) / 60000 >= QUIET_MIN){ S.visitLog.push({tgId:tg, at:at, page:page}); if(S.visitLog.length > LOG_KEEP) S.visitLog.splice(0, S.visitLog.length - LOG_KEEP); }
  }
  // Подсказки логисту и смена водителя/машины рейса (двойник getCrew / setTripCrew)
  function lastCar(S, id){
    var t = S.trips.filter(function(x){ return x.driverId === id && x.car && x.status !== 'cancelled'; }).sort(function(a, b){ return a.date < b.date ? 1 : -1; })[0];
    return (t && t.car) || (byId(S.staff, id) || {}).car || '';
  }
  CakeMock.register({
    getCrew: function(p){
      var S = U.state(), day = p.date || D.today(), cars = {};
      var shift = (S.shifts && S.shifts[day]) || [], busy = {};
      S.trips.forEach(function(t){ if(t.date === day && t.driverId && !/cancelled|closed/.test(t.status) && t.id !== p.tripId) (busy[t.driverId] = busy[t.driverId] || []).push(t.num); });
      var drivers = S.staff.filter(function(s){ return s.role === 'driver' && s.active; }).map(function(s){
        var mine = S.trips.filter(function(t){ return t.driverId === s.id && t.status !== 'cancelled'; }).sort(function(a, b){ return a.date < b.date ? 1 : -1; });
        var here = p.cityId ? mine.filter(function(t){ return t.cityId === p.cityId; }) : [];
        if(s.car) cars[s.car] = s.name;
        return Object.assign({}, s, {carDefault:lastCar(S, s.id), lastDate:mine[0] ? mine[0].date : null, lastCar:mine[0] ? (mine[0].car || '') : '', lastCityId:mine[0] ? mine[0].cityId : null,
          onRoute:here.length, lastOnRoute:here[0] ? here[0].date : null, onShift:shift.indexOf(s.id) >= 0, busy:busy[s.id] || []});
      });
      S.trips.forEach(function(t){ if(t.car && !cars[t.car]) cars[t.car] = (byId(S.staff, t.driverId) || {}).name || ''; });
      return {drivers:drivers, cars:Object.keys(cars).map(function(k){ return {car:k, who:cars[k]}; })};
    },
    setTripCrew: function(p){
      var S = U.state(), t = byId(S.trips, p.id); if(!t) return err('not_found', 'Нет такого рейса');
      if(/closed|cancelled/.test(t.status)) return err('bad_state', 'Рейс уже закрыт');
      var driver = t.driverId;
      if('driverId' in p){
        var nd = p.driverId || null;
        if(nd !== driver && t.status !== 'draft') return err('bad_state', 'Водителя меняют до отгрузки: ящики после неё записаны на него');
        if(nd && (byId(S.staff, nd) || {}).role !== 'driver') return err('not_found', 'Нет такого водителя');
        driver = nd;
      }
      var car = 'car' in p ? String(p.car || '').slice(0, 80) : (driver !== t.driverId ? lastCar(S, driver) : t.car || '');
      t.driverId = driver; t.car = car; return {trip:t};
    },
    hello: function(p){
      if(['sklad', 'admin', 'driver'].indexOf(p.page) < 0) return err('bad_request', 'page');
      var u = Kit.user; touch(U.state(), String(u.id), p.page, [u.firstName, u.lastName].filter(Boolean).join(' '), u.username); return {};
    },
    logVisit: function(p){
      if(!/^\d+$/.test(p.tgId || '')) return err('bad_request', 'tgId: только цифры');
      var S = U.state(), isNew = !byId(S.visitors || [], p.tgId); touch(S, p.tgId, 'bot', p.name, p.username); return {isNew:isNew};
    },
    getVisits: function(p){
      var S = U.state(), staff = {};
      S.staff.forEach(function(s){ if(s.tgId) staff[s.tgId] = s; });
      var people = (S.visitors || []).slice().sort(function(a, b){ return a.lastAt < b.lastAt ? 1 : -1; }).map(function(v){
        var s = staff[v.tgId];
        var role = v.tgId === String(Kit.user.id) ? 'admin' : s && s.active ? s.role : null;  // в демо этот телефон — руководитель
        return Object.assign({}, v, {staffId:s ? s.id : null, staffName:s ? s.name : '', role:role});
      });
      return {people:people, log:(S.visitLog || []).slice(-(p.limit || 200)).reverse()};
    }
  });
})();
