# Chess-offline-for-private API Documentation

Technical API reference for `chess_optimized.js` and companion modules within the `Chess-offline-for-private` engine.

---

## 1. Core Lifecycle & Standard Methods (`chess_optimized.js`)

### `new Chess([fen])`
Creates a new game instance with standard rules or from an initial state.

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `fen` | `string` | No | Custom FEN string. Defaults to standard initial position. |

```javascript
const chess = new Chess();
const customChess = new Chess("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
```

---

### `chess.move(move, [options])`
Validates and executes a move on the virtual board.

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `move` | `string` \| `object` | Yes | SAN string (e.g., `'e4'`, `'Nf3'`) or move descriptor object. |
| `move.from` | `string` | Conditional | Source square coordinate (e.g., `'e2'`). |
| `move.to` | `string` | Conditional | Destination square coordinate (e.g., `'e4'`). |
| `move.promotion` | `string` | Optional | Target promotion piece: `'q'`, `'r'`, `'b'`, `'n'`. |
| `move.drop` | `string` | Optional | Piece type for reserve drop moves (Crazyhouse/Bughouse). |
| `move.duck` | `string` | Optional | Target square coordinate for duck placement (Duck Chess). |

* **Returns:** `object` (move descriptor) on success, `null` if illegal.

```javascript
// SAN format
chess.move('e4');

// Standard Coordinate Object
chess.move({ from: 'e2', to: 'e4' });

// Pawn Promotion
chess.move({ from: 'e7', to: 'e8', promotion: 'q' });

// Crazyhouse Drop Move
chess.move({ drop: 'N', to: 'e4' });

// Duck Chess Placement
chess.move({ from: 'e2', to: 'e4', duck: 'd5' });
```

---

### `chess.moves([options])`
Returns all legally valid moves for the active side.

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `options.verbose` | `boolean` | `false` | If `true`, returns array of move objects; if `false`, returns SAN strings. |
| `options.square` | `string` | `null` | Filter moves originated from a specific square coordinate. |

* **Returns:** `string[]` or `object[]`.

```javascript
chess.moves(); // ['a3', 'a4', 'Nf3', ...]
chess.moves({ verbose: true }); // [{ from: 'e2', to: 'e4', color: 'w', piece: 'p', flags: 'b', san: 'e4' }, ...]
```

---

### `chess.load(fen, [gameMode])`
Parses and loads a position from a FEN string with variant token compatibility.

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `fen` | `string` | Yes | Target FEN string to load. |
| `gameMode` | `string` | Optional | Target variant parser context (e.g., `'duck'`, `'alice'`). |

* **Returns:** `boolean` (`true` if loaded successfully; `false` if invalid FEN).

---

### State Inspection & Navigation Utilities

| Method | Return Type | Description |
| :--- | :--- | :--- |
| `chess.fen()` | `string` | Serializes current board, pockets, check states, and tokens to FEN. |
| `chess.reset()` | `void` | Reinitializes board back to standard starting position. |
| `chess.turn()` | `'w' \| 'b'` | Active color turn. |
| `chess.undo()` | `object \| null` | Rolls back the last executed half-move. |
| `chess.game_over()`| `boolean` | Evaluates checkmate, stalemate, draw rule, or variant triggers. |
| `chess.in_check()` | `boolean` | Checks if current king is under attack. |
| `chess.in_checkmate()` | `boolean` | Checks if active player has no legal escapes from check. |
| `chess.in_stalemate()` | `boolean` | Checks if active player has no legal moves while not in check. |
| `chess.in_draw()` | `boolean` | Checks 50-move, 3-fold repetition, or insufficient material draws. |
| `chess.get(square)` | `object \| null` | Retrieves piece at coordinate (e.g., `{ type: 'p', color: 'b' }`). |
| `chess.put(piece, square)` | `boolean` | Direct piece injection to coordinate. |

---

## 2. Variant Extensions API

Specialized accessors for non-standard chess mechanics.

| Method | Target Variant | Return Type | Description |
| :--- | :--- | :--- | :--- |
| `chess.pocket()` | Crazyhouse, Bughouse | `{ w: number[], b: number[] }` | Array of captured piece IDs available for drop. |
| `chess.checks()` | 3-Check | `{ w: number, b: number }` | Current count of cumulative checks delivered. |
| `chess.alice_b()` | Alice Chess | `Array \| Uint8Array` | Piece array / bitboard representing Board B. |
| `chess.duck_sq()` | Duck Chess | `number` | Index (`0`-`63`) of the square blocked by the duck; `-1` if none. |
| `chess.promoted()` | Crazyhouse | `number[] \| Uint32Array` | Indices of promoted pawns to prevent invalid reserve drops. |

---

## 3. Spell Chess Subsystem

Runtime state and cooldown tracking for spell-casting modes.

| Method | Return Type | Description |
| :--- | :--- | :--- |
| `chess.mana()` | `{ w: object, b: object }` | Available energy points per spell type per player. |
| `chess.frozen()` | `number \| null` | Index of square currently immobilized by a freeze spell. |
| `chess.jump_sq()` | `number \| null` | Coordinate index with an active jump effect. |
| `chess.spell_uses()`| `{ w: object, b: object }` | Remaining cast allocations per spell type across players. |

---

## 4. Companion Architecture Modules

| Module File | Architectural Role | Core Responsibilities |
| :--- | :--- | :--- |
| `ChessGame.js` | Game Orchestration | Wraps `chess_optimized.js`, tracks `history[]`, handles promotion overlays, and coordinates network/engine sync. |
| `main.js` / `UI.js` | Presentation Layer | DOM bindings, board resizing, drag-and-drop piece movement, and evaluation bar updates. |
| `engine/` & Workers | Background Computing | Web Worker abstraction running Stockfish/variant engines without locking the browser UI thread. |
| `MoveNode.js` | Tree Node Model | Hierarchical variation node tracking FEN snapshots, move SAN, annotations, and NAG glyphs. |
