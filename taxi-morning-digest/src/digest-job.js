const config = require('./config');
const store = require('./store');
const { buildDigest } = require('./summarize');
const { sendToBoss } = require('./sender');

// Берём окно "прошедшие сутки" в таймзоне config.timezone: от вчера 00:00
// до сегодня 00:00 (момента, когда сводка запускается утром).
function getYesterdayRangeUnix() {
  const now = new Date();
  // Сдвигаем "теперь" в нужную таймзону через locale-строку, чтобы посчитать
  // границы суток без сторонних библиотек дат.
  const zoned = new Date(now.toLocaleString('en-US', { timeZone: config.timezone }));
  const todayStart = new Date(zoned.getFullYear(), zoned.getMonth(), zoned.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  // offset между реальным "now" и "zoned" даёт нам поправку на таймзону
  const offsetMs = now.getTime() - zoned.getTime();
  return {
    sinceUnix: Math.floor((yesterdayStart.getTime() + offsetMs) / 1000),
    untilUnix: Math.floor((todayStart.getTime() + offsetMs) / 1000),
  };
}

async function runDigestJob() {
  const { sinceUnix, untilUnix } = getYesterdayRangeUnix();
  const messages = store.readMessagesInRange(sinceUnix, untilUnix);

  const digestText = await buildDigest(messages);
  const header = `Сводка по чату такси за ${new Date(sinceUnix * 1000).toLocaleDateString('ru-RU', {
    timeZone: config.timezone,
  })} (${messages.length} сообщ.)\n\n`;

  await sendToBoss(header + digestText);
  console.log(`[digest] отправлено, сообщений в окне: ${messages.length}`);
}

module.exports = { runDigestJob, getYesterdayRangeUnix };
