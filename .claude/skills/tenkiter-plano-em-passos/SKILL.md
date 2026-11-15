---
name: tenkiter-plano-em-passos
description: Use quando um objetivo do TENKiTER é grande demais para uma PR (nova área, migração de tela, mudança que cruza site, Worker e Apps Script) ou quando a sessão pode ser retomada fria por outra IA ou outro dia. Transforma o objetivo em passos do tamanho de uma PR, cada um autossuficiente e com critério de saída medível.
---

# Plano em passos

Inspirada em ECC skills/blueprint (MIT). Um plano bom permite que alguém que não leu a conversa execute o passo 4 sem perguntar nada. O dono trabalha pelo celular e as sessões acabam: o plano é a memória.

## Estrutura de cada passo

- **Título e branch:** `ia/<assunto>-<AAAAMMDD>`, uma PR por passo (regra 3 do `CLAUDE.md`).
- **Contexto autossuficiente:** o que é o objetivo geral em 2 linhas, o que os passos anteriores já entregaram (com PR/commit), arquivos a ler primeiro (caminhos reais) e regras do Cofre aplicáveis. Nada de "como combinamos".
- **Escopo:** arquivos que pode mexer e o que NÃO pode (dados, `.gs.txt`, migração).
- **Critério de saída medível:** comandos e resultados esperados. Ex.: `tests/<novo>.py` imprime `PASS`; `python3 scripts/ci/testes_impacto.py planejar --arquivos ...` seleciona os módulos certos; `check_padroes.py` sem piora no baseline; tela em 390x844 sem corte.
- **Testes por impacto:** módulos do manifesto afetados (`docs/ia/testes-por-impacto.md`) e `CI-EXTRA` se o risco for alto.
- **Reversão:** como voltar (reverter a PR; ponto de restauração, regra 9).
- **Depende de / libera:** ordem entre passos; paralelizável só se não tocam o mesmo arquivo.

## Como montar

1. **Objetivo em uma frase** com o resultado visível ao cliente ou à equipe, mais o que fica de fora.
2. **Levantamento de fatos** antes de planejar: leia o setor no Cofre, rode o Graphify (`python3 scripts/graphify/manage.py start`), liste arquivos, rotas e testes existentes. Marque cada afirmação como verificada ou suposta.
3. **Corte em passos de uma PR:** cada um deixa o site funcionando e testado sozinho (nada de passo que só funciona com o seguinte). Passo de Worker antes do passo de interface que o consome; passo de Apps Script (publicação manual por Pablo, regra 8) isolado e sinalizado como dependência humana, com o texto pedido ao dono em uma linha.
4. **Passo 1 = o menor fatiamento ponta a ponta** que prova a ideia; o resto amplia.
5. **Revisão adversarial do plano:** um revisor separado (veja `tenkiter-revisao-dupla`) tenta quebrá-lo com perguntas fixas:
   - Algum passo exige contexto que só existe na conversa?
   - Algum critério de saída não é verificável por comando ou tela?
   - Há passo que deixa a produção quebrada entre o merge dele e o próximo?
   - Foi esquecido consumidor de componente compartilhado, Worker, Android ou o monitor `saude-publica.yml`?
   - O que acontece se o passo falhar na metade (dados, filas)?
   Corrija até o revisor não achar falha nova (teto de 3 rodadas, depois escale ao dono).
6. **Persista o plano** onde a próxima sessão acha: `thread_save` do `tenkiter-agentes` (objetivo, passos, decisões, verificado, não verificado, próximo passo) e, se o dono quiser o documento, em `docs/ia/` por PR. Atualize ao fim de cada passo: feito, PR, evidência, pendência.

## Retomada fria

Quem abre a sessão lê só: a linha de trabalho (`thread_resume`), o passo atual e o contexto dele. Antes de agir, reconfirme os fatos que o passo cita (arquivo ainda existe? PR anterior foi mesclada? `version.json` mostra o commit?). Plano defasado é corrigido primeiro, depois executado.

## Pergunta ao dono

Só decisão de produto realmente pendente, em uma mensagem curta com recomendação e opções numeradas. O resto o plano resolve sozinho.
