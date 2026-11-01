// Esteira de Produtos (v7.41.0): rotas /esteira/* com D1 REAL (SQLite do Node), catálogo e sessão FALSOS. Nada vai ao Google nem à Cloudflare.
const fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const tmp = path.join(os.tmpdir(), 'tk_ig_esteira.mjs');
fs.writeFileSync(tmp, fs.readFileSync(process.env.TK_WORKER_SOURCE || path.join(__dirname, '..', 'instagram-worker', 'worker.js')) + '\nexport {estMontarListas_};');
let ok = 0; const falhas = [];
const chk = (n, c, d) => { if (c) { ok++; console.log('  ✔ ' + n); } else { falhas.push(n); console.log('  ✘ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 300) : '')); } };
function d1() {
  const db = new DatabaseSync(':memory:');
  const prep = (sql) => { const S = () => db.prepare(sql); let args = []; const o = { bind(...a) { args = a; return o; }, async all() { return { results: S().all(...args).map((x) => ({ ...x })) }; }, async first() { const r = S().get(...args); return r ? { ...r } : null; }, async run() { const r = S().run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; }, _run() { const r = S().run(...args); return { meta: { changes: r.changes } }; } }; return o; };
  return { prepare: prep, async batch(l) { db.exec('BEGIN'); const out = []; try { for (const st of l) out.push(st._run()); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } return out; } };
}
const dia = (n) => new Date(Date.now() - n * 864e5).toISOString();
(async () => {
  const W = await import(tmp), w = W.default;
  const cacheMem = new Map();
  globalThis.caches = { default: { async match(r) { const v = cacheMem.get(r.url); return v ? new Response(v) : undefined; }, async put(r, x) { cacheMem.set(r.url, await x.text()); } } };
  const kv = new Map();
  const KV = { async get(k) { return kv.has(k) ? kv.get(k) : null; }, async put(k, v) { kv.set(k, String(v)); }, async delete(k) { kv.delete(k); } };
  // catálogo falso: 70 peças ativas + 1 inativa; vestidos e saias em grupos
  const produtos = [];
  for (let i = 0; i < 70; i++) produtos.push({ ID: String(1000 + i), Nome: 'Peça ' + i, Codigo: 'TK-' + i, Categoria: i % 3 === 0 ? 'Vestidos' : i % 3 === 1 ? 'Saias' : 'Blusas', Genero: 'Feminino Adulto', Estoque: String(i % 5), Tamanhos: 'P, M, G', Cores: 'Preto', Foto_URL: '', Status: 'Ativo', Data_Cadastro: dia(10 + i) });
  produtos.push({ ID: '9999', Nome: 'Inativa', Status: 'Inativo', Data_Cadastro: dia(400) });
  const usuarios = { '88999990001': { nome: 'Pablo', permissoes: ['gerir_acessos', 'catalogo_admin'] }, '88999990002': { nome: 'Iara', permissoes: ['catalogo_cadastrar'] }, '88999990003': { nome: 'Clarice', permissoes: ['catalogo_cadastrar'] }, '88999990004': { nome: 'Visitante', permissoes: [] } };
  let listas = 0;
  globalThis.fetch = async (u, init) => {
    u = String(u);
    if (u.startsWith('https://api.fake/')) {
      if (init && init.method === 'POST') { const b = JSON.parse(init.body); if (b.action === 'sessao') { const x = usuarios[b.whatsapp]; return new Response(JSON.stringify(x ? { ok: true, usuario: { ...x, perfis: [] } } : { ok: false })); } }
      if (u.includes('action=list')) { listas++; return new Response(JSON.stringify({ ok: true, produtos })); }
    }
    return new Response('{}', { status: 404 });
  };
  const env = { DB: d1(), CACHE: KV, API_URL: 'https://api.fake/exec' };
  const ctx = { waitUntil() {} };
  const A = async (whats, metodo, rota, corpo) => { const r = await w.fetch(new Request('https://ig.fake' + rota, { method: metodo, headers: { 'Content-Type': 'application/json', 'X-TK-Whats': whats, 'X-TK-Sessao': 'tk3.sessao-' + whats }, body: corpo ? JSON.stringify(corpo) : undefined }), env, ctx); return { r, j: await r.json() }; };
  const PABLO = '88999990001', IARA = '88999990002', CLARICE = '88999990003', VISITA = '88999990004';

  // acesso
  chk('sem sessão é recusado', (await w.fetch(new Request('https://ig.fake/esteira/hoje'), env, ctx)).status === 401);
  const v = await A(VISITA, 'GET', '/esteira/hoje');
  chk('quem não está na equipe recebe aviso em português', v.r.status === 403 && /equipe da Esteira/.test(v.j.erro), v.j);
  chk('funcionária não abre configurações', (await A(IARA, 'GET', '/esteira/config')).r.status === 403);

  // configurações (Admin total)
  const c0 = await A(PABLO, 'GET', '/esteira/config');
  chk('config padrão: 20 por pessoa, 21 dias, 4 funções', c0.j.ok && c0.j.config.porPessoa === 20 && c0.j.config.diasSemRepetir === 21 && c0.j.config.funcoes.join() === 'Limpeza,Caixa,Fotos,Atendimento online', c0.j.config);
  chk('WhatsApp curto é recusado', (await A(PABLO, 'POST', '/esteira/equipe', { whats: '123', nome: 'X' })).r.status === 400);
  await A(PABLO, 'POST', '/esteira/equipe', { whats: '55' + IARA, nome: 'Iara', confere: true, rodizio: true, atendente: true });
  const eq = await A(PABLO, 'POST', '/esteira/equipe', { whats: CLARICE, nome: 'Clarice', confere: true, rodizio: true, atendente: true, aceitar: true });
  chk('equipe gravada (55 do país é tirado do número)', eq.j.ok && eq.j.equipe.length === 2 && eq.j.equipe.some((e) => e.whats === IARA), eq.j);
  chk('configuração inválida é recusada', (await A(PABLO, 'POST', '/esteira/config', { config: { porPessoa: 0, diasSemRepetir: 21 } })).r.status === 400);

  // lista do dia
  const h1 = await A(IARA, 'GET', '/esteira/hoje');
  chk('Iara recebe 20 peças', h1.j.ok && h1.j.total === 20 && h1.j.lista.length === 20, { t: h1.j.total, e: h1.j.erro });
  const h2 = await A(CLARICE, 'GET', '/esteira/hoje');
  const idsI = new Set(h1.j.lista.map((x) => x.id)), idsC = h2.j.lista.map((x) => x.id);
  chk('listas não repetem peça entre as funcionárias', h2.j.total === 20 && idsC.every((id) => !idsI.has(id)));
  chk('peça inativa nunca entra', !idsI.has('9999') && !idsC.includes('9999'));
  const grupos = h1.j.lista.map((x) => x.grupo);
  chk('peças agrupadas: a lista vem em blocos da mesma categoria', grupos.filter((g, k) => k === 0 || g !== grupos[k - 1]).length <= 4, grupos);
  chk('cada peça traz data de cadastro e de atualização', h1.j.lista.every((x) => 'cadastro' in x && 'atualizado_em' in x));
  const h1b = await A(IARA, 'GET', '/esteira/hoje');
  chk('abrir de novo não muda a lista do dia', h1b.j.lista.map((x) => x.id).join() === h1.j.lista.map((x) => x.id).join());
  chk('catálogo vem do cache (uma consulta só)', listas === 1, listas);

  // conferência
  const alvo = h1.j.lista[0];
  const cf = await A(IARA, 'POST', '/esteira/conferir', { id: alvo.id, achou: true, estoqueAntes: '4', estoqueDepois: '2' });
  chk('conferir marca divergência quando o estoque mudou', cf.j.ok && cf.j.divergiu === true, cf.j);
  const h1c = await A(IARA, 'GET', '/esteira/hoje');
  chk('peça conferida aparece como feita e conta no progresso', h1c.j.feitas === 1 && h1c.j.lista.find((x) => x.id === alvo.id).feito === true);

  // regra: atualizada à mão há pouco fica de fora
  const montar = W.estMontarListas_;
  const cat = [{ id: 'a', cadastro: dia(200), categoria: 'X', genero: '', estoque: '1' }, { id: 'b', cadastro: dia(200), categoria: 'X', genero: '', estoque: '1' }, { id: 'c', cadastro: dia(5), categoria: 'Y', genero: '', estoque: '' }];
  const cfg = { porPessoa: 3, diasSemRepetir: 21, pesos: { nunca: 40, diaConf: 1, diaCadastro: 0.5, diaSemEdicao: 0.3, estoqueBaixo: 15, divergiu: 20 } };
  const r1 = montar(cat, { b: { atualizado_em: dia(3) } }, cfg, ['p'], [], Date.now()).p.map((x) => x.p.id);
  chk('peça atualizada à mão há 3 dias não entra (respeita os 21 dias)', !r1.includes('b') && r1.includes('a'), r1);
  const r2 = montar(cat, { a: { conferido_em: dia(30) } }, cfg, ['p'], [], Date.now()).p.map((x) => x.p.id);
  chk('nunca conferida e antiga vem antes da recente', r2[0] === 'b' && r2.at(-1) === 'c', r2);
  const tq = await A(IARA, 'POST', '/esteira/toque', { ids: [h2.j.lista[0].id] });
  chk('Gestão registra atualização manual', tq.j.ok && tq.j.registradas === 1, tq.j);

  // escala
  chk('pessoa fora do rodízio é recusada na escala', (await A(PABLO, 'POST', '/esteira/escala', { tipo: 'dia', funcao: 'Fotos', whats: VISITA })).r.status === 400);
  const hojeDia = new Date(Date.now() - 3 * 3600e3).getUTCDay();
  await A(PABLO, 'POST', '/esteira/escala', { tipo: 'padrao', dia: hojeDia, funcao: 'Fotos', whats: CLARICE });
  let hc = await A(CLARICE, 'GET', '/esteira/hoje');
  chk('padrão da semana define a função do dia', hc.j.funcoes.some((f) => f.funcao === 'Fotos'), hc.j.funcoes);
  await A(PABLO, 'POST', '/esteira/escala', { tipo: 'dia', funcao: 'Fotos', whats: IARA });
  hc = await A(IARA, 'GET', '/esteira/hoje');
  chk('troca manual do dia vale sobre o padrão', hc.j.funcoes.some((f) => f.funcao === 'Fotos') && hc.j.escala.find((e) => e.funcao === 'Fotos').alterado === true, hc.j.escala);
  await A(PABLO, 'POST', '/esteira/config', { config: { porPessoa: 20, diasSemRepetir: 21, funcoes: ['Limpeza', 'Caixa', 'Fotos', 'Atendimento online'], instrucoes: { Fotos: 'Fotografar as peças novas no manequim.' } } });
  hc = await A(IARA, 'GET', '/esteira/hoje');
  chk('instruções da função aparecem para quem está nela', (hc.j.funcoes.find((f) => f.funcao === 'Fotos') || {}).instrucoes === 'Fotografar as peças novas no manequim.');

  // painel
  const pn = await A(PABLO, 'GET', '/esteira/painel');
  chk('painel mostra progresso de cada uma, divergência e idade do estoque', pn.j.ok && pn.j.progresso.length === 2 && pn.j.divergencia30.divergentes === 1 && pn.j.idade && pn.j.idade.ate30 + pn.j.idade.ate60 + pn.j.idade.ate90 + pn.j.idade.mais90 === 70, pn.j);
  chk('funcionária não abre o painel', (await A(IARA, 'GET', '/esteira/painel')).r.status === 403);
  const rf = await A(PABLO, 'POST', '/esteira/refazer-hoje');
  chk('refazer hoje mantém a lista já começada', rf.j.ok && rf.j.mantidas === 1, rf.j);

  // ---- v7.42.0: preparação ----
  // hoje: Fotos = Iara (troca do dia); Clarice tem a marca "aceita"; Visitante entra na equipe sem função nem marca
  await A(PABLO, 'POST', '/esteira/equipe', { whats: VISITA, nome: 'Visitante', confere: false, rodizio: false });
  const cfgP = await A(PABLO, 'GET', '/esteira/config');
  chk('modelos padrão da preparação: 5 tarefas, fotos com a função Fotos', cfgP.j.config.modelosPreparacao.length === 5 && cfgP.j.config.modelosPreparacao.filter((m) => m.tipo === 'foto').every((m) => m.funcao === 'Fotos') && cfgP.j.config.modelosPreparacao[0].titulo === 'Cadastro conferido', cfgP.j.config.modelosPreparacao);
  const prI = await A(IARA, 'POST', '/esteira/preparar', { id: '9999' });
  chk('quem não aceita não coloca peça em preparação', prI.r.status === 403 && /aceita/.test(prI.j.erro), prI.j);
  const pr1 = await A(CLARICE, 'POST', '/esteira/preparar', { id: '9999', nome: 'Inativa', codigo: 'TK-9999', foto: 'javascript:alert(1)' });
  chk('quem aceita coloca peça (arquivada) em preparação com as 5 tarefas', pr1.j.ok && pr1.j.criadas === 5, pr1.j);
  chk('colocar de novo não duplica tarefas', (await A(CLARICE, 'POST', '/esteira/preparar', { id: '9999' })).j.jaEstava === true);
  let pp = await A(IARA, 'GET', '/esteira/preparacao');
  const prod = (pp.j.produtos || [])[0] || {};
  chk('preparação lista a peça com nome guardado, tarefas e progresso 0/5', pp.j.ok && pp.j.produtos.length === 1 && prod.nome === 'Inativa' && prod.foto === '' && prod.total === 5 && prod.feitas === 0 && prod.noSite === false, pp.j);
  chk('quem está em Fotos hoje pode marcar as tarefas; não pode aceitar', prod.tarefas.every((t) => t.posso && t.quem === 'Iara') && pp.j.podeAceitar === false);
  let hI = await A(IARA, 'GET', '/esteira/hoje');
  chk('aba Hoje traz as tarefas da função do dia', hI.j.tarefas.length === 5 && hI.j.tarefas.every((t) => t.produtoNome === 'Inativa' && t.funcao === 'Fotos'), hI.j.tarefas);
  chk('quem não está na função não recebe as tarefas no Hoje', (await A(CLARICE, 'GET', '/esteira/hoje')).j.tarefas.length === 0);
  const t1 = prod.tarefas[0], t2 = prod.tarefas[1];
  const tv = await A(VISITA, 'POST', '/esteira/tarefa', { id: t1.id, feita: true });
  chk('fora da função do dia: recusa explicando de quem é', tv.r.status === 403 && /Fotos hoje \(Iara\)/.test(tv.j.erro), tv.j);
  const tf = await A(IARA, 'POST', '/esteira/tarefa', { id: t1.id, feita: true, obs: 'Conferi com a etiqueta' });
  chk('quem está na função marca Feito com observação', tf.j.ok && tf.j.tarefa.status === 'feita' && tf.j.tarefa.feita_por === 'Iara' && tf.j.tarefa.obs === 'Conferi com a etiqueta', tf.j);
  const td = await A(IARA, 'POST', '/esteira/tarefa', { id: t1.id, feita: false });
  chk('desfazer volta a tarefa para pendente', td.j.ok && td.j.tarefa.status === 'pendente' && td.j.tarefa.feita_em === '', td.j);
  await A(IARA, 'POST', '/esteira/tarefa', { id: t1.id, feita: true });
  chk('quem aceita também marca tarefa de outra função', (await A(CLARICE, 'POST', '/esteira/tarefa', { id: t2.id, feita: true })).j.ok === true);
  chk('tarefa inexistente: aviso legível', (await A(IARA, 'POST', '/esteira/tarefa', { id: 99999, feita: true })).r.status === 404);
  chk('tarefa avulsa: só quem aceita cria', (await A(IARA, 'POST', '/esteira/tarefa-nova', { produto: '9999', titulo: 'X', funcao: 'Caixa' })).r.status === 403);
  chk('tarefa avulsa com função fora do rodízio é recusada', (await A(CLARICE, 'POST', '/esteira/tarefa-nova', { produto: '9999', titulo: 'X', funcao: 'Vitrine' })).r.status === 400);
  const tn = await A(CLARICE, 'POST', '/esteira/tarefa-nova', { produto: '9999', titulo: 'Passar etiqueta', funcao: 'Caixa' });
  chk('tarefa avulsa criada', tn.j.ok && tn.j.id > 0, tn.j);
  pp = await A(IARA, 'GET', '/esteira/preparacao');
  chk('progresso 2/6 e a avulsa de Caixa não é da Iara', pp.j.produtos[0].feitas === 2 && pp.j.produtos[0].total === 6 && pp.j.produtos[0].tarefas.find((t) => t.titulo === 'Passar etiqueta').posso === false, pp.j.produtos[0]);

  // conferência com "Pedir foto nova" → tarefa para Fotos
  const pecaFoto = h1.j.lista[1].id;
  const cfN = await A(IARA, 'POST', '/esteira/conferir', { id: pecaFoto, achou: true, estoqueAntes: '1', estoqueDepois: '1', fotoNova: true });
  const cfN2 = await A(IARA, 'POST', '/esteira/conferir', { id: pecaFoto, achou: true, estoqueAntes: '1', estoqueDepois: '1', fotoNova: true });
  chk('pedir foto nova cria tarefa (sem duplicar)', cfN.j.tarefaFoto > 0 && cfN2.j.tarefaFoto === cfN.j.tarefaFoto, [cfN.j, cfN2.j]);
  pp = await A(IARA, 'GET', '/esteira/preparacao');
  const fn = pp.j.outras.find((t) => t.produto === pecaFoto) || {};
  chk('foto nova aparece em Preparação (outras) para a função Fotos, com nome da peça', fn.titulo === 'Foto nova' && fn.funcao === 'Fotos' && fn.origem === 'conferencia' && fn.tipo === 'foto' && /^Peça /.test(fn.produtoNome) && /Iara/.test(fn.instrucao), fn);
  hI = await A(IARA, 'GET', '/esteira/hoje');
  chk('foto nova entra nas tarefas do Hoje de quem está em Fotos', hI.j.tarefas.some((t) => t.id === cfN.j.tarefaFoto));

  // aceitar para o site
  chk('quem não aceita não aceita peça', (await A(IARA, 'POST', '/esteira/aceitar', { id: '9999' })).r.status === 403);
  const ac = await A(CLARICE, 'POST', '/esteira/aceitar', { id: '9999' });
  chk('aceitar marca no_site e dispensa o que faltava (3 do modelo + 1 avulsa)', ac.j.ok && ac.j.dispensadas === 4, ac.j);
  const linhaP = await env.DB.prepare('SELECT etapa, aceito_por, aceito_em FROM est_produto WHERE id=?').bind('9999').first();
  chk('produto gravado com etapa, quem e quando aceitou', linhaP.etapa === 'no_site' && linhaP.aceito_por === CLARICE && !!linhaP.aceito_em, linhaP);
  pp = await A(IARA, 'GET', '/esteira/preparacao');
  chk('peça aceita sai da preparação; a foto nova continua', pp.j.produtos.length === 0 && pp.j.outras.length === 1);
  chk('aceitar de novo: aviso de que não está em preparação', (await A(CLARICE, 'POST', '/esteira/aceitar', { id: '9999' })).r.status === 400);
  const disp = await A(IARA, 'POST', '/esteira/tarefa', { id: prod.tarefas[2].id, feita: true });
  chk('tarefa dispensada não é marcada', disp.r.status === 400 && /dispensada/.test(disp.j.erro), disp.j);
  chk('Hoje sem as tarefas dispensadas', (await A(IARA, 'GET', '/esteira/hoje')).j.tarefas.length === 1);

  // modelos editáveis (salvamento parcial não mexe nas regras)
  chk('modelos vazios são recusados', (await A(PABLO, 'POST', '/esteira/config', { config: { modelosPreparacao: [{ titulo: '  ' }] } })).r.status === 400);
  chk('funcionária não muda os modelos', (await A(IARA, 'POST', '/esteira/config', { config: { modelosPreparacao: [{ titulo: 'X' }] } })).r.status === 403);
  const cm = await A(PABLO, 'POST', '/esteira/config', { config: { modelosPreparacao: [{ tipo: 'foto', titulo: 'Foto de capa', instrucao: 'Fundo claro', funcao: 'Fotos' }, { tipo: 'xx', titulo: 'Etiqueta', funcao: 'Caixa' }] } });
  chk('modelos salvos sem mexer nas outras regras', cm.j.ok && cm.j.config.modelosPreparacao.length === 2 && cm.j.config.modelosPreparacao[1].tipo === 'outro' && cm.j.config.porPessoa === 20 && cm.j.config.instrucoes.Fotos === 'Fotografar as peças novas no manequim.', cm.j.config);
  const pr2 = await A(PABLO, 'POST', '/esteira/preparar', { id: '1005', nome: 'Peça 5' });
  chk('nova preparação usa os modelos editados', pr2.j.criadas === 2);
  pp = await A(PABLO, 'GET', '/esteira/preparacao');
  chk('peça ativa em preparação mostra dados do catálogo', pp.j.produtos[0].noSite === true && pp.j.produtos[0].codigo === 'TK-5' && pp.j.podeAceitar === true, pp.j.produtos[0]);

  console.log(ok + ' ok, ' + falhas.length + ' falhas'); if (falhas.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
