# Seleção de vídeos para Status — 7.30.2

Tarefa: descobrir a incompatibilidade ao escolher o arquivo, antes de ele entrar na lista de postagem. A referência anterior é a captura enviada pelo proprietário, com dois vídeos longos listados e rótulo de 40 MB.

A validação de 7.30.1 ocorria somente no envio. Agora as entradas Livre, avulsas, vídeo do aparelho e resultado convertido conferem os limites de Status antes de adicionar o arquivo. A troca de destinos confere os vídeos existentes, avisa e preserva o rascunho; a defesa no envio permanece ativa. O rótulo usa 30 s/10 MB quando há Status selecionado.

Jornada Playwright com APIs simuladas em 390×844, 412×915, 1440×900 e 320×700: dois vídeos de 46 segundos recusados na escolha (lista vazia); vídeo de 25 s aceito; vídeo longo permitido para Instagram; ao marcar Status 2 depois, aviso imediato, rascunho preservado e agendamento bloqueado. Ao retirar Status, Instagram recebe as postagens simuladas. Sem erro JavaScript nem overflow horizontal.

Evidências: tests/saida/status-selecao-{390,412,1440,320}.png. Reutiliza o aviso existente; sem nova barra fixa ou sobreposição. Rótulo quebra linhas no celular e mantém o input alcançável. Controles existentes conservam área de toque. Wafly: 33 testes aprovados; sintaxe 52/52; HTML 11/11.

Resultado: **APROVADO COM LIMITAÇÃO**. Navegador e APIs simulados; nenhum envio real ou teste em aparelho físico.
