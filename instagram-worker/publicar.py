#!/usr/bin/env python3
"""Publica instagram-worker/worker.js como Worker `tenkiter-ig` (D1 + R2 + KV + cron a cada 30 min) pela API da Cloudflare.

Uso:   CLOUDFLARE_API_TOKEN=<token> python3 instagram-worker/publicar.py
O token fica só na variável do comando (NUNCA em arquivo nem no git). Idempotente: pode rodar de novo para atualizar o código.
Bindings: DB = D1 `tenkiter-ig` (criado se não existir), MIDIA = R2 `tenkiter-midia`, CACHE = KV `tenkiter-cache`, API_URL (Apps Script, lido de common.js), MIDIA_URL (Worker de mídia, lido de common.js).
Liga o endereço workers.dev e tenta o domínio próprio midia.tenkitermodas.com.br (se o token não puder, segue só com workers.dev).
"""
import os, sys, re, json, uuid, urllib.request, urllib.error
TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN")
if not TOKEN: sys.exit("Defina CLOUDFLARE_API_TOKEN.")
BASE = "https://api.cloudflare.com/client/v4"
SCRIPT, BUCKET, KV_TITULO, DOMINIO, ZONA = "tenkiter-ig", "tenkiter-midia", "tenkiter-cache", "ig.tenkitermodas.com.br", "tenkitermodas.com.br"
AQUI = os.path.dirname(os.path.abspath(__file__))

def api(path, metodo="GET", corpo=None, cab=None):
    h = {"Authorization": "Bearer " + TOKEN}; h.update(cab or {})
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE + path, data=corpo, method=metodo, headers=h), timeout=60) as r: return json.loads(r.read())
    except urllib.error.HTTPError as e:
        try: return json.loads(e.read() or b"{}")
        except Exception: return {"success": False, "errors": [str(e)]}
def js(o): return json.dumps(o).encode()

contas = api("/accounts").get("result") or []
if len(contas) != 1: sys.exit("O token precisa enxergar exatamente 1 conta (viu %d)." % len(contas))
conta = contas[0]["id"]
kvs = (api("/accounts/%s/storage/kv/namespaces" % conta).get("result") or [])
kv = next((k["id"] for k in kvs if k["title"] == KV_TITULO), None)
if not kv: sys.exit("KV %s não encontrado." % KV_TITULO)
dbs = api("/accounts/%s/d1/database?name=tenkiter-ig" % conta).get("result") or []
db = next((d["uuid"] for d in dbs if d["name"] == "tenkiter-ig"), None)
if not db:
    c = api("/accounts/%s/d1/database" % conta, "POST", json.dumps({"name": "tenkiter-ig"}).encode(), {"Content-Type": "application/json"})
    db = (c.get("result") or {}).get("uuid")
    if not db: sys.exit("Não consegui criar o D1 tenkiter-ig: %s" % c.get("errors"))
    print("D1 tenkiter-ig criado")
common = open(os.path.join(AQUI, "..", "common.js"), encoding="utf-8").read()
m = re.search(r"API_URL_PADRAO\s*=\s*'([^']+)'", common)
if not m: sys.exit("API_URL_PADRAO não achado em common.js")
mm = re.search(r"MIDIA_URL\s*=\s*'([^']+)'", common)
if not mm: sys.exit("MIDIA_URL não achado em common.js")
meta = {"main_module": "worker.js", "compatibility_date": "2025-01-01",
        "bindings": [{"type": "d1", "name": "DB", "id": db}, {"type": "plain_text", "name": "MIDIA_URL", "text": mm.group(1)},
                     {"type": "r2_bucket", "name": "MIDIA", "bucket_name": BUCKET},
                     {"type": "kv_namespace", "name": "CACHE", "namespace_id": kv},
                     {"type": "plain_text", "name": "API_URL", "text": m.group(1)}]}
codigo = open(os.path.join(AQUI, "worker.js"), "rb").read()
lim = "----tk" + uuid.uuid4().hex
corpo = (("--%s\r\nContent-Disposition: form-data; name=\"metadata\"\r\nContent-Type: application/json\r\n\r\n" % lim).encode() + js(meta) + b"\r\n" +
         ("--%s\r\nContent-Disposition: form-data; name=\"worker.js\"; filename=\"worker.js\"\r\nContent-Type: application/javascript+module\r\n\r\n" % lim).encode() + codigo + b"\r\n" +
         ("--%s--\r\n" % lim).encode())
r = api("/accounts/%s/workers/scripts/%s" % (conta, SCRIPT), "PUT", corpo, {"Content-Type": "multipart/form-data; boundary=" + lim})
if not r.get("success"): sys.exit("Falhou ao publicar: %s" % r.get("errors"))
print("Publicado:", (r.get("result") or {}).get("modified_on"))
s = api("/accounts/%s/workers/scripts/%s/subdomain" % (conta, SCRIPT), "POST", js({"enabled": True, "previews_enabled": False}), {"Content-Type": "application/json"})
print("workers.dev:", "ligado" if s.get("success") else s.get("errors"))
sc = api("/accounts/%s/workers/scripts/%s/schedules" % (conta, SCRIPT), "PUT", js([{"cron": "*/30 * * * *"}]), {"Content-Type": "application/json"})
print("cron a cada 30 min:", "ligado" if sc.get("success") else sc.get("errors"))
zonas = api("/zones?name=" + ZONA).get("result") or []
if zonas:
    d = api("/accounts/%s/workers/domains" % conta, "PUT", js({"hostname": DOMINIO, "service": SCRIPT, "zone_id": zonas[0]["id"], "environment": "production"}), {"Content-Type": "application/json"})
    print("domínio", DOMINIO + ":", "ligado" if d.get("success") else d.get("errors"))
else:
    print("domínio: o token não enxerga a zona", ZONA, "(segue só com workers.dev)")
