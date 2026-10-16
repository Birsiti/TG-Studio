// изменено 2026-10-17 02:55
/* Сборка: ввод и правка заявки, карта склада (место торта — № по кругу против часовой от двери). */
(function(){
  "use strict";
  const {html, icon, $, $$, date: D, haptic} = Kit;
  const {api, W, byCat, filterRows, nameKey, fail} = Cake;
  const PK = ()=> Cake.pick;

  function productRows(val, attr){
    const act = Cake.refs.products.filter(p=>p.active);
    return byCat(act, p=>html`<div class="qrow" data-row="${p.id}" data-name="${nameKey(p)}">
      <span class="qrow-name">${Kit.nobr(p.name)}<small>${W(p.weightG)}</small></span>
      <input class="input" type="number" inputmode="numeric" min="0" placeholder="0" ${attr}="${p.id}" value="${val(p.id) || ''}">
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
      <div class="search section"><span>${icon('search')}</span><input class="input" id="eoQ" type="search" placeholder="Найти торт" autocomplete="off"></div>
      <div class="section" id="eoList">${productRows(id=>qty[id], 'data-eo')}</div>`,
      actions: html`${o ? html`<button class="btn btn-danger-soft" type="button" data-del>${icon('trash')}</button>` : ''}<button class="btn btn-primary btn-block" type="button" data-save>${icon('check')}Сохранить</button>`});
    mark(sh.el);
    $('#eoList', sh.el).addEventListener('input', ()=> mark(sh.el));
    $('#eoQ', sh.el).addEventListener('input', Kit.debounce(()=> filterRows($('#eoList', sh.el), $('#eoQ', sh.el).value), 100));
    Kit.on(sh.el, 'click', '[data-save]', async (e, el)=>{
      const lines = $$('[data-eo]', sh.el).map(i=>({productId:i.dataset.eo, qty:parseInt(i.value, 10) || 0, bonus:bonus[i.dataset.eo] || 0})).filter(l=>l.qty || l.bonus);
      const num = $('#eoNum', sh.el).value.trim();
      if(!num){ Kit.toast('Укажите номер заявки', 'error'); return; }
      if(!lines.length){ Kit.toast('Добавьте торты', 'error'); return; }
      Kit.busy(el, true);
      const r = await api('saveOrder', {id:o ? o.id : undefined, num, date:$('#eoDate', sh.el).value || D.today(), pointId:$('#eoPoint', sh.el).value,
        comment:$('#eoComment', sh.el).value.trim(), lines});
      Kit.busy(el, false);
      if(!r.ok){ fail(r); return; }
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

  Cake.editPlaces = function(){
    const pk = PK();
    const sh = Kit.sheet({title:'Места на складе', sub:'Встаньте у двери и идите против часовой: первое место — 1, дальше 2, 3… Несколько тортов на одном месте — один номер', body: html`
      <div class="search"><span>${icon('search')}</span><input class="input" id="epQ" type="search" placeholder="Найти торт" autocomplete="off"></div>
      <div class="section" id="epList">${productRows(id=>pk.places[id], 'data-ep')}</div>`,
      actions: html`<button class="btn btn-primary btn-block" type="button" data-save>${icon('check')}Сохранить места</button>`});
    mark(sh.el);
    $('#epList', sh.el).addEventListener('input', ()=> mark(sh.el));
    $('#epQ', sh.el).addEventListener('input', Kit.debounce(()=> filterRows($('#epList', sh.el), $('#epQ', sh.el).value), 100));
    Kit.on(sh.el, 'click', '[data-save]', async (e, el)=>{
      // отправляем только изменённые — карта может быть большой
      const places = $$('[data-ep]', sh.el).map(i=>({productId:i.dataset.ep, place:parseInt(i.value, 10) || 0}))
        .filter(x=> x.place !== (pk.places[x.productId] || 0));
      if(!places.length){ sh.close(); return; }
      Kit.busy(el, true); const r = await api('savePlaces', {places}); Kit.busy(el, false);
      if(!r.ok){ fail(r); return; }
      pk.places = r.places; haptic('success'); Kit.toast(`Сохранено мест: ${r.saved}`, 'ok'); sh.close(); await pk.reload();
    });
  };
})();
