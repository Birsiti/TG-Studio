// изменено 2026-10-22 06:40
/* Главная (кнопка «Открыть» в боте): сначала выбор «Сделать заказ» (оптовая витрина) или «Я сотрудник Милано».
   Сотрудник, добавленный в «Люди», сразу попадает на свой экран; руководитель после «Я сотрудник» выбирает вход сам (22.10, Денис). */
(function(){
  "use strict";
  const {html, icon, $, haptic} = Kit;
  const api = Kit.createApi({bot:'cake', mock: window.CakeMock});
  $('#mark').innerHTML = icon('box');
  const ROLE_PAGE = {driver:'driver.html', storekeeper:'sklad.html', logist:'logist.html'};
  const DOORS = [
    ['admin.html', 'chart', 'Склад и сводка', 'Руководитель: сводка, водители, смены, справочники, кто заходит'],
    ['logist.html', 'route', 'Логист', 'Заявки из файла, рейсы водителям по адресам'],
    ['sklad.html', 'box', 'Кладовщик', 'Приход из файла, сборка заявок, отгрузка рейсом'],
    ['driver.html', 'truck', 'Водитель', 'Маршрут с адресами и картой, спидометр, возвраты']
  ];
  // кто открыл демо — имя из Telegram уходит Денису в Спички (через сервер витрины)
  try {
    const u = window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user;
    if (u && u.id) fetch('https://tort.tg-studio.xyz/api/visit', {method:'POST', mode:'no-cors', headers:{'Content-Type':'text/plain'},
      body: JSON.stringify({id:u.id, name:[u.first_name, u.last_name].filter(Boolean).join(' '), username:u.username || '', src:'бот'})}).catch(()=>{});
  } catch(e) {}
  const SHOP = 'https://tort.tg-studio.xyz/app?from=home';   // оптовая витрина: заказ уходит Денису в Телеграм
  const go = url=> location.replace(url + '?home=1');  // без лишней истории: «Назад» на экране возвращает сюда

  async function load(){
    const me = await api('getMe');
    if(me.ok && me.staff && ROLE_PAGE[me.staff.role]){ location.replace(ROLE_PAGE[me.staff.role]); return; }
    const name = Kit.user.firstName;
    const first = ()=>{ $('#view').innerHTML = String(html`
      <div class="page-head"><h1 class="page-title">${name ? name + ', добро пожаловать' : 'Добро пожаловать'}</h1>
        <p class="page-sub">Торты и пирожные «Милано» · демо</p></div>
      <div class="list">
        <button class="row home-door" type="button" data-shop="1"><span class="avatar">${icon('box')}</span><span class="row-main"><span class="row-title">Сделать заказ</span><span class="row-sub">Каталог с ценами: укажите количество и отправьте заказ</span></span>${icon('right', 'row-chev')}</button>
        <button class="row home-door" type="button" data-staff="1"><span class="avatar">${icon('chart')}</span><span class="row-main"><span class="row-title">Я сотрудник Милано</span><span class="row-sub">Склад, рейсы, сборка заказов</span></span>${icon('right', 'row-chev')}</button>
      </div>`); };
    const staff = ()=>{
      if(!me.ok){
        $('#view').innerHTML = String(html`<div class="empty">${icon('lock')}<div class="empty-title">Нет доступа к складу</div>Ваш Telegram id: ${Kit.user.id}<br>Передайте его руководителю — он добавит вас в «Люди».</div>
          <button class="row home-door section" type="button" data-first="1"><span class="row-main"><span class="row-title">← Назад</span></span></button>`);
        return;
      }
      $('#view').innerHTML = String(html`
        <div class="page-head"><h1 class="page-title">Сотрудникам</h1>
          <p class="page-sub">Выберите, кем войти</p></div>
        <div class="list">${DOORS.map(([url, ic, title, sub])=>html`<button class="row home-door" type="button" data-go="${url}">
          <span class="avatar">${icon(ic)}</span><span class="row-main"><span class="row-title">${title}</span><span class="row-sub">${sub}</span></span>${icon('right', 'row-chev')}</button>`)}</div>
        ${api.mode() === 'demo' ? html`<p class="mode-note section">Демо-версия: данные примерные и хранятся только в этом телефоне — смело пробуйте всё, сломать ничего нельзя.</p>` : ''}
        <button class="row home-door section" type="button" data-first="1"><span class="row-main"><span class="row-title">← Назад</span></span></button>`);
    };
    Kit.on($('#view'), 'click', '[data-shop]', ()=>{ haptic('light'); location.href = SHOP; });
    Kit.on($('#view'), 'click', '[data-staff]', ()=>{ haptic('light'); staff(); });
    Kit.on($('#view'), 'click', '[data-first]', ()=>{ haptic('light'); first(); });
    first();
  }
  Kit.on($('#view'), 'click', '[data-go]', (e, el)=>{ haptic('light'); go(el.dataset.go); });
  load();
})();
