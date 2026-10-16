// изменено 2026-10-17 09:10
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
    const vals = K.pack(row);  // вес и шт в грузовом месте — обязательно для любого режима
    const packFields = ()=> html`<div class="field-row">
        <label class="field"><span class="field-label">Вес, г (на упаковке)</span><input class="input" id="kW" type="number" inputmode="numeric" min="1" value="${vals.weightG || ''}" placeholder="850"></label>
        <label class="field"><span class="field-label">Шт в 1 грузовом месте</span><input class="input" id="kBox" type="number" inputmode="numeric" min="1" value="${vals.perBox}"></label></div>
      <p class="hint">Например, 10 пирожных в одной коробке — 10. Торт в своей коробке — 1.</p>`;
    const prodRow = p=> html`<button class="qrow k-opt${p.id === pick ? ' is-on' : ''}" type="button" data-pid="${p.id}" data-name="${Cake.nameKey(p)}">
      <span class="qrow-name">${Kit.nobr(p.name)}<small>${p.cat} · ${Cake.W(p.weightG) || 'вес ?'}</small></span><span class="pick-box">${p.id === pick ? icon('check') : ''}</span></button>`;
    const body = ()=> html`
      ${row.note ? html`<p class="mode-note">${icon('alert')} ${row.note}</p>` : ''}
      ${packFields()}
      <div class="seg seg-grid section"><button type="button" data-m="cat" class="${mode === 'cat' ? 'is-on' : ''}">Из ассортимента</button><button type="button" data-m="new" class="${mode === 'new' ? 'is-on' : ''}">Новый товар</button></div>
      ${mode === 'cat' ? html`
        ${sameName.length ? html`<div class="eyebrow section" style="margin-bottom:4px">Похожие</div><div class="card">${sameName.map(prodRow)}</div>` : ''}
        <div class="search section"><span>${icon('search')}</span><input class="input" id="kQ" type="search" placeholder="Найти торт" autocomplete="off"></div>
        <div class="section" id="kCat">${Cake.byCat(Cake.refs.products.filter(p=>p.active), prodRow)}</div>`
      : html`
        <label class="field section"><span class="field-label">Название (как на упаковке)</span><input class="input" id="kName" maxlength="80" value="${np.name}"></label>
        <div class="eyebrow section" style="margin-bottom:8px">Категория</div>
        <div class="chips" id="kCats">${Cake.CATS().map(c=>html`<button class="chip${c === np.cat ? ' is-on' : ''}" type="button" data-c="${c}">${c}</button>`)}</div>
`}`;
    const sh = Kit.sheet({title:`Место ${row.place}`, sub:'Что стоит на этом месте', body:body(), actions: html`
      <button class="btn btn-danger-soft" type="button" data-a="skip">${icon('trash')}</button>
      <button class="btn btn-primary btn-block" type="button" data-a="ok">${icon('check')}Верно</button>`});
    const redraw = ()=>{ sh.body.innerHTML = String(body()); };
    Kit.on(sh.el, 'click', '[data-m]', (e, el)=>{ mode = el.dataset.m; haptic('select'); redraw(); });
    Kit.on(sh.el, 'click', '[data-pid]', (e, el)=>{ pick = el.dataset.pid; haptic('select');
      const pp = Cake.P(pick); vals.weightG = pp.weightG || 0; vals.perBox = pp.perBox || 1; $('#kW', sh.el).value = vals.weightG || ''; $('#kBox', sh.el).value = vals.perBox; $$('.k-opt', sh.el).forEach(b=>{ const on = b.dataset.pid === pick; b.classList.toggle('is-on', on); $('.pick-box', b).innerHTML = on ? String(icon('check')) : ''; }); });
    Kit.on(sh.el, 'click', '[data-c]', (e, el)=>{ np.cat = el.dataset.c; $$('#kCats .chip', sh.el).forEach(b=>b.classList.toggle('is-on', b === el)); });
    sh.el.addEventListener('input', e=>{
      if(e.target.id === 'kQ') Cake.filterRows($('#kCat', sh.el), e.target.value);
      if(e.target.id === 'kName') np.name = e.target.value.trim();
      if(e.target.id === 'kW') vals.weightG = parseInt(e.target.value, 10) || 0;
      if(e.target.id === 'kBox') vals.perBox = Math.max(1, parseInt(e.target.value, 10) || 1);
    });
    Kit.on(sh.el, 'click', '[data-a]', (e, el)=>{
      const pack = {weightG:vals.weightG, perBox:vals.perBox};
      if(el.dataset.a === 'skip') K.marks[row.place] = {status:'skip'};
      else if(!vals.weightG){ Kit.toast('Укажите вес с упаковки', 'error'); haptic('warning'); return; }
      else if(mode === 'cat'){
        if(!pick){ Kit.toast('Выберите торт', 'error'); return; }
        K.marks[row.place] = Object.assign({status:'ok'}, pick === row.productId ? {} : {productId:pick}, pack);
      } else {
        if(np.name.length < 2){ Kit.toast('Название', 'error'); return; }
        const old = (K.marks[row.place] || {}), prod = Object.assign({}, np, pack);
        const same = old.product && old.product.name === prod.name && old.product.cat === prod.cat;
        K.marks[row.place] = Object.assign({status:'ok', product:prod}, pack, same && old.createdId ? {createdId:old.createdId} : {});
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
        const s = await Cake.api('saveProduct', {name:m.product.name, cat:m.product.cat, weightG:m.weightG, perBox:m.perBox});
        if(!s.ok){ Kit.busy(btn, false); Cake.fail(s); return; }
        m.createdId = s.product.id; K.save();
        continue;
      }
      const p = Cake.P(pidOf(r));  // вес и шт в коробке поправили на проверке — обновляем товар целиком
      if(p.id && m.weightG && (p.weightG !== m.weightG || (p.perBox || 1) !== m.perBox)){
        const s = await Cake.api('saveProduct', Object.assign({}, p, {weightG:m.weightG, perBox:m.perBox}));
        if(!s.ok){ Kit.busy(btn, false); Cake.fail(s); return; }
        await Cake.loadRefs();
      }
    }
    const r = await Cake.api('savePlaces', {places:rows.map(x=>({productId:pidOf(x), place:x.place}))});
    Kit.busy(btn, false);
    if(!r.ok){ Cake.fail(r); return; }
    K.places = r.places; await Cake.loadRefs();
    haptic('success'); Kit.toast(`Загружено мест: ${r.saved}. Лист сборки теперь по кругу`, 'ok'); K.draw();
  });
})();
