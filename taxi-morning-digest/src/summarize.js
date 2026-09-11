const config = require('./config');

const SYSTEM_PROMPT = `Ты помогаешь диспетчеру такси. Тебе дают лог сообщений из рабочего
чата водителей/диспетчеров за прошедшие сутки (формат "[время] имя: текст").
Сделай короткую утреннюю сводку на русском для руководителя, который сам чат
не читает. Структура:

1. Главное — 3-6 пунктов, что реально важно (проблемы, жалобы, срывы заказов,
   конфликты, важные объявления, изменения тарифов/графика).
2. Заказы/спрос — если из переписки видно всплески спроса, нехватку машин,
   отмены — коротко отметь.
3. Требует внимания — если есть что-то, на что руководителю стоит
   отреагировать лично, вынеси отдельным пунктом.

Если день был спокойный без происшествий — так и напиши одной строкой,
не выдумывай проблемы. Пиши кратко, по-деловому, без вступлений и воды.`;

function formatRaw(messages) {
  if (!messages.length) return 'За прошедшие сутки сообщений в чате не было.';
  const lines = messages.map((m) => {
    const time = new Date(m.date * 1000).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: config.timezone,
    });
    return `[${time}] ${m.senderName}: ${m.text}`;
  });
  return lines.join('\n');
}

async function buildDigest(messages) {
  const raw = formatRaw(messages);

  if (!config.anthropicApiKey || !messages.length) {
    // Без ключа Anthropic — просто сырой список (обрезанный, чтобы не упереться
    // в лимит длины сообщения Telegram).
    return truncateForTelegram(raw);
  }

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: raw }],
    });
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();
    return text || truncateForTelegram(raw);
  } catch (err) {
    console.error('Не удалось получить ИИ-сводку, шлём сырой лог:', err.message);
    return truncateForTelegram(raw);
  }
}

function truncateForTelegram(text) {
  const LIMIT = 3500; // с запасом от лимита Telegram в 4096 символов
  if (text.length <= LIMIT) return text;
  return text.slice(0, LIMIT) + '\n\n…(обрезано, полный лог в data/messages.jsonl)';
}

module.exports = { buildDigest };
