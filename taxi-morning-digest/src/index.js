// Точка входа. Держит процесс живым:
// 1. каждые COLLECT_INTERVAL_MINUTES тянет новые сообщения из чата-источника
//    (небольшими порциями, чтобы не ловить FloodWait и не терять историю);
// 2. по расписанию DIGEST_CRON собирает сводку за прошедшие сутки и шлёт
//    её главному.

const cron = require('node-cron');
const config = require('./config');
const collector = require('./collector');
const { runDigestJob } = require('./digest-job');

const COLLECT_INTERVAL_MINUTES = 5;

async function collectSafely() {
  try {
    const count = await collector.collectNewMessages();
    if (count) console.log(`[collector] сохранено новых сообщений: ${count}`);
  } catch (err) {
    console.error('[collector] ошибка сбора сообщений:', err.message);
  }
}

async function main() {
  console.log(`Запуск. Источник: ${config.sourceChat}, сводка по расписанию "${config.digestCron}" (${config.timezone}).`);

  await collectSafely();
  cron.schedule(`*/${COLLECT_INTERVAL_MINUTES} * * * *`, collectSafely);

  cron.schedule(
    config.digestCron,
    async () => {
      try {
        await collectSafely(); // добираем свежее прямо перед отправкой
        await runDigestJob();
      } catch (err) {
        console.error('[digest] ошибка отправки сводки:', err.message);
      }
    },
    { timezone: config.timezone }
  );
}

main().catch((err) => {
  console.error('Фатальная ошибка при запуске:', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  await collector.disconnect();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await collector.disconnect();
  process.exit(0);
});
