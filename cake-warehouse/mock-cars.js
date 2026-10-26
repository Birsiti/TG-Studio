// изменено 2026-10-26 10:20
/* ============================================================
   mock-cars.js — парк и правило «не в двух рейсах сразу» в демо-режиме
   (двойник api/bots/cake/cars.py: getCars, saveCar, проверка при отгрузке, inTransit в getCrew).
   Подключается последним среди mock-*.js.
   ============================================================ */
(function(){
  "use strict";
  var U = CakeMock.util, err = U.err, byId = U.byId;
  var shipTrip = CakeMock.orig('shipTrip'), getCrew = CakeMock.orig('getCrew');

  // Рейс «в пути» (отгружен, отчёта ещё нет), где занят водитель или машина
  function road(S, driver, car, skip){
    return S.trips.filter(function(t){ return t.status === 'shipped' && t.id !== skip && ((driver && t.driverId === driver) || (car && t.car === car)); })
      .sort(function(a, b){ return b.num - a.num; })[0] || null;
  }
  function fleet(){
    var S = U.state(), m = {};
    S.trips.forEach(function(t){ if(!t.car && t.driverId && t.status !== 'cancelled'){ var d = byId(S.staff, t.driverId); if(d && d.car) t.car = d.car; } });  // старое демо: рейсам без машины — закреплённая за водителем
    (S.cars || []).forEach(function(c){ m[c] = null; });
    S.staff.forEach(function(s){ if(s.role === 'driver' && s.active !== false && s.car) m[s.car] = s; });
    S.trips.forEach(function(t){ if(t.car && t.status !== 'cancelled' && !(t.car in m)) m[t.car] = null; });
    return Object.keys(m).sort().map(function(car){
      var b = road(S, null, car);
      var bd = (S.carBody || {})[car] || [0, 0];
      return {car:car, driverId:m[car] ? m[car].id : null, driverName:m[car] ? m[car].name : '', busy:b ? b.num : null, bodyL:bd[0], bodyW:bd[1]};
    });
  }

  var reg = {
    getCars: function(){ return {cars:fleet()}; },
    saveCar: function(p){
      var S = U.state(), car = String(p.car || '').trim().slice(0, 80);
      if(car.length < 3) return err('bad_request', 'car: от 3 символов');
      S.cars = S.cars || []; if(S.cars.indexOf(car) < 0) S.cars.push(car);
      if('bodyL' in p || 'bodyW' in p){
        var L = parseInt(p.bodyL, 10) || 0, W = parseInt(p.bodyW, 10) || 0;
        if(L > 20000 || W > 4000) return err('bad_request', 'bodyL: слишком большое');
        (S.carBody = S.carBody || {})[car] = [L, W];
      }
      if('driverId' in p){
        var did = p.driverId || null;
        if(did){
          var d = byId(S.staff, did); if(!d || d.role !== 'driver') return err('not_found', 'Нет такого водителя');
          var b = road(S, did, null);
          if(b && b.car !== car) return err('bad_state', 'Этот водитель сейчас в рейсе №' + b.num + ': сначала он должен вернуться');
          if(d.car && d.car !== car && S.cars.indexOf(d.car) < 0) S.cars.push(d.car);
        }
        S.staff.forEach(function(s){ if(s.role === 'driver' && s.car === car && s.id !== did) s.car = ''; });
        if(did) byId(S.staff, did).car = car;
      }
      return {cars:fleet()};
    },
    shipTrip: function(p){
      var S = U.state(), t = byId(S.trips, p.id);
      if(t && t.status === 'draft' && t.driverId){
        var b = road(S, t.driverId, t.car, t.id);
        if(b){
          var byDriver = b.driverId === t.driverId;
          return err('bad_state', byDriver ? ((byId(S.staff, t.driverId) || {}).name || 'Водитель') + ' ещё в рейсе №' + b.num + ': пока он не вернулся, второй рейс отгрузить нельзя'
                                            : 'Машина ' + t.car + ' ещё в рейсе №' + b.num + ': пока она не вернулась, выберите другую');
        }
      }
      return shipTrip(p);
    }
  };
  if(getCrew) reg.getCrew = function(p){
    var r = getCrew(p), S = U.state();
    r.drivers = r.drivers.map(function(d){ var b = road(S, d.id, null, p.tripId); return Object.assign({}, d, {inTransit:b ? b.num : null}); });
    return r;
  };
  CakeMock.register(reg);
})();
