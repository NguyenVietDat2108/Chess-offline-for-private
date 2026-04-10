//This file is a customized chess.js file that respect the ES5 architecture but optimized for normal chess and support multiple variants such as:
//'chess960','3check','antichess','atomic','bughouse','chaturanga','crazyhouse','duck','horde','kingofthehill','racingkings','alice'
//history[] is left null since it is handled in chessgame.js which also handle engine games pv lines when Load_pgn, thus putting at here seems unreasonable.

var Chess = function(fen, gameMode = 'classical') {
    function log(ctx, msg) { console.log(`%c[${ctx}]`, "color: #0ff; font-weight: bold;", msg); }
    function error(ctx, msg) { console.error(`%c[${ctx}]`, "color: #f00; font-weight: bold;", msg); }

    const WHITE = 0, BLACK = 1;
    const PAWN = 0, KNIGHT = 1, BISHOP = 2, ROOK = 3, QUEEN = 4, KING = 5;
    const PIECE_TO_CHAR = ['p', 'n', 'b', 'r', 'q', 'k'];
    const CHAR_TO_PIECE = { p:0, n:1, b:2, r:3, q:4, k:5 };
    const BITS = { NORMAL: 1, CAPTURE: 2, BIG_PAWN: 4, EP_CAPTURE: 8, PROMOTION: 16, KSIDE_CASTLE: 32, QSIDE_CASTLE: 64, DROP: 128 };
    const SQ_STR = [
        "a1", "b1", "c1", "d1", "e1", "f1", "g1", "h1", "a2", "b2", "c2", "d2", "e2", "f2", "g2", "h2",
        "a3", "b3", "c3", "d3", "e3", "f3", "g3", "h3", "a4", "b4", "c4", "d4", "e4", "f4", "g4", "h4",
        "a5", "b5", "c5", "d5", "e5", "f5", "g5", "h5", "a6", "b6", "c6", "d6", "e6", "f6", "g6", "h6",
        "a7", "b7", "c7", "d7", "e7", "f7", "g7", "h7", "a8", "b8", "c8", "d8", "e8", "f8", "g8", "h8"
    ];
    const SLIDER_OUT = {lo: 0, hi: 0};
    var currentState = null;
    var history = []; 
    const STATE_POOL = [];
    const MASKS_LO = new Int32Array(64), MASKS_HI = new Int32Array(64);
    const FILE_MASKS_LO = new Int32Array(8), FILE_MASKS_HI = new Int32Array(8);
    const KNIGHT_LO = new Int32Array(64), KNIGHT_HI = new Int32Array(64);
    const KING_LO = new Int32Array(64), KING_HI = new Int32Array(64);
    const PAWN_LO = [new Int32Array(64), new Int32Array(64)];
    const PAWN_HI = [new Int32Array(64), new Int32Array(64)];
    const BETWEEN_LO = new Int32Array(4096), BETWEEN_HI = new Int32Array(4096);
    const ALIGNED = new Uint8Array(4096);

    (function init_tables() {
        for (let i = 0; i < 64; i++) {
            if (i < 32) { MASKS_LO[i] = (1 << i); MASKS_HI[i] = 0; }
            else { MASKS_LO[i] = 0; MASKS_HI[i] = (1 << (i - 32)); }
        }
        for (let f = 0; f < 8; f++) {
            let lo = 0, hi = 0;
            for (let r = 0; r < 8; r++) {
                let sq = r * 8 + f;
                if (sq < 32) lo |= (1 << sq); else hi |= (1 << (sq - 32));
            }
            FILE_MASKS_LO[f] = lo; FILE_MASKS_HI[f] = hi;
        }
        const set_bit = (obj, sq) => { if(sq<32) obj.lo |= (1<<sq); else obj.hi |= (1<<(sq-32)); };
        for (let i = 0; i < 64; i++) {
            let r = i >> 3, f = i & 7;
            let k = {lo:0, hi:0}, n = {lo:0, hi:0};
            [[r+1,f],[r-1,f],[r,f+1],[r,f-1],[r+1,f+1],[r+1,f-1],[r-1,f+1],[r-1,f-1]].forEach(x=>{
                if(x[0]>=0&&x[0]<8&&x[1]>=0&&x[1]<8) set_bit(k, x[0]*8+x[1]);
            });
            KING_LO[i]=k.lo; KING_HI[i]=k.hi;
            [[r+2,f+1],[r+2,f-1],[r-2,f+1],[r-2,f-1],[r+1,f+2],[r+1,f-2],[r-1,f+2],[r-1,f-2]].forEach(x=>{
                if(x[0]>=0&&x[0]<8&&x[1]>=0&&x[1]<8) set_bit(n, x[0]*8+x[1]);
            });
            KNIGHT_LO[i]=n.lo; KNIGHT_HI[i]=n.hi;
            let wp = {lo:0, hi:0}, bp = {lo:0, hi:0};
            if(r<7) { if(f>0) set_bit(wp, i+7); if(f<7) set_bit(wp, i+9); }
            if(r>0) { if(f>0) set_bit(bp, i-9); if(f<7) set_bit(bp, i-7); }
            PAWN_LO[WHITE][i]=wp.lo; PAWN_HI[WHITE][i]=wp.hi;
            PAWN_LO[BLACK][i]=bp.lo; PAWN_HI[BLACK][i]=bp.hi;
        }
        for (let i = 0; i < 64; i++) {
            for (let j = 0; j < 64; j++) {
                let idx = i * 64 + j;
                let r1=i>>3, f1=i&7, r2=j>>3, f2=j&7;
                let dr = r2-r1, df = f2-f1;
                let aligned = (r1===r2 || f1===f2 || Math.abs(dr)===Math.abs(df));
                ALIGNED[idx] = aligned ? 1 : 0;
                if (aligned && Math.max(Math.abs(dr), Math.abs(df)) > 1) {
                    let stepR = Math.sign(dr), stepF = Math.sign(df);
                    let currR = r1 + stepR, currF = f1 + stepF;
                    while (currR !== r2 || currF !== f2) {
                        let sq = currR * 8 + currF;
                        if(sq<32) BETWEEN_LO[idx] |= (1<<sq); else BETWEEN_HI[idx] |= (1<<(sq-32));
                        currR += stepR; currF += stepF;
                    }
                }
            }
        }
    })();

    function ctz(lo, hi) {
        if (lo !== 0) return 31 - Math.clz32(lo & -lo);
        return 32 + (31 - Math.clz32(hi & -hi));
    }
    function str_to_sq(s) { return (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97); }
    function sq_str(sq) { return SQ_STR[sq]; }
    
    function get_slider_attacks(type, sq, occL, occH) {
        let lo=0, hi=0;
        let r = sq >> 3, f = sq & 7;
        const dirs = (type===ROOK) ? [[0,1],[0,-1],[1,0],[-1,0]] : 
                     (type===BISHOP) ? [[1,1],[1,-1],[-1,1],[-1,-1]] : 
                     [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
        for(let i=0; i<dirs.length; i++) {
            let cr=r+dirs[i][0], cf=f+dirs[i][1];
            while(cr>=0&&cr<8&&cf>=0&&cf<8) {
                let s = cr*8+cf;
                let isLo = s<32;
                let mask = isLo ? (1<<s) : (1<<(s-32));
                if(isLo) lo|=mask; else hi|=mask;
                if(isLo ? (occL&mask) : (occH&mask)) break;
                cr+=dirs[i][0]; cf+=dirs[i][1];
            }
        }
        return {lo:lo, hi:hi}; // V8 handles this instantly via Escape Analysis
    }

    function create_empty_state() {
        return { 
            bb_lo: new Int32Array(12), 
            bb_hi: new Int32Array(12), 
            board: new Int8Array(64).fill(-1), 
            turn: WHITE, 
            castling: 0, 
            ep_square: -1, 
            half_moves: 0, 
            move_number: 1, 
            gameMode: 'classical',
            checks: { w: 0, b: 0 },         
            pocket: { w: [], b: [] },       
            promoted: { lo: 0, hi: 0 },     
            duck_sq: -1,                    
            alice_b: { lo: 0, hi: 0 }       // ✨ ALICE CHESS: The Looking Glass Tracker
        };
    }
    function clone_state(s) {
        var c = STATE_POOL.pop();
        if (!c) {
            c = {
                bb_lo: new Int32Array(12),
                bb_hi: new Int32Array(12),
                board: new Int8Array(64)
            };
        }
        
        c.bb_lo.set(s.bb_lo);
        c.bb_hi.set(s.bb_hi);
        c.board.set(s.board);
        
        c.turn = s.turn;
        c.castling = s.castling;
        c.ep_square = s.ep_square;
        c.half_moves = s.half_moves;
        c.move_number = s.move_number;
        c.gameMode = s.gameMode;
        
        if (s.gameMode !== 'classical' && s.gameMode !== 'chess960') {
            c.checks = { w: s.checks.w, b: s.checks.b };
            c.pocket = { w: [...s.pocket.w], b: [...s.pocket.b] };
            c.promoted = s.promoted ? { lo: s.promoted.lo, hi: s.promoted.hi } : { lo: 0, hi: 0 }; 
            c.duck_sq = s.duck_sq;
            c.alice_b = s.alice_b ? { lo: s.alice_b.lo, hi: s.alice_b.hi } : { lo: 0, hi: 0 };
        }
        if (s.gameMode === 'spell') {
            c.frozen = s.frozen ? { lo: s.frozen.lo, hi: s.frozen.hi } : { lo: 0, hi: 0 };
            c.jump_sq = s.jump_sq !== undefined ? s.jump_sq : -1;
            c.mana = s.mana ? { 
                w: { freeze: s.mana.w.freeze, jump: s.mana.w.jump }, 
                b: { freeze: s.mana.b.freeze, jump: s.mana.b.jump } 
            } : { w: {freeze: 0, jump: 0}, b: {freeze: 0, jump: 0} }; // 0 means READY
            c.active_spells = s.active_spells ? { 
                frozen_timer: s.active_spells.frozen_timer, 
                jump_timer: s.active_spells.jump_timer 
            } : { frozen_timer: 0, jump_timer: 0 };
        }
        return c;
    }
    function load_fen(fen, setGameMode = 'classical') {
        var s = create_empty_state();
        s.gameMode = setGameMode; 
        var tokens = fen.split(/\s+/);
        var boardToken = tokens[0];
        if ((setGameMode === 'crazyhouse' || setGameMode === 'bughouse' || setGameMode === 'placement') && boardToken.includes('[')) {
            var parts = boardToken.split('[');
            boardToken = parts[0];
            var pocketStr = parts[1].replace(']', '');
            for (var i = 0; i < pocketStr.length; i++) {
                var c = pocketStr.charAt(i);
                s.pocket[c === c.toUpperCase() ? 'w' : 'b'].push(CHAR_TO_PIECE[c.toLowerCase()]);
            }
            tokens[0] = boardToken; 
        }
        var sq = 56;
        
        for (var i = 0; i < tokens[0].length; i++) {
            var c = tokens[0].charAt(i);
            if (c === '/') {
                sq -= 16; 
            } else if (/\d/.test(c)) {
                sq += parseInt(c);
            } else if (c === '*') {
                if (setGameMode === 'duck') s.duck_sq = sq;
                sq++;
            } else if (c === '~') {
                let prevSq = sq - 1;
                if (prevSq >= 0 && prevSq < 64) {
                    if (setGameMode === 'crazyhouse') {
                        if (prevSq < 32) s.promoted.lo |= (1<<prevSq); else s.promoted.hi |= (1<<(prevSq-32));
                    } else if (setGameMode === 'alice') {
                        if (prevSq < 32) s.alice_b.lo |= (1<<prevSq); else s.alice_b.hi |= (1<<(prevSq-32));
                    }
                }
            } else {
                var col = (c < 'a') ? WHITE : BLACK;
                var typ = CHAR_TO_PIECE[c.toLowerCase()];
                if (sq>=0 && sq<64) {
                    if (sq<32) s.bb_lo[col*6+typ] |= (1<<sq); else s.bb_hi[col*6+typ] |= (1<<(sq-32));
                    s.board[sq] = (col << 3) | typ;
                }
                sq++;
            }
        }
        
        s.turn = (tokens[1] === 'w') ? WHITE : BLACK;
        s.castling = 0;
        if (tokens[2].includes('K')) s.castling |= 1; if (tokens[2].includes('Q')) s.castling |= 2;
        if (tokens[2].includes('k')) s.castling |= 4; if (tokens[2].includes('q')) s.castling |= 8;
        s.ep_square = (tokens[3] === '-' || !tokens[3]) ? -1 : str_to_sq(tokens[3]);
        
        s.half_moves = parseInt(tokens[4]||0); 
        s.move_number = parseInt(tokens[5]||1);
        
        if (setGameMode === 'duck' && tokens.length >= 7) {
            if (isNaN(parseInt(tokens[4]))) {
                s.duck_sq = (tokens[4] === '-') ? -1 : str_to_sq(tokens[4]);
                s.half_moves = parseInt(tokens[5]||0);
                s.move_number = parseInt(tokens[6]||1);
            } else {
                s.duck_sq = (tokens[6] === '-') ? -1 : str_to_sq(tokens[6]);
            }
        }
        
        if (s.ep_square !== -1) {
            let capSq = (s.turn === WHITE) ? s.ep_square - 8 : s.ep_square + 8;
            let pawn = (s.turn === WHITE) ? (BLACK*6 + PAWN) : (WHITE*6 + PAWN);
            let mask = (capSq<32) ? (1<<capSq) : (1<<(capSq-32));
            if (!((capSq<32 ? s.bb_lo[pawn] : s.bb_hi[pawn]) & mask)) s.ep_square = -1;
        }
        
        if (s.gameMode === '3check') {
            let checkMatch = fen.match(/\+(\d+)\+(\d+)/);
            if (checkMatch) {
                s.checks.w = parseInt(checkMatch[1], 10);
                s.checks.b = parseInt(checkMatch[2], 10);
            }
        }
        
        // ✨ SPELL CHESS FEN PARSER: Restore the Mana and Ice Blocks!
        if (s.gameMode === 'spell') {
            let spellMatch = fen.match(/\[S:([^\]]+)\]/);
            if (spellMatch) {
                let p = spellMatch[1].split(',');
                s.frozen = { lo: parseInt(p[0]) || 0, hi: parseInt(p[1]) || 0 };
                s.mana = {
                    w: { freeze: parseInt(p[2]), jump: parseInt(p[3]) },
                    b: { freeze: parseInt(p[4]), jump: parseInt(p[5]) }
                };
            } else {
                s.frozen = { lo: 0, hi: 0 };
                s.mana = { w: {freeze: 2, jump: 2}, b: {freeze: 2, jump: 2} };
            }
        }
        
        return s;
    }
    
    function generate_fen(targetState) {
        var s = targetState || currentState; 
        var empty = 0, fen = ""; // ✨ V8 handles += extremely fast using internal ConsStrings!
        
        for (var r = 7; r >= 0; r--) {
            for (var f = 0; f < 8; f++) {
                var sq = r * 8 + f;
                var val = s.board[sq];
                
                if (s.gameMode === 'duck' && s.duck_sq === sq) {
                    if (empty > 0) { fen += empty; empty = 0; }
                    fen += '*';
                } else if (val === -1) {
                    empty++;
                } else {
                    if (empty > 0) { fen += empty; empty = 0; }
                    var char = PIECE_TO_CHAR[val & 7];
                    fen += ((val >> 3) === WHITE) ? char.toUpperCase() : char;
                    
                    if (s.gameMode === 'crazyhouse' && s.promoted && ((sq < 32) ? (s.promoted.lo & (1<<sq)) : (s.promoted.hi & (1<<(sq-32))))) {
                        fen += '~';
                    } else if (s.gameMode === 'alice' && s.alice_b && ((sq < 32) ? (s.alice_b.lo & (1<<sq)) : (s.alice_b.hi & (1<<(sq-32))))) {
                        fen += '~';
                    }
                } 
            }
            if (empty > 0) { fen += empty; empty = 0; }
            if (r > 0) fen += "/";
        }
        
        var c = "";
        if (s.castling & 1) c += "K"; if (s.castling & 2) c += "Q";
        if (s.castling & 4) c += "k"; if (s.castling & 8) c += "q";
        c = c || "-";
        
        var ep = (s.ep_square === -1) ? "-" : sq_str(s.ep_square);
        
        let finalFen = fen + " " + (s.turn === WHITE ? 'w' : 'b') + " " + c + " " + ep + " " + s.half_moves + " " + s.move_number;
        
        if (s.gameMode === 'crazyhouse' || s.gameMode === 'bughouse' || s.gameMode === 'placement') {
            var pocketStr = "";
            for (var i = 0; i < s.pocket.w.length; i++) pocketStr += PIECE_TO_CHAR[s.pocket.w[i]].toUpperCase();
            for (var i = 0; i < s.pocket.b.length; i++) pocketStr += PIECE_TO_CHAR[s.pocket.b[i]];
            if (pocketStr !== "") finalFen = finalFen.replace(fen, fen + "[" + pocketStr + "]");
        }
        if (s.gameMode === '3check') {
            finalFen += " +" + s.checks.w + "+" + s.checks.b;
        }
        if (s.gameMode === 'spell') {
            const frozL = s.frozen ? s.frozen.lo : 0;
            const frozH = s.frozen ? s.frozen.hi : 0;
            const wF = s.mana ? s.mana.w.freeze : 2;
            const wJ = s.mana ? s.mana.w.jump : 2;
            const bF = s.mana ? s.mana.b.freeze : 2;
            const bJ = s.mana ? s.mana.b.jump : 2;
            finalFen += ` [S:${frozL},${frozH},${wF},${wJ},${bF},${bJ}]`;
        }
        return finalFen;
    }
    function apply_standard_move(prevState, m) {
        var next = clone_state(prevState);
        var us = next.turn, them = us ^ 1;
        var from = m & 0x3F, to = (m >>> 6) & 0x3F;
        var flags = (m >>> 12) & 0x7F, promo = (m >>> 19) & 0x7;
        var p_type = (next.board[from] & 7); 

        if (from < 32) next.bb_lo[us*6+p_type] &= ~(1<<from); else next.bb_hi[us*6+p_type] &= ~(1<<(from-32));
        next.board[from] = -1;

        if (flags & BITS.CAPTURE) {
            var cap = (next.board[to] & 7);
            if (next.board[to] !== -1 && (next.board[to]>>3) === them) {
                if (to < 32) next.bb_lo[them*6+cap] &= ~(1<<to); else next.bb_hi[them*6+cap] &= ~(1<<(to-32));
            }
        } else if (flags & BITS.EP_CAPTURE) {
            var ep_sq = us===WHITE ? to-8 : to+8;
            if (ep_sq < 32) next.bb_lo[them*6+PAWN] &= ~(1<<ep_sq); else next.bb_hi[them*6+PAWN] &= ~(1<<(ep_sq-32));
            next.board[ep_sq] = -1;
        }

        if (flags & BITS.KSIDE_CASTLE || flags & BITS.QSIDE_CASTLE) {
            let isK = (flags & BITS.KSIDE_CASTLE);
            let k_to = us === WHITE ? (isK ? 6 : 2) : (isK ? 62 : 58); 
            let r_to = us === WHITE ? (isK ? 5 : 3) : (isK ? 61 : 59); 
            
            let rf = -1;
            // ✨ OPTIMIZED: Hardcode standard chess Rook castling squares!
            if (prevState.gameMode !== 'chess960') {
                rf = us === WHITE ? (isK ? 7 : 0) : (isK ? 63 : 56);
            } else {
                if (prevState.board[to] !== -1 && (prevState.board[to] & 7) === ROOK && (prevState.board[to] >> 3) === us) {
                    rf = to; 
                } else {
                    let startF = isK ? 7 : 0; let step = isK ? -1 : 1;
                    for(let f = startF; f >= 0 && f < 8; f += step) {
                        let sq = (us===WHITE?0:56) + f;
                        if(prevState.board[sq] === ((us<<3)|ROOK)) { rf = sq; break; }
                    }
                }
            }

            if (rf !== -1) {
                if(rf<32) next.bb_lo[us*6+ROOK] &= ~(1<<rf); else next.bb_hi[us*6+ROOK] &= ~(1<<(rf-32));
                next.board[rf] = -1;
            }
            if(k_to<32) next.bb_lo[us*6+KING] |= (1<<k_to); else next.bb_hi[us*6+KING] |= (1<<(k_to-32));
            next.board[k_to] = (us << 3) | KING;
            if(r_to<32) next.bb_lo[us*6+ROOK] |= (1<<r_to); else next.bb_hi[us*6+ROOK] |= (1<<(r_to-32));
            next.board[r_to] = (us << 3) | ROOK;
        } else {
            var placed = (flags & BITS.PROMOTION) ? promo : p_type;
            if (to < 32) next.bb_lo[us*6+placed] |= (1<<to); else next.bb_hi[us*6+placed] |= (1<<(to-32));
            next.board[to] = (us << 3) | placed;
        }

        next.turn ^= 1;
        next.ep_square = (flags & BITS.BIG_PAWN) ? ((us === WHITE) ? to - 8 : to + 8) : -1;
        if (p_type === PAWN || (flags & BITS.CAPTURE)) next.half_moves = 0; else next.half_moves++;
        if (us === BLACK) next.move_number++;

        if (p_type === KING) next.castling &= (us === WHITE) ? ~3 : ~12;
        
        // ✨ OPTIMIZED: Dynamic Rights Stripping (Standard chess doesn't need to scan for the king!)
        if (p_type === ROOK) {
            let file = from & 7, rank = from >> 3;
            if (prevState.gameMode !== 'chess960') {
                if (us === WHITE && rank === 0) {
                    if (file === 7) next.castling &= ~1; else if (file === 0) next.castling &= ~2;
                } else if (us === BLACK && rank === 7) {
                    if (file === 7) next.castling &= ~4; else if (file === 0) next.castling &= ~8;
                }
            } else {
                if (us === WHITE && rank === 0) {
                    let kSqL = prevState.bb_lo[WHITE*6+KING], kSqH = prevState.bb_hi[WHITE*6+KING];
                    let kFile = (kSqL || kSqH) ? (ctz(kSqL, kSqH) & 7) : 4;
                    if (file > kFile) next.castling &= ~1; else if (file < kFile) next.castling &= ~2;
                } else if (us === BLACK && rank === 7) {
                    let kSqL = prevState.bb_lo[BLACK*6+KING], kSqH = prevState.bb_hi[BLACK*6+KING];
                    let kFile = (kSqL || kSqH) ? (ctz(kSqL, kSqH) & 7) : 4;
                    if (file > kFile) next.castling &= ~4; else if (file < kFile) next.castling &= ~8;
                }
            }
        }
        if (flags & BITS.CAPTURE) {
            let file = to & 7, rank = to >> 3;
            if (prevState.gameMode !== 'chess960') {
                if (them === WHITE && rank === 0) {
                    if (file === 7) next.castling &= ~1; else if (file === 0) next.castling &= ~2;
                } else if (them === BLACK && rank === 7) {
                    if (file === 7) next.castling &= ~4; else if (file === 0) next.castling &= ~8;
                }
            } else {
                if (them === WHITE && rank === 0) {
                    let kSqL = prevState.bb_lo[WHITE*6+KING], kSqH = prevState.bb_hi[WHITE*6+KING];
                    let kFile = (kSqL || kSqH) ? (ctz(kSqL, kSqH) & 7) : 4;
                    if (file > kFile) next.castling &= ~1; else if (file < kFile) next.castling &= ~2;
                } else if (them === BLACK && rank === 7) {
                    let kSqL = prevState.bb_lo[BLACK*6+KING], kSqH = prevState.bb_hi[BLACK*6+KING];
                    let kFile = (kSqL || kSqH) ? (ctz(kSqL, kSqH) & 7) : 4;
                    if (file > kFile) next.castling &= ~4; else if (file < kFile) next.castling &= ~8;
                }
            }
        }
        if (next.gameMode === 'spell') {
            if (next.active_spells) {
                if (next.active_spells.frozen_timer > 0) {
                    next.active_spells.frozen_timer--;
                    if (next.active_spells.frozen_timer === 0) next.frozen = {lo: 0, hi: 0};
                }
                if (next.active_spells.jump_timer > 0) {
                    next.active_spells.jump_timer--;
                    if (next.active_spells.jump_timer === 0) next.jump_sq = -1;
                }
            }
            if (next.mana) {
                if (next.mana.w.freeze > 0) next.mana.w.freeze--;
                if (next.mana.w.jump > 0) next.mana.w.jump--;
                if (next.mana.b.freeze > 0) next.mana.b.freeze--;
                if (next.mana.b.jump > 0) next.mana.b.jump--;
            }
        }
        return next;
    }
    // --- VARIANT SIDE-EFFECT STUBS ---
    function apply_atomic_move(prevState, m) {
        var next = apply_standard_move(prevState, m);
        var flags = (m >>> 12) & 0x7F;
        var to = (m >>> 6) & 0x3F;
        
        // 🔥 ATOMIC FIX: Resolve the explosion on capture!
        if ((flags & BITS.CAPTURE) || (flags & BITS.EP_CAPTURE)) {
            var us = prevState.turn;
            var p_type = next.board[to] & 7;
            
            // 1. Remove the capturing piece (which is now at the 'to' square)
            if (p_type !== -1) {
                if (to < 32) next.bb_lo[us*6+p_type] &= ~(1<<to); else next.bb_hi[us*6+p_type] &= ~(1<<(to-32));
                next.board[to] = -1;
            }
            
            // 2. Explode all surrounding squares!
            var r = to >> 3, f = to & 7;
            var dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
            for(var i=0; i<8; i++) {
                var cr = r + dirs[i][0], cf = f + dirs[i][1];
                if (cr >= 0 && cr < 8 && cf >= 0 && cf < 8) {
                    var sq = cr * 8 + cf;
                    var p = next.board[sq];
                    // Pawns survive explosions! Everything else dies.
                    if (p !== -1 && (p & 7) !== PAWN) {
                        var col = p >> 3, typ = p & 7;
                        if (sq < 32) next.bb_lo[col*6+typ] &= ~(1<<sq); else next.bb_hi[col*6+typ] &= ~(1<<(sq-32));
                        next.board[sq] = -1;
                    }
                }
            }
        }
        return next;
    }
    function apply_crazyhouse_move(prevState, m) {
        var flags = (m >>> 12) & 0xFF;
        var us = prevState.turn;
        var to = (m >>> 6) & 0x3F;

        // 1. Handle Drops from Pocket
        if (flags & BITS.DROP) {
            var next = clone_state(prevState);
            var p_type = m & 0x3F; // For drops, 'from' holds the piece type
            
            var pocketStr = us === WHITE ? 'w' : 'b';
            var idx = next.pocket[pocketStr].indexOf(p_type);
            if (idx !== -1) next.pocket[pocketStr].splice(idx, 1);
            
            if (to < 32) next.bb_lo[us*6+p_type] |= (1<<to); else next.bb_hi[us*6+p_type] |= (1<<(to-32));
            next.board[to] = (us << 3) | p_type;
            
            next.turn ^= 1;
            next.ep_square = -1;
            if (p_type === PAWN) next.half_moves = 0; else next.half_moves++;
            if (us === BLACK) next.move_number++;
            return next;
        }

        // 2. Normal Moves & Captures
        var next = apply_standard_move(prevState, m);
        var from = m & 0x3F;
        
        // Track promoted pieces so they demote properly upon capture
        var isPromoted = false;
        if ((from < 32) ? (prevState.promoted.lo & (1<<from)) : (prevState.promoted.hi & (1<<(from-32)))) {
            isPromoted = true;
            if (from < 32) next.promoted.lo &= ~(1<<from); else next.promoted.hi &= ~(1<<(from-32));
            if (to < 32) next.promoted.lo |= (1<<to); else next.promoted.hi |= (1<<(to-32));
        }
        if (flags & BITS.PROMOTION) {
            if (to < 32) next.promoted.lo |= (1<<to); else next.promoted.hi |= (1<<(to-32));
        }

        // Handle Captures -> Pocket
        if (flags & BITS.CAPTURE || flags & BITS.EP_CAPTURE) {
            var cap_sq = (flags & BITS.EP_CAPTURE) ? ((us === WHITE) ? to - 8 : to + 8) : to;
            var cap_piece = prevState.board[cap_sq] & 7;
            
            var capPromoted = (cap_sq < 32) ? (prevState.promoted.lo & (1<<cap_sq)) : (prevState.promoted.hi & (1<<(cap_sq-32)));
            if (capPromoted) {
                cap_piece = PAWN; // Demote!
                if (cap_sq < 32) next.promoted.lo &= ~(1<<cap_sq); else next.promoted.hi &= ~(1<<(cap_sq-32));
            }
            next.pocket[us === WHITE ? 'w' : 'b'].push(cap_piece);
        }
        return next;
    }
    function apply_bughouse_move(prevState, m) { return apply_crazyhouse_move(prevState, m); }
    function apply_duck_move(prevState, m) {
        var next = apply_standard_move(prevState, m);
        next.duck_sq = (m >>> 22) & 0x3F; 
        return next;
    }
    function apply_chaturanga_move(prevState, m) {
        var next = clone_state(prevState);
        var us = next.turn, them = us ^ 1;
        var from = m & 0x3F, to = (m >>> 6) & 0x3F;
        var flags = (m >>> 12) & 0x7F, promo = (m >>> 19) & 0x7;
        var p_type = (next.board[from] & 7); 

        // 1. Pick up the piece
        if (from < 32) next.bb_lo[us*6+p_type] &= ~(1<<from); else next.bb_hi[us*6+p_type] &= ~(1<<(from-32));
        next.board[from] = -1;

        // 2. Handle Capture (No En Passant in Chaturanga!)
        if (flags & BITS.CAPTURE) {
            var cap = (next.board[to] & 7);
            if (cap !== -1) {
                if (to < 32) next.bb_lo[them*6+cap] &= ~(1<<to); else next.bb_hi[them*6+cap] &= ~(1<<(to-32));
            }
        } 

        // 3. Drop the piece (or the promoted Mantri/Queen)
        var placed = (flags & BITS.PROMOTION) ? promo : p_type;
        if (to < 32) next.bb_lo[us*6+placed] |= (1<<to); else next.bb_hi[us*6+placed] |= (1<<(to-32));
        next.board[to] = (us << 3) | placed;

        // 4. Update Board State
        next.turn ^= 1;
        next.ep_square = -1; // Permanently disabled
        if (p_type === PAWN || (flags & BITS.CAPTURE)) next.half_moves = 0; else next.half_moves++;
        if (us === BLACK) next.move_number++;
        return next;
    }
    function apply_alice_move(prevState, m) {
        var next = apply_standard_move(prevState, m);
        var from = m & 0x3F, to = (m >>> 6) & 0x3F;
        var flags = (m >>> 12) & 0x7F;

        let isB = from < 32 ? (prevState.alice_b.lo & (1<<from)) : (prevState.alice_b.hi & (1<<(from-32)));
        
        // 1. Clear the old square on the Phase mask
        if (from < 32) next.alice_b.lo &= ~(1<<from); else next.alice_b.hi &= ~(1<<(from-32));
        
        // 2. Transfer the moving piece to the OPPOSITE board!
        if (isB) {
            if (to < 32) next.alice_b.lo &= ~(1<<to); else next.alice_b.hi &= ~(1<<(to-32));
        } else {
            if (to < 32) next.alice_b.lo |= (1<<to); else next.alice_b.hi |= (1<<(to-32));
        }

        // 3. Handle Castling Transfer (Rook also jumps!)
        if (flags & BITS.KSIDE_CASTLE || flags & BITS.QSIDE_CASTLE) {
            let isK = (flags & BITS.KSIDE_CASTLE);
            let us = prevState.turn;
            let r_from = -1;
            let startF = isK ? 7 : 0; let step = isK ? -1 : 1;
            for(let f = startF; f >= 0 && f < 8; f += step) {
                let sq = (us===WHITE?0:56) + f;
                if(prevState.board[sq] === ((us<<3)|ROOK)) { r_from = sq; break; }
            }
            let r_to = us === WHITE ? (isK ? 5 : 3) : (isK ? 61 : 59);
            
            if (r_from !== -1) {
                let r_isB = r_from < 32 ? (prevState.alice_b.lo & (1<<r_from)) : (prevState.alice_b.hi & (1<<(r_from-32)));
                if (r_from < 32) next.alice_b.lo &= ~(1<<r_from); else next.alice_b.hi &= ~(1<<(r_from-32));
                if (r_isB) {
                    if (r_to < 32) next.alice_b.lo &= ~(1<<r_to); else next.alice_b.hi &= ~(1<<(r_to-32));
                } else {
                    if (r_to < 32) next.alice_b.lo |= (1<<r_to); else next.alice_b.hi |= (1<<(r_to-32));
                }
            }
        }
        
        // 4. Handle En Passant Erase
        if (flags & BITS.EP_CAPTURE) {
            let ep_sq = prevState.turn === WHITE ? to - 8 : to + 8;
            if (ep_sq < 32) next.alice_b.lo &= ~(1<<ep_sq); else next.alice_b.hi &= ~(1<<(ep_sq-32));
        }
        return next;
    }
    function apply_spell(state, spellType, targetSq) {
        let next = clone_state(state);
        let us = next.turn;
        
        if (!next.active_spells) next.active_spells = { frozen_timer: 0, jump_timer: 0 };
        
        if (spellType === 'freeze') {
            let r = targetSq >> 3, c = targetSq & 7;
            let freezeL = 0, freezeH = 0;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    let nr = r + dr, nc = c + dc;
                    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                        let sq = nr * 8 + nc;
                        if (sq < 32) freezeL |= (1 << sq);
                        else freezeH |= (1 << (sq - 32));
                    }
                }
            }
            next.frozen = { lo: freezeL, hi: freezeH };
            next.active_spells.frozen_timer = 2; // Lasts for your move AND the opponent's response
        } 
        else if (spellType === 'jump') {
            next.jump_sq = targetSq;
            next.active_spells.jump_timer = 2;
        }

        // Put on cooldown (6 plies = 3 full turns)
        let myColor = us === WHITE ? 'w' : 'b';
        if (!next.mana) next.mana = { w: {freeze: 0, jump: 0}, b: {freeze: 0, jump: 0} };
        next.mana[myColor][spellType] = 6; 

        // ✨ CRITICAL FIX: DO NOT FLIP THE TURN! Spells are free actions.
        return next;
    }
    // --------------------------------------------------------
    // VARIANT APPLY ROUTER (MASTER SHELL)
    // --------------------------------------------------------
    function apply_move(prevState, m) {
        // ✨ SPELL CHESS INTERCEPT: Handle object-based spell casts
        if (typeof m === 'object' && m.isSpell) {
            return apply_spell(prevState, m.spellType, m.target);
        }

        let nextState;
        switch (prevState.gameMode) {
            case 'alice':      nextState = apply_alice_move(prevState, m); break;
            case 'atomic':     nextState = apply_atomic_move(prevState, m); break;
            case 'bughouse':   nextState = apply_bughouse_move(prevState, m); break;
            case 'chaturanga': nextState = apply_chaturanga_move(prevState, m); break;
            case 'crazyhouse': nextState = apply_crazyhouse_move(prevState, m); break;
            case 'duck':       nextState = apply_duck_move(prevState, m); break;
            case 'spell':      nextState = apply_standard_move(prevState, m); break; // Standard piece moves in Spell Chess
            case 'placement':  
                nextState = apply_crazyhouse_move(prevState, m); 
                if (nextState.pocket.w.length === 0 && nextState.pocket.b.length === 0 && 
                   (prevState.pocket.w.length > 0 || prevState.pocket.b.length > 0)) {
                    let c = 0; 
                    if (nextState.board[4] === ((WHITE << 3) | KING)) { 
                        if (nextState.board[7] === ((WHITE << 3) | ROOK)) c |= 1; 
                        if (nextState.board[0] === ((WHITE << 3) | ROOK)) c |= 2; 
                    }
                    if (nextState.board[60] === ((BLACK << 3) | KING)) { 
                        if (nextState.board[63] === ((BLACK << 3) | ROOK)) c |= 4; 
                        if (nextState.board[56] === ((BLACK << 3) | ROOK)) c |= 8; 
                    }
                    nextState.castling = c;
                }
                break;
            case 'classical':
            case 'chess960':
            case '3check':
            case 'antichess':
            case 'horde':
            case 'kingofthehill':
            case 'racingkings':
            default:           nextState = apply_standard_move(prevState, m); break;
        }

        if (prevState.gameMode === '3check') {
            if (is_standard_checked(nextState, nextState.turn)) {
                let us = prevState.turn; 
                if (us === WHITE) nextState.checks.w++;
                else nextState.checks.b++;
            }
        }
        return nextState;
    }
    
    function is_attacked(state, sq, by_color) {
        var bb_lo = state.bb_lo, bb_hi = state.bb_hi;
        // ✨ OPTIMIZED FAST-PATH FOR STANDARD CHESS
        if (state.gameMode !== 'alice' && state.gameMode !== 'duck' && state.gameMode !== 'chaturanga') {
            if (sq < 32) {
                if (PAWN_LO[by_color^1][sq] & bb_lo[by_color*6+PAWN]) return true;
            } else {
                if (PAWN_HI[by_color^1][sq] & bb_hi[by_color*6+PAWN]) return true;
            }
            if ((KNIGHT_LO[sq] & bb_lo[by_color*6+KNIGHT]) | (KNIGHT_HI[sq] & bb_hi[by_color*6+KNIGHT])) return true;
            if ((KING_LO[sq] & bb_lo[by_color*6+KING]) | (KING_HI[sq] & bb_hi[by_color*6+KING])) return true;

            var occL=0, occH=0;
            // ✨ V8 LOVES THIS: Short, predictable loops
            for(let i=0; i<12; i++) { occL|=bb_lo[i]; occH|=bb_hi[i]; }
            if (state.gameMode === 'spell' && state.jump_sq !== undefined && state.jump_sq !== -1) {
            if(state.jump_sq < 32) occL &= ~(1<<state.jump_sq); else occH &= ~(1<<(state.jump_sq-32));
            }
            let sliders = (bb_lo[by_color*6+QUEEN]|bb_lo[by_color*6+ROOK]|bb_lo[by_color*6+BISHOP]);
            let slidersH = (bb_hi[by_color*6+QUEEN]|bb_hi[by_color*6+ROOK]|bb_hi[by_color*6+BISHOP]);

            while(sliders || slidersH) {
                let from = ctz(sliders, slidersH);
                if(from < 32) sliders &= ~(1<<from); else slidersH &= ~(1<<(from-32));
                
                if (ALIGNED[from * 64 + sq]) {
                    let p = state.board[from] & 7;
                    let idx = from*64+sq;
                    if (((BETWEEN_LO[idx] & occL) | (BETWEEN_HI[idx] & occH)) === 0) {
                        let r1=from>>3, c1=from&7, r2=sq>>3, c2=sq&7;
                        let isDiag = (Math.abs(r1-r2)===Math.abs(c1-c2));
                        if ((p===ROOK && !isDiag) || (p===BISHOP && isDiag) || p===QUEEN) return true;
                    }
                }
            }
            return false;
        }

        // --- VARIANT SLOW PATH ---
        let bMaskL = 0xFFFFFFFF, bMaskH = 0xFFFFFFFF;
        if (state.gameMode === 'alice') {
            let isB = sq < 32 ? (state.alice_b.lo & (1<<sq)) : (state.alice_b.hi & (1<<(sq-32)));
            bMaskL = isB ? state.alice_b.lo : ~state.alice_b.lo;
            bMaskH = isB ? state.alice_b.hi : ~state.alice_b.hi;
        }
        if (state.gameMode === 'spell' && state.frozen) {
            bMaskL &= ~state.frozen.lo;
            bMaskH &= ~state.frozen.hi;
        }
        if (sq < 32) {
            if ((PAWN_LO[by_color^1][sq] & (bb_lo[by_color*6+PAWN] & bMaskL))) return true;
        } else {
            if ((PAWN_HI[by_color^1][sq] & (bb_hi[by_color*6+PAWN] & bMaskH))) return true;
        }
        if ((KNIGHT_LO[sq] & (bb_lo[by_color*6+KNIGHT] & bMaskL)) | (KNIGHT_HI[sq] & (bb_hi[by_color*6+KNIGHT] & bMaskH))) return true;
        if ((KING_LO[sq] & (bb_lo[by_color*6+KING] & bMaskL)) | (KING_HI[sq] & (bb_hi[by_color*6+KING] & bMaskH))) return true;

        if (state.gameMode === 'duck' && state.duck_sq !== -1) {
            if (state.duck_sq < 32) occL |= (1 << state.duck_sq);
            else occH |= (1 << (state.duck_sq - 32));
        }
        if (state.gameMode === 'spell' && state.jump_sq !== undefined && state.jump_sq !== -1) {
            if (state.jump_sq < 32) occL &= ~(1 << state.jump_sq);
            else occH &= ~(1 << (state.jump_sq - 32));
        }
        if (state.gameMode === 'alice') {
            occL &= bMaskL; occH &= bMaskH;
        }

        let sliders = 0, slidersH = 0;
        if (state.gameMode === 'chaturanga') {
            let bL = bb_lo[by_color*6+BISHOP], bH = bb_hi[by_color*6+BISHOP];
            let qL = bb_lo[by_color*6+QUEEN], qH = bb_hi[by_color*6+QUEEN];
            let r = sq >> 3, f = sq & 7;

            let aL = 0, aH = 0;
            [[2,2],[2,-2],[-2,2],[-2,-2]].forEach(d => {
                let cr = r + d[0], cc = f + d[1];
                if(cr>=0 && cr<8 && cc>=0 && cc<8) {
                    let s = cr*8+cc;
                    if(s<32) aL |= (1<<s); else aH |= (1<<(s-32));
                }
            });
            if ((bL & aL) || (bH & aH)) return true;

            let fL = 0, fH = 0;
            [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(d => {
                let cr = r + d[0], cc = f + d[1];
                if(cr>=0 && cr<8 && cc>=0 && cc<8) {
                    let s = cr*8+cc;
                    if(s<32) fL |= (1<<s); else fH |= (1<<(s-32));
                }
            });
            if ((qL & fL) || (qH & fH)) return true;

            sliders = bb_lo[by_color*6+ROOK];
            slidersH = bb_hi[by_color*6+ROOK];
        } else {
            sliders = (bb_lo[by_color*6+QUEEN]|bb_lo[by_color*6+ROOK]|bb_lo[by_color*6+BISHOP]);
            slidersH = (bb_hi[by_color*6+QUEEN]|bb_hi[by_color*6+ROOK]|bb_hi[by_color*6+BISHOP]);
            if (state.gameMode === 'alice') {
                sliders &= bMaskL; slidersH &= bMaskH;
            }
        }
        
        while(sliders || slidersH) {
            let from = ctz(sliders, slidersH);
            if(from < 32) sliders &= ~(1<<from); else slidersH &= ~(1<<(from-32));
            
            if (ALIGNED[from * 64 + sq]) {
                let p = state.board[from] & 7;
                let idx = from*64+sq;
                if (((BETWEEN_LO[idx] & occL) | (BETWEEN_HI[idx] & occH)) === 0) {
                    let r1=from>>3, c1=from&7, r2=sq>>3, c2=sq&7;
                    let isDiag = (Math.abs(r1-r2)===Math.abs(c1-c2));
                    if ((p===ROOK && !isDiag) || (p===BISHOP && isDiag) || p===QUEEN) return true;
                }
            }
        }
        return false;
    }
    
    function is_standard_checked(state, color) {
        var klo = state.bb_lo[color*6+KING], khi = state.bb_hi[color*6+KING];
        if (klo===0 && khi===0) return false; 
        var k = ctz(klo, khi);
        return is_attacked(state, k, color ^ 1);
    }
    
    function is_checked(state, color) {
        switch (state.gameMode) {
            case 'antichess':   return false; 
            case 'racingkings': return false; 
            case 'duck':        return false;
            case 'horde':       return color === BLACK ? is_standard_checked(state, color) : false; 
            case 'atomic':
                var wkL = state.bb_lo[WHITE*6+KING], wkH = state.bb_hi[WHITE*6+KING];
                var bkL = state.bb_lo[BLACK*6+KING], bkH = state.bb_hi[BLACK*6+KING];
                if ((wkL || wkH) && (bkL || bkH)) {
                    var wk = ctz(wkL, wkH), bk = ctz(bkL, bkH);
                    if (Math.abs((wk>>3)-(bk>>3)) <= 1 && Math.abs((wk&7)-(bk&7)) <= 1) return false;
                }
                return is_standard_checked(state, color);
            case 'classical':
            case 'chess960':
            case '3check':
            case 'bughouse':
            case 'chaturanga':
            case 'crazyhouse':
            case 'kingofthehill':
            case 'placement':
            default:            return is_standard_checked(state, color);
        }
    }
    
    function generate_standard_moves(state, options) {
        let legal = (typeof options !== 'undefined' && options.legal) ? options.legal : false;
        let moves = [];
        let us = state.turn;
        let them = us ^ 1;

        // ✨ THE COLLISION FIX: Copy the arrays locally so we can mask them safely
        let bb_lo = new Int32Array(state.bb_lo);
        let bb_hi = new Int32Array(state.bb_hi);

        // 1. FREEZE SPELL: Mask the pieces directly in our local array
        if (state.gameMode === 'spell' && state.frozen) {
            let freeL = ~state.frozen.lo;
            let freeH = ~state.frozen.hi;
            for(let i=0; i<12; i++) {
                bb_lo[i] &= freeL;
                bb_hi[i] &= freeH;
            }
        }

        let occUsL = 0, occUsH = 0, occThemL = 0, occThemH = 0;
        for(let i=us*6; i<us*6+6; i++) { occUsL|=bb_lo[i]; occUsH|=bb_hi[i]; }
        for(let i=them*6; i<them*6+6; i++) { occThemL|=bb_lo[i]; occThemH|=bb_hi[i]; }
        
        let occAllL = occUsL | occThemL;
        let occAllH = occUsH | occThemH;

        if (state.gameMode === 'spell' && state.jump_sq !== undefined && state.jump_sq !== -1) {
            if (state.jump_sq < 32) occL &= ~(1 << state.jump_sq);
            else occH &= ~(1 << (state.jump_sq - 32));
        }

        if (state.gameMode === 'duck' && state.duck_sq !== -1) {
            if (state.duck_sq < 32) { occUsL |= (1 << state.duck_sq); occAllL |= (1 << state.duck_sq); }
            else { occUsH |= (1 << (state.duck_sq - 32)); occAllH |= (1 << (state.duck_sq - 32)); }
        }

        let emptyL = ~occAllL, emptyH = ~occAllH;
        let pL = bb_lo[us*6+PAWN], pH = bb_hi[us*6+PAWN];

        let sL, sH;
        if (us === WHITE) {
            sL = (pL << 8) & emptyL;
            sH = ((pH << 8) | (pL >>> 24)) & emptyH;
        } else {
            sL = ((pL >>> 8) | (pH << 24)) & emptyL;
            sH = (pH >>> 8) & emptyH;
        }
        let bbL = sL, bbH = sH;
        while (bbL || bbH) {
            let to = ctz(bbL, bbH);
            if(to<32) bbL &= ~(1<<to); else bbH &= ~(1<<(to-32));
            let from = (us === WHITE) ? to - 8 : to + 8;
            if (to < 8 || to >= 56) add_promo(moves, from, to, BITS.PROMOTION, state.gameMode);
            else {
                add_move(moves, from, to, BITS.NORMAL);
                if ((us === WHITE && to >= 16 && to <= 23) || (us === BLACK && to >= 40 && to <= 47)) {
                    let d = (us === WHITE) ? to + 8 : to - 8;
                    let mask = (d<32) ? (1<<d) : (1<<(d-32));
                    if (((d<32?occAllL:occAllH) & mask) === 0) add_move(moves, from, d, BITS.BIG_PAWN);
                }
            }
        }

        let capL_LO, capL_HI, capR_LO, capR_HI;
        if (us === WHITE) {
            capL_LO = (pL << 7) & ~FILE_MASKS_LO[7];
            capL_HI = ((pH << 7) | (pL >>> 25)) & ~FILE_MASKS_HI[7];
            capR_LO = (pL << 9) & ~FILE_MASKS_LO[0];
            capR_HI = ((pH << 9) | (pL >>> 23)) & ~FILE_MASKS_HI[0];
        } else {
            capL_LO = ((pL >>> 9) | (pH << 23)) & ~FILE_MASKS_LO[7];
            capL_HI = (pH >>> 9) & ~FILE_MASKS_HI[7];
            capR_LO = ((pL >>> 7) | (pH << 25)) & ~FILE_MASKS_LO[0];
            capR_HI = (pH >>> 7) & ~FILE_MASKS_HI[0];
        }
        
        const add_caps = (cL, cH, offset) => {
            if (state.ep_square !== -1) {
                let epMask = (state.ep_square < 32) ? (1<<state.ep_square) : (1<<(state.ep_square-32));
                if ((state.ep_square<32) ? (cL & epMask) : (cH & epMask)) {
                    let from = (us === WHITE) ? (offset===1 ? state.ep_square-9 : state.ep_square-7) : (offset===1 ? state.ep_square+7 : state.ep_square+9);
                    if(from>=0 && from<64) add_move(moves, from, state.ep_square, BITS.EP_CAPTURE);
                }
            }
            cL &= occThemL; cH &= occThemH;
            while(cL!==0 || cH!==0) {
                let to = ctz(cL, cH);
                if(to<32) cL &= ~(1<<to); else cH &= ~(1<<(to-32));
                let from = (us === WHITE) ? (offset===1 ? to-9 : to-7) : (offset===1 ? to+7 : to+9);
                if (from >= 0 && from < 64) {
                    if (to < 8 || to >= 56) add_promo(moves, from, to, BITS.CAPTURE | BITS.PROMOTION, state.gameMode);
                    else add_move(moves, from, to, BITS.CAPTURE);
                }
            }
        };
        add_caps(capL_LO, capL_HI, -1);
        add_caps(capR_LO, capR_HI, 1);

        // ✨ PROPERLY DECLARED KNIGHTS
        let nL = bb_lo[us*6+KNIGHT], nH = bb_hi[us*6+KNIGHT];
        while (nL || nH) {
            let f = ctz(nL, nH);
            if(f<32) nL &= ~(1<<f); else nH &= ~(1<<(f-32));
            serialize_moves(moves, f, KNIGHT_LO[f]&~occUsL, KNIGHT_HI[f]&~occUsH, {lo:occThemL, hi:occThemH});
        }
        
        // ✨ PROPERLY DECLARED KINGS
        let kgL = bb_lo[us*6+KING], kgH = bb_hi[us*6+KING];
        if(kgL || kgH) {
            let f = ctz(kgL, kgH);
            serialize_moves(moves, f, KING_LO[f]&~occUsL, KING_HI[f]&~occUsH, {lo:occThemL, hi:occThemH});
        }

        // SLIDERS
        [ROOK, QUEEN, BISHOP].forEach(type => {
            let pL_slider = bb_lo[us*6+type], pH_slider = bb_hi[us*6+type];
            while (pL_slider || pH_slider) {
                let f = ctz(pL_slider, pH_slider);
                if(f<32) pL_slider &= ~(1<<f); else pH_slider &= ~(1<<(f-32));
                let att = get_slider_attacks(type, f, occAllL, occAllH);
                serialize_moves(moves, f, att.lo&~occUsL, att.hi&~occUsH, {lo:occThemL, hi:occThemH});
            }
        });

        if (state.gameMode !== 'chess960') {
            if (us === WHITE) {
                if ((state.castling & 1) && !(occAllL & (MASKS_LO[5]|MASKS_LO[6]))) {
                    if (!is_attacked(state, 4, BLACK) && !is_attacked(state, 5, BLACK) && !is_attacked(state, 6, BLACK)) add_move(moves, 4, 6, BITS.KSIDE_CASTLE);
                }
                if ((state.castling & 2) && !(occAllL & (MASKS_LO[1]|MASKS_LO[2]|MASKS_LO[3]))) {
                    if (!is_attacked(state, 4, BLACK) && !is_attacked(state, 3, BLACK) && !is_attacked(state, 2, BLACK)) add_move(moves, 4, 2, BITS.QSIDE_CASTLE);
                }
            } else {
                if ((state.castling & 4) && !(occAllH & (MASKS_HI[61]|MASKS_HI[62]))) { 
                    if (!is_attacked(state, 60, WHITE) && !is_attacked(state, 61, WHITE) && !is_attacked(state, 62, WHITE)) add_move(moves, 60, 62, BITS.KSIDE_CASTLE);
                }
                if ((state.castling & 8) && !(occAllH & (MASKS_HI[57]|MASKS_HI[58]|MASKS_HI[59]))) {
                    if (!is_attacked(state, 60, WHITE) && !is_attacked(state, 59, WHITE) && !is_attacked(state, 58, WHITE)) add_move(moves, 60, 58, BITS.QSIDE_CASTLE);
                }
            }
        } else {
            let klo = bb_lo[us*6+KING], khi = bb_hi[us*6+KING];
            if (klo || khi) {
                let kSq = ctz(klo, khi);
                const addCastle = (isK) => {
                    let rightMask = us===WHITE ? (isK?1:2) : (isK?4:8);
                    if (!(state.castling & rightMask)) return;

                    let rSq = -1;
                    let startF = isK ? 7 : 0; let step = isK ? -1 : 1;
                    for(let f = startF; f >= 0 && f < 8; f += step) {
                        let sq = (us===WHITE?0:56) + f;
                        if(state.board[sq] === ((us<<3)|ROOK)) { rSq = sq; break; }
                    }
                    if (rSq === -1) return;

                    let k_to = us === WHITE ? (isK ? 6 : 2) : (isK ? 62 : 58);
                    let r_to = us === WHITE ? (isK ? 5 : 3) : (isK ? 61 : 59);

                    let minF = Math.min(kSq&7, rSq&7, k_to&7, r_to&7);
                    let maxF = Math.max(kSq&7, rSq&7, k_to&7, r_to&7);
                    for(let f = minF; f <= maxF; f++) {
                        let sq = (us===WHITE?0:56) + f;
                        if (sq !== kSq && sq !== rSq && state.board[sq] !== -1) return;
                    }

                    let minK = Math.min(kSq&7, k_to&7);
                    let maxK = Math.max(kSq&7, k_to&7);
                    for(let f = minK; f <= maxK; f++) {
                        let sq = (us===WHITE?0:56) + f;
                        if (is_attacked(state, sq, them)) return;
                    }
                    
                    add_move(moves, kSq, rSq, isK ? BITS.KSIDE_CASTLE : BITS.QSIDE_CASTLE);
                    if (k_to !== rSq && k_to !== kSq) {
                        add_move(moves, kSq, k_to, isK ? BITS.KSIDE_CASTLE : BITS.QSIDE_CASTLE);
                    }
                };
                addCastle(true);
                addCastle(false);
            }
        }

        let final_moves = [];
        for (let i = 0; i < moves.length; i++) {
            let m = moves[i];
            if (options && options.square) {
                if ((m & 0x3F) !== ((options.square.charCodeAt(1)-49)*8 + (options.square.charCodeAt(0)-97))) continue;
            }
            if (!options || options.legal !== false) {
                
                // ✨ FAST-PATH RESTORED SAFELY
                if (state.gameMode === 'classical' || state.gameMode === 'chess960' || state.gameMode === '3check' || state.gameMode === 'horde' || state.gameMode === 'chaturanga') {
                    let flags = (m >>> 12) & 0xFF;
                    if (state.gameMode === 'chess960' && (flags & (BITS.KSIDE_CASTLE | BITS.QSIDE_CASTLE))) {
                        let nextState = apply_move(state, m);
                        if (!is_checked(nextState, us)) final_moves.push(m);
                        continue;
                    }
                    if (is_standard_legal_fast(state, m)) final_moves.push(m);
                } else {
                    let nextState = apply_move(state, m);
                    if (!is_checked(nextState, us)) final_moves.push(m);
                }
                
            } else {
                final_moves.push(m);
            }
        }
        return final_moves;
    }
    function is_standard_legal_fast(state, m) {
        var us = state.turn, them = us ^ 1;
        var from = m & 0x3F, to = (m >>> 6) & 0x3F, flags = (m >>> 12) & 0xFF, promo = (m >>> 19) & 0x7;
        
        // Crazyhouse/Placement Drops bypass (Too complex for bitboard reversal)
        if (flags & 128) return !is_checked(apply_move(state, m), us);

        var piece = state.board[from] & 7;
        
        let fromMask = (from<32) ? (1<<from) : (1<<(from-32));
        let toMask = (to<32) ? (1<<to) : (1<<(to-32));
        let isLoFrom = from<32, isLoTo = to<32;

        // 1. APPLY MOVE IN-PLACE
        if (isLoFrom) state.bb_lo[us*6+piece] &= ~fromMask; else state.bb_hi[us*6+piece] &= ~fromMask;
        if (isLoTo) state.bb_lo[us*6+piece] |= toMask; else state.bb_hi[us*6+piece] |= toMask;

        var cap_sq = to;
        var captured = -1;
        if (flags & 2) { // CAPTURE
            captured = state.board[to] & 7;
            if (captured !== -1) {
                if(isLoTo) state.bb_lo[them*6+captured] &= ~toMask; else state.bb_hi[them*6+captured] &= ~toMask;
            }
        } else if (flags & 8) { // EP_CAPTURE
            cap_sq = us===WHITE ? to-8 : to+8; 
            let capMask = (cap_sq<32) ? (1<<cap_sq) : (1<<(cap_sq-32));
            if(cap_sq<32) state.bb_lo[them*6+PAWN] &= ~capMask; else state.bb_hi[them*6+PAWN] &= ~capMask; 
        }
        if (flags & 16) { // PROMOTION
            if(isLoTo) {
                state.bb_lo[us*6+PAWN] &= ~toMask; 
                state.bb_lo[us*6+promo] |= toMask;
            } else {
                state.bb_hi[us*6+PAWN] &= ~toMask;
                state.bb_hi[us*6+promo] |= toMask;
            }
        }
        if (flags & 32) { // KSIDE_CASTLE
            let rf=us===WHITE?7:63, rt=us===WHITE?5:61;
            let rfM=(rf<32)?(1<<rf):(1<<(rf-32)), rtM=(rt<32)?(1<<rt):(1<<(rt-32));
            if(rf<32) state.bb_lo[us*6+ROOK] &= ~rfM; else state.bb_hi[us*6+ROOK] &= ~rfM; 
            if(rt<32) state.bb_lo[us*6+ROOK] |= rtM; else state.bb_hi[us*6+ROOK] |= rtM;
        } else if (flags & 64) { // QSIDE_CASTLE
            let rf=us===WHITE?0:56, rt=us===WHITE?3:59;
            let rfM=(rf<32)?(1<<rf):(1<<(rf-32)), rtM=(rt<32)?(1<<rt):(1<<(rt-32));
            if(rf<32) state.bb_lo[us*6+ROOK] &= ~rfM; else state.bb_hi[us*6+ROOK] &= ~rfM;
            if(rt<32) state.bb_lo[us*6+ROOK] |= rtM; else state.bb_hi[us*6+ROOK] |= rtM;
        }

        // 2. CHECK FOR ATTACKS (The board array is untouched!)
        var king_sq = (piece === KING) ? to : ctz(state.bb_lo[us*6+KING], state.bb_hi[us*6+KING]); 
        var safe = (king_sq === 64) || !is_attacked(state, king_sq, them);

        // 3. INSTANT REVERSAL
        if (flags & 32) {
            let rf=us===WHITE?7:63, rt=us===WHITE?5:61;
            let rfM=(rf<32)?(1<<rf):(1<<(rf-32)), rtM=(rt<32)?(1<<rt):(1<<(rt-32));
            if(rt<32) state.bb_lo[us*6+ROOK] &= ~rtM; else state.bb_hi[us*6+ROOK] &= ~rtM;
            if(rf<32) state.bb_lo[us*6+ROOK] |= rfM; else state.bb_hi[us*6+ROOK] |= rfM;
        } else if (flags & 64) {
            let rf=us===WHITE?0:56, rt=us===WHITE?3:59;
            let rfM=(rf<32)?(1<<rf):(1<<(rf-32)), rtM=(rt<32)?(1<<rt):(1<<(rt-32));
            if(rt<32) state.bb_lo[us*6+ROOK] &= ~rtM; else state.bb_hi[us*6+ROOK] &= ~rtM;
            if(rf<32) state.bb_lo[us*6+ROOK] |= rfM; else state.bb_hi[us*6+ROOK] |= rfM;
        }
        if (flags & 16) {
            if(isLoTo) {
                state.bb_lo[us*6+promo] &= ~toMask;
                state.bb_lo[us*6+PAWN] |= toMask;
            } else {
                state.bb_hi[us*6+promo] &= ~toMask;
                state.bb_hi[us*6+PAWN] |= toMask;
            }
        }
        if (flags & 8) {
            let capMask = (cap_sq<32) ? (1<<cap_sq) : (1<<(cap_sq-32));
            if(cap_sq<32) state.bb_lo[them*6+PAWN] |= capMask; else state.bb_hi[them*6+PAWN] |= capMask;
        } else if (flags & 2) {
            if(captured !== -1) {
                if(isLoTo) state.bb_lo[them*6+captured] |= toMask; else state.bb_hi[them*6+captured] |= toMask;
            }
        }
        
        if(isLoTo) state.bb_lo[us*6+piece] &= ~toMask; else state.bb_hi[us*6+piece] &= ~toMask;
        if(isLoFrom) state.bb_lo[us*6+piece] |= fromMask; else state.bb_hi[us*6+piece] |= fromMask;

        return safe;
    }
    // --- VARIANT GENERATOR STUBS ---
    function generate_antichess_moves(state, options) { 
        var moves = generate_standard_moves(state, options);
        var captures = [];
        for (var i = 0; i < moves.length; i++) {
            var m = moves[i];
            var flags = (m >>> 12) & 0x7F;
            if ((flags & BITS.CAPTURE) || (flags & BITS.EP_CAPTURE)) {
                captures.push(m);
            }
        }
        if (captures.length > 0) return captures;
        return moves; 
    }
    function generate_atomic_moves(state, options) { 
        var moves = generate_standard_moves(state, {legal: false});
        var valid = [];
        var us = state.turn, them = us ^ 1;
        for (var i = 0; i < moves.length; i++) {
            var m = moves[i];
            var from = m & 0x3F, to = (m >>> 6) & 0x3F;
            
            if (options && options.square && SQ_STR[from] !== options.square) continue;

            var p_type = state.board[from] & 7;
            var flags = (m >>> 12) & 0x7F;

            // 🔥 ATOMIC FIX: Kings can NEVER capture.
            if (p_type === KING && (flags & BITS.CAPTURE || flags & BITS.EP_CAPTURE)) continue;

            var next = apply_atomic_move(state, m);

            var myK_lo = next.bb_lo[us*6+KING], myK_hi = next.bb_hi[us*6+KING];
            var theirK_lo = next.bb_lo[them*6+KING], theirK_hi = next.bb_hi[them*6+KING];

            if (!myK_lo && !myK_hi) continue; // We blew up our own king (Illegal)
            if (!theirK_lo && !theirK_hi) { valid.push(m); continue; } // We blew up their king (Legal Win)

            var myK = ctz(myK_lo, myK_hi);
            var theirK = ctz(theirK_lo, theirK_hi);
            var kingsAdj = Math.abs((myK>>3)-(theirK>>3)) <= 1 && Math.abs((myK&7)-(theirK&7)) <= 1;

            if (kingsAdj) {
                valid.push(m); // If adjacent, we are immune to check
            } else {
                if (!is_standard_checked(next, us)) valid.push(m);
            }
        }
        return valid;
    }
    function generate_racingkings_moves(state, options) { 
        var moves = generate_standard_moves(state, options);
        var valid = [];
        var us = state.turn;
        for (var i = 0; i < moves.length; i++) {
            var m = moves[i];
            var next = apply_standard_move(state, m);
            
            // ✨ RACING KINGS FIX: Kings cannot give check AND cannot walk into check!
            if (!is_standard_checked(next, us ^ 1) && !is_standard_checked(next, us)) {
                valid.push(m);
            }
        }
        return valid; 
    }
    function generate_bughouse_moves(state, options) { return generate_crazyhouse_moves(state, options); }
    function generate_placement_moves(state, options) {
        var moves = [];
        var us = state.turn;
        var pocket = state.pocket[us === WHITE ? 'w' : 'b'];
        
        // 1. SETUP PHASE: If pocket has pieces, normal moves are LOCKED. Only generate drops.
        if (pocket && pocket.length > 0) {
            var unique_pocket = [];
            for (var i=0; i<pocket.length; i++) if (!unique_pocket.includes(pocket[i])) unique_pocket.push(pocket[i]);
            
            var empty_sqs = [];
            for (var sq = 0; sq < 64; sq++) {
                if (state.board[sq] === -1) empty_sqs.push(sq);
            }
            
            for (var i=0; i<unique_pocket.length; i++) {
                var p_type = unique_pocket[i];
                for (var j=0; j<empty_sqs.length; j++) {
                    var sq = empty_sqs[j];
                    var rank = Math.floor(sq / 8);
                    
                    // ✨ RULE 1: Drops are strictly restricted to the Home Rank
                    var validRank = us === WHITE ? 0 : 7;
                    if (rank !== validRank) continue;
                    
                    // ✨ RULE 2: Opposite Colored Bishops
                    if (p_type === BISHOP) {
                        var hasLight = false, hasDark = false;
                        for (var k = 0; k < 64; k++) {
                            if (state.board[k] !== -1 && (state.board[k] & 7) === BISHOP && (state.board[k] >> 3) === us) {
                                var r = Math.floor(k / 8), c = k % 8;
                                if ((r + c) % 2 === 0) hasLight = true;
                                else hasDark = true;
                            }
                        }
                        var sqColor = (Math.floor(sq / 8) + (sq % 8)) % 2 === 0 ? 'light' : 'dark';
                        if (hasLight && sqColor === 'light') continue;
                        if (hasDark && sqColor === 'dark') continue;
                    }
                    
                    var m = p_type | (sq << 6) | (BITS.DROP << 12);
                    
                    if (!options || options.legal !== false) {
                        // crazyhouse_move handles drops and pocket removal perfectly, so we reuse it
                        var nextState = apply_crazyhouse_move(state, m);
                        if (!is_checked(nextState, us)) moves.push(m);
                    } else {
                        moves.push(m);
                    }
                }
            }
            
            // Filter drops if a specific square was clicked
            if (options && options.square) {
                var filtered = [];
                for(var i=0; i<moves.length; i++) {
                    var m = moves[i];
                    if ((m >>> 12 & 0xFF) & BITS.DROP) {
                        if (options.square === '@' || options.square.includes('@')) filtered.push(m);
                    } else {
                        if (SQ_STR[m & 0x3F] === options.square) filtered.push(m);
                    }
                }
                return filtered;
            }
            return moves;
        } else {
            // 2. PLAY PHASE: Once the pocket is empty, normal chess rules apply!
            return generate_standard_moves(state, options);
        }
    }
    function generate_chaturanga_moves(state, options) {
        var moves = [];
        var us = state.turn, them = us ^ 1;
        var bb_lo = state.bb_lo, bb_hi = state.bb_hi;

        // ✨ V8 LOVES THIS: Clean, inline OCC loops
        var occUsL = 0, occUsH = 0, occThemL = 0, occThemH = 0;
        for(let i=us*6; i<us*6+6; i++) { occUsL|=bb_lo[i]; occUsH|=bb_hi[i]; }
        for(let i=them*6; i<them*6+6; i++) { occThemL|=bb_lo[i]; occThemH|=bb_hi[i]; }
        
        var occAllL = occUsL | occThemL, occAllH = occUsH | occThemH;
        var emptyL = ~occAllL, emptyH = ~occAllH;
        var pL = bb_lo[us*6+PAWN], pH = bb_hi[us*6+PAWN];

        // PAWNS (Single step only)
        var sL, sH;
        if (us === WHITE) { sL = (pL << 8) & emptyL; sH = ((pH << 8) | (pL >>> 24)) & emptyH; }
        else { sL = ((pL >>> 8) | (pH << 24)) & emptyL; sH = (pH >>> 8) & emptyH; }

        let bbL = sL, bbH = sH;
        while (bbL || bbH) {
            let to = ctz(bbL, bbH);
            if(to<32) bbL &= ~(1<<to); else bbH &= ~(1<<(to-32));
            let from = (us === WHITE) ? to - 8 : to + 8;
            
            // ✨ FS STRICT: Pawns ONLY promote to Mantri (Queen)
            if (to < 8 || to >= 56) moves.push(from | (to << 6) | (BITS.PROMOTION << 12) | (QUEEN << 19));
            else add_move(moves, from, to, BITS.NORMAL);
        }

        let capL_LO, capL_HI, capR_LO, capR_HI;
        if (us === WHITE) {
            capL_LO = (pL << 7) & ~FILE_MASKS_LO[7]; capL_HI = ((pH << 7) | (pL >>> 25)) & ~FILE_MASKS_HI[7];
            capR_LO = (pL << 9) & ~FILE_MASKS_LO[0]; capR_HI = ((pH << 9) | (pL >>> 23)) & ~FILE_MASKS_HI[0];
        } else {
            capL_LO = ((pL >>> 9) | (pH << 23)) & ~FILE_MASKS_LO[7]; capL_HI = (pH >>> 9) & ~FILE_MASKS_HI[7];
            capR_LO = ((pL >>> 7) | (pH << 25)) & ~FILE_MASKS_LO[0]; capR_HI = (pH >>> 7) & ~FILE_MASKS_HI[0];
        }

        const add_caps = (cL, cH, offset) => {
            cL &= occThemL; cH &= occThemH;
            while(cL!==0 || cH!==0) {
                let to = ctz(cL, cH);
                if(to<32) cL &= ~(1<<to); else cH &= ~(1<<(to-32));
                let from = (us === WHITE) ? (offset===1 ? to-9 : to-7) : (offset===1 ? to+7 : to+9);
                if (from >= 0 && from < 64) {
                    if (to < 8 || to >= 56) moves.push(from | (to << 6) | ((BITS.CAPTURE | BITS.PROMOTION) << 12) | (QUEEN << 19));
                    else add_move(moves, from, to, BITS.CAPTURE);
                }
            }
        };
        add_caps(capL_LO, capL_HI, -1);
        add_caps(capR_LO, capR_HI, 1);

        // ASVA (Knight)
        let kL = bb_lo[us*6+KNIGHT], kH = bb_hi[us*6+KNIGHT];
        while (kL || kH) {
            let f = ctz(kL, kH);
            if(f<32) kL &= ~(1<<f); else kH &= ~(1<<(f-32));
            serialize_moves(moves, f, KNIGHT_LO[f]&~occUsL, KNIGHT_HI[f]&~occUsH, {lo:occThemL, hi:occThemH});
        }

        // RAJAH (King) - ✨ FS STRICT: No leaps allowed.
        kL = bb_lo[us*6+KING]; kH = bb_hi[us*6+KING];
        if(kL || kH) {
            let f = ctz(kL, kH);
            serialize_moves(moves, f, KING_LO[f]&~occUsL, KING_HI[f]&~occUsH, {lo:occThemL, hi:occThemH});
        }

        // RATHA (Rook)
        let rL = bb_lo[us*6+ROOK], rH = bb_hi[us*6+ROOK];
        while (rL || rH) {
            let f = ctz(rL, rH);
            if(f<32) rL &= ~(1<<f); else rH &= ~(1<<(f-32));
            let att = get_slider_attacks(ROOK, f, occAllL, occAllH);
            serialize_moves(moves, f, att.lo&~occUsL, att.hi&~occUsH, {lo:occThemL, hi:occThemH});
        }

        // GAJA (Elephant / Bishop - Leaps 2 squares diagonally)
        let bL = bb_lo[us*6+BISHOP], bH = bb_hi[us*6+BISHOP];
        while (bL || bH) {
            let f = ctz(bL, bH);
            if(f<32) bL &= ~(1<<f); else bH &= ~(1<<(f-32));
            let r = f >> 3, c = f & 7;
            let aL = 0, aH = 0;
            [[2,2],[2,-2],[-2,2],[-2,-2]].forEach(d => {
                let cr = r + d[0], cc = c + d[1];
                if(cr>=0 && cr<8 && cc>=0 && cc<8) {
                    let s = cr*8+cc;
                    if(s<32) aL |= (1<<s); else aH |= (1<<(s-32));
                }
            });
            serialize_moves(moves, f, aL&~occUsL, aH&~occUsH, {lo:occThemL, hi:occThemH});
        }

        // MANTRI (Counselor / Queen - 1 square diagonally)
        let qL = bb_lo[us*6+QUEEN], qH = bb_hi[us*6+QUEEN];
        while (qL || qH) {
            let f = ctz(qL, qH);
            if(f<32) qL &= ~(1<<f); else qH &= ~(1<<(f-32));
            let r = f >> 3, c = f & 7;
            let fL = 0, fH = 0;
            [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(d => {
                let cr = r + d[0], cc = c + d[1];
                if(cr>=0 && cr<8 && cc>=0 && cc<8) {
                    let s = cr*8+cc;
                    if(s<32) fL |= (1<<s); else fH |= (1<<(s-32));
                }
            });
            serialize_moves(moves, f, fL&~occUsL, fH&~occUsH, {lo:occThemL, hi:occThemH});
        }

        var final_moves = [];
        for (var i = 0; i < moves.length; i++) {
            var m = moves[i];
            if (options && options.square) {
                if ((m & 0x3F) !== ((options.square.charCodeAt(1)-49)*8 + (options.square.charCodeAt(0)-97))) continue;
            }
            if (!options || options.legal !== false) {
                
                // ✨ FAST-PATH BYPASS!
                if (state.gameMode === 'classical' || state.gameMode === 'chess960' || state.gameMode === '3check' || state.gameMode === 'horde' || state.gameMode === 'chaturanga') {
                    
                    var flags = (m >>> 12) & 0xFF;
                    
                    // Fallback to clone path ONLY for 960 castling (due to randomized rook squares)
                    if (state.gameMode === 'chess960' && (flags & (BITS.KSIDE_CASTLE | BITS.QSIDE_CASTLE))) {
                        var nextState = apply_move(state, m);
                        if (!is_checked(nextState, us)) final_moves.push(m);
                        continue;
                    }
                    
                    if (is_standard_legal_fast(state, m)) final_moves.push(m);

                } else {
                    // Variant slow-path (Atomic, Racing Kings, Alice, Crazyhouse)
                    var nextState = apply_move(state, m);
                    if (!is_checked(nextState, us)) final_moves.push(m);
                }
                
            } else {
                final_moves.push(m);
            }
        }
        return final_moves;
    }
    function generate_crazyhouse_moves(state, options) {
        var moves = generate_standard_moves(state, options);
        var us = state.turn;
        var pocket = state.pocket[us === WHITE ? 'w' : 'b'];
        
        if (pocket.length > 0) {
            var unique_pocket = [];
            for (var i=0; i<pocket.length; i++) if (!unique_pocket.includes(pocket[i])) unique_pocket.push(pocket[i]);
            
            var empty_sqs = [];
            for (var sq = 0; sq < 64; sq++) {
                if (state.board[sq] === -1) empty_sqs.push(sq);
            }
            
            for (var i=0; i<unique_pocket.length; i++) {
                var p_type = unique_pocket[i];
                for (var j=0; j<empty_sqs.length; j++) {
                    var sq = empty_sqs[j];
                    var rank = Math.floor(sq / 8);
                    if (p_type === PAWN && (rank === 0 || rank === 7)) continue; // Pawns can't drop on edges
                    
                    var m = p_type | (sq << 6) | (BITS.DROP << 12);
                    
                    if (!options || options.legal !== false) {
                        var nextState = apply_crazyhouse_move(state, m);
                        if (!is_checked(nextState, us)) moves.push(m);
                    } else {
                        moves.push(m);
                    }
                }
            }
        }
        
        if (options && options.square) {
            var filtered = [];
            for(var i=0; i<moves.length; i++) {
                var m = moves[i];
                if ((m >>> 12 & 0xFF) & BITS.DROP) {
                    if (options.square === '@' || options.square.includes('@')) filtered.push(m);
                } else {
                    if (SQ_STR[m & 0x3F] === options.square) filtered.push(m);
                }
            }
            return filtered;
        }
        return moves;
    }
    function generate_duck_moves(state, options) { 
        var piece_moves = generate_standard_moves(state, {legal: false});
        var valid = [];
        var us = state.turn, them = us ^ 1;

        for (var i = 0; i < piece_moves.length; i++) {
            var m = piece_moves[i];
            var from = m & 0x3F;
            if (options && options.square && SQ_STR[from] !== options.square) continue;

            var next = apply_standard_move(state, m);
            
            var myK_lo = next.bb_lo[us*6+KING], myK_hi = next.bb_hi[us*6+KING];
            var theirK_lo = next.bb_lo[them*6+KING], theirK_hi = next.bb_hi[them*6+KING];
            if (!myK_lo && !myK_hi) continue; // Moved into capture (Illegal)
            
            // If we captured THEIR King, we win instantly! 
            if (!theirK_lo && !theirK_hi) {
                valid.push(m | ((state.duck_sq !== -1 ? state.duck_sq : 0) << 22));
                continue;
            }

            // Normal Move: Generate 60+ variations for every possible empty duck placement!
            for (var sq = 0; sq < 64; sq++) {
                if (next.board[sq] === -1 && sq !== state.duck_sq) {
                    valid.push(m | (sq << 22));
                }
            }
        }
        return valid; 
    }
    function generate_horde_moves(state, options) { 
        var moves = generate_standard_moves(state, options);
        var us = state.turn;

        if (us === WHITE) {
            for (var from = 0; from <= 7; from++) {
                if (state.board[from] === (WHITE << 3 | PAWN)) {
                    var to1 = from + 8;  // 1 square up
                    var to2 = from + 16; // 2 squares up
                    
                    // If both the square directly in front and 2 squares in front are empty
                    if (state.board[to1] === -1 && state.board[to2] === -1) {
                        if (options && options.square) {
                            if (SQ_STR[from] !== options.square) continue;
                        }
                        moves.push(from | (to2 << 6) | (BITS.BIG_PAWN << 12));
                    }
                }
            }
        }
        return moves; 
    }
    function generate_alice_moves(state, options) {
        var moves = [];
        var us = state.turn, them = us ^ 1;
        
        // ✨ V8 LOVES THIS: Clean loops!
        var myPiecesL = 0, myPiecesH = 0;
        for(let i=us*6; i<us*6+6; i++) { myPiecesL|=state.bb_lo[i]; myPiecesH|=state.bb_hi[i]; }

        let tempL = myPiecesL, tempH = myPiecesH;
        while(tempL || tempH) {
            let f = ctz(tempL, tempH);
            if(f<32) tempL &= ~(1<<f); else tempH &= ~(1<<(f-32));
            
            let isB = f < 32 ? (state.alice_b.lo & (1<<f)) : (state.alice_b.hi & (1<<(f-32)));
            let bMaskL = isB ? state.alice_b.lo : ~state.alice_b.lo;
            let bMaskH = isB ? state.alice_b.hi : ~state.alice_b.hi;
            
            // ✨ V8 LOVES THIS: Clean loops!
            let occAllL = 0, occAllH = 0;
            for(let i=0; i<12; i++) { occAllL|=state.bb_lo[i]; occAllH|=state.bb_hi[i]; }
            
            let occSameL = occAllL & bMaskL, occSameH = occAllH & bMaskH;
            let occOppL = occAllL & ~bMaskL, occOppH = occAllH & ~bMaskH;
            let mySameL = myPiecesL & bMaskL, mySameH = myPiecesH & bMaskH;
            let enemiesSameL = occSameL & ~mySameL, enemiesSameH = occSameH & ~mySameH;

            let validTargetL = ~mySameL & ~occOppL;
            let validTargetH = ~mySameH & ~occOppH;
            let pType = state.board[f] & 7;

            if (pType === PAWN) {
                let dir = us === WHITE ? 8 : -8;
                let forward = f + dir;
                if (forward >= 0 && forward < 64) {
                    let fMask = forward < 32 ? (1<<forward) : (1<<(forward-32));
                    let occSameF = forward < 32 ? (occSameL & fMask) : (occSameH & fMask);
                    let validTargetF = forward < 32 ? (validTargetL & fMask) : (validTargetH & fMask);
                    if (!occSameF && validTargetF) {
                        if (forward < 8 || forward >= 56) add_promo(moves, f, forward, BITS.PROMOTION, state.gameMode);
                        else {
                            add_move(moves, f, forward, BITS.NORMAL);
                            let rank = f >> 3;
                            if ((us === WHITE && rank === 1) || (us === BLACK && rank === 6)) {
                                let doubleF = forward + dir;
                                let dMask = doubleF < 32 ? (1<<doubleF) : (1<<(doubleF-32));
                                let occSameD = doubleF < 32 ? (occSameL & dMask) : (occSameH & dMask);
                                let validTargetD = doubleF < 32 ? (validTargetL & dMask) : (validTargetH & dMask);
                                if (!occSameD && validTargetD) {
                                    add_move(moves, f, doubleF, BITS.BIG_PAWN);
                                }
                            }
                        }
                    }
                }
                let caps = us === WHITE ? [7, 9] : [-9, -7];
                for(let c of caps) {
                    let cf = (f&7) + (c===7||c===-9 ? -1 : 1);
                    if (cf < 0 || cf > 7) continue;
                    let capSq = f + c;
                    if (capSq >= 0 && capSq < 64) {
                        let cMask = capSq < 32 ? (1<<capSq) : (1<<(capSq-32));
                        let enemySameC = capSq < 32 ? (enemiesSameL & cMask) : (enemiesSameH & cMask);
                        let validTargetC = capSq < 32 ? (validTargetL & cMask) : (validTargetH & cMask);
                        
                        if (enemySameC && validTargetC) {
                            if (capSq < 8 || capSq >= 56) add_promo(moves, f, capSq, BITS.CAPTURE | BITS.PROMOTION, state.gameMode);
                            else add_move(moves, f, capSq, BITS.CAPTURE);
                        } 
                    }
                }
            } else if (pType === KNIGHT) {
                serialize_moves(moves, f, KNIGHT_LO[f] & validTargetL, KNIGHT_HI[f] & validTargetH, {lo: enemiesSameL, hi: enemiesSameH});
            } else if (pType === KING) {
                serialize_moves(moves, f, KING_LO[f] & validTargetL, KING_HI[f] & validTargetH, {lo: enemiesSameL, hi: enemiesSameH});
                if (state.castling) {
                    let cMask = us === WHITE ? (state.castling & 3) : (state.castling & 12);
                    if (cMask) {
                        let rank = us === WHITE ? 0 : 7;
                        let kSq = rank * 8 + 4;
                        if (f === kSq && !(is_attacked(state, kSq, them))) {
                            if (cMask & (us === WHITE ? 1 : 4)) {
                                let rSq = rank * 8 + 7;
                                let rMask = rSq < 32 ? (1<<rSq) : (1<<(rSq-32));
                                if (mySameL & rMask || mySameH & rMask) {
                                    let emptyPath = true;
                                    for(let i=5; i<=6; i++) {
                                        let sMask = i < 32 ? (1<<(rank*8+i)) : (1<<((rank*8+i)-32));
                                        let occSameS = i < 32 ? (occSameL & sMask) : (occSameH & sMask);
                                        if (occSameS) emptyPath = false;
                                    }
                                    if (emptyPath && !is_attacked(state, rank*8+5, them) && !is_attacked(state, rank*8+6, them)) {
                                        let kdMask = (rank*8+6) < 32 ? (1<<(rank*8+6)) : (1<<((rank*8+6)-32));
                                        let rdMask = (rank*8+5) < 32 ? (1<<(rank*8+5)) : (1<<((rank*8+5)-32));
                                        let kOpp = (rank*8+6) < 32 ? (occOppL & kdMask) : (occOppH & kdMask);
                                        let rOpp = (rank*8+5) < 32 ? (occOppL & rdMask) : (occOppH & rdMask);
                                        if (!kOpp && !rOpp) {
                                            add_move(moves, f, rank*8+6, BITS.KSIDE_CASTLE);
                                        }
                                    }
                                }
                            }
                            if (cMask & (us === WHITE ? 2 : 8)) {
                                let rSq = rank * 8 + 0;
                                let rMask = rSq < 32 ? (1<<rSq) : (1<<(rSq-32));
                                if (mySameL & rMask || mySameH & rMask) {
                                    let emptyPath = true;
                                    for(let i=1; i<=3; i++) {
                                        let sq = rank*8+i;
                                        let sMask = sq < 32 ? (1<<sq) : (1<<(sq-32));
                                        let occSameS = sq < 32 ? (occSameL & sMask) : (occSameH & sMask);
                                        if (occSameS) emptyPath = false;
                                    }
                                    if (emptyPath && !is_attacked(state, rank*8+3, them) && !is_attacked(state, rank*8+2, them)) {
                                        let kdMask = (rank*8+2) < 32 ? (1<<(rank*8+2)) : (1<<((rank*8+2)-32));
                                        let rdMask = (rank*8+3) < 32 ? (1<<(rank*8+3)) : (1<<((rank*8+3)-32));
                                        let kOpp = (rank*8+2) < 32 ? (occOppL & kdMask) : (occOppH & kdMask);
                                        let rOpp = (rank*8+3) < 32 ? (occOppL & rdMask) : (occOppH & rdMask);
                                        if (!kOpp && !rOpp) {
                                            add_move(moves, f, rank*8+2, BITS.QSIDE_CASTLE);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                let att = get_slider_attacks(pType, f, occSameL, occSameH);
                serialize_moves(moves, f, att.lo & validTargetL, att.hi & validTargetH, {lo: enemiesSameL, hi: enemiesSameH});
            }
        }

        var final_moves = [];
        for (var i = 0; i < moves.length; i++) {
            var m = moves[i];
            if (options && options.square) {
                if ((m & 0x3F) !== ((options.square.charCodeAt(1)-49)*8 + (options.square.charCodeAt(0)-97))) continue;
            }
            if (!options || options.legal !== false) {
                var nextState = apply_move(state, m);
                if (!is_checked(nextState, us)) final_moves.push(m);
            } else {
                final_moves.push(m);
            }
        }
        return final_moves;
    }
    // --------------------------------------------------------
    // VARIANT MOVE GENERATOR ROUTER (MASTER SHELL)
    // --------------------------------------------------------
    function generate_moves(state, options) {
        switch(state.gameMode) {
            case 'alice':       return generate_alice_moves(state, options);
            case 'antichess':   return generate_antichess_moves(state, options);
            case 'atomic':      return generate_atomic_moves(state, options);
            case 'bughouse':    return generate_bughouse_moves(state, options);
            case 'chaturanga':  return generate_chaturanga_moves(state, options);
            case 'crazyhouse':  return generate_crazyhouse_moves(state, options);
            case 'duck':        return generate_duck_moves(state, options);
            case 'horde':       return generate_horde_moves(state, options);
            case 'racingkings': return generate_racingkings_moves(state, options);
            case 'placement':   return generate_placement_moves(state, options);
            case 'classical':
            case 'chess960':
            case '3check':
            case 'kingofthehill':
            default:            return generate_standard_moves(state, options);
        }
    }
    
    function add_move(l, f, t, fl) { l.push(f | (t << 6) | (fl << 12)); }
    function add_promo(l, f, t, fl, gameMode) {
        l.push(f | (t << 6) | (fl << 12) | (4 << 19));
        l.push(f | (t << 6) | (fl << 12) | (3 << 19));
        l.push(f | (t << 6) | (fl << 12) | (2 << 19));
        l.push(f | (t << 6) | (fl << 12) | (1 << 19));
        if (gameMode === 'antichess') l.push(f | (t << 6) | (fl << 12) | (5 << 19)); 
    }
    function serialize_moves(l, f, attL, attH, enemies) {
        while (attL || attH) {
            let t = ctz(attL, attH);
            let isLo = t<32;
            let mask = isLo ? (1<<t) : (1<<(t-32));
            if(isLo) attL &= ~mask; else attH &= ~mask;
            let isCap = isLo ? (enemies.lo & mask) : (enemies.hi & mask);
            l.push(f | (t << 6) | ((isCap ? BITS.CAPTURE : BITS.NORMAL) << 12));
        }
    }

    function build_move_direct(state, from, to, promo) {
        if (state.gameMode === 'alice') {
            let legals = generate_alice_moves(state, {square: SQ_STR[from]});
            let promoInt = promo ? (typeof promo === 'string' ? CHAR_TO_PIECE[promo.toLowerCase()] : promo) : QUEEN;
            for(let i=0; i<legals.length; i++) {
                let m = legals[i];
                if (((m>>>6)&0x3F) === to) {
                    if (m & (BITS.PROMOTION << 12)) { if (((m>>>19)&7) === promoInt) return m; } 
                    else return m;
                }
            }
            return null;
        }
        
        var us = state.turn, piece = (state.board[from]&7);
        if (state.board[from] === -1 || (state.board[from]>>3) !== us) return null;
        if (state.gameMode === 'duck' && state.duck_sq !== -1) {
            if (to === state.duck_sq) return null; 
            if (piece !== KNIGHT && piece !== KING && piece !== PAWN) {
                let r1 = from >> 3, c1 = from & 7, r2 = to >> 3, c2 = to & 7;
                let dr = Math.sign(r2 - r1), dc = Math.sign(c2 - c1);
                let cr = r1 + dr, cc = c1 + dc;
                while (cr !== r2 || cc !== c2) {
                    if (cr * 8 + cc === state.duck_sq) return null;
                    cr += dr; cc += dc;
                }
            } else if (piece === PAWN) {
                if (Math.abs(to - from) === 16) {
                    let mid = (from + to) / 2;
                    if (mid === state.duck_sq) return null;
                }
            }
        }
        var is960Castle = false;
        if (state.board[to] !== -1 && (state.board[to]>>3) === us) {
            if (piece === KING && (state.board[to]&7) === ROOK) is960Castle = true;
            else return null; 
        }

        var them = us ^ 1, captured = state.board[to] !== -1 && (state.board[to]>>3)===them;
        var flags = BITS.NORMAL;
        var promoInt = 0;
        if (promo) { promoInt = typeof promo === 'string' ? CHAR_TO_PIECE[promo.toLowerCase()] : promo; }

        if (piece === PAWN) {
            var diff = us === WHITE ? to - from : from - to;
            if (diff % 8 !== 0) {
                if (!captured && to !== state.ep_square) return null;
                flags = (to === state.ep_square) ? BITS.EP_CAPTURE : BITS.CAPTURE;
            } else {
                if (captured) return null;
                if (diff === 16) {
                    if (state.gameMode === 'chaturanga') return null; // No double push!
                    flags = BITS.BIG_PAWN;
                }
            }
            var rank = Math.floor(to / 8);
            if (rank === 0 || rank === 7) {
                flags |= BITS.PROMOTION;
                if (state.gameMode === 'chaturanga') {
                    promoInt = QUEEN; 
                } else {
                    if (!promoInt) promoInt = QUEEN;
                }
            }
        } else if (piece === KING) {
            let isKDrop = (to === (us===WHITE ? 6 : 62));
            let isQDrop = (to === (us===WHITE ? 2 : 58));
            let isStandardCastle = state.gameMode !== 'chess960' && Math.abs(to - from) === 2;
            let is960Drop = state.gameMode === 'chess960' && (isKDrop || isQDrop);

            if (is960Drop && Math.abs(to - from) <= 1) {
                is960Drop = false; 
            }

            if (isStandardCastle || is960Castle || is960Drop) {
                let isKingsideAttempt = false;
                if (is960Castle) isKingsideAttempt = (to > from);
                else if (isStandardCastle) isKingsideAttempt = (to > from);
                else if (is960Drop) isKingsideAttempt = isKDrop;

                if (isKingsideAttempt) { 
                     if (us === WHITE && !(state.castling & 1)) is960Drop = false;
                     else if (us === BLACK && !(state.castling & 4)) is960Drop = false;
                     else flags = BITS.KSIDE_CASTLE;
                } else { 
                     if (us === WHITE && !(state.castling & 2)) is960Drop = false;
                     else if (us === BLACK && !(state.castling & 8)) is960Drop = false;
                     else flags = BITS.QSIDE_CASTLE;
                }
            }
            if (flags === BITS.NORMAL && captured) flags = BITS.CAPTURE;
        } else if (captured) flags = BITS.CAPTURE;
        
        var m = from | (to << 6) | (flags << 12) | (promoInt << 19);
        
        if (state.gameMode === 'classical' || state.gameMode === 'chess960' || state.gameMode === '3check' || state.gameMode === 'horde' || state.gameMode === 'chaturanga') {
            if (state.gameMode === 'chess960' && (flags & (BITS.KSIDE_CASTLE | BITS.QSIDE_CASTLE))) {
                var next = apply_move(state, m);
                if (!is_checked(next, us)) return m;
                return null;
            }
            if (is_standard_legal_fast(state, m)) return m;
            return null;
        }

        // Original variant slow path
        var next = apply_move(state, m);
        
        if (state.gameMode === 'racingkings') {
            if (is_standard_checked(next, us) || is_standard_checked(next, them)) return null;
            return m;
        }
        
        if (!is_checked(next, us)) return m;
        return null;
    }

    function tr(state, san) {
        if (!san || typeof san !== 'string') return null;
        var len = san.length, end = len;
        while (end > 0) {
            var c = san.charCodeAt(end - 1);
            if (c === 43 || c === 35 || c === 33 || c === 63) end--; else break;
        }
        var clean = san.substring(0, end).trim();
        
        if (clean === "O-O" || clean === "0-0" || clean === "O-O-O" || clean === "0-0-0") {
            let isK = (clean === "O-O" || clean === "0-0");
            if (state.gameMode !== 'chess960') {
                return state.turn === WHITE ? build_move_direct(state, 4, isK ? 6 : 2) : build_move_direct(state, 60, isK ? 62 : 58);
            } else {
                let kL = state.bb_lo[state.turn*6+KING], kH = state.bb_hi[state.turn*6+KING];
                if (!kL && !kH) return null;
                let kSq = ctz(kL, kH);
                let rSq = -1;
                let startF = isK ? 7 : 0; let step = isK ? -1 : 1;
                for(let f = startF; f >= 0 && f < 8; f += step) {
                    let sq = (state.turn===WHITE?0:56) + f;
                    if(state.board[sq] === ((state.turn<<3)|ROOK)) { rSq = sq; break; }
                }
                if (rSq !== -1) return build_move_direct(state, kSq, rSq); 
                return null;
            }
        }

        var promo = null, destIndex = clean.length - 1;
        var lastChar = clean.charCodeAt(destIndex);
        if ((lastChar >= 66 && lastChar <= 82) || (lastChar >= 98 && lastChar <= 114)) {
            var prev = clean.charCodeAt(destIndex - 1);
            if ((prev >= 49 && prev <= 56) || prev === 61) {
                promo = clean.charAt(destIndex).toLowerCase();
                destIndex--;
                if (clean.charCodeAt(destIndex) === 61) destIndex--;
            }
        }
        var toRank = clean.charCodeAt(destIndex) - 49;
        var toFile = clean.charCodeAt(destIndex - 1) - 97;
        var to = toRank * 8 + toFile;
        var pieceChar = 0, cursor = 0, first = clean.charCodeAt(0);
        if (first >= 66 && first <= 82) { pieceChar = first; cursor = 1; }
        var type = pieceChar ? CHAR_TO_PIECE[String.fromCharCode(pieceChar).toLowerCase()] : PAWN;
        var us = state.turn;
        var bb_lo = state.bb_lo, bb_hi = state.bb_hi; 
        
        var candL = 0, candH = 0;
        if (type === PAWN) {
            var isCapture = (clean.indexOf('x') !== -1) || (state.board[to] !== -1 && (state.board[to]>>3)!==us) || (to === state.ep_square);
            if (isCapture) {
                if(to<32) {
                    candL = PAWN_LO[us^1][to] & bb_lo[us*6+PAWN];
                    candH = PAWN_HI[us^1][to] & bb_hi[us*6+PAWN];
                } else {
                    candL = PAWN_LO[us^1][to] & bb_lo[us*6+PAWN];
                    candH = PAWN_HI[us^1][to] & bb_hi[us*6+PAWN];
                }
            }  else {
                var from1 = us === WHITE ? to - 8 : to + 8;
                if (from1 >= 0 && from1 < 64 && (state.board[from1]&7) === PAWN) {
                    if(from1<32) candL |= (1<<from1); else candH |= (1<<(from1-32));
                }
                var from2 = us === WHITE ? to - 16 : to + 16;
                var mid = us === WHITE ? to - 8 : to + 8;
                
                var isStandardDouble = Math.floor(to / 8) === (us===WHITE?3:4);
                var isHordeDouble = (state.gameMode === 'horde' && us === WHITE && Math.floor(to / 8) === 2);
                
                if ((isStandardDouble || isHordeDouble) && from2 >= 0 && from2 < 64 && (state.board[from2]&7) === PAWN && state.board[mid]===-1 && state.board[from1]===-1) {
                    if(from2<32) candL |= (1<<from2); else candH |= (1<<(from2-32));
                }
            }
        } else {
            if (type === KNIGHT) { candL=KNIGHT_LO[to]; candH=KNIGHT_HI[to]; }
            else if (type === KING) { candL=KING_LO[to]; candH=KING_HI[to]; }
            else if (state.gameMode === 'chaturanga' && type === BISHOP) {
                // ✨ Alfil SAN parsing
                let r = to >> 3, c = to & 7;
                [[2,2],[2,-2],[-2,2],[-2,-2]].forEach(d => {
                    let cr = r + d[0], cc = c + d[1];
                    if(cr>=0 && cr<8 && cc>=0 && cc<8) { let s=cr*8+cc; if(s<32) candL|=(1<<s); else candH|=(1<<(s-32)); }
                });
            }
            else if (state.gameMode === 'chaturanga' && type === QUEEN) {
                // ✨ Ferz SAN parsing
                let r = to >> 3, c = to & 7;
                [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(d => {
                    let cr = r + d[0], cc = c + d[1];
                    if(cr>=0 && cr<8 && cc>=0 && cc<8) { let s=cr*8+cc; if(s<32) candL|=(1<<s); else candH|=(1<<(s-32)); }
                });
            }
            else {
                let pL = bb_lo[us*6+type], pH = bb_hi[us*6+type];
                let occL=0, occH=0; 
                for(let i=0; i<12; i++) { occL|=bb_lo[i]; occH|=bb_hi[i]; }
                
                while (pL || pH) {
                    let from = ctz(pL, pH);
                    if(from<32) pL &= ~(1<<from); else pH &= ~(1<<(from-32));
                    let aligned = ALIGNED[from*64+to];
                    if (aligned) {
                        let r1=from>>3, f1=from&7, r2=to>>3, f2=to&7;
                        let isDiag = (Math.abs(r1-r2)===Math.abs(f1-f2));
                        if (type === ROOK && isDiag) continue;
                        if (type === BISHOP && !isDiag) continue;
                        let idx = from*64+to;
                        if (((BETWEEN_LO[idx]&occL)|(BETWEEN_HI[idx]&occH))===0) {
                            if(from<32) candL |= (1<<from); else candH |= (1<<(from-32));
                        }
                    }
                }
            }
            if (type === KNIGHT || type === KING) {
                candL &= bb_lo[us*6+type]; candH &= bb_hi[us*6+type];
            }
        }

        while (candL || candH) {
            var from = ctz(candL, candH);
            if(from<32) candL &= ~(1<<from); else candH &= ~(1<<(from-32));
            var match = true;
            if (destIndex - 1 > cursor) {
                var sStr = sq_str(from);
                for (var k = cursor; k < destIndex - 1; k++) {
                    var c = clean.charCodeAt(k);
                    if (c === 120) continue;
                    if (c >= 97 && c <= 104) { if (sStr.charCodeAt(0) !== c) { match = false; break; } }
                    else if (c >= 49 && c <= 56) { if (sStr.charCodeAt(1) !== c) { match = false; break; } }
                }
            }
            if (match) {
                var m = build_move_direct(state, from, to, promo);
                if (m) return m;
            }
        }
        return null;
    }
    
    function to_obj(state, m, nag, known_san) {
        var from = m & 0x3F, to = (m >>> 6) & 0x3F, flags = (m >>> 12) & 0xFF, promoInt = (m >>> 19) & 0x7;
        var f = "n";
        if (flags & BITS.KSIDE_CASTLE) f = "k";
        else if (flags & BITS.QSIDE_CASTLE) f = "q";
        else if ((flags & BITS.CAPTURE) && (flags & BITS.PROMOTION)) f = "cp";
        else if (flags & BITS.PROMOTION) f = "p";
        else if (flags & BITS.CAPTURE) f = "c";
        else if (flags & BITS.EP_CAPTURE) f = "e";
        else if (flags & BITS.BIG_PAWN) f = "b";
        else if (flags & BITS.DROP) f = "d"; // ✨ Recognize Drop Flags!

        // Handle Drops Object Formatting
        if (flags & BITS.DROP) {
            var pType = m & 0x3F; 
            var obj = { 
                color: state.turn===WHITE?'w':'b', from: '@', to: sq_str(to), 
                flags: 'd', piece: PIECE_TO_CHAR[pType], drop: PIECE_TO_CHAR[pType], 
                san: known_san || get_san(state, m) 
            };
            if (nag) obj.nag = nag;
            return obj;
        }

        var cap = undefined;
        if (flags & BITS.CAPTURE) {
            var t = (state.board[to]&7);
            if (t !== -1) cap = PIECE_TO_CHAR[t];
        } else if (flags & BITS.EP_CAPTURE) cap = 'p';
        var obj = { 
            color: state.turn===WHITE?'w':'b', from: sq_str(from), to: sq_str(to), flags: f, piece: PIECE_TO_CHAR[state.board[from]&7], 
            san: known_san || get_san(state, m), promotion: (flags & BITS.PROMOTION) ? PIECE_TO_CHAR[promoInt] : undefined, captured: cap 
        };
        if (state.gameMode === 'duck') obj.duck_sq = sq_str((m >>> 22) & 0x3F);
        if (nag) obj.nag = nag;
        return obj;
    }
    
    function get_san(state, m) {
        var flags = (m >>> 12) & 0xFF;
        
        // Handle Drop SAN string generation
        if (flags & BITS.DROP) {
            var pType = m & 0x3F;
            var to = (m >>> 6) & 0x3F;
            // ✨ SAFETY FIX: Verify the character exists before capitalizing
            var s = (PIECE_TO_CHAR[pType] ? PIECE_TO_CHAR[pType].toUpperCase() : '') + '@' + (SQ_STR[to] || '');
            var nextState = apply_move(state, m);
            if (is_checked(nextState, nextState.turn)) {
                if (generate_moves(nextState, {legal:true}).length === 0) s += '#'; else s += '+';
            }
            return s;
        }

        var from = m & 0x3F, to = (m >>> 6) & 0x3F, promo = (m >>> 19) & 0x7;
        if (flags & BITS.KSIDE_CASTLE) return "O-O"; 
        if (flags & BITS.QSIDE_CASTLE) return "O-O-O";
        
        // ✨ SAFETY FIX: Fallback to PAWN (0) if the square is corrupted (-1)
        var pType = state.board[from] !== -1 ? state.board[from] & 7 : 0; 
        var pChar = PIECE_TO_CHAR[pType];
        
        // ✨ SAFETY FIX: Make sure pChar actually exists before calling toUpperCase!
        var s = (pType !== 0 && pChar) ? pChar.toUpperCase() : "";
        
        var ambigFile = false, ambigRank = false;
        var us = state.turn;
        
        // ✨ SAFETY FIX: Guard against undefined bitboards
        var pL = state.bb_lo[us*6+pType] || 0;
        var pH = state.bb_hi[us*6+pType] || 0;
        
        var tempL = pL, tempH = pH;
        let count = 0;
        while (tempL || tempH) {
             let _sq = ctz(tempL, tempH);
             if(_sq<32) tempL &= ~(1<<_sq); else tempH &= ~(1<<(_sq-32));
             count++;
             if (count > 1) break; 
        }

        if (count > 1 && pType !== 0) { 
            var tempL2 = pL, tempH2 = pH;
            while (tempL2 || tempH2) {
                let _sq = ctz(tempL2, tempH2);
                if(_sq<32) tempL2 &= ~(1<<_sq); else tempH2 &= ~(1<<(_sq-32));
                
                if (_sq !== from) {
                    let mTest = build_move_direct(state, _sq, to, promo);
                    if (mTest !== null) {
                        var mStr = SQ_STR[from], oStr = SQ_STR[_sq];
                        if (mStr && oStr) {
                            if (mStr[0] === oStr[0]) ambigRank = true; else ambigFile = true;
                        }
                    }
                }
            }
        }
        
        if (SQ_STR[from]) {
            if (ambigFile) s += SQ_STR[from][0]; 
            else if (ambigRank) s += SQ_STR[from][1];
        }
        
        if (flags & (BITS.CAPTURE|BITS.EP_CAPTURE)) { 
            if (pType === 0 && !ambigFile && SQ_STR[from]) s += SQ_STR[from][0]; 
            s += "x"; 
        }
        if (SQ_STR[to]) s += SQ_STR[to];
        
        // ✨ SAFETY FIX: Make sure promotion char exists
        if (flags & BITS.PROMOTION) {
            s += "=" + (PIECE_TO_CHAR[promo] ? PIECE_TO_CHAR[promo].toUpperCase() : "Q");
        }
        
        if (state.gameMode === 'duck') {
            let duckSqStr = SQ_STR[(m >>> 22) & 0x3F];
            if (duckSqStr) s += "@" + duckSqStr;
        }
        
        return s;
    }
    
    function parse_nag(san) {
        var nag = "";
        var clean = san.replace(/([?!]+)/, function(m, p1) { nag = p1; return ""; });
        clean = clean.replace(/[+#=]/g, "").trim();
        return { clean: clean, nag: nag };
    }
    
    function check_variant_win(state) {
        switch (state.gameMode) {
            case '3check':
                if (state.checks.w >= 3) return WHITE; 
                if (state.checks.b >= 3) return BLACK; 
                return null;
            case 'horde':
                let whiteHasPieces = false;
                for (let i = 0; i < 64; i++) {
                    if (state.board[i] !== -1 && (state.board[i] >> 3) === WHITE) {
                        whiteHasPieces = true;
                        break;
                    }
                }
                if (!whiteHasPieces) return BLACK;
                return null;
            case 'atomic':
                let wKa = state.bb_lo[WHITE*6+KING] | state.bb_hi[WHITE*6+KING];
                let bKa = state.bb_lo[BLACK*6+KING] | state.bb_hi[BLACK*6+KING];
                if (!wKa && bKa) return BLACK;
                if (!bKa && wKa) return WHITE;
                return null;
            case 'antichess':
                let anti_us = state.turn;
                let anti_hasPieces = false;
                for (let i = 0; i < 64; i++) {
                    if (state.board[i] !== -1 && (state.board[i] >> 3) === anti_us) {
                        anti_hasPieces = true;
                        break;
                    }
                }
                if (!anti_hasPieces) return anti_us;
                
                let baseMoves = generate_standard_moves(state, {legal: true});
                if (baseMoves.length === 0) return anti_us;
                return null;
            case 'kingofthehill':
                let wk_lo = state.bb_lo[WHITE*6+KING], wk_hi = state.bb_hi[WHITE*6+KING];
                let bk_lo = state.bb_lo[BLACK*6+KING], bk_hi = state.bb_hi[BLACK*6+KING];
                if (wk_lo || wk_hi) {
                    let k = ctz(wk_lo, wk_hi);
                    if (k === 27 || k === 28 || k === 35 || k === 36) return WHITE;
                }
                if (bk_lo || bk_hi) {
                    let k = ctz(bk_lo, bk_hi);
                    if (k === 27 || k === 28 || k === 35 || k === 36) return BLACK;
                }
                return null;
            case 'racingkings':
                let rk_wK_lo = state.bb_lo[WHITE*6+KING], rk_wK_hi = state.bb_hi[WHITE*6+KING];
                let rk_bK_lo = state.bb_lo[BLACK*6+KING], rk_bK_hi = state.bb_hi[BLACK*6+KING];
                if ((rk_wK_lo || rk_wK_hi) && (rk_bK_lo || rk_bK_hi)) {
                    let rk_wk = ctz(rk_wK_lo, rk_wK_hi);
                    let rk_bk = ctz(rk_bK_lo, rk_bK_hi);
                    
                    // If Black reaches the 8th rank and White is not there, Black wins immediately!
                    if (rk_bk >= 56 && rk_wk < 56) return BLACK;
                    
                    // If White reaches 8th rank, White only wins if Black failed to catch up on their turn!
                    if (rk_wk >= 56 && rk_bk < 56 && state.turn === WHITE) return WHITE;
                    
                    // (Note: If both are >= 56, the in_draw() function successfully catches it as a Draw)
                }
                return null;
            case 'chaturanga':
                let c_wK = state.bb_lo[WHITE*6+KING] | state.bb_hi[WHITE*6+KING];
                let c_bK = state.bb_lo[BLACK*6+KING] | state.bb_hi[BLACK*6+KING];
                if (!c_wK) return BLACK;
                if (!c_bK) return WHITE;
                
                // ✨ Bare King Rule: If you strip the enemy of everything but their king, you win immediately!
                let w_pieces = 0, b_pieces = 0;
                for(let i=0; i<64; i++){
                    let p = state.board[i];
                    if(p !== -1) {
                        if((p>>3) === WHITE) w_pieces++;
                        else b_pieces++;
                    }
                }
                if (w_pieces === 1 && b_pieces > 1) return BLACK;
                if (b_pieces === 1 && w_pieces > 1) return WHITE;
                return null;
            // These variants rely on standard checkmate/draw rules
            case 'classical':
            case 'chess960':
            case 'bughouse':
            case 'crazyhouse':
                let std_wK = state.bb_lo[WHITE*6+KING] | state.bb_hi[WHITE*6+KING];
                let std_bK = state.bb_lo[BLACK*6+KING] | state.bb_hi[BLACK*6+KING];
                if (!std_wK) return BLACK;
                if (!std_bK) return WHITE;
                return null;
            case 'duck':
                let duck_wK = state.bb_lo[WHITE*6+KING] | state.bb_hi[WHITE*6+KING];
                let duck_bK = state.bb_lo[BLACK*6+KING] | state.bb_hi[BLACK*6+KING];
                if (!duck_wK) return BLACK;
                if (!duck_bK) return WHITE;
                
                if (generate_moves(state, {legal: true}).length === 0) {
                    return state.turn === WHITE ? BLACK : WHITE;
                }
                return null;
            default:              return null; 
        }
    }
    currentState = load_fen(fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", gameMode);
    history.push(currentState);
return {
        WHITE: 'w', BLACK: 'b',
        setGameMode: function(mode) { 
            currentState.gameMode = mode; 
            for (let i = 0; i < history.length; i++) history[i].gameMode = mode; 
        },
        gameMode: function() { return currentState.gameMode; },
        pocket: function() { return { w: [...currentState.pocket.w], b: [...currentState.pocket.b] }; },
        load: function(r) { 
            let s = load_fen(r, currentState.gameMode);
            if (!s) return false;
            currentState = s; 
            history=[currentState]; 
            return true; 
        },
        reset: function() { 
            currentState = load_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", currentState.gameMode); 
            if (currentState.gameMode === 'duck') currentState.duck_sq = -1;
            history=[currentState]; 
        },
        load_pgn: function(pgn) {
            currentState = load_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", currentState.gameMode); history=[currentState];
            var len = pgn.length, i = 0;
            while (i < len) {
                var c = pgn.charCodeAt(i);
                if (c <= 32) { i++; continue; }
                if (c === 91) { i++; while (i < len && pgn.charCodeAt(i) !== 93) i++; i++; continue; }
                if (c === 123) { i++; while (i < len && pgn.charCodeAt(i) !== 125) i++; i++; continue; }
                if (c === 40) { var depth = 1; i++; while (i < len && depth > 0) { var cc = pgn.charCodeAt(i); if (cc === 40) depth++; else if (cc === 41) depth--; i++; } continue; }
                
                var start = i; 
                while (i < len) { 
                    var cc = pgn.charCodeAt(i); 
                    if (cc <= 32 || cc === 93 || cc === 125 || cc === 41 || cc === 40 || cc === 123 || cc === 91) break; 
                    i++; 
                }
                var word = pgn.substring(start, i);
                
                if (word === "1-0" || word === "0-1" || word === "1/2-1/2" || word === "*") continue;
                
                var firstChar = word.charCodeAt(0);
                if (firstChar >= 48 && firstChar <= 57) { if (word.indexOf('.') !== -1 || word.indexOf('-') !== -1) continue; }
                
                var m = tr(currentState, word);
                if (m) { 
                    var nextState = apply_move(currentState, m);
                    history.push(nextState);
                    currentState = nextState;
                } else { return false; }
            }
            return true;
        },
        moves: function(o) {
            if (this.game_over()) return [];
            var ms = generate_moves(currentState, o); 
            return (o && o.verbose) ? ms.map(m=>to_obj(currentState,m)) : ms.map(m=>get_san(currentState,m)); 
        },
        move: function(o) {
            if (!o) return null;
            if (this.game_over()) return null;
            
            // ✨ SPELL CHESS BYPASS: Intercept spells before standard validation!
            if (typeof o === 'object' && o.isSpell) {
                var nextState = apply_spell(currentState, o.spellType, o.target);
                currentState = nextState;
                history.push(currentState);
                
                // Convert index to algebraic coordinate (e.g., 28 -> 'e5') safely
                var f = o.target & 7;
                var r = o.target >> 3;
                var targetSqStr = ['a','b','c','d','e','f','g','h'][f] + (8 - r);
                
                return {
                    color: currentState.turn === WHITE ? 'b' : 'w',
                    flags: 's',
                    from: '@',
                    to: targetSqStr,
                    piece: 's',
                    san: (o.spellType === 'freeze' ? 'Fz@' : 'Jp@') + targetSqStr,
                    isSpell: true
                };
            }

            var m = null;
            var nag = "";
            var clean_san = null;
            var explicit_duck = -1;
            
            if (typeof o === 'string') {
                var parsed = parse_nag(o);
                nag = parsed.nag;
                clean_san = parsed.clean;
                
                if (currentState.gameMode === 'duck') {
                    if (clean_san.includes(',')) {
                        let parts = clean_san.split(',');
                        clean_san = parts[0];
                        let d_str = parts[1].replace(/[^a-h1-8]/g, '');
                        explicit_duck = str_to_sq(d_str.length >= 2 ? d_str.substring(d_str.length - 2) : d_str); 
                    } else if (clean_san.includes('@')) {
                        let parts = clean_san.split('@');
                        clean_san = parts[0];
                        explicit_duck = str_to_sq(parts[1].replace(/[^a-h1-8]/g, ''));
                    } else {
                        let fsMatch = clean_san.match(/^([a-h][1-8][a-h][1-8][qrbn]?)([a-h][1-8])$/);
                        if (fsMatch) { clean_san = fsMatch[1]; explicit_duck = str_to_sq(fsMatch[2]); }
                    }
                } else if ((currentState.gameMode === 'crazyhouse' || currentState.gameMode === 'bughouse'|| currentState.gameMode === 'placement') && clean_san.includes('@')) {
                    // ✨ ENGINE DROP PARSER (e.g., P@e4)
                    let parts = clean_san.split('@');
                    let pTypeStr = parts[0].toLowerCase();
                    let pType = CHAR_TO_PIECE[pTypeStr.charAt(pTypeStr.length - 1)]; 
                    let toSq = str_to_sq(parts[1].replace(/[^a-h1-8]/g, ''));
                    m = pType | (toSq << 6) | (BITS.DROP << 12);
                    let legals = generate_moves(currentState, {legal: true});
                    if (!legals.includes(m)) m = null;
                    clean_san = null; // Important: Clear to skip standard parsing!
                }
                
                if (clean_san) {
                    if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(clean_san)) {
                        let f = str_to_sq(clean_san.substring(0,2));
                        let t = str_to_sq(clean_san.substring(2,4));
                        let p = clean_san.length === 5 ? clean_san[4] : null;
                        m = build_move_direct(currentState, f, t, p);
                    } else { m = tr(currentState, clean_san); }
                }
            } else {
                if (o.from === '@' || o.drop) {
                    // ✨ UI DROP PARSER
                    let pTypeStr = typeof o.drop === 'string' ? o.drop : o.piece;
                    let pType = CHAR_TO_PIECE[pTypeStr.toLowerCase()];
                    let t = (typeof o.to === 'number') ? o.to : str_to_sq(o.to);
                    m = pType | (t << 6) | (BITS.DROP << 12);
                    let legals = generate_moves(currentState, {legal: true});
                    if (!legals.includes(m)) m = null;
                } else {
                    let f = (typeof o.from === 'number') ? o.from : str_to_sq(o.from);
                    let t = (typeof o.to === 'number') ? o.to : str_to_sq(o.to);
                    m = build_move_direct(currentState, f, t, o.promotion); 
                    if (currentState.gameMode === 'duck' && o.duck_sq !== undefined) {
                        explicit_duck = (typeof o.duck_sq === 'number') ? o.duck_sq : str_to_sq(o.duck_sq);
                    }
                }
            }
            
            if (m === null) { error("INVALID_MOVE", o); return null; }
            
            if (currentState.gameMode === 'duck') {
                let duckToUse = (explicit_duck !== -1) ? explicit_duck : currentState.duck_sq;
                if (duckToUse === -1) duckToUse = 0; 
                m = (m & 0x3FFFFF) | (duckToUse << 22);
            }
            
            // ✨ LEAK 1 FIXED: Pass clean_san instead of null so it stops regenerating SAN dynamically!
            var ret = to_obj(currentState, m, nag, clean_san); 
            
            if (currentState.gameMode === 'duck') {
                // Ensure duck string safely extracts from SQ_STR if available, or compute fallback
                let dIdx = (m >>> 22) & 0x3F;
                let duckSqStr = ['a','b','c','d','e','f','g','h'][dIdx & 7] + (8 - (dIdx >> 3)); 
                let baseUci = ret.from + ret.to + (ret.promotion ? ret.promotion : '');
                ret.uci = baseUci + ',' + ret.to + duckSqStr;
            } else if ((currentState.gameMode === 'crazyhouse' || currentState.gameMode === 'bughouse'|| currentState.gameMode === 'placement') && (((m >>> 12) & 0xFF) & BITS.DROP)) {
                let pType = m & 0x3F;
                ret.uci = PIECE_TO_CHAR[pType].toUpperCase() + '@' + ret.to;
            } else {
                ret.uci = ret.from + ret.to + (ret.promotion ? ret.promotion : '');
            }
            
            var nextState = apply_move(currentState, m);
            
            var isVariantWin = check_variant_win(nextState) !== null;
            var isCheck = is_checked(nextState, nextState.turn);

            // ✨ LEAK 2 FIXED: Only generate legal moves if the King is actually in check!
            if (isVariantWin) {
                ret.san += "#";
            } else if (isCheck) {
                if (generate_moves(nextState, {legal:true}).length === 0) ret.san += "#"; 
                else ret.san += "+";
            }
            
            if (nag) { ret.san += nag; ret.nag = nag; }
            history.push(nextState);
            currentState = nextState;
            return ret;
        },
        undo: function() {
            if (history.length > 1) { // Keep history[0] as the permanent root
                var undone = history.pop();
                
                // ✨ RECYCLE: Push the memory back into the pool!
                if (STATE_POOL.length < 5000) STATE_POOL.push(undone);
                
                currentState = history[history.length - 1];
                return undone;
            }
            return null;
        },
        get: function(sq) { 
            var idx = str_to_sq(sq); if (idx === -1) return null;
            var t = (currentState.board[idx]&7); 
            var c = (currentState.board[idx]>>3);
            if (currentState.board[idx] !== -1) return { type: PIECE_TO_CHAR[t], color: c===WHITE?'w':'b' };
            return null;
        },
        fen: function() { 
            return generate_fen(currentState);
        },
        board: function() {
            var b = [];
            for (var r = 0; r < 8; r++) {
                var row = [];
                for (var f = 0; f < 8; f++) {
                    var sq = (7 - r) * 8 + f;
                    var val = currentState.board[sq];
                    if (val !== -1) {
                        let obj = { type: PIECE_TO_CHAR[val&7], color: (val>>3)===WHITE?'w':'b' };
                        // ✨ Export Alice Board B state!
                        if (currentState.gameMode === 'alice') {
                            if (sq < 32 ? (currentState.alice_b.lo & (1<<sq)) : (currentState.alice_b.hi & (1<<(sq-32)))) {
                                obj.isBoardB = true;
                            }
                        }
                        row.push(obj);
                    } else {
                        row.push(null);
                    }
                }
                b.push(row);
            }
            return b;
        },
        turn: function() { return currentState.turn===WHITE?'w':'b'; },
        variant_winner: function() { 
            let res = check_variant_win(currentState);
            if (res === WHITE) return 'w';
            if (res === BLACK) return 'b';

            if (currentState.gameMode === 'chaturanga') {
                if (!is_checked(currentState, currentState.turn) && generate_chaturanga_moves(currentState, {legal:true}).length === 0) {
                    return currentState.turn === WHITE ? 'b' : 'w';
                }
            }
            return null;
        },
        get_duck_sq: function() { return currentState.duck_sq; },
        in_check: function() { return is_checked(currentState, currentState.turn); },
        in_checkmate: function() { 
            if (check_variant_win(currentState) !== null) return true;
            return is_checked(currentState, currentState.turn) && generate_moves(currentState, {legal:true}).length === 0; 
        },
        in_stalemate: function() { if (currentState.gameMode === 'duck') return false; return !is_checked(currentState, currentState.turn) && generate_moves(currentState, {legal:true}).length === 0; },
        in_threefold_repetition: function() {
            var current_key = generate_fen(currentState).split(' ').slice(0, 4).join(' ');
            var count = 0;
            var limit = Math.max(0, history.length - currentState.half_moves - 1);
            
            for (var i = history.length - 1; i >= limit; i--) {
                var s = history[i];
                var k = generate_fen(s).split(' ').slice(0, 4).join(' ');
                if (k === current_key) {
                    count++;
                    if (count >= 3) return true;
                }
            }
            return false;
        },
        insufficient_material: function() {
            var s = currentState;
            var num_pieces = 0, num_knights = 0, num_bishops = 0, sum_bishop_colors = 0;

            for (var i = 0; i < 64; i++) {
                var val = s.board[i];
                if (val !== -1) {
                    var type = val & 7;
                    if (type === PAWN || type === ROOK || type === QUEEN) return false; 
                    num_pieces++;
                    if (type === KNIGHT) {
                        num_knights++;
                    } else if (type === BISHOP) {
                        num_bishops++;
                        var r = Math.floor(i / 8);
                        var c = i % 8;
                        sum_bishop_colors += ((r + c) % 2);
                    }
                }
            }
            
            if (num_pieces === 2) return true; 
            
            // A lone Knight or Bishop can easily deliver checks, 
            // so they are NOT insufficient! The game must go on!(Although with a knight it's a theoritical draw)
            if (s.gameMode === '3check' || s.gameMode === 'antichess'||s.gameMode === 'atomic') return false;
            if (s.gameMode === 'chaturanga') {
                if (num_pieces === 2) return true; // Only K vs K is a draw
                return false; 
            }
            if (num_pieces === 3 && (num_knights === 1 || num_bishops === 1)) return true;
            if (num_pieces === num_bishops + 2) {
                if (sum_bishop_colors === 0 || sum_bishop_colors === num_bishops) return true;
            }
            return false;
        },
        in_draw: function() { 
            if (currentState.gameMode === 'racingkings') {
                let wkL = currentState.bb_lo[WHITE*6+KING], wkH = currentState.bb_hi[WHITE*6+KING];
                let bkL = currentState.bb_lo[BLACK*6+KING], bkH = currentState.bb_hi[BLACK*6+KING];
                if ((wkL || wkH) && (bkL || bkH)) {
                    let wk = ctz(wkL, wkH), bk = ctz(bkL, bkH);
                    if (wk >= 56 && bk >= 56) return true;
                }
            }
            return currentState.half_moves >= 100 || this.in_stalemate() || this.in_threefold_repetition() || this.insufficient_material(); 
        },
        game_over: function() { 
            if (check_variant_win(currentState) !== null) return true;
            if (this.in_checkmate()) return true;
            if (this.in_draw()) return true;
            return false; 
        },
        validate_fen: function(fen) {
            if (!fen || typeof fen !== 'string') return { valid: false, error: 'Empty FEN string.' };
            const tokens = fen.trim().split(/\s+/);
            if (tokens.length < 4) return { valid: false, error: 'FEN must contain at least 4 fields.' };
            const ranks = tokens[0].split('/');
            if (ranks.length !== 8) return { valid: false, error: 'Piece placement must have 8 ranks.' };
            let s;
            try { s = load_fen(fen, currentState.gameMode); } catch (e) { return { valid: false, error: 'Invalid piece placement syntax.' }; }
            
            let wK = 0, bK = 0;
            for (let i = 0; i < 64; i++) {
                if (s.board[i] === (WHITE << 3 | KING)) wK++;
                if (s.board[i] === (BLACK << 3 | KING)) bK++;
            }
            
            if (currentState.gameMode === 'atomic' || currentState.gameMode === 'antichess') {
                if (wK > 1) return { valid: false, error: 'White cannot have more than one King.' };
                if (bK > 1) return { valid: false, error: 'Black cannot have more than one King.' };
            } else if (currentState.gameMode === 'horde') {
                if (wK !== 0) return { valid: false, error: 'White cannot have a King in Horde.' };
                if (bK !== 1) return { valid: false, error: 'Black must have exactly one King.' };
            } else {
                if (wK !== 1) return { valid: false, error: 'White must have exactly one King.' };
                if (bK !== 1) return { valid: false, error: 'Black must have exactly one King.' };
            }

            if (currentState.gameMode === 'horde') {
                for (let i = 0; i < 8; i++) {
                    const p1 = s.board[i], p8 = s.board[56 + i];
                    if (p8 !== -1 && (p8 & 7) === PAWN) return { valid: false, error: 'Pawns cannot be on the 8th rank.' };
                    if (p1 !== -1 && (p1 & 7) === PAWN && (p1 >> 3) === BLACK) return { valid: false, error: 'Black pawns cannot be on the 1st rank.' };
                }
            } else {
                for (let i = 0; i < 8; i++) {
                    const p1 = s.board[i], p8 = s.board[56 + i];
                    if ((p1 !== -1 && (p1 & 7) === PAWN) || (p8 !== -1 && (p8 & 7) === PAWN)) {
                        return { valid: false, error: 'Pawns cannot be on the 1st or 8th rank.' };
                    }
                }
            }
            const us = s.turn, them = us ^ 1;
            
            // Racing Kings checks are illegal, so ignore the "left in check" validation
            if (currentState.gameMode !== 'racingkings' && is_checked(s, them)) {
                const sideName = (them === WHITE) ? 'White' : 'Black';
                return { valid: false, error: `Illegal Position: ${sideName} is in check, but it is not their turn.` };
            }
            return { valid: true, error: 'No errors.' };
        },
        pocket: function() { 
            return currentState.pocket ? { w: [...currentState.pocket.w], b: [...currentState.pocket.b] } : { w: [], b: [] }; 
        },
        checks: function() { 
            return currentState.checks ? { w: currentState.checks.w, b: currentState.checks.b } : { w: 0, b: 0 }; 
        },
        alice_b: function() { 
            return currentState.alice_b ? { lo: currentState.alice_b.lo, hi: currentState.alice_b.hi } : { lo: 0, hi: 0 }; 
        },
        promoted: function() { 
            return currentState.promoted ? { lo: currentState.promoted.lo, hi: currentState.promoted.hi } : { lo: 0, hi: 0 }; 
        },
        duck_sq: function() { 
            return currentState.duck_sq !== undefined ? currentState.duck_sq : -1; 
        },
        frozen: function() { 
            return currentState.frozen ? { lo: currentState.frozen.lo, hi: currentState.frozen.hi } : { lo: 0, hi: 0 }; 
        },
        mana: function() {
            let getCharge = (cd) => 3 - Math.ceil(cd / 2);
            return currentState.mana ? {
                w: { freeze: getCharge(currentState.mana.w.freeze), jump: getCharge(currentState.mana.w.jump) },
                b: { freeze: getCharge(currentState.mana.b.freeze), jump: getCharge(currentState.mana.b.jump) }
            } : { w: {freeze: 3, jump: 3}, b: {freeze: 3, jump: 3} };
        },
        jump_sq: function() { 
            return currentState.jump_sq !== undefined ? currentState.jump_sq : -1; 
        },
    };
}