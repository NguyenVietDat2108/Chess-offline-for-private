
console.log("%c🧪 QA Checklist script loaded! Press Ctrl+Space to hide/show.", "color: #26c2a3; font-weight: bold; font-size: 14px;");

class QATracker {
    constructor() {
        this.storageKey = 'chess_qa_state';
        this.customKey = 'chess_qa_custom_tests'; 
        
        this.customTests = JSON.parse(localStorage.getItem(this.customKey)) || [];
        this.tests = []; 
        this.state = {};
        
        this.isOpen = true; 
        this.currentScale = 1; // ✨ Tracks the active scale factor
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.loadAndInit());
        } else {
            this.loadAndInit();
        }
    }

    async loadAndInit() {
        try {
            const response = await fetch('qa-tests.json');
            if (!response.ok) throw new Error("File not found");
            const jsonTests = await response.json();

            this.tests = [...jsonTests, ...this.customTests];
            this.state = this.loadState();
            
            this.initUI();
        } catch (error) {
            console.error("❌ Failed to load qa-tests.json.", error);
        }
    }

    runAutoChecks() {
        this.tests.filter(t => t.type === 'auto').forEach(test => {
            try {
                const runFn = new Function(test.run);
                const result = runFn(); 
                
                this.state[test.id].passed = result;
                const icon = document.getElementById(`auto-icon-${test.id}`);
                const item = icon.closest('.qa-item');
                
                if (result) {
                    icon.innerText = '✅';
                    item.classList.add('passed'); item.classList.remove('failed');
                } else {
                    icon.innerText = '❌';
                    item.classList.add('failed'); item.classList.remove('passed');
                }
            } catch (e) {
                this.state[test.id].passed = false;
                this.state[test.id].note = e.message;
                const icon = document.getElementById(`auto-icon-${test.id}`);
                icon.innerText = '⚠️';
                icon.closest('.qa-item').classList.add('failed');
                document.querySelector(`.qa-note[data-id="${test.id}"]`).value = e.message;
            }
        });
        this.saveState();
    }

    loadState() {
        const saved = localStorage.getItem(this.storageKey);
        const state = saved ? (JSON.parse(saved) || {}) : {};
        const cleanState = {}; // ✨ Create a clean slate
        
        this.tests.forEach(t => {
            if (state[t.id]) {
                cleanState[t.id] = state[t.id];
                if (!cleanState[t.id].desc) cleanState[t.id].desc = t.desc; 
            } else {
                cleanState[t.id] = { passed: false, note: '', desc: t.desc };
            }
        });
        
        return cleanState; // ✨ Returns ONLY the currently active tests!
    }

    saveState() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.state));
        this.updateProgressBar();
    }

    // ✨ Calculates and applies the scale to make it fit in the window
    updateScale() {
        const panel = document.getElementById('qa-panel');
        if (!panel) return;

        // Base dimensions of the panel + padding margins
        const baseHeight = 640; 
        const baseWidth = 390;  
        
        const scaleY = window.innerHeight / baseHeight;
        const scaleX = window.innerWidth / baseWidth;
        
        // Use the smallest scale to make sure both width and height fit, max 1.0 (don't scale up)
        this.currentScale = Math.min(1, scaleX, scaleY);
        panel.style.transform = `scale(${this.currentScale})`;
    }

    initUI() {
        this.injectCSS();
        const container = document.createElement('div');
        container.id = 'qa-panel';
        
        container.style.display = 'none'; 
        container.style.top = '20px';
        container.style.right = '20px';

        container.innerHTML = `
            <div id="qa-header">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="pointer-events:none;">🧪 QA Checklist</span>
                    <span id="qa-progress-text" style="color:#26c2a3; pointer-events:none;">0%</span>
                </div>
                <button id="qa-toggle-btn" title="Minimize">▼</button>
            </div>
            <div id="qa-progress-bar"><div id="qa-progress-fill"></div></div>
            <div id="qa-content">
                <div style="padding: 10px; display:flex; gap: 10px; border-bottom: 1px solid #334155;">
                    <button id="qa-run-auto" class="qa-btn">Run Auto-Checks</button>
                    <button id="qa-reset" class="qa-btn danger">Reset All</button>
                </div>
                
                <div style="padding: 10px; display:flex; gap: 5px; border-bottom: 1px solid #334155; background: #0f172a;">
                    <input type="text" id="qa-new-desc" placeholder="Type a new manual test..." style="flex:1; padding:6px; border-radius:4px; border:1px solid #444; background:#1e293b; color:#fff; font-size:12px; outline:none;">
                    <button id="qa-add-btn" class="qa-btn" style="background:#26c2a3; color:#fff;">Add</button>
                </div>

                <div id="qa-list"></div>
            </div>
        `;
        document.body.appendChild(container);
        this.listEl = document.getElementById('qa-list');
        this.renderList();
        this.updateProgressBar();

        this.initDraggable(container, document.getElementById('qa-header'));

        // ✨ Run the scaler initially and on window resize
        this.updateScale();
        window.addEventListener('resize', () => this.updateScale());

        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
                e.preventDefault(); 
                container.style.display = container.style.display === 'none' ? 'flex' : 'none';
            }
        });

        document.getElementById('qa-toggle-btn').onclick = (e) => {
            e.stopPropagation(); 
            this.togglePanel();
        };
        
        document.getElementById('qa-run-auto').onclick = () => this.runAutoChecks();
        
        document.getElementById('qa-add-btn').onclick = () => this.addCustomTest();
        document.getElementById('qa-new-desc').onkeydown = (e) => {
            if (e.key === 'Enter') this.addCustomTest();
        };

        document.getElementById('qa-reset').onclick = () => {
            if (confirm("Reset all checkboxes? (This won't delete tests you added)")) {
                localStorage.removeItem(this.storageKey);
                this.state = this.loadState();
                this.renderList();
                this.updateProgressBar();
            }
        };
    }

    addCustomTest() {
        const input = document.getElementById('qa-new-desc');
        const desc = input.value.trim();
        if (!desc) return;

        const newTest = {
            id: 'custom_' + Date.now(),
            category: 'User Added',
            type: 'manual',
            desc: desc
        };

        this.customTests.push(newTest);
        this.tests.push(newTest);
        this.state[newTest.id] = { passed: false, note: '', desc: desc };

        localStorage.setItem(this.customKey, JSON.stringify(this.customTests));
        this.saveState();

        input.value = '';
        this.renderList();
        
        const contentDiv = document.getElementById('qa-content');
        contentDiv.scrollTop = contentDiv.scrollHeight;
    }

    deleteCustomTest(id) {
        if (!confirm("Delete this custom test?")) return;
        
        this.customTests = this.customTests.filter(t => t.id !== id);
        this.tests = this.tests.filter(t => t.id !== id);
        delete this.state[id];

        localStorage.setItem(this.customKey, JSON.stringify(this.customTests));
        this.saveState();

        this.renderList();
    }
    
    initDraggable(panel, header) {
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        header.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            isDragging = true;
            header.style.cursor = 'grabbing';

            // Grab the current unscaled layout coordinates
            initialLeft = panel.offsetLeft;
            initialTop = panel.offsetTop;

            // Pin it to top/left explicitly to override the right: 20px anchoring
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            panel.style.left = initialLeft + 'px';
            panel.style.top = initialTop + 'px';

            startX = e.clientX;
            startY = e.clientY;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        const onMouseMove = (e) => {
            if (!isDragging) return;
            
            // ✨ THE FIX: Layout 'left' and 'top' shift the unscaled box 1:1 with screen pixels.
            // We DO NOT divide by the scale here, otherwise the panel moves faster than the mouse!
            panel.style.left = `${initialLeft + (e.clientX - startX)}px`;
            panel.style.top = `${initialTop + (e.clientY - startY)}px`;
        };

        const onMouseUp = () => {
            isDragging = false;
            header.style.cursor = 'grab';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
    }

    renderList() {
        this.listEl.innerHTML = '';
        const categories = [...new Set(this.tests.map(t => t.category))];
        
        categories.forEach(cat => {
            const catHeader = document.createElement('div');
            catHeader.className = 'qa-category';
            catHeader.innerText = cat;
            this.listEl.appendChild(catHeader);

            const catTests = this.tests.filter(t => t.category === cat);
            catTests.forEach(test => {
                const isPassed = this.state[test.id]?.passed || false;
                const note = this.state[test.id]?.note || '';
                const testDesc = this.state[test.id]?.desc || test.desc; 

                const item = document.createElement('div');
                item.className = `qa-item ${isPassed ? 'passed' : ''}`;
                
                let checkHTML = test.type === 'manual' 
                    ? `<input type="checkbox" class="qa-checkbox" data-id="${test.id}" ${isPassed ? 'checked' : ''}>`
                    : `<span class="qa-auto-icon" id="auto-icon-${test.id}">${isPassed ? '✅' : '⚙️'}</span>`;

                let deleteHTML = test.id.startsWith('custom_') 
                    ? `<button class="qa-delete-custom" data-id="${test.id}" style="background:none; border:none; color:#fa412d; cursor:pointer; font-size:14px; padding:0 5px;" title="Delete Test">✖</button>` 
                    : ``;

                let editHTML = `<button class="qa-edit-btn" data-id="${test.id}" style="background:none; border:none; color:#38bdf8; cursor:pointer; font-size:14px; padding:0 5px 0 0; margin-top:-2px;" title="Edit Description">✏️</button>`;

                item.innerHTML = `
                    <div style="display:flex; align-items:flex-start; gap: 10px;">
                        ${checkHTML}
                        <div style="flex-grow:1;">
                            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                                <div style="display:flex; align-items:flex-start; flex-grow:1; padding-right:10px;">
                                    ${editHTML}
                                    <div class="qa-desc" id="desc-${test.id}">${testDesc}</div>
                                </div>
                                ${deleteHTML}
                            </div>
                            <textarea class="qa-note" data-id="${test.id}" placeholder="Bug notes...">${note}</textarea>
                        </div>
                    </div>
                `;
                this.listEl.appendChild(item);
            });
        });

        document.querySelectorAll('.qa-checkbox').forEach(cb => {
            cb.onchange = (e) => {
                this.state[e.target.dataset.id].passed = e.target.checked;
                e.target.closest('.qa-item').classList.toggle('passed', e.target.checked);
                this.saveState();
            };
        });

        document.querySelectorAll('.qa-note').forEach(ta => {
            ta.oninput = (e) => {
                this.state[e.target.dataset.id].note = e.target.value;
                this.saveState();
            };
        });

        document.querySelectorAll('.qa-edit-btn').forEach(btn => {
            btn.onclick = (e) => {
                const id = e.target.dataset.id;
                const descEl = document.getElementById(`desc-${id}`);
                
                if (descEl.isContentEditable) {
                    descEl.contentEditable = "false";
                    e.target.innerText = "✏️";
                    this.state[id].desc = descEl.innerText.trim();
                    
                    const customTest = this.customTests.find(t => t.id === id);
                    if (customTest) {
                        customTest.desc = this.state[id].desc;
                        localStorage.setItem(this.customKey, JSON.stringify(this.customTests));
                    }
                    this.saveState();
                } else {
                    descEl.contentEditable = "true";
                    descEl.focus();
                    e.target.innerText = "💾"; 
                }
            };
        });

        document.querySelectorAll('.qa-delete-custom').forEach(btn => {
            btn.onclick = (e) => this.deleteCustomTest(e.target.dataset.id);
        });
    }

    togglePanel() {
        this.isOpen = !this.isOpen;
        const panel = document.getElementById('qa-panel');
        const btn = document.getElementById('qa-toggle-btn');
        
        if (this.isOpen) {
            panel.classList.remove('collapsed');
            btn.innerText = '▼';
        } else {
            panel.classList.add('collapsed');
            btn.innerText = '▲';
        }
    }

    updateProgressBar() {
        const total = this.tests.length;
        if (total === 0) return; // Prevent division by zero
        
        // ✨ Count only the active tests that are currently loaded and passed
        const passed = this.tests.filter(t => this.state[t.id] && this.state[t.id].passed).length;
        
        let pct = Math.round((passed / total) * 100) || 0;
        pct = Math.min(100, Math.max(0, pct)); // ✨ Clamp exactly between 0% and 100%
        
        const fill = document.getElementById('qa-progress-fill');
        const text = document.getElementById('qa-progress-text');
        if (fill) fill.style.width = `${pct}%`;
        if (text) text.innerText = `${pct}%`;
    }
    injectCSS() {
        const style = document.createElement('style');
        style.innerHTML = `
            #qa-panel {
                position: fixed; width: 350px; height: 600px; min-width: 250px; min-height: 45px;
                background: #1e293b; color: #f8fafc; border: 2px solid #334155; 
                border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); 
                font-family: 'Segoe UI', sans-serif; z-index: 2147483647;
                display: flex; flex-direction: column; 
                resize: both; overflow: hidden;
                /* ✨ Anchors the scale transformation to the top right corner so it stays in bounds */
                transform-origin: top right;
            }
            #qa-panel.collapsed { height: 45px !important; resize: none; }
            #qa-panel.collapsed #qa-content, #qa-panel.collapsed #qa-progress-bar { display: none; }
            #qa-header {
                padding: 12px 15px; background: #0f172a; border-radius: 6px 6px 0 0; 
                border-bottom: 1px solid #334155; display: flex; justify-content: space-between; 
                align-items: center; font-weight: bold; cursor: grab; flex-shrink: 0;
            }
            #qa-toggle-btn { background: none; border: none; color: #38bdf8; cursor: pointer; font-size: 16px; font-weight:bold; }
            #qa-progress-bar { height: 4px; background: #334155; width: 100%; flex-shrink: 0; }
            #qa-progress-fill { height: 100%; background: #26c2a3; width: 0%; transition: width 0.3s; }
            #qa-content { flex-grow: 1; overflow-y: auto; background: #1e293b; }
            .qa-btn { background: #38bdf8; color: #000; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px; }
            .qa-btn.danger { background: #fa412d; color: #fff; }
            .qa-category { background: #334155; padding: 5px 10px; font-size: 11px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px; margin-top: 10px; color: #94a3b8; }
            .qa-item { padding: 12px; border-bottom: 1px solid #334155; transition: background 0.2s; }
            .qa-item.passed { background: rgba(38, 194, 163, 0.15); border-left: 3px solid #26c2a3; }
            .qa-item.failed { background: rgba(250, 65, 45, 0.15); border-left: 3px solid #fa412d; }
            
            .qa-desc { font-size: 13px; line-height: 1.4; margin-bottom: 8px; color:#e2e8f0; word-break: break-word; flex:1; transition: all 0.2s; }
            .qa-desc[contenteditable="true"] { outline: none; border: 1px dashed #38bdf8; background: rgba(0,0,0,0.3); padding: 2px 4px; border-radius: 3px; }
            
            .qa-note { width: 100%; box-sizing: border-box; background: #0f172a; color: #cbd5e1; border: 1px solid #475569; border-radius: 4px; padding: 8px; font-size: 12px; resize: vertical; min-height: 50px; }
            .qa-note:focus { outline: none; border-color: #38bdf8; }
            .qa-checkbox { width: 20px; height: 20px; cursor: pointer; margin-top: 2px; accent-color: #26c2a3; flex-shrink: 0; }
            .qa-auto-icon { font-size: 18px; margin-top: 2px; }
            #qa-new-desc:focus { border-color: #38bdf8 !important; }
            #qa-content::-webkit-scrollbar { width: 8px; }
            #qa-content::-webkit-scrollbar-track { background: #1e293b; }
            #qa-content::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; }
        `;
        document.head.appendChild(style);
    }
}

window.QATracker = new QATracker();