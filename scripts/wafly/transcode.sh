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
# Perfil conservador para grupos WhatsApp: 29 s, 9,5 MiB e MP4 H.264/AAC.
# Taxa total ~2,6 Mb/s mantém margem para overhead do contêiner.
ffmpeg -nostdin -hide_banner -loglevel error -i "$entrada" -t 29 \\
  -map 0:v:0 -map 0:a:0? -vf 'scale=trunc(iw*min(1\\,720/iw\\,1280/ih)/2)*2:trunc(ih*min(1\\,720/iw\\,1280/ih)/2)*2' \\
  -c:v libx264 -preset veryfast -b:v 2300k -maxrate 2450k -bufsize 4900k \\
  -pix_fmt yuv420p -r 30 -movflags +faststart -c:a aac -b:a 96k \\
  -max_muxing_queue_size 1024 -y "$saida"
# Não libera arquivo fora do contrato da integração.
bytes="$(stat -c%s "$saida")"
[ "$bytes" -le 9961472 ] || { echo "Saida acima de 9,5 MiB" >&2; exit 1; }
segundos="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$saida")"
awk -v d="$segundos" 'BEGIN { exit !(d > 0 && d <= 29.0) }' || { echo "Saida acima de 29 segundos" >&2; exit 1; }
novo="$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=nw=1:nk=1 "$saida")"
[ "$novo" = h264 ] || { echo "Saida nao e H264" >&2; exit 1; }
test -s "$saida"
