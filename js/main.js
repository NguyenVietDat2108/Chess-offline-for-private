import { ChessGame } from './ChessGame.js';
import { UI } from './UI.js';
import { BoardScanner } from './scan.js';

window.sfWorker = null;
window.engineAnalysing = false;

class ChessApp {
    constructor() {
        this.game = new ChessGame();
        this.ui = new UI();
        this.scanner = new BoardScanner();

        // 1. DEPENDENCY INJECTION: Connect them privately
        this.game.setUI(this.ui);
        this.ui.setGame(this.game);

        // 2. THE SWITCHBOARD: Catch the encapsulated Game events!
        this.bindEvents();

        this.ui.init();
        
        const lastVariant = localStorage.getItem('chess_last_variant') || 'classical';
        const isFairy = !['classical', 'chess960'].includes(lastVariant);
        
        // 1. Fetch the name from cache or default
        let cachedName = isFairy ? "Fairy-Stockfish 14 NNUE" : (localStorage.getItem('chess_cached_engine_name') || "Stockfish 18");
        
        // ✨ FIX: Force the first letter to be Capitalized (e.g. "stockfish 18" -> "Stockfish 18")
        if (cachedName && cachedName.length > 0) {
            cachedName = cachedName.charAt(0).toUpperCase() + cachedName.slice(1);
        }
        
        if (typeof this.ui.updateEngineName === 'function') {
            this.ui.updateEngineName(cachedName);
        }
        window.currentEngineShortName = cachedName;

        const variantSelect = document.getElementById('analysisVariantSelect');
        if (variantSelect) variantSelect.value = lastVariant;
        
        // Boot the game rules and workers
        requestAnimationFrame(() => {
            setTimeout(() => {
                if (this.game) this.game.setGameMode(lastVariant, true);
            }, 200);
        });
    }
        

    bindEvents() {
        // 1. Core Board Synchronization
        this.game.on('boardUpdated', (data) => { 
            const shouldAnimate = data && data.animate === true;
            const overrideMove = data && data.overrideMove ? data.overrideMove : null;
            
            // ✨ THE FIX: Pass the previousBoard snapshot into the UI!
            if (data && data.isGoToStart && typeof this.ui.animateToStartPosition === 'function') {
                this.ui.animateToStartPosition(data.targetFen, data.previousBoard, () => {
                    this.ui.renderBoard(false);
                });
            } else {
                if (typeof this.ui.renderBoard === 'function') {
                    this.ui.renderBoard(shouldAnimate, true, overrideMove);
                }
            }
            
            if (typeof this.ui.updateHistory === 'function') this.ui.updateHistory(true);
            if (typeof this.ui.updateClocks === 'function') this.ui.updateClocks();
            if (typeof this.ui.renderArrows === 'function') this.ui.renderArrows();
            if (typeof this.ui.displayMetadata === 'function') this.ui.displayMetadata(this.game.pgnHeaders);
            
            if (!data?.skipEngine && window.engineAnalysing && typeof this.game.updateStockfish === 'function') {
                const state = typeof this.game.getReader === 'function' ? this.game.getReader() : null;
                if (!state || state.mode !== 'play') {
                    this.game.updateStockfish();
                }
            }
        })

        // 2. Route Sounds cleanly to the SoundManager
        this.game.on('soundTriggered', (data) => {
            if (typeof window.SoundManager !== 'undefined') {
                const volEl = document.getElementById('soundVolume');
                const vol = volEl ? parseFloat(volEl.value) : 0.7;
                
                window.SoundManager.play(data.type, vol, data.destSquare);
            }
        });

        // 3. Route the Game Over Modal & Cleanup
        this.game.on('gameOver', (data) => {
            if (typeof this.ui.updateStatus === 'function') this.ui.updateStatus(data.statusMsg);
            if (typeof this.ui.showGameOver === 'function') this.ui.showGameOver(data.winner, data.reason);
            if (typeof this.ui.toggleReviewButton === 'function') this.ui.toggleReviewButton(true);
            
            // Restore missing Pause Button cleanup
            const pauseBtn = document.getElementById('pauseBtn');
            if (pauseBtn) pauseBtn.innerText = "⏸";
            const pauseOverlay = document.getElementById('pauseOverlay');
            if (pauseOverlay) pauseOverlay.style.display = 'none';
        });

        // 4. Route Engine Eval (Eval Bar, Charts, and Ghost Arrows)
        // 4. Route Engine Eval (Eval Bar, Charts, and Ghost Arrows)
        this.game.on('engineEval', (data) => {
            if (typeof this.ui.updateEvalBar === 'function') this.ui.updateEvalBar(data.type, data.score);
            if (typeof this.ui.updateInlineEval === 'function') this.ui.updateInlineEval(data.node);
            
            const depthEl = document.getElementById('depth-display');
            if (depthEl) depthEl.innerText = `Depth: ${data.depth} | Nps: ${data.nps}`;
            
            const arrowRoot = document.getElementById('tempArrowRoot');
            if (arrowRoot && data.bestMove && typeof this.ui.clearGhostPiece === 'function') {
                arrowRoot.innerHTML = '';
                this.ui.clearGhostPiece();
                
                const bestMove = data.bestMove;
                
                // Crazyhouse Drop
                if (bestMove.includes('@')) {
                    let parts = bestMove.split('@');
                    let pTypeStr = parts[0].toLowerCase();
                    let targetSq = this.game.squareToIndex(parts[1].substring(0, 2));
                    if (typeof this.ui.drawGhostPiece === 'function') {
                        this.ui.drawGhostPiece(arrowRoot, targetSq, pTypeStr, this.game.turn);
                    }
                } else {
                    // Standard Move Arrow (Extracts the first 4 characters)
                    const f = this.game.squareToIndex(bestMove.substring(0, 2));
                    const t = this.game.squareToIndex(bestMove.substring(2, 4));
                    if (typeof this.ui.drawArrow === 'function') {
                        this.ui.drawArrow(arrowRoot, f, t, 'blue', 0.8);
                    }
                    
                    // ✨ FIX: Parse Fairy-Stockfish Duck Moves (e.g., b7e4,e4f3)
                    if (this.game.gameMode === 'duck') {
                        let duckSqStr = null;
                        
                        if (bestMove.includes(',')) {
                            // Split by comma. E.g., ["b7e4", "e4f3"]
                            let duckPart = bestMove.split(',')[1];
                            
                            // If it's exactly 4 chars ("e4f3"), grab the last two ("f3")
                            if (duckPart.length >= 4) {
                                duckSqStr = duckPart.substring(duckPart.length - 2);
                            } 
                            // Fallback if it just sent 2 chars ("f3")
                            else {
                                duckSqStr = duckPart.substring(0, 2);
                            }
                        } 
                        // Fallback for standard 6 or 7 char formats
                        else if (bestMove.length === 6 && !['q','r','b','n'].includes(bestMove[4].toLowerCase())) {
                            duckSqStr = bestMove.substring(4, 6);
                        } 
                        else if (bestMove.length === 7 && ['q','r','b','n'].includes(bestMove[4].toLowerCase())) {
                            duckSqStr = bestMove.substring(5, 7);
                        }

                        if (duckSqStr) {
                            let duckSq = this.game.squareToIndex(duckSqStr);
                            if (duckSq !== -1 && typeof this.ui.drawGhostPiece === 'function') {
                                this.ui.drawGhostPiece(arrowRoot, duckSq, 'duck', 'none');
                            }
                        }
                    }
                }
            }
            if (typeof this.ui.renderCharts === 'function') this.ui.renderCharts(true);
        });

        // 5. Route general system notifications
        this.game.on('notification', (data) => {
            if (typeof this.ui.showNotification === 'function') {
                this.ui.showNotification(data.message, data.title, data.icon);
            }
        });

        // 6. Route Chapter Management
        this.game.on('chaptersImported', (count) => {
            if (typeof this.ui.showNotification === 'function') this.ui.showNotification(`Successfully imported ${count} chapters!`, "Import Complete", "📥");
            if (typeof this.ui.openChapterManager === 'function') this.ui.openChapterManager();
            if (typeof this.ui.renderChapters === 'function') this.ui.renderChapters();
        });
        // 7. Route Puzzle Setup
        this.game.on('puzzleLoaded', (data) => {
            if (this.ui.flipped !== data.wantFlipped && typeof this.ui.flipBoard === 'function') {
                this.ui.flipBoard();
            }
            if (typeof this.ui.updatePuzzleUI === 'function') {
                this.ui.updatePuzzleUI("active", data.puzzle);
            }
            if (typeof this.ui.renderBoard === 'function') {
                this.ui.renderBoard(false);
            }
            if (typeof this.ui.updateHistory === 'function') {
                this.ui.updateHistory();
            }
        });
        this.game.on('lessonStarted', (data) => {
            const panel = document.getElementById('lesson-panel');
            if (panel) panel.style.display = 'block';
            const titleEl = document.getElementById('lesson-title');
            if (titleEl) titleEl.innerText = data.title;
            
            const feedbackEl = document.getElementById('lesson-feedback');
            if (feedbackEl) feedbackEl.innerText = "";
            
            if (typeof this.ui.updateLessonUI === 'function') this.ui.updateLessonUI();
        });

        this.game.on('lessonEnded', () => {
            const panel = document.getElementById('lesson-panel');
            if (panel) panel.style.display = 'none';
        });
    }
}

// Boot the app and expose it ONCE for index.html buttons
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ChessApp();

    window.addEventListener('beforeunload', () => {
        if (window.app.game) {
            if (window.app.game.gameMode) {
                window.app.game.saveVariantState(window.app.game.gameMode);
            }
            // Ask the active mode to execute its memory flush
            if (typeof window.app.game.saveState === 'function') {
                window.app.game.saveState(window.app.game.mode);
            }
        }
    });
});