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

// 検証版のみ: 神社詳細編集UIを追加読み込みする。
(() => {
    'use strict';

    if (!document.querySelector('link[data-shrine-edit-preview]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'css/shrine-edit.css?v=20260829_preview_03';
        link.dataset.shrineEditPreview = '1';
        document.head.appendChild(link);
    }

    if (!document.querySelector('script[data-shrine-edit-preview]')) {
        const script = document.createElement('script');
        script.src = 'js/shrine-edit.js?v=20260829_preview_03';
        script.defer = true;
        script.dataset.shrineEditPreview = '1';
        document.head.appendChild(script);
    }
})();

// 検証版のみ: 神社詳細から参拝記録するUIを追加読み込みする。
(() => {
    'use strict';

    if (!document.querySelector('link[data-quick-visit-preview]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'css/quick-visit.css?v=20260829_preview_02';
        link.dataset.quickVisitPreview = '1';
        document.head.appendChild(link);
    }

    if (!document.querySelector('script[data-quick-visit-preview]')) {
        const script = document.createElement('script');
        script.src = 'js/quick-visit.js?v=20260829_preview_02';
        script.defer = true;
        script.dataset.quickVisitPreview = '1';
        document.head.appendChild(script);
    }
})();

// 検証版のみ: 神社別アルバムを追加読み込みする。
(() => {
    'use strict';

    if (!document.querySelector('link[data-shrine-album-preview]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'css/shrine-album.css?v=20260829_preview_01';
        link.dataset.shrineAlbumPreview = '1';
        document.head.appendChild(link);
    }

    if (!document.querySelector('script[data-shrine-album-preview]')) {
        const script = document.createElement('script');
        script.src = 'js/shrine-album.js?v=20260829_preview_01';
        script.defer = true;
        script.dataset.shrineAlbumPreview = '1';
        document.head.appendChild(script);
    }
})();

// 検証版のみ: 神さま図鑑の別名・異表記編集UIを追加読み込みする。
(() => {
    'use strict';

    if (!document.querySelector('link[data-god-alias-edit-preview]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'css/god-alias-edit.css?v=20260829_preview_02';
        link.dataset.godAliasEditPreview = '1';
        document.head.appendChild(link);
    }

    if (!document.querySelector('script[data-god-alias-edit-preview]')) {
        const script = document.createElement('script');
        script.src = 'js/god-alias-edit.js?v=20260829_preview_02';
        script.defer = true;
        script.dataset.godAliasEditPreview = '1';
        document.head.appendChild(script);
    }

    if (!document.querySelector('script[data-god-alias-modal-bridge-preview]')) {
        const script = document.createElement('script');
        script.src = 'js/god-alias-modal-bridge.js?v=20260829_preview_02';
        script.defer = true;
        script.dataset.godAliasModalBridgePreview = '1';
        document.head.appendChild(script);
    }
})();
