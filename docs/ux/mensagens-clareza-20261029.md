# Mensagens e ficha — organização aprovada

Tarefa principal: localizar o atendimento que precisa de resposta e responder sem perder a conversa ou o rascunho. No catálogo, identificar o tecido ao lado do código, abaixo das fotos.

A tela inicial usa quatro canais compactos, busca com botão Filtros, três filas e navegação Conversas/Funil/Com notas/Mais. Tipos e filtros secundários ficam no painel vertical; Mais agrupa atendimento, conta/aplicativo e exportação. Mantidos os filtros existentes, autorização por ferramenta e agrupamento por pessoa/canais. O responsável usa o mesmo filtro exclusivo já suportado pela API; etapa de venda continua combinável.

Ficha: nome, cidade/localização, preferências e seleção encadeada tamanho → gênero → tecido → cor. Opções vêm dos produtos ativos; escolhas anteriores ausentes do catálogo permanecem marcadas e removíveis. Grupos aceitam várias escolhas. A cidade oferece Crateús, Interior e os demais municípios do Ceará alfabeticamente; outra cidade e localização livre preservam registros fora das sugestões. Etapa da venda substitui o rótulo Etiquetas; registros não comerciais existentes são preservados, sem inventar uma ferramenta futura.

Localidades: 184 municípios a partir de https://github.com/kelvins/municipios-brasileiros/blob/main/csv/municipios.csv. Sugestões de bairros/distritos são parciais, conforme a proposta aprovada; não constituem cadastro oficial exaustivo. Entrada livre aparece primeiro.

Persistência: coluna adicional e idempotente `msg_ficha.perfil_json`, sem exclusão ou migração destrutiva dos dados antigos. Clientes antigos seguem funcionando. O tecido é um campo editável separado na interface, serializado em linha própria `Tecido:` da descrição para compatibilidade com Apps Script 4.28; não exige publicar Apps Script. Edição em lote, cópia, desfazer, duplicação e reset preservam esse contrato.

Integração: rebase sobre main 1aea7b3 (#293–#298), preservando multi-etiquetas de tamanho, resumo de idades/numerações e editor interno da peça. Testada a edição sem sair de Mensagens nem perder rascunho.

Revisão estética: 320×700/844, 390×844, 412×915, 1440×900, texto 100/130%, altura reduzida para teclado. Navegação inferior com alvos 48 px; filas/canais/seletores com pelo menos 44 px. Fotos, código/tecido, nomes, preços e ações não se sobrepõem. Ficha mantém Salvar fora da rolagem; escolhas longas usam quebra de linha e botões flexíveis. Busca, seleção, filtros, voltar/Escape, alterações não salvas e fluxo de envio simulados. axe sem falhas sérias/críticas nas telas testadas.

Evidências de antes/depois e screenshots da jornada são arquivadas no Cofre privado com o backup recuperável. Os testes usam serviços simulados, sem mensagens/push reais e sem consumir IA.

Resultado: APROVADO COM LIMITAÇÃO — navegador Chromium; Android físico e comportamento dos seletores nativos no aparelho ainda dependem de validação humana. Nenhum novo APK é necessário para esta alteração da interface web carregada pelo app.
