# Fotos com IA — página dedicada e revisão integral (03/11/2026)

Tarefa humana: o funcionário combina peças por pessoa, organiza várias fotos de campanha, acompanha a criação e aproveita resultados aprovados no catálogo, sem repetir configurações ou perder o trabalho ao sair.

## Contrato e esboço antes da implementação

Referências: identidade do catálogo e cabeçalhos de Gestão/Esteira. Fonte Inter/Poppins, preto quente, laranja de ação, fundos areia/brancos, bordas discretas, alvos de pelo menos 44 px. A página `fotos-ia.html` tem navegação para Gestão e Esteira, sessão compartilhada e duas áreas de trabalho: Lote e Resultados. Ajustes de instrução/motores ficam separados, para o gestor. Nenhum tema, fonte ou biblioteca nova.

```
TENKiTER                 Fotos com IA          Voltar à Gestão
[Lote] [Resultados · 3] [Ajustes (gestor)]
Rascunho salvo neste aparelho · 2 de 20 imagens hoje

Lote: 2 fotos                                 + Nova foto
Foto 1 · 2 pessoas · Estúdio TENKiTER          Editar / Usar como base
Foto 2 · 3 pessoas · Luz natural              Editar / Usar como base
                               Enviar 2 fotos para criação

Foto em edição
Pessoa 1 · esquerda              Pose: Frente
  Cima e baixo: Blusa TK-0123 + Short TK-0456
  Miniaturas, público e tamanho; Escolher/Trocar referência
Pessoa 2 · direita               Pose: Leve 3/4
  Look completo: Conjunto TK-0827
+ Adicionar pessoa    /    Mover pessoas para esquerda/direita
Cenário e estilo da foto · Formato/motor sob opções
                               Salvar foto no lote
```

Uma pessoa é um look explícito (look completo ou cima+baixo). Quantidade de pessoas é derivada da lista; quantidade de referências tem limite próprio, apresentado antes de enviar. A mesma peça pode participar de combinações diferentes sem inventar roupas. Duplicar usa nova identidade e permite trocar peças/poses; editar pedido já enviado não muda silenciosamente uma geração confirmada.

O seletor de peças mostra nome/código, público e tamanho do cadastro e permite escolher a foto de referência. Arquivos do aparelho são identificados como sem cadastro; não fingir conhecer idade/tamanho. Cenários e poses são presets coerentes com fotografia de catálogo TENKiTER; a fidelidade da peça e seus dados prevalecem.

Upload/recebimento do pedido, fila do processador, geração e aprovação são estados distintos. Clique duplo não repete pedido. Falhas parciais conservam os pedidos restantes e sua identidade; pedidos confirmados continuam acessíveis. Credenciais não entram no rascunho. Página fechada não promete continuar enviando arquivos que ainda não chegaram ao servidor.

## Defeito reproduzido do print

Produção tinha `schema_ig_version=20261103-fotos-postadas-1`, mas a tabela fotoia não tinha request_id/índice correspondente. A versão genérica fazia iniciar retornar antes da alteração adicionada na entrega 7.51.0. Consultas de envio por identidade falhavam antes de criar o pedido e eram traduzidas para erro genérico. Testes anteriores com tabela nova/coluna pronta não cobriam upgrade de banco existente. Corrigir o guard de migração e testar esse cenário real, além de chamadas repetidas/concorrentes, sem gerar IA real.

Reparo operacional aditivo realizado com Time Travel registrado no Cofre: campo/índice adicionados, 16 registros preservados, nenhum pedido/imagem real criado como teste. Código final deve fazer a verificação da estrutura de Fotos IA independentemente do marcador genérico.

## Critérios de conclusão

- Login/permissões, planejamento 3/2/2/1 pessoas, combinação/reuso/troca de referências, poses, estilo, edição/duplicação/reordenação e retomada do rascunho.
- Envio duplo, falha parcial, resposta perdida e confirmação por identidade, fila/espera, aprovação/comparação, capa/galeria/misto e ajustes do gestor.
- Migração sobre banco existente, concorrência de processamento, limite real por motor e atributos do cadastro no servidor.
- Mobile 390×844 e 412×915, desktop 1440×900, reflow 320 px, texto 130%, altura 470, teclado/toque/voltar, foco, axe e capturas realmente inspecionadas.
- CI verde, merge normal e deploy oficial, versão/arquivos/rotas publicados conferidos; Apps Script e APK só mudam se necessário e comprovado. Não tratar simulações como homologação física ou fidelidade real dos modelos.

## Evidência da execução

Referência anterior: print real enviado pelo proprietário (lote de duas fotos com erro genérico e controles de edição/envio sem resultado) e [entrega anterior](fotos-ia-20261103.md). A página reaproveita `catalogo.css`, Inter/Poppins, preto/laranja/fundo claro, sessão comum, `TKCamadas`, `TKFotoGrande` e links canônicos; sem biblioteca ou tema novo. A entrada da Gestão agora é link normal para a página, mantendo sua permissão.

Jornadas executadas com Playwright/Chromium e rede simulada: entrada pela Gestão, escolha e busca de peça, fechamento/foco por Escape, validação de roupa incompleta, foto sem cadastro e público obrigatório; quatro fotos com 3/2/2/1 pessoas; reuso intencional de referência entre pessoas, troca de posição e pose; rascunho recuperado após recarregar, inclusive Blob do aparelho; clique duplo, falha parcial e resposta perdida com confirmação por identidade; digitação/foco da próxima foto preservados quando chega a confirmação do envio anterior. Aprovação, descarte/histórico, ajustes e permissões. Incorporação repetida em dois produtos preservando capa anterior, galeria, preço e vídeo; falha na associação do misto seguida de retomada sem criar outro cadastro; vitrine abre componentes com preço e link para o produto completo.

SQLite real: upgrade com marcador genérico já atualizado e coluna ausente, índice único, idempotência, registros preservados e falha de migração propagada; planos v2, posições, poses/direção e dados autoritativos do cadastro, incompatibilidade infantil/adulto/idades, confirmação por identidade e claim concorrente do mesmo pedido. Contrato antigo mantido. Regressão do Worker Instagram: 407 verificações; Esteira Fotos: 52 verificações.

Viewports: 390×844, 412×915, 1440×900 e 320×700; texto 130% em 390 px; altura 470 px como simulação da área disponível com teclado (não comprova teclado nativo). Sem rolagem horizontal; fechar seletor permanece visível e mede pelo menos 44 px. Controles principais ≥44 px, foco visível, nomes acessíveis; axe WCAG 2 A/AA sem violações nos editores testados. Movimento reduzido foi exercitado. Cabeçalho ~146 px na configuração base; em altura curta deixa de ser fixo para liberar área. Conteúdo usa margem de rolagem para não esconder o foco sob o cabeçalho. Nenhuma barra inferior nova.

Capturas inspecionadas (imagens de referência/resultado explicitamente simuladas, não qualidade de IA):

- [Editor celular](fotos-ia-pagina-20261103/editor-390.png)
- [Editor computador](fotos-ia-pagina-20261103/editor-1440.png)
- [Uso nos produtos](fotos-ia-pagina-20261103/produtos-412.png)
- [Seletor em altura de 470 px](fotos-ia-pagina-20261103/picker-470.png)

Resultado da revisão de interface: **APROVADO COM LIMITAÇÃO**. Jornadas web simuladas funcionais; fidelidade de roupas, latência e disponibilidade reais dos provedores precisam de aprovação humana com roupas reais. Não foi usado aparelho físico. No APK atual, o link de página dedicada abre no navegador conforme a política nativa de navegação; a ponte privilegiada continua restrita a `admin.html`. Não houve mudança no APK nem no Apps Script. Somente pedidos já recebidos continuam no servidor com a página fechada; rascunhos/arquivos restantes retomam ao reabrir. Não há promessa de geração gratuita ilimitada, nem de publicação automática após aprovação.

Graphify: início e consulta do fluxo antigo antes da exploração; `ensure` final com **5.390 nós / 12.232 relações**, local e sem LLM. Consulta `TKFotoIAPlano TKFotoIAServico processarFotoIA garantirEsquemaFotoIA_ rotasFotoIA`, orçamento 650 tokens; relações confirmadas nas fontes e nos testes. Saída truncada pelo orçamento e cobertura parcial de parser: o grafo não substitui validação de DOM, migração ou compilação.
