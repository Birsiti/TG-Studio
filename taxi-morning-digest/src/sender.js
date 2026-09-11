const config = require('./config');

async function sendToBoss(text) {
  if (!config.digestBotToken || !config.bossChatId) {
    throw new Error('Не заданы DIGEST_BOT_TOKEN / BOSS_CHAT_ID в .env — некому слать сводку.');
  }
  const res = await fetch(`https://api.telegram.org/bot${config.digestBotToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: config.bossChatId, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Telegram sendMessage failed: ${res.status} ${body}`);
  }
}

module.exports = { sendToBoss };
