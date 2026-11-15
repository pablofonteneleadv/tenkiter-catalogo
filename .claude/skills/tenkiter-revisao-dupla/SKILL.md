---
name: tenkiter-revisao-dupla
description: Use antes de publicar texto público (anúncio, post do Instagram, legenda, descrição de catálogo, mensagem em massa) e antes de aprovar mudança de segurança (permissões, webhooks, segredos, rotas dos Workers). Dois revisores independentes aplicam a mesma rubrica; só publica se os dois aprovarem.
---

# Revisão dupla (autor + dois revisores)

Inspirada em ECC skills/santa-method (MIT). Quem escreve não aprova o próprio trabalho: o mesmo modelo repete a premissa errada na escrita e na revisão. O que sai para o público ou protege dados passa por dois olhares que não se viram.

## Quando usar

- Texto que o cliente vê: anúncio, post/legenda, descrição e preço de peça, mensagem automática (boas-vindas, fora do horário), aviso do site.
- Mudança de segurança: `instagram-worker/worker.js` (rotas `/wh/`, sessão, permissões), `midia-worker/worker.js`, `og-worker/worker.js`, `scripts/ci/check_secrets.sh`, `check_worker_credentials.py`.
- Não usar para ajuste de layout comum (use `tenkiter-estetica-humana`) nem para erro de digitação.

## Passo a passo

1. **Rubrica única, escrita antes.** Liste 5 a 8 critérios objetivos, com aprovado/reprovado cada um. Mesma rubrica para os dois revisores. Exemplos para texto público:
   - Nenhum fato inventado sobre a loja (preço, prazo, estoque, tecido, medida): cada fato aponta a fonte (catálogo, Cofre).
   - Português correto, sem JSON cru nem termo técnico (regra 14 do `CLAUDE.md`).
   - Tom TENKiTER, sem frase genérica de "loja online"; sem emoji fora do padrão da marca.
   - Sem dado pessoal de cliente, sem promessa que a loja não cumpre, sem comparação a concorrente.
   - Link compartilhável usa `SITE_URL` (`common.js`).
   Para segurança: segredo fora do repo, comparação em tempo constante, corpo limitado, efeito só após validação (ver `tenkiter-seguranca-de-agentes`).
2. **Dois revisores independentes.** Cada um recebe só: o artefato, a rubrica e as fontes. Não recebe o raciocínio do autor nem a opinião do outro revisor. Use instâncias separadas (subagentes distintos); idealmente um com modelo diferente do autor. Cada um responde por critério: `ok` ou `falha: <trecho> -> <motivo>`.
3. **Portão.** Só passa com os dois em `ok` em todos os critérios. Um `falha` de qualquer lado vale como reprovação.
4. **Laço de correção, teto de 3 rodadas.** O autor corrige apenas o que foi apontado, sem reescrever o resto; os dois revisores refazem a rodada inteira (não só o ponto corrigido). Anote rodada, falhas e correção.
5. **Escalada.** Reprovou na 3ª rodada, ou os revisores discordam em tema de fato/segurança: pare e apresente ao dono um resumo curto (versão atual, critérios que falham, a dúvida). O dono trabalha pelo celular: uma pergunta objetiva, com a recomendação e as opções, nunca texto longo. Não publique por cansaço.
6. **Registro.** Na descrição da PR ou no log: rubrica usada, nº de rodadas, resultado de cada revisor.

## Armadilhas

- Revisor que "concorda" por ter visto a justificativa do autor: reenvie sem justificativa.
- Rubrica vaga ("está bom?"): reprova a revisão, não o texto.
- Aprovar com ressalva: ressalva é falha. Corrija ou escale.
- Publicação (post, envio, deploy) continua dependendo de autorização do dono; a aprovação dupla não a substitui.
