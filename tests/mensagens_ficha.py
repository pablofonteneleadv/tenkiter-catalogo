"""Jornada browser da ficha estruturada, com catálogos e endpoints simulados."""
import sys, os
AQUI=os.path.dirname(os.path.abspath(__file__));sys.path.insert(0,AQUI)
from mock import *
import mock_msg
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://localhost:8765/');EVID=os.environ.get('TK_EVID','')
AXE=open(os.path.join(AQUI,'axe.min.js')).read();OK=[];BAD=[];DIALOGOS=[];DIALOG_ACTION='accept'
def chk(n,c,e=''):
    (OK if c else BAD).append(n);print(('  ✔ ' if c else '  ✘ ')+n+((' — '+str(e)) if e and not c else ''))
def axe(pg,label):
    pg.evaluate(AXE)
    r=pg.evaluate("async()=>{const r=await axe.run(document.getElementById('overlay-mensagens'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}});return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id+'×'+v.nodes.length+' '+v.nodes.slice(0,2).map(x=>x.target.join(' ')).join(','))}")
    chk('axe '+label,not r,r)
def foto(pg,name):
    if EVID: os.makedirs(EVID,exist_ok=True);pg.screenshot(path=os.path.join(EVID,name),full_page=False)
def sem_h(pg):return pg.evaluate('document.documentElement.scrollWidth<=innerWidth && document.body.scrollWidth<=innerWidth')
def dentro(pg,sel):
    return pg.evaluate("s=>{const e=document.querySelector(s);if(!e)return false;const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1}",sel)
def open_ficha(b,w,h,mobile,zoom=1):
    ctx=b.new_context(viewport={'width':w,'height':h},is_mobile=mobile,has_touch=mobile,service_workers='block')
    ctx.add_init_script(SESSION);ctx.add_init_script('window.TK_MENSAGENS_POLL_MS=400;')
    st=install(ctx,perms=PERMS_ALL,versao='4.28');S=st['ig'].setdefault('msg',mock_msg.novo_estado())
    # Catálogo de demonstração: apenas dados reais dos registros simulados.
    for i,p in enumerate(st['produtos'][:4]):
        p['Status']='Ativo';p['Genero']=['Feminino Adulto','Unissex','Infantil Menina','Masculino Adulto'][i]
        p['Tamanhos']=['PP, P, M','M, G','Idade: 4-6','Veste: 40'][i]
        p['Cores']=['Azul, Preto','Rosa','Verde','Preto'][i]
        p['Descricao']='Descrição real.\nTecido: '+['Linho','Algodão','Malha','Jeans'][i]
    chave=mock_msg.pessoa(S['convs'][0]); S.setdefault('fichas',{})[chave]={'nome':'Maria','tamanhos':'XXS arquivado','preferencias':'','cidade':'Crateús','perfil':{'cidade':'Crateús','bairro':'','municipio':'','localidade':'','preferencias':{'tamanhos':['XXS arquivado'],'generos':['Gênero salvo antigo'],'tecidos':['Tecido salvo antigo'],'cores':['Cor salva antiga']}},'atualizado_em':'2026-10-28T12:00:00Z','autor':'Ana'}
    errs=[];pg=ctx.new_page();pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('dialog',lambda d:(DIALOGOS.append(d.message),d.dismiss() if DIALOG_ACTION=='dismiss' else d.accept()))
    pg.goto(BASE+'admin.html');pg.wait_for_timeout(2300);pg.click('#details-ferramentas > summary');pg.click('#btn-abrir-mensagens');pg.wait_for_selector('.ms-conv',timeout=6000);pg.click("#ms-lista .ms-conv[data-id='1']");pg.wait_for_selector('#ms-texto',timeout=4000)
    # Browser zoom 130% reduces the CSS viewport; model the corresponding viewport, not CSS transform zoom.
    if zoom!=1: pg.evaluate('(z)=>document.documentElement.style.fontSize=(z*100)+"%"',zoom)
    pg.click('.ms-cab .ms-quem');pg.wait_for_selector('#ms-fi-salvar',timeout=8000);pg.wait_for_timeout(250)
    return ctx,pg,S,errs
with sync_playwright() as p:
    b=p.chromium.launch(args=['--no-sandbox'])
    # Tarefa completa em 390×844: localização livre, cascata e persistência.
    ctx,pg,S,errs=open_ficha(b,390,844,True,1.3)
    chk('ordem Nome → Cidade/localização → Preferências → Tamanhos e peças',pg.locator('#ms-fi-nome').evaluate("e=>e.compareDocumentPosition(document.querySelector('#ms-fi-cid'))&Node.DOCUMENT_POSITION_FOLLOWING")!=0 and pg.locator('#ms-fi-cid').evaluate("e=>e.compareDocumentPosition(document.querySelector('#ms-fi-h-pref'))&Node.DOCUMENT_POSITION_FOLLOWING")!=0)
    chk('Crateús aparece antes de Interior e município livre tem Outra cidade',pg.locator('#ms-fi-cid option').nth(1).inner_text()=='Crateús' and pg.locator('#ms-fi-cid option').nth(2).inner_text()=='Interior' and pg.locator('#ms-fi-cid option').last.inner_text()=='Outra cidade')
    saved_size=pg.locator('[data-ficha-grupo=tamanhos][data-valor="XXS arquivado"]')
    pg.locator('.ms-fi-faceta').filter(has=pg.locator('summary',has_text='Tecidos')).locator('summary').click()
    saved_fabric=pg.locator('[data-ficha-grupo=tecidos][data-valor="Tecido salvo antigo"]')
    chk('preferências salvas ausentes no catálogo continuam visíveis e marcadas',saved_size.count()==1 and saved_size.get_attribute('aria-pressed')=='true' and saved_fabric.count()==1 and saved_fabric.get_attribute('aria-pressed')=='true' and 'salvo' in saved_fabric.inner_text(),{'size':saved_size.count(),'fabric':saved_fabric.count(),'summary':pg.locator('#ms-ficha').inner_text()[:500]})
    pg.locator('.ms-fi-faceta').filter(has=pg.locator('summary',has_text='Tecidos')).locator('summary').click()
    # Bairro Crateús: entrada livre prioritária e seleção textual.
    pg.select_option('#ms-fi-bairro-opcao','__livre');pg.fill('#ms-fi-bairro','Bairro inventariado pela cliente')
    # Cascata com catálogo real. Seleciona mais de um tamanho e avança em sequência.
    # Tamanhos começa aberto por ser o primeiro grupo.
    pg.locator('[data-ficha-grupo=tamanhos][data-valor="P"]').click();pg.locator('[data-ficha-grupo=tamanhos][data-valor="M"]').click()
    pg.locator('.ms-fi-adicionar input').fill('Tamanho personalizado');pg.locator('.ms-fi-adicionar button').click()
    pg.locator('#ms-ficha button',has_text='Escolher gêneros').click();pg.locator('[data-ficha-grupo=generos][data-valor="Feminino Adulto"]').click();pg.locator('#ms-ficha button',has_text='Escolher tecidos').click();pg.locator('[data-ficha-grupo=tecidos][data-valor="Linho"]').click();pg.locator('#ms-ficha button',has_text='Escolher cores').click();pg.locator('[data-ficha-grupo=cores][data-valor="Azul"]').click()
    chk('cascata usa opções reais, seleção múltipla e tamanho livre',pg.locator('[data-ficha-grupo=tamanhos][aria-pressed=true]').count()>=3 and pg.locator('[data-ficha-grupo=generos][data-valor="Feminino Adulto"]').get_attribute('aria-pressed')=='true' and pg.locator('[data-ficha-grupo=tecidos][data-valor="Linho"]').count()==1 and pg.locator('[data-ficha-grupo=cores][data-valor="Azul"]').get_attribute('aria-pressed')=='true')
    chk('Crateús aceita bairro digitado sem restringir à sugestão',pg.input_value('#ms-fi-bairro')=='Bairro inventariado pela cliente')
    foto(pg,'ficha-390-cascata.png');axe(pg,'390×844 com zoom 130%');chk('390×844 / zoom 130% sem rolagem horizontal',sem_h(pg))
    pg.fill('#ms-fi-nome','Maria Atualizada');pg.click('#ms-fi-salvar');pg.wait_for_timeout(700)
    post=(S.get('ficha_posts') or [{}])[-1]
    chk('salvar envia perfil completo, nome e listas estruturadas',post.get('nome')=='Maria Atualizada' and post.get('perfil',{}).get('bairro')=='Bairro inventariado pela cliente' and post.get('perfil',{}).get('preferencias',{}).get('tamanhos')==['XXS arquivado','P','M','Tamanho personalizado'],post)
    chk('salvar fecha ficha com sucesso',pg.locator('#ms-gaveta').count()==0)
    foto(pg,'ficha-390-salva.png')
    # Reabrir e confirmar round-trip, depois testar proteção contra descarte ao sair.
    pg.click('.ms-cab .ms-quem');pg.wait_for_selector('#ms-fi-salvar');
    chk('reabrir mantém bairro, nome, seleção antiga e opções sem estoque',pg.input_value('#ms-fi-nome')=='Maria Atualizada' and pg.input_value('#ms-fi-bairro')=='Bairro inventariado pela cliente' and pg.locator('[data-ficha-grupo=tecidos][data-valor="Tecido salvo antigo"]').get_attribute('aria-pressed')=='true')
    pg.select_option('#ms-fi-cid','Interior');pg.select_option('#ms-fi-localidade-opcao','__livre');pg.fill('#ms-fi-localidade','Comunidade rural digitada');pg.click('#ms-fi-salvar');pg.wait_for_timeout(600)
    post=(S.get('ficha_posts') or [{}])[-1];chk('Interior salva localidade rural digitada livremente',post.get('perfil',{}).get('cidade')=='Interior' and post.get('perfil',{}).get('localidade')=='Comunidade rural digitada',post.get('perfil'))
    pg.click('.ms-cab .ms-quem');pg.wait_for_selector('#ms-fi-salvar');pg.select_option('#ms-fi-cid','Fortaleza')
    chk('outra cidade selecionada sem impor bairro',pg.locator('#ms-fi-bairro').is_hidden() and pg.locator('#ms-fi-localidade').is_hidden())
    pg.fill('#ms-fi-nome','Nome não salvo');n=len(DIALOGOS);DIALOG_ACTION='dismiss';pg.keyboard.press('Escape');pg.wait_for_timeout(200);DIALOG_ACTION='accept'
    chk('Escape avisa sobre alterações não salvas e mantém ficha ao cancelar',len(DIALOGOS)==n+1 and 'sem salvar' in DIALOGOS[-1].lower() and pg.locator('#ms-fi-salvar').count()==1,DIALOGOS[-1:])
    pg.click('#ms-fi-salvar');pg.wait_for_timeout(500);foto(pg,'ficha-390-final.png')
    chk('sem erros JavaScript na jornada principal',not errs,errs);ctx.close()
    # Reflow a 320, mobile maior e desktop; zoom 130% e axe em cada tamanho.
    for nome,w,h,mob in [('390×470 teclado',390,470,True),('320×844',320,844,True),('412×915',412,915,True),('1440×900',1440,900,False)]:
        ctx,pg,S,errs=open_ficha(b,w,h,mob,1.3);foto(pg,'ficha-'+nome.replace('×','x')+'-130.png')
        chk(nome+' / 130% sem rolagem horizontal',sem_h(pg))
        chk(nome+' botão Salvar alcançável',dentro(pg,'#ms-fi-salvar'))
        axe(pg,nome+' zoom 130%');chk(nome+' sem erros JavaScript',not errs,errs);ctx.close()
    b.close()
print('\nOK=%d FALHAS=%d %s'%(len(OK),len(BAD),BAD));sys.exit(1 if BAD else 0)
