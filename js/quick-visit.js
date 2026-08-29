// ============================================================
// 検証版: 神社詳細から参拝記録
// - 既存 visitLogs IndexedDB をそのまま利用
// - 日付だけでも保存可能
// - 写真は複数選択可。旧UI互換のため先頭写真を photo にも保持
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
            <div class="quick-visit-title">📅 参拝記録</div>
            <div class="quick-visit-row">
                <input class="quick-visit-date" type="date" value="${todayValue()}" aria-label="参拝日">
                <button type="button" class="quick-visit-save">✓ 参拝しました</button>
            </div>
            <label class="quick-visit-photo-label">
                <span>📷 写真を追加（任意・複数可）</span>
                <input class="quick-visit-photos" type="file" accept="image/*" multiple>
            </label>
            <div class="quick-visit-photo-preview" data-role="photo-preview"></div>
            <div class="quick-visit-note">日付だけでも保存できます。写真は御朱印・鳥居・社殿・境内など複数枚まとめて登録できます。</div>
            <div class="quick-visit-status" aria-live="polite"></div>`;

        actionWrapper.parentNode?.insertBefore(box, actionWrapper);
        const photoInput = box.querySelector('.quick-visit-photos');
        photoInput?.addEventListener('change', () => renderPhotoPreview(box));
        box.querySelector('.quick-visit-save')?.addEventListener('click', () => saveQuickVisit(box, shrine));
    }

    function renderPhotoPreview(box) {
        const input = box.querySelector('.quick-visit-photos');
        const preview = box.querySelector('[data-role="photo-preview"]');
        if (!input || !preview) return;
        preview.innerHTML = '';

        const files = Array.from(input.files || []).filter(file => file.type.startsWith('image/'));
        files.slice(0, 8).forEach(file => {
            const wrap = document.createElement('div');
            wrap.className = 'quick-visit-photo-thumb';
            const img = document.createElement('img');
            const url = URL.createObjectURL(file);
            img.src = url;
            img.alt = file.name || '参拝写真';
            img.onload = () => URL.revokeObjectURL(url);
            wrap.appendChild(img);
            preview.appendChild(wrap);
        });

        if (files.length > 8) {
            const more = document.createElement('div');
            more.className = 'quick-visit-photo-more';
            more.textContent = `+${files.length - 8}`;
            preview.appendChild(more);
        }
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
        if (window.crypto && typeof window.crypto.randomUUID === 'function') return `V${window.crypto.randomUUID()}`;
        return `V${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    async function saveQuickVisit(box, shrine) {
        const dateInput = box.querySelector('.quick-visit-date');
        const photoInput = box.querySelector('.quick-visit-photos');
        const button = box.querySelector('.quick-visit-save');
        const status = box.querySelector('.quick-visit-status');
        const visitDate = dateInput?.value || '';
        if (!visitDate) {
            if (status) status.textContent = '参拝日を選んでください。';
            dateInput?.focus();
            return;
        }

        const invalidFiles = Array.from(photoInput?.files || []).filter(file => !file.type.startsWith('image/'));
        if (invalidFiles.length) {
            if (status) status.textContent = '画像ファイルだけ選択してください。';
            return;
        }

        const photos = Array.from(photoInput?.files || []);
        const firstPhoto = photos[0] || null;
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
            photos,
            photo: firstPhoto,
            photoName: firstPhoto?.name || '',
            photoType: firstPhoto?.type || '',
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

            if (status) {
                status.textContent = photos.length
                    ? `${formatDate(visitDate)} の参拝と写真${photos.length}枚を保存しました ✓`
                    : `${formatDate(visitDate)} の参拝を保存しました ✓`;
            }
            if (button) button.textContent = '✓ 記録済み';
            if (photoInput) photoInput.value = '';
            const preview = box.querySelector('[data-role="photo-preview"]');
            if (preview) preview.innerHTML = '';

            const activeSort = document.querySelector('.log-sort-btn.active[data-log-sort]')
                || document.querySelector('.log-sort-btn[data-log-sort="date"]');
            activeSort?.click();

            window.dispatchEvent(new CustomEvent('goshuin:visit-saved', { detail: { record } }));
        } catch (error) {
            console.error('[QuickVisit] save failed', error);
            if (status) status.textContent = '保存できませんでした。';
            if (button) {
                button.disabled = false;
                button.textContent = '✓ 参拝しました';
            }
            return;
        }

        if (button) button.disabled = false;
    }

    function formatDate(value) {
        const parts = String(value || '').split('-');
        if (parts.length !== 3) return value;
        return `${Number(parts[0])}年${Number(parts[1])}月${Number(parts[2])}日`;
    }
})();
