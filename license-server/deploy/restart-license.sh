#!/bin/bash
set -euo pipefail
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
ENV_FILE="$HOME/.config/ivplayer/license.env"
set -a
. "$ENV_FILE"
set +a

# Stop whatever holds 8787
if command -v fuser >/dev/null 2>&1; then
  fuser -k 8787/tcp 2>/dev/null || true
fi
pkill -f "/home/zhenon/ivplayer/license-server/index.mjs" 2>/dev/null || true
sleep 1

cd "$HOME/ivplayer/license-server"
nohup node index.mjs >> "$HOME/.config/ivplayer/license.log" 2>&1 &
sleep 1
curl -sS http://127.0.0.1:8787/v1/health
echo
# Confirm the live process has a non-example admin key (do not print it)
PID=$(ss -lntp | awk '/:8787/{print}' | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1)
if [[ -n "${PID:-}" ]]; then
  KEY=$(tr '\0' '\n' < "/proc/$PID/environ" | sed -n 's/^LICENSE_ADMIN_KEY=//p')
  if [[ "$KEY" == "change-me-to-a-long-random-secret" || "$KEY" == "ivplayer-admin" ]]; then
    echo "WARN: process still using placeholder admin key"
  else
    echo "ADMIN_KEY_LOADED=yes len=${#KEY}"
  fi
fi
