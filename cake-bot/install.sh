#!/bin/bash
# изменено 2026-10-16 22:40
# Установка бота склада на iMac одной командой (как taxi-morning-digest:
# бот живёт на iMac, .env + автозапуск launchd, без LEADTEX).
#   cd ~/tg-studio/cake-bot && bash install.sh
# Повторный запуск безопасен: обновит .env, перезапустит бота и API.
set -euo pipefail
cd "$(dirname "$0")"
DIR="$(pwd)"
LA="$HOME/Library/LaunchAgents"
BOT_PLIST="$LA/com.tgstudio.cake-bot.plist"
API_PLIST="$LA/xyz.tg-studio.api.plist"
PB=/usr/libexec/PlistBuddy

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
die() { printf '\n\033[31m✘ %s\033[0m\n' "$1"; exit 1; }
envget() { [ -f .env ] && grep -E "^$1=" .env | head -1 | cut -d= -f2- || true; }
json() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d||'{}');$1})"; }

command -v node >/dev/null || die "Нет Node.js. Установите: brew install node"
NODE="$(command -v node)"

say "1/5 Токен бота"
TOKEN="$(envget BOT_TOKEN)"
if [ -n "$TOKEN" ]; then
  read -rp "Токен уже есть в .env. Заменить? [y/N] " a
  [[ "$a" =~ ^[yYдД] ]] && TOKEN=""
fi
if [ -z "$TOKEN" ]; then read -rsp "Вставьте токен от @BotFather (не отображается): " TOKEN; echo; fi
TG="${TELEGRAM_API:-https://api.telegram.org}/bot$TOKEN"
BOT_NAME="$(curl -s "$TG/getMe" | json 'console.log(j.ok?j.result.username:"")')"
[ -n "$BOT_NAME" ] || die "Telegram не принял токен. Проверьте его в @BotFather."
echo "✔ Бот @$BOT_NAME"
# Бот получает сообщения сам (long polling) — webhook от прежних сервисов снимаем
curl -s "$TG/deleteWebhook" >/dev/null

say "2/5 Руководитель"
ADMINS="$(envget ADMIN_IDS)"
if [ -n "$ADMINS" ]; then
  echo "Сейчас: $ADMINS"
  read -rp "Оставить? [Y/n] " a
  [[ "$a" =~ ^[nNнН] ]] && ADMINS=""
fi
if [ -z "$ADMINS" ]; then
  echo "Напишите боту @$BOT_NAME /start с телефона руководителя. Жду…"
  for _ in $(seq 1 60); do
    WHO="$(curl -s "$TG/getUpdates?timeout=5" | json 'const u=(j.result||[]).filter(x=>x.message&&x.message.from).pop();if(u)console.log(u.message.from.id+" "+(u.message.from.first_name||""))' || true)"
    [ -n "$WHO" ] && break
  done
  [ -n "${WHO:-}" ] || die "Сообщение не пришло. Запустите скрипт ещё раз."
  read -rp "Руководитель: ${WHO#* } (id ${WHO%% *}). Верно? [Y/n] " a
  [[ "$a" =~ ^[nNнН] ]] && read -rp "Введите id через запятую: " ADMINS || ADMINS="${WHO%% *}"
fi

say "3/5 Настройки .env"
KEY="$(envget SERVICE_KEY)"
[ -n "$KEY" ] || KEY="$(openssl rand -hex 24)"
[ -f .env ] || cp .env.example .env
setenv() { if grep -qE "^$1=" .env; then sed -i '' "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi; }
setenv BOT_TOKEN "$TOKEN"
setenv ADMIN_IDS "$ADMINS"
setenv SERVICE_KEY "$KEY"
chmod 600 .env
echo "✔ .env записан (в git не попадает)"
npm install --silent

say "4/5 API склада"
if [ -f "$API_PLIST" ]; then
  $PB -c "Add :EnvironmentVariables dict" "$API_PLIST" 2>/dev/null || true
  for kv in "TGS_CAKE_BOT_TOKEN=$TOKEN" "TGS_CAKE_ADMINS=$ADMINS" "TGS_CAKE_SERVICE_KEY=$KEY"; do
    $PB -c "Delete :EnvironmentVariables:${kv%%=*}" "$API_PLIST" 2>/dev/null || true
    $PB -c "Add :EnvironmentVariables:${kv%%=*} string ${kv#*=}" "$API_PLIST"
  done
  launchctl unload "$API_PLIST" 2>/dev/null || true
  launchctl load "$API_PLIST"
  echo "✔ API перезапущен с настройками склада"
else
  echo "⚠ API студии на этом iMac не установлен ($API_PLIST нет)."
  echo "  Бот ответит руководителю кнопками, но склад будет в демо-режиме."
  echo "  Установка API — api/README.md, потом запустите этот скрипт снова."
fi

say "5/5 Автозапуск бота"
mkdir -p "$LA"
sed -e "s|/usr/local/bin/node|$NODE|" -e "s|ЗАМЕНИ_НА_ПУТЬ/cake-bot|$DIR|g" \
  deploy/com.tgstudio.cake-bot.plist.example > "$BOT_PLIST"
launchctl unload "$BOT_PLIST" 2>/dev/null || true
launchctl load "$BOT_PLIST"
sleep 4
node scripts/check.js || true
echo
echo "Готово. Напишите боту @$BOT_NAME /start. Логи: $DIR/err.log"
