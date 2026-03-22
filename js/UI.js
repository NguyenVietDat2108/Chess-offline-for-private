import { FILES, RANKS, ICON_BOOK_SVG,ICON_BOOK_SVG_IMG_BLUE,INITIAL_FEN,ICON_SETTING_SVG } from './constants.js';
import { MoveNode } from './MoveNode.js';
import {PIECE_SETS} from './piece.js';
export class UI {
constructor() {
        this.boardEl = document.getElementById('chessBoard');
        this.boardWrapper = document.getElementById('board-wrapper');
        this.squaresLayer = document.getElementById('squaresLayer');
        this.piecesLayer = document.getElementById('piecesLayer');
        this.arrowLayer = document.getElementById('arrowsRoot');
        this.tempArrowLayer = document.getElementById('tempArrowRoot');
        this.draggedPieceGhost = document.getElementById('draggedPieceGhost');
        this.selectedSq = null;
        this.legalMoves = [];
        this.flipped = false;
        this.dragData = null;
        this.editorTool ='cursor';
        this.annotationPopup = document.getElementById('annotationPopup');
        this.pgnStyle ='standard';
        this.arrowDragStart = null;
        this.isRightClick = false;
        this.moveInputMode ='both';
        
        // ❌ REMOVED THE SWEEP EVENT LISTENERS FROM HERE! ❌

        this.initDraggableSettings();
        this.avatars = { w:``, b:`` };
        this.playerInfo = { w:{}, b:{} };
        
        if (this.annotationPopup) {
            document.addEventListener('click', (e) => {if (!this.annotationPopup.contains(e.target))this.annotationPopup.style.display ='none';});
        }
        
        this.boardWrapper?.addEventListener('contextmenu', e => e.preventDefault());
        this.isPeeking = false;
        this.DEFAULT_SETTINGS_OPEN = true;
        this.errorNavState = {};
    }
init() {
        this.populatePieceSets();
        this.initGlobalDragEvents();
        this.initKeyboardEvents();
        this.initEditorBars();
        this.initSoundSettings();
        this.initVolume();
        this.initResizer();
        this.initSidebarResizers();
        this.boardWrapper = document.getElementById('board-wrapper');
        this.boardWrapper.style.width = '632px';
        const animCheckbox = document.getElementById('enableAnimations');
        this.animationsEnabled = animCheckbox ? animCheckbox.checked : true;
        
        const startFen = typeof INITIAL_FEN !=='undefined'? INITIAL_FEN :'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        window.game.loadFEN(startFen);
        window.game.currentNode = window.game.rootNode;
        this.renderBoard(false);
        this.updateClocks();
        
        if (this.DEFAULT_SETTINGS_OPEN) {
            const panel = document.getElementById('settingsPanel');
            if (panel) panel.classList.add('visible');
        }
        
        const btn = document.getElementById('btnBrowseFolder');
        if (btn) {
            btn.onclick = () => this.loadCustomPieces();
        }

        if (this.boardWrapper) {
            // 1. STANDARD EVENTS: Enables clicking, dragging pieces, and drawing arrows!
            this.boardWrapper.addEventListener('mousedown', (e) => this.handleMouseDown(e));
            this.boardWrapper.addEventListener('mousemove', (e) => this.handleMouseMove(e));
            this.boardWrapper.addEventListener('mouseup',   (e) => this.handleMouseUp(e));

            // 2. EDITOR SWEEP EVENTS: Intercepts the mouse ONLY when the trash tool is active
            this.boardWrapper.addEventListener('mousedown', (e) => this.processTrashAction(e), true);
            this.boardWrapper.addEventListener('mousemove', (e) => this.processTrashAction(e), true);
        }
        // ==========================================================
        // ==========================================================
this.updateBotMenuPreviews();
    const pgnStyleSelect = document.getElementById('pgnStyle');
        if (pgnStyleSelect) {
            pgnStyleSelect.addEventListener('change', (e) => {
                this.pgnStyle = e.target.value;
                this._lastTreeSize = -1; // Lie to the cache so it rebuilds!
                this.updateHistory(true);
            });
        }
   const sheet = document.getElementById('moveHistory');
        if (sheet) {
            sheet.addEventListener('focusout', (e) => {
                if (e.target.classList.contains('comment') || e.target.classList.contains('pgn-comment') || e.target.classList.contains('move-comment') || e.target.classList.contains('inline-comment') || e.target.classList.contains('tree-comment')) {
                    
                    let newText = e.target.innerText.trim();
                    // 🔥 THE FIX 1: Strip the decorative '{ }' or '//' that we draw visually so they don't get saved into the file!
                    newText = newText.replace(/^\/\/\s*/, '').replace(/^\{\s*/, '').replace(/\s*\}$/, '').trim();
                    
                    // 🔥 THE FIX 2: Get the ID directly from the comment span itself!
                    const nodeId = e.target.dataset.nodeId; 
                    
                    if (nodeId && window.game) {
                        let node = null;
                        if (typeof window.game.getNodeById === 'function') {
                            node = window.game.getNodeById(nodeId);
                        } else {
                            const findNode = (n, id) => {
                                if (n.id === id) return n;
                                for (let c of n.children) {
                                    let res = findNode(c, id);
                                    if (res) return res;
                                }
                                return null;
                            };
                            if (window.game.rootNode) node = findNode(window.game.rootNode, nodeId);
                        }
                        
                        if (node) {
                            node.comment = newText;
                            this._lastTreeSize = -1;
                            this.updateHistory(true);
                        }
                    }
                }
            });
        }
        // 🔥 The completely bulletproof Comment Box Logic
        const commentaryBox = document.getElementById('commentaryBox');
        if (commentaryBox) {
            
            // 1. Tag the box with the active move the millisecond it gets focus
            commentaryBox.addEventListener('focus', (e) => {
                if (window.game && window.game.currentNode) {
                    e.target.dataset.activeNodeId = window.game.currentNode.id;
                    if (e.target.innerText.trim() === "Click to add comment...") {
                        e.target.innerText = ""; // Clear placeholder
                    }
                }
            });

            // 2. Save text to memory INSTANTLY as you type
            commentaryBox.addEventListener('input', (e) => {
                const activeId = e.target.dataset.activeNodeId;
                if (!activeId || !window.game || !window.game.rootNode) return;
                
                // 🔥 DIRECT INLINE SEARCH: Finds the exact move node by its ID!
                const findNode = (node, id) => {
                    if (node.id === id) return node;
                    for (let child of node.children) {
                        let res = findNode(child, id);
                        if (res) return res;
                    }
                    return null;
                };
                
                let node = findNode(window.game.rootNode, activeId);
                
                if (node) {
                    let newText = e.target.innerText.trim();
                    node.comment = newText === "" ? null : newText;
                }
            });

            commentaryBox.addEventListener('focusout', (e) => {
                // 🔥 THE FIX: Delay the redraw by 100ms. 
                // This allows your mouse 'click' on the new move to successfully register 
                // BEFORE the PGN list redraws and destroys the HTML element!
                setTimeout(() => {
                    if (e.target.innerText.trim() === "" && document.activeElement !== e.target) {
                        e.target.innerText = "Click to add comment...";
                    }
                    this._lastTreeSize = -1; 
                    this.updateHistory(true); 
                }, 100);
            });
        }
        // ==========================================================
        // ==========================================================
        // 🔥 THE FIX: LIVE EDITOR FEN UPDATING
        // ==========================================================
        const fenInputBox = document.getElementById('fenInput');
        if (fenInputBox) {
            fenInputBox.addEventListener('input', (e) => {
                // Only run this magic if we are actively using the Editor
                if (!window.game || window.game.mode !== 'editor') return;
                const newFen = e.target.value.trim();
                const validation = window.game.engine.validate_fen(newFen);
                
                // Only update the board if the text is a 100% legal FEN string
                if (validation.valid) {
                    // 1. Instantly load it visually and logically
                    window.game.loadFEN(newFen);
                    window.game.pgnHeaders = { "FEN": newFen, "SetUp": "1" };
                    window.game.rootNode.fen = newFen;
                    window.game.currentNode.fen = newFen;
                    
                    // 2. Sync Editor HTML Checkboxes to match the pasted FEN
                    if (document.getElementById('editorTurn')) document.getElementById('editorTurn').value = window.game.turn;
                    if (document.getElementById('castling-wK')) document.getElementById('castling-wK').checked = window.game.castling.wK;
                    if (document.getElementById('castling-wQ')) document.getElementById('castling-wQ').checked = window.game.castling.wQ;
                    if (document.getElementById('castling-bK')) document.getElementById('castling-bK').checked = window.game.castling.bK;
                    if (document.getElementById('castling-bQ')) document.getElementById('castling-bQ').checked = window.game.castling.bQ;
                }
            });
        }
        // 🔥 960 EDITOR TOGGLE
        const toggle960 = document.getElementById('editor960Toggle');
        if (toggle960) {
            toggle960.addEventListener('change', (e) => {
                if (window.game) {
                    window.game.isChess960 = e.target.checked;
                    if (window.sfWorker) window.sfWorker.postMessage(`setoption name UCI_Chess960 value ${e.target.checked ? 'true' : 'false'}`);
                    console.log(`[EDITOR] Chess960 Mode: ${e.target.checked ? 'ON' : 'OFF'}`);
                }
            });
        }
        // ==========================================================
this.renderCharts();
window.addEventListener('resize', () => this.resizeApp());
// 🔥 THE FIX: Observe the chart containers directly so it works in BOTH Analysis and Study modes!
    const evalContainer = document.getElementById('evalChartContainer');
    const timeContainer = document.getElementById('timeChartContainer');
    
    if (!this._chartObserver && (evalContainer || timeContainer)) {
        this._chartObserver = new ResizeObserver(() => {
            if (typeof this.safeResizeCharts === 'function') this.safeResizeCharts();
        });
        if (evalContainer) this._chartObserver.observe(evalContainer);
        if (timeContainer) this._chartObserver.observe(timeContainer);
    }
try {
            const savedTheme = JSON.parse(localStorage.getItem('chessThemeCache'));
            if (savedTheme && savedTheme.lightHex) {
                this.setPresetTheme(
                    savedTheme.lightHex, 
                    savedTheme.darkHex, 
                    null, // Pass null instead of 'this' to prevent the crash!
                    savedTheme.accentColor, 
                    savedTheme.gridColor, 
                    savedTheme.pieceSet,
                    savedTheme.appBg
                );
            } else {
                this.setPresetTheme('#2bb7ca', '#19579a', this,'#2bb7ca','transparent', 'merida', 'radial-gradient(circle at 50% 0%, #1e3a4c 0%, #0f172a 60%, #020617 100%)')
            }
        } catch (e) {
            this.setPresetTheme('#2bb7ca', '#19579a', this,'#2bb7ca','transparent', 'merida', 'radial-gradient(circle at 50% 0%, #1e3a4c 0%, #0f172a 60%, #020617 100%)')
        }
    const resignBtn = document.getElementById('resignBtn');
        const drawBtn = document.getElementById('drawBtn');
        if (resignBtn) resignBtn.style.display = 'none';
        if (drawBtn) drawBtn.style.display = 'none';
    }
async loadCustomPieces() {
        if (!window.showDirectoryPicker) {
            this.showNotification("Your browser does not support folder access. Please use Chrome, Edge, or Opera.", "Not Supported", "⚠️");
            return;
        }

        try {
            // 1. Open Folder Picker
            const dirHandle = await window.showDirectoryPicker();
            
            // 2. Update Input UI
            const inputPath = document.getElementById('assetFolder');
            if (inputPath) inputPath.value = dirHandle.name;

            this.customPieces = {}; 
            let count = 0;

            // 3. Scan Files
            for await (const entry of dirHandle.values()) {
                if (entry.kind === 'file') {
                    const file = await entry.getFile();
                    const name = file.name;             // e.g. "bN.webp"
                    const lower = name.toLowerCase();   // e.g. "bn.webp"
                    
                    let color = null;
                    let type = null;

                    // --- STRATEGY A: STRICT 2-CHAR CHECK (Prioritize this!) ---
                    // Looks for: Starts with w/b, then p/n/b/r/q/k, then a dot.
                    // Matches: "bN.webp", "wp.png", "bK.svg"
                    const shortMatch = lower.match(/^([wb])([pnbrqk])\./);
                    
                    if (shortMatch) {
                        color = shortMatch[1];              // 'w' or 'b'
                        type = shortMatch[2].toUpperCase(); // 'P', 'N', etc.
                    } 
                    // --- STRATEGY B: FUZZY MATCHING (For "black_knight.png" etc) ---
                    else {
                        // Detect Color
                        if (lower.includes('white') || lower.includes('light') || lower.startsWith('w')) color = 'w';
                        if (lower.includes('black') || lower.includes('dark') || lower.startsWith('b')) color = 'b';

                        // Detect Type
                        if (lower.includes('pawn') || lower.includes('_p') || lower.includes('p.')) type = 'P';
                        else if (lower.includes('knight') || lower.includes('_n') || lower.includes('n.')) type = 'N';
                        else if (lower.includes('bishop') || lower.includes('_b') || lower.includes('b.')) type = 'B';
                        else if (lower.includes('rook') || lower.includes('_r') || lower.includes('r.')) type = 'R';
                        else if (lower.includes('queen') || lower.includes('_q') || lower.includes('q.')) type = 'Q';
                        else if (lower.includes('king') || lower.includes('_k') || lower.includes('k.')) type = 'K';
                    }

                    // --- SAVE IF VALID ---
                    if (color && type) {
                        const key = color + type; // e.g. "wP", "bN"
                        this.customPieces[key] = URL.createObjectURL(file);
                        count++;
                        console.log(`Loaded: ${name} -> ${key}`);
                    } else {
                        console.warn(`Skipped unknown file: ${name}`);
                    }
                }
            }

            if (count > 0) {
                this.pieceTheme = 'custom';
                // Force a full re-render including clearing cache
                const pieces = document.querySelectorAll('.piece-img');
                pieces.forEach(p => p.src = ""); 
                
                this.renderBoard(false);
                this.showNotification(`Loaded ${count} pieces from "${dirHandle.name}"!\n(Theme set to 'custom')`, "Success", "✅");
            } else {
                this.showNotification("No recognizable chess pieces found.\nPlease name them: bN.webp, wP.svg, etc.", "Invalid Folder", "❌");
            }

        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error("Folder Access Error:", err);
                this.showNotification("Error accessing folder. Check console.", "Error", "❌");
            }
        }
    }
async fetchPlayerStats() {
        const username = document.getElementById('statUsername')?.value.trim();
        const platform = document.getElementById('statPlatform')?.value;
        // Now accurately grabs the user's choice from the dropdown
        const timeControl = document.getElementById('statTimeControl')?.value; 
        const resultDiv = document.getElementById('statResult');
        
        if (!resultDiv) return;
        if (!username) {
            resultDiv.innerHTML = `<span style="color:#fa412d">Please enter a username.</span>`;
            return;
        }

        resultDiv.innerHTML = `<div style="color:#38bdf8; text-align:center; padding:20px;">Fetching ${timeControl} games... ⏳<br><small>(This may take a few seconds)</small></div>`;

        try {
            let games = [];
            
            // ==========================================
            // 1. FETCH RECENT GAMES
            // ==========================================
            if (platform === 'lichess') {
                // Feeds the exact time control to Lichess
                const res = await fetch(`https://lichess.org/api/games/user/${username}?max=50&perfType=${timeControl}`);
                if (!res.ok) throw new Error("User not found or API limited.");
                const pgnData = await res.text();
                games = pgnData.split('\n\n\n').filter(g => g.trim().length > 0);
            } 
            else {
                // Fetch current month's archive from Chess.com
                const date = new Date();
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                
                const archiveRes = await fetch(`https://api.chess.com/pub/player/${username}/games/${year}/${month}`);
                if (!archiveRes.ok) throw new Error("User not found or no games this month.");
                const archiveData = await archiveRes.json();
                
                // Filters the Chess.com archive by the exact time control selected
                let chessComTimeClass = timeControl;
                if (timeControl === 'classical') chessComTimeClass = 'daily'; // Chess.com calls classical 'daily'
                
                games = archiveData.games
                    .filter(g => g.time_class === chessComTimeClass)
                    .map(g => g.pgn)
                    .filter(pgn => pgn);
                    
                if (games.length > 50) games = games.slice(-50); 
            }

            if (games.length === 0) {
                resultDiv.innerHTML = `<span style="color:#f7c045">Not enough recent ${timeControl} games found to generate insights.</span>`;
                return;
            }

            // ==========================================
            // 2. MATHEMATICAL ANALYSIS ENGINE
            // ==========================================
            let stats = {
                total: games.length,
                wins: 0, losses: 0, draws: 0,
                whiteWins: 0, whiteTotal: 0,
                blackWins: 0, blackTotal: 0,
                openings: {},
                endgamesReached: 0,
                timeLosses: 0,
                blundersInferred: 0 // Inferred by sudden resignations in short games
            };

            const un = username.toLowerCase();

            games.forEach(pgn => {
                if (!pgn) return;
                
                // Extract Metadata
                const whiteMatch = pgn.match(/\[White\s+"([^"]+)"\]/i);
                const blackMatch = pgn.match(/\[Black\s+"([^"]+)"\]/i);
                const resultMatch = pgn.match(/\[Result\s+"([^"]+)"\]/i);
                const ecoMatch = pgn.match(/\[ECOUrl\s+".*?\/([^"]+)"\]/i) || pgn.match(/\[ECO\s+"([^"]+)"\]/i);
                const termMatch = pgn.match(/\[Termination\s+"([^"]+)"\]/i);
                
                const isWhite = whiteMatch && whiteMatch[1].toLowerCase() === un;
                const isBlack = blackMatch && blackMatch[1].toLowerCase() === un;
                const result = resultMatch ? resultMatch[1] : '*';
                
                // Count Moves
                const moves = pgn.split(/\d+\./).length - 1;
                if (moves > 40) stats.endgamesReached++;

                // Win/Loss Tracking
                let isWin = (isWhite && result === '1-0') || (isBlack && result === '0-1');
                let isLoss = (isWhite && result === '0-1') || (isBlack && result === '1-0');
                let isDraw = result === '1/2-1/2';

                if (isWin) stats.wins++;
                if (isLoss) stats.losses++;
                if (isDraw) stats.draws++;

                if (isWhite) {
                    stats.whiteTotal++;
                    if (isWin) stats.whiteWins++;
                }
                if (isBlack) {
                    stats.blackTotal++;
                    if (isWin) stats.blackWins++;
                }

                // Opening Tracking
                if (ecoMatch && ecoMatch[1]) {
                    const openingName = ecoMatch[1].replace(/-/g, ' ');
                    if (!stats.openings[openingName]) stats.openings[openingName] = { played: 0, wins: 0 };
                    stats.openings[openingName].played++;
                    if (isWin) stats.openings[openingName].wins++;
                }

                // Weakness Inference
                if (isLoss && termMatch && termMatch[1].toLowerCase().includes('time')) {
                    stats.timeLosses++;
                }
                if (isLoss && moves < 20 && termMatch && termMatch[1].toLowerCase().includes('resigned')) {
                    stats.blundersInferred++; 
                }
            });

            // ==========================================
            // 3. GENERATE INSIGHTS UI
            // ==========================================
            const winRate = Math.round((stats.wins / stats.total) * 100);
            const wWinRate = stats.whiteTotal > 0 ? Math.round((stats.whiteWins / stats.whiteTotal) * 100) : 0;
            const bWinRate = stats.blackTotal > 0 ? Math.round((stats.blackWins / stats.blackTotal) * 100) : 0;
            const endgameRate = Math.round((stats.endgamesReached / stats.total) * 100);

            // Sort Openings by popularity
            const topOpenings = Object.entries(stats.openings)
                .sort((a, b) => b[1].played - a[1].played)
                .slice(0, 3);

            // Dynamic Suggestions
            let suggestions = "";
            if (stats.timeLosses > stats.losses * 0.3) {
                suggestions += `<li>⏱️ <b>Time Management:</b> You lost ${stats.timeLosses} games on time. Play faster in the opening to save time for critical middlegame calculations.</li>`;
            }
            if (wWinRate < 45) {
                suggestions += `<li>⚪ <b>White Repertoire:</b> Your win rate with White is only ${wWinRate}%. You should be dictating the game. Review your primary opening lines.</li>`;
            }
            if (stats.blundersInferred >= 3) {
                suggestions += `<li>💥 <b>Tactical Vision:</b> You resigned early in ${stats.blundersInferred} games. Focus on puzzle training to avoid early tactical blunders.</li>`;
            }
            if (suggestions === "") {
                suggestions = `<li>🔥 Keep up the momentum! Your recent play is solid across the board.</li>`;
            }

            // Render the Dashboard
            resultDiv.innerHTML = `
                <div style="background:#1e1e1e; padding:15px; border-radius:8px; border:1px solid #333;">
                    <h3 style="color:#96bc4b; margin-top:0; border-bottom:1px solid #333; padding-bottom:10px;">
                        Insights: Last ${stats.total} Games (${timeControl.replace('chess_', '')})
                    </h3>
                    
                    <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                        <div style="text-align:center;">
                            <div style="font-size:24px; color:${winRate >= 50 ? '#26c2a3' : '#fa412d'}; font-weight:bold;">${winRate}%</div>
                            <div style="font-size:12px; color:#888;">Overall Win Rate</div>
                        </div>
                        <div style="text-align:center;">
                            <div style="font-size:20px; color:#fff;">${wWinRate}%</div>
                            <div style="font-size:12px; color:#888;">White Wins</div>
                        </div>
                        <div style="text-align:center;">
                            <div style="font-size:20px; color:#fff;">${bWinRate}%</div>
                            <div style="font-size:12px; color:#888;">Black Wins</div>
                        </div>
                    </div>

                    <div style="margin-bottom:15px; background:#2a2a2a; padding:10px; border-radius:5px;">
                        <div style="color:#38bdf8; font-weight:bold; margin-bottom:8px;">Top Openings</div>
                        ${topOpenings.map(([name, data]) => `
                            <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
                                <span style="color:#ccc;">${name.substring(0, 20)}...</span>
                                <span>${data.played} played (<span style="color:#96bc4b">${Math.round((data.wins/data.played)*100)}% win</span>)</span>
                            </div>
                        `).join('')}
                    </div>

                    <div style="margin-bottom:15px; background:#2a2a2a; padding:10px; border-radius:5px;">
                        <div style="color:#b369f2; font-weight:bold; margin-bottom:8px;">Playstyle Tendencies</div>
                        <div style="font-size:13px; color:#ccc;">⚔️ <b>Endgame Frequency:</b> ${endgameRate}% of games reach Move 40.</div>
                        <div style="font-size:13px; color:#ccc;">⏳ <b>Clock Trouble:</b> ${stats.timeLosses} losses due to timeout.</div>
                    </div>

                    <div style="background:#2a2a2a; border-left:4px solid #f7c045; padding:10px; border-radius:3px;">
                        <div style="color:#f7c045; font-weight:bold; margin-bottom:5px;">Actionable Advice</div>
                        <ul style="margin:0; padding-left:20px; font-size:13px; color:#ccc;">
                            ${suggestions}
                        </ul>
                    </div>
                </div>`;

        } catch (e) {
            resultDiv.innerHTML = `<span style="color:#fa412d">Error: ${e.message}</span>`;
            console.error(e);
        }
    }
resizeApp() {
        const scaler = document.getElementById('app-scaler');
        if (!scaler) return;

        ['settingsPanel', 'annotationPopup', 'scannerModal', 'previewPopup'].forEach(id => {
            const popup = document.getElementById(id);
            if (popup) {
                popup.style.position = 'absolute';
                popup.style.zIndex = '999999';
            }
        });

        const mainLayout = document.querySelector('.main-layout');
        const mainContainer = document.querySelector('.main-container');
        const boardSection = document.querySelector('.board-section');
        
        const analysisPanel = document.getElementById('analysisPanel');
        const studySidebar = document.getElementById('study-sidebar'); 
        const bottomPanel = document.getElementById('studyBottomPanel'); 
        const mainSidebar = document.getElementById('mainSidebar'); 

        const game = window.game;
        const isAnalysis = game ? game.isAnalysisMode : false;
        const isStudy = game ? game.mode === 'study' : false;
        const isWideMode = isAnalysis || isStudy;

        if (isWideMode) {
            if (mainLayout) mainLayout.style.justifyContent = 'flex-start';
            if (mainContainer) mainContainer.style.justifyContent = 'flex-start';
        } else {
            if (mainLayout) mainLayout.style.justifyContent = 'center';
            if (mainContainer) mainContainer.style.justifyContent = 'center';
        }

        if (mainSidebar) mainSidebar.style.height = '';
        if (studySidebar) studySidebar.style.height = '';
        if (analysisPanel) analysisPanel.style.height = '';

        const boardSecHeight = boardSection ? boardSection.offsetHeight : 936;
        const safeSidebarHeight = Math.max(936, boardSecHeight);
        let targetHeight = Math.max(986, safeSidebarHeight + 50); 

        if (mainSidebar) mainSidebar.style.height = safeSidebarHeight + 'px';
        if (studySidebar) studySidebar.style.height = safeSidebarHeight + 'px';
        if (analysisPanel) analysisPanel.style.height = safeSidebarHeight + 'px';

        // ==========================================================
        // 🔥 THE FIX: FORCE THE PGN TABS TO COLLAPSE AND SCROLL
        // ==========================================================
        // 1. Give the sidebars a hard ceiling so they cannot stretch
        if (mainSidebar) mainSidebar.style.maxHeight = safeSidebarHeight + 'px';
        if (studySidebar) studySidebar.style.maxHeight = safeSidebarHeight + 'px';
        if (analysisPanel) analysisPanel.style.maxHeight = safeSidebarHeight + 'px';

        // 2. Override the Tab Switcher's 'display: block'. If tab-pane isn't flex, the PGN stretches infinitely.
        document.querySelectorAll('.tabs-content, .tab-pane').forEach(el => {
            if (el) {
                el.style.display = 'flex';
                el.style.flexDirection = 'column';
                el.style.minHeight = '0'; // Kills the invisible CSS stretch rule
            }
        });

        // 3. Guarantee the scrollbar activates
        ['moveHistory', 'studyPgnContainer'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.flex = '1 1 0%';
                el.style.minHeight = '0';
                el.style.overflowY = 'auto';
            }
        });

        // ==========================================================
        // DYNAMIC TARGET WIDTH (Your original untouched math)
        // ==========================================================
        let targetWidth = 0;

        const getW = (el) => {
            if (!el) return 0;
            const comp = window.getComputedStyle(el);
            return comp.display === 'none' ? 0 : el.offsetWidth;
        };

        const leftW = isStudy ? getW(studySidebar) : (isAnalysis ? getW(analysisPanel) : 0);
        const boardW = boardSection ? boardSection.offsetWidth : 650;
        const rightW = getW(mainSidebar);

        if (leftW > 0) targetWidth += leftW + 40;   
        targetWidth += boardW;                      
        if (rightW > 0) targetWidth += rightW + 40; 
        
        targetWidth += 40; 

        scaler.style.width = targetWidth + 'px';
        scaler.style.height = targetHeight + 'px';
        scaler.style.position = 'absolute';
        scaler.style.left = '0';
        scaler.style.top = '0';

        if (bottomPanel) {
            if (bottomPanel.parentNode !== scaler) scaler.appendChild(bottomPanel); 
            
            if (isStudy) { 
                const lW = getW(studySidebar);
                const pW = getW(mainSidebar);
                
                let exactWidth = lW + boardW + pW;
                if (lW > 0) exactWidth += 40; 
                if (pW > 0) exactWidth += 40; 
                
                bottomPanel.style.display = 'flex';
                bottomPanel.style.position = 'absolute';
                bottomPanel.style.top = (safeSidebarHeight + 50) + 'px'; 
                bottomPanel.style.left = '80px'; 
                bottomPanel.style.width = exactWidth + 'px'; 
                bottomPanel.style.zIndex = '10';
                bottomPanel.style.margin = '0'; 
                
                if (typeof this.safeResizeCharts === 'function') this.safeResizeCharts();
            } else {
                bottomPanel.style.display = 'none';
            }
        }

        const availableWidth = window.innerWidth; 
        const availableHeight = window.innerHeight;
        
        let scaleX = availableWidth / targetWidth;
        let scaleY = availableHeight / targetHeight;
        
        let scale = Math.min(scaleX, scaleY);
        scale = Math.max(0.3, scale); 
        scale = Math.min(1.2, scale);

        window.appScale = scale; 

        const actualScaledWidth = targetWidth * scale;
        const actualScaledHeight = targetHeight * scale;
        
        let offsetX = Math.max(0, (window.innerWidth - actualScaledWidth) / 2); 
        let offsetY = Math.max(0, (window.innerHeight - actualScaledHeight) / 2);

        if (isWideMode && offsetX < 20) offsetX = 20;
        if (offsetY > 20) offsetY = 20;

        scaler.style.transformOrigin = "top left";
        scaler.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;

        const totalContentHeight = isStudy ? (targetHeight + 450) * scale : targetHeight * scale;
        document.body.style.minHeight = (totalContentHeight + offsetY + 50) + 'px'; 
        document.body.style.overflowY = 'auto';
        document.body.style.overflowX = 'hidden'; 
    }
setMoveMethod(val) {
this.moveInputMode = val;
this.selectedSq = null;
this.legalMoves = [];
this.renderBoard(false);
}
populatePieceSets() {
const selector = document.getElementById('assetType');
if (!selector) return;
selector.innerHTML ='';
for (let key in PIECE_SETS) {
let opt = document.createElement('option');
opt.value = key;
opt.innerText = PIECE_SETS[key].name;
selector.appendChild(opt);
}
// 2. Add Local Folder Option (Always at bottom)
let localOpt = document.createElement('option');
localOpt.value ='local';
localOpt.innerText ='Local Folder';
selector.appendChild(localOpt);
}
toggleAnimations() {
const checkbox = document.getElementById('enableAnimations');
const enabled = checkbox ? checkbox.checked :true;
this.animationsEnabled = enabled;
if (enabled) {
document.body.classList.remove('no-animations');
} else {
document.body.classList.add('no-animations');
}
}
toggleEngine(forceOff = false) {
        // 1. Check for restricted modes
        const isLiveGame = window.game && window.game.isPlayingLiveGame;
        const isPuzzle = window.game && window.game.mode === 'puzzle' && !window.game.gameOver;

        if (forceOff) {
            window.engineAnalysing = false;
        } else if (isLiveGame) {
            if (window.ui && typeof window.ui.showNotification === 'function') {
                window.ui.showNotification("Engine assistance is disabled during active play.", "Action Restricted", "🚫");
            }
            window.engineAnalysing = false; // Force it off
        } else if (isPuzzle) {
            if (window.ui && typeof window.ui.showNotification === 'function') {
                window.ui.showNotification("Solve the puzzle first!", "Action Restricted", "❌");
            }
            window.engineAnalysing = false; // Force it off
        } else {
            // Normal toggle behavior if not restricted
            window.engineAnalysing = !window.engineAnalysing;
        }
        
        const btn = document.querySelector('.engine-toggle-btn');
        const panel = document.getElementById('enginePanel');
        const stats = document.getElementById('engine-stats-container');

        // 2. Handle the Visual UI Panels
        if (window.engineAnalysing) {
            if (btn) btn.classList.add('active');
            if (panel) { panel.classList.add('visible'); panel.style.display = ''; }
            if (stats) { stats.classList.add('visible'); stats.style.display = ''; }
        } else {
            if (btn) btn.classList.remove('active');
            if (panel) { panel.classList.remove('visible'); panel.style.display = 'none'; }
            if (stats) { stats.classList.remove('visible'); stats.style.display = 'none'; }
        }

        // 🔥 3. ALWAYS tell the game logic about the change!
        // Because we removed the "return", restricted modes will now successfully 
        // reach this line to clear the timeouts, wipe the arrows, and lock the engine.
        if (window.game && typeof window.game.updateStockfish === 'function') {
            window.game.updateStockfish();
        }
    }
updateEngineName(fullName, shortName = null) {
        if (!fullName) return;

        if (fullName === "Engine Loading...") {
            shortName = fullName;
        } else if (!shortName) {
            const match = fullName.match(/^([a-zA-Z]+(?:\s+\d+(?:\.\d+)?)?)/);
            shortName = match ? match[1] : fullName;
        }

        const cleanFull = fullName.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
        const cleanShort = shortName.replace(/[-_]/g, ' ').trim();
        window.currentEngineShortName = cleanShort;
        const safeUpdate = (elementId, newText) => {
            const el = document.getElementById(elementId);
            if (el) {
                const children = Array.from(el.children); 
                el.textContent = newText + " ";           
                children.forEach(c => el.appendChild(c)); 
            }
        };

        safeUpdate('engine-btn-name', cleanShort);
        safeUpdate('engine-stats-name', cleanFull.toUpperCase());

        const pvHeader = document.getElementById('engine-name') || document.getElementById('pvBoxTitle') || document.querySelector('.engine-title');
        if (pvHeader) {
            const children = Array.from(pvHeader.children);
            pvHeader.textContent = cleanFull.toUpperCase() + " ";
            children.forEach(c => pvHeader.appendChild(c));
        }
        
        // 🔥 THE FIX: Inject the specific engine version (e.g. "Stockfish 18") 
        // underneath the main bot title in the player headers automatically!
        ['w', 'b'].forEach(color => {
            if (this.playerInfo && this.playerInfo[color] && this.playerInfo[color].name) {
                if (this.playerInfo[color].name.toLowerCase().includes("stockfish") || this.playerInfo[color].name.toLowerCase().includes("engine")) {
                    this.playerInfo[color].meta = cleanShort; 
                }
            }
        });
        
        if (typeof this.renderHeaders === 'function') this.renderHeaders();
    }
initKeyboardListeners() {
document.addEventListener('keydown', (e) => {
//"Space"to Peek in Blindfold Mode
if (e.code ==='Space'&&this.blindfoldMode &&!this.isPeeking) {
this.isPeeking = true;
this.renderBoard(false); // Re-render to show pieces
}
});
document.addEventListener('keyup', (e) => {
// Release"Space"to hide again
if (e.code ==='Space'&&this.blindfoldMode &&this.isPeeking) {
this.isPeeking = false;
this.renderBoard(false); // Re-render to hide
}
});
}
setAvatar(pos, input) {
if (input.files &&input.files[0]) {
const reader = new FileReader();
reader.onload = (e) => {
const imgHTML = `<img src="${e.target.result} "style="width:100%; height:100%; object-fit:cover; border-radius:4px;">`;
let color ='w';
if (pos ==='top') color = this.flipped ?'w':'b';
else color = this.flipped ?'b':'w';
// Save it
this.avatars[color] = imgHTML;
// Update UI Button Text
const btnSpan = input.parentElement.querySelector('span');
if (btnSpan) btnSpan.innerText = input.files[0].name;
this.renderHeaders();
};
reader.readAsDataURL(input.files[0]);
}
}
getCountryFlagHtml(countryData) {
        if (!countryData) return ''; 

        let code = countryData;
        if (code.includes('/')) code = code.split('/').pop(); 
        
        const lowerCode = code.toLowerCase();

        // Point straight to the folder you just downloaded!
        const localUrl = `./assets/flags/${lowerCode}.svg`;

        // 🔥 THE FIX 2: Removed the hardcoded 'title' attribute so the browser reads the span's dictionary title instead!
        return `<img src="${localUrl}" class="player-flag" alt="${code}" onerror="this.style.display='none'">`;
    }
displayMetadata(headers) {
        const container = document.getElementById('gameInfo'); 
        if (!container) return;

        // 🔥 CRITICAL FIX: Extract Titles BEFORE the caching block!
        // This ensures the red badges are always prepared for renderHeaders() even if the grid HTML is cached.
        if (this.playerInfo) {
            if (this.playerInfo['w']) this.playerInfo['w'].title = headers['WhiteTitle'] || null;
            if (this.playerInfo['b']) this.playerInfo['b'].title = headers['BlackTitle'] || null;
        }

        // 🔥 THE FIX: JSON CACHING
        // If the metadata hasn't changed, stop immediately so we don't rebuild the HTML!
        const cacheKey = JSON.stringify(headers || {});
        if (this._lastMetadataCache === cacheKey) return;
        this._lastMetadataCache = cacheKey;

        // [FIX] 2 Columns (1fr 1fr) + Scrollbar (max-height)
        let html = '<div style="display:grid; grid-template-columns: 1fr 1fr; gap: 5px 20px; max-height: 200px; overflow-y: auto; font-size:0.85rem; color:#94a3b8; padding:12px; background:rgba(0,0,0,0.2); border-radius:6px; margin-bottom:10px; border:1px solid #333;">';
        
        // 🔥 Added 'Variant' and 'FEN' to the priority list so they show up consistently
        const priority = ['Event','Site','Date','Round','Variant','ECO','Opening','Result','Link','FEN'];
        
        const keys = Object.keys(headers).sort((a, b) => {
            const idxA = priority.indexOf(a);
            const idxB = priority.indexOf(b);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.localeCompare(b);
        });

        keys.forEach(key => {
            // 🔥 Hid 'WhiteTitle' and 'BlackTitle' from the text box since they are now badges!
            if (['White','Black','WhiteElo','BlackElo','SetUp', 'WhiteTitle', 'BlackTitle'].includes(key)) return;
            
            let value = headers[key] ? headers[key].toString().trim() : "";
            if (!value) return; // Skip empty keys
            
            const rawValue = value; // Keep raw for title attribute

            // Link Detection (Http or www)
            if (value.toLowerCase().startsWith('http') || value.toLowerCase().startsWith('www')) {
                const url = value.toLowerCase().startsWith('www') ? 'https://' + value : value;
                // Clickable, blue, full URL
                value = `<a href="${url}" target="_blank" style="color:#38bdf8; text-decoration:underline; cursor:pointer;">${value}</a>`;
            }

            // 🔥 Special handling for FEN: Span across both columns and break the text!
            if (key === 'FEN') {
                html += `<div style="grid-column: 1 / -1; word-break: break-all; line-height: 1.4;" title="${rawValue}">
                            <span style="font-weight:600; color:#2872b5; margin-right:4px;">${key}:</span>${value}
                         </div>`;
            } else {
                html += `<div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; line-height:1.4;" title="${rawValue}">
                            <span style="font-weight:600; color:#2872b5; margin-right:4px;">${key}:</span>${value}
                         </div>`;
            }
        });
        
        html += '</div>';
        container.innerHTML = html;

        // Keep the Editor input box perfectly synced with the loaded PGN!
        const fenInput = document.getElementById('fenInput');
        if (fenInput && headers['FEN']) {
            fenInput.value = headers['FEN'];
        }
    }
renderHeaders() {
        if (window.game && window.game.mode === 'editor') return;

        const container = document.getElementById('gameInfo'); 
        if (!container) return;
        
        const nameLabels = document.querySelectorAll('.player-name');
        const metaLabels = document.querySelectorAll('.player-meta');
        
        if (nameLabels.length < 2 || metaLabels.length < 2) {
            return;
        }

        const topColor = this.flipped ? 'w' : 'b';
        const botColor = this.flipped ? 'b' : 'w';
        
        const topData = this.playerInfo[topColor] || {};
        const botData = this.playerInfo[botColor] || {};

        const cacheKey = JSON.stringify({ topData, botData, flipped: this.flipped, avatars: this.avatars });
        if (this._lastHeadersCache === cacheKey) return;
        this._lastHeadersCache = cacheKey;

        // 🔥 THE NEW DICTIONARY: Translates ISO codes to Full Names for the hover tooltip!
        const isoToCountryName = {
            "us": "United States", "ca": "Canada", "ar": "Argentina", "be": "Belgium", "af": "Afghanistan",
            "al": "Albania", "ad": "Andorra", "ai": "Anguilla", "ag": "Antigua & Barbuda", "am": "Armenia", 
            "aw": "Aruba", "au": "Australia", "at": "Austria", "bs": "Bahamas", "bh": "Bahrain", 
            "bb": "Barbados", "xx": "International", "bz": "Belize", "bm": "Bermuda", "bo": "Bolivia", 
            "ba": "Bosnia & Herzegovina", "br": "Brazil", "bg": "Bulgaria", "es-cn": "Canary Islands",
            "ky": "Cayman Islands", "cl": "Chile", "cn": "China", "co": "Colombia", "cr": "Costa Rica", 
            "hr": "Croatia", "cu": "Cuba", "cw": "Curaçao", "cy": "Cyprus", "cz": "Czech Republic", 
            "dk": "Denmark", "dm": "Dominica", "do": "Dominican Republic", "ec": "Ecuador", "eg": "Egypt", 
            "sv": "El Salvador", "ee": "Estonia", "fk": "Falkland Islands", "fo": "Faroe Islands", 
            "fj": "Fiji", "fi": "Finland", "fr": "France", "ge": "Georgia", "de": "Germany", 
            "gi": "Gibraltar", "gr": "Greece", "gl": "Greenland", "gd": "Grenada", "gp": "Guadeloupe",
            "gu": "Guam", "gt": "Guatemala", "gg": "Guernsey", "gy": "Guyana", "ht": "Haiti", 
            "hn": "Honduras", "hk": "Hong Kong", "hu": "Hungary", "is": "Iceland", "in": "India",
            "id": "Indonesia", "ir": "Iran", "iq": "Iraq", "ie": "Ireland", "im": "Isle of Man", 
            "il": "Israel", "it": "Italy", "jm": "Jamaica", "jp": "Japan", "je": "Jersey",
            "jo": "Jordan", "kz": "Kazakhstan", "ki": "Kiribati", "kw": "Kuwait", "lv": "Latvia", 
            "lb": "Lebanon", "li": "Liechtenstein", "lt": "Lithuania", "lu": "Luxembourg",
            "mo": "Macau", "mk": "North Macedonia", "my": "Malaysia", "mt": "Malta", "mq": "Martinique", 
            "md": "Moldova", "mx": "Mexico", "mc": "Monaco", "ms": "Montserrat", "nr": "Nauru",
            "np": "Nepal", "nl": "Netherlands", "nz": "New Zealand", "ni": "Nicaragua", "no": "Norway", 
            "om": "Oman", "pk": "Pakistan", "pa": "Panama", "pg": "Papua New Guinea", "py": "Paraguay",
            "pe": "Peru", "ph": "Philippines", "pl": "Poland", "pt": "Portugal", "pr": "Puerto Rico", 
            "ro": "Romania", "ru": "Russia", "kn": "Saint Kitts & Nevis", "lc": "Saint Lucia",
            "pm": "Saint Pierre & Miquelon", "sm": "San Marino", "sa": "Saudi Arabia", "sg": "Singapore", 
            "sk": "Slovakia", "si": "Slovenia", "sb": "Solomon Islands", "za": "South Africa",
            "gs": "South Georgia", "sr": "Suriname", "se": "Sweden", "ch": "Switzerland", "tw": "Taiwan", 
            "th": "Thailand", "to": "Tonga", "tt": "Trinidad & Tobago", "tr": "Turkey", "tm": "Turkmenistan",
            "tv": "Tuvalu", "ua": "Ukraine", "ae": "United Arab Emirates", "uy": "Uruguay", "uz": "Uzbekistan", 
            "vu": "Vanuatu", "va": "Vatican City", "ve": "Venezuela", "vn": "Vietnam",
            "ye": "Yemen", "as": "American Samoa", "vc": "Saint Vincent & Grenadines", "az": "Azerbaijan", 
            "mn": "Mongolia", "sy": "Syria", "gb-eng": "England", "mh": "Marshall Islands", "gb-sct": "Scotland", 
            "es": "Spain", "gb": "United Kingdom", "vi": "U.S. Virgin Islands", "gb-wls": "Wales",
            "kr": "South Korea", "kg": "Kyrgyzstan", "bd": "Bangladesh", "sd": "Sudan", "bj": "Benin",
            "bt": "Bhutan", "bw": "Botswana", "bn": "Brunei", "bi": "Burundi", "kh": "Cambodia", 
            "cm": "Cameroon", "cv": "Cape Verde", "cf": "Central African Republic", "td": "Chad", "cg": "Congo",
            "ci": "Côte d'Ivoire", "dj": "Djibouti", "gq": "Equatorial Guinea", "ga": "Gabon", "gh": "Ghana", 
            "ke": "Kenya", "la": "Laos", "lr": "Liberia", "mg": "Madagascar", "ma": "Morocco",
            "mz": "Mozambique", "mm": "Myanmar", "na": "Namibia", "ne": "Niger", "ng": "Nigeria", 
            "qa": "Qatar", "rw": "Rwanda", "ws": "Samoa", "st": "Sao Tome & Principe",
            "sn": "Senegal", "sl": "Sierra Leone", "so": "Somalia", "lk": "Sri Lanka", "sz": "Eswatini", 
            "tj": "Tajikistan", "tz": "Tanzania", "tl": "Timor-Leste", "tg": "Togo", "tn": "Tunisia",
            "ug": "Uganda", "zm": "Zambia", "zw": "Zimbabwe", "dz": "Algeria", "mr": "Mauritania"
        };

        const updateSlot = (index, data, color) => {
            const rawName = data.name || (color === 'w' ? "White" : "Black");
            
            let nameTxt = rawName.replace(/\s?\(.*?\)/, '').trim();
            
            let activeTitle = data.title;
            const titleRegex = /^(GM|IM|FM|CM|WGM|WIM|WFM|WCM|NM)\s+/i;
            if (!activeTitle && nameTxt.match(titleRegex)) {
                activeTitle = nameTxt.match(titleRegex)[1].toUpperCase();
                nameTxt = nameTxt.replace(titleRegex, '').trim();
            }

            let flagHtml = (typeof this.getCountryFlagHtml === 'function') 
                ? this.getCountryFlagHtml(data.country) 
                : '';
            
            // 🔥 THE FIX 1: Convert country code to lowercase so the dictionary can find it!
            if (flagHtml && data.country) {
                const countryKey = data.country.toLowerCase();
                const fullName = isoToCountryName[countryKey] || data.country.toUpperCase();
                
                flagHtml = `<span title="${fullName}" style="cursor: help; display: flex; align-items: center;">${flagHtml}</span>`;
            }
            
            const titleHtml = activeTitle 
                ? `<span style="background-color: #b33430; color: #fff; font-size: 10px; font-weight: 800; padding: 2px 4px; border-radius: 3px; display: inline-block; line-height: 1.1;">${activeTitle}</span>` 
                : '';
                
            nameLabels[index].innerHTML = flagHtml + titleHtml + `<span style="text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">${nameTxt}</span>`;
            
            nameLabels[index].style.display = 'flex';
            nameLabels[index].style.alignItems = 'center';
            nameLabels[index].style.gap = '6px'; 
            
            let eloTxt = "";
            const match = rawName.match(/\((.*?)\)/);
            if (match) eloTxt = match[1];
            
            let metaTxt = data.meta || (color === 'w' ? "White" : "Black");
            if (metaTxt.toLowerCase() === 'human') metaTxt = ''; 
            
            if (eloTxt) {
                metaTxt = metaTxt ? `${metaTxt} • ${eloTxt}` : eloTxt;
            }
            
            metaLabels[index].innerText = metaTxt;
            metaLabels[index].style.color = data.metaColor || ((color === 'w') ? '#2872b5' : '#e68f00');
            metaLabels[index].style.fontWeight = '600';
            
            const parent = nameLabels[index].closest('.player-header');
            if (parent) {
                const avatar = parent.querySelector('.player-avatar') || parent.querySelector('.avatar');
                if (avatar) {
                    avatar.innerHTML = this.avatars[color] || `<img src="assets/tabs-icon/face.webp" style="width:100%; height:100%; object-fit:cover;">`;
                    avatar.style.borderColor = data.avatarBorder || ((color === 'w') ? '#2872b5' : '#e68f00');
                    avatar.style.backgroundColor = data.avatarBg || ((color === 'w') ? '#2872b5' : '#262421');
                }
                const clock = parent.querySelector('.clock') || parent.querySelector('.player-time');
                if (clock) {
                    clock.id = (color === 'w') ? 'timer-white' : 'timer-black';
                }
            }
        };

        updateSlot(0, topData, topColor); 
        updateSlot(1, botData, botColor);
        
        if (typeof this.updateClocks === 'function') {
            this.updateClocks();
        }
    }
resetAvatars() {
        const headers = document.querySelectorAll('.player-header');
        if (headers.length < 2) return;

        // Force defaults
        const commonAvatar = `<img src="assets/tabs-icon/face.webp" style="width:100%; height:100%; object-fit:cover; border-radius:4px;">`;

        const topAvatar = headers[0].querySelector('.player-avatar');
        if (topAvatar) topAvatar.innerHTML = commonAvatar;

        const botAvatar = headers[1].querySelector('.player-avatar');
        if (botAvatar) botAvatar.innerHTML = commonAvatar;

        const topInput = document.getElementById('avatarTopInput');
        const botInput = document.getElementById('avatarBotInput');
        if (topInput) { topInput.value = ""; topInput.parentElement.querySelector('span').innerText = "Choose Image"; }
        if (botInput) { botInput.value = ""; botInput.parentElement.querySelector('span').innerText = "Choose Image"; }
        
        this.avatars = { w: commonAvatar, b: commonAvatar };
    }
resetUIState() {
        // 1. Clear the Metadata (Game Info) container
        const container = document.getElementById('gameInfo');
        if (container) container.innerHTML = '';

        // 2. Reset internal player data to defaults
        this.playerInfo = {
            w: { name: "White", meta: "White", country: null, title: null },
            b: { name: "Black", meta: "Black", country: null, title: null }
        };

        // 3. Reset Avatars to the face icon and clear the file inputs
        this.resetAvatars();

        // 4. Clear the PGN headers in the game logic
        if (window.game) {
            window.game.pgnHeaders = {};
        }

        // 🔥 THE FIX: Break the caches so the UI is forced to visually reset!
        this._lastMetadataCache = null;
        this._lastHeadersCache = null;

        // 5. Force a render to show the clean "White vs Black" state
        // We bypass the editor check here or ensure mode has already changed
        this.renderHeaders(); 
    }
toggleReviewButton(show) {
        const btn = document.getElementById('reviewGameBtn');
        const results = document.getElementById('reviewResultsPanel');
        if (btn) btn.style.display = show ? 'block' : 'none';
        if (results && show) results.style.display = 'none'; // Reset results when a new game starts
    }
toggleSideMenu(forceOpen = null) {
        const panel = document.getElementById('sideMenuPanel');
        const overlay = document.getElementById('sideMenuOverlay');
        if (!panel || !overlay) return;

        // Prevent accidental HTML mouse events from overriding the boolean
        if (typeof forceOpen !== 'boolean') forceOpen = null;

        const isOpen = panel.style.left === '0px';
        const shouldOpen = forceOpen !== null ? forceOpen : !isOpen;

        if (shouldOpen) {
            // Show overlay, then slide panel in
            overlay.style.display = 'block';
            setTimeout(() => {
                panel.style.left = '0px';
            }, 10);
        } else {
            // Slide panel out, then hide overlay
            panel.style.left = '-360px';
            setTimeout(() => {
                overlay.style.display = 'none';
            }, 300); 
        }
    }
showGameOver(winner, reason) {
    const modal = document.getElementById('gameOverModal');
    const title = document.getElementById('winnerText');
    const sub = document.getElementById('winReason');
    const icon = document.getElementById('winnerIcon');
    const content = modal.querySelector('.modal-content');
    
    content.style.animation ='none';
    content.offsetHeight; /* trigger reflow */
    content.style.animation ='modalPop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
    
    if (winner === 'Draw') {
        title.innerText = "Game Drawn";
        title.style.color = "#ccc";
        icon.innerHTML = this.getPieceHTML({color:'w', type:'K'}); // Grey King
        icon.style.opacity = "0.5";
    } else {
        title.innerText = `${winner} Won!`;
        title.style.color = "#fff";
        const colorCode = (winner === 'White') ? 'w' : 'b';
        icon.innerHTML = this.getPieceHTML({color:colorCode, type:'K'});
        icon.style.opacity = "1";
    }
    
    sub.innerText = reason.replace('won', ''); 
    modal.style.display = 'flex';

    // Show the sidebar review button when game ends!
    this.toggleReviewButton(true);

    // ✅ AUTO-REDIRECT: Instantly snap back to Analysis mode behind the modal
    this.switchTab('analysis');
}
hideGameOver() {
        const modal = document.getElementById('gameOverModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }
updatePuzzleStats() {
        if (!window.game) return;

        const timerEl = document.getElementById('puzTimer');
        const scoreEl = document.getElementById('puzScore');
        const strikesEl = document.getElementById('puzStrikes');

        // 1. Update Timer
        if (timerEl) {
            if (window.game.puzzleMode === 'survival') {
                timerEl.innerText = "SURVIVAL";
                timerEl.style.color = "#fa412d";
            } else {
                // Fix NaN: Default to 0 if undefined
                const t = Math.max(0, window.game.puzzleTimeRemaining || 0);
                const m = Math.floor(t / 60).toString().padStart(2, '0');
                const s = (t % 60).toString().padStart(2, '0');
                timerEl.innerText = `${m}:${s}`;
                
                // Red color when low time
                timerEl.style.color = t < 30 ? "#fa412d" : "#fff";
            }
        }

        // 2. Update Score
        if (scoreEl) {
            scoreEl.innerText = window.game.puzzleScore || 0;
        }

        // 3. Update Strikes (3 Lives)
        if (strikesEl) {
            const maxStrikes = 3;
            // Fix NaN: Default to 0 strikes
            const current = window.game.puzzleStrikes || 0;
            
            let hearts = "";
            // Alive Hearts
            for(let i = 0; i < (maxStrikes - current); i++) hearts += "✅";
            // Dead Hearts
            for(let i = 0; i < current; i++) hearts += "❌"; 
            
            strikesEl.innerText = hearts;
        }
    }
updatePuzzleUI(state, puzzleData) {
        const controls = document.getElementById('puzzleControls');
        const active = document.getElementById('puzzleActive');
        const status = document.getElementById('puzzleStatus');
        const nextBtn = document.getElementById('nextPuzzleBtn');
        const solBtn = document.getElementById('showSolBtn');
        const info = document.getElementById('puzzleInfo');
        const statsBar = document.getElementById('puzzleStatsBar');

        if (state === "loading") {
            if(controls) controls.style.opacity = "0.5";
        } 
        else if (state === "controls") {
            if(controls) {
                controls.style.display = "block";
                controls.style.opacity = "1";
            }
            if(active) active.style.display = "none";
        } 
        else if (state === "active") {
            if(controls) controls.style.display = "none";
            if(active) active.style.display = "flex";
            
            if(status) {
                status.innerText = "Your Turn";
                status.style.color = "#fff";
            }

            // --- FIX: Better Spacing for ID/Rating ---
            if(info && puzzleData) {
                info.innerHTML = `
                    <span style="color:#e68f00; font-weight:bold; font-size:14px;">Rating: ${puzzleData.rating || '?'}</span>
                    <span style="color:#666; margin-left:8px; font-size:12px;">ID: ${puzzleData.id || 'Unknown'}</span>
                `;
            }

            // Mode Specific UI
            const isRush = ['3min', '5min', 'survival'].includes(window.game.puzzleMode);
            
            if (isRush) {
                if(nextBtn) nextBtn.style.display = "none"; // Auto-advance in rush
                if(solBtn) solBtn.style.display = "none";   // No cheating in rush
                if(statsBar) statsBar.style.display = "flex";
                
                // Force an immediate stats update to prevent "NaN" flash
                this.updatePuzzleStats(); 
            } else {
                if(nextBtn) nextBtn.style.display = "none"; // Hidden until solved
                if(solBtn) solBtn.style.display = "inline-block";
                if(statsBar) statsBar.style.display = "none"; 
            }
        }
    }
showPuzzleSuccess() {
        const status = document.getElementById('puzzleStatus');
        const next = document.getElementById('nextPuzzleBtn');
        
        if(status) {
            status.innerText = "Success!";
            status.style.color = "#26c2a3"; // Green
        }
        
        // Only show Next button in Training Mode (Rush auto-advances)
        const isRush = ['3min', '5min', 'survival'].includes(window.game.puzzleMode);
        if (!isRush && next) {
            next.style.display = "block";
        }
    }
showPuzzleHint() {
        if (!window.game || window.game.mode !== 'puzzle' || window.game.gameOver) return;

        // Strictly block execution in Rush Modes!
        const isRush = ['3min', '5min', 'survival'].includes(window.game.puzzleMode);
        if (isRush) {
            this.showNotification("Hints are disabled in Rush Mode!", "Not Allowed", "🚫");
            return;
        }

        const solutionMove = window.game.puzzleSolution[window.game.puzzleCursor];
        if (!solutionMove) return;

        const fromIdx = window.game.squareToIndex(solutionMove.substring(0, 2));
        const sqEl = document.querySelector(`.square[data-index="${fromIdx}"]`);
        
        if (sqEl) {
            document.querySelectorAll('.puzzle-hint-pulse').forEach(el => el.remove());

            const hintEl = document.createElement('div');
            hintEl.className = 'puzzle-hint-pulse';
            hintEl.style.position = 'absolute';
            hintEl.style.inset = '0'; 
            hintEl.style.boxShadow = 'inset 0 0 0 4px var(--gold-400, #facc15), inset 0 0 15px rgba(250, 204, 21, 0.6)'; 
            hintEl.style.borderRadius = '4px';
            hintEl.style.pointerEvents = 'none'; 
            hintEl.style.zIndex = '15';
            
            sqEl.appendChild(hintEl);
            
            hintEl.animate([
                { opacity: 1 },
                { opacity: 0.2 },
                { opacity: 1 }
            ], {
                duration: 800,
                iterations: 3
            });

            setTimeout(() => {
                if (hintEl && hintEl.parentNode) hintEl.remove();
            }, 2400);
        }
    }
initSidebarResizers() {
    const sidebar = document.getElementById('mainSidebar'); 
    const handleW = document.getElementById('resizeSidebarW');
    const handleH = document.getElementById('resizeSidebarH');
    
    if (!sidebar) return;

    // Restore saved sizes
    const savedWidth = localStorage.getItem('sidebarWidth') || '520px';
    const savedHeight = localStorage.getItem('sidebarHeight') || '800px';
    sidebar.style.width = savedWidth;
    sidebar.style.minWidth = savedWidth;
    sidebar.style.maxWidth = savedWidth;
    sidebar.style.height = savedHeight;
    sidebar.style.marginLeft = '-16px'; // Ensure gap matches

    // --- HORIZONTAL RESIZER (ONLY AFFECTS PGN BOX) ---
    if (handleW) {
        let startX, startPgnW;

        const doDragW = (moveEvent) => {
            const scaler = document.getElementById('app-scaler');
            let scale = 1;
            if (scaler) {
                const transform = window.getComputedStyle(scaler).transform;
                if (transform !== 'none') {
                    const matrix = transform.match(/^matrix\((.+)\)$/);
                    if (matrix) scale = parseFloat(matrix[1].split(',')[0]);
                }
            }

            // 🔥 THE FIX: Flipped the math! Dragging right now increases the width.
            const dx = (moveEvent.clientX - startX) / scale;
            let newPgnW = startPgnW + dx;

            // Calculate max safe width so the PGN panel doesn't overlap the board
            const screenW = 2600;
            const leftPanel = document.querySelector('.left-panel');
            const leftW = (leftPanel && leftPanel.style.display !== 'none') ? leftPanel.offsetWidth : 0;
            const boardWrapper = document.getElementById('board-wrapper');
            const boardW = boardWrapper ? boardWrapper.offsetWidth : 600;
            
            const TOTAL_FIXED_SPACE = 80 + 20 + 40 + 32 + 24 + leftW;
            const maxPgnW = screenW - boardW - TOTAL_FIXED_SPACE;

            // Apply limits
            if (newPgnW > maxPgnW) newPgnW = maxPgnW;
            if (newPgnW < 300) newPgnW = 300;
            
            // 🔥 ONLY APPLIES TO PGN PANEL 🔥
            sidebar.style.width = `${newPgnW}px`;
            sidebar.style.minWidth = `${newPgnW}px`;
            sidebar.style.maxWidth = `${newPgnW}px`;

            window.dispatchEvent(new Event('resize')); 
        };

        const stopDragW = () => {
            handleW.classList.remove('active');
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', doDragW);
            document.removeEventListener('mouseup', stopDragW);
            
            localStorage.setItem('sidebarWidth', sidebar.style.width);
        };

        handleW.addEventListener('mousedown', (e) => {
            e.preventDefault();
            handleW.classList.add('active');
            document.body.style.userSelect = 'none';
            startX = e.clientX;
            startPgnW = sidebar.offsetWidth;

            document.addEventListener('mousemove', doDragW);
            document.addEventListener('mouseup', stopDragW);
        });
    }

    // --- VERTICAL RESIZER ---
    if (handleH) {
        handleH.addEventListener('mousedown', (e) => {
            e.preventDefault();
            handleH.classList.add('active');
            document.body.style.userSelect = 'none';

            const scaler = document.getElementById('app-scaler');
            let scale = 1;
            if (scaler) {
                const transform = window.getComputedStyle(scaler).transform;
                if (transform !== 'none') {
                    const matrix = transform.match(/^matrix\((.+)\)$/);
                    if (matrix) scale = parseFloat(matrix[1].split(',')[0]);
                }
            }

            const startY = e.clientY;
            const startHeight = sidebar.offsetHeight;

            const doDragH = (moveEvent) => {
                const dy = (moveEvent.clientY - startY) / scale;
                const newHeight = Math.max(400, startHeight + dy);
                sidebar.style.height = `${newHeight}px`;
            };

            const stopDragH = () => {
                handleH.classList.remove('active');
                document.body.style.userSelect = '';
                document.removeEventListener('mousemove', doDragH);
                document.removeEventListener('mouseup', stopDragH);
                localStorage.setItem('sidebarHeight', sidebar.style.height);
            };

            document.addEventListener('mousemove', doDragH);
            document.addEventListener('mouseup', stopDragH);
        });
    }
}
initResizer() {
    const handle = document.getElementById('resizeHandle'); 
    let startX, startBoardW;

    const validateAndApplyLayout = (boardW) => {
        const leftPanel = document.querySelector('.left-panel');
        const leftW = (leftPanel && leftPanel.style.display !== 'none') ? leftPanel.offsetWidth : 0;
        
        const rightSidebar = document.getElementById('mainSidebar');
        const pgnW = rightSidebar ? rightSidebar.offsetWidth : 300;

        // 🔥 OVERRIDE CSS DEFAULTS 🔥
        // Force center alignment so flexbox pushes both sides outwards evenly
        const container = document.querySelector('.main-container');
        if (container) {
            container.style.padding = '30px 20px 20px 20px'; 
        }

        const engineReservedSpace = 32; 
        
        if (boardW < 300) boardW = 300;
        boardW = Math.floor(boardW / 8) * 8; 

        // 1. Lock Left Panel (Never resizes)
        if (leftPanel && leftPanel.style.display !== 'none') {
            leftPanel.style.width = `${leftW}px`;
            leftPanel.style.minWidth = `${leftW}px`;
            leftPanel.style.maxWidth = `${leftW}px`;
            leftPanel.style.flex = 'none';
        }

        // 2. Lock Right Panel (Never resizes)
        if (rightSidebar) {
            rightSidebar.style.width = `${pgnW}px`;
            rightSidebar.style.minWidth = `${pgnW}px`;
            rightSidebar.style.maxWidth = `${pgnW}px`;
            rightSidebar.style.flex = 'none'; 
            rightSidebar.style.marginLeft = '16px'; 
        }

        // 3. Size the Board Wrapper
        if (this.boardWrapper) {
            this.boardWrapper.style.width = `${boardW}px`;
            this.boardWrapper.style.minWidth = `${boardW}px`;
            this.boardWrapper.style.maxWidth = `${boardW}px`;
            this.boardWrapper.style.flex = 'none'; 
        }

        const rowW = boardW + engineReservedSpace;

        // 4. Size the Board Row
        const boardRow = document.querySelector('.board-container-row');
        if (boardRow) {
            boardRow.style.width = `${rowW}px`;
            boardRow.style.minWidth = `${rowW}px`;
            boardRow.style.maxWidth = `${rowW}px`;
            boardRow.style.flex = 'none';
            boardRow.style.justifyContent = 'flex-start'; 
        }

        // 🔥 5. THE TRUE SABOTEUR DEFEATED: .board-section 🔥
        // This is the actual direct child of .main-container. 
        // When this grows, Flexbox physically pushes the side panels away!
        const boardSection = document.querySelector('.board-section');
        if (boardSection) {
            boardSection.style.width = `${rowW}px`;
            boardSection.style.minWidth = `${rowW}px`;
            boardSection.style.maxWidth = `${rowW}px`;
            boardSection.style.flex = 'none';
        }

        // 6. Keep Top/Bottom headers aligned with the new board width
        const bottomBar = document.querySelector('.bottom-bar');
        if (bottomBar) bottomBar.style.width = `${rowW}px`;
        
        const boardHeader = document.querySelector('.board-header-container');
        if (boardHeader) boardHeader.style.width = `${rowW}px`;
        const commentaryBox = document.getElementById('commentaryBox');
        if (commentaryBox) commentaryBox.style.width = `${rowW}px`;
    };

    const doResize = (e) => {
        const scaler = document.getElementById('app-scaler');
        let scale = 1;
        if (scaler) {
            const transform = window.getComputedStyle(scaler).transform;
            if (transform !== 'none') {
                const matrix = transform.match(/^matrix\((.+)\)$/);
                if (matrix) scale = parseFloat(matrix[1].split(',')[0]);
            }
        }

        const dx = (e.clientX - startX) / scale;
        
        // SYMMETRIC MULTIPLIER: Grow 2x to push both sides evenly while tracking the mouse
        let newBoardW = startBoardW + (dx * 2);

        validateAndApplyLayout(newBoardW);
        window.dispatchEvent(new Event('resize')); 
    };
    
    const stopResize = () => {
        document.removeEventListener('mousemove', doResize);
        document.removeEventListener('mouseup', stopResize);
        document.body.style.cursor = ''; 
        if (this.boardWrapper) localStorage.setItem('chessBoardSize', this.boardWrapper.style.width);
    };
    
    if (handle) {
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startX = e.clientX;
            startBoardW = this.boardWrapper.offsetWidth;
            document.body.style.cursor = 'ew-resize'; 
            document.addEventListener('mousemove', doResize);
            document.addEventListener('mouseup', stopResize);
        });
    }

    setTimeout(() => {
        const savedBoard = localStorage.getItem('chessBoardSize') ? parseInt(localStorage.getItem('chessBoardSize')) : 600;
        validateAndApplyLayout(savedBoard);
        window.dispatchEvent(new Event('resize'));
    }, 50);
}
getSquareFromCoords(x, y) {
const rect = this.boardEl.getBoundingClientRect();
if (x <rect.left || x> rect.right || y <rect.top || y> rect.bottom)
return -1;
const size = rect.width / 8;
let c = Math.floor((x - rect.left) / size);
let r = Math.floor((y - rect.top) / size);
if (this.flipped) {
c = 7 - c;
r = 7 - r;
}
return r * 8 + c;
}
promoteVar() {
        if (this.contextNode) {
            window.game.promoteVariation(this.contextNode);
            this.renderBoard(true);
            window.game.syncMoveHistory();
            if (window.game.updateStockfish) window.game.updateStockfish();
        }
        if (this.annotationPopup) this.annotationPopup.style.display = 'none';
    }
makeMainline() {
        if (this.contextNode) {
            window.game.makeMainline(this.contextNode);
            window.game.syncMoveHistory();
            this.renderBoard(true);
            if (window.game.updateStockfish) window.game.updateStockfish();
        }
        if (this.annotationPopup) this.annotationPopup.style.display ='none';
    }
handleMouseDown(e) {
    if (window.game.isPaused) {
            this.showNotification("Game is Paused", "Info");
            return;
        }
        if (e.button === 2) { // Right Click (Draw Arrows)
            e.preventDefault();
            e.stopPropagation();
            // Prevent drawing if mid-premove
            if (window.game.premoveQueue.length > 0) {
                window.game.clearPremoves();
                this.renderBoard(false); 
                return;
            }
    
            const sq = this.getSquareFromCoords(e.clientX, e.clientY);
            if (sq !== -1) {
                this.isRightClick = true;
                this.arrowDragStart = sq;
            }
        } 
        else if (e.button === 0) { // Left Click (Selection)
            // Clear arrows if needed
            if (window.game.currentNode) {
                window.game.currentNode.arrows = []; 
                window.game.currentNode.circles = [];
                this.renderArrows();
            }
            
            // Clear Premoves
            if (window.game.premoveQueue.length > 0) {
                window.game.clearPremoves();
                this.renderBoard(false); 
            }

            // --- FIX: DESELECT ON EMPTY CLICK ---
            // If we click the board background (not a piece), clear the selection/hints.
            if (this.selectedSq !== null) {
                this.selectedSq = null;
                this.legalMoves = [];
                this.renderBoard(false); // Re-render to remove dots/highlights
            }
        }
    }
handleMouseMove(e) {
    if (this.isRightClick && this.arrowDragStart !== null) {
        const sq = this.getSquareFromCoords(e.clientX, e.clientY);
        this.tempArrowLayer.innerHTML = ''; // Clear temp layer only
        
        if (sq !== -1 && sq !== this.arrowDragStart) {
            let color = 'green';
            if (e.shiftKey) color = 'red';
            else if (e.altKey) color = 'blue';
            else if (e.ctrlKey) color = 'orange';
            
            // Draw a faint "preview" arrow
            this.drawArrow(this.tempArrowLayer, this.arrowDragStart, sq, color, 0.5);
        }
    }
}
handleMouseUp(e) {
    if (this.isRightClick && this.arrowDragStart !== null) {
        const sq = this.getSquareFromCoords(e.clientX, e.clientY);
        this.tempArrowLayer.innerHTML = ''; // Clear preview
        
        // Determine Color
        let color = 'green';
        if (e.shiftKey) color = 'red';
        else if (e.altKey) color = 'blue';
        else if (e.ctrlKey) color = 'orange';

        // Ensure array exists on the Node
        if (!window.game.currentNode.arrows) window.game.currentNode.arrows = [];
        if (!window.game.currentNode.circles) window.game.currentNode.circles = [];

        if (sq === this.arrowDragStart) {
            // --- CIRCLE TOGGLE ---
            const circles = window.game.currentNode.circles;
            const idx = circles.findIndex(c => c.index === sq);
            
            if (idx >= 0) {
                // If exists: Remove if same color, or update color
                if (circles[idx].color === color) circles.splice(idx, 1);
                else circles[idx].color = color;
            } else {
                circles.push({ index: sq, color });
            }
        } 
        else if (sq !== -1) {
            // --- ARROW TOGGLE ---
            const arrows = window.game.currentNode.arrows;
            // Check for existing arrow (Direction sensitive: from->to)
            const idx = arrows.findIndex(a => a.from === this.arrowDragStart && a.to === sq);
            
            if (idx >= 0) {
                // If exists: Remove if same color, or update color
                if (arrows[idx].color === color) arrows.splice(idx, 1);
                else arrows[idx].color = color;
            } else {
                arrows.push({ from: this.arrowDragStart, to: sq, color });
            }
        }

        // Finalize
        this.renderArrows();
        this.isRightClick = false;
        this.arrowDragStart = null;
    }
}
renderArrows() {
    // 1. Clear Permanent Layer
    this.arrowLayer.innerHTML = '';
    
    // 2. Get Data from Current Node
    const node = window.game.currentNode;
    if (!node) return;

    // 3. Draw Circles
    if (node.circles && Array.isArray(node.circles)) {
        node.circles.forEach(c => {
            this.drawCircle(this.arrowLayer, c.index, c.color);
        });
    }

    // 4. Draw Arrows
    if (node.arrows && Array.isArray(node.arrows)) {
        node.arrows.forEach(a => {
            this.drawArrow(this.arrowLayer, a.from, a.to, a.color);
        });
    }
}
getNodeVisuals(node) {
if ((node.arrows &&node.arrows.length > 0) || (node.circles &&node.circles.length > 0)) {
// BLUE DOT with corrected alignment
return `<span style="display:inline-block;width:6px;height:6px;background-color:#00b023;border-radius:50%;margin-left:3px;margin-bottom:3px;vertical-align:middle;box-shadow:0 0 4px #00b023;"title="Has Annotations"></span>`;
}
return'';
}
initSoundSettings() {
    const select = document.getElementById('soundSetSelect');
    
    // Safety check
    if (!select || typeof SOUND_SETS === 'undefined') {
        console.warn("Sound settings not ready yet.");
        return;
    }

    // 1. Clear existing options
    select.innerHTML = '';

    // 2. Get all available themes from sound.js
    const themes = Object.keys(SOUND_SETS).sort();

    // 3. Create dropdown options
    themes.forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        
        // Format name: "instrument_celesta" -> "Instrument Celesta"
        let displayName = key.replace(/_/g, ' ');
        displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
        
        option.text = displayName;
        select.appendChild(option);
    });

    // 4. Set current value
    if (typeof SoundManager !== 'undefined') {
        select.value = SoundManager.currentSet;
    }

    // 5. Add Change Listener
    select.onchange = function(e) {
        if (typeof SoundManager !== 'undefined') {
            SoundManager.setTheme(e.target.value);
        }
    };
}
initVolume() {
    // 1. Load saved volume or default to 70
    const savedVol = localStorage.getItem('chessVolume');
    const vol = savedVol !== null ? parseInt(savedVol) : 70;
    
    // 2. Set internal state
    this.volume = vol / 100; // 0.0 to 1.0
    
    // 3. Update DOM elements
    const slider = document.getElementById('masterVolume');
    const label = document.getElementById('volumeValue');
    
    if (slider) slider.value = vol;
    if (label) label.innerText = vol + '%';
}
updateVolume(val) {
        const label = document.getElementById('volumeValue');
        if (label) label.innerText = val + '%';
        this.volume = parseInt(val) / 100;
        localStorage.setItem('chessVolume', val);
        if (window.game && !window.game.isPlayingLiveGame) SoundManager.play('move', this.volume);
    }
initDraggableSettings() {
        const panel = document.getElementById('settingsPanel');
        if (!panel) return;
        
        const header = panel.querySelector('.settings-header');
        if (!header) return;

        // --- FIX: Force Panel to Top-Left (Overrides CSS Centering) ---
        panel.style.top = '60px'; 
        panel.style.left = '20px';
        panel.style.transform = 'none'; // CRITICAL: Disables "translate(-50%, -50%)"
        panel.style.right = 'auto';     // Clear standard CSS constraints
        panel.style.bottom = 'auto';
        // -------------------------------------------------------------

        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;

        // 🔥 Helper to get the exact zoom level of the app
        const getScale = () => {
            const scaler = document.getElementById('app-scaler');
            let scale = 1;
            if (scaler) {
                const transform = window.getComputedStyle(scaler).transform;
                if (transform !== 'none') {
                    const matrix = transform.match(/^matrix\((.+)\)$/);
                    if (matrix) scale = parseFloat(matrix[1].split(',')[0]);
                }
            }
            return scale;
        };

        header.addEventListener("mousedown", dragStart);
        document.addEventListener("mouseup", dragEnd);
        document.addEventListener("mousemove", drag);
        
        function dragStart(e) {
            const scale = getScale();
            // Divide raw mouse coordinates by scale so they match the local container
            initialX = (e.clientX / scale) - xOffset;
            initialY = (e.clientY / scale) - yOffset;
            
            if (e.target === header || header.contains(e.target)) {
                if (e.target.classList.contains('close-settings')) return;
                isDragging = true;
            }
        }

        function dragEnd(e) {
            initialX = currentX;
            initialY = currentY;
            isDragging = false;
        }

        function drag(e) {
            if (isDragging) {
                e.preventDefault();
                const scale = getScale();
                
                // Calculate movement strictly within the scaled coordinate space
                currentX = (e.clientX / scale) - initialX;
                currentY = (e.clientY / scale) - initialY;
                xOffset = currentX;
                yOffset = currentY;
                
                setTranslate(currentX, currentY, panel);
            }
        }

        function setTranslate(xPos, yPos, el) {
            el.style.transform = "translate3d(" + xPos + "px, " + yPos + "px, 0)";
        }
    }
drawArrow(container, fromIdx, toIdx, colorName, opacity=0.5) { // Lichess opacity is lower (~0.5)
    // Lichess standard colors
    const cMap = {
        'green': '#15781B',
        'red': '#882020',
        'blue': '#003088',
        'orange': '#e68f00'
    };
    const color = cMap[colorName] || colorName;

    // 1. Grid Coordinates
    const fR = Math.floor(fromIdx / 8), fC = fromIdx % 8;
    const tR = Math.floor(toIdx / 8), tC = toIdx % 8;

    // SVG Coordinates (12.5 units per square)
    // EXACT Center-to-Center (No margins)
    let x1 = (fC + 0.5) * 12.5, y1 = (fR + 0.5) * 12.5;
    let x2 = (tC + 0.5) * 12.5, y2 = (tR + 0.5) * 12.5;

    // Handle Board Flip
    if (this.flipped) {
        x1 = ((7 - fC) + 0.5) * 12.5; y1 = ((7 - fR) + 0.5) * 12.5;
        x2 = ((7 - tC) + 0.5) * 12.5; y2 = ((7 - tR) + 0.5) * 12.5;
    }

    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len === 0) return;

    // --- EXACT LICHESS DIMENSIONS (Calibrated) ---
    // Shaft: ~14-15% of square (1.75) - Thin enough to be elegant
    // Head Width: ~45% of square (5.625) - Wide and distinct
    // Head Length: ~36% of square (4.5) - Sharp point
    const headLength = 4.5;  
    const headWidth = 5.625; 
    const shaftWidth = 1.75; 

    // Lichess arrows start and end EXACTLY at the center
    const startMargin = 0.0; 
    const endMargin = 0.0;

    // 2. Vector Math
    const ux = dx / len;
    const uy = dy / len;
    const vx = -uy;
    const vy = ux;

    // 3. Calculate 7 Points of the Polygon
    const startX = x1 + ux * startMargin;
    const startY = y1 + uy * startMargin;
    const endX = x2 - ux * endMargin;
    const endY = y2 - uy * endMargin;
    
    // Shaft Length (stops where the head starts)
    const shaftLen = (len - startMargin - endMargin) - headLength;

    // P1: Shaft Base Left
    const p1x = startX + vx * (shaftWidth / 2);
    const p1y = startY + vy * (shaftWidth / 2);

    // P2: Shaft Top Left
    const p2x = startX + ux * shaftLen + vx * (shaftWidth / 2);
    const p2y = startY + uy * shaftLen + vy * (shaftWidth / 2);

    // P3: Head Base Left (Wide Flare)
    const p3x = startX + ux * shaftLen + vx * (headWidth / 2);
    const p3y = startY + uy * shaftLen + vy * (headWidth / 2);

    // P4: Tip
    const p4x = endX;
    const p4y = endY;

    // P5: Head Base Right (Wide Flare)
    const p5x = startX + ux * shaftLen - vx * (headWidth / 2);
    const p5y = startY + uy * shaftLen - vy * (headWidth / 2);

    // P6: Shaft Top Right
    const p6x = startX + ux * shaftLen - vx * (shaftWidth / 2);
    const p6y = startY + uy * shaftLen - vy * (shaftWidth / 2);

    // P7: Shaft Base Right
    const p7x = startX - vx * (shaftWidth / 2);
    const p7y = startY - vy * (shaftWidth / 2);

    // 4. Render
    const d = `M ${p1x} ${p1y} L ${p2x} ${p2y} L ${p3x} ${p3y} L ${p4x} ${p4y} L ${p5x} ${p5y} L ${p6x} ${p6y} L ${p7x} ${p7y} Z`;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', color);
    path.setAttribute('opacity', opacity);
    path.setAttribute('stroke', 'none');

    container.appendChild(path);
}
drawCircle(container, idx, colorName) {
const cMap = {
'green':'#15781B',
'red':'#882020',
'blue':'#003088',
'orange':'#e68f00'
};
const color = cMap[colorName] || colorName;
const r = Math.floor(idx / 8)
, c = idx % 8;
let cx = (c + 0.5) * 12.5;
let cy = (r + 0.5) * 12.5;
if (this.flipped) {
cx = ((7 - c) + 0.5) * 12.5;
cy = ((7 - r) + 0.5) * 12.5;
}
const circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
circle.setAttribute('cx', cx);
circle.setAttribute('cy', cy);
circle.setAttribute('r','5.5');
circle.setAttribute('stroke', color);
circle.setAttribute('stroke-width','0.5');
circle.setAttribute('fill','none');
circle.setAttribute('opacity','0.8');
container.appendChild(circle);
}
initKeyboardEvents() {
        document.addEventListener('keydown', (e) => {
            // 1. Ignore PGN controls if typing in a text box
            const activeTag = document.activeElement.tagName.toLowerCase();
            if (['input', 'textarea', 'select'].includes(activeTag)) {
                return;
            }

            // 2. FIX: Block PGN controls if Settings Panel is open
            // This allows the Arrow Keys to scroll the settings div instead of changing moves
            const settings = document.getElementById('settingsPanel');
            if (settings && settings.classList.contains('visible')) {
                if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                    return; // Stop here, do not trigger game navigation
                }
            }

            // 3. PGN Navigation
            if (e.key === 'ArrowLeft') {
                window.game.stepBack();
            } else if (e.key === 'ArrowRight') {
                window.game.stepForward();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                window.game.goToStart();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                window.game.goToEnd();
            }
        });
    }
toggleSettings() {
document.getElementById('settingsPanel').classList.toggle('visible');
}
switchTab(tabName) {
        if (!tabName) return;
        // 🔥 THE FIX: Show Resign/Draw ONLY in the Play tab during an active game!
        const resignBtn = document.getElementById('resignBtn');
        const drawBtn = document.getElementById('drawBtn');
        if (resignBtn && drawBtn) {
            const isLive = window.game && window.game.isPlayingLiveGame;
            
            // ❌ THIS WAS THE BUG: Changed 'tabId' to 'tabName'
            const isPlayTab = tabName.toLowerCase() === 'play'; 
            
            resignBtn.style.display = (isLive && isPlayTab) ? 'block' : 'none';
            drawBtn.style.display = (isLive && isPlayTab) ? 'block' : 'none';
        }
        const lowerTab = tabName.toLowerCase();
        document.querySelectorAll('.puzzle-hint-pulse, .hint-dot, .hint-circle').forEach(el => el.remove());
        
        // =========================================================
        // LEAVING EDITOR
        // =========================================================
        if (window.game && window.game.mode === 'editor' && lowerTab !== 'editor') {
            const fenInput = document.getElementById('fenInput');
            const currentFen = fenInput ? fenInput.value : (typeof window.game.generateFEN === 'function' ? window.game.generateFEN() : window.game.engine.fen());
            
            let isValid = false;
            let errorMsg = "Invalid board position.";
            
            if (typeof window.game.engine.validate_fen === 'function') {
                const validation = window.game.engine.validate_fen(currentFen);
                isValid = validation.valid;
                if (!isValid) errorMsg = validation.error;
            } else {
                try {
                    const tempEngine = new Chess();
                    isValid = tempEngine.load(currentFen);
                } catch (e) { isValid = false; }
            }
            
            if (!isValid) {
                if (typeof this.showNotification === 'function') this.showNotification("Invalid Board", `Cannot leave Editor: ${errorMsg}`, "⚠️");
                return;
            }
            
            // Extract ONLY the board pieces, active color, and castling
            const coreEnter = this.originalEditorFen ? this.originalEditorFen.split(' ').slice(0,3).join(' ') : "";
            const coreExit = currentFen.split(' ').slice(0,3).join(' ');
            console.log(coreEnter);console.log(coreExit);
            if (coreEnter && coreExit !== coreEnter) {
                window.game.loadFEN(currentFen);
                this._lastTreeSize = -1; // Force full UI redraw
            } else {
                // 🔥 THE FIX: Board didn't change! 
                // Pass the silently saved PGN directly into your massive custom loadPGN function.
                if (this.originalEditorPgn && typeof window.game.loadPGN === 'function') {
                    window.ui.loadPgnAndAnalyze();
                }
            }
        }

        this.selectedSq = null;
        this.legalMoves = [];
        
        const tempArrows = document.getElementById('tempArrowRoot');
        if (tempArrows) tempArrows.innerHTML = '';
        const arrowsRoots = document.getElementById('arrowsRoot');
        if (arrowsRoots) arrowsRoots.innerHTML = ''; 

        document.querySelectorAll('.square, .piece-img').forEach(el => {
            el.classList.remove('selected', 'highlight', 'active', 'valid-move', 'selected-w', 'selected-b', 'border-w', 'border-b', 'last-move', 'highlight-w', 'highlight-b');
            el.style.backgroundColor = ''; el.style.boxShadow = ''; el.style.opacity = ''; el.style.filter = ''; el.style.border = ''; 
        });
        if (typeof this.updateTheme === 'function') this.updateTheme();
        
        if (lowerTab === 'editor') {
            const toggle = document.getElementById('editor960Toggle');
            if (toggle && window.game) toggle.checked = window.game.isChess960;
        }

        if (window.game) {
            const currentTab = window.game.mode;

            if (['analysis', 'local', 'bot', 'study'].includes(currentTab)) {
                if (typeof window.game.saveState === 'function') window.game.saveState(currentTab);
            } else if (currentTab === 'puzzle') {
                if (typeof window.game.saveState === 'function') window.game.saveState('puzzle');
            }

            const refreshAllHeaders = () => {
                if (window.game.pgnHeaders) {
                    this.displayMetadata(window.game.pgnHeaders);
                    const wLabel = (window.game.pgnHeaders['White'] || 'White') + (window.game.pgnHeaders['WhiteElo'] ? ` (${window.game.pgnHeaders['WhiteElo']})` : '');
                    const bLabel = (window.game.pgnHeaders['Black'] || 'Black') + (window.game.pgnHeaders['BlackElo'] ? ` (${window.game.pgnHeaders['BlackElo']})` : '');
                    if (typeof this.updatePgnAvatars === 'function') this.updatePgnAvatars(window.game.pgnHeaders['White'], window.game.pgnHeaders['Black'], window.game.isEngineMatch, true);
                    if (typeof this.updatePlayerNames === 'function') {
                        if (this.flipped) this.updatePlayerNames(wLabel, bLabel);
                        else this.updatePlayerNames(bLabel, wLabel);
                    }
                    if (typeof this.renderHeaders === 'function') this.renderHeaders();
                    if (typeof this.updateClocks === 'function') this.updateClocks();
                }
            };

            if (lowerTab === 'study') {
                window.game.mode = 'study';
                window.game.gameOver = true;
                if (typeof window.game.restoreState === 'function' && window.game.restoreState('study')) {
                    if (typeof window.game.syncMoveHistory === 'function') window.game.syncMoveHistory();
                    this.updateHistory(true); refreshAllHeaders(); this.renderBoard(false);
                    const engineLinesBox = document.getElementById('engine-lines-box');
                    if (engineLinesBox) engineLinesBox.innerHTML = '';
                    if (typeof this.renderCharts === 'function') { this._lastChartedFen = null; requestAnimationFrame(() => this.renderCharts(true)); }
                    if (window.engineAnalysing && window.game.updateStockfish) window.game.updateStockfish();
                }
            }
           // =========================================================
            // ENTERING EDITOR
            // =========================================================
            else if (lowerTab === 'editor') {
                window.game.mode = 'editor';
                window.game.gameOver = true; 
                
                if (this.annotationPopup) this.annotationPopup.style.display = 'none';
                if (window.engineAnalysing && typeof this.toggleEngine === 'function') this.toggleEngine(true);
                if (window.game.stopEngine) window.game.stopEngine();
                if (window.sfWorker) window.sfWorker.postMessage('stop');
                if (this.clearArrows) this.clearArrows(); 

                let currentFen = window.game.engine.fen();
                this.originalEditorFen = currentFen; 
                
                // 🔥 THE FIX: Use the CORRECT IDs from your HTML!
                const fenParts = currentFen.split(' ');
                if (fenParts.length >= 3) {
                    const c = fenParts[2];
                    window.game.castling = { wK: c.includes('K'), wQ: c.includes('Q'), bK: c.includes('k'), bQ: c.includes('q') };
                    window.game.turn = fenParts[1];
                    
                    const chkWK = document.getElementById('castling-wK');
                    const chkWQ = document.getElementById('castling-wQ');
                    const chkBK = document.getElementById('castling-bK');
                    const chkBQ = document.getElementById('castling-bQ');
                    const turnEl = document.getElementById('editorTurn');

                    if (chkWK) chkWK.checked = c.includes('K');
                    if (chkWQ) chkWQ.checked = c.includes('Q');
                    if (chkBK) chkBK.checked = c.includes('k');
                    if (chkBQ) chkBQ.checked = c.includes('q');
                    if (turnEl) turnEl.value = fenParts[1];
                }

                this._lastMetadataCache = null; this._lastHeadersCache = null;
                this._lastNagCache = null; this._lastFen = null; this._lastBoardFen = null;

                if (typeof this.renderBoard === 'function') this.renderBoard(true);
                
                if (document.getElementById('editorHalfMove')) document.getElementById('editorHalfMove').value = fenParts[4] || "0";
                if (document.getElementById('editorFullMove')) document.getElementById('editorFullMove').value = fenParts[5] || "1";
                if (document.getElementById('fenInput')) document.getElementById('fenInput').value = currentFen;
                this.resizeApp();
            }
            // =========================================================
            // ENTERING ANALYSIS
            // =========================================================
            else if (lowerTab === 'analysis') {
                if (window.game && window.game.isPlayingLiveGame) {
                    // 🔥 THE FIX: Coming directly from an active live game? Keep the PGN intact!
                    window.game.gameOver = false; 
                    if (window.game.timerInterval) clearInterval(window.game.timerInterval); 
                    if (!window.game.pgnHeaders['Result']) window.game.pgnHeaders['Result'] = '*';
                    if (typeof this.toggleReviewButton === 'function') this.toggleReviewButton(true);
                    
                    window.game.mode = 'analysis';
                } else {
                    // 🔥 THE FIX: Normal tab switch? Safely restore the saved Analysis state!
                    window.game.mode = 'analysis';
                    window.game.gameOver = true; 
                    
                    if (typeof window.game.restoreState === 'function') {
                        window.game.restoreState('analysis');
                    }
                }
                
                if (typeof window.game.syncMoveHistory === 'function') window.game.syncMoveHistory();
                this.updateHistory(true);
                refreshAllHeaders();
                this.renderBoard(false);
                
                const engineLinesBox = document.getElementById('engine-lines-box');
                if (engineLinesBox) engineLinesBox.innerHTML = '';
                if (typeof this.renderCharts === 'function') {
                    this._lastChartedFen = null; 
                    requestAnimationFrame(() => this.renderCharts(true));
                }
                if (window.engineAnalysing && window.game.updateStockfish) window.game.updateStockfish();
                
                this.resizeApp();
            }
            else if (lowerTab === 'puzzles') {
                window.game.mode = 'puzzle'; 
                window.game.gameOver = true; 
                if (window.engineAnalysing && typeof this.toggleEngine === 'function') this.toggleEngine(true);
                if (window.game.stopEngine) window.game.stopEngine();
                if (window.sfWorker) window.sfWorker.postMessage('stop');
                if (this.clearArrows) this.clearArrows();
                
                if (typeof window.game.restoreState === 'function' && window.game.restoreState('puzzle')) {
                    if (typeof window.game.syncMoveHistory === 'function') window.game.syncMoveHistory();
                    this.updateHistory(true); refreshAllHeaders(); this.renderBoard(false);
                }
            } 
            else if (lowerTab === 'play') {
                if (window.engineAnalysing && typeof this.toggleEngine === 'function') this.toggleEngine(true);
                refreshAllHeaders(); 
            }
        }

        const analysisPanel = document.getElementById('analysisPanel');
        const studySidebar = document.getElementById('study-sidebar'); 
        const mainContainer = document.querySelector('.main-container'); 

        if (lowerTab === 'analysis') {
            if (analysisPanel) analysisPanel.style.display = 'flex'; 
            if (studySidebar) studySidebar.style.display = 'none'; 
            if (mainContainer) mainContainer.style.justifyContent = 'flex-start';
        } 
        else if (lowerTab === 'study') {
            if (analysisPanel) analysisPanel.style.display = 'none'; 
            if (studySidebar) studySidebar.style.display = 'flex';   
            if (mainContainer) mainContainer.style.justifyContent = 'flex-start';
            if (typeof this.renderChapters === 'function') this.renderChapters();
        } 
        else {
            if (analysisPanel) analysisPanel.style.display = 'none'; 
            if (studySidebar) studySidebar.style.display = 'none'; 
            if (mainContainer) mainContainer.style.justifyContent = 'center';
            if (window.game && typeof window.game.saveActiveChapter === 'function') window.game.saveActiveChapter(); 
        }

        let targetId = '';
        if (lowerTab === 'analysis' || lowerTab === 'play' || lowerTab === 'study') targetId = 'tabContent-Play'; 
        else if (lowerTab === 'puzzles') targetId = 'tabContent-Puzzles';
        else if (lowerTab === 'editor') targetId = 'tabContent-Editor';

        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        const targetTab = document.getElementById(targetId);
        if (targetTab) targetTab.classList.add('active');

        document.querySelectorAll('.menu-nav-btn').forEach(btn => {
            btn.classList.remove('active'); btn.style.background = 'transparent'; btn.style.color = '#ccc';
        });
        const activeBtn = document.getElementById('menuBtn-' + lowerTab);
        if (activeBtn) {
            activeBtn.classList.add('active'); activeBtn.style.background = '#2872b5'; activeBtn.style.color = '#fff';
        }

        if (lowerTab === 'editor') {
            document.body.classList.add('show-editor');
            if (typeof this.updateEditorState === 'function') this.updateEditorState();
        } else {
            document.body.classList.remove('show-editor');
        }
        
        if (typeof this.toggleSideMenu === 'function') this.toggleSideMenu(false);

        const isEditor = (lowerTab === 'editor');
        const isPuzzle = (lowerTab === 'puzzles');
        
        document.querySelectorAll('.player-header').forEach(el => el.style.display = (isEditor || isPuzzle) ? 'none' : ''); 
        
        const commentaryBox = document.getElementById('commentaryBox');
        if (commentaryBox) commentaryBox.style.display = (isEditor || isPuzzle) ? 'none' : '';
        
        const engineBtn = document.querySelector('.engine-toggle-btn');
        if (engineBtn) {
            engineBtn.style.display = isEditor ? 'none' : '';
            if (isPuzzle && window.game && !window.game.gameOver && window.game.puzzleActive) {
                engineBtn.style.opacity = '0.5'; engineBtn.style.cursor = 'not-allowed';
            } else {
                engineBtn.style.opacity = '1'; engineBtn.style.cursor = 'pointer';
            }
        }

        const enginePanel = document.getElementById('enginePanel');
        if (enginePanel) enginePanel.style.display = isEditor ? 'none' : '';

        setTimeout(() => {
            if (typeof this.resizeApp === 'function') this.resizeApp();
            if (typeof this.safeResizeCharts === 'function') this.safeResizeCharts();
        }, 10);
    
    }
toggleEditorMode(active) {
        try {
            if (!window.game) return;

            if (!window.game.isPlayingLiveGame) {
                window.game.mode = active ? 'editor' : 'analysis';
            }
            
            this.selectedSq = null;
            this.legalMoves = [];

            const barTop = document.getElementById('editorBarTop');
            const barBot = document.getElementById('editorBarBottom');

            if (active) {
                document.body.classList.add('show-editor');
                if (barTop) barTop.style.display = 'flex';
                if (barBot) barBot.style.display = 'flex';
                
                window.game.gameOver = true;
                clearInterval(window.game.timerInterval);
                
                if (window.sfWorker) {
                    window.engineAnalysing = false;
                    window.sfWorker.postMessage('stop');
                }
                if (typeof this.updateEditorInputs === 'function') this.updateEditorInputs();
            } else {
                document.body.classList.remove('show-editor');
                if (barTop) barTop.style.display = 'none';
                if (barBot) barBot.style.display = 'none';
                
                if (!window.game.isPlayingLiveGame && window.game.mode !== 'puzzle') {
                    window.game.gameOver = false;
                }
            }
            
            if (typeof this.renderBoard === 'function') this.renderBoard(false);
        } catch (err) {
            console.error("[UI] Error in toggleEditorMode:", err);
        }
    }
initEditorBars() {
        const trashIcon = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
        
        // Helper function mirroring your startSpareDrag logic
        const getSafeImgHtml = (color, type) => {
            let rawSVG = this.getPieceHTML({ color, type });
            if (!rawSVG) return '';
            
            let trimmed = rawSVG.trim();
            if (trimmed.startsWith('<svg')) {
                return `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}" class="piece-img" style="width:100%; height:100%; display:block; pointer-events:none;" draggable="false">`;
            } else if (trimmed.startsWith('data:image/') || trimmed.startsWith('http') || trimmed.endsWith('.svg') || trimmed.endsWith('.png')) {
                return `<img src="${trimmed}" class="piece-img" style="width:100%; height:100%; display:block; pointer-events:none;" draggable="false">`;
            }
            return rawSVG; // Fallback for custom piece sets already returning an <img>
        };

        const topBar = document.getElementById('editorBarTop');
        if (topBar) {
            topBar.innerHTML = `<div class="tool-group">
                ${['P','N','B','R','Q','K'].map(p => `
                    <div class="tool-btn" onmousedown="window.ui.startSpareDrag(event,'b','${p}')">
                        ${getSafeImgHtml('b', p)}
                    </div>`).join('')}
            </div><div class="tool-btn trash-btn" onclick="window.ui.setEditorTool('trash', this)">${trashIcon}</div>`;
        }

        const bottomBar = document.getElementById('editorBarBottom');
        if (bottomBar) {
            bottomBar.innerHTML = `<div class="tool-group">
                ${['P','N','B','R','Q','K'].map(p => `
                    <div class="tool-btn" onmousedown="window.ui.startSpareDrag(event,'w','${p}')">
                        ${getSafeImgHtml('w', p)}
                    </div>`).join('')}
            </div><div class="tool-btn trash-btn" onclick="window.ui.setEditorTool('trash', this)">${trashIcon}</div>`;
        }
    }
setEditorTool(tool, btn) {
if (tool ==='trash'&&this.editorTool ==='trash') {
this.editorTool ='cursor';
btn.classList.remove('active');
} else {
this.editorTool = tool;
document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
if (btn) btn.classList.add('active');
}
}
resolveCastlingIntent(fromIdx, toIdx) {
        const p = window.game.board[fromIdx];
        const t = window.game.board[toIdx];
        
        // Is it a King dropping onto a friendly Rook?
        if (p && p.type.toLowerCase() === 'k' && t && t.type.toLowerCase() === 'r' && p.color === t.color) {
            const fromFile = fromIdx % 8;
            const toFile = toIdx % 8;
            
            // Find the correct castling SAN in the legal moves list
            return this.legalMoves.find(m => {
                if (toFile > fromFile) return m.san.startsWith('O-O') && !m.san.startsWith('O-O-O'); // Kingside
                return m.san.startsWith('O-O-O'); // Queenside
            });
        }
        return null;
    }
initGlobalDragEvents() {
document.addEventListener('mousemove', (e) => {
if (this.dragData)
this.updateGhostPosition(e);
}
);
document.addEventListener('mouseup', (e) => {
if (this.dragData)
this.finishDrag(e);
}
);
}
startSpareDrag(e, color, type) {
        e.preventDefault(); e.stopPropagation();
        if (window.game.isEditing) {
            this.selectedSq = null;
            this.legalMoves = [];
            this.renderBoard(false); 
        }
        this.dragData = { isSpare: true, piece: { color, type } };
        
        // 🔥 SMART IMAGE RENDERING FOR GHOST 🔥
        let rawSVG = this.getPieceHTML({ color, type });
        let ghostHTML = rawSVG;
        if (rawSVG) {
            let trimmed = rawSVG.trim();
            if (trimmed.startsWith('<svg')) {
                 ghostHTML = `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}" style="width:100%; height:100%; display:block; pointer-events:none;">`;
            } else if (trimmed.startsWith('data:image/') || trimmed.startsWith('http') || trimmed.endsWith('.svg') || trimmed.endsWith('.png')) {
                 ghostHTML = `<img src="${trimmed}" style="width:100%; height:100%; display:block; pointer-events:none;">`;
            }
        }
        this.initDragGhost(e, ghostHTML);
    }
startDrag(e, idx, piece) {
        if (window.game.isEditing && this.editorTool === 'trash') {
            e.preventDefault(); e.stopPropagation();
            window.game.board[idx] = null;
            if (typeof window.game.syncEngineToBoard === 'function') window.game.syncEngineToBoard();
            if (typeof window.game.generateFEN === 'function') {
                const newFen = window.game.generateFEN();
                const fenInput = document.getElementById('fenInput');
                if (fenInput) fenInput.value = newFen;
                if (window.game.currentNode) window.game.currentNode.fen = newFen;
                if (window.game.updateStockfish) window.game.updateStockfish();
            }
            this.renderBoard(false);
            return; 
        }

        if (!window.game.isEditing) {
            // Bot Guard
            if (window.game.isPlayingLiveGame && window.game.mode === 'bot' && piece.color === window.game.botColor) {
                if ((this.moveInputMode === 'click' || this.moveInputMode === 'both') && this.selectedSq !== null) { } 
                else return;
            }
            // 🔥 THE FIX: Turn Guard
            if (window.game.turn !== piece.color) {
                if ((this.moveInputMode === 'click' || this.moveInputMode === 'both') && this.selectedSq !== null) { 
                    // Allowed to pass through because it might be a click-capture
                } 
                else if (window.game.isAnalysisMode || window.game.premoveMode === 'none') {
                    // BLOCKS dragging opponent pieces entirely in analysis mode!
                    return; 
                }
            }
        }

        if (this.moveInputMode === 'click' || this.moveInputMode === 'both') {
            if (this.selectedSq !== null) {
                let move = this.legalMoves.find(m => m.to === idx);
                
                // 🔥 CLICK-TO-CASTLE REDIRECT 🔥
                if (!move) {
                    const castleMove = this.resolveCastlingIntent(this.selectedSq, idx);
                    if (castleMove) move = castleMove;
                }

                if (move) {
                    e.preventDefault(); e.stopPropagation();
                    this.executeMove(move, true); 
                    return; 
                }
            }
        }

        if (this.moveInputMode === 'click') {
            e.stopPropagation();
            if (window.game.isEditing) {
                this.selectedSq = null;
                this.legalMoves = [];
            } else {
                this.selectedSq = idx;
                if (piece.color === window.game.turn) this.legalMoves = window.game.getLegalMoves().filter(m => m.from === idx);
                else this.legalMoves = [];
            }
            this.renderBoard(false);
            return; 
        }

        e.preventDefault(); e.stopPropagation();

        if (window.game.isEditing) {
            this.selectedSq = null;
            this.legalMoves = [];
        } else {
            this.selectedSq = idx;
            if (piece.color === window.game.turn) this.legalMoves = window.game.getLegalMoves().filter(m => m.from === idx);
            else this.legalMoves = [];
        }

        this.renderBoard(false);
        this.dragData = { fromIdx: idx, piece: piece, isSpare: false };

        // 🔥 SMART IMAGE RENDERING FOR GHOST 🔥
        let rawSVG = this.getPieceHTML(piece); 
        let ghostHTML = rawSVG;
        
        // 1. Check if the user has animations enabled
        let pulseClass = (this.animationsEnabled !== false) ? " piece-heartbeat" : "";
        
        // 2. Wrap in image tag and inject the heartbeat class!
        if (rawSVG) {
            let trimmed = rawSVG.trim();
            if (trimmed.startsWith('<svg')) {
                 ghostHTML = `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}" class="piece-img${pulseClass}" style="width:100%; height:100%; display:block; pointer-events:none;">`;
            } else if (trimmed.startsWith('data:image/') || trimmed.startsWith('http') || trimmed.endsWith('.svg') || trimmed.endsWith('.png')) {
                 ghostHTML = `<img src="${trimmed}" class="piece-img${pulseClass}" style="width:100%; height:100%; display:block; pointer-events:none;">`;
            }
        }
        
        this.initDragGhost(e, ghostHTML);
        
        const sq = document.querySelector(`.piece[data-id='${piece.id}']`);
        if (sq) sq.style.opacity = '0.5';
    }
initDragGhost(e, html) {
        // Safety Check
        if (!this.dragData || !this.dragData.piece) return;

        let safeContent = html;
        if (html.trim().startsWith('<svg')) {
            const encodedSVG = encodeURIComponent(html);
            safeContent = `<img src="data:image/svg+xml;charset=utf-8,${encodedSVG}" style="width:100%; height:100%; display:block;">`;
        }

        // --- FIX: CLEAN CLASSES ---
        // Manually construct classes to ensure NO 'in-check' or 'selected' classes are present
        const p = this.dragData.piece;
        const colorClass = p.color === 'w' ? 'piece-w' : 'piece-b';
        const cleanClasses = `piece ${colorClass} ${p.type}`;

        // --- FIX: FORCE NO ANIMATION ---
        // Inline styles with !important to override any CSS animations
        this.draggedPieceGhost.innerHTML = `<div class="${cleanClasses}" style="width:100%; height:100%; transition: none !important; animation: none !important; transform: none !important;">${safeContent}</div>`;
        
        this.draggedPieceGhost.style.display = 'block';
        
        const size = this.boardEl.offsetWidth / 8;
        this.draggedPieceGhost.style.width = size + 'px';
        this.draggedPieceGhost.style.height = size + 'px';
        
        // Stop container animations
        this.draggedPieceGhost.style.transition = 'none';
        this.draggedPieceGhost.style.animation = 'none';

        this.draggedPieceGhost.className = '';
        if (p.color === 'w') {
            this.draggedPieceGhost.classList.add('ghost-w');
        } else {
            this.draggedPieceGhost.classList.add('ghost-b');
        }

        this.updateGhostPosition(e);
        document.body.classList.add('grabbing');
    }
updateGhostPosition(e) {
        if (!this.draggedPieceGhost) return;
        
        const scaler = document.getElementById('app-scaler');
        let scale = 1;
        let rect = { left: 0, top: 0 };
        
        if (scaler) {
            rect = scaler.getBoundingClientRect();
            // 🔥 THE FIX: Extract the exact rendered zoom scale directly from the browser!
            const transform = window.getComputedStyle(scaler).transform;
            if (transform !== 'none') {
                const matrix = transform.match(/^matrix\((.+)\)$/);
                if (matrix) scale = parseFloat(matrix[1].split(',')[0]);
            }
        }

        // Project the raw mouse coordinates (clientX/Y) into the scaled container
        const localX = (e.clientX - rect.left) / scale;
        const localY = (e.clientY - rect.top) / scale;

        const w = this.draggedPieceGhost.offsetWidth;
        const h = this.draggedPieceGhost.offsetHeight;

        this.draggedPieceGhost.style.left = (localX - w / 2) + 'px';
        this.draggedPieceGhost.style.top = (localY - h / 2) + 'px';
    }
finishDrag(e) {
        const rect = this.boardEl.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        let dropIdx = -1;

        if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
            const size = rect.width / 8;
            let col = Math.floor(x / size);
            let row = Math.floor(y / size);
            if (this.flipped) { col = 7 - col; row = 7 - row; }
            dropIdx = row * 8 + col;
        }

        let moveMade = false;

        if (dropIdx !== -1) {
            if (window.game.isEditing) {
                let newPiece = { ...this.dragData.piece };
                let r = Math.floor(dropIdx / 8);
                if (newPiece.type === 'P' && (r === 0 || r === 7)) newPiece.type = 'Q';
                
                window.game.board[dropIdx] = newPiece;
                if (!this.dragData.isSpare && this.dragData.fromIdx !== dropIdx) {
                    window.game.board[this.dragData.fromIdx] = null;
                }
                window.game.syncEngineToBoard();
                moveMade = true;
            } else {
                if (!this.dragData.isSpare) {
                    if (this.dragData.fromIdx === dropIdx) {
                        this.cleanupDrag(true);
                        return;
                    }
                    if (window.game.turn !== this.dragData.piece.color) {
                        // 🔥 PREMOVES: 
                        // Premoves are automatically handled because the engine makeMove override
                        // you added earlier will catch the Rook coordinate when the premove fires!
                        if (window.game.isAnalysisMode) {
                            this.cleanupDrag(true);
                            return;
                        }

                        const piece = this.dragData.piece;
                        const toRow = Math.floor(dropIdx / 8);
                        let promo = undefined;
                        
                        if (piece.type.toLowerCase() === 'p') {
                            if ((piece.color === 'w' && toRow === 0) || (piece.color === 'b' && toRow === 7)) {
                                promo = document.getElementById('autoQueen')?.checked ? 'q' : 'q';
                            }
                        }

                        const moveObj = { 
                            from: this.dragData.fromIdx, 
                            to: dropIdx,
                            color: piece.color, 
                            piece: piece.type,
                            promotion: promo
                        };

                        window.game.addPremove(moveObj);
                        moveMade = true;
                        this.renderBoard(false);
                    } else {
                        // 🔥 DRAG-TO-CASTLE REDIRECT 🔥
                        let move = this.legalMoves.find(m => m.to === dropIdx);
                        
                        if (!move) {
                            const castleMove = this.resolveCastlingIntent(this.dragData.fromIdx, dropIdx);
                            if (castleMove) move = castleMove;
                        }

                        if (move) {
                            this.executeMove(move, false);
                            moveMade = true;
                        }
                    }
                }
            }
        } else {
            if (window.game.isEditing && !this.dragData.isSpare) {
                window.game.board[this.dragData.fromIdx] = null;
                window.game.syncEngineToBoard();
                if (window.sfWorker) window.sfWorker.postMessage('stop');
                moveMade = true;
            }
        }

        if (window.game.isEditing && moveMade) this.renderBoard(false);
        this.cleanupDrag(!moveMade);
        if (window.game.isEditing) this.updateEditorInputs();
    }
cleanupDrag(keepSelection = false) {
this.dragData = null;
this.draggedPieceGhost.style.display ='none';
document.body.classList.remove('grabbing');
if (!keepSelection) {
this.selectedSq = null;
this.legalMoves = [];
}
// Re-render to ensure ghost is gone and highlights are correct
this.renderBoard(false);
}
executeMove(move, animate = true, promoOverride = null) {
        const piece = window.game.board[move.from];
        if (!piece) return;

        const isPawn = (piece.type.toLowerCase() === 'p');
        const destRank = Math.floor(move.to / 8);
        const isRank8 = (destRank === 0 || destRank === 7);
        
        let promoChar = promoOverride;

        if (isPawn && isRank8 && !promoChar) {
            const autoQueen = document.getElementById('autoQueen')?.checked;
            
            if (autoQueen) {
                promoChar = 'q';
            } else {
                // PASS move.to SO WE KNOW WHERE TO SHOW THE MENU
                this.showPromotionModal(piece.color, move.to, (selectedType) => {
                    this.executeMove(move, animate, selectedType);
                });
                return;
            }
        }

        // Handle Premoves
        if (window.game.premoveQueue.length > 0) {
            const next = window.game.premoveQueue[0];
            if (move.from === next.from && move.to === next.to) window.game.premoveQueue.shift();
            else window.game.clearPremoves();
        }

        let res = window.game.makeMove(move, promoChar || 'q'); 
        if (res) window.game.triggerMoveSound(res); 
        
        this.selectedSq = null;
        this.legalMoves = [];
        this.renderBoard(animate, animate); 
        this.updateHistory();
        this.updateClocks();
        this.renderArrows();
        
        // Hide overlay if it was open
        const overlay = document.getElementById('promotion-overlay');
        if(overlay) overlay.style.display = 'none';
    }
renderBoard(animate = false, showMangaTail = true, overrideMove = null) {
        const theme = document.getElementById('assetType').value;
        const boardContainer = document.getElementById('chessBoard');
        
        if (boardContainer) {
            if (theme === 'disguised') boardContainer.classList.add('theme-disguised');
            else boardContainer.classList.remove('theme-disguised');
        }

        this.coordsPosition = document.getElementById('coordPosition')?.value || 'inside';

        let moveDuration = 250; 
        let castleDuration = 400;

        // 🔥 FLUID DYNAMIC SCALING 🔥
        if (animate) {
            const now = performance.now();
            const delta = now - (this.lastAnimTime || 0);
            this.lastAnimTime = now;

            if (delta > 0 && delta < 300) {
                moveDuration = Math.max(20, delta * 0.95); 
                castleDuration = Math.max(20, delta * 0.95);
            }
        }

        const allPieces = this.piecesLayer.querySelectorAll('.piece');
        allPieces.forEach(p => {
            p.classList.remove('animating', 'castling-jump', 'manga-tail');
            p.style.transition = 'none';
            
            if (p.dataset.animTimeout) {
                clearTimeout(Number(p.dataset.animTimeout));
                delete p.dataset.animTimeout;
            }
            if (p.dataset.tailTimeout) {
                clearTimeout(Number(p.dataset.tailTimeout));
                delete p.dataset.tailTimeout;
            }
            p.style.removeProperty('--tail-length-scale');
            p.style.removeProperty('--move-angle');
            p.style.removeProperty('--anim-duration'); 
            
            if (p.classList.contains('captured-pending')) p.remove();
        });

        if (this.animationsEnabled === false) { animate = false; showMangaTail = false; }
        if (moveDuration < 1) { animate = false; }

        const annoLayer = document.getElementById('annotationsLayer');
        if (annoLayer) annoLayer.innerHTML = '';
        const extLayer = document.getElementById('external-coords-layer');
        if (extLayer && this.coordsPosition === 'inside') extLayer.innerHTML = '';

        let kIdx = -1;
        let isCheck = false;
        if (window.game && window.game.engine && !window.game.isEditing) {
            isCheck = window.game.engine.in_check();
            if (isCheck) {
                const turn = window.game.engine.turn(); 
                for (let i = 0; i < 64; i++) {
                    const p = window.game.board[i];
                    if (p && p.type === 'k' && p.color === turn) { kIdx = i; break; }
                }
            }
        }
        const activeMove = overrideMove || (window.game.currentNode ? window.game.currentNode.lastMove : null);

        if (this.squaresLayer.children.length !== 64) {
            this.squaresLayer.innerHTML = '';
            const fragment = document.createDocumentFragment();
            for (let i = 0; i < 64; i++) {
                let sq = document.createElement('div');
                fragment.appendChild(sq);
            }
            this.squaresLayer.appendChild(fragment);
        }

        const squares = this.squaresLayer.children;

        for (let i = 0; i < 64; i++) { 
            let r = Math.floor(i / 8); 
            let c = i % 8; 
            let sq = squares[i]; 
            
            sq.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`; 
            sq.dataset.index = i; 
            sq.innerHTML = ''; 
            
            if (this.coordsPosition === 'inside') {
                const rankVal = this.flipped ? (r + 1) : (8 - r);
                const fileVal = this.flipped ? ['a','b','c','d','e','f','g','h'][7 - c] : ['a','b','c','d','e','f','g','h'][c];
                if (c === 0) sq.innerHTML += `<span class="coord rank">${rankVal}</span>`;
                if (r === 7) sq.innerHTML += `<span class="coord file">${fileVal}</span>`;
            }

            if (isCheck && i === kIdx) sq.classList.add('in-check');
            
            if (!window.game.isEditing && this.selectedSq != null && this.selectedSq == i) {
                sq.classList.add('selected');
                const p = window.game.board[i];
                if (p) sq.classList.add(p.color === 'w' ? 'selected-w' : 'selected-b');
            }

            if (activeMove && (activeMove.from === i || activeMove.to === i)) {
                sq.classList.add('last-move');
                let moveColor = activeMove.color;
                if (!moveColor && window.game.board[activeMove.to]) moveColor = window.game.board[activeMove.to].color;
                else if (!moveColor && window.game.engine) moveColor = window.game.engine.turn() === 'w' ? 'b' : 'w';
                
                if (moveColor === 'w') sq.classList.add('highlight-w');
                else if (moveColor === 'b') sq.classList.add('highlight-b');
            }

            if (window.game.premoveQueue && window.game.premoveQueue.length > 0) {
                window.game.premoveQueue.forEach(pm => {
                    if (i === pm.from) sq.classList.add('premove-source');
                    if (i === pm.to) sq.classList.add('premove-dest');
                });
            }

            sq.onmousedown = null; 

            if (this.selectedSq != null) {
                let move = this.legalMoves.find(m => m.to === i);
                
                if (!move && typeof this.resolveCastlingIntent === 'function') {
                    const castleMove = this.resolveCastlingIntent(this.selectedSq, i);
                    if (castleMove) move = castleMove;
                }

                if (move) {
                    sq.classList.add('valid-move');
                    let hint = document.createElement('div');
                    hint.className = window.game.board[i] ? 'hint-capture' : 'hint-dot';
                    sq.appendChild(hint);
                    
                    sq.onmousedown = (e) => {
                        if (e.button !== 0) return;
                        if (this.moveInputMode === 'drag') return;
                        e.stopPropagation();
                        this.executeMove(move, true); 
                    }
                }
            }
            
            if (window.game.isEditing) {
                animate = false;
                showMangaTail = false;
                sq.onmousedown = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    if (this.editorTool === 'trash') {
                        if (window.game.board[i]) {
                            window.game.board[i] = null;
                            this.renderBoard(false);
                        }
                    } else if (this.editorTool && this.editorTool !== 'cursor') {
                        const color = this.editorTool.charAt(0);
                        const type = this.editorTool.charAt(1).toLowerCase();
                        window.game.board[i] = { color: color, type: type };
                        this.renderBoard(false);
                    }
                    if (window.game.generateFEN) { 
                        const f = window.game.generateFEN(); 
                        if (window.game.currentNode) window.game.currentNode.fen = f; 
                    }
                };
            }
        }

        if (this.coordsPosition === 'outside') this.renderExternalCoords();

        const piecesMap = new Map();
        for (let i = 0; i < 64; i++) { 
            if (window.game.board[i]) { 
                if (!window.game.board[i].id) window.game.board[i].id = window.game.getUID(); 
                piecesMap.set(window.game.board[i].id, { ...window.game.board[i], idx: i }); 
            } 
        } 

        Array.from(this.piecesLayer.children).forEach(el => {
            const oldId = el.dataset.id;
            if (piecesMap.has(oldId)) return;
            const match = Array.from(piecesMap.values()).find(p => p.color === (el.classList.contains('piece-w') ? 'w' : 'b') && !this.piecesLayer.querySelector(`[data-id="${p.id}"]`));
            if (match) { el.dataset.id = match.id; return; }
            
            if (animate) {
                el.classList.add('captured-pending');
                setTimeout(() => el.remove(), moveDuration < 100 ? 0 : 200);
            } else {
                el.remove();
            }
        });

        piecesMap.forEach((p, id) => {
            let el = this.piecesLayer.querySelector(`[data-id="${id}"]`);
            let isNew = false;
            const colorClass = p.color === 'w' ? 'piece-w' : 'piece-b';
            const rawSVG = this.getPieceHTML(p);
            let htmlBuffer = rawSVG;
            
            if (rawSVG) {
                const trimmed = rawSVG.trim();
                if (trimmed.startsWith('<svg')) {
                     const encodedSVG = encodeURIComponent(trimmed);
                     htmlBuffer = `<img src="data:image/svg+xml;charset=utf-8,${encodedSVG}" class="piece-img" style="width:100%; height:100%; display:block; pointer-events:none;">`;
                } else if (trimmed.startsWith('data:image/') || trimmed.startsWith('http') || trimmed.endsWith('.svg') || trimmed.endsWith('.png')) {
                     htmlBuffer = `<img src="${trimmed}" class="piece-img" style="width:100%; height:100%; display:block; pointer-events:none;">`;
                }
            }

            let nagValue = p.nag || null;
            if (!nagValue && window.game.currentNode && window.game.currentNode.lastMove && window.game.currentNode.lastMove.to === p.idx) { nagValue = window.game.currentNode.nag; }
            if (nagValue) {
                const info = this.getNagInfo(nagValue);
                if (info && !window.game.currentNode.isBook) {
                    htmlBuffer += `<div class="nag-indicator ${info.cls}" style="background-color:${info.color}; border-color:${info.borderColor};">${info.symbol}</div>`; 
                }
            }

            if (!el) {
                el = document.createElement('div');
                el.className = `piece ${colorClass}`;
                el.dataset.id = id;
                el.innerHTML = htmlBuffer;
                el.onmousedown = (e) => { if (e.button === 0) this.startDrag(e, p.idx, p); };
                this.piecesLayer.appendChild(el);
                isNew = true;
            } else {
                if (!el.classList.contains(colorClass)) { el.classList.remove('piece-w', 'piece-b'); el.classList.add(colorClass); }
                if (el.innerHTML !== htmlBuffer) el.innerHTML = htmlBuffer;
                el.onmousedown = (e) => { if (e.button === 0) this.startDrag(e, p.idx, p); };
            }
            
            el.style.opacity = '1';
            let r = Math.floor(p.idx / 8);
            let c = p.idx % 8;
            if (this.flipped) { r = 7 - r; c = 7 - c; }
            const targetTransform = `translate(${c * 100}%, ${r * 100}%)`;
            el.style.width = '12.5%';
            el.style.height = '12.5%';
            const currentTransform = el.style.transform;
            const positionChanged = (currentTransform && currentTransform !== targetTransform);
            const targetMove = overrideMove || window.game.currentNode.lastMove;
            
            // =========================================================
            // 🔥 ULTIMATE 960 CASTLING & DIRECTIONAL SYNC 🔥
            // =========================================================
            let isCastleRook = false;
            let isCastlingMove = false;

            if (targetMove && targetMove.flags && (targetMove.flags.includes('k') || targetMove.flags.includes('q'))) {
                const isKingside = targetMove.flags.includes('k');
                const turn = targetMove.color || p.color;

                if (p.color === turn) {
                    const kTarget = turn === 'w' ? (isKingside ? 62 : 58) : (isKingside ? 6 : 2);
                    const rTarget = turn === 'w' ? (isKingside ? 61 : 59) : (isKingside ? 5 : 3);

                    // 1. Detect if we are moving FORWARD or BACKWARD by looking at where the King landed
                    const boardKing = window.game.board[kTarget];
                    const isForward = (boardKing && boardKing.type.toLowerCase() === 'k' && boardKing.color === turn);

                    // 2. Fetch the true starting configuration
                    let setupFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
                    if (window.game && window.game.currentNode) {
                        setupFen = isForward ? (window.game.currentNode.parent ? window.game.currentNode.parent.fen : window.game.currentNode.fen) : window.game.currentNode.fen;
                    }

                    // 3. Scan the FEN to find the exact starting files
                    let rankStr = turn === 'w' ? setupFen.split(' ')[0].split('/')[7] : setupFen.split(' ')[0].split('/')[0];
                    let rFiles = [];
                    let kFile = 4; 
                    let currC = 0;
                    for (let char of rankStr) {
                        if (/\d/.test(char)) currC += parseInt(char);
                        else {
                            if (char.toLowerCase() === 'r') rFiles.push(currC);
                            if (char.toLowerCase() === 'k') kFile = currC;
                            currC++;
                        }
                    }
                    
                    let rFile = isKingside ? Math.max(...rFiles) : Math.min(...rFiles);
                    if (rFile === -Infinity || rFile === Infinity) rFile = isKingside ? 7 : 0;

                    const kStart = turn === 'w' ? 56 + kFile : kFile;
                    const rStart = turn === 'w' ? 56 + rFile : rFile;

                    // 4. Assign the appropriate coordinate to animate FROM
                    if (p.type.toLowerCase() === 'k') {
                        if (isForward && p.idx === kTarget) {
                            isCastlingMove = true;
                            p._castleStartIdx = kStart;
                        } else if (!isForward && p.idx === kStart) {
                            isCastlingMove = true;
                            p._castleStartIdx = kTarget;
                        }
                    } else if (p.type.toLowerCase() === 'r') {
                        if (isForward && p.idx === rTarget) {
                            isCastlingMove = true;
                            isCastleRook = true;
                            p._castleStartIdx = rStart;
                        } else if (!isForward && p.idx === rStart) {
                            isCastlingMove = true;
                            isCastleRook = true;
                            p._castleStartIdx = rTarget;
                        }
                    }
                }
            }

            // 🔥 THE FIX: We bypass 'positionChanged' and '!isNew' if the piece is the active mover!
            let isMovedPiece = !!(targetMove && p.idx === targetMove.to);
            let forceAnimate = isMovedPiece || isCastlingMove;

            if (animate && (positionChanged || forceAnimate) && (!isNew || forceAnimate)) {
                
                // 🛠️ HELPER: Converts strings like "b6" into numbers so the % 8 math doesn't result in NaN!
                const getSafeIndex = (val) => typeof val === 'string' ? window.game.squareToIndex(val) : val;

                if (forceAnimate) {
                    let finalDuration = isCastlingMove ? castleDuration : moveDuration;

                    if (isCastlingMove) { 
                        let startC = p._castleStartIdx % 8; 
                        let startR = Math.floor(p._castleStartIdx / 8);
                        if (this.flipped) { startC = 7 - startC; startR = 7 - startR; }
                        el.style.transition = 'none';
                        el.style.transform = `translate(${startC * 100}%, ${startR * 100}%)`;
                    } else if (isMovedPiece) {
                        const originIdx = getSafeIndex(targetMove.from); // 🛠️ Patched
                        let startC = originIdx % 8;
                        let startR = Math.floor(originIdx / 8);
                        if (this.flipped) { startC = 7 - startC; startR = 7 - startR; }
                        el.style.transition = 'none';
                        el.style.transform = `translate(${startC * 100}%, ${startR * 100}%)`;
                    }

                    el.classList.remove('animating', 'castling-jump', 'manga-tail');
                    if (el.dataset.animTimeout) clearTimeout(Number(el.dataset.animTimeout));
                    
                    // Force the browser to register the starting square before transitioning
                    void el.offsetWidth;
                    
                    el.classList.add('animating');

                    if (isCastlingMove) {
                        el.classList.add('castling-jump');
                        el.style.transition = `transform ${finalDuration}ms cubic-bezier(0.2, 0.8, 0.2, 1)`; 
                        setTimeout(() => { if(el) el.classList.remove('castling-jump'); }, finalDuration);
                    } else {
                        el.style.transition = `transform ${finalDuration}ms`;
                    }

                    if (showMangaTail && ((isMovedPiece && !isCastlingMove) || (isCastlingMove && !isCastleRook))) {
                        if (el.dataset.tailTimeout) clearTimeout(Number(el.dataset.tailTimeout));
                        
                        let fromC, fromR, toC, toR;
                        if (isCastlingMove) {
                            fromC = p._castleStartIdx % 8;
                            fromR = Math.floor(p._castleStartIdx / 8);
                            toC = p.idx % 8;
                            toR = Math.floor(p.idx / 8);
                        } else {
                            // 🛠️ Patched to prevent manga tails from shooting off into NaN space
                            const safeFrom = getSafeIndex(targetMove.from);
                            const safeTo = getSafeIndex(targetMove.to);
                            fromC = safeFrom % 8;
                            fromR = Math.floor(safeFrom / 8);
                            toC = safeTo % 8;
                            toR = Math.floor(safeTo / 8);
                        }

                        let dx = toC - fromC; let dy = toR - fromR;
                        if (this.flipped) { dx = -dx; dy = -dy; }
                        const distance = Math.sqrt(dx*dx + dy*dy);
                        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                        
                        el.style.setProperty('--move-angle', `${angle}deg`);
                        const tailScale = 1 + (distance * 2);
                        el.style.setProperty('--tail-length-scale', tailScale);
                        el.style.setProperty('--anim-duration', `${finalDuration}ms`);
                        el.classList.add('manga-tail');
                        const tailId = setTimeout(() => {
                            if(el) {
                                el.classList.remove('manga-tail');
                                el.style.removeProperty('--tail-length-scale');
                                el.style.removeProperty('--move-angle');
                                delete el.dataset.tailTimeout;
                            }
                        }, finalDuration);
                        el.dataset.tailTimeout = tailId;
                    }
                    
                    el.style.transform = targetTransform;
                    const tId = setTimeout(() => {
                        if(el) {
                            el.classList.remove('animating', 'castling-jump');
                            el.style.transition = ''; 
                            delete el.dataset.animTimeout;
                        }
                    }, finalDuration);
                    el.dataset.animTimeout = tId;
                } else {
                    el.style.transform = targetTransform;
                }
            } else {
                el.classList.remove('animating', 'manga-tail', 'castling-jump');
                el.style.transition = 'none';
                el.style.transform = targetTransform;
            }
        });

        this.renderArrows();
        if(document.getElementById('fenDisplay')) document.getElementById('fenDisplay').innerText = window.game.currentNode.fen;
        const resignBtn = document.getElementById('resignBtn');
        if (resignBtn) {
            const isPlaying = window.game && (window.game.mode === 'local' || window.game.mode === 'bot') && !window.game.gameOver;
            resignBtn.style.display = isPlaying ? 'inline-block' : 'none';
        }
    }
renderExternalCoords() {
    let layer = document.getElementById('external-coords-layer');
    if (!layer) {
        layer = document.createElement('div');
        layer.id = 'external-coords-layer';
        // z-index 5 places it above squares but below pieces/arrows
        layer.style.cssText = "position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:5;";
        this.boardWrapper.appendChild(layer);
    }
    layer.innerHTML = '';

    // Ranks (Left Side)
    for (let r = 0; r < 8; r++) {
        const val = this.flipped ? (r + 1) : (8 - r);
        const el = document.createElement('div');
        el.innerText = val;
        el.style.cssText = `
            position: absolute; 
            left: -25px; 
            top: ${r * 12.5}%; 
            height: 12.5%; 
            width: 20px;
            display: flex; 
            align-items: center; 
            justify-content: flex-end;
            font-size: 13px;
            color: #bbb;
            font-weight: bold;
        `;
        layer.appendChild(el);
    }

    // Files (Bottom Side)
    for (let c = 0; c < 8; c++) {
        const val = this.flipped ? FILES[7 - c] : FILES[c];
        const el = document.createElement('div');
        el.innerText = val;
        el.style.cssText = `
            position: absolute; 
            bottom: -25px; 
            left: ${c * 12.5}%; 
            width: 12.5%; 
            height: 20px;
            display: flex; 
            align-items: flex-start; 
            justify-content: center;
            font-size: 13px;
            color: #bbb;
            font-weight: bold;
        `;
        layer.appendChild(el);
    }
}
animateToStartPosition(targetFen = null, onCompleteCallback = null) {
        console.group("🚀 AnimateToStart: LOGIC-BASED SYNC");

        const piecesLayer = document.getElementById('piecesLayer');
        if (!piecesLayer) { 
            if(onCompleteCallback) onCompleteCallback(); 
            console.groupEnd(); 
            return; 
        }

        if (!targetFen) {
            const input = document.getElementById('fenInput');
            targetFen = (input && input.value) ? input.value : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
        }

        const targets = [];
        const fenBoard = targetFen.split(' ')[0];
        const rows = fenBoard.split('/');
        
        for (let r = 0; r < 8; r++) {
            let c = 0;
            const rowStr = rows[r];
            for (let i = 0; i < rowStr.length; i++) {
                const char = rowStr[i];
                if (/\d/.test(char)) { c += parseInt(char); } 
                else {
                    const color = (char === char.toUpperCase()) ? 'w' : 'b';
                    const type = char.toLowerCase();
                    targets.push({ type, color, r, c, assigned: false });
                    c++;
                }
            }
        }

        const currentPieces = [];
        const board = window.game.board; 
        
        const getDOM = (id) => piecesLayer.querySelector(`.piece[data-id='${id}']`);

        board.forEach((p, idx) => {
            if (!p) return;
            const el = getDOM(p.id);
            if (el) {
                const r = Math.floor(idx / 8);
                const c = idx % 8;
                currentPieces.push({ el: el, id: p.id, type: p.type, color: p.color, r: r, c: c, assigned: false });
            }
        });

        Array.from(piecesLayer.querySelectorAll('.piece')).forEach(domEl => {
            const id = domEl.dataset.id;
            const inLogic = currentPieces.find(cp => cp.id === id);
            if (!inLogic) {
                currentPieces.push({ el: domEl, type: 'unknown', color: 'unknown', r: -1, c: -1, assigned: false, isGhost: true });
            }
        });

        const animations = [];
        const piecesToSpawn = [];

        targets.forEach(target => {
            const exact = currentPieces.find(p => !p.assigned && !p.isGhost && p.type === target.type && p.color === target.color && p.c === target.c && p.r === target.r);
            if (exact) {
                exact.assigned = true;
                target.assigned = true;
                exact.el.className = `piece piece-${exact.color} ${exact.type}`;
            }
        });

        targets.forEach(target => {
            if (target.assigned) return;
            
            let closest = null;
            let minDist = Infinity;

            for (let p of currentPieces) {
                if (p.assigned || p.isGhost) continue;
                if (p.type !== target.type || p.color !== target.color) continue;

                const d = Math.abs(p.c - target.c) + Math.abs(p.r - target.r);
                if (d < minDist) { minDist = d; closest = p; }
            }

            if (closest) {
                closest.assigned = true;
                animations.push({ el: closest.el, r: target.r, c: target.c, color: target.color, type: target.type });
            } else {
                piecesToSpawn.push(target);
            }
        });

        // =========================================================
        // PURE SLIDE EXECUTION (No Fake Jumps)
        // =========================================================
        animations.forEach(anim => {
            anim.el.className = `piece piece-${anim.color} ${anim.type}`;
            
            let finalDuration = 500;
            anim.el.style.transition = `transform ${finalDuration}ms cubic-bezier(0.25, 1, 0.5, 1)`;
            anim.el.style.zIndex = 100;
            
            let destC = anim.c; let destR = anim.r;
            if (this.flipped) { destC = 7 - destC; destR = 7 - destR; }
            
            anim.el.style.transform = `translate(${destC * 100}%, ${destR * 100}%)`;
        });

        const removed = currentPieces.filter(p => !p.assigned);
        if (removed.length > 0) {
            removed.forEach(p => {
                if (p.color && p.type && p.color !== 'unknown') {
                    p.el.className = `piece piece-${p.color} ${p.type}`;
                }
                const anim = p.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
                anim.onfinish = () => { if(p.el) p.el.remove(); };
            });
        }

        piecesToSpawn.forEach(item => {
            const el = document.createElement('div');
            const colorClass = item.color === 'w' ? 'piece-w' : 'piece-b';
            el.className = `piece ${colorClass} ${item.type}`;
            el.style.width = '12.5%'; el.style.height = '12.5%'; el.style.position = 'absolute';
            
            const htmlContent = this.getPieceHTML({ color: item.color, type: item.type });
            let innerHTML = htmlContent;
            if (htmlContent && htmlContent.trim().startsWith('<svg')) {
                 const encodedSVG = encodeURIComponent(htmlContent);
                 innerHTML = `<img src="data:image/svg+xml;charset=utf-8,${encodedSVG}" style="width:100%;height:100%;display:block;">`;
            }
            el.innerHTML = innerHTML || '';

            let startC = item.c; let startR = item.r;
            if (this.flipped) { startC = 7 - startC; startR = 7 - startR; }
            el.style.transform = `translate(${startC * 100}%, ${startR * 100}%)`;
            piecesLayer.appendChild(el);
            el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: 'forwards' });
        });

        setTimeout(() => {
            animations.forEach(anim => { if(anim.el) anim.el.style.zIndex = ''; });
            console.groupEnd();
            if (onCompleteCallback) onCompleteCallback();
        }, 550);
    }
updateHistory(force = false) {
        if (force) {
            this._lastTreeSize = -1;
            this.isHistoryUpdatePending = false; 
        }

        // If a render is already queued, skip this call
        if (this.isHistoryUpdatePending) return;
        
        // Lock the queue
        this.isHistoryUpdatePending = true;
        // INSTANT COMMENT BOX SWAP LOGIC
        const commentBox = document.getElementById('commentaryBox');
        if (commentBox && window.game && window.game.currentNode) {
            // If the move ID doesn't match the box's ID, it means you clicked a new move!
            if (commentBox.dataset.activeNodeId !== window.game.currentNode.id) {
                let txt = window.game.currentNode.comment || "";
                if (!txt && document.activeElement !== commentBox) {
                    txt = "Click to add comment...";
                }
                commentBox.innerText = txt;
                commentBox.dataset.activeNodeId = window.game.currentNode.id;
            }
        }
        requestAnimationFrame(() => {
            try {
                // Safely attempt to build the HTML
                if (typeof this.renderHistoryImmediate === 'function') {
                    this.renderHistoryImmediate();
                }
                if (typeof this.renderECO === 'function') {
                    this.renderECO();
                }
            } catch (err) {
                console.error("History Render Error:", err);
            } finally {
                // 🔥 THE FIX: ALWAYS unlock the cache, even if an error crashes the render!
                this.isHistoryUpdatePending = false;
            }
        });
    }
renderHistoryImmediate() {
        const list = document.getElementById('moveHistory');
        if (!list) return;
        
        const styleSelect = document.getElementById('pgnStyle');
        const isNone = styleSelect && (styleSelect.value === 'none' || (styleSelect.selectedOptions[0] && styleSelect.selectedOptions[0].text === 'None'));
        this.pgnStyle = styleSelect ? styleSelect.value : 'standard';
        
        if (isNone) {
            list.innerHTML = '';
            list.style.display = 'block'; 
            list.classList.remove('hidden');
            list.className = 'history-list pgn-none'; 
            return;
        }

        // =========================================================
        // 🔥 THE CPU BYPASS: SMART DOM CACHING 🔥
        // =========================================================
        let currentTreeSize = 0;
        if (window.game && window.game.rootNode) {
            currentTreeSize = this.getTreeSize(window.game.rootNode);
        }
        
        const activeNode = window.game ? window.game.currentNode : null;
        const activeNodeId = activeNode ? activeNode.id : null;

        // If the PGN hasn't grown/shrunk, and the HTML list is already populated, SKIP THE REBUILD!
        if (this._lastTreeSize === currentTreeSize && activeNodeId && list.children.length > 0) {
            
            // 1. Instantly swap the 'active' class to the new move using GPU rendering
            list.querySelectorAll('.active').forEach(el => el.classList.remove('active'));
            const newActiveEl = list.querySelector(`[data-id="${activeNodeId}"]`);
            if (newActiveEl) newActiveEl.classList.add('active');
            
            // 2. Update comments
            if (activeNode) {
                const commentBox = document.getElementById('commentaryBox');
                if (commentBox && document.activeElement !== commentBox) {
                    let displayComment = (activeNode.comment || "").replace(/\[%(cal|csl)[^\]]+\]/g, "").trim();
                    commentBox.innerText = displayComment || "Click to add comment...";
                }
            }
            
            // 3. Scroll and update charts
            this.scrollToActiveMove();
            if (typeof this.updateChartActiveLine === 'function') this.updateChartActiveLine();
            
            return; // 🛑 EXIT EARLY! Saves 95% of the CPU load!
        }

        // =========================================================
        // NORMAL HEAVY HTML REBUILD (Only runs on new moves/deletions)
        // =========================================================
        this._lastTreeSize = currentTreeSize;

        list.innerHTML = '';
        list.style.display = 'block'; 
        list.classList.remove('hidden');

        if (this.pgnStyle === 'tree') {
            list.className = 'history-list pgn-tree';
            if (window.game && window.game.rootNode) {
                this.renderTreeVertical(window.game.rootNode, list);
            }
        } else {
            list.className = 'history-list pgn-standard';
            if (window.game && window.game.rootNode) {
                this.renderTreeRecursive(window.game.rootNode, list, 1);
            }
        }

        // Update Comments for fresh render
        if (activeNode) {
            let displayComment = (activeNode.comment || "").replace(/\[%(cal|csl)[^\]]+\]/g, "").trim();
            const commentBox = document.getElementById('commentaryBox');
            if (commentBox) commentBox.innerText = displayComment || "Click to add comment...";
        }

        this.scrollToActiveMove();
        if (typeof this.updateChartActiveLine === 'function') {
            this.updateChartActiveLine();
        }
    }
renderECO() {
        if (!window.game) return;

        // 1. Create a dedicated container above the PGN list so it never conflicts!
        let openingBox = document.getElementById('live-opening-box');
        
        if (!openingBox) {
            const sheet = document.getElementById('moveHistory');
            if (sheet && sheet.parentElement) {
                openingBox = document.createElement('div');
                openingBox.id = 'live-opening-box';
                // Beautiful Dark Mode Lichess Styling
                openingBox.style.padding = '10px 15px';
                openingBox.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
                openingBox.style.borderBottom = '1px solid #333';
                openingBox.style.fontSize = '14px';
                openingBox.style.display = 'none'; // Hidden by default
                sheet.parentElement.insertBefore(openingBox, sheet);
            }
        }

        if (!openingBox) return;

        // 2. Hide during Puzzle or Editor modes
        if (['puzzle', 'editor'].includes(window.game.mode)) {
            openingBox.style.display = 'none';
            return;
        }

        // 3. Ask the engine logic for the opening
        const opening = typeof window.game.getCurrentOpening === 'function' ? window.game.getCurrentOpening() : null;

        // 4. Render it!
        if (opening) {
            openingBox.style.display = 'block';
            openingBox.innerHTML = `
                <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #e2e8f0; font-weight: 500;" title="${opening.name}">
                    <span style="color: #facc15; margin-right: 5px;">${opening.eco}</span> 
                    ${opening.name}
                </div>
            `;
        } else {
            // Hide if completely out of book
            openingBox.style.display = 'none';
        }
    }
scrollToActiveMove() {
        const container = document.getElementById('moveHistory'); 
        if (!container) return;

        const activeEl = container.querySelector('.active');
        if (activeEl) {
            // --- FIX: MANUALLY SCROLL CONTAINER ONLY ---
            // Using scrollIntoView() often scrolls the whole page. 
            // We calculate the exact scrollTop to keep the page still.

            const containerRect = container.getBoundingClientRect();
            const activeRect = activeEl.getBoundingClientRect();

            // 1. Where is the element currently relative to the container?
            const relativeTop = activeRect.top - containerRect.top;

            // 2. Where do we want it? (Middle of container)
            const targetPos = (container.clientHeight / 2) - (activeEl.clientHeight / 2);

            // 3. Adjust scroll
            // If relativeTop is 100 and we want it at 50, we scroll down by 50.
            container.scrollTop += (relativeTop - targetPos);
        }
    }
getNagInfo(nag) {
        if (!nag) return null;
        let nags = nag.toString().split(',').map(n => n.trim().replace('$', ''));
        
        // 🔥 THE FIX: Increase limit from 6 to 9 to catch new Chess.com annotations
        let v = nags.find(n => parseInt(n) >= 1 && parseInt(n) <= 9) || nags[0]; 
        
        let info = { symbol:'', cls:'nag-pos', color:'#888888', borderColor:'#aaaaaa', type:'' };
        switch(v) {
            // --- COLORED ANNOTATIONS (Move Quality) ---
            case'1':case'!':
                return { symbol:'!', cls:'ind-1', color:'#5c8bb0', borderColor:'#28a2e7',type:'good'};
            case'2':case'?':
                return { symbol:'?', cls:'ind-2', color:'#ffa700', borderColor:'#af5205',type:'mistake'};
            case'3':case'!!':
                return { symbol:'!!', cls:'ind-3', color:'#26c2a3', borderColor:'#09e9ed',type:'brilliant'};
            case'4':case'??':
                return { symbol:'??', cls:'ind-4', color:'#fa412d', borderColor:'#892c12',type:'blunder'};
            case'5':case'!?':
                return { symbol:'!?', cls:'ind-5', color:'#b369f2', borderColor:'#bd09ed',type:'interesting'};
            case'6':case'?!':
                return { symbol:'?!', cls:'ind-6', color:'#f7c045', borderColor:'#f5d91d',type:'inaccuracy'};
            
            case'7': // Excellent (Green)
                return { symbol:'!', cls:'ind-1', color:'#96bc4b', borderColor:'#6c8a32', type:'excellent'};
            case'8': // Great (Blue)
                return { symbol:'!', cls:'ind-1', color:'#5c8bb0', borderColor:'#3a6280', type:'great'};
            case'9': // Miss (Coral Red)
                return { symbol:'X', cls:'ind-2', color:'#ff7769', borderColor:'#c75446', type:'miss'};

            // --- POSITIONAL EVALUATIONS ---
            case'10':case'=': info.symbol ='=';  break; // Draw
            case'13':case'∞': info.symbol ='∞';  break; // Unclear
            case'14':case'⩲':case'+=':info.symbol ='⩲';  break; // White slight adv
            case'15':case'⩱':case'=+':info.symbol ='⩱';  break; // Black slight adv
            case'16':case'±':case'+/-':info.symbol ='±';  break; // White moderate adv
            case'17':case'∓':case'-/+':info.symbol ='∓';  break; // Black moderate adv
            case'18':case'+-':info.symbol ='+-'; break; // White winning
            case'19':case'-+':info.symbol ='-+'; break; // Black winning
            default:return null;
        }
        return info;
    }
updateInlineEval(node) {
        if (!node || !node.id) return;
        
        // 1. Find the exact move element in the DOM
        const moveSpan = document.querySelector(`[data-id="${node.id}"]`);
        if (!moveSpan) return;

        // 2. Remove the old evaluation badge if it exists so we don't duplicate them
        const existingEval = moveSpan.querySelector('.move-eval');
        if (existingEval) existingEval.remove();

        // 3. Get the fresh evaluation text and color
        const evalData = this.getEvalData(node);
        if (evalData) {
            let evSpan = document.createElement('span');
            evSpan.className = evalData.className;
            evSpan.innerText = evalData.text;
            
            // 4. Format it perfectly depending on if it's a mainline or subline
            if (moveSpan.classList.contains('var-move') || moveSpan.classList.contains('tree-move')) {
                evSpan.style.fontSize = "0.85em";
                evSpan.style.marginLeft = "3px";
            } else {
                evSpan.style.marginLeft = "4px";
            }
            
            // 5. Inject it!
            moveSpan.appendChild(evSpan);
        }
    }
getEvalData(node) {
        if (window.ui?.settings?.showEval === false) return null;

        // Strictly hide all evaluations during an active live game
        if (window.game && window.game.isPlayingLiveGame) return null;

        // 1. Prioritize Review/Analysis over Baseline Game Eval
        let activeScore = node.localEvalScore !== undefined ? node.localEvalScore : node.evalScore;
        
        if (activeScore !== undefined) {
            let className = "move-eval";
            let text = "";
            
            if (Math.abs(activeScore) >= 90000) { 
                let isMateForWhite = activeScore > 0;
                let moves = 100000 - Math.abs(activeScore); 
                
                // 🔥 THE FIX: Change Math.max(1, moves) to Math.max(0, moves) so M0 renders properly!
                text = (isMateForWhite ? "M" : "-M") + Math.max(0, moves);
                className += (isMateForWhite ? " positive" : " negative");
            } else {
                let v = activeScore / 100;
                text = (v > 0 ? "+" : "") + v.toFixed(2);
                className += (v > 0 ? " positive" : (v < 0 ? " negative" : ""));
            }
            return { text, className };
        }

        // 2. Standard Lichess [%eval] Format (fallback)
        if (node.score) {
            let className = "move-eval";
            const { value, unit } = node.score;
            if (unit === 'mate') {
                let text = (value > 0 ? "M" : "-M") + Math.abs(value);
                return { text, className: className + (value > 0 ? " positive" : " negative") };
            } else {
                let text = (value > 0 ? "+" : "") + parseFloat(value).toFixed(2);
                return { text, className: className + (value > 0 ? " positive" : (value < 0 ? " negative" : "")) };
            }
        }

        // 3. Fallback Legacy Eval
        if (node.eval && !node.isBook) {
            let eStr = node.eval.toString();
            let className = "move-eval" + (eStr.includes('-') ? " negative" : " positive");
            return { text: eStr, className };
        }

        return null;
    }
getTreeSize(node) {
        if (!node) return 0;
        let count = 1;
        for (let i = 0; i < node.children.length; i++) {
            count += this.getTreeSize(node.children[i]);
        }
        return count;
    }
createMoveSpanSafe(node) {
        let span = document.createElement('span');
        span.className = `move-ply ${node === window.game.currentNode ? 'active' : ''}`;
        if (!node.id) node.id = 'n_' + Math.random().toString(36).substr(2, 9);
        span.dataset.id = node.id;
        span.style.cssText = "display:inline-flex; align-items:center; vertical-align:middle; cursor:pointer;";
        
        const moveColorStr = node.fen.split(' ')[1] === 'w' ? 'b' : 'w';
        span.dataset.color = moveColorStr;

        // 🔥 MULTIPLE NAG SUPPORT
        let nags = node.nag ? node.nag.toString().split(',') : [];
        let primaryInfo = null;
        let symbols = [];

        nags.forEach(n => {
            const info = this.getNagInfo(n.trim());
            if (info) {
                symbols.push(info);
                // Assign move color based on Blunder/Mistake, ignoring the +- symbol color
                if (['good', 'mistake', 'brilliant', 'blunder', 'interesting', 'inaccuracy'].includes(info.type)) {
                    primaryInfo = info;
                }
            }
        });

        const moveColor = primaryInfo ? primaryInfo.color : 'var(--text-main)';
        if (primaryInfo && primaryInfo.type) span.dataset.nag = primaryInfo.type;

        // 1. Move Text
        let txt = document.createElement('span');
        txt.innerText = node.moveSan;
        if (primaryInfo) {
            txt.style.color = moveColor;
            txt.style.fontWeight = '700';
        }
        span.appendChild(txt);

        // 2. ALL NAG Symbols Combined! (e.g. "!!" and "+-")
        symbols.forEach(info => {
            let nSpan = document.createElement('span');
            nSpan.innerText = info.symbol;
            nSpan.style.color = info.color;
            nSpan.style.fontWeight = 'bold';
            nSpan.style.marginLeft = '2px';
            span.appendChild(nSpan);
        });

        // 3. Book Icon
        if (node.isBook) {
            let icon = document.createElement('span');
            icon.className = 'eval-icon';
            const iconColor = primaryInfo ? primaryInfo.color : '#a87c53';
            icon.style.cssText = "display:inline-flex; align-items:center; margin-left:4px;";
            icon.style.color = iconColor;
            icon.innerHTML = typeof ICON_BOOK_SVG !== 'undefined' ? ICON_BOOK_SVG : '📖';
            let svg = icon.querySelector('svg');
            if (svg) { svg.style.fill = iconColor; svg.style.width = '14px'; svg.style.height = '14px'; }
            span.appendChild(icon);
        }

        // 4. Dot (Annotations)
        if ((node.arrows && node.arrows.length > 0) || (node.circles && node.circles.length > 0)) {
            let dot = document.createElement('span');
            dot.style.cssText = "display:inline-block; width:6px; height:6px; background-color:#00b023; border-radius:50%; margin-left:4px; box-shadow:0 0 5px #00b023;";
            span.appendChild(dot);
        }

        // 5. EVAL
        const evalData = this.getEvalData(node);
        if (evalData) {
            let ev = document.createElement('span');
            ev.className = evalData.className;
            ev.innerText = evalData.text;
            ev.style.marginLeft = "4px";
            span.appendChild(ev);
        }

        let captured = node;

        span.onmousedown = (e) => {
            if (e.button !== 0) return;
            e.preventDefault(); 
            e.stopPropagation();

            window.game.currentNode = captured;
            window.game.loadFEN(captured.fen);
            window.game.syncMoveHistory();
            window.ui.renderBoard(false);
            window.ui.updateHistory(); 
            window.ui.renderArrows();
            
            if (window.ui.updateClocks) window.ui.updateClocks();
            if (window.game.updateStockfish && !window.game.isPlayingLiveGame) {
                window.game.updateStockfish();
            }
        };

        // 2. Handle Annotation Menu (Right Click Only)
        span.oncontextmenu = (e) => {
            e.preventDefault();  // Stop default browser menu
            e.stopPropagation(); // Stop the event from reaching parent containers
            this.showAnnotationPopup(e, captured);
        };

        return span;
    }
renderTreeRecursive(node, container, moveNum) {
        if (!node.children || node.children.length === 0) return;
        
        let activeIdx = node.selectedChildIndex || 0; 
        let mainChild = node.children[activeIdx];
        let ply = this.getPly(mainChild);
        let mNum = Math.ceil(ply / 2);
        let isWhite = (ply % 2 !== 0);
        let row;

        // --- Row Generation ---
        if (isWhite) {
            row = document.createElement('div');
            row.className ='move-row';
            let num = document.createElement('div');
            num.className ='move-num';
            num.innerText = mNum;
            row.appendChild(num);
            row.appendChild(this.createMoveSpanSafe(mainChild)); 
            container.appendChild(row);
        } else {
            row = container.lastElementChild;
            if (!row || !row.classList.contains('move-row') || row.children.length > 2) {
                row = document.createElement('div');
                row.className ='move-row';
                let num = document.createElement('div');
                num.className ='move-num';
                num.innerText = mNum + "...";
                row.appendChild(num);
                container.appendChild(row);
            }
            row.appendChild(this.createMoveSpanSafe(mainChild));
        }

        // --- BRANCH VIEW: ANNOTATIONS TOGGLE (COMMENTS + VARIATIONS) ---
        let cleanComment = mainChild.comment ? mainChild.comment.replace(/\[%(cal|csl|clk|emt)[^\]]+\]/g,"").trim() : "";
        let hasComment = cleanComment.length > 0;
        let hasVariations = node.children.length > 1;

        if (hasComment || hasVariations) {
            let isHidden = mainChild.isCollapsed === true;

            let toggleBtn = document.createElement('div');
            toggleBtn.className = 'full-width-item variation-toggle';
            toggleBtn.innerHTML = isHidden 
                ? "<span style='cursor:pointer; color:#888; font-size:12px; margin-left: 10px; user-select:none;'>▶ Show Annotations</span>"
                : "<span style='cursor:pointer; color:#888; font-size:12px; margin-left: 10px; user-select:none;'>▼ Hide Annotations</span>";
            
            let annContainer = document.createElement('div');
            annContainer.className = 'annotations-wrapper';
            annContainer.style.display = isHidden ? 'none' : 'block';

            toggleBtn.onclick = (e) => {
                e.stopPropagation();
                // Save state to the node so it survives redraws!
                mainChild.isCollapsed = !mainChild.isCollapsed;
                const hidden = mainChild.isCollapsed;
                
                annContainer.style.display = hidden ? 'none' : 'block';
                toggleBtn.innerHTML = hidden 
                    ? "<span style='cursor:pointer; color:#888; font-size:12px; margin-left: 10px; user-select:none;'>▶ Show Annotations</span>"
                    : "<span style='cursor:pointer; color:#888; font-size:12px; margin-left: 10px; user-select:none;'>▼ Hide Annotations</span>";
            };
            
            container.appendChild(toggleBtn);
            container.appendChild(annContainer);

            // 1. Insert Comment
            if (hasComment) {
                let commentDiv = document.createElement('div');
                commentDiv.className ='full-width-item';
                let commentSpan = document.createElement('span');
                commentSpan.className ='inline-comment';
                commentSpan.dataset.nodeId = mainChild.id; // 🔥 INJECT ID
                commentSpan.innerText = cleanComment;
                commentDiv.appendChild(commentSpan);
                annContainer.appendChild(commentDiv);
            }

            // 2. Insert Variations
            if (hasVariations) {
                node.children.forEach((child, i) => {
                    if (i !== activeIdx) {
                        let varBlock = document.createElement('div');
                        varBlock.className ='variation-block';
                        varBlock.style.cssText = "margin-left: 15px; border-left: 2px solid #444; padding-left: 5px; margin-bottom: 5px;";
                        
                        let line = document.createElement('div');
                        line.className ='var-line';
                        this.renderVariationLine(child, line);
                        varBlock.appendChild(line);
                        annContainer.appendChild(varBlock);
                    }
                });
            }
        }

        // --- Continue Main Line ---
        this.renderTreeRecursive(mainChild, container, moveNum + 1);
    }
renderVariationLine(node, container) {
        let curr = node;
        let isFirst = true;

        while (curr) {
            let ply = this.getPly(curr);
            let mn = Math.ceil(ply / 2);
            let txt = (ply % 2 !== 0) ? `${mn}.` : (isFirst ? `${mn}...` : ``);

            let span = document.createElement('span');
            span.className = `var-move ${curr === window.game.currentNode ? 'active' : ''}`;
            if (!curr.id) curr.id = 'n_' + Math.random().toString(36).substr(2, 9);
            span.dataset.id = curr.id;
            span.innerText = `${txt} ${curr.moveSan}`;

            // NAG
            if (curr.nag) {
                let nags = curr.nag.toString().split(',');
                let primaryInfo = null;
                let symbols = [];

                nags.forEach(n => {
                    const info = this.getNagInfo(n.trim());
                    if (info) {
                        symbols.push(info);
                        if (['good', 'mistake', 'brilliant', 'blunder', 'interesting', 'inaccuracy'].includes(info.type)) {
                            primaryInfo = info;
                        }
                    }
                });

                if (primaryInfo) {
                    span.style.color = primaryInfo.color;
                    span.style.backgroundColor = primaryInfo.color + '20';
                }
                
                symbols.forEach(info => {
                    let nagSpan = document.createElement('span');
                    nagSpan.className = 'nag-glyph';
                    nagSpan.innerText = info.symbol;
                    nagSpan.style.color = info.color;
                    nagSpan.style.marginLeft = "2px";
                    nagSpan.style.fontWeight = "bold";
                    span.appendChild(nagSpan);
                });
            }

            // EVAL
            const evalData = this.getEvalData(curr);
            if (evalData) {
                let evSpan = document.createElement('span');
                evSpan.className = evalData.className;
                evSpan.style.fontSize = "0.85em";
                evSpan.style.marginLeft = "3px";
                evSpan.innerText = evalData.text;
                span.appendChild(evSpan);
            }

            span.appendChild(document.createTextNode(" "));

            // Handlers (Captured Variable safely freezes 'curr')
            let captured = curr;
            span.onmousedown = (e) => {
                if (e.button !== 0) return;

                e.preventDefault(); 
                e.stopPropagation();
                
                window.game.currentNode = captured; 
                window.game.loadFEN(captured.fen);
                window.game.syncMoveHistory();
                window.ui.renderBoard(false); 
                window.ui.updateHistory(); 
                window.ui.renderArrows();
                
                if (window.game.updateStockfish && !window.game.isPlayingLiveGame) {
                    window.game.updateStockfish();
                }
            };
            span.oncontextmenu = (e) => { e.preventDefault(); this.showAnnotationPopup(e, captured); };

            container.appendChild(span);

            // --- STANDARD VIEW: INLINE ANNOTATIONS TOGGLE ---
            let cleanComment = curr.comment ? curr.comment.replace(/\[%(cal|csl|clk|emt)[^\]]+\]/g, "").trim() : "";
            let hasComment = cleanComment.length > 0;
            let hasVariations = curr.children.length > 1;

            if (hasComment || hasVariations) {
                let isHidden = captured.isCollapsed === true;

                let toggleBtn = document.createElement('span');
                toggleBtn.innerText = isHidden ? " [+] " : " [-] ";
                toggleBtn.style.cssText = "cursor:pointer; color:#888; font-weight:bold; font-size:0.9em; user-select:none;";
                
                let annWrapper = document.createElement('span');
                annWrapper.className = 'annotation-wrapper';
                annWrapper.style.display = isHidden ? 'none' : 'inline';
                
                toggleBtn.onclick = (e) => {
                    e.stopPropagation();
                    // FIX: Use 'captured', not 'curr'
                    captured.isCollapsed = !captured.isCollapsed;
                    const hidden = captured.isCollapsed;
                    annWrapper.style.display = hidden ? 'none' : 'inline';
                    toggleBtn.innerText = hidden ? " [+] " : " [-] ";
                };
                
                container.appendChild(toggleBtn);
                container.appendChild(annWrapper);

                if (hasComment) {
                    let cSpan = document.createElement('span');
                    cSpan.className = 'inline-comment';
                    cSpan.dataset.nodeId = captured.id; // 🔥 INJECT ID
                    cSpan.innerText = ` {${cleanComment}} `;
                    annWrapper.appendChild(cSpan);
                }

                if (hasVariations) {
                    if (hasComment) annWrapper.appendChild(document.createTextNode(" "));
                    annWrapper.appendChild(document.createTextNode("("));
                    
                    curr.children.forEach((child, i) => {
                        if (i !== curr.selectedChildIndex) {
                            this.renderVariationLine(child, annWrapper);
                            if (i < curr.children.length - 1) annWrapper.appendChild(document.createTextNode("; "));
                        }
                    });
                    
                    annWrapper.appendChild(document.createTextNode(") "));
                }
            }

            if (curr.children.length > 0) curr = curr.children[curr.selectedChildIndex];
            else curr = null;
            isFirst = false;
        }
    }
renderTreeVertical(node, container) {
        if (!node.children.length) return;

        let line = document.createElement('div');
        line.className = 'tree-line';
        container.appendChild(line);

        let curr = node.children[node.selectedChildIndex];
        let isFirstInLine = true;

        while (curr) {
            let ply = this.getPly(curr);
            let mNum = Math.ceil(ply / 2);
            let moveText = "";

            if (ply % 2 !== 0) moveText = `${mNum}.`;
            else if (isFirstInLine) moveText = `${mNum}...`;

            if (moveText) {
                let idxSpan = document.createElement('span');
                idxSpan.className = 'tree-index';
                idxSpan.innerText = moveText;
                line.appendChild(idxSpan);
            }

            let moveSpan = document.createElement('span');
            moveSpan.className = `tree-move ${curr === window.game.currentNode ? 'active' : ''}`;
            if (!curr.id) curr.id = 'n_' + Math.random().toString(36).substr(2, 9);
            moveSpan.dataset.id = curr.id;

            if (curr.nag) {
                let nags = curr.nag.toString().split(',');
                let primaryInfo = null;
                let symbols = [];

                nags.forEach(n => {
                    const info = this.getNagInfo(n.trim());
                    if (info) {
                        symbols.push(info);
                        if (['good', 'mistake', 'brilliant', 'blunder', 'interesting', 'inaccuracy'].includes(info.type)) {
                            primaryInfo = info;
                        }
                    }
                });

                if (primaryInfo) {
                    moveSpan.classList.add(`nag-${primaryInfo.type}`);
                    moveSpan.style.color = primaryInfo.color;
                }
                
                moveSpan.innerText = curr.moveSan; 
                
                symbols.forEach(info => {
                    let nagSpan = document.createElement('span');
                    nagSpan.className = 'nag-glyph';
                    nagSpan.innerText = info.symbol;
                    nagSpan.style.color = info.color;
                    nagSpan.style.marginLeft = "2px";
                    nagSpan.style.fontWeight = "bold";
                    moveSpan.appendChild(nagSpan);
                });
            } else {
                moveSpan.innerText = curr.moveSan;
            }

            moveSpan.innerText = curr.moveSan + (curr.nag ? this.getNagInfo(curr.nag).symbol : "");

            // Book Icon
            if (curr.isBook) {
                const bookIcon = document.createElement('span');
                bookIcon.className = 'tree-book-icon';
                bookIcon.innerHTML = typeof ICON_BOOK_SVG !== 'undefined' ? ICON_BOOK_SVG : '📖';
                let bookColor = curr.nag ? (this.getNagInfo(curr.nag)?.color || '#A87C53') : '#A87C53';
                bookIcon.style.cssText = `display:inline-flex; align-items:center; justify-content:center; width:1em; height:1em; margin-left:4px; vertical-align:middle; color:${bookColor};`;
                let svg = bookIcon.querySelector('svg');
                if (svg) { svg.style.fill = 'currentColor'; svg.style.width = '100%'; svg.style.height = '100%'; }
                moveSpan.appendChild(bookIcon);
            }

            // Dots & Eval
            if ((curr.arrows && curr.arrows.length > 0) || (curr.circles && curr.circles.length > 0)) {
                let dot = document.createElement('span');
                dot.style.cssText = "display:inline-block; width:6px; height:6px; background-color:#00b023; border-radius:50%; margin-left:4px; box-shadow:0 0 5px #00b023;";
                moveSpan.appendChild(dot);
            }
            const evalData = this.getEvalData(curr);
            if (evalData) {
                let evalSpan = document.createElement('span');
                evalSpan.className = evalData.className;
                evalSpan.innerText = evalData.text;
                moveSpan.appendChild(evalSpan);
            }

            let captured = curr;
            moveSpan.onmousedown = (e) => {
                if (e.button !== 0) return;

                e.preventDefault(); 
                e.stopPropagation();
                
                window.game.currentNode = captured; 
                window.game.loadFEN(captured.fen);
                window.game.syncMoveHistory();
                window.ui.renderBoard(false); 
                window.ui.updateHistory(); 
                window.ui.renderArrows();
                
                if (window.game.updateStockfish && !window.game.isPlayingLiveGame) {
                    window.game.updateStockfish();
                }
            };
            moveSpan.oncontextmenu = (e) => { e.preventDefault(); this.showAnnotationPopup(e, captured); };

            line.appendChild(moveSpan);
            isFirstInLine = false;

            // --- TREE VIEW: ANNOTATIONS TOGGLE (MAIN TRUNK) ---
            let cleanComment = curr.comment ? curr.comment.replace(/\[%(cal|csl|clk|emt)[^\]]+\]/g, "").trim() : "";
            let hasComment = cleanComment.length > 0;
            let siblings = curr.parent.children;
            let hasVariations = siblings.length > 1;

            if (hasComment || hasVariations) {
                let isHidden = captured.isCollapsed === true;

                let toggleBtn = document.createElement('span');
                toggleBtn.innerHTML = isHidden ? " ▶ " : " ▼ ";
                toggleBtn.style.cssText = "cursor:pointer; color:#888; font-size:10px; margin-left:6px; user-select:none;";
                
                let annContainer = document.createElement('div');
                annContainer.className = 'nested-variation';
                annContainer.style.display = isHidden ? 'none' : 'block';
                
                toggleBtn.onclick = (e) => {
                    e.stopPropagation();
                    // FIX: Use 'captured'
                    captured.isCollapsed = !captured.isCollapsed;
                    const hidden = captured.isCollapsed;
                    annContainer.style.display = hidden ? 'none' : 'block';
                    toggleBtn.innerHTML = hidden ? " ▶ " : " ▼ ";
                };
                
                line.appendChild(toggleBtn);

                if (hasComment) {
                    let cSpan = document.createElement('span');
                    cSpan.className = 'tree-comment';
                    cSpan.dataset.nodeId = captured.id; // 🔥 INJECT ID
                    cSpan.style.display = 'block';
                    cSpan.style.marginTop = '2px';
                    cSpan.innerText = `// ${cleanComment}`;
                    annContainer.appendChild(cSpan);
                }

                if (hasVariations) {
                    siblings.forEach((sibling) => {
                        if (sibling !== curr) this.renderTreeVerticalRecursiveSingle(sibling, annContainer);
                    });
                }

                container.appendChild(annContainer);
                
                line = document.createElement('div');
                line.className = 'tree-line';
                container.appendChild(line);
                isFirstInLine = true;
            }

            if (curr.children.length > 0) curr = curr.children[curr.selectedChildIndex];
            else curr = null;
        }
    }
renderTreeVerticalRecursiveSingle(node, container) {
        let line = document.createElement('div');
        line.className = 'tree-line';
        container.appendChild(line);

        let curr = node;
        let isFirstInLine = true;

        while (curr) {
            let ply = this.getPly(curr);
            let mNum = Math.ceil(ply / 2);
            let moveText = "";

            if (ply % 2 !== 0) moveText = `${mNum}.`;
            else if (isFirstInLine) moveText = `${mNum}...`;

            if (moveText) {
                let idxSpan = document.createElement('span');
                idxSpan.className = 'tree-index';
                idxSpan.innerText = moveText;
                line.appendChild(idxSpan);
            }

            let moveSpan = document.createElement('span');
            moveSpan.className = `tree-move ${curr === window.game.currentNode ? 'active' : ''}`;
            if (!curr.id) curr.id = 'n_' + Math.random().toString(36).substr(2, 9);
            moveSpan.dataset.id = curr.id;
            if (curr.nag) {
                let nags = curr.nag.toString().split(',');
                let primaryInfo = null;
                let symbols = [];

                nags.forEach(n => {
                    const info = this.getNagInfo(n.trim());
                    if (info) {
                        symbols.push(info);
                        if (['good', 'mistake', 'brilliant', 'blunder', 'interesting', 'inaccuracy'].includes(info.type)) {
                            primaryInfo = info;
                        }
                    }
                });

                if (primaryInfo) {
                    moveSpan.classList.add(`nag-${primaryInfo.type}`);
                    moveSpan.style.color = primaryInfo.color;
                }
                
                moveSpan.innerText = curr.moveSan; 
                
                symbols.forEach(info => {
                    let nagSpan = document.createElement('span');
                    nagSpan.className = 'nag-glyph';
                    nagSpan.innerText = info.symbol;
                    nagSpan.style.color = info.color;
                    nagSpan.style.marginLeft = "2px";
                    nagSpan.style.fontWeight = "bold";
                    moveSpan.appendChild(nagSpan);
                });
            } else {
                moveSpan.innerText = curr.moveSan;
            }

            moveSpan.innerText = curr.moveSan + (curr.nag ? this.getNagInfo(curr.nag).symbol : "");

            // Book Icon & Eval
            if (curr.isBook) {
                const bookIcon = document.createElement('span');
                bookIcon.className = 'tree-book-icon';
                bookIcon.innerHTML = typeof ICON_BOOK_SVG !== 'undefined' ? ICON_BOOK_SVG : '📖';
                let bookColor = curr.nag ? (this.getNagInfo(curr.nag)?.color || '#A87C53') : '#A87C53';
                bookIcon.style.cssText = `display:inline-flex; align-items:center; justify-content:center; width:1em; height:1em; margin-left:4px; vertical-align:middle; color:${bookColor};`;
                let svg = bookIcon.querySelector('svg');
                if (svg) { svg.style.fill = 'currentColor'; svg.style.width = '100%'; svg.style.height = '100%'; }
                moveSpan.appendChild(bookIcon);
            }
            if ((curr.arrows && curr.arrows.length > 0) || (curr.circles && curr.circles.length > 0)) {
                let dot = document.createElement('span');
                dot.style.cssText = "display:inline-block; width:6px; height:6px; background-color:#00b023; border-radius:50%; margin-left:4px; box-shadow:0 0 5px #00b023;";
                moveSpan.appendChild(dot);
            }
            const evalData = this.getEvalData(curr);
            if (evalData) {
                let evalSpan = document.createElement('span');
                evalSpan.className = evalData.className;
                evalSpan.innerText = evalData.text;
                moveSpan.appendChild(evalSpan);
            }

            let captured = curr;
            moveSpan.onmousedown = (e) => {
                e.preventDefault(); e.stopPropagation();
                window.game.currentNode = captured; 
                window.game.loadFEN(captured.fen);
                window.game.syncMoveHistory();
                window.ui.renderBoard(true); 
                window.ui.updateHistory(); 
                window.ui.renderArrows();
                
                if (window.game.updateStockfish && !window.game.isPlayingLiveGame) {
                    window.game.updateStockfish();
                }
            };
            moveSpan.oncontextmenu = (e) => { e.preventDefault(); this.showAnnotationPopup(e, captured); };

            line.appendChild(moveSpan);
            isFirstInLine = false;

            // --- TREE VIEW: ANNOTATIONS TOGGLE (BRANCH) ---
            let cleanComment = curr.comment ? curr.comment.replace(/\[%(cal|csl|clk|emt)[^\]]+\]/g, "").trim() : "";
            let hasComment = cleanComment.length > 0;
            let hasVariations = curr.children.length > 1;

            if (hasComment || hasVariations) {
                let isHidden = captured.isCollapsed === true;

                let toggleBtn = document.createElement('span');
                toggleBtn.innerHTML = isHidden ? " ▶ " : " ▼ ";
                toggleBtn.style.cssText = "cursor:pointer; color:#888; font-size:10px; margin-left:6px; user-select:none;";
                
                let annContainer = document.createElement('div');
                annContainer.className = 'nested-variation';
                annContainer.style.display = isHidden ? 'none' : 'block';
                
                toggleBtn.onclick = (e) => {
                    e.stopPropagation();
                    // FIX: Use 'captured'
                    captured.isCollapsed = !captured.isCollapsed;
                    const hidden = captured.isCollapsed;
                    annContainer.style.display = hidden ? 'none' : 'block';
                    toggleBtn.innerHTML = hidden ? " ▶ " : " ▼ ";
                };
                
                line.appendChild(toggleBtn);

                if (hasComment) {
                    let cSpan = document.createElement('span');
                    cSpan.className = 'tree-comment';
                    cSpan.dataset.nodeId = captured.id; // 🔥 INJECT ID
                    cSpan.style.display = 'block';
                    cSpan.style.marginTop = '2px';
                    cSpan.innerText = `// ${cleanComment}`;
                    annContainer.appendChild(cSpan);
                }

                if (hasVariations) {
                    curr.children.forEach((child, i) => {
                        if (i !== curr.selectedChildIndex) {
                            this.renderTreeVerticalRecursiveSingle(child, annContainer);
                        }
                    });
                }

                container.appendChild(annContainer);
                
                line = document.createElement('div');
                line.className = 'tree-line';
                container.appendChild(line);
                isFirstInLine = true;
            }

            if (curr.children.length > 0) curr = curr.children[curr.selectedChildIndex];
            else curr = null;
        }
    }
createPlyDiv(node) {
        let d = document.createElement('div');
        d.className = `move-ply ${node === window.game.currentNode ?'active':''}`;
        d.style.cssText = "position: relative; display: inline-block;"; 

        let mainWrap = document.createElement('span');

        // 🔥 THE FIX: Loop through ALL nags (e.g. $3 and $18) to get BOTH "!!" and "+-"
        let nags = node.nag ? node.nag.toString().split(',') : [];
        let primaryInfo = null;
        let symbols = [];

        nags.forEach(n => {
            const info = this.getNagInfo(n.trim());
            if (info) {
                symbols.push(info);
                // Color the text based on the move quality (!!, ??), ignoring the eval (+-)
                if (['good', 'mistake', 'brilliant', 'blunder', 'interesting', 'inaccuracy'].includes(info.type)) {
                    primaryInfo = info;
                }
            }
        });

        if (primaryInfo) {
            mainWrap.classList.add(`nag-${primaryInfo.type}`); 
            mainWrap.style.color = primaryInfo.color;
        }
        
        mainWrap.appendChild(document.createTextNode(node.moveSan));
        
        // Print ALL symbols perfectly next to the text
        symbols.forEach(info => {
            let sym = document.createElement('span');
            sym.className = `nag-glyph`; 
            sym.innerText = info.symbol;
            sym.style.color = info.color;
            sym.style.marginLeft = "3px";
            sym.style.fontWeight = "bold";
            mainWrap.appendChild(sym);
        });
        
        const evalData = this.getEvalData(node);
        if (evalData) {
            let evalSpan = document.createElement('span');
            evalSpan.className = evalData.className;
            evalSpan.innerText = evalData.text;
            evalSpan.style.marginLeft = "4px";
            mainWrap.appendChild(evalSpan);
        }
        d.appendChild(mainWrap);

        // --- GRID VIEW: ANNOTATIONS TOGGLE ---
        let cleanComment = node.comment ? node.comment.replace(/\[%(cal|csl|clk|emt)[^\]]+\]/g, "").trim() : "";
        let hasComment = cleanComment.length > 0;
        let hasVariations = node.children && node.children.length > 1;

        if (hasComment || hasVariations) {
            let isHidden = node.isCollapsed === true;

            let toggleBtn = document.createElement('span');
            toggleBtn.innerHTML = isHidden ? " ▶ " : " ▼ ";
            toggleBtn.style.cssText = "cursor:pointer; color:#888; font-size:10px; margin-left:4px;";
            
            let annContainer = document.createElement('div');
            annContainer.style.cssText = "font-size: 0.85em; padding: 4px; background: rgba(0,0,0,0.15); border-left: 2px solid #555; margin-top: 4px; white-space: normal;";
            annContainer.style.display = isHidden ? 'none' : 'block';

            toggleBtn.onclick = (e) => {
                e.stopPropagation();
                node.isCollapsed = !node.isCollapsed;
                const hidden = node.isCollapsed;
                annContainer.style.display = hidden ? 'none' : 'block';
                toggleBtn.innerHTML = hidden ? " ▶ " : " ▼ ";
            };
            
            d.appendChild(toggleBtn);
            d.appendChild(annContainer);

       if (hasComment) {
                let c = document.createElement('div');
                c.className = 'inline-comment'; 
                c.dataset.nodeId = node.id;     
                c.style.color = '#888';
                c.style.marginBottom = hasVariations ? '4px' : '0';
                c.innerText = `{ ${cleanComment} }`;
                annContainer.appendChild(c);
            }

            if (hasVariations) {
                node.children.forEach((child, i) => {
                    if (i !== node.selectedChildIndex) {
                        let vLine = document.createElement('div');
                        this.renderVariationLine(child, vLine);
                        annContainer.appendChild(vLine);
                    }
                });
            }
        }

        d.onclick = (e) => {
            e.stopPropagation();
            window.game.currentNode = node;
            window.game.loadFEN(node.fen);
            window.game.syncMoveHistory(); 
            window.ui.renderBoard(false); 
            window.ui.updateHistory();
            window.ui.renderArrows();
            
            if (window.game.updateStockfish && !window.game.isPlayingLiveGame) {
                window.game.updateStockfish();
            }
        };
        d.oncontextmenu = (e) => {
            e.preventDefault();
            this.showAnnotationPopup(e, node);
        };
        return d;
    }
updateEvalBar(type, val) {
        const bar = document.getElementById('evalBarFill');
        const text = document.getElementById('evalScore');
        
        // 1. Hard Checkmate (1-0 / 0-1)
        if (window.game.engine.in_checkmate()) {
            const winner = (window.game.turn === 'w') ? "0-1" : "1-0";
            const percent = (window.game.turn === 'w') ? 0 : 100;
            if (text) text.innerText = winner;
            if (bar) bar.style.height = `${percent}%`;
            return; 
        }

        // 2. Draws & Stalemate (1/2 - 1/2)
        // [FIX] Safely check if in_threefold_repetition exists before calling it!
        const isDraw = window.game.engine.in_draw() || 
                       window.game.engine.in_stalemate() || 
                       (typeof window.game.engine.in_threefold_repetition === 'function' && window.game.engine.in_threefold_repetition());

        if (isDraw) {
            if (text) text.innerText = "½-½";
            if (bar) bar.style.height = "50%";
            return;
        }

        // 3. Normal Evaluation
        let display = "0.00";
        let percent = 50;
        
        if (type === 'mate') {
            display = "M" + Math.abs(val);
            percent = val > 0 ? 100 : 0;
        } else {
            const evalFloat = val / 100;
            display = (evalFloat > 0 ? "+" : "") + evalFloat.toFixed(2);
            // Cap between -5 and +5 for the visual bar height
            const clamped = Math.max(-5, Math.min(5, evalFloat));
            percent = 50 + (clamped * 10);
        }
        
        if (text) text.innerText = display;
        if (bar) bar.style.height = `${percent}%`;
    }
showNotification(message, title ="System Message", icon ="ℹ️") {
const modal = document.getElementById('notificationModal');
const titleEl = document.getElementById('notifTitle');
const msgEl = document.getElementById('notifMessage');
const iconEl = document.getElementById('notifIcon');
if (modal &&titleEl &&msgEl) {
titleEl.innerText = title;
msgEl.innerText = message;
iconEl.innerHTML = icon;
const content = modal.querySelector('.modal-content');
content.style.animation ='none';
content.offsetHeight;
content.style.animation ='modalPop 0.2s ease-out forwards';
modal.style.display ='flex';
} 
else {
alert(message);
}
}
hideNotification() {
const modal = document.getElementById('notificationModal');
if (modal) modal.style.display ='none';
}
showAnnotationPopup(e, node) {
        if (window.game && window.game.isPlayingLiveGame) return;
        let existing = document.getElementById('annotationPopup');
        if (existing) existing.remove();

        let popup = document.createElement('div');
        popup.id = 'annotationPopup';
        popup.className = 'annotation-popup';
        popup.style.position = 'absolute';
        popup.style.left = e.pageX + 'px';
        popup.style.top = e.pageY + 'px';
        popup.style.zIndex = '1000';
        popup.style.background = '#252525';
        popup.style.border = '1px solid #444';
        popup.style.padding = '8px 0'; 
        popup.style.borderRadius = '6px';
        popup.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
        popup.style.display = 'flex';
        popup.style.flexDirection = 'column';
        popup.style.minWidth = '200px';
        popup.style.fontFamily = 'sans-serif';

        // 🔥 THE FIX: Supercharged forceRedraw that completely wipes the HTML cache!
        const forceRedraw = () => {
            this._lastTreeSize = -1;
            this._lastChartedFen = null;
            
            const historyBox = document.getElementById('moveHistory');
            if (historyBox) historyBox.innerHTML = ''; // Force HTML recreation
            
            if (this.updateHistory) this.updateHistory(true);
            if (typeof this.renderCharts === 'function') this.renderCharts();
            if (this.renderBoard) this.renderBoard(true);
            if (window.game && window.game.updateStockfish) window.game.updateStockfish();
        };

        // --- SECTION 1: NAG GRIDS ---
        let nagContainer = document.createElement('div');
        nagContainer.style.padding = '0 8px';
        nagContainer.style.display = 'flex';
        nagContainer.style.flexDirection = 'column';
        nagContainer.style.gap = '8px';

        const cat1 = [
            {val:'$3', sym:'!!', c:'#26c2a3'}, {val:'$1', sym:'!', c:'#5c8bb0'}, {val:'$5', sym:'!?', c:'#b369f2'},
            {val:'$6', sym:'?!', c:'#f7c045'}, {val:'$2', sym:'?', c:'#ffa700'}, {val:'$4', sym:'??', c:'#fa412d'}
        ];
        
        const cat2 = [
            {val:'$10', sym:'='}, {val:'$13', sym:'∞'}, {val:'$14', sym:'⩲'}, {val:'$15', sym:'⩱'},
            {val:'$16', sym:'±'}, {val:'$17', sym:'∓'}, {val:'$18', sym:'+-'}, {val:'$19', sym:'-+'}
        ];

        let currentNags = node.nag ? node.nag.toString().split(',').map(n=>n.trim()) : [];

        const createRow = (items, categoryList, cols) => {
            let row = document.createElement('div');
            row.style.display = 'grid';
            row.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
            row.style.gap = '4px';
            
            items.forEach(item => {
                let btn = document.createElement('button');
                let isActive = currentNags.includes(item.val) || currentNags.includes(item.sym);
                btn.innerText = item.sym;
                btn.style.cssText = `
                    background: ${isActive ? '#555' : 'transparent'};
                    color: ${item.c || '#ccc'};
                    border: 1px solid ${isActive ? '#888' : '#444'};
                    border-radius: 4px; padding: 4px 0; font-weight: bold; cursor: pointer;
                    transition: all 0.1s;
                `;
                
                btn.onmouseenter = () => { if (!isActive) btn.style.background = 'rgba(255,255,255,0.1)'; };
                btn.onmouseleave = () => { if (!isActive) btn.style.background = 'transparent'; };

                btn.onclick = (ev) => {
                    ev.stopPropagation();
                    currentNags = currentNags.filter(n => !categoryList.some(c => c.val === n || c.sym === n));
                    if (!isActive) currentNags.push(item.val);
                    
                    node.nag = currentNags.join(',');
                    if (node.nag === '') node.nag = null;
                    
                    forceRedraw(); 
                    popup.remove();
                };
                row.appendChild(btn);
            });
            return row;
        };

        nagContainer.appendChild(createRow(cat1, cat1, 3));
        
        let divider1 = document.createElement('div');
        divider1.style.borderBottom = '1px solid #444';
        nagContainer.appendChild(divider1);
        
        nagContainer.appendChild(createRow(cat2, cat2, 4));
        popup.appendChild(nagContainer);
    
        let dividerBook = document.createElement('div');
        dividerBook.style.borderBottom = '1px solid #444';
        dividerBook.style.margin = '8px 0';
        popup.appendChild(dividerBook);
    
        let bookContainer = document.createElement('div');
        bookContainer.style.padding = '0 8px';
        
        let isBook = !!node.isBook;
        let bookBtn = document.createElement('button');
        bookBtn.style.cssText = `
            width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
            background: ${isBook ? 'rgba(6, 182, 212, 0.15)' : 'transparent'};
            color: ${isBook ? '#22d3ee' : '#aaa'}; border: 1px solid ${isBook ? '#22d3ee' : '#444'};
            border-radius: 4px; padding: 6px; cursor: pointer; font-size: 13px; font-weight: bold;`;
        bookBtn.innerHTML = `<span style="width:16px; height:16px; display:block;">${typeof ICON_BOOK_SVG_IMG_BLUE !== 'undefined' ? ICON_BOOK_SVG_IMG_BLUE : '📖'}</span> <span>${isBook ? 'Book Move' : 'Mark as Book'}</span>`;
        
        bookBtn.onclick = (ev) => {
            ev.stopPropagation();
            node.isBook = !node.isBook;
            forceRedraw(); 
            popup.remove();
        };
        bookContainer.appendChild(bookBtn);
        popup.appendChild(bookContainer);
    
        let divider2 = document.createElement('div');
        divider2.style.borderBottom = '1px solid #444';
        divider2.style.margin = '8px 0';
        popup.appendChild(divider2);
        
        // --- SECTION 2: PGN TEXT ACTIONS ---
        let actionsContainer = document.createElement('div');
        actionsContainer.style.display = 'flex';
        actionsContainer.style.flexDirection = 'column';

        const createActionBtn = (icon, text, onClick, isDanger = false) => {
            let item = document.createElement('div');
            item.style.cssText = `
                padding: 8px 16px; cursor: pointer; font-size: 13px; color: ${isDanger ? '#fa412d' : '#ddd'};
                display: flex; align-items: center; gap: 8px; transition: background 0.15s; user-select: none;
            `;
            item.innerHTML = `<span>${icon}</span> <span>${text}</span>`;
            
            item.onmouseenter = () => item.style.background = isDanger ? 'rgba(250, 65, 45, 0.15)' : 'rgba(255,255,255,0.1)';
            item.onmouseleave = () => item.style.background = 'transparent';
            
            item.onclick = (ev) => {
                ev.stopPropagation();
                onClick();
                popup.remove();
            };
            return item;
        };

        let hasComment = node.comment && node.comment.trim() !== "";
        actionsContainer.appendChild(createActionBtn('💬', hasComment ? 'Edit Comment' : 'Add Comment', () => {
            if (window.game.currentNode !== node) {
                window.game.currentNode = node;
                window.game.loadFEN(node.fen);
                window.game.syncMoveHistory(); 
                if (this.renderBoard) this.renderBoard(false);
                if (this.renderArrows) this.renderArrows();
                forceRedraw(); 
            }

            setTimeout(() => {
                const commentBox = document.getElementById('commentaryBox');
                if (commentBox) {
                    commentBox.style.transition = "box-shadow 0.3s, border-color 0.3s";
                    commentBox.style.boxShadow = "0 0 12px rgba(56, 189, 248, 0.8)";
                    commentBox.style.borderColor = "#38bdf8";
                    
                    setTimeout(() => {
                        commentBox.style.boxShadow = "none";
                        commentBox.style.borderColor = "transparent"; 
                    }, 800);

                    commentBox.focus();
                    if (typeof window.getSelection !== "undefined" && typeof document.createRange !== "undefined") {
                        const range = document.createRange();
                        range.selectNodeContents(commentBox);
                        range.collapse(false);
                        const sel = window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                }
            }, 50);
        }));

        if (hasComment) {
            actionsContainer.appendChild(createActionBtn('🗑️', 'Delete Comment', () => {
                node.comment = "";
                forceRedraw(); 
            }));
        }

        if (node.parent) {
            // 🔥 THE FIX: Route perfectly to the master game logic!
            actionsContainer.appendChild(createActionBtn('⬆️', 'Promote Variation', () => {
                if (window.game) window.game.promoteVariation(node);
                forceRedraw(); 
            }));
            
            // 🔥 THE FIX: Route perfectly to the master game logic!
            actionsContainer.appendChild(createActionBtn('🌟', 'Make Main Line', () => {
                if (window.game) window.game.makeMainline(node);
                forceRedraw(); 
            }));

            actionsContainer.appendChild(createActionBtn('❌', 'Delete from here', () => {
                if (window.game) {
                    window.game.deleteNode(node);
                }
            }, true)); 
        }

        popup.appendChild(actionsContainer);
        document.body.appendChild(popup);

        const rect = popup.getBoundingClientRect();
        if (rect.right > window.innerWidth) popup.style.left = (window.innerWidth - rect.width - 10) + 'px';
        if (rect.bottom > window.innerHeight) popup.style.top = (window.innerHeight - rect.height - 10) + 'px';

        setTimeout(() => {
            document.addEventListener('click', function close(ev) {
                if (!popup.contains(ev.target)) {
                    popup.remove();
                    document.removeEventListener('click', close);
                }
            });
        }, 10);
    }
renderAnalysisLine(index, type, val, moves, startFen) {
        try {
            const box = document.getElementById('engine-lines-box') || document.querySelector('.engine-lines') || document.getElementById('pvBox');
            if (!box) return;
            
            const currentFen = startFen || (window.game && window.game.currentNode ? window.game.currentNode.fen : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");

            let li = document.getElementById(`eng-line-${index}`);
            if (!li) {
                li = document.createElement('div');
                li.id = `eng-line-${index}`;
                li.className = 'engine-line-item';
                
                li.style.display = 'flex';
                li.style.alignItems = 'flex-start';
                li.style.padding = '4px 8px';
                li.style.borderBottom = '1px solid #333';
                li.style.fontFamily = 'monospace';
                li.style.fontSize = '13px';
                
                li.dataset.expanded = 'false'; 
                
                const existing = Array.from(box.children);
                if (existing[index - 1]) box.insertBefore(li, existing[index - 1]);
                else box.appendChild(li);
            }

            const isExpanded = li.dataset.expanded === 'true';

            let scoreColor = val > 0 ? '#26c2a3' : (val < 0 ? '#fa412d' : '#888'); 
            if (type === 'mate') scoreColor = '#b369f2'; 
            
            let scoreTxt = (type === 'cp' ? (val / 100).toFixed(2) : `M${Math.abs(val)}`); 
            if (type === 'cp' && val > 0) scoreTxt = `+${scoreTxt}`;
            if (type === 'mate' && val > 0) scoreTxt = `+M${Math.abs(val)}`; 
            if (type === 'mate' && val < 0) scoreTxt = `-M${Math.abs(val)}`; 

            li.innerHTML = `
                <div class="expand-pv-btn" style="cursor:pointer;; color:#888; flex-shrink:0; font-size:11px; padding-top:2px; user-select:none;" title="Toggle Full Line">${isExpanded ? '▼' : '▶'}</div>
                <div class="line-score" style="color:${scoreColor}; font-weight:bold; min-width:55px; flex-shrink:0;">${scoreTxt}</div>
                <div class="line-moves" style="color:#ccc; line-height:1.5; flex-grow:1; overflow:hidden; ${isExpanded ? 'white-space:normal;' : 'white-space:nowrap; text-overflow:ellipsis;'}"></div>
            `;

            const movesContainer = li.querySelector('.line-moves');
            const expandBtn = li.querySelector('.expand-pv-btn');

            expandBtn.onmousedown = (e) => {
                e.preventDefault(); 
                const currentlyExpanded = li.dataset.expanded === 'true';
                if (!currentlyExpanded) {
                    li.dataset.expanded = 'true';
                    movesContainer.style.whiteSpace = 'normal';
                    expandBtn.innerHTML = '▼'; 
                } else {
                    li.dataset.expanded = 'false';
                    movesContainer.style.whiteSpace = 'nowrap';
                    expandBtn.innerHTML = '▶'; 
                }
            };

            const tempChess = new (typeof Chess === 'function' ? Chess : window.Chess)(currentFen);
            const is960 = window.game ? window.game.isChess960 : false;
            const displayMoves = moves.slice(0, 40); 
            
            let cumulativeMoves = [];
            let validMoveCount = 0; // 🔥 THE FIX: Accurately count valid moves!

            for (let i = 0; i < displayMoves.length; i++) { 
                const uci = displayMoves[i]; 
                
                const turn = tempChess.turn(); 
                const parts = tempChess.fen().split(' ');
                const moveNum = parts[5] || 1; 

                let prefix = "";
                if (turn === 'w') prefix = `${moveNum}. `;
                else if (i === 0) prefix = `${moveNum}... `;

                let moveObj = null;
                
                try {
                    moveObj = tempChess.move(uci, { sloppy: true });
                    
                    if (!moveObj) {
                        const from = uci.substring(0, 2);
                        const to = uci.substring(2, 4);
                        const pPromo = uci.length > 4 ? uci.substring(4, 5) : undefined;
                        
                        if (is960) {
                            const p1 = tempChess.get(from);
                            const p2 = tempChess.get(to);
                            if (p1 && p2 && p1.type === 'k' && p2.type === 'r' && p1.color === p2.color) {
                                let newCastling = parts[2].replace(turn === 'w' ? 'K' : '', '').replace(turn === 'w' ? 'Q' : '', '')
                                                          .replace(turn === 'b' ? 'k' : '', '').replace(turn === 'b' ? 'q' : '', '');
                                if (newCastling === '') newCastling = '-';

                                const isKingside = to.charCodeAt(0) > from.charCodeAt(0);
                                let ranks = parts[0].split('/');
                                let rIdx = turn === 'w' ? 7 : 0;
                                let exp = '';
                                for (let c of ranks[rIdx]) exp += isNaN(c) ? c : ' '.repeat(parseInt(c));
                                exp = exp.split('');
                                exp[from.charCodeAt(0) - 97] = ' ';
                                exp[to.charCodeAt(0) - 97] = ' ';
                                exp[isKingside ? 6 : 2] = turn === 'w' ? 'K' : 'k'; 
                                exp[isKingside ? 5 : 3] = turn === 'w' ? 'R' : 'r'; 
                                
                                let comp = '', empties = 0;
                                for (let char of exp) {
                                    if (char === ' ') empties++;
                                    else { if (empties > 0) { comp += empties; empties = 0; } comp += char; }
                                }
                                if (empties > 0) comp += empties;
                                ranks[rIdx] = comp;
                                parts[0] = ranks.join('/');
                                parts[1] = turn === 'w' ? 'b' : 'w';
                                parts[2] = newCastling;
                                parts[3] = '-';
                                if (turn === 'b') parts[5] = parseInt(parts[5]) + 1;
                                
                                tempChess.load(parts.join(' '));
                                moveObj = { san: isKingside ? 'O-O' : 'O-O-O' };
                            } else {
                                moveObj = tempChess.move({ from, to, promotion: pPromo });
                            }
                        } else {
                            moveObj = tempChess.move({ from, to, promotion: pPromo });
                        }
                    }
                } catch(e) { }

                if (moveObj) {
                    // 🔥 THE FIX: Push ONLY if the move didn't crash!
                    cumulativeMoves.push(uci); 
                    validMoveCount++; 

                    const fenAtMove = tempChess.fen();
                    const seqString = cumulativeMoves.join(',');
                    
                    let span = document.createElement('span');
                    span.className = 'pv-move';
                    span.innerText = prefix + moveObj.san;
                    span.style.cursor = 'pointer';
                    span.style.marginRight = '5px';
                    span.style.display = 'inline-block';
                    
                    span.onmouseenter = (e) => {
                        span.style.color = '#fff';
                        span.style.textDecoration = 'underline';
                        if (window.ui && window.ui.hoverEngineMove) window.ui.hoverEngineMove(fenAtMove, e);
                    };
                    span.onmouseleave = () => {
                        span.style.color = '';
                        span.style.textDecoration = 'none';
                        if (window.ui && window.ui.stopHoverEngineMove) window.ui.stopHoverEngineMove();
                    };
                    span.onclick = (e) => {
                        e.stopPropagation();
                        if (window.game && window.game.playEngineSequence) {
                            window.game.playEngineSequence(seqString, currentFen);
                        }
                    };
                    
                    movesContainer.appendChild(span);
                } else {
                    break; 
                }
            } // End of For Loop

            // 🔥 THE FIX: If no valid moves were appended, hide the entire row so the score isn't left hanging blank!
            if (validMoveCount === 0) {
                li.style.display = 'none';
            } else {
                li.style.display = 'flex';
            }

        } catch (err) {
            console.error("[UI RENDER FATAL ERROR]", err);
        }
    }
hoverEngineMove(fen, e) {
        const popup = document.getElementById('previewPopup');
        const grid = document.getElementById('previewGrid');
        if (!popup || !grid) return;

        // Ensure the popup lives in the raw body coordinate system
        if (popup.parentElement !== document.body) {
            document.body.appendChild(popup);
        }

        const rect = e.target.getBoundingClientRect();
        
        popup.style.position = 'fixed'; 
        popup.style.zIndex = '999999'; 
        popup.style.margin = '0';
        
        // ==========================================================
        // 🔥 THE FIX: DYNAMIC POPUP SCALING
        // ==========================================================
        // If the window is smaller than 1000px wide or 800px tall, start shrinking the popup.
        let scale = Math.min(window.innerWidth / 1000, window.innerHeight / 800);
        
        // Clamp the scale so it never grows larger than 100% (1.0) 
        // and never shrinks smaller than 40% (0.4) so it's still readable.
        scale = Math.min(1.0, Math.max(0.4, scale));

        // Apply the scale from the top-left corner so placement math stays accurate
        popup.style.transformOrigin = 'top left';
        popup.style.transform = `scale(${scale})`;

        // The raw CSS width of the popup is roughly 220px (200px board + 20px padding)
        const rawPopupSize = 220; 
        const scaledSize = rawPopupSize * scale; // The actual physical pixels it takes up now
        
        // Anchor it 10px exactly below the hovered text
        let top = rect.bottom + 10; 
        let left = rect.left; 

        // Collision Detection: Don't bleed off the right edge of the screen
        if (left + scaledSize > window.innerWidth) {
            left = window.innerWidth - scaledSize - 10; 
        }

        // Collision Detection: If hovering near the bottom of the screen, flip it ABOVE the text
        if (top + scaledSize > window.innerHeight) {
            top = rect.top - scaledSize - 10; 
        }
        
        popup.style.top = top + 'px';
        popup.style.left = left + 'px';
        popup.style.display = 'block';
        
        grid.innerHTML = ''; 
        
        const parts = fen.split(' ');
        const rows = parts[0].split('/');
        
        for (let r = 0; r < 8; r++) { 
            let rankStr = rows[r]; 
            let fileIdx = 0; 
            for (let char of rankStr) { 
                if (isNaN(char)) {
                    this.renderPreviewSquare(grid, r, fileIdx, char); 
                    fileIdx++;
                } else {
                    let empties = parseInt(char); 
                    for (let k = 0; k < empties; k++) {
                        this.renderPreviewSquare(grid, r, fileIdx, null);
                        fileIdx++;
                    }
                }
            }
        }
    }
renderPreviewSquare(container, r, c, pieceChar) {
        const isLight = (r + c) % 2 === 0;
        const sq = document.createElement('div');
        sq.className = `preview-square ${isLight ? 'light' : 'dark'}`;
        
        // 🔥 THE FIX 1: Force the square to act as a strict container that centers its contents
        sq.style.position = 'relative';
        sq.style.boxSizing = 'border-box';
        sq.style.display = 'flex';
        sq.style.justifyContent = 'center';
        sq.style.alignItems = 'center';
        sq.style.overflow = 'hidden'; 
        
        const currentTheme = document.getElementById('assetType')?.value;
        const isDisguised = currentTheme === 'disguised';

        // Dynamically clone the exact CSS of the main board
        if (isDisguised) {
            const colorClass = isLight ? 'light' : 'dark';
            const cleanSq = document.querySelector(`.square.${colorClass}:not(.last-move):not(.selected):not(.in-check)`);
            
            if (cleanSq) {
                const comp = window.getComputedStyle(cleanSq);
                sq.style.backgroundColor = comp.backgroundColor;
                
                const bStyle = comp.borderTopStyle;
                if (bStyle && bStyle !== 'none') {
                    sq.style.border = `${comp.borderTopWidth} ${bStyle} ${comp.borderTopColor}`;
                } else {
                    sq.style.border = '1px solid #555'; 
                }
            } else {
                sq.style.backgroundColor = '#2c2c2c'; 
                sq.style.border = '1px solid #555';   
            }
        } else {
            const gridColor = this.currentGridColor || 'transparent';
            sq.style.border = gridColor !== 'transparent' ? `1px solid ${gridColor}` : 'none';
        }
        
        if (pieceChar) {
            const color = (pieceChar === pieceChar.toUpperCase()) ? 'w' : 'b';
            const type = pieceChar.toUpperCase();
            const pHTML = this.getPieceHTML({ color, type });
            
            // Convert raw SVG into a safe <img> tag
            let htmlBuffer = pHTML;
            if (pHTML) {
                const trimmed = pHTML.trim();
                // 🔥 THE FIX 2: Add object-fit:contain and remove all padding/margins on the image
                if (trimmed.startsWith('<svg')) {
                    const encodedSVG = encodeURIComponent(trimmed);
                    htmlBuffer = `<img src="data:image/svg+xml;charset=utf-8,${encodedSVG}" style="width:100%; height:100%; object-fit:contain; display:block; pointer-events:none; margin:0; padding:0;" draggable="false">`;
                } else if (trimmed.startsWith('data:image/') || trimmed.startsWith('http') || trimmed.endsWith('.svg') || trimmed.endsWith('.png')) {
                    htmlBuffer = `<img src="${trimmed}" style="width:100%; height:100%; object-fit:contain; display:block; pointer-events:none; margin:0; padding:0;" draggable="false">`;
                }
            }

            const pDiv = document.createElement('div');
            pDiv.className = 'preview-piece';
            
            // 🔥 THE FIX 3: Lock the piece container perfectly over the square
            pDiv.style.position = 'absolute';
            pDiv.style.top = '0';
            pDiv.style.left = '0';
            pDiv.style.width = '100%';
            pDiv.style.height = '100%';
            pDiv.style.display = 'flex';
            pDiv.style.justifyContent = 'center';
            pDiv.style.alignItems = 'center';
            pDiv.style.transformOrigin = 'center'; // Guarantees 180-deg flips stay in place!
            
            pDiv.innerHTML = htmlBuffer;
            sq.appendChild(pDiv);
        }
        
        container.appendChild(sq);
        
        const grid = document.getElementById('previewGrid');
        if (grid) {
            if (isDisguised) {
                grid.classList.add('theme-disguised');
                
                const mainBoard = document.getElementById('chessBoard');
                if (mainBoard) {
                    const compBoard = window.getComputedStyle(mainBoard);
                    const bbStyle = compBoard.borderTopStyle;
                    if (bbStyle && bbStyle !== 'none') {
                        grid.style.border = `${compBoard.borderTopWidth} ${bbStyle} ${compBoard.borderTopColor}`;
                    }
                }
            } else {
                grid.classList.remove('theme-disguised');
                grid.style.border = ''; 
            }

            if (this.flipped) {
                grid.style.transform = 'rotate(180deg)';
                const pieces = grid.querySelectorAll('.preview-piece');
                pieces.forEach(p => p.style.transform = 'rotate(180deg)');
            } else {
                grid.style.transform = 'none';
                const pieces = grid.querySelectorAll('.preview-piece');
                pieces.forEach(p => p.style.transform = 'none');
            }
        }
    }
stopHoverEngineMove() {
        const popup = document.getElementById('previewPopup');
        if (popup) popup.style.display = 'none';
    }
previewEngineMove(fen) {
        window.game.loadFEN(fen);
        window.game.currentNode = new MoveNode(fen, null);
        window.ui.renderBoard(false);
        window.ui.updateHistory();
        if (window.engineAnalysing) window.game.updateStockfish();
    }
stopHoverEngineMove() {
const popup = document.getElementById('previewPopup');
if (popup) popup.style.display ='none';
}
setNag(nag) {
if (this.contextNode) {
if (this.contextNode.nag == nag) {
this.contextNode.nag = null;
} else {
this.contextNode.nag = nag;
}
this.updateHistory();
this.renderBoard(false); 
}
if (this.annotationPopup) {
this.annotationPopup.style.display ='none';
}
}
getPly(node) {
let c = 0;
if (window.game.pgnHeaders &&window.game.pgnHeaders['FEN']) {
let parts = window.game.pgnHeaders['FEN'].split(' ');
let num = parseInt(parts[5]) || 1;
let turn = parts[1];
c = (num - 1) * 2 + (turn ==='b'? 1 :0);
}
let n = node;
while (n.parent) {
c++;
n = n.parent;
}
return c;
}
promptComment() {
if (window.game.currentNode) {
let c = prompt("Comment:", window.game.currentNode.comment);
if (c !== null) {
window.game.currentNode.comment = c;
this.updateHistory();
}
}
}
deleteNode() {
        let n = this.contextNode;
        if (n && n.parent) {
            // 🔥 THE FIX: Let the master game logic handle it, no manual FEN wiping!
            window.game.deleteNode(n);
        }
        if (this.annotationPopup) {
            this.annotationPopup.style.display = 'none';
        }
    }
updateStatus(msg) {
const box = document.getElementById('commentaryBox');
if (box)
box.innerText = msg;
}
getPieceHTML(piece) {
        if (this.pieceTheme === 'custom' && this.customPieces) {
            const key = piece.color + piece.type.toUpperCase(); // "wP", "bK"
            if (this.customPieces[key]) {
                // Return image tag using the Blob URL
                return `<img src="${this.customPieces[key]}" class="piece-img" style="width:100%; height:100%; display:block; pointer-events:none;" draggable="false">`;
            }
        }
        
        if (typeof PIECE_SETS === 'undefined') return null;
        
        const selector = document.getElementById('assetType');
        
        // 🔥 FIX 1: Trust the dropdown first, then the internal memory , then default
        let setName = selector ? selector.value : 'cburnett';
        
        if (!PIECE_SETS[setName]) {
            setName = 'cburnett';
        }
        
        const set = PIECE_SETS[setName];
        if (!set || !set.pieces) {
            return null;
        }

        const code = piece.color + piece.type.toUpperCase();
        return set.pieces[code] || null;
    }
updateEditorInputs() {
document.getElementById('fenInput').value = window.game.generateFEN();
}
updateEditorState() {
window.game.turn = document.getElementById('editorTurn').value;
window.game.castling.wK = document.getElementById('castling-wK').checked;
window.game.castling.wQ = document.getElementById('castling-wQ').checked;
window.game.castling.bK = document.getElementById('castling-bK').checked;
window.game.castling.bQ = document.getElementById('castling-bQ').checked;
window.game.syncEngineToBoard();
this.updateEditorInputs();
}
processTrashAction(e) {
        // Only run if we are in editor mode and using the trash tool
        if (!window.game || window.game.mode !== 'editor' || this.editorTool !== 'trash') return;
        
        // 🔥 CRITICAL FIX: Only activate on mousedown OR holding left-click (buttons === 1).
        if (e.type === 'mousedown' || (e.type === 'mousemove' && e.buttons === 1)) {
            
            // By unconditionally preventing default here, we completely disable 
            // the browser's native drag-and-drop and text selection that interrupts sweeps!
            e.preventDefault(); 
            e.stopPropagation();

            const idx = this.getSquareFromCoords(e.clientX, e.clientY);
            if (idx === -1) return; // Mouse is outside the board

            // If there is a piece on this square, obliterate it!
            if (window.game.board[idx] !== null) {
                window.game.board[idx] = null; 
                
                // 1. Sync internal engine to visual board
                window.game.syncEngineToBoard(); 
                
                // 2. Generate the new FEN and update the game tree
                const newFen = window.game.generateFEN();
                window.game.pgnHeaders = { "FEN": newFen, "SetUp": "1" };
                window.game.rootNode.fen = newFen;
                window.game.currentNode.fen = newFen;
                
                // 3. Update the UI and FEN Input Box instantly
                this.renderBoard(false);       
                const fenBox = document.getElementById('fenInput');
                if (fenBox) fenBox.value = newFen;
                
                // 4. Update the engine evaluation inline
                if (window.engineAnalysing) window.game.updateStockfish();
            }
        }
    }
editorClear() {
        window.game.board = Array(64).fill(null);
        window.game.syncEngineToBoard(); 
        this.renderBoard(false);
        this.updateEditorInputs();
    }
editorReset() {
        this.animateToStartPosition(INITIAL_FEN, () => {
            // 1. Update Game Logic
            window.game.loadFEN(INITIAL_FEN);

            // [FIX] CLEAR HIGHLIGHTS (Last Move & Selection)
            window.game.lastMove = null; 
            this.selectedSq = null;
            this.legalMoves = [];

            // 2. Reset Editor Inputs
            if (document.getElementById('editorCastlingW')) document.getElementById('editorCastlingW').value = "KQ";
            if (document.getElementById('editorCastlingB')) document.getElementById('editorCastlingB').value = "kq";
            if (document.getElementById('editorEpSquare')) document.getElementById('editorEpSquare').value = "-";
            if (document.getElementById('editorHalfMove')) document.getElementById('editorHalfMove').value = "0";
            if (document.getElementById('editorFullMove')) document.getElementById('editorFullMove').value = "1";
            
            this.editorTurn = 'w';
            window.game.syncEngineToBoard();

            // 3. Force Render to Clean Board (Removes colored squares)
            this.renderBoard(false); 
            
            this.updateStatus("Editor Reset to Start Position");
        });
    }
finishEditor() {
        const startFen = typeof window.game.generateFEN === 'function' ? window.game.generateFEN() : window.game.engine.fen();
        const validation = window.game.engine.validate_fen(startFen);
        
        if (!validation.valid) {
            if (typeof this.showNotification === 'function') {
                this.showNotification("Illegal Position", validation.error, "⚠️");
            }
            return; 
        }

        // 1. Force the engine to stop thinking FIRST before we manipulate the board
        if (window.game.stopEngine) window.game.stopEngine();
        if (window.sfWorker) window.sfWorker.postMessage('stop');

        // 2. Switch to the Play tab BEFORE setting up the game state.
        // This ensures the UI's automatic tab-restore logic fires first, so we can safely overwrite it.
        this.switchTab('play');

        // 3. Prepare the engine and move tree with the custom position
        window.game.loadFEN(startFen);
        window.game.rootNode = new MoveNode(startFen, null);
        window.game.currentNode = window.game.rootNode;
        window.game.moveList = [];
        window.game.history = [startFen];
        window.game.pgnHeaders = { "FEN": startFen, "SetUp": "1" };
        window.game.gameOver = true; // Keep it frozen until the user selects an opponent
        
        // 4. Clear old metadata and player info
        this.displayMetadata({}); 
        this.playerInfo = {
            w: { name: "White", meta: "", country: null },
            b: { name: "Black", meta: "", country: null }
        };

        // 5. Update the visual UI with the new FEN
        if (typeof this.renderHeaders === 'function') this.renderHeaders();
        if (typeof this.renderBoard === 'function') this.renderBoard(false);
        if (typeof this.updateHistory === 'function') this.updateHistory(true);
        if (typeof this.clearArrows === 'function') this.clearArrows();
        
        // 6. Pop up the setup modal
        setTimeout(() => {
            const setupModal = document.getElementById('continueSetupModal');
            if (setupModal) {
                setupModal.style.display = 'flex'; 
            }
        }, 100);
    }
setPresetTheme(lightHex, darkHex, btnElement = null, accentColor = '#38bdf8', gridColor = 'transparent', pieceSet = null, appBg = null) {
        const lightInput = document.getElementById('colorLight');
        const darkInput = document.getElementById('colorDark');
        
        if (lightInput) lightInput.value = lightHex;
        if (darkInput) darkInput.value = darkHex;
        
        this.currentGridColor = gridColor;
        this.currentAccentColor = accentColor; 
        this.currentAppBg = appBg; // 🔥 NEW: Save the background
        
        if (pieceSet) {
            this.pieceTheme = pieceSet; 
            const pieceSelect = document.getElementById('assetType');
            if (pieceSelect) pieceSelect.value = pieceSet;
        }
        
        // Save to cache including the new background
        const themeData = { lightHex, darkHex, accentColor, gridColor, pieceSet, appBg };
        localStorage.setItem('chessThemeCache', JSON.stringify(themeData));

        this.updateTheme(); 

        if (pieceSet) {
            this.updatePieceImagesSafe(pieceSet);
            if (typeof this.updateBotMenuPreviews === 'function') this.updateBotMenuPreviews();
            if (typeof this.initEditorBars === 'function') this.initEditorBars();
        }

        // Highlight the clicked button without crashing
        if (btnElement && btnElement.classList) {
            document.querySelectorAll('.theme-preset').forEach(el => {
                el.classList.remove('active');
                el.style.borderColor = '#333';
                el.style.color = '#bababa';
            });
            btnElement.classList.add('active');
            btnElement.style.borderColor = accentColor;
            btnElement.style.color = accentColor;
        } else {
            // Restore active state visually from cache
            document.querySelectorAll('.theme-preset').forEach(el => {
                el.classList.remove('active');
                el.style.borderColor = '#333';
                el.style.color = '#bababa';
                
                const clickText = el.getAttribute('onclick') || '';
                if (clickText.includes(lightHex) && (pieceSet === null || clickText.includes(pieceSet))) {
                    el.classList.add('active');
                    el.style.borderColor = accentColor;
                    el.style.color = accentColor;
                }
            });
        }
    }
updateTheme() {
        const light = document.getElementById('colorLight').value;
        const dark = document.getElementById('colorDark').value;
        const root = document.documentElement;

        root.style.setProperty('--board-light', light);
        root.style.setProperty('--board-dark', dark);

        const accent = this.currentAccentColor || '#38bdf8';
        root.style.setProperty('--theme-accent', accent);

        const gridColor = this.currentGridColor || 'transparent';
        document.querySelectorAll('.square').forEach(sq => {
            sq.style.border = gridColor !== 'transparent' ? `1px solid ${gridColor}` : 'none';
            sq.style.boxSizing = 'border-box';
        });

        const board = document.getElementById('chessBoard');
        if (board && gridColor !== 'transparent') {
            board.style.border = `4px solid ${gridColor}`;
        } else if (board) {
            board.style.border = `5px solid #222`;
        }

        // 🔥 NEW: Apply the dynamic background while keeping your custom noise texture!
        const noiseText = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E")`;
        
        // Default to your original base.css background if none is specified
        const bgGradient = this.currentAppBg || `radial-gradient(circle at 50% 0%, #1e3a4c 0%, #0f172a 60%, #020617 100%)`;
        
        document.body.style.background = `${noiseText}, ${bgGradient}`;
        document.body.style.backgroundAttachment = 'fixed';
        document.body.style.backgroundSize = 'cover';
    }
updatePieceImagesSafe(pieceSet) {
        if (!PIECE_SETS || !PIECE_SETS[pieceSet] || !PIECE_SETS[pieceSet].pieces) return;

        const pieces = document.querySelectorAll('.piece');
        
        pieces.forEach(pieceEl => {
            const pieceId = pieceEl.dataset.id;
            
            // 🔥 FIX 2: Look up the exact piece in the game memory using its ID!
            let pieceObj = null;
            if (window.game && window.game.board) {
                pieceObj = window.game.board.find(p => p && p.id == pieceId);
            }
            
            if (pieceObj) {
                const pieceType = pieceObj.color + pieceObj.type.toUpperCase(); // Creates 'wP', 'bK', etc.

                if (PIECE_SETS[pieceSet].pieces[pieceType]) {
                    const rawSVG = PIECE_SETS[pieceSet].pieces[pieceType];
                    let htmlBuffer = rawSVG;
                    
                    // Encode the SVG exactly the same way renderBoard() does to prevent visual glitches!
                    if (rawSVG) {
                        const trimmed = rawSVG.trim();
                        if (trimmed.startsWith('<svg')) {
                            const encodedSVG = encodeURIComponent(trimmed);
                            htmlBuffer = `<img src="data:image/svg+xml;charset=utf-8,${encodedSVG}" class="piece-img" style="width:100%; height:100%; display:block; pointer-events:none;" draggable="false">`;
                        }
                    }

                    // Preserve any evaluation badges (like !! or ??) attached to the piece!
                    const nagIndicator = pieceEl.querySelector('.nag-indicator');
                    
                    pieceEl.innerHTML = htmlBuffer;
                    
                    if (nagIndicator) {
                        pieceEl.appendChild(nagIndicator);
                    }
                }
            }
        });
    }
setBackground(input) {
if (input.files &&input.files[0]) {
const btnSpan = input.parentElement.querySelector('span');
if (btnSpan) btnSpan.innerText = input.files[0].name;
const reader = new FileReader();
reader.onload = function(e) {
document.body.style.backgroundImage = `url('${e.target.result}')`;
};
reader.readAsDataURL(input.files[0]);
}
}
flipBoard() {
    this.flipped = !this.flipped;
    document.body.classList.toggle('flipped-board');
    
    const evalPanel = document.getElementById('enginePanel');
    if (evalPanel) evalPanel.classList.toggle('flipped');
    const el1 = document.getElementById('timer-white');
    const el2 = document.getElementById('timer-black');

    if (el1 && el2) {
        el1.id = 'timer-black';
        el2.id = 'timer-white';
    }
    this.renderBoard(false);
    this.renderHeaders();
}
copyPGN() {
        if (!window.game) return;
        
        // Grab the full PGN from the game logic
        const pgn = window.game.generatePGN();
        
        // Copy to clipboard
        navigator.clipboard.writeText(pgn).then(() => {
            // 🔥 THE FIX: Trigger your notification system on success!
            if (typeof this.showNotification === 'function') {
                this.showNotification("PGN successfully copied to clipboard!", "Copy PGN", "📋");
            }
        }).catch(err => {
            console.error("Failed to copy PGN: ", err);
            if (typeof this.showNotification === 'function') {
                this.showNotification("Failed to copy PGN to clipboard.", "Error", "❌");
            }
        });
    }
copyFEN() {
navigator.clipboard.writeText(window.game.currentNode.fen);
this.showNotification("Current FEN has been copied to your clipboard.","Copied","📋");
}
loadPgnAndAnalyze() {
let val = document.getElementById('editorPgnInput').value;
if (val) {
window.game.loadPGN(val, true);
this.switchTab('analysis');
}
}
updatePlayerNames(topName, bottomName, skipRender = false) {
        // 1. Update the "Source of Truth" (this.playerInfo)
        // This is critical: We save the new names so renderHeaders() sees them
        // instead of reverting to "Stockfish" or "You".
        
        if (this.flipped) {
            // Board Flipped: Top is White, Bottom is Black
            if (topName) this.playerInfo['w'].name = topName;
            if (bottomName) this.playerInfo['b'].name = bottomName;
        } else {
            // Standard: Top is Black, Bottom is White
            if (topName) this.playerInfo['b'].name = topName;
            if (bottomName) this.playerInfo['w'].name = bottomName;
        }

        // 2. Force a Render (UNLESS we are bulk loading a PGN)
        if (!skipRender) {
            this.renderHeaders();
        }
    }
updatePlayerInfo() {
        const humanImg = `<img src="assets/tabs-icon/face.webp" alt="Human" style="width:100%; height:100%; object-fit:cover; border-radius: 4px;">`;
        const engineImg = `<img src="assets/tabs-icon/engine.webp" alt="Bot" style="width:100%; height:100%; object-fit:contain; border-radius: 4px;">`;

        if (!this.playerInfo) this.playerInfo = { w: {}, b: {} };

        // 1. Handle Bot Mode
        if (window.game && window.game.mode === 'bot') {
            const level = window.game.botLevel || 5;
            const botName = `Stockfish Level ${level}`;
            
            // 🔥 THE FIX: Checks botColor properly and syncs to PGN Headers
            if (window.game.botColor === 'b') {
                this.playerInfo['w'].name = "You";
                this.playerInfo['b'].name = botName;
                this.avatars['w'] = humanImg;
                this.avatars['b'] = engineImg;
                
                // Force sync to PGN Metadata so exports are correct!
                if (window.game.pgnHeaders) {
                    window.game.pgnHeaders['White'] = "You";
                    window.game.pgnHeaders['Black'] = botName;
                }
            } else {
                this.playerInfo['w'].name = botName;
                this.playerInfo['b'].name = "You";
                this.avatars['w'] = engineImg;
                this.avatars['b'] = humanImg;
                
                if (window.game.pgnHeaders) {
                    window.game.pgnHeaders['White'] = botName;
                    window.game.pgnHeaders['Black'] = "You";
                }
            }
        } 
        // 2. Handle Human vs Human / Local Mode
        else {
            this.playerInfo['w'].name = (window.game && window.game.pgnHeaders['White']) || "White";
            this.playerInfo['b'].name = (window.game && window.game.pgnHeaders['Black']) || "Black";
            
            // Check if PGN metadata names explicitly suggest it's an engine match
            const wName = this.playerInfo['w'].name.toLowerCase();
            const bName = this.playerInfo['b'].name.toLowerCase();
            const isEngine = (n) => ['stockfish', 'engine', 'bot', 'leela', 'komodo', 'ai'].some(k => n.includes(k));
            
            this.avatars['w'] = (window.game && window.game.isEngineMatch) || isEngine(wName) ? engineImg : humanImg;
            this.avatars['b'] = (window.game && window.game.isEngineMatch) || isEngine(bName) ? engineImg : humanImg;
        }

        this.renderHeaders();
    }
parseTimeFromComment(comment) {
    if (!comment) return null;

    // 1. Try CCC/TCEC Format: "tl=113.949s"
    const tlMatch = comment.match(/tl=([0-9.]+)s?/);
    if (tlMatch) {
        return parseFloat(tlMatch[1]);
    }

    // 2. Try Standard PGN Format: "[%clk 1:30:00]" or "0:05:00"
    const clkMatch = comment.match(/%clk\s+([0-9:]+)/);
    if (clkMatch) {
        const parts = clkMatch[1].split(':');
        let seconds = 0;
        if (parts.length === 3) {
            seconds = (+parts[0]) * 3600 + (+parts[1]) * 60 + (+parts[2]);
        } else if (parts.length === 2) {
            seconds = (+parts[0]) * 60 + (+parts[1]);
        }
        return seconds;
    }
    
    return null;
}
updateClocks() {
        const wClockEl = document.getElementById('timer-white');
        const bClockEl = document.getElementById('timer-black');
        if (!wClockEl || !bClockEl) return;

        let wTime = 600;
        let bTime = 600;

        // 🔥 THE FIX 1: Always prioritize the LIVE ticking time over history snapshots!
        if (window.game && window.game.isPlayingLiveGame) {
            wTime = window.game.whiteTime; 
            bTime = window.game.blackTime;
        } else if (window.game && window.game.currentNode && window.game.currentNode.clock) {
            // Only use snapshot times if we are in Analysis/Puzzle mode
            wTime = window.game.currentNode.clock.w;
            bTime = window.game.currentNode.clock.b;
        } else {
            // Default fallbacks from PGN Headers
            if (window.game && window.game.pgnHeaders && window.game.pgnHeaders['TimeControl']) {
                const parts = window.game.pgnHeaders['TimeControl'].split('+');
                const val = parseFloat(parts[0]);
                wTime = val;
                bTime = val;
            } else if (window.game && window.game.timeControl) {
                const parts = window.game.timeControl.split('+');
                const val = parseFloat(parts[0]);
                wTime = val * 60; 
                bTime = val * 60;
            }
        }

        const format = (seconds) => {
            if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) seconds = 0;
            
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = Math.floor(seconds % 60);
            const ms = Math.floor((seconds % 1) * 10);

            if (seconds < 20 && seconds > 0) return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
            if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            return `${m}:${s.toString().padStart(2, '0')}`;
        };

        wClockEl.innerText = format(wTime);
        bClockEl.innerText = format(bTime);

        wClockEl.classList.remove('active', 'running');
        bClockEl.classList.remove('active', 'running');

        // 🔥 THE FIX 2: Lock the indicator to the TRUE live turn, ignoring PGN travel!
        if (window.game && window.game.isPlayingLiveGame) {
            const activeTurn = window.game.currentLiveTurn || window.game.turn;
            
            if (activeTurn === 'w') {
                wClockEl.classList.add('active', 'running');
            } else {
                bClockEl.classList.add('active', 'running');
            }
        } else if (window.game) {
            const isStepping = (window.game.currentNode !== window.game.rootNode);
            if (isStepping) {
                const parts = window.game.currentNode.fen.split(' ');
                const turn = parts[1] || 'w';

                if (turn === 'w') wClockEl.classList.add('active', 'running');
                else bClockEl.classList.add('active', 'running');
            }
        }
    }
openBotMenu() {
        const modal = document.getElementById('botMenuModal');
        if (modal) {
            if (modal.parentElement !== document.body) {
                document.body.appendChild(modal);
            }

            // Force strict full-screen centering
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100vw';
            modal.style.height = '100vh';
            modal.style.zIndex = '9999'; // Ensure it sits on top of everything else
            modal.style.display = 'flex';
            modal.style.justifyContent = 'center';
            modal.style.alignItems = 'center';
            modal.style.backgroundColor = 'rgba(0, 0, 0, 0.75)'; // Dim the rest of the screen

            // Reset to defaults (Level 5, Random)
            this.setBotLevel(5, document.querySelectorAll('.strength-selector .str-btn')[4]);
            this.selectSideOption('random');
        }
    }
setBotLevel(level, btnElement) {
        // Set Hidden Input
        document.getElementById('botLevelInput').value = level;
        
        // Update Visuals
        document.querySelectorAll('.strength-selector .str-btn').forEach(b => b.classList.remove('active'));
        if (btnElement) btnElement.classList.add('active');
    }
selectSideOption(side) {
        // Set Hidden Input
        document.getElementById('botColorInput').value = side;
        
        // Update Visuals
        document.querySelectorAll('.side-selector .side-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = document.getElementById(`sideBtn-${side}`);
        if (activeBtn) activeBtn.classList.add('active');
    }
confirmBotStart() {
        const modal = document.getElementById('botMenuModal');
        if (modal) modal.style.display = 'none';

        // 1. Read all the chosen settings
        const level = parseInt(document.getElementById('botLevelInput').value || 8);
        const side = document.getElementById('botColorInput').value || 'random';
        
        // 2. Read the Variant from the Side Menu dropdown
        const variantSelect = document.getElementById('gameVariantSelect');
        const variant = variantSelect ? variantSelect.value : 'standard';

        // 3. Start the correct game type!
        if (window.game) {
            if (variant === 'chess960' && typeof window.game.startChess960Game === 'function') {
                window.game.startChess960Game('bot', level, side);
            } else if (typeof window.game.startBotGame === 'function') {
                window.game.startBotGame(level, side);
            }
            
            // 4. Clean up the UI
            this.switchTab('play'); 
            this.toggleSideMenu(false);
        }
    }
updateBotMenuPreviews() {
        // Helper: Get Piece as an IMG Element (prevents SVG ID conflicts)
        const getPieceImage = (color) => {
            const rawHtml = this.getPieceHTML({ color: color, type: 'k' });
            if (!rawHtml) return null;

            // CASE A: Standard SVG (Convert to Data URI Image)
            if (rawHtml.trim().startsWith('<svg')) {
                const encoded = encodeURIComponent(rawHtml);
                const img = document.createElement('img');
                img.src = `data:image/svg+xml;charset=utf-8,${encoded}`;
                img.style.width = "100%";
                img.style.height = "100%";
                img.style.display = "block";
                return img;
            } 
            
            // CASE B: Custom Image (Already an <img> tag)
            const temp = document.createElement('div');
            temp.innerHTML = rawHtml;
            const el = temp.firstElementChild;
            if (el) {
                el.style.width = "100%";
                el.style.height = "100%";
                el.style.display = "block";
            }
            return el;
        };

        // 1. Update Standard Buttons (White & Black)
        const updateSingleButton = (btnId, color) => {
            const btn = document.getElementById(btnId);
            if (!btn) return;

            const newImg = getPieceImage(color);
            if (newImg) {
                // Apply styling to match button layout
                newImg.classList.add('side-icon');
                newImg.style.width = "45px";
                newImg.style.height = "45px";
                newImg.style.marginBottom = "8px";

                const oldIcon = btn.querySelector('.side-icon');
                if (oldIcon) oldIcon.replaceWith(newImg);
                else btn.insertBefore(newImg, btn.firstChild);
            }
        };

        updateSingleButton('sideBtn-w', 'w');
        updateSingleButton('sideBtn-b', 'b');

        // 2. Update Random Button (Split King)
        const randomBtn = document.getElementById('sideBtn-random');
        if (randomBtn) {
            const wKingImg = getPieceImage('w');
            const bKingImg = getPieceImage('b');

            if (wKingImg && bKingImg) {
                // Container
                const container = document.createElement('div');
                container.className = 'side-icon random-king-container';

                // Left Half (White)
                const leftDiv = document.createElement('div');
                leftDiv.className = 'random-half left';
                leftDiv.appendChild(wKingImg);

                // Right Half (Black)
                const rightDiv = document.createElement('div');
                rightDiv.className = 'random-half right';
                rightDiv.appendChild(bKingImg);

                // Assemble
                container.appendChild(leftDiv);
                container.appendChild(rightDiv);

                // Replace old icon
                const oldIcon = randomBtn.querySelector('.side-icon');
                if (oldIcon) oldIcon.replaceWith(container);
                else randomBtn.insertBefore(container, randomBtn.firstChild);
            }
        }
    }
updatePgnAvatars(whiteName, blackName, isEngineGame = false, skipRender = false) {
        const isEngineName = (name) => {
            if (!name) return false;
            const n = name.toLowerCase();
            const keywords = ['stockfish', 'engine', 'bot', 'komodo', 'leela', 'lc0', 'torch', 'alphazero', 'computer', 'ai', 'gnufish', 'dragon', 'wasp'];
            return keywords.some(k => n.includes(k));
        };

        const humanImg = `<img src="assets/tabs-icon/face.webp" alt="Human" style="width:100%; height:100%; object-fit:cover; border-radius:4px;">`;
        const engineImg = `<img src="assets/tabs-icon/engine.webp" alt="Engine" style="width:100%; height:100%; object-fit:contain; border-radius:4px;">`;

        // Explicitly set engine icon if the PGN metadata name matches an engine!
        this.avatars['w'] = (isEngineGame || isEngineName(whiteName)) ? engineImg : humanImg;
        this.avatars['b'] = (isEngineGame || isEngineName(blackName)) ? engineImg : humanImg;
        
        if (!skipRender) {
            this.renderHeaders(); 
        }
    }
showPromotionModal(color, destIdx, callback) {
        const overlay = document.getElementById('promotion-overlay');
        if (!overlay) return;

        // [FIX] HIDE THE PIECE UNDERNEATH (e.g. Captured Piece)
        // This prevents the "ghost" piece from showing through the gaps
        // or flickering when you hover the promotion buttons.
        const squareWidth = this.boardEl.offsetWidth / 8;
        const file = destIdx % 8;
        const rank = Math.floor(destIdx / 8);
        
        // Calculate visual coordinates of the square to find the piece
        const targetX = (this.flipped ? (7 - file) : file) * 12.5; // %
        const targetY = (this.flipped ? rank : (7 - rank)) * 12.5; // %

        // Find and hide the piece element at this position
        const pieceEls = this.piecesLayer.children;
        for (let el of pieceEls) {
            // Check if element style matches target position (approximate match for safety)
            const left = parseFloat(el.style.left);
            const top = parseFloat(el.style.top);
            if (Math.abs(left - targetX) < 1 && Math.abs(top - targetY) < 1) {
                el.style.opacity = '0'; // Hide it
            }
        }

        // 1. Reset & Show Overlay
        overlay.innerHTML = '';
        overlay.style.display = 'block';

        // 2. Click Background to Cancel
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                overlay.style.display = 'none';
                this.selectedSq = null;
                this.legalMoves = [];
                // Re-rendering the board will automatically unhide the piece
                // if the move was cancelled.
                this.renderBoard(false); 
            }
        };

        // 3. Determine Stack Direction
        const pieces = ['q', 'n', 'r', 'b']; 
        
        pieces.forEach((type, i) => {
            const btn = document.createElement('div');
            btn.className = `promo-option promo-${color}`;
            
            btn.innerHTML = this.getPieceHTML({ color: color, type: type.toUpperCase() });
            
            // Stack Logic: Queen at Target, others stacked towards center
            let targetRow = rank === 0 ? (rank + i) : (rank - i);
            let targetCol = file;

            if (this.flipped) {
                targetRow = 7 - targetRow;
                targetCol = 7 - targetCol;
            }

            btn.style.left = (targetCol * 12.5) + '%';
            btn.style.top = (targetRow * 12.5) + '%';

            // Animation
            btn.style.transform = 'scale(0)';
            setTimeout(() => {
                btn.style.transform = 'scale(1)';
                
                // 3. CRITICAL: Remove the inline transform after animation ends (200ms).
                // This allows the CSS :hover effect (scale 1.15) to work without conflict.
                setTimeout(() => {
                    btn.style.transform = ''; 
                }, 200); 
                
            }, i * 60);

            // Click Handler
            btn.onclick = (e) => {
                e.stopPropagation();
                overlay.style.display = 'none';
                callback(type);
            };

            overlay.appendChild(btn);
        });
    }
togglePgnEditing(enable) {
        const box = document.getElementById('editorPgnInput'); 
        if (box) {
            box.disabled = !enable;
            box.placeholder = enable ? "Paste PGN..." : "PGN editing disabled during game";
        }
        
        const sheet = document.getElementById('moveHistory'); 
        if (sheet) {
            // 1. Keep the main container strictly locked
            sheet.contentEditable = "false"; 
            sheet.style.userSelect = "text"; 

            // 2. Target ONLY the comment elements inside the move history
            // (Make sure this class matches whatever class you use to render comments, e.g., '.comment' or '.pgn-comment')
            const comments = sheet.querySelectorAll('.comment, .pgn-comment, .move-comment');
            
            comments.forEach(c => {
                c.contentEditable = enable ? "true" : "false";
                
                // Add a subtle visual cue so you know it's editable
                if (enable) {
                    c.style.cursor = "text";
                    c.style.outline = "none";
                    c.style.borderBottom = "1px dashed #666"; 
                } else {
                    c.style.cursor = "default";
                    c.style.borderBottom = "none";
                }
            });
        }

        // 3. (Optional) If you have a separate comment input box below the board
        const commentBox = document.getElementById('commentInput'); // Replace with your actual ID
        if (commentBox) {
            commentBox.disabled = !enable;
        }
    }
togglePGN() {
        const container = document.getElementById('pgnContainer');
        const icon = document.getElementById('pgnToggleIcon');
        if (!container || !icon) return;

        if (container.style.maxHeight === '0px') {
            container.style.maxHeight = '400px';
            icon.innerText = '▼';
        } else {
            container.style.maxHeight = '0px';
            icon.innerText = '▲';
        }
    }
initCharts() {
    if (typeof Chart === 'undefined') {
        console.warn("Chart.js not loaded.");
        return;
    }

    const ctxEval = document.getElementById('evalChartCtx');
    const ctxTime = document.getElementById('timeChartCtx');

    // Define the custom plugin once here
    const lichessPlugin = {
        id: 'lichessAesthetic',
        afterDraw: (chart) => {
            if (!chart.chartArea) return; 
            const ctx = chart.ctx;
            const xAxis = chart.scales.x;
            const { top, bottom } = chart.chartArea; 
            const actIdx = chart.config.options.plugins.lichessAesthetic?.activeIdx ?? -1;

            ctx.save();
            if (actIdx >= 0 && actIdx <= xAxis.max) {
                const x = xAxis.getPixelForValue(actIdx);
                ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom);
                ctx.lineWidth = 1.5; ctx.strokeStyle = '#d59120'; ctx.stroke();
            }
            const phases = [{ name: 'Opening', start: 0 }, { name: 'Middlegame', start: 24 }, { name: 'Endgame', start: 60 }];
            ctx.font = "12px 'Segoe UI', sans-serif"; ctx.fillStyle = "rgba(255, 255, 255, 0.4)"; ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
            phases.forEach(p => {
                if (p.start <= xAxis.max) {
                    const x = xAxis.getPixelForValue(p.start);
                    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
                    ctx.translate(x + 14, top + 10); ctx.rotate(Math.PI / 2);
                    ctx.fillText(p.name, 0, 0); ctx.rotate(-Math.PI / 2); ctx.translate(-(x + 14), -(top + 10));
                }
            });
            ctx.restore();
        }
    };

    const commonOptions = {
        responsive: false, 
        maintainAspectRatio: false,
        animation: false, // 🔥 OPTIMIZATION: Disable animations
        normalized: true, // 🔥 OPTIMIZATION: Skips data sorting checks
        spanGaps: true,
        interaction: { mode: 'index', intersect: false },
        devicePixelRatio: window.devicePixelRatio
    };

    // Create charts ONLY if they don't exist
    if (ctxEval && !this.evalChart) {
        this.evalChart = new Chart(ctxEval, {
            type: 'line',
            plugins: [lichessPlugin],
            data: { labels: [], datasets: [] },
            options: { 
                ...commonOptions,
                plugins: { legend: { display: false } }, 
                scales: { 
                    x: { display: false }, 
                    y: { 
                        suggestedMin: -5, suggestedMax: 5, 
                        grid: { color: '#333', drawBorder: false },
                        ticks: { color: '#888', stepSize: 2 }
                    } 
                }
            }
        });
    }

    if (ctxTime && !this.timeChart) {
        this.timeChart = new Chart(ctxTime, {
            type: 'bar',
            plugins: [lichessPlugin],
            data: { labels: [], datasets: [] },
            options: { 
                ...commonOptions,
                plugins: { legend: { display: false } }, 
                scales: { 
                    x: { display: false }, 
                    // 🔥 THE FIX: Rename 'y' to 'yTime' so it matches forceRenderCharts
                    yTime: { 
                        type: 'linear',
                        position: 'left',
                        beginAtZero: true, 
                        suggestedMax: 100, 
                        grid: { color: '#333' }, 
                        ticks: { 
                            color: '#888',
                            precision: 0, 
                            callback: function(value) {
                                return value + 's'; 
                            }
                        } 
                    },
                    // 🔥 Initialize yEval as hidden so it doesn't break on load
                    yEval: {
                        type: 'linear',
                        position: 'right',
                        display: false
                    }
                } 
            }
        });
    }
const evalTab = document.getElementById('bContent-eval');
if (evalTab && !this._chartObserver) {
    this._chartObserver = new ResizeObserver(() => {
        if (this.evalChart) this.evalChart.resize();
        if (this.timeChart) this.timeChart.resize();
    });
    this._chartObserver.observe(evalTab);
}
const bPanel = document.getElementById('studyBottomPanel');
    if (bPanel && !this._chartObserver) {
        this._chartObserver = new ResizeObserver(() => {
            if (typeof this.safeResizeCharts === 'function') this.safeResizeCharts();
        });
        this._chartObserver.observe(bPanel);
    }
const toggleBtn = document.getElementById('toggleChartsBtn');
const wrapper = document.getElementById('chartsCollapsibleWrapper');

if (toggleBtn && wrapper) {
    toggleBtn.onclick = () => {
        if (wrapper.style.display !== 'none') {
            // COLLAPSE
            wrapper.style.display = 'none';
            toggleBtn.innerText = "+ Expand Charts";
        } else {
            // EXPAND
            wrapper.style.display = 'flex';
            toggleBtn.innerText = "− Collapse Charts";
            
            // 🔥 THE FIX: The Race Condition Killer
            // The first frame waits for the DOM to update.
            // The second frame waits for the browser to actually paint the flexbox.
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (this.evalChart) this.evalChart.resize();
                    if (this.timeChart) this.timeChart.resize();
                    this.renderCharts();
                });
            });
        }
    };
}
}
renderCharts(force = false) {
        if (typeof Chart === 'undefined') return;

        if (this.evalChart || this.timeChart) {
            this.updateChartActiveLine();
        }

        let lastNode = window.game.rootNode;
        while (lastNode && lastNode.children.length > 0) {
            lastNode = lastNode.children[lastNode.selectedChildIndex || 0];
        }

        // 🔥 THE FIX: If 'force' is true, bypass the FEN checker entirely!
        if (!force && this.evalChart && this._lastChartedFen === lastNode.fen) {
            return; 
        }

        this._lastChartedFen = lastNode.fen;

        if (this._chartRenderTimeout) clearTimeout(this._chartRenderTimeout);
        
        if (force) {
            // Draw instantly
            this.forceRenderCharts();
        } else {
            // Debounce for normal gameplay
            this._chartRenderTimeout = setTimeout(() => {
                this.forceRenderCharts();
            }, 150); 
        }
    }
safeResizeCharts() {
        if (this._resizeInterval) clearInterval(this._resizeInterval);
        
        let ticks = 0;
        this._resizeInterval = setInterval(() => {
            const eWrap = document.getElementById('evalSizer');
            const tWrap = document.getElementById('timeSizer');

            // 🔥 THE FIX: Strictly cap the height at 220px so it never gets too big!
            if (this.evalChart && eWrap) {
                const w = eWrap.offsetWidth;
                const h = eWrap.offsetHeight > 0 ? eWrap.offsetHeight : 220;
                if (w > 0) this.evalChart.resize(w, Math.min(h, 220)); 
            }
            
            if (this.timeChart && tWrap) {
                const w = tWrap.offsetWidth;
                const h = tWrap.offsetHeight > 0 ? tWrap.offsetHeight : 220;
                if (w > 0) this.timeChart.resize(w, Math.min(h, 220)); 
            }
            
            ticks++;
            if (ticks > 10) {
                clearInterval(this._resizeInterval);
                this._resizeInterval = null;
            }
        }, 50);
    }
forceRenderCharts() {
        if (typeof Chart === 'undefined') return;

        if (!this.evalChart || !this.timeChart) {
            this.initCharts();
        }

        let isMatch = window.game.isEngineMatch;
        let hasPgnEvals = false;
        let scanNode = window.game.rootNode;
        
        while (scanNode && scanNode.children.length > 0) {
            let n = scanNode.children[scanNode.selectedChildIndex || 0];
            if (n.evalScore !== undefined) { hasPgnEvals = true; break; }
            scanNode = n;
        }

        let labels = [];
        let timeData = []; let timeBg = [];
        let evalDataWhite = []; let strWhite = [];
        let evalDataBlack = []; let strBlack = [];
        let evalDataPgn = [];   let strPgn = [];
        let combinedEvalForTimeChart = []; 
        let evalDataLocal = []; let strLocal = [];
        let chartNags = []; let chartColors = [];

        const clampEval = (val) => {
            if (Math.abs(val) >= 90000) return val > 0 ? 10 : -10;
            return Math.max(-10, Math.min(10, val / 100));
        };
        
        const formatEval = (val) => {
            if (Math.abs(val) >= 90000) return (val > 0 ? "+M" : "-M") + (100000 - Math.abs(val));
            return (val/100 > 0 ? "+" : "") + (val/100).toFixed(2);
        };

        let curr = window.game.rootNode;
        let ply = 0;
        let activeIdx = -1;

        labels.push("Start");
        timeData.push(0); timeBg.push('#ffffff');
        chartNags.push(null); chartColors.push(null);
        
        let startVal = curr.evalScore !== undefined ? curr.evalScore : 20;
        let startStr = curr.eval || "+0.20";
        
        if (isMatch) {
            evalDataWhite.push(clampEval(startVal)); strWhite.push(startStr);
            evalDataBlack.push(null); strBlack.push(null);
        } else {
            evalDataPgn.push(clampEval(startVal)); strPgn.push(startStr);
        }
        
        if (hasPgnEvals) combinedEvalForTimeChart.push(clampEval(startVal));
        
        let locStartVal = curr.localEvalScore !== undefined ? curr.localEvalScore : startVal;
        evalDataLocal.push(clampEval(locStartVal));
        strLocal.push(curr.localEval || startStr);
        
        if (!hasPgnEvals) combinedEvalForTimeChart.push(clampEval(locStartVal));
        if (curr === window.game.currentNode) activeIdx = 0;

        while (curr && curr.children.length > 0) {
            let next = curr.children[curr.selectedChildIndex || 0];
            ply++;
            let isWhite = (ply % 2 !== 0);
            let isMateMove = next.moveSan && next.moveSan.includes('#');

            if (next === window.game.currentNode) activeIdx = ply;
            labels.push(isWhite ? `${Math.ceil(ply / 2)}. ${next.moveSan}` : `${Math.ceil(ply / 2)}... ${next.moveSan}`);

            let t = next.timeSpent !== undefined ? next.timeSpent : 0;
            timeData.push(isWhite ? t : -t);
            timeBg.push(isWhite ? '#ffffff' : '#000000'); 

            let nType = null; let nColor = null;
            if (next.nag) {
                const info = this.getNagInfo(next.nag);
                if (info && ['blunder', 'mistake', 'inaccuracy', 'brilliant', 'good', 'interesting'].includes(info.type)) {
                    nType = info.type; nColor = info.color;
                }
            }
            chartNags.push(nType);
            chartColors.push(nColor);

            let vPgn = evalDataPgn.length > 0 ? evalDataPgn[evalDataPgn.length - 1] : 0;
            let str = null;

            if (next.evalScore !== undefined) {
                vPgn = clampEval(next.evalScore);
                str = next.eval || formatEval(next.evalScore);
            } else if (isMateMove && hasPgnEvals) {
                vPgn = isWhite ? 10 : -10;
                str = isWhite ? "+M0" : "-M0";
            }
            
            if (hasPgnEvals) combinedEvalForTimeChart.push(vPgn);

            if (isMatch) {
                if (isWhite) { evalDataWhite.push(vPgn); strWhite.push(str); evalDataBlack.push(null); strBlack.push(null); } 
                else { evalDataWhite.push(null); strWhite.push(null); evalDataBlack.push(vPgn); strBlack.push(str); }
            } else {
                evalDataPgn.push(vPgn); strPgn.push(str);
            }

            let vLoc = null; let sLoc = null;

            if (next.localEvalScore !== undefined) {
                vLoc = clampEval(next.localEvalScore);
                sLoc = next.localEval || formatEval(next.localEvalScore);
            } else if (isMateMove) {
                vLoc = isWhite ? 10 : -10;
                sLoc = isWhite ? "+M0" : "-M0";
            } else if (next.evalScore !== undefined) {
                vLoc = clampEval(next.evalScore);
                sLoc = next.eval || formatEval(next.evalScore);
            } else {
                vLoc = evalDataLocal.length > 0 ? evalDataLocal[evalDataLocal.length - 1] : 0;
                sLoc = strLocal.length > 0 ? strLocal[strLocal.length - 1] : "0.00";
            }
            
            evalDataLocal.push(vLoc);
            strLocal.push(sLoc);

            if (!hasPgnEvals) combinedEvalForTimeChart.push(vLoc); 
            curr = next;
        }

        let pointRadii = chartNags.map((nagType, idx) => {
            if (idx === 0) return 0;
            const ptColor = idx % 2 !== 0 ? 'w' : 'b';
            if (this.highlightedChartState && this.highlightedChartState.type) {
                if (this.highlightedChartState.color === ptColor && this.highlightedChartState.type === nagType) return 8; // HUGE DOT ON HOVER
                if (nagType) return 2; // Shrink others
                return 0;
            }
            return nagType ? 4 : 0; // Default sizing
        });

        let getColors = (defaultColor) => chartColors.map(c => c || defaultColor);

        let datasetArray = [];
        
        if (hasPgnEvals) {
            if (isMatch) {
                datasetArray.push({ label: window.game.pgnHeaders['White'] || 'White Engine', data: evalDataWhite, customEvals: strWhite, borderColor: '#d59120', backgroundColor: 'rgba(213, 145, 32, 0.2)', fill: true, borderWidth: 2, pointRadius: pointRadii, pointBackgroundColor: getColors('#d59120'), pointBorderColor: '#fff', pointBorderWidth: 1.5, pointHoverRadius: 6, tension: 0, spanGaps: true });
                datasetArray.push({ label: window.game.pgnHeaders['Black'] || 'Black Engine', data: evalDataBlack, customEvals: strBlack, borderColor: '#b369f2', backgroundColor: 'rgba(179, 105, 242, 0.2)', fill: true, borderWidth: 2, pointRadius: pointRadii, pointBackgroundColor: getColors('#b369f2'), pointBorderColor: '#fff', pointBorderWidth: 1.5, pointHoverRadius: 6, tension: 0, spanGaps: true });
            } else {
                datasetArray.push({ label: 'PGN Eval', data: evalDataPgn, customEvals: strPgn, borderColor: '#d59120', backgroundColor: 'rgba(213, 145, 32, 0.25)', fill: 'start', borderWidth: 2, pointRadius: pointRadii, pointBackgroundColor: getColors('#d59120'), pointBorderColor: '#fff', pointBorderWidth: 1.5, pointHoverRadius: 6, tension: 0 });
            }
        }
        
        datasetArray.push({
            label: 'Local Depth 20',
            data: evalDataLocal, 
            customEvals: strLocal,
            borderColor: '#38bdf8', 
            borderDash: hasPgnEvals ? [5, 5] : [], 
            backgroundColor: hasPgnEvals ? 'transparent' : 'rgba(56, 189, 248, 0.25)', 
            fill: hasPgnEvals ? false : 'start',
            borderWidth: 2, 
            pointRadius: pointRadii, 
            pointBackgroundColor: getColors('#38bdf8'), 
            pointBorderColor: '#fff', 
            pointBorderWidth: 1.5, 
            pointHoverRadius: 6, 
            tension: 0, 
            spanGaps: true
        });

        const xAxisConfig = {
            display: true,
            ticks: {
                color: '#888', maxRotation: 0, autoSkip: false,
                callback: function(val, index) {
                    let lbl = labels[index];
                    if (!lbl || lbl === "Start" || lbl.includes("...")) return null;
                    let num = parseInt(lbl.split('.')[0]);
                    return (num % 10 === 0) ? num : null; 
                }
            },
            grid: { display: false }
        };

        const tooltipConfig = {
            displayColors: true, backgroundColor: 'rgba(30, 30, 30, 0.95)', bodyFont: { size: 13, family: 'Segoe UI' }, titleFont: { size: 14, weight: 'bold' },
            callbacks: {
                title: (ctx) => { let label = ctx[0].label; return label && label !== "Start" ? `Move: ${label}` : label; },
                label: (ctx) => { let exactStr = ctx.dataset.customEvals[ctx.dataIndex]; if (!exactStr) return null; return `${ctx.dataset.label}: ${exactStr}`; }
            }
        };

        if (this.evalChart) {
            this.evalChart.data.labels = labels;
            this.evalChart.data.datasets = datasetArray;
            this.evalChart.options.scales.x = xAxisConfig;
            this.evalChart.options.plugins.tooltip = tooltipConfig;
            this.evalChart.options.plugins.lichessAesthetic = { activeIdx: activeIdx };
            this.evalChart.options.onClick = (e, elements) => { if (elements.length > 0) this.jumpToChartMove(elements[0].index); };
            
            this.evalChart.update('none'); 
        }

        if (this.timeChart) {
            this.timeChart.data.labels = labels;
            this.timeChart.data.datasets = [ 
                { type: 'line', data: combinedEvalForTimeChart, borderColor: '#38bdf8', borderWidth: 2, fill: false, pointRadius: 0, tension: 0.2, yAxisID: 'yEval' }, 
                { type: 'bar', data: timeData, backgroundColor: timeBg, barPercentage: 1.0, categoryPercentage: 1.0, yAxisID: 'yTime' } 
            ];
            
            let maxTime = Math.max(...timeData.map(Math.abs));
            if (maxTime < 10) maxTime = 10; 

            let unit = 's';
            let divider = 1;
            if (maxTime >= 3600) { unit = 'h'; divider = 3600; } 
            else if (maxTime >= 60) { unit = 'm'; divider = 60; }

            this.timeChart.options.scales.x = xAxisConfig;
            
            this.timeChart.options.scales.yTime = { 
                type: 'linear', display: true, position: 'left', min: -maxTime, max: maxTime, grid: { color: '#333' },
                ticks: {
                    color: '#888', maxTicksLimit: 6,
                    callback: function(value) {
                        if (value === 0) return '0';
                        const converted = Math.abs(value) / divider;
                        return Number.isInteger(converted) ? converted + unit : converted.toFixed(1) + unit;
                    }
                }
            };
            
            this.timeChart.options.scales.yEval = { type: 'linear', display: false, position: 'right', min: -10, max: 10, grid: { color: (ctx) => ctx.tick.value === 0 ? 'rgba(255,255,255,0.4)' : 'transparent', drawBorder: false } };
            this.timeChart.options.plugins.lichessAesthetic = { activeIdx: activeIdx };
            
            this.timeChart.options.plugins.tooltip = {
                displayColors: false, backgroundColor: 'rgba(30, 30, 30, 0.95)',
                callbacks: {
                    title: (ctx) => { let label = ctx[0].label; return label !== "Start" ? `Move: ${label}` : label; },
                    label: (ctx) => {
                        if (ctx.datasetIndex === 0) return null; 
                        const totalSeconds = Math.abs(ctx.raw);
                        if (totalSeconds < 60) return `Time spent: ${totalSeconds.toFixed(1)}s`;
                        const hours = Math.floor(totalSeconds / 3600);
                        const minutes = Math.floor((totalSeconds % 3600) / 60);
                        const seconds = Math.floor(totalSeconds % 60);
                        let timeString = '';
                        if (hours > 0) timeString += `${hours}h `;
                        if (minutes > 0 || hours > 0) timeString += `${minutes}m `;
                        timeString += `${seconds}s`;
                        return `Time spent: ${timeString}`;
                    }
                }
            };
            
            this.timeChart.options.onClick = (e, elements) => { if (elements.length > 0) this.jumpToChartMove(elements[0].index); };
            this.timeChart.update('none');
        }
        this.safeResizeCharts();
    }
jumpToChartMove(idx) {
        if (!window.game || !window.game.rootNode) return;
        let curr = window.game.rootNode;
        let currentIdx = 0;
        
        while (curr && curr.children.length > 0 && currentIdx < idx) {
            curr = curr.children[curr.selectedChildIndex || 0];
            currentIdx++;
        }
        
        if (curr) {
            window.game.currentNode = curr;
            window.game.loadFEN(curr.fen);
            window.game.syncMoveHistory(); // 🔥 THE FIX: Rebuild array after jump!
            this.renderBoard(false);
            this.updateHistory();
            this.renderArrows();
            if (this.updateClocks) this.updateClocks();
            if (window.game.updateStockfish && !window.game.isPlayingLiveGame) {
                window.game.updateStockfish();
            }
        }
    }
jumpToNextError(color, type) {
        if (!window.game || !window.game.rootNode) return;
        
        this.errorNavState = this.errorNavState || {};
        let matches = [];
        let curr = window.game.rootNode;
        let ply = 0;
        
        while (curr && curr.children.length > 0) {
            let next = curr.children[curr.selectedChildIndex || 0];
            ply++;
            let nodeColor = (ply % 2 !== 0) ? 'w' : 'b';
            
            if (next.nag && nodeColor === color) {
                const info = this.getNagInfo(next.nag);
                if (info && info.type === type) {
                    matches.push(next);
                }
            }
            curr = next;
        }
        
        if (matches.length === 0) return; 
        
        let stateKey = `${color}_${type}`;
        let currentIndex = this.errorNavState[stateKey] || 0;
        if (currentIndex >= matches.length) currentIndex = 0; 
        
        let targetNode = matches[currentIndex];
        
        window.game.currentNode = targetNode;
        window.game.loadFEN(targetNode.fen);
        window.game.syncMoveHistory(); // 🔥 THE FIX: Rebuild array after jump!
        this.renderBoard(false);
        this.updateHistory();
        this.renderArrows();
        if (this.updateClocks) this.updateClocks();
        if (window.game.updateStockfish && !window.game.isPlayingLiveGame) {
            window.game.updateStockfish();
        }
        
        this.errorNavState[stateKey] = currentIndex + 1;
    }
updateChartActiveLine() {
        let activeIdx = -1;
        let curr = window.game.rootNode;
        let ply = 0;
        if (curr === window.game.currentNode) activeIdx = 0;
        
        while (curr && curr.children.length > 0) {
            curr = curr.children[curr.selectedChildIndex || 0];
            ply++;
            if (curr === window.game.currentNode) activeIdx = ply;
        }

        if (this.evalChart) {
            this.evalChart.config.options.plugins.lichessAesthetic.activeIdx = activeIdx;
            this.evalChart.draw();
        }
        if (this.timeChart) {
            this.timeChart.config.options.plugins.lichessAesthetic.activeIdx = activeIdx;
            this.timeChart.draw();
        }
    }
showReviewResults(wAcc, wBlun, wMist, wInacc, bAcc, bBlun, bMist, bInacc) {
        const panel = document.getElementById('reviewResultsPanel');
        if (panel) {
            panel.style.display = 'flex';
            
            document.getElementById('accWhite').innerText = wAcc + '%';
            document.getElementById('blunWhite').innerText = wBlun + ' Blunders';
            document.getElementById('mistWhite').innerText = wMist + ' Mistakes';
            if (document.getElementById('inaccWhite')) document.getElementById('inaccWhite').innerText = wInacc + ' Inaccuracies';
            
            document.getElementById('accBlack').innerText = bAcc + '%';
            document.getElementById('blunBlack').innerText = bBlun + ' Blunders';
            document.getElementById('mistBlack').innerText = bMist + ' Mistakes';
            if (document.getElementById('inaccBlack')) document.getElementById('inaccBlack').innerText = bInacc + ' Inaccuracies';

            // 🔥 FIX: ADDED ONCLICK AND HOVER BINDING FOR CHART 🔥
            const bindHover = (id, color, type) => {
                const el = document.getElementById(id);
                if (el) {
                    el.style.cursor = 'pointer'; 
                    el.onmouseenter = () => this.highlightChartPoints(color, type);
                    el.onmouseleave = () => this.highlightChartPoints(null, null);
                    el.onclick = () => this.jumpToNextError(color, type);
                }
            };

            bindHover('inaccWhite', 'w', 'inaccuracy');
            bindHover('mistWhite', 'w', 'mistake');
            bindHover('blunWhite', 'w', 'blunder');

            bindHover('inaccBlack', 'b', 'inaccuracy');
            bindHover('mistBlack', 'b', 'mistake');
            bindHover('blunBlack', 'b', 'blunder');
        }
        
        const btn = document.getElementById('reviewGameBtn');
        if (btn) btn.style.display = 'none'; 
    }
setHistoryDimState(isDimmed) {
        const containers = [
            document.getElementById('move-history'), 
            document.getElementById('tree-history'),
            document.querySelector('.history-container')
        ];
        containers.forEach(c => {
            if (c) isDimmed ? c.classList.add('dimmed-mode') : c.classList.remove('dimmed-mode');
        });
    }
highlightStatMoves(colorChar, nagType) {
        this.setHistoryDimState(true); 

        const selector = `
            .move-ply[data-color="${colorChar}"][data-nag="${nagType}"], 
            .tree-move[data-color="${colorChar}"][data-nag="${nagType}"], 
            .var-move[data-color="${colorChar}"][data-nag="${nagType}"]
        `;
        const matchingMoves = document.querySelectorAll(selector);
        matchingMoves.forEach(move => move.classList.add('active-highlight'));
    }
clearStatHighlights() {
        this.setHistoryDimState(false); 
        document.querySelectorAll('.active-highlight').forEach(m => m.classList.remove('active-highlight'));
    }
renderAnalysisResult(stats) {
        const container = document.getElementById('analysis-result-content');
        if (!container) return;
        container.innerHTML = '';

        if (!stats || (stats.w.total === 0 && stats.b.total === 0)) {
            container.innerHTML = '<div style="padding:10px; color:#888;">No analysis data available.</div>';
            return;
        }

        const statTypes = [
            { key: 'brilliant', label: 'Brilliant', color: '#26c2a3' },
            { key: 'good', label: 'Good', color: '#5c8bb0' },
            { key: 'interesting', label: 'Interesting', color: '#b369f2' },
            { key: 'inaccuracy', label: 'Inaccuracy', color: '#f7c045' },
            { key: 'mistake', label: 'Mistake', color: '#ffa700' },
            { key: 'blunder', label: 'Blunder', color: '#fa412d' }
        ];

        const createStatSection = (sideStats, title, colorChar) => {
            let section = document.createElement('div');
            section.style.marginBottom = '15px';
            section.innerHTML = `<div style="font-weight:bold; margin-bottom:5px; border-bottom:1px solid #444;">${title} (ACPL: ${sideStats.acpl})</div>`;
            
            statTypes.forEach(type => {
                const count = sideStats[type.key] || 0;
                if (count > 0) {
                    let row = document.createElement('div');
                    row.style.cssText = "display:flex; justify-content:space-between; padding:3px 0; cursor:pointer; transition: background-color 0.2s;";
                    row.innerHTML = `<span style="color:${type.color};">${type.label}</span><span>${count}</span>`;
                    
                    // 🔥 ATTACH HOVER & CLICK TRIGGERS HERE AS WELL 🔥
                    row.onmouseenter = () => {
                        row.style.backgroundColor = 'rgba(255,255,255,0.1)'; 
                        this.highlightStatMoves(colorChar, type.key);
                        this.highlightChartPoints(colorChar, type.key); // Highlight chart dots
                    };
                    row.onmouseleave = () => {
                        row.style.backgroundColor = 'transparent';
                        this.clearStatHighlights();
                        this.highlightChartPoints(null, null); // Clear chart dots
                    };
                    row.onclick = () => {
                        this.jumpToNextError(colorChar, type.key); // Travel on click
                    };

                    section.appendChild(row);
                }
            });
            return section;
        };

        container.appendChild(createStatSection(stats.w, "White", 'w'));
        container.appendChild(createStatSection(stats.b, "Black", 'b'));
    }
highlightChartPoints(colorChar, nagType) {
        this.highlightedChartState = { color: colorChar, type: nagType };
        // 🔥 FIX: Chart.js requires a full update to visibly resize the dots
        if (this.evalChart) this.forceRenderCharts();
    }
renderChapters() {
        const container = document.getElementById('chapters-list-container');
        if (!container || !window.game) return;

        container.innerHTML = ''; 
        
        window.game.chapters.forEach((chap, idx) => {
            const isActive = idx === window.game.activeChapterIndex;
            const el = document.createElement('div');
            
            // 🔥 Exact Lichess list styling!
            el.style.cssText = `
                display: flex;
                align-items: center;
                padding: 8px 12px;
                cursor: pointer;
                color: ${isActive ? '#fff' : '#bababa'};
                background: ${isActive ? '#383531' : 'transparent'};
                border-left: 3px solid ${isActive ? '#d85000' : 'transparent'};
                font-size: 13px;
                transition: background 0.1s;
                pointer-events: auto; /* 🔥 THE FIX: Force clicks to register */
            `;
            
            el.onmouseenter = () => { 
                if(!isActive) el.style.background = '#302e2b'; 
                const gear = el.querySelector('.chapter-gear');
                if (gear) gear.style.opacity = '1';
            };
            el.onmouseleave = () => { 
                if(!isActive) el.style.background = 'transparent'; 
                const gear = el.querySelector('.chapter-gear');
                if (gear) gear.style.opacity = '0';
            };

            el.innerHTML = `
                <span style="width: 25px; color: #888; font-size: 12px; font-family: monospace;">${idx + 1}</span>
                <span style="flex-grow: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: ${isActive ? '600' : 'normal'};">${chap.title}</span>
                <button class="chapter-gear" title="Edit chapter" style="background: none; border: none; color: #bababa; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0 5px; opacity: 0; transition: opacity 0.1s, color 0.1s; margin-left: 5px;">
                    <div style="width: 16px; height: 16px;">
                        ${ICON_SETTING_SVG}
                    </div>
                </button>
            `;
            
            el.onclick = (e) => {
                if (e.target.closest('.chapter-gear')) {
                    e.stopPropagation();
                    this.openChapterModal(idx);
                } else {
                    window.game.loadChapter(idx);
                }
            };
            
            container.appendChild(el);
        });

        // Update the top counter
        const countSpan = document.getElementById('chapter-count-header');
        if (countSpan) countSpan.innerText = `${window.game.chapters.length} ${window.game.chapters.length === 1 ? 'Chapter' : 'Chapters'}`;
    }
openChapterModal(idx = -1) {
        const modal = document.getElementById('chapterModal');
        const title = document.getElementById('chapterModalTitle');
        const nameInput = document.getElementById('chapterNameInput');
        const orientInput = document.getElementById('chapterOrientationInput');
        const tabs = document.getElementById('chapterModalTabs');
        const saveBtn = document.getElementById('saveChapterBtn');
        const delBtn = document.getElementById('deleteChapterBtn');
        
        window._editingChapterIdx = idx; // Cache what we are editing

        if (idx === -1) {
            // 🔥 NEW CHAPTER MODE
            title.innerText = "New chapter";
            nameInput.value = `Chapter ${window.game.chapters.length + 1}`;
            orientInput.value = 'w';
            tabs.style.display = 'flex'; // Show Tabs
            saveBtn.innerText = "CREATE CHAPTER";
            delBtn.style.display = "none";
        } else {
            // 🔥 EDIT CHAPTER MODE
            const chap = window.game.chapters[idx];
            title.innerText = "Edit chapter";
            nameInput.value = chap.title;
            orientInput.value = chap.orientation || 'w';
            tabs.style.display = 'none'; // Hide Tabs
            saveBtn.innerText = "SAVE CHAPTER";
            delBtn.style.display = window.game.chapters.length > 1 ? "block" : "none";
        }
        
        modal.style.display = 'flex';
        setTimeout(() => { nameInput.focus(); nameInput.select(); }, 50);
    }
switchChapterTab(tabName) {
        window._activeChapterTab = tabName;
        
        // 1. Reset all tabs to gray
        const tabs = ['empty', 'editor', 'url', 'fen', 'pgn'];
        tabs.forEach(t => {
            const el = document.getElementById('cTab-' + t);
            if (el) {
                el.style.color = '#888';
                el.style.borderBottom = 'none';
            }
        });

        // 2. Highlight the active tab in Lichess Orange
        const activeEl = document.getElementById('cTab-' + tabName);
        if (activeEl) {
            activeEl.style.color = '#d85000';
            activeEl.style.borderBottom = '2px solid #d85000';
        }

        // 3. Handle the dynamic text area
        const dynamicArea = document.getElementById('chapterModalDynamicArea');
        const dataInput = document.getElementById('chapterDataInput');
        
        if (!dynamicArea || !dataInput) return;

        if (tabName === 'empty') {
            dynamicArea.style.display = 'none';
        } else if (tabName === 'editor') {
            dynamicArea.style.display = 'block';
            // Grab the FEN from the current visual board
            dataInput.value = window.game ? window.game.generateFEN() : "";
            dataInput.disabled = true; // Lock it so they know it's automatic
            dataInput.style.opacity = "0.6";
        } else {
            dynamicArea.style.display = 'block';
            dataInput.disabled = false;
            dataInput.style.opacity = "1";
            dataInput.value = "";
            
            // Change the placeholder based on what they clicked
            if (tabName === 'fen') dataInput.placeholder = "Paste starting FEN here...";
            if (tabName === 'pgn') dataInput.placeholder = "Paste PGN game data here...";
            if (tabName === 'url') dataInput.placeholder = "Paste Lichess game URL (e.g., https://lichess.org/...) or raw .pgn link";
            
            setTimeout(() => dataInput.focus(), 50);
        }
    }
importFEN() {
        const fen = document.getElementById('exportFenText').value.trim();
        if (fen) {
            window.game.loadFEN(fen);
            this.updateHistory(true);
            this.renderBoard(true);
            document.getElementById('shareExportModal').style.display = 'none';
        }
    }
importPGN() {
        const pgnText = document.getElementById('exportPgnText').value.trim();
        
        if (pgnText && window.game) {
            const extractedGames = pgnText
                .split(/(?=\[Event\s+")/g)
                .filter(chapter => chapter.trim().length > 10);

            if (extractedGames.length > 0) {
                if (extractedGames.length > 1) {
                    // 🔥 MULTI-GAME IMPORT: Create a brand new Study!
                    const newChapters = extractedGames.map((gameStr, idx) => {
                        const chapterMatch = gameStr.match(/\[ChapterName\s+"([^"]+)"\]/);
                        const eventMatch = gameStr.match(/\[Event\s+"([^"]+)"\]/);
                        const title = chapterMatch ? chapterMatch[1] : (eventMatch ? eventMatch[1] : `Chapter ${idx + 1}`);
                        return { title: title, pgn: gameStr.trim() };
                    });
                    
                    const newStudyId = 'study_' + Date.now();
                    const newStudy = {
                        id: newStudyId,
                        title: newChapters[0].title || "Imported Study", // Name it after the first game
                        chapters: newChapters,
                        activeChapterIndex: 0
                    };
                    
                    // Add it to the list and instantly load it (making it the active study)
                    window.game.allStudies.push(newStudy);
                    window.game.loadStudy(newStudyId);
                    
                } else {
                    // 🔥 SINGLE-GAME IMPORT: Append as a new chapter and jump to it!
                    const gameStr = extractedGames[0];
                    const chapterMatch = gameStr.match(/\[ChapterName\s+"([^"]+)"\]/);
                    const eventMatch = gameStr.match(/\[Event\s+"([^"]+)"\]/);
                    const title = chapterMatch ? chapterMatch[1] : (eventMatch ? eventMatch[1] : `Chapter ${window.game.chapters.length + 1}`);
                    
                    // Add to the end of the current study
                    window.game.chapters.push({ title: title, pgn: gameStr.trim() });
                    
                    // Instantly load and jump to the newly added chapter at the bottom
                    window.game.loadChapter(window.game.chapters.length - 1);
                }
            }
            
            // Close the modal
            const modal = document.getElementById('shareExportModal');
            if (modal) modal.style.display = 'none';
            
            // Force the sidebars to visually redraw
            if (typeof this.renderChapters === 'function') this.renderChapters();
            if (typeof this.renderStudyList === 'function') this.renderStudyList();
        }
    }
openStudyManager() {
        if (window.game) window.game.loadAllStudies();
        this.renderStudyList();
        document.getElementById('studyManagerModal').style.display = 'flex';
    }
openExportStudyModal() {
        if (window.game) window.game.saveActiveChapter(); 
        const container = document.getElementById('exportChapterList');
        if (!container) return;
        container.innerHTML = '';
        
        window.game.chapters.forEach((ch, idx) => {
            const label = document.createElement('label');
            label.style.cssText = "display: flex; gap: 10px; align-items: center; padding: 5px; cursor: pointer; color: #ccc;";
            
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = true;
            cb.className = 'chapter-export-cb';
            cb.dataset.idx = idx;
            cb.style.cursor = "pointer";
            
            const text = document.createElement('span');
            text.innerText = `${idx + 1}. ${ch.title}`;
            
            label.appendChild(cb);
            label.appendChild(text);
            container.appendChild(label);
        });
        
        document.getElementById('exportStudyModal').style.display = 'flex';
    }
toggleAllChapters(state) {
        document.querySelectorAll('.chapter-export-cb').forEach(cb => cb.checked = state);
    }
quickImport() {
        const text = document.getElementById('quickImportText').value.trim();
        if (!text) return;
        
        // Auto-detect FEN or PGN
        if (text.includes('[Event') || text.includes('1.')) {
            window.game.loadPGN(text);
        } else {
            window.game.loadFEN(text);
        }
        
        document.getElementById('quickImportModal').style.display = 'none';
        
        // Let the game class handle the redraws if possible. 
        // Only call these if your game class DOES NOT automatically update the UI after loading.
        if (typeof this.updateHistory === 'function') this.updateHistory(true);
        if (typeof this.renderBoard === 'function') this.renderBoard(true);
    }
openChapterManager() {
        if (window.game) window.game.saveActiveChapter(); 
        const container = document.getElementById('chapterManagerList');
        if (!container) return;
        container.innerHTML = '';
        
        window.game.chapters.forEach((ch, idx) => {
            const div = document.createElement('div');
            div.style.cssText = "display: flex; gap: 10px; align-items: center; padding: 8px; background: #333; border-radius: 4px;";
            
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'chapter-cb';
            cb.dataset.idx = idx;
            cb.style.cursor = "pointer";
            
            const text = document.createElement('span');
            text.innerText = `${idx + 1}. ${ch.title}`;
            text.style.flex = "1";
            text.style.color = idx === window.game.activeChapterIndex ? "#38bdf8" : "#fff";
            text.style.fontWeight = idx === window.game.activeChapterIndex ? "bold" : "normal";

            const loadBtn = document.createElement('button');
            loadBtn.innerText = "Load";
            loadBtn.className = "btn-secondary";
            loadBtn.style.padding = "4px 10px";
            loadBtn.style.fontSize = "12px";
            loadBtn.onclick = () => {
                window.game.loadChapter(idx);
                document.getElementById('chapterManagerModal').style.display = 'none';
            };
            
            div.appendChild(cb);
            div.appendChild(text);
            div.appendChild(loadBtn);
            container.appendChild(div);
        });
        
        document.getElementById('chapterManagerModal').style.display = 'flex';
    }
renderStudyList() {
        const container = document.getElementById('studyListContainer');
        if (!container) return;
        container.innerHTML = '';
        const studies = window.game.allStudies || [];
        
        studies.forEach((study, idx) => {
            const div = document.createElement('div');
            div.style.cssText = "display: flex; gap: 10px; align-items: center; padding: 8px; background: #333; border-radius: 4px;";
            
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'study-cb';
            cb.dataset.id = study.id;
            cb.style.cursor = "pointer";

            const title = document.createElement('span');
            title.innerText = study.title || `Study ${idx + 1}`;
            title.style.flex = "1";
            title.style.fontWeight = study.id === window.game.currentStudyId ? "bold" : "normal";
            title.style.color = study.id === window.game.currentStudyId ? "#38bdf8" : "#fff";
            
            const loadBtn = document.createElement('button');
            loadBtn.className = "btn-primary";
            loadBtn.innerText = "Load";
            loadBtn.style.padding = "4px 10px";
            loadBtn.style.fontSize = "12px";
            loadBtn.onclick = () => { 
                window.game.loadStudy(study.id); 
                document.getElementById('studyManagerModal').style.display = 'none';
            };
            
            div.appendChild(cb);
            div.appendChild(title);
            div.appendChild(loadBtn);
            container.appendChild(div);
        });
    }
async _drawBoardToCanvas(canvas, ctx) {
        // 1. Draw Board Background
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--board-light').trim() || '#f0d9b5';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const darkColor = getComputedStyle(document.documentElement).getPropertyValue('--board-dark').trim() || '#b58863';
        const canvasSq = canvas.width / 8;

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if ((r + c) % 2 !== 0) {
                    ctx.fillStyle = darkColor;
                    ctx.fillRect(c * canvasSq, r * canvasSq, canvasSq, canvasSq);
                }
            }
        }

        const piecesLayer = document.getElementById('piecesLayer');
        if (!piecesLayer) return;
        
        const boardRect = piecesLayer.getBoundingClientRect();
        const domSqSize = boardRect.width / 8;

        // 🔥 THE FIX: Strictly filter out any captured pieces or pieces fading out!
        const pieces = Array.from(piecesLayer.children).filter(p => {
            const style = window.getComputedStyle(p);
            return style.display !== 'none' && style.opacity !== '0' && style.visibility !== 'hidden';
        });

        const drawPromises = pieces.map(p => {
            return new Promise((resolve) => {
                const pieceRect = p.getBoundingClientRect();
                const col = Math.round((pieceRect.left - boardRect.left) / domSqSize);
                const row = Math.round((pieceRect.top - boardRect.top) / domSqSize);

                // Ignore any pieces that have been animated completely off the board
                if (col < 0 || col > 7 || row < 0 || row > 7) {
                    resolve(); return;
                }

                let src = null;
                const img = p.tagName.toLowerCase() === 'img' ? p : p.querySelector('img');
                const svg = p.querySelector('svg');
                const bgImg = window.getComputedStyle(p).backgroundImage;

                if (img && img.src) {
                    src = img.src;
                } else if (svg) {
                    const svgString = new XMLSerializer().serializeToString(svg);
                    src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));
                } else if (bgImg && bgImg !== 'none' && bgImg.includes('url')) {
                    src = bgImg.slice(4, -1).replace(/"/g, "").replace(/'/g, "");
                }

                if (!src) { resolve(); return; } 

                const tempImg = new Image();
                tempImg.crossOrigin = "Anonymous";
                
                tempImg.onload = () => {
                    ctx.drawImage(tempImg, col * canvasSq, row * canvasSq, canvasSq, canvasSq);
                    resolve();
                };
                
                tempImg.onerror = () => resolve(); 
                tempImg.src = src; 
            });
        });

        await Promise.all(drawPromises);
    }
generateGIF() {
         
        const previewArea = document.getElementById('gifPreviewArea');
        if (!previewArea) return;
        
        if (typeof window.GIF === 'undefined') {
            previewArea.innerHTML = "<span style='color: #fa412d;'>Error: gif.js library missing!</span>";
            return;
        }

        previewArea.innerHTML = "Initializing capture... <br>(Do not close modal)";
        
        const gifSize = 400;
        const gifDelay = 600; 
        
        const canvas = document.createElement('canvas');
        canvas.width = gifSize;
        canvas.height = gifSize;
        const ctx = canvas.getContext('2d');

        const gif = new window.GIF({
            workers: 2,
            quality: 10,
            width: gifSize,
            height: gifSize,
            workerScript: './js/gif.worker.js', 
            background: '#ffffff',
            transparent: null
        });

        gif.on('progress', function(p) {
            previewArea.innerHTML = `Encoding: ${Math.round(p * 100)}%`;
        });

        gif.on('finished', function(blob) {
            const url = URL.createObjectURL(blob);
            previewArea.innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:contain;">`;
            
            const a = document.createElement('a');
            a.href = url;
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
            a.download = `chess_game_${dateStr}.gif`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });

        if (!window.game) return;
        
        const originalNode = window.game.currentNode;
        
        // 1. Temporarily disable animations for a clean, instant snap!
        const animCheckbox = document.getElementById('enableAnimations');
        const wasAnimating = animCheckbox ? animCheckbox.checked : false;
        if (animCheckbox && wasAnimating) {
            animCheckbox.checked = false;
            if (typeof window.ui.toggleAnimations === 'function') window.ui.toggleAnimations();
        }
        
        // 2. 🔥 FORCE HARD RESET to Move 1 (Bypass goToStart completely) 🔥
        window.game.currentNode = window.game.rootNode;
        window.game.engine.load(window.game.rootNode.fen);
        this.renderBoard(false); // Instantly visually redraw the starting position
        
        const captureFrameLoop = async () => {
            // Wait 50ms for the HTML/DOM to finish snapping pieces into place
            await new Promise(r => setTimeout(r, 50));

            // Paint the current board
            await this._drawBoardToCanvas(canvas, ctx);
            gif.addFrame(canvas, { delay: gifDelay, copy: true });
            
            // Move Forward!
            if (window.game.currentNode.children && window.game.currentNode.children.length > 0) {
                
                // 🔥 THE FIX: Use your app's native stepForward so the board state actively updates!
                window.game.stepForward(); 
                
                // Loop to the next frame
                captureFrameLoop(); 
            } else {
                gif.addFrame(canvas, { delay: 2000, copy: true });
                previewArea.innerHTML = "Encoding frames...<br>Please wait.";
                
                // Put the user back where they started
                window.game.currentNode = originalNode;
                window.game.engine.load(originalNode.fen);
                this.renderBoard(false);
                
                // Restore their animation settings
                if (animCheckbox && wasAnimating) {
                    animCheckbox.checked = true;
                    if (typeof window.ui.toggleAnimations === 'function') window.ui.toggleAnimations();
                }

                gif.render();
            }
        };

        // Start the loop after a brief delay to ensure the board has reset!
        setTimeout(captureFrameLoop, 400); 
    }
exportEmbed() {
        if (!window.game) return;
        const pgn = window.game.generatePGN();
        const baseUrl = window.location.origin + window.location.pathname;
        
        // Generate a random unique ID for the iframe script
        const embedId = 'embed-' + Math.floor(Math.random() * 10000000);
        
        // Encode the PGN into the URL
        const embedUrl = `${baseUrl}?embed=true&embedId=${embedId}&pgn=${encodeURIComponent(pgn)}`;
        
        // Construct the chess.com-style iframe with the auto-resize listener
        const embedHtml = `<iframe id="${embedId}" allowtransparency="true" frameborder="0" style="width:100%; border:none; min-height: 480px;" src="${embedUrl}"></iframe><script nonce="chess-diagram">window.addEventListener("message",e=>{e['data']&&"${embedId}"===e['data']['id']&&document.getElementById(e['data']['id'])&&(document.getElementById(e['data']['id']).style.height=\`\${e['data']['frameHeight']+37}px\`)});<\/script>`;
        
        // Copy to clipboard and alert using custom notification
        navigator.clipboard.writeText(embedHtml).then(() => {
            this.showNotification("Embed Copied", "✅ Embed code copied to clipboard!\n\nYou can paste this HTML into any website or blog.");
        });
    }
importEmbed(htmlString) {
        if (!htmlString || !window.game) return;
        
        // 1. Try to extract a URL from the src attribute of an iframe
        const srcMatch = htmlString.match(/src=["'](.*?)["']/);
        
        if (srcMatch && srcMatch[1]) {
            try {
                // Determine if it's a URL
                let urlStr = srcMatch[1];
                // If it's a relative URL, prepend a dummy origin to make the URL parser happy
                if (urlStr.startsWith('/')) urlStr = window.location.origin + urlStr;
                
                const url = new URL(urlStr);
                const pgn = url.searchParams.get('pgn');
                const fen = url.searchParams.get('fen');
                
                if (pgn) {
                    window.game.loadPGN(decodeURIComponent(pgn));
                    this.switchTab('analysis');
                    this.showNotification("Success", "✅ Game imported successfully from the embed code!");
                } else if (fen) {
                    window.game.loadFEN(decodeURIComponent(fen));
                    this.switchTab('analysis');
                    this.showNotification("Success", "✅ Position imported successfully from the embed code!");
                } else {
                    this.showNotification("Import Error", "❌ Could not find PGN or FEN data inside this embed URL.");
                }
            } catch (e) {
                console.error("Failed to parse Embed URL", e);
                this.showNotification("Import Error", "❌ Invalid embed URL format.");
            }
        } else {
            this.showNotification("Import Error", "❌ Could not find a valid <iframe> in the text you pasted.");
        }
    }
toggleCheckboxes(className, state) {
        document.querySelectorAll('.' + className).forEach(cb => cb.checked = state);
    }
}