/* TENKiTER — gravador visual de tutoriais no aplicativo (v1).
 * O editor escolhe elementos numa prévia da tela real. O modo de teste bloqueia
 * navegação/envio e apenas confere se a pessoa fez a ação definida. */
(function(){
  'use strict';
  var T = window.TKTutorial = {}, cfg = null, tutoriais = [], atual = null, etapaEditada = -1;
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
  function novo(){ return {id:idNovo(),titulo:'',descricao:'',pagina:'index.html',status:'rascunho',versao:1,etapas:[]}; }
  function labelAcao(a){ return {click:'Tocar',fill:'Preencher',select:'Escolher',check:'Marcar'}[a]||a; }
  function rotas(){ return [
    ['index.html','Catálogo'],['admin.html','Gestão / cadastro'],['treinamentos.html','Treinamentos'],
    ['curriculo.html','Currículo'],['curriculos.html','Gestão de currículos'],
    ['treinamento-postagens-real.html','Prática de postagens']
  ]; }
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
    m.innerHTML='<div class="tut-modal-card"><div class="tut-actions"><button class="tut-btn sec" id="tut-fechar">← Voltar</button><button class="tut-btn" id="tut-salvar">Salvar rascunho</button><button class="tut-btn" id="tut-publicar">Publicar</button></div><div class="tut-grid"><label>Título<input id="tut-titulo" class="tut-input" value="'+E(atual.titulo)+'"></label><label>Tela<select id="tut-pagina" class="tut-input">'+rotas().map(function(r){return '<option value="'+r[0]+'"'+(r[0]===atual.pagina?' selected':'')+'>'+r[1]+'</option>';}).join('')+'</select></label></div><label>Descrição<textarea id="tut-desc" class="tut-input">'+E(atual.descricao)+'</textarea></label><div id="tut-etapas"></div><button class="tut-btn" id="tut-gravar">🎯 Selecionar elemento na tela</button><div id="tut-captura"></div><div class="tut-actions"><button class="tut-btn sec" id="tut-testar">▶ Testar tutorial inteiro</button></div></div>';
    document.body.appendChild(m); desenharEtapas();
    m.querySelector('#tut-fechar').onclick=function(){m.remove();};
    m.querySelector('#tut-pagina').onchange=function(){atual.pagina=this.value;};
    m.querySelector('#tut-gravar').onclick=abrirCaptura;
    m.querySelector('#tut-testar').onclick=function(){lerCabecalho();abrirTeste(atual);};
    m.querySelector('#tut-salvar').onclick=function(){salvar('rascunho');};
    m.querySelector('#tut-publicar').onclick=function(){salvar('publicado');};
  }
  function lerCabecalho(){atual.titulo=document.getElementById('tut-titulo').value.trim();atual.descricao=document.getElementById('tut-desc').value.trim();atual.pagina=document.getElementById('tut-pagina').value;}
  function desenharEtapas(){
    var box=document.getElementById('tut-etapas');if(!box)return;
    box.innerHTML='<h3>Etapas ('+atual.etapas.length+')</h3>'+(atual.etapas.length?atual.etapas.map(function(x,i){return '<article class="tut-linha"><div class="tut-linha-top"><b>'+(i+1)+'. '+E(x.instrucao)+'</b><span class="tut-chip">'+E(labelAcao(x.acao))+'</span></div><p class="tut-muted">Alvo: '+E(x.alvoNome)+' · Regra: '+E(x.regra)+(x.valor?' · Valor: '+E(x.valor):'')+'</p><div class="tut-actions"><button class="tut-btn sec" data-up="'+i+'">↑</button><button class="tut-btn sec" data-down="'+i+'">↓</button><button class="tut-btn sec" data-ed="'+i+'">Editar</button><button class="tut-btn danger" data-rm="'+i+'">Remover</button></div></article>';}).join(''):'<p class="tut-muted">Selecione o primeiro elemento na tela.</p>');
    box.querySelectorAll('[data-up]').forEach(function(b){b.onclick=function(){mover(+b.dataset.up,-1);};}); box.querySelectorAll('[data-down]').forEach(function(b){b.onclick=function(){mover(+b.dataset.down,1);};});
    box.querySelectorAll('[data-rm]').forEach(function(b){b.onclick=function(){atual.etapas.splice(+b.dataset.rm,1);desenharEtapas();};});
    box.querySelectorAll('[data-ed]').forEach(function(b){b.onclick=function(){etapaEditada=+b.dataset.ed;formEtapa(atual.etapas[etapaEditada]);};});
  }
  function mover(i,d){var j=i+d;if(j<0||j>=atual.etapas.length)return;var x=atual.etapas.splice(i,1)[0];atual.etapas.splice(j,0,x);desenharEtapas();}
  function abrirCaptura(){
    lerCabecalho();var c=document.getElementById('tut-captura');c.innerHTML='<div class="tut-frame-wrap"><div class="tut-rec">Modo Gravar: toque no elemento que a pessoa deverá usar. Nada será enviado ou publicado.</div><iframe class="tut-frame" id="tut-frame" title="Tela para gravar tutorial" src="'+E(atual.pagina)+'?tutorial_editor=1"></iframe></div>';
    var f=document.getElementById('tut-frame');f.onload=function(){var d=f.contentDocument;if(!d)return;d.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();var el=ev.target.closest('button,a,input,select,textarea,label,[role="button"]')||ev.target;var x={selector:selector(el,d),alvoNome:nomeElemento(el),acao:(/^(INPUT|TEXTAREA)$/.test(el.tagName)?(el.type==='checkbox'?'check':'fill'):(el.tagName==='SELECT'?'select':'click')),regra:'acao',valor:'',instrucao:'',observacao:'',erro:'Tente novamente seguindo a orientação.'};formEtapa(x);},true);};
  }
  function formEtapa(x){
    var c=document.getElementById('tut-captura');c.innerHTML='<div class="tut-form"><h3>'+(etapaEditada>=0?'Editar etapa':'Nova etapa')+'</h3><p class="tut-muted">Elemento: <b>'+E(x.alvoNome)+'</b></p><label>Orientação para a pessoa<textarea id="te-inst" class="tut-input" placeholder="Ex.: Toque em Cadastrar nova peça">'+E(x.instrucao)+'</textarea></label><label>Observação / dica<textarea id="te-obs" class="tut-input" placeholder="Opcional">'+E(x.observacao||'')+'</textarea></label><div class="tut-grid"><label>Ação<select id="te-acao" class="tut-input"><option value="click">Tocar</option><option value="fill">Preencher</option><option value="select">Escolher opção</option><option value="check">Marcar/desmarcar</option></select></label><label>Como avaliar<select id="te-regra" class="tut-input"><option value="acao">Realizou a ação</option><option value="exato">Valor exatamente igual</option><option value="um_de">Uma das opções permitidas</option><option value="preenchido">Preencheu qualquer valor</option><option value="marcado">Ficou marcado</option><option value="desmarcado">Ficou desmarcado</option></select></label></div><label>Valor correto ou opções (separe opções por |)<input id="te-valor" class="tut-input" value="'+E(x.valor||'')+'"></label><label>Mensagem se errar<input id="te-erro" class="tut-input" value="'+E(x.erro||'')+'"></label><div class="tut-actions"><button class="tut-btn" id="te-ok">Adicionar etapa</button><button class="tut-btn sec" id="te-cancel">Cancelar</button></div></div>';
    c.querySelector('#te-acao').value=x.acao;c.querySelector('#te-regra').value=x.regra;
    c.querySelector('#te-cancel').onclick=function(){etapaEditada=-1;c.innerHTML='';};
    c.querySelector('#te-ok').onclick=function(){x.instrucao=c.querySelector('#te-inst').value.trim();if(!x.instrucao){aviso('Escreva a orientação da etapa.');return;}x.observacao=c.querySelector('#te-obs').value.trim();x.acao=c.querySelector('#te-acao').value;x.regra=c.querySelector('#te-regra').value;x.valor=c.querySelector('#te-valor').value.trim();x.erro=c.querySelector('#te-erro').value.trim();if(etapaEditada>=0)atual.etapas[etapaEditada]=x;else atual.etapas.push(x);etapaEditada=-1;c.innerHTML='';desenharEtapas();};
  }
  async function salvar(status){
    lerCabecalho();if(!atual.titulo){aviso('Dê um título ao tutorial.');return;}if(!atual.etapas.length){aviso('Adicione pelo menos uma etapa.');return;}
    atual.status=status;var r=await api({action:'tutorial_salvar',tutorial:atual});if(!r||!r.ok){aviso((r&&r.erro)||'Não foi possível salvar.');return;}atual=r.tutorial;var i=tutoriais.findIndex(function(x){return x.id===atual.id;});if(i<0)tutoriais.push(atual);else tutoriais[i]=atual;aviso(status==='publicado'?'Tutorial publicado.':'Rascunho salvo.');document.getElementById('tut-modal').remove();desenharLista();
  }
  function valida(el,x){var v=('value'in el?String(el.value):'').trim();if(x.regra==='exato')return v===x.valor;if(x.regra==='um_de')return x.valor.split('|').map(function(z){return z.trim();}).indexOf(v)>=0;if(x.regra==='preenchido')return !!v;if(x.regra==='marcado')return !!el.checked;if(x.regra==='desmarcado')return !el.checked;return true;}
  function abrirTeste(t){
    if(!t||!t.etapas.length){aviso('Este tutorial ainda não tem etapas.');return;}var n=0,erros=0,inicio=Date.now(),m=document.createElement('div');m.className='tut-modal';m.id='tut-teste';m.innerHTML='<div class="tut-modal-card"><div class="tut-actions"><button class="tut-btn sec" id="tt-fechar">Fechar teste</button><b>'+E(t.titulo)+'</b></div><div id="tt-guia"></div><div class="tut-frame-wrap"><iframe class="tut-frame" id="tt-frame" title="Teste do tutorial" src="'+E(t.pagina)+'?tutorial_teste=1"></iframe></div></div>';document.body.appendChild(m);m.querySelector('#tt-fechar').onclick=function(){m.remove();};
    var f=m.querySelector('#tt-frame'),guia=m.querySelector('#tt-guia');
    function passo(){var x=t.etapas[n];guia.innerHTML='<div class="tut-status"><b>Etapa '+(n+1)+' de '+t.etapas.length+':</b> '+E(x.instrucao)+(x.observacao?'<br><span class="tut-muted">💡 '+E(x.observacao)+'</span>':'')+'</div>';var d=f.contentDocument,el;try{el=d.querySelector(x.selector);}catch(e){}if(!el){guia.innerHTML+='<div class="tut-status err">O elemento desta etapa mudou ou não apareceu nesta tela.</div>';return;}el.scrollIntoView({block:'center'});el.style.outline='4px solid #E67E22';el.style.outlineOffset='4px';var evento=x.acao==='fill'?'input':(x.acao==='select'?'change':'click');var ouvir=function(ev){if(ev.target!==el&&!el.contains(ev.target))return;if(evento==='click'){ev.preventDefault();ev.stopPropagation();}if(!valida(el,x)){erros++;guia.innerHTML='<div class="tut-status err">'+E(x.erro||'Ainda não está correto. Tente novamente.')+'</div>'+guia.innerHTML;return;}el.removeEventListener(evento,ouvir,true);el.style.outline='';n++;if(n>=t.etapas.length){guia.innerHTML='<div class="tut-status ok"><b>Tutorial concluído corretamente.</b> '+(erros?'Você corrigiu '+erros+' tentativa(s).':'Acertou todas as etapas de primeira.')+'</div>';api({action:'tutorial_resultado',tutorialId:t.id,versao:t.versao||1,acertos:t.etapas.length,erros:erros,duracaoSeg:Math.round((Date.now()-inicio)/1000)});return;}passo();};el.addEventListener(evento,ouvir,true);}
    f.onload=passo;
  }
})();
