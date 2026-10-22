// изменено 2026-10-22 17:10
/* Главная (кнопка «Открыть» в боте @Milano_BY_Bot): витрина «Милано» — герой с тортом, лента тортов,
   «Сделать заказ» (оптовая витрина) и «Я сотрудник Милано» (входы по ролям).
   Сотрудник, добавленный в «Люди», сразу попадает на свой экран; руководитель после «Я сотрудник» выбирает вход сам.
   22.10 — редизайн под заказчика (Денис): стиль milano.by, Playfair Display + Open Sans, стили — brand.css «Главная». */
(function(){
  "use strict";
  const {html, icon, $, haptic} = Kit;
  const api = Kit.createApi({bot:'cake', mock: window.CakeMock});
  const ROLE_PAGE = {driver:'driver.html', storekeeper:'sklad.html', logist:'logist.html'};
  const DOORS = [
    ['admin.html', 'chart', 'Сводка', 'Руководителю: остатки, рейсы, водители, люди'],
    ['logist.html', 'route', 'Логист', 'Заявки из файла, рейсы по адресам'],
    ['sklad.html', 'box', 'Кладовщик', 'Приход, сборка заказов, отгрузка'],
    ['driver.html', 'truck', 'Водитель', 'Маршрут с картой, возвраты, ящики']
  ];
  // лента на главной: торты с сайта milano.by (img/cakes/)
  const STRIP = [
    ['klubnika-banan', 'Клубника-банан'], ['esterhazi', 'Эстерхази'], ['czarskoe-udovolstvie-1', 'Царское удовольствие'],
    ['sankt-piterbrug2', 'Санкт-Петербург'], ['bluberri', 'Блюберри'], ['vishnya-v-shokolade', 'Вишня в шоколаде'],
    ['yubilejnyj', 'Юбилейный'], ['lesnaya-yagodka', 'Лесная ягодка'], ['kreshhatik', 'Крещатик'],
    ['shokobanan', 'Шокобанан'], ['rulet-nezhnaya-lavanda', 'Рулет «Лаванда»'], ['malinovoe-assorti-a', 'Малиновое ассорти']
  ];
  const TG_LOGO = '<svg viewBox="0 0 240 240" aria-hidden="true"><path fill="#fff" d="M100 157l-4 56c6 0 8-3 12-6l27-26 57 42c10 6 18 3 21-9l38-178c4-15-5-21-16-17L14 103c-15 6-15 14-3 18l46 14 106-67c5-3 10-1 6 2z"/></svg>';

  // кто открыл демо — имя из Telegram уходит Денису в Спички (через сервер витрины)
  try {
    const u = window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user;
    if (u && u.id) fetch('https://tort.tg-studio.xyz/api/visit', {method:'POST', mode:'no-cors', headers:{'Content-Type':'text/plain'},
      body: JSON.stringify({id:u.id, name:[u.first_name, u.last_name].filter(Boolean).join(' '), username:u.username || '', src:'бот'})}).catch(()=>{});
  } catch(e) {}
  const SHOP = 'https://tort.tg-studio.xyz/app?from=home';   // оптовая витрина: заказ уходит Денису в Телеграм
  const go = url=> location.replace(url + '?home=1');  // без лишней истории: «Назад» на экране возвращает сюда
  const madeBy = ()=> html`<div class="made-by"><button type="button" data-studio="1">${Kit.raw ? Kit.raw(TG_LOGO) : ''}Сделано в TG-Studio <span class="made-by-year">· ${new Date().getFullYear()}</span></button></div>`;

  async function load(){
    const me = await api('getMe');
    if(me.ok && me.staff && ROLE_PAGE[me.staff.role]){ location.replace(ROLE_PAGE[me.staff.role]); return; }
    const name = Kit.user.firstName;
    const strip = STRIP.concat(STRIP).map(([f, t])=>html`<figure><img src="img/cakes/${f}.jpg" alt="" loading="lazy"><figcaption>${t}</figcaption></figure>`);

    const first = ()=>{ $('#view').innerHTML = String(html`<div class="home">
      <section class="hero">
        <div class="hero-top"><p class="hero-eyebrow">Кондитерская<br>«Милано»<span>с 2003 года</span></p>
          <div class="hero-plate"><img src="img/cakes/klubnika-banan.jpg" alt="Торт «Клубника-банан»"></div></div>
        <h1 class="hero-title">Сладкий праздник <em>для&nbsp;ваших витрин</em></h1>
        <p class="hero-sub">${name ? name + ', з' : 'З'}аказывайте торты и пирожные «Милано» оптом прямо в Telegram — цены как на сайте, заказ за минуту.</p>
      </section>
      <div class="cake-strip" aria-hidden="true"><div class="cake-track">${strip}</div></div>
      <div class="doors">
        <button class="door is-main" type="button" data-shop="1">
          <span class="door-text"><span class="door-title">Сделать заказ</span><span class="door-sub">Каталог с фото и ценами — отметьте количество и отправьте</span><span class="door-badge">Цены как на сайте</span></span>
          <span class="door-cake"><img src="img/cakes/czarskoe-udovolstvie-1.jpg" alt=""></span>
        </button>
        <button class="door" type="button" data-staff="1">
          <span class="door-ic">${icon('users')}</span>
          <span class="door-text"><span class="door-title">Я сотрудник Милано</span><span class="door-sub">Склад, сборка заказов, рейсы, водители</span></span>
          <span class="door-go">${icon('right')}</span>
        </button>
      </div>
      <div class="facts">
        <div class="fact"><b>100+</b><span>позиций в каталоге</span></div>
        <div class="fact"><b>1 мин</b><span>на заказ с телефона</span></div>
        <div class="fact"><b>24/7</b><span>приём заказов</span></div>
      </div>
      <p class="home-note">Демо-версия: заказы и данные примерные</p>
      ${madeBy()}
    </div>`); window.scrollTo(0, 0); };

    const staff = ()=>{
      if(!me.ok){
        $('#view').innerHTML = String(html`<div class="empty">${icon('lock')}<div class="empty-title">Нет доступа к складу</div>Ваш Telegram id: ${Kit.user.id}<br>Передайте его руководителю — он добавит вас в «Люди».</div>
          <button class="back-row" type="button" data-first="1">${icon('left')}На главную</button>`);
        return;
      }
      $('#view').innerHTML = String(html`
        <div class="page-head"><h1 class="page-title">Сотрудникам</h1>
          <p class="page-sub">Выберите, кем войти</p></div>
        <div class="staff-grid">${DOORS.map(([url, ic, title, sub])=>html`<button class="staff-tile" type="button" data-go="${url}">
          <span class="door-ic">${icon(ic)}</span><b>${title}</b><span>${sub}</span></button>`)}</div>
        ${api.mode() === 'demo' ? html`<p class="mode-note section">Демо-версия: данные примерные и хранятся только в этом телефоне — смело пробуйте всё, сломать ничего нельзя.</p>` : ''}
        <button class="back-row" type="button" data-first="1">${icon('left')}На главную</button>`);
      window.scrollTo(0, 0);
    };
    Kit.on($('#view'), 'click', '[data-shop]', ()=>{ haptic('light'); location.href = SHOP; });
    Kit.on($('#view'), 'click', '[data-staff]', ()=>{ haptic('light'); staff(); });
    Kit.on($('#view'), 'click', '[data-first]', ()=>{ haptic('light'); first(); });
    Kit.on($('#view'), 'click', '[data-studio]', ()=>{
      const url = 'https://t.me/tg_studio_BY_bot?start=milano';
      const tg = window.Telegram && Telegram.WebApp;
      if(tg && tg.initData && tg.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
    });
    first();
  }
  Kit.on($('#view'), 'click', '[data-go]', (e, el)=>{ haptic('light'); go(el.dataset.go); });
  load();
})();
