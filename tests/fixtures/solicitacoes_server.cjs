/* v7.40.33 — presença, equipe e início de conversa (itens retomados do #305).
   D1 SQLite real; nenhum envio a destinatário real. */
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const sqlite = new DatabaseSync(':memory:');
const DB = { prepare(sql) { let args = []; const st = { bind(...x) { args = x; return st; }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { return st._run(); }, _run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; } }; return st; }, async batch(xs) { sqlite.exec('BEGIN'); try { const r = xs.map(x => x._run()); sqlite.exec('COMMIT'); return r; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };

(async () => {
  const tmp = path.join(os.tmpdir(), 'tk-solicitacoes.mjs');
  fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, '../../instagram-worker/worker.js')) + '\nexport {rotasSolicitacoes_,msgRecurso_};');
  const W = await import(require('node:url').pathToFileURL(tmp).href);
  const cache = new Map(), kv = new Map();
  global.caches = { default: { async match(r) { return cache.has(r.url) ? Response.json(cache.get(r.url)) : undefined; }, async put(r, v) { cache.set(r.url, await v.json()); } } };
  let envios = [];
  global.fetch = async (u, opt) => {
    if (String(u) === 'https://backend.test') return Response.json({ ok: true, sessao: 'tk3.5588999999999.' + Math.floor(Date.now() / 1000 + 30 * 86400) + '.simulada', usuario: Object.assign({ nome: 'Ana Teste', permissoes: JSON.parse(opt.body||'{}').whatsapp==='88999999998'?['esteira','esteira_arquivar_fotos']:['gerir_acessos'] },JSON.parse(opt.body||'{}').whatsapp==='88999999997'?{nome:'Bia Atendente',permissoes:['msg_acessar','msg_responder'],acessosConfiguraveis:true,perfis:['Atendimento']}:{}) });
    assert(/\/send-(text|image)$/.test(String(u)), 'Serviço não simulado');
    envios.push(JSON.parse(opt.body)); return Response.json({ messageId: 'simulado-' + envios.length });
  };
  const CACHE = { async get(k) { return kv.get(k) || null; }, async put(k, v) { kv.set(k, String(v)); }, async delete(k) { kv.delete(k); } };
  const env = { DB, CACHE, MIDIA: require('../helpers/r2_condicional')(), API_URL: 'https://backend.test', MIDIA_URL: 'https://midia.test' };
  const headers = { 'X-TK-Whats': '5588999999999', 'X-TK-Sessao': 'tk3.teste' };
  const chamar = async (rota, metodo = 'GET', corpo) => { const r = await W.default.fetch(new Request('https://worker.test' + rota, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined }), env, {}); return { status: r.status, j: await r.json() }; };

  await chamar('/msg/config');await chamar('/esteira/caixa');
  async function reset(){
    await chamar('/msg/solicitacoes');
    for(const t of ['msg_solicitacao_foto','msg_solicitacao_evento','msg_solicitacao','foto_cliente','msg_conversa','est_caixa','postagem'])sqlite.prepare('DELETE FROM '+t).run();
    for(const [id,canal,contato,nome]of [[1,'whatsapp1','5588999990000','Maria'],[4,'whatsapp2','5588911112222','João'],[5,'instagram','17841400000001','Cliente Instagram']])sqlite.prepare("INSERT INTO msg_conversa(id,canal,contato,nome,grupo) VALUES(?,?,?,?,0)").run(id,canal,contato,nome);
    sqlite.prepare("INSERT OR REPLACE INTO est_equipe(whats,nome,ativo,rodizio,confere) VALUES('88999999998','Ana',1,1,1)").run();
    await chamar('/post/config','POST',{config:{pausaAtiva:false}});await DB.prepare("INSERT OR REPLACE INTO cfg(chave,valor) VALUES('post_agora_lote','')").run();
    for(const [k,delta]of [['qa-primeira',3600000],['qa-segunda',4800000],['qa-regular',30000]])for(const canal of ['whatsapp','grupo','whatsapp2'])sqlite.prepare("INSERT INTO postagem(tipo,modo,midias,agendado_em,status,canal,origem_midia,intervalo_ms,criado_em,atualizado_em) VALUES('story','auto','[]',?,'agendado',?,?,1200000,?,?)").run(new Date(Date.now()+delta).toISOString(),canal,k,new Date().toISOString(),new Date().toISOString());
    for(const id of [1,2])sqlite.prepare("INSERT INTO est_caixa(id,op,lote,url,descricao,descricao_lote,enviada_por,enviada_nome,enviada_em,status) VALUES(?,?,?,'https://midia.test/foto.jpg',?,'Descrição antiga','88999999998','Ana',?,'nova')").run(id,'qa-foto-'+id,'qa-lote','Individual '+id,new Date().toISOString());
  }
  await reset();
  require('node:http').createServer(async(req,res)=>{try{
    if(req.url==='/qa/reset'){await reset();res.end('{}');return;}
    if(req.url==='/qa/estado'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({fila:sqlite.prepare('SELECT * FROM postagem').all(),lote:sqlite.prepare("SELECT valor FROM cfg WHERE chave='post_agora_lote'").get(),solicitacoes:sqlite.prepare('SELECT * FROM msg_solicitacao').all(),fotos:sqlite.prepare('SELECT * FROM foto_cliente').all(),caixa:sqlite.prepare('SELECT * FROM est_caixa').all()}));return;}
    const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks),r=await W.default.fetch(new Request('https://worker.test'+req.url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:body}),env,{});res.statusCode=r.status;r.headers.forEach((v,k)=>res.setHeader(k,v));res.end(Buffer.from(await r.arrayBuffer()));
  }catch(e){res.statusCode=500;res.end(JSON.stringify({ok:false,erro:String(e)}));}}).listen(Number(process.env.TK_QA_PORT)||8774,'127.0.0.1',()=>console.log('QA SQLite:8774; serviços simulados'));
})().catch(e=>{console.error(e);process.exitCode=1;});
