// Ручной прогон: собрать свежие сообщения и сразу отправить сводку боссу,
// не дожидаясь утреннего расписания. Полезно для проверки настройки.
// Запуск: `npm run digest:now`

const collector = require('../src/collector');
const { runDigestJob } = require('../src/digest-job');

(async () => {
  try {
    const count = await collector.collectNewMessages();
    console.log(`Собрано новых сообщений: ${count}`);
    await runDigestJob();
  } catch (err) {
    console.error('Ошибка:', err.message);
    process.exitCode = 1;
  } finally {
    await collector.disconnect();
  }
})();
