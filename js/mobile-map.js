// ============================================================
// Mobile Map UI
// スマホ用Bottom Sheet：タップ / スワイプ / 神社選択後クローズ
// ============================================================
(() => {
    'use strict';

    const MQ = window.matchMedia('(max-width: 720px)');
    let startY = null;
    let startX = null;
    let bound = false;

    function isMobile() {
        return MQ.matches;
    }

    function syncBodyClass() {
        const sidebar = document.getElementById('sidebar');
        document.body.classList.toggle(
            'mobile-sheet-open',
            Boolean(isMobile() && sidebar?.classList.contains('sheet-open'))
        );
    }

    function openSheet() {
        if (!isMobile()) return;
        const sidebar = document.getElementById('sidebar');
        const toggle = document.getElementById('sidebar-toggle');
        if (!sidebar || !toggle) return;
        sidebar.classList.add('sheet-open');
        toggle.setAttribute('aria-expanded', 'true');
        toggle.textContent = '⌄ 一覧を閉じる';
        if (typeof window.renderJinjaList === 'function') window.renderJinjaList();
        syncBodyClass();
    }

    function closeSheet() {
        if (!isMobile()) return;
        const sidebar = document.getElementById('sidebar');
        const toggle = document.getElementById('sidebar-toggle');
        if (!sidebar || !toggle) return;
        sidebar.classList.remove('sheet-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.textContent = '⌃ 神社一覧';
        syncBodyClass();
    }

    function bind() {
        if (bound) return;
        const sidebar = document.getElementById('sidebar');
        const toggle = document.getElementById('sidebar-toggle');
        const list = document.getElementById('jinja-list');
        if (!sidebar || !toggle || !list) {
            window.setTimeout(bind, 250);
            return;
        }
        bound = true;

        // 既存クリック処理は残しつつ、状態だけ追従させる。
        toggle.addEventListener('click', () => window.setTimeout(syncBodyClass, 0));

        sidebar.addEventListener('touchstart', event => {
            if (!isMobile() || event.touches.length !== 1) return;
            startY = event.touches[0].clientY;
            startX = event.touches[0].clientX;
        }, { passive: true });

        sidebar.addEventListener('touchend', event => {
            if (!isMobile() || startY === null || !event.changedTouches.length) return;
            const endY = event.changedTouches[0].clientY;
            const endX = event.changedTouches[0].clientX;
            const dy = endY - startY;
            const dx = endX - startX;
            startY = null;
            startX = null;

            if (Math.abs(dy) < 34 || Math.abs(dy) <= Math.abs(dx)) return;
            if (dy < 0) openSheet();
            else closeSheet();
        }, { passive: true });

        // 神社を選んだら一覧を閉じ、地図を見せる。
        list.addEventListener('click', event => {
            if (!isMobile()) return;
            const item = event.target.closest('li[data-jinja-id]');
            if (!item) return;
            window.setTimeout(closeSheet, 120);
        });

        MQ.addEventListener?.('change', () => {
            if (!isMobile()) document.body.classList.remove('mobile-sheet-open');
            else syncBodyClass();
        });

        syncBodyClass();
    }

    document.addEventListener('DOMContentLoaded', bind);
    if (document.readyState !== 'loading') bind();
})();
