# Aba Instagram sem filtros invisíveis — site 7.40.18

## Verificação

A consulta equivalente à lista, somente leitura no D1, confirmou conversas individuais abertas com mensagens não lidas no canal Instagram. Não foi necessário reimportar ou alterar mensagens. A contagem global indica todas as conversas do canal, enquanto a consulta pode receber filtros adicionais.

Dois caminhos foram reproduzidos no navegador:

1. Ativar somente Grupos no WhatsApp e mudar para Instagram. O seletor Mensagens/Grupos é escondido no Instagram, mas a consulta ainda enviava `tipo=grupo`, produzindo lista vazia. O teste anterior à correção falha com esse parâmetro.
2. Escolher uma etiqueta no WhatsApp e mudar para Instagram. A troca limpava busca e filtro de situação, porém preservava `etiqueta`, excluindo conversas do outro canal sem ser evidente. O teste reproduziu `canal=instagram&tipo=individual&etiqueta=21` e lista vazia.

Isso comprova os caminhos de falha; não há telemetria do estado do aparelho para afirmar qual filtro estava ativo no print do proprietário.

## Correção

- Instagram sempre consulta conversas individuais; a preferência por grupos do WhatsApp permanece disponível ao voltar para ele.
- Ao trocar de canal, limpa também a etiqueta, junto com os filtros e a busca que já eram limpos.
- Em modo de lista, garante que a lista e seu estado estejam visíveis. Durante a consulta mostra “Carregando conversas…”, em vez de deixar a área em branco.
- Se a pessoa aplicar explicitamente uma etiqueta sem resultados, informa que não há conversa com aquela etiqueta naquele canal, sem dizer que nenhuma mensagem chegou.

Não altera mensagens, nomes, vínculos, responsáveis, leitura ou conexão com a Meta/Zernio. Não reaplica as alterações de interface canceladas anteriormente. Compatível com a tela compartilhada do APK 2.4.3; sem alteração do instalador ou assinatura.

## Validação e experiência humana

`tests/app_instagram_aba.py`: cinco conversas Instagram fictícias, duas não lidas; alternância Todas/Instagram repetida, filtro Não lidas, entrada pelo filtro de grupos e por etiqueta de outro canal. Quatro viewports: 320×700, 390×844, 412×915 e 1440×900. Verifica consulta, contagem/lista, visibilidade e ausência de erro JS. O mock de consultas passou a reproduzir também o filtro de etiqueta já existente no servidor real.

Tarefa: tocar Instagram e encontrar suas conversas, sem filtros ocultos. Skill TENKiTER aplicada; nenhuma barra/controle fixo adicionado, sem mudança de dimensões ou alvos de toque. [Evidência com dados fictícios](instagram-aba/instagram-390.png).

**APROVADO COM LIMITAÇÃO:** testes em navegador com serviços simulados e verificação real somente leitura da existência das conversas. Estado exato do aparelho e interação física precisam ser confirmados pelo proprietário. A correção pontual será entregue junto do Voltar da notificação na versão do site 7.40.18.
