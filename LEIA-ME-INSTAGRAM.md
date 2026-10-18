# Importador do Instagram — "Produtos para aceitar" (v3.6, revisado em 18/10/2026)

O que faz: tudo que a loja posta no Instagram (foto, carrossel, Reel, Story) vira um **rascunho** no painel (aba 📥 Produtos para aceitar). Você aceita, ajusta as mídias, junta, separa ou descarta. Nada entra no catálogo sem o seu aceite. **Esta aba só LÊ o Instagram.** Quem publica é a aba separada **📸 Postagens** (Feed, Carrossel, Reels, Story; na hora ou agendado), decisão de 11/10/2026; para isso o token precisa também da permissão `instagram_business_content_publish`.

## Pegar o código de acesso (uma vez, pelo celular)
> A Meta muda as telas de tempos em tempos; se um nome estiver diferente, procure o parecido.

1. A conta **@tenkitermodasceara** precisa ser **Profissional** (Instagram → Configurações → Tipo de conta → Mudar para conta profissional → Empresa).
2. Abra **developers.facebook.com** (entre com o Facebook) → **Meus apps** → **Criar app** → tipo **Empresa/Negócios**. Nome: "Tenkiter Importador".
3. No app, adicione o produto/caso de uso **Instagram** → **API com login do Instagram** (*API setup with Instagram login*).
4. Em **Gerar tokens de acesso** (*Generate access tokens*) → **Adicionar conta** → entre com a conta da loja e aceite. Se pedir, em **Funções do app** adicione a conta como **Testador do Instagram** e aceite o convite no Instagram (Configurações → Apps e sites → Convites de testador).
5. Toque em **Gerar token**, **copie** (é um texto longo).
6. No painel TENKiTER: **📥 Produtos para aceitar** → cole o código → **Conectar**. Ele fica guardado só no servidor; a tela nunca mostra de volta.

O acesso dura ~60 dias e o Worker renova sozinho; se algo falhar, o painel mostra um aviso.

## Publicar o Worker
Automático: o `deploy.yml` publica o Worker `tenkiter-ig` (junto com `tenkiter-midia` e `tenkiter-og`) a cada merge na `main`. Não precisa de token seu nem de comando. O cron roda a cada minuto (publicação agendada) e import/leitura de fotos só nos minutos 0 e 30. Reserva manual, só se o GitHub estiver fora: `CLOUDFLARE_API_TOKEN=<token> python3 instagram-worker/publicar.py` (token que edite Workers **e D1**; revogar depois).
