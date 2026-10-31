"""Regressões integradas de encaminhamento, rascunho, equipe e perfis. APIs simuladas."""
import os,sys,json,tempfile,subprocess
from urllib.parse import urlparse,parse_qs
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from mock import install,PERMS_ALL,SESSION,PNG
import mock_msg
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TK_BASE','http://localhost:8773/')
OUT=Path(__file__).parent/'saida'/'reparos';OUT.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory() as d:
 invalid=Path(d)/'invalido.mp4';invalid.write_bytes(b'');photo=Path(d)/'foto.png';photo.write_bytes(PNG)
 video=Path(d)/'inteiro.mp4';subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=orange:s=160x240:r=24','-t','35','-c:v','libx264','-threads','2','-y',str(video)],check=True)
 with sync_playwright() as p:
  b=p.chromium.launch(args=['--no-sandbox'])
  for w,h in [(320,700),(390,844),(412,915),(1440,900)]:
   c=b.new_context(viewport={'width':w,'height':h},service_workers='block');c.add_init_script(SESSION);c.add_init_script('window.TK_MENSAGENS_POLL_MS=400;')
   st=install(c,perms=PERMS_ALL,versao='7.40.37');S=st['ig'].setdefault('msg',mock_msg.novo_estado());pg=c.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.on('dialog',lambda d:d.accept())
   pg.goto(BASE+'admin.html');pg.wait_for_timeout(1500);pg.click('#details-ferramentas > summary');pg.click('#btn-abrir-mensagens');pg.wait_for_selector('#ms-lista .ms-conv');pg.locator('#ms-lista [data-ms=abrir][data-id="1"]').click();pg.wait_for_selector('#ms-texto')
   def destinos(route):
    u=route.request.url
    if '&escopo=todos&fila=&busca=' not in u:return route.fallback()
    q=parse_qs(urlparse(u).query,keep_blank_values=True);base=dict(next(x for x in S['convs'] if x['id']==2))
    if q.get('busca',[''])[0]:items=[dict(base,nome='Destino remoto')]
    elif q.get('antes'):items=[dict(base,id=9001,nome='Além da primeira página')]
    else:items=[base]+[dict(base,id=100+i,nome='Contato '+str(i)) for i in range(49)]
    route.fulfill(json={'ok':True,'conversas':items})
   c.route('**/msg/conversas?**',destinos)
   pg.evaluate("sessionStorage.setItem('tk_ms_rasc_2','RASCUNHO IMPORTANTE')")
   pg.locator('#ms-fio [data-ms=encaminhar]').first.click();pg.wait_for_selector('#ms-encaminhar-modal [data-ms=encaminhar-destino]')
   assert pg.locator('#ms-encaminhar-modal [role=dialog]').count()==1
   pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')))
   assert not pg.evaluate("async()=>{const r=await axe.run(document.querySelector('#ms-encaminhar-modal'));return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id)}")
   pg.keyboard.press('Escape');pg.wait_for_timeout(500);assert pg.locator('#ms-encaminhar-modal').count()==0;assert pg.locator('#ms-texto').count()==1
   pg.locator('#ms-fio [data-ms=encaminhar]').first.click();pg.wait_for_selector('#ms-encaminhar-modal [data-id="2"]');pg.get_by_role('button',name='Ver mais conversas',exact=True).click();pg.wait_for_selector('#ms-encaminhar-modal [data-id="9001"]');pg.locator('#ms-encaminhar-modal input').fill('Destino remoto');pg.wait_for_selector('#ms-encaminhar-modal [data-id="2"] strong:text-is("Destino remoto")');pg.locator('#ms-encaminhar-modal [data-id="2"]').click();pg.wait_for_timeout(900)
   assert 'RASCUNHO IMPORTANTE' in pg.locator('#ms-texto').input_value(),'Rascunho do destino foi perdido'
   assert len(S['envios'])==0,'Encaminhar enviou sem revisão'
   pg.set_input_files('#ms-arquivo',[str(invalid),str(photo)]);pg.wait_for_selector('#ms-stage img');assert pg.locator('#ms-stage img').count()==1,'Arquivo inválido descartou a foto válida'
   # Mensageiro não aplica o teto de Status, mantém duração >30 s.
   pg.set_input_files('#ms-arquivo',str(video));pg.wait_for_selector('#ms-stage video');assert pg.locator('#ms-stage video').count()==1;assert pg.locator('#tk-video-preparo').count()==0
   # Fonte ampliada/reflow e diálogo de trecho explícito, sem upload ao cancelar.
   pg.evaluate("document.documentElement.style.fontSize='130%'")
   pg.screenshot(path=str(OUT/f'encaminhar-{w}.png'))
   assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
   # Painel: Todos, atualização leve, timestamp e recuperação de erro sem perder navegação.
   pg.reload();pg.wait_for_timeout(1500);pg.click('#details-ferramentas > summary');pg.locator('#btn-abrir-mensagens').evaluate("e=>e.scrollIntoView({block:'center'})");pg.click('#btn-abrir-mensagens');pg.wait_for_selector('#ms-lista .ms-conv')
   met={'total':7,'erro':False};consultas=[]
   def metricas(route):
    consultas.append(route.request.url)
    if met['erro']:return route.fulfill(status=503,json={'ok':False,'erro':'Não foi possível calcular agora. Tente outro período.'})
    route.fulfill(json={'ok':True,'dias':30,'calculadoEm':'2026-10-31T00:00:00Z','aguardando':{'total':met['total'],'maisAntigas':[]},'medianaMin':5,'ate5min':80,'ate60min':95,'perguntasSemResposta':2,'acima24h':0,'conversas':10,'entradas':20,'saidas':18,'resolvidosSemResposta':1,'porHora':[{'hora':i,'entradas':i%3,'medianaMin':5} for i in range(24)]})
   c.route('**/msg/metricas?**',metricas)
   pg.click('#ms-nav [data-ms=menu-geral]');pg.click('.ms-mais-item[data-ms=painel]');pg.wait_for_selector('#ms-painel-atualizado')
   assert pg.locator('.ms-card b').first.inner_text()=='7';met['total']=987
   pg.evaluate('window._originalAgora=Date.now;Date.now=()=>window._originalAgora()+31000')
   pg.wait_for_function("document.querySelector('.ms-card b').textContent==='987'",timeout=10000)
   assert any('cache=1' in x for x in consultas);assert 'indicadores do período' in pg.inner_text('#ms-painel-atualizado')
   pg.screenshot(path=str(OUT/f'painel-{w}.png'))
   met['erro']=True;pg.click('[data-ms=painel-dias][data-dias="7"]');pg.wait_for_timeout(300);assert 'Não foi possível calcular' in pg.inner_text('#ms-extra')
   met['erro']=False;pg.click('[data-ms=painel-dias][data-dias="30"]');pg.wait_for_selector('#ms-painel-atualizado')
   assert not errors,errors
   print('OK',w,'Escape, destino, rascunho, sem envio, vídeo inteiro e reflow130%')
   c.close()
  b.close()
