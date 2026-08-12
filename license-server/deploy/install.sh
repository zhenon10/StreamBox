#!/usr/bin/env bash
# Run ON the Ubuntu server. Does not modify other nginx vhosts.
# Usage (from repo root on the server):
#   sudo bash license-server/deploy/install.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LICENSE_SRC="$ROOT/license-server"
SITE_SRC="$ROOT/public-site"
DEST_APP="/opt/ivplayer/license-server"
DEST_WWW="/var/www/ivplayer.tr"
ENV_FILE="/etc/ivplayer-license.env"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js yok. Örnek: curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs"
  exit 1
fi

mkdir -p "$DEST_APP" "$DEST_WWW"
rsync -a --delete --exclude data/licenses.json --exclude deploy/ivplayer-license.env.example \
  "$LICENSE_SRC/" "$DEST_APP/"
# Keep existing licenses.json if present
if [[ ! -f "$DEST_APP/data/licenses.json" && -f "$LICENSE_SRC/data/licenses.json" ]]; then
  mkdir -p "$DEST_APP/data"
  cp "$LICENSE_SRC/data/licenses.json" "$DEST_APP/data/licenses.json"
fi
cp -a "$SITE_SRC/." "$DEST_WWW/"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$LICENSE_SRC/deploy/ivplayer-license.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "Created $ENV_FILE — edit LICENSE_ADMIN_KEY before going public."
fi

cp "$LICENSE_SRC/deploy/ivplayer-license.service" /etc/systemd/system/ivplayer-license.service
systemctl daemon-reload
systemctl enable ivplayer-license
systemctl restart ivplayer-license
sleep 1
systemctl --no-pager --full status ivplayer-license | head -n 20

if command -v nginx >/dev/null 2>&1; then
  cp "$LICENSE_SRC/deploy/nginx-license.ivplayer.tr.conf" /etc/nginx/sites-available/license.ivplayer.tr
  cp "$LICENSE_SRC/deploy/nginx-ivplayer.tr.conf" /etc/nginx/sites-available/ivplayer.tr
  ln -sfn /etc/nginx/sites-available/license.ivplayer.tr /etc/nginx/sites-enabled/license.ivplayer.tr
  ln -sfn /etc/nginx/sites-available/ivplayer.tr /etc/nginx/sites-enabled/ivplayer.tr
  nginx -t
  systemctl reload nginx
  echo "nginx: added license.ivplayer.tr and ivplayer.tr (other sites unchanged)"
else
  echo "nginx yok; API şimdilik http://127.0.0.1:8787 (dışarı açma)."
fi

echo
echo "Local health:"
curl -sS http://127.0.0.1:8787/v1/health || true
echo
echo "DNS oturunca: sudo certbot --nginx -d license.ivplayer.tr -d ivplayer.tr -d www.ivplayer.tr"
