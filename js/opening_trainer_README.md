# OpeningTrainer API

[![API](https://img.shields.io/badge/API-Trainer-blue)](#)

The `OpeningTrainer` module manages the opening training mode. It tracks the PGN variation tree, evaluates player moves, applies Spaced Repetition (SRS) to mistakes, and automatically responds with opponent moves.

## API Documentation

### Constructor: OpeningTrainer(app)
**Description:** Initializes the `OpeningTrainer` instance, binding it to the main application object. Automatically injects CSS rules (`container-type`) into the DOM to support mini-board rendering and binds control button events.

**Example (Success):**
```javascript
import { OpeningTrainer } from './OpeningTrainer.js';
const trainer = new OpeningTrainer(window.app);
// -> Result: Successfully initialized, `isActive` = false. CSS injected into <head> and button listeners attached.
```

**Example (Failure):**
```javascript
const trainer = new OpeningTrainer();
// -> Result: Runtime error because `this.app` is undefined, causing subsequent calls to `this.app.game` to crash the system.
```

### .startTraining()
**Description:** Starts the training session. The system sets the game's current Node as the root (training root), resets mistake counters, hides the analysis UI, counts total branches (leaves), and flips the board according to the user's chosen training color.

**Example (Success):**
```javascript
trainer.startTraining();
// -> Result: Sets `isActive = true`. Board flips to match `userColor`. Training sequence initiates and calculates the first move.
```

**Example (Failure):**
```javascript
// Called when no PGN/Study data is loaded into the game (currentNode has no children)
trainer.startTraining();
// -> Result: Returns early. Calls `app.ui.showNotification("Please load a PGN Study...")` as a warning. `isActive` remains false.
```

### .stopTraining()
**Description:** Ends the training session. Cancels automatic opponent timers (`opponentTimer`, `actionTimer`), unlocks the color/chapter `<select>` elements, and restores the standard UI.

**Example (Success):**
```javascript
trainer.stopTraining();
// -> Result: Sets `isActive = false`. Clears mini-boards. Resets status text to default and clears all timeouts.
```

### .handleUserMoveAttempt(sourceIdx, targetIdx)
**Description:** Intercepts drag-and-drop piece events from the UI. Compares the move against the active PGN branch. If correct, advances to the next branch, shows comments, and triggers the engine's turn. If incorrect, records an SRS mistake and asks to try again.

**Example (Success):**
```javascript
// Training as White, user drags piece from e2 (idx 52) to e4 (idx 36) following the lesson.
trainer.handleUserMoveAttempt(52, 36);
// -> Result: Returns `true`. Plays move sound, displays praise comment (if any), and sets a timer to call `playOpponentMove`.
```

**Example (Failure):**
```javascript
// Plays d4 (idx 35) instead of e4, which is not in the saved PGN branch.
trainer.handleUserMoveAttempt(52, 35);
// -> Result: Returns `true` (tells UI to cancel drag animation). Increments `mistakeCount`. Plays error sound, highlights correct piece with a red border via `_handleMistake()`.
```

### .playOpponentMove(replyNode)
**Description:** Automatically plays an opponent's response move (passed via `replyNode`) on the board. Then displays the move's comment and evaluates the next turn.

**Example (Success):**
```javascript
trainer.playOpponentMove(nextNode);
// -> Result: Automatically steps to the next node, renders NAGs (!/?), displays explanatory comments, and gives the turn back to the player by calling `renderState()`.
```

**Example (Failure):**
```javascript
// Passing an invalid or null node
trainer.playOpponentMove(null);
// -> Result: System crashes due to property access error on `replyNode.parent`. (A valid Node must always be passed).
```

### .renderState()
**Description:** The main loop of the Trainer. Evaluates the current Node's state: If solved, calls `backtrack()`. If it's the user's turn, shows a waiting prompt. If it's the opponent's turn, finds available moves. If multiple variations exist, renders mini-boards and uses an SRS algorithm to randomly pick a move weighted heavily toward the branches the user fails most often.

**Example (Success):**
```javascript
trainer.renderState();
// -> Result: Updates UI status text. If it's the opponent's turn with multiple variations, calls `renderMiniBoards()` and sets `opponentTimer` for 4 seconds to auto-play a high-weight branch.
```

### .renderMiniBoards(children)
**Description:** Creates cards containing tiny chessboards (mini-boards) displaying the opponent's available options. Allows the user to click directly on a mini-board to force the opponent down that specific branch instead of waiting for the random selection.

**Example (Success):**
```javascript
trainer.renderMiniBoards(node.children);
// -> Result: Injects HTML into `miniBoardsContainer`. Each card shows a FEN position, moveSan, NAG, and the SRS Fail count for that specific branch.
```

### .backtrack()
**Description:** Automatically rewinds (climbs back up the tree) until it finds a fork/Node that still has unsolved variations.

**Example (Success):**
```javascript
trainer.backtrack();
// -> Result: Jumps `app.game.goToNodeId()` to the nearest incomplete position, plays a 'notify' sound, and calls `renderState()`. If everything is completed, calls `_handleTrainingComplete()`.
```
