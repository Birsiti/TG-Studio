/* ============================================================
   leads-sheet-Code.gs — принимает заявки с сайта (через Cloudflare
   Worker, см. telegram-lead-worker.js) и дописывает их строкой в
   Google Таблицу. Отдельный маленький бэкенд только для одной задачи:
   "чтобы заявки были видны не только в чате Telegram, но и списком".

   НАСТРОЙКА
   1. Создать новую Google Таблицу.
   2. Переименовать вкладку "Лист1" в "Заявки" (важно — ровно так,
      с большой буквы) и вставить в первую строку заголовки:
      Дата | Имя | Телефон | Сфера | Задача | Telegram
   3. В этой таблице: Расширения -> Apps Script.
   4. Стереть содержимое редактора, вставить весь этот файл.
   5. Развернуть: Deploy -> New deployment -> тип "Web app".
      - Execute as: Me
      - Who has access: Anyone
      Deploy -> при первом разе Google попросит авторизовать доступ
      скрипта к этой таблице — разрешить (это ваш скрипт и ваша
      таблица, предупреждение "Google didn't verify this app" тут
      нормально, жать "Advanced" -> "Go to ... (unsafe)").
   6. Скопировать выданный URL (заканчивается на /exec).
   7. В Cloudflare Worker (telegram-lead-worker.js): Settings ->
      Variables -> добавить переменную SHEET_WEBHOOK_URL = этот URL,
      Deploy.

   Если нужно поменять код скрипта позже — Deploy -> Manage deployments
   -> Edit (карандаш) -> New version -> Deploy. URL при этом не меняется.
   ============================================================ */

const SHEET_NAME = 'Заявки';

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'sheet_not_found' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    sheet.appendRow([
      new Date(),
      String(data.name || ''),
      String(data.phone || ''),
      String(data.business || ''),
      String(data.task || ''),
      String(data.telegram || ''),
    ]);
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
