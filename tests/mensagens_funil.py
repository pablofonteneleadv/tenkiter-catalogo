"""Mensagens v7.40.15: "Funil de vendas" (menu ⋯ geral). Colunas = etiquetas de venda; cartão = pessoa; mover = trocar a etapa da venda.
Celular 390: página sem rolagem lateral (só o quadro rola de lado, com encaixe), mover pelo menu do cartão, abrir conversa, "voltar" fecha o funil.
Computador 1440: colunas lado a lado, arrastar e soltar e menu pelo teclado. Serviços simulados (mock_msg.py). TK_EVID=<pasta> guarda capturas."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, AQUI)
from mock import *
import mock_msg
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
EVID = os.environ.get("TK_EVID", "")
AXE = open(os.path.join(AQUI, "axe.min.js")).read()
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
def axe(pg, label):
    pg.evaluate(AXE)
    r = pg.evaluate("async()=>{const r=await axe.run(document.getElementById('overlay-mensagens'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}});return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id+'×'+v.nodes.length+' '+v.nodes.slice(0,2).map(x=>x.target.join(' ')).join(','))}")
    chk("axe — " + label, not r, r)
def foto(pg, nome):
    if EVID: pg.screenshot(path=os.path.join(EVID, nome))
E = {e["nome"]: e["id"] for e in mock_msg.ETQ_PADRAO}
def preparar(S):
    S["etq_mock"] = [dict(e) for e in mock_msg.ETQ_PADRAO]
    et = lambda *ns: [dict(e) for e in S["etq_mock"] if e["nome"] in ns]
    c = {x["id"]: x for x in S["convs"]}
    chave = mock_msg.pessoa(c[1])
    c[5]["pessoa"] = chave; c[5]["nome"] = "Maria"                 # Maria fala pelo WhatsApp 1 e pelo Instagram
    c[1]["etiquetas"] = et("Reserva", "Troca"); c[5]["etiquetas"] = et("Reserva", "Troca")
    c[2]["etiquetas"] = et("Novo cliente")
    c[4]["etiquetas"] = et("Aguardando pagamento"); c[4]["dono"] = "Bia"
    c[6]["etiquetas"] = et("Pago")
    c[3]["etiquetas"] = et("Reserva")                                # grupo: fica fora
def tela(b, w, h, mob):
    ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=mob, has_touch=mob, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_MENSAGENS_POLL_MS=400;")
    st = install(ctx, perms=PERMS_ALL, versao="3.4"); S = st["ig"].setdefault("msg", mock_msg.novo_estado())
    preparar(S)
    erros = []; pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250)
    pg.click("#btn-abrir-mensagens"); pg.wait_for_selector(".ms-conv", timeout=6000); pg.wait_for_timeout(600)
    return ctx, pg, S, erros
def abrir_funil(pg):
    pg.click("#ms-nav [data-ms=funil]"); pg.wait_for_selector(".ms-fcol", timeout=4000); pg.wait_for_timeout(300)
def colunas(pg): return pg.eval_on_selector_all(".ms-fcol h4", "es=>es.map(e=>e.textContent)")
def cartoes(pg, etq): return pg.eval_on_selector_all(".ms-fcol[data-etq='%d'] .ms-fcard" % etq, "es=>es.map(e=>e.dataset.id)")
SEM_ROLAGEM = """(()=>{if(document.documentElement.scrollWidth>innerWidth||document.body.scrollWidth>innerWidth)return 'documento '+document.documentElement.scrollWidth;
  const fora=[...document.querySelectorAll('#overlay-mensagens *')].filter(e=>!e.closest('#ms-fq')&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.left<-1||r.right>innerWidth+1)});
  const q=document.getElementById('ms-fq'),rq=q.getBoundingClientRect();
  return fora.length?fora.slice(0,3).map(e=>e.className||e.tagName).join(','):(rq.left<-1||rq.right>innerWidth+1)?'quadro fora':''})()"""
ALVOS = "(s)=>[...document.querySelectorAll(s)].filter(e=>e.getClientRects().length).filter(e=>{const r=e.getBoundingClientRect();return r.height<44||r.width<44}).map(e=>(e.dataset.ms||e.textContent)+':'+Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height))"

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    # ===================== celular 390×844 =====================
    ctx, pg, S, erros = tela(b, 390, 844, True)
    itens = pg.eval_on_selector_all("#ms-nav button", "es=>es.map(e=>e.textContent)")
    chk("Funil tem acesso direto na navegação inferior", itens == ["Conversas", "Funil", "Com notas", "Mais"], itens)
    pg.click("#ms-nav [data-ms=funil]"); pg.wait_for_selector(".ms-fcol", timeout=4000); pg.wait_for_timeout(300)
    chk("colunas = etiquetas de venda, na ordem (Troca fica fora)", colunas(pg) == ["Novo cliente", "Reserva", "Aguardando pagamento", "Pago", "Enviado"], colunas(pg))
    chk("pede o funil do canal atual (Todas)", (S.get("funil_consultas") or [""])[-1] == "todos")
    chk("filtros e busca saem do caminho, título 'Funil de vendas · Todas'", not pg.locator("#ms-busca").is_visible() and "Funil de vendas · Todas" in pg.inner_text("#ms-ftitulo"))
    chk("Maria (2 canais) aparece uma vez só, pela conversa mais recente (Instagram)", pg.locator(".ms-fcard", has_text="Maria").count() == 1 and cartoes(pg, E["Reserva"]) == ["5"], cartoes(pg, E["Reserva"]))
    chk("grupo com etiqueta de venda não aparece", pg.locator(".ms-fcard[data-id='3']").count() == 0)
    card4 = pg.inner_text(".ms-fcard[data-id='4']")
    chk("cartão mostra nome, prévia, há quanto tempo, canal e responsável", all(x in card4 for x in ["João", "Boa tarde", "há 20 min", "WhatsApp 2", "Responsável: Bia"]), card4)
    chk("cabeçalho da coluna com cor, nome e total", pg.locator(".ms-fcol[data-etq='%d'] .ms-etq-ponto" % E["Pago"]).count() == 1 and pg.inner_text(".ms-fcol[data-etq='%d'] .ms-ftot" % E["Pago"]) == "1")
    chk("coluna vazia diz 'Ninguém nesta etapa.'", "Ninguém nesta etapa." in pg.inner_text(".ms-fcol[data-etq='%d']" % E["Enviado"]))
    chk("dados entram como texto (o '<b>' da prévia não vira HTML)", pg.evaluate("!document.querySelector('#ms-funil b, #ms-funil img, #ms-funil script')"))
    chk("390: a página não rola de lado (só o quadro)", pg.evaluate(SEM_ROLAGEM) == "", pg.evaluate(SEM_ROLAGEM))
    snap = pg.evaluate("(()=>{const q=document.getElementById('ms-fq'),c=q.querySelector('.ms-fcol'),s=getComputedStyle(q);return {tipo:s.scrollSnapType,ov:s.overflowX,larg:q.scrollWidth>q.clientWidth,col:c.getBoundingClientRect().width/innerWidth,al:getComputedStyle(c).scrollSnapAlign}})()")
    chk("390: quadro com rolagem lateral e encaixe (uma coluna por tela)", "x" in snap["tipo"] and "mandatory" in snap["tipo"] and snap["ov"] == "auto" and snap["larg"] and snap["col"] > 0.8 and "start" in snap["al"], snap)
    chk("390: '1 de 5' no cabeçalho e seta anterior desligada na primeira coluna", pg.inner_text(".ms-fcol:nth-child(1) .ms-fpos") == "1 de 5" and pg.is_disabled(".ms-fcol:nth-child(1) [data-dir='-1']"))
    pg.click(".ms-fcol:nth-child(1) [data-dir='1']"); pg.wait_for_timeout(700)
    pos = pg.evaluate("(()=>{const q=document.getElementById('ms-fq'),c=q.children[1];return Math.abs((c.getBoundingClientRect().left-q.getBoundingClientRect().left)-12)})()")
    chk("390: seta › leva a próxima coluna (Reserva) para a tela, encaixada", pos <= 2, pos)
    chk("390: alvos do quadro ≥ 44 px", not pg.evaluate(ALVOS, "#ms-funil button"), pg.evaluate(ALVOS, "#ms-funil button"))
    axe(pg, "funil (390)")
    foto(pg, "funil-390-quadro.png")
    # tocar no cartão: menu de mover e abrir conversa
    pg.click(".ms-fcard[data-id='5']"); pg.wait_for_selector("#ms-gaveta .ms-fop", timeout=3000); pg.wait_for_timeout(200)
    ops = pg.eval_on_selector_all("#ms-gaveta .ms-fop", "es=>es.map(e=>[e.textContent,e.getAttribute('aria-current')])")
    chk("tocar no cartão abre 'Mover para' com todas as etapas e a atual marcada", [o[0].replace("etapa atual", "").strip() for o in ops] == colunas(pg) and dict((o[0].replace("etapa atual", "").strip(), o[1]) for o in ops)["Reserva"] == "true", ops)
    chk("o menu tem 'Abrir conversa' e 'Tirar do funil'", pg.locator("#ms-gaveta [data-ms=funil-abrir]").is_visible() and pg.locator("#ms-gaveta [data-ms=funil-mover][data-etq='0']").is_visible())
    chk("390: gaveta sem rolagem lateral e alvos ≥ 44 px", pg.evaluate("document.documentElement.scrollWidth<=innerWidth") and not pg.evaluate(ALVOS, "#ms-gaveta button"), pg.evaluate(ALVOS, "#ms-gaveta button"))
    axe(pg, "menu do cartão (390)")
    foto(pg, "funil-390-mover.png")
    pg.click("#ms-gaveta [data-ms=funil-mover][data-etq='%d']" % E["Pago"]); pg.wait_for_timeout(900)
    chk("mover manda conversa e etiqueta", (S.get("funil_posts") or [{}])[-1] == {"conversa": 5, "etiqueta": E["Pago"]}, S.get("funil_posts"))
    chk("depois de mover: cartão na coluna Pago e fora de Reserva", "5" in cartoes(pg, E["Pago"]) and "5" not in cartoes(pg, E["Reserva"]) and pg.locator("#ms-gaveta").count() == 0)
    chk("aviso em português ('Maria agora está em Pago.')", "Maria agora está em Pago" in pg.inner_text("#ms-aviso"))
    chk("a etiqueta não-venda (Troca) continua com a pessoa", sorted(e["nome"] for e in next(x for x in S["convs"] if x["id"] == 1)["etiquetas"]) == ["Pago", "Troca"])
    chk("390: o quadro continua na mesma coluna depois de mover", pg.evaluate("document.getElementById('ms-fq').scrollLeft") > 100)
    # erro do servidor
    S["funil_falha"] = "Não foi possível mudar a etapa agora. Tente de novo."
    pg.click(".ms-fcard[data-id='4']"); pg.wait_for_selector("#ms-gaveta .ms-fop", timeout=3000)
    pg.click("#ms-gaveta [data-ms=funil-mover][data-etq='%d']" % E["Enviado"]); pg.wait_for_timeout(500)
    chk("erro ao mover: aviso legível, sem JSON, e a gaveta continua aberta", "Não foi possível mudar a etapa" in pg.inner_text("#ms-aviso") and "{" not in pg.inner_text("#ms-aviso") and pg.locator("#ms-gaveta").count() == 1)
    S.pop("funil_falha")
    pg.click("#ms-gaveta [data-ms=funil-abrir]"); pg.wait_for_selector("#ms-texto", timeout=4000); pg.wait_for_timeout(500)
    chk("'Abrir conversa' abre a conversa normal (João)", pg.locator("#ms-texto").is_visible() and "João" in pg.inner_text(".ms-cab") and not pg.locator("#ms-funil").is_visible())
    pg.click("[data-ms=voltar]"); pg.wait_for_timeout(500)
    chk("voltar da conversa leva à lista (funil fechado)", pg.locator("#ms-lista").is_visible() and pg.locator("#ms-busca").is_visible())
    # "voltar" do aparelho fecha o funil e mantém as mensagens abertas
    abrir_funil(pg)
    pg.go_back(); pg.wait_for_timeout(500)
    chk("'voltar' do aparelho fecha o funil e a caixa de mensagens continua aberta", not pg.locator("#ms-funil").is_visible() and pg.locator("#ms-lista").is_visible() and pg.locator("#overlay-mensagens.aberto").count() == 1)
    # filtro de canal
    abrir_funil(pg)
    pg.click("[data-ms=aba][data-canal=whatsapp2]"); pg.wait_for_timeout(900)
    ids = pg.eval_on_selector_all(".ms-fcard", "es=>es.map(e=>e.dataset.id)")
    chk("trocar a aba de canal com o funil aberto mostra o funil daquele canal", (S.get("funil_consultas") or [""])[-1] == "whatsapp2" and sorted(ids) == ["4", "6"] and "WhatsApp 2" in pg.inner_text("#ms-ftitulo"), ids)
    chk("390: sem rolagem lateral da página no canal filtrado", pg.evaluate(SEM_ROLAGEM) == "")
    pg.click("#ms-funil [data-ms=fechar-painel]"); pg.wait_for_timeout(500)
    chk("'← Conversas' volta para a lista", pg.locator("#ms-lista").is_visible() and not pg.locator("#ms-funil").is_visible())
    chk("sem erros JavaScript (390)", not erros, erros)
    ctx.close()
    # ===================== computador 1440×900 =====================
    ctx, pg, S, erros = tela(b, 1440, 900, False)
    abrir_funil(pg)
    lado = pg.evaluate("(()=>{const cs=[...document.querySelectorAll('.ms-fcol')].map(c=>c.getBoundingClientRect());return {tops:new Set(cs.map(r=>Math.round(r.top))).size,dentro:cs.every(r=>r.left>=0&&r.right<=innerWidth),esq:cs.every((r,i)=>!i||r.left>cs[i-1].right)}})()")
    chk("1440: as 5 colunas lado a lado, todas visíveis", lado["tops"] == 1 and lado["dentro"] and lado["esq"], lado)
    chk("1440: a conversa sai do caminho e o quadro usa a largura", not pg.locator(".ms-conversa").is_visible() and pg.evaluate("document.getElementById('ms-fq').getBoundingClientRect().width") > 900)
    chk("1440: sem rolagem lateral", pg.evaluate(SEM_ROLAGEM) == "", pg.evaluate(SEM_ROLAGEM))
    chk("1440: cartões arrastáveis e dica de arrastar", pg.get_attribute(".ms-fcard[data-id='4']", "draggable") == "true" and "Arraste" in pg.inner_text(".ms-fdica"))
    axe(pg, "funil (1440)")
    foto(pg, "funil-1440.png")
    pg.drag_and_drop(".ms-fcard[data-id='4']", ".ms-fcol[data-etq='%d']" % E["Enviado"]); pg.wait_for_timeout(900)
    chk("1440: arrastar e soltar move o cartão para Enviado", (S.get("funil_posts") or [{}])[-1] == {"conversa": 4, "etiqueta": E["Enviado"]} and "4" in cartoes(pg, E["Enviado"]), S.get("funil_posts"))
    # teclado: foco no cartão, Enter abre o menu, Tab até "Mover para Novo cliente"
    pg.focus(".ms-fcard[data-id='2']"); pg.keyboard.press("Enter"); pg.wait_for_selector("#ms-gaveta .ms-fop", timeout=3000); pg.wait_for_timeout(200)
    chk("1440: Enter no cartão abre o menu e o foco entra nele", pg.evaluate("document.activeElement.dataset.ms") == "gaveta-fechar")
    pg.keyboard.press("Tab"); pg.keyboard.press("Tab")
    chk("1440: teclado chega em 'Mover para Reserva'", pg.evaluate("document.activeElement.getAttribute('aria-label')") == "Mover para Reserva", pg.evaluate("document.activeElement.outerHTML.slice(0,120)"))
    pg.keyboard.press("Enter"); pg.wait_for_timeout(900)
    chk("1440: Enter move e o foco volta ao cartão na coluna nova", (S.get("funil_posts") or [{}])[-1] == {"conversa": 2, "etiqueta": E["Reserva"]} and pg.evaluate("document.activeElement.dataset.id") == "2" and "2" in cartoes(pg, E["Reserva"]))
    pg.click(".ms-fcard[data-id='2']"); pg.wait_for_selector("#ms-gaveta .ms-fop", timeout=3000)
    pg.click("#ms-gaveta [data-ms=funil-mover][data-etq='0']"); pg.wait_for_timeout(800)
    chk("1440: 'Tirar do funil' manda etiqueta 0 e o cartão some", (S.get("funil_posts") or [{}])[-1] == {"conversa": 2, "etiqueta": 0} and pg.locator(".ms-fcard[data-id='2']").count() == 0)
    pg.click(".ms-fcard[data-id='6']"); pg.wait_for_selector("#ms-gaveta .ms-fop", timeout=3000)
    pg.click("#ms-gaveta [data-ms=funil-abrir]"); pg.wait_for_selector("#ms-texto", timeout=4000); pg.wait_for_timeout(400)
    chk("1440: 'Abrir conversa' volta ao layout normal com a conversa aberta", pg.locator(".ms-conversa").is_visible() and "Ana Mídia" in pg.inner_text(".ms-cab") and not pg.locator("#ms-funil").is_visible())
    chk("sem erros JavaScript (1440)", not erros, erros)
    ctx.close()
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
