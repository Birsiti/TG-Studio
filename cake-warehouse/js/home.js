// изменено 2026-10-18 15:15
/* Главная (кнопка «Открыть» в боте): три входа — руководитель, кладовщик, водитель.
   В рабочем режиме сотрудник сразу попадает на свой экран, руководитель выбирает сам. */
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
  const go = url=> location.replace(url + '?home=1');  // без лишней истории: «Назад» на экране возвращает сюда

  async function load(){
    const me = await api('getMe');
    if(me.ok && me.staff && ROLE_PAGE[me.staff.role]){ location.replace(ROLE_PAGE[me.staff.role]); return; }
    if(!me.ok && me.error === 'forbidden'){
      $('#view').innerHTML = String(html`<div class="empty">${icon('lock')}<div class="empty-title">Нет доступа к складу</div>Ваш Telegram id: ${Kit.user.id}<br>Передайте его руководителю — он добавит вас в «Люди».</div>`);
      return;
    }
    const name = Kit.user.firstName;
    $('#view').innerHTML = String(html`
      <div class="page-head"><h1 class="page-title">${name ? name + ', добро пожаловать' : 'Добро пожаловать'}</h1>
        <p class="page-sub">Склад тортов прямо в Telegram — выберите, кем войти</p></div>
      <div class="list">${DOORS.map(([url, ic, title, sub])=>html`<button class="row home-door" type="button" data-go="${url}">
        <span class="avatar">${icon(ic)}</span><span class="row-main"><span class="row-title">${title}</span><span class="row-sub">${sub}</span></span>${icon('right', 'row-chev')}</button>`)}</div>
      ${api.mode() === 'demo' ? html`<p class="mode-note section">Демо-версия: данные примерные и хранятся только в этом телефоне — смело пробуйте всё, сломать ничего нельзя.</p>` : ''}
      <p class="hint section" style="text-align:center">Вернуться сюда — «Назад» вверху</p>`);
  }
  Kit.on($('#view'), 'click', '[data-go]', (e, el)=>{ haptic('light'); go(el.dataset.go); });
  load();
})();
