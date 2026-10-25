// изменено 2026-10-25 21:40
/* Кого посадить в рейс: водитель с подсказками («ездил на этом маршруте», «на смене», «занят») и машина
   (по умолчанию последняя водителя, можно заменить из парка или вписать). Общий для логиста, кладовщика и руководителя. */
window.CakeCrew = (function(){
  "use strict";
  const {html, icon, $, $$, date: D, haptic} = Kit;
  const {api, C, fail} = Cake;

  /* opts: {date, cityId, tripId, driverId, car, lockDriver, title, sub, button}; onPick({driverId, car}) → ответ API (ok) */
  async function pick(opts, onPick){
    const r = await api('getCrew', {date:opts.date, cityId:opts.cityId || undefined, tripId:opts.tripId || undefined});
    if(!r.ok){ fail(r); return; }
    let drivers = r.drivers.slice().sort((a, b)=> b.onShift - a.onShift || b.onRoute - a.onRoute || (b.lastOnRoute || '').localeCompare(a.lastOnRoute || '') || a.name.localeCompare(b.name, 'ru'));
    const top = drivers.reduce((m, d)=> d.onRoute > (m ? m.onRoute : 0) ? d : m, null);
    const st = {driverId:opts.driverId || '', car:opts.car || '', touched:!!opts.car};
    const byId = id=> drivers.find(d=>d.id === id);
    const hint = d=>{
      const bits = [];
      if(d.onRoute) bits.push(`ездил на маршруте ${d.onRoute} ${d.onRoute === 1 ? 'раз' : d.onRoute < 5 ? 'раза' : 'раз'} · последний ${D.label(d.lastOnRoute)}`);
      else bits.push(opts.cityId ? 'на этом маршруте не ездил' : '');
      if(d.lastDate) bits.push(`последний рейс ${D.label(d.lastDate)}`);
      return bits.filter(Boolean).join(' · ');
    };
    const rowD = d=> html`<button class="row crew-row${st.driverId === d.id ? ' is-on' : ''}" type="button" data-d="${d.id}"${opts.lockDriver && st.driverId !== d.id ? Kit.raw(' disabled') : ''}>
      <span class="avatar">${Kit.initials(d.name)}</span>
      <span class="row-main"><span class="row-title">${d.name}${d.hired ? html` <span class="hint">наёмный</span>` : ''}</span>
        <span class="crew-tags">${top && top.id === d.id ? html`<span class="role-chip r-manager">чаще всех на маршруте</span>` : ''}${d.onShift ? html`<span class="role-chip r-storekeeper">на смене</span>` : ''}${d.inTransit ? html`<span class="role-chip r-danger">в пути · рейс №${d.inTransit}</span>` : ''}${d.busy.length ? html`<span class="role-chip r-driver">рейс №${d.busy.join(', №')} в этот день</span>` : ''}</span>
        <span class="row-sub">${hint(d)}</span>
        <span class="row-sub">${d.carDefault ? 'машина: ' + d.carDefault : 'машина не закреплена'}</span></span>
      <span class="crew-tick">${icon('check')}</span></button>`;
    const cars = ()=> {
      const list = r.cars.map(c=>c.car);
      if(st.car && !list.includes(st.car)) list.unshift(st.car);
      return list;
    };
    const sh = Kit.sheet({title:opts.title || 'Водитель и машина', sub:opts.sub || '', body: html`
      <div class="eyebrow" style="margin-bottom:8px">Водитель${opts.lockDriver ? ' · после отгрузки не меняется' : ''}</div>
      <div class="list" id="cwDrv"></div>
      <p class="hint" style="margin:8px 0 0">Один водитель не едет в двух рейсах сразу: пока он в пути, второй рейс не отгрузить. Рейсы на разных машинах собирать можно.</p>
      <div class="eyebrow section" style="margin-bottom:8px">Машина</div>
      <p class="hint" id="cwAuto" style="margin:0 0 8px"></p>
      <div class="chips" id="cwCars"></div>
      <label class="field section"><span class="field-label">Другая машина — марка и госномер</span><input class="input" id="cwOwn" maxlength="80" placeholder="Iveco Daily · 4521 AB-7"></label>`,
      actions: html`<button class="btn btn-primary btn-block" type="button" id="cwGo">${icon('check')}${opts.button || 'Сохранить'}</button>`});
    const draw = ()=>{
      sh.$('#cwDrv').innerHTML = String(html`${drivers.map(rowD)}`);
      const d = byId(st.driverId);
      sh.$('#cwAuto').textContent = !d ? 'Выберите водителя — машина подставится сама.' : st.car === d.carDefault && d.carDefault ? `Подставлена последняя машина ${d.name.split(' ')[0]}. Можно заменить.` : st.car ? 'Машина заменена вручную.' : 'У водителя нет машины — выберите из парка или впишите.';
      sh.$('#cwCars').innerHTML = String(html`${cars().map(c=>html`<button type="button" class="chip${st.car === c ? ' is-on' : ''}" data-c="${c}">${c}</button>`)}`);
    };
    draw();
    Kit.on(sh.el, 'click', '[data-d]', (e, el)=>{
      if(opts.lockDriver) return;
      st.driverId = st.driverId === el.dataset.d ? '' : el.dataset.d; haptic('select');
      if(!st.touched){ const d = byId(st.driverId); st.car = d ? d.carDefault : ''; }  // водитель сменился — его последняя машина, пока вручную не трогали
      sh.$('#cwOwn').value = ''; draw();
    });
    Kit.on(sh.el, 'click', '[data-c]', (e, el)=>{ st.car = st.car === el.dataset.c ? '' : el.dataset.c; st.touched = true; sh.$('#cwOwn').value = ''; haptic('select'); draw(); });
    sh.$('#cwOwn').addEventListener('input', e=>{ st.car = e.target.value.trim(); st.touched = true; $$('#cwCars .chip', sh.el).forEach(b=>b.classList.toggle('is-on', b.dataset.c === st.car)); });
    sh.$('#cwGo').addEventListener('click', async ()=>{
      Kit.busy(sh.$('#cwGo'), true);
      const res = await onPick({driverId:st.driverId, car:st.car});
      Kit.busy(sh.$('#cwGo'), false);
      if(res && res.ok === false){ fail(res); return; }
      haptic('success'); sh.close();
    });
  }

  // Сменить водителя и машину у существующего рейса
  function editTrip(t, done){
    const c = C(t.cityId);
    return pick({date:t.date, cityId:t.cityId, tripId:t.id, driverId:t.driverId || '', car:t.car || '', lockDriver:t.status !== 'draft',
      title:`Рейс №${t.num} · ${c.name}`, sub:`${D.label(t.date)} · кто едет и на чём`},
      async v=>{
        const p = {id:t.id, car:v.car};
        if(t.status === 'draft') p.driverId = v.driverId;
        const r = await api('setTripCrew', p);
        if(r.ok){ Kit.toast('Водитель и машина сохранены', 'ok'); if(done) done(r.trip); }
        return r;
      });
  }
  return {pick, editTrip};
})();
