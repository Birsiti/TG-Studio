// изменено 2026-10-17 02:40
/* ============================================================
   mock-picking.js — сборка по кругу в демо-режиме (двойник api/bots/cake/picking.py).
   Точки и заявки — mock-orders.js; в демо заявки с фото стоят на сегодня.
   ============================================================ */
(function(){
  "use strict";
  var U = CakeMock.util, err = U.err, byId = U.byId, D = Kit.date;

  function st(){
    var S = U.state();
    if(!S.orders){  // старое состояние демо без сборки — досеиваем один раз
      var today = D.today();
      S.points = CakeMockOrders.points.map(function(p){ return Object.assign({}, p); });
      S.orders = CakeMockOrders.orders.map(function(o){ return Object.assign({}, o, {date:today, checked:[], status:'new', picker:'', boxes:null, pickedAt:null}); });
      S.places = {};
    }
    return S;
  }
  function order(S, id){ return byId(S.orders, id); }
  function lines(S, arr){
    var m = {}, out = [];
    (arr || []).forEach(function(x){
      var q = Math.max(0, parseInt(x.qty, 10) || 0), b = Math.max(0, parseInt(x.bonus, 10) || 0);
      if(!(q || b) || !byId(S.products, x.productId)) return;
      var ln = m[x.productId] || (m[x.productId] = {productId:x.productId, qty:0, bonus:0});
      ln.qty += q; ln.bonus += b;
    });
    Object.keys(m).forEach(function(k){ out.push(m[k]); });
    return out;
  }

  CakeMock.register({
    getOrders: function(p){
      var S = st(), from = D.add(D.today(), -30);
      var dates = S.orders.map(function(o){ return o.date; }).filter(function(d, i, a){ return d >= from && a.indexOf(d) === i; }).sort();
      var day = p.date;
      if(!day){ var fresh = dates.filter(function(d){ return d >= D.add(D.today(), -7); }); day = fresh.filter(function(d){ return d >= D.today(); })[0] || fresh[fresh.length - 1] || D.today(); }
      var routes = S.points.filter(function(x){ return x.active && x.route; }).map(function(x){ return x.route; }).filter(function(r, i, a){ return a.indexOf(r) === i; }).sort();
      var list = S.orders.filter(function(o){ return o.date === day; }).sort(function(a, b){ return a.route.localeCompare(b.route) || a.num.localeCompare(b.num); });
      return {date:day, dates:dates, orders:list, points:S.points, routes:routes, places:S.places};
    },
    saveOrder: function(p){
      var S = st(), pt = byId(S.points, p.pointId), num = String(p.num || '').trim();
      if(!num) return err('bad_request', 'num: обязательное поле');
      if(!pt) return err('not_found', 'Нет такой точки');
      if(S.orders.some(function(o){ return o.num === num && o.id !== p.id; })) return err('bad_request', 'Заявка №' + num + ' уже есть');
      var ls = lines(S, p.lines);
      if(!ls.length) return err('bad_request', 'В заявке нет тортов');
      var f = {num:num, date:p.date || D.today(), pointId:pt.id, route:pt.route, comment:p.comment || '', lines:ls};
      var o = p.id && order(S, p.id);
      if(o){
        if(o.status !== 'new') return err('bad_state', 'Собранная заявка не редактируется — сначала «Вернуть в сборку»');
        var keep = ls.map(function(l){ return l.productId; });
        Object.assign(o, f, {checked:o.checked.filter(function(x){ return keep.indexOf(x) >= 0; })});
      } else {
        o = Object.assign({id:Kit.uid('O'), checked:[], status:'new', picker:'', boxes:null, pickedAt:null}, f);
        S.orders.push(o);
      }
      return {order:o};
    },
    deleteOrder: function(p){
      var S = st(), o = order(S, p.id);
      if(!o) return err('not_found', 'Заявка не найдена');
      if(o.status !== 'new') return err('bad_state', 'Собранную заявку удалить нельзя');
      S.orders.splice(S.orders.indexOf(o), 1);
      return {};
    },
    checkLine: function(p){
      var S = st(), o = order(S, p.id);
      if(!o) return err('not_found', 'Заявка не найдена');
      if(o.status !== 'new') return err('bad_state', 'Заявка уже собрана');
      if(!o.lines.some(function(l){ return l.productId === p.productId; })) return err('not_found', 'Этого торта нет в заявке');
      o.checked = o.checked.filter(function(x){ return x !== p.productId; });
      if(p.done !== false) o.checked.push(p.productId);
      return {order:o};
    },
    finishPick: function(p){
      var S = st(), o = order(S, p.id);
      if(!o) return err('not_found', 'Заявка не найдена');
      if(o.status !== 'new') return err('bad_state', 'Заявка уже собрана');
      var left = o.lines.filter(function(l){ return o.checked.indexOf(l.productId) < 0; }).length;
      if(left) return err('bad_state', 'Не отмечено строк: ' + left);
      if(!String(p.picker || '').trim()) return err('bad_request', 'picker: обязательное поле');
      Object.assign(o, {status:'picked', picker:String(p.picker).trim(), boxes:p.boxes == null ? null : +p.boxes, pickedAt:U.now()});
      return {order:o};
    },
    reopenPick: function(p){
      var o = order(st(), p.id);
      if(!o) return err('not_found', 'Заявка не найдена');
      o.status = 'new'; o.pickedAt = null;
      return {order:o};
    },
    savePlaces: function(p){
      var S = st(), n = 0;
      (p.places || []).forEach(function(x){
        if(!byId(S.products, x.productId)) return;
        var v = parseInt(x.place, 10) || 0;
        if(v > 0) S.places[x.productId] = v; else delete S.places[x.productId];
        n++;
      });
      return {saved:n, places:S.places};
    },
    savePoint: function(p){
      var S = st();
      if(!p.customer || !p.address) return err('bad_request', 'Заказчик и адрес');
      var o = p.id && byId(S.points, p.id), f = {customer:p.customer, address:p.address, route:p.route || '', code:p.code || '', active:p.active !== false};
      if(o) Object.assign(o, f); else { o = Object.assign({id:Kit.uid('T')}, f); S.points.push(o); }
      return {point:o};
    }
  });
})();
