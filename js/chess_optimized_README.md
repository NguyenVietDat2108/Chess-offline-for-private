# chess.js (Variant Edition)

chess.js is a customized TypeScript/JavaScript chess library used for chess move generation/validation, piece placement/movement, and check/checkmate/stalemate detection.

This extended version supports **multiple chess variants** including:
`classical`, `chess960`, `3check`, `antichess`, `atomic`, `bughouse`, `chaturanga`, `crazyhouse`, `duck`, `horde`, `kingofthehill`, `racingkings`, `placement`, `alice`, and `spell`.

## API

### Constants
The following constants are exported from the top-level module:
```js
export const WHITE = 'w'
export const BLACK = 'b'
```

### Constructor: Chess([ fen, gameMode ])

The `Chess()` constructor creates a new chess object. It defaults to the initial board position of the specified variant. It accepts two optional parameters: a FEN string and a game mode string.

```js
import { Chess } from 'chess.js'

// an empty constructor defaults the starting position in classical mode
let chess = new Chess()

// pass in a FEN string and variant mode to load a particular position
let chessVariant = new Chess('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'crazyhouse')
```

### .setGameMode(mode)

Sets the current game mode (variant) for the game and updates all historical states to match this mode.

```js
const chess = new Chess();
chess.setGameMode('duck');
```

### .gameMode()

Returns the current game mode.

```js
const chess = new Chess(null, 'atomic');
chess.gameMode();
// -> 'atomic'
```

### .load(fen)

Clears the board and loads the provided FEN string. Returns `true` if the position was successfully loaded, otherwise `false`.

```js
const chess = new Chess();
chess.load('4r3/8/2p2PPk/1p6/pP2p1R1/P1B5/2P2K2/3r4 w - - 1 45');
// -> true

chess.load('invalid fen');
// -> false
```

### .reset()

Resets the board to the initial starting position of the current game mode.

```js
const chess = new Chess();
chess.move('e4');
chess.reset();
chess.fen();
// -> 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
```

### .load_pgn(pgn)

Load the moves of a game stored in Portable Game Notation (PGN). Returns `true` if the PGN was parsed successfully, otherwise `false`. It natively understands variant notations like drops (`@`) and spell casts (`Fz@e4`).

```js
const chess = new Chess(null, 'crazyhouse');
const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d4 exd4 5. Ng5 Nh6 6. Nxf7 Nxf7 7. Bxf7+ Kxf7 8. N@h5+';
chess.load_pgn(pgn);
// -> true

chess.load_pgn('invalid pgn');
// -> false
```

### .draft_spell(spellType, targetSq)

*(Spell Chess Variant Only)* Drafts a spell (e.g., `'freeze'` or `'jump'`) on a target square without permanently committing it, allowing the UI to preview or await the piece move. Returns a pseudo-move object.

```js
const chess = new Chess(null, 'spell');
chess.draft_spell('freeze', 'e4');
// -> { isStandaloneSpell: true, san: 'Fz@e4' }
```

### .cancel_draft()

*(Spell Chess Variant Only)* Cancels a drafted spell and reverts the board to its pre-draft state. Returns `true` if a draft was cancelled, `false` otherwise.

```js
const chess = new Chess(null, 'spell');
chess.draft_spell('freeze', 'e4');
chess.cancel_draft();
// -> true
```

### .moves([ options ])

Returns a list of legal moves from the current position. Options is an optional parameter which may contain `verbose: true` to return verbose move objects, and/or a `square` (or `from`) string to only return moves from a specific square.

```js
const chess = new Chess();
chess.moves();
// -> ['a3', 'a4', 'b3', 'b4', 'c3', 'c4', 'd3', 'd4', 'e3', 'e4',
//     'f3', 'f4', 'g3', 'g4', 'h3', 'h4', 'Na3', 'Nc3', 'Nf3', 'Nh3']

chess.moves({ square: 'e2' });
// -> ['e3', 'e4']

chess.moves({ verbose: true });
// -> [{ color: 'w', from: 'a2', to: 'a3',
//       flags: 'n', piece: 'p', san: 'a3'
//     }, ...]
```

### .move(move)

Makes a move on the board and returns a move object if the move was legal. The move argument can be either a string in Standard Algebraic Notation (SAN) or a move object. Returns `null` if the move is illegal.

```js
const chess = new Chess();

// Standard Algebraic Notation
chess.move('e4');
// -> { color: 'w', from: 'e2', to: 'e4', flags: 'b', piece: 'p', san: 'e4', uci: 'e2e4' }

// Object notation
chess.move({ from: 'g8', to: 'f6' });
// -> { color: 'b', from: 'g8', to: 'f6', flags: 'n', piece: 'n', san: 'Nf6', uci: 'g8f6' }

// Drops in Crazyhouse
const zh = new Chess(null, 'crazyhouse');
zh.load_pgn('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d4 exd4 5. Ng5 Nh6 6. Nxf7 Nxf7 7. Bxf7+ Kxf7');
zh.move('N@h5'); 
// -> { color: 'w', from: '@', to: 'h5', flags: 'd', piece: 'N', drop: 'N', san: 'N@h5', uci: 'N@h5' }

// Spell casts in Spell Chess
const spellChess = new Chess(null, 'spell');
spellChess.move('Fz@e4_e2e4'); // Freeze e4, then move e2 to e4
// -> { color: 'w', from: 'e2', to: 'e4', flags: 'b', piece: 'p', san: 'Fz@e4 e4', isSpell: true, spellType: 'freeze', target: 'e4', uci: 'e2e4' }

// Illegal move
chess.move('e5');
// -> null
```

### .undo()

Takeback the last half-move, returning a move object if successful, otherwise `null`.

```js
const chess = new Chess();

chess.move('e4');
chess.fen();
// -> 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

chess.undo();
// -> { board: [...], bb_lo: [...], ... } (Internal state object)

chess.fen();
// -> 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
```

### .get(square)

Returns the piece on the square. Returns `null` if the square is empty or invalid.

```js
const chess = new Chess();
chess.get('e2');
// -> { type: 'p', color: 'w' }

chess.get('e4');
// -> null
```

### .fen()

Returns the FEN string for the current position, including variant-specific extensions (like pockets for crazyhouse, frozen squares for spell chess).

```js
const chess = new Chess();
chess.move('e4');
chess.fen();
// -> 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

const zh = new Chess(null, 'crazyhouse');
zh.load_pgn('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d4 exd4 5. Ng5 Nh6 6. Nxf7 Nxf7 7. Bxf7+ Kxf7');
zh.fen();
// -> 'r1bq1b1r/pppp1kpp/2n4n/4p3/2B1P3/8/PPPP1PPP/RNBQK2R [PN] w - - 0 8'
```

### .board()

Returns a flat, 1D Int8Array of length 64 representing the board state. Values correspond to internal piece representations. Use `.get(sq)` for user-friendly object outputs.

```js
const chess = new Chess();
chess.board();
// -> Int8Array(64) [ ... ]
```

### .turn()

Returns the current side to move (`'w'` or `'b'`).

```js
const chess = new Chess();
chess.turn();
// -> 'w'
```

### .variant_winner()

Returns `'w'` if White has won by variant-specific rules (e.g., reaching the 8th rank in Racing Kings, checking 3 times in 3-Check, losing all pieces in Antichess). Returns `'b'` for Black, or `null` if the game is not won by a variant rule.

```js
const rk = new Chess('8/8/8/8/8/8/8/K6k w - - 0 1', 'racingkings');
rk.move('Ka8');
rk.variant_winner();
// -> 'w'
```

### .get_duck_sq()

*(Duck Chess Variant Only)* Returns the index of the square currently occupied by the duck, or `-1` if not placed.

```js
const chess = new Chess(null, 'duck');
chess.get_duck_sq();
// -> -1
```

### .in_check()

Returns `true` if the side to move is in check. (Variant-aware: always `false` in Antichess or Racing Kings).

```js
const chess = new Chess('rnb1kbnr/pppp1ppp/8/4p3/5PPq/8/PPPPP2P/RNBQKBNR w KQkq - 1 3');
chess.in_check();
// -> true
```

### .in_checkmate()

Returns `true` if the side to move has been checkmated (or lost due to variant rules).

```js
const chess = new Chess('rnb1kbnr/pppp1ppp/8/4p3/5PPq/8/PPPPP2P/RNBQKBNR w KQkq - 1 3');
chess.in_checkmate();
// -> true
```

### .in_stalemate()

Returns `true` if the side to move has been stalemated.

```js
const chess = new Chess('4k3/4P3/4K3/8/8/8/8/8 b - - 0 78');
chess.in_stalemate();
// -> true
```

### .in_threefold_repetition()

Returns `true` if the current board position has occurred three or more times.

```js
const chess = new Chess();
chess.move('Nf3'); chess.move('Nf6'); chess.move('Ng1'); chess.move('Ng8');
chess.move('Nf3'); chess.move('Nf6'); chess.move('Ng1'); chess.move('Ng8');
chess.isThreefoldRepetition();
// -> true
```

### .insufficient_material()

Returns `true` if the game is drawn due to insufficient material (K vs. K, K vs. KB, K vs. KN, etc.). Variant-aware (e.g., never true in crazyhouse).

```js
const chess = new Chess('k7/8/n7/8/8/8/8/7K b - - 0 1');
chess.insufficient_material();
// -> true
```

### .in_draw()

Returns `true` if the game is drawn (50-move rule, insufficient material, threefold repetition, or stalemate).

```js
const chess = new Chess('4k3/4P3/4K3/8/8/8/8/8 b - - 0 78');
chess.in_draw();
// -> true
```

### .game_over()

Returns `true` if the game has ended via checkmate, stalemate, draw, threefold repetition, insufficient material, or a variant-specific win condition.

```js
const chess = new Chess();
chess.game_over();
// -> false
```

### .validate_fen(fen)

Returns a validation object specifying validity or the errors found within the FEN string.

```js
const chess = new Chess();
chess.validate_fen('2n1r3/p1k2pp1/B1p3b1/P7/5bP1/2N1B3/1P2KP2/2R5 b - - 4 25');
// -> { valid: true, error: 'No errors.' }

chess.validate_fen('4r3/8/X12XPk/1p6/pP2p1R1/P1B5/2P2K2/3r4 w - - 1 45');
// -> { valid: false, error: 'Invalid piece placement syntax.' }
```

### .pocket()

*(Crazyhouse / Bughouse / Placement Only)* Returns an object containing the captured pieces available to drop for each side.

```js
const zh = new Chess(null, 'crazyhouse');
zh.load_pgn('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d4 exd4');
zh.pocket();
// -> { w: [0], b: [0] } // Each side has 1 pawn (0 = PAWN)
```

### .checks()

*(3-Check Variant Only)* Returns an object containing the number of times each side has checked their opponent.

```js
const check3 = new Chess(null, '3check');
check3.load_pgn('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. Bxf7+');
check3.checks();
// -> { w: 1, b: 0 }
```

### .alice_b()

*(Alice Chess Variant Only)* Returns a bitboard representation of the pieces currently located on Board B.

```js
const alice = new Chess(null, 'alice');
alice.alice_b();
// -> { lo: 0, hi: 0 }
```

### .promoted()

*(Crazyhouse Only)* Returns a bitboard representation tracking which pieces on the board are promoted pawns (so they drop as pawns when captured).

```js
const zh = new Chess(null, 'crazyhouse');
zh.promoted();
// -> { lo: 0, hi: 0 }
```

### .frozen()

*(Spell Chess Variant Only)* Returns a bitboard representation of the squares currently frozen.

```js
const spell = new Chess(null, 'spell');
spell.frozen();
// -> { lo: 0, hi: 0 }
```

### .mana()

*(Spell Chess Variant Only)* Returns an object detailing the current mana (cooldowns) for each player's spells.

```js
const spell = new Chess(null, 'spell');
spell.mana();
// -> { w: { freeze: 3, jump: 3 }, b: { freeze: 3, jump: 3 } }
```

### .jump_sq()

*(Spell Chess Variant Only)* Returns the index of the square currently acting as a portal (from a jump spell), or `-1`.

```js
const spell = new Chess(null, 'spell');
spell.jump_sq();
// -> -1
```

### .spell_uses()

*(Spell Chess Variant Only)* Returns an object detailing the remaining uses available for each spell type.

```js
const spell = new Chess(null, 'spell');
spell.spell_uses();
// -> { w: { freeze: 5, jump: 2 }, b: { freeze: 5, jump: 2 } }
```
