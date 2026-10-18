// изменено 2026-10-18 14:00
// Картинка для пустого чата бота («Что умеет этот бот?») через OpenAI Images (gpt-image-1).
//   OPENAI_API_KEY=… node scripts/gen-cover.js            → data/cover-1536.png и data/cover.png (640×360, macOS sips)
// Ключ — только из окружения, в репозиторий и логи не пишем. Ставит картинку Денис в @BotFather:
// /mybots → бот → Edit Bot → Edit Description Picture (Bot API этого не умеет).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PROMPT = [
  'Wide cover illustration for a Telegram bot of a cake warehouse and delivery service.',
  'A tidy cold-storage warehouse with shelves of boxed cakes, a smiling delivery van being loaded with cake boxes,',
  'a small phone showing a checklist. Flat modern vector style, soft shadows, rounded shapes.',
  'Palette: dark chocolate brown, cream, raspberry pink accents, a touch of mint for the cold.',
  'Clean uncluttered background, centered composition with margins on all sides.',
  'Absolutely no text, no letters, no numbers, no logos.',
].join(' ');

async function main() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Нет OPENAI_API_KEY в окружении');
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-1', prompt: PROMPT, size: '1536x1024', quality: 'high', n: 1 }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(data.error && data.error.message) || 'ошибка'}`);
  const dir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dir, { recursive: true });
  const big = path.join(dir, 'cover-1536.png');
  const out = path.join(dir, 'cover.png');
  fs.writeFileSync(big, Buffer.from(data.data[0].b64_json, 'base64'));
  // 3:2 → 16:9 (обрезка по высоте до 864) → 640×360, как просит Telegram
  fs.copyFileSync(big, out);
  try {
    execFileSync('sips', ['--cropToHeightWidth', '864', '1536', out], { stdio: 'ignore' });
    execFileSync('sips', ['-z', '360', '640', out], { stdio: 'ignore' });
  } catch {
    console.log('sips не найден — обрежьте data/cover-1536.png до 640×360 вручную');
  }
  console.log(`Готово: ${out}`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
