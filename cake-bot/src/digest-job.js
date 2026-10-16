// Утренняя сводка руководителям за вчерашний день.
const config = require('./config');
const tg = require('./telegram');
const { api, refs } = require('./api');
const texts = require('./texts');

// Дата YYYY-MM-DD в нужной таймзоне, со сдвигом в днях
function dayKey(offsetDays = 0, now = new Date(), timeZone = config.timezone) {
  const d = new Date(now.getTime() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

async function buildDigest() {
  const day = dayKey(-1);
  const [{ moves }, overview, { trips }, tara, r] = await Promise.all([
    api('getMoves', { from: day, to: day }),
    api('getOverview', { days: 7 }),
    api('getTrips'),
    api('getTara'),
    refs(),
  ]);
  const label = day.split('-').reverse().join('.');
  return texts.digest({ day: label, moves, overview, trips, tara }, texts.makeLookup(r));
}

async function runDigestJob() {
  if (!config.adminIds.length) throw new Error('Не задан ADMIN_IDS в .env — некому слать сводку.');
  const text = await buildDigest();
  await tg.sendMany(config.adminIds, text);
  console.log(`[digest] отправлено: ${config.adminIds.length} получ.`);
}

module.exports = { runDigestJob, buildDigest, dayKey };
