#!/usr/bin/env bash
# Conversor isolado: não publica nem modifica a fila.
set -euo pipefail
[ "$#" -eq 2 ] || { echo "Uso: transcode.sh entrada.mp4 saida.mp4" >&2; exit 2; }
entrada="$1"; saida="$2"
[ -f "$entrada" ] || { echo "Arquivo de entrada inexistente" >&2; exit 2; }
[ "$entrada" != "$saida" ] || { echo "Entrada e saída devem ser diferentes" >&2; exit 2; }
codec="$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=nw=1:nk=1 "$entrada")"
[ -n "$codec" ] || { echo "Video sem faixa de imagem" >&2; exit 2; }
# Limites conservadores: evitar uso descontrolado do runner.
tamanho="$(stat -c%s "$entrada")"
[ "$tamanho" -le 12582912 ] || { echo "Arquivo acima de 12 MiB" >&2; exit 2; }
duracao="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$entrada")"
awk -v d="$duracao" 'BEGIN { exit !(d > 0 && d <= 180) }' || { echo "Duracao fora do limite (180s)" >&2; exit 2; }
ffmpeg -nostdin -hide_banner -loglevel error -i "$entrada" -map 0:v:0 -map 0:a:0? -c:v libx264 -preset veryfast -crf 25 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k -max_muxing_queue_size 1024 -y "$saida"
novo="$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=nw=1:nk=1 "$saida")"
[ "$novo" = h264 ] || { echo "Saida nao e H264" >&2; exit 1; }
test -s "$saida"
