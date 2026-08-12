#!/bin/bash
# Run on the VPS (sudo once):
#   bash ~/ivplayer/license-server/deploy/enable-ivplayer-https.sh
#
# Do not rely on public DNS for pre-checks — apex may still resolve to an old
# parking IP. Certbot HTTP-01 must hit THIS host, so A records for
# ivplayer.tr + www must be ONLY 78.189.53.159.
set -euo pipefail

EXPECTED_IP="78.189.53.159"
BAD_IP="77.245.159.230"

echo "1) Local nginx (Host header, ignores DNS)..."
code=$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: ivplayer.tr' http://127.0.0.1/privacy.html || true)
echo "   http://127.0.0.1/privacy.html (Host: ivplayer.tr) → ${code}"
if [[ "$code" != "200" ]]; then
  echo "ERROR: site not served locally. Check /var/www/ivplayer.tr and nginx site ivplayer.tr"
  exit 1
fi

echo
echo "2) DNS check (must be only ${EXPECTED_IP})..."
mapfile -t ips < <(getent ahostsv4 ivplayer.tr | awk '{print $1}' | sort -u)
echo "   ivplayer.tr → ${ips[*]:-none}"
for ip in "${ips[@]:-}"; do
  if [[ "$ip" == "$BAD_IP" ]]; then
    echo "ERROR: old parking A record ${BAD_IP} still present."
    echo "Remove it in the domain panel, wait a few minutes, then re-run."
    exit 1
  fi
done
if [[ "${#ips[@]}" -eq 0 ]]; then
  echo "ERROR: ivplayer.tr does not resolve."
  exit 1
fi
ok=0
for ip in "${ips[@]}"; do
  [[ "$ip" == "$EXPECTED_IP" ]] && ok=1
done
if [[ "$ok" -ne 1 ]]; then
  echo "ERROR: expected A ${EXPECTED_IP}, got: ${ips[*]}"
  exit 1
fi

www_ips=$(getent ahostsv4 www.ivplayer.tr | awk '{print $1}' | sort -u | tr '\n' ' ')
echo "   www.ivplayer.tr → ${www_ips}"
if echo " ${www_ips} " | grep -q " ${BAD_IP} "; then
  echo "ERROR: www still points at ${BAD_IP}. Fix DNS first."
  exit 1
fi

echo
echo "3) Issuing Let's Encrypt cert (nginx plugin)..."
if sudo certbot --nginx -d ivplayer.tr -d www.ivplayer.tr --non-interactive --agree-tos --redirect \
  --email destek@ivplayer.tr; then
  :
else
  echo "Non-interactive failed; trying interactive certbot..."
  sudo certbot --nginx -d ivplayer.tr -d www.ivplayer.tr --redirect
fi

echo
echo "4) Verify HTTPS via this server IP..."
curl -fsS -o /dev/null -w "https://ivplayer.tr/privacy.html → %{http_code}\n" \
  --resolve ivplayer.tr:443:${EXPECTED_IP} https://ivplayer.tr/privacy.html
curl -fsS -o /dev/null -w "https://ivplayer.tr/support.html → %{http_code}\n" \
  --resolve ivplayer.tr:443:${EXPECTED_IP} https://ivplayer.tr/support.html
curl -fsS -o /dev/null -w "https://www.ivplayer.tr/ → %{http_code}\n" \
  --resolve www.ivplayer.tr:443:${EXPECTED_IP} https://www.ivplayer.tr/
echo "Done."
