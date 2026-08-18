// Cloudflare Worker: receives the lead form POST from index.html and
// forwards it to Telegram via the Bot API. The bot token stays server-side
// as a Worker secret — it must never be pasted into the site's HTML/JS.
//
// SETUP
// 1. Create a bot: message @BotFather in Telegram -> /newbot -> follow the
//    prompts -> copy the token it gives you (looks like 123456:ABC-DEF...).
// 2. Get your chat_id: message your new bot once (anything, e.g. "hi"),
//    then open https://api.telegram.org/bot<TOKEN>/getUpdates in a browser
//    and read "chat":{"id": ...} from the response. (For this project it's
//    already known: 6904239988.)
// 3. Deploy this file as a Cloudflare Worker:
//    - dash.cloudflare.com -> Workers & Pages -> Create -> Create Worker
//    - paste this file's contents into the editor, Deploy
//    - Settings -> Variables -> add secret BOT_TOKEN = <token from step 1>
//    - Settings -> Variables -> add variable CHAT_ID = 6904239988
// 4. Copy the Worker's URL (https://<name>.<subdomain>.workers.dev) and
//    paste it into LEAD_ENDPOINT near the top of the <script> in index.html.

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), { status: 405, headers: cors });
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'bad_json' }), { status: 400, headers: cors });
    }

    const name = String(data.name || '').trim().slice(0, 200);
    const phone = String(data.phone || '').trim().slice(0, 50);
    const telegram = String(data.telegram || '').trim().slice(0, 100);
    const phoneDigits = phone.replace(/\D/g, '');

    if (!name || phoneDigits.length < 11) {
      return new Response(JSON.stringify({ ok: false, error: 'invalid_input' }), { status: 400, headers: cors });
    }

    const lines = [
      '🆕 Новая заявка с сайта TG-Studio',
      '',
      `Имя: ${name}`,
      `Телефон: ${phone}`,
    ];
    if (telegram) lines.push(`Telegram: ${telegram}`);

    const tgRes = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.CHAT_ID,
        text: lines.join('\n'),
      }),
    });

    if (!tgRes.ok) {
      return new Response(JSON.stringify({ ok: false, error: 'telegram_failed' }), { status: 502, headers: cors });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  },
};
