// изменено 2026-10-18 11:00
/* Открыли с главной (?home=1) — кнопка Telegram «Назад» ведёт обратно на главную. */
(function(){
  if(/[?&]home=1\b/.test(location.search)) Kit.back.push(function(){ location.replace('index.html'); });
})();
