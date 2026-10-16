// Раз в WATCH_SECONDS смотрим рейсы и рассылаем уведомления о переходах.
const config = require('./config');
const tg = require('./telegram');
const { api, refs } = require('./api');
const store = require('./store');
const { diffTrips } = require('./events');
const { idsOf, keyboard } = require('./roles');
const texts = require('./texts');

async function checkTrips() {
  const [{ trips }, r] = await Promise.all([api('getTrips'), refs()]);
  const { events, next } = diffTrips(store.get().trips, trips);
  const L = texts.makeLookup(r);
  const tgOf = (staffId) => {
    const s = r.staff.find((x) => x.id === staffId);
    return s && s.active && s.tgId ? [String(s.tgId)] : [];
  };
  for (const { kind, trip } of events) {
    if (kind === 'shipped') {
      await tg.sendMany(tgOf(trip.driverId), texts.shippedForDriver(trip, L), keyboard('driver', config.webappBase));
    } else if (kind === 'reported') {
      const to = idsOf(r.staff, 'storekeeper').concat(config.adminIds);
      await tg.sendMany(to, texts.reportedForStore(trip, L), keyboard('storekeeper', config.webappBase));
    } else if (kind === 'closed') {
      await tg.sendMany(tgOf(trip.driverId), texts.closedForDriver(trip, L));
    }
  }
  // Пишем состояние после рассылки: при сбое отправки событие повторится, а не потеряется
  store.save({ trips: next });
  return events.length;
}

module.exports = { checkTrips };
