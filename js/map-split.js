// ============================================================
// Map Split Layout controller
// 一覧 / 詳細を固定情報ペイン内で切り替える。
// ============================================================
(() => {
    'use strict';
    function setPanel(name){
        const pane=document.getElementById('map-info-pane'); if(!pane)return;
        const target=name==='detail'?'detail':'list'; pane.dataset.activePanel=target;
        document.querySelectorAll('.map-info-tab').forEach(btn=>{const active=btn.dataset.mapInfoPanel===target;btn.classList.toggle('active',active);btn.setAttribute('aria-selected',active?'true':'false');});
        if(target==='list'&&typeof window.renderJinjaList==='function')window.renderJinjaList();
        window.setTimeout(()=>window.map?.invalidateSize?.(),0);
    }
    function bindTabs(){
        const pane=document.getElementById('map-info-pane'); if(!pane||pane.dataset.splitBound==='1')return; pane.dataset.splitBound='1';
        document.querySelectorAll('.map-info-tab').forEach(btn=>btn.addEventListener('click',()=>setPanel(btn.dataset.mapInfoPanel)));
        const detail=document.getElementById('detail-panel'); const close=document.getElementById('detail-close'); close?.addEventListener('click',()=>window.setTimeout(()=>setPanel('list'),0));
        if(detail){const observer=new MutationObserver(()=>{if(detail.classList.contains('open'))setPanel('detail');});observer.observe(detail,{attributes:true,attributeFilter:['class']});}
        document.getElementById('jinja-list')?.addEventListener('click',event=>{if(event.target.closest('li[data-jinja-id]'))window.setTimeout(()=>setPanel('detail'),0);});
        window.addEventListener('resize',()=>window.map?.invalidateSize?.());
        window.addEventListener('orientationchange',()=>window.setTimeout(()=>window.map?.invalidateSize?.(),150));
        setPanel('list'); window.setTimeout(()=>window.map?.invalidateSize?.(),100);
    }
    document.addEventListener('DOMContentLoaded',bindTabs); if(document.readyState!=='loading')bindTabs();
})();
