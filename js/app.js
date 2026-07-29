// ============================================================
// 八百万の神々 神社探訪マップ ＆ 神さま台帳
// Step 4: 複数ビュー切り替え ＆ 神さま図鑑自動生成プログラム
// ============================================================

// --- グローバル変数 ---
window.map = null;            // Leaflet 地図オブジェクト
window.jinjaData = [];        // 神社データ (配列)
window.kamisamaData = [];     // 神さまデータ (配列)
window.kamisamaMap = new Map(); // 神さまデータ高速検索用マップ (ID -> オブジェクト)
window.markersLayer = null;   // 地図ピンレイヤー

// フィルター初期値
let currentFilters = { search: '', shikinaisha: 'all' };

// ============================================================
// 1. 初期化処理 (ページ読み込み時に実行)
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('--- 探訪マップ (Step 4) 初期化開始 ---');

    try {
        const [rawKamisama, rawJinja] = await Promise.all([
            d3.csv('data/kamisama_master.csv'),
            d3.csv('data/jinja_master.csv')
        ]);

        // キーの余白・BOMをクレンジングして保持
        window.kamisamaData = rawKamisama.map(item => sanitizeObjectKeys(item));
        window.jinjaData = rawJinja.map(item => sanitizeObjectKeys(item));

        // 高速検索用 Map の作成 (IDをキーにする)
        window.kamisamaMap.clear();
        window.kamisamaData.forEach(k => {
            if (k.id) {
                window.kamisamaMap.set(k.id, k);
            }
        });

        console.log(`データ読み込み成功: 神さま ${window.kamisamaData.length}柱, 神社 ${window.jinjaData.length}社`);
    } catch (e) {
        console.error('CSVデータの読み込みに失敗しました:', e);
        initMap();
        return;
    }

    initMap();
    renderMarkers();
    renderJinjaList();
    initEventListeners();
    initViewSwitching(); // Step 4: タブ切り替え処理初期化

    console.log('--- 探訪マップ (Step 4) 初期化完了 ---');
});

// オブジェクトキーのBOM(\ufeff)や余白を自動クレンジングする関数
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
    window.map = L.map('map', {
        zoomControl: false,
        minZoom: 5, maxZoom: 18
    }).setView([35.6812, 139.7671], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(window.map);

    window.markersLayer = L.layerGroup().addTo(window.map);
}

// ============================================================
// 3. ピンの配置 & クリックイベント設定
// ============================================================
function renderMarkers() {
    if (!window.markersLayer) return;
    window.markersLayer.clearLayers();
    const filteredJinja = filterData();

    filteredJinja.forEach(jinja => {
        const lat = parseFloat(jinja.lat);
        const lng = parseFloat(jinja.lng);

        if (isNaN(lat) || isNaN(lng)) return;

        const iconHtml = `<div class="jinja-icon-inner icon-${jinja.id ? jinja.id.toLowerCase() : ''}" data-jinja-id="${jinja.id}"></div>`;
        const icon = L.divIcon({
            className: 'jinja-marker',
            html: iconHtml,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });

        const marker = L.marker([lat, lng], { icon: icon, title: jinja.name });
        marker.on('click', () => selectJinja(jinja.id));
        window.markersLayer.addLayer(marker);
    });
}

// ============================================================
// 4. 詳細パネル描画 & 相関図(tree.js)完全連動
// ============================================================
function showDetailPanel(jinja) {
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
        
        <div class="god-section">
            <h3 style="margin-bottom: 6px; font-size: 0.95rem; font-weight: bold;">主祭神</h3>
            <div id="main-gods" class="god-list-container" style="line-height: 1.6;">
                ${renderGodLinks(jinja.main_god_ids)}
            </div>
        </div>

        <p class="description" style="margin: 12px 0; font-size: 0.85rem; line-height: 1.6;">${jinja.description || ''}</p>

        <div class="action-btn-wrapper">
            <a href="${jinja.gmap_url || '#'}" target="_blank" class="jinja-btn nav-btn">🗺 Google Mapsで開く（ナビ起動）</a>
        </div>
    `;

    document.getElementById('detail-panel').classList.add('open');
    if (window.map) {
        window.map.flyTo([jinja.lat, jinja.lng], 13);
    }
}

// 神さまIDからゴールドリンク(クリックで相関図起動)を生成する関数
function renderGodLinks(godIds) {
    if (!godIds || typeof godIds !== 'string') return '（不詳）';

    const rawIds = godIds.split(/[,|、\s]+/).map(id => id.trim()).filter(id => id.length > 0);

    const matchedLinks = rawIds.map(targetId => {
        const kamisama = window.kamisamaMap.get(targetId);
        if (kamisama) {
            return `<span class="god-link" onclick="openGodTree('${kamisama.id}')">${kamisama.name}</span>`;
        }
        return null;
    }).filter(link => link !== null);

    return matchedLinks.length > 0 ? matchedLinks.join('、') : '（不詳）';
}

// 祭神クリック時に tree.js のモーダルを立ち上げる関数
function openGodTree(kamisamaId) {
    console.log('▶ 相関図呼び出し: 神さまID', kamisamaId);
    if (typeof showTreeModal === 'function') {
        showTreeModal(kamisamaId); 
    } else if (typeof renderFamilyTree === 'function') {
        renderFamilyTree(kamisamaId);
        const modal = document.getElementById('tree-modal');
        if (modal) modal.classList.add('open');
    } else {
        console.error('FamilyTree表示関数が見つかりません。js/tree.js を確認してください。');
    }
}

// ============================================================
// 5. Step 4: 複数ビュー切り替え ＆ 神さま図鑑レンダリング
// ============================================================
function initViewSwitching() {
    const tabs = document.querySelectorAll('.nav-tab');
    const views = document.querySelectorAll('.view-section');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetViewId = tab.dataset.view;

            // タブの表示状態変更
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // ビューの表示状態変更
            views.forEach(v => {
                if (v.id === targetViewId) {
                    v.classList.add('active');
                } else {
                    v.classList.remove('active');
                }
            });

            // マップ表示に戻った場合、Leafletのレイアウト崩れを防ぐため再計算
            if (targetViewId === 'map-view' && window.map) {
                setTimeout(() => {
                    window.map.invalidateSize();
                }, 200);
            }

            // 神さま図鑑タブが開かれた場合、カード一覧を自動描画
            if (targetViewId === 'god-view') {
                renderGodGrid();
            }
        });
    });
}

// 神さま図鑑（カード一覧）の自動描画関数
function renderGodGrid() {
    const gridEl = document.getElementById('god-list-grid');
    if (!gridEl) return;

    if (!window.kamisamaData || window.kamisamaData.length === 0) {
        gridEl.innerHTML = '<p>神さまデータを読み込み中です...</p>';
        return;
    }

    gridEl.innerHTML = ''; // クリア

    window.kamisamaData.forEach(god => {
        const card = document.createElement('div');
        card.className = 'god-card';
        card.onclick = () => openGodTree(god.id);

        card.innerHTML = `
            <h3>${god.name || god.id}</h3>
            <div class="god-yomi">${god.yomi || ''}</div>
            ${god.system ? `<span class="god-system">${god.system}</span>` : ''}
            <p style="font-size: 0.8rem; color: #444; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">
                ${god.description || god.summary || '詳細情報準備中'}
            </p>
        `;

        gridEl.appendChild(card);
    });
}

// ============================================================
// 6. リスト・フィルター・イベント制御
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
        return searchMatch;
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
    // 検索入力
    const searchEl = document.getElementById('jinja-search');
    if (searchEl) {
        searchEl.addEventListener('input', (e) => {
            currentFilters.search = e.target.value;
            renderMarkers();
            renderJinjaList();
        });
    }

    // サイドバー開閉
    const toggleBtn = document.getElementById('sidebar-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('collapsed');
        });
    }

    // 詳細パネル閉じるボタン
    const closeBtn = document.getElementById('detail-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('detail-panel').classList.remove('open');
        });
    }
    
    // モーダル閉じるボタン
    const modalCloseBtn = document.getElementById('modal-close');
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', () => {
            const modal = document.getElementById('tree-modal');
            if (modal) modal.classList.remove('open');
        });
    }
}
