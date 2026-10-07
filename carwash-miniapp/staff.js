// изменено 2026-10-08 02:15
/* ============================================================
   staff.js — общий модуль «Смена / Персонал / Зарплата» мойки
   для admin.html и owner.html (на kit/core.js).

   Хост размещает контейнер и вызывает:
     StaffModule.init({api, mount: element, onChange?})
     StaffModule.render()           — при открытии вкладки
     StaffModule.getStaff() / getShiftIds() / byId(id)
   Бэкенд-контракт: getStaff, saveStaff, deleteStaff, getShift,
   setShift, payStaff, getPayouts.
   ============================================================ */
window.StaffModule = (function(){
  "use strict";
  const {html, icon, money, date: D, haptic} = Kit;
  let api = null, mount = null, onChange = null;
  let STAFF = [], SHIFT = [];
  const PAY = {percent:'% от выручки', fixed:'BYN за смену'};
  const ROLES = ['Мойщик','Детейлер','Администратор','Химчистка'];

  function byId(id){ return STAFF.find(s=>s.id === id); }
  function rateLabel(s){ return s.payType === 'percent' ? s.rate + '% от выручки' : money(s.rate) + ' за смену'; }

  async function load(){
    const [st, sh] = await Promise.all([api('getStaff'), api('getShift', {date:D.today()})]);
    STAFF = st.staff || []; SHIFT = sh.staffIds || [];
  }

  async function render(){
    if(!STAFF.length) mount.innerHTML = '<div class="skel" style="height:120px"></div><div class="skel" style="height:220px;margin-top:16px"></div>';
    await load();
    draw();
  }

  function draw(){
    const active = STAFF.filter(s=>s.active);
    const archive = STAFF.filter(s=>!s.active);
    const onShift = SHIFT.map(byId).filter(Boolean);
    const fund = active.reduce((a, s)=> a + Math.max(0, s.accruedMonth), 0);
    mount.innerHTML = html`
      <div class="section-head"><h2 class="section-title">Сегодня на смене</h2><button class="section-link" type="button" data-act="pick">Изменить</button></div>
      ${onShift.length ? html`<div class="chips">${onShift.map(s=>html`<span class="chip" style="pointer-events:none"><span class="avatar" style="width:28px;height:28px;font-size:12px">${Kit.initials(s.name)}</span>${s.name.split(' ')[0]}</span>`)}</div>`
        : html`<button class="add-tile" type="button" data-act="pick">${icon('users')}Отметить, кто на смене</button>`}
      <div class="stats section">
        <div class="stat"><div class="stat-label">К выплате за месяц</div><div class="stat-value" data-fit="16">${money(Math.round(fund))}</div></div>
        <div class="stat"><div class="stat-label">Сотрудников</div><div class="stat-value">${active.length}</div></div>
      </div>
      <div class="section">
        <div class="section-head"><h2 class="section-title">Команда</h2><button class="section-link" type="button" data-act="add">+ Добавить</button></div>
        <div class="list">${active.map(rowHtml)}</div>
      </div>
      ${archive.length ? html`<div class="section"><div class="section-head"><h2 class="section-title">Архив</h2></div><div class="list">${archive.map(rowHtml)}</div></div>` : ''}`;
  }
  function rowHtml(s){
    const on = SHIFT.includes(s.id);
    return html`<button class="row" type="button" data-staff="${s.id}">
      <span class="avatar"${s.active ? '' : Kit.raw(' style="filter:grayscale(1);opacity:.6"')}>${Kit.initials(s.name)}</span>
      <span class="row-main"><span class="row-title">${s.name}</span><span class="row-sub">${s.role} · ${rateLabel(s)}</span></span>
      <span class="row-end">${s.active ? html`<span class="mono" style="font-weight:600">${money(Math.round(s.accruedMonth))}</span>${on ? html`<span class="pill pill-ok">на смене</span>` : ''}` : html`<span class="pill pill-muted">архив</span>`}</span>
    </button>`;
  }

  function openShiftPicker(){
    let picked = SHIFT.slice();
    const list = STAFF.filter(s=>s.active);
    const sh = Kit.sheet({title:'Кто сегодня на смене', sub:D.label(D.today()) + ', ' + D.long(D.today()),
      body: html`<div class="list">${list.map(s=>html`<label class="row"><span class="avatar">${Kit.initials(s.name)}</span><span class="row-main"><span class="row-title">${s.name}</span><span class="row-sub">${s.role}</span></span><span class="switch"><input type="checkbox" data-id="${s.id}" ${picked.includes(s.id) ? Kit.raw('checked') : ''}><span></span></span></label>`)}</div>`,
      actions: html`<button class="btn btn-primary" type="button" data-save>Сохранить смену</button>`});
    sh.body.addEventListener('change', e=>{
      const id = e.target.dataset.id; if(!id) return;
      picked = e.target.checked ? picked.concat(id) : picked.filter(x=>x !== id); haptic('select');
    });
    sh.$('[data-save]').addEventListener('click', async ()=>{
      Kit.busy(sh.$('[data-save]'), true);
      const r = await api('setShift', {date:D.today(), staffIds:picked});
      if(!r.ok){ Kit.busy(sh.$('[data-save]'), false); Kit.toast('Не удалось сохранить смену', 'error'); return; }
      SHIFT = picked; sh.close(); draw(); Kit.toast('Смена сохранена', 'ok'); onChange && onChange();
    });
  }

  function openEditor(s){
    const isNew = !s;
    s = s || {name:'', role:'Мойщик', payType:'percent', rate:30, phone:'', active:true};
    const sh = Kit.sheet({title: isNew ? 'Новый сотрудник' : 'Редактировать', body: html`
      <label class="field"><span class="field-label">Имя и фамилия</span><input class="input" id="sName" maxlength="60" value="${s.name}" placeholder="Иван Петров"></label>
      <div class="field"><span class="field-label">Должность</span><div class="chips" id="sRole">${ROLES.map(r=>html`<button type="button" class="chip${s.role === r ? ' is-on' : ''}" data-v="${r}">${r}</button>`)}</div></div>
      <div class="field"><span class="field-label">Оплата</span><div class="seg" id="sPay"><button type="button" data-v="percent" class="${s.payType === 'percent' ? 'is-on' : ''}">% от выручки</button><button type="button" data-v="fixed" class="${s.payType === 'fixed' ? 'is-on' : ''}">За смену</button></div></div>
      <label class="field"><span class="field-label" id="sRateLbl">${s.payType === 'percent' ? 'Процент' : 'Ставка, BYN'}</span><input class="input mono" id="sRate" inputmode="decimal" value="${s.rate}"></label>
      <div class="field"><span class="field-label">Телефон</span>${Kit.phone.field('sPhone', s.phone)}</div>`,
      actions: html`<button class="btn btn-primary" type="button" data-save>${isNew ? 'Добавить' : 'Сохранить'}</button>`});
    let role = s.role, pay = s.payType;
    Kit.phone.bind(sh.$('#sPhone'));
    Kit.on(sh.$('#sRole'), 'click', '[data-v]', (e, el)=>{ role = el.dataset.v; sh.el.querySelectorAll('#sRole .chip').forEach(c=>c.classList.toggle('is-on', c === el)); haptic('select'); });
    Kit.on(sh.$('#sPay'), 'click', '[data-v]', (e, el)=>{ pay = el.dataset.v; sh.el.querySelectorAll('#sPay button').forEach(c=>c.classList.toggle('is-on', c === el)); sh.$('#sRateLbl').textContent = pay === 'percent' ? 'Процент' : 'Ставка, BYN'; haptic('select'); });
    sh.$('[data-save]').addEventListener('click', async ()=>{
      const name = sh.$('#sName').value.trim();
      const rate = Number(String(sh.$('#sRate').value).replace(',', '.'));
      if(name.length < 2){ Kit.toast('Укажите имя', 'error'); return; }
      if(!(rate >= 0) || (pay === 'percent' && rate > 100)){ Kit.toast('Проверьте ставку', 'error'); return; }
      const phoneEl = sh.$('#sPhone');
      if(phoneEl.value && !Kit.phone.valid(phoneEl)){ Kit.toast('Проверьте телефон', 'error'); return; }
      Kit.busy(sh.$('[data-save]'), true);
      const r = await api('saveStaff', {staff:{id:s.id, name, role, payType:pay, rate, phone:Kit.phone.value(phoneEl), active:s.active !== false}});
      if(!r.ok){ Kit.busy(sh.$('[data-save]'), false); Kit.toast('Не удалось сохранить', 'error'); return; }
      sh.close(); await render(); Kit.toast(isNew ? 'Сотрудник добавлен' : 'Сохранено', 'ok'); onChange && onChange();
    });
  }

  async function openCard(s){
    const sh = Kit.sheet({title:s.name, sub:s.role + ' · ' + rateLabel(s), body: html`
      <div class="stats three">
        <div class="stat"><div class="stat-label">Смен</div><div class="stat-value">${s.shiftsMonth}</div></div>
        <div class="stat"><div class="stat-label">Начислено</div><div class="stat-value" data-fit="14">${Kit.num(Math.round(s.earnedMonth))}</div></div>
        <div class="stat"><div class="stat-label">${s.accruedMonth < 0 ? 'Аванс' : 'К выплате'}</div><div class="stat-value" data-fit="14">${Kit.num(Math.round(Math.abs(s.accruedMonth)))}</div></div>
      </div>
      ${s.active ? html`<div class="section"><span class="field-label">Выплатить, BYN</span><div class="field-row"><input class="input mono" id="payAmt" inputmode="decimal" value="${Math.max(0, Math.round(s.accruedMonth))}"><button class="btn btn-primary" type="button" data-pay style="flex:none">${icon('cash')}Выплатить</button></div><p class="hint" style="margin-top:6px">Выплата сверх начисленного — аванс, он уменьшит будущие начисления.</p></div>` : ''}
      <div class="section"><div class="eyebrow" style="margin-bottom:8px">Выплаты</div><div id="payouts"><div class="skel" style="height:56px"></div></div></div>
      <div class="section" style="display:flex;flex-direction:column;gap:8px">
        ${s.phone ? html`<a class="btn btn-ghost btn-block" href="tel:${s.phone}">${icon('phone')}${Kit.phone.pretty(s.phone)}</a>` : ''}
        <button class="btn btn-ghost btn-block" type="button" data-edit>${icon('edit')}Редактировать</button>
        <button class="btn btn-ghost btn-block" type="button" data-arch>${icon(s.active ? 'archive' : 'restore')}${s.active ? 'В архив' : 'Вернуть из архива'}</button>
        <button class="btn btn-danger-soft btn-block" type="button" data-del>${icon('trash')}Удалить навсегда</button>
      </div>`});
    api('getPayouts', {staffId:s.id}).then(r=>{
      const list = (r.payouts || []).slice(0, 12);
      const box = sh.$('#payouts'); if(!box) return;
      box.innerHTML = list.length ? html`<div class="list">${list.map(p=>html`<div class="row"><span class="row-main"><span class="row-title">${D.label(p.date)}</span></span><span class="mono" style="font-weight:600">${money(p.amount)}</span></div>`)}</div>` : html`<div class="empty-mini">Выплат ещё не было</div>`;
    });
    const payBtn = sh.$('[data-pay]');
    if(payBtn) payBtn.addEventListener('click', async ()=>{
      const amount = Number(String(sh.$('#payAmt').value).replace(',', '.'));
      if(!(amount > 0)){ Kit.toast('Введите сумму', 'error'); return; }
      if(!await Kit.confirm('Выплатить ' + money(amount) + ' — ' + s.name + '?', 'Выплатить')) return;
      Kit.busy(payBtn, true);
      const r = await api('payStaff', {staffId:s.id, amount});
      Kit.busy(payBtn, false);
      if(!r.ok){ Kit.toast('Не удалось провести выплату', 'error'); return; }
      sh.close(); await render(); Kit.toast('Выплачено ' + money(amount), 'ok');
    });
    sh.$('[data-edit]').addEventListener('click', ()=>{ sh.close(); openEditor(s); });
    sh.$('[data-arch]').addEventListener('click', async ()=>{
      const r = await api('saveStaff', {staff:Object.assign({}, s, {active:!s.active})});
      if(!r.ok){ Kit.toast('Не удалось', 'error'); return; }
      if(s.active && SHIFT.includes(s.id)){ SHIFT = SHIFT.filter(x=>x !== s.id); await api('setShift', {date:D.today(), staffIds:SHIFT}); }
      sh.close(); await render(); Kit.toast(s.active ? 'Перенесён в архив' : 'Возвращён в команду', 'ok'); onChange && onChange();
    });
    sh.$('[data-del]').addEventListener('click', async ()=>{
      if(!await Kit.confirm('Удалить ' + s.name + ' безвозвратно? История выплат останется, но без имени.', 'Удалить', true)) return;
      const r = await api('deleteStaff', {id:s.id});
      if(!r.ok){ Kit.toast('Не удалось удалить', 'error'); return; }
      sh.close(); await render(); Kit.toast('Удалено', 'ok'); onChange && onChange();
    });
  }

  function init(o){
    api = o.api; mount = o.mount; onChange = o.onChange || null;
    Kit.on(mount, 'click', '[data-act]', (e, el)=>{ el.dataset.act === 'pick' ? openShiftPicker() : openEditor(null); });
    Kit.on(mount, 'click', '[data-staff]', (e, el)=>{ const s = byId(el.dataset.staff); if(s) openCard(s); });
  }

  return {init, render, load, getStaff:()=>STAFF, getShiftIds:()=>SHIFT, byId, openShiftPicker};
})();
