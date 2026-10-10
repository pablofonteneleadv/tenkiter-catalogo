#!/usr/bin/env python3
"""Publica og-worker/worker.js no Worker `tenkiter-og` pela API da Cloudflare (sem wrangler, sem instalar nada).

Uso:   CLOUDFLARE_API_TOKEN=<token> python3 og-worker/publicar.py
O token (modelo "Edit Cloudflare Workers", de preferência com data de fim) é digitado só na hora, NUNCA vai para arquivo nem para o git.
Mantém as configurações do script (compatibility_date) e o endereço workers.dev; só troca o código.
Depois de publicar, rode:  node tests/worker_og.js   e abra  https://tenkiter-og.distkrpconfeccoes.workers.dev/lista.json
"""
import os, sys, json, uuid, urllib.request, urllib.error
TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN")
if not TOKEN: sys.exit("Defina CLOUDFLARE_API_TOKEN.")
BASE = "https://api.cloudflare.com/client/v4"
SCRIPT = "tenkiter-og"
AQUI = os.path.dirname(os.path.abspath(__file__))

def api(path, metodo="GET", corpo=None, cab=None):
    h = {"Authorization": "Bearer " + TOKEN}; h.update(cab or {})
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE + path, data=corpo, method=metodo, headers=h), timeout=60) as r: return json.loads(r.read())
    except urllib.error.HTTPError as e: return json.loads(e.read() or b"{}")

contas = api("/accounts").get("result") or []
if len(contas) != 1: sys.exit("O token precisa enxergar exatamente 1 conta (viu %d): %s" % (len(contas), api("/user/tokens/verify")))
conta = contas[0]["id"]
atual = (api("/accounts/%s/workers/scripts/%s/settings" % (conta, SCRIPT)).get("result") or {})
if atual.get("bindings"): sys.exit("O Worker agora tem bindings (%s): ajuste este script antes (keep_bindings por tipo) para não perdê-los." % atual["bindings"])
meta = json.dumps({"main_module": "worker.js", "compatibility_date": atual.get("compatibility_date") or "2025-01-01"}).encode()
codigo = open(os.path.join(AQUI, "worker.js"), "rb").read()
lim = "----tk" + uuid.uuid4().hex
corpo = (("--%s\r\nContent-Disposition: form-data; name=\"metadata\"\r\nContent-Type: application/json\r\n\r\n" % lim).encode() + meta + b"\r\n" +
         ("--%s\r\nContent-Disposition: form-data; name=\"worker.js\"; filename=\"worker.js\"\r\nContent-Type: application/javascript+module\r\n\r\n" % lim).encode() + codigo + b"\r\n" +
         ("--%s--\r\n" % lim).encode())
r = api("/accounts/%s/workers/scripts/%s" % (conta, SCRIPT), "PUT", corpo, {"Content-Type": "multipart/form-data; boundary=" + lim})
if not r.get("success"): sys.exit("Falhou: %s" % r.get("errors"))
print("Publicado em", (r.get("result") or {}).get("modified_on"))
