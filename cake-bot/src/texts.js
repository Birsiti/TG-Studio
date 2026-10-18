// изменено 2026-10-18 10:00
// Тексты сообщений. Обычный текст без разметки — не нужно экранировать.

function weight(g) {
  if (!g) return '';
  return g < 1000 ? `${g} г` : `${String(g / 1000).replace('.', ',')} кг`;
}

function makeLookup(refs) {
  const P = new Map(refs.products.map((p) => [p.id, p]));
  const C = new Map(refs.cities.map((c) => [c.id, c]));
  const S = new Map(refs.staff.map((s) => [s.id, s]));
  const T = new Map(refs.tara.map((t) => [t.id, t]));
  return {
    product: (id) => { const p = P.get(id); return p ? `${p.name}${p.weightG ? ', ' + weight(p.weightG) : ''}` : id; },
    city: (id) => (C.get(id) || { name: id }).name,
    staff: (id) => (S.get(id) || {}).name || '—',
    tara: (id) => (T.get(id) || { name: id }).name,
  };
}

const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);
const taraLine = (L, list) => list.map((l) => `${L.tara(l.taraId)} ${l.qty}`).join(', ');
const boxes = (list) => sum(list || [], (l) => l.qty);

function tripTitle(t, L) {
  return `Рейс №${t.num} · ${L.city(t.cityId)}`;
}

function shippedForDriver(t, L) {
  const lines = t.lines.map((l) => `• ${L.product(l.productId)} — ${l.qty}`).join('\n');
  const out = boxes(t.taraOut);
  return `${tripTitle(t, L)} отгружен вам.\n\n${lines}\n\nВсего ${sum(t.lines, (l) => l.qty)} шт${out ? `\nЯщиков выдано: ${out} — за вами, верните на склад` : ''}\n\nПосле развоза сдайте отчёт в «Мои рейсы».`;
}

function reportedForStore(t, L) {
  let rep = {};
  try { rep = JSON.parse(t.report || '{}'); } catch { rep = {}; }
  const ret = rep.returns || [];
  const back = sum(ret, (r) => r.back);
  const spoiled = sum(ret, (r) => r.spoiled);
  const parts = [`${tripTitle(t, L)}: ${L.staff(t.driverId)} сдал отчёт.`];
  parts.push(ret.length ? `Возврат: ${back} шт целых${spoiled ? `, брак ${spoiled}` : ''}.` : 'Возврата нет.');
  const boxOut = boxes(t.taraOut), boxBack = boxes(rep.taraBack);
  if (boxOut || boxBack) parts.push(`Ящики: выдано ${boxOut}, сдаёт ${boxBack}${boxOut > boxBack ? `, не хватает ${boxOut - boxBack}` : ''}.`);
  if (rep.comment) parts.push(`Комментарий: «${rep.comment}»`);
  parts.push('Сверьте и закройте рейс.');
  return parts.join('\n');
}

function closedForDriver(t, L) {
  const delivered = sum(t.lines, (l) => l.delivered);
  const out = boxes(t.taraOut), back = boxes(t.taraBack);
  const box = out || back ? `\nЯщики: выдано ${out}, принято ${back}${out > back ? ` — долг по рейсу ${out - back}` : ''}.` : '';
  return `${tripTitle(t, L)} принят складом. Доставлено ${delivered} шт.${box}`;
}

// Утренняя сводка: moves — движения за вчера, overview — getOverview, trips — getTrips
function digest({ day, moves, overview, trips, tara }, L) {
  const shipped = moves.filter((m) => m.type === 'ship');
  const byCity = new Map();
  for (const m of shipped) byCity.set(m.cityId, (byCity.get(m.cityId) || 0) - m.qty);
  const cityLines = [...byCity.entries()].sort((a, b) => b[1] - a[1]).map(([c, q]) => `• ${L.city(c)} — ${q}`);
  const income = sum(moves.filter((m) => m.type === 'in'), (m) => m.qty);
  const returned = sum(moves.filter((m) => m.type === 'return'), (m) => m.qty);
  const written = -sum(moves.filter((m) => m.type === 'writeoff'), (m) => m.qty);
  const open = trips.filter((t) => t.status === 'reported');
  const road = trips.filter((t) => t.status === 'shipped');

  const out = [`Склад за ${day}`, ''];
  out.push(`Приход: ${income} шт`);
  out.push(`Отгружено: ${-sum(shipped, (m) => m.qty)} шт${cityLines.length ? '\n' + cityLines.join('\n') : ''}`);
  if (returned) out.push(`Возвраты: ${returned} шт`);
  if (written) out.push(`Списано: ${written} шт`);
  out.push('', `На складе сейчас: ${overview.stockTotal} шт`);
  if (overview.lowStock.length) out.push(`Мало: ${overview.lowStock.slice(0, 10).join(', ')}${overview.lowStock.length > 10 ? ` и ещё ${overview.lowStock.length - 10}` : ''}`);
  if (road.length) out.push(`В пути: ${road.map((t) => tripTitle(t, L)).join('; ')}`);
  if (open.length) out.push(`Ждут приёмки: ${open.map((t) => tripTitle(t, L)).join('; ')}`);
  const debt = (tara.drivers || []).filter((d) => d.debt > 0).sort((a, b) => b.debt - a.debt);
  if (debt.length) out.push(`Ящики за водителями: ${debt.map((d) => `${d.name.split(' ')[0]} ${d.debt}`).join(', ')} (всего ${sum(debt, (d) => d.debt)})`);
  return out.join('\n');
}

// Заявка собрана — руководителю (сборка по кругу на складе)
function pickedForAdmin(o, point) {
  const qty = sum(o.lines, (l) => l.qty);
  const bonus = sum(o.lines, (l) => l.bonus);
  const where = point ? ` · ${point.customer}, ${point.address}` : '';
  return `Собрана заявка №${o.num}${where}\n${o.route ? o.route + ' · ' : ''}${qty} шт${bonus ? ` + ${bonus} бонус` : ''}, позиций ${o.lines.length}${o.picker ? `\nСобрал: ${o.picker}` : ''}${o.boxes != null ? `\nЯщиков: ${o.boxes}` : ''}`;
}

// Руководителю: человек впервые написал боту
function newVisitor(from, role, guest = false) {
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || 'без имени';
  const who = `${name}${from.username ? ' (@' + from.username + ')' : ''}, id ${from.id}`;
  if (guest) return `🎂 Гость открыл демо: ${who}.`;
  return role
    ? `🎂 Впервые зашёл в бота: ${who} — ${ROLE_LOWER[role] || role}.`
    : `🎂 Новый пользователь в боте: ${who}.\nДоступа нет. Чтобы пустить — «Склад и сводка» → «Справочники» → «Люди», впишите этот id.`;
}
// Гостевой вход (/demo): короткая презентация для тех, кто впервые видит приложение в Telegram
function guestWelcome(firstName) {
  return [
    `🎂 ${firstName ? firstName + ', д' : 'Д'}обро пожаловать в ТОРТОВОЗ — склад тортов прямо в Telegram.`,
    '',
    'Ничего устанавливать не нужно: нажмите кнопку ниже — приложение откроется здесь же, поверх чата.',
    '',
    '📊 Склад и сводка — для руководителя: остатки, рейсы, водители (км, возвраты, недостачи), ящики.',
    '📦 Кладовщик — заявки магазинов, сборка по кругу склада, отгрузка рейсом.',
    '🚚 Водитель — свои рейсы, спидометр, возвраты тортов и ящиков.',
    '',
    'Это демо: данные примерные, всё, что вы нажмёте, остаётся только в вашем телефоне — смело пробуйте.',
    'Закрыть приложение — «Закрыть» вверху, вернуться — /start.',
  ].join('\n');
}

function demoState(until) {
  if (!until) return 'Гостевой вход закрыт. Снова в бота пускаются только люди из «Справочники» → «Люди».';
  const [y, m, d] = until.split('-');
  return `Гостевой вход открыт до конца дня ${d}.${m}.${y}: любой, кто нажмёт /start, увидит демо со всеми экранами. О каждом госте придёт сообщение.\n\nНа несколько дней — /demo 3, закрыть — /demo off.`;
}

const ROLE_LOWER = { admin: 'руководитель', storekeeper: 'кладовщик', driver: 'водитель' };

module.exports = { newVisitor, guestWelcome, demoState, pickedForAdmin, weight, makeLookup, shippedForDriver, reportedForStore, closedForDriver, digest };
