// 分割UI検証版のみ: 神社選択時に現在よりZoomOutしない
(() => {
    'use strict';

    if (!window.L || !L.Map || !L.Map.prototype || typeof L.Map.prototype.flyTo !== 'function') return;

    const originalFlyTo = L.Map.prototype.flyTo;

    L.Map.prototype.flyTo = function(latlng, zoom, options) {
        let targetZoom = zoom;

        // 既存の神社選択処理は zoom=13 を指定している。
        // 現在のズームが13より近い場合は、その倍率を維持してZoomOutさせない。
        if (zoom === 13 && typeof this.getZoom === 'function') {
            const currentZoom = this.getZoom();
            if (Number.isFinite(currentZoom) && currentZoom > 13) {
                targetZoom = currentZoom;
            }
        }

        return originalFlyTo.call(this, latlng, targetZoom, options);
    };
})();
