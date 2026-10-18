// изменено 2026-10-18 13:00
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
  function withStops(t){
    var S = U.state();
    return Object.assign({}, t, {stops:onTrip(S, t.id).map(function(o){
      var pt = byId(S.points, o.pointId) || {customer:'?', address:''};
      return {orderId:o.id, num:o.num, pointId:o.pointId, customer:pt.customer, address:pt.address, route:o.route, status:o.status,
        boxes:o.boxes, comment:o.comment || '', qty:o.lines.reduce(function(s, l){ return s + l.qty + (l.bonus || 0); }, 0)};
    })});
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

  CakeMock.register({
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
