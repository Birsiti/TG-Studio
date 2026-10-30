// изменено 2026-10-25 12:45
const test = require('node:test');
const assert = require('node:assert/strict');
const { roleOf, menuButton, idsOf } = require('../src/roles');
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

test('новый пользователь: руководителю — имя, @ник и id; без роли — подсказка, куда вписать', () => {
  const t = texts.newVisitor({ id: 555, first_name: 'Пётр', last_name: 'Ус', username: 'petr' }, null);
  assert.match(t, /Пётр Ус \(@petr\), id 555/);
  assert.match(t, /^🎂 /);
  assert.match(t, /Справочники/);
  assert.match(texts.newVisitor({ id: 7, first_name: 'Иван' }, 'driver'), /Иван, id 7 — водитель/);
});

test('гостевой вход /demo: до конца дня, на N дней, off; гость — сообщение руководителю', () => {
  const { demoCommand, demoOpen } = require('../src/commands');
  assert.equal(demoCommand('/demo', '2026-10-18'), '2026-10-18');
  assert.equal(demoCommand('/demo 3', '2026-10-31'), '2026-11-02');
  assert.equal(demoCommand('/demo off', '2026-10-18'), null);
  assert.equal(demoOpen('2026-10-18', '2026-10-18'), true);
  assert.equal(demoOpen('2026-10-18', '2026-10-19'), false);
  assert.equal(demoOpen(null, '2026-10-18'), false);
  assert.match(texts.newVisitor({ id: 9, first_name: 'Ольга' }, null, true), /^🎂 Гость открыл демо: Ольга, id 9/);
  assert.match(texts.demoState('2026-10-18'), /18\.10\.2026/);
  assert.ok(texts.guestWelcome('Ольга').length < 4096);
  assert.ok(texts.BOT_DESCRIPTION.length <= 512 && texts.BOT_SHORT.length <= 120);
});

test('водителю при отгрузке — точки маршрута по порядку с адресами', () => {
  const t = { num: 5, cityId: 'c1', driverId: 'dr', lines: [{ productId: 'p1', qty: 3 }], taraOut: [],
    stops: [{ num: 'A-1', customer: 'Зорина', address: 'Минск, Гинтовта 12', qty: 2 }, { num: 'A-2', customer: 'Кафе', address: 'Минск, Притыцкого 1', qty: 1 }] };
  const m = texts.shippedForDriver(t, L);
  assert.match(m, /1\. №A-1 — Зорина, Минск, Гинтовта 12 \(2 шт\)\n2\. №A-2/);
});

test('точка с замечаниями — складу: что и сколько, комментарий, фото', () => {
  const t = { num: 5, cityId: 'c1', driverId: 'dr', lines: [], taraOut: [] };
  const s = { num: 'A-1', customer: 'Зорина', address: 'Минск, Гинтовта 12', photos: 2,
    report: { ok: false, at: 'x', comment: 'помята коробка', lines: [{ productId: 'p1', short: 1, spoiled: 2, resort: 0 }, { productId: 'p2', short: 0, spoiled: 0, resort: 1, resortTo: 'p1' }] } };
  const m = texts.stopIssue(t, s, L);
  assert.match(m, /точка №A-1 сдана с замечаниями/);
  assert.match(m, /недостача 1, брак 2/);
  assert.match(m, /пересорт 1 \(привезли Сникерс/);
  assert.match(m, /«помята коробка»/);
  assert.match(m, /Фото: 2/);
});

test('кнопка «Открыть» внизу ведёт на главную приложения', () => {
  const m = menuButton('https://x.io/cw');
  assert.equal(m.type, 'web_app');
  assert.equal(m.text, 'Открыть');
  assert.equal(m.web_app.url, 'https://x.io/cw/index.html');
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

test('сборка: событие «собрано» и текст руководителю', () => {
  const { diffOrders } = require('../src/events');
  let r = diffOrders(null, [{ id: 'o1', status: 'new' }]);
  assert.equal(r.events.length, 0);
  const o = { id: 'o1', num: '1103609', status: 'picked', route: 'Маршрут 3', picker: 'Кобзев', boxes: 6,
    lines: [{ productId: 'p1', qty: 50, bonus: 0 }, { productId: 'p2', qty: 0, bonus: 2 }] };
  r = diffOrders(r.next, [o]);
  assert.deepEqual(r.events.map((e) => e.kind), ['picked']);
  assert.equal(diffOrders(r.next, [o]).events.length, 0);  // повторно не шлём
  const t = texts.pickedForAdmin(o, { customer: 'Белвиллесден ИУП', address: 'пр-т Партизанский, 150А' });
  assert.match(t, /№1103609 · Белвиллесден ИУП/);
  assert.match(t, /50 шт \+ 2 бонус, позиций 2/);
  assert.match(t, /Собрал: Кобзев\nЯщиков: 6/);
  assert.doesNotMatch(texts.pickedForAdmin({ ...o, picker: '' }, null), /Собрал/);  // смена собирает вместе
});

test('состояние больше 2000: текущие не обрезаются, событие не повторяется', () => {
  const { diffOrders } = require('../src/events');
  const prev = {};
  for (let i = 0; i < 2000; i++) prev[`O-OLD${i}`] = 'picked';
  const now = Array.from({ length: 40 }, (_, i) => ({ id: `O-NEW${i}`, status: 'picked' }));
  let r = diffOrders(prev, now);
  assert.equal(r.events.length, 40);
  for (let k = 0; k < 3; k++) {
    r = diffOrders(r.next, now);
    assert.equal(r.events.length, 0);
  }
  assert.ok(Object.keys(r.next).length <= 2000 && 'O-NEW0' in r.next && !('O-OLD0' in r.next));
});

test('заявка сотрудника: имя, телефон, пометка про ручной ввод', () => {
  const s = { tgId: '4401', lastName: 'Литвинов', firstName: 'Антон', phone: '+375291112233', phoneOk: true, username: 'anton' };
  assert.match(texts.newSignup(s), /Литвинов Антон \(@anton\)\nТелефон \+375291112233 \(из Telegram\), id 4401\./);
  assert.match(texts.newSignup({ ...s, phoneOk: false, username: '' }), /Литвинов Антон\nТелефон \+375291112233 \(введён вручную\)/);
});

test('руководитель из «Людей» = руководитель; кнопки должностей под заявкой', () => {
  const st = staff.concat([{ id: 'mg', name: 'Пётр', role: 'manager', tgId: '400', active: true }]);
  assert.equal(roleOf('400', st, []), 'admin');
  const { bossIds } = require('../src/roles');
  assert.deepEqual(bossIds(st, ['111']), ['111', '400']);
  const b = texts.signupButtons({ tgId: '4401' }).flat().map((x) => x.callback_data);
  assert.deepEqual(b, ['su|4401|manager', 'su|4401|logist', 'su|4401|storekeeper', 'su|4401|driver', 'su|4401|no']);
  assert.match(texts.signupDecided('Заявка', 'storekeeper', 'Денис'), /✅ Должность: кладовщик — Денис$/);
  assert.match(texts.signupForEmployee('driver'), /доступ: водитель/);
});
