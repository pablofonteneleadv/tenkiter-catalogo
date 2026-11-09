# Excluir solicitação de cliente — 7.67.0

Skill aplicada: `.claude/skills/tenkiter-estetica-humana/SKILL.md`. Tarefa da pessoa: tirar da lista uma solicitação registrada por engano ou que já não vale, sem perder fotos nem conversa e sem dar esse poder a todo mundo.

## O que mudou na interface

- **Botão "Excluir solicitação"** no fim de cada solicitação em Mensageiro → Solicitações de clientes (e na ficha do cliente, que usa a mesma lista). Usa o estilo de ação destrutiva do padrão (`.tk-btn-perigo`: contorno vermelho, 48 px de altura), com o mesmo recuo dos demais botões. Sem emoji.
- **Quem vê:** só o Admin total e quem o Admin total liberar. Sem a permissão o botão nem aparece; o servidor também recusa (mensagem em português).
- **Confirmação:** `confirm()` nativo do aparelho: "Excluir esta solicitação de <cliente>? Ela some da lista. As fotos e a conversa do cliente não são apagadas." Cancelar não muda nada.
- **Depois de excluir:** o cartão some, aparece "Solicitação excluída" com **Desfazer** (10 s, componente `TKAviso`). Desfazer restaura e recarrega a lista. Se era a última da lista, aparece "Nenhuma solicitação neste filtro."
- **Erro:** frase em português (`TKAviso.textoErro`), sem JSON.

## Revisão por largura (capturas nesta pasta)

| Largura | Lista com o botão | Excluída + Desfazer | Sem permissão |
|---|---|---|---|
| 320 px (texto 130%) | sem rolagem lateral, botão inteiro visível | aviso acima do rodapé, não cobre o botão de outro cartão | sem botão |
| 390 px | ok | ok | ok |
| 412 px | ok | ok | ok |
| 1440 px | ok, gaveta lateral | ok | ok |

`tests/mensagens_solicitacoes_excluir_ui.py` confere nas quatro larguras: botão com alvo de 44 px ou mais, sem rolagem lateral, confirmação com a consequência, cancelar não exclui, exclusão lógica (a linha continua no banco), Desfazer, ausência do botão sem permissão, liberação por pessoa e axe sem violação grave ou crítica.

## Limites desta revisão

Validação em Chromium com Worker e SQLite locais e serviços simulados; não é validação em Android físico nem integração real.
