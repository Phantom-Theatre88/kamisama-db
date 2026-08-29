// 参拝日 和暦入力（内部保存は YYYY-MM-DD）
(() => {
  'use strict';

  const ERAS = [
    { key:'reiwa', name:'令和', start:'2019-05-01', end:null, base:2018 },
    { key:'heisei', name:'平成', start:'1989-01-08', end:'2019-04-30', base:1988 },
    { key:'showa', name:'昭和', start:'1926-12-25', end:'1989-01-07', base:1925 },
    { key:'taisho', name:'大正', start:'1912-07-30', end:'1926-12-24', base:1911 },
    { key:'meiji', name:'明治', start:'1868-01-25', end:'1912-07-29', base:1867 }
  ];

  const pad=n=>String(n).padStart(2,'0');
  const toIso=(y,m,d)=>`${y}-${pad(m)}-${pad(d)}`;
  function maxEraYear(era){const endYear=era.end?Number(era.end.slice(0,4)):new Date().getFullYear();return endYear-era.base;}
  function eraForIso(iso){if(!iso)return ERAS[0];return ERAS.find(e=>iso>=e.start&&(!e.end||iso<=e.end))||ERAS[0];}
  function setOptions(select,values,formatter,selected){select.innerHTML='';values.forEach(v=>{const o=document.createElement('option');o.value=String(v);o.textContent=formatter(v);if(String(v)===String(selected))o.selected=true;select.appendChild(o);});}

  function syncWarekiFromIso(box,iso){
    const date=/^\d{4}-\d{2}-\d{2}$/.test(iso||'')?iso:new Date().toISOString().slice(0,10);
    const era=eraForIso(date), y=Number(date.slice(0,4)), m=Number(date.slice(5,7)), d=Number(date.slice(8,10)), ey=y-era.base;
    const eraSelect=box.querySelector('[data-wareki-era]'), yearSelect=box.querySelector('[data-wareki-year]'), monthSelect=box.querySelector('[data-wareki-month]'), daySelect=box.querySelector('[data-wareki-day]');
    eraSelect.value=era.key;
    setOptions(yearSelect,Array.from({length:maxEraYear(era)},(_,i)=>i+1),v=>v===1?'元年':`${v}年`,ey);
    setOptions(monthSelect,Array.from({length:12},(_,i)=>i+1),v=>`${v}月`,m);
    setOptions(daySelect,Array.from({length:31},(_,i)=>i+1),v=>`${v}日`,d);
  }

  function syncIsoFromWareki(box,dateInput){
    const era=ERAS.find(e=>e.key===box.querySelector('[data-wareki-era]').value); if(!era)return;
    const ey=Number(box.querySelector('[data-wareki-year]').value), m=Number(box.querySelector('[data-wareki-month]').value), d=Number(box.querySelector('[data-wareki-day]').value);
    const iso=toIso(era.base+ey,m,d), check=new Date(`${iso}T00:00:00`), status=box.querySelector('[data-wareki-status]');
    if(Number.isNaN(check.getTime())||check.getFullYear()!==era.base+ey||check.getMonth()+1!==m||check.getDate()!==d){status.textContent='存在しない日付です。';dateInput.value='';return;}
    if(iso<era.start||(era.end&&iso>era.end)){status.textContent=`${era.name}の期間外の日付です。`;dateInput.value='';return;}
    dateInput.value=iso; dateInput.dispatchEvent(new Event('change',{bubbles:true})); status.textContent=`西暦 ${iso.replace(/-/g,'/')} として保存`;
  }

  function installStyle(){if(document.getElementById('wareki-date-style'))return;const style=document.createElement('style');style.id='wareki-date-style';style.textContent='.wareki-switcher{display:flex;gap:6px;margin:6px 0}.wareki-switcher button{padding:6px 12px;border:1px solid #9b7b2f;border-radius:8px;background:#fffaf0;cursor:pointer}.wareki-switcher button.active{background:#9b1c1c;color:#fff}.wareki-row{display:grid;grid-template-columns:1.1fr 1fr .8fr .8fr;gap:6px}.wareki-row select{min-width:0;padding:8px 6px}.wareki-status{margin-top:5px;font-size:.85em;opacity:.75}.quick-visit-box .wareki-switcher{margin-top:0}.quick-visit-box .wareki-row{margin-bottom:6px}';document.head.appendChild(style);}

  function installForInput(dateInput){
    if(!dateInput||dateInput.dataset.warekiInstalled==='1')return;
    dateInput.dataset.warekiInstalled='1'; installStyle();
    const switcher=document.createElement('div'); switcher.className='wareki-switcher'; switcher.innerHTML='<button type="button" data-date-mode="western" class="active">西暦</button><button type="button" data-date-mode="wareki">和暦</button>';
    dateInput.insertAdjacentElement('beforebegin',switcher);
    const box=document.createElement('div'); box.className='wareki-date-box'; box.hidden=true; box.innerHTML='<div class="wareki-row"><select data-wareki-era aria-label="元号"></select><select data-wareki-year aria-label="和暦年"></select><select data-wareki-month aria-label="月"></select><select data-wareki-day aria-label="日"></select></div><div class="wareki-status" data-wareki-status></div>';
    dateInput.insertAdjacentElement('afterend',box);
    const eraSelect=box.querySelector('[data-wareki-era]'); ERAS.forEach(e=>{const o=document.createElement('option');o.value=e.key;o.textContent=e.name;eraSelect.appendChild(o);});
    const activate=mode=>{const wareki=mode==='wareki';dateInput.hidden=wareki;box.hidden=!wareki;switcher.querySelectorAll('[data-date-mode]').forEach(b=>b.classList.toggle('active',b.dataset.dateMode===mode));if(wareki)syncWarekiFromIso(box,dateInput.value);};
    switcher.addEventListener('click',e=>{const b=e.target.closest('[data-date-mode]');if(b)activate(b.dataset.dateMode);});
    eraSelect.addEventListener('change',()=>{const era=ERAS.find(e=>e.key===eraSelect.value);setOptions(box.querySelector('[data-wareki-year]'),Array.from({length:maxEraYear(era)},(_,i)=>i+1),v=>v===1?'元年':`${v}年`,1);syncIsoFromWareki(box,dateInput);});
    box.querySelectorAll('select').forEach(s=>s.addEventListener('change',()=>syncIsoFromWareki(box,dateInput)));
    dateInput.addEventListener('change',()=>{if(!box.hidden)syncWarekiFromIso(box,dateInput.value);});
    activate('western');
  }

  function installAll(){installForInput(document.getElementById('visit-date'));document.querySelectorAll('.quick-visit-date').forEach(installForInput);}
  document.addEventListener('DOMContentLoaded',()=>{installAll();const target=document.getElementById('detail-content')||document.body;new MutationObserver(installAll).observe(target,{childList:true,subtree:true});});
  if(document.readyState!=='loading')installAll();
})();