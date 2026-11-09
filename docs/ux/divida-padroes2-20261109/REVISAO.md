# Revisão visual — dívida de padrões (7.66.0)

Escopo: nenhuma mudança visual pretendida. Laranja literal passou a `var(--laranja, #E67E22)` (mesmo valor, com fallback); z-index não mudou; um `alert()` virou aviso padrão.

Evidência (Chromium, serviços simulados; NÃO é Android):
- Cor renderizada idêntica: botão "Desfazer" do `TKAviso` = `rgb(230, 126, 34)` antes e depois; teste de estilo computado das 4 declarações trocadas (`background`, `border-color`, `box-shadow inset 3px`, `box-shadow 0 0 0 2px`) igual com literal e com `var(--laranja, #E67E22)`.
- Capturas antes (main 7.64.0) e depois, 390 e 1440 px: `index-*` e `curriculo-*`. A comparação pixel a pixel tem ruído que também aparece comparando main com main (fotos do catálogo carregam da API ao vivo em tempo diferente); cabeçalho, avisos e barra inferior ficam idênticos.
- Telas de gestão (admin) exigem login simulado: a troca ali é só `box-shadow` de realce (admin-mensagens.js:447, admin-postagens.js:187), coberta pelo teste de estilo computado.
- Alvos de toque, foco, layout e camadas: não tocados.
