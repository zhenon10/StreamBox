#!/bin/bash
# Patch live license.ivplayer.tr nginx vhost: access_log off for /v1/stream-proxy.
# Does not touch other sites. Requires sudo.
#   bash ~/ivplayer/license-server/deploy/patch-license-nginx-nolog.sh
set -euo pipefail

SITE="/etc/nginx/sites-available/license.ivplayer.tr"
BACKUP="/etc/nginx/sites-available/license.ivplayer.tr.bak.$(date +%Y%m%d%H%M%S)"

if [[ ! -f "$SITE" ]]; then
  echo "Missing $SITE"
  exit 1
fi

if grep -q 'location /v1/stream-proxy' "$SITE"; then
  echo "stream-proxy location already present — check access_log manually"
  sudo nginx -t
  exit 0
fi

sudo cp "$SITE" "$BACKUP"
echo "Backup: $BACKUP"

# Insert stream-proxy location before the first "location / {" inside the 443 server.
sudo python3 - <<'PY'
from pathlib import Path
path = Path("/etc/nginx/sites-available/license.ivplayer.tr")
text = path.read_text()
needle = "    location / {"
block = """    # Do not log ?url= (may contain playlist/stream credentials)
    location /v1/stream-proxy {
        access_log off;
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

"""
if needle not in text:
    raise SystemExit("Could not find location / { to patch")
# Only first occurrence (HTTPS server block)
text = text.replace(needle, block + needle, 1)
path.write_text(text)
print("Patched", path)
PY

sudo nginx -t
sudo systemctl reload nginx
echo "nginx reloaded OK"
echo "Verify: curl -sS -o /dev/null -w '%{http_code}\\n' https://license.ivplayer.tr/v1/health"
