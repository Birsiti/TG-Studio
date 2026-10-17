// изменено 2026-10-17 12:50
// Раз в WATCH_SECONDS смотрим рейсы и заявки и рассылаем уведомления о переходах.
const config = require('./config');
const tg = require('./telegram');
const { api, refs } = require('./api');
const store = require('./store');
const { diffTrips, diffOrders } = require('./events');
const { idsOf, keyboard } = require('./roles');
const texts = require('./texts');

// Оставить прошлый статус — тогда событие сработает снова
function retryLater(next, prev, id) {
  if (prev && id in prev) next[id] = prev[id];
  else delete next[id];
}

async function checkTrips() {
  const [{ trips }, r] = await Promise.all([api('getTrips'), refs()]);
  const { events, next } = diffTrips(store.get().trips, trips);
  const L = texts.makeLookup(r);
  const tgOf = (staffId) => {
    const s = r.staff.find((x) => x.id === staffId);
    return s && s.active && s.tgId ? [String(s.tgId)] : [];
  };
  for (const { kind, trip } of events) {
    let ok = true;
    if (kind === 'shipped') {
      ok = await tg.sendMany(tgOf(trip.driverId), texts.shippedForDriver(trip, L), keyboard('driver', config.webappBase));
    } else if (kind === 'reported') {
      const to = idsOf(r.staff, 'storekeeper').concat(config.adminIds);
      ok = await tg.sendMany(to, texts.reportedForStore(trip, L), keyboard('storekeeper', config.webappBase));
    } else if (kind === 'closed') {
      ok = await tg.sendMany(tgOf(trip.driverId), texts.closedForDriver(trip, L));
    }
    if (!ok) retryLater(next, store.get().trips, trip.id);
  }
  // Пишем состояние после рассылки; не дошедшее из-за сбоя сети повторится на следующей проверке
  store.save({ trips: next });
  return events.length + await checkOrders();
}

// Заявка собрана → руководителям. Заявки — на ближайшую дату (как на экране «Сборка»).
async function checkOrders() {
  const r = await api('getOrders');
  const { events, next } = diffOrders(store.get().orders, r.orders);
  for (const { order } of events) {
    const ok = await tg.sendMany(config.adminIds, texts.pickedForAdmin(order, r.points.find((p) => p.id === order.pointId)));
    if (!ok) retryLater(next, store.get().orders, order.id);
  }
  store.save({ orders: next });
  return events.length;
}

module.exports = { checkTrips };
