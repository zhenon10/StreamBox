#!/bin/bash
# Install a static ffmpeg binary into ~/bin (no sudo).
# Usage: bash ~/ivplayer/license-server/deploy/install-ffmpeg-user.sh
set -euo pipefail
mkdir -p "$HOME/bin"
if [[ -x "$HOME/bin/ffmpeg" ]]; then
  "$HOME/bin/ffmpeg" -version | head -1
  exit 0
fi
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
curl -fsSL -o ffmpeg.tar.xz "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
tar -xJf ffmpeg.tar.xz
SRC=$(ls -1d ffmpeg-*-amd64-static | head -1)
cp "$SRC/ffmpeg" "$HOME/bin/ffmpeg"
chmod +x "$HOME/bin/ffmpeg"
"$HOME/bin/ffmpeg" -version | head -2
echo "Installed: $HOME/bin/ffmpeg"
