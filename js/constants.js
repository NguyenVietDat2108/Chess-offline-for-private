export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
export const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];
export const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
export const VARIANT_STARTING_FENS = {
    'classical': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'chess960': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    '3check': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 +0+0',
    'antichess': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1',
    'atomic': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'bughouse': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1',
    'chaturanga': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'crazyhouse': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1',
    'duck': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'horde': 'rnbqkbnr/pppppppp/8/1PP2PP1/PPPPPPPP/PPPPPPPP/PPPPPPPP/PPPPPPPP w kq - 0 1',
    'kingofthehill': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'racingkings': '8/8/8/8/8/8/krbnNBRK/qrbnNBRQ w - - 0 1',
    'placement': '8/8/8/8/8/8/8/8[RNBQKBNRPPPPPPPPrnbqkbnrpppppppp] w KQkq - 0 1',
    'alice': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'spell': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
};
export const nnueMap = {
    '3check': '3check-cb5f517c228b.nnue',
    'antichess': 'antichess-dd3cbe53cd4e.nnue',
    'atomic': 'atomic-2cf13ff256cc.nnue',
    'bughouse': 'bughouse-cd8cceab93fe.nnue',
    'chaturanga': 'chaturanga-1889e98f8d54.nnue',
    'crazyhouse': 'crazyhouse-8ebf84784ad2.nnue',
    'duck': 'duck-ba21f91f5d81.nnue',
    'horde': 'horde-28173ddccabe.nnue',
    'kingofthehill': 'kingofthehill-978b86d0e6a4.nnue',
    'racingkings': 'racingkings-636b95f085e3.nnue',
    'placement': 'nn-46832cfbead3.nnue',
    'alice': 'nn-46832cfbead3.nnue',
    'spell': 'nn-46832cfbead3.nnue'
};
export const ICON_BOOK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="30" height="30" style="vertical-align: middle;"><circle cx="12" cy="12" r="10.5" fill="currentColor"/><g transform=" translate(12, 12) scale(0.75) translate(-12, -12)"><path fill="#f0dec3" d="M17,7 c-2,0 -3.5,1 -4,2 h-2 c-0.5,-1 -2,-2 -4,-2 c-2,0 -3,1 -3,1 v10 c0,0 1,-1 3,-1 c2,0 3.5,1 4,1 h2 c0.5,0 2,-1 4,-1 c2,0 3,1 3,1 V8 C20,8 19,7 17,7 z"/><path fill="#7a5533" d="M11.5,9 h1 v9 h-1 V9 z" /></g></svg>`;
export const BOOK_ICON_IMG = new Image();
BOOK_ICON_IMG.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(ICON_BOOK_SVG);
export const BOOK_ICON_SVG_IMG_BLUE = new Image();
export const ICON_BOOK_SVG_IMG_BLUE = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-book-open w-8 h-8 text-[var(--cyan-500)]" aria-hidden="true"><path d="M12 7v14"></path><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path></svg>';
BOOK_ICON_SVG_IMG_BLUE.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(ICON_BOOK_SVG_IMG_BLUE);
export const ICON_SETTING_SVG = `<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12.01 2.25c.74 0 1.47.1 2.18.25.32.07.55.33.59.65l.17 1.53a1.38 1.38 0 001.92 1.11l1.4-.61c.3-.13.64-.06.85.17a9.8 9.8 0 012.2 3.8c.1.3 0 .63-.26.82l-1.24.92a1.38 1.38 0 000 2.22l1.24.92c.26.19.36.52.27.82a9.8 9.8 0 01-2.2 3.8.75.75 0 01-.85.17l-1.4-.62a1.38 1.38 0 00-1.93 1.12l-.17 1.52a.75.75 0 01-.58.65 9.52 9.52 0 01-4.4 0 .75.75 0 01-.57-.65l-.17-1.52a1.38 1.38 0 00-1.93-1.11l-1.4.62a.75.75 0 01-.85-.18 9.8 9.8 0 01-2.2-3.8c-.1-.3 0-.63.27-.82l1.24-.92a1.38 1.38 0 000-2.22l-1.24-.92a.75.75 0 01-.28-.82 9.8 9.8 0 012.2-3.8c.23-.23.57-.3.86-.17l1.4.62c.4.17.86.15 1.25-.08.38-.22.63-.6.68-1.04l.17-1.53a.75.75 0 01.58-.65c.72-.16 1.45-.24 2.2-.25zm0 1.5c-.45 0-.9.04-1.35.12l-.11.97a2.89 2.89 0 01-4.02 2.33l-.9-.4A8.3 8.3 0 004.28 9.1l.8.59a2.88 2.88 0 010 4.64l-.8.59a8.3 8.3 0 001.35 2.32l.9-.4a2.88 2.88 0 014.02 2.32l.1.99c.9.15 1.8.15 2.7 0l.1-.99a2.88 2.88 0 014.02-2.32l.9.4a8.3 8.3 0 001.36-2.32l-.8-.59a2.88 2.88 0 010-4.64l.8-.59a8.3 8.3 0 00-1.35-2.32l-.9.4a2.88 2.88 0 01-4.02-2.32l-.11-.98c-.45-.08-.9-.11-1.34-.12zM12 8.25a3.75 3.75 0 110 7.5 3.75 3.75 0 010-7.5zm0 1.5a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5z"></path></svg>`;

export const SETTINGS_ICON_IMG = new Image();
SETTINGS_ICON_IMG.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(ICON_SETTING_SVG);
