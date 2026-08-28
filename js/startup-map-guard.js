// ============================================================
// 起動時ガード
// 神社マップを初期画面として保ち、神さまの自動選択・自動モーダル表示を防ぐ
// ============================================================

(() => {
    'use strict';

    const originalSelectKamisama = window.selectKamisamaInDaicho;
    const originalShowTreeModal = window.showTreeModal;
    let userSelectedGod = false;

    function isGodSelectionTarget(target) {
        return Boolean(target?.closest?.('#god-daicho-list li, .god-link'));
    }

    // ユーザー自身が神さまを選んだ操作だけ通す。
    document.addEventListener('click', event => {
        if (!isGodSelectionTarget(event.target)) return;
        userSelectedGod = true;
        window.setTimeout(() => {
            userSelectedGod = false;
        }, 0);
    }, true);

    if (typeof originalSelectKamisama === 'function') {
        window.selectKamisamaInDaicho = function guardedSelectKamisama(...args) {
            if (!userSelectedGod) return;
            return originalSelectKamisama.apply(this, args);
        };
    }

    if (typeof originalShowTreeModal === 'function') {
        window.showTreeModal = function guardedShowTreeModal(...args) {
            if (!userSelectedGod) return;
            return originalShowTreeModal.apply(this, args);
        };
    }

    document.addEventListener('DOMContentLoaded', () => {
        // HTML上でも神社マップを初期状態として明示しているが、
        // 旧処理が残っていても起動時にモーダルを見せないよう保険をかける。
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.view === 'map-view');
        });

        document.querySelectorAll('.view-section').forEach(view => {
            view.classList.toggle('active', view.id === 'map-view');
        });

        document.getElementById('tree-modal')?.classList.remove('open');
        document.getElementById('detail-panel')?.classList.remove('open');

        const logDetail = document.getElementById('log-detail-modal');
        if (logDetail) logDetail.hidden = true;
        document.body.classList.remove('log-modal-open');

        if (window.map) {
            window.setTimeout(() => window.map.invalidateSize(), 0);
        }
    });
})();
