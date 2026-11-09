# Revisão — Mensageiro mais rápido (v7.69.0)

Lote: abrir na hora (lista, conversa, troca de aba) com o que está guardado no aparelho e confirmação pela rede em segundo plano.
Mudança de comportamento, **sem mudança visual**: nenhum componente novo, cor, tamanho ou texto novo na tela.

## O que mudou para quem usa
- Lista, conversa e abas aparecem do que ficou guardado neste aparelho (por conta; sem senha, link ou foto) enquanto a rede confirma.
- O campo de resposta fica livre desde o primeiro instante e o texto digitado não some quando a atualização chega.
- A lista não espera mais o resumo para carregar; encostar numa conversa já começa a buscá-la.

## Checklist da skill (estética humana)
- Funcionalidade: abrir, trocar de aba, abrir conversa, digitar e enviar com servidor lento simulado de 2,5 s (teste `mensagens_velocidade_ui.py`): lista em dezenas de ms, conversa em dezenas de ms, bolha de envio imediata.
- Conforto: nada pisca nem muda de lugar; se a conversa atualizada for idêntica à guardada, o cabeçalho e o campo de texto não são refeitos (foco e caret preservados).
- Mobile e desktop: capturas 320, 390, 412 e 1440 px nesta pasta (`lista-guardada-*`, `conversa-guardada-*`), tiradas 150 ms depois de abrir com a rede simulada em 2,5 s. Sem rolagem horizontal em nenhuma largura.
- Alvos de toque, contraste e foco: inalterados (nenhum elemento novo).
- Privacidade: o que fica no aparelho é apagado ao sair da conta, ao recusar o acesso (401/403) e após 24 h; é separado por conta + sessão (hash). O teste confere que nenhuma credencial entra no guardado.

## Limites
- Chromium e serviços simulados; não é validação em Android real.
- Medições em produção feitas em Chromium emulando celular médio (CPU 4x mais lenta, 4G lenta), ver descrição do PR.
