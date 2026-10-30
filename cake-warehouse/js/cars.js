// изменено 2026-10-26 10:20
/* «Машины» — экран руководителя на главной: парк, кто за рулём (можно сменить), статистика по машине.
   Данные: getCars, saveCar, getRefs (водители, торты, города), getTrips (статистика — по рейсам с этой машиной). */
window.CakeCars = (function(){
  "use strict";
  const {html, icon, $, $$, date: D, num, haptic} = Kit;
  const fail = r=>{ Kit.toast(r.message || (r.error === 'forbidden' ? 'Нет доступа' : 'Не получилось'), 'error'); haptic('error'); };
  const split = car=>{ const [model, plate] = String(car || '').split(' · '); return {model:(model || '').trim(), plate:(plate || '').trim()}; };
  const DONE = /shipped|reported|closed/;
  const STATUS = {draft:'на сборке', shipped:'в пути', reported:'сдан отчёт', closed:'принят'};
  let api, onBack, cars = [], drivers = [], trips = [], prod = {}, cities = {};

  const kgOf = t=> (t.lines || []).reduce((s, l)=> s + (l.qty + (l.bonus || 0)) * ((prod[l.productId] || {}).weightG || 0), 0) / 1000;
  const pcsOf = t=> (t.lines || []).reduce((s, l)=> s + l.qty + (l.bonus || 0), 0);
  const kg = n=> num(Math.round(n)) + ' кг';
  const metres = mm=> String(mm / 1000).replace('.', ',');
  const bodyOf = c=> c.bodyL && c.bodyW ? `кузов ${metres(c.bodyL)} × ${metres(c.bodyW)} м` : 'кузов не задан';

  async function load(){
    const from = D.add(D.today(), -180), to = D.add(D.today(), 30);
    const [c, r, t] = await Promise.all([api('getCars'), api('getRefs'), api('getTrips', {from, to})]);
    if(!c.ok){ fail(c); return false; }
    if(!r.ok){ fail(r); return false; }
    cars = c.cars;
    drivers = r.staff.filter(s=>s.role === 'driver' && s.active).sort((a, b)=> a.name.localeCompare(b.name, 'ru'));
    prod = {}; r.products.forEach(p=> prod[p.id] = p);
    cities = {}; r.cities.forEach(x=> cities[x.id] = x);
    trips = t.ok ? t.trips : [];
    return true;
  }

  // Рейсы этой машины (без отменённых и сборки) и сводка
  const tripsOf = car=> trips.filter(t=> t.car === car && t.status !== 'cancelled');
  function sum(list){
    const done = list.filter(t=> DONE.test(t.status));
    return {trips:done.length, kg:done.reduce((s, t)=>s + kgOf(t), 0), pcs:done.reduce((s, t)=>s + pcsOf(t), 0), points:done.reduce((s, t)=>s + (t.stops || []).length, 0)};
  }

  const card = c=>{
    const m = split(c.car), s = sum(tripsOf(c.car));
    return html`<button class="team-card" type="button" data-car="${c.car}">
      <span class="team-ava car-ava">${icon('truck')}</span>
      <span class="team-main"><span class="team-name">${m.model || c.car}</span>
        ${m.plate ? html`<span class="team-line mono">${m.plate}</span>` : ''}
        ${c.busy ? html`<span class="role-chip r-driver">в рейсе №${c.busy}</span>` : html`<span class="role-chip r-storekeeper">свободна</span>`}
        <span class="team-line ${c.driverName ? '' : 'is-none'}">${c.driverName ? 'За рулём: ' + c.driverName : 'водитель не назначен'}</span>
        <span class="team-line ${c.bodyL ? '' : 'is-none'}">${bodyOf(c)}</span>
        <span class="team-line">${s.trips ? `${s.trips} ${s.trips === 1 ? 'рейс' : 'рейсов'} · ${kg(s.kg)}` : 'рейсов пока не было'}</span></span>
      ${icon('right', 'row-chev')}</button>`;
  };

  function render(){
    $('#view').innerHTML = String(html`
      <div class="page-head"><h1 class="page-title">Машины</h1><p class="page-sub">${cars.length} ${cars.length === 1 ? 'машина' : 'машин'} · нажмите на карточку: водитель и статистика</p></div>
      <button class="btn btn-primary btn-block" type="button" id="crAdd">${icon('plus')}Добавить машину</button>
      <div class="team-list section">${cars.length ? cars.map(card) : html`<div class="empty">${icon('truck')}<div class="empty-title">Парк пуст</div>Добавьте машину или закрепите её за водителем в «Сотрудниках».</div>`}</div>
      <button class="back-row" type="button" data-crback="1">${icon('left')}Сотрудникам</button>`);
    window.scrollTo(0, 0);
  }

  async function save(car, driverId){
    const r = await api('saveCar', {car, driverId});
    if(!r.ok){ fail(r); return false; }
    haptic('success');
    return true;
  }

  // Выбор водителя: сменить или снять
  function pickDriver(c, after){
    const sh = Kit.sheet({title:'Кто за рулём', sub:split(c.car).model + (split(c.car).plate ? ' · ' + split(c.car).plate : ''), body: html`
      <div class="list" id="cdList">
        ${drivers.map(d=>{
          const has = d.car && d.car !== c.car;
          return html`<button class="row crew-row${d.id === c.driverId ? ' is-on' : ''}" type="button" data-d="${d.id}">
            <span class="avatar">${Kit.initials(d.name)}</span>
            <span class="row-main"><span class="row-title">${d.name}</span>
              <span class="row-sub">${has ? 'сейчас на ' + d.car + ' — та останется без водителя' : d.car === c.car ? 'за рулём сейчас' : 'машина не закреплена'}</span></span>
            <span class="crew-tick">${icon('check')}</span></button>`; })}
        ${c.driverId ? html`<button class="row" type="button" data-d=""><span class="avatar">${icon('x')}</span><span class="row-main"><span class="row-title">Без водителя</span></span></button>` : ''}
      </div>
      <p class="hint section">Рейсы одного водителя на разных машинах можно, но в пути он только в одном.</p>`});
    Kit.on(sh.el, 'click', '[data-d]', async (e, el)=>{
      if(el.dataset.d === (c.driverId || '')) { sh.close(); return; }
      Kit.busy(el, true);
      const ok = await save(c.car, el.dataset.d);
      Kit.busy(el, false);
      if(!ok) return;
      Kit.toast(el.dataset.d ? 'Водитель сменён' : 'Водитель снят', 'ok'); sh.close(); after();
    });
  }

  function openCar(c){
    const list = tripsOf(c.car), m = split(c.car);
    const all = sum(list), month = sum(list.filter(t=> t.date >= D.add(D.today(), -29)));
    const who = {}; list.filter(t=> DONE.test(t.status) && t.driverId).forEach(t=>{ who[t.driverId] = (who[t.driverId] || 0) + 1; });
    const whoList = Object.keys(who).map(id=>({name:(drivers.find(d=>d.id === id) || {name:'?'}).name, n:who[id]})).sort((a, b)=> b.n - a.n);
    const last = list.slice().sort((a, b)=> a.date < b.date ? 1 : a.date > b.date ? -1 : b.num - a.num).slice(0, 6);
    const stat = (label, v, sub)=> html`<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${v}</div><div class="stat-delta">${sub}</div></div>`;
    const sh = Kit.sheet({title:m.model || c.car, sub:m.plate || '', body: html`
      <div class="eyebrow" style="margin-bottom:8px">За рулём</div>
      <div class="car-driver">
        <span class="avatar">${c.driverName ? Kit.initials(c.driverName) : icon('user')}</span>
        <span class="row-main"><span class="row-title">${c.driverName || 'Водитель не назначен'}</span>
          <span class="row-sub">${c.busy ? 'сейчас в рейсе №' + c.busy : 'машина свободна'}</span></span>
      </div>
      <button class="btn btn-ghost btn-block section" type="button" id="crChange">${icon('users')}${c.driverName ? 'Сменить водителя' : 'Назначить водителя'}</button>
      <div class="eyebrow section" style="margin-bottom:8px">Кузов внутри, м · для погрузки</div>
      <div class="car-body">
        <label class="field"><span class="field-label">Длина</span><input class="input" id="crBL" inputmode="decimal" value="${c.bodyL ? metres(c.bodyL) : ''}" placeholder="5"></label>
        <label class="field"><span class="field-label">Ширина</span><input class="input" id="crBW" inputmode="decimal" value="${c.bodyW ? metres(c.bodyW) : ''}" placeholder="2,1"></label>
      </div>
      <button class="btn btn-ghost btn-block" type="button" id="crBody">Сохранить кузов</button>
      <div class="eyebrow section" style="margin-bottom:8px">Статистика · 30 дней</div>
      <div class="stats">${stat('Рейсов', num(month.trips), `всего ${num(all.trips)}`)}${stat('Вес', kg(month.kg), `всего ${kg(all.kg)}`)}${stat('Тортов', num(month.pcs), 'шт')}${stat('Точек', num(month.points), 'разгрузок')}</div>
      ${whoList.length ? html`<div class="eyebrow section" style="margin-bottom:8px">Кто ездил на ней</div><div class="list">${whoList.map(w=>html`<div class="row"><span class="avatar">${Kit.initials(w.name)}</span><span class="row-main"><span class="row-title">${w.name}</span></span><span class="hint">${w.n} ${w.n === 1 ? 'рейс' : 'рейсов'}</span></div>`)}</div>` : ''}
      <div class="eyebrow section" style="margin-bottom:8px">Последние рейсы</div>
      ${last.length ? html`<div class="list">${last.map(t=>{ const dn = (drivers.find(d=>d.id === t.driverId) || {}).name; return html`<div class="row"><span class="row-main"><span class="row-title">№${t.num} · ${(cities[t.cityId] || {}).name || '—'}</span><span class="row-sub">${D.label(t.date)} · ${dn || 'без водителя'} · ${STATUS[t.status] || t.status}</span></span><span class="hint">${kg(kgOf(t))}</span></div>`; })}</div>` : html`<p class="hint">На этой машине рейсов пока не было.</p>`}`});
    sh.$('#crBody').addEventListener('click', async ()=>{
      const mm = id=>{ const v = parseFloat(sh.$(id).value.replace(',', '.')); return v > 0 ? Math.round(v * 1000) : 0; };
      const L = mm('#crBL'), W = mm('#crBW');
      if((L && L < 1000) || (W && W < 1000) || L > 20000 || W > 4000){ Kit.toast('Размеры в метрах, например 5 и 2,1', 'error'); return; }
      Kit.busy(sh.$('#crBody'), true);
      const r = await api('saveCar', {car:c.car, bodyL:L, bodyW:W});
      Kit.busy(sh.$('#crBody'), false);
      if(!r.ok){ fail(r); return; }
      haptic('success'); Kit.toast('Кузов сохранён', 'ok'); sh.close();
      if(await load()) render();
    });
    sh.$('#crChange').addEventListener('click', ()=>{ haptic('light'); sh.close(); pickDriver(c, async ()=>{ if(await load()) render(); }); });
  }

  function addCar(){
    let did = '';
    const sh = Kit.sheet({title:'Новая машина', sub:'Марка и госномер — водителю она подставится в рейсе сама', body: html`
      <label class="field"><span class="field-label">Марка машины</span><input class="input" id="caModel" maxlength="40" placeholder="Iveco Daily"></label>
      <label class="field section"><span class="field-label">Госномер</span><input class="input mono" id="caPlate" maxlength="16" placeholder="4521 AB-7" autocapitalize="characters"></label>
      <div class="eyebrow section" style="margin-bottom:8px">Водитель (можно позже)</div>
      <div class="list" id="caDrv">${drivers.map(d=>html`<button class="row crew-row" type="button" data-d="${d.id}"><span class="avatar">${Kit.initials(d.name)}</span><span class="row-main"><span class="row-title">${d.name}</span><span class="row-sub">${d.car ? 'сейчас на ' + d.car : 'машина не закреплена'}</span></span><span class="crew-tick">${icon('check')}</span></button>`)}</div>`,
      actions: html`<button class="btn btn-primary btn-block" type="button" id="caSave">Добавить</button>`});
    Kit.on(sh.$('#caDrv'), 'click', '[data-d]', (e, el)=>{ did = did === el.dataset.d ? '' : el.dataset.d; $$('#caDrv .crew-row', sh.el).forEach(b=>b.classList.toggle('is-on', b.dataset.d === did)); haptic('select'); });
    sh.$('#caSave').addEventListener('click', async ()=>{
      const model = sh.$('#caModel').value.trim(), plate = sh.$('#caPlate').value.trim().toUpperCase();
      if(model.length < 2){ Kit.toast('Укажите марку', 'error'); return; }
      const car = model + (plate ? ' · ' + plate : '');
      Kit.busy(sh.$('#caSave'), true);
      const ok = await save(car, did);
      Kit.busy(sh.$('#caSave'), false);
      if(!ok) return;
      Kit.toast('Машина добавлена', 'ok'); sh.close();
      if(await load()) render();
    });
  }

  let bound = false;
  function bind(){
    if(bound) return; bound = true;
    const v = $('#view');
    Kit.on(v, 'click', '[data-car]', (e, el)=>{ const c = cars.find(x=>x.car === el.dataset.car); if(c){ haptic('light'); openCar(c); } });
    Kit.on(v, 'click', '#crAdd', ()=>{ haptic('light'); addCar(); });
    Kit.on(v, 'click', '[data-crback]', ()=>{ haptic('light'); onBack(); });
  }

  async function open(apiFn, back){
    api = apiFn; onBack = back; bind();
    $('#view').innerHTML = String(html`<div class="empty">${icon('truck')}<div class="empty-title">Загружаю машины…</div></div>`);
    if(await load()) render();
  }
  return {open};
})();
