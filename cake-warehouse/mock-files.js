// изменено 2026-10-17 16:50
/* ============================================================
   mock-files.js — фото и файлы заявок и «отметить все собранными» в демо-режиме
   (двойник api/bots/cake/order_files.py). Сам файл — отдельным ключом localStorage,
   в состоянии только описание; место в телефоне ограничено — ошибку показываем, а не теряем файл.
   ============================================================ */
window.CakeMockFiles = (function(){
  "use strict";
  var U = CakeMock.util, err = U.err, byId = U.byId;
  var MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], MAX_FILE = 3 * 1024 * 1024, MAX_PER_ORDER = 10;
  var KEY = 'cake-file-';

  function st(){ var S = U.state(); if(!S.orderFiles) S.orderFiles = []; return S; }
  function drop(S, orderId){
    (S.orderFiles || []).filter(function(f){ return f.orderId === orderId; }).forEach(function(f){ try{ localStorage.removeItem(KEY + f.id); }catch(e){} });
    S.orderFiles = (S.orderFiles || []).filter(function(f){ return f.orderId !== orderId; });
  }

  CakeMock.register({
    addOrderFile: function(p){
      var S = st(), o = byId(S.orders, p.orderId);
      if(!o) return err('not_found', 'Заявка не найдена');
      if(MIMES.indexOf(p.mime) < 0) return err('bad_request', 'Можно фото (JPEG, PNG) или PDF');
      if(typeof p.data !== 'string' || !p.data || !/^[A-Za-z0-9+/=]+$/.test(p.data)) return err('bad_request', 'Файл повреждён');
      var size = Math.floor(p.data.length * 3 / 4);
      if(size > MAX_FILE) return err('bad_request', 'Файл больше 3 МБ');
      if(S.orderFiles.filter(function(f){ return f.orderId === o.id; }).length >= MAX_PER_ORDER) return err('bad_request', 'У заявки уже ' + MAX_PER_ORDER + ' файлов');
      var id = Kit.uid('F');
      try{ localStorage.setItem(KEY + id, p.data); }
      catch(e){ return err('too_large', 'В демо-режиме память телефона заполнена — удалите старые фото или подключите сервер'); }
      var f = {id:id, orderId:o.id, name:p.name || (/^image\//.test(p.mime) ? 'Фото' : 'Файл'), mime:p.mime, size:size};
      S.orderFiles.push(f);
      return {file:{id:id, name:f.name, mime:f.mime, size:size}};
    },
    getOrderFile: function(p){
      var f = byId(st().orderFiles, p.id), data = null;
      try{ data = f && localStorage.getItem(KEY + f.id); }catch(e){}
      if(!f || !data) return err('not_found', 'Файл не найден');
      return {file:{id:f.id, name:f.name, mime:f.mime, size:f.size, data:data}};
    },
    deleteOrderFile: function(p){
      var S = st(), f = byId(S.orderFiles, p.id);
      if(!f) return err('not_found', 'Файл не найден');
      S.orderFiles.splice(S.orderFiles.indexOf(f), 1);
      try{ localStorage.removeItem(KEY + f.id); }catch(e){}
      return {};
    },
    finishAll: function(p){
      var S = st(), list = (S.orders || []).filter(function(o){ return o.date === p.date && o.status === 'new' && (!p.route || o.route === p.route); });
      list.forEach(function(o){ Object.assign(o, {status:'picked', checked:o.lines.map(function(l){ return l.productId; }), pickedAt:U.now()}); });
      return {done:list.length, orders:list};
    }
  });
  return {drop:drop};
})();
