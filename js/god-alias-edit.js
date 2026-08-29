// ============================================================
// 検証版: 神さま別名・異表記ローカル編集
// - 元CSVは変更しない
// - localStorageへ追加分を保存
// - kamisamaAliasesByCanonicalIdへ即時反映
// ============================================================
(() => {
    'use strict';

    const STORAGE_KEY = 'goshuin-zukan:god-alias-overrides:v1';
    const LOCAL_FLAG = 'local';

    function readLocalAliases() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const rows = raw ? JSON.parse(raw) : [];
            return Array.isArray(rows) ? rows : [];
        } catch (error) {
            console.warn('[GodAliasEdit] local alias read failed', error);
            return [];
        }
    }

    function writeLocalAliases(rows) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    }

    function normalize(value) {
        return String(value || '').trim();
    }

    function mergeLocalAliases() {
        if (!(window.kamisamaAliasesByCanonicalId instanceof Map)) return false;
        if (!Array.isArray(window.kamisamaAliasData) || !window.kamisamaAliasData.length) return false;

        const locals = readLocalAliases();
        const baseRows = window.kamisamaAliasData.filter(row => row?.source_type !== LOCAL_FLAG);
        const merged = [...baseRows];

        locals.forEach(row => {
            const canonicalId = normalize(row.canonical_id);
            const aliasName = normalize(row.alias_name);
            if (!canonicalId || !aliasName) return;
            const duplicate = merged.some(existing =>
                normalize(existing.canonical_id) === canonicalId &&
                normalize(existing.alias_name) === aliasName
            );
            if (!duplicate) merged.push({ ...row, source_type: LOCAL_FLAG });
        });

        window.kamisamaAliasData = merged;
        const map = new Map();
        merged.forEach(row => {
            const canonicalId = normalize(row.canonical_id);
            if (!canonicalId || !normalize(row.alias_name)) return;
            if (!map.has(canonicalId)) map.set(canonicalId, []);
            map.get(canonicalId).push(row);
        });
        window.kamisamaAliasesByCanonicalId = map;
        return true;
    }

    function currentGodId() {
        return document.querySelector('#god-daicho-list li.selected[data-god-id]')?.dataset.godId || '';
    }

    function aliasesFor(id) {
        return window.kamisamaAliasesByCanonicalId instanceof Map
            ? (window.kamisamaAliasesByCanonicalId.get(id) || [])
            : [];
    }

    function installUi() {
        const profile = document.getElementById('god-profile-display');
        const host = document.getElementById('god-tab-detail-content');
        if (!profile || !host) return false;

        if (!host.querySelector('.god-alias-edit-sheet')) {
            host.appendChild(buildSheet());
        }

        const ensureButton = () => {
            const godId = currentGodId();
            const h2 = profile.querySelector('h2');
            if (!godId || !h2 || profile.querySelector('.god-alias-edit-launch')) return;

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'god-alias-edit-launch';
            button.textContent = '✏️ 別名編集';
            button.addEventListener('click', () => openEditor(godId));
            h2.insertAdjacentElement('afterend', button);
        };

        const observer = new MutationObserver(() => window.setTimeout(ensureButton, 0));
        observer.observe(profile, { childList: true, subtree: true });
        ensureButton();
        return true;
    }

    function buildSheet() {
        const sheet = document.createElement('section');
        sheet.className = 'god-alias-edit-sheet';
        sheet.innerHTML = `
            <div class="god-alias-edit-head">
                <h3>✏️ 別名・異表記を編集</h3>
                <button type="button" class="god-alias-edit-close" aria-label="閉じる">×</button>
            </div>
            <p class="god-alias-edit-note">追加内容はこの端末内だけに保存します。神さま本体のID・正式名は変更しません。</p>
            <div class="god-alias-current-name"></div>
            <div class="god-alias-list" data-role="alias-list"></div>
            <form class="god-alias-add-form">
                <label>別名・異表記<input name="alias_name" required autocomplete="off" placeholder="例：大國主神"></label>
                <label>読み<input name="alias_yomi" autocomplete="off" placeholder="任意"></label>
                <label>種類
                    <select name="alias_type">
                        <option value="異表記">異表記</option>
                        <option value="別名">別名</option>
                        <option value="旧字">旧字</option>
                        <option value="神社表記">神社表記</option>
                        <option value="命尊違い">命／尊違い</option>
                        <option value="読み違い">読み違い</option>
                    </select>
                </label>
                <button type="submit" class="god-alias-add-btn">＋ この表記を追加</button>
                <p class="god-alias-edit-status" aria-live="polite"></p>
            </form>`;

        sheet.querySelector('.god-alias-edit-close')?.addEventListener('click', () => sheet.classList.remove('open'));
        sheet.querySelector('form')?.addEventListener('submit', event => {
            event.preventDefault();
            addAlias(sheet);
        });
        return sheet;
    }

    function openEditor(godId) {
        const sheet = document.querySelector('.god-alias-edit-sheet');
        const god = window.kamisamaMap instanceof Map ? window.kamisamaMap.get(godId) : null;
        if (!sheet || !god) return;
        sheet.dataset.godId = godId;
        const title = sheet.querySelector('.god-alias-current-name');
        if (title) title.textContent = `${god.name || godId}（${god.yomi || ''}）`;
        const status = sheet.querySelector('.god-alias-edit-status');
        if (status) status.textContent = '';
        renderAliasList(sheet);
        sheet.classList.add('open');
    }

    function renderAliasList(sheet) {
        const godId = sheet.dataset.godId;
        const list = sheet.querySelector('[data-role="alias-list"]');
        if (!list) return;
        list.innerHTML = '';

        const rows = aliasesFor(godId);
        if (!rows.length) {
            list.innerHTML = '<div class="god-alias-empty">登録された別名・異表記はありません。</div>';
            return;
        }

        rows.forEach(row => {
            const item = document.createElement('div');
            item.className = 'god-alias-row';
            const type = normalize(row.alias_type) || '別名';
            const yomi = normalize(row.alias_yomi);
            const isLocal = row.source_type === LOCAL_FLAG;
            item.innerHTML = `
                <div class="god-alias-row-main">
                    <strong>${normalize(row.alias_name)}</strong>
                    ${yomi ? `<span>${yomi}</span>` : ''}
                    <small>${type}${isLocal ? '・端末追加' : '・マスター'}</small>
                </div>`;

            if (isLocal) {
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'god-alias-remove';
                remove.textContent = '削除';
                remove.addEventListener('click', () => removeAlias(godId, row.alias_name, sheet));
                item.appendChild(remove);
            }
            list.appendChild(item);
        });
    }

    function addAlias(sheet) {
        const godId = sheet.dataset.godId;
        const form = sheet.querySelector('form');
        if (!godId || !form) return;

        const aliasName = normalize(form.elements.alias_name?.value);
        const aliasYomi = normalize(form.elements.alias_yomi?.value);
        const aliasType = normalize(form.elements.alias_type?.value) || '異表記';
        const status = sheet.querySelector('.god-alias-edit-status');
        if (!aliasName) return;

        const alreadyExists = aliasesFor(godId).some(row => normalize(row.alias_name) === aliasName);
        if (alreadyExists) {
            if (status) status.textContent = 'この表記はすでに登録されています。';
            return;
        }

        const locals = readLocalAliases();
        locals.push({
            canonical_id: godId,
            alias_name: aliasName,
            alias_yomi: aliasYomi,
            alias_type: aliasType,
            source_type: LOCAL_FLAG,
            updatedAt: new Date().toISOString()
        });
        writeLocalAliases(locals);
        mergeLocalAliases();
        form.reset();
        renderAliasList(sheet);
        if (status) status.textContent = '追加しました。祭神検索にも反映されています。';
        document.getElementById('jinja-search')?.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function removeAlias(godId, aliasName, sheet) {
        const locals = readLocalAliases().filter(row => !(
            normalize(row.canonical_id) === godId && normalize(row.alias_name) === normalize(aliasName)
        ));
        writeLocalAliases(locals);
        mergeLocalAliases();
        renderAliasList(sheet);
        const status = sheet.querySelector('.god-alias-edit-status');
        if (status) status.textContent = '端末追加の表記を削除しました。';
        document.getElementById('jinja-search')?.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function waitUntilReady() {
        const ready = Array.isArray(window.kamisamaData) && window.kamisamaData.length > 0 &&
            Array.isArray(window.kamisamaAliasData) && window.kamisamaAliasData.length > 0 &&
            window.kamisamaAliasesByCanonicalId instanceof Map;

        if (ready) {
            mergeLocalAliases();
            installUi();
            return;
        }
        window.setTimeout(waitUntilReady, 200);
    }

    document.addEventListener('DOMContentLoaded', waitUntilReady);
    if (document.readyState !== 'loading') waitUntilReady();
})();
