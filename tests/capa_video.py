"""P-43: quadro de vídeo real como nova capa; APIs e envio simulados."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from mock import SESSION, install, criar_mp4

BASE = os.environ.get('TK_BASE', 'http://localhost:8770/')
saida = Path(__file__).parent / 'saida'
saida.mkdir(exist_ok=True)
arquivo = criar_mp4(str(saida / 'capa-video.mp4'), segundos=2)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
    ctx.add_init_script(SESSION)
    calls = []
    st = install(ctx, log=calls, versao='4.20')
    st['midia']['modo'] = 'ok'
    pg = ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(BASE + 'admin.html')
    pg.wait_for_function('typeof produtos !== "undefined" && produtos.length > 0')
    pg.evaluate('cancelarDuplicacao(); abrirCadastro_()')
    pg.set_input_files('#video-input', arquivo)
    pg.wait_for_function('videosItens.length === 1')
    pg.locator('.video-capa').click()
    pg.wait_for_function('!document.getElementById("capa-video-usar").disabled')
    pg.locator('#capa-video-previa').evaluate('v => v.play()')
    pg.wait_for_function('document.getElementById("capa-video-previa").currentTime > 0.1')
    pg.locator('#capa-video-tempo').evaluate('e => { e.value="1"; e.dispatchEvent(new Event("input", {bubbles:true})); }')
    pg.wait_for_function('!document.getElementById("capa-video-usar").disabled && document.getElementById("capa-video-previa").paused')
    pg.click('#capa-video-usar')
    pg.wait_for_function('fotosItens.length === 1 && fotosItens[0].capa')
    assert pg.evaluate('fotosItens[0].b64.length > 100 && fotosItens[0].prev.startsWith("data:image/jpeg")')
    assert pg.evaluate('videosItens.length === 1 && videosItens[0].file.name === "capa-video.mp4"')
    original = pg.evaluate('fotosItens[0].b64')
    pg.click('.video-capa')
    pg.wait_for_function('!document.getElementById("capa-video-usar").disabled')
    pg.click('#capa-video-fechar')
    assert pg.evaluate('fotosItens.length === 1 && fotosItens[0].b64') == original
    pg.click('.video-capa')
    pg.wait_for_function('!document.getElementById("capa-video-usar").disabled')
    pg.locator('#capa-video-tempo').evaluate('e => {e.value="0.25";e.dispatchEvent(new Event("input",{bubbles:true}));}')
    pg.wait_for_function('!document.getElementById("capa-video-usar").disabled')
    pg.click('#capa-video-usar')
    pg.wait_for_function('fotosItens.length === 2')
    assert pg.evaluate('fotosItens.filter(f=>f.capa).length === 1 && fotosItens[0].b64 !== fotosItens[1].b64')
    # Escape fecha sem alterar as duas fotos.
    pg.click('.video-capa')
    pg.keyboard.press('Escape')
    pg.wait_for_function('!document.getElementById("overlay-capa-video")')
    assert pg.evaluate('fotosItens.length') == 2
    # Limite cheio impede abrir; não elimina automaticamente nenhuma foto.
    pg.evaluate('window.__fotosCapa = fotosItens.slice(); while(fotosItens.length < MAX_GALERIA) fotosItens.push({url:"https://example.invalid/foto.jpg"})')
    pg.once('dialog', lambda d: d.accept())
    pg.click('.video-capa')
    assert pg.evaluate('fotosItens.length === MAX_GALERIA && !document.getElementById("overlay-capa-video")')
    pg.evaluate('fotosItens = window.__fotosCapa; desenharFotos()')
    # O quadro usa a fila normal de fotos, e os bytes do vídeo continuam preservados.
    pg.fill('#nome', 'Peça com capa de vídeo')
    pg.fill('#preco', '99.90')
    pg.fill('#estoque', '2')
    pg.click('#btn-abrir-categorias')
    pg.locator('#cat-lista .cat-item').filter(has_text='Vestido').first.click()
    pg.click('#cat-pronto')
    pg.click('#btn-salvar')
    try:
        pg.wait_for_function('envios.length && envios[envios.length-1].estado === "ok"', timeout=30000)
    except Exception:
        print(pg.evaluate('({envios:envios.map(e=>({estado:e.estado,msg:e.msg})),faltas:document.getElementById("cad-faltas")?.textContent})'))
        raise
    creates = [x for x in calls if x.get('action') == 'create']
    assert len(creates) == 1 and creates[0].get('fotoUrlExistente', '').startswith('https://tenkiter-midia.'), creates
    assert creates[0].get('videoUrlExistente', '').endswith('.mp4'), creates[0]
    assert not errors, errors
    print('P-43 PASS: reprodução, busca de quadro, JPEG, cancelamento, nova capa sem apagar fotos, vídeo preservado e cadastro confirmado.')
    b.close()
