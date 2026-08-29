// ============================================================
// Mobile Map UI
// スマホ用Bottom Sheet：タップ / スワイプ / 神社選択後クローズ
// ============================================================
(() => {
    'use strict';
    const MQ = window.matchMedia('(max-width: 720px)');
    let startY = null, startX = null, bound = false;
    const isMobile = () => MQ.matches;
    function syncBodyClass(){ const s=document.getElementById('sidebar'); document.body.classList.toggle('mobile-sheet-open',Boolean(isMobile()&&s?.classList.contains('sheet-open'))); }
    function openSheet(){ if(!isMobile())return; const s=document.getElementById('sidebar'),t=document.getElementById('sidebar-toggle'); if(!s||!t)return; s.classList.add('sheet-open'); t.setAttribute('aria-expanded','true'); t.textContent='⌄ 一覧を閉じる'; window.renderJinjaList?.(); syncBodyClass(); }
    function closeSheet(){ if(!isMobile())return; const s=document.getElementById('sidebar'),t=document.getElementById('sidebar-toggle'); if(!s||!t)return; s.classList.remove('sheet-open'); t.setAttribute('aria-expanded','false'); t.textContent='⌃ 神社一覧'; syncBodyClass(); }
    function bind(){ if(bound)return; const s=document.getElementById('sidebar'),t=document.getElementById('sidebar-toggle'),l=document.getElementById('jinja-list'); if(!s||!t||!l){setTimeout(bind,250);return;} bound=true; t.addEventListener('click',()=>setTimeout(syncBodyClass,0)); s.addEventListener('touchstart',e=>{if(!isMobile()||e.touches.length!==1)return;startY=e.touches[0].clientY;startX=e.touches[0].clientX;},{passive:true}); s.addEventListener('touchend',e=>{if(!isMobile()||startY===null||!e.changedTouches.length)return;const endY=e.changedTouches[0].clientY,endX=e.changedTouches[0].clientX,dy=endY-startY,dx=endX-startX;startY=null;startX=null;if(Math.abs(dy)<34||Math.abs(dy)<=Math.abs(dx))return;dy<0?openSheet():closeSheet();},{passive:true}); l.addEventListener('click',e=>{if(!isMobile())return;const item=e.target.closest('li[data-jinja-id]');if(item)setTimeout(closeSheet,120);}); MQ.addEventListener?.('change',()=>{if(!isMobile())document.body.classList.remove('mobile-sheet-open');else syncBodyClass();}); syncBodyClass(); }
    document.addEventListener('DOMContentLoaded',bind); if(document.readyState!=='loading')bind();
})();
