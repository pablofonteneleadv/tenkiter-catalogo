// Esteira de Produtos (v7.41.0; preparação 7.42.0; pedidos 7.43.0): rotas /esteira/* com D1 REAL (SQLite do Node), catálogo e sessão FALSOS. Nada vai ao Google nem à Cloudflare.
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
  const respostasEquipe = [];   // v7.43.0: tudo o que a equipe recebeu de /esteira/* (para provar que custo e quantidade pedida nunca vazam)
  const A = async (whats, metodo, rota, corpo) => { const r = await w.fetch(new Request('https://ig.fake' + rota, { method: metodo, headers: { 'Content-Type': 'application/json', 'X-TK-Whats': whats, 'X-TK-Sessao': 'tk3.sessao-' + whats }, body: corpo ? JSON.stringify(corpo) : undefined }), env, ctx); const j = await r.json(); if (whats !== '88999990001') respostasEquipe.push({ rota, j }); return { r, j }; };
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


  // ---- v7.43.0: pedido ao fornecedor → chegada com contagem cega → aprovação ----
  const P = (who, rota, corpo) => A(who, 'POST', '/esteira/pedidos/' + rota, corpo);
  const vazouChave = (o, chaves) => { let achou = ''; const anda = (x) => { if (achou || !x || typeof x !== 'object') return; for (const k of Object.keys(x)) { if (chaves.includes(k)) { achou = k; return; } anda(x[k]); } }; anda(o); return achou; };
  chk('funcionária não cria pedido', (await P(IARA, 'salvar', { fornecedor: 'X', itens: [] })).r.status === 403);
  chk('pedido sem fornecedor é recusado', (await P(PABLO, 'salvar', { fornecedor: ' ', itens: [] })).r.status === 400);
  const itensPed = [
    { tipo: 'reposicao', produto: '1003', nome: 'Peça 3', fotos: ['https://midia.fake/m/p3.jpg'], qtd_pedida: 5, custo: '45,90' },
    { tipo: 'reposicao', produto: '1006', nome: 'Peça 6', qtd_pedida: 4, custo: 30 },
    { tipo: 'novo', nome: 'Vestido Chemise Novo', categoria: 'Vestidos', genero: 'Feminino Adulto', preco: '159,90', tamanhos: 'P, M, G', cores: 'Verde', fotos: ['https://midia.fake/m/forn1.jpg', 'javascript:alert(1)'], qtd_pedida: 6, custo: 70 },
    { tipo: 'novo', nome: 'Saia Lápis Nova', categoria: 'Saias', genero: 'Feminino Adulto', preco: '', qtd_pedida: 3, custo: 40 },
    { tipo: 'reposicao', produto: '1009', nome: 'Peça 9', qtd_pedida: 2, custo: 20 },
  ];
  chk('quantidade zero é recusada com o nome do item', /Peça 6/.test((await P(PABLO, 'salvar', { fornecedor: 'Confecção Aurora', itens: [itensPed[0], Object.assign({}, itensPed[1], { qtd_pedida: 0 })] })).j.erro || ''));
  chk('custo inválido é recusado', (await P(PABLO, 'salvar', { fornecedor: 'Confecção Aurora', itens: [Object.assign({}, itensPed[0], { custo: 'abc' })] })).r.status === 400);
  const sv = await P(PABLO, 'salvar', { fornecedor: 'Confecção Aurora', previsao: '2026-01-01', obs: 'Pedido de verão', fotos: ['https://midia.fake/m/nota.jpg'], itens: itensPed });
  const ped = sv.j.pedido || { itens: [] }, PID = ped.id;
  chk('Admin total cria pedido em rascunho com itens, custo (vírgula vira ponto) e foto só https', sv.j.ok && ped.status === 'rascunho' && ped.itens.length === 5 && ped.itens[0].custo === 45.9 && ped.itens[2].preco === '159.90' && ped.itens[2].fotos.length === 1 && ped.fotos.length === 1, sv.j);
  const ed = await P(PABLO, 'salvar', { id: PID, fornecedor: 'Confecção Aurora Ltda', previsao: '2026-01-01', itens: ped.itens.map((x) => Object.assign({}, x, x.id === ped.itens[1].id ? { qtd_pedida: 4, custo: 31 } : {})) });
  chk('editar mantém os ids dos itens e muda o custo', ed.j.ok && ed.j.pedido.fornecedor === 'Confecção Aurora Ltda' && ed.j.pedido.itens.map((x) => x.id).join() === ped.itens.map((x) => x.id).join() && ed.j.pedido.itens[1].custo === 31, ed.j);
  const ids = ped.itens.map((x) => x.id);
  let lsI = await A(IARA, 'GET', '/esteira/pedidos');
  chk('rascunho não aparece para a equipe', lsI.j.ok && lsI.j.pedidos.length === 0, lsI.j);
  chk('equipe não abre rascunho', (await A(IARA, 'GET', '/esteira/pedidos/abrir?id=' + PID)).r.status === 403);
  chk('equipe não conta pedido que não foi enviado', (await P(IARA, 'contar', { id: PID, item: ids[0], qtd: 5 })).r.status === 400);
  chk('funcionária não envia pedido', (await P(IARA, 'enviar', { id: PID })).r.status === 403);
  const en = await P(PABLO, 'enviar', { id: PID });
  chk('Admin total envia: pedido a caminho', en.j.ok && en.j.status === 'a_caminho', en.j);
  chk('enviar de novo: aviso', (await P(PABLO, 'enviar', { id: PID })).r.status === 400);
  const hj = await A(IARA, 'GET', '/esteira/hoje');
  chk('Hoje da equipe avisa pedido para conferir (só a contagem)', hj.j.pedidos && hj.j.pedidos.conferir === 1 && hj.j.pedidos.aprovar === undefined, hj.j.pedidos);
  lsI = await A(IARA, 'GET', '/esteira/pedidos');
  chk('equipe lista o pedido a caminho com o número de itens', lsI.j.pedidos.length === 1 && lsI.j.pedidos[0].itens === 5 && lsI.j.pedidos[0].contados === 0, lsI.j);
  const abI = await A(IARA, 'GET', '/esteira/pedidos/abrir?id=' + PID);
  chk('equipe abre o pedido SEM custo e SEM quantidade pedida (contagem cega)', abI.j.ok && abI.j.pedido.itens.length === 5 && !vazouChave(abI.j, ['custo', 'qtd_pedida', 'qtd_aceita', 'preco', 'decisao', 'obs']) && !('fotos' in abI.j.pedido) && abI.j.pedido.itens[2].nome === 'Vestido Chemise Novo', abI.j);
  const ct1 = await P(IARA, 'contar', { id: PID, item: ids[0], qtd: 5 });
  chk('contagem que bate: resposta diz só "bateu"', ct1.j.ok && ct1.j.bateu === true && Object.keys(ct1.j).sort().join() === 'bateu,contagens,item,ok', ct1.j);
  const ct2 = await P(IARA, 'contar', { id: PID, item: ids[1], qtd: 3 });
  chk('contagem que não bate: resposta diz só "não bateu", sem a quantidade esperada', ct2.j.ok && ct2.j.bateu === false && !/4/.test(JSON.stringify(ct2.j).replace(/"item":\d+/, '')), ct2.j);
  const ct2b = await P(CLARICE, 'contar', { id: PID, item: ids[1], qtd: 3 });
  chk('recontar soma tentativas', ct2b.j.contagens === 2 && ct2b.j.bateu === false, ct2b.j);
  chk('contagem vazia pede o número', /Digite quantas/.test((await P(IARA, 'contar', { id: PID, item: ids[2], qtd: '' })).j.erro || ''));
  await P(IARA, 'contar', { id: PID, item: ids[2], qtd: 8 });
  const cc = await P(IARA, 'concluir', { id: PID });
  chk('concluir com item sem contagem: diz quantos faltam', cc.r.status === 400 && cc.j.faltam === 2 && /Faltam contar 2/.test(cc.j.erro), cc.j);
  const nv = await P(IARA, 'nao-veio', { id: PID, item: ids[3] });
  chk('"não veio" marca o item', nv.j.ok && nv.j.naoVeio === true);
  await P(IARA, 'contar', { id: PID, item: ids[4], qtd: 2 });
  chk('extra sem nome é recusado', (await P(IARA, 'extra', { id: PID, nome: '', qtd: 2 })).r.status === 400);
  const ex = await P(IARA, 'extra', { id: PID, nome: 'Blusa listrada (não estava no pedido)', qtd: 2, fotos: ['https://midia.fake/m/extra.jpg'] });
  const ex2 = await P(IARA, 'extra', { id: PID, nome: 'Engano', qtd: 1 });
  chk('equipe inclui modelo que veio a mais', ex.j.ok && ex.j.item > 0 && ex2.j.ok);
  chk('tirar extra lançado por engano', (await P(IARA, 'extra-remover', { id: PID, item: ex2.j.item })).j.ok === true && (await P(IARA, 'extra-remover', { id: PID, item: ids[0] })).r.status === 404);
  const abI2 = await A(IARA, 'GET', '/esteira/pedidos/abrir?id=' + PID);
  const its2 = abI2.j.pedido.itens;
  chk('reabrir mostra o que foi contado (bateu/não bateu, não veio, extra) sem quantidade pedida', its2.length === 6 && its2[0].bateu === true && its2[1].bateu === false && its2[1].contagens === 2 && its2[3].nao_veio === true && its2[3].bateu === null && its2[5].tipo === 'extra' && its2[5].bateu === null && !vazouChave(abI2.j, ['custo', 'qtd_pedida']), its2);
  chk('equipe não decide nem aprova', (await P(IARA, 'decidir', { id: PID, item: ids[1], decisao: 'aceitar' })).r.status === 403 && (await P(CLARICE, 'aprovar', { id: PID })).r.status === 403);
  chk('equipe não lê o pedido salvo pelo Admin (salvar é só Admin)', (await P(CLARICE, 'salvar', { id: PID, fornecedor: 'X' })).r.status === 403);
  const abA = await A(PABLO, 'GET', '/esteira/pedidos/abrir?id=' + PID);
  chk('Admin total vê custo, quantidade pedida e a situação de cada item', abA.j.pedido.itens[1].qtd_pedida === 4 && abA.j.pedido.itens[1].custo === 31 && abA.j.pedido.itens.map((x) => x.situacao).join() === 'bateu,faltou,sobrou,nao_veio,bateu,extra', abA.j.pedido.itens.map((x) => x.situacao));
  chk('Admin não remove item já contado', /já foi contado/.test((await P(PABLO, 'salvar', { id: PID, fornecedor: 'Confecção Aurora Ltda', itens: abA.j.pedido.itens.filter((x) => x.tipo !== 'extra').slice(1) })).j.erro || ''));
  const co = await P(IARA, 'concluir', { id: PID });
  chk('equipe envia a chegada para aprovação', co.j.ok && co.j.status === 'conferido', co.j);
  chk('depois de enviada, a equipe não conta mais nem abre', (await P(IARA, 'contar', { id: PID, item: ids[0], qtd: 1 })).r.status === 400 && (await A(IARA, 'GET', '/esteira/pedidos/abrir?id=' + PID)).r.status === 403);
  const hA = await A(PABLO, 'GET', '/esteira/hoje');
  chk('Hoje do Admin avisa chegada esperando aprovação', hA.j.pedidos.aprovar === 1 && hA.j.pedidos.conferir === 0, hA.j.pedidos);
  const ap0 = await P(PABLO, 'aprovar', { id: PID });
  chk('aprovar sem decidir as diferenças: lista o que falta', ap0.r.status === 400 && ap0.j.pendentes.length === 4, ap0.j);
  chk('decisão fora das opções é recusada', (await P(PABLO, 'decidir', { id: PID, item: ids[1], decisao: 'incluir' })).r.status === 400);
  chk('faltou → cobrar fornecedor', (await P(PABLO, 'decidir', { id: PID, item: ids[1], decisao: 'cobrar', obs: 'Faltou 1' })).j.item.decisao === 'cobrar');
  chk('sobrou → devolver a sobra', (await P(PABLO, 'decidir', { id: PID, item: ids[2], decisao: 'devolver' })).j.ok === true);
  chk('não veio → aceitar', (await P(PABLO, 'decidir', { id: PID, item: ids[3], decisao: 'aceitar' })).j.ok === true);
  const dx = await P(PABLO, 'decidir', { id: PID, item: ex.j.item, decisao: 'incluir', custo: '25,5', nome: 'Blusa Listrada', categoria: 'Blusas', genero: 'Feminino Adulto', preco: '79,90', tamanhos: 'M', cores: 'Azul' });
  chk('veio a mais → incluir com custo e dados do produto', dx.j.ok && dx.j.item.custo === 25.5 && dx.j.item.categoria === 'Blusas' && dx.j.item.preco === '79.90', dx.j);
  const ap = await P(PABLO, 'aprovar', { id: PID });
  const qa = (ap.j.pedido || { itens: [] }).itens.map((x) => x.qtd_aceita);
  chk('aprovar calcula o aceito: 5, 3 (cobrar), 6 (devolveu 2), 0 (não veio), 2, 2 (extra incluído)', ap.j.ok && ap.j.pedido.status === 'aprovado' && qa.join() === '5,3,6,0,2,2', qa);
  chk('item que não veio já fica resolvido (nada a levar ao catálogo)', !!ap.j.pedido.itens[3].aplicado_em && !ap.j.pedido.itens[0].aplicado_em);
  chk('aprovar de novo: aviso', (await P(PABLO, 'aprovar', { id: PID })).r.status === 400);
  chk('Hoje do Admin avisa o que falta levar ao catálogo', (await A(PABLO, 'GET', '/esteira/hoje')).j.pedidos.aplicar === 1);
  // aplicado: idempotência por item
  chk('equipe não registra aplicação', (await P(IARA, 'aplicado', { id: PID, item: ids[0], fase: 'inicio', antes: 3 })).r.status === 403);
  const in1 = await P(PABLO, 'aplicado', { id: PID, item: ids[0], fase: 'inicio', antes: 3 });
  const in2 = await P(PABLO, 'aplicado', { id: PID, item: ids[0], fase: 'inicio', antes: 8 });
  chk('reposição guarda o estoque de partida uma vez só (3 → 8)', in1.j.aplic.antes === 3 && in1.j.aplic.depois === 8 && in2.j.aplic.antes === 3 && in2.j.aplic.depois === 8, [in1.j, in2.j]);
  chk('"somar de novo" (refazer) recalcula a partir do estoque atual', (await P(PABLO, 'aplicado', { id: PID, item: ids[0], fase: 'inicio', antes: 10, refazer: true })).j.aplic.depois === 15);
  const f1 = await P(PABLO, 'aplicado', { id: PID, item: ids[0] }), f2 = await P(PABLO, 'aplicado', { id: PID, item: ids[0] });
  chk('marcar aplicado duas vezes não repete', f1.j.ok && !!f1.j.item.aplicado_em && f2.j.jaAplicado === true, [f1.j, f2.j]);
  chk('produto novo não fecha sem produto criado', (await P(PABLO, 'aplicado', { id: PID, item: ids[2] })).r.status === 400);
  const cr1 = await P(PABLO, 'aplicado', { id: PID, item: ids[2], fase: 'criado', produtoCriado: '5001', codigo: 'TK-5001' });
  const cr2 = await P(PABLO, 'aplicado', { id: PID, item: ids[2], fase: 'criado', produtoCriado: '5002' });
  chk('produto criado fica guardado; segunda criação devolve o primeiro', cr1.j.produtoCriado === '5001' && cr2.j.produtoCriado === '5001' && cr2.j.jaTinha === true, [cr1.j, cr2.j]);
  chk('item sem quantidade aceita não é aplicado', (await P(PABLO, 'aplicado', { id: PID, item: ids[3], fase: 'criado', produtoCriado: '1' })).j.jaAplicado === true);
  await P(PABLO, 'aplicado', { id: PID, item: ids[2] });
  const lsA = await A(PABLO, 'GET', '/esteira/pedidos');
  chk('lista do Admin mostra quantos itens faltam levar ao catálogo', lsA.j.pedidos.find((x) => x.id === PID).faltaAplicar === 3, lsA.j.pedidos);
  // cancelar
  const sv2 = await P(PABLO, 'salvar', { fornecedor: 'Outro', itens: [itensPed[1]] });
  chk('cancelar pedido', (await P(PABLO, 'cancelar', { id: sv2.j.pedido.id })).j.status === 'cancelado' && (await P(PABLO, 'cancelar', { id: PID })).r.status === 400);
  chk('pedido sem categoria no produto novo não é enviado', /categoria/.test((await P(PABLO, 'enviar', { id: (await P(PABLO, 'salvar', { fornecedor: 'Y', itens: [{ tipo: 'novo', nome: 'Sem cat', qtd_pedida: 1 }] })).j.pedido.id })).j.erro || ''));
  const vaz = respostasEquipe.find((x) => vazouChave(x.j, ['custo', 'qtd_pedida']));
  chk('nenhuma resposta para quem não é Admin total contém custo ou qtd_pedida (' + respostasEquipe.length + ' respostas)', !vaz && respostasEquipe.some((x) => x.rota.includes('/pedidos')), vaz);
  console.log(ok + ' ok, ' + falhas.length + ' falhas'); if (falhas.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
