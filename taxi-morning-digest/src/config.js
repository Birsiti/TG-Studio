require('dotenv').config();

function env(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

module.exports = {
  telegramApiId: Number(env('TELEGRAM_API_ID', '0')),
  telegramApiHash: env('TELEGRAM_API_HASH', ''),
  telegramSession: env('TELEGRAM_SESSION', ''),
  sourceChat: env('SOURCE_CHAT', 'taxichat_by'),
  digestBotToken: env('DIGEST_BOT_TOKEN', ''),
  bossChatId: env('BOSS_CHAT_ID', ''),
  anthropicApiKey: env('ANTHROPIC_API_KEY', ''),
  digestCron: env('DIGEST_CRON', '0 7 * * *'),
  timezone: env('TIMEZONE', 'Europe/Minsk'),
};
