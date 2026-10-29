# Disponibilidade rápida — site 7.40.28

Tarefa humana: retirar rapidamente o que acabou, conferindo fotos, tamanhos e cores existentes sem sair da conversa nem perder o rascunho.

A tela antiga mostrava todas as etiquetas/faixas e instruções longas, com fechamento expandido. Referência anterior: screenshot fornecido pelo proprietário. A nova janela mostra somente valores já cadastrados, reúne legado e Etiqueta equivalentes, oferece X em cada foto/vídeo/opção e arquivamento inteiro. Nome/código/tecido ficam no topo; demais dados são consultáveis em Informações da peça. Não permite adicionar tamanho/cor, nem alterar preço pela retirada rápida.

Retiradas são preparadas na janela. Cancelar descarta o rascunho de disponibilidade; Salvar alterações guarda a fila local por conta antes de fechar. Se não houver espaço local, o editor permanece aberto e explica a falha. A lista é atualizada imediatamente; envio autenticado ocorre em segundo plano e só informa salvo após confirmação. Pendência/erro têm aviso e nova tentativa em Produtos. Recarregamento retoma o progresso; outra conta não envia os trabalhos anteriores. Chamadas de tamanho/cor são parciais para não sobrescrever preço, descrição, tecido e mídia com uma cópia antiga. Remoções de mídia usam o arquivamento auditado existente, preservando os arquivos.

A última foto ou última opção de tamanho/cor prepara arquivamento do produto inteiro, com aviso explícito antes de Salvar; o servidor exige pelo menos uma foto em peça ativa. X geral também prepara arquivamento. Produtos inativados deixam a seleção de envio. A fila usa Web Locks quando disponível, IDs únicos por trabalho e progresso por operação; não contém sessão ou PIN. Falha parcial conserva o progresso, sem repetir etapas confirmadas. Registro ilegível não oculta os demais e pode ser descartado explicitamente.

## Revisão estética obrigatória

Aplicadas `.agents/skills/tenkiter-estetica-humana/SKILL.md`, referências e checklist.

- Jornadas em Chromium: integração real de telas com APIs simuladas em 320×700,390×844,412×915,1440×900; editor em390×470 com texto130%.
- Cabeçalho60px; fechar44×44px, sem flex expandido. Rodapé compacto com ações48px fora da rolagem. Controles de retirada44px. Fotos92×106px com X44px.
- Sem rolagem horizontal, Salvar alcançável, foco visível e retido em Tab/Shift+Tab. Escape/histórico via TKCamadas; rascunho da mensagem e busca preservados. Repaint usa evento próprio: a mudança/blur da busca não elimina o botão antes do primeiro toque.
- Tema branco/quente e ação laranja; corrigida herança do cabeçalho global do admin para manter o painel consistente com a proposta.
- axe WCAG AA sem violações no editor, quatro viewports da jornada integrada.
- Estados testados: offline, rede lenta, falha parcial, nova tentativa, recarga, troca de conta, falta de permissão, fila ilegível, armazenamento cheio, cancelamento e arquivamento.
- Evidências geradas em `tests/evidencias_edicao`, preservadas no backup privado e no artefato do CI, sem imagens/dados reais de clientes.

**APROVADO COM LIMITAÇÃO:** interface e operações simuladas; sem Android físico conectado. Não foi alterado produto real como teste, enviado WhatsApp, consumida IA ou publicado Apps Script. Servidor existente4.28 já oferece as operações necessárias.

O lote também inclui a reconciliação solicitada da lista original: `docs/mensagens/PLANO-RESTANTE-20261029.md`. O relatório distingue código entregue, lacunas funcionais e homologação real; busca visual permanece proposta, sem inferência/indexação ativada.
