import sys, os
AQUI=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,AQUI)
from mock import *
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://localhost:8765/')
with sync_playwright() as p:
    b=p.chromium.launch(args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='block')
    st=install(ctx,versao='4.25'); ctx.add_init_script(SESSION)
    page=ctx.new_page(); page.set_default_timeout(5000); erros=[]; page.on('pageerror',lambda e:erros.append(str(e)))
    page.goto(BASE+'admin.html'); page.wait_for_timeout(2200)
    if not page.locator('#details-ferramentas[open]').count(): page.locator('#details-ferramentas > summary').click()
    page.locator('#btn-abrir-auditoria').click(); page.locator('.auditoria-item').first.wait_for()
    assert 'sessao=tk2.x.y' in st['historico_url'] and 'whatsapp=88999999999' in st['historico_url'], st['historico_url']
    assert page.locator('.auditoria-item').count()==3
    page.locator('#aud-data-de').fill('2026-10-21'); page.locator('#aud-data-de').dispatch_event('change')
    page.locator('#aud-data-ate').fill('2026-10-21'); page.locator('#aud-data-ate').dispatch_event('change')
    assert page.locator('.auditoria-item').count()==1 and 'Beto Gestor' in page.locator('.auditoria-item').inner_text()
    page.locator('#aud-limpar').click()
    page.locator('#aud-usuarios > summary').click()
    page.locator('.aud-usuario[value="Beto Gestor"]').uncheck()
    assert page.locator('.auditoria-item').count()==2
    assert page.locator('#aud-usuarios-resumo').inner_text() == '1 de 2'
    page.locator('.aud-usuario[value="Beto Gestor"]').check()
    page.locator('#busca-auditoria').fill('arquivou')
    assert page.locator('.auditoria-item').count()==1 and 'TK-0003' in page.locator('.auditoria-item').inner_text()
    assert not erros, erros
    b.close()
print('auditoria_filtros: OK')
