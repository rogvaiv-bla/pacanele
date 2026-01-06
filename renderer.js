/* Renderer: DOM + gameplay glue for Slot Machine.
   This file is derived from game.js and expects `window.paytable`, `window.symbolWeights`, and `SlotEngine` (optional) to be available.
*/

// Copied from game.js (renderer portion)

/* =========================
   CONFIGURARE DE BAZĂ
========================= */

const reelCount = 5;
const visibleRows = 3;
const symbolHeight = 60;

// Note: core paytable/weights are defined in engine.js; renderer will use them when available.
// Provide default/global paytable and weights so the engine utilities can compute RTP.
const defaultSymbolWeights = {
    "🍒": 10,
    "🍋": 20,
    "🍊": 20,
    "⭐": 15,
    "🔔": 15,
    "💎": 20
};

const defaultPaytable = {
    "🍒": {3: 5, 4: 20, 5: 100},
    "🍋": {3: 4, 4: 15, 5: 80},
    "🍊": {3: 3, 4: 10, 5: 50},
    "⭐": {3: 10, 4: 50, 5: 300},
    "🔔": {3: 15, 4: 100, 5: 500},
    "💎": {3: 50, 4: 300, 5: 2000}
};

const defaultPaylines = [
    [1,1,1,1,1],
    [0,0,0,0,0],
    [2,2,2,2,2],
    [0,1,2,1,0],
    [2,1,0,1,2]
];

window.symbolWeights = window.symbolWeights || defaultSymbolWeights;
window.paytable = window.paytable || defaultPaytable;
window.paylines = window.paylines || defaultPaylines;

// symbols list derived from current symbolWeights
const symbols = Object.keys(window.symbolWeights || {"🍒":1,"🍋":1,"🍊":1,"⭐":1,"🔔":1,"💎":1});

/* =========================
    CONFIGURARI AVANSATE
========================= */

// Game state machine
let gameState = "idle"; // idle | spinning | resolving | tumble
// Control for near-miss frequency
let nearMissFrequency = 0.25; // 25% of non-win spins try to present a near-miss
let volatility = 1.0; // keep local volatility; engine math uses paytable but renderer can apply multiplier
// RTP target for paytable adjustment UI
let rtpTarget = 0.95;

/* =========================
   STARE JOC
========================= */

let credit = 100;
let bet = 5;
let spinning = false;

/* =========================
   DOM
========================= */

const reelsContainer = document.getElementById("reels");
const creditEl = document.getElementById("credit");
const betEl = document.getElementById("bet");
const resultEl = document.getElementById("result");
const linesSvg = document.querySelector(".lines");

// DOM element references (guarded)
const spinBtn = document.getElementById("spinBtn");
const betPlusBtn = document.getElementById("betPlus");
const betMinusBtn = document.getElementById("betMinus");
const addCreditBtn = document.getElementById("addCredit");

if (!reelsContainer || !creditEl || !betEl || !resultEl || !spinBtn) {
    console.error("renderer.js: missing required DOM elements (#reels, #credit, #bet, #result, #spinBtn)");
}

/* =========================
   RNG PONDERAT
========================= */

function weightedRandomSymbol() {
    const entries = Object.entries(window.symbolWeights || {});
    const total = entries.reduce((s, [, w]) => s + w, 0) || 1;
    let r = Math.random() * total;

    for (const [symbol, weight] of entries) {
        if ((r -= weight) <= 0) return symbol;
    }
    return (entries[entries.length - 1] && entries[entries.length - 1][0]) || "🍒";
}

/* =========================
   SUNETE
========================= */

let audioContext;

function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playTone(frequency, duration, type = 'sine', volume = 0.1) {
    initAudio();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;

    gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
}

function playSpinSound() {
    // Rapid beeps for spinning
    for (let i = 0; i < 15; i++) {
        setTimeout(() => playTone(800 + i * 30, 0.1, 'square', 0.05), i * 120);
    }
}

function playStopSound() {
    playTone(600, 0.3, 'sawtooth', 0.1);
}

function playWinSound() {
    // Winning melody
    const notes = [523, 659, 784, 1047]; // C, E, G, C
    notes.forEach((freq, i) => {
        setTimeout(() => playTone(freq, 0.4, 'sine', 0.15), i * 200);
    });
}

function playTumbleSound() {
    playTone(400, 0.2, 'triangle', 0.1);
}

/* =========================
   UI
========================= */

function updateUI() {
    creditEl.textContent = credit;
    betEl.textContent = bet;
    if (spinBtn) spinBtn.textContent = '🎰 SPIN';
}

/* =========================
   GENERARE ROLE
========================= */

function createReel() {
    const reel = document.createElement("div");
    reel.className = "reel";

    const strip = document.createElement("div");
    strip.className = "strip";

    for (let i = 0; i < 40; i++) {
        const s = document.createElement("div");
        s.className = "symbol";
        s.textContent = weightedRandomSymbol();
        strip.appendChild(s);
    }

    reel.appendChild(strip);
    return reel;
}

for (let i = 0; i < reelCount; i++) {
    reelsContainer.appendChild(createReel());
}

/* =========================
   SPIN
========================= */

function spin() {
    if (spinning || credit < bet) return;

    spinning = true;
    credit -= bet;
    updateUI();
    resultEl.textContent = "";
    if (linesSvg) linesSvg.innerHTML = "";

    playSpinSound();

    const reels = document.querySelectorAll(".reel");

    // Regenerate symbols for more randomness
    reels.forEach(reel => {
        const strip = reel.querySelector(".strip");
        const symbols = strip.querySelectorAll(".symbol");
        symbols.forEach(symbol => {
            symbol.textContent = weightedRandomSymbol();
        });
    });

    reels.forEach((reel, index) => {
        const strip = reel.querySelector(".strip");

        strip.style.transition = "none";
        strip.style.transform = "translateY(0)";

        const stopIndex = Math.floor(Math.random() * 20);
        const offset = -stopIndex * symbolHeight;

        setTimeout(() => {
            strip.style.transition =
                "transform 1.3s cubic-bezier(.08,.6,.1,1)";
            strip.style.transform = `translateY(${offset}px)`;

            // Play stop sound when this reel finishes transitioning
            setTimeout(() => playStopSound(), 1300);
        }, index * 150);

        if (index === reels.length - 1) {
            setTimeout(endSpin, 1600);
        }
    });
}

function endSpin() {
    // Called when reels stop. Resolve game logic: near-miss, tumble.
    spinning = false;
    enterState("resolving");

    // possibly show a near-miss to increase excitement
    applyNearMissIfNeeded();

    // resolve cascades and accumulate win
    const accumulated = resolveTumbles(bet, info => {
        // optional per-step callback for UI/analytics
    });

    if (accumulated > 0) {
        resultEl.textContent = `Câștig total: ${accumulated}`;
        const slot = document.querySelector('.slot');
        slot.classList.add('winning');
        setTimeout(() => slot.classList.remove('winning'), 3000);
    } else {
        resultEl.textContent = "Fără câștig";
    }

    // no bonus/free-spins flow; back to idle
    enterState("idle");
}

/* =========================
   GRID 3x5
========================= */

function getGrid() {
    const grid = [];

    document.querySelectorAll(".reel").forEach(reel => {
        const strip = reel.querySelector(".strip");
        const transform = strip.style.transform || "";
        const match = transform.match(/translateY\((-?\d+)px\)/);
        const y = Math.abs(parseInt(match ? match[1] : 0, 10) || 0);
        const start = Math.floor(y / symbolHeight);
        const symbolsInReel = Array.from(strip.children);

        const column = [];
        for (let i = 0; i < visibleRows; i++) {
            column.push(
                symbolsInReel[(start + i) % symbolsInReel.length].textContent
            );
        }
        grid.push(column);
    });

    return grid;
}

/* =========================
   EVALUARE LINIE
========================= */

function evaluatePayline(grid, line) {
    const first = grid[0][line[0]];
    let count = 1;

    for (let r = 1; r < grid.length; r++) {
        if (grid[r][line[r]] === first) count++;
        else break;
    }
    if ((window.paytable || {})[first] && (window.paytable || {})[first][count]) {
        return { symbol: first, count, win: (window.paytable || {})[first][count] };
    }
    return null;
}

/* =========================
   CALCUL CÂȘTIG
=========================
*/

// Return DOM elements for visible symbols per reel: [[el0_row0, el0_row1, ...], [el1_row0,...], ...]
function getVisibleSymbolElements() {
    const cols = [];
    document.querySelectorAll(".reel").forEach(reel => {
        const strip = reel.querySelector(".strip");
        const transform = strip.style.transform || "";
        const match = transform.match(/translateY\((-?\d+)px\)/);
        const y = Math.abs(parseInt(match ? match[1] : 0, 10) || 0);
        const start = Math.floor(y / symbolHeight);
        const symbolsInReel = Array.from(strip.children);

        const columnEls = [];
        for (let i = 0; i < visibleRows; i++) {
            columnEls.push(symbolsInReel[(start + i) % symbolsInReel.length]);
        }
        cols.push(columnEls);
    });
    return cols;
}

function enterState(next) {
    gameState = next;
}

function setRTPVolatility(rtp, vol) {
    rtpTarget = Math.max(0, Math.min(1, rtp));
    volatility = Math.max(0.5, Math.min(2.0, vol));
}

function calculatePayout(grid, currentBet) {
    let total = 0;
    const wins = [];

    (window.paylines || []).forEach((line, idx) => {
        const res = evaluatePayline(grid, line);
        if (res) {
            // Apply volatility multiplier to payout value
            const base = res.win;
            const tierMultiplier = Math.max(0.5, Math.min(3, volatility));
            const payout = Math.floor(base * tierMultiplier);
            const lineWin = payout * currentBet;
            total += lineWin;
            wins.push({ lineIndex: idx, line, symbol: res.symbol, count: res.count, win: lineWin });
        }
    });

    return { total, wins };
}

// Resolve tumbles: repeatedly evaluate wins, award them, then refill the reels until no more wins
function resolveTumbles(currentBet, onStep) {
    enterState("tumble");

    let accumulated = 0;
    let iteration = 0;

    while (true) {
        const grid = getGrid();
        const { total, wins } = calculatePayout(grid, currentBet);

        if (total > 0 && wins.length > 0) {
            accumulated += total;
            credit += total;
            updateUI();

            // visual + audio feedback for this tumble
            if (wins.length) {
                animateWinningLines(wins.map(w => ({ line: w.line })));
                playWinSound();
            }

            if (typeof onStep === "function") onStep({ iteration: ++iteration, wins, total, accumulated });

            // Remove winning symbols visually by replacing them with new random symbols
            const els = getVisibleSymbolElements();
            wins.forEach(w => {
                w.line.forEach((row, col) => {
                    const el = els[col][row];
                    if (el && el.textContent === w.symbol) {
                        el.textContent = weightedRandomSymbol();
                    }
                });
            });

            playTumbleSound();

            // slight bias to converge RTP: if we've paid out too much relative to theoretical RTP, reduce future big symbols
            if (typeof window.paytable !== 'undefined' && Math.random() > 0.95) {
                window.symbolWeights["💎"] = Math.max(1, window.symbolWeights["💎"] - 1);
            }

            // continue loop to check for chain wins
            continue;
        }

        // no wins this iteration
        break;
    }

    // after cascades, optional engine-level checks could be invoked here

    enterState("idle");
    return accumulated;
}

function applyNearMissIfNeeded() {
    const grid = getGrid();
    const { total } = calculatePayout(grid, bet);
    if (total === 0 && Math.random() < nearMissFrequency) {
        // pick a random payline and attempt to craft a near-miss: 2 matching symbols + 1 different
        const lineIndex = Math.floor(Math.random() * (window.paylines || []).length);
        const line = (window.paylines || [])[lineIndex] || [1,1,1,1,1];
        const els = getVisibleSymbolElements();

        // pick a symbol to almost match (avoid highest jackpot)
        const candidate = ["🍒", "🍋", "🍊", "⭐"][Math.floor(Math.random() * 4)];

        // set first two positions to candidate and last to another symbol
        for (let col = 0; col < reelCount; col++) {
            const row = line[col];
            const el = els[col][row];
            if (!el) continue;
            if (col < 2) el.textContent = candidate;
            else el.textContent = symbols[(symbols.indexOf(candidate) + 1) % symbols.length];
        }

        // tiny feedback
        if (resultEl) resultEl.textContent = "Near miss..."
    }
}

/* =========================
   HIGHLIGHT LINII
========================= */

function animateWinningLines(lines) {
    if (linesSvg) linesSvg.innerHTML = "";

    lines.forEach((win, i) => {
        const path = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path"
        );
        path.setAttribute("d", getLinePath(win.line));
        path.setAttribute("class", "line");
        path.style.animationDelay = `${i * 0.3}s`;
        linesSvg.appendChild(path);
    });
}

function getLinePath(line) {
    const reelWidth = 80;
    const reelGap = 12;

    let d = "";

    line.forEach((row, reel) => {
        const x = reel * (reelWidth + reelGap) + reelWidth / 2;
        const y = row * symbolHeight + symbolHeight / 2;
        d += reel === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
    });

    return d;
}

/* =========================
   CONTROALE
========================= */

// Optional control panel wiring: if you add elements with these IDs, they'll be hooked up.
function setBetScale(mult) {
    bet = Math.max(1, Math.floor(bet * mult));
    updateUI();
}

function createControlPanel() {
    const container = document.getElementById("controlPanel");
    if (!container) return;

    // RTP
    const rtpLabel = document.createElement("label");
    rtpLabel.textContent = `RTP: ${Math.round(rtpTarget * 100)}%`;
    const rtpRange = document.createElement("input");
    rtpRange.type = "range";
    rtpRange.min = 0.8;
    rtpRange.max = 0.99;
    rtpRange.step = 0.01;
    rtpRange.value = rtpTarget;
    rtpRange.oninput = e => { rtpTarget = parseFloat(e.target.value); rtpLabel.textContent = `RTP: ${Math.round(rtpTarget * 100)}%`; };

    // Computed theoretical RTP (uses SlotEngine if present)
    const computedRtpLabel = document.createElement("div");
    computedRtpLabel.style.marginLeft = "8px";
    const computeRtp = () => {
        if (typeof SlotEngine !== 'undefined') {
            const current = SlotEngine.computeTheoreticalRTP(window.paytable || {}, window.symbolWeights || {}, window.paylines || []);
            computedRtpLabel.textContent = `Theoretical RTP (1u/line): ${current.toFixed(4)}`;
        } else {
            computedRtpLabel.textContent = `Engine unavailable`;
        }
    };
    computeRtp();

    // Button to adjust global paytable to match selected RTP (best-effort)
    const adjustBtn = document.createElement("button");
    adjustBtn.textContent = "Adjust Paytable to RTP";
    adjustBtn.onclick = () => {
        if (typeof SlotEngine === 'undefined') return alert('SlotEngine not loaded');
        if (!window.paytable || !window.symbolWeights || !window.paylines) return alert('Paytable/weights/paylines not exposed');
        const newTable = SlotEngine.adjustPaytableToRTP(window.paytable, window.symbolWeights, window.paylines, rtpTarget);
        window.paytable = newTable;
        alert('Paytable adjusted (in-memory). Reload renderer to see changes.');
        computeRtp();
    };

    // Volatility
    const volLabel = document.createElement("label");
    volLabel.textContent = `Volatility: ${volatility}`;
    const volRange = document.createElement("input");
    volRange.type = "range";
    volRange.min = 0.5;
    volRange.max = 2.0;
    volRange.step = 0.1;
    volRange.value = volatility;
    volRange.oninput = e => { volatility = parseFloat(e.target.value); volLabel.textContent = `Volatility: ${volatility}`; };

    container.appendChild(rtpLabel);
    container.appendChild(rtpRange);
    container.appendChild(document.createElement("br"));
    container.appendChild(volLabel);
    container.appendChild(volRange);
    container.appendChild(computedRtpLabel);
    container.appendChild(adjustBtn);

    // Bet scale quick buttons
    const scaleUp = document.createElement("button");
    scaleUp.textContent = "Bet x2";
    scaleUp.onclick = () => setBetScale(2);
    const scaleDown = document.createElement("button");
    scaleDown.textContent = "Bet /2";
    scaleDown.onclick = () => setBetScale(0.5);
    container.appendChild(document.createElement("br"));
    container.appendChild(scaleDown);
    container.appendChild(scaleUp);
}

// create panel if present
createControlPanel();

if (spinBtn) spinBtn.onclick = spin;
if (betPlusBtn) betPlusBtn.onclick = () => { bet = Math.min(credit, bet + 1); updateUI(); };
if (betMinusBtn) betMinusBtn.onclick = () => { if (bet > 1) bet--; updateUI(); };
if (addCreditBtn) addCreditBtn.onclick = () => { credit += 50; updateUI(); };

document.addEventListener("keydown", e => {
    if (e.code === "Space") {
        e.preventDefault();
        spin();
    }
});

updateUI();