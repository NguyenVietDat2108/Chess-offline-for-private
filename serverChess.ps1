# --- CHESS SERVER v6.0 (High-Performance Edition) ---
# Features: Stream Copying + Hash MIME Lookup + Smart Engine Routing + Auto Browser

$port = 3000
$root = $PSScriptRoot 
$csvPath = Join-Path $root "lichess_db_puzzle.csv"

# --- 1. CLEAN START ---
# Kills existing server instances to prevent port conflicts (supports pwsh & powershell)
Get-Process -Name "pws", "pwsh", "powershell" -ErrorAction SilentlyContinue | 
    Where-Object { $_.Id -ne $PID } | 
    Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 100

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host " [ONLINE] http://localhost:$port/" -ForegroundColor Green

# --- AUTO-OPEN BROWSER ---
Write-Host " [INFO]   Launching Browser..." -ForegroundColor Gray
if ($IsLinux) { Start-Process "xdg-open" "http://localhost:$port/" }
elseif ($IsMacOS) { Start-Process "open" "http://localhost:$port/" }
else { Start-Process "http://localhost:$port/" }
# -------------------------------

if (Test-Path $csvPath) {
    Write-Host " [DATA]   CSV Database Found." -ForegroundColor Cyan
} else {
    Write-Host " [WARN]   CSV NOT FOUND. Using Backup Puzzles." -ForegroundColor Yellow
}

$latestEnginePath = $null
$engineFolder = Join-Path $root "engine"

if (Test-Path $engineFolder) {
    $engineDirs = Get-ChildItem -Path $engineFolder -Directory | Where-Object { $_.Name -match "stockfish" }
    
    if ($engineDirs) {
        $latestEngine = $engineDirs | Sort-Object {
            $match = [regex]::Match($_.Name, '\d+(\.\d+)*')
            if ($match.Success) {
                $ver = $match.Value
                if ($ver -notmatch '\.') { $ver += ".0" } 
                [version]$ver
            } else {
                [version]"0.0"
            }
        } -Descending | Select-Object -First 1

        $latestEnginePath = "engine/" + $latestEngine.Name
        Write-Host " [ENGINE] Auto-detected latest version: $latestEnginePath" -ForegroundColor Magenta
    } else {
        Write-Host " [WARN]   No Stockfish folders found inside 'engine'." -ForegroundColor Yellow
    }
} else {
    Write-Host " [WARN]   'engine' folder does not exist." -ForegroundColor Yellow
}

# --- 2. FAST MIME LOOKUP DICTIONARY ---
$mimeTypes = @{
    ".html" = "text/html"
    ".js"   = "application/javascript"
    ".mjs"  = "application/javascript"
    ".wasm" = "application/wasm"
    ".css"  = "text/css"
    ".svg"  = "image/svg+xml"
    ".json" = "application/json"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".webp" = "image/webp"
    ".bin"  = "application/octet-stream"
    ".map"  = "application/json"
    ".ico"  = "image/x-icon"
}

# --- 3. PUZZLE GENERATOR ---
# --- 3. PUZZLE GENERATOR ---
Function Get-Puzzles ($min, $max, $count) {
    if (Test-Path $csvPath) {
        try {
            $results = @(); $fs = [System.IO.File]::OpenRead($csvPath); $len = $fs.Length
            $attempts = 0; $buffer = New-Object byte[] 65536 
            
            # 🔥 THE FIX: Increased depth from 50 to 1000. It will now successfully hunt down rare 2000+ puzzles!
            while ($results.Count -lt $count -and $attempts -lt 1000) {
                $attempts++
                $pos = Get-Random -Min 0 -Max ($len - 65536)
                $fs.Position = $pos; $null = $fs.Read($buffer, 0, 65536)
                $chunk = [System.Text.Encoding]::UTF8.GetString($buffer)
                $lines = $chunk -split "`n"; if ($lines.Count -gt 2) { $lines = $lines[1..($lines.Count-2)] }
                foreach ($line in $lines) {
                    $parts = $line -split ","
                    if ($parts.Count -gt 7) {
                        $rating = 0
                        # Safely parse integer to prevent crashes on bad CSV rows
                        if ([int]::TryParse($parts[3], [ref]$rating)) {
                            if ($rating -ge $min -and $rating -le $max) {
                                $results += @{ id=$parts[0]; fen=$parts[1]; moves=$parts[2]; rating=$rating; themes=$parts[7] }
                                if ($results.Count -ge $count) { break }
                            }
                        }
                    }
                }
            }
            $fs.Close()
            if ($results.Count -gt 0) { return $results }
        } catch { Write-Host " [ERR] CSV Read Failed: $_" -ForegroundColor Red }
    }

    return @(
        @{ id="backup1"; fen="r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3"; moves="f3e5 c6e5"; rating=800; themes="opening" }
    )
}

# --- 4. SERVER LOOP ---
while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response

    # --- GLOBAL SECURITY HEADERS (Needed for WASM) ---
    $res.AddHeader("Cross-Origin-Opener-Policy", "same-origin")
    $res.AddHeader("Cross-Origin-Embedder-Policy", "require-corp")

    $path = $req.Url.LocalPath.TrimEnd('/')

    # --- SMART CACHING ---
    # Cache heavy/static files (AI models, WASM, CSS) to prevent single-thread traffic jams
    if ($path -match "\.(bin|wasm|css|json|png|svg)$") {
        $res.AddHeader("Cache-Control", "public, max-age=3600")
    } else {
        # Never cache HTML, JS, or API calls so your code edits apply instantly
        $res.AddHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        $res.AddHeader("Pragma", "no-cache")
        $res.AddHeader("Expires", "-1")
    }

    try {
     $path = $req.Url.LocalPath.TrimEnd('/')

        # === API HANDLER ===
        if ($path -eq "/get-puzzles") {
            # 🔥 THE FIX: Parse undefined correctly, and respect the requested 'count' parameter!
            $min = if ($req.QueryString["min"] -and $req.QueryString["min"] -ne "undefined") { [int]$req.QueryString["min"] } else { 600 }
            $max = if ($req.QueryString["max"] -and $req.QueryString["max"] -ne "undefined") { [int]$req.QueryString["max"] } else { 3000 }
            $count = if ($req.QueryString["count"] -and $req.QueryString["count"] -ne "undefined") { [int]$req.QueryString["count"] } else { 5 }
            
            $data = Get-Puzzles $min $max $count
            Write-Host " [API] Sending $($data.Count) puzzles ($min-$max)." -ForegroundColor Cyan
            
            $json = $data | ConvertTo-Json -Compress
            $b = [System.Text.Encoding]::UTF8.GetBytes($json)
            $res.ContentType = "application/json"
            $res.ContentLength64 = $b.Length
            $res.OutputStream.Write($b, 0, $b.Length)
            continue
        }

        # === FILE HANDLER ===
        $file = $path.TrimStart('/')
        if ([string]::IsNullOrEmpty($file)) { $file = "index.html" }
        if ($file.Contains("?")) { $file = $file.Split("?")[0] }
    
        # === SMART ENGINE ROUTING ===
        if (($file -match "stockfish.*\.js" -or $file -match "stockfish.*\.wasm") -and $latestEnginePath) {
            $ext = if ($file.EndsWith(".js")) { "*.js" } else { "*.wasm" }
            $actualFile = Get-ChildItem -Path (Join-Path $root $latestEnginePath) -Filter $ext | Select-Object -First 1
            
            if ($actualFile) {
                $file = "$latestEnginePath/$($actualFile.Name)"
                Write-Host " [ROUTE] Auto-mapping engine request to: $file" -ForegroundColor DarkGray
            }
        }

        # Cross-platform safe path mapping
        $file = $file -replace '[\\/]', [IO.Path]::DirectorySeparatorChar
        $localPath = Join-Path $root $file

        if (Test-Path $localPath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
            
            # Use Hash Dictionary for Fast Lookup
            if ($mimeTypes.ContainsKey($ext)) { $res.ContentType = $mimeTypes[$ext] } 
            else { $res.ContentType = "application/octet-stream" }

            # Direct Stream Copy (Prevents OutOfMemory on large WASM/BIN files)
            $fs = [System.IO.File]::OpenRead($localPath)
            $res.ContentLength64 = $fs.Length
            
            try {
                $fs.CopyTo($res.OutputStream)
                Write-Host " [200] $file" -ForegroundColor Gray
            } catch {
                # Silently catch when the browser cancels the download midway
                Write-Host " [WARN] $file (Browser aborted connection)" -ForegroundColor DarkYellow
            } finally {
                if ($fs) { 
                    $fs.Close()
                    $fs.Dispose() 
                }
            }
        } else {
            $res.StatusCode = 404
            Write-Host " [404] $file (Not Found)" -ForegroundColor Red
        }
    } catch {
        $res.StatusCode = 500
        Write-Host " [500] Crash: $($_.Exception.Message)" -ForegroundColor Red
    } finally {
        try { 
            $res.OutputStream.Close()
            $res.Close() 
        } catch {}
    }
}