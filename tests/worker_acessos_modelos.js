/* Mesmo D1 SQLite da regressão da Esteira; sessões e catálogo simulados. */
const fs=require('fs'),path=require('path'),vm=require('vm');
let harness=fs.readFileSync(path.join(__dirname,'worker_esteira.js'),'utf8').replace(/\r/g,'').split('  // acesso\n')[0];
harness=harness.replace('tk_ig_esteira.mjs','tk_ig_acessos_modelos.mjs').replace('estFornecedorLimpo_};','estFornecedorLimpo_,msgDireitos_,estEscalaDoDia_};');
const cenarios=String.raw`
  let legado=false;let equipe=[{whats:IARA,nome:'Iara',ativo:1,confere:1,rodizio:1,aceitar:0}],fora=false;
  const fetchAntigo=globalThis.fetch;
  globalThis.fetch=async(u,init)=>{
    if(String(u).startsWith('https://rh.fake/')){const b={...JSON.parse(init.body),token:undefined};if(b.action==='esteira_equipe')return new Response(JSON.stringify(fora?{ok:false}:{ok:true,fonte:'acessos',equipe}));return fetchAntigo('https://api.fake/',{...init,body:JSON.stringify(b)});}
    if(legado&&String(u).startsWith('https://api.fake/')&&init?.method==='POST'&&JSON.parse(init.body).action==='sessao'){const rr=await fetchAntigo(u,init),jj=await rr.json();if(jj.usuario){delete jj.usuario.acessosConfiguraveis;jj.usuario.permissoes=jj.usuario.permissoes.filter(k=>k==='catalogo_cadastrar'||k==='catalogo_admin');}return new Response(JSON.stringify(jj));}
    if(String(u).startsWith('https://api.fake/')&&init?.method==='POST'&&JSON.parse(init.body).action==='esteira_equipe')return new Response(JSON.stringify(fora?{ok:false}:{ok:true,fonte:'acessos',equipe}));
    return fetchAntigo(u,init);
  };
  for(const u of Object.values(usuarios))u.acessosConfiguraveis=true;
  usuarios[IARA].permissoes=['esteira'];
  let r=await A(PABLO,'GET','/esteira/config');
  chk('equipe vem dos acessos, sem cadastro paralelo',r.j.ok&&r.j.fonteEquipe==='acessos'&&r.j.equipe.length===1&&r.j.equipe[0].whats===IARA,r.j);
  await env.DB.prepare("INSERT INTO est_equipe(whats,nome,ativo,confere,rodizio) VALUES (?, 'Legado',1,1,1)").bind(CLARICE).run();
  r=await A(CLARICE,'GET','/esteira/hoje');chk('cadastro antigo não concede Esteira sem permissão',r.r.status===403,r.j);
  r=await A(IARA,'GET','/esteira/hoje');
  chk('Esteira isolada concede lista e tarefas sem permissão de editar catálogo',r.j.ok&&r.j.total===20&&r.j.funcoes.length===4,r.j);
  const dupla=[...equipe,{whats:VISITA,nome:'Nova colega',ativo:1,rodizio:1}];
  const escala1=await W.estEscalaDoDia_(env,'2026-11-04',{funcoes:['Fotos','Caixa']},dupla),escala2=await W.estEscalaDoDia_(env,'2026-11-05',{funcoes:['Fotos','Caixa']},dupla);
  chk('funções se alternam entre pessoas ativas a cada dia',escala1.Fotos.whats!==escala2.Fotos.whats&&escala1.Caixa.whats!==escala2.Caixa.whats);
  r=await A(PABLO,'POST','/esteira/equipe',{nome:'Intruso',whats:VISITA});chk('rota antiga não cria segunda equipe',r.r.status===409,r.j);
  r=await A(PABLO,'POST','/esteira/escala',{tipo:'dia',funcao:'Fotos',whats:CLARICE});chk('escala recusa pessoa sem Esteira ativa',r.r.status===400,r.j);
  usuarios[IARA].permissoes=[];equipe=[];
  r=await A(IARA,'GET','/esteira/hoje');chk('revogação corta acesso na próxima consulta, mesmo com cache',r.r.status===403,r.j);
  usuarios[VISITA].permissoes=['esteira'];equipe=[{whats:VISITA,nome:'Nova colega',ativo:1,confere:1,rodizio:1,aceitar:0}];
  r=await A(VISITA,'GET','/esteira/hoje');chk('novo acesso participa automaticamente no mesmo dia',r.j.ok&&r.j.total>0,r.j);
  usuarios[CLARICE].permissoes=['esteira'];equipe=[{whats:VISITA,nome:'Nova colega',ativo:1,confere:1,rodizio:1,aceitar:0}];cacheMem.clear();
  r=await A(CLARICE,'GET','/esteira/hoje');chk('quem tem o acesso Esteira entra mesmo que a lista de equipe do RH não o traga',r.r.status===200&&r.j.ok,r.j);
  usuarios[CLARICE].permissoes=[];cacheMem.clear();r=await A(CLARICE,'GET','/esteira/hoje');chk('sem o acesso Esteira continua barrado',r.r.status===403,r.j);
  // Perfil "tudo menos Admin": Esteira + Mensageiro + Fotos com IA + Postador (+ entrar no admin e conta de cliente), sem gerir_acessos
  usuarios[CLARICE].permissoes=['catalogo_admin','cliente','painel_simples','esteira','postador','fotoia','msg_acessar','msg_responder','msg_produtos','msg_respostas','msg_notas','msg_agenda'];
  equipe=[{whats:VISITA,nome:'Nova colega',ativo:1,confere:1,rodizio:1,aceitar:0}];cacheMem.clear();
  r=await A(CLARICE,'GET','/esteira/hoje');chk('perfil completo sem Admin: Esteira abre',r.r.status===200&&r.j.ok,r.j);
  r=await A(CLARICE,'GET','/posts');chk('perfil completo sem Admin: Postador abre',r.r.status===200,r.j);
  r=await A(CLARICE,'GET','/fotoia/config');chk('perfil completo sem Admin: Fotos com IA abre',r.r.status===200&&r.j.ok,r.j);
  const permsCompleto=usuarios[CLARICE].permissoes.slice();permsCompleto.acessosConfiguraveis=true;
  const dirCompleto=W.msgDireitos_(permsCompleto,CLARICE,{perfis:{},pessoas:{}});
  chk('perfil completo sem Admin: Mensageiro acessa, responde e usa produtos/respostas/notas/agenda',dirCompleto.acessar&&dirCompleto.responder&&dirCompleto.produtos&&dirCompleto.respostas&&dirCompleto.notas&&dirCompleto.agenda,dirCompleto);
  chk('perfil completo sem Admin: não ganha funil, métricas, exportar nem configurações do Mensageiro',!dirCompleto.funil&&!dirCompleto.metricas&&!dirCompleto.exportar&&!dirCompleto.configuracoes,dirCompleto);
  usuarios[CLARICE].permissoes=[];cacheMem.clear();
  usuarios[VISITA].permissoes=['esteira'];equipe=[{whats:VISITA,nome:'Nova colega',ativo:1,confere:1,rodizio:1,aceitar:0}];cacheMem.clear();legado=true;
  r=await A(VISITA,'GET','/esteira/hoje');chk('catálogo publicado sem Acessos configuráveis: sem o RH, a Esteira fica barrada',r.r.status===403,r.j);
  env.RH_URL='https://rh.fake/';cacheMem.clear();r=await A(VISITA,'GET','/esteira/hoje');chk('catálogo antigo: a sessão é conferida no RH e o acesso Esteira funciona',r.r.status===200&&r.j.ok,r.j);
  delete env.RH_URL;legado=false;cacheMem.clear();
  fora=true;r=await A(PABLO,'GET','/esteira/config');chk('falha no RH não recupera equipe antiga silenciosamente',r.r.status>=500,r.j);fora=false;
  r=await A(CLARICE,'GET','/posts');chk('cadastrar produtos não contorna Postador desativado',r.r.status===403,r.j);
  r=await A(CLARICE,'GET','/fotoia/config');chk('cadastrar produtos não contorna Geração IA desativada',r.r.status===403,r.j);
  usuarios[CLARICE].permissoes=['fotoia'];cacheMem.clear();r=await A(CLARICE,'GET','/fotoia/config');chk('permissão de IA abre configuração de uso sem promover a administrador',r.j.ok&&!r.j.podeEditar,r.j);
  const perms=['msg_acessar','msg_responder'];perms.acessosConfiguraveis=true;perms.msgModelos={'Produção':{configurado:true,permissoes:perms.slice()}};
  const regras={perfis:{producao:{responder:false}},pessoas:{}};
  chk('perfil configurado no RH prevalece sobre regra antiga de Mensagens',W.msgDireitos_(perms,IARA,regras).responder);
  perms.msgModelos['Produção'].configurado=false;chk('perfil ainda não configurado preserva exceção antiga de Mensagens',!W.msgDireitos_(perms,IARA,regras).responder);
  perms.msgModelos['Produção'].configurado=true;regras.pessoas['558899990002']={responder:false};chk('exceção pessoal do Mensageiro continua prevalecendo',!W.msgDireitos_(perms,IARA,regras).responder);
  console.log(ok+' ok, '+falhas.length+' falhas');if(falhas.length)process.exit(1);
})().catch(e=>{console.error(e);process.exit(1)});
`;
vm.runInThisContext('(function(require,__dirname,__import){'+harness.replace('await import(', 'await __import(')+cenarios+'})',{filename:__filename})(require,__dirname,u=>import(u));
