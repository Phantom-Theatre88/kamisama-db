// ============================================================
// 現在地・周辺神社
// 現在地を地図に表示し、一覧は常に「現在の地図範囲」に従わせる。
// ============================================================

(() => {
    'use strict';

    let currentLocation = null;
    let locationMarker = null;
    let accuracyCircle = null;

    document.addEventListener('DOMContentLoaded', installLocationButton);

    function installLocationButton() {
        const searchWrap = document.querySelector('.header-search');
        if (!searchWrap || document.getElementById('current-location-btn')) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'current-location-btn';
        button.className = 'current-location-btn';
        button.textContent = '◎ 現在地';
        button.title = '現在地へ地図を移動する';
        button.addEventListener('click', findCurrentLocation);

        const status = document.createElement('span');
        status.id = 'nearby-status';
        status.className = 'nearby-status';
        status.setAttribute('aria-live', 'polite');

        searchWrap.prepend(button);
        searchWrap.append(status);
    }

    async function findCurrentLocation() {
        const button = document.getElementById('current-location-btn');
        if (!window.isSecureContext) { setStatus('現在地機能はHTTPS接続でのみ利用できます。', 'error'); return; }
        if (!navigator.geolocation) { setStatus('このブラウザでは現在地を取得できません。', 'error'); return; }

        const permissionState = await getGeolocationPermissionState();
        if (permissionState === 'denied') {
            setStatus('位置情報が拒否されています。Safariのサイト設定とMacの位置情報サービスを確認してください。', 'error');
            return;
        }

        setButtonBusy(button, true, '取得中…');
        setStatus('現在地を確認しています…', 'loading');

        try {
            const position = await getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
            applyPosition(position);
        } catch (firstError) {
            console.warn('現在地の高精度取得に失敗。低精度で再試行します:', firstError);
            if (firstError?.code === 1) {
                showGeolocationError(firstError);
                setButtonBusy(button, false);
                return;
            }
            setStatus('現在地を再確認しています…', 'loading');
            try {
                const position = await getCurrentPosition({ enableHighAccuracy: false, timeout: 30000, maximumAge: 600000 });
                applyPosition(position);
            } catch (secondError) {
                console.warn('現在地の再取得にも失敗しました:', secondError);
                showGeolocationError(secondError);
            }
        } finally {
            setButtonBusy(button, false);
        }
    }

    function getCurrentPosition(options) {
        return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options));
    }

    async function getGeolocationPermissionState() {
        if (!navigator.permissions?.query) return 'unknown';
        try {
            const result = await navigator.permissions.query({ name: 'geolocation' });
            return result?.state || 'unknown';
        } catch (_) { return 'unknown'; }
    }

    function applyPosition(position) {
        const { latitude, longitude, accuracy } = position.coords;
        currentLocation = { lat: latitude, lng: longitude, accuracy: accuracy || 0 };
        showCurrentLocationOnMap();
        setStatus('現在地を表示', 'success');
    }

    function showCurrentLocationOnMap() {
        if (!currentLocation || !window.map || typeof L === 'undefined') return;
        if (locationMarker) window.map.removeLayer(locationMarker);
        if (accuracyCircle) window.map.removeLayer(accuracyCircle);

        const icon = L.divIcon({
            className: 'current-location-marker-wrap',
            html: '<div class="current-location-marker"><span></span></div>',
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });

        locationMarker = L.marker([currentLocation.lat, currentLocation.lng], {
            icon,
            title: '現在地',
            zIndexOffset: 1000,
            interactive: false
        }).addTo(window.map);

        if (currentLocation.accuracy > 0) {
            accuracyCircle = L.circle([currentLocation.lat, currentLocation.lng], {
                radius: currentLocation.accuracy,
                weight: 1,
                opacity: 0.35,
                fillOpacity: 0.06,
                interactive: false
            }).addTo(window.map);
        }

        window.map.setView([currentLocation.lat, currentLocation.lng], 13);
    }

    function showGeolocationError(error) {
        const code = Number(error?.code || 0);
        let message = '現在地を取得できませんでした。';
        if (code === 1) message = '位置情報の許可が拒否されています。Safariのサイト設定とMacの位置情報サービスを確認してください。';
        else if (code === 2) message = 'Mac / Safariから現在地を特定できません。位置情報サービスが有効か確認してください。';
        else if (code === 3) message = '現在地の取得がタイムアウトしました。もう一度「現在地」を押してください。';
        setStatus(message, 'error');
    }

    function setButtonBusy(button, busy, label = '取得中…') {
        if (!button) return;
        button.disabled = busy;
        button.textContent = busy ? label : '◎ 現在地';
    }

    function setStatus(message, type) {
        const status = document.getElementById('nearby-status');
        if (!status) return;
        status.textContent = message;
        status.dataset.type = type || '';
    }
})();
