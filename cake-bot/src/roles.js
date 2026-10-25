// изменено 2026-10-25 17:00
// Кто пишет боту и какие кнопки ему показать.

const ROLE_RU = { admin: 'Руководитель', manager: 'Руководитель', storekeeper: 'Кладовщик', logist: 'Логист', driver: 'Водитель' };

function roleOf(tgId, staff, adminIds) {
  const id = String(tgId);
  if (adminIds.includes(id)) return 'admin';
  const s = staff.find((x) => x.active && String(x.tgId) === id);
  return s ? (s.role === 'manager' ? 'admin' : s.role) : null;  // руководитель из «Людей» = руководитель из ADMIN_IDS
}

function staffName(tgId, staff) {
  const s = staff.find((x) => String(x.tgId) === String(tgId));
  return s ? s.name : '';
}

// Кнопка «Открыть» внизу чата (menu button) — одна для всех, ведёт на главную приложения
function menuButton(base) {
  return { type: 'web_app', text: 'Открыть', web_app: { url: `${base}/index.html` } };
}

// Telegram id сотрудников с ролью (для рассылок)
function idsOf(staff, role) {
  return staff.filter((s) => s.active && s.role === role && s.tgId).map((s) => String(s.tgId));
}

// Кому слать «руководителю»: ADMIN_IDS из .env и сотрудники с ролью «руководитель»
function bossIds(staff, adminIds) {
  return [...new Set(adminIds.map(String).concat(idsOf(staff || [], 'manager')))];
}

module.exports = { ROLE_RU, roleOf, bossIds, staffName, menuButton, idsOf };
