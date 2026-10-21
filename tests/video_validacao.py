# Validação compartilhada de vídeo (video-validation.js): arquivo bom passa; vazio, grande, falso e formato errado são recusados.
import sys, os, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mock import criar_mp4
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
falhas = 0
def chk(nome, ok):
    global falhas
    print(("  ok  " if ok else "FALHA ") + nome)
    if not ok: falhas += 1

d = tempfile.mkdtemp()
bom = criar_mp4(os.path.join(d, "bom.mp4"), segundos=2)
grande = criar_mp4(os.path.join(d, "grande.mp4"), segundos=1, extra_bytes=3 * 1048576)
falso = os.path.join(d, "falso.mp4"); open(falso, "wb").write(b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 4000)
vazio = os.path.join(d, "vazio.mp4"); open(vazio, "wb").write(b"")
texto = os.path.join(d, "nota.txt"); open(texto, "w").write("oi")

with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    pg.set_content('<input type="file" id="f">')
    pg.add_script_tag(path=os.path.join(RAIZ, "video-validation.js"))
    def validar(arq, **opc):
        pg.set_input_files("#f", arq)
        return pg.evaluate("(o) => TKVideoValidation.validar(document.getElementById('f').files[0], o)", opc)
    r = validar(bom, maxMB=20)
    chk("vídeo real passa e devolve duração e resolução", r["ok"] and r["metadata"]["width"] == 320 and r["metadata"]["height"] == 240 and r["metadata"]["duration"] > 1)
    r = validar(bom, maxMB=20, maxDurationSeconds=1)
    chk("duração acima do limite é recusada com frase", (not r["ok"]) and "segundos" in " ".join(r["erros"]))
    r = validar(grande, maxMB=2)
    chk("arquivo acima do limite da tela é recusado, sem tentar ler", (not r["ok"]) and "limite desta tela" in " ".join(r["erros"]))
    r = validar(falso, maxMB=20)
    chk("arquivo com nome .mp4 mas sem vídeo dentro é recusado", (not r["ok"]) and "exporte novamente" in " ".join(r["erros"]).lower().replace("exporte", "exporte"))
    r = validar(vazio, maxMB=20)
    chk("arquivo vazio é recusado", not r["ok"])
    r = validar(texto, maxMB=20)
    chk("arquivo que não é vídeo é recusado", (not r["ok"]) and "vídeo" in " ".join(r["erros"]).lower())
    b.close()
print("FALHAS: %d" % falhas); sys.exit(1 if falhas else 0)
