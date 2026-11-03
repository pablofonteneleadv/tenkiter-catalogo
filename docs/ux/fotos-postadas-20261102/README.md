# Fotos postadas e fotos novas — v7.49.0

Pedido do Pablo: "Hoje temos 10 produtos com 1 foto cada, postamos as fotos; depois batemos outras fotos para cada um deles. Quando eu for postar, quero ver qual foi postado e qual não."

## Tarefa humana e critérios de sucesso

- **Quem usa:** quem monta postagens no painel (Postagens → Nova postagem) e a cliente na vitrine.
- **Ação esperada:** ao escolher a peça, postar as fotos que ainda não saíram sem precisar lembrar quais já foram postadas.
- **Critérios observáveis:** foto já postada vem desmarcada e com selo em texto ("Postada hoje", "Postada há 1 dia", "Postada há N dias"). A pessoa pode marcá-la e usar com modelo ou colagem. Se todas já saíram, um aviso diz isso e nada vem pré-marcado. Na lista de peças, cada peça mostra um sinal discreto ("2 fotos novas para postar", "Tudo já postado há 5 dias", "Foto ainda não postada"). Peça com foto nova aparece no começo da ordem "mais recentes", na vitrine e no postador.

## Decisões

1. **O que conta como postada:** status `publicado` (inclusive "Publicado sem confirmação"), `manual_feito`, ou a perna do WhatsApp `confirmado`/`sem_confirmacao`. No "ambos", isso vale mesmo quando o Instagram falhou. Agendado, erro, cancelado e repostado não contam. A data é `publicado_em` (ou `atualizado_em` quando só o WhatsApp saiu).
2. **Ligação com a foto original:** a postagem nova guarda em `postagem.fotos_origem` (coluna aditiva, sem migração) as fotos originais do catálogo (`Foto_URL`/`Fotos_Galeria`) que usou, no formato `[{u, p}]`:
   - com modelo, recorte ou enquadramento, a imagem gerada é nova, mas a origem continua sendo a foto do catálogo;
   - numa colagem, todas as fotos usadas contam como postadas;
   - "Repostar" copia a origem.
3. **Postagens antigas (sem `fotos_origem`):** primeiro casam pelo **endereço igual** (Feed sem modelo usava a URL do catálogo). Quando a mídia foi transformada (modelo antigo), casam pela **posição** da mídia na mesma peça, identificada pelo código gravado em `postagem.produto`. Isso segue a seleção padrão da época, que ia pela ordem das fotos. Nada além disso é deduzido. Uma colagem antiga marca só a foto da posição correspondente, e o erro possível é marcar de menos, nunca de mais.
4. **Recorte na Gestão (✂ Enquadrar):** a foto recortada ganha endereço novo. A Gestão informa de qual foto ela saiu (`de`), então o recorte **não** vira foto nova e herda o "postada" da original (`derivadas`).
5. **Seleção:** Feed escolhe a primeira foto não postada. Carrossel e Story completam a seleção só com fotos não postadas. Quando a lista de postadas não responde, o postador funciona exatamente como antes, sem selo, sem sinal e com a seleção de sempre. Se a lista chega depois de a peça ser escolhida, a seleção só é refeita enquanto a pessoa não tiver tocado nas fotos.

## Fonte da "última foto nova"

Tabela D1 `foto_catalogo (produto, url, visto_em, nova, de)`, criada com `CREATE TABLE IF NOT EXISTS`. Ela é alimentada sem mexer no Apps Script por três caminhos:

- **Gestão ao salvar:** o gancho existente `/esteira/toque` agora leva `antes` (as fotos que a peça já tinha) e `fotos` (as que entraram, com `de` quando é recorte). Preço, nome, tamanho e estoque não mandam fotos.
- **Comparação de retratos:** o retrato diário do estoque (cron) compara o conjunto de URLs de cada peça com o que já foi visto.
- **Mapa público expirado:** quando o mapa público expira, uma varredura roda em segundo plano, no máximo a cada 15 min.

Regras da tabela:

- A primeira varredura e as peças nunca vistas viram só referência (`nova=0`), porque a peça nova já aparece pela ordem do cadastro.
- Endereço novo numa peça já conhecida é foto nova (`nova=1`).
- Reordenar, tirar uma foto ou trocar a capa por uma foto que já existia não conta.

Mapa público: `GET /catalogo/fotos-novas` → `{ok, fotosNovas: {idDaPeça: dataISO}}`. Só id e data, sem URL, nome ou pessoa. Cache de 5 min no KV e `Cache-Control: public, max-age=60`, no padrão de `GET /familias`.

**Ordem "mais recentes":** a peça com foto nova (posterior ao próprio cadastro, cujo momento sai do ID em milissegundos ou de `Data_Cadastro`) entra antes da primeira peça cadastrada antes daquela foto. As demais mantêm a ordem recebida. Nome, preço, novidades e "mais consultados" ficam como a pessoa escolheu. A vitrine pinta com o cache local (10 min), espera o Worker no máximo 2,5 s e só reorganiza depois se a pessoa estiver no topo e sem janela aberta.

## Revisão da skill tenkiter-estetica-humana

- **Tela de referência:** a própria Nova postagem (seleção de mídias `.po-m`, cards `.po-card`) e o aviso de rascunho vizinho.
- **Reutilização:** reaproveitei as miniaturas, a faixa escura de texto que o selo de código já usava (`.po-c`), o laranja claro dos avisos (`#fff3e0`) e os chips arredondados. Não entrou biblioteca, fonte ou tema novo.
- **Selo:** é texto ("Postada" + "há N dias", duas linhas, 10,5 px em negrito), branco sobre preto quente a 88%, com contraste ≈ 13,7:1. Ocupa menos de 45% da altura da miniatura e a foto continua protagonista. O estado também entra no nome acessível ("Foto 1, postada hoje, não escolhida"). Não depende só de cor.
- **Sinal na lista:**
  - "fotos novas para postar": `#7a3a00` sobre `#fff1e0`, contraste 7,8:1;
  - "tudo já postado": `#4a4a4a` sobre `#f2f2f2`, contraste 7,9:1;
  - fonte de 11,2 px; os cards continuam com 44 px ou mais.
- **Aviso "todas postadas":** contraste 13,1:1, logo acima das fotos, com a próxima ação ("Toque numa foto para usar de novo").
- **Viewports:** 390×844 e 1440×900 (vitrine e postador, automatizados); 412×915 e 320×700 (postador e vitrine), sem rolagem horizontal. Pelo teclado, Enter marca uma foto postada. As miniaturas têm 62×110 a 80×100 px, todas com 44 px ou mais.
- **Estados testados:** com e sem fotos postadas, todas postadas, postagem antiga casada por posição, lista de postadas com erro (postador como antes), Worker das fotos novas com erro ou lento (vitrine como antes).
- **Ajuste feito na revisão:** a dica dizia "2 fotos novas marcadas" e ficava errada quando a pessoa marcava uma postada. Agora diz "2 fotos novas para postar".
- **Observação:** o contorno de foco das miniaturas segue o componente existente (não alterado aqui).
- **Resultado:** **APROVADO COM LIMITAÇÃO.** Validei em navegador (Chromium) com serviços simulados. Falta conferir em aparelho Android/APK real e com as postagens reais do D1 (casamento das postagens antigas).

## Evidência (abertas e examinadas)

- `vitrine_foto_nova_390.jpg`, `vitrine_foto_nova_1440.jpg`: a peça TK-0003 (antiga) no topo por ter foto nova.
- `postador_lista_390.jpg`, `postador_lista_1440.jpg`: os sinais "2 fotos novas para postar" e "Tudo já postado há 5 dias".
- `postador_fotos_390.jpg`, `postador_fotos_1440.jpg`: no carrossel, "Postada hoje" e "Postada há 3 dias" desmarcadas e as 2 novas marcadas.
- `postador_todas_postadas_390.jpg`, `postador_todas_postadas_1440.jpg`: o aviso "A foto desta peça já foi postada (a mais recente há 5 dias)".

## Testes

- `node tests/worker_fotos_postadas.js` → OK=31 FALHAS=0. Cobre:
  - a postagem guarda a origem e o modelo não vira foto postada;
  - colagem com 2 origens;
  - publicado conta e "Publicado sem confirmação" conta;
  - erro, agendado e cancelado não contam;
  - "ambos" com o WhatsApp confirmado conta;
  - legado;
  - "Repostar" copia a origem;
  - o mapa público tem cache, CORS e nenhum dado pessoal;
  - foto nova × preço/nome/estoque, peça nova, troca de capa;
  - toque com recorte;
  - sessão obrigatória.
- `TK_BASE=http://localhost:8794/ python3 tests/fotos_postadas_ui.py` → OK=80 FALHAS=0 (vitrine, postador, axe em 390).
- Os worker tests afetados passaram todos. A bateria de UI relacionada passou, com exceção de duas baterias que já falham igual na `main` (detalhes no PR).
