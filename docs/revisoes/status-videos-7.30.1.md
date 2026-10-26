# Vídeos para WhatsApp Status — 7.30.1

Tarefa humana: selecionar os destinos e saber, antes de agendar, se o vídeo cabe no Status, preservando o rascunho para corrigir o arquivo.

A referência visual anterior é o erro genérico HTTP 422 da fila. A documentação pública da Wafly (`https://wafly.com.br/openapi.json`, consultada em 26/10/2026) exige MP4 até 10 MiB e 30 segundos; imagens JPEG/PNG até 5 MiB. Grupo não usa essa rota.

## Correção e validação

- Interface: informa os limites junto aos destinos; confere os vídeos selecionados antes de enviar qualquer postagem. Uma recusa mantém a mídia, as opções e o botão de ação disponível.
- Worker: lê `moov/mvhd` do MP4 (versões 0 e 1), recusa duração maior que 30 s sem chamar a Wafly e diferencia os limites de imagem e vídeo. Resposta 422 explica a correção e o uso de nova publicação.
- Nenhum item cancelado foi reativado. Sem mudança de requestId em tentativas pendentes, sem mensagens reais durante os testes.
- Teste da API simulada: 33 verificações Wafly, incluindo ambos os slots, MP4 longo/curto/truncado, limite de bytes, recibos e preservação da fila; 11 de canais e 52 de grupo.
- Jornada de navegador: vídeo de 46 s bloqueado antes de agendar, rascunho mantido e botão habilitado; a mesma mídia pode seguir para Instagram ao retirar os destinos Status. Sem erro JavaScript ou rolagem horizontal em 390×844, 412×915, 1440×900 e 320×700.
- Evidências locais: `tests/saida/status-video-{390,412,1440,320}.png`. A mensagem usa a região de aviso existente; não acrescenta barra fixa ou sobreposição. Controles preservam os alvos existentes (44 px ou mais).

Resultado: **APROVADO COM LIMITAÇÃO**. Limites e comportamento testados com a API simulada e com arquivos locais. Não foi feita publicação real no WhatsApp; a aceitação final continua dependendo da Wafly e da conexão de cada instância. Não houve teste em aparelho físico Android.
