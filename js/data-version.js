// data cache version guard + Tier 2 runtime v2.0
(() => {
    'use strict';
    if (!window.d3 || typeof window.d3.csv !== 'function') return;

    const DATA_VERSION = '20260829_16';
    const originalCsv = window.d3.csv.bind(window.d3);

    window.d3.csv = function(input, ...args) {
        if (typeof input === 'string' && /^data\/(kamisama_master|jinja_master|jinja_tier2_generated)\.csv(?:\?|$)/.test(input)) {
            const separator = input.includes('?') ? '&' : '?';
            input = `${input}${separator}v=${DATA_VERSION}`;
        }
        return originalCsv(input, ...args);
    };

    const tier2DailyKey = new Date().toISOString().slice(0, 10);
    window.__tier2DataPromise = originalCsv(`data/jinja_tier2_generated.csv?v=${DATA_VERSION}&d=${tier2DailyKey}`)
        .catch(() => []);

    function loadMarkerCluster() {
        if (window.L && typeof L.markerClusterGroup === 'function') return Promise.resolve(true);

        ['https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
         'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css']
            .forEach(href => {
                if (document.querySelector(`link[href="${href}"]`)) return;
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = href;
                document.head.appendChild(link);
            });

        return new Promise(resolve => {
            if (document.querySelector('script[data-tier2-markercluster]')) {
                const wait = setInterval(() => {
                    if (window.L && typeof L.markerClusterGroup === 'function') {
                        clearInterval(wait);
                        resolve(true);
                    }
                }, 100);
                setTimeout(() => { clearInterval(wait); resolve(false); }, 10000);
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';
            script.dataset.tier2Markercluster = '1';
            script.onload = () => resolve(!!(window.L && typeof L.markerClusterGroup === 'function'));
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
        });
    }

    const clusterPromise = loadMarkerCluster();

    function waitForApp(timeoutMs = 15000) {
        return new Promise(resolve => {
            const started = Date.now();
            const timer = setInterval(() => {
                const ready = window.map && Array.isArray(window.jinjaData) &&
                    typeof window.filterData === 'function' && typeof window.selectJinja === 'function';
                if (ready || Date.now() - started > timeoutMs) {
                    clearInterval(timer);
                    resolve(ready);
                }
            }, 100);
        });
    }

    function shrineKey(j) {
        const name = (j.name || '').normalize('NFKC').replace(/[\s・･,，、()（）［］\[\]]/g, '')
            .replace(/國/g, '国').replace(/神/g, '神');
        const lat = Number.parseFloat(j.lat);
        const lng = Number.parseFloat(j.lng);
        const pos = Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(4)},${lng.toFixed(4)}` : '';
        return `${name}|${pos}`;
    }

    function installLargeDatasetRenderers(clusterReady) {
        window.renderMarkers = function() {
            if (!window.map || typeof window.filterData !== 'function') return;

            if (clusterReady && window.L && typeof L.markerClusterGroup === 'function') {
                if (!window.__tier2ClusterLayer) {
                    if (window.markersLayer && window.map.hasLayer(window.markersLayer)) {
                        window.map.removeLayer(window.markersLayer);
                    }
                    window.__tier2ClusterLayer = L.markerClusterGroup({
                        chunkedLoading: true,
                        chunkInterval: 80,
                        chunkDelay: 20,
                        removeOutsideVisibleBounds: true,
                        disableClusteringAtZoom: 14,
                        maxClusterRadius: 55
                    }).addTo(window.map);
                    window.markersLayer = window.__tier2ClusterLayer;
                }
            }

            if (!window.markersLayer) return;
            window.markersLayer.clearLayers();
            const filtered = window.filterData();
            const fragment = [];

            filtered.forEach(jinja => {
                const lat = Number.parseFloat(jinja.lat);
                const lng = Number.parseFloat(jinja.lng);
                if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

                const icon = L.divIcon({
                    className: 'custom-torii-marker',
                    html: '<div style="width:28px;height:28px;background:#f4efd3;border:2px solid #8c1d1d;border-radius:50%;box-shadow:0 2px 5px rgba(0,0,0,.35);display:flex;justify-content:center;align-items:center;font-size:16px;line-height:1;">⛩</div>',
                    iconSize: [28, 28],
                    iconAnchor: [14, 14]
                });
                const marker = L.marker([lat, lng], { icon, title: jinja.name || '' });
                marker.on('click', () => window.selectJinja(jinja.id));
                fragment.push(marker);
            });

            if (typeof window.markersLayer.addLayers === 'function') window.markersLayer.addLayers(fragment);
            else fragment.forEach(marker => window.markersLayer.addLayer(marker));
        };

        window.renderJinjaList = function() {
            const listEl = document.getElementById('jinja-list');
            if (!listEl || typeof window.filterData !== 'function') return;
            listEl.innerHTML = '';
            const filtered = window.filterData();
            const DISPLAY_LIMIT = 500;

            filtered.slice(0, DISPLAY_LIMIT).forEach(jinja => {
                const li = document.createElement('li');
                li.dataset.jinjaId = jinja.id;
                li.innerHTML = `
                    <div class="list-shrine-name">${jinja.name || ''}</div>
                    <div class="list-shrine-meta">${jinja.yomi || ''} / ${jinja.province || jinja.prefecture || ''}</div>
                `;
                li.addEventListener('click', () => window.selectJinja(jinja.id));
                listEl.appendChild(li);
            });

            if (filtered.length > DISPLAY_LIMIT) {
                const more = document.createElement('li');
                more.className = 'tier2-list-note';
                more.textContent = `${filtered.length.toLocaleString()}社中 ${DISPLAY_LIMIT}社を表示中。検索で絞り込めます。`;
                listEl.appendChild(more);
            }
        };
    }

    window.addEventListener('load', async () => {
        const [tier2Rows, clusterReady, appReady] = await Promise.all([
            window.__tier2DataPromise,
            clusterPromise,
            waitForApp()
        ]);
        if (!appReady) return;

        installLargeDatasetRenderers(clusterReady);

        if (Array.isArray(tier2Rows) && tier2Rows.length) {
            const existing = new Set(window.jinjaData.map(shrineKey));
            const ids = new Set(window.jinjaData.map(j => j.id));
            let added = 0;

            tier2Rows.forEach(raw => {
                const row = {};
                Object.keys(raw).forEach(k => {
                    const cleanKey = k.replace(/^\uFEFF/, '').trim();
                    row[cleanKey] = typeof raw[k] === 'string' ? raw[k].trim() : raw[k];
                });
                const key = shrineKey(row);
                if (!row.id || ids.has(row.id) || existing.has(key)) return;
                ids.add(row.id);
                existing.add(key);
                window.jinjaData.push(row);
                added++;
            });
            console.log(`Tier 2追加: ${added}社 / 神社総数 ${window.jinjaData.length}社`);
        }

        window.renderMarkers();
        window.renderJinjaList();
    });
})();
