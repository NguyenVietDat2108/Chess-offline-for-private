console.log("%c🧪 QA Checklist script loaded! Press Ctrl+Shift+Q to hide/show.", "color: #26c2a3; font-weight: bold; font-size: 14px;");

class QATracker {
    constructor() {
        this.storageKey = 'chess_qa_state';
        this.customKey = 'chess_qa_custom_tests'; // ✨ New memory for user-added tests
        
        // Load custom user tests from memory
        this.customTests = JSON.parse(localStorage.getItem(this.customKey)) || [];
        
        // Merge defaults with custom tests
        this.tests = [...this.getDefaultTests(), ...this.customTests];
        this.state = this.loadState();
        
        this.isOpen = true; 
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initUI());
        } else {
            this.initUI();
        }
    }

    getDefaultTests() {
        return [
            // 🎨 UI & THEMES
            { id: 'ui_theme_border', category: 'UI', type: 'manual', desc: 'Preset theme buttons get the .active border after page reload.' },
            { id: 'ui_ghost_clear', category: 'UI', type: 'manual', desc: 'Engine ghost pieces and arrows clear when switching tabs.' },
            { id: 'ui_duck_render', category: 'UI', type: 'manual', desc: 'Duck renders accurately based on engine memory.' },
            
            // 🎬 ANIMATIONS
            { id: 'anim_forward', category: 'Animations', type: 'manual', desc: 'Keyboard Right-Arrow smoothly slides piece forward.' },
            { id: 'anim_backward', category: 'Animations', type: 'manual', desc: 'Keyboard Left-Arrow smoothly slides piece backward.' },
            { id: 'anim_swarm', category: 'Animations', type: 'manual', desc: 'Go-To-Start button triggers the 500ms swarm animation.' },
            { id: 'anim_tails', category: 'Animations', type: 'manual', desc: 'Manga tails render correctly with blue/red color awareness.' },
            { id: 'anim_puzzle_rush', category: 'Animations', type: 'manual', desc: '3min/5min Puzzles SKIP sliding but KEEP manga tails.' },

            // ⚙️ ENGINE & EVAL
            { id: 'eng_eval_bar', category: 'Engine', type: 'manual', desc: 'Eval bar locks to 100% or 0% during Mate (M#) without bouncing.' },
            { id: 'eng_crazyhouse', category: 'Engine', type: 'manual', desc: 'Crazyhouse drops (@) draw ghost pieces correctly.' },
            { id: 'eng_fairy_duck', category: 'Engine', type: 'manual', desc: 'Fairy-Stockfish duck moves (b7e4,e4f3) parse the duck square accurately.' },

            // 🧩 PUZZLES
            { id: 'puz_setup_anim', category: 'Puzzles', type: 'manual', desc: 'The setup move of a puzzle smoothly animates instead of teleporting.' },
            { id: 'puz_flip', category: 'Puzzles', type: 'manual', desc: 'Board automatically flips if playing as Black.' },

            // 🤖 AUTO-CHECKS
            { 
                id: 'auto_app_loaded', category: 'System (Auto)', type: 'auto', 
                desc: 'window.app and window.app.game are successfully initialized.',
                run: () => typeof window.app !== 'undefined' && typeof window.app.game !== 'undefined'
            },
            { 
                id: 'auto_engine_loaded', category: 'System (Auto)', type: 'auto', 
                desc: 'Fairy/Stockfish engine is loaded and responsive.',
                run: () => typeof window.app !== 'undefined' && window.app.game.getReader().mode !== undefined
            }
        ];
    }

    loadState() {
        const saved = localStorage.getItem(this.storageKey);
        const state = saved ? (JSON.parse(saved) || {}) : {};
        
        // Ensure all loaded tests exist in the state object
        this.tests.forEach(t => {
            if (!state[t.id]) state[t.id] = { passed: false, note: '' };
        });
        return state;
    }

    saveState() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.state));
        this.updateProgressBar();
    }

    initUI() {
        this.injectCSS();
        const container = document.createElement('div');
        container.id = 'qa-panel';
        
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

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'q') {
                container.style.display = container.style.display === 'none' ? 'flex' : 'none';
            }
        });

        document.getElementById('qa-toggle-btn').onclick = (e) => {
            e.stopPropagation(); 
            this.togglePanel();
        };
        
        document.getElementById('qa-run-auto').onclick = () => this.runAutoChecks();
        
        // ✨ NEW: Add Custom Test Click Handler
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

        // Auto-assign the ID and format
        const newTest = {
            id: 'custom_' + Date.now(),
            category: 'User Added',
            type: 'manual',
            desc: desc
        };

        // Save to internal arrays
        this.customTests.push(newTest);
        this.tests.push(newTest);
        this.state[newTest.id] = { passed: false, note: '' };

        // Write to localStorage
        localStorage.setItem(this.customKey, JSON.stringify(this.customTests));
        this.saveState();

        // Refresh UI
        input.value = '';
        this.renderList();
        
        // Scroll to bottom so they see it
        const contentDiv = document.getElementById('qa-content');
        contentDiv.scrollTop = contentDiv.scrollHeight;
    }

    deleteCustomTest(id) {
        if (!confirm("Delete this custom test?")) return;
        
        // Remove from arrays and memory
        this.customTests = this.customTests.filter(t => t.id !== id);
        this.tests = this.tests.filter(t => t.id !== id);
        delete this.state[id];

        // Update localStorage
        localStorage.setItem(this.customKey, JSON.stringify(this.customTests));
        this.saveState();

        // Refresh UI
        this.renderList();
    }

    initDraggable(panel, header) {
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        header.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            isDragging = true;
            header.style.cursor = 'grabbing';

            const rect = panel.getBoundingClientRect();
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            panel.style.left = rect.left + 'px';
            panel.style.top = rect.top + 'px';

            startX = e.clientX;
            startY = e.clientY;
            initialLeft = rect.left;
            initialTop = rect.top;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        const onMouseMove = (e) => {
            if (!isDragging) return;
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

                const item = document.createElement('div');
                item.className = `qa-item ${isPassed ? 'passed' : ''}`;
                
                let checkHTML = test.type === 'manual' 
                    ? `<input type="checkbox" class="qa-checkbox" data-id="${test.id}" ${isPassed ? 'checked' : ''}>`
                    : `<span class="qa-auto-icon" id="auto-icon-${test.id}">${isPassed ? '✅' : '⚙️'}</span>`;

                // ✨ NEW: Delete button only shows up on tests you added manually
                let deleteHTML = test.id.startsWith('custom_') 
                    ? `<button class="qa-delete-custom" data-id="${test.id}" style="background:none; border:none; color:#fa412d; cursor:pointer; font-size:14px; padding:0 5px;" title="Delete Test">✖</button>` 
                    : ``;

                item.innerHTML = `
                    <div style="display:flex; align-items:flex-start; gap: 10px;">
                        ${checkHTML}
                        <div style="flex-grow:1;">
                            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                                <div class="qa-desc">${test.desc}</div>
                                ${deleteHTML}
                            </div>
                            <textarea class="qa-note" data-id="${test.id}" placeholder="Bug notes...">${note}</textarea>
                        </div>
                    </div>
                `;
                this.listEl.appendChild(item);
            });
        });

        // BINDINGS
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

        document.querySelectorAll('.qa-delete-custom').forEach(btn => {
            btn.onclick = (e) => this.deleteCustomTest(e.target.dataset.id);
        });
    }

    runAutoChecks() {
        this.tests.filter(t => t.type === 'auto').forEach(test => {
            try {
                const result = test.run();
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
        const passed = Object.values(this.state).filter(s => s.passed).length;
        const pct = Math.round((passed / total) * 100) || 0;
        
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
            .qa-desc { font-size: 13px; line-height: 1.4; margin-bottom: 8px; color:#e2e8f0; word-break: break-word; }
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