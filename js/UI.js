import { FILES, RANKS, ICON_BOOK_SVG, ICON_BOOK_SVG_IMG_BLUE, INITIAL_FEN, ICON_SETTING_SVG, VARIANT_STARTING_FENS,ISO_TO_COUNTRY_NAME,NAG_MAP } from './constants.js';
import { MoveNode } from './MoveNode.js';
import { PIECE_SETS } from './piece.js';

export class UI {
    // ==========================================
    // 🔒 PRIVATE FIELDS (Strict Encapsulation)
    // ==========================================
    #game;
    #callbacks;
constructor() {
        this.#game = null;
        this.#callbacks = {}; // Initialize event emitter

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
        this.editorTool = 'cursor';
        this.annotationPopup = document.getElementById('annotationPopup');
        this.pgnStyle = 'standard';
        this.arrowDragStart = null;
        this.isRightClick = false;
        this.moveInputMode = 'both';
        this.hideNextMoves = false;
        this.initDraggableSettings();
        this.avatars = { w: ``, b: `` };
        this.playerInfo = { w: {}, b: {} };
        this.activeSpell = null;
        this.spellMana = { freeze: 2, jump: 2 };
        if (this.annotationPopup) {
            document.addEventListener('click', (e) => { 
                if (!this.annotationPopup.contains(e.target)) this.annotationPopup.style.display = 'none'; 
            });
        }

        this.boardWrapper?.addEventListener('contextmenu', e => e.preventDefault());
        this.isPeeking = false;
        this.DEFAULT_SETTINGS_OPEN = true;
        this.errorNavState = {};
        this.isAnalysisHidden = (typeof localStorage !== 'undefined' ? localStorage.getItem('chess_hide_analysis') : 'false') === 'true';
        setTimeout(() => {
            if (typeof this.resizeApp === 'function') this.resizeApp();

            if (this.#game && typeof this.#game.restoreAnalysisState === 'function') {
                const hasSavedGame = this.#game.restoreAnalysisState();
                if (hasSavedGame) {
                    this.renderBoard(false);
                    this.updateHistory();
                    this.renderArrows();
                    if (typeof this.updateClocks === 'function') this.updateClocks();
                }
            }
        }, 50);
        setTimeout(() => {
            this.injectVariantRuleButtons();
        }, 1000);
    }
on(eventName, callback) {
        this.#callbacks[eventName] = callback;
    }
#emit(eventName, data) {
        if (this.#callbacks[eventName]) {
            this.#callbacks[eventName](data);
        }
    }
setGame(gameInstance) {
        this.#game = gameInstance;
    }
init() {
        this.populatePieceSets();
        this.loadUISettings(); 
        this.#bindDOMEvents(); 
        this.initKeyboardEvents();
        this.injectPanelToggle();
        this.initEditorBars();
        this.initSoundSettings();
        this.initVolume();
        this.initResizer();
        this.initSidebarResizers();
        this.initThemeButtons();
        this.startClockRenderLoop();
        this.boardWrapper = document.getElementById('board-wrapper');
        if (this.boardWrapper) this.boardWrapper.style.width = '632px';
        
        const animCheckbox = document.getElementById('enableAnimations');
        this.animationsEnabled = animCheckbox ? animCheckbox.checked : true;
        if (this.#game && this.#game.gameMode) {
            this.initEditorBars();
        }
        
        this.renderBoard(false);
        this.updateClocks();

        if (this.DEFAULT_SETTINGS_OPEN) {
            const panel = document.getElementById('settingsPanel');
            if (panel) panel.classList.add('visible');
        }

        this.updateBotMenuPreviews();
        this.renderCharts();
        this.#initializeObservers();
        this.#loadCachedTheme(); 
        
        const resignBtn = document.getElementById('resignBtn');
        const drawBtn = document.getElementById('drawBtn');
        if (resignBtn) resignBtn.style.display = 'none';
        if (drawBtn) drawBtn.style.display = 'none';
        
        requestAnimationFrame(() => {
            if (typeof this.resizeApp === 'function') this.resizeApp();
            
            let lastTab = 'play';
            if (typeof localStorage !== 'undefined') {
                lastTab = localStorage.getItem('chess_last_tab') || 'play';
            }
            this.switchTab(lastTab);

            if (this.#game) {
                this.updateHistory(true); 
                this.renderArrows();
                if (typeof this.updateClocks === 'function') this.updateClocks();
            }
        });
    }
#bindDOMEvents() {
        const settingIds = ['premoveMode', 'moveMethod', 'pgnStyle', 'pgnFormatSelect', 'assetType', 'assetExt', 'soundSetSelect', 'coordPosition', 'autoQueen', 'pgnIgnoreMove', 'enableAnimations', 'engineDepth', 'wTimeH', 'wTimeM', 'wTimeS', 'wInc', 'bTimeH', 'bTimeM', 'bTimeS', 'bInc', 'assetEngineFolder'];
        settingIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => this.saveUISettings());
                if (el.type === 'text' || el.type === 'number') {
                    el.addEventListener('input', () => this.saveUISettings());
                }
            }
        });
        const btn = document.getElementById('btnBrowseFolder');
        if (btn) btn.onclick = () => this.loadCustomPieces();

        if (this.boardWrapper) {
            this.boardWrapper.addEventListener('mousedown', (e) => this.handleMouseDown(e));
            this.boardWrapper.addEventListener('mousemove', (e) => this.handleMouseMove(e));
            this.boardWrapper.addEventListener('mouseup', (e) => this.handleMouseUp(e));
            this.boardWrapper.addEventListener('mousedown', (e) => this.processTrashAction(e), true);
            this.boardWrapper.addEventListener('mousemove', (e) => this.processTrashAction(e), true);
        }

        window.addEventListener('resize', () => {
            this.resizeApp();
            if (typeof this.safeResizeCharts === 'function') this.safeResizeCharts();
        });

        this.initGlobalDragEvents();

        const pgnStyleSelect = document.getElementById('pgnStyle');
        if (pgnStyleSelect) {
            pgnStyleSelect.addEventListener('change', (e) => {
                this.pgnStyle = e.target.value;
                this._lastTreeSize = -1;
                this.updateHistory(true);
            });
        }

        const sheet = document.getElementById('moveHistory');
        if (sheet) {
            sheet.addEventListener('focusout', (e) => {
                if (e.target.classList.contains('comment') || e.target.classList.contains('pgn-comment') || e.target.classList.contains('move-comment') || e.target.classList.contains('inline-comment') || e.target.classList.contains('tree-comment')) {
                    let newText = e.target.innerText.trim();
                    newText = newText.replace(/^\/\/\s*/, '').replace(/^\{\s*/, '').replace(/\s*\}$/, '').trim();
                    const nodeId = e.target.dataset.nodeId;

                    if (nodeId && this.#game) {
                        let node = null;
                        if (typeof this.#game.getNodeById === 'function') {
                            node = this.#game.getNodeById(nodeId);
                        } else {
                            const findNode = (n, id) => {
                                if (n.id === id) return n;
                                for (let c of n.children) {
                                    let res = findNode(c, id);
                                    if (res) return res;
                                }
                                return null;
                            };
                            if (this.#game.rootNode) node = findNode(this.#game.rootNode, nodeId);
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

        const commentaryBox = document.getElementById('commentaryBox');
        if (commentaryBox) {
            commentaryBox.addEventListener('focus', (e) => {
                if (this.#game && this.#game.currentNode) {
                    e.target.dataset.activeNodeId = this.#game.currentNode.id;
                    if (e.target.innerText.trim() === "Click to add comment...") {
                        e.target.innerText = "";
                    }
                }
            });

            commentaryBox.addEventListener('input', (e) => {
                const activeId = e.target.dataset.activeNodeId;
                if (!activeId || !this.#game || !this.#game.rootNode) return;
                const findNode = (node, id) => {
                    if (node.id === id) return node;
                    for (let child of node.children) {
                        let res = findNode(child, id);
                        if (res) return res;
                    }
                    return null;
                };

                let node = findNode(this.#game.rootNode, activeId);
                if (node) {
                    let newText = e.target.innerText.trim();
                    node.comment = newText === "" ? null : newText;
                }
            });

            commentaryBox.addEventListener('focusout', (e) => {
                setTimeout(() => {
                    if (e.target.innerText.trim() === "" && document.activeElement !== e.target) {
                        e.target.innerText = "Click to add comment...";
                    }
                    this._lastTreeSize = -1;
                    this.updateHistory(true);
                }, 100);
            });
        }

        const fenInputBox = document.getElementById('fenInput');
        if (fenInputBox) {
            fenInputBox.addEventListener('input', (e) => {
                if (!this.#game || this.#game.mode !== 'editor') return;
                
                const newFen = e.target.value.trim();
                const currentMode = document.getElementById('editorVariantSelect')?.value || this.#game.gameMode;
                
                const validation = this.#game.validateFen(newFen);
                if (validation.valid) {
                    this.#game.loadFEN(newFen, currentMode);
                    if (this.#game.rootNode) {
                        this.#game.rootNode.fen = newFen;
                        this.#game.currentNode = this.#game.rootNode;
                    }
                    this.syncEditorHTMLWithGame(); // Re-syncs the Castling/Turn checkboxes
                    this.renderBoard(false);
                }
            });
        }

        const editorVariantSelect = document.getElementById('editorVariantSelect');
        if (editorVariantSelect) {
            editorVariantSelect.addEventListener('change', (e) => {
                if (this.#game) {
                    const newMode = e.target.value;
                    this.#game.setGameMode(newMode);
                    
                    const analysisSelect = document.getElementById('analysisVariantSelect');
                    if (analysisSelect) analysisSelect.value = newMode;
                    
                    const startFen = (typeof VARIANT_STARTING_FENS !== 'undefined' && VARIANT_STARTING_FENS[newMode]) ? VARIANT_STARTING_FENS[newMode] : INITIAL_FEN;
                    
                    this.#game.loadFEN(startFen, newMode, true);
                    this.#game.rootNode = new MoveNode(startFen, null);
                    this.#game.currentNode = this.#game.rootNode;
                    this.#game.mode = 'editor'; 
                    this.syncEditorHTMLWithGame();
                    this.initEditorBars(); 
                    this.renderBoard(false);
                    
                    if (window.sfWorker) {
                        const sfVariant = newMode === 'classical' ? 'chess' : newMode;
                        window.sfWorker.postMessage('setoption name UCI_Variant value ' + sfVariant);
                    }
                    if (this.#game.tabMemory) {
                        if (!this.#game.tabMemory['analysis']) this.#game.tabMemory['analysis'] = {};
                        this.#game.tabMemory['analysis'].variant = newMode;
                        this.#game.tabMemory['analysis'].fen = startFen;
                        this.#game.tabMemory['analysis'].pgn = ""; // Dọn sạch PGN của variant cũ
                        localStorage.setItem('chess_tab_snapshot_analysis', JSON.stringify(this.#game.tabMemory['analysis']));
                    }
                }
            });
        }
        const analysisVariantSelect = document.getElementById('analysisVariantSelect');
        if (analysisVariantSelect) {
            analysisVariantSelect.addEventListener('change', (e) => {
                if (this.#game) {
                    const newMode = e.target.value;
                    this.#game.setGameMode(newMode);
                    
                    const startFen = (typeof VARIANT_STARTING_FENS !== 'undefined' && VARIANT_STARTING_FENS[newMode]) ? VARIANT_STARTING_FENS[newMode] : INITIAL_FEN;
                    
                    this.#game.loadFEN(startFen, newMode, true);
                    this.#game.rootNode = new MoveNode(startFen, null);
                    this.#game.currentNode = this.#game.rootNode;
                    this.#game.mode = 'analysis'; 
                    
                    if (window.sfWorker) {
                        const sfVariant = newMode === 'classical' ? 'chess' : newMode;
                        window.sfWorker.postMessage('setoption name UCI_Variant value ' + sfVariant);
                    }
                    if (this.#game.tabMemory) {
                        if (!this.#game.tabMemory['analysis']) this.#game.tabMemory['analysis'] = {};
                        this.#game.tabMemory['analysis'].variant = newMode;
                        this.#game.tabMemory['analysis'].fen = startFen;
                        this.#game.tabMemory['analysis'].pgn = ""; 
                        localStorage.setItem('chess_tab_snapshot_analysis', JSON.stringify(this.#game.tabMemory['analysis']));
                    }
                    
                    this.renderBoard(false);
                    this.updateHistory(true);
                }
            });
        }
    }
#initializeObservers() {
        const evalContainer = document.getElementById('evalChartContainer');
        const timeContainer = document.getElementById('timeChartContainer');

        if (!this._chartObserver && (evalContainer || timeContainer)) {
            this._chartObserver = new ResizeObserver(() => {
                if (typeof this.safeResizeCharts === 'function') this.safeResizeCharts();
            });
            if (evalContainer) this._chartObserver.observe(evalContainer);
            if (timeContainer) this._chartObserver.observe(timeContainer);
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
                    wrapper.style.display = 'none';
                    toggleBtn.innerText = "+ Expand Charts";
                } else {
                    wrapper.style.display = 'flex';
                    toggleBtn.innerText = "− Collapse Charts";
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
#loadCachedTheme() {
        try {
            const savedTheme = JSON.parse(localStorage.getItem('chessThemeCache'));
            if (savedTheme && savedTheme.lightHex) {
                this.setPresetTheme(
                    savedTheme.lightHex,
                    savedTheme.darkHex,
                    null,
                    savedTheme.accentColor,
                    savedTheme.gridColor,
                    savedTheme.pieceSet,
                    savedTheme.appBg
                );
            } else {
                this.setPresetTheme('#2bb7ca', '#19579a', null, '#2bb7ca', 'transparent', 'merida', 'radial-gradient(circle at 50% 0%, #1e3a4c 0%, #0f172a 60%, #020617 100%)');
            }
        } catch (e) {
            this.setPresetTheme('#2bb7ca', '#19579a', null, '#2bb7ca', 'transparent', 'merida', 'radial-gradient(circle at 50% 0%, #1e3a4c 0%, #0f172a 60%, #020617 100%)');
        }
    }
#validateEditorExit(currentFen) {
        if (!currentFen || !this.#game || !this.#game.engine) return true;
        if (!this.#game.engine.validate_fen(currentFen).valid) {
            this.showNotification("Invalid Board", `Cannot leave Editor`, "⚠️");
            return false;
        }

        const coreEnter = this.originalEditorFen ? this.originalEditorFen.split(' ').slice(0, 4).join(' ') : "";
        const coreExit = currentFen.split(' ').slice(0, 4).join(' ');

        if (coreEnter && coreExit !== coreEnter) {
            if (typeof this.#game.loadNewPosition === 'function') {
                const currentMode = document.getElementById('editorVariantSelect')?.value || this.#game.gameMode;
                this.#game.loadNewPosition(currentFen, currentMode);
            }
            this._lastTreeSize = -1;
        }
        return true;
    }
#applyTabVisuals(stateMode, lowerTab) {
        const resignBtn = document.getElementById('resignBtn');
        const drawBtn = document.getElementById('drawBtn');
        const isLive = this.#game ? this.#game.isPlayingLiveGame : false;
        
        if (resignBtn) resignBtn.style.display = (isLive && stateMode === 'play') ? 'block' : 'none';
        if (drawBtn) drawBtn.style.display = (isLive && stateMode === 'play') ? 'block' : 'none';

        document.querySelectorAll('.puzzle-hint-pulse, .hint-dot, .hint-circle').forEach(el => el.remove());
        document.querySelectorAll('.square, .piece-img').forEach(el => {
            el.classList.remove('selected', 'highlight', 'active', 'valid-move', 'selected-w', 'selected-b', 'border-w', 'border-b', 'last-move', 'highlight-w', 'highlight-b');
            el.style.cssText = '';
        });

        this.selectedSq = null;
        this.legalMoves = [];
        if (this.clearArrows) this.clearArrows();
        if (this.updateTheme) this.updateTheme();

        const analysisPanel = document.getElementById('analysisPanel');
        const studySidebar = document.getElementById('study-sidebar');
        const mainContainer = document.querySelector('.main-container');

        if (stateMode === 'analysis') {
            if (analysisPanel) analysisPanel.style.display = 'flex';
            if (studySidebar) studySidebar.style.display = 'none';
            if (mainContainer) mainContainer.style.justifyContent = 'flex-start';
            const variantSelect = document.getElementById('analysisVariantSelect');
            if (variantSelect && this.#game && this.#game.gameMode) {
                variantSelect.value = this.#game.gameMode;
            }
        } else if (stateMode === 'study') {
            if (analysisPanel) analysisPanel.style.display = 'none';
            if (studySidebar) studySidebar.style.display = 'flex';
            if (mainContainer) mainContainer.style.justifyContent = 'flex-start';
            if (this.renderChapters) this.renderChapters();
        } else {
            if (analysisPanel) analysisPanel.style.display = 'none';
            if (studySidebar) studySidebar.style.display = 'none';
            if (mainContainer) mainContainer.style.justifyContent = 'center';
        }

        let targetId = 'tabContent-Play';
        if (lowerTab === 'graph') targetId = 'tabContent-Graph';
        else if (stateMode === 'puzzle' || stateMode === 'puzzles') targetId = 'tabContent-Puzzles';
        else if (stateMode === 'editor') targetId = 'tabContent-Editor';
        else if (stateMode === 'trainer' || lowerTab === 'trainer') targetId = 'tabContent-Trainer';

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

        const boardSection = document.querySelector('.board-section');
        const mainSidebar = document.getElementById('mainSidebar');
        const pocketContainer = document.getElementById('pocket-container');
        
        if (lowerTab === 'graph') {
            if (boardSection) boardSection.style.display = 'none';
            if (mainSidebar) mainSidebar.style.display = 'none';
            if (studySidebar) studySidebar.style.display = 'none';
            if (pocketContainer) pocketContainer.style.display = 'none';
            
            if (targetTab) {
                if (targetTab.parentElement !== document.body) {
                    document.body.appendChild(targetTab); 
                }
                targetTab.style.display = 'block';
                targetTab.style.position = 'fixed';
                targetTab.style.width = '100vw';
                targetTab.style.height = '100vh';
                targetTab.style.top = '0';
                targetTab.style.left = '0';
                targetTab.style.zIndex = '50';
                targetTab.style.background = 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)';
            }
        } else {
            if (boardSection) boardSection.style.display = '';
            if (mainSidebar) mainSidebar.style.display = '';
            const graphTab = document.getElementById('tabContent-Graph');
            if (graphTab) graphTab.style.display = 'none';
        }

        if (stateMode === 'editor') {
            document.body.classList.add('show-editor');
            if (typeof this.syncEditorHTMLWithGame === 'function') this.syncEditorHTMLWithGame();
            const variantSelect = document.getElementById('editorVariantSelect');
            if (variantSelect && this.#game) variantSelect.value = this.#game.gameMode || 'classical';
        } else {
            document.body.classList.remove('show-editor');
        }

        if (this.toggleSideMenu) this.toggleSideMenu(false);

        const isEditor = (stateMode === 'editor');
        const isPuzzle = (stateMode === 'puzzle' || stateMode === 'puzzles');
        const isTrainer = (stateMode === 'trainer' || lowerTab === 'trainer');
        const isGraph = (lowerTab === 'graph');

        document.querySelectorAll('.player-header').forEach(el => el.style.display = (isEditor || isPuzzle || isTrainer || isGraph) ? 'none' : '');
        const commentaryBox = document.getElementById('commentaryBox');
        if (commentaryBox) commentaryBox.style.display = (isEditor || isPuzzle || isTrainer || isGraph) ? 'none' : '';
        
        if (isPuzzle && this.#game && this.#game.currentPuzzle) {
            if (typeof this.updatePuzzleUI === 'function') this.updatePuzzleUI("active", this.#game.currentPuzzle);
            if (this.#game.puzzleSolved && typeof this.showPuzzleSuccess === 'function') this.showPuzzleSuccess();
        }

        const engineBtn = document.querySelector('.engine-toggle-btn');
        if (engineBtn) {
            engineBtn.style.display = (isEditor || isTrainer || isGraph) ? 'none' : '';
            let isUnfinishedPuzzle = false;
            if (isPuzzle && this.#game && !this.#game.gameOver && !this.#game.puzzleSolved) isUnfinishedPuzzle = true;
            if (isUnfinishedPuzzle) { engineBtn.style.opacity = '0.5'; engineBtn.style.cursor = 'not-allowed'; } 
            else { engineBtn.style.opacity = '1'; engineBtn.style.cursor = 'pointer'; }
        }
        
        const enginePanel = document.getElementById('enginePanel');
        if (enginePanel) enginePanel.style.display = (isEditor || isTrainer || isGraph) ? 'none' : '';
    }
showVariantRules(variantMode) {
        const mode = variantMode || (this.#game ? this.#game.gameMode : 'classical');
        const rules = {
            'classical': 'Standard rules of chess. Checkmate the opponent to win.',
            'chess960': 'Fischer Random Chess. Pieces on the home rank are randomized. Castling rules adapt to the starting position.',
            '3check': 'First player to check the opponent\'s King 3 times wins.',
            'antichess': 'Capturing is strictly forced if available. Kings have no royal power and can be captured. First to lose all pieces wins.',
            'atomic': 'Capturing causes an explosion, destroying the capturing piece and all surrounding pieces (except pawns). Kings cannot capture. Explode the enemy king to win.',
            'bughouse': 'Captured enemy pieces change color and go into your shared team pocket. Drop them on empty squares instead of moving.(Not supported yet)',
            'chaturanga': 'Ancient chess. Queens move 1 square diagonally. Bishops jump exactly 2 squares diagonally. Pawns strictly promote to a Queen (Ferz). No castling. Stalemate or Bare King is a win.',            
            'crazyhouse': 'Captured enemy pieces change to your color and go into your pocket. Drop them on empty squares instead of moving.',
            'duck': 'A neutral duck blocks one square. After moving a piece, you MUST move the duck to a new empty square. No checks or checkmates; capture the enemy king to win.',
            'horde': 'Black has a standard army. White has 36 pawns. White wins by checkmating Black. Black wins by destroying all White pawns.',
            'kingofthehill': 'First player to move their king to one of the 4 center squares (d4, d5, e4, e5) wins.',
            'racingkings': 'First player to move their king to the 8th rank wins. Checks are completely illegal.',
            'placement': 'Start with an empty board. Players take turns placing their pieces on their half of the board. Once all pieces are placed, a standard game begins.',
            'alice': 'Played across two dimensions (Board A and B). Moving a piece transfers it to the opposite board. A move is only legal if the destination square on the opposite board is empty. Note: En Passant is disabled.',
            'spell': 'Cast a spell before making a move. Spells are limited, recharge after 3 full turns, and you cannot cast the same spell two moves in a row. Use the Jump spell on another piece to hop over it like it isn\'t there. Or use the Freeze spell to prevent pieces from moving or checking within a 3x3 area of effect. Be careful - any piece, including your own, will freeze if it enters the spell area. Use spells to find a checkmate or king capture!'        
        };

        const icons = {
            'classical': './assets/tabs-icon/setup_chess.svg',
            'chess960': './assets/tabs-icon/live_960_green.svg',
            '3check': './assets/tabs-icon/3check.svg',
            'antichess': './assets/tabs-icon/giveaway.svg',
            'atomic': './assets/tabs-icon/variant-atomic.svg',
            'bughouse': './assets/tabs-icon/bughouse.svg',
            'chaturanga': './assets/tabs-icon/chaturanga.svg',
            'crazyhouse': './assets/tabs-icon/crazyhouse.svg',
            'duck': './assets/tabs-icon/variant-duckchess.svg',
            'horde': './assets/tabs-icon/horde.svg',
            'kingofthehill': './assets/tabs-icon/koth.svg',
            'racingkings': './assets/tabs-icon/racing_kings.svg',
            'placement': './assets/tabs-icon/setup_chess.svg',
            'alice': '📖',
            'spell':'./assets/tabs-icon/variant-spell-chess.svg',
        };

        const ruleText = rules[mode] || rules['classical'];
        const formattedTitle = mode.charAt(0).toUpperCase() + mode.slice(1) + ' Rules';
        
        const iconSrc = icons[mode] || '📖';
        const iconHtml = iconSrc.endsWith('.svg') ? `<img src="${iconSrc}" style="width:40px; height:40px; vertical-align:middle; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">` : iconSrc;

        if (typeof this.showNotification === 'function') {
            this.showNotification(ruleText, formattedTitle, iconHtml);
        } else {
            alert(`${formattedTitle}\n\n${ruleText}`);
        }
    }
injectVariantRuleButtons() {
        const selectors = document.querySelectorAll('select');
        selectors.forEach(select => {
            if (select.id && select.id.toLowerCase().includes('variant')) {
                // Check if button already exists to prevent duplicates
                if (select.nextElementSibling && select.nextElementSibling.classList.contains('variant-rule-btn')) return;
                
                const btn = document.createElement('button');
                btn.innerText = '❓';
                btn.className = 'variant-rule-btn';
                btn.title = "Variant Rules";
                btn.style.cssText = "background:none; border:none; color:#38bdf8; cursor:pointer; font-size:16px; transition: 0.2s;";
                btn.onmouseover = () => btn.style.transform = "scale(1.2)";
                btn.onmouseout = () => btn.style.transform = "scale(1)";
                btn.onclick = () => this.showVariantRules(select.value);
                
                select.parentNode.insertBefore(btn, select.nextSibling);
                select.parentNode.style.display = 'flex';
                select.parentNode.style.alignItems = 'center';
            }
        });
    }
initThemeButtons() {
        // 1. Find all preset theme buttons in the HTML
        // (Add your specific class name here if it's different, e.g., '.theme-card')
        const themeButtons = document.querySelectorAll('.theme-btn, .preset-btn, .theme-box, .preset-theme, .theme-preset');
        
        if (themeButtons.length === 0) return;

        // 2. Restore the active border on page reload
        const activeThemeId = localStorage.getItem('chess_active_preset');
        if (activeThemeId) {
            themeButtons.forEach(btn => btn.classList.remove('active'));
            // Try to find the button by its ID or a data-theme attribute
            const activeBtn = document.getElementById(activeThemeId) || document.querySelector(`[data-theme="${activeThemeId}"]`);
            if (activeBtn) activeBtn.classList.add('active');
        }

        // 3. Listen for clicks to save the active button to memory
        themeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Remove .active from all buttons
                themeButtons.forEach(b => b.classList.remove('active'));
                
                // Add .active to the clicked button
                const clickedBtn = e.currentTarget;
                clickedBtn.classList.add('active');
                
                // Save its ID or data-theme so we remember it on the next refresh!
                const identifier = clickedBtn.id || clickedBtn.getAttribute('data-theme');
                if (identifier) {
                    localStorage.setItem('chess_active_preset', identifier);
                }
            });
        });
    }
toggleAnalysisPanel() {
        this.isAnalysisHidden = !this.isAnalysisHidden;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('chess_hide_analysis', this.isAnalysisHidden);
        }
        
        this.resizeApp();
        
        const btn = document.getElementById('toggleLeftPanelBtn');
        const img = document.getElementById('toggleLeftPanelImg');
        if (btn) {
            if (this.isAnalysisHidden) {
                btn.style.left = '-65px';
                btn.style.bottom = '30px';
                btn.style.borderColor = '#334155';
                if (img) img.style.filter = 'grayscale(100%) opacity(0.5)';
            } else {
                btn.style.left = '20px';
                btn.style.bottom = '20px';
                btn.style.borderColor = '#0284c7';
                if (img) img.style.filter = 'none';
            }
        }
    }
injectPanelToggle() {
        if (document.getElementById('toggleLeftPanelBtn')) return;

        const scaler = document.getElementById('app-scaler') || document.body;

        const btn = document.createElement('button');
        btn.id = 'toggleLeftPanelBtn';
        
        btn.innerHTML = `<img id="toggleLeftPanelImg" src="./assets/tabs-icon/rating-stats.svg" style="width: 28px; height: 28px; object-fit: contain; transition: filter 0.2s;">`; 
        btn.title = "Toggle Analysis & Stats Panel";
        const initialLeft = this.isAnalysisHidden ? '-65px' : '20px';
        const initialBottom = this.isAnalysisHidden ? '30px' : '20px';

        btn.style.cssText = `
            position: absolute; 
            bottom: ${initialBottom}; 
            left: ${initialLeft}; 
            z-index: 100; 
            background: rgba(30, 30, 30, 0.85); 
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border: 1px solid #334155; 
            border-radius: 12px; 
            width: 50px; 
            height: 50px; 
            cursor: pointer; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 4px 8px rgba(0,0,0,0.4);
        `;
        
        btn.onmouseenter = () => { 
            btn.style.background = 'rgba(45, 45, 45, 0.95)';
            btn.style.borderColor = '#38bdf8';
            btn.style.transform = 'translateY(-2px)';
            btn.style.boxShadow = '0 6px 16px rgba(0,0,0,0.6)';
            
            const img = document.getElementById('toggleLeftPanelImg');
            if (img) img.style.filter = 'drop-shadow(0px 0px 4px rgba(56, 189, 248, 0.8))'; 
        };
        
        btn.onmouseleave = () => { 
            btn.style.transform = 'translateY(0)';
            btn.style.boxShadow = '0 4px 8px rgba(0,0,0,0.4)';
            const img = document.getElementById('toggleLeftPanelImg');

            if (this.isAnalysisHidden) {
                btn.style.background = 'rgba(30, 30, 30, 0.85)';
                btn.style.borderColor = '#334155';
                if (img) img.style.filter = 'grayscale(100%) opacity(0.5)';
            } else {
                btn.style.background = 'rgba(30, 30, 30, 0.95)';
                btn.style.borderColor = '#0284c7';
                if (img) img.style.filter = 'none';
            }
        };

        btn.onclick = () => this.toggleAnalysisPanel();
        
        scaler.appendChild(btn);
        
        btn.onmouseleave();
    }
switchTab(tabName) {
        if (!tabName) return;
        if (typeof this.hideGameOver === 'function') this.hideGameOver();
        const lowerTab = tabName.toLowerCase();

        // A. Restore Flip View state immediately
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('chess_last_tab', lowerTab);
            const savedFlip = localStorage.getItem('chess_graph_flip');
            if (savedFlip && (savedFlip === 'b') !== this.flipped) {
                this.flipped = (savedFlip === 'b'); 
            }
        }

        // B. Capture the exact state BEFORE modifying variables to prevent PGN theft
        const leavingGraph = (this.#game && this.#game.mode === 'graph' && lowerTab !== 'graph');
        const graphSourceBeforeLeaving = this._previousTabBeforeGraph || 'study';

        // C. Track previous tab for Graph contextual return
        if (lowerTab !== 'graph') {
            this._previousTabBeforeGraph = lowerTab;
            if (typeof localStorage !== 'undefined') localStorage.setItem('chess_graph_source', lowerTab);
            
            if (!this._tabFlipStates) this._tabFlipStates = { play: false, analysis: false, study: false, editor: false, puzzle: false, trainer: false };
            const currentTabContext = (this.#game && (this.#game.mode === 'local' || this.#game.mode === 'bot' || this.#game.mode === 'play')) ? 'play' : (this.#game ? this.#game.mode : 'analysis');
            this._tabFlipStates[currentTabContext] = this.flipped;
        } else {
            if (!this._previousTabBeforeGraph) {
                this._previousTabBeforeGraph = (typeof localStorage !== 'undefined' ? localStorage.getItem('chess_graph_source') : null) || 'study';
            }
        }

        // D. Engine Memory Routing & Protection
        if (this.#game) {
            // Handle Editor safe exit
            if (this.#game.mode === 'editor' && lowerTab !== 'editor' && lowerTab !== 'graph') {
                const fenInput = document.getElementById('fenInput');
                const currentFen = fenInput ? fenInput.value : (typeof this.#game.generateFEN === 'function' ? this.#game.generateFEN() : "");
                if (!this.#validateEditorExit(currentFen)) return; 
            }
            if (lowerTab === 'editor') {
                this.originalEditorFen = typeof this.#game.generateFEN === 'function' ? this.#game.generateFEN() : (this.#game.currentNode ? this.#game.currentNode.fen : "");
                const pgnInput = document.getElementById('editorPgnInput');
                if (pgnInput) pgnInput.value = typeof this.#game.generatePGN === 'function' ? this.#game.generatePGN() : "";
            }

            if (leavingGraph) {
                if (graphSourceBeforeLeaving === 'analysis' && typeof this.#game.saveState === 'function') {
                    this.#game.saveState('analysis');
                } else if ((graphSourceBeforeLeaving === 'study' || graphSourceBeforeLeaving === 'trainer') && typeof this.#game.saveActiveChapter === 'function') {
                    this.#game.saveActiveChapter();
                }
            }

            if (lowerTab === 'graph') {
                const source = this._previousTabBeforeGraph || 'study';
                const currentFlip = this.flipped; // Activate Flip Shield

                // Load correct PGN into the engine
                if (source === 'study' || source === 'trainer') {
                    let savedChap = parseInt(localStorage.getItem('chess_active_chapter_idx'), 10);
                    if (isNaN(savedChap)) savedChap = this.#game.activeChapterIndex || 0;
                    if (typeof this.#game.loadChapter === 'function') this.#game.loadChapter(savedChap, true, true);
                } else {
                    if (typeof this.#game.restoreState === 'function') this.#game.restoreState(source);
                }

                // Restore flip state if loadChapter tampered with it
                if (this.flipped !== currentFlip) {
                    this.flipped = currentFlip;
                    if (typeof localStorage !== 'undefined') localStorage.setItem('chess_graph_flip', currentFlip ? 'b' : 'w');
                }

                // Lock mode to graph
                this.#game.mode = 'graph';
            } else {
                if (typeof this.#game.handleTabSwitch === 'function') this.#game.handleTabSwitch(lowerTab);
                else if (typeof this.#game.switchMode === 'function') this.#game.switchMode(lowerTab);
            }
        }

        // E. Orient the board correctly for standard tabs
        if (lowerTab !== 'graph') {
            const targetTabContext = (lowerTab === 'local' || lowerTab === 'bot' || lowerTab === 'play') ? 'play' : lowerTab;
            let wantFlipped = this.flipped;
            
            if (targetTabContext === 'trainer') {
                const colorSel = document.getElementById('trainerColorSelect');
                wantFlipped = colorSel ? (colorSel.value === 'b') : false;
            } else if (this._tabFlipStates[targetTabContext] !== undefined) {
                wantFlipped = this._tabFlipStates[targetTabContext];
            }
            if (this.flipped !== wantFlipped) this.flipBoard(); 
        }

        // F. Apply Visuals and Headers
        const state = this.#game ? this.#game.getReader() : { mode: lowerTab, isLive: false };
        this.#applyTabVisuals(state.mode, lowerTab);

        if (state.headers) {
            this.displayMetadata(state.headers);
            const wLabel = (state.headers['White'] || 'White') + (state.headers['WhiteElo'] ? ` (${state.headers['WhiteElo']})` : '');
            const bLabel = (state.headers['Black'] || 'Black') + (state.headers['BlackElo'] ? ` (${state.headers['BlackElo']})` : '');
            
            if (this.updatePgnAvatars) this.updatePgnAvatars(state.headers['White'], state.headers['Black'], this.#game ? this.#game.isEngineMatch : false, true);
            if (this.updatePlayerNames) {
                if (this.flipped) this.updatePlayerNames(wLabel, bLabel);
                else this.updatePlayerNames(bLabel, wLabel);
            }
            this.renderHeaders();
            if (this.updateClocks) this.updateClocks();
            if (state.mode === 'analysis' && this.toggleReviewButton) this.toggleReviewButton(true);
        }

        // G. Trigger final rendering
        if (this.#game) {
            if (lowerTab === 'graph') {
                if (typeof this.renderFullGraph === 'function') requestAnimationFrame(() => this.renderFullGraph());
            } else {
                this.updateHistory(true);
                this.renderBoard(false);

                if (state.mode !== 'play' && window.engineAnalysing) {
                    if (this.#game.updateStockfish) this.#game.updateStockfish();
                }

                if (state.mode === 'analysis' || state.mode === 'study') {
                    const engineLinesBox = document.getElementById('engine-lines-box');
                    if (engineLinesBox) engineLinesBox.innerHTML = '';
                    if (this.renderCharts) {
                        this._lastChartedFen = null;
                        requestAnimationFrame(() => this.renderCharts(true));
                    }
                }
            }
        }

        setTimeout(() => {
            if (this.resizeApp) this.resizeApp();
            if (this.safeResizeCharts) this.safeResizeCharts();
        }, 10);
    }
async loadCustomPieces() {
        if (!window.showDirectoryPicker) {
            this.showNotification("Your browser does not support folder access. Please use Chrome, Edge, or Opera.", "Not Supported", "⚠️");
            return;
        }

        try {
            const dirHandle = await window.showDirectoryPicker();
            const inputPath = document.getElementById('assetFolder');
            if (inputPath) inputPath.value = dirHandle.name;

            this.customPieces = {};
            let count = 0;

            for await (const entry of dirHandle.values()) {
                if (entry.kind === 'file') {
                    const file = await entry.getFile();
                    const name = file.name;
                    const lower = name.toLowerCase();

                    let color = null;
                    let type = null;

                    const shortMatch = lower.match(/^([wb])([pnbrqk])\./);

                    if (shortMatch) {
                        color = shortMatch[1];
                        type = shortMatch[2].toUpperCase();
                    } else {
                        if (lower.includes('white') || lower.includes('light') || lower.startsWith('w')) color = 'w';
                        if (lower.includes('black') || lower.includes('dark') || lower.startsWith('b')) color = 'b';
                        if (lower.includes('pawn') || lower.includes('_p') || lower.includes('p.')) type = 'P';
                        else if (lower.includes('knight') || lower.includes('_n') || lower.includes('n.')) type = 'N';
                        else if (lower.includes('bishop') || lower.includes('_b') || lower.includes('b.')) type = 'B';
                        else if (lower.includes('rook') || lower.includes('_r') || lower.includes('r.')) type = 'R';
                        else if (lower.includes('queen') || lower.includes('_q') || lower.includes('q.')) type = 'Q';
                        else if (lower.includes('king') || lower.includes('_k') || lower.includes('k.')) type = 'K';
                    }

                    if (color && type) {
                        const key = color + type;
                        this.customPieces[key] = URL.createObjectURL(file);
                        count++;
                    }
                }
            }

            if (count > 0) {
                this.pieceTheme = 'custom';
                const pieces = document.querySelectorAll('.piece-img');
                pieces.forEach(p => p.src = "");

                this.renderBoard(false);
                this.showNotification(`Loaded ${count} pieces from "${dirHandle.name}"!\n(Theme set to 'custom')`, "Success", "✅");
            } else {
                this.showNotification("No recognizable chess pieces found.\nPlease name them: bN.webp, wP.svg, etc.", "Invalid Folder", "❌");
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                this.showNotification("Error accessing folder. Check console.", "Error", "❌");
            }
        }
    }
saveUISettings() {
        const ids = ['premoveMode', 'moveMethod', 'pgnStyle', 'pgnFormatSelect', 'assetType', 'assetExt', 'soundSetSelect', 'coordPosition', 'autoQueen', 'pgnIgnoreMove', 'enableAnimations', 'engineDepth', 'wTimeH', 'wTimeM', 'wTimeS', 'wInc', 'bTimeH', 'bTimeM', 'bTimeS', 'bInc', 'assetEngineFolder'];
        const settings = {};
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (el.type === 'checkbox') settings[id] = el.checked;
                else settings[id] = el.value;
            }
        });
        try { localStorage.setItem('chess_ui_settings_v1', JSON.stringify(settings)); } catch(e) {}
    }
loadUISettings() {
        try {
            const stored = localStorage.getItem('chess_ui_settings_v1');
            if (!stored) return;
            const settings = JSON.parse(stored);
            Object.keys(settings).forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    if (el.type === 'checkbox') el.checked = settings[id];
                    else el.value = settings[id];
                }
            });
            if (settings.moveMethod) this.moveInputMode = settings.moveMethod;
            if (settings.pgnStyle) this.pgnStyle = settings.pgnStyle;
            if (settings.assetType) this.pieceTheme = settings.assetType;
            if (settings.enableAnimations !== undefined) this.animationsEnabled = settings.enableAnimations;
            if (settings.coordPosition) this.coordsPosition = settings.coordPosition;
            if (this.#game) {
                if (settings.premoveMode && typeof this.#game.setPremoveMode === 'function') {
                    this.#game.setPremoveMode(settings.premoveMode);
                }
                if (typeof this.#game.updateSettingsTime === 'function') {
                    this.#game.updateSettingsTime();
                }
            }
        } catch(e) { console.error("Lỗi nạp Settings:", e); }
    }
async fetchPlayerStats() {
        const username = document.getElementById('statUsername')?.value.trim();
        const platform = document.getElementById('statPlatform')?.value;
        const timeControl = document.getElementById('statTimeControl')?.value;
        const resultDiv = document.getElementById('statResult');

        if (!resultDiv) return;
        if (!username) {
            resultDiv.innerHTML = `<span style="color:#fa412d">Please enter a username.</span>`;
            return;
        }
        resultDiv.style.overflowY = 'auto';
        resultDiv.style.maxHeight = '350px'; 
        resultDiv.style.paddingRight = '5px';

        resultDiv.innerHTML = `<div style="color:#38bdf8; text-align:center; padding:20px;">Fetching ${timeControl} games... ⏳<br><small>(This may take a few seconds to fetch 200 games)</small></div>`;

        try {
            let games = [];

            if (platform === 'lichess') {
                const res = await fetch(`https://lichess.org/api/games/user/${username}?max=200&perfType=${timeControl}`);
                if (!res.ok) throw new Error("User not found or API limited.");
                const pgnData = await res.text();
                games = pgnData.split('\n\n\n').filter(g => g.trim().length > 0);
            } else {
                const date = new Date();
                let year = date.getFullYear();
                let month = date.getMonth() + 1;

                let chessComTimeClass = timeControl;
                if (timeControl === 'classical') chessComTimeClass = 'daily';
                for (let i = 0; i < 4; i++) {
                    const monthStr = String(month).padStart(2, '0');
                    try {
                        const archiveRes = await fetch(`https://api.chess.com/pub/player/${username}/games/${year}/${monthStr}`);
                        if (archiveRes.ok) {
                            const archiveData = await archiveRes.json();
                            const monthGames = archiveData.games
                                .filter(g => g.time_class === chessComTimeClass)
                                .map(g => g.pgn)
                                .filter(pgn => pgn);
                            // Prepend older games so the newest ones remain at the end of the array
                            games = monthGames.concat(games);
                        }
                    } catch(e) {}
                    
                    if (games.length >= 200) break;
                    
                    month--;
                    if (month === 0) { 
                        month = 12; 
                        year--; 
                    }
                }

                if (games.length > 200) games = games.slice(-200);
            }

            if (games.length === 0) {
                resultDiv.innerHTML = `<span style="color:#f7c045">Not enough recent ${timeControl} games found to generate insights.</span>`;
                return;
            }

            let stats = {
                total: games.length, wins: 0, losses: 0, draws: 0,
                whiteWins: 0, whiteTotal: 0, blackWins: 0, blackTotal: 0,
                openings: {}, endgamesReached: 0, timeLosses: 0, blundersInferred: 0
            };

            const un = username.toLowerCase();

            games.forEach(pgn => {
                if (!pgn) return;

                const whiteMatch = pgn.match(/\[White\s+"([^"]+)"\]/i);
                const blackMatch = pgn.match(/\[Black\s+"([^"]+)"\]/i);
                const resultMatch = pgn.match(/\[Result\s+"([^"]+)"\]/i);
                const ecoMatch = pgn.match(/\[ECOUrl\s+".*?\/([^"]+)"\]/i) || pgn.match(/\[ECO\s+"([^"]+)"\]/i) || pgn.match(/\[Opening\s+"([^"]+)"\]/i);
                const termMatch = pgn.match(/\[Termination\s+"([^"]+)"\]/i);

                const isWhite = whiteMatch && whiteMatch[1].toLowerCase() === un;
                const isBlack = blackMatch && blackMatch[1].toLowerCase() === un;
                const result = resultMatch ? resultMatch[1] : '*';

                const moves = pgn.split(/\d+\./).length - 1;
                if (moves > 40) stats.endgamesReached++;

                let isWin = (isWhite && result === '1-0') || (isBlack && result === '0-1');
                let isLoss = (isWhite && result === '0-1') || (isBlack && result === '1-0');
                let isDraw = result === '1/2-1/2';

                if (isWin) stats.wins++;
                if (isLoss) stats.losses++;
                if (isDraw) stats.draws++;

                if (isWhite) { stats.whiteTotal++; if (isWin) stats.whiteWins++; }
                if (isBlack) { stats.blackTotal++; if (isWin) stats.blackWins++; }

                if (ecoMatch && ecoMatch[1]) {
                    const openingName = ecoMatch[1].replace(/-/g, ' ');
                    if (!stats.openings[openingName]) stats.openings[openingName] = { played: 0, wins: 0 };
                    stats.openings[openingName].played++;
                    if (isWin) stats.openings[openingName].wins++;
                }

                if (isLoss && termMatch && termMatch[1].toLowerCase().includes('time')) stats.timeLosses++;
                if (isLoss && moves < 20 && termMatch && termMatch[1].toLowerCase().includes('resigned')) stats.blundersInferred++;
            });

            const winRate = Math.round((stats.wins / stats.total) * 100);
            const wWinRate = stats.whiteTotal > 0 ? Math.round((stats.whiteWins / stats.whiteTotal) * 100) : 0;
            const bWinRate = stats.blackTotal > 0 ? Math.round((stats.blackWins / stats.blackTotal) * 100) : 0;
            const endgameRate = Math.round((stats.endgamesReached / stats.total) * 100);

            const topOpenings = Object.entries(stats.openings)
                .sort((a, b) => b[1].played - a[1].played).slice(0, 3);

            let suggestions = "";
            if (stats.timeLosses > stats.losses * 0.3) suggestions += `<li>⏱️ <b>Time Management:</b> You lost ${stats.timeLosses} games on time.</li>`;
            if (wWinRate < 45) suggestions += `<li>⚪ <b>White Repertoire:</b> Your win rate with White is only ${wWinRate}%. Review your primary opening lines.</li>`;
            if (stats.blundersInferred >= 3) suggestions += `<li>💥 <b>Tactical Vision:</b> You resigned early in ${stats.blundersInferred} games. Focus on puzzle training.</li>`;
            if (suggestions === "") suggestions = `<li>🔥 Keep up the momentum! Your recent play is solid.</li>`;

            resultDiv.innerHTML = `
                <div style="background:#1e1e1e; padding:15px; border-radius:8px; border:1px solid #333;">
                    <h3 style="color:#96bc4b; margin-top:0; border-bottom:1px solid #333; padding-bottom:10px;">Insights: Last ${stats.total} Games</h3>
                    <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                        <div style="text-align:center;"><div style="font-size:24px; color:${winRate >= 50 ? '#26c2a3' : '#fa412d'}; font-weight:bold;">${winRate}%</div><div style="font-size:12px; color:#888;">Win Rate</div></div>
                        <div style="text-align:center;"><div style="font-size:20px; color:#fff;">${wWinRate}%</div><div style="font-size:12px; color:#888;">White Wins</div></div>
                        <div style="text-align:center;"><div style="font-size:20px; color:#fff;">${bWinRate}%</div><div style="font-size:12px; color:#888;">Black Wins</div></div>
                    </div>
                    <div style="margin-bottom:15px; background:#2a2a2a; padding:10px; border-radius:5px;">
                        <div style="color:#38bdf8; font-weight:bold; margin-bottom:8px;">Top Openings</div>
                        ${topOpenings.map(([name, data]) => `<div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;"><span style="color:#ccc;">${name.substring(0, 20)}...</span><span>${data.played} played (<span style="color:#96bc4b">${Math.round((data.wins/data.played)*100)}% win</span>)</span></div>`).join('')}
                    </div>
                    <div style="background:#2a2a2a; border-left:4px solid #f7c045; padding:10px; border-radius:3px;">
                        <div style="color:#f7c045; font-weight:bold; margin-bottom:5px;">Actionable Advice</div>
                        <ul style="margin:0; padding-left:20px; font-size:13px; color:#ccc;">${suggestions}</ul>
                    </div>
                </div>`;
        } catch (e) {
            resultDiv.innerHTML = `<span style="color:#fa412d">Error: ${e.message}</span>`;
        }
    }
resizeApp() {
        const scaler = document.getElementById('app-scaler');
        if (!scaler) return;

        const mainLayout = document.querySelector('.main-layout');
        const mainContainer = document.querySelector('.main-container');
        const boardSection = document.querySelector('.board-section');
        
        const analysisPanel = document.getElementById('analysisPanel');
        const studySidebar = document.getElementById('study-sidebar'); 
        const bottomPanel = document.getElementById('studyBottomPanel'); 
        const mainSidebar = document.getElementById('mainSidebar'); 
        const pocketContainer = document.getElementById('pocket-container');

        const game = this.#game;
        const isAnalysis = game ? game.mode === 'analysis' : false;
        const isStudy = game ? game.mode === 'study' : false;
        const showAnalysis = isAnalysis && !this.isAnalysisHidden;
        const isWideMode = isAnalysis || isStudy;
        
        let isDuckMode = false;
        let isPocketMode = false;
        try {
            if (game) {
                let state = typeof game.getReader === 'function' ? game.getReader() : null;
                let gMode = state ? state.gameMode : game.gameMode;
                if (gMode === 'duck') isDuckMode = true;
                if (gMode === 'crazyhouse' || gMode === 'bughouse' || gMode === 'placement') {
                    const topPocket = document.getElementById('top-pocket');
                    const botPocket = document.getElementById('bottom-pocket');
                    const hasPieces = (topPocket && topPocket.children.length > 0) || (botPocket && botPocket.children.length > 0);
                    if (hasPieces) isPocketMode = true; 
                }
            }
        } catch(err) {
            console.warn("Caught early read error in resizeApp:", err);
        }

        if (isWideMode) {
            if (mainLayout) mainLayout.style.justifyContent = 'flex-start';
            if (mainContainer) mainContainer.style.justifyContent = 'flex-start';
        } else {
            if (mainLayout) mainLayout.style.justifyContent = 'center';
            if (mainContainer) mainContainer.style.justifyContent = 'center';
        }

        const boardRow = document.querySelector('.board-row');
        const enginePanel = document.getElementById('enginePanel');
        const boardContainerRow = document.querySelector('.board-container-row');
        
        if (isPocketMode) {
            if (pocketContainer) pocketContainer.style.display = 'flex';
            if (boardRow) boardRow.style.cssText = 'display: flex; flex-shrink: 0; gap: 0px;';
            if (mainSidebar) mainSidebar.style.setProperty('margin-left', '60px', 'important');
            if (boardContainerRow) boardContainerRow.style.setProperty('gap', '80px', 'important');
        } else {
            if (pocketContainer) pocketContainer.style.display = 'none';
            if (boardRow) boardRow.style.cssText = 'display: flex; flex-shrink: 0; gap: 40px;';
            if (enginePanel) enginePanel.style.setProperty('margin-left', '0px', 'important');
            if (mainSidebar) mainSidebar.style.setProperty('margin-left', '20px', 'important');
            if (boardContainerRow) boardContainerRow.style.setProperty('gap', '8px', 'important');
        }

        [mainSidebar, studySidebar, analysisPanel].forEach(el => {
            if (el) {
                el.style.height = '0px';
                el.style.minHeight = '0px';
                el.style.maxHeight = '0px';
                el.style.overflow = 'hidden'; 
            }
        });
        if (bottomPanel) bottomPanel.style.display = 'none';

        if (boardSection) {
            boardSection.style.marginTop = '0px';
            boardSection.style.marginBottom = '0px';
            boardSection.style.marginLeft = '400px';
        }

        void document.body.offsetHeight;

        const boardSecHeight = boardSection ? boardSection.offsetHeight : 600;
        const safeSidebarHeight = Math.max(300, boardSecHeight); 
        let targetHeight = safeSidebarHeight + 50; 

        [mainSidebar, studySidebar, analysisPanel].forEach(el => {
            if (el) {
                el.style.height = safeSidebarHeight + 'px';
                el.style.maxHeight = safeSidebarHeight + 'px';
                el.style.minHeight = '0px';
                
                if (el.id === 'analysisPanel' || el.id === 'study-sidebar') {
                    el.style.overflowY = 'auto';
                    el.style.overflowX = 'hidden';
                } else {
                    el.style.overflow = '';
                }
                
                if (el.id === 'analysisPanel') {
                    el.style.display = showAnalysis ? 'flex' : 'none';
                } else if (el.id === 'study-sidebar') {
                    el.style.display = isStudy ? 'flex' : 'none';
                } else {
                    el.style.display = 'flex';
                }
                
                el.style.flexDirection = 'column';
            }
        });

        document.querySelectorAll('.tabs-content, .tab-pane').forEach(el => {
            if (el) {
                el.style.display = 'flex';
                el.style.flexDirection = 'column';
                el.style.minHeight = '0'; 
            }
        });

        ['moveHistory', 'studyPgnContainer'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.flex = '1 1 0%';
                el.style.minHeight = '0';
                el.style.overflowY = 'auto';
            }
        });

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
        
        if (isDuckMode) {
            targetWidth += 40;
            if (boardSection) boardSection.style.marginLeft = '40px';
        } else {
            if (boardSection) boardSection.style.marginLeft = '0px';
        }

        let evalW = 0;
        if (enginePanel && enginePanel.style.display !== 'none') {
            let dynamicSpacing = isPocketMode ? 80 : 8; 
            evalW = getW(enginePanel) > 0 ? getW(enginePanel) + dynamicSpacing : (30 + dynamicSpacing); 
            targetWidth += evalW;
        }
        
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
                
                const safePocketW = isPocketMode ? getW(document.getElementById('pocket-container')) : 0;
                const safeEvalW = getW(document.getElementById('enginePanel'));
                
                let exactWidth = lW + boardW + pW + safePocketW + safeEvalW;
                
                if (lW > 0) exactWidth += 40; 
                if (pW > 0) exactWidth += 40; 
                if (isPocketMode) exactWidth += 80; 
                
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
        document.documentElement.style.setProperty('--app-scale', scale);
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
    
        const logicalWidth = availableWidth / scale;
        const logicalHeight = availableHeight / scale;
        const logicalLeft = -offsetX / scale;
        const logicalTop = -offsetY / scale;
        let totalLogicalHeight = isStudy ? (targetHeight + 500 + 50) : targetHeight;
        totalLogicalHeight = Math.max(totalLogicalHeight, logicalHeight);
        let totalLogicalWidth = isStudy ? (targetWidth + 300 + 50) : targetWidth;
        totalLogicalWidth = Math.max(totalLogicalWidth, logicalWidth);
        
        const fullScreenModals = [
            'botMenuModal', 'continueSetupModal', 'gameOverModal', 
            'notificationModal', 'chapterModal', 'quickImportModal', 
            'chapterManagerModal', 'studyManagerModal', 'customConfirmModal', 
            'crop-modal', 'scannerModal','exportEmbededModal', 'embedImporterModal'
        ];

        fullScreenModals.forEach(id => {
            const popup = document.getElementById(id);
            if (popup) {
                if (popup.parentNode !== document.body) document.body.appendChild(popup);
                popup.style.position = 'fixed';
                popup.style.width = '100vw';
                popup.style.height = '100vh';
                popup.style.left = '0';
                popup.style.top = '0';
                popup.style.margin = '0';
                popup.style.transform = 'none';
                popup.style.zIndex = '999999'; 
                
                const modalBox = popup.querySelector('.scale-wrapper') || popup.querySelector('.modal-content') || popup.firstElementChild;
                if (modalBox) {
                    if (id === 'notificationModal'||id==='gameOverModal') {
                        modalBox.style.setProperty('width', '280px', 'important');
                    } else {
                        modalBox.style.setProperty('width', '480px', 'important');
                    }
                    modalBox.style.setProperty('transform', `scale(${scale})`, 'important');
                    modalBox.style.transformOrigin = 'center center';
                }
            }
        });

        const sideMenu = document.getElementById('sideMenuPanel');
        if (sideMenu) {
            sideMenu.style.position = 'absolute';
            sideMenu.style.height = (totalLogicalHeight + Math.abs(logicalTop) +100)+ 'px'; 
            sideMenu.style.top = logicalTop + 'px';
            sideMenu.style.marginLeft = logicalLeft + 'px'; 
            sideMenu.style.transform = 'none';
        }
        
        const sideMenuOverlay = document.getElementById('sideMenuOverlay');
        if (sideMenuOverlay) {
            sideMenuOverlay.style.position = 'absolute';
            sideMenuOverlay.style.width = (totalLogicalWidth + Math.abs(logicalLeft)) + 'px';
            sideMenuOverlay.style.height = (totalLogicalHeight + Math.abs(logicalTop)+100) + 'px';
            sideMenuOverlay.style.left = logicalLeft + 'px';
            sideMenuOverlay.style.top = logicalTop + 'px';
            sideMenuOverlay.style.transform = 'none';
            sideMenuOverlay.style.zIndex = '999';
        }

        const menuBtn = document.querySelector('button[onclick*="toggleSideMenu"]');
        if (menuBtn) {
            menuBtn.style.position = 'absolute';
            menuBtn.style.left = (logicalLeft + 15) + 'px';
            menuBtn.style.top = (logicalTop + 15) + 'px';
            menuBtn.style.transform = 'none';
        }

        ['settingsPanel', 'annotationPopup', 'previewPopup'].forEach(id => {
            const popup = document.getElementById(id);
            if (popup) {
                if (popup.parentNode === scaler) document.body.appendChild(popup);
                popup.style.position = 'fixed'; 
                popup.style.zIndex = '999';
            }
        });

        let duckBank = document.getElementById('duckBank');
        if (duckBank) {
            duckBank.style.transition = 'all 0.3s ease';
            duckBank.style.position = 'absolute';
            duckBank.style.left = '-85px'; 
            duckBank.style.right = 'auto';
            duckBank.style.top = '50%'; 
            duckBank.style.transform = 'translateY(-50%)';
            duckBank.style.backgroundColor = 'rgba(0,0,0,0.4)';
            duckBank.style.zIndex = '999';
        }
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
        selector.innerHTML = '';
        for (let key in PIECE_SETS) {
            let opt = document.createElement('option');
            opt.value = key;
            opt.innerText = PIECE_SETS[key].name;
            selector.appendChild(opt);
        }
        let localOpt = document.createElement('option');
        localOpt.value = 'local';
        localOpt.innerText = 'Local Folder';
        selector.appendChild(localOpt);
    }
toggleHideNextMoves(forceState = null) {
        if (forceState !== null) {
            this.hideNextMoves = forceState;
        } else {
            this.hideNextMoves = !this.hideNextMoves;
        }
        
        const btns = document.querySelectorAll('.hide-moves-btn');
        btns.forEach(btn => {
            btn.innerText = this.hideNextMoves ? '🙈' : '👁️';
            btn.title = this.hideNextMoves ? 'Show Next Moves' : 'Hide Next Moves';
            btn.style.filter = this.hideNextMoves ? 'none' : 'grayscale(100%)';
        });
        
        this.applyHideNextMoves();

        if (!this._hideMovesObserver) {
            const pgnBox = document.getElementById('moveHistory');
            if (pgnBox) {
                this._hideMovesObserver = new MutationObserver(() => {
                    if (this.hideNextMoves) {
                        this._hideMovesObserver.disconnect();
                        this.applyHideNextMoves();
                        this._hideMovesObserver.observe(pgnBox, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
                    }
                });
                this._hideMovesObserver.observe(pgnBox, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
            }
        }
    }
applyHideNextMoves() {
        const pgnBox = document.getElementById('moveHistory');
        if (!pgnBox) return;
        const activePathIds = new Set();
        if (this.#game) {
            let curr = this.#game.currentNode;
            while (curr) {
                if (curr.id) activePathIds.add(curr.id);
                curr = curr.parent;
            }
        }

        const allMoves = pgnBox.querySelectorAll('.move-ply, .tree-move, .var-move');
        const activeMove = pgnBox.querySelector('.active');
        
        let isAtStart = (this.#game && this.#game.currentNode === this.#game.rootNode);
        let passedActive = isAtStart;

        allMoves.forEach(moveEl => {
            let isVisible = true;

            // Attempt to read the Engine Node ID from the DOM element
            let nodeId = moveEl.dataset.id || moveEl.id;
            if (!nodeId && moveEl.getAttribute('onclick')) {
                const match = moveEl.getAttribute('onclick').match(/['"](p-\d+)['"]/);
                if (match) nodeId = match[1];
            }

            // STRATEGY A (Tree Math): If we found an ID, check if it belongs to our exact active variation
            if (nodeId) {
                isVisible = activePathIds.has(nodeId);
            } 
            // STRATEGY B (Linear Math): Fallback just in case the UI couldn't find the Node ID
            else {
                if (moveEl === activeMove) {
                    passedActive = true;
                    isVisible = true; 
                } else {
                    isVisible = !passedActive;
                }
            }

            // Apply the visual styles
            if (!isVisible && this.hideNextMoves) {
                moveEl.style.filter = 'blur(4px)';
                moveEl.style.opacity = '0.3';
                moveEl.style.pointerEvents = 'none';
                moveEl.style.userSelect = 'none';
            } else {
                moveEl.style.filter = '';
                moveEl.style.opacity = '1';
                moveEl.style.pointerEvents = 'auto';
                moveEl.style.userSelect = 'auto';
            }
        });
    }
toggleAnimations() {
        const checkbox = document.getElementById('enableAnimations');
        const enabled = checkbox ? checkbox.checked : true;
        this.animationsEnabled = enabled;
        if (enabled) document.body.classList.remove('no-animations');
        else document.body.classList.add('no-animations');
    }
toggleEngine(forceOff = false) {
        const isLiveGame = this.#game && this.#game.isPlayingLiveGame;
        const isUnfinishedPuzzle = this.#game && 
                                   this.#game.mode === 'puzzle' && 
                                   !this.#game.gameOver && 
                                   !this.#game.puzzleSolved;

        if (forceOff) {
            window.engineAnalysing = false;
        } else if (isLiveGame) {
            if (typeof this.showNotification === 'function') this.showNotification("Engine assistance is disabled during active play.", "Action Restricted", "🚫");
            window.engineAnalysing = false;
        } else if (isUnfinishedPuzzle) { 
            if (typeof this.showNotification === 'function') this.showNotification("Solve the puzzle first!", "Action Restricted", "❌");
            window.engineAnalysing = false;
        } else {
            window.engineAnalysing = !window.engineAnalysing;
        }
        
        const btn = document.querySelector('.engine-toggle-btn');
        const panel = document.getElementById('enginePanel');
        const stats = document.getElementById('engine-stats-container');

        if (window.engineAnalysing) {
            if (btn) btn.classList.add('active');
            if (panel) { panel.classList.add('visible'); panel.style.display = ''; }
            if (stats) { stats.classList.add('visible'); stats.style.display = ''; }
        } else {
            if (btn) btn.classList.remove('active');
            if (panel) { panel.classList.remove('visible'); panel.style.display = 'none'; }
            if (stats) { stats.classList.remove('visible'); stats.style.display = 'none'; }
        }

        if (this.#game && typeof this.#game.updateStockfish === 'function') {
            this.#game.updateStockfish();
        }
        const popup = document.getElementById('previewPopup');
        if (popup) {
            popup.style.display = 'none';
        }
    }
updateEngineName(fullName, shortName = null) {
        if (!fullName) return;
        if (fullName === "Engine Loading...") {
            shortName = fullName;
        }  else if (!shortName) {
            const match = fullName.match(/^([a-zA-Z-]+(?:\s+\d+(?:\.\d+)?)?)/);
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
            if (e.code === 'Space' && this.blindfoldMode && !this.isPeeking) {
                this.isPeeking = true;
                this.renderBoard(false);
            }
        });
        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space' && this.blindfoldMode && this.isPeeking) {
                this.isPeeking = false;
                this.renderBoard(false);
            }
        });
    }
setAvatar(pos, input) {
        if (input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const imgHTML = `<img src="${e.target.result}" style="width:100%; height:100%; object-fit:cover; border-radius:4px;">`;
                let color = 'w';
                if (pos === 'top') color = this.flipped ? 'w' : 'b';
                else color = this.flipped ? 'b' : 'w';
                this.avatars[color] = imgHTML;
                
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
        const localUrl = `./assets/flags/${lowerCode}.svg`;
        return `<img src="${localUrl}" class="player-flag" alt="${code}" onerror="this.style.display='none'">`;
    }
displayMetadata(headers) {
        const container = document.getElementById('gameInfo'); 
        if (!container) return;
        
        if (this.playerInfo) {
            if (this.playerInfo['w']) this.playerInfo['w'].title = headers['WhiteTitle'] || null;
            if (this.playerInfo['b']) this.playerInfo['b'].title = headers['BlackTitle'] || null;
        }
        
        const cacheKey = JSON.stringify(headers || {});
        if (this._lastMetadataCache === cacheKey) return;
        this._lastMetadataCache = cacheKey;

        let html = '<div style="display:grid; grid-template-columns: 1fr 1fr; gap: 5px 20px; max-height: 200px; overflow-y: auto; font-size:0.85rem; color:#94a3b8; padding:12px; background:rgba(0,0,0,0.2); border-radius:6px; margin-bottom:10px; border:1px solid #333;">';
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
            if (['White','Black','WhiteElo','BlackElo','SetUp', 'WhiteTitle', 'BlackTitle'].includes(key)) return;
            
            let value = headers[key] ? headers[key].toString().trim() : "";
            if (!value) return; 
            
            const rawValue = value; 
            if (value.toLowerCase().startsWith('http') || value.toLowerCase().startsWith('www')) {
                const url = value.toLowerCase().startsWith('www') ? 'https://' + value : value;
                value = `<a href="${url}" target="_blank" style="color:#38bdf8; text-decoration:underline; cursor:pointer;">${value}</a>`;
            }

            if (key === 'FEN') {
                html += `<div style="grid-column: 1 / -1; word-break: break-all; line-height: 1.4;" title="${rawValue}"><span style="font-weight:600; color:#2872b5; margin-right:4px;">${key}:</span>${value}</div>`;
            } else {
                html += `<div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; line-height:1.4;" title="${rawValue}"><span style="font-weight:600; color:#2872b5; margin-right:4px;">${key}:</span>${value}</div>`;
            }
        });
        
        html += '</div>';
        container.innerHTML = html;

        const fenInput = document.getElementById('fenInput');
        if (fenInput && headers['FEN']) fenInput.value = headers['FEN'];
    }
renderHeaders() {
        if (this.#game && this.#game.mode === 'editor') return;

        const container = document.getElementById('gameInfo'); 
        if (!container) return;
        
        const nameLabels = document.querySelectorAll('.player-name');
        const metaLabels = document.querySelectorAll('.player-meta');
        
        if (nameLabels.length < 2 || metaLabels.length < 2) return;

        const topColor = this.flipped ? 'w' : 'b';
        const botColor = this.flipped ? 'b' : 'w';
        
        const topData = this.playerInfo[topColor] || {};
        const botData = this.playerInfo[botColor] || {};

        const state = this.#game ? this.#game.getReader() : null;
        const engineUses = (this.#game && this.#game.engine && typeof this.#game.engine.spell_uses === 'function') 
            ? this.#game.engine.spell_uses() 
            : { w: { freeze: 5, jump: 2 }, b: { freeze: 5, jump: 2 } };
        const cacheKey = JSON.stringify({ 
            topData, botData, flipped: this.flipped, avatars: this.avatars,
            activeSpell: this.activeSpell, 
            mana: state ? state.mana : null,
            spellUses: engineUses, 
            gameMode: state ? state.gameMode : null
        });
        
        if (this._lastHeadersCache === cacheKey) return;
        this._lastHeadersCache = cacheKey;

        const updateSlot = (index, data, color) => {
            const rawName = data.name || (color === 'w' ? "White" : "Black");
            let nameTxt = rawName.replace(/\s?\(.*?\)/, '').trim();
            let activeTitle = data.title;
            const titleRegex = /^(GM|IM|FM|CM|WGM|WIM|WFM|WCM|NM)\s+/i;
            
            if (!activeTitle && nameTxt.match(titleRegex)) {
                activeTitle = nameTxt.match(titleRegex)[1].toUpperCase();
                nameTxt = nameTxt.replace(titleRegex, '').trim();
            }

            let flagHtml = (typeof this.getCountryFlagHtml === 'function') ? this.getCountryFlagHtml(data.country) : '';
            if (flagHtml && data.country) {
                // ĐÃ SỬA: Đọc bảng băm toàn cục tĩnh
                const fullName = ISO_TO_COUNTRY_NAME[data.country.toLowerCase()] || data.country.toUpperCase();
                flagHtml = `<span title="${fullName}" style="cursor: help; display: flex; align-items: center;">${flagHtml}</span>`;
            }
            
            const titleHtml = activeTitle ? `<span style="background-color: #b33430; color: #fff; font-size: 10px; font-weight: 800; padding: 2px 4px; border-radius: 3px; display: inline-block; line-height: 1.1;">${activeTitle}</span>` : '';
                
            nameLabels[index].innerHTML = flagHtml + titleHtml + `<span style="text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">${nameTxt}</span>`;
            nameLabels[index].style.display = 'flex';
            nameLabels[index].style.alignItems = 'center';
            nameLabels[index].style.gap = '6px'; 
            
            let eloTxt = "";
            const match = rawName.match(/\((.*?)\)/);
            if (match) eloTxt = match[1];
            
            let metaTxt = data.meta || (color === 'w' ? "White" : "Black");
            if (metaTxt.toLowerCase() === 'human') metaTxt = ''; 
            if (eloTxt) metaTxt = metaTxt ? `${metaTxt} • ${eloTxt}` : eloTxt;
            
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
                if (clock) clock.id = (color === 'w') ? 'timer-white' : 'timer-black';
            }
        };

        updateSlot(0, topData, topColor); 
        updateSlot(1, botData, botColor);
        if (typeof this.updateClocks === 'function') this.updateClocks();

        const spellsTop = document.getElementById('spells-top');
        const spellsBottom = document.getElementById('spells-bottom');

        if (state && state.gameMode === 'spell') {
            if (spellsTop) spellsTop.style.display = 'flex';
            if (spellsBottom) spellsBottom.style.display = 'flex';
            
            if (state.mana) {
              const updateIcon = (spellType, colorClass, isTop) => {
            const prefix = isTop ? 'top' : 'bottom';
            const iconEl = document.getElementById(`spell-${prefix}-${spellType}`);
            const countEl = document.getElementById(`spell-${prefix}-${spellType}-count`);
            const bar1 = document.getElementById(`spell-${prefix}-${spellType}-bar-1`);
            const bar2 = document.getElementById(`spell-${prefix}-${spellType}-bar-2`);
            const bar3 = document.getElementById(`spell-${prefix}-${spellType}-bar-3`);

            if (!iconEl) return;
            iconEl.onclick = () => this.toggleSpell(spellType, colorClass);
            let cd = (state.mana && state.mana[colorClass] && state.mana[colorClass][spellType] !== undefined)
                ? state.mana[colorClass][spellType]
                : 3;

            let uses = engineUses[colorClass][spellType];

            if (countEl) {
                countEl.innerText = uses;
                countEl.style.display = uses > 0 ? 'block' : 'none';
            }
            const isReady = cd >= 3 && uses > 0;
            iconEl.style.opacity = isReady ? '1' : '0.4';
            iconEl.style.filter = isReady ? 'none' : 'grayscale(100%)';
            
            if (this.activeSpell === spellType && state.turn === colorClass) {
                iconEl.style.borderColor = '#00ffff';
                iconEl.style.boxShadow = '0 0 8px #00ffff';
            } else {
                iconEl.style.borderColor = '#555';
                iconEl.style.boxShadow = '0 2px 4px rgba(0,0,0,0.6)';
            }
            const drawBar = (bar, threshold) => {
                if (bar) {
                    bar.style.display = 'block';
                    bar.style.backgroundColor = cd >= threshold ? '#82b41d' : '#444';
                    bar.style.boxShadow = cd >= threshold ? '0 0 4px #82b41d' : 'none';
                }
            };
            drawBar(bar1, 1);
            drawBar(bar2, 2);
            drawBar(bar3, 3);
        };

                const topColor = this.flipped ? 'w' : 'b';
                const botColor = this.flipped ? 'b' : 'w';

                updateIcon('freeze', botColor, false);
                updateIcon('jump', botColor, false);
                updateIcon('freeze', topColor, true);
                updateIcon('jump', topColor, true);
            }
        } else {
            if (spellsTop) spellsTop.style.display = 'none';
            if (spellsBottom) spellsBottom.style.display = 'none';
        }

        const oldSpellBar = document.getElementById('spellBarContainer');
        if (oldSpellBar) {
            oldSpellBar.style.display = 'none';
            oldSpellBar.innerHTML = '';
        }
    }
resetAvatars() {
        const headers = document.querySelectorAll('.player-header');
        if (headers.length < 2) return;
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
        const container = document.getElementById('gameInfo');
        if (container) container.innerHTML = '';
        this.playerInfo = {
            w: { name: "White", meta: "White", country: null, title: null },
            b: { name: "Black", meta: "Black", country: null, title: null }
        };
        this.resetAvatars();
        if (this.#game) this.#game.pgnHeaders = {};
        this._lastMetadataCache = null;
        this._lastHeadersCache = null;
        this.renderHeaders(); 
    }
toggleReviewButton(show) {
        const btn = document.getElementById('reviewGameBtn');
        const results = document.getElementById('reviewResultsPanel');
        if (btn) btn.style.display = show ? 'block' : 'none';
        if (results && show) results.style.display = 'none';
    }
toggleSideMenu(forceOpen = null) {
        const panel = document.getElementById('sideMenuPanel');
        const overlay = document.getElementById('sideMenuOverlay');
        if (!panel || !overlay) return;
        if (typeof forceOpen !== 'boolean') forceOpen = null;

        const isOpen = panel.style.left === '0px';
        const shouldOpen = forceOpen !== null ? forceOpen : !isOpen;

        if (shouldOpen) {
            overlay.style.display = 'block';
            setTimeout(() => { panel.style.left = '0px'; }, 10);
        } else {
            panel.style.left = '-360px';
            setTimeout(() => { overlay.style.display = 'none'; }, 300); 
        }
    }
showGameOver(winner, reason) {
        const modal = document.getElementById('gameOverModal');
        const title = document.getElementById('winnerText');
        const sub = document.getElementById('winReason');
        const icon = document.getElementById('winnerIcon');
        const content = modal.querySelector('.modal-content');
        
        content.style.animation = 'none';
        content.offsetHeight; 
        content.style.animation = 'modalPop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
        
        if (winner === 'Draw') {
            title.innerText = "Game Drawn"; title.style.color = "#ccc";
            icon.innerHTML = this.getPieceHTML({color:'w', type:'K'}); 
            icon.style.opacity = "0.5";
        } else {
            title.innerText = `${winner} Won!`; title.style.color = "#fff";
            const colorCode = (winner === 'White') ? 'w' : 'b';
            icon.innerHTML = this.getPieceHTML({color:colorCode, type:'K'});
            icon.style.opacity = "1";
        }
        
        sub.innerText = reason.replace('won', ''); 
        modal.style.display = 'flex';

        this.toggleReviewButton(true);
    }
hideGameOver() {
        const modal = document.getElementById('gameOverModal');
        if (modal) modal.style.display = 'none';
    }
showPuzzleSuccess() {
        const status = document.getElementById('puzzleStatus');
        const next = document.getElementById('nextPuzzleBtn');
        if(status) { status.innerText = "Success!"; status.style.color = "#26c2a3"; }
        const isRush = ['3min', '5min', 'survival'].includes(this.#game.puzzleMode);
        if (!isRush && next) next.style.display = "block";
    }

showPuzzleHint() {
        const state = this.#game ? this.#game.getReader() : null;
        if (!state || state.mode !== 'puzzle') return;
        
        const isRush = ['3min', '5min', 'survival'].includes(state.puzzle.mode);
        if (isRush) { 
            if (typeof this.showNotification === 'function') {
                this.showNotification("Hints are disabled in Rush Mode!", "Not Allowed", "🚫"); 
            }
            return; 
        }

        // Just read the current required move and highlight the square immediately
        const solutionMove = state.puzzle.solution[state.puzzle.cursor];
        if (!solutionMove) return;
        
        const fromIdx = typeof this.#game.squareToIndex === 'function' ? this.#game.squareToIndex(solutionMove.substring(0, 2)) : -1;
        if (fromIdx === -1) return;

        const sqEl = document.querySelector(`.square[data-index="${fromIdx}"]`);
        
        if (sqEl) {
            // Clear any lingering hints
            document.querySelectorAll('.puzzle-hint-pulse').forEach(el => el.remove());
            
            const hintEl = document.createElement('div'); 
            hintEl.className = 'puzzle-hint-pulse';
            hintEl.style.cssText = 'position:absolute; inset:0; box-shadow:inset 0 0 0 4px var(--gold-400, #facc15), inset 0 0 15px rgba(250, 204, 21, 0.6); border-radius:4px; pointer-events:none; z-index:15;';
            sqEl.appendChild(hintEl);
            
            hintEl.animate([{ opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }], { duration: 800, iterations: 3 });
            
            // Remove the hint the moment the user clicks/taps anywhere
            const clearHint = () => {
                if (hintEl && hintEl.parentNode) hintEl.remove();
                document.removeEventListener('mousedown', clearHint);
                document.removeEventListener('touchstart', clearHint);
            };
            document.addEventListener('mousedown', clearHint);
            document.addEventListener('touchstart', clearHint);
            
            // Fallback auto-remove after 2.4 seconds
            setTimeout(() => { clearHint(); }, 2400);
        }
    }
getSquareFromCoords(x, y) {
        const rect = this.squaresLayer.getBoundingClientRect();
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return -1;
        
        const size = rect.width / 8;
        let c = Math.floor((x - rect.left) / size);
        let r = Math.floor((y - rect.top) / size);
        c = Math.max(0, Math.min(7, c));
        r = Math.max(0, Math.min(7, r));
        
        if (this.flipped) { c = 7 - c; r = 7 - r; }
        return r * 8 + c;
    }
promoteVar() {
        const state = this.#game ? this.#game.getReader() : null;
        if (state && state.activeNodeId) {
            this.#game.promoteVariation(state.activeNodeId);
            this.renderBoard(false, false);
            if (state.mode !== 'play' && this.#game.updateStockfish) this.#game.updateStockfish();
        }
        if (this.annotationPopup) this.annotationPopup.style.display = 'none';
    }
makeMainline() {
        const state = this.#game ? this.#game.getReader() : null;
        if (state && state.activeNodeId) {
            this.#game.makeMainline(state.activeNodeId);
            this.renderBoard(false, false);
            if (state.mode !== 'play' && this.#game.updateStockfish) this.#game.updateStockfish();
        }
        if (this.annotationPopup) this.annotationPopup.style.display = 'none';
    }
toggleEditorMode(active) {
        try {
            if (!this.#game) return;
            if (!this.#game.isPlayingLiveGame) this.#game.mode = active ? 'editor' : 'analysis';
            
            this.selectedSq = null;
            this.legalMoves = [];

            const barTop = document.getElementById('editorBarTop');
            const barBot = document.getElementById('editorBarBottom');

            if (active) {
                document.body.classList.add('show-editor');
                if (barTop) barTop.style.display = 'flex';
                if (barBot) barBot.style.display = 'flex';
                
                this.#game.gameOver = true;
                clearInterval(this.#game.timerInterval);
                
                if (window.sfWorker) {
                    window.engineAnalysing = false;
                    window.sfWorker.postMessage('stop');
                }
                if (typeof this.updateEditorInputs === 'function') this.updateEditorInputs();
            } else {
                document.body.classList.remove('show-editor');
                if (barTop) barTop.style.display = 'none';
                if (barBot) barBot.style.display = 'none';
                
                if (!this.#game.isPlayingLiveGame && this.#game.mode !== 'puzzle') {
                    this.#game.gameOver = false;
                }
            }
            if (typeof this.renderBoard === 'function') this.renderBoard(false);
        } catch (err) {
            console.error("[UI] Error in toggleEditorMode:", err);
        }
    }
initEditorBars() {
        const trashIcon = '<svg viewBox="0 0 24 24" fill="currentColor" style="width:24px; height:24px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
        
        const getSafeImgHtml = (color, type) => {
            let rawSVG = this.getPieceHTML({ color, type });
            if (!rawSVG) return '';
            let trimmed = rawSVG.trim();
            
            let pulseClass = (type === 'duck' || type === '*') ? " piece-heartbeat" : "";
            const lockStyle = 'width:28px; height:28px; object-fit:contain; pointer-events:none; display:block; margin:auto;';
            
            if (trimmed.startsWith('<svg') || trimmed.startsWith('<?xml')) {
                let cleanSvg = trimmed.replace(/<\?xml.*?\?>/g, '').trim();
                return `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(cleanSvg)}" class="${pulseClass}" style="${lockStyle}" draggable="false">`;
            } else if (trimmed.startsWith('<img')) {
                return trimmed.replace('<img ', `<img class="${pulseClass}" style="${lockStyle}" `);
            }
            return `<img src="${trimmed}" class="${pulseClass}" style="${lockStyle}" draggable="false">`;
        };

        const topBar = document.getElementById('editorBarTop');
        let blackPieces = ['P','N','B','R','Q','K'];

        if (topBar) {
            topBar.innerHTML = `<div class="tool-group">
                ${blackPieces.map(p => `
                    <div class="tool-btn" onmousedown="window.app.ui.startSpareDrag(event,'b','${p}')">
                        ${getSafeImgHtml('b', p)}
                    </div>`).join('')}
            </div><div class="tool-btn trash-btn" onclick="window.app.ui.setEditorTool('trash', this)">${trashIcon}</div>`;
        }

        const bottomBar = document.getElementById('editorBarBottom');
        let whitePieces = ['P','N','B','R','Q','K'];
        let extraBot = '';

        // 👉 TỰ ĐỘNG HIỂN THỊ CON VỊT NẾU LÀ DUCK CHESS
        if (this.#game && this.#game.gameMode === 'duck') {
            extraBot = `
            <div class="tool-btn" onmousedown="window.app.ui.startSpareDrag(event,'none','duck')">
                ${getSafeImgHtml('none', 'duck')}
            </div>`;
        }

        if (bottomBar) {
            bottomBar.innerHTML = `<div class="tool-group">
                ${whitePieces.map(p => `
                    <div class="tool-btn" onmousedown="window.app.ui.startSpareDrag(event,'w','${p}')">
                        ${getSafeImgHtml('w', p)}
                    </div>`).join('')}
                ${extraBot}
            </div><div class="tool-btn trash-btn" onclick="window.app.ui.setEditorTool('trash', this)">${trashIcon}</div>`;
        }
    }
setEditorTool(tool, btn) {
        if (tool === 'trash' && this.editorTool === 'trash') {
            this.editorTool = 'cursor';
            btn.classList.remove('active');
        } else {
            this.editorTool = tool;
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            if (btn) btn.classList.add('active');
        }
    }
resolveCastlingIntent(fromIdx, toIdx) {
        const state = this.#game.getReader();
        const p = state.board[fromIdx];
        const t = state.board[toIdx];
        if (p && p.type.toLowerCase() === 'k' && t && t.type.toLowerCase() === 'r' && p.color === t.color) {
            const fromFile = fromIdx % 8;
            const toFile = toIdx % 8;
            return this.legalMoves.find(m => {
                if (toFile > fromFile) return m.san.startsWith('O-O') && !m.san.startsWith('O-O-O'); 
                return m.san.startsWith('O-O-O'); 
            });
        }
        return null;
    }
initGlobalDragEvents() {
        document.addEventListener('mousemove', (e) => { if (this.dragData) this.updateGhostPosition(e); });
        document.addEventListener('mouseup', (e) => { if (this.dragData) this.finishDrag(e); });
    }
startSpareDrag(e, color, type) {
        e.preventDefault(); e.stopPropagation();
        if (this.#game.isEditing) {
            if (this.editorTool === 'trash') this.setEditorTool('cursor', null);
            this.selectedSq = null;
            this.legalMoves = [];
            this.renderBoard(false); 
        }

        this.dragData = { isSpare: true, piece: { color, type } };
        let rawSVG = this.getPieceHTML({ color, type });
        let ghostHTML = rawSVG;
        
        if (rawSVG) {
            let trimmed = rawSVG.trim();
            let pulseClass = (this.animationsEnabled !== false) ? " piece-heartbeat" : "";
            const ghostStyle = 'width:100%; height:100%; object-fit:contain; display:block; pointer-events:none;';
            
            if (trimmed.startsWith('<svg') || trimmed.startsWith('<?xml')) {
                let cleanSvg = trimmed.replace(/<\?xml.*?\?>/g, '').trim();
                ghostHTML = `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(cleanSvg)}" class="${pulseClass}" style="${ghostStyle}" draggable="false">`;
            } else if (trimmed.startsWith('<img')) {
                ghostHTML = trimmed.replace('<img ', `<img class="${pulseClass}" style="${ghostStyle}" `);
            } else {
                ghostHTML = `<img src="${trimmed}" class="${pulseClass}" style="${ghostStyle}" draggable="false">`;
            }
        }
        
        this.initDragGhost(e, ghostHTML);
        this.draggedPieceGhost.classList.add('piece', 'animating');
    }
initDragGhost(e, html) {
        if (!this.dragData || !this.dragData.piece) return;

        let safeContent = html;
        if (html.trim().startsWith('<svg')) {
            const encodedSVG = encodeURIComponent(html);
            safeContent = `<img src="data:image/svg+xml;charset=utf-8,${encodedSVG}" style="width:100%; height:100%; display:block;">`;
        }

        const p = this.dragData.piece;
        const pColor = typeof p === 'object' ? p.color : this.dragData.color;
        const pType = typeof p === 'object' ? p.type : p;

        const colorClass = pColor === 'w' ? 'piece-w' : 'piece-b';
        const cleanClasses = `piece ${colorClass} ${pType}`;

        this.draggedPieceGhost.innerHTML = `<div class="${cleanClasses}" style="width:100%; height:100%; transition: none !important; animation: none !important; transform: none !important;">${safeContent}</div>`;
        this.draggedPieceGhost.style.display = 'block';
        
        const size = this.boardEl.offsetWidth / 8;
        this.draggedPieceGhost.style.width = size + 'px';
        this.draggedPieceGhost.style.height = size + 'px';
        this.draggedPieceGhost.style.transition = 'none';
        this.draggedPieceGhost.style.animation = 'none';
        this.draggedPieceGhost.className = '';
        if (pColor === 'w') this.draggedPieceGhost.classList.add('ghost-w');
        else this.draggedPieceGhost.classList.add('ghost-b');

        if (typeof this.updateGhostPosition === 'function') this.updateGhostPosition(e);
        document.body.classList.add('grabbing');
    }
updateGhostPosition(e) {
        if (!this.draggedPieceGhost) return;
        const scaler = document.getElementById('app-scaler');
        let scale = 1;
        let rect = { left: 0, top: 0 };
        
        if (scaler) {
            rect = scaler.getBoundingClientRect();
            const transform = window.getComputedStyle(scaler).transform;
            if (transform !== 'none') {
                const matrix = transform.match(/^matrix\((.+)\)$/);
                if (matrix) scale = parseFloat(matrix[1].split(',')[0]);
            }
        }
        const localX = (e.clientX - rect.left) / scale;
        const localY = (e.clientY - rect.top) / scale;
        const w = this.draggedPieceGhost.offsetWidth;
        const h = this.draggedPieceGhost.offsetHeight;
        this.draggedPieceGhost.style.left = (localX - w / 2) + 'px';
        this.draggedPieceGhost.style.top = (localY - h / 2) + 'px';
    }
    drawGhostPiece(container, sqIdx, pieceType, color) {
        this._lastGhostParams = { sqIdx, pieceType, color };
        const board = this.boardEl;
        if (!board) return;
        board.querySelectorAll('.ghost-suggestion').forEach(el => el.remove());

        const size = 100 / 8;
        const file = sqIdx & 7;
        const rank = sqIdx >> 3;
        const finalFile = this.flipped ? 7 - file : file;
        const finalRank = this.flipped ? 7 - rank : rank;

        let queryType = pieceType;
        let queryColor = color;
        if (pieceType === '*' || pieceType.toLowerCase() === 'duck') {
            queryType = 'duck'; queryColor = 'none';
        } else {
            queryType = pieceType.toUpperCase();
        }

        const rawSVG = this.getPieceHTML({ type: queryType, color: queryColor });
        let htmlBuffer = rawSVG;
        
        if (rawSVG) {
            const trimmed = rawSVG.trim();
            if (trimmed.startsWith('<svg')) {
                const encodedSVG = encodeURIComponent(trimmed);
                htmlBuffer = `<img src="data:image/svg+xml;charset=utf-8,${encodedSVG}" style="width:100%; height:100%; display:block; pointer-events:none;">`;
            } else if (trimmed.startsWith('data:image/') || trimmed.startsWith('http') || trimmed.endsWith('.svg') || trimmed.endsWith('.png')) {
                htmlBuffer = `<img src="${trimmed}" style="width:100%; height:100%; display:block; pointer-events:none;">`;
            } else if (trimmed.startsWith('<img')) {
                htmlBuffer = trimmed; 
            }
        }

        const div = document.createElement("div");
        div.style.position = "absolute";
        div.style.left = (finalFile * size) + "%";
        div.style.top = (finalRank * size) + "%";
        div.style.width = size + "%";
        div.style.height = size + "%";
        div.style.zIndex = "45"; 
        div.classList.add("ghost-suggestion");
        div.innerHTML = htmlBuffer || '';
        board.appendChild(div);
    }
clearGhostPiece() {
        this._lastGhostParams = null;
        if (this.boardEl) this.boardEl.querySelectorAll('.ghost-suggestion').forEach(el => el.remove());
    }
redrawGhostPiece() {
        if (this._lastGhostParams && this.boardEl) {
            this.drawGhostPiece(this.boardEl, this._lastGhostParams.sqIdx, this._lastGhostParams.pieceType, this._lastGhostParams.color);
        }
    }
startDrag(e, idx, piece) {
    console.log(`\n✋ --- PIECE DRAG INITIATED ---`);
        console.log(`[UI] Grabbing piece: ${piece.color}${piece.type} at UI index: ${idx}`);
        const state = this.#game ? this.#game.getReader() : null;
        if (!state) return;
        
        if (this.duckPlacementMoves) {
            if (piece.type === 'duck') {
                e.preventDefault(); e.stopPropagation();
                this.dragData = { fromIdx: idx, piece: piece, isSpare: true, isDuck: true };
                let rawSVG = this.getPieceHTML(piece);
                let ghostHTML = rawSVG;
                if (rawSVG && rawSVG.trim().startsWith('<svg')) {
                    ghostHTML = `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(rawSVG.trim())}" class="piece-img piece-heartbeat" style="width:100%; height:100%; display:block; pointer-events:none;">`;
                }
                this.initDragGhost(e, ghostHTML);
                this.draggedPieceGhost.classList.add('piece', 'animating');
                if (idx === 'bank') {
                    const bank = document.getElementById('duckBank');
                    if (bank) bank.classList.add('dragging-source');
                } else {
                    const sq = document.querySelector(`.piece[data-id='${piece.id}']`);
                    if (sq) sq.classList.add('dragging-source');
                    this.#emit('soundTriggered', { type: 'click' });
                }
            } else {
                this.duckPlacementMoves = null;
                this.renderBoard(false);
            }
            return; 
        }
        
        if (state.mode === 'editor' && this.editorTool === 'trash') {
            e.preventDefault(); e.stopPropagation();
            this.#game.editBoard(idx, null);
            this.renderBoard(false);
            return; 
        }

        if (state.mode !== 'editor') {
            if (state.isLive && state.mode === 'bot' && piece.color === state.botColor) {
                if ((this.moveInputMode === 'click' || this.moveInputMode === 'both') && this.selectedSq !== null) { } 
                else return;
            }
            if (state.turn !== piece.color) {
                if ((this.moveInputMode === 'click' || this.moveInputMode === 'both') && this.selectedSq !== null) { } 
                else if (state.mode === 'analysis' || this.#game.premoveMode === 'none') { return; }
            }
        }

        if (this.moveInputMode === 'click' || this.moveInputMode === 'both') {
            if (this.selectedSq !== null) {
                let move = this.legalMoves.find(m => m.to === idx);
                if (!move && typeof this.resolveCastlingIntent === 'function') {
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
            if (state.mode === 'editor') {
                this.selectedSq = null; this.legalMoves = [];
            } else {
                this.selectedSq = idx;
                if (piece.color === state.turn) this.legalMoves = this.#game.getLegalMoves(idx);
                else this.legalMoves = [];
            }
            this.renderBoard(false); return; 
        }

        e.preventDefault(); e.stopPropagation();

        if (state.mode === 'editor') {
            this.selectedSq = null; this.legalMoves = [];
        } else {
            this.selectedSq = idx;
            if (piece.color === state.turn) this.legalMoves = this.#game.getLegalMoves(idx);
            else this.legalMoves = [];
        }

        this.renderBoard(false);
        this.dragData = { fromIdx: idx, piece: piece, isSpare: false };

        let rawSVG = this.getPieceHTML(piece); 
        let ghostHTML = rawSVG;
        let pulseClass = (this.animationsEnabled !== false) ? " piece-heartbeat" : "";
        
        if (rawSVG) {
            let trimmed = rawSVG.trim();
            if (trimmed.startsWith('<svg')) ghostHTML = `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}" class="piece-img${pulseClass}" style="width:100%; height:100%; display:block; pointer-events:none;">`;
            else if (trimmed.startsWith('data:image/') || trimmed.startsWith('http') || trimmed.endsWith('.svg') || trimmed.endsWith('.png')) ghostHTML = `<img src="${trimmed}" class="piece-img${pulseClass}" style="width:100%; height:100%; display:block; pointer-events:none;">`;
        }
        
        this.initDragGhost(e, ghostHTML);
        this.draggedPieceGhost.classList.add('piece', 'animating');
        
        const sq = document.querySelector(`.piece[data-id='${piece.id}']`);
        if (sq) sq.classList.add('dragging-source');
    }
cleanupDrag(keepSelection = false) {
        this.dragData = null;
        this.draggedPieceGhost.style.display = 'none';
        this.draggedPieceGhost.classList.remove('piece', 'animating');
        document.body.classList.remove('grabbing');
        document.querySelectorAll('.dragging-source').forEach(el => el.classList.remove('dragging-source'));
        if (!keepSelection) { this.selectedSq = null; this.legalMoves = []; }
        this.renderBoard(false);
    }
finishDrag(e) {
        const state = this.#game ? this.#game.getReader() : null;
        if (!state) return;
        if (this.dragData && this.dragData.source === '@') return;
        const rect = this.squaresLayer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        let dropIdx = -1;

        if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
            const size = rect.width / 8;
            let col = Math.floor(x / size);
            let row = Math.floor(y / size);
            
            col = Math.max(0, Math.min(7, col));
            row = Math.max(0, Math.min(7, row));
            
            if (this.flipped) { col = 7 - col; row = 7 - row; }
            dropIdx = row * 8 + col;
        }
        if (window.app && window.app.trainer && window.app.trainer.isActive) {
            if (dropIdx !== -1 && !this.dragData.isSpare) {
                const intercepted = window.app.trainer.handleUserMoveAttempt(this.dragData.fromIdx, dropIdx);
                if (intercepted) {
                    this.cleanupDrag(false);
                    return;
                }
            }
        }
        let moveMade = false;
        if (this.dragData && this.dragData.isDuck && this.duckPlacementMoves) {
            if (dropIdx !== -1) {
                if (!this.pendingDuckMove) { this.cleanupDrag(false); return; }
                let isEmpty = !state.board[dropIdx] || dropIdx === this.pendingDuckMove.from;
                if (dropIdx === this.pendingDuckMove.to) isEmpty = false;
                
                if (isEmpty && dropIdx !== state.duck_sq) {
                    let duckMove = {
                        from: this.pendingDuckMove.from, to: this.pendingDuckMove.to,
                        promotion: this.pendingDuckMove.promotion, duck_sq: dropIdx, _duckBypass: true
                    };
                    this.duckPlacementMoves = null; this.pendingDuckMove = null;
                    this.executeMove(duckMove, true); 
                    moveMade = true;
                }
            }
            if (this.dragData.fromIdx === 'bank') {
                const bank = document.getElementById('duckBank');
                if (bank) bank.style.opacity = '1';
            }
            this.cleanupDrag(!moveMade);
            return; 
        }
        
        if (dropIdx !== -1) {
            if (state.mode === 'editor') {
                let newPiece = { ...this.dragData.piece };
                let r = Math.floor(dropIdx / 8);
                if (newPiece.type === 'P' && (r === 0 || r === 7)) newPiece.type = 'Q';
                
                this.#game.editBoard(dropIdx, newPiece);
                if (!this.dragData.isSpare && this.dragData.fromIdx !== dropIdx) {
                    this.#game.editBoard(this.dragData.fromIdx, null);
                }
                moveMade = true;
            } else {
                if (!this.dragData.isSpare) {
                    if (this.dragData.fromIdx === dropIdx) { this.cleanupDrag(true); return; }

                    const pData = this.dragData.piece || {};
                    const pColor = typeof pData === 'string' ? this.dragData.color : pData.color;
                    const pType = typeof pData === 'string' ? pData : pData.type;

                    if (state.turn !== pColor) {
                        if (state.mode === 'analysis') { this.cleanupDrag(true); return; }
                        const toRow = Math.floor(dropIdx / 8);
                        let promo = undefined;
                        if (pType && pType.toLowerCase() === 'p') {
                            if ((pColor === 'w' && toRow === 0) || (pColor === 'b' && toRow === 7)) {
                                promo = document.getElementById('autoQueen')?.checked ? 'q' : 'q';
                            }
                        }
                        const moveObj = { from: this.dragData.fromIdx, to: dropIdx, color: pColor, piece: pType, promotion: promo };
                        this.#game.addPremove(moveObj);
                        moveMade = true;
                        this.renderBoard(false);
                    } else {
                        let move = this.legalMoves.find(m => m.to === dropIdx);
                        if (!move) {
                            const castleMove = this.resolveCastlingIntent(this.dragData.fromIdx, dropIdx);
                            if (castleMove) move = castleMove;
                        }
                        if (move) {
                            this.executeMove(move, false);
                            moveMade = true;
                        }
                        else {
                            this.#emit('soundTriggered', { type: 'illegal' });
                        }
                    }
                }
            }
        } else {
            if (state.mode === 'editor' && !this.dragData.isSpare) {
                this.#game.editBoard(this.dragData.fromIdx, null);
                if (window.sfWorker) window.sfWorker.postMessage('stop');
                moveMade = true;
            }
        }

        if (state.mode === 'editor' && moveMade) this.renderBoard(false);
        this.cleanupDrag(!moveMade);
        if (state.mode === 'editor' && typeof this.updateEditorInputs === 'function') this.updateEditorInputs();
    }
syncEditorHTMLWithGame() {
        if (!this.#game) return;
        const curFen = typeof this.#game.generateFEN === 'function' ? this.#game.generateFEN() : (this.#game.currentNode ? this.#game.currentNode.fen : "");
        if (!curFen) return;
        
        const fenInput = document.getElementById('fenInput');
        if (fenInput) fenInput.value = curFen;

        const parts = curFen.split(' ');
        if (parts.length >= 4) {
            const turn = parts[1];
            const castling = parts[2];
            const ep = parts[3];
            
            const turnEl = document.getElementById('editorTurn');
            if (turnEl) turnEl.value = turn;
            
            if (document.getElementById('castling-wK')) document.getElementById('castling-wK').checked = castling.includes('K');
            if (document.getElementById('castling-wQ')) document.getElementById('castling-wQ').checked = castling.includes('Q');
            if (document.getElementById('castling-bK')) document.getElementById('castling-bK').checked = castling.includes('k');
            if (document.getElementById('castling-bQ')) document.getElementById('castling-bQ').checked = castling.includes('q');
            
            const epInput = document.getElementById('epInput') || document.getElementById('editorEpSquare');
            if (epInput) {
                if (epInput.tagName === 'SELECT') {
                    let found = Array.from(epInput.options).some(opt => opt.value === ep);
                    if (!found && ep !== '-') {
                        let opt = document.createElement('option');
                        opt.value = ep; opt.text = ep; epInput.add(opt);
                    }
                }
                epInput.value = ep !== '-' ? ep : '-';
            }
        }
    }
updateLessonUI() {
        if (!this.#game || this.#game.mode !== 'lesson') return;
        const totalSteps = this.#game.lessonData.steps.length;
        const currentStepIdx = this.#game.lessonStep;
        const step = this.#game.lessonData.steps[currentStepIdx];
        
        const progBar = document.getElementById('lesson-progress-bar');
        if (progBar) progBar.style.width = `${(currentStepIdx / totalSteps) * 100}%`;

        if (step) {
            document.getElementById('lesson-instruction').innerText = step.instruction;
        } else {
            document.getElementById('lesson-instruction').innerText = "🎉 Lesson Complete! You've mastered this concept.";
            document.getElementById('lesson-feedback').innerText = "";
            if (progBar) progBar.style.width = "100%";
        }
}
executeMove(move, animate = true, overridePromo = null) {
        const state = this.#game ? this.#game.getReader() : null;
        
        const chapter = (state && state.chapters) ? state.chapters[state.activeChapterIndex] : null;
        const isLichessInteractive = state && state.mode === 'study' && chapter && chapter.analysisMode && chapter.analysisMode.toLowerCase().includes('interactive');
        
        if (state && (state.mode === 'lesson' || isLichessInteractive)) {
            let isCorrect = false;
            let successTxt = "Correct!";
            let failTxt = "Inaccuracy! Try finding a better move.";
            let botResponseMove = null;

            let attemptFrom = typeof move.from === 'number' ? this.#game.indexToSquare(move.from) : move.from;
            let attemptTo = typeof move.to === 'number' ? this.#game.indexToSquare(move.to) : move.to;
            const attemptedUci = move.uci || (attemptFrom + attemptTo + (move.promotion || ''));

            if (state.mode === 'lesson') {
                const step = this.#game.lessonData.steps[this.#game.lessonStep];
                if (!step) return; 
                
                const expected = step.expectedMove;
                isCorrect = Array.isArray(expected) ? expected.includes(attemptedUci) : attemptedUci === expected;
                successTxt = step.successText || "Correct!";
                failTxt = "❌ Incorrect move. Read the instructions and try again!";
                
                if (isCorrect) {
                    this.#game.lessonStep++;
                    botResponseMove = step.opponentResponse; 
                }
            } else {
                const expectedNode = this.#game.currentNode.children[0];
                if (expectedNode && expectedNode.lastMove) {
                    const lm = expectedNode.lastMove;
                    const fromStr = typeof lm.from === 'number' ? this.#game.indexToSquare(lm.from) : lm.from;
                    const toStr = typeof lm.to === 'number' ? this.#game.indexToSquare(lm.to) : lm.to;
                    const expectedUci = fromStr + toStr + (lm.promotion || '');
                    
                    isCorrect = (attemptedUci === expectedUci);
                    
                    if (isCorrect) {
                        const botNode = expectedNode.children[0];
                        if (botNode && botNode.lastMove) {
                            const bm = botNode.lastMove;
                            const bFrom = typeof bm.from === 'number' ? this.#game.indexToSquare(bm.from) : bm.from;
                            const bTo = typeof bm.to === 'number' ? this.#game.indexToSquare(bm.to) : bm.to;
                            botResponseMove = bFrom + bTo + (bm.promotion || '');
                        }
                    }
                } else {
                    isCorrect = true; 
                }
            }

            if (!isCorrect) {
                const feedbackEl = document.getElementById('lesson-feedback');
                if (feedbackEl) {
                    feedbackEl.innerText = failTxt;
                    feedbackEl.style.color = "#fa412d";
                } else {
                    this.showNotification(failTxt, "Incorrect", "❌");
                }
                this.renderBoard(false); 
                return; 
            }

            const feedbackEl = document.getElementById('lesson-feedback');
            if (feedbackEl) {
                feedbackEl.innerText = "✅ " + successTxt;
                feedbackEl.style.color = "#26c2a3";
            } else {
                this.showNotification("Good move!", "Correct", "✅");
            }
            
            if (botResponseMove) {
                setTimeout(() => {
                    if (this.#game && typeof this.#game.playUCI === 'function') {
                        this.#game.playUCI(botResponseMove);
                    }
                    if (typeof this.updateLessonUI === 'function') this.updateLessonUI();
                }, 600);
            } else {
                setTimeout(() => {
                    if (typeof this.updateLessonUI === 'function') this.updateLessonUI();
                    else this.showNotification("Lesson Complete!", "Success", "🏆");
                }, 100);
            }
        }
        
        if (this.pendingSpell) {
            move.isSpell = true;
            move.spellType = this.pendingSpell.spellType || this.pendingSpell.type;
            move.target = this.pendingSpell.target !== undefined ? this.pendingSpell.target : this.pendingSpell.square;
            move.spellSan = this.pendingSpell.san; 
            this.pendingSpell = null; 
        }
        
        const isDrop = move.from === '@';
        let destIdx = move.to !== undefined ? move.to : move.target;
        if (typeof destIdx === 'string') {
            const f = destIdx.charCodeAt(0) - 97;
            const r = 8 - parseInt(destIdx[1]);
            destIdx = r * 8 + f;
        }
        
        const targetPiece = state.board[destIdx];
        const isKingCapture = state.gameMode === 'duck' && targetPiece && targetPiece.type.toLowerCase() === 'k';

        if (state && state.gameMode === 'duck' && !this.duckPlacementMoves && move.duck_sq !== undefined && !move._duckBypass && !isKingCapture) {
            this.duckPlacementMoves = this.legalMoves.filter(m => m.from === move.from && m.to === move.to);
            this.pendingDuckMove = move; 
            this.selectedSq = null; this.legalMoves = [];
            this.renderBoard(false);
            return;
        }
        
        this.pendingDuckMove = null;
        let piece = isDrop ? { type: move.drop || move.piece, color: state.turn } : state.board[move.from];
        if (!piece && !move.isSpell) return; 
        
        const isPawn = (piece && piece.type.toLowerCase() === 'p');
        const destRank = Math.floor(destIdx / 8);
        const isRank8 = (destRank === 0 || destRank === 7);
        
        let promoChar = overridePromo; 
        
        if (!isDrop && isPawn && isRank8 && !promoChar) {
            const autoQueen = document.getElementById('autoQueen')?.checked;
            if (autoQueen) { 
                promoChar = 'q'; 
            } else {
                this.showPromotionModal(piece.color, destIdx, (selectedType) => { 
                    this.executeMove(move, animate, selectedType.toLowerCase()); 
                });
                return;
            }
        }

        if (state.premoves.length > 0) {
            const next = state.premoves[0];
            if (move.from === next.from && move.to === next.to) this.#game.consumePremove();
            else this.#game.clearPremoves();
        }

        let moveAttempt = move;
        if (isDrop && typeof move.to === 'number') {
             moveAttempt = { from: '@', to: this.#game.indexToSquare(move.to), drop: piece.type };
        }

        this._isExecutingMove = true;
        let res = this.#game.makeMove(moveAttempt, promoChar || move.promotion || 'q');
        this._isExecutingMove = false;
        
        this.selectedSq = null;
        this.legalMoves = [];
        this.renderBoard(animate, animate); 
        this.updateHistory();
        this.updateClocks();
        this.renderArrows();
        this.renderHeaders();
        const overlay = document.getElementById('promotion-overlay');
        if(overlay) overlay.style.display = 'none';
    }
renderBoard(animate = false, showMangaTail = true, overrideMove = null) {
        if (this._isExecutingMove) return; 
        
        const state = this.#game ? this.#game.getReader() : null;
        if (!state) return;

        if (state.mode === 'puzzle' && (state.puzzle.mode === '3min' || state.puzzle.mode === '5min')) {
            animate = false;
            showMangaTail = true;
        }
        
        const theme = document.getElementById('assetType') ? document.getElementById('assetType').value : 'merida';
        const boardContainer = document.getElementById('chessBoard');
        if (boardContainer) {
            boardContainer.style.containerType = 'inline-size';
            if (theme === 'disguised') boardContainer.classList.add('theme-disguised');
            else boardContainer.classList.remove('theme-disguised');
        }

        if (this.boardWrapper) {
            const bw = this.boardWrapper.offsetWidth || 600;
            this.boardWrapper.style.setProperty('--board-width', bw + 'px');
        }
        
        this.coordsPosition = document.getElementById('coordPosition') ? document.getElementById('coordPosition').value : 'inside';
        let moveDuration = 250; let castleDuration = 250;

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
            if (p.dataset.animTimeout) { clearTimeout(Number(p.dataset.animTimeout)); delete p.dataset.animTimeout; }
            if (p.dataset.tailTimeout) { clearTimeout(Number(p.dataset.tailTimeout)); delete p.dataset.tailTimeout; }
            p.style.removeProperty('--tail-length-scale'); p.style.removeProperty('--move-angle'); p.style.removeProperty('--anim-duration');
            if (p.classList.contains('captured-pending')) p.remove();
        });

        if (this.animationsEnabled === false) { animate = false; showMangaTail = false; }
        if (moveDuration < 1) animate = false; 

        const annoLayer = document.getElementById('annotationsLayer');
        if (annoLayer) annoLayer.innerHTML = '';
        const extLayer = document.getElementById('external-coords-layer');
        if (extLayer && this.coordsPosition === 'inside') extLayer.innerHTML = '';
        
        const tempArrowRoot = document.getElementById('tempArrowRoot');
        if (tempArrowRoot) tempArrowRoot.innerHTML = '';
        if (typeof this.clearGhostPiece === 'function') this.clearGhostPiece();
    
        let duckBank = document.getElementById('duckBank');
        if (state.gameMode === 'duck') {
            if (!duckBank) {
                duckBank = document.createElement('div'); duckBank.id = 'duckBank'; duckBank.style.cssText = 'position:absolute; width:65px; height:65px; background:rgba(0,0,0,0.6); border:2px dashed #555; border-radius:12px; display:flex; align-items:center; justify-content:center; z-index:999; transition:all 0.2s ease;';
                if (this.boardWrapper) this.boardWrapper.appendChild(duckBank);
            }
            if (this.duckPlacementMoves || state.duck_sq === -1 || state.duck_sq === undefined) {
                duckBank.style.display = 'flex';
                duckBank.innerHTML = this.getPieceHTML({color: 'none', type: 'duck'});
                if (this.duckPlacementMoves) {
                    duckBank.style.borderColor = '#ffeb3b'; duckBank.style.boxShadow = '0 0 15px rgba(255, 235, 59, 0.5)'; duckBank.style.cursor = 'grab';
                    duckBank.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); this.startDrag(e, 'bank', {id: 'duck_piece', type: 'duck', color: 'none'}); };
                } else {
                    duckBank.style.borderColor = '#444'; duckBank.style.boxShadow = 'none'; duckBank.style.cursor = 'default'; duckBank.onmousedown = null;
                }
            } else {
                duckBank.style.display = 'none'; duckBank.onmousedown = null;
            }
            if (typeof this.resizeApp === 'function') this.resizeApp(); 
        } else if (duckBank) { duckBank.remove(); }

        let kIdx = -1;
        if (state.isCheck && state.mode !== 'editor') {
            for (let i = 0; i < 64; i++) {
                const p = state.board[i];
                if (p && p.type === 'k' && p.color === state.turn) { kIdx = i; break; }
            }
        }

        const activeMove = overrideMove || state.lastMove;
        const nodeMove = state.lastMove;
        if (this.squaresLayer.children.length !== 64) {
            this.squaresLayer.innerHTML = '';
            const fragment = document.createDocumentFragment();
            for (let i = 0; i < 64; i++) { 
                let sq = document.createElement('div');
                let rk = document.createElement('span'); rk.className = 'coord rank'; rk.style.display = 'none';
                let fl = document.createElement('span'); fl.className = 'coord file'; fl.style.display = 'none';
                sq.appendChild(rk); sq.appendChild(fl);
                fragment.appendChild(sq); 
            }
            this.squaresLayer.appendChild(fragment);
        }

        const squares = this.squaresLayer.children;
        let frozenClusters = new Map();
        if (state.gameMode === 'spell') {
            let combinedFrozen = new Array(64).fill(false);
            
            if (state.frozenSquares) {
                for (let i = 0; i < 64; i++) {
                    if (state.frozenSquares[i]) combinedFrozen[i] = true;
                }
            }
            
            if (this.pendingSpell && (this.pendingSpell.spellType === 'freeze' || this.pendingSpell.type === 'freeze')) {
                let target = this.pendingSpell.target !== undefined ? this.pendingSpell.target : this.pendingSpell.square;
                let pr = target >> 3;
                let pc = target & 7;
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        let nr = pr + dr, nc = pc + dc;
                        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                            combinedFrozen[nr * 8 + nc] = true;
                        }
                    }
                }
            }

            let visited = new Set();
            for (let i = 0; i < 64; i++) {
                if (combinedFrozen[i] && !visited.has(i)) {
                    let cluster = [];
                    let q = [i];
                    visited.add(i);
                    while(q.length > 0) {
                        let curr = q.shift();
                        cluster.push(curr);
                        let r = curr >> 3, c = curr & 7;
                        let neighbors = [curr-8, curr+8, curr-1, curr+1, curr-9, curr-7, curr+7, curr+9];
                        for (let n of neighbors) {
                            if (n >= 0 && n < 64 && combinedFrozen[n] && !visited.has(n)) {
                                let nr = n >> 3, nc = n & 7;
                                if (Math.abs(nr-r) <= 1 && Math.abs(nc-c) <= 1) {
                                    visited.add(n);
                                    q.push(n);
                                }
                            }
                        }
                    }
                    let minR = 8, maxR = -1, minC = 8, maxC = -1;
                    for (let sq of cluster) {
                        let r = sq >> 3, c = sq & 7;
                        if (r < minR) minR = r; if (r > maxR) maxR = r;
                        if (c < minC) minC = c; if (c > maxC) maxC = c;
                    }
                    let W = maxC - minC + 1;
                    let H = maxR - minR + 1;
                    for (let sq of cluster) {
                        frozenClusters.set(sq, { minR, minC, W, H });
                    }
                }
            }
        }

        for (let v = 0; v < 64; v++) {
            let r_vis = v >> 3; 
            let c_vis = v & 7;
            
            let r_log = this.flipped ? 7 - r_vis : r_vis;
            let c_log = this.flipped ? 7 - c_vis : c_vis;
            let logical_i = r_log * 8 + c_log;
            
            let sq = squares[v];
            sq.className = `square ${(r_log + c_log) % 2 === 0 ? 'light' : 'dark'}`;
            sq.dataset.index = logical_i;
            let oldIce = sq.querySelector('.spell-ice');
            let oldPortal = sq.querySelector('.spell-portal');
            Array.from(sq.children).forEach(child => {
                if (!child.classList.contains('spell-ice') && !child.classList.contains('spell-portal') && !child.classList.contains('coord')) {
                    child.remove();
                }
            });

            let isFrozen = state.gameMode === 'spell' && frozenClusters.has(logical_i);
            let mapping = isFrozen ? frozenClusters.get(logical_i) : null;
            let mappingStr = mapping ? `${mapping.minR}_${mapping.minC}_${mapping.W}_${mapping.H}_${this.flipped}` : "";

            if (isFrozen) {
                sq.classList.add('frozen');
                if (!oldIce || oldIce.dataset.mapping !== mappingStr) {
                    if (oldIce) oldIce.remove();
                    let ice = document.createElement('div');
                    ice.className = 'spell-ice';
                    ice.dataset.mapping = mappingStr;
                    
                    if (mapping) {
                        let x_offset = c_log - mapping.minC;
                        let y_offset = r_log - mapping.minR;
                        let vis_x = this.flipped ? (mapping.W - 1) - x_offset : x_offset;
                        let vis_y = this.flipped ? (mapping.H - 1) - y_offset : y_offset;
                        let bgX = mapping.W > 1 ? (vis_x / (mapping.W - 1)) * 100 : 50;
                        let bgY = mapping.H > 1 ? (vis_y / (mapping.H - 1)) * 100 : 50;
                        
                        let svgSnowFlower = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><filter id='glow'><feGaussianBlur stdDeviation='1.2' result='blur'/><feMerge><feMergeNode in='blur'/><feMergeNode in='SourceGraphic'/></feMerge></filter><g id='branch'><line x1='50' y1='50' x2='50' y2='0' stroke='%23fff' stroke-width='1.5' stroke-linecap='round'/><path d='M 50 6 L 30 26 M 50 6 L 70 26 M 50 14 L 28 36 M 50 14 L 72 36 M 50 22 L 32 40 M 50 22 L 68 40 M 50 30 L 38 42 M 50 30 L 62 42 M 50 38 L 42 46 M 50 38 L 58 46' stroke='%230af' stroke-width='1' fill='none' stroke-linecap='round'/><path d='M 50 10 L 40 20 M 50 10 L 60 20 M 50 18 L 36 32 M 50 18 L 64 32 M 50 26 L 40 36 M 50 26 L 60 36 M 50 34 L 44 40 M 50 34 L 56 40' stroke='%23fff' stroke-width='0.6' fill='none' stroke-linecap='round'/></g><g id='spike'><line x1='50' y1='50' x2='50' y2='10' stroke='%2308f' stroke-width='1.2' stroke-linecap='round'/><path d='M 50 16 L 38 28 M 50 16 L 62 28 M 50 26 L 42 34 M 50 26 L 58 34 M 50 36 L 46 40 M 50 36 L 54 40' stroke='%234df' stroke-width='0.8' fill='none' stroke-linecap='round'/></g></defs><g filter='url(%23glow)'><polygon points='50,15 75,25 85,50 75,75 50,85 25,75 15,50 25,25' fill='rgba(0,60,150,0.5)'/><use href='%23branch' transform='rotate(0 50 50)'/><use href='%23branch' transform='rotate(45 50 50)'/><use href='%23branch' transform='rotate(90 50 50)'/><use href='%23branch' transform='rotate(135 50 50)'/><use href='%23branch' transform='rotate(180 50 50)'/><use href='%23branch' transform='rotate(225 50 50)'/><use href='%23branch' transform='rotate(270 50 50)'/><use href='%23branch' transform='rotate(315 50 50)'/><use href='%23spike' transform='rotate(22.5 50 50)'/><use href='%23spike' transform='rotate(67.5 50 50)'/><use href='%23spike' transform='rotate(112.5 50 50)'/><use href='%23spike' transform='rotate(157.5 50 50)'/><use href='%23spike' transform='rotate(202.5 50 50)'/><use href='%23spike' transform='rotate(247.5 50 50)'/><use href='%23spike' transform='rotate(292.5 50 50)'/><use href='%23spike' transform='rotate(337.5 50 50)'/><polygon points='50,25 68,32 75,50 68,68 50,75 32,68 25,50 32,32' fill='rgba(0,150,255,0.4)' stroke='%23fff' stroke-width='1.5'/><polygon points='50,35 61,39 65,50 61,61 50,65 39,61 35,50 39,39' fill='rgba(150,240,255,0.6)' stroke='%230af' stroke-width='1.5'/><circle cx='50' cy='50' r='8' fill='%23fff'/><circle cx='50' cy='50' r='3' fill='%230bf'/></g></svg>`;

                        let bgSize = `${mapping.W * 100}% ${mapping.H * 100}%`;
                        let bgPos = `${bgX}% ${bgY}%`;

                        ice.style.cssText = `
                            position: absolute; top: 0; left: 0; width: 100%; height: 100%; 
                            background-image: 
                                url("${svgSnowFlower}"),
                                repeating-conic-gradient(from 0deg at 50% 50%, transparent 0deg, transparent 3deg, rgba(200, 240, 255, 0.3) 4deg, transparent 5deg),
                                repeating-conic-gradient(from 1.5deg at 50% 50%, transparent 0deg, transparent 5deg, rgba(50, 150, 255, 0.25) 6deg, transparent 7deg),
                                radial-gradient(circle at 50% 50%, rgba(40, 180, 255, 0.6) 0%, rgba(10, 60, 160, 0.85) 45%, rgba(2, 10, 30, 0.98) 100%),
                                repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255, 255, 255, 0.15) 6px, transparent 7px),
                                repeating-linear-gradient(-45deg, transparent, transparent 9px, rgba(100, 200, 255, 0.15) 10px, transparent 11px);
                            background-size: ${bgSize}, ${bgSize}, ${bgSize}, ${bgSize}, ${bgSize}, ${bgSize};
                            background-position: ${bgPos}, ${bgPos}, ${bgPos}, ${bgPos}, ${bgPos}, ${bgPos};
                            opacity: 0.95; pointer-events: none; z-index: 20; 
                            backdrop-filter: blur(5px) brightness(0.5);
                            animation: iceCrystallize 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards, icePulse 2.5s infinite alternate ease-in-out 0.5s;
                            box-sizing: border-box;
                        `;
                        
                        let rad = '10px';
                        if (vis_x === 0 && vis_y === 0) ice.style.borderTopLeftRadius = rad;
                        if (vis_x === mapping.W - 1 && vis_y === 0) ice.style.borderTopRightRadius = rad;
                        if (vis_x === 0 && vis_y === mapping.H - 1) ice.style.borderBottomLeftRadius = rad;
                        if (vis_x === mapping.W - 1 && vis_y === mapping.H - 1) ice.style.borderBottomRightRadius = rad;

                        let shadows = [];
                        let glowOuter = 'rgba(0, 120, 255, 0.9)'; 
                        let glowInner = 'rgba(100, 220, 255, 0.6)';
                        let borderStr = '1px solid rgba(150, 240, 255, 0.8)';
                        
                        if (vis_y === 0) { shadows.push(`inset 0 10px 12px -5px ${glowOuter}, inset 0 2px 3px ${glowInner}`); ice.style.borderTop = borderStr; }
                        if (vis_y === mapping.H - 1) { shadows.push(`inset 0 -10px 12px -5px ${glowOuter}, inset 0 -2px 3px ${glowInner}`); ice.style.borderBottom = borderStr; }
                        if (vis_x === 0) { shadows.push(`inset 10px 0 12px -5px ${glowOuter}, inset 2px 0 3px ${glowInner}`); ice.style.borderLeft = borderStr; }
                        if (vis_x === mapping.W - 1) { shadows.push(`inset -10px 0 12px -5px ${glowOuter}, inset -2px 0 3px ${glowInner}`); ice.style.borderRight = borderStr; }
                        
                        if (shadows.length > 0) ice.style.boxShadow = shadows.join(', ');
                    }
                    if (!document.getElementById('ice-anim-style')) {
                        let style = document.createElement('style'); style.id = 'ice-anim-style';
                        style.innerHTML = `
                            @keyframes iceCrystallize { 0% { opacity: 0; transform: scale(0.8) rotate(-5deg); filter: brightness(2); backdrop-filter: blur(0px); } 100% { opacity: 0.95; transform: scale(1) rotate(0deg); filter: brightness(1); backdrop-filter: blur(5px) brightness(0.5); } }
                            @keyframes icePulse { 0% { filter: brightness(1) drop-shadow(0 0 2px rgba(0, 100, 255, 0.3)); } 100% { filter: brightness(1.25) drop-shadow(0 0 15px rgba(0, 180, 255, 0.9)); } }
                        `;
                        document.head.appendChild(style);
                    }
                    sq.appendChild(ice);
                }
            } else {
                sq.classList.remove('frozen');
                if (oldIce) oldIce.remove();
            }

            let isPortal = state.gameMode === 'spell' && state.jump_sq !== undefined && state.jump_sq === logical_i;
            if (this.pendingSpell && (this.pendingSpell.spellType === 'jump' || this.pendingSpell.type === 'jump')) {
                let target = this.pendingSpell.target !== undefined ? this.pendingSpell.target : this.pendingSpell.square;
                if (target === logical_i) isPortal = true;
            }

            if (isPortal) {
                if (!oldPortal) {
                    let portal = document.createElement('div');
                    portal.className = 'spell-portal';
                    portal.style.cssText = `position:absolute; top:10%; left:10%; width:80%; height:80%; background:radial-gradient(circle, rgba(0,0,0,0.95) 30%, rgba(138,43,226,0.8) 60%, transparent 85%); border-radius:50%; pointer-events:none; z-index:15; box-shadow: inset 0 0 10px #000, 0 0 20px #8a2be2; animation: pulsePortal 2s infinite alternate;`;
                    if (!document.getElementById('portal-anim-style')) {
                        let style = document.createElement('style'); style.id = 'portal-anim-style';
                        style.innerHTML = `@keyframes pulsePortal { 0% { transform: scale(0.95); opacity: 0.8; } 100% { transform: scale(1.05); opacity: 1; } }`;
                        document.head.appendChild(style);
                    }
                    sq.appendChild(portal);
                }
            } else {
                if (oldPortal) oldPortal.remove();
            }
            if (this.coordsPosition === 'inside') {
                const rankVal = 8 - r_log;
                const fileVal = ['a','b','c','d','e','f','g','h'][c_log];
                let rankSpan = sq.querySelector('.coord.rank');
                let fileSpan = sq.querySelector('.coord.file');
                
                if (c_vis === 0) {
                    rankSpan.innerText = rankVal;
                    rankSpan.style.display = 'block';
                } else {
                    rankSpan.style.display = 'none';
                }
                
                if (r_vis === 7) {
                    fileSpan.innerText = fileVal;
                    fileSpan.style.display = 'block';
                } else {
                    fileSpan.style.display = 'none';
                }
            } else {
                let rankSpan = sq.querySelector('.coord.rank');
                let fileSpan = sq.querySelector('.coord.file');
                if (rankSpan) rankSpan.style.display = 'none';
                if (fileSpan) fileSpan.style.display = 'none';
            }

            if (state.isCheck && logical_i === kIdx) sq.classList.add('in-check');
            
            if (state.mode !== 'editor' && this.selectedSq != null && this.selectedSq == logical_i) {
                sq.classList.add('selected');
                const p = state.board[logical_i];
                if (p) sq.classList.add(p.color === 'w' ? 'selected-w' : 'selected-b');
            }

            if (activeMove && (activeMove.from === logical_i || activeMove.to === logical_i)) {
                sq.classList.add('last-move');
                let moveColor = activeMove.color;
                if (!moveColor && state.board[activeMove.to]) moveColor = state.board[activeMove.to].color;
                else if (!moveColor) moveColor = state.turn === 'w' ? 'b' : 'w';
                if (moveColor === 'w') sq.classList.add('highlight-w');
                else if (moveColor === 'b') sq.classList.add('highlight-b');
            }

            if (state.premoves && state.premoves.length > 0) {
                state.premoves.forEach(pm => {
                    if (logical_i === pm.from) sq.classList.add('premove-source');
                    if (logical_i === pm.to) sq.classList.add('premove-dest');
                });
            }

            sq.onmousedown = null;

            if (state.gameMode === 'spell' && this.activeSpell && state.mode !== 'editor') {
                sq.style.cursor = 'pointer'; 

                sq.onmouseenter = () => {
                    this.squaresLayer.querySelectorAll('.spell-target-hover').forEach(el => el.classList.remove('spell-target-hover'));

                    if (this.activeSpell === 'freeze') {
                        const r = logical_i >> 3;
                        const c = logical_i & 7;

                        for (let dr = -1; dr <= 1; dr++) {
                            for (let dc = -1; dc <= 1; dc++) {
                                const nr = r + dr, nc = c + dc;
                                if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                                    const targetIdx = nr * 8 + nc;
                                    const targetSq = this.squaresLayer.querySelector(`[data-index="${targetIdx}"]`);
                                    if (targetSq) targetSq.classList.add('spell-target-hover');
                                }
                            }
                        }
                    } else {
                        sq.classList.add('spell-target-hover');
                    }
                };

                sq.onmouseleave = () => {
                    this.squaresLayer.querySelectorAll('.spell-target-hover').forEach(el => el.classList.remove('spell-target-hover'));
                };

                sq.onmousedown = (e) => {
                    if (e.button !== 0) return; 
                    e.preventDefault();
                    e.stopPropagation();
                    this.squaresLayer.querySelectorAll('.spell-target-hover').forEach(el => el.classList.remove('spell-target-hover'));
                    
                    if (typeof this.castSpell === 'function') {
                        this.castSpell(this.activeSpell, logical_i);
                    }
                };

                continue; 
            } else {
                sq.style.cursor = ''; 
                sq.onmouseenter = null;
                sq.onmouseleave = null;
            }

            if (this.duckPlacementMoves && state.mode !== 'editor') {
                if (!this.pendingDuckMove) continue; 
                let isEmpty = !state.board[logical_i] || logical_i === this.pendingDuckMove.from;
                if (logical_i === this.pendingDuckMove.to) isEmpty = false;

                if (isEmpty && logical_i !== state.duck_sq) {
                    sq.classList.add('valid-move');
                    let hint = document.createElement('div');
                    hint.className = 'hint-dot'; hint.style.backgroundColor = '#ffeb3b'; hint.style.boxShadow = '0 0 10px #ffeb3b';
                    sq.appendChild(hint);
                    
                    let cachedMove = { from: this.pendingDuckMove.from, to: this.pendingDuckMove.to, promotion: this.pendingDuckMove.promotion, duck_sq: logical_i, _duckBypass: true };
                    sq.onmousedown = (e) => {
                        e.preventDefault(); e.stopPropagation();
                        this.duckPlacementMoves = null; this.pendingDuckMove = null; 
                        this.executeMove(cachedMove, true); 
                    };
                } else {
                    sq.onmousedown = () => { this.duckPlacementMoves = null; this.pendingDuckMove = null; this.renderBoard(false); };
                }
                continue; 
            }
            if (this.selectedSq != null && this.legalMoves) {
                let move = this.legalMoves.find(m => m.to === logical_i);
                if (!move && typeof this.resolveCastlingIntent === 'function') {
                    const castleMove = this.resolveCastlingIntent(this.selectedSq, logical_i);
                    if (castleMove) move = castleMove;
                }
                if (move) {
                    sq.classList.add('valid-move');
                    
                    const selPiece = state.board[this.selectedSq];
                    if (selPiece) sq.classList.add(selPiece.color === 'w' ? 'dest-w' : 'dest-b');
                    
                    let hint = document.createElement('div');
                    hint.className = state.board[logical_i] ? 'hint-capture' : 'hint-dot';
                    sq.appendChild(hint);
                    sq.onmousedown = (e) => {
                        if (e.button !== 0) return;
                        if (this.moveInputMode === 'drag') return;
                        e.stopPropagation(); this.executeMove(move, true);
                    }
                }
            }

            if (state.mode === 'editor') {
                animate = false; showMangaTail = false;
                sq.onmousedown = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    if (this.editorTool === 'trash') {
                        if (state.board[logical_i]) { this.#game.editBoard(logical_i, null); this.renderBoard(false); }
                    } else if (this.editorTool && this.editorTool !== 'cursor') {
                        const color = this.editorTool.charAt(0);
                        const type = this.editorTool.charAt(1).toLowerCase();
                        this.#game.editBoard(logical_i, { color: color, type: type });
                        this.renderBoard(false);
                    }
                };
            }
        }

        if (this.coordsPosition === 'outside' && typeof this.renderExternalCoords === 'function') this.renderExternalCoords();
        
        let visualBoard;
        const currentFen = this.#game && this.#game.currentNode ? this.#game.currentNode.fen : '';
        
        if (currentFen.includes('~')) {
            visualBoard = new Array(64).fill(null);
            let validPieces = state.board.filter(p => p && p.type !== '~');
            
            let fenRanks = currentFen.split(' ')[0];
            let logicalIndex = 0;
            let pieceCursor = 0;
            
            for (let i = 0; i < fenRanks.length; i++) {
                let char = fenRanks[i];
                if (char === '/') continue;
                
                if (/\d/.test(char)) { 
                    let empties = parseInt(char, 10);
                    for (let e = 0; e < empties; e++) {
                        visualBoard[logicalIndex] = null;
                        logicalIndex++;
                    }
                } else if (char === '~') { 
                    let prevSq = logicalIndex - 1;
                    if (visualBoard[prevSq] && state.gameMode === 'alice') {
                        visualBoard[prevSq].isBoardB = true;
                    }
                } else { 
                    if (pieceCursor < validPieces.length) {
                        visualBoard[logicalIndex] = { ...validPieces[pieceCursor] };
                        pieceCursor++;
                    }
                    logicalIndex++; 
                }
            }
        } else {
            visualBoard = [...state.board];
        }

        if (this.duckPlacementMoves && this.pendingDuckMove) {
            const fromIdx = this.pendingDuckMove.from; const toIdx = this.pendingDuckMove.to;
            if (fromIdx >= 0 && fromIdx < 64 && toIdx >= 0 && toIdx < 64) {
                visualBoard[toIdx] = visualBoard[fromIdx]; visualBoard[fromIdx] = null;
            }
        }
        
        const piecesMap = new Map();
        for (let i = 0; i < 64; i++) {
            if (visualBoard[i]) {
                let p = { ...visualBoard[i], idx: i };
                piecesMap.set(visualBoard[i].id, p);
            }
        }
        
        if (state.gameMode === 'duck' && state.duck_sq !== undefined && state.duck_sq !== -1) {
            piecesMap.set('duck_piece', { id: 'duck_piece', type: 'duck', color: 'none', idx: state.duck_sq });
        }
        
        Array.from(this.piecesLayer.children).forEach(el => {
            const oldId = el.dataset.id;
            if (piecesMap.has(oldId)) return;
            
            const domType = Array.from(el.classList).find(c => ['P','N','B','R','Q','K','duck'].includes(c.toUpperCase()));
            
            const match = Array.from(piecesMap.values()).find(p => 
                p.color === (el.classList.contains('piece-w') ? 'w' : 'b') && 
                p.type.toUpperCase() === (domType ? domType.toUpperCase() : '') &&
                !this.piecesLayer.querySelector(`[data-id="${p.id}"]`)
            );
            
            if (match) { el.dataset.id = match.id; return; }
            if (animate) {
                el.classList.add('captured-pending');
                setTimeout(() => el.remove(), moveDuration < 100 ? 0 : 200);
            } else el.remove();
        });

        piecesMap.forEach((p, id) => {
            let el = this.piecesLayer.querySelector(`[data-id="${id}"]`);
            let isNew = false;
            
            const colorClass = p.color === 'w' ? 'piece-w' : 'piece-b';
            const typeClass = p.type.toUpperCase();
            const rawSVG = this.getPieceHTML(p);
            let htmlBuffer = rawSVG;

            if (rawSVG) {
                const trimmed = rawSVG.trim();
                let duckClass = (p.type === 'duck' && this.animationsEnabled !== false) ? ' piece-heartbeat' : '';
                if (trimmed.startsWith('<svg')) {
                    const encodedSVG = encodeURIComponent(trimmed);
                    htmlBuffer = `<img src="data:image/svg+xml;charset=utf-8,${encodedSVG}" class="piece-img${duckClass}" style="width:100%; height:100%; display:block; pointer-events:none;">`;
                } else if (trimmed.startsWith('data:image/') || trimmed.startsWith('http') || trimmed.endsWith('.svg') || trimmed.endsWith('.png')) {
                    htmlBuffer = `<img src="${trimmed}" class="piece-img${duckClass}" style="width:100%; height:100%; display:block; pointer-events:none;">`;
                }
            }
            
            const activeNode = (this.#game && this.#game.currentNode) ? this.#game.currentNode : null;
            const nodeMove = activeNode ? activeNode.lastMove : null;
            
            if (nodeMove && p.idx === nodeMove.to && activeNode) {
                let evalNags = [];
                let qualityNags = [];

                if (activeNode.nag) {
                    const nags = activeNode.nag.toString().split(',');
                    nags.forEach(n => {
                        const info = typeof this.getNagInfo === 'function' ? this.getNagInfo(n.trim()) : null;
                        if (info) {
                            if (info.type.startsWith('eval')) evalNags.push(info);
                            else qualityNags.push(info);
                        }
                    });
                }

                if (activeNode.isBook) {
                    let svgBook = typeof ICON_BOOK_SVG !== 'undefined' ? ICON_BOOK_SVG.replace('width="30"', 'width="24"').replace('height="30"', 'height="24"') : 'B';
                    qualityNags.push({
                        symbol: `<div style="display:flex; justify-content:center; align-items:center; color:transparent; width:100%; height:100%;">${svgBook}</div>`,
                        color: '#a87c53', borderColor: '#825f3c', textColor: '#ffffff'
                    });
                }

                const finalNagsInfo = [...qualityNags, ...evalNags];
                
                if (finalNagsInfo.length > 0) {
                    const nagsHtml = finalNagsInfo.map((info, index) => {
                        const tColor = info.textColor || '#ffffff';
                        const zIndex = 10 - index;
                        
                        const marginLeft = index > 0 ? '-15cqi' : '0';
                        
                        const wideSymbols = ['⩲', '⩱', '±', '∓', '∞', '='];
                        const isDoubleChar = (info.symbol.length > 1 || wideSymbols.includes(info.symbol)) && !info.symbol.includes('<div');
                        const fontSize = isDoubleChar ? '18cqi' : '25cqi';
                        const letterSpacing = isDoubleChar ? '-1cqi' : 'normal';
                        
                        return `<div class="nag-indicator" style="background-color:${info.color} !important; border:3cqi solid ${info.borderColor} !important; color:${tColor} !important; width:40cqi !important; height:40cqi !important; min-width:40cqi !important; min-height:40cqi !important; max-width:40cqi !important; max-height:40cqi !important; flex-shrink:0 !important; flex-grow:0 !important; border-radius:50% !important; display:flex !important; flex-direction:column !important; align-items:center !important; justify-content:center !important; padding:0 !important; margin:0 0 0 ${marginLeft} !important; font-size:${fontSize} !important; letter-spacing:${letterSpacing} !important; font-weight:800 !important; box-shadow:0 2cqi 4cqi rgba(0,0,0,0.6) !important; box-sizing:border-box !important; z-index:${zIndex} !important; line-height:1 !important; white-space:nowrap !important; overflow:hidden !important; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important; text-shadow:none !important;">${info.symbol}</div>`;
                    }).join('');
                    
                    htmlBuffer += `
                        <div class="nag-wrapper" style="position:absolute !important; top:0 !important; left:0 !important; width:100% !important; height:100% !important; container-type:inline-size !important; pointer-events:none !important; z-index:100 !important;">
                            <div style="position:absolute !important; top:-10% !important; right:-10% !important; display:flex !important; flex-direction:row !important; align-items:center !important;">
                                ${nagsHtml}
                            </div>
                        </div>`;
                }
            }

            if (!el) {
                el = document.createElement('div');
                el.className = `piece ${colorClass} ${typeClass}`; 
                el.dataset.id = id; el.innerHTML = htmlBuffer;
                this.piecesLayer.appendChild(el);
                isNew = true;
            } else {
                el.className = `piece ${colorClass} ${typeClass}`; 
                if (el.innerHTML !== htmlBuffer) el.innerHTML = htmlBuffer;
            }

            if (state.gameMode === 'spell' && this.activeSpell && state.mode !== 'editor') {
                el.style.cursor = 'pointer';
                
                el.onmouseenter = () => {
                    this.squaresLayer.querySelectorAll('.spell-target-hover').forEach(s => s.classList.remove('spell-target-hover'));
                    
                    if (this.activeSpell === 'freeze') {
                        const r = p.idx >> 3;
                        const c = p.idx & 7;
                        for (let dr = -1; dr <= 1; dr++) {
                            for (let dc = -1; dc <= 1; dc++) {
                                const nr = r + dr, nc = c + dc;
                                if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                                        const targetLogicalIdx = nr * 8 + nc;
                                        const visualIdx = this.flipped ? (63 - targetLogicalIdx) : targetLogicalIdx;
                                        const targetSq = squares[visualIdx];
                                    if (targetSq) targetSq.classList.add('spell-target-hover');
                                }
                            }
                        }
                    } else {
                        const targetSq = this.squaresLayer.querySelector(`[data-index="${p.idx}"]`);
                        if (targetSq) targetSq.classList.add('spell-target-hover');
                    }
                };

                el.onmouseleave = () => {
                    this.squaresLayer.querySelectorAll('.spell-target-hover').forEach(s => s.classList.remove('spell-target-hover'));
                };

                el.onmousedown = (e) => {
                    if (e.button !== 0) return;
                    e.preventDefault(); 
                    e.stopPropagation();
                    
                    this.squaresLayer.querySelectorAll('.spell-target-hover').forEach(s => s.classList.remove('spell-target-hover'));
                    
                    if (typeof this.castSpell === 'function') {
                        this.castSpell(this.activeSpell, p.idx);
                    }
                };
            } else {
                el.style.cursor = '';
                el.onmouseenter = null;
                el.onmouseleave = null;
                el.onmousedown = (e) => { 
                    if (e.button === 0) this.startDrag(e, p.idx, p); 
                };
            }

            if (p.isBoardB) {
                el.style.filter = 'hue-rotate(180deg) drop-shadow(0 0 5px cyan)';
                el.style.opacity = '0.6';
                const innerImg = el.querySelector('img');
                if (innerImg) innerImg.style.transform = 'scale(0.80)'; 
            } else {
                el.style.filter = 'none';
                el.style.opacity = '1';
                const innerImg = el.querySelector('img');
                if (innerImg) innerImg.style.transform = 'none';
            }

            let r = p.idx >> 3; let c = p.idx & 7;
            if (this.flipped) { r = 7 - r; c = 7 - c; }
            const targetTransform = `translate(${c * 100}%, ${r * 100}%)`;
            el.style.width = '12.5%'; el.style.height = '12.5%';

            const positionChanged = (el._lastTransform && el._lastTransform !== targetTransform);
            const targetMove = activeMove;

            let isCastleRook = false;
            let isCastlingMove = false;

            if (targetMove && targetMove.flags && (targetMove.flags.includes('k') || targetMove.flags.includes('q'))) {
                const isKingside = targetMove.flags.includes('k');
                const turn = targetMove.color || p.color;
                if (p.color === turn) {
                    const kTarget = turn === 'w' ? (isKingside ? 62 : 58) : (isKingside ? 6 : 2);
                    const rTarget = turn === 'w' ? (isKingside ? 61 : 59) : (isKingside ? 5 : 3);
                    const boardKing = state.board[kTarget];
                    const isForward = (boardKing && boardKing.type.toLowerCase() === 'k' && boardKing.color === turn);
                    
                    let rFiles = []; let kFile = 4; let currC = 0;
                    let rankStr = turn === 'w' ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'.split('/')[7] : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'.split('/')[0];
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

                    if (p.type.toLowerCase() === 'k') {
                        if (isForward && p.idx === kTarget) { isCastlingMove = true; p._castleStartIdx = kStart; }
                        else if (!isForward && p.idx === kStart) { isCastlingMove = true; p._castleStartIdx = kTarget; }
                    } else if (p.type.toLowerCase() === 'r') {
                        if (isForward && p.idx === rTarget) { isCastlingMove = true; isCastleRook = true; p._castleStartIdx = rStart; }
                        else if (!isForward && p.idx === rStart) { isCastlingMove = true; isCastleRook = true; p._castleStartIdx = rTarget; }
                    }
                }
            }

            let isMovedPiece = !!(targetMove && p.idx === targetMove.to);
            let forceAnimate = isMovedPiece || isCastlingMove;
            let startTransform = el._lastTransform;
            let startC = c, startR = r;

            if (!isNew && el._lastC !== undefined && el._lastR !== undefined) {
                startC = el._lastC;
                startR = el._lastR;
                startTransform = `translate(${startC * 100}%, ${startR * 100}%)`;
            } else {
                const getSafeIndex = (val) => {
                    if (val === '@') return p.idx; 
                    if (typeof val === 'number') return val;
                    if (typeof val === 'string' && val.length === 2) {
                        let f = val.charCodeAt(0) - 97; let rv = 8 - parseInt(val[1], 10); return rv * 8 + f;
                    }
                    return val;
                };
                const fromGridSq = isCastlingMove ? p._castleStartIdx : (isMovedPiece ? getSafeIndex(targetMove.from) : p.idx);
                
                startR = fromGridSq >> 3; 
                startC = fromGridSq & 7;
                if (this.flipped) { startR = 7 - startR; startC = 7 - startC; }
                startTransform = `translate(${startC * 100}%, ${startR * 100}%)`;

                if (targetMove && targetMove.from === '@' && isMovedPiece) startTransform += ' scale(1.5)';
            }
            el._lastC = c;
            el._lastR = r;
            el._lastTransform = targetTransform;

            const isReverseMove = targetMove && targetMove.isReverse;

            if (animate && (positionChanged || forceAnimate) && (!isNew || forceAnimate)) {
                
                if (isReverseMove && !isMovedPiece && !isCastlingMove) {
                    el.style.transition = 'none';
                    el.style.transform = targetTransform;
                } else {
                    el.style.transition = 'none'; 
                    el.style.transform = startTransform;
                    void el.offsetWidth; 
                    
                    requestAnimationFrame(() => {
                        el.style.transition = ''; 
                        el.classList.add('animating');
                        if (isCastlingMove && !isReverseMove) el.classList.add('castling-jump');

                        el.style.transitionDuration = `${isCastlingMove ? castleDuration : moveDuration}ms`;
                        el.style.transform = targetTransform; 

                        const sqEl = this.squaresLayer.querySelector(`[data-index="${p.idx}"]`);
                        
                        if (isMovedPiece && sqEl && !isReverseMove) {
                            let wave = document.createElement('div');
                            wave.className = 'shockwave'; 
                            let waveColor = p.color === 'w' ? 'rgba(56, 189, 248, 0.6)' : 'rgba(250, 65, 45, 0.6)';
                            wave.style.cssText = `position:absolute; top:0; left:0; width:100%; height:100%; border-radius:50%; box-shadow: 0 0 20px 8px ${waveColor}; transform: scale(0); animation: shockwaveAnim 0.4s ease-out; pointer-events:none; z-index:5;`;
                            if (!document.getElementById('sw-style')) {
                                let style = document.createElement('style'); style.id = 'sw-style';
                                style.innerHTML = `@keyframes shockwaveAnim { 0% { transform: scale(0.6); opacity: 1; } 100% { transform: scale(1.4); opacity: 0; } }`;
                                document.head.appendChild(style);
                            }
                            sqEl.appendChild(wave);
                            setTimeout(() => wave.remove(), 400);
                        }

                        el.dataset.animTimeout = setTimeout(() => {
                            el.classList.remove('animating', 'castling-jump');
                            el.style.transition = 'none';
                            el.style.transitionDuration = ''; 
                        }, isCastlingMove ? castleDuration + 50 : moveDuration + 50);
                    });
                }

            } else {
                el.style.transition = 'none';
                el.style.transform = targetTransform;
            }
            if (showMangaTail && (isMovedPiece || isCastlingMove) && targetMove && targetMove.from !== '@' && !isReverseMove) {
                const dx = (c - startC); const dy = (r - startR);
                const dist = Math.sqrt(dx*dx + dy*dy);
                
                if (dist > 0.5) {
                    const activeDuration = animate ? (isCastlingMove ? castleDuration : moveDuration) : 250;
                    
                    el.style.setProperty('--tail-length-scale', dist);
                    el.style.setProperty('--move-angle', `${Math.atan2(dy, dx)}rad`);
                    el.style.setProperty('--anim-duration', `${activeDuration}ms`);
                    
                    el.getBoundingClientRect();
                    el.classList.add('manga-tail'); 
                    
                    el.dataset.tailTimeout = setTimeout(() => {
                        el.classList.remove('manga-tail');
                        el.style.removeProperty('--tail-length-scale');
                        el.style.removeProperty('--move-angle');
                        el.style.removeProperty('--anim-duration');
                    }, activeDuration + 50);
                }
            }
        });
    
        if (typeof this.renderArrows === 'function') this.renderArrows();
        if(document.getElementById('fenDisplay') && this.#game.currentNode) document.getElementById('fenDisplay').innerText = this.#game.currentNode.fen;
        const resignBtn = document.getElementById('resignBtn');
        if (resignBtn) {
            const isPlaying = this.#game && (this.#game.mode === 'local' || this.#game.mode === 'bot') && !this.#game.gameOver;
            resignBtn.style.display = isPlaying ? 'inline-block' : 'none';
        }
        if (this.#game && this.#game.engine && typeof this.#game.engine.pocket === 'function') {
            if (typeof this.renderPockets === 'function') this.renderPockets(this.#game.engine.pocket());
        }
        if (typeof this.renderSpellBar === 'function') {
            this.renderSpellBar();
        }
        if (typeof this.redrawGhostPiece === 'function') this.redrawGhostPiece();
    }
renderExternalCoords() {
        let layer = document.getElementById('external-coords-layer');
        if (!layer) {
            layer = document.createElement('div'); layer.id = 'external-coords-layer';
            layer.style.cssText = "position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:5;";
            this.boardWrapper.appendChild(layer);
        }
        layer.innerHTML = '';
        for (let r = 0; r < 8; r++) {
            const val = this.flipped ? (r + 1) : (8 - r);
            const el = document.createElement('div'); el.innerText = val;
            el.style.cssText = `position:absolute; left:-25px; top:${r * 12.5}%; height:12.5%; width:20px; display:flex; align-items:center; justify-content:flex-end; font-size:13px; color:#bbb; font-weight:bold;`;
            layer.appendChild(el);
        }
        for (let c = 0; c < 8; c++) {
            const val = this.flipped ? FILES[7 - c] : FILES[c];
            const el = document.createElement('div'); el.innerText = val;
            el.style.cssText = `position:absolute; bottom:-25px; left:${c * 12.5}%; width:12.5%; height:20px; display:flex; align-items:flex-start; justify-content:center; font-size:13px; color:#bbb; font-weight:bold;`;
            layer.appendChild(el);
        }
    }
animateToStartPosition(targetFen, previousBoard, onCompleteCallback) {
        if (typeof previousBoard === 'function') {
            onCompleteCallback = previousBoard;
            previousBoard = this.#game ? this.#game.board : null;
        }
        
        const piecesLayer = this.piecesLayer;
        if (!piecesLayer || !targetFen) {
            if (onCompleteCallback) onCompleteCallback();
            return;
        }

        // Prevent overlapping animations if called rapidly
        if (this._startAnimTimeout) {
            clearTimeout(this._startAnimTimeout);
            this._startAnimTimeout = null;
        }

        // Lock `renderBoard` from interfering while we handle the DOM manually
        this._isExecutingMove = true;

        // 1. Parse the Target FEN
        const targets = [];
        const fenBoard = targetFen.split(' ')[0];
        const rows = fenBoard.split('/');
        for (let r = 0; r < 8; r++) {
            let c = 0;
            for (let i = 0; i < rows[r].length; i++) {
                const char = rows[r][i];
                if (/\d/.test(char)) {
                    c += parseInt(char, 10);
                } else if (char === '~') {
                    continue; // Skip variant modifiers
                } else if (char === '*') {
                    targets.push({ type: 'duck', color: 'none', r, c, assigned: false });
                    c++;
                } else {
                    const color = (char === char.toUpperCase()) ? 'w' : 'b';
                    targets.push({ type: char.toLowerCase(), color, r, c, assigned: false });
                    c++;
                }
            }
        }

        // 2. Map current DOM elements with ROBUST type detection
        const currentPieces = [];
        Array.from(piecesLayer.querySelectorAll('.piece')).forEach(el => {
            // Forcefully cancel any lingering CSS/JS animations on these nodes
            el.getAnimations().forEach(a => a.cancel());
            el.style.opacity = '1';

            const id = el.dataset.id;
            const logicalPiece = previousBoard ? previousBoard.find(p => p && p.id === id) : null;
            
            let detectedType = logicalPiece ? logicalPiece.type : '';
            if (!detectedType) {
                const classes = Array.from(el.classList);
                if (classes.includes('duck')) detectedType = 'duck';
                else {
                    const found = classes.find(cls => /^[pnbrqkPNBRQK]$/.test(cls));
                    detectedType = found ? found.toLowerCase() : '';
                }
            }

            let physC = 0, physR = 0;
            const transform = el.style.transform;
            const match = transform.match(/translate\(([-\d.]+)%,\s*([-\d.]+)%\)/);
            if (match) {
                physC = Math.round(parseFloat(match[1]) / 100);
                physR = Math.round(parseFloat(match[2]) / 100);
                if (this.flipped) { physC = 7 - physC; physR = 7 - physR; }
            }

            currentPieces.push({
                el, id, r: physR, c: physC,
                type: detectedType,
                color: logicalPiece ? logicalPiece.color : (el.classList.contains('piece-w') ? 'w' : (el.classList.contains('piece-none') ? 'none' : 'b')),
                assigned: false
            });
        });

        const animations = [];

        // 3. MATCHING LOGIC: Priority 1 - Exact Position (Stay Put)
        targets.forEach(target => {
            const exact = currentPieces.find(p => 
                !p.assigned && p.type === target.type && p.color === target.color && 
                p.c === target.c && p.r === target.r
            );
            if (exact) { exact.assigned = true; target.assigned = true; }
        });

        // 4. MATCHING LOGIC: Priority 2 - Global Shortest Distance
        let potentialMoves = [];
        targets.forEach((target, tIdx) => {
            if (target.assigned) return;
            currentPieces.forEach((piece, pIdx) => {
                if (piece.assigned || piece.type !== target.type || piece.color !== target.color) return;
                const dist = Math.abs(piece.c - target.c) + Math.abs(piece.r - target.r);
                potentialMoves.push({ tIdx, pIdx, dist });
            });
        });

        potentialMoves.sort((a, b) => a.dist - b.dist);

        potentialMoves.forEach(move => {
            const target = targets[move.tIdx];
            const piece = currentPieces[move.pIdx];
            if (!target.assigned && !piece.assigned) {
                piece.assigned = true;
                target.assigned = true;
                animations.push({ el: piece.el, r: target.r, c: target.c });
            }
        });

        // 5. EXECUTE ANIMATIONS & CLEANUP
        const duration = 300;
        animations.forEach(anim => {
            let tC = anim.c, tR = anim.r;
            if (this.flipped) { tC = 7 - tC; tR = 7 - tR; }
            const targetTransform = `translate(${tC * 100}%, ${tR * 100}%)`;

            anim.el.animate([
                { transform: anim.el.style.transform },
                { transform: targetTransform }
            ], { duration, easing: 'ease-in-out', fill: 'forwards' }).onfinish = () => {
                anim.el.style.transform = targetTransform;
            };
        });

        // Fade out pieces that weren't assigned
        currentPieces.forEach(p => {
            if (!p.assigned) {
                p.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
            }
        });

        // Spawn and fade in new missing pieces
        targets.filter(t => !t.assigned).forEach(item => {
            const el = document.createElement('div');
            const typeClass = item.type === 'duck' ? 'duck' : item.type.toUpperCase();
            el.className = `piece piece-${item.color} ${typeClass}`;
            el.style.width = '12.5%'; el.style.height = '12.5%'; el.style.position = 'absolute';
            
            const content = this.getPieceHTML({ color: item.color, type: item.type === 'duck' ? 'duck' : item.type.toUpperCase() });
            if (content) {
                el.innerHTML = content.trim().startsWith('<svg') 
                    ? `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(content.trim())}" style="width:100%;height:100%;display:block;pointer-events:none;">`
                    : content;
            }

            let tC = item.c; let tR = item.r;
            if (this.flipped) { tC = 7 - tC; tR = 7 - tR; }
            el.style.transform = `translate(${tC * 100}%, ${tR * 100}%)`;
            el.style.opacity = '0';
            piecesLayer.appendChild(el);

            el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, delay: 50, fill: 'forwards' })
              .onfinish = () => { el.style.opacity = '1'; };
        });

        // 6. SYNC RENDER CYCLE
        this._startAnimTimeout = setTimeout(() => {
            this._isExecutingMove = false;
            piecesLayer.innerHTML = ''; 
            
            if (onCompleteCallback) onCompleteCallback();
        }, duration + 10);
    }
updateHistory(force = false) {
        const canEdit = this.#game.isAnalysisMode || this.#game.mode === 'editor';
        this.togglePgnEditing(canEdit);
        if (force) {
            this._lastTreeSize = -1;
            this.isHistoryUpdatePending = false; 
        }

        if (this.isHistoryUpdatePending) return;
        this.isHistoryUpdatePending = true;
        
        const commentBox = document.getElementById('commentaryBox');
        if (commentBox && this.#game && this.#game.currentNode) {
            if (commentBox.dataset.activeNodeId !== this.#game.currentNode.id) {
                let txt = this.#game.currentNode.comment || "";
                if (!txt && document.activeElement !== commentBox) txt = "Click to add comment...";
                commentBox.innerText = txt;
                commentBox.dataset.activeNodeId = this.#game.currentNode.id;
            }
        }
        
        requestAnimationFrame(() => {
            try {
                if (typeof this.renderHistoryImmediate === 'function') this.renderHistoryImmediate();
                if (typeof this.renderECO === 'function') this.renderECO();
            } catch (err) {
                console.error("History Render Error:", err);
            } finally {
                this.isHistoryUpdatePending = false;
            }
        });
        if (typeof this.applyHideNextMoves === 'function') {
            this.applyHideNextMoves();
        }
    }

renderECO() {
        if (!this.#game) return;
        let openingBox = document.getElementById('live-opening-box');
        
        if (!openingBox) {
            const sheet = document.getElementById('moveHistory');
            if (sheet && sheet.parentElement) {
                openingBox = document.createElement('div');
                openingBox.id = 'live-opening-box';
                openingBox.style.padding = '10px 15px';
                openingBox.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
                openingBox.style.borderBottom = '1px solid #333';
                openingBox.style.fontSize = '14px';
                openingBox.style.display = 'none'; 
                sheet.parentElement.insertBefore(openingBox, sheet);
            }
        }
        if (!openingBox) return;

        if (['puzzle', 'editor'].includes(this.#game.mode)) {
            openingBox.style.display = 'none';
            return;
        }

        const opening = typeof this.#game.getCurrentOpening === 'function' ? this.#game.getCurrentOpening() : null;

        if (opening) {
            openingBox.style.display = 'block';
            openingBox.innerHTML = `<div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #e2e8f0; font-weight: 500;" title="${opening.name}"><span style="color: #facc15; margin-right: 5px;">${opening.eco}</span> ${opening.name}</div>`;
        } else {
            openingBox.style.display = 'none';
        }
    }
scrollToActiveMove() {
        const container = document.getElementById('moveHistory'); 
        if (!container) return;
        const activeEl = container.querySelector('.active');
        if (!activeEl) return;
        const containerRect = container.getBoundingClientRect();
        const elRect = activeEl.getBoundingClientRect();
        const scaleY = containerRect.height / container.offsetHeight || 1;
        const visibleRelativeTop = elRect.top - containerRect.top;
        const unscaledRelativeTop = visibleRelativeTop / scaleY;
        const centerOffset = (container.clientHeight / 2) - (activeEl.offsetHeight / 2);
        container.scrollTop += (unscaledRelativeTop - centerOffset);
    }
getNagInfo(nag) {
        if (!nag) return null;
        let nags = nag.toString().split(',').map(n => n.trim().replace('$', ''));
        let v = nags.find(n => parseInt(n) >= 1 && parseInt(n) <= 19) || nags[0]; 
        
        switch(v) {
            // Move Qualities
            case'1':case'!': return { symbol:'!', cls:'ind-1', color:'#5c8bb0', borderColor:'#28a2e7', type:'good', textColor:'#ffffff'};
            case'2':case'?': return { symbol:'?', cls:'ind-2', color:'#ffa700', borderColor:'#af5205', type:'mistake', textColor:'#ffffff'};
            case'3':case'!!': return { symbol:'!!', cls:'ind-3', color:'#26c2a3', borderColor:'#09e9ed', type:'brilliant', textColor:'#ffffff'};
            case'4':case'??': return { symbol:'??', cls:'ind-4', color:'#fa412d', borderColor:'#892c12', type:'blunder', textColor:'#ffffff'};
            case'5':case'!?': return { symbol:'!?', cls:'ind-5', color:'#b369f2', borderColor:'#bd09ed', type:'interesting', textColor:'#ffffff'};
            case'6':case'?!': return { symbol:'?!', cls:'ind-6', color:'#f7c045', borderColor:'#f5d91d', type:'inaccuracy', textColor:'#ffffff'};
            case'7': return { symbol:'!', cls:'ind-1', color:'#96bc4b', borderColor:'#6c8a32', type:'excellent', textColor:'#ffffff'};
            case'8': return { symbol:'!', cls:'ind-1', color:'#5c8bb0', borderColor:'#3a6280', type:'great', textColor:'#ffffff'};
            case'9': return { symbol:'X', cls:'ind-2', color:'#ff7769', borderColor:'#c75446', type:'miss', textColor:'#ffffff'};
            
            // Evaluations: White advantage receives black text (#000000), Black advantage receives white text (#ffffff)
            case'10':case'=': return { symbol:'=', color:'#e2e8f0', borderColor:'#cbd5e1', type:'eval_eq', textColor:'#000000'}; 
            case'13':case'∞': return { symbol:'∞', color:'#e2e8f0', borderColor:'#cbd5e1', type:'eval_eq', textColor:'#000000'}; 
            case'14':case'⩲':case'+=': return { symbol:'⩲', color:'#ffffff', borderColor:'#cbd5e1', type:'eval_w', textColor:'#000000'}; 
            case'15':case'⩱':case'=+': return { symbol:'⩱', color:'#1e293b', borderColor:'#0f172a', type:'eval_b', textColor:'#ffffff'}; 
            case'16':case'±':case'+/-': return { symbol:'±', color:'#ffffff', borderColor:'#cbd5e1', type:'eval_w', textColor:'#000000'}; 
            case'17':case'∓':case'-/+': return { symbol:'∓', color:'#1e293b', borderColor:'#0f172a', type:'eval_b', textColor:'#ffffff'}; 
            case'18':case'+-': return { symbol:'+-', color:'#ffffff', borderColor:'#cbd5e1', type:'eval_w', textColor:'#000000'}; 
            case'19':case'-+': return { symbol:'-+', color:'#1e293b', borderColor:'#0f172a', type:'eval_b', textColor:'#ffffff'}; 
            default: return null;
        }
    }
updateEditorState() {
        if (!this.#game || this.#game.mode !== 'editor') return;
        if (typeof this.#game.syncEngineToBoard === 'function') {
            this.#game.syncEngineToBoard();
        }
        
        // Re-render the board to reflect any changes
        this.renderBoard(false);
    }
updateInlineEval(node) {
        if (!node || !node.id) return;
        const moveSpan = document.querySelector(`[data-id="${node.id}"]`);
        if (!moveSpan) return;

        const existingEval = moveSpan.querySelector('.move-eval');
        if (existingEval) existingEval.remove();

        const evalData = this.getEvalData(node);
        if (evalData) {
            let evSpan = document.createElement('span');
            evSpan.className = evalData.className;
            evSpan.innerText = evalData.text;
            
            if (moveSpan.classList.contains('var-move') || moveSpan.classList.contains('tree-move')) {
                evSpan.style.fontSize = "0.85em"; evSpan.style.marginLeft = "3px";
            } else {
                evSpan.style.marginLeft = "4px";
            }
            moveSpan.appendChild(evSpan);
        }
    }
getEvalData(node) {
        if (this?.settings?.showEval === false) return null;
        if (this.#game && this.#game.isPlayingLiveGame) return null;

        let activeScore = node.localEvalScore !== undefined ? node.localEvalScore : node.evalScore;
        
        if (activeScore !== undefined) {
            let className = "move-eval"; let text = "";
            if (Math.abs(activeScore) >= 90000) { 
                let isMateForWhite = activeScore > 0;
                let moves = 100000 - Math.abs(activeScore); 
                text = (isMateForWhite ? "M" : "-M") + Math.max(0, moves);
                className += (isMateForWhite ? " positive" : " negative");
            } else {
                let v = activeScore / 100;
                text = (v > 0 ? "+" : "") + v.toFixed(2);
                className += (v > 0 ? " positive" : (v < 0 ? " negative" : ""));
            }
            return { text, className };
        }

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
        for (let i = 0; i < node.children.length; i++) count += this.getTreeSize(node.children[i]);
        return count;
    }
refreshLiveDot(node) {
        if (!node || !node.id) return;
        const elements = document.querySelectorAll(`[data-id="${node.id}"]`);
        
        elements.forEach(el => {
            const oldDot = el.querySelector('.annotation-dot');
            if (oldDot) oldDot.remove();
            
            const dotColor = this.getAnnotationDotColor(node);
            if (dotColor) {
                let dot = document.createElement('span');
                dot.className = 'annotation-dot';
                dot.style.cssText = `display:inline-block; width:6px; height:6px; background-color:${dotColor}; border-radius:50%; margin-left:4px; box-shadow:0 0 5px ${dotColor};`;
                const targetContainer = el.querySelector('.main-wrap') || el;
                const evalSpan = targetContainer.querySelector('span[class*="eval-"]');
                if (evalSpan) targetContainer.insertBefore(dot, evalSpan);
                else targetContainer.appendChild(dot);
            }
        });
    }
createMoveSpanSafe(node) {
        if (!node.id) node.id = 'n_' + Math.random().toString(36).substr(2, 9);
        const state = this.#game ? this.#game.getReader() : null;
        const isActive = (this.#game && this.#game.currentNode === node) || (state && state.activeNodeId && node.id === state.activeNodeId);

        let span = document.createElement('span');
        span.className = `move-ply ${isActive ? 'active' : ''}`;
        span.dataset.id = node.id;
        span.style.cssText = "display:inline-flex; align-items:center; vertical-align:middle; cursor:pointer;";
        
        const moveColorStr = node.fen.split(' ')[1] === 'w' ? 'b' : 'w';
        span.dataset.color = moveColorStr;

        let nags = node.nag ? node.nag.toString().split(',') : [];
        let primaryInfo = null; let symbols = [];

        nags.forEach(n => {
            const info = this.getNagInfo(n.trim());
            if (info) {
                symbols.push(info);
                if (['good', 'mistake', 'brilliant', 'blunder', 'interesting', 'inaccuracy', 'excellent', 'great', 'miss'].includes(info.type)) primaryInfo = info;
            }
        });

        const moveColor = primaryInfo ? primaryInfo.color : 'var(--text-main)';
        if (primaryInfo && primaryInfo.type) span.dataset.nag = primaryInfo.type;

        let txt = document.createElement('span');
        txt.innerText = node.moveSan;
        if (primaryInfo) { txt.style.color = moveColor; txt.style.fontWeight = '700'; }
        span.appendChild(txt);

        symbols.forEach(info => {
            let nSpan = document.createElement('span');
            nSpan.innerText = info.symbol; 
            // Prevent dark evaluation colors from hiding on the dark PGN background
            nSpan.style.color = info.type.startsWith('eval') ? '#e2e8f0' : info.color;
            nSpan.style.fontWeight = 'bold'; 
            nSpan.style.marginLeft = '2px';
            span.appendChild(nSpan);
        });

        if (node.isBook) {
            let icon = document.createElement('span'); icon.className = 'eval-icon';
            const iconColor = primaryInfo ? primaryInfo.color : '#a87c53';
            icon.style.cssText = "display:inline-flex; align-items:center; margin-left:4px;"; icon.style.color = iconColor;
            icon.innerHTML = typeof ICON_BOOK_SVG !== 'undefined' ? ICON_BOOK_SVG : 'B';
            let svg = icon.querySelector('svg');
            if (svg) { svg.style.fill = iconColor; svg.style.width = '14px'; svg.style.height = '14px'; }
            span.appendChild(icon);
        }

        const dotColor = this.getAnnotationDotColor(node);
        if (dotColor) {
            let dot = document.createElement('span'); dot.className = 'annotation-dot'; 
            dot.style.cssText = `display:inline-block; width:6px; height:6px; background-color:${dotColor}; border-radius:50%; margin-left:4px; box-shadow:0 0 5px ${dotColor};`;
            span.appendChild(dot);
        }

        const evalData = this.getEvalData(node);
        if (evalData) {
            let ev = document.createElement('span'); ev.className = evalData.className; ev.innerText = evalData.text; ev.style.marginLeft = "4px";
            span.appendChild(ev);
        }

        const targetNodeId = node.id;
        let capturedRef = node; 

        span.onmousedown = (e) => {
            if (e.button !== 0) return; e.preventDefault(); e.stopPropagation();
            if (this.#game.goToNodeId(targetNodeId)) {
                const freshState = this.#game.getReader();
                this.renderBoard(false); this.updateHistory();  this.renderArrows();
                if (this.updateClocks) this.updateClocks();
                if (freshState.mode !== 'play' && this.#game.updateStockfish) this.#game.updateStockfish();
            }
        };

        span.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); this.showAnnotationPopup(e, capturedRef); };
        return span;
    }
renderTreeRecursive(node, container, moveNum) {
        if (!node.children || node.children.length === 0) return;
        
        let mainIdx = 0; 
        let mainChild = node.children[mainIdx];
        
        // Check if this node is the Move following a Spell parent
        let isSpellMove = node.isSpell; 
        let parentFen = node.fen || (typeof INITIAL_FEN !== 'undefined' ? INITIAL_FEN : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
        let fenParts = parentFen.split(' ');
        let moveColor = fenParts[1] || 'w';
        let mNum = parseInt(fenParts[5] || 1, 10);

        let row = container.lastElementChild;
        let targetCell;

        // IF it's a spell-move, we don't need a new row or move-num, 
        // we use the existing row/cell from the previous render step.
        if (isSpellMove) {
            // Find the cell we just populated in the previous step
            targetCell = moveColor === 'w' ? row.querySelector('.white-cell') : row.querySelector('.black-cell');
        } else {
            // Standard Row/Cell creation logic
            let isNewRowNeeded = true;
            if (row && row.classList.contains('move-row') && row.dataset.mNum == mNum) {
                isNewRowNeeded = false;
            }

            if (isNewRowNeeded) {
                row = document.createElement('div'); 
                row.className = 'move-row';
                row.dataset.mNum = mNum;
                let num = document.createElement('div'); 
                num.className = 'move-num'; 
                num.innerText = mNum + "."; 
                
                let wCell = document.createElement('div'); wCell.className = 'move-cell white-cell';
                let bCell = document.createElement('div'); bCell.className = 'move-cell black-cell';

                row.appendChild(num); row.appendChild(wCell); row.appendChild(bCell);
                container.appendChild(row);
            }
            targetCell = moveColor === 'w' ? row.querySelector('.white-cell') : row.querySelector('.black-cell');
        }
        
        let moveUI = typeof this.createMoveSpanSafe === 'function' ? this.createMoveSpanSafe(mainChild) : this.createPlyDiv(mainChild);
        targetCell.appendChild(moveUI);

        let cleanComment = mainChild.comment ? mainChild.comment.replace(/\[%(cal|csl|clk|emt)[^\]]+\]/g,"").trim() : "";
        let hasComment = cleanComment.length > 0;
        let hasVariations = node.children.length > 1;

        if (hasComment || hasVariations) {
            let isHidden = mainChild.isCollapsed === true;
            let toggleBtn = document.createElement('div'); toggleBtn.className = 'full-width-item variation-toggle';
            toggleBtn.innerHTML = isHidden 
                ? "<span style='cursor:pointer; color:#888; font-size:12px; margin-left: 10px; user-select:none;'>▶ Show Annotations</span>"
                : "<span style='cursor:pointer; color:#888; font-size:12px; margin-left: 10px; user-select:none;'>▼ Hide Annotations</span>";
            
            let annContainer = document.createElement('div'); annContainer.className = 'annotations-wrapper';
            annContainer.style.display = isHidden ? 'none' : 'block';

            toggleBtn.onclick = (e) => {
                e.stopPropagation(); mainChild.isCollapsed = !mainChild.isCollapsed; const hidden = mainChild.isCollapsed;
                annContainer.style.display = hidden ? 'none' : 'block';
                toggleBtn.innerHTML = hidden 
                    ? "<span style='cursor:pointer; color:#888; font-size:12px; margin-left: 10px; user-select:none;'>▶ Show Annotations</span>"
                    : "<span style='cursor:pointer; color:#888; font-size:12px; margin-left: 10px; user-select:none;'>▼ Hide Annotations</span>";
            };
            
            container.appendChild(toggleBtn); container.appendChild(annContainer);

            if (hasComment) {
                let commentDiv = document.createElement('div'); commentDiv.className ='full-width-item';
                let commentSpan = document.createElement('span'); commentSpan.className ='inline-comment';
                commentSpan.dataset.nodeId = mainChild.id; commentSpan.innerText = cleanComment;
                commentDiv.appendChild(commentSpan); annContainer.appendChild(commentDiv);
            }

            if (hasVariations) {
                node.children.forEach((child, i) => {
                    if (i !== mainIdx) { 
                        let varBlock = document.createElement('div'); varBlock.className ='variation-block';
                        varBlock.style.cssText = "margin-left: 15px; border-left: 2px solid #444; padding-left: 5px; margin-bottom: 5px;";
                        let line = document.createElement('div'); line.className ='var-line';
                        this.renderVariationLine(child, line);
                        varBlock.appendChild(line); annContainer.appendChild(varBlock);
                    }
                });
            }
        }
        this.renderTreeRecursive(mainChild, container, moveNum + 1);
    }
renderTreeVertical(node, container) {
        if (!node.children.length) return;
        let line = document.createElement('div'); line.className = 'tree-line';
        container.appendChild(line);

        let curr = node.children[0]; 
        let isFirstInLine = true;
        let lastColor = null; // Track consecutive colors for Spell Chess
        const state = this.#game ? this.#game.getReader() : null;

        while (curr) {
            let parentFen = curr.parent ? curr.parent.fen : (typeof INITIAL_FEN !== 'undefined' ? INITIAL_FEN : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
            let fenParts = parentFen.split(' ');
            let moveColor = fenParts[1] || 'w';
            let mNum = parseInt(fenParts[5] || 1, 10);

            let moveText = "";
            if (moveColor === 'w') {
                // White always gets a number if the color just switched to White, or if it's a new line
                if (moveColor !== lastColor || isFirstInLine) moveText = `${mNum}.`;
            } else {
                // Black ONLY gets a number if it is forced to start a brand new line
                if (isFirstInLine) moveText = `${mNum}...`;
            }
            lastColor = moveColor;

            if (moveText) {
                let idxSpan = document.createElement('span'); idxSpan.className = 'tree-index'; idxSpan.innerText = moveText;
                line.appendChild(idxSpan);
            }

            let moveSpan = document.createElement('span');
            if (!curr.id) curr.id = 'n_' + Math.random().toString(36).substr(2, 9);
            const isActive = (this.#game && this.#game.currentNode === curr) || (state && state.activeNodeId && curr.id === state.activeNodeId);
            
            moveSpan.className = `tree-move ${isActive ? 'active' : ''}`; moveSpan.dataset.id = curr.id;

            if (curr.nag) {
                let nags = curr.nag.toString().split(','); let primaryInfo = null; let symbols = [];
                nags.forEach(n => {
                    const info = this.getNagInfo(n.trim());
                    if (info) { symbols.push(info); if (['good', 'mistake', 'brilliant', 'blunder', 'interesting', 'inaccuracy', 'excellent', 'great', 'miss'].includes(info.type)) primaryInfo = info; }
                });
                if (primaryInfo) { moveSpan.classList.add(`nag-${primaryInfo.type}`); moveSpan.style.color = primaryInfo.color; }
                moveSpan.innerText = curr.moveSan; 
                symbols.forEach(info => {
                    let nagSpan = document.createElement('span'); nagSpan.className = 'nag-glyph'; nagSpan.innerText = info.symbol;
                    nagSpan.style.color = info.color; nagSpan.style.marginLeft = "2px"; nagSpan.style.fontWeight = "bold";
                    moveSpan.appendChild(nagSpan);
                });
            } else moveSpan.innerText = curr.moveSan;

            if (curr.isBook) {
                const bookIcon = document.createElement('span'); bookIcon.className = 'tree-book-icon';
                bookIcon.innerHTML = typeof ICON_BOOK_SVG !== 'undefined' ? ICON_BOOK_SVG : '📖';
                let bookColor = curr.nag ? (this.getNagInfo(curr.nag)?.color || '#A87C53') : '#A87C53';
                bookIcon.style.cssText = `display:inline-flex; align-items:center; justify-content:center; width:1em; height:1em; margin-left:4px; vertical-align:middle; color:${bookColor};`;
                let svg = bookIcon.querySelector('svg');
                if (svg) { svg.style.fill = 'currentColor'; svg.style.width = '100%'; svg.style.height = '100%'; }
                moveSpan.appendChild(bookIcon);
            }

            const dotColor = this.getAnnotationDotColor(curr);
            if (dotColor) {
                let dot = document.createElement('span'); dot.className = 'annotation-dot'; 
                dot.style.cssText = `display:inline-block; width:6px; height:6px; background-color:${dotColor}; border-radius:50%; margin-left:4px; box-shadow:0 0 5px ${dotColor};`;
                moveSpan.appendChild(dot);
            }

            const evalData = this.getEvalData(curr);
            if (evalData) {
                let evalSpan = document.createElement('span'); evalSpan.className = evalData.className; evalSpan.innerText = evalData.text;
                moveSpan.appendChild(evalSpan);
            }

            const targetNodeId = curr.id; let capturedRef = curr; 

            moveSpan.onmousedown = (e) => {
                if (e.button !== 0) return; e.preventDefault(); e.stopPropagation();
                if (this.#game.goToNodeId(targetNodeId)) {
                    const freshState = this.#game.getReader();
                    this.renderBoard(false); this.updateHistory(); this.renderArrows();
                    if (freshState.mode !== 'play' && this.#game.updateStockfish) this.#game.updateStockfish();
                }
            };
            moveSpan.oncontextmenu = (e) => { e.preventDefault(); this.showAnnotationPopup(e, capturedRef); };

            line.appendChild(moveSpan); isFirstInLine = false;

            let cleanComment = curr.comment ? curr.comment.replace(/\[%(cal|csl|clk|emt)[^\]]+\]/g, "").trim() : "";
            let hasComment = cleanComment.length > 0;
            let siblings = curr.parent.children; let hasVariations = siblings.length > 1;

            if (hasComment || hasVariations) {
                let isHidden = curr.isCollapsed === true;
                let toggleBtn = document.createElement('span'); toggleBtn.innerHTML = isHidden ? " ▶ " : " ▼ ";
                toggleBtn.style.cssText = "cursor:pointer; color:#888; font-size:10px; margin-left:6px; user-select:none;";
                
                let annContainer = document.createElement('div'); annContainer.className = 'nested-variation';
                annContainer.style.display = isHidden ? 'none' : 'block';
                
                toggleBtn.onclick = (e) => {
                    e.stopPropagation(); capturedRef.isCollapsed = !capturedRef.isCollapsed; const hidden = capturedRef.isCollapsed;
                    annContainer.style.display = hidden ? 'none' : 'block'; toggleBtn.innerHTML = hidden ? " ▶ " : " ▼ ";
                };
                
                line.appendChild(toggleBtn);

                if (hasComment) {
                    let cSpan = document.createElement('span'); cSpan.className = 'tree-comment'; cSpan.dataset.nodeId = curr.id;
                    cSpan.style.display = 'block'; cSpan.style.marginTop = '2px'; cSpan.innerText = `// ${cleanComment}`;
                    annContainer.appendChild(cSpan);
                }

                if (hasVariations) {
                    siblings.forEach((sibling, i) => {
                        if (i !== 0) { this.renderTreeVerticalRecursiveSingle(sibling, annContainer); }
                    });
                }

                container.appendChild(annContainer);
                line = document.createElement('div'); line.className = 'tree-line'; container.appendChild(line);
                isFirstInLine = true;
            }

            if (curr.children.length > 0) curr = curr.children[0]; 
            else curr = null;
        }
    }
renderTreeVerticalRecursiveSingle(node, container) {
        let line = document.createElement('div'); line.className = 'tree-line';
        container.appendChild(line);

        let curr = node; let isFirstInLine = true;
        let lastColor = null;
        const state = this.#game ? this.#game.getReader() : null;

        while (curr) {
            let parentFen = curr.parent ? curr.parent.fen : (typeof INITIAL_FEN !== 'undefined' ? INITIAL_FEN : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
            let fenParts = parentFen.split(' ');
            let moveColor = fenParts[1] || 'w';
            let mNum = parseInt(fenParts[5] || 1, 10);

            let moveText = "";
            if (moveColor === 'w') {
                if (moveColor !== lastColor || isFirstInLine) moveText = `${mNum}.`;
            } else {
                if (isFirstInLine) moveText = `${mNum}...`;
            }
            lastColor = moveColor;

            if (moveText) {
                let idxSpan = document.createElement('span'); idxSpan.className = 'tree-index'; idxSpan.innerText = moveText;
                line.appendChild(idxSpan);
            }

            let moveSpan = document.createElement('span');
            if (!curr.id) curr.id = 'n_' + Math.random().toString(36).substr(2, 9);
            const isActive = (this.#game && this.#game.currentNode === curr) || (state && state.activeNodeId && curr.id === state.activeNodeId);
            
            moveSpan.className = `tree-move ${isActive ? 'active' : ''}`; moveSpan.dataset.id = curr.id;
            
            if (curr.nag) {
                let nags = curr.nag.toString().split(','); let primaryInfo = null; let symbols = [];
                nags.forEach(n => {
                    const info = this.getNagInfo(n.trim());
                    if (info) { symbols.push(info); if (['good', 'mistake', 'brilliant', 'blunder', 'interesting', 'inaccuracy', 'excellent', 'great', 'miss'].includes(info.type)) primaryInfo = info; }
                });
                if (primaryInfo) { moveSpan.classList.add(`nag-${primaryInfo.type}`); moveSpan.style.color = primaryInfo.color; }
                moveSpan.innerText = curr.moveSan; 
                symbols.forEach(info => {
                    let nagSpan = document.createElement('span'); nagSpan.className = 'nag-glyph'; nagSpan.innerText = info.symbol;
                    // Prevent dark evaluation colors from hiding on the dark PGN background
                    nagSpan.style.color = info.type.startsWith('eval') ? '#e2e8f0' : info.color;
                    nagSpan.style.marginLeft = "2px"; nagSpan.style.fontWeight = "bold";
                    moveSpan.appendChild(nagSpan);
                });
            } else moveSpan.innerText = curr.moveSan;

            if (curr.isBook) {
                const bookIcon = document.createElement('span'); bookIcon.className = 'tree-book-icon';
                bookIcon.innerHTML = typeof ICON_BOOK_SVG !== 'undefined' ? ICON_BOOK_SVG : 'B';
                let bookColor = curr.nag ? (this.getNagInfo(curr.nag)?.color || '#A87C53') : '#A87C53';
                bookIcon.style.cssText = `display:inline-flex; align-items:center; justify-content:center; width:1em; height:1em; margin-left:4px; vertical-align:middle; color:${bookColor};`;
                let svg = bookIcon.querySelector('svg');
                if (svg) { svg.style.fill = 'currentColor'; svg.style.width = '100%'; svg.style.height = '100%'; }
                moveSpan.appendChild(bookIcon);
            }
            
            const dotColor = this.getAnnotationDotColor(curr);
            if (dotColor) {
                let dot = document.createElement('span'); dot.className = 'annotation-dot'; 
                dot.style.cssText = `display:inline-block; width:6px; height:6px; background-color:${dotColor}; border-radius:50%; margin-left:4px; box-shadow:0 0 5px ${dotColor};`;
                moveSpan.appendChild(dot);
            }

            const evalData = this.getEvalData(curr);
            if (evalData) {
                let evalSpan = document.createElement('span'); evalSpan.className = evalData.className; evalSpan.innerText = evalData.text;
                moveSpan.appendChild(evalSpan);
            }

            const targetNodeId = curr.id; let capturedRef = curr; 

            moveSpan.onmousedown = (e) => {
                if (e.button !== 0) return; e.preventDefault(); e.stopPropagation();
                if (this.#game.goToNodeId(targetNodeId)) {
                    const freshState = this.#game.getReader();
                    this.renderBoard(true); this.updateHistory(); this.renderArrows();
                    if (freshState.mode !== 'play' && this.#game.updateStockfish) this.#game.updateStockfish();
                }
            };
            moveSpan.oncontextmenu = (e) => { e.preventDefault(); this.showAnnotationPopup(e, capturedRef); };

            line.appendChild(moveSpan); isFirstInLine = false;

            let cleanComment = curr.comment ? curr.comment.replace(/\[%(cal|csl|clk|emt)[^\]]+\]/g, "").trim() : "";
            let hasComment = cleanComment.length > 0; let hasVariations = curr.children.length > 1;

            if (hasComment || hasVariations) {
                let isHidden = curr.isCollapsed === true;
                let toggleBtn = document.createElement('span'); toggleBtn.innerHTML = isHidden ? " ▶ " : " ▼ ";
                toggleBtn.style.cssText = "cursor:pointer; color:#888; font-size:10px; margin-left:6px; user-select:none;";
                
                let annContainer = document.createElement('div'); annContainer.className = 'nested-variation';
                annContainer.style.display = isHidden ? 'none' : 'block';
                
                toggleBtn.onclick = (e) => {
                    e.stopPropagation(); capturedRef.isCollapsed = !capturedRef.isCollapsed; const hidden = capturedRef.isCollapsed;
                    annContainer.style.display = hidden ? 'none' : 'block'; toggleBtn.innerHTML = hidden ? " ▶ " : " ▼ ";
                };
                
                line.appendChild(toggleBtn);

                if (hasComment) {
                    let cSpan = document.createElement('span'); cSpan.className = 'tree-comment'; cSpan.dataset.nodeId = curr.id;
                    cSpan.style.display = 'block'; cSpan.style.marginTop = '2px'; cSpan.innerText = `// ${cleanComment}`;
                    annContainer.appendChild(cSpan);
                }

                if (hasVariations) {
                    curr.children.forEach((child, i) => {
                        if (i !== 0) { this.renderTreeVerticalRecursiveSingle(child, annContainer); }
                    });
                }

                container.appendChild(annContainer);
                line = document.createElement('div'); line.className = 'tree-line'; container.appendChild(line);
                isFirstInLine = true;
            }

            if (curr.children.length > 0) curr = curr.children[0]; 
            else curr = null;
        }
    }
renderVariationLine(node, container) {
        let curr = node; let isFirst = true; let lastColor = null; 
        const state = this.#game ? this.#game.getReader() : null;

        while (curr) {
            let parentFen = curr.parent ? curr.parent.fen : (typeof INITIAL_FEN !== 'undefined' ? INITIAL_FEN : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
            let fenParts = parentFen.split(' ');
            let moveColor = fenParts[1] || 'w';
            let mNum = parseInt(fenParts[5] || 1, 10);

            let txt = "";
            if (moveColor === 'w') {
                if (moveColor !== lastColor || isFirst) txt = `${mNum}.`;
            } else {
                if (isFirst) txt = `${mNum}...`;
            }
            lastColor = moveColor;

            let span = document.createElement('span');
            if (!curr.id) curr.id = 'n_' + Math.random().toString(36).substr(2, 9);
            const isActive = (this.#game && this.#game.currentNode === curr) || (state && state.activeNodeId && curr.id === state.activeNodeId);
            
            span.className = `var-move ${isActive ? 'active' : ''}`; 
            span.dataset.id = curr.id; 
            
            span.style.cssText = "display: inline-block; border-radius: 4px; cursor: pointer;; text-align: center;";
            
            span.innerText = txt ? `${txt} ${curr.moveSan}` : curr.moveSan;

            if (curr.nag) {
                let nags = curr.nag.toString().split(','); let primaryInfo = null; let symbols = [];
                nags.forEach(n => {
                    const info = this.getNagInfo(n.trim());
                    if (info) { symbols.push(info); if (['good', 'mistake', 'brilliant', 'blunder', 'interesting', 'inaccuracy', 'excellent', 'great', 'miss'].includes(info.type)) primaryInfo = info; }
                });
                if (primaryInfo) { span.style.color = primaryInfo.color; span.style.backgroundColor = primaryInfo.color + '20'; }
                symbols.forEach(info => {
                    let nagSpan = document.createElement('span'); nagSpan.className = 'nag-glyph'; nagSpan.innerText = info.symbol;
                    // Prevent dark evaluation colors from hiding on the dark PGN background
                    nagSpan.style.color = info.type.startsWith('eval') ? '#e2e8f0' : info.color;
                    nagSpan.style.marginLeft = "2px"; nagSpan.style.fontWeight = "bold";
                    span.appendChild(nagSpan);
                });
            }
            const dotColor = this.getAnnotationDotColor(curr);
            if (dotColor) {
                let dot = document.createElement('span'); dot.className = 'annotation-dot'; 
                dot.style.cssText = `display:inline-block; width:6px; height:6px; background-color:${dotColor}; border-radius:50%; margin-left:4px; box-shadow:0 0 5px ${dotColor};`;
                span.appendChild(dot);
            }

            const evalData = this.getEvalData(curr);
            if (evalData) {
                let evSpan = document.createElement('span'); evSpan.className = evalData.className; evSpan.style.fontSize = "0.85em";
                evSpan.style.marginLeft = "3px"; evSpan.innerText = evalData.text; span.appendChild(evSpan);
            }

            span.appendChild(document.createTextNode(" "));

            const targetNodeId = curr.id; let capturedRef = curr;

            span.onmousedown = (e) => {
                if (e.button !== 0) return; e.preventDefault(); e.stopPropagation();
                if (this.#game.goToNodeId(targetNodeId)) {
                    const freshState = this.#game.getReader();
                    this.renderBoard(false); this.updateHistory(); this.renderArrows();
                    if (freshState.mode !== 'play' && this.#game.updateStockfish) this.#game.updateStockfish();
                }
            };
            
            span.oncontextmenu = (e) => { e.preventDefault(); this.showAnnotationPopup(e, capturedRef); };

            container.appendChild(span);

            let cleanComment = curr.comment ? curr.comment.replace(/\[%(cal|csl|clk|emt)[^\]]+\]/g, "").trim() : "";
            let hasComment = cleanComment.length > 0; let hasVariations = curr.children.length > 1;

            if (hasComment || hasVariations) {
                let isHidden = capturedRef.isCollapsed === true;
                let toggleBtn = document.createElement('span'); toggleBtn.innerText = isHidden ? " [+] " : " [-] ";
                toggleBtn.style.cssText = "cursor:pointer; color:#888; font-weight:bold; font-size:0.9em; user-select:none; margin: 0 4px;";
                
                let annWrapper = document.createElement('span'); annWrapper.className = 'annotation-wrapper';
                annWrapper.style.display = isHidden ? 'none' : 'inline';
                
                toggleBtn.onclick = (e) => {
                    e.stopPropagation(); capturedRef.isCollapsed = !capturedRef.isCollapsed; const hidden = capturedRef.isCollapsed;
                    annWrapper.style.display = hidden ? 'none' : 'inline'; toggleBtn.innerText = hidden ? " [+] " : " [-] ";
                };
                
                container.appendChild(toggleBtn); container.appendChild(annWrapper);

                if (hasComment) {
                    let cSpan = document.createElement('span'); cSpan.className = 'inline-comment'; cSpan.dataset.nodeId = capturedRef.id; 
                    cSpan.innerText = ` {${cleanComment}} `; annWrapper.appendChild(cSpan);
                }

                if (hasVariations) {
                    if (hasComment) annWrapper.appendChild(document.createTextNode(" "));
                    annWrapper.appendChild(document.createTextNode("("));
                    curr.children.forEach((child, i) => {
                        if (i !== 0) { this.renderVariationLine(child, annWrapper); if (i < curr.children.length - 1) annWrapper.appendChild(document.createTextNode("; ")); }
                    });
                    annWrapper.appendChild(document.createTextNode(") "));
                }
            }

            if (curr.children.length > 0) curr = curr.children[0]; 
            else curr = null;
            isFirst = false;
        }
    }
createPlyDiv(node) {
        if (!node.id) node.id = 'n_' + Math.random().toString(36).substr(2, 9);
        const state = this.#game ? this.#game.getReader() : null;
        const isActive = (this.#game && this.#game.currentNode === node) || (state && state.activeNodeId && node.id === state.activeNodeId);
        
        let d = document.createElement('div');
        d.className = `move-ply ${isActive ? 'active' : ''}`; d.dataset.id = node.id; d.style.cssText = "position: relative; display: inline-block;"; 

        let mainWrap = document.createElement('span'); mainWrap.className = 'main-wrap';
        let nags = node.nag ? node.nag.toString().split(',') : [];
        let primaryInfo = null; let symbols = [];

        nags.forEach(n => {
            const info = this.getNagInfo(n.trim());
            if (info) { symbols.push(info); if (['good', 'mistake', 'brilliant', 'blunder', 'interesting', 'inaccuracy', 'excellent', 'great', 'miss'].includes(info.type)) primaryInfo = info; }
        });

        if (primaryInfo) { mainWrap.classList.add(`nag-${primaryInfo.type}`); mainWrap.style.color = primaryInfo.color; }
        mainWrap.appendChild(document.createTextNode(node.moveSan));
        
        symbols.forEach(info => {
            let sym = document.createElement('span'); sym.className = `nag-glyph`; sym.innerText = info.symbol;
            // Prevent dark evaluation colors from hiding on the dark PGN background
            sym.style.color = info.type.startsWith('eval') ? '#e2e8f0' : info.color;
            sym.style.marginLeft = "3px"; sym.style.fontWeight = "bold";
            mainWrap.appendChild(sym);
        });
        
        const dotColor = this.getAnnotationDotColor(node);
        if (dotColor) {
            let dot = document.createElement('span'); dot.className = 'annotation-dot'; 
            dot.style.cssText = `display:inline-block; width:6px; height:6px; background-color:${dotColor}; border-radius:50%; margin-left:4px; box-shadow:0 0 5px ${dotColor};`;
            mainWrap.appendChild(dot);
        }

        const evalData = this.getEvalData(node);
        if (evalData) {
            let evalSpan = document.createElement('span'); evalSpan.className = evalData.className; evalSpan.innerText = evalData.text; evalSpan.style.marginLeft = "4px";
            mainWrap.appendChild(evalSpan);
        }
        d.appendChild(mainWrap);

        let cleanComment = node.comment ? node.comment.replace(/\[%(cal|csl|clk|emt)[^\]]+\]/g, "").trim() : "";
        let hasComment = cleanComment.length > 0; let hasVariations = node.children && node.children.length > 1;

        if (hasComment || hasVariations) {
            let isHidden = node.isCollapsed === true;
            let toggleBtn = document.createElement('span'); toggleBtn.innerHTML = isHidden ? " ▶ " : " ▼ ";
            toggleBtn.style.cssText = "cursor:pointer; color:#888; font-size:10px; margin-left:4px;";
            
            let annContainer = document.createElement('div');
            annContainer.style.cssText = "font-size: 0.85em; padding: 4px; background: rgba(0,0,0,0.15); border-left: 2px solid #555; margin-top: 4px; white-space: normal;";
            annContainer.style.display = isHidden ? 'none' : 'block';

            toggleBtn.onclick = (e) => {
                e.stopPropagation(); node.isCollapsed = !node.isCollapsed; const hidden = node.isCollapsed;
                annContainer.style.display = hidden ? 'none' : 'block'; toggleBtn.innerHTML = hidden ? " ▶ " : " ▼ ";
            };
            
            d.appendChild(toggleBtn); d.appendChild(annContainer);

           if (hasComment) {
                let c = document.createElement('div'); c.className = 'inline-comment'; c.dataset.nodeId = node.id;     
                c.style.color = '#888'; c.style.marginBottom = hasVariations ? '4px' : '0'; c.innerText = `{ ${cleanComment} }`;
                annContainer.appendChild(c);
            }

            if (hasVariations) {
                node.children.forEach((child, i) => {
                    if (i !== 0) { 
                        let vLine = document.createElement('div'); this.renderVariationLine(child, vLine);
                        annContainer.appendChild(vLine);
                    }
                });
            }
        }

        const targetNodeId = node.id;
        d.onclick = (e) => {
            e.stopPropagation();
            if (this.#game.goToNodeId(targetNodeId)) {
                const freshState = this.#game.getReader();
                this.renderBoard(false); this.updateHistory(); this.renderArrows();
                if (freshState.mode !== 'play' && this.#game.updateStockfish) this.#game.updateStockfish();
            }
        };
        d.oncontextmenu = (e) => { e.preventDefault(); this.showAnnotationPopup(e, node); };
        return d;
    }
updateEvalBar(type = this._lastEvalType, val = this._lastEvalVal) {
        if (type !== undefined) this._lastEvalType = type;
        if (val !== undefined) this._lastEvalVal = val;
        
        type = this._lastEvalType;
        val = this._lastEvalVal;

        const container = document.getElementById('enginePanel');
        const bar = document.getElementById('evalBarFill');
        const text = document.getElementById('evalScore');
        if (!this.#game || !this.#game.engine) return;

        let isWhiteWinning = true;
        let percent = 50;
        let display = "0.00";

        let vWinner = null;
        if (typeof this.#game.engine.variant_winner === 'function') vWinner = this.#game.engine.variant_winner();
        
        if (vWinner === 'w') {
            display = "1-0";
            percent = 100;
            isWhiteWinning = true;
        } else if (vWinner === 'b') {
            display = "0-1";
            percent = 0;
            isWhiteWinning = false;
        } else if (this.#game.engine.in_checkmate()) {
            const winner = (this.#game.turn === 'w') ? "0-1" : "1-0";
            percent = (winner === "1-0") ? 100 : 0;
            display = (winner === "1-0") ? "+M0" : "-M0";
            isWhiteWinning = (winner === "1-0");
        } else if (this.#game.engine.in_draw() || this.#game.engine.in_stalemate() || (typeof this.#game.engine.in_threefold_repetition === 'function' && this.#game.engine.in_threefold_repetition())) {
            display = "0.00";
            percent = 50;
            isWhiteWinning = true; 
        } else if (type !== undefined && val !== undefined) {
            if (type === 'mate') {
                display = (val > 0 ? "+M" : "-M") + Math.abs(val);
                percent = val > 0 ? 100 : 0;
                isWhiteWinning = val > 0;
            } else {
                const evalFloat = val / 100;
                const clamped = Math.max(-5, Math.min(5, evalFloat));
                percent = 50 + (clamped * 10);
                display = (val > 0 ? "+" : "-") + Math.abs(evalFloat).toFixed(1);
                isWhiteWinning = val >= 0;
            }
        }

        if (bar && container) {
            // Ensure structural CSS is locked in
            container.style.position = 'relative';
            bar.style.position = 'absolute';
            bar.style.left = '0';
            bar.style.width = '100%';
            bar.style.bottom = '0';
            bar.style.top = 'auto'; // ALWAYS grow from the bottom of the container

            if (this.flipped) {
                // FLIPPED: Black is at Bottom, White is at Top
                container.style.backgroundColor = '#fff'; // Top part is White
                bar.style.backgroundColor = '#333';       // Bottom part is Black
                bar.style.height = `${100 - percent}%`;   // Bottom bar represents Black's share
            } else {
                // NORMAL: White is at Bottom, Black is at Top
                container.style.backgroundColor = '#333'; // Top part is Black
                bar.style.backgroundColor = '#fff';       // Bottom part is White
                bar.style.height = `${percent}%`;         // Bottom bar represents White's share
            }
        }

        if (text) {
            text.innerText = display;
            text.style.position = 'absolute';
            text.style.width = '100%';
            text.style.textAlign = 'center';
            text.style.fontWeight = 'bold';
            text.style.fontSize = '12px';
            text.style.padding = '4px 0';
            text.style.zIndex = '5';
            
            if (isWhiteWinning) {
                text.style.color = '#rgb(213,191,191)'; // Dark text
                text.style.textShadow = '0px 0px 3px rgba(0, 0, 0, 0.9)'; // Anti-blend shield
                if (this.flipped) {
                    text.style.top = '0px';        // White is at the Top
                    text.style.bottom = 'auto';
                } else {
                    text.style.top = 'auto';
                    text.style.bottom = '0px';     // White is at the Bottom
                }
            } else {
                text.style.color = 'rgb(255, 255, 255)'; // Light text
                text.style.textShadow = '0px 0px 3px #000'; // Anti-blend shield
                if (this.flipped) {
                    text.style.top = 'auto';
                    text.style.bottom = '0px';     // Black is at the Bottom
                } else {
                    text.style.top = '0px';        // Black is at the Top
                    text.style.bottom = 'auto';
                }
            }
        }
    }
showNotification(message, title ="System Message", icon ="ℹ️") {
        const modal = document.getElementById('notificationModal');
        const titleEl = document.getElementById('notifTitle');
        const msgEl = document.getElementById('notifMessage');
        const iconEl = document.getElementById('notifIcon');
        if (modal && titleEl && msgEl) {
            titleEl.innerText = title; msgEl.innerText = message; iconEl.innerHTML = icon;
            const content = modal.querySelector('.modal-content');
            content.style.animation ='none'; content.offsetHeight;
            content.style.animation ='modalPop 0.2s ease-out forwards';
            modal.style.display ='flex';
            this.#emit('soundTriggered', { type: 'notification' });
        } else { alert(message); }
    }
hideNotification() {
        const modal = document.getElementById('notificationModal');
        if (modal) modal.style.display ='none';
    }
showAnnotationPopup(e, node) {
        if (this.#game && this.#game.isPlayingLiveGame) return;
        let existing = document.getElementById('annotationPopup');
        if (existing) existing.remove();

        const anchorElement = e.currentTarget || e.target;

        let popup = document.createElement('div'); popup.id = 'annotationPopup'; popup.className = 'annotation-popup';
        popup.style.cssText = 'position:absolute; z-index:100000; background:#252525; border:1px solid #444; padding:8px 0; border-radius:6px; box-shadow:0 4px 12px rgba(0,0,0,0.5); display:flex; flex-direction:column; min-width:200px; font-family:sans-serif; transform-origin:top left; visibility:hidden;';

        const forceRedraw = () => {
            this._lastTreeSize = -1; this._lastChartedFen = null;
            const historyBox = document.getElementById('moveHistory');
            if (historyBox) historyBox.innerHTML = ''; 
            if (this.updateHistory) this.updateHistory(true);
            if (typeof this.renderCharts === 'function') this.renderCharts();
            if (this.renderBoard) this.renderBoard(false, false);
            if (this.#game && this.#game.updateStockfish) this.#game.updateStockfish();
            if (this.#game) {
                if (this.#game.mode === 'study' && typeof this.#game.saveActiveChapter === 'function') {
                    this.#game.saveActiveChapter();
                } else if (this.#game.mode === 'analysis' && typeof this.#game.saveState === 'function') {
                    this.#game.saveState('analysis');
                }
            }
        };

        let nagContainer = document.createElement('div');
        nagContainer.style.padding = '0 8px'; nagContainer.style.display = 'flex'; nagContainer.style.flexDirection = 'column'; nagContainer.style.gap = '8px';

        const cat1 = [ {val:'$3', sym:'!!', c:'#26c2a3'}, {val:'$1', sym:'!', c:'#5c8bb0'}, {val:'$5', sym:'!?', c:'#b369f2'}, {val:'$6', sym:'?!', c:'#f7c045'}, {val:'$2', sym:'?', c:'#ffa700'}, {val:'$4', sym:'??', c:'#fa412d'} ];
        const cat2 = [ {val:'$10', sym:'='}, {val:'$13', sym:'∞'}, {val:'$14', sym:'⩲'}, {val:'$15', sym:'⩱'}, {val:'$16', sym:'±'}, {val:'$17', sym:'∓'}, {val:'$18', sym:'+-'}, {val:'$19', sym:'-+'} ];

        let currentNags = node.nag ? node.nag.toString().split(',').map(n=>n.trim()) : [];

        const createRow = (items, categoryList, cols) => {
            let row = document.createElement('div');
            row.style.display = 'grid'; row.style.gridTemplateColumns = `repeat(${cols}, 1fr)`; row.style.gap = '4px';
            
            items.forEach(item => {
                let btn = document.createElement('button');
                let isActive = currentNags.includes(item.val) || currentNags.includes(item.sym);
                btn.innerText = item.sym;
                btn.style.cssText = `background: ${isActive ? '#555' : 'transparent'}; color: ${item.c || '#ccc'}; border: 1px solid ${isActive ? '#888' : '#444'}; border-radius: 4px; padding: 4px 0; font-weight: bold; cursor: pointer; transition: all 0.1s;`;
                
                btn.onmouseenter = () => { if (!isActive) btn.style.background = 'rgba(255,255,255,0.1)'; };
                btn.onmouseleave = () => { if (!isActive) btn.style.background = 'transparent'; };

                btn.onclick = (ev) => {
                    ev.stopPropagation();
                    currentNags = currentNags.filter(n => !categoryList.some(c => c.val === n || c.sym === n));
                    if (!isActive) currentNags.push(item.val);
                    node.nag = currentNags.join(',');
                    if (node.nag === '') node.nag = null;
                    forceRedraw(); popup.remove();
                };
                row.appendChild(btn);
            });
            return row;
        };

        nagContainer.appendChild(createRow(cat1, cat1, 3));
        let divider1 = document.createElement('div'); divider1.style.borderBottom = '1px solid #444'; nagContainer.appendChild(divider1);
        nagContainer.appendChild(createRow(cat2, cat2, 4));
        popup.appendChild(nagContainer);

        let dividerBook = document.createElement('div'); dividerBook.style.borderBottom = '1px solid #444'; dividerBook.style.margin = '8px 0'; popup.appendChild(dividerBook);

        let bookContainer = document.createElement('div'); bookContainer.style.padding = '0 8px';
        let isBook = !!node.isBook;
        let bookBtn = document.createElement('button');
        bookBtn.style.cssText = `width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; background: ${isBook ? 'rgba(6, 182, 212, 0.15)' : 'transparent'}; color: ${isBook ? '#22d3ee' : '#aaa'}; border: 1px solid ${isBook ? '#22d3ee' : '#444'}; border-radius: 4px; padding: 6px; cursor: pointer; font-size: 13px; font-weight: bold;`;
        bookBtn.innerHTML = `<span style="width:16px; height:16px; display:block;">${typeof ICON_BOOK_SVG_IMG_BLUE !== 'undefined' ? ICON_BOOK_SVG_IMG_BLUE : '📖'}</span> <span>${isBook ? 'Book Move' : 'Mark as Book'}</span>`;
        
        bookBtn.onclick = (ev) => { ev.stopPropagation(); node.isBook = !node.isBook; forceRedraw(); popup.remove(); };
        bookContainer.appendChild(bookBtn); popup.appendChild(bookContainer);

        let divider2 = document.createElement('div'); divider2.style.borderBottom = '1px solid #444'; divider2.style.margin = '8px 0'; popup.appendChild(divider2);
        
        let actionsContainer = document.createElement('div'); actionsContainer.style.display = 'flex'; actionsContainer.style.flexDirection = 'column';

        const createActionBtn = (icon, text, onClick, isDanger = false) => {
            let item = document.createElement('div');
            item.style.cssText = `padding: 8px 16px; cursor: pointer; font-size: 13px; color: ${isDanger ? '#fa412d' : '#ddd'}; display: flex; align-items: center; gap: 8px; transition: background 0.15s; user-select: none;`;
            item.innerHTML = `<span>${icon}</span> <span>${text}</span>`;
            item.onmouseenter = () => item.style.background = isDanger ? 'rgba(250, 65, 45, 0.15)' : 'rgba(255,255,255,0.1)';
            item.onmouseleave = () => item.style.background = 'transparent';
            item.onclick = (ev) => { ev.stopPropagation(); onClick(); popup.remove(); };
            return item;
        };

        let hasComment = node.comment && node.comment.trim() !== "";
        actionsContainer.appendChild(createActionBtn('💬', hasComment ? 'Edit Comment' : 'Add Comment', () => {
            const state = this.#game ? this.#game.getReader() : null;
            if (state && state.activeNodeId !== node.id) {
                if (this.#game.goToNodeId(node.id)) {
                    if (this.renderBoard) this.renderBoard(false, false);
                    if (this.renderArrows) this.renderArrows();
                    forceRedraw(); 
                }
            }
            setTimeout(() => {
                const commentBox = document.getElementById('commentaryBox');
                if (commentBox) {
                    commentBox.style.transition = "box-shadow 0.3s, border-color 0.3s";
                    commentBox.style.boxShadow = "0 0 12px rgba(56, 189, 248, 0.8)";
                    commentBox.style.borderColor = "#38bdf8";
                    setTimeout(() => { commentBox.style.boxShadow = "none"; commentBox.style.borderColor = "transparent"; }, 800);
                    commentBox.focus();
                    if (typeof window.getSelection !== "undefined" && typeof document.createRange !== "undefined") {
                        const range = document.createRange(); range.selectNodeContents(commentBox); range.collapse(false);
                        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
                    }
                }
            }, 50);
        }));

        if (hasComment) { actionsContainer.appendChild(createActionBtn('🗑️', 'Delete Comment', () => { this.#game.updateComment(node.id, ""); forceRedraw(); })); }

        if (node.parent) {
            actionsContainer.appendChild(createActionBtn('⬆️', 'Promote Variation', () => { if (this.#game) this.#game.promoteVariation(node.id); forceRedraw(); }));
            actionsContainer.appendChild(createActionBtn('🌟', 'Make Main Line', () => { if (this.#game) this.#game.makeMainline(node.id); forceRedraw(); }));
            actionsContainer.appendChild(createActionBtn('❌', 'Delete from here', () => { if (this.#game) this.#game.deleteNode(node.id); forceRedraw(); }, true)); 
        }

        popup.appendChild(actionsContainer); document.body.appendChild(popup);

        const updatePosition = () => {
            if (!document.body.contains(popup)) { window.removeEventListener('resize', updatePosition); return; }
            let currentScale = 1;
            const scaler = document.getElementById('app-scaler');
            if (scaler) {
                const transform = window.getComputedStyle(scaler).transform;
                if (transform !== 'none') {
                    const matrix = transform.match(/^matrix\((.+)\)$/);
                    if (matrix) currentScale = parseFloat(matrix[1].split(',')[0]);
                }
            }
            popup.style.transform = `scale(${currentScale})`;

            const anchorRect = anchorElement.getBoundingClientRect();
            let px = anchorRect.left + window.scrollX; let py = anchorRect.bottom + window.scrollY + (5 * currentScale);

            if (anchorRect.width === 0) { px = e.pageX; py = e.pageY; }

            const scaledWidth = popup.offsetWidth * currentScale; const scaledHeight = popup.offsetHeight * currentScale;
            const viewportLeft = px - window.scrollX; const viewportTop = py - window.scrollY;
            
            if (viewportLeft + scaledWidth > window.innerWidth) px = window.innerWidth + window.scrollX - scaledWidth - 10;
            if (viewportTop + scaledHeight > window.innerHeight) {
                px = anchorRect.left + window.scrollX; py = anchorRect.top + window.scrollY - scaledHeight - (5 * currentScale);
                if (px - window.scrollX + scaledWidth > window.innerWidth) px = window.innerWidth + window.scrollX - scaledWidth - 10;
            }

            popup.style.left = px + 'px'; popup.style.top = py + 'px';
        };

        requestAnimationFrame(() => { updatePosition(); popup.style.visibility = 'visible'; });
        window.addEventListener('resize', updatePosition);
        setTimeout(() => { document.addEventListener('click', function close(ev) { if (!popup.contains(ev.target)) { popup.remove(); document.removeEventListener('click', close); window.removeEventListener('resize', updatePosition); } }); }, 10);
    }
renderAnalysisLine(index, type, val, moves, startFen) {
        try {
            const box = document.getElementById('engine-lines-box') || document.querySelector('.engine-lines') || document.getElementById('pvBox');
            if (!box) return;
            
            const currentFen = startFen || (this.#game && this.#game.currentNode ? this.#game.currentNode.fen : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");

            let li = document.getElementById(`eng-line-${index}`);
            if (!li) {
                li = document.createElement('div'); li.id = `eng-line-${index}`; li.className = 'engine-line-item';
                li.style.cssText = 'display:flex; align-items:flex-start; padding:4px 8px; border-bottom:1px solid #333; font-family:monospace; font-size:13px;';
                li.dataset.expanded = 'false'; 
                const existing = Array.from(box.children);
                if (existing[index - 1]) box.insertBefore(li, existing[index - 1]); else box.appendChild(li);
            }

            const isExpanded = li.dataset.expanded === 'true';
            let scoreColor = val > 0 ? '#26c2a3' : (val < 0 ? '#fa412d' : '#888'); 
            if (type === 'mate') scoreColor = '#b369f2'; 
            
            let scoreTxt = (type === 'cp' ? (val / 100).toFixed(2) : `M${Math.abs(val)}`); 
            if (type === 'cp' && val > 0) scoreTxt = `+${scoreTxt}`;
            if (type === 'mate' && val > 0) scoreTxt = `+M${Math.abs(val)}`; 
            if (type === 'mate' && val < 0) scoreTxt = `-M${Math.abs(val)}`; 

            li.innerHTML = `
                <div class="expand-pv-btn" style="cursor:pointer; color:#888; flex-shrink:0; font-size:11px; padding-top:2px; user-select:none;" title="Toggle Full Line">${isExpanded ? '▼' : '▶'}</div>
                <div class="line-score" style="color:${scoreColor}; font-weight:bold; min-width:55px; flex-shrink:0;">${scoreTxt}</div>
                <div class="line-moves" style="color:#ccc; line-height:1.5; flex-grow:1; overflow:hidden; ${isExpanded ? 'white-space:normal;' : 'white-space:nowrap; text-overflow:ellipsis;'}"></div>
            `;

            const movesContainer = li.querySelector('.line-moves');
            const expandBtn = li.querySelector('.expand-pv-btn');

            expandBtn.onmousedown = (e) => {
                e.preventDefault(); 
                const currentlyExpanded = li.dataset.expanded === 'true';
                if (!currentlyExpanded) {
                    li.dataset.expanded = 'true'; movesContainer.style.whiteSpace = 'normal'; expandBtn.innerHTML = '▼'; 
                } else {
                    li.dataset.expanded = 'false'; movesContainer.style.whiteSpace = 'nowrap'; expandBtn.innerHTML = '▶'; 
                }
            };

            const gameMode = this.#game ? this.#game.getReader().gameMode : 'classical';
            const tempChess = new (typeof Chess === 'function' ? Chess : window.Chess)(currentFen, gameMode);
            const is960 = gameMode === 'chess960';
            const displayMoves = moves.slice(0, 40);
            
            let cumulativeMoves = []; let validMoveCount = 0; 

            for (let i = 0; i < displayMoves.length; i++) { 
                const uci = displayMoves[i]; 
                const turn = tempChess.turn(); 
                const parts = tempChess.fen().split(' ');
                let moveNum = parseInt(parts[5]) || 1;
                
                if (gameMode === 'duck' && parts.length >= 7 && isNaN(parseInt(parts[4]))) moveNum = parts[6];
                moveNum = parseInt(moveNum) || 1;

                let prefix = "";
                if (turn === 'w') prefix = `${moveNum}. `;
                else if (i === 0) prefix = `${moveNum}... `;

                let moveObj = null;
                try {
                    moveObj = tempChess.move(uci, { sloppy: true });
                    if (!moveObj) {
                        let baseUci = uci;
                        let isDrop = baseUci.includes('@');
                        
                        if (baseUci.includes(',')) baseUci = baseUci.split(',')[0];
                        if (isDrop) {
                            let parts = baseUci.split('@');
                            moveObj = tempChess.move({ from: '@', to: parts[1], drop: parts[0].toLowerCase() });
                        } else {
                            const from = baseUci.substring(0, 2); const to = baseUci.substring(2, 4);
                            const pPromo = baseUci.length > 4 ? baseUci.substring(4, 5) : undefined;
                            
                            if (is960) {
                                const p1 = tempChess.get(from); const p2 = tempChess.get(to);
                                if (p1 && p2 && p1.type === 'k' && p2.type === 'r' && p1.color === p2.color) {
                                    let newCastling = parts[2].replace(turn === 'w' ? 'K' : '', '').replace(turn === 'w' ? 'Q' : '', '').replace(turn === 'b' ? 'k' : '', '').replace(turn === 'b' ? 'q' : '', '');
                                    if (newCastling === '') newCastling = '-';

                                    const isKingside = to.charCodeAt(0) > from.charCodeAt(0);
                                    let ranks = parts[0].split('/'); let rIdx = turn === 'w' ? 7 : 0; let exp = '';
                                    for (let c of ranks[rIdx]) exp += isNaN(c) ? c : ' '.repeat(parseInt(c));
                                    exp = exp.split(''); exp[from.charCodeAt(0) - 97] = ' '; exp[to.charCodeAt(0) - 97] = ' ';
                                    exp[isKingside ? 6 : 2] = turn === 'w' ? 'K' : 'k'; exp[isKingside ? 5 : 3] = turn === 'w' ? 'R' : 'r'; 
                                    
                                    let comp = '', empties = 0;
                                    for (let char of exp) { if (char === ' ') empties++; else { if (empties > 0) { comp += empties; empties = 0; } comp += char; } }
                                    if (empties > 0) comp += empties;
                                    ranks[rIdx] = comp; parts[0] = ranks.join('/'); parts[1] = turn === 'w' ? 'b' : 'w'; parts[2] = newCastling; parts[3] = '-';
                                    if (turn === 'b') parts[5] = parseInt(parts[5]) + 1;
                                    
                                    tempChess.load(parts.join(' ')); moveObj = { san: isKingside ? 'O-O' : 'O-O-O' };
                                } else { moveObj = tempChess.move({ from, to, promotion: pPromo }); }
                            } else { moveObj = tempChess.move({ from, to, promotion: pPromo }); }
                        }
                    }
                } catch(e) { }

                if (moveObj) {
                    cumulativeMoves.push(uci); validMoveCount++; 
                    const fenAtMove = tempChess.fen();
                    const duckSq = tempChess.get_duck_sq ? tempChess.get_duck_sq() : -1;
                    const seqString = cumulativeMoves.join(' ');
                    
                    let span = document.createElement('span'); span.className = 'pv-move'; span.innerText = prefix + moveObj.san;
                    span.style.cssText = 'cursor:pointer; margin-right:5px; display:inline-block;';
                    
                    span.onmouseenter = (e) => { span.style.color = '#fff'; span.style.textDecoration = 'underline'; this.hoverEngineMove(fenAtMove, e, duckSq); };
                    span.onmouseleave = () => { span.style.color = ''; span.style.textDecoration = 'none'; this.stopHoverEngineMove(); };
                    span.onclick = (e) => { e.stopPropagation(); this.stopHoverEngineMove();if (this.#game && this.#game.playEngineSequence) this.#game.playEngineSequence(seqString, currentFen); };
                    movesContainer.appendChild(span);
                } else break; 
            }
            li.style.display = validMoveCount === 0 ? 'none' : 'flex';
        } catch (err) {
            console.error("[UI RENDER FATAL ERROR]", err);
        }
    }
    initPreviewGridDOM() {
        const grid = document.getElementById('previewGrid');
        if (!grid || grid.children.length === 64) return;
        
        grid.innerHTML = ''; 
        const currentTheme = document.getElementById('assetType')?.value;
        const isDisguised = currentTheme === 'disguised';
        
        for (let i = 0; i < 64; i++) {
            let r = i >> 3; let c = i & 7;
            const isLight = (r + c) % 2 === 0;
            const sq = document.createElement('div');
            sq.className = `preview-square ${isLight ? 'light' : 'dark'}`;
            sq.style.cssText = 'position:relative; box-sizing:border-box; display:flex; justify-content:center; align-items:center; overflow:hidden;';
            
            if (isDisguised) {
                const colorClass = isLight ? 'light' : 'dark';
                const cleanSq = document.querySelector(`.square.${colorClass}:not(.last-move):not(.selected):not(.in-check)`);
                if (cleanSq) {
                    const comp = window.getComputedStyle(cleanSq);
                    sq.style.backgroundColor = comp.backgroundColor;
                    const bStyle = comp.borderTopStyle;
                    sq.style.border = (bStyle && bStyle !== 'none') ? `${comp.borderTopWidth} ${bStyle} ${comp.borderTopColor}` : '1px solid #555';
                } else {
                    sq.style.backgroundColor = '#2c2c2c'; sq.style.border = '1px solid #555';   
                }
            } else {
                const gridColor = this.currentGridColor || 'transparent';
                sq.style.border = gridColor !== 'transparent' ? `1px solid ${gridColor}` : 'none';
            }
            grid.appendChild(sq);
        }
    }
    hoverEngineMove(fen, e, duckSq = -1) {
        const popup = document.getElementById('previewPopup');
        const grid = document.getElementById('previewGrid');
        if (!popup || !grid) return;

        if (popup.parentElement !== document.body) document.body.appendChild(popup);
        const rect = e.target.getBoundingClientRect();
        
        popup.style.position = 'fixed'; popup.style.zIndex = '999999'; popup.style.margin = '0';
        let scale = Math.min(window.innerWidth / 1000, window.innerHeight / 800);
        scale = Math.min(1.0, Math.max(0.4, scale));
        popup.style.transformOrigin = 'top left'; popup.style.transform = `scale(${scale})`;

        const scaledSize = 220 * scale; 
        let top = rect.bottom + 10; let left = rect.left; 

        if (left + scaledSize > window.innerWidth) left = window.innerWidth - scaledSize - 10; 
        if (top + scaledSize > window.innerHeight) top = rect.top - scaledSize - 10; 
        
        popup.style.top = top + 'px'; popup.style.left = left + 'px'; popup.style.display = 'block';
        this.initPreviewGridDOM();
        const squares = grid.children;
        
        let targetGridIndex = -1;
        if (duckSq !== -1 && duckSq !== undefined && duckSq !== null) {
            let sqStr = typeof duckSq === 'number' ? String.fromCharCode(97 + (duckSq % 8)) + (Math.floor(duckSq / 8) + 1) : duckSq.toLowerCase();
            if (sqStr && sqStr.length >= 2) targetGridIndex = (8 - parseInt(sqStr[1], 10)) * 8 + (sqStr.charCodeAt(0) - 97);
        }
        
        const parts = fen.split(' '); const rows = parts[0].split('/');
        
        for (let r = 0; r < 8; r++) { 
            let rankStr = rows[r]; let fileIdx = 0; 
            for (let i = 0; i < rankStr.length; i++) { 
                let char = rankStr[i];
                if (isNaN(char)) {
                    let currentSq = r * 8 + fileIdx;
                    let renderPiece = char === '*' ? null : char;
                    let isAliceB = false;
                    
                    if (i + 1 < rankStr.length && rankStr[i+1] === '~') {
                        isAliceB = true; i++; 
                    }

                    if (currentSq === targetGridIndex) renderPiece = 'duck';
                    
                    this.renderPreviewSquare(squares[currentSq], renderPiece, isAliceB); 
                    fileIdx++;
                } else {
                    let empties = parseInt(char); 
                    for (let k = 0; k < empties; k++) {
                        let currentSq = r * 8 + fileIdx;
                        this.renderPreviewSquare(squares[currentSq], (currentSq === targetGridIndex) ? 'duck' : null, false);
                        fileIdx++;
                    }
                }
            }
        }

        const currentTheme = document.getElementById('assetType')?.value;
        const isDisguised = currentTheme === 'disguised';
        if (isDisguised) {
            grid.classList.add('theme-disguised');
            const mainBoard = document.getElementById('chessBoard');
            if (mainBoard) {
                const compBoard = window.getComputedStyle(mainBoard);
                const bbStyle = compBoard.borderTopStyle;
                if (bbStyle && bbStyle !== 'none') grid.style.border = `${compBoard.borderTopWidth} ${bbStyle} ${compBoard.borderTopColor}`;
            }
        } else {
            grid.classList.remove('theme-disguised'); grid.style.border = ''; 
        }

        if (this.flipped) {
            grid.style.transform = 'rotate(180deg)';
            grid.querySelectorAll('.preview-piece').forEach(p => p.style.transform = 'rotate(180deg)');
        } else {
            grid.style.transform = 'none';
            grid.querySelectorAll('.preview-piece').forEach(p => p.style.transform = 'none');
        }
    }
    renderPreviewSquare(sqDOM, pieceChar, isAliceB = false) {
        const stateSig = (pieceChar || 'empty') + (isAliceB ? '_A' : '');
        if (sqDOM._stateSig === stateSig) return;

        sqDOM.innerHTML = '';
        
        if (pieceChar) {
            let color, type;
            if (pieceChar === 'duck') { color = 'none'; type = 'duck'; } 
            else { color = (pieceChar === pieceChar.toUpperCase()) ? 'w' : 'b'; type = pieceChar.toUpperCase(); }

            const pHTML = this.getPieceHTML({ color, type });
            let htmlBuffer = pHTML;
            if (pHTML) {
                const trimmed = pHTML.trim();
                if (trimmed.startsWith('<svg')) htmlBuffer = `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}" style="width:100%; height:100%; object-fit:contain; display:block; pointer-events:none; margin:0; padding:0;" draggable="false">`;
                else if (trimmed.startsWith('data:image/') || trimmed.startsWith('http') || trimmed.endsWith('.svg') || trimmed.endsWith('.png')) htmlBuffer = `<img src="${trimmed}" style="width:100%; height:100%; object-fit:contain; display:block; pointer-events:none; margin:0; padding:0;" draggable="false">`;
                else if (trimmed.startsWith('<img')) htmlBuffer = trimmed; 
            }

            const pDiv = document.createElement('div'); pDiv.className = 'preview-piece';
            let aliceStyle = isAliceB ? 'filter: hue-rotate(180deg) drop-shadow(0 0 5px cyan); opacity: 0.6; transform: scale(0.80);' : '';
            pDiv.style.cssText = `position:absolute; top:0; left:0; width:100%; height:100%; display:flex; justify-content:center; align-items:center; transform-origin:center; ${aliceStyle}`;
            pDiv.innerHTML = htmlBuffer || '';
            sqDOM.appendChild(pDiv);
        }
        sqDOM._stateSig = stateSig;
    }
stopHoverEngineMove() {
        const popup = document.getElementById('previewPopup');
        if (popup) popup.style.display = 'none';
    }
previewEngineMove(fen) {
        if (this.#game) {
            this.#game.loadFEN(fen);
            this.#game.currentNode = new MoveNode(fen, null);
            this.renderBoard(false);
            this.updateHistory();
            if (window.engineAnalysing) this.#game.updateStockfish();
        }
    }
setNag(nag) {
        if (this.contextNode) {
            if (this.contextNode.nag == nag) this.contextNode.nag = null;
            else this.contextNode.nag = nag;
            this.updateHistory();
            this.renderBoard(false); 
        }
        if (this.annotationPopup) this.annotationPopup.style.display = 'none';
    }
getPly(node) {
        let c = 0;
        if (this.#game && this.#game.pgnHeaders && this.#game.pgnHeaders['FEN']) {
            let parts = this.#game.pgnHeaders['FEN'].split(' ');
            let num = parseInt(parts[5]) || 1;
            let turn = parts[1];
            c = (num - 1) * 2 + (turn === 'b' ? 1 : 0);
        }
        let n = node;
        while (n.parent) { c++; n = n.parent; }
        return c;
    }
updateStatus(msg) {
        const box = document.getElementById('commentaryBox');
        if (box) box.innerText = msg;
    }
    startClockRenderLoop() {
        const renderLoop = () => {
            if (this.#game && this.#game.isPlayingLiveGame && !this.#game.gameOver && !this.#game.isPaused) {
                this.updateClocks(); 
            }
            requestAnimationFrame(renderLoop);
        };
        requestAnimationFrame(renderLoop);
    }
getPieceHTML(piece) {
        if (piece.type === 'duck') return `<img src="assets/tabs-icon/variant-duckchess.svg" style="width:100%; height:100%; display:block; pointer-events:none; z-index: 100;">`;
        if (this.pieceTheme === 'custom' && this.customPieces) {
            const key = piece.color + piece.type.toUpperCase();
            if (this.customPieces[key]) return `<img src="${this.customPieces[key]}" class="piece-img" style="width:100%; height:100%; display:block; pointer-events:none;" draggable="false">`;
        }
        if (typeof PIECE_SETS === 'undefined') return null;
        
        const selector = document.getElementById('assetType');
        let setName = selector ? selector.value : 'cburnett';
        if (!PIECE_SETS[setName]) setName = 'cburnett';
        
        const set = PIECE_SETS[setName];
        if (!set || !set.pieces) return null;

        const code = piece.color + piece.type.toUpperCase();
        return set.pieces[code] || null;
    }
updateEditorInputs() {
        if (this.#game && typeof this.#game.generateFEN === 'function') {
            const input = document.getElementById('fenInput');
            if (input) input.value = this.#game.generateFEN();
        }
    }
processTrashAction(e) {
        if (!this.#game || this.#game.mode !== 'editor' || this.editorTool !== 'trash') return;
        
        if (e.type === 'mousedown' || (e.type === 'mousemove' && e.buttons === 1)) {
            const idx = this.getSquareFromCoords(e.clientX, e.clientY);
            if (idx === -1) return; 

            e.preventDefault(); e.stopPropagation();

            if (this.#game.board[idx] !== null) {
                this.#game.editBoard(idx, null);
                this.renderBoard(false);       
                if (window.engineAnalysing) this.#game.updateStockfish();
                this.#emit('soundTriggered', { type: 'scatter' });
            }
        }
    }
editorClear() {
    if (this.#game) {
        const emptyFen = "8/8/8/8/8/8/8/8 w - - 0 1";
        this.#game.loadFEN(emptyFen);
        
        // Ensure the engine and visual board are in sync
        if (typeof this.#game.syncEngineToBoard === 'function') this.#game.syncEngineToBoard(); 
        
        this.renderBoard(false);
        const fenInput = document.getElementById('fenInput');
        if (fenInput) fenInput.value = emptyFen;

        this.updateEditorInputs();
        this.#emit('soundTriggered', { type: 'scatter' });
    }
}
editorReset() {
    let startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    if (this.#game) {
        if (typeof VARIANT_STARTING_FENS !== 'undefined' && VARIANT_STARTING_FENS[this.#game.gameMode]) {
            startFen = VARIANT_STARTING_FENS[this.#game.gameMode];
        }
        if (this.#game.gameMode === 'chess960' && typeof this.#game.generateChess960FEN === 'function') {
            startFen = this.#game.generateChess960FEN();
        }
    }

    this.animateToStartPosition(startFen, () => {
        if (this.#game) {
            this.#game.loadFEN(startFen);
            if (typeof MoveNode !== 'undefined') {
                this.#game.rootNode = new MoveNode(startFen, null);
                this.#game.currentNode = this.#game.rootNode;
            }
            this.#game.moveList = [];
            this.#game.history = [];
            this.#game.lastMove = null; 
        }

        this.selectedSq = null;
        this.legalMoves = [];

        // Parsing FEN to update individual UI fields
        const parts = startFen.split(' ');
        const turn = parts[1] || 'w';
        const castling = parts[2] || '-';
        const ep = parts[3] || '-';
        const halfMove = parts[4] || '0';
        const fullMove = parts[5] || '1';
        const fenInput = document.getElementById('fenInput');
        if (fenInput) fenInput.value = startFen;

        this.editorTurn = turn;
        const turnSelect = document.getElementById('editorTurn');
        if (turnSelect) turnSelect.value = turn;

        if (document.getElementById('castling-wK')) document.getElementById('castling-wK').checked = castling.includes('K');
        if (document.getElementById('castling-wQ')) document.getElementById('castling-wQ').checked = castling.includes('Q');
        if (document.getElementById('castling-bK')) document.getElementById('castling-bK').checked = castling.includes('k');
        if (document.getElementById('castling-bQ')) document.getElementById('castling-bQ').checked = castling.includes('q');

        if (document.getElementById('editorEpSquare')) document.getElementById('editorEpSquare').value = ep;
        if (document.getElementById('editorHalfMove')) document.getElementById('editorHalfMove').value = halfMove;
        if (document.getElementById('editorFullMove')) document.getElementById('editorFullMove').value = fullMove;
        
        if (this.#game && typeof this.#game.syncEngineToBoard === 'function') this.#game.syncEngineToBoard();
        this.renderBoard(false); 
        this.updateStatus("Editor Reset to Variant Start Position");
    });
}
finishEditor() {
        if (!this.#game) return;
        const startFen = typeof this.#game.generateFEN === 'function' ? this.#game.generateFEN() : this.#game.engine.fen();
        const validation = this.#game.engine.validate_fen(startFen);
        
        if (!validation.valid) {
            this.showNotification("Illegal Position", validation.error, "⚠️");
            return; 
        }

        if (this.#game.stopEngine) this.#game.stopEngine();
        if (window.sfWorker) window.sfWorker.postMessage('stop');

        this.switchTab('play');

        this.#game.loadFEN(startFen);
        this.#game.rootNode = new MoveNode(startFen, null);
        this.#game.currentNode = this.#game.rootNode;
        this.#game.moveList = [];
        this.#game.history = [startFen];
        this.#game.pgnHeaders = { "FEN": startFen, "SetUp": "1" };
        this.#game.gameOver = true; 
        
        this.displayMetadata({}); 
        this.playerInfo = {
            w: { name: "White", meta: "", country: null, title: null },
            b: { name: "Black", meta: "", country: null, title: null }
        };
        
        this.renderHeaders();
        this.updateHistory();
        this.renderBoard(false);
        if (typeof this.updateClocks === 'function') this.updateClocks();
        
        if (this.#game && window.engineAnalysing) {
            if (typeof this.#game.updateStockfish === 'function') {
                this.#game.updateStockfish();
            }
        }
        
        this.showNotification("Board updated from Editor.", "Success", "✅");
}
flipBoard() {
        this.flipped = !this.flipped;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('chess_graph_flip', this.flipped ? 'b' : 'w');
        }
        
        this.renderBoard(true);
        this.renderHeaders();
        if (this.coordsPosition === 'outside') this.renderExternalCoords();
        
        if (typeof this.updateEvalBar === 'function') this.updateEvalBar();
        
        const grid = document.getElementById('previewGrid');
        if (grid) {
            if (this.flipped) {
                grid.style.transform = 'rotate(180deg)';
                grid.querySelectorAll('.preview-piece').forEach(p => p.style.transform = 'rotate(180deg)');
            } else {
                grid.style.transform = 'none';
                grid.querySelectorAll('.preview-piece').forEach(p => p.style.transform = 'none');
            }
        }
    }
copyFEN() {
        if (!this.#game) return;
        const currentFen = typeof this.#game.generateFEN === 'function' ? this.#game.generateFEN() : (this.#game.currentNode ? this.#game.currentNode.fen : "");
        if (currentFen) {
            navigator.clipboard.writeText(currentFen).then(() => {
                this.showNotification("FEN copied to clipboard!", "Copied", "📋");
            });
        }
    }
copyPGN() {
        if (!this.#game) return;
        const formatMenu = document.getElementById('pgnFormatSelect');
        const exportFormat = formatMenu ? formatMenu.value : 'both';
        
        if (typeof this.#game.generatePGN === 'function') {
            const pgn = this.#game.generatePGN(exportFormat); // Pass the chosen format
            navigator.clipboard.writeText(pgn).then(() => {
                if (typeof this.showNotification === 'function') {
                    this.showNotification("PGN copied to clipboard!", "Copied", "📄");
                }
            }).catch(err => {
                console.error('Failed to copy PGN: ', err);
            });
        } else if (typeof this.#game.getPGN === 'function') {
            const pgn = this.#game.getPGN();
            navigator.clipboard.writeText(pgn).then(() => {
                if (typeof this.showNotification === 'function') {
                    this.showNotification("PGN copied to clipboard!", "Copied", "📄");
                }
            });
        }
    }
showPromotionModal(color, destIdx, callback) {
        const overlay = document.getElementById('promotion-overlay');
        if (!overlay) return;
        const file = destIdx & 7; const rank = destIdx >> 3;
        const targetX = (this.flipped ? (7 - file) : file) * 12.5; 
        const targetY = (this.flipped ? (7 - rank) : rank) * 12.5; 

        const pieceEls = this.piecesLayer.children;
        for (let el of pieceEls) {
            const left = parseFloat(el.style.left); const top = parseFloat(el.style.top);
            if (Math.abs(left - targetX) < 1 && Math.abs(top - targetY) < 1) el.style.opacity = '0'; 
        }

        overlay.innerHTML = ''; overlay.style.display = 'block';
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                overlay.style.display = 'none'; this.selectedSq = null; this.legalMoves = [];
                if (typeof this.renderBoard === 'function') this.renderBoard(false); 
            }
        };

        let pieces = ['q', 'n', 'r', 'b']; 
        if (this.#game && this.#game.gameMode === 'antichess') pieces.push('k');
        
        pieces.forEach((type, i) => {
            const btn = document.createElement('div'); btn.className = `promo-option promo-${color}`;
            btn.innerHTML = this.getPieceHTML({ color: color, type: type.toUpperCase() });
            
            let targetRow = rank === 0 ? (rank + i) : (rank - i); let targetCol = file;
            if (this.flipped) { targetRow = 7 - targetRow; targetCol = 7 - targetCol; }

            btn.style.left = (targetCol * 12.5) + '%'; btn.style.top = (targetRow * 12.5) + '%';
            btn.style.transform = 'scale(0)';
            setTimeout(() => { btn.style.transform = 'scale(1)'; setTimeout(() => { btn.style.transform = ''; }, 200); }, i * 60);

            btn.onclick = (e) => {
                e.stopPropagation(); overlay.style.display = 'none'; callback(type);
            };
            overlay.appendChild(btn);
        });
    }
openEmbedImporter() {
        const modal = document.getElementById('embedImporterModal');
        if (modal) modal.style.display = 'flex';
    }
closeEmbedImporter() {
        const modal = document.getElementById('embedImporterModal');
        if (modal) modal.style.display = 'none';
    }
renderCharts(force = false) {
        if (typeof Chart === 'undefined') return;
        if (this.evalChart || this.timeChart) this.updateChartActiveLine();

        let lastNode = this.#game.rootNode;
        
        while (lastNode && lastNode.children.length > 0) lastNode = lastNode.children[0];

        if (!force && this.evalChart && this._lastChartedFen === lastNode.fen) return; 
        this._lastChartedFen = lastNode.fen;

        if (this._chartRenderTimeout) clearTimeout(this._chartRenderTimeout);
        if (force) this.forceRenderCharts();
        else this._chartRenderTimeout = setTimeout(() => { this.forceRenderCharts(); }, 150); 
    }
clearArrows() {
        if (this.arrowLayer) this.arrowLayer.innerHTML = '';
        if (this.tempArrowLayer) this.tempArrowLayer.innerHTML = '';
    }
importEmbed(text) {
        if (this.#game && typeof this.#game.loadPGN === 'function') {
            this.#game.loadPGN(text);
            this.renderBoard(false);
            this.updateHistory(true);
        }
    }
initSidebarResizers() {
        const sidebar = document.getElementById('mainSidebar'); 
        const handleW = document.getElementById('resizeSidebarW');
        if (!sidebar) return;

        const savedWidth = localStorage.getItem('sidebarWidth') || '520px';
        sidebar.style.width = savedWidth; sidebar.style.minWidth = savedWidth; sidebar.style.maxWidth = savedWidth; sidebar.style.marginLeft = '-16px'; 

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

                const dx = (moveEvent.clientX - startX) / scale;
                let newPgnW = startPgnW + dx;
                const screenW = 2600;
                const leftPanel = document.querySelector('.left-panel');
                const leftW = (leftPanel && leftPanel.style.display !== 'none') ? leftPanel.offsetWidth : 0;
                const boardWrapper = document.getElementById('board-wrapper');
                const boardW = boardWrapper ? boardWrapper.offsetWidth : 600;
                
                const TOTAL_FIXED_SPACE = 80 + 20 + 40 + 32 + 24 + leftW;
                const maxPgnW = screenW - boardW - TOTAL_FIXED_SPACE;

                if (newPgnW > maxPgnW) newPgnW = maxPgnW;
                if (newPgnW < 300) newPgnW = 300;
                
                sidebar.style.width = `${newPgnW}px`; sidebar.style.minWidth = `${newPgnW}px`; sidebar.style.maxWidth = `${newPgnW}px`;
            };

            const stopDragW = () => {
                handleW.classList.remove('active'); document.body.style.userSelect = '';
                document.removeEventListener('mousemove', doDragW); document.removeEventListener('mouseup', stopDragW);
                localStorage.setItem('sidebarWidth', sidebar.style.width);
                window.dispatchEvent(new Event('resize')); 
            };

            handleW.addEventListener('mousedown', (e) => {
                e.preventDefault(); handleW.classList.add('active'); document.body.style.userSelect = 'none';
                startX = e.clientX; startPgnW = sidebar.offsetWidth;
                document.addEventListener('mousemove', doDragW); document.addEventListener('mouseup', stopDragW);
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
            const container = document.querySelector('.main-container');
            if (container) container.style.padding = '30px 20px 20px 20px'; 
            const engineReservedSpace = 32; 
            
            if (boardW < 300) boardW = 300;
            boardW = Math.floor(boardW / 8) * 8; 

            if (leftPanel && leftPanel.style.display !== 'none') {
                leftPanel.style.width = `${leftW}px`; leftPanel.style.minWidth = `${leftW}px`; leftPanel.style.maxWidth = `${leftW}px`; leftPanel.style.flex = 'none';
            }
            if (rightSidebar) {
                rightSidebar.style.width = `${pgnW}px`; rightSidebar.style.minWidth = `${pgnW}px`; rightSidebar.style.maxWidth = `${pgnW}px`; rightSidebar.style.flex = 'none'; rightSidebar.style.marginLeft = '16px'; 
            }
            if (this.boardWrapper) {
                this.boardWrapper.style.width = `${boardW}px`; this.boardWrapper.style.minWidth = `${boardW}px`; this.boardWrapper.style.maxWidth = `${boardW}px`; this.boardWrapper.style.flex = 'none'; 
            }

            const rowW = boardW + engineReservedSpace;
            const boardRow = document.querySelector('.board-container-row');
            if (boardRow) {
                boardRow.style.width = `${rowW}px`; boardRow.style.minWidth = `${rowW}px`; boardRow.style.maxWidth = `${rowW}px`; boardRow.style.flex = 'none'; boardRow.style.justifyContent = 'flex-start'; 
            }
            const boardSection = document.querySelector('.board-section');
            if (boardSection) {
                boardSection.style.width = `${rowW}px`; boardSection.style.minWidth = `${rowW}px`; boardSection.style.maxWidth = `${rowW}px`; boardSection.style.flex = 'none';
            }
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
            let newBoardW = startBoardW + (dx * 2);
            validateAndApplyLayout(newBoardW);
            window.dispatchEvent(new Event('resize')); 
        };
        
        const stopResize = () => {
            document.removeEventListener('mousemove', doResize); document.removeEventListener('mouseup', stopResize);
            document.body.style.cursor = ''; 
            if (this.boardWrapper) localStorage.setItem('chessBoardSize', this.boardWrapper.style.width);
        };
        
        if (handle) {
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault(); startX = e.clientX; startBoardW = this.boardWrapper.offsetWidth; document.body.style.cursor = 'ew-resize'; 
                document.addEventListener('mousemove', doResize); document.addEventListener('mouseup', stopResize);
            });
        }
        setTimeout(() => {
            const savedBoard = localStorage.getItem('chessBoardSize') ? parseInt(localStorage.getItem('chessBoardSize')) : 600;
            validateAndApplyLayout(savedBoard); window.dispatchEvent(new Event('resize'));
        }, 50);
    }
handleMouseDown(e) {
        const state = this.#game ? this.#game.getReader() : null;
        if (!state) return;
        if (state.isPaused) { this.showNotification("Game is Paused", "Info"); return; }

        if (e.button === 2) { 
            e.preventDefault(); e.stopPropagation();
            
            if (this.pendingSpell) {
                this.pendingSpell = null;
                if (this.#game && typeof this.#game.cancelDraft === 'function') this.#game.cancelDraft();
                this.renderBoard(false);
            }

            if (state.premoves.length > 0) { this.#game.clearPremoves(); this.renderBoard(false); return; }
            const sq = this.getSquareFromCoords(e.clientX, e.clientY);
            if (sq !== -1) { this.isRightClick = true; this.arrowDragStart = sq; }
        } else if (e.button === 0) { 
            
            if (this.pendingSpell) {
                this.pendingSpell = null;
                if (this.#game && typeof this.#game.cancelDraft === 'function') this.#game.cancelDraft();
                this.renderBoard(false);
            }

            if (state.arrows.length > 0 || state.circles.length > 0) { this.#game.clearAnnotations(); this.renderArrows(); }
            if (state.premoves.length > 0) { this.#game.clearPremoves(); this.renderBoard(false); }
            if (this.selectedSq !== null) { this.selectedSq = null; this.legalMoves = []; this.renderBoard(false); }
        }
    }
handleMouseMove(e) {
        if (this.isRightClick && this.arrowDragStart !== null) {
            const sq = this.getSquareFromCoords(e.clientX, e.clientY);
            this.tempArrowLayer.innerHTML = ''; 
            if (sq !== -1 && sq !== this.arrowDragStart) {
                let color = 'green';
                if (e.shiftKey) color = 'red'; else if (e.altKey) color = 'blue'; else if (e.ctrlKey) color = 'orange';
                this.drawArrow(this.tempArrowLayer, this.arrowDragStart, sq, color, 0.5);
            }
        }
    }
handleMouseUp(e) {
        if (this.isRightClick && this.arrowDragStart !== null) {
            const sq = this.getSquareFromCoords(e.clientX, e.clientY);
            this.tempArrowLayer.innerHTML = ''; 
            let color = 'green';
            if (e.shiftKey) color = 'red'; else if (e.altKey) color = 'blue'; else if (e.ctrlKey) color = 'orange';
            if (sq === this.arrowDragStart) { this.#game.toggleCircle(sq, color); } 
            else if (sq !== -1) { this.#game.toggleArrow(this.arrowDragStart, sq, color); }
            this.renderArrows(); this.isRightClick = false; this.arrowDragStart = null;
        }
    }
getSquareCenter(idx) {
        let r = idx >> 3; let c = idx & 7;
        if (this.flipped) { r = 7 - r; c = 7 - c; }
        return { x: (c * 12.5) + 6.25, y: (r * 12.5) + 6.25 };
    }
renderArrows() {
        if (!this.arrowLayer) return;
        this.arrowLayer.innerHTML = '';
        const state = this.#game ? this.#game.getReader() : null;
        if (!state) return;

        let arrowsToDraw = [...(state.arrows || [])];
        let circlesToDraw = [...(state.circles || [])];
        if (this.dragData && this.dragData.type === 'arrow') arrowsToDraw.push({ from: this.dragData.from, to: this.dragData.to, color: this.dragData.color });
        
        const getSqIdx = (val) => {
            if (typeof val === 'number') return val;
            if (typeof val === 'string' && val.length === 2) { let f = val.charCodeAt(0) - 97; let r = 8 - parseInt(val[1], 10); return r * 8 + f; }
            return -1;
        };

        circlesToDraw.forEach(circle => {
            let sqIdx = getSqIdx(circle.index !== undefined ? circle.index : (circle.sq !== undefined ? circle.sq : circle.square));
            if (sqIdx >= 0 && sqIdx <= 63) this.drawCircle(this.arrowLayer, sqIdx, circle.color);
        });

        arrowsToDraw.forEach(arrow => {
            let fromIdx = getSqIdx(arrow.from); let toIdx = getSqIdx(arrow.to);
            if (fromIdx >= 0 && fromIdx <= 63 && toIdx >= 0 && toIdx <= 63) this.drawArrow(this.arrowLayer, fromIdx, toIdx, arrow.color, 0.6);
        });
    }
getNodeVisuals(node) {
        if ((node.arrows && node.arrows.length > 0) || (node.circles && node.circles.length > 0)) return `<span style="display:inline-block;width:6px;height:6px;background-color:#00b023;border-radius:50%;margin-left:3px;margin-bottom:3px;vertical-align:middle;box-shadow:0 0 4px #00b023;"title="Has Annotations"></span>`;
        return'';
    }
initSoundSettings() {
        const select = document.getElementById('soundSetSelect');
        if (!select || typeof SOUND_SETS === 'undefined') return;
        select.innerHTML = '';
        const themes = Object.keys(SOUND_SETS).sort();
        themes.forEach(key => {
            const option = document.createElement('option'); option.value = key;
            let displayName = key.replace(/_/g, ' '); option.text = displayName.charAt(0).toUpperCase() + displayName.slice(1); select.appendChild(option);
        });
        if (typeof SoundManager !== 'undefined') select.value = SoundManager.currentSet;
        select.onchange = function(e) { if (typeof SoundManager !== 'undefined') SoundManager.setTheme(e.target.value); };
    }
initVolume() {
        const savedVol = localStorage.getItem('chessVolume'); const vol = savedVol !== null ? parseInt(savedVol) : 70;
        this.volume = vol / 100; 
        const slider = document.getElementById('masterVolume'); const label = document.getElementById('volumeValue');
        if (slider) slider.value = vol; if (label) label.innerText = vol + '%';
    }
updateVolume(val) {
        const label = document.getElementById('volumeValue'); if (label) label.innerText = val + '%';
        this.volume = parseInt(val) / 100; localStorage.setItem('chessVolume', val);
        if (this.#game && !this.#game.isPlayingLiveGame) SoundManager.play('move', this.volume);
    }
initDraggableSettings() {
        const panel = document.getElementById('settingsPanel'); if (!panel) return;
        const header = panel.querySelector('.settings-header'); if (!header) return;
        panel.style.top = '60px'; panel.style.left = '20px'; panel.style.right = 'auto'; panel.style.bottom = 'auto'; panel.style.transform = 'translate3d(0px, 0px, 0px)';
        let isDragging = false; let startX = 0; let startY = 0; let currentX = 0; let currentY = 0;

        header.addEventListener("mousedown", (e) => {
            if (e.target === header || header.contains(e.target)) {
                if (e.target.classList.contains('close-settings')) return;
                isDragging = true; startX = e.clientX; startY = e.clientY;
            }
        });
        document.addEventListener("mouseup", () => isDragging = false);
        document.addEventListener("mousemove", (e) => {
            if (!isDragging) return; e.preventDefault();
            const scale = window.appScale || 1;
            currentX += (e.clientX - startX) / scale; currentY += (e.clientY - startY) / scale;
            startX = e.clientX; startY = e.clientY;
            panel.style.transform = `translate3d(${currentX}px, ${currentY}px, 0px)`;
        });
    }
drawArrow(container, fromIdx, toIdx, colorName, opacity=0.5) { 
        const cMap = { 'green': '#15781B', 'red': '#882020', 'blue': '#003088', 'orange': '#e68f00' };
        const color = cMap[colorName] || colorName;
        const fR = fromIdx >> 3, fC = fromIdx & 7; const tR = toIdx >> 3, tC = toIdx & 7;
        let x1 = (fC + 0.5) * 12.5, y1 = (fR + 0.5) * 12.5; let x2 = (tC + 0.5) * 12.5, y2 = (tR + 0.5) * 12.5;

        if (this.flipped) {
            x1 = ((7 - fC) + 0.5) * 12.5; y1 = ((7 - fR) + 0.5) * 12.5;
            x2 = ((7 - tC) + 0.5) * 12.5; y2 = ((7 - tR) + 0.5) * 12.5;
        }
        const dx = x2 - x1; const dy = y2 - y1; const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return;

        const headLength = 4.5; const headWidth = 5.625; const shaftWidth = 1.75; 
        const startMargin = 0.0; const endMargin = 0.0;
        const ux = dx / len; const uy = dy / len; const vx = -uy; const vy = ux;

        const startX = x1 + ux * startMargin; const startY = y1 + uy * startMargin;
        const endX = x2 - ux * endMargin; const endY = y2 - uy * endMargin;
        const shaftLen = (len - startMargin - endMargin) - headLength;

        const p1x = startX + vx * (shaftWidth / 2); const p1y = startY + vy * (shaftWidth / 2);
        const p2x = startX + ux * shaftLen + vx * (shaftWidth / 2); const p2y = startY + uy * shaftLen + vy * (shaftWidth / 2);
        const p3x = startX + ux * shaftLen + vx * (headWidth / 2); const p3y = startY + uy * shaftLen + vy * (headWidth / 2);
        const p4x = endX; const p4y = endY;
        const p5x = startX + ux * shaftLen - vx * (headWidth / 2); const p5y = startY + uy * shaftLen - vy * (headWidth / 2);
        const p6x = startX + ux * shaftLen - vx * (shaftWidth / 2); const p6y = startY + uy * shaftLen - vy * (shaftWidth / 2);
        const p7x = startX - vx * (shaftWidth / 2); const p7y = startY - vy * (shaftWidth / 2);

        const d = `M ${p1x} ${p1y} L ${p2x} ${p2y} L ${p3x} ${p3y} L ${p4x} ${p4y} L ${p5x} ${p5y} L ${p6x} ${p6y} L ${p7x} ${p7y} Z`;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d); path.setAttribute('fill', color); path.setAttribute('opacity', opacity); path.setAttribute('stroke', 'none');
        container.appendChild(path);
    }
    drawCircle(container, idx, colorName) {
        const cMap = { 'green':'#15781B', 'red':'#882020', 'blue':'#003088', 'orange':'#e68f00' };
        const color = cMap[colorName] || colorName;
        const r = idx >> 3, c = idx & 7;
        let cx = (c + 0.5) * 12.5; let cy = (r + 0.5) * 12.5;
        if (this.flipped) { cx = ((7 - c) + 0.5) * 12.5; cy = ((7 - r) + 0.5) * 12.5; }
        const circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
        circle.setAttribute('cx', cx); circle.setAttribute('cy', cy); circle.setAttribute('r','5.5');
        circle.setAttribute('stroke', color); circle.setAttribute('stroke-width','0.5'); circle.setAttribute('fill','none'); circle.setAttribute('opacity','0.8');
        container.appendChild(circle);
    }
getAnnotationDotColor(node) {
        if (!node) return null;
        let cName = null;
        if (node.arrows && node.arrows.length > 0) cName = node.arrows[0].color;
        else if (node.circles && node.circles.length > 0) cName = node.circles[0].color;
        if (!cName) return null;
        const themeAccent = getComputedStyle(document.documentElement).getPropertyValue('--theme-accent').trim() || '#38bdf8';
        const colorMap = { 'green': '#15781B', 'red': '#882020', 'blue': '#003088', 'orange': '#e68f00', 'theme': themeAccent };
        return colorMap[cName] || cName;
    }
toggleSettings() { document.getElementById('settingsPanel').classList.toggle('visible'); }
updatePuzzleStats() {
        if (!this.#game) return;
        const timerEl = document.getElementById('puzTimer'); const scoreEl = document.getElementById('puzScore'); const strikesEl = document.getElementById('puzStrikes');
        if (timerEl) {
            if (this.#game.puzzleMode === 'survival') { timerEl.innerText = "SURVIVAL"; timerEl.style.color = "#fa412d"; } 
            else {
                const t = Math.max(0, this.#game.puzzleTimeRemaining || 0);
                const m = Math.floor(t / 60).toString().padStart(2, '0'); const s = (t % 60).toString().padStart(2, '0');
                timerEl.innerText = `${m}:${s}`; timerEl.style.color = t < 30 ? "#fa412d" : "#fff";
            }
        }
        if (scoreEl) scoreEl.innerText = this.#game.puzzleScore || 0;
        if (strikesEl) {
            const maxStrikes = 3; const current = this.#game.puzzleStrikes || 0;
            let hearts = "";
            for(let i = 0; i < (maxStrikes - current); i++) hearts += "✅";
            for(let i = 0; i < current; i++) hearts += "❌"; 
            strikesEl.innerText = hearts;
        }
    }
updatePuzzleUI(state, puzzleData) {
        const controls = document.getElementById('puzzleControls'); const active = document.getElementById('puzzleActive');
        const status = document.getElementById('puzzleStatus'); const nextBtn = document.getElementById('nextPuzzleBtn');
        const solBtn = document.getElementById('showSolBtn'); const info = document.getElementById('puzzleInfo'); const statsBar = document.getElementById('puzzleStatsBar');
        if (state === "loading") { if(controls) controls.style.opacity = "0.5"; } 
        else if (state === "controls") { if(controls) { controls.style.display = "block"; controls.style.opacity = "1"; } if(active) active.style.display = "none"; } 
        else if (state === "active") {
            if(controls) controls.style.display = "none"; if(active) active.style.display = "flex";
            if(status) { status.innerText = "Your Turn"; status.style.color = "#fff"; }
            if(info && puzzleData) info.innerHTML = `<span style="color:#e68f00; font-weight:bold; font-size:14px;">Rating: ${puzzleData.rating || '?'}</span><span style="color:#666; margin-left:8px; font-size:12px;">ID: ${puzzleData.id || 'Unknown'}</span>`;
            const isRush = ['3min', '5min', 'survival'].includes(this.#game.puzzleMode);
            if (isRush) {
                if(nextBtn) nextBtn.style.display = "none"; if(solBtn) solBtn.style.display = "none"; if(statsBar) statsBar.style.display = "flex";
                this.updatePuzzleStats(); 
            } else {
                if(nextBtn) nextBtn.style.display = "none"; if(solBtn) solBtn.style.display = "inline-block"; if(statsBar) statsBar.style.display = "none"; 
            }
        }
    }
renderChapters() {
        const container = document.getElementById('chapters-list-container');
        if (!container || !this.#game) return;
        container.innerHTML = '';
        this.#game.chapters.forEach((chap, idx) => {
            const isActive = idx === this.#game.activeChapterIndex;
            const el = document.createElement('div');
            el.style.cssText = `display: flex; align-items: center; padding: 8px 12px; cursor: pointer; color: ${isActive ? '#fff' : '#bababa'}; background: ${isActive ? '#383531' : 'transparent'}; border-left: 3px solid ${isActive ? '#d85000' : 'transparent'}; font-size: 13px; transition: background 0.1s; pointer-events: auto;`;
            el.onmouseenter = () => { if(!isActive) el.style.background = '#302e2b'; const gear = el.querySelector('.chapter-gear'); if (gear) gear.style.opacity = '1'; };
            el.onmouseleave = () => { if(!isActive) el.style.background = 'transparent'; const gear = el.querySelector('.chapter-gear'); if (gear) gear.style.opacity = '0'; };
            el.innerHTML = `<span style="width: 25px; color: #888; font-size: 12px; font-family: monospace;">${idx + 1}</span><span style="flex-grow: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: ${isActive ? '600' : 'normal'};">${chap.title}</span><button class="chapter-gear" title="Edit chapter" style="background: none; border: none; color: #bababa; display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0; padding: 4px; transition: opacity 0.2s;">⚙️</button>`;
            el.onclick = () => { if (this.#game) this.#game.loadChapter(idx); };
            const gearBtn = el.querySelector('.chapter-gear');
            if (gearBtn) gearBtn.onclick = (e) => { e.stopPropagation(); this.openChapterModal(idx); };
            container.appendChild(el);
        });
        const countSpan = document.getElementById('chapter-count-header');
        if (countSpan) countSpan.innerText = `${this.#game.chapters.length} ${this.#game.chapters.length === 1 ? 'Chapter' : 'Chapters'}`;
    }
openChapterModal(idx = -1) {
        const modal = document.getElementById('chapterModal'); const title = document.getElementById('chapterModalTitle');
        const nameInput = document.getElementById('chapterNameInput'); const orientInput = document.getElementById('chapterOrientationInput');
        const tabs = document.getElementById('chapterModalTabs'); const saveBtn = document.getElementById('saveChapterBtn'); const delBtn = document.getElementById('deleteChapterBtn');
        window._editingChapterIdx = idx; 
        if (idx === -1) {
            title.innerText = "New chapter"; nameInput.value = `Chapter ${this.#game.chapters.length + 1}`; orientInput.value = 'w';
            tabs.style.display = 'flex'; saveBtn.innerText = "CREATE CHAPTER"; delBtn.style.display = "none";
        } else {
            const chap = this.#game.chapters[idx]; title.innerText = "Edit chapter"; nameInput.value = chap.title; orientInput.value = chap.orientation || 'w';
            tabs.style.display = 'none'; saveBtn.innerText = "SAVE CHAPTER"; delBtn.style.display = this.#game.chapters.length > 1 ? "block" : "none";
        }
        modal.style.display = 'flex'; setTimeout(() => { nameInput.focus(); nameInput.select(); }, 50);
    }
switchChapterTab(tabName) {
        window._activeChapterTab = tabName;
        ['empty', 'editor', 'url', 'fen', 'pgn'].forEach(t => { const el = document.getElementById('cTab-' + t); if (el) { el.style.color = '#888'; el.style.borderBottom = 'none'; } });
        const activeEl = document.getElementById('cTab-' + tabName); if (activeEl) { activeEl.style.color = '#d85000'; activeEl.style.borderBottom = '2px solid #d85000'; }
        const dynamicArea = document.getElementById('chapterModalDynamicArea'); const dataInput = document.getElementById('chapterDataInput');
        if (!dynamicArea || !dataInput) return;
        if (tabName === 'empty') { dynamicArea.style.display = 'none'; } 
        else if (tabName === 'editor') {
            dynamicArea.style.display = 'block'; dataInput.value = this.#game ? this.#game.generateFEN() : ""; dataInput.disabled = true; dataInput.style.opacity = "0.6";
        } else {
            dynamicArea.style.display = 'block'; dataInput.disabled = false; dataInput.style.opacity = "1"; dataInput.value = "";
            if (tabName === 'fen') dataInput.placeholder = "Paste starting FEN here...";
            if (tabName === 'pgn') dataInput.placeholder = "Paste PGN game data here...";
            if (tabName === 'url') dataInput.placeholder = "Paste Lichess game URL (e.g., https://lichess.org/...) or raw .pgn link";
            setTimeout(() => dataInput.focus(), 50);
        }
    }
openStudyManager() { if (this.#game) this.#game.loadAllStudies(); this.renderStudyList(); document.getElementById('studyManagerModal').style.display = 'flex'; }
openExportStudyModal() {
        if (this.#game) this.#game.saveActiveChapter();
        const container = document.getElementById('exportChapterList'); if (!container) return;
        container.innerHTML = '';
        this.#game.chapters.forEach((ch, idx) => {
            const label = document.createElement('label'); label.style.cssText = "display: flex; gap: 10px; align-items: center; padding: 5px; cursor: pointer; color: #ccc;";
            const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true; cb.className = 'chapter-export-cb'; cb.dataset.idx = idx; cb.style.cursor = "pointer";
            const text = document.createElement('span'); text.innerText = `${idx + 1}. ${ch.title}`;
            label.appendChild(cb); label.appendChild(text); container.appendChild(label);
        });
        document.getElementById('exportStudyModal').style.display = 'flex';
    }
toggleAllChapters(state) { document.querySelectorAll('.chapter-export-cb').forEach(cb => cb.checked = state); }
openAddToStudyModal() {
        // Hide Game Over Modal if it's open
        const gameOverModal = document.getElementById('gameOverModal');
        if (gameOverModal) gameOverModal.style.display = 'none';

        // Make sure studies are loaded into memory
        if (this.#game && typeof this.#game.loadAllStudies === 'function') {
            this.#game.loadAllStudies();
        }

        // Create or get the Save Modal
        let saveModal = document.getElementById('addToStudyModal');
        if (!saveModal) {
            saveModal = document.createElement('div');
            saveModal.id = 'addToStudyModal';
            saveModal.className = 'modal-overlay';
            saveModal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.8); z-index: 100000; display: flex; align-items: center; justify-content: center;';
            document.body.appendChild(saveModal);
        }

        const studies = (this.#game && this.#game.allStudies) ? this.#game.allStudies : [];
        
        let studyOptions = studies.map((study, idx) => {
            const title = study.title || `Study ${idx + 1}`;
            return `<button class="btn-secondary" style="width:100%; margin-bottom:8px; text-align:left; padding:8px; background:#333; border:none; color:#fff; cursor:pointer; border-radius:4px;" 
                    onclick="window.app.game.saveCurrentGameToStudy('${study.id}')">📁 ${title}</button>`;
        }).join('');

        saveModal.innerHTML = `
            <div class="modal-content" style="background:#2c2c2c; padding:20px; border-radius:8px; width:300px; color:#fff; display:flex; flex-direction:column;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <h3 style="margin:0;">Save to Study</h3>
                    <span onclick="document.getElementById('addToStudyModal').style.display='none'" style="cursor:pointer; font-size:20px; color:#aaa;">&times;</span>
                </div>
                
                <div style="max-height: 200px; overflow-y: auto; margin-bottom:15px;">
                    ${studyOptions || '<p style="color:#888; font-size:14px; text-align:center;">No existing studies.</p>'}
                </div>
                
                <hr style="border:none; border-top:1px solid #444; margin:0 0 15px 0;">
                
                <input type="text" id="newStudyInput" placeholder="New Study Title..." style="padding:8px; margin-bottom:10px; background:#1e1e1e; color:#fff; border:1px solid #444; border-radius:4px;">
                <button class="btn-primary" style="padding:8px;" onclick="window.app.game.saveCurrentGameToStudy('NEW')">Create & Save</button>
            </div>
        `;
        
        saveModal.style.display = 'flex';
    }
importFEN() { 
        const fen = document.getElementById('exportFenText').value.trim();
        if (fen && this.#game) {
            this.#game.loadNewPosition(fen); 
            document.getElementById('shareExportModal').style.display = 'none';
            this.switchTab('analysis');
        }
    }
importPGN() { 
        const pgnText = document.getElementById('exportPgnText').value.trim();
        if (pgnText && this.#game) {
            const success = this.#game.importStudy(pgnText);
            if (success) {
                this.switchTab('study');
                if (typeof this.renderChapters === 'function') this.renderChapters();
                if (typeof this.renderStudyList === 'function') this.renderStudyList();
            }
            const modal = document.getElementById('shareExportModal');
            if (modal) modal.style.display = 'none';
        }
    }
quickImport() { 
        const text = document.getElementById('quickImportText').value.trim();
        if (!text) return;
        
        if (this.#game) this.#game.mode = 'analysis';
        this.switchTab('analysis');
        
        if (text.includes('[Event') || text.includes('1.')) {
            if (this.#game) this.#game.loadPGN(text);
        } else {
            if (this.#game) this.#game.loadNewPosition(text);
        }
        
        document.getElementById('quickImportModal').style.display = 'none';
    }
async _drawBoardToCanvas(canvas, ctx) { 
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
        
        const state = this.#game ? this.#game.getReader() : null;
        if (!state || !state.board || !this._imgCache) return;

        for (let i = 0; i < 64; i++) {
            const p = state.board[i];
            if (p) {
                let r = i >> 3;
                let c = i & 7;
                if (this.flipped) { r = 7 - r; c = 7 - c; }
                
                let code = p.type === 'duck' ? 'duck' : (p.color + p.type.toUpperCase());
                const cachedImg = this._imgCache[code];
                
                if (cachedImg) {
                    if (p.isBoardB) {
                        ctx.filter = 'hue-rotate(180deg) drop-shadow(0 0 5px cyan)';
                        ctx.globalAlpha = 0.6;
                    }
                    ctx.drawImage(cachedImg, c * canvasSq, r * canvasSq, canvasSq, canvasSq);
                    if (p.isBoardB) {
                        ctx.filter = 'none';
                        ctx.globalAlpha = 1.0;
                    }
                }
            }
        }

        if (state.gameMode === 'duck' && state.duck_sq !== undefined && state.duck_sq !== -1) {
            let dr = state.duck_sq >> 3;
            let dc = state.duck_sq & 7;
            if (this.flipped) { dr = 7 - dr; dc = 7 - dc; }
            
            if (this._imgCache['duck']) {
                ctx.drawImage(this._imgCache['duck'], dc * canvasSq, dr * canvasSq, canvasSq, canvasSq);
            }
        }
    }
    async generateGIF() { 
        const previewArea = document.getElementById('gifPreviewArea'); 
        if (!previewArea) return;
        if (typeof window.GIF === 'undefined') { 
            previewArea.innerHTML = "<span style='color: #fa412d;'>Error: gif.js library missing!</span>"; 
            return; 
        }
        previewArea.innerHTML = "Preloading chess pieces... <br>Please wait.";
        await this.preloadPieceImages();

        previewArea.innerHTML = "Recording exact UI frames... <br>(Please do not click the board)";
        
        const gifSize = 400; 
        
        const gif = new window.GIF({ 
            workers: 2, quality: 10, width: gifSize, height: gifSize, 
            workerScript: './js/gif.worker.js', background: '#ffffff', transparent: null 
        });
        
        gif.on('progress', function(p) { previewArea.innerHTML = `Encoding Video: ${Math.round(p * 100)}%`; });
        gif.on('finished', function(blob) {
            const url = URL.createObjectURL(blob); 
            previewArea.innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:contain;">`;
            const a = document.createElement('a'); a.href = url; 
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ""); 
            a.download = `chess_game_${dateStr}.gif`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        });

        if (!this.#game) return;

        // 1. SAVE USER STATE
        const originalNodeId = this.#game.currentNode ? this.#game.currentNode.id : null;
        const originalMode = this.#game.mode;

        // 2. ISOLATE ENGINE FROM BOTS
        this.#game.mode = 'analysis'; 

        // 3. DISABLE CSS SLIDING (Force instant teleportation for crisp snapshots)
        let styleOverride = document.getElementById('gif-anim-killer');
        if (!styleOverride) {
            styleOverride = document.createElement('style');
            styleOverride.id = 'gif-anim-killer';
            styleOverride.innerHTML = `
                .piece, .square, .highlight-w, .highlight-b, .last-move, .in-check {
                    transition: none !important;
                    animation: none !important;
                    transform-origin: center !important;
                }
            `;
            document.head.appendChild(styleOverride);
        }
        void document.body.offsetHeight;
        const originalRenderBoard = this.renderBoard;
        this.renderBoard = (animate, ...args) => {
            this._isExecutingMove = false; 
            originalRenderBoard.call(this, false, ...args); 
        };

        // 5. SILENT REWIND TO START
        // Bypasses main.js locks by walking the history tree backward silently.
        let curr = this.#game.currentNode;
        while (curr && curr.parent) {
            curr = curr.parent;
        }
        this.#game.currentNode = curr;
        this.#game.loadFEN(curr.fen, this.#game.gameMode, true);
        
        // Wipe drag artifacts
        this.clearGhostPiece();
        document.querySelectorAll('.square').forEach(sq => {
            sq.classList.remove('selected', 'selected-w', 'selected-b', 'last-move');
        });
        
        // Render the clean Start Position natively
        this.renderBoard(false);

        let isFirstFrame = true;

        const captureFrameLoop = async () => {
            // A) DOM SETTLE DELAY
            // Give the browser exactly 250ms to perfectly paint your UI (tails, highlights, CSS)
            await new Promise(r => setTimeout(r, 250));

            // B) UNIQUE CANVAS (Fixes gif.js memory corruption bug)
            const frameCanvas = document.createElement('canvas'); 
            frameCanvas.width = gifSize; frameCanvas.height = gifSize; 
            const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true });

            // C) NATIVE SNAPSHOT
            // Because we use your native draw method, the fidelity is 100% perfect!
            await this._drawBoardToCanvas(frameCanvas, frameCtx);

            if (isFirstFrame) {
                // Force the Windows viewer to pause by physically printing the Start Position 3 times!
                gif.addFrame(frameCanvas, { delay: 400, copy: true });
                gif.addFrame(frameCanvas, { delay: 400, copy: true });
                gif.addFrame(frameCanvas, { delay: 400, copy: true });
                isFirstFrame = false;
            } else {
                gif.addFrame(frameCanvas, { delay: 600, copy: true });
            }

            // E) ADVANCE NATIVELY
            // stepForward triggers your UI to naturally apply the last-move highlights and tails!
            const moved = this.#game.stepForward();

            if (moved) {
                captureFrameLoop();
            } else {
                // GAME OVER
                gif.addFrame(frameCanvas, { delay: 3000, copy: true }); // Hold Checkmate
                previewArea.innerHTML = "Processing final GIF...<br>Please wait.";
                
                if (styleOverride) styleOverride.remove();
                this.renderBoard = originalRenderBoard;
                this.#game.mode = originalMode;

                if (originalNodeId && typeof this.#game.goToNodeId === 'function') {
                    this.#game.goToNodeId(originalNodeId, false);
                }
                
                this.renderBoard(true);
                gif.render();
            }
        };

        // START!
        captureFrameLoop();
    }
exportEmbed() { 
        if (!this.#game) return;
        const modal = document.getElementById('exportEmbededModal');
        if (modal) {
            const mainPieceSelect = document.getElementById('assetType'); 
            const embedPieceSelect = document.getElementById('embedPieceTheme');
            if (!this._embedSelectsPopulated && mainPieceSelect && embedPieceSelect) { 
                embedPieceSelect.innerHTML = mainPieceSelect.innerHTML; 
                // Remove local option (iframes can't load local PC files)
                Array.from(embedPieceSelect.options).forEach(opt => {
                    if (opt.value === 'local') opt.remove();
                });
                this._embedSelectsPopulated = true; 
            }
            if (mainPieceSelect && embedPieceSelect) {
                const currentPiece = mainPieceSelect.value;
                embedPieceSelect.value = currentPiece !== 'local' ? currentPiece : 'cburnett';
            }

            const activeThemeDiv = document.querySelector('.theme-preset.active span'); 
            const embedThemeSelect = document.getElementById('embedBoardTheme');
            if (activeThemeDiv && embedThemeSelect) embedThemeSelect.value = activeThemeDiv.innerText.trim().toLowerCase();

            if (!this._embedListenersSetup) {
                ['embedBoardTheme', 'embedPieceTheme', 'embedShowCoords', 'embedPuzzleMode', 'embedWidth', 'embedHeight'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.addEventListener('change', () => this.generateEmbedCodes());
                    if (el && (id === 'embedWidth' || id === 'embedHeight')) el.addEventListener('input', () => this.generateEmbedCodes());
                });
                const sliderEl = document.getElementById('embedSizeSlider');
                if (sliderEl) {
                    sliderEl.addEventListener('input', (e) => {
                        const val = e.target.value; 
                        const heightEl = document.getElementById('embedHeight'); 
                        if (heightEl) heightEl.value = val + 'px';
                        this.generateEmbedCodes();
                    });
                }
                this._embedListenersSetup = true;
            }
            this.generateEmbedCodes(); 
            modal.style.display = 'flex';
            if (typeof this.resizeApp === 'function') this.resizeApp();
        } else { 
            this.generateEmbedCodes(true); 
        }
    }
generateEmbedCodes(copyToClipboard = false) { 
        if (!this.#game) return;
        const pgn = typeof this.#game.generatePGN === 'function' ? this.#game.generatePGN('both') : '';
        const baseUrl = window.location.origin + window.location.pathname; 
        const gameId = this.#game.id || Math.floor(Math.random() * 10000000); 
        const embedId = 'embed-' + gameId;
        
        const boardEl = document.getElementById('embedBoardTheme'); 
        const pieceEl = document.getElementById('embedPieceTheme');
        const coordsEl = document.getElementById('embedShowCoords'); 
        const puzzleEl = document.getElementById('embedPuzzleMode');
        const widthEl = document.getElementById('embedWidth'); 
        const heightEl = document.getElementById('embedHeight');
        
        const theme = boardEl ? boardEl.value : 'default'; 
        const pieces = pieceEl ? pieceEl.value : 'cburnett';
        const coords = coordsEl ? coordsEl.checked : true; 
        const puzzle = puzzleEl ? puzzleEl.checked : false;
        const width = widthEl && widthEl.value.trim() !== '' ? widthEl.value : '100%'; 
        const height = heightEl && heightEl.value.trim() !== '' ? heightEl.value : '480px';

        let params = new URLSearchParams();
        if (pgn) params.append('pgn', encodeURIComponent(pgn));
        params.append('theme', theme); 
        params.append('pieces', pieces); 
        params.append('coords', coords); 
        if (puzzle) params.append('puzzle', 'true');
        
        const directUrl = `${baseUrl}?${params.toString()}`; 
        params.append('embed', 'true'); 
        params.append('embedId', embedId); 
        const embedUrl = `${baseUrl}?${params.toString()}`;
        
        const embedHtml = `<iframe id="${embedId}" allowtransparency="true" frameborder="0" style="width:${width}; border:none; min-height:${height};" src="${embedUrl}"></iframe>\n<script nonce="chess-diagram">window.addEventListener("message", function(e) { if(e.data && e.data.id === "${embedId}") { var el = document.getElementById(e.data.id); if(el) el.style.height = (e.data.frameHeight + 37) + 'px'; } });<\/script>`;
        
        if (copyToClipboard) { 
            navigator.clipboard.writeText(embedHtml).then(() => { 
                if(typeof this.showNotification === 'function') this.showNotification("Embed HTML copied!", "Success", "✅"); 
            }); 
            return; 
        }
        
        const iframeBox = document.getElementById('embedIframeCode'); 
        const linkBox = document.getElementById('shareGameLink'); 
        const gidBox = document.getElementById('embedGidCode');
        
        if (iframeBox) iframeBox.value = embedHtml; 
        if (linkBox) linkBox.value = directUrl; 
        if (gidBox) gidBox.value = `[gid=${gameId}]`;

        const previewContainer = document.getElementById('liveEmbedPreview');
        if (previewContainer) {
            previewContainer.innerHTML = `<iframe src="${embedUrl}" style="width: 100%; height: 100%; border: none; position: relative; z-index: 1;"></iframe>`;
        }
    }
readEmbedFile(file) { 
        const reader = new FileReader(); 
        reader.onload = (e) => { 
            document.getElementById('embedTextInput').value = e.target.result; 
            if (typeof this.showNotification === 'function') this.showNotification(`File "${file.name}" read successfully!`, 'success', '📄'); 
        }; 
        reader.readAsText(file);
    }
handleEmbedFileUpload(event) { const file = event.target.files[0]; this.readEmbedFile(file); event.target.value = ''; }
handleEmbedDragOver(event) { event.preventDefault(); event.stopPropagation(); event.currentTarget.style.background = 'rgba(56, 189, 248, 0.3)'; }
handleEmbedDragLeave(event) { event.preventDefault(); event.stopPropagation(); event.currentTarget.style.background = 'rgba(56, 189, 248, 0.1)'; }
handleEmbedDrop(event) { event.preventDefault(); event.stopPropagation(); this.handleEmbedDragLeave(event); if (event.dataTransfer && event.dataTransfer.files.length > 0) this.readEmbedFile(event.dataTransfer.files[0]); }
submitEmbedText() { 
        const text = document.getElementById('embedTextInput').value.trim();
        if (text) {
            if (this.#game && typeof this.#game.loadPGN === 'function') {
                // If it's an iframe, extract the PGN from the URL
                let pgnToLoad = text;
                const urlMatch = text.match(/src="([^"]+)"/);
                if (urlMatch && urlMatch[1]) {
                    const urlParams = new URL(urlMatch[1].replace(/&amp;/g, '&'), window.location.origin).searchParams;
                    if (urlParams.has('pgn')) pgnToLoad = decodeURIComponent(urlParams.get('pgn'));
                }
                this.#game.loadPGN(pgnToLoad); 
                this.renderBoard(false); 
                this.updateHistory(true);
            }
            document.getElementById('embedImporterModal').style.display = 'none';
            if (typeof this.showNotification === 'function') this.showNotification("Embed imported successfully!", "Success", "✅");
        } else {
            if (typeof this.showNotification === 'function') this.showNotification("Please paste code or upload a file first.", "Error", "❌");
        }
    }
toggleCheckboxes(className, state) { document.querySelectorAll('.' + className).forEach(cb => cb.checked = state); }
renderPockets(pocket) {
        const pocketContainer = document.getElementById('pocket-container');
        let topPocket = document.getElementById('top-pocket');
        let bottomPocket = document.getElementById('bottom-pocket');

        const gameMode = this.#game ? this.#game.gameMode : 'classical';
        const isPocketMode = (gameMode === 'crazyhouse' || gameMode === 'bughouse' || gameMode === 'placement');

        if (!isPocketMode || !pocket || (!pocket.w.length && !pocket.b.length)) {
            if (pocketContainer) pocketContainer.style.display = 'none';
            if (topPocket) topPocket.innerHTML = ''; if (bottomPocket) bottomPocket.innerHTML = '';
            return;
        }

        if (pocketContainer) pocketContainer.style.display = 'flex';
        
        if (topPocket) {
            topPocket.innerHTML = ''; topPocket.style.setProperty('flex-direction', 'column', 'important');
            topPocket.style.setProperty('flex-wrap', 'nowrap', 'important'); topPocket.style.setProperty('align-items', 'center', 'important');
            topPocket.style.setProperty('gap', '8px', 'important');
        }
        if (bottomPocket) {
            bottomPocket.innerHTML = ''; bottomPocket.style.setProperty('flex-direction', 'column', 'important');
            bottomPocket.style.setProperty('flex-wrap', 'nowrap', 'important'); bottomPocket.style.setProperty('align-items', 'center', 'important');
            bottomPocket.style.setProperty('gap', '8px', 'important');
        }

        const topColor = this.flipped ? 'w' : 'b';
        const bottomColor = this.flipped ? 'b' : 'w';

        const drawPocket = (container, color) => {
            if (!pocket || !pocket[color] || !container) return;
            const pieceCounts = {};
            pocket[color].forEach(pType => pieceCounts[pType] = (pieceCounts[pType] || 0) + 1);
            
            ['k', 'q', 'r', 'b', 'n', 'p'].forEach(pChar => {
                const pType = ['p','n','b','r','q','k'].indexOf(pChar); 
                if (pieceCounts[pType]) {
                    const el = document.createElement('div');
                    el.style.cssText = 'position: relative; width: 60px; height: 60px; cursor: grab; pointer-events: auto; background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px solid #444; flex-shrink: 0;';
                    const rawHTML = this.getPieceHTML({ color: color, type: pChar }); 
                    
                    let staticImgHTML = rawHTML;
                    if (rawHTML) {
                        let trimmed = rawHTML.trim();
                        if (trimmed.startsWith('<svg')) staticImgHTML = `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}" style="width:100%; height:100%; pointer-events:none;">`;
                        else if (trimmed.startsWith('data:image/') || trimmed.startsWith('http') || trimmed.endsWith('.svg') || trimmed.endsWith('.png')) staticImgHTML = `<img src="${trimmed}" style="width:100%; height:100%; pointer-events:none;">`;
                    }
                    let pulseClass = (this.animationsEnabled !== false) ? " piece-heartbeat" : "";
                    let ghostHTML = rawHTML;
                    if (rawHTML) {
                        let trimmed = rawHTML.trim();
                        if (trimmed.startsWith('<svg')) ghostHTML = `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}" class="piece-img${pulseClass}" style="width:100%; height:100%; display:block; pointer-events:none;">`;
                        else if (trimmed.startsWith('data:image/') || trimmed.startsWith('http') || trimmed.endsWith('.svg') || trimmed.endsWith('.png')) ghostHTML = `<img src="${trimmed}" class="piece-img${pulseClass}" style="width:100%; height:100%; display:block; pointer-events:none;">`;
                    }
                    el.innerHTML = `<div style="position: absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; padding: 3px;">${staticImgHTML}</div>${pieceCounts[pType] > 1 ? `<div style="position: absolute; bottom: -6px; left: -6px; font-weight: bold; color: white; text-shadow: 1px 1px 2px black, -1px -1px 2px black, 1px -1px 2px black, -1px 1px 2px black; font-size: 15px; z-index: 2; pointer-events:none; background: #c33; padding: 1px 6px; border-radius: 6px; border: 1px solid white;">${pieceCounts[pType]}</div>` : ''}`;
                    
                    const handleDragStart = (e) => {
                        let clientX = e.touches ? e.touches[0].clientX : e.clientX; let clientY = e.touches ? e.touches[0].clientY : e.clientY;
                        this.dragData = { source: '@', piece: pChar, color: color };
                        if (typeof this.initDragGhost === 'function') this.initDragGhost(e, ghostHTML);
                        else { this.draggedPieceGhost.style.backgroundImage = 'none'; this.draggedPieceGhost.innerHTML = ghostHTML; this.draggedPieceGhost.style.display = 'block'; }
                        this.draggedPieceGhost.classList.add('piece', 'animating'); el.classList.add('dragging-source');
                        const sqWidth = this.boardEl.offsetWidth / 8; const sqHeight = this.boardEl.offsetHeight / 8;
                        this.draggedPieceGhost.style.width = sqWidth + 'px'; this.draggedPieceGhost.style.height = sqHeight + 'px';
                        const scaler = document.getElementById('app-scaler') || document.body;
                        
                        const updateGhostPosition = (cx, cy) => {
                            const rect = scaler.getBoundingClientRect(); const scale = window.appScale || 1;
                            const logicalX = (cx - rect.left) / scale; const logicalY = (cy - rect.top) / scale;
                            this.draggedPieceGhost.style.left = `${logicalX - (sqWidth / 2)}px`; this.draggedPieceGhost.style.top = `${logicalY - (sqHeight / 2)}px`;
                        };
                        updateGhostPosition(clientX, clientY);
                        
                        const onMove = (moveEvent) => { updateGhostPosition(moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX, moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY); };
                        const onUp = (upEvent) => {
                            document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp);
                            document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onUp);
                            this.draggedPieceGhost.style.display = 'none'; this.draggedPieceGhost.classList.remove('piece', 'animating');
                            el.classList.remove('dragging-source'); document.body.classList.remove('grabbing');
                            let cx = upEvent.changedTouches ? upEvent.changedTouches[0].clientX : upEvent.clientX; let cy = upEvent.changedTouches ? upEvent.changedTouches[0].clientY : upEvent.clientY;
                            const rect = this.boardEl.getBoundingClientRect();
                            if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) {
                                const file = Math.floor((cx - rect.left) / (rect.width / 8)); const rank = 7 - Math.floor((cy - rect.top) / (rect.height / 8));
                                const sq = String.fromCharCode(97 + (this.flipped ? 7 - file : file)) + (this.flipped ? 8 - rank : rank + 1);
                                if (typeof this.executeMove === 'function') this.executeMove({ from: '@', to: sq, drop: pChar }, true);
                                else if (this.#game && typeof this.#game.makeMove === 'function') { this.#game.makeMove({ from: '@', to: sq, drop: pChar }); if (typeof this.renderBoard === 'function') this.renderBoard(true); }
                            }
                            this.dragData = null;
                        };
                        document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); document.addEventListener('touchmove', onMove, {passive: false}); document.addEventListener('touchend', onUp);
                    };
                    el.addEventListener('mousedown', (e) => { if (e.button !== 0) return; e.preventDefault(); handleDragStart(e); });
                    el.addEventListener('touchstart', (e) => { e.preventDefault(); handleDragStart(e); }, {passive: false});
                    container.appendChild(el);
                }
            });
        };

        if (this.flipped) { drawPocket(topPocket, 'w'); drawPocket(bottomPocket, 'b'); } 
        else { drawPocket(topPocket, 'b'); drawPocket(bottomPocket, 'w'); }
        if (typeof this.resizeApp === 'function') this.resizeApp();
    }
updateBotMenuPreviews() {
        const getPieceImage = (color) => {
            const rawHtml = this.getPieceHTML({ color: color, type: 'k' });
            if (!rawHtml) return null;
            if (rawHtml.trim().startsWith('<svg')) {
                const encoded = encodeURIComponent(rawHtml);
                const img = document.createElement('img');
                img.src = `data:image/svg+xml;charset=utf-8,${encoded}`;
                img.style.width = "100%"; img.style.height = "100%"; img.style.display = "block";
                return img;
            } 
            const temp = document.createElement('div');
            temp.innerHTML = rawHtml;
            const el = temp.firstElementChild;
            if (el) { el.style.width = "100%"; el.style.height = "100%"; el.style.display = "block"; }
            return el;
        };

        const updateSingleButton = (btnId, color) => {
            const btn = document.getElementById(btnId);
            if (!btn) return;
            const newImg = getPieceImage(color);
            if (newImg) {
                newImg.classList.add('side-icon');
                newImg.style.width = "45px"; newImg.style.height = "45px"; newImg.style.marginBottom = "8px";
                const oldIcon = btn.querySelector('.side-icon');
                if (oldIcon) oldIcon.replaceWith(newImg);
                else btn.insertBefore(newImg, btn.firstChild);
            }
        };

        updateSingleButton('sideBtn-w', 'w');
        updateSingleButton('sideBtn-b', 'b');

        const randomBtn = document.getElementById('sideBtn-random');
        if (randomBtn) {
            const wKingImg = getPieceImage('w');
            const bKingImg = getPieceImage('b');
            if (wKingImg && bKingImg) {
                const container = document.createElement('div');
                container.className = 'side-icon random-king-container';
                const leftDiv = document.createElement('div'); leftDiv.className = 'random-half left'; leftDiv.appendChild(wKingImg);
                const rightDiv = document.createElement('div'); rightDiv.className = 'random-half right'; rightDiv.appendChild(bKingImg);
                container.appendChild(leftDiv); container.appendChild(rightDiv);
                const oldIcon = randomBtn.querySelector('.side-icon');
                if (oldIcon) oldIcon.replaceWith(container);
                else randomBtn.insertBefore(container, randomBtn.firstChild);
            }
        }
    }
openBotMenu() {
        const modal = document.getElementById('botMenuModal');
        if (modal) {
            if (modal.parentElement !== document.body) {
                document.body.appendChild(modal);
            }
            modal.style.position = 'fixed'; modal.style.top = '0'; modal.style.left = '0';
            modal.style.width = '100vw'; modal.style.height = '100vh';
            modal.style.zIndex = '9999'; modal.style.display = 'flex';
            modal.style.justifyContent = 'center'; modal.style.alignItems = 'center';
            modal.style.backgroundColor = 'rgba(0, 0, 0, 0.75)';

            this.setBotLevel(5, document.querySelectorAll('.strength-selector .str-btn')[4]);
            this.selectSideOption('random');
        }
    }
setBotLevel(level, btnElement) {
        document.getElementById('botLevelInput').value = level;
        document.querySelectorAll('.strength-selector .str-btn').forEach(b => b.classList.remove('active'));
        if (btnElement) btnElement.classList.add('active');
    }
selectSideOption(side) {
        document.getElementById('botColorInput').value = side;
        document.querySelectorAll('.side-selector .side-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = document.getElementById(`sideBtn-${side}`);
        if (activeBtn) activeBtn.classList.add('active');
    }
confirmBotStart() {
        const modal = document.getElementById('botMenuModal');
        if (modal) modal.style.display = 'none';

        const level = parseInt(document.getElementById('botLevelInput').value || 8);
        const side = document.getElementById('botColorInput').value || 'random';
        const variantSelect = document.getElementById('gameVariantSelect');
        const variant = variantSelect ? variantSelect.value : 'standard';

        if (this.#game) {
            if (variant === 'chess960' && typeof this.#game.startChess960Game === 'function') {
                this.#game.startChess960Game('bot', level, side);
            } else if (typeof this.#game.startBotGame === 'function') {
                this.#game.startBotGame(level, side);
            }
            if (typeof this.switchTab === 'function') this.switchTab('play'); 
            if (typeof this.toggleSideMenu === 'function') this.toggleSideMenu(false);
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
        this.avatars['w'] = (isEngineGame || isEngineName(whiteName)) ? engineImg : humanImg;
        this.avatars['b'] = (isEngineGame || isEngineName(blackName)) ? engineImg : humanImg;
        if (!skipRender && typeof this.renderHeaders === 'function') this.renderHeaders(); 
    }
togglePgnEditing(enable) {
        const box = document.getElementById('editorPgnInput'); 
        if (box) {
            box.disabled = !enable;
            box.placeholder = enable ? "Paste PGN..." : "PGN editing disabled during game";
        }
        const sheet = document.getElementById('moveHistory'); 
        if (sheet) {
            sheet.contentEditable = "false"; 
            sheet.style.userSelect = "text"; 
            const comments = sheet.querySelectorAll('.comment, .pgn-comment, .move-comment');
            comments.forEach(c => {
                c.contentEditable = enable ? "true" : "false";
                if (enable) {
                    c.style.cursor = "text"; c.style.outline = "none"; c.style.borderBottom = "1px dashed #666"; 
                } else {
                    c.style.cursor = "default"; c.style.borderBottom = "none";
                }
            });
        }
        const commentBox = document.getElementById('commentInput'); 
        if (commentBox) commentBox.disabled = !enable;
    }
togglePGN() {
        const container = document.getElementById('pgnContainer');
        const icon = document.getElementById('pgnToggleIcon');
        if (!container || !icon) return;
        if (container.style.maxHeight === '0px') {
            container.style.maxHeight = '400px'; icon.innerText = '▼';
        } else {
            container.style.maxHeight = '0px'; icon.innerText = '▲';
        }
    }
initCharts() {
        if (typeof Chart === 'undefined') return;
        const ctxEval = document.getElementById('evalChartCtx');
        const ctxTime = document.getElementById('timeChartCtx');

        const lichessPlugin = {
            id: 'lichessAesthetic',
            afterDraw: (chart) => {
                if (!chart.chartArea) return; 
                const ctx = chart.ctx; const xAxis = chart.scales.x; const { top, bottom } = chart.chartArea; 
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
            responsive: false, maintainAspectRatio: false, animation: false, normalized: true, spanGaps: true,
            interaction: { mode: 'index', intersect: false }, devicePixelRatio: window.devicePixelRatio
        };

        if (ctxEval && !this.evalChart) {
            this.evalChart = new Chart(ctxEval, {
                type: 'line', plugins: [lichessPlugin], data: { labels: [], datasets: [] },
                options: { ...commonOptions, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { suggestedMin: -5, suggestedMax: 5, grid: { color: '#333', drawBorder: false }, ticks: { color: '#888', stepSize: 2 } } } }
            });
        }

        if (ctxTime && !this.timeChart) {
            this.timeChart = new Chart(ctxTime, {
                type: 'bar', plugins: [lichessPlugin], data: { labels: [], datasets: [] },
                options: { 
                    ...commonOptions, plugins: { legend: { display: false } }, 
                    scales: { x: { display: false }, yTime: { type: 'linear', position: 'left', beginAtZero: true, suggestedMax: 100, grid: { color: '#333' }, ticks: { color: '#888', precision: 0, callback: function(value) { return value + 's'; } } }, yEval: { type: 'linear', position: 'right', display: false } } 
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
        
        const toggleBtn = document.getElementById('toggleChartsBtn');
        const wrapper = document.getElementById('chartsCollapsibleWrapper');
        if (toggleBtn && wrapper) {
            toggleBtn.onclick = () => {
                if (wrapper.style.display !== 'none') {
                    wrapper.style.display = 'none'; toggleBtn.innerText = "+ Expand Charts";
                } else {
                    wrapper.style.display = 'flex'; toggleBtn.innerText = "− Collapse Charts";
                    requestAnimationFrame(() => { requestAnimationFrame(() => {
                        if (this.evalChart) this.evalChart.resize(); if (this.timeChart) this.timeChart.resize(); this.renderCharts();
                    });});
                }
            };
        }
    }
safeResizeCharts() {
        if (this._resizeInterval) clearInterval(this._resizeInterval);
        let ticks = 0;
        this._resizeInterval = setInterval(() => {
            const eWrap = document.getElementById('evalSizer'); const tWrap = document.getElementById('timeSizer');
            if (this.evalChart && eWrap) { const w = eWrap.offsetWidth; const h = eWrap.offsetHeight > 0 ? eWrap.offsetHeight : 220; if (w > 0) this.evalChart.resize(w, Math.min(h, 220)); }
            if (this.timeChart && tWrap) { const w = tWrap.offsetWidth; const h = tWrap.offsetHeight > 0 ? tWrap.offsetHeight : 220; if (w > 0) this.timeChart.resize(w, Math.min(h, 220)); }
            ticks++; if (ticks > 10) { clearInterval(this._resizeInterval); this._resizeInterval = null; }
        }, 50);
    }
forceRenderCharts() {
        if (typeof Chart === 'undefined') return;
        if (!this.evalChart || !this.timeChart) this.initCharts();

        let isMatch = this.#game.isEngineMatch;
        let hasPgnEvals = false;
        let scanNode = this.#game.rootNode;
        
        while (scanNode && scanNode.children.length > 0) {
            let n = scanNode.children[0]; 
            if (n.evalScore !== undefined) { hasPgnEvals = true; break; }
            scanNode = n;
        }

        let labels = []; let timeData = []; let timeBg = []; let evalDataWhite = []; let strWhite = []; let evalDataBlack = []; let strBlack = []; let evalDataPgn = []; let strPgn = []; let combinedEvalForTimeChart = []; let evalDataLocal = []; let strLocal = []; let chartNags = []; let chartColors = [];

        const clampEval = (val) => { if (Math.abs(val) >= 90000) return val > 0 ? 10 : -10; return Math.max(-10, Math.min(10, val / 100)); };
        const formatEval = (val) => { if (Math.abs(val) >= 90000) return (val > 0 ? "+M" : "-M") + (100000 - Math.abs(val)); return (val/100 > 0 ? "+" : "") + (val/100).toFixed(2); };

        let curr = this.#game.rootNode; let ply = 0; let activeIdx = -1;

        labels.push("Start"); timeData.push(0); timeBg.push('#ffffff'); chartNags.push(null); chartColors.push(null);
        let startVal = curr.evalScore !== undefined ? curr.evalScore : 20; let startStr = curr.eval || "+0.20";
        
        if (isMatch) { evalDataWhite.push(clampEval(startVal)); strWhite.push(startStr); evalDataBlack.push(null); strBlack.push(null); } 
        else { evalDataPgn.push(clampEval(startVal)); strPgn.push(startStr); }
        if (hasPgnEvals) combinedEvalForTimeChart.push(clampEval(startVal));
        
        let locStartVal = curr.localEvalScore !== undefined ? curr.localEvalScore : startVal;
        evalDataLocal.push(clampEval(locStartVal)); strLocal.push(curr.localEval || startStr);
        if (!hasPgnEvals) combinedEvalForTimeChart.push(clampEval(locStartVal));
        if (curr === this.#game.currentNode) activeIdx = 0;

        while (curr && curr.children.length > 0) {
            let next = curr.children[0]; ply++;
            let isWhite = (ply % 2 !== 0); let isMateMove = next.moveSan && next.moveSan.includes('#');

            if (next === this.#game.currentNode) activeIdx = ply;
            labels.push(isWhite ? `${Math.ceil(ply / 2)}. ${next.moveSan}` : `${Math.ceil(ply / 2)}... ${next.moveSan}`);

            let t = next.timeSpent !== undefined ? next.timeSpent : 0;
            timeData.push(isWhite ? t : -t); timeBg.push(isWhite ? '#ffffff' : '#000000'); 

            let nType = null; let nColor = null;
            if (next.nag) {
                const info = this.getNagInfo(next.nag);
                if (info && ['blunder', 'mistake', 'inaccuracy', 'brilliant', 'good', 'interesting'].includes(info.type)) {
                    nType = info.type; nColor = info.color;
                }
            }
            chartNags.push(nType); chartColors.push(nColor);

            let vPgn = evalDataPgn.length > 0 ? evalDataPgn[evalDataPgn.length - 1] : 0;
            let str = null;

            if (next.evalScore !== undefined) { vPgn = clampEval(next.evalScore); str = next.eval || formatEval(next.evalScore); } 
            else if (isMateMove && hasPgnEvals) { vPgn = isWhite ? 10 : -10; str = isWhite ? "+M0" : "-M0"; }
            
            if (hasPgnEvals) combinedEvalForTimeChart.push(vPgn);

            if (isMatch) {
                if (isWhite) { evalDataWhite.push(vPgn); strWhite.push(str); evalDataBlack.push(null); strBlack.push(null); } 
                else { evalDataWhite.push(null); strWhite.push(null); evalDataBlack.push(vPgn); strBlack.push(str); }
            } else { evalDataPgn.push(vPgn); strPgn.push(str); }

            let vLoc = null; let sLoc = null;

            if (next.localEvalScore !== undefined) { vLoc = clampEval(next.localEvalScore); sLoc = next.localEval || formatEval(next.localEvalScore); } 
            else if (isMateMove) { vLoc = isWhite ? 10 : -10; sLoc = isWhite ? "+M0" : "-M0"; } 
            else if (next.evalScore !== undefined) { vLoc = clampEval(next.evalScore); sLoc = next.eval || formatEval(next.evalScore); } 
            else { vLoc = evalDataLocal.length > 0 ? evalDataLocal[evalDataLocal.length - 1] : 0; sLoc = strLocal.length > 0 ? strLocal[strLocal.length - 1] : "0.00"; }
            
            evalDataLocal.push(vLoc); strLocal.push(sLoc);
            if (!hasPgnEvals) combinedEvalForTimeChart.push(vLoc); 
            curr = next;
        }

        let pointRadii = chartNags.map((nagType, idx) => {
            if (idx === 0) return 0;
            const ptColor = idx % 2 !== 0 ? 'w' : 'b';
            if (this.highlightedChartState && this.highlightedChartState.type) {
                if (this.highlightedChartState.color === ptColor && this.highlightedChartState.type === nagType) return 8; 
                if (nagType) return 2; 
                return 0;
            }
            return nagType ? 4 : 0; 
        });

        let getColors = (defaultColor) => chartColors.map(c => c || defaultColor);
        let datasetArray = [];
        
        if (hasPgnEvals) {
            if (isMatch) {
                datasetArray.push({ label: this.#game.pgnHeaders['White'] || 'White Engine', data: evalDataWhite, customEvals: strWhite, borderColor: '#d59120', backgroundColor: 'rgba(213, 145, 32, 0.2)', fill: true, borderWidth: 2, pointRadius: pointRadii, pointBackgroundColor: getColors('#d59120'), pointBorderColor: '#fff', pointBorderWidth: 1.5, pointHoverRadius: 6, tension: 0, spanGaps: true });
                datasetArray.push({ label: this.#game.pgnHeaders['Black'] || 'Black Engine', data: evalDataBlack, customEvals: strBlack, borderColor: '#b369f2', backgroundColor: 'rgba(179, 105, 242, 0.2)', fill: true, borderWidth: 2, pointRadius: pointRadii, pointBackgroundColor: getColors('#b369f2'), pointBorderColor: '#fff', pointBorderWidth: 1.5, pointHoverRadius: 6, tension: 0, spanGaps: true });
            } else {
                datasetArray.push({ label: 'PGN Eval', data: evalDataPgn, customEvals: strPgn, borderColor: '#d59120', backgroundColor: 'rgba(213, 145, 32, 0.25)', fill: 'start', borderWidth: 2, pointRadius: pointRadii, pointBackgroundColor: getColors('#d59120'), pointBorderColor: '#fff', pointBorderWidth: 1.5, pointHoverRadius: 6, tension: 0 });
            }
        }
        
        datasetArray.push({ label: 'Local Depth 20', data: evalDataLocal, customEvals: strLocal, borderColor: '#38bdf8', borderDash: hasPgnEvals ? [5, 5] : [], backgroundColor: hasPgnEvals ? 'transparent' : 'rgba(56, 189, 248, 0.25)', fill: hasPgnEvals ? false : 'start', borderWidth: 2, pointRadius: pointRadii, pointBackgroundColor: getColors('#38bdf8'), pointBorderColor: '#fff', pointBorderWidth: 1.5, pointHoverRadius: 6, tension: 0, spanGaps: true });

        const xAxisConfig = { display: true, ticks: { color: '#888', maxRotation: 0, autoSkip: false, callback: function(val, index) { let lbl = labels[index]; if (!lbl || lbl === "Start" || lbl.includes("...")) return null; let num = parseInt(lbl.split('.')[0]); return (num % 10 === 0) ? num : null; } }, grid: { display: false } };
        const tooltipConfig = { displayColors: true, backgroundColor: 'rgba(30, 30, 30, 0.95)', bodyFont: { size: 13, family: 'Segoe UI' }, titleFont: { size: 14, weight: 'bold' }, callbacks: { title: (ctx) => { let label = ctx[0].label; return label && label !== "Start" ? `Move: ${label}` : label; }, label: (ctx) => { let exactStr = ctx.dataset.customEvals[ctx.dataIndex]; if (!exactStr) return null; return `${ctx.dataset.label}: ${exactStr}`; } } };

        if (this.evalChart) {
            this.evalChart.data.labels = labels; this.evalChart.data.datasets = datasetArray; this.evalChart.options.scales.x = xAxisConfig; this.evalChart.options.plugins.tooltip = tooltipConfig; this.evalChart.options.plugins.lichessAesthetic = { activeIdx: activeIdx }; this.evalChart.options.onClick = (e, elements) => { if (elements.length > 0) this.jumpToChartMove(elements[0].index); };
            this.evalChart.update('none'); 
        }

        if (this.timeChart) {
            this.timeChart.data.labels = labels;
            this.timeChart.data.datasets = [ { type: 'line', data: combinedEvalForTimeChart, borderColor: '#38bdf8', borderWidth: 2, fill: false, pointRadius: 0, tension: 0.2, yAxisID: 'yEval' }, { type: 'bar', data: timeData, backgroundColor: timeBg, barPercentage: 1.0, categoryPercentage: 1.0, yAxisID: 'yTime' } ];
            let maxTime = Math.max(...timeData.map(Math.abs)); if (maxTime < 10) maxTime = 10; 
            let unit = 's'; let divider = 1; if (maxTime >= 3600) { unit = 'h'; divider = 3600; } else if (maxTime >= 60) { unit = 'm'; divider = 60; }
            this.timeChart.options.scales.x = xAxisConfig;
            this.timeChart.options.scales.yTime = { type: 'linear', display: true, position: 'left', min: -maxTime, max: maxTime, grid: { color: '#333' }, ticks: { color: '#888', maxTicksLimit: 6, callback: function(value) { if (value === 0) return '0'; const converted = Math.abs(value) / divider; return Number.isInteger(converted) ? converted + unit : converted.toFixed(1) + unit; } } };
            this.timeChart.options.scales.yEval = { type: 'linear', display: false, position: 'right', min: -10, max: 10, grid: { color: (ctx) => ctx.tick.value === 0 ? 'rgba(255,255,255,0.4)' : 'transparent', drawBorder: false } };
            this.timeChart.options.plugins.lichessAesthetic = { activeIdx: activeIdx };
            this.timeChart.options.plugins.tooltip = { displayColors: false, backgroundColor: 'rgba(30, 30, 30, 0.95)', callbacks: { title: (ctx) => { let label = ctx[0].label; return label !== "Start" ? `Move: ${label}` : label; }, label: (ctx) => { if (ctx.datasetIndex === 0) return null; const totalSeconds = Math.abs(ctx.raw); if (totalSeconds < 60) return `Time spent: ${totalSeconds.toFixed(1)}s`; const hours = Math.floor(totalSeconds / 3600); const minutes = Math.floor((totalSeconds % 3600) / 60); const seconds = Math.floor(totalSeconds % 60); let timeString = ''; if (hours > 0) timeString += `${hours}h `; if (minutes > 0 || hours > 0) timeString += `${minutes}m `; timeString += `${seconds}s`; return `Time spent: ${timeString}`; } } };
            this.timeChart.options.onClick = (e, elements) => { if (elements.length > 0) this.jumpToChartMove(elements[0].index); };
            this.timeChart.update('none');
        }
        this.safeResizeCharts();
    }
jumpToChartMove(idx) {
        if (!this.#game || !this.#game.rootNode) return;
        let curr = this.#game.rootNode; let currentIdx = 0;
        while (curr && curr.children.length > 0 && currentIdx < idx) { curr = curr.children[curr.selectedChildIndex || 0]; currentIdx++; }
        if (curr) {
            if (!curr.id) curr.id = 'n_' + Math.random().toString(36).substr(2, 9);
            if (this.#game.goToNodeId(curr.id)) {
                const state = this.#game.getReader(); this.renderBoard(false); this.updateHistory(); this.renderArrows();
                if (this.updateClocks) this.updateClocks();
                if (state.mode !== 'play' && this.#game.updateStockfish) this.#game.updateStockfish();
            }
        }
    }
jumpToNextError(color, type) {
        if (!this.#game || !this.#game.rootNode) return;
        this.errorNavState = this.errorNavState || {}; let matches = []; let curr = this.#game.rootNode; let ply = 0;
        while (curr && curr.children.length > 0) {
            let next = curr.children[curr.selectedChildIndex || 0]; ply++; let nodeColor = (ply % 2 !== 0) ? 'w' : 'b';
            if (next.nag && nodeColor === color) {
                const info = this.getNagInfo(next.nag);
                if (info && info.type === type) matches.push(next);
            }
            curr = next;
        }
        if (matches.length === 0) return; 
        let stateKey = `${color}_${type}`; let currentIndex = this.errorNavState[stateKey] || 0;
        if (currentIndex >= matches.length) currentIndex = 0; 
        
        let targetNode = matches[currentIndex];
        this.#game.currentNode = targetNode; this.#game.loadFEN(targetNode.fen); this.#game.goToNodeId(targetNode.id);
        this.renderBoard(false); this.updateHistory(); this.renderArrows();
        if (this.updateClocks) this.updateClocks();
        if (this.#game.updateStockfish && !this.#game.isPlayingLiveGame) this.#game.updateStockfish();
        this.errorNavState[stateKey] = currentIndex + 1;
    }
updateChartActiveLine() {
        let activeIdx = -1; let curr = this.#game.rootNode; let ply = 0;
        if (curr === this.#game.currentNode) activeIdx = 0;
        while (curr && curr.children.length > 0) { curr = curr.children[0]; ply++; if (curr === this.#game.currentNode) activeIdx = ply; }
        if (this.evalChart) { this.evalChart.config.options.plugins.lichessAesthetic.activeIdx = activeIdx; this.evalChart.draw(); }
        if (this.timeChart) { this.timeChart.config.options.plugins.lichessAesthetic.activeIdx = activeIdx; this.timeChart.draw(); }
    }
showReviewResults(wAcc, wBlun, wMist, wInacc, bAcc, bBlun, bMist, bInacc) {
        const panel = document.getElementById('reviewResultsPanel');
        if (panel) {
            panel.style.display = 'flex';
            document.getElementById('accWhite').innerText = wAcc + '%'; document.getElementById('blunWhite').innerText = wBlun + ' Blunders'; document.getElementById('mistWhite').innerText = wMist + ' Mistakes';
            if (document.getElementById('inaccWhite')) document.getElementById('inaccWhite').innerText = wInacc + ' Inaccuracies';
            document.getElementById('accBlack').innerText = bAcc + '%'; document.getElementById('blunBlack').innerText = bBlun + ' Blunders'; document.getElementById('mistBlack').innerText = bMist + ' Mistakes';
            if (document.getElementById('inaccBlack')) document.getElementById('inaccBlack').innerText = bInacc + ' Inaccuracies';

            const bindHover = (id, color, type) => {
                const el = document.getElementById(id);
                if (el) {
                    el.style.cursor = 'pointer'; 
                    el.onmouseenter = () => this.highlightChartPoints(color, type);
                    el.onmouseleave = () => this.highlightChartPoints(null, null);
                    el.onclick = () => this.jumpToNextError(color, type);
                }
            };
            bindHover('inaccWhite', 'w', 'inaccuracy'); bindHover('mistWhite', 'w', 'mistake'); bindHover('blunWhite', 'w', 'blunder');
            bindHover('inaccBlack', 'b', 'inaccuracy'); bindHover('mistBlack', 'b', 'mistake'); bindHover('blunBlack', 'b', 'blunder');
        }
        const btn = document.getElementById('reviewGameBtn'); if (btn) btn.style.display = 'none'; 
    }
setHistoryDimState(isDimmed) {
        const containers = [document.getElementById('move-history'), document.getElementById('tree-history'), document.querySelector('.history-container')];
        containers.forEach(c => { if (c) isDimmed ? c.classList.add('dimmed-mode') : c.classList.remove('dimmed-mode'); });
    }
highlightStatMoves(colorChar, nagType) {
        this.setHistoryDimState(true); 
        const selector = `.move-ply[data-color="${colorChar}"][data-nag="${nagType}"], .tree-move[data-color="${colorChar}"][data-nag="${nagType}"], .var-move[data-color="${colorChar}"][data-nag="${nagType}"]`;
        document.querySelectorAll(selector).forEach(move => move.classList.add('active-highlight'));
    }
clearStatHighlights() {
        this.setHistoryDimState(false); 
        document.querySelectorAll('.active-highlight').forEach(m => m.classList.remove('active-highlight'));
    }
highlightChartPoints(colorChar, nagType) {
        this.highlightedChartState = { color: colorChar, type: nagType };
        if (this.evalChart) this.forceRenderCharts();
    }
openStudyManager() {
        if (this.#game) this.#game.loadAllStudies();
        this.renderStudyList();
        document.getElementById('studyManagerModal').style.display = 'flex';
    }
openExportStudyModal() {
        if (this.#game && typeof this.#game.saveActiveChapter === 'function') this.#game.saveActiveChapter(); 
        const container = document.getElementById('exportChapterList');
        if (!container) return;
        container.innerHTML = '';
        
        this.#game.chapters.forEach((ch, idx) => {
            const label = document.createElement('label'); label.style.cssText = "display: flex; gap: 10px; align-items: center; padding: 5px; cursor: pointer; color: #ccc;";
            const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true; cb.className = 'chapter-export-cb'; cb.dataset.idx = idx; cb.style.cursor = "pointer";
            const text = document.createElement('span'); text.innerText = `${idx + 1}. ${ch.title}`;
            label.appendChild(cb); label.appendChild(text); container.appendChild(label);
        });
        document.getElementById('exportStudyModal').style.display = 'flex';
    }
toggleAllChapters(state) {
        document.querySelectorAll('.chapter-export-cb').forEach(cb => cb.checked = state);
    }
openChapterManager() {
        if (this.#game && typeof this.#game.saveActiveChapter === 'function') this.#game.saveActiveChapter(); 
        const container = document.getElementById('chapterManagerList');
        if (!container) return;
        container.innerHTML = '';
        
        this.#game.chapters.forEach((ch, idx) => {
            const div = document.createElement('div'); div.style.cssText = "display: flex; gap: 10px; align-items: center; padding: 8px; background: #333; border-radius: 4px;";
            const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'chapter-cb'; cb.dataset.idx = idx; cb.style.cursor = "pointer";
            const text = document.createElement('span'); text.innerText = `${idx + 1}. ${ch.title}`; text.style.flex = "1"; text.style.color = idx === this.#game.activeChapterIndex ? "#38bdf8" : "#fff"; text.style.fontWeight = idx === this.#game.activeChapterIndex ? "bold" : "normal";
            const loadBtn = document.createElement('button'); loadBtn.innerText = "Load"; loadBtn.className = "btn-secondary"; loadBtn.style.padding = "4px 10px"; loadBtn.style.fontSize = "12px";
            loadBtn.onclick = () => { this.#game.loadChapter(idx); document.getElementById('chapterManagerModal').style.display = 'none'; };
            div.appendChild(cb); div.appendChild(text); div.appendChild(loadBtn); container.appendChild(div);
        });
        document.getElementById('chapterManagerModal').style.display = 'flex';
    }
renderStudyList() {
        const container = document.getElementById('studyListContainer');
        if (!container) return;
        container.innerHTML = '';
        const studies = this.#game.allStudies || [];
        
        studies.forEach((study, idx) => {
            const div = document.createElement('div'); div.style.cssText = "display: flex; gap: 10px; align-items: center; padding: 8px; background: #333; border-radius: 4px;";
            const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'study-cb'; cb.dataset.id = study.id; cb.style.cursor = "pointer";
            const title = document.createElement('span'); title.innerText = study.title || `Study ${idx + 1}`; title.style.flex = "1"; title.style.fontWeight = study.id === this.#game.currentStudyId ? "bold" : "normal"; title.style.color = study.id === this.#game.currentStudyId ? "#38bdf8" : "#fff";
            const loadBtn = document.createElement('button'); loadBtn.className = "btn-primary"; loadBtn.innerText = "Load"; loadBtn.style.padding = "4px 10px"; loadBtn.style.fontSize = "12px";
            loadBtn.onclick = () => { this.#game.loadStudy(study.id); document.getElementById('studyManagerModal').style.display = 'none'; };
            div.appendChild(cb); div.appendChild(title); div.appendChild(loadBtn); container.appendChild(div);
        });
    }
copyText(elementId) {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.select(); el.setSelectionRange(0, 99999); 
        navigator.clipboard.writeText(el.value);
    }
openShareModal(currentGameId) {
        document.getElementById('shareModal').style.display = 'flex';
        if (typeof this.generateEmbedCodes === 'function') this.generateEmbedCodes(currentGameId);
    }
closeShareModal() {
        document.getElementById('shareModal').style.display = 'none';
    }
setPresetTheme(lightHex, darkHex, callerElement, accentColor = null, gridColor = 'transparent', pieceSet = null, customBg = null) {
        document.getElementById('colorLight').value = lightHex;
        document.getElementById('colorDark').value = darkHex;
        this.currentAccentColor = accentColor || '#38bdf8';
        this.currentGridColor = gridColor;

        if (customBg) {
            this.currentAppBg = customBg;
        } else {
            this.currentAppBg = this.getMatchingBackground(darkHex);
        }
        
        if (pieceSet) {
            const selector = document.getElementById('assetType');
            if (selector) { selector.value = pieceSet; this.pieceTheme = pieceSet; }
        }

        this.updateTheme();
        if (typeof this.updatePieceImagesSafe === 'function') this.updatePieceImagesSafe();

        const themeButtons = document.querySelectorAll('.theme-preset, .theme-box, .theme-btn, .preset-btn, .theme-card, .board-theme-box');
        
        themeButtons.forEach(el => {
            el.classList.remove('active');
            
            // This prevents bugs where clicking an inner <span> applies the border to the wrong element!
            const onclickStr = el.getAttribute('onclick') || "";
            const cleanClick = onclickStr.replace(/\s+/g, '').toLowerCase();
            const cleanLight = lightHex.toLowerCase();
            const cleanDark = darkHex.toLowerCase();
            
            if (cleanClick.includes(cleanLight) && cleanClick.includes(cleanDark)) {
                el.classList.add('active');
            }
        });
        
        if (callerElement && callerElement.classList) {
            // If the clicked element is inside a theme button, highlight the parent button, not the child
            const parentThemeBox = callerElement.closest('.theme-preset, .theme-box, .theme-btn, .preset-btn, .theme-card');
            if (parentThemeBox) {
                parentThemeBox.classList.add('active');
            } else {
                callerElement.classList.add('active');
            }
        }

        try {
            localStorage.setItem('chessThemeCache', JSON.stringify({
                lightHex, darkHex, accentColor: this.currentAccentColor,
                gridColor: this.currentGridColor, pieceSet, appBg: this.currentAppBg
            }));
        } catch(e) {}
        
        if (typeof this.renderBoard === 'function') this.renderBoard(false);
    }
getMatchingBackground(hexCode) {
        if (!hexCode || !hexCode.startsWith('#')) return `radial-gradient(circle at 50% 0%, #1e3a4c 0%, #0f172a 60%, #020617 100%)`;
        let hex = hexCode.replace(/^#/, '');
        if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
        let r = parseInt(hex.slice(0, 2), 16) || 0;
        let g = parseInt(hex.slice(2, 4), 16) || 0;
        let b = parseInt(hex.slice(4, 6), 16) || 0;

        let r1 = Math.floor(r * 0.28); let g1 = Math.floor(g * 0.28); let b1 = Math.floor(b * 0.28);
        let r2 = Math.floor(r * 0.12); let g2 = Math.floor(g * 0.12); let b2 = Math.floor(b * 0.12);
        return `radial-gradient(circle at 50% 0%, rgb(${r1}, ${g1}, ${b1}) 0%, rgb(${r2}, ${g2}, ${b2}) 65%, #020617 100%)`;
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

        const bgStyle = this.currentAppBg || `radial-gradient(circle at 50% 0%, #1e3a4c 0%, #0f172a 60%, #020617 100%)`;
        
        if (bgStyle.includes('url(') && !bgStyle.includes('data:image/svg+xml')) {
            // It's a custom uploaded image. Turn off noise and apply image!
            root.style.setProperty('--bg-gradient', bgStyle);
            root.style.setProperty('--noise-filter', 'none'); 
        } else {
            // It's a preset color theme. Restore noise and apply calculated gradient!
            root.style.setProperty('--bg-gradient', bgStyle);
            root.style.setProperty('--noise-filter', `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E")`);
        }

        // Redraw charts to match the new colors if they exist
        if (this.evalChart) this.evalChart.update('none');
        if (this.timeChart) this.timeChart.update('none');
    }
setBackground(input) {
        if (input.files && input.files[0]) {
            const btnSpan = input.parentElement.querySelector('span');
            if (btnSpan) btnSpan.innerText = input.files[0].name;
            const reader = new FileReader();
            
            reader.onload = (e) => {
                const bgUrl = `url('${e.target.result}')`;
                
                // 1. Save it to memory
                this.currentAppBg = bgUrl;
                
                // 2. Save it to LocalStorage so it survives page reloads
                try {
                    let savedTheme = JSON.parse(localStorage.getItem('chessThemeCache')) || {};
                    savedTheme.appBg = bgUrl;
                    localStorage.setItem('chessThemeCache', JSON.stringify(savedTheme));
                } catch(err) {}
                
                // 3. Apply it
                this.updateTheme();
            };
            reader.readAsDataURL(input.files[0]);
        }
    }
updatePieceImagesSafe() {
        const selector = document.getElementById('assetType');
        if (selector) this.pieceTheme = selector.value;
        if (this.pieceTheme === 'local' && !this.customPieces) return;
        this.renderBoard(false);
    }
updatePlayerNames(topName, bottomName, skipRender = false) {
        if (this.flipped) {
            if (topName) this.playerInfo['w'].name = topName;
            if (bottomName) this.playerInfo['b'].name = bottomName;
        } else {
            if (topName) this.playerInfo['b'].name = topName;
            if (bottomName) this.playerInfo['w'].name = bottomName;
        }
        if (!skipRender && typeof this.renderHeaders === 'function') this.renderHeaders();
    }
loadPgnAndAnalyze() {
        const fileInput = document.getElementById('pgnInput');
        const editorInput = document.getElementById('editorPgnInput');

        // 📂 CASE 1: A file was just selected via the file picker
        if (fileInput && fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const reader = new FileReader();

            // This runs asynchronously once the file is fully read
            reader.onload = (e) => {
                const pgnText = e.target.result;

                // 1. Paste the file's contents into the editor box
                if (editorInput) editorInput.value = pgnText;

                // 2. Switch the tab and load the game
                if (this.#game) {
                    this.switchTab('analysis');
                    
                    if (typeof this.#game.loadPGN === 'function') {
                        // loadPGN(text, isLiveGame, forceOverwrite)
                        this.#game.loadPGN(pgnText, false, true); 
                    }
                    
                    // 3. Force the sandbox to save this new file into the Analysis bucket
                    if (typeof this.#game.saveVariantState === 'function') {
                        this.#game.saveVariantState(this.#game.gameMode || 'classical');
                    }
                }

                // 4. Clear the file input so you can upload the exact same file again later if needed
                fileInput.value = '';
            };

            // Command the reader to extract the text
            reader.readAsText(file);
        } 
        // 📝 CASE 2: No file was picked, fallback to reading whatever is already typed in the text box
        else {
            let val = editorInput ? editorInput.value : '';
            if (val && this.#game) {
                this.switchTab('analysis');
                if (typeof this.#game.loadPGN === 'function') {
                    this.#game.loadPGN(val, false, true);
                }
                if (typeof this.#game.saveVariantState === 'function') {
                    this.#game.saveVariantState(this.#game.gameMode || 'classical');
                }
            }
        }
    }
updatePlayerInfo() {
        const humanImg = `<img src="assets/tabs-icon/face.webp" alt="Human" style="width:100%; height:100%; object-fit:cover; border-radius: 4px;">`;
        const engineImg = `<img src="assets/tabs-icon/engine.webp" alt="Bot" style="width:100%; height:100%; object-fit:contain; border-radius: 4px;">`;

        if (!this.playerInfo) this.playerInfo = { w: {}, b: {} };
        const state = this.#game ? this.#game.getReader() : null;

        // 1. Handle Bot Mode safely using the Reader state
        if (state && state.mode === 'bot') {
            const level = this.#game.botLevel || 5;
            const botName = `Stockfish Level ${level}`;
            
            if (state.botColor === 'b') {
                this.playerInfo['w'].name = "You";
                this.playerInfo['b'].name = botName;
                this.avatars['w'] = humanImg;
                this.avatars['b'] = engineImg;
                
                if (this.#game.pgnHeaders) {
                    this.#game.pgnHeaders['White'] = "You";
                    this.#game.pgnHeaders['Black'] = botName;
                }
            } else {
                this.playerInfo['w'].name = botName;
                this.playerInfo['b'].name = "You";
                this.avatars['w'] = engineImg;
                this.avatars['b'] = humanImg;
                
                if (this.#game.pgnHeaders) {
                    this.#game.pgnHeaders['White'] = botName;
                    this.#game.pgnHeaders['Black'] = "You";
                }
            }
        } 
        // 2. Handle Human vs Human / Local Mode
        else {
            this.playerInfo['w'].name = (state && state.headers && state.headers['White']) || "White";
            this.playerInfo['b'].name = (state && state.headers && state.headers['Black']) || "Black";
            
            const wName = this.playerInfo['w'].name.toLowerCase();
            const bName = this.playerInfo['b'].name.toLowerCase();
            const isEngine = (n) => ['stockfish', 'engine', 'bot', 'leela', 'komodo', 'ai'].some(k => n.includes(k));
            
            const isEngineMatch = this.#game && this.#game.isEngineMatch;
            this.avatars['w'] = isEngineMatch || isEngine(wName) ? engineImg : humanImg;
            this.avatars['b'] = isEngineMatch || isEngine(bName) ? engineImg : humanImg;
        }

        if (typeof this.renderHeaders === 'function') this.renderHeaders();
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
        const state = this.#game ? this.#game.getReader() : null;

        // 1: Always prioritize the LIVE ticking time over history snapshots!
        if (state && state.isLive) {
            wTime = state.whiteTime; 
            bTime = state.blackTime;
        } else if (this.#game && this.#game.currentNode && this.#game.currentNode.clock) {
            // Only use snapshot times if we are in Analysis/Puzzle mode
            wTime = this.#game.currentNode.clock.w;
            bTime = this.#game.currentNode.clock.b;
        } else {
            // Default fallbacks from PGN Headers
            if (state && state.headers && state.headers['TimeControl']) {
                const parts = state.headers['TimeControl'].split('+');
                const val = parseFloat(parts[0]);
                wTime = val;
                bTime = val;
            } else if (this.#game && this.#game.timeControl) {
                const parts = this.#game.timeControl.split('+');
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

        // 2: Lock the indicator to the TRUE live turn, ignoring PGN travel!
        if (state && state.isLive) {
            const activeTurn = state.turn;
            
            if (activeTurn === 'w') {
                wClockEl.classList.add('active', 'running');
            } else {
                bClockEl.classList.add('active', 'running');
            }
        } else if (this.#game && this.#game.currentNode) {
            const isStepping = (this.#game.currentNode !== this.#game.rootNode);
            if (isStepping) {
                const parts = this.#game.currentNode.fen.split(' ');
                const turn = parts[1] || 'w';

                if (turn === 'w') wClockEl.classList.add('active', 'running');
                else bClockEl.classList.add('active', 'running');
            }
        }
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
                    
                    // Wire safely into the UI highlighting methods
                    row.onmouseenter = () => {
                        row.style.backgroundColor = 'rgba(255,255,255,0.1)'; 
                        if (typeof this.highlightStatMoves === 'function') this.highlightStatMoves(colorChar, type.key);
                        if (typeof this.highlightChartPoints === 'function') this.highlightChartPoints(colorChar, type.key); 
                    };
                    row.onmouseleave = () => {
                        row.style.backgroundColor = 'transparent';
                        if (typeof this.clearStatHighlights === 'function') this.clearStatHighlights();
                        if (typeof this.highlightChartPoints === 'function') this.highlightChartPoints(null, null); 
                    };
                    row.onclick = () => {
                        if (typeof this.jumpToNextError === 'function') this.jumpToNextError(colorChar, type.key); 
                    };

                    section.appendChild(row);
                }
            });
            return section;
        };

        container.appendChild(createStatSection(stats.w, "White", 'w'));
        container.appendChild(createStatSection(stats.b, "Black", 'b'));
    }
renderSpellBar() {
        if (typeof this.renderHeaders === 'function') {
            this.renderHeaders();
        }
    }
toggleSpell(spellType, colorRequest) {
        const state = this.#game ? this.#game.getReader() : null;
        if (!state || !state.mana) return;

        if (state.turn !== colorRequest) {
            if (typeof this.showNotification === 'function') {
                this.showNotification("It's not your turn!", "Invalid", "⚠️");
            }
            return;
        }

        const engineUses = (this.#game && this.#game.engine && typeof this.#game.engine.spell_uses === 'function') 
            ? this.#game.engine.spell_uses() 
            : { w: { freeze: 5, jump: 2 }, b: { freeze: 5, jump: 2 } };
            
        const usesLeft = engineUses[colorRequest][spellType];
        
        if (usesLeft <= 0) {
            if (typeof this.showNotification === 'function') {
                this.showNotification('Out of charges!', 'Empty', '🚫');
            }
            return;
        }

        // Prevent casting if on cooldown
        const currentCharge = state.mana[colorRequest][spellType];
        if (currentCharge < 3) {
            if (typeof this.showNotification === 'function') {
                this.showNotification('Spell is still recharging!', 'Cooldown', '⏳');
            }
            return;
        }
        
        if (this.activeSpell === spellType) {
            this.activeSpell = null; 
        } else {
            this.activeSpell = spellType; 
            if (typeof this.cleanupDrag === 'function') this.cleanupDrag(false); 
        }
        
        this.renderBoard(false);
        this.renderHeaders(); 
    }
castSpell(spellType, targetSq) {
        this.activeSpell = null;
        
        let res = this.#game.draftSpell(spellType, targetSq);

        if (res) {
            this.pendingSpell = {
                isSpell: true,
                spellType: spellType,
                target: targetSq,
                san: res.san
            };
            this.renderBoard(false);
            this.renderHeaders(); 
        } else {
            if (typeof this.showNotification === 'function') {
                this.showNotification('Invalid spell target!', 'Error', '❌');
            }
        }
    }
    initGraphEvents() {
        if (this._graphEventsBound) return;
        this._graphEventsBound = true;

        this.injectGraphCSS();

        const tab = document.getElementById('tabContent-Graph');
        if (!tab) return;

        let isDown = false;
        let startX, startY, scrollLeft, scrollTop;

        tab.addEventListener('mousedown', (e) => {
            if (e.target.closest('.g-node-content') || e.target.closest('button') || e.target.closest('select') || e.target.closest('input') || e.target.closest('label')) return;

            const bottomPanel = tab.querySelector('div[style*="z-index: 10001"]');
            if (bottomPanel && bottomPanel.contains(e.target)) return;

            isDown = true;
            tab.classList.add('dragging');
            
            const scale = window.appScale || 1;
            startX = e.pageX / scale;
            startY = e.pageY / scale;
            scrollLeft = tab.scrollLeft;
            scrollTop = tab.scrollTop;
        });

        window.addEventListener('mouseup', () => { 
            isDown = false; 
            if (tab) tab.classList.remove('dragging'); 
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            
            const scale = window.appScale || 1;
            const x = e.pageX / scale;
            const y = e.pageY / scale;
            
            tab.scrollLeft = scrollLeft - (x - startX);
            tab.scrollTop = scrollTop - (y - startY);
        });
        window.addEventListener('resize', () => {
            if (tab.classList.contains('active')) {
                const zoomWrapper = document.getElementById('graphZoomWrapper');
                const svgLayer = zoomWrapper?.querySelector('.graph-svg-layer');
                
                if (zoomWrapper && svgLayer) {
                    clearTimeout(this._resizeDrawTimeout);
                    this._resizeDrawTimeout = setTimeout(() => {
                        this.drawGraphLines(zoomWrapper, svgLayer);
                    }, 50);
                }
            }
        });
    }
    injectGraphCSS() {
        if (document.getElementById('graph-tab-styles')) return;
        const style = document.createElement('style');
        style.id = 'graph-tab-styles';
        style.innerHTML = `
            #tabContent-Graph.active {
                display: block !important; position: fixed !important;
                top: 0 !important; left: 0 !important; width: 100vw !important; height: 100vh !important;
                z-index: 9999 !important; background: #0f172a !important; 
                overflow: auto !important; 
                scrollbar-width: none; 
                cursor: grab;
            }
            #tabContent-Graph.active::-webkit-scrollbar { display: none; }
            #tabContent-Graph.active.dragging { cursor: grabbing; }
            
            .pgn-graph-fullscreen {
                position: relative; display: inline-block; 
                width: max-content; height: max-content;
                min-width: 100vw; min-height: 100vh;
                padding: 3000px; 
                box-sizing: content-box;
            }
            .graph-svg-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; overflow: visible !important; }
            
            .g-node-wrapper { display: flex; flex-direction: row; align-items: center; flex-shrink: 0; }
            .g-children { display: flex; flex-direction: column; justify-content: center; padding-left: 150px; gap: 40px; flex-shrink: 0; }
            
            .g-node-content {
                transform: translateZ(0);
                position: relative; z-index: 2; background: #1e1e1e; border: 4px solid #444;
                border-radius: 12px; padding: 10px; cursor: pointer;
                box-shadow: 0 10px 25px rgba(0,0,0,0.7); transition: all 0.15s ease;
                display: flex; flex-direction: column; align-items: center; gap: 10px; 
                width: 220px; flex-shrink: 0; 
            }
            
            .g-move-text {
                font-weight: 800; color: #fff; font-family: 'Segoe UI', Tahoma, sans-serif;
                font-size: 18px; text-align: center; white-space: nowrap;
                background: #0f172a; padding: 4px 12px; border-radius: 6px;
                border: 1px solid #334155; flex-shrink: 0;
            }
            
            .g-mini-board {
                position: relative; display: block; 
                width: 200px; height: 200px; flex-shrink: 0;
                background-color: var(--board-light, #f0d9b5);
                background-image: conic-gradient(var(--board-dark, #b58863) 90deg, transparent 90deg 180deg, var(--board-dark, #b58863) 180deg 270deg, transparent 270deg);
                background-size: 25% 25%; background-position: 0 0;
                
                border: 2px solid #000; border-radius: 4px; overflow: hidden;
            }
            
            .g-mini-piece { 
                position: absolute; width: 12.5%; height: 12.5%; pointer-events: none; 
                margin: 0 !important; padding: 0 !important;
                display: flex; justify-content: center; align-items: center;
            }
            .g-mini-piece img, .g-mini-piece svg {
                width: 90% !important; height: 90% !important; object-fit: contain;
                margin: 0 !important; padding: 0 !important; display: block;
            }
            .g-blur-past { filter: blur(3px) grayscale(50%); opacity: 0.4; }
            .g-focus { filter: none; opacity: 1; }
            .g-blur-future { filter: blur(3px) grayscale(70%); opacity: 0.25; }
            .g-node-content:hover { 
                border-color: #38bdf8; transform: scale(1.03); z-index: 5; 
                filter: none !important; opacity: 1 !important;
            }

            .g-node-content.active { 
                border-color: #26c2a3; 
                box-shadow: 0 0 30px rgba(38, 194, 163, 0.8); 
                transform: scale(1.04) translateZ(0);
                z-index: 10; 
                filter: none !important; 
                opacity: 1 !important;
            }            
            #tabContent-Graph > div[style*="z-index: 10001"] { cursor: default !important; }
            #tabContent-Graph > div[style*="z-index: 10001"] input[type="range"] { cursor: pointer !important; }
        `;
        document.head.appendChild(style);
    }
    changeGraphMode(mode) {
        this.graphMode = mode;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('chess_graph_mode', mode);
        }
        this.renderFullGraph(); 
    }
    changeGraphZoom(val) {
        this.graphZoom = parseFloat(val);
        const label = document.getElementById('graphZoomLabel');
        if (label) label.innerText = Math.round(this.graphZoom * 100) + '%';
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('chess_graph_zoom', this.graphZoom);
        }
        
        const wrapper = document.getElementById('graphZoomWrapper');
        const treeRoot = document.getElementById('graphTreeRoot');
        
        if (wrapper && treeRoot) {
            wrapper.style.transform = `scale(${this.graphZoom})`;
            
            const w = treeRoot.offsetWidth;
            const h = treeRoot.offsetHeight;
            wrapper.style.width = w + 'px';
            wrapper.style.height = h + 'px';
            wrapper.style.marginRight = (w * this.graphZoom - w) + 'px';
            wrapper.style.marginBottom = (h * this.graphZoom - h) + 'px';

            this.scrollToActiveGraphNode('auto');
        }
    }
    changeGraphSource(source) {
        if (!this.#game) return;
        
        // Force save current graph state before switching source to prevent data loss
        if (this._previousTabBeforeGraph === 'analysis' && typeof this.#game.saveState === 'function') {
            this.#game.saveState('analysis');
        } else if ((this._previousTabBeforeGraph === 'study' || this._previousTabBeforeGraph === 'trainer') && typeof this.#game.saveActiveChapter === 'function') {
            this.#game.saveActiveChapter();
        }

        this._previousTabBeforeGraph = source; 
        if (typeof localStorage !== 'undefined') localStorage.setItem('chess_graph_source', source);
        
        const currentFlip = this.flipped; // Activate Flip Shield

        // Force game engine to load the memory of the new source
        if (source === 'study' || source === 'trainer') {
            let savedChap = parseInt(localStorage.getItem('chess_active_chapter_idx'), 10);
            if (isNaN(savedChap)) savedChap = this.#game.activeChapterIndex || 0;
            if (typeof this.#game.loadChapter === 'function') this.#game.loadChapter(savedChap, true, true);
        } else {
            if (typeof this.#game.restoreState === 'function') this.#game.restoreState(source);
        }
        
        // Restore flip state if the core engine maliciously changed it
        if (this.flipped !== currentFlip) {
            this.flipped = currentFlip;
            if (typeof localStorage !== 'undefined') localStorage.setItem('chess_graph_flip', currentFlip ? 'b' : 'w');
        }
        
        this.#game.mode = 'graph';
        this._lastTreeSize = -1;
        this.renderFullGraph();
    }
    changeGraphChapter(indexStr) {
        if (!this.#game) return;
        const idx = parseInt(indexStr, 10);
        if (!isNaN(idx) && typeof this.#game.loadChapter === 'function') {
            const currentFlip = this.flipped;
            
            this.#game.loadChapter(idx);
            
            if (this.flipped !== currentFlip) {
                this.flipped = currentFlip;
                if (typeof localStorage !== 'undefined') localStorage.setItem('chess_graph_flip', currentFlip ? 'b' : 'w');
            }
            
            if (typeof localStorage !== 'undefined') localStorage.setItem('chess_active_chapter_idx', idx); 
            
            this.#game.mode = 'graph';
            this._lastTreeSize = -1;
            this.renderFullGraph();
        }
    }
    scrollToActiveGraphNode(behavior = 'smooth', targetId = null) {
        const tab = document.getElementById('tabContent-Graph');
        const activeEl = targetId ? document.querySelector(`.g-node-content[data-id="${targetId}"]`) : document.querySelector('.g-node-content.active');
        if (!tab || !activeEl) return;

        void tab.offsetHeight;

        const tabRect = tab.getBoundingClientRect();
        const elRect = activeEl.getBoundingClientRect();

        const targetX = tab.scrollLeft + (elRect.left - tabRect.left) - (tab.clientWidth / 2) + (elRect.width / 2);
        const targetY = tab.scrollTop + (elRect.top - tabRect.top) - (tab.clientHeight / 2) + (elRect.height / 2);

        if (behavior === 'lerp') {
            if (!this._cameraTarget) {
                this._cameraTarget = { x: tab.scrollLeft, y: tab.scrollTop };
                this._cameraCurrent = { x: tab.scrollLeft, y: tab.scrollTop };
                this._isCameraAnimating = false;
            }
            
            this._cameraTarget.x = Math.max(0, targetX);
            this._cameraTarget.y = Math.max(0, targetY);
            
            if (!this._isCameraAnimating) {
                this._cameraCurrent.x = tab.scrollLeft;
                this._cameraCurrent.y = tab.scrollTop;
                this._isCameraAnimating = true;
                this._animateCamera();
            }
        } else {
            tab.scrollTo({ left: Math.max(0, targetX), top: Math.max(0, targetY), behavior: behavior });
        }
    }
    _animateCamera() {
        if (!this._isCameraAnimating) return;
        const tab = document.getElementById('tabContent-Graph');
        if (!tab) { this._isCameraAnimating = false; return; }

        const lerpFactor = 0.25; 
        this._cameraCurrent.x += (this._cameraTarget.x - this._cameraCurrent.x) * lerpFactor;
        this._cameraCurrent.y += (this._cameraTarget.y - this._cameraCurrent.y) * lerpFactor;

        tab.scrollLeft = this._cameraCurrent.x;
        tab.scrollTop = this._cameraCurrent.y;

        if (Math.abs(this._cameraTarget.x - this._cameraCurrent.x) < 1 && 
            Math.abs(this._cameraTarget.y - this._cameraCurrent.y) < 1) {
            tab.scrollLeft = this._cameraTarget.x;
            tab.scrollTop = this._cameraTarget.y;
            this._isCameraAnimating = false;
            return;
        }
        
        requestAnimationFrame(() => this._animateCamera());
    }
    drawGraphLines(listContainer, svgLayer) {
        const svgNS = "http://www.w3.org/2000/svg";
        svgLayer.innerHTML = ''; 
        
        svgLayer.setAttribute('width', '100%');
        svgLayer.setAttribute('height', '100%');
        
        const getUnscaledPos = (el) => {
            const elRect = el.getBoundingClientRect();
            const containerRect = listContainer.getBoundingClientRect();
            const zoom = this.graphZoom || 1;
            return {
                left: (elRect.left - containerRect.left) / zoom,
                top: (elRect.top - containerRect.top) / zoom,
                width: elRect.width / zoom,
                height: elRect.height / zoom
            };
        };

        const wrappers = listContainer.querySelectorAll('.g-node-wrapper');
        
        // GOM CHUỖI SIÊU TỐC V8
        let normalPathStr = "";
        let blurredPathStr = "";
        
        wrappers.forEach(wrapper => {
            const parentNode = wrapper.querySelector('.g-node-content');
            const childrenContainer = wrapper.querySelector('.g-children');
            if (!parentNode || !childrenContainer) return;

            const pPos = getUnscaledPos(parentNode);
            const startX = pPos.left + pPos.width;
            const startY = pPos.top + (pPos.height / 2);

            const childWrappers = childrenContainer.children;
            for (let i = 0; i < childWrappers.length; i++) {
                if (!childWrappers[i].classList.contains('g-node-wrapper')) continue;
                
                const childEl = childWrappers[i].querySelector('.g-node-content');
                if (!childEl) continue;

                const cPos = getUnscaledPos(childEl);
                const endX = cPos.left;
                const endY = cPos.top + (cPos.height / 2);

                const cpX = (startX + endX) / 2; 
                
                const curveD = `M ${startX} ${startY} C ${cpX} ${startY}, ${cpX} ${endY}, ${endX} ${endY} `;
                const isBlurred = childEl.classList.contains('g-blur-future') || parentNode.classList.contains('g-blur-past');
                
                if (isBlurred) blurredPathStr += curveD;
                else normalPathStr += curveD;
            }
        });

        // CHỈ RENDER ĐÚNG 2 THẺ DOM VÀO TRÌNH DUYỆT
        if (blurredPathStr) {
            const blurPath = document.createElementNS(svgNS, 'path');
            blurPath.setAttribute('d', blurredPathStr);
            blurPath.setAttribute('fill', 'transparent');
            blurPath.setAttribute('stroke', 'rgba(56, 189, 248, 0.25)');
            blurPath.setAttribute('stroke-width', '2');
            svgLayer.appendChild(blurPath);
        }

        if (normalPathStr) {
            const normalPath = document.createElementNS(svgNS, 'path');
            normalPath.setAttribute('d', normalPathStr);
            normalPath.setAttribute('fill', 'transparent');
            normalPath.setAttribute('stroke', '#38bdf8');
            normalPath.setAttribute('stroke-width', '3');
            svgLayer.appendChild(normalPath);
        }
    }
    renderHistoryImmediate() {
        const list = document.getElementById('moveHistory');
        if (!list) return;
        
        const styleSelect = document.getElementById('pgnStyle');
        const isNone = styleSelect && (styleSelect.value === 'none' || (styleSelect.selectedOptions[0] && styleSelect.selectedOptions[0].text === 'None'));
        this.pgnStyle = styleSelect ? styleSelect.value : 'standard';
        
        if (isNone) {
            list.innerHTML = ''; list.style.display = 'block'; list.classList.remove('hidden'); list.className = 'history-list pgn-none'; 
            return;
        }

        let currentTreeSize = 0;
        if (this.#game && this.#game.rootNode) currentTreeSize = this.getTreeSize(this.#game.rootNode);
        
        const activeNode = this.#game ? this.#game.currentNode : null;
        const activeNodeId = activeNode ? activeNode.id : null;

        if (this._lastTreeSize === currentTreeSize && activeNodeId && list.children.length > 0) {
            if (this.pgnStyle === 'graph') {
                if (typeof this.fastUpdateGraphVisuals === 'function') this.fastUpdateGraphVisuals();
                this.scrollToActiveGraphNode('smooth', activeNodeId);
                return;
            } else {
                list.querySelectorAll('.active').forEach(el => el.classList.remove('active'));
                const newActiveEl = list.querySelector(`[data-id="${activeNodeId}"]`);
                if (newActiveEl) newActiveEl.classList.add('active');
                
                if (activeNode) {
                    const commentBox = document.getElementById('commentaryBox');
                    if (commentBox && document.activeElement !== commentBox) {
                        let displayComment = (activeNode.comment || "").replace(/\[%(cal|csl)[^\]]+\]/g, "").trim();
                        commentBox.innerText = displayComment || "Click to add comment...";
                    }
                }
                this.scrollToActiveMove();
                if (typeof this.updateChartActiveLine === 'function') this.updateChartActiveLine();
                return; 
            }
        }

        this._lastTreeSize = currentTreeSize;
        list.innerHTML = ''; list.style.display = 'block'; list.classList.remove('hidden');

        if (this.pgnStyle === 'graph') {
            list.className = 'pgn-graph';
            if (this.#game && this.#game.rootNode) {
                const svgNS = "http://www.w3.org/2000/svg";
                const svgLayer = document.createElementNS(svgNS, "svg");
                svgLayer.setAttribute("class", "graph-svg-layer");
                list.appendChild(svgLayer);

                const treeRoot = document.createElement('div');
                this._renderGraphRecursive(this.#game.rootNode, treeRoot, activeNode, 0);
                list.appendChild(treeRoot);

                requestAnimationFrame(() => this.drawGraphLines(list, svgLayer));
            }
        } else if (this.pgnStyle === 'tree') {
            list.className = 'history-list pgn-tree';
            if (this.#game && this.#game.rootNode) this.renderTreeVertical(this.#game.rootNode, list);
        } else {
            list.className = 'history-list pgn-standard';
            if (this.#game && this.#game.rootNode) this.renderTreeRecursive(this.#game.rootNode, list, 1);
        }

        if (activeNode) {
            let displayComment = (activeNode.comment || "").replace(/\[%(cal|csl)[^\]]+\]/g, "").trim();
            const commentBox = document.getElementById('commentaryBox');
            if (commentBox) commentBox.innerText = displayComment || "Click to add comment...";
        }

        this.scrollToActiveMove();
        if (typeof this.updateChartActiveLine === 'function') this.updateChartActiveLine();
    }
    fastUpdateGraphVisuals(customNode = null) {
        if (!this.#game || !this.#game.rootNode) return;
        const activeNode = customNode || this.#game.currentNode;
        if (!activeNode) return;
        
        const activeDepth = this.getPly(activeNode);
        
        const activePathIds = new Set();
        let curr = activeNode;
        while (curr) { activePathIds.add(curr.id); curr = curr.parent; }

        const classMap = new Map();
        
        const traverse = (n) => {
            let myDepth = this.getPly(n);
            let isOnPath = activePathIds.has(n.id);
            let isPast = isOnPath && myDepth < activeDepth;
            let classes = ['g-node-content'];
            
            if (n === activeNode) {
                classes.push('g-focus', 'active');
            } else if (n.parent === activeNode) {
                classes.push('g-focus');
            } else if (isOnPath && isPast) {
                if (activeDepth - myDepth >= 2) classes.push('g-blur-past');
                else classes.push('g-focus');
            } else {
                classes.push('g-blur-future');
            }
            classMap.set(n.id, classes.join(' '));
            n.children.forEach(c => traverse(c));
        };
        traverse(this.#game.rootNode);

        const domNodes = document.querySelectorAll('.g-node-content');
        domNodes.forEach(el => {
            const id = el.dataset.id;
            if (classMap.has(id)) el.className = classMap.get(id);
        });
        const zoomWrapper = document.getElementById('graphZoomWrapper');
        const svgLayer = document.querySelector('.graph-svg-layer');
        if (zoomWrapper && svgLayer) {
            this.drawGraphLines(zoomWrapper, svgLayer);
        }
    }
    parseFenToGridLocal(fen) {
    const grid = new Array(64).fill(null);
    const boardPart = fen.split(' ')[0];
    let i = 0;
    
    for (let idx = 0; idx < boardPart.length; idx++) {
        const char = boardPart[idx];
        if (char === '/') continue;
        
        const code = char.charCodeAt(0);
        if (code >= 48 && code <= 57) {
            i += code - 48;
        } else {
            const isLower = code >= 97;
            grid[i] = (isLower ? 'b' : 'w') + (isLower ? char : String.fromCharCode(code + 32));
            i++;
        }
    }
    return grid;
    }
    async preloadPieceImages() {
        this._imgCache = {}; 
        
        const selector = document.getElementById('assetType');
        const theme = selector ? selector.value : 'cburnett';
        
        if (theme === 'local' && this.customPieces) {
            const loadPromises = Object.keys(this.customPieces).map(code => {
                return new Promise((resolve) => {
                    const img = new Image();
                    img.crossOrigin = "Anonymous";
                    img.onload = () => { this._imgCache[code] = img; resolve(); };
                    img.onerror = () => resolve();
                    img.src = this.customPieces[code];
                });
            });
            await Promise.all(loadPromises);
            return;
        }
        const set = PIECE_SETS[theme];
        if (!set) return;

        const loadPromises = ['wP','wN','wB','wR','wQ','wK','bP','bN','bB','bR','bQ','bK'].map(code => {
            return new Promise((resolve) => {
                const rawSVG = set.pieces[code];
                if (!rawSVG) { resolve(); return; }
                
                let src = "";
                let trimmed = rawSVG.trim();
                
                if (trimmed.startsWith('<svg')) {
                    src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(trimmed);
                } else if (trimmed.startsWith('<img')) {
                    const match = trimmed.match(/src=["'](.*?)["']/);
                    if (match) src = match[1];
                } else {
                    src = trimmed;
                }

                const img = new Image();
                img.crossOrigin = "Anonymous";
                img.onload = () => { this._imgCache[code] = img; resolve(); };
                img.onerror = () => resolve();
                img.src = src;
            });
        });
        
        const duckPromise = new Promise((resolve) => {
            const img = new Image();
            img.onload = () => { this._imgCache['duck'] = img; resolve(); };
            img.onerror = () => resolve();
            img.src = 'assets/tabs-icon/variant-duckchess.svg';
        });
        loadPromises.push(duckPromise);

        await Promise.all(loadPromises);
    }
    drawMiniBoardToCanvas(fen, canvas) {
        const ctx = canvas.getContext('2d', { alpha: true });
        const size = canvas.width;
        const sqSize = size / 8;
        
        ctx.clearRect(0, 0, size, size);
        
        if (!this._imgCache || !fen) return;
        const rows = fen.split(' ')[0].split('/');
        for (let r = 0; r < 8; r++) {
            let c = 0;
            for (let char of rows[r]) {
                if (/\d/.test(char)) c += parseInt(char, 10);
                else if (char !== '~' && char !== '*') {
                    const color = char === char.toUpperCase() ? 'w' : 'b';
                    const type = char.toUpperCase();
                    const img = this._imgCache[color + type];
                    if (img) {
                        const padding = sqSize * 0.05;
                        const drawFn = () => {
                            ctx.drawImage(img, c * sqSize + padding, r * sqSize + padding, sqSize * 0.9, sqSize * 0.9);
                        };
                        if (img.complete && img.naturalWidth !== 0) drawFn();
                        else img.addEventListener('load', drawFn, { once: true });
                    }
                    c++;
                } else if (char === '*') c++;
            }
        }
    }
    renderGraphNode(node, container, activeNode, depth, activePathIds, activeDepth) {
        if (!node) return;
        if (!node.id) node.id = 'n_' + Math.random().toString(36).substr(2, 9);

        const mode = this.graphMode || 'focused';
        const isFullMode = (mode === 'full');

        let myDepth = this.getPly(node);
        let isOnActivePath = activePathIds.has(node.id);
        let isPast = isOnActivePath && myDepth < activeDepth;

        if (!isFullMode && !isOnActivePath && myDepth > activeDepth + 2) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'g-node-wrapper';

        const content = document.createElement('div');
        content.className = 'g-node-content';
        content.dataset.id = node.id;
        
        if (node === activeNode) {
            content.classList.add('g-focus', 'active');
        } 
        else if (node.parent === activeNode && isOnActivePath) { 
            content.classList.add('g-focus', 'path-next');
        }
        else if (node.parent === activeNode) {
            content.classList.add('g-focus');
        } 
        else if (isOnActivePath && isPast) {
            if (activeDepth - myDepth >= 2) content.classList.add('g-blur-past');
            else content.classList.add('g-focus');
        } 
        else {
            content.classList.add('g-blur-future');
        }

        const boardDiv = document.createElement('div');
        boardDiv.className = 'g-mini-board';
        boardDiv.innerHTML = `<canvas id="gcanv-${node.id}" width="200" height="200" style="display: block; width:100%; height:100%;"></canvas>`;

        const moveTxt = document.createElement('div');
        moveTxt.className = 'g-move-text';
        let nagStr = "";
        if (node.nag) {
            node.nag.toString().split(',').forEach(n => {
                const info = this.getNagInfo(n.trim());
                if(info) nagStr += `<span style="display:inline-block; font-size:12px; font-weight:bold; color:#fff; background:${info.color}; border:2px solid ${info.borderColor}; border-radius:50%; width:18px; height:18px; text-align:center; line-height:14px; margin-left:4px; box-shadow:0 1px 3px rgba(0,0,0,0.5);">${info.symbol}</span>`;
            });
        }
        
        let sanText = node.moveSan || "Start";
        if (node === this.#game.rootNode) sanText = "Start";
        else if (sanText.includes('from:')) sanText = "...";

        moveTxt.innerHTML = sanText + nagStr;

        content.appendChild(boardDiv);
        content.appendChild(moveTxt);

        if (node.comment) {
            let cleanComment = node.comment.replace(/\[%(eval|clk|cal|csl|emt)[^\]]*\]/g, "").trim();
            cleanComment = cleanComment.replace(/\bbook\b/ig, "").trim();
            if (cleanComment.length > 0) {
                const commentDiv = document.createElement('div');
                commentDiv.style.cssText = 'color: #aaa; font-size: 13px; font-style: italic; background: rgba(0,0,0,0.3); padding: 6px 10px; border-radius: 4px; width: 100%; box-sizing: border-box; text-align: center; white-space: normal; word-break: break-word; overflow: hidden; max-height: 80px; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; margin-top: 4px; border-top: 1px solid #444;';
                commentDiv.innerText = cleanComment;
                content.appendChild(commentDiv);
            }
        }

        content.onclick = (e) => {
            e.stopPropagation();

            this._virtualNode = node;
            this._isKeyboardNavigating = false;

            if (typeof this.fastUpdateGraphVisuals === 'function') {
                this.fastUpdateGraphVisuals(node);
                this.scrollToActiveGraphNode('smooth', node.id); 
            }

            setTimeout(() => {
                if (this.#game.goToNodeId(node.id)) {
                    const freshState = this.#game.getReader();
                    this.renderBoard(false);
                    this.updateHistory(true);
                    this.renderArrows();
                    
                    if (freshState.mode !== 'play' && this.#game.updateStockfish) {
                        this.#game.updateStockfish();
                    }
                }
            }, 10);
        };

        wrapper.appendChild(content);

        if (node.children && node.children.length > 0) {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'g-children';
            let childrenToRender = [];
            
            if (isFullMode) {
                childrenToRender = node.children;
            } else {
                if (isPast) childrenToRender = node.children.filter(c => activePathIds.has(c.id));
                else if (myDepth === activeDepth || myDepth === activeDepth + 1) childrenToRender = node.children;
            }

            if (childrenToRender.length > 0) {
                childrenToRender.forEach(child => {
                    this.renderGraphNode(child, childrenContainer, activeNode, depth + 1, activePathIds, activeDepth);
                });
                wrapper.appendChild(childrenContainer);
            }
        }
        container.appendChild(wrapper);
    }
    renderFullGraph(skipCamera = false) {
        if (typeof this.initGraphEvents === 'function') this.initGraphEvents();
        if (!this.graphMode && typeof localStorage !== 'undefined') {
            this.graphMode = localStorage.getItem('chess_graph_mode') || 'focused';
        }
        const container = document.getElementById('treeGraphContainer');
        const tab = document.getElementById('tabContent-Graph');
        if (!container || !this.#game || !this.#game.rootNode) return;
        const selSource = document.getElementById('graphSourceSelect');
        const chapWrapper = document.getElementById('graphChapterWrapper');
        const chapSelect = document.getElementById('graphChapterSelect');
        const flipSelect = document.getElementById('graphFlipSelect');

        if (flipSelect) flipSelect.value = this.flipped ? 'b' : 'w';

        if (selSource) {
            const isStudy = (this._previousTabBeforeGraph === 'study' || this._previousTabBeforeGraph === 'trainer');
            selSource.value = isStudy ? 'study' : 'analysis';

            if (isStudy && chapWrapper && chapSelect && this.#game.chapters) {
                chapWrapper.style.display = 'flex';
                chapSelect.innerHTML = '';
                this.#game.chapters.forEach((ch, idx) => {
                    const opt = document.createElement('option');
                    opt.value = idx;
                    opt.text = `${idx + 1}. ${ch.title}`;
                    if (idx === this.#game.activeChapterIndex) opt.selected = true;
                    chapSelect.appendChild(opt);
                });
            } else if (chapWrapper) {
                chapWrapper.style.display = 'none';
            }
        }
        if (!this._imgCache) this.preloadPieceImages();

        container.innerHTML = '';
        const svgNS = "http://www.w3.org/2000/svg";
        
        const zoomWrapper = document.createElement('div');
        zoomWrapper.id = 'graphZoomWrapper';
        const currentZoom = this.graphZoom || 1;
        zoomWrapper.style.cssText = `position: relative; display: inline-block; transform: scale(${currentZoom}); transform-origin: top left; transition: transform 0.1s ease;`;

        const svgLayer = document.createElementNS(svgNS, "svg");
        svgLayer.setAttribute("class", "graph-svg-layer");
        zoomWrapper.appendChild(svgLayer);

        const treeRoot = document.createElement('div');
        treeRoot.id = 'graphTreeRoot';
        treeRoot.style.cssText = "display: inline-block; width: max-content; height: max-content;";
        
        let activePathIds = new Set();
        let curr = this.#game.currentNode;
        while(curr) { activePathIds.add(curr.id); curr = curr.parent; }

        this.renderGraphNode(this.#game.rootNode, treeRoot, this.#game.currentNode, 0, activePathIds, this.getPly(this.#game.currentNode));
        zoomWrapper.appendChild(treeRoot);
        container.appendChild(zoomWrapper); 

        const canvases = treeRoot.querySelectorAll('canvas[id^="gcanv-"]');
        canvases.forEach(canvas => {
            const nodeId = canvas.id.replace('gcanv-', '');
            const findNodeHelper = (currNode, id) => {
                if (currNode.id === id) return currNode;
                for(let c of currNode.children) { let res = findNodeHelper(c, id); if (res) return res; }
                return null;
            };
            const node = findNodeHelper(this.#game.rootNode, nodeId);
            if (node) this.drawMiniBoardToCanvas(node.fen, canvas);
        });

        requestAnimationFrame(() => {
            const w = treeRoot.offsetWidth;
            const h = treeRoot.offsetHeight;
            zoomWrapper.style.width = w + 'px';
            zoomWrapper.style.height = h + 'px';
            zoomWrapper.style.marginRight = (w * currentZoom - w) + 'px';
            zoomWrapper.style.marginBottom = (h * currentZoom - h) + 'px';
            
            this.drawGraphLines(zoomWrapper, svgLayer);

            const modeSelect = document.getElementById('graphModeSelect');
            if (modeSelect) modeSelect.value = this.graphMode || 'focused';
            const zoomSlider = document.getElementById('graphZoomSlider');
            if (zoomSlider) zoomSlider.value = this.graphZoom || 1;
            
            if (!skipCamera) {
                this.scrollToActiveGraphNode('auto');
            }
        });
    }
    _renderGraphRecursive(node, container, activeNode, depth) {
        if (!node) return;
        if (!node.id) node.id = 'n_' + Math.random().toString(36).substr(2, 9);

        const wrapper = document.createElement('div');
        wrapper.className = 'g-node-wrapper';
        const content = document.createElement('div');
        content.className = 'g-node-content';
        content.dataset.id = node.id;
        
        if (node === activeNode) content.classList.add('active');

        let activeDepth = this.getPly(activeNode);
        let myDepth = this.getPly(node);
        
        if (myDepth < activeDepth) content.classList.add('g-blur-past');
        else if (myDepth === activeDepth || myDepth === activeDepth + 1) content.classList.add('g-focus');
        else content.classList.add('g-blur-future');

        const moveTxt = document.createElement('div');
        moveTxt.className = 'g-move-text';
        
        let sanText = node.moveSan || "Start";
        if (node === this.#game.rootNode) sanText = "Start";
        else if (sanText.includes('from:')) sanText = "...";

        moveTxt.innerText = sanText;
        
        const boardDiv = document.createElement('div');
        boardDiv.className = 'g-mini-board';
        boardDiv.innerHTML = `<canvas id="gcanv-${node.id}" width="200" height="200" style="display: block; width:100%; height:100%; border-radius: 4px;"></canvas>`;

        content.appendChild(boardDiv);
        content.appendChild(moveTxt);

        content.onclick = (e) => {
            e.stopPropagation();
            if (this.#game.goToNodeId(node.id)) {
                const freshState = this.#game.getReader();
                this.renderBoard(false);
                this.updateHistory(true);
                this.renderArrows();
                if (freshState.mode !== 'play' && this.#game.updateStockfish) this.#game.updateStockfish();
            }
        };

        wrapper.appendChild(content);

        if (node.children && node.children.length > 0) {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'g-children';
            
            node.children.forEach(child => {
                this._renderGraphRecursive(child, childrenContainer, activeNode, depth + 1);
            });
            
            wrapper.appendChild(childrenContainer);
        }

        container.appendChild(wrapper);
    }
    initKeyboardEvents() {
        document.addEventListener('keydown', (e) => {
            const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
            if (['input', 'textarea', 'select'].includes(activeTag)) return;

            const settings = document.getElementById('settingsPanel');
            if (settings && settings.classList.contains('visible')) {
                if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) || ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) return; 
            }

            if (e.code === 'Space') {
                e.preventDefault(); 
                if (this.blindfoldMode && !this.isPeeking) {
                    this.isPeeking = true;
                    if (typeof this.renderBoard === 'function') this.renderBoard(false);
                }
                return;
            }

            if (!this.#game) return;

            const graphTab = document.getElementById('tabContent-Graph');
            const isGraphActive = graphTab && graphTab.classList.contains('active');
            if (isGraphActive && ['w','a','s','d','W','A','S','D','Tab','Enter'].includes(e.key)) {
                e.preventDefault();
            }

            const isForward = (e.key === 'ArrowRight' || (isGraphActive && (e.key === 'd' || e.key === 'D')));
            const isBackward = (e.key === 'ArrowLeft' || (isGraphActive && (e.key === 'a' || e.key === 'A')));
            const isStart = (e.key === 'ArrowUp');
            const isEnd = (e.key === 'ArrowDown');
            const isNextBranch = isGraphActive && (e.key === 's' || e.key === 'S' || e.key === 'Tab');
            const isPrevBranch = isGraphActive && (e.key === 'w' || e.key === 'W');
            const isEnter = isGraphActive && e.key === 'Enter';

            if (isEnter) {
                this.switchTab(this._previousTabBeforeGraph || 'study');
                return;
            }
            if (!this._virtualNode) this._virtualNode = this.#game.currentNode;
            
            if (!this._isKeyboardNavigating && this._virtualNode.id !== this.#game.currentNode.id) {
                this._virtualNode = this.#game.currentNode;
            }

            let targetNode = this._virtualNode;

            if (isForward && targetNode.children.length > 0) {
                targetNode = targetNode.children[targetNode.selectedChildIndex || 0];
            } 
            else if (isBackward && targetNode.parent) {
                targetNode = targetNode.parent;
            }
            else if (isStart) { 
                e.preventDefault(); 
                while (targetNode.parent) targetNode = targetNode.parent;
            }
            else if (isEnd) { 
                e.preventDefault(); 
                while (targetNode.children.length > 0) targetNode = targetNode.children[targetNode.selectedChildIndex || 0];
            }
            else if (isNextBranch || isPrevBranch) {
                if (targetNode && targetNode.parent && targetNode.parent.children.length > 1) {
                    const siblings = targetNode.parent.children;
                    let idx = siblings.indexOf(targetNode);
                    if (isNextBranch) idx = (idx + 1) % siblings.length; 
                    else idx = (idx - 1 + siblings.length) % siblings.length; 
                    targetNode = siblings[idx];
                }
            }

            if (targetNode && targetNode !== this._virtualNode) {
                this._virtualNode = targetNode;
                this._isKeyboardNavigating = true;

                if (isGraphActive) {
                    const zoomWrapper = document.getElementById('graphZoomWrapper');
                    const targetNodeEl = zoomWrapper ? zoomWrapper.querySelector(`.g-node-content[data-id="${targetNode.id}"]`) : null;

                    if (targetNodeEl) {
                        const oldActive = zoomWrapper.querySelector('.g-node-content.active');
                        if (oldActive) oldActive.classList.remove('active');

                        if (typeof this.fastUpdateGraphVisuals === 'function') {
                            this.fastUpdateGraphVisuals(targetNode);
                        }

                        targetNodeEl.classList.remove('g-blur-past', 'g-blur-future');
                        targetNodeEl.classList.add('g-focus', 'active');

                        this.scrollToActiveGraphNode('lerp', targetNode.id);

                        clearTimeout(this._keyboardDebounce);
                        this._keyboardDebounce = setTimeout(() => {
                            if (this.#game.currentNode.id !== targetNode.id) {
                                this.#game.goToNodeId(targetNode.id, false);
                            }
                            this._isKeyboardNavigating = false;
                        }, 40); 
                    } else {
                        clearTimeout(this._keyboardDebounce);
                        if (this.#game.currentNode.id !== targetNode.id) {
                            this.#game.goToNodeId(targetNode.id, false);
                        }
                        this.renderFullGraph(false, targetNode);
                        this._isKeyboardNavigating = false;
                    }
                } else {
                    clearTimeout(this._keyboardDebounce);
                    if (this.#game.currentNode.id !== targetNode.id) {
                        this.#game.goToNodeId(targetNode.id, true);
                    }
                    this._isKeyboardNavigating = false;
                }
            }
        });

        document.addEventListener('keyup', (e) => {
            const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
            if (['input', 'textarea', 'select'].includes(activeTag)) return;

            if (e.code === 'Space' && this.blindfoldMode && this.isPeeking) {
                this.isPeeking = false;
                if (typeof this.renderBoard === 'function') this.renderBoard(false);
            }
            if (e.code === 'KeyX' || e.key === 'x') {
                const graphTab = document.getElementById('tabContent-Graph');
                if (graphTab && graphTab.classList.contains('active')) {
                    const prevMode = this._previousTabBeforeGraph || 'analysis';
                    this.switchTab(prevMode);
                }
            }
        });
    }
}