// ============================================================
// 検証版: 神社別アルバム
// - visitLogs の既存 photo と新 photos[] を両方読む
// - 神社詳細に、その神社で撮った写真を参拝日横断で表示
// ============================================================
(() => {
    'use strict';

    const DB_NAME = 'goshuin-zukan';
    const DB_VERSION = 1;
    const STORE_NAME = 'visitLogs';
    let renderedUrls = [];

    document.addEventListener('DOMContentLoaded', install);
    if (document.readyState !== 'loading') install();
    window.addEventListener('goshuin:visit-saved', () => refreshAlbum());

    function install() {
        const detail = document.getElementById('detail-content');
        if (!detail || detail.dataset.shrineAlbumInstalled === '1') return;
        detail.dataset.shrineAlbumInstalled = '1';
        const observer = new MutationObserver(() => refreshAlbum());
        observer.observe(detail, { childList: true, subtree: true });
        refreshAlbum();
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

    function openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
        });
    }

    async function getAllRecords() {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error || new Error('Read failed'));
            tx.oncomplete = () => db.close();
        });
    }

    function photosForRecord(record) {
        if (Array.isArray(record.photos) && record.photos.length) {
            return record.photos.filter(photo => photo instanceof Blob);
        }
        return record.photo instanceof Blob ? [record.photo] : [];
    }

    function clearUrls() {
        renderedUrls.forEach(url => URL.revokeObjectURL(url));
        renderedUrls = [];
    }

    async function refreshAlbum() {
        const detail = document.getElementById('detail-content');
        const shrine = currentShrine();
        if (!detail || !shrine?.id) return;

        const old = detail.querySelector('.shrine-album');
        if (old) old.remove();
        clearUrls();

        let records = [];
        try {
            records = await getAllRecords();
        } catch (error) {
            console.warn('[ShrineAlbum] read failed', error);
            return;
        }

        const visits = records
            .filter(record => record.shrineId === shrine.id)
            .sort((a, b) => String(b.visitDate || '').localeCompare(String(a.visitDate || '')));

        const photoItems = [];
        visits.forEach(record => {
            photosForRecord(record).forEach((blob, index) => {
                photoItems.push({ blob, date: record.visitDate || '', recordId: record.id, index });
            });
        });

        if (!visits.length && !photoItems.length) return;

        const section = document.createElement('section');
        section.className = 'shrine-album';
        section.innerHTML = `
            <div class="shrine-album-head">
                <h3>📷 あなたの写真</h3>
                <span>${photoItems.length}枚 / 参拝${visits.length}回</span>
            </div>
            <div class="shrine-album-grid"></div>`;

        const grid = section.querySelector('.shrine-album-grid');
        if (!photoItems.length) {
            const empty = document.createElement('div');
            empty.className = 'shrine-album-empty';
            empty.textContent = '参拝記録はあります。写真はまだありません。';
            grid.appendChild(empty);
        } else {
            photoItems.forEach(item => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'shrine-album-thumb';
                const url = URL.createObjectURL(item.blob);
                renderedUrls.push(url);
                button.innerHTML = `<img src="${url}" alt="${formatDate(item.date)}の参拝写真"><span>${formatShortDate(item.date)}</span>`;
                button.addEventListener('click', () => openLightbox(url, item.date));
                grid.appendChild(button);
            });
        }

        const quickVisit = detail.querySelector('.quick-visit-box');
        const actions = detail.querySelector('.action-btn-wrapper');
        if (quickVisit?.nextSibling) {
            quickVisit.parentNode.insertBefore(section, quickVisit.nextSibling);
        } else if (actions) {
            actions.parentNode.insertBefore(section, actions);
        } else {
            detail.appendChild(section);
        }
    }

    function openLightbox(url, date) {
        let lightbox = document.querySelector('.shrine-album-lightbox');
        if (!lightbox) {
            lightbox = document.createElement('div');
            lightbox.className = 'shrine-album-lightbox';
            lightbox.innerHTML = `<button type="button" aria-label="閉じる">×</button><img alt="参拝写真"><div class="shrine-album-lightbox-date"></div>`;
            lightbox.querySelector('button')?.addEventListener('click', () => lightbox.classList.remove('open'));
            lightbox.addEventListener('click', event => {
                if (event.target === lightbox) lightbox.classList.remove('open');
            });
            document.body.appendChild(lightbox);
        }
        const img = lightbox.querySelector('img');
        const dateEl = lightbox.querySelector('.shrine-album-lightbox-date');
        if (img) img.src = url;
        if (dateEl) dateEl.textContent = formatDate(date);
        lightbox.classList.add('open');
    }

    function formatDate(value) {
        if (!value) return '日付なし';
        const parts = String(value).split('-');
        if (parts.length !== 3) return value;
        return `${Number(parts[0])}年${Number(parts[1])}月${Number(parts[2])}日`;
    }

    function formatShortDate(value) {
        if (!value) return '';
        const parts = String(value).split('-');
        if (parts.length !== 3) return value;
        return `${Number(parts[1])}/${Number(parts[2])}`;
    }
})();
