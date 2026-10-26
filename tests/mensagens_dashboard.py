"""Mensagens (caixa estilo WhatsApp): lista, conversa, responder, não lidas, falta responder, ao vivo sem atrapalhar, exportar, painel. Serviços simulados (mock_msg.py)."""
import sys, os, json, time
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
os.makedirs(os.path.join(AQUI, 'saida'), exist_ok=True)
from mock import *
import mock_msg
from playwright.sync_api import sync_playwright
AXE = open(os.path.join(AQUI, 'axe.min.js')).read()
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
def axe(pg, label):
    pg.evaluate(AXE)
    r = pg.evaluate("async()=>{const r=await axe.run(document.getElementById('overlay-mensagens'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']}});return r.violations.map(v=>({id:v.id,impact:v.impact,n:v.nodes.length,ex:v.nodes.slice(0,2).map(x=>x.target.join(' '))}))}")
    chk("axe — " + label, not r, "; ".join("%s×%d %s" % (v['id'], v['n'], v['ex']) for v in r))
DIALOGOS = []
def dialogo(d):
    DIALOGOS.append((d.type, d.message)); d.accept()
POLL = "window.TK_CONEXOES_POLL_MS=250;window.TK_MENSAGENS_POLL_MS=400;"

def pagina(ctx, erros):
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.on("dialog", dialogo)
    return pg
def abrir_ferramentas(pg):
    if pg.locator("#details-ferramentas[open]").count() == 0:
        pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250)
def abrir(pg):
    abrir_ferramentas(pg)
    pg.click("#btn-abrir-mensagens"); pg.wait_for_selector(".ms-conv", timeout=6000)
def novo_contexto(b, perms=PERMS_ALL, mobile=True):
    if mobile: ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    else: ctx = b.new_context(viewport={"width": 1440, "height": 900}, service_workers="block")
    ctx.add_init_script(SESSION); ctx.add_init_script(POLL)
    st = install(ctx, perms=perms, versao="3.4")
    return ctx, st
def nova_msg(S, cid, direcao, texto, status=""):
    S["seq"] += 1
    mm = {"id": S["seq"], "conversa_id": cid, "direcao": direcao, "tipo": "texto", "texto": texto, "enviada_em": mock_msg.agora(), "status": status, "por": "", "status_em": mock_msg.agora()}
    S["msgs"].append(mm)
    c = next(x for x in S["convs"] if x["id"] == cid)
    c.update({"ult_dir": direcao, "previa": texto, "ultima_em": mm["enviada_em"], "atualizada_em": mm["enviada_em"], "total": c["total"] + 1})
    if direcao == "entrada": c["nao_lidas"] += 1; c["ult_entrada_em"] = mm["enviada_em"]
    return mm

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    # ================= celular =================
    ctx, st = novo_contexto(b); S = None
    erros = []
    pg = pagina(ctx, erros)
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    abrir(pg); S = st["ig"]["msg"]
    chk("abre com as 3 abas e a contagem de conversas", pg.locator(".ms-aba").count() == 3 and "3 conversas" in pg.inner_text("[data-canal=whatsapp1]"), pg.inner_text("#ms-abas"))
    chk("aba mostra quantas conversas têm não lidas (selo com 1)", pg.locator("[data-canal=whatsapp1] .ms-pt").inner_text() == "1")
    chk("falta ativar envios/leituras: aviso curto numa linha com botão (sem caixa grande)", pg.locator(".ms-estado").count() == 1 and pg.locator(".ms-caixa").count() == 0 and "Falta ativar" in pg.inner_text(".ms-estado") and pg.locator(".ms-estado [data-ms=ligar]").count() == 1, pg.inner_text("#ms-estado-wrap"))
    pg.click(".ms-estado [data-ms=ligar]"); pg.wait_for_timeout(900)
    chk("depois de ativar: 'Gravando desde' numa linha e o servidor recebeu o pedido do WhatsApp 1", "Gravando desde" in pg.inner_text(".ms-estado") and S["ligar"] == [1] and any(d[0] == "confirm" and "enviadas pelo celular" in d[1] for d in DIALOGOS), (pg.inner_text("#ms-estado-wrap"), S["ligar"]))
    chk("lista: nome, prévia como TEXTO (HTML não executa) e 'Falta responder · há'", "Maria" in pg.inner_text("#ms-lista") and "<b>x</b>" in pg.inner_text("#ms-lista") and pg.locator("#ms-lista b").count() == 0 and "Falta responder" in pg.inner_text("#ms-lista"), pg.inner_text("#ms-lista"))
    chk("conversa com não lidas: selo com 2 e nome em destaque", pg.locator(".ms-conv.nova .ms-badge").first.inner_text() == "2")
    chk("conversa onde a loja respondeu mostra 'Você:' e tique azul de lida", "Você:" in pg.inner_text("#ms-lista") and pg.locator("#ms-lista .ms-tique.lida").count() == 1)
    chk("o número formatado aparece quando não há nome", "(88) 98888-7777" in pg.inner_text("#ms-lista"), pg.inner_text("#ms-lista"))
    chk("botão 'Mensagens' do painel mostra o total de conversas não lidas (3)", "(3)" in pg.inner_text("#btn-abrir-mensagens"), pg.inner_text("#btn-abrir-mensagens"))
    # filtros
    pg.click("[data-filtro=sem_resposta]"); pg.wait_for_timeout(500)
    chk("filtro 'Falta responder' mostra só quem espera (grupo fora)", pg.locator(".ms-conv").count() == 1 and "Maria" in pg.inner_text("#ms-lista"))
    pg.click("[data-filtro=nao_lidas]"); pg.wait_for_timeout(500)
    chk("filtro 'Não lidas'", pg.locator(".ms-conv").count() == 1)
    pg.click("[data-filtro=grupos]"); pg.wait_for_timeout(500)
    chk("filtro 'Grupos'", pg.locator(".ms-conv").count() == 1 and "Clientes TK" in pg.inner_text("#ms-lista"))
    pg.click("[data-filtro=todas]"); pg.wait_for_timeout(500)
    pg.fill("#ms-busca", "entregam"); pg.wait_for_timeout(800)
    chk("busca acha pelo texto de qualquer mensagem", pg.locator(".ms-conv").count() == 1)
    pg.fill("#ms-busca", ""); pg.wait_for_timeout(800)
    # abrir conversa
    pg.click("[data-ms=abrir][data-id='1']"); pg.wait_for_selector(".ms-bolha", timeout=5000); pg.wait_for_timeout(500)
    chk("no celular a conversa ocupa a tela (lista some)", pg.locator(".ms-lateral").is_hidden() and pg.locator(".ms-conversa").is_visible())
    chk("bolhas de entrada/saída, imagem como rótulo, tique de lida", pg.locator(".ms-bolha.entrada").count() == 3 and pg.locator(".ms-bolha.saida").count() == 1 and "📷 Foto" in pg.inner_text("#ms-fio") and pg.locator(".ms-bolha.saida .ms-tique.lida").count() == 1)
    chk("texto com HTML malicioso não executa", pg.evaluate("window.__xss") is None and pg.locator(".ms-bolha img").count() == 0)
    chk("separador de dia 'Hoje'", "Hoje" in pg.inner_text("#ms-fio"))
    chk("abrir marca como lida no servidor e tira o selo", (1, False) in S["lidas"] and S["convs"][0]["nao_lidas"] == 0)
    chk("campo de mensagem visível dentro da tela (390×844)", pg.evaluate("(()=>{const r=document.getElementById('ms-texto').getBoundingClientRect();return r.bottom<=innerHeight&&r.top>0&&r.height>=44})()"))
    chk("botão Enviar começa desligado", pg.locator("#ms-enviar").is_disabled())
    # enviar
    pg.fill("#ms-texto", "Entregamos hoje sim! 😊"); pg.wait_for_timeout(100)
    chk("Enviar liga ao digitar", pg.locator("#ms-enviar").is_enabled())
    pg.click("#ms-enviar"); pg.wait_for_timeout(700)
    chk("responder chama o servidor com a conversa, o texto e um idLocal", len(S["envios"]) == 1 and S["envios"][0]["conversa"] == 1 and S["envios"][0]["texto"] == "Entregamos hoje sim! 😊" and len(S["envios"][0]["idLocal"]) >= 16, S["envios"])
    chk("a mensagem aparece como enviada e o campo limpa", pg.locator(".ms-bolha.saida").count() == 2 and pg.input_value("#ms-texto") == "" and pg.locator("#ms-enviar").is_disabled())
    chk("não duplica depois do retorno ao vivo (espera o ciclo)", (pg.wait_for_timeout(1500) or True) and pg.locator(".ms-bolha.saida").count() == 2)
    # erro + tentar de novo
    S["envio"] = "erro"
    pg.fill("#ms-texto", "segunda"); pg.click("#ms-enviar"); pg.wait_for_timeout(700)
    chk("erro do servidor: bolha vermelha em português com 'Tentar de novo' (sem JSON cru)", pg.locator(".ms-bolha.falhou").count() == 1 and "recusou" in pg.inner_text(".ms-bolha.falhou") and "{" not in pg.inner_text(".ms-bolha.falhou"))
    S["envio"] = "ok"
    pg.click("[data-ms=reenviar]"); pg.wait_for_timeout(800)
    chk("tentar de novo envia uma vez e troca a bolha", pg.locator(".ms-bolha.falhou").count() == 0 and pg.locator(".ms-bolha.saida").count() == 3 and len([e for e in S["envios"] if e["texto"] == "segunda"]) == 2)
    S["envio"] = "incerto"
    pg.fill("#ms-texto", "talvez"); pg.click("#ms-enviar"); pg.wait_for_timeout(700)
    chk("resposta incerta mostra 'Sem confirmação' e pede conferir antes de reenviar", "Sem confirmação" in pg.inner_text("#ms-fio") and "antes de enviar de novo" in pg.inner_text("#ms-fio"))
    S["envio"] = "ok"
    # ao vivo sem atrapalhar: a pessoa está digitando e chega mensagem
    pg.fill("#ms-texto", "estou digitando isto"); pg.focus("#ms-texto")
    nova_msg(S, 1, "entrada", "Chegou agora do cliente"); pg.wait_for_timeout(1500)
    chk("mensagem nova aparece sozinha na conversa aberta", "Chegou agora do cliente" in pg.inner_text("#ms-fio"))
    chk("o que a pessoa digitava continua lá e o foco não saiu do campo", pg.input_value("#ms-texto") == "estou digitando isto" and pg.evaluate("document.activeElement.id") == "ms-texto")
    chk("conversa aberta chegando mensagem não fica com selo (já lida)", S["convs"][0]["nao_lidas"] == 0 and (1, False) in S["lidas"])
    # lendo mensagens antigas: nova chegada NÃO puxa a rolagem
    for i in range(40): nova_msg(S, 1, "entrada" if i % 2 else "saida", "mensagem antiga %d com texto para encher a tela" % i)
    pg.wait_for_timeout(1500)
    pg.evaluate("document.getElementById('ms-fio').scrollTop = 0"); pg.wait_for_timeout(300)
    nova_msg(S, 1, "entrada", "Esta chegou enquanto eu lia o começo"); pg.wait_for_timeout(1500)
    chk("lendo o começo: a tela não salta para o fim", pg.evaluate("document.getElementById('ms-fio').scrollTop") < 50, pg.evaluate("document.getElementById('ms-fio').scrollTop"))
    chk("aparece o aviso '↓ 1 nova mensagem'", pg.locator("#ms-nova").is_visible() and "1 nova mensagem" in pg.inner_text("#ms-nova"), pg.inner_text("#ms-nova"))
    pg.click("#ms-nova"); pg.wait_for_timeout(400)
    chk("tocar no aviso leva ao fim e some", pg.locator("#ms-nova").is_hidden() and pg.evaluate("(()=>{const f=document.getElementById('ms-fio');return f.scrollHeight-f.scrollTop-f.clientHeight<5})()"))
    # tique mudando ao vivo
    ult = [x for x in S["msgs"] if x["direcao"] == "saida" and x["conversa_id"] == 1][0]
    ult["status"] = "entregue"; ult["status_em"] = mock_msg.agora(); next(c for c in S["convs"] if c["id"] == 1)["atualizada_em"] = mock_msg.agora(); pg.wait_for_timeout(1500)
    chk("mudança de status chega ao vivo (sem recarregar)", pg.locator("#ms-fio .ms-tique[title=Entregue]").count() >= 1)
    # teclado virtual encolhe a altura útil: o campo continua visível
    pg.set_viewport_size({"width": 390, "height": 420}); pg.wait_for_timeout(400)
    chk("com o teclado aberto (altura 420) o campo de mensagem continua visível", pg.evaluate("(()=>{const r=document.getElementById('ms-texto').getBoundingClientRect();return r.bottom<=innerHeight+1&&r.top>=0})()"))
    pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(300)
    # voltar
    pg.click("[data-ms=voltar]"); pg.wait_for_timeout(600)
    chk("voltar mostra a lista de novo", pg.locator(".ms-lateral").is_visible() and pg.locator(".ms-conversa").is_hidden())
    pg.click("[data-ms=abrir][data-id='1']"); pg.wait_for_timeout(700)
    chk("ao reabrir o rascunho digitado continua", pg.input_value("#ms-texto") == "estou digitando isto", pg.input_value("#ms-texto"))
    pg.fill("#ms-texto", "")
    # exportar
    pg.click("#ms-mais-conv"); pg.wait_for_timeout(200)
    chk("menu da conversa oferece copiar para IA e exportar", "Copiar conversa para IA" in pg.inner_text(".ms-menu") and "Exportar esta conversa (TXT)" in pg.inner_text(".ms-menu"))
    with pg.expect_download() as dl:
        pg.click("text=Exportar esta conversa (CSV)")
    chk("exportar baixa o arquivo com o nome do servidor", dl.value.suggested_filename == "tenkiter-mensagens-teste.csv" and "formato=csv" in S["exportacoes"][-1] and "conversa=1" in S["exportacoes"][-1], S["exportacoes"])
    pg.wait_for_timeout(300)
    pg.click("[data-ms=voltar]"); pg.wait_for_timeout(500)
    pg.click("#ms-mais"); pg.wait_for_timeout(200)
    chk("menu geral: painel, exportar canal e tudo", all(t in pg.inner_text(".ms-menu") for t in ("Painel de atendimento", "Exportar este canal (CSV)", "Exportar tudo (JSON)")))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    chk("Esc fecha o menu e devolve o foco", pg.locator(".ms-menu").count() == 0)
    pg.click("#ms-mais"); pg.click("text=Painel de atendimento"); pg.wait_for_selector(".ms-painel .ms-card", timeout=4000)
    chk("painel de atendimento: aguardando, mediana e porcentagens", "esperando resposta agora" in pg.inner_text(".ms-painel") and "12 min" in pg.inner_text(".ms-painel") and "30%" in pg.inner_text(".ms-painel") and "Maria" in pg.inner_text(".ms-painel"), pg.inner_text(".ms-painel")[:300])
    nova_msg(S, 4, "entrada", "chegou com o painel aberto"); pg.wait_for_timeout(1500)
    chk("chegar mensagem com o painel aberto NÃO apaga o painel", pg.locator(".ms-painel .ms-card").count() == 6)
    axe(pg, "Mensagens (painel)")
    pg.click("[data-ms=fechar-painel]"); pg.wait_for_timeout(300)
    # canais
    pg.click("[data-canal=whatsapp2]"); pg.wait_for_timeout(700)
    chk("WhatsApp 2 sem gravação oferece ligar", "Ainda não está gravando" in pg.inner_text(".ms-caixa") and pg.locator("[data-ms=ligar]").count() == 1)
    pg.click("[data-ms=ligar]"); pg.wait_for_timeout(900)
    chk("pediu confirmação antes de ligar e avisa das enviadas pelo celular", any(d[0] == "confirm" and "enviadas pelo celular" in d[1] for d in DIALOGOS), DIALOGOS)
    chk("depois de ligar mostra gravando e a conversa do canal", "Gravando desde" in pg.inner_text(".ms-estado, .ms-caixa") and "João" in pg.inner_text("#ms-lista"))
    pg.click("[data-canal=instagram]"); pg.wait_for_timeout(700)
    chk("Instagram explica o que falta, sem jargão cru", "Ainda não ligado" in pg.inner_text(".ms-caixa") and "{" not in pg.inner_text(".ms-caixa"))
    S["ig_pronto"] = True; pg.click("#ms-mais"); pg.click("text=Atualizar agora"); pg.wait_for_timeout(900); pg.click("[data-ms=conexao]"); pg.wait_for_timeout(900)
    chk("Instagram pronto: endereço do webhook e situação", "wh/instagram" in pg.locator(".ms-copia").input_value() and "NÃO assinada" in pg.inner_text("#ms-diag"), pg.inner_text("#ms-diag"))
    axe(pg, "Mensagens (lista)")
    # fechar: para de consultar
    pg.click("#ms-fechar"); pg.wait_for_timeout(1200)
    n0 = S["calls"].count("/msg/novidades"); pg.wait_for_timeout(1500)
    chk("com a tela fechada não consulta novidades (só o selo leve)", S["calls"].count("/msg/novidades") == n0)
    chk("sem erros JavaScript (celular)", not erros, erros)
    ctx.close()

    # ================= computador =================
    ctx, st = novo_contexto(b, mobile=False); erros2 = []
    pg = pagina(ctx, erros2); pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    abrir(pg); S = st["ig"]["msg"]
    chk("computador: lista e conversa lado a lado", pg.locator(".ms-lateral").is_visible() and pg.locator(".ms-conversa").is_visible() and "Escolha uma conversa" in pg.inner_text(".ms-conversa"))
    pg.click("[data-ms=abrir][data-id='2']"); pg.wait_for_selector(".ms-bolha", timeout=4000); pg.wait_for_timeout(400)
    chk("abre a conversa e a lista continua à esquerda", pg.locator(".ms-lateral").is_visible() and pg.locator("#ms-fio .ms-bolha").count() == 2)
    chk("link da conversa vira âncora segura (nova aba, noopener)", pg.locator("#ms-fio a.ms-link").count() == 1 and "noopener" in pg.get_attribute("#ms-fio a.ms-link", "rel") and pg.get_attribute("#ms-fio a.ms-link", "href") == "https://tenkitermodas.com.br/p/1")
    chk("foco vai direto para o campo de mensagem", pg.evaluate("document.activeElement.id") == "ms-texto")
    pg.keyboard.type("linha 1"); pg.keyboard.press("Shift+Enter"); pg.keyboard.type("linha 2"); pg.wait_for_timeout(150)
    chk("Shift+Enter quebra linha", pg.input_value("#ms-texto") == "linha 1\nlinha 2")
    pg.keyboard.press("Enter"); pg.wait_for_timeout(700)
    chk("Enter envia (computador)", len(S["envios"]) == 1 and S["envios"][0]["texto"] == "linha 1\nlinha 2" and S["envios"][0]["conversa"] == 2)
    chk("a lista da esquerda se atualiza sem recarregar (Você: linha 1)", "linha 1" in pg.inner_text("[data-ms=abrir][data-id='2']"))
    # mensagem chega em OUTRA conversa enquanto leio esta: lista atualiza, conversa não muda
    nova_msg(S, 1, "entrada", "Oi, ainda tem o vestido?"); pg.wait_for_timeout(1500)
    chk("chegou em outra conversa: sobe na lista com selo, a conversa aberta não muda", pg.locator("[data-ms=abrir][data-id='1'] .ms-badge").count() == 1 and pg.locator("#ms-fio .ms-bolha").count() == 3 and "Oi, ainda tem" not in pg.inner_text("#ms-fio"))
    chk("a conversa aberta continua marcada e a rolagem da lista intacta", pg.get_attribute("[data-ms=abrir][data-id='2']", "aria-current") == "true")
    chk("sem rolagem horizontal", pg.evaluate("document.documentElement.scrollWidth <= innerWidth"))
    axe(pg, "Mensagens (computador)")
    chk("sem erros JavaScript (computador)", not erros2, erros2)
    ctx.close()

    # ================= mídia e story (celular) =================
    ctx, st = novo_contexto(b); erros5 = []
    pg = pagina(ctx, erros5); pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    abrir(pg); S = st["ig"]["msg"]; S["ligado"]["whatsapp2"] = "2026-10-25T17:10:00.000Z"; S["v2"].append("whatsapp2")
    pg.click("[data-canal=whatsapp2]"); pg.wait_for_timeout(700)
    chk("lista mostra '📷 Foto' no lugar de [imagem]", "📷 Foto" in pg.inner_text("[data-ms=abrir][data-id='6']") and "[imagem]" not in pg.inner_text("[data-ms=abrir][data-id='6']"), pg.inner_text("[data-ms=abrir][data-id='6']"))
    pg.click("[data-ms=abrir][data-id='6']"); pg.wait_for_selector(".ms-bolha", timeout=4000); pg.wait_for_timeout(900)
    fio = pg.inner_text("#ms-fio")
    chk("resposta a story: mostra 'Respondeu ao seu story', a legenda e que é provável", "Respondeu ao seu story" in fio and "Conjunto Plus Size" in fio and "story provável" in fio, fio)
    chk("miniatura do story respondido (botão com nome acessível)", pg.locator(".ms-ctx-mini").count() == 1 and pg.get_attribute(".ms-ctx-mini", "aria-label") == "Ver o story respondido")
    chk("foto aparece na conversa (baixada com a sessão, endereço local)", pg.locator("#ms-fio img.ms-img").count() == 1 and pg.evaluate("document.querySelector('#ms-fio img.ms-img').src.startsWith('blob:')"), pg.evaluate("document.querySelector('#ms-fio img.ms-img').outerHTML"))
    chk("a foto vai com a legenda abaixo", "olha esta" in fio)
    chk("áudio e vídeo viram botões com a duração", "▶ Áudio · 0:12" in fio and "▶ Vídeo · 0:07" in fio, fio)
    chk("citação de uma mensagem anterior aparece (quem e o trecho)", "R$ 29,99 à vista" in fio and "Você" in fio)
    chk("mídia que não está disponível diz isso em vez de ficar em branco", "arquivo não disponível" in fio)
    chk("nenhum link público de mídia na tela (só baixada pela rota autenticada)", pg.evaluate("[...document.querySelectorAll('#ms-fio img,#ms-fio video,#ms-fio audio')].every(e=>!e.src||e.src.startsWith('blob:'))") and all(q.startswith("id=") for q in S["midia_baixada"]), S["midia_baixada"])
    pg.click(".ms-play >> text=Áudio"); pg.wait_for_selector("#ms-fio audio", timeout=3000)
    chk("tocar o áudio troca o botão pelo player", pg.locator("#ms-fio audio[controls]").count() == 1)
    pg.click("#ms-fio img.ms-img"); pg.wait_for_selector("#ms-luz img", timeout=2000)
    chk("tocar na foto abre ampliada com botão de fechar", pg.locator("#ms-luz .ms-luz-x").is_visible())
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    chk("Esc fecha a foto ampliada sem fechar as mensagens", pg.locator("#ms-luz").count() == 0 and pg.locator("#overlay-mensagens.aberto").count() == 1)
    pg.click(".ms-ctx-mini"); pg.wait_for_selector("#ms-luz img", timeout=2000); pg.click("#ms-luz", position={"x": 5, "y": 300}); pg.wait_for_timeout(200)
    chk("o story respondido abre ampliado e fecha tocando fora", pg.locator("#ms-luz").count() == 0)
    chk("sem rolagem horizontal com mídia (celular 390)", pg.evaluate("document.documentElement.scrollWidth <= innerWidth && document.getElementById('ms-fio').scrollWidth <= document.getElementById('ms-fio').clientWidth + 1"))
    chk("botões de anexar e gravar têm 44 px", pg.evaluate("['ms-anexar','ms-enviar'].every(i=>{const r=document.getElementById(i).getBoundingClientRect();return r.height>=43.5&&r.width>=43.5})"))
    PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc000000301010018dd8db00000000049454e44ae426082")
    pg.set_input_files("#ms-arquivo", {"name": "foto.txt", "mimeType": "text/plain", "buffer": b"nao"}); pg.wait_for_timeout(300)
    chk("arquivo que não é foto/vídeo/áudio é recusado em português", "Escolha uma foto" in pg.inner_text("#ms-aviso") and pg.locator("#ms-stage").is_hidden(), pg.inner_text("#ms-aviso"))
    pg.set_input_files("#ms-arquivo", {"name": "foto.png", "mimeType": "image/png", "buffer": PNG}); pg.wait_for_selector("#ms-stage img", timeout=3000)
    chk("anexo escolhido mostra prévia e libera o Enviar sem texto", pg.locator("#ms-stage").is_visible() and not pg.locator("#ms-enviar").is_disabled() and pg.get_attribute("#ms-stage button", "aria-label") == "Remover o anexo")
    pg.click("#ms-stage button"); pg.wait_for_timeout(200)
    chk("remover o anexo esconde a prévia e trava o Enviar", pg.locator("#ms-stage").is_hidden() and pg.locator("#ms-enviar").is_disabled())
    pg.set_input_files("#ms-arquivo", {"name": "foto.png", "mimeType": "image/png", "buffer": PNG}); pg.wait_for_selector("#ms-stage img", timeout=3000)
    pg.fill("#ms-texto", "Segue a foto"); pg.click("#ms-enviar"); pg.wait_for_timeout(1200)
    chk("enviar anexo: sobe o arquivo e manda com a legenda", S["anexos"] == ["imagem"] and S["envios"][-1].get("anexo", "").startswith("msg/") and S["envios"][-1]["texto"] == "Segue a foto", (S["anexos"], S["envios"][-1:]))
    chk("a foto enviada aparece na conversa e a prévia some", pg.locator("#ms-fio .ms-bolha.saida img.ms-img").count() == 1 and pg.locator("#ms-stage").is_hidden() and "Segue a foto" in pg.inner_text("#ms-fio"))
    chk("foto enviada usa a prévia local (não baixa de novo)", not any("id=" + str(S["seq"]) + "&" in q or q == "id=" + str(S["seq"]) for q in S["midia_baixada"]), S["midia_baixada"])
    axe(pg, "Mensagens (conversa com mídia)")
    chk("sem erros JavaScript (mídia)", not erros5, erros5)
    ctx.close()

    # ================= 320 px e quem não é Admin =================
    ctx, st = novo_contexto(b); ctx.close()
    ctx3 = b.new_context(viewport={"width": 320, "height": 640}, is_mobile=True, has_touch=True, service_workers="block"); ctx3.add_init_script(SESSION); ctx3.add_init_script(POLL); st3 = install(ctx3, perms=PERMS_ALL, versao="3.4")
    e3 = []; pg = pagina(ctx3, e3); pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600); abrir(pg)
    chk("320 px: sem rolagem horizontal na lista", pg.evaluate("document.getElementById('overlay-mensagens').scrollWidth <= 320 && document.documentElement.scrollWidth <= 320"))
    chk("320 px: alvos de toque com 44 px ou mais (abas, filtros, ⋯, ✕, conversas)", pg.evaluate("[...document.querySelectorAll('.ms-aba,.ms-chip,.ms-ico,.ms-conv')].every(e=>{const r=e.getBoundingClientRect();return r.height>=43.5&&r.width>=43.5})"))
    pg.click("[data-ms=abrir][data-id='1']"); pg.wait_for_selector(".ms-bolha"); pg.wait_for_timeout(300)
    chk("320 px: conversa sem rolagem horizontal e com campo visível", pg.evaluate("document.documentElement.scrollWidth <= 320") and pg.evaluate("document.getElementById('ms-texto').getBoundingClientRect().bottom <= innerHeight"))
    ctx3.close()
    ctx2, st2 = novo_contexto(b, perms=[x for x in PERMS_ALL if x != "gerir_acessos"])
    e4 = []; pg2 = pagina(ctx2, e4); pg2.goto(BASE + "admin.html"); pg2.wait_for_timeout(2600); abrir_ferramentas(pg2)
    chk("quem não é Admin total não vê o botão", not pg2.locator("#btn-abrir-mensagens").is_visible())
    chk("quem não é Admin não consulta o servidor de mensagens", "msg" not in st2["ig"] or not st2["ig"]["msg"]["calls"])
    b.close()
print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD)); sys.exit(1 if BAD else 0)
