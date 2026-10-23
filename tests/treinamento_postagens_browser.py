"""Teste ponta a ponta do treinamento isolado, sem conta real."""
from pathlib import Path
from playwright.sync_api import sync_playwright

def main():
    url=Path("treinamento-postagens-real.html").resolve().as_uri()
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True)
        page=browser.new_page(viewport={"width":390,"height":844},accept_downloads=True)
        requests=[]
        page.on("request",lambda request: requests.append(request.url) if request.url.startswith("http") else None)
        errors=[]
        page.on("pageerror",lambda error: errors.append(str(error)))
        page.goto(url)
        page.locator("#instrucao").get_by_text("1. Toque em Com peça").wait_for()
        page.locator('[data-modo="livre"]').click()
        assert page.locator("#feedback").inner_text().strip()
        page.locator('[data-modo="peca"]').click()
        page.locator("#voltar-etapa").click()
        assert page.locator("#instrucao").inner_text().startswith("1.")
        page.locator('[data-modo="peca"]').click()
        page.locator('[data-destino="instagram"]').click()
        page.locator("#po-busca").fill("TREINO-001")
        page.locator('[data-psel="TREINO-001"]').click()
        page.locator('[data-a="usarpecas"]').click()
        page.locator('[data-tipo="story"]').click()
        page.locator('[data-m="0"]').click()
        page.locator("#po-legenda").fill("<b>Blusa fictícia</b> para treinamento")
        page.locator('[data-acao="legenda"]').click()
        page.locator('[data-quando="sequencia"]').click()
        page.locator("#voltar-etapa").click()
        assert page.locator("#instrucao").inner_text().startswith("7.")
        page.locator("#voltar-etapa").click()
        assert page.locator("#po-legenda").input_value()=="<b>Blusa fictícia</b> para treinamento"
        page.locator('[data-acao="legenda"]').click()
        page.locator('[data-quando="sequencia"]').click()
        page.locator("#revisado").check()
        assert page.locator("#legenda-revisao").inner_text()=="<b>Blusa fictícia</b> para treinamento"
        assert page.locator("#legenda-revisao b").count()==0
        page.locator('[data-acao="revisao"]').click()
        page.locator('[data-acao="conclusao"]').click()
        assert page.locator("#final").is_visible()
        assert "Correções: 1" in page.locator("#resumo").inner_text()
        assert "Nenhum envio realizado" in page.locator("#resumo").inner_text()
        with page.expect_download() as download:
            page.locator("#exportar").click()
        assert download.value.suggested_filename.endswith(".json")
        assert not requests,requests
        assert not errors,errors
        for largura in (320,360,390,430):
            page.set_viewport_size({"width":largura,"height":844})
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"),f"Rolagem horizontal indevida em {largura}px"
        page.once("dialog",lambda dialog: dialog.accept())
        page.locator("#refazer").click()
        assert page.locator("#final").is_hidden()
        assert page.locator("#contador").inner_text().startswith("0 de 9")
        assert page.locator("#instrucao").inner_text().startswith("1.")
        browser.close()
    print("Android 390px: nove passos, erro corrigido, exportação e isolamento OK")

if __name__=="__main__":
    main()
