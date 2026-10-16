// Ответы на сообщения пользователей.
const config = require('./config');
const tg = require('./telegram');
const { refs } = require('./api');
const { ROLE_RU, roleOf, staffName, keyboard } = require('./roles');

async function handleMessage(msg) {
  if (!msg || !msg.chat || msg.chat.type !== 'private' || !msg.from) return; // Web App кнопки работают только в личке
  const text = (msg.text || '').trim();
  const id = String(msg.from.id);

  if (/^\/id\b/.test(text)) {
    return tg.send(msg.chat.id, `Ваш Telegram id: ${id}\n\nПередайте его руководителю — он добавит вас в «Справочники → Люди».`);
  }

  let r;
  try {
    r = await refs();
  } catch (err) {
    console.error('[bot] API недоступен:', err.message);
    return tg.send(msg.chat.id, `Склад сейчас недоступен (сервер не отвечает). Попробуйте через пару минут.\n\nВаш Telegram id: ${id}`);
  }
  const role = roleOf(id, r.staff, config.adminIds);
  if (!role) {
    return tg.send(msg.chat.id, `Здравствуйте! Доступа к складу пока нет.\n\nВаш Telegram id: ${id} — передайте его руководителю, чтобы он добавил вас в «Справочники → Люди».`);
  }
  const name = staffName(id, r.staff) || msg.from.first_name || '';
  return tg.send(msg.chat.id, `${name ? name + ', з' : 'З'}дравствуйте! Вы вошли как: ${ROLE_RU[role].toLowerCase()}.`, keyboard(role, config.webappBase));
}

module.exports = { handleMessage };
