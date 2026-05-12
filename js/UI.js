import { FILES, RANKS, ICON_BOOK_SVG, ICON_BOOK_SVG_IMG_BLUE, INITIAL_FEN, ICON_SETTING_SVG, VARIANT_STARTING_FENS } from './constants.js';
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
        this.#bindDOMEvents(); // 🔒 Encapsulated Event Binding
        this.initKeyboardEvents();
        this.initEditorBars();
        this.initSoundSettings();
        this.initVolume();
        this.initResizer();
        this.initSidebarResizers();
        this.initThemeButtons();
        this.boardWrapper = document.getElementById('board-wrapper');
        if (this.boardWrapper) this.boardWrapper.style.width = '632px';
        
        const animCheckbox = document.getElementById('enableAnimations');
        this.animationsEnabled = animCheckbox ? animCheckbox.checked : true;

        if (this.#game) {
            const startFen = typeof INITIAL_FEN !== 'undefined' ? INITIAL_FEN : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
            this.#game.loadFEN(startFen);
            this.#game.currentNode = this.#game.rootNode;
        }
        
        this.renderBoard(false);
        this.updateClocks();

        if (this.DEFAULT_SETTINGS_OPEN) {
            const panel = document.getElementById('settingsPanel');
            if (panel) panel.classList.add('visible');
        }

        this.updateBotMenuPreviews();
        this.renderCharts();
        this.#initializeObservers(); // 🔒 Encapsulated Observers
        this.#loadCachedTheme(); // 🔒 Encapsulated Theme Loading
        
        const resignBtn = document.getElementById('resignBtn');
        const drawBtn = document.getElementById('drawBtn');
        if (resignBtn) resignBtn.style.display = 'none';
        if (drawBtn) drawBtn.style.display = 'none';
        setTimeout(() => {
            if (typeof this.resizeApp === 'function') this.resizeApp();

            // ✨ THE GLOBAL RESTORE: Automatically load into whichever tab you were looking at!
            let lastTab = 'play';
            if (typeof localStorage !== 'undefined') {
                lastTab = localStorage.getItem('chess_last_tab') || 'play';
            }
            this.switchTab(lastTab);

            // Force a deep UI sweep
            if (this.#game) {
                this.updateHistory();
                this.renderArrows();
                if (typeof this.updateClocks === 'function') this.updateClocks();
            }
        }, 50);
    }
#bindDOMEvents() {
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
                
                // FIX: Update Editor board directly without switching to Analysis mode
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
                    this.#game.setGameMode(e.target.value);
                    this.#game.loadNewPosition(VARIANT_STARTING_FENS[e.target.value], e.target.value);
                    if (window.sfWorker) {
                        window.sfWorker.postMessage('setoption name UCI_Variant value ' + (e.target.value === 'classical' ? 'chess' : e.target.value));
                    }
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
                    null, // ✨ FIX: Pass null so the UI auto-detects the correct preset HTML button
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
        if (stateMode === 'puzzle' || stateMode === 'puzzles') targetId = 'tabContent-Puzzles';
        else if (stateMode === 'editor') targetId = 'tabContent-Editor';

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

        document.querySelectorAll('.player-header').forEach(el => el.style.display = (isEditor || isPuzzle) ? 'none' : '');
        const commentaryBox = document.getElementById('commentaryBox');
        if (commentaryBox) commentaryBox.style.display = (isEditor || isPuzzle) ? 'none' : '';

        const engineBtn = document.querySelector('.engine-toggle-btn');
        if (engineBtn) {
            engineBtn.style.display = isEditor ? 'none' : '';
            if (isPuzzle && this.#game && this.#game.getReader && !this.#game.getReader().isGameOver && this.#game.getReader().puzzle && this.#game.getReader().puzzle.active) {
                engineBtn.style.opacity = '0.5'; engineBtn.style.cursor = 'not-allowed';
            } else {
                engineBtn.style.opacity = '1'; engineBtn.style.cursor = 'pointer';
            }
        }
        const enginePanel = document.getElementById('enginePanel');
        if (enginePanel) enginePanel.style.display = isEditor ? 'none' : '';
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
switchTab(tabName) {
        if (!tabName) return;
        const lowerTab = tabName.toLowerCase();
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('chess_last_tab', lowerTab);
        }
        if (this.#game) {
            if (this.#game.mode === 'editor' && lowerTab !== 'editor') {
                const fenInput = document.getElementById('fenInput');
                const currentFen = fenInput ? fenInput.value : (typeof this.#game.generateFEN === 'function' ? this.#game.generateFEN() : "");
                if (!this.#validateEditorExit(currentFen)) return; // Block switch if invalid
            }

            if (lowerTab === 'editor') {
                this.originalEditorFen = typeof this.#game.generateFEN === 'function' ? this.#game.generateFEN() : (this.#game.currentNode ? this.#game.currentNode.fen : "");
            }

            if (typeof this.#game.handleTabSwitch === 'function') {
                this.#game.handleTabSwitch(lowerTab);
            } else if (typeof this.#game.switchMode === 'function') {
                this.#game.switchMode(lowerTab);
            }
        }

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

        if (this.#game) {
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

        // ✨ LAYOUT FIX: Prevent the container from expanding infinitely and breaking the Chart panel
        resultDiv.style.overflowY = 'auto';
        resultDiv.style.maxHeight = '350px'; 
        resultDiv.style.paddingRight = '5px';

        resultDiv.innerHTML = `<div style="color:#38bdf8; text-align:center; padding:20px;">Fetching ${timeControl} games... ⏳<br><small>(This may take a few seconds to fetch 200 games)</small></div>`;

        try {
            let games = [];

            if (platform === 'lichess') {
                // ✨ FETCH FIX: Request 200 games instead of 50
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

                // ✨ FETCH FIX: Chess.com only gives 1 month per API call. 
                // We will loop backwards up to 4 months until we hit exactly 200 games!
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
                
                // ✨ FIX: Permanently enforce scrolling on the left panels!
                if (el.id === 'analysisPanel' || el.id === 'study-sidebar') {
                    el.style.overflowY = 'auto';
                    el.style.overflowX = 'hidden';
                } else {
                    el.style.overflow = '';
                }
                
                el.style.display = (el.id === 'study-sidebar' && !isStudy) || (el.id === 'analysisPanel' && !isAnalysis) ? 'none' : 'flex';
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
            evalW = getW(enginePanel) > 0 ? getW(enginePanel) + dynamicSpacing : (25 + dynamicSpacing); 
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
        // ✨ THE FIX: Allow the engine to explicitly command the state!
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

        // ✨ TRUE TREE MATH: Get the EXACT path of the current variation from the engine memory!
        // This guarantees that alternate sublines stay blurred out.
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
        const isPuzzle = this.#game && this.#game.mode === 'puzzle' && !this.#game.gameOver;

        if (forceOff) {
            window.engineAnalysing = false;
        } else if (isLiveGame) {
            this.showNotification("Engine assistance is disabled during active play.", "Action Restricted", "🚫");
            window.engineAnalysing = false;
        } else if (isPuzzle) {
            this.showNotification("Solve the puzzle first!", "Action Restricted", "❌");
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

        // ✨ FIX: Update cache key to include Spell properties! 
        // Otherwise, the headers won't redraw when you click a spell or spend mana!
        const cacheKey = JSON.stringify({ 
            topData, botData, flipped: this.flipped, avatars: this.avatars,
            activeSpell: this.activeSpell, 
            mana: state ? state.mana : null, 
            gameMode: state ? state.gameMode : null
        });
        
        if (this._lastHeadersCache === cacheKey) return;
        this._lastHeadersCache = cacheKey;

        const isoToCountryName = { "us": "United States", "gb": "United Kingdom", "vn": "Vietnam" }; // Simplified for space

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
                const fullName = isoToCountryName[data.country.toLowerCase()] || data.country.toUpperCase();
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

        // ✨ SYNC THE NEW PLAYER HEADER SPELL ICONS & BARS!
        const spellsTop = document.getElementById('spells-top');
        const spellsBottom = document.getElementById('spells-bottom');

        if (state && state.gameMode === 'spell') {
            if (spellsTop) spellsTop.style.display = 'flex';
            if (spellsBottom) spellsBottom.style.display = 'flex';
            
            // Extract remaining uses directly from the engine's FEN data
            const fen = this.#game?.currentNode?.fen || '';
            const spellMatch = fen.match(/'spells':\((.*?)\)/);
            let spellArrays = [];
            if (spellMatch) {
                spellArrays = spellMatch[1].split("','").map(s => s.replace(/'/g, ''));
            }
            
            if (state.mana) {
                const updateIcon = (spellType, colorClass, isTop) => {
                    const prefix = isTop ? 'top' : 'bottom';
                    const iconEl = document.getElementById(`spell-${prefix}-${spellType}`);
                    const countEl = document.getElementById(`spell-${prefix}-${spellType}-count`);
                    const bar1 = document.getElementById(`spell-${prefix}-${spellType}-bar-1`);
                    const bar2 = document.getElementById(`spell-${prefix}-${spellType}-bar-2`);
                    const bar3 = document.getElementById(`spell-${prefix}-${spellType}-bar-3`);

                    if (!iconEl) return;

                    // 1. Get current cooldown charges (0 to 3)
                    let cd = state.mana[colorClass][spellType] !== undefined ? state.mana[colorClass][spellType] : 3;

                    // 2. Parse remaining uses from FEN string (White=0, Black=2)
                    let uses = spellType === 'freeze' ? 5 : 2; 
                    if (spellArrays.length > 0) {
                        const colorIdx = colorClass === 'w' ? 0 : 2;
                        const spellStr = spellArrays[colorIdx] || '';
                        const match = spellStr.match(new RegExp(`${spellType}_\\dx(\\d+)`));
                        if (match) uses = parseInt(match[1], 10);
                    }

                    // 3. Update Badge
                    if (countEl) {
                        countEl.innerText = uses;
                        countEl.style.display = uses > 0 ? 'block' : 'none';
                    }

                    // 4. Update Icon Grayscale (Only colorize if ready AND has uses)
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

                    // 5. Update Recharge Segment Bars
                    const drawBar = (bar, threshold) => {
                        if (bar) {
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

        // ✨ FORCE-KILL THE OLD SPELL BAR CONTAINER
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
        this.switchTab('analysis');
    }
hideGameOver() {
        const modal = document.getElementById('gameOverModal');
        if (modal) modal.style.display = 'none';
    }
updatePuzzleStats() {
        if (!this.#game) return;
        const timerEl = document.getElementById('puzTimer');
        const scoreEl = document.getElementById('puzScore');
        const strikesEl = document.getElementById('puzStrikes');

        if (timerEl) {
            if (this.#game.puzzleMode === 'survival') {
                timerEl.innerText = "SURVIVAL"; timerEl.style.color = "#fa412d";
            } else {
                const t = Math.max(0, this.#game.puzzleTimeRemaining || 0);
                const m = Math.floor(t / 60).toString().padStart(2, '0');
                const s = (t % 60).toString().padStart(2, '0');
                timerEl.innerText = `${m}:${s}`;
                timerEl.style.color = t < 30 ? "#fa412d" : "#fff";
            }
        }
        if (scoreEl) scoreEl.innerText = this.#game.puzzleScore || 0;
        if (strikesEl) {
            const maxStrikes = 3;
            const current = this.#game.puzzleStrikes || 0;
            let hearts = "";
            for(let i = 0; i < (maxStrikes - current); i++) hearts += "✅";
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
        } else if (state === "controls") {
            if(controls) { controls.style.display = "block"; controls.style.opacity = "1"; }
            if(active) active.style.display = "none";
        } else if (state === "active") {
            if(controls) controls.style.display = "none";
            if(active) active.style.display = "flex";
            if(status) { status.innerText = "Your Turn"; status.style.color = "#fff"; }
            if(info && puzzleData) {
                info.innerHTML = `<span style="color:#e68f00; font-weight:bold; font-size:14px;">Rating: ${puzzleData.rating || '?'}</span><span style="color:#666; margin-left:8px; font-size:12px;">ID: ${puzzleData.id || 'Unknown'}</span>`;
            }
            const isRush = ['3min', '5min', 'survival'].includes(this.#game.puzzleMode);
            if (isRush) {
                if(nextBtn) nextBtn.style.display = "none"; 
                if(solBtn) solBtn.style.display = "none";   
                if(statsBar) statsBar.style.display = "flex";
                this.updatePuzzleStats(); 
            } else {
                if(nextBtn) nextBtn.style.display = "none"; 
                if(solBtn) solBtn.style.display = "inline-block";
                if(statsBar) statsBar.style.display = "none"; 
            }
        }
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
        if (!state || state.mode !== 'puzzle' || state.isGameOver) return;
        const isRush = ['3min', '5min', 'survival'].includes(state.puzzle.mode);
        if (isRush) {
            this.showNotification("Hints are disabled in Rush Mode!", "Not Allowed", "🚫");
            return;
        }

        const solutionMove = state.puzzle.solution[state.puzzle.cursor];
        if (!solutionMove) return;

        const fromIdx = this.#game.squareToIndex(solutionMove.substring(0, 2));
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
            hintEl.animate([{ opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }], { duration: 800, iterations: 3 });
            setTimeout(() => { if (hintEl && hintEl.parentNode) hintEl.remove(); }, 2400);
        }
    }
initSidebarResizers() {
        const sidebar = document.getElementById('mainSidebar'); 
        const handleW = document.getElementById('resizeSidebarW');
        if (!sidebar) return;

        const savedWidth = localStorage.getItem('sidebarWidth') || '520px';
        sidebar.style.width = savedWidth;
        sidebar.style.minWidth = savedWidth;
        sidebar.style.maxWidth = savedWidth;
        sidebar.style.marginLeft = '-16px'; 

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
                
                sidebar.style.width = `${newPgnW}px`;
                sidebar.style.minWidth = `${newPgnW}px`;
                sidebar.style.maxWidth = `${newPgnW}px`;
            };

            const stopDragW = () => {
                handleW.classList.remove('active');
                document.body.style.userSelect = '';
                document.removeEventListener('mousemove', doDragW);
                document.removeEventListener('mouseup', stopDragW);
                localStorage.setItem('sidebarWidth', sidebar.style.width);
                window.dispatchEvent(new Event('resize')); 
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
            document.removeEventListener('mousemove', doResize);
            document.removeEventListener('mouseup', stopResize);
            document.body.style.cursor = ''; 
            if (this.boardWrapper) localStorage.setItem('chessBoardSize', this.boardWrapper.style.width);
        };
        
        if (handle) {
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                startX = e.clientX; startBoardW = this.boardWrapper.offsetWidth;
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
        // ✨ FIX: Use squaresLayer to bypass CSS borders
        const rect = this.squaresLayer.getBoundingClientRect();
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return -1;
        
        const size = rect.width / 8;
        let c = Math.floor((x - rect.left) / size);
        let r = Math.floor((y - rect.top) / size);
        
        // ✨ FIX: Clamp bounds safely
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
handleMouseDown(e) {
        const state = this.#game ? this.#game.getReader() : null;
        if (!state) return;

        if (state.isPaused) {
            this.showNotification("Game is Paused", "Info");
            return;
        }

        if (e.button === 2) { 
            e.preventDefault(); e.stopPropagation();
            if (state.premoves.length > 0) {
                this.#game.clearPremoves();
                this.renderBoard(false); 
                return;
            }
            const sq = this.getSquareFromCoords(e.clientX, e.clientY);
            if (sq !== -1) {
                this.isRightClick = true;
                this.arrowDragStart = sq;
            }
        } else if (e.button === 0) { 
            if (state.arrows.length > 0 || state.circles.length > 0) {
                this.#game.clearAnnotations();
                this.renderArrows();
            }
            if (state.premoves.length > 0) {
                this.#game.clearPremoves();
                this.renderBoard(false); 
            }
            if (this.selectedSq !== null) {
                this.selectedSq = null;
                this.legalMoves = [];
                this.renderBoard(false); 
            }
        }
    }
handleMouseMove(e) {
        if (this.isRightClick && this.arrowDragStart !== null) {
            const sq = this.getSquareFromCoords(e.clientX, e.clientY);
            this.tempArrowLayer.innerHTML = ''; 
            if (sq !== -1 && sq !== this.arrowDragStart) {
                let color = 'green';
                if (e.shiftKey) color = 'red';
                else if (e.altKey) color = 'blue';
                else if (e.ctrlKey) color = 'orange';
                this.drawArrow(this.tempArrowLayer, this.arrowDragStart, sq, color, 0.5);
            }
        }
    }
handleMouseUp(e) {
        if (this.isRightClick && this.arrowDragStart !== null) {
            const sq = this.getSquareFromCoords(e.clientX, e.clientY);
            this.tempArrowLayer.innerHTML = ''; 
            
            let color = 'green';
            if (e.shiftKey) color = 'red';
            else if (e.altKey) color = 'blue';
            else if (e.ctrlKey) color = 'orange';

            if (sq === this.arrowDragStart) {
                this.#game.toggleCircle(sq, color);
            } else if (sq !== -1) {
                this.#game.toggleArrow(this.arrowDragStart, sq, color);
            }

            this.renderArrows();
            this.isRightClick = false;
            this.arrowDragStart = null;
        }
    }
getSquareCenter(idx) {
        let r = Math.floor(idx / 8);
        let c = idx % 8;
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

        if (this.dragData && this.dragData.type === 'arrow') {
            arrowsToDraw.push({ from: this.dragData.from, to: this.dragData.to, color: this.dragData.color });
        }
        
        const getSqIdx = (val) => {
            if (typeof val === 'number') return val;
            if (typeof val === 'string' && val.length === 2) {
                let f = val.charCodeAt(0) - 97;
                let r = 8 - parseInt(val[1], 10);
                return r * 8 + f;
            }
            return -1;
        };

        circlesToDraw.forEach(circle => {
            let sqIdx = getSqIdx(circle.index !== undefined ? circle.index : (circle.sq !== undefined ? circle.sq : circle.square));
            if (sqIdx < 0 || sqIdx > 63) return;
            this.drawCircle(this.arrowLayer, sqIdx, circle.color);
        });

        arrowsToDraw.forEach(arrow => {
            let fromIdx = getSqIdx(arrow.from);
            let toIdx = getSqIdx(arrow.to);
            if (fromIdx < 0 || fromIdx > 63 || toIdx < 0 || toIdx > 63) return;
            this.drawArrow(this.arrowLayer, fromIdx, toIdx, arrow.color, 0.6);
        });
    }
getNodeVisuals(node) {
        if ((node.arrows && node.arrows.length > 0) || (node.circles && node.circles.length > 0)) {
            return `<span style="display:inline-block;width:6px;height:6px;background-color:#00b023;border-radius:50%;margin-left:3px;margin-bottom:3px;vertical-align:middle;box-shadow:0 0 4px #00b023;"title="Has Annotations"></span>`;
        }
        return '';
    }
initSoundSettings() {
        const select = document.getElementById('soundSetSelect');
        if (!select || typeof SOUND_SETS === 'undefined') return;
        select.innerHTML = '';
        const themes = Object.keys(SOUND_SETS).sort();
        themes.forEach(key => {
            const option = document.createElement('option');
            option.value = key;
            let displayName = key.replace(/_/g, ' ');
            displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
            option.text = displayName;
            select.appendChild(option);
        });
        if (typeof SoundManager !== 'undefined') select.value = SoundManager.currentSet;
        select.onchange = function(e) {
            if (typeof SoundManager !== 'undefined') SoundManager.setTheme(e.target.value);
        };
    }
initVolume() {
        const savedVol = localStorage.getItem('chessVolume');
        const vol = savedVol !== null ? parseInt(savedVol) : 70;
        this.volume = vol / 100; 
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
        if (this.#game && !this.#game.isPlayingLiveGame) SoundManager.play('move', this.volume);
    }
initDraggableSettings() {
        const panel = document.getElementById('settingsPanel');
        if (!panel) return;
        const header = panel.querySelector('.settings-header');
        if (!header) return;

        panel.style.top = '60px'; 
        panel.style.left = '20px';
        panel.style.right = 'auto';     
        panel.style.bottom = 'auto';
        panel.style.transform = 'translate3d(0px, 0px, 0px)';

        let isDragging = false;
        let startX = 0, startY = 0, currentX = 0, currentY = 0;

        header.addEventListener("mousedown", (e) => {
            if (e.target === header || header.contains(e.target)) {
                if (e.target.classList.contains('close-settings')) return;
                isDragging = true;
                startX = e.clientX; startY = e.clientY;
            }
        });
        document.addEventListener("mouseup", () => isDragging = false);
        document.addEventListener("mousemove", (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const scale = window.appScale || 1;
            currentX += (e.clientX - startX) / scale;
            currentY += (e.clientY - startY) / scale;
            startX = e.clientX; startY = e.clientY;
            panel.style.transform = `translate3d(${currentX}px, ${currentY}px, 0px)`;
        });
    }
drawArrow(container, fromIdx, toIdx, colorName, opacity=0.5) { 
        const cMap = { 'green': '#15781B', 'red': '#882020', 'blue': '#003088', 'orange': '#e68f00' };
        const color = cMap[colorName] || colorName;

        const fR = Math.floor(fromIdx / 8), fC = fromIdx % 8;
        const tR = Math.floor(toIdx / 8), tC = toIdx % 8;

        let x1 = (fC + 0.5) * 12.5, y1 = (fR + 0.5) * 12.5;
        let x2 = (tC + 0.5) * 12.5, y2 = (tR + 0.5) * 12.5;

        if (this.flipped) {
            x1 = ((7 - fC) + 0.5) * 12.5; y1 = ((7 - fR) + 0.5) * 12.5;
            x2 = ((7 - tC) + 0.5) * 12.5; y2 = ((7 - tR) + 0.5) * 12.5;
        }

        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);

        if (len === 0) return;

        const headLength = 4.5;  
        const headWidth = 5.625; 
        const shaftWidth = 1.75; 
        const startMargin = 0.0; 
        const endMargin = 0.0;

        const ux = dx / len; const uy = dy / len;
        const vx = -uy; const vy = ux;

        const startX = x1 + ux * startMargin;
        const startY = y1 + uy * startMargin;
        const endX = x2 - ux * endMargin;
        const endY = y2 - uy * endMargin;
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
        const r = Math.floor(idx / 8), c = idx % 8;
        let cx = (c + 0.5) * 12.5, cy = (r + 0.5) * 12.5;
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
initKeyboardEvents() {
        document.addEventListener('keydown', (e) => {
            const activeTag = document.activeElement.tagName.toLowerCase();
            if (['input', 'textarea', 'select'].includes(activeTag)) return;

            const settings = document.getElementById('settingsPanel');
            if (settings && settings.classList.contains('visible')) {
                if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return; 
            }

            if (this.#game) {
                if (e.key === 'ArrowLeft') this.#game.stepBack();
                else if (e.key === 'ArrowRight') this.#game.stepForward();
                else if (e.key === 'ArrowUp') { e.preventDefault(); this.#game.goToStart(); } 
                else if (e.key === 'ArrowDown') { e.preventDefault(); this.#game.goToEnd(); }
            }
        });
    }
toggleSettings() {
        document.getElementById('settingsPanel').classList.toggle('visible');
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
        const trashIcon = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
        const getSafeImgHtml = (color, type) => {
            let rawSVG = this.getPieceHTML({ color, type });
            if (!rawSVG) return '';
            let trimmed = rawSVG.trim();
            if (trimmed.startsWith('<svg')) {
                return `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}" class="piece-img" style="width:100%; height:100%; display:block; pointer-events:none;" draggable="false">`;
            } else if (trimmed.startsWith('data:image/') || trimmed.startsWith('http') || trimmed.endsWith('.svg') || trimmed.endsWith('.png')) {
                return `<img src="${trimmed}" class="piece-img" style="width:100%; height:100%; display:block; pointer-events:none;" draggable="false">`;
            }
            return rawSVG; 
        };

        const topBar = document.getElementById('editorBarTop');
        if (topBar) {
            topBar.innerHTML = `<div class="tool-group">
                ${['P','N','B','R','Q','K'].map(p => `
                    <div class="tool-btn" onmousedown="window.app.ui.startSpareDrag(event,'b','${p}')">
                        ${getSafeImgHtml('b', p)}
                    </div>`).join('')}
            </div><div class="tool-btn trash-btn" onclick="window.app.ui.setEditorTool('trash', this)">${trashIcon}</div>`;
        }

        const bottomBar = document.getElementById('editorBarBottom');
        if (bottomBar) {
            bottomBar.innerHTML = `<div class="tool-group">
                ${['P','N','B','R','Q','K'].map(p => `
                    <div class="tool-btn" onmousedown="window.app.ui.startSpareDrag(event,'w','${p}')">
                        ${getSafeImgHtml('w', p)}
                    </div>`).join('')}
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
            if (trimmed.startsWith('<svg')) ghostHTML = `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}" style="width:100%; height:100%; display:block; pointer-events:none;">`;
            else if (trimmed.startsWith('data:image/') || trimmed.startsWith('http') || trimmed.endsWith('.svg') || trimmed.endsWith('.png')) ghostHTML = `<img src="${trimmed}" style="width:100%; height:100%; display:block; pointer-events:none;">`;
        }
        this.initDragGhost(e, ghostHTML);
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
        const file = sqIdx % 8;
        const rank = Math.floor(sqIdx / 8);
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

        // ✨ FIX: Use squaresLayer to bypass CSS borders
        const rect = this.squaresLayer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        let dropIdx = -1;

        if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
            const size = rect.width / 8;
            let col = Math.floor(x / size);
            let row = Math.floor(y / size);
            
            // ✨ FIX: Clamp bounds safely
            col = Math.max(0, Math.min(7, col));
            row = Math.max(0, Math.min(7, row));
            
            if (this.flipped) { col = 7 - col; row = 7 - row; }
            dropIdx = row * 8 + col;
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
        
        // ✨ FIX: Set the variable using the new argument!
        let promoChar = overridePromo; 
        
        if (!isDrop && isPawn && isRank8 && !promoChar) {
            const autoQueen = document.getElementById('autoQueen')?.checked;
            if (autoQueen) { 
                promoChar = 'q'; 
            } else {
                this.showPromotionModal(piece.color, destIdx, (selectedType) => { 
                    // ✨ FIX: Pass the modal choice correctly!
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
        // ✨ FIX: Pass the securely captured promo string into the engine!
        let res = this.#game.makeMove(moveAttempt, promoChar || move.promotion || 'q');
        this._isExecutingMove = false;
        
        this.selectedSq = null;
        this.legalMoves = [];
        this.renderBoard(animate, animate); 
        this.updateHistory();
        this.updateClocks();
        this.renderArrows();

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
            if (theme === 'disguised') boardContainer.classList.add('theme-disguised');
            else boardContainer.classList.remove('theme-disguised');
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

        if (this.squaresLayer.children.length !== 64) {
            this.squaresLayer.innerHTML = '';
            const fragment = document.createDocumentFragment();
            for (let i = 0; i < 64; i++) { fragment.appendChild(document.createElement('div')); }
            this.squaresLayer.appendChild(fragment);
        }

        const squares = this.squaresLayer.children;
        
        for (let v = 0; v < 64; v++) {
            let r_vis = Math.floor(v / 8); 
            let c_vis = v % 8;
            
            let r_log = this.flipped ? 7 - r_vis : r_vis;
            let c_log = this.flipped ? 7 - c_vis : c_vis;
            let logical_i = r_log * 8 + c_log;
            
            let sq = squares[v];
            sq.className = `square ${(r_log + c_log) % 2 === 0 ? 'light' : 'dark'}`;
            sq.dataset.index = logical_i; 
            sq.innerHTML = '';

             if (state.gameMode === 'spell' && state.frozenSquares && state.frozenSquares[logical_i]) {
                sq.classList.add('frozen');
                let ice = document.createElement('div');
                ice.style.cssText = `position:absolute; top:0; left:0; width:100%; height:100%; background:url('./assets/tabs-icon/freeze.3455552f.png') center/cover; opacity:0.65; pointer-events:none; z-index:20; mix-blend-mode: screen; filter: hue-rotate(180deg) brightness(1.5);`; 
                sq.appendChild(ice);
            }

            if (this.coordsPosition === 'inside') {
                const rankVal = 8 - r_log;
                const fileVal = ['a','b','c','d','e','f','g','h'][c_log];
                if (c_vis === 0) sq.innerHTML += `<span class="coord rank">${rankVal}</span>`;
                if (r_vis === 7) sq.innerHTML += `<span class="coord file">${fileVal}</span>`;
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

            // ✨ SPELL INTERCEPTOR: Handle 3x3 Hover & Spell Casting
            if (state.gameMode === 'spell' && this.activeSpell && state.mode !== 'editor') {
                sq.style.cursor = 'pointer'; // Replaced crosshair with pointer

                sq.onmouseenter = () => {
                    // Clear previous highlights efficiently
                    this.squaresLayer.querySelectorAll('.spell-target-hover').forEach(el => el.classList.remove('spell-target-hover'));

                    if (this.activeSpell === 'freeze') {
                        const r = Math.floor(logical_i / 8);
                        const c = logical_i % 8;

                        // Highlight 3x3 area
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
                        // Default 1x1 highlight for 'jump' or other spells
                        sq.classList.add('spell-target-hover');
                    }
                };

                sq.onmouseleave = () => {
                    this.squaresLayer.querySelectorAll('.spell-target-hover').forEach(el => el.classList.remove('spell-target-hover'));
                };

                sq.onmousedown = (e) => {
                    if (e.button !== 0) return; // Only left click
                    e.preventDefault();
                    e.stopPropagation();
                    
                    this.squaresLayer.querySelectorAll('.spell-target-hover').forEach(el => el.classList.remove('spell-target-hover'));
                    
                    if (typeof this.castSpell === 'function') {
                        this.castSpell(this.activeSpell, logical_i);
                    }
                };

                continue; // Prevents normal piece interaction while spell is active
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
        
        // ✨ THE ULTIMATE GHOST FIX: Safely parse the ~ character without collapsing the board!
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
                    // ✨ FIX: Explicitly fill empty squares with null so pieces don't collapse!
                    let empties = parseInt(char, 10);
                    for (let e = 0; e < empties; e++) {
                        visualBoard[logicalIndex] = null;
                        logicalIndex++;
                    }
                } else if (char === '~') { 
                    // Apply ghost effect to the piece we JUST placed
                    let prevSq = logicalIndex - 1;
                    if (visualBoard[prevSq] && state.gameMode === 'alice') {
                        visualBoard[prevSq].isBoardB = true;
                    }
                } else { 
                    // Real piece! Place it securely
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

        // Apply Duck Placement preview logic
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
            const currentNodeMove = (this.#game && this.#game.currentNode) ? this.#game.currentNode.lastMove : null;
            
            if (currentNodeMove && p.idx === currentNodeMove.to && this.#game && this.#game.currentNode && this.#game.currentNode.nag) {
                const info = typeof this.getNagInfo === 'function' ? this.getNagInfo(this.#game.currentNode.nag) : null;
                if (info && ['good', 'mistake', 'brilliant', 'blunder', 'interesting', 'inaccuracy', 'excellent', 'great', 'miss'].includes(info.type)) {
                    htmlBuffer += `<div class="nag-indicator" style="position:absolute; top:-5px; right:-5px; width:22px; height:22px; background-color:${info.color}; border:2px solid ${info.borderColor}; border-radius:50%; color:#fff; font-weight:bold; font-size:13px; display:flex; justify-content:center; align-items:center; z-index:10; box-shadow:0 2px 4px rgba(0,0,0,0.4); font-family:sans-serif; pointer-events:none;">${info.symbol}</div>`;
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

            // ========================================================
            // ✨ NEW: EXPLICIT PIECE INTERCEPTOR FOR SPELLS
            // ========================================================
            if (state.gameMode === 'spell' && this.activeSpell && state.mode !== 'editor') {
                el.style.cursor = 'pointer';
                
                // 1. Mirror the Hover Effect
                el.onmouseenter = () => {
                    this.squaresLayer.querySelectorAll('.spell-target-hover').forEach(s => s.classList.remove('spell-target-hover'));
                    
                    if (this.activeSpell === 'freeze') {
                        const r = Math.floor(p.idx / 8);
                        const c = p.idx % 8;
                        for (let dr = -1; dr <= 1; dr++) {
                            for (let dc = -1; dc <= 1; dc++) {
                                const nr = r + dr, nc = c + dc;
                                if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                                    const targetSq = this.squaresLayer.querySelector(`[data-index="${nr * 8 + nc}"]`);
                                    if (targetSq) targetSq.classList.add('spell-target-hover');
                                }
                            }
                        }
                    } else {
                        const targetSq = this.squaresLayer.querySelector(`[data-index="${p.idx}"]`);
                        if (targetSq) targetSq.classList.add('spell-target-hover');
                    }
                };

                // 2. Mirror the Un-hover Effect
                el.onmouseleave = () => {
                    this.squaresLayer.querySelectorAll('.spell-target-hover').forEach(s => s.classList.remove('spell-target-hover'));
                };

                // 3. Mirror the Click / Cast Effect
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

            let r = Math.floor(p.idx / 8); let c = p.idx % 8;
            if (this.flipped) { r = 7 - r; c = 7 - c; }
            const targetTransform = `translate(${c * 100}%, ${r * 100}%)`;
            el.style.width = '12.5%'; el.style.height = '12.5%';

            const currentTransform = el.style.transform;
            const positionChanged = (currentTransform && currentTransform !== targetTransform);
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

            let startTransform = currentTransform;
            let startC = c, startR = r;

            if (startTransform && startTransform.includes('translate')) {
                const match = startTransform.match(/translate\(([-\d.]+)%,\s*([-\d.]+)%\)/);
                if (match) {
                    startC = parseFloat(match[1]) / 100;
                    startR = parseFloat(match[2]) / 100;
                }
            }
            
            if (isNew || !startTransform || startTransform === 'none' || startTransform === '') {
                const getSafeIndex = (val) => {
                    if (val === '@') return p.idx; 
                    if (typeof val === 'number') return val;
                    if (typeof val === 'string' && val.length === 2) {
                        let f = val.charCodeAt(0) - 97; let rv = 8 - parseInt(val[1], 10); return rv * 8 + f;
                    }
                    return val;
                };
                const fromGridSq = isCastlingMove ? p._castleStartIdx : (isMovedPiece ? getSafeIndex(targetMove.from) : p.idx);
                startR = Math.floor(fromGridSq / 8); 
                startC = fromGridSq % 8;
                if (this.flipped) { startR = 7 - startR; startC = 7 - startC; }
                startTransform = `translate(${startC * 100}%, ${startR * 100}%)`;

                if (targetMove && targetMove.from === '@' && isMovedPiece) startTransform += ' scale(1.5)';
            }

            if (animate && (positionChanged || forceAnimate) && (!isNew || forceAnimate)) {
                el.style.transition = 'none'; 
                el.style.transform = startTransform;
                
                el.getBoundingClientRect(); 
                
                el.style.transition = ''; 
                
                el.classList.add('animating');
                if (isCastlingMove) el.classList.add('castling-jump');

                el.style.transitionDuration = `${isCastlingMove ? castleDuration : moveDuration}ms`;
                
                el.style.transform = targetTransform; 

                const sqEl = this.squaresLayer.querySelector(`[data-index="${p.idx}"]`);
                if (isMovedPiece && sqEl) {
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

            } else {
                el.style.transition = 'none';
                el.style.transform = targetTransform;
            }

            if (showMangaTail && (isMovedPiece || isCastlingMove) && targetMove && targetMove.from !== '@') {
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
            // Unlock the rendering engine
            this._isExecutingMove = false;
            
            // 🔥 THE FIX: Atomically purge all animation fragments from the DOM.
            // When onCompleteCallback triggers renderBoard(false), it will draw 
            // a flawless, pristine 32-piece setup without any stacking conflicts.
            piecesLayer.innerHTML = ''; 
            
            if (onCompleteCallback) onCompleteCallback();
        }, duration + 10);
    }
updateHistory(force = false) {
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

        this._lastTreeSize = currentTreeSize;
        list.innerHTML = ''; list.style.display = 'block'; list.classList.remove('hidden');

        if (this.pgnStyle === 'tree') {
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
        let v = nags.find(n => parseInt(n) >= 1 && parseInt(n) <= 9) || nags[0]; 
        
        let info = { symbol:'', cls:'nag-pos', color:'#888888', borderColor:'#aaaaaa', type:'' };
        switch(v) {
            case'1':case'!': return { symbol:'!', cls:'ind-1', color:'#5c8bb0', borderColor:'#28a2e7',type:'good'};
            case'2':case'?': return { symbol:'?', cls:'ind-2', color:'#ffa700', borderColor:'#af5205',type:'mistake'};
            case'3':case'!!': return { symbol:'!!', cls:'ind-3', color:'#26c2a3', borderColor:'#09e9ed',type:'brilliant'};
            case'4':case'??': return { symbol:'??', cls:'ind-4', color:'#fa412d', borderColor:'#892c12',type:'blunder'};
            case'5':case'!?': return { symbol:'!?', cls:'ind-5', color:'#b369f2', borderColor:'#bd09ed',type:'interesting'};
            case'6':case'?!': return { symbol:'?!', cls:'ind-6', color:'#f7c045', borderColor:'#f5d91d',type:'inaccuracy'};
            case'7': return { symbol:'!', cls:'ind-1', color:'#96bc4b', borderColor:'#6c8a32', type:'excellent'};
            case'8': return { symbol:'!', cls:'ind-1', color:'#5c8bb0', borderColor:'#3a6280', type:'great'};
            case'9': return { symbol:'X', cls:'ind-2', color:'#ff7769', borderColor:'#c75446', type:'miss'};
            case'10':case'=': info.symbol ='='; break; 
            case'13':case'∞': info.symbol ='∞'; break; 
            case'14':case'⩲':case'+=':info.symbol ='⩲'; break; 
            case'15':case'⩱':case'=+':info.symbol ='⩱'; break; 
            case'16':case'±':case'+/-':info.symbol ='±'; break; 
            case'17':case'∓':case'-/+':info.symbol ='∓'; break; 
            case'18':case'+-':info.symbol ='+-'; break; 
            case'19':case'-+':info.symbol ='-+'; break; 
            default:return null;
        }
        return info;
    }
updateEditorState() {
        if (!this.#game || this.#game.mode !== 'editor') return;
        
        // FIX: Instead of overwriting the DOM, push the DOM checkbox changes to the game engine
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
            nSpan.innerText = info.symbol; nSpan.style.color = info.color; nSpan.style.fontWeight = 'bold'; nSpan.style.marginLeft = '2px';
            span.appendChild(nSpan);
        });

        if (node.isBook) {
            let icon = document.createElement('span'); icon.className = 'eval-icon';
            const iconColor = primaryInfo ? primaryInfo.color : '#a87c53';
            icon.style.cssText = "display:inline-flex; align-items:center; margin-left:4px;"; icon.style.color = iconColor;
            icon.innerHTML = typeof ICON_BOOK_SVG !== 'undefined' ? ICON_BOOK_SVG : '📖';
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
        let ply = this.getPly(mainChild);
        let mNum = Math.ceil(ply / 2);
        let isWhite = (ply % 2 !== 0);
        let row;

        if (isWhite) {
            row = document.createElement('div'); row.className ='move-row';
            let num = document.createElement('div'); num.className ='move-num'; num.innerText = mNum;
            row.appendChild(num); row.appendChild(this.createMoveSpanSafe(mainChild)); 
            container.appendChild(row);
        } else {
            row = container.lastElementChild;
            if (!row || !row.classList.contains('move-row') || row.children.length > 2) {
                row = document.createElement('div'); row.className ='move-row';
                let num = document.createElement('div'); num.className ='move-num'; num.innerText = mNum + "...";
                row.appendChild(num); container.appendChild(row);
            }
            row.appendChild(this.createMoveSpanSafe(mainChild));
        }

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
        const state = this.#game ? this.#game.getReader() : null;

        while (curr) {
            let ply = this.getPly(curr); let mNum = Math.ceil(ply / 2); let moveText = "";
            if (ply % 2 !== 0) moveText = `${mNum}.`; else if (isFirstInLine) moveText = `${mNum}...`;

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
        const state = this.#game ? this.#game.getReader() : null;

        while (curr) {
            let ply = this.getPly(curr); let mNum = Math.ceil(ply / 2); let moveText = "";
            if (ply % 2 !== 0) moveText = `${mNum}.`; else if (isFirstInLine) moveText = `${mNum}...`;

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
            sym.style.color = info.color; sym.style.marginLeft = "3px"; sym.style.fontWeight = "bold";
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
renderVariationLine(node, container) {
        let curr = node; let isFirst = true; const state = this.#game ? this.#game.getReader() : null;

        while (curr) {
            let ply = this.getPly(curr); let mn = Math.ceil(ply / 2); let txt = (ply % 2 !== 0) ? `${mn}.` : (isFirst ? `${mn}...` : ``);

            let span = document.createElement('span');
            if (!curr.id) curr.id = 'n_' + Math.random().toString(36).substr(2, 9);
            const isActive = (this.#game && this.#game.currentNode === curr) || (state && state.activeNodeId && curr.id === state.activeNodeId);
            
            span.className = `var-move ${isActive ? 'active' : ''}`; span.dataset.id = curr.id; span.innerText = `${txt} ${curr.moveSan}`;

            if (curr.nag) {
                let nags = curr.nag.toString().split(','); let primaryInfo = null; let symbols = [];
                nags.forEach(n => {
                    const info = this.getNagInfo(n.trim());
                    if (info) { symbols.push(info); if (['good', 'mistake', 'brilliant', 'blunder', 'interesting', 'inaccuracy', 'excellent', 'great', 'miss'].includes(info.type)) primaryInfo = info; }
                });
                if (primaryInfo) { span.style.color = primaryInfo.color; span.style.backgroundColor = primaryInfo.color + '20'; }
                symbols.forEach(info => {
                    let nagSpan = document.createElement('span'); nagSpan.className = 'nag-glyph'; nagSpan.innerText = info.symbol;
                    nagSpan.style.color = info.color; nagSpan.style.marginLeft = "2px"; nagSpan.style.fontWeight = "bold";
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
                toggleBtn.style.cssText = "cursor:pointer; color:#888; font-weight:bold; font-size:0.9em; user-select:none;";
                
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
updateEvalBar(type, val) {
        const bar = document.getElementById('evalBarFill');
        const text = document.getElementById('evalScore');
        if (!this.#game || !this.#game.engine) return;

        let vWinner = null;
        if (typeof this.#game.engine.variant_winner === 'function') vWinner = this.#game.engine.variant_winner();

        if (vWinner === 'w') {
            if (text) text.innerText = "1-0"; if (bar) bar.style.height = "100%";
            return;
        } else if (vWinner === 'b') {
            if (text) text.innerText = "0-1"; if (bar) bar.style.height = "0%";
            return;
        }

        if (this.#game.engine.in_checkmate()) {
            const winner = (this.#game.turn === 'w') ? "0-1" : "1-0";
            const percent = (this.#game.turn === 'w') ? 0 : 100;
            if (text) text.innerText = winner; if (bar) bar.style.height = `${percent}%`;
            return; 
        }

        const isDraw = this.#game.engine.in_draw() || this.#game.engine.in_stalemate() || (typeof this.#game.engine.in_threefold_repetition === 'function' && this.#game.engine.in_threefold_repetition());

        if (isDraw) {
            if (text) text.innerText = "½-½"; if (bar) bar.style.height = "50%";
            return;
        }

        let display = "0.00"; 
        let percent = 50;
        
        // ✨ THE FIX: Handle Mate vs Centipawn calculation properly
        if (type === 'mate') {
            display = "M" + Math.abs(val); 
            // Fake a massive score so the CSS bar clamps to the absolute top or bottom
            val = val > 0 ? 10000 : -10000; 
        } else {
            const evalFloat = val / 100;
            display = (evalFloat > 0 ? "+" : "") + evalFloat.toFixed(2);
        }
        
        // Apply the CSS height for BOTH normal scores and artificial mate scores
        const evalFloat = val / 100;
        const clamped = Math.max(-5, Math.min(5, evalFloat));
        percent = 50 + (clamped * 10);
        
        if (text) text.innerText = display;
        if (bar) bar.style.height = `${percent}%`;
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
                        if (baseUci.includes(',')) baseUci = baseUci.split(',')[0];
                        else if (baseUci.includes('@')) baseUci = baseUci.split('@')[0];

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
                } catch(e) { }

                if (moveObj) {
                    cumulativeMoves.push(uci); validMoveCount++; 
                    const fenAtMove = tempChess.fen();
                    const duckSq = tempChess.get_duck_sq ? tempChess.get_duck_sq() : -1;
                    const seqString = cumulativeMoves.join(',');
                    
                    let span = document.createElement('span'); span.className = 'pv-move'; span.innerText = prefix + moveObj.san;
                    span.style.cssText = 'cursor:pointer; margin-right:5px; display:inline-block;';
                    
                    span.onmouseenter = (e) => { span.style.color = '#fff'; span.style.textDecoration = 'underline'; this.hoverEngineMove(fenAtMove, e, duckSq); };
                    span.onmouseleave = () => { span.style.color = ''; span.style.textDecoration = 'none'; this.stopHoverEngineMove(); };
                    span.onclick = (e) => { e.stopPropagation(); if (this.#game && this.#game.playEngineSequence) this.#game.playEngineSequence(seqString, currentFen); };
                    movesContainer.appendChild(span);
                } else break; 
            }
            li.style.display = validMoveCount === 0 ? 'none' : 'flex';
        } catch (err) {
            console.error("[UI RENDER FATAL ERROR]", err);
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
        grid.innerHTML = ''; 
        
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
                    
                    // ✨ FIX: Check for Alice B board marker (e.g. ~)
                    if (i + 1 < rankStr.length && rankStr[i+1] === '~') {
                        isAliceB = true;
                        i++; // Skip the '~'
                    }

                    if (currentSq === targetGridIndex) renderPiece = 'duck';
                    this.renderPreviewSquare(grid, r, fileIdx, renderPiece, isAliceB); 
                    fileIdx++;
                } else {
                    let empties = parseInt(char); 
                    for (let k = 0; k < empties; k++) {
                        let currentSq = r * 8 + fileIdx;
                        this.renderPreviewSquare(grid, r, fileIdx, (currentSq === targetGridIndex) ? 'duck' : null);
                        fileIdx++;
                    }
                }
            }
        }
    }
renderPreviewSquare(container, r, c, pieceChar, isAliceB = false) {
        const isLight = (r + c) % 2 === 0;
        const sq = document.createElement('div');
        sq.className = `preview-square ${isLight ? 'light' : 'dark'}`;
        sq.style.cssText = 'position:relative; box-sizing:border-box; display:flex; justify-content:center; align-items:center; overflow:hidden;';
        
        const currentTheme = document.getElementById('assetType')?.value;
        const isDisguised = currentTheme === 'disguised';

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
            
            // ✨ ALICE CHESS FIX: Apply the same visual filter used on the main board
            let aliceStyle = '';
            if (isAliceB) {
                aliceStyle = 'filter: hue-rotate(180deg) drop-shadow(0 0 5px cyan); opacity: 0.6; transform: scale(0.80);';
            }
            
            pDiv.style.cssText = `position:absolute; top:0; left:0; width:100%; height:100%; display:flex; justify-content:center; align-items:center; transform-origin:center; ${aliceStyle}`;
            pDiv.innerHTML = htmlBuffer || '';
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
        
        // ✅ FIX 1: Use the class method instead of setting .board directly
        this.#game.loadFEN(emptyFen);
        
        // Ensure the engine and visual board are in sync
        if (typeof this.#game.syncEngineToBoard === 'function') this.#game.syncEngineToBoard(); 
        
        this.renderBoard(false);
        
        // ✅ FIX 2: Explicitly update the FEN input text box
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

        // ✅ FIX 3: Update the main FEN input text box
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
        
        this.showNotification("Board updated from Editor.", "Success", "✅");}
flipBoard() {
        this.flipped = !this.flipped;
        this.renderBoard(true);
        this.renderHeaders();
        if (this.coordsPosition === 'outside') this.renderExternalCoords();
        
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
        
        // FIX: Dynamically read the format selected in the UI dropdown
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

        const file = destIdx % 8; const rank = Math.floor(destIdx / 8);
        const targetX = (this.flipped ? (7 - file) : file) * 12.5; 
        const targetY = (this.flipped ? rank : (7 - rank)) * 12.5; 

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
handleEmbedDragOver(event) {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.style.background = 'rgba(56, 189, 248, 0.1)'; 
    }
handleEmbedDragLeave(event) {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.style.background = '';
    }
handleEmbedDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        this.handleEmbedDragLeave(event); 
        
        if (event.dataTransfer && event.dataTransfer.files.length > 0) {
            const file = event.dataTransfer.files[0];
            this.readEmbedFile(file);
        }
    }
readEmbedFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const input = document.getElementById('embedTextInput');
            if (input) input.value = text;
        };
        reader.readAsText(file);
    }
submitEmbedText() {
        const input = document.getElementById('embedTextInput');
        const text = input ? input.value.trim() : '';
        if (text) {
            if (typeof this.importEmbed === 'function') {
                this.importEmbed(text);
            }
            
            this.closeEmbedImporter();
            this.showNotification("Embed imported successfully!", "Success", "✅");
        } else {
            this.showNotification("Please paste code or upload a file first.", "Error", "❌");
        }
    }
toggleCheckboxes(className, state) {
        document.querySelectorAll('.' + className).forEach(cb => cb.checked = state);
    }
renderCharts(force = false) {
        if (typeof Chart === 'undefined') return;
        if (this.evalChart || this.timeChart) this.updateChartActiveLine();

        let lastNode = this.#game.rootNode;
        
        // ✨ FIX: Lock the chart to the Main Line (the actual game) instead of following sub-variations
        while (lastNode && lastNode.children.length > 0) lastNode = lastNode.children[0];

        if (!force && this.evalChart && this._lastChartedFen === lastNode.fen) return; 
        this._lastChartedFen = lastNode.fen;

        if (this._chartRenderTimeout) clearTimeout(this._chartRenderTimeout);
        if (force) this.forceRenderCharts();
        else this._chartRenderTimeout = setTimeout(() => { this.forceRenderCharts(); }, 150); 
    }
safeResizeCharts() {
        if (this.evalChart) this.evalChart.resize();
        if (this.timeChart) this.timeChart.resize();
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
exportEmbed() {
        if (!this.#game) return;
        const pgn = typeof this.#game.getPGN === 'function' ? this.#game.getPGN() : "";
        const html = `<iframe src="https://yourdomain.com/embed?pgn=${encodeURIComponent(pgn)}" width="600" height="400"></iframe>`;
        navigator.clipboard.writeText(html).then(() => {
            this.showNotification("Embed HTML copied to clipboard!", "Copied", "📋");
        });
    }
generateGIF() {
        if (typeof window.createChessGif === 'function') {
            window.createChessGif(this.#game);
        } else {
            this.showNotification("GIF module not loaded.", "Error", "❌");
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
        if (this.annotationPopup) this.annotationPopup.style.display ='none';
    }
handleMouseDown(e) {
        const state = this.#game ? this.#game.getReader() : null;
        if (!state) return;
        if (state.isPaused) { this.showNotification("Game is Paused", "Info"); return; }

        if (e.button === 2) { 
            e.preventDefault(); e.stopPropagation();
            if (state.premoves.length > 0) { this.#game.clearPremoves(); this.renderBoard(false); return; }
            const sq = this.getSquareFromCoords(e.clientX, e.clientY);
            if (sq !== -1) { this.isRightClick = true; this.arrowDragStart = sq; }
        } else if (e.button === 0) { 
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
        let r = Math.floor(idx / 8); let c = idx % 8;
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
        const fR = Math.floor(fromIdx / 8), fC = fromIdx % 8; const tR = Math.floor(toIdx / 8), tC = toIdx % 8;
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
        const r = Math.floor(idx / 8), c = idx % 8;
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
initKeyboardEvents() {
        document.addEventListener('keydown', (e) => {
            const activeTag = document.activeElement.tagName.toLowerCase();
            if (['input', 'textarea', 'select'].includes(activeTag)) return;
            const settings = document.getElementById('settingsPanel');
            if (settings && settings.classList.contains('visible')) {
                if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return; 
            }
            if (this.#game) {
                if (e.key === 'ArrowLeft') this.#game.stepBack();
                else if (e.key === 'ArrowRight') this.#game.stepForward();
                else if (e.key === 'ArrowUp') { e.preventDefault(); this.#game.goToStart(); }
                else if (e.key === 'ArrowDown') { e.preventDefault(); this.#game.goToEnd(); }
            }
        });
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
showPuzzleSuccess() {
        const status = document.getElementById('puzzleStatus'); const next = document.getElementById('nextPuzzleBtn');
        if(status) { status.innerText = "Success!"; status.style.color = "#26c2a3"; }
        const isRush = ['3min', '5min', 'survival'].includes(this.#game.puzzleMode);
        if (!isRush && next) next.style.display = "block";
    }
showPuzzleHint() {
        const state = this.#game ? this.#game.getReader() : null;
        if (!state || state.mode !== 'puzzle' || state.isGameOver) return;
        const isRush = ['3min', '5min', 'survival'].includes(state.puzzle.mode);
        if (isRush) { this.showNotification("Hints are disabled in Rush Mode!", "Not Allowed", "🚫"); return; }
        const solutionMove = state.puzzle.solution[state.puzzle.cursor];
        if (!solutionMove) return;
        const fromIdx = this.#game.squareToIndex(solutionMove.substring(0, 2));
        const sqEl = document.querySelector(`.square[data-index="${fromIdx}"]`);
        if (sqEl) {
            document.querySelectorAll('.puzzle-hint-pulse').forEach(el => el.remove());
            const hintEl = document.createElement('div'); hintEl.className = 'puzzle-hint-pulse';
            hintEl.style.cssText = 'position:absolute; inset:0; box-shadow:inset 0 0 0 4px var(--gold-400, #facc15), inset 0 0 15px rgba(250, 204, 21, 0.6); border-radius:4px; pointer-events:none; z-index:15;';
            sqEl.appendChild(hintEl);
            hintEl.animate([{ opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }], { duration: 800, iterations: 3 });
            setTimeout(() => { if (hintEl && hintEl.parentNode) hintEl.remove(); }, 2400);
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
openChapterManager() {
        if (this.#game) this.#game.saveActiveChapter();
        const container = document.getElementById('chapterManagerList'); if (!container) return;
        container.innerHTML = '';
        this.#game.chapters.forEach((ch, idx) => {
            const div = document.createElement('div'); div.style.cssText = "display: flex; gap: 10px; align-items: center; padding: 5px; border-bottom: 1px solid #444;";
            const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'chapter-cb'; cb.dataset.idx = idx; cb.style.cursor = "pointer";
            const text = document.createElement('span'); text.innerText = `${idx + 1}. ${ch.title}`; text.style.flex = "1"; text.style.color = idx === this.#game.activeChapterIndex ? "#38bdf8" : "#fff"; text.style.fontWeight = idx === this.#game.activeChapterIndex ? "bold" : "normal";
            const loadBtn = document.createElement('button'); loadBtn.innerText = "Load"; loadBtn.className = "btn-secondary"; loadBtn.style.padding = "4px 10px"; loadBtn.style.fontSize = "12px";
            loadBtn.onclick = () => { this.#game.loadChapter(idx); document.getElementById('chapterManagerModal').style.display = 'none'; };
            div.appendChild(cb); div.appendChild(text); div.appendChild(loadBtn); container.appendChild(div);
        });
        document.getElementById('chapterManagerModal').style.display = 'flex';
    }
renderStudyList() {
        const container = document.getElementById('studyListContainer'); if (!container) return;
        container.innerHTML = ''; const studies = this.#game.allStudies || [];
        studies.forEach((study, idx) => {
            const div = document.createElement('div'); div.style.cssText = "display: flex; gap: 10px; align-items: center; padding: 8px; background: #333; border-radius: 4px;";
            const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'study-cb'; cb.dataset.id = study.id; cb.style.cursor = "pointer";
            const title = document.createElement('span'); title.innerText = study.title || `Study ${idx + 1}`; title.style.flex = "1"; title.style.fontWeight = study.id === this.#game.currentStudyId ? "bold" : "normal"; title.style.color = study.id === this.#game.currentStudyId ? "#38bdf8" : "#fff";
            const loadBtn = document.createElement('button'); loadBtn.className = "btn-primary"; loadBtn.innerText = "Load"; loadBtn.style.padding = "4px 10px"; loadBtn.style.fontSize = "12px";
            loadBtn.onclick = () => { this.#game.loadStudy(study.id); document.getElementById('studyManagerModal').style.display = 'none'; };
            div.appendChild(cb); div.appendChild(title); div.appendChild(loadBtn); container.appendChild(div);
        });
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
        for (let r = 0; r < 8; r++) { for (let c = 0; c < 8; c++) { if ((r + c) % 2 !== 0) { ctx.fillStyle = darkColor; ctx.fillRect(c * canvasSq, r * canvasSq, canvasSq, canvasSq); } } }
        
        const piecesLayer = document.getElementById('piecesLayer'); if (!piecesLayer) return;
        const pieces = Array.from(piecesLayer.children).filter(p => { const style = window.getComputedStyle(p); return style.display !== 'none' && style.opacity !== '0' && style.visibility !== 'hidden'; });
        
        const drawPromises = pieces.map(p => {
            return new Promise((resolve) => {
                const left = parseFloat(p.style.transform.match(/translate\(([-\d.]+)%,\s*([-\d.]+)%\)/)[1]);
                const top = parseFloat(p.style.transform.match(/translate\(([-\d.]+)%,\s*([-\d.]+)%\)/)[2]);
                const col = Math.round(left / 100); const row = Math.round(top / 100);
                if (col < 0 || col > 7 || row < 0 || row > 7) { resolve(); return; }
                
                let src = null; const img = p.tagName.toLowerCase() === 'img' ? p : p.querySelector('img'); const svg = p.querySelector('svg'); const bgImg = window.getComputedStyle(p).backgroundImage;
                if (img && img.src) { src = img.src; } else if (svg) { const svgString = new XMLSerializer().serializeToString(svg); src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString))); } else if (bgImg && bgImg !== 'none' && bgImg.includes('url')) { src = bgImg.slice(4, -1).replace(/"/g, "").replace(/'/g, ""); }
                if (!src) { resolve(); return; }
                const tempImg = new Image(); tempImg.crossOrigin = "Anonymous";
                tempImg.onload = () => { ctx.drawImage(tempImg, col * canvasSq, row * canvasSq, canvasSq, canvasSq); resolve(); };
                tempImg.onerror = () => resolve(); tempImg.src = src;
            });
        });
        await Promise.all(drawPromises);
    }
generateGIF() { 
        const previewArea = document.getElementById('gifPreviewArea'); if (!previewArea) return;
        if (typeof window.GIF === 'undefined') { previewArea.innerHTML = "<span style='color: #fa412d;'>Error: gif.js library missing!</span>"; return; }
        previewArea.innerHTML = "Initializing capture... <br>(Do not close modal)";
        
        const gifSize = 400; const gifDelay = 600;
        const canvas = document.createElement('canvas'); canvas.width = gifSize; canvas.height = gifSize; const ctx = canvas.getContext('2d');
        const gif = new window.GIF({ workers: 2, quality: 10, width: gifSize, height: gifSize, workerScript: './js/gif.worker.js', background: '#ffffff', transparent: null });
        
        gif.on('progress', function(p) { previewArea.innerHTML = `Encoding: ${Math.round(p * 100)}%`; });
        gif.on('finished', function(blob) {
            const url = URL.createObjectURL(blob); previewArea.innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:contain;">`;
            const a = document.createElement('a'); a.href = url; const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ""); a.download = `chess_game_${dateStr}.gif`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        });

        if (!this.#game) return;
        const state = this.#game.getReader();
        const originalNodeId = state.activeNodeId;
        const animCheckbox = document.getElementById('enableAnimations'); const wasAnimating = animCheckbox ? animCheckbox.checked : false;
        
        if (animCheckbox && wasAnimating) { animCheckbox.checked = false; if (typeof this.toggleAnimations === 'function') this.toggleAnimations(); }

        // Securely navigate game using the API
        this.#game.goToStart();
        this.renderBoard(false);

        const captureFrameLoop = async () => {
            await new Promise(r => setTimeout(r, 50));
            await this._drawBoardToCanvas(canvas, ctx);
            gif.addFrame(canvas, { delay: gifDelay, copy: true });
            
            // Advance pure logic
            const moved = this.#game.stepForward();
            if (moved) {
                captureFrameLoop();
            } else {
                gif.addFrame(canvas, { delay: 2000, copy: true }); previewArea.innerHTML = "Encoding frames...<br>Please wait.";
                this.#game.goToNodeId(originalNodeId); this.renderBoard(false);
                if (animCheckbox && wasAnimating) { animCheckbox.checked = true; if (typeof this.toggleAnimations === 'function') this.toggleAnimations(); }
                gif.render();
            }
        };
        setTimeout(captureFrameLoop, 400);
    }
exportEmbed() { 
        if (!this.#game) return;
        const modal = document.getElementById('exportEmbededModal');
        if (modal) {
            // ✨ AUTO-DETECT PIECES FIX
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
                        // ✨ Removed the static scale transform. The live iframe handles itself!
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
        if (pgn) params.append('pgn', encodeURIComponent(pgn)); // ✨ MUST BE ENCODED for iframe URL
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

        // ✨ THE FIX: Render the LIVE Iframe into the new Preview Box!
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
renderCharts(force = false) {
        if (typeof Chart === 'undefined') return;
        if (this.evalChart || this.timeChart) this.updateChartActiveLine();

        let lastNode = this.#game.rootNode;
        while (lastNode && lastNode.children.length > 0) lastNode = lastNode.children[lastNode.selectedChildIndex || 0];

        if (!force && this.evalChart && this._lastChartedFen === lastNode.fen) return; 
        this._lastChartedFen = lastNode.fen;

        if (this._chartRenderTimeout) clearTimeout(this._chartRenderTimeout);
        if (force) this.forceRenderCharts();
        else this._chartRenderTimeout = setTimeout(() => { this.forceRenderCharts(); }, 150); 
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
            // ✨ FIX: Only scan the main line for evaluations!
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

        // ✨ FIX 1: Target EVERY possible class name you might have used for the theme buttons
        const themeButtons = document.querySelectorAll('.theme-preset, .theme-box, .theme-btn, .preset-btn, .theme-card, .board-theme-box');
        
        themeButtons.forEach(el => {
            el.classList.remove('active');
            
            // ✨ FIX 2: Auto-detect the right button by reading its onclick attribute.
            // This prevents bugs where clicking an inner <span> applies the border to the wrong element!
            const onclickStr = el.getAttribute('onclick') || "";
            const cleanClick = onclickStr.replace(/\s+/g, '').toLowerCase();
            const cleanLight = lightHex.toLowerCase();
            const cleanDark = darkHex.toLowerCase();
            
            if (cleanClick.includes(cleanLight) && cleanClick.includes(cleanDark)) {
                el.classList.add('active');
            }
        });
        
        // ✨ FIX 3: Safe fallback for custom caller elements
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
        if (this.pieceTheme === 'local') return;
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
        let val = document.getElementById('editorPgnInput').value;
        if (val && this.#game) {
            this.#game.mode = 'analysis';
            this.switchTab('analysis');
            if (typeof this.#game.loadPGN === 'function') {
                this.#game.loadPGN(val, true);
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

        // Prevent casting if out of uses
        const prefix = colorRequest === (this.flipped ? 'w' : 'b') ? 'top' : 'bottom';
        const countEl = document.getElementById(`spell-${prefix}-${spellType}-count`);
        const usesLeft = countEl ? parseInt(countEl.innerText) : 1;
        
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
        // ✨ We no longer manually subtract mana here! The engine handles the math automatically 
        // when it processes the pseudo-move we send it below.
        this.activeSpell = null;
        
        // ✨ Create a pseudo-move object for the engine
        const spellMove = {
            isSpell: true,
            spellType: spellType,
            target: targetSq
        };
        
        this.executeMove(spellMove, true);
        
        // Update the headers to visually remove the spent mana charges
        this.renderHeaders();
    }
}