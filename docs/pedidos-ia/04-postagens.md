# 04-postagens — POSTAGENS (P-19, P-22)

Leia antes `INSTRUCOES-IA.md` (raiz) e as regras do `CLAUDE.md` que tocam estes arquivos.

**P-19 · Indicador de envio mais completo**: no painel, para cada postagem mostrar fase (enviando mídia → criando → aguardando Instagram/WhatsApp → publicado), tempo na fase e, em "Aguardando confirmação" (Wafly 409), quando será a próxima consulta e o limite de 30 min. **+ Modelo de Colagem por aparelho**: hoje `tk_po_col_v1` = `{l,fundo,gap,rd,aj}` global; lembrar o modelo por TIPO (Story/Feed) separado.
**P-22 · Story em vídeo MP4/H.264**: escolha o melhor `mimeType` via `MediaRecorder.isTypeSupported` (`video/mp4;codecs=avc1` antes de webm) e melhore o parecer (nunca prometer). A conversão externa (Cloudinary) **NÃO implemente**: só descreva no relatório. `story_video.py` precisa de ffmpeg.

## Testes do setor
`postagens_admin.py`, `postagens_avulsas.py`, `postagens_colagem.py`, `postagens_elementos.py`, `postagens_elementos_fotos.py`, `postagens_fila.py`, `postagens_multi.py`, `postagens_terminou.py`, `postagens_texto_foto.py`, `postagens_toque.py`, `postagens_v425.py`, `postagens_v49.py`, `visual_v58.py`, `visual_v59.py`, `visual_v60.py`, `editor_toque.py`, `editor_visual.py`, `story_video.py`, `worker_ig.js`, `worker_canal.js`
