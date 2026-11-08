# Revisão visual — abas de Postagens e Avisos (08/11/2026)

Chromium com serviços simulados; **não validado em Android real**.

- Defeito (7.61.0, produção): cada aba ficou com a largura da tela (358 px no celular, 728 px no computador); só "Nova postagem" aparecia. Causa: o módulo tem `button{width:100%}` e a regra única `.tk-abas` não fixava a largura.
- Correção: `width:auto; max-width:none` na regra única das abas (`janelas.css`). Postagens agora mostra Nova postagem, Vídeos, Fila, Postar à mão, Fotos de clientes, Já postadas, Regras e Visuais, com rolagem lateral só quando não cabem; Avisos mostra suas 4 abas.
- Capturas: `postagens-390.jpg`, `postagens-1440.jpg`. Teste: `tests/abas_visiveis.py` (12 verificações; falha sem a correção).
