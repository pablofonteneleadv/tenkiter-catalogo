# Revisão — Instagram: janela real (v7.69.0)

Skill: tenkiter-estetica-humana. Chromium + serviços simulados (`tests/mensagens_instagram_janela_ui.py`); **não é validação em Android real**.

- Capturas 320/390/412/1440: `ig-30h-*.png` (30 h depois: nenhum aviso) e `ig-8dias-*.png` (aviso só além de 7 dias: "Já passaram mais de 7 dias da última mensagem deste cliente: o Instagram deve recusar a resposta.").
- Só mudou o texto/condição da dica existente (`#ms-dica`); nenhum componente, cor ou tamanho novo. Sem rolagem horizontal em nenhuma largura (conferido no script de captura).
- O botão Enviar continua habilitado em todos os casos (assert no teste).
