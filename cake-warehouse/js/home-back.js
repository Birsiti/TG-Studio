// изменено 2026-10-25 17:30
/* Открыли с главной (?home=1) — кнопка Telegram «Назад» ведёт в меню «Сотрудникам» (?staff=1), откуда пришли. */
(function(){
  if(/[?&]home=1\b/.test(location.search)) Kit.back.push(function(){ location.replace('index.html?staff=1'); });
})();
