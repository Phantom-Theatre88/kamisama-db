// Tier 2 scale UI
// 数千社を保持したまま、地図を主役にして一覧は現在の表示範囲だけを出す。
(() => {
    'use strict';

    const BULK_MARKER_THRESHOLD = 700;
    const DEFAULT_VISIBLE_LIMIT = 80;
    const SEARCH_LIMIT = 300;
    let drawerBound = false;
    let mapBound = false;

    function validLatLng(jinja) {
        const rawLat = String(jinja?.lat ?? '').trim();
        const rawLng = String(jinja?.lng ?? '').trim();
        if (!rawLat || !rawLng) return null;
        const lat = Number(rawLat);
        const lng = Number(rawLng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
        return { lat, lng };
    }

    function isInsideCurrentMap(pos) {
        if (!window.map || !pos) return false;
        const bounds = window.map.getBounds();
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        if (!sw || !ne) return false;

        const latInside = pos.lat >= sw.lat && pos.lat <= ne.lat;
        let lngInside;
        if (sw.lng <= ne.lng) {
            lngInside = pos.lng >= sw.lng && pos.lng <= ne.lng;
        } else {
            lngInside = pos.lng >= sw.lng || pos.lng <= ne.lng;
        }
        return latInside && lngInside;
    }

    function currentListRows() {
        if (typeof window.filterData !== 'function') return { rows: [], total: 0, mode: 'map' };
        const filtered = window.filterData();
        const query = document.getElementById('jinja-search')?.value?.trim() || '';

        if (query) {
            return { rows: filtered.slice(0, SEARCH_LIMIT), total: filtered.length, mode: 'search' };
        }
        if (!window.map) return { rows: [], total: 0, mode: 'map' };

        const visible = filtered.filter(jinja => isInsideCurrentMap(validLatLng(jinja)));
        return { rows: visible.slice(0, DEFAULT_VISIBLE_LIMIT), total: visible.length, mode: 'map' };
    }

    function ensureBottomSheetUI() {
        const sidebar = document.getElementById('sidebar');
        const toggle = document.getElementById('sidebar-toggle');
        const heading = document.querySelector('.jinja-list-container h3');
        if (!sidebar || !toggle || !heading) return;

        sidebar.classList.add('tier2-bottom-sheet');
        sidebar.classList.remove('collapsed', 'expanded');

        if (!document.getElementById('tier2-list-count')) {
            const count = document.createElement('span');
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
                if (open) window.renderJinjaList();
            }, true);
        }
    }

    function bindMapListSync() {
        if (mapBound || !window.map) return Boolean(window.map);
        mapBound = true;
        const refresh = () => window.requestAnimationFrame(() => window.renderJinjaList());
        window.map.on('moveend', refresh);
        window.map.on('zoomend', refresh);
        refresh();
        return true;
    }

    window.renderMarkers = function() {
        if (!window.markersLayer || typeof window.filterData !== 'function') return;
        window.markersLayer.clearLayers();
        const filteredJinja = window.filterData();
        const useLightMarkers = filteredJinja.length > BULK_MARKER_THRESHOLD;

        filteredJinja.forEach(jinja => {
            const pos = validLatLng(jinja);
            if (!pos) return;
            let marker;
            if (useLightMarkers) {
                marker = L.circleMarker([pos.lat, pos.lng], {
                    radius: 4,
                    weight: 1,
                    opacity: 0.9,
                    fillOpacity: 0.72,
                    className: 'tier2-dot-marker',
                    title: jinja.name || ''
                });
                marker.options.title = jinja.name || '';
            } else {
                const iconHtml = `<div style="width:32px;height:32px;background-color:#f4efd3;border:2px solid #8c1d1d;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;justify-content:center;align-items:center;font-size:18px;line-height:1;cursor:pointer;">⛩</div>`;
                const icon = L.divIcon({ className: 'custom-torii-marker', html: iconHtml, iconSize: [32, 32], iconAnchor: [16, 16] });
                marker = L.marker([pos.lat, pos.lng], { icon, title: jinja.name || '' });
            }
            marker.on('click', () => window.selectJinja(jinja.id));
            window.markersLayer.addLayer(marker);
        });
    };

    window.renderJinjaList = function() {
        const listEl = document.getElementById('jinja-list');
        if (!listEl) return;
        ensureBottomSheetUI();

        const { rows, total, mode } = currentListRows();
        listEl.innerHTML = '';
        const fragment = document.createDocumentFragment();

        rows.forEach(jinja => {
            const li = document.createElement('li');
            li.dataset.jinjaId = jinja.id;
            const location = [jinja.prefecture, jinja.city].filter(Boolean).join(' ') || jinja.province || '';
            const type = jinja.shikinaisha_type || jinja.ichinomiya_name || (jinja.db_tier ? `Tier ${jinja.db_tier}` : '');
            li.innerHTML = `
                <div class="list-shrine-name">${jinja.name || ''}</div>
                <div class="list-shrine-meta">${location || '所在地情報なし'}${type ? ` · ${type}` : ''}</div>`;
            li.addEventListener('click', () => window.selectJinja(jinja.id));
            fragment.appendChild(li);
        });

        if (!rows.length) {
            const empty = document.createElement('li');
            empty.className = 'tier2-list-note';
            empty.textContent = mode === 'search' ? '検索結果がありません。' : 'この地図範囲には登録神社がありません。';
            fragment.appendChild(empty);
        } else if (total > rows.length) {
            const more = document.createElement('li');
            more.className = 'tier2-list-note';
            more.textContent = mode === 'search'
                ? `${total.toLocaleString()}社中 ${rows.length.toLocaleString()}社を表示`
                : `地図内 ${total.toLocaleString()}社中 ${rows.length.toLocaleString()}社を表示。地図を拡大すると絞れます。`;
            fragment.appendChild(more);
        }

        listEl.appendChild(fragment);
        const count = document.getElementById('tier2-list-count');
        if (count) count.textContent = mode === 'search' ? `検索 ${total.toLocaleString()}社` : `地図内 ${total.toLocaleString()}社`;
    };

    document.addEventListener('DOMContentLoaded', () => {
        ensureBottomSheetUI();
        if (!bindMapListSync()) {
            const timer = setInterval(() => {
                if (bindMapListSync()) clearInterval(timer);
            }, 100);
            setTimeout(() => clearInterval(timer), 10000);
        }
    });
})();
