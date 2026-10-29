# Tecido e fluidez do atendimento — 7.40.26

Tarefa: cadastrar e reconhecer o tecido, refinar produtos com características combinadas e localizar atendimentos sem percorrer botões grandes.

Tecido fica na ordem logo após Nome da peça no cadastro, em seção própria com realce discreto, sugestões reais e campo livre. Admin total pode adicionar/renomear nomes. O Worker autentica a sessão e exige gerir_acessos; demais perfis podem cadastrar peças, sem modificar o dicionário compartilhado. A alteração usa revisão e escrita condicional para evitar sobrescrever mudanças concorrentes. Histórico de nomes/autoria fica privado, sem exposição no GET público.

Os produtos continuam persistindo tecido numa linha dedicada da descrição, compatível com Apps Script 4.28. Nomes antigos são aliases do novo nome: não há varredura/escrita em massa no catálogo nem remoção de dados. O filtro vale na vitrine, nas sugestões da pesquisa, nos links compartilháveis, na Gestão e no seletor do atendimento, combinando com tamanho, gênero, categoria e cor. Valores sem registro explícito de tecido não são inferidos da foto ou da prosa.

A interface de Mensagens segue o HTML/MHTML anexado pelo proprietário: cabeçalho com identidade em segunda linha, abas com traço laranja, busca com ícone, filas discretas com contagens, introdução com Selecionar, avatares suaves e navegação inferior com ícones. Os canais vinculados continuam distintos e agrupados; as linhas secundárias são menores. Funções existentes e permissões foram preservadas.

Revisão visual: 320/390/412/1440, texto 100/130%, teclado/altura470, gaveta, filtros, vazio, envio/salvamento simulados e retorno por Escape. Alvos de ação de pelo menos44px, navegação52px e botão Salvar48px. O rodapé de salvar é separado da região rolável para não encobrir campos. Sem rolagem lateral ou falhas sérias/críticas de axe nas jornadas testadas. Referência de antes: 7.40.25 e screenshots enviados pelo proprietário; depois e capturas de cadastro/gestão arquivados no Cofre.

Testes dirigidos: Worker436, filtros58, gestão de tecidos com aliases/persistência/ACL em cinco viewports, caixa compacta em quatro viewports, ficha30, assinatura22 e editor interno de tamanhos em quatro viewports. Nada enviado a clientes, nenhuma IA paga, sem alterações em produtos reais.

Resultado: APROVADO COM LIMITAÇÃO — testes Chromium com serviços simulados; Android físico e fluidez percebida no aparelho permanecem dependentes de validação humana. A implantação é web/Workers; não exige novo instalador ou publicação manual do Apps Script.
