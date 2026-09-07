# ♟️ Ultimate Offline Chess Server (Privacy-First)
<img width="1920" height="878" alt="image" src="https://github.com/user-attachments/assets/958f6e92-610a-40fd-9c73-7e0b227a82da" />

**Your complete, 100% local chess environment.** This server runs entirely on your own machine, ensuring absolute privacy and zero reliance on external web servers. Whether you want to battle the cutting-edge **Stockfish 19** engine in Standard and Chess960, use **Fairy-Stockfish** for crazy variants, use AI to scan physical chessboards from images, or analyze games using standard Lichess and Chess.com formats—everything happens completely offline.

🚀 **STATUS: ACTIVE DEVELOPMENT** *(Expect updates and new features soon!)*

---

## 🛠️ How to Run This Locally

To keep this code repository lightning-fast to download, the massive puzzle databases and engine binaries are hosted separately. Follow these steps to get your server running:

### DOWNLOAD THE FULL PROJECT AT HERE [LATEST]
🔗 **[Download Here](https://github.com/NguyenVietDat2108/Chess-offline-for-private/releases)**

### Start the Server!
Fire up your local environment Powershell by run the serverChess.ps1 file by Powershell and you're ready to play.

---

## 🆕 Update Log
* **Variants Supported:** Full support for Chess960, 3-Check, Antichess, Atomic, Bughouse, Chaturanga, Crazyhouse, Duck, Horde, King of the Hill, Racing Kings, Alice, and Spell Chess (Chess.com).
* **Fairy-Stockfish:** Integrated directly for deep variant analysis.
* **PV Loading:** Support for loading the engine's Principal Variations (PV) in engine matches and Lichess analysis.
* **Opening Trainer:** Open Beta release for the new interactive opening trainer.
* **Graph View:** Release for full view of studies and variations.

## Licenses & Third-Party Attributions

This project is open-source and licensed under the **GNU General Public License v3.0** (GPL-3.0). Any derivative work or modified version of this software must also be open-sourced under the same license.

### Third-Party Libraries Used:

- **chess.js** (Custom Variant Version)
  - *License:* BSD 2-Clause License
  - *Copyright:* (c) Jeff Hlywa
  - *Note:* Core chess logic modified to support custom variants while inherits the legacy structure (Spell Chess, Duck Chess, Alice Chess, etc.).

- **Chart.js v4.5.1** (`Chart.js`)
  - *License:* MIT License
  - *Copyright:* (c) 2025 Chart.js Contributors
  - *Purpose:* Used for rendering statistics and evaluation graphs.

- **gif.js & gif.worker.js** (`gif.js`, `gif.worker.js`)
  - *License:* MIT License
  - *Copyright:* (c) Johan Nordberg
  - *Purpose:* Used for compiling and exporting match animations into shareable GIF files.

- **PDF.js v2.16.105** (`pdf.js`, `pdf.worker.js`)
  - *License:* Apache License 2.0
  - *Copyright:* (c) 2022 Mozilla Foundation
  - *Purpose:* Used for loading and parsing PDF chess lessons/books directly into the UI.

