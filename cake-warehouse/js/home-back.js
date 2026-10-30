// изменено 2026-10-30 15:00
/* Открыли с главной (?home=1) — кнопка Telegram «Назад» ведёт в меню «Сотрудникам» (?staff=1), откуда пришли.
   Плюс на любой рабочей странице в шапке кнопка «На главную» (?main=1 — без автоперехода на экран роли). */
(function(){
  if(/[?&]home=1\b/.test(location.search)) Kit.back.push(function(){ location.replace('index.html?staff=1'); });
  function addHome(){
    var bar = document.querySelector('.topbar-actions');
    if(!bar || bar.querySelector('[data-main]')) return;
    var b = document.createElement('button');
    b.className = 'icon-btn'; b.type = 'button'; b.setAttribute('data-main', '1'); b.setAttribute('aria-label', 'На главную');
    b.innerHTML = String(Kit.icon('home'));
    b.addEventListener('click', function(){
      try{ var tg = window.Telegram && Telegram.WebApp; if(tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light'); }catch(e){}
      location.replace('index.html?main=1');
    });
    bar.insertBefore(b, bar.firstChild);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addHome); else addHome();
})();
