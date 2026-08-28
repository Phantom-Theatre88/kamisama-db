// data cache version guard v1.0
(() => {
    'use strict';
    if (!window.d3 || typeof window.d3.csv !== 'function') return;

    const DATA_VERSION = '20260828_15';
    const originalCsv = window.d3.csv.bind(window.d3);

    window.d3.csv = function(input, ...args) {
        if (typeof input === 'string' && /^data\/(kamisama_master|jinja_master)\.csv(?:\?|$)/.test(input)) {
            const separator = input.includes('?') ? '&' : '?';
            input = `${input}${separator}v=${DATA_VERSION}`;
        }
        return originalCsv(input, ...args);
    };
})();
