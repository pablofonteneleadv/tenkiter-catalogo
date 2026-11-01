"""Sinais de foco/interação não coletam rascunhos e não somam tempo em segundo plano."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://localhost:8773/')
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox']);c=b.new_context();pg=c.new_page();pg.goto(BASE+'404.html')
 pg.set_content('<div id="overlay-mensagens" class="aberto"><button id="toque">Abrir</button><textarea id="ms-texto"></textarea></div>');pg.add_script_tag(url=BASE+'mensagens-presenca.js');pg.click('#toque')
 a=pg.evaluate('TKPresenca.sinal(4,true)');assert a['estado']=='lendo' and a['espiar'] and a['fonte'].startswith('web_')
 pg.fill('#ms-texto','RASCUNHO PRIVADO NÃO TRANSMITIDO');d=pg.evaluate('TKPresenca.sinal(4,false)');assert d['estado']=='redigindo' and d['seq']>a['seq'];assert 'RASCUNHO' not in str(d)
 idle=pg.evaluate("()=>{const n=Date.now;Date.now=()=>n()+121000;try{return TKPresenca.sinal(4,false);}finally{Date.now=n;}}")
 assert idle['estado']=='ausente'
 pg.evaluate("window.TKAndroid={telaMensagensVisivel:()=>false}");assert pg.evaluate('TKPresenca.sinal(4,false).estado')=='oculto'
 pg.evaluate("delete window.TKAndroid;document.querySelector('#overlay-mensagens').classList.remove('aberto')");assert pg.evaluate('TKPresenca.sinal(4,false).estado')=='oculto'
 b.close();print('OK: interação, redação sem conteúdo, inatividade, sequência e WebView oculta sem presença ativa.')
