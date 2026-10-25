// изменено 2026-10-25 12:45
// Раз в WATCH_SECONDS смотрим рейсы и заявки и рассылаем уведомления о переходах.
const config = require('./config');
const tg = require('./telegram');
const { api, refs } = require('./api');
const store = require('./store');
const { diffTrips, diffOrders } = require('./events');
const { idsOf } = require('./roles');
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
      ok = await tg.sendMany(tgOf(trip.driverId), texts.shippedForDriver(trip, L));
    } else if (kind === 'reported') {
      const to = idsOf(r.staff, 'storekeeper').concat(idsOf(r.staff, 'logist'), config.adminIds);
      ok = await tg.sendMany(to, texts.reportedForStore(trip, L));
    } else if (kind === 'closed') {
      ok = await tg.sendMany(tgOf(trip.driverId), texts.closedForDriver(trip, L));
    }
    if (!ok) retryLater(next, store.get().trips, trip.id);
  }
  // Пишем состояние после рассылки; не дошедшее из-за сбоя сети повторится на следующей проверке
  store.save({ trips: next });
  return events.length + await checkStops(trips, r, L) + await checkOrders() + await checkSignups();
}

// Водитель сдал точку с замечаниями (недостача, брак, пересорт) → складу, логистам, руководителю.
// Первый запуск только запоминает уже сданные точки — без рассылки по старым.
async function checkStops(trips, r, L) {
  const prev = store.get().stops;
  const next = {};
  const fresh = [];
  for (const t of trips) {
    for (const s of t.stops || []) {
      if (!s.report) continue;
      next[s.orderId] = s.report.at;
      if (prev && prev[s.orderId] !== s.report.at && !s.report.ok) fresh.push({ t, s });
    }
  }
  const to = idsOf(r.staff, 'storekeeper').concat(idsOf(r.staff, 'logist'), config.adminIds);
  for (const { t, s } of fresh) {
    const ok = await tg.sendMany(to, texts.stopIssue(t, s, L));
    if (!ok) { if (prev && s.orderId in prev) next[s.orderId] = prev[s.orderId]; else delete next[s.orderId]; }
  }
  store.save({ stops: next });
  return fresh.length;
}

// Заявка собрана → руководителям. Заявки — на ближайшую дату (как на экране «Сборка»).
async function checkOrders() {
  const r = await api('getOrders');
  const { events, next } = diffOrders(store.get().orders, r.orders);
  for (const { order } of events) {
    const ok = await tg.sendMany(config.adminIds.concat(idsOf(r.staff, 'logist')), texts.pickedForAdmin(order, r.points.find((p) => p.id === order.pointId)));
    if (!ok) retryLater(next, store.get().orders, order.id);
  }
  store.save({ orders: next });
  return events.length;
}

// Новая заявка «Я сотрудник Милано» → руководителям (повторная заявка с новым временем — снова)
async function checkSignups() {
  const { signups } = await api('getSignups');
  const prev = store.get().signups || {};
  const next = {};
  let sent = 0;
  for (const s of signups) {
    next[s.tgId] = s.createdAt;
    if (prev[s.tgId] === s.createdAt) continue;
    if (await tg.sendMany(config.adminIds, texts.newSignup(s))) sent++;
    else if (s.tgId in prev) next[s.tgId] = prev[s.tgId]; else delete next[s.tgId];
  }
  store.save({ signups: next });
  return sent;
}

module.exports = { checkTrips };
