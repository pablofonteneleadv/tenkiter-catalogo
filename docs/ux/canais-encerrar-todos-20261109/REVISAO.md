# Revisão — encerrar cliente com vários canais (v7.68.0)

Skill: tenkiter-estetica-humana. Chromium + serviços simulados (`tests/mensagens_canais_selecao.py`); **não é validação em Android real**.

- Capturas: `canais-320.png`, `canais-390.png`, `canais-412.png`, `canais-1440.png` (diálogo "Encerrar conversa" com o aviso dos outros canais).
- Antes: barra da seleção tinha a pergunta "Incluir os outros canais deste cliente?" e o botão "Selecionar canais". Agora a barra só tem Todas/Cancelar, Marcar lidas, Não lidas e Encerrar.
- Aviso: uma frase curta no diálogo de motivo ("Ao encerrar este atendimento, os outros canais do mesmo cliente também serão encerrados: Instagram, WhatsApp 2."); em lote: "Se algum cliente tiver mais de um canal, todos os canais dele serão encerrados." Depois, o aviso diz "Também encerrados (mesmo cliente): ...".
- Sem componente novo: usa `.ms-cfg-res` já existente; os botões de motivo mantêm 44 px. Caber na tela: texto quebra linha, sem rolagem horizontal (ver `janelas_sem_estouro.py`).
- Confirmação: a escolha do motivo é a confirmação (padrão da tela); sem `confirm()` extra, pois o aviso e o motivo já dizem a consequência.
