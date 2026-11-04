"""Formulários reais da Esteira liberam antes do upload; nenhuma escrita externa."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
p=Path(__file__).with_name('esteira_fotos_ui.py');ns={'__file__':str(p),'__name__':'base'};exec(compile(p.read_text().split('\nwith sync_playwright() as p:')[0],str(p),'exec'),ns)
with sync_playwright() as pw:
 b=pw.chromium.launch(args=['--no-sandbox'])
 for w,h in [(390,844),(1440,900)]:
  c=b.new_context(viewport={'width':w,'height':h},service_workers='block');st=ns['instalar'](c);f=ns['fotos_srv'](c,st);st['fornecedores']=[{'id':1,'nome':'Fornecedor simulado','endereco':'','fone1':'','fone2':'','fone3':'','ativo':True,'pedidos':0}];pg=c.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(ns['BASE']+'esteira.html');pg.fill('#login-w','88999999999');pg.fill('#login-s','senha');pg.click('text=Entrar >> nth=-1');pg.wait_for_selector('.peca');pg.click('[data-aba=fotos]');pg.wait_for_selector('text=Enviar fotos para a caixa');pg.click('text=Enviar fotos para a caixa');pg.set_input_files('#cx-arq',[ns['foto_png']((200,90,80))]);pg.wait_for_selector('.cx-linha')
  held=[];c.route('**/u',lambda r:held.append(r));pg.click('#cx-enviar');pg.wait_for_selector('.folha',state='detached',timeout=2500);pg.wait_for_timeout(150);assert len(held)==1
  pg.click('[data-aba=pedidos]');pg.wait_for_selector('text=Novo pedido');pg.click('text=Novo pedido');pg.wait_for_selector('#ped-fornecedor');pg.select_option('#ped-fornecedor','1');pg.fill('#ped-obs','Texto de outro trabalho preservado')
  held.pop(0).fallback();pg.wait_for_function("document.querySelector('#esteira-processos-abrir').textContent==='Processos'");pg.wait_for_timeout(1900);assert pg.locator('#ped-obs').input_value()=='Texto de outro trabalho preservado'
  # The order attachment stays local until save; submitting leaves the editor while upload is held.
  pg.locator('#ped-editor input.arq-foto').set_input_files(ns['foto_png']((70,180,120)));pg.wait_for_selector('text=Foto preparada. Será enviada ao salvar.');assert not held
  pg.click('#ped-salvar');pg.wait_for_selector('#ped-editor',state='detached',timeout=2500);pg.wait_for_timeout(150);assert len(held)==1
  pg.click('[data-aba=prep]');pg.wait_for_selector('#prep-topo');held.pop(0).fallback();pg.wait_for_function("document.querySelector('#esteira-processos-abrir').textContent==='Processos'");assert pg.locator('#prep-topo').is_visible();assert len(st['salvos'])==1 and st['salvos'][0]['fotos'][0].startswith('https://')
  assert not errors,errors;c.close()
 b.close()
print('PASS envio real simulado mobile/desktop: modal e pedido liberam antes do upload, texto em outro trabalho preservado e fotos resolvidas antes de salvar no servidor.')
