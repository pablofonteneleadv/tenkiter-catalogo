"""Disponibilidade: fila durável, erro, retomada e isolamento; nenhum serviço real."""
import os, json
from pathlib import Path
from playwright.sync_api import sync_playwright
from mock import PNG
ROOT=Path(__file__).resolve().parent.parent
BASE=os.getenv('TK_BASE','http://localhost:8778/')
EVID=ROOT/'tests/evidencias_edicao';EVID.mkdir(exist_ok=True)
HTML='''<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Teste disponibilidade</title><link rel="stylesheet" href="/admin-disponibilidade.css"><script src="/admin-disponibilidade.js"></script><body><button id="abrir">Abrir disponibilidade</button><div id="aviso"></div></body></html>'''
BOOT='''() => {
window.f={conta:'5588999999999',pode:true,online:false,modo:'ok',calls:[],notices:[]};
Object.defineProperty(navigator,'onLine',{get:()=>f.online,configurable:true});
window.p={ID:'teste-123',Nome:'Conjunto 3 peças temático UV masculino infantil',Codigo:'TK-0786',Categoria:'Conjunto',Genero:'Infantil Menino',Preco:24.99,Estoque:3,Status:'Ativo',Foto_URL:'/tests/a.png',Fotos_Galeria:'/tests/b.png,/tests/c.png',Video_URL:'/tests/v.mp4',Videos:[],Tamanhos:'M, Etiqueta: M, Idade: 2 anos, Idade: 3 anos, Idade: 4 anos',Cores:'Azul, Floral',Descricao:'Tecido: Crepe Dior\\nLeve e confortável'};
window.api=TKDisponibilidade.criar({conta:()=>f.conta,pode:()=>f.pode,enviar:async op=>{f.calls.push(op);if(f.modo==='lento')return await new Promise(resolve=>f.resolver=resolve);if(f.modo==='erro')return {ok:false,erro:'Sem permissão.'};return {ok:true};},atualizar:()=>{api.atualizarAviso(document.getElementById('aviso'));},avisar:t=>f.notices.push(t)});
document.getElementById('aviso').replaceWith(api.aviso());document.querySelector('.tk-disp-pendente').id='aviso';
document.getElementById('abrir').onclick=()=>api.abrir(p);
}'''
def check(x,msg):
    assert x,msg
    print('✓ '+msg,flush=True)
def jobs(pg): return pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('tk_disponibilidade_v1:')).flatMap(k=>{try{return [JSON.parse(localStorage.getItem(k))];}catch(_){return [];}})")
def abrir(pg):pg.click('#abrir');pg.wait_for_selector('#ms-edicao-tamanhos')
def salvar(pg):pg.get_by_role('button',name='Salvar alterações').click()
with sync_playwright() as pw:
    browser=pw.chromium.launch(args=['--no-sandbox'])
    ctx=browser.new_context(viewport={'width':390,'height':844},service_workers='block')
    ctx.route('**/disponibilidade-fixture',lambda r:r.fulfill(body=HTML,content_type='text/html'))
    ctx.route('**/tests/*.png',lambda r:r.fulfill(body=PNG,content_type='image/png'))
    pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
    pg.goto(BASE+'disponibilidade-fixture');pg.evaluate(BOOT)
    abrir(pg)
    check(pg.get_by_role('button',name='Retirar M',exact=True).count()==1,'Etiqueta e tamanho antigo não duplicam o M')
    check(pg.get_by_role('button',name='Retirar G',exact=True).count()==0,'Não inventa opções não cadastradas')
    for width,height,scale in [(320,700,1),(390,844,1),(412,915,1),(1440,900,1),(390,470,1.3)]:
        pg.set_viewport_size({'width':width,'height':height});pg.locator('.tk-disp-painel').evaluate('(e,s)=>e.style.fontSize=(16*s)+"px"',scale)
        check(pg.locator('.tk-disp-painel').evaluate('(e)=>e.scrollWidth<=e.clientWidth'),'Sem excesso horizontal '+str(width))
        box=pg.get_by_role('button',name='Salvar alterações').bounding_box();check(box['y']+box['height']<=height,'Salvar alcançável '+str((width,height)))
        check(pg.locator('.tk-disp-fechar').bounding_box()['width']==44,'Fechar não estica '+str(width))
        pg.screenshot(path=str(EVID/f'disponibilidade-{width}-{height}.png'))
    pg.set_viewport_size({'width':390,'height':844});pg.locator('.tk-disp-painel').evaluate('e=>e.style.fontSize="16px"')
    pg.get_by_role('button',name='Retirar Idade: 2 anos',exact=True).click()
    pg.get_by_role('button',name='Retirar Floral',exact=True).click()
    pg.get_by_role('button',name='Retirar fotos 1',exact=True).click()
    salvar(pg)
    check(pg.locator('#ms-edicao-tamanhos').count()==0,'Salvar fecha imediatamente mesmo sem rede')
    check(len(jobs(pg))==1,'Alteração durável antes de liberar funcionário')
    check(pg.evaluate('f.calls.length')==0,'Nenhuma chamada offline')
    patch=jobs(pg)[0]['ops'][0]
    check(patch=={'action':'update','id':'teste-123','tamanhos':'M, Etiqueta: M, Idade: 3 anos, Idade: 4 anos','cores':'Azul'},'Retirada exata preserva metadados e não reenvia preço/nome/fotos')
    pg.reload();pg.evaluate(BOOT)
    check(len(jobs(pg))==1,'Fila sobrevive ao recarregamento')
    pg.evaluate("localStorage.setItem('tk_disponibilidade_v1:5588999999999:corrompido','{');f.conta='outro-usuario';f.online=true;window.dispatchEvent(new Event('online'))")
    pg.wait_for_timeout(200)
    check(pg.evaluate('f.calls.length')==0,'Outra conta não envia alteração do funcionário anterior')
    pg.evaluate("f.conta='5588999999999';f.modo='lento';window.dispatchEvent(new Event('online'))")
    pg.wait_for_function('f.calls.length===1')
    check(len(jobs(pg))==1,'Pedido lento mantém alteração guardada')
    pg.evaluate("f.modo='erro';f.resolver({ok:true})")
    pg.wait_for_function("Object.keys(localStorage).some(k=>{try{return JSON.parse(localStorage.getItem(k))?.indice===1&&JSON.parse(localStorage.getItem(k))?.erro;}catch(_){return false;}})")
    pg.get_by_role('button',name='Descartar registro inválido').click()
    check(jobs(pg)[0]['indice']==1,'Sucesso parcial registra progresso antes da próxima retirada')
    pg.screenshot(path=str(EVID/'disponibilidade-erro.png'))
    pg.evaluate("f.modo='ok'");pg.get_by_role('button',name='Tentar novamente').click()
    pg.wait_for_function("!Object.keys(localStorage).some(k=>k.startsWith('tk_disponibilidade_v1:'))")
    check(pg.evaluate("f.calls.filter(c=>c.action==='update').length")==1,'Retentativa não repete etapa já salva')
    check(pg.evaluate("f.calls.filter(c=>c.action==='arquivarMidia').length")==2,'Retenta somente mídia que falhou')
    pg.evaluate('api.projetar([p])');abrir(pg)
    pg.get_by_role('button',name='Retirar M',exact=True).click()
    salvar(pg);pg.wait_for_timeout(100)
    check('Etiqueta: M' not in pg.evaluate('p.Tamanhos'),'Retirar M tira também a etiqueta legada equivalente')
    pg.evaluate('f.online=false;p.Fotos_Galeria="";p.Foto_URL="/tests/a.png"');abrir(pg)
    pg.get_by_role('button',name='Retirar fotos 1',exact=True).click();salvar(pg)
    check(jobs(pg)[0]['ops']==[{'action':'arquivarRapido','id':'teste-123'}],'Última foto arquiva produto sem apagar arquivos')
    pg.evaluate("localStorage.clear();p.Status='Ativo'");abrir(pg)
    pg.get_by_role('button',name='× Arquivar produto inteiro',exact=True).click();pg.get_by_role('button',name='Cancelar',exact=True).click()
    check(not jobs(pg),'Cancelar arquivamento não grava')
    abrir(pg);pg.get_by_role('button',name='× Arquivar produto inteiro',exact=True).click();salvar(pg)
    check(jobs(pg)[0]['ops'][0]['action']=='arquivarRapido','X geral prepara arquivamento completo')
    pg.evaluate("localStorage.clear();f.pode=false")
    pg.click('#abrir');check(pg.locator('#ms-edicao-tamanhos').count()==0,'Acesso sem cadastro não abre editor')
    pg.evaluate('f.pode=true;f.online=false;p.Tamanhos="Único";p.Cores="Azul"')
    abrir(pg);pg.keyboard.press('Shift+Tab')
    check(pg.get_by_role('button',name='Salvar alterações').evaluate('(e)=>e===document.activeElement'),'Teclado circula até Salvar sem sair da janela')
    pg.keyboard.press('Tab');check(pg.locator('.tk-disp-fechar').evaluate('(e)=>e===document.activeElement'),'Tab retorna ao fechamento')
    pg.keyboard.press('Escape');check(pg.locator('#ms-edicao-tamanhos').count()==0,'Escape fecha e devolve o foco')
    abrir(pg);pg.get_by_role('button',name='Retirar Único',exact=True).click();salvar(pg)
    check(jobs(pg)[0]['ops'][0]['action']=='arquivarRapido','Último tamanho arquiva a peça')
    pg.evaluate('localStorage.clear();p.Status="Ativo"');abrir(pg)
    pg.get_by_role('button',name='Retirar Azul',exact=True).click();salvar(pg)
    check(jobs(pg)[0]['ops'][0]['action']=='arquivarRapido','Última cor arquiva a peça')
    pg.evaluate('localStorage.clear();p.Status="Ativo";p.Tamanhos="P, M"');abrir(pg)
    pg.get_by_role('button',name='Retirar P',exact=True).click()
    pg.evaluate("() => {window.setOriginal=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('tk_disponibilidade_v1:'))throw Error('quota');return setOriginal.call(this,k,v)}}")
    salvar(pg)
    check(pg.locator('#ms-edicao-tamanhos').is_visible() and 'Libere espaço' in pg.locator('.tk-disp-status').inner_text(),'Armazenamento cheio mantém edição aberta com ação clara')
    check(not jobs(pg),'Não informa salvamento sem persistir a alteração')
    pg.evaluate('()=>{Storage.prototype.setItem=setOriginal;}');pg.get_by_role('button',name='Cancelar',exact=True).click()
    check(not errors,'Sem erros JavaScript')
    ctx.close();browser.close()
