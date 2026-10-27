# Conexões: chave do Zernio (Instagram Direct) — 27/10/2026

Pedido do Pablo: enquanto ele cria a conta no Zernio, preparar o lugar no admin para guardar a chave (e registrar no Cofre onde ela fica, sem o valor).

Skill aplicada: `.claude/skills/tenkiter-estetica-humana/SKILL.md`. Evidência: `zernio-chave-20261027/01-sem-chave-390.png`, `02-conectado-390.png` e `03-sem-chave-1440.png`.

## Tarefa humana
O gestor cola a chave uma vez e tem certeza de que ela funcionou e de qual Instagram está ligado. O que precisa de atenção primeiro é a linha de situação ("Nenhuma chave guardada" / "✓ Chave guardada · Instagram conectado: @…").

## Como ficou
- No grupo Instagram de Conexões, depois do importador: título "Instagram Direct · Zernio", situação, três passos curtos (criar a conta, conectar o Instagram, Settings → API Keys), campo de senha e os botões "Salvar e conferir" (principal) e "Remover chave" (com confirmação).
- Respostas: vazio → "Cole a chave…"; chave recusada → frase do Zernio em português, sem JSON; chave certa sem Instagram → guarda e pede para conectar; chave certa → mostra o @ do Instagram e limpa o campo.
- Aviso honesto no rodapé: guardar a chave ainda não liga o Direct no painel.
- Botões da tela Conexões passaram de 40 para 44 px de altura.

## Medições e testes
- Botões do bloco: 44 px. Sem rolagem horizontal em 390 e 1440. axe sem falhas sérias.
- `tests/conexoes_zernio.py`: 16 verificações (novo). `worker_mensagens_conversa`: 186 (7 novas da chave do Zernio: formato, recusa sem repassar a resposta, Bearer, a chave nunca volta, sem Instagram conectado, remover).
- Continuam passando: `conexoes_wafly`, `conexoes_admin`, `cofre_admin`; `conexoes_unificada` atualizado para 7 grupos.

Resultado: APROVADO COM LIMITAÇÃO. A conferência real depende da chave verdadeira do Pablo; o formato da resposta do Zernio foi tirado da documentação deles (GET /v1/accounts).

## Escolher o Instagram certo (27/10/2026, site 7.36.0)
Ao colar a chave real, o Zernio do Pablo tinha também o Instagram pessoal (@pablo_fontenele88) e o painel usou o primeiro da lista.
- O servidor passa a preferir a conta com "tenkiter" no nome e devolve a lista de Instagram conectados.
- Com mais de um, a tela mostra "Qual Instagram é o da loja?" com uma opção por conta (44 px) e o botão "Usar este Instagram"; com um só, nada aparece.
- Evidência: `zernio-chave-20261027/04-escolher-instagram-390.png`. Testes: `conexoes_zernio` 21, `worker_mensagens_conversa` 216.
