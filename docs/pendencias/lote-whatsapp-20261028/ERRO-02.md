> Atualização: o proprietário autorizou concluir e publicar o lote em 28/10/2026. As restrições abaixo descrevem a fase anterior; ver PUBLICACAO.md para o resultado final.

# Erro 2 — editor de contato único e associação pelo número

**Preparado, sem publicação. Faz parte do mesmo lote do erro 1; merge, deploy e distribuição do APK dependem da autorização explícita do proprietário.**

Referências fornecidas: prints 1002050918 e 1002050919. Tarefa humana: tocar no nome, editar os dados e salvar uma única vez, com retorno imediato sobre carregamento e resultado.

## Causas encontradas e correções

O editor nativo fazia a consulta antes de abrir a janela. Cada toque criava uma consulta independente e, depois, outra janela. Agora a janela abre imediatamente e carrega os dados dentro dela, bloqueando novas aberturas enquanto estiver visível. Fechar cancela a entrega do resultado; uma resposta atrasada não reabre a janela. A consulta pertence à sua própria janela: fechar e reabrir rapidamente não cancela a janela seguinte.

- WhatsApp: nome, WhatsApp principal, segundo WhatsApp e Instagram; somente Salvar/Fechar, sem busca ou botões de vínculo.
- Instagram: nome e um WhatsApp. Salvar o número procura o cadastro tanto pelo principal quanto pelo segundo, inclusive no índice Google já importado. Preserva os dois números existentes, sem transformar o segundo no principal. Cliente que não informa número pode ficar sem ele; número inválido não é tratado como ausente.
- O Instagram associado aparece no campo do WhatsApp. Quando o provedor fornece o usuário, armazena o identificador real e normaliza @usuário/URL. Para históricos anteriores que só possuem nome e ID do perfil, mostra o nome do perfil já associado, preservando o vínculo ao salvar sem edição. Não inventa @usuário a partir do nome.
- O usuário exato informado no WhatsApp também é reconhecido quando uma mensagem futura do Instagram chega com esse identificador. Nomes parecidos não provocam associação.
- Salvar bloqueia repetição, mantém os campos em caso de erro e mostra o erro na própria janela. Falha ao carregar oferece Tentar novamente na mesma janela.

Duas tabelas adicionais guardam usuário do perfil e sua relação com o cadastro; índices por usuário. Criadas somente na futura inicialização do Worker publicado. Nenhuma escrita em produção ou alteração do Google Contacts foi realizada. Contrato antigo da API preservado para o site e APK instalado. A simplificação visual desta entrega é no APK.

## Verificação local

- Worker: 280 verificações, com SQLite, Google, Wafly e Zernio simulados. Cobre associação pelo segundo número antes/depois de edição manual, preservação dos números, retorno do Instagram no WhatsApp, usuário exato em mensagem futura e rejeição de número inválido.
- Android: 47 testes Robolectric, incluindo repetição de toque, janela única, fechamento durante consulta, nova tentativa, salvamento único, variantes por canal e perfil histórico sem inventar usuário.
- Teste de push existente aprovado: registro, entrega simulada, deduplicação, revogação, logout e falta de configuração. Sem envio real de notificações.
- Validação de estrutura da skill de estética e diff sem erro de whitespace.

## Revisão de interface

**APROVADO COM LIMITAÇÃO.** Referência anterior: prints fornecidos pelo proprietário. Evidências abaixo usam apenas dados fictícios. Dimensões simuladas: 320×480 (altura reduzida como aproximação de teclado), 390×844, 412×915 e 1440×900; nomes longos e texto a 130%. Botão Salvar com altura mínima de 48dp, foco por teclado e posição alcançável após rolagem, inclusive na altura reduzida. Fechar fica fora da área rolável. Ação principal em laranja escuro com texto branco; rótulos permanentes e campos acessíveis.

- [WhatsApp 390](erro-02/whatsapp-390.png)
- [Instagram 390](erro-02/instagram-390.png)
- [WhatsApp 320 com texto ampliado e altura reduzida](erro-02/whatsapp-320-texto130.png)
- [WhatsApp 412 com texto ampliado](erro-02/whatsapp-412-texto130.png)
- [Instagram 1440 com texto ampliado](erro-02/instagram-1440-texto130.png)

Limitações: Robolectric não comprova comportamento do teclado físico/IME, rede e desempenho no aparelho, nem entrega de webhook/FCM real. A largura desktop foi simulada na janela Android, sem alteração da interface web. A confirmação no aparelho fica para o APK do lote autorizado. A ausência de contexto de status no principal segue registrada separadamente no erro 1; este ajuste não modifica o leitor/reprodutor de status.
