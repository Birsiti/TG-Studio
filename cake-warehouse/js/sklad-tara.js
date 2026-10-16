// изменено 2026-10-17 01:30
/* Вкладка «Ящики»: выдано, вернул и долг по каждому водителю. */
(function(){
  "use strict";
  const {html, icon, $, $$, date: D, num, haptic} = Kit;
  const {api, P, W, L, C, S, T, CATS, byCat, filterRows, nameKey, pcs, fail, stockOf, loadStock} = Cake;

  let TARA = null;
  const KIND = {out:['Выдали', 'var(--danger)'], back:['Вернул', 'var(--ok)'], writeoff:['Списан долг', 'var(--warn)']};
  const S_ = id=> Cake.refs.staff.find(x=>x.id === id) || {name:'?'};
  async function renderTara(){
    const r = await api('getTara');
    if(!r.ok){ fail(r); return; }
    TARA = r;
    const box = r.types.find(t=>t.active) || r.types[0];
    if(!box){ $('#taraStats').innerHTML = ''; $('#taraDrivers').innerHTML = ''; return; }
    $('#taraStats').innerHTML = String(html`
      <div class="stat"><div class="stat-label">На складе</div><div class="stat-value">${num(box.inStock)}</div><div class="stat-delta">из ${num(box.total)}</div></div>
      <div class="stat"><div class="stat-label">У водителей</div><div class="stat-value">${num(box.atDrivers)}</div><div class="stat-delta">долг</div></div>
      <div class="stat"><div class="stat-label">Утеряно</div><div class="stat-value">${num(box.lost)}</div><div class="stat-delta ${box.lost ? 'down' : ''}">списано</div></div>`);
    $('#taraDrivers').innerHTML = r.drivers.length ? String(html`<div class="list">${r.drivers.map(d=>{ const t = d.tara[box.id] || {issued:0, returned:0, debt:0};
      return html`<button class="row" type="button" data-d="${d.id}"><span class="avatar">${Kit.initials(d.name)}</span>
        <span class="row-main"><span class="row-title">${d.name}</span><span class="row-sub">выдано ${num(t.issued)} · вернул ${num(t.returned)}${t.lost ? ' · утерял ' + t.lost : ''}</span></span>
        <span class="row-end"><span class="qty${t.debt > 0 ? ' is-low' : ''}">${num(t.debt)}<span class="qty-unit">долг</span></span></span></button>`; })}</div>`)
      : String(html`<div class="empty">${icon('truck')}<div class="empty-title">Водителей нет</div>Добавьте их в справочнике</div>`);
    $('#taraHist').innerHTML = taraHistHtml(r.history.slice(0, 15));
  }
  function taraHistHtml(list){
    if(!list.length) return String(html`<div class="empty-mini">Движений пока нет</div>`);
    return String(html`<div class="list">${list.map(m=>{ const k = KIND[m.kind] || ['?', 'var(--ink)'];
      return html`<div class="row" style="cursor:default"><span class="row-main"><span class="row-title">${S_(m.driverId).name}</span>
        <span class="row-sub">${D.label(m.date)} · ${k[0]}${m.cityId ? ' · ' + C(m.cityId).name : ''}${m.note ? ' · ' + m.note : ''}</span></span>
        <span class="row-end"><span class="qty" style="color:${k[1]}">${m.qty > 0 ? '+' : '−'}${Math.abs(m.qty)}</span></span></div>`; })}</div>`);
  }
  Kit.on($('#taraDrivers'), 'click', '[data-d]', (e, el)=>{
    const d = TARA.drivers.find(x=>x.id === el.dataset.d); if(!d) return;
    const types = TARA.types.filter(t=>t.active);
    let kind = 'back', tid = types[0] && types[0].id;
    const t = d.tara[tid] || {issued:0, returned:0, lost:0, debt:0};
    const sh = Kit.sheet({title:d.name, sub:d.car || 'Водитель', body: html`
      <div class="stats three">
        <div class="stat"><div class="stat-label">Выдано</div><div class="stat-value">${num(t.issued)}</div></div>
        <div class="stat"><div class="stat-label">Вернул</div><div class="stat-value">${num(t.returned)}</div></div>
        <div class="stat"><div class="stat-label">Долг</div><div class="stat-value" style="color:${t.debt > 0 ? 'var(--danger)' : 'inherit'}">${num(t.debt)}</div></div>
      </div>
      ${t.lost ? html`<p class="hint">Утеряно и списано ранее: ${t.lost}</p>` : ''}
      <div class="eyebrow section" style="margin-bottom:8px">Записать вне рейса</div>
      <div class="seg" id="tKind"><button type="button" data-v="back" class="is-on">Вернул</button><button type="button" data-v="out">Выдали</button><button type="button" data-v="writeoff">Утерял</button></div>
      ${types.length > 1 ? html`<div class="chips section" id="tType">${types.map((x, i)=>html`<button type="button" class="chip${i ? '' : ' is-on'}" data-v="${x.id}">${x.name}</button>`)}</div>` : ''}
      <div class="field-row section"><label class="field"><span class="field-label">Сколько ящиков</span><input class="input" id="tQty" type="number" inputmode="numeric" min="1" value="${t.debt > 0 ? t.debt : ''}"></label>
        <label class="field"><span class="field-label">Комментарий</span><input class="input" id="tNote" maxlength="200"></label></div>
      <p class="hint" id="tHint">Ящики, которые водитель вернул позже, не в день рейса.</p>
      <div class="eyebrow section" style="margin-bottom:4px">История</div>
      <div>${Kit.raw(taraHistHtml(TARA.history.filter(m=>m.driverId === d.id).slice(0, 20)))}</div>`,
      actions: html`<button class="btn btn-primary btn-block" type="button" id="tGo">Записать</button>`});
    const HINT = {back:'Ящики, которые водитель вернул позже, не в день рейса.', out:'Выдали ящики без рейса.', writeoff:'Водитель потерял или сломал ящики — долг списывается, на складе их станет меньше.'};
    Kit.on(sh.$('#tKind'), 'click', '[data-v]', (e2, b)=>{ kind = b.dataset.v; $$('#tKind button', sh.el).forEach(x=>x.classList.toggle('is-on', x === b)); sh.$('#tHint').textContent = HINT[kind]; haptic('select'); });
    if(sh.$('#tType')) Kit.on(sh.$('#tType'), 'click', '[data-v]', (e2, b)=>{ tid = b.dataset.v; $$('#tType .chip', sh.el).forEach(x=>x.classList.toggle('is-on', x === b)); haptic('select'); });
    sh.$('#tGo').addEventListener('click', async ()=>{
      const q = parseInt(sh.$('#tQty').value, 10);
      if(!(q > 0)){ Kit.toast('Укажите количество', 'error'); return; }
      if(kind === 'writeoff' && !await Kit.confirm(`Списать ${q} ящ. как утерянные у ${d.name}?`, 'Списать', true)) return;
      Kit.busy(sh.$('#tGo'), true);
      const r = await api('taraMove', {driverId:d.id, taraId:tid, qty:q, kind, note:sh.$('#tNote').value.trim()});
      Kit.busy(sh.$('#tGo'), false);
      if(!r.ok){ fail(r); return; }
      haptic('success'); sh.close(); Kit.toast(`Записано. Долг: ${r.debt}`, 'ok'); renderTara();
    });
  });

  Cake.tabs.tara = renderTara;
})();
