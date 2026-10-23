// изменено 2026-10-23 04:30
/* Проверка расчёта погрузки (js/load-plan.js) на заявках маршрута: node db/test_load_plan.js [fixture.json]
   Без файла — маленький пример. Падает с кодом 1, если нарушено правило. */
global.window = {};
const fs = require('fs'), path = require('path');
const L = require(path.join(__dirname, '../js/load-plan.js'));
eval(fs.readFileSync(path.join(__dirname, '../js/geo-points.js'), 'utf8'));
const G = window.CakeGeo;
const fx = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : {
  products:[{id:'a', name:'Торт А', cat:'Торт', weightG:1000, perBox:2}, {id:'b', name:'Пирожное Б', cat:'Пирожное', weightG:300, perBox:12}, {id:'c', name:'Эклер', cat:'Пирожное', weightG:75, perBox:1}],
  stops:[{pointId:'x1', name:'Точка 1', address:'', lines:[{productId:'a', qty:3}, {productId:'b', qty:10}]},
         {pointId:'x2', name:'Точка 2', address:'', lines:[{productId:'a', qty:2}, {productId:'c', qty:25}]}]};
let bad = 0; const fail = m=> { console.log('ОШИБКА:', m); bad++; };
const stops = fx.stops.map(s=> Object.assign({}, s, {geo: G.points[s.pointId] || null}));
// порядок объезда
const withGeo = stops.filter(s=> s.geo), noGeo = stops.filter(s=> !s.geo);
const ord = L.bestOrder([G.sklad].concat(withGeo.map(s=> s.geo)));
if(ord.length !== withGeo.length || new Set(ord).size !== ord.length) fail('порядок объезда не перестановка');
const route = ord.map(i=> withGeo[i - 1]).concat(noGeo);
const lg = L.legs(G.sklad, route, L.DEFAULTS);
console.log('Маршрут:', route.map((s, i)=> `${i + 1}. ${s.name}, ${s.address}`).join('\n  '), `\n  ≈ ${lg.km.toFixed(0)} км, ${Math.round(lg.min)} мин с остановками`);
const pl = L.plan(route, fx.products, {});
// каждый товар выдан полностью и не больше, чем было
const given = {};
pl.sheets.forEach(sh=> sh.take.forEach(t=>{ const s = t.from.reduce((a, f)=> a + f.qty, 0); if(s !== t.qty) fail(`точка ${sh.i + 1}: ${t.item.name} взято ${s} из ${t.qty}`); given[t.item.productId] = (given[t.item.productId] || 0) + s; }));
pl.items.forEach(it=>{ if(given[it.productId] !== it.total) fail(`${it.name}: выдано ${given[it.productId]} из ${it.total}`); });
// ящиков сколько надо; в столбе не больше слоёв
pl.items.forEach(it=>{ if(it.boxes !== Math.ceil(it.total / it.perBox)) fail(`${it.name}: ящиков ${it.boxes}`); });
pl.stacks.forEach(st=>{ if(st.boxes.length > st.cap) fail(`столб ${st.id} выше ${st.cap}`); if(st.boxes.some(b=> b.cake !== st.cake)) fail(`столб ${st.id}: торты вперемешку`); });
// последним погрузили — первым выгрузили: в столбе снизу вверх точка открытия не растёт
pl.stacks.forEach(st=>{ for(let i = 1; i < st.boxes.length; i++) if(st.boxes[i].open > st.boxes[i - 1].open) fail(`столб ${st.id}: сверху ящик для более поздней точки`); });
// места у стены (за столбом у прохода) — только если у прохода места кончились
const deepUsed = pl.stacks.some(s=> s.slot.deep > 0), nearAll = pl.slots.filter(s=> s.deep === 0).length;
if(deepUsed && pl.stacks.filter(s=> s.slot.deep === 0).length < nearAll) fail('занято место у стены, хотя у прохода есть свободное');
console.log(`Ящиков ${pl.boxes.length}, столбов ${pl.stacks.length} из ${pl.slots.length} мест, в проходе ${pl.inAisle} (свободен после точки ${pl.aisleFreeAfter + 1}), не влезло ${pl.over.length}, ≈ ${pl.kg.toFixed(0)} кг, без «шт в ящике»: ${pl.unknown.length}`);
pl.sheets.forEach(sh=> console.log(`  ${sh.i + 1}. ${sh.stop.name}: ${sh.take.length} поз., опустеет ящиков ${sh.emptied}, пустых всего ${sh.emptyTotal}, ${sh.fits ? 'место есть' : 'НЕТ МЕСТА'}`));
console.log(bad ? `Нарушений: ${bad}` : 'Все проверки прошли');
process.exit(bad ? 1 : 0);
