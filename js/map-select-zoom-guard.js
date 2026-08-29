// 分割UI検証版のみ: 神社選択時に現在よりZoomOutしない
(() => {
    'use strict';

    const install = () => {
        if (typeof window.showDetailPanel !== 'function' || !window.map) return false;

        const originalShowDetailPanel = window.showDetailPanel;
        window.showDetailPanel = function(jinja) {
            const currentZoom = window.map && typeof window.map.getZoom === 'function'
                ? window.map.getZoom()
                : 13;

            originalShowDetailPanel(jinja);

            if (window.map && jinja) {
                const lat = parseFloat(jinja.lat);
                const lng = parseFloat(jinja.lng);
                if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
                    const targetZoom = Math.max(currentZoom, 13);
                    window.map.stop();
                    window.map.setView([lat, lng], targetZoom, { animate: false });
                }
            }
        };
        return true;
    };

    if (!install()) {
        window.addEventListener('load', install, { once: true });
    }
})();
