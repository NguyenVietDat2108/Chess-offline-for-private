# ♟️ Ultimate Offline Chess Server (Privacy-First)
<img width="1920" height="878" alt="image" src="https://github.com/user-attachments/assets/958f6e92-610a-40fd-9c73-7e0b227a82da" />
<img width="941" height="812" alt="image" src="https://github.com/user-attachments/assets/b6cad36f-c4aa-4a29-a3d5-60ab64ddf58d" />

A 100% local, self-hosted chess ecosystem designed to run entirely on your own machine with zero external web dependencies. 

This repository consolidates a customized, high-performance variant engine (supporting deep PV lines up to 12,000+ nodes), local Stockfish/Fairy-Stockfish integration, an AI-powered physical chessboard scanner, and a comprehensive analysis suite mapping standard Lichess and Chess.com formats completely offline.

🚀 **STATUS: ACTIVE DEVELOPMENT**

---

## 🛠️ Installation & Local Setup

To minimize repository clone size, the massive Lichess puzzle databases and pre-compiled engine binaries are hosted separately in the releases.

### DOWNLOAD THE FULL PROJECT AT HERE [LATEST]
🔗 **[Download Here](https://github.com/NguyenVietDat2108/Chess-offline-for-private/releases)**

### 2. Infrastructure Setup
1. Extract the downloaded Lichess puzzles database (`.db`) and place it directly into the root folder.
2. Open PowerShell, navigate to the directory, and execute the startup script:
   ```powershell
   ./serverChess.ps1
   ```
3. The server will initialize locally and spin up the frontend interface in your browser.

---

## 🆕 Core Architecture & Feature Log

* **14+ Chess Variants Supported:** Out-of-the-box move generation and rule enforcement for `classical`, `chess960`, `3check`, `antichess`, `atomic`, `bughouse`, `chaturanga`, `crazyhouse`, `duck`, `horde`, `kingofthehill`, `racingkings`, `placement`, `alice`, and `spell` (Chess.com format).
* **Fairy-Stockfish Integration:** Native multi-thread multi-variant engine support alice and spell chess for evaluation.
* **PV Line Loading:** Native rendering of Principal Variations (PV) during active engine matches and Lichess-format analysis.
* **Custom Variant JS Engine (100x Performance):** Core chess logic rewritten via typed bitboards (`Int32Array`) and strict object-pooling to completely eliminate Garbage Collection (GC) pauses during intensive tree searches.
* **Opening Trainer:** Open Beta release of the interactive opening repertoire builder.
* **Graph View Visualization:** Multi-branch graph mapping for studies, transpositions, and variant theory.

---

## 📄 Licenses & Third-Party Attributions

This project is open-source and licensed under the **GNU General Public License v3.0** (GPL-3.0). Any derivative work or modified version of this software must also be open-sourced under the same license.

### Third-Party Ecosystem:

* **chess.js (Custom Variant Edition)**
  * *License:* BSD 2-Clause License | *Copyright:* (c) Jeff Hlywa
  * *Modifications:* Move generation and internal bitboards fundamentally refactored by Ngvida2108 to handle custom physics (frozen squares, portal jumps, pocket counts) while preserving structural legacy schemas.
* **Chart.js v4.5.1**
  * *License:* MIT License | *Copyright:* (c) 2025 Chart.js Contributors
  * *Purpose:* Real-time evaluation graphs and match metrics visualization.
* **gif.js & gif.worker.js**
  * *License:* MIT License | *Copyright:* (c) Johan Nordberg
  * *Purpose:* Client-side rendering and exporting of match historical loops into shareable GIF animations.
* **PDF.js v2.16.105**
  * *License:* Apache License 2.0 | *Copyright:* (c) 2022 Mozilla Foundation
  * *Purpose:* Parsing and injecting PDF chess books/lessons directly into the interactive study board.