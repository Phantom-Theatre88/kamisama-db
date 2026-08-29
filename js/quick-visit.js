// ============================================================
// 検証版: 神社詳細から日付だけで参拝記録
// - 既存 visitLogs IndexedDB をそのまま利用
// - メモ/写真は後から参拝ログ画面で追加可能
// ============================================================
(() => {
    'use strict';

    const DB_NAME = 'goshuin-zukan';
    const DB_VERSION = 1;
    const STORE_NAME = 'visitLogs';

    document.addEventListener('DOMContentLoaded', install);
    if (document.readyState !== 'loading') install();

    function install() {
        const detail = document.getElementById('detail-content');
        if (!detail || detail.dataset.quickVisitInstalled === '1') return;
        detail.dataset.quickVisitInstalled = '1';

        const observer = new MutationObserver(() => attachQuickVisit());
        observer.observe(detail, { childList: true, subtree: true });
        attachQuickVisit();
    }

    function currentShrine() {
        if (!Array.isArray(window.jinjaData)) return null;
        const selectedId = document.querySelector('#jinja-list li.selected[data-jinja-id]')?.dataset.jinjaId;
        if (selectedId) {
            const byId = window.jinjaData.find(item => item.id === selectedId);
            if (byId) return byId;
        }
        const name = document.querySelector('#detail-content h2')?.textContent?.trim();
        return name ? (window.jinjaData.find(item => item.name === name) || null) : null;
    }

    function todayValue() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function attachQuickVisit() {
        const detail = document.getElementById('detail-content');
        if (!detail || detail.querySelector('.quick-visit-box')) return;
        const actionWrapper = detail.querySelector('.action-btn-wrapper');
        const shrine = currentShrine();
        if (!actionWrapper || !shrine?.id) return;

        const box = document.createElement('div');
        box.className = 'quick-visit-box';
        box.innerHTML = `
            <div class="quick-visit-title">📅 参拝日を記録</div>
            <div class="quick-visit-row">
                <input class="quick-visit-date" type="date" value="${todayValue()}" aria-label="参拝日">
                <button type="button" class="quick-visit-save">✓ 参拝しました</button>
            </div>
            <div class="quick-visit-note">日付だけ先に保存できます。メモ・写真は参拝ログから後で追加できます。</div>
            <div class="quick-visit-status" aria-live="polite"></div>`;

        actionWrapper.parentNode?.insertBefore(box, actionWrapper);
        box.querySelector('.quick-visit-save')?.addEventListener('click', () => saveQuickVisit(box, shrine));
    }

    function openDatabase() {
        return new Promise((resolve, reject) => {
            if (!('indexedDB' in window)) {
                reject(new Error('IndexedDB is not supported'));
                return;
            }
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = event => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('visitDate', 'visitDate', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
        });
    }

    function createId() {
        if (crypto?.randomUUID) return `V${crypto.randomUUID()}`;
        return `V${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    async function saveQuickVisit(box, shrine) {
        const dateInput = box.querySelector('.quick-visit-date');
        const button = box.querySelector('.quick-visit-save');
        const status = box.querySelector('.quick-visit-status');
        const visitDate = dateInput?.value || '';
        if (!visitDate) {
            if (status) status.textContent = '参拝日を選んでください。';
            dateInput?.focus();
            return;
        }

        const now = new Date().toISOString();
        const record = {
            id: createId(),
            shrineId: shrine.id,
            shrineName: shrine.name || shrine.id,
            shrineYomi: shrine.yomi || '',
            shrineAddress: shrine.address || '',
            shrineProvince: shrine.province || '',
            visitDate,
            memo: '',
            photo: null,
            photoName: '',
            photoType: '',
            createdAt: now,
            updatedAt: ''
        };

        try {
            if (button) {
                button.disabled = true;
                button.textContent = '保存中…';
            }
            const db = await openDatabase();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).put(record);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error || new Error('save failed'));
                tx.onabort = () => reject(tx.error || new Error('save aborted'));
            });
            db.close();

            if (status) status.textContent = `${formatDate(visitDate)} の参拝を保存しました ✓`;
            if (button) button.textContent = '✓ 記録済み';

            // 既存ログ画面を裏で再描画する。
            const activeSort = document.querySelector('.log-sort-btn.active[data-log-sort]')
                || document.querySelector('.log-sort-btn[data-log-sort="date"]');
            activeSort?.click();

            // 既存の詳細カード参拝回数表示を更新させる。
            const panel = document.getElementById('detail-panel');
            if (panel) {
                panel.classList.add('quick-visit-updated');
                window.setTimeout(() => panel.classList.remove('quick-visit-updated'), 30);
            }
        } catch (error) {
            console.error('[QuickVisit] save failed', error);
            if (status) status.textContent = '保存できませんでした。';
            if (button) {
                button.disabled = false;
                button.textContent = '✓ 参拝しました';
            }
        }
    }

    function formatDate(value) {
        const parts = String(value || '').split('-');
        if (parts.length !== 3) return value;
        return `${Number(parts[0])}年${Number(parts[1])}月${Number(parts[2])}日`;
    }
})();
