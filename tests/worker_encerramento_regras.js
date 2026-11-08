/* v7.40.33 — presença, equipe e início de conversa (itens retomados do #305).
   D1 SQLite real; nenhum envio a destinatário real. */
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const sqlite = new DatabaseSync(':memory:');
const DB = { prepare(sql) { let args = []; const st = { bind(...x) { args = x; return st; }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { return st._run(); }, _run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; } }; return st; }, async batch(xs) { sqlite.exec('BEGIN'); try { const r = xs.map(x => x._run()); sqlite.exec('COMMIT'); return r; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };

(async () => {
  const tmp = path.join(os.tmpdir(), 'tk-encerramento-teste.mjs');
  fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, '../instagram-worker/worker.js')) + '\nexport {equipeAtendimento_,iniciarConversa_,registrarAtividade_,gravarMensagem_};');
  const W = await import(tmp);
  const cache = new Map(), kv = new Map();
  global.caches = { default: { async match(r) { return cache.has(r.url) ? Response.json(cache.get(r.url)) : undefined; }, async put(r, v) { cache.set(r.url, await v.json()); } } };
  let envios = [];
  global.fetch = async (u, opt) => {
    if (String(u) === 'https://backend.test') return Response.json({ ok: true, sessao: 'tk3.5588999999999.' + Math.floor(Date.now() / 1000 + 30 * 86400) + '.simulada', usuario: { nome: 'Ana Teste', permissoes: ['gerir_acessos'] } });
    assert(/\/send-(text|image)$/.test(String(u)), 'Serviço não simulado');
    envios.push(JSON.parse(opt.body)); return Response.json({ messageId: 'simulado-' + envios.length });
  };
  const CACHE = { async get(k) { return kv.get(k) || null; }, async put(k, v) { kv.set(k, String(v)); }, async delete(k) { kv.delete(k); } };
  const env = { DB, CACHE, MIDIA: require('./helpers/r2_condicional')(), API_URL: 'https://backend.test', MIDIA_URL: 'https://midia.test' };
  const headers = { 'X-TK-Whats': '5588999999999', 'X-TK-Sessao': 'tk3.teste' };
  const chamar = async (rota, metodo = 'GET', corpo) => { const r = await W.default.fetch(new Request('https://worker.test' + rota, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined }), env, {}); return { status: r.status, j: await r.json() }; };

  await chamar('/msg/config');
  const cfg=(await chamar('/msg/gestor/encerramento')).j.config;
  const RealDate=Date,now=Date.parse('2026-10-31T18:00:00Z');global.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}};
  let seq=0;const dono='558899999999',inicio=new Date(now-2*3600000).toISOString();
  const closed=(hours=1,motivo='concluido',atendido=inicio)=>{
    const fone='5588999'+String(++seq).padStart(6,'0'),fim=new Date(now-hours*3600000).toISOString();
    const id=Number(sqlite.prepare("INSERT INTO msg_conversa(canal,contato,nome,total,ultima_em,dono,dono_id,atendido_em,encerrada_em,encerrada_motivo) VALUES('whatsapp1',?,'Cliente teste',1,?,'Ana',?,?,?,?)").run(fone,fim,dono,atendido,fim,motivo).lastInsertRowid);
    sqlite.prepare("INSERT INTO msg_encerramento(conversa_id,canal,motivo,em) VALUES(?,'whatsapp1',?,?)").run(id,motivo,fim);return {id,fone,fim};
  };
  const receber=async(c,texto,tipo='texto',ext='e-'+(++seq))=>{const m={contato:c.fone,nome:'Cliente teste',grupo:0,direcao:'entrada',tipo,texto,em:new Date(now).toISOString(),extId:ext};const nova=await W.gravarMensagem_(env,'whatsapp1',m);return {nova,m,c:sqlite.prepare('SELECT * FROM msg_conversa WHERE id=?').get(c.id)};};
  for(const texto of ['ok','Beijos 😘','BOA NOITE!','muito obrigada 🙏']){
    const c=closed(),r=await receber(c,texto);assert(r.nova);assert.equal(r.c.encerrada_em,c.fim,texto);assert.equal(r.c.nao_lidas,0);assert.equal(r.c.dono_id,dono);assert(r.m._cortesia&&r.m._bloquearAuto);assert.equal(sqlite.prepare('SELECT cortesia FROM msg_mensagem WHERE conversa_id=?').get(c.id).cortesia,1);
    const dup=await receber(c,texto,'texto',r.m.extId);assert.equal(dup.nova,false);assert.equal(dup.c.total,2,'Recibo duplicado não altera conversa');
  }
  for(const [texto,tipo]of [['ok?','texto'],['boa noite, tem tamanho P?','texto'],['ok','imagem']]){
    const c=closed(),r=await receber(c,texto,tipo);assert.equal(r.c.encerrada_em,'');assert.equal(r.c.atendido_em,inicio);assert.equal(r.c.dono_id,dono);assert.equal(r.c.retorno_em,new Date(now).toISOString());assert.equal(r.c.nao_lidas,1);assert(!r.m._cortesia&&r.m._bloquearAuto);
    const pend=await chamar('/msg/conversas?canal=todos&fila=esperando');assert(!pend.j.conversas.some(x=>x.id===c.id),'Retorno não volta aos pendentes');
    const atend=await chamar('/msg/conversas?canal=todos&fila=em_atendimento');assert(atend.j.conversas.some(x=>x.id===c.id),'Retorno volta ao atendimento anterior');
  }
  const lead=closed(1,'sem_resposta'),resposta=await receber(lead,'ok');assert.equal(resposta.c.encerrada_em,'','Resposta a encerrado por falta de resposta não é ignorada por padrão');
  const antigo=closed(48),ret=await receber(antigo,'Preciso de outra peça');assert.equal(ret.c.atendido_em,'');assert.equal(ret.c.dono,'');assert.equal(ret.c.retorno_em,'','Fora da janela vira atendimento novo');
  const legado=closed(1,'concluido','');sqlite.prepare("INSERT INTO msg_mensagem(conversa_id,canal,ext_id,direcao,tipo,texto,enviada_em,status,por) VALUES(?,'whatsapp1','humano-legado','saida','texto','Resposta',?,'enviada','1234')").run(legado.id,inicio);assert.equal((await receber(legado,'Posso trocar?')).c.atendido_em,inicio,'Retoma atendimento humano anterior mesmo sem o antigo marcador Atender');
  // A atendente corrige uma cortesia sem apagar conteúdo nem enviar mensagem.
  const revisar=closed();await receber(revisar,'ok');const cm=sqlite.prepare('SELECT id FROM msg_mensagem WHERE conversa_id=?').get(revisar.id).id;
  const rr=await chamar('/msg/cortesia/rever','POST',{mensagem:cm});assert.equal(rr.status,200);const revista=sqlite.prepare('SELECT * FROM msg_conversa WHERE id=?').get(revisar.id);assert.equal(revista.encerrada_em,'');assert.equal(revista.atendido_em,inicio);assert.equal(revista.dono_id,dono);assert.equal(revista.nao_lidas,1);assert.equal(sqlite.prepare('SELECT cortesia FROM msg_mensagem WHERE id=?').get(cm).cortesia,0);
  sqlite.prepare("UPDATE msg_conversa SET encerrada_em=? WHERE id=?").run(new Date(now).toISOString(),revisar.id);assert((await chamar('/msg/cortesia/rever','POST',{mensagem:cm})).j.jaRevisada);assert(sqlite.prepare('SELECT encerrada_em FROM msg_conversa WHERE id=?').get(revisar.id).encerrada_em,'Revisão repetida não reabre outro encerramento');
  const fechadoDepois=closed();await receber(fechadoDepois,'beijos');const antiga=sqlite.prepare('SELECT id FROM msg_mensagem WHERE conversa_id=?').get(fechadoDepois.id).id;sqlite.prepare('UPDATE msg_conversa SET encerrada_em=? WHERE id=?').run(new Date(now+1000).toISOString(),fechadoDepois.id);assert.equal((await chamar('/msg/cortesia/rever','POST',{mensagem:antiga})).status,409);assert.equal((await chamar('/msg/cortesia/rever','POST',{mensagem:-1})).status,400);
  // Prazos e expressões são editáveis e auditados.
  cfg.retomarLigado=false;const saved=await chamar('/msg/gestor/encerramento','POST',cfg);assert.equal(saved.status,200);assert.equal((await chamar('/msg/gestor/encerramento','POST',cfg)).status,409);
  const novo=closed();assert.equal((await receber(novo,'Tenho uma pergunta')).c.atendido_em,'');
  assert.equal((await chamar('/msg/gestor/encerramento','POST',{...saved.j.config,cortesiaMinutos:9999})).status,400);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM msg_gestor_log WHERE acao='encerramento'").get().n,1);
  assert.equal(envios.length,0,'Regra de encerramento nunca manda mensagens como efeito colateral');
  global.Date=RealDate;console.log('OK: cortesia exata, anexos/perguntas preservados, retorno no atendimento, dono/início mantidos, fora da janela, legado, duplicata, regras auditadas e nenhum envio.');
})().catch(e=>{console.error(e);process.exitCode=1;});
