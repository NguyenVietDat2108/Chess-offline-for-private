# --- HIGH-PERFORMANCE LOCAL SERVER (Non-Admin Friendly) ---
# Port: 8000
# Security: Localhost Only (Fixes "Access Denied")

$port = 8000
$root = $PSScriptRoot 

$listener = New-Object System.Net.HttpListener
# CHANGE: Used 'localhost' instead of '+' to bypass Admin requirement
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "SERVER RUNNING on Port $port" -ForegroundColor Green
Write-Host "http://localhost:$port/Chess_Final.html" -ForegroundColor Yellow

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        # --- THE MAGIC HEADERS ---
        # These attempt to unlock SharedArrayBuffer for WASM
        $response.AddHeader("Cross-Origin-Opener-Policy", "same-origin")
        $response.AddHeader("Cross-Origin-Embedder-Policy", "require-corp")
        # -------------------------

        $fileName = $request.Url.LocalPath.TrimStart('/')
        if ($fileName -eq "") { $fileName = "chess.html" }
        $path = Join-Path $root $fileName

        if (Test-Path $path -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($path)
            $response.ContentLength64 = $bytes.Length
            $ext = [System.IO.Path]::GetExtension($path)
            
            # Correct MIME Types
            if ($ext -eq ".wasm") { $response.ContentType = "application/wasm" }
            elseif ($ext -eq ".js") { $response.ContentType = "application/javascript" }
            else { $response.ContentType = "text/html" }

            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.Close()
            Write-Host "200 OK: $fileName" -ForegroundColor Gray
        } else {
            $response.StatusCode = 404
            $response.Close()
            Write-Host "404: $fileName" -ForegroundColor Red
        }
    }
} catch {
    Write-Error $_
} finally {
    if ($listener.IsListening) { $listener.Stop() }
}