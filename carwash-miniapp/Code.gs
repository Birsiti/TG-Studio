/* ============================================================
   Code.gs — бэкенд одной мойки на Google Apps Script.
   Обслуживает все три Mini App: client.html, admin.html, owner.html.

   УСТАНОВКА (коротко, подробности — в README.md):
   1. Открыть Google Sheets, создать вкладки из SHEET_NAMES ниже
      с заголовками колонок как в комментариях к каждой функции.
   2. Расширения → Apps Script → вставить этот файл целиком.
   3. Развернуть → Новое развёртывание → Веб-приложение →
      "Выполнять как: я", "Доступ: все".
   4. Скопировать URL веб-приложения → вставить в CONFIG.apiUrl
      (или DEMO_CONFIG.apiUrl) во всех трёх html-файлах.
   ============================================================ */

const SHEET_NAMES = {
  SERVICES: 'УСЛУГИ',
  BOOKINGS: 'ЗАПИСИ',
  CARS: 'МАШИНЫ',
  STAFF: 'ПЕРСОНАЛ',
  SHIFTS: 'СМЕНЫ',
  SCHEDULE: 'РАСПИСАНИЕ',
  CLOSED_DATES: 'ЗАКРЫТЫЕ_ДАТЫ',
  BLOCKED_SLOTS: 'СЛОТЫ_БЛОК',
  BAYS: 'БОКСЫ',
  INVENTORY: 'СКЛАД',
  SHOP: 'МАГАЗИН',
  PAYOUTS: 'ВЫПЛАТЫ'
};

const CAR_CLASSES = ['legkovoy', 'krossover', 'vnedorozhnik', 'minivan'];
const STATUS_RU = {pending:'Ожидает', confirmed:'Подтверждена', done:'Выполнена', cancelled:'Отменена'};

/* ============ ВХОДНЫЕ ТОЧКИ ============ */

function doPost(e) {
  let body;
  try{
    body = JSON.parse(e.postData.contents);
  }catch(err){
    return jsonResponse({ok:false, error:'bad json'});
  }
  try{
    const result = routeAction(body.action, body);
    return jsonResponse(result);
  }catch(err){
    return jsonResponse({ok:false, error:String(err)});
  }
}

function doGet(e) {
  // Реестр использует GET с ?action=...; этот файл — бэкенд ОДНОЙ мойки,
  // он всегда отвечает на POST. GET оставлен только как проверка живости.
  return jsonResponse({ok:true, message:'Carwash backend работает'});
}

function jsonResponse(obj){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function routeAction(action, p){
  switch(action){
    // ---- клиент ----
    case 'getServices':      return getServices(p.audience);
    case 'getSlots':         return getSlots(p);
    case 'createBooking':    return createBooking(p);
    case 'cancelBooking':    return cancelBooking(p);
    case 'getMyBookings':    return getMyBookings(p);
    case 'getMyCars':        return getMyCars(p);
    case 'saveCar':          return saveCar(p);
    case 'deleteCar':        return deleteCar(p);
    // ---- администратор ----
    case 'getBookings':          return getBookings();
    case 'updateBookingStatus':  return updateBookingStatus(p);
    case 'assignBookingStaff':   return assignBookingStaff(p);
    case 'getShift':             return getShift(p);
    case 'setShift':             return setShift(p);
    case 'getDaySlots':          return getDaySlots(p);
    case 'blockSlot':            return blockSlot(p);
    case 'unblockSlot':          return unblockSlot(p);
    case 'saveService':          return saveService(p);
    case 'deleteService':        return deleteService(p);
    case 'getSchedule':          return getSchedule();
    case 'saveSchedule':         return saveSchedule(p);
    case 'addClosedDate':        return addClosedDate(p);
    case 'removeClosedDate':     return removeClosedDate(p);
    // ---- владелец ----
    case 'getOverview':          return getOverview();
    case 'getOverviewRange':     return getOverviewRange(p);
    case 'payStaff':              return payStaff(p);
    case 'getPayouts':            return getPayouts(p);
    case 'getBays':               return getBays();
    case 'saveBay':                return saveBay(p);
    case 'deleteBay':              return deleteBay(p);
    case 'getStaff':               return getStaffList();
    case 'saveStaff':              return saveStaff(p);
    case 'deleteStaff':            return deleteStaff(p);
    case 'getInventory':           return getInventoryList();
    case 'saveInventoryItem':      return saveInventoryItem(p);
    case 'deleteInventoryItem':    return deleteInventoryItem(p);
    case 'getShop':                 return getShopList();
    case 'saveShopItem':            return saveShopItem(p);
    case 'deleteShopItem':          return deleteShopItem(p);
    default: return {ok:false, error:'unknown action: ' + action};
  }
}

/* ============ УТИЛИТЫ РАБОТЫ С ЛИСТАМИ ============ */

function sh(name){
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if(!s) throw new Error('Лист не найден: ' + name + '. Создайте вкладку с этим именем и заголовками колонок.');
  return s;
}

// Sheets сама конвертирует строки вида "2026-08-10" / "9:00" в тип Дата/Время
// при записи — из-за этого потом ломается строковое сравнение (b.date===date,
// b.time===time при поиске занятых слотов) и JSON отдаёт "2026-08-10T07:00:00.000Z"
// вместо чистой строки. looksLikeDateOrTime()+forcePlainText() защищают ячейку
// ДО записи; normalizeCell() приводит обратно в строку то, что уже успело
// конвертироваться раньше (старые строки, ручной ввод в UI таблицы).
function looksLikeDateOrTime(v){
  return typeof v === 'string' && (/^\d{4}-\d{1,2}-\d{1,2}$/.test(v) || /^\d{1,2}:\d{2}$/.test(v));
}

function forcePlainText(range){
  range.setNumberFormat('@');
}

function normalizeCell(v){
  if(!(v instanceof Date)) return v;
  const tz = Session.getScriptTimeZone();
  const isMidnight = v.getHours()===0 && v.getMinutes()===0 && v.getSeconds()===0;
  return isMidnight ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : Utilities.formatDate(v, tz, 'H:mm');
}

function readAll(name){
  const sheet = sh(name);
  const data = sheet.getDataRange().getValues();
  if(data.length < 2) return [];
  const headers = data[0];
  return data.slice(1)
    .filter(row => row.some(c => c !== '' && c !== null))
    .map(row => {
      const obj = {};
      headers.forEach((h,i)=>{ obj[h] = normalizeCell(row[i]); });
      return obj;
    });
}

function appendRow(name, obj){
  const sheet = sh(name);
  const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  const values = headers.map(h => obj[h] !== undefined ? obj[h] : '');
  const range = sheet.getRange(sheet.getLastRow()+1, 1, 1, headers.length);
  values.forEach((v,i)=>{ if(looksLikeDateOrTime(v)) forcePlainText(range.getCell(1, i+1)); });
  range.setValues([values]);
}

function updateById(name, idField, idValue, updates){
  const sheet = sh(name);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf(idField);
  for(let i=1;i<data.length;i++){
    if(String(data[i][idCol]) === String(idValue)){
      Object.keys(updates).forEach(key=>{
        const col = headers.indexOf(key);
        if(col > -1){
          const cell = sheet.getRange(i+1, col+1);
          if(looksLikeDateOrTime(updates[key])) forcePlainText(cell);
          cell.setValue(updates[key]);
        }
      });
      return true;
    }
  }
  return false;
}

function deleteById(name, idField, idValue){
  const sheet = sh(name);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf(idField);
  for(let i=data.length-1;i>=1;i--){
    if(String(data[i][idCol]) === String(idValue)){
      sheet.deleteRow(i+1);
      return true;
    }
  }
  return false;
}

function genId(prefix){
  return prefix + '-' + Utilities.getUuid().slice(0,8).toUpperCase();
}

function dateKey(d){
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
function todayKey(){ return dateKey(new Date()); }

function parsePrice(item, cls){
  // из плоских колонок вида price_legkovoy_min/max собирает {legkovoy:[min,max], ...}
  const price = {};
  CAR_CLASSES.forEach(c=>{
    price[c] = [Number(item['price_'+c+'_min'])||0, Number(item['price_'+c+'_max'])||0];
  });
  return price;
}

/* ============================================================
   УСЛУГИ
   Колонки листа "УСЛУГИ":
   id | category | name | price_legkovoy_min | price_legkovoy_max |
   price_krossover_min | price_krossover_max | price_vnedorozhnik_min |
   price_vnedorozhnik_max | price_minivan_min | price_minivan_max |
   desc | visible
   ============================================================ */

function getServices(audience){
  let rows = readAll(SHEET_NAMES.SERVICES);
  if(audience === 'client'){
    rows = rows.filter(r => r.visible !== false && r.visible !== 'FALSE' && r.visible !== 'false');
  }
  const byCategory = {};
  const order = [];
  rows.forEach(r=>{
    if(!byCategory[r.category]){ byCategory[r.category] = []; order.push(r.category); }
    const item = {
      id: r.id, name: r.name, price: parsePrice(r),
      desc: r.desc || undefined
    };
    if(audience !== 'client') item.visible = !(r.visible === false || r.visible === 'FALSE' || r.visible === 'false');
    byCategory[r.category].push(item);
  });
  return {ok:true, categories: order.map(cat => ({category:cat, items:byCategory[cat]}))};
}

function saveService(p){
  const it = p.item;
  const row = {
    id: it.id || genId('svc'), category: p.category, name: it.name,
    price_legkovoy_min: it.price.legkovoy[0], price_legkovoy_max: it.price.legkovoy[1],
    price_krossover_min: it.price.krossover[0], price_krossover_max: it.price.krossover[1],
    price_vnedorozhnik_min: it.price.vnedorozhnik[0], price_vnedorozhnik_max: it.price.vnedorozhnik[1],
    price_minivan_min: it.price.minivan[0], price_minivan_max: it.price.minivan[1],
    desc: it.desc || '', visible: it.visible !== false
  };
  const updated = it.id && updateById(SHEET_NAMES.SERVICES, 'id', it.id, row);
  if(!updated) appendRow(SHEET_NAMES.SERVICES, row);
  return {ok:true, item: row};
}

function deleteService(p){
  deleteById(SHEET_NAMES.SERVICES, 'id', p.id);
  return {ok:true};
}

/* ============================================================
   СЛОТЫ / РАСПИСАНИЕ
   "РАСПИСАНИЕ": weekday | open | from | to   (7 строк: mon..sun)
   "ЗАКРЫТЫЕ_ДАТЫ": date
   "СЛОТЫ_БЛОК": date | time
   ============================================================ */

const WEEKDAY_KEYS = ['sun','mon','tue','wed','thu','fri','sat'];

function getScheduleMap(){
  const rows = readAll(SHEET_NAMES.SCHEDULE);
  const map = {};
  rows.forEach(r=>{ map[r.weekday] = {open: r.open===true||r.open==='TRUE'||r.open==='true', from:r.from, to:r.to}; });
  return map;
}

function weekdayKeyOf(date){
  const [y,m,d] = date.split('-').map(Number);
  return WEEKDAY_KEYS[new Date(y, m-1, d).getDay()];
}

function isDateOpen(date, scheduleMap, closedDates){
  if(closedDates.indexOf(date) > -1) return false;
  const day = scheduleMap[weekdayKeyOf(date)];
  return !!(day && day.open);
}

function daySlotTimes(date, scheduleMap){
  const day = scheduleMap[weekdayKeyOf(date)];
  if(!day || !day.open) return [];
  const [fromH, fromM] = String(day.from||'9:00').split(':').map(Number);
  const [toH, toM] = String(day.to||'19:00').split(':').map(Number);
  const times = [];
  let h = fromH, m = (fromM >= 30) ? 30 : 0;
  while(h < toH || (h === toH && m < toM)){
    times.push(h + ':' + (m===0 ? '00' : '30'));
    m += 30;
    if(m >= 60){ m = 0; h += 1; }
  }
  return times;
}

function computeDaySlotStates(date){
  const scheduleMap = getScheduleMap();
  const closedDates = readAll(SHEET_NAMES.CLOSED_DATES).map(r=>r.date);
  if(!isDateOpen(date, scheduleMap, closedDates)) return [];
  const bookings = readAll(SHEET_NAMES.BOOKINGS).filter(b => b.date === date && b.status !== 'cancelled');
  const blocked = readAll(SHEET_NAMES.BLOCKED_SLOTS).filter(b => b.date === date).map(b=>b.time);
  return daySlotTimes(date, scheduleMap).map(time=>{
    const booking = bookings.find(b => b.time === time);
    if(booking) return {time, state:'booked', bookingId: booking.id};
    if(blocked.indexOf(time) > -1) return {time, state:'blocked'};
    return {time, state:'free'};
  });
}

function getSlots(p){
  // для клиента: {time, disabled}
  const states = computeDaySlotStates(p.date);
  const isToday = p.date === todayKey();
  const now = new Date();
  const slots = states.map(s=>{
    let disabled = s.state !== 'free';
    if(!disabled && isToday){
      const [h,m] = s.time.split(':').map(Number);
      const slotTime = new Date(); slotTime.setHours(h,m,0,0);
      if(slotTime < now) disabled = true;
    }
    return {time:s.time, disabled};
  });
  return {ok:true, slots};
}

function getDaySlots(p){
  // для администратора: {time, state, bookingId?}
  return {ok:true, slots: computeDaySlotStates(p.date)};
}

function blockSlot(p){
  appendRow(SHEET_NAMES.BLOCKED_SLOTS, {date:p.date, time:p.time});
  return {ok:true};
}
function unblockSlot(p){
  const sheet = sh(SHEET_NAMES.BLOCKED_SLOTS);
  const data = sheet.getDataRange().getValues();
  for(let i=data.length-1;i>=1;i--){
    if(data[i][0] === p.date && data[i][1] === p.time){ sheet.deleteRow(i+1); break; }
  }
  return {ok:true};
}

function getSchedule(){
  const closedDates = readAll(SHEET_NAMES.CLOSED_DATES).map(r=>r.date);
  return {ok:true, schedule: getScheduleMap(), closedDates};
}

function saveSchedule(p){
  Object.keys(p.schedule).forEach(weekday=>{
    const d = p.schedule[weekday];
    updateById(SHEET_NAMES.SCHEDULE, 'weekday', weekday, {open:d.open, from:d.from, to:d.to});
  });
  return {ok:true};
}

function addClosedDate(p){
  const existing = readAll(SHEET_NAMES.CLOSED_DATES).some(r=>r.date===p.date);
  if(!existing) appendRow(SHEET_NAMES.CLOSED_DATES, {date:p.date});
  return {ok:true};
}
function removeClosedDate(p){
  const sheet = sh(SHEET_NAMES.CLOSED_DATES);
  const data = sheet.getDataRange().getValues();
  for(let i=data.length-1;i>=1;i--){
    if(data[i][0] === p.date){ sheet.deleteRow(i+1); break; }
  }
  return {ok:true};
}

/* ============================================================
   ЗАПИСИ
   "ЗАПИСИ": id | date | time | car_number | car_brand | car_model |
   car_class | services | price_min | price_max | client_name |
   client_phone | client_tg_id | status | assigned_staff_id | created_at
   status хранится по-английски: pending|confirmed|done|cancelled
   ============================================================ */

function bookingRowToClient(r){
  return {
    id:r.id, date:r.date, time:r.time,
    car:{number:r.car_number, brand:r.car_brand, model:r.car_model, carClass:r.car_class},
    services: String(r.services||'').split('|').filter(Boolean),
    priceMin:Number(r.price_min)||0, priceMax:Number(r.price_max)||0,
    contact:{name:r.client_name, phone:r.client_phone},
    status: STATUS_RU[r.status] || r.status
  };
}
function bookingRowToAdmin(r){
  return {
    id:r.id, date:r.date, time:r.time,
    car:{number:r.car_number, brand:r.car_brand, model:r.car_model},
    services: String(r.services||'').split('|').filter(Boolean),
    priceMin:Number(r.price_min)||0, priceMax:Number(r.price_max)||0,
    contact:{name:r.client_name, phone:r.client_phone},
    status: r.status, assignedStaffId: r.assigned_staff_id || null
  };
}

function createBooking(p){
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try{
    const slot = computeDaySlotStates(p.date).find(s => s.time === p.time);
    if(!slot || slot.state !== 'free'){
      return {ok:false, error:'slot_unavailable'};
    }
    const id = genId('BLK');
    appendRow(SHEET_NAMES.BOOKINGS, {
      id, date:p.date, time:p.time,
      car_number:p.car.number, car_brand:p.car.brand, car_model:p.car.model, car_class:p.car.carClass,
      services: (p.services||[]).join('|'),
      price_min:p.priceMin, price_max:p.priceMax,
      client_name:p.contact.name, client_phone:p.contact.phone, client_tg_id:p.userId,
      status:'confirmed', assigned_staff_id:'', created_at:new Date().toISOString()
    });
    const row = readAll(SHEET_NAMES.BOOKINGS).find(r=>r.id===id);
    return {ok:true, booking: bookingRowToClient(row)};
  } finally {
    lock.releaseLock();
  }
}

function cancelBooking(p){
  updateById(SHEET_NAMES.BOOKINGS, 'id', p.id, {status:'cancelled'});
  return {ok:true};
}

function getMyBookings(p){
  const rows = readAll(SHEET_NAMES.BOOKINGS).filter(r => String(r.client_tg_id) === String(p.userId));
  rows.sort((a,b)=> (b.date+b.time).localeCompare(a.date+a.time));
  return {ok:true, bookings: rows.map(bookingRowToClient)};
}

function getBookings(){
  const rows = readAll(SHEET_NAMES.BOOKINGS);
  return {ok:true, bookings: rows.map(bookingRowToAdmin)};
}

function updateBookingStatus(p){
  updateById(SHEET_NAMES.BOOKINGS, 'id', p.id, {status:p.status});
  return {ok:true};
}

function assignBookingStaff(p){
  updateById(SHEET_NAMES.BOOKINGS, 'id', p.id, {assigned_staff_id: p.staffId || ''});
  return {ok:true};
}

/* ============================================================
   МАШИНЫ КЛИЕНТА
   "МАШИНЫ": id | tg_id | number | brand | model | car_class | last_used_at
   ============================================================ */

function getMyCars(p){
  const rows = readAll(SHEET_NAMES.CARS).filter(r => String(r.tg_id) === String(p.userId));
  rows.sort((a,b)=> new Date(b.last_used_at) - new Date(a.last_used_at));
  return {ok:true, cars: rows.map(r=>({id:r.id, number:r.number, brand:r.brand, model:r.model, carClass:r.car_class, lastUsedAt:new Date(r.last_used_at).getTime()}))};
}

function saveCar(p){
  const norm = (p.car.number||'').trim().toUpperCase();
  const now = new Date().toISOString();
  const all = readAll(SHEET_NAMES.CARS);
  let existing = p.car.id && all.find(r=>r.id===p.car.id);
  if(!existing) existing = all.find(r => String(r.tg_id)===String(p.userId) && r.number===norm);
  const row = {
    id: existing ? existing.id : genId('car'), tg_id:p.userId, number:norm,
    brand:p.car.brand||'', model:p.car.model||'', car_class:p.car.carClass||'', last_used_at:now
  };
  if(existing) updateById(SHEET_NAMES.CARS, 'id', existing.id, row);
  else appendRow(SHEET_NAMES.CARS, row);
  return {ok:true, car:{id:row.id, number:row.number, brand:row.brand, model:row.model, carClass:row.car_class, lastUsedAt:new Date(now).getTime()}};
}

function deleteCar(p){
  deleteById(SHEET_NAMES.CARS, 'id', p.id);
  return {ok:true};
}

/* ============================================================
   ПЕРСОНАЛ / СМЕНЫ
   "ПЕРСОНАЛ": id | name | role | pay_type | rate | phone | shifts_month | accrued_month
   "СМЕНЫ": date | staff_ids   (staff_ids — через запятую)
   ============================================================ */

function getStaffList(){
  const rows = readAll(SHEET_NAMES.STAFF);
  return {ok:true, staff: rows.map(r=>({
    id:r.id, name:r.name, role:r.role, payType:r.pay_type, rate:Number(r.rate)||0,
    phone:r.phone||'', shiftsMonth:Number(r.shifts_month)||0, accruedMonth:Number(r.accrued_month)||0
  }))};
}

function saveStaff(p){
  const s = p.staff;
  const row = {
    id:s.id || genId('st'), name:s.name, role:s.role, pay_type:s.payType, rate:s.rate,
    phone:s.phone||'', shifts_month:s.shiftsMonth||0, accrued_month:s.accruedMonth||0
  };
  const updated = s.id && updateById(SHEET_NAMES.STAFF, 'id', s.id, row);
  if(!updated) appendRow(SHEET_NAMES.STAFF, row);
  return {ok:true, staff:row};
}

function deleteStaff(p){
  deleteById(SHEET_NAMES.STAFF, 'id', p.id);
  return {ok:true};
}

/* ============================================================
   ВЫПЛАТЫ — история выплат персоналу
   "ВЫПЛАТЫ": id | staff_id | amount | date | created_at
   ============================================================ */

function payStaff(p){
  const staff = readAll(SHEET_NAMES.STAFF).find(s=>s.id===p.staffId);
  if(!staff) return {ok:false, error:'staff not found'};
  const amount = Number(staff.accrued_month)||0;
  if(amount <= 0) return {ok:false, error:'nothing to pay'};
  const id = genId('pay');
  appendRow(SHEET_NAMES.PAYOUTS, {
    id, staff_id:p.staffId, amount, date:todayKey(), created_at:new Date().toISOString()
  });
  updateById(SHEET_NAMES.STAFF, 'id', p.staffId, {accrued_month:0});
  return {ok:true, payout:{id, staffId:p.staffId, amount, date:todayKey()}};
}

function getPayouts(p){
  let rows = readAll(SHEET_NAMES.PAYOUTS);
  if(p && p.staffId) rows = rows.filter(r=>r.staff_id===p.staffId);
  rows.sort((a,b)=> (b.date||'').localeCompare(a.date||''));
  return {ok:true, payouts: rows.map(r=>({
    id:r.id, staffId:r.staff_id, amount:Number(r.amount)||0, date:r.date
  }))};
}

function getShift(p){
  const row = readAll(SHEET_NAMES.SHIFTS).find(r=>r.date===p.date);
  const staffIds = row ? String(row.staff_ids||'').split(',').filter(Boolean) : [];
  return {ok:true, date:p.date, staffIds};
}

function setShift(p){
  const updated = updateById(SHEET_NAMES.SHIFTS, 'date', p.date, {staff_ids: p.staffIds.join(',')});
  if(!updated) appendRow(SHEET_NAMES.SHIFTS, {date:p.date, staff_ids:p.staffIds.join(',')});
  return {ok:true};
}

/* ============================================================
   БОКСЫ / СКЛАД / МАГАЗИН — простой CRUD
   "БОКСЫ": id | name | status | note | today_count | today_revenue
   "СКЛАД": id | name | unit | qty | min | price
   "МАГАЗИН": id | name | price | stock | visible
   ============================================================ */

function getBays(){
  const rows = readAll(SHEET_NAMES.BAYS);
  return {ok:true, bays: rows.map(r=>({
    id:r.id, name:r.name, status:r.status, note:r.note||'',
    todayCount:Number(r.today_count)||0, todayRevenue:Number(r.today_revenue)||0
  }))};
}
function saveBay(p){
  const b = p.bay;
  const row = {id:b.id||genId('bay'), name:b.name, status:b.status, note:b.note||'', today_count:b.todayCount||0, today_revenue:b.todayRevenue||0};
  const updated = b.id && updateById(SHEET_NAMES.BAYS, 'id', b.id, row);
  if(!updated) appendRow(SHEET_NAMES.BAYS, row);
  return {ok:true, bay:row};
}
function deleteBay(p){
  deleteById(SHEET_NAMES.BAYS, 'id', p.id);
  return {ok:true};
}

function getInventoryList(){
  const rows = readAll(SHEET_NAMES.INVENTORY);
  return {ok:true, items: rows.map(r=>({id:r.id, name:r.name, unit:r.unit, qty:Number(r.qty)||0, min:Number(r.min)||0, price:Number(r.price)||0}))};
}
function saveInventoryItem(p){
  const it = p.item;
  const row = {id:it.id||genId('inv'), name:it.name, unit:it.unit, qty:it.qty, min:it.min, price:it.price};
  const updated = it.id && updateById(SHEET_NAMES.INVENTORY, 'id', it.id, row);
  if(!updated) appendRow(SHEET_NAMES.INVENTORY, row);
  return {ok:true, item:row};
}
function deleteInventoryItem(p){
  deleteById(SHEET_NAMES.INVENTORY, 'id', p.id);
  return {ok:true};
}

function getShopList(){
  const rows = readAll(SHEET_NAMES.SHOP);
  return {ok:true, items: rows.map(r=>({id:r.id, name:r.name, price:Number(r.price)||0, stock:Number(r.stock)||0, visible: !(r.visible===false||r.visible==='FALSE'||r.visible==='false')}))};
}
function saveShopItem(p){
  const it = p.item;
  const row = {id:it.id||genId('shop'), name:it.name, price:it.price, stock:it.stock, visible:it.visible!==false};
  const updated = it.id && updateById(SHEET_NAMES.SHOP, 'id', it.id, row);
  if(!updated) appendRow(SHEET_NAMES.SHOP, row);
  return {ok:true, item:row};
}
function deleteShopItem(p){
  deleteById(SHEET_NAMES.SHOP, 'id', p.id);
  return {ok:true};
}

/* ============================================================
   ОБЗОР / АНАЛИТИКА (владелец) — считается на лету из ЗАПИСИ
   ============================================================ */

function summarizeRows(rows){
  const revenue = rows.reduce((s,r)=> s + (Number(r.price_min)||0), 0);
  const bookingsCount = rows.length;
  const avgCheck = bookingsCount ? Math.round(revenue / bookingsCount) : 0;
  return {revenue, bookings: bookingsCount, avgCheck, payroll: estimatePayroll(rows)};
}

// График по дням внутри диапазона [fromDate, toDate] (включительно) + топ-5
// услуг по выручке за этот же диапазон. Общая логика для getOverview() и
// getOverviewRange() — так «сегодня/неделя/месяц» и произвольный период
// считаются одинаково, без дублирования кода.
function buildChartAndTop(active, fromDate, toDate){
  const from = new Date(fromDate+'T00:00:00'), to = new Date(toDate+'T00:00:00');
  const dayLabels = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
  const chart = [];
  for(let d = new Date(from); d <= to; d.setDate(d.getDate()+1)){
    const key = dateKey(d);
    const revenue = active.filter(r=>r.date===key).reduce((s,r)=>s+(Number(r.price_min)||0),0);
    chart.push({d: dayLabels[d.getDay()], v: revenue});
  }
  const inRange = active.filter(r=>r.date>=fromDate && r.date<=toDate);
  const byService = {};
  inRange.forEach(r=>{
    String(r.services||'').split('|').filter(Boolean).forEach(name=>{
      byService[name] = (byService[name]||0) + (Number(r.price_min)||0);
    });
  });
  const topServices = Object.keys(byService)
    .map(name=>({name, revenue:byService[name]}))
    .sort((a,b)=>b.revenue-a.revenue)
    .slice(0,5);
  return {chart, topServices};
}

function getOverview(){
  const bookings = readAll(SHEET_NAMES.BOOKINGS);
  const active = bookings.filter(b => b.status !== 'cancelled');
  const today = todayKey();

  const weekStart = dateKey(new Date(Date.now() - 6*86400000));
  const now = new Date();
  const monthStart = dateKey(new Date(now.getFullYear(), now.getMonth(), 1));

  const overview = {
    today: summarizeRows(active.filter(r=>r.date===today)),
    week: summarizeRows(active.filter(r=>r.date>=weekStart && r.date<=today)),
    month: summarizeRows(active.filter(r=>r.date>=monthStart && r.date<=today))
  };

  const {chart, topServices} = buildChartAndTop(active, weekStart, today);

  return {ok:true, overview, chart, topServices};
}

function getOverviewRange(p){
  const bookings = readAll(SHEET_NAMES.BOOKINGS);
  const active = bookings.filter(b => b.status !== 'cancelled');
  const from = p.from, to = p.to;
  const rows = active.filter(r=>r.date>=from && r.date<=to);
  const overview = {custom: summarizeRows(rows)};
  const {chart, topServices} = buildChartAndTop(active, from, to);
  return {ok:true, overview, chart, topServices};
}

function estimatePayroll(periodRows){
  // приблизительная оценка: % от выручки для мойщиков по назначенным записям
  // + пропорциональная доля фиксированной ставки для администраторов
  const staff = readAll(SHEET_NAMES.STAFF);
  const staffById = {};
  staff.forEach(s=> staffById[s.id] = s);

  let sum = 0;
  periodRows.forEach(r=>{
    const s = staffById[r.assigned_staff_id];
    if(s && s.pay_type === 'percent'){
      sum += (Number(r.price_min)||0) * (Number(s.rate)||0) / 100;
    }
  });

  // фиксированная часть — пропорционально числу дней в периоде относительно месяца
  const daysInPeriod = new Set(periodRows.map(r=>r.date)).size || 1;
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate();
  staff.filter(s=>s.pay_type==='fixed').forEach(s=>{
    sum += (Number(s.rate)||0) * Math.min(daysInPeriod, daysInMonth) / daysInMonth;
  });

  return Math.round(sum);
}
