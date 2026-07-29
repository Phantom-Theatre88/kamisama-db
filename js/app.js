// --- js/app.js (完全統合・ID非表示版) ---

// --- グローバル変数 ---
let map;
let jinjaData = [];
let kamisamaData = [];
let markersLayer;
let currentFilters = { search: '', shikinaisha: 'all', godSystem: 'all' };

// --- 初期化 ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log('--- 探訪マップ 初期化開始 ---');

    // 1. データ読み込み (kamisama_master.csv と jinja_master.csv)
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

    // 2. 地図の初期化 (OpenStreetMap)
    initMap();

    // 3. ピン（神紋）の配置
    renderMarkers();

    // 4. リストの生成
    renderJinjaList();

    // 5. イベントリスナーの設定
    initEventListeners();

    console.log('--- 探訪マップ 初期化完了 ---');
});

// --- 地図初期化 (Leaflet + OpenStreetMap) ---
function initMap() {
    console.log('地図初期化 (OSM)');
    map = L.map('map', {
        zoomControl: false, 
        minZoom: 5, maxZoom: 18
    }).setView([35.6812, 139.7671], 6); // 日本全体表示

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);
    console.log('地図初期化完了');
}

// --- ピンの配置 (神紋) & データ防御 ---
function renderMarkers() {
    markersLayer.clearLayers();

    const filteredJinja = filterData();

    filteredJinja.forEach(jinja => {
        
        // --- ★重要：データ防御処理を追加★ ---
        // 緯度(lat)や経度(lng)が空、または数字でない場合、
        // あるいはURL（http）が含まれている場合は、ピンを立てずに飛ばす
        const lat = parseFloat(jinja.lat);
        const lng = parseFloat(jinja.lng);

        if (isNaN(lat) || isNaN(lng) || 
            (typeof jinja.lat === 'string' && jinja.lat.startsWith('http')) || 
            (typeof jinja.lng === 'string' && jinja.lng.startsWith('http'))) {
            console.warn(`[データエラー] ピンを配置できませんでした (ID: ${jinja.id}, Name: ${jinja.name})。緯度・経度が不正です: lat=${jinja.lat}, lng=${jinja.lng}`);
            return; // この神社は飛ばして次の処理へ
        }
        // ------------------------------

        // 荘厳ピン (神紋) のHTML
        const iconHtml = `<div class="jinja-icon-inner icon-${jinja.id.toLowerCase()}"></div>`;
        const icon = L.divIcon({
            className: 'jinja-marker', // 漆黒・黄金のCSS
            html: iconHtml,
            iconSize: [30, 30], iconAnchor: [15, 15]
        });

        const marker = L.marker([lat, lng], { icon: icon });

        // ピンをタップで詳細パネルを開く
        marker.on('click', () => {
            selectJinja(jinja.id);
        });

        markersLayer.addLayer(marker);
    });
}

// --- 詳細パネルの生成 (【重要】 IDを非表示) ---
function showDetailPanel(jinja) {
    const detailContent = document.getElementById('detail-content');
    
    // 【ID非表示】 ID (J0002など) は表示しない
    detailContent.innerHTML = `
        <h2>${jinja.name}</h2>
        <p class="yomi">(${jinja.yomi})</p>
        <div class="shrine-meta">
            <span>旧社格: ${jinja.former_shrine_rank}</span> / 
            <span>${jinja.shikinaisha_type}</span> / 
            <span>${jinja.province}國 ${jinja.county}郡</span>
        </div>
        <p class="address">所在地: ${jinja.address}</p>
        
        <div class="god-section">
            <h3>祭神</h3>
            <div id="main-gods">
                ${renderGodLinks(jinja.main_god_ids)} <!-- 実装した神さまリンク呼び出し -->
            </div>
        </div>

        <p class="description">${jinja.description}</p>

        <a href="${jinja.gmap_url}" target="_blank" class="jinja-btn nav-btn">🗺 Google Mapsで開く（ナビ起動）</a>
    `;

    document.getElementById('detail-panel').classList.add('open');
    map.flyTo([jinja.lat, jinja.lng], 13); // 地図をズーム
}

// 祭神IDから神さま名へのリンクを生成する (【重要】 IDは非表示)
function renderGodLinks(godIds) {
    if (!godIds) return '（不詳）';
    const idArray = godIds.split('|'); // 複数の神さまIDを分離
    return idArray.map(id => {
        // kamisama_master からIDに一致する神さまを探す
        const kamisama = kamisamaData.find(k => k.id === id);
        // 【ID非表示】 ID (K0032など) は表示せず、御名だけを表示
        if (kamisama) {
            // クリックで FamilyTreeを開く (onclick属性を利用)
            return `<span class="god-link" onclick="openGodTree('${kamisama.id}')">${kamisama.name}</span>`;
        }
        return ''; // 見つからない場合は空
    }).join('、');
}

// --- FamilyTreeモーダル (既存依存) ---
function openGodTree(kamisamaId) {
    // tree.js の showTreeModal関数を呼び出す（tree.jsが読み込まれている前提）
    if (typeof showTreeModal === 'function') {
        showTreeModal(kamisamaId); 
    } else {
        console.error('FamilyTree表示関数(showTreeModal)が見つかりません。js/tree.jsを確認してください。');
    }
}

// --- フィルター・リスト生成・選択処理などは、以前提示した統合版app.jsと同じ ---
function renderJinjaList() {
    const listEl = document.getElementById('jinja-list');
    listEl.innerHTML = '';
    const filteredJinja = filterData();
    filteredJinja.forEach(jinja => {
        const li = document.createElement('li');
        li.dataset.jinjaId = jinja.id;
        // 【ID非表示】IDは出さず、社名とよみ、旧国名をカッコよく表示
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
    // 【TODO】モーダル閉じる処理(tree.js依存)
    // document.getElementById('modal-close').addEventListener('click', hideTreeModal);
}
