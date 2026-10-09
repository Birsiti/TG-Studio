// изменено 2026-10-10 01:43
// Запускается после `astro build`: собирает dist/llms-full.txt — полный текст
// страниц услуг и кейсов в Markdown для нейросетей (формат llmstxt.org).
// Текст берётся из уже собранного HTML (<main>), поэтому всегда совпадает с сайтом.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const SITE_URL = 'https://tg-studio.by';

const pages = ['/mini-apps', '/boty', '/crm-integracii', '/ai-gpt'];
const casesDir = path.join(dist, 'keysy');
const cases = existsSync(casesDir) ? readdirSync(casesDir).map(s => '/keysy/' + s) : [];

const decode = s => s
  .replace(/&nbsp;/g, ' ').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));

function htmlToMd(html) {
  return decode(html
    .replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '').replace(/<picture[\s\S]*?<\/picture>/gi, '').replace(/<img[^>]*>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<a [^>]*class="btn[^"]*"[^>]*>[\s\S]*?<\/a>/gi, '')
    .replace(/<div class="eyebrow"[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<span class="live-status"[^>]*>(?:<span[^>]*><\/span>)?[^<]*<\/span>/gi, '')
    .replace(/<(p|ul|ol)[ >]/gi, m => '\n' + m)
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1')
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
      const t = text.replace(/<[^>]+>/g, '').trim();
      if (!t) return '';
      const url = href.startsWith('/') ? SITE_URL + href : href;
      return '[' + t + '](' + url + ')';
    })
    .replace(/\)\[/g, ') · [')
    .replace(/<\/(p|div|section|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, ''))
    .split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function pageMd(route) {
  const file = path.join(dist, route, 'index.html');
  const html = readFileSync(file, 'utf-8');
  const main = (html.match(/<main[^>]*>([\s\S]*?)<\/main>/i) || [, ''])[1];
  return 'URL: ' + SITE_URL + route + '\n\n' + htmlToMd(main);
}

// Блок «Работают сейчас» с главной
function liveMd() {
  const html = readFileSync(path.join(dist, 'index.html'), 'utf-8');
  const sec = (html.match(/<section class="live"[^>]*>([\s\S]*?)<\/section>/i) || [, ''])[1];
  return sec ? 'URL: ' + SITE_URL + '/#live\n\n' + htmlToMd(sec).replace(/^## /m, '# ') : '';
}

// Вопросы с главной (там же разметка FAQPage)
function faqMd() {
  const html = readFileSync(path.join(dist, 'index.html'), 'utf-8');
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(m => { try { return JSON.parse(m[1]); } catch { return null; } })
    .find(j => j && j['@type'] === 'FAQPage');
  if (!ld) return '';
  return '## Частые вопросы\n\n' + ld.mainEntity.map(q => '### ' + q.name + '\n\n' + q.acceptedAnswer.text).join('\n\n');
}

const stamp = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Minsk', dateStyle: 'short', timeStyle: 'short' }).format(new Date());
const head = `<!-- изменено ${stamp} (файл собирается при сборке сайта) -->
# TG-Studio — полный текст

> Студия из Минска: Telegram-боты и Mini Apps для бизнеса — запись клиентов, заказы, оплата, CRM-интеграции и ИИ-ассистенты. Краткая версия: ${SITE_URL}/llms.txt

Ниже — полный текст страниц услуг и кейсов сайта ${SITE_URL}, а также ответы на частые вопросы.
`;

const body = [...pages.map(pageMd), ...cases.map(pageMd), liveMd()].filter(Boolean).join('\n\n---\n\n');
const out = head + '\n---\n\n' + body + '\n\n---\n\n' + faqMd() + `

---

## Контакты

- Telegram-канал студии: https://t.me/TG_Studio_BY
- Бот студии с демо и заявкой: https://t.me/tg_studio_BY_bot
- Заявка на сайте: ${SITE_URL}/#contact
`;
writeFileSync(path.join(dist, 'llms-full.txt'), out);
console.log('llms-full.txt written: ' + (pages.length + cases.length) + ' pages, ' + out.length + ' chars');
