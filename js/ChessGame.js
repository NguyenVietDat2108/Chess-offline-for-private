import { INITIAL_FEN, FILES, RANKS, ICON_BOOK_SVG, SETTINGS_ICON_IMG, VARIANT_STARTING_FENS, nnueMap } from './constants.js';
import { MoveNode } from './MoveNode.js';
export class ChessGame {
    #engine;
    #pieceIdCounter;
    #board;
    #timerInterval;
    #_isBooting;
    #ui;
    #callbacks;
    SUSPENDED_VARIANTS = ['bughouse'];
constructor() {
        this.#callbacks = {};
        this.#ui = null;
        this.#engine = new (typeof Chess === 'function' ? Chess : window.Chess)();
        this.#pieceIdCounter = 0;
        this.#board = Array(64).fill(null);
        this.#timerInterval = null;
        this.#_isBooting = true;
        this.gameMode = (typeof localStorage !== 'undefined' ? localStorage.getItem('chess_last_variant') : 'classical') || 'classical';
        let startingFen = INITIAL_FEN;
        
        if (typeof VARIANT_STARTING_FENS !== 'undefined') {
            startingFen = VARIANT_STARTING_FENS[this.gameMode] || INITIAL_FEN;
        }
        if (typeof localStorage !== 'undefined') {
            const savedPgn = localStorage.getItem(`chess_variant_pgn_${this.gameMode}`);
            if (savedPgn) {
                const fenMatch = savedPgn.match(/\[FEN\s+"([^"]+)"\]/i);
                if (fenMatch && fenMatch[1]) {
                    startingFen = fenMatch[1];
                }
            }
        }

        this.rootNode = new MoveNode(startingFen, null);
        this.currentNode = this.rootNode;
        this.pgnHeaders = {};
        this.availableModes = ['classical', 'chess960', '3check', 'antichess', 'atomic', 'bughouse', 'chaturanga', 'crazyhouse', 'duck', 'horde', 'kingofthehill', 'racingkings', 'placement', 'alice','spell'];        
        this.whiteStartSeconds = 600;
        this.blackStartSeconds = 600;
        this.whiteIncrement = 0;
        this.blackIncrement = 0;
        this.whiteTime = 600;
        this.blackTime = 600;
        
        this.studyTitle = "My Lichess Study";
        this.chapters = [{ title: "Chapter 1", pgn: "" }];
        this.activeChapterIndex = 0;
        this.currentStudyId = 'default';
        this.allStudies = [];

        this.loadAllStudies();

        if (this.allStudies && this.allStudies.length > 0) {
            let activeStudy = this.allStudies.find(s => s.id === (this.currentStudyId || 'default')) || this.allStudies[0];
            if (activeStudy && activeStudy.chapters && activeStudy.chapters.length > 0) {
                this.currentStudyId = activeStudy.id;
                this.studyTitle = activeStudy.title || "My Lichess Study";
                this.chapters = activeStudy.chapters; 
                this.activeChapterIndex = activeStudy.activeChapterIndex || 0;
            }
        }

        setTimeout(() => {
            this.#_isBooting = false; 
            if (this.#ui && typeof this.#ui.renderChapters === 'function') {
                this.#ui.renderChapters();
            }
        }, 150);

        this._internalMode = 'analysis'; 
        this.gameOver = false;
        this.isPaused = false;
        this.botColor = null;
        this.puzzleActive = false;

        // ✨ THE FIX: Initialize all puzzle tracking variables here so the QA scanner sees them instantly!
        this.isFetchingPuzzles = false;
        this.puzzleQueue = [];
        this.puzzleCursor = 0;
        this.puzzleScore = 0;
        this.puzzleStrikes = 0;

        this.castling = { wK:true, wQ:true, bK:true, bQ:true };
        this.enPassant = null;
        this.premoveQueue = [];
        this.premoveMode = 'multi';
        this.lastMoveTime = Date.now(); 
        
        this.loadFEN(startingFen);
    }
on(eventName, callback) {
        this.#callbacks[eventName] = callback;
    }
#emit(eventName, data) {
        if (this.#callbacks[eventName]) {
            this.#callbacks[eventName](data);
        }
    }
isVariantSuspended(mode) {
        return this.SUSPENDED_VARIANTS ? this.SUSPENDED_VARIANTS.includes(mode) : false;
    }
setUI(uiInstance) {
        this.#ui = uiInstance;
    }
get board() { return this.#board; }
get engine() { return this.#engine; }
get isBooting() { return this.#_isBooting; }
get isAnalysisMode() { return this.mode === 'analysis' || this.gameOver; }
get isAnalyzing() { return window.engineAnalysing === true; }
get isEditing() { return this.mode === 'editor'; }
get mode() { return this._internalMode; }
set mode(val) {
    if (val === 'play') {
        if (this._internalMode === 'bot' || this._internalMode === 'local') return;
        this._internalMode = 'local';
        return;
    }
    this._internalMode = val;
}
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
getReader() {
        // ✨ DUCK CHESS: Read the duck square directly from the engine memory!
        let engineDuck = (this.#engine && typeof this.#engine.get_duck_sq === 'function') ? this.#engine.get_duck_sq() : -1;
        let uiDuckSq = -1;
        if (engineDuck !== -1 && engineDuck !== undefined && engineDuck !== null) {
            let file = engineDuck % 8;
            let rank = Math.floor(engineDuck / 8);
            uiDuckSq = (7 - rank) * 8 + file;
        }

        const frozenSquares = new Array(64).fill(false);
        const frozenObj = (this.#engine && typeof this.#engine.frozen === 'function') 
            ? this.#engine.frozen() 
            : { lo: 0, hi: 0 };

        for (let i = 0; i < 64; i++) {
            // UI Index (i) to Engine Index conversion (Flip rank)
            const engineIdx = (7 - Math.floor(i / 8)) * 8 + (i % 8);
            
            // Check the bit in the lo (0-31) or hi (32-63) 32-bit integers
            const isFrozen = engineIdx < 32 ? (frozenObj.lo & (1 << engineIdx)) : (frozenObj.hi & (1 << (engineIdx - 32)));
            
            if (isFrozen) frozenSquares[i] = true;
        }

        return Object.freeze({
            mode: this.mode,
            isGameOver: this.gameOver,
            isLive: this.isPlayingLiveGame,
            isPaused: this.isPaused,
            isCheck: this.#engine ? this.#engine.in_check() : false,
            gameMode: this.gameMode,
            turn: this.currentLiveTurn,
            botColor: this.botColor,
            currentFen: this.currentNode ? this.currentNode.fen : '',
            startingFen: this.rootNode ? this.rootNode.fen : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            activeNodeId: this.currentNode ? this.currentNode.id : null,
            lastMove: this.currentNode ? this.currentNode.lastMove : null,
            headers: Object.freeze({ ...this.pgnHeaders }),
            whiteTime: this.whiteTime,
            blackTime: this.blackTime,
            board: this.#board.map(p => p ? Object.freeze({...p}) : null),
            premoves: [...this.premoveQueue],
            arrows: this.currentNode && this.currentNode.arrows ? [...this.currentNode.arrows] : [],
            circles: this.currentNode && this.currentNode.circles ? [...this.currentNode.circles] : [],
            puzzle: Object.freeze({
                active: this.puzzleActive,
                mode: this.puzzleMode,
                timeRemaining: this.puzzleTimeRemaining,
                score: this.puzzleScore,
                strikes: this.puzzleStrikes,
                solution: this.puzzleSolution,
                cursor: this.puzzleCursor
            }),
            mana: this.#engine && typeof this.#engine.mana === 'function' ? this.#engine.mana() : null,
            frozenSquares: Object.freeze(frozenSquares), 
            frozen: this.#engine && typeof this.#engine.frozen === 'function' ? this.#engine.frozen() : null,
            duck_sq: uiDuckSq, 
            studyTitle: this.studyTitle,
            activeChapterIndex: this.activeChapterIndex,
            chapters: this.chapters.map(c => Object.freeze({ 
                title: c.title, orientation: c.orientation 
            }))
        });
    }
#getPly(node) {
        let ply = 0;
        let curr = node;
        while (curr && curr.parent) {
            ply++;
            curr = curr.parent;
        }
        return ply;
    }
#isDescendant(ancestorNode, targetNode) {
        let curr = targetNode;
        while (curr) {
            if (curr.id === ancestorNode.id) return true;
            curr = curr.parent;
        }
        return false;
    }
#reconcileBoardIds(fen, move) {
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
                } else if (char === '~') {
                    // ✨ CRAZYHOUSE / ALICE FIX: '~' means promoted OR phased to Board B!
                    if (newPieces.length > 0) {
                        if (this.gameMode === 'alice') newPieces[newPieces.length - 1].isBoardB = true;
                        else newPieces[newPieces.length - 1].promoted = true;
                    }
                } else if (char === '*') {
                    newPieces.push({ type: 'duck', color: 'none', idx, r: Math.floor(idx / 8), c: idx % 8, id: null });
                    idx++;
                } else {
                    const color = (char === char.toUpperCase()) ? 'w' : 'b';
                    const type = char.toLowerCase();
                    newPieces.push({ type, color, idx, r: Math.floor(idx / 8), c: idx % 8, id: null });
                    idx++;
                }
            }
        }

        // 2. Get Current Board pieces
        const oldPieces = [];
        this.#board.forEach((p, i) => {
            if (p) oldPieces.push({ ...p, idx: i, assigned: false });
        });

        // 3. MATCHING ALGORITHM
        if (move && move.from !== '@') {
            const srcIdx = typeof move.from === 'number' ? move.from : this.#squareToIndex(move.from);
            const dstIdx = typeof move.to === 'number' ? move.to : this.#squareToIndex(move.to);
            
            const src = oldPieces.find(p => p.idx === srcIdx);
            const dst = newPieces.find(p => p.idx === dstIdx);
            
            if (src && dst && src.color === dst.color && src.type === dst.type) {
                dst.id = src.id;
                src.assigned = true;
                dst.idAssigned = true;
            }
        }

        newPieces.forEach(np => {
            if (np.idAssigned) return;
            const match = oldPieces.find(op => !op.assigned && op.type === np.type && op.color === np.color && op.idx === np.idx);
            if (match) {
                np.id = match.id;
                match.assigned = true;
                np.idAssigned = true;
            }
        });

        newPieces.forEach(np => {
            if (np.idAssigned) return;
            let bestMatch = null;
            let minDistance = Infinity;

            oldPieces.forEach(op => {
                if (op.assigned || op.type !== np.type || op.color !== np.color) return;
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
                np.id = (typeof this.getUID === 'function') ? this.getUID() : ('p' + Math.random().toString(36).substr(2, 9)); 
            }
        });

        // 4. Rebuild Board Array
        const finalBoard = new Array(64).fill(null);
        newPieces.forEach(p => {
            finalBoard[p.idx] = { type: p.type, color: p.color, id: p.id };
            if (p.promoted) finalBoard[p.idx].promoted = true; 
            if (p.isBoardB) finalBoard[p.idx].isBoardB = true; // ✨ ALICE CHESS: Expose the mirror dimension to UI.js!
        });
        
        this.#board = finalBoard;
    }
#reconcileBoardIdsReverse(fen, move) {
        if (!fen || typeof fen !== 'string' || fen.trim() === '') {
            fen = INITIAL_FEN;
        }
        if (!this.#board || !move) {
            this.#reconcileBoardIds(fen, null);
            return;
        }

        const cleanFen = fen.trim().split(' ')[0];
        const fenRows = cleanFen.split('/');
        if (fenRows.length !== 8) {
            this.#reconcileBoardIds(fen, null);
            return;
        }

        const newPieces = [];
        let idx = 0;

        for (let r = 0; r < 8; r++) {
            const row = fenRows[r];
            if (!row) { idx += 8; continue; }

            for (let c = 0; c < row.length; c++) {
                const char = row[c];
                if (/\d/.test(char)) {
                    idx += parseInt(char, 10);
                } else if (char === '~') {
                    // ✨ CRAZYHOUSE / ALICE FIX
                    if (newPieces.length > 0) {
                        if (this.gameMode === 'alice') newPieces[newPieces.length - 1].isBoardB = true;
                        else newPieces[newPieces.length - 1].promoted = true;
                    }
                } else if (char === '*') {
                    newPieces.push({ type: 'duck', color: 'none', idx, r: Math.floor(idx / 8), c: idx % 8, id: null });
                    idx++;
                } else {
                    const color = (char === char.toUpperCase()) ? 'w' : 'b';
                    const type = char.toLowerCase();
                    newPieces.push({ type, color, idx, r: Math.floor(idx / 8), c: idx % 8, id: null });
                    idx++;
                }
            }
        }

        const oldPieces = [];
        this.#board.forEach((p, i) => {
            if (p) oldPieces.push({ ...p, idx: i, assigned: false });
        });

        if (move && move.from !== '@') {
            const srcIdx = typeof move.from === 'number' ? move.from : this.#squareToIndex(move.from);
            const dstIdx = typeof move.to === 'number' ? move.to : this.#squareToIndex(move.to);

            const currentlyAt = oldPieces.find(p => p.idx === dstIdx);
            const goingBackTo = newPieces.find(p => p.idx === srcIdx);

            if (currentlyAt && goingBackTo && currentlyAt.color === goingBackTo.color) {
                goingBackTo.id = currentlyAt.id;
                currentlyAt.assigned = true;
                goingBackTo.idAssigned = true;
            }
        }

        newPieces.forEach(np => {
            if (np.idAssigned) return;
            const match = oldPieces.find(op => !op.assigned && op.type === np.type && op.color === np.color && op.idx === np.idx);
            if (match) {
                np.id = match.id;
                match.assigned = true;
                np.idAssigned = true;
            }
        });

        newPieces.forEach(np => {
            if (np.idAssigned) return;
            let bestMatch = null;
            let minDistance = Infinity;

            oldPieces.forEach(op => {
                if (op.assigned || op.type !== np.type || op.color !== np.color) return;
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
                np.id = (typeof this.getUID === 'function') ? this.getUID() : ('p' + Math.random().toString(36).substr(2, 9)); 
            }
        });

        const finalBoard = new Array(64).fill(null);
        newPieces.forEach(p => {
            finalBoard[p.idx] = { type: p.type, color: p.color, id: p.id };
            if (p.promoted) finalBoard[p.idx].promoted = true; 
            if (p.isBoardB) finalBoard[p.idx].isBoardB = true; // ✨ ALICE CHESS: Expose the mirror dimension to UI.js!
        });

        this.#board = finalBoard;
    }
#squareToIndex(sq) {
if (!sq || typeof sq !== 'string') return -1; 

let f = FILES.indexOf(sq[0]);
let r = 8 - parseInt(sq[1]);
return r * 8 + f;
}
#indexToSquare(idx) {
let r = Math.floor(idx / 8);
let f = idx % 8;
return FILES[f] + (8 - r);
}
#triggerBotMove(ignoreBook = false) {
        const now = Date.now();
        if (this._lastBotTrigger && (now - this._lastBotTrigger < 100)) return;
        this._lastBotTrigger = now;
        
        if (this.mode !== 'local' && this.mode !== 'bot') return;
        if (this.turn !== this.botColor) return;

        const fen = typeof this.generateFEN === 'function' ? this.generateFEN() : this.#engine.fen();
        const level = this.botLevel || 8;
        this.botThinkStart = Date.now();
        
        if (typeof this.#calculateBotThinkTime === 'function') {
            this.currentBotThinkTime = this.#calculateBotThinkTime();
        } else {
            this.currentBotThinkTime = 1000;
        }

        const blunderMap = { 1: 0.25, 2: 0.10 };
        const blunderChance = blunderMap[level] || 0;

        // 1. LOW LEVEL BLUNDER INJECTION (STRICTLY VALIDATED)
        if (level <= 2 && Math.random() < blunderChance) {
            const tempEngine = new (typeof Chess === 'function' ? Chess : window.Chess)(fen, this.gameMode);
            const legalMoves = tempEngine.moves({ verbose: true });
            
            if (legalMoves.length > 0) {
                legalMoves.sort(() => Math.random() - 0.5);
                let validBlunderUci = null;
                
                for (let choice of legalMoves) {
                    let randomUCI = "";
                    if (choice.from === '@' || choice.drop || choice.flags === 'd') {
                        randomUCI = (choice.drop || choice.piece).toUpperCase() + '@' + choice.to;
                    } else {
                        randomUCI = choice.from + choice.to + (choice.promotion || '');
                    }

                    if (this.gameMode === 'duck' && !randomUCI.includes('@')) {
                        const emptySqs = [];
                        for (let i = 0; i < 64; i++) {
                            const sqStr = typeof this.#indexToSquare === 'function' 
                                ? this.#indexToSquare(i) 
                                : String.fromCharCode(97 + (i % 8)) + (8 - Math.floor(i / 8));
                            if (sqStr === choice.from) emptySqs.push(sqStr);
                            else if (sqStr !== choice.to && !tempEngine.get(sqStr)) emptySqs.push(sqStr);
                        }
                        emptySqs.sort(() => Math.random() - 0.5);
                        
                        let foundValidDuck = false;
                        for (let duckSq of emptySqs) {
                            let testUci = randomUCI + ',' + duckSq;
                            let testRes = tempEngine.move({ from: choice.from, to: choice.to, promotion: choice.promotion, duck_sq: duckSq });
                            if (testRes) {
                                // ✨ STRICT CHECK: Verify King cannot be captured
                                let enemyCanCaptureKing = false;
                                let enemyMoves = tempEngine.moves({ verbose: true });
                                for (let em of enemyMoves) {
                                    let target = tempEngine.get(em.to);
                                    if (target && target.type === 'k') { enemyCanCaptureKing = true; break; }
                                }
                                tempEngine.undo();
                                if (!enemyCanCaptureKing) {
                                    validBlunderUci = testUci;
                                    foundValidDuck = true;
                                    break;
                                }
                            }
                        }
                        if (foundValidDuck) break;
                    } else {
                        let testRes = null;
                        if (randomUCI.includes('@')) {
                            testRes = tempEngine.move({ from: '@', to: choice.to, drop: choice.drop || choice.piece });
                        } else {
                            testRes = tempEngine.move({ from: choice.from, to: choice.to, promotion: choice.promotion });
                        }
                        
                        if (testRes) {
                            // ✨ STRICT CHECK: Ensure Crazyhouse/Classical moves don't leave King in check!
                            let enemyCanCaptureKing = false;
                            let enemyMoves = tempEngine.moves({ verbose: true });
                            for (let em of enemyMoves) {
                                let target = tempEngine.get(em.to);
                                if (target && target.type === 'k') {
                                    enemyCanCaptureKing = true;
                                    break;
                                }
                            }
                            tempEngine.undo();
                            
                            if (!enemyCanCaptureKing) {
                                validBlunderUci = randomUCI;
                                break;
                            }
                        }
                    }
                }
                
                if (validBlunderUci) {
                    console.log(`%c[BOT] Level ${level} Validated Blunder: ${validBlunderUci}`, "color: #fca5a5");
                    if (typeof this.#executeBotMoveWithDelay === 'function') {
                        this.#executeBotMoveWithDelay(validBlunderUci, false);
                    } else if (typeof this.executeBotMove === 'function') {
                        this.executeBotMove(validBlunderUci, false);
                    }
                    return;
                }
            }
        }

        // 2. OPENING BOOK
        if (!ignoreBook && this.gameMode === 'classical') {
            let bookCandidates = null;
            if (typeof this.getBookMove === 'function') bookCandidates = this.getBookMove(fen, level);
            else if (typeof this.#getBookMove === 'function') bookCandidates = this.#getBookMove(fen, level);
            
            if (bookCandidates && bookCandidates.length > 0) {
                const candidate = bookCandidates[Math.floor(Math.random() * bookCandidates.length)];
                
                if (window.sfWorker && level >= 3) {
                    this.verifyingBookMove = candidate;
                    this.verifyingBookScore = null;
                    this.verifyingBookType = null;
                    this.verifyingBookThreshold = -150; 
                    
                    window.sfWorker.postMessage('stop');
                    window.sfWorker.postMessage('position fen ' + fen);
                    window.sfWorker.postMessage(`go depth 8 searchmoves ${candidate}`);
                    return; 
                } else {
                    if (typeof this.#executeBotMoveWithDelay === 'function') {
                        this.#executeBotMoveWithDelay(candidate, true);
                    } else if (typeof this.executeBotMove === 'function') {
                        this.executeBotMove(candidate, true);
                    }
                    return; 
                }
            }
        }

        // 3. STANDARD ENGINE CALCULATION
        if (window.sfWorker) {
            const difficultyMap = {
                1: { uciElo: 1000 }, 2: { uciElo: 1200 },
                3: { uciElo: 1500 }, 4: { uciElo: 1800 },
                5: { uciElo: 2100 }, 6: { uciElo: 2400 },
                7: { uciElo: 2700 }, 8: { uciElo: 3200 }
            };
            const settings = difficultyMap[level] || difficultyMap[8];
            
            window.sfWorker.postMessage('stop');
            window.sfWorker.postMessage('setoption name MultiPV value 1');
            
            if (this.activeEngineType === 'fairy') {
                const sfVariant = this.gameMode === 'classical' ? 'chess' : this.gameMode;
                window.sfWorker.postMessage('setoption name UCI_Variant value ' + sfVariant);
            } else {
                window.sfWorker.postMessage('setoption name UCI_Chess960 value ' + (this.gameMode === 'chess960' ? 'true' : 'false'));
            }
            
            window.sfWorker.postMessage('setoption name UCI_LimitStrength value true');
            window.sfWorker.postMessage(`setoption name UCI_Elo value ${settings.uciElo}`);
            window.sfWorker.postMessage('position fen ' + fen);
            window.sfWorker.postMessage(`go movetime ${this.currentBotThinkTime}`); 
        }
    }
#executeBotMoveWithDelay(uciMove, isBookMove = false) {
        const now = Date.now();
        const start = this.botThinkStart || now;
        const elapsed = now - start;
        const expectedThinkTime = isBookMove ? 800 : (this.currentBotThinkTime || 1200);
        const delay = Math.max(0, expectedThinkTime - elapsed);

        setTimeout(() => {
            let moveObj = {};
            let promo = undefined;
            let cleanUci = uciMove.trim();

            // CRAZYHOUSE DROP
            if (cleanUci.includes('@') && cleanUci.length <= 5) {
                let parts = cleanUci.split('@');
                moveObj.from = '@';
                moveObj.drop = parts[0].toLowerCase() || 'p';
                moveObj.to = this.#squareToIndex(parts[1].slice(-2));
            } else {
                // PIECE MOVE + DUCK PLACEMENT
                let duck_sq = undefined;
                let separator = cleanUci.includes(',') ? ',' : (cleanUci.includes('@') ? '@' : null);
                
                if (separator) {
                    let parts = cleanUci.split(separator);
                    cleanUci = parts[0];
                    let d_str = parts[1].replace(/[^a-h1-8]/g, '');
                    // ✨ FIX: Always take the final destination (the last 2 chars)
                    duck_sq = this.#squareToIndex(d_str.slice(-2));
                } else {
                    // Handle concatenated UCI like e2e4g8
                    let fsMatch = cleanUci.match(/^([a-h][1-8][a-h][1-8][qrbn]?)([a-h][1-8])$/);
                    if (fsMatch) {
                        cleanUci = fsMatch[1];
                        duck_sq = this.#squareToIndex(fsMatch[2]);
                    }
                }

                moveObj.from = this.#squareToIndex(cleanUci.substring(0, 2));
                moveObj.to = this.#squareToIndex(cleanUci.substring(2, 4));
                promo = cleanUci.length > 4 && !separator ? cleanUci.substring(4, 5) : undefined;
                if (duck_sq !== undefined) moveObj.duck_sq = duck_sq;
            }

            const result = this.makeMove(moveObj, promo, false, null, false);
            if (result && this.#ui) {
                if (typeof this.triggerMoveSound === 'function') this.triggerMoveSound(result);
                this.#ui.renderBoard(true); 
                this.#ui.updateHistory();
            }
        }, delay);
    }
#calculateBotThinkTime() {
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
#getBookMove(fen, level = 8) {
if (typeof OPENING_BOOK ==='undefined') return [];
let depthLimit = 10; 
if (level <=2) depthLimit=2; else if (level <= 4) depthLimit = 6;  
else if (level <=7) depthLimit=15; else depthLimit=25; // Level 8 can read deep theory
const moveNum = parseInt(fen.split(' ')[5]) || 1;
if (moveNum> depthLimit) return [];
const legalMoves = this.#engine.moves({ verbose:true });
let possibleMoves = [];
for (let move of legalMoves) {
this.#engine.move(move);
const resultFen = this.#engine.fen();
this.#engine.undo(); 
const coreResult = resultFen.split(' ').slice(0, 4).join(' ');
for (let bookKey in OPENING_BOOK) {
if (bookKey.startsWith(coreResult)) {
possibleMoves.push(move.from + move.to + (move.promotion ||''));
break; 
}
}
}
return possibleMoves;
}
#findNodeById(startNode, targetId) {
        if (!startNode) return null;
        if (startNode.id === targetId) return startNode;
        for (let child of startNode.children) {
            let found = this.#findNodeById(child, targetId);
            if (found) return found;
        }
        return null;
    }
#changeMode(targetMode) {
        if (targetMode === 'puzzles') targetMode = 'puzzle';
        this.handleTabSwitch(targetMode);
    }
#checkAndSwitchEngine() {
        const needsFairy = !['classical', 'chess960'].includes(this.gameMode);
        const targetType = needsFairy ? 'fairy' : 'standard';
        
        if (this.activeEngineType !== targetType || !window.sfWorker) {
            console.log(`[ENGINE] Switching to ${targetType.toUpperCase()} engine for ${this.gameMode}...`);
            this.initEngine(null, null, targetType); 
            return true;
        }
        return false;
    }
#getNotation(move) {
return move.san;
}
#findKing(color) {
    // 1. Initialize Cache (if not exists)
    if (!this._kingCache) this._kingCache = { w: -1, b: -1 };
    
    // 2. Fast Path: Check if our cached position is still correct
    const cachedIdx = this._kingCache[color];
    const p = this.#board[cachedIdx];

    // Verify: Is the piece at the cached square ACTUALLY the King of the right color?
    // (This handles cases where the king moved, was captured, or the board reset)
    if (cachedIdx !== -1 && p && (p.type === 'k' || p.type === 'K') && p.color === color) {
        return cachedIdx;
    }

    // 3. Slow Path: Full Scan (Only happens once per King move)
    for (let i = 0; i < 64; i++) {
        const piece = this.#board[i];
        if (piece && (piece.type === 'k' || piece.type === 'K') && piece.color === color) {
            this._kingCache[color] = i; // Update Cache
            return i;
        }
    }
    
    // 4. King not found (e.g., Editor Mode or Bug)
    this._kingCache[color] = -1;
    return -1;
}
#triggerEngineGo(fen) {
        let targetNode = this.analyzingNode || this.currentNode;

        let isOver = false, isMate = false, tTurn = 'w';
        try {
            const tempChess = new (typeof Chess === 'function' ? Chess : window.Chess)();
            tempChess.setGameMode(this.gameMode);
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
                
                if (this.#ui && typeof this.#ui.updateEvalBar === 'function' && targetNode === this.currentNode) {
                    this.#ui.updateEvalBar('mate', whiteWon ? 1 : -1);
                }
            } else { 
                if (this.mode === 'bot' || this.mode === 'local') { targetNode.evalScore = 0; targetNode.eval = "0.00"; } 
                else { targetNode.localEvalScore = 0; targetNode.localEval = "0.00"; }
                
                if (this.#ui && typeof this.#ui.updateEvalBar === 'function' && targetNode === this.currentNode) {
                    this.#ui.updateEvalBar('cp', 0);
                }
            }
            
            if (targetNode === this.currentNode) {
                const box = document.getElementById('engine-lines-box');
                if (box) box.innerHTML = '';
                if (this.#ui && typeof this.#ui.renderCharts === 'function') requestAnimationFrame(() => {this.#ui.renderCharts();});
            }
            return; 
        }

        window.engineReady = true; 

        if (this.activeEngineType === 'fairy' || this.activeEngineType === 'custom') {
    const sfVariant = this.gameMode === 'classical' ? 'chess' : this.gameMode;
    window.sfWorker.postMessage('setoption name UCI_Variant value ' + sfVariant);
} else {
    window.sfWorker.postMessage('setoption name UCI_Chess960 value ' + (this.gameMode === 'chess960' ? 'true' : 'false'));
}
        
        window.sfWorker.postMessage('setoption name UCI_LimitStrength value false');
        window.sfWorker.postMessage('setoption name Skill Level value 20');
        window.sfWorker.postMessage('setoption name MultiPV value 3');
        window.sfWorker.postMessage('position fen ' + fen);
        
        const depth = document.getElementById('engineDepth')?.value || 99;
        window.sfWorker.postMessage('go depth ' + depth);
    }
#handleEngineMessage(e) {
        if (typeof e.data !== 'string') return;
        const line = e.data.trim(); 
        if (!line) return;
        console.log("%c⬅️ [ENGINE SAYS]: " + line, "color: #a3e635");

        if (line === 'WORKER_INITIALIZED') {
            window.sfWorker.postMessage('uci');
            return;
        }

        if (line === 'readyok') {
            window.engineReady = true; 
            window.engineBooting = false; 

            if (this.mode === 'bot' && this._pendingBotStart) {
                this._pendingBotStart = false;
                window.sfWorker.postMessage('ucinewgame');
                if (this.turn === this.botColor) {
                    setTimeout(() => this.#triggerBotMove(), 500);
                }
                return;
            }

            const isAnalysingOrStudy = (this.mode === 'analysis' || this.mode === 'study');
            if (isAnalysingOrStudy && window.engineAnalysing && this._pendingFen) {
                const targetFen = this._pendingFen;
                this.analyzingNode = this._pendingNode;
                this._pendingFen = null; 
                this._pendingNode = null;
                this.#triggerEngineGo(targetFen); 
            }
            return; 
        }

        const isAnalysingOrStudy = (this.mode === 'analysis' || this.mode === 'study');
        if (isAnalysingOrStudy && window.engineAnalysing && !window.engineReady && (line.startsWith('info') || line.startsWith('bestmove'))) {
            return; 
        }

        if (line.startsWith('id name ')) {
            const engineName = line.replace('id name ', '');
            if (this.#ui && typeof this.#ui.updateEngineName === 'function') this.#ui.updateEngineName(engineName);
            return;
        }

        if (line === 'uciok') {
            let threads = Math.floor(navigator.hardwareConcurrency - 1);
            if (threads < 1) threads = 1;
            if (this.gameMode === 'alice' || this.gameMode === 'spell') {window.sfWorker.postMessage('setoption name Threads value 1');
                                                                        window.sfWorker.postMessage('setoption name Hash value 32');}
            else{            window.sfWorker.postMessage('setoption name Threads value ' + threads);
                
            window.sfWorker.postMessage('setoption name Hash value 1024');}

            window.sfWorker.postMessage('setoption name MultiPV value 3');
            window.sfWorker.postMessage('setoption name Move Overhead value 10');
            window.sfWorker.postMessage('setoption name UCI_LimitStrength value false');
            window.sfWorker.postMessage('setoption name Skill Level value 20');
            
            if (this.activeEngineType === 'fairy' || this.activeEngineType === 'custom') {
                const sfVariant = this.gameMode === 'classical' ? 'chess' : this.gameMode;
                if (this.gameMode === 'alice' || this.gameMode === 'spell') {
                    window.sfWorker.postMessage('setoption name Use NNUE value false');
                    window.sfWorker.postMessage('setoption name EvalFile value ');
                    window.sfWorker.postMessage('setoption name UCI_Variant value ' + sfVariant);
                    window.sfWorker.postMessage('isready');
                    return;
                }
                const nnueFile = nnueMap[this.gameMode];
                if (nnueFile) {
                    fetch('./engine/nnue/' + nnueFile)
                        .then(res => {
                            if (!res.ok) throw new Error("NNUE not found");
                            return res.arrayBuffer();
                        })
                        .then(buffer => {
                            window.sfWorker.postMessage({ action: 'INJECT_NNUE', name: nnueFile, buffer: buffer });
                            setTimeout(() => {
                                window.sfWorker.postMessage('setoption name EvalFile value ' + nnueFile);
                                window.sfWorker.postMessage('isready'); 
                            }, 50);
                        })
                        .catch(err => {
                            console.warn("[ENGINE] Playing without NNUE:", err);
                            window.sfWorker.postMessage('isready'); 
                        });
                    return;
                } else {
                    window.sfWorker.postMessage('isready');
                    return;
                }
            }  else {
                window.sfWorker.postMessage('setoption name UCI_Chess960 value ' + (this.gameMode === 'chess960' ? 'true' : 'false'));
            }
            
            window.sfWorker.postMessage('isready'); 
            return;
        }

        if (line.startsWith('bestmove')) {
            const liveTurn = this.currentLiveTurn || this.turn;
            if (this.mode === 'bot' && liveTurn === this.botColor) {
                const match = line.match(/bestmove\s+(\S+)/);
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

                    if (isVerifying) {
                        let isBadMove = false;
                        if (type === 'mate' && score < 0) isBadMove = true;
                        else if (type === 'cp' && (score === null || score < threshold)) isBadMove = true;

                        if (isBadMove) {
                            console.log(`%c[BOT] Book move ${candidate} rejected. Recalculating...`, "color:#fa412d");
                            this.#triggerBotMove(true); 
                        } else {
                            console.log(`%c[BOT] Book move ${candidate} verified.`, "color:#96bc4b");
                            this.#executeBotMoveWithDelay(candidate);
                        }
                        return;
                    }
                    this.#executeBotMoveWithDelay(moveUCI);
                } else {
                    if (isVerifying) {
                        this.#triggerBotMove(true); 
                    } else {
                        const legalMoves = this.#engine.moves({ verbose: true });
                        if (legalMoves.length > 0) {
                            const choice = legalMoves[0];
                            let fallbackUCI = "";
                            if (choice.from === '@' || choice.drop || choice.flags === 'd') {
                                fallbackUCI = (choice.drop || choice.piece).toUpperCase() + '@' + choice.to;
                            } else {
                                fallbackUCI = choice.from + choice.to + (choice.promotion || '');
                                
                                // 🔥 DUCK CHESS FALLBACK FIX: Pick a random empty square!
                                if (this.gameMode === 'duck') {
                                    let emptySqs = [];
                                    for (let i = 0; i < 64; i++) {
                                        let sqStr = this.#indexToSquare(i);
                                        if (sqStr === choice.from) {
                                            emptySqs.push(sqStr);
                                        } else if (sqStr !== choice.to && !this.#engine.get(sqStr)) {
                                            emptySqs.push(sqStr);
                                        }
                                    }
                                    if (emptySqs.length > 0) {
                                        fallbackUCI += ',' + emptySqs[Math.floor(Math.random() * emptySqs.length)];
                                    }
                                }
                            }
                            this.#executeBotMoveWithDelay(fallbackUCI);
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
            let rawMoves = pvMatch ? pvMatch[1].split(' ') : [];
            const targetNode = this.analyzingNode || this.currentNode;
            const currentFen = targetNode ? targetNode.fen : this.generateFEN();

            if (rawMoves.length > 0) {
                const tempValidator = new (typeof Chess === 'function' ? Chess : window.Chess)(currentFen, this.gameMode);
                const validSan = [];
                const validFull = [];
                
                for (let m of rawMoves) {
                    let res = tempValidator.move(m);
                    if (!res) break; 
                    
                    validSan.push(res.san); // The short version for PGN text (e.g., "Nf3")
                    validFull.push(res);    // The full object for the arrow (contains .from and .to)
                }
                
                // 1. Give the PGN text box the short version it wants
                rawMoves = validSan; 
                
                // 2. Attach the FULL version to the array so the arrow doesn't break!
                rawMoves.bestMoveFull = validFull[0]; 
            }
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
            
            let isBlackTurn = currentFen.split(' ')[1] === 'b';
            if (isBlackTurn) score *= -1; 

            if (type === 'mate') {
                if (score === 0) rawEval = isBlackTurn ? 100000 : -100000;
                else rawEval = score > 0 ? 100000 - Math.abs(score) : -100000 + Math.abs(score);
            } else {
                rawEval = score;
            }

            if (window.engineAnalysing && this.#ui && this.#ui.renderAnalysisLine && targetNode === this.currentNode) {
                const placeholder = document.getElementById('calc-placeholder');
                if (placeholder) placeholder.remove();
                this.#ui.renderAnalysisLine(lineIndex, type, score, rawMoves, currentFen);
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
                        targetNode.pv = ''; 
                    } else {
                        targetNode.localEvalScore = rawEval;
                        targetNode.localEval = evalString;
                        targetNode.depth = depth;
                        targetNode.pv = '';
                    }
                
                
                if (window.engineAnalysing && targetNode === this.currentNode) {
                    const nps = line.match(/nps (\d+)/);
                    // ✨ UPGRADE: Broadcast all engine visual data out to the Controller
                    this.#emit('engineEval', {
                        type, score, depth,
                        nps: nps ? nps[1] : '-',
                        node: targetNode,
                        bestMove: rawMoves.bestMoveFull ? rawMoves.bestMoveFull.uci : rawMoves[0]
                    });
                }
                }
            }
        }
    }
#saveState(stateName) {
        if (!stateName) return;
        
        // 1. Initialize isolated memory mapping if missing
        if (!this.tabMemory) this.tabMemory = { analysis: null, play: null, puzzle: null };
        
        const memSlot = (stateName === 'local' || stateName === 'bot') ? 'play' : stateName;
        
        // 2. Save the deep references directly into RAM
        this.tabMemory[memSlot] = {
            rootNode: this.rootNode,
            currentNode: this.currentNode,
            history: [...(this.history || [])],
            moveList: [...(this.moveList || [])],
            headers: { ...this.pgnHeaders },
            wTime: this.whiteTime,
            bTime: this.blackTime,
            mode: this.mode,
            botColor: this.botColor,
            myColor: this.myColor,
            botLevel: this.botLevel,
            puzzleCursor: this.puzzleCursor,
            puzzleSolution: this.puzzleSolution,
            puzzleScore: this.puzzleScore,
            puzzleStrikes: this.puzzleStrikes
        };

        // 3. Fallback stringification for LocalStorage
        const state = {
            fen: typeof this.generateFEN === 'function' ? this.generateFEN() : this.currentNode.fen,
            pgn: typeof this.generatePGN === 'function' ? this.generatePGN() : "",
            headers: { ...this.pgnHeaders },
            wTime: this.whiteTime,
            bTime: this.blackTime,
            activeNodeId: this.currentNode ? this.currentNode.id : null,
            mode: this.mode,
            botColor: this.botColor,
            myColor: this.myColor,
            botLevel: this.botLevel,
            puzzleCursor: this.puzzleCursor,
            puzzleSolution: this.puzzleSolution,
            puzzleScore: this.puzzleScore,
            puzzleStrikes: this.puzzleStrikes
        };
        localStorage.setItem(`chess_state_${memSlot}`, JSON.stringify(state));
    }
#restoreState(stateName) {
        if (!stateName) return false;
        if (!this.tabMemory) this.tabMemory = { analysis: null, play: null, puzzle: null };
        
        const memSlot = (stateName === 'local' || stateName === 'bot') ? 'play' : stateName;
        
        // 1. Instant RAM Restore
        if (this.tabMemory[memSlot]) {
            const mem = this.tabMemory[memSlot];
            this.rootNode = mem.rootNode;
            this.currentNode = mem.currentNode;
            this.history = mem.history;
            this.moveList = mem.moveList;
            this.pgnHeaders = mem.headers;
            this.whiteTime = mem.wTime !== undefined ? mem.wTime : 600;
            this.blackTime = mem.bTime !== undefined ? mem.bTime : 600;
            this.mode = mem.mode || stateName;
            this.botColor = mem.botColor;
            this.myColor = mem.myColor;
            this.botLevel = mem.botLevel;
            this.puzzleCursor = mem.puzzleCursor || 0;
            this.puzzleSolution = mem.puzzleSolution || [];
            this.puzzleScore = mem.puzzleScore || 0;
            this.puzzleStrikes = mem.puzzleStrikes || 0;
            this.loadFEN(this.currentNode.fen, this.gameMode, true);
            return true;
        }

        // 2. LocalStorage Fallback
        try {
            const stored = localStorage.getItem(`chess_state_${memSlot}`);
            if (stored) {
                const state = JSON.parse(stored);
                
                if (state.pgn) this.loadPGN(state.pgn, false, true);
                else if (state.fen) this.loadNewPosition(state.fen);
                
                if (state.headers) this.pgnHeaders = { ...state.headers };
                if (state.wTime !== undefined) this.whiteTime = state.wTime;
                if (state.bTime !== undefined) this.blackTime = state.bTime;
                if (state.activeNodeId) this.goToNodeId(state.activeNodeId);
                
                this.mode = state.mode || stateName;
                this.botColor = state.botColor;
                this.myColor = state.myColor;
                this.botLevel = state.botLevel;
                this.puzzleCursor = state.puzzleCursor || 0;
                this.puzzleSolution = state.puzzleSolution || [];
                this.puzzleScore = state.puzzleScore || 0;
                this.puzzleStrikes = state.puzzleStrikes || 0;

                // Sync back to RAM
                this.tabMemory[memSlot] = {
                    rootNode: this.rootNode, currentNode: this.currentNode,
                    history: [...(this.history || [])], moveList: [...(this.moveList || [])],
                    headers: { ...this.pgnHeaders }, wTime: this.whiteTime, bTime: this.blackTime,
                    mode: this.mode, botColor: this.botColor, myColor: this.myColor, botLevel: this.botLevel,
                    puzzleCursor: this.puzzleCursor, puzzleSolution: this.puzzleSolution,
                    puzzleScore: this.puzzleScore, puzzleStrikes: this.puzzleStrikes
                };
                return true;
            }
        } catch (e) {
            console.error(`Failed to restore state ${stateName}`, e);
        }
        
        // 3. THE BLEED FIX: Clear the board explicitly if empty
        let startFen = INITIAL_FEN;
        if (typeof VARIANT_STARTING_FENS !== 'undefined' && VARIANT_STARTING_FENS[this.gameMode]) {
            startFen = VARIANT_STARTING_FENS[this.gameMode];
        }
        this.rootNode = new MoveNode(startFen, null);
        this.currentNode = this.rootNode;
        this.history = [];
        this.moveList = [];
        this.pgnHeaders = {};
        this.loadFEN(startFen, this.gameMode, true);
        
        return false;
    }
#parsePGNTokens(tokens, index) {
        const tlRegex = /tl\s*=\s*(\d+(\.\d+)?)/;
        const lichessEvalRegex = /\[%eval\s+([#]?[+-]?[\d\.]+)\]/; 
        const lichessClkRegex = /\[%clk\s+([0-9:\.]+)\]/; // NOW ALLOWS DECIMALS
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
                let savedFen = this.#engine.fen();

                if (this.currentNode.parent) {
                    this.currentNode = this.currentNode.parent;
                    if (this.currentNode.fen) try { this.#engine.load(this.currentNode.fen); } catch(e) {}
                }
                index = this.#parsePGNTokens(tokens, index + 1);
                this.currentNode = savedNode;
                this.currentWTime = savedW;
                this.currentBTime = savedB;
                try { this.#engine.load(savedFen); } catch(e) {}
            }
            else if (token === ')') {
                return index;
            }
            else if (token.startsWith('$') || /^[!?]+$/.test(token)) {
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
                                // 🔥 CORRECTLY PARSES '+M' AND '-M' Mates!
                                this.currentNode.eval = (val > 0 ? "+M" : "-M") + Math.abs(val);
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
                    // Removed the strict ^ anchor so it can find the eval anywhere in the comment
                    let engMatch = rawComment.match(/([+-])?(M)?(\d+(\.\d+)?)\/(\d+)/);
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
                    // 🔥 Now parses fractional seconds properly using parseFloat!
                    timeLeft = parts.reduce((acc, time) => (60 * acc) + parseFloat(time), 0);
                } else if (tlMatch) {
                    timeLeft = parseFloat(tlMatch[1]);
                    this.currentNode.cccTimeLeft = tlMatch[1]; 
                }
                
                if (npsMatch) this.currentNode.nps = npsMatch[1];
                if (latencyMatch) this.currentNode.latency = latencyMatch[1];

                const pvMatch = rawComment.match(/pv=(?:\\*["'])?([^"}\\]+)/);
                if (pvMatch) this.currentNode.pv = pvMatch[1].trim();

                if (timeLeft !== null && !isNaN(timeLeft)) {
                    let justMovedColor = this.#engine.turn() === 'b' ? 'w' : 'b';
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
                let cleanComment = rawComment.replace(/\[%(eval|clk|cal|csl)[^\]]*\]/g, '').trim();
                
                let humanTest = cleanComment.replace(/,?\s*tl=[^,\s]+/ig, "")
                                            .replace(/,?\s*nps=[^,\s]+/ig, "")
                                            .replace(/,?\s*latency=[^,\s]+/ig, "")
                                            .replace(/,?\s*pv=(?:\\*["'])?[^"}\\]*(?:\\*["'])?/ig, "")
                                            .replace(/,?\s*[-+]?(?:M)?\d+(?:\.\d+)?\/\d+/g, "")
                                            .replace(/,?\s*\b\d+(?:\.\d+)?s\b/g, "")
                                            .replace(/DEPTH:\s*\d+\s*/gi, "")
                                            .replace(/,?\s*-\s*$/, "")
                                            .replace(/^,?\s*/, "").replace(/,?\s*$/, "").trim();

                if (humanTest === '' || humanTest === '-' || humanTest === ',-') {
                    cleanComment = ""; 
                } else {
                    cleanComment = cleanComment.replace(/,?\s*tl=[^,\s]+/ig, "")
                                               .replace(/,?\s*nps=[^,\s]+/ig, "")
                                               .replace(/,?\s*latency=[^,\s]+/ig, "")
                                               .replace(/,?\s*pv=(?:\\*["'])?[^"}\\]*(?:\\*["'])?/ig, "")
                                               .replace(/,?\s*-\s*$/, "").trim();
                    
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
                
                const isEngineLog = rawComment.includes('pv=') || 
                                    rawComment.includes('nps=') ||
                                    cccEvalRegex.test(rawComment);

                if (isEngineLog && typeof this.#processEngineComment === 'function') {
                    this.#processEngineComment(this.currentNode, rawComment);
                }
            }
            else {
                if (!['*', '1-0', '0-1', '1/2-1/2'].includes(token) && !token.endsWith('.')) {
                    
                    if (['+-', '-+', '=', '+=', '=+', '±', '∓', '∞', '⩲', '⩱'].includes(token)) {
                        if (this.currentNode) {
                            this.currentNode.nag = (this.currentNode.nag ? this.currentNode.nag + "," : "") + token;
                        }
                        index++;
                        continue;
                    }

                    let moveText = token;
                    let attachedNag = "";
                    
                    const sanRegex = /^([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?(?:@[a-h][1-8])?[\+#]?|O-O-O(?:@[a-h][1-8])?[\+#]?|O-O(?:@[a-h][1-8])?[\+#]?)(.*)$/;
                    let match = token.match(sanRegex);
                    
                    if (match && match[2]) { 
                        moveText = match[1]; 
                        attachedNag = match[2]; 
                    } else {
                        let fallbackMatch = token.match(/^([a-zA-Z0-9\+#\-@]+?)([!?[\]=±∓∞⩲⩱]|\+\-|\-\+|\+\/-|-\/\+)+$/);
                        if (fallbackMatch) {
                            moveText = fallbackMatch[1];
                            attachedNag = fallbackMatch[2];
                        }
                    }

                    let engineInput = moveText; 
                    const uciMatch = engineInput.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
                    if (uciMatch) engineInput = { from: uciMatch[1], to: uciMatch[2], promotion: uciMatch[3] };

                    let moveObj = this.#engine.move(engineInput);
                    let isIllegal = !moveObj;
                    
                    if (isIllegal && engineInput.endsWith('+')) {
                        moveObj = this.#engine.move(engineInput.slice(0, -1));
                        if (moveObj) { isIllegal = false; moveText = engineInput.slice(0, -1); }
                    }

                    if (isIllegal) moveObj = { san: moveText, from: -1, to: -1, flags: '', color: this.#engine.turn(), piece: '' };

                    const newNode = new MoveNode(this.#engine.fen(), moveObj.san);
                    newNode.lastMove = {
                        from: isIllegal ? -1 : this.#squareToIndex(moveObj.from),
                        to: isIllegal ? -1 : this.#squareToIndex(moveObj.to),
                        flags: moveObj.flags, piece: moveObj.piece, color: moveObj.color
                    };
                    
                    if (attachedNag) {
                        const separatedNags = attachedNag.match(/!!|\?\?|!\?|\?!|[!?]|[\+\-]{2}|[=±∓∞⩲⩱]|\+\/-|-\/\+/g);
                        if (separatedNags) newNode.nag = separatedNags.join(',');
                        else newNode.nag = attachedNag;
                    }
                    if (isIllegal) newNode.isIllegal = true;

                    newNode.parent = this.currentNode;
                    this.currentNode.children.push(newNode);

                    // ONLY sort when loading PGNs to prevent manual sub-moves from stealing index 0
                    if (this.currentNode.children.length > 1 && this.isLoadingPGN) {
                        this.currentNode.children.sort((a, b) => {
                            if (a.isPV === b.isPV) return 0;
                            return a.isPV ? 1 : -1; 
                        });
                    }
                    this.currentNode = newNode;
                    
                    this.currentNode.clock = { w: this.currentWTime, b: this.currentBTime };
                }
            }
            index++;
        }
        return index;
    }
#addPVToNode(node, pvString) {
        if (!pvString || !node) return;

        // Save state so the main parser doesn't lose its place
        let savedNode = this.currentNode;
        let savedFen = this.#engine.fen();

        let moves = pvString.trim().split(/\s+/);
        if (moves.length === 0) return;

        let startNode = node;
        let loadFen = node.fen;

        // Auto-detect if the PV starts from the parent node (Standard for Engine/CCC PGNs)
        if (node.parent) {
            try {
                this.#engine.load(node.parent.fen);
                let firstMoveText = moves[0].replace(/[?!]+$/, '');
                let uciMatch = firstMoveText.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
                let testInput = firstMoveText;
                
                if (uciMatch) {
                    testInput = { from: uciMatch[1], to: uciMatch[2] };
                    if (uciMatch[3]) testInput.promotion = uciMatch[3].toLowerCase();
                }

                // If the first PV move is legal from the parent position, branch from the parent!
                if (this.#engine.move(testInput)) {
                    startNode = node.parent;
                    loadFen = node.parent.fen;
                }
            } catch(e) {}
        }

        // Set the engine to the correct branching point
        this.currentNode = startNode;
        try { this.#engine.load(loadFen); } catch(e) { return; }

        for (let i = 0; i < moves.length; i++) {
            let moveText = moves[i].replace(/[?!]+$/, '');
            if (!moveText) continue;

            let uM = moveText.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
            let eInput = moveText;
            if (uM) {
                eInput = { from: uM[1], to: uM[2] };
                if (uM[3]) eInput.promotion = uM[3].toLowerCase();
            }

            let moveObj = this.#engine.move(eInput);
            if (!moveObj) break; // Illegal PV move aborts the line silently

            let moveData = {
                from: typeof this.#squareToIndex === 'function' ? this.#squareToIndex(moveObj.from) : -1,
                to: typeof this.#squareToIndex === 'function' ? this.#squareToIndex(moveObj.to) : -1,
                flags: moveObj.flags, piece: moveObj.piece, color: moveObj.color
            };

            this.#addMoveToTree(this.#engine.fen(), moveObj.san, moveData.to, moveData);
        }

        // Restore everything
        this.currentNode = savedNode;
        try { this.#engine.load(savedFen); } catch(e) {}
    }
#addMoveToTree(fen, moveSan, toSq, moveData) {
        let isPVMove = !!this._isParsingPV;
        let existingChild = this.currentNode.children.find(child => 
            child.moveSan === moveSan && !!child.isPV === isPVMove
        );

        if (existingChild) {
            this.currentNode = existingChild;
            if (!isPVMove && !this.isLoadingPGN) {
                const idx = this.currentNode.parent.children.indexOf(this.currentNode);
                if (idx !== -1) this.currentNode.parent.selectedChildIndex = idx;
            }
        } else {
            let newNode = new MoveNode(fen, moveSan, this.currentNode, "", 0, toSq);
            newNode.lastMove = moveData;
            newNode.isPV = isPVMove;
            
            if (this.isPlayingLiveGame && !isPVMove) {
                const isWhiteMove = this.turn === 'b'; 
                const secondsLeft = isWhiteMove ? this.whiteTime : this.blackTime;
                newNode.timeLeft = secondsLeft * 1000; 
                const h = Math.floor(secondsLeft / 3600);
                const m = Math.floor((secondsLeft % 3600) / 60);
                const s = Math.floor(secondsLeft % 60);
                newNode.clk = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                const now = Date.now();
                if (this.lastMoveTimestamp) newNode.moveTime = now - this.lastMoveTimestamp;
                this.lastMoveTimestamp = now;
            }

            this.currentNode.children.push(newNode);
            const newIdx = this.currentNode.children.indexOf(newNode);
            if (this.currentNode.children.length === 1) this.currentNode.selectedChildIndex = 0;
            else if (!isPVMove && !this.isLoadingPGN) this.currentNode.selectedChildIndex = newIdx;

            this.currentNode = newNode;
        }

        if (!isPVMove) {
            if (typeof this.#syncMoveHistory === 'function') this.#syncMoveHistory();
        }

        // ✨ TAB AUTOSAVE LOGIC
        if (this.mode === 'analysis' && !this._isParsingPV) {
            this.#saveState('analysis');
        } else if (this.mode === 'study' && !this._isParsingPV) {
            if (typeof this.saveActiveChapter === 'function') this.saveActiveChapter();
        } else if ((this.mode === 'local' || this.mode === 'bot') && !this._isParsingPV) {
            this.#saveState('play');
        } else if (this.mode === 'puzzle' && !this._isParsingPV) {
            this.#saveState('puzzle');
        }
        
        if (this.isLoadingPGN || isPVMove) return; 
        
        try {
            if (typeof this.#ui !== 'undefined') {
                if (this._historyRenderTimeout) clearTimeout(this._historyRenderTimeout);
                this._historyRenderTimeout = setTimeout(() => {
                    requestAnimationFrame(() => { this.#ui.updateHistory(); });
                }, 200); 
            }
        } catch (e) {}
    }
#processEngineComment(node, rawComment) {
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
            this._isParsingPV = true;
            if (typeof this.#addPVToNode === 'function') {
                this.#addPVToNode(node, pvMatch[1].trim());
            }
            this._isParsingPV = false; // Reset flag immediately
        }
    }
#endGame(resultStr, statusMsg) {
        if (this.mode === 'analysis' || this.mode === 'study' || this.mode === 'editor') return; 

        const finishedLiveGame = (this.mode === 'local' || this.mode === 'bot');
        this.gameOver = true;
        this.isPaused = false; 
        
        if (this.#timerInterval) {
            clearInterval(this.#timerInterval);
            this.#timerInterval = null;
        }

        this.pgnHeaders['Result'] = resultStr;

        if (finishedLiveGame && typeof this.#saveState === 'function') {
            const originalMode = this.mode;
            this.mode = 'analysis';     
            this.#saveState('analysis'); 
            this.mode = originalMode;   
        }

        let winner = "Draw";
        if (resultStr === "1-0") winner = "White";
        else if (resultStr === "0-1") winner = "Black";
        
        let reason = statusMsg;
        if (statusMsg.includes(' wins ')) reason = statusMsg.split(' wins ')[1]; 
        else if (statusMsg.startsWith('Draw ')) reason = statusMsg.substring(5); 

        // ✨ UPGRADE: Pure Event Emission. No DOM elements. No UI calls!
        this.#emit('gameOver', { winner, reason, statusMsg });
    }
#stopTimer() {
        if (this.#timerInterval) {
            clearInterval(this.#timerInterval);
            this.#timerInterval = null;
        }
    }
#startTimer() {
        this.#stopTimer();

        this.whiteTime = Number(this.whiteTime) || 0;
        this.blackTime = Number(this.blackTime) || 0;
        let wWarningPlayed = false;
        let bWarningPlayed = false;

        this.#timerInterval = setInterval(() => {
            if (this.gameOver || this.isEditing || this.isAnalysisMode || this.isPaused || !this.isPlayingLiveGame) {
                return;
            }
            const liveTurn = this.currentLiveTurn;

            if (liveTurn === 'w') {
                this.whiteTime = Math.max(0, this.whiteTime - 1);
                if (this.whiteTime === 10 && !wWarningPlayed) {
                    this.#emit('soundTriggered', { type: 'lowtime' });
                    wWarningPlayed = true;
                }
                if (this.whiteTime <= 0) this.#endGame('timeout', 'b'); 
            } else { 
                this.blackTime = Math.max(0, this.blackTime - 1);
                if (this.blackTime === 10 && !bWarningPlayed) {
                    this.#emit('soundTriggered', { type: 'lowtime' });
                    bWarningPlayed = true;
                }
                if (this.blackTime <= 0) this.#endGame('timeout', 'w'); 
            }
            
            if (typeof window !== 'undefined' && this.#ui && typeof this.#ui.updateClocks === 'function') {
                this.#ui.updateClocks();
            }
        }, 1000);
    }
#loadCurrentPuzzle() {
        if (this.puzzleIndex >= this.puzzleQueue.length) {
            if (this.isFetchingPuzzles) {
                if (this.#ui && typeof this.#ui.showNotification === 'function') this.#ui.showNotification("Fetching more puzzles...", "Please Wait", "⏳");
                setTimeout(() => this.#loadCurrentPuzzle(), 500); 
                return;
            } else {
                if (this.#ui && typeof this.#ui.showNotification === 'function') {
                    this.#ui.showNotification("You have completed all puzzles in this set!", "Session Complete", "🎉");
                    if (typeof this.#ui.updatePuzzleUI === 'function') this.#ui.updatePuzzleUI("controls");
                }
                return;
            }
        }

        const p = this.puzzleQueue[this.puzzleIndex];
        console.log(`%c[PUZZLE LOADED] ID: ${p.id} | Rating: ${p.rating}`, "color: #38bdf8; font-weight: bold;");
        
        // 🔥 THE RACE CONDITION FIX: Safe background loading!
        // If the fetch finished but the user already swapped to the Analysis tab, buffer the puzzle safely!
        if (this.mode !== 'puzzle' && this.mode !== 'puzzles') {
            if (!this.tabMemory) this.tabMemory = { analysis: null, play: null, puzzle: null };
            
            const pRoot = new MoveNode(p.fen, null);
            this.tabMemory['puzzle'] = {
                rootNode: pRoot,
                currentNode: pRoot,
                history: [],
                moveList: [],
                headers: {},
                wTime: 600,
                bTime: 600
            };
            
            this.currentPuzzle = p;
            this.initialPuzzleFEN = p.fen;
            this.puzzleSolution = (typeof p.moves === 'string') ? p.moves.trim().split(' ') : p.moves;
            this.puzzleCursor = 0;
            
            // DO NOT call this.#saveState('puzzle') because that grabs global variables!
            // Just sync to localStorage directly so it's ready when they click back to the tab.
            localStorage.setItem('chess_state_puzzle', JSON.stringify({
                fen: p.fen, pgn: "", headers: {}, wTime: 600, bTime: 600, activeNodeId: pRoot.id
            }));
            
            return; // Abort visual rendering to protect the active Analysis tab!
        }

        // Normal Execution
        this.history = [];  
        this.pgn = "";  
        this.pgnHeaders = {}; 
        
        this.rootNode = new MoveNode(p.fen, null);
        this.currentNode = this.rootNode;
        
        const pgnBox = document.getElementById('pgnDisplay');
        if (pgnBox) {
            if (pgnBox.tagName === 'INPUT' || pgnBox.tagName === 'TEXTAREA') pgnBox.value = "";
            else pgnBox.innerText = "";
        }
        
        const analysisBtn = document.getElementById('analysisBtn');
        if (analysisBtn) analysisBtn.style.display = 'none';

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
        
        const opponentColor = this.#engine.turn();
        const wantFlipped = (opponentColor === 'w');
        this.#emit('puzzleLoaded', { wantFlipped, puzzle: p });
        
        this.puzzleSolution = (typeof p.moves === 'string') ? p.moves.trim().split(' ') : p.moves;
        this.puzzleCursor = 0;
        
        setTimeout(() => {
            const setupMove = this.puzzleSolution[0];
            if (setupMove) {
                const from = this.#squareToIndex(setupMove.substring(0, 2));
                const to = this.#squareToIndex(setupMove.substring(2, 4));
                const promo = setupMove.length > 4 ? setupMove.substring(4, 5) : 'q';
                
                const res = this.makeMove({ from, to }, promo, true, null, true);
                
                this.#emit('boardUpdated', { animate: true, overrideMove: this.currentNode.lastMove });
                
                if (res) this.triggerMoveSound(res);
                this.puzzleCursor++;
            }
        }, 500);

        const remainingPuzzles = this.puzzleQueue.length - this.puzzleIndex;
        if (remainingPuzzles <= 5 && !this.isFetchingPuzzles) {
            const prefetchTask = () => {
                const isRush = ['3min', '5min', 'survival'].includes(this.puzzleMode);
                if (isRush) {
                    this.fetchPuzzles(700, 1100, 10); 
                } else {
                    this.fetchPuzzles(this.sessionMinRating, this.sessionMaxRating, 10); 
                }
            };
            if ('requestIdleCallback' in window) requestIdleCallback(prefetchTask);
            else setTimeout(prefetchTask, 100);
        }
    }
#playPuzzleSolution() {
        if (!this.currentPuzzle || !this.puzzleSolution) return;
        if (this._isPlayingSolution) return;
        this._isPlayingSolution = true;

        const movesToPlay = this.puzzleSolution.slice(this.puzzleCursor);
        if (movesToPlay.length === 0) {
            this._isPlayingSolution = false;
            return;
        }
        
        let i = 0;
        const playNext = () => {
            if (!this._isPlayingSolution || this.mode !== 'puzzle') {
                this._isPlayingSolution = false;
                return;
            }

            if (i >= movesToPlay.length) {
                this.#puzzleSuccess();
                this._isPlayingSolution = false; 
                return;
            }
            
            const uci = movesToPlay[i];
            const from = this.#squareToIndex(uci.substring(0, 2));
            const to = this.#squareToIndex(uci.substring(2, 4));
            const promo = uci.length > 4 ? uci.substring(4, 5) : 'q';
            
            const res = this.makeMove({ from, to }, promo, true, null, true);
            
            this.#emit('boardUpdated', { 
                animate: true, 
                overrideMove: this.currentNode.lastMove 
            });
            
            // ✨ Replace the hardcoded emit with the smart sound trigger!
            if (res) this.triggerMoveSound(res);
            
            this.puzzleCursor++;
            i++;
            
            this._solutionTimeout = setTimeout(playNext, 800);
        };
        
        playNext();
    }
#puzzleSuccess() {
        this.puzzleSolved = true;
        const isRush = ['3min','5min','survival'].includes(this.puzzleMode);
        
        if (isRush) {
            this.puzzleScore++;
            if (typeof this.#ui !=='undefined') this.#ui.updatePuzzleStats();
            setTimeout(() => {
                if (this.puzzleActive) this.nextPuzzle();
            }, 100);
            this.gameOver = true; 
        } else {
            const status = document.getElementById('puzzleStatus');
            const next = document.getElementById('nextPuzzleBtn');
            const solBtn = document.getElementById('showSolBtn');
            const hintBtn = document.getElementById('hintBtn');
            const resetPuzzleBtn = document.getElementById('resetPuzzleBtn');
            const analysisBtn = document.getElementById('analysisBtn');

            if (status) { status.innerText ="Solved!"; status.style.color ="#26c2a3"; }
            if (next) next.style.display ="block";
            if (solBtn) solBtn.style.display ="none";
            if (hintBtn) hintBtn.style.display ="none";
            if (resetPuzzleBtn) resetPuzzleBtn.style.display ="none";
            if (analysisBtn) analysisBtn.style.display ="block";
            // NO mode switching!
        }
    }
#puzzleFail() {
        if (window.sfWorker) window.sfWorker.postMessage('stop');
        this.puzzleStrikes++; 

        const isRush = ['3min', '5min', 'survival'].includes(this.puzzleMode);

        if (isRush) {
            this.gameOver = true; 
        } else {
            this.gameOver = false; 
        }

        const puzRating = (this.currentPuzzle && this.currentPuzzle.rating) ? parseInt(this.currentPuzzle.rating) : 1200;
        let loss = 10;
        if (this.calculateRatingChange) {
            loss = this.calculateRatingChange(this.userPuzzleRating, puzRating, false);
            this.userPuzzleRating += loss; 
        } else {
            this.userPuzzleRating -= loss;
        }

        if (typeof this.#ui !== 'undefined') {
            this.#ui.updateStatus(`Puzzle Failed.`);
            
            if (!isRush) {
                this.#ui.showNotification(`Wrong Move! Try again. ❌`, 'Incorrect');
                const nextBtn = document.getElementById('nextPuzzleBtn');
                if (nextBtn) nextBtn.style.display = 'block';
                const analysisBtn = document.getElementById('analysisBtn');
                if (analysisBtn) analysisBtn.style.display = 'block';
                // NO mode switching!
            }
            if (this.#ui.updatePuzzleStats) this.#ui.updatePuzzleStats();
        }

        const engineBtn = document.querySelector('.engine-toggle-btn');
        if (engineBtn) { engineBtn.style.opacity = '1'; engineBtn.style.cursor = 'pointer'; }

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
#triggerDownload(text, filename) {
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${filename}.pgn`;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    }
#parseMultiPGN(pgnString) {
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
#resetGameMemory(fen) {
        // 1. Wipe everything
        this.gameOver = false;
        this.isPaused = false;
        if (this.#timerInterval) {
            clearInterval(this.#timerInterval);
            this.#timerInterval = null;
        }
        
        this.#engine.load(fen);
        this.turn = this.#engine.turn();
        
        this.rootNode = new MoveNode(fen, null);
        this.currentNode = this.rootNode;
        this.history = [];
        this.moveList = [];
        
        this.pgnHeaders = {
            "Event": "Casual Game",
            "Site": "Local",
            "Date": new Date().toISOString().split('T')[0],
            "Variant": this.gameMode === 'classical' ? "Standard" : this.gameMode,
            "FEN": fen,
            "SetUp": fen !== "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" ? "1" : "0"
        };
        
        if (typeof this.#syncMoveHistory === 'function') this.#syncMoveHistory();
        
        // 3. Command UI to Reset
        if (this.#ui) {
            this.#ui.resetUIState();
            
            // Assign Metadata Correctly!
            if (this.mode === 'bot') {
                const botName = `Stockfish Level ${this.botLevel}`;
                if (this.botColor === 'b') {
                    this.#ui.updatePlayerNames("You", botName, true);
                    this.pgnHeaders["White"] = "You";
                    this.pgnHeaders["Black"] = botName;
                } else {
                    this.#ui.updatePlayerNames(botName, "You", true);
                    this.pgnHeaders["White"] = botName;
                    this.pgnHeaders["Black"] = "You";
                }
            } else {
                this.#ui.updatePlayerNames("Black", "White", true);
                this.pgnHeaders["White"] = "White";
                this.pgnHeaders["Black"] = "Black";
            }
            
            this.#ui.updateHistory(true); 
            this.#ui.renderHeaders();
            this.#ui.renderBoard(false);
            
            this.whiteTime = this.whiteStartSeconds;
            this.blackTime = this.blackStartSeconds;
            if (typeof this.#ui.updateClocks === 'function') this.#ui.updateClocks();
        }
    }
#evalPGNGenerate(node, format = 'both') {
        let parts = [];
        let chessComMetadata = [];
        let evalVal = node.localEval !== undefined ? node.localEval : node.eval;

        // 1. Preserve existing clock matches before regex stripping
        let rawClkMatch = node.comment ? node.comment.match(/\[%clk\s+([0-9:\.]+)\]/) : null;
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
            rawComment = rawComment.replace(/(?:^|\s|\{)\s*[\d\.]+\s*s\b(?!.*tl=)/g, "").trim(); 
            rawComment = rawComment.replace(/,?\s*-\s*$/, "").trim();
            if (rawComment === '-') rawComment = "";
            rawComment = rawComment.replace(/^,\s*/, "").replace(/,\s*$/, "").trim();
        }

        if (format === 'clean') return rawComment ? `{ ${rawComment} }` : "";

        // 2. Mathematically rebuild time remaining (NOW SUPPORTS DECIMALS!)
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
            let sNum = t % 60;
            // Support fractional seconds for Bullet/Blitz
            let sStr = sNum % 1 === 0 ? sNum.toString().padStart(2, '0') : (sNum < 10 ? '0' + sNum.toFixed(1) : sNum.toFixed(1));
            clkStr = `${h}:${m.toString().padStart(2, '0')}:${sStr}`;
        }

        if (secondsLeft === null && clkStr) {
            const cParts = clkStr.split(':');
            if (cParts.length === 3) secondsLeft = (+cParts[0]) * 3600 + (+cParts[1]) * 60 + parseFloat(cParts[2]);
            else if (cParts.length === 2) secondsLeft = (+cParts[0]) * 60 + parseFloat(cParts[1]);
        }

        // 3. Compile Lichess format
        if (format === 'lichess' || format === 'both') {
            if (evalVal !== undefined && evalVal !== null) {
                let eStr = evalVal.toString();
                // Map to Lichess syntax: [%eval 2.50] or [%eval #3]
                if (eStr.includes('M')) {
                    eStr = eStr.replace('+M', '#').replace('-M', '#-').replace('M', '#');
                } else {
                    let f = parseFloat(eStr);
                    if (!isNaN(f)) eStr = f.toFixed(2);
                }
                parts.push(`[%eval ${eStr}]`);
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
                    let fromStr = typeof a.from === 'number' ? this.#indexToSquare(a.from) : a.from;
                    let toStr = typeof a.to === 'number' ? this.#indexToSquare(a.to) : a.to;
                    return `${getLichessColor(a.color)}${fromStr}${toStr}`;
                });
                parts.push(`[%cal ${calTags.join(',')}]`);
            }
            if (node.circles && node.circles.length > 0) {
                let cslTags = node.circles.map(c => {
                    let rawSq = c.index !== undefined ? c.index : (c.sq !== undefined ? c.sq : c.square);
                    let sqStr = typeof rawSq === 'number' ? this.#indexToSquare(rawSq) : rawSq;
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
                
                // Standardize the string
                if (!eStr.includes('M')) {
                    let f = parseFloat(eStr);
                    if (!isNaN(f)) {
                        eStr = f.toFixed(2);
                        if (f > 0 && !eStr.startsWith('+')) eStr = '+' + eStr;
                    }
                } else {
                    if (!eStr.startsWith('+') && !eStr.startsWith('-')) eStr = '+' + eStr;
                }
                
                // ONLY flip the evaluation for Black if this is an official CCC Engine Tournament!
                if (this.isEngineMatch && node.lastMove && node.lastMove.color === 'b') {
                    if (eStr.startsWith('+')) eStr = eStr.replace('+', '-');
                    else if (eStr.startsWith('-')) eStr = eStr.replace('-', '+');
                    else if (eStr !== '0' && eStr !== '0.00') eStr = '-' + eStr;
                }
                
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
                if (this.isEngineMatch) {
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
#generatePGNRecursive(node, moveNum, forceNumber = false, format = 'both') {
        if (!node || !node.children || node.children.length === 0) return "";
        
        let pgn = "";
        
        let activeIdx = 0; 
        let mainChild = node.children[activeIdx];

        // If the mainline is an engine ghost line, we WANT to skip it...
        // UNLESS there is a manual sub-move branching from it. If so, we must export 
        // this one engine move to act as the mainline anchor for the variation!
        if (mainChild.isPV) {
            let hasManualVariation = false;
            for (let i = 1; i < node.children.length; i++) {
                if (!node.children[i].isPV) {
                    hasManualVariation = true;
                    break;
                }
            }
            if (!hasManualVariation) return ""; // Safely skip the engine ghost line!
        }
        let ply = this.#getPly(mainChild);
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
        let mainComment = this.#evalPGNGenerate(mainChild, format);
        if (mainComment) pgn += ` ${mainComment}`;

        // 4. Handle Variations safely
        let hadVariations = false;
        if (node.children.length > 1) {
            for (let i = 0; i < node.children.length; i++) {
                if (i === activeIdx) continue; // Skip the main line we just picked
                
                let varChild = node.children[i];
                
                if (varChild.isPV) {
                    let shouldExportTree = false;
                    
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

                let varComment = this.#evalPGNGenerate(varChild, format);
                
                let forceVarNextNumber = (varComment && varComment !== "");
                let subVarText = this.#generatePGNRecursive(varChild, isWhite ? mNum : mNum + 1, forceVarNextNumber, format);
                
                pgn += ` (${varPrefix}${varComment ? " " + varComment : ""}${subVarText ? " " + subVarText : ""})`;
            }
        }

        // 5. Continue Main Line
        let forceNextNumber = hadVariations || (mainComment && mainComment !== "");
        let nextPgn = this.#generatePGNRecursive(mainChild, isWhite ? mNum : mNum + 1, forceNextNumber, format);
        
        if (nextPgn) pgn += " " + nextPgn;

        return pgn;
    }
#generatePGNVariation(node, startPly, format = 'both') {
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
        let comment = this.#evalPGNGenerate(node, format);
        if (comment) pgn += `${comment} `;

        // 3. Recursion
        if (node.children && node.children.length > 0) {
            pgn += " " + this.#generatePGNRecursive(node.children[0], startPly + 1, false, format);
        }

        return pgn.trim();
    }
#calculateWinPercent(cp) {
        // Lichess Formula: W% = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)
        // NOTE: The 10-pawn clamp is now handled BEFORE this step so Mates can bypass it!
        if (typeof cp !== 'number') return 50; 
        return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
    }
#calculateAccuracy(dropInWinPct) {
        const diff = Math.max(0, dropInWinPct); 
        const acc = 103.1668 * Math.exp(-0.04354 * diff) - 3.1669;
        return Math.max(0, Math.min(100, acc)); 
    }
#syncMoveHistory() {
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
    
//Public API calling
saveState(stateName) { this.#saveState(stateName); }
restoreState(stateName) { return this.#restoreState(stateName); }
squareToIndex(sq) { return this.#squareToIndex(sq); }
indexToSquare(idx) { return this.#indexToSquare(idx); }
validateFen(fen) {
        if (!this.#engine) return { valid: false, error: 'Engine not loaded' };
        return this.#engine.validate_fen(fen);
    }
handleTabSwitch(lowerTab) {
        // 1. SAVE CURRENT STATE BEFORE LEAVING
        if (['analysis', 'local', 'bot', 'study'].includes(this.mode)) {
            this.#saveState(this.mode);
            if (this.mode === 'study' && typeof this.saveActiveChapter === 'function') {
                this.saveActiveChapter();
            }
        } else if (this.mode === 'puzzle') {
            this.#saveState('puzzle');
        } else if (this.mode === 'editor') {
            if (typeof localStorage !== 'undefined') localStorage.setItem('chess_state_editor_fen', typeof this.generateFEN === 'function' ? this.generateFEN() : this.currentNode.fen);
        }

        // 2. STOP BACKGROUND ENGINES
        if (window.sfWorker && window.engineAnalysing && lowerTab !== 'analysis' && lowerTab !== 'study') {
            window.sfWorker.postMessage('stop');
            if (window.sfWorker && this.mode === 'puzzle') window.sfWorker.postMessage('stop'); 
        }

        // 3. SECURE STATE TRANSITIONS
        switch (lowerTab) {
            case 'play':
                if (this.#restoreState('play')) this.gameOver = false;
                else { this.mode = 'local'; this.gameOver = true; }
                break;
            case 'study':
                this.mode = 'study';
                this.gameOver = true;
                let targetIdx = this.activeChapterIndex !== -1 ? this.activeChapterIndex : 0;
                this.activeChapterIndex = -1; 
                this.loadChapter(targetIdx, true);
                break;
            case 'editor':
                this.mode = 'editor';
                this.gameOver = true;
                const savedEditorFen = typeof localStorage !== 'undefined' ? localStorage.getItem('chess_state_editor_fen') : null;
                if (savedEditorFen) {
                    this.loadFEN(savedEditorFen, this.gameMode, true);
                    this.rootNode = new MoveNode(savedEditorFen, null);
                    this.currentNode = this.rootNode;
                }
                break;
            case 'analysis':
                if (this.isPlayingLiveGame) {
                    this.gameOver = false;
                    if (this.#timerInterval) clearInterval(this.#timerInterval);
                    if (!this.pgnHeaders['Result']) this.pgnHeaders['Result'] = '*';
                    this.mode = 'analysis';
                } else {
                    this.mode = 'analysis';
                    this.gameOver = true;
                    this.#restoreState('analysis');
                }
                break;
            case 'puzzles':
            case 'puzzle':
                this.mode = 'puzzle';
                this.gameMode = 'classical';
                this.gameOver = true;
                this.#restoreState('puzzle');
                break;
        }
        
        // 4. SYNC INTERNAL ARRAYS
        this.#syncMoveHistory();
    }
switchMode(targetMode) {
        this.#changeMode(targetMode);
    }
switchToAnalysis() {
        if (!this.currentPuzzle) return;

        // 1. Load the headers for the engine
        this.pgnHeaders = {
            "Event": `Chess Puzzle #${this.currentPuzzle.id}`,
            "FEN": this.initialPuzzleFEN,
            "SetUp": "1"
        };

        // 2. EXPLICIT OVERWRITE: Push the puzzle data safely into the Analysis memory slot
        if (!this.tabMemory) this.tabMemory = { analysis: null, play: null, puzzle: null };
        this.tabMemory['analysis'] = {
            rootNode: this.rootNode,
            currentNode: this.currentNode,
            history: [...this.history],
            moveList: [...this.moveList],
            headers: { ...this.pgnHeaders },
            wTime: this.whiteTime,
            bTime: this.blackTime
        };

        // 3. Switch the internal game state over
        this.mode = 'analysis';
        this.gameOver = false;

        // Save to localStorage to persist the switch
        if (typeof this.#saveState === 'function') {
            this.#saveState('analysis');
        }

        // 4. Send command to the UI to physically switch the tab
        if (this.#ui) {
            if (typeof this.#ui.displayMetadata === 'function') {
                this.#ui.displayMetadata(this.pgnHeaders);
            }
            if (typeof this.#ui.updateHistory === 'function') {
                this.#ui.updateHistory(true);
            }
            if (typeof this.#ui.switchTab === 'function') {
                this.#ui.switchTab('analysis');
            }
        }
    }
editBoard(idx, piece) {
        if (this.mode !== 'editor') return;
        this.#board[idx] = piece ? { ...piece } : null;
        if (typeof this.syncEngineToBoard === 'function') this.syncEngineToBoard();
        
        if (typeof this.generateFEN === 'function') {
            const newFen = this.generateFEN();
            if (this.currentNode) this.currentNode.fen = newFen;
            const fenInput = document.getElementById('fenInput');
            if (fenInput) fenInput.value = newFen;
            if (typeof localStorage !== 'undefined') localStorage.setItem('chess_state_editor_fen', newFen);
        }
    }
toggleArrow(from, to, color) { 
        if (!this.currentNode) return; 
        if (!this.currentNode.arrows) this.currentNode.arrows = []; 
        const fromStr = typeof from === 'number' ? this.#indexToSquare(from) : from; 
        const toStr = typeof to === 'number' ? this.#indexToSquare(to) : to; 
        const idx = this.currentNode.arrows.findIndex(a => { 
            const aFromStr = typeof a.from === 'number' ? this.#indexToSquare(a.from) : a.from; 
            const aToStr = typeof a.to === 'number' ? this.#indexToSquare(a.to) : a.to; 
            return aFromStr === fromStr && aToStr === toStr; 
        }); 
        if (idx >= 0) { 
            if (this.currentNode.arrows[idx].color === color) this.currentNode.arrows.splice(idx, 1); 
            else this.currentNode.arrows[idx].color = color; 
        } else { 
            this.currentNode.arrows.push({ from: fromStr, to: toStr, color }); 
        } 
        
        if (this.mode === 'study') this.saveActiveChapter(); 
        else if (this.mode === 'analysis') this.#saveState('analysis'); 
        
        // ✨ FIX: Safely emit the event so main.js routes it to the UI!
        this.#emit('boardUpdated', { skipEngine: true });
    }
toggleCircle(sq, color) {
        if (!this.currentNode) return;
        if (!this.currentNode.circles) this.currentNode.circles = [];
        const sqStr = typeof sq === 'number' ? this.#indexToSquare(sq) : sq;
        const idx = this.currentNode.circles.findIndex(c => {
            const cSq = c.index !== undefined ? c.index : (c.sq !== undefined ? c.sq : c.square);
            const cSqStr = typeof cSq === 'number' ? this.#indexToSquare(cSq) : cSq;
            return cSqStr === sqStr;
        });
        if (idx >= 0) {
            if (this.currentNode.circles[idx].color === color) this.currentNode.circles.splice(idx, 1);
            else this.currentNode.circles[idx].color = color;
        } else {
            this.currentNode.circles.push({ square: sqStr, color });
        }
        
        if (this.mode === 'study') this.saveActiveChapter();
        else if (this.mode === 'analysis') this.#saveState('analysis');
        
        // ✨ FIX: Safely emit the event!
        this.#emit('boardUpdated', { skipEngine: true });
    }
clearAnnotations() {
        if (!this.currentNode) return;
        if (this.currentNode.arrows) this.currentNode.arrows = [];
        if (this.currentNode.circles) this.currentNode.circles = [];
        
        if (this.mode === 'study') this.saveActiveChapter();
        else if (this.mode === 'analysis') this.#saveState('analysis');
        
        // ✨ FIX: Safely emit the event!
        this.#emit('boardUpdated', { skipEngine: true });
    }
updateComment(nodeId, text) {
        const node = this.#findNodeById(this.rootNode, nodeId);
        if (node) {
            node.comment = text === "" ? null : text;
            if (this.mode === 'study') this.saveActiveChapter();
            else if (this.mode === 'analysis') this.#saveState('analysis');
            if (typeof window !== 'undefined' && this.#ui && typeof this.#ui.updateHistory === 'function') this.#ui.updateHistory();
        }
    }
getLegalMoves(squareIdx) {
        if (!this.#engine) return [];
        if (this.#engine.game_over()) return [];
        
        const moves = this.#engine.moves({ verbose: true });
        
        let mapped = moves.map(m => {
            let out = {
                from: this.#squareToIndex(m.from),
                to: this.#squareToIndex(m.to),
                san: m.san,
                promotion: m.promotion,
                isCapture: m.flags.includes('c') || m.flags.includes('e')
            };
            // 🔥 FIX: Pass the duck square natively to the UI!
            if (m.duck_sq !== undefined) {
                out.duck_sq = this.#squareToIndex(m.duck_sq);
            }
            return out;
        });

        if (squareIdx !== undefined && squareIdx !== null && squareIdx !== 'w' && squareIdx !== 'b') {
            const sqInt = parseInt(squareIdx, 10);
            if (!isNaN(sqInt) && sqInt >= 0 && sqInt <= 63) {
                return mapped.filter(m => m.from === sqInt);
            }
        }
        
        return mapped; 
    }
consumePremove() {
        if (this.premoveQueue.length > 0) this.premoveQueue.shift();
    }
restoreAnalysisState() {
        let restored = false;
        if (typeof this.#restoreState === 'function') {
            restored = this.#restoreState('analysis');
        }
        return restored;
    }
setGameMode(mode, isInitialLoad = false, skipStorage = false) {
        // ✨ FIX 1: Do not instantly abort if the app is booting! 
        // We MUST process the initial load to trigger the PGN load and UI render.
        if (!mode) return;
        if (!isInitialLoad && this.gameMode === mode) return;

        const oldMode = this.gameMode;
        const isSuspended = this.isVariantSuspended(mode);
        if (!isInitialLoad && !skipStorage && this.currentNode && this.currentNode !== this.rootNode) {
            const confirmReset = confirm(`Changing the variant to ${mode.toUpperCase()} will reset the current board and clear the move history.\n\nContinue?`);
            
            if (!confirmReset) {
                // User cancelled: Revert the dropdown UI back to safety
                if (typeof document !== 'undefined') {
                    const select = document.getElementById('analysisVariantSelect');
                    if (select) select.value = oldMode;
                }
                return; 
            }
        }

        // 1. Save the CURRENT variant's state before switching (Safely!)
        if (!isInitialLoad && !skipStorage && this.gameMode && oldMode !== mode) {
            this.saveVariantState(this.gameMode);
        }

        this.gameMode = mode;
        
        // ✨ SANDBOX: Do not remember suspended variants in localStorage
        if (!skipStorage && !isSuspended) {
            if (typeof localStorage !== 'undefined') localStorage.setItem('chess_last_variant', mode); 
        }
        
        // ✨ SANDBOX: Wrap the engine boot in a try-catch to prevent fatal app crashes
        try {
            // 2. Physically reboot the engine ruleset when the dropdown changes
            this.#engine = new (typeof Chess === 'function' ? Chess : window.Chess)(undefined, this.gameMode);
            
            if (isSuspended) {
                console.warn(`[Sandbox] Booted ${mode} in isolated memory mode.`);
            }
            
            // 3. Restore the saved PGN for the NEW variant (or Reset to correct starting position)
            let safeSkipStorage = skipStorage || isSuspended; // Force fresh board if suspended
            
            if (!safeSkipStorage) {
                const savedPgn = typeof localStorage !== 'undefined' ? localStorage.getItem(`chess_variant_pgn_${mode}`) : null;
                
                if (savedPgn) {
                    this.loadPGN(savedPgn, false, true);
                    
                    if (typeof document !== 'undefined') {
                        const fenBox = document.getElementById('fenInput');
                        if (fenBox && this.currentNode) fenBox.value = this.currentNode.fen;
                    }
                } else {
                    let startFen = (typeof VARIANT_STARTING_FENS !== 'undefined' && VARIANT_STARTING_FENS[mode]) ? VARIANT_STARTING_FENS[mode] : INITIAL_FEN;
                    
                    // Chess960 override (Dynamically shuffles the classical FEN)
                    if (mode === 'chess960' && typeof this.generateChess960FEN === 'function') {
                        startFen = this.generateChess960FEN();
                    }
                    
                    if (typeof this.newGame === 'function') {
                        this.newGame(startFen);
                    } else if (typeof this.resetGame === 'function') {
                        this.resetGame(false, startFen);
                    }
                }
            } else if (isSuspended) {
                // If suspended, we MUST force a fresh game so we don't carry over broken memory
                let startFen = (typeof VARIANT_STARTING_FENS !== 'undefined' && VARIANT_STARTING_FENS[mode]) ? VARIANT_STARTING_FENS[mode] : INITIAL_FEN;
                if (typeof this.newGame === 'function') this.newGame(startFen);
                else if (typeof this.resetGame === 'function') this.resetGame(false, startFen);
            }
            
            // 4. Let the engine switcher handle booting Fairy-Stockfish
            const didSwitch = typeof this.#checkAndSwitchEngine === 'function' ? this.#checkAndSwitchEngine() : false;
            
            if (!didSwitch && window.sfWorker) {
                if (this.activeEngineType === 'fairy') {
                    window.sfWorker.postMessage('setoption name UCI_Variant value ' + (mode === 'classical' ? 'chess' : mode));
                } else {
                    window.sfWorker.postMessage('setoption name UCI_Chess960 value ' + (mode === 'chess960' ? 'true' : 'false'));
                }
            }
            
        } catch (error) {
            // ✨ CRASH HANDLER: If the variant throws a syntax error or logic failure, 
            // abort instantly, fall back to Classical, and save the app!
            console.error(`[Sandbox] Engine crash detected in ${mode}! Falling back to classical.`, error);
            
            this.gameMode = 'classical';
            this.#engine = new (typeof Chess === 'function' ? Chess : window.Chess)(undefined, 'classical');
            
            if (typeof this.newGame === 'function') this.newGame(INITIAL_FEN);
            else if (typeof this.resetGame === 'function') this.resetGame(false, INITIAL_FEN);
            
            if (typeof this.#ui !== 'undefined' && this.#ui && typeof this.#ui.showNotification === 'function') {
                this.#ui.showNotification(`${mode} engine crashed. Reverting to Classical.`, 'Variant Error', '⚠️');
            }
            
            // Revert dropdown UI
            if (typeof document !== 'undefined') {
                const select = document.getElementById('analysisVariantSelect');
                if (select) select.value = 'classical';
            }
        }
    }
saveVariantState(modeToSave) {
        if (!modeToSave) return;

        // ✨ THE QUARANTINE: Do not let unfinished variants touch permanent memory!
        if (this.isVariantSuspended(modeToSave)) {
            console.warn(`[Sandbox] ${modeToSave} is suspended. State saving aborted to protect memory.`);
            return;
        }

        let pgnToSave = '';
        
        // Dynamically find whatever PGN export function your app uses
        if (typeof this.generatePGN === 'function') pgnToSave = this.generatePGN();
        else if (typeof this.#ui !== 'undefined' && typeof this.#ui.exportPGN === 'function') pgnToSave = this.#ui.exportPGN();
        else if (this.#engine && typeof this.#engine.pgn === 'function') pgnToSave = this.#engine.pgn();

        // ✨ FIX: Never delete the slot automatically! 
        // Only save if there is actual data. Let the "New Game" button handle deletions.
        if (pgnToSave && pgnToSave.trim() !== '') {
            localStorage.setItem(`chess_variant_pgn_${modeToSave}`, pgnToSave);
        } else if (this.currentNode && this.currentNode !== this.rootNode) {
            // Fallback: If PGN generation failed but we clearly have moves, don't wipe it!
            console.warn(`[ChessGame] PGN generation returned empty, but board has moves. Aborting save to protect data.`);
        }
    }
async loadEngineFromFolder() {
        const input = document.createElement('input');
        input.type = 'file';
        input.webkitdirectory = true;
        input.multiple = true;
        
        input.onchange = async (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;
            
            let jsFile = null;
            for (let i = 0; i < files.length; i++) {
                if (files[i].name.endsWith('.js') && !jsFile) jsFile = files[i];
            }
            
            if (jsFile) {
                // Extract the folder name directly from the path! (e.g. "stockfish 17.1")
                const parts = jsFile.webkitRelativePath.split('/');
                const folderName = parts.length > 1 ? parts[0] : jsFile.name.replace('.js', '');
                
                const box = document.getElementById('assetEngineFolder');
                if (box) box.value = folderName;
                
                // 🔥 NO MORE BLOBS! We map it to the pure native Server URL!
                const nativeUrl = '/engine/' + jsFile.webkitRelativePath;
                this.initEngine(nativeUrl, folderName, 'custom');
            } else {
                if (this.#ui && typeof this.#ui.showNotification === 'function') {
                    this.#ui.showNotification("No .js engine file found", "Error", "❌");
                }
            }
        };
        input.click();
    }
async initEngine(customUrl = null, customName = null, engineType = null) {
        if (window.sfWorker) {
            window.sfWorker.terminate();
            window.sfWorker = null;
        }

        try {
            let engineDisplayName = "Stockfish"; 
            window.engineReady = false; 
            window.engineBooting = true;
            
            if (!engineType) {
                engineType = ['classical', 'chess960'].includes(this.gameMode) ? 'standard' : 'fairy';
            }
            this.activeEngineType = engineType;

            // ==========================================
            // 🔥 NATIVE CUSTOM ENGINE
            // ==========================================
            if (this.activeEngineType === 'custom' && customUrl) {
                engineDisplayName = customName || "Custom Engine";
                window.sfWorker = new Worker(customUrl);
            } 
            // ==========================================
            // 🔥 FAIRY STOCKFISH (Message Queue + VFS)
            // ==========================================
            else if (this.activeEngineType === 'fairy') {
                engineDisplayName = "Fairy-Stockfish 14 NNUE";
                
                const originStr = window.location.origin;
                const engineDir = originStr + '/engine/fairy/';
                const jsUrl = engineDir + 'fairy-stockfish.js';
                const wasmUrl = engineDir + 'fairy-stockfish.wasm';
                const workerUrl = engineDir + 'fairy-stockfish.worker.js';
                
                const workerScript = `
                    var originStr = '${originStr}';
                    var jsUrl = '${jsUrl}';
                    var wasmUrl = '${wasmUrl}';
                    var workerUrl = '${workerUrl}';

                    function sanitize(rawUrl) {
                        if (!rawUrl) return '';
                        let u = typeof rawUrl === 'string' ? rawUrl : (rawUrl.url || rawUrl.toString());
                        let oSlash = originStr + '/';
                        if (u.includes(oSlash + 'blob:')) u = u.substring(u.indexOf('blob:'));
                        if (u.includes(oSlash + 'http')) u = u.substring(u.indexOf('http', oSlash.length));
                        u = u.replace(originStr + originStr, originStr);
                        u = u.replace(originStr + '/' + originStr, originStr);
                        return u;
                    }

                    function resolveUrl(rawUrl) {
                        let url = sanitize(rawUrl);
                        if (url.startsWith('blob:') || url.startsWith('data:')) return url;
                        let fileName = decodeURIComponent(url.split('/').pop().split('?')[0].split('#')[0]);
                        
                        if (fileName.endsWith('.worker.js')) return workerUrl;
                        if (fileName.endsWith('.wasm')) return wasmUrl;
                        if (fileName.endsWith('.js')) return jsUrl;
                        if (fileName.endsWith('.nnue')) return originStr + '/engine/nnue/' + fileName;
                        
                        if (url.startsWith('http')) return url;
                        return originStr + '/' + (url.startsWith('/') ? url.substring(1) : url);
                    }

                    const nativeFetch = self.fetch;
                    self.fetch = function(req, opts) { return nativeFetch(resolveUrl(req), opts); };
                    
                    const NativeRequest = self.Request;
                    self.Request = function(input, init) { 
                        try { return new NativeRequest(resolveUrl(input), init); }
                        catch(e) { return new NativeRequest(originStr + '/' + input.toString().split('/').pop(), init); }
                    };

                    const NativeURL = self.URL;
                    self.URL = function(url, base) {
                        try {
                            let resolved = resolveUrl(url);
                            if (resolved.startsWith('blob:') || resolved.startsWith('http')) return new NativeURL(resolved);
                            return new NativeURL(resolved, sanitize(base));
                        } catch(e) { return new NativeURL(resolveUrl(url)); }
                    };
                    self.URL.createObjectURL = NativeURL.createObjectURL;
                    self.URL.revokeObjectURL = NativeURL.revokeObjectURL;

                    var engineInstance = null;
                    var messageQueue = []; // 🔥 Buffer commands while booting!
                    
                    var Module = { 
                        locateFile: function(path) { return resolveUrl(path); },
                        mainScriptUrlOrBlob: jsUrl 
                    };

                    var isInitialized = false;
                    var originalPostMessage = self.postMessage;
                    
                    self.postMessage = function(msg) {
                        if (!isInitialized && typeof msg === 'string') {
                            if (msg.includes('Stockfish') || msg.includes('Fairy') || msg.includes('id name')) {
                                isInitialized = true;
                                originalPostMessage('WORKER_INITIALIZED');
                            }
                        }
                        originalPostMessage.apply(self, arguments);
                    };

                    self.addEventListener('message', function(e) {
                        if (e.data && e.data.action === 'INJECT_NNUE') {
                            try { 
                                var fsObj = typeof FS !== 'undefined' ? FS : (engineInstance ? engineInstance.FS : Module.FS);
                                fsObj.writeFile(e.data.name, new Uint8Array(e.data.buffer)); 
                            } catch(err) {}
                        } 
                        else if (typeof e.data === 'string') {
                            let cmd = e.data;
                            if (cmd.startsWith('setoption name Hash value')) cmd = 'setoption name Hash value 256'; 
                            else if (cmd.startsWith('setoption name Threads value')) {
                                let requestedThreads = parseInt(cmd.split('value ')[1]);
                                if (requestedThreads > 4) cmd = 'setoption name Threads value 4'; 
                            }

                            if (engineInstance) {
                                // Add the ccall line right here!
                                if (engineInstance.ccall) {
                                    engineInstance.ccall('push_cmd', 'null', ['string'], [cmd]);
                                } 
                                else if (typeof engineInstance.postMessage === 'function') engineInstance.postMessage(cmd);
                                else if (typeof engineInstance.onCustomMessage === 'function') engineInstance.onCustomMessage(cmd);
                            else if (typeof engineInstance === 'function') engineInstance(cmd);
                            } else {
                                // 🔥 Engine isn't ready yet! Save the command to the queue!
                                messageQueue.push(cmd);
                            }
                        }
                    });

                    try { importScripts(jsUrl); } catch(e) {}
                    
                    if (typeof Stockfish === 'function') {
                        Stockfish(Module).then(function(engine) {
                            engineInstance = engine; 
                            
                            // 🔥 Flush the queue immediately upon boot!
                            messageQueue.forEach(function(cmd) {
                                // Add the ccall line right here too!
                                if (engineInstance.ccall) engineInstance.ccall('push_cmd', 'null', ['string'], [cmd]);
                                else if (typeof engineInstance.postMessage === 'function') engineInstance.postMessage(cmd);
                                else if (typeof engineInstance.onCustomMessage === 'function') engineInstance.onCustomMessage(cmd);
                                else if (typeof engineInstance === 'function') engineInstance(cmd);
                            });
                            messageQueue = [];
                            
                            if (typeof engine.addMessageListener === 'function') {
                                engine.addMessageListener(function(line) { self.postMessage(line); });
                            } else if (engine.print) {
                                engine.print = function(line) { self.postMessage(line); };
                                engine.printErr = function(line) { self.postMessage(line); };
                            }
                            
                            setTimeout(function() {
                                if (!isInitialized) {
                                    isInitialized = true;
                                    originalPostMessage('WORKER_INITIALIZED');
                                }
                            }, 3500);

                        }).catch(function(e) {});
                    }
                `;
                
                const blob = new Blob([workerScript], { type: 'application/javascript' });
                window.sfWorker = new Worker(URL.createObjectURL(blob));
            }
            else {
                // ✨ INSTANT LOAD FIX: Push the cached name to the UI instantly before the network fetch begins!
                let cachedName = typeof localStorage !== 'undefined' ? localStorage.getItem('chess_cached_engine_name') : "Stockfish 18";
                if (this.#ui && typeof this.#ui.updateEngineName === 'function') {
                    this.#ui.updateEngineName(cachedName);
                }
                window.currentEngineShortName = cachedName;

                try {
                    const response = await fetch('/api/latest-engine');
                    if (response.ok) {
                        const data = await response.json();
                        engineDisplayName = data.name; 
                        if (typeof localStorage !== 'undefined') localStorage.setItem('chess_cached_engine_name', engineDisplayName);
                        window.sfWorker = new Worker(data.path);
                    } else {
                        throw new Error("Server API failed");
                    }
                } catch(e) {
                    engineDisplayName = cachedName || "Stockfish 18";
                    window.sfWorker = new Worker('/engine/stockfish 18/stockfish-18.js');
                }
            }

            if (this.#ui && typeof this.#ui.updateEngineName === 'function') {
                this.#ui.updateEngineName(engineDisplayName);
            }
            window.currentEngineShortName = engineDisplayName;

            const originalPost = window.sfWorker.postMessage.bind(window.sfWorker);
            window.sfWorker.postMessage = function(msg) {
                if (typeof msg === 'string') console.log("%c➡️ [APP SAYS]: " + msg, "color: #38bdf8");
                originalPost(msg);
            };
            window.sfWorker.onerror = function(e) { console.error("[ENGINE ERROR]", e); };
            window.sfWorker.onmessage = (event) => this.#handleEngineMessage(event);

            if (this.activeEngineType !== 'fairy') {
                window.sfWorker.postMessage('uci'); 
            }
        } catch (e) {}
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
            document.querySelectorAll('.ghost-suggestion').forEach(el => el.remove());
            const depthEl = document.getElementById('depth-display');
            if (depthEl) depthEl.innerText = '';
            
            if (this.#ui && typeof this.#ui.updateEvalBar === 'function') {
                this.#ui.updateEvalBar('cp', 0);
            }
            return; 
        }

        if (window.sfWorker && window.engineReady) {
            window.sfWorker.postMessage('stop');
            window.engineReady = false; 
        }

        if (this._engineTimeout) clearTimeout(this._engineTimeout);

        const box = document.getElementById('engine-lines-box');
        if (box) box.innerHTML = '<div id="calc-placeholder" style="color:#888; font-size:13px; font-style:italic; padding:8px;">Calculating...</div>';
        const arrowRoot = document.getElementById('tempArrowRoot');
        if (arrowRoot) arrowRoot.innerHTML = '';
        const depthEl = document.getElementById('depth-display');
        if (depthEl) depthEl.innerText = 'Depth: 0 | Nps: 0';

        this._pendingFen = this.currentNode ? this.currentNode.fen : this.generateFEN();
        this._pendingNode = this.currentNode;

        // 🔥 THE GUARD: Stop it from spamming 'isready' while NNUE is downloading!
        // The engine's boot sequence will naturally process this._pendingFen when it finishes!
        if (window.engineBooting) return;

        this._engineTimeout = setTimeout(() => {
            if (!window.sfWorker) {
                console.warn("⚠️ [ENGINE] No Web Worker found! Booting default engine...");
                this.initEngine();
                return;
            }
            if (!window.sfWorker.onmessage) {
                window.sfWorker.onmessage = (e) => this.#handleEngineMessage(e);
            }
            
            window.sfWorker.postMessage('isready'); 
        }, 250); 
    }
async reviewGame(autoTriggered = false) {
        if (!this.rootNode) return;
        console.log("%c=== STARTING FULL GAME REVIEW ===", "color:#b369f2; font-weight:bold;");

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
                if (this.#ui && this.#ui.showNotification) this.#ui.showNotification("Analyzing game at Depth 20...", "Review Game", "⏳");

                window.sfWorker.postMessage('setoption name MultiPV value 1');
                if (this.activeEngineType === 'fairy' || this.activeEngineType === 'custom') {
    const sfVariant = this.gameMode === 'classical' ? 'chess' : this.gameMode;
    window.sfWorker.postMessage('setoption name UCI_Variant value ' + sfVariant);
} else {
    window.sfWorker.postMessage('setoption name UCI_Chess960 value ' + (this.gameMode === 'chess960' ? 'true' : 'false'));
}
                for (let i = 0; i < nodes.length; i++) {
                    let node = nodes[i];
                    if (node.reviewed|| (node.isBook && this.isEngineMatch)) continue;

                    const tempChess = new (typeof Chess === 'function' ? Chess : window.Chess)(node.fen);
                    tempChess.setGameMode(this.gameMode);
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
                        
                        if (this.#ui && typeof this.#ui.updateInlineEval === 'function') this.#ui.updateInlineEval(node);
                        if (this.#ui && typeof this.#ui.renderCharts === 'function') this.#ui.renderCharts(true);
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
                                
                                if (this.#ui) {
                                    if (typeof this.#ui.updateInlineEval === 'function') this.#ui.updateInlineEval(node);
                                    if (typeof this.#ui.renderCharts === 'function') this.#ui.renderCharts(true);
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
                
                window.sfWorker.postMessage('setoption name MultiPV value 3'); 
                
                window.sfWorker.onmessage = originalOnMessage;
                if (this.#ui && this.#ui.showNotification) this.#ui.showNotification("Analysis Complete!", "Review Game", "✅");
                if (window.engineAnalysing) this.updateStockfish();
            }
        
        // =========================================================
        // 2. MATHEMATICAL ACCURACY CALCULATION
        // =========================================================
        let current = this.rootNode;
        let prevIsMate = false; 
        let previousWinPct = this.#calculateWinPercent(0); 
        
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
                let currentWinPct = this.#calculateWinPercent(cpForMath);
                let dropInWinPct = (justMovedColor === 'w') ? previousWinPct - currentWinPct : currentWinPct - previousWinPct; 
                let moveAccuracy = this.#calculateAccuracy(dropInWinPct);
                
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

        if (this.#ui) {
            if (typeof this.#ui.showReviewResults === 'function') {
                this.#ui.showReviewResults(wAcc, stats.w.blunders, stats.w.mistakes, stats.w.inaccuracies, bAcc, stats.b.blunders, stats.b.mistakes, stats.b.inaccuracies);
            }
            
            if (typeof this.#ui.updateHistory === 'function') this.#ui.updateHistory(true); 
            if (typeof this.#ui.renderCharts === 'function') this.#ui.renderCharts(true);
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

        this.targetRushRating = isRush ? 400 : this.sessionMinRating;

        if (this.#ui) this.#ui.updatePuzzleUI("loading");

        // Fetch the first batch (e.g., 400 to 900)
        let initialLimit = isRush ? 10 : 5;
        let initialMax = isRush ? this.targetRushRating + 500 : this.sessionMaxRating;
        await this.fetchPuzzles(this.targetRushRating, initialMax, initialLimit);

        if (this.currentSessionId !== sessionId) return;

        if (this.puzzleQueue.length > 0) {
            this.puzzleIndex = 0;
            this.#loadCurrentPuzzle();
            
            if (isRush) {
                // Step the ladder up and fetch the next background batch (800 to 1300)
                this.targetRushRating += 500; 
                this.fetchPuzzles(this.targetRushRating, this.targetRushRating + 500, 10);
            } else {
                this.fetchPuzzles(this.sessionMinRating, this.sessionMaxRating, 5); 
            }
        } else {
             if (this.#ui) {
                this.#ui.showNotification("No puzzles found in database.", "Error", "❌");
                this.#ui.updatePuzzleUI("controls");
            }
        }
    }
async nextPuzzle() {
        this.puzzleIndex++;

        if (this.puzzleIndex >= this.puzzleQueue.length - 5) {
            if (!this.isFetchingPuzzles) {
                if (['3min', '5min', 'survival'].includes(this.puzzleMode)) {
                    this.targetRushRating += 400; 
                    this.fetchPuzzles(this.targetRushRating, this.targetRushRating + 500, 10);
                } else {
                    const currentR = this.currentPuzzle?.rating || 1000;
                    this.fetchPuzzles(currentR - 200, currentR + 200, 10);
                }
            }
        }

        if (this.puzzleIndex >= this.puzzleQueue.length) {
             if (this.#ui) this.#ui.showNotification("Reading Database...", "Buffering", "⏳");
             
             let waits = 0;
             while (this.isFetchingPuzzles && waits < 50) {
                 await new Promise(r => setTimeout(r, 100));
                 waits++;
             }
        }

        if (this.puzzleIndex < this.puzzleQueue.length) {
            this.#loadCurrentPuzzle();
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
            if (this.#ui && this.#ui.updatePuzzleStats) this.#ui.updatePuzzleStats();
            
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
            if(this.#ui) this.#ui.updatePuzzleUI("controls");
            return;
        }
        
        if(this.#ui) {
            this.#ui.showNotification(`Reason: ${reason}\nFinal Score: ${this.puzzleScore}`, "Session Over", "🏁");
            this.#ui.updatePuzzleUI("controls");
        }
    }
showSolution() {
this.#playPuzzleSolution();
}
retryPuzzle() {
        if (this.initialPuzzleFEN) {
            this.puzzleCursor = 0;
            this.gameOver = false;
            
            this.loadFEN(this.initialPuzzleFEN);
            this.#ui.renderBoard(true);
            this.#ui.updateHistory();
            
            setTimeout(() => {
            const setupMove = this.puzzleSolution[0];
            if (setupMove) {
                const from = this.#squareToIndex(setupMove.substring(0, 2));
                const to = this.#squareToIndex(setupMove.substring(2, 4));
                const promo = setupMove.length > 4 ? setupMove.substring(4, 5) : 'q';
                
                // ✨ Capture the result
                const res = this.makeMove({ from, to }, promo, true, null, true);
                
                this.#emit('boardUpdated', { 
                    animate: true, 
                    overrideMove: this.currentNode.lastMove 
                });
                
                // ✨ Replace the hardcoded emit with the smart sound trigger!
                if (res) this.triggerMoveSound(res);
                
                this.puzzleCursor++;
            }
        }, 500);
        }
    }
getUID() {
return `p-${this.#pieceIdCounter++}`;
}
setPremoveMode(val) {
this.premoveMode = val;
this.clearPremoves();
}
resetEngineDefault() {
        this.initEngine(null, null);
        this.#ui.showNotification("Restored Default Latest Stockfish", "System", "🔄");
}
stepBack() {
        if (!this.currentNode || !this.currentNode.parent) return false;
        
        const undoneNode = this.currentNode;
        this.currentNode = this.currentNode.parent;
        
        // ✨ THE ULTIMATE FIX: Force the path back to the mainline!
        // When you use the Left Arrow to back out of a variation to the branch point, 
        // the engine instantly forgets the subline so that pressing Right Arrow takes you down the main game!
        this.currentNode.selectedChildIndex = 0;
        
        this.#engine.load(this.currentNode.fen);
        this.turn = this.#engine.turn();
        
        if (typeof this.#reconcileBoardIdsReverse === 'function') {
            this.#reconcileBoardIdsReverse(this.currentNode.fen, undoneNode.lastMove);
        }
        
        let reverseMove = null;
        if (undoneNode.lastMove && undoneNode.lastMove.from !== '@') {
            reverseMove = {
                from: undoneNode.lastMove.to,
                to: undoneNode.lastMove.from,
                color: undoneNode.lastMove.color,
                flags: undoneNode.lastMove.flags
            };
        }

        this.#emit('boardUpdated', { animate: true, overrideMove: reverseMove });
        
        // ✨ FIX: Play a standard click when stepping backward
        this.#emit('soundTriggered', { type: 'move-self' });
        return true;
    }
stepForward() {
        if (!this.currentNode || this.currentNode.children.length === 0) return false;
        
        // Follow the index (which is now mathematically guaranteed to be 0 unless clicked)
        const nextNode = this.currentNode.children[this.currentNode.selectedChildIndex || 0];
        
        this.currentNode = nextNode;
        
        // ✨ Wipe the future memory too, just to be absolutely bulletproof!
        this.currentNode.selectedChildIndex = 0;
        
        this.#engine.load(nextNode.fen);
        this.turn = this.#engine.turn();
        
        if (typeof this.#reconcileBoardIds === 'function') {
            this.#reconcileBoardIds(nextNode.fen, nextNode.lastMove);
        }
        
        this.#emit('boardUpdated', { animate: true, overrideMove: nextNode.lastMove });
        
        // ✨ FIX: Analyze the move we just stepped into for Captures/Checks!
        if (nextNode.lastMove) {
            this.triggerMoveSound(nextNode.lastMove);
        }
        return true;
    }
goToStart() {
    if (!this.rootNode) return false;

    const startFen = this.rootNode.fen;

    // 1. Snapshot the board state BEFORE it gets overwritten by loadFEN
    // We map the pieces to ensure we have a deep enough copy of the references
    const previousBoardSnapshot = this.#board.map(p => p ? { ...p } : null);

    // 2. Update the logical engine state
    this.currentNode = this.rootNode;
    
    // Note: loadFEN will internally update this.#board to the starting position
    this.loadFEN(startFen, this.gameMode, true); 

    // 3. Sync UI elements (like the FEN text box)
    this.#emit('fenChanged', { fen: startFen });
    
    // 4. Trigger the visual animation via the App Switchboard
    // We pass 'isGoToStart' so ChessApp knows to call ui.animateToStartPosition
    this.#emit('boardUpdated', { 
        isGoToStart: true, 
        targetFen: startFen, 
        previousBoard: previousBoardSnapshot,
        animate: false // prevents the standard renderer from jumping the gun
    });

    // 5. Optional sound feedback
    this.#emit('soundTriggered', { type: 'move-self' });

    return true;
}
goToEnd() {
        if (!this.rootNode) return false;
        let curr = this.rootNode;
        while (curr.children.length > 0) curr = curr.children[curr.selectedChildIndex || 0];
        
        this.currentNode = curr;
        
        // ✨ FIX: Complete wipe & load for safety
        this.loadFEN(this.currentNode.fen, this.gameMode, true);
        
        this.#emit('boardUpdated', { animate: false });
        
        // ✨ FIX: Play sound of the final move
        if (this.currentNode.lastMove) this.triggerMoveSound(this.currentNode.lastMove);
        else this.#emit('soundTriggered', { type: 'move-self' });
        
        return true;
    }
goToNodeId(id) {
        let target = null;
        const search = (node) => {
            if (node.id === id) { target = node; return; }
            for (let c of node.children) search(c);
        };
        if (this.rootNode) search(this.rootNode);
        
        if (target) {
            this.currentNode = target;
            
            // ✨ THE ULTIMATE FIX: Clear the variation memory for the entire forward path!
            // This guarantees that when you click back to a mainline move, the Right Arrow 
            // doesn't get hijacked by a previously explored sub-variation!
            let resetNode = target;
            while (resetNode) {
                resetNode.selectedChildIndex = 0;
                resetNode = resetNode.children && resetNode.children.length > 0 ? resetNode.children[0] : null;
            }
            
            this.loadFEN(this.currentNode.fen, this.gameMode, true);
            
            let curr = target;
            while (curr.parent) {
                const idx = curr.parent.children.indexOf(curr);
                if (idx !== -1) curr.parent.selectedChildIndex = idx;
                curr = curr.parent;
            }
            
            this.#emit('boardUpdated', { animate: false });
            
            if (this.currentNode.lastMove) this.triggerMoveSound(this.currentNode.lastMove);
            else this.#emit('soundTriggered', { type: 'move-self' });
            
            return true;
        }
        return false;
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
            if (typeof this.#ui !== 'undefined') this.#ui.updateClocks(); 
        }
    }
playEngineSequence(seqString, baseFen) {
        if (baseFen && this.generateFEN() !== baseFen) {
            let temp = this.currentNode;
            let found = false;
            while (temp) {
                if (temp.fen === baseFen) {
                    this.currentNode = temp;
                    this.#reconcileBoardIds(this.currentNode.fen, null);
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
        if (typeof window.sfWorker !== 'undefined' && window.sfWorker)
            window.sfWorker.postMessage('stop');
        
        for (let uci of moves) {
            if (!uci) continue;
            
            // ✨ PV DROP FIX: Properly parse drop moves!
            let moveObj = {};
            if (uci.includes('@')) {
                let parts = uci.split('@');
                moveObj.from = '@';
                moveObj.drop = parts[0].toLowerCase() || 'p';
                moveObj.to = this.#squareToIndex(parts[1].substring(0, 2));
            } else {
                moveObj.from = this.#squareToIndex(uci.substring(0, 2));
                moveObj.to = this.#squareToIndex(uci.substring(2, 4));
                moveObj.promotion = uci.length > 4 ? uci.substring(4, 5) : 'q';
            }
            
            this.makeMove(moveObj, moveObj.promotion, false, null, true);
        }
        if (typeof this.#ui !== 'undefined') {
            this.#ui.renderBoard(true);
            this.#ui.updateHistory();
            this.#ui.renderArrows();
        }
        if (typeof window.engineAnalysing !== 'undefined' && window.engineAnalysing) {
            this.updateStockfish();
        }
    }
syncEngineToBoard() {
        let pieceFen = "";
        for (let r = 0; r < 8; r++) {
            let empty = 0;
            for (let c = 0; c < 8; c++) {
                let p = this.#board[r * 8 + c];
                if (!p) { empty++; } else {
                    if (empty > 0) { pieceFen += empty; empty = 0; }
                    pieceFen += (p.color === 'w' ? p.type.toUpperCase() : p.type.toLowerCase());
                }
            }
            if (empty > 0) pieceFen += empty;
            if (r < 7) pieceFen += "/";
        }

        let currEngineFen = this.#engine.fen().split(' ');

        
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
                if (fenBox) fenBox.value = this.#engine.fen();
            }
            return; 
        }

        // Preserve En Passant, Halfmove, and Fullmove safely
        fen += ` ${currEngineFen[3] || '-'} ${currEngineFen[4] || '0'} ${currEngineFen[5] || '1'}`; 

        try {
            this.#engine.load(fen);

            if (this.currentNode) {
                this.currentNode.fen = fen;
                this.currentNode.children = []; 
            } else {
                this.rootNode = new MoveNode(fen, null);
                this.currentNode = this.rootNode;
            }
            
            if (typeof window !== 'undefined' && this.#ui) {
                const fenBox = document.getElementById('fenInput');
                if (fenBox) fenBox.value = fen;
                
                if (typeof this.#ui.updateHistory === 'function') {
                    if (typeof this.#syncMoveHistory === 'function') this.#syncMoveHistory();
                    this.#ui.updateHistory(true);
                }
            }
        } catch (e) {
            console.error("Sync Engine Failed:", e);
        }
    }
loadFEN(fen, gameMode = null, isLoadMode = false) {
        if (!fen) return false;

        const cachedMode = this.mode;
        const cachedBotColor = this.botColor;
        const cachedMyColor = this.myColor;

        let loaded = false;
        try {
            if (!this.#engine) this.#engine = new (typeof Chess === 'function' ? Chess : window.Chess)();
            
            // Set the game mode if provided, otherwise default to classical
            this.gameMode = gameMode || this.gameMode || 'classical';
            if (typeof this.#engine.setGameMode === 'function') this.#engine.setGameMode(this.gameMode);
            
            loaded = this.#engine.load(fen);
            if (!loaded && typeof this.patchEngineFor960 === 'function') {
                this.patchEngineFor960();
                loaded = this.#engine.load(fen);
            }
        } catch(e) { console.error(e); }
        
        if (!loaded) return false;
        
        this.gameOver = false;
        this.isPaused = false;

        this.#board = Array(64).fill(null);
        const parts = fen.trim().split(/\s+/); 
        const rows = parts[0].split('/'); 

        let visualRow = 0; 
        // ✨ THE FIX: Correctly parse `~` (Alice/Crazyhouse) and `*` (Duck) to prevent board misalignment!
        for (let rStr of rows) {
            let file = 0; 
            for (let char of rStr) {
                if (/\d/.test(char)) {
                    file += parseInt(char, 10);
                } else if (char === '~') {
                    // Apply property to the previously placed piece
                    const prevSqIndex = (visualRow * 8) + file - 1;
                    if (this.#board[prevSqIndex]) {
                        if (this.gameMode === 'alice') this.#board[prevSqIndex].isBoardB = true;
                        else this.#board[prevSqIndex].promoted = true;
                    }
                } else if (char === '*') {
                    const sqIndex = (visualRow * 8) + file;
                    this.#board[sqIndex] = { type: 'duck', color: 'none', id: this.getUID() };
                    file++;
                } else {
                    const color = (char === char.toUpperCase()) ? 'w' : 'b';
                    const type = char.toLowerCase();
                    const sqIndex = (visualRow * 8) + file;
                    this.#board[sqIndex] = { type: type, color: color, id: this.getUID() };
                    file++;
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

        this.enPassant = (parts[3] && parts[3] !== '-') ? this.#squareToIndex(parts[3]) : null;

        if (!isLoadMode && (cachedMode === 'bot' || cachedMode === 'local')) {
            this.mode = cachedMode;
            this.botColor = cachedBotColor;
            this.myColor = cachedMyColor;
        } else if (!isLoadMode) {
            this.mode = cachedMode; 
        }

        if (typeof this.#ui !== 'undefined' && this.#ui) {
            this.#ui.selectedSq = null;
            this.#ui.legalMoves = [];
            this.#ui.lastMove = null;
            this.#ui.renderBoard(false); 
            if (typeof this.#ui.updateHistory === 'function') this.#ui.updateHistory();
            if (typeof this.#ui.updateClocks === 'function') this.#ui.updateClocks();
            if (typeof this.#ui.updateEvalBar === 'function') this.#ui.updateEvalBar('cp', 0);
        }

        console.log(`✅ FEN Loaded: ${this.#engine.fen()}`);
        return true;
    }
loadNewPosition(fen, explicitMode = null) {
        if (!fen) return;
        let targetMode = explicitMode || this.gameMode || 'classical';
        if (typeof this.#engine.setGameMode === 'function') this.#engine.setGameMode(targetMode);
        this.gameMode = targetMode;

        const validation = this.#engine.validate_fen(fen);
        if (!validation.valid) {
            if (this.#ui) this.#ui.showNotification("Invalid FEN for " + targetMode + ": " + validation.error, "Error", "⚠️");
            this.#emit('soundTriggered', { type: 'error' });
            return; 
        }

        this.rootNode = new MoveNode(fen, null);
        this.currentNode = this.rootNode;
        this.pgnHeaders = { "FEN": fen, "SetUp": "1", "Variant": targetMode };
        this.loadFEN(fen, targetMode);

        let qualifiedFen = typeof this.#engine.fen === 'function' ? this.#engine.fen() : fen;
        this.rootNode = new MoveNode(qualifiedFen, null);
        this.currentNode = this.rootNode;
        this.pgnHeaders = { "FEN": qualifiedFen, "SetUp": "1", "Variant": targetMode };
        
        const fenBox = document.getElementById('fenInput');
        if (fenBox) fenBox.value = qualifiedFen;
        
        if (this.#ui) {
            this.#ui.renderBoard(false);
            this.#ui.displayMetadata(this.pgnHeaders);
            if (typeof this.#ui.updateHistory === 'function') this.#ui.updateHistory(true);
        }

        if (typeof this.#syncMoveHistory === 'function') this.#syncMoveHistory();
        else if (typeof this.#syncMoveHistory === 'function') this.#syncMoveHistory();

        // Lock FEN into Analysis Memory so it isn't overwritten by Study Tabs!
        if (this.mode !== 'study' && this.mode !== 'puzzle') {
            this.mode = 'analysis';
            this.gameOver = false;
            if (typeof this.#saveState === 'function') this.#saveState('analysis');
        }
    }
generateFEN() {
return this.#engine.fen();
}
getCurrentOpening() {
        if (typeof OPENING_BOOK_ECO === 'undefined') return null;
        let tempNode = this.currentNode;
        
        while (tempNode) {
            if (tempNode.fen) {
                const parts = tempNode.fen.split(' ');
                
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
const fromIdx = this.#squareToIndex(from);
const toIdx = this.#squareToIndex(to);
this.makeMove({
from:fromIdx,
to:toIdx
}, promotion);
this.#ui.renderBoard(true);
this.#ui.updateHistory();
this.#ui.renderArrows();
}
resetGame(clear = false, startFen = null) {
        if (clear) {
            this.#board = Array(64).fill(null);
            this.turn ='w';
            if (typeof this.#ui !=='undefined') this.#ui.renderBoard(false);
            return;
        }

        if (!startFen) {
            startFen = (typeof VARIANT_STARTING_FENS !== 'undefined' && VARIANT_STARTING_FENS[this.gameMode]) ? VARIANT_STARTING_FENS[this.gameMode] : INITIAL_FEN;
            if (this.gameMode === 'chess960' && typeof this.generateChess960FEN === 'function') {
                startFen = this.generateChess960FEN();
            }
        }

        this.whiteTime = this.whiteStartSeconds;
        this.blackTime = this.blackStartSeconds;
        this.rootNode = new MoveNode(startFen, null);
        this.currentNode = this.rootNode;
        this.loadFEN(startFen);
        this.gameOver = false;

        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
        this.pgnHeaders = {
            'Event': 'Casual Game',
            'Site': 'Local',
            'Date': dateStr,
            'Variant': this.gameMode === 'classical' ? 'Standard' : this.gameMode,
            'FEN': startFen,
            'SetUp': startFen !== INITIAL_FEN ? "1" : "0"
        };
        
        if (!this.isPlayingLiveGame && this.mode !== 'puzzle') {
            this.mode = 'analysis';
        }

        clearInterval(this.#timerInterval);
        if (typeof this.#ui !=='undefined') {
            this.#ui.renderBoard(false);
            this.#ui.updateClocks();
            this.#ui.updateHistory();
            this.#ui.renderArrows();
            
            if (this.#ui.toggleReviewButton) this.#ui.toggleReviewButton(false);
        }
    }
startAnalysisMode() {
        // 1. Stop any active game timers and engines
        this.gameOver = true;
        if (this.#timerInterval) clearInterval(this.#timerInterval);
        if (window.sfWorker) window.sfWorker.postMessage('stop');

        // 2. Ensure the PGN headers have a result
        if (!this.pgnHeaders['Result']) {
            this.pgnHeaders['Result'] = '*';
        }

        // 🔥 THE ISOLATION FIX: Prevent Puzzles and Studies from bleeding into Analysis!
        // Only overwrite the Analysis memory slot if we are converting a Live Game or Editor board.
        if (this.mode === 'local' || this.mode === 'bot' || this.mode === 'editor') {
            if (typeof this.#saveState === 'function') {
                this.#saveState('analysis');
            }
        }

        // 3. Switch to the Analysis Tab
        if (this.#ui && typeof this.#ui.switchTab === 'function') {
            this.#ui.switchTab('analysis');
        }

        // 4. Force the board to the final move ONLY if coming from a live game
        if (this.mode === 'local' || this.mode === 'bot') {
            this.goToEnd();
        }

        // 5. Hide the Game Over screen
        if (this.#ui) {
            const modal = document.getElementById('gameOverModal');
            if (modal) modal.style.display = 'none';

            // Force one final UI refresh to guarantee the PGN box populates
            if (typeof this.#ui.updateHistory === 'function') this.#ui.updateHistory(true);
            if (typeof this.#ui.renderBoard === 'function') this.#ui.renderBoard(true);
        }
    }
loadPGNFile(input) {
const file = input.files[0];
if (!file) return;
const reader = new FileReader();
reader.onload = (e) => {
const pgnText = e.target.result;
document.getElementById('editorPgnInput').value = pgnText;
this.#ui.switchTab('editor');
this.#ui.loadPgnAndAnalyze();
};
reader.readAsText(file);
input.value ='';
}
newGame(startFen = null) {
        if (!startFen) {
            startFen = (typeof VARIANT_STARTING_FENS !== 'undefined' && VARIANT_STARTING_FENS[this.gameMode]) ? VARIANT_STARTING_FENS[this.gameMode] : INITIAL_FEN;
            if (this.gameMode === 'chess960' && typeof this.generateChess960FEN === 'function') {
                startFen = this.generateChess960FEN();
            }
        }

        this.isPaused = false;
        this.gameOver = false;
        this.updateSettingsTime();
        this.whiteTime = this.whiteStartSeconds;
        this.blackTime = this.blackStartSeconds;
        this.resetGame(false, startFen); 
        this.#startTimer();
        if (typeof this.#ui !=='undefined') {
            this.#ui.updateClocks();
            const btn = document.getElementById('pauseBtn');
            if (btn) btn.innerText ="⏸";
            
            if (this.#ui.toggleReviewButton) this.#ui.toggleReviewButton(false);
        }
    this.#emit('soundTriggered', { type: 'start' });
    }
togglePause() {
        this.isPaused = !this.isPaused;
        
        if (this.isPaused) {
            // STOP: Disable interaction
            if (this.#ui) {
                this.#ui.updateStatus("Game Paused ⏸️");
                // Optional: visual cue
                document.getElementById('chessBoard').style.opacity = '0.7';
            }
            if (window.sfWorker) window.sfWorker.postMessage('stop');
        } else {
            // RESUME
            if (this.#ui) {
                this.#ui.updateStatus("Game Resumed ▶️");
                document.getElementById('chessBoard').style.opacity = '1';
            }
            // If it was a bot turn, re-trigger
            if (this.mode === 'human_vs_bot' && this.turn === this.botColor) {
                this.#triggerBotMove();
            }
        }
    }
deleteNode(nodeId) {
    const node = this.#findNodeById(this.rootNode, nodeId);
    // 1. Prevent deleting the root or a non-existent node
    if (!node || !node.parent) return false;
    
    const p = node.parent;
    const idx = p.children.indexOf(node);
    if (idx === -1) return false;

    // 2. ABSOLUTE DELETE: Remove the move and all its descendants from the parent
    p.children.splice(idx, 1);
    
    // Reset the parent's selected index if it was pointing to the deleted move
    if (p.selectedChildIndex >= p.children.length) {
        p.selectedChildIndex = Math.max(0, p.children.length - 1);
    }

    // 3. INSTANT VIEW UPDATE:
    // If we are currently viewing the move we just deleted (or something further down that branch)
    // we MUST snap the engine and board back to the parent instantly.
    if (this.currentNode && (this.currentNode.id === nodeId || this.#isDescendant(node, this.currentNode))) {
        // This handles engine.load(p.fen) and UI.renderBoard() internally
        this.goToNodeId(p.id); 
    } else {
        // If we were viewing a different branch, just sync the PGN text
        if (typeof this.#syncMoveHistory === 'function') {
            this.#syncMoveHistory();
        }
    }

    // 4. Force the UI move list to redraw immediately
    if (typeof window !== 'undefined' && this.#ui && typeof this.#ui.updateHistory === 'function') {
        this.#ui.updateHistory(true);
        // Ensure the board is rendered to the parent position
        if (typeof this.#ui.renderBoard === 'function') {
            this.#ui.renderBoard(); 
        }
    }
    
    // 5. Persist changes
    if (this.mode === 'study') this.saveActiveChapter();
    else if (this.mode === 'analysis') this.#saveState('analysis');
    
    return true;
}
promoteVariation(nodeId) {
        const node = this.#findNodeById(this.rootNode, nodeId);
        if (!node || !node.parent) return false;
        const p = node.parent;
        const idx = p.children.indexOf(node);
        if (idx > 0) {
            const temp = p.children[idx - 1];
            p.children[idx - 1] = node;
            p.children[idx] = temp;
            p.selectedChildIndex = idx - 1;
            if (typeof this.#syncMoveHistory === 'function') this.#syncMoveHistory(); 
            
            // 🔥 THE FIX: Save to Study if in study mode!
            if (this.mode === 'study') this.saveActiveChapter();
            else if (this.mode === 'analysis') this.#saveState('analysis');
            
            return true;
        }
        return false;
    }
makeMainline(nodeId) {
        const node = this.#findNodeById(this.rootNode, nodeId);
        if (!node || !node.parent) return false;
        let curr = node;
        while (curr.parent) {
            const p = curr.parent;
            const idx = p.children.indexOf(curr);
            if (idx > 0) { p.children.splice(idx, 1); p.children.unshift(curr); }
            p.selectedChildIndex = 0;
            curr = p;
        }
        if (typeof this.#syncMoveHistory === 'function') this.#syncMoveHistory(); 
        
        // 🔥 THE FIX: Save to Study if in study mode!
        if (this.mode === 'study') this.saveActiveChapter();
        else if (this.mode === 'analysis') this.#saveState('analysis');
        
        return true;
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

        const localSquareToIndex = (sq) => {
            if (!sq || sq.length < 2) return -1;
            const file = sq.charCodeAt(0) - 97; // 'a'=>0
            const rank = parseInt(sq[1], 10);   // '1'=>1

            if (isNaN(rank)) return -1;

            const row = 8 - rank; 
            if (file < 0 || file > 7 || row < 0 || row > 7) return -1;
            return row * 8 + file;
        };

        const getColorName = (code) => {
            if (code === 'R') return 'red';
            if (code === 'B') return 'blue';
            if (code === 'Y' || code === 'O') return 'orange';
            return 'green'; 
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

                        const fromIdx = localSquareToIndex(fromSq);
                        const toIdx = localSquareToIndex(toSq);

                        if (fromIdx !== -1 && toIdx !== -1) {
                            node.arrows.push({ from: fromIdx, to: toIdx, color: getColorName(colorCode) });
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
                        const idx = localSquareToIndex(sq);

                        if (idx !== -1) {
                            node.circles.push({ sq: idx, color: getColorName(colorCode) });
                        }
                    }
                });
            });
        }

        if (typeof this.#ui !== 'undefined' && this.#ui.renderArrows) {
            this.#ui.renderArrows();
        }
    }
loadPGN(pgn, isFromEditor = false, isInternalLoad = false) {
        if (typeof pgn === 'string' && !isInternalLoad) {
            let detectedMode = 'classical';
            const variantMatch = pgn.match(/\[Variant\s+"([^"]+)"\]/i);
            const ruleVariantMatch = pgn.match(/\[RuleVariants\s+"([^"]+)"\]/i);
            
            if (variantMatch && variantMatch[1]) {
                const rawVariant = variantMatch[1].toLowerCase().replace(/[-_ ]/g, ''); 
                const modeMap = {
                    'standard': 'classical', 'classical': 'classical',
                    'chess960': 'chess960', 'fischerandom': 'chess960',
                    '3check': '3check', 'threecheck': '3check',
                    'antichess': 'antichess', 'giveaway': 'antichess', 'losers': 'antichess',
                    'atomic': 'atomic', 'horde': 'horde', 'kingofthehill': 'kingofthehill', 
                    'koth': 'kingofthehill', 'racingkings': 'racingkings', 'crazyhouse': 'crazyhouse',
                    'bughouse': 'bughouse', 'duck': 'duck', 'duckchess': 'duck', 'chaturanga': 'chaturanga',
                    'placement': 'placement', 'alice': 'alice', 'alicechess': 'alice',
                    'spell': 'spell', 'spellchess': 'spell' 
                };
                if (modeMap[rawVariant]) detectedMode = modeMap[rawVariant];
            }

            // ✨ FIX 1: Detect Chess.com 4PC sub-variants (Chess960 & Spell)
            if (ruleVariantMatch && ruleVariantMatch[1]) {
                const rules = ruleVariantMatch[1].toLowerCase();
                if (rules.includes('chess960')) detectedMode = 'chess960';
                if (rules.includes('spell')) detectedMode = 'spell';
            }
            
            if (this.gameMode !== detectedMode) {
                this.setGameMode(detectedMode, false, true); 
                
                if (typeof document !== 'undefined') {
                    const variantSelect = document.getElementById('analysisVariantSelect');
                    if (variantSelect) variantSelect.value = detectedMode;
                }
            }
        }

        this.isLoadingPGN = true;
        const timerId = `PGN_Load_${Date.now()}`;
        console.time(timerId);

        if (window.sfWorker) window.sfWorker.postMessage('stop');

        const backups = { ui: {}, game: {}, console: {} };
        const silence = (obj, method, storage) => {
            if (obj && typeof obj[method] === 'function') {
                storage[method] = obj[method];
                obj[method] = () => {};
            }
        };
        if (this.#ui) {
            ['updateHistory', 'renderBoard', 'renderArrows', 'renderHeaders', 'highlightLastMove', 'updateClocks', 'updateStatus', 'scrollToActiveMove', 'showNotification', 'updatePuzzleStats', 'updatePlayerNames', 'displayMetadata','renderCharts'].forEach(m => silence(this.#ui, m, backups.ui));
        }
        ['updateStockfish', 'triggerMoveSound', 'checkGameState', 'onMove', 'attemptPremove', 'saveToLocalStorage'].forEach(m => silence(this, m, backups.game));
        ['log', 'info', 'warn', 'debug'].forEach(m => silence(console, m, backups.console));

        try {
            this.moveList = [];
            this.history = [];
            this.fens = [];
            this.pgnHeaders = {};

            this.#engine = new (typeof Chess === 'function' ? Chess : window.Chess)();
            this.#board = Array(64).fill(null);

            const headerRegex = /\[([A-Za-z0-9_]+)\s+"([^"]*)"\]/g;
            let match;
            while ((match = headerRegex.exec(pgn)) !== null) {
                this.pgnHeaders[match[1]] = match[2];
            }

            // ✨ FIX 2: Translate the massive 14x14 "StartFen4" into a perfect 8x8 FEN!
            if (this.pgnHeaders['StartFen4']) {
                let boardStr = this.pgnHeaders['StartFen4'].split('- ').pop();
                let rows = boardStr.split('/');
                let fenRows = [];
                for (let r of rows) {
                    let cells = r.trim().split(',');
                    if (cells.every(c => c === 'x')) continue; // Skip invisible top/bottom walls
                    let validCells = cells.filter(c => c !== 'x'); // Strip side walls
                    if (validCells.length === 0) continue;
                    
                    let fenRow = '';
                    let emptyCount = 0;
                    for (let c of validCells) {
                        if (!isNaN(c)) {
                            emptyCount += parseInt(c, 10);
                        } else if (c.length === 2) {
                            if (emptyCount > 0) { fenRow += emptyCount; emptyCount = 0; }
                            let color = c[0]; 
                            let piece = c[1]; 
                            // Yellow = Black, Red = White
                            fenRow += color === 'y' ? piece.toLowerCase() : piece.toUpperCase();
                        } else {
                            if (emptyCount > 0) { fenRow += emptyCount; emptyCount = 0; }
                            fenRow += c; 
                        }
                    }
                    if (emptyCount > 0) { fenRow += emptyCount; }
                    fenRows.push(fenRow);
                }
                this.pgnHeaders['FEN'] = fenRows.join('/') + " w KQkq - 0 1";
            }

            if (isInternalLoad) {
                this.pgnHeaders['Variant'] = this.gameMode === 'classical' ? 'Standard' : this.gameMode;
            }

            let moveTextRaw = pgn.replace(/\[[A-Za-z0-9_]+\s+"[^"]*"\]/g, '').trim();

            // ✨ FIX 3: Translate 14x14 PGN coordinates (f5-f7) back to 8x8 coordinates (c2c4)!
            if (this.pgnHeaders['StartFen4'] || this.gameMode === 'spell') {
                const to8x8 = (coord) => {
                    if (!coord || coord.length < 2) return coord;
                    let f = String.fromCharCode(coord.charCodeAt(0) - 3); 
                    let r = parseInt(coord.slice(1), 10) - 3;             
                    return f + r;
                };

                let tokens = moveTextRaw.split(/\s+/);
                let newTokens = [];

                for (let i = 0; i < tokens.length; i++) {
                    let t = tokens[i];
                    if (t.includes('.') || t === '..' || t.match(/^(1-0|0-1|1\/2-1\/2|\*)$/)) {
                        newTokens.push(t); continue; 
                    }

                    let spellMatch = t.match(/^(freeze|jump)@([a-n]\d+)&(.*)$/);
                    let moveStr = t;
                    
                    if (spellMatch) {
                        // Extract the spell into a distinct pseudo-move before the actual move!
                        newTokens.push(`S${spellMatch[1]}@${to8x8(spellMatch[2])}`); 
                        moveStr = spellMatch[3];
                    }

                    // Translate formats like Qg4xg7, Nh4xNg6, Kj4-k4, Be4-d5
                    let ccMatch = moveStr.match(/^([A-Z]?)([a-n]\d+)[-x]([A-Z]?)([a-n]\d+)(=[A-Za-z])?([+#]?)$/);
                    if (ccMatch) {
                        // Engine loves strict algebraic pairs (e.g. c2c4) so we skip the piece letters
                        newTokens.push(to8x8(ccMatch[2]) + to8x8(ccMatch[4]) + (ccMatch[5] ? ccMatch[5].replace('=', '').toLowerCase() : ''));
                    } else {
                        // Fallback perfectly preserves things like standard O-O castling!
                        newTokens.push(moveStr); 
                    }
                }
                
                moveTextRaw = newTokens.join(' ');
            }

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

            let startFen = this.pgnHeaders['FEN'];
            if (!startFen) {
                startFen = (typeof VARIANT_STARTING_FENS !== 'undefined' && VARIANT_STARTING_FENS[this.gameMode]) 
                    ? VARIANT_STARTING_FENS[this.gameMode] 
                    : INITIAL_FEN;
                    
                if (this.gameMode === 'chess960' && typeof this.generateChess960FEN === 'function') {
                    startFen = this.generateChess960FEN();
                }
            }

            this.rootNode = new MoveNode(startFen, null);
            this.rootNode.clock = { w: initialTime, b: initialTime };

            this.currentNode = this.rootNode;
            this.loadFEN(this.rootNode.fen, this.gameMode, true);

            const wName = (this.pgnHeaders['White'] || "").toLowerCase();
            const bName = (this.pgnHeaders['Black'] || "").toLowerCase();
            const event = (this.pgnHeaders['Event'] || "").toLowerCase();
            const keywords = ['stockfish', 'torch', 'leela', 'lc0', 'komodo', 'houdini', 'rybka', 'akimbo', 'minic', 'berserk', 'ethereal', 'koivisto', 'seer', 'slowchess', 'computer', 'engine', 'bot', 'ai', 'ccc', 'tcec', 'tcc'];
            let isEng = keywords.some(k => (wName.includes(k) && bName.includes(k)) || event.includes(k));

            if (!isEng) {
                const pvMatch = moveTextRaw.match(/pv\s*=|pv\s+[a-h][1-8]/i);
                if (pvMatch) isEng = true;
            }
            this.isEngineMatch = isEng;

            let tokens = [];
            let len = moveTextRaw.length;
            let i = 0;
            let code, start;
            while (i < len) {
                code = moveTextRaw.charCodeAt(i);
                if (code <= 32) { i++; continue; }
                if (code === 123) { 
                    start = i; while (i < len && moveTextRaw.charCodeAt(i) !== 125) i++;
                    tokens.push(moveTextRaw.substring(start, i + 1)); i++; continue;
                }
                
                if (code === 36) { 
                    start = i; 
                    while (i < len) {
                        let c = moveTextRaw.charCodeAt(i);
                        if (c <= 32 || c === 125 || c === 41 || c === 40) break;
                        i++;
                    }
                    tokens.push(moveTextRaw.substring(start, i)); 
                    continue;
                }
                
                if (code === 40 || code === 41) { 
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

            const originalMakeMove = this.makeMove.bind(this);
            this.makeMove = (move, promo, batchMode, pgnText, muteEngine, isAutoReply) => {
                // Ignore whatever the token parser requests, force Batch = true, Mute = true!
                return originalMakeMove(move, promo, true, pgnText, true, true);
            };

            // Run the heavy parser
            if (typeof this.#parsePGNTokens === 'function') this.#parsePGNTokens(tokens, 0);

            // ✨ Restore normal functionality immediately after it finishes
            this.makeMove = originalMakeMove;
            
        } catch (e) {
            backups.console.error("PGN Parsing Error:", e);
        }
        finally {
            this.isLoadingPGN = false;
            this.clearPremoves();
            this.premoveQueue = []; 
            
            // 🔥 THE FIX: Prevent the PGN loader from blindly forcing the game back into Analysis!
            if (this.mode !== 'study' && this.mode !== 'editor' && this.mode !== 'puzzle') {
                this.mode = 'analysis'; 
                this.gameOver = false;
                if (typeof this.saveState === 'function') this.saveState('analysis'); 
                else if (typeof this.#saveState === 'function') this.#saveState('analysis');
            }
            
            this.isPaused = false; 
            this.pgn = "";
            if (this.#ui && this.#ui.togglePgnEditing) this.#ui.togglePgnEditing(true);
            if (this.#ui && this.#ui.toggleReviewButton) this.#ui.toggleReviewButton(true);
            
            Object.keys(backups.console).forEach(m => console[m] = backups.console[m]);
            Object.keys(backups.game).forEach(m => this[m] = backups.game[m]);

            if (typeof this.syncMoveHistory === 'function') this.syncMoveHistory();
            else if (typeof this.#syncMoveHistory === 'function') this.#syncMoveHistory();

            if (this.#ui) {
                Object.keys(backups.ui).forEach(m => this.#ui[m] = backups.ui[m]);
                try {
                    if (this.currentNode) {
                        if (typeof this.reconcileBoardIds === 'function') this.reconcileBoardIds(this.currentNode.fen, this.currentNode.lastMove);
                        else this.#reconcileBoardIds(this.currentNode.fen, this.currentNode.lastMove);
                        
                        if (this.currentNode.clock) {
                            this.whiteTime = this.currentNode.clock.w;
                            this.blackTime = this.currentNode.clock.b;
                            this.currentWTime = this.currentNode.clock.w;
                            this.currentBTime = this.currentNode.clock.b;
                        }

                        if (this.#ui.moveListContainer) this.#ui.moveListContainer.innerHTML = '';
                        if (this.#ui.updateClocks) this.#ui.updateClocks();
                        
                        const wLabel = (this.pgnHeaders['White'] || 'White') + (this.pgnHeaders['WhiteElo'] ? ` (${this.pgnHeaders['WhiteElo']})` : '');
                        const bLabel = (this.pgnHeaders['Black'] || 'Black') + (this.pgnHeaders['BlackElo'] ? ` (${this.pgnHeaders['BlackElo']})` : '');
                        if (this.#ui.updatePgnAvatars) this.#ui.updatePgnAvatars(this.pgnHeaders['White'], this.pgnHeaders['Black'], this.isEngineMatch, true);
                        
                        if (this.#ui.flipped) this.#ui.updatePlayerNames(wLabel, bLabel);
                        else this.#ui.updatePlayerNames(bLabel, wLabel);

                        this.#ui.displayMetadata(this.pgnHeaders);
                        
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
                        this.#ui.playerInfo = this.#ui.playerInfo || { w: {}, b: {} };

                        this.#ui.playerInfo['w'].country = chesscomCountryMap[this.pgnHeaders['WhiteCountry']] || null;
                        this.#ui.playerInfo['b'].country = chesscomCountryMap[this.pgnHeaders['BlackCountry']] || null;
                        this.#ui.playerInfo['w'].title = this.pgnHeaders['WhiteTitle'] || null;
                        this.#ui.playerInfo['b'].title = this.pgnHeaders['BlackTitle'] || null;
                        
                        const fetchMissingFlag = async (username, color) => {
                            if (!username || this.isEngineMatch) return;
                            try {
                                const res = await fetch(`https://api.chess.com/pub/player/${username}`);
                                if (!res.ok) return;
                                const data = await res.json();
                                if (data.country) {
                                    const isoCode = data.country.split('/').pop().toLowerCase();
                                    this.#ui.playerInfo[color].country = isoCode;
                                    this.#ui.renderHeaders(); 
                                }
                            } catch (e) { }
                        };

                        if (!this.#ui.playerInfo['w'].country && this.pgnHeaders['WhiteCountry']) {
                            fetchMissingFlag(this.pgnHeaders['White'], 'w');
                        }
                        if (!this.#ui.playerInfo['b'].country && this.pgnHeaders['BlackCountry']) {
                            fetchMissingFlag(this.pgnHeaders['Black'], 'b');
                        }
                        
                        this.currentNode = this.rootNode;
                        
                        this.loadFEN(this.rootNode.fen);
                        
                        this.#ui.updateHistory();
                        this.#ui.renderBoard(true);
                        this.#ui.renderArrows();
                        this.#ui.renderHeaders();
                        requestAnimationFrame(() => {this.#ui.renderCharts();});
                    }
                } catch (err) {
                    console.warn("UI refresh warning:", err);
                }
            }
            console.timeEnd(timerId);
        }
}
getNagInfo(nag) {
        if (!nag) return null;
        let nags = nag.toString().split(',').map(n => n.trim().replace('$', ''));
        
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
generatePGN(format = 'both') {
        let pgn = "";
        
        for (let key in this.pgnHeaders) {
            pgn += `[${key} "${this.pgnHeaders[key]}"]\n`;
        }
        pgn += "\n";

        // Route EVERYTHING through the recursive function, passing the format down!
        pgn += this.#generatePGNRecursive(this.rootNode, 1, false, format);
        
        pgn = pgn.trim().replace(/\s+/g, ' ');
        let result = this.pgnHeaders['Result'] || '*';
        if (!pgn.endsWith(result)) pgn += " " + result;

        return pgn;
    }
exportPGN() {
        const formatMenu = document.getElementById('pgnFormatSelect');
        const exportFormat = formatMenu ? formatMenu.value : 'both';
        
        const pgnData = this.generatePGN(exportFormat); 
        if (!pgnData) {
            this.#ui.showNotification("No PGN data to export.","Export Failed","⚠️");
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
        if (typeof this.#ui !== 'undefined') this.#ui.renderBoard(false);
        this.#emit('soundTriggered', { type: 'premove' });
    }
clearPremoves() {
this.premoveQueue = [];
if (typeof this.#ui !=='undefined') this.#ui.renderBoard(false);
}
attemptPremove() {
        if (this.premoveQueue.length === 0 || this.gameOver || this.isAnalysisMode) return;
        const move = this.premoveQueue[0];
        
        if (this.turn !== move.color) return; 

        // 1. Initial quick check to see if the piece is still there
        const actualPiece = this.#board[move.from];
        if (!actualPiece || actualPiece.color !== move.color || actualPiece.type !== move.piece) {
            this.clearPremoves();
            if (typeof this.#ui !== 'undefined') this.#ui.renderBoard(true);
            return;
        }

        const legalMoves = this.#engine.moves({ verbose: true });
        const isLegal = legalMoves.some(m => 
            this.#squareToIndex(m.from) === move.from && 
            this.#squareToIndex(m.to) === move.to
        );

        if (!isLegal) {
            // Premove is illegal (e.g. king is in check, or piece is pinned)
            this.clearPremoves();
            if (typeof this.#ui !== 'undefined') this.#ui.renderBoard(true);
            return;
        }

        const result = this.makeMove(move, move.promotion || 'q', false, null, true);

        if (result) {
            this.premoveQueue.shift();
            // Automatically attempt the next queued multi-premove
            setTimeout(() => this.attemptPremove(), 50);
            if (typeof this.#ui !== 'undefined') this.#ui.renderBoard(true);
        } else {
            this.clearPremoves();
            if (typeof this.#ui !== 'undefined') this.#ui.renderBoard(true);
        }
    }
rematch() {
        if (typeof this.#ui !== 'undefined') {
            this.#ui.hideGameOver();
            this.#ui.switchTab('play'); 
        }

        if (typeof this.#syncMoveHistory === 'function') this.#syncMoveHistory();
        if (typeof this.#saveState === 'function') this.#saveState(this.mode);

        let startFen = (typeof VARIANT_STARTING_FENS !== 'undefined' && VARIANT_STARTING_FENS[this.gameMode]) ? VARIANT_STARTING_FENS[this.gameMode] : INITIAL_FEN;
        if (this.gameMode === 'chess960' && typeof this.generateChess960FEN === 'function') {
            startFen = this.generateChess960FEN();
        }

        if (this.mode === 'bot' || this.botColor !== null) {
            const nextUserColor = this.botColor || 'w'; 
            
            if (this.gameMode === 'chess960') {
                this.startChess960Game('bot', this.botLevel, nextUserColor);
            } else {
                this.startBotGame(this.botLevel, nextUserColor, startFen);
            }
        } else {
            if (this.gameMode === 'chess960') {
                this.startChess960Game('local');
            } else {
                this.startLocalGame(startFen);
            }
        }

        if (typeof this.#syncMoveHistory === 'function') {
            this.#syncMoveHistory();
        }
        
        if (typeof this.#ui !== 'undefined' && typeof this.#ui.updateHistory === 'function') {
            this.#ui.updateHistory(true);
        }
    }
offerDraw() {
        if (this.gameOver) return;

        // 1. Check if the rules of chess strictly mandate a draw
        if (this.#engine.in_threefold_repetition && this.#engine.in_threefold_repetition()) {
            this.#endGame("½-½", "Draw by Repetition");
            return;
        }
        if (this.#engine.half_moves && this.#engine.half_moves() >= 100) {
            this.#endGame("½-½", "Draw by 50-Move Rule");
            return;
        }
        if (this.#engine.insufficient_material && this.#engine.insufficient_material()) {
            this.#endGame("½-½", "Draw by Insufficient Material");
            return;
        }

        // 2. Ask the opponent (Bot or Local)
        if (this.mode === 'bot') {
            const currentEval = this.currentNode.evalScore || 0;
            if (Math.abs(currentEval) ===0) {
                this.#endGame("½-½", "Draw by Agreement");
                if (this.#ui) this.#ui.showNotification("Draw Accepted", "Engine accepted your draw offer.", "🤝");
            } else {
                if (this.#ui) this.#ui.showNotification("Draw Declined", "Engine declined your draw offer.", "❌");
                this.#emit('soundTriggered', { type: 'decline' });
            }
        } else if (this.mode === 'local') {
            this.#endGame("½-½", "Draw by Agreement");
        }
    }
resign() {
        if (this.gameOver || !this.isPlayingLiveGame) return;
        
        if (window.sfWorker && !window.engineAnalysing) window.sfWorker.postMessage('stop');
        
        const isWhiteResigning = this.turn === 'w';
        const resultStr = isWhiteResigning ? "0-1" : "1-0";
        const winnerName = isWhiteResigning ? "Black" : "White";
        
        // 1. Officially end the game and lock in the PGN result
        this.#endGame(resultStr, `${winnerName} wins by resignation`);
        
        // 2. Trigger your custom UI popup
        if (this.#ui && typeof this.#ui.showGameOver === 'function') {
            this.#ui.showGameOver(winnerName, "by resignation");
        }
    }
makeMove(move, promo, batchMode, pgnText, muteEngine = false, isAutoReply = false) {
        if (this.#engine && this.#engine.game_over()) return null;
        const ui = (typeof window !== 'undefined' && this.#ui) ? this.#ui : null;
        
        // ✨ STRING INTERCEPT: Automatically converts PGN strings (from loadPGN) into magic!
        if (typeof move === 'string' && move.includes('@') && this.gameMode === 'spell') {
            const isFreeze = move.startsWith('Fz');
            const targetStr = move.split('@')[1];
            const targetSq = (8 - parseInt(targetStr[1])) * 8 + (targetStr.charCodeAt(0) - 97);
            move = { isSpell: true, spellType: isFreeze ? 'freeze' : 'jump', target: targetSq };
        }
        
        if (!this.isChess960 && move && move.from !== undefined && move.to !== undefined && !move.isSpell && this.#engine) {
            const fromStr = typeof move.from === 'number' && this.#indexToSquare ? this.#indexToSquare(move.from) : move.from;
            const toStr = typeof move.to === 'number' && this.#indexToSquare ? this.#indexToSquare(move.to) : move.to;

            if (fromStr && toStr && fromStr !== '@') {
                const srcPiece = this.#engine.get(fromStr);
                const tgtPiece = this.#engine.get(toStr);
                const currTurn = this.#engine.turn();
                
                if (srcPiece && tgtPiece && srcPiece.type === 'k' && tgtPiece.type === 'r' && srcPiece.color === currTurn && tgtPiece.color === currTurn) {
                    const legalMoves = this.#engine.moves({ verbose: true });
                    const fromFile = fromStr.charCodeAt(0);
                    const toFile = toStr.charCodeAt(0);
                    
                    const castleMove = legalMoves.find(m => 
                        m.from === fromStr && 
                        ((toFile > fromFile && m.flags.includes('k')) || (toFile < fromFile && m.flags.includes('q')))
                    );
                    
                    if (castleMove) {
                        move.to = typeof move.to === 'number' ? this.#squareToIndex(castleMove.to) : castleMove.to;
                    }
                }
            }
        }

        const promotion = (promo && promo.length === 1) ? promo.toLowerCase() : undefined;

         if (batchMode) {
            const batchObj = {};
            if (move.isSpell) {
                batchObj.isSpell = true; 
                batchObj.spellType = move.spellType; 
                batchObj.target = typeof move.target === 'number' ? this.#indexToSquare(move.target) : move.target;
            } else if (move.from === '@' || move.drop) {
                batchObj.from = '@';
                batchObj.drop = move.drop || move.piece;
                batchObj.to = typeof move.to === 'number' ? this.#indexToSquare(move.to) : move.to;
            } else {
                batchObj.from = typeof move.from === 'number' ? this.#indexToSquare(move.from) : move.from;
                batchObj.to = typeof move.to === 'number' ? this.#indexToSquare(move.to) : move.to;
            }
            batchObj.promotion = promotion || 'q';
            if (move.duck_sq !== undefined) {
                batchObj.duck_sq = typeof move.duck_sq === 'number' ? this.#indexToSquare(move.duck_sq) : move.duck_sq;
            }

            const result = this.#engine.move(batchObj);
            if (!result) return null;
            const newFen = this.#engine.fen();
            this.#reconcileBoardIds(newFen, move);
            
            this.#addMoveToTree(newFen, pgnText || result.san, move.to, {
                from: move.from, to: move.to, flags: result.flags, color: result.color
            }, false);
            
            this.turn = this.#engine.turn();
            return result;
        }

        if (this.isPlayingLiveGame && !this.#timerInterval) {
            this.#startTimer();
        }

        const moveObj = {};
        if (move.isSpell) {
            moveObj.isSpell = true; 
            moveObj.spellType = move.spellType; 
            moveObj.target = typeof move.target === 'number' ? this.#indexToSquare(move.target) : move.target;
        } else if (move.from === '@' || move.drop) {
            moveObj.from = '@';
            moveObj.drop = move.drop || move.piece;
            moveObj.to = typeof move.to === 'number' ? this.#indexToSquare(move.to) : move.to;
        } else {
            moveObj.from = typeof move.from === 'number' ? this.#indexToSquare(move.from) : move.from;
            moveObj.to = typeof move.to === 'number' ? this.#indexToSquare(move.to) : move.to;
        }
        if (promotion) moveObj.promotion = promotion;
        if (move.duck_sq !== undefined) {
            moveObj.duck_sq = typeof move.duck_sq === 'number' ? this.#indexToSquare(move.duck_sq) : move.duck_sq;
        }

        const result = this.#engine.move(moveObj);
        if (!result) return null;

        let soundFired = false;
        const fireSound = () => {
            if (!soundFired && !muteEngine && !isAutoReply) {
                this.triggerMoveSound(result);
                soundFired = true;
            }
        };

        const newFen = this.#engine.fen();
        const nextTurn = this.#engine.turn(); 

        // --- PUZZLE LOGIC ---
        if (this.mode === 'puzzle') {
            const userStr = (result.from + result.to + (result.promotion || '')).toLowerCase();
            const solStr = (this.puzzleSolution[this.puzzleCursor] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            
            if (userStr !== solStr && !this.#engine.in_checkmate()) {
                result.puzzleStatus = 'wrong'; 
                fireSound(); 
                
                this.#engine.undo();
                this.#reconcileBoardIds(this.#engine.fen());
                if (this.#ui) ui.renderBoard(false);
                this.#puzzleFail();
                return null; 
            }
            
            if (this.#engine.in_checkmate() || (this.puzzleCursor >= this.puzzleSolution.length - 1)) {
                result.puzzleStatus = 'solved';
                if (window.sfWorker) window.sfWorker.postMessage('stop');
                this.#puzzleSuccess();
            } else {
                result.puzzleStatus = 'correct';
                this.puzzleCursor++;
            }
        }

        const now = Date.now();
        const timeSpent = Math.max(0, (now - (this.lastMoveTime || now)) / 1000);
        this.lastMoveTime = now;

        this.#reconcileBoardIds(newFen, move);

        const moveData = { 
            from: move.from !== undefined ? move.from : '@', 
            to: move.to !== undefined ? move.to : move.target, 
            flags: result.flags, 
            color: result.color 
        };
        this.#addMoveToTree(newFen, result.san, moveData.to, moveData, true);
        
        if (this.currentNode) this.currentNode.timeSpent = timeSpent;

        if (this.isPlayingLiveGame && !result.isSpell) {
            if (nextTurn === 'b') this.whiteTime += this.whiteIncrement;
            else this.blackTime += this.blackIncrement;
        }

        this.turn = nextTurn;
        
        if (this.isPlayingLiveGame && this.currentNode && !result.isSpell) {
            const clkSeconds = nextTurn === 'b' ? this.whiteTime : this.blackTime;
            const h = Math.floor(clkSeconds / 3600);
            const m = Math.floor((clkSeconds % 3600) / 60);
            const s = Math.floor(clkSeconds % 60);
            const clkStr = `[%clk ${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}]`;
            
            this.currentNode.comment = this.currentNode.comment ? this.currentNode.comment + ` ${clkStr}` : clkStr;
        }

        if (!this.gameOver && !this.isAnalysisMode && !result.isSpell) {
            setTimeout(() => this.attemptPremove(), 150);
        }

        /// --- GAME OVER LOGIC ---
        if (this.isPlayingLiveGame && this.#engine.game_over()) {
            let resultStr = "1/2-1/2";
            let statusMsg = "Draw by agreement";

            let variantWinner = typeof this.#engine.variant_winner === 'function' ? this.#engine.variant_winner() : null;

            if (variantWinner !== null) {
                const winnerColor = variantWinner === 'w' ? 'White' : 'Black';
                resultStr = winnerColor === 'White' ? "1-0" : "0-1";
                statusMsg = `${winnerColor} wins by Variant Rules`;
            } 
            else if (this.#engine.in_checkmate()) {
                const winnerColor = this.turn === 'w' ? 'Black' : 'White';
                resultStr = winnerColor === 'White' ? "1-0" : "0-1";
                statusMsg = `${winnerColor} wins by checkmate`;
            } else if (this.#engine.in_stalemate()) {
                statusMsg = "Draw by stalemate";
            } else if (this.#engine.in_threefold_repetition && this.#engine.in_threefold_repetition()) {
                statusMsg = "Draw by repetition";
            } else if (this.#engine.insufficient_material && this.#engine.insufficient_material()) {
                statusMsg = "Draw by insufficient material";
            } else if (this.#engine.half_moves && this.#engine.half_moves() >= 100) {
                statusMsg = "Draw by 50-Move Rule";
            }

            this.#endGame(resultStr, statusMsg);
            
            this.clearPremoves();
            if (window.sfWorker && !window.engineAnalysing) window.sfWorker.postMessage('stop');
            
            if (!muteEngine && window.engineAnalysing && window.sfWorker && this.turn !== this.botColor) {
                if (this._engineRebootTimeout) clearTimeout(this._engineRebootTimeout);
                this._engineRebootTimeout = setTimeout(() => this.updateStockfish(), 200);
            }

            fireSound(); 
            return result;
        }
        
        const liveTurn = this.currentLiveTurn || this.turn;
        const isBotTurn = (this.mode === 'bot' && liveTurn === this.botColor);
        
        // --- BOT LOGIC ---
        if (this.isPlayingLiveGame && isBotTurn) {
            setTimeout(() => this.#triggerBotMove(), 250);
        } 
        else if (this.mode === 'puzzle' && !this.gameOver) {
            if (this.puzzleCursor % 2 === 0 && this.puzzleCursor < this.puzzleSolution.length) {
                const isRush = ['3min', '5min', 'survival'].includes(this.puzzleMode);
                const delay = isRush ? 150 : 400;
                
                setTimeout(() => {
                    const response = this.puzzleSolution[this.puzzleCursor];
                    if (response) {
                        const from = this.#squareToIndex(response.substring(0, 2));
                        const to = this.#squareToIndex(response.substring(2, 4));
                        const promo = response.length > 4 ? response.substring(4, 5) : undefined;
                        const botRes = this.makeMove({ from, to }, promo);
                        
                        if (this.#ui && botRes) {
                            this.#ui.renderBoard(true); 
                            if (!this.isAnalysisMode) setTimeout(() => this.attemptPremove(), 100);
                        }
                    }
                }, delay);
            }
        }

        if (!muteEngine && window.engineAnalysing && window.sfWorker && !isBotTurn) {
            if (this._engineRebootTimeout) clearTimeout(this._engineRebootTimeout);
            this._engineRebootTimeout = setTimeout(() => this.updateStockfish(), 200);
        }

        fireSound(); 
        return result;
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
startLocalGame(startFen = null) {
        if (!startFen) {
            startFen = (typeof VARIANT_STARTING_FENS !== 'undefined' && VARIANT_STARTING_FENS[this.gameMode]) ? VARIANT_STARTING_FENS[this.gameMode] : INITIAL_FEN;
            if (this.gameMode === 'chess960' && typeof this.generateChess960FEN === 'function') {
                startFen = this.generateChess960FEN();
            }
        }

        if (window.sfWorker) {
            if (this.activeEngineType === 'fairy' || this.activeEngineType === 'custom') {
        const sfVariant = this.gameMode === 'classical' ? 'chess' : this.gameMode;
        window.sfWorker.postMessage('setoption name UCI_Variant value ' + sfVariant);
    } else {
        window.sfWorker.postMessage('setoption name UCI_Chess960 value ' + (this.gameMode === 'chess960' ? 'true' : 'false'));
    }
}

        if (typeof window.engineAnalysing !== 'undefined') window.engineAnalysing = false;
        if (window.sfWorker) window.sfWorker.postMessage('stop');

        if (typeof this.#ui !== 'undefined') {
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
        
        if (this.gameMode === 'chess960' && typeof this.patchEngineFor960 === 'function') {
            this.patchEngineFor960(this.#engine);
        }
        
        this.loadFEN(startFen);

        this.turn = this.#engine.turn();
        this.rootNode = new MoveNode(startFen, null);
        this.currentNode = this.rootNode;
        this.moveList = [];
        this.history = [];
        
        this.gameOver = false;
        if (typeof this.#stopTimer === 'function') this.#stopTimer();
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
        if (this.gameMode !== 'classical') {
            this.pgnHeaders['Variant'] = this.gameMode;
        }
        if (this.#ui && this.#ui.togglePgnEditing) this.#ui.togglePgnEditing(false);
        
        const humanImg = `<img src="assets/tabs-icon/face.webp" style="width:100%; height:100%; object-fit:cover;">`;
        if (this.#ui && this.#ui.avatars) {
            this.#ui.avatars['w'] = humanImg;
            this.#ui.avatars['b'] = humanImg;
        }

        if (this.#ui && this.#ui.playerInfo) {
            this.#ui.playerInfo['w'] = { name: "Player White", meta: "White", avatarBorder: "#2872b5", avatarBg: "transparent" };
            this.#ui.playerInfo['b'] = { name: "Player Black", meta: "Black", avatarBorder: "#e68f00", avatarBg: "transparent" };
        }

        if (typeof this.#ui !== 'undefined') {
            this.#ui._lastMetadataCache = null; 
            this.#ui._lastHeadersCache = null;
            this.#ui._lastTreeSize = -1;
            this.#ui._lastFen = null;
            this.#ui._lastBoardFen = null;
            
            if (typeof this.#ui.displayMetadata === 'function') this.#ui.displayMetadata(this.pgnHeaders);
            this.#ui.updateHistory(true); 
            this.#ui.renderHeaders();
            
            const headers = document.querySelectorAll('.player-header');
            if (headers[0]) headers[0].querySelector('.clock').id = this.#ui.flipped ? 'timer-white' : 'timer-black';
            if (headers[1]) headers[1].querySelector('.clock').id = this.#ui.flipped ? 'timer-black' : 'timer-white';
            this.#ui.updateClocks();
            
            this.#ui.renderBoard(true);
            this.#ui.updateStatus("Local Game Started");
        }
        if (typeof this.#startTimer === 'function') this.#startTimer();
        
        const resignBtn = document.getElementById('resignBtn');
        const drawBtn = document.getElementById('drawBtn');
        if (resignBtn) resignBtn.style.display = 'block';
        if (drawBtn) drawBtn.style.display = 'block';
        this.#saveState('play');
    }
startBotGame(level, colorPreference, startFen = null) {
        if (!startFen) {
            startFen = (typeof VARIANT_STARTING_FENS !== 'undefined' && VARIANT_STARTING_FENS[this.gameMode]) ? VARIANT_STARTING_FENS[this.gameMode] : INITIAL_FEN;
            if (this.gameMode === 'chess960' && typeof this.generateChess960FEN === 'function') {
                startFen = this.generateChess960FEN();
            }
        }

        if (window.sfWorker) {
    if (this.activeEngineType === 'fairy' || this.activeEngineType === 'custom') {
        const sfVariant = this.gameMode === 'classical' ? 'chess' : this.gameMode;
        window.sfWorker.postMessage('setoption name UCI_Variant value ' + sfVariant);
    } else {
        window.sfWorker.postMessage('setoption name UCI_Chess960 value ' + (this.gameMode === 'chess960' ? 'true' : 'false'));
    }
}

        if (typeof window.engineAnalysing !== 'undefined') window.engineAnalysing = false;
        if (window.sfWorker) window.sfWorker.postMessage('stop');

        if (typeof this.#ui !== 'undefined') {
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

        this.turn = this.#engine.turn();
        this.rootNode = new MoveNode(startFen, null);
        this.currentNode = this.rootNode;
        this.moveList = [];
        this.history = [];
        
        this.gameOver = false;
        if (typeof this.#stopTimer === 'function') this.#stopTimer(); 
        this.whiteTime = Number(this.whiteStartSeconds);
        this.blackTime = Number(this.blackStartSeconds);
        
        if (this.#ui && this.#ui.togglePgnEditing) this.#ui.togglePgnEditing(false);
        
        const finalLevel = parseInt(level) || 8; 
        const levelSelect = document.getElementById('stockfishLevel');
        if (levelSelect) levelSelect.value = finalLevel; 
        this.botLevel = finalLevel;
        if (typeof this.updateEngineLevel === 'function') this.updateEngineLevel(); 

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
        if (this.gameMode !== 'classical') {
            this.pgnHeaders['Variant'] = this.gameMode;
        }
        if (this.#ui && this.#ui.playerInfo) {
            const humanColor = playerColor;
            const botColor = this.botColor;

            this.#ui.playerInfo[humanColor] = {
                name: "You",
                meta: (humanColor === 'w') ? "White" : "Black",
                metaColor: "#ccc",
                avatarBorder: "#2872b5", 
                avatarBg: "rgba(40, 114, 181, 0.2)"
            };
            
            this.#ui.playerInfo[botColor] = {
                name: botName,
                meta: "Stockfish (Latest)",
                metaColor: "#e68f00",
                avatarBorder: "#e68f00",
                avatarBg: "rgba(230, 143, 0, 0.2)"
            };

            if (this.#ui.avatars) {
                this.#ui.avatars[humanColor] = `<img src="assets/tabs-icon/face.webp" alt="You" style="width:100%; height:100%; object-fit:contain; border-radius: 5px;">`;
                this.#ui.avatars[botColor] = `<img src="assets/tabs-icon/engine.webp" alt="Bot" style="width:100%; height:100%; object-fit:contain; border-radius: 5px;">`;
            }
        }

        if (playerColor === 'b' && !this.#ui.flipped) this.#ui.flipBoard();
        else if (playerColor === 'w' && this.#ui.flipped) this.#ui.flipBoard();

        if (typeof this.#ui !== 'undefined') {
            this.#ui._lastMetadataCache = null; 
            this.#ui._lastHeadersCache = null;
            this.#ui._lastTreeSize = -1;
            this.#ui._lastFen = null;
            this.#ui._lastBoardFen = null;
            
            if (typeof this.#ui.displayMetadata === 'function') this.#ui.displayMetadata(this.pgnHeaders);
            this.#ui.updateHistory(true); 
            this.#ui.renderHeaders();
            
            const headers = document.querySelectorAll('.player-header');
            if (headers[0]) headers[0].querySelector('.clock').id = this.#ui.flipped ? 'timer-white' : 'timer-black';
            if (headers[1]) headers[1].querySelector('.clock').id = this.#ui.flipped ? 'timer-black' : 'timer-white';
            this.#ui.updateClocks();
            
            this.#ui.renderBoard(true);
            this.#ui.updateStatus(`Game Started: You vs ${botName}`);
        }

        if (window.sfWorker) {
            window.sfWorker.postMessage('ucinewgame');
            window.sfWorker.postMessage('isready');
            if (this.turn === this.botColor) {
                setTimeout(() => {
                    if (typeof this.#triggerBotMove === 'function') this.#triggerBotMove();
                    else if (typeof this.triggerBotMove === 'function') this.triggerBotMove();
                }, 500);
            }
        }
        
        if (typeof this.#startTimer === 'function') this.#startTimer();
        const resignBtn = document.getElementById('resignBtn');
        const drawBtn = document.getElementById('drawBtn');
        if (resignBtn) resignBtn.style.display = 'block';
        if (drawBtn) drawBtn.style.display = 'block';
        this.#saveState('play');
    }
startChess960Game(targetMode = 'local', level = 8, colorPref = 'w') {
        this.gameMode = 'chess960';
        const fen = typeof this.generateChess960FEN === 'function' ? this.generateChess960FEN() : INITIAL_FEN;
        
        if (window.sfWorker) {
            window.sfWorker.postMessage('setoption name UCI_Chess960 value true');
        }

        if (targetMode === 'local') {
            this.startLocalGame(fen);
        } else {
            this.startBotGame(level, colorPref, fen);
        }
        
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
        this.pgnHeaders['Event'] = targetMode === 'bot' ? 'Chess960 vs Computer' : 'Chess960 Casual Game';
        this.pgnHeaders['Date'] = dateStr;
        this.pgnHeaders['Variant'] = 'Chess960';
        this.pgnHeaders['FEN'] = fen;
        this.pgnHeaders['SetUp'] = '1';
        
        if (typeof this.#ui !== 'undefined') {
            this.#ui.updateStatus(targetMode === 'bot' ? `Chess960 Game Started vs Level ${level}` : "Chess960 Local Game Started");
            
            // Wipe UI Caches so the DOM is forced to update
            this.#ui._lastMetadataCache = null;
            this.#ui._lastHeadersCache = null;
            this.#ui._lastTreeSize = -1;
            this.#ui._lastFen = null;
            this.#ui._lastRenderedFen = null;
            this.#ui._lastBoardFen = null;
            
            if (typeof this.#ui.displayMetadata === 'function') {
                this.#ui.displayMetadata(this.pgnHeaders);
            }
            if (typeof this.#ui.renderHeaders === 'function') {
                this.#ui.renderHeaders();
            }
            
            this.#ui.updateHistory(true);
            if (typeof this.#syncMoveHistory === 'function') this.#syncMoveHistory();
            
            if (typeof this.#ui.renderBoard === 'function') {
                this.#ui.renderBoard(true);
            }
        }
    }
startChess960Analysis() {
        this.gameMode = 'chess960';
        const fen = typeof this.generateChess960FEN === 'function' ? this.generateChess960FEN() : INITIAL_FEN;
        
        if (window.sfWorker) {
            window.sfWorker.postMessage('setoption name UCI_Chess960 value true');
            window.sfWorker.postMessage('stop');
        }
        if (typeof window.engineAnalysing !== 'undefined') window.engineAnalysing = false;

        this.mode = 'analysis';
        this.botColor = null;
        
        this.newGame(fen);
        
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
        
        if (typeof this.#ui !== 'undefined') {
            this.#ui.switchTab('analysis');
            this.#ui.updateStatus("Chess960 Analysis Started");
            this.#ui._lastMetadataCache = null;
            this.#ui._lastHeadersCache = null;
            
            if (typeof this.#ui.displayMetadata === 'function') this.#ui.displayMetadata(this.pgnHeaders);
            if (typeof this.#ui.renderHeaders === 'function') this.#ui.renderHeaders();
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

        // 2. Define Difficulty Map (Must match #triggerBotMove logic!)
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
loadAllStudies() {
        try {
            const stored = localStorage.getItem('chess_studies_library');
            const lastStudyId = localStorage.getItem('chess_last_study_id'); 

            // ✨ FIX 1: Do not treat empty arrays "[]" as valid data that forces a placeholder
            if (stored && stored !== "[]") {
                this.allStudies = JSON.parse(stored);
                
                if (lastStudyId && this.allStudies.find(s => s.id === lastStudyId)) {
                    this.currentStudyId = lastStudyId;
                } else if (this.allStudies.length > 0) {
                    this.currentStudyId = this.allStudies[0].id;
                } else {
                    this.currentStudyId = null;
                }
                
                const target = this.allStudies.find(s => s.id === this.currentStudyId);
                if (target) {
                    this.studyTitle = target.title;
                    this.chapters = target.chapters;
                    this.activeChapterIndex = target.activeChapterIndex !== undefined ? target.activeChapterIndex : 0;
                } else {
                    this.allStudies = [];
                    this.chapters = [];
                    this.currentStudyId = null;
                    this.activeChapterIndex = -1;
                }
            } else {
                // ✨ FIX 2: If the library is empty, LEAVE IT EMPTY. Do not generate a placeholder!
                this.allStudies = [];
                this.chapters = [];
                this.studyTitle = "My Study";
                this.currentStudyId = null;
                this.activeChapterIndex = -1;
            }
        } catch(e) {
            console.error("Failed to load studies", e);
            this.allStudies = [];
            this.chapters = [];
            this.studyTitle = "My Study";
            this.currentStudyId = null;
            this.activeChapterIndex = -1;
        }
    }
createNewStudy() {
        const nameInput = document.getElementById('newStudyName');
        const title = nameInput ? nameInput.value.trim() : "";
        if (!title) return;
        
        const newId = 'study_' + Date.now();
        
        // ✨ THE FIX: Inject the Variant Tag!
        let variantTag = this.gameMode !== 'classical' ? `[Variant "${this.gameMode}"]\n` : '';
        let startFen = typeof this.generateFEN === 'function' ? this.generateFEN() : INITIAL_FEN;
        let initPgn = `${variantTag}[FEN "${startFen}"]\n\n*`;

        this.allStudies.push({
            id: newId,
            title: title,
            chapters: [{ title: "Chapter 1", pgn: initPgn }],
            activeChapterIndex: 0
        });
        
        this.loadStudy(newId, true);
        this.saveAllStudies(); 
        
        if (nameInput) nameInput.value = "";
    }
async saveChapterDetails() {
        const idx = window._editingChapterIdx;
        const nameInput = document.getElementById('chapterNameInput');
        const orientInput = document.getElementById('chapterOrientationInput');
        const modeInput = document.getElementById('chapterAnalysisModeInput');
        const saveBtn = document.getElementById('saveChapterBtn'); 
        
        const newName = nameInput ? nameInput.value.trim() : "";
        const newOrient = orientInput ? orientInput.value : 'w';
        const newMode = modeInput ? modeInput.value : 'normal';
        
        if (!newName) return;
        
        if (idx === -1) {
            // CREATE NEW
            const tab = window._activeChapterTab || 'empty';
            const dataInput = document.getElementById('chapterDataInput');
            const dataVal = dataInput ? dataInput.value.trim() : "";
            
            let variantTag = this.gameMode !== 'classical' ? `[Variant "${this.gameMode}"]\n` : '';
            let startFen = typeof this.generateFEN === 'function' ? this.generateFEN() : INITIAL_FEN;
            let pgn = `${variantTag}[FEN "${startFen}"]\n\n*`; // Fallback Empty

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
                    this.#ui.showNotification("Could not fetch game! Chess.com's anti-bot security blocked all proxies. \n\nFallback: Go to the Chess.com game, click 'Share' -> 'PGN', and paste it directly into the 'PGN' tab.");
                    
                    if (saveBtn) {
                        saveBtn.innerText = "CREATE CHAPTER";
                        saveBtn.disabled = false;
                        saveBtn.style.opacity = "1";
                    }
                    return; 
                }
            }
            else if (tab === 'fen' && dataVal) {
                pgn = `${variantTag}[FEN "${dataVal}"]\n\n*`;
            } else if (tab === 'pgn' && dataVal) {
                pgn = dataVal;
                if (this.gameMode !== 'classical' && !pgn.includes('[Variant')) {
                    pgn = `${variantTag}` + pgn;
                }
            } else if (tab === 'editor') {
                const curFen = this.generateFEN();
                pgn = `${variantTag}[FEN "${curFen}"]\n\n*`;
            }

            this.saveActiveChapter();

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
            this.chapters[idx].analysisMode = newMode; 
            
            if (idx === this.activeChapterIndex && this.#ui) {
                if ((newOrient === 'w' && this.#ui.flipped) || (newOrient === 'b' && !this.#ui.flipped)) {
                    this.#ui.flipBoard();
                }
            }
            if (this.#ui && this.#ui.renderChapters) this.#ui.renderChapters();
        }
        
        const modal = document.getElementById('chapterModal');
        if (modal) modal.style.display = 'none';
    }
importStudy(pgnText) {
        const extractedGames = pgnText.split(/(?=\[Event\s+")/g).filter(chapter => chapter.trim().length > 10);
        if (extractedGames.length === 0) return false;

        this.mode = 'study';
        if (extractedGames.length > 1) {
            const newChapters = extractedGames.map((gameStr, idx) => {
                const chapterMatch = gameStr.match(/\[ChapterName\s+"([^"]+)"\]/);
                const eventMatch = gameStr.match(/\[Event\s+"([^"]+)"\]/);
                const title = chapterMatch ? chapterMatch[1] : (eventMatch ? eventMatch[1] : `Chapter ${idx + 1}`);
                return { title: title, pgn: gameStr.trim(), analysisMode: 'Normal analysis' };
            });

            const newStudyId = 'study_' + Date.now();
            this.allStudies.push({
                id: newStudyId,
                title: newChapters[0].title || "Imported Study",
                chapters: newChapters,
                activeChapterIndex: 0
            });
            
            // ✨ FIX: Load the study FIRST, then save it so the correct ID writes to memory!
            this.loadStudy(newStudyId, true);
            this.saveAllStudies();
            
        } else {
            const gameStr = extractedGames[0];
            const chapterMatch = gameStr.match(/\[ChapterName\s+"([^"]+)"\]/);
            const eventMatch = gameStr.match(/\[Event\s+"([^"]+)"\]/);
            const title = chapterMatch ? chapterMatch[1] : (eventMatch ? eventMatch[1] : `Chapter ${this.chapters.length + 1}`);
            
            this.chapters.push({ title: title, pgn: gameStr.trim(), analysisMode: 'Normal analysis' });
            
            // ✨ FIX: Complete the save cycle for Text-box imports!
            this.loadChapter(this.chapters.length - 1, true);
            this.saveAllStudies();
        }
        return true;
    }
importStudyFromFile(input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const content = e.target.result;
            const games = this.#parseMultiPGN(content);
            
            if (games.length === 0) {
                if (this.#ui) this.#ui.showNotification("No valid PGN games found in file.", "Import Failed", "⚠️");
                return;
            }

            let studyName = file.name.replace(/\.[^/.]+$/, "") || "Imported Study";
            const studyMatch = games[0].match(/\[StudyName\s+"([^"]+)"\]/);
            if (studyMatch && studyMatch[1] && studyMatch[1].trim() !== "") {
                studyName = studyMatch[1];
            }

            const newId = 'study_' + Date.now();
            const newChapters = [];
            
            games.forEach((gamePgn, index) => {
                let title = `Chapter ${index + 1}`;
                
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
                chapters: newChapters,
                activeChapterIndex: 0
            });
            
            // ✨ FIX: Ensure memory locks onto the new ID before saving!
            this.loadStudy(newId, true);
            this.saveAllStudies();
            
            input.value = ''; 
            
            if (this.#ui) {
                this.#ui.showNotification(`Successfully imported study with ${games.length} chapters!`, "Import Complete", "📥");
                this.#ui.renderStudyList();
            }
        };
        reader.readAsText(file);
    }
importChaptersFromFile(input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const content = e.target.result;
            const games = this.#parseMultiPGN(content);
            
            if (games.length === 0) {
                if (this.#ui) this.#ui.showNotification("No valid PGN games found.", "Import Failed", "⚠️");
                return;
            }
            
            const jumpToIdx = this.chapters.length; 
            
            games.forEach((gamePgn) => {
                let title = `Imported Chapter ${this.chapters.length + 1}`;
                
                const chapterMatch = gamePgn.match(/\[ChapterName\s+"([^"]+)"\]/);
                const eventMatch = gamePgn.match(/\[Event\s+"([^"]+)"\]/);
                
                if (chapterMatch && chapterMatch[1] && chapterMatch[1].trim() !== "") {
                    title = chapterMatch[1];
                } else if (eventMatch && eventMatch[1] && eventMatch[1] !== "?" && eventMatch[1] !== "Casual Game") {
                    title = eventMatch[1];
                }
                
                this.chapters.push({ title: title, pgn: gamePgn, analysisMode: 'Normal analysis' });
            });
            
            // ✨ FIX: Load the newly appended chapter FIRST, then save the array!
            this.loadChapter(jumpToIdx, true);
            this.saveAllStudies();
            
            input.value = ''; 
            this.#emit('chaptersImported', games.length);
            return true;
        };
        reader.readAsText(file);
    }
exportAllStudies() {
        let combinedPgn = "";
        let count = 0;

        this.allStudies.forEach(study => {
            if (study.chapters && study.chapters.length > 0) {
                study.chapters.forEach(ch => {
                    let chPgn = ch.pgn || "";
                    if (!chPgn.includes('[StudyName "')) chPgn = `[StudyName "${study.title}"]\n` + chPgn;
                    if (!chPgn.includes('[Event "')) chPgn = `[Event "${study.title} - ${ch.title}"]\n` + chPgn;
                    combinedPgn += chPgn + "\n\n";
                });
                count++;
            }
        });

        if (count > 0) {
            this.#triggerDownload(combinedPgn, `chess_studies_export`);
            this.#emit('notification', { message: `Successfully exported ${count} studies!`, title: "Export Complete", icon: "📥" });
        } else {
            this.#emit('notification', { message: "No studies selected.", title: "Export Failed", icon: "⚠️" });
        }
    }
saveActiveChapter() {
        if (this.#_isBooting || this.mode !== "study") return;
        if (this.activeChapterIndex >= 0 && this.activeChapterIndex < this.chapters.length) {
            this.chapters[this.activeChapterIndex].pgn = typeof this.generatePGN === 'function' ? this.generatePGN() : "";
            this.saveAllStudies();
        }
    }
saveAllStudies() {
        // ✨ FIX 1: If there are no studies or no ID, just save the empty state.
        if (!this.currentStudyId || this.allStudies.length === 0) {
            localStorage.setItem('chess_studies_library', JSON.stringify(this.allStudies));
            if (!this.currentStudyId) {
                localStorage.removeItem('chess_last_study_id');
            }
            return;
        }

        let current = this.allStudies.find(s => s.id === this.currentStudyId);

        // ✨ FIX 2: ONLY update the study if it actually exists! 
        // We completely removed the `else` block that was resurrecting deleted ghosts!
        if (current) {
            let indexToSave = 0;
            if (this.mode === 'study' && this.activeChapterIndex >= 0) {
                indexToSave = this.activeChapterIndex;
            } else if (current.activeChapterIndex !== undefined) {
                indexToSave = current.activeChapterIndex;
            }

            current.title = this.studyTitle;
            current.chapters = this.chapters;
            current.activeChapterIndex = indexToSave;
        }

        localStorage.setItem('chess_studies_library', JSON.stringify(this.allStudies));
        localStorage.setItem('chess_last_study_id', this.currentStudyId);
    }
deleteStudy(id) {
        const isDeletingCurrent = (this.currentStudyId === id);

        // ✨ FIX 3: If we are deleting a background study, ensure the current one is saved first!
        if (!isDeletingCurrent) {
            this.saveActiveChapter();
        }

        this.allStudies = this.allStudies.filter(s => s.id !== id);

        if (this.allStudies.length === 0) {
            // Completely wipe the slate clean if the library is empty
            this.currentStudyId = null;
            this.chapters = [];
            this.activeChapterIndex = -1;
            this.studyTitle = "My Study";
            this.saveAllStudies(); 
        } else {
            if (isDeletingCurrent || !this.allStudies.find(s => s.id === this.currentStudyId)) {
                // Safely switch to the next available study without triggering a ghost save
                this.loadStudy(this.allStudies[0].id, true);
            }
            
            // ✨ FIX 4: Explicitly command the system to save the deletion!
            this.saveAllStudies();
        }
    }
deleteSelectedStudies() {
        const checkboxes = Array.from(document.querySelectorAll('.study-cb:checked'));
        if (checkboxes.length === 0) return;

        const idsToDelete = checkboxes.map(cb => cb.dataset.id);
        const deletingCurrent = idsToDelete.includes(this.currentStudyId);

        if (!deletingCurrent) this.saveActiveChapter();

        this.allStudies = this.allStudies.filter(s => !idsToDelete.includes(s.id));

        if (this.allStudies.length === 0) {
            this.currentStudyId = null;
            this.chapters = [];
            this.studyTitle = "My Study";
            this.activeChapterIndex = -1;
            this.saveAllStudies();
        } else {
            if (deletingCurrent) {
                this.loadStudy(this.allStudies[0].id, true);
            }
            // ✨ FIX 5: Explicitly command the system to save the deletion!
            this.saveAllStudies();
        }

        if (this.#ui) this.#ui.renderStudyList();
    }
loadStudy(studyId, skipSave = false) {
        if (!skipSave && this.mode === 'study') {
            if (typeof this.saveActiveChapter === 'function') this.saveActiveChapter(); 
        }
        
        const target = this.allStudies.find(s => s.id === studyId);
        if (target) {
            this.currentStudyId = target.id;
            this.studyTitle = target.title || "My Study";
            this.chapters = target.chapters || [{ title: "Chapter 1", pgn: "" }];
            
            const headerTitle = document.getElementById('studyTitleDisplay');
            if (headerTitle) headerTitle.innerText = this.studyTitle;
            
            let chapterToLoad = target.activeChapterIndex !== undefined ? target.activeChapterIndex : 0;
            if (chapterToLoad < 0 || chapterToLoad >= this.chapters.length) chapterToLoad = 0;
            
            this.loadChapter(chapterToLoad, skipSave, true); 
        }
    }
loadChapter(index, skipSave = false, force = false) {
        if (index < 0 || index >= this.chapters.length) return;
        if (!force && index === this.activeChapterIndex && this.mode === 'study') return;
        if (!skipSave && this.activeChapterIndex !== -1 && this.mode === 'study') {
            if (typeof this.saveActiveChapter === 'function') this.saveActiveChapter();
        }
        
        this.activeChapterIndex = index;
        this.mode = 'study'; 
        this.gameOver = true;
        
        let pgn = this.chapters[index].pgn;
        if (!pgn || pgn.trim() === '') pgn = '[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"]\n\n*';
        
        this.loadPGN(pgn); 
        
        if (this.#ui) {
            const orient = this.chapters[index].orientation || 'w';
            if ((orient === 'w' && this.#ui.flipped) || (orient === 'b' && !this.#ui.flipped)) {
                this.#ui.flipBoard();
            }
            if (typeof this.#ui.renderChapters === 'function') this.#ui.renderChapters();

            if (typeof this.#ui.toggleHideNextMoves === 'function') {
                const shouldHide = (this.chapters[index].analysisMode === 'hidden');
                this.#ui.toggleHideNextMoves(shouldHide);
            }
        }
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
            this.loadChapter(0, true); 
            this.saveAllStudies();
            
            const editorModal = document.getElementById('chapterModal');
            if (editorModal) editorModal.style.display = 'none';
            
            if (this.#ui && this.#ui.renderChapters) this.#ui.renderChapters();
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
        this.loadChapter(0, true);
        
        this.saveAllStudies();
        
        if (this.#ui) this.#ui.openChapterManager(); 
    }
downloadCurrentStudy() {
        this.saveActiveChapter(); 
        let combinedPgn = "";
        let exportedCount = 0;
        
        this.chapters.forEach((ch, idx) => {
            let chPgn = ch.pgn || "";
            
            if (chPgn.match(/\[ChapterName\s+"[^"]*"\]/)) {
                chPgn = chPgn.replace(/\[ChapterName\s+"[^"]*"\]/, `[ChapterName "${ch.title}"]`);
            } else {
                chPgn = `[ChapterName "${ch.title}"]\n` + chPgn;
            }

            if (chPgn.match(/\[StudyName\s+"[^"]*"\]/)) {
                chPgn = chPgn.replace(/\[StudyName\s+"[^"]*"\]/, `[StudyName "${this.studyTitle}"]`);
            } else {
                chPgn = `[StudyName "${this.studyTitle}"]\n` + chPgn;
            }
            
            if (!chPgn.includes('[Event "')) {
                chPgn = `[Event "${this.studyTitle} - ${ch.title}"]\n` + chPgn;
            }
            
            combinedPgn += chPgn + "\n\n";
            exportedCount++;
        });
        
        if (exportedCount === 0) {
            this.#emit('notification', { message: "Current study is empty.", title: "Export Failed", icon: "⚠️" });
            return;
        }
        this.#triggerDownload(combinedPgn, `chess_study_${this.studyTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`);
        this.#emit('notification', { message: `Successfully exported ${exportedCount} chapters!`, title: "Export Complete", icon: "📥" });
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
            if (this.#ui) this.#ui.showNotification("No chapters selected.", "Export Failed", "⚠️");
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
        if (this.#ui) this.#ui.showNotification(`Successfully exported ${exportedCount} chapters.`, "Export Complete", "📥");
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
            this.#emit('notification', { message: "No chapters selected.", title: "Export Failed", icon: "⚠️" });
            return;
        }
        this.#triggerDownload(combinedPgn, `chess_study_${this.studyTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`);
        this.#emit('notification', { message: `Successfully exported ${exportedCount} chapters!`, title: "Export Complete", icon: "📥" });
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
            this.#triggerDownload(combinedPgn, `chess_studies_export`);
            if (this.#ui) this.#ui.showNotification(`Successfully exported ${count} studies!`, "Export Complete", "📥");
        } else {
            if (this.#ui) this.#ui.showNotification("No studies selected.", "Export Failed", "⚠️");
        }
    }
startLesson(lessonData) {
        this.mode = 'lesson';
        this.lessonData = lessonData;
        this.lessonStep = 0;
        
        // Silence the engine so it doesn't fight the lesson
        if (window.sfWorker) window.sfWorker.postMessage('stop');
        
        const fen = lessonData.fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        if (this.#engine && typeof this.#engine.load === 'function') {
            this.#engine.load(fen);
        }
        
        // Safely reset the visual board
        if (typeof this['#reconcileBoardIdsReverse'] === 'function') {
            this['#reconcileBoardIdsReverse'](fen);
        }
        
        this.#emit('boardUpdated', { animate: false });
        this.#emit('lessonStarted', lessonData);
    }
exitLesson() {
        this.mode = 'local';
        this.lessonData = null;
        this.#emit('lessonEnded');
    }
playLessonResponse(uci) {
        if (!this.#engine) return;
        const from = uci.substring(0, 2);
        const to = uci.substring(2, 4);
        const prom = uci.length === 5 ? uci[4] : undefined;
        
        // Convert the UCI string into your engine's move object
        let legals = typeof this.#engine.moves === 'function' ? this.#engine.moves({ verbose: true }) : [];
        const m = legals.find(x => x.from === from && x.to === to && (!prom || x.promotion === prom));
        
        if (m && typeof this.move === 'function') {
            this.move(m);
        }
    }
triggerMoveSound(move) {
        if (!move) return;
        const flags = move.flags || '';
        let type = 'move-self';

        // ✨ 1. PUZZLE STATUS
        if (this.mode === 'puzzle') {
            const pStatus = move.puzzleStatus || this.puzzleStatus || move.status;
            if (pStatus === 'wrong' || move.isWrong) type = 'wrong';
            else if (pStatus === 'solved' || pStatus === 'best' || move.isSolved) type = 'best';
            else if (pStatus === 'correct' || move.isCorrect) type = 'correct';
            
            if (['wrong', 'best', 'correct'].includes(type)) {
                
                // ✅ SAFE DEBUGGING LOG
                console.log(`🔊 [SOUND] Mode: Puzzle | Type: ${type} | Square: ${move.to}`);
                
                this.#emit('soundTriggered', { type, destSquare: move.to });
                return;
            }
        }

        // ✨ 2. GAME OVER
        if (this.#engine.game_over()) {
            if (this.#engine.in_draw() || this.#engine.in_stalemate() || (typeof this.#engine.in_threefold_repetition === 'function' && this.#engine.in_threefold_repetition())) {
                type = 'draw';
            } else if (this.#engine.in_checkmate()) {
                const matedColor = this.#engine.turn(); 
                if (this.mode === 'bot') {
                    type = (matedColor === this.botColor) ? 'win-long' : 'lose-long';
                } else if (this.mode === 'puzzle') {
                    type = 'win-long';
                } else {
                    type = 'win-long'; 
                }
            } else {
                type = 'win'; 
            }
            
            // ✅ SAFE DEBUGGING LOG
            console.log(`🔊 [SOUND] Game Over | Type: ${type} | Square: ${move.to}`);
            
            this.#emit('soundTriggered', { type, destSquare: move.to });
            return;
        }

        // ✨ 3. ACTION SOUNDS
        if (this.#engine.in_check()) {
            type = 'check';
        } else if (flags.includes('p')) {
            type = 'promote';
        } else if (flags.includes('c') || flags.includes('e')) {
            type = 'capture';
        } else if (flags.includes('k') || flags.includes('q')) {
            type = 'castle';
        } else {
            // ✨ 4. STANDARD MOVES
            if (this.mode === 'bot' && move.color === this.botColor) {
                type = 'move-opponent';
            } else if (this.mode === 'puzzle' && move.color !== move.playerColor) {
                type = 'move-opponent';
            } else {
                type = 'move-self';
            }
        }

        // ✅ SAFE DEBUGGING LOG
        const theme = (typeof window !== 'undefined' && window.SoundManager) ? window.SoundManager.currentSet : 'unknown';
        console.log(`🔊 [SOUND] Type: ${type} | Flags: ${flags} | Square: ${move.to} | Theme: ${theme}`);

        this.#emit('soundTriggered', { type, destSquare: move.to });
    }
}