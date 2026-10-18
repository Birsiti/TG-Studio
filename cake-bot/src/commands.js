// изменено 2026-10-18 09:00
// Ответы на сообщения пользователей.
const config = require('./config');
const tg = require('./telegram');
const { api, refs } = require('./api');
const texts = require('./texts');
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
    r = null;
  }
  const role = roleOf(id, r ? r.staff : [], config.adminIds);
  await noteVisit(msg.from, role);
  if (!r && role !== 'admin') {
    return tg.send(msg.chat.id, `Склад сейчас недоступен (сервер не отвечает). Попробуйте через пару минут.\n\nВаш Telegram id: ${id}`);
  }
  if (!role) {
    return tg.send(msg.chat.id, `Здравствуйте! Доступа к складу пока нет.\n\nВаш Telegram id: ${id} — передайте его руководителю, чтобы он добавил вас в «Справочники → Люди».`);
  }
  const name = (r && staffName(id, r.staff)) || msg.from.first_name || '';
  const note = r ? '' : '\n\n⚠ Сервер склада не отвечает — экраны откроются в демо-режиме.';
  return tg.send(msg.chat.id, `${name ? name + ', з' : 'З'}дравствуйте! Вы вошли как: ${ROLE_RU[role].toLowerCase()}.${note}`, keyboard(role, config.webappBase));
}

// Журнал «кто заходит» (API) и сообщение руководителям о новом человеке
async function noteVisit(from, role) {
  try {
    const name = [from.first_name, from.last_name].filter(Boolean).join(' ');
    const v = await api('logVisit', { tgId: String(from.id), name, username: from.username || '' });
    if (v.isNew && role !== 'admin') await tg.sendMany(config.adminIds, texts.newVisitor(from, role));
  } catch (err) {
    console.error('[bot] журнал входов:', err.message);
  }
}

module.exports = { handleMessage, noteVisit };
