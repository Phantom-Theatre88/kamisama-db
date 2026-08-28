// Tier 2 dataset loader
// jinja_master.csv を読み込む呼び出しだけを拡張し、生成済みTier2を安全に連結する。
(() => {
    'use strict';
    if (!window.d3 || typeof window.d3.csv !== 'function') return;

    const originalCsv = window.d3.csv.bind(window.d3);
    const TIER2_URL = 'data/jinja_tier2_generated.csv?v=20260829_01';

    window.d3.csv = function(input, ...args) {
        if (typeof input !== 'string' || !/^data\/jinja_master\.csv(?:\?|$)/.test(input)) {
            return originalCsv(input, ...args);
        }

        const basePromise = originalCsv(input, ...args);
        const tier2Promise = originalCsv(TIER2_URL, ...args).catch(error => {
            console.info('Tier 2 dataset is not available yet; using curated master only.', error?.message || error);
            return [];
        });

        return Promise.all([basePromise, tier2Promise]).then(([baseRows, tier2Rows]) => {
            const seenIds = new Set();
            const combined = [];

            [...(baseRows || []), ...(tier2Rows || [])].forEach(row => {
                const id = String(row?.id || '').trim();
                if (!id || seenIds.has(id)) return;
                seenIds.add(id);
                combined.push(row);
            });

            console.log(`神社データ統合: Tier1 ${baseRows.length}社 + Tier2 ${tier2Rows.length}社 = ${combined.length}社`);
            return combined;
        });
    };
})();
