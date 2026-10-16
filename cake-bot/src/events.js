// Сравнение рейсов с прошлой проверкой → события для уведомлений.
// state.trips = { [tripId]: status }. Первый запуск только запоминает
// текущее состояние, чтобы не засыпать всех сообщениями о старых рейсах.

const WATCH = new Set(['shipped', 'reported', 'closed']);

function diffTrips(prev, trips) {
  const next = {};
  for (const t of trips) next[t.id] = t.status;
  if (!prev) return { events: [], next };
  const events = [];
  for (const t of trips) {
    if (prev[t.id] !== t.status && WATCH.has(t.status)) events.push({ kind: t.status, trip: t });
  }
  // рейсы, выпавшие из окна getTrips, держим, чтобы не прислать их повторно
  for (const [id, st] of Object.entries(prev)) if (!(id in next)) next[id] = st;
  // не даём состоянию расти бесконечно
  const ids = Object.keys(next);
  if (ids.length > 2000) for (const id of ids.slice(0, ids.length - 2000)) delete next[id];
  return { events, next };
}

module.exports = { diffTrips };
