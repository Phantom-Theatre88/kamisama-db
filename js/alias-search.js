// ============================================================
// 神さま v1.0：別名検索連携
// - 神社検索：神社名 / 読み / 住所 / 主祭神 / 配祀神 / 神さま別名
// - 神さま図鑑：正式名 / 読み / 別名
// ============================================================

(() => {
    'use strict';

    const DATA_VERSION = '20260828_13';
    window.kamisamaAliasData = [];
    window.kamisamaAliasesByCanonicalId = new Map();

    document.addEventListener('DOMContentLoaded', () => {
        initAliasSearch();
    });

    async function initAliasSearch() {
        try {
            if (window.d3?.csv) {
                const rows = await window.d3.csv(`data/kamisama_alias.csv?v=${DATA_VERSION}`);
                window.kamisamaAliasData = rows.map(sanitizeObject);
                buildAliasIndex();
            }
        } catch (error) {
            console.warn('神さま別名CSVの読み込みに失敗しました:', error);
        }

        await waitForKamisamaData();
        normalizeGodFields();
        installShrineFilterOverride();
        installSearchHooks();
        applyGodListSearch();
    }

    function sanitizeObject(obj) {
        const clean = {};
        Object.keys(obj || {}).forEach(key => {
            const cleanKey = String(key).replace(/^\uFEFF/, '').trim();
            const value = obj[key];
            clean[cleanKey] = typeof value === 'string' ? value.trim() : value;
        });
        return clean;
    }

    function buildAliasIndex() {
        const map = new Map();
        window.kamisamaAliasData.forEach(alias => {
            const canonicalId = alias.canonical_id;
            if (!canonicalId || !alias.alias_name) return;
            if (!map.has(canonicalId)) map.set(canonicalId, []);
            map.get(canonicalId).push(alias);
        });
        window.kamisamaAliasesByCanonicalId = map;
    }

    function waitForKamisamaData() {
        return new Promise(resolve => {
            if (Array.isArray(window.kamisamaData) && window.kamisamaData.length > 0) {
                resolve();
                return;
            }
            let tries = 0;
            const timer = window.setInterval(() => {
                tries += 1;
                if ((Array.isArray(window.kamisamaData) && window.kamisamaData.length > 0) || tries >= 40) {
                    window.clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    }

    function normalizeGodFields() {
        if (!Array.isArray(window.kamisamaData)) return;
        window.kamisamaData.forEach(god => {
            if (!god.system && god.system_type) god.system = god.system_type;
        });
    }

    function installShrineFilterOverride() {
        // app.js の renderMarkers / renderJinjaList が参照する filterData を差し替える。
        window.filterData = function aliasAwareFilterData() {
            const data = Array.isArray(window.jinjaData) ? window.jinjaData : [];
            const query = getSearchQuery();
            if (!query) return data;

            return data.filter(jinja => {
                if ([jinja.name, jinja.yomi, jinja.address, jinja.prefecture, jinja.city]
                    .some(value => includesQuery(value, query))) {
                    return true;
                }

                return parseGodIds(jinja.main_god_ids)
                    .concat(parseGodIds(jinja.sub_god_ids))
                    .some(id => godMatchesQuery(id, query));
            });
        };
    }

    function installSearchHooks() {
        const search = document.getElementById('jinja-search');
        if (search) {
            search.placeholder = '🔍 神社名・神さま名・別名で検索...';
            search.addEventListener('input', () => {
                window.setTimeout(applyGodListSearch, 0);
            });
        }

        const godTab = document.querySelector('.nav-tab[data-view="god-view"]');
        if (godTab) {
            godTab.addEventListener('click', () => window.setTimeout(applyGodListSearch, 0));
        }

        document.querySelectorAll('.god-cat-tab').forEach(button => {
            button.addEventListener('click', () => window.setTimeout(applyGodListSearch, 0));
        });
    }

    function applyGodListSearch() {
        const list = document.getElementById('god-daicho-list');
        if (!list) return;
        const query = getSearchQuery();

        list.querySelectorAll('li[data-god-id]').forEach(li => {
            const id = li.dataset.godId;
            li.hidden = Boolean(query) && !godMatchesQuery(id, query);
        });
    }

    function godMatchesQuery(godId, query) {
        const god = window.kamisamaMap instanceof Map ? window.kamisamaMap.get(godId) : null;
        if (god && [god.name, god.yomi, god.description].some(value => includesQuery(value, query))) {
            return true;
        }

        const aliases = window.kamisamaAliasesByCanonicalId instanceof Map
            ? (window.kamisamaAliasesByCanonicalId.get(godId) || [])
            : [];

        return aliases.some(alias =>
            [alias.alias_name, alias.alias_type].some(value => includesQuery(value, query))
        );
    }

    function parseGodIds(value) {
        return String(value || '')
            .split(/[,|、\s]+/)
            .map(id => id.trim())
            .filter(Boolean);
    }

    function getSearchQuery() {
        return String(document.getElementById('jinja-search')?.value || '').trim();
    }

    function includesQuery(value, query) {
        return String(value || '').includes(query);
    }
})();
