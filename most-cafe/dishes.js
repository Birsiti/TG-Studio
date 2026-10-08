// изменено 2026-10-08 03:10
/* ============================================================
   dishes.js — иконки блюд кафе «МОСТ» (48×48, линия, без эмодзи)
   и денежный формат с копейками. Общее для гостя и админки.
   ============================================================ */
window.Dish = (function(){
  "use strict";
  const P = {
    dumpling:'<path d="M5 30c0-9 8.5-16 19-16s19 7 19 16z"/><path d="M5 30h38"/><path d="M12 21c1 3 1 6 0 9M18 17c1 4 1 9 0 13M24 15v15M30 17c-1 4-1 9 0 13M36 21c-1 3-1 6 0 9"/>',
    bun:'<path d="M7 34c0-11 7.6-20 17-20s17 9 17 20z"/><path d="M5 34h38"/><path d="M19 17c2 2.5 8 2.5 10 0"/><path d="M16 22c3 3.5 13 3.5 16 0"/>',
    onigiri:'<path d="M24 7c3 0 19 25 19 29a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4C5 32 21 7 24 7z"/><path d="M16 30h16v10H16z"/>',
    pancake:'<ellipse cx="24" cy="32" rx="18" ry="6"/><ellipse cx="24" cy="25" rx="16" ry="5.5"/><path d="M31 9c-2.5 2.5-2.5 5 0 7.5"/><path d="M18 24l2 1M27 23l2 1M23 27l2 .5"/>',
    espresso:'<path d="M13 19h19v7a9.5 9.5 0 0 1-19 0z"/><path d="M32 21h3a3.5 3.5 0 0 1 0 7h-4"/><path d="M7 39h33"/><path d="M19 8c-2 2.5 2 4.5 0 7M26 8c-2 2.5 2 4.5 0 7"/>',
    cup:'<path d="M11 15h23v17a8 8 0 0 1-8 8h-7a8 8 0 0 1-8-8z"/><path d="M34 19h3a4.5 4.5 0 0 1 0 9h-3"/><path d="M18 5c-2 2.5 2 4.5 0 7M25 5c-2 2.5 2 4.5 0 7"/>',
    latte:'<path d="M13 7h22l-3 34H16z"/><path d="M14.5 18h19"/><path d="M24 25.5c-2-2.5-6 0-3.5 3.5L24 32l3.5-3c2.5-3.5-1.5-6-3.5-3.5z"/>',
    soup:'<path d="M5 22h38a19 19 0 0 1-38 0z"/><path d="M17 7c-2 3 2 5 0 8M24 5c-2 3 2 5 0 8M31 7c-2 3 2 5 0 8"/>',
    noodles:'<path d="M5 24h38a19 19 0 0 1-38 0z"/><path d="M31 3l-6 21M39 6L28 24"/><path d="M12 24c2-4.5 4.5-4.5 6.5 0s4.5 4.5 6.5 0"/>',
    salad:'<path d="M5 24h38a19 19 0 0 1-38 0z"/><path d="M13 24c0-6.5 4.5-11 11-11"/><path d="M24 24c0-5.5 3.5-10 10-10"/><path d="M19 24c-2.5-4.5-1-9 3.5-11"/>',
    sandwich:'<path d="M5 30L24 11l19 19z"/><path d="M5 30h38v4H5zM9 34h30v5H9z"/>',
    croissant:'<path d="M10 33c-4-2-6-7-4-11 2-3 6-3 9 0"/><path d="M38 33c4-2 6-7 4-11-2-3-6-3-9 0"/><path d="M15 22l9-11 9 11-9 18z"/><path d="M19 17l5 8 5-8"/>',
    cake:'<path d="M7 37V25l34-11v23z"/><path d="M7 25l34-11"/><path d="M7 31h34"/><circle cx="34" cy="9" r="2.5"/><path d="M34 11.5V15"/>',
    cookie:'<circle cx="24" cy="24" r="17"/><circle cx="18" cy="17" r="1.8"/><circle cx="29" cy="20" r="1.8"/><circle cx="20" cy="29" r="1.8"/><circle cx="30" cy="30" r="1.8"/>',
    water:'<path d="M20 4h8v6l4 6v24a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4V16l4-6z"/><path d="M16 23h16M16 33h16"/>',
    tea:'<path d="M9 18h30l-3 18a6 6 0 0 1-6 5H18a6 6 0 0 1-6-5z"/><path d="M7 18h34"/><path d="M19 7c-2 2.5 2 4.5 0 7M27 7c-2 2.5 2 4.5 0 7"/>',
    lemonade:'<path d="M12 12h24l-4 30H16z"/><path d="M28 3l-4 17"/><circle cx="34" cy="13" r="5.5"/><path d="M34 7.5v11M28.5 13h11"/><path d="M14 23h20"/>',
    rice:'<path d="M5 26h38a19 19 0 0 1-38 0z"/><path d="M10 26c2-8 8-13 14-13s12 5 14 13"/><path d="M33 4l7 15M38 3l4 15"/>'
  };
  function art(name){ return Kit.raw('<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || P.bun) + '</svg>'); }
  function plate(name, cls){ return Kit.html`<span class="plate ${cls || ''}">${art(name)}</span>`; }
  function money(n){ return Kit.num(Math.round(n * 100) / 100, 2) + ' BYN'; }
  return {art, plate, money, ICONS:Object.keys(P)};
})();
