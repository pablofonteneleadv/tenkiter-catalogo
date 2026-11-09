#!/usr/bin/env python3
"""Teste do próprio scripts/ci/check_padroes.py com sites de mentira em pastas temporárias (sem navegador, sem rede).

Cobre: site limpo passa; cada regra reprova a violação nova e aceita o jeito certo; a catraca (dívida antiga não falha,
aumentou falha, diminuiu pede para baixar o baseline, --atualizar não deixa subir); mensagens em português com o doc.
Uso: python3 tests/padroes_check_teste.py
"""
import contextlib
import importlib.util
import io
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("check_padroes", BASE / "scripts/ci/check_padroes.py")
C = importlib.util.module_from_spec(spec)
spec.loader.exec_module(C)

OK, BAD = [], []
def chk(nome, cond, extra=""):
    (OK if cond else BAD).append(nome)
    print(("  ✔ " if cond else "  ✘ ") + nome + ((" — " + str(extra)[:500]) if (extra and not cond) else ""))

PAGINA = """<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<link rel="stylesheet" href="janelas.css"><link rel="stylesheet" href="tk-padrao.css"></head><body>
<script src="common.js?v=1.0.0"></script><script src="a11y.js"></script><script src="avisos.js"></script>
%s
</body></html>"""

def montar(extra_html="", arquivos=None, versao="1.0.0"):
    """Cria um 'site' mínimo e limpo. Devolve (raiz, caminho_baseline)."""
    raiz = Path(tempfile.mkdtemp(prefix="padroes-"))
    (raiz / "tests").mkdir()
    shutil.copy(BASE / "tests/padrao_vocabulario.py", raiz / "tests/padrao_vocabulario.py")
    (raiz / "VERSION").write_text(versao + "\n")
    (raiz / "index.html").write_text(PAGINA % extra_html, encoding="utf-8")
    for nome in ("janelas.css", "tk-padrao.css", "common.js", "a11y.js", "avisos.js"):
        (raiz / nome).write_text("/* dono */\n", encoding="utf-8")
    for nome, txt in (arquivos or {}).items():
        (raiz / nome).write_text(txt, encoding="utf-8")
    return raiz, raiz / "baseline.json"

def rodar(raiz, base, *args):
    saida = io.StringIO()
    with contextlib.redirect_stdout(saida):
        rc = C.main(["--raiz", str(raiz), "--baseline", str(base), *args])
    return rc, saida.getvalue()

def reprova(nome, regra, extra_html="", arquivos=None):
    raiz, base = montar(extra_html, arquivos)
    try:
        base.write_text(json.dumps({"regras": {}}))   # baseline sem dívida: qualquer ocorrência é nova
        rc, out = rodar(raiz, base)
        chk("reprova: " + nome, rc == 1 and ("[%s]" % regra) in out and "docs/ia/padroes-site.md" in out, out[-600:])
    finally:
        shutil.rmtree(raiz, ignore_errors=True)

def passa(nome, extra_html="", arquivos=None):
    raiz, base = montar(extra_html, arquivos)
    try:
        base.write_text(json.dumps({"regras": {}}))
        rc, out = rodar(raiz, base)
        chk("passa: " + nome, rc == 0, out[-600:])
    finally:
        shutil.rmtree(raiz, ignore_errors=True)

print("== Site limpo ==")
passa("site mínimo sem desvios")

print("== Cada regra reprova o desvio novo ==")
reprova("alert() novo", "alert", "<script>alert('oi')</script>")
reprova("prompt() de senha", "prompt-senha", "<script>var s = prompt('Digite a nova senha')</script>")
reprova("body.style.overflow", "travar-fundo", "<script>document.body.style.overflow='hidden'</script>")
reprova("fx-travado", "travar-fundo", "<script>document.body.classList.add('fx-travado')</script>")
reprova("body.<classe> {overflow:hidden} em CSS", "travar-fundo", arquivos={"modulo.css": "body.aberto { overflow: hidden; }"})
reprova("z-index global solto em CSS", "z-index", arquivos={"modulo.css": ".x { position: fixed; z-index: 999; }"})
reprova("z-index por JS", "z-index", "<script>el.style.zIndex = '500'</script>")
reprova("laranja solto (hex)", "laranja-solto", arquivos={"modulo.css": ".b { background: #E67E22; }"})
reprova("laranja solto (rgba)", "laranja-solto", arquivos={"modulo.css": ".b { background: rgba(230,126,34,.2); }"})
reprova("marrom solto", "laranja-solto", arquivos={"modulo.css": ".b { color: #7a3a00; }"})
reprova("location.origin em link", "location-origin", "<script>var u = location.origin + '/produto';</script>")
reprova("<img src> dinâmico sem atribSrc", "img-sem-atribsrc", "<script>h = '<img src=\"' + esc(p.foto) + '\">';</script>")
reprova("typeof moeda", "moeda", "<script>if (typeof moeda === 'function') {}</script>")
reprova("HTTP + status em texto", "http-na-tela", "<script>aviso('Falhou (HTTP ' + r.status + ')')</script>")
reprova("role=tablist sem tk-abas", "tablist-sem-tk-abas", '<nav role="tablist" class="minhas-abas"></nav>')
reprova("botão Fechar sem tk-fechar", "fechar-sem-tk-fechar", '<button aria-label="Fechar" class="meu-x">x</button>')
reprova("página sem janelas.css/a11y.js/tk-padrao.css", "pagina-sem-padrao",
        arquivos={"nova.html": "<!doctype html><html><head><meta charset=utf-8></head><body>oi</body></html>"})
reprova("TKPadrao sem padrao-dados.js", "padrao-dados", "<script>TKPadrao.erro(e)</script>")
reprova("common.js?v= diferente entre páginas", "common-versao",
        arquivos={"outra.html": PAGINA.replace("common.js?v=1.0.0", "common.js?v=0.9.0") % ""})
reprova("toast próprio sem avisos.js", "toast-proprio", '<div class="toast" id="toast"></div>')
reprova("vocabulário: 'sacola' em texto", "vocabulario", '<button>Abrir sacola</button>')
reprova("vocabulário: 'Solicitar fotos'", "vocabulario", '<button>Solicitar fotos</button>')

print("== Jeito certo passa ==")
passa("componentes compartilhados", '<nav role="tablist" class="x tk-abas"></nav><button aria-label="Fechar" class="tk-fechar">✕</button>'
      '<script>TKAviso.ok("Pronto."); h = "<img " + atribSrc(fotoMini(u, 480)) + ">";</script>')
passa("tokens e camadas", arquivos={"modulo.css": ".b { background: var(--laranja); z-index: var(--z-folha); } .c { z-index: 2; }"})
passa("SITE_URL e fallback defensivo", "<script>var u = (typeof SITE_URL === 'string' ? SITE_URL : location.origin + '/');</script>")
passa("comentários não contam", "<!-- alert('x') --><script>// alert('x')\n/* z-index: 999 */</script>")
passa("TKPadrao com padrao-dados.js", '<script src="padrao-dados.js"></script><script>TKPadrao.erro(e)</script>')
passa("fallback do próprio token (var(--laranja, #E67E22)) não conta como laranja solto", arquivos={"modulo.css": ".b { background: var(--laranja, #E67E22); color: var(--laranja-txt,#A85200); outline: 3px solid var(--tk-foco-cor,#A85200); }"})
reprova("laranja literal ainda reprova", "laranja-solto", "<style>.b { background: #E67E22; }</style>")
reprova("fallback com outro valor reprova", "laranja-solto", "<style>.b { background: var(--laranja, #E67E23); color: var(--laranja-txt, #E67E22); }</style>")
passa("token do laranja definido no dono (tk-padrao.css)", arquivos={"tk-padrao.css": ":root { --laranja: #E67E22; --laranja-txt: #A85200; }"})

print("== Catraca ==")
raiz, base = montar("<script>alert('antigo')</script>")
try:
    rc, out = rodar(raiz, base, "--atualizar")
    chk("cria o baseline com a dívida existente", rc == 0 and json.loads(base.read_text())["regras"]["alert"] == {"index.html": 1}, out)
    rc, out = rodar(raiz, base)
    chk("dívida antiga que não mudou NÃO falha", rc == 0, out)
    (raiz / "index.html").write_text(PAGINA % "<script>alert('antigo');alert('novo')</script>", encoding="utf-8")
    rc, out = rodar(raiz, base)
    chk("contagem subiu -> falha, em português, com regra, arquivo e doc", rc == 1 and "ERRO PADRÃO [alert] index.html" in out and "era 1, agora 2" in out and "TKAviso" in out, out)
    rc, out = rodar(raiz, base, "--atualizar")
    chk("--atualizar recusa SUBIR o baseline", rc == 1 and "só pode DESCER" in out and json.loads(base.read_text())["regras"]["alert"]["index.html"] == 1, out)
    (raiz / "outra.html").write_text(PAGINA % "<script>alert('x')</script>", encoding="utf-8")
    (raiz / "index.html").write_text(PAGINA % "<script>alert('antigo')</script>", encoding="utf-8")
    rc, out = rodar(raiz, base)
    chk("ocorrência em arquivo novo -> falha", rc == 1 and "outra.html" in out, out)
    (raiz / "outra.html").unlink()
    (raiz / "index.html").write_text(PAGINA % "", encoding="utf-8")
    rc, out = rodar(raiz, base)
    chk("dívida paga -> pede para baixar o baseline", rc == 1 and "DÍVIDA PAGA [alert] index.html" in out and "--atualizar" in out, out)
    rc, out = rodar(raiz, base, "--atualizar")
    chk("--atualizar aceita DESCER", rc == 0 and "alert" not in json.loads(base.read_text())["regras"], out)
    rc, out = rodar(raiz, base)
    chk("depois de baixar, volta a passar", rc == 0, out)
    (raiz / "index.html").write_text(PAGINA % "<script>alert('z')</script>", encoding="utf-8")
    rc, out = rodar(raiz, base, "--atualizar", "--aceitar-aumento")
    chk("--aceitar-aumento permite subir (decisão visível na PR)", rc == 0 and json.loads(base.read_text())["regras"]["alert"]["index.html"] == 1, out)
finally:
    shutil.rmtree(raiz, ignore_errors=True)

print("== Site real ==")
rc, out = rodar(BASE, BASE / "scripts/ci/padroes-baseline.json")
chk("a main atual passa com o baseline versionado", rc == 0, out[-800:])
chk("baseline versionado é JSON válido, só com regras conhecidas", set(json.loads((BASE / "scripts/ci/padroes-baseline.json").read_text())["regras"]) <= set(C.REGRAS))

print("OK=%d FALHAS=%d" % (len(OK), len(BAD)))
sys.exit(1 if BAD else 0)
