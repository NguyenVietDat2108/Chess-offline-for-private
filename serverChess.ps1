# --- CHESS SERVER v6.4 (High-Performance Native Edition) ---
# Features: COOP/COEP Headers, Stream Copying, Smart Routing, Array Puzzle Fetcher

$port = 3000
$root = $PSScriptRoot 

# --- 1. CLEAN START ---
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
    ".csv"  = "text/csv"
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

        $res.Headers.Add("Cross-Origin-Opener-Policy", "same-origin")
        $res.Headers.Add("Cross-Origin-Embedder-Policy", "require-corp")
        $res.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")

        $urlPath = $req.Url.AbsolutePath.TrimStart('/')
        $urlPath = [uri]::UnescapeDataString($urlPath)
        if ([string]::IsNullOrEmpty($urlPath) -or $urlPath -eq "") {
            $urlPath = "index.html"
        }

        # ==========================================
        # 🔥 API ROUTE: LATEST ENGINE FETCHER
        # ==========================================
        if ($urlPath -eq "api/latest-engine") {
            $engineDir = Join-Path $root "engine"
            $latestJs = "engine/stockfish 18/stockfish-18.js" 
            $latestVersion = -1.0
            $engineName = "Stockfish 18"

            if (Test-Path $engineDir) {
                $sfFolders = Get-ChildItem -Path $engineDir -Directory | Where-Object { $_.Name.ToLower() -match "stockfish" -and $_.Name.ToLower() -notmatch "fairy" }
                
                foreach ($folder in $sfFolders) {
                    if ($folder.Name -match "(?i)stockfish\s*[-_]?\s*v?(\d+(\.\d+)?)") {
                        $ver = [double]$matches[1]
                        if ($ver -gt $latestVersion) {
                            $jsFile = Get-ChildItem -Path $folder.FullName -Filter "*.js" | Select-Object -First 1
                            if ($jsFile) {
                                $latestVersion = $ver
                                $latestJs = "engine/" + $folder.Name + "/" + $jsFile.Name
                                $engineName = $folder.Name
                            }
                        }
                    }
                }
            }

            $res.ContentType = "application/json"
            $json = "{ `"path`": `"/$latestJs`", `"name`": `"$engineName`" }"
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
            $res.ContentLength64 = $buffer.Length
            $res.OutputStream.Write($buffer, 0, $buffer.Length)
            $res.Close()
            continue
        }

        # ==========================================
        # 🔥 API ROUTE: PUZZLE FETCHER (Matches ChessGame.js arrays!)
        # ==========================================
        if ($urlPath -eq "get-puzzles") {
            $puzzleFile = Join-Path $root "lichess_db_puzzle.csv"
            
            # Unbreakable fallback to your exact path
            if (-not (Test-Path $puzzleFile)) {
                $puzzleFile = "C:\Users\TDG\Downloads\Chess-Server-Run\project_root\lichess_db_puzzle.csv"
            }

            $res.ContentType = "application/json"

            # 1. Parse URL Parameters (e.g., ?min=400&max=900&count=10)
            $minRating = 0
            $maxRating = 9999
            $fetchCount = 5

            if ($req.Url.Query) {
                $qParams = $req.Url.Query.TrimStart('?') -split '&'
                foreach ($p in $qParams) {
                    $kv = $p -split '='
                    if ($kv.Length -eq 2) {
                        if ($kv[0] -eq 'min') { [int]::TryParse($kv[1], [ref]$minRating) | Out-Null }
                        if ($kv[0] -eq 'max') { [int]::TryParse($kv[1], [ref]$maxRating) | Out-Null }
                        if ($kv[0] -eq 'count') { [int]::TryParse($kv[1], [ref]$fetchCount) | Out-Null }
                    }
                }
            }
            
            if (Test-Path $puzzleFile) {
                try {
                    $fsStream = [System.IO.File]::OpenRead($puzzleFile)
                    $reader = New-Object System.IO.StreamReader($fsStream)
                    
                    $puzzles = @()
                    $attempts = 0
                    $maxAttempts = $fetchCount * 100 # Prevent infinite loops if database is tiny

                    # 2. Loop until we collect the requested number of valid puzzles
                    while ($puzzles.Count -lt $fetchCount -and $attempts -lt $maxAttempts) {
                        $attempts++
                        
                        # 🔥 CRITICAL FIX: Seek stream, then CLEAR the reader's memory buffer before reading!
                        $randomPos = Get-Random -Minimum 0 -Maximum $fsStream.Length
                        $fsStream.Seek($randomPos, [System.IO.SeekOrigin]::Begin) | Out-Null
                        $reader.DiscardBufferedData()
                        
                        $reader.ReadLine() | Out-Null # Discard the fragmented line
                        $randomLine = $reader.ReadLine()
                        
                        if ([string]::IsNullOrWhiteSpace($randomLine)) {
                            $fsStream.Seek(0, [System.IO.SeekOrigin]::Begin) | Out-Null
                            $reader.DiscardBufferedData()
                            $reader.ReadLine() | Out-Null # Discard CSV header
                            $randomLine = $reader.ReadLine()
                        }
                        
                        $cols = $randomLine -split ","
                        if ($cols.Length -ge 8) {
                            $rating = 0
                            [int]::TryParse($cols[3], [ref]$rating) | Out-Null

                            # 3. Validate against requested Rating Range
                            if ($rating -ge $minRating -and $rating -le $maxRating) {
                                # Escape quotes in themes to prevent JSON breakage
                                $themes = $cols[7] -replace '"', '\"'
                                $puzzles += "{ `"id`": `"$($cols[0])`", `"fen`": `"$($cols[1])`", `"moves`": `"$($cols[2])`", `"rating`": $rating, `"themes`": `"$themes`" }"
                            }
                        }
                    }
                    
                    $reader.Close()
                    $fsStream.Close()
                    
                    # 4. Return as a formatted JSON Array
                    $json = "[" + ($puzzles -join ",") + "]"
                    Write-Host " [API] Fetched $($puzzles.Count) puzzles ($minRating-$maxRating)" -ForegroundColor Cyan
                    
                } catch {
                    $json = "[]"
                    Write-Host " [ERROR] Failed to read puzzle DB: $($_.Exception.Message)" -ForegroundColor Red
                }
            } else {
                $json = "[]"
                Write-Host " [ERROR] lichess_db_puzzle.csv not found!" -ForegroundColor Red
            }

            $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
            $res.ContentLength64 = $buffer.Length
            $res.OutputStream.Write($buffer, 0, $buffer.Length)
            $res.Close()
            continue
        }

        # Normalize path separators for Windows/Mac/Linux
        $urlPath = $urlPath -replace '/', [System.IO.Path]::DirectorySeparatorChar
        $localPath = Join-Path $root $urlPath

        # 🔥 EMSCRIPTEN FAILSAFE
        if ($urlPath -match "^[0-9a-fA-F\-]{36}$") {
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

            # Direct Stream Copy
            $fs = [System.IO.File]::OpenRead($localPath)
            $res.ContentLength64 = $fs.Length
            
            try {
                $fs.CopyTo($res.OutputStream)
            } catch {
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