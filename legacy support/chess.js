var Chess = function(fen) {
    function log(ctx, msg) { console.log(`%c[${ctx}]`, "color: #0ff; font-weight: bold;", msg); }
    function error(ctx, msg) { console.error(`%c[${ctx}]`, "color: #f00; font-weight: bold;", msg); }

    const MAX_GAME_MOVES = 2048;
    const HIST_M = new Int32Array(MAX_GAME_MOVES);
    const HIST_C = new Int32Array(MAX_GAME_MOVES); 
    const HIST_E = new Int16Array(MAX_GAME_MOVES);
    const HIST_H = new Int16Array(MAX_GAME_MOVES);
    const HIST_N = new Int32Array(MAX_GAME_MOVES);
    const HIST_CAP = new Int8Array(MAX_GAME_MOVES);
    var HIST_META = new Array(MAX_GAME_MOVES);

    var hist_ply = 0;

    const WHITE = 0, BLACK = 1;
    const PAWN = 0, KNIGHT = 1, BISHOP = 2, ROOK = 3, QUEEN = 4, KING = 5;
    const PIECE_TO_CHAR = ['p', 'n', 'b', 'r', 'q', 'k'];
    const CHAR_TO_PIECE = { p:0, n:1, b:2, r:3, q:4, k:5 };
    const BITS = { NORMAL: 1, CAPTURE: 2, BIG_PAWN: 4, EP_CAPTURE: 8, PROMOTION: 16, KSIDE_CASTLE: 32, QSIDE_CASTLE: 64 };
    const SQ_STR = [
        "a1", "b1", "c1", "d1", "e1", "f1", "g1", "h1",
        "a2", "b2", "c2", "d2", "e2", "f2", "g2", "h2",
        "a3", "b3", "c3", "d3", "e3", "f3", "g3", "h3",
        "a4", "b4", "c4", "d4", "e4", "f4", "g4", "h4",
        "a5", "b5", "c5", "d5", "e5", "f5", "g5", "h5",
        "a6", "b6", "c6", "d6", "e6", "f6", "g6", "h6",
        "a7", "b7", "c7", "d7", "e7", "f7", "g7", "h7",
        "a8", "b8", "c8", "d8", "e8", "f8", "g8", "h8"
    ];

    var bb_lo = new Int32Array(12);
    var bb_hi = new Int32Array(12);
    var board_arr = new Int8Array(64).fill(-1);
    var turn = WHITE, castling = 0, ep_square = -1, half_moves = 0, move_number = 1, history = [];

    const MASKS_LO = new Int32Array(64);
    const MASKS_HI = new Int32Array(64);
    const FILE_MASKS_LO = new Int32Array(8);
    const FILE_MASKS_HI = new Int32Array(8);
    const KNIGHT_LO = new Int32Array(64);
    const KNIGHT_HI = new Int32Array(64);
    const KING_LO = new Int32Array(64);
    const KING_HI = new Int32Array(64);
    const PAWN_LO = [new Int32Array(64), new Int32Array(64)];
    const PAWN_HI = [new Int32Array(64), new Int32Array(64)];
    
    const BETWEEN_LO = new Int32Array(4096); 
    const BETWEEN_HI = new Int32Array(4096);
    const ALIGNED = new Uint8Array(4096);

    function init_tables() {
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
                let dist = Math.max(Math.abs(dr), Math.abs(df));
                let aligned = (r1===r2 || f1===f2 || Math.abs(dr)===Math.abs(df));
                ALIGNED[idx] = aligned ? 1 : 0;
                if (aligned && dist > 1) {
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
    }
    init_tables();
    function ctz(lo, hi) {
        if (lo !== 0) return 31 - Math.clz32(lo & -lo);
        return 32 + (31 - Math.clz32(hi & -hi));
    }
    function str_to_sq(s) { return (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97); }
    function sq_str(sq) { return SQ_STR[sq]; }
    function get_type_at(sq, col) {
        if (sq < 0 || sq > 63) return -1;
        const val = board_arr[sq];
        if (val === -1) return -1;
        if ((val >> 3) === col) return val & 7;
        return -1;
    }
    function get_char_at(sq) {
        const val = board_arr[sq];
        return val === -1 ? '' : PIECE_TO_CHAR[val & 7];
    }
    function get_occ() {
        let l=0, h=0;
        for(let i=0; i<12; i++) { l|=bb_lo[i]; h|=bb_hi[i]; }
        return {lo:l, hi:h};
    }
    function get_color_occ(c) {
        let l=0, h=0;
        for(let i=c*6; i<c*6+6; i++) { l|=bb_lo[i]; h|=bb_hi[i]; }
        return {lo:l, hi:h};
    }
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
    function is_attacked(sq, by_color) {
        if (sq < 32) {
            if ((PAWN_LO[by_color^1][sq] & bb_lo[by_color*6+PAWN]) | (PAWN_HI[by_color^1][sq] & bb_hi[by_color*6+PAWN])) return true;
        } else {
            if ((PAWN_LO[by_color^1][sq] & bb_lo[by_color*6+PAWN]) | (PAWN_HI[by_color^1][sq] & bb_hi[by_color*6+PAWN])) return true;
        }
        if ((KNIGHT_LO[sq] & bb_lo[by_color*6+KNIGHT]) | (KNIGHT_HI[sq] & bb_hi[by_color*6+KNIGHT])) return true;
        if ((KING_LO[sq] & bb_lo[by_color*6+KING]) | (KING_HI[sq] & bb_hi[by_color*6+KING])) return true;

        let occ = get_occ();
        let sliders = (bb_lo[by_color*6+QUEEN]|bb_lo[by_color*6+ROOK]|bb_lo[by_color*6+BISHOP]);
        let slidersH = (bb_hi[by_color*6+QUEEN]|bb_hi[by_color*6+ROOK]|bb_hi[by_color*6+BISHOP]);
        
        while(sliders || slidersH) {
            let from = ctz(sliders, slidersH);
            if(from < 32) sliders &= ~(1<<from); else slidersH &= ~(1<<(from-32));
            
            if (ALIGNED[from * 64 + sq]) {
                let p = board_arr[from] & 7;
                let r1=from>>3, c1=from&7, r2=sq>>3, c2=sq&7;
                let diag = Math.abs(r1-r2)===Math.abs(c1-c2);
                if (p === ROOK && diag) continue;
                if (p === BISHOP && !diag) continue;
                let idx = from*64+sq;
                if (((BETWEEN_LO[idx] & occ.lo) | (BETWEEN_HI[idx] & occ.hi)) === 0) return true;
            }
        }
        return false;
    }
    function is_checked(color) {
        if (typeof color === 'undefined') color = turn;
        let klo = bb_lo[color*6+KING], khi = bb_hi[color*6+KING];
        if (!klo && !khi) return false;
        let k = ctz(klo, khi);
        return is_attacked(k, color ^ 1);
    }
    function generate_moves(options) {
        var moves = [];
        var us = turn, them = us ^ 1;
        var occUs = get_color_occ(us), occThem = get_color_occ(them);
        var occAllL = occUs.lo | occThem.lo, occAllH = occUs.hi | occThem.hi;
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
            if (to < 8 || to >= 56) add_promo(moves, from, to, BITS.PROMOTION);
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
        process_pawn_caps(moves, capL_LO, capL_HI, occThem, us, -1);
        process_pawn_caps(moves, capR_LO, capR_HI, occThem, us, 1);

        let kL = bb_lo[us*6+KNIGHT], kH = bb_hi[us*6+KNIGHT];
        while (kL || kH) {
            let f = ctz(kL, kH);
            if(f<32) kL &= ~(1<<f); else kH &= ~(1<<(f-32));
            serialize_moves(moves, f, KNIGHT_LO[f]&~occUs.lo, KNIGHT_HI[f]&~occUs.hi, occThem);
        }
        kL = bb_lo[us*6+KING]; kH = bb_hi[us*6+KING];
        if(kL || kH) {
            let f = ctz(kL, kH);
            serialize_moves(moves, f, KING_LO[f]&~occUs.lo, KING_HI[f]&~occUs.hi, occThem);
        }

        [ROOK, QUEEN, BISHOP].forEach(type => {
            let pL = bb_lo[us*6+type], pH = bb_hi[us*6+type];
            while (pL || pH) {
                let f = ctz(pL, pH);
                if(f<32) pL &= ~(1<<f); else pH &= ~(1<<(f-32));
                let att = get_slider_attacks(type, f, occAllL, occAllH);
                serialize_moves(moves, f, att.lo&~occUs.lo, att.hi&~occUs.hi, occThem);
            }
        });

        if (!options || options.legal !== false) {
            if (us === WHITE) {
                if ((castling & 1) && !((occAllL|occAllH) & (MASKS_LO[5]|MASKS_LO[6]))) {
                    if (!is_attacked(4, BLACK) && !is_attacked(5, BLACK) && !is_attacked(6, BLACK)) add_move(moves, 4, 6, BITS.KSIDE_CASTLE);
                }
                if ((castling & 2) && !((occAllL|occAllH) & (MASKS_LO[1]|MASKS_LO[2]|MASKS_LO[3]))) {
                    if (!is_attacked(4, BLACK) && !is_attacked(3, BLACK) && !is_attacked(2, BLACK)) add_move(moves, 4, 2, BITS.QSIDE_CASTLE);
                }
            } else {
                if ((castling & 4) && !((occAllL|occAllH) & (MASKS_HI[29]|MASKS_HI[30]))) { // 61, 62 -> HI 29, 30
                    if (!is_attacked(60, WHITE) && !is_attacked(61, WHITE) && !is_attacked(62, WHITE)) add_move(moves, 60, 62, BITS.KSIDE_CASTLE);
                }
                if ((castling & 8) && !((occAllL|occAllH) & (MASKS_HI[25]|MASKS_HI[26]|MASKS_HI[27]))) { // 57,58,59
                    if (!is_attacked(60, WHITE) && !is_attacked(59, WHITE) && !is_attacked(58, WHITE)) add_move(moves, 60, 58, BITS.QSIDE_CASTLE);
                }
            }
        }

        var final_moves = [];
        for (var i = 0; i < moves.length; i++) {
            var m = moves[i];
            if (options && options.square) {
                let f = m & 0x3F;
                if (sq_str(f) !== options.square) continue;
            }
            if (!options || options.legal !== false) {
                if (is_legal_fast(m)) final_moves.push(m);
            } else {
                final_moves.push(m);
            }
        }
        return final_moves;
    }
    function add_move(l, f, t, fl) { l.push(f | (t << 6) | (fl << 12)); }
    function add_promo(l, f, t, fl) {
        l.push(f | (t << 6) | (fl << 12) | (4 << 19));
        l.push(f | (t << 6) | (fl << 12) | (3 << 19));
        l.push(f | (t << 6) | (fl << 12) | (2 << 19));
        l.push(f | (t << 6) | (fl << 12) | (1 << 19));
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
    function process_pawn_caps(list, bbL, bbH, enemies, us, offset) {
        if (ep_square !== -1) {
            let epMask = (ep_square<32) ? (1<<ep_square) : (1<<(ep_square-32));
            let hit = (ep_square<32) ? (bbL & epMask) : (bbH & epMask);
            if (hit) {
                let from = (us === WHITE) ? (offset === 1 ? ep_square - 9 : ep_square - 7) : (offset === 1 ? ep_square + 7 : ep_square + 9);
                if (from >= 0 && from < 64) add_move(list, from, ep_square, BITS.EP_CAPTURE);
            }
        }
        bbL &= enemies.lo; bbH &= enemies.hi;
        while (bbL || bbH) {
            let to = ctz(bbL, bbH);
            if(to<32) bbL &= ~(1<<to); else bbH &= ~(1<<(to-32));
            let from = (us === WHITE) ? (offset === 1 ? to - 9 : to - 7) : (offset === 1 ? to + 7 : to + 9);
            if (from >= 0 && from < 64 && get_type_at(from, us) === PAWN) {
                if (to < 8 || to >= 56) add_promo(list, from, to, BITS.CAPTURE | BITS.PROMOTION);
                else add_move(list, from, to, BITS.CAPTURE);
            }
        }
    }
    function parse_nag(san) {
        var nag = "";
        var clean = san.replace(/([?!]+)/, function(m, p1) { nag = p1; return ""; });
        clean = clean.replace(/[+#=]/g, "").trim();
        return { clean: clean, nag: nag };
    }
    function load_fen(fen) {
        var tokens = fen.split(/\s+/);
        bb_lo.fill(0); bb_hi.fill(0);
        board_arr.fill(-1);
        
        var sq = 56;
        for (var i = 0; i < tokens[0].length; i++) {
            var char = tokens[0].charAt(i);
            if (char === "/") sq -= 16;
            else if (/\d/.test(char)) sq += parseInt(char, 10);
            else {
                var color = (char < "a") ? WHITE : BLACK;
                var type = CHAR_TO_PIECE[char.toLowerCase()];
                if (sq >= 0 && sq < 64) {
                    if (sq < 32) bb_lo[color*6+type] |= (1<<sq);
                    else bb_hi[color*6+type] |= (1<<(sq-32));
                    board_arr[sq] = (color << 3) | type;
                }
                sq++;
            }
        }
        
        turn = (tokens[1] === 'w') ? WHITE : BLACK;
        castling = 0;
        if (tokens[2].indexOf("K") > -1) castling |= 1;
        if (tokens[2].indexOf("Q") > -1) castling |= 2;
        if (tokens[2].indexOf("k") > -1) castling |= 4;
        if (tokens[2].indexOf("q") > -1) castling |= 8;
        
        ep_square = (tokens[3] === '-' || !tokens[3]) ? -1 : str_to_sq(tokens[3]);
        half_moves = parseInt(tokens[4] || 0, 10);
        move_number = parseInt(tokens[5] || 1, 10);
        history = [];

        if (!(bb_lo[WHITE*6 + KING] & MASKS_LO[4])) castling &= ~3;
        if (!(bb_lo[WHITE*6 + ROOK] & MASKS_LO[7])) castling &= ~1;
        if (!(bb_lo[WHITE*6 + ROOK] & MASKS_LO[0])) castling &= ~2;
        if (!(bb_hi[BLACK*6 + KING] & MASKS_HI[60])) castling &= ~12;
        if (!(bb_hi[BLACK*6 + ROOK] & MASKS_HI[63])) castling &= ~4;
        if (!(bb_hi[BLACK*6 + ROOK] & MASKS_HI[56])) castling &= ~8;

        if (ep_square !== -1) {
            let capturedPawnSq = (turn === WHITE) ? ep_square - 8 : ep_square + 8;
            let expectedPawn = (turn === WHITE) ? (BLACK*6 + PAWN) : (WHITE*6 + PAWN);
            let mask = (capturedPawnSq<32) ? (1<<capturedPawnSq) : (1<<(capturedPawnSq-32));
            if (!((capturedPawnSq<32 ? bb_lo[expectedPawn] : bb_hi[expectedPawn]) & mask)) {
                ep_square = -1;
            }
        }
        return true;
    }
    function generate_fen() {
        var empty = 0, fen = "";
        for (var r = 7; r >= 0; r--) {
            for (var f = 0; f < 8; f++) {
                var sq = r * 8 + f;
                var type = get_type_at(sq, WHITE);
                var color = WHITE;
                if (type === -1) { type = get_type_at(sq, BLACK); color = BLACK; }
                if (type === -1) empty++;
                else {
                    if (empty > 0) { fen += empty; empty = 0; }
                    var char = PIECE_TO_CHAR[type];
                    fen += (color === WHITE) ? char.toUpperCase() : char;
                }
            }
            if (empty > 0) { fen += empty; empty = 0; }
            if (r > 0) fen += "/";
        }
        var c = "";
        if (castling & 1) c += "K"; if (castling & 2) c += "Q";
        if (castling & 4) c += "k"; if (castling & 8) c += "q";
        c = c || "-";
        var ep = (ep_square === -1) ? "-" : sq_str(ep_square);
        return [fen, (turn === WHITE ? 'w' : 'b'), c, ep, half_moves, move_number].join(" ");
    }
    function get_san(m) {
        var from = m & 0x3F, to = (m >>> 6) & 0x3F, flags = (m >>> 12) & 0x7F, promo = (m >>> 19) & 0x7;
        if (flags & BITS.KSIDE_CASTLE) return "O-O";
        if (flags & BITS.QSIDE_CASTLE) return "O-O-O";
        var pChar = get_char_at(from);
        var s = (pChar !== 'p' ? pChar.toUpperCase() : "");
        var ambigFile = false, ambigRank = false;
        var ms = generate_moves({legal:true});
        for (var i = 0; i < ms.length; i++) {
            var other = ms[i];
            var o_from = other & 0x3F;
            var o_to = (other >>> 6) & 0x3F;
            if (o_from !== from && o_to === to && get_char_at(o_from) === pChar) {
                var mStr = SQ_STR[from], oStr = SQ_STR[o_from];
                if (mStr[0] === oStr[0]) ambigRank = true; else ambigFile = true;
            }
        }
        if (ambigFile) s += SQ_STR[from][0];
        else if (ambigRank) s += SQ_STR[from][1];
        if (flags & (BITS.CAPTURE | BITS.EP_CAPTURE)) {
            if (pChar === 'p' && !ambigFile) s += SQ_STR[from][0];
            s += "x";
        }
        s += SQ_STR[to];
        if (flags & BITS.PROMOTION) s += "=" + PIECE_TO_CHAR[promo].toUpperCase();
        return s;
    }
    function is_legal_fast(m) {
        var us = turn, them = us ^ 1;
        var from = m & 0x3F, to = (m >>> 6) & 0x3F, flags = (m >>> 12) & 0x7F, promo = (m >>> 19) & 0x7;
        var piece = get_type_at(from, us);
        
        let fromMask = (from<32) ? (1<<from) : (1<<(from-32));
        let toMask = (to<32) ? (1<<to) : (1<<(to-32));
        let isLoFrom = from<32, isLoTo = to<32;

        if (isLoFrom) bb_lo[us*6+piece] &= ~fromMask; else bb_hi[us*6+piece] &= ~fromMask;
        if (isLoTo) bb_lo[us*6+piece] |= toMask; else bb_hi[us*6+piece] |= toMask;

        var cap_sq = to;
        var captured = -1;
        if (flags & BITS.CAPTURE) {
            captured = get_type_at(to, them);
            if (captured !== -1) {
                if(isLoTo) bb_lo[them*6+captured] &= ~toMask; else bb_hi[them*6+captured] &= ~toMask;
            }
        } else if (flags & BITS.EP_CAPTURE) {
            cap_sq = us===WHITE ? to-8 : to+8;
            let capMask = (cap_sq<32) ? (1<<cap_sq) : (1<<(cap_sq-32));
            if(cap_sq<32) bb_lo[them*6+PAWN] &= ~capMask; else bb_hi[them*6+PAWN] &= ~capMask;
        }
        if (flags & BITS.PROMOTION) {
            if(isLoTo) {
                bb_lo[us*6+PAWN] &= ~toMask;
                bb_lo[us*6+promo] |= toMask;
            } else {
                bb_hi[us*6+PAWN] &= ~toMask;
                bb_hi[us*6+promo] |= toMask;
            }
        }
        if (flags & BITS.KSIDE_CASTLE) {
            let rf=us===WHITE?7:63, rt=us===WHITE?5:61;
            let rfM=(rf<32)?(1<<rf):(1<<(rf-32)), rtM=(rt<32)?(1<<rt):(1<<(rt-32));
            if(rf<32) bb_lo[us*6+ROOK] &= ~rfM; else bb_hi[us*6+ROOK] &= ~rfM;
            if(rt<32) bb_lo[us*6+ROOK] |= rtM; else bb_hi[us*6+ROOK] |= rtM;
        } else if (flags & BITS.QSIDE_CASTLE) {
            let rf=us===WHITE?0:56, rt=us===WHITE?3:59;
            let rfM=(rf<32)?(1<<rf):(1<<(rf-32)), rtM=(rt<32)?(1<<rt):(1<<(rt-32));
            if(rf<32) bb_lo[us*6+ROOK] &= ~rfM; else bb_hi[us*6+ROOK] &= ~rfM;
            if(rt<32) bb_lo[us*6+ROOK] |= rtM; else bb_hi[us*6+ROOK] |= rtM;
        }

        var king_sq = (piece === KING) ? to : ctz(bb_lo[us*6+KING], bb_hi[us*6+KING]);
        var safe = (king_sq !== 64) && !is_attacked(king_sq, them);

        if (flags & BITS.KSIDE_CASTLE) {
            let rf=us===WHITE?7:63, rt=us===WHITE?5:61;
            let rfM=(rf<32)?(1<<rf):(1<<(rf-32)), rtM=(rt<32)?(1<<rt):(1<<(rt-32));
            if(rt<32) bb_lo[us*6+ROOK] &= ~rtM; else bb_hi[us*6+ROOK] &= ~rtM;
            if(rf<32) bb_lo[us*6+ROOK] |= rfM; else bb_hi[us*6+ROOK] |= rfM;
        } else if (flags & BITS.QSIDE_CASTLE) {
            let rf=us===WHITE?0:56, rt=us===WHITE?3:59;
            let rfM=(rf<32)?(1<<rf):(1<<(rf-32)), rtM=(rt<32)?(1<<rt):(1<<(rt-32));
            if(rt<32) bb_lo[us*6+ROOK] &= ~rtM; else bb_hi[us*6+ROOK] &= ~rtM;
            if(rf<32) bb_lo[us*6+ROOK] |= rfM; else bb_hi[us*6+ROOK] |= rfM;
        }
        if (flags & BITS.PROMOTION) {
            if(isLoTo) {
                bb_lo[us*6+promo] &= ~toMask;
                bb_lo[us*6+PAWN] |= toMask;
            } else {
                bb_hi[us*6+promo] &= ~toMask;
                bb_hi[us*6+PAWN] |= toMask;
            }
        }
        if (flags & BITS.EP_CAPTURE) {
            let cap_sq = us===WHITE ? to-8 : to+8;
            let capMask = (cap_sq<32) ? (1<<cap_sq) : (1<<(cap_sq-32));
            if(cap_sq<32) bb_lo[them*6+PAWN] |= capMask; else bb_hi[them*6+PAWN] |= capMask;
        } else if (flags & BITS.CAPTURE) {
            if(captured !== -1) {
                if(isLoTo) bb_lo[them*6+captured] |= toMask; else bb_hi[them*6+captured] |= toMask;
            }
        }
        if(isLoTo) bb_lo[us*6+piece] &= ~toMask; else bb_hi[us*6+piece] &= ~toMask;
        if(isLoFrom) bb_lo[us*6+piece] |= fromMask; else bb_hi[us*6+piece] |= fromMask;

        return safe;
    }
    function build_move_direct(from, to, promo) {
        if (from === to) return null;
        var us = turn, piece = get_type_at(from, us);
        if (piece === -1) return null;
        var them = us ^ 1, captured = get_type_at(to, them);
        var flags = BITS.NORMAL;
        var promoInt = 0;
        if (promo) {
            if (typeof promo === 'string') promoInt = CHAR_TO_PIECE[promo.toLowerCase()];
            else promoInt = promo;
        }
        if (piece === PAWN) {
            var diff = us === WHITE ? to - from : from - to;
            if (diff % 8 !== 0) {
                if (captured === -1 && to !== ep_square) return null;
                flags = (to === ep_square) ? BITS.EP_CAPTURE : BITS.CAPTURE;
            } else {
                if (captured !== -1) return null;
                if (diff === 16) flags = BITS.BIG_PAWN;
            }
            var rank = Math.floor(to / 8);
            if (rank === 0 || rank === 7) {
                flags |= BITS.PROMOTION;
                if (!promoInt) promoInt = QUEEN;
            }
        } else if (piece === KING) {
            if (Math.abs(to - from) === 2) {
                if (to > from) flags = BITS.KSIDE_CASTLE;
                else flags = BITS.QSIDE_CASTLE;
            } else if (captured !== -1) flags = BITS.CAPTURE;
        } else if (captured !== -1) flags = BITS.CAPTURE;
        
        var m = from | (to << 6) | (flags << 12) | (promoInt << 19);
        if (is_legal_fast(m)) return m;
        return null;
    }
    function make_move(m) {
        var us = turn, them = us ^ 1;
        var from = m & 0x3F, to = (m >>> 6) & 0x3F, flags = (m >>> 12) & 0x7F, promo = (m >>> 19) & 0x7;
        var p_type = get_type_at(from, us);
        if (p_type === -1) return false;
        var cap = -1;
        if (flags & BITS.CAPTURE) cap = get_type_at(to, them);
        else if (flags & BITS.EP_CAPTURE) cap = PAWN;
        
        history.push({ m: m, c: castling, e: ep_square, h: half_moves, n: move_number, cap: cap });

        let fromMask = (from<32)?(1<<from):(1<<(from-32));
        let toMask = (to<32)?(1<<to):(1<<(to-32));
        let isLoFrom = from<32, isLoTo = to<32;

        if(isLoFrom) bb_lo[us*6+p_type] &= ~fromMask; else bb_hi[us*6+p_type] &= ~fromMask;
        if(isLoTo) bb_lo[us*6+p_type] |= toMask; else bb_hi[us*6+p_type] |= toMask;
        board_arr[from] = -1; board_arr[to] = (us << 3) | p_type;

        if (flags & BITS.CAPTURE) {
            if (cap !== -1) {
                if(isLoTo) bb_lo[them*6+cap] &= ~toMask; else bb_hi[them*6+cap] &= ~toMask;
            }
        } else if (flags & BITS.EP_CAPTURE) {
            let ep_sq = us===WHITE ? to-8 : to+8;
            let epMask = (ep_sq<32)?(1<<ep_sq):(1<<(ep_sq-32));
            if(ep_sq<32) bb_lo[them*6+PAWN] &= ~epMask; else bb_hi[them*6+PAWN] &= ~epMask;
            board_arr[ep_sq] = -1;
        }
        if (flags & BITS.PROMOTION) {
            if(isLoTo) { bb_lo[us*6+PAWN] &= ~toMask; bb_lo[us*6+promo] |= toMask; }
            else { bb_hi[us*6+PAWN] &= ~toMask; bb_hi[us*6+promo] |= toMask; }
            board_arr[to] = (us << 3) | promo;
        }
        if (flags & BITS.KSIDE_CASTLE) {
            let rf=us===WHITE?7:63, rt=us===WHITE?5:61;
            let rfM=(rf<32)?(1<<rf):(1<<(rf-32)), rtM=(rt<32)?(1<<rt):(1<<(rt-32));
            if(rf<32) bb_lo[us*6+ROOK] &= ~rfM; else bb_hi[us*6+ROOK] &= ~rfM;
            if(rt<32) bb_lo[us*6+ROOK] |= rtM; else bb_hi[us*6+ROOK] |= rtM;
            board_arr[rf] = -1; board_arr[rt] = (us << 3) | ROOK;
        } else if (flags & BITS.QSIDE_CASTLE) {
            let rf=us===WHITE?0:56, rt=us===WHITE?3:59;
            let rfM=(rf<32)?(1<<rf):(1<<(rf-32)), rtM=(rt<32)?(1<<rt):(1<<(rt-32));
            if(rf<32) bb_lo[us*6+ROOK] &= ~rfM; else bb_hi[us*6+ROOK] &= ~rfM;
            if(rt<32) bb_lo[us*6+ROOK] |= rtM; else bb_hi[us*6+ROOK] |= rtM;
            board_arr[rf] = -1; board_arr[rt] = (us << 3) | ROOK;
        }

        if (p_type === KING) castling &= (us === WHITE) ? ~3 : ~12;
        if (p_type === ROOK) {
            if (from === 0) castling &= ~2; if (from === 7) castling &= ~1;
            if (from === 56) castling &= ~8; if (from === 63) castling &= ~4;
        }
        if (flags & BITS.CAPTURE) {
            if (to === 0) castling &= ~2; if (to === 7) castling &= ~1;
            if (to === 56) castling &= ~8; if (to === 63) castling &= ~4;
        }

        turn ^= 1;
        ep_square = (flags & BITS.BIG_PAWN) ? ((us === WHITE) ? to - 8 : to + 8) : -1;
        if (p_type === PAWN || (flags & BITS.CAPTURE)) half_moves = 0; else half_moves++;
        if (turn === WHITE) move_number++;
        return true;
    }
    function undo_move() {
        var s = history.pop(); if (!s) return null;
        var m = s.m;
        var from = m & 0x3F, to = (m >>> 6) & 0x3F, flags = (m >>> 12) & 0x7F;
        turn ^= 1; var us = turn, them = us ^ 1;
        castling = s.c; ep_square = s.e; half_moves = s.h; move_number = s.n;
        var p_val = board_arr[to];
        var p_type = p_val & 7;
        
        let fromMask = (from<32)?(1<<from):(1<<(from-32));
        let toMask = (to<32)?(1<<to):(1<<(to-32));
        let isLoFrom = from<32, isLoTo = to<32;

        if (flags & BITS.PROMOTION) {
            let promo = (m >>> 19) & 0x7;
            if(isLoTo) { bb_lo[us*6+promo] &= ~toMask; bb_lo[us*6+PAWN] |= fromMask; }
            else { bb_hi[us*6+promo] &= ~toMask; bb_hi[us*6+PAWN] |= fromMask; }
            board_arr[to] = -1; board_arr[from] = (us << 3) | PAWN;
        } else {
            if (p_type !== -1) {
                if(isLoTo) bb_lo[us*6+p_type] &= ~toMask; else bb_hi[us*6+p_type] &= ~toMask;
                if(isLoFrom) bb_lo[us*6+p_type] |= fromMask; else bb_hi[us*6+p_type] |= fromMask;
                board_arr[to] = -1; board_arr[from] = p_val;
            }
        }
        if (flags & BITS.CAPTURE) {
            if (s.cap !== -1) {
                if(isLoTo) bb_lo[them*6+s.cap] |= toMask; else bb_hi[them*6+s.cap] |= toMask;
                board_arr[to] = (them << 3) | s.cap;
            }
        } else if (flags & BITS.EP_CAPTURE) {
            let ep_sq = us===WHITE ? to-8 : to+8;
            let epMask = (ep_sq<32)?(1<<ep_sq):(1<<(ep_sq-32));
            if(ep_sq<32) bb_lo[them*6+PAWN] |= epMask; else bb_hi[them*6+PAWN] |= epMask;
            board_arr[ep_sq] = (them << 3) | PAWN;
        }
        if (flags & BITS.KSIDE_CASTLE) {
            let rf=us===WHITE?7:63, rt=us===WHITE?5:61;
            let rfM=(rf<32)?(1<<rf):(1<<(rf-32)), rtM=(rt<32)?(1<<rt):(1<<(rt-32));
            if(rt<32) bb_lo[us*6+ROOK] &= ~rtM; else bb_hi[us*6+ROOK] &= ~rtM;
            if(rf<32) bb_lo[us*6+ROOK] |= rfM; else bb_hi[us*6+ROOK] |= rfM;
            board_arr[rt] = -1; board_arr[rf] = (us << 3) | ROOK;
        } else if (flags & BITS.QSIDE_CASTLE) {
            let rf=us===WHITE?0:56, rt=us===WHITE?3:59;
            let rfM=(rf<32)?(1<<rf):(1<<(rf-32)), rtM=(rt<32)?(1<<rt):(1<<(rt-32));
            if(rt<32) bb_lo[us*6+ROOK] &= ~rtM; else bb_hi[us*6+ROOK] &= ~rtM;
            if(rf<32) bb_lo[us*6+ROOK] |= rfM; else bb_hi[us*6+ROOK] |= rfM;
            board_arr[rt] = -1; board_arr[rf] = (us << 3) | ROOK;
        }
        return m;
    }
    function to_obj(m, nag, known_san) {
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
            var t = get_type_at(to, turn^1);
            if (t !== -1) cap = PIECE_TO_CHAR[t];
        } else if (flags & BITS.EP_CAPTURE) cap = 'p';
        var obj = { 
            color: turn===WHITE?'w':'b', from: sq_str(from), to: sq_str(to), flags: f, piece: get_char_at(from), 
            san: known_san || get_san(m), promotion: (flags & BITS.PROMOTION) ? PIECE_TO_CHAR[promoInt] : undefined, captured: cap 
        };
        if (nag) obj.nag = nag;
        return obj;
    }
    function tr(san) {
        if (!san || typeof san !== 'string') return null;
        var len = san.length, end = len;
        while (end > 0) {
            var c = san.charCodeAt(end - 1);
            if (c === 43 || c === 35 || c === 33 || c === 63) end--; else break;
        }
        var clean = san.substring(0, end).trim();
        if (clean === "O-O" || clean === "0-0") return turn === WHITE ? build_move_direct(4, 6) : build_move_direct(60, 62);
        if (clean === "O-O-O" || clean === "0-0-0") return turn === WHITE ? build_move_direct(4, 2) : build_move_direct(60, 58);
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
        var us = turn;
        var candL = 0, candH = 0;

        if (type === PAWN) {
            var isCapture = (clean.indexOf('x') !== -1) || (get_type_at(to, us ^ 1) !== -1) || (to === ep_square);
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
                if (from1 >= 0 && from1 < 64 && get_type_at(from1, us) === PAWN) {
                    if(from1<32) candL |= (1<<from1); else candH |= (1<<(from1-32));
                }
                var from2 = us === WHITE ? to - 16 : to + 16;
                var rankCheck = us === WHITE ? 3 : 4; 
                var mid = us === WHITE ? to - 8 : to + 8;
                if (Math.floor(to / 8) === rankCheck && get_type_at(from2, us) === PAWN && get_type_at(mid, us) === -1 && get_type_at(from1, us) === -1) {
                    if(from2<32) candL |= (1<<from2); else candH |= (1<<(from2-32));
                }
            }
        } else {
            if (type === KNIGHT) { candL=KNIGHT_LO[to]; candH=KNIGHT_HI[to]; }
            else if (type === KING) { candL=KING_LO[to]; candH=KING_HI[to]; }
            else {
                let pL = bb_lo[us*6+type], pH = bb_hi[us*6+type];
                let occ = get_occ();
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
                        if (((BETWEEN_LO[idx]&occ.lo)|(BETWEEN_HI[idx]&occ.hi))===0) {
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
                var m = build_move_direct(from, to, promo);
                if (m) return m;
            }
        }
        return null;
    }
    load_fen(fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    return {
        WHITE: 'w', BLACK: 'b',
        load: function(r) { return load_fen(r); },
        reset: function() { return load_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"); },
        load_pgn: function(pgn) {
            log("PGN", "Loading..."); load_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
            var len = pgn.length, i = 0;
            while (i < len) {
                var c = pgn.charCodeAt(i);
                if (c <= 32) { i++; continue; }
                if (c === 91) { i++; while (i < len && pgn.charCodeAt(i) !== 93) i++; i++; continue; }
                if (c === 123) { i++; while (i < len && pgn.charCodeAt(i) !== 125) i++; i++; continue; }
                if (c === 40) { var depth = 1; i++; while (i < len && depth > 0) { var cc = pgn.charCodeAt(i); if (cc === 40) depth++; else if (cc === 41) depth--; i++; } continue; }
                var start = i; 
                while (i < len) { var cc = pgn.charCodeAt(i); if (cc <= 32 || cc === 93 || cc === 125 || cc === 41 || cc === 40) break; i++; }
                var word = pgn.substring(start, i);
                var firstChar = word.charCodeAt(0);
                if (firstChar >= 49 && firstChar <= 57) { if (word.indexOf('.') !== -1 || word.indexOf('-') !== -1) continue; }
                if (word === "*") continue;
                var m = tr(word);
                if (m) { 
                    if (!make_move(m)) { error("PGN", "Illegal move: " + word); return false; } 
                }
            }
            return true;
        },
        moves: function(o) { var ms = generate_moves(o); return (o && o.verbose) ? ms.map(to_obj) : ms.map(get_san); },
        move: function(o) {
            if (!o) return null;
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
                    m = build_move_direct(f, t, p);
                    clean_san = null;
                } else {
                    m = tr(clean_san);
                }
            } else {
                let f = (typeof o.from === 'number') ? o.from : str_to_sq(o.from);
                let t = (typeof o.to === 'number') ? o.to : str_to_sq(o.to);
                m = build_move_direct(f, t, o.promotion);
            }
            if (m === null) { error("INVALID_MOVE", o); return null; }
            var ret = to_obj(m, nag, clean_san);
            make_move(m);
            if (!clean_san && is_checked(turn)) {
                if (generate_moves({legal:true}).length === 0) ret.san += "#";
                else ret.san += "+";
            }
            if (nag) { ret.san += nag; ret.nag = nag; }
            return ret;
        },
        undo: function() {return undo_move();},
        get: function(sq) { 
            var idx = str_to_sq(sq); if (idx === -1) return null;
            var t = get_type_at(idx, WHITE); if (t !== -1) return { type: PIECE_TO_CHAR[t], color: 'w' };
            t = get_type_at(idx, BLACK); if (t !== -1) return { type: PIECE_TO_CHAR[t], color: 'b' };
            return null;
        },
        fen: function() { return generate_fen(); },
        board: function() {
            var b = [];
            for (var r = 0; r < 8; r++) {
                var row = [];
                for (var f = 0; f < 8; f++) {
                    var sq = (7 - r) * 8 + f;
                    var p = null;
                    var t = get_type_at(sq, WHITE);
                    if (t !== -1) p = { type: PIECE_TO_CHAR[t], color: 'w' };
                    else { t = get_type_at(sq, BLACK); if (t !== -1) p = { type: PIECE_TO_CHAR[t], color: 'b' }; }
                    row.push(p);
                }
                b.push(row);
            }
            return b;
        },
		header: function() {
			return G(arguments)
		},
		ascii: function() {
			return function() {
				for (var r = "   +------------------------+\n", e = N.a8; e <= N.h1; e++) {
					if (0 === ir(e) && (r += " " + "87654321"[or(e)] + " |"),
					null == O[e])
						r += " . ";
					else {
						var n = O[e].type;
						r += " " + (O[e].color === s ? n.toUpperCase() : n.toLowerCase()) + " "
					}
					e + 1 & 136 && (r += "|\n",
					e += 8)
				}
				return r += "   +------------------------+\n",
				r += "     a  b  c  d  e  f  g  h\n"
			}()
		},
		perft: function(r) {
			return function r(e) {
				for (var n = Z({
					legal: !1
				}), t = 0, o = q, i = 0, f = n.length; i < f; i++)
					er(n[i]),
					X(o) || (0 < e - 1 ? t += r(e - 1) : t++),
					nr();
				return t
			}(r)
		},
		square_color: function(r) {
			if (r in N) {
				var e = N[r];
				return (or(e) + ir(e)) % 2 == 0 ? "light" : "dark"
			}
			return null
		},
		validate_fen: function(r) {return $(r)},
        turn: function() { return turn===WHITE?'w':'b'; },
        in_check: function() { return is_checked(turn); },
        in_checkmate: function() { return is_checked(turn) && generate_moves({legal:true}).length === 0; },
        in_stalemate: function() { return !is_checked(turn) && generate_moves({legal:true}).length === 0; },
        in_draw: function() { return half_moves >= 100 || (!is_checked(turn) && generate_moves({legal:true}).length === 0); },
        insufficient_material: function() { return false; },
        game_over: function() { var ms = generate_moves({legal:true}); return ms.length === 0 || half_moves >= 100; },
        validate_fen: function(r) { return { valid: true, error_number: 0, error: 'No errors.' }; },
        history: function(o) {
            var hist = [];
            for (var i = 0; i < history.length; i++) {
                hist.push((o && o.verbose) ? to_obj(history[i].m) : get_san(history[i].m));
            }
            return hist;
        }
    }
};