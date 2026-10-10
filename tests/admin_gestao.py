"""Painel do lojista v3.1 (admin-gestao.js): pedidos, números reais, exportar/importar planilha, códigos faltantes, lote (estoque/categoria/lista),
integrações (Pixel/CAPI/feed), avisos (modelos/segmento/histórico), texto de SEO sem IA — e o painel com o backend ANTIGO (3.0).
O Apps Script é simulado (mock.py): nada toca na planilha."""
import sys, json, re, os
from urllib.parse import unquote
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
os.makedirs(os.path.join(AQUI, 'saida'), exist_ok=True)
from mock import *
from playwright.sync_api import sync_playwright
BASE = os.environ.get("TK_BASE", "http://localhost:8765/")
OK = []; BAD = []
def chk(n, c, e=""):
    (OK if c else BAD).append(n); print(("  ✔ " if c else "  ✘ ") + n + ((" — " + str(e)) if (e and not c) else ""))
SITE = "https://tenkitermodas.com.br/"
RESP = {"prompt": ""}     # o que responder quando a página abre um prompt()
DIALOGOS = []

def ped(cod, nome, whats, status, entrega="retirada", total=100.0, obs="", endereco=""):
    return {"codigo": cod, "data": "10/10/2026 11:00", "atualizado": "10/10/2026 11:00", "status": status, "entrega": entrega, "total": total,
            "itens": [{"id": "1790000000003", "nome": "Blusa Floral", "codigo": "TK-0003", "preco": 50.0}, {"id": "1790000000004", "nome": "Calça Liso", "codigo": "TK-0004", "preco": 50.0}],
            "nome": nome, "whatsapp": whats, "endereco": endereco, "obs": obs, "nota": "", "origem": "site",
            "historico": [{"quando": "10/10/2026 11:00", "status": "novo", "por": "cliente"}]}

def dialogo(d):
    DIALOGOS.append((d.type, d.message, d.default_value))
    if d.type == "prompt": d.accept(RESP["prompt"])
    else: d.accept()

def pagina(ctx, erros):
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.on("dialog", dialogo)
    return pg

def abrir_ferramentas(pg):
    if pg.locator("#details-ferramentas[open]").count() == 0:
        pg.click("#details-ferramentas > summary"); pg.wait_for_timeout(250)

def folha_texto(pg): return pg.inner_text("#gestao-corpo")

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block", accept_downloads=True)
    ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE.rstrip("/"))
    ctx.add_init_script(SESSION)
    log = []
    st = install(ctx, log=log, sem_codigo=3, ia=False)
    st["pedidos"] += [ped("PED-0001", "Maria Souza", "88998765432", "novo", "entrega", 90.0, "Preciso até sexta", "Rua das Flores 100, Centro"),
                      ped("PED-0002", "João Lima", "88988887777", "concluido", "retirada", 150.0)]
    st["seq"] = 2
    erros = []
    pg = pagina(ctx, erros)
    print("== Painel com backend novo ==")
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    chk("lista de peças abre", pg.locator("#lista-produtos .produto").count() >= 10, pg.locator("#lista-produtos .produto").count())
    chk("cartão 'Pedidos' aparece com o backend novo", pg.locator("#card-pedidos").is_visible())
    chk("aviso de pedido novo aparece no topo", pg.locator("#aviso-pedidos-novos").is_visible() and "1 pedido novo" in pg.inner_text("#aviso-pedidos-novos"), pg.inner_text("#aviso-pedidos-novos"))
    chk("resumo do cartão conta os pedidos em aberto", "1 em aberto" in pg.inner_text("#ped-sum-txt"), pg.inner_text("#ped-sum-txt"))
    abrir_ferramentas(pg)
    chk("botões novos aparecem (números, importar, integrações)", all(pg.locator(i).is_visible() for i in ("#btn-abrir-metricas", "#btn-importar-csv", "#btn-abrir-integracoes")))

    print("== Códigos faltantes ==")
    chk("aviso de peças sem código (3)", pg.locator("#aviso-codigos").is_visible() and "3 peças" in pg.inner_text("#aviso-codigos"), pg.inner_text("#aviso-codigos"))
    log.clear()
    pg.click("#btn-gerar-codigos"); pg.wait_for_timeout(1500)
    chk("gerou os códigos no servidor", any(x.get("action") == "gerarCodigosFaltantes" for x in log))
    chk("janela mostra os 3 códigos gerados", pg.locator("#overlay-gestao.aberto").count() == 1 and "3 peça(s) ganharam código" in folha_texto(pg), folha_texto(pg)[:120])
    pg.click("#gestao-fechar"); pg.wait_for_timeout(300)
    chk("aviso some depois de gerar", pg.locator("#aviso-codigos").is_hidden())

    print("== Pedidos ==")
    pg.click("#aviso-pedidos-novos"); pg.wait_for_timeout(900)
    chk("tocar no aviso abre o cartão filtrado em 'Pedido recebido'", pg.locator("#card-pedidos[open]").count() == 1 and pg.locator("#ped-lista .ped-card").count() == 1)
    z = unquote(pg.get_attribute("#ped-lista .ped-zap", "href") or "")
    chk("'Avisar o cliente' usa o WhatsApp DO CLIENTE (com 55 + DDD)", z.startswith("https://wa.me/5588998765432?text="), z[:60])
    chk("mensagem ao cliente tem o código e o link COMPLETO de acompanhamento", "PED-0001" in z and (SITE + "?pedido=PED-0001") in z, z[-120:])
    chk("cartão mostra endereço, observação e itens", all(t in pg.inner_text("#ped-lista") for t in ("Rua das Flores", "Preciso até sexta", "TK-0003", "TK-0004")))
    log.clear()
    pg.click('[data-ped="PED-0001"][data-ped-etapa="pronto"]'); pg.wait_for_timeout(1200)
    at = [x for x in log if x.get("action") == "atualizarPedido"]
    chk("mudar etapa envia atualizarPedido", len(at) == 1 and at[0].get("status") == "pronto" and at[0].get("codigo") == "PED-0001", at)
    chk("etapa e credencial vão junto (pin/sessão do admin)", bool(at) and bool(at[0].get("pin")))
    pg.click('[data-pf="pronto"]'); pg.wait_for_timeout(300)
    z = unquote(pg.get_attribute("#ped-lista .ped-zap", "href") or "")
    chk("mensagem de 'pronto' em entrega diz 'saiu para entrega'", "saiu para entrega" in z, z[:200])
    chk("histórico do pedido registra a mudança", "Ana Lojista" in pg.inner_html("#ped-lista"))
    pg.fill("#nota-PED-0001", "separado na prateleira 2"); pg.click('[data-ped-nota="PED-0001"]'); pg.wait_for_timeout(700)
    chk("nota interna é salva", st["pedidos"][0]["nota"] == "separado na prateleira 2")
    pg.click('[data-ped="PED-0001"][data-ped-etapa="cancelado"]'); pg.wait_for_timeout(900)
    chk("cancelar pede confirmação", any(t == "confirm" and "Cancelar" in m for t, m, _ in DIALOGOS))
    chk("pedido cancelado", st["pedidos"][0]["status"] == "cancelado")
    pg.click('[data-pf="abertos"]'); pg.wait_for_timeout(300)
    chk("cancelado sai de 'Em aberto'", "Nenhum pedido" in pg.inner_text("#ped-lista"))
    pg.click('[data-pf="todos"]'); pg.wait_for_timeout(300)
    chk("'Todos' mostra os 2 pedidos", pg.locator("#ped-lista .ped-card").count() == 2)
    chk("aviso de pedido novo some (nenhum novo)", pg.locator("#aviso-pedidos-novos").is_hidden())

    print("== Números reais ==")
    log.clear()
    pg.click("#btn-abrir-metricas"); pg.wait_for_timeout(900)
    t = folha_texto(pg)
    chk("janela de números mostra visualizações, toques e pedidos", pg.locator("#overlay-gestao.aberto").count() == 1 and "120" in t and "18" in t and "Pedidos pelo site" in t, t[:200])
    chk("explica que toque no WhatsApp não é venda", "não é venda confirmada" in t)
    chk("gráfico por dia tem descrição para leitor de tela", pg.locator(".mt-grafico[role=img]").count() == 1 and "Gráfico de visualizações" in (pg.get_attribute(".mt-grafico", "aria-label") or ""))
    chk("tabela de peças mais vistas", "Vestido Floral" in t and "TK-0007" in t)
    pg.click('[data-mt-dias="7"]'); pg.wait_for_timeout(700)
    chk("trocar período pede 7 dias", any(x.get("action") == "metricas" and x.get("dias") == 7 for x in log))
    pg.click("#gestao-fechar"); pg.wait_for_timeout(300)

    print("== Exportar / importar planilha ==")
    with pg.expect_download() as dl:
        pg.click("#btn-exportar-csv")
    arq = os.path.join(AQUI, "saida", "export.csv"); dl.value.save_as(arq)
    csv = open(arq, encoding="utf-8", newline="").read()
    chk("exporta CSV com BOM e cabeçalho em português", csv.startswith("﻿codigo;id;nome;categoria;genero;preco;estoque"), csv[:60])
    chk("CSV tem as peças (com código)", "TK-0007" in csv and csv.count("\r\n") >= 20)
    chk("nome do arquivo tem a data", re.match(r"tenkiter-pecas-\d{4}-\d{2}-\d{2}\.csv", dl.value.suggested_filename) is not None, dl.value.suggested_filename)
    leit = pg.evaluate("TKGestao._lerCsv('codigo;nome\\r\\n\"A;B\";\"x \"\"y\"\"\"\\r\\n')")
    chk("leitor de CSV entende aspas e ponto-e-vírgula", leit == [["codigo", "nome"], ["A;B", 'x "y"']], leit)
    inj = pg.evaluate("TKGestao._linhasParaObjetos([['codigo','id'],['TK-0001','1,79E+12']])")
    chk("ID estragado pelo Excel (1,79E+12) é descartado — vale o código", "id" not in inj["objs"][0] and inj["objs"][0]["codigo"] == "TK-0001", inj)

    open(os.path.join(AQUI, "saida", "import.csv"), "w", encoding="utf-8").write(
        "codigo;nome;preco;foto_url\r\nTK-0007;;99,90;\r\nTK-0003;;abc;\r\n;Peça Nova Teste;59,90;https://res.cloudinary.com/z/image/upload/v1/n.jpg\r\n")
    log.clear()
    pg.click("#btn-importar-csv"); pg.wait_for_timeout(300)
    pg.set_input_files("#imp-arquivo", os.path.join(AQUI, "saida", "import.csv")); pg.wait_for_timeout(1200)
    prev = pg.inner_text("#imp-previa")
    chk("prévia: 1 atualizada, 1 nova, 1 ignorada", "Vão ser atualizadas" in prev and re.search(r"atualizadas\s*1", prev.replace("\n", " ")) is not None and re.search(r"novas\s*1", prev.replace("\n", " ")) is not None and re.search(r"problema\)\s*1", prev.replace("\n", " ")) is not None, prev[:300])
    chk("prévia mostra o motivo da linha ignorada", "Preço inválido" in prev)
    chk("prévia mostra o campo que vai mudar (preço)", "preço" in prev)
    imp = [x for x in log if x.get("action") == "importarProdutos"]
    chk("só SIMULOU: nada foi gravado antes de conferir", len(imp) == 1 and imp[0].get("simular") is True and not st["importados"], imp)
    pg.click("#imp-aplicar"); pg.wait_for_timeout(1500)
    chk("aplicar pede confirmação", any(t == "confirm" and "Gravar" in m for t, m, _ in DIALOGOS))
    chk("aplicar grava (simular=false)", any(x.get("action") == "importarProdutos" and x.get("simular") is False for x in log) and len(st["importados"]) == 1)
    chk("mensagem de pronto com o código da peça nova", "Pronto!" in folha_texto(pg) and "TK-07" in folha_texto(pg), folha_texto(pg)[:200])
    pg.click("#gestao-fechar"); pg.wait_for_timeout(300)
    open(os.path.join(AQUI, "saida", "ruim.csv"), "w", encoding="utf-8").write("foo;bar\r\n1;2\r\n")
    pg.click("#btn-importar-csv"); pg.wait_for_timeout(300)
    pg.set_input_files("#imp-arquivo", os.path.join(AQUI, "saida", "ruim.csv")); pg.wait_for_timeout(600)
    chk("arquivo sem colunas conhecidas: erro claro (sem JSON cru)", "Não reconheci as colunas" in pg.inner_text("#imp-previa") and "{" not in pg.inner_text("#imp-previa"), pg.inner_text("#imp-previa"))
    pg.click("#gestao-fechar"); pg.wait_for_timeout(300)

    print("== Lote: estoque, categoria, lista para o WhatsApp ==")
    pg.click("#btn-select-all"); pg.wait_for_timeout(300)
    chk("barra de lote aparece", pg.locator("#bulk-bar.ativa").count() == 1)
    chk("botões novos na barra (estoque, categoria, lista)", all(pg.locator(i).count() == 1 for i in ("#btn-bulk-estoque", "#btn-bulk-categoria", "#btn-bulk-lista")))
    log.clear(); RESP["prompt"] = "-3"
    pg.click("#btn-bulk-estoque"); pg.wait_for_timeout(500)
    chk("estoque negativo é recusado sem chamar o servidor", not [x for x in log if x.get("action") == "bulkUpdate"] and any("0 ou mais" in m for _, m, _ in DIALOGOS))
    RESP["prompt"] = "5"
    pg.click("#btn-bulk-estoque"); pg.wait_for_timeout(1500)
    bu = [x for x in log if x.get("action") == "bulkUpdate"]
    chk("estoque em lote enviado (alterarEstoque = 5)", len(bu) == 1 and bu[0].get("tipoAcao") == "alterarEstoque" and bu[0].get("valor") == 5 and len(bu[0].get("ids", [])) >= 10, bu[:1] and {k: bu[0][k] for k in ("tipoAcao", "valor")})
    chk("seleção é limpa depois do lote", pg.locator("#bulk-bar.ativa").count() == 0)
    pg.locator("#lista-produtos .produto-chk").nth(0).check(); pg.locator("#lista-produtos .produto-chk").nth(1).check(); pg.wait_for_timeout(200)
    RESP["prompt"] = "Fantasia"; log.clear()
    pg.click("#btn-bulk-categoria"); pg.wait_for_timeout(1500)
    bu = [x for x in log if x.get("action") == "bulkUpdate"]
    chk("categoria em lote enviada", len(bu) == 1 and bu[0].get("tipoAcao") == "alterarCategoria" and bu[0].get("valor") == "Fantasia" and len(bu[0].get("ids", [])) == 2, bu[:1])
    pg.locator("#lista-produtos .produto-chk").nth(0).check(); pg.wait_for_timeout(200)
    pg.click("#btn-bulk-lista"); pg.wait_for_timeout(600)
    lista = pg.evaluate("navigator.clipboard.readText()") if not any(t == "prompt" and "Copie" in m for t, m, _ in DIALOGOS) else next(d for t, m, d in DIALOGOS if t == "prompt" and "Copie" in m)
    chk("lista para o WhatsApp tem preço, à vista e LINK COMPLETO da peça", "à vista" in lista and (SITE + "p/TK-") in lista and "TENKiTER Modas" in lista, lista[:200])
    chk("lista não inventa parcelamento", "3x" not in lista and "juros" not in lista.lower())
    pg.click("#btn-cancelar-bulk"); pg.wait_for_timeout(200)

    print("== Integrações ==")
    log.clear()
    pg.click("#btn-abrir-integracoes"); pg.wait_for_timeout(900)
    api = pg.evaluate("API_URL")
    chk("janela de integrações abre", pg.locator("#overlay-gestao.aberto").count() == 1 and pg.locator("#int-pixel").count() == 1)
    chk("endereços do catálogo (CSV/XML/sitemap) saem do ENDEREÇO DO SCRIPT, não do site", pg.input_value("#int-feed-csv") == api + "?action=feed&formato=csv" and pg.input_value("#int-feed-xml") == api + "?action=feed&formato=xml" and pg.input_value("#int-sitemap").startswith(api))
    chk("campo do token é senha (type=password)", pg.get_attribute("#int-token", "type") == "password")
    pg.fill("#int-pixel", "1234567890123456"); pg.fill("#int-token", "EAAB-segredo-teste-123"); pg.fill("#int-sin", "bermuda=short")
    pg.fill("#int-seg", "Clientes Infantil, Clientes Feminino")
    pg.evaluate("localStorage.setItem(CONFIG_PUBLICA_CHAVE, '{\"x\":1}')")
    pg.click("#int-salvar"); pg.wait_for_timeout(900)
    sv = [x for x in log if x.get("action") == "salvarIntegracoes"]
    chk("salvou pixel, token, sinônimos e segmentos", len(sv) == 1 and sv[0].get("pixelId") == "1234567890123456" and sv[0].get("tokenCapi") == "EAAB-segredo-teste-123" and "bermuda" in sv[0].get("sinonimos", "") and "Infantil" in sv[0].get("segmentosPush", ""), sv)
    chk("campo do token esvazia depois de salvar", pg.input_value("#int-token") == "")
    chk("status mostra 'Token configurado' sem mostrar o token", "Token configurado" in pg.inner_text("#int-capi-status") and "EAAB" not in pg.content())
    chk("cache da configuração pública é descartado (Pixel passa a valer)", pg.evaluate("localStorage.getItem(CONFIG_PUBLICA_CHAVE)") is None)
    chk("token nunca vai para o aparelho (localStorage/sessionStorage)", "segredo-teste" not in pg.evaluate("JSON.stringify(localStorage)+JSON.stringify(sessionStorage)"))
    chk("mensagem de sucesso clara", "Salvo" in pg.inner_text("#int-msg") and "1234567890123456" in pg.inner_text("#int-msg"))
    pg.click("#gestao-fechar"); pg.wait_for_timeout(300)
    pg.click("#btn-abrir-integracoes"); pg.wait_for_timeout(900)
    chk("ao reabrir, o token NÃO volta (só o aviso 'deixe vazio')", pg.input_value("#int-token") == "" and "deixe vazio" in (pg.get_attribute("#int-token", "placeholder") or "") and "segredo-teste" not in pg.content())
    log.clear()
    pg.click("#int-limpar-token"); pg.wait_for_timeout(900)
    sv = [x for x in log if x.get("action") == "salvarIntegracoes"]
    chk("remover o token envia limparTokenCapi", len(sv) == 1 and sv[0].get("limparTokenCapi") is True and "tokenCapi" not in sv[0], sv)
    chk("status volta a 'Sem token'", "Sem token" in pg.inner_text("#int-capi-status"))
    pg.click("#gestao-fechar"); pg.wait_for_timeout(300)
    # o catálogo público passa a receber o Pixel (via ?action=config)
    pg2 = pagina(ctx, erros)
    pg2.add_init_script("window.__fb=[]")
    pg2.goto(BASE + "index.html"); pg2.wait_for_timeout(2200)
    chk("com Pixel configurado, o catálogo PEDE autorização antes de ligar", pg2.locator("#aviso-meta").count() == 1 and pg2.evaluate("typeof window.fbq") == "undefined", pg2.evaluate("typeof window.fbq"))
    pg2.click("#meta-sim"); pg2.wait_for_timeout(600)
    chk("depois de aceitar, o Pixel liga", pg2.evaluate("typeof window.fbq") == "function")
    pg2.close()

    print("== Avisos (push) ==")
    pg.click("#btn-abrir-push"); pg.wait_for_timeout(500)
    chk("4 modelos de aviso", pg.locator("#push-modelos [data-pm]").count() == 4)
    pg.click('#push-modelos [data-pm="0"]')
    chk("modelo preenche título e mensagem", "novidade" in pg.input_value("#push-titulo").lower() and len(pg.input_value("#push-mensagem")) > 10)
    chk("seletor de segmento aparece (há segmentos configurados)", pg.locator("#push-segmento-linha").is_visible())
    pg.select_option("#push-segmento", "Clientes Infantil")
    log.clear()
    pg.click("#btn-enviar-push"); pg.wait_for_timeout(900)
    chk("confirmação cita o segmento", any(t == "confirm" and "Clientes Infantil" in m for t, m, _ in DIALOGOS))
    chk("envio leva o segmento escolhido", st.get("ultimo_push", {}).get("segmento") == "Clientes Infantil", st.get("ultimo_push"))
    pg.click("#btn-push-historico"); pg.wait_for_timeout(800)
    chk("histórico mostra o aviso enviado, quem e para quem", "Chegou novidade" in folha_texto(pg) and "Ana Lojista" in folha_texto(pg) and "Clientes Infantil" in folha_texto(pg), folha_texto(pg)[:200])
    pg.click("#gestao-fechar"); pg.wait_for_timeout(300)

    print("== SEO sem IA ==")
    pg.click("#card-form > summary"); pg.wait_for_timeout(300)
    pg.fill("#nome", "Vestido Midi Floral")
    pg.click("#details-mais > summary"); pg.wait_for_timeout(200)
    pg.click("#btn-seo-ia"); pg.wait_for_timeout(900)
    box = pg.inner_text("#seo-sugestao-box")
    chk("sem IA: avisa que o texto foi montado sem IA", "gerado sem ia" in box.lower() and "gemini" in box.lower(), box[:200])
    chk("texto local cita Crateús e não inventa parcelamento", "Crateús" in box and "3x" not in box)

    chk("nenhum erro de JavaScript no painel", not erros, erros)
    ctx.close()

    # ---------------------------------------------------------------- backend ANTIGO
    print("== Painel com backend antigo (3.0) ==")
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(SESSION)
    log = []; install(ctx, log=log, versao="3.0")
    erros = []; pg = pagina(ctx, erros)
    pg.goto(BASE + "admin.html"); pg.wait_for_timeout(2600)
    chk("lista de peças funciona", pg.locator("#lista-produtos .produto").count() >= 10)
    abrir_ferramentas(pg)
    chk("recursos novos ficam escondidos (pedidos, números, importar, integrações)", all(pg.locator(i).is_hidden() for i in ("#card-pedidos", "#btn-abrir-metricas", "#btn-importar-csv", "#btn-abrir-integracoes")))
    chk("aviso de códigos faltantes não aparece", pg.locator("#aviso-codigos").is_hidden())
    chk("não pede pedidos ao servidor antigo", not [x for x in log if x.get("action") == "listarPedidos"])
    chk("lote por categoria não é oferecido (servidor antigo não faz)", pg.locator("#btn-bulk-categoria").count() == 0)
    chk("funções antigas seguem (auditoria, notificação, exportar planilha)", all(pg.locator(i).is_visible() for i in ("#btn-abrir-auditoria", "#btn-abrir-push", "#btn-exportar-csv")))
    pg.click("#btn-abrir-push"); pg.wait_for_timeout(400)
    chk("avisos: sem backend novo não mostra histórico/segmentos, mas os modelos funcionam", pg.locator("#push-extras").is_hidden() and pg.locator("#push-segmento-linha").is_hidden() and pg.locator("#push-modelos [data-pm]").count() == 4)
    chk("nenhum erro de JavaScript (painel antigo)", not erros, erros)
    ctx.close()
    b.close()
print("\nOK=%d FALHAS=%d" % (len(OK), len(BAD)), BAD)
sys.exit(1 if BAD else 0)
