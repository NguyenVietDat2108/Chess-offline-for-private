/**
 * Part of this file is derived from chess.js (https://github.com)
 * Copyright (c) Jeff Hlywa
 * Released under the BSD 2-Clause License.
 * 
 * Modifications and variant support extensions:
 * Copyright (c) 2026 Ngvida2108
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://gnu.org>.
 */
//This file is a customized chess.js file that optimized for normal chess and support multiple variants such as:
//'chess960','3check','antichess','atomic','bughouse','chaturanga','crazyhouse','duck','horde','kingofthehill','racingkings','alice'
//history[] is left null since it is handled in chessgame.js which also handle engine games pv lines when Load_pgn, thus putting at here seems unreasonable.

    const RAY_N_LO = new Int32Array(64), RAY_N_HI = new Int32Array(64);
    const RAY_S_LO = new Int32Array(64), RAY_S_HI = new Int32Array(64);
    const RAY_E_LO = new Int32Array(64), RAY_E_HI = new Int32Array(64);
    const RAY_W_LO = new Int32Array(64), RAY_W_HI = new Int32Array(64);
    const RAY_NW_LO = new Int32Array(64), RAY_NW_HI = new Int32Array(64);
    const RAY_NE_LO = new Int32Array(64), RAY_NE_HI = new Int32Array(64);
    const RAY_SW_LO = new Int32Array(64), RAY_SW_HI = new Int32Array(64);
    const RAY_SE_LO = new Int32Array(64), RAY_SE_HI = new Int32Array(64);
    const MOVE_BUFFER = new Int32Array(256);
    const FEN_BUFFER = new Uint8Array(256);
    const EMPTY_POCKET = { w: [], b: [] };
    const ELEPHANT_LO = new Int32Array(64), ELEPHANT_HI = new Int32Array(64);
    const MANTRI_LO = new Int32Array(64), MANTRI_HI = new Int32Array(64);
    const HASH_HISTORY = new Int32Array(2048);
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
    const STATE_POOL = [];
    const CHAR_CODE_TO_PIECE = new Int8Array(128).fill(-1);
    CHAR_CODE_TO_PIECE[112] = 0; CHAR_CODE_TO_PIECE[80] = 0; // p, P
    CHAR_CODE_TO_PIECE[110] = 1; CHAR_CODE_TO_PIECE[78] = 1; // n, N
    CHAR_CODE_TO_PIECE[98]  = 2; CHAR_CODE_TO_PIECE[66] = 2; // b, B
    CHAR_CODE_TO_PIECE[114] = 3; CHAR_CODE_TO_PIECE[82] = 3; // r, R
    CHAR_CODE_TO_PIECE[113] = 4; CHAR_CODE_TO_PIECE[81] = 4; // q, Q
    CHAR_CODE_TO_PIECE[107] = 5; CHAR_CODE_TO_PIECE[75] = 5; // k, K

    const FEN_PIECE_CODES = [
        [80, 78, 66, 82, 81, 75],    // White: P, N, B, R, Q, K
        [112, 110, 98, 114, 113, 107] // Black: p, n, b, r, q, k
    ];
    function create_empty_state() {
        return { 
            board: new Int8Array(64).fill(-1),
            castling_mask: new Int8Array(64).fill(15),
            bb_lo: new Int32Array(12), 
            bb_hi: new Int32Array(12), 
            turn: WHITE, castling: 0, ep_square: -1, half_moves: 0, move_number: 1, 
            gameMode: 'classical', zobrist: 0,
            checks_w: 0, checks_b: 0,         
            pocket_w: 0, pocket_b: 0,
            promoted_lo: 0, promoted_hi: 0,     
            duck_sq: -1,                    
            alice_b_lo: 0, alice_b_hi: 0,
            frozen_lo: 0, frozen_hi: 0,
            mana_w_freeze: 0, mana_w_jump: 0, mana_b_freeze: 0, mana_b_jump: 0,
            spell_uses_w_freeze: 5, spell_uses_w_jump: 2, spell_uses_b_freeze: 5, spell_uses_b_jump: 2,
            active_w_frozen_sq: -1, active_w_frozen_timer: 0,
            active_b_frozen_sq: -1, active_b_frozen_timer: 0,
            active_w_jump_sq: -1, active_w_jump_timer: 0,
            active_b_jump_sq: -1, active_b_jump_timer: 0
        };
    }
    for (let i = 0; i < 256; i++) {
        STATE_POOL.push(create_empty_state());
    }
    const MASKS_LO = new Int32Array(64), MASKS_HI = new Int32Array(64);
    const FILE_MASKS_LO = new Int32Array(8), FILE_MASKS_HI = new Int32Array(8);
    const KNIGHT_LO = new Int32Array(64), KNIGHT_HI = new Int32Array(64);
    const KING_LO = new Int32Array(64), KING_HI = new Int32Array(64);
    const PAWN_LO = [new Int32Array(64), new Int32Array(64)];
    const PAWN_HI = [new Int32Array(64), new Int32Array(64)];
    const BETWEEN_LO = new Int32Array(4096), BETWEEN_HI = new Int32Array(4096);
    const ALIGNED = new Uint8Array(4096);
    const ZOBRIST = {
        pieces: new Int32Array(768),
        castling: new Int32Array(16),
        ep: new Int32Array(64),
        turn: 0,
        duck: new Int32Array(64),
        alice_b: new Int32Array(64),
        pockets: new Int32Array(12 * 32),
        checks_w: new Int32Array(4),
        checks_b: new Int32Array(4)
    };
    const SLIDER_OUT = {lo: 0, hi: 0};
    let moveCount = 0;

    (function init_chaturanga_tables() {
        const set_bit = (obj, sq) => { if(sq < 32) obj.lo |= (1 << sq); else obj.hi |= (1 << (sq - 32)); };
        for (let i = 0; i < 64; i++) {
            let r = i >> 3, f = i & 7;
            let el = {lo: 0, hi: 0}, mn = {lo: 0, hi: 0};
            [[r+2,f+2],[r+2,f-2],[r-2,f+2],[r-2,f-2]].forEach(x => {
                if (x[0] >= 0 && x[0] < 8 && x[1] >= 0 && x[1] < 8) set_bit(el, x[0]*8 + x[1]);
            });
            ELEPHANT_LO[i] = el.lo >>> 0; ELEPHANT_HI[i] = el.hi >>> 0;
            [[r+1,f+1],[r+1,f-1],[r-1,f+1],[r-1,f-1]].forEach(x => {
                if (x[0] >= 0 && x[0] < 8 && x[1] >= 0 && x[1] < 8) set_bit(mn, x[0]*8 + x[1]);
            });
            MANTRI_LO[i] = mn.lo >>> 0; MANTRI_HI[i] = mn.hi >>> 0;
        }
    })();
    function popcount32(n) {
        n = n - ((n >> 1) & 0x55555555);
        n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
        return Math.imul((n + (n >> 4)) & 0x0F0F0F0F, 0x01010101) >> 24;
    }
    function popcount(lo, hi) {
        return popcount32(lo) + popcount32(hi);
    }
    function ctz(lo, hi) {
        if (lo !== 0) return 31 - Math.clz32(lo & -lo);
        return 32 + (31 - Math.clz32(hi & -hi));
    }
    function clz(lo, hi) {
        if (hi !== 0) return 32 + (31 - Math.clz32(hi));
        if (lo !== 0) return 31 - Math.clz32(lo);
        return -1;
    }
    function sq_str(sq) { 
        return (sq >= 0 && sq < 64) ? SQ_STR[sq] : "";
    }
    function str_to_sq(s) { 
        if (!s || s.length < 2) return -1;
        let f = s.charCodeAt(0);
        if (f < 97) f += 32; 
        return (s.charCodeAt(1) - 49) * 8 + (f - 97); 
    }
    function compute_zobrist(s) {
        let z = 0;
        if (s.turn === BLACK) z ^= ZOBRIST.turn;
        z ^= ZOBRIST.castling[s.castling];
        if (s.ep_square !== -1) z ^= ZOBRIST.ep[s.ep_square];

        for (let c = 0; c < 2; c++) {
            for (let p = 0; p < 6; p++) {
                let bbL = s.bb_lo[c * 6 + p], bbH = s.bb_hi[c * 6 + p];
                while(bbL || bbH) {
                    let sq = ctz(bbL, bbH);
                    if (sq < 32) bbL &= ~(1<<sq); else bbH &= ~(1<<(sq-32));
                    z ^= ZOBRIST.pieces[(c * 6 + p) * 64 + sq];
                }
            }
        }
        if (s.gameMode === 'crazyhouse' || s.gameMode === 'placement' || s.gameMode === 'bughouse') {
            for(let pType=0; pType<=4; pType++) {
                let wC = (s.pocket_w >> (pType * 5)) & 31, bC = (s.pocket_b >> (pType * 5)) & 31;
                for(let i=0; i<wC; i++) z ^= ZOBRIST.pieces[(WHITE*6 + pType)*64];
                for(let i=0; i<bC; i++) z ^= ZOBRIST.pieces[(BLACK*6 + pType)*64];
            }
        }
        return z;
    }
    function get_slider_attacks(type, sq, occL, occH) {
        let attL = 0, attH = 0;
        let rL, rH, blockL, blockH, blocker;

        if (type === ROOK || type === QUEEN) {
            rL = RAY_N_LO[sq]; rH = RAY_N_HI[sq];
            blockL = rL & occL; blockH = rH & occH;
            if (blockL || blockH) {
                blocker = ctz(blockL, blockH);
                rL ^= RAY_N_LO[blocker]; rH ^= RAY_N_HI[blocker];
            }
            attL |= rL; attH |= rH;

            rL = RAY_E_LO[sq]; rH = RAY_E_HI[sq];
            blockL = rL & occL; blockH = rH & occH;
            if (blockL || blockH) {
                blocker = ctz(blockL, blockH);
                rL ^= RAY_E_LO[blocker]; rH ^= RAY_E_HI[blocker];
            }
            attL |= rL; attH |= rH;

            rL = RAY_S_LO[sq]; rH = RAY_S_HI[sq];
            blockL = rL & occL; blockH = rH & occH;
            if (blockL || blockH) {
                blocker = clz(blockL, blockH);
                rL ^= RAY_S_LO[blocker]; rH ^= RAY_S_HI[blocker];
            }
            attL |= rL; attH |= rH;

            rL = RAY_W_LO[sq]; rH = RAY_W_HI[sq];
            blockL = rL & occL; blockH = rH & occH;
            if (blockL || blockH) {
                blocker = clz(blockL, blockH);
                rL ^= RAY_W_LO[blocker]; rH ^= RAY_W_HI[blocker];
            }
            attL |= rL; attH |= rH;
        }

        if (type === BISHOP || type === QUEEN) {
            rL = RAY_NE_LO[sq]; rH = RAY_NE_HI[sq];
            blockL = rL & occL; blockH = rH & occH;
            if (blockL || blockH) {
                blocker = ctz(blockL, blockH);
                rL ^= RAY_NE_LO[blocker]; rH ^= RAY_NE_HI[blocker];
            }
            attL |= rL; attH |= rH;

            rL = RAY_NW_LO[sq]; rH = RAY_NW_HI[sq];
            blockL = rL & occL; blockH = rH & occH;
            if (blockL || blockH) {
                blocker = ctz(blockL, blockH);
                rL ^= RAY_NW_LO[blocker]; rH ^= RAY_NW_HI[blocker];
            }
            attL |= rL; attH |= rH;

            rL = RAY_SE_LO[sq]; rH = RAY_SE_HI[sq];
            blockL = rL & occL; blockH = rH & occH;
            if (blockL || blockH) {
                blocker = clz(blockL, blockH);
                rL ^= RAY_SE_LO[blocker]; rH ^= RAY_SE_HI[blocker];
            }
            attL |= rL; attH |= rH;

            rL = RAY_SW_LO[sq]; rH = RAY_SW_HI[sq];
            blockL = rL & occL; blockH = rH & occH;
            if (blockL || blockH) {
                blocker = clz(blockL, blockH);
                rL ^= RAY_SW_LO[blocker]; rH ^= RAY_SW_HI[blocker];
            }
            attL |= rL; attH |= rH;
        }
        SLIDER_OUT.lo = attL >>> 0;
        SLIDER_OUT.hi = attH >>> 0;
        return SLIDER_OUT;
    }
    function clone_state(s) {
        var c = STATE_POOL.pop() || create_empty_state();
        c.board.set(s.board);
        c.castling_mask = s.castling_mask;
        c.bb_lo.set(s.bb_lo);
        c.bb_hi.set(s.bb_hi);
        c.turn = s.turn; c.castling = s.castling; c.ep_square = s.ep_square;
        c.half_moves = s.half_moves; c.move_number = s.move_number; 
        c.gameMode = s.gameMode; c.zobrist = s.zobrist;
        c.checks_w = s.checks_w; c.checks_b = s.checks_b;
        c.pocket_w = s.pocket_w; c.pocket_b = s.pocket_b;
        c.promoted_lo = s.promoted_lo; c.promoted_hi = s.promoted_hi;
        c.duck_sq = s.duck_sq;
        c.alice_b_lo = s.alice_b_lo; c.alice_b_hi = s.alice_b_hi;
        c.frozen_lo = s.frozen_lo; c.frozen_hi = s.frozen_hi;
        c.mana_w_freeze = s.mana_w_freeze; c.mana_w_jump = s.mana_w_jump;
        c.mana_b_freeze = s.mana_b_freeze; c.mana_b_jump = s.mana_b_jump;
        c.spell_uses_w_freeze = s.spell_uses_w_freeze; c.spell_uses_w_jump = s.spell_uses_w_jump;
        c.spell_uses_b_freeze = s.spell_uses_b_freeze; c.spell_uses_b_jump = s.spell_uses_b_jump;
        c.active_w_frozen_sq = s.active_w_frozen_sq; c.active_w_frozen_timer = s.active_w_frozen_timer;
        c.active_b_frozen_sq = s.active_b_frozen_sq; c.active_b_frozen_timer = s.active_b_frozen_timer;
        c.active_w_jump_sq = s.active_w_jump_sq; c.active_w_jump_timer = s.active_w_jump_timer;
        c.active_b_jump_sq = s.active_b_jump_sq; c.active_b_jump_timer = s.active_b_jump_timer;
        return c;
    }
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
    function rand32() { return (Math.random() * 0x100000000) | 0; }
        for (let i = 0; i < 768; i++) ZOBRIST.pieces[i] = rand32();
        for (let i = 0; i < 16; i++) ZOBRIST.castling[i] = rand32();
        for (let i = 0; i < 64; i++) ZOBRIST.ep[i] = rand32();
        ZOBRIST.turn = rand32();
        const set_ray = (obj, sq, dr, df) => {
        let r = sq >> 3, f = sq & 7;
        let lo = 0, hi = 0;
        while (true) {
            r += dr; f += df;
            if (r < 0 || r > 7 || f < 0 || f > 7) break;
            let targetSq = r * 8 + f;
            if (targetSq < 32) lo |= (1 << targetSq); else hi |= (1 << (targetSq - 32));
        }
        obj.lo[sq] = lo; obj.hi[sq] = hi;
    };
    for (let i = 0; i < 64; i++) ZOBRIST.duck[i] = rand32();
    for (let i = 0; i < 64; i++) ZOBRIST.alice_b[i] = rand32();
    for (let i = 0; i < 384; i++) ZOBRIST.pockets[i] = rand32();
    for (let i = 0; i < 4; i++) { ZOBRIST.checks_w[i] = rand32(); ZOBRIST.checks_b[i] = rand32(); }
    
    for (let i = 0; i < 64; i++) {
        set_ray({lo: RAY_N_LO, hi: RAY_N_HI}, i, 1, 0);   // N 
        set_ray({lo: RAY_S_LO, hi: RAY_S_HI}, i, -1, 0);  // S
        set_ray({lo: RAY_E_LO, hi: RAY_E_HI}, i, 0, 1);   // E
        set_ray({lo: RAY_W_LO, hi: RAY_W_HI}, i, 0, -1);  // W
        set_ray({lo: RAY_NE_LO, hi: RAY_NE_HI}, i, 1, 1); // NE
        set_ray({lo: RAY_NW_LO, hi: RAY_NW_HI}, i, 1, -1);// NW
        set_ray({lo: RAY_SE_LO, hi: RAY_SE_HI}, i, -1, 1);// SE
        set_ray({lo: RAY_SW_LO, hi: RAY_SW_HI}, i, -1, -1);// SW
    }
    })();
    function get_piece_at(state, sq) {
        if ((sq & ~63) !== 0) return -1;
        return state.board[sq];
    }
    function is_attacked_classical(state, sq, by_color) {
        var bb_lo = state.bb_lo, bb_hi = state.bb_hi;

        if (sq < 32) {
            if (PAWN_LO[by_color ^ 1][sq] & bb_lo[by_color * 6 + PAWN]) return true;
        } else {
            if (PAWN_HI[by_color ^ 1][sq] & bb_hi[by_color * 6 + PAWN]) return true;
        }
        if ((KNIGHT_LO[sq] & bb_lo[by_color * 6 + KNIGHT]) | (KNIGHT_HI[sq] & bb_hi[by_color * 6 + KNIGHT])) return true;
        if ((KING_LO[sq] & bb_lo[by_color * 6 + KING]) | (KING_HI[sq] & bb_hi[by_color * 6 + KING])) return true;

        var occL = 0, occH = 0;
        for (let i = 0; i < 12; i++) { 
            occL |= bb_lo[i]; 
            occH |= bb_hi[i]; 
        }
        var rAtt = get_slider_attacks(ROOK, sq, occL, occH);
        var enemyRookQueenL = bb_lo[by_color * 6 + ROOK] | bb_lo[by_color * 6 + QUEEN];
        var enemyRookQueenH = bb_hi[by_color * 6 + ROOK] | bb_hi[by_color * 6 + QUEEN];
        if ((rAtt.lo & enemyRookQueenL) !== 0 || (rAtt.hi & enemyRookQueenH) !== 0) return true;

        var bAtt = get_slider_attacks(BISHOP, sq, occL, occH);
        var enemyBishopQueenL = bb_lo[by_color * 6 + BISHOP] | bb_lo[by_color * 6 + QUEEN];
        var enemyBishopQueenH = bb_hi[by_color * 6 + BISHOP] | bb_hi[by_color * 6 + QUEEN];
        if ((bAtt.lo & enemyBishopQueenL) !== 0 || (bAtt.hi & enemyBishopQueenH) !== 0) return true;

        return false;
    }
    function is_attacked_variant(state, sq, by_color) {
        var bb_lo = state.bb_lo, bb_hi = state.bb_hi;
        let bMaskL = 0xFFFFFFFF, bMaskH = 0xFFFFFFFF;
        if (state.gameMode === 'alice') {
            let isB = sq < 32 ? (state.alice_b_lo & (1<<sq)) : (state.alice_b_hi & (1<<(sq-32)));
            bMaskL = isB ? state.alice_b_lo : ~state.alice_b_lo;
            bMaskH = isB ? state.alice_b_hi : ~state.alice_b_hi;
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
        
        var occL = 0, occH = 0;
        for (let i = 0; i < 12; i++) {
            occL |= bb_lo[i];
            occH |= bb_hi[i];
        }
        if (state.gameMode === 'duck' && state.duck_sq !== -1) {
            if (state.duck_sq < 32) occL |= (1 << state.duck_sq);
            else occH |= (1 << (state.duck_sq - 32));
        }
        if (state.gameMode === 'spell' && state.active_spells) {
            let jW = state.active_spells.w_jump_timer > 0 ? state.active_spells.w_jump_sq : -1;
            let jB = state.active_spells.b_jump_timer > 0 ? state.active_spells.b_jump_sq : -1;
            if (jW !== -1) { if (jW < 32) occL &= ~(1 << jW); else occH &= ~(1 << (jW - 32)); }
            if (jB !== -1) { if (jB < 32) occL &= ~(1 << jB); else occH &= ~(1 << (jB - 32)); }
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

            sliders = (bb_lo[by_color*6+ROOK]) >>> 0;
            slidersH = (bb_hi[by_color*6+ROOK]) >>> 0;
        } else {
            sliders = (bb_lo[by_color*6+QUEEN]|bb_lo[by_color*6+ROOK]|bb_lo[by_color*6+BISHOP]) >>> 0;
            slidersH = (bb_hi[by_color*6+QUEEN]|bb_hi[by_color*6+ROOK]|bb_hi[by_color*6+BISHOP]) >>> 0;
            if (state.gameMode === 'alice') {
                sliders = (sliders & bMaskL) >>> 0; 
                slidersH = (slidersH & bMaskH) >>> 0;
            }
        }
        
        while(sliders || slidersH) {
            let from = ctz(sliders, slidersH);
            if(from < 32) sliders &= ~(1<<from); else slidersH &= ~(1<<(from-32));
            
            if (ALIGNED[from * 64 + sq]) {
                let p = get_piece_at(state, from) & 7;
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
    function is_attacked(state, sq, by_color) {
        let rules = VariantRules[state.gameMode] || VariantRules.classical;
        return rules.attacked(state, sq, by_color);
    }

    const VariantRules = {
        classical:   { apply: apply_standard_move,   attacked: is_attacked_classical },
        chess960:    { apply: apply_standard_move,   attacked: is_attacked_classical },
        '3check':    { apply: apply_standard_move,   attacked: is_attacked_classical },
        antichess:   { apply: apply_standard_move,   attacked: is_attacked_classical },
        horde:       { apply: apply_standard_move,   attacked: is_attacked_classical },
        kingofthehill: { apply: apply_standard_move, attacked: is_attacked_classical },
        racingkings: { apply: apply_standard_move,   attacked: is_attacked_classical },
        atomic:      { apply: apply_atomic_move,     attacked: is_attacked_classical },
        crazyhouse:  { apply: apply_crazyhouse_move, attacked: is_attacked_classical },
        bughouse:    { apply: apply_bughouse_move,   attacked: is_attacked_classical },
        placement:   { apply: apply_crazyhouse_move, attacked: is_attacked_classical },
        
        duck:        { apply: apply_duck_move,       attacked: is_attacked_variant },
        alice:       { apply: apply_alice_move,      attacked: is_attacked_variant },
        chaturanga:  { apply: apply_chaturanga_move, attacked: is_attacked_variant },
        spell:       { apply: apply_standard_move,   attacked: is_attacked_variant }
    };
    function apply_move(prevState, m) {
        if (typeof m === 'object' && m.isSpell) {
            return apply_spell(prevState, m.spellType, m.target);
        }

        let rules = VariantRules[prevState.gameMode] || VariantRules.classical;
        let nextState = rules.apply(prevState, m);

        if (prevState.gameMode === 'placement' && nextState.pocket.w.length === 0 && nextState.pocket.b.length === 0 && 
           (prevState.pocket.w.length > 0 || prevState.pocket.b.length > 0)) {
            let c = 0; 
            if (get_piece_at(nextState, 4) === ((WHITE << 3) | KING)) { 
                if (get_piece_at(nextState, 7) === ((WHITE << 3) | ROOK)) c |= 1; 
                if (get_piece_at(nextState, 0) === ((WHITE << 3) | ROOK)) c |= 2; 
            }
            if (get_piece_at(nextState, 60) === ((BLACK << 3) | KING)) { 
                if (get_piece_at(nextState, 63) === ((BLACK << 3) | ROOK)) c |= 4; 
                if (get_piece_at(nextState, 56) === ((BLACK << 3) | ROOK)) c |= 8; 
            }
            nextState.castling = c;
        }

        if (prevState.gameMode === '3check') {
            if (is_standard_checked(nextState, nextState.turn)) {
                let us = prevState.turn; 
                if (us === WHITE) nextState.checks_w++;
                else nextState.checks_b++;
            }
        }
        if (prevState.gameMode !== 'classical' && prevState.gameMode !== 'chess960' && prevState.gameMode !== 'horde') {
             nextState.zobrist = compute_zobrist(nextState);
        }
        return nextState;
    }
    function is_standard_legal_fast(state, m) {
        var us = state.turn, them = us ^ 1;
        var from = m & 0x3F, to = (m >>> 6) & 0x3F, flags = (m >>> 12) & 0x7F, promoInt = (m >>> 19) & 0x7;
        
        if (flags & 128) return !is_checked(apply_move(state, m), us);

        var piece = get_piece_at(state, from) & 7;
        
        var cap_sq = to;
        var captured = -1;
        if (flags & 2) { 
            captured = get_piece_at(state, to) & 7;
        }

        let fromMask = (from<32) ? (1<<from) : (1<<(from-32));
        let toMask = (to<32) ? (1<<to) : (1<<(to-32));
        let isLoFrom = from<32, isLoTo = to<32;

        if (isLoFrom) state.bb_lo[us*6+piece] &= ~fromMask; else state.bb_hi[us*6+piece] &= ~fromMask;
        if (isLoTo) state.bb_lo[us*6+piece] |= toMask; else state.bb_hi[us*6+piece] |= toMask;

        if (flags & 2) { 
            if (captured !== -1) {
                if(isLoTo) state.bb_lo[them*6+captured] &= ~toMask; else state.bb_hi[them*6+captured] &= ~toMask;
            }
        } else if (flags & 8) { 
            cap_sq = us===WHITE ? to-8 : to+8; 
            let capMask = (cap_sq<32) ? (1<<cap_sq) : (1<<(cap_sq-32));
            if(cap_sq<32) state.bb_lo[them*6+PAWN] &= ~capMask; else state.bb_hi[them*6+PAWN] &= ~capMask; 
        }
        
        if (flags & 16) { 
            if(isLoTo) {
                state.bb_lo[us*6+PAWN] &= ~toMask; 
                state.bb_lo[us*6+promo] |= toMask;
            } else {
                state.bb_hi[us*6+PAWN] &= ~toMask;
                state.bb_hi[us*6+promo] |= toMask;
            }
        }
        
        if (flags & 32) { 
            let rf=us===WHITE?7:63, rt=us===WHITE?5:61;
            let rfM=(rf<32)?(1<<rf):(1<<(rf-32)), rtM=(rt<32)?(1<<rt):(1<<(rt-32));
            if(rf<32) state.bb_lo[us*6+ROOK] &= ~rfM; else state.bb_hi[us*6+ROOK] &= ~rfM; 
            if(rt<32) state.bb_lo[us*6+ROOK] |= rtM; else state.bb_hi[us*6+ROOK] |= rtM;
        } else if (flags & 64) { 
            let rf=us===WHITE?0:56, rt=us===WHITE?3:59;
            let rfM=(rf<32)?(1<<rf):(1<<(rf-32)), rtM=(rt<32)?(1<<rt):(1<<(rt-32));
            if(rf<32) state.bb_lo[us*6+ROOK] &= ~rfM; else state.bb_hi[us*6+ROOK] &= ~rfM;
            if(rt<32) state.bb_lo[us*6+ROOK] |= rtM; else state.bb_hi[us*6+ROOK] |= rtM;
        }

        var klo = state.bb_lo[us*6+KING], khi = state.bb_hi[us*6+KING];
        var king_sq = (piece === KING) ? to : ((klo === 0 && khi === 0) ? 64 : ctz(klo, khi));
        var safe = (king_sq === 64) || !is_attacked(state, king_sq, them);

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
                state.bb_lo[us*6+PAWN] |= fromMask;
            } else {
                state.bb_hi[us*6+promo] &= ~toMask;
                state.bb_hi[us*6+PAWN] |= fromMask;
            }
        } else {
            if(isLoTo) state.bb_lo[us*6+piece] &= ~toMask; else state.bb_hi[us*6+piece] &= ~toMask;
            if(isLoFrom) state.bb_lo[us*6+piece] |= fromMask; else state.bb_hi[us*6+piece] |= fromMask;
        }
        
        if (flags & 8) {
            let capMask = (cap_sq<32) ? (1<<cap_sq) : (1<<(cap_sq-32));
            if(cap_sq<32) state.bb_lo[them*6+PAWN] |= capMask; else state.bb_hi[them*6+PAWN] |= capMask;
        } else if (flags & 2) {
            if(captured !== -1) {
                if(isLoTo) state.bb_lo[them*6+captured] |= toMask; else state.bb_hi[them*6+captured] |= toMask;
            }
        }

        return safe;
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
            case 'spell':       return false;
            case 'horde':       return color === BLACK ? is_standard_checked(state, color) : false; 
            case 'atomic':
                var wkL = state.bb_lo[WHITE*6+KING], wkH = state.bb_hi[WHITE*6+KING];
                var bkL = state.bb_lo[BLACK*6+KING], bkH = state.bb_hi[BLACK*6+KING];
                if ((wkL || wkH) && (bkL || bkH)) {
                    var wk = ctz(wkL, wkH), bk = ctz(bkL, bkH);
                    if (Math.abs((wk>>3)-(bk>>3)) <= 1 && Math.abs((wk&7)-(bk&7)) <= 1) return false;
                }
                return is_standard_checked(state, color);
            default:            return is_standard_checked(state, color);
        }
    }
    function is_drop_legal_fast(state, m) {
        var us = state.turn, them = us ^ 1;
        var pType = m & 0x3F;
        var to = (m >>> 6) & 0x3F;
        var toMask = to < 32 ? (1 << to) : (1 << (to - 32));
        var isLo = to < 32;
        if (isLo) state.bb_lo[us * 6 + pType] = (state.bb_lo[us * 6 + pType] | toMask) >>> 0;
        else state.bb_hi[us * 6 + pType] = (state.bb_hi[us * 6 + pType] | toMask) >>> 0;
        state.board[to] = (us << 3) | pType;

        var klo = state.bb_lo[us * 6 + KING], khi = state.bb_hi[us * 6 + KING];
        var king_sq = (klo === 0 && khi === 0) ? 64 : ctz(klo, khi);
        var safe = (king_sq === 64) || !is_attacked(state, king_sq, them);

        if (isLo) state.bb_lo[us * 6 + pType] = (state.bb_lo[us * 6 + pType] & ~toMask) >>> 0;
        else state.bb_hi[us * 6 + pType] = (state.bb_hi[us * 6 + pType] & ~toMask) >>> 0;
        state.board[to] = -1;

        return safe;
    }
    // --- VARIANT SIDE-EFFECT STUBS ---
    function apply_standard_move(prevState, m) {
    var next = clone_state(prevState);
    next.zobrist = prevState.zobrist !== undefined ? prevState.zobrist : compute_zobrist(prevState);
    
    var us = next.turn, them = us ^ 1;
    var from = m & 0x3F, to = (m >>> 6) & 0x3F;
    var flags = (m >>> 12) & 0x7F, promo = (m >>> 19) & 0x7;
    
    var p_type = prevState.board[from] & 7; 

    next.zobrist ^= ZOBRIST.pieces[(us * 6 + p_type) * 64 + from];
    if (from < 32) next.bb_lo[us * 6 + p_type] &= ~(1 << from); 
    else next.bb_hi[us * 6 + p_type] &= ~(1 << (from - 32));
    next.board[from] = -1;

    if (flags & BITS.CAPTURE) {
        var to_piece = prevState.board[to];
        var cap = to_piece & 7;
        if (to_piece !== -1 && (to_piece >> 3) === them) {
            next.zobrist ^= ZOBRIST.pieces[(them * 6 + cap) * 64 + to];
            if (to < 32) next.bb_lo[them * 6 + cap] &= ~(1 << to); 
            else next.bb_hi[them * 6 + cap] &= ~(1 << (to - 32));
        }
    } else if (flags & BITS.EP_CAPTURE) {
        var ep_sq = (us === WHITE) ? to - 8 : to + 8;
        next.zobrist ^= ZOBRIST.pieces[(them * 6 + PAWN) * 64 + ep_sq];
        if (ep_sq < 32) next.bb_lo[them * 6 + PAWN] &= ~(1 << ep_sq); 
        else next.bb_hi[them * 6 + PAWN] &= ~(1 << (ep_sq - 32));
        next.board[ep_sq] = -1;
    }

    if (flags & (BITS.KSIDE_CASTLE | BITS.QSIDE_CASTLE)) {
        let isK = Boolean(flags & BITS.KSIDE_CASTLE);
        let k_to = (us === WHITE) ? (isK ? 6 : 2) : (isK ? 62 : 58); 
        let r_to = (us === WHITE) ? (isK ? 5 : 3) : (isK ? 61 : 59); 
        
        let rf = -1;
        if (prevState.gameMode !== 'chess960') {
            rf = (us === WHITE) ? (isK ? 7 : 0) : (isK ? 63 : 56);
        } else {
            let pTo = prevState.board[to];
            if (pTo !== -1 && (pTo & 7) === ROOK && (pTo >> 3) === us) {
                rf = to; 
            } else {
                let startF = isK ? 7 : 0; 
                let step = isK ? -1 : 1;
                for (let f = startF; f >= 0 && f < 8; f += step) {
                    let sq = ((us === WHITE) ? 0 : 56) + f;
                    if (prevState.board[sq] === ((us << 3) | ROOK)) { rf = sq; break; }
                }
            }
        }

        if (rf !== -1) {
            next.zobrist ^= ZOBRIST.pieces[(us * 6 + ROOK) * 64 + rf];
            next.zobrist ^= ZOBRIST.pieces[(us * 6 + ROOK) * 64 + r_to];

            if (rf < 32) next.bb_lo[us * 6 + ROOK] &= ~(1 << rf); 
            else next.bb_hi[us * 6 + ROOK] &= ~(1 << (rf - 32));
            next.board[rf] = -1;
        }

        next.zobrist ^= ZOBRIST.pieces[(us * 6 + KING) * 64 + k_to];
        if (k_to < 32) next.bb_lo[us * 6 + KING] |= (1 << k_to); 
        else next.bb_hi[us * 6 + KING] |= (1 << (k_to - 32));
        if (r_to < 32) next.bb_lo[us * 6 + ROOK] |= (1 << r_to); 
        else next.bb_hi[us * 6 + ROOK] |= (1 << (r_to - 32));

        next.board[k_to] = (us << 3) | KING;
        next.board[r_to] = (us << 3) | ROOK;
    } else {
        var placed = (flags & BITS.PROMOTION) ? promo : p_type;
        next.zobrist ^= ZOBRIST.pieces[(us * 6 + placed) * 64 + to];

        if (to < 32) next.bb_lo[us * 6 + placed] |= (1 << to); 
        else next.bb_hi[us * 6 + placed] |= (1 << (to - 32));
        next.board[to] = (us << 3) | placed;
    }

    next.turn ^= 1;
    next.zobrist ^= ZOBRIST.turn;

    let isBigStep = Boolean(flags & BITS.BIG_PAWN);
    if (prevState.gameMode === 'horde' && p_type === PAWN && us === WHITE) {
        if ((from >> 3) === 0 && (to - from) === 16) isBigStep = true;
    }
    if (prevState.ep_square !== -1) next.zobrist ^= ZOBRIST.ep[prevState.ep_square];
    next.ep_square = isBigStep ? ((us === WHITE) ? to - 8 : to + 8) : -1;
    if (next.ep_square !== -1) next.zobrist ^= ZOBRIST.ep[next.ep_square];

    if (p_type === PAWN || (flags & BITS.CAPTURE)) next.half_moves = 0; 
    else next.half_moves++;
    if (us === BLACK) next.move_number++;
    
    let old_castling = next.castling;
    next.castling &= (prevState.castling_mask[from] & prevState.castling_mask[to]);
    if (old_castling !== next.castling) {
        next.zobrist ^= ZOBRIST.castling[old_castling];
        next.zobrist ^= ZOBRIST.castling[next.castling];
    }

    if (next.gameMode === 'spell') {
        if (next.active_w_frozen_timer > 0) next.active_w_frozen_timer--;
        if (next.active_b_frozen_timer > 0) next.active_b_frozen_timer--;
        if (next.active_w_jump_timer > 0) next.active_w_jump_timer--;
        if (next.active_b_jump_timer > 0) next.active_b_jump_timer--;
        rebuild_spell_caches(next);
    }

    return next;
    }
    function apply_crazyhouse_move(prevState, m) {
        var flags = (m >>> 12) & 0xFF;
        var us = prevState.turn;
        var to = (m >>> 6) & 0x3F;

        if (flags & BITS.DROP) {
            var next = clone_state(prevState);
            var p_type = m & 0x3F; 
            
            if (us === WHITE) next.pocket_w -= (1 << (p_type * 5));
            else next.pocket_b -= (1 << (p_type * 5));
            
            if (to < 32) next.bb_lo[us*6+p_type] |= (1<<to); else next.bb_hi[us*6+p_type] |= (1<<(to-32));
            next.board[to] = (us << 3) | p_type;
            next.zobrist ^= ZOBRIST.pieces[(us * 6 + p_type) * 64 + to];
            
            next.turn ^= 1;
            next.ep_square = -1;
            if (p_type === PAWN) next.half_moves = 0; else next.half_moves++;
            if (us === BLACK) next.move_number++;
            return next;
        }

        var next = apply_standard_move(prevState, m);
        var from = m & 0x3F;
        
        var isPromoted = false;
        if ((from < 32) ? (prevState.promoted_lo & (1<<from)) : (prevState.promoted_hi & (1<<(from-32)))) {
            isPromoted = true;
            if (from < 32) next.promoted_lo &= ~(1<<from); else next.promoted_hi &= ~(1<<(from-32));
            if (to < 32) next.promoted_lo |= (1<<to); else next.promoted_hi |= (1<<(to-32));
        }
        if (flags & BITS.PROMOTION) {
            if (to < 32) next.promoted_lo |= (1<<to); else next.promoted_hi |= (1<<(to-32));
        }

        if (flags & BITS.CAPTURE || flags & BITS.EP_CAPTURE) {
            var cap_sq = (flags & BITS.EP_CAPTURE) ? ((us === WHITE) ? to - 8 : to + 8) : to;
            var cap_piece = get_piece_at(prevState, cap_sq) & 7;
            
            var capPromoted = (cap_sq < 32) ? (prevState.promoted_lo & (1<<cap_sq)) : (prevState.promoted_hi & (1<<(cap_sq-32)));
            if (capPromoted) {
                cap_piece = PAWN; 
                if (cap_sq < 32) next.promoted_lo &= ~(1<<cap_sq); else next.promoted_hi &= ~(1<<(cap_sq-32));
            }
            if (us === WHITE) next.pocket_w += (1 << (cap_piece * 5));
            else next.pocket_b += (1 << (cap_piece * 5));
        }
        return next;
    }
    function apply_bughouse_move(prevState, m) { return apply_crazyhouse_move(prevState, m); }
    function apply_duck_move(prevState, m) {
        var next = apply_standard_move(prevState, m);
        let new_duck = (m >>> 22) & 0x3F;
        if (prevState.duck_sq !== -1) next.zobrist ^= ZOBRIST.duck[prevState.duck_sq];
        if (new_duck !== -1) next.zobrist ^= ZOBRIST.duck[new_duck];
        next.duck_sq = new_duck;
        return next;
    }
    function apply_atomic_move(prevState, m) {
        var next = apply_standard_move(prevState, m);
        var flags = (m >>> 12) & 0x7F;
        var to = (m >>> 6) & 0x3F;
        if ((flags & BITS.CAPTURE) || (flags & BITS.EP_CAPTURE)) {
            var us = prevState.turn;
            var p_type = next.board[to] & 7;
            
            if (p_type !== -1) {
                next.zobrist ^= ZOBRIST.pieces[(us * 6 + p_type) * 64 + to];
                if (to < 32) next.bb_lo[us * 6 + p_type] &= ~(1 << to); 
                else next.bb_hi[us * 6 + p_type] &= ~(1 << (to - 32));
                next.board[to] = -1;
            }
            var r = to >> 3, f = to & 7;
            var dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
            for (var i = 0; i < 8; i++) {
                var cr = r + dirs[i][0], cf = f + dirs[i][1];
                if (cr >= 0 && cr < 8 && cf >= 0 && cf < 8) {
                    var sq = cr * 8 + cf;
                    var p = next.board[sq];
                    if (p !== -1 && (p & 7) !== PAWN) {
                        var col = p >> 3, typ = p & 7;
                        next.zobrist ^= ZOBRIST.pieces[(col * 6 + typ) * 64 + sq];
                        if (sq < 32) next.bb_lo[col * 6 + typ] &= ~(1 << sq); 
                        else next.bb_hi[col * 6 + typ] &= ~(1 << (sq - 32));
                        next.board[sq] = -1;
                    }
                }
            }
        }
        return next;
    }
    function apply_alice_move(prevState, m) {
        var next = apply_standard_move(prevState, m);
        var from = m & 0x3F, to = (m >>> 6) & 0x3F;
        next.zobrist ^= ZOBRIST.alice_b[from];
        next.zobrist ^= ZOBRIST.alice_b[to];
        return next;
    }
    function apply_chaturanga_move(prevState, m) {
    var next = clone_state(prevState);
    var us = next.turn, them = us ^ 1;
    var from = m & 0x3F, to = (m >>> 6) & 0x3F;
    var flags = (m >>> 12) & 0x7F, promo = (m >>> 19) & 0x7;
    var p_type = get_piece_at(prevState, from) & 7; 

    if (from < 32) next.bb_lo[us*6+p_type] &= ~(1<<from); else next.bb_hi[us*6+p_type] &= ~(1<<(from-32));
    next.board[from] = -1;
    next.zobrist ^= ZOBRIST.pieces[(us * 6 + p_type) * 64 + from];

    if (flags & BITS.CAPTURE) {
        var cap = get_piece_at(prevState, to) & 7;
        if (cap !== -1) {
            if (to < 32) next.bb_lo[them*6+cap] &= ~(1<<to); else next.bb_hi[them*6+cap] &= ~(1<<(to-32));
            next.zobrist ^= ZOBRIST.pieces[(them * 6 + cap) * 64 + to];
        }
    } 

    var placed = (flags & BITS.PROMOTION) ? promo : p_type;
    if (to < 32) next.bb_lo[us*6+placed] |= (1<<to); else next.bb_hi[us*6+placed] |= (1<<(to-32));
    next.board[to] = (us << 3) | placed;
    next.zobrist ^= ZOBRIST.pieces[(us * 6 + placed) * 64 + to];

    next.turn ^= 1;
    next.ep_square = -1;
    next.zobrist ^= ZOBRIST.side;
    if (p_type === PAWN || (flags & BITS.CAPTURE)) next.half_moves = 0; else next.half_moves++;
    if (us === BLACK) next.move_number++;
    return next;
}
    function apply_spell(state, spellType, targetSq) {
        let next = clone_state(state);
        let us = next.turn;
        let colorPrefix = us === WHITE ? 'w_' : 'b_';

        if (!next.active_spells || next.active_spells.w_frozen_timer === undefined) {
            next.active_spells = { w_frozen_sq:-1, w_frozen_timer:0, b_frozen_sq:-1, b_frozen_timer:0, w_jump_sq:-1, w_jump_timer:0, b_jump_sq:-1, b_jump_timer:0 };
        }

        // Apply safely to the specific color's independent memory bank
        if (spellType === 'freeze') {
            next.active_spells[`${colorPrefix}frozen_sq`] = targetSq;
            next.active_spells[`${colorPrefix}frozen_timer`] = 2; // Lasts 1 full turn cycle
        } else if (spellType === 'jump') {
            next.active_spells[`${colorPrefix}jump_sq`] = targetSq;
            next.active_spells[`${colorPrefix}jump_timer`] = 2;
        }

        rebuild_spell_caches(next);

        let myColor = us === WHITE ? 'w' : 'b';
        if (!next.mana) next.mana = { w: {freeze: 0, jump: 0}, b: {freeze: 0, jump: 0} };
        next.mana[myColor][spellType] = 6; 
        if (next.spell_uses && next.spell_uses[myColor]) {
            next.spell_uses[myColor][spellType] = Math.max(0, next.spell_uses[myColor][spellType] - 1);
        }

        return next;
    }
    function rebuild_spell_caches(s) {
        if (s.gameMode !== 'spell' || !s.active_spells) return;
        
        let fL = 0, fH = 0;
        let isLegacyFreeze = false;

        const addFreeze = (sq) => {
            if (sq === -1 || isNaN(sq)) return;
            let r = sq >> 3, c = sq & 7;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    let nr = r + dr, nc = c + dc;
                    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                        let idx = nr * 8 + nc;
                        if (idx < 32) fL |= (1 << idx); else fH |= (1 << (idx - 32));
                    }
                }
            }
        };

        // Check White's Timer
        if (s.active_spells.w_frozen_timer > 0) {
            if (s.active_spells.w_frozen_sq === -1) isLegacyFreeze = true;
            else addFreeze(s.active_spells.w_frozen_sq);
        }
        // Check Black's Timer
        if (s.active_spells.b_frozen_timer > 0) {
            if (s.active_spells.b_frozen_sq === -1) isLegacyFreeze = true;
            else addFreeze(s.active_spells.b_frozen_sq);
        }
        if (isLegacyFreeze && s.frozen && (s.frozen.lo !== 0 || s.frozen.hi !== 0)) {
            return; 
        }
        
        // Apply the new melted/updated bitboards
        s.frozen = { lo: fL, hi: fH };
    }
    function serialize_moves(f, attL, attH, enemyL, enemyH) {
        while (attL || attH) {
            let t = ctz(attL, attH);
            let isLo = t < 32;
            let mask = isLo ? (1 << t) : (1 << (t - 32));
            if (isLo) attL &= ~mask; else attH &= ~mask;
            let isCap = isLo ? (enemyL & mask) : (enemyH & mask);
            MOVE_BUFFER[moveCount++] = f | (t << 6) | ((isCap ? BITS.CAPTURE : BITS.NORMAL) << 12);
        }
    }
    function add_move(f, t, fl) { MOVE_BUFFER[moveCount++] = f | (t << 6) | (fl << 12); }
    function add_promo(f, t, fl, gameMode) {
        MOVE_BUFFER[moveCount++] = f | (t << 6) | (fl << 12) | (4 << 19);
        MOVE_BUFFER[moveCount++] = f | (t << 6) | (fl << 12) | (3 << 19);
        MOVE_BUFFER[moveCount++] = f | (t << 6) | (fl << 12) | (2 << 19);
        MOVE_BUFFER[moveCount++] = f | (t << 6) | (fl << 12) | (1 << 19);
        if (gameMode === 'antichess') MOVE_BUFFER[moveCount++] = f | (t << 6) | (fl << 12) | (5 << 19); 
    }
    // --- VARIANT GENERATOR STUBS ---
    function generate_standard_moves(state, options) {
        moveCount = 0;
        let us = state.turn;
        let them = us ^ 1;

        let filterSq = -1;
        if (options) {
            if (typeof options.from === 'number') filterSq = options.from;
            else if (typeof options.from === 'string') filterSq = str_to_sq(options.from);
            else if (typeof options.square === 'string') filterSq = str_to_sq(options.square);
            else if (typeof options.square === 'number') filterSq = options.square;
        }

        if (filterSq !== -1) {
            let pieceVal = state.board[filterSq];
            if (pieceVal === -1 || (pieceVal >> 3) !== us) return [];
        }

        let bb_lo = state.bb_lo;
        let bb_hi = state.bb_hi;
        let uBase = us * 6;
        let tBase = them * 6;
        
        let occUsL = bb_lo[uBase] | bb_lo[uBase+1] | bb_lo[uBase+2] | bb_lo[uBase+3] | bb_lo[uBase+4] | bb_lo[uBase+5];
        let occUsH = bb_hi[uBase] | bb_hi[uBase+1] | bb_hi[uBase+2] | bb_hi[uBase+3] | bb_hi[uBase+4] | bb_hi[uBase+5];
        let occThemL = bb_lo[tBase] | bb_lo[tBase+1] | bb_lo[tBase+2] | bb_lo[tBase+3] | bb_lo[tBase+4] | bb_lo[tBase+5];
        let occThemH = bb_hi[tBase] | bb_hi[tBase+1] | bb_hi[tBase+2] | bb_hi[tBase+3] | bb_hi[tBase+4] | bb_hi[tBase+5];
        let occAllL = occUsL | occThemL;
        let occAllH = occUsH | occThemH;
        if (state.gameMode === 'duck' && state.duck_sq !== -1) {
            let dSq = state.duck_sq;
            if (dSq < 32) {
                let mask = (1 << dSq) >>> 0;
                occAllL |= mask;
                occUsL |= mask;
            } else {
                let mask = (1 << (dSq - 32)) >>> 0;
                occAllH |= mask;
                occUsH |= mask;
            }
        }

        let pieceFilterType = filterSq !== -1 ? (state.board[filterSq] & 7) : -1;

        // --- PAWNS (Chỉ chạy nếu không lọc ô hoặc ô được lọc đúng là Tốt) ---
        if (pieceFilterType === -1 || pieceFilterType === PAWN) {
            let pL = (filterSq !== -1) ? ((filterSq < 32) ? (1 << filterSq) : 0) : bb_lo[uBase+PAWN];
            let pH = (filterSq !== -1) ? ((filterSq >= 32) ? (1 << (filterSq - 32)) : 0) : bb_hi[uBase+PAWN];

            let emptyL = ~occAllL, emptyH = ~occAllH;
            let sL = (us === WHITE) ? ((pL << 8) & emptyL) : (((pL >>> 8) | (pH << 24)) & emptyL);
            let sH = (us === WHITE) ? (((pH << 8) | (pL >>> 24)) & emptyH) : ((pH >>> 8) & emptyH);

            let bbL = sL, bbH = sH;
            while (bbL || bbH) {
                let to = ctz(bbL, bbH);
                if (to < 32) bbL &= ~(1 << to); else bbH &= ~(1 << (to - 32));
                let from = (us === WHITE) ? to - 8 : to + 8;
                if (to < 8 || to >= 56) add_promo(from, to, BITS.PROMOTION, state.gameMode);
                else {
                    add_move(from, to, BITS.NORMAL);
                    if ((us === WHITE && to >= 16 && to <= 23) || (us === BLACK && to >= 40 && to <= 47)) {
                        let d = (us === WHITE) ? to + 8 : to - 8;
                        let mask = (d < 32) ? (1 << d) : (1 << (d - 32));
                        if (((d < 32 ? occAllL : occAllH) & mask) === 0) add_move(from, d, BITS.BIG_PAWN);
                    }
                }
            }

            let capL_LO = (us === WHITE) ? ((pL << 7) & ~FILE_MASKS_LO[7]) : (((pL >>> 9) | (pH << 23)) & ~FILE_MASKS_LO[7]);
            let capL_HI = (us === WHITE) ? (((pH << 7) | (pL >>> 25)) & ~FILE_MASKS_HI[7]) : ((pH >>> 9) & ~FILE_MASKS_HI[7]);
            let capR_LO = (us === WHITE) ? ((pL << 9) & ~FILE_MASKS_LO[0]) : (((pL >>> 7) | (pH << 25)) & ~FILE_MASKS_LO[0]);
            let capR_HI = (us === WHITE) ? (((pH << 9) | (pL >>> 23)) & ~FILE_MASKS_HI[0]) : ((pH >>> 7) & ~FILE_MASKS_HI[0]);

            const add_caps = (cL, cH, offset) => {
                if (state.ep_square !== -1) {
                    let epMask = (state.ep_square < 32) ? (1 << state.ep_square) : (1 << (state.ep_square - 32));
                    if ((state.ep_square < 32) ? (cL & epMask) : (cH & epMask)) {
                        let from = (us === WHITE) ? (offset === 1 ? state.ep_square - 9 : state.ep_square - 7) : (offset === 1 ? state.ep_square + 7 : state.ep_square + 9);
                        if (from >= 0 && from < 64) add_move(from, state.ep_square, BITS.EP_CAPTURE);
                    }
                }
                cL &= occThemL; cH &= occThemH;
                while (cL !== 0 || cH !== 0) {
                    let to = ctz(cL, cH);
                    if (to < 32) cL &= ~(1 << to); else cH &= ~(1 << (to - 32));
                    let from = (us === WHITE) ? (offset === 1 ? to - 9 : to - 7) : (offset === 1 ? to + 7 : to + 9);
                    if (from >= 0 && from < 64) {
                        if (to < 8 || to >= 56) add_promo(from, to, BITS.CAPTURE | BITS.PROMOTION, state.gameMode);
                        else add_move(from, to, BITS.CAPTURE);
                    }
                }
            };
            add_caps(capL_LO, capL_HI, -1);
            add_caps(capR_LO, capR_HI, 1);
        }

        // --- KNIGHTS ---
        if (pieceFilterType === -1 || pieceFilterType === KNIGHT) {
            let nL = (filterSq !== -1) ? ((filterSq < 32) ? (1 << filterSq) : 0) : bb_lo[uBase+KNIGHT];
            let nH = (filterSq !== -1) ? ((filterSq >= 32) ? (1 << (filterSq - 32)) : 0) : bb_hi[uBase+KNIGHT];
            while (nL || nH) {
                let f = ctz(nL, nH);
                if (f < 32) nL &= ~(1 << f); else nH &= ~(1 << (f - 32));
                serialize_moves(f, KNIGHT_LO[f] & ~occUsL, KNIGHT_HI[f] & ~occUsH, occThemL, occThemH);
            }
        }

        // --- BISHOPS ---
        if (pieceFilterType === -1 || pieceFilterType === BISHOP) {
            let bL = (filterSq !== -1) ? ((filterSq < 32) ? (1 << filterSq) : 0) : bb_lo[uBase+BISHOP];
            let bH = (filterSq !== -1) ? ((filterSq >= 32) ? (1 << (filterSq - 32)) : 0) : bb_hi[uBase+BISHOP];
            while (bL || bH) {
                let f = ctz(bL, bH);
                if (f < 32) bL &= ~(1 << f); else bH &= ~(1 << (f - 32));
                let att = get_slider_attacks(BISHOP, f, occAllL, occAllH);
                serialize_moves(f, att.lo & ~occUsL, att.hi & ~occUsH, occThemL, occThemH);
            }
        }

        // --- ROOKS ---
        if (pieceFilterType === -1 || pieceFilterType === ROOK) {
            let rL = (filterSq !== -1) ? ((filterSq < 32) ? (1 << filterSq) : 0) : bb_lo[uBase+ROOK];
            let rH = (filterSq !== -1) ? ((filterSq >= 32) ? (1 << (filterSq - 32)) : 0) : bb_hi[uBase+ROOK];
            while (rL || rH) {
                let f = ctz(rL, rH);
                if (f < 32) rL &= ~(1 << f); else rH &= ~(1 << (f - 32));
                let att = get_slider_attacks(ROOK, f, occAllL, occAllH);
                serialize_moves(f, att.lo & ~occUsL, att.hi & ~occUsH, occThemL, occThemH);
            }
        }

        // --- QUEENS ---
        if (pieceFilterType === -1 || pieceFilterType === QUEEN) {
            let qL = (filterSq !== -1) ? ((filterSq < 32) ? (1 << filterSq) : 0) : bb_lo[uBase+QUEEN];
            let qH = (filterSq !== -1) ? ((filterSq >= 32) ? (1 << (filterSq - 32)) : 0) : bb_hi[uBase+QUEEN];
            while (qL || qH) {
                let f = ctz(qL, qH);
                if (f < 32) qL &= ~(1 << f); else qH &= ~(1 << (f - 32));
                let att = get_slider_attacks(QUEEN, f, occAllL, occAllH);
                serialize_moves(f, att.lo & ~occUsL, att.hi & ~occUsH, occThemL, occThemH);
            }
        }

        // --- KING & CASTLING ---
        if (pieceFilterType === -1 || pieceFilterType === KING) {
            let kgL = (filterSq !== -1) ? ((filterSq < 32) ? (1 << filterSq) : 0) : bb_lo[uBase+KING];
            let kgH = (filterSq !== -1) ? ((filterSq >= 32) ? (1 << (filterSq - 32)) : 0) : bb_hi[uBase+KING];
            if (kgL || kgH) {
                let f = ctz(kgL, kgH);
                serialize_moves(f, KING_LO[f] & ~occUsL, KING_HI[f] & ~occUsH, occThemL, occThemH);
            }
            if (state.gameMode !== 'chess960') {
                if (us === WHITE) {
                    if ((state.castling & 1) && !(occAllL & (MASKS_LO[5]|MASKS_LO[6]))) {
                        if (!is_attacked(state, 4, BLACK) && !is_attacked(state, 5, BLACK) && !is_attacked(state, 6, BLACK)) add_move(4, 6, BITS.KSIDE_CASTLE);
                    }
                    if ((state.castling & 2) && !(occAllL & (MASKS_LO[1]|MASKS_LO[2]|MASKS_LO[3]))) {
                        if (!is_attacked(state, 4, BLACK) && !is_attacked(state, 3, BLACK) && !is_attacked(state, 2, BLACK)) add_move(4, 2, BITS.QSIDE_CASTLE);
                    }
                } else {
                    if ((state.castling & 4) && !(occAllH & (MASKS_HI[61]|MASKS_HI[62]))) { 
                        if (!is_attacked(state, 60, WHITE) && !is_attacked(state, 61, WHITE) && !is_attacked(state, 62, WHITE)) add_move(60, 62, BITS.KSIDE_CASTLE);
                    }
                    if ((state.castling & 8) && !(occAllH & (MASKS_HI[57]|MASKS_HI[58]|MASKS_HI[59]))) {
                        if (!is_attacked(state, 60, WHITE) && !is_attacked(state, 59, WHITE) && !is_attacked(state, 58, WHITE)) add_move(60, 58, BITS.QSIDE_CASTLE);
                    }
                }
            }
        }
        let final_moves = [];
        for (let i = 0; i < moveCount; i++) {
            let m = MOVE_BUFFER[i];
            if (!options || options.legal !== false) {
                if (is_standard_legal_fast(state, m)) final_moves.push(m);
            } else {
                final_moves.push(m);
            }
        }
        return final_moves;
    }
    function generate_antichess_moves(state, options) {
        var moves = generate_standard_moves(state, { legal: false });
        var captures = [];

        for (var i = 0; i < moves.length; i++) {
            var m = moves[i];
            var flags = (m >>> 12) & 0x7F;
            if ((flags & BITS.CAPTURE) || (flags & BITS.EP_CAPTURE)) {
                captures.push(m);
            }
        }
        var pool = (captures.length > 0) ? captures : moves;
        if (options) {
            var filterFrom = -1;
            if (typeof options.from === 'number') filterFrom = options.from;
            else if (typeof options.from === 'string') filterFrom = str_to_sq(options.from);
            else if (typeof options.square === 'string') filterFrom = str_to_sq(options.square);
            else if (typeof options.square === 'number') filterFrom = options.square;

            if (filterFrom !== -1) {
                return pool.filter(function(m) { return (m & 0x3F) === filterFrom; });
            }
        }
        return pool;
    }
    function generate_racingkings_moves(state, options) { 
        var moves = generate_standard_moves(state, options);
        var valid = [];
        var us = state.turn;
        for (var i = 0; i < moves.length; i++) {
            var m = moves[i];
            var next = apply_standard_move(state, m);
            if (!is_standard_checked(next, us ^ 1) && !is_standard_checked(next, us)) {
                valid.push(m);
            }
        }
        return valid; 
    }
    function generate_bughouse_moves(state, options) { return generate_crazyhouse_moves(state, options); }
    function generate_crazyhouse_moves(state, options) {
        var moves = generate_standard_moves(state, options);
        var us = state.turn;
        var pocket = us === WHITE ? state.pocket_w : state.pocket_b;
        
        var occL = 0, occH = 0;
        for (let i = 0; i < 12; i++) { occL |= state.bb_lo[i]; occH |= state.bb_hi[i]; }
        var emptyL = (~occL) >>> 0, emptyH = (~occH) >>> 0;
        
        for (var p_type = PAWN; p_type <= QUEEN; p_type++) {
            if (((pocket >> (p_type * 5)) & 31) > 0) {
                let eL = emptyL, eH = emptyH;
                while (eL || eH) {
                    let sq = ctz(eL, eH);
                    if (sq < 32) eL &= ~(1 << sq); else eH &= ~(1 << (sq - 32));
                    
                    var rank = sq >> 3;
                    if (p_type === PAWN && (rank === 0 || rank === 7)) continue; 
                    
                    var m = p_type | (sq << 6) | (BITS.DROP << 12);
                    if (!options || options.legal !== false) {
                        if (is_drop_legal_fast(state, m)) moves.push(m);
                    } else {
                        moves.push(m);
                    }
                }
            }
        }
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
            if (p_type === KING && (flags & BITS.CAPTURE || flags & BITS.EP_CAPTURE)) continue;

            var next = apply_atomic_move(state, m);

            var myK_lo = next.bb_lo[us * 6 + KING], myK_hi = next.bb_hi[us * 6 + KING];
            var theirK_lo = next.bb_lo[them * 6 + KING], theirK_hi = next.bb_hi[them * 6 + KING];

            var isLegal = false;
            if (myK_lo || myK_hi) {
                if (!theirK_lo && !theirK_hi) {
                    isLegal = true;
                } else {
                    var myK = ctz(myK_lo, myK_hi);
                    var theirK = ctz(theirK_lo, theirK_hi);
                    var kingsAdj = Math.abs((myK >> 3) - (theirK >> 3)) <= 1 && Math.abs((myK & 7) - (theirK & 7)) <= 1;

                    if (kingsAdj) isLegal = true;
                    else if (!is_standard_checked(next, us)) isLegal = true;
                }
            }

            if (STATE_POOL.length < 5000) STATE_POOL.push(next);

            if (isLegal) valid.push(m);
        }
        return valid;
    }
    function generate_placement_moves(state, options) {
        var moves = [];
        var us = state.turn;
        var pocket = us === WHITE ? state.pocket_w : state.pocket_b;
        
        if (pocket > 0) {
            var occL = 0, occH = 0;
            for (let i = 0; i < 12; i++) { occL |= state.bb_lo[i]; occH |= state.bb_hi[i]; }
            var emptyL = (~occL) >>> 0, emptyH = (~occH) >>> 0;
            
            for (var p_type = PAWN; p_type <= KING; p_type++) {
                if (((pocket >> (p_type * 5)) & 31) > 0) {
                    let eL = emptyL, eH = emptyH;
                    while (eL || eH) {
                        let sq = ctz(eL, eH);
                        if (sq < 32) eL &= ~(1<<sq); else eH &= ~(1<<(sq-32));
                        
                        var rank = sq >> 3;
                        if (us === WHITE) {
                            if (rank > 3) continue;
                            if (p_type === PAWN && rank === 0) continue;
                        } else {
                            if (rank < 4) continue;
                            if (p_type === PAWN && rank === 7) continue;
                        }
                        
                        if (p_type === BISHOP) {
                            var hasLight = false, hasDark = false;
                            let bL = state.bb_lo[us*6+BISHOP], bH = state.bb_hi[us*6+BISHOP];
                            while(bL || bH) {
                                let k = ctz(bL, bH);
                                if(k < 32) bL &= ~(1<<k); else bH &= ~(1<<(k-32));
                                let r = k >> 3, c = k & 7;
                                if ((r + c) % 2 === 0) hasLight = true;
                                else hasDark = true;
                            }
                            var sqColor = ((sq >> 3) + (sq & 7)) % 2 === 0 ? 'light' : 'dark';
                            if (hasLight && sqColor === 'light') continue;
                            if (hasDark && sqColor === 'dark') continue;
                        }
                        
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
        } else {
            return generate_standard_moves(state, options);
        }
    }
    function generate_chaturanga_moves(state, options) {
        moveCount = 0;
        var us = state.turn, them = us ^ 1;
        var bb_lo = state.bb_lo, bb_hi = state.bb_hi;

        var occUsL = 0, occUsH = 0, occThemL = 0, occThemH = 0;
        for (let i = us * 6; i < us * 6 + 6; i++) { occUsL |= bb_lo[i]; occUsH |= bb_hi[i]; }
        for (let i = them * 6; i < them * 6 + 6; i++) { occThemL |= bb_lo[i]; occThemH |= bb_hi[i]; }
        
        var occAllL = (occUsL | occThemL) >>> 0;
        var occAllH = (occUsH | occThemH) >>> 0;
        var emptyL = (~occAllL) >>> 0;
        var emptyH = (~occAllH) >>> 0;
        var pL = bb_lo[us * 6 + PAWN], pH = bb_hi[us * 6 + PAWN];

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
            if (to < 32) bbL &= ~(1 << to); else bbH &= ~(1 << (to - 32));
            let from = (us === WHITE) ? to - 8 : to + 8;
            
            if (to < 8 || to >= 56) MOVE_BUFFER[moveCount++] = from | (to << 6) | (BITS.PROMOTION << 12) | (QUEEN << 19);
            else add_move(from, to, BITS.NORMAL);
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
            while (cL !== 0 || cH !== 0) {
                let to = ctz(cL, cH);
                if (to < 32) cL &= ~(1 << to); else cH &= ~(1 << (to - 32));
                let from = (us === WHITE) ? (offset === 1 ? to - 9 : to - 7) : (offset === 1 ? to + 7 : to + 9);
                if (from >= 0 && from < 64) {
                    if (to < 8 || to >= 56) MOVE_BUFFER[moveCount++] = from | (to << 6) | ((BITS.CAPTURE | BITS.PROMOTION) << 12) | (QUEEN << 19);
                    else add_move(from, to, BITS.CAPTURE);
                }
            }
        };
        add_caps(capL_LO, capL_HI, -1);
        add_caps(capR_LO, capR_HI, 1);

        let kL = bb_lo[us * 6 + KNIGHT], kH = bb_hi[us * 6 + KNIGHT];
        while (kL || kH) {
            let f = ctz(kL, kH);
            if (f < 32) kL &= ~(1 << f); else kH &= ~(1 << (f - 32));
            serialize_moves(f, KNIGHT_LO[f] & ~occUsL, KNIGHT_HI[f] & ~occUsH, { lo: occThemL, hi: occThemH });
        }

        kL = bb_lo[us * 6 + KING]; kH = bb_hi[us * 6 + KING];
        if (kL || kH) {
            let f = ctz(kL, kH);
            serialize_moves(f, KING_LO[f] & ~occUsL, KING_HI[f] & ~occUsH, { lo: occThemL, hi: occThemH });
        }

        let rL = bb_lo[us * 6 + ROOK], rH = bb_hi[us * 6 + ROOK];
        while (rL || rH) {
            let f = ctz(rL, rH);
            if (f < 32) rL &= ~(1 << f); else rH &= ~(1 << (f - 32));
            let att = get_slider_attacks(ROOK, f, occAllL, occAllH);
            serialize_moves(f, att.lo & ~occUsL, att.hi & ~occUsH, { lo: occThemL, hi: occThemH });
        }

        let bL = bb_lo[us * 6 + BISHOP], bH = bb_hi[us * 6 + BISHOP];
        while (bL || bH) {
            let f = ctz(bL, bH);
            if (f < 32) bL &= ~(1 << f); else bH &= ~(1 << (f - 32));
            serialize_moves(f, ELEPHANT_LO[f] & ~occUsL, ELEPHANT_HI[f] & ~occUsH, { lo: occThemL, hi: occThemH });
        }

        let qL = bb_lo[us * 6 + QUEEN], qH = bb_hi[us * 6 + QUEEN];
        while (qL || qH) {
            let f = ctz(qL, qH);
            if (f < 32) qL &= ~(1 << f); else qH &= ~(1 << (f - 32));
            serialize_moves(f, MANTRI_LO[f] & ~occUsL, MANTRI_HI[f] & ~occUsH, { lo: occThemL, hi: occThemH });
        }

        var final_moves = [];
        for (var i = 0; i < moveCount; i++) {
            var m = MOVE_BUFFER[i];
            if (options && options.square) {
                if ((m & 0x3F) !== ((options.square.charCodeAt(1) - 49) * 8 + (options.square.charCodeAt(0) - 97))) continue;
            }
            if (!options || options.legal !== false) {
                if (is_standard_legal_fast(state, m)) final_moves.push(m);
            } else {
                final_moves.push(m);
            }
        }
        return final_moves;
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
                if (get_piece_at(state, from) === (WHITE << 3 | PAWN)) {
                    var to1 = from + 8;  // 1 square up
                    var to2 = from + 16; // 2 squares up
                    
                    if (get_piece_at(state, to1) === -1 && get_piece_at(state, to2) === -1) {
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
        moveCount = 0;
        var us = state.turn, them = us ^ 1;
        var myPiecesL = 0, myPiecesH = 0;
        for(let i=us*6; i<us*6+6; i++) { myPiecesL|=state.bb_lo[i]; myPiecesH|=state.bb_hi[i]; }

        let tempL = myPiecesL, tempH = myPiecesH;
        while(tempL || tempH) {
            let f = ctz(tempL, tempH);
            if(f<32) tempL &= ~(1<<f); else tempH &= ~(1<<(f-32));
            
            let isB = f < 32 ? (state.alice_b_lo & (1<<f)) : (state.alice_b_hi & (1<<(f-32)));
            let bMaskL = isB ? state.alice_b_lo : ~state.alice_b_lo;
            let bMaskH = isB ? state.alice_b_hi : ~state.alice_b_hi;
            
            let occAllL = 0, occAllH = 0;
            for(let i=0; i<12; i++) { occAllL|=state.bb_lo[i]; occAllH|=state.bb_hi[i]; }
            
            let occSameL = occAllL & bMaskL, occSameH = occAllH & bMaskH;
            let occOppL = occAllL & ~bMaskL, occOppH = occAllH & ~bMaskH;
            let mySameL = myPiecesL & bMaskL, mySameH = myPiecesH & bMaskH;
            let enemiesSameL = occSameL & ~mySameL, enemiesSameH = occSameH & ~mySameH;

            let validTargetL = ~mySameL & ~occOppL;
            let validTargetH = ~mySameH & ~occOppH;
            let pType = get_piece_at(state, f) & 7;

            if (pType === PAWN) {
                let dir = us === WHITE ? 8 : -8;
                let forward = f + dir;
                if (forward >= 0 && forward < 64) {
                    let fMask = forward < 32 ? (1<<forward) : (1<<(forward-32));
                    let occSameF = forward < 32 ? (occSameL & fMask) : (occSameH & fMask);
                    let validTargetF = forward < 32 ? (validTargetL & fMask) : (validTargetH & fMask);
                    if (!occSameF && validTargetF) {
                        if (forward < 8 || forward >= 56) add_promo(f, forward, BITS.PROMOTION, state.gameMode);
                        else {
                            add_move(f, forward, BITS.NORMAL);
                            let rank = f >> 3;
                            if ((us === WHITE && rank === 1) || (us === BLACK && rank === 6)) {
                                let doubleF = forward + dir;
                                let dMask = doubleF < 32 ? (1<<doubleF) : (1<<(doubleF-32));
                                let occSameD = doubleF < 32 ? (occSameL & dMask) : (occSameH & dMask);
                                let validTargetD = doubleF < 32 ? (validTargetL & dMask) : (validTargetH & dMask);
                                if (!occSameD && validTargetD) {
                                    add_move(f, doubleF, BITS.BIG_PAWN);
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
                            if (capSq < 8 || capSq >= 56) add_promo(f, capSq, BITS.CAPTURE | BITS.PROMOTION, state.gameMode);
                            else add_move(f, capSq, BITS.CAPTURE);
                        } 
                    }
                }
            } else if (pType === KNIGHT) {
                serialize_moves(f, KNIGHT_LO[f] & validTargetL, KNIGHT_HI[f] & validTargetH, {lo: enemiesSameL, hi: enemiesSameH});
            } else if (pType === KING) {
                serialize_moves(f, KING_LO[f] & validTargetL, KING_HI[f] & validTargetH, {lo: enemiesSameL, hi: enemiesSameH});
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
                                        let sq = rank * 8 + i; 
                                        let sMask = sq < 32 ? (1<<sq) : (1<<(sq-32));
                                        let occSameS = sq < 32 ? (occSameL & sMask) : (occSameH & sMask);
                                        if (occSameS) emptyPath = false;
                                    }
                                    
                                    if (emptyPath && !is_attacked(state, rank*8+5, them) && !is_attacked(state, rank*8+6, them)) {
                                        let kdMask = (rank*8+6) < 32 ? (1<<(rank*8+6)) : (1<<((rank*8+6)-32));
                                        let rdMask = (rank*8+5) < 32 ? (1<<(rank*8+5)) : (1<<((rank*8+5)-32));
                                        let kOpp = (rank*8+6) < 32 ? (occOppL & kdMask) : (occOppH & kdMask);
                                        let rOpp = (rank*8+5) < 32 ? (occOppL & rdMask) : (occOppH & rdMask);
                                        if (!kOpp && !rOpp) {
                                            add_move(f, rank*8+6, BITS.KSIDE_CASTLE);
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
                                            add_move(f, rank*8+2, BITS.QSIDE_CASTLE);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                let att = get_slider_attacks(pType, f, occSameL, occSameH);
                serialize_moves(f, att.lo & validTargetL, att.hi & validTargetH, {lo: enemiesSameL, hi: enemiesSameH});
            }
        }

        var final_moves = [];
        for (var i = 0; i < moveCount; i++) {
            var m = MOVE_BUFFER[i];
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
    // Logic validity functions
    function has_legal_moves(state) {
        let us = state.turn;
        if (state.gameMode === 'crazyhouse' || state.gameMode === 'bughouse' || state.gameMode === 'placement') {
            let pocket = us === WHITE ? state.pocket_w : state.pocket_b;
            if (pocket > 0) {
                let occL = 0, occH = 0;
                for (let i = 0; i < 12; i++) { occL |= state.bb_lo[i]; occH |= state.bb_hi[i]; }
                let emptyL = (~occL) >>> 0, emptyH = (~occH) >>> 0;
                for (let p_type = PAWN; p_type <= QUEEN; p_type++) {
                    if (((pocket >> (p_type * 5)) & 31) > 0) {
                        let eL = emptyL, eH = emptyH;
                        while (eL || eH) {
                            let sq = ctz(eL, eH);
                            if (sq < 32) eL &= ~(1 << sq); else eH &= ~(1 << (sq - 32));
                            let rank = sq >> 3;
                            if (p_type === PAWN && (rank === 0 || rank === 7)) continue;
                            let m = p_type | (sq << 6) | (BITS.DROP << 12);
                            if (is_drop_legal_fast(state, m)) return true;
                        }
                    }
                }
            }
        }
        let uBase = us * 6;
        for (let pType = 0; pType < 6; pType++) {
            let pL = state.bb_lo[uBase + pType], pH = state.bb_hi[uBase + pType];
            while (pL || pH) {
                let sq = ctz(pL, pH);
                if (sq < 32) pL &= ~(1 << sq); else pH &= ~(1 << (sq - 32));
                
                let moves = generate_moves(state, { from: sq, legal: true });
                if (moves.length > 0) return true;
            }
        }
        return false;
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
        
        var us = state.turn;
        var pVal = get_piece_at(state, from);
        if (pVal === -1 || (pVal>>3) !== us) return null;
        var piece = pVal & 7;

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
        var tVal = get_piece_at(state, to);
        if (tVal !== -1 && (tVal>>3) === us) {
            if (piece === KING && (tVal&7) === ROOK) is960Castle = true;
            else return null; 
        }

        var them = us ^ 1, captured = tVal !== -1 && (tVal>>3)===them;
        var flags = BITS.NORMAL;
        var promoInt = 0;

        if (piece === PAWN) {
            var diff = us === WHITE ? to - from : from - to;
            if (diff % 8 !== 0) {
                if (!captured && to !== state.ep_square) return null;
                flags = (to === state.ep_square) ? BITS.EP_CAPTURE : BITS.CAPTURE;
            } else {
                if (captured) return null;
                if (diff === 16) {
                    if (state.gameMode === 'chaturanga') return null; 
                    flags = BITS.BIG_PAWN;
                }
            }
            var rank = Math.floor(to / 8);
            if (rank === 0 || rank === 7) {
                flags = (flags === BITS.NORMAL) ? BITS.PROMOTION : (flags | BITS.PROMOTION);
                
                if (state.gameMode === 'chaturanga') {
                    promoInt = QUEEN; 
                } else {
                    if (promo) { promoInt = typeof promo === 'string' ? CHAR_TO_PIECE[promo.toLowerCase()] : promo; }
                    else { promoInt = QUEEN; }
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
                let kL = state.bb_lo[state.turn * 6 + KING], kH = state.bb_hi[state.turn * 6 + KING];
                if (!kL && !kH) return null;
                let kSq = ctz(kL, kH);
                let rSq = -1;
                let startF = isK ? 7 : 0; let step = isK ? -1 : 1;
                for (let f = startF; f >= 0 && f < 8; f += step) {
                    let sq = (state.turn === WHITE ? 0 : 56) + f;
                    if (get_piece_at(state, sq) === ((state.turn << 3) | ROOK)) { rSq = sq; break; }
                }
                return rSq !== -1 ? build_move_direct(state, kSq, rSq) : null;
            }
        }

        var promo = null, destIndex = clean.length - 1;
        var lastChar = clean.charCodeAt(destIndex);
        if ((lastChar >= 66 && lastChar <= 82) || (lastChar >= 98 && lastChar <= 114)) {
            var prev = clean.charCodeAt(destIndex - 1);
            if ((prev >= 49 && prev <= 56) || prev === 61) {
                promo = String.fromCharCode(lastChar).toLowerCase();
                destIndex--;
                if (clean.charCodeAt(destIndex) === 61) destIndex--;
            }
        }

        var to = (clean.charCodeAt(destIndex) - 49) * 8 + (clean.charCodeAt(destIndex - 1) - 97);
        var first = clean.charCodeAt(0);
        var type = PAWN, cursor = 0;
        if (first >= 65 && first <= 90) {
            var pt = CHAR_CODE_TO_PIECE[first];
            if (pt !== -1) { type = pt; cursor = 1; }
        }

        var us = state.turn;
        var bb_lo = state.bb_lo, bb_hi = state.bb_hi; 
        var candL = 0, candH = 0;

        if (type === PAWN) {
            let tVal = state.board[to];
            var isCapture = (clean.charCodeAt(1) === 120) || (tVal !== -1 && (tVal >> 3) !== us) || (to === state.ep_square);
            if (isCapture) {
                candL = PAWN_LO[us ^ 1][to] & bb_lo[us * 6 + PAWN];
                candH = PAWN_HI[us ^ 1][to] & bb_hi[us * 6 + PAWN];
            } else {
                var from1 = us === WHITE ? to - 8 : to + 8;
                if (from1 >= 0 && from1 < 64 && (state.board[from1] & 7) === PAWN) {
                    if (from1 < 32) candL |= (1 << from1); else candH |= (1 << (from1 - 32));
                }
                var from2 = us === WHITE ? to - 16 : to + 16;
                var mid = us === WHITE ? to - 8 : to + 8;
                var isStandardDouble = (to >> 3) === (us === WHITE ? 3 : 4);
                
                if (isStandardDouble && from2 >= 0 && from2 < 64 && (state.board[from2] & 7) === PAWN && state.board[mid] === -1) {
                    if (from2 < 32) candL |= (1 << from2); else candH |= (1 << (from2 - 32));
                }
            }
        } else if (type === KNIGHT) {
            candL = KNIGHT_LO[to] & bb_lo[us * 6 + KNIGHT];
            candH = KNIGHT_HI[to] & bb_hi[us * 6 + KNIGHT];
        } else if (type === KING) {
            candL = KING_LO[to] & bb_lo[us * 6 + KING];
            candH = KING_HI[to] & bb_hi[us * 6 + KING];
        } else {
            let occL = 0, occH = 0;
            for (let i = 0; i < 12; i++) { occL |= bb_lo[i]; occH |= bb_hi[i]; }
            let att = get_slider_attacks(type, to, occL, occH);
            candL = att.lo & bb_lo[us * 6 + type];
            candH = att.hi & bb_hi[us * 6 + type];
        }

        while (candL || candH) {
            var from = ctz(candL, candH);
            if (from < 32) candL &= ~(1 << from); else candH &= ~(1 << (from - 32));
            var match = true;
            if (destIndex - 1 > cursor) {
                var fChar = 97 + (from & 7);
                var rChar = 49 + (from >> 3);
                for (var k = cursor; k < destIndex - 1; k++) {
                    var ch = clean.charCodeAt(k);
                    if (ch === 120) continue;
                    if (ch >= 97 && ch <= 104) { if (fChar !== ch) { match = false; break; } }
                    else if (ch >= 49 && ch <= 56) { if (rChar !== ch) { match = false; break; } }
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
        var from = m & 0x3F, to = (m >>> 6) & 0x3F, flags = (m >>> 12) & 0x7F, promo = (m >>> 19) & 0x7;
        var f = "n";
        if (flags & BITS.KSIDE_CASTLE) f = "k";
        else if (flags & BITS.QSIDE_CASTLE) f = "q";
        else if ((flags & BITS.CAPTURE) && (flags & BITS.PROMOTION)) f = "cp";
        else if (flags & BITS.PROMOTION) f = "p";
        else if (flags & BITS.CAPTURE) f = "c";
        else if (flags & BITS.EP_CAPTURE) f = "e";
        else if (flags & BITS.BIG_PAWN) f = "b";
        else if ((flags & BITS.DROP) && !(flags & BITS.PROMOTION)) f = "d";

        // Handle Drops Object Formatting
        if ((flags & BITS.DROP) && !(flags & BITS.PROMOTION)) {
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
            var tVal = get_piece_at(state, to);
            if (tVal !== -1) cap = PIECE_TO_CHAR[tVal & 7];
        } else if (flags & BITS.EP_CAPTURE) cap = 'p';
        
        var pVal = get_piece_at(state, from);
        var obj = { 
            color: state.turn===WHITE?'w':'b', from: sq_str(from), to: sq_str(to), flags: f, piece: PIECE_TO_CHAR[pVal !== -1 ? pVal & 7 : 0], 
            san: known_san || get_san(state, m), promotion: (flags & BITS.PROMOTION) ? PIECE_TO_CHAR[promoInt] : undefined, captured: cap 
        };
        if (state.gameMode === 'duck') obj.duck_sq = sq_str((m >>> 22) & 0x3F);
        if (nag) obj.nag = nag;
        return obj;
    }
    function get_san(state, m) {
        var flags = (m >>> 12) & 0x7F;
        
        if ((flags & BITS.DROP) && !(flags & BITS.PROMOTION)) {
            var pType = m & 0x3F;
            var to = (m >>> 6) & 0x3F;
            var s = (PIECE_TO_CHAR[pType] ? PIECE_TO_CHAR[pType].toUpperCase() : '') + '@' + (SQ_STR[to] || '');
            var nextState = apply_move(state, m);
            if (is_checked(nextState, nextState.turn)) {
                s += (generate_moves(nextState, {legal: true}).length === 0) ? '#' : '+';
            }
            return s;
        }

        var from = m & 0x3F, to = (m >>> 6) & 0x3F, promo = (m >>> 19) & 0x7;
        var pVal = get_piece_at(state, from);
        var pType = pVal !== -1 ? (pVal & 7) : 0;
        var us = state.turn;
        
        if (flags & BITS.KSIDE_CASTLE) return "O-O"; 
        if (flags & BITS.QSIDE_CASTLE) return "O-O-O";
        
        var pChar = PIECE_TO_CHAR[pType];
        var s = (pType !== PAWN && pChar) ? pChar.toUpperCase() : "";
        
        var ambigFile = false, ambigRank = false;
        if (pType !== PAWN && pType !== KING) {
            var occAllL = 0, occAllH = 0;
            for (let i = 0; i < 12; i++) { 
                occAllL |= state.bb_lo[i]; 
                occAllH |= state.bb_hi[i]; 
            }

            var candL = 0, candH = 0;
            if (pType === KNIGHT) {
                candL = KNIGHT_LO[to] & state.bb_lo[us * 6 + KNIGHT];
                candH = KNIGHT_HI[to] & state.bb_hi[us * 6 + KNIGHT];
            } else if (pType === BISHOP) {
                let att = get_slider_attacks(BISHOP, to, occAllL, occAllH);
                candL = att.lo & state.bb_lo[us * 6 + BISHOP];
                candH = att.hi & state.bb_hi[us * 6 + BISHOP];
            } else if (pType === ROOK) {
                let att = get_slider_attacks(ROOK, to, occAllL, occAllH);
                candL = att.lo & state.bb_lo[us * 6 + ROOK];
                candH = att.hi & state.bb_hi[us * 6 + ROOK];
            } else if (pType === QUEEN) {
                let att = get_slider_attacks(QUEEN, to, occAllL, occAllH);
                candL = att.lo & state.bb_lo[us * 6 + QUEEN];
                candH = att.hi & state.bb_hi[us * 6 + QUEEN];
            }

            if (popcount(candL, candH) > 1) {
                var otherLegalCount = 0;
                var sameFile = false, sameRank = false;

                while (candL || candH) {
                    var aSq = ctz(candL, candH);
                    if (aSq < 32) candL &= ~(1 << aSq); else candH &= ~(1 << (aSq - 32));

                    if (aSq !== from) {
                        var testM = aSq | (to << 6) | (flags << 12);
                        if (is_standard_legal_fast(state, testM)) {
                            otherLegalCount++;
                            if ((aSq & 7) === (from & 7)) sameFile = true;
                            if ((aSq >> 3) === (from >> 3)) sameRank = true;
                        }
                    }
                }

                if (otherLegalCount > 0) {
                    if (!sameFile) ambigFile = true;
                    else if (!sameRank) ambigRank = true;
                    else { ambigFile = true; ambigRank = true; }
                }
            }
        }
        
        if (SQ_STR[from]) {
            if (ambigFile) s += SQ_STR[from][0]; 
            else if (ambigRank) s += SQ_STR[from][1];
        }
        if (flags & (BITS.CAPTURE | BITS.EP_CAPTURE)) { 
            if (pType === PAWN && !ambigFile && SQ_STR[from]) s += SQ_STR[from][0]; 
            s += "x"; 
        }
        if (SQ_STR[to]) s += SQ_STR[to];
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
                if (state.checks_w >= 3) return WHITE; 
                if (state.checks_b >= 3) return BLACK; 
                return null;
            case 'horde':
                let wPieces = 0;
                for(let p=0; p<6; p++) wPieces |= state.bb_lo[WHITE*6+p] | state.bb_hi[WHITE*6+p];
                if (!wPieces) return BLACK;
                return null;
            case 'atomic':
                let wKa = state.bb_lo[WHITE*6+KING] | state.bb_hi[WHITE*6+KING];
                let bKa = state.bb_lo[BLACK*6+KING] | state.bb_hi[BLACK*6+KING];
                if (!wKa && bKa) return BLACK;
                if (!bKa && wKa) return WHITE;
                return null;
            case 'antichess':
                let anti_us = state.turn;
                let anti_hasPieces = 0;
                for(let p=0; p<6; p++) anti_hasPieces |= state.bb_lo[anti_us*6+p] | state.bb_hi[anti_us*6+p];
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
                    if (rk_bk >= 56 && rk_wk < 56) return BLACK;
                    if (rk_wk >= 56 && rk_bk < 56 && state.turn === WHITE) return WHITE;
                }
                return null;
            case 'chaturanga':
                let c_wK = state.bb_lo[WHITE*6+KING] | state.bb_hi[WHITE*6+KING];
                let c_bK = state.bb_lo[BLACK*6+KING] | state.bb_hi[BLACK*6+KING];
                if (!c_wK) return BLACK;
                if (!c_bK) return WHITE;
                let wp = 0, bp = 0;
                for(let p=0; p<6; p++){
                    wp += popcount(state.bb_lo[WHITE*6+p], state.bb_hi[WHITE*6+p]);
                    bp += popcount(state.bb_lo[BLACK*6+p], state.bb_hi[BLACK*6+p]);
                }
                if (wp === 1 && bp > 1) return BLACK;
                if (bp === 1 && wp > 1) return WHITE;
                return null;
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
            case 'spell':
                let duck_wK = state.bb_lo[WHITE*6+KING] | state.bb_hi[WHITE*6+KING];
                let duck_bK = state.bb_lo[BLACK*6+KING] | state.bb_hi[BLACK*6+KING];
                if (!duck_wK) return BLACK;
                if (!duck_bK) return WHITE;
                if (generate_moves(state, {legal: true}).length === 0) return state.turn === WHITE ? BLACK : WHITE;
                return null;
            default: return null;
        }
    }
    function load_fen(fen, setGameMode = 'classical') {
    var s = STATE_POOL.pop() || create_empty_state();
    s.gameMode = setGameMode;
    s.board.fill(-1);
    s.bb_lo.fill(0);
    s.bb_hi.fill(0);
    s.castling = 0;
    s.ep_square = -1;
    s.half_moves = 0;
    s.move_number = 1;
    s.checks_w = 0;
    s.checks_b = 0;
    s.pocket_w = 0;
    s.pocket_b = 0;
    s.promoted_lo = 0;
    s.promoted_hi = 0;
    s.duck_sq = -1;
    s.alice_b_lo = 0;
    s.alice_b_hi = 0;
    s.frozen_lo = 0;
    s.frozen_hi = 0;

    var tokens = fen.trim().split(/\s+/);
    var boardToken = tokens[0];

    var pocketMatch = fen.match(/\[([a-zA-Z]*)\]/);
    if ((setGameMode === 'crazyhouse' || setGameMode === 'bughouse' || setGameMode === 'placement') && pocketMatch) {
        var pocketStr = pocketMatch[1];
        if (boardToken.indexOf('[') !== -1) boardToken = boardToken.substring(0, boardToken.indexOf('['));
        for (var i = 0; i < pocketStr.length; i++) {
            var c = pocketStr.charCodeAt(i);
            var col = (c < 97) ? WHITE : BLACK;
            var typ = CHAR_TO_PIECE[String.fromCharCode(c | 32)];
            if (typ !== undefined) {
                if (col === WHITE) s.pocket_w += (1 << (typ * 5));
                else s.pocket_b += (1 << (typ * 5));
            }
        }
    }

    var sq = 56;
    for (var i = 0; i < boardToken.length; i++) {
        var c = boardToken.charCodeAt(i);
        if (c === 47) { // '/'
            sq -= 16;
        } else if (c >= 48 && c <= 57) { // '1' - '8'
            sq += (c - 48);
        } else if (c === 42) { // '*'
            if (setGameMode === 'duck') s.duck_sq = sq;
            sq++;
        } else if (c === 126) { // '~' 
            let prevSq = sq - 1;
            if (prevSq >= 0 && prevSq < 64) {
                if (setGameMode === 'crazyhouse') {
                    if (prevSq < 32) s.promoted_lo = (s.promoted_lo | (1 << prevSq)) >>> 0;
                    else s.promoted_hi = (s.promoted_hi | (1 << (prevSq - 32))) >>> 0;
                } else if (setGameMode === 'alice') {
                    if (prevSq < 32) s.alice_b_lo = (s.alice_b_lo | (1 << prevSq)) >>> 0;
                    else s.alice_b_hi = (s.alice_b_hi | (1 << (prevSq - 32))) >>> 0;
                }
            }
        } else {
            var col = (c < 97) ? WHITE : BLACK;
            var typ = CHAR_TO_PIECE[String.fromCharCode(c | 32)];
            if (sq >= 0 && sq < 64 && typ !== undefined) {
                if (sq < 32) s.bb_lo[col * 6 + typ] = (s.bb_lo[col * 6 + typ] | (1 << sq)) >>> 0;
                else s.bb_hi[col * 6 + typ] = (s.bb_hi[col * 6 + typ] | (1 << (sq - 32))) >>> 0;
                s.board[sq] = (col << 3) | typ;
            }
            sq++;
        }
    }

    s.turn = (tokens[1] === 'b') ? BLACK : WHITE;

    if (tokens[2] && tokens[2] !== '-') {
        for (var i = 0; i < tokens[2].length; i++) {
            var char = tokens[2][i];
            if (char === 'K') s.castling |= 1;
            else if (char === 'Q') s.castling |= 2;
            else if (char === 'k') s.castling |= 4;
            else if (char === 'q') s.castling |= 8;
            else if (char >= 'A' && char <= 'H') {
                // Chess960 White rooks
                var file = char.charCodeAt(0) - 65;
                var kL = s.bb_lo[WHITE * 6 + KING], kH = s.bb_hi[WHITE * 6 + KING];
                var kFile = (kL || kH) ? (ctz(kL, kH) & 7) : 4;
                s.castling |= (file > kFile) ? 1 : 2;
            } else if (char >= 'a' && char <= 'h') {
                // Chess960 Black rooks
                var file = char.charCodeAt(0) - 97;
                var kL = s.bb_lo[BLACK * 6 + KING], kH = s.bb_hi[BLACK * 6 + KING];
                var kFile = (kL || kH) ? (ctz(kL, kH) & 7) : 4;
                s.castling |= (file > kFile) ? 4 : 8;
            }
        }
    }

    s.ep_square = (tokens[3] === '-' || !tokens[3]) ? -1 : str_to_sq(tokens[3]);
    if (s.ep_square !== -1) {
        let capSq = (s.turn === WHITE) ? s.ep_square - 8 : s.ep_square + 8;
        let enemyPawn = (s.turn === WHITE) ? (BLACK * 6 + PAWN) : (WHITE * 6 + PAWN);
        let mask = (capSq < 32) ? (1 << capSq) : (1 << (capSq - 32));
        let pawnExists = (capSq < 32 ? s.bb_lo[enemyPawn] : s.bb_hi[enemyPawn]) & mask;
        if (!pawnExists) s.ep_square = -1;
    }

    s.half_moves = parseInt(tokens[4], 10) || 0;
    s.move_number = parseInt(tokens[5], 10) || 1;

    if (setGameMode === 'duck' && tokens.length >= 7) {
        if (isNaN(parseInt(tokens[4], 10))) {
            s.duck_sq = (tokens[4] === '-') ? -1 : str_to_sq(tokens[4]);
            s.half_moves = parseInt(tokens[5], 10) || 0;
            s.move_number = parseInt(tokens[6], 10) || 1;
        } else {
            s.duck_sq = (tokens[6] === '-') ? -1 : str_to_sq(tokens[6]);
        }
    }

    if (s.gameMode === '3check') {
        let checkMatch = fen.match(/\+(\d+)\+(\d+)/);
        if (checkMatch) {
            s.checks_w = parseInt(checkMatch[1], 10) || 0;
            s.checks_b = parseInt(checkMatch[2], 10) || 0;
        }
    }

    if (s.gameMode === 'spell') {
        let spellMatch = fen.match(/\[S:([^\]]+)\]/);
        if (spellMatch) {
            let p = spellMatch[1].split(',');
            if (p.length >= 16) {
                s.mana_w_freeze = parseInt(p[0], 10) || 0; s.mana_w_jump = parseInt(p[1], 10) || 0;
                s.mana_b_freeze = parseInt(p[2], 10) || 0; s.mana_b_jump = parseInt(p[3], 10) || 0;
                s.spell_uses_w_freeze = parseInt(p[4], 10) || 0; s.spell_uses_w_jump = parseInt(p[5], 10) || 0;
                s.spell_uses_b_freeze = parseInt(p[6], 10) || 0; s.spell_uses_b_jump = parseInt(p[7], 10) || 0;
                s.active_w_frozen_sq = parseInt(p[8], 10); s.active_w_frozen_timer = parseInt(p[9], 10) || 0;
                s.active_b_frozen_sq = parseInt(p[10], 10); s.active_b_frozen_timer = parseInt(p[11], 10) || 0;
                s.active_w_jump_sq = parseInt(p[12], 10); s.active_w_jump_timer = parseInt(p[13], 10) || 0;
                s.active_b_jump_sq = parseInt(p[14], 10); s.active_b_jump_timer = parseInt(p[15], 10) || 0;
            }
        }
        rebuild_spell_caches(s);
    }
    s.zobrist = compute_zobrist(s);
    hashHistoryCount = 0;
    HASH_HISTORY[hashHistoryCount++] = s.zobrist;
    return s;
    }
    function generate_fen(targetState) {
        var s = targetState || currentState; 
        var empty = 0, ptr = 0;
        
        for (var r = 7; r >= 0; r--) {
            for (var f = 0; f < 8; f++) {
                var sq = (r << 3) | f;
                var val = get_piece_at(s, sq);
                
                if (s.gameMode === 'duck' && s.duck_sq === sq) {
                    if (empty > 0) { FEN_BUFFER[ptr++] = 48 + empty; empty = 0; }
                    FEN_BUFFER[ptr++] = 42;
                } else if (val === -1) {
                    empty++;
                } else {
                    if (empty > 0) { FEN_BUFFER[ptr++] = 48 + empty; empty = 0; }
                    var typ = val & 7;
                    var col = val >> 3;
                    var charCode = 0;
                    FEN_BUFFER[ptr++] = FEN_PIECE_CODES[col][typ];
                    
                    if (s.gameMode === 'crazyhouse' && ((sq < 32) ? (s.promoted_lo & (1<<sq)) : (s.promoted_hi & (1<<(sq-32))))) {
                        FEN_BUFFER[ptr++] = 126; // ~
                    } else if (s.gameMode === 'alice' && ((sq < 32) ? (s.alice_b_lo & (1<<sq)) : (s.alice_b_hi & (1<<(sq-32))))) {
                        FEN_BUFFER[ptr++] = 126; // ~
                    }
                } 
            }
            if (empty > 0) { FEN_BUFFER[ptr++] = 48 + empty; empty = 0; }
            if (r > 0) FEN_BUFFER[ptr++] = 47; // /
        }
        FEN_BUFFER[ptr++] = 32;
        FEN_BUFFER[ptr++] = s.turn === WHITE ? 119 : 98;
        
        FEN_BUFFER[ptr++] = 32; 
        let cStart = ptr;
        if (s.castling & 1) FEN_BUFFER[ptr++] = 75; // K
        if (s.castling & 2) FEN_BUFFER[ptr++] = 81; // Q
        if (s.castling & 4) FEN_BUFFER[ptr++] = 107; // k
        if (s.castling & 8) FEN_BUFFER[ptr++] = 113; // q
        if (ptr === cStart) FEN_BUFFER[ptr++] = 45;
        
        FEN_BUFFER[ptr++] = 32; 
        if (s.ep_square === -1) {
            FEN_BUFFER[ptr++] = 45; 
        } else {
            FEN_BUFFER[ptr++] = 97 + (s.ep_square & 7); 
            FEN_BUFFER[ptr++] = 49 + (s.ep_square >> 3); 
        }
        
        FEN_BUFFER[ptr++] = 32; 
        let hmStr = s.half_moves.toString();
        for (let i = 0; i < hmStr.length; i++) FEN_BUFFER[ptr++] = hmStr.charCodeAt(i);
        
        FEN_BUFFER[ptr++] = 32; 
        let fmStr = s.move_number.toString();
        for (let i = 0; i < fmStr.length; i++) FEN_BUFFER[ptr++] = fmStr.charCodeAt(i);
        
        if (s.gameMode === 'crazyhouse' || s.gameMode === 'bughouse' || s.gameMode === 'placement') {
            FEN_BUFFER[ptr++] = 91; // [
            for (var pType = 0; pType <= 4; pType++) {
                let wCount = (s.pocket_w >> (pType * 5)) & 31;
                let bCount = (s.pocket_b >> (pType * 5)) & 31;
                let cW = PIECE_TO_CHAR[pType].toUpperCase().charCodeAt(0);
                let cB = PIECE_TO_CHAR[pType].charCodeAt(0);
                for (var i = 0; i < wCount; i++) FEN_BUFFER[ptr++] = cW;
                for (var i = 0; i < bCount; i++) FEN_BUFFER[ptr++] = cB;
            }
            FEN_BUFFER[ptr++] = 93; // ]
        }
        let finalFen = String.fromCharCode.apply(null, FEN_BUFFER.subarray(0, ptr));
        
        if (s.gameMode === '3check') {
            finalFen += " +" + s.checks_w + "+" + s.checks_b;
        }
        if (s.gameMode === 'spell') {
            finalFen += ` [S:${s.mana_w_freeze},${s.mana_w_jump},${s.mana_b_freeze},${s.mana_b_jump},${s.spell_uses_w_freeze},${s.spell_uses_w_jump},${s.spell_uses_b_freeze},${s.spell_uses_b_jump},${s.active_w_frozen_sq},${s.active_w_frozen_timer},${s.active_b_frozen_sq},${s.active_b_frozen_timer},${s.active_w_jump_sq},${s.active_w_jump_timer},${s.active_b_jump_sq},${s.active_b_jump_timer}]`;
        }
        return finalFen;
    }
var Chess = function(fen, gameMode = 'classical') {
    function log(ctx, msg) { console.log(`%c[${ctx}]`, "color: #0ff; font-weight: bold;", msg); }
    function error(ctx, msg) { console.error(`%c[${ctx}]`, "color: #f00; font-weight: bold;", msg); }

    var hashHistoryCount = 0;
    var currentState = null;
    var history = []; 
    
    currentState = load_fen(fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", gameMode);
    history.push(currentState);
return {
        WHITE: 'w', BLACK: 'b',
        setGameMode: function(mode) { 
            currentState.gameMode = mode; 
            for (let i = 0; i < history.length; i++) history[i].gameMode = mode; 
        },
        gameMode: function() { return currentState.gameMode; },
        load: function(r) { 
        while (history.length > 0 && STATE_POOL.length < 5000) {
            STATE_POOL.push(history.pop());
        }
        history.length = 0;

        let s = load_fen(r, currentState.gameMode);
        if (!s) return false;

        currentState = s; 
        history.push(currentState); 
        return true; 
        },
        reset: function() { 
            while (history.length > 0 && STATE_POOL.length < 5000) {
                STATE_POOL.push(history.pop());
            }
            history.length = 0;

            currentState = load_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", currentState.gameMode); 
            if (currentState.gameMode === 'duck') currentState.duck_sq = -1;
            history.push(currentState);

            hashHistoryCount = 0;
            HASH_HISTORY[hashHistoryCount++] = currentState.zobrist;
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
        draft_spell: function(spellType, targetSq) {
            if (!this._draftBackup) {
                this._draftBackup = currentState; 
            }
            let sq = typeof targetSq === 'number' ? targetSq : (isNaN(targetSq) ? str_to_sq(targetSq) : parseInt(targetSq));
            currentState = apply_spell(this._draftBackup, spellType, sq); 
            return { isStandaloneSpell: true, san: (spellType === 'freeze' ? 'Fz@' : 'Jp@') + sq_str(sq) };
        },
        cancel_draft: function() {
            if (this._draftBackup) {
                console.log(`[ENGINE API] Draft cancelled. Reverting physics.`);
                currentState = this._draftBackup; 
                this._draftBackup = null;
                return true;
            }
            return false;
        },
        moves: function(o) {
            if (this.game_over()) return [];

            var filterFrom = -1;
            if (o) {
                if (typeof o.from === 'number') filterFrom = o.from;
                else if (typeof o.from === 'string') filterFrom = str_to_sq(o.from);
                else if (typeof o.square === 'string') filterFrom = str_to_sq(o.square);
                else if (typeof o.square === 'number') filterFrom = o.square;
            }

            var ms = generate_moves(currentState, o);
            var isVerbose = Boolean(o && o.verbose);
            var res = [];

            for (var i = 0; i < ms.length; i++) {
                var m = ms[i];
                var from = m & 0x3F;
                if (filterFrom !== -1 && from !== filterFrom) {
                    var flags = (m >>> 12) & 0x7F;
                    if (!(((flags & BITS.DROP) && !(flags & BITS.PROMOTION)) && filterFrom === 64)) continue;
                }

                res.push(isVerbose ? to_obj(currentState, m) : get_san(currentState, m));
            }
            return res;
        },
        move: function(o) {
            this.cancel_draft();
            if (!o) return null;

            let activeColor = currentState.turn === WHITE ? 'w' : 'b';

            if (typeof o === 'string') {
                let c0 = o.charCodeAt(0);
                if (c0 === 70 || c0 === 102 || c0 === 74 || c0 === 106 || c0 === 83 || c0 === 115) {
                    let combinedMatch = o.match(/^(Fz|Jp|Sfreeze|Sjump)@([a-h][1-8]|[0-9]+)[\s_]+(.+)$/i);
                    if (combinedMatch) {
                        let rawTarget = combinedMatch[2];
                        let targetAlg = isNaN(rawTarget) ? rawTarget : sq_str(parseInt(rawTarget, 10)); 
                        o = {
                            isSpell: true,
                            spellType: (combinedMatch[1].toLowerCase().includes('fz') || combinedMatch[1].toLowerCase().includes('freeze')) ? 'freeze' : 'jump',
                            target: targetAlg,
                            chessMove: combinedMatch[3]
                        };
                    }
                }
            }

            let isSpellMove = Boolean(typeof o === 'object' && (o.isSpell || o.spellType || o.type));

            if (isSpellMove && !o.chessMove && o.from === undefined && !o.drop) {
                let sType = o.spellType || o.type;
                let tVal = o.target !== undefined ? o.target : o.square;
                let sq = typeof tVal === 'number' ? tVal : (isNaN(tVal) ? str_to_sq(tVal) : parseInt(tVal, 10));
                let algStr = typeof tVal === 'string' && isNaN(tVal) ? tVal : sq_str(sq);
                
                var nextState = apply_spell(currentState, sType, sq);
                let oldUses = currentState.spell_uses || { w: {freeze:5, jump:2}, b: {freeze:5, jump:2} };
                nextState.spell_uses = { w: { ...oldUses.w }, b: { ...oldUses.b } };
                nextState.spell_uses[activeColor][sType] = Math.max(0, nextState.spell_uses[activeColor][sType] - 1);
                
                currentState = nextState;
                history.push(currentState);
                HASH_HISTORY[hashHistoryCount++] = nextState.zobrist;
                
                return {
                    color: currentState.turn === WHITE ? 'w' : 'b',
                    flags: 's',
                    from: '@',
                    to: algStr,
                    piece: 's',
                    san: (sType === 'freeze' ? 'Fz@' : 'Jp@') + algStr,
                    isSpell: true,
                    spellType: sType,
                    target: algStr
                };
            }

            let baseState = currentState;
            if (isSpellMove) {
                let sType = o.spellType || o.type;
                let tVal = o.target !== undefined ? o.target : o.square;
                let targetEngineIdx = typeof tVal === 'number' ? tVal : (isNaN(tVal) ? str_to_sq(tVal) : parseInt(tVal, 10));
                baseState = apply_spell(currentState, sType, targetEngineIdx);
            }
            
            let input = (isSpellMove && o.chessMove) ? o.chessMove : o;
            var m = null;
            var nag = "";
            var clean_san = null;
            var explicit_duck = -1;
            var known_san = null;
            
            if (typeof input === 'string') {
                let c0 = input.charCodeAt(0);
                if (c0 === 70 || c0 === 102 || c0 === 74 || c0 === 106 || c0 === 83 || c0 === 115) {
                    let spellMatch = input.match(/^S?(freeze|jump|Fz|Jp)@([a-h][1-8]|[0-9]+)$/i);
                    if (spellMatch) {
                        let type = (spellMatch[1].toLowerCase().includes('fz') || spellMatch[1].toLowerCase().includes('freeze')) ? 'freeze' : 'jump';
                        let sqStr = spellMatch[2];
                        let sq = isNaN(sqStr) ? str_to_sq(sqStr) : parseInt(sqStr, 10);
                        let algStr = isNaN(sqStr) ? sqStr : sq_str(sq);
                        
                        var nextState = apply_spell(currentState, type, sq);
                        let oldUses = currentState.spell_uses || { w: {freeze:5, jump:2}, b: {freeze:5, jump:2} };
                        nextState.spell_uses = { w: { ...oldUses.w }, b: { ...oldUses.b } };
                        nextState.spell_uses[activeColor][type] = Math.max(0, nextState.spell_uses[activeColor][type] - 1);
                        
                        currentState = nextState;
                        history.push(currentState);
                        HASH_HISTORY[hashHistoryCount++] = nextState.zobrist;
                        
                        return {
                            color: currentState.turn === WHITE ? 'w' : 'b',
                            flags: 's',
                            from: '@',
                            to: algStr,
                            piece: 's',
                            san: (type === 'freeze' ? 'Fz@' : 'Jp@') + algStr,
                            isSpell: true,
                            spellType: type,
                            target: algStr
                        };
                    }
                }

                var nag = "";
                var clean_san = input;
                var hasSpecial = false;
                for (var si = 0; si < input.length; si++) {
                    var sc = input.charCodeAt(si);
                    if (sc === 33 || sc === 63 || sc === 43 || sc === 35 || sc === 61) {
                        hasSpecial = true; break;
                    }
                }
                if (hasSpecial) {
                    var parsed = parse_nag(input);
                    nag = parsed.nag;
                    clean_san = parsed.clean;
                }
                known_san = clean_san;
                
                if (baseState.gameMode === 'duck') {
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
                } else if ((baseState.gameMode === 'crazyhouse' || baseState.gameMode === 'bughouse' || baseState.gameMode === 'placement') && clean_san.includes('@')) {
                    let parts = clean_san.split('@');
                    let pTypeStr = parts[0].toLowerCase();
                    let pType = CHAR_TO_PIECE[pTypeStr.charAt(pTypeStr.length - 1)]; 
                    let toSq = str_to_sq(parts[1].replace(/[^a-h1-8]/g, ''));
                    m = pType | (toSq << 6) | (BITS.DROP << 12);
                    if (!is_drop_legal_fast(baseState, m)) m = null;
                    clean_san = null;
                }
                
                if (clean_san) {
                    if (clean_san.length >= 4 && clean_san.length <= 5 && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(clean_san)) {
                        let f = str_to_sq(clean_san.substring(0, 2));
                        let t = str_to_sq(clean_san.substring(2, 4));
                        let p = clean_san.length === 5 ? clean_san[4] : null;
                        m = build_move_direct(baseState, f, t, p);
                        clean_san = null;
                    } else { 
                        m = tr(baseState, clean_san);
                    }
                }
            } else {
                if (input.from === '@' || input.drop) {
                    let pTypeStr = typeof input.drop === 'string' ? input.drop : input.piece;
                    let pType = CHAR_TO_PIECE[pTypeStr.toLowerCase()];
                    let t = (typeof input.to === 'number') ? input.to : str_to_sq(input.to);
                    m = pType | (t << 6) | (BITS.DROP << 12);
                    
                    if (baseState.gameMode === 'placement' && get_piece_at(baseState, t) === -1) {
                        let r = t >> 3;
                        if (pType === PAWN && (r === 0 || r === 7)) m = null;
                        else if (!(baseState.pocket && baseState.pocket[activeColor] && baseState.pocket[activeColor].includes(pType))) m = null;
                    } else {
                        if (!is_drop_legal_fast(baseState, m)) m = null;
                    }
                } else {
                    let f = (typeof input.from === 'number') ? input.from : str_to_sq(input.from);
                    let t = (typeof input.to === 'number') ? input.to : str_to_sq(input.to);
                    m = build_move_direct(baseState, f, t, input.promotion); 
                    
                    if (baseState.gameMode === 'duck' && input.duck_sq !== undefined) {
                        explicit_duck = (typeof input.duck_sq === 'number') ? input.duck_sq : str_to_sq(input.duck_sq);
                        if (m !== null && explicit_duck !== -1) {
                            m = (m & 0x3FFFFF) | (explicit_duck << 22);
                        }
                    }
                }
                known_san = input.san || null;
            }

            if (m === null) { 
                error("INVALID_MOVE", input); 
                return null; 
            }
            
            if (baseState.gameMode === 'duck') {
                if (((m >>> 22) & 0x3F) === 0 && explicit_duck === -1) {
                    let duckToUse = baseState.duck_sq !== -1 ? baseState.duck_sq : 0; 
                    m = (m & 0x3FFFFF) | (duckToUse << 22);
                }
            }
            
            var ret = to_obj(baseState, m, nag, clean_san || known_san);
            
            if (isSpellMove) {
                ret.isSpell = true;
                ret.spellType = o.spellType;
                ret.target = o.target; 

                let prefix = o.spellType === 'freeze' ? 'Fz' : 'Jp';
                let targetStr = typeof o.target === 'number' ? sq_str(o.target) : o.target;
                ret.spellSan = `${prefix}@${targetStr}`;
                
                if (!ret.san.startsWith('Fz@') && !ret.san.startsWith('Jp@')) {
                    ret.san = `${ret.spellSan} ${ret.san}`;
                }
            }
            
            if (baseState.gameMode === 'duck') {
                let dIdx = (m >>> 22) & 0x3F;
                let duckSqStr = SQ_STR[dIdx] || 'a1'; 
                ret.uci = ret.from + ret.to + (ret.promotion ? ret.promotion : '') + ',' + duckSqStr;
                if (!ret.san.includes('@')) {
                    ret.san += '@' + duckSqStr;
                }
            } else if ((baseState.gameMode === 'crazyhouse' || baseState.gameMode === 'bughouse' || baseState.gameMode === 'placement') && (((m >>> 12) & 0xFF) & BITS.DROP)) {
                let pType = m & 0x3F;
                ret.uci = PIECE_TO_CHAR[pType].toUpperCase() + '@' + ret.to; 
            } else {
                ret.uci = ret.from + ret.to + (ret.promotion ? ret.promotion : '');
            }

            var nextState = apply_move(baseState, m);

            if (isSpellMove) {
                let oldUses = currentState.spell_uses || { w: {freeze:5, jump:2}, b: {freeze:5, jump:2} };
                nextState.spell_uses = { w: { ...oldUses.w }, b: { ...oldUses.b } };
                nextState.spell_uses[activeColor][o.spellType] = Math.max(0, nextState.spell_uses[activeColor][o.spellType] - 1);
            } else if (currentState.spell_uses) {
                nextState.spell_uses = currentState.spell_uses;
            }
            if (!known_san) {
                var isVariantWin = check_variant_win(nextState) !== null;
                var isCheck = is_checked(nextState, nextState.turn);

                if (isVariantWin) {
                    ret.san += "#";
                } else if (isCheck) {
                    let hasMove = (typeof has_legal_moves === 'function') 
                        ? has_legal_moves(nextState) 
                        : (generate_moves(nextState, { legal: true }).length > 0);
                    ret.san += hasMove ? "+" : "#";
                }
            }
            
            if (nag) { ret.san += nag; ret.nag = nag; }
            history.push(nextState);
            currentState = nextState;
            HASH_HISTORY[hashHistoryCount++] = nextState.zobrist;
            return ret;
        },
        undo: function() {
            if (history.length > 1) { 
                var undone = history.pop();
                if (STATE_POOL.length < 5000) STATE_POOL.push(undone);
                
                currentState = history[history.length - 1];
                if (hashHistoryCount > 1) hashHistoryCount--;
                return undone;
            }
            return null;
        },
        get: function(sq) { 
            var idx = str_to_sq(sq); if (idx === -1) return null;
            var val = get_piece_at(currentState, idx);
            if (val !== -1) {
                var t = val & 7; 
                var c = val >> 3;
                return { type: PIECE_TO_CHAR[t], color: c===WHITE?'w':'b' };
            }
            return null;
        },
        fen: function() { 
            return generate_fen(currentState);
        },
        board: function() {
            return currentState.board;
        },
        turn: function() { return currentState.turn===WHITE?'w':'b'; },
        variant_winner: function() { 
            let res = check_variant_win(currentState);
            if (res === WHITE) return 'w';
            if (res === BLACK) return 'b';

            if (currentState.gameMode === 'chaturanga') {
                if (!is_checked(currentState, currentState.turn) && generate_chaturanga_moves(currentState, {legal:true}).length === 0) {
                    return currentState.turn === WHITE ? 'w' : 'b';
                }
            }
            return null;
        },
        get_duck_sq: function() { return currentState.duck_sq; },
        in_check: function() { return is_checked(currentState, currentState.turn); },
        in_checkmate: function() { 
        if (check_variant_win(currentState) !== null) return true;
        return is_checked(currentState, currentState.turn) && !has_legal_moves(currentState); 
        },
        in_stalemate: function() { 
            if (currentState.gameMode === 'duck') return false; 
            return !is_checked(currentState, currentState.turn) && !has_legal_moves(currentState); 
        },
        in_threefold_repetition: function() {
            var current_key = currentState.zobrist;
            var count = 0;
            
            var limit = Math.max(0, hashHistoryCount - 1 - currentState.half_moves);
            for (var i = hashHistoryCount - 1; i >= limit; i -= 2) {
                if (HASH_HISTORY[i] === current_key) {
                    count++;
                    if (count >= 3) return true;
                }
            }
            return false;
        },
        insufficient_material: function() {
            var s = currentState;
            if ((s.gameMode === 'placement' || s.gameMode === 'crazyhouse' || s.gameMode === 'bughouse')) {
                if (s.pocket_w > 0 || s.pocket_b > 0) return false; 
            }

            var num_pieces = 0, num_knights = 0, num_bishops = 0, sum_bishop_colors = 0;

            for (var i = 0; i < 64; i++) {
                var val = get_piece_at(s, i);
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
            
            if (s.gameMode === '3check' || s.gameMode === 'antichess' || s.gameMode === 'atomic') return false;
            if (s.gameMode === 'chaturanga') {
                if (num_pieces === 2) return true; 
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
            let wkL = currentState.bb_lo[WHITE * 6 + KING], wkH = currentState.bb_hi[WHITE * 6 + KING];
            let bkL = currentState.bb_lo[BLACK * 6 + KING], bkH = currentState.bb_hi[BLACK * 6 + KING];
            if ((wkL || wkH) && (bkL || bkH)) {
                let wk = ctz(wkL, wkH), bk = ctz(bkL, bkH);
                if (wk >= 56 && bk >= 56) return true;
            }
        }
        if (currentState.half_moves >= 100) return true;
        if (this.in_threefold_repetition()) return true;
        if (this.insufficient_material()) return true;
        return this.in_stalemate();
        },
        game_over: function() { 
        if (check_variant_win(currentState) !== null) return true;
        if (!has_legal_moves(currentState)) return true;
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
                if (get_piece_at(s, i) === (WHITE << 3 | KING)) wK++;
                if (get_piece_at(s, i) === (BLACK << 3 | KING)) bK++;
            }
            
            if (currentState.gameMode === 'atomic' || currentState.gameMode === 'antichess') {
                if (wK > 1) return { valid: false, error: 'White cannot have more than one King.' };
                if (bK > 1) return { valid: false, error: 'Black cannot have more than one King.' };
            } else if (currentState.gameMode === 'horde') {
                if (wK !== 0) return { valid: false, error: 'White cannot have a King in Horde.' };
                if (bK !== 1) return { valid: false, error: 'Black must have exactly one King.' };
            } else if (currentState.gameMode === 'placement') {
                if (wK > 1) return { valid: false, error: 'White cannot have more than one King.' };
                if (bK > 1) return { valid: false, error: 'Black cannot have more than one King.' };
            } else {
                if (wK !== 1) return { valid: false, error: 'White must have exactly one King.' };
                if (bK !== 1) return { valid: false, error: 'Black must have exactly one King.' };
            }

            if (currentState.gameMode === 'horde') {
                for (let i = 0; i < 8; i++) {
                    const p1 = get_piece_at(s, i), p8 = get_piece_at(s, 56 + i);
                    if (p8 !== -1 && (p8 & 7) === PAWN) return { valid: false, error: 'Pawns cannot be on the 8th rank.' };
                    if (p1 !== -1 && (p1 & 7) === PAWN && (p1 >> 3) === BLACK) return { valid: false, error: 'Black pawns cannot be on the 1st rank.' };
                }
            } else {
                for (let i = 0; i < 8; i++) {
                    const p1 = get_piece_at(s, i), p8 = get_piece_at(s, 56 + i);
                    if ((p1 !== -1 && (p1 & 7) === PAWN) || (p8 !== -1 && (p8 & 7) === PAWN)) {
                        return { valid: false, error: 'Pawns cannot be on the 1st or 8th rank.' };
                    }
                }
            }
            const us = s.turn, them = us ^ 1;
            
            if (currentState.gameMode !== 'racingkings' && is_checked(s, them)) {
                const sideName = (them === WHITE) ? 'White' : 'Black';
                return { valid: false, error: `Illegal Position: ${sideName} is in check, but it is not their turn.` };
            }
            return { valid: true, error: 'No errors.' };
        },
        pocket: function() {
            if (currentState.pocket_w === 0 && currentState.pocket_b === 0) return EMPTY_POCKET;

            let wArr = [], bArr = [];
            for (let p = 0; p <= 4; p++) {
                let wC = (currentState.pocket_w >> (p * 5)) & 31;
                let bC = (currentState.pocket_b >> (p * 5)) & 31;
                for (let i = 0; i < wC; i++) wArr.push(p);
                for (let i = 0; i < bC; i++) bArr.push(p);
            }
            return { w: wArr, b: bArr }; 
        },
        checks: function() { 
            return { w: currentState.checks_w || 0, b: currentState.checks_b || 0 }; 
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
            if (currentState.active_spells) {
                if (currentState.active_spells.w_jump_timer > 0) return currentState.active_spells.w_jump_sq;
                if (currentState.active_spells.b_jump_timer > 0) return currentState.active_spells.b_jump_sq;
            }
            return -1; 
        },
        spell_uses: function() {
            return currentState.spell_uses 
                ? { w: { ...currentState.spell_uses.w }, b: { ...currentState.spell_uses.b } } 
                : { w: { freeze: 5, jump: 2 }, b: { freeze: 5, jump: 2 } };
        },
    };
}