#!/bin/bash
# Apply www → apex redirect. Run on VPS:
#   sudo bash ~/ivplayer/license-server/deploy/apply-ivplayer-www-redirect.sh
set -euo pipefail
SRC="${1:-/home/zhenon/ivplayer/license-server/deploy/nginx-ivplayer.tr.live.conf}"
DEST=/etc/nginx/sites-available/ivplayer.tr
cp -a "$DEST" "${DEST}.bak.$(date +%Y%m%d%H%M%S)"
cp "$SRC" "$DEST"
nginx -t
systemctl reload nginx
echo "www → https://ivplayer.tr applied"
