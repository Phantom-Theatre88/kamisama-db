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

    // データ読み込み用プロミス (config.js不要、直接d3で読む)
    try {
        [kamisamaData, jinjaData] = await Promise.all([
            d3.csv('data/kamisama_master.csv'),
            d3.csv('data/jinja_master.csv')
        ]);
        console.log(`データ読み込み完了: 神さま ${kamisamaData.length}柱, 神社 ${jinjaData.length}社`);
    } catch (e) {
        console.error('データの読み込みに失敗しました:', e);
        // データがないと動かないので、地図だけ出す
        initMap();
        return;
    }

    // 2. 地図の初期化 (OpenStreetMapタイルを使用)
    initMap();

    // 3. ピン（荘厳神紋）の配置 (不正データは自動で防御)
    renderMarkers();

    // 4. 神社リストの生成 (ID非表示)
    renderJinjaList();

    // 5. イベントリスナーの設定 (検索・サイドバー等)
    initEventListeners();

    console.log('--- 探訪マップ 初期化完了 ---');
});

// ============================================================
// 2. 地図の初期化 (Leaflet + OpenStreetMap)
// ============================================================
function initMap() {
    console.log('地図初期化 (OSM)');
    // 地図オブジェクト作成
    map = L.map('map', {
        zoomControl: false, // 荘厳UIを優先するため標準ズームを隠す
        minZoom: 5, maxZoom: 18
    }).setView([35.6812, 139.7671], 6); // 東京中心、日本全体表示

    // OpenStreetMapタイルの読み込み (Mapboxトークン不要)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // ピンをまとめるレイヤー (clearLayers用)
    markersLayer = L.layerGroup().addTo(map);
    
    console.log('地図初期化完了');
}

// ============================================================
// 3. ピン（荘厳神紋）の配置 & データ防御
// ============================================================
function renderMarkers() {
    markersLayer.clearLayers(); // 既存のピンをクリア

    // フィルターがかかった神社データを取得
    const filteredJinja = filterData();

    filteredJinja.forEach(jinja => {
        
        // --- ★重要：データ防御処理★ ---
        const lat = parseFloat(jinja.lat);
        const lng = parseFloat(jinja.lng);

        if (isNaN(lat) || isNaN(lng) || 
            (typeof jinja.lat === 'string' && jinja.lat.startsWith('http')) || 
            (typeof jinja.lng === 'string' && jinja.lng.startsWith('http'))) {
            console.warn(`[データエラー] ピンを配置できませんでした (ID: ${jinja.id}, Name: ${jinja.name})。緯度・経度が不正です: lat=${jinja.lat}, lng=${jinja.lng}`);
            return; // この神社は飛ばして次の処理へ
        }
        // ------------------------------

        // 莊嚴ピン (神紋) のHTMLを定義 (css/style.cssの .jinja-marker 等を利用)
        const iconHtml = `<div class="jinja-icon-inner icon-${jinja.id.toLowerCase()}" data-jinja-id="${jinja.id}"></div>`;
        const icon = L.divIcon({
            className: 'jinja-marker', // 漆黒・黄金のCSS
            html: iconHtml,
            iconSize: [30, 30], iconAnchor: [15, 15] // 中心をずらす
        });

        // ピンを作成
        const marker = L.marker([lat, lng], { icon: icon, title: jinja.name });

        // ピンをタップした時のイベント
        marker.on('click', () => {
            selectJinja(jinja.id); // 詳細パネルを開く
        });

        // レイヤーに追加
        markersLayer.addLayer(marker);
    });
}

// ============================================================
// 4. 詳細パネルの表示 & 神さまリンク生成
// ============================================================
function showDetailPanel(jinja) {
    const detailContent = document.getElementById('detail-content');
    
    detailContent.innerHTML = `
        <h2>${jinja.name}</h2>
        <p class="yomi">(${jinja.yomi})</p>
        <div class="shrine-meta">
            <span>旧社格: ${jinja.former_shrine_rank || '―'}</span> / 
            <span>${jinja.shikinaisha_type || '―'}</span> / 
            <span>${jinja.province || ''}國 ${jinja.county || ''}郡</span>
        </div>
        <p class="address">所在地: ${jinja.address || '―'}</p>
        
        <div class="god-section">
            <h3>祭神</h3>
            <div id="main-gods" class="god-list-container">
                ${renderGodLinks(jinja.main_god_ids)}
            </div>
        </div>

        <p class="description">${jinja.description || ''}</p>

        <div class="action-btn-wrapper" style="margin-top: 15px;">
            <a href="${jinja.gmap_url}" target="_blank" class="jinja-btn nav-btn" style="display: inline-block;">🗺 Google Mapsで開く（ナビ起動）</a>
        </div>
    `;

    document.getElementById('detail-panel').classList.add('open');
    map.flyTo([jinja.lat, jinja.lng], 13); // 地図をズーム
}

function renderGodLinks(godIds) {
    if (!godIds || typeof godIds !== 'string') return '（不詳）';

    // カンマ、縦棒、スペースなどで区切り、前後の余白・改行文字を除去
    const rawIds = godIds.split(/[,|、\s]+/).map(id => id.trim()).filter(id => id.length > 0);

    const matchedLinks = rawIds.map(targetId => {
        // kamisama_master.csv 内の id と余白を除去して完全一致検索
        const kamisama = kamisamaData.find(k => k.id && k.id.trim() === targetId);
        if (kamisama) {
            return `<span class="god-link" onclick="openGodTree('${kamisama.id.trim()}')" style="cursor: pointer; text-decoration: underline; color: #d4af37; font-weight: bold;">${kamisama.name}</span>`;
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
// 5. 神社リスト・フィルター・イベント処理
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
        const godSystemMatch = true; // TODO: 系統連携
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
    // モーダル閉じる (tree.js依存)
    const modalCloseBtn = document.getElementById('modal-close');
    if (modalCloseBtn && typeof hideTreeModal === 'function') {
        modalCloseBtn.addEventListener('click', hideTreeModal);
    }
}
