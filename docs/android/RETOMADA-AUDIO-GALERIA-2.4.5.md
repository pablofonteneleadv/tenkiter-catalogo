# Retomada, Voltar, áudio e galeria — Android 2.4.5 / site 7.40.21

A tarefa humana é retomar o atendimento, voltar à lista e preparar áudio/foto/vídeo sem perder a conversa ou enviar para outra pessoa.

## Causas reproduzidas

- `worker_` comparava o token inteiro antes/depois de uma resposta. Uma renovação normal da credencial da mesma pessoa era exibida como “A conta mudou”. O teste `TK_BASELINE=1 python3 tests/app_retomada_sessao.py` reproduz a falha no código publicado anterior (9311ffb).
- Voltar na WebView não limpava a conversa guardada na Activity Android. Ao restaurar a tela, a conversa anterior podia ser aberta novamente. O teste `TK_BASELINE=1 python3 tests/app_android_retomada.py` reproduz esse ciclo. O retorno também dependia de camadas/histórico de navegador, sem necessidade no app.
- O clipe chamava `FileChooserParams.createIntent`, que abre o explorador de documentos. O microfone dependia de captura WebRTC/permissão do site. Há `microphone=()` no Blueprint, mas o cabeçalho não apareceu na consulta pública; isso não foi tratado como prova da causa única da falha de gravação.

## Comportamento corrigido

A sessão de Mensagens identifica a pessoa pelo WhatsApp normalizado, com geração separada para logout/troca real. A renovação do token não descarta respostas válidas da mesma pessoa. Uma recusa da credencial antiga pode ser repetida uma vez com a nova credencial, após validação; a resposta de renovação atrasada não substitui a conta que já mudou. Troca real limpa a visão/cache anteriores e respostas antigas não voltam a preencher a tela. Não há alteração em Apps Script nem ampliação de permissões.

No APK, a seta volta diretamente à lista, cancela aberturas pendentes e informa o Android para limpar o atendimento salvo. O identificador de cada pedido de notificação impede reentregas da mesma navegação. Gavetas e foto ampliada continuam fechando antes da conversa no botão Voltar do Android. No site normal, as camadas de histórico continuam usadas.

O microfone do novo APK usa `MediaRecorder` Android com permissão `RECORD_AUDIO`, gera M4A/AAC e entrega o arquivo pela seleção nativa da WebView. **Nada é enviado antes da prévia e do toque em Enviar.** Descartar, negar permissão ou sair durante a gravação cancela a captura. Limite de cinco minutos; arquivos temporários ficam no cache privado `webcapture/`. A tela Permissões do app oferece acesso ao ajuste do microfone, sem torná-lo obrigatório para entrar.

O clipe usa Android Photo Picker para imagens/vídeos. Nos Androids sem Photo Picker, abre a galeria de fotos/vídeos do aparelho; documentos são alternativa explícita somente se não houver galeria. Não há permissão ampla de leitura da biblioteca. Áudios de arquivo continuam disponíveis no menu da conversa. Uma seleção antiga não é anexada em outra conversa/conta.

A política declarada no Blueprint passa a permitir microfone somente à própria origem (`microphone=(self)`), preservando câmera/geolocalização bloqueadas. Schema atual do Render validado; não foram modificados recursos, nomes, planos ou credenciais.

## Validação e revisão de interface

- Dois testes de baseline reproduzem os erros anteriores em quatro viewports.
- Jornadas novas: renovação durante resposta, retry com credencial nova, recusa/renovação de sessão, troca real de pessoa; notificação, seta, estado salvo/recriação, reentrega e histórico indisponível; microfone nativo→prévia→envio explícito; fotos/vídeos e seleção isolada por conversa.
- Regressões: `app_notificacao_voltar.py`, `app_mensagens.py`, `mensagens_arquivos_atualizacao.py`.
- Android: 56 testes e lint. Incluem Photo Picker/galeria, distinção entre gravação e arquivo de áudio, negação/cancelamento de permissão, descarte ao sair, captura muito curta/erro, arquivo privado legível para a prévia e diálogo em 320/390/412/1440 px. O cache estático do FileProvider é isolado no teste porque o diretório temporário do Robolectric muda por teste; isso não altera código de produção.
- Viewports web: 320×700, 390×844, 412×915 e 1440×900; fonte 130%, área reduzida a 470 px, toque e teclado. Gravador com botões de pelo menos 48 dp, diálogo rolável nativo, rótulos claros; prévia sem colisão com Enviar. Referência anterior: screenshots enviados pelo proprietário. Evidências usam somente dados sintéticos.

**APROVADO COM LIMITAÇÃO:** testes de UI/integração simulados e intenção do seletor verificados; microfone físico, Bluetooth, galeria do fabricante e instalação no celular do proprietário ainda não foram homologados. Sem envio real de mensagem/push ou uso de conversas reais como teste. O instalador público só muda após gerar e conferir a assinatura pelo workflow oficial.
