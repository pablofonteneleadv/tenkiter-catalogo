/* TENKiTER — gravador visual de tutoriais no aplicativo (v1).
 * O editor escolhe elementos numa prévia da tela real. O modo de teste bloqueia
 * navegação/envio e apenas confere se a pessoa fez a ação definida. */
(function(){
  'use strict';
  var T = window.TKTutorial = {}, cfg = null, tutoriais = [], atual = null, etapaEditada = -1, modoRapido = true, gravando = false;
  var E = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); };
  var css = [
    '.tut-box{margin-top:22px;padding:18px;border:2px solid var(--accent-2);border-radius:16px;background:var(--surface)}',
    '.tut-box h2,.tut-box h3{margin:0 0 8px}.tut-muted{color:var(--muted);font-size:.9rem;line-height:1.45}',
    '.tut-actions,.tut-grid{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.tut-grid>*{flex:1 1 210px}',
    '.tut-input{width:100%;min-height:44px;padding:9px 11px;border:2px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font:inherit}',
    'textarea.tut-input{min-height:84px;resize:vertical}.tut-linha{border:1px solid var(--border);border-radius:12px;padding:12px;margin:9px 0;background:var(--surface-2)}',
    '.tut-linha-top{display:flex;gap:8px;align-items:flex-start}.tut-linha-top b{flex:1}.tut-chip{font-size:.75rem;background:var(--accent-soft);color:var(--accent-txt);padding:3px 7px;border-radius:99px}',
    '.tut-btn{min-height:44px;padding:10px 14px;border:0;border-radius:10px;background:var(--accent-2);color:#111;font:inherit;font-weight:800;cursor:pointer}',
    '.tut-btn.sec{background:var(--surface-2);color:var(--text);border:2px solid var(--border)}.tut-btn.danger{background:var(--danger-bg);color:var(--danger)}.tut-btn:disabled{opacity:.45}',
    '.tut-frame-wrap{position:relative;border:2px solid var(--border);border-radius:14px;overflow:hidden;background:#fff;margin:12px 0}.tut-frame{display:block;width:100%;height:620px;border:0}',
    '.tut-rec{padding:10px;background:var(--warn-bg);color:var(--warn-text);border-bottom:1px solid var(--warn-border);font-weight:700}',
    '.tut-form{padding:14px;border:2px solid var(--accent-2);border-radius:14px;background:var(--accent-soft);margin:12px 0}',
    '.tut-planilha{width:100%;border-collapse:separate;border-spacing:0 8px}.tut-planilha td{padding:8px;background:var(--surface-2);vertical-align:top}.tut-planilha td:first-child{border-radius:10px 0 0 10px;font-weight:800}.tut-planilha td:last-child{border-radius:0 10px 10px 0}',
    '.tut-planilha .tut-input{min-width:130px}.tut-mini{min-height:38px;padding:7px 9px}.tut-float-preview{padding:14px;border-radius:12px;margin:8px 0;box-shadow:0 4px 16px #0003}',
    '.tut-status{padding:10px 12px;border-radius:10px;margin:10px 0}.tut-status.ok{background:var(--good-bg);color:var(--good-text)}.tut-status.err{background:var(--danger-bg);color:var(--danger)}',
    '.tut-modal{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.72);padding:10px;overflow:auto}.tut-modal-card{max-width:1100px;margin:auto;background:var(--bg);color:var(--text);border-radius:16px;padding:14px}',
    '@media(max-width:600px){.tut-frame{height:68vh}.tut-box{padding:13px}.tut-modal{padding:0}.tut-modal-card{border-radius:0;min-height:100vh}}'
  ].join('\n');
  var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);

  if (window.TMV){
    var init0=TMV.init;
    TMV.init=function(o){ cfg=o||{}; return init0.call(TMV,o); };
  }
  function S(){ return cfg && cfg.state ? cfg.state() : {}; }
  function api(p){
    var s=S(), u=s.user||{};
    return cfg.submit(Object.assign({whatsapp:u.whatsapp,sessao:u.password},p));
  }
  function aviso(m){ if(cfg&&cfg.toast) cfg.toast(m); }
  function idNovo(){ return 'tut-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7); }
  function novo(){ return {id:idNovo(),titulo:'',descricao:'',pagina:'index.html',visao:'admin_total',preparacao:[],status:'rascunho',versao:1,etapas:[]}; }
  function labelAcao(a){ return {click:'Tocar',fill:'Preencher',select:'Escolher',check:'Marcar'}[a]||a; }
  function rotas(){ return [
    ['index.html','Catálogo'],['admin.html','Gestão / cadastro'],['treinamentos.html','Treinamentos'],
    ['curriculo.html','Currículo'],['curriculos.html','Gestão de currículos'],
    ['treinamento-postagens-real.html','Prática de postagens']
  ]; }
  function visoes(){return [['cliente','Cliente'],['aluno','Aluno'],['novato','Novato'],['estagiario','Estagiário'],['funcionario','Funcionário'],['equipe_site','Equipe do site'],['equipe_catalogo','Equipe catálogo 1'],['encarregado','Encarregado'],['admin','Admin'],['admin_total','Admin total'],['rh','Responsável RH']];}
  function navDaVisao(v){var b=['catalogo'];if(v!=='cliente')b.push('treinamentos');if(['equipe_catalogo','encarregado','admin','admin_total'].indexOf(v)>=0)b.push('gestao');if(['encarregado','admin','admin_total','rh'].indexOf(v)>=0)b.push('rh');if(['admin','admin_total','rh'].indexOf(v)>=0)b.push('curriculos');if(v==='cliente')b.push('candidatura');return b;}
  function aplicarVisao(f){try{var d=f.contentDocument,ok=navDaVisao(atual.visao||'admin_total');d.querySelectorAll('[data-nav]').forEach(function(a){a.style.display=ok.indexOf(a.dataset.nav)>=0?'':'none';});}catch(e){}}
  function selector(el,doc){
    if(el.id) return '#'+CSS.escape(el.id);
    var attrs=['data-testid','data-action','name','aria-label'];
    for(var i=0;i<attrs.length;i++){var v=el.getAttribute(attrs[i]);if(v){var q='['+attrs[i]+'="'+CSS.escape(v)+'"]';if(doc.querySelectorAll(q).length===1)return q;}}
    var out=[];
    while(el&&el.nodeType===1&&el!==doc.body){
      var s=el.tagName.toLowerCase(), p=el.parentElement;
      if(p){var same=[].filter.call(p.children,function(x){return x.tagName===el.tagName;});if(same.length>1)s+=':nth-of-type('+(same.indexOf(el)+1)+')';}
      out.unshift(s); if(doc.querySelectorAll(out.join('>')).length===1)break; el=p;
    }
    return out.join('>');
  }
  function nomeElemento(el){ return (el.getAttribute('aria-label')||el.innerText||el.placeholder||el.name||el.tagName).trim().replace(/\s+/g,' ').slice(0,100); }

  T.montarEditor=async function(){
    var slot=document.getElementById('tut-editor-slot'); if(!slot||slot.dataset.ok)return;
    slot.dataset.ok='1';
    slot.innerHTML='<section class="tut-box"><h2>🎥 Tutoriais no aplicativo</h2><p class="tut-muted">Grave etapas tocando nos elementos da tela real. Em cada etapa você escreve a orientação, limita os valores aceitos e define como o sistema avalia o acerto.</p><div id="tut-msg" class="tut-muted">Carregando…</div><div id="tut-lista"></div></section>';
    var r=await api({action:'tutorial_listar',todos:true});
    if(!r||!r.ok){ slot.querySelector('#tut-msg').textContent=(r&&r.erro)||'O backend ainda não aceita tutoriais.'; return; }
    tutoriais=r.tutoriais||[]; slot.querySelector('#tut-msg').innerHTML='<button class="tut-btn" id="tut-novo">＋ Gravar tutorial</button>';
    slot.querySelector('#tut-novo').onclick=function(){ abrirEditor(novo()); }; desenharLista();
  };
  T.montarAluno=async function(){
    var slot=document.getElementById('tut-aluno-slot');if(!slot)return;
    var r=await api({action:'tutorial_listar'});if(!r||!r.ok)return;
    var lista=(r.tutoriais||[]).filter(function(x){return x.status==='publicado';});if(!lista.length)return;
    slot.innerHTML='<section class="tut-box" style="margin:0 0 22px"><h2>🧭 Tutoriais guiados</h2><p class="tut-muted">Faça as tarefas na tela com orientação e correção em cada etapa.</p>'+lista.map(function(t){return '<article class="tut-linha"><div class="tut-linha-top"><b>'+E(t.titulo)+'</b><span class="tut-chip">'+t.etapas.length+' etapas</span></div><p class="tut-muted">'+E(t.descricao||'')+'</p><button class="tut-btn" data-play="'+E(t.id)+'">Começar tutorial</button></article>';}).join('')+'</section>';
    slot.querySelectorAll('[data-play]').forEach(function(b){b.onclick=function(){abrirTeste(lista.find(function(x){return x.id===b.dataset.play;}));};});
  };
  function desenharLista(){
    var box=document.getElementById('tut-lista'); if(!box)return;
    box.innerHTML=tutoriais.length?tutoriais.map(function(t){return '<article class="tut-linha"><div class="tut-linha-top"><b>'+E(t.titulo||'Sem título')+'</b><span class="tut-chip">'+E(t.status||'rascunho')+'</span></div><p class="tut-muted">'+t.etapas.length+' etapa(s) · '+E(t.pagina)+'</p><div class="tut-actions"><button class="tut-btn sec" data-edit="'+E(t.id)+'">Editar</button><button class="tut-btn sec" data-test="'+E(t.id)+'">Testar</button><button class="tut-btn danger" data-del="'+E(t.id)+'">Excluir</button></div></article>';}).join(''):'<p class="tut-muted">Nenhum tutorial criado ainda.</p>';
    box.querySelectorAll('[data-edit]').forEach(function(b){b.onclick=function(){abrirEditor(tutoriais.find(function(x){return x.id===b.dataset.edit;}));};});
    box.querySelectorAll('[data-test]').forEach(function(b){b.onclick=function(){abrirTeste(tutoriais.find(function(x){return x.id===b.dataset.test;}));};});
    box.querySelectorAll('[data-del]').forEach(function(b){b.onclick=async function(){if(!confirm('Excluir este tutorial?'))return;var r=await api({action:'tutorial_excluir',tutorialId:b.dataset.del});if(r&&r.ok){tutoriais=tutoriais.filter(function(x){return x.id!==b.dataset.del;});desenharLista();}else aviso((r&&r.erro)||'Não foi possível excluir.');};});
  }
  function abrirEditor(t){
    atual=JSON.parse(JSON.stringify(t)); etapaEditada=-1;
    var m=document.createElement('div');m.className='tut-modal';m.id='tut-modal';
    atual.preparacao=atual.preparacao||[];atual.visao=atual.visao||'admin_total';
    m.innerHTML='<div class="tut-modal-card"><div class="tut-actions"><button class="tut-btn sec" id="tut-fechar">← Voltar</button><button class="tut-btn" id="tut-salvar">Salvar rascunho</button><button class="tut-btn" id="tut-publicar">Publicar</button></div><div class="tut-grid"><label>Título<input id="tut-titulo" class="tut-input" value="'+E(atual.titulo)+'"></label><label>Tela inicial<select id="tut-pagina" class="tut-input">'+rotas().map(function(r){return '<option value="'+r[0]+'"'+(r[0]===atual.pagina?' selected':'')+'>'+r[1]+'</option>';}).join('')+'</select></label><label>Visão de acesso<select id="tut-visao" class="tut-input">'+visoes().map(function(r){return '<option value="'+r[0]+'"'+(r[0]===atual.visao?' selected':'')+'>'+r[1]+'</option>';}).join('')+'</select></label></div><p class="tut-muted">A visão controla o que aparece na prévia. Sua conta administrativa continua ativa para conseguir demonstrar todas as telas permitidas.</p><label>Descrição<textarea id="tut-desc" class="tut-input">'+E(atual.descricao)+'</textarea></label><div class="tut-actions"><button class="tut-btn" id="tut-gravar">⏺ Gravação rápida</button><button class="tut-btn sec" id="tut-gravar-detalhe">🎯 Adicionar explicando</button><button class="tut-btn sec" id="tut-texto">💬 Texto flutuante</button></div><div id="tut-captura"></div><div id="tut-etapas"></div><div class="tut-actions"><button class="tut-btn sec" id="tut-testar">▶ Testar tutorial inteiro</button></div></div>';
    document.body.appendChild(m); desenharEtapas();
    m.querySelector('#tut-fechar').onclick=function(){m.remove();};
    m.querySelector('#tut-pagina').onchange=function(){atual.pagina=this.value;};
    m.querySelector('#tut-visao').onchange=function(){atual.visao=this.value;var f=document.getElementById('tut-frame');if(f)aplicarVisao(f);};
    m.querySelector('#tut-gravar').onclick=function(){modoRapido=true;abrirCaptura();};
    m.querySelector('#tut-gravar-detalhe').onclick=function(){modoRapido=false;abrirCaptura();};
    m.querySelector('#tut-texto').onclick=function(){formTextoFlutuante(null);};
    m.querySelector('#tut-testar').onclick=function(){lerCabecalho();abrirTeste(atual);};
    m.querySelector('#tut-salvar').onclick=function(){salvar('rascunho');};
    m.querySelector('#tut-publicar').onclick=function(){salvar('publicado');};
  }
  function lerCabecalho(){atual.titulo=document.getElementById('tut-titulo').value.trim();atual.descricao=document.getElementById('tut-desc').value.trim();atual.pagina=document.getElementById('tut-pagina').value;atual.visao=document.getElementById('tut-visao').value;}
  function desenharEtapas(){
    var box=document.getElementById('tut-etapas');if(!box)return;
    box.innerHTML='<h3>Planilha de etapas ('+atual.etapas.length+')</h3><p class="tut-muted">Edite orientação, regra e valor diretamente na lista.</p>'+(atual.etapas.length?'<div style="overflow:auto"><table class="tut-planilha"><tbody>'+atual.etapas.map(function(x,i){return '<tr><td>'+(i+1)+'</td><td><input class="tut-input tut-mini" data-campo="instrucao" data-i="'+i+'" value="'+E(x.instrucao)+'"><small>'+E(x.alvoNome||'Texto flutuante')+'</small></td><td><select class="tut-input tut-mini" data-campo="acao" data-i="'+i+'"><option value="click">Tocar</option><option value="fill">Preencher</option><option value="select">Escolher</option><option value="check">Marcar</option><option value="texto">Texto</option></select><select class="tut-input tut-mini" data-campo="regra" data-i="'+i+'"><option value="acao">Ação</option><option value="exato">Exato</option><option value="um_de">Uma opção</option><option value="preenchido">Preenchido</option><option value="marcado">Marcado</option><option value="desmarcado">Desmarcado</option></select></td><td><input class="tut-input tut-mini" data-campo="valor" data-i="'+i+'" value="'+E(x.valor||'')+'" placeholder="Valor exigido"></td><td><button class="tut-btn sec" data-up="'+i+'">↑</button><button class="tut-btn sec" data-down="'+i+'">↓</button><button class="tut-btn sec" data-ed="'+i+'">Editar</button><button class="tut-btn danger" data-rm="'+i+'">×</button></td></tr>';}).join('')+'</tbody></table></div>':'<p class="tut-muted">Grave os cliques ou adicione um texto flutuante.</p>');
    box.querySelectorAll('[data-campo]').forEach(function(el){var x=atual.etapas[+el.dataset.i];el.value=x[el.dataset.campo]||'';el.onchange=function(){x[el.dataset.campo]=el.value;};});
    box.querySelectorAll('[data-up]').forEach(function(b){b.onclick=function(){mover(+b.dataset.up,-1);};}); box.querySelectorAll('[data-down]').forEach(function(b){b.onclick=function(){mover(+b.dataset.down,1);};});
    box.querySelectorAll('[data-rm]').forEach(function(b){b.onclick=function(){atual.etapas.splice(+b.dataset.rm,1);desenharEtapas();};});
    box.querySelectorAll('[data-ed]').forEach(function(b){b.onclick=function(){etapaEditada=+b.dataset.ed;var x=atual.etapas[etapaEditada];if(x.acao==='texto')formTextoFlutuante(x);else formEtapa(x);};});
  }
  function mover(i,d){var j=i+d;if(j<0||j>=atual.etapas.length)return;var x=atual.etapas.splice(i,1)[0];atual.etapas.splice(j,0,x);desenharEtapas();}
  function abrirCaptura(){
    gravando=false;lerCabecalho();var c=document.getElementById('tut-captura');c.innerHTML='<div class="tut-frame-wrap"><div class="tut-rec" id="tut-rec-msg">🧭 Prepare a tela: navegue e abra o que precisar. Estas ações não aparecerão para a pessoa.</div><div class="tut-actions" style="padding:0 10px"><button type="button" class="tut-btn" id="tut-comecar">⏺ Começar a gravação daqui</button><button type="button" class="tut-btn sec" id="tut-limpar-prep">Limpar preparação</button><button type="button" class="tut-btn sec" id="tut-parar">Encerrar</button></div><iframe class="tut-frame" id="tut-frame" title="Tela para gravar tutorial" src="'+E(atual.pagina)+'?tutorial_editor=1"></iframe></div><div id="tut-form-slot"></div>';
    c.querySelector('#tut-parar').onclick=function(){c.innerHTML='';desenharEtapas();};
    c.querySelector('#tut-comecar').onclick=function(){gravando=true;c.querySelector('#tut-rec-msg').textContent=modoRapido?'🔴 Gravando: clique e escreva normalmente.':'🔴 Gravando com explicações.';this.disabled=true;};
    c.querySelector('#tut-limpar-prep').onclick=function(){atual.preparacao=[];aviso('Preparação apagada.');};
    var f=document.getElementById('tut-frame');f.onload=function(){aplicarVisao(f);ligarGravadorFrame(f);};
  }
  function etapaBase(el,d){var ac=/^(INPUT|TEXTAREA)$/.test(el.tagName)?(el.type==='checkbox'?'check':'fill'):(el.tagName==='SELECT'?'select':'click');return {selector:selector(el,d),alvoNome:nomeElemento(el),acao:ac,regra:ac==='fill'||ac==='select'?'exato':(ac==='check'?(el.checked?'marcado':'desmarcado'):'acao'),valor:'',instrucao:'',observacao:'',erro:'Faça exatamente como foi pedido para continuar.'};}
  function ligarGravadorFrame(f){
    var d=f.contentDocument;if(!d)return;
    function guardar(x){if(!gravando){atual.preparacao.push({selector:x.selector,acao:x.acao,valor:x.valor});return;}if(modoRapido){atual.etapas.push(x);desenharEtapas();}else formEtapa(x);}
    function campo(el){if(el.dataset.tutOuvindo)return;el.dataset.tutOuvindo='1';var evento=el.tagName==='SELECT'||el.type==='checkbox'?'change':'blur';el.addEventListener(evento,function(){var x=etapaBase(el,d);x.valor=el.type==='checkbox'?String(!!el.checked):String(el.value||'').trim();x.instrucao=x.acao==='fill'?'Escreva “'+x.valor+'” em '+x.alvoNome:(x.acao==='select'?'Escolha “'+x.valor+'” em '+x.alvoNome:(el.checked?'Marque ':'Desmarque ')+x.alvoNome);guardar(x);},{once:true});}
    d.addEventListener('focusin',function(ev){var el=ev.target;if(/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))campo(el);},true);
    d.addEventListener('click',function(ev){var el=ev.target.closest('button,a,input,select,textarea,[role="button"]')||ev.target;if(/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)){campo(el);return;}var x=etapaBase(el,d);x.instrucao='Toque em '+x.alvoNome;guardar(x);},true);
  }
  function formEtapa(x){
    var c=document.getElementById('tut-form-slot')||document.getElementById('tut-captura');c.innerHTML='<div class="tut-form"><h3>'+(etapaEditada>=0?'Editar etapa':'Nova etapa')+'</h3><p class="tut-muted">Elemento: <b>'+E(x.alvoNome)+'</b></p><label>Orientação para a pessoa<textarea id="te-inst" class="tut-input" placeholder="Ex.: Toque em Cadastrar nova peça">'+E(x.instrucao)+'</textarea></label><label>Observação / dica<textarea id="te-obs" class="tut-input" placeholder="Opcional">'+E(x.observacao||'')+'</textarea></label><div class="tut-grid"><label>Ação<select id="te-acao" class="tut-input"><option value="click">Tocar</option><option value="fill">Preencher</option><option value="select">Escolher opção</option><option value="check">Marcar/desmarcar</option></select></label><label>Como avaliar<select id="te-regra" class="tut-input"><option value="acao">Realizou a ação</option><option value="exato">Valor exatamente igual</option><option value="um_de">Uma das opções permitidas</option><option value="preenchido">Preencheu qualquer valor</option><option value="marcado">Ficou marcado</option><option value="desmarcado">Ficou desmarcado</option></select></label></div><label>Valor correto ou opções (separe opções por |)<input id="te-valor" class="tut-input" value="'+E(x.valor||'')+'"></label><label>Mensagem se errar<input id="te-erro" class="tut-input" value="'+E(x.erro||'')+'"></label><div class="tut-actions"><button class="tut-btn" id="te-ok">Salvar etapa</button><button class="tut-btn sec" id="te-cancel">Cancelar</button></div></div>';
    c.querySelector('#te-acao').value=x.acao;c.querySelector('#te-regra').value=x.regra;
    c.querySelector('#te-cancel').onclick=function(){etapaEditada=-1;c.innerHTML='';};
    c.querySelector('#te-ok').onclick=function(){x.instrucao=c.querySelector('#te-inst').value.trim();if(!x.instrucao){aviso('Escreva a orientação da etapa.');return;}x.observacao=c.querySelector('#te-obs').value.trim();x.acao=c.querySelector('#te-acao').value;x.regra=c.querySelector('#te-regra').value;x.valor=c.querySelector('#te-valor').value.trim();x.erro=c.querySelector('#te-erro').value.trim();if(etapaEditada>=0)atual.etapas[etapaEditada]=x;else atual.etapas.push(x);etapaEditada=-1;c.innerHTML='';desenharEtapas();};
  }
  function formTextoFlutuante(x){x=x||{acao:'texto',regra:'acao',selector:'',alvoNome:'Texto flutuante',instrucao:'',observacao:'',valor:'',erro:'',estilo:{negrito:true,italico:false,sublinhado:false,tamanho:18,cor:'#1C1B18',fundo:'#FFF3CD',borda:'#E67E22',posicao:'topo'}};var c=document.getElementById('tut-captura');c.innerHTML='<div class="tut-form"><h3>💬 Texto flutuante</h3><label>Texto<textarea id="tf-texto" class="tut-input">'+E(x.instrucao)+'</textarea></label><div class="tut-grid"><label>Tamanho<input id="tf-tam" type="number" min="12" max="36" class="tut-input" value="'+E(x.estilo&&x.estilo.tamanho||18)+'"></label><label>Cor do texto<input id="tf-cor" type="color" class="tut-input" value="'+E(x.estilo&&x.estilo.cor||'#1C1B18')+'"></label><label>Cor da caixa<input id="tf-fundo" type="color" class="tut-input" value="'+E(x.estilo&&x.estilo.fundo||'#FFF3CD')+'"></label><label>Cor da borda<input id="tf-borda" type="color" class="tut-input" value="'+E(x.estilo&&x.estilo.borda||'#E67E22')+'"></label><label>Posição<select id="tf-pos" class="tut-input"><option value="topo">Topo</option><option value="centro">Centro</option><option value="base">Base</option></select></label></div><div class="tut-actions"><label><input id="tf-b" type="checkbox"> Negrito</label><label><input id="tf-i" type="checkbox"> Itálico</label><label><input id="tf-u" type="checkbox"> Sublinhado</label></div><button class="tut-btn" id="tf-ok">Salvar texto</button></div>';var e=x.estilo||{};c.querySelector('#tf-pos').value=e.posicao||'topo';c.querySelector('#tf-b').checked=!!e.negrito;c.querySelector('#tf-i').checked=!!e.italico;c.querySelector('#tf-u').checked=!!e.sublinhado;c.querySelector('#tf-ok').onclick=function(){x.instrucao=c.querySelector('#tf-texto').value.trim();if(!x.instrucao){aviso('Escreva o texto flutuante.');return;}x.estilo={tamanho:Math.max(12,Math.min(36,+c.querySelector('#tf-tam').value||18)),cor:c.querySelector('#tf-cor').value,fundo:c.querySelector('#tf-fundo').value,borda:c.querySelector('#tf-borda').value,posicao:c.querySelector('#tf-pos').value,negrito:c.querySelector('#tf-b').checked,italico:c.querySelector('#tf-i').checked,sublinhado:c.querySelector('#tf-u').checked};if(etapaEditada>=0)atual.etapas[etapaEditada]=x;else atual.etapas.push(x);etapaEditada=-1;c.innerHTML='';desenharEtapas();};}
  async function salvar(status){
    lerCabecalho();if(!atual.titulo){aviso('Dê um título ao tutorial.');return;}if(!atual.etapas.length){aviso('Adicione pelo menos uma etapa.');return;}
    atual.status=status;var r=await api({action:'tutorial_salvar',tutorial:atual});if(!r||!r.ok){aviso((r&&r.erro)||'Não foi possível salvar.');return;}atual=r.tutorial;var i=tutoriais.findIndex(function(x){return x.id===atual.id;});if(i<0)tutoriais.push(atual);else tutoriais[i]=atual;aviso(status==='publicado'?'Tutorial publicado.':'Rascunho salvo.');document.getElementById('tut-modal').remove();desenharLista();
  }
  function valida(el,x){var v=('value'in el?String(el.value):'').trim();if(x.regra==='exato')return v===x.valor;if(x.regra==='um_de')return x.valor.split('|').map(function(z){return z.trim();}).indexOf(v)>=0;if(x.regra==='preenchido')return !!v;if(x.regra==='marcado')return !!el.checked;if(x.regra==='desmarcado')return !el.checked;return true;}
  function abrirTeste(t){
    if(!t||!t.etapas.length){aviso('Este tutorial ainda não tem etapas.');return;}var n=0,erros=0,inicio=Date.now(),m=document.createElement('div');m.className='tut-modal';m.id='tut-teste';m.innerHTML='<div class="tut-modal-card"><div class="tut-actions"><button class="tut-btn sec" id="tt-fechar">Fechar teste</button><b>'+E(t.titulo)+'</b></div><div id="tt-guia"></div><div class="tut-frame-wrap"><iframe class="tut-frame" id="tt-frame" title="Teste do tutorial" src="'+E(t.pagina)+'?tutorial_teste=1"></iframe></div></div>';document.body.appendChild(m);m.querySelector('#tt-fechar').onclick=function(){m.remove();};
    var f=m.querySelector('#tt-frame'),guia=m.querySelector('#tt-guia'),removerBloqueio=null;
    function limparBloqueio(){if(removerBloqueio){removerBloqueio();removerBloqueio=null;}}
    function erroDeToque(x){
      erros++;
      var antigo=guia.querySelector('[data-tut-erro-toque]');if(antigo)antigo.remove();
      guia.insertAdjacentHTML('afterbegin','<div class="tut-status err" data-tut-erro-toque>'+E(x.erro||'Esse não é o botão desta etapa. Toque somente no controle destacado.')+'</div>');
    }
    function bloquearOutros(d,el,x){
      limparBloqueio();
      var bloquear=function(ev){
        var dentro=el&&(ev.target===el||el.contains(ev.target));if(dentro)return;
        ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation();
        if(ev.type==='click')erroDeToque(x);
      };
      ['click','submit','change','input'].forEach(function(tipo){d.addEventListener(tipo,bloquear,true);});
      removerBloqueio=function(){['click','submit','change','input'].forEach(function(tipo){d.removeEventListener(tipo,bloquear,true);});};
    }
    function concluir(){limparBloqueio();n++;delete f.dataset.passo;if(n>=t.etapas.length){guia.innerHTML='<div class="tut-status ok"><b>Tutorial concluído corretamente.</b> '+(erros?'Você corrigiu '+erros+' tentativa(s).':'Acertou todas as etapas de primeira.')+'</div>';api({action:'tutorial_resultado',tutorialId:t.id,versao:t.versao||1,acertos:t.etapas.length,erros:erros,duracaoSeg:Math.round((Date.now()-inicio)/1000)});return true;}return false;}
    function passo(){if(f.dataset.passo===String(n))return;f.dataset.passo=String(n);var x=t.etapas[n],est=x.estilo||{};if(x.acao==='texto'){limparBloqueio();var sty='font-size:'+(est.tamanho||18)+'px;color:'+(est.cor||'#1C1B18')+';background:'+(est.fundo||'#FFF3CD')+';border:3px solid '+(est.borda||'#E67E22')+';font-weight:'+(est.negrito?'800':'400')+';font-style:'+(est.italico?'italic':'normal')+';text-decoration:'+(est.sublinhado?'underline':'none');guia.innerHTML='<div class="tut-float-preview" style="'+sty+'">'+E(x.instrucao)+'</div><button class="tut-btn" id="tt-cont">Continuar</button>';guia.querySelector('#tt-cont').onclick=function(){if(!concluir())passo();};return;}guia.innerHTML='<div class="tut-status"><b>Etapa '+(n+1)+' de '+t.etapas.length+':</b> '+E(x.instrucao)+(x.observacao?'<br><span class="tut-muted">💡 '+E(x.observacao)+'</span>':'')+'</div>';var d=f.contentDocument,el;try{el=d.querySelector(x.selector);}catch(e){}bloquearOutros(d,el,x);if(!el){delete f.dataset.passo;guia.innerHTML+='<div class="tut-status err">Aguarde: estou abrindo o local desta etapa.</div>';setTimeout(passo,300);return;}el.scrollIntoView({block:'center'});el.style.outline='4px solid #E67E22';el.style.outlineOffset='4px';var evento=x.acao==='fill'?'input':(x.acao==='select'?'change':'click');var ouvir=function(ev){if(ev.target!==el&&!el.contains(ev.target))return;if(!valida(el,x)){erros++;guia.insertAdjacentHTML('afterbegin','<div class="tut-status err">'+E(x.erro||'Ainda não está correto. Tente novamente.')+'</div>');return;}el.removeEventListener(evento,ouvir,true);el.style.outline='';if(!concluir())setTimeout(passo,350);};el.addEventListener(evento,ouvir,true);}
    var preparado=false;
    function preparar(i){var lista=t.preparacao||[];if(i>=lista.length){preparado=true;delete f.dataset.passo;passo();return;}var x=lista[i],d=f.contentDocument,el;try{el=d.querySelector(x.selector);}catch(e){}if(!el){preparar(i+1);return;}if(x.acao==='fill'||x.acao==='select'){el.value=x.valor||'';el.dispatchEvent(new Event(x.acao==='select'?'change':'input',{bubbles:true}));}else if(x.acao==='check'){el.checked=x.valor==='true';el.dispatchEvent(new Event('change',{bubbles:true}));}else el.click();setTimeout(function(){preparar(i+1);},250);}
    f.onload=function(){limparBloqueio();delete f.dataset.passo;if(!preparado)preparar(0);else passo();};
  }
})();
