// Тонкая обёртка над Bot API (fetch из Node 18+, без библиотек).
const config = require('./config');

async function call(method, params = {}, timeoutMs = 15000) {
  if (!config.botToken) throw new Error('Не задан BOT_TOKEN в .env');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${config.telegramApi}/bot${config.botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) throw new Error(`${method}: ${data.description || res.status}`);
    return data.result;
  } finally {
    clearTimeout(timer);
  }
}

function send(chatId, text, buttons) {
  const params = { chat_id: chatId, text, disable_web_page_preview: true };
  if (buttons && buttons.length) params.reply_markup = { inline_keyboard: buttons };
  return call('sendMessage', params);
}

// Рассылка нескольким; ошибка одному (заблокировал бота и т.п.) не мешает остальным
async function sendMany(chatIds, text, buttons) {
  for (const id of new Set(chatIds.map(String))) {
    try {
      await send(id, text, buttons);
    } catch (err) {
      console.error(`[telegram] не отправлено ${id}: ${err.message}`);
    }
  }
}

module.exports = { call, send, sendMany };
