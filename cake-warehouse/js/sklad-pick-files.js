// изменено 2026-10-17 16:20
/* Сборка: фото и файлы заявки (снимок бумажной заявки, PDF). Фото сжимаем в телефоне до 1600 px —
   быстро уходит по мобильному интернету и помещается в демо-режиме. */
(function(){
  "use strict";
  const {html, icon, $, haptic} = Kit;
  const {api, fail} = Cake;
  const MAX_SIDE = 1600, MAX_FILE = 3 * 1024 * 1024;
  const cache = {};  // id → data URL, чтобы не тянуть фото повторно

  const readAs = (file, how)=> new Promise((ok, no)=>{ const r = new FileReader(); r.onload = ()=> ok(r.result); r.onerror = no; r[how](file); });
  async function shrink(file){
    const url = await readAs(file, 'readAsDataURL');
    const img = await new Promise((ok, no)=>{ const i = new Image(); i.onload = ()=> ok(i); i.onerror = no; i.src = url; });
    const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.75);
  }
  // Файлы из <input type=file> → [{name, mime, data(base64)}]
  async function prepare(list){
    const out = [];
    for(const f of Array.from(list || [])){
      if(f.type === 'application/pdf'){
        if(f.size > MAX_FILE){ Kit.toast(`${f.name}: больше 3 МБ`, 'error'); continue; }
        out.push({name:f.name, mime:f.type, data:String(await readAs(f, 'readAsDataURL')).split(',')[1]});
      } else if(/^image\//.test(f.type)){
        out.push({name:f.name.replace(/\.\w+$/, '') + '.jpg', mime:'image/jpeg', data:(await shrink(f)).split(',')[1]});
      } else Kit.toast(`${f.name}: можно фото или PDF`, 'error');
    }
    return out;
  }
  async function upload(orderId, files){
    let n = 0;
    for(const f of files){ const r = await api('addOrderFile', Object.assign({orderId}, f)); if(!r.ok){ fail(r); break; } n++; }
    return n;
  }

  const input = attr=> html`<label class="btn btn-ghost btn-block section">${icon('plus')}Фото или файл заявки
    <input type="file" accept="image/*,application/pdf" multiple hidden ${attr}></label>`;
  const gallery = o=> (o.files || []).length ? html`<div class="pick-files section">${o.files.map(f=>html`<button class="pick-file" type="button" data-file="${f.id}">
      ${/^image\//.test(f.mime) ? html`<img alt="" data-img="${f.id}">` : html`<span class="pick-file-doc">${icon('receipt')}PDF</span>`}</button>`)}</div>` : '';

  // Подгрузить картинки галереи внутри root
  async function fill(root){
    for(const el of root.querySelectorAll('[data-img]')){
      const id = el.dataset.img;
      if(!cache[id]){ const r = await api('getOrderFile', {id}); if(!r.ok) continue; cache[id] = `data:${r.file.mime};base64,${r.file.data}`; }
      el.src = cache[id];
    }
  }
  // Открыть файл: фото — на весь экран в шторке, PDF — в новой вкладке
  async function open(id, onDelete){
    const r = cache[id] ? {ok:true, file:{mime:cache[id].slice(5, cache[id].indexOf(';')), data:cache[id].split(',')[1]}} : await api('getOrderFile', {id});
    if(!r.ok){ fail(r); return; }
    const url = `data:${r.file.mime};base64,${r.file.data}`;
    if(r.file.mime === 'application/pdf'){
      const bin = atob(r.file.data), buf = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      window.open(URL.createObjectURL(new Blob([buf], {type:'application/pdf'})), '_blank');
      return;
    }
    const sh = Kit.sheet({title:'Фото заявки', body: html`<img class="pick-photo" alt="" src="${url}">`,
      actions: onDelete ? html`<button class="btn btn-danger-soft btn-block" type="button" data-del>${icon('trash')}Удалить фото</button>` : ''});
    const d = sh.$('[data-del]');
    if(d) d.addEventListener('click', async ()=>{
      if(!await Kit.confirm('Удалить это фото из заявки?', 'Удалить', true)) return;
      const x = await api('deleteOrderFile', {id}); if(!x.ok){ fail(x); return; }
      delete cache[id]; haptic('success'); sh.close(); onDelete();
    });
  }

  Cake.files = {prepare, upload, input, gallery, fill, open};
})();
