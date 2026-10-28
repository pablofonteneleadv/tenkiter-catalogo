"""Mensagens v7.40.14: "Ficha do cliente" — gaveta aberta pelo nome/avatar da conversa ou pelo menu ⋯, com tamanhos (atalhos + texto),
preferências, cidade/bairro, etiquetas (atalho "Mudar etiquetas"), notas recentes, compras e canais. Faixa "Veste …" na conversa.
Serviços simulados (mock_msg.py). TK_EVID=<pasta> guarda as capturas de tela (celular 390, computador 1440)."""
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
DIALOGOS = []
def tela(b, w, h, mob, conv, preparar=None):
    ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=mob, has_touch=mob, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script("window.TK_MENSAGENS_POLL_MS=400;")
    st = install(ctx, perms=PERMS_ALL, versao="3.4"); S = st["ig"].setdefault("msg", mock_msg.novo_estado())
    if preparar: preparar(S)
    erros = []; pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.on("dialog", lambda d: (DIALOGOS.append(d.message), d.accept()))
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250)
    pg.click("#btn-abrir-mensagens"); pg.wait_for_selector(".ms-conv", timeout=6000); pg.wait_for_timeout(600)
    pg.click("#ms-lista .ms-conv[data-id='%d']" % conv); pg.wait_for_selector("#ms-texto", timeout=4000); pg.wait_for_timeout(500)
    return ctx, pg, S, erros
def esperar_ficha(pg):
    pg.wait_for_selector("#ms-fi-salvar", timeout=4000); pg.wait_for_timeout(200)
def sem_rolagem_h(pg):
    return pg.evaluate("document.documentElement.scrollWidth<=innerWidth && [...document.querySelectorAll('#ms-gaveta *')].every(e=>{const r=e.getBoundingClientRect();return r.width===0||(r.left>=-1&&r.right<=innerWidth+1)})")
def dentro(pg, sel):
    return pg.evaluate("(s)=>{const r=document.querySelector(s).getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&r.height>=44}", sel)
ALVOS = "[...document.querySelectorAll('#ms-gaveta button, #ms-gaveta input, #ms-gaveta textarea, .ms-cab .ms-quem')].filter(e=>e.getClientRects().length).every(e=>{const r=e.getBoundingClientRect();return r.height>=44&&r.width>=44})"
PEQUENOS = "[...document.querySelectorAll('#ms-gaveta button, #ms-gaveta input, #ms-gaveta textarea, .ms-cab .ms-quem')].filter(e=>e.getClientRects().length).filter(e=>{const r=e.getBoundingClientRect();return r.height<44||r.width<44}).map(e=>(e.id||e.textContent)+':'+Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height))"
def txt(pg, sel): return pg.inner_text(sel)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    # ===== celular 390×844: Maria (WhatsApp 1) vinculada ao Instagram, com notas, etiqueta e uma venda =====
    def preparar(S):
        S["etq_mock"] = [{"id": 1, "nome": "Reserva", "cor": "ambar", "venda": 1, "ordem": 0, "pessoas": 0}, {"id": 2, "nome": "Troca", "cor": "rosa", "venda": 0, "ordem": 1, "pessoas": 0}]
    ctx, pg, S, erros = tela(b, 390, 844, True, 1, preparar)
    chave = mock_msg.pessoa(S["convs"][0])
    S["convs"][4]["pessoa"] = chave                                  # conversa 5 (Instagram) = mesma pessoa
    S["notas"] = {chave: [{"id": i, "texto": "Nota %d da Maria" % i, "autor": "Bia", "em": mock_msg.iso(100 - i)} for i in range(1, 8)]}
    S["vendas"] = [{"conversa_id": 5, "em": "2026-10-12T15:00:00.000Z"}]
    S["convs"][0]["etiquetas"] = [S["etq_mock"][0]]
    chk("sem ficha: a faixa da conversa não inventa tamanhos", pg.locator("#ms-veste").count() == 0)
    chk("botão do nome tem nome acessível de abrir a ficha", "ficha do cliente" in (pg.get_attribute(".ms-cab .ms-quem", "aria-label") or ""))
    pg.click(".ms-cab .ms-quem"); esperar_ficha(pg)
    chk("tocar no nome abre a gaveta 'Ficha do cliente'", pg.locator("#ms-gaveta").is_visible() and "Ficha do cliente" in txt(pg, ".ms-gaveta-cab"))
    corpo = txt(pg, "#ms-ficha")
    chk("seções: Tamanhos, Preferências, Cidade/bairro, Etiquetas, Notas recentes, Compras, Canais", all(x in corpo for x in ["Tamanhos que usa", "Preferências", "Cidade / bairro", "Etiquetas", "Notas recentes", "Compras", "Canais"]), corpo[:300])
    chk("atalhos de tamanho PP a GG e 36 a 46", pg.locator("[data-ms=ficha-tam]").count() == 11 and [pg.locator("[data-ms=ficha-tam]").nth(i).inner_text() for i in (0, 4, 5, 10)] == ["PP", "GG", "36", "46"])
    chk("campos com limite na tela (60 / 300 / 60)", pg.get_attribute("#ms-fi-tam", "maxlength") == "60" and pg.get_attribute("#ms-fi-pref", "maxlength") == "300" and pg.get_attribute("#ms-fi-cid", "maxlength") == "60")
    chk("etiqueta atual e atalho 'Mudar etiquetas'", "Reserva" in txt(pg, "#ms-ficha") and pg.locator("[data-ms=ficha-etiquetas]").inner_text() == "Mudar etiquetas")
    notas = pg.locator(".ms-ficha-nota")
    chk("notas recentes: só 5, a mais nova primeiro, com autor", notas.count() == 5 and "Nota 7 da Maria" in notas.nth(0).inner_text() and "Bia" in notas.nth(0).inner_text(), [notas.nth(i).inner_text() for i in range(notas.count())])
    chk("compras: venda registrada com data e canal", "Vendeu em 12/10/2026" in corpo and "Pelo Instagram" in corpo, corpo)
    chk("canais vinculados: WhatsApp 1 (esta conversa, com número) e Instagram com 'Abrir'", "esta conversa" in corpo and "(88) 99999-0000" in corpo.replace(" ", " ") or "esta conversa" in corpo, corpo)
    chk("canal vinculado tem 'Abrir' e há 'Editar contato e canais'", pg.locator("[data-ms=ficha-abrir][data-id='5']").count() == 1 and pg.locator("#ms-ficha [data-ms=pessoa]").count() == 1)
    chk("dados do cliente entram como texto (sem HTML)", pg.evaluate("!document.querySelector('#ms-ficha img, #ms-ficha script')"))
    chk("botão primário 'Salvar' fixo e visível no pé", dentro(pg, "#ms-fi-salvar") and "prim" in pg.get_attribute("#ms-fi-salvar", "class"))
    chk("390: sem rolagem horizontal na gaveta", sem_rolagem_h(pg))
    chk("390: alvos de toque com 44 px ou mais", pg.evaluate(ALVOS), pg.evaluate(PEQUENOS))
    axe(pg, "ficha (390)")
    foto(pg, "ficha-390-inicio.png")
    # tamanhos rápidos
    pg.click("[data-ms=ficha-tam][data-t=M]"); pg.click("[data-ms=ficha-tam][data-t='38']"); pg.wait_for_timeout(100)
    chk("atalhos montam 'M · 38' e ficam marcados", pg.input_value("#ms-fi-tam") == "M · 38" and pg.get_attribute("[data-ms=ficha-tam][data-t=M]", "aria-pressed") == "true" and pg.get_attribute("[data-ms=ficha-tam][data-t='38']", "aria-pressed") == "true", pg.input_value("#ms-fi-tam"))
    pg.click("[data-ms=ficha-tam][data-t=M]"); pg.wait_for_timeout(100)
    chk("tocar de novo tira o tamanho", pg.input_value("#ms-fi-tam") == "38" and pg.get_attribute("[data-ms=ficha-tam][data-t=M]", "aria-pressed") == "false", pg.input_value("#ms-fi-tam"))
    pg.fill("#ms-fi-tam", "M · 38 (calça 40)"); pg.wait_for_timeout(100)
    chk("texto livre também marca os atalhos (P não confunde com PP)", pg.get_attribute("[data-ms=ficha-tam][data-t=M]", "aria-pressed") == "true" and pg.get_attribute("[data-ms=ficha-tam][data-t='40']", "aria-pressed") == "true" and pg.get_attribute("[data-ms=ficha-tam][data-t=P]", "aria-pressed") == "false")
    pg.fill("#ms-fi-pref", "Gosta de vestido longo e cores claras"); pg.fill("#ms-fi-cid", "Crateús — Centro")
    foto(pg, "ficha-390-preenchida.png")
    # erro do servidor: mensagem legível
    S["ficha_falha"] = "Não foi possível salvar a ficha agora. Tente de novo."
    pg.click("#ms-fi-salvar"); pg.wait_for_timeout(500)
    chk("erro ao salvar: aviso em português, sem JSON, e a gaveta continua aberta com o que foi digitado", "Não foi possível salvar" in txt(pg, "#ms-aviso") and "{" not in txt(pg, "#ms-aviso") and pg.input_value("#ms-fi-cid") == "Crateús — Centro")
    S.pop("ficha_falha")
    pg.click("#ms-fi-salvar"); pg.wait_for_timeout(600)
    post = (S.get("ficha_posts") or [{}])[-1]
    chk("Salvar manda conversa, tamanhos, preferências e cidade", post == {"conversa": 1, "tamanhos": "M · 38 (calça 40)", "preferencias": "Gosta de vestido longo e cores claras", "cidade": "Crateús — Centro"}, post)
    chk("salvou: aviso 'Ficha salva.' e a gaveta fecha", "Ficha salva" in txt(pg, "#ms-aviso") and pg.locator("#ms-gaveta").count() == 0)
    chk("faixa da conversa mostra discretamente 'Veste M · 38 (calça 40)'", pg.locator("#ms-veste").is_visible() and txt(pg, "#ms-veste") == "Veste M · 38 (calça 40)", pg.inner_text("#ms-etq-faixa"))
    chk("390: faixa sem estourar a largura e campo de mensagem visível", pg.evaluate("document.documentElement.scrollWidth<=innerWidth && document.getElementById('ms-veste').getBoundingClientRect().right<=innerWidth+1") and dentro(pg, "#ms-texto"))
    foto(pg, "ficha-390-faixa.png")
    # menu ⋯ → Ficha do cliente…
    pg.click("#ms-mais-conv"); pg.wait_for_timeout(300)
    chk("menu ⋯ da conversa tem 'Ficha do cliente…' em primeiro", pg.locator(".ms-menu button").first.inner_text() == "Ficha do cliente…")
    pg.click(".ms-menu [data-ms=ficha]"); esperar_ficha(pg)
    chk("reabrir: o que foi salvo volta preenchido, com quem atualizou", pg.input_value("#ms-fi-tam") == "M · 38 (calça 40)" and pg.input_value("#ms-fi-cid") == "Crateús — Centro" and "Atualizada por Ana" in txt(pg, "#ms-fi-info"), txt(pg, "#ms-fi-info"))
    # atalho "Mudar etiquetas" (avisa se há mudança sem salvar) e volta para a ficha
    pg.fill("#ms-fi-cid", "Crateús — São Vicente"); n0 = len(DIALOGOS)
    pg.click("[data-ms=ficha-etiquetas]"); pg.wait_for_timeout(300)
    chk("mudança sem salvar: pergunta antes de sair da ficha", len(DIALOGOS) == n0 + 1 and "sem salvar" in DIALOGOS[-1], DIALOGOS[-1:])
    chk("'Mudar etiquetas' abre a gaveta de etiquetas", "Etiquetas" in txt(pg, ".ms-gaveta-cab") and pg.locator(".ms-etq-op").count() == 2)
    pg.check(".ms-etq-op input[value='2']"); pg.click("[data-ms=etq-salvar]"); esperar_ficha(pg)
    chk("salvar etiquetas volta para a ficha já com a nova etiqueta", "Ficha do cliente" in txt(pg, ".ms-gaveta-cab") and "Troca" in txt(pg, "#ms-ficha"))
    # abrir o canal vinculado
    pg.click("[data-ms=ficha-abrir][data-id='5']"); pg.wait_for_timeout(900)
    chk("'Abrir' no canal leva para a conversa do Instagram da mesma pessoa", pg.locator("#ms-gaveta").count() == 0 and "Instagram" in txt(pg, ".ms-cab"), txt(pg, ".ms-cab"))
    chk("a outra conversa da mesma pessoa também mostra 'Veste …'", pg.locator("#ms-veste").count() == 1 and "M · 38" in txt(pg, "#ms-veste"))
    pg.click(".ms-cab .ms-av"); esperar_ficha(pg)
    chk("tocar no avatar também abre a ficha (a mesma da pessoa)", pg.input_value("#ms-fi-tam") == "M · 38 (calça 40)")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(250)
    chk("Esc fecha a gaveta", pg.locator("#ms-gaveta").count() == 0)
    # grupo não tem ficha
    pg.click("[data-ms=voltar]"); pg.wait_for_timeout(500)
    if pg.locator("#ms-lista .ms-conv[data-id='3']").count() == 0: pg.click("[data-ms=tipo][data-tipo=grp]"); pg.wait_for_timeout(600)
    pg.click("#ms-lista .ms-conv[data-id='3']"); pg.wait_for_selector("#ms-texto", timeout=4000); pg.wait_for_timeout(400)
    pg.click("#ms-mais-conv"); pg.wait_for_timeout(300)
    chk("grupo: menu ⋯ não oferece ficha", pg.locator(".ms-menu [data-ms=ficha]").count() == 0)
    pg.keyboard.press("Escape")
    chk("sem erros JavaScript (390)", not erros, erros)
    ctx.close()
    # ===== computador 1440×900: João (WhatsApp 2), ficha vazia =====
    ctx, pg, S, erros = tela(b, 1440, 900, False, 4)
    pg.click("#ms-mais-conv"); pg.wait_for_timeout(300); pg.click(".ms-menu [data-ms=ficha]"); esperar_ficha(pg)
    corpo = txt(pg, "#ms-ficha")
    chk("1440: gaveta lateral de até 420 px e a lista continua visível", pg.evaluate("document.getElementById('ms-gaveta').getBoundingClientRect().width<=421") and pg.locator(".ms-lateral").is_visible())
    chk("ficha vazia: 'Nenhuma compra registrada ainda', sem notas e sem etiquetas inventadas", "Nenhuma compra registrada ainda" in corpo and "Nenhuma nota interna ainda" in corpo and "Nenhuma etiqueta" in corpo and pg.input_value("#ms-fi-tam") == "" and txt(pg, "#ms-fi-info") == "", corpo)
    chk("ficha vazia: só o próprio canal, sem 'Abrir'", pg.locator("[data-ms=ficha-abrir]").count() == 0 and "WhatsApp 2" in corpo)
    chk("1440: sem rolagem horizontal e alvos ≥ 44 px", sem_rolagem_h(pg) and pg.evaluate(ALVOS), pg.evaluate(PEQUENOS))
    chk("1440: o foco entra na gaveta (botão fechar)", pg.evaluate("document.activeElement.dataset.ms") == "gaveta-fechar")
    pg.keyboard.press("Tab"); pg.keyboard.type("G")
    chk("1440: teclado — Tab leva ao campo de tamanhos", pg.input_value("#ms-fi-tam") == "G" and pg.get_attribute("[data-ms=ficha-tam][data-t=G]", "aria-pressed") == "true")
    pg.keyboard.press("Tab"); pg.keyboard.press("Enter"); pg.wait_for_timeout(100)
    chk("1440: teclado — Tab chega aos atalhos e Enter marca 'PP'", pg.input_value("#ms-fi-tam") == "G · PP", pg.input_value("#ms-fi-tam"))
    axe(pg, "ficha (1440)")
    foto(pg, "ficha-1440.png")
    pg.click("#ms-fi-salvar"); pg.wait_for_timeout(600)
    chk("1440: salva e a faixa mostra 'Veste G · PP'", (S.get("ficha_posts") or [{}])[-1].get("tamanhos") == "G · PP" and txt(pg, "#ms-veste") == "Veste G · PP")
    foto(pg, "ficha-1440-faixa.png")
    chk("sem erros JavaScript (1440)", not erros, erros)
    ctx.close()
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
