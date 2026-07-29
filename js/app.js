// ============================================================
// 八百万の神々 神社探訪マップ ＆ 神さま台帳
// 真・完全統合プログラム (OSM・不正データ防御・ID非表示)
// ============================================================

// --- グローバル変数 ---
let map;                // Leaflet 地図オブジェクト
let jinjaData = [];     // 神社データ (CSV)
let kamisamaData = [];  // 神さまデータ (CSV)
let markersLayer;      // ピンをまとめるレイヤー

// フィルター初期値
let currentFilters = { search: '', shikinaisha: 'all', godSystem: 'all' };

// ============================================================
// 1. 初期化処理 (ページ読み込み時に実行)
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('--- 探訪マップ 初期化開始 ---');

    try {
        [kamisamaData, jinjaData] = await Promise.all([
            d3.csv('data/kamisama_master.csv'),
            d3.csv('data/jinja_master.csv')
        ]);
        console.log(`データ読み込み完了: 神さま ${kamisamaData.length}柱, 神社 ${jinjaData.length}社`);
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

// ============================================================
// 2. 地図の初期化 (Leaflet + OpenStreetMap)
// ============================================================
function initMap() {
    console.log('地図初期化 (OSM)');
    map = L.map('map', {
        zoomControl: false,
        minZoom: 5, maxZoom: 18
    }).setView([35.6812, 139.7671], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);
    console.log('地図初期化完了');
}

// ============================================================
// 3. ピン（荘厳神紋）の配置 & データ防御
// ============================================================
function renderMarkers() {
    markersLayer.clearLayers();
    const filteredJinja = filterData();

    filteredJinja.forEach(jinja => {
        const lat = parseFloat(jinja.lat);
        const lng = parseFloat(jinja.lng);

        if (isNaN(lat) || isNaN(lng) || 
            (typeof jinja.lat === 'string' && jinja.lat.startsWith('http')) || 
            (typeof jinja.lng === 'string' && jinja.lng.startsWith('http'))) {
            console.warn(`[データエラー] ピン配置スキップ (ID: ${jinja.id}, Name: ${jinja.name})`);
            return;
        }

        const iconHtml = `<div class="jinja-icon-inner icon-${jinja.id.toLowerCase()}" data-jinja-id="${jinja.id}"></div>`;
        const icon = L.divIcon({
            className: 'jinja-marker',
            html: iconHtml,
            iconSize: [30, 30], iconAnchor: [15, 15]
        });

        const marker = L.marker([lat, lng], { icon: icon, title: jinja.name });
        marker.on('click', () => selectJinja(jinja.id));
        markersLayer.addLayer(marker);
    });
}

// ============================================================
// 4. 安全なデータ取得 & 詳細パネル描画
// ============================================================

// ★BOM（\ufeffid等）やキー名ズレを吸収して神さまIDを確定取得する関数
function getKamisamaId(k) {
    if (!k) return '';
    if (k.id) return String(k.id).trim();
    // idキーが存在しない場合、オブジェクトの先頭要素を取得
    const firstKey = Object.keys(k)[0];
    return (firstKey && k[firstKey]) ? String(k[firstKey]).trim() : '';
}

function showDetailPanel(jinja) {
    const detailContent = document.getElementById('detail-content');
    
    detailContent.innerHTML = `
        <h2>${jinja.name}</h2>
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
            <a href="${jinja.gmap_url}" target="_blank" class="jinja-btn nav-btn" style="display: block; width: 100%; box-sizing: border-box; text-decoration: none;">🗺 Google Mapsで開く（ナビ起動）</a>
        </div>
    `;

    document.getElementById('detail-panel').classList.add('open');
    map.flyTo([jinja.lat, jinja.lng], 13);
}

function renderGodLinks(godIds) {
    if (!godIds || typeof godIds !== 'string') return '（不詳）';

    // カンマ、縦棒、読点等で分割
    const rawIds = godIds.split(/[,|、\s]+/).map(id => id.trim()).filter(id => id.length > 0);

    const matchedLinks = rawIds.map(targetId => {
        // getKamisamaId(k) を用いてBOM影響を無効化して安全照合
        const kamisama = kamisamaData.find(k => getKamisamaId(k) === targetId);
        if (kamisama) {
            const safeId = getKamisamaId(kamisama);
            return `<span class="god-link" onclick="openGodTree('${safeId}')" style="cursor: pointer; text-decoration: underline; color: #d4af37; font-weight: bold; margin-right: 4px;">${kamisama.name}</span>`;
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
    listEl.innerHTML = '';
    const filteredJinja = filterData();
    filteredJinja.forEach(jinja => {
        const li = document.createElement('li');
        li.dataset.jinjaId = jinja.id;
        li.innerHTML = `
            <div class="list-shrine-name">${jinja.name}</div>
            <div class="list-shrine-meta">${jinja.yomi} / ${jinja.province}國</div>
        `;
        li.addEventListener('click', () => selectJinja(jinja.id));
        listEl.appendChild(li);
    });
}

function filterData() {
    return jinjaData.filter(jinja => {
        const searchMatch = !currentFilters.search || 
            jinja.name.includes(currentFilters.search) ||
            jinja.yomi.includes(currentFilters.search) ||
            jinja.address.includes(currentFilters.search);
        const shikinaishaMatch = currentFilters.shikinaisha === 'all' ||
            jinja.shikinaisha_type === currentFilters.shikinaisha;
        const godSystemMatch = true;
        return searchMatch && shikinaishaMatch && godSystemMatch;
    });
}

function selectJinja(jinjaId) {
    const jinja = jinjaData.find(j => j.id === jinjaId);
    if (!jinja) return;
    document.querySelectorAll('#jinja-list li').forEach(li => li.classList.remove('selected'));
    const li = document.querySelector(`#jinja-list li[data-jinja-id="${jinjaId}"]`);
    if (li) li.classList.add('selected');
    showDetailPanel(jinja);
}

function initEventListeners() {
    document.getElementById('jinja-search').addEventListener('input', (e) => {
        currentFilters.search = e.target.value;
        renderMarkers();
        renderJinjaList();
    });
    document.getElementById('sidebar-toggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('collapsed');
    });
    document.getElementById('detail-close').addEventListener('click', () => {
        document.getElementById('detail-panel').classList.remove('open');
    });
    
    const modalCloseBtn = document.getElementById('modal-close');
    if (modalCloseBtn && typeof hideTreeModal === 'function') {
        modalCloseBtn.addEventListener('click', hideTreeModal);
    }
}
