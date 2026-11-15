# Medição: tempo até o primeiro item utilizável na Esteira

Instrumento de comparação antes/depois (não aprova nem reprova). Tudo simulado: sem Google, Cloudflare, mídia real, credenciais ou dados de clientes.

## Pré-requisitos
`python -m pip install playwright` e `python -m playwright install chromium`. O script sobe sozinho um servidor estático na raiz do repositório (porta livre).

## Comando
```
python tests/medicao/esteira_primeiro_item.py --rotulo antes
python tests/medicao/esteira_primeiro_item.py --rotulo depois
```
Opções: `--n 7`, `--perfis wifi,4g`, `--cenarios hoje_frio,fotos_apos_hoje,retorno_hoje,retorno_fotos,fotos_direto`,
`--lat hoje=2500 --lat fotos=1800 ...` (rotas: hoje, menu, fotos, caixa, tarefas, sincronizar, generico, parcial),
`--produtos 60`, `--fotos-caixa 300`, `--cpu 4`, `--foto-kb 15`, `--visivel`.
Saída: tabela no terminal e `tests/saida/medicao-esteira/<rotulo>.json` (agregado, amostras, cascata da 1ª repetição).

## O que é medido (ms desde o início da navegação ou do toque na aba, `performance.now()`)
- `primeiro_item`: Hoje = primeiro `button.peca` renderizado, habilitado e não coberto; Fotos = primeiro cartão (pedido ou Caixa) clicável ou imagem carregada.
- `primeira_imagem`: primeira miniatura com `naturalWidth>0` (Fotos).
- `lista_completa` (Hoje: todos os itens) / `concluido` (Fotos: pedidos + 24 fotos da 1ª página da Caixa, sem "Carregando").
- `marca_*`: `performance.mark` do próprio app (`esteira:<aba>:util|menu|resumo|abertura|retomada`), só quando emitida depois do toque.
- `reqs`: requisições ao Worker no cenário.

## Rotas simuladas
`/esteira/menu`, `/hoje`, `/hoje/tarefas`, `/fotos`, `/caixa` (24 por página, `antes=`), `/sincronizar` com latência configurável.
Qualquer outra `GET /esteira/*` que o simulado base não conheça (ex.: `/esteira/hoje?primeiro=1`, `/esteira/hoje/primeiros`) cai no handler genérico: devolve a fixture de Hoje (fatiada se houver `limite`/`primeiro`, com `"parcial": true`), com a latência `generico` (padrão = `hoje`) ou `parcial`.

## Limitações
- É Chromium desktop com viewport 390x844, toque e CPU x4 emulada; não é Android real.
- Rede: o CDP limita só o que passa pela pilha de rede (HTML/JS/CSS do site). Respostas simuladas (Worker e imagens) não sofrem o CDP; recebem atraso calculado = latência da rota + RTT + bytes/banda (imagem com tamanho nominal `--foto-kb`).
- Cache HTTP frio (`no-store`) e IndexedDB vazio em cada repetição; a sessão vem de um login simulado prévio.
- As rotas do Worker são fixtures: tamanho/forma das respostas é aproximado.
- Em "Fotos direto" a última aba vem da dica gravada pelo próprio app em localStorage (o app só abre direto em Fotos com essa dica).
