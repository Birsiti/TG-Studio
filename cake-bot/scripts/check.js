// Проверка настройки: бот, API, список руководителей.
const config = require('../src/config');
const tg = require('../src/telegram');
const { api } = require('../src/api');

(async () => {
  let ok = true;
  const step = async (name, fn) => {
    try { console.log(`✔ ${name}: ${await fn()}`); } catch (err) { ok = false; console.log(`✘ ${name}: ${err.message}`); }
  };
  await step('Бот', async () => '@' + (await tg.call('getMe')).username);
  await step('API склада', async () => { const r = await api('getRefs'); return `${r.products.length} позиций, ${r.staff.length} сотрудников`; });
  await step('Руководители (ADMIN_IDS)', async () => { if (!config.adminIds.length) throw new Error('пусто'); return config.adminIds.join(', '); });
  await step('Страницы Mini App', async () => { if (!config.webappBase.startsWith('https://')) throw new Error('нужен https'); return config.webappBase; });
  process.exit(ok ? 0 : 1);
})();
