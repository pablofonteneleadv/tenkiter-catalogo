"""Jornada móvel real do treinamento isolado, sem qualquer envio externo."""
from pathlib import Path
from playwright.sync_api import sync_playwright

def main():
    url=Path("treinamento-postagens-fase1.html").resolve().as_uri()
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True)
        for width in (360,390):
            page=browser.new_page(viewport={"width":width,"height":800},accept_downloads=True)
            requests=[];errors=[]
            page.on("request",lambda req: requests.append(req.url) if req.url.startswith("http") else None)
            page.on("pageerror",lambda err: errors.append(str(err)))
            page.goto(url)
            page.locator('[data-destino="instagram"]').click()
            page.locator('[data-destino="whatsapp"]').click()
            page.locator("#po-busca").fill("TREINO")
            page.locator('[data-psel="TREINO-001"]').click()
            page.locator('[data-psel="TREINO-002"]').click()
            page.locator('[data-a="usarjuntas"]').click()
            page.locator('[data-tipo="story"]').click()
            page.locator('[data-m="0"]').click()
            page.locator("#po-legenda").fill("Demonstração segura sem postagem real")
            page.locator('[data-quando="sequencia"]').click()
            page.locator("#revisar").click()
            assert page.locator("#revisao").is_visible()
            assert "Demonstração segura" in page.locator("#resumo").inner_text()
            page.locator("#confirmado").check()
            page.locator("#concluir").click()
            assert page.locator("#fila").is_visible()
            assert page.locator("#itens-fila .card").count()==2
            page.locator("#itens-fila .card").nth(0).get_by_text("Simular início").click()
            page.locator("#itens-fila .card").nth(0).get_by_text("Simular falha").click()
            page.locator("#itens-fila .card").nth(0).get_by_text("Tentar novamente").click()
            page.locator("#itens-fila .card").nth(0).get_by_text("Simular início").click()
            page.locator("#itens-fila .card").nth(0).get_by_text("Simular sucesso").click()
            page.locator("#itens-fila .card").nth(1).get_by_text("Simular início").click()
            page.locator("#itens-fila .card").nth(1).get_by_text("Simular sucesso").click()
            page.locator("#encerrar-fila").click()
            assert page.locator("#fim").is_visible()
            assert "Aprovada" in page.locator("#avaliacao-resultado").inner_text()
            with page.expect_download() as download: page.locator("#baixar-avaliacao").click()
            assert download.value.suggested_filename=="tenkiter-avaliacao-treino.json"
            assert not requests,requests
            assert not errors,errors
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"),"Rolagem horizontal indevida"
            page.close()
        browser.close()
    print("Jornada 360/390px: seleção, revisão, fila, falha, repetição, relatório e isolamento OK")

if __name__=="__main__": main()
