# Postagens à prova de falhas — revisão estética e de uso (06/11/2026, v7.56.0)

Skill aplicada: `.claude/skills/tenkiter-estetica-humana/SKILL.md` (Postagens e mídia).
Jornada automatizada: `tests/postagens_prova_falhas_ui.py` (Worker simulado por `tests/mock.py`; nada sai da máquina) — **OK=60, FALHAS=0**.

## O que mudou na tela (aba Fila)

| Antes | Depois |
|---|---|
| Story recusado pelo limite do Instagram aparecia como “⚠ Deu problema” com o texto cru “User is performing too many actions”. | Item “Aguardando pausa do Instagram” com selo “Sai por volta de HH:MM” e o motivo em português; não usa o vermelho de erro. |
| Parte de série “Instagram + WhatsApp” com o Story recusado: sem botão de repostar (séries eram bloqueadas) e o restante da fila travado. | “Instagram não saiu (o WhatsApp saiu normalmente): o Instagram bloqueou por excesso de ações” + botão **Repostar só o Story**; “Postar agora” sumiu desse caso (remexeria a série). |
| Nenhuma visão do estado de cada canal. | Faixa discreta **Saúde das postagens** no topo da Fila: uma linha “Normal” quando está tudo bem; com problema, uma linha por canal (Instagram, WhatsApp Status 1, WhatsApp Grupo 1, WhatsApp Status 2), “Precisa de atenção: N itens”, “Ver os motivos” e, só para o gestor, **Retomar Instagram agora** (pede confirmação). |
| Série com parte em erro ficava muda. | Aviso “Sequência parada: a parte N não saiu…” com a próxima ação. |
| — | Aba Regras: “Espaço mínimo entre publicações do Instagram (min)”, padrão 3. |

## Evidências

| Tela | 390 × 844 | 1440 × 900 |
|---|---|---|
| Faixa com Instagram em pausa | `fila-saude-pausa-390.jpg` | `fila-saude-pausa-1440.jpg` |
| Item aguardando a pausa | `fila-aguardando-pausa-390.jpg` | `fila-aguardando-pausa-1440.jpg` |
| “Instagram não saiu — Repostar só o Story” | `fila-instagram-nao-saiu-390.jpg` | `fila-instagram-nao-saiu-1440.jpg` |
| Por mídia (chip “Pausa do Instagram”) | `fila-por-midia-pausa-390.jpg` | `fila-por-midia-pausa-1440.jpg` |
| Depois de “Retomar Instagram agora” | `fila-saude-retomada-390.jpg` | `fila-saude-retomada-1440.jpg` |
| Regras: espaço mínimo do Instagram | `regras-espaco-instagram-390.jpg` | `regras-espaco-instagram-1440.jpg` |
| Tudo normal (faixa de uma linha) | `fila-saude-normal-390.jpg` | — |

## Checklist

- Funciona: pausa, espera, “Repostar só o Story” (envia `perna: instagram`), “Retomar Instagram agora” (confirmação → servidor → faixa volta ao normal, retorno em português). ✔
- Conforto: tom âmbar para pausa (não é erro), vermelho só para o que precisa de ação; a faixa é uma linha quando está normal; motivos ficam recolhidos em “Ver os motivos”. ✔
- Mobile/desktop: 390 e 1440 sem rolagem horizontal (Fila por canal, por mídia e Regras). ✔
- Alvos de toque ≥ 44 px (botões da Fila, botão de retomar e “Ver os motivos”). ✔
- Acessibilidade: faixa com `role="status"`; axe sem violações graves ou críticas nas duas larguras. ✔
- Texto: português, sem JSON nem texto cru do Instagram na faixa e no item da série. ✔
- Equipe sem Admin total vê a faixa, mas não o botão de retomar (o servidor também recusa com 403). ✔

## Limitações

- Evidência com Worker simulado; não substitui validação no Android nem com o Instagram real.
- O “aviso ao gestor” do token vencido é a faixa (e o registro em `cfg`); não envia notificação push.
