import { INITIAL_FEN, FILES, RANKS, ICON_BOOK_SVG,SETTINGS_ICON_IMG } from './constants.js';
import { MoveNode } from './MoveNode.js';
export class ChessGame {
constructor() {
        this.engine = new (typeof Chess === 'function' ? Chess : window.Chess)();
        this.pieceIdCounter = 0;
        this.rootNode = new MoveNode(INITIAL_FEN, null);
        this.currentNode = this.rootNode;
        this.board = Array(64).fill(null);
        this.pgnHeaders = {};
        this.isChess960 = false;
        // --- Timers ---
        this.whiteStartSeconds = 600;
        this.blackStartSeconds = 600;
        this.whiteIncrement = 0;
        this.blackIncrement = 0;
        this.whiteTime = 600;
        this.blackTime = 600;
        this.timerInterval = null;
        // --- Study Data ---
        this.studyTitle = "My Lichess Study";
        this.chapters = [{ title: "Chapter 1", pgn: "" }];
        this.activeChapterIndex = 0;
        this.currentStudyId = 'default';
        this.allStudies = [];
        
        // 🔥 THE FIX: Lock the auto-save function during startup!
        this._isBooting = true; 

        this.loadAllStudies();

        // 1. Synchronously load the data into memory BEFORE the UI even exists
        if (this.allStudies && this.allStudies.length > 0) {
            let activeStudy = this.allStudies.find(s => s.id === (this.currentStudyId || 'default')) || this.allStudies[0];
            if (activeStudy && activeStudy.chapters && activeStudy.chapters.length > 0) {
                this.currentStudyId = activeStudy.id;
                this.studyTitle = activeStudy.title || "My Lichess Study";
                this.chapters = activeStudy.chapters; 
                this.activeChapterIndex = activeStudy.activeChapterIndex || 0;
            }
        }

        // 2. Wait for the HTML to render, then physically put the moves on the board
        setTimeout(() => {
            if (this.chapters && this.chapters.length > 0 && this.chapters[this.activeChapterIndex]) {
                const pgnToLoad = this.chapters[this.activeChapterIndex].pgn;
                // Safely load the PGN if it exists
                if (pgnToLoad && typeof this.loadPGN === 'function') {
                    this.loadPGN(pgnToLoad);
                }
            }
            
            // 🔥 UNLOCK SAVING: The board is now fully loaded, auto-saving is safe again!
            this._isBooting = false; 
            
            // Force the sidebar to visually update
            if (window.ui && typeof window.ui.renderChapters === 'function') {
                window.ui.renderChapters();
            }
        }, 150);
        // --- Unified Game State ---
        // Valid Modes: 'analysis', 'editor', 'local', 'bot', 'puzzle'
        this.mode = 'analysis'; 
        this.gameOver = false;
        this.isPaused = false;
        this.botColor = null;
        this.puzzleActive = false;
        // --- Board Data ---
        this.castling = { wK:true, wQ:true, bK:true, bQ:true };
        this.enPassant = null;
        this.premoveQueue = [];
        this.premoveMode = 'multi';
        this.lastMoveTime = Date.now(); 
        
        this.loadFEN(INITIAL_FEN);
    }
get isAnalysisMode() { return this.mode === 'analysis' || this.gameOver; }
get isAnalyzing() { return window.engineAnalysing === true; } // True ONLY if engine is actively thinking
get isEditing() { return this.mode === 'editor'; }
get isPlayingLiveGame() { return (this.mode === 'local' || this.mode === 'bot') && !this.gameOver; }
get isPuzzle() { return this.mode === 'puzzle'; }
get currentLiveTurn() {
        if (!this.isPlayingLiveGame) return this.turn;
        let node = this.rootNode;
        while (node && node.children.length > 0) {
            node = node.children[node.selectedChildIndex || 0];
        }
        if (node && node.fen) return node.fen.split(' ')[1];
        return this.turn;
    }
get currentLiveFen() {
        if (!this.isPlayingLiveGame) return this.generateFEN();
        let node = this.rootNode;
        while (node && node.children.length > 0) {
            node = node.children[node.selectedChildIndex || 0];
        }
        if (node && node.fen) return node.fen;
        return this.generateFEN();
    }
async loadEngineFromFolder() {
        if (!window.showDirectoryPicker) return window.ui.showNotification("Browser not supported (Use Chrome).", "Error", "❌");
        
        try {
            const dirHandle = await window.showDirectoryPicker();
            let js, wasm;
            for await (const entry of dirHandle.values()) {
                if (entry.name.endsWith('.js') && (entry.name.includes('stockfish') || entry.name.includes('engine'))) js = await entry.getFile();
                if (entry.name.endsWith('.wasm') && (entry.name.includes('stockfish') || entry.name.includes('engine'))) wasm = await entry.getFile();
            }

            if (js && wasm) this.initEngine(js, wasm);
            else window.ui.showNotification("Missing .js or .wasm files.", "Load Failed", "⚠️");
        } catch (e) { console.log("Load Cancelled"); }
    }
async initEngine(jsFile = null, wasmFile = null) {
        if (window.sfWorker) {
            window.sfWorker.terminate();
            window.sfWorker = null;
        }

        try {
            let engineDisplayName = "Stockfish"; 

            if (jsFile && wasmFile) {
                engineDisplayName = jsFile.name.replace('.js', ''); 
                const jsUrl = URL.createObjectURL(jsFile);
                const wasmUrl = URL.createObjectURL(wasmFile);
                
                const blobContent = `
                    var Module = { 
                        locateFile: function(path) { 
                            if (path.endsWith('.wasm')) return '${wasmUrl}';
                            return path; 
                        },
                        wasmBinaryFile: '${wasmUrl}' 
                    };
                    var originalFetch = fetch;
                    self.fetch = function(url, options) {
                        if (typeof url === 'string' && (url === 'stockfish.wasm' || url.endsWith('.wasm'))) {
                            return originalFetch('${wasmUrl}', options);
                        }
                        return originalFetch(url, options);
                    };
                    importScripts('${jsUrl}');
                `;
                const blob = new Blob([blobContent], { type: 'application/javascript' });
                const workerUrl = URL.createObjectURL(blob) + '#' + encodeURIComponent(wasmUrl);
                window.sfWorker = new Worker(workerUrl);
                
                const input = document.getElementById('assetEngineFolder');
                if(input) input.value = jsFile.name;
            } else {
                engineDisplayName = "Engine Loading..."; 
                const DEFAULT_ENGINE = '/stockfish.js';
                window.sfWorker = new Worker(DEFAULT_ENGINE);
                const input = document.getElementById('assetEngineFolder');
                if(input) input.value = ''; 
            }

            if (window.ui && typeof window.ui.updateEngineName === 'function') {
                window.ui.updateEngineName(engineDisplayName);
            }

            console.log("⚙️ [ENGINE] Booting up Web Worker...");
            
            // 🔥 FIX 1: ATTACH EARS BEFORE SPEAKING
            window.sfWorker.onerror = function(e) { console.error("[ENGINE ERROR]", e); };
            window.sfWorker.onmessage = (event) => this.handleEngineMessage(event);

            window.engineReady = false; 
            window.sfWorker.postMessage('uci'); 

        } catch (e) {
            console.error("Engine Init Failed", e);
        }
    }
updateStockfish() {
        if (!window.engineAnalysing) {
            this._pendingFen = null;
            this._pendingNode = null; 
            if (this._engineTimeout) clearTimeout(this._engineTimeout);
            
            if (window.sfWorker) {
                window.sfWorker.postMessage('stop');
                window.engineReady = true; 
            }
            
            const box = document.getElementById('engine-lines-box');
            if (box) box.innerHTML = ''; 
            const arrowRoot = document.getElementById('tempArrowRoot');
            if (arrowRoot) arrowRoot.innerHTML = '';
            const depthEl = document.getElementById('depth-display');
            if (depthEl) depthEl.innerText = '';
            
            if (window.ui && typeof window.ui.updateEvalBar === 'function') {
                window.ui.updateEvalBar('cp', 0);
            }
            return; 
        }

        // 1. Hard Halt
        if (window.sfWorker) {
            window.sfWorker.postMessage('stop');
            window.engineReady = false; 
        }

        // 2. Clear any pending pings from previous rapid clicks
        if (this._engineTimeout) clearTimeout(this._engineTimeout);

        // 3. Wipe the visual data immediately
        const box = document.getElementById('engine-lines-box');
        if (box) box.innerHTML = '<div id="calc-placeholder" style="color:#888; font-size:13px; font-style:italic; padding:8px;">Calculating...</div>';
        const arrowRoot = document.getElementById('tempArrowRoot');
        if (arrowRoot) arrowRoot.innerHTML = '';
        const depthEl = document.getElementById('depth-display');
        if (depthEl) depthEl.innerText = 'Depth: 0 | Nps: 0';

        // 4. Update the final destination FEN & LOCK THE NODE
        this._pendingFen = this.currentNode ? this.currentNode.fen : this.generateFEN();
        this._pendingNode = this.currentNode; // 🔥 THE FIX: Lock the node we are about to calculate!

        // 5. Wait until the user STOPS clicking, then ping the engine!
        this._engineTimeout = setTimeout(() => {
            if (!window.sfWorker) {
                console.warn("⚠️ [ENGINE] No Web Worker found! Booting default engine...");
                this.initEngine();
                return;
            }
            if (!window.sfWorker.onmessage) {
                window.sfWorker.onmessage = (e) => this.handleEngineMessage(e);
            }
            
            window.sfWorker.postMessage('isready'); 
        }, 250); 
    }
triggerEngineGo(fen) {
        // 🔥 THE FIX: Identify the exact node we are applying this to!
        let targetNode = this.analyzingNode || this.currentNode;

        let isOver = false, isMate = false, tTurn = 'w';
        try {
            const tempChess = new (typeof Chess === 'function' ? Chess : window.Chess)();
            tempChess.set960(this.isChess960);
            let loaded = tempChess.load(fen);
            if (!loaded && typeof this.patchEngineFor960 === 'function') {
                this.patchEngineFor960.call(tempChess);
                loaded = tempChess.load(fen);
            }
            if (loaded) {
                isOver = tempChess.isGameOver ? tempChess.isGameOver() : tempChess.game_over?.();
                isMate = tempChess.isCheckmate ? tempChess.isCheckmate() : tempChess.in_checkmate?.();
                tTurn = tempTurn = tempChess.turn();
            }
        } catch(e) { }

        if (isOver) {
            if (isMate) {
                let whiteWon = tTurn === 'b';
                let score = whiteWon ? 100000 : -100000;
                let str = whiteWon ? "+M0" : "-M0";
                if (this.mode === 'bot' || this.mode === 'local') { targetNode.evalScore = score; targetNode.eval = str; } 
                else { targetNode.localEvalScore = score; targetNode.localEval = str; }
                
                if (window.ui && typeof window.ui.updateEvalBar === 'function' && targetNode === this.currentNode) {
                    window.ui.updateEvalBar('mate', whiteWon ? 1 : -1);
                }
            } else { 
                if (this.mode === 'bot' || this.mode === 'local') { targetNode.evalScore = 0; targetNode.eval = "0.00"; } 
                else { targetNode.localEvalScore = 0; targetNode.localEval = "0.00"; }
                
                if (window.ui && typeof window.ui.updateEvalBar === 'function' && targetNode === this.currentNode) {
                    window.ui.updateEvalBar('cp', 0);
                }
            }
            
            if (targetNode === this.currentNode) {
                const box = document.getElementById('engine-lines-box');
                if (box) box.innerHTML = '';
                if (window.ui && typeof window.ui.renderCharts === 'function') requestAnimationFrame(() => {window.ui.renderCharts();});
            }
            return; 
        }

        window.engineReady = true; 

        window.sfWorker.postMessage('setoption name UCI_Chess960 value ' + (this.isChess960 ? 'true' : 'false'));
        window.sfWorker.postMessage('setoption name UCI_LimitStrength value false');
        window.sfWorker.postMessage('setoption name Skill Level value 20');
        window.sfWorker.postMessage('setoption name MultiPV value 3');
        window.sfWorker.postMessage('position fen ' + fen);
        
        const depth = document.getElementById('engineDepth')?.value || 99;
        window.sfWorker.postMessage('go depth ' + depth);
    }
handleEngineMessage(e) {
        if (typeof e.data !== 'string') return;
        const line = e.data.trim(); 
        if (!line) return;

        // 🔥 THE FIX: Allow Study mode to process engine lines!
        const isAnalysingOrStudy = (this.mode === 'analysis' || this.mode === 'study');

        if (isAnalysingOrStudy && window.engineAnalysing && !window.engineReady && (line.startsWith('info') || line.startsWith('bestmove'))) {
            return; 
        }

        if (line === 'readyok') {
            if (isAnalysingOrStudy && window.engineAnalysing && this._pendingFen) {
                const targetFen = this._pendingFen;
                this.analyzingNode = this._pendingNode;
                this._pendingFen = null; 
                this._pendingNode = null;
                this.triggerEngineGo(targetFen); 
            }
            return; 
        }

        if (line.startsWith('id name ')) {
            const engineName = line.replace('id name ', '');
            if (window.ui && typeof window.ui.updateEngineName === 'function') window.ui.updateEngineName(engineName);
            return;
        }

        if (line === 'uciok') {
            let threads = Math.floor(navigator.hardwareConcurrency-1);
            if (threads < 1) threads = 1;
            
            window.sfWorker.postMessage('setoption name Threads value ' + threads);
            window.sfWorker.postMessage('setoption name Hash value 1024');
            window.sfWorker.postMessage('setoption name MultiPV value 3');
            window.sfWorker.postMessage('setoption name Move Overhead value 10');
            window.sfWorker.postMessage('setoption name UCI_LimitStrength value false');
            window.sfWorker.postMessage('setoption name Skill Level value 20');
            window.sfWorker.postMessage('isready'); 
            return;
        }

if (line.startsWith('bestmove')) {
            const liveTurn = this.currentLiveTurn || this.turn;
            if (this.mode === 'bot' && liveTurn === this.botColor) {
                const match = line.match(/bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
                console.log(match);
                // 🔥 Cache the verify state and IMMEDIATELY clear the locks
                const isVerifying = !!this.verifyingBookMove;
                const candidate = this.verifyingBookMove;
                const score = this.verifyingBookScore;
                const type = this.verifyingBookType;
                const threshold = this.verifyingBookThreshold !== undefined ? this.verifyingBookThreshold : -150;
                
                this.verifyingBookMove = null;
                this.verifyingBookScore = null;
                this.verifyingBookType = null;
                this.verifyingBookThreshold = null;

                if (match) {
                    let moveUCI = match[1];

                    // Did we just verify a book move?
                    if (isVerifying) {
                        let isBadMove = false;
                        
                        if (type === 'mate' && score < 0) {
                            isBadMove = true;
                        } else if (type === 'cp' && (score === null || score < threshold)) {
                            isBadMove = true;
                        }

                        if (isBadMove) {
                            console.log(`%c[BOT] Book move ${candidate} rejected (Score: ${score}). Recalculating...`, "color:#fa412d");
                            this.triggerBotMove(true); // ignoreBook = true, calculate normal move
                        } else {
                            console.log(`%c[BOT] Book move ${candidate} verified (Score: ${score}).`, "color:#96bc4b");
                            this.executeBotMoveWithDelay(candidate);
                        }
                        return;
                    }

                    // Standard Engine Move
                    this.executeBotMoveWithDelay(moveUCI);
                } else {
                    // 🔥 FAILSAFE: Stockfish output "bestmove (none)"
                    if (isVerifying) {
                        this.triggerBotMove(true); // Book move was invalid, try standard calculation
                    } else {
                        // Stockfish completely crashed. Force a random legal move to unstick the game.
                        const legalMoves = this.engine.moves({ verbose: true });
                        if (legalMoves.length > 0) {
                            const choice = legalMoves[0];
                            this.executeBotMoveWithDelay(choice.from + choice.to + (choice.promotion || ''));
                        }
                    }
                }
            }
            return;
        }

        if (line.startsWith('info') && line.includes('score')) {
            const multiPvMatch = line.match(/multipv (\d+)/);
            const lineIndex = multiPvMatch ? parseInt(multiPvMatch[1]) : 1;
            
            const depthMatch = line.match(/depth (\d+)/);
            const depth = depthMatch ? parseInt(depthMatch[1]) : 0;
            const pvMatch = line.match(/ pv (.+)/);
            const rawMoves = pvMatch ? pvMatch[1].split(' ') : [];

            if (rawMoves.length === 0) return;

            let score = 0; let type = 'cp'; let rawEval = 0; 
            const cpMatch = line.match(/score cp (-?\d+)/);
            const mateMatch = line.match(/score mate (-?\d+)/);

            if (mateMatch) { score = parseInt(mateMatch[1]); type = 'mate'; }
            else if (cpMatch) { score = parseInt(cpMatch[1]); }

            if (this.mode === 'bot' && this.verifyingBookMove) {
                this.verifyingBookScore = score;
                this.verifyingBookType = type;
                return; 
            }

            // 🔥 THE FIX: Apply evaluation to the analyzingNode, NOT whatever the current screen shows!
            const targetNode = this.analyzingNode || this.currentNode;
            const currentFen = targetNode ? targetNode.fen : this.generateFEN();
            
            let isBlackTurn = currentFen.split(' ')[1] === 'b';
            if (isBlackTurn) score *= -1; 

            if (type === 'mate') {
                if (score === 0) {
                    rawEval = isBlackTurn ? 100000 : -100000;
                } else {
                    rawEval = score > 0 ? 100000 - Math.abs(score) : -100000 + Math.abs(score);
                }
            } else {
                rawEval = score;
            }

            // Only render visual lines if the user hasn't clicked away
            if (window.engineAnalysing && window.ui && window.ui.renderAnalysisLine && targetNode === this.currentNode) {
                const placeholder = document.getElementById('calc-placeholder');
                if (placeholder) placeholder.remove();

                window.ui.renderAnalysisLine(lineIndex, type, score, rawMoves, currentFen);
            }

            if (depth >= 4 && lineIndex === 1) {
                if (targetNode) {
                    let evalFloat = rawEval / 100;
                    let evalString = type === 'mate' ? 
                        (rawEval > 0 ? "+M" : "-M") + Math.abs(score) : 
                        (evalFloat > 0 ? "+" : "") + evalFloat.toFixed(2);
                    
                    if (this.mode === 'bot' || this.mode === 'local') {
                        targetNode.evalScore = rawEval;
                        targetNode.eval = evalString;
                        targetNode.depth = depth;
                        targetNode.pv = pvMatch ? pvMatch[1] : '';
                    } else {
                        targetNode.localEvalScore = rawEval;
                        targetNode.localEval = evalString;
                        targetNode.depth = depth;
                        targetNode.pv = pvMatch ? pvMatch[1] : '';
                    }

                    // Only update history line eval if we are looking at it
                    if (window.engineAnalysing && window.ui && typeof window.ui.updateInlineEval === 'function') {
                        window.ui.updateInlineEval(targetNode);
                    }
                }
                
                // 🔥 THE FIX: DO NOT UPDATE THE BIG UI BAR IF THE USER CLICKED AWAY
                if (window.engineAnalysing && targetNode === this.currentNode) {
                    const depthEl = document.getElementById('depth-display');
                    const npsMatch = line.match(/nps (\d+)/);
                    if (depthEl) depthEl.innerText = `Depth: ${depth} | Nps: ${npsMatch ? npsMatch[1] : '-'}`;
                    
                    // 250ms Stabilizer
                    if (this._evalBarStabilizer) clearTimeout(this._evalBarStabilizer);
                    this._evalBarStabilizer = setTimeout(() => {
                        if (window.ui && typeof window.ui.updateEvalBar === 'function') {
                            window.ui.updateEvalBar(type, score);
                        }
                    }, 250);

                    const arrowRoot = document.getElementById('tempArrowRoot');
                    if (arrowRoot && window.ui && typeof window.ui.drawArrow === 'function') {
                        arrowRoot.innerHTML = '';
                        if (rawMoves.length > 0) {
                            const f = this.squareToIndex(rawMoves[0].substring(0, 2));
                            const t = this.squareToIndex(rawMoves[0].substring(2, 4));
                            window.ui.drawArrow(arrowRoot, f, t, 'blue', 0.8);
                        }
                    }

                    if (window.ui && typeof window.ui.renderCharts === 'function') {
                        if (!window.chartUpdatePending) {
                            window.chartUpdatePending = true;
                            window.ui._lastChartedFen = null; 
                            
                            requestAnimationFrame(() => { 
                                try {
                                    window.ui.renderCharts(); 
                                } catch (e) {
                                    console.error("Chart Render Error:", e);
                                } finally {
                                    window.chartUpdatePending = false; 
                                }
                            });
                        }
                    }
                }
            }
        }
    }
saveState(stateName) {
        if (!this.savedTabs) this.savedTabs = {};
        
        this.savedTabs[stateName] = {
            fen: this.generateFEN(),
            rootNode: this.rootNode,
            currentNode: this.currentNode,
            moveList: this.moveList,
            history: this.history,
            pgnHeaders: this.pgnHeaders,
            mode: this.mode,
            turn: this.turn,
            botColor: this.botColor,
            puzzleCursor: this.puzzleCursor,
            puzzleSolution: this.puzzleSolution,
            puzzleActive: this.puzzleActive,
            initialPuzzleFEN: this.initialPuzzleFEN
        };
    }
restoreState(stateName) {
        if (!this.savedTabs || !this.savedTabs[stateName]) return false;
        
        const s = this.savedTabs[stateName];
        
        // 1. Physically load the pieces back onto the board
        this.loadFEN(s.fen); 
        
        // 2. Overwrite the wiped arrays with the saved memory
        this.rootNode = s.rootNode;
        this.currentNode = s.currentNode;
        this.moveList = s.moveList;
        this.history = s.history || [];
        this.pgnHeaders = s.pgnHeaders;
        this.mode = s.mode;
        this.turn = s.turn;
        this.botColor = s.botColor;
        this.puzzleCursor = s.puzzleCursor;
        this.puzzleSolution = s.puzzleSolution;
        this.puzzleActive = s.puzzleActive;
        this.initialPuzzleFEN = s.initialPuzzleFEN;
        
        return true;
    }
async reviewGame(autoTriggered = false) {
        if (!this.rootNode) return;
        console.log("%c=== STARTING FULL GAME REVIEW ===", "color:#b369f2; font-weight:bold;");

        // 🔥 UI LOCK: Disable the engine toggle button so it can't interrupt!
        const toggleBtn = document.querySelector('.engine-toggle-btn');
        const toggleText = document.getElementById('engine-btn-name');
        if (toggleBtn) {
            toggleBtn.disabled = true;
            toggleBtn.style.opacity = '0.5';
            toggleBtn.style.cursor = 'not-allowed';
            if (toggleText) toggleText.innerText = 'Reviewing...';
        }

        try {
            if (window.sfWorker && !autoTriggered) {
                let curr = this.rootNode;
                let nodes = [curr];
                while (curr.children.length > 0) {
                    curr = curr.children[curr.selectedChildIndex || 0];
                    nodes.push(curr);
                }

                const originalOnMessage = window.sfWorker.onmessage;
                if (window.ui && window.ui.showNotification) window.ui.showNotification("Analyzing game at Depth 20...", "Review Game", "⏳");

                // 🔥 FORCE MULTIPV 1: Prevent 3rd best move scores from leaking!
                window.sfWorker.postMessage('setoption name MultiPV value 1');

                for (let i = 0; i < nodes.length; i++) {
                    let node = nodes[i];
                    if (node.reviewed|| (node.isBook && this.isEngineMatch)) continue;

                    const tempChess = new (typeof Chess === 'function' ? Chess : window.Chess)(node.fen);
                    tempChess.set960(this.isChess960);
                    if (tempChess.isGameOver ? tempChess.isGameOver() : tempChess.game_over?.()) {
                        let isMate = tempChess.isCheckmate ? tempChess.isCheckmate() : tempChess.in_checkmate?.();
                        if (isMate) {
                            let whiteWon = tempChess.turn() === 'b'; 
                            node.localEvalScore = whiteWon ? 100000 : -100000;
                            node.localEval = whiteWon ? "+M0" : "-M0";
                        } else {
                            node.localEvalScore = 0;
                            node.localEval = "0.00";
                        }
                        node.reviewed = true;
                        
                        // 🔥 THE NEW WAY: Update inline eval visually without rebuilding the DOM
                        if (window.ui && typeof window.ui.updateInlineEval === 'function') window.ui.updateInlineEval(node);
                        if (window.ui && typeof window.ui.renderCharts === 'function') window.ui.renderCharts(true);
                        continue; 
                    }

                    window.sfWorker.postMessage('stop');
                    await new Promise(r => {
                        let syncTimeout = setTimeout(r, 200); 
                        window.sfWorker.onmessage = (e) => { if (e.data === 'readyok') { clearTimeout(syncTimeout); r(); } };
                        window.sfWorker.postMessage('isready');
                    });

                    await new Promise(resolve => {
                        let lastScore = null;
                        let lastType = 'cp';
                        let isResolved = false; 
                        
                        let timeout = setTimeout(() => {
                            window.sfWorker.postMessage('stop'); 
                            setTimeout(() => { if (!isResolved) { isResolved = true; resolve(); } }, 1000);
                        }, 5000); 

                        window.sfWorker.onmessage = (e) => {
                            const line = e.data;
                            if (line.startsWith('info') && line.includes('score')) {
                                const multiPvMatch = line.match(/multipv (\d+)/);
                                if (multiPvMatch && parseInt(multiPvMatch[1]) > 1) return;

                                const cpMatch = line.match(/score cp (-?\d+)/);
                                const mateMatch = line.match(/score mate (-?\d+)/);
                                if (mateMatch) { lastScore = parseInt(mateMatch[1]); lastType = 'mate'; }
                                else if (cpMatch) { lastScore = parseInt(cpMatch[1]); lastType = 'cp'; }
                                
                                const depthMatch = line.match(/depth (\d+)/);
                                if (depthMatch && parseInt(depthMatch[1]) >= 20) {
                                    window.sfWorker.postMessage('stop');
                                }
                            } 
                            else if (line.startsWith('bestmove')) {
                                clearTimeout(timeout);
                                if (isResolved) return; 
                                
                                if (lastScore !== null) {
                                    let rawEval = lastType === 'mate' ? (lastScore > 0 ? 100000 - Math.abs(lastScore) : -100000 + Math.abs(lastScore)) : lastScore;
                                    if (node.fen.split(' ')[1] === 'b') rawEval *= -1; 

                                    node.localEvalScore = rawEval;
                                    let evalFloat = rawEval / 100;
                                    node.localEval = lastType === 'mate' ? (rawEval > 0 ? "+M" : "-M") + Math.abs(lastScore) : (evalFloat > 0 ? "+" : "") + evalFloat.toFixed(2);
                                    node.reviewed = true;
                                }
                                
                                // 🔥 THE NEW WAY: Visually insert the score AND force the chart to redraw live!
                                if (window.ui) {
                                    if (typeof window.ui.updateInlineEval === 'function') window.ui.updateInlineEval(node);
                                    if (typeof window.ui.renderCharts === 'function') window.ui.renderCharts(true);
                                }
                                
                                isResolved = true;
                                resolve(); 
                            }
                        };
                        
                        window.sfWorker.postMessage('position fen ' + node.fen);
                        window.sfWorker.postMessage('go depth 20');
                    });
                }
                
                window.sfWorker.postMessage('stop');
                await new Promise(r => {
                    let cleanupTimeout = setTimeout(r, 400); 
                    window.sfWorker.onmessage = (e) => { if (e.data === 'readyok') { clearTimeout(cleanupTimeout); r(); } };
                    window.sfWorker.postMessage('isready');
                });
                
                // Return to normal lines for standard analysis
                window.sfWorker.postMessage('setoption name MultiPV value 3'); 
                
                window.sfWorker.onmessage = originalOnMessage;
                if (window.ui && window.ui.showNotification) window.ui.showNotification("Analysis Complete!", "Review Game", "✅");
                if (window.engineAnalysing) this.updateStockfish();
            }
        
        // =========================================================
        // 2. MATHEMATICAL ACCURACY CALCULATION
        // =========================================================
        let current = this.rootNode;
        let prevIsMate = false; 
        let previousWinPct = this.calculateWinPercent(0); 
        
        let stats = {
            w: { inaccuracies: 0, mistakes: 0, blunders: 0, totalAccuracy: 0, moves: 0 },
            b: { inaccuracies: 0, mistakes: 0, blunders: 0, totalAccuracy: 0, moves: 0 }
        };

        let bookPhaseActive = true;
        let ply = 0; 
        
        while (current.children.length > 0) {
            let nextNode = current.children[current.selectedChildIndex || 0];
            let turnColor = nextNode.fen.split(' ')[1]; 
            let justMovedColor = (turnColor === 'w') ? 'b' : 'w'; 
            ply++;

            if (nextNode.nag) {
                let nags = nextNode.nag.toString().split(',').map(n => n.trim());
                nags = nags.filter(n => !['??', '?', '?!', '$4', '$2', '$6'].includes(n.replace('$', '')));
                nextNode.nag = nags.length > 0 ? nags.join(',') : null;
            }
            
            let cp = undefined;
            let isMate = false;

            if (nextNode.localEvalScore !== undefined) {
                cp = nextNode.localEvalScore;
                isMate = Math.abs(cp) >= 90000;
            }
            else if (nextNode.evalScore !== undefined) {
                cp = nextNode.evalScore;
                isMate = Math.abs(cp) >= 90000;
            }
            else if (nextNode.score && nextNode.score.unit === 'pawn') {
                cp = nextNode.score.value * 100;
            }
            else if (nextNode.score && nextNode.score.unit === 'mate') {
                cp = nextNode.score.value > 0 ? 100000 - Math.abs(nextNode.score.value) : -100000 + Math.abs(nextNode.score.value);
                isMate = true;
            }

            let cpForMath = cp;
            if (cpForMath !== undefined) {
                if (!isMate) {
                    cpForMath = Math.max(-1000, Math.min(1000, cpForMath)); 
                } else {
                    cpForMath = cpForMath > 0 ? 100000 : -100000; 
                }
            }

            let isBookMove = bookPhaseActive;
            if (nextNode.comment && nextNode.comment.match(/[A-E]\d{2}\s/)) { bookPhaseActive = false; }
            if (ply > 12) bookPhaseActive = false;

            if (cpForMath !== undefined) {
                let currentWinPct = this.calculateWinPercent(cpForMath);
                let dropInWinPct = (justMovedColor === 'w') ? previousWinPct - currentWinPct : currentWinPct - previousWinPct; 
                let moveAccuracy = this.calculateAccuracy(dropInWinPct);
                
                if (!isNaN(moveAccuracy) && !isBookMove) {
                    stats[justMovedColor].totalAccuracy += moveAccuracy;
                    stats[justMovedColor].moves += 1;
                }

                // Fresh calculations every time!
                let isBlunder = dropInWinPct >= 20 || (isMate && dropInWinPct >= 10) || (prevIsMate && !isMate && dropInWinPct >= 10);
                
                if (isBlunder) { nextNode.nag = (nextNode.nag ? nextNode.nag + ",??" : "??"); stats[justMovedColor].blunders++; } 
                else if (dropInWinPct >= 10) { nextNode.nag = (nextNode.nag ? nextNode.nag + ",?" : "?"); stats[justMovedColor].mistakes++; } 
                else if (dropInWinPct >= 5) { nextNode.nag = (nextNode.nag ? nextNode.nag + ",?!" : "?!"); stats[justMovedColor].inaccuracies++; } 

                previousWinPct = currentWinPct;
                prevIsMate = isMate;
            }
            current = nextNode;
        }

        let wAcc = stats.w.moves > 0 ? Math.round(stats.w.totalAccuracy / stats.w.moves) : 100;
        let bAcc = stats.b.moves > 0 ? Math.round(stats.b.totalAccuracy / stats.b.moves) : 100;

        if (window.ui) {
            if (typeof window.ui.showReviewResults === 'function') {
                window.ui.showReviewResults(wAcc, stats.w.blunders, stats.w.mistakes, stats.w.inaccuracies, bAcc, stats.b.blunders, stats.b.mistakes, stats.b.inaccuracies);
            }
            
            // 🔥 THE FINAL FIX: Force the UI to rebuild the PGN list so the brilliant/blunder symbols appear!
            if (typeof window.ui.updateHistory === 'function') window.ui.updateHistory(true); 
            if (typeof window.ui.renderCharts === 'function') window.ui.renderCharts(true);
        }

    } catch(e) {
            console.error("Review Game Error:", e);
        } finally {
            if (toggleBtn) {
                toggleBtn.disabled = false;
                toggleBtn.style.opacity = '1';
                toggleBtn.style.cursor = 'pointer';
                if (toggleText) {
                    toggleText.innerText = window.currentEngineShortName ? window.currentEngineShortName : "Stockfish 18";
                }
            }
        }
    }
async fetchPuzzles(min, max, count = 5) {
        const fetchMin = min !== undefined ? min : (this.sessionMinRating || 600);
        const fetchMax = max !== undefined ? max : (this.sessionMaxRating || 3000);

        if (this.isFetchingPuzzles) return false; 
        this.isFetchingPuzzles = true;

        try {
            const url = `/get-puzzles?min=${fetchMin}&max=${fetchMax}&count=${count}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Server Error: ${res.status}`);
            
            const rawData = await res.json();
            if (!Array.isArray(rawData)) return false;

            const cleanPuzzles = rawData.map(p => ({
                id: p.id || p.PuzzleId || 'unknown',
                fen: p.fen,
                moves: p.moves,
                rating: parseInt(p.rating || 0),
                themes: p.themes || ''
            })).filter(p => p.rating >= fetchMin && p.rating <= fetchMax);

            if (!this.playedPuzzleIds) this.playedPuzzleIds = new Set();
            if (!this.playedFENs) this.playedFENs = new Set();
            const uniqueToAdd = [];

            for (const p of cleanPuzzles) {
                const baseFen = p.fen ? p.fen.split(' ').slice(0, 4).join(' ') : null;
                if (p.id !== 'unknown' && !this.playedPuzzleIds.has(p.id) && (!baseFen || !this.playedFENs.has(baseFen))) {
                    uniqueToAdd.push(p);
                    this.playedPuzzleIds.add(p.id); 
                    if (baseFen) this.playedFENs.add(baseFen);
                }
            }

            if (uniqueToAdd.length === 0) return false;

            // 🔥 THE FIX: Stop sorting! We want the specific batch exactly as requested.
            this.puzzleQueue.push(...uniqueToAdd);
            return true;
            
        } catch (e) {
            console.error("Fetch Failed:", e);
            return false;
        } finally {
            this.isFetchingPuzzles = false;
        }
    }
async startPuzzleSession(mode = 'rush') {
        this.puzzleMode = mode;
        this.puzzleScore = 0;
        this.puzzleIndex = 0;
        this.puzzleStrikes = 0; 
        this.puzzleQueue = []; 
        this.puzzleActive = true;
        this.playedPuzzleIds = new Set();
        this.playedFENs = new Set(); 
        this.isFetchingPuzzles = false; 
        this.currentSessionId = Date.now();
        const sessionId = this.currentSessionId;

        if (this.puzzleTimer) clearInterval(this.puzzleTimer);

        const isRush = ['3min', '5min', 'survival'].includes(mode);
        const puzzleTopControls = document.getElementById('puzzleTopControls');
        if (puzzleTopControls) puzzleTopControls.style.display = isRush ? 'none' : 'flex';
        
        if (isRush) {
            if (mode === 'survival') {
                this.puzzleTimeRemaining = null; 
            } else {
                this.puzzleTimeRemaining = (mode === '3min') ? 180 : 300;
                this.startPuzzleTimer(); 
            }
        } else {
            this.puzzleTimeRemaining = null;
        }

        let min = isRush ? 400 : (parseInt(document.getElementById('puzMin')?.value) || 600);
        let max = isRush ? 600 : (parseInt(document.getElementById('puzMax')?.value) || 3000);

        this.sessionMinRating = min;
        this.sessionMaxRating = max;

        if (window.ui) window.ui.updatePuzzleUI("loading");

        // 🔥 THE FIX: Puzzles 1-5 are locked to the 400-600 range
        await this.fetchPuzzles(this.sessionMinRating, this.sessionMaxRating, 5);

        if (this.currentSessionId !== sessionId) return;

        if (this.puzzleQueue.length > 0) {
            this.puzzleIndex = 0;
            this.loadCurrentPuzzle();
            
            // 🔥 THE FIX: Immediately queue Puzzles 6-10 at the 600-800 range
            if (isRush) {
                this.fetchPuzzles(600, 800, 5); 
            } else {
                this.fetchPuzzles(this.sessionMinRating, this.sessionMaxRating, 5); 
            }
        } else {
             if (window.ui) {
                window.ui.showNotification("No puzzles found in database.", "Error", "❌");
                window.ui.updatePuzzleUI("controls");
            }
        }
    }
async nextPuzzle() {
        this.puzzleIndex++;

        // Buffer Check: If running low, safely hit local server again
        if (this.puzzleIndex >= this.puzzleQueue.length - 2) {
            if (!this.isFetchingPuzzles) {
                if (['3min', '5min', 'survival'].includes(this.puzzleMode)) {
                    // 🔥 THE FIX: True Lichess/Chess.com Ramp Up Algorithm!
                    // Every puzzle you solve adds roughly +40 to the target.
                    // We only grab 5 puzzles at a time in a tight 200-point window.
                    const currentExpectedRating = 400 + (this.puzzleQueue.length * 40);
                    this.fetchPuzzles(currentExpectedRating, currentExpectedRating + 200, 5);
                } else {
                    const currentR = this.currentPuzzle?.rating || 1000;
                    this.fetchPuzzles(currentR - 100, currentR + 100, 5);
                }
            }
        }

        // Wait dynamically if the buffer is empty
        if (this.puzzleIndex >= this.puzzleQueue.length) {
             if (window.ui) window.ui.showNotification("Reading Database...", "Buffering", "⏳");
             
             let waits = 0;
             while (this.isFetchingPuzzles && waits < 50) {
                 await new Promise(r => setTimeout(r, 100));
                 waits++;
             }
        }

        if (this.puzzleIndex < this.puzzleQueue.length) {
            this.loadCurrentPuzzle();
        } else {
            this.endPuzzleRun("No more puzzles available.");
        }
    }
startPuzzleRun(mode) {
        this.startPuzzleSession(mode);
    }
startPuzzleTimer() {
        if (this.puzzleTimer) clearInterval(this.puzzleTimer);
        this.puzzleTimer = setInterval(() => {
            if (!this.puzzleActive || this.gameOver) return;
            this.puzzleTimeRemaining--;
            if (window.ui && window.ui.updatePuzzleStats) window.ui.updatePuzzleStats();
            
            if (this.puzzleTimeRemaining <= 0) {
                this.endPuzzleRun("Time's Up!");
            }
        }, 1000);
    }
endPuzzleRun(reason) {
        this.puzzleActive = false;
        clearInterval(this.puzzleTimer);
        this.updateStockfish();
        if (reason === 'quit') {
            if(window.ui) window.ui.updatePuzzleUI("controls");
            return;
        }
        
        if(window.ui) {
            window.ui.showNotification(`Reason: ${reason}\nFinal Score: ${this.puzzleScore}`, "Session Over", "🏁");
            window.ui.updatePuzzleUI("controls");
        }
    }
loadCurrentPuzzle() {
        // 🔥 1. THE SAFETY LOOP: If you are too fast, wait for the background fetch to finish!
        if (this.puzzleIndex >= this.puzzleQueue.length) {
            if (this.isFetchingPuzzles) {
                if (window.ui) window.ui.showNotification("Fetching more puzzles...", "Please Wait", "⏳");
                setTimeout(() => this.loadCurrentPuzzle(), 500); // Try again in half a second
                return;
            } else {
                if (window.ui) {
                    window.ui.showNotification("You have completed all puzzles in this set!", "Session Complete", "🎉");
                    window.ui.updatePuzzleUI("controls");
                }
                return;
            }
        }

        const p = this.puzzleQueue[this.puzzleIndex];
        console.log(`%c[PUZZLE LOADED] ID: ${p.id} | Rating: ${p.rating}`, "color: #38bdf8; font-weight: bold;");
        
        this.history = [];  
        this.pgn = "";  
        this.currentNode = { fen: p.fen, children: [], parent: null, lastMove: null };
        
        const pgnBox = document.getElementById('pgnDisplay');
        if (pgnBox) {
            if (pgnBox.tagName === 'INPUT' || pgnBox.tagName === 'TEXTAREA') pgnBox.value = "";
            else pgnBox.innerText = "";
        }
        
        if (window.engineAnalysing) {
            window.engineAnalysing = false;
            if (window.sfWorker) window.sfWorker.postMessage('stop');

            const btn = document.querySelector('.engine-toggle-btn');
            if (btn) btn.classList.remove('active');

            const panel = document.getElementById('enginePanel');
            if (panel) panel.classList.remove('visible');

            const stats = document.getElementById('engine-stats-container');
            if (stats) stats.style.display = 'none';

            const arrows = document.getElementById('tempArrowRoot');
            if (arrows) arrows.innerHTML = '';
        }

        this.currentPuzzle = p;
        this.mode = 'puzzle';
        this.gameOver = false;
        this.initialPuzzleFEN = p.fen;
        this.loadFEN(p.fen);
        
        const opponentColor = this.engine.turn();
        const wantFlipped = (opponentColor === 'w');
        if (window.ui && window.ui.flipped !== wantFlipped) window.ui.flipBoard();
        
        this.puzzleSolution = (typeof p.moves === 'string') ? p.moves.trim().split(' ') : p.moves;
        this.puzzleCursor = 0;
        
        if (window.ui) {
            window.ui.updatePuzzleUI("active", p);
            if (window.ui.flipped === wantFlipped) window.ui.renderBoard(false);
            window.ui.updateHistory();
        }
        
        setTimeout(() => {
            const setupMove = this.puzzleSolution[0];
            if (setupMove) {
                console.log(`[SETUP] Playing first move: ${setupMove}`);
                const from = this.squareToIndex(setupMove.substring(0, 2));
                const to = this.squareToIndex(setupMove.substring(2, 4));
                const promo = setupMove.length > 4 ? setupMove.substring(4, 5) : 'q';
                this.makeMove({ from, to }, promo, true, null, true);
                if (window.ui) {
                    window.ui.renderBoard(true);
                    window.ui.updateHistory();
                }
                this.puzzleCursor++;
            }
        }, 500);

        // 🔥 2. SMART "FREE TIME" PRE-FETCHING
        // If we are down to our last 5 puzzles, quietly ask the server for more while the user thinks.
        const remainingPuzzles = this.puzzleQueue.length - this.puzzleIndex;
        if (remainingPuzzles <= 5 && !this.isFetchingPuzzles) {
            
            const prefetchTask = () => {
                console.log("🧩 Queue running low! Pre-fetching more puzzles in background...");
                const isRush = ['3min', '5min', 'survival'].includes(this.puzzleMode);
                if (isRush) {
                    this.fetchPuzzles(700, 1100, 10); 
                } else {
                    this.fetchPuzzles(this.sessionMinRating, this.sessionMaxRating, 10); 
                }
            };

            // Only run the fetch when the browser's main thread is completely idle!
            if ('requestIdleCallback' in window) {
                requestIdleCallback(prefetchTask);
            } else {
                // Fallback for older browsers like Safari
                setTimeout(prefetchTask, 100);
            }
        }
    }
playPuzzleSolution() {
        if (!this.currentPuzzle || !this.puzzleSolution) return;

        // 🔥 THE FIX: Prevent overlapping loops if the user spam-clicks!
        if (this._isPlayingSolution) return;
        this._isPlayingSolution = true;

        const movesToPlay = this.puzzleSolution.slice(this.puzzleCursor);
        if (movesToPlay.length === 0) {
            this._isPlayingSolution = false;
            return;
        }
        
        let i = 0;
        const playNext = () => {
            // Abort immediately if the user changed puzzles mid-animation
            if (!this._isPlayingSolution || this.mode !== 'puzzle') {
                this._isPlayingSolution = false;
                return;
            }

            if (i >= movesToPlay.length) {
                this.puzzleSuccess();
                this._isPlayingSolution = false; // Release the lock
                return;
            }
            
            const uci = movesToPlay[i];
            const from = this.squareToIndex(uci.substring(0, 2));
            const to = this.squareToIndex(uci.substring(2, 4));
            const promo = uci.length > 4 ? uci.substring(4, 5) : 'q';
            
            this.makeMove({ from, to }, promo, true, null, true);
            
            if (typeof window.ui !== 'undefined') {
                window.ui.renderBoard(true);
                window.ui.updateHistory();
            }
            
            this.puzzleCursor++;
            i++;
            
            // Save the timeout ID so we can kill it later if needed
            this._solutionTimeout = setTimeout(playNext, 800);
        };
        
        playNext();
    }
puzzleSuccess() {
        this.puzzleSolved = true;
        const isRush = ['3min','5min','survival'].includes(this.puzzleMode);
        
        if (isRush) {
            this.puzzleScore++;
            if (typeof ui !=='undefined') window.ui.updatePuzzleStats();
            setTimeout(() => {
                if (this.puzzleActive) this.nextPuzzle();
            }, 100);
            this.gameOver = true; 
        } else {
            const status = document.getElementById('puzzleStatus');
            const next = document.getElementById('nextPuzzleBtn');
            const solBtn = document.getElementById('showSolBtn'); // 🔥 Grab the Solution Button

            if (status) { status.innerText ="Solved!"; status.style.color ="#26c2a3"; }
            if (next) next.style.display ="block";
            if (solBtn) solBtn.style.display ="none"; // 🔥 Hide it upon success!
            
            setTimeout(() => {
                this.mode ='analysis'; 
                this.gameOver = false;
                if (typeof ui !=='undefined') window.ui.updateHistory();
            }, 50);
        }
    }
puzzleFail() {
        if (window.sfWorker) window.sfWorker.postMessage('stop');
        this.puzzleStrikes++; 

        const isRush = ['3min', '5min', 'survival'].includes(this.puzzleMode);

        // Lock board automatically ONLY in Rush modes
        if (isRush) {
            this.gameOver = true; 
        } else {
            this.gameOver = false; // Allow retrying in Custom Training Mode
        }

        const puzRating = (this.currentPuzzle && this.currentPuzzle.rating) ? parseInt(this.currentPuzzle.rating) : 1200;
        let loss = 10;
        if (this.calculateRatingChange) {
            loss = this.calculateRatingChange(this.userPuzzleRating, puzRating, false);
            this.userPuzzleRating += loss; 
        } else {
            this.userPuzzleRating -= loss;
        }

        if (typeof window.ui !== 'undefined') {
            window.ui.updateStatus(`Puzzle Failed.`);
            
            if (!isRush) {
                // In training mode, show a notification and let them try again
                window.ui.showNotification(`Wrong Move! Try again. ❌`, 'Incorrect');
                
                // Show the Next button so they can manually skip if they want to give up
                const nextBtn = document.getElementById('nextPuzzleBtn');
                if (nextBtn) nextBtn.style.display = 'block';
            }
            if (window.ui.updatePuzzleStats) window.ui.updatePuzzleStats();
        }

        // Unlock the engine button so you can see why you failed
        const engineBtn = document.querySelector('.engine-toggle-btn');
        if (engineBtn) { engineBtn.style.opacity = '1'; engineBtn.style.cursor = 'pointer'; }

        // Auto-skip ONLY happens in Rush modes
        if (isRush) {
            if (this.puzzleStrikes >= 3) {
                this.endPuzzleRun("3 Strikes - You're Out!");
                return; 
            }
            const skipDelay = (this.puzzleMode === 'survival') ? 1000 : 400;
            setTimeout(() => {
                if (this.puzzleActive) this.nextPuzzle();
            }, skipDelay);
        }
    }
showSolution() {
this.playPuzzleSolution();
}
retryPuzzle() {
        if (this.initialPuzzleFEN) {
            // 🔥 Reset the puzzle logic state
            this.puzzleCursor = 0;
            this.gameOver = false;
            
            this.loadFEN(this.initialPuzzleFEN);
            window.ui.renderBoard(true);
            window.ui.updateHistory();
            
            // Trigger the opponent's initial setup move again
            setTimeout(() => {
                const setupMove = this.puzzleSolution[0];
                if (setupMove) {
                    const from = this.squareToIndex(setupMove.substring(0, 2));
                    const to = this.squareToIndex(setupMove.substring(2, 4));
                    const promo = setupMove.length > 4 ? setupMove.substring(4, 5) : 'q';
                    
                    this.makeMove({ from, to }, promo, true, null, true);
                    
                    window.ui.renderBoard(true);
                    window.ui.updateHistory();
                    this.puzzleCursor++;
                }
            }, 500);
        }
    }
getUID() {
return `p-${this.pieceIdCounter++}`;
}
setPremoveMode(val) {
this.premoveMode = val;
this.clearPremoves();
}
resetEngineDefault() {
        this.initEngine(null, null);
        window.ui.showNotification("Restored Default Latest Stockfish", "System", "🔄");
}
reconcileBoardIds(fen, move) {
        if (!fen) return;

        // 1. Parse Target FEN into a list of pieces
        const cleanFen = fen.split(' ')[0];
        const rows = cleanFen.split('/');
        const newPieces = []; 
        let idx = 0;

        for (let r = 0; r < 8; r++) {
            const row = rows[r];
            for (let char of row) {
                if (/\d/.test(char)) {
                    idx += parseInt(char);
                } else {
                    const color = (char === char.toUpperCase()) ? 'w' : 'b';
                    const type = char.toLowerCase();
                    newPieces.push({ 
                        type, color, idx, 
                        r: Math.floor(idx / 8), 
                        c: idx % 8, 
                        id: null 
                    });
                    idx++;
                }
            }
        }

        // 2. Get Current Board pieces
        const oldPieces = [];
        this.board.forEach((p, i) => {
            if (p) oldPieces.push({ ...p, idx: i, assigned: false });
        });

        // 3. MATCHING ALGORITHM (The "Chessboard.js" Behavior)

        // A. Move Priority: If we have a specific move, lock those pieces first
        if (move) {
            const src = oldPieces.find(p => p.idx === move.from);
            const dst = newPieces.find(p => p.idx === move.to);
            if (src && dst && src.color === dst.color) {
                dst.id = src.id;
                src.assigned = true;
                dst.idAssigned = true;
            }
            // Handle Castling Rooks
            if (move.flags && (move.flags.includes('k') || move.flags.includes('q'))) {
                let rFrom, rTo;
                if (move.to === 62) { rFrom=63; rTo=61; }      // White K
                else if (move.to === 58) { rFrom=56; rTo=59; } // White Q
                else if (move.to === 6) { rFrom=7; rTo=5; }    // Black K
                else if (move.to === 2) { rFrom=0; rTo=3; }    // Black Q
                
                if (rFrom !== undefined) {
                    const oldRook = oldPieces.find(p => p.idx === rFrom);
                    const newRook = newPieces.find(p => p.idx === rTo);
                    if (oldRook && newRook) {
                        newRook.id = oldRook.id;
                        oldRook.assigned = true;
                        newRook.idAssigned = true;
                    }
                }
            }
        }

        // B. Exact Match: Lock pieces that haven't moved (Distance 0)
        newPieces.forEach(np => {
            if (np.idAssigned) return;
            const match = oldPieces.find(op => !op.assigned && op.type === np.type && op.color === np.color && op.idx === np.idx);
            if (match) {
                np.id = match.id;
                match.assigned = true;
                np.idAssigned = true;
            }
        });

        // C. Closest Match: Find nearest neighbor for scrubbing/reset
        newPieces.forEach(np => {
            if (np.idAssigned) return;
            
            let bestMatch = null;
            let minDistance = Infinity;

            oldPieces.forEach(op => {
                if (op.assigned || op.type !== np.type || op.color !== np.color) return;
                
                // Calculate Manhattan Distance (Grid steps)
                const dist = Math.abs((op.idx % 8) - np.c) + Math.abs(Math.floor(op.idx / 8) - np.r);
                
                if (dist < minDistance) {
                    minDistance = dist;
                    bestMatch = op;
                }
            });

            if (bestMatch) {
                np.id = bestMatch.id;
                bestMatch.assigned = true;
                np.idAssigned = true;
            } else {
                // New Piece (e.g. Promotion or Edit)
                np.id = this.getUID(); 
            }
        });

        // 4. Rebuild Board Array
        const finalBoard = new Array(64).fill(null);
        newPieces.forEach(p => {
            finalBoard[p.idx] = { type: p.type, color: p.color, id: p.id };
        });
        
        this.board = finalBoard;
    }
reconcileBoardIdsReverse(fen, move) {
        if (!fen || typeof fen !== 'string' || fen.trim() === '') {
            fen = INITIAL_FEN;
        }
        if (!this.board || !move) {
            this.reconcileBoardIds(fen, null);
            return;
        }
        const newBoard = new Array(64).fill(null);
        const cleanFen = fen.trim();
        const fenParts = cleanFen.split(' ');
        if (!fenParts[0]) {
            console.warn("Invalid FEN structure:", fen);
            this.reconcileBoardIds(fen, null);
            return;
        }

        const fenRows = fenParts[0].split('/');

        if (fenRows.length !== 8) {
            console.warn("Invalid FEN rows:", fen);
            this.reconcileBoardIds(fen, null);
            return;
        }

        let idx = 0;

        for (let r = 0; r < 8; r++) {
            const row = fenRows[r];
            if (!row) { idx += 8; continue; }

            for (let c = 0; c < row.length; c++) {
                const char = row[c];
                if (!isNaN(char)) {
                    idx += parseInt(char, 10);
                } else {
                    const color = (char === char.toUpperCase()) ? 'w' : 'b';
                    const type = char.toLowerCase();
                    newBoard[idx] = { type: type, color: color };
                    idx++;
                }
            }
        }
        const pieceAtTo = this.board[move.to];
        const pieceAtFrom = newBoard[move.from];

        if (pieceAtTo && pieceAtFrom && pieceAtTo.type === pieceAtFrom.type && pieceAtTo.color === pieceAtFrom.color) {
            pieceAtFrom.id = pieceAtTo.id; 
        }

        // B. Castling Rook Logic
        if (move.flags && (move.flags.includes('k') || move.flags.includes('q'))) {
            let rookFrom, rookTo;

            if (move.to === 62) { rookFrom = 61; rookTo = 63; } // White Short
            else if (move.to === 58) { rookFrom = 59; rookTo = 56; } // White Long
            else if (move.to === 6)  { rookFrom = 5;  rookTo = 7; }  // Black Short
            else if (move.to === 2)  { rookFrom = 3;  rookTo = 0; }  // Black Long

            if (typeof rookFrom !== 'undefined') {
                const rookNow = this.board[rookFrom];
                const rookOld = newBoard[rookTo];
                if (rookNow && rookOld) {
                    rookOld.id = rookNow.id; 
                }
            }
        }
        for (let i = 0; i < 64; i++) {
            if (i === move.from || i === move.to) continue; 

            const pCurrent = this.board[i];
            const pNew = newBoard[i];

            if (pCurrent && pNew && pCurrent.type === pNew.type && pCurrent.color === pNew.color && !pNew.id) {
                pNew.id = pCurrent.id;
            }
        }
        this.board = newBoard;
    }
addMoveToTree(fen, moveSan, toSq, moveData) {
        let existingChild = this.currentNode.children.find(child => child.moveSan === moveSan);

        if (existingChild) {
            this.currentNode = existingChild;
        } else {
            let newNode = new MoveNode(fen, moveSan, this.currentNode, "", 0, toSq);
            newNode.lastMove = moveData;
            
            // 🔥 Capture the Clock Times for the PGN!
            if (this.isPlayingLiveGame) {
                const isWhiteMove = this.turn === 'b'; 
                const secondsLeft = isWhiteMove ? this.whiteTime : this.blackTime;
                
                newNode.timeLeft = secondsLeft * 1000; 
                
                const h = Math.floor(secondsLeft / 3600);
                const m = Math.floor((secondsLeft % 3600) / 60);
                const s = Math.floor(secondsLeft % 60);
                newNode.clk = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                
                const now = Date.now();
                if (this.lastMoveTimestamp) {
                    newNode.moveTime = now - this.lastMoveTimestamp;
                }
                this.lastMoveTimestamp = now;
            }

            this.currentNode.children.push(newNode);
            if (this.currentNode.children.length === 1) {
                this.currentNode.selectedChildIndex = 0;
            }

            this.currentNode = newNode;
        }

       // 🔥 THE FIX: Initialize the arrays if they are undefined in a new game!
        if (!this.history) this.history = [];
        if (!this.moveList) this.moveList = [];

        if (this.history.length === 0) {
            // (Make sure to use your INITIAL_FEN variable here)
            const startFen = this.rootNode.fen === 'start' ? INITIAL_FEN : this.rootNode.fen;
            this.history.push(startFen);
        }
        
        // Logical arrays must update instantly to prevent game-breaking bugs
        this.moveList.push(this.currentNode.lastMove || this.currentNode.moveSan);
        this.history.push(this.currentNode.fen);

        if (this.isLoadingPGN) return;
        
        try {
            if (typeof ui !== 'undefined') {
                if (this._historyRenderTimeout) clearTimeout(this._historyRenderTimeout);
                
                this._historyRenderTimeout = setTimeout(() => {
                    requestAnimationFrame(() => {
                        window.ui.updateHistory();
                    });
                }, 200); 
            }
        } catch (e) {}
    }
stepForward() {
        if (this.currentNode && this.currentNode.children.length > 0) {
            const idx = this.currentNode.selectedChildIndex || 0;
            let nextNode = this.currentNode.children[idx];
            this.currentNode = nextNode;
            
            // 🔥 THE FIX: O(1) Array Push on Right Arrow!
            this.moveList.push(this.currentNode.lastMove || this.currentNode.moveSan);
            this.history.push(this.currentNode.fen);
            
            this.reconcileBoardIds(this.currentNode.fen, this.currentNode.lastMove);
            if (this.engine) {
                this.engine.load(this.currentNode.fen);
                this.turn = this.engine.turn(); 
            }
            if (this.currentNode.lastMove) {
                this.triggerMoveSound(this.currentNode.lastMove);
            }

            if (typeof ui !== 'undefined') {
                window.ui.selectedSq = null;
                window.ui.legalMoves = []; 

                let visualMove = null;
                const move = this.currentNode.lastMove;
                if (move) {
                    const currentPiece = this.board[move.to];
                    visualMove = {
                        from: move.from, to: move.to, flags: move.flags,
                        color: move.color || (currentPiece ? currentPiece.color : (this.turn === 'w' ? 'b' : 'w')),
                        piece: move.piece || (currentPiece ? currentPiece.type : '')
                    };
                }

                window.ui.renderBoard(true, true, visualMove);

                if (this._spamTimeout) clearTimeout(this._spamTimeout);
                this._spamTimeout = setTimeout(() => {
                    requestAnimationFrame(() => {
                        window.ui.updateHistory();
                        window.ui.renderArrows();
                        window.ui.updateClocks();
                        if (window.ui.highlightLastMove) window.ui.highlightLastMove(this.currentNode.lastMove);
                        if (typeof window.ui.updateStatus === 'function') window.ui.updateStatus();
                        if (!this.isPlayingLiveGame) this.updateStockfish(); 
                    });
                }, 40);
            } else {
                this.updateStockfish();
            }
        }
    }
stepBack() {
        if (this.currentNode.parent) {
            let undoMove = this.currentNode.lastMove;
            this.currentNode = this.currentNode.parent;
            
            // 🔥 THE FIX: O(1) Array Pop on Left Arrow!
            this.moveList.pop();
            this.history.pop();

            if (undoMove) this.reconcileBoardIdsReverse(this.currentNode.fen, undoMove);
            else this.reconcileBoardIds(this.currentNode.fen, null);

            if (this.engine) {
                this.engine.load(this.currentNode.fen);
                this.turn = this.engine.turn();
            }

            if (this.mode === 'puzzle') {
                this.mode = 'analysis';
                this.gameOver = false;
                this.puzzleActive = false;
                const status = document.getElementById('puzzleStatus');
                if (status) { status.innerText = "Analysis Mode"; status.style.color = "#ccc"; }
            }

            if (typeof ui !== 'undefined') {
                window.ui.selectedSq = null;
                window.ui.legalMoves = [];
                let visualMove = null;
                
                if (undoMove) {
                    const restoredPiece = this.board[undoMove.from];
                    visualMove = {
                        from: undoMove.to, to: undoMove.from, flags: undoMove.flags,
                        color: restoredPiece ? restoredPiece.color : this.turn,
                        piece: restoredPiece ? restoredPiece.type : '' 
                    };
                }
                
                this.triggerMoveSound(visualMove);
                window.ui.renderBoard(true, true, visualMove);

                if (this._spamTimeout) clearTimeout(this._spamTimeout);
                this._spamTimeout = setTimeout(() => {
                    requestAnimationFrame(() => {
                        window.ui.updateHistory();
                        window.ui.renderArrows();
                        window.ui.updateClocks();
                        if (typeof window.ui.updateStatus === 'function') window.ui.updateStatus();
                        if (window.ui.highlightLastMove) window.ui.highlightLastMove(this.currentNode.lastMove);
                        if (!this.isPlayingLiveGame) this.updateStockfish();
                    });
                }, 40);
            } else {
                this.updateStockfish();
            }
        }
    }
goToStart() {
        if (window.ui && typeof window.ui.animateToStartPosition === 'function') {
            window.ui.animateToStartPosition(this.rootNode.fen, () => {
                this.currentNode = this.rootNode;
                
                // 🔥 THE FIX: Sync arrays on jump to Start
                this.syncMoveHistory();
                
                if (this.rootNode.fen === 'start') {
                    this.engine.reset();
                } else {
                    this.engine.load(this.currentNode.fen);
                }

                this.reconcileBoardIds(this.currentNode.fen, null);
                window.ui.renderBoard(false); 
                window.ui.updateHistory();
                window.ui.renderArrows();
                if (!this.isPlayingLiveGame)this.updateStockfish();
            });
        } else {
            this.currentNode = this.rootNode;
            
            // 🔥 THE FIX: Sync arrays on jump to Start
            this.syncMoveHistory();
            
            if (this.rootNode.fen === 'start') this.engine.reset();
            else this.engine.load(this.currentNode.fen);

            this.reconcileBoardIds(this.currentNode.fen, null);
            window.ui.renderBoard(true);
            window.ui.updateHistory();
            window.ui.renderArrows();
            if (!this.isPlayingLiveGame)this.updateStockfish();
        }
    }
goToEnd() {
        // Traverse to the end of the current line
        while (this.currentNode && this.currentNode.children.length > 0) {
            this.currentNode = this.currentNode.children[this.currentNode.selectedChildIndex || 0];
        }
        
        // 🔥 CRITICAL FIX: You MUST tell the chess engine to update its internal board state!
        this.loadFEN(this.currentNode.fen);
        
        // Sync arrays on jump to End
        this.syncMoveHistory();
        this.reconcileBoardIds(this.currentNode.fen, null);
        
        // 🔥 VISUAL FIX: Pass FALSE so it instantly snaps to the present without 
        // causing pieces to fly wildly across the board from 20 moves ago!
        if (window.ui) {
            window.ui.renderBoard(false); 
            window.ui.updateHistory();
            if (typeof window.ui.renderArrows === 'function') window.ui.renderArrows();
        }
        
        if (typeof this.updateStockfish === 'function' && !this.isPlayingLiveGame) {
            this.updateStockfish();
        }
    }
updateSettingsTime() {
        const bh = parseInt(document.getElementById('bTimeH').value) || 0;
        const bm = parseInt(document.getElementById('bTimeM').value) || 0;
        const bs = parseInt(document.getElementById('bTimeS').value) || 0;

        this.blackStartSeconds = (bh * 3600) + (bm * 60) + bs;
        if (this.blackStartSeconds <= 0) this.blackStartSeconds = 600;
        this.blackIncrement = parseInt(document.getElementById('bInc').value) || 0;

        const wh = parseInt(document.getElementById('wTimeH').value) || 0;
        const wm = parseInt(document.getElementById('wTimeM').value) || 0;
        const ws = parseInt(document.getElementById('wTimeS').value) || 0;

        this.whiteStartSeconds = (wh * 3600) + (wm * 60) + ws;
        if (this.whiteStartSeconds <= 0) this.whiteStartSeconds = 600;
        this.whiteIncrement = parseInt(document.getElementById('wInc').value) || 0;
        
        if (this.pgnHeaders && this.pgnHeaders['TimeControl']) delete this.pgnHeaders['TimeControl'];
        this.timeControl = null; 

        if (!this.isPlayingLiveGame || this.currentNode === this.rootNode) {
            this.whiteTime = this.whiteStartSeconds;
            this.blackTime = this.blackStartSeconds;
            if (this.rootNode) {
                this.rootNode.clock = { w: this.whiteStartSeconds, b: this.blackStartSeconds };
            }
            if (typeof ui !== 'undefined') window.ui.updateClocks(); 
        }
    }
playEngineSequence(seqString, baseFen) {
if (baseFen && this.generateFEN() !== baseFen) {
let temp = this.currentNode;
let found = false;
while (temp) {
if (temp.fen === baseFen) {
this.currentNode = temp;
this.reconcileBoardIds(this.currentNode.fen, null);
found = true;
break;
}
temp = temp.parent;
}
if (!found) {
this.loadFEN(baseFen);
}
}
const moves = seqString.split(',');
if (typeof window.sfWorker !=='undefined'&& window.sfWorker)
window.sfWorker.postMessage('stop');
for (let uci of moves) {
if (!uci) continue;
const from = this.squareToIndex(uci.substring(0, 2));
const to = this.squareToIndex(uci.substring(2, 4));
const promotion = uci.length > 4 ? uci.substring(4, 5) :'q';
this.makeMove({
from,
to
}, promotion, false, null, true);
}
if (typeof ui !=='undefined') {
window.ui.renderBoard(true);
window.ui.updateHistory();
window.ui.renderArrows();
}
if (typeof window.engineAnalysing !=='undefined'&& window.engineAnalysing) {
this.updateStockfish();
}
}
getNotation(move) {
return move.san;
}
findKing(color) {
    // 1. Initialize Cache (if not exists)
    if (!this._kingCache) this._kingCache = { w: -1, b: -1 };
    
    // 2. Fast Path: Check if our cached position is still correct
    const cachedIdx = this._kingCache[color];
    const p = this.board[cachedIdx];

    // Verify: Is the piece at the cached square ACTUALLY the King of the right color?
    // (This handles cases where the king moved, was captured, or the board reset)
    if (cachedIdx !== -1 && p && (p.type === 'k' || p.type === 'K') && p.color === color) {
        return cachedIdx;
    }

    // 3. Slow Path: Full Scan (Only happens once per King move)
    for (let i = 0; i < 64; i++) {
        const piece = this.board[i];
        if (piece && (piece.type === 'k' || piece.type === 'K') && piece.color === color) {
            this._kingCache[color] = i; // Update Cache
            return i;
        }
    }
    
    // 4. King not found (e.g., Editor Mode or Bug)
    this._kingCache[color] = -1;
    return -1;
}
syncEngineToBoard() {
        let pieceFen = "";
        for (let r = 0; r < 8; r++) {
            let empty = 0;
            for (let c = 0; c < 8; c++) {
                let p = this.board[r * 8 + c];
                if (!p) { empty++; } else {
                    if (empty > 0) { pieceFen += empty; empty = 0; }
                    pieceFen += (p.color === 'w' ? p.type.toUpperCase() : p.type.toLowerCase());
                }
            }
            if (empty > 0) pieceFen += empty;
            if (r < 7) pieceFen += "/";
        }

        let currEngineFen = this.engine.fen().split(' ');

        // 🔥 THE FIX: Use the CORRECT IDs from your HTML!
        if (typeof document !== 'undefined') {
            const turnEl = document.getElementById('editorTurn');
            if (turnEl) this.turn = turnEl.value;

            const chkWK = document.getElementById('castling-wK');
            const chkWQ = document.getElementById('castling-wQ');
            const chkBK = document.getElementById('castling-bK');
            const chkBQ = document.getElementById('castling-bQ');

            // Only overwrite if at least one checkbox is found in the DOM
            if (chkWK || chkWQ || chkBK || chkBQ) {
                this.castling = {
                    wK: chkWK ? chkWK.checked : this.castling.wK,
                    wQ: chkWQ ? chkWQ.checked : this.castling.wQ,
                    bK: chkBK ? chkBK.checked : this.castling.bK,
                    bQ: chkBQ ? chkBQ.checked : this.castling.bQ
                };
            }
        }

        let castlingStr = "";
        if (this.castling.wK) castlingStr += "K";
        if (this.castling.wQ) castlingStr += "Q";
        if (this.castling.bK) castlingStr += "k";
        if (this.castling.bQ) castlingStr += "q";
        if (castlingStr === "") castlingStr = "-";

        let fen = pieceFen + " " + (this.turn || 'w') + " " + castlingStr;
        let currFenBase = currEngineFen[0] + " " + currEngineFen[1] + " " + currEngineFen[2];
        
        if (fen === currFenBase) {
            if (typeof document !== 'undefined') {
                const fenBox = document.getElementById('fenInput');
                if (fenBox) fenBox.value = this.engine.fen();
            }
            return; 
        }

        // Preserve En Passant, Halfmove, and Fullmove safely
        fen += ` ${currEngineFen[3] || '-'} ${currEngineFen[4] || '0'} ${currEngineFen[5] || '1'}`; 

        try {
            this.engine.load(fen);

            if (this.currentNode) {
                this.currentNode.fen = fen;
                this.currentNode.children = []; 
            } else {
                this.rootNode = new MoveNode(fen, null);
                this.currentNode = this.rootNode;
            }
            
            if (typeof window !== 'undefined' && window.ui) {
                const fenBox = document.getElementById('fenInput');
                if (fenBox) fenBox.value = fen;
                
                if (typeof window.ui.updateHistory === 'function') {
                    if (typeof this.syncMoveHistory === 'function') this.syncMoveHistory();
                    window.ui.updateHistory(true);
                }
            }
        } catch (e) {
            console.error("Sync Engine Failed:", e);
        }
    }
loadFEN(fen, is960 = false, isLoadMode = false) {
        if (!fen) return false;

        // 🔥 THE ULTIMATE SHIELD: Cache live game variables before loading!
        const cachedMode = this.mode;
        const cachedBotColor = this.botColor;
        const cachedMyColor = this.myColor;

        let loaded = false;
        try {
            if (!this.engine) this.engine = new (typeof Chess === 'function' ? Chess : window.Chess)();
            if (typeof this.engine.set960 === 'function') this.engine.set960(is960 || this.isChess960);
            
            loaded = this.engine.load(fen);
            if (!loaded && typeof this.patchEngineFor960 === 'function') {
                this.patchEngineFor960();
                loaded = this.engine.load(fen);
            }
        } catch(e) { console.error(e); }
        
        if (!loaded) return false;
        
        this.isChess960 = is960 || this.isChess960;
        this.gameOver = false;
        this.isPaused = false;

        // =========================================================
        // 🔥 THE MISSING PIECE: Rebuild the board array from the FEN!
        // =========================================================
        this.board = Array(64).fill(null);
        const parts = fen.trim().split(/\s+/); 
        const rows = parts[0].split('/'); 

        let visualRow = 0; 
        for (let rStr of rows) {
            let file = 0; 
            for (let char of rStr) {
                if (isNaN(char)) {
                    const color = (char === char.toUpperCase()) ? 'w' : 'b';
                    const type = char.toLowerCase();
                    const sqIndex = (visualRow * 8) + file;
                    this.board[sqIndex] = { type: type, color: color, id: this.getUID() };
                    file++;
                } else {
                    file += parseInt(char, 10);
                }
            }
            visualRow++; 
        }

        this.turn = parts[1] || 'w';

        const castlingStr = parts[2] || '-';
        this.castling = {
            wK: castlingStr.includes('K'),
            wQ: castlingStr.includes('Q'),
            bK: castlingStr.includes('k'),
            bQ: castlingStr.includes('q')
        };

        this.enPassant = (parts[3] && parts[3] !== '-') ? this.squareToIndex(parts[3]) : null;

        // 🔥 RESTORE VARIABLES: Instantly fixes the "null" damage!
        if (!isLoadMode && (cachedMode === 'bot' || cachedMode === 'local')) {
            this.mode = cachedMode;
            this.botColor = cachedBotColor;
            this.myColor = cachedMyColor;
        } else if (!isLoadMode) {
            this.mode = cachedMode; // Protect analysis/study modes too
        }

        // Update the UI
        if (typeof ui !== 'undefined' && window.ui) {
            window.ui.selectedSq = null;
            window.ui.legalMoves = [];
            window.ui.lastMove = null;
            window.ui.renderBoard(false); 
            if (typeof window.ui.updateHistory === 'function') window.ui.updateHistory();
            if (typeof window.ui.updateClocks === 'function') window.ui.updateClocks();
            if (typeof window.ui.updateEvalBar === 'function') window.ui.updateEvalBar('cp', 0);
        }

        console.log(`✅ FEN Loaded (Corrected Orientation 0=a8): ${this.engine.fen()}`);
        return true;
    }
loadNewPosition(fen) {
        if (!fen) return;
        
        // 1. Validate FEN first so we don't crash the app
        const validation = this.engine.validate_fen(fen);
        if (!validation.valid) {
            if (window.ui) window.ui.showNotification("Invalid FEN: " + validation.error, "Error", "⚠️");
            return; 
        }

        // 2. Wipe the PGN Tree, History, and Headers completely!
        this.pgnHeaders = { "FEN": fen, "SetUp": "1" };
        this.rootNode = new MoveNode(fen, null);
        this.currentNode = this.rootNode;
        this.moveList = [];
        this.history = [];
        this.pgn = ""; 
        
        // =======================================================================
        // 🔥 THE NEW FIX: Destroy the old Analysis memory cache!
        // If we don't do this, switchTab('analysis') will load the old game back!
        // =======================================================================
        if (this.savedTabs && this.savedTabs['analysis']) {
            delete this.savedTabs['analysis'];
        }
        
        // Visually clear the old PGN text hanging around in the UI boxes!
        const pgnBox = document.getElementById('pgnDisplay');
        if (pgnBox) {
            if (pgnBox.tagName === 'INPUT' || pgnBox.tagName === 'TEXTAREA') pgnBox.value = "";
            else pgnBox.innerText = "";
        }
        const pgnInput = document.getElementById('pgnInput');
        if (pgnInput && pgnInput.tagName === 'TEXTAREA') pgnInput.value = "";
        
        // 3. Load visually and logically
        this.loadFEN(fen);
        
        // 4. Update the UI
        if (typeof window.ui !== 'undefined') {
            window.ui.displayMetadata(this.pgnHeaders);
            window.ui.updateHistory(true); 
            window.ui.renderBoard(false);
            window.ui.renderArrows();
            
            // Reset player info to defaults (removes old flags/elos/names/titles)
        window.ui.playerInfo = {
                w: { name: "White", meta: "White", country: null, title: null },
                b: { name: "Black", meta: "Black", country: null, title: null }
            };
            window.ui.renderHeaders();

            // 5. Safely switch to Analysis tab ONLY because validation passed!
            window.ui.switchTab('analysis');
            setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
        }
        
        if (window.engineAnalysing) {
            this.updateStockfish();
        }
    }
squareToIndex(sq) {
if (!sq || typeof sq !== 'string') return -1; 

let f = FILES.indexOf(sq[0]);
let r = 8 - parseInt(sq[1]);
return r * 8 + f;
}
indexToSquare(idx) {
let r = Math.floor(idx / 8);
let f = idx % 8;
return FILES[f] + (8 - r);
}
getLegalMoves(color=this.turn) {
const moves = this.engine.moves({
verbose:true
});
return moves.map(m => ({
from:this.squareToIndex(m.from),
to:this.squareToIndex(m.to),
san:m.san,
promotion:m.promotion,
isCapture:m.flags.includes('c') || m.flags.includes('e')
}));
}
generateFEN() {
return this.engine.fen();
}
getCurrentOpening() {
        if (typeof OPENING_BOOK_ECO === 'undefined') return null;
        let tempNode = this.currentNode;
        
        while (tempNode) {
            if (tempNode.fen) {
                const parts = tempNode.fen.split(' ');
                // 🔥 THE FIX: Guarantee the FEN has enough parts before slicing!
                if (parts.length >= 4) {
                    const coreFen = parts.slice(0, 4).join(' '); // Exact match
                    const altFen = parts.slice(0, 3).join(' ') + ' -'; // Strip En Passant

                    if (OPENING_BOOK_ECO[coreFen]) return OPENING_BOOK_ECO[coreFen];
                    if (OPENING_BOOK_ECO[altFen]) return OPENING_BOOK_ECO[altFen];
                }
            }
            tempNode = tempNode.parent;
        }
        return null;
    }
getMainlineOpening() {
        if (typeof OPENING_BOOK_ECO === 'undefined') return null;
        let tempNode = this.rootNode;
        let lastOpening = null;
        
        while (tempNode) {
            if (tempNode.fen) {
                const parts = tempNode.fen.split(' ');
                if (parts.length >= 4) {
                    const coreFen = parts.slice(0, 4).join(' ');
                    const altFen = parts.slice(0, 3).join(' ') + ' -';

                    if (OPENING_BOOK_ECO[coreFen]) lastOpening = OPENING_BOOK_ECO[coreFen];
                    else if (OPENING_BOOK_ECO[altFen]) lastOpening = OPENING_BOOK_ECO[altFen];
                }
            }
            if (tempNode.children && tempNode.children.length > 0) {
                tempNode = tempNode.children[tempNode.selectedChildIndex || 0];
            } else {
                break;
            }
        }
        return lastOpening;
    }
playUCI(uci) {
if (!uci)
return;
const from = uci.substring(0, 2);
const to = uci.substring(2, 4);
const promotion = uci.length > 4 ? uci.substring(4, 5) :'q';
const fromIdx = this.squareToIndex(from);
const toIdx = this.squareToIndex(to);
this.makeMove({
from:fromIdx,
to:toIdx
}, promotion);
window.ui.renderBoard(true);
window.ui.updateHistory();
window.ui.renderArrows();
}
resetGame(clear = false, startFen = INITIAL_FEN) {
        if (clear) {
            this.board = Array(64).fill(null);
            this.turn ='w';
            if (typeof ui !=='undefined') window.ui.renderBoard(false);
            return;
        }

        this.whiteTime = this.whiteStartSeconds;
        this.blackTime = this.blackStartSeconds;
        this.rootNode = new MoveNode(startFen, null);
        this.currentNode = this.rootNode;
        this.loadFEN(startFen);
        this.gameOver = false;
        
        if (!this.isPlayingLiveGame && this.mode !== 'puzzle') {
            this.mode = 'analysis';
        }

        clearInterval(this.timerInterval);
        if (typeof ui !=='undefined') {
            window.ui.renderBoard(false);
            window.ui.updateClocks();
            window.ui.updateHistory();
            window.ui.renderArrows();
            
            if (window.ui.toggleReviewButton) window.ui.toggleReviewButton(false);
        }
    }
startAnalysisMode() {
        // 1. Stop any active game timers and engines
        this.gameOver = true;
        if (this.timerInterval) clearInterval(this.timerInterval);
        if (window.sfWorker) window.sfWorker.postMessage('stop');

        // 2. Ensure the PGN headers have a result
        if (!this.pgnHeaders['Result']) {
            this.pgnHeaders['Result'] = '*';
        }

        // 3. Switch to the Analysis Tab
        // (Thanks to your fix, this now automatically SAVES the live game into Analysis memory!)
        if (window.ui && typeof window.ui.switchTab === 'function') {
            window.ui.switchTab('analysis');
        }

        // 4. Force the board to the final move of the game
        this.goToEnd();

        // 5. Hide the Game Over screen
        if (window.ui) {
            const modal = document.getElementById('gameOverModal');
            if (modal) modal.style.display = 'none';
            
            // Force one final UI refresh to guarantee the PGN box populates
            if (typeof window.ui.updateHistory === 'function') window.ui.updateHistory(true);
            if (typeof window.ui.renderBoard === 'function') window.ui.renderBoard(true);
        }
    }
loadPGNFile(input) {
const file = input.files[0];
if (!file) return;
const reader = new FileReader();
reader.onload = (e) => {
const pgnText = e.target.result;
document.getElementById('editorPgnInput').value = pgnText;
window.ui.switchTab('editor');
window.ui.loadPgnAndAnalyze();
};
reader.readAsText(file);
input.value ='';
}
newGame(startFen = INITIAL_FEN) {
        this.isPaused = false;
        this.gameOver = false;
        this.updateSettingsTime();
        this.whiteTime = this.whiteStartSeconds;
        this.blackTime = this.blackStartSeconds;
        this.resetGame(false, startFen); 
        this.startTimer();
        if (typeof ui !=='undefined') {
            window.ui.updateClocks();
            const btn = document.getElementById('pauseBtn');
            if (btn) btn.innerText ="⏸";
            
            if (window.ui.toggleReviewButton) window.ui.toggleReviewButton(false);
        }
    }
endGame(resultStr, statusMsg) {
        if (this.mode === 'analysis' || this.mode === 'study' || this.mode === 'editor') {
            return; 
        }

        // 🔥 THE FIX: Capture the live mode BEFORE we change the game over state!
        // Your old code looked for 'play', which didn't exist (it's 'local' or 'bot').
        const finishedLiveGame = (this.mode === 'local' || this.mode === 'bot');

        this.gameOver = true;
        this.isPaused = false; 
        
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        // Lock in the final result for the PGN string
        this.pgnHeaders['Result'] = resultStr;

        if (typeof window.ui !== 'undefined') {
            window.ui.updateStatus(statusMsg);
            
            const pauseBtn = document.getElementById('pauseBtn');
            if (pauseBtn) pauseBtn.innerText = "⏸";
            
            const pauseOverlay = document.getElementById('pauseOverlay');
            if (pauseOverlay) pauseOverlay.style.display = 'none';

            if (window.ui.toggleReviewButton) window.ui.toggleReviewButton(true);
            
            const resignBtn = document.getElementById('resignBtn');
            const drawBtn = document.getElementById('drawBtn');
            if (resignBtn) resignBtn.style.display = 'none';
            if (drawBtn) drawBtn.style.display = 'none';
            
            if (typeof window.ui.showGameOver === 'function') {
                let winner = "Draw";
                if (resultStr === "1-0") winner = "White";
                else if (resultStr === "0-1") winner = "Black";
                
                let reason = statusMsg;
                if (statusMsg.includes(' wins ')) {
                    reason = statusMsg.split(' wins ')[1]; 
                } else if (statusMsg.startsWith('Draw ')) {
                    reason = statusMsg.substring(5); 
                }

                window.ui.showGameOver(winner, reason);
            }

            // =========================================================
            // 🔥 SEAMLESS PGN ANALYSIS TRANSITION
            // =========================================================
            if (finishedLiveGame) {
                    // 1. Switch the internal logic to Analysis
                    this.mode = 'analysis';
                    
                    // 2. Generate the final PGN string with the result included
                    const finalPgn = this.generatePGN();
                    
                    // 3. Inject the PGN into the UI display boxes
                    const pgnDisplay = document.getElementById('pgnDisplay');
                    if (pgnDisplay) {
                        if (pgnDisplay.tagName === 'INPUT' || pgnDisplay.tagName === 'TEXTAREA') {
                            pgnDisplay.value = finalPgn;
                        } else {
                            pgnDisplay.innerText = finalPgn;
                        }
                    }
                    
                    // 4. Force the UI to switch tabs and re-render the move history
                    if (window.ui.switchTab) window.ui.switchTab('analysis'); 
                    if (typeof window.ui.updateHistory === 'function') window.ui.updateHistory(true);
                    if (typeof window.ui.renderHeaders === 'function') window.ui.renderHeaders();
                    
                    // 5. Wake up Stockfish to analyze the final position
                    if (window.engineAnalysing && typeof this.updateStockfish === 'function') {
                        this.updateStockfish();
                    }
            }
        }
    }
togglePause() {
        this.isPaused = !this.isPaused;
        
        if (this.isPaused) {
            // STOP: Disable interaction
            if (window.ui) {
                window.ui.updateStatus("Game Paused ⏸️");
                // Optional: visual cue
                document.getElementById('chessBoard').style.opacity = '0.7';
            }
            if (window.sfWorker) window.sfWorker.postMessage('stop');
        } else {
            // RESUME
            if (window.ui) {
                window.ui.updateStatus("Game Resumed ▶️");
                document.getElementById('chessBoard').style.opacity = '1';
            }
            // If it was a bot turn, re-trigger
            if (this.mode === 'human_vs_bot' && this.turn === this.botColor) {
                this.triggerBotMove();
            }
        }
    }
stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
startTimer() {
        this.stopTimer();

        this.whiteTime = Number(this.whiteTime) || 0;
        this.blackTime = Number(this.blackTime) || 0;

        this.timerInterval = setInterval(() => {
            if (this.gameOver || this.isEditing || this.isAnalysisMode || this.isPaused || !this.isPlayingLiveGame) {
                return;
            }
            
            // 🔥 THE FIX: Tick the clock of the TRUE LIVE turn!
            const liveTurn = this.currentLiveTurn;

            if (liveTurn === 'w') {
                this.whiteTime = Math.max(0, this.whiteTime - 1);
                if (this.whiteTime <= 0) this.endGame('timeout', 'b'); 
            } else { 
                this.blackTime = Math.max(0, this.blackTime - 1);
                if (this.blackTime <= 0) this.endGame('timeout', 'w'); 
            }
            
            if (typeof window !== 'undefined' && window.ui && typeof window.ui.updateClocks === 'function') {
                window.ui.updateClocks();
            }
        }, 1000);
    }
syncMoveHistory() {
        this.moveList = [];
        this.history = [];
        
        let path = [];
        let trace = this.currentNode;
        
        // 1. Trace back to the root instantly
        while (trace && trace !== this.rootNode) {
            path.unshift(trace);
            trace = trace.parent;
        }
        
        // 2. Push the starting FEN
        const startFen = this.rootNode.fen === 'start' ? INITIAL_FEN : this.rootNode.fen;
        this.history.push(startFen);

        // 3. Populate arrays using the pre-calculated node data! NO CHESS.JS VALIDATION!
        path.forEach(node => {
            if (node.lastMove) this.moveList.push(node.lastMove);
            else if (node.moveSan) this.moveList.push(node.moveSan); // Fallback
            
            // Trust the node's saved FEN instead of recalculating the whole game
            this.history.push(node.fen);
        });
    }
deleteNode(node) {
        if (!node || !node.parent) return; 

        const parent = node.parent;
        const index = parent.children.indexOf(node);
        
        let isViewingDeletedLine = false;
        let curr = this.currentNode;
        while (curr) {
            if (curr === node) {
                isViewingDeletedLine = true;
                break;
            }
            curr = curr.parent;
        }

        if (index !== -1) {
            parent.children.splice(index, 1);
        }

        if (parent.selectedChildIndex >= parent.children.length) {
            parent.selectedChildIndex = Math.max(0, parent.children.length - 1);
        }

        if (isViewingDeletedLine) {
            this.currentNode = parent;
            
            // 🔥 THE FIX: Sync the arrays using the helper BEFORE doing any resets!
            this.syncMoveHistory();
            
            // Instant Engine Halt & Hard Reset
            if (window.sfWorker) {
                window.sfWorker.postMessage('stop');
                window.sfWorker.postMessage('ucinewgame');
            }
            
            if (window.engineAnalysing) {
                const box = document.getElementById('engine-lines-box');
                if (box) box.innerHTML = '<div id="calc-placeholder" style="color:#888; font-size:13px; font-style:italic; padding:8px;">Calculating new position...</div>';
                
                const arrowRoot = document.getElementById('tempArrowRoot');
                if (arrowRoot) arrowRoot.innerHTML = '';

                const depthEl = document.getElementById('depth-display');
                if (depthEl) depthEl.innerText = 'Depth: 0 | Nps: 0';
            }

            if (this.engine) {
                this.engine.load(this.currentNode.fen);
                this.turn = this.engine.turn();
            }
            this.reconcileBoardIds(this.currentNode.fen, null);
            this._pendingFen = null; 
            
            if (typeof window.ui !== 'undefined') {
                window.ui._lastTreeSize = -1;
                window.ui.updateHistory(true); 
                window.ui.renderBoard(true);
                window.ui.renderArrows();
                window.ui.updateClocks();
                if (typeof window.ui.renderCharts === 'function') window.ui.renderCharts(true);
                
                const popup = document.getElementById('annotationPopup');
                if (popup) popup.style.display = 'none';
            }
            
            if (window.engineAnalysing) {
                this.updateStockfish(); 
            }
        } else {
            if (typeof window.ui !== 'undefined') {
                window.ui._lastTreeSize = -1;
                window.ui.updateHistory(true);
                
                const popup = document.getElementById('annotationPopup');
                if (popup) popup.style.display = 'none';
            }
        }
    }
promoteVariation(node) {
        let branchHeader = node;
        while (branchHeader.parent && 
               branchHeader.parent.children && 
               branchHeader.parent.children[0] === branchHeader) {
            branchHeader = branchHeader.parent;
            if (branchHeader === this.rootNode) break;
        }
        const actualParent = branchHeader.parent;
        if (!actualParent || !actualParent.children) return;
        
        const siblings = actualParent.children;
        const index = siblings.indexOf(branchHeader);

        if (index > 0) {
            [siblings[index - 1], siblings[index]] = [siblings[index], siblings[index - 1]];
            actualParent.selectedChildIndex = index - 1;
        }

        if (typeof this.syncMoveHistory === 'function') this.syncMoveHistory();
    }
makeMainline(node) {
        if (!node || !node.parent) return;
        
        // 1. Traverse UP: Elevate this node and all its parents to the mainline
        let curr = node;
        while (curr && curr.parent) {
            const parent = curr.parent;
            const siblings = parent.children;
            const index = siblings.indexOf(curr);
            if (index !== -1) {
                siblings.splice(index, 1);
                siblings.unshift(curr);
                parent.selectedChildIndex = 0;
            }
            curr = parent;
        }

        // 2. Traverse DOWN: Elevate the active sub-path to the mainline!
        curr = node;
        while (curr && curr.children && curr.children.length > 0) {
            const activeIdx = curr.selectedChildIndex || 0;
            if (activeIdx !== 0 && curr.children.length > 1) {
                const childToElevate = curr.children[activeIdx];
                curr.children.splice(activeIdx, 1);
                curr.children.unshift(childToElevate);
                curr.selectedChildIndex = 0;
            }
            curr = curr.children[0];
        }

        if (typeof this.syncMoveHistory === 'function') this.syncMoveHistory();
    }
resetTreeSelection(node) {
if (!node)
return;
node.selectedChildIndex = 0;
for (let c of node.children)
this.resetTreeSelection(c);
}
parseArrowsAndCircles(node, comment) {
if (!comment) return;

// Reset arrays
node.arrows = [];
node.circles = [];

// --- Helper: Convert 'a8'->0 ... 'h1'->63 ---
const squareToIndex = (sq) => {
if (!sq || sq.length < 2) return -1;
const file = sq.charCodeAt(0) - 97; // 'a'=>0
const rank = parseInt(sq[1], 10);   // '1'=>1

if (isNaN(rank)) return -1;

// Convert Rank (1-8) to Row (7-0)
const row = 8 - rank; 

if (file < 0 || file > 7 || row < 0 || row > 7) return -1;
return row * 8 + file;
};

// --- Helper: Color Mapping (Fixed Spaces) ---
const getColorName = (code) => {
if (code === 'R') return 'red';
if (code === 'B') return 'blue';
if (code === 'Y' || code === 'O') return 'orange';
return 'green'; // Default
};

// 1. Parse Arrows [%cal Gc2c4]
const calMatches = comment.match(/\[%cal\s+([^\]]+)\]/g);
if (calMatches) {
calMatches.forEach(tag => {
const content = tag.replace(/^\[%cal\s+|\]$/g, '');
const entries = content.split(/[,\s]+/);
entries.forEach(str => {
if (str.length >= 5) {
const colorCode = str[0];
const fromSq = str.substring(1, 3);
const toSq = str.substring(3, 5);

const fromIdx = squareToIndex(fromSq);
const toIdx = squareToIndex(toSq);

if (fromIdx !== -1 && toIdx !== -1) {
node.arrows.push({ 
from: fromIdx, 
to: toIdx, 
color: getColorName(colorCode) 
});
}
}
});
});
}

// 2. Parse Circles [%csl Gc2]
const cslMatches = comment.match(/\[%csl\s+([^\]]+)\]/g);
if (cslMatches) {
cslMatches.forEach(tag => {
const content = tag.replace(/^\[%csl\s+|\]$/g, '');
const entries = content.split(/[,\s]+/);
entries.forEach(str => {
if (str.length >= 3) {
const colorCode = str[0];
const sq = str.substring(1, 3);

const idx = squareToIndex(sq);

if (idx !== -1) {
node.circles.push({ 
sq: idx, 
color: getColorName(colorCode) 
});
}
}
});
});
}

// Auto-render (Fixed 'undefined' check)
if (typeof ui !== 'undefined' && window.ui.renderArrows) {
window.ui.renderArrows();
}
}
loadPGN(pgn, isEditor = false) {
        // 🔥 THE FIX: Auto-detect Chess960 from PGN headers before anything else!
        if (typeof pgn === 'string') {
            const is960 = /\[Variant\s+"(?:Chess960|Fischerandom|Fischer Random)"\]/i.test(pgn);
            this.isChess960 = is960;
            if (window.sfWorker) {
                window.sfWorker.postMessage(`setoption name UCI_Chess960 value ${is960 ? 'true' : 'false'}`);
            }
        }

        // 1. SETUP
        this.isLoadingPGN = true;
        const timerId = `PGN_Load_${Date.now()}`;
        console.time(timerId);

        if (window.sfWorker) window.sfWorker.postMessage('stop');

        // Silence UI
        const backups = { ui: {}, game: {}, console: {} };
        const silence = (obj, method, storage) => {
            if (obj && typeof obj[method] === 'function') {
                storage[method] = obj[method];
                obj[method] = () => {};
            }
        };

        if (typeof ui !== 'undefined') {
            ['updateHistory', 'renderBoard', 'renderArrows', 'renderHeaders', 'highlightLastMove', 'updateClocks', 'updateStatus', 'scrollToActiveMove', 'showNotification', 'updatePuzzleStats', 'updatePlayerNames', 'displayMetadata','renderCharts'].forEach(m => silence(ui, m, backups.ui));
        }
        ['updateStockfish', 'triggerMoveSound', 'reconcileBoardIds', 'checkGameState', 'onMove', 'reconcileBoardIdsReverse', 'attemptPremove', 'endGame', 'saveToLocalStorage'].forEach(m => silence(this, m, backups.game));
        ['log', 'info', 'warn', 'debug'].forEach(m => silence(console, m, backups.console));

        try {
            this.moveList = [];
            this.history = [];
            this.fens = [];
            this.pgnHeaders = {};

            this.engine = new (typeof Chess === 'function' ? Chess : window.Chess)();
            this.board = Array(64).fill(null);

            // 3. PARSE HEADERS
            const headerRegex = /\[([A-Za-z0-9_]+)\s+"([^"]*)"\]/g;
            let match;
            while ((match = headerRegex.exec(pgn)) !== null) {
                this.pgnHeaders[match[1]] = match[2];
            }

            let moveTextRaw = pgn.replace(/\[[A-Za-z0-9_]+\s+"[^"]*"\]/g, '').trim();

            // Setup Clock & Root
            let initialTime = 600;
            this.timeIncrement = 0;
            
            if (this.pgnHeaders['TimeControl']) {
                const parts = this.pgnHeaders['TimeControl'].split('+');
                const parsed = parseFloat(parts[0]);
                if (!isNaN(parsed)) initialTime = parsed;
                if (parts.length > 1) {
                    const inc = parseFloat(parts[1]);
                    if (!isNaN(inc)) this.timeIncrement = inc;
                }
            }
            
            this.currentWTime = this.currentBTime = initialTime;

            const fen = this.pgnHeaders['FEN'] || INITIAL_FEN;
            this.rootNode = new MoveNode(fen, null);
            this.rootNode.clock = { w: initialTime, b: initialTime };

            this.currentNode = this.rootNode;
            this.loadFEN(this.rootNode.fen);

            // 4. ENGINE DETECTION
            const wName = (this.pgnHeaders['White'] || "").toLowerCase();
            const bName = (this.pgnHeaders['Black'] || "").toLowerCase();
            const event = (this.pgnHeaders['Event'] || "").toLowerCase();
            const keywords = [
                'stockfish', 'torch', 'leela', 'lc0', 'komodo', 'houdini', 'rybka', 
                'akimbo', 'minic', 'berserk', 'ethereal', 'koivisto', 'seer', 'slowchess',
                'computer', 'engine', 'bot', 'ai', 'ccc', 'tcec', 'tcc'
            ];
            let isEng = keywords.some(k => (wName.includes(k) && bName.includes(k)) || event.includes(k));

            if (!isEng) {
                const pvMatch = moveTextRaw.match(/pv\s*=|pv\s+[a-h][1-8]/i);
                if (pvMatch) isEng = true;
            }
            this.isEngineMatch = isEng;

            /// 5. TOKENIZER
            let tokens = [];
            let len = moveTextRaw.length;
            let i = 0;
            let code, start;
            while (i < len) {
                code = moveTextRaw.charCodeAt(i);
                if (code <= 32) { i++; continue; }
                if (code === 123) { // {
                    start = i; while (i < len && moveTextRaw.charCodeAt(i) !== 125) i++;
                    tokens.push(moveTextRaw.substring(start, i + 1)); i++; continue;
                }
                
                // 🔥 THE FIX: Do not swallow parentheses attached to NAGs! (e.g. "$1)")
                if (code === 36) { // $
                    start = i; 
                    while (i < len) {
                        let c = moveTextRaw.charCodeAt(i);
                        if (c <= 32 || c === 125 || c === 41 || c === 40) break;
                        i++;
                    }
                    tokens.push(moveTextRaw.substring(start, i)); 
                    continue;
                }
                
                if (code === 40 || code === 41) { // ( )
                    tokens.push(moveTextRaw.charAt(i)); i++; continue;
                }
                start = i;
                while (i < len) {
                    let c = moveTextRaw.charCodeAt(i);
                    if (c <= 32 || c === 125 || c === 41 || c === 40) break;
                    i++;
                }
                if (i > start) {
                    let word = moveTextRaw.substring(start, i);
                    if (word.endsWith('.')) tokens.push(word);
                    else if (word.includes('...')) {
                        const dotIndex = word.lastIndexOf('.');
                        if (dotIndex !== -1) {
                            tokens.push(word.substring(0, dotIndex + 1));
                            if (word.substring(dotIndex + 1)) tokens.push(word.substring(dotIndex + 1));
                        } else tokens.push(word);
                    } else {
                        let dotIndex = word.indexOf('.');
                        if (dotIndex !== -1 && dotIndex < word.length - 1) {
                            tokens.push(word.substring(0, dotIndex + 1));
                            tokens.push(word.substring(dotIndex + 1));
                        } else tokens.push(word);
                    }
                } else i++;
            }

            // 6. PARSE TOKENS
            this.parsePGNTokens(tokens, 0);
        } catch (e) {
            backups.console.error("PGN Parsing Error:", e);
        } 
        finally {
            this.isLoadingPGN = false;
            this.clearPremoves();
            this.premoveQueue = []; 
            
            if (this.mode !== 'study' && this.mode !== 'editor') {
                this.mode = 'analysis'; 
                this.gameOver = false;
            }
            
            this.isPaused = false; 
            this.pgn = "";
            if (window.ui && window.ui.togglePgnEditing) {
                window.ui.togglePgnEditing(true);
            }
            if (window.ui && window.ui.toggleReviewButton) {
                window.ui.toggleReviewButton(true);
            }
            Object.keys(backups.console).forEach(m => console[m] = backups.console[m]);
            Object.keys(backups.game).forEach(m => this[m] = backups.game[m]);

            if (typeof ui !== 'undefined') {
                Object.keys(backups.ui).forEach(m => ui[m] = backups.ui[m]);
                try {
                    if (this.currentNode) {
                        this.reconcileBoardIds(this.currentNode.fen, this.currentNode.lastMove);
                        if (this.currentNode.clock) {
                            this.whiteTime = this.currentNode.clock.w;
                            this.blackTime = this.currentNode.clock.b;
                            this.currentWTime = this.currentNode.clock.w;
                            this.currentBTime = this.currentNode.clock.b;
                        }

                        if (window.ui.moveListContainer) window.ui.moveListContainer.innerHTML = '';
                        if (window.ui.updateClocks) window.ui.updateClocks();
                        
                        const wLabel = (this.pgnHeaders['White'] || 'White') + (this.pgnHeaders['WhiteElo'] ? ` (${this.pgnHeaders['WhiteElo']})` : '');
                        const bLabel = (this.pgnHeaders['Black'] || 'Black') + (this.pgnHeaders['BlackElo'] ? ` (${this.pgnHeaders['BlackElo']})` : '');
                        if (window.ui.updatePgnAvatars) {
                            window.ui.updatePgnAvatars(this.pgnHeaders['White'], this.pgnHeaders['Black'], this.isEngineMatch, true);
                        }
                        
                        if (window.ui.flipped) window.ui.updatePlayerNames(wLabel, bLabel);
                        else window.ui.updatePlayerNames(bLabel, wLabel);

                        window.ui.displayMetadata(this.pgnHeaders);
                        
                        // --- ACCURATE CHESS.COM COUNTRY MAP ---
const chesscomCountryMap = {
    "2": "us", "3": "ca", "4": "ar", "5": "be", "9": "af",
    "10": "al", "11": "ad", "12": "ai", "13": "ag", "14": "am", "15": "aw", "17": "au", "18": "at", "19": "bs",
    "20": "bh", "21": "bb", "22": "xx", "23": "bz", "24": "bm", "25": "bo", "26": "ba", "27": "br", "28": "bg", "29": "es-cn",
    "30": "ky", "32": "cl", "33": "cn", "34": "co", "35": "cr", "36": "hr", "37": "cu", "38": "cw", "39": "cy",
    "40": "cz", "41": "dk", "42": "dm", "43": "do", "44": "ec", "45": "eg", "46": "sv", "47": "ee", "48": "fk", "49": "fo",
    "50": "fj", "51": "fi", "52": "fr", "53": "ge", "54": "de", "55": "gi", "56": "gr", "57": "gl", "58": "gd", "59": "gp",
    "60": "gu", "61": "gt", "62": "gg", "63": "gy", "64": "ht", "65": "hn", "66": "hk", "67": "hu", "68": "is", "69": "in",
    "70": "id", "71": "ir", "72": "iq", "73": "ie", "74": "im", "75": "il", "76": "it", "77": "jm", "78": "jp", "79": "je",
    "80": "jo", "81": "kz", "82": "ki", "84": "kw", "85": "lv", "86": "lb", "87": "li", "88": "lt", "89": "lu",
    "90": "mo", "91": "mk", "92": "my", "93": "mt", "94": "mq", "95": "md", "96": "mx", "97": "mc", "98": "ms", "99": "nr",
    "100": "np", "101": "nl", "102": "nz", "103": "ni", "104": "no", "105": "om", "106": "pk", "107": "pa", "108": "pg", "109": "py",
    "110": "pe", "111": "ph", "112": "pl", "113": "pt", "114": "pr", "115": "ro", "116": "ru", "118": "kn", "119": "lc",
    "120": "pm", "122": "sm", "123": "sa", "125": "sg", "126": "sk", "127": "si", "128": "sb", "129": "za",
    "130": "gs", "131": "sr", "132": "se", "133": "ch", "134": "tw", "135": "th", "136": "to", "137": "tt", "138": "tr", "139": "tm",
    "140": "tv", "141": "ua", "142": "ae", "143": "uy", "145": "uz", "146": "vu", "147": "va", "148": "ve", "149": "vn",
    "151": "ye", "153": "as", "154": "vc", "156": "az", "157": "mn", "158": "sy", "159": "gb-eng",
    "160": "mh", "162": "gb-sct", "163": "es", "164": "gb", "165": "vi", "166": "gb-wls",
    "175": "kr", "176": "kg", "177": "bd", "178": "sd", "179": "bj",
    "180": "bt", "181": "bw", "182": "bn", "183": "bi", "184": "kh", "185": "cm", "186": "cv", "187": "cf", "188": "td", "189": "cg",
    "190": "ci", "191": "dj", "192": "gq", "193": "ga", "194": "gh", "195": "ke", "196": "la", "197": "lr", "198": "mg", "199": "ma",
    "200": "mz", "201": "mm", "202": "na", "203": "ne", "204": "ng", "206": "qa", "207": "rw", "208": "ws", "209": "st",
    "210": "sn", "211": "sl", "212": "so", "213": "lk", "214": "sz", "215": "tj", "216": "tz", "217": "tl", "218": "tg", "219": "tn",
    "220": "ug", "221": "zm", "222": "zw", "223": "dz", "224": "mr", "225": "xx"
};
                        window.ui.playerInfo = window.ui.playerInfo || { w: {}, b: {} };

                        window.ui.playerInfo['w'].country = chesscomCountryMap[this.pgnHeaders['WhiteCountry']] || null;
                        window.ui.playerInfo['b'].country = chesscomCountryMap[this.pgnHeaders['BlackCountry']] || null;
                        window.ui.playerInfo['w'].title = this.pgnHeaders['WhiteTitle'] || null;
                        window.ui.playerInfo['b'].title = this.pgnHeaders['BlackTitle'] || null;
                        const fetchMissingFlag = async (username, color) => {
                            if (!username || this.isEngineMatch) return;
                            try {
                                const res = await fetch(`https://api.chess.com/pub/player/${username}`);
                                if (!res.ok) return;
                                const data = await res.json();
                                if (data.country) {
                                    const isoCode = data.country.split('/').pop().toLowerCase();
                                    window.ui.playerInfo[color].country = isoCode;
                                    window.ui.renderHeaders(); 
                                }
                            } catch (e) { }
                        };

                        if (!window.ui.playerInfo['w'].country && this.pgnHeaders['WhiteCountry']) {
                            fetchMissingFlag(this.pgnHeaders['White'], 'w');
                        }
                        if (!window.ui.playerInfo['b'].country && this.pgnHeaders['BlackCountry']) {
                            fetchMissingFlag(this.pgnHeaders['Black'], 'b');
                        }
                        
                        this.currentNode = this.rootNode;
                        window.game.loadFEN(this.rootNode.fen);
                        window.ui.updateHistory();
                        window.ui.renderBoard(true);
                        window.ui.renderArrows();
                        window.ui.renderHeaders();
                        requestAnimationFrame(() => {window.ui.renderCharts();});
                        this.mode = 'analysis';
                    }
                } catch (err) {
                    console.warn("UI refresh warning:", err);
                }
            }
            console.timeEnd(timerId);
        }
    }
parsePGNTokens(tokens, index) {
        const tlRegex = /tl\s*=\s*(\d+(\.\d+)?)/;
        const lichessEvalRegex = /\[%eval\s+([#]?[+-]?[\d\.]+)\]/; 
        const lichessClkRegex = /\[%clk\s+([0-9:]+)\]/; 
        const cccEvalRegex = /([+-]?(?:M)?\d+(?:\.\d+)?)\/(\d+)/; 
        
        const lichessCalRegex = /\[%cal\s+([^\]]+)\]/;
        const lichessCslRegex = /\[%csl\s+([^\]]+)\]/;

        const decodeLichessColor = (c) => {
            if (c === 'R') return 'red';
            if (c === 'B') return 'blue';
            if (c === 'Y') return 'yellow';
            return 'green'; 
        };

        while (index < tokens.length) {
            let token = tokens[index].trim();
            if (!token) { index++; continue; }

            if (token === '(') {
                let savedNode = this.currentNode;
                let savedW = this.currentWTime;
                let savedB = this.currentBTime;
                let savedFen = this.engine.fen();

                if (this.currentNode.parent) {
                    this.currentNode = this.currentNode.parent;
                    if (this.currentNode.fen) try { this.engine.load(this.currentNode.fen); } catch(e) {}
                }
                index = this.parsePGNTokens(tokens, index + 1);
                this.currentNode = savedNode;
                this.currentWTime = savedW;
                this.currentBTime = savedB;
                try { this.engine.load(savedFen); } catch(e) {}
            }
            else if (token === ')') {
                return index;
            }
            else if (token.startsWith('$') || /^[!?]+$/.test(token)) {
                // 🔥 THE FIX: Separate multiple NAGs with commas so they don't break the rendering function
                if (this.currentNode) {
                    this.currentNode.nag = (this.currentNode.nag ? this.currentNode.nag + "," : "") + token;
                }
            }
            else if (token.startsWith('{')) {
                let rawComment = token.replace(/^\{|\}$/g, '').trim();
                
                if (rawComment === 'book') this.currentNode.isBook = true;

                // 1. PARSE LICHESS EVAL
                let evMatch = rawComment.match(lichessEvalRegex);
                if (evMatch) {
                    const rawVal = evMatch[1];
                    const isMate = rawVal.includes('#');
                    const val = parseFloat(rawVal.replace(/[#+]/g, ''));
                    
                    if (!isNaN(val)) {
                        this.currentNode.score = { unit: isMate ? 'mate' : 'pawn', value: val };
                        if (isMate) {
                            if (val === 0) {
                                let whiteJustMoved = this.currentNode.fen.split(' ')[1] === 'b';
                                this.currentNode.eval = whiteJustMoved ? "+M0" : "-M0";
                                this.currentNode.evalScore = whiteJustMoved ? 100000 : -100000;
                            } else {
                                this.currentNode.eval = (val > 0 ? "M" : "-M") + Math.abs(val);
                                this.currentNode.evalScore = val > 0 ? 100000 - Math.abs(val) : -100000 + Math.abs(val);
                            }
                        } else {
                            this.currentNode.eval = (val > 0 ? "+" : "") + val.toFixed(2);
                            this.currentNode.evalScore = val * 100;
                        }
                    }
                }

                // 2. PARSE CCC EVAL
                if (!this.currentNode.eval) {
                    let engMatch = rawComment.match(/^([+-])?(M)?(\d+(\.\d+)?)\/(\d+)/);
                    if (engMatch) {
                        let depth = parseInt(engMatch[5], 10);
                        if (depth > 0) { 
                            let sign = engMatch[1] === '-' ? -1 : 1;
                            let isMate = engMatch[2] === 'M';
                            let val = parseFloat(engMatch[3]);
                            
                            this.currentNode.eval = (engMatch[1]||"") + (engMatch[2]||"") + engMatch[3]; 

                            if (!isNaN(val)) {
                                if (this.isEngineMatch) {
                                    let justMovedColor = this.currentNode.fen.split(' ')[1] === 'w' ? 'b' : 'w';
                                    if (justMovedColor === 'b') sign *= -1; 
                                    this.currentNode.evalScore = isMate ? (sign > 0 ? 100000 - val : -100000 + val) : (sign * val * 100);
                                } else {
                                    this.currentNode.score = { unit: isMate ? 'mate' : 'pawn', value: val * sign };
                                    this.currentNode.evalScore = isMate ? (sign > 0 ? 100000 - val : -100000 + val) : (sign * val * 100);
                                }
                            }
                        }
                    }
                }

                // 3. PARSE CLOCKS
                const clkMatch = rawComment.match(lichessClkRegex);
                const tlMatch = rawComment.match(/tl=([\d\.]+)s?/);
                const npsMatch = rawComment.match(/nps=(\d+)/);
                const latencyMatch = rawComment.match(/latency=([\d\.]+)s?/);
                
                let timeLeft = null;

                if (clkMatch) {
                    const parts = clkMatch[1].split(':');
                    timeLeft = parts.reduce((acc, time) => (60 * acc) + +time, 0);
                } else if (tlMatch) {
                    timeLeft = parseFloat(tlMatch[1]);
                    this.currentNode.cccTimeLeft = tlMatch[1]; 
                }
                
                if (npsMatch) this.currentNode.nps = npsMatch[1];
                if (latencyMatch) this.currentNode.latency = latencyMatch[1];

                const pvMatch = rawComment.match(/pv=(?:\\*["'])?([^"}\\]+)/);
                if (pvMatch) this.currentNode.pv = pvMatch[1].trim();

                if (timeLeft !== null && !isNaN(timeLeft)) {
                    let justMovedColor = this.engine.turn() === 'b' ? 'w' : 'b';
                    let prevTime = null;
                    
                    if (this.currentNode.parent && this.currentNode.parent.clock) {
                        prevTime = this.currentNode.parent.clock[justMovedColor];
                    }

                    if (justMovedColor === 'w') this.currentWTime = timeLeft;
                    else this.currentBTime = timeLeft;
                    
                    this.currentNode.clock = { w: this.currentWTime, b: this.currentBTime };
                    
                    if (prevTime !== null) {
                        let isFirstMove = (this.currentNode.parent === this.rootNode || (this.currentNode.parent && this.currentNode.parent.parent === this.rootNode));
                        let inc = isFirstMove ? 0 : this.timeIncrement;
                        let spent = prevTime - timeLeft + inc;
                        this.currentNode.timeSpent = Math.max(0, spent); 
                    } else {
                        this.currentNode.timeSpent = 0;
                    }
                }
                
                // 4. PARSE ARROWS / CIRCLES
                let calMatch = rawComment.match(lichessCalRegex);
                if (calMatch) {
                    this.currentNode.arrows = [];
                    let shapes = calMatch[1].split(',');
                    shapes.forEach(shape => {
                        let colorCode = shape.charAt(0);
                        let from = shape.substring(1, 3);
                        let to = shape.substring(3, 5);
                        this.currentNode.arrows.push({ from: from, to: to, color: decodeLichessColor(colorCode) });
                    });
                }

                let cslMatch = rawComment.match(lichessCslRegex);
                if (cslMatch) {
                    this.currentNode.circles = [];
                    let shapes = cslMatch[1].split(',');
                    shapes.forEach(shape => {
                        let colorCode = shape.charAt(0);
                        let sq = shape.substring(1, 3);
                        this.currentNode.circles.push({ square: sq, color: decodeLichessColor(colorCode) });
                    });
                }

                // =========================================================
                // 🔥 THE FIX: SMART COMMENT FILTER 🔥
                // =========================================================
                let cleanComment = rawComment.replace(/\[%(eval|clk|cal|csl)[^\]]*\]/g, '').trim();
                
                // 1. We test if there is ANY actual human text mixed in with the engine data
                let humanTest = cleanComment.replace(/,?\s*tl=[^,\s]+/ig, "")
                                            .replace(/,?\s*nps=[^,\s]+/ig, "")
                                            .replace(/,?\s*latency=[^,\s]+/ig, "")
                                            .replace(/,?\s*pv=(?:\\*["'])?[^"}\\]*(?:\\*["'])?/ig, "")
                                            .replace(/,?\s*[-+]?(?:M)?\d+(?:\.\d+)?\/\d+/g, "")
                                            .replace(/,?\s*\b\d+(?:\.\d+)?s\b/g, "")
                                            .replace(/DEPTH:\s*\d+\s*/gi, "")
                                            .replace(/,?\s*-\s*$/, "")
                                            .replace(/^,?\s*/, "").replace(/,?\s*$/, "").trim();

                // 2. If it is PURELY engine data (humanTest is empty), we wipe it so the UI doesn't draw an empty bubble!
                if (humanTest === '' || humanTest === '-' || humanTest === ',-') {
                    cleanComment = ""; 
                } else {
                    // 3. If there IS human text, we keep the time and eval formats intact!
                    // We just strip the ugly backend parameters like tl, pv, nps, latency
                    cleanComment = cleanComment.replace(/,?\s*tl=[^,\s]+/ig, "")
                                               .replace(/,?\s*nps=[^,\s]+/ig, "")
                                               .replace(/,?\s*latency=[^,\s]+/ig, "")
                                               .replace(/,?\s*pv=(?:\\*["'])?[^"}\\]*(?:\\*["'])?/ig, "")
                                               .replace(/,?\s*-\s*$/, "").trim();
                    
                    // If it's a standard PGN (not an engine match), we aggressively clean it up
                    if (!this.isEngineMatch) {
                        cleanComment = cleanComment.replace(/,?\s*[-+]?(?:M)?\d+(?:\.\d+)?\/\d+/g, ""); 
                        cleanComment = cleanComment.replace(/,?\s*\b\d+(?:\.\d+)?s\b/g, ""); 
                        cleanComment = cleanComment.replace(/DEPTH:\s*\d+\s*/gi, ""); 
                    }

                    cleanComment = cleanComment.replace(/^,?\s*/, "").replace(/,?\s*$/, "").trim();
                    cleanComment = cleanComment.replace(/\s{2,}/g, ' ');
                }

                if (cleanComment && cleanComment !== 'book') {
                    this.currentNode.comment = (this.currentNode.comment ? this.currentNode.comment + " " : "") + cleanComment;
                }
                
                // Trigger Engine parsing for PV trees regardless of match type!
                const isEngineLog = rawComment.includes('pv=') || 
                                    rawComment.includes('nps=') ||
                                    cccEvalRegex.test(rawComment);

                if (isEngineLog && typeof this.processEngineComment === 'function') {
                    this.processEngineComment(this.currentNode, rawComment);
                }
            }
            else {
                if (!['*', '1-0', '0-1', '1/2-1/2'].includes(token) && !token.endsWith('.')) {
                    let moveText = token;
                    let attachedNag = "";
                    let match = token.match(/^(.*?)([?!]+)$/);
                    if (match) { moveText = match[1]; attachedNag = match[2]; }

                    let engineInput = moveText; 
                    const uciMatch = engineInput.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
                    if (uciMatch) engineInput = { from: uciMatch[1], to: uciMatch[2], promotion: uciMatch[3] };

                    let moveObj = this.engine.move(engineInput);
                    let isIllegal = !moveObj;
                    if (isIllegal) moveObj = { san: moveText, from: -1, to: -1, flags: '', color: this.engine.turn(), piece: '' };

                    const newNode = new MoveNode(this.engine.fen(), moveObj.san);
                    newNode.lastMove = {
                        from: isIllegal ? -1 : this.squareToIndex(moveObj.from),
                        to: isIllegal ? -1 : this.squareToIndex(moveObj.to),
                        flags: moveObj.flags, piece: moveObj.piece, color: moveObj.color
                    };
                    if (attachedNag) newNode.nag = attachedNag;
                    if (isIllegal) newNode.isIllegal = true;

                    newNode.parent = this.currentNode;
                    this.currentNode.children.push(newNode);
                    this.currentNode = newNode;
                    
                    this.currentNode.clock = { w: this.currentWTime, b: this.currentBTime };
                }
            }
            index++;
        }
        return index;
    }
addPVToNode(node, pvString) {
        if (!pvString || !node) return;

        // Save state so the main parser doesn't lose its place
        let savedNode = this.currentNode;
        let savedFen = this.engine.fen();

        let moves = pvString.trim().split(/\s+/);
        if (moves.length === 0) return;

        let startNode = node;
        let loadFen = node.fen;

        // Auto-detect if the PV starts from the parent node (Standard for Engine/CCC PGNs)
        if (node.parent) {
            try {
                this.engine.load(node.parent.fen);
                let firstMoveText = moves[0].replace(/[?!]+$/, '');
                let uciMatch = firstMoveText.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
                let testInput = firstMoveText;
                
                if (uciMatch) {
                    testInput = { from: uciMatch[1], to: uciMatch[2] };
                    if (uciMatch[3]) testInput.promotion = uciMatch[3].toLowerCase();
                }

                // If the first PV move is legal from the parent position, branch from the parent!
                if (this.engine.move(testInput)) {
                    startNode = node.parent;
                    loadFen = node.parent.fen;
                }
            } catch(e) {}
        }

        // Set the engine to the correct branching point
        this.currentNode = startNode;
        try { this.engine.load(loadFen); } catch(e) { return; }

        for (let i = 0; i < moves.length; i++) {
            let moveText = moves[i].replace(/[?!]+$/, '');
            if (!moveText) continue;

            let uM = moveText.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
            let eInput = moveText;
            if (uM) {
                eInput = { from: uM[1], to: uM[2] };
                if (uM[3]) eInput.promotion = uM[3].toLowerCase();
            }

            let moveObj = this.engine.move(eInput);
            if (!moveObj) break; // Illegal PV move aborts the line silently

            let moveData = {
                from: typeof this.squareToIndex === 'function' ? this.squareToIndex(moveObj.from) : -1,
                to: typeof this.squareToIndex === 'function' ? this.squareToIndex(moveObj.to) : -1,
                flags: moveObj.flags, piece: moveObj.piece, color: moveObj.color
            };

            // This calls your updated addMoveToTree, which will see _isParsingPV = true
            // and safely create the side-by-side variation!
            this.addMoveToTree(this.engine.fen(), moveObj.san, moveData.to, moveData);
        }

        // Restore everything
        this.currentNode = savedNode;
        try { this.engine.load(savedFen); } catch(e) {}
    }
processEngineComment(node, rawComment) {
        if (rawComment.toLowerCase().includes('book')) {
            node.isBook = true;
            return;
        }
        
        // 1. Extract Depth & Flip Eval if necessary
        const scoreRegex = /([+-]?(?:M\d+|\d+\.\d+|\d+))\/(\d+)/;
        const scoreMatch = rawComment.match(scoreRegex);

        if (scoreMatch) {
            let rawScore = scoreMatch[1]; 
            node.depth = scoreMatch[2];
            
            if (this.isEngineMatch && node.lastMove && node.lastMove.color === 'b') {
                if (rawScore.startsWith('+')) {
                    rawScore = rawScore.replace('+', '-');
                } else if (rawScore.startsWith('-')) {
                    rawScore = rawScore.replace('-', '+');
                } else if (!rawScore.startsWith('-') && !rawScore.startsWith('+')) {
                    rawScore = '-' + rawScore;
                }
            }
            node.eval = rawScore;
        }
        
        // 2. Build the PV Variation Tree
        const pvRegex = /pv\s*=\s*\\?["']([^"'\\]+)\\?["']?/;
        const pvMatch = rawComment.match(pvRegex);
        if (pvMatch && pvMatch[1]) {
            // 🔥 THE FIX: Set a global flag so the tree builder knows this is an engine variation!
            this._isParsingPV = true;
            if (typeof this.addPVToNode === 'function') {
                this.addPVToNode(node, pvMatch[1].trim());
            }
            this._isParsingPV = false; // Reset flag immediately
        }
    }
addMoveToTree(fen, moveSan, toSq, moveData) {
        let isPVMove = !!this._isParsingPV;

        // 🔥 THE FIX: Separate Mainline and Variations!
        // We only reuse an existing node if it shares the exact same 'isPV' status.
        // This keeps the Engine's sub-variation perfectly parallel to the main game!
        let existingChild = this.currentNode.children.find(child => 
            child.moveSan === moveSan && !!child.isPV === isPVMove
        );

        if (existingChild) {
            this.currentNode = existingChild;
        } else {
            let newNode = new MoveNode(fen, moveSan, this.currentNode, "", 0, toSq);
            newNode.lastMove = moveData;
            newNode.isPV = isPVMove; // Tag the node so it never mixes with the mainline
            
            let wT = this.whiteTime !== undefined ? this.whiteTime : 600;
            let bT = this.blackTime !== undefined ? this.blackTime : 600;
            newNode.clock = { w: wT, b: bT };
            
            const now = Date.now();
            if (this.lastMoveTimestamp) {
                newNode.moveTime = now - this.lastMoveTimestamp;
            }
            this.lastMoveTimestamp = now;

            this.currentNode.children.push(newNode);
            if (this.currentNode.children.length === 1) {
                this.currentNode.selectedChildIndex = 0;
            }

            this.currentNode = newNode;
        }

        // 🔥 THE ARRAYS FIX: Do not push theoretical PV moves to the actual game history arrays!
        if (!isPVMove) {
            if (!this.history) this.history = [];
            if (!this.moveList) this.moveList = [];

            if (this.history.length === 0) {
                const startFen = this.rootNode.fen === 'start' ? INITIAL_FEN : this.rootNode.fen;
                this.history.push(startFen);
            }
            
            this.moveList.push(this.currentNode.lastMove || this.currentNode.moveSan);
            this.history.push(this.currentNode.fen);
        }

        // Skip UI updates if we are mass-loading a PGN or quietly parsing a PV
        if (this.isLoadingPGN || isPVMove) return; 
        
        try {
            if (typeof ui !== 'undefined') {
                if (this._historyRenderTimeout) clearTimeout(this._historyRenderTimeout);
                
                this._historyRenderTimeout = setTimeout(() => {
                    requestAnimationFrame(() => {
                        window.ui.updateHistory();
                    });
                }, 200); 
            }
        } catch (e) {}
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
getPly(node) {
        let ply = 0;
        let curr = node;
        while (curr && curr.parent) {
            ply++;
            curr = curr.parent;
        }
        return ply;
    }
generatePGN(format = 'both') {
        let pgn = "";
        
        for (let key in this.pgnHeaders) {
            pgn += `[${key} "${this.pgnHeaders[key]}"]\n`;
        }
        pgn += "\n";

        // Route EVERYTHING through the recursive function, passing the format down!
        pgn += this.generatePGNRecursive(this.rootNode, 1, false, format);
        
        pgn = pgn.trim().replace(/\s+/g, ' ');
        let result = this.pgnHeaders['Result'] || '*';
        if (!pgn.endsWith(result)) pgn += " " + result;

        return pgn;
    }
evalPGNGenerate(node, format = 'both') {
        let parts = [];
        let chessComMetadata = [];
        let evalVal = node.localEval !== undefined ? node.localEval : node.eval;

        // 1. Preserve existing clock matches before regex stripping
        let rawClkMatch = node.comment ? node.comment.match(/\[%clk\s+([0-9:]+)\]/) : null;
        let rawTlMatch = node.comment ? node.comment.match(/tl=([\d\.]+)s?/) : null;
        let origTimeSpentMatch = node.comment ? node.comment.match(/(?:^|\s|\{)\s*([\d\.]+)\s*s\b(?!.*tl=)/) : null;

        let rawComment = node.comment ? node.comment.trim() : "";
        if (rawComment) {
            rawComment = rawComment.replace(/\[%(eval|clk|cal|csl)[^\]]*\]/g, "").trim();
            rawComment = rawComment.replace(/DEPTH:\s*\d+\s*/g, "");
            rawComment = rawComment.replace(/[-+]?M?\d+(?:\.\d+)?\/\d+/g, "");
            rawComment = rawComment.replace(/,?\s*tl=[\d\.]+s?/g, "");
            rawComment = rawComment.replace(/,?\s*nps=\d+/g, "");
            rawComment = rawComment.replace(/,?\s*latency=[\d\.]+s?/g, "");
            rawComment = rawComment.replace(/,?\s*pv=(?:\\*["'])?[^"}\\]*(?:\\*["'])?/g, "");
            rawComment = rawComment.replace(/(?:^|\s|\{)\s*[\d\.]+\s*s\b(?!.*tl=)/g, "").trim(); // Strip raw duration
            rawComment = rawComment.replace(/,?\s*-\s*$/, "").trim();
            if (rawComment === '-') rawComment = "";
            rawComment = rawComment.replace(/^,\s*/, "").replace(/,\s*$/, "").trim();
        }

        if (format === 'clean') return rawComment ? `{ ${rawComment} }` : "";

        // 2. Mathematically rebuild time remaining
        let secondsLeft = null;
        let clkStr = null;

        if (node.timeLeft !== undefined && !isNaN(node.timeLeft)) {
            secondsLeft = node.timeLeft / 1000;
        } else if (node.cccTimeLeft !== undefined && !isNaN(node.cccTimeLeft)) {
            secondsLeft = parseFloat(node.cccTimeLeft);
        } else if (node.clock && node.lastMove) {
            secondsLeft = node.clock[node.lastMove.color];
        } else if (node.clock) {
            let turnNext = node.fen.split(' ')[1];
            let colorJustMoved = turnNext === 'w' ? 'b' : 'w';
            secondsLeft = node.clock[colorJustMoved];
        } else if (rawTlMatch) {
            secondsLeft = parseFloat(rawTlMatch[1]);
        }

        if (node.clk) {
            clkStr = node.clk;
        } else if (rawClkMatch) {
            clkStr = rawClkMatch[1];
        }

        if (secondsLeft !== null && !isNaN(secondsLeft) && !clkStr) {
            let t = Math.max(0, secondsLeft);
            let h = Math.floor(t / 3600);
            let m = Math.floor((t % 3600) / 60);
            let s = Math.floor(t % 60);
            clkStr = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }

        if (secondsLeft === null && clkStr) {
            const cParts = clkStr.split(':');
            if (cParts.length === 3) secondsLeft = (+cParts[0]) * 3600 + (+cParts[1]) * 60 + (+cParts[2]);
            else if (cParts.length === 2) secondsLeft = (+cParts[0]) * 60 + (+cParts[1]);
        }

        // 3. Compile Lichess format
        if (format === 'lichess' || format === 'both') {
            if (evalVal !== undefined && evalVal !== null) {
                let cleanEval = evalVal.toString().replace('+', '');
                if (cleanEval.includes('M')) cleanEval = cleanEval.replace('-M', '#-').replace('M', '#');
                parts.push(`[%eval ${cleanEval}]`);
            }

            if (clkStr) parts.push(`[%clk ${clkStr}]`);

            const getLichessColor = (color) => {
                if (!color) return 'G';
                let c = color.toLowerCase();
                if (c.includes('red') || c === 'r') return 'R';
                if (c.includes('blue') || c === 'b') return 'B';
                if (c.includes('yellow') || c.includes('orange') || c === 'y') return 'Y';
                return 'G'; 
            };

            if (node.arrows && node.arrows.length > 0) {
                let calTags = node.arrows.map(a => {
                    let fromStr = typeof a.from === 'number' ? this.indexToSquare(a.from) : a.from;
                    let toStr = typeof a.to === 'number' ? this.indexToSquare(a.to) : a.to;
                    return `${getLichessColor(a.color)}${fromStr}${toStr}`;
                });
                parts.push(`[%cal ${calTags.join(',')}]`);
            }
            if (node.circles && node.circles.length > 0) {
                let cslTags = node.circles.map(c => {
                    let rawSq = c.index !== undefined ? c.index : (c.sq !== undefined ? c.sq : c.square);
                    let sqStr = typeof rawSq === 'number' ? this.indexToSquare(rawSq) : rawSq;
                    return `${getLichessColor(c.color)}${sqStr}`;
                });
                parts.push(`[%csl ${cslTags.join(',')}]`);
            }
        }

        // 4. Compile Chess.com format
        if (rawComment) chessComMetadata.push(rawComment);

        if (format === 'chesscom' || format === 'both') {
            if (evalVal !== undefined && evalVal !== null) {
                let eStr = evalVal.toString();
                if (this.isEngineMatch && node.lastMove && node.lastMove.color === 'b') {
                    if (eStr.startsWith('+')) eStr = eStr.replace('+', '-');
                    else if (eStr.startsWith('-')) eStr = eStr.replace('-', '+');
                    else if (!eStr.startsWith('-') && !eStr.startsWith('+') && eStr !== '0' && eStr !== '0.00') eStr = '-' + eStr;
                }
                if (!eStr.startsWith('+') && !eStr.startsWith('-') && !eStr.includes('M')) eStr = '+' + eStr;
                let d = node.depth || 20; 
                chessComMetadata.push(`${eStr}/${d}`);
            }
            
            let finalTimeSpent = null;
            if (node.timeSpent !== undefined && !isNaN(node.timeSpent)) {
                finalTimeSpent = node.timeSpent.toFixed(3);
            } else if (node.moveTime !== undefined && !isNaN(node.moveTime)) {
                finalTimeSpent = (node.moveTime / 1000).toFixed(3);
            } else if (origTimeSpentMatch) {
                finalTimeSpent = origTimeSpentMatch[1];
            }

            if (finalTimeSpent !== null) chessComMetadata.push(`${finalTimeSpent}s`);
            if (secondsLeft !== null && secondsLeft !== undefined && !isNaN(secondsLeft)) {
                chessComMetadata.push(`tl=${secondsLeft.toFixed(3)}s`);
            }
            
            if (node.latency) chessComMetadata.push(`latency=${node.latency}s`);
            if (node.nps) chessComMetadata.push(`nps=${node.nps}`);
            if (node.isBook && !chessComMetadata.join(' ').toLowerCase().includes("book")) chessComMetadata.push("book");
            
            if (node.pv) {
                let shouldExportPV = false;
                if (this.isEngineMatch) shouldExportPV = true;
                else if (node.nag) {
                    const nags = node.nag.toString().split(',');
                    for (let n of nags) {
                        let cleanN = n.trim().replace('$', '');
                        if (['2', '4', '6', '?', '??', '?!'].includes(cleanN)) {
                            shouldExportPV = true; break;
                        }
                    }
                }
                if (shouldExportPV) {
                    let pvString = Array.isArray(node.pv) ? node.pv.join(' ') : node.pv;
                    if (pvString.trim() !== "-") chessComMetadata.push(`pv="${pvString.replace(/["\\]/g, '')}"`);
                }
            }
        }

        if (chessComMetadata.length > 0) {
            let finalChessCom = chessComMetadata.join(', ').replace(/,\s*,/g, ',');
            parts.push(finalChessCom);
        }

        return parts.length > 0 ? `{ ${parts.join(' ').trim()} }` : "";
    }
generatePGNRecursive(node, moveNum, forceNumber = false, format = 'both') {
        if (!node || !node.children || node.children.length === 0) return "";
        
        let pgn = "";
        let activeIdx = node.selectedChildIndex || 0;
        let mainChild = node.children[activeIdx];
        let ply = this.getPly(mainChild);
        let mNum = Math.ceil(ply / 2);
        let isWhite = (ply % 2 !== 0);

        // 1. Move Number and SAN
        if (isWhite) {
            pgn += `${mNum}. ${mainChild.moveSan}`;
        } else {
            if (forceNumber || node === this.rootNode) {
                pgn += `${mNum}... ${mainChild.moveSan}`;
            } else {
                pgn += `${mainChild.moveSan}`;
            }
        }
        
        // 2. NAGs
        if (mainChild.nag) {
            let nags = mainChild.nag.toString().split(',');
            nags.forEach(n => {
                let cleanN = n.trim().replace('$', '');
                let nagMap = { "1":"!", "2":"?", "3":"!!", "4":"??", "5":"!?", "6":"?!", "10":"=", "13":"∞", "14":"⩲", "15":"⩱", "16":"±", "17":"∓", "18":"+-", "19":"-+" };
                if (nagMap[cleanN]) pgn += nagMap[cleanN];
                else if (cleanN.match(/^[!?]+$/)) pgn += cleanN; 
                else pgn += ` $${cleanN}`; 
            });
        }

        // 3. Unified Comment
        let mainComment = this.evalPGNGenerate(mainChild, format);
        if (mainComment) pgn += ` ${mainComment}`;

        // 4. Handle Variations safely
        let hadVariations = false;
        if (node.children.length > 1) {
            
            for (let i = 0; i < node.children.length; i++) {
                if (i === activeIdx) continue;
                let varChild = node.children[i];
                
                if (varChild.isPV) {
                    let shouldExportTree = false;
                    
                    // Do NOT automatically export PV trees for Engine Matches!
                    if (!this.isEngineMatch && mainChild.nag) {
                        const nags = mainChild.nag.toString().split(',');
                        for (let n of nags) {
                            let cleanN = n.trim().replace('$', '');
                            if (['2', '4', '6', '?', '??', '?!'].includes(cleanN)) {
                                shouldExportTree = true;
                                break;
                            }
                        }
                    }
                    if (!shouldExportTree) continue; 
                }

                hadVariations = true;
                
                let varPrefix = isWhite ? `${mNum}. ${varChild.moveSan}` : `${mNum}... ${varChild.moveSan}`;
                
                if (varChild.nag) {
                    let vNags = varChild.nag.toString().split(',');
                    vNags.forEach(vn => {
                        let cVN = vn.trim().replace('$', '');
                        let nagMap = { "1":"!", "2":"?", "3":"!!", "4":"??", "5":"!?", "6":"?!", "10":"=" };
                        varPrefix += nagMap[cVN] || (cVN.match(/^[!?]+$/) ? cVN : ` $${cVN}`);
                    });
                }

                let varComment = this.evalPGNGenerate(varChild, format);
                
                // If the variation move has a comment, the NEXT move MUST display its number!
                let forceVarNextNumber = (varComment && varComment !== "");
                let subVarText = this.generatePGNRecursive(varChild, isWhite ? mNum : mNum + 1, forceVarNextNumber, format);
                
                pgn += ` (${varPrefix}${varComment ? " " + varComment : ""}${subVarText ? " " + subVarText : ""})`;
            }
        }

        // 5. Continue Main Line
        let forceNextNumber = hadVariations || (mainComment && mainComment !== "");
        let nextPgn = this.generatePGNRecursive(mainChild, isWhite ? mNum : mNum + 1, forceNextNumber, format);
        
        if (nextPgn) pgn += " " + nextPgn;

        return pgn;
    }
generatePGNVariation(node, startPly, format = 'both') {
        let pgn = "";
        let moveNum = Math.ceil(startPly / 2);
        let isWhite = (startPly % 2 !== 0);
        let moveString = isWhite ? `${moveNum}. ${node.moveSan}` : `${moveNum}... ${node.moveSan}`;

        // 1. NAGs
        let nagStr = "";
        if (node.nag) {
            let nags = node.nag.toString().split(',');
            nags.forEach(n => {
                let cleanN = n.trim().replace('$', '');
                let nagMap = { "1":"!", "2":"?", "3":"!!", "4":"??", "5":"!?", "6":"?!", "10":"=" };
                if (nagMap[cleanN]) nagStr += nagMap[cleanN];
                else nagStr += ` $${cleanN}`;
            });
        }

        pgn += moveString + (nagStr ? " " + nagStr : "") + " ";

        // 2. Unified Comment
        let comment = this.evalPGNGenerate(node, format);
        if (comment) pgn += `${comment} `;

        // 3. Recursion
        if (node.children && node.children.length > 0) {
            pgn += this.generatePGNRecursive(node.children[node.selectedChildIndex || 0], startPly + 1, false, format);
        }

        return pgn.trim();
    }
exportPGN() {
        const formatMenu = document.getElementById('pgnFormatSelect');
        const exportFormat = formatMenu ? formatMenu.value : 'both';
        
        const pgnData = window.game.generatePGN(exportFormat); 
        if (!pgnData) {
            window.ui.showNotification("No PGN data to export.","Export Failed","⚠️");
            return;
        }

        const blob = new Blob([pgnData], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        a.download = `Analyzed_Game_${dateStr}.pgn`;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        if (this.showNotification) {
            this.showNotification("PGN file downloaded successfully.", "Export Complete", "📥");
        }
    }
addPremove(move) {
        // 🔥 THE FIX: Double block! Never allow premoves in analysis mode.
        if (this.premoveMode === 'none' || this.isAnalysisMode) return; 
        
        if (this.premoveMode === 'single') {
            this.clearPremoves();
            this.premoveQueue.push(move);
        } else {
            // Multi: Simple duplicate check
            const last = this.premoveQueue[this.premoveQueue.length - 1];
            if (last && last.from === move.from && last.to === move.to) return;
            this.premoveQueue.push(move);
        }
        if (typeof ui !== 'undefined') window.ui.renderBoard(false);
    }
clearPremoves() {
this.premoveQueue = [];
if (typeof ui !=='undefined') window.ui.renderBoard(false);
}
attemptPremove() {
        if (this.premoveQueue.length === 0 || this.gameOver || this.isAnalysisMode) return;
        const move = this.premoveQueue[0];
        
        if (this.turn !== move.color) return; 

        // 1. Initial quick check to see if the piece is still there
        const actualPiece = this.board[move.from];
        if (!actualPiece || actualPiece.color !== move.color || actualPiece.type !== move.piece) {
            this.clearPremoves();
            if (typeof ui !== 'undefined') window.ui.renderBoard(true);
            return;
        }

        // 🔥 THE FIX: Get ALL currently legal moves to ensure the premove is actually valid!
        const legalMoves = this.engine.moves({ verbose: true });
        const isLegal = legalMoves.some(m => 
            this.squareToIndex(m.from) === move.from && 
            this.squareToIndex(m.to) === move.to
        );

        if (!isLegal) {
            // Premove is illegal (e.g. king is in check, or piece is pinned)
            this.clearPremoves();
            if (typeof ui !== 'undefined') window.ui.renderBoard(true);
            return;
        }

        const result = this.makeMove(move, move.promotion || 'q', false, null, true);

        if (result) {
            this.premoveQueue.shift();
            // Automatically attempt the next queued multi-premove
            setTimeout(() => this.attemptPremove(), 50);
            if (typeof ui !== 'undefined') window.ui.renderBoard(true);
        } else {
            this.clearPremoves();
            if (typeof ui !== 'undefined') window.ui.renderBoard(true);
        }
    }
rematch() {
        // 1. Hide the Game Over popup and Switch Tab
        if (typeof window.ui !== 'undefined') {
            window.ui.hideGameOver();
            window.ui.switchTab('play'); // 🔥 THE FIX: Force UI back to Play Tab!
        }

        // 2. Cache the finished game before overwriting it
        if (typeof this.syncMoveHistory === 'function') this.syncMoveHistory();
        if (typeof this.saveState === 'function') this.saveState(this.mode);

        // 3. Check if we need a new randomized board for Chess960
        let startFen = INITIAL_FEN;
        if (this.isChess960 && typeof this.generateChess960FEN === 'function') {
            startFen = this.generateChess960FEN();
        }

        // 4. Start the appropriate game type
        if (this.mode === 'bot' || this.botColor !== null) {
            const nextUserColor = this.botColor || 'w'; 
            
            if (this.isChess960) {
                this.startChess960Game('bot', this.botLevel, nextUserColor);
            } else {
                this.startBotGame(this.botLevel, nextUserColor, startFen);
            }
        } else {
            if (this.isChess960) {
                this.startChess960Game('local');
            } else {
                this.startLocalGame(startFen);
            }
        }

        // 5. Flush the old move arrays so the new game is completely clean
        if (typeof this.syncMoveHistory === 'function') {
            this.syncMoveHistory();
        }
        
        if (typeof window.ui !== 'undefined' && typeof window.ui.updateHistory === 'function') {
            window.ui.updateHistory(true);
        }
    }
offerDraw() {
        if (this.gameOver) return;

        // 1. Check if the rules of chess strictly mandate a draw
        if (this.engine.in_threefold_repetition && this.engine.in_threefold_repetition()) {
            this.endGame("½-½", "Draw by Repetition");
            return;
        }
        if (this.engine.half_moves && this.engine.half_moves() >= 100) {
            this.endGame("½-½", "Draw by 50-Move Rule");
            return;
        }
        if (this.engine.insufficient_material && this.engine.insufficient_material()) {
            this.endGame("½-½", "Draw by Insufficient Material");
            return;
        }

        // 2. Ask the opponent (Bot or Local)
        if (this.mode === 'bot') {
            const currentEval = this.currentNode.evalScore || 0;
            if (Math.abs(currentEval) ===0) {
                this.endGame("½-½", "Draw by Agreement");
                if (window.ui) window.ui.showNotification("Draw Accepted", "Engine accepted your draw offer.", "🤝");
            } else {
                if (window.ui) window.ui.showNotification("Draw Declined", "Engine declined your draw offer.", "❌");
            }
        } else if (this.mode === 'local') {
            this.endGame("½-½", "Draw by Agreement");
        }
    }
resign() {
        if (this.gameOver || !this.isPlayingLiveGame) return;
        
        if (window.sfWorker && !window.engineAnalysing) window.sfWorker.postMessage('stop');
        
        const isWhiteResigning = this.turn === 'w';
        const resultStr = isWhiteResigning ? "0-1" : "1-0";
        const winnerName = isWhiteResigning ? "Black" : "White";
        
        // 1. Officially end the game and lock in the PGN result
        this.endGame(resultStr, `${winnerName} wins by resignation`);
        
        // 2. Trigger your custom UI popup
        if (window.ui && typeof window.ui.showGameOver === 'function') {
            window.ui.showGameOver(winnerName, "by resignation");
        }
    }
makeMove(move, promo, batchMode, pgnText, muteEngine = false, isAutoReply = false) {
        const ui = (typeof window !== 'undefined' && window.ui) ? window.ui : null;
        // =========================================================================
        // 🔥 OPTIMIZED CASTLING OVERRIDE
        // =========================================================================
        if (!this.isChess960 && move && move.from !== undefined && move.to !== undefined && this.engine) {
            const fromStr = typeof move.from === 'number' && this.indexToSquare ? this.indexToSquare(move.from) : move.from;
            const toStr = typeof move.to === 'number' && this.indexToSquare ? this.indexToSquare(move.to) : move.to;

            if (fromStr && toStr) {
                const srcPiece = this.engine.get(fromStr);
                const tgtPiece = this.engine.get(toStr);
                const currTurn = this.engine.turn();
                
                if (srcPiece && tgtPiece && srcPiece.type === 'k' && tgtPiece.type === 'r' && srcPiece.color === currTurn && tgtPiece.color === currTurn) {
                    const legalMoves = this.engine.moves({ verbose: true });
                    const fromFile = fromStr.charCodeAt(0);
                    const toFile = toStr.charCodeAt(0);
                    
                    const castleMove = legalMoves.find(m => 
                        m.from === fromStr && 
                        ((toFile > fromFile && m.flags.includes('k')) || (toFile < fromFile && m.flags.includes('q')))
                    );
                    
                    if (castleMove) {
                        move.to = typeof move.to === 'number' ? this.squareToIndex(castleMove.to) : castleMove.to;
                    }
                }
            }
        }
        // =========================================================================

        const promotion = (promo && promo.length === 1) ? promo.toLowerCase() : undefined;

        if (batchMode) {
            const result = this.engine.move({
                from: this.indexToSquare(move.from),
                to: this.indexToSquare(move.to),
                promotion: promotion || 'q'
            });
            if (!result) return null;
            const newFen = this.engine.fen();
            this.reconcileBoardIds(newFen, move);
            
            // 🔥 THE CASTLING FIX (Batch): Add 'color' so the UI doesn't animate both sides!
            this.addMoveToTree(newFen, pgnText || result.san, move.to, {
                from: move.from, to: move.to, flags: result.flags, color: result.color
            }, false);
            
            this.turn = this.engine.turn();
            return result;
        }

        if (this.isPlayingLiveGame && !this.timerInterval) {
            this.startTimer();
        }

        const moveObj = {
            from: this.indexToSquare(move.from),
            to: this.indexToSquare(move.to)
        };
        if (promotion) moveObj.promotion = promotion;

        // ============================================================
        // 🔥 INTERACTIVE LESSON INTERCEPTOR 🔥
        // ============================================================
        if (this.mode === 'study' && !isAutoReply && this.chapters && this.chapters[this.activeChapterIndex]) {
            const currentMode = this.chapters[this.activeChapterIndex].analysisMode;
            
            if (currentMode === 'interactive' || currentMode === 'Interactive lesson') {
                let isCorrectMove = false;
                
                if (this.currentNode && this.currentNode.children.length > 0) {
                    const expected = this.currentNode.children[0].move;
                    if (expected && expected.from === move.from && expected.to === move.to) {
                        isCorrectMove = true;
                    }
                }

                if (!isCorrectMove) {
                    if (ui) {
                        ui.showNotification("Inaccuracy! Try finding a better move.", "Incorrect", "❌");
                        ui.renderBoard(false); // Snap the piece back
                    }
                    return null; // Cancel move execution
                } else {
                    if (ui) ui.showNotification("Good move!", "Correct", "✅");
                    
                    setTimeout(() => {
                        if (this.currentNode && this.currentNode.children.length > 0) {
                            const nextNode = this.currentNode.children[0];
                            const botRes = this.makeMove(nextNode.move, undefined, false, undefined, muteEngine, true);
                            
                            if (ui && botRes) {
                                if (typeof this.triggerMoveSound === 'function') this.triggerMoveSound(botRes);
                                ui.renderBoard(true); 
                                ui.updateHistory(true);
                            }
                        } else {
                            if (ui) ui.showNotification("Lesson Complete!", "Success", "🏆");
                        }
                    }, 500);
                }
            }
        }
        // ============================================================

        const result = this.engine.move(moveObj);
        if (!result) return null;

        const newFen = this.engine.fen();
        const nextTurn = this.engine.turn(); 
        // --- PUZZLE LOGIC ---
        if (this.mode === 'puzzle') {
            const userStr = (result.from + result.to + (result.promotion || '')).toLowerCase();
            const solStr = (this.puzzleSolution[this.puzzleCursor] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            
            if (userStr !== solStr && !this.engine.in_checkmate()) {
                this.engine.undo();
                this.reconcileBoardIds(this.engine.fen());
                if (ui) ui.renderBoard(false);
                this.puzzleFail();
                return null; 
            }
            
            if (this.engine.in_checkmate() || (this.puzzleCursor >= this.puzzleSolution.length - 1)) {
                if (window.sfWorker) window.sfWorker.postMessage('stop');
                this.puzzleSuccess();
            } else {
                this.puzzleCursor++;
            }
        }

        const now = Date.now();
        const timeSpent = Math.max(0, (now - (this.lastMoveTime || now)) / 1000);
        this.lastMoveTime = now;

        this.reconcileBoardIds(newFen, move);

        // 🔥 THE CASTLING FIX (Live): Add 'color' to moveData so UI.js knows who is castling!
        const moveData = { from: move.from, to: move.to, flags: result.flags, color: result.color };
        this.addMoveToTree(newFen, result.san, move.to, moveData, true);
        
        if (this.currentNode) this.currentNode.timeSpent = timeSpent;

        if (this.isPlayingLiveGame) {
            if (nextTurn === 'b') this.whiteTime += this.whiteIncrement;
            else this.blackTime += this.blackIncrement;
        }

        this.turn = nextTurn;
        
        if (this.isPlayingLiveGame && this.currentNode) {
            const clkSeconds = nextTurn === 'b' ? this.whiteTime : this.blackTime;
            
            const h = Math.floor(clkSeconds / 3600);
            const m = Math.floor((clkSeconds % 3600) / 60);
            const s = Math.floor(clkSeconds % 60);
            const clkStr = `[%clk ${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}]`;
            
            this.currentNode.comment = this.currentNode.comment 
                ? this.currentNode.comment + ` ${clkStr}` 
                : clkStr;
        }

        if (!this.gameOver && !this.isAnalysisMode) {
            setTimeout(() => this.attemptPremove(), 150);
        }

        // --- GAME OVER LOGIC ---
        if (this.isPlayingLiveGame && this.engine.game_over()) {
            let resultStr = "1/2-1/2";
            let statusMsg = "Draw by agreement";

            if (this.engine.in_checkmate()) {
                const winnerColor = this.turn === 'w' ? 'Black' : 'White';
                resultStr = winnerColor === 'White' ? "1-0" : "0-1";
                statusMsg = `${winnerColor} wins by checkmate`;
            } else if (this.engine.in_stalemate()) {
                statusMsg = "Draw by stalemate";
            } else if (this.engine.in_threefold_repetition && this.engine.in_threefold_repetition()) {
                statusMsg = "Draw by repetition";
            } else if (this.engine.insufficient_material && this.engine.insufficient_material()) {
                statusMsg = "Draw by insufficient material";
            } else if (this.engine.half_moves && this.engine.half_moves() >= 100) {
                statusMsg = "Draw by 50-Move Rule";
            }

            this.endGame(resultStr, statusMsg);
            
            this.clearPremoves();
            if (window.sfWorker && !window.engineAnalysing) window.sfWorker.postMessage('stop');
            
            // Engine updates at end of game
            if (!muteEngine && window.engineAnalysing && window.sfWorker && this.turn !== this.botColor) {
                if (this._engineRebootTimeout) clearTimeout(this._engineRebootTimeout);
                this._engineRebootTimeout = setTimeout(() => this.updateStockfish(), 200);
            }
            return result;
        }
        const liveTurn = this.currentLiveTurn || this.turn;
        const isBotTurn = (this.mode === 'bot' && liveTurn === this.botColor);
        // --- BOT LOGIC ---
        if (this.isPlayingLiveGame && isBotTurn) {
            setTimeout(() => this.triggerBotMove(), 250);
        } 
        else if (this.mode === 'puzzle' && !this.gameOver) {
            if (this.puzzleCursor % 2 === 0 && this.puzzleCursor < this.puzzleSolution.length) {
                const isRush = ['3min', '5min', 'survival'].includes(this.puzzleMode);
                const delay = isRush ? 150 : 400;
                
                setTimeout(() => {
                    const response = this.puzzleSolution[this.puzzleCursor];
                    if (response) {
                        const from = this.squareToIndex(response.substring(0, 2));
                        const to = this.squareToIndex(response.substring(2, 4));
                        const promo = response.length > 4 ? response.substring(4, 5) : undefined;
                        const botRes = this.makeMove({ from, to }, promo);
                        
                        if (ui && botRes) {
                            if (typeof this.triggerMoveSound === 'function') this.triggerMoveSound(botRes);
                            ui.renderBoard(true); 
                            if (!this.isAnalysisMode) setTimeout(() => this.attemptPremove(), 100);
                        }
                    }
                }, delay);
            }
        }

        // 🔥 CRITICAL FIX 2: Prevent Engine Hijack
        // Analysis Engine will only start thinking if it is the human player's turn!
        if (!muteEngine && window.engineAnalysing && window.sfWorker && !isBotTurn) {
            if (this._engineRebootTimeout) clearTimeout(this._engineRebootTimeout);
            this._engineRebootTimeout = setTimeout(() => this.updateStockfish(), 200);
        }

        return result;
    }
calculateWinPercent(cp) {
        // Lichess Formula: W% = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)
        // NOTE: The 10-pawn clamp is now handled BEFORE this step so Mates can bypass it!
        if (typeof cp !== 'number') return 50; 
        return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
    }
calculateAccuracy(dropInWinPct) {
        const diff = Math.max(0, dropInWinPct); 
        const acc = 103.1668 * Math.exp(-0.04354 * diff) - 3.1669;
        return Math.max(0, Math.min(100, acc)); 
    }
generateChess960FEN() {
        let pieces = Array(8).fill('');
        
        // 1. Bishops (Must be on opposite colors)
        let darkIdx = (Math.floor(Math.random() * 4) * 2) + 1; // 1, 3, 5, 7
        let lightIdx = (Math.floor(Math.random() * 4) * 2);    // 0, 2, 4, 6
        pieces[darkIdx] = 'b';
        pieces[lightIdx] = 'b';
        
        let empty = () => pieces.map((p, i) => p === '' ? i : -1).filter(i => i !== -1);
        
        // 2. Queen and Knights
        pieces[empty()[Math.floor(Math.random() * empty().length)]] = 'q';
        pieces[empty()[Math.floor(Math.random() * empty().length)]] = 'n';
        pieces[empty()[Math.floor(Math.random() * empty().length)]] = 'n';
        
        // 3. Rooks and King (Must fall strictly in R-K-R order)
        let finalEmpty = empty();
        pieces[finalEmpty[0]] = 'r';
        pieces[finalEmpty[1]] = 'k';
        pieces[finalEmpty[2]] = 'r';
        
        const backRank = pieces.join('');
        // Returns the formatted FEN string. Standard KQkq is accepted by most engines.
        return `${backRank.toLowerCase()}/pppppppp/8/8/8/8/PPPPPPPP/${backRank.toUpperCase()} w KQkq - 0 1`;
    }
startLocalGame(startFen = INITIAL_FEN) {
        if (startFen.startsWith("rnbqkbnr")) {
            this.isChess960 = false;
            if (window.sfWorker) window.sfWorker.postMessage('setoption name UCI_Chess960 value false');
        }

        if (typeof window.engineAnalysing !== 'undefined') window.engineAnalysing = false;
        if (window.sfWorker) window.sfWorker.postMessage('stop');

        if (typeof window.ui !== 'undefined') {
            const btn = document.querySelector('.engine-toggle-btn');
            const panel = document.getElementById('engine-stats-container');
            const evalBar = document.getElementById('enginePanel');
            const arrowContainer = document.getElementById('tempArrowRoot');
            if (btn) btn.classList.remove('active');
            if (panel) panel.style.display = 'none';
            if (evalBar) evalBar.classList.remove('visible');
            if (arrowContainer) arrowContainer.innerHTML = '';
        }

        this.mode = 'local';
        this.botColor = null;
        
        if (this.isChess960) {
            this.patchEngineFor960(this.engine);
        }
        
        this.loadFEN(startFen);

        this.turn = this.engine.turn();
        this.rootNode = new MoveNode(startFen, null);
        this.currentNode = this.rootNode;
        this.moveList = [];
        this.history = [];
        
        this.gameOver = false;
        this.stopTimer();
        this.whiteTime = Number(this.whiteStartSeconds);
        this.blackTime = Number(this.blackStartSeconds);
        
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
        this.pgnHeaders = {
            'Event': 'Casual Game',
            'Site': 'Localhost',
            'Date': dateStr,
            'Round': '-',
            'White': 'Player White',
            'Black': 'Player Black',
            'Result': '*'
        };
        if (startFen !== INITIAL_FEN) {
            this.pgnHeaders['FEN'] = startFen;
            this.pgnHeaders['SetUp'] = '1';
        }
        
        if (window.ui && window.ui.togglePgnEditing) window.ui.togglePgnEditing(false);
        
        const humanImg = `<img src="assets/tabs-icon/face.webp" style="width:100%; height:100%; object-fit:cover;">`;
        if (window.ui && window.ui.avatars) {
            window.ui.avatars['w'] = humanImg;
            window.ui.avatars['b'] = humanImg;
        }

        if (window.ui && window.ui.playerInfo) {
            window.ui.playerInfo['w'] = { name: "Player White", meta: "White", avatarBorder: "#2872b5", avatarBg: "transparent" };
            window.ui.playerInfo['b'] = { name: "Player Black", meta: "Black", avatarBorder: "#e68f00", avatarBg: "transparent" };
        }

        if (typeof window.ui !== 'undefined') {
            window.ui._lastMetadataCache = null; 
            window.ui._lastHeadersCache = null;
            window.ui._lastTreeSize = -1;
            window.ui._lastFen = null;
            window.ui._lastBoardFen = null;
            
            if (typeof window.ui.displayMetadata === 'function') window.ui.displayMetadata(this.pgnHeaders);
            window.ui.updateHistory(true); 
            
            window.ui.renderHeaders();
            
            // Failsafe clock ID alignment
            const headers = document.querySelectorAll('.player-header');
            if (headers[0]) headers[0].querySelector('.clock').id = window.ui.flipped ? 'timer-white' : 'timer-black';
            if (headers[1]) headers[1].querySelector('.clock').id = window.ui.flipped ? 'timer-black' : 'timer-white';
            window.ui.updateClocks();
            
            window.ui.renderBoard(true);
            window.ui.updateStatus("Local Game Started");
        }
        
        this.startTimer();
    const resignBtn = document.getElementById('resignBtn');
        const drawBtn = document.getElementById('drawBtn');
        if (resignBtn) resignBtn.style.display = 'block';
        if (drawBtn) drawBtn.style.display = 'block';
    }
startBotGame(level, colorPreference, startFen = INITIAL_FEN) {
        if (startFen.startsWith("rnbqkbnr")) {
            this.isChess960 = false;
            if (window.sfWorker) window.sfWorker.postMessage('setoption name UCI_Chess960 value false');
        }

        if (typeof window.engineAnalysing !== 'undefined') window.engineAnalysing = false;
        if (window.sfWorker) window.sfWorker.postMessage('stop');

        if (typeof window.ui !== 'undefined') {
            const btn = document.querySelector('.engine-toggle-btn');
            const panel = document.getElementById('engine-stats-container');
            const evalBar = document.getElementById('enginePanel');
            const arrowContainer = document.getElementById('tempArrowRoot');
            if (btn) btn.classList.remove('active');
            if (panel) panel.style.display = 'none';
            if (evalBar) evalBar.classList.remove('visible');
            if (arrowContainer) arrowContainer.innerHTML = '';
        }

        this.mode = 'bot';
        
        this.loadFEN(startFen);

        this.turn = this.engine.turn();
        this.rootNode = new MoveNode(startFen, null);
        this.currentNode = this.rootNode;
        this.moveList = [];
        this.history = [];
        
        this.gameOver = false;
        this.stopTimer(); 
        this.whiteTime = Number(this.whiteStartSeconds);
        this.blackTime = Number(this.blackStartSeconds);
        
        if (window.ui && window.ui.togglePgnEditing) window.ui.togglePgnEditing(false);
        
        const finalLevel = parseInt(level) || 8; 
        const levelSelect = document.getElementById('stockfishLevel');
        if (levelSelect) levelSelect.value = finalLevel; 
        this.botLevel = finalLevel;
        if (this.updateEngineLevel) this.updateEngineLevel(); 

        let playerColor = colorPreference;
        if (colorPreference === 'random') playerColor = Math.random() < 0.5 ? 'w' : 'b';
        this.botColor = (playerColor === 'w') ? 'b' : 'w';
        this.myColor = playerColor; 

        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
        const botName = `Stockfish Level ${this.botLevel}`;
        this.pgnHeaders = {
            'Event': 'Game vs Computer',
            'Site': 'Localhost',
            'Date': dateStr,
            'Round': '-',
            'White': playerColor === 'w' ? 'You' : botName,
            'Black': playerColor === 'b' ? 'You' : botName,
            'Result': '*'
        };
        if (startFen !== INITIAL_FEN) {
            this.pgnHeaders['FEN'] = startFen;
            this.pgnHeaders['SetUp'] = '1';
        }

        if (window.ui && window.ui.playerInfo) {
            const humanColor = playerColor;
            const botColor = this.botColor;

            window.ui.playerInfo[humanColor] = {
                name: "You",
                meta: (humanColor === 'w') ? "White" : "Black",
                metaColor: "#ccc",
                avatarBorder: "#2872b5", 
                avatarBg: "rgba(40, 114, 181, 0.2)"
            };
            
            window.ui.playerInfo[botColor] = {
                name: botName,
                meta: "Stockfish (Latest)",
                metaColor: "#e68f00",
                avatarBorder: "#e68f00",
                avatarBg: "rgba(230, 143, 0, 0.2)"
            };

            if (window.ui.avatars) {
                window.ui.avatars[humanColor] = `<img src="assets/tabs-icon/face.webp" alt="You" style="width:100%; height:100%; object-fit:contain; border-radius: 5px;">`;
                window.ui.avatars[botColor] = `<img src="assets/tabs-icon/engine.webp" alt="Bot" style="width:100%; height:100%; object-fit:contain; border-radius: 5px;">`;
            }
        }

        if (playerColor === 'b' && !window.ui.flipped) window.ui.flipBoard();
        else if (playerColor === 'w' && window.ui.flipped) window.ui.flipBoard();

        if (typeof window.ui !== 'undefined') {
            window.ui._lastMetadataCache = null; 
            window.ui._lastHeadersCache = null;
            window.ui._lastTreeSize = -1;
            window.ui._lastFen = null;
            window.ui._lastBoardFen = null;
            
            if (typeof window.ui.displayMetadata === 'function') window.ui.displayMetadata(this.pgnHeaders);
            window.ui.updateHistory(true); 
            
            window.ui.renderHeaders();
            
            // Failsafe clock ID alignment
            const headers = document.querySelectorAll('.player-header');
            if (headers[0]) headers[0].querySelector('.clock').id = window.ui.flipped ? 'timer-white' : 'timer-black';
            if (headers[1]) headers[1].querySelector('.clock').id = window.ui.flipped ? 'timer-black' : 'timer-white';
            window.ui.updateClocks();
            
            window.ui.renderBoard(true);
            window.ui.updateStatus(`Game Started: You vs ${botName}`);
        }

        if (window.sfWorker) {
            window.sfWorker.postMessage('ucinewgame');
            window.sfWorker.postMessage('isready');
            if (this.turn === this.botColor) {
                setTimeout(() => this.triggerBotMove(), 500);
            }
        }
        
        this.startTimer();
    const resignBtn = document.getElementById('resignBtn');
        const drawBtn = document.getElementById('drawBtn');
        if (resignBtn) resignBtn.style.display = 'block';
        if (drawBtn) drawBtn.style.display = 'block';
    }
startChess960Game(targetMode = 'local', level = 8, colorPref = 'w') {
        this.isChess960 = true;
        const fen = typeof this.generateChess960FEN === 'function' ? this.generateChess960FEN() : INITIAL_FEN;
        
        if (window.sfWorker) {
            window.sfWorker.postMessage('setoption name UCI_Chess960 value true');
        }

        // 1. Boot the specific game mode
        if (targetMode === 'local') {
            this.startLocalGame(fen);
        } else {
            this.startBotGame(level, colorPref, fen);
        }
        
        // 2. 🔥 THE FIX: Just patch the specific 960 headers without destroying the carefully calculated names/colors from startBotGame!
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
        this.pgnHeaders['Event'] = targetMode === 'bot' ? 'Chess960 vs Computer' : 'Chess960 Casual Game';
        this.pgnHeaders['Date'] = dateStr;
        this.pgnHeaders['Variant'] = 'Chess960';
        this.pgnHeaders['FEN'] = fen;
        this.pgnHeaders['SetUp'] = '1';
        
        if (typeof window.ui !== 'undefined') {
            window.ui.updateStatus(targetMode === 'bot' ? `Chess960 Game Started vs Level ${level}` : "Chess960 Local Game Started");
            
            // Wipe UI Caches so the DOM is forced to update
            window.ui._lastMetadataCache = null;
            window.ui._lastHeadersCache = null;
            window.ui._lastTreeSize = -1;
            window.ui._lastFen = null;
            window.ui._lastRenderedFen = null;
            window.ui._lastBoardFen = null;
            
            // 🔥 THE FIX: Force the UI to instantly display the updated headers AND the proper Player Names!
            if (typeof window.ui.displayMetadata === 'function') {
                window.ui.displayMetadata(this.pgnHeaders);
            }
            if (typeof window.ui.renderHeaders === 'function') {
                window.ui.renderHeaders();
            }
            
            window.ui.updateHistory(true);
            if (typeof this.syncMoveHistory === 'function') this.syncMoveHistory();
            
            if (typeof window.ui.renderBoard === 'function') {
                window.ui.renderBoard(true);
            }
        }
    }
startChess960Analysis() {
        this.isChess960 = true;
        const fen = typeof this.generateChess960FEN === 'function' ? this.generateChess960FEN() : INITIAL_FEN;
        
        if (window.sfWorker) {
            window.sfWorker.postMessage('setoption name UCI_Chess960 value true');
            window.sfWorker.postMessage('stop');
        }
        if (typeof window.engineAnalysing !== 'undefined') window.engineAnalysing = false;

        this.mode = 'analysis';
        this.botColor = null;
        
        // Boot the new game board
        this.newGame(fen);
        
        // Generate a completely fresh set of headers including the 960 FEN
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
        this.pgnHeaders = {
            'Event': 'Chess960 Analysis',
            'Site': 'Localhost',
            'Date': dateStr,
            'Round': '-',
            'White': 'White',
            'Black': 'Black',
            'Result': '*',
            'Variant': 'Chess960',
            'FEN': fen,
            'SetUp': '1'
        };
        
        if (typeof window.ui !== 'undefined') {
            window.ui.switchTab('analysis');
            window.ui.updateStatus("Chess960 Analysis Started");
            
            window.ui._lastMetadataCache = null;
            window.ui._lastHeadersCache = null;
            
            // Force the UI to instantly display the new FEN and headers!
            if (typeof window.ui.displayMetadata === 'function') {
                window.ui.displayMetadata(this.pgnHeaders);
            }
            if (typeof window.ui.renderHeaders === 'function') {
                window.ui.renderHeaders();
            }
        }
    }
updateEngineLevel() {
        if (!window.sfWorker) return;

        // 1. Get Level (Default to 8 if missing)
        const levelSelect = document.getElementById('stockfishLevel');
        let level = this.botLevel;
        
        // If called from UI change, update internal state
        if (levelSelect) {
            const val = parseInt(levelSelect.value);
            if (!isNaN(val)) {
                level = val;
                this.botLevel = level;
            }
        }
        if (!level) level = 8;

        // 2. Define Difficulty Map (Must match triggerBotMove logic!)
        const difficultyMap = {
            1: { uciElo: 1320, depth: 1 },
            2: { uciElo: 1320, depth: 2 },
            3: { uciElo: 1400, depth: 3 },
            4: { uciElo: 1700, depth: 4 },
            5: { uciElo: 2000, depth: 6 },
            6: { uciElo: 2300, depth: 10 },
            7: { uciElo: 2700, depth: 14 },
            8: { uciElo: 3200, depth: 18 }
        };

        const settings = difficultyMap[level] || difficultyMap[8];

        console.log(`%c[Engine] Updating Level to ${level} (Elo: ${settings.uciElo})`, "color:#96bc4b");

        // 3. Send Commands to Engine
        // Use UCI_LimitStrength + UCI_Elo (Standard for modern Stockfish)
        // We set Skill Level to 20 to ensure it doesn't conflict (max skill, limited by Elo)
        window.sfWorker.postMessage('setoption name Skill Level value 20');
        window.sfWorker.postMessage('setoption name UCI_LimitStrength value true');
        window.sfWorker.postMessage(`setoption name UCI_Elo value ${settings.uciElo}`);
    }
calculateBotThinkTime() {
        // Read the starting time of the bot's clock
        const totalSeconds = this.botColor === 'w' ? this.whiteStartSeconds : this.blackStartSeconds;
        let thinkMs = 1500; // Default fallback

        // Time Scaling Tiers
        if (totalSeconds <= 60) thinkMs = 150;           // Bullet (1 min) -> 0.15s
        else if (totalSeconds <= 180) thinkMs = 500;     // Blitz (3 min) -> 0.5s
        else if (totalSeconds <= 300) thinkMs = 1200;    // Blitz (5 min) -> 1.2s
        else if (totalSeconds <= 600) thinkMs = 2500;    // Rapid (10 min) -> 2.5s
        else thinkMs = 4500;                             // Classical (15+ min) -> 4.5s

        // Add 20% randomness so it feels human and doesn't tick like a metronome
        const variance = thinkMs * 0.20;
        let finalTime = thinkMs - variance + (Math.random() * variance * 2);

        // Hard clamp: Never faster than 0.05s, never slower than 5s
        return Math.max(50, Math.min(5000, Math.floor(finalTime)));
    }
getBookMove(fen, level = 8) {
if (typeof OPENING_BOOK ==='undefined') return [];
let depthLimit = 10; 
if (level <=2) depthLimit=2; else if (level <= 4) depthLimit = 6;  
else if (level <=7) depthLimit=15; else depthLimit=25; // Level 8 can read deep theory
const moveNum=parseInt(fen.split(' ')[5]) || 1;
if (moveNum> depthLimit) return [];
const legalMoves = this.engine.moves({ verbose:true });
let possibleMoves = [];
for (let move of legalMoves) {
this.engine.move(move);
const resultFen = this.engine.fen();
this.engine.undo(); 
const coreResult = resultFen.split(' ').slice(0, 4).join(' ');
for (let bookKey in OPENING_BOOK) {
if (bookKey.startsWith(coreResult)) {
possibleMoves.push(move.from + move.to + (move.promotion ||''));
break; 
}
}
}
return possibleMoves;
};
triggerBotMove(ignoreBook = false) {
        const now = Date.now();
        if (this._lastBotTrigger && (now - this._lastBotTrigger < 100)) return;
        this._lastBotTrigger = now;
        const liveTurn = this.currentLiveTurn;
        if (liveTurn !== this.botColor || !this.isPlayingLiveGame) return;
        
        const fen = this.generateFEN();
        const level = this.botLevel || 8;
        this.botThinkStart = Date.now();
        
        // 🔥 Calculate dynamic thinking time!
        this.currentBotThinkTime = this.calculateBotThinkTime();

        // --- 1. ARTIFICIAL BLUNDER ---
        const blunderMap = { 1: 0.10, 2: 0.05 };
        const blunderChance = blunderMap[level] || 0;

        if (level <= 2 && Math.random() < blunderChance) {
            const legalMoves = this.engine.moves({ verbose: true });
            if (legalMoves.length > 0) {
                const choice = legalMoves[Math.floor(Math.random() * legalMoves.length)];
                const randomUCI = choice.from + choice.to + (choice.promotion || '');
                this.executeBotMoveWithDelay(randomUCI);
                return;
            }
        }

        // --- 2. BOOK MOVE ---
        if (!ignoreBook && typeof this.getBookMove === 'function') {
            const bookCandidates = this.getBookMove(fen, level);
            if (bookCandidates && bookCandidates.length > 0) {
                const candidate = bookCandidates[Math.floor(Math.random() * bookCandidates.length)];
                
                // Pass TRUE flag so it plays opening theory fast!
                this.executeBotMoveWithDelay(candidate, true);
                return; 
            }
        }

        // --- 3. STANDARD ENGINE MOVE ---
        if (window.sfWorker) {
            const difficultyMap = {
                1: { uciElo: 1320 }, 2: { uciElo: 1320 },
                3: { uciElo: 1400 }, 4: { uciElo: 1700 },
                5: { uciElo: 2000 }, 6: { uciElo: 2300 },
                7: { uciElo: 2700 }, 8: { uciElo: 3190 }
            };
            
            const settings = difficultyMap[level] || difficultyMap[8];
            
            window.sfWorker.postMessage('stop');
            window.sfWorker.postMessage('setoption name MultiPV value 1');
            window.sfWorker.postMessage('setoption name UCI_Chess960 value ' + (this.isChess960 ? 'true' : 'false'));
            window.sfWorker.postMessage('setoption name UCI_LimitStrength value true');
            window.sfWorker.postMessage(`setoption name UCI_Elo value ${settings.uciElo}`);
            window.sfWorker.postMessage('position fen ' + fen);
            
            // 🔥 Pass the dynamic fluid time to Stockfish
            window.sfWorker.postMessage(`go movetime ${this.currentBotThinkTime}`); 
        }
    }
executeBotMoveWithDelay(uciMove, isBookMove = false) {
        const now = Date.now();
        const start = this.botThinkStart || now;
        const elapsed = now - start;
        
        // If it's a book move, blitz it out fast (max 800ms). Otherwise, use the dynamic calculated time!
        const expectedThinkTime = isBookMove 
            ? Math.min(this.currentBotThinkTime || 1000, 800) 
            : (this.currentBotThinkTime || 1500);

        const delay = Math.max(0, expectedThinkTime - elapsed);

        setTimeout(() => {
            const from = uciMove.substring(0, 2);
            const to = uciMove.substring(2, 4);
            const promo = uciMove.length > 4 ? uciMove.substring(4, 5) : undefined;
            
            const fromIdx = this.squareToIndex(from);
            const toIdx = this.squareToIndex(to);
            
            if (this.isPlayingLiveGame && typeof this.goToEnd === 'function') {
                this.goToEnd();
            }

            const result = this.makeMove({ from: fromIdx, to: toIdx }, promo, false, null, false);

            if (result && typeof window !== 'undefined' && window.ui) {
                this.triggerMoveSound(result);
                window.ui.renderBoard(true); 
                window.ui.updateHistory();
                if (typeof window.ui.updateClocks === 'function') window.ui.updateClocks();
            } else if (!result) {
                console.error(`[BOT ERROR] Bot attempted invalid move: ${uciMove}`);
            }
        }, delay);
    }
saveActiveChapter() {
        if (this._isBooting||this.mode !== "study") return;
        if (this.activeChapterIndex >= 0 && this.activeChapterIndex < this.chapters.length) {
            this.chapters[this.activeChapterIndex].pgn = this.generatePGN();
            this.saveAllStudies(); // 🔥 Keeps local storage permanently synced!
        }
    }
async saveChapterDetails() {
        const idx = window._editingChapterIdx;
        const nameInput = document.getElementById('chapterNameInput');
        const orientInput = document.getElementById('chapterOrientationInput');
        const modeInput = document.getElementById('chapterAnalysisModeInput'); // 🔥 Fetch the Mode
        const saveBtn = document.getElementById('saveChapterBtn'); 
        
        const newName = nameInput ? nameInput.value.trim() : "";
        const newOrient = orientInput ? orientInput.value : 'w';
        const newMode = modeInput ? modeInput.value : 'normal'; // 🔥 Capture interactive setting
        
        if (!newName) return;
        
        if (idx === -1) {
            // CREATE NEW
            const tab = window._activeChapterTab || 'empty';
            const dataInput = document.getElementById('chapterDataInput');
            const dataVal = dataInput ? dataInput.value.trim() : "";

            let pgn = '[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"]\n\n*';

            // 1. Magical URL Fetcher
            if (tab === 'url' && dataVal) {
                if (saveBtn) {
                    saveBtn.innerText = "FETCHING...";
                    saveBtn.disabled = true;
                    saveBtn.style.opacity = "0.7";
                }
                
                try {
                    let targetUrl = dataVal;
                    let fetchedPgn = "";
                    
                    // LICHESS LINKS
                    if (dataVal.includes('lichess.org/') && !dataVal.includes('/export/')) {
                        const match = dataVal.match(/lichess\.org\/([a-zA-Z0-9]{8,12})/);
                        if (match && match[1]) {
                            targetUrl = `https://lichess.org/game/export/${match[1].substring(0,8)}?evals=1&clocks=1`;
                        }
                        const response = await fetch(targetUrl);
                        if (!response.ok) throw new Error("Failed to fetch Lichess data.");
                        fetchedPgn = await response.text();

                    } 
                    // CHESS.COM LINKS
                    else if (dataVal.includes('chess.com') || dataVal.includes('Chess:')) {
                        let gameId = "";
                        
                        const liveMatch = dataVal.match(/live\/(\d+)/);
                        const dailyMatch = dataVal.match(/daily\/(\d+)/);
                        const textMatch = dataVal.match(/- (\d+) - Chess\.com/);
                        
                        if (liveMatch) gameId = `live/${liveMatch[1]}`;
                        else if (dailyMatch) gameId = `daily/${dailyMatch[1]}`;
                        else if (textMatch) gameId = `live/${textMatch[1]}`; 
                        
                        if (gameId) targetUrl = `https://www.chess.com/game/${gameId}`;
                        
                        const proxies = [
                            `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
                            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
                            `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`
                        ];

                        let html = "";
                        let fetchSuccess = false;
                        
                        for (let proxy of proxies) {
                            try {
                                const response = await fetch(proxy);
                                if (response.ok) {
                                    html = await response.text();
                                    fetchSuccess = true;
                                    break; 
                                }
                            } catch (e) {
                                console.warn("Proxy blocked, trying next...", proxy);
                            }
                        }

                        if (!fetchSuccess || !html) throw new Error("All proxies blocked by Chess.com.");
                        
                        const jsonPgnMatch = html.match(/"pgn"\s*:\s*"((?:[^"\\]|\\.)*)"/);
                        
                        if (jsonPgnMatch && jsonPgnMatch[1] && jsonPgnMatch[1].includes('[Event')) {
                            try {
                                fetchedPgn = JSON.parse(`"${jsonPgnMatch[1]}"`);
                            } catch(e) {
                                fetchedPgn = jsonPgnMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                            }
                        } else {
                            const rawMatch = html.match(/\[Event\s+"[^"]+"\][\s\S]*?(?:1-0|0-1|1\/2-1\/2|\*)/i);
                            if (rawMatch) fetchedPgn = rawMatch[0];
                        }
                    } 
                    // STANDARD RAW PGN LINKS
                    else {
                        const response = await fetch(targetUrl);
                        if (!response.ok) throw new Error("Generic fetch failed.");
                        fetchedPgn = await response.text();
                    }
                    
                    if (fetchedPgn && fetchedPgn.length > 10) {
                        pgn = fetchedPgn;
                    } else {
                        throw new Error("The fetched PGN was empty.");
                    }
                    
                } catch (err) {
                    console.error("URL Fetch Error:", err);
                    window.ui.showNotification("Could not fetch game! Chess.com's anti-bot security blocked all proxies. \n\nFallback: Go to the Chess.com game, click 'Share' -> 'PGN', and paste it directly into the 'PGN' tab.");
                    
                    if (saveBtn) {
                        saveBtn.innerText = "CREATE CHAPTER";
                        saveBtn.disabled = false;
                        saveBtn.style.opacity = "1";
                    }
                    return; 
                }
            } 
            // 2. Handle FEN, PGN, and Editor
            else if (tab === 'fen' && dataVal) {
                pgn = `[FEN "${dataVal}"]\n\n*`;
            } else if (tab === 'pgn' && dataVal) {
                pgn = dataVal;
            } else if (tab === 'editor') {
                const curFen = this.generateFEN();
                pgn = `[FEN "${curFen}"]\n\n*`;
            }

            this.saveActiveChapter();

            // 🔥 Save the New Mode
            this.chapters.push({ title: newName, pgn: pgn, orientation: newOrient, analysisMode: newMode });
            this.loadChapter(this.chapters.length - 1);
            
            if (saveBtn) {
                saveBtn.innerText = "CREATE CHAPTER";
                saveBtn.disabled = false;
                saveBtn.style.opacity = "1";
            }

        } else {
            // UPDATE EXISTING
            this.chapters[idx].title = newName;
            this.chapters[idx].orientation = newOrient;
            this.chapters[idx].analysisMode = newMode; // 🔥 Update the Mode
            
            if (idx === this.activeChapterIndex && window.ui) {
                if ((newOrient === 'w' && window.ui.flipped) || (newOrient === 'b' && !window.ui.flipped)) {
                    window.ui.flipBoard();
                }
            }
            if (window.ui && window.ui.renderChapters) window.ui.renderChapters();
        }
        
        const modal = document.getElementById('chapterModal');
        if (modal) modal.style.display = 'none';
    }
loadAllStudies() {
        try {
            const stored = localStorage.getItem('chess_studies_library');
            if (stored) {
                this.allStudies = JSON.parse(stored);
                // Ensure current study exists
                if (!this.currentStudyId || !this.allStudies.find(s => s.id === this.currentStudyId)) {
                    this.currentStudyId = this.allStudies[0].id;
                }
                const target = this.allStudies.find(s => s.id === this.currentStudyId);
                if (target) {
                    this.studyTitle = target.title;
                    this.chapters = target.chapters;
                }
            } else {
                // Initialize default
                this.allStudies = [{
                    id: 'default',
                    title: this.studyTitle || "My Lichess Study",
                    chapters: this.chapters || [{ title: "Chapter 1", pgn: "" }]
                }];
                this.currentStudyId = 'default';
                this.saveAllStudies();
            }
        } catch(e) {
            console.error("Failed to load studies", e);
            this.allStudies = [{ id: 'default', title: "My Lichess Study", chapters: [{ title: "Chapter 1", pgn: "" }] }];
            this.currentStudyId = 'default';
        }
    }
saveAllStudies() {
        let current = this.allStudies.find(s => s.id === this.currentStudyId);
        if (current) {
            current.title = this.studyTitle;
            current.chapters = this.chapters;
        } else {
            this.allStudies.push({
                id: this.currentStudyId,
                title: this.studyTitle,
                chapters: this.chapters
            });
        }
        localStorage.setItem('chess_studies_library', JSON.stringify(this.allStudies));
    }
createNewStudy() {
        const nameInput = document.getElementById('newStudyName');
        const title = nameInput ? nameInput.value.trim() : "";
        if (!title) return;
        
        const newId = 'study_' + Date.now();
        this.allStudies.push({
            id: newId,
            title: title,
            chapters: [{ title: "Chapter 1", pgn: "" }]
        });
        
        this.saveAllStudies();
        this.loadStudy(newId);
        if (nameInput) nameInput.value = "";
    }
loadStudy(studyId, skipSave = false) {
        // 🔥 THE FIX: Block the ghost save when switching from a deleted study
        if (!skipSave) this.saveActiveChapter(); 
        
        const target = this.allStudies.find(s => s.id === studyId);
        if (target) {
            this.currentStudyId = target.id;
            this.studyTitle = target.title || "My Study";
            this.chapters = target.chapters || [{ title: "Chapter 1", pgn: "" }];
            
            const headerTitle = document.getElementById('studyTitleDisplay');
            if (headerTitle) headerTitle.innerText = this.studyTitle;
            
            this.activeChapterIndex = -1;
            this.loadChapter(0, skipSave);
        }
    }
loadChapter(index, skipSave = false) {
        if (index < 0 || index >= this.chapters.length || index === this.activeChapterIndex || this.mode !== "study") return;
        
        // 🔥 THE FIX: Block the ghost save when switching from a deleted chapter
        if (!skipSave) this.saveActiveChapter(); 
        this.activeChapterIndex = index;
        
        let pgn = this.chapters[index].pgn;
        if (!pgn || pgn.trim() === '') pgn = '[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"]\n\n*';
        
        this.loadPGN(pgn);
        
        this.mode = 'study';
        this.gameOver = true;
        
        if (window.ui) {
            const orient = this.chapters[index].orientation || 'w';
            if ((orient === 'w' && window.ui.flipped) || (orient === 'b' && !window.ui.flipped)) {
                window.ui.flipBoard();
            }
            if (typeof window.ui.renderChapters === 'function') window.ui.renderChapters();
        }
    }
deleteStudy(id) {
        const isDeletingCurrent = (this.currentStudyId === id);
        this.allStudies = this.allStudies.filter(s => s.id !== id);
        
        if (this.allStudies.length === 0) {
            const defaultStudy = {
                id: 'study_' + Date.now(),
                title: "My Lichess Study",
                chapters: [{ title: "Chapter 1", pgn: "" }],
                activeChapterIndex: 0
            };
            this.allStudies.push(defaultStudy);
        }
        
        if (isDeletingCurrent || !this.allStudies.find(s => s.id === this.currentStudyId)) {
            // 🔥 Pass TRUE to skip saving the ghost!
            this.loadStudy(this.allStudies[0].id, true); 
        } else {
            this.saveAllStudies();
        }
    }
deleteSelectedStudies() {
        const checkboxes = Array.from(document.querySelectorAll('.study-cb:checked'));
        if (checkboxes.length === 0) return;

        const idsToDelete = checkboxes.map(cb => cb.dataset.id);
        const deletingAll = idsToDelete.length === this.allStudies.length;
        const deletingCurrent = idsToDelete.includes(this.currentStudyId);

        // ONLY save if we are keeping the current study
        if (!deletingCurrent) this.saveActiveChapter();

        if (deletingAll) {
            const newId = 'study_' + Date.now();
            this.allStudies = [{
                id: newId,
                title: "My Lichess Study",
                chapters: [{ title: "Chapter 1", pgn: "" }],
                activeChapterIndex: 0
            }];
            
            // 🔥 Pass TRUE to skip saving the ghost!
            this.loadStudy(newId, true);
            this.saveAllStudies();
            
            if (window.ui) window.ui.renderStudyList();
            return;
        }

        this.allStudies = this.allStudies.filter(s => !idsToDelete.includes(s.id));
        
        if (deletingCurrent) {
            // 🔥 Pass TRUE to skip saving the ghost!
            this.loadStudy(this.allStudies[0].id, true);
        } else {
            this.saveAllStudies();
        }
        
        if (window.ui) window.ui.renderStudyList();
    }
deleteCurrentChapter() {
        const idx = window._editingChapterIdx;
        if (idx < 0) return; 
        
        const modal = document.getElementById('customConfirmModal');
        const textEl = document.getElementById('customConfirmMessage');
        const yesBtn = document.getElementById('customConfirmYes');
        const noBtn = document.getElementById('customConfirmNo');

        if (!modal) {
            if (confirm(`Delete chapter "${this.chapters[idx].title}"?`)) {
                this.executeChapterDeletion(idx); // Failsafe
            }
            return;
        }

        textEl.innerText = `Are you sure you want to permanently delete "${this.chapters[idx].title}"?`;
        modal.style.display = 'flex';

        yesBtn.onclick = () => {
            modal.style.display = 'none';
            
            const deletingCurrent = (idx === this.activeChapterIndex);
            if (!deletingCurrent) this.saveActiveChapter();
            
            this.chapters.splice(idx, 1);
        
            if (this.chapters.length === 0) {
                this.chapters = [{ title: "Chapter 1", pgn: "" }];
            } 
            
            this.activeChapterIndex = -1;
            // 🔥 Pass TRUE to cleanly load Chapter 1 without saving the ghost!
            this.loadChapter(0, true); 
            this.saveAllStudies();
            
            const editorModal = document.getElementById('chapterModal');
            if (editorModal) editorModal.style.display = 'none';
            
            if (window.ui && window.ui.renderChapters) window.ui.renderChapters();
        };

        noBtn.onclick = () => modal.style.display = 'none';
    }
deleteSelectedChapters() {
        const checkboxes = Array.from(document.querySelectorAll('.chapter-cb:checked'));
        if (checkboxes.length === 0) return;

        const indices = checkboxes.map(cb => parseInt(cb.dataset.idx, 10)).sort((a,b) => b - a);
        const deletingCurrent = indices.includes(this.activeChapterIndex);

        if (!deletingCurrent) this.saveActiveChapter();

        indices.forEach(idx => this.chapters.splice(idx, 1));

        if (this.chapters.length === 0) {
            this.chapters = [{ title: "Chapter 1", pgn: "" }];
        }

        this.activeChapterIndex = -1; 
        // 🔥 Pass TRUE to cleanly load Chapter 1 without saving the ghost!
        this.loadChapter(0, true);
        
        this.saveAllStudies();
        
        if (window.ui) window.ui.openChapterManager(); 
    }
downloadSelectedChapters() {
        this.saveActiveChapter(); // Guarantee latest moves are included
        const checkboxes = document.querySelectorAll('.chapter-export-cb');
        let combinedPgn = "";
        let exportedCount = 0;
        
        checkboxes.forEach(cb => {
            if (cb.checked) {
                const idx = parseInt(cb.dataset.idx, 10);
                if (this.chapters[idx]) {
                    let chPgn = this.chapters[idx].pgn || "";
                    
                    // Prepend the chapter name to the Event header to identify it
                    if (!chPgn.includes('[Event "')) {
                        chPgn = `[Event "${this.studyTitle} - ${this.chapters[idx].title}"]\n` + chPgn;
                    }
                    combinedPgn += chPgn + "\n\n";
                    exportedCount++;
                }
            }
        });
        
        if (exportedCount === 0) {
            if (window.ui) window.ui.showNotification("No chapters selected.", "Export Failed", "⚠️");
            return;
        }
        
        const blob = new Blob([combinedPgn.trim()], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        a.download = `${this.studyTitle.replace(/[^a-z0-9]/gi, '_')}_${dateStr}.pgn`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        document.getElementById('exportStudyModal').style.display = 'none';
        if (window.ui) window.ui.showNotification(`Successfully exported ${exportedCount} chapters.`, "Export Complete", "📥");
    }
triggerDownload(content, filename) {
        const blob = new Blob([content.trim()], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        a.download = `${filename.replace(/[^a-z0-9]/gi, '_')}_${dateStr}.pgn`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
parseMultiPGN(pgnString) {
        // Slices a massive text file into individual PGN game strings!
        const games = [];
        const lines = pgnString.split(/\r?\n/);
        let currentGame = [];
        
        for (let line of lines) {
            if (line.trim().startsWith('[Event ') && currentGame.length > 0) {
                if (currentGame.some(l => l.trim() !== '')) {
                    games.push(currentGame.join('\n'));
                }
                currentGame = [];
            }
            currentGame.push(line);
        }
        if (currentGame.length > 0 && currentGame.some(l => l.trim() !== '')) {
            games.push(currentGame.join('\n'));
        }
        return games;
    }
importChaptersFromFile(input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const content = e.target.result;
            const games = this.parseMultiPGN(content);
            
            if (games.length === 0) {
                if (window.ui) window.ui.showNotification("No valid PGN games found.", "Import Failed", "⚠️");
                return;
            }
            
            const jumpToIdx = this.chapters.length; 
            
            games.forEach((gamePgn) => {
                let title = `Imported Chapter ${this.chapters.length + 1}`;
                
                // 🔥 THE FIX: Look for ChapterName first, then fallback to Event
                const chapterMatch = gamePgn.match(/\[ChapterName\s+"([^"]+)"\]/);
                const eventMatch = gamePgn.match(/\[Event\s+"([^"]+)"\]/);
                
                if (chapterMatch && chapterMatch[1] && chapterMatch[1].trim() !== "") {
                    title = chapterMatch[1];
                } else if (eventMatch && eventMatch[1] && eventMatch[1] !== "?" && eventMatch[1] !== "Casual Game") {
                    title = eventMatch[1];
                }
                
                this.chapters.push({ title: title, pgn: gamePgn, analysisMode: 'Normal analysis' });
            });
            
            this.saveAllStudies();
            input.value = ''; 
            
            this.loadChapter(jumpToIdx);
            
            if (window.ui) {
                window.ui.showNotification(`Successfully imported ${games.length} chapters!`, "Import Complete", "📥");
                window.ui.openChapterManager();
                if (typeof window.ui.renderChapters === 'function') window.ui.renderChapters();
            }
        };
        reader.readAsText(file);
    }
importStudyFromFile(input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const content = e.target.result;
            const games = this.parseMultiPGN(content);
            
            if (games.length === 0) {
                if (window.ui) window.ui.showNotification("No valid PGN games found in file.", "Import Failed", "⚠️");
                return;
            }

            // Look for a StudyName header in the first game to use as the overall study title
            let studyName = file.name.replace(/\.[^/.]+$/, "") || "Imported Study";
            const studyMatch = games[0].match(/\[StudyName\s+"([^"]+)"\]/);
            if (studyMatch && studyMatch[1] && studyMatch[1].trim() !== "") {
                studyName = studyMatch[1];
            }

            const newId = 'study_' + Date.now();
            const newChapters = [];
            
            games.forEach((gamePgn, index) => {
                let title = `Chapter ${index + 1}`;
                
                // 🔥 THE FIX: Look for ChapterName first, then fallback to Event
                const chapterMatch = gamePgn.match(/\[ChapterName\s+"([^"]+)"\]/);
                const eventMatch = gamePgn.match(/\[Event\s+"([^"]+)"\]/);
                
                if (chapterMatch && chapterMatch[1] && chapterMatch[1].trim() !== "") {
                    title = chapterMatch[1];
                } else if (eventMatch && eventMatch[1] && eventMatch[1] !== "?" && eventMatch[1] !== "Casual Game") {
                    title = eventMatch[1];
                }
                
                newChapters.push({ title: title, pgn: gamePgn, analysisMode: 'Normal analysis' });
            });

            this.allStudies.push({
                id: newId,
                title: studyName,
                chapters: newChapters
            });
            
            this.saveAllStudies();
            this.loadStudy(newId);
            input.value = ''; 
            
            if (window.ui) {
                window.ui.showNotification(`Successfully imported study with ${games.length} chapters!`, "Import Complete", "📥");
                window.ui.renderStudyList();
            }
        };
        reader.readAsText(file);
    }
downloadSelectedChapters() {
        this.saveActiveChapter(); 
        const checkboxes = document.querySelectorAll('.chapter-export-cb');
        let combinedPgn = "";
        let exportedCount = 0;
        
        checkboxes.forEach(cb => {
            if (cb.checked) {
                const idx = parseInt(cb.dataset.idx, 10);
                if (this.chapters[idx]) {
                    let chPgn = this.chapters[idx].pgn || "";
                    
                    // 1. Update or Insert [ChapterName]
                    if (chPgn.match(/\[ChapterName\s+"[^"]*"\]/)) {
                        chPgn = chPgn.replace(/\[ChapterName\s+"[^"]*"\]/, `[ChapterName "${this.chapters[idx].title}"]`);
                    } else {
                        chPgn = `[ChapterName "${this.chapters[idx].title}"]\n` + chPgn;
                    }

                    // 2. Update or Insert [StudyName]
                    if (chPgn.match(/\[StudyName\s+"[^"]*"\]/)) {
                        chPgn = chPgn.replace(/\[StudyName\s+"[^"]*"\]/, `[StudyName "${this.studyTitle}"]`);
                    } else {
                        chPgn = `[StudyName "${this.studyTitle}"]\n` + chPgn;
                    }
                    
                    // 3. Keep fallback Event header for vanilla PGN readers
                    if (!chPgn.includes('[Event "')) {
                        chPgn = `[Event "${this.studyTitle} - ${this.chapters[idx].title}"]\n` + chPgn;
                    }
                    
                    combinedPgn += chPgn + "\n\n";
                    exportedCount++;
                }
            }
        });
        
        if (exportedCount === 0) {
            if (window.ui) window.ui.showNotification("No chapters selected.", "Export Failed", "⚠️");
            return;
        }
        
        const blob = new Blob([combinedPgn.trim()], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        a.download = `${this.studyTitle.replace(/[^a-z0-9]/gi, '_')}_${dateStr}.pgn`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        document.getElementById('exportStudyModal').style.display = 'none';
        if (window.ui) window.ui.showNotification(`Successfully exported ${exportedCount} chapters.`, "Export Complete", "📥");
    }
downloadSelectedStudies() {
        const checkboxes = document.querySelectorAll('.study-cb:checked');
        let combinedPgn = "";
        let count = 0;

        checkboxes.forEach(cb => {
            const studyId = cb.dataset.id;
            const study = this.allStudies.find(s => s.id === studyId);
            if (study && study.chapters) {
                study.chapters.forEach(ch => {
                    let chPgn = ch.pgn || "";
                    
                    // 1. Update or Insert [ChapterName]
                    if (chPgn.match(/\[ChapterName\s+"[^"]*"\]/)) {
                        chPgn = chPgn.replace(/\[ChapterName\s+"[^"]*"\]/, `[ChapterName "${ch.title}"]`);
                    } else {
                        chPgn = `[ChapterName "${ch.title}"]\n` + chPgn;
                    }

                    // 2. Update or Insert [StudyName]
                    if (chPgn.match(/\[StudyName\s+"[^"]*"\]/)) {
                        chPgn = chPgn.replace(/\[StudyName\s+"[^"]*"\]/, `[StudyName "${study.title}"]`);
                    } else {
                        chPgn = `[StudyName "${study.title}"]\n` + chPgn;
                    }

                    // 3. Keep fallback Event header for vanilla PGN readers
                    if (!chPgn.includes('[Event "')) {
                        chPgn = `[Event "${study.title} - ${ch.title}"]\n` + chPgn;
                    }
                    
                    combinedPgn += chPgn + "\n\n";
                });
                count++;
            }
        });

        if (count > 0) {
            this.triggerDownload(combinedPgn, `chess_studies_export`);
            if (window.ui) window.ui.showNotification(`Successfully exported ${count} studies!`, "Export Complete", "📥");
        } else {
            if (window.ui) window.ui.showNotification("No studies selected.", "Export Failed", "⚠️");
        }
    }
resetGameMemory(fen) {
        // 1. Wipe everything
        this.gameOver = false;
        this.isPaused = false;
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        this.engine.load(fen);
        this.turn = this.engine.turn();
        
        this.rootNode = new MoveNode(fen, null);
        this.currentNode = this.rootNode;
        this.history = [];
        this.moveList = [];
        
        // 2. Clean Headers
        this.pgnHeaders = {
            "Event": "Casual Game",
            "Site": "Local",
            "Date": new Date().toISOString().split('T')[0],
            "Variant": this.isChess960 ? "Chess960" : "Standard",
            "FEN": fen,
            "SetUp": fen !== "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" ? "1" : "0"
        };
        
        if (typeof this.syncMoveHistory === 'function') this.syncMoveHistory();
        
        // 3. Command UI to Reset
        if (window.ui) {
            window.ui.resetUIState();
            
            // Assign Metadata Correctly!
            if (this.mode === 'bot') {
                const botName = `Stockfish Level ${this.botLevel}`;
                if (this.botColor === 'b') {
                    window.ui.updatePlayerNames("You", botName, true);
                    this.pgnHeaders["White"] = "You";
                    this.pgnHeaders["Black"] = botName;
                } else {
                    window.ui.updatePlayerNames(botName, "You", true);
                    this.pgnHeaders["White"] = botName;
                    this.pgnHeaders["Black"] = "You";
                }
            } else {
                window.ui.updatePlayerNames("Black", "White", true);
                this.pgnHeaders["White"] = "White";
                this.pgnHeaders["Black"] = "Black";
            }
            
            window.ui.updateHistory(true); 
            window.ui.renderHeaders();
            window.ui.renderBoard(false);
            
            this.whiteTime = this.whiteStartSeconds;
            this.blackTime = this.blackStartSeconds;
            if (typeof window.ui.updateClocks === 'function') window.ui.updateClocks();
        }
    }
triggerMoveSound(move) {
if (typeof SoundManager === 'undefined') return;

const flags = move.flags || '';
let type = 'move';

if (this.engine.game_over()) type = 'victory'; // Changed to standard key 'victory'
else if (this.engine.in_check()) type = 'check';
else if (flags.includes('c') || flags.includes('e')) type = 'capture';
else if (flags.includes('k') || flags.includes('q')) type = 'castle';
else if (flags.includes('p')) type = 'promote';

let destSquare = move.to;
const vol = (typeof ui !== 'undefined' && typeof window.ui.volume === 'number') ? window.ui.volume : 0.7;

SoundManager.play(type, vol, destSquare);
console.log("flags: "+ flags + " | Sound: " + type + " | Theme: " + SoundManager.currentSet + " | Square: " + (destSquare || 'N/A') + " | Vol: " + vol);
};
}