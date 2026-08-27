// Central place for geo/brand facts so pages don't hardcode "Минск" /
// "Беларусь" directly. Adding RU/KZ later means adding entries here and to
// `hreflangAlternates`, not touching markup.
export const SITE_URL = 'https://tg-studio.by';

export const BRAND = {
  name: 'TG-Studio',
  legalDescription: 'Разработка Telegram-ботов и Mini Apps под задачи бизнеса',
};

// Current market. Swap/extend when RU or KZ get their own locale.
export const GEO = {
  locale: 'ru-BY',
  country: 'BY',
  city: 'Минск',
  countryName: 'Беларусь',
  areaServed: ['Минск', 'Беларусь'],
};

export const CONTACTS = {
  telegramChannel: 'https://t.me/TG_Studio_BY',
  telegramBot: 'https://t.me/tg_studio_BY_bot',
};

// hreflang scaffold: today only ru-BY is published, but every page's <head>
// already loops over this list, so adding "ru-RU" / "ru-KZ" entries later
// (once those locales have real content) needs no markup changes.
export const HREFLANG_ALTERNATES = [
  { hreflang: 'ru-BY', locale: 'ru-BY' },
  { hreflang: 'x-default', locale: 'ru-BY' },
];
