// ============================================================
// 検証版: 神社詳細ローカル編集
// - 元CSVは変更しない
// - localStorageの上書きを window.jinjaData に適用する
// ============================================================
(() => {
    'use strict';

    const STORAGE_KEY = 'goshuin-zukan:shrine-overrides:v1';
    const EDIT_FIELDS = ['name', 'yomi', 'address', 'main_god_ids', 'sub_god_ids', 'description'];
    let applied = false;

    function readOverrides() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            console.warn('[ShrineEdit] override read failed', error);
            return {};
        }
    }

    function writeOverrides(value) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    }

    function applyOverrides() {
        if (!Array.isArray(window.jinjaData) || !window.jinjaData.length) return false;
        const overrides = readOverrides();
        window.jinjaData.forEach(shrine => {
            const patch = overrides[shrine.id];
            if (!patch) return;
            EDIT_FIELDS.forEach(field => {
                if (Object.prototype.hasOwnProperty.call(patch, field)) shrine[field] = patch[field];
            });
            shrine.local_override = '1';
        });
        applied = true;
        window.renderMarkers?.();
        window.renderJinjaList?.();
        return true;
    }

    function waitForData() {
        if (applyOverrides()) {
            installEditor();
            return;
        }
        window.setTimeout(waitForData, 250);
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

    function installEditor() {
        const panel = document.getElementById('detail-panel');
        if (!panel || panel.dataset.shrineEditInstalled === '1') return;
        panel.dataset.shrineEditInstalled = '1';

        const launch = document.createElement('button');
        launch.type = 'button';
        launch.className = 'shrine-edit-launch';
        launch.textContent = '✏️ 編集';
        launch.hidden = true;
        panel.appendChild(launch);

        const sheet = buildSheet();
        panel.appendChild(sheet);

        launch.addEventListener('click', () => openEditor(sheet));

        const observer = new MutationObserver(() => {
            const open = panel.classList.contains('open');
            const shrine = currentShrine();
            launch.hidden = !(open && shrine);
            if (!open) sheet.classList.remove('open');
        });
        observer.observe(panel, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });

        launch.hidden = !(panel.classList.contains('open') && currentShrine());
    }

    function buildSheet() {
        const sheet = document.createElement('section');
        sheet.className = 'shrine-edit-sheet';
        sheet.innerHTML = `
            <div class="shrine-edit-head">
                <h3>✏️ 神社詳細を編集</h3>
                <button type="button" class="shrine-edit-close" aria-label="閉じる">×</button>
            </div>
            <p class="shrine-edit-note">この編集は端末内だけに保存します。元の5,000社マスターCSVは変更しません。</p>
            <form class="shrine-edit-form">
                <label>神社名<input name="name" autocomplete="off"></label>
                <label>読み<input name="yomi" autocomplete="off"></label>
                <label>所在地<input name="address" autocomplete="off"></label>
                <label>主祭神ID<input name="main_god_ids" autocomplete="off" placeholder="K001,K002"></label>
                <label>末社祭神ID<input name="sub_god_ids" autocomplete="off" placeholder="K010,K011"></label>
                <label>説明<textarea name="description"></textarea></label>
                <div class="shrine-edit-actions">
                    <button type="button" class="shrine-edit-cancel">キャンセル</button>
                    <button type="submit" class="shrine-edit-save">保存</button>
                </div>
                <p class="shrine-edit-status" aria-live="polite"></p>
            </form>`;

        sheet.querySelector('.shrine-edit-close')?.addEventListener('click', () => sheet.classList.remove('open'));
        sheet.querySelector('.shrine-edit-cancel')?.addEventListener('click', () => sheet.classList.remove('open'));
        sheet.querySelector('form')?.addEventListener('submit', event => saveEditor(event, sheet));
        return sheet;
    }

    function openEditor(sheet) {
        const shrine = currentShrine();
        if (!shrine) return;
        sheet.dataset.jinjaId = shrine.id;
        EDIT_FIELDS.forEach(field => {
            const input = sheet.querySelector(`[name="${field}"]`);
            if (input) input.value = shrine[field] || '';
        });
        const status = sheet.querySelector('.shrine-edit-status');
        if (status) status.textContent = '';
        sheet.classList.add('open');
    }

    function saveEditor(event, sheet) {
        event.preventDefault();
        const shrineId = sheet.dataset.jinjaId;
        const shrine = Array.isArray(window.jinjaData) ? window.jinjaData.find(item => item.id === shrineId) : null;
        if (!shrine) return;

        const patch = {};
        EDIT_FIELDS.forEach(field => {
            const input = sheet.querySelector(`[name="${field}"]`);
            patch[field] = input ? String(input.value || '').trim() : '';
        });

        const overrides = readOverrides();
        overrides[shrineId] = { ...(overrides[shrineId] || {}), ...patch, updatedAt: new Date().toISOString() };
        writeOverrides(overrides);

        Object.assign(shrine, patch, { local_override: '1' });
        window.renderMarkers?.();
        window.renderJinjaList?.();

        const mapZoom = window.map?.getZoom?.();
        const mapCenter = window.map?.getCenter?.();
        if (typeof window.showDetailPanel === 'function') window.showDetailPanel(shrine);
        if (window.map && mapCenter && Number.isFinite(mapZoom)) {
            window.map.stop?.();
            window.map.setView(mapCenter, mapZoom, { animate: false });
        }

        const status = sheet.querySelector('.shrine-edit-status');
        if (status) status.textContent = '保存しました';
        window.setTimeout(() => sheet.classList.remove('open'), 350);
    }

    document.addEventListener('DOMContentLoaded', waitForData);
    if (document.readyState !== 'loading') waitForData();
})();
