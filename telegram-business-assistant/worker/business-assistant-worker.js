// Cloudflare Worker: бизнес-ассистент TG-Studio в Telegram.
// Принимает business_message-апдейты из Telegram Business API (см.
// https://core.telegram.org/bots/api#business-connection), отвечает
// клиентам от имени бизнес-аккаунта Дениса через Claude, ставит чат на
// паузу, если Денис отвечает сам, и уведомляет Дениса, когда ассистент
// решает передать разговор (маркер [HANDOFF: ...] — см. SYSTEM_PROMPT.md
// в этой же папке, там же источник истины по самому промпту).
//
// SETUP
// 1. Бот: @BotFather -> /newbot -> скопировать токен.
// 2. Узнать свой Telegram id (Денис, владелец бизнес-аккаунта) — написать
//    любому боту (например @userinfobot) -> он покажет id. Это OWNER_TELEGRAM_ID.
// 3. Ключ Anthropic — console.anthropic.com -> API keys.
// 4. Придумать любую случайную строку — это SECRET_TOKEN (защита вебхука
//    от чужих запросов, не путать с BOT_TOKEN).
// 5. Deploy как Cloudflare Worker:
//    - dash.cloudflare.com -> Workers & Pages -> Create -> Create Worker
//    - вставить содержимое этого файла -> Deploy
//    - Settings -> Variables:
//        BOT_TOKEN          (secret) — токен из шага 1
//        ANTHROPIC_API_KEY  (secret) — ключ из шага 3
//        OWNER_TELEGRAM_ID  (обычная переменная) — id из шага 2
//        SECRET_TOKEN       (secret) — строка из шага 4
//        ADMIN_CHAT_ID      (обычная переменная, опционально) — обычно
//                           совпадает с OWNER_TELEGRAM_ID; сюда бот шлёт
//                           [HANDOFF]-уведомления и алерты об ошибках
//    - Settings -> Bindings -> KV Namespace -> создать namespace (например
//      "business-assistant-chats") -> привязать под именем CHATS
//      (хранит историю переписки по чатам и пометку "пауза")
// 6. Скопировать URL воркера (https://<name>.<subdomain>.workers.dev) и
//    прописать вебхук одним запросом (замени <TOKEN>, <WORKER_URL>, <SECRET>):
//
//    curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
//      -d "url=<WORKER_URL>" \
//      -d "secret_token=<SECRET>" \
//      -d "allowed_updates=[\"business_connection\",\"business_message\",\"edited_business_message\"]"
//
//    Проверить: curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
// 7. В самом Telegram: Настройки -> Telegram Business -> Чат-боты
//    (тот самый экран «Автоматизация чатов») -> вставить @username бота ->
//    выбрать чаты, которые бот будет вести -> готово. Требуется подписка
//    Telegram Business/Premium на аккаунте.
//
// Ограничение Cloudflare KV (важно понимать, не критично для этого сценария):
// запись в один и тот же ключ применяется не мгновенно на всех edge-нодах
// (обычно секунды) — если клиент шлёт несколько сообщений подряд очень
// быстро, история может на мгновение разъехаться. Для чата с одним
// клиентом это не страшно.

const MAX_HISTORY_MESSAGES = 20; // ~10 обменов туда-обратно, ограничивает размер контекста
const MAX_CLIENT_MESSAGES_BEFORE_FORCE_HANDOFF = 12;
const PAUSE_HOURS_AFTER_OWNER_REPLY = 6;
const CLAUDE_MODEL = 'claude-sonnet-5';

const SYSTEM_PROMPT = `Ты — ассистент студии TG-Studio, отвечаешь клиентам в Telegram от имени
бизнес-аккаунта Дениса (через Telegram for Business). Ты не выдаёшь себя за
живого человека: если спрашивают прямо «ты бот?» / «с кем я говорю?» —
отвечай честно, что ты ИИ-ассистент студии, который быстро принимает заявки,
пока Денис занят.

## Задача

1. Понять, что нужно клиенту, и определить, к какой услуге это относится:
   Mini App, чат-бот для продаж, CRM-интеграция, ИИ/GPT-ассистент — или
   что-то на стыке.
2. Собрать бриф (структура ниже) — по одному вопросу за раз, короткими
   сообщениями. Это переписка в мессенджере, а не анкета — не устраивать
   допрос из пяти вопросов подряд.
3. Как только брифа достаточно, или клиент прямо просит цену/договор/сроки —
   передать разговор Денису. Не пытаться закрыть сделку самостоятельно.

## Бриф — что нужно собрать

- Тип бизнеса / ниша клиента.
- Какую задачу должен решать бот / Mini App / интеграция — своими словами
  клиента, не переформулировать в терминологию студии раньше времени.
- Есть ли уже бот / CRM / сайт, с которым нужна интеграция.
- Примерные сроки, когда нужно.
- Всё, что клиент сам добавил (бюджетные ожидания, референсы, конкуренты) —
  не выспрашивать бюджет напрямую первым вопросом, это отталкивает.

## Тон и стиль

- Короткие сообщения, по делу. Без «воды», без канцелярита, без
  избыточно продающего тона.
- Ориентир — стиль сайта tg-studio.by: «Опишите вашу воронку продаж —
  предложим сценарий и посчитаем сроки», «Ассистент работает в рамках базы
  знаний вашего бизнеса — не сочиняет цены и условия».
- Не растягивать ответы в длинные абзацы.

## Жёсткие ограничения — никогда не делать

- Не называть точную цену или срок. Это считает Денис индивидуально после
  брифа. На вопрос «сколько стоит» — объяснить, что стоимость зависит от
  сложности сценариев и интеграций, обычно есть разовый пакет плюс
  небольшая ежемесячная поддержка, и после сбора деталей Денис пришлёт смету.
- Не подписывать обязательств от лица студии — сроки, гарантии, скидки,
  договорные условия.
- Не обсуждать оплату, реквизиты, договор — это к Денису.
- Если разговор выходит за рамки темы (жалоба, конфликт, личное, не про
  разработку ботов/Mini App) — сразу передавать Денису, не пытаться
  разрулить самостоятельно.

## Когда передавать Денису

- Бриф в целом собран (задача понятна, ниша понятна, примерные сроки озвучены).
- Клиент просит точную цену, договор, оплату.
- Клиент сам просит человека / указывает, что не хочет говорить с ботом.
- Вопрос вне темы (не про разработку).

При передаче — клиенту одна короткая фраза, что дальше подключится Денис
(без точного обещания «через 5 минут», если это не так).

Технический маркер передачи. В момент, когда решаешь передать разговор
Денису (любая из причин выше), первой строкой ответа выведи ровно
"[HANDOFF: короткое резюме брифа в одну строку]", дальше с новой строки —
обычный ответ клиенту, который тот увидит. Если передавать не нужно —
маркер не выводить вообще, ответ как обычно.

Пример:
[HANDOFF: барбершоп, нужна запись+CRM, бюджет не называл, сроки — до конца месяца]
Спасибо, бриф понятен! Дальше подключится Денис и обсудит детали и стоимость.`;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function callTelegram(token, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`Telegram ${method} failed: ${res.status} ${body}`);
  }
  return res;
}

// Ответ бизнес-аккаунта клиенту требует business_connection_id — обычный
// sendMessage без него ушёл бы от лица самого бота, а не Дениса.
function sendBusinessMessage(env, businessConnectionId, chatId, text) {
  return callTelegram(env.BOT_TOKEN, 'sendMessage', {
    chat_id: chatId,
    business_connection_id: businessConnectionId,
    text,
  });
}

function sendAdminMessage(env, text) {
  if (!env.ADMIN_CHAT_ID) return Promise.resolve();
  return callTelegram(env.BOT_TOKEN, 'sendMessage', {
    chat_id: env.ADMIN_CHAT_ID,
    text,
  });
}

function chatKey(chatId) {
  return `chat:${chatId}`;
}

async function loadChatState(env, chatId) {
  const raw = await env.CHATS.get(chatKey(chatId));
  if (!raw) return { history: [], pausedUntil: 0, clientMessageCount: 0, notifiedNew: false };
  try {
    const parsed = JSON.parse(raw);
    return {
      history: parsed.history || [],
      pausedUntil: parsed.pausedUntil || 0,
      clientMessageCount: parsed.clientMessageCount || 0,
      notifiedNew: !!parsed.notifiedNew,
    };
  } catch {
    return { history: [], pausedUntil: 0, clientMessageCount: 0, notifiedNew: false };
  }
}

async function saveChatState(env, chatId, state) {
  const trimmedHistory = state.history.slice(-MAX_HISTORY_MESSAGES);
  await env.CHATS.put(
    chatKey(chatId),
    JSON.stringify({ ...state, history: trimmedHistory }),
    { expirationTtl: 60 * 60 * 24 * 30 } // 30 дней — старые чаты сами вычищаются
  );
}

async function askClaude(env, history) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: history,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  return (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

// Отделяет технический маркер [HANDOFF: ...] от текста, который увидит клиент.
function extractHandoff(replyText) {
  const match = replyText.match(/^\[HANDOFF:\s*(.+?)\]\s*\n?/);
  if (!match) return { clientText: replyText, handoffSummary: null };
  return {
    clientText: replyText.slice(match[0].length).trim(),
    handoffSummary: match[1].trim(),
  };
}

function senderName(from) {
  if (!from) return 'клиент';
  const parts = [from.first_name, from.last_name].filter(Boolean);
  const name = parts.join(' ') || 'клиент';
  return from.username ? `${name} (@${from.username})` : name;
}

async function handleBusinessMessage(env, message) {
  const chatId = message.chat.id;
  const businessConnectionId = message.business_connection_id;
  const isOwnerMessage = String(message.from?.id) === String(env.OWNER_TELEGRAM_ID);
  const state = await loadChatState(env, chatId);

  if (isOwnerMessage) {
    // Денис ответил сам — ставим чат на паузу, ассистент замолкает на время.
    state.pausedUntil = Date.now() + PAUSE_HOURS_AFTER_OWNER_REPLY * 60 * 60 * 1000;
    state.history.push({ role: 'assistant', content: message.text || '' });
    await saveChatState(env, chatId, state);
    return;
  }

  if (!message.text) return; // не текст (стикер/фото и т.п.) — пока не обрабатываем

  if (Date.now() < state.pausedUntil) {
    // Денис ведёт разговор сам — просто копим историю, не встреваем.
    state.history.push({ role: 'user', content: message.text });
    await saveChatState(env, chatId, state);
    return;
  }

  if (!state.notifiedNew) {
    state.notifiedNew = true;
    await sendAdminMessage(env, `🆕 Новый чат с ассистентом: ${senderName(message.from)}`);
  }

  state.history.push({ role: 'user', content: message.text });
  state.clientMessageCount += 1;

  const forceHandoff = state.clientMessageCount >= MAX_CLIENT_MESSAGES_BEFORE_FORCE_HANDOFF;

  let replyText;
  try {
    replyText = await askClaude(env, state.history);
  } catch (err) {
    console.error('Claude call failed:', err.message);
    await sendBusinessMessage(
      env,
      businessConnectionId,
      chatId,
      'Секунду, что-то забарахлило на моей стороне — Денис скоро подключится сам.'
    );
    await sendAdminMessage(env, `⚠️ Ассистент не смог ответить в чате с ${senderName(message.from)}: ${err.message}`);
    await saveChatState(env, chatId, state);
    return;
  }

  let { clientText, handoffSummary } = extractHandoff(replyText);

  if (!handoffSummary && forceHandoff) {
    handoffSummary = 'разговор затянулся, бриф не дособран — нужно подключиться вручную';
    clientText += clientText
      ? '\n\nДумаю, дальше лучше обсудить детали напрямую с Денисом — сейчас подключится.'
      : 'Дальше лучше обсудить детали напрямую с Денисом — сейчас подключится.';
  }

  state.history.push({ role: 'assistant', content: replyText });
  await saveChatState(env, chatId, state);

  await sendBusinessMessage(env, businessConnectionId, chatId, clientText);

  if (handoffSummary) {
    await sendAdminMessage(
      env,
      `📋 Ассистент передаёт разговор (${senderName(message.from)}):\n${handoffSummary}`
    );
  }
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
    }

    const secretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (env.SECRET_TOKEN && secretHeader !== env.SECRET_TOKEN) {
      return jsonResponse({ ok: false, error: 'forbidden' }, 403);
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return jsonResponse({ ok: false, error: 'bad_json' }, 400);
    }

    try {
      const message = update.business_message || update.edited_business_message;
      if (message) {
        await handleBusinessMessage(env, message);
      }
      // business_connection (подключение/отключение бота) — пока просто
      // не мешает; при необходимости логировать/уведомлять можно добавить тут.
    } catch (err) {
      console.error('Update handling failed:', err);
    }

    return jsonResponse({ ok: true });
  },
};
