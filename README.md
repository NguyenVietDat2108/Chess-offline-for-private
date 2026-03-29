# ♟️ Ultimate Offline Chess Server (Privacy-First)

**Your complete, 100% local chess environment.** This server runs entirely on your own machine, ensuring absolute privacy and zero reliance on external web servers. Whether you want to battle the cutting-edge **Stockfish 18** engine, use AI to scan physical chessboards from images, or analyze games using standard Lichess and Chess.com formats—everything happens completely offline.

🚀 **STATUS: ACTIVE DEVELOPMENT** *(Expect updates and new features soon!)*

---

## 🛠️ How to Run This Locally

To keep this code repository lightning-fast to download, the massive puzzle databases and engine binaries are hosted separately. Follow these steps to get your server running:

### 1. Download the Source Code
Clone or download this repository to your machine. 
*(Note: You do not need the `lila` master files here, everything you need is already packaged).*

### 2. Download the Core Assets (Heavy Files)
Head over to the Releases page to grab the offline puzzle database and the Stockfish 18 WebAssembly engine:

🔗 **[Download the Core Assets Here](https://github.com/NguyenVietDat2108/Chess-offline-for-private/releases)**
* 📥 `lichess_db_puzzle.csv` *(The massive offline lichess puzzle DB or you can download directly at https://database.lichess.org/#puzzles)* 
* 📥 `stockfish-18.wasm` *(The Stockfish 18 engine)*

### 3. Place the Files
Move the files you just downloaded into their exact required locations inside the project:
* Drop `lichess_db_puzzle.csv` directly into the **root folder**.
* Drop `stockfish-18.wasm` into the **`engine/stockfish 18/`** folder.

### 4. Start the Server!
Fire up your local environment and you're ready to play.

### 5. Update log:
-Support variants: chess960, 3check, antichess , atomic  ,bughouse , chaturanga , crazyhouse , duck , horde , kingofthehill , racingkings             
-Support fairy-stockfish for variants
-Support loading engine's pv in engine matches and lichess analysis
