// изменено 2026-10-17 12:50
// Сравнение рейсов и заявок с прошлой проверкой → события для уведомлений.
// state.trips / state.orders = { [id]: status }. Первый запуск только запоминает
// текущее состояние, чтобы не засыпать всех сообщениями о старом.

const TRIP_WATCH = new Set(['shipped', 'reported', 'closed']);
const ORDER_WATCH = new Set(['picked']);
const LIMIT = 2000;

function diffStatus(prev, items, watch, key) {
  const cur = {};
  for (const t of items) cur[t.id] = t.status;
  if (!prev) return { events: [], next: cur };
  const events = [];
  for (const t of items) {
    if (prev[t.id] !== t.status && watch.has(t.status)) events.push({ kind: t.status, [key]: t });
  }
  // Выпавшие из окна выборки держим, чтобы не прислать их повторно, но не больше LIMIT:
  // режем самые старые из них, текущие — никогда (иначе событие повторялось бы каждую проверку)
  const old = Object.keys(prev).filter((id) => !(id in cur));
  const next = {};
  for (const id of old.slice(Math.max(0, old.length - Math.max(0, LIMIT - items.length)))) next[id] = prev[id];
  Object.assign(next, cur);
  return { events, next };
}

const diffTrips = (prev, trips) => diffStatus(prev, trips, TRIP_WATCH, 'trip');
const diffOrders = (prev, orders) => diffStatus(prev, orders, ORDER_WATCH, 'order');

module.exports = { diffTrips, diffOrders };
