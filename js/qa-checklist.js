/**
 * QA Checklist Tracker
 * A plug-and-play testing suite for the Chess Application.
 */

class QATracker {
    constructor() {
        this.storageKey = 'chess_qa_state';
        this.tests = this.getDefaultTests();
        this.state = this.loadState();
        this.isOpen = false;
        
        // Wait for DOM to build the UI
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

            // 🤖 AUTO-CHECKS (Code that checks itself)
            { 
                id: 'auto_app_loaded', 
                category: 'System (Auto)', 
                type: 'auto', 
                desc: 'window.app and window.app.game are successfully initialized.',
                run: () => typeof window.app !== 'undefined' && typeof window.app.game !== 'undefined'
            },
            { 
                id: 'auto_engine_loaded', 
                category: 'System (Auto)', 
                type: 'auto', 
                desc: 'Fairy/Stockfish engine is loaded and responsive.',
                run: () => typeof window.app !== 'undefined' && window.app.game.getReader().mode !== undefined
            }
        ];
    }

    loadState() {
        const saved = localStorage.getItem(this.storageKey);
        if (saved) {
            try { return JSON.parse(saved); } catch(e) {}
        }
        // Initialize empty state mapping
        const state = {};
        this.tests.forEach(t => state[t.id] = { passed: false, note: '' });
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
        container.innerHTML = `
            <div id="qa-header">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span>🧪 QA Testing Checklist</span>
                    <span id="qa-progress-text">0%</span>
                </div>
                <button id="qa-toggle-btn">▲</button>
            </div>
            <div id="qa-progress-bar"><div id="qa-progress-fill"></div></div>
            <div id="qa-content">
                <div style="padding: 10px; display:flex; gap: 10px;">
                    <button id="qa-run-auto" class="qa-btn">Run Auto-Checks</button>
                    <button id="qa-reset" class="qa-btn danger">Reset All</button>
                </div>
                <div id="qa-list"></div>
            </div>
        `;
        document.body.appendChild(container);

        this.listEl = document.getElementById('qa-list');
        this.renderList();
        this.updateProgressBar();

        // Bind Events
        document.getElementById('qa-toggle-btn').onclick = () => this.togglePanel();
        document.getElementById('qa-run-auto').onclick = () => this.runAutoChecks();
        document.getElementById('qa-reset').onclick = () => {
            if (confirm("Reset all QA test data?")) {
                localStorage.removeItem(this.storageKey);
                this.state = this.loadState();
                this.renderList();
                this.updateProgressBar();
            }
        };
    }

    renderList() {
        this.listEl.innerHTML = '';
        
        // Group by category
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
                
                let checkHTML = '';
                if (test.type === 'manual') {
                    checkHTML = `<input type="checkbox" class="qa-checkbox" data-id="${test.id}" ${isPassed ? 'checked' : ''}>`;
                } else {
                    checkHTML = `<span class="qa-auto-icon" id="auto-icon-${test.id}">${isPassed ? '✅' : '⚙️'}</span>`;
                }

                item.innerHTML = `
                    <div style="display:flex; align-items:flex-start; gap: 10px;">
                        ${checkHTML}
                        <div style="flex-grow:1;">
                            <div class="qa-desc">${test.desc}</div>
                            <textarea class="qa-note" data-id="${test.id}" placeholder="Bug notes...">${note}</textarea>
                        </div>
                    </div>
                `;
                this.listEl.appendChild(item);
            });
        });

        // Bind Checkboxes and Textareas
        document.querySelectorAll('.qa-checkbox').forEach(cb => {
            cb.onchange = (e) => {
                const id = e.target.dataset.id;
                this.state[id].passed = e.target.checked;
                e.target.closest('.qa-item').classList.toggle('passed', e.target.checked);
                this.saveState();
            };
        });

        document.querySelectorAll('.qa-note').forEach(ta => {
            ta.oninput = (e) => {
                const id = e.target.dataset.id;
                this.state[id].note = e.target.value;
                this.saveState();
            };
        });
    }

    runAutoChecks() {
        const autoTests = this.tests.filter(t => t.type === 'auto');
        autoTests.forEach(test => {
            try {
                const result = test.run();
                this.state[test.id].passed = result;
                
                const icon = document.getElementById(`auto-icon-${test.id}`);
                const item = icon.closest('.qa-item');
                
                if (result) {
                    icon.innerText = '✅';
                    item.classList.add('passed');
                    item.classList.remove('failed');
                } else {
                    icon.innerText = '❌';
                    item.classList.add('failed');
                    item.classList.remove('passed');
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
            panel.style.bottom = '20px';
            btn.innerText = '▼';
        } else {
            panel.style.bottom = '-400px';
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
                position: fixed; right: 20px; bottom: -400px; width: 350px; height: 440px;
                background: #1e293b; color: #f8fafc; border: 1px solid #334155; border-radius: 8px 8px 0 0;
                box-shadow: 0 -5px 25px rgba(0,0,0,0.5); font-family: 'Segoe UI', sans-serif; z-index: 10000;
                display: flex; flex-direction: column; transition: bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            #qa-header {
                padding: 10px 15px; background: #0f172a; border-radius: 8px 8px 0 0; border-bottom: 1px solid #334155;
                display: flex; justify-content: space-between; align-items: center; font-weight: bold; cursor: pointer;
            }
            #qa-toggle-btn { background: none; border: none; color: #38bdf8; cursor: pointer; font-size: 12px; }
            #qa-progress-bar { height: 4px; background: #334155; width: 100%; }
            #qa-progress-fill { height: 100%; background: #26c2a3; width: 0%; transition: width 0.3s; }
            #qa-content { flex-grow: 1; overflow-y: auto; padding-bottom: 10px; }
            .qa-btn { background: #38bdf8; color: #000; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px; }
            .qa-btn.danger { background: #fa412d; color: #fff; }
            .qa-category { background: #334155; padding: 5px 10px; font-size: 11px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px; margin-top: 10px; color: #94a3b8; }
            .qa-item { padding: 10px; border-bottom: 1px solid #334155; transition: background 0.2s; }
            .qa-item.passed { background: rgba(38, 194, 163, 0.1); }
            .qa-item.failed { background: rgba(250, 65, 45, 0.1); }
            .qa-desc { font-size: 13px; line-height: 1.4; margin-bottom: 5px; }
            .qa-note { width: 100%; background: #0f172a; color: #cbd5e1; border: 1px solid #475569; border-radius: 4px; padding: 5px; font-size: 12px; resize: vertical; min-height: 40px; }
            .qa-note:focus { outline: none; border-color: #38bdf8; }
            .qa-checkbox { width: 18px; height: 18px; cursor: pointer; margin-top: 2px; }
            .qa-auto-icon { font-size: 16px; margin-top: 2px; }
            /* Custom Scrollbar */
            #qa-content::-webkit-scrollbar { width: 6px; }
            #qa-content::-webkit-scrollbar-track { background: #1e293b; }
            #qa-content::-webkit-scrollbar-thumb { background: #475569; border-radius: 3px; }
        `;
        document.head.appendChild(style);
    }
}

// Expose to window so we can add tests dynamically if needed
window.QATracker = new QATracker();

/**
 * You can add new Auto-Checks from anywhere in your code like this:
 * * window.QATracker.tests.push({
 * id: 'check_pgn_export',
 * category: 'System (Auto)',
 * type: 'auto',
 * desc: 'Checks if game outputs a string for PGN export',
 * run: () => typeof window.app.game.exportChapterPgn() === 'string'
 * });
 */