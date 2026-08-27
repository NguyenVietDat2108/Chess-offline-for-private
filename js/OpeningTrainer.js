export class OpeningTrainer {
    constructor(app) {
        this.app = app;
        this.isActive = false;
        this.userColor = 'w';
        this.trainingRoot = null;
        this.activePath = [];
        this.mistakeCount = 0;
        this.solvedTranspositions = new Set();
        this.totalLeaves = 0;
        this.solvedLeaves = 0;
        this.opponentTimer = null; 
        this.actionTimer = null; 

        this._injectCSS();

        const trainerBtn = document.getElementById('menuBtn-trainer');
        if (trainerBtn) {
            trainerBtn.addEventListener('click', () => {
                this.app.game.mode = 'trainer';
                if (this.app.ui.resizeApp) this.app.ui.resizeApp();
                setTimeout(() => this.refreshChapterList(), 50);
            });
        }
        const colorSel = document.getElementById('trainerColorSelect');
        if (colorSel) {
            colorSel.addEventListener('change', (e) => {
                const wantFlipped = (e.target.value === 'b');
                if (this.app.ui.flipped !== wantFlipped) {
                    this.app.ui.flipBoard();
                }
            });
        }
        
        setTimeout(() => { this.refreshChapterList(); }, 500);
    }

_injectCSS() {
        if (!document.getElementById('trainer-auto-styles')) {
            const style = document.createElement('style');
            style.id = 'trainer-auto-styles';
            // Khai báo container-type để dùng cqi
            // Thả cửa overflow để NAG ở viền (như cột h, rank 1, 8) không bị cắt lẹm
            style.innerHTML = `
                .mini-sq {
                    container-type: inline-size;
                }
                .mini-board-grid, .mini-board-card {
                    overflow: visible !important; 
                }
            `;
            document.head.appendChild(style);
        }
    }

    _patchMainBoardNAG(node) {
        if (!node || !node.nag || !node.lastMove) return;
        
        let evalNags = [];
        let qualityNags = [];
        const nags = node.nag.toString().split(',');
        
        nags.forEach(n => {
            const info = this.app.ui.getNagInfo(n.trim());
            if (info) {
                if (info.type.startsWith('eval')) evalNags.push(info);
                else qualityNags.push(info);
            }
        });

        const finalNagsInfo = [...qualityNags, ...evalNags];

        if (finalNagsInfo.length > 0) {
            const nagsHtml = finalNagsInfo.map((info, index) => {
                const tColor = info.textColor || '#ffffff';
                const zIndex = 10 - index;
                const marginLeft = index > 0 ? '-10cqi' : '0';
                
                const wideSymbols = ['⩲', '⩱', '±', '∓', '∞', '='];
                const isDoubleChar = (info.symbol.length > 1 || wideSymbols.includes(info.symbol)) && !info.symbol.includes('<div');
                const fontSize = isDoubleChar ? '15cqi' : '22cqi';
                const letterSpacing = isDoubleChar ? '-1.5cqi' : 'normal';
                
                return `<div class="nag-indicator" style="position:relative !important; background-color:${info.color} !important; border:2.5cqi solid ${info.borderColor} !important; width:35cqi !important; height:35cqi !important; min-width:35cqi !important; min-height:35cqi !important; max-width:35cqi !important; max-height:35cqi !important; flex:none !important; aspect-ratio:1/1 !important; border-radius:50% !important; display:flex !important; flex-direction:column !important; align-items:center !important; justify-content:center !important; padding:0 !important; margin:0 0 0 ${marginLeft} !important; box-shadow:0 1.5cqi 3cqi rgba(0,0,0,0.6) !important; box-sizing:border-box !important; z-index:${zIndex} !important; overflow:hidden !important;">
                    <span style="color:${tColor} !important; font-size:${fontSize} !important; letter-spacing:${letterSpacing} !important; font-weight:800 !important; line-height:1 !important; white-space:nowrap !important; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important; text-shadow:none !important;">${info.symbol}</span>
                </div>`;
            }).join('');

            const toIdx = node.lastMove.to;
            const pieceObj = this.app.game.board[toIdx];
            if (pieceObj) {
                const sqEl = document.querySelector(`.piece[data-id="${pieceObj.id}"]`);
                if (sqEl) {
                    const existingWrappers = sqEl.querySelectorAll('.nag-wrapper');
                    existingWrappers.forEach(el => el.remove());
                    
                    // KÍCH Z-INDEX Ô CỜ LÊN ĐỂ KHÔNG BỊ Ô KHÁC ĐÈ VÀO NAG
                    sqEl.style.zIndex = "100";
                    sqEl.style.overflow = "visible";
                    
                    sqEl.insertAdjacentHTML('beforeend', `
                        <div class="nag-wrapper" style="position:absolute !important; top:0 !important; left:0 !important; width:100% !important; height:100% !important; container-type:inline-size !important; pointer-events:none !important; z-index:100 !important; overflow:visible !important;">
                            <div style="position:absolute !important; top:-12% !important; right:-12% !important; display:flex !important; flex-direction:row !important; align-items:center !important;">
                                ${nagsHtml}
                            </div>
                        </div>
                    `);
                }
            }
        }
    }

    _cleanComment(comment) {
        if (!comment) return "";
        let clean = comment.replace(/\[%(eval|clk|cal|csl)[^\]]*\]/g, "").trim();
        clean = clean.replace(/DEPTH:\s*\d+\s*/gi, ""); 
        clean = clean.replace(/[-+]?M?\d+(?:\.\d+)?\/\d+/g, ""); 
        clean = clean.replace(/,?\s*tl=[\d\.]+s?/gi, ""); 
        clean = clean.replace(/,?\s*nps=\d+/gi, ""); 
        clean = clean.replace(/,?\s*latency=[\d\.]+s?/gi, ""); 
        clean = clean.replace(/,?\s*pv=(?:\\*["'])?[^"}\\]*(?:\\*["'])?/gi, ""); 
        clean = clean.replace(/(^|,\s*)\bbook\b(\s*,|$)/ig, "").trim();
        clean = clean.replace(/^,?\s*/, "").replace(/,?\s*$/, "").trim();
        return clean;
    }

    loadTrainerChapter(indexStr) {
        if (!indexStr) return;
        const idx = parseInt(indexStr, 10);
        this.app.game.loadChapter(idx);
        this.app.game.mode = 'trainer';
        if (this.app.ui.resizeApp) this.app.ui.resizeApp();
        this.stopTraining();
    }

    refreshChapterList() {
        const select = document.getElementById('trainerChapterSelect');
        if (!select || !this.app.game || !this.app.game.chapters) return;
        const chapters = this.app.game.chapters;
        select.innerHTML = '';
        if (chapters.length === 0) {
            select.innerHTML = '<option value="">No chapters available</option>';
            return;
        }
        chapters.forEach((ch, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.text = `${idx + 1}. ${ch.title}`;
            if (idx === this.app.game.activeChapterIndex) opt.selected = true;
            select.appendChild(opt);
        });
    }

    toggleTraining() {
        const btn = document.getElementById('btnStartTrainer');
        if (this.isActive) {
            this.stopTraining();
            btn.innerText = "Start Training";
            btn.style.background = "#26c2a3";
        } else {
            this.startTraining();
            if (this.isActive) {
                btn.innerText = "Stop Training";
                btn.style.background = "#fa412d";
            }
        }
    }

    _getValidChildren(node) {
        if (!node || !node.children) return [];
        return node.children.filter(child => {
            if (!child.lastMove) return true;
            if (child.lastMove.color === this.userColor) {
                if (child.nag) {
                    const nags = child.nag.toString().split(',');
                    const badNags = ['2', '4', '6', '?', '??', '?!', '$2', '$4', '$6'];
                    if (nags.some(n => badNags.includes(n.trim()))) return false; 
                }
            }
            return true; 
        });
    }

    _getSubtreeMistakes(node, srsMistakes) {
        if (node.is_solved || this.solvedTranspositions.has(node.fen.split(' ')[0])) {
            return 0;
        }
        
        let count = srsMistakes[node.fen.split(' ')[0]] || 0;
        const validChildren = this._getValidChildren(node);
        
        for (let child of validChildren) {
            count += this._getSubtreeMistakes(child, srsMistakes);
        }
        return count;
    }

    startTraining() {
        if (!this.app.game.currentNode || this.app.game.currentNode.children.length === 0) {
            this.app.ui.showNotification("Please load a PGN Study with opening variations first!", "No Repertoire", "");
            return;
        }

        this.isActive = true;
        this.userColor = document.getElementById('trainerColorSelect').value;
        document.getElementById('trainerColorSelect').disabled = true;
        document.getElementById('trainerChapterSelect').disabled = true;
        
        let root = this.app.game.currentNode;
        while(root.parent) { root = root.parent; }
        
        this.trainingRoot = root;
        this.app.game.goToStart(false); 
        
        this.activePath = [];
        this.mistakeCount = 0;
        this.solvedTranspositions.clear();
        this.totalLeaves = this._countLeaves(this.trainingRoot);
        this.solvedLeaves = 0;
        
        if (this.opponentTimer) clearTimeout(this.opponentTimer);
        if (this.actionTimer) clearTimeout(this.actionTimer);
        
        this._resetSolvedStatus(this.trainingRoot);
        this._updateProgress();

        if (this.app.ui.flipped !== (this.userColor === 'b')) this.app.ui.flipBoard();

        this.renderState();
    }

    stopTraining() {
        this.isActive = false;
        if (this.opponentTimer) clearTimeout(this.opponentTimer);
        if (this.actionTimer) clearTimeout(this.actionTimer);

        document.getElementById('trainerColorSelect').disabled = false;
        document.getElementById('trainerChapterSelect').disabled = false;
        
        this.clearHints();
        document.getElementById('miniBoardsContainer').innerHTML = "";
        document.getElementById('trainerStatusText').innerHTML = "1. Go to Study & load a PGN.<br>2. Select Chapter & Color.<br>3. Click Start.";
        document.getElementById('trainerProgressContainer').style.display = 'none';
    }

    renderState() {
        this.clearHints();
        if (this.opponentTimer) clearTimeout(this.opponentTimer);
        if (this.actionTimer) clearTimeout(this.actionTimer);

        const node = this.app.game.currentNode;
        
        if (this._isNodeFullySolved(node)) {
            if (node === this.trainingRoot) {
                this._handleTrainingComplete();
                return;
            }
            this.backtrack();
            return;
        }

        const turn = node.fen.split(' ')[1];
        const isUserTurn = turn === this.userColor;
        const statusEl = document.getElementById('trainerStatusText');

        const validChildren = this._getValidChildren(node);

        if (validChildren.length === 0) {
            this._markBranchSolved(node);
            statusEl.innerHTML = "<strong style='color:#26c2a3'>Line Complete!</strong> Rewinding...";
            setTimeout(() => this.backtrack(), 800);
            return;
        }

        if (isUserTurn) {
            statusEl.innerHTML = "<strong style='color:#38bdf8; font-size: 15px;'>Your turn.</strong><br>Play your prepared move on the main board.";
            document.getElementById('miniBoardsContainer').innerHTML = ""; 
        } else {
            const unsolved = validChildren.filter(c => !c.is_solved && !this.solvedTranspositions.has(c.fen.split(' ')[0]));
            if (unsolved.length === 0) { this.backtrack(); return; }

            if (validChildren.length === 1) {
                statusEl.innerHTML = "<strong style='color:#facc15; font-size: 15px;'>Opponent's turn.</strong><br>Auto-replying...";
                document.getElementById('miniBoardsContainer').innerHTML = "";
                this.opponentTimer = setTimeout(() => this.playOpponentMove(unsolved[0]), 500);
            } else {
                statusEl.innerHTML = "<strong style='color:#facc15; font-size: 15px;'>Opponent's Options...</strong><br>Studying variations... Auto-playing shortly.";
                this.renderMiniBoards(validChildren);

                let srsMistakes = JSON.parse(localStorage.getItem('chess_trainer_srs') || '{}');
                let totalWeight = 0;
                
                let weightedUnsolved = unsolved.map(child => {
                    let subtreeMistakes = this._getSubtreeMistakes(child, srsMistakes);
                    let weight = 1 + (subtreeMistakes * 3); 
                    totalWeight += weight;
                    return { child, weight };
                });

                let randomNum = Math.random() * totalWeight;
                let weightSum = 0;
                let selectedReply = unsolved[0]; 

                for (let item of weightedUnsolved) {
                    weightSum += item.weight;
                    if (randomNum <= weightSum) {
                        selectedReply = item.child;
                        break;
                    }
                }

                this.opponentTimer = setTimeout(() => { 
                    this.playOpponentMove(selectedReply); 
                }, 4000); 
            }
        }
    }

    renderMiniBoards(children) {
        const container = document.getElementById('miniBoardsContainer');
        container.innerHTML = "";

        children.forEach(child => {
            const isSolved = child.is_solved || this.solvedTranspositions.has(child.fen.split(' ')[0]);
            const card = document.createElement('div');
            card.className = `mini-board-card ${isSolved ? 'solved' : ''}`;
            
            card.onclick = () => {
                if(!isSolved) {
                    if (this.opponentTimer) clearTimeout(this.opponentTimer);
                    this.playOpponentMove(child);
                }
            };
            
            const header = document.createElement('div');
            header.className = 'mini-board-header';
            
            // Build header badge arrays
            let headNagArray = [];
            let gridNagsInfo = [];

            if (child.nag) {
                let evalNags = [];
                let qualityNags = [];
                const nags = child.nag.toString().split(',');
                nags.forEach(n => {
                    const info = this.app.ui.getNagInfo(n.trim());
                    if (info) {
                        if (info.type.startsWith('eval')) evalNags.push(info);
                        else qualityNags.push(info);
                    }
                });
                
                gridNagsInfo = [...qualityNags, ...evalNags];

                // Build static header badges
                headNagArray = gridNagsInfo.map(info => {
                    const tColor = info.textColor || '#ffffff';
                    
                    // Xử lý thu nhỏ font chữ cho các ký hiệu kép (+-, -+, v.v.) để lọt thỏm vào hình tròn
                    const wideSymbols = ['⩲', '⩱', '±', '∓', '∞', '='];
                    const isDoubleChar = (info.symbol.length > 1 || wideSymbols.includes(info.symbol)) && !info.symbol.includes('<div');
                    const fontSize = isDoubleChar ? '10px' : '13px';
                    const letterSpacing = isDoubleChar ? '-1px' : 'normal';

                    // Khóa cứng Width = Height = 18px và dùng inline-flex để ép hình tròn tuyệt đối
                    return `<span style="background-color:${info.color}; color:${tColor}; border:1px solid ${info.borderColor}; width:18px; height:18px; min-width:18px; min-height:18px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; padding:0; margin:0; font-weight:bold; font-size:${fontSize}; letter-spacing:${letterSpacing}; box-shadow:0 1px 2px rgba(0,0,0,0.5); line-height:1; flex-shrink:0; box-sizing:border-box;">${info.symbol}</span>`;
                });
            }
            
            // Căn giữa theo chiều dọc với chữ text (moveSan)
            const nagHTML = headNagArray.length > 0 ? `<div style="display:flex; gap:3px; margin-left:5px; align-items:center;">${headNagArray.join('')}</div>` : '';

            // Render SRS fail badge
            let srsMistakes = JSON.parse(localStorage.getItem('chess_trainer_srs') || '{}');
            let childFenKey = child.fen.split(' ')[0]; 
            let mistakeCount = srsMistakes[childFenKey] || 0;
            let srsBadge = mistakeCount > 0 ? `<span style="background:#fa412d; color:#fff; border-radius:10px; padding:2px 6px; font-size:0.7em; margin-left:6px; box-shadow: 0 1px 3px rgba(0,0,0,0.5);">Fail: ${mistakeCount}</span>` : '';

            header.innerHTML = `<span style="display:flex; align-items:center;">${child.moveSan}${nagHTML}${srsBadge}</span> ${isSolved ? `<span style="color:#26c2a3; font-size:1.2em; margin-left:4px;">[OK]</span>` : ''}`;
            card.appendChild(header);

            const boardGrid = document.createElement('div');
            boardGrid.className = 'mini-board-grid';
            const layout = this._parseFenToGrid(child.fen);
            
            for (let i = 0; i < 64; i++) {
                const sq = document.createElement('div');
                sq.className = `mini-sq ${(Math.floor(i / 8) + i % 8) % 2 === 0 ? 'light' : 'dark'}`;
                
                if (layout[i]) {
                    const color = layout[i][0];
                    const type = layout[i][1].toUpperCase();
                    const rawHTML = this.app.ui.getPieceHTML({ color, type });
                    if (rawHTML) sq.innerHTML = rawHTML.replace(/style="[^"]*"/g, ''); 
                }
                
                // Inject Flexbox Double NAG container into the mini-board target square
                if (child.lastMove && child.lastMove.to === i && gridNagsInfo.length > 0) {
                    const nagsHtml = gridNagsInfo.map((info, index) => {
                        const tColor = info.textColor || '#ffffff';
                        const zIndex = 10 - index;
                        const marginLeft = index > 0 ? '-16cqi' : '0'; 
                        
                        const wideSymbols = ['⩲', '⩱', '±', '∓', '∞', '='];
                        const isDoubleChar = (info.symbol.length > 1 || wideSymbols.includes(info.symbol)) && !info.symbol.includes('<div');
                        const fontSize = isDoubleChar ? '26cqi' : '38cqi';
                        const letterSpacing = isDoubleChar ? '-2cqi' : 'normal';
                        return `<div class="nag-indicator" style="position:relative !important; background-color:${info.color} !important; border:3cqi solid ${info.borderColor} !important; width:60cqi !important; height:60cqi !important; min-width:60cqi !important; min-height:60cqi !important; max-width:60cqi !important; max-height:60cqi !important; flex:none !important; aspect-ratio:1/1 !important; border-radius:50% !important; display:flex !important; flex-direction:column !important; align-items:center !important; justify-content:center !important; padding:0 !important; margin:0 0 0 ${marginLeft} !important; box-shadow:0 3cqi 6cqi rgba(0,0,0,0.6) !important; box-sizing:border-box !important; z-index:${zIndex} !important; overflow:hidden !important;">
                            <span style="color:${tColor} !important; font-size:${fontSize} !important; letter-spacing:${letterSpacing} !important; font-weight:800 !important; line-height:1 !important; white-space:nowrap !important; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important; text-shadow:none !important;">${info.symbol}</span>
                        </div>`;
                    }).join('');
                    
                    sq.style.position = 'relative';
                    sq.style.containerType = 'inline-size'; 
                    sq.style.zIndex = '100';
                    sq.style.overflow = 'visible';
                    
                    sq.innerHTML += `
                        <div class="nag-wrapper" style="position:absolute !important; top:0 !important; left:0 !important; width:100% !important; height:100% !important; container-type:inline-size !important; pointer-events:none !important; z-index:100 !important; overflow:visible !important;">
                            <div style="position:absolute !important; top:-15% !important; right:-15% !important; display:flex !important; flex-direction:row !important; align-items:center !important;">
                                ${nagsHtml}
                            </div>
                        </div>`;
                }
                
                boardGrid.appendChild(sq);
            }
            card.appendChild(boardGrid);
            container.appendChild(card);
        });
    }

    handleUserMoveAttempt(sourceIdx, targetIdx) {
        if (!this.isActive) return false; 
        
        const node = this.app.game.currentNode;
        const turn = node.fen.split(' ')[1];
        if (turn !== this.userColor) {
            this.app.ui.showNotification("Wait for the opponent to move.", "Not your turn", "");
            return true; 
        }

        let isLegalMove = false;
        if (this.app.ui.legalMoves && this.app.ui.legalMoves.some(m => m.to === targetIdx)) {
            isLegalMove = true;
        } else if (this.app.ui.resolveCastlingIntent && this.app.ui.resolveCastlingIntent(sourceIdx, targetIdx)) {
            isLegalMove = true;
        }
        if (!isLegalMove) {
            return true; 
        }

        let matchedChild = null;
        let childIndex = -1;
        const validChildren = this._getValidChildren(node);

        for (let i = 0; i < node.children.length; i++) {
            let child = node.children[i];
            if (child.lastMove && child.lastMove.from === sourceIdx && child.lastMove.to === targetIdx) {
                if (!validChildren.includes(child)) {
                    this.app.ui.showNotification("That move is annotated as a mistake in your study!", "Bad Move", "");
                    setTimeout(() => this._handleMistake(validChildren), 10);
                    return true;
                }
                matchedChild = child;
                childIndex = i;
                break;
            }
        }

        if (matchedChild) {
            this.mistakeCount = 0;
            this.clearHints();
            this.activePath.push(matchedChild);
            
            node.selectedChildIndex = childIndex;
            this.app.game.stepForward(false); 
            
            if (this.app.game.triggerMoveSound) this.app.game.triggerMoveSound(matchedChild.lastMove);
            else if (typeof SoundManager !== 'undefined') SoundManager.play('move-self', this.app.ui.volume || 0.7);
            
            this._patchMainBoardNAG(matchedChild);

            let comment = this._cleanComment(matchedChild.comment);
            let readTime = comment ? Math.min(Math.max(1500, comment.length * 50), 12000) : 100; 

            const proceed = () => {
                if (this._getValidChildren(matchedChild).length === 0) {
                    this._markBranchSolved(matchedChild);
                    document.getElementById('trainerStatusText').innerHTML = "<strong style='color:#26c2a3'>Line Complete!</strong> Rewinding...";
                    setTimeout(() => this.backtrack(), 800);
                } else {
                    this.renderState();
                }
            };

            if (comment) {
                document.getElementById('trainerStatusText').innerHTML = `
                    <strong style='color:#38bdf8; font-size:15px;'>Good move!</strong>
                    <div style="margin-top:10px; background:rgba(56,189,248,0.1); border-left:3px solid #38bdf8; padding:10px; color:#e2e8f0; font-size:13px; font-style:italic; text-align:left; line-height:1.5;">${comment}</div>
                `;
                this.actionTimer = setTimeout(proceed, readTime);
            } else {
                setTimeout(proceed, 50);
            }

        } else {
            setTimeout(() => this._handleMistake(validChildren), 10);
        }
        return true; 
    }

    playOpponentMove(replyNode) {
        this.activePath.push(replyNode);
        
        const parentNode = replyNode.parent;
        if (parentNode) {
            const idx = parentNode.children.indexOf(replyNode);
            if (idx !== -1) parentNode.selectedChildIndex = idx;
        }

        this.app.game.stepForward(true);
        this._patchMainBoardNAG(replyNode);

        let comment = this._cleanComment(replyNode.comment);
        let readTime = comment ? Math.min(Math.max(2000, comment.length * 50), 15000) : 100; 

        const proceed = () => {
            if (this._getValidChildren(replyNode).length === 0) {
                this._markBranchSolved(replyNode);
                document.getElementById('trainerStatusText').innerHTML = "<strong style='color:#26c2a3'>Line Complete!</strong> Rewinding...";
                setTimeout(() => this.backtrack(), 800);
            } else {
                this.renderState();
            }
        };

        if (comment) {
            document.getElementById('miniBoardsContainer').innerHTML = ""; 
            document.getElementById('trainerStatusText').innerHTML = `
                <strong style='color:#facc15; font-size:15px;'>Opponent played ${replyNode.moveSan}</strong>
                <div style="margin-top:10px; background:rgba(250,204,21,0.1); border-left:3px solid #facc15; padding:10px; color:#e2e8f0; font-size:13px; font-style:italic; text-align:left; line-height:1.5;">${comment}</div>
            `;
            this.actionTimer = setTimeout(proceed, readTime);
        } else {
            setTimeout(proceed, 50);
        }
    }

    backtrack() {
        if (this.opponentTimer) clearTimeout(this.opponentTimer);
        if (this.actionTimer) clearTimeout(this.actionTimer);
        
        let curr = this.app.game.currentNode;
        while (curr && curr !== this.trainingRoot) {
            if (!this._isNodeFullySolved(curr)) break;
            curr = curr.parent;
        }

        if (!curr || this._isNodeFullySolved(curr)) {
            this._handleTrainingComplete();
            return;
        }

        this.activePath = [];
        let temp = curr;
        while (temp && temp !== this.trainingRoot) {
            this.activePath.unshift(temp);
            temp = temp.parent;
        }

        this.app.game.goToNodeId(curr.id, true);
        if (typeof SoundManager !== 'undefined') SoundManager.play('notify', this.app.ui.volume || 0.7);
        this.renderState();
    }

    _handleMistake(validMoves) {
        this.mistakeCount++;
        if (typeof SoundManager !== 'undefined') SoundManager.play('illegal', this.app.ui.volume || 0.7);

        const targetNode = validMoves.find(c => !c.is_solved);
        if (!targetNode || !targetNode.lastMove) return;

        let mistakes = JSON.parse(localStorage.getItem('chess_trainer_srs') || '{}');
        let fenKey = this.app.game.currentNode.fen.split(' ')[0]; 
        mistakes[fenKey] = (mistakes[fenKey] || 0) + 1;
        localStorage.setItem('chess_trainer_srs', JSON.stringify(mistakes));

        const fromSq = targetNode.lastMove.from;
        const toSq = targetNode.lastMove.to;

        this.clearHints();
        const statusEl = document.getElementById('trainerStatusText');

        if (this.mistakeCount === 1) {
            const sqEl = document.querySelector(`.square[data-index="${fromSq}"]`);
            if (sqEl) sqEl.classList.add('trainer-hint-piece');
            statusEl.innerHTML = "<strong style='color:#fa412d'>Inaccuracy!</strong><br>Hint: Move the highlighted piece.";
        } else if (this.mistakeCount >= 2) {
            const sqFrom = document.querySelector(`.square[data-index="${fromSq}"]`);
            const sqTo = document.querySelector(`.square[data-index="${toSq}"]`);
            if (sqFrom) sqFrom.classList.add('trainer-hint-piece');
            if (sqTo) sqTo.classList.add('trainer-hint-dest');
            statusEl.innerHTML = `<strong style='color:#fa412d'>Mistake!</strong><br>You need to play <b>${targetNode.moveSan}</b>`;
        }
    }

    _markBranchSolved(leafNode) {
        leafNode.is_solved = true;
        this.solvedTranspositions.add(leafNode.fen.split(' ')[0]); 
        
        let curr = leafNode.parent;
        while (curr) {
            if (this._isNodeFullySolved(curr)) {
                curr.is_solved = true;
                this.solvedTranspositions.add(curr.fen.split(' ')[0]);
            }
            curr = curr.parent;
        }

        let srsMistakes = JSON.parse(localStorage.getItem('chess_trainer_srs') || '{}');
        let srsUpdated = false;
        
        this.activePath.forEach(node => {
            let fenKey = node.fen.split(' ')[0];
            if (srsMistakes[fenKey] && srsMistakes[fenKey] > 0) {
                srsMistakes[fenKey]--; 
                srsUpdated = true;
            }
        });
        
        if (srsUpdated) {
            localStorage.setItem('chess_trainer_srs', JSON.stringify(srsMistakes));
        }
        
        this.solvedLeaves++;
        this._updateProgress();
    }

    _isNodeFullySolved(node) {
        const validChildren = this._getValidChildren(node);
        if (validChildren.length === 0) return node.is_solved;
        return validChildren.every(c => c.is_solved || this.solvedTranspositions.has(c.fen.split(' ')[0]));
    }

    _handleTrainingComplete() {
        document.getElementById('trainerStatusText').innerHTML = "<strong style='color:#26c2a3; font-size:16px;'>Repertoire Mastered!</strong>";
        this.app.ui.showNotification("Brilliant! You have perfectly mastered all variations in this opening tree.", "Mastery", "");
        if (typeof SoundManager !== 'undefined') SoundManager.play('win', this.app.ui.volume || 0.7);
        
        const btn = document.getElementById('btnStartTrainer');
        btn.innerText = "Finish";
        btn.style.background = "#555";
        this.isActive = false;
        document.getElementById('trainerColorSelect').disabled = false;
        document.getElementById('trainerChapterSelect').disabled = false;
    }

    clearHints() {
        document.querySelectorAll('.trainer-hint-piece, .trainer-hint-dest').forEach(el => {
            el.classList.remove('trainer-hint-piece', 'trainer-hint-dest');
        });
    }

    _resetSolvedStatus(node) {
        node.is_solved = false;
        node.children.forEach(c => this._resetSolvedStatus(c));
    }

    _countLeaves(node) {
        const validChildren = this._getValidChildren(node);
        if (validChildren.length === 0) return 1;
        let count = 0;
        validChildren.forEach(c => count += this._countLeaves(c));
        return count;
    }

    _updateProgress() {
        const container = document.getElementById('trainerProgressContainer');
        const bar = document.getElementById('trainerProgressBar');
        if (this.totalLeaves > 0) {
            container.style.display = 'block';
            let pct = (this.solvedLeaves / this.totalLeaves) * 100;
            if (pct > 100) pct = 100;
            bar.style.width = `${pct}%`;
        }
    }

    _parseFenToGrid(fen) {
        const grid = new Array(64).fill(null);
        const rows = fen.split(' ')[0].split('/');
        let i = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < rows[r].length; c++) {
                const char = rows[r][c];
                if (!isNaN(char)) i += parseInt(char);
                else {
                    const color = char === char.toUpperCase() ? 'w' : 'b';
                    grid[i] = `${color}${char.toLowerCase()}`;
                    i++;
                }
            }
        }
        return grid;
    }
}