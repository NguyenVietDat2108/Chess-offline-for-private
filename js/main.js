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
    // 2. Initialize Engine (Calls the function we added to ChessGame.js)
    // Passing null loads the default 'stockfish-17.1-8e4d048.js'
    window.game.initEngine(null, null);

    // 3. Initialize UI
    window.ui.init();
});