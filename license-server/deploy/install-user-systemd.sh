#!/bin/bash
# Bind the user-mode license process to systemd --user (no sudo).
# Requires lingering (already on for zhenon). Re-run after unit file changes.
set -euo pipefail
UNIT_SRC="$HOME/ivplayer/license-server/deploy/ivplayer-license.user.service"
UNIT_DST="$HOME/.config/systemd/user/ivplayer-license.service"
RUNNER="$HOME/ivplayer/license-server/deploy/run-license.sh"

test -f "$UNIT_SRC"
test -f "$RUNNER"
chmod +x "$RUNNER" "$HOME/ivplayer/license-server/deploy/restart-license.sh"
mkdir -p "$HOME/.config/systemd/user" "$HOME/.config/ivplayer"
cp "$UNIT_SRC" "$UNIT_DST"

systemctl --user daemon-reload
systemctl --user enable ivplayer-license.service

# Drop leftover nohup so port 8787 is free for the unit.
if command -v fuser >/dev/null 2>&1; then
  fuser -k 8787/tcp 2>/dev/null || true
fi
pkill -f "/home/zhenon/ivplayer/license-server/index.mjs" 2>/dev/null || true
pkill -f "ivplayer/license-server/index.mjs" 2>/dev/null || true
sleep 1

systemctl --user restart ivplayer-license.service
sleep 1
systemctl --user --no-pager --full status ivplayer-license.service | head -n 25
curl -sS --max-time 5 http://127.0.0.1:8787/v1/health
echo
echo "enabled=$(systemctl --user is-enabled ivplayer-license.service)"
echo "active=$(systemctl --user is-active ivplayer-license.service)"
