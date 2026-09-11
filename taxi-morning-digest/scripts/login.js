// Одноразовый интерактивный вход в аккаунт, который состоит в чате
// t.me/taxichat_by. Запускается вручную: `npm run login`.
// Спросит номер телефона, код из Telegram и (если включена) 2FA-пароль,
// а затем выведет TELEGRAM_SESSION — её нужно один раз скопировать в .env.
// Дальше вход по сессии происходит автоматически, без кодов.

require('dotenv').config();
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');

const apiId = Number(process.env.TELEGRAM_API_ID || '0');
const apiHash = process.env.TELEGRAM_API_HASH || '';

if (!apiId || !apiHash) {
  console.error(
    'Сначала заполни TELEGRAM_API_ID и TELEGRAM_API_HASH в .env ' +
      '(получить на https://my.telegram.org -> API development tools).'
  );
  process.exit(1);
}

(async () => {
  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => input.text('Номер телефона (с кодом страны, напр. +375...): '),
    password: async () => input.text('Пароль двухфакторной аутентификации (если включена, иначе Enter): '),
    phoneCode: async () => input.text('Код из Telegram: '),
    onError: (err) => console.error(err),
  });

  console.log('\nВход выполнен. Добавь эту строку в .env как TELEGRAM_SESSION:\n');
  console.log(client.session.save());
  console.log('\nПосле этого можно запускать `npm start`.');

  await client.disconnect();
  process.exit(0);
})();
