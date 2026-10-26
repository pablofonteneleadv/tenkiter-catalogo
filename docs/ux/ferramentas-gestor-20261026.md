# Ferramentas do gestor — 26/10/2026

Pedido do Pablo: "melhorar tudo isso, isso e dentro de cada (...) não pode tirar função, mas pode melhorar. Vá a fundo pois é configuração admin."

Skill aplicada: `.claude/skills/tenkiter-estetica-humana/SKILL.md`. Evidência (antes × depois, serviços simulados): `ferramentas-gestor-20261026/painel-390.jpg`, `auditoria-390.jpg`, `numeros-390.jpg`, `importar-390.jpg`, `postagens-390.jpg`, `configuracoes-390.jpg` (390×844) e `painel-1280.jpg` (1280×900).

## Painel
- Números do topo (visualizações, cliques no WhatsApp, peça mais vista) em cartões neutros. A peça mais vista mostra o código e o nome; antes aparecia "Ver produto", que não era link.
- Pedidos com cabeçalho neutro; Atualizar com ícone e 40 px.
- Ferramentas em 4 grupos com título: **Vendas e clientes** (Números reais, Mensagens, Enviar notificação), **Conteúdo** (Postagens, Fotos com IA, Treinamentos), **Planilha e histórico** (Exportar, Importar, Auditoria) e **Sistema** (Conexões; Configurações avançadas e Log logo abaixo).
- Cada ferramenta virou um cartão de 64 px: ícone num quadro de 40 px, título e uma linha dizendo para que serve. 1 coluna no celular, 2 a partir de 600 px e 3 a partir de 900 px. O selo de não lidas de Mensagens fica no cartão.
- Mesmos ids e as mesmas regras de permissão. Um grupo some quando a pessoa não tem nenhuma ferramenta dele.

## Dentro de cada janela
- Cabeçalho igual em todas: ícone de linha no lugar do emoji do título, linha fina embaixo e botão fechar de 44 px com borda. Abas com a escolhida em preto, como no resto do painel.
- Campos de busca, data, telefone e senha passam a ter 44 px e 16 px de texto em todo o painel (na Auditoria a busca tinha 22 px).
- Auditoria: datas lado a lado com rótulo, "Usuários" e "Limpar filtros" com 44 px e o Fechar com borda.
- Importar planilha: o campo de arquivo do navegador ("Choose File", em inglês) virou o botão "Escolher arquivo", com o nome do arquivo ao lado. O campo verdadeiro continua lá, invisível, e pode ser usado pelo teclado.
- Números reais: cartões brancos com borda, rótulo à esquerda sem emoji e número em preto (verde e vermelho continuam onde significam algo).
- Postagens e Fotos com IA: filtros com a escolha em preto. As cores dos destinos (Instagram, WhatsApp) continuam, porque identificam o canal.
- Configurações avançadas: três blocos com título (Endereço do sistema, Inteligência artificial e Conversão de vídeos), com ação principal preta e secundária com borda. O Log segue o mesmo padrão.

## Verificação
- Sem rolagem horizontal a 390 e 1280 px; sem erro de JavaScript.
- Testes: admin_gestao, mensagens_dashboard (selo no cartão), conexoes_*, central_avisos, central_contagens, foto_ia, postagens_admin, numeros_reais, novas_telas, axe_telas_b, auditoria_*, admin_categorias e lote_rapido.

Resultado: APROVADO COM LIMITAÇÃO. Não testado em aparelho físico.
