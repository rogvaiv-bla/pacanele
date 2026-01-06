/* =========================
   CONFIGURARE DE BAZĂ
========================= */

const symbols = ["🍒", "🍋", "🍊", "⭐", "🔔", "💎"];

const symbolWeights = {
    "🍒": 30,
    "🍋": 25,
    "🍊": 20,
    "⭐": 15,
    "🔔": 8,
    "💎": 2
};

const paytable = {
    "🍒": {3: 5, 4: 20, 5: 100},
    "🍋": {3: 4, 4: 15, 5: 80},
    "🍊": {3: 3, 4: 10, 5: 50},
    "⭐": {3: 10, 4: 50, 5: 300},
    "🔔": {3: 15, 4: 100, 5: 500},
    "💎": {3: 50, 4: 300, 5: 2000}
};

const paylines = [
    [1,1,1,1,1],
    [0,0,0,0,0],
    [2,2,2,2,2],
    [0,1,2,1,0],
    [2,1,0,1,2]
];

const reelCount = 5;
const visibleRows = 3;
const symbolHeight = 60;

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
    console.error("game.js: missing required DOM elements (#reels, #credit, #bet, #result, #spinBtn)");
}

/* =========================
   RNG PONDERAT
========================= */

function weightedRandomSymbol() {
    const entries = Object.entries(symbolWeights);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;

    for (const [symbol, weight] of entries) {
        if ((r -= weight) <= 0) return symbol;
    }
    // fallback (shouldn't happen) - return last symbol
    return entries[entries.length - 1][0];
}

/* =========================
   UI
========================= */

function updateUI() {
    creditEl.textContent = credit;
    betEl.textContent = bet;
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

const spinAudio = document.getElementById("spinSound");
const winAudio = document.getElementById("winSound");
const stopAudio = document.getElementById("stopSound");

function spin() {
    if (spinning || credit < bet) return;

    spinning = true;
    credit -= bet;
    updateUI();
    resultEl.textContent = "";
    if (linesSvg) linesSvg.innerHTML = "";

    if (spinAudio) {
        spinAudio.currentTime = 0;
        spinAudio.play().catch(() => {});
    }

    const reels = document.querySelectorAll(".reel");

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

            // sunet la oprire rolă (ultimul)
            if (index === reels.length - 1 && stopAudio) {
                stopAudio.currentTime = 0;
                stopAudio.play().catch(() => {});
            }
        }, index * 150);

        if (index === reels.length - 1) {
            setTimeout(endSpin, 1600);
        }
    });
}
function checkWin() {
    const grid = getGrid();
    let totalWin = 0;
    const winningLines = [];

    paylines.forEach((line, index) => {
        const result = evaluatePayline(grid, line);
        if (result) {
            const lineWin = result.win * bet;
            totalWin += lineWin;
            winningLines.push({ index, line });
        }
    });

    credit += totalWin;
    updateUI();

    if (winningLines.length > 0) {
        animateWinningLines(winningLines);
        winAudio.currentTime = 0;
        winAudio.play();
        resultEl.textContent = `Câștig: ${totalWin}`;
    } else {
        resultEl.textContent = "Fără câștig";
    }
}

function endSpin() {
    spinning = false;
    checkWin();
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

    if (paytable[first] && paytable[first][count]) {
        return { symbol: first, count, win: paytable[first][count] };
    }
    return null;
}

/* =========================
   CALCUL CÂȘTIG
=========================
*/

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