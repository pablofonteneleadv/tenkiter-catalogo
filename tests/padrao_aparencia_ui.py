"""Padrão de aparência (v7.57): alvos >= 44 px, campos, foco, tokens e foto 4:5 nas telas principais.
Chromium com serviços SIMULADOS (nada vai a Google/Cloudflare). Medição em 390 e 1440 px.
Base do enforcement: cada regra abaixo tem um nome (R1..R7) para o CI travar depois.
  R1 nenhum controle < 44 px (links dentro de texto corrido ficam de fora)
  R2 campo de texto: >= 44 px de altura, fonte >= 16 px, raio 8 px
  R3 foco visível: contorno 2-3 px na cor do token (laranja), nunca o padrão do navegador
  R4 tokens: tk-padrao.css carregado em toda página e sem tons de laranja soltos
  R5 foto de produto 4:5 (vitrine, galeria, lista da Gestão)
  R6 chips marcados expõem aria-pressed
  R7 botão primário: raio único (token) e texto escuro sobre laranja
"""
import json, os, re, sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
if not os.environ.get('TK_BASE'):
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    os.environ['TK_BASE'] = f'http://127.0.0.1:{server.server_port}/'
BASE = os.environ['TK_BASE']
sys.path.insert(0, str(ROOT / 'tests'))
from mock import install, SESSION, PERMS_ALL
import mock_msg
OUT = Path(os.environ.get('TK_EVID', 'tests/saida/padrao-aparencia')); OUT.mkdir(parents=True, exist_ok=True)
SOMENTE = [a for a in sys.argv[1:] if not a.startswith('-')]
MOSTRAR = '--mostrar' in sys.argv
EVIDENCIA = '--evidencia' in sys.argv   # só tira as capturas (para o antes/depois), sem verificar

MEDIR = r"""(raiz) => {
  const R = raiz ? (document.querySelector(raiz) || document) : document;
  const vis = e => { if (!e.getClientRects().length) return false; let p = e; while (p) { const ps = getComputedStyle(p); if (ps.display === 'none' || ps.visibility === 'hidden' || +ps.opacity === 0) return false; p = p.parentElement; } const r = e.getBoundingClientRect(); return r.width >= 1 && r.height >= 1; };
  const txt = e => (e.getAttribute('aria-label') || e.textContent || e.value || e.placeholder || e.id || '').replace(/\s+/g, ' ').trim().slice(0, 30);
  const nome = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const els = [...R.querySelectorAll('button, a[href], summary, [role=button], [role=tab], input:not([type=hidden]), select, textarea')].filter(vis);
  const out = { pequenos: [], campos: [], imgs: [], semPressed: [], prim: [] };
  for (const c of R.querySelectorAll('.chip.selecionado, .chip[aria-pressed], .pill-cat.selecionado, .pill-gen.selecionado')) if (vis(c) && c.classList.contains('selecionado') && c.getAttribute('aria-pressed') !== 'true') out.semPressed.push(nome(c) + ' ' + txt(c));
  for (const b of R.querySelectorAll('.btn-nova-peca, .fx-ver, #btn-salvar, .btn-primario, .po-enviar, .ig-ok, .av-prim, .cx-prim, .fam-prim, .fi-btn.principal, .bt.laranja')) if (vis(b)) { const cs = getComputedStyle(b), r = b.getBoundingClientRect(); out.prim.push({ el: nome(b), h: Math.round(r.height), rad: parseFloat(cs.borderTopLeftRadius), bg: cs.backgroundColor, cor: cs.color, sh: cs.boxShadow !== 'none' }); }
  for (const e of els) {
    const tag = e.tagName.toLowerCase(), typ = (e.getAttribute('type') || '').toLowerCase();
    let alvo = e;
    if (tag === 'input' && /checkbox|radio/.test(typ)) alvo = (e.labels && e.labels[0]) || e.closest('label') || e;
    if (tag === 'input' && typ === 'file') continue;
    const r = alvo.getBoundingClientRect(), s = getComputedStyle(e);
    const inline = tag === 'a' && s.display === 'inline' && e.parentElement && /^(P|LI|SPAN|SMALL|DIV)$/.test(e.parentElement.tagName) && e.parentElement.textContent.trim().length > e.textContent.trim().length + 8;
    if ((r.width < 43.5 || r.height < 43.5) && !inline) out.pequenos.push({ el: nome(e), t: txt(e), w: Math.round(r.width), h: Math.round(r.height) });
    if ((tag === 'input' && /^(text|search|number|tel|email|password|date|url)?$/.test(typ)) || tag === 'select') out.campos.push({ el: nome(e), h: Math.round(r.height), fs: parseFloat(s.fontSize), rad: parseFloat(s.borderTopLeftRadius) });
  }
  for (const im of [...R.querySelectorAll('.card .img-wrap, .produto .foto-ampliar img')].filter(vis)) {
    const r = im.getBoundingClientRect(); if (r.width > 60) out.imgs.push({ el: nome(im), ar: +(r.width / r.height).toFixed(3) });
  }
  return out;
}"""
FOCO = """() => { const a = document.activeElement; if (!a || a === document.body || !a.matches(':focus-visible')) return null; const s = getComputedStyle(a);
 return {el: a.tagName.toLowerCase() + (a.id ? '#' + a.id : '') + (typeof a.className === 'string' && a.className ? '.' + a.className.trim().split(/\\s+/)[0] : ''), st: s.outlineStyle, w: parseFloat(s.outlineWidth), c: s.outlineColor, sh: s.boxShadow !== 'none'}; }"""
FOCO_OK = {'rgb(230, 126, 34)', 'rgb(168, 82, 0)'}

def carrega(nome):
    src = (ROOT / 'tests' / nome).read_text(encoding='utf-8').split('\nwith sync_playwright() as p:')[0]
    ns = {'__file__': str(ROOT / 'tests' / nome), '__name__': 'x_' + nome}
    exec(compile(src, nome, 'exec'), ns); return ns
EST = carrega('esteira_ui.py'); ESTF = carrega('esteira_fotos_ui.py')

def ferr(pg):
    if pg.locator('#details-ferramentas[open]').count() == 0:
        pg.click('#details-ferramentas > summary'); pg.wait_for_timeout(300)
def admin(pg): pg.goto(BASE + 'admin.html'); pg.wait_for_selector('#lista-produtos .produto', timeout=9000); pg.wait_for_timeout(900)

TELAS = []
def tela(nome, pagina='admin', raiz=None, versao='4.28'):
    def d(f): TELAS.append(dict(nome=nome, f=f, pagina=pagina, raiz=raiz, versao=versao)); return f
    return d
@tela('vitrine', 'index')
def _(pg): pg.goto(BASE + 'index.html'); pg.wait_for_selector('#grid .card', timeout=9000); pg.wait_for_timeout(900)
@tela('vitrine-filtros', 'index')
def _(pg):
    pg.goto(BASE + 'index.html'); pg.wait_for_selector('#grid .card', timeout=9000); pg.wait_for_timeout(500)
    b = pg.locator('.btn-filtros-toggle').first
    if b.is_visible(): b.click(); pg.wait_for_timeout(700)
@tela('vitrine-produto', 'index', '#overlay')
def _(pg):
    pg.goto(BASE + 'index.html'); pg.wait_for_selector('#grid .card', timeout=9000); pg.wait_for_timeout(500)
    pg.locator('#grid .card .img-wrap').first.click(); pg.wait_for_timeout(1000)
@tela('vitrine-sacola', 'index', '#overlay-sacola')
def _(pg):
    pg.goto(BASE + 'index.html'); pg.wait_for_selector('#grid .card', timeout=9000); pg.wait_for_timeout(500)
    pg.click('#btn-sacola-header'); pg.wait_for_timeout(700)
@tela('gestao-lista')
def _(pg): admin(pg)
@tela('cadastro', raiz='#card-form')
def _(pg):
    admin(pg)
    if not pg.locator('#card-menu-cadastro').evaluate('e => e.open'): pg.click('#card-menu-cadastro > summary')
    pg.click('#menu-cad-nova'); pg.wait_for_timeout(800)
@tela('cadastro-editar', raiz='#card-form')
def _(pg):
    admin(pg); pg.evaluate('editarProduto(produtos[2].ID)'); pg.wait_for_timeout(1200)
@tela('postagens', raiz='#overlay-postagens')
def _(pg): admin(pg); ferr(pg); pg.click('#btn-abrir-postagens'); pg.wait_for_timeout(1200)
@tela('instagram', raiz='#overlay-instagram')
def _(pg):
    admin(pg); pg.locator('#card-menu-cadastro > summary').click(); pg.click('#ig-abrir'); pg.wait_for_timeout(1500)
@tela('mensagens', raiz='#overlay-mensagens', versao='7.40.42')
def _(pg):
    admin(pg); ferr(pg); pg.locator('#btn-abrir-mensagens').click(); pg.wait_for_selector('#ms-lista .ms-conv', timeout=9000); pg.wait_for_timeout(700)
@tela('metricas', raiz='#overlay-gestao')
def _(pg): admin(pg); ferr(pg); pg.click('#btn-abrir-metricas'); pg.wait_for_timeout(1500)
@tela('push', raiz='#overlay-avisos')
def _(pg): admin(pg); ferr(pg); pg.click('#btn-abrir-push'); pg.wait_for_timeout(1500)
@tela('conexoes', raiz='#overlay-conexoes', versao='4.3')
def _(pg): admin(pg); ferr(pg); pg.click('#btn-abrir-conexoes'); pg.wait_for_timeout(1500)
@tela('tecidos', raiz='#overlay-tecidos')
def _(pg): admin(pg); pg.evaluate("document.getElementById('tecidos-gerenciar').click()"); pg.wait_for_timeout(1200)
@tela('familias', raiz='#overlay-familias')
def _(pg):
    admin(pg); cb = pg.locator('#lista-produtos .produto input[type=checkbox]')
    cb.nth(0).check(); cb.nth(1).check(); pg.wait_for_timeout(300)
    pg.click('#btn-bulk-familia'); pg.wait_for_timeout(1200)
@tela('fotos-ia', 'fotos-ia')
def _(pg): pg.goto(BASE + 'fotos-ia.html'); pg.wait_for_timeout(2500)
@tela('esteira-hoje', 'esteira')
def _(pg): ESTF['entrar'](pg); pg.wait_for_timeout(600)
@tela('esteira-conferencia', 'esteira')
def _(pg): ESTF['entrar'](pg); pg.locator('.peca').first.click(); pg.wait_for_selector('.folha', timeout=4000); pg.wait_for_timeout(400)
@tela('treinamentos', 'simples')
def _(pg): pg.goto(BASE + 'treinamentos.html'); pg.wait_for_timeout(2600)
@tela('curriculos', 'simples')
def _(pg): pg.goto(BASE + 'curriculos.html'); pg.wait_for_timeout(2600)
@tela('verificar', 'simples')
def _(pg): pg.goto(BASE + 'verificar.html'); pg.wait_for_timeout(1500)

falhas, ok = [], 0
def chk(nome, cond, det=None):
    global ok
    if cond: ok += 1
    else: falhas.append(nome); print('  ✘ ' + nome + ('' if det is None else ' — ' + str(det)[:400]))

# ---- R4 estático: tokens e arquivo compartilhado -------------------------------------------------
def estatico():
    paginas = [p for p in ROOT.glob('*.html') if p.name not in ('404.html', 'manual.html', 'treinamento-cadastro-simulacao.html')]
    for p in paginas:
        h = p.read_text(encoding='utf-8')
        chk(f'R4 {p.name} carrega tk-padrao.css', 'tk-padrao.css' in h)
    css = (ROOT / 'tk-padrao.css').read_text(encoding='utf-8')
    for t in ('--tk-alvo', '--tk-botao-raio', '--tk-campo-h', '--tk-campo-raio', '--tk-chip-h', '--tk-foco-w', '--tk-foto'):
        chk(f'R4 token {t} definido', t + ':' in css.replace(' ', ''))
    soltos = {'#f1871b', '#ff7a1a', '#ea7b00', '#99500d', '#a65300', '#a64d00', '#8b4600', '#a76a25', '#82430d', '#895016', '#ed861d', '#ef861e', '#9c530e', '#9b4a00', '#e88a25', '#e98a20'}
    achados = {}
    for f in list(ROOT.glob('*.css')) + list(ROOT.glob('*.js')) + list(ROOT.glob('*.html')):
        if f.name in ('vendor-qrcode.js',): continue
        t = f.read_text(encoding='utf-8', errors='ignore').lower()
        for c in soltos:
            if c in t: achados.setdefault(f.name, []).append(c)
    chk('R4 sem tons de laranja/marrom soltos fora do token', not achados, achados)
    # R3 estático: nenhuma regra de foco com cor própria (azul, petróleo, verde, preto...): só o token ou o laranja da marca
    foco_proprio = {}
    rx = re.compile(r'focus[^{}]*\{[^{}]*?outline:\s*\d+px\s+(?:solid|dashed)\s+(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))', re.I)
    for f in list(ROOT.glob('*.css')) + list(ROOT.glob('*.js')) + list(ROOT.glob('*.html')):
        if f.name in ('vendor-qrcode.js', 'tk-padrao.css'): continue
        ok_cores = ('#a85200', '#e67e22') + (('#fff', '#ffffff') if f.name == 'avisos.js' else ())   # avisos.js: anel branco sobre a faixa escura
        achou = [c for c in rx.findall(f.read_text(encoding='utf-8', errors='ignore')) if c.lower() not in ok_cores]
        if achou: foco_proprio[f.name] = achou
    chk('R3 sem regra de foco com cor própria', not foco_proprio, foco_proprio)

if not EVIDENCIA: estatico()
res = {}
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    for t in TELAS:
        if SOMENTE and t['nome'] not in SOMENTE: continue
        for (w, h) in [(390, 844), (1440, 900)]:
            chave = f"{t['nome']}@{w}"
            try:
                if t['pagina'] == 'esteira':
                    ctx = b.new_context(viewport={'width': w, 'height': h}, is_mobile=w < 600, has_touch=w < 600)
                    st = EST['instalar'](ctx); ESTF['_TODOS'][:] = EST['PRODUTOS'] + [EST['ARQUIVADA'], EST['ARQUIVADA2']]; ESTF['fotos_srv'](ctx, st)
                else:
                    ctx = b.new_context(viewport={'width': w, 'height': h}, is_mobile=w < 600, has_touch=w < 600, service_workers='block')
                    ctx.add_init_script(SESSION)
                    st = install(ctx, perms=PERMS_ALL, versao=t['versao'])
                    if t['nome'] == 'mensagens': st['ig'].setdefault('msg', mock_msg.novo_estado())
                pg = ctx.new_page(); pg.on('dialog', lambda d: d.dismiss())
                t['f'](pg)
                pg.screenshot(path=str(OUT / f'{t["nome"]}_{w}.png'))
                if EVIDENCIA: ctx.close(); continue
                d = pg.evaluate(MEDIR, t['raiz'])
                focos = []
                for i in range(14):
                    pg.keyboard.press('Tab'); pg.wait_for_timeout(260); f = pg.evaluate(FOCO)
                    if f: focos.append(f)
                res[chave] = d
                peq = d['pequenos']
                if MOSTRAR: print(chave, 'pequenos', len(peq), peq[:12])
                chk(f'R1 {chave} sem controle < 44 px', not peq, peq[:6])
                ruins = [c for c in d['campos'] if c['h'] < 43.5 or c['fs'] < 15.9 or abs(c['rad'] - 8) > 0.6]
                chk(f'R2 {chave} campos 44/16/raio 8', not ruins, ruins[:5])
                mau = [f for f in focos if f['st'] == 'none' or f['w'] < 2 or f['c'] not in FOCO_OK]
                chk(f'R3 {chave} foco laranja 2-3 px', not mau, mau[:5])
                chk(f'R6 {chave} chip marcado com aria-pressed', not d['semPressed'], d['semPressed'][:5])
                ruim = [b for b in d['prim'] if b['h'] < 47.5 or abs(b['rad'] - 8) > 0.6 or b['sh'] or (b['bg'] == 'rgb(230, 126, 34)' and b['cor'] not in ('rgb(13, 13, 13)', 'rgb(20, 20, 20)'))]
                chk(f'R7 {chave} ação principal 48 px / raio 8 / texto escuro', not ruim, ruim[:4])
                if t['nome'] in ('vitrine', 'gestao-lista') and w == 390:
                    bad = [i for i in d['imgs'] if abs(i['ar'] - 0.8) > 0.02]
                    chk(f'R5 {chave} foto 4:5', d['imgs'] and not bad, (d['imgs'][:2], bad[:3]))
                ctx.close()
            except Exception as e:
                chk(f'{chave} abriu', False, e)
                try: ctx.close()
                except Exception: pass
    b.close()
json.dump(res, open(OUT / 'medidas.json', 'w'), ensure_ascii=False, indent=1)
if EVIDENCIA: sys.exit(0)
print(f'FALHAS={len(falhas)} OK={ok}')
if falhas: print(falhas[:60])
print('PASS padrão de aparência' if not falhas else 'FALHOU padrão de aparência')
sys.exit(1 if falhas else 0)
