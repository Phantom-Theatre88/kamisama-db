// --- グローバル変数 ---
let map;
let jinjaData = [];
let kamisamaData = [];
let markersLayer;
// --- フィルター初期値 ---
let currentFilters = { search: '', shikinaisha: 'all', godSystem: 'all' };

// --- 初期化 ---
document.addEventListener('DOMContentLoaded', async () => {
    // 1. データ読み込み (kamisama_master.csv と jinja_master.csv)
    try {
        [kamisamaData, jinjaData] = await Promise.all([
            d3.csv('data/kamisama_master.csv'),
            d3.csv('data/jinja_master.csv')
        ]);
    } catch (e) {
        console.error('データの読み込みに失敗しました:', e);
        return;
    }

    // 2. 地図の初期化 (【変更】 OpenStreetMapタイル)
    initMap();

    // 3. ピン（神紋）の配置
    renderMarkers();

    // 4. リストの生成
    renderJinjaList();

    // 5. イベントリスナーの設定
    initEventListeners();
});

// --- 地図初期化 (【変更】 OpenStreetMap + Leaflet) ---
function initMap() {
    // OpenStreetMapはトークン不要・無料
    map = L.map('map', {
        zoomControl: false, // 独自コントロールを追加するため無効化
        minZoom: 5, maxZoom: 18
    }).setView([35.6812, 139.7671], 6); // 東京中心、日本全体表示

    // OpenStreetMapタイルの読み込み
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // ピンをまとめるレイヤー
    markersLayer = L.layerGroup().addTo(map);
    
    // 独自ズームコントロール (右下に配置)
    L.control.zoom({ position: 'bottomright' }).addTo(map);
}

// --- ピンの配置 (神紋ピンのデザインは維持) ---
function renderMarkers() {
    markersLayer.clearLayers();

    const filteredJinja = filterData();

    filteredJinja.forEach(jinja => {
        // 荘厳ピン (神紋) のHTMLを定義 (css/style.cssで定義済み)
        const iconHtml = `<div class="jinja-icon-inner icon-${jinja.id.toLowerCase()}"></div>`;
        const icon = L.divIcon({
            className: 'jinja-marker',
            html: iconHtml,
            iconSize: [30, 30], iconAnchor: [15, 15]
        });

        const marker = L.marker([jinja.lat, jinja.lng], { icon: icon });

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
    
    // 【ID非表示】 ID (J0002など) は生成するHTMLに含めない
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
                ${renderGodLinks(jinja.main_god_ids)}
            </div>
        </div>

        <p class="description">${jinja.description}</p>

        <a href="${jinja.gmap_url}" target="_blank" class="jinja-btn nav-btn">🗺 Google Mapsで開く（ナビ起動）</a>
    `;

    document.getElementById('detail-panel').classList.add('open');
    map.flyTo([jinja.lat, jinja.lng], 15); // 地図をズーム
}

// 祭神IDから神さま名へのリンクを生成する (【重要】 IDは非表示)
function renderGodLinks(godIds) {
    if (!godIds) return '（不詳）';
    const idArray = godIds.split('|');
    return idArray.map(id => {
        const kamisama = kamisamaData.find(k => k.id === id);
        // 【ID非表示】 ここでもID (K0032など) は表示せず、御名だけを表示
        if (kamisama) {
            return `<span class="god-link" onclick="openGodTree('${kamisama.id}')">${kamisama.name}</span>`;
        }
        return '';
    }).join('、');
}

// --- (既存のFamilyTreeモーダルを開くロジック・IDは内部処理で使用) ---
function openGodTree(kamisamaId) {
    showTreeModal(kamisamaId); // tree.js の関数を呼び出す
}

// --- フィルター・リスト生成・選択処理など ---
// --- データフィルター ---
function filterData() {
    return jinjaData.filter(jinja => {
        // 検索ワード
        const searchMatch = !currentFilters.search || 
            jinja.name.includes(currentFilters.search) ||
            jinja.yomi.includes(currentFilters.search) ||
            jinja.address.includes(currentFilters.search);

        // 式内社格
        const shikinaishaMatch = currentFilters.shikinaisha === 'all' ||
            jinja.shikinaisha_type === currentFilters.shikinaisha;

        // 【TODO】 系統 (kamisama_masterと連携する必要がある)
        const godSystemMatch = true; // 現在はスルー

        return searchMatch && shikinaishaMatch && godSystemMatch;
    });
}

// --- 神社リストの生成 ---
function renderJinjaList() {
    const listEl = document.getElementById('jinja-list');
    listEl.innerHTML = '';
    
    const filteredJinja = filterData();

    filteredJinja.forEach(jinja => {
        const li = document.createElement('li');
        li.dataset.jinjaId = jinja.id;
        // 【ID非表示】 リストにもIDは出さず、社名とよみ、旧国名をカッコよく表示
        li.innerHTML = `
            <div class="list-shrine-name">${jinja.name}</div>
            <div class="list-shrine-meta">${jinja.yomi} / ${jinja.province}國</div>
        `;
        li.addEventListener('click', () => selectJinja(jinja.id));
        listEl.appendChild(li);
    });
}

// --- 神社を選択 (リストクリック時) ---
function selectJinja(jinjaId) {
    const jinja = jinjaData.find(j => j.id === jinjaId);
    if (!jinja) return;

    // リストのハイライト
    document.querySelectorAll('#jinja-list li').forEach(li => li.classList.remove('selected'));
    const li = document.querySelector(`#jinja-list li[data-jinja-id="${jinjaId}"]`);
    if (li) li.classList.add('selected');

    // 詳細パネルを表示
    showDetailPanel(jinja);
}

// --- イベントリスナー ---
function initEventListeners() {
    // 検索バー
    document.getElementById('jinja-search').addEventListener('input', (e) => {
        currentFilters.search = e.target.value;
        renderMarkers();
        renderJinjaList();
    });

    // サイドバー切替
    document.getElementById('sidebar-toggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('collapsed');
    });

    // 詳細パネル閉じる
    document.getElementById('detail-close').addEventListener('click', () => {
        document.getElementById('detail-panel').classList.remove('open');
    });

    // モーダル閉じる (tree.js依存)
    document.getElementById('modal-close').addEventListener('click', hideTreeModal);
}
