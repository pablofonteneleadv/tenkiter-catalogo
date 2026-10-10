# TENKiTER — Acesso unificado (v4 / v2): como atualizar sem derrubar nada

**Ordem importa. Faça na sequência. Nada apaga dados: a migração faz backup antes.**

## 1. Script de treinamento (planilha de funcionários)
1. Abra o Apps Script do treinamento → substitua TODO o código por `scripts/Code-treinamento-v4.0.gs.txt`.
2. Implantar → Gerenciar implantações → editar a implantação atual → **Nova versão** (a URL não muda).
3. No editor, rode **`migrarParaAcessosUnificados`** (aceite as permissões). Cria as colunas `Perfil` e `perm_...`, as abas `Perfis`, `Permissoes`, `Acessos_Log`, e converte cada Nível antigo: 1=Novato, 2=Estagiário, 3=Funcionário, 10=Admin total.
4. Rode **`diagnostico`** e confira: "Admins totais ativos" ≥ 1. Se for 0, coloque TRUE em `perm_gerir_acessos` na sua linha.

Nesse ponto os sites antigos continuam funcionando normalmente.

## 2. Script do catálogo
1. Substitua TODO o código do Apps Script do catálogo por `scripts/tenkiter-codigo-v2.1.gs.txt` → **Nova versão** na implantação atual.
2. Rode `diagnostico`. O **PIN antigo continua valendo** (convivência) — ninguém fica sem acesso.

## 3. Site (GitHub)
Envie para o repositório, substituindo: `treinamentos.html`, `admin.html`, `index.html`, `common.js` (pasta `site/`). Depois faça o deploy no Render (se não subir sozinho, me peça que eu disparo).

## 4. Configurar as pessoas
1. Entre no portal com seu WhatsApp e senha → **Painel do RH / Admin → Acessos**.
2. Por pessoa: escolha o **perfil** (marca as permissões sozinho) e, em **Permissões**, marque/desmarque individualmente (✱ = diferente do padrão do perfil).
   - Perfis: Cliente, Aluno, Novato, Estagiário, Funcionário, **Equipe do site** (só catálogo, sem portal), Encarregado, Admin, Admin total.
3. Quem só usava o PIN do catálogo precisa de uma conta (**+ Nova pessoa** ou o próprio cadastro no portal) e do perfil certo.

## 5. Endurecer (só depois de tudo conferido)
- Catálogo: rode **`desligarPinLegado`** quando todos que mexem no admin já tiverem login. (Voltar: `religarPinLegado`.)
- Treinamento: rode **`fecharListaPublica`** (some a lista pública de funcionários). Só rode depois de o site novo estar no ar e os aparelhos terem recarregado.
- Depois: `migrarSenhasParaHash` (embaralha as senhas; recusa rodar com a lista aberta).
- Agende `fazerBackupAgora` toda semana (Acionadores) nos dois scripts.

## O que muda para cada tipo de pessoa
- **Cliente**: pode criar conta no catálogo (ícone 👤) — favoritos e sacola ficam salvos. Sem conta, o catálogo funciona como sempre.
- **Aluno/Novato/Estagiário/Funcionário**: portal por permissão de manual; catálogo só onde o perfil libera.
- **Equipe do site**: entra no admin do catálogo, **não** no portal de aprendizagem.
- **Admin total**: painel Acessos, histórico de quem mudou o quê.

## Observações
- Login único: o mesmo WhatsApp+senha vale no portal, no admin e no catálogo; a sessão é compartilhada entre as páginas.
- Favoritos entre aparelhos são **unidos** (nada se perde); remover um favorito em um aparelho pode reaparecer se outro aparelho ainda o tiver.
- Trava anti-tentativa: 8 senhas erradas bloqueiam aquele WhatsApp por 15 min (quem já está logado não é afetado).
- Conteúdo dos manuais ainda está embutido na página (bloqueio de nível é visual). Restringir o conteúdo de verdade é um passo futuro.
- Se `ADMIN_PIN` nunca foi definido no catálogo, o admin está aberto enquanto o PIN antigo estiver ligado — desligue-o.

---
## Atualização: miniatura do perfil + até 8 fotos e 1 vídeo por peça

Arquivos que mudaram: os 2 scripts, `treinamentos.html`, `admin.html`, `index.html`.
1. Script do treinamento → cole `Code-treinamento-v4.0.gs.txt` → Implantar > Gerenciar implantações > lápis > **Nova versão**.
2. Script do catálogo → cole `tenkiter-codigo-v2.1.gs.txt` → **Nova versão**. Na 1ª vez que salvar um vídeo, o Google pode pedir para autorizar o acesso ao Drive: aceite.
3. Suba `treinamentos.html`, `admin.html`, `index.html` no GitHub (substituindo) e aguarde o deploy do Render.
Fotos de perfil antigas: o portal converte o link sozinho, não precisa reenviar.
Vídeo: MP4/MOV/WEBM, até 20 MB, 1 por peça. Fotos extras: até 8, além da principal.

---
## Atualização 3 (filtro de perfis, Aluno/Cliente, salvar em segundo plano, galeria com setas, link do Render)
Mesmos 6 arquivos: 2 scripts (Nova versão nos dois) + manual.html, admin.html, index.html no GitHub.
Depois de atualizar o script do treinamento, rode UMA vez a função `converterNovatosEmAlunos` (Executar) para quem hoje está "Novato" virar "Aluno".
