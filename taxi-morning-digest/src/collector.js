// Подключается к Telegram под аккаунтом-участником чата (сессия из
// TELEGRAM_SESSION) и забирает новые сообщения из SOURCE_CHAT, складывая их
// в data/messages.jsonl. Работает инкрементально: помнит id последнего
// обработанного сообщения (data/state.json) и на каждом запуске тянет
// только то, что появилось после него.

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const config = require('./config');
const store = require('./store');

let client = null;

async function getClient() {
  if (client) return client;
  if (!config.telegramApiId || !config.telegramApiHash || !config.telegramSession) {
    throw new Error(
      'Не заданы TELEGRAM_API_ID / TELEGRAM_API_HASH / TELEGRAM_SESSION. ' +
        'Сначала выполни `npm run login`.'
    );
  }
  client = new TelegramClient(
    new StringSession(config.telegramSession),
    config.telegramApiId,
    config.telegramApiHash,
    { connectionRetries: 5 }
  );
  await client.connect();
  return client;
}

function senderDisplayName(sender) {
  if (!sender) return 'неизвестно';
  if (sender.username) return `@${sender.username}`;
  const parts = [sender.firstName, sender.lastName].filter(Boolean);
  return parts.length ? parts.join(' ') : `id${sender.id}`;
}

// Тянет всё новое с момента последнего сохранённого id.
async function collectNewMessages() {
  const tg = await getClient();
  const state = store.readState();
  const entity = await tg.getEntity(config.sourceChat);

  const collected = [];
  // minId — забираем только сообщения с id больше последнего обработанного.
  for await (const msg of tg.iterMessages(entity, { minId: state.lastMessageId, reverse: true })) {
    if (!msg.message) continue; // пропускаем служебные события без текста
    const sender = await msg.getSender().catch(() => null);
    collected.push({
      id: msg.id,
      date: msg.date, // unix seconds, уже в UTC
      senderName: senderDisplayName(sender),
      text: msg.message,
    });
  }

  if (collected.length) {
    store.appendMessages(collected);
    const maxId = Math.max(...collected.map((m) => m.id));
    store.writeState({ lastMessageId: maxId });
  }

  return collected.length;
}

async function disconnect() {
  if (client) {
    await client.disconnect();
    client = null;
  }
}

module.exports = { collectNewMessages, disconnect };
