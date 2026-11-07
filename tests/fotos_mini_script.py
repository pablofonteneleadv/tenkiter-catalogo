"""scripts/fotos/gerar_minis.py com um Worker SIMULADO (servidor local): gera a cópia de 480 px das fotos antigas, idempotente, sem apagar nada."""
import io, os, sys, json, threading, subprocess, random
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
from PIL import Image
AQUI = os.path.dirname(os.path.abspath(__file__)); RAIZ = os.path.dirname(AQUI)
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + (" — " + str(e) if e and not c else ""))

def foto_real(w, h, seed):
    rnd = random.Random(seed); im = Image.new("RGB", (w, h))
    px = im.load()
    for y in range(0, h):          # gradiente + ruído leve: JPEG de 1080 px com tamanho parecido com foto de verdade (~250 KB)
        for x in range(0, w):
            px[x, y] = ((x * 255) // w, (y * 255) // h, (x + y + rnd.randint(0, 60)) % 256)
    b = io.BytesIO(); im.save(b, "JPEG", quality=88); return b.getvalue()

orig = {"202609/" + "1" * 20 + ".jpg": foto_real(1080, 1350, 1), "202609/" + "2" * 20 + ".jpg": foto_real(1080, 1080, 2), "202610/" + "3" * 20 + ".jpg": foto_real(400, 500, 3)}
orig["202610/" + "4" * 20 + ".jpg"] = b"nao-e-imagem"                         # foto corrompida: não pode derrubar as outras
armaz = dict(orig); armaz["202610/" + "5" * 20 + ".jpg"] = foto_real(1080, 1350, 5); orig["202610/" + "5" * 20 + ".jpg"] = armaz["202610/" + "5" * 20 + ".jpg"]
armaz["202610/" + "5" * 20 + "@480.jpg"] = b"\xff\xd8\xff-ja-existe"               # esta já tem cópia
chamadas = []

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _j(self, c, st=200):
        d = json.dumps(c).encode(); self.send_response(st); self.send_header("Content-Length", str(len(d))); self.end_headers(); self.wfile.write(d)
    def _t(self):
        q = parse_qs(urlparse(self.path).query); chamadas.append((self.command, q.get("acao", [""])[0], self.headers.get("Authorization")))
        return q
    def do_GET(self):
        q = self._t()
        if self.headers.get("Authorization") != "Bearer TESTE": return self._j({"ok": False}, 401)
        a = q["acao"][0]
        if a == "saude": return self._j({"ok": True, "gerador": "mini-v1"})
        if a == "lote":
            pend = [k for k in sorted(armaz) if "@" not in k and k.replace(".jpg", "@480.jpg") not in armaz]
            return self._j({"ok": True, "pendentes": pend, "cursor": None, "fim": True})
        if a == "origem":
            d = armaz[q["chave"][0]]; self.send_response(200); self.send_header("Content-Length", str(len(d))); self.end_headers(); return self.wfile.write(d)
        self._j({"ok": False}, 404)
    def do_POST(self):
        q = self._t(); n = int(self.headers.get("Content-Length", "0")); d = self.rfile.read(n)
        if self.headers.get("Authorization") != "Bearer TESTE": return self._j({"ok": False}, 401)
        ch = q["chave"][0]; cm = ch.replace(".jpg", "@480.jpg")
        if cm in armaz: return self._j({"ok": True, "jaExistia": True})
        if n > 150 * 1024: return self._j({"ok": False, "erro": "grande"}, 413)
        armaz[cm] = d; self._j({"ok": True})

srv = HTTPServer(("127.0.0.1", 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
env = dict(os.environ, MINI_BASE="http://127.0.0.1:%d" % srv.server_port, MINI_TOKEN_TESTE="TESTE", MINI_MAX="50")
def rodar(extra=None):
    return subprocess.run([sys.executable, os.path.join(RAIZ, "scripts/fotos/gerar_minis.py")], env=dict(env, **(extra or {})), capture_output=True, text=True, timeout=120)

print("== Só saúde ==")
r = rodar({"MINI_SO_SAUDE": "1"}); chk("confere a identidade e não gera nada", r.returncode == 0 and not any(c[1] == "gravar" for c in chamadas) and len(armaz) == 6, r.stdout + r.stderr)
print("== Primeira execução ==")
r = rodar(); print(r.stdout.strip()[-400:])
minis = {k: v for k, v in armaz.items() if k.endswith("@480.jpg")}
chk("terminou sem erro (uma foto ruim não derruba o resto)", r.returncode == 0, r.stderr)
chk("criou cópia das 3 fotos boas (a corrompida ficou de fora, a que já tinha foi respeitada)", set(minis) == {"202609/" + "1" * 20 + "@480.jpg", "202609/" + "2" * 20 + "@480.jpg", "202610/" + "3" * 20 + "@480.jpg", "202610/" + "5" * 20 + "@480.jpg"}, sorted(minis))
for k in ("1", "2"):
    im = Image.open(io.BytesIO(minis["202609/" + k * 20 + "@480.jpg"]))
    chk("foto de 1080 px vira %d px de largura em JPEG" % 480, im.format == "JPEG" and im.width == 480, (im.format, im.size))
m1 = minis["202609/" + "1" * 20 + "@480.jpg"]; o1 = orig["202609/" + "1" * 20 + ".jpg"]
chk("cópia bem menor que a original (< 150 KB e < 40% do tamanho)", len(m1) <= 150 * 1024 and len(m1) < 0.4 * len(o1), (len(m1), len(o1)))
im3 = Image.open(io.BytesIO(minis["202610/" + "3" * 20 + "@480.jpg"])); chk("foto pequena (400 px) não é ampliada", im3.width == 400, im3.size)
chk("proporção 4:5 preservada", abs(Image.open(io.BytesIO(m1)).height / 480 - 1350 / 1080) < 0.01)
chk("originais intactas (nada apagado nem trocado)", all(armaz[k] == v for k, v in orig.items()))
chk("a cópia que já existia não foi mexida", armaz["202610/" + "5" * 20 + "@480.jpg"] == b"\xff\xd8\xff-ja-existe")
print("== Segunda execução (idempotente) ==")
antes = dict(armaz); n0 = len([c for c in chamadas if c[1] == "gravar"]); r = rodar()
chk("repetir não muda nada no armazenamento", armaz == antes)
chk("só a foto corrompida é tentada de novo (e falha sem derrubar)", len([c for c in chamadas if c[1] == "gravar"]) == n0 and "falhou" in r.stdout, r.stdout[-300:])
srv.shutdown()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
