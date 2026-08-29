// 検証版: 神さま詳細モーダルから別名編集UIへつなぐ
(() => {
    'use strict';

    function currentGodId() {
        return document.querySelector('#god-daicho-list li.selected[data-god-id]')?.dataset.godId || '';
    }

    function openAliasEditorFromModal() {
        const modal = document.getElementById('tree-modal');
        if (modal) modal.classList.remove('open');

        const detailTab = document.querySelector('.god-view-tab[data-tab="detail"]');
        if (detailTab) detailTab.click();

        let tries = 0;
        const timer = window.setInterval(() => {
            tries += 1;
            const button = document.querySelector('#god-profile-display .god-alias-edit-launch');
            if (button) {
                window.clearInterval(timer);
                button.click();
                return;
            }
            if (tries >= 20) window.clearInterval(timer);
        }, 50);
    }

    function ensureModalButton() {
        const treeContainer = document.getElementById('tree-container');
        if (!treeContainer) return;
        const godId = currentGodId();
        const header = treeContainer.querySelector('.tree-header');
        if (!godId || !header || header.querySelector('.god-alias-modal-edit')) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'god-alias-edit-launch god-alias-modal-edit';
        button.textContent = '✏️ 別名・異表記を編集';
        button.addEventListener('click', openAliasEditorFromModal);
        header.appendChild(button);
    }

    function install() {
        const treeContainer = document.getElementById('tree-container');
        if (!treeContainer || treeContainer.dataset.aliasModalBridgeInstalled === '1') return false;
        treeContainer.dataset.aliasModalBridgeInstalled = '1';

        const observer = new MutationObserver(() => window.setTimeout(ensureModalButton, 0));
        observer.observe(treeContainer, { childList: true, subtree: true });
        ensureModalButton();
        return true;
    }

    const wait = () => {
        if (install()) return;
        window.setTimeout(wait, 100);
    };

    document.addEventListener('DOMContentLoaded', wait);
    if (document.readyState !== 'loading') wait();
})();
