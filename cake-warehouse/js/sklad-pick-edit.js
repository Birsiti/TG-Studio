// изменено 2026-10-18 13:30
/* Сборка: ввод и правка заявки,
   отгрузка собранного маршрута водителю (черновик рейса). */
(function(){
  "use strict";
  const {html, icon, $, $$, date: D, haptic} = Kit;
  const {api, W, byCat, filterRows, nameKey, fail} = Cake;
  const PK = ()=> Cake.pick;

  function productRows(val, attr, shown = val){
    const act = Cake.refs.products.filter(p=>p.active || val(p.id));  // снятый с продажи торт в заявке не теряем
    return byCat(act, p=>html`<div class="qrow" data-row="${p.id}" data-name="${nameKey(p)}">
      <span class="qrow-name">${Kit.nobr(p.name)}<small>${W(p.weightG)}</small></span>
      <input class="input" type="number" inputmode="numeric" min="0" placeholder="0" ${attr}="${p.id}" value="${shown(p.id) || ''}">
    </div>`);
  }
  const mark = root=> $$('[data-row]', root).forEach(r=> r.classList.toggle('is-on', (parseInt($('input', r).value, 10) || 0) > 0));

  Cake.editOrder = function(o){
    const pk = PK(), qty = {};
    (o ? o.lines : []).forEach(l=> qty[l.productId] = l.qty);
    const bonus = {}; (o ? o.lines : []).forEach(l=>{ if(l.bonus) bonus[l.productId] = l.bonus; });
    const routes = pk.routes.length ? pk.routes : [''];
    const sh = Kit.sheet({title:o ? `Заявка №${o.num}` : 'Новая заявка', sub:'Номер, точка и что везём', body: html`
      <div class="field-row">
        <label class="field"><span class="field-label">№ заявки</span><input class="input" id="eoNum" inputmode="numeric" maxlength="20" value="${o ? o.num : ''}"></label>
        <label class="field"><span class="field-label">Дата</span><input class="input" type="date" id="eoDate" value="${o ? o.date : pk.date || D.today()}"></label>
      </div>
      <label class="field"><span class="field-label">Точка разгрузки</span><select class="select" id="eoPoint">
        ${routes.map(r=>html`<optgroup label="${r || 'Без маршрута'}">${pk.points.filter(p=>p.active && p.route === r).map(p=>html`<option value="${p.id}" ${o && o.pointId === p.id ? 'selected' : ''}>${p.customer} — ${p.address}</option>`)}</optgroup>`)}
      </select></label>
      <label class="field"><span class="field-label">Комментарий</span><input class="input" id="eoComment" maxlength="300" value="${o ? o.comment : ''}" placeholder="Бонусы, время доставки"></label>
      ${Object.keys(bonus).length ? html`<p class="hint">Бонусные строки сохраняются как есть: ${Object.keys(bonus).map(id=>Cake.L(id) + ' +' + bonus[id]).join(', ')}.</p>` : ''}
      ${Cake.files.input('data-eoup')}<p class="hint" id="eoFiles">${o && (o.files || []).length ? `Уже прикреплено: ${o.files.length}` : 'Можно без тортов — только фото заявки, торты внести позже.'}</p>
      <div class="search section"><span>${icon('search')}</span><input class="input" id="eoQ" type="search" placeholder="Найти торт" autocomplete="off"></div>
      <div class="section" id="eoList">${productRows(id=>qty[id] || bonus[id], 'data-eo', id=>qty[id])}</div>`,
      actions: html`${o ? html`<button class="btn btn-danger-soft" type="button" data-del>${icon('trash')}</button>` : ''}<button class="btn btn-primary btn-block" type="button" data-save>${icon('check')}Сохранить</button>`});
    mark(sh.el);
    let pending = [];  // фото выбраны — уйдут на сервер после сохранения заявки
    sh.el.addEventListener('change', async e=>{
      if(!e.target.matches('[data-eoup]')) return;
      pending = pending.concat(await Cake.files.prepare(e.target.files));
      $('#eoFiles', sh.el).textContent = `К загрузке: ${pending.length} ${pending.length === 1 ? 'файл' : 'файла'}`;
    });
    $('#eoList', sh.el).addEventListener('input', ()=> mark(sh.el));
    $('#eoQ', sh.el).addEventListener('input', Kit.debounce(()=> filterRows($('#eoList', sh.el), $('#eoQ', sh.el).value), 100));
    Kit.on(sh.el, 'click', '[data-save]', async (e, el)=>{
      const lines = $$('[data-eo]', sh.el).map(i=>({productId:i.dataset.eo, qty:parseInt(i.value, 10) || 0, bonus:bonus[i.dataset.eo] || 0})).filter(l=>l.qty || l.bonus);
      const num = $('#eoNum', sh.el).value.trim();
      if(!num){ Kit.toast('Укажите номер заявки', 'error'); return; }
      if(!lines.length && !pending.length && !(o && (o.files || []).length)){ Kit.toast('Добавьте торты или фото заявки', 'error'); return; }
      Kit.busy(el, true);
      const r = await api('saveOrder', {id:o ? o.id : undefined, num, date:$('#eoDate', sh.el).value || D.today(), pointId:$('#eoPoint', sh.el).value,
        comment:$('#eoComment', sh.el).value.trim(), lines});
      Kit.busy(el, false);
      if(!r.ok){ fail(r); return; }
      if(pending.length){ Kit.busy(el, true); await Cake.files.upload(r.order.id, pending); Kit.busy(el, false); }
      haptic('success'); Kit.toast(`Заявка №${r.order.num} сохранена`, 'ok'); sh.close();
      pk.date = r.order.date; if(pk.route && pk.route !== r.order.route) pk.route = r.order.route;  // показать сохранённую
      await pk.reload();
    });
    Kit.on(sh.el, 'click', '[data-del]', async ()=>{
      if(!await Kit.confirm(`Удалить заявку №${o.num}?`, 'Удалить', true)) return;
      const r = await api('deleteOrder', {id:o.id});
      if(!r.ok){ fail(r); return; }
      sh.close(); await pk.reload();
    });
  };

  Cake.shipRoute = async function(list){
    const pk = PK(), left = list.filter(o=>o.status !== 'picked');
    if(left.length){ Kit.toast(`Не собраны: №${left.map(o=>o.num).join(', №')}`, 'error'); haptic('warning'); return; }
    const s = await api('getShifts', {from:pk.date, to:pk.date});
    const onShift = (s.ok && s.days[pk.date]) || [];
    const drivers = Cake.refs.staff.filter(x=>x.role === 'driver' && x.active).sort((a, b)=> onShift.includes(b.id) - onShift.includes(a.id));
    const qty = list.reduce((t, o)=>t + o.lines.reduce((q, l)=>q + l.qty + l.bonus, 0), 0), boxes = list.reduce((t, o)=>t + (o.boxes || 0), 0);
    let driverId = '';
    const sh = Kit.sheet({title:`Отгрузка · ${pk.route}`, sub:`${list.length} заявок · ${qty} шт · ящиков ${boxes}`, body: html`
      <p class="hint">Создастся рейс на сборке. Дальше на вкладке «Рейсы» — «Отгрузить»: торты спишутся со склада, ящики запишутся на водителя.</p>
      <div class="eyebrow section" style="margin-bottom:8px">Водитель</div>
      <div class="chips" id="srDrv">${drivers.map(d=>html`<button class="chip" type="button" data-d="${d.id}">${d.name}${onShift.includes(d.id) ? ' · на смене' : ''}</button>`)}</div>`,
      actions: html`<button class="btn btn-primary btn-block" type="button" data-ok>${icon('truck')}Создать рейс</button>`});
    Kit.on(sh.el, 'click', '[data-d]', (e, el)=>{ driverId = driverId === el.dataset.d ? '' : el.dataset.d; $$('[data-d]', sh.el).forEach(b=>b.classList.toggle('is-on', b.dataset.d === driverId)); haptic('select'); });
    Kit.on(sh.el, 'click', '[data-ok]', async (e, el)=>{
      Kit.busy(el, true);
      const r = await api('routeToTrip', Object.assign({date:pk.date, route:pk.route}, driverId ? {driverId} : {}));
      Kit.busy(el, false);
      if(!r.ok){ fail(r); return; }
      haptic('success'); Kit.toast(`Рейс №${r.trip.num} создан — отгрузите на вкладке «Рейсы»`, 'ok'); sh.close();
      await Cake.loadRefs(); await pk.reload();  // маршрут мог впервые стать направлением рейса
    });
  };
})();
