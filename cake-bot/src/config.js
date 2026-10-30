require('dotenv').config();

function env(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

module.exports = {
  botToken: env('BOT_TOKEN', ''),
  telegramApi: env('TELEGRAM_API', 'https://api.telegram.org').replace(/\/+$/, ''), // подмена только для тестов
  adminIds: env('ADMIN_IDS', '').split(',').map((s) => s.trim()).filter(Boolean),
  apiUrl: env('API_URL', 'http://127.0.0.1:8098/api/cake'),
  serviceKey: env('SERVICE_KEY', ''),
  webappBase: env('WEBAPP_BASE', 'https://birsiti.github.io/TG-Studio/cake-warehouse').replace(/\/+$/, ''),
  digestCron: env('DIGEST_CRON', '0 7 * * *'),
  watchSeconds: Math.max(15, Number(env('WATCH_SECONDS', '60')) || 60),
  timezone: env('TIMEZONE', 'Europe/Minsk'),
};
