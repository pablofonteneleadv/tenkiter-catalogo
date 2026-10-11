# Importador do Instagram — "Produtos para aceitar" (v3.6)

O que faz: tudo que a loja posta no Instagram (foto, carrossel, Reel, Story) vira um **rascunho** no painel (aba 📥 Produtos para aceitar). Você aceita, ajusta as mídias, junta, separa ou descarta. Nada entra no catálogo sem o seu aceite. **Só lê o Instagram — nunca posta.**

## Pegar o código de acesso (uma vez, pelo celular)
> A Meta muda as telas de tempos em tempos; se um nome estiver diferente, procure o parecido.

1. A conta **@tenkitermodasceara** precisa ser **Profissional** (Instagram → Configurações → Tipo de conta → Mudar para conta profissional → Empresa).
2. Abra **developers.facebook.com** (entre com o Facebook) → **Meus apps** → **Criar app** → tipo **Empresa/Negócios**. Nome: "Tenkiter Importador".
3. No app, adicione o produto/caso de uso **Instagram** → **API com login do Instagram** (*API setup with Instagram login*).
4. Em **Gerar tokens de acesso** (*Generate access tokens*) → **Adicionar conta** → entre com a conta da loja e aceite. Se pedir, em **Funções do app** adicione a conta como **Testador do Instagram** e aceite o convite no Instagram (Configurações → Apps e sites → Convites de testador).
5. Toque em **Gerar token**, **copie** (é um texto longo).
6. No painel TENKiTER: **📥 Produtos para aceitar** → cole o código → **Conectar**. Ele fica guardado só no servidor; a tela nunca mostra de volta.

O acesso dura ~60 dias e o Worker renova sozinho; se algo falhar, o painel mostra um aviso.

## Publicar o Worker (Claude faz; precisa do token da Cloudflare em variável de ambiente)
`CLOUDFLARE_API_TOKEN=<token> python3 instagram-worker/publicar.py` — cria o banco D1 `tenkiter-ig`, liga R2/KV, o cron de 30 min e o endereço `tenkiter-ig.<conta>.workers.dev`. O token precisa poder editar Workers **e D1**. Depois, revogar o token.
