// Esteira de Produtos (v7.41.0; preparação 7.42.0; pedidos 7.43.0): rotas /esteira/* com D1 REAL (SQLite do Node), catálogo e sessão FALSOS. Nada vai ao Google nem à Cloudflare.
const fs = require('fs'), path = require('path'), os = require('os');
const { DatabaseSync } = require('node:sqlite');
const tmp = path.join(os.tmpdir(), 'tk_ig_esteira.mjs');
fs.writeFileSync(tmp, fs.readFileSync(process.env.TK_WORKER_SOURCE || path.join(__dirname, '..', 'instagram-worker', 'worker.js')) + '\nexport {estMontarListas_, estRetratoCron_, estParadas_, estValidarCampos_, estFornecedorLimpo_, estGarantirListas_};');
let ok = 0; const falhas = [];
const chk = (n, c, d) => { if (c) { ok++; console.log('  ✔ ' + n); } else { falhas.push(n); console.log('  ✘ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 300) : '')); } };
function d1() {
  const db = new DatabaseSync(':memory:');
  const prep = (sql) => { const S = () => db.prepare(sql); let args = []; const o = { bind(...a) { args = a; return o; }, async all() { return { results: S().all(...args).map((x) => ({ ...x })) }; }, async first() { const r = S().get(...args); return r ? { ...r } : null; }, async run() { const r = S().run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; }, _run() { const s = S(); if (s.columns().length) return { results: s.all(...args).map(x => ({ ...x })) }; const r = s.run(...args); return { meta: { changes: r.changes } }; } }; return o; };
  return { prepare: prep, async batch(l) { db.exec('BEGIN'); const out = []; try { for (const st of l) out.push(st._run()); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } return out; } };
}
const dia = (n) => new Date(Date.now() - n * 864e5).toISOString();
(async () => {
  const W = await import(require('url').pathToFileURL(tmp).href), w = W.default;
  const cacheMem = new Map();
  globalThis.caches = { default: { async match(r) { const v = cacheMem.get(r.url); return v ? new Response(v) : undefined; }, async put(r, x) { cacheMem.set(r.url, await x.text()); } } };
  const kv = new Map();
  const KV = { async get(k) { return kv.has(k) ? kv.get(k) : null; }, async put(k, v) { kv.set(k, String(v)); }, async delete(k) { kv.delete(k); } };
  // catálogo falso: 70 peças ativas + 1 inativa; vestidos e saias em grupos
  const produtos = [];
  for (let i = 0; i < 70; i++) produtos.push({ ID: String(1000 + i), Nome: 'Peça ' + i, Codigo: 'TK-' + i, Categoria: i % 3 === 0 ? 'Vestidos' : i % 3 === 1 ? 'Saias' : 'Blusas', Genero: 'Feminino Adulto', Estoque: String(i % 5), Tamanhos: 'P, M, G', Cores: 'Preto', Foto_URL: '', Status: 'Ativo', Data_Cadastro: dia(10 + i) });
  produtos.push({ ID: '9999', Nome: 'Inativa', Status: 'Inativo', Data_Cadastro: dia(400) });
  const usuarios = { '88999990001': { nome: 'Pablo', permissoes: ['gerir_acessos', 'catalogo_admin'] }, '88999990002': { nome: 'Iara', permissoes: ['catalogo_cadastrar'] }, '88999990003': { nome: 'Clarice', permissoes: ['catalogo_cadastrar'] }, '88999990004': { nome: 'Visitante', permissoes: [] } };
  let listas = 0, LISTAS_ON = false, listasPedidas = 0, catalogoComErro = false;   // v7.48.0: listas da Gestão (categorias, públicos, tamanhos e cores) ligadas só nos testes novos
  globalThis.fetch = async (u, init) => {
    u = String(u);
    if (u.startsWith('https://api.fake/') && /action=(categorias|generos|opcoes)/.test(u)) {
      listasPedidas++;
      if (!LISTAS_ON) return new Response('{"ok":false}', { status: 500 });
      if (u.includes('action=categorias')) return new Response(JSON.stringify({ categorias: ['Vestidos', 'Saias', 'Blusas', 'Moda praia'] }));
      if (u.includes('action=generos')) return new Response(JSON.stringify({ generos: ['Feminino Adulto', 'Masculino Infantil'] }));
      return new Response(JSON.stringify({ ok: true, tamanhos: ['PP', 'P', 'M', 'G', 'GG'], cores: ['Preto', 'Azul', 'Verde', 'Off-white'] }));
    }
    if (u.startsWith('https://api.fake/')) {
      if (init && init.method === 'POST') { const b = JSON.parse(init.body); if (b.action === 'sessao') { const x = usuarios[b.whatsapp]; return new Response(JSON.stringify(x ? { ok: true, usuario: { ...x, perfis: [] } } : { ok: false })); } }
      if (u.includes('action=list')) { listas++; return catalogoComErro ? new Response('{}', { status: 503 }) : new Response(JSON.stringify({ ok: true, produtos })); }
    }
    return new Response('{}', { status: 404 });
  };
  const env = { DB: d1(), CACHE: KV, API_URL: 'https://api.fake/exec' };
  const ctx = { waitUntil() {} };
  const respostasEquipe = [];   // v7.43.0: tudo o que a equipe recebeu de /esteira/* (para provar que custo e quantidade pedida nunca vazam)
  const A = async (whats, metodo, rota, corpo) => { const r = await w.fetch(new Request('https://ig.fake' + rota, { method: metodo, headers: { 'Content-Type': 'application/json', 'X-TK-Whats': whats, 'X-TK-Sessao': 'tk3.sessao-' + whats, 'Origin': 'https://tenkitermodas.com.br' }, body: corpo ? JSON.stringify(corpo) : undefined }), env, ctx); const j = await r.json(); if (whats !== '88999990001') respostasEquipe.push({ rota, j }); return { r, j }; };
  const PABLO = '88999990001', IARA = '88999990002', CLARICE = '88999990003', VISITA = '88999990004';

  // acesso
  chk('sem sessão é recusado', (await w.fetch(new Request('https://ig.fake/esteira/hoje'), env, ctx)).status === 401);
  const v = await A(VISITA, 'GET', '/esteira/hoje');
  chk('quem não está na equipe recebe aviso em português e sinal de revogação', v.r.status === 403 && v.j.acessoRevogado && /Esteira/.test(v.j.erro), v.j);
  chk('recusa de acesso não expõe métricas', !v.r.headers.has('Server-Timing') && !v.r.headers.has('Timing-Allow-Origin'));
  chk('funcionária sem vínculo não abre configurações', (await A(IARA, 'GET', '/esteira/config')).r.status === 403);

  { // A Esteira confirma cada requisição sem tocar no cache de autorização.
    const cacheAnterior = globalThis.caches, fetchAnterior = globalThis.fetch;
    const consultar = (envio = env) => w.fetch(new Request('https://ig.fake/esteira/menu', { headers: {
      'X-TK-Whats': PABLO, 'X-TK-Sessao': 'tk3.sessao-' + PABLO, 'Origin': 'https://tenkitermodas.com.br',
    } }), envio, ctx);
    let toques = 0, catalogo = 0, rh = 0;
    try {
      globalThis.caches = { default: { async match() { toques++; throw Error('cache indisponível'); }, async put() { toques++; throw Error('cache indisponível'); } } };
      globalThis.fetch = async (url, init) => {
        if (String(url) === 'https://rh.fake/exec') {
          rh++;
          return new Response(JSON.stringify({ ok: true, usuario: { permissoes: rh === 1 ? ['gerir_acessos'] : [], acessosConfiguraveis: true } }));
        }
        catalogo++;
        return fetchAnterior(url, init);
      };
      const direta = await consultar();
      chk('Menu funciona sem Cache API e mede a sessão no catálogo', direta.ok && /sessao_catalogo;dur=/.test(direta.headers.get('Server-Timing')) && !/sessao_rh;dur=/.test(direta.headers.get('Server-Timing')));
      const comRH = { ...env, RH_URL: 'https://rh.fake/exec' };
      const permitida = await consultar(comRH), negada = await consultar(comRH);
      chk('Fallback do RH é medido separadamente e revogação vale na requisição seguinte', permitida.ok && /sessao_rh;dur=/.test(permitida.headers.get('Server-Timing')) && negada.status === 403);
      chk('Cada chamada consulta a origem e nenhuma lê ou grava permissões na borda', catalogo === 3 && rh === 2 && toques === 0, { catalogo, rh, toques });
    } finally { globalThis.caches = cacheAnterior; globalThis.fetch = fetchAnterior; }
  }

  // configurações (Admin total)
  const c0 = await A(PABLO, 'GET', '/esteira/config');
  chk('config padrão: 20 por pessoa, 21 dias, 4 funções', c0.j.ok && c0.j.config.porPessoa === 20 && c0.j.config.diasSemRepetir === 21 && c0.j.config.funcoes.join() === 'Limpeza,Caixa,Fotos,Atendimento online', c0.j.config);
  chk('v7.46.1: cada função já vem com instruções iniciais', ['Limpeza', 'Caixa', 'Fotos', 'Atendimento online'].every((f) => String(c0.j.config.instrucoes[f] || '').length > 40), c0.j.config.instrucoes);
  chk('WhatsApp curto é recusado', (await A(PABLO, 'POST', '/esteira/equipe', { whats: '123', nome: 'X' })).r.status === 400);
  await A(PABLO, 'POST', '/esteira/equipe', { whats: '55' + IARA, nome: 'Iara', confere: true, rodizio: true, atendente: true });
  const restrita = await A(IARA, 'GET', '/esteira/config');
  chk('403 de uma aba administrativa preserva acesso da equipe à Esteira', restrita.r.status === 403 && !restrita.j.acessoRevogado);
  const eq = await A(PABLO, 'POST', '/esteira/equipe', { whats: CLARICE, nome: 'Clarice', confere: true, rodizio: true, atendente: true, aceitar: true });
  chk('equipe gravada (55 do país é tirado do número)', eq.j.ok && eq.j.equipe.length === 2 && eq.j.equipe.some((e) => e.whats === IARA), eq.j);
  chk('configuração inválida é recusada', (await A(PABLO, 'POST', '/esteira/config', { config: { porPessoa: 0, diasSemRepetir: 21 } })).r.status === 400);

  const antesCatalogoMenu = listas;
  const menuEquipe = await A(IARA, 'GET', '/esteira/menu');
  chk('menu da equipe legada exige vínculo e não consulta o catálogo', menuEquipe.j.ok && menuEquipe.j.eu.nome === 'Iara' && menuEquipe.j.eu.admin === false && listas === antesCatalogoMenu, menuEquipe.j);
  chk('sessão legada sem vínculo não abre o menu', (await A(VISITA, 'GET', '/esteira/menu')).r.status === 403);
  const menuAdmin = await A(PABLO, 'GET', '/esteira/menu');
  chk('menu do Admin vem da sessão e não inicializa a Esteira', menuAdmin.j.ok && menuAdmin.j.eu.admin && !/(?:^|, )(inicializacao|catalogo|equipe);dur=/.test(menuAdmin.r.headers.get('Server-Timing') || ''), menuAdmin.j);
  const resumoSemLista = await A(IARA, 'GET', '/esteira/menu?resumo=1');
  chk('Resumo de abertura apenas lê o que já existe, sem gerar lista nem consultar o catálogo', resumoSemLista.j.resumoHoje?.total === 0 && listas === antesCatalogoMenu && (await env.DB.prepare('SELECT COUNT(*) AS n FROM est_lista').first()).n === 0);
  const antesMenu = usuarios[VISITA];
  usuarios[VISITA] = { nome:'Pessoa', permissoes:['esteira'], acessosConfiguraveis:true };
  chk('menu configurável vem da permissão Esteira', (await A(VISITA, 'GET', '/esteira/menu')).j.eu?.admin === false);
  usuarios[VISITA] = { nome:'Pessoa', permissoes:['catalogo_cadastrar'], acessosConfiguraveis:true };
  chk('acesso exclusivo da Caixa não abre o menu da Esteira', (await A(VISITA, 'GET', '/esteira/menu')).r.status === 403);
  usuarios[VISITA] = antesMenu;

  { // Revisões do D1, inclusive para exclusões e rollback.
    const consulta = async (whats, rota, revisar = false) => {
      const r = await w.fetch(new Request('https://ig.fake'+rota,{headers:{
        'X-TK-Whats':whats,'X-TK-Sessao':'tk3.sessao-'+whats,
        ...(revisar?{'X-TK-Esteira-Revisao':'1'}:{}),
      }}),env,ctx);
      return {r,j:await r.json()};
    };
    const consultasAntes = listas;
    const leitura = await consulta(IARA,'/esteira/pedidos',true);
    const inicial = await consulta(IARA,'/esteira/sincronizar?aba=pedidos');
    chk('Leitura e retomada compartilham revisão e assinatura de acesso da equipe',
      leitura.j.revisao && leitura.j.revisao===inicial.j.revisao && leitura.j.acesso===inicial.j.acesso && !inicial.j.eu.admin);
    const fotosAntes = await consulta(IARA,'/esteira/sincronizar?aba=fotos');
    for (const rota of ['/esteira/fotos', '/esteira/caixa?pagina=1']) {
      const {r,j} = await consulta(IARA,rota,true);
      chk(rota+' fornece os metadados de retomada da aba Fotos', r.ok && j.ok &&
        j.acesso===fotosAntes.j.acesso && j.diaRevisao===fotosAntes.j.data &&
        !!j.revisao && j.revisao===fotosAntes.j.revisao);
    }
    const pedido = await env.DB.prepare("INSERT INTO est_pedido(fornecedor,status) VALUES('Simulado','a_caminho')").run();
    const apos = await consulta(IARA,'/esteira/sincronizar?aba=pedidos');
    const fotosDepois = await consulta(IARA,'/esteira/sincronizar?aba=fotos');
    chk('Pedido muda só a revisão das áreas que dependem dele', apos.j.revisao!==inicial.j.revisao && fotosAntes.j.revisao===fotosDepois.j.revisao);
    await env.DB.prepare("DELETE FROM est_pedido WHERE id=?").bind(pedido.meta.last_row_id).run();
    const removido = await consulta(IARA,'/esteira/sincronizar?aba=pedidos');
    chk('Exclusão altera a revisão mesmo quando os totais voltam ao estado original', removido.j.revisao!==apos.j.revisao && removido.j.revisao!==inicial.j.revisao);
    try {await env.DB.batch([env.DB.prepare("INSERT INTO est_pedido(fornecedor,status) VALUES('Simulado','a_caminho')"), env.DB.prepare('SELECT * FROM tabela_que_nao_existe')]);}catch(_){}
    chk('Revisão não muda quando o lote é revertido', (await consulta(IARA,'/esteira/sincronizar?aba=pedidos')).j.revisao===removido.j.revisao);
    const privado = await consulta(VISITA,'/esteira/sincronizar?aba=pedidos');
    chk('Retomada de sessão sem vínculo retorna 403 e não expõe revisão',privado.r.status===403 && !privado.j.revisao);
    const admin = await consulta(PABLO,'/esteira/sincronizar?aba=pedidos');
    chk('Mudança de perfil muda assinatura e sincronização não toca o catálogo',
      admin.j.acesso!==inicial.j.acesso && listas===consultasAntes);
    chk('Área inválida é recusada',(await consulta(IARA,'/esteira/sincronizar?aba=toString')).r.status===400);
  }

  // lista do dia
  let abrirCatalogo;
  const aguardarCatalogo = new Promise(ok => { abrirCatalogo = ok; });
  const fetchAntesDaLista = globalThis.fetch;
  let leiturasConcorrentes = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('action=list')) {
      leiturasConcorrentes++;
      if (leiturasConcorrentes === 2) abrirCatalogo();
      await aguardarCatalogo;
    }
    return fetchAntesDaLista(url, init);
  };
  const temporizadorCatalogo = setTimeout(abrirCatalogo, 1000);
  const [h1, h2Concorrente] = await Promise.all([A(IARA, 'GET', '/esteira/hoje'), A(CLARICE, 'GET', '/esteira/hoje')]);
  clearTimeout(temporizadorCatalogo);
  globalThis.fetch = fetchAntesDaLista;
  chk('duas aberturas frias simultâneas devolvem listas completas, sem produtos em comum', h1.j.lista?.length === 20 && h2Concorrente.j.lista?.length === 20 && h1.j.lista.every(x => !h2Concorrente.j.lista.some(y => y.id === x.id)));

  const temposHoje = h1.r.headers.get('Server-Timing') || '';
  chk('Hoje informa somente duração de etapas para a origem do site', h1.r.headers.get('Timing-Allow-Origin') === 'https://tenkitermodas.com.br' && ['sessao','inicializacao','equipe','config','gerar','catalogo','d1','tarefas','total'].every(nome => temposHoje.includes(nome + ';dur=')) && /^no-store$/.test(h1.r.headers.get('Cache-Control') || ''), temposHoje);
  const caixaMedida = await A(PABLO, 'GET', '/esteira/caixa');
  chk('Caixa mantém autorização e pula configuração e catálogo', caixaMedida.j.ok && /equipe;dur=/.test(caixaMedida.r.headers.get('Server-Timing') || '') && !/(?:^|, )(config|catalogo);dur=/.test(caixaMedida.r.headers.get('Server-Timing') || ''));
  const origemEstranha = await w.fetch(new Request('https://ig.fake/esteira/caixa', {headers: {'Origin': 'https://externo.fake', 'X-TK-Whats': PABLO, 'X-TK-Sessao': 'tk3.sessao-' + PABLO}}), env, ctx);
  chk('outra origem não recebe métricas da Esteira', origemEstranha.ok && !origemEstranha.headers.has('Server-Timing') && !origemEstranha.headers.has('Timing-Allow-Origin'));
  chk('Iara recebe 20 peças', h1.j.ok && h1.j.total === 20 && h1.j.lista.length === 20, { t: h1.j.total, e: h1.j.erro });
  const h2 = await A(CLARICE, 'GET', '/esteira/hoje');
  const resumoComLista = await A(IARA, 'GET', '/esteira/menu?resumo=1');
  chk('Resumo autorizado tem o mesmo progresso e os avisos permitidos da lista completa', resumoComLista.j.resumoHoje?.total === h1.j.total && resumoComLista.j.resumoHoje?.feitas === h1.j.feitas && JSON.stringify(resumoComLista.j.resumoHoje?.pedidos) === JSON.stringify(h1.j.pedidos) && listas === 1);
  const dbVazio = d1(), antesVazio = listas;
  const vazio = await w.fetch(new Request('https://ig.fake/esteira/hoje', { headers: { 'X-TK-Whats': PABLO, 'X-TK-Sessao': 'tk3.sessao-' + PABLO } }), { ...env, DB: dbVazio }, ctx);
  chk('Hoje sem conferência ou tarefas abre mesmo sem consultar a lista de produtos', vazio.ok && (await vazio.json()).total === 0 && listas === antesVazio);
  const idsI = new Set(h1.j.lista.map((x) => x.id)), idsC = h2.j.lista.map((x) => x.id);
  chk('listas não repetem peça entre as funcionárias', h2.j.total === 20 && idsC.every((id) => !idsI.has(id)));
  chk('peça inativa nunca entra', !idsI.has('9999') && !idsC.includes('9999'));
  const grupos = h1.j.lista.map((x) => x.grupo);
  chk('peças agrupadas: a lista vem em blocos da mesma categoria', grupos.filter((g, k) => k === 0 || g !== grupos[k - 1]).length <= 4, grupos);
  chk('cada peça traz data de cadastro e de atualização', h1.j.lista.every((x) => 'cadastro' in x && 'atualizado_em' in x));
  const h1b = await A(IARA, 'GET', '/esteira/hoje');
  chk('abrir de novo não muda a lista do dia', h1b.j.lista.map((x) => x.id).join() === h1.j.lista.map((x) => x.id).join());
  chk('catálogo vem do cache (uma consulta só)', listas === 1, listas);

  const dataTeste = '2040-01-01';
  const grupoTeste = [{ whats:IARA, confere:1 }, { whats:CLARICE, confere:1 }];
  const cfgTeste = { ...c0.j.config, porPessoa:1 };
  const itensTeste = [{ id:'manual', estoque:'2', categoria:'Blusas' }, { id:'livre', estoque:'2', categoria:'Vestidos' }];
  let insereManual = true;
  await W.estGarantirListas_(env, dataTeste, cfgTeste, grupoTeste, async () => {
    if (insereManual) {
      insereManual = false;
      await env.DB.prepare('INSERT INTO est_lista(data,whats,produto,pos) VALUES(?,?,?,0)').bind(dataTeste,IARA,'manual').run();
    }
    return itensTeste;
  });
  const manual = (await env.DB.prepare('SELECT whats,produto FROM est_lista WHERE data=? ORDER BY whats').bind(dataTeste).all()).results;
  chk('geração relê atribuição feita enquanto carregava catálogo e não duplica o item', JSON.stringify(manual) === JSON.stringify([{whats:IARA,produto:'manual'},{whats:CLARICE,produto:'livre'}]),manual);
  const semProdutos = '2040-01-02';
  await W.estGarantirListas_(env, semProdutos, cfgTeste, grupoTeste, async () => []);
  const semItens = await env.DB.prepare('SELECT COUNT(*) AS n FROM est_lista WHERE data=?').bind(semProdutos).first();
  const focoVazio = await env.DB.prepare('SELECT COUNT(*) AS n FROM est_foco WHERE data=? AND categoria=?').bind(semProdutos,'').first();
  chk('catálogo sem produtos mantém lista vazia confirmada e foco vazio de cada pessoa', semItens.n===0 && focoVazio.n===2,{semItens,focoVazio});
  await env.DB.prepare('DELETE FROM est_foco WHERE data IN (?,?)').bind(dataTeste,semProdutos).run();
  await env.DB.prepare('DELETE FROM est_lista WHERE data=?').bind(dataTeste).run();

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
  const antesResumo = listas;
  const qtdListasAntes = (await env.DB.prepare('SELECT COUNT(*) AS n FROM est_lista').first()).n;
  const resumoPainel = await A(PABLO, 'GET', '/esteira/painel?resumo=1');
  chk('resumo do painel abre sem catálogo, sem gerar listas e sem enviar detalhes', resumoPainel.j.ok && resumoPainel.j.detalhesPendentes && resumoPainel.j.idade === null && resumoPainel.j.reativacao === null && listas === antesResumo && (await env.DB.prepare('SELECT COUNT(*) AS n FROM est_lista').first()).n === qtdListasAntes && resumoPainel.j.listas.every(l => !('itens' in l)));
  chk('resumo mantém o acesso de admin total', (await A(IARA, 'GET', '/esteira/painel?resumo=1')).r.status === 403);
  const pn = await A(PABLO, 'GET', '/esteira/painel');
  chk('painel mostra progresso de cada uma, divergência e idade do estoque', pn.j.ok && pn.j.progresso.length === 2 && pn.j.divergencia30.divergentes === 1 && pn.j.idade && pn.j.idade.ate30 + pn.j.idade.ate60 + pn.j.idade.ate90 + pn.j.idade.mais90 === 70, pn.j);
  chk('resumo preserva progresso, divergência e pedidos do painel completo', ['progresso', 'divergencia30', 'pedidos', 'fornecedores'].every(k => JSON.stringify(resumoPainel.j[k]) === JSON.stringify(pn.j[k])) && !pn.j.detalhesPendentes);
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
  // ---- v7.44.0: família de produtos na lista diária ----
  const famMap = { f1a: { familia: 'F1', ordem: 0 }, f1b: { familia: 'F1', ordem: 1 }, f1c: { familia: 'F1', ordem: 2 } };
  const catF = [{ id: 'f1c', cadastro: dia(300), categoria: 'Sungas', genero: '', estoque: '' }, { id: 'f1a', cadastro: dia(250), categoria: 'Sungas', genero: '', estoque: '' }, { id: 'f1b', cadastro: dia(20), categoria: 'Sungas', genero: '', estoque: '' }];
  for (let i = 0; i < 6; i++) catF.push({ id: 's' + i, cadastro: dia(100 + i), categoria: 'Blusas', genero: '', estoque: '' });
  const cfgF = { porPessoa: 3, diasSemRepetir: 21, pesos: cfg.pesos, focoCategoria: false };   // v7.45.0: estes testes são do modo misturado (sem foco)
  const lf = montar(catF, {}, cfgF, ['ana', 'bia'], [], Date.now(), famMap);
  const idsAna = lf.ana.map((x) => x.p.id), idsBia = lf.bia.map((x) => x.p.id);
  const unid = (l) => new Set(l.map((x) => x.familia || x.p.id)).size;
  chk('família conta como 1 item das 3 (3 itens = 5 peças)', unid(lf.ana) === 3 && lf.ana.length === 5, idsAna);
  chk('família vai inteira para a mesma pessoa, na ordem da família', idsAna.join().includes('f1a,f1b,f1c') && !idsBia.some((id) => id.startsWith('f1')), [idsAna, idsBia]);
  chk('pontuação da família = maior entre os membros (entra primeiro pela peça mais antiga)', lf.ana[0].p.id === 'f1a', idsAna);
  const lf2 = montar(catF, { f1c: { conferido_em: dia(2) } }, cfgF, ['ana'], [], Date.now(), famMap).ana.map((x) => x.p.id);
  chk('membro conferido há pouco fica fora; os demais da família vêm juntos', !lf2.includes('f1c') && lf2.join().includes('f1a,f1b'), lf2);
  const lf3 = montar(catF, {}, cfgF, ['ana'], [], Date.now()).ana.map((x) => x.p.id);
  chk('sem famílias a montagem é a de sempre (3 peças)', lf3.length === 3, lf3);
  // rota: família ligada pelo /familias/ligar aparece num cartão só e o progresso conta 1
  const RITA = '88999990005'; usuarios[RITA] = { nome: 'Rita', permissoes: ['catalogo_cadastrar'] };
  await A(PABLO, 'POST', '/esteira/equipe', { whats: RITA, nome: 'Rita', confere: true, rodizio: false });
  const usadosHoje = new Set(((await env.DB.prepare('SELECT produto FROM est_lista').all()).results || []).map((r) => r.produto));
  const olhados = new Set(((await env.DB.prepare('SELECT id FROM est_produto WHERE conferido_em IS NOT NULL OR atualizado_em IS NOT NULL').all()).results || []).map((r) => r.id));
  const livres = produtos.filter((x) => x.Status === 'Ativo' && !usadosHoje.has(x.ID) && !olhados.has(x.ID)).map((x) => x.ID).sort((a, b) => Number(b) - Number(a));
  const [m1, m2, m3, recente] = livres;
  await A(IARA, 'POST', '/esteira/conferir', { id: recente, achou: true });
  const lgF = await A(PABLO, 'POST', '/familias/ligar', { produtos: [m1, m2, m3, recente], nome: 'Sunga infantil', rotulos: { [m3]: 'P', [m2]: 'M', [m1]: 'G', [recente]: 'GG' } });
  chk('família ligada pela Gestão', lgF.j.ok && lgF.j.familia.membros.length === 4, lgF.j);
  const hr = await A(RITA, 'GET', '/esteira/hoje');
  const famItens = hr.j.lista.filter((x) => x.familia === lgF.j.familia.id);
  chk('Hoje: os 3 tamanhos elegíveis vêm juntos, com nome da família e rótulo', famItens.length === 3 && famItens.map((x) => x.rotulo).join() === 'P,M,G' && famItens.every((x) => x.familiaNome === 'Sunga infantil'), famItens);
  const posF = hr.j.lista.map((x, k) => (x.familia ? k : -1)).filter((k) => k >= 0);
  chk('Hoje: tamanhos da família ficam lado a lado na lista', posF.length === 3 && posF[2] - posF[0] === 2, posF);
  chk('Hoje: tamanho conferido há pouco fica fora da família na lista', !hr.j.lista.some((x) => x.id === recente));
  chk('progresso X/20 conta a família como 1 (20 itens, 22 peças)', hr.j.total === 20 && hr.j.pecas === 22 && hr.j.feitas === 0, { t: hr.j.total, p: hr.j.pecas });
  await A(RITA, 'POST', '/esteira/conferir', { id: m3, achou: true }); await A(RITA, 'POST', '/esteira/conferir', { id: m2, achou: true });
  let hr2 = await A(RITA, 'GET', '/esteira/hoje');
  chk('família só conta como feita quando todos os tamanhos foram conferidos (2 de 3 = ainda não)', hr2.j.feitas === 0 && hr2.j.pecasFeitas === 2, { f: hr2.j.feitas, pf: hr2.j.pecasFeitas });
  await A(RITA, 'POST', '/esteira/conferir', { id: m1, achou: true });
  hr2 = await A(RITA, 'GET', '/esteira/hoje');
  chk('com o último tamanho conferido, a família conta 1 feita', hr2.j.feitas === 1, hr2.j.feitas);
  const pnF = await A(PABLO, 'GET', '/esteira/painel');
  const pRita = (pnF.j.progresso || []).find((x) => x.whats === RITA) || {};
  chk('painel também conta a família como 1', pRita.total === 20 && pRita.feitas === 1, pRita);
  // ---- v7.45.0 (entrega 5): foco por categoria, gestor altera listas, retrato diário e reativação ----
  const cfgFo = { porPessoa: 4, diasSemRepetir: 21, pesos: cfg.pesos };
  const catFo = [];
  ['Blusas', 'Vestidos', 'Shorts', 'Saias'].forEach((c, k) => { for (let i = 0; i < 6; i++) catFo.push({ id: c[0] + i, cadastro: dia(200 - k * 20 - i), categoria: c, genero: 'Feminino', estoque: '' }); });
  const catsDe = (l) => [...new Set(l.map((x) => x.p.categoria))];
  const dd1 = montar(catFo, {}, cfgFo, ['ana', 'bia', 'cris'], [], Date.now(), {}, {});
  chk('foco: cada uma das 3 recebe as peças de uma categoria só', ['ana', 'bia', 'cris'].every((w) => dd1[w].length === 4 && catsDe(dd1[w]).length === 1), ['ana', 'bia', 'cris'].map((w) => catsDe(dd1[w])));
  chk('foco: categorias diferentes entre as pessoas e guardadas em _foco', new Set(Object.values(dd1._foco)).size === 3 && dd1._foco.ana === catsDe(dd1.ana)[0] && !Object.keys(dd1).includes('_foco'), dd1._foco);
  chk('foco: a categoria mais urgente vai para a primeira e as mais urgentes vêm primeiro', dd1._foco.ana === 'Blusas' && dd1.ana.map((x) => x.p.id).join() === 'B0,B1,B2,B3', dd1.ana.map((x) => x.p.id));
  const hist = {}; Object.entries(dd1._foco).forEach(([w, c]) => { hist[w] = { [c]: 1 }; });
  const d2 = montar(catFo, {}, cfgFo, ['ana', 'bia', 'cris'], [], Date.now(), {}, { historico: hist });
  chk('rodízio: no dia seguinte ninguém repete a categoria de ontem (e seguem diferentes entre si)', ['ana', 'bia', 'cris'].every((w) => d2._foco[w] !== dd1._foco[w]) && new Set(Object.values(d2._foco)).size === 3, [dd1._foco, d2._foco]);
  const d3 = montar(catFo, {}, Object.assign({}, cfgFo, { categoriasFixas: { cris: 'blusas' } }), ['ana', 'bia', 'cris'], [], Date.now(), {}, { historico: hist });
  chk('categoria fixa é respeitada (sem diferença de maiúscula) e ninguém mais pega a mesma', d3._foco.cris === 'Blusas' && catsDe(d3.cris).join() === 'Blusas' && d3._foco.ana !== 'Blusas' && d3._foco.bia !== 'Blusas', d3._foco);
  const d4 = montar(catFo, {}, cfgFo, ['ana'], [], Date.now(), {}, { tomadas: ['Blusas'] });
  chk('categoria já tomada hoje por outra pessoa não é escolhida de novo', d4._foco.ana !== 'Blusas', d4._foco);
  const catPouco = catFo.concat([{ id: 'J0', cadastro: dia(10), categoria: 'Jeans', genero: 'Feminino', estoque: '' }, { id: 'J1', cadastro: dia(11), categoria: 'Jeans', genero: 'Feminino', estoque: '' }]);
  const d5 = montar(catPouco, {}, Object.assign({}, cfgFo, { categoriasFixas: { ana: 'Jeans' } }), ['ana', 'bia'], [], Date.now(), {}, {});
  const c5 = d5.ana.map((x) => x.p.categoria);
  chk('sem itens suficientes na categoria: completa com a próxima mais urgente, agrupada e fora do foco das outras', c5.join() === 'Jeans,Jeans,' + c5[2] + ',' + c5[2] && c5[2] !== d5._foco.bia && c5[2] === 'Vestidos', [c5, d5._foco]);
  const famFo = { fA: { familia: 'FX', ordem: 0 }, fB: { familia: 'FX', ordem: 1 }, fC: { familia: 'FX', ordem: 2 } };
  const catFam = [{ id: 'fA', cadastro: dia(300), categoria: 'Sungas', genero: '', estoque: '' }, { id: 'fB', cadastro: dia(300), categoria: 'Sungas', genero: '', estoque: '' }, { id: 'fC', cadastro: dia(30), categoria: 'Sungas', genero: '', estoque: '' }, { id: 'sg1', cadastro: dia(100), categoria: 'Sungas', genero: '', estoque: '' }, { id: 'sg2', cadastro: dia(90), categoria: 'Sungas', genero: '', estoque: '' }, { id: 'sg3', cadastro: dia(80), categoria: 'Sungas', genero: '', estoque: '' }].concat(catFo);
  const d6 = montar(catFam, {}, Object.assign({}, cfgFo, { porPessoa: 3, categoriasFixas: { ana: 'Sungas' } }), ['ana'], [], Date.now(), famFo, {});
  chk('foco: família conta como 1 item (3 itens = 5 peças da mesma categoria)', d6.ana.length === 5 && new Set(d6.ana.map((x) => x.familia || x.p.id)).size === 3 && d6.ana.slice(0, 3).map((x) => x.p.id).join() === 'fA,fB,fC' && catsDe(d6.ana).join() === 'Sungas', d6.ana.map((x) => x.p.id));
  // rota: categoria do dia guardada por pessoa e mostrada no Hoje
  const focoHoje = (await env.DB.prepare('SELECT whats, categoria FROM est_foco').all()).results || [];
  const hIc = await A(IARA, 'GET', '/esteira/hoje');
  chk('Hoje traz a categoria do dia da pessoa (gravada em est_foco)', !!hIc.j.categoria && focoHoje.some((r) => r.whats === IARA && r.categoria === hIc.j.categoria), [hIc.j.categoria, focoHoje]);
  // ---- gestor: vê e altera as listas ----
  const L = (rota, corpo) => A(PABLO, 'POST', '/esteira/lista/' + rota, corpo);
  const painelL = async () => (await A(PABLO, 'GET', '/esteira/painel')).j;
  let pl = await painelL();
  const lI = () => pl.listas.find((x) => x.whats === IARA), lC = () => pl.listas.find((x) => x.whats === CLARICE);
  chk('Painel mostra a lista de cada pessoa com categoria, itens e feito/pendente', pl.listas.length === 3 && lI().categoria === hIc.j.categoria && lI().itens.length >= 20 && lI().itens.some((x) => x.feito) && lI().itens.some((x) => !x.feito) && pl.categorias.length === 3, pl.listas.map((x) => [x.nome, x.categoria, x.total, x.feitas]));
  chk('funcionária não altera listas', (await A(IARA, 'POST', '/esteira/lista/tirar', { whats: IARA, produto: alvo.id })).r.status === 403);
  const tFeito = await L('tirar', { whats: IARA, produto: alvo.id });
  chk('item já conferido não pode ser tirado', tFeito.r.status === 400 && /já foi conferida/.test(tFeito.j.erro), tFeito.j);
  const pend = lI().itens.filter((x) => !x.feito && !x.familia), tirarId = pend[0].id, moverId = pend[1].id;
  const tOk = await L('tirar', { whats: IARA, produto: tirarId });
  pl = await painelL();
  chk('gestor tira item pendente da lista', tOk.j.ok && !lI().itens.some((x) => x.id === tirarId), tOk.j);
  chk('tirar peça que não está na lista: aviso legível', (await L('tirar', { whats: IARA, produto: tirarId })).r.status === 404);
  const emListas = new Set(pl.listas.flatMap((x) => x.itens.map((i) => i.id)));
  const livre = produtos.find((x) => x.Status === 'Ativo' && !emListas.has(x.ID)).ID;
  const co1 = await L('colocar', { whats: IARA, produto: livre });
  pl = await painelL();
  chk('gestor coloca peça do catálogo no fim da lista', co1.j.ok && co1.j.colocadas === 1 && lI().itens.at(-1).id === livre, co1.j);
  chk('colocar peça que já está na lista de outra pessoa: avisa quem e sugere mover', /lista de Clarice hoje\. Use “Mover”/.test((await L('colocar', { whats: IARA, produto: lC().itens[0].id })).j.erro || ''));
  chk('colocar peça fora do site é recusado', (await L('colocar', { whats: IARA, produto: '9999' })).r.status === 400);
  const emListas2 = new Set(pl.listas.flatMap((x) => x.itens.map((i) => i.id)));
  const livres2 = produtos.filter((x) => x.Status === 'Ativo' && !emListas2.has(x.ID)).map((x) => x.ID);
  const lgF2 = await A(PABLO, 'POST', '/familias/ligar', { produtos: [livres2[0], livres2[1]], nome: 'Saia família', rotulos: { [livres2[0]]: 'P', [livres2[1]]: 'M' } });
  const coF = await L('colocar', { whats: CLARICE, produto: livres2[1] });
  pl = await painelL();
  chk('colocar um tamanho traz a família inteira', lgF2.j.ok && coF.j.ok && coF.j.colocadas === 2 && lC().itens.filter((x) => x.familia === lgF2.j.familia.id).length === 2, coF.j);
  const mv = await L('mover', { whats: IARA, produto: moverId, para: CLARICE });
  pl = await painelL();
  chk('gestor move item para outra pessoa', mv.j.ok && mv.j.para === 'Clarice' && lC().itens.some((x) => x.id === moverId) && !lI().itens.some((x) => x.id === moverId), mv.j);
  chk('mover item já conferido é bloqueado', (await L('mover', { whats: IARA, produto: alvo.id, para: CLARICE })).r.status === 400);
  chk('mover para a mesma pessoa é recusado', (await L('mover', { whats: CLARICE, produto: moverId, para: CLARICE })).r.status === 400);
  const feitosI = lI().itens.filter((x) => x.feito).map((x) => x.id).join();
  const cat0 = lC().categoria, usadosL = new Set(pl.listas.flatMap((x) => x.itens.map((i) => i.id))), livresPorCat = {};
  produtos.filter((x) => x.Status === 'Ativo' && !usadosL.has(x.ID)).forEach((x) => { livresPorCat[x.Categoria] = (livresPorCat[x.Categoria] || 0) + 1; });
  const novaCat = Object.keys(livresPorCat).filter((c) => c !== cat0).sort((a, b) => livresPorCat[b] - livresPorCat[a])[0];
  const tc = await L('categoria', { whats: CLARICE, categoria: novaCat });
  pl = await painelL();
  const focoC = await env.DB.prepare('SELECT categoria, por FROM est_foco WHERE whats=? ORDER BY data DESC').bind(CLARICE).first();
  chk('trocar a categoria do dia refaz só os não feitos, começando pela nova categoria', tc.j.ok && tc.j.categoria === novaCat && lC().categoria === novaCat && lC().itens.filter((x) => !x.feito)[0].categoria === novaCat && focoC.por === PABLO, [tc.j, lC().itens.map((x) => x.categoria)]);
  chk('trocar categoria sem escolher é recusado', (await L('categoria', { whats: CLARICE, categoria: ' ' })).r.status === 400);
  const rfI = await L('refazer', { whats: IARA });
  pl = await painelL();
  chk('refazer a lista da pessoa mantém os itens feitos e completa os 20', rfI.j.ok && lI().itens.filter((x) => x.feito).map((x) => x.id).join() === feitosI && lI().total === 20, [rfI.j, lI().total]);
  chk('pessoa fora da equipe: aviso', (await L('refazer', { whats: VISITA })).r.status === 400);
  // ---- configurações novas ----
  chk('degraus fora de ordem são recusados', /Degraus/.test((await A(PABLO, 'POST', '/esteira/config', { config: { reativacao: [60, 30, 90] } })).j.erro || ''));
  chk('hora do retrato inválida é recusada', (await A(PABLO, 'POST', '/esteira/config', { config: { retratoHora: 25 } })).r.status === 400);
  const cfgN = await A(PABLO, 'POST', '/esteira/config', { config: { retratoHora: 7, categoriasFixas: { ['55' + IARA]: 'Blusas', '123': 'X' } } });
  chk('config salva hora do retrato (também no KV) e categoria fixa (número limpo), sem mexer no resto', cfgN.j.ok && cfgN.j.config.retratoHora === 7 && kv.get('est:retrato:hora') === '7' && JSON.stringify(cfgN.j.config.categoriasFixas) === JSON.stringify({ [IARA]: 'Blusas' }) && cfgN.j.config.focoCategoria === true && cfgN.j.config.reativacao.join() === '30,60,90' && cfgN.j.config.porPessoa === 20, cfgN.j.config);
  const listasAntesDaConfig = listas;
  await KV.delete('est:catalogo:v1');
  catalogoComErro = true;
  const configBase = await A(PABLO, 'GET', '/esteira/config?basico=1');
  chk('configuração básica abre sem catálogo mesmo quando ele está indisponível', configBase.j.ok && configBase.j.config.funcoes.length === 4 && configBase.j.escalaHoje && !('categorias' in configBase.j) && listas === listasAntesDaConfig);
  const catBloqueadas = await A(IARA, 'GET', '/esteira/config/categorias');
  chk('categorias da configuração são exclusivas de admin total', catBloqueadas.r.status === 403 && listas === listasAntesDaConfig);
  const catIndisponiveis = await A(PABLO, 'GET', '/esteira/config/categorias');
  chk('falha no catálogo permite tentativa em separado', catIndisponiveis.r.status === 503 && /categorias/.test(catIndisponiveis.j.erro));
  catalogoComErro = false;
  const catConfig = await A(PABLO, 'GET', '/esteira/config/categorias');
  chk('categorias retornam com contagem de produtos ativos e métricas próprias', catConfig.j.ok && catConfig.j.categorias.reduce((n, c) => n + c.pecas, 0) === 70 && /catalogo;dur=/.test(catConfig.r.headers.get('Server-Timing') || ''));

  const cfgG = await A(PABLO, 'GET', '/esteira/config');
  chk('config traz as categorias do catálogo para escolher a fixa', cfgG.j.categorias.map((x) => x.nome).sort().join() === 'Blusas,Saias,Vestidos', cfgG.j.categorias);
  // ---- retrato diário (cron) ----
  const diaStr = (n) => new Date(Date.now() - n * 864e5 - 3 * 3600e3).toISOString().slice(0, 10);
  const horaF = (n, h) => Date.parse(diaStr(n) + 'T' + String(h + 3).padStart(2, '0') + ':00:00Z');   // h = hora de Fortaleza
  const cron = W.estRetratoCron_;
  const listasAntes = listas;
  chk('cron antes da hora configurada (7h): nada pesado', (await cron(env, horaF(3, 6))).pulou === 'cedo' && listas === listasAntes);
  const r1c = await cron(env, horaF(3, 9));
  const ret1 = (await env.DB.prepare('SELECT COUNT(*) AS n FROM est_estoque WHERE data=?').bind(diaStr(3)).first()).n;
  chk('primeiro retrato do dia grava o estoque de cada peça ativa', r1c.produtos === 70 && r1c.mudaram === 70 && ret1 === 70 && listas === listasAntes + 1, r1c);
  chk('segunda chamada no mesmo dia não refaz (marca no KV)', (await cron(env, horaF(3, 10))).pulou === 'feito' && listas === listasAntes + 1);
  kv.delete('est:retrato:dia');
  chk('sem a marca do KV, o D1 lembra que já foi feito hoje', (await cron(env, horaF(3, 11))).pulou === 'feito' && listas === listasAntes + 1);
  kv.set('est:retrato:trava', '1');
  chk('com a trava ligada, outro minuto não roda junto', (await cron(env, horaF(2, 9))).pulou === 'trava');
  kv.delete('est:retrato:trava');
  // queda de estoque: 1013 vendeu (3 → 1); 1011 foi conferida com contagem menor (estoque 1 → 0 no site): não é venda
  const p1013 = produtos.find((x) => x.ID === '1013'), p1011 = produtos.find((x) => x.ID === '1011');
  p1013.Estoque = '1'; await A(IARA, 'POST', '/esteira/conferir', { id: '1011', achou: true, estoqueAntes: '1', estoqueDepois: '0' }); p1011.Estoque = '0';
  await env.DB.prepare('INSERT INTO est_estoque (produto, data, estoque) VALUES (?, ?, ?)').bind('1000', diaStr(200), 9).run();
  const r2c = await cron(env, horaF(2, 9));
  const i1013 = await env.DB.prepare('SELECT ult_estoque, ult_queda_em FROM est_produto WHERE id=?').bind('1013').first(), i1011 = await env.DB.prepare('SELECT ult_estoque, ult_queda_em FROM est_produto WHERE id=?').bind('1011').first();
  chk('queda de estoque atualiza ult_queda_em (venda)', r2c.mudaram === 2 && r2c.quedas === 1 && i1013.ult_estoque === 1 && !!i1013.ult_queda_em, [r2c, i1013]);
  chk('queda explicada pela conferência não conta como venda', i1011.ult_estoque === 0 && !i1011.ult_queda_em, i1011);
  chk('retrato guarda só o que mudou e limpa os de mais de 120 dias', (await env.DB.prepare('SELECT COUNT(*) AS n FROM est_estoque WHERE data=?').bind(diaStr(2)).first()).n === 2 && !(await env.DB.prepare('SELECT 1 AS x FROM est_estoque WHERE data=?').bind(diaStr(200)).first()));
  // ---- degraus 30/60/90 ----
  const par = W.estParadas_;
  const catP = [{ id: 'q1', cadastro: dia(35), estoque: '2', nome: 'Q1', categoria: 'X' }, { id: 'q2', cadastro: dia(65), estoque: '2', nome: 'Q2', categoria: 'X' }, { id: 'q3', cadastro: dia(95), estoque: '1', nome: 'Q3', categoria: 'X' }, { id: 'q4', cadastro: dia(10), estoque: '2', nome: 'Q4', categoria: 'X' }, { id: 'q5', cadastro: dia(95), estoque: '0', nome: 'Q5', categoria: 'X' }, { id: 'q6', cadastro: dia(95), estoque: '3', nome: 'Q6', categoria: 'X' },
    { id: 'm1', cadastro: dia(120), estoque: '2', nome: 'Sunga P', categoria: 'Y' }, { id: 'm2', cadastro: dia(120), estoque: '0', nome: 'Sunga M', categoria: 'Y' }, { id: 'n1', cadastro: dia(120), estoque: '2', nome: 'Saia P', categoria: 'Y' }, { id: 'n2', cadastro: dia(120), estoque: '2', nome: 'Saia M', categoria: 'Y' }];
  const famP = { m1: { familia: 'FM', ordem: 0 }, m2: { familia: 'FM', ordem: 1 }, n1: { familia: 'FN', ordem: 0 }, n2: { familia: 'FN', ordem: 1 } };
  const pr = par(catP, { q6: { etapa: 'preparacao' }, m2: { ult_queda_em: dia(5) } }, famP, Date.now(), dia(400), [30, 60, 90], { FN: 'Saia família' });
  const deg = Object.fromEntries(pr.map((x) => [x.chave, x.degrau]));
  chk('degraus: 35 dias = 30, 65 = 60, 95 = 90; recente fica fora', deg['p:q1'] === 1 && deg['p:q2'] === 2 && deg['p:q3'] === 3 && !deg['p:q4'], deg);
  chk('estoque 0 e peça em preparação não entram como paradas', !deg['p:q5'] && !deg['p:q6'], deg);
  chk('família: se um tamanho vendeu, a família não está parada', !deg['f:FM'], deg);
  const fn2 = pr.find((x) => x.chave === 'f:FN') || {};
  chk('família parada aparece uma vez, com o nome e os tamanhos', fn2.degrau === 3 && fn2.nome === 'Saia família' && fn2.ids.join() === 'n1,n2' && fn2.estoque === 4, fn2);
  chk('antes do início da observação nada fica parado (só conta a partir do 1º retrato)', par(catP, {}, famP, Date.now(), dia(20), [30, 60, 90]).length === 0);
  // tarefas pela reativação: início da observação há 400 dias; o catálogo vai de 10 a 79 dias de cadastro
  await env.DB.prepare("UPDATE cfg SET valor=? WHERE chave='est_retrato_inicio'").bind(dia(400)).run();
  const r3c = await cron(env, horaF(1, 9));
  const tr = (await env.DB.prepare("SELECT produto, titulo, funcao, tipo FROM est_tarefa WHERE origem='reativacao'").all()).results || [];
  const fotoR = tr.filter((t) => t.titulo === 'Foto nova'), videoR = tr.filter((t) => t.titulo === 'Vídeo curto');
  const naFam = new Set(((await env.DB.prepare('SELECT produto FROM fam_membro').all()).results || []).map((r) => r.produto));
  const soltos = produtos.filter((x) => x.Status === 'Ativo' && Number(x.Estoque) > 0 && !naFam.has(x.ID) && x.ID !== '1013' && x.ID !== '1005' && x.ID !== pecaFoto);   // pecaFoto já tem "Foto nova" da conferência

  const de = (id) => tr.filter((t) => t.produto === id).map((t) => t.titulo).sort().join();
  const p40 = soltos.find((x) => Number(x.ID) - 1000 >= 25 && Number(x.ID) - 1000 <= 45), p70 = soltos.find((x) => Number(x.ID) - 1000 >= 55);
  chk('30 dias: tarefa "Foto nova" para Fotos (origem reativação)', r3c.tarefas > 0 && de(p40.ID) === 'Foto nova' && fotoR.length >= 10 && fotoR.every((t) => t.funcao === 'Fotos' && t.tipo === 'foto'), { criadas: r3c.tarefas, p40: de(p40.ID) });
  chk('60 dias: "Foto nova" e "Vídeo curto"; peça com venda recente e peça em preparação ficam fora', de(p70.ID) === 'Foto nova,Vídeo curto' && videoR.length < fotoR.length && !tr.some((t) => t.produto === '1013' || t.produto === '1005'), { p70: de(p70.ID), video: videoR.length });
  chk('peça com venda recente (estoque caiu) não ganha tarefa; pouco tempo (menos de 30 dias) também não', de('1013') === '' && de(soltos.find((x) => Number(x.ID) - 1000 < 15).ID) === '');
  chk('Foto nova pedida na conferência não é duplicada pela reativação', (await env.DB.prepare("SELECT COUNT(*) AS n FROM est_tarefa WHERE produto=? AND titulo='Foto nova' AND status='pendente'").bind(pecaFoto).first()).n === 1);
  const famT = tr.filter((t) => naFam.has(t.produto));
  chk('família parada ganha uma tarefa só (no primeiro tamanho), dizendo que vale para todos', famT.length === 0 || new Set(famT.map((t) => t.produto + t.titulo)).size === famT.length);
  kv.delete('est:retrato:dia');
  const r4c = await cron(env, horaF(0, 9));
  const rep = (await env.DB.prepare("SELECT produto, titulo, COUNT(*) AS n FROM est_tarefa WHERE status='pendente' AND titulo IN ('Foto nova', 'Vídeo curto') GROUP BY produto, titulo HAVING COUNT(*) > 1").all()).results || [];
  chk('no dia seguinte não duplica as tarefas abertas', !r4c.pulou && rep.length === 0 && (await env.DB.prepare("SELECT COUNT(*) AS n FROM est_tarefa WHERE origem='reativacao' AND produto=?").bind(p70.ID).first()).n === 2, [r4c, rep]);
  const umaFoto = fotoR[0];
  await env.DB.prepare("UPDATE est_tarefa SET status='feita' WHERE origem='reativacao' AND produto=? AND titulo='Foto nova'").bind(umaFoto.produto).run();
  await env.DB.prepare("DELETE FROM cfg WHERE chave='est_retrato_ult'").run(); kv.delete('est:retrato:dia');
  const r5c = await cron(env, horaF(0, 10));
  chk('tarefa feita não volta enquanto a peça segue no mesmo período parado', !r5c.pulou && !(await env.DB.prepare("SELECT 1 AS x FROM est_tarefa WHERE produto=? AND titulo='Foto nova' AND status='pendente'").bind(umaFoto.produto).first()), r5c);
  // ---- painel completo ----
  await A(PABLO, 'POST', '/esteira/config', { config: { reativacao: [10, 20, 30] } });
  const pc5 = await painelL(), ra = pc5.reativacao || {};
  chk('Painel: paradas por degrau, tarefas de reativação abertas e início da observação', ra.degraus.join() === '10,20,30' && ra.contagem.d3 > 0 && ra.contagem.d1 + ra.contagem.d2 + ra.contagem.d3 > 0 && ra.tarefas.length > 0 && ra.tarefas[0].produtoNome && !!ra.inicio && ra.retrato && ra.retrato.data === diaStr(0), { c: ra.contagem, t: ra.tarefas.length, r: ra.retrato });
  chk('Painel: sugestões para Postagens (60) e de promoção (90) sem mudar preço', ra.postagens.length > 0 && ra.promocao.length > 0 && ra.promocao.every((x) => x.degrau === 3) && !JSON.stringify(ra).includes('preco'), ra.promocao.slice(0, 2));
  const alvoP = ra.promocao[0];
  chk('funcionária não dispensa sugestão', (await A(IARA, 'POST', '/esteira/reativacao/dispensar', { ids: alvoP.ids })).r.status === 403);
  const dp = await A(PABLO, 'POST', '/esteira/reativacao/dispensar', { ids: alvoP.ids });
  const pc6 = await painelL();
  chk('"Dispensar por 30 dias" tira das sugestões (continua contada como parada)', dp.j.ok && Date.parse(dp.j.ate) - Date.now() > 29 * 864e5 && !pc6.reativacao.promocao.some((x) => x.produto === alvoP.produto) && pc6.reativacao.dispensadas === 1 && pc6.reativacao.contagem.d3 === ra.contagem.d3, dp.j);
  // chegou e não foi para o site / esperando aceitar / pedidos / fornecedor
  await env.DB.prepare("UPDATE est_produto SET preparado_em=? WHERE id='1005'").bind(dia(5)).run();
  await env.DB.prepare("UPDATE est_tarefa SET status='feita' WHERE produto='1005' AND status='pendente'").run();
  const pc7 = await painelL();
  chk('Painel: "chegaram e não foram para o site" (mais de 3 dias, com os dias) e "esperando Aceitar"', pc7.semSite.some((x) => x.id === '1005' && x.dias === 5) && pc7.esperandoAceitar.some((x) => x.id === '1005' && x.feitas === x.total && x.total > 0), [pc7.semSite, pc7.esperandoAceitar]);
  chk('Painel: pedidos a caminho e esperando aprovação', Array.isArray(pc7.pedidos.aCaminho) && Array.isArray(pc7.pedidos.aprovar) && pc7.pedidos.aCaminho.length === 0, pc7.pedidos);
  const fAur = pc7.fornecedores.find((x) => x.fornecedor === 'Confecção Aurora Ltda') || {};
  chk('Painel: divergência por fornecedor a partir dos pedidos conferidos', fAur.pedidos === 1 && fAur.itens === 5 && fAur.diferentes === 3 && fAur.pedidas === 20 && fAur.chegaram === 18 && fAur.extras === 1, fAur);
  const sP = await P(PABLO, 'salvar', { fornecedor: 'Malharia Sol', previsao: '2026-01-02', itens: [itensPed[1]] }); await P(PABLO, 'enviar', { id: sP.j.pedido.id });
  const pc8 = await painelL();
  chk('Painel: pedido a caminho aparece com fornecedor, itens e atraso', pc8.pedidos.aCaminho.some((x) => x.fornecedor === 'Malharia Sol' && x.itens === 1 && x.atrasado === true), pc8.pedidos);
  chk('funcionária não abre o painel completo', (await A(IARA, 'GET', '/esteira/painel')).r.status === 403);
  // foco desligado: volta à lista misturada de sempre
  const cfOff = await A(PABLO, 'POST', '/esteira/config', { config: { focoCategoria: false } });
  chk('foco por categoria pode ser desligado (e o resto fica)', cfOff.j.config.focoCategoria === false && cfOff.j.config.reativacao.join() === '10,20,30' && cfOff.j.config.retratoHora === 7, cfOff.j.config);
  // ---- v7.48.0: conferência sem quantidade, listas da Gestão (sem texto livre), fornecedores ----
  const ultConf = async () => env.DB.prepare('SELECT * FROM est_conf ORDER BY id DESC LIMIT 1').first();
  const alvo2 = (await A(IARA, 'GET', '/esteira/hoje')).j.lista.find((x) => !x.feito);
  const sq = await A(IARA, 'POST', '/esteira/conferir', { id: alvo2.id, achou: true, estoqueAntes: alvo2.estoque, estoqueDepois: '' });
  const cq = await ultConf();
  chk('7.48: conferir sem quantidade funciona e não muda o estoque registrado', sq.j.ok && sq.j.contou === false && cq.estoque_depois === '' && cq.divergiu === 0 && cq.achou === 1, [sq.j, cq]);
  chk('7.48: a peça conferida sem quantidade conta como feita', (await A(IARA, 'GET', '/esteira/hoje')).j.lista.find((x) => x.id === alvo2.id).feito === true);
  const sqT = await A(IARA, 'POST', '/esteira/conferir', { id: alvo2.id, achou: true, estoqueAntes: '3', estoqueDepois: '3', mudouTamanhos: true });
  chk('7.48: sem quantidade, tirar tamanho ainda marca diferença; com quantidade igual não', sqT.j.ok && sqT.j.contou === true && sqT.j.divergiu === true);
  const sqE = await A(IARA, 'POST', '/esteira/conferir', { id: alvo2.id, achou: true, estoqueAntes: '3', estoqueDepois: 'três' });
  chk('7.48: quantidade que não é número: erro em português, sem JSON cru', sqE.r.status === 400 && /número inteiro/.test(sqE.j.erro) && !/[{}]/.test(sqE.j.erro), sqE.j);
  await A(IARA, 'POST', '/esteira/conferir', { id: alvo2.id, achou: false, estoqueAntes: '3', estoqueDepois: '5' });
  chk('7.48: "não achei" ignora a quantidade enviada', (await ultConf()).estoque_depois === '' && (await ultConf()).divergiu === 1);
  // listas da Gestão
  const lsOff = await A(PABLO, 'GET', '/esteira/listas');
  chk('7.48: listas indisponíveis voltam vazias (null) sem erro', lsOff.j.ok && lsOff.j.categorias === null && lsOff.j.cores === null && Array.isArray(lsOff.j.tecidos), lsOff.j);
  LISTAS_ON = true; kv.delete('est:listas:v1');
  const lsOn = await A(IARA, 'GET', '/esteira/listas');
  chk('7.48: /esteira/listas devolve categorias, públicos, tamanhos e cores da Gestão (toda a equipe lê)', lsOn.j.ok && lsOn.j.categorias.join() === 'Vestidos,Saias,Blusas,Moda praia' && lsOn.j.generos.length === 2 && lsOn.j.tamanhos.includes('GG') && lsOn.j.cores.includes('Off-white'), lsOn.j);
  const nPed = listasPedidas; await A(IARA, 'GET', '/esteira/listas');
  chk('7.48: listas ficam no cache (sem pedir de novo ao catálogo)', listasPedidas === nPed);
  const V = W.estValidarCampos_;
  const vOk = V(lsOn.j, { categoria: 'vestidos', genero: 'feminino adulto', tamanhos: 'p, M, m', cores: 'off-white' });
  chk('7.48: validação aceita sem acento/maiúscula e devolve o nome da lista (sem repetir)', vOk.valores && vOk.valores.categoria === 'Vestidos' && vOk.valores.genero === 'Feminino Adulto' && vOk.valores.tamanhos === 'P, M' && vOk.valores.cores === 'Off-white', vOk);
  chk('7.48: validação recusa nome que não existe, em português', /A cor “Roxo” não está cadastrada na Gestão/.test(V(lsOn.j, { cores: 'Preto, Roxo' }).erro || '') && /categoria/.test(V(lsOn.j, { categoria: 'Vestido Inventado' }).erro || ''));
  chk('7.48: lista indisponível não bloqueia', V({ categorias: null }, { categoria: 'Qualquer' }).valores.categoria === 'Qualquer');
  const novoBom = { tipo: 'novo', nome: 'Macacão Linho', categoria: 'vestidos', genero: 'Feminino Adulto', tamanhos: 'P, G', cores: 'Preto', tecido: 'Linho', qtd_pedida: 2, custo: 50 };
  const svInv = await P(PABLO, 'salvar', { fornecedor: 'Ateliê X', itens: [Object.assign({}, novoBom, { categoria: 'Macacões Novos' })] });
  chk('7.48: pedido com categoria digitada fora da lista é recusado (nada criado)', svInv.r.status === 400 && /Item 1 \(Macacão Linho\): A categoria “Macacões Novos” não está cadastrada/.test(svInv.j.erro), svInv.j);
  chk('7.48: tamanho fora da lista é recusado', /O tamanho “XGG”/.test((await P(PABLO, 'salvar', { fornecedor: 'Ateliê X', itens: [Object.assign({}, novoBom, { tamanhos: 'P, XGG' })] })).j.erro || ''));
  const svBom = await P(PABLO, 'salvar', { fornecedor: 'Ateliê X', itens: [novoBom] });
  chk('7.48: produto novo com opções da lista é salvo com os nomes da Gestão e o tecido', svBom.j.ok && svBom.j.pedido.itens[0].categoria === 'Vestidos' && svBom.j.pedido.itens[0].tecido === 'Linho' && svBom.j.pedido.fornecedorId === 0, svBom.j);
  // fornecedores
  const fI = await A(IARA, 'GET', '/esteira/fornecedores');
  chk('7.48: funcionária não vê o cadastro de fornecedores (aviso em português)', fI.r.status === 403 && /fornecedores/.test(fI.j.erro));
  chk('7.48: funcionária não cadastra fornecedor', (await A(IARA, 'POST', '/esteira/fornecedores/salvar', { nome: 'X' })).r.status === 403);
  chk('7.48: fornecedor sem nome é recusado', /nome do fornecedor/.test((await A(PABLO, 'POST', '/esteira/fornecedores/salvar', { nome: '  ' })).j.erro || ''));
  const fBad = await A(PABLO, 'POST', '/esteira/fornecedores/salvar', { nome: 'Malhas Ceará', fone1: '(88) 99999-0001', fone2: '1234' });
  chk('7.48: telefone curto é recusado dizendo qual (Telefone 2)', fBad.r.status === 400 && /Telefone 2/.test(fBad.j.erro), fBad.j);
  const fOk = await A(PABLO, 'POST', '/esteira/fornecedores/salvar', { nome: '  Malhas   Ceará ', endereco: 'Rua A, 10\nCentro', fone1: '(88) 99999-0001', fone2: '+55 88 3333-4444', fone3: '' });
  const F1 = fOk.j.fornecedor || {};
  chk('7.48: fornecedor criado (nome limpo, telefones só com dígitos, 55 do país tirado)', fOk.j.ok && F1.id > 0 && F1.nome === 'Malhas Ceará' && F1.endereco === 'Rua A, 10 Centro' && F1.fone1 === '88999990001' && F1.fone2 === '8833334444' && F1.fone3 === '', fOk.j);
  const fDup = await A(PABLO, 'POST', '/esteira/fornecedores/salvar', { nome: 'malhas ceara' });
  chk('7.48: nome repetido (sem acento/maiúscula) é recusado', fDup.r.status === 400 && /Já existe um fornecedor/.test(fDup.j.erro) && fDup.j.existente === F1.id, fDup.j);
  const F2 = (await A(PABLO, 'POST', '/esteira/fornecedores/salvar', { nome: 'Ateliê Aurora' })).j.fornecedor;
  const fl = await A(PABLO, 'GET', '/esteira/fornecedores');
  chk('7.48: lista de fornecedores em ordem alfabética', fl.j.ok && fl.j.fornecedores.map((x) => x.nome).join() === 'Ateliê Aurora,Malhas Ceará', fl.j);
  chk('7.48: pedido com fornecedor que não existe é recusado', /não está mais no cadastro/.test((await P(PABLO, 'salvar', { fornecedorId: 9999, fornecedor: 'X', itens: [] })).j.erro || ''));
  const pF = await P(PABLO, 'salvar', { fornecedorId: F1.id, fornecedor: 'qualquer coisa', itens: [{ tipo: 'reposicao', produto: '1003', nome: 'Peça 3', qtd_pedida: 1 }] });
  chk('7.48: pedido guarda o id do fornecedor e o nome do cadastro', pF.j.ok && pF.j.pedido.fornecedorId === F1.id && pF.j.pedido.fornecedor === 'Malhas Ceará', pF.j);
  const pF2 = await P(PABLO, 'salvar', { id: pF.j.pedido.id, fornecedor: 'Malhas Ceará', itens: pF.j.pedido.itens });
  chk('7.48: salvar de novo sem mandar o id mantém o fornecedor ligado', pF2.j.ok && pF2.j.pedido.fornecedorId === F1.id, pF2.j);
  const fRen = await A(PABLO, 'POST', '/esteira/fornecedores/salvar', { id: F1.id, nome: 'Malhas Ceará Ltda', fone1: '88999990001' });
  const abF = await A(PABLO, 'GET', '/esteira/pedidos/abrir?id=' + pF.j.pedido.id);
  chk('7.48: editar o fornecedor muda o nome nos pedidos ligados a ele', fRen.j.ok && abF.j.pedido.fornecedor === 'Malhas Ceará Ltda' && abF.j.pedido.fornecedorId === F1.id && (await A(PABLO, 'GET', '/esteira/fornecedores')).j.fornecedores.find((x) => x.id === F1.id).pedidos === 1, abF.j.pedido);
  chk('7.48: editar fornecedor que não existe: aviso', (await A(PABLO, 'POST', '/esteira/fornecedores/salvar', { id: 777, nome: 'Z' })).r.status === 404);
  const pLeg = await P(PABLO, 'salvar', { fornecedor: 'Fornecedor antigo em texto', itens: [] });
  const lsLeg = await A(PABLO, 'GET', '/esteira/pedidos');
  chk('7.48: pedido antigo com fornecedor em texto livre continua salvando e aparecendo', pLeg.j.ok && pLeg.j.pedido.fornecedorId === 0 && lsLeg.j.pedidos.some((x) => x.fornecedor === 'Fornecedor antigo em texto') && lsLeg.j.pedidos.some((x) => x.fornecedor === 'Confecção Aurora Ltda'), pLeg.j);
  const FL = W.estFornecedorLimpo_;
  chk('7.48: telefone com 11 dígitos aceito; com letras e poucos números recusado', FL({ nome: 'A', fone3: '88 9 9999-0000' }).fornecedor.fone3 === '88999990000' && /Telefone 1/.test(FL({ nome: 'A', fone1: 'abc12' }).erro || ''));
  // decisão de "veio a mais" e extra da equipe também só com nomes da lista
  const pD = await P(PABLO, 'salvar', { fornecedorId: F2.id, itens: [{ tipo: 'reposicao', produto: '1004', nome: 'Peça 4', qtd_pedida: 1, custo: 10 }] });
  const PD = pD.j.pedido.id; await P(PABLO, 'enviar', { id: PD });
  await P(IARA, 'contar', { id: PD, item: pD.j.pedido.itens[0].id, qtd: 1 });
  const exBad = await P(IARA, 'extra', { id: PD, nome: 'Top', qtd: 1, cores: 'Roxo' });
  chk('7.48: "veio a mais" com cor fora da lista é recusado', exBad.r.status === 400 && /Roxo/.test(exBad.j.erro), exBad.j);
  const exT = await P(IARA, 'extra', { id: PD, nome: 'Top listrado', qtd: 1 });
  await P(IARA, 'concluir', { id: PD });
  const dBad = await P(PABLO, 'decidir', { id: PD, item: exT.j.item, decisao: 'incluir', custo: '20', categoria: 'Tops Novos', genero: 'Feminino Adulto' });
  chk('7.48: incluir o que veio a mais com categoria inventada é recusado', dBad.r.status === 400 && /Tops Novos/.test(dBad.j.erro), dBad.j);
  const dOk = await P(PABLO, 'decidir', { id: PD, item: exT.j.item, decisao: 'incluir', custo: '20', categoria: 'blusas', genero: 'Feminino Adulto', tamanhos: 'm', cores: 'azul', tecido: 'Malha' });
  chk('7.48: incluir com opções da lista grava os nomes da Gestão e o tecido', dOk.j.ok && dOk.j.item.categoria === 'Blusas' && dOk.j.item.tamanhos === 'M' && dOk.j.item.cores === 'Azul' && dOk.j.item.tecido === 'Malha', dOk.j);
  LISTAS_ON = false; kv.delete('est:listas:v1');
  const vaz = respostasEquipe.find((x) => vazouChave(x.j, ['custo', 'qtd_pedida']));
  chk('nenhuma resposta para quem não é Admin total contém custo ou qtd_pedida (' + respostasEquipe.length + ' respostas)', !vaz && respostasEquipe.some((x) => x.rota.includes('/pedidos')), vaz);
  { // v7.54: resposta perdida/concorrrente consulta o mesmo recibo, nunca cria outra tarefa.
  const recibo=async(whats,op,corpo,consulta=false)=>{const r=await w.fetch(new Request('https://ig.fake'+(consulta?'/esteira/operacoes/status?op='+op:'/esteira/preparar'),{method:consulta?'GET':'POST',headers:{'Content-Type':'application/json','X-TK-Whats':whats,'X-TK-Sessao':'tk3.sessao-'+whats,'X-TK-Operacao':op},body:consulta?undefined:JSON.stringify(corpo)}),env,ctx);return{status:r.status,j:await r.json()}};
  const op='teste-recibo-20261104',corpo={id:'1005',nome:'Peça do recibo',codigo:'TK-5'};
  const [r1,r2]=await Promise.all([recibo(PABLO,op,corpo),recibo(PABLO,op,corpo)]);
  const r3=await recibo(PABLO,op,corpo),r4=await recibo(PABLO,op,null,true);
  chk('processo simultâneo e resposta perdida mantêm confirmação original',r1.j.ok&&r3.j.ok&&r4.j.ok&&JSON.stringify(r1.j)===JSON.stringify(r3.j)&&JSON.stringify(r3.j)===JSON.stringify(r4.j),{r1,r2,r3});
  chk('mesmo identificador com dados diferentes não executa', (await recibo(PABLO,op,{...corpo,id:'1006'})).status===409);
  chk('outra conta não lê recibo alheio',(await recibo(IARA,op,null,true)).status===404);
  usuarios[PABLO].permissoes=['catalogo_cadastrar'];kv.clear();cacheMem.clear();
  chk('permissão revogada não recupera resposta administrativa',(await recibo(PABLO,op,null,true)).status===403);
  }
  { // BUG-23: permissão de Gestão permite reconciliar fotos sem depender da LISTA RH.
    // Usa SQLite em memória e RH simulado indisponível; nunca usa planilhas, D1 ou pessoas reais.
    const fetchAntes = globalThis.fetch, rhAntes = env.RH_URL, usuarioAntes = { ...usuarios[PABLO] };
    let chamadasRH = 0;
    try {
      usuarios[PABLO] = { nome: 'Admin Teste', permissoes: ['gerir_acessos', 'catalogo_cadastrar'], acessosConfiguraveis: true };
      env.RH_URL = 'https://rh-indisponivel.fake/exec';
      globalThis.fetch = async (url, init) => {
        if (String(url).startsWith('https://rh-indisponivel.fake/')) {
          chamadasRH++;
          throw new Error('RH de teste indisponível');
        }
        return fetchAntes(url, init);
      };
      const pend = [];
      for (const k of [1, 2]) {
        const inserido = await env.DB.prepare("INSERT INTO est_caixa(op,url,status) VALUES(?,?,'nova')")
          .bind('test-caixa-rh-' + k, 'https://midia.fake/m/caixa-' + k + '.jpg').run();
        pend.push(inserido.meta.last_row_id);
      }
      const r1 = await A(PABLO, 'POST', '/esteira/caixa/usar',
        { ids: [pend[0]], uso: 'criado', produto: 'P-SIMULADO', produtoNome: 'Produto simulado' });
      const salvo = await env.DB.prepare('SELECT status,uso_produto,usada_nome FROM est_caixa WHERE id=?').bind(pend[0]).first();
      chk('Gestão confirma caixa mesmo com lista RH indisponível (sem permissão extra)',
        r1.r.status === 200 && r1.j.ok && r1.j.marcadas === 1 && salvo.status === 'usada'
          && salvo.uso_produto === 'P-SIMULADO' && salvo.usada_nome === 'Admin Teste',
        { status: r1.r.status, ok: r1.j.ok, atualizou: salvo.status });
      const repetido = await A(PABLO, 'POST', '/esteira/caixa/usar',
        { ids: [pend[0]], uso: 'criado', produto: 'P-SIMULADO', produtoNome: 'Produto simulado' });
      chk('Mesmo recibo não altera foto já utilizada', repetido.r.status === 200 && repetido.j.ok && repetido.j.marcadas === 0,
          { status: repetido.r.status, marcadas: repetido.j.marcadas });
      const opReq = new Request('https://ig.fake/esteira/caixa/usar', { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-TK-Whats': PABLO, 'X-TK-Sessao': 'tk3.sessao-' + PABLO,
                   'X-TK-Operacao': 'teste-caixa-gestao-rh-fora-20261112' },
        body: JSON.stringify({ ids: [pend[1]], uso: 'criado', produto: 'P-SIMULADO-2' }) });
      const respostaOp = await w.fetch(opReq, env, ctx), rOp = await respostaOp.json();
      chk('Confirmação com identificador de operação também dispensa consulta RH',
          respostaOp.status === 200 && rOp.ok && rOp.marcadas === 1,
          { status: respostaOp.status, ok: rOp.ok });
      chk('Nenhuma consulta à lista de equipe RH na confirmação autorizada', chamadasRH === 0, chamadasRH);
      usuarios[PABLO].permissoes = [];
      const neg = await A(PABLO, 'POST', '/esteira/caixa/usar',
        { ids: [pend[1]], uso: 'criado', produto: 'OUTRO-PRODUTO' });
      chk('Revogação de permissões continua bloqueando uso da caixa', neg.r.status === 403,
          { status: neg.r.status, erro: neg.j.erro });
      const final = await env.DB.prepare('SELECT uso_produto FROM est_caixa WHERE id=?').bind(pend[1]).first();
      chk('Tentativa sem permissão não sobrescreve vínculo já salvo', final.uso_produto === 'P-SIMULADO-2');
    } finally {
      globalThis.fetch = fetchAntes;
      if (rhAntes === undefined) delete env.RH_URL; else env.RH_URL = rhAntes;
      usuarios[PABLO] = usuarioAntes;
    }
  }
  { // No D1 frio, consultar RH em paralelo sem reaproveitar autorização.
    const banco = d1(), fetchOriginal = globalThis.fetch, usuarioOriginal = usuarios[PABLO];
    const espera = {};
    espera.banco = new Promise(ok => { espera.liberarBanco = ok; });
    espera.rh = new Promise(ok => { espera.liberarRH = ok; });
    let consultaRH = 0, concluir = false;
    const db = {
      prepare(sql) {
        const consulta = banco.prepare(sql);
        const executar = consulta.run;
        consulta.run = async () => { await espera.banco; return executar(); };
        return consulta;
      },
      batch: banco.batch,
    };
    const frio = { ...env, DB: db, RH_URL: 'https://rh.fake/exec' };
    const consultar = () => w.fetch(new Request('https://ig.fake/esteira/pedidos', { headers: {
      'X-TK-Whats': PABLO, 'X-TK-Sessao': 'tk3.sessao-' + PABLO, 'Origin': 'https://tenkitermodas.com.br',
    } }), frio, ctx);
    try {
      usuarios[PABLO] = { nome: 'Admin Teste', permissoes: ['gerir_acessos'], acessosConfiguraveis: true };
      globalThis.fetch = async (url, init) => {
        if (String(url) !== frio.RH_URL) return fetchOriginal(url, init);
        chk('consulta paralela mantém o contrato de equipe autenticada', JSON.parse(init.body).action === 'esteira_equipe');
        consultaRH++;
        espera.liberarRH();
        return new Response(JSON.stringify({ ok: true, fonte: 'acessos', equipe: [] }));
      };
      const leitura = consultar().finally(() => { concluir = true; });
      let timer;
      await Promise.race([espera.rh, new Promise(ok => { timer = setTimeout(ok, 500); })]);
      clearTimeout(timer);
      chk('RH inicia sem depender do D1 frio, e a rota ainda espera o banco', consultaRH === 1 && !concluir);
      espera.liberarBanco();
      const r = await leitura;
      chk('Pedidos preserva a resposta após a inicialização', r.status === 200 && (await r.json()).ok);
      usuarios[PABLO] = { ...usuarios[PABLO], permissoes: [] };
      chk('revogação na requisição seguinte bloqueia e não consulta a equipe', (await consultar()).status === 403 && consultaRH === 1);
    } finally {
      espera.liberarBanco();
      globalThis.fetch = fetchOriginal;
      usuarios[PABLO] = usuarioOriginal;
    }
  }
  { // D1 já migrado: uma instância fria não repete ALTER, e a recuperação cria o índice.
    const consultas = [];
    let falharIndice = false;
    const banco = d1();
    const DB = { ...banco, prepare(sql) {
      consultas.push(sql);
      if (falharIndice && sql.startsWith('CREATE INDEX IF NOT EXISTS ix_est_produto_preparacao')) throw Error('D1_ERROR: indisponível');
      return banco.prepare(sql);
    } };
    const adminAnterior = usuarios[PABLO];
    usuarios[PABLO] = { nome: 'Admin Teste', permissoes: ['gerir_acessos'] };
    const ler = bancoEsteira => w.fetch(new Request('https://ig.fake/esteira/preparacao?pagina=1', { headers: {
      'X-TK-Whats': PABLO, 'X-TK-Sessao': 'tk3.sessao-' + PABLO,
    } }), { ...env, DB: bancoEsteira }, ctx);
    try {
      chk('Banco novo instala as colunas e permite a Preparação paginada', (await ler(banco)).status === 200);
      await banco.prepare('DROP INDEX ix_est_produto_preparacao').run();
      await banco.prepare("INSERT INTO est_produto(id,etapa,ref_nome) VALUES('ANTIGA','preparacao','Peça simulada antiga')").run();
      falharIndice = true;
      chk('Falha real na inicialização mantém a leitura indisponível até retentar', (await ler(DB)).status === 500);
      falharIndice = false;
      const [r1, r2] = await Promise.all([ler(DB), ler(DB)]);
      const produtos = (await r1.json()).produtos;
      const indice = await banco.prepare("SELECT name FROM sqlite_master WHERE name='ix_est_produto_preparacao'").first();
      chk('Retentativa concorrente instala o índice e preserva a peça existente', r1.ok && r2.ok && indice && produtos[0]?.nome === 'Peça simulada antiga');
      chk('Banco migrado faz cinco leituras de metadados por tentativa, sem ALTER duplicado', consultas.filter(s => s.startsWith('PRAGMA table_info(est_')).length === 10 && !consultas.some(s => s.startsWith('ALTER TABLE est_')));
    } finally { usuarios[PABLO] = adminAnterior; }
  }
  { // Páginas de Preparação usam dados SQLite isolados e mantêm o contrato anterior.
    const DB = d1(), teste = { ...env, DB };
    usuarios[PABLO] = { nome: 'Admin Teste', permissoes: ['gerir_acessos'] };
    usuarios[VISITA] = { nome: 'Acesso revogado', permissoes: [], acessosConfiguraveis: true };
    const ler = async (qs = '', quem = PABLO) => {
      const r = await w.fetch(new Request('https://ig.fake/esteira/preparacao' + qs, { headers: {
        'X-TK-Whats': quem, 'X-TK-Sessao': 'tk3.sessao-' + quem, 'Origin': 'https://tenkitermodas.com.br',
      } }), teste, ctx);
      return { status: r.status, j: await r.json() };
    };
    const rota = '?pagina=1', pagina = c => ler(rota + '&depois=' + encodeURIComponent(c));
    const vazio = await ler(rota);
    chk('Preparação paginada vazia confirma fim e nenhuma exclusão', vazio.j.ok && !vazio.j.produtos.length && vazio.j.proximo === null && vazio.j.emPreparacao.length === 0, vazio);
    for (let i = 0; i < 58; i++) {
      const id = i === 23 ? 'PP-23-é' : 'PP-' + String(i).padStart(2, '0');
      await DB.prepare("INSERT INTO est_produto(id,etapa,preparado_em,ref_nome) VALUES(?,'preparacao',?,?)").bind(id, i < 28 ? null : i < 36 ? '' : '2026-11-13', 'Simulada ' + id).run();
      await DB.prepare("INSERT INTO est_tarefa(produto,titulo,status,origem) VALUES(?,'Conferir cor','pendente','preparacao'),(?,'Conferir cor','feita','preparacao'),(?,'Fotografar','pendente','pedido_fotos')").bind(id, id, id).run();
    }
    await DB.prepare("INSERT INTO est_tarefa(produto,titulo) VALUES('PP-FORA','Tarefa avulsa')").run();
    const anterior = (await ler()).j;
    const p1 = (await ler(rota)).j, p2 = (await pagina(p1.proximo)).j, p3 = (await pagina(p2.proximo)).j;
    chk('Preparação entrega 24, 24 e 10, inclusive entre data nula, vazia e datas iguais', [p1.produtos?.length, p2.produtos?.length, p3.produtos?.length, p3.proximo].join('|') === '24|24|10|' && p3.proximo === null);
    const todos = [p1, p2, p3].flatMap(p => p.produtos);
    chk('Páginas conservam ordem, progresso, fotos e tarefas do contrato anterior', JSON.stringify(todos) === JSON.stringify(anterior.produtos) && p1.fotosPedidas === 58 && todos.every(x => x.tarefas.length === 1 && x.feitas === 1));
    chk('Exclusões incluem os itens ainda fora da tela e tarefas avulsas só aparecem na primeira página', p1.emPreparacao?.length === 58 && p1.emPreparacao.includes('PP-57') && p2.emPreparacao === undefined && p1.outras.length === 1 && JSON.stringify(p1.outras) === JSON.stringify(anterior.outras) && !p2.outras.length && !p3.outras.length);
    const saiu = p1.produtos.at(-1).id;
    await DB.prepare("UPDATE est_produto SET etapa='aceito' WHERE id=?").bind(saiu).run();
    chk('Cursor continua válido se a última peça da primeira página sair da Preparação', JSON.stringify((await pagina(p1.proximo)).j.produtos) === JSON.stringify(p2.produtos));
    chk('Cursor inválido retorna 400 e usuário revogado não recebe a página', (await pagina('inválido')).status === 400 && (await ler(rota, VISITA)).status === 403);
  }
  console.log(ok + ' ok, ' + falhas.length + ' falhas'); if (falhas.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
