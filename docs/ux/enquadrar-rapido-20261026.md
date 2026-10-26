# Enquadrar abrindo mais rápido — 26/10/2026

Pedido do Pablo: "O botão enquadrar está demorando muito em abrir, investigue, conserte e faça deploy."

## O que foi medido
O teste usou o painel com um catálogo do tamanho real (540 peças, cerca de 25 mil elementos na página), o processador simulado 6 vezes mais lento (como um Android simples) e a mesma foto de uma peça publicada (141 KB). O tempo vai do toque em "✂ Enquadrar" até a foto aparecer pronta para mexer.

- **Antes:** cerca de 1,4 a 1,5 s, com um bloqueio de 600 a 700 ms em que a tela fica parada.
- **Depois:** cerca de 0,7 s. O desenho inicial caiu de 418 ms para 95 ms.

As fotos do catálogo são leves (56 a 141 KB, no tenkiter-midia, com CORS liberado), então a internet não era a causa.

## Causas e correções
1. **Foto decodificada no primeiro desenho.** O navegador decodificava a foto de forma síncrona dentro do primeiro `drawImage`, levando cerca de 250 ms com a tela parada. Agora a foto vira um `ImageBitmap` (`createImageBitmap`), decodificado fora da tela antes de desenhar. Em navegador sem esse recurso, segue o caminho antigo.
2. **Fundo desfocado refeito a cada quadro.** A foto inteira era reduzida duas vezes por quadro. Agora a miniatura do fundo é feita uma vez por foto.
3. **Rolagem do documento travada ao abrir.** Isso refazia o layout da página inteira. Agora a janela segura a própria rolagem (`overscroll-behavior`), como as outras janelas do painel.
4. **Vigias da página inteira** (valem para todo o painel, não só o Enquadrar):
   - `a11y.js` (todas as páginas): varria a página inteira a cada mudança, até uma troca de texto. Agora só olha onde entrou elemento novo.
   - Ícones dos títulos de janela: só reagem quando uma janela abre ou um título muda.
   - Grupos de ferramentas: antes, a cada mudança de classe em qualquer lugar, recalculavam o estilo da página inteira; agora olham só a área das ferramentas.

O comportamento e o visual não mudaram.

Testes:
- Enquadrar: `enquadrar_cadastro` (61), `enquadrar_lote`.
- Acessibilidade em 24 telas: `axe_telas_a` e `axe_telas_b`, sem nenhum problema.
- Telas e jornadas: `novas_telas` (62), `admin_categorias` (80), `postagens_admin` (105), `contas_cpf` (38), `manual_rico` (51), `foto_cliente` (15), `x_equipe` (28), `central_avisos`, `selecao_vida`.
- Mensagens e cadastro: todos passaram.

Limitação: medido com o processador simulado mais lento, não num Android real.
