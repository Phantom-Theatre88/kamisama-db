// 全神様データを保持する配列
let allGods = [];
let currentGod = null;
let currentFilter = 'all';

// DOM読み込み完了時に実行
document.addEventListener('DOMContentLoaded', () => {
  loadGodData();
  setupEventListeners();
});

// 1. CSVデータの読み込みとパース
async function loadGodData() {
  try {
    const response = await fetch('data/kamisama_master.csv');
    const csvText = await response.text();
    allGods = parseCSV(csvText);

    // フッターの件数更新
    document.getElementById('godCount').textContent = allGods.length;

    // 初回リスト描画
    renderGodList(allGods);

    // 初期状態として最初の神様を選択
    if (allGods.length > 0) {
      selectGod(allGods[0].id);
    }
  } catch (error) {
    console.error('CSV読み込みエラー:', error);
    document.getElementById('godList').innerHTML = '<p class="placeholder-text">CSVデータの読み込みに失敗しました。</p>';
  }
}

// Simple CSV Parser (カンマ区切り解析)
function parseCSV(text) {
  const lines = text.trim().split('\n');
  const gods = [];

  // ヘッダー行をスキップして処理
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('id,')) continue; // 重複ヘッダー行スキップ

    const cols = line.split(',');
    if (cols.length >= 9) {
      gods.push({
        id: cols[0].trim(),
        name: cols[1].trim(),
        yomi: cols[2].trim(),
        system_type: cols[3].trim(),
        father_id: cols[4].trim(),
        mother_id: cols[5].trim(),
        spouse_id: cols[6].trim(),
        child_ids: cols[7].trim(),
        description: cols[8].trim()
      });
    }
  }
  return gods;
}

// 2. 神様リストの描画（ID表示は排除）
function renderGodList(gods) {
  const listContainer = document.getElementById('godList');
  listContainer.innerHTML = '';

  if (gods.length === 0) {
    listContainer.innerHTML = '<p class="placeholder-text">該当する神様が見つかりません。</p>';
    return;
  }

  gods.forEach(god => {
    const card = document.createElement('div');
    
    // 系統クラス設定（天津神: amatsu, 国津神: kunitsu, その他: other）
    let systemClass = 'other';
    if (god.system_type === '天津神') systemClass = 'amatsu';
    if (god.system_type === '国津神') systemClass = 'kunitsu';

    card.className = `god-card ${systemClass}`;
    if (currentGod && currentGod.id === god.id) {
      card.classList.add('selected');
    }

    // カード内部構造（ID番号は非表示）
    card.innerHTML = `
      <div class="god-name">${god.name}</div>
      <div class="god-yomi">${god.yomi}</div>
      <span class="god-badge">${god.system_type}</span>
    `;

    card.addEventListener('click', () => selectGod(god.id));
    listContainer.appendChild(card);
  });
}

// 3. 神様の選択 ＆ 詳細表示
function selectGod(godId) {
  const god = allGods.find(g => g.id === godId);
  if (!god) return;

  currentGod = god;

  // リストのハイライト更新
  document.querySelectorAll('.god-card').forEach(card => card.classList.remove('selected'));
  
  // 選択されたカードへスクロール
  const cards = document.querySelectorAll('.god-card');
  const index = getFilteredGods().findIndex(g => g.id === godId);
  if (cards[index]) {
    cards[index].classList.add('selected');
  }

  // 詳細エリアの描画
  renderGodDetail(god);

  // もしTree描画関数が読み込まれていれば、Treeも更新
  if (typeof renderFamilyTree === 'function') {
    renderFamilyTree(god.id);
  }
}

// 詳細パネルの生成
function renderGodDetail(god) {
  const container = document.getElementById('godDetailContent');

  // 家族神のオブジェクト・名前取得
  const father = allGods.find(g => g.id === god.father_id);
  const mother = allGods.find(g => g.id === god.mother_id);
  const spouse = allGods.find(g => g.id === god.spouse_id);
  
  // 子神（複数対応: | 区切り）
  const childIds = god.child_ids ? god.child_ids.split('|') : [];
  const children = allGods.filter(g => childIds.includes(g.id));

  container.innerHTML = `
    <h2>${god.name}</h2>
    <div class="yomi-title">${god.yomi} （${god.system_type}）</div>

    <div class="description-box">
      <strong>解説・ご利益:</strong><br>
      ${god.description || '説明情報なし'}
    </div>

    <div class="family-relations">
      <h3>👨‍👩‍👧‍👦 関連する神々 (タップで移動)</h3>
      
      <div class="relation-group">
        <strong>父神:</strong>
        ${father ? `<button class="rel-btn" onclick="selectGod('${father.id}')">${father.name}</button>` : '<span>なし</span>'}
      </div>

      <div class="relation-group">
        <strong>母神:</strong>
        ${mother ? `<button class="rel-btn" onclick="selectGod('${mother.id}')">${mother.name}</button>` : '<span>なし</span>'}
      </div>

      <div class="relation-group">
        <strong>配偶神:</strong>
        ${spouse ? `<button class="rel-btn" onclick="selectGod('${spouse.id}')">${spouse.name}</button>` : '<span>なし</span>'}
      </div>

      <div class="relation-group">
        <strong>子神:</strong>
        ${children.length > 0 
          ? children.map(c => `<button class="rel-btn" onclick="selectGod('${c.id}')">${c.name}</button>`).join(' ') 
          : '<span>なし</span>'}
      </div>
    </div>
  `;
}

// 4. イベントリスナー（検索・タブ切り替え）
function setupEventListeners() {
  // リアルタイム検索
  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', filterAndRender);

  // 系統フィルタータブ
  const filterTabs = document.querySelectorAll('.filter-tabs .tab-btn');
  filterTabs.forEach(btn => {
    btn.addEventListener('click', (e) => {
      filterTabs.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.getAttribute('data-system');
      filterAndRender();
    });
  });

  // 右側ビュー切り替え（詳細 ⇔ FamilyTree）
  const viewTabs = document.querySelectorAll('.view-tabs .view-tab-btn');
  viewTabs.forEach(btn => {
    btn.addEventListener('click', (e) => {
      viewTabs.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');

      const viewMode = e.target.getAttribute('data-view');
      document.querySelectorAll('.view-panel').forEach(panel => panel.classList.remove('active'));

      if (viewMode === 'detail') {
        document.getElementById('detailView').classList.add('active');
      } else {
        document.getElementById('treeView').classList.add('active');
        if (currentGod && typeof renderFamilyTree === 'function') {
          renderFamilyTree(currentGod.id);
        }
      }
    });
  });
}

// フィルター条件に合う神様を取得
function getFilteredGods() {
  const keyword = document.getElementById('searchInput').value.trim().toLowerCase();

  return allGods.filter(god => {
    // 系統チェック
    const matchSystem = (currentFilter === 'all') || (god.system_type === currentFilter);
    
    // キーワードチェック（名前・読み・解説）
    const matchKeyword = !keyword || 
      god.name.toLowerCase().includes(keyword) ||
      god.yomi.toLowerCase().includes(keyword) ||
      god.description.toLowerCase().includes(keyword);

    return matchSystem && matchKeyword;
  });
}

// 絞り込んで再描画
function filterAndRender() {
  const filtered = getFilteredGods();
  renderGodList(filtered);
}
