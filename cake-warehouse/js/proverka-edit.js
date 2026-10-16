// изменено 2026-10-17 08:00
/* Проверка карты: шторка места (верно / другой торт из ассортимента / новый товар / убрать) и загрузка на склад. */
(function(){
  "use strict";
  const {html, icon, $, $$, haptic} = Kit;
  const K = window.Karta;

  K.open = function(row){
    if(!row) return;
    const cur = K.current(row);
    let mode = cur.productId ? 'cat' : 'new', pick = cur.productId || '';
    const np = Object.assign({name:row.name, cat:row.cat, weightG:row.weightG}, cur.product || {});
    // Подсказки: тот же торт в других весах
    const base = row.name.toLowerCase();
    const sameName = Cake.refs.products.filter(p=>p.active && base.startsWith(p.name.toLowerCase()));
    const prodRow = p=> html`<button class="qrow k-opt${p.id === pick ? ' is-on' : ''}" type="button" data-pid="${p.id}" data-name="${Cake.nameKey(p)}">
      <span class="qrow-name">${Kit.nobr(p.name)}<small>${p.cat} · ${Cake.W(p.weightG) || 'вес ?'}</small></span><span class="pick-box">${p.id === pick ? icon('check') : ''}</span></button>`;
    const body = ()=> html`
      ${row.note ? html`<p class="mode-note">${icon('alert')} ${row.note}</p>` : ''}
      <div class="seg seg-grid"><button type="button" data-m="cat" class="${mode === 'cat' ? 'is-on' : ''}">Из ассортимента</button><button type="button" data-m="new" class="${mode === 'new' ? 'is-on' : ''}">Новый товар</button></div>
      ${mode === 'cat' ? html`
        ${sameName.length ? html`<div class="eyebrow section" style="margin-bottom:4px">Похожие</div><div class="card">${sameName.map(prodRow)}</div>` : ''}
        <div class="search section"><span>${icon('search')}</span><input class="input" id="kQ" type="search" placeholder="Найти торт" autocomplete="off"></div>
        <div class="section" id="kCat">${Cake.byCat(Cake.refs.products.filter(p=>p.active), prodRow)}</div>`
      : html`
        <label class="field section"><span class="field-label">Название (как на упаковке)</span><input class="input" id="kName" maxlength="80" value="${np.name}"></label>
        <div class="eyebrow section" style="margin-bottom:8px">Категория</div>
        <div class="chips" id="kCats">${Cake.CATS().map(c=>html`<button class="chip${c === np.cat ? ' is-on' : ''}" type="button" data-c="${c}">${c}</button>`)}</div>
        <label class="field section"><span class="field-label">Вес, г (на упаковке)</span><input class="input" id="kW" type="number" inputmode="numeric" min="0" value="${np.weightG || ''}" placeholder="например 850"></label>`}`;
    const sh = Kit.sheet({title:`Место ${row.place}`, sub:'Что стоит на этом месте', body:body(), actions: html`
      <button class="btn btn-danger-soft" type="button" data-a="skip">${icon('trash')}</button>
      <button class="btn btn-primary btn-block" type="button" data-a="ok">${icon('check')}Верно</button>`});
    const redraw = ()=>{ sh.body.innerHTML = String(body()); };
    Kit.on(sh.el, 'click', '[data-m]', (e, el)=>{ mode = el.dataset.m; haptic('select'); redraw(); });
    Kit.on(sh.el, 'click', '[data-pid]', (e, el)=>{ pick = el.dataset.pid; haptic('select'); $$('.k-opt', sh.el).forEach(b=>{ const on = b.dataset.pid === pick; b.classList.toggle('is-on', on); $('.pick-box', b).innerHTML = on ? String(icon('check')) : ''; }); });
    Kit.on(sh.el, 'click', '[data-c]', (e, el)=>{ np.cat = el.dataset.c; $$('#kCats .chip', sh.el).forEach(b=>b.classList.toggle('is-on', b === el)); });
    sh.el.addEventListener('input', e=>{
      if(e.target.id === 'kQ') Cake.filterRows($('#kCat', sh.el), e.target.value);
      if(e.target.id === 'kName') np.name = e.target.value.trim();
      if(e.target.id === 'kW') np.weightG = parseInt(e.target.value, 10) || 0;
    });
    Kit.on(sh.el, 'click', '[data-a]', (e, el)=>{
      if(el.dataset.a === 'skip') K.marks[row.place] = {status:'skip'};
      else if(mode === 'cat'){
        if(!pick){ Kit.toast('Выберите торт', 'error'); return; }
        K.marks[row.place] = pick === row.productId ? {status:'ok'} : {status:'ok', productId:pick};
      } else {
        if(np.name.length < 2){ Kit.toast('Название', 'error'); return; }
        const old = (K.marks[row.place] || {});
        const same = old.product && old.product.name === np.name && old.product.cat === np.cat && old.product.weightG === np.weightG;
        K.marks[row.place] = Object.assign({status:'ok', product:Object.assign({}, np)}, same && old.createdId ? {createdId:old.createdId} : {});
      }
      K.save(); haptic('success'); sh.close(); K.draw();
    });
  };

  // Загрузка: новые товары → справочник (один раз), затем места всех проверенных
  $('#kLoad').addEventListener('click', async ()=>{
    const rows = K.draft.filter(r=>{ const m = K.mark(r); return m && m.status === 'ok'; });
    if(!rows.length){ Kit.toast('Сначала проверьте места', 'error'); return; }
    const left = K.draft.length - K.draft.filter(r=>K.mark(r)).length;
    const pidOf = r=> { const m = K.mark(r); return m.createdId || m.productId || (m.product ? null : r.productId); };
    const dup = {}; rows.forEach(r=>{ const id = pidOf(r); if(id) (dup[id] = dup[id] || []).push(r.place); });
    const twice = Object.entries(dup).filter(([, ps])=>ps.length > 1).map(([id, ps])=>`${Cake.P(id).name} — места ${ps.join(', ')}`);
    if(twice.length){ Kit.toast('Один торт на двух местах: ' + twice.join('; '), 'error'); haptic('error'); return; }
    const news = rows.filter(r=>K.mark(r).product && !K.mark(r).createdId).length;
    if(!await Kit.confirm(`Загрузить ${rows.length} мест${news ? `, завести новых товаров: ${news}` : ''}?${left ? ` Не проверено ещё ${left} — их можно загрузить позже.` : ''}`, 'Загрузить')) return;
    const btn = $('#kLoad'); Kit.busy(btn, true);
    for(const r of rows){
      const m = K.mark(r);
      if(m.product && !m.createdId){
        const s = await Cake.api('saveProduct', {name:m.product.name, cat:m.product.cat, weightG:m.product.weightG || 0});
        if(!s.ok){ Kit.busy(btn, false); Cake.fail(s); return; }
        m.createdId = s.product.id; K.save();
      }
    }
    const r = await Cake.api('savePlaces', {places:rows.map(x=>({productId:pidOf(x), place:x.place}))});
    Kit.busy(btn, false);
    if(!r.ok){ Cake.fail(r); return; }
    K.places = r.places; await Cake.loadRefs();
    haptic('success'); Kit.toast(`Загружено мест: ${r.saved}. Лист сборки теперь по кругу`, 'ok'); K.draw();
  });
})();
