// изменено 2026-10-17 01:30
/* Вкладка «Приход»: сколько тортов пришло с производства. */
(function(){
  "use strict";
  const {html, icon, $, $$, date: D, num, haptic} = Kit;
  const {api, P, W, L, C, S, T, CATS, byCat, filterRows, nameKey, pcs, fail, stockOf, loadStock} = Cake;

  function renderIncome(){
    $('#inDate').value = D.today();
    const act = Cake.refs.products.filter(p=>p.active);
    $('#inQ').value = '';
    $('#inList').innerHTML = String(byCat(act, p=>html`<div class="qrow" data-row="${p.id}" data-name="${nameKey(p)}">
      <span class="qrow-name">${Kit.nobr(p.name)}<small>${W(p.weightG)} · на складе ${stockOf(p.id)}</small></span>
      <input class="input" type="number" inputmode="numeric" min="0" placeholder="0" data-in="${p.id}">
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
    await loadStock(); renderIncome();
  });

  Cake.tabs.income = renderIncome;
  Cake.incomeLines = inLines;
})();
