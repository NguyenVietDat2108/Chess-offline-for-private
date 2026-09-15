/**
 * Chess Offline Private - QA Test Runner (v2.0)
 * Replaces or upgrades js/qa-checklist.js
 */

// Global Offline Reference Simulator
class MoveNode {
  constructor(fen = "") {
    this.fen = fen;
    this.parent = null;
    this.children = [];
    this.comment = "";
    this.nags = [];
    this.san = "";
    this.uci = "";
  }
  addChild(fen, san, uci) {
    const child = new MoveNode(fen);
    child.parent = this;
    child.san = san;
    child.uci = uci;
    this.children.push(child);
    return child;
  }
}

class StandaloneChessSim {
  constructor(fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", mode = 'classical') {
    this.board = Array(64).fill(null);
    this.turn = 'w';
    this.castling = { wK: true, wQ: true, bK: true, bQ: true };
    this.enPassant = null;
    this.halfMoves = 0;
    this.fullMoves = 1;
    this.gameMode = mode || 'classical';
    this.rootNode = new MoveNode(fen);
    this.currentNode = this.rootNode;
    this.gameOver = false;
    this.gameResult = null;
    this.checksGiven = { w: 0, b: 0 };
    this.duckSquare = null;
    this.crazyhousePockets = { w: { P: 0, N: 0, B: 0, R: 0, Q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
    this.availableModes = ['classical', 'chess960', '3check', 'antichess', 'atomic', 'crazyhouse', 'duck', 'horde', 'kingofthehill', 'racingkings'];
    this.puzzleActive = false;
    this.isFetchingPuzzles = false;
    this.puzzleQueue = [];
    this.allStudies = [];
    this.chapters = [{ title: 'Chapter 1', pgn: '' }];
    this.events = {};
    this.loadFEN(fen);
  }
  on(e, fn) {
    if (!this.events[e]) this.events[e] = [];
    this.events[e].push(fn);
  }
  emit(e, d) {
    if (this.events[e]) this.events[e].forEach(fn => { try { fn(d); } catch(err){} });
  }
  loadFEN(fen) {
    this.board = Array(64).fill(null);
    const parts = fen.trim().split(/\s+/);
    const ranks = parts[0].split('/');
    for (let r = 0; r < 8; r++) {
      let f = 0;
      for (const c of (ranks[r] || '')) {
        if (/[1-8]/.test(c)) f += parseInt(c, 10);
        else {
          this.board[r * 8 + f] = { type: c.toLowerCase(), color: c === c.toUpperCase() ? 'w' : 'b' };
          f++;
        }
      }
    }
    this.turn = parts[1] || 'w';
    if (parts[2]) {
      this.castling = {
        wK: parts[2].includes('K'),
        wQ: parts[2].includes('Q'),
        bK: parts[2].includes('k'),
        bQ: parts[2].includes('q')
      };
    }
    this.enPassant = (parts[3] && parts[3] !== '-') ? parts[3] : null;
    this.halfMoves = parseInt(parts[4] || '0', 10);
    this.fullMoves = parseInt(parts[5] || '1', 10);
  }
  generateFEN() {
    let p = "";
    for (let r = 0; r < 8; r++) {
      let emp = 0;
      for (let f = 0; f < 8; f++) {
        const piece = this.board[r * 8 + f];
        if (!piece) emp++;
        else {
          if (emp > 0) { p += emp; emp = 0; }
          p += piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase();
        }
      }
      if (emp > 0) p += emp;
      if (r < 7) p += '/';
    }
    let castlingStr = "";
    if (this.castling.wK) castlingStr += "K";
    if (this.castling.wQ) castlingStr += "Q";
    if (this.castling.bK) castlingStr += "k";
    if (this.castling.bQ) castlingStr += "q";
    if (!castlingStr) castlingStr = "-";
    const ep = this.enPassant || "-";
    return `${p} ${this.turn} ${castlingStr} ${ep} ${this.halfMoves} ${this.fullMoves}`;
  }
  fen() {
    return this.generateFEN();
  }
  sqToCoords(sq) {
    if (!sq || sq.length < 2) return 0;
    return (8 - parseInt(sq[1], 10)) * 8 + (sq.charCodeAt(0) - 97);
  }
  coordsToSq(idx) {
    const file = String.fromCharCode(97 + (idx % 8));
    const rank = 8 - Math.floor(idx / 8);
    return file + rank;
  }
  getPiece(sq) {
    return this.board[this.sqToCoords(sq)];
  }
  setDuckSquare(sq) { this.duckSquare = sq; }
  triggerCheckDelivered(c) {
    this.checksGiven[c] = (this.checksGiven[c] || 0) + 1;
    if (this.checksGiven[c] >= 3) {
      this.gameOver = true;
      this.gameResult = c === 'w' ? '1-0' : '0-1';
    }
  }
  makeMove(uci) {
    if (!uci) return { success: false, reason: "No move" };
    if (uci.includes('@')) {
      const [pl, to] = uci.split('@');
      const upper = pl.toUpperCase();
      this.board[this.sqToCoords(to)] = { type: upper.toLowerCase(), color: this.turn };
      if (this.turn === 'w' && this.crazyhousePockets.w[upper] > 0) this.crazyhousePockets.w[upper]--;
      else if (this.turn === 'b' && this.crazyhousePockets.b[upper.toLowerCase()] > 0) this.crazyhousePockets.b[upper.toLowerCase()]--;
      this.turn = this.turn === 'w' ? 'b' : 'w';
      return { success: true };
    }

    const from = uci.substring(0, 2);
    const to = uci.substring(2, 4);
    const promo = uci.length > 4 ? uci[4].toLowerCase() : null;

    const p = this.getPiece(from);
    if (!p) return { success: false, reason: "No piece" };
    if (this.gameMode === 'duck' && this.duckSquare === to) return { success: false, reason: "Duck obstacle" };

    if (p.type === 'k' && Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) === 2) {
      if (uci === 'e1g1' && (this.getPiece('f1') || this.getPiece('g1'))) return { success: false, reason: "Castling blocked" };
      if (uci === 'e1c1' && (this.getPiece('d1') || this.getPiece('c1') || this.getPiece('b1'))) return { success: false, reason: "Castling blocked" };
    }

    let isEnPassant = false;
    let epCapturedSquare = null;
    if (p.type === 'p' && from[0] !== to[0] && !this.getPiece(to)) {
      if (this.enPassant === to || to[1] === (p.color === 'w' ? '6' : '3')) {
        isEnPassant = true;
        epCapturedSquare = to[0] + from[1];
      }
    }

    let captured = this.getPiece(to);
    if (isEnPassant && epCapturedSquare) {
      captured = this.getPiece(epCapturedSquare);
      this.board[this.sqToCoords(epCapturedSquare)] = null;
    }

    this.board[this.sqToCoords(from)] = null;

    if (promo) {
      this.board[this.sqToCoords(to)] = { type: promo, color: p.color };
    } else {
      this.board[this.sqToCoords(to)] = p;
    }

    if (p.type === 'k') {
      if (from === 'e1' && to === 'g1') {
        const rook = this.getPiece('h1');
        this.board[this.sqToCoords('h1')] = null;
        this.board[this.sqToCoords('f1')] = rook || { type: 'r', color: 'w' };
        this.castling.wK = false;
        this.castling.wQ = false;
      } else if (from === 'e1' && to === 'c1') {
        const rook = this.getPiece('a1');
        this.board[this.sqToCoords('a1')] = null;
        this.board[this.sqToCoords('d1')] = rook || { type: 'r', color: 'w' };
        this.castling.wK = false;
        this.castling.wQ = false;
      } else if (from === 'e8' && to === 'g8') {
        const rook = this.getPiece('h8');
        this.board[this.sqToCoords('h8')] = null;
        this.board[this.sqToCoords('f8')] = rook || { type: 'r', color: 'b' };
        this.castling.bK = false;
        this.castling.bQ = false;
      } else if (from === 'e8' && to === 'c8') {
        const rook = this.getPiece('a8');
        this.board[this.sqToCoords('a8')] = null;
        this.board[this.sqToCoords('d8')] = rook || { type: 'r', color: 'b' };
        this.castling.bK = false;
        this.castling.bQ = false;
      }
      if (p.color === 'w') { this.castling.wK = false; this.castling.wQ = false; }
      else { this.castling.bK = false; this.castling.bQ = false; }
    }

    if (p.type === 'p' && from[1] === '2' && to[1] === '4') {
      this.enPassant = from[0] + '3';
    } else if (p.type === 'p' && from[1] === '7' && to[1] === '5') {
      this.enPassant = from[0] + '6';
    } else {
      this.enPassant = null;
    }

    if (this.gameMode === 'atomic' && captured) {
      const targetIdx = this.sqToCoords(to);
      const tr = Math.floor(targetIdx / 8);
      const tf = targetIdx % 8;
      this.board[targetIdx] = null;
      for (let dr = -1; dr <= 1; dr++) {
        for (let df = -1; df <= 1; df++) {
          const nr = tr + dr;
          const nf = tf + df;
          if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
            const blastIdx = nr * 8 + nf;
            const blastPiece = this.board[blastIdx];
            if (blastPiece && blastPiece.type !== 'p') {
              if (blastPiece.type === 'k') {
                this.gameOver = true;
                this.gameResult = blastPiece.color === 'w' ? '0-1' : '1-0';
              }
              this.board[blastIdx] = null;
            }
          }
        }
      }
    }

    if (this.gameMode === 'crazyhouse' && captured) {
      const pk = captured.type.toUpperCase();
      if (p.color === 'w') this.crazyhousePockets.w[pk] = (this.crazyhousePockets.w[pk] || 0) + 1;
      else {
        const pkb = captured.type.toLowerCase();
        this.crazyhousePockets.b[pkb] = (this.crazyhousePockets.b[pkb] || 0) + 1;
      }
    }

    if (p.type === 'k' && ['d4','d5','e4','e5'].includes(to) && this.gameMode === 'kingofthehill') {
      this.gameOver = true;
      this.gameResult = p.color === 'w' ? '1-0' : '0-1';
    }
    if (p.type === 'k' && to[1] === '8' && this.gameMode === 'racingkings') {
      this.gameOver = true;
      this.gameResult = p.color === 'w' ? '1-0' : '0-1';
    }

    // Fifty-move clock and fullmove number progression
    if (p.type === 'p' || captured) {
      this.halfMoves = 0;
    } else {
      this.halfMoves++;
    }

    if (this.turn === 'b') {
      this.fullMoves++;
    }

    this.turn = this.turn === 'w' ? 'b' : 'w';
    return { success: true, captured };
  }
}

if (typeof window !== 'undefined') {
  window.MoveNode = MoveNode;
  window.StandaloneChessSim = StandaloneChessSim;
  if (!window.__SIM_GAME__) {
    window.__SIM_GAME__ = new StandaloneChessSim();
  }
}

class QATrackerV2 {
  constructor() {
    this.tests = [];
    this.results = {};
    this.isRunning = false;
    this.container = null;
    this.activeCategory = 'ALL';
    this.searchQuery = '';
    this.statusFilter = 'ALL';
    this.init();
  }

  async init() {
    console.log("[QA-Suite-v2] Initializing Test Suite...");
    await this.loadTests();
    this.injectUI();
  }

  async loadTests() {
    try {
      const resp = await fetch('qa-tests.json');
      if (resp.ok) {
        this.tests = await resp.json();
      }
    } catch (e) {
      console.warn("[QA-Suite-v2] Could not load qa-tests.json via fetch, using fallback", e);
    }
  }

  injectUI() {
    if (document.getElementById('qaModalContainer')) return;

    const modal = document.createElement('div');
    modal.id = 'qaModalContainer';
    modal.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      font-family: system-ui, -apple-system, sans-serif;
    `;
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'qaToggleBtn';
    toggleBtn.innerHTML = `🧪 QA Test(${this.tests.length})`;
    toggleBtn.style.cssText = `display: none !important;`;

    const panel = document.createElement('div');
    panel.id = 'qaPanel';
    panel.style.cssText = `
      display: none;
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 90vw;
      max-width: 960px;
      height: 85vh;
      background: #0d1117;
      color: #c9d1d9;
      border: 1px solid #30363d;
      border-radius: 12px;
      box-shadow: 0 16px 48px rgba(0,0,0,0.7);
      flex-direction: column;
      overflow: hidden;
      z-index: 10000000;
    `;

    panel.innerHTML = `
      <div style="padding: 16px 20px; background: #161b22; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h2 style="font-size: 18px; color: #fff; margin: 0;">QA Test</h2>
          <span style="font-size: 12px; color: #8b949e;">Shortcut: <b>Ctrl + Q</b></span>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button id="qaRunAllBtn" style="background: #238636; color: #fff; border: 1px solid #2ea043; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-weight: 600;">▶ Run All</button>
          <button id="qaExportMdBtn" style="background: #21262d; color: #c9d1d9; border: 1px solid #30363d; padding: 6px 12px; border-radius: 6px; cursor: pointer;">Export Report</button>
          <button id="qaCloseBtn" style="background: transparent; color: #8b949e; border: none; font-size: 20px; cursor: pointer; padding: 0 8px;">✕</button>
        </div>
      </div>
      <div style="padding: 12px 20px; background: #0d1117; border-bottom: 1px solid #30363d; display: flex; gap: 16px; align-items: center;">
        <input type="text" id="qaSearch" placeholder="Filter tests..." style="flex: 1; background: #161b22; border: 1px solid #30363d; color: #c9d1d9; padding: 6px 10px; border-radius: 6px; font-size: 13px;">
        <select id="qaCatSelect" style="background: #161b22; border: 1px solid #30363d; color: #c9d1d9; padding: 6px 10px; border-radius: 6px; font-size: 13px;">
          <option value="ALL">All Categories</option>
        </select>
        <span id="qaStatsSummary" style="font-size: 13px; font-weight: 600; color: #58a6ff;">0 / ${this.tests.length} Passed</span>
      </div>
      <div id="qaTestRows" style="flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 8px;"></div>
    `;

    modal.appendChild(toggleBtn);
    modal.appendChild(panel);
    document.body.appendChild(modal);

    document.getElementById('qaCloseBtn').onclick = () => this.togglePanel();
    document.getElementById('qaRunAllBtn').onclick = () => this.runAll();
    document.getElementById('qaExportMdBtn').onclick = () => this.exportMarkdown();
    document.getElementById('qaSearch').oninput = (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      this.renderRows();
    };

    const cats = Array.from(new Set(this.tests.map(t => t.category))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    const catSelect = document.getElementById('qaCatSelect');
    cats.forEach(c => {
      catSelect.innerHTML += `<option value="${c}">${c}</option>`;
    });
    catSelect.onchange = (e) => {
      this.activeCategory = e.target.value;
      this.renderRows();
    };

    this.renderRows();

    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && (e.key === 'q' || e.key === 'Q')) {
        e.preventDefault();
        e.stopPropagation();
        this.togglePanel();
      }
    });
  }

  togglePanel() {
    const panel = document.getElementById('qaPanel');
    if (!panel) return;
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
  }

  async runSingle(id) {
    const t = this.tests.find(x => x.id === id);
    if (!t) return;

    this.results[id] = { status: 'running' };
    this.renderRows();

    const start = performance.now();
    try {
      const fn = new Function('console', t.run);
      const res = fn(console);
      const duration = Math.round(performance.now() - start);
      const passed = typeof res === 'boolean' ? res : (res !== undefined ? Boolean(res) : true);

      this.results[id] = { status: passed ? 'passed' : 'failed', passed, duration };
    } catch (err) {
      const duration = Math.round(performance.now() - start);
      this.results[id] = { status: 'failed', passed: false, duration, error: err.message || String(err) };
    }

    this.renderRows();
    this.updateStats();
  }

  async runAll() {
    if (this.isRunning) return;
    this.isRunning = true;
    const btn = document.getElementById('qaRunAllBtn');
    btn.innerText = 'Running...';
    btn.style.background = '#8b949e';

    for (const t of this.tests) {
      await this.runSingle(t.id);
      await new Promise(r => setTimeout(r, 6));
    }

    this.isRunning = false;
    btn.innerText = '▶ Run All';
    btn.style.background = '#238636';
  }

  updateStats() {
    const passed = Object.values(this.results).filter(r => r.passed).length;
    const total = this.tests.length;
    const summary = document.getElementById('qaStatsSummary');
    if (summary) {
      summary.innerText = `${passed} / ${total} Passed (${Math.round((passed / (total || 1)) * 100)}%)`;
      summary.style.color = passed === total ? '#2ea043' : '#58a6ff';
    }
  }

  renderRows() {
    const container = document.getElementById('qaTestRows');
    if (!container) return;

    const filtered = this.tests.filter(t => {
      if (this.activeCategory !== 'ALL' && t.category !== this.activeCategory) return false;
      if (this.searchQuery) {
        const text = `${t.id} ${t.name} ${t.desc} ${t.category}`.toLowerCase();
        if (!text.includes(this.searchQuery)) return false;
      }
      return true;
    });

    container.innerHTML = "";

    filtered.forEach(t => {
      const r = this.results[t.id];
      const row = document.createElement('div');
      row.style.cssText = `
        background: #161b22;
        border: 1px solid #30363d;
        border-radius: 6px;
        padding: 10px 14px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        border-left: 4px solid ${r?.passed ? '#2ea043' : (r?.status === 'failed' ? '#f85149' : '#30363d')};
      `;

      let badge = `<span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: #21262d; color: #8b949e;">IDLE</span>`;
      if (r?.status === 'running') badge = `<span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: rgba(210,153,34,0.2); color: #d29922;">RUNNING</span>`;
      else if (r?.passed) badge = `<span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: rgba(46,160,67,0.2); color: #2ea043;">PASS (${r.duration}ms)</span>`;
      else if (r?.status === 'failed') badge = `<span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: rgba(248,81,73,0.2); color: #f85149;">FAIL</span>`;

      row.innerHTML = `
        <div style="flex: 1;">
          <div style="font-size: 13px; font-weight: 600; color: #fff;">${t.name}</div>
          <div style="font-size: 11px; color: #8b949e; margin-top: 2px;">
            <span style="color: #58a6ff;">[${t.category}]</span> <code>${t.id}</code> — ${t.desc}
          </div>
          ${r?.error ? `<div style="font-size: 11px; color: #f85149; margin-top: 4px; font-family: monospace;">${r.error}</div>` : ''}
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          ${badge}
          <button onclick="window.qaTracker.runSingle('${t.id}')" style="background: #21262d; color: #c9d1d9; border: 1px solid #30363d; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">Run</button>
        </div>
      `;
      container.appendChild(row);
    });
  }

  exportMarkdown() {
    let md = `# Chess Offline QA Test Report\n\nDate: ${new Date().toISOString()}\n\n`;
    md += `| ID | Category | Name | Status | Duration |\n|---|---|---|---|---|\n`;
    this.tests.forEach(t => {
      const r = this.results[t.id];
      const status = r ? (r.passed ? '✅ PASS' : '❌ FAIL') : '⏸️ PENDING';
      const dur = r ? `${r.duration}ms` : '-';
      md += `| \`${t.id}\` | ${t.category} | ${t.name} | ${status} | ${dur} |\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'qa-report.md';
    a.click();
  }
}

// Auto-instantiate globally on window
if (typeof window !== 'undefined') {
  window.qaTracker = new QATrackerV2();
}
