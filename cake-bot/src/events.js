// изменено 2026-10-17 03:30
// Сравнение рейсов и заявок с прошлой проверкой → события для уведомлений.
// state.trips / state.orders = { [id]: status }. Первый запуск только запоминает
// текущее состояние, чтобы не засыпать всех сообщениями о старом.

const TRIP_WATCH = new Set(['shipped', 'reported', 'closed']);
const ORDER_WATCH = new Set(['picked']);

function diffStatus(prev, items, watch, key) {
  const next = {};
  for (const t of items) next[t.id] = t.status;
  if (!prev) return { events: [], next };
  const events = [];
  for (const t of items) {
    if (prev[t.id] !== t.status && watch.has(t.status)) events.push({ kind: t.status, [key]: t });
  }
  // выпавшие из окна выборки держим, чтобы не прислать их повторно
  for (const [id, st] of Object.entries(prev)) if (!(id in next)) next[id] = st;
  // не даём состоянию расти бесконечно
  const ids = Object.keys(next);
  if (ids.length > 2000) for (const id of ids.slice(0, ids.length - 2000)) delete next[id];
  return { events, next };
}

const diffTrips = (prev, trips) => diffStatus(prev, trips, TRIP_WATCH, 'trip');
const diffOrders = (prev, orders) => diffStatus(prev, orders, ORDER_WATCH, 'order');

module.exports = { diffTrips, diffOrders };
