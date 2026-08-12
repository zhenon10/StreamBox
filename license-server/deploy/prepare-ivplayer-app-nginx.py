#!/usr/bin/env python3
"""Prepare patched nginx vhosts for ivplayer.tr /app + license redirect."""
from pathlib import Path

OUT = Path.home() / "ivplayer" / "deploy-ready"
OUT.mkdir(parents=True, exist_ok=True)

ivp = Path("/etc/nginx/sites-available/ivplayer.tr").read_text()
if "location /app/" not in ivp:
    block = (
        "\n"
        "    location = /app {\n"
        "        return 302 /app/;\n"
        "    }\n"
        "\n"
        "    location /app/ {\n"
        "        try_files $uri $uri/ /app/index.html;\n"
        "    }\n"
        "\n"
    )
    marker = "    location / {\n"
    idx = ivp.find(marker)
    if idx < 0:
        raise SystemExit("ivplayer.tr: location / not found")
    ivp = ivp[:idx] + block + ivp[idx:]
(OUT / "ivplayer.tr").write_text(ivp)

lic = Path("/etc/nginx/sites-available/license.ivplayer.tr").read_text()
if "ivplayer.tr$request_uri" not in lic:
    block = (
        "\n"
        "    # Web player moved to apex\n"
        "    location /app {\n"
        "        return 301 https://ivplayer.tr$request_uri;\n"
        "    }\n"
        "\n"
    )
    marker = "    location / {\n"
    idx = lic.find(marker)
    if idx < 0:
        raise SystemExit("license.ivplayer.tr: location / not found")
    lic = lic[:idx] + block + lic[idx:]
(OUT / "license.ivplayer.tr").write_text(lic)

apply = OUT / "apply.sh"
apply.write_text(
    """#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%Y%m%d%H%M%S)
cp -a /etc/nginx/sites-available/ivplayer.tr "/etc/nginx/sites-available/ivplayer.tr.bak.$STAMP"
cp -a /etc/nginx/sites-available/license.ivplayer.tr "/etc/nginx/sites-available/license.ivplayer.tr.bak.$STAMP"
cp /home/zhenon/ivplayer/deploy-ready/ivplayer.tr /etc/nginx/sites-available/ivplayer.tr
cp /home/zhenon/ivplayer/deploy-ready/license.ivplayer.tr /etc/nginx/sites-available/license.ivplayer.tr
nginx -t
systemctl reload nginx
echo OK
curl -sSI https://ivplayer.tr/app/ | head -n 8
curl -sSI https://ivplayer.tr/app/channels | head -n 8
curl -sSI https://license.ivplayer.tr/app/ | head -n 10
"""
)
apply.chmod(0o755)
print(f"Wrote {OUT}/ivplayer.tr")
print(f"Wrote {OUT}/license.ivplayer.tr")
print(f"Run: sudo bash {apply}")
