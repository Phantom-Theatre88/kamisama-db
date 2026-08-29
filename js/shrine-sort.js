// 神社一覧ソート: 神社名順 / 主祭神順
(() => {
    const collator = new Intl.Collator('ja', { usage: 'sort', sensitivity: 'base', numeric: true });
    let currentJinjaSort = 'shrine';

    function splitGodIds(value) {
        if (!value || typeof value !== 'string') return [];
        return value.split(/[,|、\s]+/).map(id => id.trim()).filter(Boolean);
    }

    function shrineSortKey(jinja) {
        return (jinja && (jinja.yomi || jinja.name)) || '';
    }

    function mainGodSortKey(jinja) {
        const firstGodId = splitGodIds(jinja && jinja.main_god_ids)[0];
        if (!firstGodId || !window.kamisamaMap) return '';
        const god = window.kamisamaMap.get(firstGodId);
        return (god && (god.yomi || god.name)) || '';
    }

    function compareKana(a, b) {
        const aEmpty = !a;
        const bEmpty = !b;
        if (aEmpty && bEmpty) return 0;
        if (aEmpty) return 1;
        if (bEmpty) return -1;
        return collator.compare(a, b);
    }

    function sortJinjaData(items) {
        return [...items].sort((a, b) => {
            const primaryA = currentJinjaSort === 'god' ? mainGodSortKey(a) : shrineSortKey(a);
            const primaryB = currentJinjaSort === 'god' ? mainGodSortKey(b) : shrineSortKey(b);
            const primary = compareKana(primaryA, primaryB);
            if (primary !== 0) return primary;
            return compareKana(shrineSortKey(a), shrineSortKey(b));
        });
    }

    // app.js の一覧描画を、表示順だけ追加した版に差し替える。
    window.renderJinjaList = function renderJinjaList() {
        const listEl = document.getElementById('jinja-list');
        if (!listEl) return;
        listEl.innerHTML = '';

        const source = typeof window.filterData === 'function'
            ? window.filterData()
            : (Array.isArray(window.jinjaData) ? window.jinjaData : []);
        const sortedJinja = sortJinjaData(source);

        sortedJinja.forEach(jinja => {
            const li = document.createElement('li');
            li.dataset.jinjaId = jinja.id;

            const firstGodId = splitGodIds(jinja.main_god_ids)[0];
            const god = firstGodId && window.kamisamaMap ? window.kamisamaMap.get(firstGodId) : null;
            const godName = god ? god.name : '';

            li.innerHTML = `
                <div class="list-shrine-name">${jinja.name || ''}</div>
                <div class="list-shrine-meta">${jinja.yomi || ''} / ${jinja.province || ''}國${currentJinjaSort === 'god' && godName ? ` / 主祭神: ${godName}` : ''}</div>
            `;
            li.addEventListener('click', () => {
                if (typeof window.selectJinja === 'function') window.selectJinja(jinja.id);
            });
            listEl.appendChild(li);
        });
    };

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
            window.renderJinjaList();
        });
    }

    document.addEventListener('DOMContentLoaded', injectSortControls);
})();
