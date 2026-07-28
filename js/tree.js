// Vis.js ネットワークインスタンスの保持
let networkInstance = null;

// FamilyTreeの描画関数
function renderFamilyTree(targetGodId) {
  const container = document.getElementById('familyTreeContainer');
  if (!container) return;

  const targetGod = allGods.find(g => g.id === targetGodId);
  if (!targetGod) return;

  // 1. ノード（神様カード）とエッジ（繋ぐ線）のデータ作成
  const nodes = [];
  const edges = [];
  const addedNodeIds = new Set();

  // ノード追加用のヘルパー関数
  function addGodNode(god, level, isCenter = false) {
    if (!god || addedNodeIds.has(god.id)) return;

    // 系統色設定（天津神: 緑, 国津神: 赤, その他: 紫）
    let bgColor = '#eef5f0';
    let borderColor = '#2e5b40';
    let textColor = '#1b3827';

    if (god.system_type === '国津神') {
      bgColor = '#fcf0ed';
      borderColor = '#8c2d19';
      textColor = '#591b0f';
    } else if (god.system_type === 'その他') {
      bgColor = '#f1f0f7';
      borderColor = '#3a3858';
      textColor = '#222136';
    }

    nodes.push({
      id: god.id,
      label: `${god.name}\n(${god.yomi})`,
      level: level,
      shape: 'box',
      margin: 10,
      font: {
        face: 'Yu Mincho, 游明朝, serif',
        size: isCenter ? 16 : 13,
        color: textColor,
        bold: isCenter
      },
      color: {
        background: bgColor,
        border: borderColor,
        highlight: {
          background: '#ffffff',
          border: '#1f1e2e'
        }
      },
      borderWidth: isCenter ? 3 : 1.5,
      shadow: isCenter
    });

    addedNodeIds.add(god.id);
  }

  // 中心神の追加 (Level 2: 中央)
  addGodNode(targetGod, 2, true);

  // 2. 関連神の抽出と追加
  // 父・母 (Level 1: 上段)
  const father = allGods.find(g => g.id === targetGod.father_id);
  const mother = allGods.find(g => g.id === targetGod.mother_id);

  if (father) {
    addGodNode(father, 1);
    edges.push({ from: father.id, to: targetGod.id, label: '父', arrows: 'to', color: { color: '#888' } });
  }
  if (mother) {
    addGodNode(mother, 1);
    edges.push({ from: mother.id, to: targetGod.id, label: '母', arrows: 'to', color: { color: '#888' } });
  }

  // 配偶神 (Level 2: 同段)
  const spouse = allGods.find(g => g.id === targetGod.spouse_id);
  if (spouse) {
    addGodNode(spouse, 2);
    edges.push({ from: targetGod.id, to: spouse.id, label: '配偶', dashes: true, color: { color: '#b57c1e' } });
  }

  // 子神 (Level 3: 下段)
  const childIds = targetGod.child_ids ? targetGod.child_ids.split('|') : [];
  childIds.forEach(childId => {
    const child = allGods.find(g => g.id === childId);
    if (child) {
      addGodNode(child, 3);
      edges.push({ from: targetGod.id, to: child.id, label: '子', arrows: 'to', color: { color: '#888' } });
    }
  });

  // 3. Vis.js のレイアウトオプション設定
  const data = {
    nodes: new vis.DataSet(nodes),
    edges: new vis.DataSet(edges)
  };

  const options = {
    layout: {
      hierarchical: {
        direction: 'UD', // 上から下への階層レイアウト (Up-Down)
        sortMethod: 'directed',
        nodeSpacing: 150,
        levelSeparation: 100
      }
    },
    physics: false, // ノードが勝手に動かないよう固定
    interaction: {
      hover: true,
      zoomView: true,
      dragView: true
    }
  };

  // 4. 描画の実行
  if (networkInstance) {
    networkInstance.destroy(); // 既存のツリーを破棄してリセット
  }
  networkInstance = new vis.Network(container, data, options);

  // 5. ノードタップ（クリック）イベント
  networkInstance.on('click', function(params) {
    if (params.nodes.length > 0) {
      const clickedGodId = params.nodes[0];
      // タップされた神様へ選択切り替え (app.js の関数を呼び出し)
      if (typeof selectGod === 'function') {
        selectGod(clickedGodId);
      }
    }
  });
}
