# Contrato visual e operacional TENKiTER

## Inspeção antes da mudança

1. Abra a tela em uso e uma tela vizinha com a mesma finalidade. Leia o HTML e a ordem dos CSS carregados; o nome de um arquivo não prova que ele está ativo.
2. Registre tokens e componentes relevantes: fonte, escala de títulos/textos, cores semânticas, espaçamento, campos, botões, listas, janelas, ícones, mensagens e estados.
3. Escreva o contrato da mudança: tarefa, conteúdo prioritário, ações secundárias, estados, continuidade do trabalho e critérios de sucesso. Use poucos tópicos, proporcionais ao escopo.
4. Compare alternativas pelo esforço da pessoa e pela compatibilidade com o produto. Prefira a solução mais simples que resolva a tarefa inteira.

## Fontes do padrão existente

- `catalogo.css` contém tokens base como `--laranja`, `--laranja-txt` e fontes Inter/Poppins. `acabamento.css`, `acabamento-admin.css` e `acabamento-equipe.css` refinam áreas diferentes; confira a cascata e os tokens `--tk-*` em uso, em vez de copiar valores isolados.
- Para texto laranja, use `--laranja-txt`; a cor de preenchimento não garante contraste de texto. Estados de sucesso, atenção e erro preservam significado entre telas e precisam de rótulo/ícone acessível.
- `common.js`, `TKCamadas` e `atribSrc` mantêm contratos compartilhados. Preserve foco, voltar/Escape, rolagem, segurança e contexto; uma mudança de aparência não pode quebrá-los.
- Interface nativa usa os recursos e componentes Android existentes. Não transplante CSS ou medidas em CSS px para dp/sp sem adaptação e teste.

Os arquivos acima são pontos de partida, não uma autorização para normalizar todo o legado. Confirme o padrão ativo e registre inconsistências preexistentes separadamente.

## Composição e densidade

- Uma ação dominante por área; secundárias disponíveis sem competir. Rótulos estáveis, curtos e específicos em português do Brasil.
- Use a escala de espaçamento existente, priorizando múltiplos de 8 e ajustes internos de 4 px. Evite números novos para cada card, fonte ou raio.
- Listas operacionais devem permitir comparar e percorrer muitas linhas. Metadados secundários podem usar texto menor, mas precisam continuar legíveis com ampliação; nunca reduzir alvo de toque para ganhar densidade.
- Use ícones da família já adotada, com peso e tamanho coerentes. Evite misturar emoji e bibliotecas diferentes como decoração; não substitua ícones funcionais existentes sem avaliar o fluxo.
- Informações secundárias aparecem sob demanda com toque e teclado; tooltip exclusivo de hover não atende celular. Fechar detalhes devolve foco/contexto.
- Textos longos, nomes, números e chips devem se acomodar. Truncamento inevitável exige acesso ao valor completo; significado não depende de cor.

## Dados e gráficos úteis

Escolha a representação pela pergunta: evolução no tempo em linha, comparação entre categorias em barras, detalhes comparáveis em tabela. Mostre unidade, base e período; evite 3D, eixos enganosos, velocímetros decorativos e roscas para dezenas de categorias. Gráficos precisam de resumo e acesso aos valores por texto/tabela.

Comparações exigem períodos e população compatíveis. Explique a diferença entre contagem, taxa, média e percentil quando relevante; percentuais precisam de denominador. Não deduza causalidade ou qualidade de atendimento de um número isolado. Filtro deve atualizar todos os blocos afetados ou sinalizar claramente exceções.

Atualização ao vivo deve preservar foco, seleção, rascunho e posição. Informe dados desatualizados e falhas sem apagar a última informação válida. Não use animação constante nem anuncie cada mudança irrelevante para leitores de tela.

## Feedback e continuidade

- Ação assíncrona responde visualmente desde o primeiro clique; não admite submissão duplicada. Progresso percentual só com base real; caso contrário, exiba etapa e estado indeterminado.
- Diferencie salvando, salvo localmente, sincronizado, em fila, concluído e falhou. Sucesso visual depende da confirmação correspondente.
- Retry mantém trabalho e identidade da operação; informe falha parcial por item. Cancelar/voltar e troca de aba não podem perder alterações silenciosamente.
- Ação destrutiva tem consequência clara e possibilidade de desfazer quando suportada. Não desenhe botão sem conexão funcional, permissão, estado de erro e conclusão.

## Evidência proporcional e verificável

Use fixtures realistas sem dados privados: nomes longos, listas extensas, valores ausentes, mídia lenta, erro parcial e permissões distintas. Não envie mensagens nem publique mídia real como teste.

Para mudança visual, registre rota, commit, viewport, cenário, passos, expectativa e resultado; capture contexto e detalhe da alteração com dados seguros. Compare antes/depois na mesma escala. Execute a jornada principal, abra/feche e retome; valide consumidores afetados quando o componente for compartilhado.

Se houver diferença entre teste simulado, navegador, emulador e aparelho físico, declare exatamente o que foi validado. Nenhum número de screenshots ou testes substitui examinar o resultado e corrigir defeitos conhecidos.
