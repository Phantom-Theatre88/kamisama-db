// ============================================================
// 八百万の神々 神社探訪マップ ＆ 神さま台帳
// 真・完全統合プログラム (OSM・不正データ防御・ID非表示・解析用)
// ============================================================

// --- グローバル変数 ---
window.map = null;            // Leaflet 地図オブジェクト
window.jinjaData = [];        // 神社データ (CSV)
window.kamisamaData = [];     // 神さまデータ (CSV)
window.markersLayer = null;   // ピンをまとめるレイヤー

// フィルター初期値
let currentFilters = { search: '', shikinaisha: 'all', godSystem: 'all' };

// ============================================================
// 1. 初期化処理 (ページ読み込み時に実行)
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('--- 探訪マップ 初期化開始 ---');

    try {
        const [rawKamisama, rawJinja] = await Promise.all([
            d3.csv('data/kamisama_master.csv'),
            d3.csv('data/jinja_master.csv')
        ]);

        window.kamisamaData = rawKamisama.map(item => sanitizeObjectKeys(item));
        window.jinjaData = rawJinja.map(item => sanitizeObjectKeys(item));

        console.log(`データ読み込み完了: 神さま ${window.kamisamaData.length}柱, 神社 ${window.jinjaData.length}社`);
    } catch (e) {
        console.error('データの読み込みに失敗しました:', e);
        initMap();
        return;
    }

    initMap();
    renderMarkers();
    renderJinjaList();
    initEventListeners();

    console.log('--- 探訪マップ 初期化完了 ---');
});

function sanitizeObjectKeys(obj) {
    const cleanObj = {};
    Object.keys(obj).forEach(key => {
        const cleanKey = key.replace(/^\uFEFF/, '').trim();
        const value = obj[key];
        cleanObj[cleanKey] = typeof value === 'string' ? value.trim() : value;
    });
    return cleanObj;
}

// ============================================================
// 2. 地図の初期化 (Leaflet + OpenStreetMap)
// ============================================================
function initMap() {
    console.log('地図初期化 (OSM)');
    window.map = L.map('map', {
        zoomControl: false,
        minZoom: 5, maxZoom: 18
    }).setView([35.6812, 139.7671], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(window.map);

    window.markersLayer = L.layerGroup().addTo(window.map);
    console.log('地図初期化完了');
}

// ============================================================
// 3. ピン（荘厳神紋）の配置 & データ防御
// ============================================================
function renderMarkers() {
    if (!window.markersLayer) return;
    window.markersLayer.clearLayers();
    const filteredJinja = filterData();

    filteredJinja.forEach(jinja => {
        const lat = parseFloat(jinja.lat);
        const lng = parseFloat(jinja.lng);

        if (isNaN(lat) || isNaN(lng) || 
            (typeof jinja.lat === 'string' && jinja.lat.startsWith('http')) || 
            (typeof jinja.lng === 'string' && jinja.lng.startsWith('http'))) {
            return;
        }

        const iconHtml = `<div class="jinja-icon-inner icon-${jinja.id ? jinja.id.toLowerCase() : ''}" data-jinja-id="${jinja.id}"></div>`;
        const icon = L.divIcon({
            className: 'jinja-marker',
            html: iconHtml,
            iconSize: [30, 30], iconAnchor: [15, 15]
        });

        const marker = L.marker([lat, lng], { icon: icon, title: jinja.name });
        marker.on('click', () => selectJinja(jinja.id));
        window.markersLayer.addLayer(marker);
    });
}

// ============================================================
// 4. 詳細パネル描画 & 診断ログ出力
// ============================================================
function showDetailPanel(jinja) {
    // 🔍 ★解析用診断ログ★
    console.log('--- [診断開始] ---');
    console.log('1. 選択された神社データ:', jinja);
    console.log('2. 祭神ID(jinja.main_god_ids):', jinja ? jinja.main_god_ids : 'データなし');
    console.log('3. 神さまマスター先頭データ:', window.kamisamaData ? window.kamisamaData[0] : 'データなし');
    console.log('--- [診断終了] ---');

    const detailContent = document.getElementById('detail-content');
    
    detailContent.innerHTML = `
        <h2>${jinja.name || ''}</h2>
        <p class="yomi">(${jinja.yomi || ''})</p>
        <div class="shrine-meta">
            <span>旧社格: ${jinja.former_shrine_rank || '―'}</span> / 
            <span>${jinja.shikinaisha_type || '―'}</span> / 
            <span>${jinja.province || ''}國 ${jinja.county || ''}郡</span>
        </div>
        <p class="address">所在地: ${jinja.address || '―'}</p>
        
        <div class="god-section" style="margin: 12px 0;">
            <h3 style="margin-bottom: 6px; font-weight: bold;">祭神</h3>
            <div id="main-gods" class="god-list-container" style="line-height: 1.6;">
                ${renderGodLinks(jinja.main_god_ids)}
            </div>
        </div>

        <p class="description" style="margin: 10px 0; font-size: 0.9em; line-height: 1.5;">${jinja.description || ''}</p>

        <div class="action-btn-wrapper" style="margin-top: 20px; text-align: center;">
            <a href="${jinja.gmap_url || '#'}" target="_blank" class="jinja-btn nav-btn" style="display: block; width: 100%; box-sizing: border-box; text-decoration: none;">🗺 Google Mapsで開く（ナビ起動）</a>
        </div>
    `;

    document.getElementById('detail-panel').classList.add('open');
    if (window.map) {
        window.map.flyTo([jinja.lat, jinja.lng], 13);
    }
}

function renderGodLinks(godIds) {
    if (!godIds || typeof godIds !== 'string') return '（不詳）';

    const rawIds = godIds.split(/[,|、\s]+/).map(id => id.trim()).filter(id => id.length > 0);

    const matchedLinks = rawIds.map(targetId => {
        const kamisama = window.kamisamaData.find(k => k.id === targetId);
        if (kamisama) {
            return `<span class="god-link" onclick="openGodTree('${kamisama.id}')" style="cursor: pointer; text-decoration: underline; color: #d4af37; font-weight: bold; margin-right: 4px;">${kamisama.name}</span>`;
        }
        return null;
    }).filter(link => link !== null);

    return matchedLinks.length > 0 ? matchedLinks.join('、') : '（不詳）';
}

function openGodTree(kamisamaId) {
    if (typeof showTreeModal === 'function') {
        showTreeModal(kamisamaId); 
    } else {
        console.error('FamilyTree表示関数(showTreeModal)が見つかりません。js/tree.jsを確認してください。');
    }
}

// ============================================================
// 5. リスト・フィルター・イベント制御
// ============================================================
function renderJinjaList() {
    const listEl = document.getElementById('jinja-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    const filteredJinja = filterData();
    filteredJinja.forEach(jinja => {
        const li = document.createElement('li');
        li.dataset.jinjaId = jinja.id;
        li.innerHTML = `
            <div class="list-shrine-name">${jinja.name || ''}</div>
            <div class="list-shrine-meta">${jinja.yomi || ''} / ${jinja.province || ''}國</div>
        `;
        li.addEventListener('click', () => selectJinja(jinja.id));
        listEl.appendChild(li);
    });
}

function filterData() {
    if (!window.jinjaData) return [];
    return window.jinjaData.filter(jinja => {
        const searchMatch = !currentFilters.search || 
            (jinja.name && jinja.name.includes(currentFilters.search)) ||
            (jinja.yomi && jinja.yomi.includes(currentFilters.search)) ||
            (jinja.address && jinja.address.includes(currentFilters.search));
        const shikinaishaMatch = currentFilters.shikinaisha === 'all' ||
            jinja.shikinaisha_type === currentFilters.shikinaisha;
        const godSystemMatch = true;
        return searchMatch && shikinaishaMatch && godSystemMatch;
    });
}

function selectJinja(jinjaId) {
    if (!window.jinjaData) return;
    const jinja = window.jinjaData.find(j => j.id === jinjaId);
    if (!jinja) return;
    document.querySelectorAll('#jinja-list li').forEach(li => li.classList.remove('selected'));
    const li = document.querySelector(`#jinja-list li[data-jinja-id="${jinjaId}"]`);
    if (li) li.classList.add('selected');
    showDetailPanel(jinja);
}

function initEventListeners() {
    const searchEl = document.getElementById('jinja-search');
    if (searchEl) {
        searchEl.addEventListener('input', (e) => {
            currentFilters.search = e.target.value;
            renderMarkers();
            renderJinjaList();
        });
    }

    const toggleBtn = document.getElementById('sidebar-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('collapsed');
        });
    }

    const closeBtn = document.getElementById('detail-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('detail-panel').classList.remove('open');
        });
    }
    
    const modalCloseBtn = document.getElementById('modal-close');
    if (modalCloseBtn && typeof hideTreeModal === 'function') {
        modalCloseBtn.addEventListener('click', hideTreeModal);
    }
}
