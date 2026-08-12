#!/usr/bin/env bash
# Add /app/ SPA location to live ivplayer.tr nginx vhost.
# Redirect license.ivplayer.tr/app → https://ivplayer.tr/app/
# Usage: sudo bash license-server/deploy/patch-ivplayer-app-location.sh
set -euo pipefail

IVP="/etc/nginx/sites-available/ivplayer.tr"
LIC="/etc/nginx/sites-available/license.ivplayer.tr"
STAMP="$(date +%Y%m%d%H%M%S)"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo."
  exit 1
fi

cp -a "$IVP" "${IVP}.bak.${STAMP}"
cp -a "$LIC" "${LIC}.bak.${STAMP}"

python3 - <<'PY'
from pathlib import Path

ivp = Path("/etc/nginx/sites-available/ivplayer.tr")
text = ivp.read_text()
if "location /app/" in text:
    print("ivplayer.tr: /app/ already present")
else:
    block = """
    location = /app {
        return 302 /app/;
    }

    location /app/ {
        try_files $uri $uri/ /app/index.html;
    }

"""
    # Insert before first "location / {" inside the HTTPS (or main) server that has root.
    marker = "    location / {\n"
    idx = text.find(marker)
    if idx < 0:
        raise SystemExit("ivplayer.tr: could not find location / {")
    text = text[:idx] + block + text[idx:]
    ivp.write_text(text)
    print("ivplayer.tr: inserted /app/ SPA location")

lic = Path("/etc/nginx/sites-available/license.ivplayer.tr")
text = lic.read_text()
if "location /app {" in text and "ivplayer.tr$request_uri" in text:
    print("license.ivplayer.tr: /app redirect already present")
else:
    block = """
    # Web player moved to apex
    location /app {
        return 301 https://ivplayer.tr$request_uri;
    }

"""
    # Prefer before catch-all proxy location /
    marker = "    location / {\n"
    # Find the last occurrence in the HTTPS server (file usually has one HTTPS + one HTTP)
    # Insert before the first proxy catch-all that is not stream-proxy.
    idx = -1
    search_from = 0
    while True:
        i = text.find(marker, search_from)
        if i < 0:
            break
        # skip if this is somehow nested oddly; take first "location / {" after stream-proxy block
        window = text[max(0, i - 200) : i]
        if "stream-proxy" not in window:
            idx = i
            break
        # if immediately after stream-proxy closing, still OK to use first location /
        idx = i
        break
    if idx < 0:
        raise SystemExit("license.ivplayer.tr: could not find location / {")
    text = text[:idx] + block + text[idx:]
    lic.write_text(text)
    print("license.ivplayer.tr: inserted /app → ivplayer.tr redirect")
PY

nginx -t
systemctl reload nginx
echo "OK — verify:"
echo "  curl -sSI https://ivplayer.tr/app/ | head -n 15"
echo "  curl -sSI https://license.ivplayer.tr/app/ | head -n 10"
