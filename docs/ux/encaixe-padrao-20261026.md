# Foto entra inteira no quadro (Encaixar como padrão) — 26/10/2026

Pedido do Pablo, com o print de uma captura de tela comprida cortada na miniatura: "Eu já tinha pedido para ficar ocupando a tela toda pré-definido, assim quando colocamos as fotos não tem perigo de ficar coisa escondida. Aí fica facultativo o zoom no enquadramento."

Tarefa humana: cadastrar a foto sem perder nada dela; ajustar só quando quiser.

Skill aplicada: `.claude/skills/tenkiter-estetica-humana/SKILL.md`. Evidência: `encaixe-padrao-20261026/encaixe-390.png`, que mostra uma captura 9:19 inteira (com a faixa do topo visível) ao lado de uma foto que já era 4:5, e `enquadrar-encaixar-390.png`.

## Como ficou
- **Foto nova** (cadastro de um produto e de vários): se não estiver em 4:5, entra **inteira** num JPEG 1080×1350, o quadro do site. As sobras dos lados ou de cima e de baixo são preenchidas com o fundo desfocado da própria foto. Antes o site cortava ao meio o que passasse do quadro.
- Foto que **já está em 4:5** fica como veio.
- **✂ Enquadrar** abre a foto original já em "Encaixar". Zoom, corte, giro e posição são opcionais. Ao ajustar, aparecem o selo "✂ ajustada" e "Voltar à original", que leva de volta à foto encaixada padrão, já enviada, sem subir nada de novo.
- O encaixe automático não mostra selo, porque é o padrão.
- A dica do passo 1 explica: "Cada foto entra inteira no quadro do site, sem nada cortado".
- Fotos de peças **já cadastradas** não mudam sozinhas. Para uma delas ficar inteira, use ✂ Enquadrar → Encaixar → Usar.

Testes: `encaixe_padrao` (novo, 12: tamanho, faixa do topo visível pixel a pixel, fundo desfocado, 4:5 intacta, pré-envio, Enquadrar opcional, voltar, modo vários), `enquadrar_cadastro` (61), `enquadrar_lote`, `pre_envio`, `instagram_admin`, `capa_video`, `cadastro_tipos`, `consultar_valor` e `cadastro_plano_mestre`.

Resultado: APROVADO. Não foi visto num Android real.
