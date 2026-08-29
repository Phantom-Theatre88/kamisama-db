// 神社一覧ソート: 神社名順 / 主祭神順
// 既存の一覧描画は一切変更せず、描画済みDOMの順序だけを並べ替える。
(() => {
    const collator = new Intl.Collator('ja', { usage: 'sort', sensitivity: 'base', numeric: true });
    let currentJinjaSort = 'shrine';

    function splitGodIds(value) {
        if (!value || typeof value !== 'string') return [];
        return value.split(/[,|、\s]+/).map(id => id.trim()).filter(Boolean);
    }

    // 五十音順は「読み」があるデータだけを読みで比較する。
    // 読みが無い神社名を漢字や記号の文字コード順で代用しない。
    function shrineSortKey(jinja) {
        return (jinja && jinja.yomi) || '';
    }

    function shrineNameKey(jinja) {
        return (jinja && jinja.name) || '';
    }

    function mainGodSortKey(jinja) {
        const firstGodId = splitGodIds(jinja && jinja.main_god_ids)[0];
        if (!firstGodId || !window.kamisamaMap) return '';
        const god = window.kamisamaMap.get(firstGodId);
        return (god && god.yomi) || '';
    }

    // 空の読みは常に末尾へ送る。
    function compareKana(a, b) {
        const aEmpty = !a;
        const bEmpty = !b;
        if (aEmpty && bEmpty) return 0;
        if (aEmpty) return 1;
        if (bEmpty) return -1;
        return collator.compare(a, b);
    }

    function sortExistingJinjaList() {
        const listEl = document.getElementById('jinja-list');
        if (!listEl || !Array.isArray(window.jinjaData)) return;

        const dataById = new Map(window.jinjaData.map(jinja => [jinja.id, jinja]));
        const items = Array.from(listEl.children);

        items.sort((a, b) => {
            const jinjaA = dataById.get(a.dataset.jinjaId);
            const jinjaB = dataById.get(b.dataset.jinjaId);

            const keyA = currentJinjaSort === 'god' ? mainGodSortKey(jinjaA) : shrineSortKey(jinjaA);
            const keyB = currentJinjaSort === 'god' ? mainGodSortKey(jinjaB) : shrineSortKey(jinjaB);
            const primary = compareKana(keyA, keyB);
            if (primary !== 0) return primary;

            // 同じ読み、または両方とも読み無しの場合だけ名称で安定化。
            return collator.compare(shrineNameKey(jinjaA), shrineNameKey(jinjaB));
        });

        const fragment = document.createDocumentFragment();
        items.forEach(item => fragment.appendChild(item));
        listEl.appendChild(fragment);
    }

    // 既存の renderJinjaList を包むだけ。
    // 神社名・住所・読み・カードUIなど、元のHTML生成には一切触れない。
    const originalRenderJinjaList = window.renderJinjaList;
    if (typeof originalRenderJinjaList === 'function') {
        window.renderJinjaList = function(...args) {
            const result = originalRenderJinjaList.apply(this, args);
            sortExistingJinjaList();
            return result;
        };
    }

    function injectSortControls() {
        const container = document.querySelector('.jinja-list-container');
        const heading = container && container.querySelector('h3');
        if (!container || !heading || document.getElementById('jinja-sort-controls')) return;

        const style = document.createElement('style');
        style.textContent = `
            #jinja-sort-controls { display:flex; gap:6px; margin:8px 0 10px; }
            #jinja-sort-controls button { flex:1; padding:7px 8px; border:1px solid #8c1d1d; border-radius:7px; background:#f8f3df; color:#5d1717; font:inherit; font-size:.78rem; cursor:pointer; }
            #jinja-sort-controls button.active { background:#8c1d1d; color:#fffaf0; font-weight:700; }
        `;
        document.head.appendChild(style);

        const controls = document.createElement('div');
        controls.id = 'jinja-sort-controls';
        controls.setAttribute('role', 'group');
        controls.setAttribute('aria-label', '神社一覧の表示順');
        controls.innerHTML = `
            <button type="button" class="active" data-jinja-sort="shrine">⛩ 神社名順</button>
            <button type="button" data-jinja-sort="god">✨ 主祭神順</button>
        `;
        heading.insertAdjacentElement('afterend', controls);

        controls.addEventListener('click', event => {
            const button = event.target.closest('[data-jinja-sort]');
            if (!button) return;

            currentJinjaSort = button.dataset.jinjaSort;
            controls.querySelectorAll('[data-jinja-sort]').forEach(btn => {
                btn.classList.toggle('active', btn === button);
            });

            sortExistingJinjaList();
        });

        // 初期表示も神社名順に整える。
        sortExistingJinjaList();
    }

    document.addEventListener('DOMContentLoaded', injectSortControls);
})();
