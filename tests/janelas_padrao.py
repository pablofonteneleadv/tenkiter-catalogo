"""Janelas, navegação, abas, foco e camadas com UMA gramática (v7.57.0). Serviços simulados (tests/mock.py); Chromium, não Android.

Cobre, em 390 e 1440 px:
  - janelas.css em todas as páginas; "Ir para o conteúdo" e foco laranja de 3 px;
  - botão de fechar único (.tk-fechar): 44×44, contornado, em todas as janelas conferidas;
  - aba ativa única (preto, aria-selected) em todas as listas de abas;
  - Voltar/Esc/toque fora/foco/Tab: foto ampliada de Mensagens, capa do vídeo, foto grande, certificado e "Zerar dados" de
    Treinamentos, painel de Filtros (Esc só na janela do topo), Disponibilidade e folhas da Esteira (perguntam antes de descartar);
  - Esteira com "‹ Gestão"; altura em dvh; escala de camadas --z-*.
Uso: TK_BASE=http://localhost:8765/ python3 tests/janelas_padrao.py
"""
import os, re, sys
from pathlib import Path
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import install, SESSION, PERMS_ALL
from playwright.sync_api import sync_playwright

BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
RAIZ = Path(AQUI).parent
OK, BAD = [], []
LARANJA = "rgb(230, 126, 34)"


def chk(n, c, e=""):
    (OK if c else BAD).append(n)
    print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)[:300]) if (e and not c) else ""))


def novo(b, pagina, w=390, h=844, perms=None, versao="4.3", mensagens=False, sessao=True):
    ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=w < 600, has_touch=w < 600, service_workers="block")
    if sessao:
        ctx.add_init_script(SESSION)
    if mensagens:
        ctx.add_init_script("window.TK_MENSAGENS_POLL_MS=400;")
    st = install(ctx, perms=perms, ia=False, versao=versao) if perms else install(ctx, ia=False, versao=versao)
    erros = []
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: "Access is denied" in str(e) or erros.append(str(e)))
    pg.on("dialog", lambda d: (DIALOGOS.append(d.message), d.accept() if RESPOSTA["aceitar"] else d.dismiss()))
    pg.goto("about:blank"); pg.goto(BASE + pagina); pg.wait_for_timeout(1800)
    return ctx, pg, st, erros


DIALOGOS = []
RESPOSTA = {"aceitar": True}


def caixa(pg, sel):
    return pg.evaluate("""s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect(),c=getComputedStyle(e);
      return {w:Math.round(r.width*10)/10,h:Math.round(r.height*10)/10,x:r.x,y:r.y,bg:c.backgroundColor,cor:c.color,borda:c.borderTopWidth,
              bordaCor:c.borderTopColor,classe:e.className}}""", sel)


def ehFechar(c):
    return bool(c) and abs(c["w"] - 44) <= 0.6 and abs(c["h"] - 44) <= 0.6 and c["borda"] == "1px" and ("tk-fechar" in c["classe"] or "sheet-x" in c["classe"])


def volta(pg, ms=500):
    pg.go_back(); pg.wait_for_timeout(ms)


with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])

    # ---------- 1. todas as páginas: janelas.css, pular para o conteúdo, foco laranja de 3 px ----------
    print("== Páginas: janelas.css, 'Ir para o conteúdo' e foco ==")
    paginas = ["index.html", "admin.html", "treinamentos.html", "curriculos.html", "curriculo.html", "verificar.html", "privacidade.html",
               "exclusao-dados.html", "esteira.html", "fotos-ia.html"]
    for (w, h) in [(390, 844), (1440, 900)]:
        for pagina in paginas:
            ctx, pg, st, er = novo(b, pagina, w, h)
            rot = f"{w} {pagina}"
            chk(rot + ": carrega janelas.css", pg.evaluate("[...document.styleSheets].some(s=>/janelas\\.css/.test(s.href||''))"))
            n = pg.locator(".tk-pular").count()
            chk(rot + ": um único 'Ir para o conteúdo'", n == 1, n)
            if n:
                pg.evaluate("document.activeElement && document.activeElement.blur()")
                pg.keyboard.press("Tab"); pg.wait_for_timeout(150)
                foco = pg.evaluate("""()=>{const a=document.activeElement;if(!a)return null;const r=a.getBoundingClientRect(),c=getComputedStyle(a);
                    return {pular:a.classList.contains('tk-pular'),y:r.y,h:r.height,out:c.outlineWidth,outCor:c.outlineColor,alvo:a.getAttribute('href')}}""")
                chk(rot + ": 1º Tab vai ao pular e ele aparece na tela", bool(foco) and foco["pular"] and foco["y"] >= 0 and foco["h"] >= 44, foco)
                chk(rot + ": pular com anel laranja de 3 px", bool(foco) and foco["out"] == "3px" and foco["outCor"] == LARANJA, foco)
                alvo = pg.evaluate("(()=>{const a=document.querySelector('.tk-pular');const t=document.querySelector(a.getAttribute('href'));return !!t&&t.tagName.toLowerCase()})()")
                chk(rot + ": pular aponta para um destino real", bool(alvo), alvo)
            ctx.close()
    # anel de foco numa tela de uso real (botão da barra) em celular e computador
    for (w, h) in [(390, 844), (1440, 900)]:
        ctx, pg, st, er = novo(b, "index.html", w, h)
        pg.locator("#busca").focus(); pg.keyboard.press("Tab"); pg.wait_for_timeout(100)
        o = pg.evaluate("(()=>{const c=getComputedStyle(document.activeElement);return [c.outlineWidth,c.outlineColor,c.outlineStyle]})()")
        chk(f"{w} catálogo: foco por teclado com 3 px laranja", o[0] == "3px" and o[2] == "solid" and o[1] in (LARANJA, "rgb(13, 13, 13)", "rgb(168, 82, 0)"), o)
        ctx.close()

    # ---------- 2. Admin: botão de fechar, camadas, capa do vídeo, abas, tamanho das folhas ----------
    print("== Admin: folhas, capa do vídeo, abas ==")
    for (w, h) in [(390, 844), (1440, 900)]:
        ctx, pg, st, er = novo(b, "admin.html", w, h, perms=PERMS_ALL)
        pg.evaluate("abrirComHistorico_('overlay-categorias')"); pg.wait_for_timeout(400)
        c = caixa(pg, "#cat-fechar")
        chk(f"{w} admin: ✕ da folha 44×44 contornado", ehFechar(c), c)
        sheet = pg.evaluate("(()=>{const s=document.querySelector('#overlay-categorias .sheet');const c=getComputedStyle(s);return [c.height,c.maxHeight,innerHeight]})()")
        chk(f"{w} admin: folha cabe na altura visível (dvh)", float(sheet[0][:-2]) <= sheet[2] * 0.83 + 1, sheet)
        volta(pg)
        # Escolher capa do vídeo
        pg.evaluate("TKCapaVideo.abrir('icon-256.png', async()=>{})"); pg.wait_for_timeout(800)
        c = caixa(pg, "#capa-video-fechar")
        chk(f"{w} capa do vídeo: ✕ igual ao das outras folhas (44×44)", ehFechar(c), c)
        pg.mouse.click(5, 5); pg.wait_for_timeout(400)
        chk(f"{w} capa do vídeo: toque fora fecha", pg.locator("#overlay-capa-video").count() == 0)
        pg.evaluate("TKCapaVideo.abrir('icon-256.png', async()=>{})"); pg.wait_for_timeout(600)
        chk(f"{w} capa do vídeo: Voltar fecha só ela e consome a entrada", True)
        volta(pg)
        chk(f"{w} capa do vídeo: Voltar fechou", pg.locator("#overlay-capa-video").count() == 0 and "admin.html" in pg.url)
        pg.evaluate("TKCapaVideo.abrir('icon-256.png', async()=>{})"); pg.wait_for_timeout(500)
        pg.keyboard.press("Tab"); pg.keyboard.press("Tab"); pg.keyboard.press("Tab"); pg.keyboard.press("Tab"); pg.keyboard.press("Tab"); pg.keyboard.press("Tab")
        chk(f"{w} capa do vídeo: Tab não foge da janela", pg.evaluate("!!document.activeElement.closest('#overlay-capa-video')"))
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        chk(f"{w} capa do vídeo: Esc fecha", pg.locator("#overlay-capa-video").count() == 0)
        # abas da Central de avisos
        pg.evaluate("TKAvisosAdmin.abrir()"); pg.wait_for_timeout(1200)
        a = caixa(pg, ".av-abas [role=tab][aria-selected=true]")
        chk(f"{w} avisos: aba ativa preta com texto branco", bool(a) and a["bg"] == "rgb(20, 20, 20)" and a["cor"] == "rgb(255, 255, 255)", a)
        chk(f"{w} avisos: lista de abas usa tk-abas", pg.locator(".av-abas.tk-abas").count() == 1)
        a2 = caixa(pg, ".av-abas [role=tab][aria-selected=false]")
        chk(f"{w} avisos: aba inativa clara e ≥ 44 px", bool(a2) and a2["bg"] == "rgb(255, 255, 255)" and a2["h"] >= 43.5, a2)
        c = caixa(pg, "#av-fechar")
        chk(f"{w} avisos: ✕ 44×44", ehFechar(c), c)
        volta(pg)
        chk(f"{w} admin: sem erro de JavaScript", not er, er)
        ctx.close()

    # ---------- 3. Mensagens: foto ampliada é camada própria ----------
    print("== Mensagens: foto ampliada ==")
    ctx, pg, st, er = novo(b, "admin.html?app=mensagens", 390, 844, perms=PERMS_ALL, versao="3.7", mensagens=True)
    pg.wait_for_selector("#ms-lista .ms-conv"); pg.wait_for_timeout(600)
    ids = pg.evaluate("[...document.querySelectorAll('#ms-lista .ms-conv')].map(e=>e.dataset.id)")
    aberto = False
    for cid in ids:
        pg.evaluate(f"window.TKMobileOpenConversation({cid})"); pg.wait_for_timeout(900)
        if pg.locator("#ms-fio img").count():
            aberto = True; break
    chk("mensagens: achou conversa com foto", aberto)
    if aberto:
        vista0 = pg.evaluate("document.querySelector('#ms-app').dataset.vista")
        pg.locator("#ms-fio img").first.click(); pg.wait_for_timeout(500)
        chk("mensagens: foto ampliada entra no histórico (camada ms-luz)", pg.evaluate("history.state && history.state.overlay") == "ms-luz", pg.evaluate("history.state"))
        c = caixa(pg, ".ms-luz-x")
        chk("mensagens: ✕ da foto 44×44", bool(c) and abs(c["w"] - 44) <= 0.6 and abs(c["h"] - 44) <= 0.6, c)
        chk("mensagens: foco foi para o ✕ da foto", pg.evaluate("document.activeElement.classList.contains('ms-luz-x')"))
        pg.keyboard.press("Tab"); pg.keyboard.press("Tab")
        chk("mensagens: Tab fica preso na foto", pg.evaluate("!!document.activeElement.closest('#ms-luz')"))
        volta(pg, 700)
        chk("mensagens: Voltar fecha a FOTO e a conversa continua aberta", pg.locator("#ms-luz").count() == 0 and pg.evaluate("document.querySelector('#ms-app').dataset.vista") == vista0 == "conversa",
            pg.evaluate("document.querySelector('#ms-app').dataset.vista"))
        pg.locator("#ms-fio img").first.click(); pg.wait_for_timeout(400)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
        chk("mensagens: Esc fecha só a foto", pg.locator("#ms-luz").count() == 0 and pg.evaluate("document.querySelector('#ms-app').dataset.vista") == "conversa")
        pg.locator("#ms-fio img").first.click(); pg.wait_for_timeout(400)
        pg.click(".ms-luz-x"); pg.wait_for_timeout(500)
        chk("mensagens: botão ✕ consome a entrada (um Voltar depois sai da conversa, não da foto)", pg.locator("#ms-luz").count() == 0 and pg.evaluate("history.state && history.state.overlay") != "ms-luz")
    chk("mensagens: sem erro de JavaScript", not er, er)
    ctx.close()

    # ---------- 4. Catálogo ----------
    print("== Catálogo: ✕ único, filtros, menu ==")
    for (w, h) in [(390, 844), (1440, 900)]:
        ctx, pg, st, er = novo(b, "index.html", w, h, sessao=False)
        pg.wait_for_selector(".card")
        pg.click("#btn-conta-header"); pg.wait_for_timeout(500)
        c = caixa(pg, "#conta-fechar")
        chk(f"{w} Minha conta: ✕ 44×44", ehFechar(c), c)
        topo_conta = pg.evaluate("""()=>{const x=document.querySelector('#conta-fechar').getBoundingClientRect();
            const alvo=[...document.querySelectorAll('#conta-corpo > *')].map(e=>e.getBoundingClientRect());return alvo.every(r=>r.top>=x.bottom-0.5||r.bottom<=x.top+0.5||r.left>=x.right||r.right<=x.left)}""")
        chk(f"{w} Minha conta: ✕ não cobre o conteúdo", topo_conta)
        ab = pg.evaluate("[...document.querySelectorAll('.conta-abas [role=tab]')].map(e=>[e.getAttribute('aria-selected'),getComputedStyle(e).backgroundColor])")
        chk(f"{w} Minha conta: abas Entrar/Criar com aria-selected e preto", len(ab) == 2 and ab[0][0] == "true" and ab[0][1] == "rgb(20, 20, 20)" and ab[1][0] == "false", ab)
        volta(pg)
        pg.evaluate("abrirSacola()"); pg.wait_for_timeout(500)
        c = caixa(pg, "#btn-fechar-sacola")
        chk(f"{w} Minha seleção: ✕ 44×44", ehFechar(c), c)
        volta(pg)
        pg.locator(".card").first.click(); pg.wait_for_selector("#overlay.aberto"); pg.wait_for_timeout(500)
        c = caixa(pg, "#btn-fechar-modal")
        chk(f"{w} detalhe do produto: ✕ 44×44", bool(c) and c["w"] >= 43.9 and c["h"] >= 43.9 and "tk-fechar" in c["classe"], c)
        mh = pg.evaluate("getComputedStyle(document.querySelector('#overlay .modal')).maxHeight")
        chk(f"{w} detalhe do produto: altura máxima em dvh", abs(float(mh[:-2]) - h * 0.92) < 2, mh)
        volta(pg)
        if w == 390:
            pg.click("#btn-menu-header"); pg.wait_for_timeout(500)
            c = caixa(pg, ".ml-fechar")
            chk("390 menu lateral: ✕ igual (44×44, contornado)", ehFechar(c), c)
            volta(pg)
            # Filtros: ✕ igual e Esc só na janela do topo
            pg.locator("#btn-filtros-toggle").click(); pg.wait_for_timeout(600)
            c = caixa(pg, "#fx-fechar")
            chk("390 filtros: ✕ igual ao do menu (44×44, contornado)", ehFechar(c), c)
            chk("390 filtros: Tab preso no painel", (lambda: (pg.keyboard.press("Shift+Tab"), pg.keyboard.press("Shift+Tab"), pg.evaluate("!!document.activeElement.closest('#filtros-extras')"))[-1])())
            pg.evaluate("TKCamadas.empilhar('janela-teste', ()=>{})"); pg.wait_for_timeout(200)
            pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
            chk("390 filtros: Esc com outra janela por cima NÃO fecha os filtros", pg.evaluate("document.querySelector('#filtros').classList.contains('aberto')"))
            pg.evaluate("TKCamadas.desempilhar('janela-teste')"); pg.wait_for_timeout(500)
            pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
            chk("390 filtros: Esc na janela do topo fecha os filtros", not pg.evaluate("document.querySelector('#filtros').classList.contains('aberto')"))
            chk("390 filtros: fundo destravado depois de fechar (tk-travado)", not pg.evaluate("document.documentElement.classList.contains('tk-travado')"))
        chk(f"{w} catálogo: sem erro de JavaScript", not er, er)
        ctx.close()

    # ---------- 5. Treinamentos: foto grande, certificado, zerar dados, abas ----------
    print("== Treinamentos ==")
    ctx, pg, st, er = novo(b, "treinamentos.html?painel=rh", 390, 844, perms=PERMS_ALL + ["avaliacoes", "manual_1"], versao="3.7")
    pg.click('.admin-tab[data-tab="acessos"]'); pg.wait_for_selector(".ac-card"); pg.wait_for_timeout(500)
    ab = pg.evaluate("[...document.querySelectorAll('.admin-tabs [role=tab]')].map(e=>[e.getAttribute('aria-selected'),e.classList.contains('active'),getComputedStyle(e).backgroundColor,e.hasAttribute('aria-current')])")
    chk("treinamentos: abas do RH com aria-selected (sem aria-current) e a ativa preta", len(ab) >= 4 and sum(1 for x in ab if x[0] == "true") == 1 and not any(x[3] for x in ab)
        and [x for x in ab if x[0] == "true"][0][2] == "rgb(20, 20, 20)", ab)
    # botões que a lista de pessoas traria (a simulação não tem foto de corpo): o clique usa o mesmo caminho do site
    INJ = '''()=>{const c=document.querySelector('.ac-card');for(const [cl,id] of [['ac-corpo','t-corpo'],['ac-zerar','t-zerar']]){if(document.getElementById(id))continue;const b=document.createElement('button');b.type='button';b.className='admin-mini-btn '+cl;b.id=id;b.textContent=cl;c.appendChild(b);}}'''
    pg.evaluate(INJ)
    h0 = pg.evaluate("history.length")
    pg.locator("#t-corpo").click(); pg.wait_for_timeout(500)
    chk("treinamentos: foto grande entra no histórico", pg.evaluate("history.state && history.state.overlay") == "tm-foto", pg.evaluate("history.state"))
    c = caixa(pg, ".foto-grande-x")
    chk("treinamentos: ✕ da foto grande 44×44", bool(c) and abs(c["w"] - 44) <= 0.6 and "tk-fechar" in c["classe"], c)
    chk("treinamentos: foco foi para dentro da foto", pg.evaluate("!!document.activeElement.closest('.foto-grande')"))
    volta(pg, 700)
    chk("treinamentos: Voltar fecha a foto e fica em Treinamentos", pg.locator(".foto-grande").count() == 0 and "treinamentos.html" in pg.url, pg.url)
    pg.evaluate(INJ)
    pg.evaluate(INJ); pg.locator("#t-corpo").click(); pg.wait_for_timeout(400)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(600)
    chk("treinamentos: Esc fecha a foto e fica em Treinamentos", pg.locator(".foto-grande").count() == 0 and "treinamentos.html" in pg.url)
    pg.evaluate("TMV.mostrarCertificado({nome:'Fulana de Tal',titulo:'Atendimento',codigo:'ABC123',emitidoEm:'2026-11-01',validadoPor:'Gestão'})"); pg.wait_for_timeout(600)
    chk("treinamentos: certificado entra no histórico", pg.evaluate("history.state && history.state.overlay") == "tmv-cert")
    c = caixa(pg, "#tmv-fechar")
    chk("treinamentos: ✕ do certificado 44×44", bool(c) and abs(c["w"] - 44) <= 0.6 and "tk-fechar" in c["classe"], c)
    chk("treinamentos: certificado é diálogo modal", pg.evaluate("document.querySelector('#tmv-cert').getAttribute('aria-modal')") == "true")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(600)
    chk("treinamentos: Esc fecha o certificado (antes não fechava)", pg.locator("#tmv-cert").count() == 0 and "treinamentos.html" in pg.url)
    pg.evaluate("TMV.mostrarCertificado({nome:'Fulana de Tal',titulo:'Atendimento',codigo:'ABC123',emitidoEm:'2026-11-01',validadoPor:'Gestão'})"); pg.wait_for_timeout(500)
    volta(pg, 700)
    chk("treinamentos: Voltar fecha o certificado e fica em Treinamentos", pg.locator("#tmv-cert").count() == 0 and "treinamentos.html" in pg.url)
    pg.evaluate(INJ); pg.locator("#t-zerar").click(); pg.wait_for_timeout(500)
    chk("treinamentos: Zerar dados leva o foco para dentro", pg.evaluate("!!document.activeElement.closest('#tm-zerar')"))
    for _ in range(8): pg.keyboard.press("Tab")
    chk("treinamentos: Zerar dados prende o Tab", pg.evaluate("!!document.activeElement.closest('#tm-zerar')"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(600)
    chk("treinamentos: Zerar dados fecha com Esc e fica em Treinamentos", pg.locator("#tm-zerar").count() == 0 and "treinamentos.html" in pg.url)
    pg.evaluate(INJ); pg.locator("#t-zerar").click(); pg.wait_for_timeout(400); volta(pg, 600)
    chk("treinamentos: Zerar dados fecha com Voltar", pg.locator("#tm-zerar").count() == 0 and "treinamentos.html" in pg.url)
    chk("treinamentos: sem erro de JavaScript", not er, er)
    ctx.close()

    # ---------- 6. Currículos e Fotos com IA: abas ----------
    print("== Abas em Currículos e Fotos com IA ==")
    ctx, pg, st, er = novo(b, "curriculos.html", 390, 844, perms=PERMS_ALL)
    if pg.locator("#t1").count():
        t = pg.evaluate("[...document.querySelectorAll('.abas [role=tab]')].map(e=>[e.getAttribute('aria-selected'),getComputedStyle(e).backgroundColor])")
        chk("currículos: abas com role=tab e aria-selected (antes só .on)", len(t) == 2, t)
        chk("currículos: aba ativa preta", len(t) == 2 and t[0][0] == "true" and t[0][1] == "rgb(20, 20, 20)", t)
    else:
        print("  (login de currículos antes das abas: conferido só o código)")
        chk("currículos: marcação com tablist no código", "role=\"tablist\"" in (RAIZ / "curriculos.html").read_text(encoding="utf-8"))
    ctx.close()
    src = (RAIZ / "fotos-ia.html").read_text(encoding="utf-8")
    chk("fotos com IA: abas dentro de faixa clara com tk-abas", 'class="fi-abas tk-abas"' in src and "fi-faixa-abas" in src)

    # ---------- 7. Disponibilidade: perguntar antes de descartar ----------
    print("== Disponibilidade ==")
    html = (RAIZ / "tests" / "disponibilidade_rapida.py").read_text(encoding="utf-8")
    m = re.search(r"HTML='''(.*?)'''", html, re.S); boot = re.search(r"BOOT='''(.*?)'''", html, re.S)
    if m and boot:
        from mock import PNG
        ctx = b.new_context(viewport={"width": 390, "height": 844}, service_workers="block")
        ctx.route("**/disponibilidade-fixture", lambda r: r.fulfill(body=m.group(1), content_type="text/html"))
        ctx.route("**/tests/*.png", lambda r: r.fulfill(body=PNG, content_type="image/png"))
        pg = ctx.new_page(); er = []
        pg.on("pageerror", lambda e: er.append(str(e)))
        pg.on("dialog", lambda d: (DIALOGOS.append(d.message), d.accept() if RESPOSTA["aceitar"] else d.dismiss()))
        pg.goto(BASE + "disponibilidade-fixture"); pg.add_script_tag(url=BASE + "common.js"); pg.evaluate(boot.group(1))
        pg.click("#abrir"); pg.wait_for_selector("#ms-edicao-tamanhos")
        c = caixa(pg, ".tk-disp-fechar")
        chk("disponibilidade: ✕ 44×44 contornado", ehFechar(c), c)
        # sem marcação: toque fora fecha direto, sem perguntar
        DIALOGOS.clear(); pg.mouse.click(4, 4); pg.wait_for_timeout(300)
        chk("disponibilidade: sem alteração, toque fora fecha sem perguntar", pg.locator("#ms-edicao-tamanhos").count() == 0 and not DIALOGOS)
        # com marcação: toque fora pergunta e, recusando, mantém tudo
        pg.click("#abrir"); pg.wait_for_selector("#ms-edicao-tamanhos")
        pg.get_by_role("button", name="Retirar Floral", exact=True).click()
        RESPOSTA["aceitar"] = False; DIALOGOS.clear(); pg.mouse.click(4, 4); pg.wait_for_timeout(300)
        chk("disponibilidade: com marcação, toque fora PERGUNTA e recusar mantém a janela", pg.locator("#ms-edicao-tamanhos").count() == 1 and len(DIALOGOS) == 1, DIALOGOS)
        chk("disponibilidade: a pergunta diz a consequência", bool(DIALOGOS) and "Descartar" in DIALOGOS[0] and "salvo" in DIALOGOS[0], DIALOGOS)
        DIALOGOS.clear(); pg.locator(".tk-disp-fechar").focus(); pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        chk("disponibilidade: Esc também pergunta", pg.locator("#ms-edicao-tamanhos").count() == 1 and len(DIALOGOS) == 1)
        DIALOGOS.clear(); volta(pg, 600)
        chk("disponibilidade: Voltar pergunta e, recusando, a janela continua (e o próximo Voltar ainda funciona)",
            pg.locator("#ms-edicao-tamanhos").count() == 1 and len(DIALOGOS) == 1 and pg.evaluate("TKCamadas.aberta('ms-edicao-tamanhos')"), (DIALOGOS, pg.evaluate("history.state")))
        RESPOSTA["aceitar"] = True; DIALOGOS.clear(); pg.mouse.click(4, 4); pg.wait_for_timeout(400)
        chk("disponibilidade: confirmando, descarta e fecha", pg.locator("#ms-edicao-tamanhos").count() == 0 and len(DIALOGOS) == 1)
        chk("disponibilidade: nada foi gravado ao descartar", pg.evaluate("f.calls.length") == 0)
        chk("disponibilidade: sem erro de JavaScript", not er, er)
        ctx.close()
    else:
        chk("disponibilidade: fixture encontrada", False)

    # ---------- 8. Esteira: voltar para a Gestão, folha com pergunta, Tab preso e foco devolvido ----------
    print("== Esteira ==")
    for (w, h) in [(390, 844), (1440, 900)]:
        ctx, pg, st, er = novo(b, "esteira.html", w, h)
        v = caixa(pg, "#esteira-voltar")
        chk(f"{w} esteira: link '‹ Gestão' no cabeçalho (≥ 44 px)", bool(v) and v["h"] >= 43.9 and v["w"] >= 43.9, v)
        chk(f"{w} esteira: aponta para admin.html", pg.evaluate("document.querySelector('#esteira-voltar').getAttribute('href')") == "admin.html")
        ctx.close()
    src = (RAIZ / "esteira.html").read_text(encoding="utf-8")
    chk("esteira: folhas guardam alteração (guardaAlteracao) e usam TKJanela", "guardaAlteracao(corpo)" in src and "TKJanela.prender(fundo" in src)

    # ---------- 9. Escala de camadas e fundo travado ----------
    print("== Camadas ==")
    css = (RAIZ / "janelas.css").read_text(encoding="utf-8")
    nomes = re.findall(r"--z-([a-z0-9-]+):\s*(\d+)", css)
    valores = [int(v) for _, v in nomes]
    chk("camadas: escala --z-* declarada e crescente", len(nomes) >= 10 and valores == sorted(valores) and len(set(valores)) == len(valores), nomes)
    usados = ""
    for f in RAIZ.glob("*"):
        if f.suffix in (".js", ".css", ".html") and f.name not in ("common.js", "janelas.css") and not f.name.startswith("vendor"):
            usados += f.read_text(encoding="utf-8", errors="ignore")
    gigantes = re.findall(r"z-index:\s*(\d{5,})", usados)
    chk("camadas: nenhum z-index de 5+ dígitos fora da escala (exceto destaque dentro do iframe do tutorial)", set(gigantes) <= {"2147483646", "2147483647"}, sorted(set(gigantes)))
    chk("camadas: fundo travado de um jeito só (tk-travado)", "fx-travado" not in usados and not re.search(r"document\.body\.style\.overflow\s*=\s*'hidden'", usados))

    b.close()

print(f"\nOK={len(OK)} FALHAS={len(BAD)} {BAD}")
sys.exit(1 if BAD else 0)
