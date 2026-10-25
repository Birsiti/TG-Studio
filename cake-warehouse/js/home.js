// изменено 2026-10-25 18:10
/* Главная (кнопка «Открыть» в боте @Milano_BY_Bot): витрина «Милано» — герой с тортом, лента тортов,
   «Сделать заказ» (оптовая витрина) и «Я сотрудник Милано» (входы по ролям).
   Сотрудник, добавленный в «Люди», сразу попадает на свой экран; руководитель после «Я сотрудник» выбирает вход сам.
   25.10 — «Сотрудники» руководителя (js/team.js), яркая регистрация и окно «Всё в порядке».
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

    // «Я сотрудник Милано»: допуск есть → карточки по роли; нет → регистрация (фамилия, имя, телефон из Telegram) → должность даёт руководитель
    const back = html`<button class="back-row" type="button" data-first="1">${icon('left')}На главную</button>`;
    const tgApp = window.Telegram && Telegram.WebApp;
    const canContact = !!(tgApp && tgApp.initData && tgApp.requestContact && tgApp.isVersionAtLeast && tgApp.isVersionAtLeast('6.9'));
    let preview = false;   // руководитель смотрит регистрацию глазами новичка: заявка не уходит
    let sent = null;       // что ушло в заявке — для окна «Всё в порядке»
    const show = h=>{ $('#view').innerHTML = String(h); window.scrollTo(0, 0); };
    const phoneOf = contact=>{ try{ return '+' + String(JSON.parse(new URLSearchParams(contact).get('contact')).phone_number).replace(/^\+/, ''); }catch(e){ return ''; } };

    const doors = ()=>{
      const allowed = ROLE_DOORS[me.role] || ROLE_DOORS.admin;
      show(html`
        <div class="page-head"><h1 class="page-title">Сотрудникам</h1>
          <p class="page-sub">${me.staff ? me.staff.name + ', выберите, кем войти' : 'Выберите, кем войти'}</p></div>
        <div class="staff-grid">${DOORS.filter(d=>allowed.includes(d[0])).map(([url, ic, title, sub])=>html`<button class="staff-tile" type="button" data-go="${url}">
          <span class="door-ic">${icon(ic)}</span><b>${title}</b><span>${sub}</span></button>`)}</div>
        ${me.role === 'admin' ? html`<button class="door team-open" type="button" data-team="1">
          <span class="door-ic">${icon('users')}</span>
          <span class="door-text"><span class="door-title">Сотрудники</span><span class="door-sub">Должности, телефоны, машины · новые заявки</span></span>
          <span class="door-go">${icon('right')}</span></button>
          <button class="link-btn staff-link" type="button" data-preview="1">Посмотреть регистрацию глазами новичка</button>` : ''}
        ${api.mode() === 'demo' ? html`<p class="mode-note section">Демо-версия: данные примерные и хранятся только в этом телефоне — смело пробуйте всё, сломать ничего нельзя.</p>` : ''}
        ${back}`);
    };

    const steps = n=> html`<div class="reg-steps">${['ФИО', 'Телефон', 'Должность'].map((t, i)=>html`<span class="reg-step ${i < n ? 'is-done' : i === n ? 'is-on' : ''}"><i>${i < n ? '✓' : i + 1}</i>${t}</span>`)}</div>`;

    const regForm = (manualPhone)=>{
      const prev = me.signup || {};
      show(html`
        ${preview ? html`<div class="reg-preview"><span>Предпросмотр: заявка не уйдёт</span><button type="button" data-skip="1">В меню</button></div>` : ''}
        <section class="reg-hero">
          <div class="reg-badge">${icon('user')}</div>
          <h1>Регистрация сотрудника</h1>
          <p>Пара секунд: имя, телефон — и руководитель назначит вам должность.</p>
          ${steps(0)}
        </section>
        <div class="reg-card">
          <label class="field"><span class="field-label">Фамилия</span><input class="input" id="rgLast" maxlength="40" autocomplete="family-name" enterkeyhint="next" value="${prev.lastName || Kit.user.lastName || ''}"></label>
          <label class="field"><span class="field-label">Имя</span><input class="input" id="rgFirst" maxlength="40" autocomplete="given-name" enterkeyhint="done" value="${prev.firstName || Kit.user.firstName || ''}"></label>
          ${manualPhone ? html`<div class="field"><span class="field-label">Телефон</span><div id="rgPhone"></div></div>` : ''}
          <button class="btn btn-berry btn-block" type="button" id="rgSend">${icon(manualPhone ? 'send' : 'phone')}${manualPhone ? 'Отправить заявку' : 'Поделиться телефоном'}</button>
          <p class="reg-msg" id="rgMsg" hidden></p>
          <div class="reg-trust">${icon('shield')}<span>${manualPhone ? 'Телефон увидит только руководитель «Милано».' : 'Номер возьмём из вашего Telegram — вводить не нужно. Его увидит только руководитель.'}</span></div>
        </div>
        ${back}`);
      if(manualPhone){ $('#rgPhone').innerHTML = String(Kit.phone.field('rgPh', '')); Kit.phone.bind($('#rgPh')); }
    };

    // Окно после заявки: «Всё в порядке» (ушла / предпросмотр) или «ждём руководителя» при следующем входе
    const done = (kind)=>{
      const s = sent || {};
      const name = s.name || [me.signup && me.signup.lastName, me.signup && me.signup.firstName].filter(Boolean).join(' ');
      if(kind === 'rejected'){
        show(html`<div class="reg-done"><div class="reg-check is-wait">${icon('lock')}</div><h1>Допуск не выдан</h1>
          <p>Руководитель отклонил заявку. Если это ошибка — свяжитесь с ним.</p></div>${back}`);
        return;
      }
      const fresh = kind === 'sent' || kind === 'preview';
      show(html`<div class="reg-done">
          <div class="reg-check ${fresh ? '' : 'is-wait'}">${icon(fresh ? 'check' : 'clock')}</div>
          <h1>${fresh ? 'Всё в порядке!' : 'Заявка у руководителя'}</h1>
          <p>${kind === 'preview' ? 'Telegram передал номер — регистрация работает. Это предпросмотр: заявка не ушла.'
            : fresh ? 'Заявка отправлена. Руководитель получил её в Telegram и назначит вам должность.'
            : 'Руководитель ещё не назначил должность. Как только назначит — придёт сообщение в Telegram.'}</p>
          ${steps(2)}
        </div>
        <div class="reg-sum">
          ${name ? html`<div>${icon('user', 'is-ok')}<span>Сотрудник</span><b>${name}</b></div>` : ''}
          <div>${icon('phone', 'is-ok')}<span>Телефон</span><b>${s.phone || 'получен'}</b></div>
          <div>${icon('clock', 'is-wait')}<span>Должность</span><b>${kind === 'preview' ? 'выберет руководитель' : 'ждём руководителя'}</b></div>
        </div>
        ${kind === 'preview' ? html`<button class="btn btn-berry btn-block section" type="button" data-next="1">${icon('right')}Дальше — в меню</button>`
          : html`<button class="btn btn-ghost btn-block section" type="button" data-recheck="1">${icon('refresh')}Проверить допуск</button>`}
        ${back}`);
      haptic(fresh ? 'success' : 'light');
    };

    const msg = (t, bad)=>{ const m = $('#rgMsg'); if(m){ m.textContent = t; m.classList.toggle('is-bad', !!bad); m.hidden = !t; } };
    const sendSignup = async (extra, phone)=>{
      const btn = $('#rgSend');
      const last = $('#rgLast').value.trim(), first = $('#rgFirst').value.trim();
      Kit.busy(btn, true);
      const r = await api('signup', Object.assign({lastName:last, firstName:first, username:Kit.user.username || ''}, extra));
      Kit.busy(btn, false);
      if(!r.ok){
        if(r.error === 'forbidden'){ done('rejected'); return; }
        msg(r.message || 'Не получилось отправить — попробуйте ещё раз', true); haptic('error'); return;
      }
      sent = {name:last + ' ' + first, phone:(r.signup && r.signup.phone) || phone || ''};
      me.signup = {status:'pending', lastName:last, firstName:first};
      done('sent');
    };
    Kit.on($('#view'), 'click', '#rgSend', ()=>{
      const last = $('#rgLast').value.trim(), first = $('#rgFirst').value.trim();
      if(last.length < 2 || first.length < 2){ msg('Впишите фамилию и имя — хотя бы по две буквы', true); haptic('error'); ($('#rgLast').value.trim().length < 2 ? $('#rgLast') : $('#rgFirst')).focus(); return; }
      if($('#rgPh')){
        const ph = Kit.phone.value($('#rgPh'));
        if(!ph){ msg('Впишите телефон', true); haptic('error'); return; }
        if(preview){ sent = {name:last + ' ' + first, phone:ph}; done('preview'); return; }
        sendSignup({phone:ph}, ph); return;
      }
      // Telegram отвечает в два приёма: колбэк (да/нет) и событие contactRequested с подписанным номером.
      // Ждём номер до 4 секунд после «да»; не пришёл — поле для ручного ввода.
      if(document.activeElement && document.activeElement.blur) document.activeElement.blur();  // клавиатура перекрывает окно Telegram
      let over = false, timer = null;
      const stop = ()=>{ over = true; clearTimeout(timer); tgApp.offEvent('contactRequested', onEv); };
      const refused = ()=>{ stop(); msg('Вы не разрешили передать номер. Без него заявку не отправить — нажмите ещё раз и выберите «Поделиться».', true); haptic('error'); };
      const finish = (contact)=>{
        if(over) return; stop();
        if(!contact){ Kit.toast('Telegram не передал номер — впишите его вручную'); regForm(true); return; }
        if(preview){ sent = {name:last + ' ' + first, phone:phoneOf(contact)}; done('preview'); return; }
        sendSignup({contact}, phoneOf(contact));
      };
      const onEv = ev=>{
        if(over || !ev) return;
        if(ev.status === 'sent' && ev.response) finish(ev.response);
        else if(ev.status === 'cancelled') refused();
      };
      tgApp.onEvent('contactRequested', onEv);
      msg('Подтвердите в окне Telegram — «Поделиться номером»');
      tgApp.requestContact((shared, ev)=>{
        if(over) return;
        if(!shared) return refused();
        if(ev && ev.response) return finish(ev.response);
        timer = setTimeout(()=> finish(''), 4000);
      });
    });
    Kit.on($('#view'), 'click', '[data-next]', ()=>{ haptic('light'); preview = false; doors(); });
    Kit.on($('#view'), 'click', '[data-skip]', ()=>{ haptic('light'); preview = false; try{ localStorage.setItem('cake-skip-reg', '1'); }catch(e){} doors(); });
    Kit.on($('#view'), 'click', '[data-preview]', ()=>{ haptic('light'); preview = true; regForm(!canContact); });
    Kit.on($('#view'), 'click', '[data-team]', ()=>{ haptic('light'); window.CakeTeam.open(api, me, doors); });
    Kit.on($('#view'), 'click', '[data-recheck]', async ()=>{
      const m = await api('getMe'); haptic('light');
      if(m.ok && m.access){ Object.assign(me, m); if(m.staff && ROLE_PAGE[m.staff.role]) location.replace(ROLE_PAGE[m.staff.role]); else doors(); }
      else if(m.ok && m.signup && m.signup.status === 'rejected') done('rejected');
      else Kit.toast('Пока без решения — загляните позже');
    });
    const staff = ()=>{
      if(!me.ok){ show(html`<div class="empty">${icon('lock')}<div class="empty-title">Нет связи со складом</div>Откройте приложение из бота ещё раз.</div>${back}`); return; }
      if(me.access){
        // руководитель без записи в «Людях» тоже проходит окно регистрации (предпросмотр) — пока не нажмёт «В меню»
        let skip = false; try{ skip = localStorage.getItem('cake-skip-reg') === '1'; }catch(e){}
        if(me.role === 'admin' && !me.staff && !skip){ preview = true; return regForm(!canContact); }
        return doors();
      }
      const st = me.signup && me.signup.status;
      if(st === 'pending') return done('wait');
      if(st === 'rejected') return done('rejected');
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
