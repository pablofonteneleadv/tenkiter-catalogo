"""Números reais COM FILTROS (v3.5): período por dias ou datas, horário opcional (vira a meia-noite), dias da semana, app/navegador, aparelho, de onde veio,
categoria e gênero; cartões de "instalaram o app" e "aviso ativo"; toque numa linha da tabela filtra; compatível com backend sem a bandeira.
O Apps Script é simulado (mock.py): nada toca na planilha."""
import sys, os
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
os.makedirs(os.path.join(AQUI, 'saida'), exist_ok=True)
from mock import *
from playwright.sync_api import sync_playwright
AXE = open(os.path.join(AQUI, 'axe.min.js')).read()
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
def axe(pg, label):
    pg.evaluate(AXE)
    r = pg.evaluate("async()=>{const r=await axe.run(document.querySelector('#overlay-gestao'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']}});return r.violations.map(v=>({id:v.id,impact:v.impact,n:v.nodes.length,ex:v.nodes.map(n=>n.target.join(' ')).slice(0,3)}))}")
    chk("axe — " + label, not r, "; ".join("%s×%d %s" % (v['id'], v['n'], v['ex'][:2]) for v in r))

def abrir_numeros(pg):
    if pg.locator("#details-ferramentas[open]").count() == 0:
        pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250)
    pg.click("#btn-abrir-metricas"); pg.wait_for_timeout(900)

def ultimos(log, n=1): return [x for x in log if x.get("action") == "metricas"][-n:]
def texto(pg): return pg.inner_text("#gestao-corpo")

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION)
    log = []
    st = install(ctx, log=log, versao="3.5")
    erros = []
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    print("== Abrir ==")
    abrir_numeros(pg)
    m = ultimos(log)[0]
    chk("primeiro pedido: só 30 dias, sem nenhum filtro", m.get("dias") == 30 and not any(k in m for k in ("horaDe", "horaAte", "diasSemana", "origem", "dispositivo", "fonte", "categoria", "genero", "de", "ate")), m)
    chk("filtros começam RECOLHIDOS (os números ficam à vista na primeira tela)", pg.locator("#mt-det").count() == 1 and pg.locator("#mt-det[open]").count() == 0 and pg.locator(".mt-card").first.is_visible())
    chk("o título dos filtros já mostra o resultado (visualizações e WhatsApp), mesmo recolhido", "120 visualizações" in pg.inner_text("#mt-det > summary") and "18 no WhatsApp" in pg.inner_text("#mt-det > summary"), pg.inner_text("#mt-det > summary"))
    pg.click("#mt-det > summary"); pg.wait_for_timeout(250)
    chk("tocar no título abre os filtros", pg.locator("#mt-det[open]").count() == 1)
    chk("horário começa DESLIGADO (é opcional)", not pg.is_checked("#mt-hora-on") and pg.locator("#mt-horas").is_hidden())
    chk("chip de 30 dias marcado", pg.get_attribute("[data-mt-dias='30']", "aria-pressed") == "true" and pg.get_attribute("[data-mt-dias='7']", "aria-pressed") == "false")
    t = texto(pg)
    chk("cartões: pessoas que entraram, visualizações, WhatsApp", "Pessoas que entraram" in t and "Visualizações de peças" in t and "Pedir no WhatsApp" in t)
    chk("seção Aparelhos e avisos com instalaram 4 e aviso ativo 7", "Aparelhos e avisos" in t and pg.locator(".mt-card:has-text('Instalaram o app') strong").inner_text() == "4" and pg.locator(".mt-card:has-text('Com aviso ativo') strong").inner_text() == "7", t[:400])
    chk("aviso ativo mostra quantos no app instalado", "3 no app instalado" in t)
    chk("sem a chave do OneSignal: não aparece o cartão do OneSignal, mas orienta onde guardar", "Recebem aviso (OneSignal)" not in t and "Conexões" in t)
    chk("funil, gráfico por dia, por horário, por dia da semana", all(x in t for x in ("Do acesso ao pedido", "Visualizações por dia", "Por horário do dia", "Por dia da semana")))
    chk("tabelas: como usaram, aparelho, de onde vieram", all(x in t for x in ("Como usaram", "Aparelho", "De onde vieram")) and "Direto (link sem origem" in t)
    chk("gráfico por horário tem 24 colunas e por dia da semana 7", pg.locator("[aria-label^='Gráfico de visualizações por hora'] .mt-col").count() == 24 and pg.locator("[aria-label^='Gráfico de visualizações por dia da semana'] .mt-col").count() == 7)
    chk("resumo diz 'últimos 30 dias'", "últimos 30 dias" in pg.inner_text(".mt-resumo"))
    chk("categorias e gêneros preenchem os filtros", pg.locator("#mt-categoria option").count() == 3 and pg.locator("#mt-genero option").count() == 3, pg.locator("#mt-categoria option").all_inner_texts())
    chk("nenhum filtro ativo: botão 'Limpar' desligado", pg.is_disabled("#mt-limpar") and pg.inner_text("#mt-nfiltros") == "")
    axe(pg, "números reais (padrão)")

    print("== Período ==")
    pg.click("[data-mt-dias='7']"); pg.wait_for_timeout(700)
    m = ultimos(log)[0]
    chk("7 dias: pede dias=7", m.get("dias") == 7 and "de" not in m, m)
    chk("gráfico por dia muda para 7 colunas", pg.locator("[aria-label^='Gráfico de visualizações por dia,'] .mt-col").count() == 7)
    chk("7 dias marcado, 30 não", pg.get_attribute("[data-mt-dias='7']", "aria-pressed") == "true" and pg.get_attribute("[data-mt-dias='30']", "aria-pressed") == "false")
    chk("conta 1 filtro ativo", "(1 ativo)" in pg.inner_text("#mt-nfiltros"), pg.inner_text("#mt-nfiltros"))
    chk("com 7 dias o resumo do título acompanha (30 visualizações no mock = 25%)", "visualizações" in pg.inner_text("#mt-sum-res"))
    pg.click("#mt-datas-btn"); pg.wait_for_timeout(700)
    m = ultimos(log)[0]
    chk("escolher datas: mostra os campos, já com 7 dias e pede de/ate", pg.locator("#mt-datas").is_visible() and bool(m.get("de")) and bool(m.get("ate")) and "dias" not in m, m)
    pg.fill("#mt-de", "2026-10-09"); pg.wait_for_timeout(700)
    antes_invalido = len([x for x in log if x.get("action") == "metricas"])
    pg.fill("#mt-ate", "2026-10-02"); pg.wait_for_timeout(700)
    chamadas_depois = len([x for x in log if x.get("action") == "metricas"])
    chk("data final antes da inicial: mensagem aparece e NÃO chama o servidor", pg.locator("#mt-erro-datas").is_visible() and "igual ou depois" in pg.inner_text("#mt-erro-datas") and chamadas_depois == antes_invalido, (antes_invalido, chamadas_depois))
    pg.fill("#mt-ate", "2026-10-11"); pg.wait_for_timeout(700)
    m = ultimos(log)[0]
    chk("datas certas: pede de=2026-10-09 até=2026-10-11 e a mensagem some", m.get("de") == "2026-10-09" and m.get("ate") == "2026-10-11" and pg.locator("#mt-erro-datas").is_hidden(), m)
    chk("resumo mostra o período por datas", "de 2026-10-09 a 2026-10-11" in pg.inner_text(".mt-resumo"))
    pg.fill("#mt-de", "2024-01-01"); pg.wait_for_timeout(600)
    chk("período maior que 1 ano: mensagem", "1 ano" in pg.inner_text("#mt-erro-datas"))
    pg.click("#mt-datas-btn"); pg.wait_for_timeout(600)
    m = ultimos(log)[0]
    chk("voltar dos 'datas' volta a pedir por dias", "de" not in m and "dias" in m and pg.locator("#mt-datas").is_hidden(), m)

    print("== Horário (opcional) ==")
    pg.click("[data-mt-dias='30']"); pg.wait_for_timeout(500)
    pg.check("#mt-hora-on"); pg.wait_for_timeout(700)
    m = ultimos(log)[0]
    chk("ligar o horário mostra as caixas e pede 9h–18h (padrão)", pg.locator("#mt-horas").is_visible() and m.get("horaDe") == 9 and m.get("horaAte") == 18, m)
    pg.select_option("#mt-hora-de", "22"); pg.select_option("#mt-hora-ate", "2"); pg.wait_for_timeout(800)
    m = ultimos(log)[0]
    chk("22h até 2h59 (vira a meia-noite): pede horaDe=22 horaAte=2", m.get("horaDe") == 22 and m.get("horaAte") == 2, m)
    chk("resumo mostra o horário", "das 22h às 2h59" in pg.inner_text(".mt-resumo"), pg.inner_text(".mt-resumo"))
    chk("nota explica a meia-noite", pg.locator("#mt-horas-nota").is_visible())
    pg.uncheck("#mt-hora-on"); pg.wait_for_timeout(700)
    m = ultimos(log)[0]
    chk("desligar o horário tira o filtro do pedido", "horaDe" not in m and "horaAte" not in m and pg.locator("#mt-horas").is_hidden(), m)

    print("== Dias da semana ==")
    pg.click("[data-mt-sem='6']"); pg.click("[data-mt-sem='0']"); pg.wait_for_timeout(800)
    m = ultimos(log)[0]
    chk("Sáb + Dom: pede diasSemana=[0,6] (uma busca só, juntou os toques)", m.get("diasSemana") == [0, 6], m)
    chk("chips marcados com aria-pressed", pg.get_attribute("[data-mt-sem='0']", "aria-pressed") == "true" and pg.get_attribute("[data-mt-sem='3']", "aria-pressed") == "false")
    for d in (1, 2, 3, 4, 5): pg.click("[data-mt-sem='%d']" % d)
    pg.wait_for_timeout(800)
    m = ultimos(log)[0]
    chk("marcar os 7 dias = sem filtro (não manda diasSemana)", "diasSemana" not in m, m)
    for d in range(7): pg.click("[data-mt-sem='%d']" % d)
    pg.wait_for_timeout(700)
    chk("desmarcar todos os dias volta ao normal", "diasSemana" not in ultimos(log)[0] and pg.inner_text("#mt-nfiltros") == "", pg.inner_text("#mt-nfiltros"))

    print("== Origem, aparelho, veio de, categoria, gênero ==")
    pg.select_option("#mt-origem", "app"); pg.wait_for_timeout(700)
    chk("origem=app", ultimos(log)[0].get("origem") == "app")
    pg.select_option("#mt-dispositivo", "ios"); pg.wait_for_timeout(700)
    chk("aparelho=ios junto com origem (combina)", ultimos(log)[0].get("origem") == "app" and ultimos(log)[0].get("dispositivo") == "ios", ultimos(log)[0])
    pg.select_option("#mt-categoria", "Blusas"); pg.wait_for_timeout(700)
    chk("categoria=Blusas", ultimos(log)[0].get("categoria") == "Blusas")
    pg.select_option("#mt-genero", "Infantil Menina"); pg.wait_for_timeout(700)
    chk("gênero=Infantil Menina", ultimos(log)[0].get("genero") == "Infantil Menina")
    chk("4 filtros ativos no contador", "(4 ativos)" in pg.inner_text("#mt-nfiltros"), pg.inner_text("#mt-nfiltros"))
    chk("resumo lista os filtros", all(x in pg.inner_text(".mt-resumo") for x in ("origem App instalado", "dispositivo", "categoria Blusas")), pg.inner_text(".mt-resumo"))
    chk("com filtro, os números mudam (mock: 25%)", pg.locator(".mt-card:has-text('Visualizações de peças') strong").inner_text() == "30")
    pg.click("#mt-limpar"); pg.wait_for_timeout(700)
    m = ultimos(log)[0]
    chk("Limpar filtros: volta ao pedido simples e zera os campos", m.get("dias") == 30 and not any(k in m for k in ("origem", "dispositivo", "categoria", "genero", "fonte")) and pg.input_value("#mt-origem") == "" and pg.input_value("#mt-categoria") == "", m)
    chk("Limpar filtros mantém as categorias na lista", pg.locator("#mt-categoria option").count() == 3)

    print("== Tocar numa linha filtra ==")
    pg.click("#mt-det > summary"); pg.wait_for_timeout(250)      # recolhe os filtros: a pessoa filtra tocando direto na tabela
    chk("(filtros recolhidos)", pg.locator("#mt-det[open]").count() == 0)
    pg.click("button.mt-link[data-v='instagram']"); pg.wait_for_timeout(800)
    chk("tocar em Instagram filtra por fonte=instagram e os filtros continuam recolhidos", ultimos(log)[0].get("fonte") == "instagram" and pg.input_value("#mt-fonte") == "instagram" and pg.locator("#mt-det[open]").count() == 0, ultimos(log)[0])
    chk("o título mostra '1 ativo' mesmo recolhido", "(1 ativo)" in pg.inner_text("#mt-nfiltros"), pg.inner_text("#mt-nfiltros"))
    pg.click("button.mt-link[data-v='instagram']"); pg.wait_for_timeout(700)
    chk("tocar de novo tira o filtro", "fonte" not in ultimos(log)[0])
    pg.click("button.mt-link[data-v='nao_informado']"); pg.wait_for_timeout(700)
    chk("'Não informado' também filtra", ultimos(log)[0].get("origem") == "nao_informado", ultimos(log)[0])
    pg.click("#mt-det > summary"); pg.wait_for_timeout(250)
    pg.click("#mt-limpar"); pg.wait_for_timeout(600)

    print("== Resposta atrasada não sobrescreve a mais nova ==")
    antes_rapido = len([x for x in log if x.get("action") == "metricas"])
    pg.click("[data-mt-dias='7']"); pg.click("[data-mt-dias='90']"); pg.wait_for_timeout(900)
    chk("o último toque vale (90 dias)", ultimos(log)[0].get("dias") == 90 and pg.get_attribute("[data-mt-dias='90']", "aria-pressed") == "true" and pg.locator("[aria-label^='Gráfico de visualizações por dia,'] .mt-col").count() == 90)
    chk("dois toques rápidos: no máximo duas buscas e só a última aparece", 1 <= len([x for x in log if x.get("action") == "metricas"]) - antes_rapido <= 2)
    chk("a resposta velha (7 dias) não fica na tela", pg.locator("[aria-label^='Gráfico de visualizações por dia,'] .mt-col").count() == 90)
    chk("a tela não fica 'carregando' para sempre", pg.locator("#mt-resultado.mt-carregando").count() == 0 and pg.get_attribute("#mt-resultado", "aria-busy") is None)

    print("== Estados ==")
    st["conex"]["onesignal"]["temChave"] = True
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    abrir_numeros(pg)
    t = texto(pg)
    chk("com a chave do OneSignal guardada: cartão 'Recebem aviso' 11 de 15 inscritos", pg.locator(".mt-card:has-text('Recebem aviso (OneSignal)') strong").inner_text() == "11" and "de 15 inscritos" in t, t[:300])
    st["sem_aparelhos"] = True
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    abrir_numeros(pg)
    chk("sem aparelhos registrados: diz que aparecem conforme voltam ao site", "Ainda nenhum aparelho se registrou" in texto(pg))
    st["sem_dados"] = True
    pg.click("#mt-det > summary"); pg.wait_for_timeout(250)
    pg.click("[data-mt-dias='7']"); pg.wait_for_timeout(700)
    chk("sem dados: frase amigável", "Nada neste recorte" in texto(pg) or "Os números aparecem" in texto(pg), texto(pg)[:200])
    st["sem_dados"] = False
    axe(pg, "números reais (sem aparelhos)")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    chk("Esc fecha a folha", pg.locator("#overlay-gestao.visivel, #overlay-gestao.aberto").count() == 0)
    chk("nenhum erro de JavaScript", not erros, erros)
    ctx.close()

    print("== Servidor 3.4 (sem as bandeiras novas): tela de sempre ==")
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION)
    log2 = []; install(ctx, log=log2, versao="3.4")
    erros2 = []; pg = ctx.new_page(); pg.on("pageerror", lambda e: erros2.append(str(e)))
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2400)
    abrir_numeros(pg)
    chk("sem metricasAvancadas: não aparece o bloco de filtros", pg.locator("#mt-det").count() == 0)
    chk("tela antiga continua (Últimos 7/30/90 dias)", "Últimos 7 dias" in texto(pg) and "Peças mais vistas" in texto(pg))
    pg.click("[data-mt-dias='7']"); pg.wait_for_timeout(700)
    chk("tela antiga: trocar período ainda funciona", ultimos(log2)[0].get("dias") == 7 and "horaDe" not in ultimos(log2)[0])
    chk("nenhum erro de JavaScript (3.4)", not erros2, erros2)
    ctx.close()
    b.close()

print("\nOK=%d FALHAS=%d %s" % (len(OK), len(BAD), BAD))
sys.exit(1 if BAD else 0)
