// Tier 2 scale UI
// 数千社を保持したまま、地図と一覧の描画負荷だけを抑える。
(() => {
    'use strict';

    const BULK_MARKER_THRESHOLD = 700;
    const DEFAULT_LIST_LIMIT = 600;

    window.renderMarkers = function() {
        if (!window.markersLayer || typeof window.filterData !== 'function') return;
        window.markersLayer.clearLayers();
        const filteredJinja = window.filterData();
        const useLightMarkers = filteredJinja.length > BULK_MARKER_THRESHOLD;

        filteredJinja.forEach(jinja => {
            const lat = Number(jinja.lat);
            const lng = Number(jinja.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

            let marker;
            if (useLightMarkers) {
                marker = L.circleMarker([lat, lng], {
                    radius: 4,
                    weight: 1,
                    opacity: 0.9,
                    fillOpacity: 0.72,
                    className: 'tier2-dot-marker',
                    title: jinja.name || ''
                });
                marker.options.title = jinja.name || '';
            } else {
                const iconHtml = `
                    <div style="
                        width:32px;height:32px;background-color:#f4efd3;
                        border:2px solid #8c1d1d;border-radius:50%;
                        box-shadow:0 2px 6px rgba(0,0,0,.4);
                        display:flex;justify-content:center;align-items:center;
                        font-size:18px;line-height:1;cursor:pointer;
                    ">⛩</div>`;
                const icon = L.divIcon({
                    className: 'custom-torii-marker',
                    html: iconHtml,
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                });
                marker = L.marker([lat, lng], { icon, title: jinja.name || '' });
            }

            marker.on('click', () => window.selectJinja(jinja.id));
            window.markersLayer.addLayer(marker);
        });
    };

    window.renderJinjaList = function() {
        const listEl = document.getElementById('jinja-list');
        if (!listEl || typeof window.filterData !== 'function') return;

        listEl.innerHTML = '';
        const filteredJinja = window.filterData();
        const hasSearch = Boolean(document.getElementById('jinja-search')?.value?.trim());
        const rows = hasSearch ? filteredJinja : filteredJinja.slice(0, DEFAULT_LIST_LIMIT);
        const fragment = document.createDocumentFragment();

        rows.forEach(jinja => {
            const li = document.createElement('li');
            li.dataset.jinjaId = jinja.id;
            const location = jinja.prefecture || jinja.province || '';
            li.innerHTML = `
                <div class="list-shrine-name">${jinja.name || ''}</div>
                <div class="list-shrine-meta">${jinja.yomi || ''}${location ? ` / ${location}` : ''}</div>`;
            li.addEventListener('click', () => window.selectJinja(jinja.id));
            fragment.appendChild(li);
        });

        if (!hasSearch && filteredJinja.length > rows.length) {
            const more = document.createElement('li');
            more.className = 'tier2-list-note';
            more.textContent = `${filteredJinja.length.toLocaleString()}社中 ${rows.length.toLocaleString()}社を表示。検索すると全社から探せます。`;
            fragment.appendChild(more);
        }

        listEl.appendChild(fragment);
    };
})();
