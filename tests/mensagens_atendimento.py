"""Mensagens v7.24 (atendimento): filtros "Mensagens"/"Grupos" combináveis, sem "Lidas"; seleção com Marcar lidas / Não lidas;
"Nos 2 WhatsApp" sai quando uma das conversas é encerrada; gaveta de Produtos (catálogo carregado) e Respostas rápidas;
*negrito* do WhatsApp nas bolhas. Serviços simulados (mock.py + mock_msg.py)."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
import mock_msg
from mock_msg import agora
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
EVID = os.environ.get("TK_EVID", "")
AXE = open(os.path.join(AQUI, "axe.min.js")).read()
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
def axe(pg, label):
    pg.evaluate(AXE)
    r = pg.evaluate("async()=>{const r=await axe.run(document.getElementById('overlay-mensagens'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}});return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id+'×'+v.nodes.length)}")
    chk("axe — " + label, not r, r)
def foto(pg, nome):
    if EVID: pg.screenshot(path=os.path.join(EVID, nome))
IDS = "[...document.querySelectorAll('#ms-lista .ms-conv')].map(b=>+b.dataset.id)"
def tela(b, w, h, mob):
    ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=mob, has_touch=mob, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_MENSAGENS_POLL_MS=400;")
    st = install(ctx, perms=PERMS_ALL, versao="3.4"); S = st["ig"].setdefault("msg", mock_msg.novo_estado())
    c7 = dict(next(c for c in S["convs"] if c["id"] == 4)); c7.update({"id": 7, "contato": "558899990000", "nome": "Maria", "previa": "Oi, sou eu de novo", "nao_lidas": 0}); S["convs"].append(c7)
    S["msgs"].append({"id": 90, "conversa_id": 4, "direcao": "entrada", "tipo": "texto", "texto": "Quero o *vestido* _liso_ ~azul~", "enviada_em": agora(), "status": "", "por": "", "status_em": agora()})
    erros = []; pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2800)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250)
    pg.click("#btn-abrir-mensagens"); pg.wait_for_selector(".ms-conv", timeout=6000); pg.wait_for_timeout(600)
    # v7.40.35: a aba inicial é Em atendimento. O roteiro deste teste percorre o painel
    # inteiro (conversa 1 do WhatsApp 1, 2, 4 do WhatsApp 2, 7 e 9), então usa "Todos",
    # como antes — só as conversas ENCERRADAS ficam de fora.
    pg.click('#ms-abas .ms-aba[data-aba="todos"]'); pg.wait_for_timeout(900)
    return ctx, pg, S, erros
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx, pg, S, erros = tela(b, 390, 844, True)
    print("== Filtros ==")
    # v7.40.35: a fila virou ABA (4 abas); a linha de filtros guarda canal + Todos/Só meus
    # + o atalho "Só não respondidos" — mesma fileira, mesma altura do cabeçalho.
    abas = pg.evaluate("[...document.querySelectorAll('#ms-abas .ms-aba')].map(x=>(x.firstChild&&x.firstChild.nodeValue||x.textContent).trim())")
    chk("quatro abas do fluxo", abas == ["Em atendimento", "Pendentes", "Todos", "Encerrados"], abas)
    celulas = pg.evaluate("[...document.querySelectorAll('#ms-filtros > *')].length")
    chk("linha de filtros com 3 células (canal, escopo, atalho)", celulas == 3, celulas)
    # o atalho existe na aba Em atendimento (checado lá; aqui o roteiro já está em "Todos")
    chk("atalho 'Só não respondidos' só aparece em Em atendimento",
        pg.locator("#ms-so-nao-respondidos").count() == 0)
    chk("começa com individuais, sem grupos",3 not in pg.evaluate(IDS) and len(pg.evaluate(IDS))==6)
    def tipos(msg,grp):
        pg.click('[data-ms=filtros-abrir]')
        pg.locator('[name=ms-ft-tipo][value=msg]').set_checked(msg)
        pg.locator('[name=ms-ft-tipo][value=grp]').set_checked(grp)
        pg.click('[data-ms=filtros-aplicar]');pg.wait_for_timeout(500)
    tipos(False,True)
    chk("filtro de grupos",pg.evaluate(IDS)==[3] and S["consultas"][-1]["tipo"]=="grupo")
    tipos(True,True)
    chk("pode incluir individuais e grupos",len(pg.evaluate(IDS))==7 and S["consultas"][-1]["tipo"]=="")
    axe(pg, "filtros novos")
    print("== Seleção: lidas / não lidas ==")
    pg.click("#ms-mais"); pg.wait_for_timeout(200); pg.click("#ms-gaveta [data-ms=selecionar]"); pg.wait_for_timeout(200)
    pg.click("#ms-lista .ms-conv[data-id='1']"); pg.click("#ms-lista .ms-conv[data-id='4']"); pg.wait_for_timeout(200)
    acoes = pg.evaluate("[...document.querySelectorAll('#ms-selbar .ms-sel-acoes button')].map(x=>x.textContent)")
    chk("barra de seleção: Marcar lidas · Não lidas · Encerrar", acoes == ["Marcar lidas", "Não lidas", "Encerrar 2"], acoes)
    axe(pg, "barra de seleção")
    foto(pg, "02-selecao-390.png")
    pg.click("[data-ms=sel-lidas]"); pg.wait_for_timeout(700)
    lt = S["lote_lida"][-1]
    chk("'Marcar lidas' manda as duas de uma vez e pede a leitura no celular", sorted(lt["ids"]) == [1, 4] and lt["naoLida"] is False and lt["celular"] is True, lt)
    chk("depois de marcar: badges somem e a barra fecha", pg.locator("#ms-lista .ms-conv[data-id='1'] .ms-badge").count() == 0 and not pg.locator("#ms-selbar").is_visible() and "marcadas como lidas" in (pg.locator("#ms-aviso").text_content() or ""))
    pg.click("#ms-mais"); pg.wait_for_timeout(200); pg.click("#ms-gaveta [data-ms=selecionar]"); pg.click("#ms-lista .ms-conv[data-id='2']"); pg.click("[data-ms=sel-naolidas]"); pg.wait_for_timeout(700)
    lt = S["lote_lida"][-1]
    chk("'Não lidas' marca só no painel (sem pedir o celular)", lt["ids"] == [2] and lt["naoLida"] is True and lt["celular"] is False and pg.locator("#ms-lista .ms-conv[data-id='2'] .ms-badge").count() == 1, lt)
    print("== Nos 2 WhatsApp + encerrar ==")
    chk("Maria nos 2 WhatsApp antes de encerrar",pg.locator("#ms-lista .ms-conv[data-id=\"1\"] .ms-ambos-tag").count()==1)
    pg.click("#ms-mais"); pg.wait_for_timeout(200); pg.click("#ms-gaveta [data-ms=selecionar]"); pg.click("#ms-lista .ms-conv[data-id='7']"); pg.click("[data-ms=sel-encerrar]"); pg.click("[data-ms=motivo][data-m=concluido]"); pg.wait_for_timeout(800)
    chk("encerrar um canal remove o aviso de outro canal ativo",pg.locator('#ms-lista .ms-conv[data-id="1"] .ms-ambos-tag').count()==0)
    c7 = next(c for c in S["convs"] if c["id"] == 7); c7.update({"encerrada_em": "", "atualizada_em": agora(), "nao_lidas": 1})
    pg.wait_for_timeout(1500)
    chk("quando o cliente escreve na encerrada, as duas voltam para 'Nos 2 WhatsApp'", pg.locator("#ms-lista .ms-conv[data-id='1'] .ms-ambos-tag").count() == 1)
    print("== Produtos ==")
    pg.click("#ms-lista .ms-conv[data-id='4']"); pg.wait_for_selector("#ms-assina [data-ms=gaveta-produtos]", timeout=4000)
    bolha = pg.locator("#ms-fio .ms-bolha", has_text="Quero o").last
    chk("*negrito*, _itálico_ e ~riscado~ do WhatsApp aparecem formatados (sem os símbolos)", bolha.locator("b").text_content() == "vestido" and bolha.locator("i").text_content() == "liso" and bolha.locator("s").text_content() == "azul" and "*" not in (bolha.text_content() or ""), bolha.inner_html())
    pg.fill("#ms-texto", "Oi!"); pg.click("[data-ms=gaveta-produtos]"); pg.wait_for_selector("#ms-gaveta", timeout=3000)
    chk("gaveta Produtos abre com a busca em foco", pg.evaluate("document.activeElement && document.activeElement.id") == "ms-prod-busca")
    pg.fill("#ms-prod-busca", "vestido"); pg.wait_for_timeout(300)
    nomes = pg.evaluate("[...document.querySelectorAll('#ms-prod-lista .ms-prod b')].map(x=>x.textContent)")
    chk("busca no catálogo carregado (só ativos)", sorted(nomes) == ["Vestido Liso", "Vestido Premium"], nomes)
    det = pg.locator("#ms-prod-lista .ms-prod", has_text="Vestido Liso").inner_text()
    chk("cada produto mostra preço à vista, código e tamanhos", "à vista" in det and "TK-0005" in det and "P · M · G" in det, det)
    pg.fill("#ms-prod-busca", "saia"); pg.wait_for_timeout(300)
    n1 = pg.locator("#ms-prod-lista .ms-prod").count(); pg.uncheck("#ms-prod-estoque"); pg.wait_for_timeout(300)
    det2 = pg.locator("#ms-prod-lista").inner_text()
    chk("'Só com estoque' esconde os esgotados; desmarcado, mostra com 'Esgotado'", n1 == 2 and pg.locator("#ms-prod-lista .ms-prod").count() == 3 and "Esgotado" in det2, [n1, det2])
    pg.fill("#ms-prod-busca", "vestido liso"); pg.wait_for_timeout(300)
    axe(pg, "gaveta Produtos")
    foto(pg, "03-produtos-390.png")
    pg.click("#ms-prod-lista [data-ms=prod-usar]"); pg.wait_for_timeout(300)
    txt = pg.input_value("#ms-texto")
    chk("'Colocar na mensagem' junta ao que já estava escrito: nome em negrito, preço, tamanhos e o link da peça", txt.startswith("Oi!\n\n*Vestido Liso*") and "à vista" in txt and "Tamanhos: P, M, G" in txt and "tenkitermodas.com.br/p/TK-0005" in txt and not pg.locator("#ms-gaveta").count(), txt)
    chk("o botão Enviar fica liberado e o texto pode ser editado antes", pg.locator("#ms-enviar").is_enabled())
    print("== Respostas rápidas ==")
    pg.fill("#ms-texto", ""); pg.click("[data-ms=gaveta-respostas]"); pg.wait_for_selector("#ms-gaveta", timeout=3000)
    tits = pg.evaluate("[...document.querySelectorAll('.ms-resp b')].map(x=>x.textContent)")
    chk("respostas iniciais só com o que o site sabe (endereço, catálogo, Instagram)", tits == ["Endereço da loja", "Catálogo no site", "Instagram"], tits)
    axe(pg, "gaveta Respostas")
    foto(pg, "04-respostas-390.png")
    pg.click(".ms-resp >> nth=0"); pg.wait_for_timeout(300)
    chk("tocar numa resposta coloca o texto na mensagem", "Rua Dr. Moreira da Rocha, 759" in pg.input_value("#ms-texto"))
    pg.click("[data-ms=gaveta-respostas]"); pg.click("[data-ms=resp-editar]"); pg.wait_for_timeout(200)
    pg.locator("#ms-resp-edit button", has_text="Nova resposta").click(); pg.wait_for_timeout(150)
    ins = pg.locator("#ms-resp-edit input"); txs = pg.locator("#ms-resp-edit textarea")
    ins.last.fill("Pagamento"); txs.last.fill("Aceitamos Pix e cartão."); pg.locator("#ms-resp-edit button", has_text="Salvar respostas").click(); pg.wait_for_timeout(600)
    chk("editar e salvar as respostas (valem para toda a equipe)", [r["t"] for r in (S.get("respostas") or [])] == ["Endereço da loja", "Catálogo no site", "Instagram", "Pagamento"] and pg.locator(".ms-resp", has_text="Pagamento").count() == 1, S.get("respostas"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    chk("Esc fecha a gaveta e a conversa continua aberta", not pg.locator("#ms-gaveta").count() and pg.locator("#ms-texto").is_visible())
    chk("sem erros de JavaScript (celular)", not erros, erros)
    ctx.close()
    for w, h, mob in ((320, 700, True), (1280, 860, False)):
        ctx, pg, S, erros = tela(b, w, h, mob)
        pg.click("#ms-lista .ms-conv[data-id='4']"); pg.wait_for_selector("#ms-assina [data-ms=gaveta-produtos]", timeout=4000)
        med = pg.evaluate("(()=>{const a=document.getElementById('ms-assina'),r=a.getBoundingClientRect();return {h:Math.round(r.height),dentro:[...a.children].every(e=>e.getBoundingClientRect().right<=r.right+1),bt:[...a.querySelectorAll('button')].map(x=>Math.round(x.getBoundingClientRect().height))}})()")
        chk("%d px: barra de ferramentas numa linha só (44 px), sem vazar" % w, med["h"] <= 44 and med["dentro"] and all(x >= 44 for x in med["bt"]), med)
        pg.click("[data-ms=gaveta-produtos]"); pg.wait_for_timeout(300); pg.fill("#ms-prod-busca", "vestido"); pg.wait_for_timeout(300)
        g = pg.evaluate("(()=>{const g=document.getElementById('ms-gaveta').getBoundingClientRect(),c=document.getElementById('ms-conversa').getBoundingClientRect();return {g:[Math.round(g.left),Math.round(g.width)],c:[Math.round(c.left),Math.round(c.width)],scroll:document.getElementById('ms-gaveta').scrollWidth>document.getElementById('ms-gaveta').clientWidth+1}})()")
        chk("%d px: gaveta dentro da coluna da conversa%s, sem rolagem lateral" % (w, " (painel à direita no computador)" if w > 900 else ""), not g["scroll"] and g["g"][0] >= g["c"][0] and (w < 900 or g["g"][1] <= 421), g)
        foto(pg, "05-produtos-%d.png" % w)
        chk("sem erros de JavaScript (%d px)" % w, not erros, erros)
        ctx.close()
    b.close()
print("\n%d ok, %d falhas" % (len(OK), len(BAD)))
if BAD: print("\n".join(BAD)); sys.exit(1)
