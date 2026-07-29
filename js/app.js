// ============================================================
// 八百万の神々 神社探訪マップ ＆ 神さま台帳
// 左右2分割 台帳UI完全連動 ＆ ナビゲーション連携プログラム
// ============================================================

// --- グローバル変数 ---
window.map = null;            // Leaflet 地図オブジェクト
window.jinjaData = [];        // 神社データ (配列)
window.kamisamaData = [];     // 神さまデータ (配列)
window.kamisamaMap = new Map(); // 神さまデータ高速検索用マップ (ID -> オブジェクト)
window.markersLayer = null;   // 地図ピンレイヤー

// 現在選択中の状態
let selectedKamisamaId = null;
let currentCategory = 'all';
let currentFilters = { search: '', shikinaisha: 'all' };

// ============================================================
// 1. 初期化処理 (ページ読み込み時に実行)
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('--- 探訪マップ & 台帳 初期化開始 ---');

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
    initViewSwitching();   // ビュー切り替え初期化
    initDaichoEvents();    // 台帳内部イベント初期化
    renderGodDaichoList(); // 神さまリスト初期描画

    console.log('--- 探訪マップ & 台帳 初期化完了 ---');
});

// クレンジング関数
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

        const iconHtml = `
            <div style="
                width: 32px; 
                height: 32px; 
                background-color: #f4efd3; 
                border: 2px solid #8c1d1d; 
                border-radius: 50%; 
                box-shadow: 0 2px 6px rgba(0,0,0,0.4); 
                display: flex; 
                justify-content: center; 
                align-items: center; 
                font-size: 18px; 
                line-height: 1; 
                cursor: pointer;
            ">⛩</div>
        `;

        const icon = L.divIcon({
            className: 'custom-torii-marker',
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
// 4. 詳細パネル描画 & 神さま図鑑へダイレクト移動
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

// 祭神リンク生成（クリックで神さま図鑑タブへ移動して対象選択）
function renderGodLinks(godIds) {
    if (!godIds || typeof godIds !== 'string') return '（不詳）';

    const rawIds = godIds.split(/[,|、\s]+/).map(id => id.trim()).filter(id => id.length > 0);

    const matchedLinks = rawIds.map(targetId => {
        const kamisama = window.kamisamaMap.get(targetId);
        if (kamisama) {
            return `<span class="god-link" onclick="goToGodDaicho('${kamisama.id}')">${kamisama.name}</span>`;
        }
        return null;
    }).filter(link => link !== null);

    return matchedLinks.length > 0 ? matchedLinks.join('、') : '（不詳）';
}

// 祭神クリック時：神社マップから神さま図鑑タブへ飛ぶ処理
function goToGodDaicho(kamisamaId) {
    const godTab = document.querySelector('.nav-tab[data-view="god-view"]');
    if (godTab) godTab.click();

    document.getElementById('detail-panel').classList.remove('open');
    selectKamisamaInDaicho(kamisamaId);
}

// ============================================================
// 5. 神さま台帳 (左リスト ＆ 右詳細/FamilyTree) ロジック
// ============================================================

// 左リストの描画処理
function renderGodDaichoList() {
    const listEl = document.getElementById('god-daicho-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const filtered = window.kamisamaData.filter(god => {
        if (currentCategory === 'all') return true;
        if (currentCategory === 'amatsukami') return god.system === '天津神';
        if (currentCategory === 'kunitsukami') return god.system === '国津神';
        if (currentCategory === 'other') return god.system !== '天津神' && god.system !== '国津神';
        return true;
    });

    filtered.forEach(god => {
        const li = document.createElement('li');
        li.dataset.godId = god.id;
        if (god.id === selectedKamisamaId) li.classList.add('selected');

        li.innerHTML = `
            <div class="god-item-name">${god.name || god.id}</div>
            <div class="god-item-yomi">${god.yomi || ''}</div>
            ${god.system ? `<span class="god-badge">${god.system}</span>` : ''}
        `;

        li.addEventListener('click', () => selectKamisamaInDaicho(god.id));
        listEl.appendChild(li);
    });

    // 最初の1柱を自動選択（未選択時）
    if (!selectedKamisamaId && filtered.length > 0) {
        selectKamisamaInDaicho(filtered[0].id);
    }
}

// 神さま選択時の右パネル描画処理
function selectKamisamaInDaicho(kamisamaId) {
    selectedKamisamaId = kamisamaId;
    const god = window.kamisamaMap.get(kamisamaId);
    if (!god) return;

    // 左リストのハイライト更新
    document.querySelectorAll('#god-daicho-list li').forEach(li => {
        li.classList.toggle('selected', li.dataset.godId === kamisamaId);
    });

    // 右パネル: 1. 神様詳細の描画
    const profileEl = document.getElementById('god-profile-display');
    if (profileEl) {
        profileEl.innerHTML = `
            <h2 style="font-size: 1.4rem; color: #8c1d1d; margin-bottom: 4px;">${god.name}</h2>
            <p style="font-size: 0.85rem; color: #666; margin-bottom: 12px;">(${god.yomi || ''})</p>
            <div style="margin-bottom: 12px;">
                <span class="god-badge">${god.system || '系統不明'}</span>
            </div>
            <p style="font-size: 0.9rem; line-height: 1.6; color: #333; margin-bottom: 16px;">
                ${god.description || god.summary || '詳細情報準備中'}
            </p>
        `;
    }

    // 右パネル: 2. FamilyTree (tree.js) の埋め込み描画
    const treeContainer = document.getElementById('embedded-tree-container');
    if (treeContainer) {
        treeContainer.innerHTML = '';
        if (typeof renderFamilyTree === 'function') {
            renderFamilyTree(kamisamaId, '#embedded-tree-container');
        } else if (typeof showTreeModal === 'function') {
            showTreeModal(kamisamaId, '#embedded-tree-container');
        }
    }
}

// 台帳内部のタブ・カテゴリーイベント設定
function initDaichoEvents() {
    // 1. 左側カテゴリータブ
    const catTabs = document.querySelectorAll('.god-cat-tab');
    catTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            catTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentCategory = tab.dataset.cat;
            renderGodDaichoList();
        });
    });

    // 2. 右側詳細/FamilyTree切り替えタブ
    const viewTabs = document.querySelectorAll('.god-view-tab');
    const tabContents = document.querySelectorAll('.god-tab-content');

    viewTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;

            viewTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            tabContents.forEach(c => {
                c.classList.toggle('active', c.id === `god-tab-${targetTab}-content`);
            });

            if (targetTab === 'tree' && selectedKamisamaId) {
                selectKamisamaInDaicho(selectedKamisamaId);
            }
        });
    });
}

// ============================================================
// 6. ビュー切り替え ＆ 全体イベント制御
// ============================================================
function initViewSwitching() {
    const tabs = document.querySelectorAll('.nav-tab');
    const views = document.querySelectorAll('.view-section');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetViewId = tab.dataset.view;

            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            views.forEach(v => {
                v.classList.toggle('active', v.id === targetViewId);
            });

            if (targetViewId === 'map-view' && window.map) {
                setTimeout(() => window.map.invalidateSize(), 200);
            }

            if (targetViewId === 'god-view') {
                renderGodDaichoList();
            }
        });
    });
}

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
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', () => {
            const modal = document.getElementById('tree-modal');
            if (modal) modal.classList.remove('open');
        });
    }
}
