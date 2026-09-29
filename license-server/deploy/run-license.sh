#!/bin/bash
# Exec wrapper for systemd --user (and manual start).
set -euo pipefail
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
fi
export PATH="$HOME/bin:${PATH:-/usr/bin:/bin}"
cd "$HOME/ivplayer/license-server"
exec node index.mjs
