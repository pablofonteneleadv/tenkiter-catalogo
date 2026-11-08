# Revisão estética — regras e dados (v7.57.0)

Tarefa humana: escolher a categoria de várias peças pela Gestão sem inventar nome; filtrar a vitrine pelo preço que o cartão mostra.
Referência: janela da Gestão (`overlay-gestao`, mesma de "Códigos gerados"); linha de preço da vitrine. Sem componente novo: lista de botões de 48 px, uma ação dominante só (Admin total: "Usar essa categoria").
Viewports: 390×844 e 1440×900 (Chromium, serviços simulados). Fotos: `categoria-lote-{equipe,admin}-{390,1440}.png`, `filtro-preco-{390,1440}.png`.
Medições: todos os botões da janela ≥ 44 px; sem rolagem horizontal; equipe não vê "criar nova", só o aviso "Só o Admin total cria categorias novas".
Corrigido na revisão: opções em laranja (várias ações dominantes) passaram a neutras.
Resultado: APROVADO COM LIMITAÇÃO — só Chromium simulado; não validado em Android nem aparelho físico. Mensagens de erro/"Sem confirmação" revisadas por texto e teste, sem captura própria.
