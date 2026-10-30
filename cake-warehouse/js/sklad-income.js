// изменено 2026-10-22 01:15
/* Вкладка «Приход»: сколько тортов пришло с производства. */
(function(){
  "use strict";
  const {html, icon, $, $$, date: D, num, haptic} = Kit;
  const {api, P, W, L, C, S, T, CATS, byCat, filterRows, nameKey, pcs, fail, stockOf, loadStock, thumb} = Cake;

  // Список строим заново только при новом справочнике: переход по вкладкам не стирает введённое
  let built = null;
  function renderIncome(){
    if(built === Cake.refs){ inTotal(); return; }
    const keep = {}; inLines().forEach(l=> keep[l.productId] = l.qty);
    built = Cake.refs;
    if(!$('#inDate').value) $('#inDate').value = D.today();
    const act = Cake.refs.products.filter(p=>p.active);
    $('#inQ').value = '';
    $('#inList').innerHTML = String(byCat(act, p=>html`<div class="qrow" data-row="${p.id}" data-name="${nameKey(p)}">
      ${thumb(p)}<span class="qrow-name">${Kit.nobr(p.name)}<small>${W(p.weightG)} · на складе ${stockOf(p.id)}</small></span>
      <input class="input" type="number" inputmode="numeric" min="0" placeholder="0" data-in="${p.id}" value="${keep[p.id] || ''}">
    </div>`));
    inTotal();
  }
  function inLines(){ return $$('[data-in]').map(el=>({productId:el.dataset.in, qty:parseInt(el.value, 10) || 0})).filter(l=>l.qty > 0); }
  function inTotal(){
    const t = inLines().reduce((s, l)=>s + l.qty, 0);
    $('#inTotal').textContent = pcs(t);
    $$('[data-row]').forEach(r=> r.classList.toggle('is-on', (parseInt($('[data-in]', r).value, 10) || 0) > 0));
    $('#inBar').classList.toggle('is-hidden', !t);
  }
  $('#inList').addEventListener('input', inTotal);
  $('#inQ').addEventListener('input', Kit.debounce(()=> filterRows($('#inList'), $('#inQ').value), 100));
  $('#inSave').addEventListener('click', async ()=>{
    const lines = inLines();
    if(!lines.length) return;
    Kit.busy($('#inSave'), true);
    const r = await api('addIncome', {date:$('#inDate').value || D.today(), note:$('#inNote').value.trim(), lines});
    Kit.busy($('#inSave'), false);
    if(!r.ok){ fail(r); return; }
    haptic('success'); Kit.toast(`Оприходовано ${pcs(r.added)}`, 'ok');
    $('#inNote').value = '';
    $$('[data-in]').forEach(el=> el.value = '');  // оприходовано — поля пустые, остатки в строках свежие
    built = null; await loadStock(); renderIncome();
  });

  Cake.tabs.income = renderIncome;
  Cake.incomeLines = inLines;
})();
