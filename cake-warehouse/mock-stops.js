// изменено 2026-10-18 16:00
/* ============================================================
   mock-stops.js — точки рейса в демо-режиме (двойник api/bots/cake/stops.py):
   логист даёт водителю заявки, торты и ящики рейса — из заявок, отгрузка — только собранные.
   Подключать после mock.js и mock-picking.js.
   ============================================================ */
(function(){
  "use strict";
  var U = CakeMock.util, err = U.err, byId = U.byId, O = {};
  ['getTrips', 'getMyTrips', 'saveTrip', 'shipTrip', 'saveOrder', 'deleteOrder', 'finishPick', 'routeToTrip'].forEach(function(n){ O[n] = CakeMock.orig(n); });
  var bad = function(r){ return r && r.ok === false; };

  function onTrip(S, tid){
    return (S.orders || []).filter(function(o){ return o.tripId === tid; })
      .sort(function(a, b){ return (a.stop || 0) - (b.stop || 0) || a.num.localeCompare(b.num); });
  }
  var STOP_PHOTO = 'Фото с точки', MAX_STOP_PHOTOS = 6;
  function withStops(t){
    var S = U.state(), reps = S.stopReports || {};
    return Object.assign({}, t, {stops:onTrip(S, t.id).map(function(o){
      var pt = byId(S.points, o.pointId) || {customer:'?', address:''};
      return {orderId:o.id, num:o.num, pointId:o.pointId, customer:pt.customer, address:pt.address, route:o.route, status:o.status,
        boxes:o.boxes, comment:o.comment || '', lines:o.lines, qty:o.lines.reduce(function(s, l){ return s + l.qty + (l.bonus || 0); }, 0),
        photos:(S.orderFiles || []).filter(function(f){ return f.orderId === o.id && f.name === STOP_PHOTO; }).length, report:reps[o.id] || null};
    })});
  }
  // Точка рейса, который у водителя (в пути / ждёт приёмки) — как _driver_stop в stops.py
  function driverStop(S, oid){
    var o = byId(S.orders || [], oid);
    if(!o || !o.tripId) return err('not_found', 'Точка не найдена');
    var t = byId(S.trips, o.tripId);
    if(!t || !/shipped|reported/.test(t.status)) return err('bad_state', 'Рейс не в пути');
    return {o:o, t:t};
  }
  function sync(tid){
    if(!tid) return;
    var S = U.state(), t = byId(S.trips, tid), list = onTrip(S, tid);
    if(!t || t.status !== 'draft' || !list.length) return;
    var m = {}, boxes = 0, box = S.tara.filter(function(x){ return x.active; })[0];
    list.forEach(function(o){ o.lines.forEach(function(l){ m[l.productId] = (m[l.productId] || 0) + l.qty + (l.bonus || 0); }); boxes += o.boxes || 0; });
    t.lines = Object.keys(m).filter(function(k){ return m[k]; }).map(function(k){ return {productId:k, qty:m[k]}; });
    t.taraOut = box && boxes ? [{taraId:box.id, qty:boxes}] : [];
  }
  var nums = function(list){ return list.map(function(o){ return o.num; }).join(', №'); };

  // Демо для показа: на сегодня два рейса с точками — Иван везёт Маршрут 2 (собрано, в пути), Сергей — Маршрут 3 (собирается).
  // Один раз на состояние демо; недостающие торты — приходом «Цех», чтобы отгрузка прошла.
  var run = function(a, p){ return CakeMock(a, p || {}); };
  function showcase(){
    var S = U.state();
    if(S.showcaseV1) return;
    var day = Kit.date.today();
    if(!run('getOrders', {date:day}).ok) return;  // страница без сборки (нет mock-picking.js) — сделаем на другой
    run('getDriverStats', {});  // спидометр истории (mock-drivers.js) — до наших рейсов: их водитель введёт сам
    U.state().showcaseV1 = true;
    var pick = function(route, n){ return (U.state().orders || []).filter(function(o){ return o.date === day && o.route === route && !o.tripId && o.lines.length; })
      .sort(function(a, b){ return a.num.localeCompare(b.num); }).slice(0, n); };
    var plan = [['Маршрут 2', 'dr-ivan', 4, true], ['Маршрут 3', 'dr-sergey', 3, false]];
    plan.forEach(function(x){
      var list = pick(x[0], x[2]); if(!list.length) return;
      if(x[3]) list.forEach(function(o){ run('finishPick', {id:o.id, all:true, boxes:Math.max(1, Math.ceil(o.lines.reduce(function(s, l){ return s + l.qty + (l.bonus || 0); }, 0) / 12))}); });
      var t = run('saveTrip', {date:day, route:x[0], driverId:x[1], lines:[]});
      if(!t.ok) return;
      t = run('setTripOrders', {id:t.trip.id, orderIds:list.map(function(o){ return o.id; })});
      if(!t.ok || !x[3]) return;
      var stock = run('getStock').items || [], have = {}; stock.forEach(function(s){ have[s.id] = s.qty; });
      var need = t.trip.lines.map(function(l){ return {productId:l.productId, qty:l.qty - (have[l.productId] || 0)}; }).filter(function(l){ return l.qty > 0; });
      if(need.length) run('addIncome', {date:day, note:'Цех', lines:need});
      var sh = run('shipTrip', {id:t.trip.id});
      if(sh.ok){ var tr = byId(U.state().trips, t.trip.id); tr.odoOut = null; tr.odoBack = null; }  // «Выезжаю» — на показе
    });
  }

  var getRefs = CakeMock.orig('getRefs');
  CakeMock.register({
    getRefs: function(p){ var r = getRefs(p); try{ showcase(); }catch(e){} return r; },
    getTrips: function(p){ var r = O.getTrips(p); if(!bad(r)) r = Object.assign({}, r, {trips:r.trips.map(withStops)}); return r; },
    getMyTrips: function(p){ var r = O.getMyTrips(p); if(!bad(r)) r = Object.assign({}, r, {trips:r.trips.map(withStops)}); return r; },
    saveTrip: function(p){
      if(!p.cityId && p.route) p = Object.assign({}, p, {cityId:U.routeCity(U.state(), String(p.route).slice(0, 40))});
      var r = O.saveTrip(p); if(bad(r)) return r; sync(r.trip.id); return {trip:withStops(r.trip)}; },
    shipTrip: function(p){
      var S = U.state(), t = byId(S.trips, p.id);
      if(t && t.status === 'draft'){
        var list = onTrip(S, t.id);
        var left = list.filter(function(o){ return o.status !== 'picked'; });
        if(left.length) return err('bad_state', 'Не собраны: №' + nums(left));
        var bare = list.filter(function(o){ return !o.lines.length; });
        if(bare.length) return err('bad_state', 'Внесите торты в заявки по фото: №' + nums(bare));
        sync(t.id);
      }
      var r = O.shipTrip(p); return bad(r) ? r : {trip:withStops(r.trip)};
    },
    saveOrder: function(p){ var r = O.saveOrder(p); if(!bad(r)) sync(r.order.tripId); return r; },
    finishPick: function(p){ var r = O.finishPick(p); if(!bad(r)) sync(r.order.tripId); return r; },
    deleteOrder: function(p){ var o = byId(U.state().orders || [], p.id), tid = o && o.tripId, r = O.deleteOrder(p); if(!bad(r)) sync(tid); return r; },
    reopenPick: function(p){
      var S = U.state(), o = byId(S.orders || [], p.id);
      if(!o) return err('not_found', 'Заявка не найдена');
      if(o.tripId && (byId(S.trips, o.tripId) || {}).status !== 'draft') return err('bad_state', 'Заявка уже уехала в рейсе');
      o.status = 'new'; o.pickedAt = null; sync(o.tripId);
      return {order:o};
    },
    routeToTrip: function(p){
      var r = O.routeToTrip(p); if(bad(r)) return r;
      onTrip(U.state(), r.trip.id).sort(function(a, b){ return a.num.localeCompare(b.num); }).forEach(function(o, i){ o.stop = i + 1; });
      return {trip:withStops(r.trip), orders:r.orders};
    },
    reportStop: function(p){
      var S = U.state(), x = driverStop(S, p.orderId); if(bad(x)) return x;
      var have = {}; x.o.lines.forEach(function(l){ have[l.productId] = (have[l.productId] || 0) + l.qty + (l.bonus || 0); });
      var out = [], seen = {}, ls = p.lines || [];
      for(var i = 0; i < ls.length; i++){
        var l = ls[i], pid = l.productId;
        if(!(pid in have)) return err('not_found', 'Этого торта нет в заявке');
        if(seen[pid]) return err('bad_request', 'Торт в отчёте дважды'); seen[pid] = 1;
        var sh = +l.short || 0, sp = +l.spoiled || 0, rs = +l.resort || 0;
        if(sh < 0 || sp < 0 || rs < 0) return err('bad_request', 'Количество не может быть меньше нуля');
        if(sh + sp + rs > have[pid]) return err('bad_request', 'Замечаний больше, чем везли: ' + have[pid] + ' шт');
        if(rs && l.resortTo && !byId(S.products, l.resortTo)) return err('not_found', 'Нет такого торта');
        if(sh || sp || rs){ var r = {productId:pid, short:sh, spoiled:sp, resort:rs}; if(rs && l.resortTo) r.resortTo = l.resortTo; out.push(r); }
      }
      var comment = String(p.comment || '').trim().slice(0, 300);
      S.stopReports = S.stopReports || {};
      S.stopReports[x.o.id] = {ok:!out.length && !comment, lines:out, comment:comment, at:U.now()};
      return {trip:withStops(x.t)};
    },
    addStopPhoto: function(p){
      var S = U.state(), x = driverStop(S, p.orderId); if(bad(x)) return x;
      if((S.orderFiles || []).filter(function(f){ return f.orderId === x.o.id && f.name === STOP_PHOTO; }).length >= MAX_STOP_PHOTOS) return err('bad_request', 'С точки уже ' + MAX_STOP_PHOTOS + ' фото');
      if(!/^image\//.test(p.mime || '')) return err('bad_request', 'Можно только фото');
      return CakeMock.orig('addOrderFile')(Object.assign({}, p, {name:STOP_PHOTO}));
    },
    setTripOrders: function(p){
      var S = U.state(), t = byId(S.trips, p.id);
      if(!t) return err('not_found', 'Рейс не найден');
      if(t.status !== 'draft') return err('bad_state', 'Отгруженный рейс не редактируется');
      var ids = (p.orderIds || []).filter(function(x, i, a){ return typeof x === 'string' && a.indexOf(x) === i; });
      for(var i = 0; i < ids.length; i++){
        var o = byId(S.orders || [], ids[i]);
        if(!o) return err('not_found', 'Заявка не найдена');
        if(o.date !== t.date) return err('bad_request', 'Заявка №' + o.num + ' на другую дату');
        if(o.tripId && o.tripId !== t.id) return err('bad_state', 'Заявка №' + o.num + ' уже в другом рейсе');
      }
      (S.orders || []).forEach(function(o){ if(o.tripId === t.id){ o.tripId = null; o.stop = 0; } });
      ids.forEach(function(id, i){ var o = byId(S.orders, id); o.tripId = t.id; o.stop = i + 1; });
      if(ids.length){
        sync(t.id);
        if(!t.note || /^Заявки: №/.test(t.note)) t.note = 'Заявки: №' + ids.map(function(id){ return byId(S.orders, id).num; }).join(', №');
      }
      return {trip:withStops(t)};
    }
  });
})();
