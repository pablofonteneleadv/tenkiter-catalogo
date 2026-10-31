# Reparos integrados — 31/10/2026

Base revisada: `2fcd7ee48acc6ff978bb5cb4b5c08ff9115587dd` (PRs #320–#334, com referências anteriores de mídia e gestão). O proprietário autorizou implementar, consolidar em uma PR, fazer merge após os portões e acompanhar o deploy. Não autorizou mensagens/publicações reais de teste. Site proposto: **7.40.37**. APK final candidato: **2.4.13/code 20**.

## Resultado implementado

| Achados da revisão | Reparo |
|---|---|
| 1, 9, 10, 12 — conversor quebrado, contratos diferentes e fallback pago | FFmpeg/FFprobe executável, duas passagens com orçamento por duração, inspeção e decodificação final. Sem corte implícito e sem fallback pago automático. Dois perfis comuns, descritos abaixo, ligados à interface. |
| 2, 3 — APK publicado sem manifesto e falso sucesso do deploy | Release idempotente, assinatura/package/code verificados e certificado comparado ao anterior. Candidato em rascunho; somente a main aprovada publica. O build do site resolve o manifesto da release estável verificada, e o portão público compara com essa release. Fallback do APK consulta o manifesto da release, sem depender de atualização posterior por PR de bot. |
| 4–6 — encaminhamento | Contrato válido de conversa, busca no servidor, paginação, respostas atrasadas descartadas, camada com voltar/Escape, foco e nomes acessíveis. Texto do rascunho de destino é preservado; preparação não envia. Instagram com rascunho de texto não recebe anexo silenciosamente. |
| 7 — citação invisível após retry | Retry usa somente a citação armazenada no envio pendente; não altera a composição atual. |
| 8 — arquivo inválido descarta seleção válida | A seleção percorre os arquivos até encontrar um válido e mantém os demais; cancelamento de vídeo não descarta foto válida. |
| 11 — câmera sem chamada de produção | Ação Gravar vídeo ligada a input com capture, ponte e câmera; clipe continua abrindo galeria múltipla. Não impor teto de gravação de 60 s/12 MiB nem baixa qualidade; a mídia passa pelo preparo comum. Teste nativo alcança o fluxo de abertura. |
| 13–16 — gestão | Todos aceito no contrato; equipe e fila reconciliadas sem recarga manual; encerramento separado de resposta; rótulo por ciclo; cobertura parcial explícita; presença não apresentada como produtividade. |
| Adicional encontrado na validação | Abrir nova conversa em outro canal não tenta mais atribuir a uma constante nem usa `self.canal` indefinido. |

## Dois perfis de vídeo

- **Mensageiro — WhatsApp e Instagram:** mesmo orçamento final de **15.000.000 bytes**, duração integral, MP4/H.264 e AAC quando há áudio. O arquivo já compatível passa sem conversão. Vídeo grande ou HEVC inicia preparação mediante ação explícita. Anexar, encaminhar, agendar e captura usam o mesmo caminho.
- **Postagens — Status, Grupo e Story:** uma mídia de **3 a 30 segundos**, até **9.961.472 bytes (9,5 MiB)**. A política é igual mesmo com apenas um destino selecionado. Vídeo longo exige seleção explícita do início/duração; a prévia do resultado precisa ser aceita. O mesmo arquivo preparado é reutilizado nos payloads dos destinos; URL/base64 são apenas transportes diferentes.

Os números são política comum do produto, não declaração de que Wafly e Instagram tenham limites idênticos. Codec incompatível também pode exigir conversão abaixo do orçamento. Preservar toda a duração não garante que um vídeo arbitrariamente longo caiba com qualidade aceitável: o processador limita recursos a original de 40 MiB/30 minutos e recusa bitrate abaixo do mínimo em vez de cortar. A escolha da duração não implica homologação da conta real.

O encoder preserva enquadramento, não amplia imagens menores, normaliza dimensões pares/FPS, usa faststart e trata HDR reconhecido com tone mapping para BT.709. A prévia permite conferir roupas e som; teste sintético não comprova fidelidade de peças reais.

## Preparação privada e limites operacionais

A fila nova usa bindings D1/R2 do Worker. O runner não precisa mais consultar diretamente a API D1 com o token que recebia 403. A identidade OIDC curta é restrita a IDs do repositório/proprietário, workflow específico, main, eventos autorizados, emissor e audiência; assinatura RSA e validade são conferidas. Não há SQL genérico exposto. Credenciais da loja não transitam pelo processador.

O original fica em prefixo que as rotas públicas de mídia não aceitam. Conta diferente não consulta o trabalho. Há deduplicação do original/perfil/trecho, claim atômico e lease; resultado incerto de conversão não dispara envio. Reservas atômicas limitam temporários a 512 MiB, respeitam o orçamento de armazenamento existente e limitam pedidos por pessoa. Acesso aos trabalhos expira em 24 h; remoção ocorre em lotes de temporários. A fila periódica pode atrasar; a tela oferece fechar e recuperar selecionando o mesmo original. Não promete conversão instantânea.

Na fila antiga de Postagens, recuperar um vídeo com erro abre preparação de uma nova cópia para conferência; o registro original permanece. Não reativa um envio com recibo incerto. Leitura operacional antes do deploy confirmou **zero** postagens em convertendo/transcodificando; não foi feita migração nem retomada de envio real.

## Gestão e significado dos números

Equipe/presença e fila atual reconciliam enquanto a tela estiver visível, aproximadamente a cada 30 segundos, sobre o mecanismo existente de eventos/consulta. Presença continua com validade aproximada de dois minutos. Histórico expandido, foco e rolagem são preservados nas atualizações de equipe.

Os indicadores históricos do período usam snapshot de até cinco minutos; a fila é consultada novamente, sem reler 30 mil mensagens a cada reconciliação. A tela mostra os horários de ambos. Abrir/escolher um período consulta novamente. Tempo de resposta é por ciclo, em tempo corrido; encerramento sem saída não entra como resposta. Limites de consulta são sinalizados, e a trilha de atividade é apresentada com sua cobertura real, sem inventar histórico ou vendas comprovadas.

SLA por expediente, conversões de venda auditadas e uma central administrativa ampliada continuam ideias do relatório, não funcionalidades declaradas como entregues neste lote.

## Validação e evidências

Serviços simulados, sem envio real, conversão paga ou IA paga:

- Worker de conversas: **436/436**; Instagram: **406**; canal: **52**; grupo: **33**; Wafly: **11**; mídia: **41**; citação: **21**, todos sem falhas nas execuções dirigidas.
- Citação na interface: **34/34**, incluindo falha/retry seguido de nova mensagem.
- Worker da preparação: ACL/isolamento, JWT assinado/claims inválidas, lease, deduplicação, ausência de envio, semântica de métricas, aviso de 30.001 linhas e cache com fila atual sem releitura do histórico.
- FFmpeg real com fonte sintética: HEVC/HDR para H.264/BT.709, original maior que 15 MB reduzido preservando 120 s, trecho explícito, limite de 30 s e recusa de corte implícito.
- Jornadas 320×700, 390×844, 412×915 e 1440×900: encaminhar, busca remota/paginação, Escape, rascunho, seleção mista, vídeo de 35 s no Mensageiro, trecho de Postagens, destinos sem reconversão, equipe atualizando, painel e recuperação de erro. Reflow/texto ampliado e axe nos diálogos/gavetas.
- Resolver Android: release estável mais recente, hash divergente, manifesto local+público antigos e ausência de no-store.
- APK candidato: testes/lint/assembleRelease, apksigner, package/code, hash/tamanho e certificado comparado no workflow de preparação. Pipeline reaproveita o candidato da mesma fonte, sem sobrescrever uma versão existente.
- Sintaxe JS, HTML, bindings, skill UX, Python e scan de segredos. CI rápido recebe as regressões; não foi solicitada/executada a bateria integral local.

Tarefas humanas avaliadas: preparar e conferir uma mídia antes de enviar; escolher destino sem perder a composição; consultar fila/equipe com significado claro. Alvos novos de 44–48 px; diálogos roláveis limitados à viewport, sem rolagem horizontal nas jornadas. Evidências: artefato `evidencias-reparos-integrados` do CI. Resultado UX: **APROVADO COM LIMITAÇÃO** — Chromium com serviços simulados; teclado Android físico, instalação sobre versão anterior e entregas Wafly/Instagram reais não homologados.

APK 2.4.13/code 20: 4.606.569 bytes, SHA-256 `a26342fe67be0be854a1e8b74ab5f8dc0540b40fa08b613b548917555b54f990`. Certificado SHA-256 `09ed81d57207c72a9d49cc5065483a22f57a15528d8a626aa3a99467e1b59a76`, igual ao anterior. [Preparação assinada e testes](https://github.com/pablofonteneleadv/tenkiter-catalogo/actions/runs/41158298051). O candidato 2.4.12 foi superado durante a validação, sem publicação estável; a entrega final usa 2.4.13.

## Backup, publicação e recuperação

Ponto de restauração remoto: `backup/pre-reparos-integrados-20261031`, no SHA da base. Bundle local complementar em `/workspace/review`; o ponto remoto permanece fora deste ambiente. Nenhum dado real foi apagado para testar; não houve corte de banco/planilha. Tabela nova é aditiva e contém somente preparação temporária. Apps Script não foi alterado e não exige publicação manual neste lote.

Caminho de produção: PR única → CI obrigatório verde → squash/merge autorizado → workflow de deploy → APK estável conferido → manifesto resolvido no build → Render/cache → três Workers → versão pública e saúde do processador. Publicação e verificação final serão registradas ao término; criação do candidato não significa deploy.

Rollback: restaurar o código da branch de backup por PR e CI, preservando dados/tabelas e recibos. Não reativar o conversor histórico que liberava fila sem revisão; não diminuir versionCode nem substituir APK já publicado. Se for necessário corrigir Android após publicar, criar nova versão com a mesma chave.
