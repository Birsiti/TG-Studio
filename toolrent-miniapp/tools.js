// изменено 2026-10-08 02:30
/* ============================================================
   tools.js — общее для трёх ролей проката: иконки инструмента
   (48×48, линия) и подписи статусов.
   ============================================================ */
window.Tools = (function(){
  "use strict";
  const P = {
    drill:'<path d="M5 15h23a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H5z"/><path d="M32 21h11"/><path d="M14 27l-3 13h9l2-13"/><path d="M5 19h5M5 23h5"/>',
    grinder:'<path d="M5 19h20a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3H5z"/><circle cx="36" cy="24" r="9"/><path d="M31 15a9 9 0 0 1 0 18"/><path d="M12 28v7h6"/>',
    mixer:'<path d="M11 9l22 7-5 18-19-5z"/><path d="M15 15l14 4"/><path d="M22 33l-6 9M27 34l7 8"/><circle cx="14" cy="43" r="2.5"/><path d="M32 43h9"/>',
    scaffold:'<path d="M9 5v38M39 5v38M9 11h30M9 24h30M9 37h30"/><path d="M9 11l30 13M9 24l30 13"/>',
    trimmer:'<path d="M40 5L17 34"/><path d="M12 31l9 6-5 6H6z"/><rect x="31" y="6" width="9" height="6" rx="1" transform="rotate(-38 35 9)"/><path d="M27 18l7 5"/>',
    mower:'<path d="M7 29h27l4-9H12z"/><circle cx="14" cy="35" r="4"/><circle cx="31" cy="35" r="4"/><path d="M37 21l6-15"/><path d="M41 6h4"/>',
    level:'<rect x="9" y="19" width="30" height="12" rx="2"/><circle cx="24" cy="25" r="3"/><path d="M24 4v9M13 8l5 6M35 8l-5 6"/><path d="M17 31l-4 13M31 31l4 13M24 31v13"/>',
    cutter:'<rect x="5" y="16" width="22" height="12" rx="3"/><circle cx="34" cy="26" r="8"/><circle cx="34" cy="26" r="2"/><path d="M13 28l-2 9h8"/><path d="M5 20h5"/>',
    saw:'<circle cx="28" cy="27" r="12"/><circle cx="28" cy="27" r="3"/><path d="M5 17h15l5 5"/><path d="M8 17v-6h11"/><path d="M28 15v-2M40 27h2M28 39v2M16 27h-2"/>',
    vacuum:'<rect x="14" y="9" width="20" height="27" rx="6"/><path d="M14 17h20"/><circle cx="18" cy="40" r="3"/><circle cx="30" cy="40" r="3"/><path d="M34 21c9 0 9 11 0 11"/>',
    sander:'<circle cx="34" cy="13" r="9"/><circle cx="34" cy="13" r="3"/><path d="M28 20L10 41"/><path d="M6 37l8 8"/><path d="M22 27l3 3"/>',
    generator:'<rect x="5" y="13" width="38" height="23" rx="3"/><path d="M5 21h38"/><path d="M14 13V9h20v4"/><path d="M25 25l-3 5h6l-3 5"/><path d="M10 36v5M38 36v5"/>',
    ladder:'<path d="M14 5l-5 38M34 5l5 38M13 13h22M12 22h24M11 31h26M10 40h28"/>'
  };
  function art(name, cls){
    return Kit.raw('<svg class="' + (cls || '') + '" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || P.drill) + '</svg>');
  }
  const STATUS = {
    pending:['Ждёт выдачи','pill-warn'], active:['В аренде','pill-accent'], overdue:['Просрочено','pill-danger'],
    returned:['Возвращено','pill-ok'], cancelled:['Отменено','pill-muted']
  };
  const UNIT = {free:'Свободна', rented:'В аренде', repair:'Ремонт', retired:'Списана'};
  const DELIVERY = {new:'Новая', on_way:'В пути', delivered:'Доставлено'};
  function status(s){ const x = STATUS[s] || [s, '']; return Kit.html`<span class="pill ${x[1]}">${x[0]}</span>`; }
  function period(b){ return Kit.date.label(b.from) + ' — ' + Kit.date.label(b.to).toLowerCase(); }
  return {art, ICONS:Object.keys(P), STATUS, UNIT, DELIVERY, status, period};
})();
