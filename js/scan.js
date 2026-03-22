export class BoardScanner {
    constructor() {
        this.model = null;
        this.isReady = false;
        this.YOLO_CLASSES = ['P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k', 'board'];
        this.currentPredictions = null; 
    }
    async init() {
        if (this.isReady) return;
        try {
            console.log("Loading YOLOv8 Model...");
            this.model = await tf.loadGraphModel('/yolo_model/model.json');
            
            const dummy = tf.tidy(() => tf.zeros([1, 640, 640, 3]));
            await this.model.executeAsync(dummy);
            dummy.dispose();
            
            this.isReady = true;
            console.log("✅ YOLOv8 Model Loaded and Warmed Up!");
        } catch (error) {
            console.error("Failed to load YOLO model:", error);
            if (window.ui) window.ui.showNotification("Error loading AI. Check console.", "Model Error", "❌");
        }
    }
    async handleUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        event.target.value = ''; // Reset input so you can re-upload the same file if needed

        if (window.ui) window.ui.showNotification("Initializing AI model...", "Scanning", "⏳");

        try {
            await this.init();
            
            // 1. If it's a PDF, pass it to your original PDF extraction function!
            if (file.type === 'application/pdf') {
                await this.extractImageFromPDF(file);
            } 
            // 2. If it's a standard image, process it directly
            else {
                const canvas = document.getElementById('scannerCanvas') || document.createElement('canvas');
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                const img = new Image();
                
                img.onload = () => {
                    // Shrink insanely massive 4K images to prevent browser RAM crashes
                    const MAX_DIM = 1600;
                    let w = img.width;
                    let h = img.height;
                    if (w > MAX_DIM || h > MAX_DIM) {
                        const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
                        w *= ratio;
                        h *= ratio;
                    }
                    canvas.width = w;
                    canvas.height = h;
                    ctx.drawImage(img, 0, 0, w, h);
                    
                    this.processCanvas(canvas);
                };
                img.src = URL.createObjectURL(file);
            }
        } catch (err) {
            console.error("Upload error:", err);
            if (window.ui) window.ui.showNotification("Failed to read file.", "Error", "❌");
        }
    }
    async extractImageFromPDF(file) {
        if (typeof pdfjsLib === 'undefined') {
            if (window.ui) window.ui.showNotification("PDF library not loaded.", "Error", "❌");
            return;
        }
        
        if (window.ui) window.ui.showNotification("Reading PDF...", "PDF Processor", "📄");
        
        pdfjsLib.GlobalWorkerOptions.workerSrc = './js/pdf.worker.min.js';
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        // If it's a 1-page PDF, just scan it instantly (No modal needed)
        if (pdf.numPages === 1) {
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 2.5 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width; 
            canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
            
            this.processCanvas(canvas);
            return;
        }

        // Multi-page PDF: Generate a UI Modal to let the user pick the page!
        const modal = document.createElement('div');
        modal.style.cssText = `position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.9); z-index:999999; display:flex; flex-direction:column; align-items:center; overflow-y:auto; padding:20px; box-sizing:border-box;`;
        
        modal.innerHTML = `
            <div style="width:100%; max-width:800px; display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h2 style="color:#fff; margin:0;">Select a PDF Page</h2>
                <button id="closePdfModal" style="background:#fa412d; color:#fff; border:none; padding:8px 15px; border-radius:5px; cursor:pointer; font-weight:bold;">Cancel</button>
            </div>
            <div id="pdfGrid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:20px; width:100%; max-width:1000px;"></div>
        `;
        document.body.appendChild(modal);

        // Cancel button removes the modal
        document.getElementById('closePdfModal').onclick = () => document.body.removeChild(modal);

        const grid = modal.querySelector('#pdfGrid');

        // Render low-res thumbnails for the user to pick from
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 0.8 }); 
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width; 
            canvas.height = viewport.height;
            canvas.style.cssText = `width:100%; border:2px solid #444; border-radius:5px; cursor:pointer; transition:0.2s; background:#fff;`;
            
            canvas.onmouseenter = () => canvas.style.border = "2px solid #38bdf8";
            canvas.onmouseleave = () => canvas.style.border = "2px solid #444";
            
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
            
            // When a user clicks a thumbnail, render a high-res version and send it to the AI!
            canvas.onclick = async () => {
                document.body.removeChild(modal);
                if (window.ui) window.ui.showNotification("Extracting high-res image...", "Processing", "⚙️");
                
                const hiResViewport = page.getViewport({ scale: 3.0 });
                const hiResCanvas = document.createElement('canvas');
                hiResCanvas.width = hiResViewport.width; 
                hiResCanvas.height = hiResViewport.height;
                await page.render({ canvasContext: hiResCanvas.getContext('2d'), viewport: hiResViewport }).promise;
                
                this.processCanvas(hiResCanvas);
            };
            
            grid.appendChild(canvas);
        }
    }
    async handlePDFUpload(file) {
        if (typeof pdfjsLib === 'undefined') {
            if (window.ui) window.ui.showNotification("PDF library not loaded.", "Error", "❌");
            return;
        }
        
        pdfjsLib.GlobalWorkerOptions.workerSrc = './js/pdf.worker.min.js';
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        // If it's a 1-page PDF, just scan it instantly
        if (pdf.numPages === 1) {
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 2.5 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width; 
            canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
            this.processCanvas(canvas);
            return;
        }

        // Multi-page PDF: Generate a UI Modal to pick the page!
        const modal = document.createElement('div');
        modal.style.cssText = `position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.9); z-index:999999; display:flex; flex-direction:column; align-items:center; overflow-y:auto; padding:20px; box-sizing:border-box;`;
        
        modal.innerHTML = `
            <div style="width:100%; max-width:800px; display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h2 style="color:#fff; margin:0;">Select a PDF Page</h2>
                <button id="closePdfModal" style="background:#fa412d; color:#fff; border:none; padding:8px 15px; border-radius:5px; cursor:pointer;">Cancel</button>
            </div>
            <div id="pdfGrid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:20px; width:100%; max-width:1000px;"></div>
        `;
        document.body.appendChild(modal);

        document.getElementById('closePdfModal').onclick = () => document.body.removeChild(modal);

        const grid = modal.querySelector('#pdfGrid');

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 0.8 }); // Thumbnail scale
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width; 
            canvas.height = viewport.height;
            canvas.style.cssText = `width:100%; border:2px solid #444; border-radius:5px; cursor:pointer; transition:0.2s; background:#fff;`;
            canvas.onmouseenter = () => canvas.style.border = "2px solid #38bdf8";
            canvas.onmouseleave = () => canvas.style.border = "2px solid #444";
            
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
            
            canvas.onclick = async () => {
                document.body.removeChild(modal);
                if (window.ui) window.ui.showNotification("Extracting high-res image...", "Processing", "⚙️");
                
                // Re-render the chosen page at high resolution for the AI
                const hiResViewport = page.getViewport({ scale: 3.0 });
                const hiResCanvas = document.createElement('canvas');
                hiResCanvas.width = hiResViewport.width; 
                hiResCanvas.height = hiResViewport.height;
                await page.render({ canvasContext: hiResCanvas.getContext('2d'), viewport: hiResViewport }).promise;
                this.processCanvas(hiResCanvas);
            };
            grid.appendChild(canvas);
        }
    }
    async processCanvas(canvas) {
        if (window.ui) window.ui.showNotification("AI analyzing image...", "Scanner", "🧠");
        
        const predictions = await this.detect(canvas);
        const boards = predictions.filter(p => p.classId === 12);

        if (boards.length === 0) {
            if (window.ui) window.ui.showNotification("No chessboards found.", "Scan Failed", "❌");
            return;
        }

        if (boards.length === 1) {
            const b = boards[0];
            const clickX_640 = b.x + (b.width / 2);
            const clickY_640 = b.y + (b.height / 2);
            
            const fen = this.processYoloPredictions(predictions, clickX_640, clickY_640, canvas.width, canvas.height);
            if (window.game) window.game.loadFEN(fen);
            if (window.ui) {
                window.ui.switchTab('editor');
                window.ui.showNotification("Board detected instantly!", "Success", "✅");
            }
        } else {
            // ==========================================================
            // 🔥 THE FIX: VISUALLY INJECT THE CANVAS INTO THE MODAL
            // ==========================================================
            this.currentPredictions = predictions;
            const modal = document.getElementById('scannerModal');
            if(modal) modal.style.display = 'flex';
            if (window.ui) window.ui.showNotification(`Found ${boards.length} boards. Click the one you want!`, "Multiple Boards", "🖱️");

            const ctx = canvas.getContext('2d');
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#629924'; 
            boards.forEach(b => {
                ctx.strokeRect(b.x, b.y, b.width, b.height);
                ctx.fillStyle = 'rgba(98, 153, 36, 0.2)';
                ctx.fillRect(b.x, b.y, b.width, b.height);
            });

            const newCanvas = canvas.cloneNode(true);
            const newCtx = newCanvas.getContext('2d', {willReadFrequently:true});
            newCtx.drawImage(canvas, 0, 0);

            // Style the canvas so it fits beautifully inside your popup
            newCanvas.style.maxWidth = '100%';
            newCanvas.style.maxHeight = '75vh';
            newCanvas.style.objectFit = 'contain';
            newCanvas.style.cursor = 'crosshair';
            newCanvas.style.borderRadius = '5px';
            newCanvas.style.marginTop = '15px';

            // Clean up any old canvases from previous scans
            const existingCanvas = modal.querySelector('canvas');
            if (existingCanvas) existingCanvas.remove();

            // Append the image directly into the modal!
            modal.appendChild(newCanvas);

            newCanvas.onclick = (e) => {
                const rect = newCanvas.getBoundingClientRect();
                const scaleX = newCanvas.width / rect.width;
                const scaleY = newCanvas.height / rect.height;
                const clickX = (e.clientX - rect.left) * scaleX;
                const clickY = (e.clientY - rect.top) * scaleY;

                const fen = this.processYoloPredictions(this.currentPredictions, clickX, clickY, newCanvas.width, newCanvas.height);
                if (fen && window.game) {
                    window.ui.switchTab('editor');
                    const fenBox = document.getElementById('fenInput');
                    if(fenBox) fenBox.value = fen;
                    window.game.loadFEN(fen);
                    window.ui.showNotification("Board scanned!", "Success", "✅");
                    if(modal) modal.style.display = 'none';
                }
            };
        }
    }
    closeScanner() {
        const modal = document.getElementById('scannerModal');
        if(modal) modal.style.display = 'none';
    }
    async detect(imgElement) {
        if (!this.isReady) await this.init();
        if (!this.model) return [];

        const imgW = imgElement.width || imgElement.naturalWidth;
        const imgH = imgElement.height || imgElement.naturalHeight;
        const maxDim = Math.max(imgW, imgH);
        
        const sqCanvas = document.createElement('canvas');
        sqCanvas.width = maxDim; 
        sqCanvas.height = maxDim;
        const sqCtx = sqCanvas.getContext('2d');
        sqCtx.fillStyle = '#000';
        sqCtx.fillRect(0, 0, maxDim, maxDim);
        
        const padX = (maxDim - imgW) / 2;
        const padY = (maxDim - imgH) / 2;
        sqCtx.drawImage(imgElement, padX, padY, imgW, imgH);

        const batched = tf.tidy(() => {
            const tfImg = tf.browser.fromPixels(sqCanvas);
            const resized = tf.image.resizeBilinear(tfImg, [640, 640]);
            return resized.div(255.0).expandDims(0);
        });

        const res = await this.model.executeAsync(batched);
        const data = await res.data();
        
        batched.dispose();
        res.dispose();

        const numClasses = 13;
        const numBoxes = 8400;
        
        // Split arrays to prevent the Board from suppressing the Pieces!
        let boardBoxes = [], boardScores = [];
        let pieceBoxes = [], pieceScores = [], pieceClasses = [];

        for (let i = 0; i < numBoxes; i++) {
            let maxScore = 0;
            let classId = -1;

            for (let c = 0; c < numClasses; c++) {
                const score = data[(4 + c) * numBoxes + i];
                if (score > maxScore) {
                    maxScore = score;
                    classId = c;
                }
            }

            const isBoard = (classId === 12); 
            const threshold = isBoard ? 0.35 : 0.50; 

            if (maxScore > threshold) {
                const xc = data[0 * numBoxes + i];
                const yc = data[1 * numBoxes + i];
                const w  = data[2 * numBoxes + i];
                const h  = data[3 * numBoxes + i];
                const x1 = xc - w / 2;
                const y1 = yc - h / 2;

                if (isBoard) {
                    boardBoxes.push([y1, x1, y1 + h, x1 + w]);
                    boardScores.push(maxScore);
                } else {
                    pieceBoxes.push([y1, x1, y1 + h, x1 + w]);
                    pieceScores.push(maxScore);
                    pieceClasses.push(classId);
                }
            }
        }

        const predictions = [];
        const scale = 640 / maxDim;

        // Process Board NMS
        if (boardBoxes.length > 0) {
            const bT = tf.tensor2d(boardBoxes);
            const sT = tf.tensor1d(boardScores);
            const indices = await tf.image.nonMaxSuppressionAsync(bT, sT, 5, 0.45, 0.35);
            const idxArr = await indices.data();
            bT.dispose(); sT.dispose(); indices.dispose();
            
            for (let idx of idxArr) {
                const [y1, x1, y2, x2] = boardBoxes[idx];
                predictions.push({
                    classId: 12, className: 'board', score: boardScores[idx],
                    x: (x1 / scale) - padX, y: (y1 / scale) - padY, width: (x2 - x1) / scale, height: (y2 - y1) / scale
                });
            }
        }

        // Process Piece NMS
        if (pieceBoxes.length > 0) {
            const pT = tf.tensor2d(pieceBoxes);
            const sT = tf.tensor1d(pieceScores);
            const indices = await tf.image.nonMaxSuppressionAsync(pT, sT, 100, 0.45, 0.50);
            const idxArr = await indices.data();
            pT.dispose(); sT.dispose(); indices.dispose();
            
            for (let idx of idxArr) {
                const [y1, x1, y2, x2] = pieceBoxes[idx];
                predictions.push({
                    classId: pieceClasses[idx], className: this.YOLO_CLASSES[pieceClasses[idx]], score: pieceScores[idx],
                    x: (x1 / scale) - padX, y: (y1 / scale) - padY, width: (x2 - x1) / scale, height: (y2 - y1) / scale
                });
            }
        }

        return predictions;
    }
    processYoloPredictions(predictions, clickX, clickY, canvasWidth, canvasHeight) {
        let boards = predictions.filter(p => p.classId === 12);
        const pieces = predictions.filter(p => p.classId !== 12);

        // FALLBACK: If AI missed the board but saw pieces, build the board from piece boundaries!
        if (boards.length === 0 && pieces.length >= 4) {
            let minX = Math.min(...pieces.map(p => p.x));
            let minY = Math.min(...pieces.map(p => p.y));
            let maxX = Math.max(...pieces.map(p => p.x + p.width));
            let maxY = Math.max(...pieces.map(p => p.y + p.height));
            
            let w = maxX - minX;
            let h = maxY - minY;
            
            boards = [{
                x: minX - (w * 0.05),
                y: minY - (h * 0.05),
                width: w * 1.10,
                height: h * 1.10,
                classId: 12
            }];
        }

        if (boards.length === 0) return null;

        let targetBoard = null;
        for (let b of boards) {
            if (clickX >= b.x && clickX <= (b.x + b.width) && clickY >= b.y && clickY <= (b.y + b.height)) {
                targetBoard = b;
                break;
            }
        }

        if (!targetBoard) {
            let minDist = Infinity;
            for (let b of boards) {
                let dist = Math.hypot((b.x + b.width / 2) - clickX, (b.y + b.height / 2) - clickY);
                if (dist < minDist) { minDist = dist; targetBoard = b; }
            }
        }

        const activePieces = pieces.filter(p => {
            let cx = p.x + (p.width / 2);
            let cy = p.y + (p.height / 2);
            return (cx >= targetBoard.x - 10 && cx <= (targetBoard.x + targetBoard.width) + 10 &&
                    cy >= targetBoard.y - 10 && cy <= (targetBoard.y + targetBoard.height) + 10);
        });

        const fenArray = Array(64).fill(null);
        const sqWidth = targetBoard.width / 8;
        const sqHeight = targetBoard.height / 8;

        activePieces.forEach(p => {
            let relX = (p.x + (p.width / 2)) - targetBoard.x;
            let relY = (p.y + (p.height * 0.85)) - targetBoard.y; // Measure from base

            let col = Math.floor(relX / sqWidth);
            let row = Math.floor(relY / sqHeight);

            if (col < 0) col = 0; if (col > 7) col = 7;
            if (row < 0) row = 0; if (row > 7) row = 7;

            if (!fenArray[row * 8 + col] || p.score > fenArray[row * 8 + col].score) {
                fenArray[row * 8 + col] = { char: this.YOLO_CLASSES[p.classId], score: p.score };
            }
        });

        let fen = "";
        for (let row = 0; row < 8; row++) {
            let emptyCount = 0;
            for (let col = 0; col < 8; col++) {
                let piece = fenArray[row * 8 + col];
                if (piece) {
                    if (emptyCount > 0) { fen += emptyCount; emptyCount = 0; }
                    fen += piece.char;
                } else {
                    emptyCount++;
                }
            }
            if (emptyCount > 0) fen += emptyCount;
            if (row < 7) fen += "/";
        }

        fen += " w KQkq - 0 1";
        return fen;
    }
}
window.generateDataset = async function(numImages = 1500, batchIndex = 1) {
    console.log(`📥 Loading JSZip library...`);
    if (typeof JSZip === 'undefined') {
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
        document.head.appendChild(script);
        await new Promise(r => script.onload = r);
    }

    console.log(`🚀 Generating ${numImages} EXTREME YOLOv8 Images (Batch ${batchIndex})...`);
    const zip = new JSZip();
    const imagesFolder = zip.folder("images");
    const labelsFolder = zip.folder("labels");
    const fensFolder = zip.folder("fens");

    const canvas = document.createElement('canvas');
    canvas.width = 640; 
    canvas.height = 640; 
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); 

    const { PIECE_SETS } = await import('./piece.js');
    
    const yoloClasses = {
        'P': 0, 'N': 1, 'B': 2, 'R': 3, 'Q': 4, 'K': 5,
        'p': 6, 'n': 7, 'b': 8, 'r': 9, 'q': 10, 'k': 11
    };
    const classes = ['P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k'];
    const classMap = {
        'P': 'wP', 'N': 'wN', 'B': 'wB', 'R': 'wR', 'Q': 'wQ', 'K': 'wK',
        'p': 'bP', 'n': 'bN', 'b': 'bB', 'r': 'bR', 'q': 'bQ', 'k': 'bK'
    };

    const getImgSrc = (svgString) => {
        if (!svgString) return '';
        const trimmed = svgString.trim();
        if (trimmed.includes('<svg')) {
            return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(trimmed)));
        }
        return trimmed; 
    };

    const imageCache = {}; 
    const loadPromises = [];
    for (const setName of Object.keys(PIECE_SETS)) {
        for (const cls of classes) {
            const img = new Image();
            const promise = new Promise(r => { img.onload = r; img.onerror = r; });
            img.src = getImgSrc(PIECE_SETS[setName].pieces[classMap[cls]]);
            imageCache[`${setName}_${cls}`] = img;
            loadPromises.push(promise);
        }
    }
    await Promise.all(loadPromises);

    // 🔥 EXTREME CONDITION 1: Newspaper & Bad Scan Themes
    const printThemes = [
        { light: '#ffffff', ink: '#000000', style: 'hatch_single', isPrint: true }, 
        { light: '#f8f8f8', ink: '#111111', style: 'hatch_cross', isPrint: true }, 
        { light: '#e0e0e0', ink: '#888888', style: 'hatch_single', isPrint: true }, // Faded ink print
        { light: '#4a4a4a', ink: '#111111', style: 'hatch_cross', isPrint: true },  // Dark photocopy
        { light: '#ffffff', ink: '#dddddd', style: 'hatch_single', isPrint: true }  // Barely visible hatch
    ];

    // 🔥 EXTREME CONDITION 2: Messy Hatching
    const createHatchPattern = (bgColor, inkColor, type, density) => {
        const pcvs = document.createElement('canvas');
        pcvs.width = density; pcvs.height = density;
        const pctx = pcvs.getContext('2d');
        pctx.fillStyle = bgColor; pctx.fillRect(0, 0, density, density);
        pctx.strokeStyle = inkColor; 
        // Randomly thicken lines to mimic bleeding ink
        pctx.lineWidth = Math.max(1, (density / 6) * (Math.random() * 2 + 0.5)); 
        pctx.lineCap = 'square';
        pctx.beginPath();
        if (type === 'hatch_single' || type === 'hatch_cross') {
            pctx.moveTo(0, density); pctx.lineTo(density, 0);
            pctx.moveTo(-density/2, density/2); pctx.lineTo(density/2, -density/2);
            pctx.moveTo(density/2, density*1.5); pctx.lineTo(density*1.5, density/2);
        }
        if (type === 'hatch_cross') {
            pctx.moveTo(0, 0); pctx.lineTo(density, density);
            pctx.moveTo(-density/2, density/2); pctx.lineTo(density/2, density*1.5);
            pctx.moveTo(density/2, -density/2); pctx.lineTo(density*1.5, density/2);
        }
        pctx.stroke();
        return ctx.createPattern(pcvs, 'repeat');
    };

    // 🔥 EXTREME CONDITION 3: Nuclear Noise Multiplier
    const applyPrintNoise = (intensity = 1) => {
        const imgData = ctx.getImageData(0, 0, 640, 640);
        const data = imgData.data;
        const noiseLevel = 50 * intensity; // Cranked up base noise
        for (let i = 0; i < data.length; i += 4) {
            if (Math.random() > (0.8 - (intensity * 0.15))) { // More pixels affected on high intensity
                const noise = (Math.random() - 0.5) * noiseLevel; 
                data[i] = Math.min(255, Math.max(0, data[i] + noise));     
                data[i+1] = Math.min(255, Math.max(0, data[i+1] + noise)); 
                data[i+2] = Math.min(255, Math.max(0, data[i+2] + noise)); 
            }
        }
        ctx.putImageData(imgData, 0, 0);
    };

    const drawArrow = (ctx, fromX, fromY, toX, toY, color) => {
        const headlen = 25; 
        const dx = toX - fromX;
        const dy = toY - fromY;
        const angle = Math.atan2(dy, dx);
        ctx.globalAlpha = 0.65; 
        ctx.strokeStyle = color;
        ctx.lineWidth = 14;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(toX + 5 * Math.cos(angle), toY + 5 * Math.sin(angle));
        ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
        ctx.fill();
        ctx.globalAlpha = 1.0;
    };

    const drawCircle = (ctx, x, y, radius, color) => {
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = color;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    };

    const drawDot = (ctx, x, y, radius, color, isCaptureRing) => {
        ctx.globalAlpha = 0.3;
        if (isCaptureRing) {
            ctx.strokeStyle = color;
            ctx.lineWidth = radius * 0.4;
            ctx.beginPath();
            ctx.arc(x, y, radius * 2.5, 0, 2 * Math.PI);
            ctx.stroke();
        } else {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI);
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;
    };

    // ==========================================
    // THE MAIN GENERATION LOOP
    // ==========================================
    for (let i = 0; i < numImages; i++) {
        let theme;
        const rand = Math.random();
        
        // 35% Bad Books, 30% Camouflage/Low-Contrast, 35% Normal Digital
        if (rand < 0.35) {
            theme = printThemes[Math.floor(Math.random() * printThemes.length)];
        } else if (rand < 0.65) {
            // 🔥 EXTREME CONDITION 4: Black-on-Black & White-on-White Camouflage
            theme = { 
                light: ['#ffffff', '#f4f4f4', '#eaeaea'][Math.floor(Math.random()*3)], // Pure Whites
                dark: ['#111111', '#222222', '#333333', '#000000'][Math.floor(Math.random()*4)], // Pure Blacks
                style: 'solid', 
                isPrint: false 
            };
        } else {
            const h1 = Math.floor(Math.random() * 360), s1 = Math.floor(Math.random() * 60), l1 = Math.floor(Math.random() * 30) + 65; 
            const h2 = Math.random() > 0.5 ? h1 : Math.floor(Math.random() * 360), s2 = Math.floor(Math.random() * 80), l2 = Math.floor(Math.random() * 35) + 20; 
            theme = { light: `hsl(${h1}, ${s1}%, ${l1}%)`, dark: `hsl(${h2}, ${s2}%, ${l2}%)`, style: 'solid', isPrint: false };
        }

        ctx.fillStyle = theme.isPrint ? theme.light : `hsl(${Math.floor(Math.random() * 360)}, 15%, ${Math.floor(Math.random() * 100)}%)`; 
        ctx.fillRect(0, 0, 640, 640);

        const boardSize = 400 + Math.random() * 200; 
        const offsetX = (640 - boardSize) / 2 + (Math.random() * 60 - 30);
        const offsetY = (640 - boardSize) / 2 + (Math.random() * 60 - 30);
        const sqSize = boardSize / 8;

        if (Math.random() > 0.3) {
            const borderPad = Math.random() * 40 + 10;
            ctx.fillStyle = ['#222', '#5c4033', '#ffffff', '#ddd'][Math.floor(Math.random()*4)];
            ctx.fillRect(offsetX - borderPad, offsetY - borderPad, boardSize + borderPad*2, boardSize + borderPad*2);
            
            ctx.fillStyle = '#888';
            ctx.font = "14px Arial";
            ctx.fillText("a b c d e f g h", offsetX + 10, offsetY + boardSize + borderPad - 5);
        }

        let darkFill = theme.style === 'solid' ? theme.dark : createHatchPattern(theme.light, theme.ink, theme.style, Math.floor(sqSize / (4 + Math.random() * 6))); // Increased randomness in hatch sizing

        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                ctx.fillStyle = (row + col) % 2 === 0 ? theme.light : darkFill;
                ctx.fillRect(offsetX + col * sqSize, offsetY + row * sqSize, sqSize, sqSize);
                if (!theme.isPrint && Math.random() < 0.05) {
                    ctx.fillStyle = 'rgba(255, 255, 0, 0.4)';
                    ctx.fillRect(offsetX + col * sqSize, offsetY + row * sqSize, sqSize, sqSize);
                }
            }
        }

        let labelsTxt = "";
        const trueFenArray = Array(8).fill(null).map(() => Array(8).fill(null));
        const setName = Object.keys(PIECE_SETS)[Math.floor(Math.random() * Object.keys(PIECE_SETS).length)];
        
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                if (Math.random() < 0.25) {
                    const cls = classes[Math.floor(Math.random() * classes.length)];
                    const img = imageCache[`${setName}_${cls}`];
                    
                    if (img && img.complete && img.naturalWidth > 0) {
                        const px = offsetX + col * sqSize, py = offsetY + row * sqSize;
                        const pSize = sqSize * 0.90, pOffset = (sqSize - pSize) / 2;
                        
                        // 🔥 EXTREME CONDITION 5: "Bad Ink" Piece fading
                        if (theme.isPrint && Math.random() < 0.2) {
                            ctx.globalAlpha = Math.random() * 0.4 + 0.4; // Fade out to 40%-80% opacity
                        }

                        ctx.drawImage(img, px + pOffset, py + pOffset, pSize, pSize);
                        ctx.globalAlpha = 1.0; // Reset

                        const xCenter = (px + sqSize / 2) / 640, yCenter = (py + sqSize / 2) / 640;
                        const normWidth = sqSize / 640, normHeight = sqSize / 640;
                        labelsTxt += `${yoloClasses[cls]} ${xCenter.toFixed(6)} ${yCenter.toFixed(6)} ${normWidth.toFixed(6)} ${normHeight.toFixed(6)}\n`;
                        trueFenArray[row][col] = cls; 
                    }
                }
            }
        }

        if (!theme.isPrint && Math.random() > 0.2) {
            const numDots = Math.floor(Math.random() * 6);
            for(let d = 0; d < numDots; d++) {
                const col = Math.floor(Math.random() * 8), row = Math.floor(Math.random() * 8);
                const cx = offsetX + col * sqSize + sqSize / 2, cy = offsetY + row * sqSize + sqSize / 2;
                const isCaptureRing = Math.random() > 0.6;
                drawDot(ctx, cx, cy, sqSize * 0.15, '#000000', isCaptureRing);
            }
            const numCircles = Math.floor(Math.random() * 3);
            for(let c = 0; c < numCircles; c++) {
                const col = Math.floor(Math.random() * 8), row = Math.floor(Math.random() * 8);
                const cx = offsetX + col * sqSize + sqSize / 2, cy = offsetY + row * sqSize + sqSize / 2;
                drawCircle(ctx, cx, cy, sqSize * 0.42, `hsl(${Math.floor(Math.random() * 360)}, 100%, 50%)`);
            }
            const numArrows = Math.floor(Math.random() * 3);
            for(let a = 0; a < numArrows; a++) {
                const col1 = Math.floor(Math.random() * 8), row1 = Math.floor(Math.random() * 8);
                const col2 = Math.floor(Math.random() * 8), row2 = Math.floor(Math.random() * 8);
                if (col1 !== col2 || row1 !== row2) {
                    const startX = offsetX + col1 * sqSize + sqSize / 2, startY = offsetY + row1 * sqSize + sqSize / 2;
                    const endX = offsetX + col2 * sqSize + sqSize / 2, endY = offsetY + row2 * sqSize + sqSize / 2;
                    drawArrow(ctx, startX, startY, endX, endY, `hsl(${Math.floor(Math.random() * 360)}, 100%, 45%)`);
                }
            }
        }

        let absoluteFen = "";
        for (let r = 0; r < 8; r++) {
            let empty = 0;
            for (let c = 0; c < 8; c++) {
                if (trueFenArray[r][c]) {
                    if (empty > 0) { absoluteFen += empty; empty = 0; }
                    absoluteFen += trueFenArray[r][c];
                } else { empty++; }
            }
            if (empty > 0) absoluteFen += empty;
            if (r < 7) absoluteFen += "/";
        }

        const boardCX = (offsetX + boardSize / 2) / 640, boardCY = (offsetY + boardSize / 2) / 640;
        const boardW = boardSize / 640, boardH = boardSize / 640;
        labelsTxt += `12 ${boardCX.toFixed(6)} ${boardCY.toFixed(6)} ${boardW.toFixed(6)} ${boardH.toFixed(6)}\n`;

        // 🔥 EXTREME CONDITION 6: Global Contrast Crush & Flattening
        // We draw the entire canvas onto an offscreen canvas, then draw it BACK with heavy CSS filters
        const offscreen = document.createElement('canvas');
        offscreen.width = 640; offscreen.height = 640;
        offscreen.getContext('2d').drawImage(canvas, 0, 0);
        ctx.clearRect(0, 0, 640, 640);
        
        // Randomly apply extreme blur and contrast reduction (makes it look like a bad photograph)
        const blurAmt = Math.random() > 0.7 ? (Math.random() * 2.5 + 1) : (Math.random() * 0.8);
        const contrastAmt = Math.random() > 0.6 ? (Math.random() * 0.4 + 0.5) : 1.0; 
        
        ctx.filter = `blur(${blurAmt}px) contrast(${contrastAmt})`;
        ctx.drawImage(offscreen, 0, 0);
        ctx.filter = 'none'; // reset

        // Apply noise AFTER the blur so the static stays sharp
        if (theme.isPrint || Math.random() > 0.6) {
            const noiseIntensity = Math.random() > 0.8 ? (Math.random() * 2.5 + 1) : 1; // Sometimes 3x normal noise
            applyPrintNoise(noiseIntensity);
        }

        const b64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1]; 
        const fileName = `board_${Date.now()}_${i}`;
        
        imagesFolder.file(`${fileName}.jpg`, b64, {base64: true});
        labelsFolder.file(`${fileName}.txt`, labelsTxt);
        fensFolder.file(`${fileName}.fen`, absoluteFen); 

        if (i % 100 === 0) console.log(`Generated ${i} / ${numImages}...`);
    }

    console.log("📦 Compressing Extreme Dataset...");
    const content = await zip.generateAsync({type:"blob"});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `yolov8_extreme_batch_${batchIndex}.zip`; 
    link.click();
    console.log(`✅ Batch ${batchIndex} Done!`);
};
// ==========================================
// YOLOv8 MASSIVE DATASET AUTOMATOR
// ==========================================
window.generateMassiveDataset = async function(totalBatches = 10, imagesPerBatch = 1500) {
    console.log(`🔥 Starting massive generation of ${totalBatches} batches (${totalBatches * imagesPerBatch} total images)...`);
    
    for (let i = 1; i <= totalBatches; i++) {
        console.log(`\n==================================`);
        console.log(`⏳ STARTING BATCH ${i} OF ${totalBatches}...`);
        console.log(`==================================\n`);
        
        // Await pauses the loop until this specific ZIP is completely generated and downloaded
        await window.generateDataset(imagesPerBatch, i);
        
        if (i < totalBatches) {
            console.log(`😴 Pausing for 5 seconds to let the browser clear RAM...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    
    console.log(`\n🎉 ALL ${totalBatches} BATCHES COMPLETED SUCCESSFULLY!`);
    window.ui.showNotification(`Dataset Generation Complete!`, "Success", "✅");
};