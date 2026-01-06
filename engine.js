/* SlotEngine: core deterministic math utilities for the slot game.
   - computeTheoreticalRTP(paytable, symbolWeights, paylines)
   - adjustPaytableToRTP(paytable, symbolWeights, paylines, targetRTP)
   - helper: weighted probabilities

   This file is intentionally pure (no DOM). It exposes a global `SlotEngine` object.
*/

const SlotEngine = (function() {
    function normalizeWeights(weights) {
        const entries = Object.entries(weights);
        const total = entries.reduce((s, [, w]) => s + w, 0);
        const probs = {};
        entries.forEach(([k, w]) => probs[k] = w / total);
        return probs;
    }

    // Evaluate a payline exactly like renderer expects: line is array of row indices
    function evaluatePayline(grid, line, paytable) {
        const first = grid[0][line[0]];
        let count = 1;
        for (let r = 1; r < grid.length; r++) {
            if (grid[r][line[r]] === first) count++;
            else break;
        }
        if (paytable[first] && paytable[first][count]) {
            return { symbol: first, count, win: paytable[first][count] };
        }
        return null;
    }

    // Calculate theoretical RTP per 1 unit bet for given paytable and symbol distribution.
    // Assumes each visible reel position is an independent draw with symbol probability = weight/total.
    // For each payline, we compute expected value from consecutive-match wins starting at reel 1.
    function computeTheoreticalRTP(paytable, symbolWeights, paylines) {
        const probs = normalizeWeights(symbolWeights);
        const reels = paylines[0].length; // assume all paylines span full reel count
        let evPerLine = 0;

        Object.keys(paytable).forEach(symbol => {
            const p = probs[symbol] || 0;
            if (p <= 0) return;
            const table = paytable[symbol];
            // for counts from 3..reels
            for (let c = 3; c <= reels; c++) {
                const payout = table[c];
                if (!payout) continue;
                // probability of at least c consecutive starting matches: p^c
                // probability of exactly c (if c < reels): p^c * (1-p)
                let probExact = 0;
                if (c < reels) probExact = Math.pow(p, c) * (1 - p);
                else probExact = Math.pow(p, c); // full length match
                evPerLine += probExact * payout;
            }
        });

        // total EV is EV per line * number of paylines, assuming independent lines and bet units per line = 1
        const totalEV = evPerLine * paylines.length;
        // RTP expressed as return per 1 unit bet per spin (if player bets 1 per line)
        return totalEV;
    }

    // Scale paytable entries proportionally to reach targetRTP (approximate).
    // Returns a new paytable object (deep copy) with integer payouts.
    // Adjust paytable to target RTP while optionally preserving volatility shape.
    // `preserveFactor` controls how much to bias payouts toward larger prizes (positive -> more volatile).
    function adjustPaytableToRTP(paytable, symbolWeights, paylines, targetRTP, preserveFactor = 0) {
        const current = computeTheoreticalRTP(paytable, symbolWeights, paylines);
        if (current <= 0) return JSON.parse(JSON.stringify(paytable));

        // Build list of payout tiers with their per-line probabilities
        const probs = normalizeWeights(symbolWeights);
        const reels = paylines[0].length;
        const entries = [];

        Object.keys(paytable).forEach(symbol => {
            const p = probs[symbol] || 0;
            if (p <= 0) return;
            const table = paytable[symbol];
            for (let c = 3; c <= reels; c++) {
                const basePayout = table[c];
                if (!basePayout) continue;
                let probExact = 0;
                if (c < reels) probExact = Math.pow(p, c) * (1 - p);
                else probExact = Math.pow(p, c);
                entries.push({ symbol, count: c, basePayout, prob: probExact });
            }
        });

        // target EV per line
        const targetEVPerLine = targetRTP / paylines.length;

        // compute a baseline average payout (weighted by prob)
        const avgBase = entries.reduce((s, e) => s + e.basePayout * e.prob, 0) / Math.max(1e-12, entries.reduce((s, e) => s + e.prob, 0));

        // compute adjusted weights per entry using preserveFactor as exponent
        const adjustedWeights = entries.map(e => {
            const rel = e.basePayout / Math.max(1, avgBase);
            const weight = e.basePayout * Math.pow(rel, preserveFactor);
            return weight;
        });

        const denom = entries.reduce((s, e, i) => s + e.prob * adjustedWeights[i], 0);
        const K = denom > 0 ? targetEVPerLine / denom : 1.0;

        // Build new paytable
        const newTable = {};
        Object.keys(paytable).forEach(sym => newTable[sym] = {});

        entries.forEach((e, i) => {
            const newVal = Math.max(1, Math.round(adjustedWeights[i] * K));
            newTable[e.symbol][e.count] = newVal;
        });

        return newTable;
    }

    return {
        normalizeWeights,
        evaluatePayline,
        computeTheoreticalRTP,
        adjustPaytableToRTP
    };
})();
