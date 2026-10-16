// Кто пишет боту и какие кнопки ему показать.

const ROLE_RU = { admin: 'Руководитель', storekeeper: 'Кладовщик', driver: 'Водитель' };

function roleOf(tgId, staff, adminIds) {
  const id = String(tgId);
  if (adminIds.includes(id)) return 'admin';
  const s = staff.find((x) => x.active && String(x.tgId) === id);
  return s ? s.role : null;
}

function staffName(tgId, staff) {
  const s = staff.find((x) => String(x.tgId) === String(tgId));
  return s ? s.name : '';
}

function webApp(text, base, file) {
  return [{ text, web_app: { url: `${base}/${file}` } }];
}

// Кнопки Web App (открываются только в личке с ботом)
function keyboard(role, base) {
  if (role === 'admin') return [webApp('Склад и сводка', base, 'admin.html'), webApp('Кладовщик', base, 'sklad.html'), webApp('Водитель', base, 'driver.html')];
  if (role === 'storekeeper') return [webApp('Открыть склад', base, 'sklad.html')];
  if (role === 'driver') return [webApp('Мои рейсы', base, 'driver.html')];
  return [];
}

// Telegram id сотрудников с ролью (для рассылок)
function idsOf(staff, role) {
  return staff.filter((s) => s.active && s.role === role && s.tgId).map((s) => String(s.tgId));
}

module.exports = { ROLE_RU, roleOf, staffName, keyboard, idsOf };
