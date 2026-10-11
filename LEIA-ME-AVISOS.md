# Avisos (notificações) + instalar o app — guia do Pablo

Tudo o que o site faz sozinho já está pronto (v3.4 do site + `catalogo-codigo-3.3.gs.txt`). Falta só **ligar o OneSignal para a Web** e
**colar o código novo no Apps Script** — são os dois passos abaixo. Sem o passo 1 **nenhum aviso chega em celular nenhum** (é por isso que o app
instalado mostrava "Sem permissão": o OneSignal ainda não estava configurado para sites).

## Como funciona (resumo)

- Quem entrega a notificação é o **OneSignal** (serviço pronto, gratuito para o nosso porte). O site e o painel só dizem *quem* recebe e *o quê*.
- Cada pessoa precisa **tocar em "Ativar avisos"** uma vez no próprio aparelho. O Android e o iPhone **não deixam** o site ativar sozinho — é regra
  do sistema. O site cuida para o convite aparecer no momento certo (logo depois de instalar o app, ao abrir o app instalado, no sininho 🔔 do topo,
  na tela do pedido).
- Ao entrar na conta, o aparelho é ligado à pessoa por um código secreto calculado no servidor (`pushId`). É por isso que a Central consegue avisar
  **equipe, alunos, clientes com conta, um perfil, quem tem um acesso, uma pessoa só ou o cliente de um pedido**. Quem não tem conta recebe os avisos
  gerais ("todos", "quem instalou o app", "por interesse") e o andamento do próprio pedido.

## Passo 1 — Ligar a plataforma **Web** no OneSignal (10 minutos, uma vez)

1. Entre em **onesignal.com** → app **TENKiTER** (App ID `535f6b0d-c866-43c2-b241-43bd7ab62fae`).
2. **Settings → Push & In-App → Web** (também aparece como *Platforms → Web*). Toque em **Configure** / **Activate**.
3. Escolha **Typical Site** (código personalizado — *Custom Code*), não "WordPress" nem "Wix".
4. Preencha:
   - **Site Name:** `TENKiTER Modas`
   - **Site URL:** `https://tenkitermodas.com.br` (exatamente assim: com `https`, **sem** barra no final e **sem** `www`, a não ser que o site abra
     com `www`; tem que ser o endereço que aparece na barra do navegador)
   - **Auto Resubscribe:** ligado
   - **Default Icon URL:** `https://tenkitermodas.com.br/icon-512.png`
5. **NÃO ligue** os pedidos automáticos de permissão do painel do OneSignal (*Permission Prompt Setup*, *Slide prompt*, sininho do OneSignal): o site
   usa o convite próprio, que pede no momento certo. Se ligar, pode aparecer pedido duplicado.
6. **Não precisa** subir nenhum arquivo (o `OneSignalSDKWorker.js` já está no site) nem colar o código do SDK (o site já carrega).
7. Salve. Para conferir: no painel do site, **Gestão → 📢 Enviar Notificação → ⚙️ Preparar → 🔄 Verificar de novo** — o item 2 tem que ficar ✅.

> Se o domínio estiver no Cloudflare: deixe o **Rocket Loader** desligado (Speed → Optimization) e não bloqueie `OneSignalSDKWorker.js` em regras de
> segurança.

## Passo 2 — Chaves no Apps Script (5 minutos, uma vez)

No Apps Script do **catálogo**: ⚙️ **Configurações do projeto → Propriedades do script → Editar propriedades** e confira/crie:

| Nome | Valor |
|---|---|
| `ONESIGNAL_APP_ID` | `535f6b0d-c866-43c2-b241-43bd7ab62fae` |
| `ONESIGNAL_REST_API_KEY` | a **REST API Key** do app (OneSignal → Settings → **Keys & IDs**) — *nunca* coloque no GitHub nem em conversa |

Opcionais (só se quiser):

| Nome | Para quê |
|---|---|
| `PUSH_SEGMENTOS` | nomes de segmentos criados no OneSignal, separados por vírgula (aparece como público extra na Central) |
| `PUSH_NOVO_PEDIDO` | `false` desliga o aviso à equipe a cada pedido novo (também dá para mudar na Central → ⚙️ Preparar) |
| `PUSH_PEDIDO_AUTO` | `false` desliga o aviso ao cliente quando a etapa do pedido muda |

## Passo 3 — Colar o código novo (como sempre)

1. Abra `catalogo-codigo-3.3.gs.txt`, selecione **tudo**, copie.
2. Apps Script do catálogo → apague o código antigo, cole o novo, **Salvar**.
3. **Implantar → Gerenciar implantações → ✏️ → Versão: Nova versão → Implantar.**
4. Confira no navegador: `<sua URL do script>?action=versao` tem que mostrar `"versao":"catalogo-3.3"`, `"pushCompleto":true` e `"categoriasGestao":true`.

O 3.3 já inclui tudo do 3.2 (categorias) — não precisa colar o 3.2 antes. O Apps Script de **funcionários não muda** (`funcionario-codigo-3.0.gs.txt`).

## Passo 4 — Teste no celular de verdade (uns 5 minutos)

**Android (Chrome):**
1. Abra `tenkitermodas.com.br`, vá até o **fim da página** → **Instale o app** → **Instalar no Android** → confirme.
2. Abra o app pelo ícone. Aparece o convite **"Receba os avisos da TENKiTER"** → toque em **Ativar avisos** → **Permitir**.
3. Entre com a sua conta (WhatsApp + senha) no painel → **Gestão → 📢 → ⚙️ Preparar → "Mostrar notificação de teste"** (aparece no topo do celular).
4. Na aba **✉️ Enviar** → **📱 Enviar teste para mim**. Tem que chegar em segundos, até com o app fechado.

**iPhone (iOS 16.4 ou mais novo):** abra no **Safari** → fim da página → **Instale o app** → **Abrir o menu Compartilhar** → **Adicionar à Tela de Início**
→ abra pelo ícone → **Ativar avisos**. (No iPhone só funciona com o app instalado; no Safari comum a Apple não deixa.)

### Se o app mostrar "Sem permissão" (como no seu print)

- Toque no ícone do app → **Informações do app → Notificações → Permitir**.
- **Desligue "Pausar atividade no app quando não usado"** — enquanto estiver ligado, o Android **tira a permissão** de apps que ficam uns dias sem abrir.
- **Bateria → Sem restrições** para o TENKiTER (assim o aviso chega com o app fechado).
- Xiaomi/Redmi/POCO: **Segurança → Permissões → Início automático → TENKiTER**.
- O site mostra esses passos sozinho no sininho 🔔 → *"O aviso não aparece com o app fechado?"*.

## Como usar a Central (Gestão → 📢 Enviar Notificação)

- **✉️ Enviar:** escolha o **público** (todos • quem instalou o app • por interesse • equipe • alunos • portal • clientes com conta • por perfil • por acesso •
  pessoas específicas • cliente de um pedido • clientes com pedido numa etapa • segmento do OneSignal). A prévia mostra quantas pessoas. Escreva título e
  mensagem (use `{nome}` para o primeiro nome da pessoa — vale para avisos a contas), link (qualquer `https://` ou uma peça da loja), imagem grande,
  validade e, se quiser, **agende** (até 30 dias). O botão **📱 Enviar teste para mim** manda só para o seu aparelho.
- **📜 Histórico:** quando e quem enviou, para quem, **entregues / cliques / falhas** (o OneSignal leva alguns minutos para fechar a conta),
  **cancelar** aviso agendado e **usar de novo**.
- **🧩 Modelos:** crie, edite e apague seus próprios modelos (aparecem como botões na aba Enviar).
- **⚙️ Preparar:** checklist do que falta (chave, plataforma Web, este aparelho), quantas contas por grupo e os **avisos automáticos**
  (equipe é avisada a cada pedido novo; cliente é avisado quando a etapa do pedido muda) — só o Admin total liga/desliga.
- Quem tem a permissão `catalogo_push` usa a Central; só o Admin total (`gerir_acessos`) muda os avisos automáticos.

## Limites e cuidados

- Só recebe quem **ativou os avisos no próprio aparelho**. Na prévia/resultado, a Central lista quem ficou sem aparelho.
- Aviso com `{nome}` vai um por pessoa (até 300 pessoas por envio).
- Se a pessoa **bloquear** nas configurações do celular, o site não consegue desbloquear: ele mostra o passo a passo.
- Dentro do navegador do **Instagram/WhatsApp** não existe aviso nem instalação: o site orienta a abrir no Chrome/Safari.
- A entrega depende do OneSignal e do Google/Apple; o histórico mostra o que foi aceito, e "entregues" é a conta final.
- Privacidade: o aparelho guarda só as escolhas de aviso e chaves opacas de pedido; nenhum nome/telefone fica no aparelho. A política de privacidade
  do site cita os avisos.

## O que NÃO dá para testar fora do celular

A instalação e a entrega de verdade dependem do Android/iPhone e do OneSignal. Os testes automáticos (`python3 tests/rodar_tudo.py`) usam um OneSignal
simulado e provam que o site pede a permissão no toque certo, liga a conta, guarda as escolhas e que o Chrome considera o site instalável. O roteiro
acima é a prova final no aparelho.
