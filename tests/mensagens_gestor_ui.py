"""Central real do gestor: navegação, permissões, metas, configurações e conforto visual."""
import os,json,tempfile,subprocess
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
from mock import install,SESSION,PERMS_ALL
import mock_msg
BASE=os.environ.get('TK_BASE','http://localhost:8773/')
OUT=Path(__file__).parent/'saida/reparos/gestor';OUT.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory() as td:
 fixture=Path(td)/'gestor.json';subprocess.run(['node','tests/worker_gestor.js'],env={**os.environ,'TK_GESTOR_FIXTURE':str(fixture)},check=True)
 snapshot=json.loads(fixture.read_text())
 with sync_playwright() as p:
  browser=p.chromium.launch(args=['--no-sandbox'])
  for w,h in [(320,700),(390,844),(412,915),(1440,900)]:
   ctx=browser.new_context(viewport={'width':w,'height':h},service_workers='block');ctx.add_init_script(SESSION)
   st=install(ctx,perms=PERMS_ALL,versao='7.40.42');st['ig'].setdefault('msg',mock_msg.novo_estado());calls=[];snap=json.loads(json.dumps(snapshot))
   actor=next(x for x in snap['equipe'] if not x.get('legado'))['usuario'];t0=1793458800000
   snap['prioridades']['retomadas']=[{'id':1,'nome':'Cliente para retomar','canal':'whatsapp1','encerradaEm':'2026-10-30T12:00:00Z','pontuacao':{'base':50,'pontos':57,'faixa':'Normal','semHistorico':False,'motivos':[{'motivo':'vendeu','eventos':1,'pontos':10,'validadeDias':90},{'motivo':'sem_resposta','eventos':1,'pontos':-3,'validadeDias':14}]}}]
   snap['tempos']={'desde':t0,'parcial':False,'pessoas':[{'usuario':actor,'online':3600,'ativo':3000,'atendimento':2400,'segundos':{'lendo':1800,'redigindo':600,'navegando':600,'ausente':300,'pausa':300,'sem_detalhe':0},'periodos':[{'inicio':t0,'fim':t0+1800000,'estado':'lendo'},{'inicio':t0+1800000,'fim':t0+2400000,'estado':'redigindo'}]}],'atuais':[{'usuario':actor,'nome':'Ana simulada','estado':'lendo','pausa':False}]}

   def api(route):
    req=route.request;path=urlparse(req.url).path
    if path.endswith('/msg/disponibilidade'):
     if req.method=='POST':assert req.post_data_json=={'pausa':True};snap['tempos']['atuais'][0]['pausa']=True
     route.fulfill(json={'ok':True,'pausa':snap['tempos']['atuais'][0]['pausa']});return
    if path.endswith('/msg/acessos'):
     if req.method=='POST':assert req.post_data_json['alvo']=='558899999999';calls.append((path,'POST'))
     route.fulfill(json={'ok':True,'alvo':'558899999999','ferramentas':{'notas':'Notas da equipe','responder':'Responder'},'regras':{'pessoas':{},'perfis':{}}});return
    if '/msg/gestor' not in path:route.fallback();return
    calls.append((path,req.method))
    if path.endswith('/encerramento') and req.method=='POST':
     d=req.post_data_json;assert d['retornoHoras']==36;snap['encerramento']={**d,'versao':1};route.fulfill(json={'ok':True,'config':snap['encerramento']});return
    if path.endswith('/prioridade') and req.method=='POST':
     d=req.post_data_json;assert d['regras']['vendeu']['pontos']==15;snap['prioridades']['config']={**d,'versao':1};route.fulfill(json={'ok':True,'config':snap['prioridades']['config']});return
    if path.endswith('/config') and req.method=='POST':
     d=req.post_data_json;assert d['metas']['whatsapp1']==25;snap['config']={'versao':1,'metas':d['metas']};route.fulfill(json={'ok':True,'config':snap['config']})
    else:route.fulfill(json=snap)
   ctx.route('**/*',api)
   pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
   pg.goto(BASE+'admin.html');pg.wait_for_timeout(1700);pg.click('#details-ferramentas > summary');pg.locator('#btn-abrir-mensagens').click();pg.wait_for_selector('#ms-lista .ms-conv');pg.wait_for_timeout(750)
   pg.click('#ms-nav [data-ms=menu-geral]');pg.click('[data-ms=disponibilidade]');pg.get_by_role('button',name='Entrar em pausa',exact=True).click();pg.wait_for_function("document.querySelector('#ms-gaveta').textContent.includes('Status alterado: Em pausa')");pg.click('[data-ms=gaveta-fechar]');pg.wait_for_timeout(200);pg.click('#ms-nav [data-ms=menu-geral]');pg.click('[data-ms=gestor]');pg.wait_for_selector('#tg-body .tg-cards');pg.add_script_tag(path=str(Path(__file__).with_name('axe.min.js')))
   def check(label):
    assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth'),label
    viol=pg.evaluate("async()=>{const r=await axe.run(document.querySelector('#tk-gestor'));return r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,n:v.nodes.map(x=>x.target)}))}")
    assert not viol,(w,label,viol)
    pg.screenshot(path=str(OUT/f'{label}-{w}.png'))
   check('agora');assert '30 min' in pg.inner_text('#tg-body')
   pg.locator('[data-filtro="faixa:ate60"]').click();assert 'Cliente aguardando' in pg.inner_text('#tg-body');pg.locator('[data-tg-tab=equipe]').click();assert '1h 0min' in pg.inner_text('#tg-body');assert 'Conversa em uso' in pg.inner_text('#tg-body');pg.get_by_text('Ver períodos observados',exact=True).click();assert pg.locator('.tg-tempo details').first.get_attribute('open') is not None;check('equipe')
   pg.locator('[data-tg-tab=resultados]').click();assert '8 min' in pg.inner_text('#tg-body');check('resultados')
   pg.locator('[data-tg-tab=clientes]').click();assert 'Cliente para retomar' in pg.inner_text('#tg-body');pg.locator('.tg-score summary').click();assert '+10 pontos' in pg.inner_text('#tg-body');check('clientes-retomadas')
   pg.locator('[data-tg=espiar]').first.click();pg.wait_for_selector('#ms-voltar-gestor');assert pg.locator('#ms-voltar-gestor').is_visible();pg.locator('#ms-voltar-gestor').click();pg.wait_for_selector('#tk-gestor')
   pg.locator('[data-tg-tab=dados]').click();assert 'sem autoria' in pg.inner_text('#tg-body');check('qualidade')
   pg.locator('[data-tg-tab=config]').click();assert pg.locator('.tg-config').count()==22;check('configuracoes')
   pg.locator('#tg-busca').fill('camera');assert pg.locator('.tg-config').count()>=1
   pg.locator('#tg-busca').fill('');pg.locator('[data-chave=metas]').click();pg.locator('[name=whatsapp1]').fill('25');pg.locator('#tg-form-metas button').click();pg.wait_for_function("document.querySelector('#tg-editor-status').textContent.includes('salvas')");assert sum(m=='POST' for _,m in calls)==1;check('metas')
   pg.locator('[data-tg=config-voltar]').click();pg.locator('[data-chave=prioridade]').click();pg.locator('[name="vendeu.pontos"]').fill('15');pg.locator('#tg-form-prioridade button').click();pg.wait_for_function("document.querySelector('#tg-editor-status').textContent.includes('prioridade salvas')");check('regras-prioridade')
   pg.locator('[data-tg=config-voltar]').click();pg.locator('[data-chave=encerramento]').click();pg.locator('[name=retornoHoras]').fill('36');pg.locator('#tg-form-encerramento button').click();pg.wait_for_function("document.querySelector('#tg-editor-status').textContent.includes('encerramento salvas')");check('regras-encerramento')
   pg.locator('[data-tg=config-voltar]').click();pg.locator('[data-chave=acessos]').click();pg.locator('#tg-acesso-alvo').fill('88999999999');pg.locator('#tg-form-alvo button').click();pg.wait_for_selector('[data-tg-direito=notas]');pg.locator('[data-tg-direito=notas]').select_option('nao');pg.locator('[data-tg=acessos-salvar]').click();pg.wait_for_function("document.querySelector('#tg-editor-status').textContent.includes('Permissões salvas')");pg.locator('[data-tg=config-voltar]').click();pg.locator('[data-chave=leitura]').click();pg.locator('[data-acao=leitura]').click();pg.wait_for_selector('#ms-voltar-gestor');assert pg.locator('#tk-gestor').count()==0
   pg.locator('#ms-voltar-gestor').click();pg.wait_for_selector('#tk-gestor');pg.locator('[data-tg=config-voltar]').click();pg.locator('[data-chave=exportar]').click();pg.locator('[data-acao=exportar]').click();pg.wait_for_selector('.ms-gaveta form');assert 'Gerar arquivo' in pg.inner_text('.ms-gaveta');pg.locator('[data-ms=gaveta-fechar]').click();pg.wait_for_selector('#ms-gaveta',state='detached');pg.wait_for_timeout(120);pg.locator('#ms-voltar-gestor').click();pg.wait_for_selector('#tk-gestor')
   # Rotas locais no APK, sem alterar permissões de outro aparelho.
   pg.evaluate("window.TKAndroid={diagnostico:()=>JSON.stringify({versao:'2.4.16',camera:true,microfone:false,bateria:true,notificacoes:true}),versao:()=> '2.4.16',permissoes(){},avisos(){},atualizar(){}}")
   pg.locator('[data-tg=config-voltar]').click();pg.locator('[data-chave=permissoes]').click();assert '2.4.16' in pg.inner_text('#tg-body');assert 'Revisar no Android' in pg.inner_text('#tg-body');check('aparelho')
   if w==320:
    pg.set_viewport_size({'width':320,'height':470});pg.evaluate("document.documentElement.style.fontSize='130%'");check('texto130-teclado')
   pg.keyboard.press('Escape');assert pg.locator('#tk-gestor').count()==0;assert not errors,errors
   assert not st['ig']['msg'].get('iniciadas'),'Gestão não envia mensagens'
   print('OK',w,'gestor, 22 configurações, metas, editores, retorno, teclado e axe',flush=True);ctx.close()
  browser.close()
