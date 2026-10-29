"""Tecido: posição visual, edição, cópia/desfazer e descrição persistível; API simulada."""
import os
from pathlib import Path
from mock import install,SESSION
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://localhost:8771/')
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox']);ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block');ctx.add_init_script(SESSION)
 st=install(ctx,versao='4.28');prod=st['produtos'][0];prod['Descricao']='Caimento leve.\nTecido: Alfaiataria';prod['Codigo']='TK-0778'
 pg=ctx.new_page();err=[];pg.on('pageerror',lambda e:err.append(str(e)));pg.on('dialog',lambda d:d.accept());pg.goto(BASE+'admin.html');pg.wait_for_function('typeof produtos!=="undefined" && produtos.length>0')
 pg.evaluate('(id)=>editarProduto(id)',prod['ID']);assert pg.input_value('#tecido')=='Alfaiataria';assert pg.input_value('#descricao')=='Caimento leve.'
 pg.fill('#tecido','Crepe Dior');pg.fill('#descricao','Descrição nova.')
 pg.evaluate('document.getElementById("form-produto").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))')
 pg.wait_for_function('envios.length>0');payload=pg.evaluate('envios[envios.length-1].dados');assert payload['descricao']=='Descrição nova.\nTecido: Crepe Dior',payload
 pg.evaluate('cancelarDuplicacao();abrirCadastro_()');assert pg.input_value('#tecido')==''
 pg.fill('#tecido','Linho');pg.evaluate('(id)=>usarPeca_(id)',prod['ID']);assert pg.input_value('#tecido')=='Alfaiataria'
 pg.evaluate('desfazerCopia()');assert pg.input_value('#tecido')=='Linho'
 pg.goto(BASE+'index.html');pg.wait_for_selector('#grid .tecido-card');row=pg.locator('#grid .codigo-tecido').filter(has_text='TK-0778');assert 'Alfaiataria' in row.inner_text() and 'TK-0778' in row.inner_text()
 assert not err,err
 ctx.close();b.close()
print('Tecido: edição/cópia/desfazer/reset, payload persistível e card aprovados.')
