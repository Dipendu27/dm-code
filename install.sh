#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  DM Code — Universal Install Script
#  Supports: macOS (Intel & Apple Silicon), Linux (x64/arm64)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BOLD="\033[1m"
CYAN="\033[0;36m"
GREEN="\033[0;32m"
ORANGE="\033[0;33m"
RED="\033[0;31m"
DIM="\033[2m"
RESET="\033[0m"

banner() {
  echo ""
  echo -e "${ORANGE}${BOLD}  ██████╗ ███╗   ███╗     ██████╗ ██████╗ ██████╗ ███████╗${RESET}"
  echo -e "${ORANGE}${BOLD}  ██╔══██╗████╗ ████║    ██╔════╝██╔═══██╗██╔══██╗██╔════╝${RESET}"
  echo -e "${ORANGE}${BOLD}  ██║  ██║██╔████╔██║    ██║     ██║   ██║██║  ██║█████╗  ${RESET}"
  echo -e "${ORANGE}${BOLD}  ██║  ██║██║╚██╔╝██║    ██║     ██║   ██║██║  ██║██╔══╝  ${RESET}"
  echo -e "${ORANGE}${BOLD}  ██████╔╝██║ ╚═╝ ██║    ╚██████╗╚██████╔╝██████╔╝███████╗${RESET}"
  echo -e "${ORANGE}${BOLD}  ╚═════╝ ╚═╝     ╚═╝     ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝${RESET}"
  echo ""
  echo -e "${DIM}  Installer — powered by Annihilator${RESET}"
  echo ""
}

step() { echo -e "${CYAN}${BOLD}  →${RESET} $1"; }
ok()   { echo -e "${GREEN}  ✓${RESET} $1"; }
err()  { echo -e "${RED}  ✗ ERROR:${RESET} $1"; exit 1; }
warn() { echo -e "${ORANGE}  ⚠${RESET} $1"; }

banner

# ── 1. Detect OS & Architecture ─────────────────────────────────────────────
step "Detecting system..."
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    OS_LABEL="macOS"
    ;;
  Linux)
    OS_LABEL="Linux"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    OS_LABEL="Windows (WSL/Git Bash)"
    warn "On native Windows, use install.ps1 instead for best experience."
    ;;
  *)
    warn "Unknown OS: $OS. Continuing anyway…"
    OS_LABEL="$OS"
    ;;
esac
ok "${OS_LABEL} ${ARCH} detected"

# ── 2. Check / install Node.js ≥ 20 ─────────────────────────────────────────
step "Checking Node.js…"

install_node() {
  if [[ "$OS" == "Darwin" ]]; then
    # macOS — use Homebrew
    if ! command -v brew &>/dev/null; then
      step "Installing Homebrew…"
      /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
      # Add brew to PATH for Apple Silicon
      if [[ -f /opt/homebrew/bin/brew ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
      fi
      ok "Homebrew installed"
    fi
    step "Installing Node.js via Homebrew…"
    brew install node
  elif [[ "$OS" == "Linux" ]]; then
    # Linux — detect package manager
    if command -v apt-get &>/dev/null; then
      step "Installing Node.js via apt (NodeSource)…"
      curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
      sudo apt-get install -y nodejs
    elif command -v dnf &>/dev/null; then
      step "Installing Node.js via dnf…"
      sudo dnf install -y nodejs
    elif command -v yum &>/dev/null; then
      step "Installing Node.js via yum…"
      curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
      sudo yum install -y nodejs
    elif command -v pacman &>/dev/null; then
      step "Installing Node.js via pacman…"
      sudo pacman -S --noconfirm nodejs npm
    elif command -v brew &>/dev/null; then
      step "Installing Node.js via Homebrew (Linuxbrew)…"
      brew install node
    else
      err "Could not detect a package manager. Please install Node.js ≥ 20 manually from https://nodejs.org"
    fi
  else
    err "Cannot auto-install Node.js on this OS. Please install Node.js ≥ 20 from https://nodejs.org"
  fi
}

if ! command -v node &>/dev/null; then
  install_node
else
  NODE_VER=$(node --version | sed 's/v//')
  NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
  if [[ "$NODE_MAJOR" -lt 20 ]]; then
    warn "Node.js ${NODE_VER} is too old (need ≥ 20). Upgrading…"
    install_node
  fi
fi
ok "Node.js $(node --version) — $(which node)"

# ── 3. Ensure brew is on PATH (macOS Apple Silicon) ──────────────────────────
if [[ "$OS" == "Darwin" && -f /opt/homebrew/bin/brew ]]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# ── 4. Install npm dependencies ─────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
step "Installing npm dependencies in ${SCRIPT_DIR}…"
cd "$SCRIPT_DIR"
npm install --silent
ok "Dependencies installed"

# ── 5. Link the dm/dmcode binary globally ────────────────────────────────────
step "Linking dm/dmcode commands globally…"
npm link --silent 2>/dev/null || {
  warn "npm link failed (may need sudo). Trying with sudo…"
  sudo npm link --silent
}

# Verify which commands are available
for cmd in dmcode dm dm-code annihilator; do
  if command -v "$cmd" &>/dev/null; then
    ok "$cmd → $(which $cmd)"
  fi
done

# ── 6. API key setup ────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}  API Key Setup${RESET}"
echo -e "${DIM}  ─────────────────────────────────────────────────────────${RESET}"
echo ""
echo "  DM Code needs at least one API key to power Annihilator."
echo ""
echo "  Free providers (no credit card required):"
echo -e "  ${DIM}  Google AI:   https://aistudio.google.com/app/apikey${RESET}"
echo -e "  ${DIM}  Groq:        https://console.groq.com/keys${RESET}"
echo -e "  ${DIM}  Anthropic:   https://console.anthropic.com${RESET}"
echo -e "  ${DIM}  Mistral:     https://console.mistral.ai/api-keys${RESET}"
echo ""

read -r -p "  Paste your API key (or press Enter to set it later): " API_KEY
echo ""

if [[ -n "$API_KEY" ]]; then
  read -r -p "  Which provider? (google/groq/anthropic/mistral): " PROVIDER
  if [[ -n "$PROVIDER" ]]; then
    node bin/dm.js keys set "$PROVIDER" "$API_KEY" 2>/dev/null && \
      ok "API key saved for $PROVIDER" || \
      warn "Could not save key. Set it manually: dmcode keys set $PROVIDER YOUR_KEY"
  fi
else
  warn "No key entered. Set it later with:  dmcode keys set google YOUR_KEY"
fi

# ── 7. Shell profile hint ───────────────────────────────────────────────────
SHELL_PROFILE=""
if [[ -f ~/.zshrc ]]; then SHELL_PROFILE="~/.zshrc"
elif [[ -f ~/.bash_profile ]]; then SHELL_PROFILE="~/.bash_profile"
elif [[ -f ~/.bashrc ]]; then SHELL_PROFILE="~/.bashrc"
fi

if [[ -n "$SHELL_PROFILE" ]]; then
  echo ""
  echo -e "${DIM}  Tip: Add API keys to ${SHELL_PROFILE} for persistence:${RESET}"
  echo -e "${DIM}       export GOOGLE_API_KEY=\"AIzaSy...\"${RESET}"
  echo -e "${DIM}       export ANTHROPIC_API_KEY=\"sk-ant-...\"${RESET}"
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}  ✓ DM Code installed successfully!${RESET}"
echo ""
echo -e "  Run ${ORANGE}${BOLD}dmcode${RESET} to start, or ${ORANGE}${BOLD}dmcode --help${RESET} for options."
echo -e "  Run ${ORANGE}${BOLD}dmcode setup${RESET} for guided first-time configuration."
echo ""
