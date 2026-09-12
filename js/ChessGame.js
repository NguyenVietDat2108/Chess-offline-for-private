/**
 * Copyright (c) 2026 Ngvida2108
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://gnu.org>.
 */
import {INITIAL_FEN,FILES, RANKS, ICON_BOOK_SVG, SETTINGS_ICON_IMG, VARIANT_STARTING_FENS, nnueMap,ISO_TO_COUNTRY_NAME,NAG_MAP } from './constants.js';
import { MoveNode } from './MoveNode.js';
export const EV_UPDATE_BOARD = 1;
export const EV_ANIMATE = 2;
export const EV_SKIP_ENGINE = 4;
export const EV_SOUND_MOVE = 8;
export const EV_FEN_CHANGED = 16;
export class ChessGame {
    #engine;
    #pieceIdCounter;
    #board;
    #timerInterval;
    #_isBooting;
    #ui;
    #callbacks;
    SUSPENDED_VARIANTS = ['bughouse','placement'];
    #EMPTY_ARRAY = [];
constructor() {
        this.#callbacks = {};
        this.#ui = null;
        this.#engine = new (typeof Chess === 'function' ? Chess : window.Chess)();
        this.#pieceIdCounter = 0;
        this.#board = Array(64).fill(null);
        this.#timerInterval = null;
        this.#_isBooting = true;
        this.gameMode = (typeof localStorage !== 'undefined' ? localStorage.getItem('chess_last_variant') : 'classical') || 'classical';
        
        this.mode = 'analysis'; 
        
        if (this.#engine && typeof this.#engine.setGameMode === 'function') {
            this.#engine.setGameMode(this.gameMode);
        }
        
        let startingFen = this.#getStartingFen(this.gameMode);

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
#emitMask(mask, payload = null) {
        if (this.#callbacks['bitmask_event']) {
            this.#callbacks['bitmask_event'](mask, payload);
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
        let engineDuck = (this.#engine && typeof this.#engine.get_duck_sq === 'function') ? this.#engine.get_duck_sq() : -1;
        let uiDuckSq = -1;
        if (engineDuck !== -1 && engineDuck !== undefined && engineDuck !== null) {
            let algStr = this.#engineIndexToSquare(engineDuck); 
            uiDuckSq = this.#squareToIndex(algStr);             
        }
        const frozenSquares = new Array(64).fill(false);
        let jumpSquare = -1;

        if (this.gameMode === 'spell' && this.#engine) {
            if (typeof this.#engine.frozen === 'function') {
                const f = this.#engine.frozen();
                if (f && (f.lo !== 0 || f.hi !== 0)) {
                    for (let i = 0; i < 64; i++) {
                        let isFrozen = false;
                        if (i < 32) { 
                            if ((f.lo >>> i) & 1) isFrozen = true; 
                        } else { 
                            if ((f.hi >>> (i - 32)) & 1) isFrozen = true; 
                        }
                        if (isFrozen) {
                            let algStr = this.#engineIndexToSquare(i); 
                            let uiIdx = this.#squareToIndex(algStr);
                            if (uiIdx !== -1 && uiIdx !== undefined) {
                                frozenSquares[uiIdx] = true;
                            }
                        }
                    }
                }
            }
            if (typeof this.#engine.jump_sq === 'function') {
                let js = this.#engine.jump_sq();
                if (js !== -1) {
                    let algStr = this.#engineIndexToSquare(js);
                    let parsed = this.#squareToIndex(algStr);
                    if (parsed !== -1) jumpSquare = parsed;
                }
            }
        }

        return {
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
            lastMove: this._transientOverrideMove || (this.currentNode ? this.currentNode.lastMove : null),
            headers: this.pgnHeaders,
            whiteTime: this.whiteTime,
            blackTime: this.blackTime,
            board: this.#board,
            premoves: this.premoveQueue,
            arrows: (this.currentNode && this.currentNode.arrows && this.currentNode.arrows.length > 0) ? this.currentNode.arrows : this.#EMPTY_ARRAY,
            circles: (this.currentNode && this.currentNode.circles && this.currentNode.circles.length > 0) ? this.currentNode.circles : this.#EMPTY_ARRAY,
            puzzle: {
                active: this.puzzleActive,
                mode: this.puzzleMode,
                timeRemaining: this.puzzleTimeRemaining,
                score: this.puzzleScore,
                strikes: this.puzzleStrikes,
                solution: this.puzzleSolution,
                cursor: this.puzzleCursor
            },
            mana: this.#engine && typeof this.#engine.mana === 'function' ? this.#engine.mana() : null,
            frozenSquares: frozenSquares, 
            frozen: this.#engine && typeof this.#engine.frozen === 'function' ? this.#engine.frozen() : null,
            jump_sq: jumpSquare,
            duck_sq: uiDuckSq, 
            studyTitle: this.studyTitle,
            activeChapterIndex: this.activeChapterIndex,
            chapters: this.chapters
        };
    }
#getStartingFen(mode = this.gameMode) {
    if (typeof VARIANT_STARTING_FENS !== 'undefined' && VARIANT_STARTING_FENS[mode]) {
        return VARIANT_STARTING_FENS[mode];
    }
    return INITIAL_FEN;
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
        const cleanFen = fen.split(' ')[0];
        let boardStr = cleanFen;
        if (boardStr.includes('[')) boardStr = boardStr.split('[')[0];
        const rows = boardStr.split('/');
        const newPieces = [];
        let idx = 0;

        for (let r = 0; r < 8; r++) {
            const row = rows[r];
            for (let char of row) {
                if (/\d/.test(char)) {
                    idx += parseInt(char);
                } else if (char === '~') {
                    if (newPieces.length > 0) {
                        if (this.gameMode === 'alice') newPieces[newPieces.length - 1].isBoardB = true;
                        else newPieces[newPieces.length - 1].promoted = true;
                    }
                } else if (char === '*') {
                    newPieces.push({ type: 'duck', color: 'none', idx, r: idx >> 3, c: idx & 7, id: null });
                    idx++;
                } else {
                    const color = (char === char.toUpperCase()) ? 'w' : 'b';
                    const type = char.toLowerCase();
                    newPieces.push({ type, color, idx, r: idx >> 3, c: idx & 7, id: null });
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
                const dist = Math.abs((op.idx & 7) - np.c) + Math.abs((op.idx >> 3) - np.r);
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
            if (p.isBoardB) finalBoard[p.idx].isBoardB = true;
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
        let boardStr = cleanFen;
        if (boardStr.includes('[')) boardStr = boardStr.split('[')[0];
        const fenRows = boardStr.split('/');
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
                    if (newPieces.length > 0) {
                        if (this.gameMode === 'alice') newPieces[newPieces.length - 1].isBoardB = true;
                        else newPieces[newPieces.length - 1].promoted = true;
                    }
                } else if (char === '*') {
                    newPieces.push({ type: 'duck', color: 'none', idx, r: idx >> 3, c: idx & 7, id: null });
                    idx++;
                } else {
                    const color = (char === char.toUpperCase()) ? 'w' : 'b';
                    const type = char.toLowerCase();
                    newPieces.push({ type, color, idx, r: idx >> 3, c: idx & 7, id: null });
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
                const dist = Math.abs((op.idx & 7) - np.c) + Math.abs((op.idx >> 3) - np.r);
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
            if (p.isBoardB) finalBoard[p.idx].isBoardB = true; 
        });

        this.#board = finalBoard;
    }
#squareToIndex(sq) {
        if (!sq || sq.length < 2) return -1;
        let f = (sq.charCodeAt(0) | 32) - 97; 
        let r = 56 - sq.charCodeAt(1);
        return (r * 8) + f;
    }
#indexToSquare(idx) {
        if (idx < 0 || idx > 63) return "";
        let r = idx >> 3; let f = idx & 7;
        return String.fromCharCode(97 + f) + String.fromCharCode(56 - r);
    }
#engineIndexToSquare(idx) {
        if (idx < 0 || idx > 63) return "";
        let r = idx >> 3; let f = idx & 7;
        return String.fromCharCode(97 + f) + String.fromCharCode(49 + r);
    }
#postEngineCommand(cmdString) {
        if (!window.sfWorker) return;
        window.sfWorker.postMessage(cmdString);
    }
#safeSetOption(name, value) {
        if (!this.engineSupportedOptions) return;
        if (this.engineSupportedOptions.has(name.toLowerCase())) {
            this.#postEngineCommand(`setoption name ${name} value ${value}`);
        } else {
            console.log(`[UCI] Not supported by engine: ${name}`);
        }
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
                tTurn = tempChess.turn();
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
            this.#safeSetOption('UCI_Variant', sfVariant);
        } else {
            this.#safeSetOption('UCI_Chess960', (this.gameMode === 'chess960' ? 'true' : 'false'));
        }
        
        this.#safeSetOption('UCI_LimitStrength', 'false');
        this.#safeSetOption('Skill Level', '20');
        this.#safeSetOption('MultiPV', '3');
        this.#postEngineCommand('position fen ' + fen);
        
        const depth = document.getElementById('engineDepth')?.value || 99;
        this.#postEngineCommand('go depth ' + depth);
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

        if (!ignoreBook && this.gameMode === 'classical') {
            let bookCandidates = null;
            if (typeof this.getBookMove === 'function') bookCandidates = this.getBookMove(fen, level);
            else if (typeof this.#getBookMove === 'function') bookCandidates = this.#getBookMove(fen, level);
            
            if (bookCandidates && bookCandidates.length > 0) {
                const candidate = bookCandidates[Math.floor(Math.random() * bookCandidates.length)];
                
                if (window.sfWorker && level >= 3) {
                    const thresholds = { 3: -300, 4: -200, 5: -150, 6: -100, 7: -50, 8: -25 };

                    this.verifyingBookMove = candidate;
                    this.verifyingBookScore = null;
                    this.verifyingBookType = null;
                    this.verifyingBookThreshold = thresholds[level] || -150; 
                    
                    this.#postEngineCommand('stop');
                    this.#postEngineCommand('position fen ' + fen);
                    this.#postEngineCommand(`go depth 8 searchmoves ${candidate}`);
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

        if (window.sfWorker) {
            const difficultyMap = {
                1: { uciElo: 1000 }, 2: { uciElo: 1200 }, 3: { uciElo: 1500 }, 4: { uciElo: 1800 },
                5: { uciElo: 2100 }, 6: { uciElo: 2400 }, 7: { uciElo: 2700 }, 8: { uciElo: 3000 }
            };
            const settings = difficultyMap[level] || difficultyMap[8];
            
            this.#postEngineCommand('stop');
            this.#safeSetOption('MultiPV', '1');
            
            if (this.activeEngineType === 'fairy') {
                const sfVariant = this.gameMode === 'classical' ? 'chess' : this.gameMode;
                this.#safeSetOption('UCI_Variant', sfVariant);
            } else {
                this.#safeSetOption('UCI_Chess960', (this.gameMode === 'chess960' ? 'true' : 'false'));
            }
            
            this.#safeSetOption('UCI_LimitStrength', 'true');
            this.#safeSetOption('UCI_Elo', settings.uciElo);
            this.#postEngineCommand('position fen ' + fen);
            this.#postEngineCommand(`go movetime ${this.currentBotThinkTime}`); 
        }
    }
#handleEngineMessage(e) {
        if (typeof e.data !== 'string') return;
        const line = e.data.trim(); 
        if (!line) return;
        
        if (line.startsWith('option name ')) {
            const optMatch = line.match(/option name (.*?) type/i);
            if (optMatch) {
                const optName = optMatch[1].trim().toLowerCase();
                if (!this.engineSupportedOptions) this.engineSupportedOptions = new Set();
                this.engineSupportedOptions.add(optName);

                if (optName === 'evalfile') {
                    const defaultMatch = line.match(/default\s+(nn-[a-z0-9]+\.nnue)/i);
                    if (defaultMatch && defaultMatch[1]) {
                        this._defaultNnueFile = defaultMatch[1];
                    }
                }
            }
        }
        
        console.log("%c⬅️ [ENGINE SAYS]: " + line, "color: #a3e635");

        if (line === 'WORKER_INITIALIZED') {
            this.#postEngineCommand('uci');
            return;
        }

        if (line === 'readyok') {
            window.engineReady = true; 
            window.engineBooting = false; 

            if (this.mode === 'bot' && this._pendingBotStart) {
                this._pendingBotStart = false;
                this.#postEngineCommand('ucinewgame');
                if (this.turn === this.botColor) {
                    setTimeout(() => this.#triggerBotMove(), 500);
                }
                return;
            }

            const isAnalysingOrStudy = (this.mode === 'analysis' || this.mode === 'study' || this.mode === 'puzzle');
            
            if (isAnalysingOrStudy && window.engineAnalysing && this._pendingFen) {
                const targetFen = this._pendingFen;
                this.analyzingNode = this._pendingNode;
                this._pendingFen = null; 
                this._pendingNode = null;
                this.#triggerEngineGo(targetFen); 
            }
            return; 
        }

        const isAnalysingOrStudy = (this.mode === 'analysis' || this.mode === 'study' || this.mode === 'puzzle');
        
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
            
            if (this.gameMode === 'alice' || this.gameMode === 'spell') {
                this.#safeSetOption('Threads', '1');
                this.#safeSetOption('Hash', '32');
            } else {            
                this.#safeSetOption('Threads', threads);
                this.#safeSetOption('Hash', '512');
            }
            this.#safeSetOption('MultiPV', '3');
            this.#safeSetOption('Move Overhead', '10');
            this.#safeSetOption('UCI_LimitStrength', 'false');
            this.#safeSetOption('Skill Level', '20');
            
            if (this.activeEngineType === 'fairy' || this.activeEngineType === 'custom') {
                const sfVariant = this.gameMode === 'classical' ? 'chess' : this.gameMode;
                if (this.gameMode === 'alice' || this.gameMode === 'spell') {
                    this.#safeSetOption('Use NNUE', 'false');
                    this.#safeSetOption('EvalFile', '');
                    this.#safeSetOption('UCI_Variant', sfVariant);
                    this.#postEngineCommand('isready');
                    return;
                }
                
                this.#safeSetOption('UCI_Variant', sfVariant);

                let nnueConfig = nnueMap[this.gameMode];
                if (nnueConfig) {
                    let filesToLoad = [];
                    if (typeof nnueConfig === 'string') {
                        filesToLoad.push({ key: 'EvalFile', file: nnueConfig });
                    } else {
                        if (nnueConfig.big) filesToLoad.push({ key: 'EvalFile', file: nnueConfig.big });
                        if (nnueConfig.small) filesToLoad.push({ key: 'EvalFileSmall', file: nnueConfig.small });
                    }

                    filesToLoad = filesToLoad.filter(opt => !this.engineSupportedOptions || this.engineSupportedOptions.has(opt.key.toLowerCase()));

                    if (filesToLoad.length > 0) {
                        Promise.all(filesToLoad.map(item => 
                            fetch('./engine/nnue/' + item.file)
                            .then(res => res.ok ? res.arrayBuffer().then(buf => ({ ...item, buffer: buf })) : null)
                        )).then(results => {
                            results.forEach(res => {
                                if (res && res.buffer) {
                                    window.sfWorker.postMessage({ action: 'INJECT_NNUE', name: res.file, buffer: res.buffer }, [res.buffer]);
                                    this.#safeSetOption(res.key, res.file);
                                }
                            });
                            setTimeout(() => { this.#postEngineCommand('isready'); }, 50);
                        }).catch(err => {
                            console.warn("[ENGINE] Lỗi nạp NNUE variant:", err);
                            this.#postEngineCommand('isready');
                        });
                        return;
                    }
                } 
                this.#postEngineCommand('isready');
                return;
            } else {
                this.#safeSetOption('UCI_Chess960', this.gameMode === 'chess960' ? 'true' : 'false');
                
                let nnueToLoad = this._defaultNnueFile || 'nn-1a298aa575a0.nnue';
                
                console.log("[ENGINE] Chuẩn bị tải NNUE cho Stockfish 19:", nnueToLoad);
                const appBaseUrl = new URL('.', window.location.href).href;
                const nnueUrl = new URL('engine/nnue/' + nnueToLoad, appBaseUrl).href;

                fetch(nnueUrl)
                    .then(res => {
                        if (!res.ok) throw new Error("Không thể tải file NNUE từ: " + nnueUrl);
                        return res.arrayBuffer();
                    })
                    .then(buffer => {
                        console.log("[ENGINE] Đã tải xong NNUE (" + (buffer.byteLength / 1024 / 1024).toFixed(2) + " MB), đang inject vào engine...");
                        window.sfWorker.postMessage({ action: 'INJECT_NNUE', name: nnueToLoad, buffer: buffer }, [buffer]);
                        this.#safeSetOption('EvalFile', nnueToLoad);
                        setTimeout(() => { this.#postEngineCommand('isready'); }, 80);
                    })
                    .catch(err => {
                        console.error("[ENGINE FATAL] Lỗi nạp NNUE:", err);
                        this.#postEngineCommand('isready');
                    });
                return;
            }
        }

        if (line.startsWith('bestmove')) {
            const liveTurn = this.currentLiveTurn || this.turn;
            if (this.mode === 'bot' && liveTurn === this.botColor) {
                const match = line.match(/bestmove\s+(\S+)/);
                const isVerifying = !!this.verifyingBookMove;
                const candidate = this.verifyingBookMove;
                const score = this.verifyingBookScore;
                const type = this.verifyingBookType;
                const threshold = this.verifyingBookThreshold;
                
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
                            console.log(`%c[BOT] Book move ${candidate} rejected. Searching for best engine move...`, "color:#fa412d");
                            const difficultyMap = {
                                1: { uciElo: 1000 }, 2: { uciElo: 1200 },
                                3: { uciElo: 1500 }, 4: { uciElo: 1800 },
                                5: { uciElo: 2100 }, 6: { uciElo: 2400 },
                                7: { uciElo: 2700 }, 8: { uciElo: 3000 }
                            };
                            const level = this.botLevel || 8;
                            this.verifyingBookMove = null;
                            this.verifyingBookScore = null;
                            this.verifyingBookType = null;
                            this.verifyingBookThreshold = null;

                            const fen = this.#engine.fen();
                            const settings = difficultyMap[level] || difficultyMap[8];

                            if (window.sfWorker) {
                                this.#postEngineCommand('stop');
                                this.#safeSetOption('MultiPV', '1');
                                
                                if (this.activeEngineType === 'fairy') {
                                    const sfVariant = this.gameMode === 'classical' ? 'chess' : this.gameMode;
                                    this.#safeSetOption('UCI_Variant', sfVariant);
                                } else {
                                    this.#safeSetOption('UCI_Chess960', (this.gameMode === 'chess960' ? 'true' : 'false'));
                                }
                                
                                this.#safeSetOption('UCI_LimitStrength', 'true');
                                this.#safeSetOption('UCI_Elo', settings.uciElo);
                                this.#postEngineCommand('position fen ' + fen);
                                this.#postEngineCommand(`go movetime ${this.currentBotThinkTime}`);
                            }
                            return; 
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
                    let uM = m.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
                    let eInput = m;
                    if (uM) {
                        eInput = { from: uM[1], to: uM[2] };
                        if (uM[3]) eInput.promotion = uM[3].toLowerCase();
                    }

                    let res = null;
                    let capturedLogs = [];

                    const originalError = console.error;
                    console.error = (...args) => { capturedLogs.push(args); }; 
                    
                    try { 
                        res = tempValidator.move(eInput); 
                    } catch(e) { capturedLogs.push([e]); }
                    
                    if (!res) {
                        try { res = tempValidator.move(m, { sloppy: true }); } catch(e) { capturedLogs.push([e]); }
                    }
                    
                    console.error = originalError;

                    if (!res) break; 
                    
                    validSan.push(res.san); 
                    validFull.push(res);    
                }
                
                rawMoves = validSan; 
                if (validFull.length > 0) rawMoves.bestMoveFull = validFull[0]; 
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
#syncMoveHistory() {
        this.moveList = [];
        if (!this.globalHistoryBuffer) {
            this.globalHistoryBuffer = new BigUint64Array(2000);
        }
        this.globalHistoryCount = 0;
        
        let path = [];
        let trace = this.currentNode;
        
        while (trace && trace !== this.rootNode) {
            path.unshift(trace);
            trace = trace.parent;
        }
        
        this.globalHistoryBuffer[this.globalHistoryCount++] = BigInt(this.rootNode.zobrist || 0);

        path.forEach(node => {
            if (node.lastMove) {
                const from = node.lastMove.from === '@' ? 64 : node.lastMove.from;
                const to = node.lastMove.to;
                const flags = node.lastMove.flags || 0;
                
                const packedMove = (from & 0x7F) | ((to & 0x3F) << 7) | ((flags & 0xFF) << 13);
                this.moveList.push(packedMove);
            } else if (node.moveSan) {
                this.moveList.push(node.moveSan);
            }
            
            this.globalHistoryBuffer[this.globalHistoryCount++] = BigInt(node.zobrist || 0);
        });
        this.history = this.globalHistoryBuffer.subarray(0, this.globalHistoryCount);
    }
#executeBotMoveWithDelay(uciMove, isBookMove = false) {
        const now = Date.now();
        const start = this.botThinkStart || now;
        const elapsed = now - start;
        const expectedThinkTime = isBookMove ? 800 : (this.currentBotThinkTime || 1200);
        const delay = Math.max(0, expectedThinkTime - elapsed);

        setTimeout(() => {
            if (this.mode !== 'bot' || !this.isPlayingLiveGame) return;
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
#rebuildNodeMap(root) {
        if (!this.nodeMap) this.nodeMap = new Map();
        this.nodeMap.clear();
        
        const traverse = (node, parent) => {
            if (!parent) {
                let hash = 0; let str = node.fen || "root";
                for(let i=0; i<str.length; i++) hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
                node.id = 'root_' + Math.abs(hash).toString(36);
            } else {
                let str = parent.id + "_" + node.moveSan + "_" + (node.isPV ? "pv" : "m");
                let hash = 0; 
                for(let i=0; i<str.length; i++) hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
                node.id = 'n_' + Math.abs(hash).toString(36);
            }
            this.nodeMap.set(node.id, node);
            if (node.children) {
                node.children.forEach(c => traverse(c, node));
            }
        };
        if (root) traverse(root, null);
    }
#findNodeById(startNode, targetId) {
        if (this.nodeMap && this.nodeMap.has(targetId)) {
            return this.nodeMap.get(targetId);
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
#flatCloneState(stateName) {
        const memSlot = (stateName === 'local' || stateName === 'bot' || stateName === 'play') ? 'play' : stateName;
        let pgnToPersist = this._originalPgn || (typeof this.generatePGN === 'function' ? this.generatePGN() : "");

        return {
            variant: this.gameMode || 'classical',
            mode: this.mode || stateName,
            fen: this.currentNode ? this.currentNode.fen : (typeof INITIAL_FEN !== 'undefined' ? INITIAL_FEN : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
            pgn: pgnToPersist,
            headers: this.pgnHeaders ? { ...this.pgnHeaders } : {},
            history: this.history ? Array.from(this.history, val => val.toString()) : [],
            moveList: this.moveList ? [...this.moveList] : [],
            activeNodeId: this.currentNode ? this.currentNode.id : null,
            
            wTime: this.whiteTime,
            bTime: this.blackTime,
            botColor: this.botColor,
            myColor: this.myColor,
            botLevel: this.botLevel,
            puzzleCursor: this.puzzleCursor,
            puzzleSolution: this.puzzleSolution ? [...this.puzzleSolution] : [],
            puzzleScore: this.puzzleScore,
            puzzleStrikes: this.puzzleStrikes,
            currentPuzzle: this.currentPuzzle || null,
            initialPuzzleFEN: this.initialPuzzleFEN || null,
            puzzleActive: this.puzzleActive || false,
            puzzleMode: this.puzzleMode || 'rush',
            puzzleSolved: this.puzzleSolved || false,
            puzzleQueue: this.puzzleQueue ? [...this.puzzleQueue] : [],
            puzzleIndex: this.puzzleIndex || 0,
            sessionMinRating: this.sessionMinRating || 600,
            sessionMaxRating: this.sessionMaxRating || 3000,
            targetRushRating: this.targetRushRating || 400,

            currentSessionId: this.currentSessionId || null,
            activeChapterIndex: this.activeChapterIndex,
            currentStudyId: this.currentStudyId
        };
    }


#saveState(stateName, immediate = false) {
    if (!stateName) return;
    if (!this.tabMemory) this.tabMemory = { analysis: null, play: null, puzzle: null };
    const memSlot = (stateName === 'local' || stateName === 'bot' || stateName === 'play') ? 'play' : stateName;
    
    const stateSnapshot = this.#flatCloneState(stateName);
    this.tabMemory[memSlot] = stateSnapshot;

    const writeToStorage = () => {
        try {
            localStorage.setItem(`chess_tab_snapshot_${memSlot}`, JSON.stringify(stateSnapshot));
            if (stateSnapshot.pgn) {
                localStorage.setItem(`chess_${memSlot}_variant_pgn_${stateSnapshot.variant}`, stateSnapshot.pgn);
            }
        } catch(e) {
            console.error("Error writing to LocalStorage:", e);
        }
    };

    if (immediate) {
        clearTimeout(this._saveStateDebounce);
        writeToStorage();
    } else {
        clearTimeout(this._saveStateDebounce);
        this._saveStateDebounce = setTimeout(writeToStorage, 300);
    }
}
#restoreState(stateName) {
        if (!stateName) return false;
        if (!this.tabMemory) this.tabMemory = { analysis: null, play: null, puzzle: null };
        
        const memSlot = (stateName === 'local' || stateName === 'bot' || stateName === 'play') ? 'play' : stateName;
        
        let state = null;
        if (this.tabMemory[memSlot]) {
            state = { ...this.tabMemory[memSlot] };
        } else {
            try {
                const stored = localStorage.getItem(`chess_tab_snapshot_${memSlot}`);
                if (stored) {
                    state = JSON.parse(stored);
                    this.tabMemory[memSlot] = state;
                }
            } catch (e) {
                console.error(`Error when parsing into Memory Tab ${memSlot}`, e);
            }
        }

        // Fallback đọc PGN của variant nếu snapshot rỗng
        if ((!state || !state.pgn) && typeof localStorage !== 'undefined') {
            const variantPgn = localStorage.getItem(`chess_${memSlot}_variant_pgn_${this.gameMode}`);
            if (variantPgn) {
                if (!state) state = { variant: this.gameMode, mode: memSlot };
                state.pgn = variantPgn;
            }
        }
        
        this.mode = (memSlot === 'play') ? (state?.mode || 'local') : memSlot;

        if (state) {
            this.gameMode = state.variant || 'classical';
            
            this.#engine = new (typeof Chess === 'function' ? Chess : window.Chess)(undefined, this.gameMode);
            if (this.#engine && typeof this.#engine.setGameMode === 'function') {
                this.#engine.setGameMode(this.gameMode);
            }
            
            this.history = new BigUint64Array(1000);
            this.moveList = [];
            this.pgnHeaders = state.headers ? { ...state.headers } : {};

            if (state.pgn && state.pgn.trim() !== "") {
                if (typeof this.loadPGN === 'function') {
                    this.loadPGN(state.pgn, false, true);
                }
            } else if (state.fen) {
                if (typeof this.loadNewPosition === 'function') this.loadNewPosition(state.fen);
                else if (typeof this.loadFEN === 'function') this.loadFEN(state.fen, this.gameMode, true);
                
                this.rootNode = new MoveNode(state.fen, null);
                this.#rebuildNodeMap(this.rootNode);
                this.currentNode = this.rootNode;
            }

            if (state.headers) this.pgnHeaders = { ...state.headers };
            if (state.history) {
                this.history = new BigUint64Array(state.history.length);
                for (let i = 0; i < state.history.length; i++) {
                    this.history[i] = BigInt(state.history[i]);
                }
            } else {
                this.history = new BigUint64Array(1000);
            }
            
            if (state.moveList) this.moveList = [...state.moveList];
            
            this.whiteTime = state.wTime !== undefined ? state.wTime : 600;
            this.blackTime = state.bTime !== undefined ? state.bTime : 600;
            this.botColor = state.botColor;
            this.myColor = state.myColor;
            this.botLevel = state.botLevel;
            this.puzzleCursor = state.puzzleCursor || 0;
            this.puzzleSolution = state.puzzleSolution ? [...state.puzzleSolution] : [];
            this.puzzleScore = state.puzzleScore || 0;
            this.puzzleStrikes = state.puzzleStrikes || 0;
            this.currentPuzzle = state.currentPuzzle || null;
            this.initialPuzzleFEN = state.initialPuzzleFEN || null;
            this.puzzleActive = state.puzzleActive || false;
            this.puzzleMode = state.puzzleMode || 'rush';
            this.puzzleSolved = state.puzzleSolved || false;
            this.puzzleQueue = state.puzzleQueue ? [...state.puzzleQueue] : [];
            this.puzzleIndex = state.puzzleIndex || 0;
            this.sessionMinRating = state.sessionMinRating || 600;
            this.sessionMaxRating = state.sessionMaxRating || 3000;
            this.targetRushRating = state.targetRushRating || 400;

            if (state.activeChapterIndex !== undefined) this.activeChapterIndex = state.activeChapterIndex;
            if (state.currentStudyId !== undefined) this.currentStudyId = state.currentStudyId;
            
            if (state.activeNodeId && typeof this.goToNodeId === 'function') {
                let success = this.goToNodeId(state.activeNodeId, false);
                if (!success && state.fen) {
                    let target = null;
                    const searchFen = (node) => {
                        if (node.fen === state.fen) { target = node; return; }
                        for (let c of node.children) searchFen(c);
                    };
                    if (this.rootNode) searchFen(this.rootNode);
                    if (target) this.goToNodeId(target.id, false);
                }
            }

            if (this.currentNode && typeof this.loadFEN === 'function') {
                this.loadFEN(this.currentNode.fen, this.gameMode, true);
            }

            // 2. Ép UI xoá cache để vẽ lại khung metadata và tên kỳ thủ ngay lập tức khi F5 xong
            if (this.#ui) {
                this.#ui._lastMetadataCache = null;
                this.#ui._lastHeadersCache = null;
                if (typeof this.#ui.displayMetadata === 'function') {
                    this.#ui.displayMetadata(this.pgnHeaders);
                }
                if (typeof this.#ui.renderHeaders === 'function') {
                    this.#ui.renderHeaders();
                }
            }

            return true;
        }

        let startFen = typeof this.#getStartingFen === 'function' 
            ? this.#getStartingFen(this.gameMode) 
            : (typeof INITIAL_FEN !== 'undefined' ? INITIAL_FEN : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
            
        this.#engine = new (typeof Chess === 'function' ? Chess : window.Chess)();
        if (this.#engine && typeof this.#engine.setGameMode === 'function') {
            this.#engine.setGameMode(this.gameMode);
        }
        this.rootNode = new MoveNode(startFen, null);
        this.#rebuildNodeMap(this.rootNode);
        this.currentNode = this.rootNode;
        this.history = new BigUint64Array(1000);
        this.moveList = [];
        this.pgnHeaders = {};
        
        if (typeof this.loadFEN === 'function') {
            this.loadFEN(startFen, this.gameMode, true);
        }
        return false;
    }
#prepareNewGameSetup() {
        // Core Guard: If a new game initialization is triggered while we are still 
        // lingering on an active analysis or study tab, force-save its state right now!
        if (this.mode === 'analysis' || this.mode === 'study' || this.mode === 'puzzle') {
            if (typeof this.#saveState === 'function') {
                this.#saveState(this.mode);
            }
            if (this.mode === 'study' && typeof this.saveActiveChapter === 'function') {
                this.saveActiveChapter();
            }
        }
    }
#parsePGNTokens(tokens, index = 0) {
        const tlRegex = /tl\s*=\s*(-?\d+(\.\d+)?)/i;
        const lichessEvalRegex = /\[%eval\s+([#]?[+-]?[\d\.]+)\]/i; 
        const lichessClkRegex = /\[%clk\s+([0-9:\.]+)\]/i; 
        const cccEvalRegex = /([+-]?(?:M)?\d+(?:\.\d+)?)\/(\d+)/i; 
        const lichessCalRegex = /\[%cal\s+([^\]]+)\]/i;
        const lichessCslRegex = /\[%csl\s+([^\]]+)\]/i;

        const decodeLichessColor = (c) => {
            if (c === 'R') return 'red';
            if (c === 'B') return 'blue';
            if (c === 'Y') return 'yellow';
            return 'green'; 
        };

        // Ngăn xếp (Stack) thay thế hoàn toàn đệ quy để chống tràn bộ nhớ và dứt điểm lỗi cú pháp private
        const nodeStack = [];
        let i = index || 0;

        while (i < tokens.length) {
            let token = tokens[i].trim();
            if (!token) { i++; continue; }

            // 1. MỞ NGOẶC NHÁNH BIẾN THỂ '(' -> PUSH VÀO STACK
            if (token === '(') {
                nodeStack.push({
                    savedNode: this.currentNode,
                    savedW: this.currentWTime,
                    savedB: this.currentBTime,
                    savedFen: this.#engine.fen()
                });

                if (this.currentNode && this.currentNode.parent) {
                    this.currentNode = this.currentNode.parent;
                    if (this.currentNode.fen) {
                        try { this.#engine.load(this.currentNode.fen); } catch(e) {}
                    }
                }
                i++;
                continue;
            }

            // 2. ĐÓNG NGOẶC BIẾN THỂ ')' -> POP RA KHÔI PHỤC
            if (token === ')') {
                if (nodeStack.length > 0) {
                    const frame = nodeStack.pop();
                    this.currentNode = frame.savedNode;
                    this.currentWTime = frame.savedW;
                    this.currentBTime = frame.savedB;
                    try { this.#engine.load(frame.savedFen); } catch(e) {}
                }
                i++;
                continue;
            }

            // 3. KÝ HIỆU ĐÁNH GIÁ (NAGs)
            if (token.startsWith('$') || /^[!?]+$/.test(token)) {
                if (this.currentNode) {
                    this.currentNode.nag = (this.currentNode.nag ? this.currentNode.nag + "," : "") + token;
                }
                i++;
                continue;
            }

            // 4. BÌNH LUẬN & TELEMETRY ENGINE {...}
            if (token.startsWith('{')) {
                let rawComment = token.replace(/^\{|\}$/g, '').trim();

                // Nhãn {book} độc lập của engine
                if (/^\s*book\s*$/i.test(rawComment)) {
                    this.currentNode.isBook = true;
                    this.currentNode.engineDetails = "book";
                    this.currentNode.comment = null;
                    i++;
                    continue;
                }

                // Tách các thẻ Lichess: [%eval ...], [%clk ...], [%cal ...], [%csl ...]
                let lichessTags = [];
                let nonLichess = rawComment.replace(/\[%[^\]]+\]/g, (m) => {
                    lichessTags.push(m);
                    return '';
                }).trim();

                // Khối nhận diện telemetry CCC/TCEC khép kín hợp lệ
                const cccTelemetryRegex = /([+-]?(?:M)?\d+(?:\.\d+)?\/\d+[\s\S]*?tl=[\d\.\-]+s?[\s\S]*?pv=(?:\\*["'])?[^"}\\]*(?:\\*["'])?)|([+-]?(?:M)?\d+(?:\.\d+)?\/\d+[\s\S]*?(?:tl=[\d\.\-]+s?|nps=\d+|pv=[\s\S]*?))|(tl=[\d\.\-]+s?[\s\S]*?nps=\d+)/i;
                
                let enginePart = "";
                let humanPart = nonLichess;

                let cccMatch = nonLichess.match(cccTelemetryRegex);
                if (cccMatch) {
                    enginePart = cccMatch[0].trim();
                    humanPart = nonLichess.replace(enginePart, '')
                                          .replace(/^,\s*|,\s*$/g, '')
                                          .replace(/\s{2,}/g, ' ')
                                          .trim();
                } else {
                    const shortEngineRegex = /^[+-]?(?:M)?\d+(?:\.\d+)?\/\d+(\s+\d+(\.\d+)?s)?/i;
                    let shortMatch = nonLichess.match(shortEngineRegex);
                    if (shortMatch) {
                        enginePart = shortMatch[0].trim();
                        humanPart = nonLichess.replace(enginePart, '')
                                              .replace(/^,\s*|,\s*$/g, '')
                                              .trim();
                    }
                }

                if (/\bbook\b/i.test(enginePart)) {
                    this.currentNode.isBook = true;
                }

                this.currentNode.comment = (humanPart && humanPart !== '-' && humanPart !== ',-') ? humanPart : null;
                
                let totalEngineDetails = [];
                if (enginePart) totalEngineDetails.push(enginePart);
                if (lichessTags.length > 0) totalEngineDetails.push(lichessTags.join(' '));
                this.currentNode.engineDetails = totalEngineDetails.length > 0 ? totalEngineDetails.join(' ') : null;

                // A. Parse Lichess Eval
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
                                this.currentNode.eval = (val > 0 ? "+M" : "-M") + Math.abs(val);
                                this.currentNode.evalScore = val > 0 ? 100000 - Math.abs(val) : -100000 + Math.abs(val);
                            }
                        } else {
                            this.currentNode.eval = (val > 0 ? "+" : "") + val.toFixed(2);
                            this.currentNode.evalScore = val * 100;
                        }
                    }
                }

                // B. Parse CCC Eval
                if (!this.currentNode.eval) {
                    let engMatch = rawComment.match(/([+-])?(M)?(\d+(\.\d+)?)\/(\d+)/i);
                    if (engMatch) {
                        let depth = parseInt(engMatch[5], 10);
                        if (depth > 0) { 
                            let sign = engMatch[1] === '-' ? -1 : 1;
                            let isMate = engMatch[2] === 'M';
                            let val = parseFloat(engMatch[3]);
                            let justMovedColor = this.currentNode.lastMove 
                                ? this.currentNode.lastMove.color 
                                : (this.currentNode.fen.split(' ')[1] === 'w' ? 'b' : 'w');

                            if (this.isEngineMatch && justMovedColor === 'b') {
                                sign *= -1;
                            }

                            if (!isNaN(val)) {
                                if (isMate) {
                                    let rawEval = sign > 0 ? (100000 - val) : (-100000 + val);
                                    this.currentNode.evalScore = rawEval;
                                    this.currentNode.eval = (sign > 0 ? "+M" : "-M") + Math.abs(val);
                                } else {
                                    let rawEval = sign * val * 100;
                                    this.currentNode.evalScore = rawEval;
                                    this.currentNode.eval = (sign > 0 ? "+" : "") + (sign * val).toFixed(2);
                                }
                                this.currentNode.depth = depth;
                            }
                        }
                    }
                }

                // C. Parse Clocks & Telemetry
                const clkMatch = rawComment.match(lichessClkRegex);
                const tlMatch = rawComment.match(tlRegex);
                const npsMatch = rawComment.match(/nps=(\d+)/i);
                const latencyMatch = rawComment.match(/latency=([\d\.]+)s?/i);
                
                let timeLeft = null;

                if (clkMatch) {
                    const parts = clkMatch[1].split(':');
                    timeLeft = parts.reduce((acc, time) => (60 * acc) + parseFloat(time), 0);
                } else if (tlMatch) {
                    timeLeft = parseFloat(tlMatch[1]);
                    this.currentNode.cccTimeLeft = tlMatch[1]; 
                }
                
                if (npsMatch) this.currentNode.nps = npsMatch[1];
                if (latencyMatch) this.currentNode.latency = latencyMatch[1];

                // Bắt chính xác chuỗi PV ngay cả khi có dấu nháy thoát pv=\"...\"
                const pvMatch = rawComment.match(/pv\s*=\s*\\*["']?([^"}\\]+)/i);
                if (pvMatch && pvMatch[1]) {
                    this.currentNode.pv = pvMatch[1].trim();
                }

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
                
                // D. Parse Shapes
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

                const isEngineLog = rawComment.includes('pv=') || 
                                    rawComment.includes('nps=') ||
                                    cccEvalRegex.test(rawComment);

                if (isEngineLog && typeof this.#processEngineComment === 'function') {
                    this.#processEngineComment(this.currentNode, rawComment);
                }

                i++;
                continue;
            }
            else {
                // 5. NƯỚC ĐI (MOVES)
                if (!['*', '1-0', '0-1', '1/2-1/2'].includes(token) && !token.endsWith('.')) {
                    
                    if (['+-', '-+', '=', '+=', '=+', '±', '∓', '∞', '⩲', '⩱'].includes(token)) {
                        if (this.currentNode) {
                            this.currentNode.nag = (this.currentNode.nag ? this.currentNode.nag + "," : "") + token;
                        }
                        i++;
                        continue;
                    }

                    let moveText = token;
                    let attachedNag = "";
                    const sanRegex = /^([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?(?:@[a-h][1-8])?[\+#]?|[a-h][1-8](?:=[QRBN])?[\+#]?|O-O-O(?:@[a-h][1-8])?[\+#]?|O-O(?:@[a-h][1-8])?[\+#]?)(.*)$/;
                    let match = token.match(sanRegex);
                    
                    if (match && match[1]) { 
                        moveText = match[1]; 
                        attachedNag = match[2]; 
                    } else {
                        let fallbackMatch = token.match(/^([a-zA-Z0-9\+#\-@=]+?)([!?[\]±∓∞⩲⩱]|\+\-|\-\+|\+\/-|-\/\+)+$/);
                        if (fallbackMatch) {
                            moveText = fallbackMatch[1];
                            attachedNag = fallbackMatch[2];
                        }
                    }

                    let engineInput = moveText; 

                    if (typeof engineInput === 'string' && engineInput.includes('_')) {
                        const restoredStr = engineInput.replace(/([A-Za-z]+@[a-h][1-8])_([A-Za-z0-9+#=O\-]+)/, "$1 $2");
                        engineInput = restoredStr;
                        moveText = restoredStr; 
                    }

                    const uciMatch = (typeof engineInput === 'string') ? engineInput.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i) : null;
                    if (uciMatch) engineInput = { from: uciMatch[1], to: uciMatch[2], promotion: uciMatch[3] ? uciMatch[3].toLowerCase() : undefined };

                    let moveObj = null;
                    const originalError = console.error;
                    console.error = () => {}; 
                    
                    try {
                        moveObj = this.#engine.move(engineInput, { sloppy: true });
                    } catch(e) {
                        moveObj = null;
                    }
                    console.error = originalError;

                    if (!moveObj) {
                        if (moveText.includes(':') || moveText.includes('/') || moveText.length > 8) {
                            i++;
                            continue;
                        }
                    }
                    
                    let isIllegal = !moveObj;
                    if (isIllegal) {
                        moveObj = { san: moveText, from: -1, to: -1, flags: '', color: this.#engine.turn(), piece: '' };
                    }

                    // 👉 FIX TRIỆT ĐỂ MẤT DẤU '+': Khôi phục lại toàn bộ dấu '+' và '#' từ moveText gốc hoặc kiểm tra in_check()
                    let finalSanToSave = moveObj.san;
                    if (moveText.includes('+') && !finalSanToSave.includes('+') && !finalSanToSave.includes('#')) {
                        finalSanToSave += '+';
                    } else if (moveText.includes('#') && !finalSanToSave.includes('#')) {
                        finalSanToSave += '#';
                    } else if (!isIllegal && this.#engine.in_check() && !finalSanToSave.includes('+') && !finalSanToSave.includes('#')) {
                        finalSanToSave += '+';
                    }

                    if (!isIllegal && typeof moveText === 'string') {
                        let spaceIdx = moveText.indexOf(' ');
                        if (spaceIdx !== -1) {
                            let prefix = moveText.substring(0, spaceIdx);
                            if (prefix.includes('@') && (prefix.startsWith('F') || prefix.startsWith('J'))) {
                                if (!finalSanToSave.startsWith(prefix)) {
                                    finalSanToSave = `${prefix} ${finalSanToSave}`; 
                                }
                            }
                        }
                    }

                    const newNode = new MoveNode(this.#engine.fen(), finalSanToSave);
                    newNode.lastMove = {
                        from: isIllegal ? -1 : this.#squareToIndex(moveObj.from),
                        to: isIllegal ? -1 : this.#squareToIndex(moveObj.to),
                        flags: moveObj.flags, 
                        piece: moveObj.piece, 
                        color: moveObj.color
                    };
                    
                    if (attachedNag) {
                        const separatedNags = attachedNag.match(/!!|\?\?|!\?|\?!|[!?]|[\+\-]{2}|[=±∓∞⩲⩱]|\+\/-|-\/\+/g);
                        if (separatedNags) newNode.nag = separatedNags.join(',');
                        else newNode.nag = attachedNag;
                    }
                    if (isIllegal) newNode.isIllegal = true;

                    newNode.parent = this.currentNode;
                    this.currentNode.children.push(newNode);

                    if (this.currentNode.children.length > 1 && this.isLoadingPGN) {
                        this.currentNode.children.sort((a, b) => {
                            if (a.isPV === b.isPV) return 0;
                            return a.isPV ? 1 : -1; 
                        });
                    }
                    this.currentNode = newNode;
                    this.currentNode.clock = { w: this.currentWTime, b: this.currentBTime };
                }
                i++;
            }
        }
        return i;
    }
#addPVToNode(node, pvString) {
        if (!pvString || !node) return;

        let savedNode = this.currentNode;
        let savedFen = this.#engine.fen();

        let moves = pvString.trim().split(/\s+/);
        if (moves.length === 0) return;

        let startNode = node.parent || node;
        let loadFen = (node.parent && node.parent.fen) ? node.parent.fen : node.fen;
        let pvMovesToPlay = moves;

        if (node.parent) {
            try {
                // Kiểm tra xem moves[0] là nước đi từ node.parent (ví dụ c1e3) hay từ node (ví dụ f8e7)
                this.#engine.load(node.fen);
                let firstMoveText = moves[0].replace(/[?!+#]+$/, '');
                let uM = firstMoveText.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
                let testInput = uM 
                    ? { from: uM[1], to: uM[2], promotion: uM[3] ? uM[3].toLowerCase() : undefined }
                    : firstMoveText;
                
                let testMove = null;
                const origErr = console.error; console.error = () => {};
                try { testMove = this.#engine.move(testInput, { sloppy: true }); } catch(e) {}
                console.error = origErr;

                if (testMove) {
                    // moves[0] đi được từ node -> PV bắt đầu từ sau nước đi hiện tại
                    startNode = node;
                    loadFen = node.fen;
                    pvMovesToPlay = moves;
                } else {
                    // moves[0] là nước đi từ node.parent (ví dụ c1e3 là nước 9. Be3 sau 8... g6)
                    startNode = node.parent;
                    loadFen = node.parent.fen;
                    pvMovesToPlay = moves;
                }
            } catch(e) {
                startNode = node.parent;
                loadFen = node.parent.fen;
                pvMovesToPlay = moves;
            }
        }

        if (pvMovesToPlay.length === 0) return;

        this.currentNode = startNode;
        try { 
            this.#engine.load(loadFen); 
        } catch(e) { 
            this.currentNode = savedNode;
            return; 
        }

        for (let i = 0; i < pvMovesToPlay.length; i++) {
            let moveText = pvMovesToPlay[i].replace(/[?!+#]+$/, '');
            if (!moveText) continue;

            let uM = moveText.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
            let eInput = uM 
                ? { from: uM[1], to: uM[2], promotion: uM[3] ? uM[3].toLowerCase() : undefined }
                : moveText;

            let moveObj = null;
            const origErr = console.error; console.error = () => {};
            try { moveObj = this.#engine.move(eInput, { sloppy: true }); } catch(e) {}
            if (!moveObj) {
                try { moveObj = this.#engine.move(moveText, { sloppy: true }); } catch(e) {}
            }
            console.error = origErr;

            if (!moveObj) break;

            let moveData = {
                from: typeof this.#squareToIndex === 'function' ? this.#squareToIndex(moveObj.from) : -1,
                to: typeof this.#squareToIndex === 'function' ? this.#squareToIndex(moveObj.to) : -1,
                flags: moveObj.flags, 
                piece: moveObj.piece, 
                color: moveObj.color
            };

            this.#addMoveToTree(this.#engine.fen(), moveObj.san, moveData.to, moveData);
        }

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
            // Disable Sublines in Live Play
            if (this.mode === 'bot' || this.mode === 'local' || this.mode === 'play') {
                this.currentNode.children = [];
            }

            let newNode = new MoveNode(fen, moveSan, this.currentNode, "", 0, toSq);
            newNode.lastMove = moveData;
            newNode.isPV = isPVMove;
            
            if (!this.nodeMap) this.nodeMap = new Map();
            let str = this.currentNode.id + "_" + moveSan + "_" + (isPVMove ? "pv" : "m");
            let hash = 0; 
            for (let i = 0; i < str.length; i++) hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
            newNode.id = 'n_' + Math.abs(hash).toString(36);
            this.nodeMap.set(newNode.id, newNode);

            this.currentNode.children.push(newNode);
            const newIdx = this.currentNode.children.indexOf(newNode);
            if (this.currentNode.children.length === 1) this.currentNode.selectedChildIndex = 0;
            else if (!isPVMove && !this.isLoadingPGN) this.currentNode.selectedChildIndex = newIdx;

            this.currentNode = newNode;
        }

        if (this.isLoadingPGN || isPVMove) return;

        if (typeof this.#syncMoveHistory === 'function') this.#syncMoveHistory();

        // TAB AUTOSAVE LOGIC
        if (this.mode === 'analysis') {
            this.#saveState('analysis');
        } else if (this.mode === 'study') {
            if (typeof this.saveActiveChapter === 'function') this.saveActiveChapter();
        } else if (this.mode === 'local' || this.mode === 'bot') {
            this.#saveState('play');
        } else if (this.mode === 'puzzle') {
            this.#saveState('puzzle');
        }
        
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
        }
        
        // 1. Extract Depth & Flip Eval if necessary
        const scoreRegex = /([+-]?(?:M\d+|\d+\.\d+|\d+))\/(\d+)/;
        const scoreMatch = rawComment.match(scoreRegex);

        if (scoreMatch) {
            node.depth = parseInt(scoreMatch[2], 10);
        }
        
        // 2. Build the PV Variation Tree
        const pvMatch = rawComment.match(/pv\s*=\s*\\*["']?([^"}\\]+)/i);
        if (pvMatch && pvMatch[1]) {
            this._isParsingPV = true;
            if (typeof this.#addPVToNode === 'function') {
                this.#addPVToNode(node, pvMatch[1].trim());
            }
            this._isParsingPV = false;
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
        let winner = "Draw";
        if (resultStr === "1-0") winner = "White";
        else if (resultStr === "0-1") winner = "Black";
        
        let reason = statusMsg;
        if (statusMsg.includes(' wins ')) reason = statusMsg.split(' wins ')[1]; 
        else if (statusMsg.startsWith('Draw ')) reason = statusMsg.substring(5);
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

        let lastTime = Date.now();
        this.#timerInterval = setInterval(() => {
            let now = Date.now();
            let deltaSeconds = (now - lastTime) / 1000; 
            lastTime = now;

            if (this.gameOver || this.isEditing || this.isAnalysisMode || this.isPaused || !this.isPlayingLiveGame) {
                return; 
            }
            
            const liveTurn = this.currentLiveTurn;

            if (liveTurn === 'w') {
                this.whiteTime = Math.max(0, this.whiteTime - deltaSeconds);
                
                if (this.whiteTime <= 10 && this.whiteTime > 0 && !wWarningPlayed) {
                    this.#emit('soundTriggered', { type: 'lowtime' });
                    wWarningPlayed = true;
                }
                
                if (this.whiteTime <= 0) {
                    if (this.#engine && typeof this.#engine.insufficient_material === 'function' && this.#engine.insufficient_material()) {
                        this.#endGame('1/2-1/2', 'Draw vs Insufficient Material');
                    } else {
                        this.#endGame('0-1', 'Black wins on time'); 
                    }
                }
            } else { 
                this.blackTime = Math.max(0, this.blackTime - deltaSeconds);
                
                if (this.blackTime <= 10 && this.blackTime > 0 && !bWarningPlayed) {
                    this.#emit('soundTriggered', { type: 'lowtime' });
                    bWarningPlayed = true;
                }
                
                if (this.blackTime <= 0) {
                    if (this.#engine && typeof this.#engine.insufficient_material === 'function' && this.#engine.insufficient_material()) {
                        this.#endGame('1/2-1/2', 'Draw vs Insufficient Material');
                    } else {
                        this.#endGame('1-0', 'White wins on time'); 
                    }
                }
            }
        }, 50); 
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
        
        if (this.mode !== 'puzzle' && this.mode !== 'puzzles') {
            if (!this.tabMemory) this.tabMemory = { analysis: null, play: null, puzzle: null };
            
            const pRoot = new MoveNode(p.fen, null);
            this.tabMemory['puzzle'] = {
                rootNode: pRoot,
                currentNode: pRoot,
                history: [],
                moveList: [],
                headers: {
                    "Event": `Chess Puzzle #${p.id || 'Unknown'}`,
                    "FEN": p.fen,
                    "SetUp": "1"
                },
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
                fen: p.fen, pgn: "", headers: this.tabMemory['puzzle'].headers, wTime: 600, bTime: 600, activeNodeId: pRoot.id
            }));
            
            return; // Abort visual rendering to protect the active Analysis tab!
        }

        // Normal Execution
        this.history = [];  
        this.pgn = "";  
        
        this.pgnHeaders = {
            "Event": `Chess Puzzle #${p.id || 'Unknown'}`,
            "Site": "Chess.com",
            "FEN": p.fen,
            "SetUp": "1"
        }; 
        
        this.rootNode = new MoveNode(p.fen, null);
        this.currentNode = this.rootNode;
        
        const pgnBox = document.getElementById('pgnDisplay');
        if (pgnBox) {
            if (pgnBox.tagName === 'INPUT' || pgnBox.tagName === 'TEXTAREA') pgnBox.value = "";
            else pgnBox.innerText = "";
        }
        
        const analysisBtn = document.getElementById('analysisBtn');
        if (analysisBtn) analysisBtn.style.display = 'none';
        const hintBtn = document.getElementById('hintBtn');
        if (hintBtn) hintBtn.style.display = 'none';
        const resetBtn = document.getElementById('resetPuzzleBtn');
        if (resetBtn) resetBtn.style.display = 'none';

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

        const protectedMode = this.gameMode; 

        if (this.#engine && typeof this.#engine.setGameMode === 'function') {
            this.#engine.setGameMode('classical');
        }

        this.gameOver = false;
        this.puzzleSolved = false;
        this.currentPuzzleFailed = false;
        this.initialPuzzleFEN = p.fen;
        
        // Load the puzzle using standard rules
        this.loadFEN(p.fen, 'classical'); 
        
        // Instantly restore the global mode so tab switching and FEN generation doesn't break!
        this.gameMode = protectedMode;
        
        const opponentColor = this.#engine.turn();
        const wantFlipped = (opponentColor === 'w');
        this.playerColor = (opponentColor === 'w') ? 'b' : 'w';
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
            const engineBtn = document.querySelector('.engine-toggle-btn');
            if (engineBtn) { 
                engineBtn.style.opacity = '1'; 
                engineBtn.style.cursor = 'pointer'; 
            }
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
                if (analysisBtn) analysisBtn.style.display = 'none';

                const hintBtn = document.getElementById('hintBtn');
                if (hintBtn) hintBtn.style.display = 'flex';
                
                const resetBtn = document.getElementById('resetPuzzleBtn');
                if (resetBtn) resetBtn.style.display = 'flex';
            }
            if (this.#ui.updatePuzzleStats) this.#ui.updatePuzzleStats();
        }

        const engineBtn = document.querySelector('.engine-toggle-btn');
        if (engineBtn) { 
            engineBtn.style.opacity = '0.5'; 
            engineBtn.style.cursor = 'not-allowed'; 
        }

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
#generatePGNRecursive(node, moveNum, forceNumber = false, format = 'both', lastColor = null) {
        if (!node || !node.children || node.children.length === 0) return "";
        
        let pgn = "";
        let activeIdx = 0; 
        let mainChild = node.children[activeIdx];

        if (mainChild.isPV) {
            let hasManualVariation = false;
            for (let i = 1; i < node.children.length; i++) {
                if (!node.children[i].isPV) {
                    hasManualVariation = true;
                    break;
                }
            }
            if (!hasManualVariation) return ""; 
        }
        
        let parentFen = node.fen || this.#getStartingFen();        
        let fenParts = parentFen.split(' ');
        let moveColor = fenParts[1] || 'w'; 
        let mNum = parseInt(fenParts[5] || 1, 10);

        let prefix = "";
        let isFirstNode = (node === this.rootNode);
        let colorChanged = (moveColor !== lastColor);

        if (colorChanged || isFirstNode) {
            if (moveColor === 'w') {
                prefix = `${mNum}. `;
            } else {
                // For Black, standard PGN hides the number unless forced by a variation/start
                if (forceNumber || isFirstNode) {
                    prefix = `${mNum}... `;
                }
            }
        }

        pgn += `${prefix}${mainChild.moveSan}`;
        
        if (mainChild.nag) {
            let nags = mainChild.nag.toString().split(',');
            nags.forEach(n => {
                let cleanN = n.trim().replace('$', '');
                let nagMap = { "1":"!", "2":"?", "3":"!!", "4":"??", "5":"!?", "6":"?!", "10":"=" };
                if (nagMap[cleanN]) pgn += nagMap[cleanN];
                else if (cleanN.match(/^[!?]+$/)) pgn += cleanN; 
                else pgn += ` $${cleanN}`; 
            });
        }

        let mainComment = this.#evalPGNGenerate(mainChild, format);
        if (mainComment) pgn += ` ${mainComment}`;

        let hadVariations = false;
        if (node.children.length > 1) {
            for (let i = 0; i < node.children.length; i++) {
                if (i === activeIdx) continue;
                let varChild = node.children[i];
                
                // Nhánh PV đã nằm trong comment { ... pv="..." }, không in ra ngoặc đơn để tránh nhân bản khi load lại
                if (varChild.isPV) {
                    continue; 
                }
                hadVariations = true;
                
                let varPrefix = moveColor === 'w' ? `${mNum}. ` : `${mNum}... `;
                varPrefix += varChild.moveSan;
                
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
                let subVarText = this.#generatePGNRecursive(varChild, mNum, forceVarNextNumber, format, moveColor);
                pgn += ` (${varPrefix}${varComment ? " " + varComment : ""}${subVarText ? " " + subVarText : ""})`;
            }
        }

        // Only variations should force the main line to re-print its move number. Comments should NOT!
        let forceNextNumber = hadVariations; 
        let nextPgn = this.#generatePGNRecursive(mainChild, mNum, forceNextNumber, format, moveColor);
        
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
#translate4PCtoStandard(str) {
        // Maps files d-k to a-h, and ranks 4-11 to 1-8
        return str.replace(/([d-k])(14|13|12|11|10|[4-9])/g, (match, file, rank) => {
            const standardFile = String.fromCharCode('a'.charCodeAt(0) + (file.charCodeAt(0) - 'd'.charCodeAt(0)));
            const standardRank = parseInt(rank, 10) - 3;
            return standardFile + standardRank;
        });
    }
#normalizeVariantToken(token, isFFA) {
        let moveData = {
            raw: token,
            cleaned: token,
            spell: null,
            duck: null,
            drop: null
        };

        // 1. Handle Setup Chess / Placement Drops
        const dropMatch = token.match(/^([RNBQK])?@\d+_[ry]([RNBQKP])([a-k][0-9]+)/);
        if (dropMatch) {
            let dropSq = dropMatch[3];
            if (isFFA) dropSq = this.#translate4PCtoStandard(dropSq);
            moveData.drop = { piece: dropMatch[2], square: dropSq };
            moveData.cleaned = `${dropMatch[2]}@${dropSq}`;
            return moveData;
        }

        // 2. Extract Spell Actions
        const spellMatch = token.match(/(freeze|jump)@([a-k][0-9]+)/);
        if (spellMatch) {
            let spellSq = spellMatch[2];
            if (isFFA) spellSq = this.#translate4PCtoStandard(spellSq);
            moveData.spell = { type: spellMatch[1], square: spellSq };
            token = token.replace(/(freeze|jump)@([a-k][0-9]+)&?/, '');
        }

        // 3. Extract Duck Placements
        const duckMatch = token.match(/&Θ(?:[a-k][0-9]+-)?([a-k][0-9]+)/);
        if (duckMatch) {
            let duckSq = duckMatch[1];
            if (isFFA) duckSq = this.#translate4PCtoStandard(duckSq);
            moveData.duck = { square: duckSq };
            token = token.replace(/&Θ.*/, '');
        }

        // 4. Translate 4PC coordinates to Standard 8x8 Strict UCI
        if (isFFA) {
            token = this.#translate4PCtoStandard(token);
            
            // Convert full LAN to UCI (e.g., Bf8-b4+ -> f8b4)
            const lanMatch = token.match(/^([A-Z]?)([a-h][1-8])([-x])([A-Z]?)([a-h][1-8])(=[A-Za-z])?([+#]?)$/);
            if (lanMatch) {
                token = lanMatch[2] + lanMatch[5] + (lanMatch[6] ? lanMatch[6].replace('=', '').toLowerCase() : '');
            } else if (/^[a-h][1-8]-[a-h][1-8]/.test(token)) {
                token = token.replace('-', ''); // Fallback conversion for simple hyphens
            }
        }

        moveData.cleaned = token;
        return moveData;
    }
    
//Public API calling
saveState(stateName, immediate = false) {
    this.#saveState(stateName, immediate);
}
restoreState(stateName) { return this.#restoreState(stateName); }
squareToIndex(sq) { return this.#squareToIndex(sq); }
indexToSquare(idx) { return this.#indexToSquare(idx); }
validateFen(fen) {
        if (!this.#engine) return { valid: false, error: 'Engine not loaded' };
        return this.#engine.validate_fen(fen);
    }
switchMode(targetMode) {
        this.#changeMode(targetMode);
    }
switchToAnalysis() {
        if (!this.currentPuzzle) return;

        // 1. SILENTLY GENERATE THE FULL PGN OF THE SOLVED PUZZLE!
        // We must do this *before* we switch tabs, otherwise we lose the move history.
        let solvedPgn = typeof this.generatePGN === 'function' ? this.generatePGN() : "";

        // 2. Load the headers for the engine
        this.pgnHeaders = {
            "Event": `Chess Puzzle #${this.currentPuzzle.id}`,
            "FEN": this.initialPuzzleFEN,
            "SetUp": "1"
        };

        // 3. EXPLICIT OVERWRITE: Push the puzzle data safely into the Analysis memory slot
        if (!this.tabMemory) this.tabMemory = { analysis: null, play: null, puzzle: null };
        this.tabMemory['analysis'] = {
            rootNode: this.rootNode,
            currentNode: this.currentNode,
            history: [...this.history],
            moveList: [...this.moveList],
            headers: { ...this.pgnHeaders },
            wTime: this.whiteTime,
            bTime: this.blackTime,
            pgn: solvedPgn
        };

        // 4. Switch the internal game state over
        this.mode = 'analysis';
        this.gameOver = false;

        // 5. Save to localStorage to persist the switch
        if (typeof this.#saveState === 'function') {
            this.#saveState('analysis');
        }

        // 6. Send command to the UI to physically switch the tab
        if (this.#ui) {
            if (typeof this.#ui.displayMetadata === 'function') {
                this.#ui.displayMetadata(this.pgnHeaders);
            }
            if (typeof this.#ui.switchTab === 'function') {
                this.#ui.switchTab('analysis');
            }
            
            if (solvedPgn && typeof this.loadPGN === 'function') {
                this.loadPGN(solvedPgn, false, true);
            }
            
            if (typeof this.#ui.updateHistory === 'function') {
                this.#ui.updateHistory(true);
            }
        }
    }
editBoard(idx, piece) {
        if (this.mode !== 'editor') return;
        
        let finalPiece = null;
        if (piece) {
            finalPiece = { ...piece };
            if (!finalPiece.id) {
                finalPiece.id = typeof this.getUID === 'function' ? this.getUID() : 'p_' + Math.random().toString(36).substr(2, 9);
            }
        }

        this.#board[idx] = finalPiece;
        
        if (typeof this.syncEngineToBoard === 'function') this.syncEngineToBoard();
        if (typeof this.generateFEN === 'function') {
            const newFen = this.generateFEN();
            if (this.currentNode) this.currentNode.fen = newFen;
            
            // Just update the FEN header natively
            if (!this.pgnHeaders) this.pgnHeaders = {};
            this.pgnHeaders['FEN'] = newFen;
            this.pgnHeaders['SetUp'] = '1';

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
        
        this.#emit('boardUpdated', { skipEngine: true });
    }
clearAnnotations() {
        if (!this.currentNode) return;
        if (this.currentNode.arrows) this.currentNode.arrows = [];
        if (this.currentNode.circles) this.currentNode.circles = [];
        
        if (this.mode === 'study') this.saveActiveChapter();
        else if (this.mode === 'analysis') this.#saveState('analysis');
        
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
draftSpell(spellType, targetSq) {
        let algSq = typeof targetSq === 'number' ? this.#indexToSquare(targetSq) : targetSq;
        
        if (this.#engine && typeof this.#engine.draft_spell === 'function') {
            let res = this.#engine.draft_spell(spellType, algSq);
            
            this.#emit('boardUpdated', { skipEngine: true });
            
            return res;
        }
        return null;
    }
cancelDraft() {
        if (this.#engine && typeof this.#engine.cancel_draft === 'function') {
            this.#engine.cancel_draft();
        }
    }
getLegalMoves(squareIdx) {
        console.log(`[CHESSGAME] Requesting legal moves for UI squareIdx: ${squareIdx}`);
        if (!this.#engine) return [];
        
        const moves = this.#engine.moves({ verbose: true }, true);
        
        let mapped = moves.map(m => {
            let out = {
                from: this.#squareToIndex(m.from),
                to: this.#squareToIndex(m.to),
                san: m.san,
                promotion: m.promotion,
                isCapture: m.flags.includes('c') || m.flags.includes('e')
            };
            if (m.duck_sq !== undefined) out.duck_sq = this.#squareToIndex(m.duck_sq);
            return out;
        });

        if (squareIdx !== undefined && squareIdx !== null && squareIdx !== 'w' && squareIdx !== 'b') {
            const sqInt = parseInt(squareIdx, 10);
            if (!isNaN(sqInt) && sqInt >= 0 && sqInt <= 63) {
                let filtered = mapped.filter(m => m.from === sqInt);
                console.log(`[CHESSGAME] Returned ${filtered.length} legal moves to UI:`, filtered);
                return filtered;
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
saveVariantState(modeToSave) {
    if (!modeToSave) return;
    let pgnToSave = this._originalPgn || (typeof this.generatePGN === 'function' ? this.generatePGN() : "");
    if (pgnToSave && pgnToSave.trim() !== '') {
        const tabContext = (this.mode === 'local' || this.mode === 'bot' || this.mode === 'play') ? 'play' : (this.mode || 'analysis');
        localStorage.setItem(`chess_${tabContext}_variant_pgn_${modeToSave}`, pgnToSave);
    }
}
setGameMode(mode, isInitialLoad = false, skipStorage = false) {
        if (!mode) return;
        if (!isInitialLoad && this.gameMode === mode) return;

        const oldMode = this.gameMode;
        const isSuspended = this.isVariantSuspended(mode);
        const oldIsSuspended = this.isVariantSuspended(oldMode);
        if (!isInitialLoad && !skipStorage && oldIsSuspended && this.currentNode && this.currentNode !== this.rootNode) {
            const confirmReset = confirm(`You are leaving a Suspended Variant (${oldMode.toUpperCase()}).\nBecause it runs in isolated memory, your current board will be permanently lost.\n\nContinue?`);
            
            if (!confirmReset) {
                if (typeof document !== 'undefined') {
                    const select = document.getElementById('analysisVariantSelect');
                    if (select) select.value = oldMode;
                }
                return; 
            }
        }

        if (!isInitialLoad && !skipStorage && this.gameMode && oldMode !== mode) {
            if (!oldIsSuspended) {
                this.saveVariantState(this.gameMode);
            }
        }
        
        if (this.mode === 'puzzle' || this.mode === 'puzzles' || this.mode === 'study') {
            this.gameMode = mode; 
            if (!skipStorage && !isSuspended && typeof localStorage !== 'undefined') {
                localStorage.setItem('chess_last_variant', mode); 
            }
            
            const savedPgn = typeof localStorage !== 'undefined' ? localStorage.getItem(`chess_analysis_variant_pgn_${mode}`) : null;
            let startFen = (typeof VARIANT_STARTING_FENS !== 'undefined' && VARIANT_STARTING_FENS[mode]) ? VARIANT_STARTING_FENS[mode] : INITIAL_FEN;
            if (mode === 'chess960' && typeof this.generateChess960FEN === 'function') startFen = this.generateChess960FEN();

            if (!this.tabMemory) this.tabMemory = { analysis: null, play: null, puzzle: null };
            
            this.tabMemory['analysis'] = {
                variant: mode,
                mode: 'analysis',
                fen: savedPgn ? "" : startFen,
                pgn: savedPgn || "",
                headers: {},
                history: [],
                moveList: []
            };
            
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('chess_tab_snapshot_analysis', JSON.stringify(this.tabMemory['analysis']));
            }
            return;
        }

        this.gameMode = mode;
        
        if (!skipStorage && !isSuspended) {
            if (typeof localStorage !== 'undefined') localStorage.setItem('chess_last_variant', mode); 
        }
        
        try {
            this.#engine = new (typeof Chess === 'function' ? Chess : window.Chess)(undefined, this.gameMode);
            
            if (isSuspended) {
                console.warn(`[Sandbox] Booted ${mode} in isolated memory mode.`);
            }
            
            let safeSkipStorage = skipStorage || isSuspended; 
            
            if (!safeSkipStorage) {
                const tabContext = (this.mode === 'local' || this.mode === 'bot' || this.mode === 'play') ? 'play' : (this.mode || 'analysis');
                const savedPgn = typeof localStorage !== 'undefined' ? localStorage.getItem(`chess_${tabContext}_variant_pgn_${mode}`) : null;
                
                if (savedPgn) {
                    this.loadPGN(savedPgn, false, true);
                    
                    if (typeof document !== 'undefined') {
                        const fenBox = document.getElementById('fenInput');
                        if (fenBox && this.currentNode) fenBox.value = this.currentNode.fen;
                    }
                } else {
                    let startFen = (typeof VARIANT_STARTING_FENS !== 'undefined' && VARIANT_STARTING_FENS[mode]) ? VARIANT_STARTING_FENS[mode] : INITIAL_FEN;
                    
                    if (mode === 'chess960' && typeof this.generateChess960FEN === 'function') {
                        startFen = this.generateChess960FEN();
                    }
                    
                    this.history = [];
                    this.moveList = [];
                    this.pgnHeaders = {};
                    this.rootNode = new MoveNode(startFen, null);
                    this.currentNode = this.rootNode;
                    
                    if (typeof this.loadFEN === 'function') this.loadFEN(startFen, mode, true);
                }
            } else if (isSuspended) {
                let startFen = (typeof VARIANT_STARTING_FENS !== 'undefined' && VARIANT_STARTING_FENS[mode]) ? VARIANT_STARTING_FENS[mode] : INITIAL_FEN;
                
                this.history = [];
                this.moveList = [];
                this.pgnHeaders = {};
                this.rootNode = new MoveNode(startFen, null);
                this.currentNode = this.rootNode;
                if (typeof this.loadFEN === 'function') this.loadFEN(startFen, mode, true);
            }
            
            const didSwitch = typeof this.#checkAndSwitchEngine === 'function' ? this.#checkAndSwitchEngine() : false;
            
            if (!didSwitch && window.sfWorker) {
                if (this.activeEngineType === 'fairy') {
                    this.#safeSetOption('UCI_Variant', (mode === 'classical' ? 'chess' : mode));
                } else {
                    this.#safeSetOption('UCI_Chess960', (mode === 'chess960' ? 'true' : 'false'));
                }
            }
            
        } catch (error) {
            console.error(`[Sandbox] Engine crash detected in ${mode}! Falling back to classical.`, error);
            
            this.gameMode = 'classical';
            this.#engine = new (typeof Chess === 'function' ? Chess : window.Chess)(undefined, 'classical');
            
            this.history = [];
            this.moveList = [];
            this.pgnHeaders = {};
            this.rootNode = new MoveNode(INITIAL_FEN, null);
            this.currentNode = this.rootNode;
            if (typeof this.loadFEN === 'function') this.loadFEN(INITIAL_FEN, 'classical', true);
            
            if (typeof this.#ui !== 'undefined' && this.#ui && typeof this.#ui.showNotification === 'function') {
                this.#ui.showNotification(`${mode} engine crashed. Reverting to Classical.`, 'Variant Error', '⚠️');
            }
            
            if (typeof document !== 'undefined') {
                const select = document.getElementById('analysisVariantSelect');
                if (select) select.value = 'classical';
            }
        }
    }
handleTabSwitch(newTabName) {
        if (!newTabName) return;

        const targetTabContext = (newTabName === 'local' || newTabName === 'bot' || newTabName === 'play') ? 'play' : newTabName;
        const currentTabContext = (this.mode === 'local' || this.mode === 'bot' || this.mode === 'play') ? 'play' : (this.mode || 'analysis');

        // Prevent standard routines from corrupting Graph memory
        if (targetTabContext === 'graph') {
            this.mode = 'graph';
            return; 
        }

        if (this._isBooting || this.#_isBooting) {
            this.mode = newTabName;
            this.#restoreState(targetTabContext);
            this._isBooting = false;
            if (typeof this.#_isBooting !== 'undefined') this.#_isBooting = false;
            return;
        }
        
        // Pack up current BEFORE changing
        if (currentTabContext !== targetTabContext && currentTabContext !== 'graph') {
            if (this.mode) this.#saveState(currentTabContext);
            if (this.gameMode) this.saveVariantState(this.gameMode);
        }
        
        if (window.sfWorker) window.sfWorker.postMessage('stop');
        if (typeof window.engineAnalysing !== 'undefined') window.engineAnalysing = false;
        
        this.mode = newTabName;
        
        // Restore appropriate memory context
        if (currentTabContext !== targetTabContext) {
            if (targetTabContext === 'editor') {
                const currentFen = this.currentNode ? this.currentNode.fen : (typeof this.generateFEN === 'function' ? this.generateFEN() : INITIAL_FEN);
                this.history = [];
                this.moveList = [];
                this.pgnHeaders = { "FEN": currentFen, "SetUp": "1", "Variant": this.gameMode };
                this.rootNode = new MoveNode(currentFen, null);
                this.currentNode = this.rootNode;
                if (typeof this.loadFEN === 'function') this.loadFEN(currentFen, this.gameMode, true);
            } 
            else if (targetTabContext === 'study' || targetTabContext === 'trainer') {
                let savedChap = parseInt(localStorage.getItem('chess_active_chapter_idx'), 10);
                if (isNaN(savedChap)) savedChap = this.activeChapterIndex || 0;
                this.loadChapter(savedChap, true, true);
            } 
            else {
                this.#restoreState(targetTabContext);
            }
        }
        
        // Sync UI cache
        if (this.#ui) {
            this.#ui._lastMetadataCache = null;
            this.#ui._lastHeadersCache = null;
            this.#ui._lastTreeSize = -1;
            this.#ui._lastFen = null;
            this.#ui._lastBoardFen = null;
            
            if (typeof this.#ui.displayMetadata === 'function') this.#ui.displayMetadata(this.pgnHeaders);
            if (typeof this.#ui.updateHistory === 'function') this.#ui.updateHistory(true);
            if (typeof this.#ui.renderHeaders === 'function') this.#ui.renderHeaders();
            if (typeof this.#ui.renderBoard === 'function') this.#ui.renderBoard(true);
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
async initEngine(engineType = null, customUrl = null, customName = null) {
        try {
            if (customName && ['standard', 'fairy', 'custom'].includes(customName)) {
                engineType = customName;
            }

            let engineDisplayName = "Stockfish"; 
            window.engineReady = false; 
            window.engineBooting = true;
            this.engineSupportedOptions = new Set();

            if (!engineType) {
                engineType = ['classical', 'chess960'].includes(this.gameMode) ? 'standard' : 'fairy';
            }
            this.activeEngineType = engineType;

            const appBaseUrl = new URL('.', window.location.href).href;

            // ==========================================
            // STOCKFISH 19 (ES6 + PTHREAD)
            // ==========================================
            const spawnSf19Worker = (jsPath) => {
                const absoluteJsUrl = new URL(jsPath, appBaseUrl).href;
                const wasmUrl = new URL('sf_19.wasm', absoluteJsUrl).href;

                const workerCode = `
                    import Sf_19_Web from "${absoluteJsUrl}";

                    var messageQueue = [];
                    var engineInstance = null;
                    var isReady = false;

                    function sendCommand(cmd) {
                        if (!cmd) return;
                        var cleanCmd = cmd.trim();
                        if (engineInstance && isReady) {
                            try {
                                if (typeof engineInstance.uci === 'function') {
                                    engineInstance.uci(cleanCmd);
                                } else if (engineInstance.ccall) {
                                    engineInstance.ccall('push_cmd', null, ['string'], [cleanCmd]);
                                } else if (typeof engineInstance.postMessage === 'function') {
                                    engineInstance.postMessage(cleanCmd);
                                }
                            } catch(err) {
                                console.error("[SF19 CMD ERROR]:", err);
                            }
                        } else {
                            messageQueue.push(cleanCmd);
                        }
                    }

                    var Module = {
                        mainScriptUrlOrBlob: "${absoluteJsUrl}",
                        locateFile: function(path, prefix) {
                            if (path.endsWith('.wasm')) return "${wasmUrl}";
                            return (prefix || '') + path;
                        },
                        listen: function(line) {
                            if (line && typeof line === 'string') {
                                self.postMessage(line);
                            }
                        },
                        print: function(line) {
                            if (line && typeof line === 'string') {
                                self.postMessage(line);
                            }
                        },
                        printErr: function(err) {
                            // Bỏ qua các log không ảnh hưởng
                            if (err && !err.includes("Blocking on the main thread")) {
                                console.warn("[SF19 System Log]:", err);
                            }
                        }
                    };

                    self.onmessage = function(e) {
                        if (e.data && e.data.action === 'INJECT_NNUE') {
                            try {
                                if (engineInstance) {
                                    if (typeof engineInstance.setNnueBuffer === 'function') {
                                        engineInstance.setNnueBuffer(new Uint8Array(e.data.buffer));
                                    } else if (engineInstance.FS) {
                                        engineInstance.FS.writeFile(e.data.name, new Uint8Array(e.data.buffer));
                                    }
                                }
                            } catch(err) {
                                console.error("[SF19 NNUE Inject Error]:", err);
                            }
                        } else if (typeof e.data === 'string') {
                            sendCommand(e.data);
                        }
                    };

                    Sf_19_Web(Module).then(function(engine) {
                        engineInstance = engine;
                        isReady = true;

                        self.postMessage('WORKER_INITIALIZED');

                        while (messageQueue.length > 0) {
                            var queued = messageQueue.shift();
                            sendCommand(queued);
                        }
                    }).catch(function(err) {
                        console.error("[SF19 Boot Error]:", err);
                    });
                `;

                const blob = new Blob([workerCode], { type: 'application/javascript' });
                return new Worker(URL.createObjectURL(blob), { type: 'module' });
            };

            // ==========================================
            // 1. CUSTOM ENGINE
            // ==========================================
            if (this.activeEngineType === 'custom' && customUrl) {
                engineDisplayName = customName || "Custom Engine";
                window.sfWorker = spawnSf19Worker(customUrl);
            } 
            // ==========================================
            // 2. FAIRY STOCKFISH
            // ==========================================
            else if (this.activeEngineType === 'fairy') {
                engineDisplayName = "Fairy-Stockfish 14 NNUE";
                
                const engineDir = new URL('engine/fairy/', appBaseUrl).href;
                const jsUrl = new URL('fairy-stockfish.js', engineDir).href;
                const wasmUrl = new URL('fairy-stockfish.wasm', engineDir).href;
                const workerUrl = new URL('fairy-stockfish.worker.js', engineDir).href;
                const nnueBaseUrl = new URL('engine/nnue/', appBaseUrl).href;

                const workerScript = `
                    var appBaseUrl = '${appBaseUrl}';
                    var jsUrl = '${jsUrl}';
                    var wasmUrl = '${wasmUrl}';
                    var workerUrl = '${workerUrl}';
                    var nnueBaseUrl = '${nnueBaseUrl}';

                    function sanitize(rawUrl) {
                        if (!rawUrl) return '';
                        return typeof rawUrl === 'string' ? rawUrl : (rawUrl.url || rawUrl.toString());
                    }

                    function resolveUrl(rawUrl) {
                        var url = sanitize(rawUrl);
                        if (url.startsWith('blob:') || url.startsWith('data:')) return url;
                        var fileName = decodeURIComponent(url.split('/').pop().split('?')[0].split('#')[0]);
                        
                        if (fileName.endsWith('.worker.js')) return workerUrl;
                        if (fileName.endsWith('.wasm')) return wasmUrl;
                        if (fileName.endsWith('.js')) return jsUrl;
                        if (fileName.endsWith('.nnue')) return nnueBaseUrl + fileName;
                        
                        if (url.startsWith('http')) return url;
                        return new URL(url.replace(/^\\//, ''), appBaseUrl).href;
                    }

                    var nativeFetch = self.fetch;
                    self.fetch = function(req, opts) { return nativeFetch(resolveUrl(req), opts); };
                    
                    var NativeRequest = self.Request;
                    self.Request = function(input, init) { 
                        try { return new NativeRequest(resolveUrl(input), init); }
                        catch(e) { return new NativeRequest(input, init); }
                    };

                    var NativeURL = self.URL;
                    self.URL = function(url, base) {
                        try {
                            var resolved = resolveUrl(url);
                            if (resolved.startsWith('blob:') || resolved.startsWith('http')) return new NativeURL(resolved);
                            return new NativeURL(resolved, base || appBaseUrl);
                        } catch(e) { return new NativeURL(resolveUrl(url)); }
                    };
                    self.URL.createObjectURL = NativeURL.createObjectURL;
                    self.URL.revokeObjectURL = NativeURL.revokeObjectURL;

                    var engineInstance = null;
                    var messageQueue = [];
                    
                    var Module = { 
                        locateFile: function(path) { return resolveUrl(path); },
                        mainScriptUrlOrBlob: jsUrl 
                    };

                    self.addEventListener('message', function(e) {
                        if (e.data && e.data.action === 'INJECT_NNUE') {
                            try {
                                if (engineInstance && engineInstance.FS) {
                                    engineInstance.FS.writeFile(e.data.name, new Uint8Array(e.data.buffer));
                                }
                            } catch(err) {
                                console.error("[FAIRY] NNUE inject error:", err);
                            }
                        } else if (typeof e.data === 'string') {
                            var cmd = e.data;
                            if (cmd.startsWith('setoption name Hash value')) cmd = 'setoption name Hash value 256'; 
                            else if (cmd.startsWith('setoption name Threads value')) {
                                var requestedThreads = parseInt(cmd.split('value ')[1]);
                                if (requestedThreads > 4) cmd = 'setoption name Threads value 4'; 
                            }

                            if (engineInstance) {
                                if (engineInstance.ccall) {
                                    engineInstance.ccall('push_cmd', 'null', ['string'], [cmd]);
                                } 
                                else if (typeof engineInstance.postMessage === 'function') engineInstance.postMessage(cmd);
                                else if (typeof engineInstance.onCustomMessage === 'function') engineInstance.onCustomMessage(cmd);
                                else if (typeof engineInstance === 'function') engineInstance(cmd);
                            } else {
                                messageQueue.push(cmd);
                            }
                        }
                    });

                    try { importScripts(jsUrl); } catch(e) {}
                    
                    if (typeof Stockfish === 'function') {
                        Stockfish(Module).then(function(engine) {
                            engineInstance = engine;
                            
                            messageQueue.forEach(function(cmd) {
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
                            
                            self.postMessage('WORKER_INITIALIZED');
                        }).catch(function(e) {
                            console.error("[FAIRY Boot Error]:", e);
                        });
                    }
                `;
                
                const blob = new Blob([workerScript], { type: 'application/javascript' });
                window.sfWorker = new Worker(URL.createObjectURL(blob));
            }
            // ==========================================
            // 3. STANDARD ENGINE (Stockfish 19 & serverChess fallback)
            // ==========================================
            else {
                let cachedName = typeof localStorage !== 'undefined' ? localStorage.getItem('chess_cached_engine_name') : "Stockfish 19";
                if (this.#ui && typeof this.#ui.updateEngineName === 'function') {
                    this.#ui.updateEngineName(cachedName);
                }
                window.currentEngineShortName = cachedName;

                let enginePath = 'engine/stockfish 19/sf_19.js';
                engineDisplayName = "Stockfish 19";

                try {
                    const response = await fetch(new URL('api/latest-engine', appBaseUrl).href);
                    if (response.ok) {
                        const data = await response.json();
                        engineDisplayName = data.name;
                        enginePath = data.path.replace(/^\//, '');
                        if (typeof localStorage !== 'undefined') localStorage.setItem('chess_cached_engine_name', engineDisplayName);
                    }
                } catch(e) {
                    console.log("[ENGINE] Chạy trên GitHub Pages -> Mặc định Stockfish 19");
                    engineDisplayName = "Stockfish 19";
                    enginePath = 'engine/stockfish 19/sf_19.js';
                }

                window.sfWorker = spawnSf19Worker(enginePath);
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
            window.sfWorker.onerror = function(e) { 
                console.error("[ENGINE WORKER ERROR]:", e.message || e); 
            };
            window.sfWorker.onmessage = (event) => this.#handleEngineMessage(event);

            if (this.activeEngineType !== 'fairy') {
                window.sfWorker.postMessage('uci'); 
            }
        } catch (e) {
            console.error("[ENGINE INIT FATAL ERROR]:", e);
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

                this.#safeSetOption('MultiPV', '1');
                if (this.activeEngineType === 'fairy' || this.activeEngineType === 'custom') {
                    const sfVariant = this.gameMode === 'classical' ? 'chess' : this.gameMode;
                    this.#safeSetOption('UCI_Variant', sfVariant);
                } else {
                    this.#safeSetOption('UCI_Chess960', (this.gameMode === 'chess960' ? 'true' : 'false'));
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
                
                this.#safeSetOption('MultiPV', '3'); 
                
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
        if (this.#engine && typeof this.#engine.setGameMode === 'function') {
            this.#engine.setGameMode('classical');
        }

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
            
            const protectedMode = this.gameMode;
            if (this.#engine && typeof this.#engine.setGameMode === 'function') {
                this.#engine.setGameMode('classical');
            }
            
            this.loadFEN(this.initialPuzzleFEN, 'classical');
            this.gameMode = protectedMode;

            if (this.#ui && typeof this.#ui.renderBoard === 'function') this.#ui.renderBoard(true);
            if (this.#ui && typeof this.#ui.updateHistory === 'function') this.#ui.updateHistory();
            
            const hintBtn = document.getElementById('hintBtn');
            if (hintBtn) hintBtn.style.display = 'none';
            const resetBtn = document.getElementById('resetPuzzleBtn');
            if (resetBtn) resetBtn.style.display = 'none';

            setTimeout(() => {
                const setupMove = this.puzzleSolution[0];
                if (setupMove) {
                    const from = this.#squareToIndex(setupMove.substring(0, 2));
                    const to = this.#squareToIndex(setupMove.substring(2, 4));
                    const promo = setupMove.length > 4 ? setupMove.substring(4, 5) : 'q';
                    
                    const res = this.makeMove({ from, to }, promo, true, null, true);
                    
                    this.#emit('boardUpdated', { 
                        animate: true, 
                        overrideMove: this.currentNode.lastMove 
                    });
                    
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
stepBack(animate = true) {
        if (!this.currentNode || !this.currentNode.parent) return false;
        
        const undoneNode = this.currentNode;
        this.currentNode = this.currentNode.parent;
        this.currentNode.selectedChildIndex = 0;
        
        this.#engine.load(this.currentNode.fen);
        this.turn = this.#engine.turn();
        
        if (typeof this.#reconcileBoardIdsReverse === 'function') {
            this.#reconcileBoardIdsReverse(this.currentNode.fen, undoneNode.lastMove);
        }
        
        if (undoneNode.lastMove && undoneNode.lastMove.from !== '@') {
            this._transientOverrideMove = {
                from: undoneNode.lastMove.to,
                to: undoneNode.lastMove.from,
                color: undoneNode.lastMove.color,
                flags: undoneNode.lastMove.flags,
                isReverse: true
            };
        }

        this.#emit('boardUpdated', { animate: animate });
        this._transientOverrideMove = null;
        
        // 👉 Gọi thẳng triggerMoveSound giống hệt stepForward để kích hoạt nhịp throttle 45ms
        if (undoneNode.lastMove) {
            this.triggerMoveSound(undoneNode.lastMove);
        }
        return true;
    }
stepForward(animate = true) {
        if (!this.currentNode || this.currentNode.children.length === 0) return false;
        
        const nextNode = this.currentNode.children[this.currentNode.selectedChildIndex || 0];
        
        this.currentNode = nextNode;
        this.currentNode.selectedChildIndex = 0;
        
        this.#engine.load(nextNode.fen);
        this.turn = this.#engine.turn();
        
        if (typeof this.#reconcileBoardIds === 'function') {
            this.#reconcileBoardIds(nextNode.fen, nextNode.lastMove);
        }
        
        this.#emit('boardUpdated', { animate: animate, overrideMove: nextNode.lastMove });
        
        // 👉 Luôn kích hoạt âm thanh độc lập với cờ animate
        if (nextNode.lastMove) {
            this.triggerMoveSound(nextNode.lastMove);
        }
        return true;
    }
goToStart(animate = true) {
        if (!this.rootNode) return false;

        const startFen = this.rootNode.fen;
        const previousBoardSnapshot = this.#board.map(p => p ? { ...p } : null);
        if (animate && this.#ui && typeof this.#ui.animateToStartPosition === 'function') {
            this.#ui.animateToStartPosition(startFen, previousBoardSnapshot, () => {
                this.currentNode = this.rootNode;
                this.loadFEN(startFen, this.gameMode, true); 

                this.#emit('fenChanged', { fen: startFen });
                this.#emit('boardUpdated', { animate: false });

                if (this._audioDebounce) clearTimeout(this._audioDebounce);
                this._audioDebounce = setTimeout(() => {
                    this.#emit('soundTriggered', { type: 'move-self' });
                }, 25);
            });
            return true;
        }

        this.currentNode = this.rootNode;
        this.loadFEN(startFen, this.gameMode, true); 

        this.#emit('fenChanged', { fen: startFen });
        
        this.#emit('boardUpdated', { 
            isGoToStart: true, 
            targetFen: startFen, 
            previousBoard: previousBoardSnapshot,
            animate: false 
        });

        if (animate) {
            if (this._audioDebounce) clearTimeout(this._audioDebounce);
            this._audioDebounce = setTimeout(() => {
                this.#emit('soundTriggered', { type: 'move-self' });
            }, 25);
        }
        return true;
    }
goToEnd(animate = true) {
        if (!this.rootNode) return false;
        let curr = this.rootNode;
        while (curr.children.length > 0) curr = curr.children[curr.selectedChildIndex || 0];
        
        this.currentNode = curr;
        this.loadFEN(this.currentNode.fen, this.gameMode, true);
        
        this.#emit('boardUpdated', { animate: animate });
        
        if (animate) {
            if (this.currentNode.lastMove) this.triggerMoveSound(this.currentNode.lastMove);
            else {
                if (this._audioDebounce) clearTimeout(this._audioDebounce);
                this._audioDebounce = setTimeout(() => {
                    this.#emit('soundTriggered', { type: 'move-self' });
                }, 25);
            }
        }
        return true;
    }
goToNodeId(id, animate = true) {
        // 👉 TỐI ƯU O(1): Lấy trực tiếp từ Map, không đệ quy vét cạn hàng nghìn node
        let target = (this.nodeMap && this.nodeMap.get(id)) || null;
        if (!target) {
            const search = (node) => {
                if (node.id === id) { target = node; return; }
                for (let c of node.children) {
                    if (target) return;
                    search(c);
                }
            };
            if (this.rootNode) search(this.rootNode);
        }
        
        if (target) {
            if (this.currentNode && this.currentNode.id === target.id) return false;

            const isStepBack = (this.currentNode && this.currentNode.parent && this.currentNode.parent.id === target.id);
            const isStepForward = (this.currentNode && this.currentNode.children && this.currentNode.children.some(c => c.id === target.id));
            const undoneNode = this.currentNode;
            
            this.currentNode = target;
            
            // Chỉ đồng bộ selectedChildIndex lên chuỗi cha trực tiếp
            let curr = target;
            while (curr.parent) {
                const idx = curr.parent.children.indexOf(curr);
                if (idx !== -1) curr.parent.selectedChildIndex = idx;
                curr = curr.parent;
            }
            
            this.#engine.load(this.currentNode.fen);
            this.turn = this.#engine.turn();
            
            if (isStepBack && typeof this.#reconcileBoardIdsReverse === 'function') {
                this.#reconcileBoardIdsReverse(this.currentNode.fen, undoneNode.lastMove);
            } else if (isStepForward && typeof this.#reconcileBoardIds === 'function') {
                this.#reconcileBoardIds(this.currentNode.fen, target.lastMove);
            } else if (typeof this.#reconcileBoardIds === 'function') {
                this.#reconcileBoardIds(this.currentNode.fen, null);
            }
            
            if (isStepBack && undoneNode.lastMove && undoneNode.lastMove.from !== '@') {
                this._transientOverrideMove = {
                    from: undoneNode.lastMove.to,
                    to: undoneNode.lastMove.from,
                    color: undoneNode.lastMove.color,
                    flags: undoneNode.lastMove.flags,
                    isReverse: true
                };
            } else if (isStepForward && target.lastMove) {
                this._transientOverrideMove = target.lastMove;
            }

            // Khi duyệt cây nhanh hoặc gọi từ Graph, tắt animate để đạt tốc độ tối đa
            const shouldAnimate = animate && (isStepBack || isStepForward);
            this.#emit('boardUpdated', { 
                animate: shouldAnimate, 
                overrideMove: this._transientOverrideMove,
                skipEngine: true // Không kích hoạt Stockfish phân tích lại vị trí cũ khi đang lướt
            });
            this._transientOverrideMove = null;
            
            const moveForSound = isStepBack 
                ? (undoneNode?.lastMove || this.currentNode.lastMove) 
                : (this.currentNode.lastMove || undoneNode?.lastMove);

            if (moveForSound) {
                this.triggerMoveSound(moveForSound);
            } else {
                const now = performance.now();
                if (!this._lastSoundTime || (now - this._lastSoundTime >= 45)) {
                    this._lastSoundTime = now;
                    this.#emit('soundTriggered', { type: 'move-self' });
                }
            }
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
        // 1. Traverse backward to find the node
        if (baseFen && this.generateFEN() !== baseFen) {
            let temp = this.currentNode;
            let found = false;
            while (temp) {
                if (temp.fen === baseFen) {
                    this.currentNode = temp;
                    if (typeof this.#reconcileBoardIds === 'function') {
                        this.#reconcileBoardIds(this.currentNode.fen, null);
                    }
                    found = true;
                    break;
                }
                temp = temp.parent;
            }
            if (!found) {
                this.loadFEN(baseFen);
            }
        }

        // Sync the internal validator so it doesn't reject legal moves
        if (this.#engine && typeof this.#engine.load === 'function') {
            this.#engine.load(this.currentNode.fen);
        }

        const moves = seqString.split(/\s+/);
        if (typeof window.sfWorker !== 'undefined' && window.sfWorker) {
            window.sfWorker.postMessage('stop');
        }
        
        // 2. Play the sequence of moves cleanly
        for (let i = 0; i < moves.length; i++) {
            let rawMove = moves[i];
            if (!rawMove) continue;

            let isLastMove = (i === moves.length - 1);
            let baseMove = rawMove;
            let duckSq = null;
            
            // Clean up Duck Chess appended squares
            if (baseMove.includes(',')) {
                let parts = baseMove.split(',');
                baseMove = parts[0];
                duckSq = parts[1];
            } else if (this.gameMode === 'duck' && baseMove.includes('@')) {
                let parts = baseMove.split('@');
                baseMove = parts[0];
                duckSq = parts[1];
            }

            let parsedMove = null;
            try {
                parsedMove = this.#engine.move(baseMove, { sloppy: true });
            } catch(e) {}
            
            if (!parsedMove) {
                console.warn("[ENGINE] Failed to parse sequence move:", rawMove);
                break; 
            }
            
            let moveObj = {
                from: typeof this.#squareToIndex === 'function' ? this.#squareToIndex(parsedMove.from) : parsedMove.from, 
                to: typeof this.#squareToIndex === 'function' ? this.#squareToIndex(parsedMove.to) : parsedMove.to,
                promotion: parsedMove.promotion
            };
            
            if ((this.gameMode === 'crazyhouse' || this.gameMode === 'placement' || this.gameMode === 'bughouse') && rawMove.includes('@')) {
                moveObj.from = '@';
                moveObj.drop = rawMove.split('@')[0].toLowerCase() || 'p';
                moveObj.to = typeof this.#squareToIndex === 'function' ? this.#squareToIndex(parsedMove.to) : parsedMove.to;
            } else if (this.gameMode === 'duck') {
                // Xử lý gắn tọa độ con vịt an toàn
                if (duckSq) {
                    moveObj.duck_sq = typeof this.#squareToIndex === 'function' ? this.#squareToIndex(duckSq) : duckSq;
                } else if (parsedMove.duck_sq !== undefined) {
                    moveObj.duck_sq = typeof this.#squareToIndex === 'function' ? this.#squareToIndex(parsedMove.duck_sq) : parsedMove.duck_sq;
                }
            }

            // Undo the translator engine so makeMove can apply it natively
            this.#engine.undo();
            if (isLastMove && i > 0 && typeof this.#ui !== 'undefined' && this.#ui) {
                if (typeof this.#ui.renderBoard === 'function') {
                    this.#ui.renderBoard(false); 
                }
            }

            // Execute the move! (Silent for all intermediate moves)
            this.makeMove(moveObj, moveObj.promotion, false, null, !isLastMove);
            if (isLastMove && typeof this.#ui !== 'undefined' && this.#ui) {
                if (typeof this.#ui.renderBoard === 'function') {
                    this.#ui.renderBoard(true); 
                }
            }
        }

        // 3. Command the UI to update the surrounding interface 
        if (typeof this.#ui !== 'undefined' && this.#ui) {
            if (typeof this.#ui.updateHistory === 'function') this.#ui.updateHistory();
            if (typeof this.#ui.renderArrows === 'function') this.#ui.renderArrows();
        }

        // 4. Restart engine on the new landing square
        if (typeof window.engineAnalysing !== 'undefined' && window.engineAnalysing) {
            if (typeof this.updateStockfish === 'function') this.updateStockfish();
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
                    if (p.type === 'duck') {
                        pieceFen += '*';
                    } else {
                        pieceFen += (p.color === 'w' ? p.type.toUpperCase() : p.type.toLowerCase());
                    }
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

        let fen = pieceFen;
        
        if (this.gameMode === 'crazyhouse' || this.gameMode === 'bughouse' || this.gameMode === 'placement') {
            const pocketMatch = currEngineFen[0].match(/\[.*?\]/);
            if (pocketMatch) fen += pocketMatch[0];
        }

        fen += " " + (this.turn || 'w') + " " + castlingStr;
        fen += ` ${currEngineFen[3] || '-'} ${currEngineFen[4] || '0'} ${currEngineFen[5] || '1'}`; 

        for (let i = 6; i < currEngineFen.length; i++) {
            fen += ` ${currEngineFen[i]}`;
        }

        if (fen === this.#engine.fen()) return;

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
        let boardStr = parts[0];
        if (boardStr.includes('[')) boardStr = boardStr.split('[')[0];
        const rows = boardStr.split('/'); 

        let visualRow = 0; 
        for (let rStr of rows) {
            let file = 0; 
            for (let i = 0; i < rStr.length; i++) {
                let char = rStr.charCodeAt(i);
                if (char >= 48 && char <= 57) {
                    file += (char - 48);
                } else if (char === 126) {
                    const prevSqIndex = (visualRow << 3) | (file - 1);
                    if (this.#board[prevSqIndex]) {
                        if (this.gameMode === 'alice') this.#board[prevSqIndex].isBoardB = true;
                        else this.#board[prevSqIndex].promoted = true;
                    }
                } else if (char === 42) {
                    const sqIndex = (visualRow << 3) | file;
                    this.#board[sqIndex] = { type: 'duck', color: 'none', id: this.getUID() };
                    file++;
                } else {
                    const color = (char < 97) ? 'w' : 'b';
                    const type = String.fromCharCode(char | 32);
                    const sqIndex = (visualRow << 3) | file;
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
startAnalysisMode(transferGame = false) {
        this.gameOver = true;
        if (this.#timerInterval) clearInterval(this.#timerInterval);
        if (typeof window.sfWorker !== 'undefined' && window.sfWorker) {
            window.sfWorker.postMessage('stop');
        }

        if (!this.pgnHeaders['Result']) this.pgnHeaders['Result'] = '*';

        const previousMode = this.mode;
        const currentVariant = this.gameMode;

        let pgnToTransfer = null;
        if (transferGame && (previousMode === 'local' || previousMode === 'bot' || previousMode === 'puzzle' || previousMode === 'play')) {
            pgnToTransfer = typeof this.generatePGN === 'function' ? this.generatePGN() : "";
        }

        this.mode = 'analysis';
        this.gameOver = false;

        if (this.#ui && typeof this.#ui.switchTab === 'function') {
            this.#ui.switchTab('analysis');
        }
        if (pgnToTransfer) {
            if (this.gameMode !== currentVariant) {
                this.setGameMode(currentVariant, false, true);
            }
            this.loadPGN(pgnToTransfer, false, true);
            
            if (typeof this.#saveState === 'function') this.#saveState('analysis', true);
            if (typeof this.saveVariantState === 'function') this.saveVariantState(this.gameMode);
        }

        if (this.#ui) {
            const modal = document.getElementById('gameOverModal');
            if (modal) modal.style.display = 'none';
            
            if (typeof this.#ui.updateHistory === 'function') this.#ui.updateHistory(true);
            if (typeof this.#ui.renderBoard === 'function') this.#ui.renderBoard(false);
            if (typeof this.#ui.toggleReviewButton === 'function') this.#ui.toggleReviewButton(true);
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
        
        // Save to Study if in study mode!
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
        if (this.isLoadingPGN) return false;

        // 1. LUÔN BẢO TOÀN NGUYÊN BẢN CHUỖI PGN GỐC (KỂ CẢ KHI RESTORE F5)
        if (typeof pgn === 'string' && pgn.trim() !== '') {
            this._originalPgn = pgn;
        }

        // 2. TRÍCH XUẤT TOÀN BỘ HEADER VÀ ÉP UI XÓA CACHE VẼ LẠI NGAY
        if (typeof pgn === 'string') {
            this.pgnHeaders = {};
            const headerRegex = /\[([A-Za-z0-9_]+)\s+"([^"]*)"\]/g;
            let match;
            while ((match = headerRegex.exec(pgn)) !== null) {
                this.pgnHeaders[match[1]] = match[2];
            }
            if (this.#ui) {
                this.#ui._lastMetadataCache = null;
                this.#ui._lastHeadersCache = null;
                if (typeof this.#ui.displayMetadata === 'function') {
                    this.#ui.displayMetadata(this.pgnHeaders);
                }
            }
        }

        if (typeof pgn === 'string' && !isInternalLoad) {
            let detectedMode = 'classical';
            const variantMatch = pgn.match(/\[Variant\s+"([^"]+)"\]/i);
            const ruleVariantMatch = pgn.match(/\[RuleVariants\s+"([^"]+)"\]/i);
            
            let activeVariant = this.pgnHeaders['Variant'] || (variantMatch ? variantMatch[1] : null);
            
            if (activeVariant) {
                const rawVariant = activeVariant.toLowerCase().replace(/[-_ ]/g, ''); 
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

            if (ruleVariantMatch && ruleVariantMatch[1]) {
                const rules = ruleVariantMatch[1].toLowerCase();
                if (rules.includes('chess960')) detectedMode = 'chess960';
                if (rules.includes('spell')) detectedMode = 'spell';
            }
            
            if (this.gameMode !== detectedMode) {
                this.setGameMode(detectedMode, false, true);
            }

            if (typeof document !== 'undefined') {
                const variantSelect = document.getElementById('analysisVariantSelect');
                if (variantSelect) variantSelect.value = this.gameMode;
            }
        }

        this.isLoadingPGN = true;
        const timerId = `PGN_Load_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
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
            ['updateHistory', 'renderBoard', 'renderArrows', 'renderHeaders', 'highlightLastMove', 'updateClocks', 'updateStatus', 'scrollToActiveMove', 'showNotification', 'updatePuzzleStats', 'updatePlayerNames', 'displayMetadata', 'renderCharts'].forEach(m => silence(this.#ui, m, backups.ui));
        }
        ['updateStockfish', 'triggerMoveSound', 'checkGameState', 'onMove', 'attemptPremove', 'saveToLocalStorage'].forEach(m => silence(this, m, backups.game));
        ['log', 'info', 'warn', 'debug'].forEach(m => silence(console, m, backups.console));

        try {
            this.moveList = [];
            this.history = [];
            this.fens = [];
            
            this.#engine = new (typeof Chess === 'function' ? Chess : window.Chess)(undefined, this.gameMode);
            if (this.#engine && typeof this.#engine.setGameMode === 'function') {
                this.#engine.setGameMode(this.gameMode);
            }
            this.#board = Array(64).fill(null);

            let isFFA = Boolean(
                this.pgnHeaders['Variant'] === 'FFA' || 
                this.pgnHeaders['StartFen4'] || 
                (this.pgnHeaders['Site'] && this.pgnHeaders['Site'].includes('4-player-chess'))
            );

            if (this.pgnHeaders['StartFen4']) {
                if (this.pgnHeaders['StartFen4'] !== '2PC') {
                    let rawStartFen = this.pgnHeaders['StartFen4'];
                    let boardStr = rawStartFen;
                    
                    let braceIdx = rawStartFen.lastIndexOf('}');
                    if (braceIdx !== -1) {
                        let dashAfterBrace = rawStartFen.indexOf('-', braceIdx);
                        if (dashAfterBrace !== -1) {
                            boardStr = rawStartFen.substring(dashAfterBrace + 1);
                        }
                    } else {
                        let chunks = rawStartFen.split('-');
                        boardStr = chunks.find(c => c.includes('/')) || chunks[chunks.length - 1];
                    }

                    let rows = boardStr.split('/');
                    let fenRows = [];
                    for (let r of rows) {
                        let cells = r.trim().split(',');
                        if (cells.every(c => c === 'x')) continue;
                        let validCells = cells.filter(c => c !== 'x');
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
                                fenRow += color === 'y' ? piece.toLowerCase() : piece.toUpperCase();
                            } else {
                                if (emptyCount > 0) { fenRow += emptyCount; emptyCount = 0; }
                                fenRow += c; 
                            }
                        }
                        if (emptyCount > 0) { fenRow += emptyCount; }
                        fenRows.push(fenRow);
                    }
                    
                    if (!this.pgnHeaders['FEN']) {
                        let newFen = fenRows.join('/') + " w KQkq - 0 1";
                        if (this.gameMode === 'spell') {
                            newFen += " [S:0,0,0,0,5,2,5,2,-1,0,-1,0,-1,0,-1,0]";
                        }
                        this.pgnHeaders['FEN'] = newFen;
                    }
                }
                
                delete this.pgnHeaders['StartFen4'];
                if (this.pgnHeaders['Variant'] === 'FFA') {
                    let formattedMode = this.gameMode === 'chess960' ? 'Chess960' : this.gameMode.charAt(0).toUpperCase() + this.gameMode.slice(1);
                    this.pgnHeaders['Variant'] = formattedMode;
                }
            }

            if (isInternalLoad) {
                this.pgnHeaders['Variant'] = this.gameMode === 'classical' ? 'Standard' : this.gameMode;
            }

            let moveTextRaw = pgn
                .replace(/\[[^\]]*\]/g, '')
                .replace(/^(from|site|date|event|link|url):\s*\S+/gim, '')
                .replace(/https?:\/\/\S+/gi, '')
                .trim();

            if (!isFFA) {
                const sampleText = moveTextRaw.slice(0, 2000).replace(/\{[^}]*\}/g, '');
                const has14x14Files = /\b[KQRBN]?[i-n]([1-9]|1[0-4])\b/.test(sampleText);
                const has14x14Ranks = /\b[KQRBN]?[a-n](9|10|11|12|13|14)\b/.test(sampleText);
                const hasChessComDuck = /&Θ/.test(sampleText);
                const hasSpellDrop = /(freeze|jump)@/.test(sampleText);
                
                if (has14x14Files || has14x14Ranks || hasChessComDuck || hasSpellDrop) {
                    isFFA = true;
                }
            }

            if (isFFA || (this.gameMode !== 'classical' && this.gameMode !== 'chess960')) {
                let tokensArray = moveTextRaw.split(/\s+/);
                let newTokensArray = [];

                for (let t of tokensArray) {
                    if (t.includes('.') || t === '..' || t.match(/^(1-0|0-1|1\/2-1\/2|\*)$/)) {
                        newTokensArray.push(t); 
                        continue;
                    }

                    let moveData = this.#normalizeVariantToken(t, isFFA);
                    let moveStr = moveData.cleaned;

                    if (moveData.spell) {
                        const spellPrefix = moveData.spell.type === 'freeze' ? 'Fz' : 'Jp';
                        moveStr = `${spellPrefix}@${moveData.spell.square}_${moveData.cleaned}`;
                    } else if (moveData.duck) {
                        moveStr = `${moveData.cleaned}@${moveData.duck.square}`;
                    }

                    newTokensArray.push(moveStr);
                }
                moveTextRaw = newTokensArray.join(' ');
                moveTextRaw = moveTextRaw.replace(/([A-Za-z]+@[a-h][1-8])\s+([A-Za-z0-9+#=O\-]+)/g, "$1_$2");
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

            // 3. NHẬN DIỆN ENGINE MATCH ĐỂ BẢO VỆ TOÀN VẸN CÂY BIẾN THỂ PV & COMMENT
            const wName = (this.pgnHeaders['White'] || "").toLowerCase();
            const bName = (this.pgnHeaders['Black'] || "").toLowerCase();
            const event = (this.pgnHeaders['Event'] || "").toLowerCase();
            const site = (this.pgnHeaders['Site'] || "").toLowerCase();
            
            const ENGINE_TEST = /\b(stockfish|torch|leela|lc0|komodo|houdini|rybka|akimbo|minic|berserk|ethereal|koivisto|seer|slowchess|computer|engine|bot|crafty|hiarcs|shredder|dragon)\b/i;
            const isWhiteEng = ENGINE_TEST.test(wName);
            const isBlackEng = ENGINE_TEST.test(bName);
            const isTournament = /\b(tcec|ccc|computer chess championship)\b/i.test(event) || site.includes('computer-chess');

            this.isEngineMatch = (isWhiteEng && isBlackEng) || isTournament || isWhiteEng || isBlackEng;

            let tokens = [];
            let len = moveTextRaw.length;
            let i = 0;
            let code, start;
            while (i < len) {
                code = moveTextRaw.charCodeAt(i);
                if (code <= 32) { i++; continue; }
                if (code === 123) { // '{'
                    start = i; 
                    while (i < len && moveTextRaw.charCodeAt(i) !== 125) i++;
                    tokens.push(moveTextRaw.substring(start, i + 1)); 
                    i++; 
                    continue;
                }
                
                if (code === 36) { // '$'
                    start = i; 
                    while (i < len) {
                        let c = moveTextRaw.charCodeAt(i);
                        if (c <= 32 || c === 125 || c === 41 || c === 40) break;
                        i++;
                    }
                    tokens.push(moveTextRaw.substring(start, i)); 
                    continue;
                }
                
                if (code === 40 || code === 41) { // '(' or ')'
                    tokens.push(moveTextRaw.charAt(i)); 
                    i++; 
                    continue;
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
                            if (word.substring(dotIndex + 1)) tokens.push(word.substring(dotIndex + 1));
                        } else tokens.push(word);
                    }
                } else i++;
            }

            const originalMakeMove = this.makeMove.bind(this);
            this.makeMove = (move, promo, batchMode, pgnText, muteEngine, isAutoReply) => {
                if (typeof move === 'string') {
                    move = move.replace(/([A-Za-z]+@[a-h][1-8])_([A-Za-z0-9+#=O\-]+)/, "$1 $2");
                }

                let result = originalMakeMove(move, promo, true, pgnText, true, true);
                
                if (typeof move === 'string' && move.includes('@') && this.currentNode) {
                    if (this.currentNode.moveSan && !this.currentNode.moveSan.includes('@')) {
                        this.currentNode.moveSan = move;
                    }
                }
                
                return result; 
            };

            if (typeof this.#parsePGNTokens === 'function') this.#parsePGNTokens(tokens, 0);

            this.makeMove = originalMakeMove;
            
        } catch (e) {
            console.error("PGN Parsing Error:", e);
        } finally {
            this.isLoadingPGN = false;
            this.#rebuildNodeMap(this.rootNode);
            this.clearPremoves();
            this.premoveQueue = [];  
            
            // 4. LƯU BỘ NHỚ ĐỒNG BỘ - TUYỆT ĐỐI KHÔNG GỌI switchTab Ở ĐÂY ĐỂ TRÁNH ĐỆ QUY VÔ HẠN
            if (!isInternalLoad) {
                if (this.mode !== 'study' && this.mode !== 'puzzle') {
                    this.mode = 'analysis';
                    this.gameOver = false;
                    
                    if (typeof this.#saveState === 'function') {
                        this.#saveState('analysis', true);
                    }
                    if (typeof this.saveVariantState === 'function') {
                        this.saveVariantState(this.gameMode);
                    }
                }
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
                        this.currentNode = this.rootNode;
                        this.#engine.load(this.rootNode.fen);
                        this.turn = this.#engine.turn();
                        if (typeof this.reconcileBoardIds === 'function') this.reconcileBoardIds(this.rootNode.fen, null);
                        else this.#reconcileBoardIds(this.rootNode.fen, null);
                        
                        if (this.rootNode.clock) {
                            this.whiteTime = this.rootNode.clock.w;
                            this.blackTime = this.rootNode.clock.b;
                            this.currentWTime = this.rootNode.clock.w;
                            this.currentBTime = this.rootNode.clock.b;
                        }
                        
                        if (this.#ui.moveListContainer) this.#ui.moveListContainer.innerHTML = '';
                        if (this.#ui.updateClocks) this.#ui.updateClocks();
                        
                        const wLabel = (this.pgnHeaders['White'] || 'White') + (this.pgnHeaders['WhiteElo'] ? ` (${this.pgnHeaders['WhiteElo']})` : '');
                        const bLabel = (this.pgnHeaders['Black'] || 'Black') + (this.pgnHeaders['BlackElo'] ? ` (${this.pgnHeaders['BlackElo']})` : '');
                        if (this.#ui.updatePgnAvatars) this.#ui.updatePgnAvatars(this.pgnHeaders['White'], this.pgnHeaders['Black'], this.isEngineMatch, true);
                        
                        if (this.#ui.flipped) this.#ui.updatePlayerNames(wLabel, bLabel);
                        else this.#ui.updatePlayerNames(bLabel, wLabel);

                        this.#ui._lastMetadataCache = null;
                        this.#ui._lastHeadersCache = null;
                        this.#ui.displayMetadata(this.pgnHeaders);
                        this.#ui.playerInfo = this.#ui.playerInfo || { w: {}, b: {} };
                        
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
                        
                        this.#ui.updateHistory(true);
                        this.#ui.renderBoard(false);
                        this.#ui.renderArrows();
                        this.#ui.renderHeaders();
                        this.#emit('boardUpdated', { animate: false, skipEngine: true });
                        
                        requestAnimationFrame(() => { this.#ui.renderCharts(); });
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                const graphTab = document.getElementById('tabContent-Graph');
                                if (graphTab && graphTab.classList.contains('active') && typeof this.#ui.renderFullGraph === 'function') {
                                    if (this.#ui._graphNodeCache) this.#ui._graphNodeCache = new Map(); 
                                    this.#ui.renderFullGraph();
                                }
                            });
                        });
                    }
                } catch (err) {
                    console.warn("UI refresh warning:", err);
                }
            }
            console.timeEnd(timerId);
        }
        return true;
    }
getNagInfo(nag) {
        if (!nag) return null;
        let nags = nag.toString().split(',').map(n => n.trim().replace('$', ''));
        let v = nags.find(n => NAG_MAP[n]) || nags[0]; 
        return NAG_MAP[v] || null;
    }
generatePGN(format = 'both') {
    let pgn = "";
    for (let key in this.pgnHeaders) {
        if (key.toLowerCase() === 'from') continue; 
        pgn += `[${key} "${this.pgnHeaders[key]}"]\n`;
    }
    pgn += "\n";

    let movesText = this.#generatePGNRecursive(this.rootNode, 1, false, format, null);
    movesText = movesText.trim().replace(/[ \t]+/g, ' ');
    pgn += movesText;

    let result = this.pgnHeaders['Result'] || '*';
    if (!pgn.trim().endsWith(result)) pgn += " " + result;

    return pgn;
    }
exportPGN() {
        const formatMenu = document.getElementById('pgnFormatSelect');
        const exportFormat = formatMenu ? formatMenu.value : 'both';
        
        let pgnData = "";

        // When you switch to the Editor tab, the game switches memory contexts.
        // But the UI perfectly pastes the Analysis game's PGN into the editorPgnInput box.
        // We MUST export that box's value instead of the Editor's separate memory!
        if (this.mode === 'editor') {
            const editorPgnBox = document.getElementById('editorPgnInput');
            if (editorPgnBox && editorPgnBox.value.trim() !== '') {
                pgnData = editorPgnBox.value;
            } else {
                pgnData = this.generatePGN(exportFormat);
            }
        } else {
            pgnData = this.generatePGN(exportFormat); 
        }

        if (!pgnData) {
            if (this.#ui && typeof this.#ui.showNotification === 'function') {
                this.#ui.showNotification("No PGN data to export.","Export Failed","⚠️");
            }
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
        
        if (this.#ui && typeof this.#ui.showNotification === 'function') {
            this.#ui.showNotification("PGN file downloaded successfully.", "Export Complete", "📥");
        }
    }
addPremove(move) {
        if (this.premoveMode === 'none' || this.gameOver) return; 
        if (!this.isPlayingLiveGame && !this.isPuzzle) return;

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
        if (this.premoveQueue.length === 0 || this.gameOver) return;
        if (!this.isPlayingLiveGame && !this.isPuzzle) return;

        const move = this.premoveQueue[0];
        
        if (this.turn !== move.color) return; 
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
            this.clearPremoves();
            if (typeof this.#ui !== 'undefined') this.#ui.renderBoard(true);
            return;
        }

        const result = this.makeMove(move, move.promotion || 'q', false, null, true);

        if (result) {
            this.premoveQueue.shift();
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
        console.log(`\n♟️ [MAKE MOVE START] mode: '${this.mode}', Move:`, move);
        
        if (isAutoReply && this.mode !== 'bot' && this.mode !== 'puzzle') {
            console.error(`[Sandbox ERRROR] Blocked delayed auto-reply from bleeding across tabs!`);
            return null;
        }

        if (this.currentNode && this.currentNode.fen && this.#engine && !batchMode) {
            const engineBase = this.#engine.fen().split(' ').slice(0, 3).join(' ');
            const nodeBase = this.currentNode.fen.split(' ').slice(0, 3).join(' ');
            if (engineBase !== nodeBase) {
                console.error(`[Sandbox ERROR] Desync! Engine FEN: ${engineBase} | Node FEN: ${nodeBase}`);
                return null;
            }
        }

        if (this.#engine && this.#engine.game_over()) return null;
        
        // When loadPGN fires "Fz@f7", we buffer it and wait for the piece move to arrive!
        if (typeof move === 'string') {
            if (this.gameMode === 'spell' && move.includes('@') && move.match(/^[FJ]z?p?@/)) {
                const isFreeze = move.startsWith('Fz');
                const targetStr = move.split('@')[1];
                const targetSq = (8 - parseInt(targetStr[1])) * 8 + (targetStr.charCodeAt(0) - 97);
                
                // Save it and abort. Don't process a turn yet!
                this._pendingReloadSpell = { 
                    isSpell: true, 
                    spellType: isFreeze ? 'freeze' : 'jump', 
                    target: targetSq, 
                    spellSan: move 
                };
                return null; 
            }
        }

        if (this._pendingReloadSpell) {
            if (typeof move === 'object') {
                move.isSpell = true;
                move.spellType = this._pendingReloadSpell.spellType;
                move.target = this._pendingReloadSpell.target;
                move.spellSan = this._pendingReloadSpell.spellSan;
            } else if (typeof move === 'string') {
                // If it's a string, seamlessly join them (Jp@d2_Bxe1)
                move = `${this._pendingReloadSpell.spellSan}_${move}`;
            }
            this._pendingReloadSpell = null; // clear it
        }
        
        if (!this.isChess960 && move && move.from !== undefined && move.to !== undefined && !move.isSpell && this.#engine) {
            const fromStr = typeof move.from === 'number' && typeof this.#indexToSquare === 'function' ? this.#indexToSquare(move.from) : move.from;
            const toStr = typeof move.to === 'number' && typeof this.#indexToSquare === 'function' ? this.#indexToSquare(move.to) : move.to;

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
            } 
            if (move.from !== undefined && move.to !== undefined) {
                if (move.from === '@' || move.drop) {
                    batchObj.from = '@';
                    batchObj.drop = move.drop || move.piece;
                    batchObj.to = typeof move.to === 'number' ? this.#indexToSquare(move.to) : move.to;
                } else {
                    batchObj.from = typeof move.from === 'number' ? this.#indexToSquare(move.from) : move.from;
                    batchObj.to = typeof move.to === 'number' ? this.#indexToSquare(move.to) : move.to;
                }
            }
            batchObj.promotion = promotion || 'q';
            if (move.duck_sq !== undefined) {
                batchObj.duck_sq = typeof move.duck_sq === 'number' ? this.#indexToSquare(move.duck_sq) : move.duck_sq;
            }

            const originalError = console.error;
            console.error = () => {};

            let result = null;
            try {
                result = this.#engine.move(batchObj);
            } catch(e) {
                result = null;
            }

            console.error = originalError;
            
            if (!result) return null;
            
            const newFen = this.#engine.fen();
            
            let finalSan = pgnText || result.san;

            if (move.isSpell) {
                let targetStr = typeof move.target === 'number' ? this.#indexToSquare(move.target) : move.target;
                move.spellSan = `${move.spellType === 'freeze' ? 'Fz' : 'Jp'}@${targetStr}`;
                
                if (!finalSan.startsWith('Fz@') && !finalSan.startsWith('Jp@')) {
                    finalSan = `${move.spellSan} ${finalSan}`;
                }
            }
            
            this.#addMoveToTree(newFen, finalSan, move.to, {
                from: move.from, to: move.to, flags: result.flags, color: result.color
            }, false);
            
            this.turn = this.#engine.turn();
            return result;
        }

        if (this.isPlayingLiveGame && !this.#timerInterval) {
            if (typeof this.#startTimer === 'function') this.#startTimer();
        }

        const moveObj = {};
        if (move.isSpell) {
            moveObj.isSpell = true; 
            moveObj.spellType = move.spellType || move.type; 
            let tVal = move.target !== undefined ? move.target : move.square;
            moveObj.target = typeof tVal === 'number' ? this.#indexToSquare(tVal) : tVal;
        }
        if (move.from !== undefined && move.to !== undefined) {
            if (move.from === '@' || move.drop) {
                moveObj.from = '@';
                moveObj.drop = move.drop || move.piece;
                moveObj.to = typeof move.to === 'number' ? this.#indexToSquare(move.to) : move.to;
            } else {
                moveObj.from = typeof move.from === 'number' ? this.#indexToSquare(move.from) : move.from;
                moveObj.to = typeof move.to === 'number' ? this.#indexToSquare(move.to) : move.to;
            }
        }
        if (promotion) {
            moveObj.promotion = promotion;
        } else if (moveObj.from && moveObj.to && moveObj.from !== '@') {
            const pce = this.#engine.get(moveObj.from);
            if (pce && pce.type === 'p' && (moveObj.to.includes('8') || moveObj.to.includes('1'))) {
                moveObj.promotion = 'q';
            }
        }
        if (move.duck_sq !== undefined) {
            moveObj.duck_sq = typeof move.duck_sq === 'number' ? this.#indexToSquare(move.duck_sq) : move.duck_sq;
        }

        const originalError = console.error;
        console.error = () => {};

        let result = null;
        try {
            result = this.#engine.move(moveObj, !!moveObj.isSpell);
        } catch(e) {
            result = null;
        }

        if (!result && move.san) {
            let fallbackSan = move.san;
            if (promotion && fallbackSan.includes('=')) {
                fallbackSan = fallbackSan.substring(0, fallbackSan.indexOf('=') + 1) + promotion.toUpperCase();
            }
            try { result = this.#engine.move(fallbackSan, { sloppy: true }); } catch(e) {}
        }
        if (!result && moveObj.from && moveObj.to) {
            const rawUci = moveObj.from + moveObj.to + (promotion || '');
            try { result = this.#engine.move(rawUci, { sloppy: true }); } catch(e) {}
        }

        console.error = originalError;

        if (!result) {
            console.error(`[MAKE MOVE] Engine completely rejected move!`, moveObj, move);
            return null;
        }
        if (result.isStandaloneSpell) {
            if (this.#ui) {
                this.#emit('boardUpdated', { skipEngine: true });
            }
            return result;
        }
        let soundFired = false;
        const fireSound = () => {
            if (!soundFired && !muteEngine && !isAutoReply) {
                if (typeof this.triggerMoveSound === 'function') this.triggerMoveSound(result);
                soundFired = true;
            }
        };

        const newFen = this.#engine.fen();
        const nextTurn = this.#engine.turn(); 

        if (this.mode === 'puzzle') {
            const userStr = (result.from + result.to + (result.promotion || '')).toLowerCase();
            const solStr = (this.puzzleSolution[this.puzzleCursor] || '').toLowerCase().replace(/[^a-z0-9]/g, '');

            if (!isAutoReply) {
                if (userStr !== solStr && !this.#engine.in_checkmate()) {
                    result.puzzleStatus = 'wrong'; 
                    fireSound(); 
                    
                    this.#engine.undo();
                    if (typeof this.#reconcileBoardIds === 'function') this.#reconcileBoardIds(this.#engine.fen());
                    if (this.#ui && typeof this.#ui.renderBoard === 'function') this.#ui.renderBoard(false);
                    if (typeof this.#puzzleFail === 'function') this.#puzzleFail();
                    return null; 
                }
                
                if (this.#engine.in_checkmate() || (this.puzzleCursor >= this.puzzleSolution.length - 1)) {
                    result.puzzleStatus = 'solved';
                    if (window.sfWorker) window.sfWorker.postMessage('stop');
                    if (typeof this.#puzzleSuccess === 'function') this.#puzzleSuccess();
                } else {
                    result.puzzleStatus = 'correct';
                    this.puzzleCursor++;
                }
            } else {
                this.puzzleCursor++;
            }
        }

        const now = Date.now();
        const timeSpent = Math.max(0, (now - (this.lastMoveTime || now)) / 1000);
        this.lastMoveTime = now;

        if (typeof this.#reconcileBoardIds === 'function') this.#reconcileBoardIds(newFen, move);

        const moveData = { 
            from: move.from !== undefined ? move.from : '@', 
            to: move.to !== undefined ? move.to : move.target, 
            flags: result.flags, 
            color: result.color 
        };
        
        let finalSan = result.san;
        
        if (move.isSpell) {
            let targetStr = typeof move.target === 'number' ? this.#indexToSquare(move.target) : move.target;
            move.spellSan = `${move.spellType === 'freeze' ? 'Fz' : 'Jp'}@${targetStr}`;
            
            if (!finalSan.startsWith('Fz@') && !finalSan.startsWith('Jp@')) {
                finalSan = `${move.spellSan} ${finalSan}`;
            }
        }
        
        console.log(`🌳 [TREE APPEND] Current mode: '${this.mode}', Appending Move: ${finalSan}`);
        if (typeof this.#addMoveToTree === 'function') this.#addMoveToTree(newFen, finalSan, moveData.to, moveData, true);
        
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
            setTimeout(() => { if (typeof this.attemptPremove === 'function') this.attemptPremove(); }, 150);
        }

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

            if (typeof this.#endGame === 'function') this.#endGame(resultStr, statusMsg);
            
            if (typeof this.clearPremoves === 'function') this.clearPremoves();
            if (window.sfWorker && !window.engineAnalysing) window.sfWorker.postMessage('stop');
            
            if (!muteEngine && window.engineAnalysing && window.sfWorker && this.turn !== this.botColor) {
                if (this._engineRebootTimeout) clearTimeout(this._engineRebootTimeout);
                this._engineRebootTimeout = setTimeout(() => { if(typeof this.updateStockfish === 'function') this.updateStockfish(); }, 200);
            }

            fireSound(); 
            return result;
        }
        
        const liveTurn = this.currentLiveTurn || this.turn;
        const isBotTurn = (this.mode === 'bot' && liveTurn === this.botColor);
        
        if (this.isPlayingLiveGame && isBotTurn) {
            setTimeout(() => { if (typeof this.#triggerBotMove === 'function') this.#triggerBotMove(); }, 250);
        } 
        else if (this.mode === 'puzzle' && !this.gameOver) {
            if (this.puzzleCursor % 2 === 0 && this.puzzleCursor < this.puzzleSolution.length) {
                const isRush = ['3min', '5min', 'survival'].includes(this.puzzleMode);
                const delay = isRush ? 150 : 400;
                
                setTimeout(() => {
                    const response = this.puzzleSolution[this.puzzleCursor];
                    if (response) {
                        const from = typeof this.#squareToIndex === 'function' ? this.#squareToIndex(response.substring(0, 2)) : response.substring(0,2);
                        const to = typeof this.#squareToIndex === 'function' ? this.#squareToIndex(response.substring(2, 4)) : response.substring(2,4);
                        const prm = response.length > 4 ? response.substring(4, 5) : undefined;
                        const botRes = this.makeMove({ from, to }, prm, false, null, false, true);
                        
                        if (this.#ui && botRes) {
                            if (typeof this.#ui.renderBoard === 'function') this.#ui.renderBoard(true); 
                            if (typeof this.#ui.renderHeaders === 'function') this.#ui.renderHeaders();
                            if (!this.isAnalysisMode) setTimeout(() => { if (typeof this.attemptPremove === 'function') this.attemptPremove(); }, 100);
                        }
                    }
                }, delay);
            }
        }

        if (!muteEngine && window.engineAnalysing && window.sfWorker && !isBotTurn) {
            if (this._engineRebootTimeout) clearTimeout(this._engineRebootTimeout);
            this._engineRebootTimeout = setTimeout(() => { if(typeof this.updateStockfish === 'function') this.updateStockfish(); }, 200);
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
        console.group(`🚀 [START LOCAL GAME] Initializing...`);
        console.log(`🛑 PRE-SWITCH MODE: '${this.mode}'`);
        
        this.#prepareNewGameSetup();
        if (!startFen) {
            startFen = (typeof VARIANT_STARTING_FENS !== 'undefined' && VARIANT_STARTING_FENS[this.gameMode]) ? VARIANT_STARTING_FENS[this.gameMode] : INITIAL_FEN;
            if (this.gameMode === 'chess960' && typeof this.generateChess960FEN === 'function') {
                startFen = this.generateChess960FEN();
            }
        }

        if (window.sfWorker) {
            if (this.activeEngineType === 'fairy' || this.activeEngineType === 'custom') {
                const sfVariant = this.gameMode === 'classical' ? 'chess' : this.gameMode;
                this.#safeSetOption('UCI_Variant', sfVariant);
            } else {
                this.#safeSetOption('UCI_Chess960', (this.gameMode === 'chess960' ? 'true' : 'false'));
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

        if (this.mode && this.mode !== 'local' && this.mode !== 'bot' && this.mode !== 'play') {
            console.log(`🛡️ Firing safety backup save for leaving mode: '${this.mode}'`);
            if (typeof this.saveVariantState === 'function') this.saveVariantState(this.gameMode);
        }

        this.mode = 'local';
        console.log(`✅ POST-SWITCH MODE: '${this.mode}'`);
        
        this.botColor = null;
        this.#engine = new (typeof Chess === 'function' ? Chess : window.Chess)(undefined, this.gameMode);

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

        if (typeof this.#engine.header === 'function') {
            this.#engine.header('Event', this.pgnHeaders.Event, 'Site', this.pgnHeaders.Site, 'White', this.pgnHeaders.White, 'Black', this.pgnHeaders.Black);
            if (this.pgnHeaders.Variant) this.#engine.header('Variant', this.pgnHeaders.Variant);
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
        
        console.log(`💾 Forcing base state save post-initialization...`);
        this.#saveState('play');
        console.groupEnd();
    }
startBotGame(level, colorPreference, startFen = null) {
        this.#prepareNewGameSetup();
        if (!startFen) {
            startFen = (typeof VARIANT_STARTING_FENS !== 'undefined' && VARIANT_STARTING_FENS[this.gameMode]) ? VARIANT_STARTING_FENS[this.gameMode] : INITIAL_FEN;
            if (this.gameMode === 'chess960' && typeof this.generateChess960FEN === 'function') {
                startFen = this.generateChess960FEN();
            }
        }

        if (window.sfWorker) {
            if (this.activeEngineType === 'fairy' || this.activeEngineType === 'custom') {
                const sfVariant = this.gameMode === 'classical' ? 'chess' : this.gameMode;
                this.#safeSetOption('UCI_Variant', sfVariant);
            } else {
                this.#safeSetOption('UCI_Chess960', (this.gameMode === 'chess960' ? 'true' : 'false'));
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

        if (this.mode && this.mode !== 'local' && this.mode !== 'bot' && this.mode !== 'play') {
            if (typeof this.saveVariantState === 'function') this.saveVariantState(this.gameMode);
        }

        this.mode = 'bot';

        this.#engine = new (typeof Chess === 'function' ? Chess : window.Chess)(undefined, this.gameMode);

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

        if (typeof this.#engine.header === 'function') {
            this.#engine.header('Event', this.pgnHeaders.Event, 'Site', this.pgnHeaders.Site, 'White', this.pgnHeaders.White, 'Black', this.pgnHeaders.Black);
            if (this.pgnHeaders.Variant) this.#engine.header('Variant', this.pgnHeaders.Variant);
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
        this.#prepareNewGameSetup();
        this.gameMode = 'chess960';
        const fen = typeof this.generateChess960FEN === 'function' ? this.generateChess960FEN() : INITIAL_FEN;
        
        if (window.sfWorker) {
            this.#safeSetOption('UCI_Chess960', 'true');
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
            this.#safeSetOption('UCI_Chess960', 'true');
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
        this.#safeSetOption('Skill Level', '20');
        this.#safeSetOption('UCI_LimitStrength', 'true');
        this.#safeSetOption('UCI_Elo', settings.uciElo);
    }
loadAllStudies() {
        try {
            const stored = localStorage.getItem('chess_studies_library');
            const lastStudyId = localStorage.getItem('chess_last_study_id'); 

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
                // If the library is empty, LEAVE IT EMPTY. Do not generate a placeholder!
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
        
        // Inject the Variant Tag!
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
            
            // Load the study FIRST, then save it so the correct ID writes to memory!
            this.loadStudy(newStudyId, true);
            this.saveAllStudies();
            
        } else {
            const gameStr = extractedGames[0];
            const chapterMatch = gameStr.match(/\[ChapterName\s+"([^"]+)"\]/);
            const eventMatch = gameStr.match(/\[Event\s+"([^"]+)"\]/);
            const title = chapterMatch ? chapterMatch[1] : (eventMatch ? eventMatch[1] : `Chapter ${this.chapters.length + 1}`);
            
            this.chapters.push({ title: title, pgn: gameStr.trim(), analysisMode: 'Normal analysis' });
            
            // Complete the save cycle for Text-box imports!
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
            
            // Ensure memory locks onto the new ID before saving!
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
            
            // Load the newly appended chapter FIRST, then save the array!
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
saveCurrentGameToStudy(studyId) {
        // 1. Silently generate the PGN of the game you just played
        let currentPgn = typeof this.generatePGN === 'function' ? this.generatePGN() : "";
        if (!currentPgn) {
            console.warn("[STUDY] No PGN available to save.");
            return;
        }

        // 2. Ensure your existing study database is loaded into memory
        if (typeof this.loadAllStudies === 'function') {
            this.loadAllStudies();
        }
        
        if (!this.allStudies) this.allStudies = [];

        let targetStudy = null;

        // 3. Handle creating a NEW study
        if (studyId === 'NEW') {
            const inputEl = document.getElementById('newStudyInput');
            const newTitle = inputEl ? inputEl.value.trim() : "";
            
            if (!newTitle) {
                if (this.#ui && typeof this.#ui.showNotification === 'function') {
                    this.#ui.showNotification("Please enter a title for the new study.", "Error", "⚠️");
                }
                return;
            }
            
            targetStudy = {
                id: 'study_' + Date.now(),
                title: newTitle,
                chapters: [],
                activeChapterIndex: 0
            };
            this.allStudies.push(targetStudy);
            
            // Auto-select this as the active study in the background (without loading the UI for it)
            this.currentStudyId = targetStudy.id;
            
        } else {
            // Handle saving to an EXISTING study
            targetStudy = this.allStudies.find(s => s.id === studyId);
        }

        if (!targetStudy) return;

        // 4. Create the new chapter inside the target study
        if (!targetStudy.chapters) targetStudy.chapters = [];
        
        const dateStr = new Date().toLocaleDateString();
        
        // Add the required headers for your custom study system so it exports correctly later
        let chapterTitle = `Game ${targetStudy.chapters.length + 1} - ${dateStr}`;
        let finalPgn = currentPgn;
        
        if (!finalPgn.includes('[ChapterName')) {
            finalPgn = `[ChapterName "${chapterTitle}"]\n` + finalPgn;
        }
        if (!finalPgn.includes('[StudyName')) {
            finalPgn = `[StudyName "${targetStudy.title}"]\n` + finalPgn;
        }

        targetStudy.chapters.push({
            title: chapterTitle,
            pgn: finalPgn,
            analysisMode: 'normal'
        });

        // 5. Command your existing system to save this array back to localStorage!
        if (typeof this.saveAllStudies === 'function') {
            // Since saveAllStudies strictly saves `this.chapters` if `this.currentStudyId` matches,
            // we temporarily sync them if we just modified the active study.
            if (this.currentStudyId === targetStudy.id) {
                this.chapters = targetStudy.chapters;
                this.studyTitle = targetStudy.title;
            }
            this.saveAllStudies();
        }

        // 6. Refresh memory and close UI
        const modal = document.getElementById('addToStudyModal');
        if (modal) modal.style.display = 'none';

        if (this.#ui && typeof this.#ui.showNotification === 'function') {
            this.#ui.showNotification(`Game successfully saved to "${targetStudy.title}"!`, 'Saved to Study', '📁');
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
        // If there are no studies or no ID, just save the empty state.
        if (!this.currentStudyId || this.allStudies.length === 0) {
            localStorage.setItem('chess_studies_library', JSON.stringify(this.allStudies));
            if (!this.currentStudyId) {
                localStorage.removeItem('chess_last_study_id');
            }
            return;
        }

        let current = this.allStudies.find(s => s.id === this.currentStudyId);

        // ONLY update the study if it actually exists! 
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

        // If we are deleting a background study, ensure the current one is saved first!
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
            
            // Explicitly command the system to save the deletion!
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
            // Explicitly command the system to save the deletion!
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
        const wasTrainer = (this.mode === 'trainer');
        
        if (this.mode !== 'study' && typeof this.#saveState === 'function') {
            this.#saveState(this.mode);
        }
        if (!skipSave && this.activeChapterIndex !== -1 && this.mode === 'study') {
            if (typeof this.saveActiveChapter === 'function') this.saveActiveChapter();
        }
        
        this.activeChapterIndex = index;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('chess_active_chapter_idx', index);
        }

        this.mode = wasTrainer ? 'trainer' : 'study';
        this.gameOver = true;
        
        const currentChapter = this.chapters[index];
        let pgn = currentChapter.pgn;
        if (!pgn || pgn.trim() === '') pgn = '[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"]\n\n*';
        
        this.loadPGN(pgn, false, true); 

        if (!this.pgnHeaders['Event']) this.pgnHeaders['Event'] = `${this.studyTitle} - ${currentChapter.title}`;
        if (!this.pgnHeaders['ChapterName']) this.pgnHeaders['ChapterName'] = currentChapter.title;

        if (typeof this.#saveState === 'function') {
            this.#saveState(this.mode);
        }
        
        if (this.#ui) {
            const variantSelect = document.getElementById('analysisVariantSelect');
            if (variantSelect) variantSelect.value = this.gameMode;

            const studyTitleEl = document.getElementById('studyTitleDisplay');
            if (studyTitleEl) studyTitleEl.innerText = `${this.studyTitle} • ${currentChapter.title}`;

            if (this.mode === 'trainer') {
                const colorSel = document.getElementById('trainerColorSelect');
                const wantFlipped = colorSel ? (colorSel.value === 'b') : false;
                if (this.#ui.flipped !== wantFlipped) this.#ui.flipBoard();
            } else {
                const orient = currentChapter.orientation || 'w';
                if ((orient === 'w' && this.#ui.flipped) || (orient === 'b' && !this.#ui.flipped)) {
                    this.#ui.flipBoard();
                }
            }

            const wLabel = (this.pgnHeaders['White'] || 'White') + (this.pgnHeaders['WhiteElo'] ? ` (${this.pgnHeaders['WhiteElo']})` : '');
            const bLabel = (this.pgnHeaders['Black'] || 'Black') + (this.pgnHeaders['BlackElo'] ? ` (${this.pgnHeaders['BlackElo']})` : '');
            
            this.#ui.updatePgnAvatars(this.pgnHeaders['White'], this.pgnHeaders['Black'], this.isEngineMatch, true);
            if (this.#ui.flipped) this.#ui.updatePlayerNames(wLabel, bLabel);
            else this.#ui.updatePlayerNames(bLabel, wLabel);

            this.#ui.displayMetadata(this.pgnHeaders);
            this.#ui.renderHeaders();
            if (typeof this.#ui.renderChapters === 'function') this.#ui.renderChapters();

            if (typeof this.#ui.toggleHideNextMoves === 'function') {
                const shouldHide = (currentChapter.analysisMode === 'hidden');
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

        // 1. PUZZLE GRADING
        if (this.mode === 'puzzle' && move.color === this.playerColor) {
            const pStatus = move.puzzleStatus || move.status;
            if (pStatus === 'wrong' || move.isWrong) type = 'wrong';
            else if (pStatus === 'solved' || pStatus === 'best' || move.isSolved) type = 'best';
            else if (pStatus === 'correct' || move.isCorrect) type = 'correct';
            
            if (['wrong', 'best', 'correct'].includes(type)) {
                this.#emit('soundTriggered', { type, destSquare: move.to });
                return;
            }
        }

        // 2. GAME OVER
        if (this.#engine.game_over()) {
            if (this.#engine.in_draw() || this.#engine.in_stalemate() || (typeof this.#engine.in_threefold_repetition === 'function' && this.#engine.in_threefold_repetition())) {
                type = 'draw';
            } else if (this.#engine.in_checkmate()) {
                const matedColor = this.#engine.turn(); 
                type = (this.mode === 'bot') ? (matedColor === this.botColor ? 'win-long' : 'lose-long') : 'win-long';
            } else {
                type = 'win'; 
            }
            this.#emit('soundTriggered', { type, destSquare: move.to });
            return;
        }

        // 3. ACTION SOUNDS
        if (this.#engine.in_check()) {
            type = 'check';
        } else if (flags.includes('p')) {
            type = 'promote';
        } else if (flags.includes('c') || flags.includes('e')) {
            type = 'capture';
        } else if (flags.includes('k') || flags.includes('q')) {
            type = 'castle';
        } else {
            if (this.mode === 'bot' && move.color === this.botColor) {
                type = 'move-opponent';
            } else if (this.mode === 'puzzle' && move.color !== this.playerColor) {
                type = 'move-opponent';
            } else {
                type = 'move-self';
            }
        }

        // 👉 PHÁT ÂM THANH THEO NHỊP (Throttle ~45ms kiểu Lichess, không dùng clearTimeout để tránh nuốt tiếng)
        const now = performance.now();
        if (!this._lastSoundTime || (now - this._lastSoundTime >= 45)) {
            this._lastSoundTime = now;
            this.#emit('soundTriggered', { type, destSquare: move.to });
        }
    }
}