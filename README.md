# ♟️ Ultimate Offline Chess Server (Privacy-First)
<img width="1920" height="878" alt="image" src="https://github.com/user-attachments/assets/958f6e92-610a-40fd-9c73-7e0b227a82da" />
<img width="941" height="812" alt="image" src="https://github.com/user-attachments/assets/b6cad36f-c4aa-4a29-a3d5-60ab64ddf58d" />
A self-hosted chess server that runs entirely offline on your machine with zero external web dependencies. 

This project includes a custom JavaScript variant engine (12,000+ nodes tree parser), Stockfish/Fairy-Stockfish integration, a local chessboard scanner from images, and an analysis tool for standard Lichess and Chess.com formats.

🚀 **STATUS: ACTIVE DEVELOPMENT**

---

## 🛠️ Installation & Local Setup

To minimize repository clone size, the massive Lichess puzzle databases and pre-compiled engine binaries are hosted separately in the releases.

### DOWNLOAD THE FULL PROJECT AT HERE [LATEST]
🔗 **[Download Here](https://github.com/NguyenVietDat2108/Chess-offline-for-private/releases)**

### 2. Run Locally
1. Extract the downloaded Lichess puzzles database (`.db`) and put it in the root folder.
2. Open PowerShell and run the startup script:
   ```powershell
   ./serverChess.ps1
   ```
3. Open your browser to access the local frontend interface.

---

## 🆕 Feature Log

* **14+ Chess Variants:** Move generation and rule enforcement for `classical`, `chess960`, `3check`, `antichess`, `atomic`, `bughouse`, `chaturanga`, `crazyhouse`, `duck`, `horde`, `kingofthehill`, `racingkings`, `placement`, `alice`, and `spell` (Chess.com format).
* **Fairy-Stockfish:** Integrated directly to calculate multi-variant evaluations.
* **PV Line Loading:** Displays the engine's Principal Variations (PV) during matches and analysis.
* **Custom Variant JS Engine (100x Faster):** Chess logic rewritten using flat bitboards (`Int32Array`) and strict object-pooling to eliminate Garbage Collection (GC) pauses during tree searches.
* **Opening Trainer:** Interactive opening repertoire builder (Open Beta).
* **Graph View:** Displays the move tree for studies and transpositions.

---

## 📄 Licenses & Third-Party Attributions

This project is licensed under the **GNU General Public License v3.0** (GPL-3.0). Any modifications or derivative works must be open-sourced under the same license.

### Third-Party Ecosystem:

* **chess.js (Custom Variant Edition)**
  * *License:* BSD 2-Clause License | *Copyright:* (c) Jeff Hlywa
  * *Modifications:* Refactored by Ngvida2108 using flat bitboards to handle custom rules (frozen squares, portal jumps, pocket counts) while keeping the original API structure.
* **Chart.js v4.5.1**
  * *License:* MIT License | *Copyright:* (c) 2025 Chart.js Contributors
  * *Purpose:* Renders evaluation graphs and match statistics.
* **gif.js & gif.worker.js**
  * *License:* MIT License | *Copyright:* (c) Johan Nordberg
  * *Purpose:* Compiles and exports match history into shareable GIF files.
* **PDF.js v2.16.105**
  * *License:* Apache License 2.0 | *Copyright:* (c) 2022 Mozilla Foundation
  * *Purpose:* Parses PDF chess books directly into the interactive study board.
