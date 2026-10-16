// Точка входа. Держит процесс живым:
// 1. long polling Telegram — отвечает на /start и /id кнопками Mini App;
// 2. каждые WATCH_SECONDS проверяет рейсы и шлёт уведомления;
// 3. по расписанию DIGEST_CRON шлёт руководителям сводку за вчера.
// Входящих соединений не нужно — iMac сам ходит в Telegram и в локальный API.

const cron = require('node-cron');
const config = require('./config');
const tg = require('./telegram');
const store = require('./store');
const { handleMessage } = require('./commands');
const { checkTrips } = require('./watch');
const { runDigestJob } = require('./digest-job');

let stopping = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollUpdates() {
  let offset = store.get().updateOffset || 0;
  let backoff = 1000;
  while (!stopping) {
    try {
      const updates = await tg.call('getUpdates', { offset, timeout: 50, allowed_updates: ['message'] }, 60000);
      backoff = 1000;
      for (const u of updates) {
        offset = u.update_id + 1;
        try {
          await handleMessage(u.message);
        } catch (err) {
          console.error('[bot] ошибка ответа:', err.message);
        }
      }
      if (updates.length) store.save({ updateOffset: offset });
    } catch (err) {
      if (stopping) break;
      console.error('[bot] getUpdates:', err.message);
      if (/409|webhook/i.test(err.message)) console.error('[bot] На токене висит webhook (LEADTEX или другой сервис): бот не получит сообщения, пока его не снять. См. npm run check.');
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 60000);
    }
  }
}

let watching = false;
async function watchSafely() {
  if (watching) return; // прошлая проверка ещё идёт — не дублируем уведомления
  watching = true;
  try {
    const n = await checkTrips();
    if (n) console.log(`[watch] уведомлений по рейсам: ${n}`);
  } catch (err) {
    console.error('[watch] ошибка:', err.message);
  } finally {
    watching = false;
  }
}

async function main() {
  const me = await tg.call('getMe');
  console.log(`Запуск @${me.username}. API ${config.apiUrl}, сводка "${config.digestCron}" (${config.timezone}).`);
  await tg.call('setMyCommands', { commands: [{ command: 'start', description: 'Открыть склад' }, { command: 'id', description: 'Мой Telegram id' }] }).catch(() => {});

  await watchSafely();
  setInterval(watchSafely, config.watchSeconds * 1000);
  cron.schedule(config.digestCron, () => runDigestJob().catch((err) => console.error('[digest] ошибка:', err.message)), { timezone: config.timezone });
  await pollUpdates();
}

main().catch((err) => {
  console.error('Фатальная ошибка при запуске:', err.message);
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopping = true; process.exit(0); });
