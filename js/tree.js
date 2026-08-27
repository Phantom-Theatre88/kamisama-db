// ============================================================
// 八百万の神々 神さま詳細 FamilyTree プログラム
// ============================================================

// --- グローバル変数 ---
let godTreeData = []; // kamisama_family_tree.csv

// --- 【重要】 TODO実装：モーダルを表示する関数 ---
// js/app.js から呼び出されます
function showTreeModal(kamisamaId) {
    console.log(`FamilyTree表示: ID ${kamisamaId}`);
    
    // kamisamaMasterから神さま情報を取得
    const kamisama = kamisamaData.find(k => k.id === kamisamaId);
    if (!kamisama) {
        console.error('神さまデータが見つかりません');
        return;
    }

    const treeContainer = document.getElementById('tree-container');
    
    // 【ID非表示】 ID (K0032など) は表示しない
    treeContainer.innerHTML = `
        <div class="tree-header">
            <h2>${kamisama.name}</h2>
            <p class="yomi">(${kamisama.yomi})</p>
        </div>
        
        <div class="description-box washi-texture">
            ${kamisama.description}
        </div>
        
        <!-- 【TODO】 ここにD3.jsによる FamilyTree(系統図)の描画が入ります -->
        <div class="tree-graph">
            <p class="placeholder-text" style="color:#5a5145;"> FamilyTree(系統図)は現在準備中です。 </p>
        </div>
        
        <!-- 【TODO】 この神様を祀る神社一覧へのジャンプボタン（連携強化） -->
        <div class="shrine-links">
            <button class="jinja-btn" onclick="jumpToShrines('${kamisamaId}')">
                ⛩ この神様を祀る神社一覧
            </button>
        </div>
    `;

    document.getElementById('tree-modal').classList.add('open'); // モーダルを開く
}

// モーダルを閉じる関数
function hideTreeModal() {
    document.getElementById('tree-modal').classList.remove('open'); // モーダルを閉じる
}

// 【TODO】 神さま台帳 ➔ 神社台帳（地図）への連携処理
function jumpToShrines(kamisamaId) {
    // 神社台帳（js/app.js）のフィルターに、この神さまIDをセットして、
    // 地図のピンとリストを絞り込む処理（TODO）
    console.log(`神社一覧へジャンプ (TODO): ${kamisamaId}`);
    
    // 連携処理の実装（TODO）
    // currentFilters.search = kamisamaId; 
    // renderMarkers(); renderJinjaList();

    // モーダルを閉じる
    hideTreeModal();
}

// --- D3.jsによる FamilyTree(系統図)の描画ロジック (TODO) ---
// ... (FamilyTree D3.jsの実装) ...
