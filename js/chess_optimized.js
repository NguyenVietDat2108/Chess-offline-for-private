//This file is a customized chess.js file that respect the ES5 architecture but optimized for normal chess and support multiple variants such as:
//'chess960','3check','antichess','atomic','bughouse','chaturanga','crazyhouse','duck','horde','kingofthehill','racingkings'
//history[] is left null since it is handled in chessgame.js which also handle engine games pv lines when Load_pgn, thus putting at here seems unreasonable.

var Chess = function(fen, gameMode = 'classical') {
    function log(ctx, msg) { console.log(`%c[${ctx}]`, "color: #0ff; font-weight: bold;", msg); }
    function error(ctx, msg) { console.error(`%c[${ctx}]`, "color: #f00; font-weight: bold;", msg); }

    const WHITE = 0, BLACK = 1;
    const PAWN = 0, KNIGHT = 1, BISHOP = 2, ROOK = 3, QUEEN = 4, KING = 5;
    const PIECE_TO_CHAR = ['p', 'n', 'b', 'r', 'q', 'k'];
    const CHAR_TO_PIECE = { p:0, n:1, b:2, r:3, q:4, k:5 };
    const BITS = { NORMAL: 1, CAPTURE: 2, BIG_PAWN: 4, EP_CAPTURE: 8, PROMOTION: 16, KSIDE_CASTLE: 32, QSIDE_CASTLE: 64 };
    const SQ_STR = [
        "a1", "b1", "c1", "d1", "e1", "f1", "g1", "h1", "a2", "b2", "c2", "d2", "e2", "f2", "g2", "h2",
        "a3", "b3", "c3", "d3", "e3", "f3", "g3", "h3", "a4", "b4", "c4", "d4", "e4", "f4", "g4", "h4",
        "a5", "b5", "c5", "d5", "e5", "f5", "g5", "h5", "a6", "b6", "c6", "d6", "e6", "f6", "g6", "h6",
        "a7", "b7", "c7", "d7", "e7", "f7", "g7", "h7", "a8", "b8", "c8", "d8", "e8", "f8", "g8", "h8"
    ];

    var currentState = null;
    var history = []; 

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
        return {lo:lo, hi:hi};
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
            checks: { w: 0, b: 0 },         // For 3-Check
            pocket: { w: [], b: [] },       // For Crazyhouse / Bughouse
            duck_sq: -1                     // For Duck Chess
        };
    }
    function clone_state(s) {
        return { 
            bb_lo: s.bb_lo.slice(), 
            bb_hi: s.bb_hi.slice(), 
            board: s.board.slice(), 
            turn: s.turn, 
            castling: s.castling, 
            ep_square: s.ep_square, 
            half_moves: s.half_moves, 
            move_number: s.move_number, 
            gameMode: s.gameMode,
            checks: { w: s.checks.w, b: s.checks.b },
            pocket: { w: [...s.pocket.w], b: [...s.pocket.b] },
            duck_sq: s.duck_sq
        };
    }
    
    function load_fen(fen, setGameMode = 'classical') {
        var s = create_empty_state();
        s.gameMode = setGameMode; 
        var tokens = fen.split(/\s+/);
        var sq = 56;
        for (var i = 0; i < tokens[0].length; i++) {
            var c = tokens[0].charAt(i);
            if (c === '/') sq -= 16; else if (/\d/.test(c)) sq += parseInt(c);
            else {
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
        s.half_moves = parseInt(tokens[4]||0); s.move_number = parseInt(tokens[5]||1);
        
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
        return s;
    }
    
    function generate_fen(targetState) {
        var s = targetState || currentState; 
        var empty = 0, fen = "";
        for (var r = 7; r >= 0; r--) {
            for (var f = 0; f < 8; f++) {
                var sq = r * 8 + f;
                var val = s.board[sq];
                if (val === -1) empty++;
                else {
                    if (empty > 0) { fen += empty; empty = 0; }
                    var char = PIECE_TO_CHAR[val & 7];
                    fen += ((val >> 3) === WHITE) ? char.toUpperCase() : char;
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
        let finalFen = [fen, (s.turn === WHITE ? 'w' : 'b'), c, ep, s.half_moves, s.move_number].join(" ");
        
        if (s.gameMode === '3check') {
            finalFen += ` +${s.checks.w}+${s.checks.b}`;
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
            if (prevState.board[to] !== -1 && (prevState.board[to] & 7) === ROOK && (prevState.board[to] >> 3) === us) {
                rf = to; 
            } else {
                let startF = isK ? 7 : 0; let step = isK ? -1 : 1;
                for(let f = startF; f >= 0 && f < 8; f += step) {
                    let sq = (us===WHITE?0:56) + f;
                    if(prevState.board[sq] === ((us<<3)|ROOK)) { rf = sq; break; }
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
        
        // Dynamic Rights Stripping (Checks King's actual starting position relative to the Rook!)
        if (p_type === ROOK) {
            let file = from & 7, rank = from >> 3;
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
        if (flags & BITS.CAPTURE) {
            let file = to & 7, rank = to >> 3;
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
    function apply_crazyhouse_move(prevState, m) { return apply_standard_move(prevState, m); }
    function apply_bughouse_move(prevState, m) { return apply_standard_move(prevState, m); }
    function apply_duck_move(prevState, m) { return apply_standard_move(prevState, m); }
    function apply_chaturanga_move(prevState, m) { return apply_standard_move(prevState, m); }

    // --------------------------------------------------------
    // VARIANT APPLY ROUTER (MASTER SHELL)
    // --------------------------------------------------------
    function apply_move(prevState, m) {
        let nextState;
        
        // 1. Route the physical board changes
        switch (prevState.gameMode) {
            case 'atomic':     nextState = apply_atomic_move(prevState, m); break;
            case 'bughouse':   nextState = apply_bughouse_move(prevState, m); break;
            case 'chaturanga': nextState = apply_chaturanga_move(prevState, m); break;
            case 'crazyhouse': nextState = apply_crazyhouse_move(prevState, m); break;
            case 'duck':       nextState = apply_duck_move(prevState, m); break;
            
            // Variants that just move pieces normally
            case 'classical':
            case 'chess960':
            case '3check':
            case 'antichess':
            case 'horde':
            case 'kingofthehill':
            case 'racingkings':
            default:           nextState = apply_standard_move(prevState, m); break;
        }

        // 2. Post-move state trackers
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
        if (sq < 32) {
            if ((PAWN_LO[by_color^1][sq] & bb_lo[by_color*6+PAWN]) | (PAWN_HI[by_color^1][sq] & bb_hi[by_color*6+PAWN])) return true;
        } else {
            if ((PAWN_LO[by_color^1][sq] & bb_lo[by_color*6+PAWN]) | (PAWN_HI[by_color^1][sq] & bb_hi[by_color*6+PAWN])) return true;
        }
        if ((KNIGHT_LO[sq] & bb_lo[by_color*6+KNIGHT]) | (KNIGHT_HI[sq] & bb_hi[by_color*6+KNIGHT])) return true;
        if ((KING_LO[sq] & bb_lo[by_color*6+KING]) | (KING_HI[sq] & bb_hi[by_color*6+KING])) return true;

        var occL=0, occH=0;
        for(let i=0; i<12; i++) { occL|=bb_lo[i]; occH|=bb_hi[i]; }

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
            
            case 'horde':       return color === BLACK ? is_standard_checked(state, color) : false; 
            case 'classical':
            case 'chess960':
            case '3check':
            case 'atomic':
                var wkL = state.bb_lo[WHITE*6+KING], wkH = state.bb_hi[WHITE*6+KING];
                var bkL = state.bb_lo[BLACK*6+KING], bkH = state.bb_hi[BLACK*6+KING];
                if ((wkL || wkH) && (bkL || bkH)) {
                    var wk = ctz(wkL, wkH), bk = ctz(bkL, bkH);
                    if (Math.abs((wk>>3)-(bk>>3)) <= 1 && Math.abs((wk&7)-(bk&7)) <= 1) return false;
                }
                return is_standard_checked(state, color);
            case 'bughouse':
            case 'chaturanga':
            case 'crazyhouse':
            case 'duck':
            case 'kingofthehill':
            default:            return is_standard_checked(state, color);
        }
    }
    
    function generate_standard_moves(state, options) {
        var moves = [];
        var us = state.turn, them = us ^ 1;
        var bb_lo = state.bb_lo, bb_hi = state.bb_hi;
        var occUsL = 0, occUsH = 0, occThemL = 0, occThemH = 0;
        for(let i=us*6; i<us*6+6; i++) { occUsL|=bb_lo[i]; occUsH|=bb_hi[i]; }
        for(let i=them*6; i<them*6+6; i++) { occThemL|=bb_lo[i]; occThemH|=bb_hi[i]; }
        var occAllL = occUsL | occThemL, occAllH = occUsH | occThemH;
        var emptyL = ~occAllL, emptyH = ~occAllH;
        var pL = bb_lo[us*6+PAWN], pH = bb_hi[us*6+PAWN];

        var sL, sH;
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

        let kL = bb_lo[us*6+KNIGHT], kH = bb_hi[us*6+KNIGHT];
        while (kL || kH) {
            let f = ctz(kL, kH);
            if(f<32) kL &= ~(1<<f); else kH &= ~(1<<(f-32));
            serialize_moves(moves, f, KNIGHT_LO[f]&~occUsL, KNIGHT_HI[f]&~occUsH, {lo:occThemL, hi:occThemH});
        }
        kL = bb_lo[us*6+KING]; kH = bb_hi[us*6+KING];
        if(kL || kH) {
            let f = ctz(kL, kH);
            serialize_moves(moves, f, KING_LO[f]&~occUsL, KING_HI[f]&~occUsH, {lo:occThemL, hi:occThemH});
        }
        [ROOK, QUEEN, BISHOP].forEach(type => {
            let pL = bb_lo[us*6+type], pH = bb_hi[us*6+type];
            while (pL || pH) {
                let f = ctz(pL, pH);
                if(f<32) pL &= ~(1<<f); else pH &= ~(1<<(f-32));
                let att = get_slider_attacks(type, f, occAllL, occAllH);
                serialize_moves(moves, f, att.lo&~occUsL, att.hi&~occUsH, {lo:occThemL, hi:occThemH});
            }
        });

        if (!options || options.legal !== false) {
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
            
            // 🔥 RACING KINGS FIX: You are absolutely NOT allowed to put the opponent in check!
            if (!is_standard_checked(next, us ^ 1)) {
                valid.push(m);
            }
        }
        return valid; 
    }
    function generate_bughouse_moves(state, options) { return generate_standard_moves(state, options); }
    function generate_chaturanga_moves(state, options) { return generate_standard_moves(state, options); }
    function generate_crazyhouse_moves(state, options) { return generate_standard_moves(state, options); }
    function generate_duck_moves(state, options) { return generate_standard_moves(state, options); }
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

    // --------------------------------------------------------
    // VARIANT MOVE GENERATOR ROUTER (MASTER SHELL)
    // --------------------------------------------------------
    function generate_moves(state, options) {
        switch(state.gameMode) {
            // Variants with custom move generation or piece drops
            case 'antichess':   return generate_antichess_moves(state, options);
            case 'atomic':      return generate_atomic_moves(state, options);
            case 'bughouse':    return generate_bughouse_moves(state, options);
            case 'chaturanga':  return generate_chaturanga_moves(state, options);
            case 'crazyhouse':  return generate_crazyhouse_moves(state, options);
            case 'duck':        return generate_duck_moves(state, options);
            case 'horde':       return generate_horde_moves(state, options);
            case 'racingkings': return generate_racingkings_moves(state, options);
            
            // Variants that rely entirely on standard move generation rules
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
        var us = state.turn, piece = (state.board[from]&7);
        if (state.board[from] === -1 || (state.board[from]>>3) !== us) return null;
        
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
                if (diff === 16) flags = BITS.BIG_PAWN;
            }
            var rank = Math.floor(to / 8);
            if (rank === 0 || rank === 7) {
                flags |= BITS.PROMOTION;
                if (!promoInt) promoInt = QUEEN;
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
        var next = apply_move(state, m);
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
            } else {
                var from1 = us === WHITE ? to - 8 : to + 8;
                if (from1 >= 0 && from1 < 64 && (state.board[from1]&7) === PAWN) {
                    if(from1<32) candL |= (1<<from1); else candH |= (1<<(from1-32));
                }
                var from2 = us === WHITE ? to - 16 : to + 16;
                var mid = us === WHITE ? to - 8 : to + 8;
                if (Math.floor(to / 8) === (us===WHITE?3:4) && (state.board[from2]&7) === PAWN && state.board[mid]===-1 && state.board[from1]===-1) {
                    if(from2<32) candL |= (1<<from2); else candH |= (1<<(from2-32));
                }
            }
        } else {
            if (type === KNIGHT) { candL=KNIGHT_LO[to]; candH=KNIGHT_HI[to]; }
            else if (type === KING) { candL=KING_LO[to]; candH=KING_HI[to]; }
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
        var from = m & 0x3F, to = (m >>> 6) & 0x3F, flags = (m >>> 12) & 0x7F, promoInt = (m >>> 19) & 0x7;
        var f = "n";
        if (flags & BITS.KSIDE_CASTLE) f = "k";
        else if (flags & BITS.QSIDE_CASTLE) f = "q";
        else if ((flags & BITS.CAPTURE) && (flags & BITS.PROMOTION)) f = "cp";
        else if (flags & BITS.PROMOTION) f = "p";
        else if (flags & BITS.CAPTURE) f = "c";
        else if (flags & BITS.EP_CAPTURE) f = "e";
        else if (flags & BITS.BIG_PAWN) f = "b";
        var cap = undefined;
        if (flags & BITS.CAPTURE) {
            var t = (state.board[to]&7);
            if (t !== -1) cap = PIECE_TO_CHAR[t];
        } else if (flags & BITS.EP_CAPTURE) cap = 'p';
        var obj = { 
            color: state.turn===WHITE?'w':'b', from: sq_str(from), to: sq_str(to), flags: f, piece: PIECE_TO_CHAR[state.board[from]&7], 
            san: known_san || get_san(state, m), promotion: (flags & BITS.PROMOTION) ? PIECE_TO_CHAR[promoInt] : undefined, captured: cap 
        };
        if (nag) obj.nag = nag;
        return obj;
    }
    
    function get_san(state, m) {
        var from = m & 0x3F, to = (m >>> 6) & 0x3F, flags = (m >>> 12) & 0x7F, promo = (m >>> 19) & 0x7;
        if (flags & BITS.KSIDE_CASTLE) return "O-O"; 
        if (flags & BITS.QSIDE_CASTLE) return "O-O-O";
        var pType = state.board[from] & 7; 
        var pChar = PIECE_TO_CHAR[pType];
        var s = (pType !== PAWN ? pChar.toUpperCase() : "");
        var ambigFile = false, ambigRank = false;
        var us = state.turn;
        var pL = state.bb_lo[us*6+pType], pH = state.bb_hi[us*6+pType];
        
        var tempL = pL, tempH = pH;
        let count = 0;
        while (tempL || tempH) {
             let _sq = ctz(tempL, tempH);
             if(_sq<32) tempL &= ~(1<<_sq); else tempH &= ~(1<<(_sq-32));
             count++;
             if (count > 1) break; 
        }

        if (count > 1) {
            var ms = generate_moves(state, {legal:true}); 
            for (var i = 0; i < ms.length; i++) {
                var o = ms[i];
                var o_f = o & 0x3F, o_t = (o >>> 6) & 0x3F;
                if (o_f !== from && o_t === to && (state.board[o_f]&7) === pType) {
                    var mStr = SQ_STR[from], oStr = SQ_STR[o_f];
                    if (mStr[0] === oStr[0]) ambigRank = true; else ambigFile = true;
                }
            }
        }
        
        if (ambigFile) s += SQ_STR[from][0]; 
        else if (ambigRank) s += SQ_STR[from][1];
        if (flags & (BITS.CAPTURE|BITS.EP_CAPTURE)) { 
            if (pType===PAWN && !ambigFile) s += SQ_STR[from][0]; 
            s += "x"; 
        }
        s += SQ_STR[to];
        if (flags & BITS.PROMOTION) s += "=" + PIECE_TO_CHAR[promo].toUpperCase();
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
                    if (rk_wk >= 56 && rk_bk < 56 && state.turn === WHITE) return WHITE;
                    if (rk_bk >= 56 && rk_wk < 56 && state.turn === BLACK) return BLACK;
                }
                return null;
            
            // These variants rely on standard checkmate/draw rules
            case 'classical':
            case 'chess960':
            case 'bughouse':
            case 'chaturanga':
            case 'crazyhouse':
            case 'duck':
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
        
        load: function(r) { currentState = load_fen(r, currentState.gameMode); history=[currentState]; return true; },
        reset: function() { currentState = load_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", currentState.gameMode); history=[currentState]; },
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
            
            var m = null;
            var nag = "";
            var clean_san = null;
            
            if (typeof o === 'string') {
                var parsed = parse_nag(o);
                nag = parsed.nag;
                clean_san = parsed.clean;
                if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(clean_san)) {
                    let f = str_to_sq(clean_san.substring(0,2));
                    let t = str_to_sq(clean_san.substring(2,4));
                    let p = clean_san.length === 5 ? clean_san[4] : null;
                    m = build_move_direct(currentState, f, t, p); 
                    clean_san = null;
                } else {
                    m = tr(currentState, clean_san); 
                }
            } else {
                let f = (typeof o.from === 'number') ? o.from : str_to_sq(o.from);
                let t = (typeof o.to === 'number') ? o.to : str_to_sq(o.to);
                m = build_move_direct(currentState, f, t, o.promotion); 
            }
            
            if (m === null) { error("INVALID_MOVE", o); return null; }
            
            var ret = to_obj(currentState, m, nag, null); 
            var nextState = apply_move(currentState, m);
            
            var isVariantWin = check_variant_win(nextState) !== null;
            var isCheck = is_checked(nextState, nextState.turn);
            var noMoves = generate_moves(nextState, {legal:true}).length === 0;

            if (isVariantWin || (isCheck && noMoves)) {
                ret.san += "#"; // Variant wins (like 3rd check) get Checkmate notation!
            } else if (isCheck) {
                ret.san += "+";
            }
            
            if (nag) { ret.san += nag; ret.nag = nag; }
            history.push(nextState);
            currentState = nextState;
            return ret;
        },
        undo: function() {
            if (history.length > 1) {
                history.pop();
                currentState = history[history.length - 1];
            }
        },
        get: function(sq) { 
            var idx = str_to_sq(sq); if (idx === -1) return null;
            var t = (currentState.board[idx]&7); 
            var c = (currentState.board[idx]>>3);
            if (currentState.board[idx] !== -1) return { type: PIECE_TO_CHAR[t], color: c===WHITE?'w':'b' };
            return null;
        },
        fen: function() { return generate_fen(currentState); }, // 🔥 FIXED: Pass currentState
        board: function() {
            var b = [];
            for (var r = 0; r < 8; r++) {
                var row = [];
                for (var f = 0; f < 8; f++) {
                    var sq = (7 - r) * 8 + f;
                    var val = currentState.board[sq];
                    if (val !== -1) row.push({ type: PIECE_TO_CHAR[val&7], color: (val>>3)===WHITE?'w':'b' });
                    else row.push(null);
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
            return null;
        },
        in_check: function() { return is_checked(currentState, currentState.turn); },
        in_checkmate: function() { 
            if (check_variant_win(currentState) !== null) return true;
            return is_checked(currentState, currentState.turn) && generate_moves(currentState, {legal:true}).length === 0; 
        },
        in_stalemate: function() { return !is_checked(currentState, currentState.turn) && generate_moves(currentState, {legal:true}).length === 0; },
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
            if (s.gameMode === '3check' || s.gameMode === 'antichess') return false;

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
            const tokens = fen.split(/\s+/);
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
        }
    };
}