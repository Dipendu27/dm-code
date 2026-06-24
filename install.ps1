# ─────────────────────────────────────────────────────────────────────────────
#  DM Code — Windows Installer (PowerShell)
#  Works on Windows 10/11 with Node.js ≥ 20
# ─────────────────────────────────────────────────────────────────────────────
param(
    [switch]$SkipKeySetup
)

$ErrorActionPreference = "Stop"

# ── Colors ────────────────────────────────────────────────────────────────────
function Write-Step  { param($msg) Write-Host "  → " -ForegroundColor Cyan -NoNewline; Write-Host $msg }
function Write-Ok    { param($msg) Write-Host "  ✓ " -ForegroundColor Green -NoNewline; Write-Host $msg }
function Write-Err   { param($msg) Write-Host "  ✗ ERROR: " -ForegroundColor Red -NoNewline; Write-Host $msg; exit 1 }
function Write-Warn  { param($msg) Write-Host "  ⚠ " -ForegroundColor Yellow -NoNewline; Write-Host $msg }

# ── Banner ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ██████╗ ███╗   ███╗     ██████╗ ██████╗ ██████╗ ███████╗" -ForegroundColor DarkYellow
Write-Host "  ██╔══██╗████╗ ████║    ██╔════╝██╔═══██╗██╔══██╗██╔════╝" -ForegroundColor DarkYellow
Write-Host "  ██║  ██║██╔████╔██║    ██║     ██║   ██║██║  ██║█████╗  " -ForegroundColor DarkYellow
Write-Host "  ██║  ██║██║╚██╔╝██║    ██║     ██║   ██║██║  ██║██╔══╝  " -ForegroundColor DarkYellow
Write-Host "  ██████╔╝██║ ╚═╝ ██║    ╚██████╗╚██████╔╝██████╔╝███████╗" -ForegroundColor DarkYellow
Write-Host "  ╚═════╝ ╚═╝     ╚═╝     ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝" -ForegroundColor DarkYellow
Write-Host ""
Write-Host "  Windows Installer — powered by Annihilator" -ForegroundColor DarkGray
Write-Host ""

# ── 1. Check Node.js ─────────────────────────────────────────────────────────
Write-Step "Checking Node.js..."

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Warn "Node.js not found."
    Write-Host ""
    Write-Host "  Install Node.js (v20+) using one of these methods:" -ForegroundColor White
    Write-Host "    1. Download from https://nodejs.org" -ForegroundColor DarkGray
    Write-Host "    2. winget install OpenJS.NodeJS.LTS" -ForegroundColor DarkGray
    Write-Host "    3. choco install nodejs-lts" -ForegroundColor DarkGray
    Write-Host "    4. scoop install nodejs-lts" -ForegroundColor DarkGray
    Write-Host ""
    Write-Err "Please install Node.js ≥ 20 and re-run this script."
}

$nodeVersion = (node --version) -replace '^v', ''
$nodeMajor = [int]($nodeVersion -split '\.')[0]
if ($nodeMajor -lt 20) {
    Write-Warn "Node.js v$nodeVersion is too old (need ≥ 20)."
    Write-Host "  Update: winget upgrade OpenJS.NodeJS.LTS" -ForegroundColor DarkGray
    Write-Err "Please upgrade Node.js to v20+ and re-run this script."
}
Write-Ok "Node.js v$nodeVersion — $(($nodeCmd).Source)"

# ── 2. Check npm ──────────────────────────────────────────────────────────────
Write-Step "Checking npm..."
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmCmd) {
    Write-Err "npm not found. It should come with Node.js. Please reinstall Node.js."
}
$npmVersion = npm --version
Write-Ok "npm v$npmVersion"

# ── 3. Install npm dependencies ──────────────────────────────────────────────
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Step "Installing npm dependencies in $scriptDir..."
Push-Location $scriptDir
try {
    npm install --silent 2>$null
    Write-Ok "Dependencies installed"
} catch {
    Write-Err "npm install failed: $_"
}

# ── 4. Link globally ─────────────────────────────────────────────────────────
Write-Step "Linking dm/dmcode commands globally..."
try {
    npm install -g . --silent 2>$null
    Write-Ok "Global commands installed (dm, dmcode, dm-code, annihilator)"
} catch {
    Write-Warn "Global install failed. Trying npm link..."
    try {
        npm link --silent 2>$null
        Write-Ok "Commands linked globally via npm link"
    } catch {
        Write-Warn "npm link failed. You may need to run PowerShell as Administrator."
        Write-Host "  Try: npm install -g ." -ForegroundColor DarkGray
    }
}
Pop-Location

# ── 5. Verify installation ───────────────────────────────────────────────────
Write-Step "Verifying installation..."
$dmCmd = Get-Command dmcode -ErrorAction SilentlyContinue
if ($dmCmd) {
    Write-Ok "dmcode command available at: $(($dmCmd).Source)"
} else {
    $dmAlt = Get-Command dm -ErrorAction SilentlyContinue
    if ($dmAlt) {
        Write-Ok "dm command available at: $(($dmAlt).Source)"
    } else {
        Write-Warn "Commands not found in PATH. You may need to restart your terminal."
        Write-Host "  Or add npm's global bin to your PATH:" -ForegroundColor DarkGray
        $npmPrefix = npm prefix -g
        Write-Host "  $npmPrefix" -ForegroundColor DarkGray
    }
}

# ── 6. API key setup ─────────────────────────────────────────────────────────
if (-not $SkipKeySetup) {
    Write-Host ""
    Write-Host "  API Key Setup" -ForegroundColor White
    Write-Host "  ─────────────────────────────────────────────────────────" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  DM Code needs at least one API key to power Annihilator."
    Write-Host ""
    Write-Host "  Free providers (no credit card required):" -ForegroundColor DarkGray
    Write-Host "    Google AI:   https://aistudio.google.com/app/apikey" -ForegroundColor DarkGray
    Write-Host "    Groq:        https://console.groq.com/keys" -ForegroundColor DarkGray
    Write-Host "    Anthropic:   https://console.anthropic.com" -ForegroundColor DarkGray
    Write-Host "    Mistral:     https://console.mistral.ai/api-keys" -ForegroundColor DarkGray
    Write-Host ""

    $apiKey = Read-Host "  Paste your API key (or press Enter to skip)"
    if ($apiKey) {
        $provider = Read-Host "  Which provider? (google/groq/anthropic/mistral)"
        if ($provider -and $apiKey) {
            try {
                node "$scriptDir\bin\dm.js" keys set $provider $apiKey 2>$null
                Write-Ok "API key saved for $provider"
            } catch {
                Write-Warn "Could not save key automatically."
                Write-Host "  Set it manually: dmcode keys set $provider YOUR_KEY" -ForegroundColor DarkGray
            }
        }
    } else {
        Write-Warn "No key entered. Set one later with: dmcode keys set google YOUR_KEY"
    }
}

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ✓ DM Code installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "  Run " -NoNewline; Write-Host "dmcode" -ForegroundColor DarkYellow -NoNewline; Write-Host " to start, or " -NoNewline; Write-Host "dmcode --help" -ForegroundColor DarkYellow -NoNewline; Write-Host " for options."
Write-Host "  Run " -NoNewline; Write-Host "dmcode setup" -ForegroundColor DarkYellow -NoNewline; Write-Host " for guided first-time configuration."
Write-Host ""
