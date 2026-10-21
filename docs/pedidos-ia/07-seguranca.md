# 07-seguranca — SEGURANÇA (P-17)

Leia antes `INSTRUCOES-IA.md` (raiz) e as regras do `CLAUDE.md` que tocam estes arquivos.

**P-17 · Assinatura de foto e SEC-20** (`okou.md` C7): *restrição de formato/tamanho no upload assinado*. Hoje só o vídeo é assinado (`assinarUploadVideo_` no catálogo). Faça o equivalente para FOTO: o servidor assina o upload do Cloudinary com parâmetros que travam formato (`allowed_formats`) e tamanho, e o painel (`admin.html`, `subirMidia_`) usa a assinatura quando houver; o segredo fica SÓ nas Propriedades do Script (nunca no código). `catalogo-codigo-4.22.gs.txt` é o código completo: confira se basta. Edite como catálogo **4.23**, com bandeira nova em `versao` (ex.: `assinaturaFoto`) e front que só liga se a bandeira existir; sem ela o painel continua como hoje. Testes: acrescente em `backend_gs.js` (Cloudinary falso) e ajuste `midia_r2.py`/`admin_gestao.py` se tocar `subirMidia_`. Se faltar contexto para SEC-20, marque BLOQUEADO descrevendo o que falta.

## Testes do setor
`backend_gs.js`, `midia_r2.py`, `admin_gestao.py`, `cofre_admin.py`, `conexoes_admin.py`
