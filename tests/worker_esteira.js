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

  console.log(ok + ' ok, ' + falhas.length + ' falhas'); if (falhas.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
