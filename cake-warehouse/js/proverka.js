// изменено 2026-10-17 08:00
/* Проверка карты склада: черновик мест по фото (karta-draft.js) → «Верно» / поправить → загрузить на склад.
   Отметки хранятся в этом телефоне (localStorage) — проверку можно прервать и продолжить. */
window.Karta = (function(){
  "use strict";
  const {html, icon, $, haptic} = Kit;
  const KEY = 'cake-karta-check-v1';
  const K = {draft: window.CakeKartaDraft || [], marks: {}, places: {}, filter: 'todo'};
  try{ K.marks = JSON.parse(localStorage.getItem(KEY)) || {}; }catch(e){ K.marks = {}; }
  K.save = ()=>{ try{ localStorage.setItem(KEY, JSON.stringify(K.marks)); }catch(e){} };
  // Решение по месту: {status:'ok'|'skip', productId?, product?:{name,cat,weightG}, createdId?}
  K.mark = row=> K.marks[row.place];
  const isNew = row=> !row.productId;

  // Что стоит на месте сейчас — с правками, если они есть
  K.current = function(row){
    const m = K.mark(row) || {};
    if(m.productId) return {productId:m.productId};
    if(m.product) return {product:m.product};
    return row.productId ? {productId:row.productId} : {product:{name:row.name, cat:row.cat, weightG:row.weightG}};
  };
  K.label = function(row){
    const c = K.current(row);
    if(c.productId){ const p = Cake.P(c.productId); return {name:p.name, sub:[p.cat, Cake.W(p.weightG)].filter(Boolean).join(' · '), isNew:false}; }
    return {name:c.product.name, sub:[c.product.cat, Cake.W(c.product.weightG) || 'вес ?'].join(' · '), isNew:true};
  };

  const FILTERS = [['todo','Не проверено'], ['ask','Вопросы'], ['new','Новые'], ['all','Все']];
  function visible(row){
    const m = K.mark(row);
    if(K.filter === 'todo') return !m;
    if(K.filter === 'ask') return !!row.note;
    if(K.filter === 'new') return isNew(row);
    return true;
  }

  K.draw = function(){
    const done = K.draft.filter(r=>K.mark(r)).length, total = K.draft.length;
    $('#kProg').style.width = Math.round(100 * done / Math.max(total, 1)) + '%';
    $('#kDone').textContent = `${done} из ${total}`;
    const onServer = Object.keys(K.places).length;
    $('#kSum').textContent = `Вопросов ${K.draft.filter(r=>r.note).length} · новых товаров ${K.draft.filter(isNew).length}` +
      (onServer ? ` · на складе уже задано мест: ${onServer}` : '');
    $('#kFilter').innerHTML = String(html`${FILTERS.map(([k, t])=>html`<button class="chip${K.filter === k ? ' is-on' : ''}" type="button" data-f="${k}">${t}</button>`)}`);
    const list = K.draft.filter(visible);
    $('#kList').innerHTML = list.length ? String(html`<div class="card">${list.map(row)}</div>`)
      : String(html`<div class="empty">${icon('check')}<div class="empty-title">${K.filter === 'todo' ? 'Всё проверено' : 'Пусто'}</div>${K.filter === 'todo' ? 'Нажмите «Загрузить на склад»' : ''}</div>`);
  };
  function row(r){
    const m = K.mark(r), l = K.label(r);
    const st = !m ? ['Проверить', 'pill-muted'] : m.status === 'skip' ? ['Убрано', 'pill-danger'] : (m.productId || m.product) ? ['Исправлено', 'pill-info'] : ['Верно', 'pill-ok'];
    return html`<button class="pick-row" type="button" data-p="${r.place}">
      <span class="place">${r.place}</span>
      <span class="pick-name">${Kit.nobr(l.name)}${l.isNew ? html` <span class="pill pill-accent">новый</span>` : ''}<small>${l.sub}</small>
        ${r.note && !m ? html`<small class="k-note">${icon('alert')} ${r.note}</small>` : ''}</span>
      <span class="pill ${st[1]}">${st[0]}</span></button>`;
  }

  Kit.on($('#kFilter'), 'click', '[data-f]', (e, el)=>{ K.filter = el.dataset.f; haptic('select'); K.draw(); });
  Kit.on($('#kList'), 'click', '[data-p]', (e, el)=> Karta.open(K.draft.find(r=>r.place === +el.dataset.p)));

  Kit.ready(async ()=>{
    $('#mark').innerHTML = icon('pin');
    await Cake.loadRefs();
    const r = await Cake.api('getOrders');
    if(r.ok) K.places = r.places || {};
    K.draw();
  });
  return K;
})();
