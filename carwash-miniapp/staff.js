/* ============================================================
   staff.js — общий модуль «Смена / Персонал» для admin.html и owner.html.

   Инкапсулирует всю логику и разметку: кто сегодня на смене, список
   сотрудников (активные + архив), карточка сотрудника (добавление,
   редактирование, архивирование/восстановление, безвозвратное удаление),
   выплата зарплаты/аванса и история выплат. Раньше этот код дублировался
   в admin.html и owner.html (и был неполным в каждом — например, в
   owner.html «Выплатить» не работал в демо-режиме без реального бэкенда,
   а в admin.html не было ни оплаты, ни архива вовсе). Теперь один модуль,
   одинаковое поведение в обеих ролях.

   ПОДКЛЮЧЕНИЕ:
     1. <script src="bootstrap.js"></script>
        <script src="staff.js"></script>   — после bootstrap.js, до своего <script>
     2. В разметке разместить контейнеры с фиксированными id (модуль сам
        ничего не создаёт вне них, порядок и обёртки-секции — на
        усмотрение хоста):
          #onShiftList     — список тех, кто сегодня на смене
          #pickShiftBtn    — кнопка «Выбрать, кто на смене» (открывает шторку)
          #staffCount      — <span> для счётчика активных сотрудников (необязателен)
          #addStaffBtn     — кнопка «+ Новый сотрудник»
          #staffActiveList — список активных сотрудников
          #archiveSection  — обёртка секции архива (модуль сам покажет/скроет)
          #staffArchiveList— список архивных сотрудников
          #payrollFund     — необязательный элемент, модуль подставит туда
                              сумму начисленного по всем активным сотрудникам
     3. StaffModule.init({ api, haptic, showToast, openSheet, closeSheet });
        StaffModule.renderShiftTab(); — вызывать при открытии вкладки
                                         (и один раз на старте, если вкладка
                                         активна по умолчанию)

   БЭКЕНД-КОНТРАКТ (см. Code.gs): getStaff, saveStaff, deleteStaff,
   getShift, setShift, payStaff, getPayouts. В демо-режиме (без реального
   apiUrl) хост обязан уметь ответить на все эти action в своём mockApi —
   иначе соответствующая кнопка в модуле молча не сработает и покажет
   тост с ошибкой (это осознанное поведение — не должно падать тихо).

   Доступ к данным из хост-файла (например, назначение исполнителя на
   бронь в admin.html): StaffModule.getStaff(), StaffModule.getShiftIds(),
   StaffModule.staffById(id), StaffModule.initials(name).
   ============================================================ */
const StaffModule = (function(){
  "use strict";

  let cfg = null;
  let STAFF = [];
  let SHIFT_TODAY = [];
  let PAYOUT_CACHE_ID = null; // чтобы не перерисовать историю выплат после закрытия шторки

  function $(id){ return document.getElementById(id); }
  function todayKey(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  const TODAY = todayKey();

  function initials(name){ return (name||'').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase(); }
  function fmtDate(key){
    if(!key) return '';
    const [y,m,d] = key.split('-').map(Number);
    return new Date(y,m-1,d).toLocaleDateString('ru-RU',{day:'numeric', month:'long'});
  }
  function activeStaff(){ return STAFF.filter(s=>s.active!==false); }
  function archivedStaff(){ return STAFF.filter(s=>s.active===false); }
  function staffById(id){ return STAFF.find(s=>s.id===id); }

  function init(options){ cfg = options; }

  /* ============ ЗАГРУЗКА ============
     staffPrefetch — опциональный уже запущенный промис api('getStaff'),
     если хост прогревает его заранее (см. loadServices()-паттерн в
     miniapp-style skill: запрос стартует, пока пользователь ещё занят
     предыдущим экраном, а не в момент открытия вкладки). Потребляется
     ровно один раз — хост обнуляет свою переменную после передачи сюда. */
  async function loadStaffAndShift(staffPrefetch){
    const staffRes = await (staffPrefetch || cfg.api('getStaff'));
    if(staffRes.ok) STAFF = staffRes.staff; else cfg.showToast('Не удалось загрузить персонал', true);
    const shiftRes = await cfg.api('getShift', {date:TODAY});
    if(shiftRes.ok) SHIFT_TODAY = shiftRes.staffIds; else cfg.showToast('Не удалось загрузить смену', true);
  }

  async function renderShiftTab(staffPrefetch){
    await loadStaffAndShift(staffPrefetch);
    renderOnShiftList();
    renderStaffList();
  }

  /* ============ СЕГОДНЯ НА СМЕНЕ ============ */
  function renderOnShiftList(){
    const wrap = $('onShiftList');
    if(!wrap) return;
    const onShift = STAFF.filter(s=>SHIFT_TODAY.includes(s.id));
    if(!onShift.length){
      wrap.innerHTML = `<div class="empty-state" style="padding:30px 20px;"><div class="drop-big"></div>Пока никто не отмечен на смене</div>`;
      return;
    }
    wrap.innerHTML='';
    onShift.forEach(s=>{
      const row = document.createElement('div'); row.className='staff-row';
      row.innerHTML = `
        <div class="avatar">${initials(s.name)}</div>
        <div class="staff-main"><div class="staff-name">${s.name}</div><div class="staff-role">${s.role}</div></div>
        <button class="glass-btn" style="width:32px; height:32px; flex-shrink:0;" title="Снять со смены">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" style="width:14px; height:14px; stroke:var(--ink-soft);"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      `;
      row.querySelector('button').addEventListener('click', async ()=>{
        const prev = SHIFT_TODAY;
        const next = SHIFT_TODAY.filter(id=>id!==s.id);
        SHIFT_TODAY = next;
        cfg.haptic();
        const res = await cfg.api('setShift', {date:TODAY, staffIds:next});
        if(!res.ok){ SHIFT_TODAY = prev; cfg.showToast('Не удалось сохранить смену', true); return; }
        renderOnShiftList();
      });
      wrap.appendChild(row);
    });
  }

  // Список для выбора смены — отдельная прокручиваемая шторка (а не чипы
  // прямо на экране), чтобы при большом штате все сотрудники были
  // доступны, а не обрезались за пределы экрана.
  function openShiftPickerSheet(){
    const roster = activeStaff();
    if(!roster.length){
      cfg.openSheet(`<div class="sheet-title">Кто на смене</div><div class="empty-state" style="padding:30px 20px;"><div class="drop-big"></div>Сначала добавьте сотрудников.</div>`);
      return;
    }
    const selected = new Set(SHIFT_TODAY);
    cfg.openSheet(`
      <div class="sheet-title">Кто сегодня на смене</div>
      <div id="shiftPickList" style="max-height:50vh; overflow-y:auto;"></div>
      <button class="btn btn-primary btn-block" id="saveShiftBtn" style="margin-top:14px;">Сохранить</button>
    `);
    function renderList(){
      const wrap = $('shiftPickList');
      wrap.innerHTML = roster.map(s=>`
        <div class="staff-row" data-id="${s.id}">
          <div class="avatar">${initials(s.name)}</div>
          <div class="staff-main"><div class="staff-name">${s.name}</div><div class="staff-role">${s.role}</div></div>
          ${selected.has(s.id) ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;color:var(--accent);flex-shrink:0;"><path d="M20 6L9 17l-5-5"/></svg>' : ''}
        </div>
      `).join('');
      wrap.querySelectorAll('.staff-row').forEach(row=>{
        row.addEventListener('click', ()=>{
          const id = row.dataset.id;
          if(selected.has(id)) selected.delete(id); else selected.add(id);
          cfg.haptic();
          renderList();
        });
      });
    }
    renderList();
    $('saveShiftBtn').addEventListener('click', async ()=>{
      const btn = $('saveShiftBtn'); btn.disabled=true; btn.textContent='Сохраняем…';
      const next = [...selected];
      const res = await cfg.api('setShift', {date:TODAY, staffIds:next});
      if(!res.ok){ cfg.showToast('Не удалось сохранить смену', true); btn.disabled=false; btn.textContent='Сохранить'; return; }
      SHIFT_TODAY = next;
      cfg.haptic('success'); cfg.closeSheet(); renderOnShiftList();
    });
  }

  /* ============ СПИСОК СОТРУДНИКОВ + АРХИВ ============ */
  function renderStaffList(){
    const active = activeStaff();
    const archived = archivedStaff();
    if($('staffCount')) $('staffCount').textContent = active.length ? ` (${active.length})` : '';
    if($('payrollFund')) $('payrollFund').textContent = active.reduce((s,x)=>s+(x.accruedMonth||0),0)+' BYN';

    const activeWrap = $('staffActiveList');
    if(activeWrap){
      activeWrap.innerHTML='';
      if(!active.length){ activeWrap.innerHTML = `<div class="empty-state" style="padding:30px 20px;"><div class="drop-big"></div>Сотрудники не добавлены</div>`; }
      active.forEach(s=> activeWrap.appendChild(staffRow(s)));
    }

    if($('archiveSection')) $('archiveSection').style.display = archived.length ? 'block' : 'none';
    const archiveWrap = $('staffArchiveList');
    if(archiveWrap){
      archiveWrap.innerHTML='';
      archived.forEach(s=>{ const row = staffRow(s); row.style.opacity='.55'; archiveWrap.appendChild(row); });
    }
  }

  function staffRow(s){
    const row = document.createElement('div'); row.className='staff-row';
    const shiftsBit = (s.shiftsMonth!=null) ? ` · ${s.shiftsMonth} смен` : '';
    row.innerHTML = `
      <div class="avatar">${initials(s.name)}</div>
      <div class="staff-main"><div class="staff-name">${s.name}</div><div class="staff-role">${s.role}${shiftsBit}</div></div>
      ${s.accruedMonth!=null ? `<div class="staff-pay"><div class="v" style="${s.accruedMonth<0?'color:var(--accent);':''}">${s.accruedMonth} BYN</div><div class="l">${s.accruedMonth<0?'аванс':'за месяц'}</div></div>` : ''}
    `;
    row.addEventListener('click', ()=>openStaffEditSheet(s));
    return row;
  }

  /* ============ КАРТОЧКА СОТРУДНИКА ============ */
  function openStaffEditSheet(staff){
    const isNew = !staff;
    const s = staff || {id:'st-'+Date.now(), name:'', role:'Мойщик', payType:'percent', rate:30, phone:'', shiftsMonth:0, accruedMonth:0, active:true};
    const archived = s.active===false;
    cfg.openSheet(`
      <div class="sheet-title">${isNew?'Новый сотрудник':'Сотрудник'}</div>
      <div class="field"><label>Имя</label><input type="text" id="sName" value="${s.name}"></div>
      <div class="field"><label>Роль</label>
        <select id="sRole"><option value="Мойщик" ${s.role==='Мойщик'?'selected':''}>Мойщик</option><option value="Администратор" ${s.role==='Администратор'?'selected':''}>Администратор</option></select>
      </div>
      <div class="field-row">
        <div class="field"><label>Тип оплаты</label>
          <select id="sPayType"><option value="percent" ${s.payType==='percent'?'selected':''}>% от выручки</option><option value="fixed" ${s.payType==='fixed'?'selected':''}>Фиксированная</option></select>
        </div>
        <div class="field"><label>Ставка</label><input type="number" id="sRate" value="${s.rate}"></div>
      </div>
      <div class="field"><label>Телефон</label><input type="tel" id="sPhone" value="${s.phone||''}"></div>
      ${isNew?'':`<div class="ticket-row"><span class="k">${s.accruedMonth<0?'Аванс (переплата)':'Начислено за месяц'}</span><span class="v" style="${s.accruedMonth<0?'color:var(--accent);':''}">${s.accruedMonth} BYN</span></div>`}
      ${isNew || archived ? '' : `
      <div class="field-row" style="align-items:flex-end; margin-top:10px;">
        <div class="field" style="margin-bottom:0; flex:1;"><label>Сумма к выплате</label>
          <input type="number" id="payAmount" value="${Math.max(s.accruedMonth,0)}" min="1">
        </div>
        <button class="btn btn-primary" id="payStaffBtn" style="flex:none; height:47px; padding:0 18px;">Выплатить</button>
      </div>
      <div class="section-title" style="margin:16px 0 8px;">История выплат</div>
      <div id="payoutHistory" style="font-size:12.5px; color:var(--ink-faint);">Загрузка…</div>
      `}
      <div class="sheet-footer-row">
        ${!isNew && s.phone ? `<a class="btn btn-outline btn-block" href="tel:${s.phone}">Позвонить</a>` : ''}
        <button class="btn btn-primary btn-block" id="saveStaffBtn">Сохранить</button>
      </div>
      ${isNew?'':`<button class="btn btn-outline btn-block" id="archiveStaffBtn" style="margin-top:10px;">${archived?'Вернуть из архива':'В архив'}</button>`}
      ${isNew?'':`<button class="btn btn-danger btn-block" id="delStaffBtn" style="margin-top:10px;">Удалить безвозвратно</button>`}
    `);

    $('saveStaffBtn').addEventListener('click', async ()=>{
      const updated = Object.assign({}, s, {
        name:$('sName').value.trim()||'Без имени', role:$('sRole').value,
        payType:$('sPayType').value, rate:Number($('sRate').value)||0, phone:$('sPhone').value.trim()
      });
      const res = await cfg.api('saveStaff', {staff:updated});
      if(!res.ok){ cfg.showToast('Не удалось сохранить сотрудника', true); return; }
      cfg.haptic('success'); cfg.closeSheet(); renderStaffList();
    });

    if(!isNew){
      $('archiveStaffBtn').addEventListener('click', async ()=>{
        const goingActive = archived;
        const msg = goingActive
          ? `Вернуть «${s.name}» из архива?`
          : `Отправить «${s.name}» в архив? Он перестанет отображаться в списке для назначения на смену — данные и история сохранятся.`;
        if(!await App.confirmAsync(msg)) return;
        const updated = Object.assign({}, s, {active: goingActive});
        const res = await cfg.api('saveStaff', {staff:updated});
        if(!res.ok){ cfg.showToast('Не удалось обновить сотрудника', true); return; }
        // Если архивируем того, кто сегодня на смене — снимаем его со смены,
        // иначе он останется числиться там, хотя уже уволен.
        if(!goingActive && SHIFT_TODAY.includes(s.id)){
          const next = SHIFT_TODAY.filter(id=>id!==s.id);
          const shiftRes = await cfg.api('setShift', {date:TODAY, staffIds:next});
          if(shiftRes.ok) SHIFT_TODAY = next;
        }
        cfg.haptic('success'); cfg.closeSheet(); renderShiftTab();
      });
      $('delStaffBtn').addEventListener('click', async ()=>{
        if(!await App.confirmAsync(`Удалить «${s.name}» безвозвратно? Это отличается от архива — история и начисления будут потеряны.`)) return;
        const res = await cfg.api('deleteStaff', {id:s.id});
        if(!res.ok){ cfg.showToast('Не удалось удалить сотрудника', true); return; }
        cfg.haptic('success'); cfg.closeSheet(); renderShiftTab();
      });
    }

    if(!isNew && !archived){
      $('payStaffBtn').addEventListener('click', async ()=>{
        const amount = Number($('payAmount').value);
        if(!amount || amount<=0){ cfg.showToast('Введите сумму выплаты', true); return; }
        const isAdvance = amount > s.accruedMonth;
        const msg = isAdvance
          ? 'Выплатить '+amount+' BYN сотруднику «'+s.name+'»? Это больше начисленного — остаток уйдёт в аванс.'
          : 'Выплатить '+amount+' BYN сотруднику «'+s.name+'»?';
        if(!await App.confirmAsync(msg)) return;
        const res = await cfg.api('payStaff', {staffId:s.id, amount});
        if(!res.ok){ cfg.showToast('Не удалось провести выплату', true); return; }
        cfg.haptic('success'); cfg.showToast('Выплата проведена'); cfg.closeSheet(); renderShiftTab();
      });
      loadPayoutHistory(s.id);
    }
  }

  async function loadPayoutHistory(staffId){
    PAYOUT_CACHE_ID = staffId;
    const res = await cfg.api('getPayouts', {staffId});
    const el = $('payoutHistory');
    if(!el || PAYOUT_CACHE_ID!==staffId) return; // шторка уже закрыта/переоткрыта на другого сотрудника
    if(!res.ok || !res.payouts.length){ el.textContent = 'Выплат пока не было.'; return; }
    el.innerHTML = res.payouts.map(p=>`
      <div style="display:flex; justify-content:space-between; padding:6px 0; border-top:1px solid var(--border);">
        <span>${fmtDate(p.date)}</span><span class="mono" style="color:var(--ink);">${p.amount} BYN</span>
      </div>
    `).join('');
  }

  /* ============ ПРИВЯЗКА СТАТИЧНЫХ КНОПОК ============ */
  function bindButtons(){
    if($('pickShiftBtn')) $('pickShiftBtn').addEventListener('click', openShiftPickerSheet);
    if($('addStaffBtn')) $('addStaffBtn').addEventListener('click', ()=>openStaffEditSheet(null));
  }

  return {
    init, bindButtons, renderShiftTab,
    getStaff: ()=>STAFF, getShiftIds: ()=>SHIFT_TODAY,
    staffById, initials
  };
})();
