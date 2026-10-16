// изменено 2026-10-17 01:30
/* Вкладка «Остатки»: список по категориям, пересчёт и списание. */
(function(){
  "use strict";
  const {html, icon, $, $$, date: D, num, haptic} = Kit;
  const {api, P, W, L, C, S, T, CATS, byCat, filterRows, nameKey, pcs, fail, stockOf, loadStock} = Cake;

  async function renderStock(){
    const r = await loadStock();
    if(!r.ok){ fail(r); return; }
    const low = Cake.stock.filter(i=>i.minQty && i.qty < i.minQty).length;
    $('#stockSub').textContent = `${pcs(r.total)} на складе` + (low ? ` · мало: ${low}` : '');
    drawStock();
  }
  let stockCat = '', stockNonZero = false;
  function drawStock(){
    const q = $('#q').value.trim().toLowerCase();
    $('#stockCats').innerHTML = String(html`<button type="button" class="chip${stockCat ? '' : ' is-on'}" data-c="">Все</button>${CATS().map(c=>html`<button type="button" class="chip${stockCat === c ? ' is-on' : ''}" data-c="${c}">${c}</button>`)}<button type="button" class="chip${stockNonZero ? ' is-on' : ''}" data-nz="1">Есть на складе</button>`);
    const list = Cake.stock.filter(i=>(!q || nameKey(i).includes(q)) && (!stockCat || i.cat === stockCat) && (!stockNonZero || i.qty > 0));
    $('#stockList').innerHTML = list.length ? String(byCat(list, i=>html`<button class="row" type="button" data-p="${i.id}">
      <span class="row-main"><span class="row-title">${Kit.nobr(i.name)} <span class="hint nowrap">${W(i.weightG)}</span></span>
        <span class="row-sub">${i.lastIn ? 'приход ' + D.label(i.lastIn).toLowerCase() : 'прихода не было'}${i.onRoad ? ' · в пути ' + i.onRoad : ''}</span></span>
      <span class="row-end"><span class="qty${i.minQty && i.qty < i.minQty ? ' is-low' : ''}">${num(i.qty)}<span class="qty-unit">шт</span></span>
        ${i.minQty && i.qty < i.minQty ? html`<span class="pill pill-danger">мало</span>` : ''}</span>
    </button>`, true)) : String(html`<div class="empty">${icon('search')}<div class="empty-title">Ничего не нашлось</div></div>`);
  }
  $('#q').addEventListener('input', Kit.debounce(drawStock, 120));
  Kit.on($('#stockCats'), 'click', '.chip', (e, el)=>{ if(el.dataset.nz) stockNonZero = !stockNonZero; else stockCat = el.dataset.c; haptic('select'); drawStock(); });
  Kit.on($('#stockList'), 'click', '[data-p]', (e, el)=> openProduct(Cake.stock.find(x=>x.id === el.dataset.p)));

  function openProduct(i){
    if(!i) return;
    const sh = Kit.sheet({title:L(i.id), sub:`${i.cat} · на складе ${pcs(i.qty)}`, body: html`
      <div class="kv"><span class="k">Срок годности</span><span class="v">${i.shelfDays ? Kit.plural(i.shelfDays, 'сутки', 'суток', 'суток') : '—'}</span></div>
      <div class="kv"><span class="k">Минимальный остаток</span><span class="v">${i.minQty || '—'}</span></div>
      <div class="kv"><span class="k">В пути</span><span class="v">${pcs(i.onRoad)}</span></div>
      <div class="section"><div class="eyebrow" style="margin-bottom:8px">Действие</div>
        <div class="seg" id="pMode"><button type="button" data-v="count" class="is-on">Пересчитать</button><button type="button" data-v="off">Списать</button></div></div>
      <label class="field section"><span class="field-label" id="pQtyLbl">Насчитали по факту, шт</span><input class="input" id="pQty" type="number" inputmode="numeric" min="0" value="${i.qty}"></label>
      <label class="field" id="pWhyBox" hidden><span class="field-label">Причина</span><input class="input" id="pWhy" maxlength="200" placeholder="Истёк срок, помят, брак"></label>`,
      actions: html`<button class="btn btn-primary btn-block" type="button" id="pGo">Сохранить</button>`});
    let mode = 'count';
    Kit.on(sh.$('#pMode'), 'click', '[data-v]', (e, el)=>{
      mode = el.dataset.v; $$('#pMode button', sh.el).forEach(b=>b.classList.toggle('is-on', b === el)); haptic('select');
      sh.$('#pQtyLbl').textContent = mode === 'count' ? 'Насчитали по факту, шт' : 'Сколько списать, шт';
      sh.$('#pQty').value = mode === 'count' ? i.qty : 1; sh.$('#pWhyBox').hidden = mode === 'count';
    });
    sh.$('#pGo').addEventListener('click', async ()=>{
      const n = parseInt(sh.$('#pQty').value, 10);
      if(!(n >= 0)){ Kit.toast('Укажите количество', 'error'); return; }
      const btn = sh.$('#pGo'); Kit.busy(btn, true);
      const r = mode === 'count' ? await api('adjustStock', {productId:i.id, actual:n}) : await api('writeOff', {productId:i.id, qty:n, reason:sh.$('#pWhy').value.trim()});
      Kit.busy(btn, false);
      if(!r.ok){ fail(r); return; }
      haptic('success'); sh.close();
      Kit.toast(mode === 'count' ? (r.delta ? `Расхождение ${r.delta > 0 ? '+' : ''}${r.delta} — записано` : 'Сошлось') : 'Списано', 'ok');
      renderStock();
    });
  }

  Cake.tabs.stock = renderStock;
})();
