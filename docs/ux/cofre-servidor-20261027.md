# Conexões: cofre com as chaves do servidor e "Ligar mensagens do Direct" — 27/10/2026 (site 7.38.0)

Pedido do Pablo: "Quero que a chave fique guardada aqui, veja quais outras estão faltando também guardar no cofre e faça aparecer pois perdi a chave que já tinha colocado".

Skill aplicada: `.claude/skills/tenkiter-estetica-humana/SKILL.md`. Evidência: `cofre-servidor-20261027/01-cofre-aberto-390.png`, `02-cofre-aberto-1440.png` e `05-ligar-direct-390.png`.

## Tarefa humana
O gestor recupera uma chave que perdeu (a do Zernio) sem ter que procurar em outro lugar, e liga o Direct sem colar a chave de novo. A atenção vai primeiro para o nome da chave e "Guardada (termina em …)".

## Como ficou
- Cofre aberto: depois das chaves do Apps Script (Render, Cloudflare, OneSignal, Instagram) vêm Zernio, Wafly 1 e 2, Wame, Gemini, FreeConvert, ponte dos contatos e Android, cada uma com o mesmo botão "Copiar".
- Chave que não está guardada: botão cinza e desligado (antes ficava laranja e parecia ativo).
- Zernio com chave e Instagram, mas sem o aviso: a situação diz para tocar em "Ligar mensagens do Direct", e o botão aparece acima dos passos. Depois de ligar, confirma "Pronto: as mensagens do Direct passam a chegar em Mensagens → Instagram." e o botão some.

## Medições e testes
- Botões do cofre: 44 px. Sem rolagem horizontal em 390 e 1440. axe sem violações no cofre aberto.
- `tests/cofre_admin.py`: 31 (13 novas: Zernio/Wafly/Gemini no cofre, só o final, sem chave desligado, cópia do Zernio e da Wafly, código de abertura, nada na tela, senha errada contada uma vez, servidor fora do ar abre pelo Apps Script, trancar fecha os dois).
- `tests/conexoes_zernio.py`: 26 (4 novas do botão "Ligar mensagens do Direct").
- `worker_mensagens_conversa`: 243 (12 novas do cofre do servidor: lista só o final, permissão, trancado, senha errada, login repassado, código, nome desconhecido, revelar, registro de quem copiou, chave ausente, trancar).
- Continua passando: `conexoes_unificada`.

Resultado: APROVADO COM LIMITAÇÃO. Serviços simulados; a cópia real depende do servidor publicado e da senha do Pablo.
