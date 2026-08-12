#!/bin/bash
set -euo pipefail
ENV_FILE="$HOME/.config/ivplayer/license.env"
mkdir -p "$(dirname "$ENV_FILE")"
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$HOME/ivplayer/license-server/deploy/ivplayer-license.env.example" "$ENV_FILE"
fi
KEY="$(openssl rand -hex 24)"
if grep -q '^LICENSE_ADMIN_KEY=' "$ENV_FILE"; then
  sed -i "s/^LICENSE_ADMIN_KEY=.*/LICENSE_ADMIN_KEY=${KEY}/" "$ENV_FILE"
else
  echo "LICENSE_ADMIN_KEY=${KEY}" >> "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"

export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1090
. "$NVM_DIR/nvm.sh"
set -a
# shellcheck disable=SC1091
. "$ENV_FILE"
set +a

pkill -f "/home/zhenon/ivplayer/license-server/index.mjs" 2>/dev/null || true
pkill -f "ivplayer/license-server/index.mjs" 2>/dev/null || true
sleep 1
cd "$HOME/ivplayer/license-server"
nohup node index.mjs >> "$HOME/.config/ivplayer/license.log" 2>&1 &
sleep 1
curl -sS http://127.0.0.1:8787/v1/health
echo
echo "ADMIN_KEY=${KEY}"
