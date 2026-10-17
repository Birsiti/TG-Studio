// изменено 2026-10-17 15:00
/* ============================================================
   mock-drivers.js — спидометр рейса и статистика водителей в демо-режиме
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
})();
