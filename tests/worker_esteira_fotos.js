// v7.52.0 — Esteira: pedido de fotos simplificado, caixa de fotos da equipe e preparação sem tarefa duplicada.
// Rotas /esteira/* com D1 REAL (SQLite do Node), catálogo e sessão FALSOS. Nada vai ao Google, à Cloudflare nem ao servidor de mídia.
const fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const tmp = path.join(os.tmpdir(), 'tk_ig_esteira_fotos.mjs');
fs.writeFileSync(tmp, fs.readFileSync(process.env.TK_WORKER_SOURCE || path.join(__dirname, '..', 'instagram-worker', 'worker.js')));
let ok = 0; const falhas = [];
const chk = (n, c, d) => { if (c) { ok++; console.log('  ✔ ' + n); } else { falhas.push(n); console.log('  ✘ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 400) : '')); } };
function d1() {
  const db = new DatabaseSync(':memory:');
  const prep = (sql) => { const S = () => db.prepare(sql); let args = []; const o = { bind(...a) { args = a; return o; }, async all() { return { results: S().all(...args).map((x) => ({ ...x })) }; }, async first() { const r = S().get(...args); return r ? { ...r } : null; }, async run() { const r = S().run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; }, _run() { const r = S().run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; } }; return o; };
  return { prepare: prep, async batch(l) { db.exec('BEGIN'); const out = []; try { for (const st of l) out.push(st._run()); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } return out; } };
}
const dia = (n) => new Date(Date.now() - n * 864e5).toISOString();
(async () => {
  const w = (await import(require('url').pathToFileURL(tmp).href)).default;
  const kv = new Map();
  const KV = { async get(k) { return kv.has(k) ? kv.get(k) : null; }, async put(k, v) { kv.set(k, String(v)); }, async delete(k) { kv.delete(k); } };
  globalThis.caches = { default: { async match() { return undefined; }, async put() {} } };
  const produtos = [];
  for (let i = 0; i < 12; i++) produtos.push({ ID: String(1000 + i), Nome: 'Peça ' + i, Codigo: 'TK-' + i, Categoria: 'Vestidos', Genero: 'Feminino Adulto', Estoque: '2', Tamanhos: 'P, M', Cores: 'Preto', Foto_URL: 'https://midia.fake/m/' + i + '.jpg', Status: 'Ativo', Data_Cadastro: dia(10 + i) });
  const usuarios = { '88999990001': { nome: 'Pablo', permissoes: ['gerir_acessos', 'catalogo_admin'] }, '88999990002': { nome: 'Iara', permissoes: ['catalogo_cadastrar'] }, '88999990003': { nome: 'Clarice', permissoes: ['catalogo_cadastrar'] }, '88999990005': { nome: 'Bia', permissoes: [] }, '88999990006': { nome: 'Gestora', permissoes: ['catalogo_cadastrar'] } };
  globalThis.fetch = async (u, init) => {
    u = String(u);
    if (u.startsWith('https://api.fake/')) {
      if (init && init.method === 'POST') { const b = JSON.parse(init.body); if (b.action === 'sessao') { const x = usuarios[b.whatsapp]; return new Response(JSON.stringify(x ? { ok: true, usuario: { ...x, perfis: [] } } : { ok: false })); } }
      if (u.includes('action=list')) return new Response(JSON.stringify({ ok: true, produtos }));
      return new Response('{"ok":false}', { status: 500 });
    }
    return new Response('{}', { status: 404 });
  };
  const env = { DB: d1(), CACHE: KV, API_URL: 'https://api.fake/exec' };
  const A = async (whats, metodo, rota, corpo) => { const r = await w.fetch(new Request('https://ig.fake' + rota, { method: metodo, headers: { 'Content-Type': 'application/json', 'X-TK-Whats': whats, 'X-TK-Sessao': 'tk3.sessao-' + whats }, body: corpo ? JSON.stringify(corpo) : undefined }), env, { waitUntil() {} }); return { r, j: await r.json() }; };
  const PABLO = '88999990001', IARA = '88999990002', CLARICE = '88999990003', BIA = '88999990005', GESTORA = '88999990006';
  await A(PABLO, 'POST', '/esteira/equipe', { whats: IARA, nome: 'Iara', confere: true, rodizio: true, atendente: true });
  await A(PABLO, 'POST', '/esteira/equipe', { whats: CLARICE, nome: 'Clarice', confere: true, rodizio: true, atendente: true, aceitar: true });
  await A(PABLO, 'POST', '/esteira/equipe', { whats: BIA, nome: 'Bia', confere: true, rodizio: true });
  await A(PABLO, 'POST', '/esteira/escala', { tipo: 'dia', funcao: 'Fotos', whats: IARA });
  const tarefasDe = async (id) => (await env.DB.prepare('SELECT * FROM est_tarefa WHERE produto=? ORDER BY id').bind(id).all()).results;

  console.log('— 4. preparação sem tarefa duplicada');
  let pr = await A(CLARICE, 'POST', '/esteira/preparar', { id: '1001', nome: 'Peça 1' });
  chk('primeira preparação cria as 5 tarefas do modelo', pr.j.ok && pr.j.criadas === 5, pr.j);
  let pp = await A(IARA, 'GET', '/esteira/preparacao');
  const cad = pp.j.produtos[0].tarefas.find((t) => t.titulo === 'Cadastro conferido');
  await A(CLARICE, 'POST', '/esteira/tarefa', { id: cad.id, feita: true });
  await A(CLARICE, 'POST', '/esteira/aceitar', { id: '1001' });
  pr = await A(CLARICE, 'POST', '/esteira/preparar', { id: '1001', nome: 'Peça 1' });
  chk('recolocar em preparação não cria de novo: a feita fica feita, as dispensadas voltam', pr.j.ok && pr.j.criadas === 0 && pr.j.reabertas === 4 && pr.j.jaFeitas === 1, pr.j);
  pp = await A(IARA, 'GET', '/esteira/preparacao');
  let prod = pp.j.produtos.find((x) => x.id === '1001') || { tarefas: [] };
  const titulos = prod.tarefas.map((t) => t.titulo);
  chk('“Cadastro conferido” aparece uma vez só (feita por Clarice) e as outras 4 pendentes', titulos.filter((t) => t === 'Cadastro conferido').length === 1 && new Set(titulos).size === titulos.length && prod.total === 5 && prod.feitas === 1 && prod.tarefas.find((t) => t.titulo === 'Cadastro conferido').feita_por === 'Clarice', prod.tarefas.map((t) => [t.titulo, t.status]));
  chk('banco não ganhou linhas novas na recolocação (5 tarefas da peça)', (await tarefasDe('1001')).length === 5);
  const duplo = await Promise.all([A(CLARICE, 'POST', '/esteira/preparar', { id: '1002' }), A(PABLO, 'POST', '/esteira/preparar', { id: '1002' })]);
  chk('dois toques ao mesmo tempo em "Preparar": só 5 tarefas', duplo.every((x) => x.j.ok) && (await tarefasDe('1002')).length === 5, (await tarefasDe('1002')).length);
  // duplicatas antigas (gravadas pela versão anterior): esconde na leitura sem apagar
  const agoraIso = new Date().toISOString();
  await env.DB.prepare("INSERT INTO est_tarefa (produto, tipo, titulo, instrucao, funcao, status, origem, criada_em) VALUES ('1002', 'cadastro', 'Cadastro conferido', '', 'Fotos', 'pendente', 'preparacao', ?)").bind(agoraIso).run();
  await env.DB.prepare("INSERT INTO est_tarefa (produto, tipo, titulo, instrucao, funcao, status, origem, criada_em, feita_em, feita_por) VALUES ('1002', 'foto', '1ª foto', '', 'Fotos', 'feita', 'preparacao', ?, ?, ?)").bind(agoraIso, agoraIso, PABLO).run();
  pp = await A(IARA, 'GET', '/esteira/preparacao');
  prod = pp.j.produtos.find((x) => x.id === '1002') || { tarefas: [] };
  const t2 = prod.tarefas.map((t) => t.titulo);
  chk('duplicatas antigas ficam escondidas na Preparação (uma linha por título; a feita prevalece)', new Set(t2).size === t2.length && t2.length === 5 && prod.tarefas.find((t) => t.titulo === '1ª foto').status === 'feita', prod.tarefas.map((t) => [t.id, t.titulo, t.status]));
  const hj = await A(IARA, 'GET', '/esteira/hoje');
  const hj1002 = hj.j.tarefas.filter((t) => t.produto === '1002').map((t) => t.titulo);
  chk('no Hoje também: sem pendente repetida e sem pendente de tarefa já feita', new Set(hj1002).size === hj1002.length && !hj1002.includes('1ª foto') && hj1002.filter((t) => t === 'Cadastro conferido').length === 1, hj1002);
  chk('nada foi apagado do banco (7 linhas da peça 1002)', (await tarefasDe('1002')).length === 7);

  console.log('— 1. pedido de fotos');
  const semNada = await A(IARA, 'POST', '/esteira/fotos/pedir', { produto: '1005' });
  chk('pedido sem opção: aviso em português', semNada.r.status === 400 && /no pano, no manequim/.test(semNada.j.erro), semNada.j);
  const outroVazio = await A(IARA, 'POST', '/esteira/fotos/pedir', { produto: '1005', opcoes: ['pano'], querOutro: true, outro: '  ' });
  chk('“Outro” marcado sem texto: pede para escrever', outroVazio.r.status === 400 && /Outro/.test(outroVazio.j.erro), outroVazio.j);
  chk('sem peça: aviso', (await A(IARA, 'POST', '/esteira/fotos/pedir', { opcoes: ['pano'] })).r.status === 400);
  const p1 = await A(IARA, 'POST', '/esteira/fotos/pedir', { produto: '1005', opcoes: ['pano', 'manequim', 'inventada'], obs: 'luz natural', op: 'pf-abc123', nome: 'Peça 5', codigo: 'TK-5' });
  chk('pedido com opções prontas criado', p1.j.ok && p1.j.id > 0 && !p1.j.repetido, p1.j);
  const p1b = await A(IARA, 'POST', '/esteira/fotos/pedir', { produto: '1005', opcoes: ['pano', 'manequim'], obs: 'luz natural', op: 'pf-abc123' });
  chk('mesmo envio (toque duplo/reenvio) devolve o mesmo pedido', p1b.j.id === p1.j.id && p1b.j.repetido === true, p1b.j);
  const p2 = await A(PABLO, 'POST', '/esteira/fotos/pedir', { produto: '1005', opcoes: ['cores'], querOutro: true, outro: 'foto das costas' });
  chk('segundo pedido da mesma peça (outra descrição) é aceito', p2.j.ok && p2.j.id !== p1.j.id, p2.j);
  const linha = await env.DB.prepare('SELECT * FROM est_tarefa WHERE id=?').bind(p1.j.id).first();
  chk('vira uma tarefa só de fotos (tipo foto, função Fotos, origem pedido_fotos) com a descrição', linha.tipo === 'foto' && linha.funcao === 'Fotos' && linha.origem === 'pedido_fotos' && linha.instrucao === 'No pano · No manequim — luz natural' && JSON.parse(linha.detalhe).opcoes.join() === 'pano,manequim', linha);
  let fo = await A(BIA, 'GET', '/esteira/fotos');
  const card = (fo.j.pedidos || []).find((x) => x.produto === '1005') || { itens: [] };
  chk('aba Fotos junta os 2 pedidos da peça num cartão, com quem pediu e quando', fo.j.ok && fo.j.pedidos.length === 1 && card.itens.length === 2 && card.nome === 'Peça 5' && card.foto === 'https://midia.fake/m/5.jpg' && card.itens[0].por === 'Iara' && !!card.itens[0].em && card.itens[1].por === 'Pablo', fo.j);
  chk('cada pedido mostra as opções escolhidas, o “Outro” e a observação', card.itens[0].rotulos.join('|') === 'No pano|No manequim' && card.itens[0].obs === 'luz natural' && card.itens[1].rotulos.join('|') === 'Das outras cores/estampas|Outro: foto das costas', card.itens);
  chk('quem não cadastra vê os pedidos mas não a contagem da caixa', fo.j.eu.gestorFotos === false && fo.j.caixaNovas === 0);
  const hjI = await A(IARA, 'GET', '/esteira/hoje');
  const tf = hjI.j.tarefas.filter((t) => t.origem === 'pedido_fotos');
  chk('quem está em Fotos recebe os pedidos no Hoje, com opções e quem pediu', tf.length === 2 && tf[0].rotulos.join('|') === 'No pano|No manequim' && tf[0].por === 'Iara' && tf[0].produtoNome === 'Peça 5' && hjI.j.fotos.pedidas === 1, tf);
  pp = await A(IARA, 'GET', '/esteira/preparacao');
  chk('Preparação não repete os pedidos de fotos (só a contagem)', !pp.j.outras.some((t) => t.origem === 'pedido_fotos') && pp.j.fotosPedidas === 1, pp.j.outras);
  // conferência com opções
  const cfBad = await A(IARA, 'POST', '/esteira/conferir', { id: '1007', achou: true, fotoNova: true, pedidoFotos: { opcoes: [] } });
  const confAntes = (await env.DB.prepare("SELECT COUNT(*) AS n FROM est_conf WHERE produto='1007'").first()).n;
  chk('conferência com pedido de fotos vazio é recusada antes de gravar', cfBad.r.status === 400 && /Escolha como quer as fotos/.test(cfBad.j.erro) && confAntes === 0, cfBad.j);
  const cf = await A(IARA, 'POST', '/esteira/conferir', { id: '1007', achou: true, fotoNova: true, pedidoFotos: { opcoes: ['manequim'], querOutro: true, outro: 'detalhe do bordado' } });
  const tcf = await env.DB.prepare('SELECT * FROM est_tarefa WHERE id=?').bind(cf.j.tarefaFoto || 0).first();
  chk('“Pedir fotos” na conferência vira pedido de fotos (de: conferência)', cf.j.ok && tcf && tcf.origem === 'pedido_fotos' && JSON.parse(tcf.detalhe).de === 'conferencia' && tcf.instrucao === 'No manequim · Outro: detalhe do bordado', tcf);
  const cfOld = await A(IARA, 'POST', '/esteira/conferir', { id: '1008', achou: true, fotoNova: true });
  const tOld = await env.DB.prepare('SELECT origem, titulo FROM est_tarefa WHERE id=?').bind(cfOld.j.tarefaFoto || 0).first();
  chk('conferência antiga (sem opções) continua criando “Foto nova”', tOld && tOld.origem === 'conferencia' && tOld.titulo === 'Foto nova', tOld);
  // aceitar a peça não dispensa pedido de fotos
  await A(CLARICE, 'POST', '/esteira/preparar', { id: '1005' });
  await A(CLARICE, 'POST', '/esteira/aceitar', { id: '1005' });
  chk('aceitar a peça para o site não dispensa os pedidos de fotos', (await env.DB.prepare("SELECT COUNT(*) AS n FROM est_tarefa WHERE produto='1005' AND origem='pedido_fotos' AND status='pendente'").first()).n === 2);
  // concluir (Adicionar fotos conclui todos os pedidos do cartão)
  chk('concluir sem ids: aviso', (await A(IARA, 'POST', '/esteira/fotos/concluir', { ids: [] })).r.status === 400);
  const cc = await A(IARA, 'POST', '/esteira/fotos/concluir', { ids: [p1.j.id, p2.j.id], fotos: 3 });
  chk('adicionar fotos conclui os 2 pedidos com a observação', cc.j.ok && cc.j.concluidos === 2, cc.j);
  const feita = await env.DB.prepare('SELECT status, feita_por, obs FROM est_tarefa WHERE id=?').bind(p2.j.id).first();
  chk('pedido feito registra quem fez e quantas fotos', feita.status === 'feita' && feita.feita_por === IARA && feita.obs === '3 fotos adicionadas pela Esteira', feita);
  chk('concluir de novo não muda nada', (await A(IARA, 'POST', '/esteira/fotos/concluir', { ids: [p1.j.id] })).j.concluidos === 0);
  fo = await A(IARA, 'GET', '/esteira/fotos');
  chk('cartão some da aba Fotos (fica só o pedido da conferência)', fo.j.pedidos.length === 1 && fo.j.pedidos[0].produto === '1007', fo.j.pedidos);

  console.log('— 2. caixa de fotos da equipe');
  const U = (n) => 'https://tenkiter-midia.fake/m/202611/caixa' + n + '.jpg';
  const env1 = await A(BIA, 'POST', '/esteira/caixa/enviar', { lote: 'lote-bia-1', descricaoLote: 'Vestidos que chegaram hoje', itens: [{ op: 'cx-bia-0001', url: U(1), descricao: 'vestido azul no manequim', hash: 'a'.repeat(32) }, { op: 'cx-bia-0002', url: U(2), descricao: '' }] });
  chk('envio em lote com descrição por foto e para o lote', env1.j.ok && env1.j.itens.length === 2 && env1.j.itens[0].descricao === 'vestido azul no manequim' && env1.j.itens[1].descricaoLote === 'Vestidos que chegaram hoje' && env1.j.itens[0].por === 'Bia' && env1.j.itens[0].status === 'nova', env1.j);
  const env1b = await A(BIA, 'POST', '/esteira/caixa/enviar', { lote: 'lote-bia-1', descricaoLote: 'Vestidos que chegaram hoje', itens: [{ op: 'cx-bia-0002', url: U(2) }, { op: 'cx-bia-0003', url: U(3), descricao: 'sem produto' }] });
  chk('envio interrompido retoma sem repetir (mesmo op não duplica)', env1b.j.ok && env1b.j.itens.length === 2 && (await env.DB.prepare('SELECT COUNT(*) AS n FROM est_caixa').first()).n === 3, env1b.j);
  const env2 = await A(IARA, 'POST', '/esteira/caixa/enviar', { lote: 'lote-iara-1', produto: '1003', produtoNome: 'Peça 3', itens: [{ op: 'cx-iara-0001', url: U(4), hash: 'a'.repeat(32) }] });
  chk('foto repetida (mesma impressão digital) é aceita e avisada', env2.j.ok && env2.j.itens[0].repetidaDe && env2.j.itens[0].repetidaDe.por === 'Bia' && env2.j.itens[0].produto === '1003' && env2.j.itens[0].produtoNome === 'Peça 3', env2.j);
  chk('foto sem endereço do servidor é recusada com aviso', (await A(BIA, 'POST', '/esteira/caixa/enviar', { itens: [{ op: 'cx-bia-0009', url: 'javascript:alert(1)' }] })).r.status === 400);
  chk('envio vazio é recusado', (await A(BIA, 'POST', '/esteira/caixa/enviar', { itens: [] })).r.status === 400);
  let cxB = await A(BIA, 'GET', '/esteira/caixa');
  chk('quem não cadastra vê só as próprias fotos', cxB.j.ok && cxB.j.gestor === false && cxB.j.itens.length === 3 && cxB.j.itens.every((x) => x.minha), cxB.j);
  chk('quem não cadastra não usa nem descarta fotos', (await A(BIA, 'POST', '/esteira/caixa/usar', { ids: [1], uso: 'cadastro' })).r.status === 403 && (await A(BIA, 'POST', '/esteira/caixa/descartar', { ids: [1] })).r.status === 403);
  let cx = await A(PABLO, 'GET', '/esteira/caixa');
  chk('gestor vê todas as fotos novas, com quem enviou e quando', cx.j.gestor === true && cx.j.itens.length === 4 && cx.j.contagem.novas === 4 && cx.j.itens.every((x) => x.por && x.em), cx.j.contagem);
  const ids = Object.fromEntries(cx.j.itens.map((x) => [x.url, x.id]));
  chk('Hoje do gestor traz a contagem da caixa', (await A(PABLO, 'GET', '/esteira/hoje')).j.fotos.caixa === 4);
  const us = await A(PABLO, 'POST', '/esteira/caixa/usar', { ids: [ids[U(4)]], uso: 'produto', produto: '1003', produtoNome: 'Peça 3' });
  chk('gestor coloca foto num produto existente', us.j.ok && us.j.marcadas === 1, us.j);
  chk('usar de novo não muda nada', (await A(PABLO, 'POST', '/esteira/caixa/usar', { ids: [ids[U(4)]], uso: 'produto', produto: '1003' })).j.marcadas === 0);
  chk('usar num produto sem dizer qual: aviso', (await A(PABLO, 'POST', '/esteira/caixa/usar', { ids: [ids[U(1)]], uso: 'produto' })).r.status === 400);
  const usC = await A(CLARICE, 'POST', '/esteira/caixa/usar', { ids: [ids[U(1)], ids[U(2)]], uso: 'cadastro' });
  cx = await A(PABLO, 'GET', '/esteira/caixa');
  chk('“Cadastrar produto novo” marca as fotos como em cadastro (continuam na caixa)', usC.j.marcadas === 2 && cx.j.itens.filter((x) => x.status === 'cadastro').length === 2 && cx.j.contagem.novas === 3, cx.j.itens.map((x) => x.status));
  const it = await A(GESTORA, 'GET', '/esteira/caixa/itens?ids=' + ids[U(2)] + ',' + ids[U(1)]);
  chk('Gestão lê as fotos na ordem pedida (quem cadastra, mesmo fora da equipe)', it.j.ok && it.j.itens.map((x) => x.url).join() === [U(2), U(1)].join(), it.j);
  chk('quem cadastra e está fora da equipe não abre o resto da Esteira', (await A(GESTORA, 'GET', '/esteira/hoje')).r.status === 403);
  const cr = await A(GESTORA, 'POST', '/esteira/caixa/usar', { ids: [ids[U(1)], ids[U(2)]], uso: 'criado', produto: '7001', produtoNome: 'Vestido novo' });
  chk('produto criado na Gestão marca as fotos como usadas, com a peça', cr.j.marcadas === 2, cr.j);
  chk('aviso repetido do cadastro (retomada) não muda nada', (await A(GESTORA, 'POST', '/esteira/caixa/usar', { ids: [ids[U(1)]], uso: 'criado', produto: '7001' })).j.marcadas === 0);
  const usadas = await A(PABLO, 'GET', '/esteira/caixa?ver=usadas');
  chk('aba Usadas mostra onde cada foto foi usada, quem e quando', usadas.j.itens.length === 3 && usadas.j.itens.every((x) => x.status === 'usada' && x.usoProduto && x.usadaPor && x.usadaEm) && usadas.j.itens.some((x) => x.usoNome === 'Vestido novo' && x.usadaPor === 'Gestora'), usadas.j.itens);
  const ds = await A(PABLO, 'POST', '/esteira/caixa/descartar', { ids: [ids[U(3)]] });
  let desc = await A(PABLO, 'GET', '/esteira/caixa?ver=descartadas');
  chk('gestor descarta foto (vai para Descartadas, nada é apagado)', ds.j.marcadas === 1 && desc.j.itens.length === 1 && desc.j.itens[0].id === ids[U(3)] && (await env.DB.prepare('SELECT COUNT(*) AS n FROM est_caixa').first()).n === 4, desc.j);
  const vol = await A(PABLO, 'POST', '/esteira/caixa/descartar', { ids: [ids[U(3)]], desfazer: true });
  cx = await A(PABLO, 'GET', '/esteira/caixa');
  chk('“Voltar para a caixa” desfaz o descarte', vol.j.marcadas === 1 && cx.j.itens.some((x) => x.id === ids[U(3)] && x.status === 'nova'));
  chk('foto usada não pode ser descartada por engano', (await A(PABLO, 'POST', '/esteira/caixa/descartar', { ids: [ids[U(4)]] })).j.marcadas === 0);
  cxB = await A(BIA, 'GET', '/esteira/caixa');
  chk('quem enviou acompanha o que foi usado', cxB.j.itens.filter((x) => x.status === 'usada').length === 2 && cxB.j.contagem.usadas === 2, cxB.j.contagem);
  const cols = (await env.DB.prepare('PRAGMA table_info(est_tarefa)').all()).results.map((c) => c.name);
  chk('colunas novas só acrescentadas (detalhe, op); nada removido', cols.includes('detalhe') && cols.includes('op') && cols.includes('instrucao') && cols.includes('obs'), cols);

  console.log(ok + ' ok, ' + falhas.length + ' falhas'); console.log('FALHAS=' + falhas.length); if (falhas.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
