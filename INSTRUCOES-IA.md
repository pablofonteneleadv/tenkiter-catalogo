# Instruções para IAs que ajudam neste repositório (ChatGPT/Codex etc.)

Papéis: **Claude** escreve o pedido e **revisa**; **você** implementa; **o dono (Pablo)** aprova e faz o merge. Você NUNCA publica.

## Limites (valem sobre tudo)
1. Trabalhe só em branch `ia/<pacote>-<AAAAMMDD>` (ex.: `ia/01-testes-ci-20261021`) e abra **Pull Request para `main`**. **Nunca** faça push na `main`, merge, deploy, nem rode workflows manuais.
2. **Sem credenciais**: nunca peça, crie nem escreva chave, token, PIN ou senha em arquivo, teste, PR ou comentário (o repositório é público). Testes usam servidores FALSOS.
3. Os backends Apps Script (`*.gs.txt`) NÃO estão no repositório (gitignored, privados). Não os crie nem os commite. Testes que dependem deles (`backend_*.js`) são pulados aqui; se o pedido exigir mexer em backend, descreva a mudança no PR e pare nesse ponto.
4. **Nunca apague função existente** (pode melhorar, mover, renomear). Não invente fatos da loja (horário, CNPJ, "3x sem juros"...). Texto ao usuário final em português do Brasil; erro vira frase, nunca JSON cru.
5. Um pedido por PR. Não misture assuntos nem reformate arquivos inteiros (o diff tem que ser pequeno e revisável).

## Passo a passo
1. Leia `CLAUDE.md` (regras do projeto; ao menos "Regras que já causaram bugs reais" e as seções do setor) e o pedido em `docs/pedidos-ia/<pacote>.md`.
2. Rode os testes do setor ANTES de editar e anote o que já falha (`python3 tests/<teste>.py`, `node tests/<teste>.js`; setup em `tests/rodar_tudo.py`: playwright + pillow; alguns testes precisam de `python3 -m http.server 8765`). Falha que já existia não é sua.
3. Edite. Acrescente/ajuste testes para cada mudança.
4. Rode de novo os testes do setor: **nenhuma falha nova**. Verificações obrigatórias: `node --check` em todo `.js` alterado; nada de `<img src="${...}">` em modelo (use `atribSrc`); nada de `\u1F...` com 5 dígitos (use `\u{1F...}`); texto laranja nunca `--laranja` (use `--laranja-txt`); janela nova usa `TKCamadas`; busca por segredos (`rnd_`, `cfut_`, `os_v2_`, `AIza`) fora de `tests/` deve vir vazia.
5. Abra o PR com este corpo: **O que mudou** (por arquivo) · **Pedido atendido** (P-xx: Feito/Parcial/Bloqueado) · **Testes** (antes × depois, com os números) · **Riscos** · **Decisões assumidas** · **O que o dono precisa fazer** (se algo). Termine com "nada foi publicado".
6. Se algo no pedido estiver impossível ou bloqueado (marcado BLOQUEADO), não improvise: descreva no PR e siga para o restante.

## Revisão
O Claude comenta o PR (aprovado / correções). Só depois o dono faz o merge; o deploy é automático no merge.
