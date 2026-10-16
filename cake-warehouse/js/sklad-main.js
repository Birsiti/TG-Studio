// изменено 2026-10-17 01:30
/* Запуск экрана кладовщика: иконки, вкладки, кнопка «Обновить». */
(function(){
  "use strict";
  const {html, icon, $, $$, haptic} = Kit;
  $('#mark').innerHTML = icon('box');
  $('#refreshBtn').innerHTML = icon('refresh');
  $('#searchIc').outerHTML = String(icon('search'));
  $('#tripAdd').innerHTML = html`${icon('plus')}Новый рейс`;
  $('#logCsv').innerHTML = html`${icon('download')}Выгрузить CSV`;
  $$('[data-ic]').forEach(el=> el.outerHTML = String(icon(el.dataset.ic)));

  let current = 'stock';
  $('#refreshBtn').addEventListener('click', async ()=>{ haptic('light'); await Cake.loadRefs(); await Cake.loadStock(); Cake.tabs[current](); });
  Kit.ready(async ()=>{
    await Cake.loadRefs(); await Cake.loadStock();
    Kit.tabs({onChange(tab){ current = tab; $('#inBar').classList.toggle('is-hidden', tab !== 'income' || !Cake.incomeLines().length); Cake.tabs[tab](); }});
  });
})();
