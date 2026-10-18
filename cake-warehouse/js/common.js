// изменено 2026-10-18 10:00
/* Общее для страниц склада: API, справочники, остатки и помощники
   (название с весом, группы по категориям, поиск без перерисовки). */
window.Cake = (function(){
  "use strict";
  const {html, $, $$, num, haptic} = Kit;
  const C = {
    api: Kit.createApi({bot:'cake', mock: window.CakeMock}),
    refs: {products:[], cities:[], staff:[], tara:[], moveTypes:{}, cats:[]},
    stock: [],
    tabs: {}            // вкладки регистрируют здесь свою отрисовку: Cake.tabs.stock = fn
  };
  C.P = id=> C.refs.products.find(x=>x.id === id) || {name:'?'};
  C.W = g=> !g ? '' : g < 1000 ? g + ' г' : String(g / 1000).replace('.', ',') + ' кг';
  C.L = id=> { const p = C.P(id); return p.name + (p.weightG ? ', ' + C.W(p.weightG) : ''); };
  C.C = id=> C.refs.cities.find(x=>x.id === id) || {name:'?', code:'—'};
  C.S = id=> C.refs.staff.find(x=>x.id === id);
  C.T = id=> C.refs.tara.find(x=>x.id === id) || {name:'?'};
  C.CATS = ()=> C.refs.cats.concat(C.refs.products.map(p=>p.cat).filter((c, i, a)=>c && !C.refs.cats.includes(c) && a.indexOf(c) === i));
  // Группы по категориям; asList — обернуть строки группы в .list
  C.byCat = function(list, row, asList){
    return html`${C.CATS().map(c=>{ const ps = list.filter(p=>p.cat === c); return ps.length ? html`<div class="cat-group"><div class="eyebrow cat-head" data-c="${c}">${c} · ${ps.length}</div>${asList ? html`<div class="list">${ps.map(row)}</div>` : ps.map(row)}</div>` : ''; })}`;
  };
  // Поиск без перерисовки: прячем строки, а не строим заново — введённые числа не теряются
  C.filterRows = function(root, q){
    q = q.trim().toLowerCase();
    $$('[data-name]', root).forEach(r=> r.hidden = !!q && !r.dataset.name.includes(q));
    $$('.cat-group', root).forEach(g=>{ const n = $$('[data-name]', g).filter(r=>!r.hidden).length; g.hidden = !n; const h = $('.cat-head', g); h.textContent = h.dataset.c + ' · ' + n; });
  };
  C.nameKey = p=> (p.name + ' ' + p.cat + ' ' + p.sku).toLowerCase();
  C.pcs = n=> num(n) + ' шт';
  C.fail = r=> { Kit.toast(r.message || ({network:'Нет связи', forbidden:'Нет доступа'})[r.error] || 'Не получилось', 'error'); haptic('error'); };
  C.stockOf = id=> (C.stock.find(x=>x.id === id) || {qty:0}).qty;

  C.loadRefs = async function(){
    const r = await C.api('getRefs');
    if(!r.ok){ C.fail(r); return; }
    C.refs = r;
    if(!C.helloSent){ C.helloSent = true; C.api('hello', {page:'sklad'}); }  // журнал «кто заходит»
    const note = $('#modeNote');
    if(note && C.api.mode() === 'demo') note.innerHTML = String(html`<p class="mode-note">Демо-версия: данные примерные и хранятся только в этом телефоне.</p>`);
  };
  C.loadStock = async function(){ const r = await C.api('getStock'); if(r.ok) C.stock = r.items; return r; };
  return C;
})();
