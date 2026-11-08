#!/usr/bin/env python3
"""Confere o manual rico em mobile e desktop. Fixture local, sem dados reais ou APIs externas."""
import contextlib
import os
from pathlib import Path
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SHOTS = ROOT / "tests" / "saida" / "manual-fidelidade"
SHOTS.mkdir(parents=True, exist_ok=True)
PORT = 8789
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass
handler = lambda *a, **kw: Quiet(*a, directory=str(ROOT), **kw)
http = ThreadingHTTPServer(("127.0.0.1", PORT), handler)
threading.Thread(target=http.serve_forever, daemon=True).start()
fixture = [
    {"type":"p","text":"COMO ESTUDAR  Treine olhando o aplicativo.","bold":False,"bg":"#f8f1e8",
     "runs":[{"t":"COMO ESTUDAR  ","b":1},{"t":"Treine olhando o aplicativo."}]},
    {"type":"p","text":"Título maior","bold":False,"runs":[{"t":"Título maior","z":17,"c":"#b05e16"}]},
    {"type":"p","text":"Dica: pergunte o tamanho antes de buscar a peça."},
    {"type":"p","text":"Atenção: não faça testes em conversas reais."},
    {"type":"p","text":"Checagem: O que fazer primeiro?"},
    {"type":"p","text":"a) Ignorar a cliente"},
    {"type":"p","text":"b) Responder a dúvida *"},
    {"type":"p","text":"Explicação: responda a cliente."},
    {"type":"bul","text":"Lista com negrito","level":0,"runs":[{"t":"Lista","b":1},{"t":" com negrito"}]},
    {"type":"img","src":"icon-192.png","width":192,"height":192,"side":"full"},
]

# O renderer está em um fechamento privado no HTML. Para testar a função REAL
# sem sessão nem dados de clientes, extraímos seu corpo e o executamos isoladamente
# com o TMV real já carregado pela página.
HTML = (ROOT / "treinamentos.html").read_text(encoding="utf8")
def extrair(inicio, fim):
    a = HTML.index(inicio)
    b = HTML.index(fim, a + len(inicio))
    return HTML[a:b]
JS_RENDER = """
(() => {
 const TMV = window.TMV;
 const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
   c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const ricoHtml_ = (t,runs) => TMV.rico(t,runs);
 const videoHtml_ = () => '';
""" + extrair("function fundoDoc_(b)", "/** vídeo da lição") + "\n" + extrair("function renderBlocks(blocks, chaveCap)", "/* ---------------- render: login") + """
 window.__renderManualTeste = renderBlocks;
})();
"""

with sync_playwright() as p:
    browser=p.chromium.launch(args=["--no-sandbox"])
    try:
        for w,h in [(320,700),(390,844),(412,915),(1440,900)]:
            ctx=browser.new_context(viewport={"width":w,"height":h},device_scale_factor=1)
            page=ctx.new_page()
            errors=[]
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.route("**/script.google.com/**",lambda r:r.fulfill(json={"ok":False}))
            page.goto(f"http://127.0.0.1:{PORT}/treinamentos.html",wait_until="domcontentloaded")
            page.wait_for_function("typeof window.TMV?.preparar === 'function' && typeof window.TMV?.rico === 'function'",timeout=15000)
            page.add_script_tag(content=JS_RENDER)
            page.wait_for_function("typeof window.__renderManualTeste === 'function'")
            page.evaluate("""(blocks) => {
              const root=document.querySelector('#app');
              root.innerHTML='<section class="chapter" id="fixt-manual"><h2>Manual de atendimento</h2>'+
                window.__renderManualTeste(blocks, 'fixt')+'</section>';
              root.style.width='100%';root.style.minWidth='0';
            }""", fixture)
            sec=page.locator("#fixt-manual")
            sec.wait_for()
            fundo=sec.locator("p.fundo-doc").first
            assert fundo.count()==1, f"{w}: parágrafo sombreado ausente"
            rgb=fundo.evaluate("(el)=>getComputedStyle(el).backgroundColor")
            assert rgb=="rgb(248, 241, 232)", f"{w}: cor {rgb}"
            assert sec.locator(".aviso-tip").count()==1, f"{w}: dica especial ausente"
            assert sec.locator(".aviso-warn").count()==1, f"{w}: atenção especial ausente"
            assert sec.locator(".tmv-chk").count()==1, f"{w}: checagem ausente"
            assert sec.locator("li strong").count()==1, f"{w}: negrito de lista perdido"
            span=sec.locator("p",has_text="Título maior").locator("span").first
            assert abs(float(span.evaluate("(e)=>parseFloat(getComputedStyle(e).fontSize)"))-22.7)<1, f"{w}: fonte maior perdida"
            overflow=sec.evaluate("(e)=>e.scrollWidth-e.clientWidth")
            assert overflow<=1, f"{w}: conteúdo causa rolagem horizontal ({overflow}px)"
            assert sec.locator("img").first.evaluate("(e)=>e.getBoundingClientRect().right <= innerWidth + 1"), f"{w}: imagem cortada"
            page.screenshot(path=str(SHOTS / f"fidelidade-{w}.png"),full_page=False)
            assert not errors, f"{w}: erros do navegador: {errors[:3]}"
            print(f"{w}×{h}: fundo, fonte, avisos, checagem, imagem e rolagem OK")
            ctx.close()
    finally:
        browser.close()
        http.shutdown()
print("Fidelidade visual em quatro telas: aprovada com fixture sem dados reais.")
