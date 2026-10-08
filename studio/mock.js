// изменено 2026-10-08 03:22
/* ============================================================
   studio/mock.js — двойник api/bots/studio.py в браузере.
   Работает, когда api.tg-studio.xyz недоступен.
   Заявка в демо-режиме уходит напрямую на воркер уведомлений
   (как order-bot делал раньше), чтобы лиды не терялись.
   Аутрич — на демо-данных в localStorage.
   ============================================================ */
window.StudioMock = (function(){
  "use strict";
  const KEY = 'tgs-mock-studio-v1';
  const WORKER = 'https://tg-studio-leads.birsiti.workers.dev';
  const D = Kit.date;
  const BUDGETS = ['До 500 BYN', '500–1500 BYN', '1500+ BYN', 'Обсудим', 'не выбран'];
  const NICHES = {
    'Автомойки':[['Мойка','Автомойка','Детейлинг','Автоспа'], ['Блеск','Аква','Капля','Пена','Самурай','Люкс','Фонтан','Чистюля','Профи'], 260],
    'Барбершопы':[['Барбершоп','Барбер','Мужская парикмахерская'], ['Бритва','Борода','Ножницы','Джентльмен','Олд Скул','Топор','Фигаро','Усы','Лезвие'], 300],
    'Кафе и кофейни':[['Кафе','Кофейня','Кофе-бар','Бистро'], ['Мост','Зерно','Корица','Бублик','Тмин','Рогалик','Лагом','Март','Эспрессо'], 380],
    'Прокат инструмента':[['Прокат','Аренда инструмента'], ['Перфоратор','Мастер','Стройка','Домкрат','Шуруп'], 140],
    'Перевозки':[['Перевозки','Маршрутки','Трансфер'], ['Верста','Магистраль','Путь','Дорога','Экспресс'], 120],
    'Салоны красоты':[['Салон','Студия красоты','Ногтевая студия'], ['Шарм','Аура','Мята','Лаванда','Бархат','Пион','Муза','Ирис'], 340]
  };
  const DISTRICTS = ['Уручье','Немига','Каменная Горка','Малиновка','Серебрянка','Зелёный Луг','Сухарево','Лошица','Чижовка','Восток'];
  const CITIES = ['Минск','Минск','Минск','Гомель','Брест','Гродно','Витебск','Могилёв'];
  const DOMAINS = ['gmail.com','mail.ru','yandex.by','tut.by'];
  const TR = {а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
  const slug = s=> s.toLowerCase().split('').map(c=>TR[c] != null ? TR[c] : c).join('').replace(/[^a-z0-9]/g, '');
  const SEED_LEADS = [
    [-19, 'Андрей', '+375291234501', 'Автомойка, 3 поста', 'Онлайн-запись на мойку и напоминания клиентам', '500–1500 BYN', 'won'],
    [-15, 'Ольга', '+375447778812', 'Салон красоты', 'Запись к мастерам, чтобы администратор не сидел на телефоне', '500–1500 BYN', 'contacted'],
    [-11, 'Дмитрий', '+375336541122', 'Кофейня у метро', 'Предзаказ кофе с самовывозом', 'До 500 BYN', 'won'],
    [-8, 'Сергей', '+375295550033', 'Прокат инструмента', 'Каталог и бронь инструмента по датам', '1500+ BYN', 'contacted'],
    [-5, 'Наталья', '+375257001144', 'Маршрутные перевозки', 'Продажа мест и рассадка в маршрутках', 'Обсудим', 'lost'],
    [-3, 'Игорь', '+375296667788', 'Барбершоп', 'Запись к барберам и программа лояльности', '500–1500 BYN', 'new'],
    [-1, 'Виктория', '+375441112299', 'Доставка цветов', 'Каталог букетов и оплата в Telegram', 'не выбран', 'new'],
    [0, 'Павел', '+375293334455', 'Шиномонтаж', 'Сезонная запись на шиномонтаж', 'До 500 BYN', 'new']
  ];
  let S = null;
  function rnd(seed){ let s = seed >>> 0; return ()=>{ s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  const pick = (r, a)=> a[Math.floor(r() * a.length)];
  const iso = d=> new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  function outcome(r){ const x = r(); return x < .04 ? 'bounced' : x < .10 ? 'replied' : 'sent'; }
  function sendMany(r, day, stamps){
    const q = S.companies.filter(c=>c.status === 'queued').slice(0, stamps.length);
    q.forEach((c, i)=>{ const st = outcome(r), ts = iso(stamps[i]); S.sends.push({cid:c.id, ts, date:day, status:st === 'bounced' ? 'bounced' : 'sent'}); c.status = st; c.sentAt = ts; });
  }
  function stamps(r, day, n){ const b = D.parse(day); const out = []; for(let i = 0; i < n; i++){ const t = new Date(b); t.setHours(9, 0, 0, 0); t.setSeconds(Math.floor(r() * 9 * 3600)); out.push(t); } return out.sort((a, b)=>a - b); }
  function init(){
    try{ S = JSON.parse(localStorage.getItem(KEY) || 'null'); }catch(e){}
    if(S && S.v === 1) return tick();
    const r = rnd(11), used = {};
    S = {v:1, cfg:{paused:false, dailyLimit:40}, companies:[], sends:[], leads:[]};
    Object.keys(NICHES).forEach(niche=>{
      const [kinds, names, count] = NICHES[niche];
      for(let i = 0; i < count; i++){
        const kind = pick(r, kinds), nm = pick(r, names), city = pick(r, CITIES);
        const base = kind + ' «' + nm + '»' + (city !== 'Минск' ? ' · ' + city : '');
        let title = base, k = 2;
        while(used[title]){ title = city === 'Минск' && k < 6 ? base + ' · ' + pick(r, DISTRICTS) : base + ' · филиал ' + k; k++; }
        used[title] = 1;
        S.companies.push({id:'c-' + S.companies.length, company:title, email:slug(nm) + (r() < .5 ? '' : Math.floor(r() * 98 + 1)) + '.' + slug(city).slice(0, 5) + '@' + pick(r, DOMAINS), niche, city, status:'queued', sentAt:null});
      }
    });
    for(let i = S.companies.length - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); [S.companies[i], S.companies[j]] = [S.companies[j], S.companies[i]]; }
    const today = D.today();
    for(let off = -30; off < 0; off++){ const day = D.add(today, off); if(D.parse(day).getDay() === 0) continue; sendMany(r, day, stamps(r, day, 28 + Math.floor(r() * 13))); }
    const now = new Date();
    SEED_LEADS.forEach(([off, name, phone, business, task, budget, status], i)=>{
      let t = new Date(D.parse(D.add(today, off))); t.setHours(10, 0, 0, 0); t = new Date(+t + (Math.floor(r() * 480) - 60) * 60000);
      if(t > now) t = new Date(+now - (5 + i * 7) * 60000);
      S.leads.push({id:'L-' + (1000 + i), createdAt:iso(t), name, phone, business, task, budget, tgId:'', status, note:'', forwarded:true});
    });
    tick();
  }
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }
  function tick(){
    const now = new Date(), today = D.today();
    if(S.cfg.paused || now.getDay() === 0) return save();
    const h = now.getHours() + now.getMinutes() / 60, frac = Math.min(1, Math.max(0, (h - 9) / 9));
    const target = Math.floor(S.cfg.dailyLimit * frac * .85), done = S.sends.filter(s=>s.date === today).length;
    if(target > done){
      const r = rnd(+now), last = S.sends.filter(s=>s.date === today).map(s=>s.ts).sort().pop();
      const start = last ? new Date(last) : (()=>{ const t = new Date(); t.setHours(9, 0, 0, 0); return t; })();
      const span = Math.max(60, (now - start) / 1000), st = [];
      for(let i = 0; i < target - done; i++) st.push(new Date(+start + Math.floor(r() * span) * 1000));
      sendMany(r, today, st.sort((a, b)=>a - b));
    }
    save();
  }
  const ok = x=> Object.assign({ok:true}, x || {});
  const err = (code, message)=> ({ok:false, error:code, message});
  const H = {
    createLead(p){
      if(!p.name || p.name.trim().length < 2 || !/^\+375\d{9}$/.test(p.phone || '') || !p.task || p.task.trim().length < 5) return err('bad_request');
      const budget = BUDGETS.indexOf(p.budget) > -1 ? p.budget : 'не выбран';
      const body = {name:p.name.trim(), phone:p.phone, business:(p.business || '').trim(), task:p.task.trim(), budget, tg_id:p.tg_id || ''};
      return fetch(WORKER, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)})
        .then(r=>r.json().then(d=>({r, d})))
        .then(({r, d})=>{
          if(!r.ok || !d.ok) return err('send_failed');
          const lead = Object.assign({id:'L-' + Date.now().toString(36).toUpperCase(), createdAt:iso(new Date()), tgId:body.tg_id, status:'new', note:'', forwarded:true}, body);
          delete lead.tg_id; S.leads.unshift(lead); save();
          return ok({id:lead.id});
        })
        .catch(()=> err('send_failed'));
    },
    getLeads(p){
      const st = p.status && p.status !== 'all' ? p.status : null, counts = {new:0, contacted:0, won:0, lost:0};
      S.leads.forEach(l=>counts[l.status]++);
      return ok({leads:S.leads.filter(l=>!st || l.status === st).sort((a, b)=>b.createdAt.localeCompare(a.createdAt)), counts});
    },
    setLeadStatus(p){ const l = S.leads.find(x=>x.id === p.id); if(!l) return err('not_found'); l.status = p.status; if('note' in p) l.note = String(p.note || '').slice(0, 300); save(); return ok({lead:l}); },
    getDashboard(p){
      tick();
      const by = {}; S.companies.forEach(c=>by[c.status] = (by[c.status] || 0) + 1);
      const total = S.sends.length, bounced = S.sends.filter(s=>s.status === 'bounced').length, today = D.today();
      const daily = []; for(let off = -13; off <= 0; off++){ const d = D.add(today, off); daily.push({date:d, count:S.sends.filter(s=>s.date === d).length}); }
      const niches = Object.keys(NICHES).map(n=>{ const cs = S.companies.filter(c=>c.niche === n); return {niche:n, total:cs.length, sent:cs.filter(c=>c.status !== 'queued').length, replied:cs.filter(c=>c.status === 'replied').length}; }).sort((a, b)=>b.total - a.total);
      const cmap = {}; S.companies.forEach(c=>cmap[c.id] = c);
      const log = S.sends.slice().sort((a, b)=>b.ts.localeCompare(a.ts)).slice(0, p.logLimit || 15).map(s=>{ const c = cmap[s.cid]; return {ts:s.ts, company:c.company, email:c.email, niche:c.niche, status:c.status === 'replied' && s.status === 'sent' ? 'replied' : s.status}; });
      return ok({stats:{sentToday:daily[13].count, dailyLimit:S.cfg.dailyLimit, paused:S.cfg.paused, sentTotal:total, companiesTotal:S.companies.length, queued:by.queued || 0,
        bounceRatePct:total ? Math.round(bounced / total * 1000) / 10 : 0, replied:by.replied || 0, replyRatePct:total ? Math.round((by.replied || 0) / total * 1000) / 10 : 0,
        byStatus:by, daily, byNiche:niches, inboundNew:S.leads.filter(l=>l.status === 'new').length}, log});
    },
    updateConfig(p){
      if('paused' in p) S.cfg.paused = !!p.paused;
      if('dailyLimit' in p){ const n = +p.dailyLimit; if(!(n >= 5 && n <= 200)) return err('bad_request'); S.cfg.dailyLimit = Math.round(n); }
      save(); return ok({config:S.cfg});
    },
    getCompanies(p){
      const q = String(p.q || '').toLowerCase();
      return ok({companies:S.companies.filter(c=>(!p.niche || c.niche === p.niche) && (!p.status || p.status === 'all' || c.status === p.status) && (!q || c.company.toLowerCase().includes(q) || c.email.includes(q)))
        .sort((a, b)=>(a.sentAt ? 0 : 1) - (b.sentAt ? 0 : 1) || String(b.sentAt).localeCompare(String(a.sentAt))).slice(0, 60)});
    }
  };
  return function(action, payload){
    if(!S) init();
    const h = H[action];
    return h ? h(payload || {}) : {ok:false, error:'unknown_action'};
  };
})();
