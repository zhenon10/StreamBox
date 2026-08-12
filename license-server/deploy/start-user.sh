#!/bin/bash
set -euo pipefail
export NVM_DIR="$HOME/.nvm"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
fi
# shellcheck disable=SC1090
. "$NVM_DIR/nvm.sh"
nvm install 20
nvm alias default 20
cd "$HOME/ivplayer/license-server"
export LICENSE_PORT=8787
export LICENSE_BIND=127.0.0.1
# Keep default admin key until user sets env file; do not print it.
mkdir -p "$HOME/.config/ivplayer"
if [[ ! -f "$HOME/.config/ivplayer/license.env" ]]; then
  cp "$HOME/ivplayer/license-server/deploy/ivplayer-license.env.example" "$HOME/.config/ivplayer/license.env"
fi
set -a
# shellcheck disable=SC1091
. "$HOME/.config/ivplayer/license.env"
set +a
pkill -f "ivplayer/license-server/index.mjs" 2>/dev/null || true
nohup node index.mjs >> "$HOME/.config/ivplayer/license.log" 2>&1 &
sleep 1
curl -sS http://127.0.0.1:8787/v1/health || true
echo
echo "PID $(pgrep -f 'ivplayer/license-server/index.mjs' || true)"
echo "Node $(node -v)"
echo "NEXT: sudo for nginx (password required on this host)"
