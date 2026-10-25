// изменено 2026-10-25 17:00
// Ответы на сообщения пользователей.
const config = require('./config');
const tg = require('./telegram');
const { api, refs } = require('./api');
const texts = require('./texts');
const store = require('./store');
const { dayKey } = require('./digest-job');
const { ROLE_RU, roleOf, staffName } = require('./roles');

const SIGNUP_ROLES = new Set(['manager', 'logist', 'storekeeper', 'driver']);

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
    return tg.send(msg.chat.id, texts.guestWelcome(msg.from.first_name || ''));
  }
  if (!r && role !== 'admin') {
    return tg.send(msg.chat.id, `Склад сейчас недоступен (сервер не отвечает). Попробуйте через пару минут.\n\nВаш Telegram id: ${id}`);
  }
  if (!role) {
    return tg.send(msg.chat.id, `Здравствуйте! Доступа к рабочему складу пока нет — кнопка «Открыть» внизу покажет демо.\n\nВаш Telegram id: ${id} — передайте его руководителю, чтобы он добавил вас в «Справочники → Люди».`);
  }
  const name = (r && staffName(id, r.staff)) || msg.from.first_name || '';
  const note = r ? '' : '\n\n⚠ Сервер склада не отвечает — экраны откроются в демо-режиме.';
  return tg.send(msg.chat.id, `${name ? name + ', з' : 'З'}дравствуйте! Вы вошли как: ${ROLE_RU[role].toLowerCase()}.\n\nНажмите «Открыть» внизу слева — приложение склада откроется здесь же.${note}`);
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

// Кнопка под заявкой «Новый сотрудник»: su|<tg id>|<роль или no>. Решать может только руководитель.
async function handleCallback(cq) {
  if (!cq || !cq.data || !cq.from) return;
  const m = /^su\|(\d{1,15})\|(\w+)$/.exec(cq.data);
  const answer = (text) => tg.call('answerCallbackQuery', { callback_query_id: cq.id, text, show_alert: false }).catch(() => {});
  if (!m) return answer('');
  const [, tgId, v] = m;
  let r;
  try { r = await refs(); } catch { return answer('Склад не отвечает, попробуйте позже'); }
  if (roleOf(String(cq.from.id), r.staff, config.adminIds) !== 'admin') return answer('Решает только руководитель');
  if (v !== 'no' && !SIGNUP_ROLES.has(v)) return answer('');
  const msg = cq.message;
  const by = [cq.from.first_name, cq.from.last_name].filter(Boolean).join(' ');
  try {
    await api('decideSignup', v === 'no' ? { tgId, reject: true } : { tgId, role: v });
  } catch (err) {
    if (/уже решили/i.test(err.message)) {
      if (msg) await tg.call('editMessageReplyMarkup', { chat_id: msg.chat.id, message_id: msg.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
      return answer('По этой заявке уже решили');
    }
    console.error('[bot] заявка:', err.message);
    return answer('Не получилось, попробуйте ещё раз');
  }
  const role = v === 'no' ? null : v;
  if (msg) await tg.call('editMessageText', { chat_id: msg.chat.id, message_id: msg.message_id, text: texts.signupDecided(msg.text || '', role, by) }).catch(() => {});
  await tg.send(tgId, texts.signupForEmployee(role)).catch((err) => console.error('[bot] сотруднику:', err.message));
  return answer(role ? 'Доступ выдан' : 'Отказано');
}

module.exports = { handleMessage, handleCallback, noteVisit, demoCommand, demoOpen };
