#!/usr/bin/env bash
# Garante ffmpeg e ffprobe nos testes (vídeo de teste, áudio OGG, Story).
# Primeiro pelo apt (resistente a repositório de terceiros fora do ar); se nem assim, um ffmpeg estático.
set -u
if command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null; then exit 0; fi
if bash "$(dirname "$0")/apt_seguro.sh" && sudo apt-get install -y ffmpeg; then exit 0; fi
echo "::warning::ffmpeg pelo apt falhou; baixando o ffmpeg estático"
set -e
tmp=$(mktemp -d)
curl -fsSL --retry 3 https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o "$tmp/f.tar.xz"
tar -xJf "$tmp/f.tar.xz" -C "$tmp"
sudo install -m 755 "$tmp"/ffmpeg-*-static/ffmpeg "$tmp"/ffmpeg-*-static/ffprobe /usr/local/bin/
ffmpeg -version | head -1
