const test = require('node:test');
const assert = require('node:assert/strict');
const { roleOf, keyboard, idsOf } = require('../src/roles');
const { diffTrips } = require('../src/events');
const texts = require('../src/texts');
const { dayKey } = require('../src/digest-job');

const staff = [
  { id: 'sk', name: 'Анна', role: 'storekeeper', tgId: '100', active: true },
  { id: 'dr', name: 'Иван', role: 'driver', tgId: '200', active: true },
  { id: 'old', name: 'Олег', role: 'driver', tgId: '300', active: false },
];
const refs = {
  products: [{ id: 'p1', name: 'Сникерс', weightG: 800 }, { id: 'p2', name: 'Медок', weightG: 75 }],
  cities: [{ id: 'c1', name: 'Брест' }], staff, tara: [{ id: 'box', name: 'Ящик' }],
};
const L = texts.makeLookup(refs);

test('роль: руководитель из ADMIN_IDS, сотрудник по tgId, уволенный — без доступа', () => {
  assert.equal(roleOf(1, staff, ['1']), 'admin');
  assert.equal(roleOf(100, staff, []), 'storekeeper');
  assert.equal(roleOf('200', staff, []), 'driver');
  assert.equal(roleOf(300, staff, []), null);
  assert.equal(roleOf(999, staff, []), null);
  assert.deepEqual(idsOf(staff, 'driver'), ['200']);
});

test('кнопки Web App ведут на страницы своей роли', () => {
  const kb = keyboard('driver', 'https://x.io/cw');
  assert.equal(kb[0][0].web_app.url, 'https://x.io/cw/driver.html');
  assert.equal(keyboard('admin', 'https://x.io/cw').length, 3);
  assert.deepEqual(keyboard(null, 'https://x.io/cw'), []);
});

test('события: первый запуск молчит, дальше — только переходы', () => {
  const t1 = [{ id: 'a', status: 'draft' }, { id: 'b', status: 'shipped' }];
  let r = diffTrips(null, t1);
  assert.equal(r.events.length, 0);
  r = diffTrips(r.next, [{ id: 'a', status: 'shipped' }, { id: 'b', status: 'shipped' }]);
  assert.deepEqual(r.events.map((e) => [e.kind, e.trip.id]), [['shipped', 'a']]);
  r = diffTrips(r.next, [{ id: 'a', status: 'reported' }, { id: 'c', status: 'draft' }]);
  assert.deepEqual(r.events.map((e) => e.kind), ['reported']);
  assert.equal(r.next.b, 'shipped'); // выпал из окна — помним, повторно не шлём
  r = diffTrips(r.next, [{ id: 'b', status: 'shipped' }]);
  assert.equal(r.events.length, 0);
});

test('тексты: отгрузка водителю и отчёт кладовщику', () => {
  const trip = { num: 7, cityId: 'c1', driverId: 'dr', lines: [{ productId: 'p1', qty: 3 }, { productId: 'p2', qty: 2 }], taraOut: [{ taraId: 'box', qty: 4 }],
    report: JSON.stringify({ returns: [{ productId: 'p1', back: 1, spoiled: 1 }], taraBack: [{ taraId: 'box', qty: 3 }], comment: 'помяли' }) };
  const s = texts.shippedForDriver(trip, L);
  assert.match(s, /Рейс №7 · Брест/);
  assert.match(s, /Сникерс, 800 г — 3/);
  assert.match(s, /Медок, 75 г — 2/);
  assert.match(s, /Всего 5 шт/);
  assert.match(s, /Ящиков выдано: 4/);
  const r = texts.reportedForStore(trip, L);
  assert.match(r, /Иван сдал отчёт/);
  assert.match(r, /1 шт целых, брак 1/);
  assert.match(r, /Ящики: выдано 4, сдаёт 3, не хватает 1/);
  assert.match(texts.closedForDriver({ ...trip, lines: [{ delivered: 4 }], taraBack: [{ taraId: 'box', qty: 3 }] }, L), /выдано 4, принято 3 — долг по рейсу 1/);
  assert.match(r, /помяли/);
  assert.match(texts.reportedForStore({ ...trip, report: '' }, L), /Возврата нет/);
});

test('сводка за вчера', () => {
  const moves = [
    { type: 'in', qty: 50 }, { type: 'ship', qty: -7, cityId: 'c1' }, { type: 'ship', qty: -3, cityId: 'c1' },
    { type: 'return', qty: 1 }, { type: 'writeoff', qty: -2 },
  ];
  const overview = { stockTotal: 120, lowStock: ['Сникерс'] };
  const trips = [{ num: 7, cityId: 'c1', status: 'reported' }];
  const tara = { drivers: [{ name: 'Иван Кравец', debt: 6 }, { name: 'Павел Гриб', debt: 0 }, { name: 'Артур Лис', debt: 9 }] };
  const d = texts.digest({ day: '16.10.2026', moves, overview, trips, tara }, L);
  assert.match(d, /Приход: 50 шт/);
  assert.match(d, /Отгружено: 10 шт\n• Брест — 10/);
  assert.match(d, /Списано: 2 шт/);
  assert.match(d, /Мало: Сникерс/);
  assert.match(d, /Ждут приёмки: Рейс №7 · Брест/);
  assert.match(d, /Ящики за водителями: Артур 9, Иван 6 \(всего 15\)/);
});

test('вчерашняя дата считается в часовом поясе Минска', () => {
  const t = new Date('2026-10-16T22:30:00Z'); // в Минске уже 17-е, 01:30
  assert.equal(dayKey(0, t, 'Europe/Minsk'), '2026-10-17');
  assert.equal(dayKey(-1, t, 'Europe/Minsk'), '2026-10-16');
});
