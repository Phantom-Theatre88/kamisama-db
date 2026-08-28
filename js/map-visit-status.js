// ============================================================
// 神社マップ：参拝済みピン連動
// IndexedDB の参拝記録を読み、神社ID単位で地図ピンへ印を付ける
// ============================================================

(() => {
    'use strict';

    const DB_NAME = 'goshuin-zukan';
    const DB_VERSION = 1;
    const STORE_NAME = 'visitLogs';

    let db = null;
    let visitCounts = new Map();
    let markerLookup = new Map();
    let markerLookupSourceCount = -1;
    let applyTimer = null;

    document.addEventListener('DOMContentLoaded', () => {
        const mapEl = document.getElementById('map');
        if (!mapEl) return;

        refreshVisitedState();

        const observer = new MutationObserver(() => scheduleApply());
        observer.observe(mapEl, { childList: true, subtree: true });

        const mapTab = document.querySelector('.nav-tab[data-view="map-view"]');
        if (mapTab) {
            mapTab.addEventListener('click', () => {
                setTimeout(refreshVisitedState, 0);
            });
        }

        document.addEventListener('click', event => {
            if (!event.target.closest('#visit-save, #log-detail-delete')) return;
            [250, 700, 1400].forEach(delay => {
                window.setTimeout(refreshVisitedState, delay);
            });
        }, true);

        window.addEventListener('pageshow', () => refreshVisitedState());
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) refreshVisitedState();
        });

        // app.js のCSV・Leaflet初期化完了を待つ保険。
        let retryCount = 0;
        const retryTimer = window.setInterval(() => {
            retryCount += 1;
            applyVisitedMarkers();
            if (isMapReady() || retryCount >= 24) {
                window.clearInterval(retryTimer);
            }
        }, 250);
    });

    async function refreshVisitedState() {
        try {
            const records = await getAllVisitRecords();
            const counts = new Map();

            records.forEach(record => {
                if (!record?.shrineId) return;
                counts.set(record.shrineId, (counts.get(record.shrineId) || 0) + 1);
            });

            visitCounts = counts;
            applyVisitedMarkers();
        } catch (error) {
            console.warn('参拝済みピンの更新に失敗しました:', error);
        }
    }

    function openDatabase() {
        if (db) return Promise.resolve(db);

        return new Promise((resolve, reject) => {
            if (!('indexedDB' in window)) {
                reject(new Error('IndexedDB is not supported'));
                return;
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = event => {
                const upgradeDb = event.target.result;
                if (!upgradeDb.objectStoreNames.contains(STORE_NAME)) {
                    const store = upgradeDb.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('visitDate', 'visitDate', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }
            };

            request.onsuccess = () => {
                db = request.result;
                resolve(db);
            };
            request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
        });
    }

    async function getAllVisitRecords() {
        const database = await openDatabase();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_NAME, 'readonly');
            const request = tx.objectStore(STORE_NAME).getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error || new Error('Visit log read failed'));
        });
    }

    function isMapReady() {
        return Boolean(
            window.markersLayer &&
            typeof window.markersLayer.getLayers === 'function' &&
            Array.isArray(window.jinjaData) &&
            window.jinjaData.length > 0
        );
    }

    function scheduleApply() {
        if (applyTimer) window.clearTimeout(applyTimer);
        applyTimer = window.setTimeout(() => {
            applyTimer = null;
            applyVisitedMarkers();
        }, 30);
    }

    function applyVisitedMarkers() {
        if (!isMapReady()) return;
        ensureMarkerLookup();

        window.markersLayer.getLayers().forEach(marker => {
            if (!marker || typeof marker.getElement !== 'function' || typeof marker.getLatLng !== 'function') return;

            const element = marker.getElement();
            const latLng = marker.getLatLng();
            if (!element || !latLng) return;

            const title = marker.options?.title || '';
            const shrineId = markerLookup.get(makeMarkerKey(title, latLng.lat, latLng.lng));
            if (!shrineId) return;

            const count = visitCounts.get(shrineId) || 0;
            const visited = count > 0;

            element.classList.toggle('visit-marker-visited', visited);

            if (visited) {
                element.dataset.visitCount = String(count);
                element.setAttribute('aria-label', `${title}・参拝済み${count > 1 ? ` ${count}回` : ''}`);
            } else {
                delete element.dataset.visitCount;
                element.removeAttribute('aria-label');
            }
        });
    }

    function ensureMarkerLookup() {
        const source = Array.isArray(window.jinjaData) ? window.jinjaData : [];
        if (source.length === markerLookupSourceCount && markerLookup.size > 0) return;

        markerLookup = new Map();
        source.forEach(jinja => {
            const lat = Number(jinja.lat);
            const lng = Number(jinja.lng);
            if (!jinja.id || !jinja.name || Number.isNaN(lat) || Number.isNaN(lng)) return;
            markerLookup.set(makeMarkerKey(jinja.name, lat, lng), jinja.id);
        });
        markerLookupSourceCount = source.length;
    }

    function makeMarkerKey(name, lat, lng) {
        return `${String(name || '').trim()}|${Number(lat).toFixed(6)}|${Number(lng).toFixed(6)}`;
    }
})();
