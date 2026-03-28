import { ChessGame } from './ChessGame.js';
import { UI } from './UI.js';
import { BoardScanner } from './scan.js';
window.sfWorker = null;
window.engineAnalysing = false;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Create Instances
    window.game = new ChessGame();
    window.ui = new UI();
    window.boardScanner = new BoardScanner();

    // 2. Initialize UI 
    window.ui.init();
    
    // 3. Find the last played variant
    const lastVariant = localStorage.getItem('chess_last_variant') || 'classical';
    
    // Update the dropdown UI to match the saved variant
    const variantSelect = document.getElementById('analysisVariantSelect');
    if (variantSelect) {
        variantSelect.value = lastVariant;
    }
    requestAnimationFrame(() => {
        setTimeout(() => {
            if (window.game) {
                window.game.setGameMode(lastVariant, true);
            }
        }, 200);
    });
});

// 🔥 AUTO-SAVE WHEN USER CLOSES OR RELOADS THE TAB
window.addEventListener('beforeunload', () => {
    if (window.game && window.game.gameMode) {
        window.game.saveVariantState(window.game.gameMode);
    }
});