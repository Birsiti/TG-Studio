// Состояние бота на диске iMac: data/state.json (последние статусы рейсов,
// offset обновлений Telegram). Сами данные склада — в SQLite API.
// Один объект в памяти на процесс: опрос Telegram и проверка рейсов
// обновляют свои поля через save(patch) и не затирают чужие.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

let state = null;

function get() {
  if (!state) {
    try {
      state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch {
      state = { trips: null, updateOffset: 0 };
    }
  }
  return state;
}

function save(patch) {
  Object.assign(get(), patch);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE); // атомарно: не оставим полузаписанный файл при сбое
}

module.exports = { get, save, STATE_FILE };
