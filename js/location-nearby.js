// ============================================================
// 現在地・周辺神社
// 現在地を地図に表示し、神社一覧を近い順へ並べる
// Safari / macOS向けに再試行と原因表示を強化
// ============================================================

(() => {
    'use strict';

    let currentLocation = null;
    let locationMarker = null;
    let accuracyCircle = null;
    let nearbyMode = false;

    document.addEventListener('DOMContentLoaded', () => {
        installLocationButton();
        installSearchSync();
    });

    function installLocationButton() {
        const searchWrap = document.querySelector('.header-search');
        if (!searchWrap || document.getElementById('current-location-btn')) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'current-location-btn';
        button.className = 'current-location-btn';
        button.textContent = '◎ 現在地';
        button.title = '現在地から周辺の神社を探す';
        button.addEventListener('click', findCurrentLocation);

        const status = document.createElement('span');
        status.id = 'nearby-status';
        status.className = 'nearby-status';
        status.setAttribute('aria-live', 'polite');

        searchWrap.prepend(button);
        searchWrap.append(status);
    }

    function installSearchSync() {
        const search = document.getElementById('jinja-search');
        if (!search) return;

        search.addEventListener('input', () => {
            if (!nearbyMode || !currentLocation) return;
            window.setTimeout(renderNearbyList, 0);
        });
    }

    async function findCurrentLocation() {
        const button = document.getElementById('current-location-btn');

        if (!window.isSecureContext) {
            setStatus('現在地機能はHTTPS接続でのみ利用できます。', 'error');
            return;
        }

        if (!navigator.geolocation) {
            setStatus('このブラウザでは現在地を取得できません。', 'error');
            return;
        }

        const permissionState = await getGeolocationPermissionState();
        if (permissionState === 'denied') {
            setStatus('位置情報が拒否されています。Safariのサイト設定とMacの位置情報サービスを確認してください。', 'error');
            return;
        }

        setButtonBusy(button, true, '取得中…');
        setStatus('現在地を確認しています…', 'loading');

        try {
            const position = await getCurrentPosition({
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            });
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
                const position = await getCurrentPosition({
                    enableHighAccuracy: false,
                    timeout: 30000,
                    maximumAge: 600000
                });
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
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, options);
        });
    }

    async function getGeolocationPermissionState() {
        if (!navigator.permissions?.query) return 'unknown';
        try {
            const result = await navigator.permissions.query({ name: 'geolocation' });
            return result?.state || 'unknown';
        } catch (_) {
            return 'unknown';
        }
    }

    function applyPosition(position) {
        const { latitude, longitude, accuracy } = position.coords;
        currentLocation = {
            lat: latitude,
            lng: longitude,
            accuracy: accuracy || 0
        };
        nearbyMode = true;

        showCurrentLocationOnMap();
        renderNearbyList();
        setStatus('現在地から近い順', 'success');
    }

    function showGeolocationError(error) {
        const code = Number(error?.code || 0);
        let message = '現在地を取得できませんでした。';

        if (code === 1) {
            message = '位置情報の許可が拒否されています。Safariのサイト設定とMacの位置情報サービスを確認してください。';
        } else if (code === 2) {
            message = 'Mac / Safariから現在地を特定できません。位置情報サービスが有効か確認して、もう一度「現在地」を押してください。';
        } else if (code === 3) {
            message = '現在地の取得がタイムアウトしました。少し待ってから、もう一度「現在地」を押してください。';
        }

        setStatus(message, 'error');
    }

    function setButtonBusy(button, busy, label = '取得中…') {
        if (!button) return;
        button.disabled = busy;
        button.textContent = busy ? label : '◎ 現在地';
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

    function renderNearbyList() {
        if (!currentLocation || !Array.isArray(window.jinjaData)) return;

        const list = document.getElementById('jinja-list');
        if (!list) return;

        const query = (document.getElementById('jinja-search')?.value || '').trim();

        const items = window.jinjaData
            .map(jinja => {
                const lat = Number(jinja.lat);
                const lng = Number(jinja.lng);
                if (!jinja.id || Number.isNaN(lat) || Number.isNaN(lng)) return null;
                if (!matchesSearch(jinja, query)) return null;

                return {
                    jinja,
                    distanceKm: haversineKm(currentLocation.lat, currentLocation.lng, lat, lng)
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.distanceKm - b.distanceKm);

        list.innerHTML = '';

        if (items.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'nearby-empty';
            empty.textContent = '条件に合う神社がありません。';
            list.appendChild(empty);
            return;
        }

        items.forEach(({ jinja, distanceKm }) => {
            const li = document.createElement('li');
            li.dataset.jinjaId = jinja.id;

            const distanceText = formatDistance(distanceKm);
            li.innerHTML = `
                <div class="nearby-list-head">
                    <div class="list-shrine-name">${escapeHtml(jinja.name || '')}</div>
                    <span class="nearby-distance">${distanceText}</span>
                </div>
                <div class="list-shrine-meta">${escapeHtml(jinja.yomi || '')} / ${escapeHtml(jinja.province || '')}國</div>
            `;

            li.addEventListener('click', () => {
                if (typeof window.selectJinja === 'function') {
                    window.selectJinja(jinja.id);
                }
            });
            list.appendChild(li);
        });

        const heading = document.querySelector('.jinja-list-container h3');
        if (heading) heading.textContent = '現在地から近い神社';
    }

    function matchesSearch(jinja, query) {
        if (!query) return true;

        if ([jinja.name, jinja.yomi, jinja.address].some(value => String(value || '').includes(query))) {
            return true;
        }

        const godIds = String(jinja.main_god_ids || '')
            .split(/[,|、\s]+/)
            .map(id => id.trim())
            .filter(Boolean);

        return godIds.some(id => {
            const god = window.kamisamaMap instanceof Map ? window.kamisamaMap.get(id) : null;
            return Boolean(
                god && [god.name, god.yomi].some(value => String(value || '').includes(query))
            );
        });
    }

    function haversineKm(lat1, lng1, lat2, lng2) {
        const radiusKm = 6371.0088;
        const toRad = degree => degree * Math.PI / 180;
        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
        return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function formatDistance(distanceKm) {
        if (distanceKm < 1) return `${Math.max(10, Math.round(distanceKm * 1000 / 10) * 10)}m`;
        if (distanceKm < 10) return `${distanceKm.toFixed(1)}km`;
        return `${Math.round(distanceKm)}km`;
    }

    function setStatus(message, type) {
        const status = document.getElementById('nearby-status');
        if (!status) return;
        status.textContent = message;
        status.dataset.type = type || '';
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }
})();