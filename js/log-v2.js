// ============================================================
// 参拝ログ Step 1.5
// 神社マップで選んだ神社と参拝記録を紐づけて端末内へ保存する
// 参拝日は必須、メモ・御朱印写真は任意
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
    let selectedShrine = null;
    const renderedObjectUrls = new Set();

    document.addEventListener('DOMContentLoaded', async () => {
        const form = document.getElementById('visit-form');
        if (!form) return;

        setToday();
        initPhotoInput();
        initModal();
        initShrineLinking();
        form.addEventListener('submit', handleSubmit);

        try {
            db = await openDatabase();
            await renderVisitLogs();
            setStatus('神社マップで神社を選ぶと参拝記録を保存できます。', 'ready');
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

    function initShrineLinking() {
        const changeButton = document.getElementById('visit-change-shrine');
        if (changeButton) {
            changeButton.addEventListener('click', () => {
                const mapTab = document.querySelector('.nav-tab[data-view="map-view"]');
                if (mapTab) mapTab.click();
            });
        }

        const detailContent = document.getElementById('detail-content');
        if (!detailContent) return;

        const observer = new MutationObserver(() => attachVisitButtonToShrineDetail());
        observer.observe(detailContent, { childList: true, subtree: true });
        attachVisitButtonToShrineDetail();
    }

    function attachVisitButtonToShrineDetail() {
        const detailContent = document.getElementById('detail-content');
        if (!detailContent || detailContent.querySelector('.visit-log-start-btn')) return;

        const actionWrapper = detailContent.querySelector('.action-btn-wrapper');
        const heading = detailContent.querySelector('h2');
        if (!actionWrapper || !heading) return;

        const jinja = getCurrentDetailShrine(heading.textContent.trim());
        if (!jinja || !jinja.id) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'jinja-btn visit-log-start-btn';
        button.textContent = '📖 この神社を参拝記録する';
        button.addEventListener('click', () => openVisitFormForShrine(jinja.id));
        actionWrapper.appendChild(button);
    }

    function getCurrentDetailShrine(detailName) {
        const selectedListItem = document.querySelector('#jinja-list li.selected[data-jinja-id]');
        const selectedId = selectedListItem?.dataset.jinjaId;

        if (selectedId && Array.isArray(window.jinjaData)) {
            const byId = window.jinjaData.find(jinja => jinja.id === selectedId);
            if (byId) return byId;
        }

        if (detailName && Array.isArray(window.jinjaData)) {
            return window.jinjaData.find(jinja => jinja.name === detailName) || null;
        }

        return null;
    }

    function openVisitFormForShrine(jinjaId) {
        if (!Array.isArray(window.jinjaData)) return;
        const jinja = window.jinjaData.find(item => item.id === jinjaId);
        if (!jinja) return;

        selectedShrine = {
            id: jinja.id,
            name: jinja.name || jinja.id,
            yomi: jinja.yomi || '',
            address: jinja.address || '',
            province: jinja.province || ''
        };

        renderSelectedShrine();

        const logTab = document.querySelector('.nav-tab[data-view="log-view"]');
        if (logTab) logTab.click();

        const detailPanel = document.getElementById('detail-panel');
        if (detailPanel) detailPanel.classList.remove('open');

        setStatus(`${selectedShrine.name} の参拝記録を入力できます。`, 'ready');
        setTimeout(() => document.getElementById('visit-date')?.focus(), 0);
    }

    function renderSelectedShrine() {
        const card = document.getElementById('visit-shrine-card');
        const idInput = document.getElementById('visit-shrine-id');
        const nameEl = document.getElementById('visit-shrine-name');
        const metaEl = document.getElementById('visit-shrine-meta');
        const changeButton = document.getElementById('visit-change-shrine');

        if (!selectedShrine) {
            if (card) card.dataset.selected = 'false';
            if (idInput) idInput.value = '';
            if (nameEl) nameEl.textContent = '神社マップから神社を選択してください';
            if (metaEl) metaEl.textContent = '神社詳細の「この神社を参拝記録する」から開始します。';
            if (changeButton) changeButton.textContent = '神社マップで選ぶ';
            return;
        }

        if (card) card.dataset.selected = 'true';
        if (idInput) idInput.value = selectedShrine.id;
        if (nameEl) nameEl.textContent = selectedShrine.name;
        if (metaEl) {
            const parts = [selectedShrine.yomi, selectedShrine.address].filter(Boolean);
            metaEl.textContent = parts.join(' / ') || '選択済み';
        }
        if (changeButton) changeButton.textContent = '神社マップで選び直す';
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
            setStatus('御朱印写真を選択しました。写真なしでも保存できます。', 'ready');
        });

        clearButton.addEventListener('click', () => {
            input.value = '';
            clearSelectedPhoto();
            setStatus('御朱印写真なしで保存できます。', 'ready');
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

        if (!selectedShrine || !selectedShrine.id) {
            setStatus('先に神社マップで参拝した神社を選んでください。', 'error');
            document.getElementById('visit-change-shrine')?.focus();
            return;
        }

        if (!dateInput.value) {
            setStatus('参拝日を選んでください。', 'error');
            dateInput.focus();
            return;
        }

        const record = {
            id: createId(),
            shrineId: selectedShrine.id,
            shrineName: selectedShrine.name,
            shrineYomi: selectedShrine.yomi,
            shrineAddress: selectedShrine.address,
            shrineProvince: selectedShrine.province,
            visitDate: dateInput.value,
            memo: memoInput.value.trim(),
            photo: selectedPhoto || null,
            photoName: selectedPhoto ? (selectedPhoto.name || 'goshuin-photo') : '',
            photoType: selectedPhoto ? (selectedPhoto.type || 'image/*') : '',
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
            setStatus(`${selectedShrine.name} の参拝記録を保存しました。`, 'success');
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
            empty.textContent = 'まだ参拝記録はありません。神社マップから神社を選んで最初の1件を登録してください。';
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
            noImage.textContent = '写真なし';
            imageWrap.appendChild(noImage);
        }

        const body = document.createElement('div');
        body.className = 'visit-log-card-body';

        const shrine = document.createElement('div');
        shrine.className = 'visit-log-shrine';
        shrine.textContent = getShrineName(record);

        const date = document.createElement('div');
        date.className = 'visit-log-date';
        date.textContent = formatDate(record.visitDate);

        const memo = document.createElement('div');
        memo.className = 'visit-log-memo';
        memo.textContent = record.memo || 'メモなし';

        const hint = document.createElement('div');
        hint.className = 'visit-log-open-hint';
        hint.textContent = '記録を開く ›';

        body.append(shrine, date, memo, hint);
        card.append(imageWrap, body);
        return card;
    }

    function getShrineName(record) {
        return record.shrineName || '神社未設定（旧記録）';
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
        const shrine = document.getElementById('log-detail-shrine');
        const date = document.getElementById('log-detail-date');
        const memo = document.getElementById('log-detail-memo');
        const image = document.getElementById('log-detail-image');
        if (!modal || !shrine || !date || !memo || !image) return;

        shrine.textContent = getShrineName(record);
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
