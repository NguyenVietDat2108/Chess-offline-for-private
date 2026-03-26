# --- CHESS SERVER v6.0 (High-Performance WebAssembly Edition) ---
# Features: COOP/COEP Headers (for Pthreads/SharedArrayBuffer), Stream Copying, Smart Routing

$port = 3000
$root = $PSScriptRoot 

# --- 1. CLEAN START ---
# Kills existing server instances to prevent port conflicts
Write-Host " [INIT] Cleaning up old server instances..." -ForegroundColor Gray
Get-Process -Name "pws", "pwsh", "powershell" -ErrorAction SilentlyContinue | 
    Where-Object { $_.Id -ne $PID } | 
    Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 100

# --- 2. SETUP MIME TYPES ---
$mimeTypes = @{
    ".html" = "text/html"
    ".css"  = "text/css"
    ".js"   = "application/javascript"
    ".wasm" = "application/wasm"
    ".json" = "application/json"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".webp" = "image/webp"
    ".ico"  = "image/x-icon"
    ".nnue" = "application/octet-stream"
    ".bin"  = "application/octet-stream"
}

# --- 3. START LISTENER ---
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host " [ONLINE] Server running at http://localhost:$port/" -ForegroundColor Green

# --- 4. AUTO-OPEN BROWSER ---
Write-Host " [INFO] Launching Browser..." -ForegroundColor Gray
if ($IsLinux) { Start-Process "xdg-open" "http://localhost:$port/" }
elseif ($IsMacOS) { Start-Process "open" "http://localhost:$port/" }
else { Start-Process "http://localhost:$port/" }

# --- 5. MAIN SERVER LOOP ---
Write-Host " [INFO] Waiting for requests... (Press Ctrl+C to stop)" -ForegroundColor Yellow

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $req = $context.Request
        $res = $context.Response

        # 🔥 CRITICAL MULTI-THREADING FIX: Cross-Origin Isolation Headers
        # Without these two exact headers, modern browsers block SharedArrayBuffer,
        # which completely breaks WebAssembly pthreads (Fairy-Stockfish)!
        $res.Headers.Add("Cross-Origin-Opener-Policy", "same-origin")
        $res.Headers.Add("Cross-Origin-Embedder-Policy", "require-corp")
        
        # Prevent aggressive caching during development
        $res.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")

        $urlPath = $req.Url.AbsolutePath.TrimStart('/')
	$urlPath = [uri]::UnescapeDataString($urlPath)
        if ([string]::IsNullOrEmpty($urlPath) -or $urlPath -eq "") {
            $urlPath = "index.html"
        }

        # Normalize path separators for Windows/Mac/Linux
        $urlPath = $urlPath -replace '/', [System.IO.Path]::DirectorySeparatorChar
        $localPath = Join-Path $root $urlPath

        # 🔥 EMSCRIPTEN FAILSAFE: If a Web Worker bugs out and asks for a UUID instead of a JS file, 
        # the server will instantly intercept it and serve the Fairy-Stockfish worker anyway!
        if ($urlPath -match "^[0-9a-fA-F\-]{36}$") {
            Write-Host " [ROUTE] Intercepted WebWorker UUID request -> Rerouting to fairy-stockfish.js" -ForegroundColor Magenta
            $localPath = Join-Path $root "engine\fairy\fairy-stockfish.js"
        }

        # Check if the file physically exists
        if (Test-Path $localPath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
            
            # Apply MIME type
            if ($mimeTypes.ContainsKey($ext)) { 
                $res.ContentType = $mimeTypes[$ext] 
            } else { 
                $res.ContentType = "application/octet-stream" 
            }

            # Direct Stream Copy (Prevents OutOfMemory crashes on massive 50MB+ NNUE/WASM files)
            $fs = [System.IO.File]::OpenRead($localPath)
            $res.ContentLength64 = $fs.Length
            
            try {
                $fs.CopyTo($res.OutputStream)
                Write-Host " [200] $urlPath" -ForegroundColor Gray
            } catch {
                # Silently catch when the browser cancels a download midway (common with engine switching)
                Write-Host " [WARN] $urlPath (Browser aborted connection)" -ForegroundColor DarkYellow
            } finally {
                if ($fs) { 
                    $fs.Close()
                    $fs.Dispose() 
                }
            }
        } else {
            $res.StatusCode = 404
            Write-Host " [404] $urlPath (Not Found)" -ForegroundColor Red
        }
        
        $res.Close()
    }
} catch {
    Write-Host " [500] Server Crash: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    $listener.Stop()
    $listener.Close()
}