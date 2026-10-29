"""Filtros de tecido combináveis e URL compartilhável na vitrine e no seletor do atendimento."""
import os,sys
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from mock import install,PERMS_ALL,SESSION
import mock_msg
from pathlib import Path
from playwright.sync_api import sync_playwright
AXE=Path(os.environ.get('TK_AXE', Path(__file__).with_name('axe.min.js')))
if not AXE.exists(): AXE=Path('/workspace/tenkiter-auditoria/backend-suite/tests/axe.min.js')
HAS_AXE=AXE.exists()
BASE=os.environ.get('TK_BASE','http://localhost:8765/');OUT=Path(os.environ.get('TK_EVID','/tmp/tenkiter-filtros-tecido'));OUT.mkdir(parents=True,exist_ok=True)
OK=[];BAD=[]
def chk(n,c,d=''):
    (OK if c else BAD).append(n);print(('✔ ' if c else '✘ ')+n+((' — '+str(d)) if d and not c else ''))
def catalogo(st):
    ps=st['produtos']; dados=[
      ('Vestido Linho','Vestido','Feminino Adulto','M','Azul','Tecido: Linho',5),
      ('Blusa Algodão','Blusa','Feminino Adulto','M','Azul','Tecido: Algodão',4),
      ('Saia Linho','Saia','Feminino Adulto','P','Preto','Descrição com tecido Linho no texto corrido',3),
      ('Vestido Linho esgotado','Vestido','Masculino Adulto','M','Azul','Tecido: Linho',0),
      ('Calça sem campo','Calça','Masculino Adulto','40','Preto','Sem composição informada',2),
    ]
    del ps[5:]
    for i,(nome,cat,gen,tam,cor,desc,stock) in enumerate(dados):
        p=ps[i];p.update(ID=str(8000+i),Codigo='TST-%02d'%i,Nome=nome,Categoria=cat,Genero=gen,Tamanhos=tam,Cores=cor,Descricao=desc,Status='Ativo',Estoque=stock,Preco=90+i,Foto_URL='https://example.invalid/p%d.jpg'%i)
    return ps

def vitrine(b,w,h,scale=1):
    ctx=b.new_context(viewport={'width':w,'height':h},is_mobile=w<600,has_touch=w<600,service_workers='block')
    st=install(ctx,versao='4.28');catalogo(st)
    pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)));pg.goto(BASE+'index.html');pg.wait_for_selector('#grid .card');pg.wait_for_timeout(700)
    if scale==1.3:pg.evaluate("document.documentElement.style.fontSize='130%'")
    if HAS_AXE: pg.add_script_tag(path=str(AXE))
    return ctx,pg,st,errs

def admin_picker(b,w,h,scale=1):
    ctx=b.new_context(viewport={'width':w,'height':h},is_mobile=w<600,has_touch=w<600,service_workers='block');ctx.add_init_script(SESSION);ctx.add_init_script('window.TK_MENSAGENS_POLL_MS=400;')
    st=install(ctx,perms=PERMS_ALL,versao='4.28');catalogo(st);st['ig'].setdefault('msg',mock_msg.novo_estado())
    pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)));pg.goto(BASE+'admin.html');pg.wait_for_timeout(2200);pg.click('#details-ferramentas > summary');pg.click('#btn-abrir-mensagens');pg.wait_for_selector('.ms-conv',timeout=7000);pg.wait_for_timeout(500);pg.click("#ms-lista .ms-conv[data-id='1']");pg.wait_for_selector('#ms-texto');
    if scale==1.3:pg.evaluate("document.documentElement.style.fontSize='130%'")
    pg.locator('#ms-conversa [data-ms=gaveta-produtos]').click();pg.wait_for_selector('#ms-prod-filtros');return ctx,pg,st,errs

with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 # Vitrine: faceta mostra apenas tecido explícito e combina com as facetas existentes.
 ctx,pg,st,errs=vitrine(b,390,844)
 pg.click('#btn-filtros-toggle');pg.wait_for_timeout(250)
 ts=pg.locator('#chips-tecido .chip')
 chk('faceta Tecido aparece na gaveta com fonte canônica',pg.locator('#details-tecido summary').inner_text().startswith('Tecido') and ts.count()==2,[ts.nth(i).inner_text() for i in range(ts.count())])
 chk('descrição que apenas menciona tecido inline e item esgotado não viram opções',ts.all_inner_texts()==['Algodão · 1','Linho · 1'],ts.all_inner_texts())
 pg.locator('#chips-tecido .chip',has_text='Linho').click();pg.locator('#chips-tamanho .chip',has_text='M').click();pg.locator('#chips-genero .chip',has_text='Feminino Adulto').click();pg.locator('#chips-categoria .chip',has_text='Vestido').click();pg.locator('#chips-cor .chip',has_text='Azul').click();pg.wait_for_timeout(400)
 nomes=pg.locator('#grid .card .nome').all_inner_texts()
 chk('Tecido combina com tamanho, gênero, categoria e cor',nomes==['Vestido Linho'],nomes)
 chk('contador reflete o resultado combinado', 'Ver 1 peça' in pg.inner_text('#fx-ver'),pg.inner_text('#fx-ver'))
 chk('filtro tecido entra na URL compartilhável', 'tec=Linho' in pg.evaluate('location.search'),pg.evaluate('location.search'))
 chk('etiqueta de filtro permite remover tecido',pg.locator('#etiquetas-ativas button[aria-label="Tirar o filtro Tecido: Linho"]').count()==1)
 foto=OUT/'vitrine-390.png';pg.screenshot(path=str(foto),full_page=True)
 pg.click('#fx-ver');pg.wait_for_timeout(150);pg.locator('#etiquetas-ativas button[aria-label="Tirar o filtro Tecido: Linho"]').click();pg.wait_for_timeout(300)
 chk('remover chip ativo também tira tecido da URL e do resumo','tec' not in pg.evaluate('location.search') and pg.locator('#chips-tecido .chip.selecionado').count()==0,pg.evaluate('location.search'))
 # URL restaura uma combinação apenas com tecido.
 url=BASE+'index.html?tec=Linho';pg.goto(url);pg.wait_for_selector('#grid .card');pg.wait_for_timeout(500)
 chk('URL compartilhada restaura seleção de tecido e resultados', 'tec=Linho' in pg.evaluate('location.search') and pg.locator('#grid .card').count()==2 and 'Vestido Linho' in pg.inner_text('#grid') and 'Vestido Linho esgotado' in pg.inner_text('#grid'),pg.evaluate('location.search'))
 pg.click('#btn-filtros-toggle');pg.wait_for_timeout(100);pg.click('#btn-limpar');pg.wait_for_timeout(300)
 chk('Limpar filtros apaga tissue do estado e URL', 'tec' not in pg.evaluate('location.search') and pg.locator('#chips-tecido .chip.selecionado').count()==0)
 chk('vitrine 390 sem erros JS',not errs,errs);ctx.close()
 # Uma renomeação do cadastro preserva o filtro selecionado e atualiza o link ao nome canônico.
 ctx,pg,st,errs=vitrine(b,390,844);pg.click('#btn-filtros-toggle');pg.wait_for_timeout(150)
 pg.locator('#chips-tecido .chip',has_text='Linho').click();pg.wait_for_timeout(150)
 pg.evaluate("window.TKTecido.aplicar({versao:99,itens:[{nome:'Linho Novo',apelidos:['Linho']}]})");pg.wait_for_timeout(300)
 chk('renomear tecido mantém a faceta marcada e canonicaliza URL',pg.locator('#chips-tecido .chip.selecionado').get_attribute('data-filter-value')=='Linho Novo' and 'Linho+Novo' in pg.evaluate('location.search').replace('%20','+'),pg.evaluate('location.search'))
 chk('renomear tecido continua filtrando produtos antigos pelo alias',pg.locator('#grid .card').count()==2 and 'Vestido Linho' in pg.inner_text('#grid'),pg.locator('#grid .card').count())
 foto=OUT/'vitrine-tecido-renomeado.png';pg.screenshot(path=str(foto),full_page=True);ctx.close()
 # Vitrine em viewports/texto 130%, incluindo largura mínima.
 for w,h,label in [(320,700,'320'),(390,844,'390'),(412,915,'412'),(1440,900,'1440')]:
    ctx,pg,st,errs=vitrine(b,w,h,1.3);
    if pg.locator('#btn-filtros-toggle').is_visible(): pg.click('#btn-filtros-toggle')
    pg.wait_for_timeout(200)
    chk(label+'px texto 130% sem overflow',pg.evaluate('document.documentElement.scrollWidth<=innerWidth && document.body.scrollWidth<=innerWidth'))
    chk(label+'px texto 130% faceta e chips alcançáveis',pg.locator('#details-tecido').is_visible() and pg.locator('#chips-tecido .chip').count()==2)
    axe_viol=pg.evaluate("async()=>{const r=await axe.run(document.querySelector('#filtros-extras')||document.body,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}});return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id)}") if HAS_AXE else []
    chk(label+'px axe sem erros críticos/sérios',not axe_viol,axe_viol);pg.screenshot(path=str(OUT/('vitrine-'+label+'-130.png')),full_page=True);chk(label+'px sem erros JS',not errs,errs);ctx.close()
 # Picker atendimento: mesmo tecido combina com todos os critérios, números, resultado e limpar.
 for w,h,label,scale in [(320,700,'320',1.3),(390,844,'390',1.3),(412,915,'412',1.3),(1440,900,'1440',1.3)]:
    ctx,pg,st,errs=admin_picker(b,w,h,scale)
    pg.locator('#ms-prod-filtros summary').click();pg.wait_for_selector('[data-prod-filtro=tecido]')
    fac=pg.locator('[data-prod-filtro=tecido]')
    chk(label+' picker mostra tecidos registrados',fac.count()==2,fac.all_inner_texts())
    chk(label+' picker ignora linha sem campo explícito',fac.all_inner_texts()==['Algodão · 1','Linho · 1'],fac.all_inner_texts())
    if label=='390':
        bt=pg.locator('[data-prod-filtro=tecido][data-valor=Linho]');bt.focus();pg.keyboard.press('Enter')
        chk('390 picker tecido funciona por teclado',bt.get_attribute('aria-pressed')=='true')
    else: pg.locator('[data-prod-filtro=tecido][data-valor=Linho]').click()
    pg.locator('[data-prod-filtro=tamanho][data-valor=M]').click();pg.locator('[data-prod-filtro=genero][data-valor="Feminino Adulto"]').click();pg.locator('[data-prod-filtro=categoria][data-valor=Vestido]').click();pg.locator('[data-prod-filtro=cor][data-valor=Azul]').click();pg.wait_for_timeout(200)
    chk(label+' picker combina facetas e filtra produto corretamente',pg.locator('#ms-prod-lista .ms-prod').count()==1 and 'Vestido Linho' in pg.inner_text('#ms-prod-lista'),pg.inner_text('#ms-prod-resultado'))
    chk(label+' picker exibe tecido no cartão de produto','Tecido: Linho' in pg.inner_text('#ms-prod-lista'))
    pg.locator('#ms-prod-refinos button',has_text='Tecido: Linho').click();pg.wait_for_timeout(100)
    chk(label+' picker remove filtro pelo resumo',pg.locator('[data-prod-filtro=tecido][aria-pressed=true]').count()==0 and pg.locator('#ms-prod-lista .ms-prod').count()==1)
    pg.locator('[data-prod-filtro=tecido][data-valor=Linho]').click();pg.locator('#ms-prod-refinos button',has_text='Limpar filtros').click();pg.wait_for_timeout(100)
    chk(label+' picker limpar apaga também tecido',pg.locator('[data-prod-filtro=tecido][aria-pressed=true]').count()==0 and pg.locator('#ms-prod-lista .ms-prod').count()==4)
    pg.screenshot(path=str(OUT/('picker-'+label+'-'+str(scale)+'.png')),full_page=True)
    chk(label+' picker sem erros JS',not errs,errs);ctx.close()
 b.close()
print('OK=%d FALHAS=%d'%(len(OK),len(BAD)));sys.exit(1 if BAD else 0)
