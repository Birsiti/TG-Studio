// Запросы к API склада (api/bots/cake/) со служебным ключом.
const config = require('./config');

async function api(action, payload = {}) {
  const res = await fetch(config.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, serviceKey: config.serviceKey, ...payload }),
  });
  const data = await res.json().catch(() => null);
  if (!data || !data.ok) throw new Error(`API ${action}: ${(data && (data.message || data.error)) || res.status}`);
  return data;
}

// Справочники меняются редко — кэш на минуту
let refsCache = null;
let refsAt = 0;
async function refs() {
  if (!refsCache || Date.now() - refsAt > 60000) {
    refsCache = await api('getRefs');
    refsAt = Date.now();
  }
  return refsCache;
}

module.exports = { api, refs };
