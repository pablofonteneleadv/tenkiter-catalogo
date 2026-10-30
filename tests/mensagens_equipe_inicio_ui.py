"""v7.40.33 — Nova conversa e Equipe e atividade (itens retomados do #305).

Gavetas reais pelo menu Mais, APIs simuladas, sem enviar nada a cliente.
Confere: entradas no menu, aviso de que nada é enviado, validação do número,
troca de rótulo no Instagram, presença com quem está online, totais por pessoa
e a trilha de ações — em telas pequenas e grandes, com axe.
"""
import os
from pathlib import Path
from mock import install, SESSION, PERMS_ALL
import mock_msg
from playwright.sync_api import sync_playwright

BASE = os.environ.get('TK_BASE', 'http://localhost:8774/')
OUT = Path(os.environ.get('TK_EVID', '/tmp/equipe-inicio')); OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    for w, h in [(320, 700), (390, 844), (1440, 900)]:
        c = b.new_context(viewport={'width': w, 'height': h}, is_mobile=w < 600, has_touch=w < 600, service_workers='block')
        c.add_init_script(SESSION)
        c.add_init_script('window.TKAndroid={atualizar(){},permissoes(){}}')
        st = install(c, versao='4.28', perms=PERMS_ALL)
        st['ig'].setdefault('msg', mock_msg.novo_estado())
        pg = c.new_page(); errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(BASE + 'admin.html'); pg.wait_for_timeout(2300)
        pg.click('#details-ferramentas > summary'); pg.click('#btn-abrir-mensagens')
        pg.wait_for_selector('#ms-lista .ms-conv'); pg.wait_for_timeout(900)   # deixa a animação de abertura terminar

        # --- menu Mais traz as duas entradas novas ---
        pg.click('#ms-nav [data-ms=menu-geral]'); pg.wait_for_selector('.ms-mais-item')
        assert pg.locator('.ms-mais-item[data-ms=nova-conversa]').count() == 1, 'Menu Mais sem "Nova conversa"'
        assert pg.locator('.ms-mais-item[data-ms=equipe-atividade]').count() == 1, 'Menu Mais sem "Equipe e atividade"'
        nomes = pg.locator('.ms-mais-grupo:first-child .ms-mais-texto').all_inner_texts()
        assert nomes[:2] == ['Nova conversa', 'Equipe e atividade'], nomes

        # --- Nova conversa: nada é enviado, valida antes de abrir ---
        pg.click('.ms-mais-item[data-ms=nova-conversa]'); pg.wait_for_selector('#ms-nova-destino')
        assert 'nada agora' in pg.inner_text('.ms-gaveta-corpo'), 'Falta o aviso de que o cliente não recebe nada'
        assert pg.input_value('#ms-nova-canal') == 'whatsapp1'
        pg.fill('#ms-nova-destino', '123'); pg.click('[data-ms="nova-conversa-ir"]'); pg.wait_for_timeout(250)
        assert not st["ig"]["msg"].get('iniciadas'), 'Número incompleto não deveria abrir conversa'
        assert pg.locator('#ms-nova-destino').count() == 1, 'Gaveta deveria continuar aberta no erro'
        # Instagram troca o rótulo e explica por que não escreve primeiro.
        pg.select_option('#ms-nova-canal', 'instagram'); pg.wait_for_timeout(120)
        assert 'Instagram' in pg.inner_text('.ms-gaveta-corpo')
        assert 'não deixa escrever primeiro' in pg.inner_text('.ms-gaveta-corpo')
        assert pg.get_attribute('#ms-nova-destino', 'placeholder') == '@loja.cliente'
        pg.select_option('#ms-nova-canal', 'whatsapp1')
        pg.fill('#ms-nova-destino', '(88) 99123-4567')
        ax = pg.evaluate("document.documentElement.scrollWidth<=innerWidth"); assert ax, 'Rolagem horizontal em Nova conversa'
        pg.screenshot(path=str(OUT / f'nova-conversa-{w}-{h}.png'))
        pg.click('[data-ms="nova-conversa-ir"]'); pg.wait_for_timeout(700)
        assert st["ig"]["msg"].get('iniciadas'), 'Abrir conversa deveria chamar /msg/iniciar'
        assert st["ig"]["msg"]["iniciadas"][-1]["canal"] == 'whatsapp1'
        assert not [e for e in errors], errors

        # --- Equipe e atividade (recarrega: a conversa aberta troca a tela no celular) ---
        pg.goto(BASE + 'admin.html'); pg.wait_for_timeout(2300)
        pg.click('#details-ferramentas > summary'); pg.click('#btn-abrir-mensagens')
        pg.wait_for_selector('#ms-lista .ms-conv'); pg.wait_for_timeout(900)
        pg.click('#ms-nav [data-ms=menu-geral]'); pg.wait_for_selector('.ms-mais-item')
        pg.click('.ms-mais-item[data-ms=equipe-atividade]'); pg.wait_for_selector('#ms-eq-online')
        pg.wait_for_timeout(500)
        on = pg.inner_text('#ms-eq-online')
        assert 'Ana' in on and 'agora' in on, on
        assert 'Bruno' in on, on
        assert 'aberto' in on, on
        tot = pg.inner_text('#ms-eq-totais')
        assert '3 respostas' in tot and '1 encerramentos' in tot, tot
        hist = pg.inner_text('#ms-eq-hist')
        assert 'respondeu' in hist and 'Cliente simulado' in hist, hist
        assert 'sem responder' in hist, hist
        assert pg.locator('#ms-eq-online .ms-eq-linha.on').count() == 1, 'Só quem está online fica destacado'
        assert pg.locator('[data-ms="equipe-periodo"]').count() == 3
        assert pg.evaluate("document.documentElement.scrollWidth<=innerWidth"), 'Rolagem horizontal em Equipe'
        # Cada alvo com área de toque confortável e teclado alcançável.
        for sel in ['[data-ms="equipe-periodo"]', '.ms-eq-pessoa']:
            alvo = pg.locator(sel).first
            if alvo.count():
                caixa = alvo.bounding_box(); assert caixa['height'] >= 40, (sel, caixa)
        pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')))
        viol = pg.evaluate("async()=>{const r=await axe.run(document.querySelector('.ms-gaveta-painel'));return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id)}")
        assert not viol, (w, h, viol)
        pg.screenshot(path=str(OUT / f'equipe-{w}-{h}.png'))
        # Filtro por período recarrega sem sair da gaveta.
        pg.click('[data-ms="equipe-periodo"][data-dias="1"]'); pg.wait_for_timeout(400)
        assert pg.locator('#ms-eq-online').count() == 1
        assert not [e for e in errors], errors
        c.close()
    b.close()
print('Nova conversa e Equipe: menu, aviso de nada enviado, validação, presença, totais, trilha e axe aprovados.')
