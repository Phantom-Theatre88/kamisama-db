// ============================================================
// 参拝ログ Step 1
// 参拝日・メモ・御朱印写真を端末内へ保存し、あとから見返す
// IndexedDB を使用（画像Blobを保存）
// ============================================================

(() => {
    'use strict';

    const DB_NAME = 'goshuin-zukan';
    const DB_VERSION = 1;
    const STORE_NAME = 'visitLogs';

    let db = null;
    let selectedPhoto = null;
    let previewUrl = null;
    const renderedObjectUrls = new Set();

    document.addEventListener('DOMContentLoaded', async () => {
        const form = document.getElementById('visit-form');
        if (!form) return;

        setToday();
        initPhotoInput();
        initModal();
        form.addEventListener('submit', handleSubmit);

        try {
            db = await openDatabase();
            await renderVisitLogs();
            setStatus('端末内に保存できます。', 'ready');
        } catch (error) {
            console.error('参拝ログDBの初期化に失敗しました:', error);
            setStatus('このブラウザでは端末内保存を開始できませんでした。', 'error');
            disableForm();
        }
    });

    function setToday() {
        const input = document.getElementById('visit-date');
        if (!input || input.value) return;

        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        input.value = `${y}-${m}-${d}`;
    }

    function openDatabase() {
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

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
        });
    }

    function initPhotoInput() {
        const input = document.getElementById('goshuin-photo');
        const preview = document.getElementById('photo-preview');
        const clearButton = document.getElementById('photo-clear');

        if (!input || !preview || !clearButton) return;

        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            if (!file) {
                clearSelectedPhoto();
                return;
            }

            if (!file.type.startsWith('image/')) {
                setStatus('画像ファイルを選んでください。', 'error');
                input.value = '';
                clearSelectedPhoto();
                return;
            }

            selectedPhoto = file;
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            previewUrl = URL.createObjectURL(file);
            preview.src = previewUrl;
            preview.hidden = false;
            clearButton.hidden = false;
            setStatus('御朱印写真を選択しました。', 'ready');
        });

        clearButton.addEventListener('click', () => {
            input.value = '';
            clearSelectedPhoto();
        });
    }

    function clearSelectedPhoto() {
        const preview = document.getElementById('photo-preview');
        const clearButton = document.getElementById('photo-clear');

        selectedPhoto = null;
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            previewUrl = null;
        }
        if (preview) {
            preview.src = '';
            preview.hidden = true;
        }
        if (clearButton) clearButton.hidden = true;
    }

    async function handleSubmit(event) {
        event.preventDefault();

        if (!db) return;

        const dateInput = document.getElementById('visit-date');
        const memoInput = document.getElementById('visit-memo');
        const saveButton = document.getElementById('visit-save');

        if (!dateInput.value) {
            setStatus('参拝日を選んでください。', 'error');
            dateInput.focus();
            return;
        }

        if (!selectedPhoto) {
            setStatus('御朱印写真を1枚選んでください。', 'error');
            document.getElementById('goshuin-photo')?.focus();
            return;
        }

        const record = {
            id: createId(),
            visitDate: dateInput.value,
            memo: memoInput.value.trim(),
            photo: selectedPhoto,
            photoName: selectedPhoto.name || 'goshuin-photo',
            photoType: selectedPhoto.type || 'image/*',
            createdAt: new Date().toISOString()
        };

        try {
            saveButton.disabled = true;
            saveButton.textContent = '保存中…';
            await putRecord(record);

            memoInput.value = '';
            document.getElementById('goshuin-photo').value = '';
            clearSelectedPhoto();
            setTodayAfterReset(dateInput);

            await renderVisitLogs();
            setStatus('参拝記録を端末内に保存しました。', 'success');
        } catch (error) {
            console.error('参拝記録の保存に失敗しました:', error);
            setStatus('保存できませんでした。端末の空き容量などを確認してください。', 'error');
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = 'この参拝記録を保存';
        }
    }

    function setTodayAfterReset(dateInput) {
        dateInput.value = '';
        setToday();
    }

    function createId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }
        return `visit-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function putRecord(record) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(record);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('Save transaction failed'));
            tx.onabort = () => reject(tx.error || new Error('Save transaction aborted'));
        });
    }

    function getAllRecords() {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const request = tx.objectStore(STORE_NAME).getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error || new Error('Read failed'));
        });
    }

    async function renderVisitLogs() {
        revokeRenderedUrls();

        const list = document.getElementById('log-list-container');
        const count = document.getElementById('log-count');
        if (!list) return;

        const records = await getAllRecords();
        records.sort((a, b) => {
            const dateCompare = String(b.visitDate || '').localeCompare(String(a.visitDate || ''));
            if (dateCompare !== 0) return dateCompare;
            return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
        });

        if (count) count.textContent = `${records.length}件`;
        list.innerHTML = '';

        if (records.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'log-empty';
            empty.textContent = 'まだ参拝記録はありません。左のフォームから最初の1件を登録してください。';
            list.appendChild(empty);
            return;
        }

        records.forEach(record => list.appendChild(createLogCard(record)));
    }

    function createLogCard(record) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'visit-log-card';
        card.addEventListener('click', () => openDetail(record));

        const imageWrap = document.createElement('div');
        imageWrap.className = 'visit-log-thumb-wrap';

        if (record.photo instanceof Blob) {
            const image = document.createElement('img');
            const url = createTrackedObjectUrl(record.photo);
            image.src = url;
            image.alt = `${formatDate(record.visitDate)}の御朱印`;
            image.className = 'visit-log-thumb';
            imageWrap.appendChild(image);
        } else {
            const noImage = document.createElement('div');
            noImage.className = 'visit-log-no-image';
            noImage.textContent = '御朱印';
            imageWrap.appendChild(noImage);
        }

        const body = document.createElement('div');
        body.className = 'visit-log-card-body';

        const date = document.createElement('div');
        date.className = 'visit-log-date';
        date.textContent = formatDate(record.visitDate);

        const memo = document.createElement('div');
        memo.className = 'visit-log-memo';
        memo.textContent = record.memo || 'メモなし';

        const hint = document.createElement('div');
        hint.className = 'visit-log-open-hint';
        hint.textContent = '記録を開く ›';

        body.append(date, memo, hint);
        card.append(imageWrap, body);
        return card;
    }

    function initModal() {
        const modal = document.getElementById('log-detail-modal');
        const close = document.getElementById('log-detail-close');
        if (!modal || !close) return;

        close.addEventListener('click', closeDetail);
        modal.addEventListener('click', event => {
            if (event.target === modal) closeDetail();
        });

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !modal.hidden) closeDetail();
        });
    }

    function openDetail(record) {
        const modal = document.getElementById('log-detail-modal');
        const date = document.getElementById('log-detail-date');
        const memo = document.getElementById('log-detail-memo');
        const image = document.getElementById('log-detail-image');
        if (!modal || !date || !memo || !image) return;

        date.textContent = formatDate(record.visitDate);
        memo.textContent = record.memo || 'メモなし';

        if (image.dataset.objectUrl) {
            URL.revokeObjectURL(image.dataset.objectUrl);
            delete image.dataset.objectUrl;
        }

        if (record.photo instanceof Blob) {
            const url = URL.createObjectURL(record.photo);
            image.dataset.objectUrl = url;
            image.src = url;
            image.alt = `${formatDate(record.visitDate)}の御朱印`;
            image.hidden = false;
        } else {
            image.src = '';
            image.hidden = true;
        }

        modal.hidden = false;
        document.body.classList.add('log-modal-open');
    }

    function closeDetail() {
        const modal = document.getElementById('log-detail-modal');
        const image = document.getElementById('log-detail-image');
        if (!modal || !image) return;

        if (image.dataset.objectUrl) {
            URL.revokeObjectURL(image.dataset.objectUrl);
            delete image.dataset.objectUrl;
        }
        image.src = '';
        modal.hidden = true;
        document.body.classList.remove('log-modal-open');
    }

    function formatDate(value) {
        if (!value) return '日付なし';
        const parts = value.split('-');
        if (parts.length !== 3) return value;
        return `${Number(parts[0])}年${Number(parts[1])}月${Number(parts[2])}日`;
    }

    function createTrackedObjectUrl(blob) {
        const url = URL.createObjectURL(blob);
        renderedObjectUrls.add(url);
        return url;
    }

    function revokeRenderedUrls() {
        renderedObjectUrls.forEach(url => URL.revokeObjectURL(url));
        renderedObjectUrls.clear();
    }

    function setStatus(message, type) {
        const status = document.getElementById('log-save-status');
        if (!status) return;
        status.textContent = message;
        status.dataset.type = type || 'ready';
    }

    function disableForm() {
        document.querySelectorAll('#visit-form input, #visit-form textarea, #visit-form button').forEach(el => {
            el.disabled = true;
        });
    }
})();
