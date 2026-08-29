// 分割UI検証版のみ: 神社選択時に現在よりZoomOutしない
(() => {
    'use strict';

    const install = () => {
        if (typeof window.selectJinja !== 'function' || !window.map) return false;
        if (window.selectJinja.__zoomPreserveWrapped) return true;

        const originalSelectJinja = window.selectJinja;

        const wrappedSelectJinja = function(jinjaId) {
            const map = window.map;
            const currentZoom = map && typeof map.getZoom === 'function'
                ? map.getZoom()
                : null;

            const shrine = Array.isArray(window.jinjaData)
                ? window.jinjaData.find(item => item.id === jinjaId)
                : null;

            if (!map || !Number.isFinite(currentZoom) || !shrine) {
                return originalSelectJinja.call(this, jinjaId);
            }

            const originalInstanceFlyTo = map.flyTo;
            const originalInstanceSetView = map.setView;

            // 詳細表示中に走る固定 zoom=13 の移動を、その場だけ現在倍率へ置き換える。
            map.flyTo = function(latlng, zoom, options) {
                const targetZoom = Number.isFinite(zoom)
                    ? Math.max(currentZoom, zoom)
                    : currentZoom;
                return originalInstanceSetView.call(map, latlng, targetZoom, { animate: false });
            };

            map.setView = function(latlng, zoom, options) {
                const targetZoom = Number.isFinite(zoom)
                    ? Math.max(currentZoom, zoom)
                    : currentZoom;
                return originalInstanceSetView.call(map, latlng, targetZoom, options);
            };

            try {
                return originalSelectJinja.call(this, jinjaId);
            } finally {
                map.flyTo = originalInstanceFlyTo;
                map.setView = originalInstanceSetView;

                const lat = Number(shrine.lat);
                const lng = Number(shrine.lng);
                if (Number.isFinite(lat) && Number.isFinite(lng)) {
                    originalInstanceSetView.call(map, [lat, lng], currentZoom, { animate: false });
                }
            }
        };

        wrappedSelectJinja.__zoomPreserveWrapped = true;
        window.selectJinja = wrappedSelectJinja;
        return true;
    };

    const waitUntilReady = () => {
        if (install()) return;
        window.setTimeout(waitUntilReady, 100);
    };

    waitUntilReady();
})();
