# --- LOCAL ECO DATABASE BUILDER (Bulletproof) ---
# Fixes "Duplicate Key" errors by using Regex parsing for complex files.

$outputFile = "eco.js"
$currentPath = $PSScriptRoot

Write-Host " [INIT] Scanning local folders..." -ForegroundColor Cyan

# Find all JSON files
$jsonFiles = Get-ChildItem -Path $currentPath -Recurse -Filter "eco*.json"

if ($jsonFiles.Count -eq 0) {
    Write-Host " [ERROR] No 'eco*.json' files found!" -ForegroundColor Red
    exit
}

$allOpenings = @()

foreach ($file in $jsonFiles) {
    # Skip non-data files
    if ($file.Name -match "package|tsconfig|interpolated") { 
        Write-Host "   Skipping: $($file.Name)" -ForegroundColor DarkGray
        continue 
    }
    
    Write-Host "   Reading: $($file.Name) ... " -NoNewline
    
    try {
        # METHOD A: Standard Parse
        $content = Get-Content -Path $file.FullName -Raw -Encoding UTF8
        $data = $content | ConvertFrom-Json -ErrorAction Stop
        
        # Flatten Data
        $list = @()
        if ($data -is [System.Array]) {
            $list = $data
        } else {
            $list = $data.PSObject.Properties | ForEach-Object { $_.Value }
        }
        
        # Add to collection
        foreach ($item in $list) {
            # Handle nested arrays (variations)
            if ($item -is [System.Array]) { $allOpenings += $item }
            else { $allOpenings += $item }
        }
        Write-Host "OK (Standard)" -ForegroundColor Green

    } catch {
        # METHOD B: Raw Regex Parse (Fallback for Duplicate Key Errors)
        Write-Host "Standard Parse Failed. Using Raw Parser... " -NoNewline -ForegroundColor Yellow
        
        try {
            # Regex to find "FEN_STRING": { ...data... }
            # Matches: "rnbqk...": { ... }
            $pattern = '"(?<fen>[^"]+)":\s*(?<data>\{[^}]+\})'
            $matches = [regex]::Matches($content, $pattern)
            
            if ($matches.Count -gt 0) {
                foreach ($m in $matches) {
                    try {
                        # We parse just the small inner object { eco: "...", name: "..." }
                        # This avoids the Key Collision on the main object
                        $obj = $m.Groups["data"].Value | ConvertFrom-Json
                        # Ensure FEN is attached
                        if (-not $obj.fen) { $obj | Add-Member -MemberType NoteProperty -Name "fen" -Value $m.Groups["fen"].Value }
                        $allOpenings += $obj
                    } catch {}
                }
                Write-Host "OK (Recovered $($matches.Count) items)" -ForegroundColor Green
            } else {
                Write-Host "FAILED (No data found)" -ForegroundColor Red
            }
        } catch {
            Write-Host "FAILED" -ForegroundColor Red
        }
    }
}

# --- GENERATE OUTPUT ---
Write-Host " [PROCESS] Indexing $($allOpenings.Count) openings..." -ForegroundColor Cyan

$jsData = "const OPENING_BOOK = {`n"
$validCount = 0

foreach ($entry in $allOpenings) {
    if ($null -eq $entry) { continue }

    # Normalize fields (some files use 'n'/'c' instead of 'name'/'eco')
    $fen = if ($entry.fen) { $entry.fen } else { $entry.f }
    $name = if ($entry.name) { $entry.name } else { $entry.n }
    $eco = if ($entry.eco) { $entry.eco } else { $entry.c }

    if ($fen) {
        # Clean FEN: Keep first 4 parts
        $fenParts = $fen -split " "
        if ($fenParts.Count -ge 4) {
            $cleanFen = "$($fenParts[0]) $($fenParts[1]) $($fenParts[2]) $($fenParts[3])"
            $safeName = $name -replace "'", "\'"
            
            $jsData += "    '$cleanFen': { eco: '$eco', name: '$safeName' },`n"
            $validCount++
        }
    }
}

$jsData += "};"
$jsData | Out-File $outputFile -Encoding UTF8

Write-Host " [SUCCESS] Generated '$outputFile' with $validCount openings." -ForegroundColor Green
Write-Host "           Now move '$outputFile' to your game folder!" -ForegroundColor Yellow