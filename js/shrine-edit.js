// ============================================================
// 検証版: 神社詳細ローカル編集
// - 元CSVは変更しない
// - localStorageの上書きを window.jinjaData に適用する
// - 祭神は神さま検索UIで選択し、保存時のみID列へ戻す
// ============================================================
(() => {
    'use strict';

    const STORAGE_KEY = 'goshuin-zukan:shrine-overrides:v1';
    const EDIT_FIELDS = ['name', 'yomi', 'address', 'main_god_ids', 'sub_god_ids', 'description'];
    const TEXT_FIELDS = ['name', 'yomi', 'address', 'description'];

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
        window.renderMarkers?.();
        window.renderJinjaList?.();
        return true;
    }

    function waitForData() {
        if (applyOverrides() && Array.isArray(window.kamisamaData) && window.kamisamaData.length) {
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

    function parseIds(value) {
        return String(value || '')
            .split(/[,|、\s]+/)
            .map(id => id.trim())
            .filter(Boolean);
    }

    function godById(id) {
        if (window.kamisamaMap instanceof Map) return window.kamisamaMap.get(id) || null;
        return Array.isArray(window.kamisamaData)
            ? window.kamisamaData.find(god => god.id === id) || null
            : null;
    }

    function aliasesForGod(id) {
        if (!(window.kamisamaAliasesByCanonicalId instanceof Map)) return [];
        return window.kamisamaAliasesByCanonicalId.get(id) || [];
    }

    function godMatches(god, query) {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return true;
        const core = [god.name, god.yomi, god.id, god.description]
            .some(value => String(value || '').toLowerCase().includes(q));
        if (core) return true;
        return aliasesForGod(god.id).some(alias =>
            [alias.alias_name, alias.alias_yomi, alias.alias_type]
                .some(value => String(value || '').toLowerCase().includes(q))
        );
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

                ${godPickerMarkup('main', '主祭神')}
                ${godPickerMarkup('sub', '末社祭神')}

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

        ['main', 'sub'].forEach(type => bindGodPicker(sheet, type));
        return sheet;
    }

    function godPickerMarkup(type, label) {
        return `
            <div class="god-picker" data-picker="${type}">
                <div class="god-picker-label">${label}</div>
                <div class="god-picker-tags" data-role="tags"></div>
                <div class="god-picker-search-wrap">
                    <input type="search" data-role="search" placeholder="神さま名・読み・別名で検索" autocomplete="off">
                    <div class="god-picker-results" data-role="results" hidden></div>
                </div>
            </div>`;
    }

    function bindGodPicker(sheet, type) {
        const picker = sheet.querySelector(`[data-picker="${type}"]`);
        const search = picker?.querySelector('[data-role="search"]');
        const results = picker?.querySelector('[data-role="results"]');
        if (!picker || !search || !results) return;

        picker._selectedIds = [];

        search.addEventListener('input', () => renderGodResults(picker));
        search.addEventListener('focus', () => renderGodResults(picker));
        search.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                results.hidden = true;
                search.blur();
            }
        });
    }

    function setPickerSelection(picker, ids) {
        picker._selectedIds = [...new Set(ids.filter(id => godById(id)))];
        renderGodTags(picker);
        const search = picker.querySelector('[data-role="search"]');
        if (search) search.value = '';
        const results = picker.querySelector('[data-role="results"]');
        if (results) results.hidden = true;
    }

    function renderGodTags(picker) {
        const tags = picker.querySelector('[data-role="tags"]');
        if (!tags) return;
        tags.innerHTML = '';

        const ids = Array.isArray(picker._selectedIds) ? picker._selectedIds : [];
        if (!ids.length) {
            const empty = document.createElement('span');
            empty.className = 'god-picker-empty';
            empty.textContent = '未選択';
            tags.appendChild(empty);
            return;
        }

        ids.forEach(id => {
            const god = godById(id);
            if (!god) return;
            const tag = document.createElement('button');
            tag.type = 'button';
            tag.className = 'god-picker-tag';
            tag.innerHTML = `<span>${god.name || id}</span><span class="god-picker-tag-remove">×</span>`;
            tag.title = `${god.name || id} を外す`;
            tag.addEventListener('click', () => {
                picker._selectedIds = picker._selectedIds.filter(selectedId => selectedId !== id);
                renderGodTags(picker);
                renderGodResults(picker);
            });
            tags.appendChild(tag);
        });
    }

    function renderGodResults(picker) {
        const search = picker.querySelector('[data-role="search"]');
        const results = picker.querySelector('[data-role="results"]');
        if (!search || !results) return;

        const selected = new Set(Array.isArray(picker._selectedIds) ? picker._selectedIds : []);
        const query = search.value.trim();
        const matches = (Array.isArray(window.kamisamaData) ? window.kamisamaData : [])
            .filter(god => !selected.has(god.id) && godMatches(god, query))
            .slice(0, query ? 20 : 12);

        results.innerHTML = '';
        matches.forEach(god => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'god-picker-result';
            button.innerHTML = `
                <span class="god-picker-result-name">${god.name || god.id}</span>
                <span class="god-picker-result-yomi">${god.yomi || ''}</span>`;
            button.addEventListener('click', () => {
                picker._selectedIds = [...picker._selectedIds, god.id];
                renderGodTags(picker);
                search.value = '';
                renderGodResults(picker);
                search.focus();
            });
            results.appendChild(button);
        });

        if (!matches.length) {
            const empty = document.createElement('div');
            empty.className = 'god-picker-no-result';
            empty.textContent = query ? '候補がありません' : '追加できる神さまがありません';
            results.appendChild(empty);
        }
        results.hidden = false;
    }

    function openEditor(sheet) {
        const shrine = currentShrine();
        if (!shrine) return;
        sheet.dataset.jinjaId = shrine.id;

        TEXT_FIELDS.forEach(field => {
            const input = sheet.querySelector(`[name="${field}"]`);
            if (input) input.value = shrine[field] || '';
        });

        const mainPicker = sheet.querySelector('[data-picker="main"]');
        const subPicker = sheet.querySelector('[data-picker="sub"]');
        if (mainPicker) setPickerSelection(mainPicker, parseIds(shrine.main_god_ids));
        if (subPicker) setPickerSelection(subPicker, parseIds(shrine.sub_god_ids));

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
        TEXT_FIELDS.forEach(field => {
            const input = sheet.querySelector(`[name="${field}"]`);
            patch[field] = input ? String(input.value || '').trim() : '';
        });

        const mainPicker = sheet.querySelector('[data-picker="main"]');
        const subPicker = sheet.querySelector('[data-picker="sub"]');
        patch.main_god_ids = Array.isArray(mainPicker?._selectedIds) ? mainPicker._selectedIds.join(',') : '';
        patch.sub_god_ids = Array.isArray(subPicker?._selectedIds) ? subPicker._selectedIds.join(',') : '';

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
