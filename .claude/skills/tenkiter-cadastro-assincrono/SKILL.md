---
name: tenkiter-cadastro-assincrono
description: Use ao mexer no envio/cadastro de peças do painel TENKiTER (admin.html, nav.js) — fila no IndexedDB, mídia no servidor, registro leve, opId idempotente e o aviso "Ainda falta N peça".
---

# Cadastro assíncrono de peças (TENKiTER)

Regras que valem para qualquer mudança no envio de peças:

1. **Separe "mídia enviada" de "cadastro aceito".** Foto/vídeo sobem ao R2 (Cloudinary se o R2 recusar) assim que escolhidos (pré-envio). Só depois o pacote final (`create`) vai ao backend.
2. **Idempotência.** `create` leva `opId` (= `it.k`). Mesmo `opId` devolve a peça original (`repetido:true`) e nunca cria outra. Qualquer retry/reenvio/finalizador em outra tela depende disso.
3. **Registro leve.** Peça nova com todas as mídias no servidor é guardada no IndexedDB `tenkiter_admin_envios_v1` SEM credencial (texto + endereços). Quem termina (painel ou `nav.js` em outra página) põe a sessão na hora. Nunca guarde senha/token nem dados de pessoas no registro ou no histórico.
4. **Aviso "Ainda falta N peça"** só aparece para o que REALMENTE depende do aparelho (mídia ainda subindo ou edição). Peça só com registro leve não bloqueia a saída.
5. **"Cadastrada" só com resposta ok do servidor.** Timeout/erro deixa o registro guardado e o painel retoma ao abrir. Não prometa envio em segundo plano: se o SO matar o navegador, só retoma ao reabrir (Web Locks/keepalive ajudam, não garantem).
6. **Histórico**: título, resultado e hora; sumir da fila não apaga o registro.
7. **Testes**: `pre_envio.py`, `envios_retomar.py`, `lote_falhas.py`, seção 8j de `backend_gs.js`. Limite de custo do R2 mora no Worker, não no navegador.
