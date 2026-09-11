const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.jsonl');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readState() {
  ensureDataDir();
  if (!fs.existsSync(STATE_FILE)) return { lastMessageId: 0 };
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { lastMessageId: 0 };
  }
}

function writeState(state) {
  ensureDataDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// message: { id, date (unix seconds), senderName, text }
function appendMessages(messages) {
  if (!messages.length) return;
  ensureDataDir();
  const lines = messages.map((m) => JSON.stringify(m)).join('\n') + '\n';
  fs.appendFileSync(MESSAGES_FILE, lines);
}

// Возвращает сообщения, у которых date (unix seconds) в [sinceUnix, untilUnix)
function readMessagesInRange(sinceUnix, untilUnix) {
  ensureDataDir();
  if (!fs.existsSync(MESSAGES_FILE)) return [];
  const content = fs.readFileSync(MESSAGES_FILE, 'utf8');
  if (!content.trim()) return [];
  return content
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((m) => m && m.date >= sinceUnix && m.date < untilUnix);
}

module.exports = {
  readState,
  writeState,
  appendMessages,
  readMessagesInRange,
};
