#!/usr/bin/env python3
"""Roda toda a bateria de testes do site (simula lojista, cliente, pedido, funcionária, acessibilidade, teclado, busca, painel de gestão,
telas novas, categorias do painel, compartilhar a foto escolhida e a seleção, central de avisos, avisos/instalação no celular, service worker offline, Story em vídeo, lista rápida) e os testes de código sem navegador (backend do Apps Script e Worker da Cloudflare).

Uso:
    pip install playwright pillow && playwright install chromium     (uma vez)
    apt install ffmpeg      (para o teste do Story em vídeo; sem ele aquela bateria avisa e falha)
    node (v18+) para os testes backend_gs.js e worker_og.js
    curl -L https://cdn.jsdelivr.net/npm/axe-core@4.10.2/axe.min.js -o tests/axe.min.js   (uma vez; não vai pro git)
    python3 tests/rodar_tudo.py                    # testa os arquivos desta pasta (sobe um servidor local sozinho)
    TK_BASE=https://tenkiter-catalogo.onrender.com/ python3 tests/rodar_tudo.py   # testa o site publicado

O Apps Script é SIMULADO (mock.py): nada aqui toca na planilha nem no WhatsApp reais.
Sai com código 1 se algo falhar.
"""
import os, re, subprocess, sys, time, socket
AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
BASE = os.environ.get("TK_BASE")
srv = None
if not BASE:
    porta = 8765
    s = socket.socket(); livre = s.connect_ex(("127.0.0.1", porta)) != 0; s.close()
    if livre:
        srv = subprocess.Popen([sys.executable, "-m", "http.server", str(porta)], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
    os.environ["TK_BASE"] = "http://localhost:%d/" % porta
SUITES = [  # (arquivo, como saber que passou)
    ("axe_telas_a.py", lambda o: o.strip() == "" or "[critical]" not in o and "[serious]" not in o and "[moderate]" not in o),
    ("axe_telas_b.py", lambda o: "TOTAL com problema: 0" in o),
    ("jornada_cliente.py", lambda o: "FALHAS=0" in o),
    ("jornada_lojista.py", lambda o: "FALHAS=0" in o),
    ("jornada_funcionaria.py", lambda o: "FALHAS=1 ['progresso foi enviado ao servidor']" in o or "FALHAS=0" in o),  # manuais-semente não têm id de capítulo: não sincronizam
    ("teclado.py", lambda o: "FALHAS=0" in o),
    ("busca.py", lambda o: "FALHAS=0" in o),
    ("jornada_pedido.py", lambda o: "FALHAS=0" in o),
    ("admin_gestao.py", lambda o: "FALHAS=0" in o),
    ("lote_falhas.py", lambda o: "FALHAS=0" in o),
    ("novas_telas.py", lambda o: "FALHAS=0" in o),
    ("compartilhar_foto.py", lambda o: "FALHAS=0" in o),   # compartilhar/pedir/sacola levam a FOTO ou VÍDEO escolhido (?f=N)
    ("admin_categorias.py", lambda o: "FALHAS=0" in o),    # criar categoria, ✎/× só Admin total, sugestões de nome
    ("juntar_admin.py", lambda o: "FALHAS=0" in o),   # juntar produtos repetidos na lista do admin
    ("x_equipe.py", lambda o: "FALHAS=0" in o),   # X de arquivar na loja (Equipe do site)
    ("botao_voltar.py", lambda o: "FALHAS=0" in o),   # botão voltar fecha só a janela de cima
    ("selecao_link.py", lambda o: "RESULTADO:" in o and " 0 falhas" in o),   # compartilhar seleção leva as PEÇAS (?sel=…), não só a loja
    ("rolagem_infinita.py", lambda o: "FALHAS=0" in o),   # rolagem infinita + faixa flutuante de filtros
    ("central_avisos.py", lambda o: "FALHAS=0" in o),      # Central de avisos do lojista (público, {nome}, agendar, modelos, histórico, preparar)
    ("push_cliente.py", lambda o: "FALHAS=0" in o),        # avisos + instalar app no cliente com OneSignal FALSO (Android, iPhone, Instagram, computador)
    ("conexoes_admin.py", lambda o: "FALHAS=0" in o),      # Conexões do Admin total: chave no servidor (nunca na tela), situação, regras do Render, publicar
    ("numeros_reais.py", lambda o: "FALHAS=0" in o),       # Números reais com filtros (período, horário opcional, dia da semana, origem, aparelho, fonte, categoria) + instalados/aviso ativo
    ("aparelho_anonimo.py", lambda o: "FALHAS=0" in o),    # contagem anônima de aparelhos: visita, de onde veio, instalou, aviso ativo, conta (só token), sem dado pessoal
    ("central_contagens.py", lambda o: "FALHAS=0" in o),   # Central de avisos com a contagem ao lado de cada público
    ("instalabilidade.py", lambda o: "FALHAS=0" in o),     # diagnóstico do próprio Chrome: o site é instalável
    ("lista_rapida.py", lambda o: "FALHAS=0" in o),
    ("story_video.py", lambda o: "FALHAS=0" in o),
    ("service_worker.py", lambda o: "FALHAS=0" in o),   # sobe e DESLIGA o próprio servidor para testar "sem internet" de verdade
    ("backend_gs.js", lambda o: "FALHAS=0" in o),        # backend do Apps Script rodando em memória (sem planilha real)
    ("backend_contas.js", lambda o: "FALHAS=0" in o),     # bloco de contas compartilhado (CPF, e-mail, login múltiplo, recuperar senha) igual nos dois backends
    ("auditoria_produto.py", lambda o: "FALHAS=0" in o),   # quem cadastrou/editou aparece na lista e no formulário (backend 4.1)
    ("envios_retomar.py", lambda o: "FALHAS=0" in o),      # fila de envios guardada no aparelho: retoma sozinha, sem duplicar
    ("convite_app.py", lambda o: "FALHAS=0" in o),        # plaquinha flutuante de convite para instalar o app (só no site em celular)
    ("contas_cpf.py", lambda o: "FALHAS=0" in o),         # telas: login múltiplo, Esqueci a senha, conta já existe, faixa vermelha de CPF, CPF obrigatório no currículo
    ("backend_func.js", lambda o: "FALHAS=0" in o),      # backend de Funcionários/Acessos: vários perfis por pessoa + travas de Admin
    ("acessos_perfis.py", lambda o: "FALHAS=0" in o),    # painel de Acessos do RH: caixinhas de perfil
    ("worker_og.js", lambda o: "FALHAS=0" in o),         # Worker da Cloudflare com o Apps Script simulado
    ("worker_midia.js", lambda o: "FALHAS=0" in o),      # Worker de mídia (R2) com R2/KV/Apps Script falsos: quem envia, tipos, travas de tamanho e de armazenamento
    ("midia_r2.py", lambda o: "FALHAS=0" in o),          # painel -> R2 (e reserva no Cloudinary)
    ("worker_ig.js", lambda o: "FALHAS=0" in o),         # Worker do importador do Instagram (D1/R2/KV e Instagram falsos): ciclo, agrupamento, cópia, ações, token
    ("cofre_admin.py", lambda o: "FALHAS=0" in o),       # cofre das Conexões: copiar chaves só com login + senha de novo
    ("foto_cliente.py", lambda o: "FALHAS=0" in o),   # cliente manda foto pela conta (Ela usa TM)
    ("postagens_v49.py", lambda o: "FALHAS=0" in o),   # v4.9: várias peças, filtros, Ela usa TM com seletor, ocultar, 10 posições
    ("editor_visual.py", lambda o: "FALHAS=0" in o),   # v5.5: editor visual sem código (camadas)
    ("editor_toque.py", lambda o: "FALHAS=0" in o),   # v5.7: editor no celular (dedo), tela cheia, imagens fixas, desfazer
    ("excluir_avaliacao_lento.py", lambda o: "FALHAS=0" in o),   # v5.6: excluir sem travar, abertura lenta não vai ao login
    ("painel_v49.py", lambda o: "FALHAS=0" in o),
    ("equipe_catalogo1.py", lambda o: "FALHAS=0" in o),   # v4.9: perfil Equipe catálogo 1 (painel simplificado)   # v4.9: ferramentas no topo, Postagens fixa, miniatura amplia
    ("postagens_admin.py", lambda o: "FALHAS=0" in o),   # aba Postagens: feed/carrossel/reels/story, templates, agenda, fila, Story com link manual
    ("conteudo_protegido.py", lambda o: "FALHAS=0" in o),   # treinamentos: manuais e provas só pelo servidor, com sessão e permissão (RH 3.4)
    ("provas_v52.py", lambda o: "FALHAS=0" in o),   # v5.2: prova só corrige respondida, n de 3 vem do servidor, botão Editar produto
    ("vitrine_orientacao.py", lambda o: "FALHAS=0" in o),   # vitrine: Consultar/Selecionar, etiquetas de filtro, rolagem, ajuda no fim
    ("instagram_admin.py", lambda o: "FALHAS=0" in o),   # painel: Produtos para aceitar (lista, editor, aceitar -> cadastro, conectar)
]
PROPRIO_SERVIDOR = {"service_worker.py"}   # no teste local, esta bateria cuida do próprio servidor (precisa desligá-lo)
falhou = []
for arq, passou in SUITES:
    env = dict(os.environ)
    if arq in PROPRIO_SERVIDOR and not BASE: env.pop("TK_BASE", None)
    cmd = ["node", os.path.join(AQUI, arq)] if arq.endswith(".js") else [sys.executable, os.path.join(AQUI, arq)]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=900, env=env)
    out = r.stdout + r.stderr
    ok = r.returncode == 0 and passou(r.stdout)
    print(("✔ " if ok else "✘ ") + arq)
    if not ok:
        falhou.append(arq); print("\n".join("    " + l for l in out.strip().splitlines()[-25:]))
if srv: srv.terminate()
print("\n%d de %d baterias passaram" % (len(SUITES) - len(falhou), len(SUITES)))
sys.exit(1 if falhou else 0)
