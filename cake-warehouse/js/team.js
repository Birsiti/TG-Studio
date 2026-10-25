// изменено 2026-10-25 17:40
/* «Сотрудники» — экран руководителя на главной (после «Я сотрудник Милано»):
   новые заявки с выбором должности, все сотрудники с должностью, телефоном и машиной;
   карточка — сменить должность, закрепить машину (марка и госномер), удалить.
   Данные: getRefs (staff), getSignups, decideSignup, saveStaff, deleteStaff. */
window.CakeTeam = (function(){
  "use strict";
  const {html, icon, $, $$, haptic} = Kit;
  const ROLE = {manager:'Руководитель', logist:'Логист', storekeeper:'Кладовщик', driver:'Водитель'};
  const ORDER = ['manager', 'logist', 'storekeeper', 'driver'];
  const PLURAL = {all:'Все', manager:'Руководители', logist:'Логисты', storekeeper:'Кладовщики', driver:'Водители'};
  const carOf = s=>{ const [model, plate] = String(s.car || '').split(' · '); return {model:(model || '').trim(), plate:(plate || '').trim()}; };
  const fail = r=>{ Kit.toast(r.message || (r.error === 'forbidden' ? 'Нет доступа' : 'Не получилось'), 'error'); haptic('error'); };
  let api, me, onBack, staff = [], signups = [], filter = 'all';

  async function load(){
    const [r, s] = await Promise.all([api('getRefs'), api('getSignups')]);
    if(!r.ok){ fail(r); return false; }
    staff = r.staff.filter(x=>x.active).sort((a, b)=> ORDER.indexOf(a.role) - ORDER.indexOf(b.role) || a.name.localeCompare(b.name, 'ru'));
    signups = s.ok ? s.signups : [];
    return true;
  }

  const card = s=>{
    const c = carOf(s);
    return html`<button class="team-card" type="button" data-id="${s.id}">
      <span class="team-ava r-${s.role}">${Kit.initials(s.name)}</span>
      <span class="team-main"><span class="team-name">${s.name}</span>
        <span class="role-chip r-${s.role}">${ROLE[s.role] || s.role}</span>
        <span class="team-line">${s.phone || 'телефон не указан'}</span>
        ${s.role === 'driver' ? html`<span class="team-line ${c.model ? '' : 'is-none'}">${c.model ? `${c.model}${c.plate ? ' · ' + c.plate : ''}` : 'машина не закреплена'}</span>` : ''}</span>
      ${icon('right', 'row-chev')}</button>`;
  };
  const waitCard = s=> html`<div class="team-wait" data-s="${s.tgId}">
      <div class="team-head"><div><div class="team-name">${s.lastName} ${s.firstName}</div>
        <div class="team-line">${s.phone}${s.phoneOk ? ' · из Telegram' : ' · введён вручную'}${s.username ? ' · @' + s.username : ''}</div></div></div>
      <div class="team-roles">${ORDER.map(k=>html`<button type="button" data-role="${k}">${ROLE[k]}</button>`)}</div>
      <button class="btn-danger-soft" type="button" data-no="1">Отказать</button></div>`;

  function render(){
    const counts = {all:staff.length}; ORDER.forEach(k=> counts[k] = staff.filter(s=>s.role === k).length);
    const list = filter === 'all' ? staff : staff.filter(s=>s.role === filter);
    $('#view').innerHTML = String(html`
      <div class="page-head"><h1 class="page-title">Сотрудники</h1><p class="page-sub">${staff.length} чел. · нажмите на карточку, чтобы изменить или удалить</p></div>
      ${signups.length ? html`<div class="eyebrow" style="margin-bottom:8px">Ждут должности · ${signups.length}</div><div class="team-list">${signups.map(waitCard)}</div>` : ''}
      <div class="chips scroll section" id="tmChips">${['all'].concat(ORDER).map(k=>html`<button type="button" class="chip ${filter === k ? 'is-on' : ''}" data-f="${k}">${PLURAL[k]} · ${counts[k]}</button>`)}</div>
      <div class="team-list section">${list.length ? list.map(card) : html`<div class="empty">${icon('users')}<div class="empty-title">Пока никого</div>Новые сотрудники регистрируются сами: «Я сотрудник Милано» → заявка придёт вам в Telegram.</div>`}</div>
      <button class="back-row" type="button" data-tmback="1">${icon('left')}Сотрудникам</button>`);
    window.scrollTo(0, 0);
  }

  function edit(s){
    let role = s.role, armed = false;
    const c = carOf(s);
    const sh = Kit.sheet({title:s.name, sub:(s.phone || '') + (s.tgId ? ' · id ' + s.tgId : ''), body: html`
      <span class="field-label">Должность</span>
      <div class="team-roles" id="tmRole">${ORDER.map(k=>html`<button type="button" data-v="${k}" class="${k === role ? 'is-on' : ''}">${ROLE[k]}</button>`)}</div>
      <div id="tmCar" class="section"${role === 'driver' ? '' : Kit.raw(' hidden')}>
        <label class="field"><span class="field-label">Марка машины</span><input class="input" id="tmModel" maxlength="40" value="${c.model}" placeholder="Iveco Daily"></label>
        <label class="field section"><span class="field-label">Госномер</span><input class="input mono" id="tmPlate" maxlength="16" value="${c.plate}" placeholder="4521 AB-7" autocapitalize="characters"></label>
      </div>
      <button class="btn-danger-soft btn-block section" type="button" id="tmDel">${icon('trash')}Удалить сотрудника</button>`,
      actions: html`<button class="btn btn-primary btn-block" type="button" id="tmSave">Сохранить</button>`});
    Kit.on(sh.$('#tmRole'), 'click', '[data-v]', (e, el)=>{ role = el.dataset.v; $$('#tmRole button', sh.el).forEach(b=>b.classList.toggle('is-on', b === el)); sh.$('#tmCar').hidden = role !== 'driver'; haptic('select'); });
    sh.$('#tmSave').addEventListener('click', async ()=>{
      const model = sh.$('#tmModel').value.trim(), plate = sh.$('#tmPlate').value.trim().toUpperCase();
      const car = role === 'driver' && model ? model + (plate ? ' · ' + plate : '') : role === 'driver' ? '' : s.car || '';
      Kit.busy(sh.$('#tmSave'), true);
      const r = await api('saveStaff', {id:s.id, name:s.name, role, phone:s.phone || undefined, car, tgId:s.tgId || '', active:true, hired:role === 'driver' && !!s.hired, carrier:s.carrier || ''});
      Kit.busy(sh.$('#tmSave'), false);
      if(!r.ok){ fail(r); return; }
      haptic('success'); Kit.toast('Сохранено', 'ok'); sh.close();
      if(await load()) render();
    });
    sh.$('#tmDel').addEventListener('click', async ()=>{
      const b = sh.$('#tmDel');
      if(!armed){ armed = true; b.classList.add('is-armed'); b.innerHTML = String(html`${icon('trash')}Точно удалить? Нажмите ещё раз`); haptic('warning'); return; }
      Kit.busy(b, true);
      const r = await api('deleteStaff', {id:s.id});
      Kit.busy(b, false);
      if(!r.ok){ fail(r); return; }
      haptic('success'); Kit.toast('Удалён', 'ok'); sh.close();
      if(await load()) render();
    });
  }

  async function decide(el, p){
    const id = el.closest('[data-s]').dataset.s;
    $$('button', el.closest('[data-s]')).forEach(b=> b.disabled = true);
    const r = await api('decideSignup', Object.assign({tgId:id}, p));
    if(!r.ok){ fail(r); }
    else { haptic('success'); Kit.toast(p.reject ? 'Отказано' : 'Должность назначена', 'ok'); }
    if(await load()) render();
  }

  let bound = false;
  function bind(){
    if(bound) return; bound = true;
    const v = $('#view');
    // слушатели живут на #view; работают, только пока открыт этот экран (есть .team-list)
    Kit.on(v, 'click', '[data-f]', (e, el)=>{ if(!$('.team-list')) return; filter = el.dataset.f; haptic('select'); render(); });
    Kit.on(v, 'click', '.team-card', (e, el)=>{ const s = staff.find(x=>x.id === el.dataset.id); if(s){ haptic('light'); edit(s); } });
    Kit.on(v, 'click', '.team-wait [data-role]', (e, el)=> decide(el, {role:el.dataset.role}));
    Kit.on(v, 'click', '.team-wait [data-no]', (e, el)=> decide(el, {reject:true}));
    Kit.on(v, 'click', '[data-tmback]', ()=>{ haptic('light'); onBack(); });
  }

  async function open(apiFn, meObj, back){
    api = apiFn; me = meObj; onBack = back; bind();
    $('#view').innerHTML = String(html`<div class="empty">${icon('users')}<div class="empty-title">Загружаю сотрудников…</div></div>`);
    if(await load()) render();
  }
  return {open};
})();
