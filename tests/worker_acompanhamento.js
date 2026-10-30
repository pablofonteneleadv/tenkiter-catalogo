/* D1 SQLite real e serviços simulados; nenhum envio para destinatários reais. */
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os');
const {DatabaseSync}=require('node:sqlite');
const sqlite=new DatabaseSync(':memory:');let falhar=false;
const DB={prepare(sql){let args=[];const st={bind(...x){args=x;return st},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {results:sqlite.prepare(sql).all(...args)}},async run(){return st._run()},_run(){if(falhar&&!/^SELECT|^PRAGMA/.test(sql))throw Error('falha simulada');const r=sqlite.prepare(sql).run(...args);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}}}};return st},async batch(xs){sqlite.exec('BEGIN');try{const r=xs.map(x=>x._run());sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}};
(async()=>{
const tmp=path.join(os.tmpdir(),'tk-acompanhamento.mjs');fs.writeFileSync(tmp,fs.readFileSync(path.join(__dirname,'../instagram-worker/worker.js'))+'\nexport {alterarAcompanhamento_,conferirAcompanhamento_,contextoAcompanhamento_,processarEntradas_,renovarAutorizacoesAgenda_};');const W=await import(tmp);
const cache=new Map(),kv=new Map();global.caches={default:{async match(r){return cache.has(r.url)?Response.json(cache.get(r.url)):undefined},async put(r,v){cache.set(r.url,await v.json())}}};
let envios=[],modo='ok',aoEnviar=null,pode=true;global.fetch=async(u,opt)=>{if(String(u)==='https://backend.test')return Response.json({ok:true,sessao:'tk3.5588999999999.'+Math.floor(Date.now()/1000+30*86400)+'.renovada-simulada',usuario:{nome:'Ana Teste',permissoes:pode?['gerir_acessos']:[]}});assert(/\/send-(text|image)$/.test(String(u)),'Serviço não simulado');envios.push(JSON.parse(opt.body));if(aoEnviar){const fn=aoEnviar;aoEnviar=null;await fn();}return modo==='incerto'?Response.json({}, {status:500}):Response.json({messageId:'enviado-simulado-'+envios.length})};
const CACHE={async get(k){return kv.get(k)||null},async put(k,v){kv.set(k,String(v))},async delete(k){kv.delete(k)}};
const env={DB,CACHE,MIDIA:require('./helpers/r2_condicional')(),API_URL:'https://backend.test',MIDIA_URL:'https://midia.test'};
const headers={'X-TK-Whats':'5588999999999','X-TK-Sessao':'tk3.teste'},req=new Request('https://worker.test',{headers});
await W.default.fetch(new Request('https://worker.test/msg/config',{headers}),env,{});
const seg=sqlite.prepare("SELECT valor FROM cfg WHERE chave='msg_wh_segredo'").get();
if(!seg)await W.default.fetch(new Request('https://worker.test/wh/wafly/1/iniciar',{method:'POST',body:'{}'}),env,{});
const segredo=sqlite.prepare("SELECT valor FROM cfg WHERE chave='msg_wh_segredo'").get().valor;
const wh=async(id,slot=1,saida=false)=>W.default.fetch(new Request('https://worker.test/wh/wafly/'+slot+'/'+segredo,{method:'POST',body:JSON.stringify({type:'ReceivedCallback',messageId:id,phone:'5588991234567',senderName:'Cliente simulado',fromMe:saida,text:{message:'Teste'},momment:Date.now()})}),env,{});
await wh('primeira');const conv=sqlite.prepare("SELECT id FROM msg_conversa WHERE canal='whatsapp1'").get().id;
const ligar=key=>W.alterarAcompanhamento_(env,req,{conversa:conv,ligado:true,idLocal:key});
let a=await ligar('acompanhar-0001');assert(a.ok);assert.equal(a.acompanhamento.status,'ativo');assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM msg_agenda').get().n,1);
assert(a.acompanhamento.texto_lembrete.includes('amiga, passando aqui'));
assert(!JSON.stringify(a).includes('tk3.teste'),'Não devolve autorização da fila');
assert((await ligar('acompanhar-0001')).ok);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM msg_agenda').get().n,1,'Repetição não cria cron duplicado');
assert((await W.alterarAcompanhamento_(env,req,{conversa:conv,ligado:false})).ok);assert.equal(sqlite.prepare('SELECT status FROM msg_agenda').get().status,'cancelada');
a=await ligar('acompanhar-0002');assert(a.ok);await wh('resposta');assert.equal(sqlite.prepare('SELECT status FROM msg_acompanhamento WHERE id=?').get(a.acompanhamento.id).status,'cancelada','Resposta cancela');
assert.equal(sqlite.prepare('SELECT status FROM msg_agenda WHERE acompanhamento=?').get(a.acompanhamento.id).status,'cancelada');
a=await ligar('acompanhar-0003');assert(a.ok);await wh('resposta');assert.equal(sqlite.prepare('SELECT status FROM msg_acompanhamento WHERE id=?').get(a.acompanhamento.id).status,'ativo','Webhook repetido não cancela acompanhamento novo');
await wh('eco-saida',1,true);assert.equal(sqlite.prepare('SELECT status FROM msg_acompanhamento WHERE id=?').get(a.acompanhamento.id).status,'ativo','Mensagem da loja não cancela');
await wh('resposta-outro-canal',2);assert.equal(sqlite.prepare('SELECT status FROM msg_acompanhamento WHERE id=?').get(a.acompanhamento.id).status,'cancelada','Outro canal já vinculado também cancela');
a=await ligar('acompanhar-0004');assert(a.ok);
sqlite.exec("CREATE TRIGGER falha_cancelamento BEFORE UPDATE OF status ON msg_acompanhamento BEGIN SELECT RAISE(ABORT,'falha simulada ao cancelar');END;");
await wh('resposta-atomica');assert(!sqlite.prepare("SELECT id FROM msg_mensagem WHERE ext_id='resposta-atomica'").get(),'Falha não confirma mensagem com cron ainda ativo');
sqlite.exec('DROP TRIGGER falha_cancelamento');await wh('resposta-atomica');assert.equal(sqlite.prepare('SELECT status FROM msg_acompanhamento WHERE id=?').get(a.acompanhamento.id).status,'cancelada');
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM msg_mensagem WHERE ext_id='resposta-atomica'").get().n,1);
await W.processarEntradas_(env,true);
// Execução real do runner com relógio e provedor simulados.
const RealDate=Date;let clock=Date.parse('2026-11-02T12:00:00Z');global.Date=class extends RealDate{constructor(...xs){super(...(xs.length?xs:[clock]))}static now(){return clock}};
sqlite.prepare('INSERT OR REPLACE INTO cfg(chave,valor) VALUES(?,?)').run('wafly_1',JSON.stringify({instance:'teste-01',token:'simulado',clientToken:'simulado'}));
a=await ligar('acompanhar-envio-1');assert(a.ok);clock=Date.parse(a.acompanhamento.quando);
let resultado=await W.processarAgenda_(env,clock);assert.equal(resultado.enviadas,1);assert.equal(envios.length,1);assert(envios[0].message.includes('Bom dia amiga'));
let plano=sqlite.prepare('SELECT * FROM msg_acompanhamento WHERE id=?').get(a.acompanhamento.id);assert.equal(plano.etapa,'encerrar');assert.equal(plano.status,'ativo');
assert.equal(Date.parse(plano.quando)-clock,2*3600000,'Encerramento conta duas horas a partir do envio confirmado');
await W.processarAgenda_(env,clock);assert.equal(envios.length,1,'Mesmo minuto não reenvia');
clock=Date.parse(plano.quando);await W.processarAgenda_(env,clock);assert.equal(envios.length,1,'Encerramento padrão não manda mensagem extra');
assert.equal(sqlite.prepare('SELECT status FROM msg_acompanhamento WHERE id=?').get(plano.id).status,'concluida');
assert.equal(sqlite.prepare('SELECT encerrada_motivo FROM msg_conversa WHERE id=?').get(conv).encerrada_motivo,'sem_resposta');
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM msg_encerramento WHERE conversa_id=? AND motivo='sem_resposta'").get(conv).n,1);
await W.processarAgenda_(env,clock);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM msg_encerramento').get().n,1,'Histórico não duplica');
// Cliente respondeu enquanto o provedor processava o lembrete: não arma encerramento.
await wh('reabre-pelo-cliente');a=await ligar('acompanhar-race-1');clock=Date.parse(a.acompanhamento.quando);aoEnviar=()=>wh('responde-durante-envio');await W.processarAgenda_(env,clock);
assert.equal(sqlite.prepare('SELECT status FROM msg_acompanhamento WHERE id=?').get(a.acompanhamento.id).status,'cancelada');assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM msg_agenda WHERE acompanhamento=? AND tipo='encerrar'").get(a.acompanhamento.id).n,0);
// Envio incerto fica para conferência; não encerra nem tenta de novo sozinho.
a=await ligar('acompanhar-incerto');clock=Date.parse(a.acompanhamento.quando);modo='incerto';const antes=envios.length;await W.processarAgenda_(env,clock);assert.equal(sqlite.prepare('SELECT status FROM msg_acompanhamento WHERE id=?').get(a.acompanhamento.id).status,'falhou');clock+=5*3600000;await W.processarAgenda_(env,clock);assert.equal(envios.length,antes+1);
assert.equal(sqlite.prepare('SELECT encerrada_em FROM msg_conversa WHERE id=?').get(conv).encerrada_em,'');
// Anexo em agendamento manual usa a mesma reserva estável e conserva o nome.
modo='ok';const key='out/202611/'+('a'.repeat(24))+'.jpg';await env.MIDIA.put(key,new Uint8Array([255,216,255,1]),{httpMetadata:{contentType:'image/jpeg'}});
const agendar=async dados=>{const r=await W.default.fetch(new Request('https://worker.test/msg/agendar',{method:'POST',headers,body:JSON.stringify(dados)}),env,{});return {status:r.status,j:await r.json()}};
const dados={conversa:conv,texto:'',anexo:key,anexoNome:'arquivo número 1.jpg',quando:new Date(clock+120000).toISOString(),idLocal:'agenda-anexo-0001'};
let manual=await agendar(dados);assert.equal(manual.status,200);assert(manual.j.ok);assert(manual.j.agendada.tem_anexo);assert.equal(manual.j.agendada.anexo_nome,'arquivo número 1.jpg');assert(!JSON.stringify(manual.j).includes('agenda-auth'));
const repetido=await agendar(dados);assert.equal(repetido.j.agendada.id,manual.j.agendada.id,'Duplo toque não duplica agendamento');
clock+=120000;const antesAnexo=envios.length;await W.processarAgenda_(env,clock);assert.equal(envios.length,antesAnexo+1);assert(envios.at(-1).image.startsWith('https://midia.test/'));
await W.processarAgenda_(env,clock);assert.equal(envios.length,antesAnexo+1);
const invalido=await agendar({...dados,anexo:'https://externo.test/foto.jpg',quando:new Date(clock+120000).toISOString(),idLocal:'agenda-anexo-0002'});assert.equal(invalido.status,400);
// Revogar o acesso antes do prazo impede envio e mantém a falha pesquisável.
const revogado=await agendar({...dados,texto:'Teste de autorização',anexo:'',quando:new Date(clock+120000).toISOString(),idLocal:'agenda-revogacao'});assert(revogado.j.ok);
pode=false;cache.clear();clock+=120000;const antesRev=envios.length;await W.processarAgenda_(env,clock);assert.equal(envios.length,antesRev);assert.equal(sqlite.prepare('SELECT status FROM msg_agenda WHERE id=?').get(revogado.j.agendada.id).status,'falhou');
const negado=await W.default.fetch(new Request('https://worker.test/msg/acompanhamento',{method:'POST',headers,body:JSON.stringify({conversa:conv,ligado:true,idLocal:'acompanhar-negado'})}),env,{});assert.equal(negado.status,403,'Acesso ao acompanhamento é validado no servidor');
pode=true;cache.clear();
// Mensagem final é opcional e respeita o modelo configurado no servidor.
sqlite.prepare('INSERT OR REPLACE INTO cfg(chave,valor) VALUES(?,?)').run('msg_auto',JSON.stringify({acompanhamento:{textoLembrete:'{saudacao} amiga, ficou alguma dúvida?',mensagemFinal:true,textoFinal:'{saudacao}, vamos encerrar por enquanto.'}}));
a=await ligar('acompanhar-final');assert(a.ok);clock=Date.parse(a.acompanhamento.quando);const antesFinal=envios.length;await W.processarAgenda_(env,clock);let fim=sqlite.prepare('SELECT quando FROM msg_acompanhamento WHERE id=?').get(a.acompanhamento.id);clock=Date.parse(fim.quando);await W.processarAgenda_(env,clock);assert.equal(envios.length,antesFinal+2);assert(envios.at(-1).message.includes('vamos encerrar por enquanto.'));assert(!envios.at(-1).message.includes('{saudacao}'));
assert.equal(sqlite.prepare('SELECT status FROM msg_acompanhamento WHERE id=?').get(a.acompanhamento.id).status,'concluida');
// Falha na mensagem final opcional não impede o encerramento após o lembrete confirmado.
await wh('reabre-final-incerto');a=await ligar('acompanhar-final-incerto');clock=Date.parse(a.acompanhamento.quando);await W.processarAgenda_(env,clock);
fim=sqlite.prepare('SELECT quando FROM msg_acompanhamento WHERE id=?').get(a.acompanhamento.id);clock=Date.parse(fim.quando);modo='incerto';const antesFimIncerto=envios.length;await W.processarAgenda_(env,clock);
const planoFinal=sqlite.prepare('SELECT * FROM msg_acompanhamento WHERE id=?').get(a.acompanhamento.id);assert.equal(planoFinal.status,'concluida');assert(planoFinal.erro);assert.equal(sqlite.prepare("SELECT status FROM msg_agenda WHERE acompanhamento=? AND tipo='encerrar'").get(a.acompanhamento.id).status,'falhou');
assert.equal(sqlite.prepare('SELECT encerrada_motivo FROM msg_conversa WHERE id=?').get(conv).encerrada_motivo,'sem_resposta');await W.processarAgenda_(env,clock);assert.equal(envios.length,antesFimIncerto+1,'Não repete a mensagem final incerta');modo='ok';
// Limite oficial: não arma automação que já cairá fora das24h no Instagram.
sqlite.prepare("INSERT INTO msg_conversa(id,canal,contato,nome,total,ult_entrada_em) VALUES(500,'instagram','17841400000099','Instagram simulado',1,?)").run(new Date(clock-25*3600000).toISOString());
const expirado=await W.alterarAcompanhamento_(env,req,{conversa:500,ligado:true,idLocal:'ig-expirado-0001'});assert.equal(expirado.cod,400);assert(/24 horas/.test(expirado.erro));
// Painel: paginação sem repetição e filtros combinados no servidor.
for(let i=0;i<35;i++)sqlite.prepare("INSERT INTO msg_agenda(conversa_id,texto,quando,autor,whats,criado_em) VALUES(?,?,?,?,?,?)").run(conv,'Pesquisa painel '+i,'2026-11-03T12:00:00.000Z','Ana','5588999999999',new Date(clock).toISOString());
const painel=async q=>{const r=await W.default.fetch(new Request('https://worker.test/msg/agendadas'+q,{headers}),env,{});return {status:r.status,j:await r.json()}};
let lista=await painel('?status=pendentes&busca=Pesquisa&minhas=1&canal=whatsapp1&tipo=manual');assert.equal(lista.status,200);assert.equal(lista.j.agendamentos.length,30);assert(lista.j.temMais);assert(!JSON.stringify(lista.j).includes('auth_ref'));
const pagina2=await painel('?status=pendentes&busca=Pesquisa&minhas=1&canal=whatsapp1&tipo=manual&cursor='+encodeURIComponent(lista.j.proximo));assert.equal(pagina2.j.agendamentos.length,5);assert(!pagina2.j.temMais);assert.equal(new Set([...lista.j.agendamentos,...pagina2.j.agendamentos].map(x=>x.id)).size,35);
assert.equal((await painel('?status=pendentes&busca=Pesquisa&canal=instagram')).j.agendamentos.length,0);
for(const quando of ['2026-11-03T02:30:00.000Z','2026-11-04T02:30:00.000Z'])sqlite.prepare("INSERT INTO msg_agenda(conversa_id,texto,quando,autor,whats,criado_em) VALUES(?,?,?,?,?,?)").run(conv,'Limite do dia',quando,'Ana','5588999999999',new Date(clock).toISOString());
const data=await painel('?status=pendentes&busca=Limite&de=2026-11-03&ate=2026-11-03');assert.equal(data.j.agendamentos.length,1);assert.equal(data.j.agendamentos[0].quando,'2026-11-04T02:30:00.000Z','Período considera Fortaleza');
assert.equal((await painel('?status=inventado')).status,400);assert.equal((await painel('?cursor=invalido')).status,400);assert.equal((await painel('?de=2026-02-31')).status,400);
// Fila: só resposta humana confirmada inicia; leitura e bot não movem; reaberta volta em atendimento.
sqlite.exec("INSERT INTO msg_conversa(id,canal,contato,nome,total,grupo,ultima_em) VALUES(600,'whatsapp1','5588991230011','Fila nova',1,0,'2026-11-03T12:00:00Z')");
const fila=async(q)=>{const r=await W.default.fetch(new Request('https://worker.test/msg/conversas?canal=todos&busca=Fila%20nova&'+q,{headers}),env,{});return {status:r.status,j:await r.json()}};
assert.equal((await fila('fila=esperando')).j.conversas.length,1);assert.equal((await fila('fila=em_atendimento')).j.conversas.length,0);
sqlite.exec("INSERT INTO msg_mensagem(conversa_id,canal,ext_id,direcao,tipo,texto,por,status,enviada_em) VALUES(600,'whatsapp1','bot-fila','saida','texto','Olá','auto','enviada','2026-11-03T12:01:00Z')");
assert.equal((await fila('fila=esperando')).j.conversas.length,1,'Bot não inicia atendimento');
sqlite.exec("UPDATE msg_conversa SET nao_lidas=0,dono='Ana' WHERE id=600");assert.equal((await fila('fila=esperando')).j.conversas.length,1,'Ler e assumir não são resposta');
sqlite.exec("INSERT INTO msg_mensagem(conversa_id,canal,ext_id,direcao,tipo,texto,por,status,enviada_em) VALUES(600,'whatsapp1','humana-fila','saida','texto','Posso ajudar?','9999','incerta','2026-11-03T12:02:00Z')");
assert.equal((await fila('fila=esperando')).j.conversas.length,1,'Envio incerto não tira da espera');sqlite.exec("UPDATE msg_mensagem SET status='enviada' WHERE ext_id='humana-fila'");assert.equal((await fila('fila=em_atendimento')).j.conversas.length,1);
sqlite.exec("UPDATE msg_conversa SET dono='Ana' WHERE id=600");assert.equal((await fila('fila=em_atendimento&escopo=meus')).j.conversas.length,1);sqlite.exec("UPDATE msg_conversa SET dono='Outra pessoa' WHERE id=600");assert.equal((await fila('fila=em_atendimento&escopo=meus')).j.conversas.length,0);
sqlite.exec("DELETE FROM msg_mensagem WHERE ext_id='humana-fila';INSERT INTO msg_encerramento(conversa_id,canal,motivo,em) VALUES(600,'whatsapp1','concluido','2026-11-03T13:00:00Z')");assert.equal((await fila('fila=em_atendimento')).j.conversas.length,1,'Histórico de encerramento mantém reaberta em atendimento');assert.equal((await fila('fila=inventada')).status,400);
// Sessão do cadastro dura30dias: autorização de um pedido de45dias é renovada, limitada ao pedido.
const convOutra=sqlite.prepare("SELECT id FROM msg_conversa WHERE canal='whatsapp2' LIMIT 1").get().id;
const longa=await agendar({conversa:convOutra,texto:'Agendamento futuro',quando:new Date(clock+45*86400000).toISOString(),idLocal:'agenda-longa-0001'});assert(longa.j.ok);
const ref=sqlite.prepare('SELECT auth_ref FROM msg_agenda WHERE id=?').get(longa.j.agendada.id).auth_ref;
clock+=7*86400000;await W.renovarAutorizacoesAgenda_(env,clock);const renovada=kv.get('agenda-auth:'+ref);assert(JSON.parse(renovada).sessao.includes('renovada-simulada'));
sqlite.prepare("UPDATE msg_agenda SET status='cancelada' WHERE id=?").run(longa.j.agendada.id);clock+=8*86400000;await W.renovarAutorizacoesAgenda_(env,clock);assert.equal(kv.get('agenda-auth:'+ref),renovada,'Não renova autorização sem pedido pendente');assert.equal(sqlite.prepare('SELECT estado FROM msg_agenda_autorizacao WHERE ref=?').get(ref).estado,'concluida');
global.Date=RealDate;
console.log('Acompanhar: fila real simulada, horas úteis, envio único, encerramento auditado, resposta concorrente e envio incerto aprovados.');

})().catch(e=>{console.error(e);process.exitCode=1});
