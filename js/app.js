// ============================================================
// 八百万の神々 神社探訪マップ ＆ 神さま台帳
// 完全統合プログラム (不正データ防御 & ID非表示版)
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

    // 2. 地図の初期化 (OpenStreetMap)
    initMap();

    // 3. ピン（神紋）の配置 (不正データは自動で飛ばす)
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
        // 緯度(lat)や経度(lng)が不正（空、数字でない、URL）な場合は、
        // エラーを出さずに飛ばす（consoleに警告を出す）
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
        // IDをID属性に持たせることで、クリックイベントで取得可能
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
// 4. 詳細パネルの生成 & ID非表示
// ============================================================
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
    map.flyTo([jinja.lat, jinja.lng], 13); // 地図をズーム
}

// 祭神IDから神さま名へのリンクを生成する (IDは非表示)
function renderGodLinks(godIds) {
    if (!godIds) return '（不詳）';
    const idArray = godIds.split('|'); // 複数の神さまIDを分離
    return idArray.map(id => {
        const kamisama = kamisamaData.find(k => k.id === id);
        // 【ID非表示】 ID (K0032など) は表示せず、御名だけを表示
        if (kamisama) {
            // クリックで FamilyTreeを開く (onclick属性を利用)
            return `<span class="god-link" onclick="openGodTree('${kamisama.id}')">${kamisama.name}</span>`;
        }
        return '';
    }).join('、');
}

// --- FamilyTreeモーダル (既存 tree.jsに依存) ---
function openGodTree(kamisamaId) {
    // 荘厳UIのCSSクラス（--gold-main等）を FamilyTreeにも反映させるため、
    // ここで tree.jsの関数を呼び出す。
    if (typeof showTreeModal === 'function') {
        showTreeModal(kamisamaId); 
    } else {
        console.error('FamilyTree表示関数(showTreeModal)が見つかりません。js/tree.jsを確認してください。');
    }
}

// ============================================================
// 5. 神社リストの生成 & フィルター
// ============================================================

// --- データフィルターロジック ---
function filterData() {
    return jinjaData.filter(jinja => {
        // 検索ワード (社名・よみ・所在地)
        const searchMatch = !currentFilters.search || 
            jinja.name.includes(currentFilters.search) ||
            jinja.yomi.includes(currentFilters.search) ||
            jinja.address.includes(currentFilters.search);

        // 式内社格 (小社、名神大など)
        const shikinaishaMatch = currentFilters.shikinaisha === 'all' ||
            jinja.shikinaisha_type === currentFilters.shikinaisha;

        // 【TODO】 系統 (天津神・国津神)
        const godSystemMatch = true; // 現在は連携していないのでスルー

        return searchMatch && shikinaishaMatch && godSystemMatch;
    });
}

// --- 神社リストの生成 (和紙質感のリスト) ---
function renderJinjaList() {
    const listEl = document.getElementById('jinja-list');
    listEl.innerHTML = '';
    
    const filteredJinja = filterData();

    filteredJinja.forEach(jinja => {
        const li = document.createElement('li');
        li.dataset.jinjaId = jinja.id; // IDはdatasetに持たせる (非表示)
        
        // 【ID非表示】 リストにもIDは出さず、社名とよみ、旧国名をカッコよく表示
        li.innerHTML = `
            <div class="list-shrine-name">${jinja.name}</div>
            <div class="list-shrine-meta">${jinja.yomi} / ${jinja.province}國</div>
        `;

        // リストクリック時のイベント
        li.addEventListener('click', () => selectJinja(jinja.id));
        listEl.appendChild(li);
    });
}

// --- 神社を選択 (リストクリック、またはピンタップ時) ---
function selectJinja(jinjaId) {
    const jinja = jinjaData.find(j => j.id === jinjaId);
    if (!jinja) return;

    // 1. リストのハイライト解除と再設定
    document.querySelectorAll('#jinja-list li').forEach(li => li.classList.remove('selected'));
    const li = document.querySelector(`#jinja-list li[data-jinja-id="${jinjaId}"]`);
    if (li) li.classList.add('selected');

    // 2. 詳細パネルを表示
    showDetailPanel(jinja);
}

// ============================================================
// 6. イベントリスナーの設定
// ============================================================
function initEventListeners() {
    // 検索バー
    document.getElementById('jinja-search').addEventListener('input', (e) => {
        currentFilters.search = e.target.value;
        renderMarkers();
        renderJinjaList();
    });

    // サイドバー切替 ( collapsedクラスの付け外し )
    document.getElementById('sidebar-toggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('collapsed');
    });

    // 詳細パネル閉じる ( openクラスの削除 )
    document.getElementById('detail-close').addEventListener('click', () => {
        document.getElementById('detail-panel').classList.remove('open');
    });

    // 【既存】モーダル閉じる (tree.jsの hideTreeModalを呼び出す)
    document.getElementById('modal-close').addEventListener('click', () => {
        if (typeof hideTreeModal === 'function') {
            hideTreeModal();
        }
    });
}
