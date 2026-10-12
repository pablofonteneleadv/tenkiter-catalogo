"""Foto do cliente (foto-cliente.js, v4.7): na conta do cliente (index.html) escolher a foto, observação opcional, autorização e enviar ao Worker (login por token). Worker simulado (mock.py)."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
from playwright.sync_api import sync_playwright
from PIL import Image
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
AXE = open(os.path.join(AQUI, "axe.min.js")).read()
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
d = os.path.join(AQUI, "saida"); os.makedirs(d, exist_ok=True)
Image.new("RGB", (3000, 4000), "orange").save(os.path.join(d, "cliente-grande.jpg"), quality=95)
open(os.path.join(d, "nao-e-foto.txt"), "w").write("oi")
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"]); erros = []
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION); st = install(ctx, perms=[], versao="4.3"); g = st["ig"]
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(BASE + "index.html"); pg.wait_for_timeout(2500)
    pg.click("#btn-conta-header"); pg.wait_for_timeout(600)
    t = pg.inner_text("#conta-corpo")
    chk("na conta aparece o convite 'Já usou uma peça nossa? Mande sua foto!'", "Mande sua foto" in t and pg.locator("#foto-cli-arq").count() == 1, t[:200])
    chk("pede pouco: foto, observação, Instagram opcional e a autorização", all(pg.locator(x).count() == 1 for x in ["#foto-cli-obs", "#foto-cli-ig", "#foto-cli-ok"]) and "opcional" in pg.get_attribute("#foto-cli-ig", "placeholder").lower())
    chk("cada campo tem rótulo ou nome acessível", pg.eval_on_selector_all("#foto-cli input", "e=>e.every(i=>i.type==='file'?!!document.querySelector('label[for='+i.id+']'):(!!document.querySelector('label[for='+i.id+']')||!!i.placeholder))"))
    pg.click("#foto-cli-enviar"); pg.wait_for_timeout(200)
    chk("sem foto: pede a foto", "Escolha a foto" in pg.inner_text("#foto-cli-msg"))
    pg.set_input_files("#foto-cli-arq", os.path.join(d, "nao-e-foto.txt")); pg.wait_for_timeout(600)
    chk("arquivo que não é imagem: frase clara, nada enviado", "Não consegui abrir" in pg.inner_text("#foto-cli-msg") and not g.get("foto_chamadas"))
    pg.set_input_files("#foto-cli-arq", os.path.join(d, "cliente-grande.jpg")); pg.wait_for_timeout(1200)
    chk("mostra a prévia da foto escolhida", pg.is_visible("#foto-cli img"))
    pg.click("#foto-cli-enviar"); pg.wait_for_timeout(200)
    chk("sem marcar a autorização: pede para marcar e não envia", "autorização" in pg.inner_text("#foto-cli-msg") and not g.get("foto_chamadas"))
    pg.fill("#foto-cli-obs", "Usei no aniversário da minha filha"); pg.fill("#foto-cli-ig", "@maria.cli"); pg.check("#foto-cli-ok")
    pg.click("#foto-cli-enviar"); pg.wait_for_timeout(1500)
    c = (g.get("foto_chamadas") or [{}])[-1]
    chk("envia ao Worker com login (token), a observação, o Instagram e a autorização", c.get("path") == "/cliente/foto" and c["q"].get("aceito") == "1" and c["q"].get("obs") == "Usei no aniversário da minha filha" and c["q"].get("ig") == "@maria.cli", c)
    chk("o arquivo enviado é JPEG reduzido (3000×4000 → bem menor que 2,5 MB)", c.get("jpeg") is True and 5000 < c.get("tam", 0) < 2.5 * 1048576, c.get("tam"))
    chk("não manda a senha: só o token tk2 no cabeçalho", all((x["sessao"] or "").startswith("tk") for x in g["chamadas"] if x["path"] == "/cliente/foto"))
    chk("agradece e limpa o formulário", "Recebemos" in pg.inner_text("#foto-cli-msg") and pg.input_value("#foto-cli-obs") == "" and not pg.is_checked("#foto-cli-ok"))
    g["foto_recusa"] = "Você já enviou 5 fotos hoje. Amanhã dá para mandar mais. 🧡"
    pg.set_input_files("#foto-cli-arq", os.path.join(d, "cliente-grande.jpg")); pg.wait_for_timeout(1200); pg.check("#foto-cli-ok"); pg.click("#foto-cli-enviar"); pg.wait_for_timeout(800)
    chk("limite diário do servidor aparece como frase", "5 fotos hoje" in pg.inner_text("#foto-cli-msg") and "{" not in pg.inner_text("#foto-cli-msg"))
    pg.evaluate("document.querySelector('#modal-conta').classList.add('visivel')")
    pg.evaluate(AXE); r = pg.evaluate("async()=>{const r=await axe.run(document.querySelector('#modal-conta'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}});return r.violations.map(v=>v.id+'×'+v.nodes.length)}")
    chk("axe — bloco de foto na conta", not r, r)
    # sem login: o bloco não aparece
    ctx2 = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, service_workers="block"); install(ctx2, perms=[], versao="4.3")
    p2 = ctx2.new_page(); p2.goto(BASE + "index.html"); p2.wait_for_timeout(2000); p2.click("#btn-conta-header"); p2.wait_for_timeout(500)
    chk("sem entrar na conta não oferece o envio (primeiro entra)", p2.locator("#foto-cli-arq").count() == 0 and "Entrar" in p2.inner_text("#conta-corpo"))
    chk("sem erros de JavaScript", not erros, erros[:3]); b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
