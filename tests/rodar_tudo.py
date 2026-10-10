#!/usr/bin/env python3
"""Roda toda a bateria de testes do site (simula lojista, cliente, pedido, funcionária, acessibilidade, teclado, busca, painel de gestão,
telas novas, categorias do painel, compartilhar a foto escolhida, service worker offline, Story em vídeo, lista rápida) e os testes de código sem navegador (backend do Apps Script e Worker da Cloudflare).

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
    ("novas_telas.py", lambda o: "FALHAS=0" in o),
    ("compartilhar_foto.py", lambda o: "FALHAS=0" in o),   # compartilhar/pedir/sacola levam a FOTO ou VÍDEO escolhido (?f=N)
    ("admin_categorias.py", lambda o: "FALHAS=0" in o),    # criar categoria, ✎/× só Admin total, sugestões de nome
    ("lista_rapida.py", lambda o: "FALHAS=0" in o),
    ("story_video.py", lambda o: "FALHAS=0" in o),
    ("service_worker.py", lambda o: "FALHAS=0" in o),   # sobe e DESLIGA o próprio servidor para testar "sem internet" de verdade
    ("backend_gs.js", lambda o: "FALHAS=0" in o),        # backend do Apps Script rodando em memória (sem planilha real)
    ("worker_og.js", lambda o: "FALHAS=0" in o),         # Worker da Cloudflare com o Apps Script simulado
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
