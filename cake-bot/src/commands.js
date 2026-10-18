// изменено 2026-10-18 10:00
// Ответы на сообщения пользователей.
const config = require('./config');
const tg = require('./telegram');
const { api, refs } = require('./api');
const texts = require('./texts');
const store = require('./store');
const { dayKey } = require('./digest-job');
const { ROLE_RU, roleOf, staffName, keyboard } = require('./roles');

async function handleMessage(msg) {
  if (!msg || !msg.chat || msg.chat.type !== 'private' || !msg.from) return; // Web App кнопки работают только в личке
  const text = (msg.text || '').trim();
  const id = String(msg.from.id);

  if (/^\/id\b/.test(text)) {
    return tg.send(msg.chat.id, `Ваш Telegram id: ${id}\n\nПередайте его руководителю — он добавит вас в «Справочники → Люди».`);
  }

  if (/^\/demo\b/.test(text) && config.adminIds.includes(id)) {
    const until = demoCommand(text, dayKey());
    store.save({ demoUntil: until });
    return tg.send(msg.chat.id, texts.demoState(until));
  }

  let r;
  try {
    r = await refs();
  } catch (err) {
    console.error('[bot] API недоступен:', err.message);
    r = null;
  }
  const role = roleOf(id, r ? r.staff : [], config.adminIds);
  const guest = !role && demoOpen(store.get().demoUntil, dayKey());
  await noteVisit(msg.from, role, guest);
  if (guest) {
    return tg.send(msg.chat.id, texts.guestWelcome(msg.from.first_name || ''), keyboard('admin', config.webappBase));
  }
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
async function noteVisit(from, role, guest = false) {
  try {
    const name = [from.first_name, from.last_name].filter(Boolean).join(' ');
    const v = await api('logVisit', { tgId: String(from.id), name, username: from.username || '' });
    if (v.isNew && role !== 'admin') await tg.sendMany(config.adminIds, texts.newVisitor(from, role, guest));
  } catch (err) {
    console.error('[bot] журнал входов:', err.message);
  }
}

// Гостевой вход для показа: /demo — до конца дня, /demo 3 — на 3 дня, /demo off — закрыть.
// Гости видят те же экраны, но приложение без туннеля работает в демо (данные в их телефоне).
function demoCommand(text, today) {
  const arg = text.split(/\s+/)[1] || '';
  if (/^(off|выкл|нет|0)$/i.test(arg)) return null;
  const days = Math.min(30, Math.max(1, parseInt(arg, 10) || 1));
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days - 1);
  return d.toISOString().slice(0, 10);
}
const demoOpen = (until, today) => !!until && until >= today;

module.exports = { handleMessage, noteVisit, demoCommand, demoOpen };
