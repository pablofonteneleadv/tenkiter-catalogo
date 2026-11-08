# Solicitações de clientes: miniaturas e registro em segundo plano — 7.64.0

Skill aplicada: `.claude/skills/tenkiter-estetica-humana/SKILL.md`. Tarefa da pessoa: ver as fotos de um pedido de cliente sem abrir uma a uma e registrar pedido ou fotos sem travar o atendimento.

## O que mudou na interface

- **Lista de Solicitações:** até três miniaturas 4:5 lado a lado por pedido (`aspect-ratio: var(--tk-foto)`), alvo de toque maior que 44 px. Quando há mais de três, o terceiro quadro mostra "+N fotos". Toque abre a foto dentro da própria janela da gaveta (camada `ms-gaveta` do `TKCamadas`, botão `tk-fechar`), com Anterior, Próxima, "Anexar à resposta" e "Voltar às solicitações". As imagens usam `atribSrc(fotoMini(...))` e só carregam perto da área visível.
- **Registrar pedido / Guardar fotos:** o formulário guarda tudo no aparelho (IndexedDB) e fecha; o envio segue em segundo plano. Um indicador flutuante mostra "Registrando pedido · 1/3", "Envio precisa de atenção" ou "Registro concluído · Ver". Tocar abre a janela "Envios de clientes", que tem Minimizar, Tentar de novo e Ver pedidos deste cliente.
- Textos em português, sem JSON ou código de erro na tela (`TKPadrao.erro`); nenhuma mensagem é enviada ao cliente. Sem ação destrutiva nova. Vocabulário: "pedido", "fotos", "Gestão" já existente.

## Revisão por largura (capturas nesta pasta)

| Largura | Lista com 3 miniaturas | Indicador flutuante | Painel de envios |
|---|---|---|---|
| 320 px (texto 130% no painel) | sem rolagem lateral, miniaturas na mesma linha | acima da barra Produtos/Respostas, sem cobrir o campo de texto | botões 44 px, texto quebra |
| 390 px | ok | ok | ok |
| 412 px | ok | ok | ok |
| 1440 px | ok, gaveta lateral de 420 px | ok | ok |

Os testes `mensagens_solicitacoes_ui.py`, `mensagens_registros_fundo_ui.py` e `mensagens_solicitacoes_retomada_ui.py` conferem nessas quatro larguras: sem rolagem lateral, três miniaturas na mesma linha, proporção 4:5, alvos de 44 px e axe sem violação grave ou crítica.

## Limites desta revisão

Validação feita em Chromium com serviços simulados (Worker com SQLite local), não em Android físico nem com serviços reais. A execução do envio exige a página aberta: ao fechar, os envios guardados retomam ao reabrir o Mensageiro na mesma conta.
