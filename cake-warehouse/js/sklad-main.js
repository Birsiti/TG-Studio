// изменено 2026-10-18 13:30
/* Запуск экрана кладовщика: иконки, вкладки, кнопка «Обновить». */
(function(){
  "use strict";
  const {html, icon, $, $$, haptic} = Kit;
  const logist = document.body.dataset.role === 'logist';  // logist.html — те же вкладки, свой набор
  $('#mark').innerHTML = icon(logist ? 'route' : 'box');
  if(window.CakeDriverStats) Cake.tabs.drivers = ()=> CakeDriverStats(Cake.api, Cake.refs.staff);
  $('#refreshBtn').innerHTML = icon('refresh');
  $('#searchIc').outerHTML = String(icon('search'));
  $('#tripAdd').innerHTML = html`${icon('plus')}Новый рейс`;
  $('#pkAdd').innerHTML = html`${icon('plus')}Новая заявка`;
  $('#pkAdd').addEventListener('click', ()=> Cake.editOrder(null));
  $('#inFile').innerHTML = html`${icon('upload')}Загрузить приход из файла (Excel, CSV)`;
  $('#pkFile').innerHTML = html`${icon('upload')}Загрузить заявки из файла (Excel, CSV)`;
  $('#inFile').addEventListener('click', ()=> Cake.importFile.income());
  $('#pkFile').addEventListener('click', ()=> Cake.importFile.orders());
  $('#logCsv').innerHTML = html`${icon('download')}Выгрузить CSV`;
  $$('[data-ic]').forEach(el=> el.outerHTML = String(icon(el.dataset.ic)));

  let current = 'stock';
  $('#refreshBtn').addEventListener('click', async ()=>{ haptic('light'); await Cake.loadRefs(); await Cake.loadStock(); Cake.tabs[current](); });
  Kit.ready(async ()=>{
    await Cake.loadRefs(); await Cake.loadStock();
    Kit.tabs({onChange(tab){ current = tab; $('#inBar').classList.toggle('is-hidden', tab !== 'income' || !Cake.incomeLines().length); Cake.tabs[tab](); }});
  });
})();
