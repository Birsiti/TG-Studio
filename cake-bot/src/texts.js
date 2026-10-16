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

function tripTitle(t, L) {
  return `Рейс №${t.num} · ${L.city(t.cityId)}`;
}

function shippedForDriver(t, L) {
  const lines = t.lines.map((l) => `• ${L.product(l.productId)} — ${l.qty}`).join('\n');
  const tara = taraLine(L, t.taraOut);
  return `${tripTitle(t, L)} отгружен вам.\n\n${lines}\n\nВсего ${sum(t.lines, (l) => l.qty)} шт${tara ? `\nТара: ${tara}` : ''}\n\nПосле развоза сдайте отчёт в «Мои рейсы».`;
}

function reportedForStore(t, L) {
  let rep = {};
  try { rep = JSON.parse(t.report || '{}'); } catch { rep = {}; }
  const ret = rep.returns || [];
  const back = sum(ret, (r) => r.back);
  const spoiled = sum(ret, (r) => r.spoiled);
  const parts = [`${tripTitle(t, L)}: ${L.staff(t.driverId)} сдал отчёт.`];
  parts.push(ret.length ? `Возврат: ${back} шт целых${spoiled ? `, брак ${spoiled}` : ''}.` : 'Возврата нет.');
  const tb = taraLine(L, rep.taraBack || []);
  parts.push(tb ? `Тара обратно: ${tb}.` : 'Тару не вернули.');
  if (rep.comment) parts.push(`Комментарий: «${rep.comment}»`);
  parts.push('Сверьте и закройте рейс.');
  return parts.join('\n');
}

function closedForDriver(t, L) {
  const delivered = sum(t.lines, (l) => l.delivered);
  return `${tripTitle(t, L)} принят складом. Доставлено ${delivered} шт. Спасибо!`;
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
  const debt = (tara.cities || [])
    .map((c) => ({ c, n: Object.values(c.balance).reduce((a, b) => a + b, 0) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  if (debt.length) out.push(`Тара на руках: ${debt.slice(0, 5).map((x) => `${x.c.name} ${x.n}`).join(', ')}`);
  return out.join('\n');
}

module.exports = { weight, makeLookup, shippedForDriver, reportedForStore, closedForDriver, digest };
