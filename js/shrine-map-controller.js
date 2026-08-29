// ============================================================
// Shrine Map Controller
// 神社マップの検索・表示範囲・一覧・マーカーをここだけで決定する。
// ============================================================
(() => {
    'use strict';

    const LIST_LIMIT = 100;
    const SEARCH_LIMIT = 300;
    const BULK_THRESHOLD = 700;
    let initialized = false;
    let drawerBound = false;

    const toPos = shrine => {
        const lat = Number(String(shrine?.lat ?? '').trim());
        const lng = Number(String(shrine?.lng ?? '').trim());
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
        return { lat, lng };
    };

    const queryText = () => String(document.getElementById('jinja-search')?.value || '').trim();

    const parseGodIds = value => String(value || '')
        .split(/[,|、\s]+/)
        .map(v => v.trim())
        .filter(Boolean);

    const includes = (value, q) => String(value || '').includes(q);

    function godMatches(id, q) {
        const god = window.kamisamaMap instanceof Map ? window.kamisamaMap.get(id) : null;
        if (god && [god.name, god.yomi, god.description].some(v => includes(v, q))) return true;
        const aliases = window.kamisamaAliasesByCanonicalId instanceof Map
            ? (window.kamisamaAliasesByCanonicalId.get(id) || [])
            : [];
        return aliases.some(a => [a.alias_name, a.alias_type].some(v => includes(v, q)));
    }

    function matchesSearch(shrine, q) {
        if (!q) return true;
        if ([shrine.name, shrine.yomi, shrine.address, shrine.prefecture, shrine.city, shrine.province]
            .some(v => includes(v, q))) return true;
        return parseGodIds(shrine.main_god_ids)
            .concat(parseGodIds(shrine.sub_god_ids))
            .some(id => godMatches(id, q));
    }

    function mapBoundsNumbers() {
        if (!window.map || typeof window.map.getBounds !== 'function') return null;
        const b = window.map.getBounds();
        const sw = b.getSouthWest();
        const ne = b.getNorthEast();
        if (![sw?.lat, sw?.lng, ne?.lat, ne?.lng].every(Number.isFinite)) return null;
        return { south: sw.lat, west: sw.lng, north: ne.lat, east: ne.lng };
    }

    function insideBounds(pos, b) {
        if (!pos || !b) return false;
        if (pos.lat < b.south || pos.lat > b.north) return false;
        return b.west <= b.east
            ? pos.lng >= b.west && pos.lng <= b.east
            : pos.lng >= b.west || pos.lng <= b.east;
    }

    function computeState() {
        const all = Array.isArray(window.jinjaData) ? window.jinjaData : [];
        const q = queryText();
        const searched = q ? all.filter(s => matchesSearch(s, q)) : all;
        const bounds = mapBoundsNumbers();
        const visible = bounds
            ? searched.filter(s => insideBounds(toPos(s), bounds))
            : [];
        return { all, q, searched, visible, bounds };
    }

    function ensureDrawer() {
        const sidebar = document.getElementById('sidebar');
        const toggle = document.getElementById('sidebar-toggle');
        const heading = document.querySelector('.jinja-list-container h3');
        if (!sidebar || !toggle || !heading) return;

        sidebar.classList.add('tier2-bottom-sheet');
        sidebar.classList.remove('collapsed', 'expanded');

        let count = document.getElementById('tier2-list-count');
        if (!count) {
            count = document.createElement('span');
            count.id = 'tier2-list-count';
            count.className = 'tier2-list-count';
            heading.appendChild(count);
        }

        if (!drawerBound) {
            drawerBound = true;
            toggle.textContent = '⌃ 神社一覧';
            toggle.setAttribute('aria-expanded', 'false');
            toggle.addEventListener('click', event => {
                event.preventDefault();
                event.stopImmediatePropagation();
                const open = sidebar.classList.toggle('sheet-open');
                sidebar.classList.remove('collapsed', 'expanded');
                toggle.textContent = open ? '⌄ 一覧を隠す' : '⌃ 神社一覧';
                toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
                if (open) refresh();
            }, true);
        }
    }

    function renderList(state) {
        const list = document.getElementById('jinja-list');
        if (!list) return;
        ensureDrawer();

        // 検索中も「現在の地図範囲」を優先する。
        // 検索結果が地図外にしか無い場合は searched を表示し、選択時にその神社へ移動できる。
        const source = state.q && state.visible.length === 0 ? state.searched : state.visible;
        const limit = state.q ? SEARCH_LIMIT : LIST_LIMIT;
        const rows = source.slice(0, limit);

        list.innerHTML = '';
        const frag = document.createDocumentFragment();
        rows.forEach(shrine => {
            const li = document.createElement('li');
            li.dataset.jinjaId = shrine.id;
            const location = [shrine.prefecture, shrine.city].filter(Boolean).join(' ') || shrine.province || '';
            li.innerHTML = `
                <div class="list-shrine-name">${shrine.name || ''}</div>
                <div class="list-shrine-meta">${location || shrine.yomi || '所在地情報なし'}</div>`;
            li.addEventListener('click', () => {
                const pos = toPos(shrine);
                if (pos && window.map) window.map.setView([pos.lat, pos.lng], Math.max(window.map.getZoom(), 13));
                if (typeof window.selectJinja === 'function') window.selectJinja(shrine.id);
            });
            frag.appendChild(li);
        });

        if (!rows.length) {
            const li = document.createElement('li');
            li.className = 'tier2-list-note';
            li.textContent = state.q ? '条件に合う神社がありません。' : 'この地図範囲には登録神社がありません。';
            frag.appendChild(li);
        } else if (source.length > rows.length) {
            const li = document.createElement('li');
            li.className = 'tier2-list-note';
            li.textContent = `${source.length.toLocaleString()}社中 ${rows.length.toLocaleString()}社を表示。地図を拡大すると絞れます。`;
            frag.appendChild(li);
        }
        list.appendChild(frag);

        const count = document.getElementById('tier2-list-count');
        if (count) {
            count.textContent = state.q && state.visible.length === 0
                ? `検索 ${state.searched.length.toLocaleString()}社`
                : `地図内 ${state.visible.length.toLocaleString()}社`;
        }
    }

    function renderMarkersFromState(state) {
        if (!window.markersLayer || typeof L === 'undefined') return;
        window.markersLayer.clearLayers();

        // 地図上には現在の表示範囲だけを描画する。パン後に再生成する。
        const source = state.visible;
        const useLight = source.length > BULK_THRESHOLD;
        source.forEach(shrine => {
            const pos = toPos(shrine);
            if (!pos) return;
            let marker;
            if (useLight) {
                marker = L.circleMarker([pos.lat, pos.lng], {
                    radius: 4, weight: 1, opacity: .9, fillOpacity: .72,
                    className: 'tier2-dot-marker', title: shrine.name || ''
                });
            } else {
                const icon = L.divIcon({
                    className: 'custom-torii-marker',
                    html: '<div style="width:32px;height:32px;background:#f4efd3;border:2px solid #8c1d1d;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:18px">⛩</div>',
                    iconSize: [32, 32], iconAnchor: [16, 16]
                });
                marker = L.marker([pos.lat, pos.lng], { icon, title: shrine.name || '' });
            }
            marker.on('click', () => window.selectJinja?.(shrine.id));
            window.markersLayer.addLayer(marker);
        });
    }

    function refresh() {
        if (!window.map || !Array.isArray(window.jinjaData)) return;
        const state = computeState();
        renderList(state);
        renderMarkersFromState(state);
        window.__shrineMapState = {
            query: state.q,
            total: state.all.length,
            searched: state.searched.length,
            visible: state.visible.length,
            bounds: state.bounds
        };
    }

    function init() {
        if (initialized || !window.map || !window.markersLayer || !Array.isArray(window.jinjaData) || !window.jinjaData.length) return false;
        initialized = true;
        ensureDrawer();

        // 既存コードから呼ばれる入口も、このコントローラに統一。
        window.renderJinjaList = refresh;
        window.renderMarkers = refresh;
        window.filterData = () => computeState().searched;

        const schedule = () => window.requestAnimationFrame(refresh);
        window.map.on('moveend', schedule);
        window.map.on('zoomend', schedule);
        document.getElementById('jinja-search')?.addEventListener('input', schedule);

        refresh();
        console.log('[ShrineMapController] ready', window.__shrineMapState);
        return true;
    }

    function waitUntilReady() {
        if (init()) return;
        window.setTimeout(waitUntilReady, 250);
    }

    document.addEventListener('DOMContentLoaded', waitUntilReady);
    if (document.readyState !== 'loading') waitUntilReady();
})();
