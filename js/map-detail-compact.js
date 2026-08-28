// ============================================================
// 神社マップ：コンパクト詳細カード補助
// 詳細情報を折りたたみ、参拝回数・最終参拝日を表示する
// ============================================================

(() => {
    'use strict';

    const DB_NAME = 'goshuin-zukan';
    const DB_VERSION = 1;
    const STORE_NAME = 'visitLogs';

    let db = null;
    let enhanceTimer = null;

    document.addEventListener('DOMContentLoaded', () => {
        const content = document.getElementById('detail-content');
        const panel = document.getElementById('detail-panel');
        if (!content || !panel) return;

        const contentObserver = new MutationObserver(() => scheduleEnhance());
        contentObserver.observe(content, { childList: true, subtree: true });

        const panelObserver = new MutationObserver(() => scheduleEnhance());
        panelObserver.observe(panel, { attributes: true, attributeFilter: ['class'] });

        const mapTab = document.querySelector('.nav-tab[data-view="map-view"]');
        mapTab?.addEventListener('click', () => window.setTimeout(scheduleEnhance, 0));

        document.addEventListener('click', event => {
            if (!event.target.closest('#visit-save, #log-detail-delete')) return;
            [250, 700, 1400].forEach(delay => window.setTimeout(scheduleEnhance, delay));
        }, true);

        window.addEventListener('pageshow', scheduleEnhance);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) scheduleEnhance();
        });

        scheduleEnhance();
    });

    function scheduleEnhance() {
        if (enhanceTimer) window.clearTimeout(enhanceTimer);
        enhanceTimer = window.setTimeout(() => {
            enhanceTimer = null;
            enhanceDetailCard();
        }, 20);
    }

    async function enhanceDetailCard() {
        const panel = document.getElementById('detail-panel');
        const content = document.getElementById('detail-content');
        if (!panel?.classList.contains('open') || !content) return;

        const heading = content.querySelector('h2');
        if (!heading) return;

        const shrine = getCurrentShrine(heading.textContent.trim());
        if (!shrine?.id) return;

        content.classList.add('map-detail-compact-content');
        ensureCompactStructure(content, shrine.id);

        try {
            const records = await getAllVisitRecords();
            const currentShrine = getCurrentShrine(content.querySelector('h2')?.textContent.trim() || '');
            if (!currentShrine || currentShrine.id !== shrine.id) return;
            renderVisitSummary(content, shrine.id, records);
        } catch (error) {
            console.warn('神社詳細の参拝状況を取得できませんでした:', error);
        }
    }

    function getCurrentShrine(detailName) {
        const selectedItem = document.querySelector('#jinja-list li.selected[data-jinja-id]');
        const selectedId = selectedItem?.dataset.jinjaId;

        if (selectedId && Array.isArray(window.jinjaData)) {
            const byId = window.jinjaData.find(item => item.id === selectedId);
            if (byId) return byId;
        }

        if (detailName && Array.isArray(window.jinjaData)) {
            return window.jinjaData.find(item => item.name === detailName) || null;
        }

        return null;
    }

    function ensureCompactStructure(content, shrineId) {
        const existing = content.querySelector('.map-detail-more');
        if (existing && content.dataset.compactShrineId === shrineId) return;

        existing?.remove();
        content.querySelector('.map-visit-summary')?.remove();

        const meta = findDirectChild(content, 'shrine-meta');
        const description = findDirectChild(content, 'description');
        const actionWrapper = findDirectChild(content, 'action-btn-wrapper');

        if (meta || description) {
            const details = document.createElement('details');
            details.className = 'map-detail-more';

            const summary = document.createElement('summary');
            summary.textContent = '詳細を見る';

            const body = document.createElement('div');
            body.className = 'map-detail-more-body';

            if (meta) body.appendChild(meta);
            if (description) body.appendChild(description);

            details.append(summary, body);

            if (actionWrapper) {
                content.insertBefore(details, actionWrapper);
            } else {
                content.appendChild(details);
            }
        }

        content.dataset.compactShrineId = shrineId;
    }

    function findDirectChild(parent, className) {
        return Array.from(parent.children).find(child => child.classList?.contains(className)) || null;
    }

    function renderVisitSummary(content, shrineId, records) {
        content.querySelector('.map-visit-summary')?.remove();

        const visits = records
            .filter(record => record?.shrineId === shrineId)
            .sort((a, b) => {
                const dateCompare = String(b.visitDate || '').localeCompare(String(a.visitDate || ''));
                if (dateCompare !== 0) return dateCompare;
                return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
            });

        const summary = document.createElement('div');
        summary.className = 'map-visit-summary';

        if (visits.length > 0) {
            summary.classList.add('is-visited');

            const count = document.createElement('span');
            count.className = 'map-visit-count';
            count.textContent = `✓ 参拝済み ${visits.length}回`;

            const latest = document.createElement('span');
            latest.className = 'map-visit-latest';
            latest.textContent = `最終 ${formatDate(visits[0].visitDate)}`;

            summary.append(count, latest);
        } else {
            const notVisited = document.createElement('span');
            notVisited.textContent = '未参拝';
            summary.appendChild(notVisited);
        }

        const godSection = content.querySelector('.god-section');
        const address = findDirectChild(content, 'address');
        const anchor = godSection || address || content.querySelector('.yomi') || content.querySelector('h2');

        if (anchor) {
            anchor.insertAdjacentElement('afterend', summary);
        } else {
            content.prepend(summary);
        }
    }

    function openDatabase() {
        if (db) return Promise.resolve(db);

        return new Promise((resolve, reject) => {
            if (!('indexedDB' in window)) {
                reject(new Error('IndexedDB is not supported'));
                return;
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = event => {
                const upgradeDb = event.target.result;
                if (!upgradeDb.objectStoreNames.contains(STORE_NAME)) {
                    const store = upgradeDb.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('visitDate', 'visitDate', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }
            };

            request.onsuccess = () => {
                db = request.result;
                resolve(db);
            };
            request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
        });
    }

    async function getAllVisitRecords() {
        const database = await openDatabase();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_NAME, 'readonly');
            const request = tx.objectStore(STORE_NAME).getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error || new Error('Visit log read failed'));
        });
    }

    function formatDate(value) {
        if (!value) return '日付なし';
        const parts = String(value).split('-');
        if (parts.length !== 3) return value;
        return `${Number(parts[0])}年${Number(parts[1])}月${Number(parts[2])}日`;
    }
})();
