// ============================================================
// User Shrine Registration
// 神社データは window.jinjaData に統一し、source_type=official/user で出所を区別する。
// Kim追加分は端末内に保持し、起動時に同じ神社データへ復元する。
// ============================================================
(() => {
    'use strict';

    const STORAGE_KEY = 'goshuin-zukan:user-shrines:v1';
    let addMode = false;
    let selectedLatLng = null;
    let draftMarker = null;
    let mapClickBound = false;
    let initialized = false;

    document.addEventListener('DOMContentLoaded', waitUntilReady);
    if (document.readyState !== 'loading') waitUntilReady();

    function waitUntilReady() {
        if (initialized) return;
        if (!window.map || !Array.isArray(window.jinjaData) || !window.jinjaData.length) {
            window.setTimeout(waitUntilReady, 250);
            return;
        }
        initialized = true;
        tagOfficialShrines();
        mergeSavedShrines();
        installAddButton();
        installModal();
        bindMapClick();
        refreshMap();
    }

    function tagOfficialShrines() {
        window.jinjaData.forEach(shrine => {
            if (!shrine.source_type) shrine.source_type = 'official';
        });
    }

    function loadSavedShrines() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.warn('[UserShrine] 保存済み神社を読めませんでした:', error);
            return [];
        }
    }

    function saveAllUserShrines(rows) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    }

    function mergeSavedShrines() {
        const saved = loadSavedShrines();
        if (!saved.length) return;
        const byId = new Map(window.jinjaData.map(shrine => [shrine.id, shrine]));
        saved.forEach(shrine => {
            shrine.source_type = 'user';
            byId.set(shrine.id, shrine);
        });
        window.jinjaData = Array.from(byId.values());
    }

    function installAddButton() {
        const searchWrap = document.querySelector('.header-search');
        if (!searchWrap || document.getElementById('add-shrine-btn')) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'add-shrine-btn';
        button.className = 'add-shrine-btn';
        button.textContent = '＋ 神社を追加';
        button.title = '地図上に神社を追加する';
        button.addEventListener('click', () => addMode ? cancelAddMode() : startAddMode());
        searchWrap.prepend(button);
    }

    function installModal() {
        if (document.getElementById('user-shrine-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'user-shrine-modal';
        modal.className = 'user-shrine-modal';
        modal.hidden = true;
        modal.innerHTML = `
            <div class="user-shrine-dialog" role="dialog" aria-modal="true" aria-labelledby="user-shrine-title">
                <button type="button" id="user-shrine-close" class="user-shrine-close" aria-label="閉じる">×</button>
                <h2 id="user-shrine-title">⛩ 神社を追加</h2>
                <p class="user-shrine-help">PINの位置に神社を登録します。</p>
                <form id="user-shrine-form">
                    <label>神社名 <span>必須</span>
                        <input id="user-shrine-name" type="text" required autocomplete="off" placeholder="例：○○神社">
                    </label>
                    <label>よみ
                        <input id="user-shrine-yomi" type="text" autocomplete="off" placeholder="例：まるまるじんじゃ">
                    </label>
                    <label>住所
                        <input id="user-shrine-address" type="text" autocomplete="off" placeholder="任意">
                    </label>
                    <label>メモ
                        <textarea id="user-shrine-memo" rows="3" placeholder="由緒・目印など（任意）"></textarea>
                    </label>
                    <div class="user-shrine-position" id="user-shrine-position"></div>
                    <div class="user-shrine-actions">
                        <button type="button" id="user-shrine-cancel">キャンセル</button>
                        <button type="submit" class="jinja-btn">この神社を保存</button>
                    </div>
                    <p id="user-shrine-status" aria-live="polite"></p>
                </form>
            </div>`;
        document.body.appendChild(modal);

        document.getElementById('user-shrine-close')?.addEventListener('click', cancelAddMode);
        document.getElementById('user-shrine-cancel')?.addEventListener('click', cancelAddMode);
        document.getElementById('user-shrine-form')?.addEventListener('submit', saveShrine);
        modal.addEventListener('click', event => {
            if (event.target === modal) cancelAddMode();
        });
    }

    function bindMapClick() {
        if (mapClickBound || !window.map) return;
        mapClickBound = true;
        window.map.on('click', event => {
            if (!addMode) return;
            selectedLatLng = event.latlng;
            showDraftMarker(selectedLatLng);
            openForm();
        });
    }

    function startAddMode() {
        addMode = true;
        selectedLatLng = null;
        clearDraftMarker();
        document.body.classList.add('shrine-add-mode');
        const button = document.getElementById('add-shrine-btn');
        if (button) button.textContent = '× 追加をやめる';
        setMapHint('地図上の神社の位置をクリックしてください');
    }

    function cancelAddMode() {
        addMode = false;
        selectedLatLng = null;
        clearDraftMarker();
        document.body.classList.remove('shrine-add-mode');
        const button = document.getElementById('add-shrine-btn');
        if (button) button.textContent = '＋ 神社を追加';
        const modal = document.getElementById('user-shrine-modal');
        if (modal) modal.hidden = true;
        setMapHint('');
    }

    function setMapHint(text) {
        let hint = document.getElementById('user-shrine-map-hint');
        if (!hint) {
            hint = document.createElement('div');
            hint.id = 'user-shrine-map-hint';
            hint.className = 'user-shrine-map-hint';
            document.getElementById('map-view')?.appendChild(hint);
        }
        hint.textContent = text;
        hint.hidden = !text;
    }

    function showDraftMarker(latlng) {
        clearDraftMarker();
        if (!window.map || typeof L === 'undefined') return;
        const icon = L.divIcon({
            className: 'user-shrine-draft-wrap',
            html: '<div class="user-shrine-draft-pin"><span>＋</span></div>',
            iconSize: [38, 38],
            iconAnchor: [19, 34]
        });
        draftMarker = L.marker([latlng.lat, latlng.lng], { icon, zIndexOffset: 2000 }).addTo(window.map);
    }

    function clearDraftMarker() {
        if (draftMarker && window.map) window.map.removeLayer(draftMarker);
        draftMarker = null;
    }

    function openForm() {
        const modal = document.getElementById('user-shrine-modal');
        if (!modal || !selectedLatLng) return;
        document.getElementById('user-shrine-form')?.reset();
        const position = document.getElementById('user-shrine-position');
        if (position) position.textContent = `PIN：${selectedLatLng.lat.toFixed(6)}, ${selectedLatLng.lng.toFixed(6)}`;
        const status = document.getElementById('user-shrine-status');
        if (status) status.textContent = '';
        modal.hidden = false;
        window.setTimeout(() => document.getElementById('user-shrine-name')?.focus(), 0);
    }

    function saveShrine(event) {
        event.preventDefault();
        if (!selectedLatLng) return;

        const name = String(document.getElementById('user-shrine-name')?.value || '').trim();
        if (!name) return;

        const yomi = String(document.getElementById('user-shrine-yomi')?.value || '').trim();
        const address = String(document.getElementById('user-shrine-address')?.value || '').trim();
        const memo = String(document.getElementById('user-shrine-memo')?.value || '').trim();
        const now = new Date().toISOString();
        const id = createUserShrineId();
        const lat = Number(selectedLatLng.lat.toFixed(7));
        const lng = Number(selectedLatLng.lng.toFixed(7));

        const shrine = {
            id,
            name,
            yomi,
            former_shrine_rank: '',
            shikinaisha_type: '',
            ichinomiya_name: '',
            province: '',
            county: '',
            prefecture: '',
            city: '',
            address,
            lat: String(lat),
            lng: String(lng),
            gmap_url: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
            main_god_ids: '',
            sub_god_ids: '',
            description: memo,
            source_type: 'user',
            created_at: now,
            updated_at: now
        };

        try {
            const saved = loadSavedShrines();
            saved.push(shrine);
            saveAllUserShrines(saved);
            window.jinjaData.push(shrine);

            const modal = document.getElementById('user-shrine-modal');
            if (modal) modal.hidden = true;
            addMode = false;
            document.body.classList.remove('shrine-add-mode');
            const button = document.getElementById('add-shrine-btn');
            if (button) button.textContent = '＋ 神社を追加';
            clearDraftMarker();
            setMapHint('');

            if (window.map) window.map.setView([lat, lng], Math.max(window.map.getZoom(), 15));
            window.setTimeout(() => {
                refreshMap();
                if (typeof window.selectJinja === 'function') window.selectJinja(id);
            }, 100);
        } catch (error) {
            console.error('[UserShrine] 保存に失敗しました:', error);
            const status = document.getElementById('user-shrine-status');
            if (status) status.textContent = '保存できませんでした。もう一度お試しください。';
        }
    }

    function createUserShrineId() {
        const time = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).slice(2, 6).toUpperCase();
        return `U${time}${random}`;
    }

    function refreshMap() {
        if (typeof window.renderJinjaList === 'function') window.renderJinjaList();
        else if (typeof window.renderMarkers === 'function') window.renderMarkers();
    }
})();
