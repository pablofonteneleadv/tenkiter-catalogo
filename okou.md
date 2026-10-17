# okou.md — Ponto de partida para continuar o TENKiTER Catálogo

Documento de passagem para outra inteligência (ou pessoa) assumir o trabalho. Foi escrito em 17/10/2026, a partir da conversa "TENKiTER Training and Results Review" (export `okou-data-export.zip`) e do estado do repositório.

## 1. Regras obrigatórias (vêm da especificação mestra, PDF `Document_Merged (8).pdf`, seção 2)

1. O deploy no Render/OnRender é feito **manualmente pelo Pablo (owner)**. Não executar deploy, não acionar APIs de publicação, não alterar configurações de deploy para automatizar.
2. O Pablo cola manualmente o `Code.gs` completo no Google Apps Script quando o backend muda. Entregar sempre arquivo completo, nunca trecho.
3. **Não publicar direto na `main`.** Trabalhar em branch separada, entregar para revisão, sem merge e sem publicar.
4. Não acessar, alterar, remover ou inventar credenciais. Segredos só em Propriedades do Script / variáveis de ambiente, nunca no front, no repositório ou em logs.
5. Não criar projeto novo nem reescrever o sistema. Não remover funcionalidades existentes.

## 2. Repositório e branches

- Repositório: https://github.com/pablofonteneleadv/tenkiter-catalogo
- `main` está em `7e1b98d` (perf: upload paralelo da galeria, até 3 fotos). Esse commit já foi publicado.
- Branch de trabalho: `feat/upload-fila-cadastro-midia-v4.17` (criada a partir da `main`).
- Commits desta branch:
  - `9a7587d` — Foto 12 (campos visíveis) e Foto 8 (várias peças sem teto de 8 por lote), com ajuste dos testes.
  - (commit seguinte) — `CLAUDE.md` v4.17 e `okou.md`.
- Commit `e640f19`, citado na conversa anterior, **não existe mais** no ambiente. Foi refeito como `9a7587d` a partir do `main`, com o mesmo conteúdo descrito na conversa.
- Branches antigas no remoto (`feat/galeria-upload-paralelo`, `feat/postagem-multicanal-wafly`, `fix/*`, `backup/*`, `auditoria/*`) são de trabalhos anteriores. Não apagar.

## 3. Histórico da conversa (resumo cronológico)

1. **Pedido inicial**: resumir os treinamentos e os resultados das planilhas "TENKiTER Treinamento - Funcionarios" e "TENKiTER Treinamento - Resultados" (Google Drive). O resumo foi feito, com dados pessoais (telefones, CPFs, senhas) excluídos. Correção feita: no Manual 1 há **4 tentativas com 4 ou menos acertos** (não 6) e **5 com 5 acertos**. A aprovação integral (19 de 28) estava correta. O arquivo `entregas/resumo-onboarding-tenkiter.md` **não está no ambiente atual**; precisa ser refeito se for necessário.
2. **Especificação mestra** (PDF de 320 páginas, capturas nas páginas 309–320): implementar velocidade, persistência de uploads, cadastro de produtos, editor de imagens, postagem multicanal e experiência mobile. A auditoria mostrou que parte já existe (fila IndexedDB `tenkiter_admin_envios_v1`, envio direto de vídeo ao Cloudinary, guarda de arquivo único na galeria, seletor multicanal).
3. **Backend**: `catalogo-4.16.gs.txt` e `funcionario-3.15.gs.txt` foram recebidos. `assinarUploadVideo_` assina só `folder` e `timestamp`. O SEC-20 (restrição de formato e tamanho) ficou pendente de propósito. Não existe assinatura de foto.
4. **Velocidade — as 4 opções** (thread `f116ecb4`, 17/10/2026 00:56):
   - **A. Ajuste de UX no admin**: liberar a tela logo após "Salvar", mostrar a fila e subir as fotos em paralelo. Só front. Estado: o upload paralelo (3 por vez) já está no `main`; faltam liberar a tela após "Salvar" e exibir a fila de forma clara. **Recomendada.**
   - **B. Fila de cadastro no servidor**: o servidor grava sozinho a partir das URLs já enviadas. Estado: não implementada. Uma fila só no servidor não resolve, porque as fotos sobem do aparelho antes do POST final. Exige `Code.gs`.
   - **C. Postagens em fila com deduplicação**: depende da Wafly e do Worker `tenkiter-ig`. Não feita.
   - **D. Service worker com envio em segundo plano**: descartada, não funciona no iPhone.
   - Uma conversa posterior (01:50) propõe A + B com service worker para Android e `BroadcastChannel`. Ainda não foi validada.
5. **Implementação feita** (branch v4.17): Foto 12 e Foto 8 (ver seção 2).

## 4. Diagnósticos importantes

- `admin.html` é o painel. Os scripts `admin-postagens.js` e `admin-gestao.js` estão minificados/difíceis de buscar. Buscas por padrão exato podem falhar. Usar buscas com limite de caracteres (`cut -c1-300`) para não estourar a saída.
- `MAX_GALERIA = 8` (`admin.html`, por volta da linha 1219) limita fotos de **uma** peça. No modo "várias peças", o limite agora vale por peça.
- A pasta `/home/user/workspace` foi recriada em um sandbox novo. Não há mais clone local anterior nem `entregas/`; reclonar o repositório.
- O `render.yaml` define `autoDeploy: false` de propósito. O deploy é disparado pela API dentro de `.github/workflows/deploy.yml` (ver `docs/CI-CD.md`).
- Os arquivos `CLAUDE.md` e `okou.md` da raiz eram pedidos explícitos da conversa. Antes faltavam no repositório; agora estão na branch.

## 5. Testes e como rodar

```
cd tenkiter-catalogo
bash scripts/ci/check_js.sh
python3 scripts/ci/check_html.py
python3 scripts/ci/check_workers.py
bash scripts/ci/check_secrets.sh
python3 -m http.server 8765 &            # servidor local
export TK_BASE=http://localhost:8765/
# Playwright (venv, pip e chromium): python3 -m venv /tmp/pwenv && /tmp/pwenv/bin/pip install playwright pillow && /tmp/pwenv/bin/python -m playwright install chromium
/tmp/pwenv/bin/python tests/admin_gestao.py      # 80/80
/tmp/pwenv/bin/python tests/jornada_lojista.py   # 15/15
```

- Resultados nesta versão: CI 4/4 OK; `admin_gestao` 80/80; `jornada_lojista` 15/15; `postagens_admin` 101/101, `editor_visual` 14/14, `acessos_perfis` 11/11, `juntar_admin` 8/8 e `admin_categorias` sem falhas (rodados na sessão anterior, antes de a branch ser recriada).
- A bateria completa estoura 15 minutos em uma só execução. Rodar em partes.
- Falhas já existentes no `main` (não causadas por esta branch): `selecao_link`, `rolagem_infinita`, `lista_rapida`.
- `TK_BASE=https://tenkiter-catalogo.onrender.com/` testa o site publicado.

## 6. Pendências, em ordem sugerida

1. **Auditoria das Fotos 3 a 6** (Story/Status padrão, prévia automática, modos de enquadramento). Não há base de código verificada ainda.
2. **Foto 1**: remover os atalhos duplicados do painel ("Produtos para aceitar" e "Cadastrar nova peça") sem perder o acesso pelo menu Cadastrar.
3. **Opção A de velocidade**: liberar a tela após "Salvar" e mostrar a fila.
4. **Fotos 2, 7, 10 e 11**: responsividade, editor simplificado, chips de categoria e permissões.
5. **Backend (exige `Code.gs` completo colado pelo Pablo)**: assinatura de foto, SEC-20, múltiplos vídeos com migração de `Video_URL`, categorias.
6. Testes novos: cadastro com mais de 8 fotos em modo "várias peças"; idempotência; retomada após falha de rede; tela pequena.
7. Abrir PR de `feat/upload-fila-cadastro-midia-v4.17` para `main` e deixar o deploy com o Pablo.

## 7. Estado de publicação

(Ver seção 8 para o estado após o merge.)

## 7a. Estado antes do merge

- Nada foi mesclado na `main`.
- Nenhum deploy foi feito no Render.
- Branch enviada ao GitHub e PR #13 aberto para `main`. O merge e o deploy foram autorizados pelo Pablo em 17/10/2026 (ver seção 8).

## 8. Merge e deploy

- Autorizado explicitamente pelo Pablo (17/10/2026) para fazer merge do PR #13 na `main` e disparar o deploy pelo GitHub Actions (`deploy.yml`).
- Resultado do deploy e URL publicada: registrados abaixo quando concluídos.
