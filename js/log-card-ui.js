// ============================================================
// 参拝ログ：カード表示補助
// 神社マスタから主祭神を引き、カードと詳細画面へ表示する
// ============================================================

(() => {
    'use strict';

    document.addEventListener('DOMContentLoaded', () => {
        const list = document.getElementById('log-list-container');
        const modal = document.getElementById('log-detail-modal');

        if (list) {
            enhanceCards(list);
            const listObserver = new MutationObserver(() => enhanceCards(list));
            listObserver.observe(list, { childList: true, subtree: true });
        }

        if (modal) {
            enhanceDetail(modal);
            const modalObserver = new MutationObserver(() => enhanceDetail(modal));
            modalObserver.observe(modal, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeFilter: ['hidden']
            });
        }
    });

    function enhanceCards(root) {
        root.querySelectorAll('.visit-log-card').forEach(card => {
            const shrineEl = card.querySelector('.visit-log-shrine');
            const body = card.querySelector('.visit-log-card-body');
            const dateEl = card.querySelector('.visit-log-date');
            if (!shrineEl || !body || !dateEl) return;

            const shrineName = shrineEl.textContent.trim();
            const noPhoto = Boolean(card.querySelector('.visit-log-no-image'));
            card.classList.toggle('visit-log-card-no-photo', noPhoto);
            card.classList.toggle('visit-log-card-has-photo', !noPhoto);

            const enhancementKey = `${shrineName}|${noPhoto ? 'no-photo' : 'photo'}`;
            if (card.dataset.visualEnhanced === enhancementKey) return;

            card.querySelector('.visit-log-gods')?.remove();
            const gods = getGodsForShrineName(shrineName);
            if (gods.length > 0) {
                const godsEl = createGodsElement(gods, 'visit-log-gods', 'visit-log-god-chip');
                dateEl.insertAdjacentElement('afterend', godsEl);
            }

            card.dataset.visualEnhanced = enhancementKey;
        });
    }

    function enhanceDetail(modal) {
        if (modal.hidden) return;

        const shrineEl = document.getElementById('log-detail-shrine');
        const dateEl = document.getElementById('log-detail-date');
        if (!shrineEl || !dateEl) return;

        const shrineName = shrineEl.textContent.trim();
        if (!shrineName) return;

        let godsEl = document.getElementById('log-detail-gods');
        if (godsEl?.dataset.shrineName === shrineName) return;
        godsEl?.remove();

        const gods = getGodsForShrineName(shrineName);
        if (gods.length === 0) return;

        godsEl = createGodsElement(gods, 'log-detail-gods', 'log-detail-god-chip');
        godsEl.id = 'log-detail-gods';
        godsEl.dataset.shrineName = shrineName;
        dateEl.insertAdjacentElement('afterend', godsEl);
    }

    function getGodsForShrineName(shrineName) {
        if (!shrineName || shrineName.includes('神社未設定')) return [];
        if (!Array.isArray(window.jinjaData)) return [];

        const shrine = window.jinjaData.find(item => item.name === shrineName);
        if (!shrine || !shrine.main_god_ids) return [];

        const ids = String(shrine.main_god_ids)
            .split(/[,|、\s]+/)
            .map(id => id.trim())
            .filter(Boolean);

        const seen = new Set();
        return ids.map(id => {
            const god = window.kamisamaMap instanceof Map ? window.kamisamaMap.get(id) : null;
            return {
                id,
                name: god?.name || id
            };
        }).filter(god => {
            if (!god.name || seen.has(god.id)) return false;
            seen.add(god.id);
            return true;
        });
    }

    function createGodsElement(gods, containerClass, chipClass) {
        const container = document.createElement('div');
        container.className = containerClass;
        container.setAttribute('aria-label', '主祭神');

        gods.forEach(god => {
            const chip = document.createElement('span');
            chip.className = chipClass;
            chip.textContent = `✨ ${god.name}`;
            container.appendChild(chip);
        });

        return container;
    }
})();
