/* Configuração central de acessos. Credenciais e chamadas permanecem no portal. */
(function () {
  'use strict';
  var s = { carregado:false, modelos:[], permissoes:[], revisao:0, draft:null, dirty:false, busy:false, erro:'', aviso:'', busca:'' }, api;
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); };
  function sair() { return !s.busy && (!s.dirty || window.confirm('Descartar as alterações deste acesso?')); }
  function redesenhar(foco) { var root=document.getElementById('rh-modelos');if(!root)return;root.innerHTML=conteudo();ligar();if(foco){var el=document.getElementById(foco);if(el)el.focus();} }
  function mesclarLegados() {
    if(!s.legado){if(s.legado===null)s.modelos.forEach(function(m){if(!m.configurado&&!m.protegido)m.indisponivel=true;});return;}
    s.modelos.forEach(function(m){
      delete m.indisponivel;
      if(m.configurado||m.protegido)return;
      var nome=m.nome.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
      var regras=(s.legado.regras.perfis||{})[nome]||{};
      Object.keys(regras).forEach(function(k){if(typeof regras[k]==='boolean')m.permissoes['msg_'+k]=regras[k];});
    });
  }
  function receber(j) { s.modelos=j.modelos||[];s.permissoes=j.permissoes||[];s.revisao=j.revisao;s.carregado=true;s.erro='';mesclarLegados(); }
  async function carregar() {
    if(s.busy)return;s.busy=true;s.erro='';redesenhar();
    try { var j=await api.req({action:'acessos_modelos_listar'});if(!j||!j.ok)throw Error(j&&j.erro||'Não foi possível carregar os acessos.');receber(j);
      try { s.legado=await api.legados();mesclarLegados(); } catch(e) {s.legado=null;s.modelos.forEach(function(m){if(!m.configurado&&!m.protegido)m.indisponivel=true;});s.erro='Não foi possível conferir os ajustes antigos do Mensageiro. Atualize a lista para editar os acessos existentes.';}
    }
    catch(e){s.erro=e.message;}finally{s.busy=false;redesenhar();}
  }
  function selecionar(i) {
    if(!sair())return;
    s.draft=i===-1?{nome:'',desc:'',permissoes:{cliente:true},pessoas:0}:JSON.parse(JSON.stringify(s.modelos[i]));
    s.draft.original=i===-1?'':s.draft.nome;
    if(s.draft.indisponivel){s.erro='Atualize a lista para conferir os ajustes antigos do Mensageiro antes de editar este acesso.';s.draft=null;return redesenhar();}s.dirty=false;s.erro='';s.aviso='';redesenhar('rp-nome');
  }
  function conteudo() {
    if(!api.disponivel())return '<div class="rp-estado"><h2>Permissões por acesso</h2><p>Esta configuração precisa da atualização do servidor de acessos. As permissões atuais continuam disponíveis em Acessos.</p><button type="button" id="rp-atualizar">Verificar novamente</button></div>';
    if(!s.carregado)return '<div class="rp-estado" role="status"><p>'+esc(s.erro||'Carregando os acessos…')+'</p>'+(!s.busy?'<button id="rp-atualizar">Tentar de novo</button>':'')+'</div>';
    var feedback=(s.erro?'<p class="rp-erro" role="alert">'+esc(s.erro)+'</p>'+(s.draft?'<button type="button" id="rp-recarregar">Atualizar a lista</button>':''):'')+(s.aviso?'<p class="rp-sucesso" role="status">'+esc(s.aviso)+'</p>':'');
    if(!s.draft)return '<div class="rp-cab"><div><h2>Permissões por acesso</h2><p>Configure o que cada acesso permite. As pessoas recebem a soma dos seus acessos, com os ajustes individuais preservados.</p></div><button type="button" class="rp-prim" id="rp-novo"'+(s.busy?' disabled':'')+'>+ Novo acesso</button></div><button type="button" id="rp-recarregar">Atualizar lista</button>'+feedback+'<label class="rp-busca">Buscar acesso<input type="search" id="rp-busca" class="tk-busca" value="'+esc(s.busca)+'" placeholder="Nome ou descrição"></label><div id="rp-lista">'+lista()+'</div>';
    var d=s.draft, grupos={};s.permissoes.forEach(function(p){(grupos[p.grupo]||(grupos[p.grupo]=[])).push(p);});
    var campos=Object.keys(grupos).map(function(g){var itens=grupos[g],q=itens.filter(function(p){return d.permissoes[p.chave];}).length;return '<details class="rp-grupo"><summary>'+esc(g)+' <span>'+q+' de '+itens.length+'</span></summary><div>'+itens.map(function(p){return '<label class="rp-perm"><input type="checkbox" data-rp-chave="'+esc(p.chave)+'"'+(d.permissoes[p.chave]?' checked':'')+(d.protegido||p.chave==='gerir_acessos'||p.chave==='cliente'?' disabled':'')+'><span>'+esc(p.rotulo)+'</span></label>';}).join('')+'</div></details>';}).join('');
    var excluir=d.original&&!d.protegido?'<details class="rp-excluir"><summary>Excluir este acesso</summary><p>As pessoas vinculadas precisam receber outro acesso. Os ajustes individuais serão mantidos.</p><label>Substituir por<select id="rp-substituto"><option value="">Escolha um acesso</option>'+s.modelos.filter(function(m){return m.nome!==d.original&&!m.permissoes.gerir_acessos;}).map(function(m){return '<option>'+esc(m.nome)+'</option>';}).join('')+'</select></label><button type="button" id="rp-excluir">Excluir acesso</button></details>':'';
    return '<button type="button" id="rp-voltar">← Todos os acessos</button><div class="rp-cab"><div><h2>'+esc(d.original||'Novo acesso')+'</h2><p>'+(d.protegido?'Acesso protegido: consulte as permissões abaixo.':d.pessoas+' pessoa(s) vinculada(s). Alterações valem para todas elas.')+'</p></div></div>'+feedback+'<form id="rp-form"><fieldset'+(d.protegido||s.busy?' disabled':'')+'><div class="rp-ident"><label>Nome do acesso<input id="rp-nome" required minlength="2" maxlength="60" value="'+esc(d.nome)+'"></label><label>Descrição<textarea id="rp-desc" maxlength="300" rows="2">'+esc(d.desc)+'</textarea></label></div><p class="rp-nota">Abra uma área para configurar suas permissões. Esteira ativa inclui a pessoa no rodízio. Para usar o Postador, permita também entrar no admin do catálogo. Administração total é atribuída pelo acesso protegido Admin total.</p>'+campos+'</fieldset>'+(!d.protegido?'<div class="rp-acoes"><button type="submit" class="rp-prim"'+(s.busy?' disabled':'')+'>'+(s.busy?'Salvando…':'Salvar acesso')+'</button><button type="button" id="rp-cancelar"'+(s.busy?' disabled':'')+'>Cancelar</button></div>':'')+'</form>'+excluir;
  }
  function lista() {
    var q=s.busca.toLocaleLowerCase('pt-BR'),html=s.modelos.map(function(m,i){if((m.nome+' '+m.desc).toLocaleLowerCase('pt-BR').indexOf(q)===-1)return '';return '<button type="button" class="rp-linha" data-rp-modelo="'+i+'"><span><strong>'+esc(m.nome)+'</strong><small>'+esc(m.desc||'Sem descrição')+'</small></span><span class="rp-meta">'+m.pessoas+' pessoa(s)'+(m.protegido?' · Protegido':'')+'<span aria-hidden="true"> →</span></span></button>';}).join('');
    return html||'<p class="rp-estado">Nenhum acesso encontrado. Busque outro nome ou crie um acesso.</p>';
  }
  async function gravar(excluir) {
    if(s.busy)return;var d=s.draft;
    var req={action:excluir?'acessos_modelos_excluir':'acessos_modelos_salvar',original:d.original,revisao:s.revisao,nome:d.nome,desc:d.desc,permissoes:Object.keys(d.permissoes).filter(function(k){return d.permissoes[k];})};
    if(excluir){req.substituirPor=document.getElementById('rp-substituto').value;if(d.pessoas&&!req.substituirPor){s.erro='Escolha um acesso para as pessoas vinculadas.';return redesenhar();}}
    if(!window.confirm(excluir?'Excluir “'+d.original+'”'+(req.substituirPor?' e substituí-lo por “'+req.substituirPor+'”':'')+'?':'Salvar “'+d.nome+'”? A configuração será aplicada às '+d.pessoas+' pessoa(s) vinculada(s).'))return;
    s.busy=true;s.erro='';redesenhar();
    try {var j=await api.req(req);if(!j||!j.ok)throw Error(j&&j.erro||'Não foi possível salvar. Suas alterações continuam nesta tela.');receber(j);s.draft=null;s.dirty=false;s.aviso=excluir?'Acesso excluído.':'Acesso salvo. As configurações foram atualizadas.';api.atualizado();}
    catch(e){s.erro=e.message;}finally{s.busy=false;redesenhar(s.draft?'rp-nome':'rp-novo');}
  }
  function ligarLista(){document.querySelectorAll('[data-rp-modelo]').forEach(function(b){b.onclick=function(){selecionar(Number(b.dataset.rpModelo));};});}
  function ligar() {
    function click(id,fn){var e=document.getElementById(id);if(e)e.onclick=fn;}
    click('rp-atualizar',async function(){if(api.disponivel())return carregar();await api.verificar();redesenhar();if(api.disponivel())carregar();});
    click('rp-recarregar',function(){if(!sair())return;s.draft=null;s.dirty=false;carregar();});
    click('rp-novo',function(){selecionar(-1);});ligarLista();
    function voltar(){if(!sair())return;s.draft=null;s.dirty=false;s.erro='';redesenhar('rp-novo');}
    click('rp-voltar',voltar);click('rp-cancelar',voltar);click('rp-excluir',function(){gravar(true);});
    var busca=document.getElementById('rp-busca');if(busca)busca.oninput=function(){s.busca=this.value;document.getElementById('rp-lista').innerHTML=lista();ligarLista();};
    ['nome','desc'].forEach(function(k){var e=document.getElementById('rp-'+k);if(e)e.oninput=function(){s.draft[k]=this.value;s.dirty=true;};});
    document.querySelectorAll('[data-rp-chave]').forEach(function(e){e.onchange=function(){s.draft.permissoes[this.dataset.rpChave]=this.checked;s.dirty=true;var dt=this.closest('details'),total=dt.querySelectorAll('[data-rp-chave]').length,n=dt.querySelectorAll('[data-rp-chave]:checked').length;dt.querySelector('summary span').textContent=n+' de '+total;};});
    var f=document.getElementById('rp-form');if(f)f.onsubmit=function(e){e.preventDefault();gravar(false);};
  }
  window.addEventListener('beforeunload',function(e){if(s.dirty||s.busy){e.preventDefault();e.returnValue='';}});
  window.TKPermissoes={configurar:function(a){api=a;},render:function(){return '<section class="admin-panel" id="rh-modelos" aria-label="Permissões por acesso">'+conteudo()+'</section>';},ligar:function(){ligar();if(api.disponivel()&&!s.carregado&&!s.busy)carregar();},podeSair:function(){if(!sair())return false;s.draft=null;s.dirty=false;return true;}};
})();
