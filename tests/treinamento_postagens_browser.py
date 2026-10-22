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
        page.locator('[data-destino="instagram"]').click()
        page.locator("#po-busca").fill("TREINO-001")
        page.locator('[data-psel="TREINO-001"]').click()
        page.locator('[data-a="usarpecas"]').click()
        page.locator('[data-tipo="story"]').click()
        page.locator('[data-m="0"]').click()
        page.locator("#po-legenda").fill("Uma blusa fictícia para treinamento")
        page.locator('[data-acao="legenda"]').click()
        page.locator('[data-quando="sequencia"]').click()
        page.locator("#revisado").check()
        page.locator('[data-acao="revisao"]').click()
        page.locator('[data-acao="conclusao"]').click()
        assert page.locator("#final").is_visible()
        assert "Correções: 1" in page.locator("#resumo").inner_text()
        with page.expect_download() as download:
            page.locator("#exportar").click()
        assert download.value.suggested_filename.endswith(".json")
        assert not requests,requests
        assert not errors,errors
        browser.close()
    print("Android 390px: nove passos, erro corrigido, exportação e isolamento OK")

if __name__=="__main__":
    main()
