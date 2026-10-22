// изменено 2026-10-22 17:30
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
const { menuButton } = require('./roles');
const texts = require('./texts');

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
      if (/409|webhook|conflict|terminated by other/i.test(err.message)) console.error('[bot] Токен занят: webhook (LEADTEX или другой сервис) или второй запущенный бот. Пока не освободить — сообщения не придут. См. npm run check.');
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

// Сводка: API на iMac после перезапуска поднимается до пары минут — пробуем ещё 5 раз через 3 минуты
async function digestWithRetry() {
  for (let i = 0; i < 6 && !stopping; i++) {
    try {
      return await runDigestJob();
    } catch (err) {
      console.error(`[digest] ошибка (попытка ${i + 1}):`, err.message);
      await sleep(180000);
    }
  }
}

// Как бот выглядит до первого сообщения: кнопка «Открыть» внизу, описание в пустом чате и в профиле
async function presentBot() {
  const steps = [
    ['setChatMenuButton', { menu_button: menuButton(config.webappBase) }],
    ['setMyDescription', { description: texts.BOT_DESCRIPTION }],
    ['setMyShortDescription', { short_description: texts.BOT_SHORT }],
  ];
  for (const [method, params] of steps) await tg.call(method, params).catch((err) => console.error(`[bot] ${method}:`, err.message));
}

async function main() {
  const me = await tg.call('getMe');
  const st = store.get();  // сменили токен на другого бота — его счётчик сообщений свой, старый offset не годится
  if (st.botId && st.botId !== me.id) store.save({ botId: me.id, updateOffset: 0, trips: null, orders: null });
  else if (!st.botId) store.save({ botId: me.id });
  console.log(`Запуск @${me.username}. API ${config.apiUrl}, сводка "${config.digestCron}" (${config.timezone}).`);
  await presentBot();
  await tg.call('setMyCommands', { commands: [{ command: 'start', description: 'Открыть приложение' }, { command: 'id', description: 'Мой Telegram id' }] }).catch(() => {});

  await watchSafely();
  setInterval(watchSafely, config.watchSeconds * 1000);
  cron.schedule(config.digestCron, digestWithRetry, { timezone: config.timezone });
  await pollUpdates();
}

main().catch((err) => {
  console.error('Фатальная ошибка при запуске:', err.message);
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopping = true; process.exit(0); });
