// изменено 2026-10-25 12:30
/* Главная (кнопка «Открыть» в боте @Milano_BY_Bot): витрина «Милано» — герой с тортом, лента тортов,
   «Сделать заказ» (оптовая витрина) и «Я сотрудник Милано» (входы по ролям).
   Сотрудник, добавленный в «Люди», сразу попадает на свой экран; руководитель после «Я сотрудник» выбирает вход сам.
   25.10 — регистрация: нет допуска → фамилия, имя, телефон из Telegram → заявка руководителю; карточки по роли.
   22.10 — редизайн под заказчика (Денис): стиль milano.by, Playfair Display + Open Sans, стили — brand.css «Главная». */
(function(){
  "use strict";
  const {html, icon, $, haptic} = Kit;
  const api = Kit.createApi({bot:'cake', mock: window.CakeMock});
  const ROLE_PAGE = {driver:'driver.html', storekeeper:'sklad.html', logist:'logist.html'};
  const ROLE_DOORS = {admin:['admin.html', 'logist.html', 'sklad.html', 'driver.html'], logist:['logist.html'], storekeeper:['sklad.html'], driver:['driver.html']};  // допуск по роли
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
    const strip = STRIP.concat(STRIP).map(([f, t])=>html`<figure><img src="img/cakes/${f}.jpg" alt="" decoding="async"><figcaption>${t}</figcaption></figure>`);

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

    // «Я сотрудник Милано»: допуск есть → карточки по роли; нет → заявка (фамилия, имя, телефон из Telegram) → ждём руководителя
    const back = html`<button class="back-row" type="button" data-first="1">${icon('left')}На главную</button>`;
    const doors = ()=>{
      const allowed = ROLE_DOORS[me.role] || ROLE_DOORS.admin;
      $('#view').innerHTML = String(html`
        <div class="page-head"><h1 class="page-title">Сотрудникам</h1>
          <p class="page-sub">Выберите, кем войти</p></div>
        <div class="staff-grid">${DOORS.filter(d=>allowed.includes(d[0])).map(([url, ic, title, sub])=>html`<button class="staff-tile" type="button" data-go="${url}">
          <span class="door-ic">${icon(ic)}</span><b>${title}</b><span>${sub}</span></button>`)}</div>
        ${api.mode() === 'demo' ? html`<p class="mode-note section">Демо-версия: данные примерные и хранятся только в этом телефоне — смело пробуйте всё, сломать ничего нельзя.</p>` : ''}
        ${back}`);
      window.scrollTo(0, 0);
    };
    const waiting = (rejected)=>{
      $('#view').innerHTML = String(rejected ? html`<div class="empty">${icon('lock')}<div class="empty-title">Допуск не выдан</div>Если это ошибка — свяжитесь с руководителем.</div>${back}`
        : html`<div class="empty">${icon('clock')}<div class="empty-title">Заявка отправлена</div>Руководитель выдаст допуск и выберет вашу роль. Откройте приложение позже — вы сразу попадёте на свой экран.</div>
          <button class="btn btn-ghost btn-block section" type="button" data-recheck="1">${icon('refresh')}Проверить допуск</button>${back}`);
      window.scrollTo(0, 0);
    };
    const tgApp = window.Telegram && Telegram.WebApp;
    const canContact = !!(tgApp && tgApp.initData && tgApp.requestContact && tgApp.isVersionAtLeast && tgApp.isVersionAtLeast('6.9'));
    const regForm = (manualPhone)=>{
      const prev = me.signup || {};
      $('#view').innerHTML = String(html`
        <div class="page-head"><h1 class="page-title">Регистрация</h1>
          <p class="page-sub">Сотрудник Милано: оставьте данные, руководитель выдаст допуск</p></div>
        <label class="field"><span class="field-label">Фамилия</span><input class="input" id="rgLast" maxlength="40" autocomplete="family-name" value="${prev.lastName || Kit.user.lastName || ''}"></label>
        <label class="field section"><span class="field-label">Имя</span><input class="input" id="rgFirst" maxlength="40" autocomplete="given-name" value="${prev.firstName || Kit.user.firstName || ''}"></label>
        ${manualPhone ? html`<div class="field section"><span class="field-label">Телефон</span><div id="rgPhone"></div></div>` : ''}
        <button class="btn btn-primary btn-block section" type="button" id="rgSend">${icon('phone')}${manualPhone ? 'Отправить заявку' : 'Поделиться телефоном'}</button>
        ${manualPhone ? '' : html`<p class="hint section">Номер берётся из вашего Telegram — вводить его не нужно.</p>`}
        ${back}`);
      if(manualPhone){ $('#rgPhone').innerHTML = String(Kit.phone.field('rgPh', '')); Kit.phone.bind($('#rgPh')); }
      window.scrollTo(0, 0);
    };
    const sendSignup = async (extra)=>{
      const btn = $('#rgSend');
      Kit.busy(btn, true);
      const r = await api('signup', Object.assign({lastName:$('#rgLast').value.trim(), firstName:$('#rgFirst').value.trim(), username:Kit.user.username || ''}, extra));
      Kit.busy(btn, false);
      if(!r.ok){ Kit.toast(r.message || (r.error === 'forbidden' ? 'Допуск не выдан' : 'Не получилось отправить'), 'error'); haptic('error'); if(r.error === 'forbidden') waiting(true); return; }
      haptic('success'); me.signup = {status:'pending'}; waiting(false);
    };
    Kit.on($('#view'), 'click', '#rgSend', ()=>{
      const last = $('#rgLast').value.trim(), first = $('#rgFirst').value.trim();
      if(last.length < 2 || first.length < 2){ Kit.toast('Впишите фамилию и имя', 'error'); haptic('error'); return; }
      if($('#rgPh')){ const ph = Kit.phone.value($('#rgPh')); if(!ph){ Kit.toast('Впишите телефон', 'error'); haptic('error'); return; } sendSignup({phone:ph}); return; }
      let done = false;
      const got = (shared, ev)=>{      // Telegram отвечает через колбэк и событием — берём первый ответ
        if(done) return; done = true; tgApp.offEvent('contactRequested', onEv);
        if(!shared){ Kit.toast('Без номера заявку отправить нельзя', 'error'); haptic('error'); return; }
        const contact = ev && (ev.response || (ev.status === 'sent' && ev.response));
        if(contact) sendSignup({contact});
        else { Kit.toast('Telegram не передал номер — впишите его вручную'); regForm(true); }
      };
      const onEv = ev=> got(ev && ev.status === 'sent', ev);
      tgApp.onEvent('contactRequested', onEv);
      tgApp.requestContact((shared, ev)=> got(shared, ev));
    });
    Kit.on($('#view'), 'click', '[data-recheck]', async ()=>{
      const m = await api('getMe'); haptic('light');
      if(m.ok && m.access){ if(m.staff && ROLE_PAGE[m.staff.role]) location.replace(ROLE_PAGE[m.staff.role]); else { Object.assign(me, m); doors(); } }
      else if(m.ok && m.signup && m.signup.status === 'rejected') waiting(true);
      else Kit.toast('Пока без решения');
    });
    const staff = ()=>{
      if(!me.ok){
        $('#view').innerHTML = String(html`<div class="empty">${icon('lock')}<div class="empty-title">Нет связи со складом</div>Откройте приложение из бота ещё раз.</div>${back}`);
        return;
      }
      if(me.access) return doors();
      const st = me.signup && me.signup.status;
      if(st === 'pending') return waiting(false);
      if(st === 'rejected') return waiting(true);
      regForm(!canContact);
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
