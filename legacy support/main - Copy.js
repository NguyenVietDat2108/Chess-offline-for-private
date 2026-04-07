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

        // ✨ DEPENDENCY INJECTION: They are now connected privately!
        this.game.setUI(this.ui);
        this.ui.setGame(this.game);

        this.ui.init();
        
        const lastVariant = localStorage.getItem('chess_last_variant') || 'classical';
        const variantSelect = document.getElementById('analysisVariantSelect');
        if (variantSelect) variantSelect.value = lastVariant;
        
        requestAnimationFrame(() => {
            setTimeout(() => {
                if (this.game) this.game.setGameMode(lastVariant, true);
            }, 200);
        });
    }
}

// Boot the app and expose it ONCE for index.html buttons
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ChessApp();

    window.addEventListener('beforeunload', () => {
        if (window.app.game && window.app.game.gameMode) {
            window.app.game.saveVariantState(window.app.game.gameMode);
        }
    });
});