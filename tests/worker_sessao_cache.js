/* v7.80.0 — Esteira: leituras aproveitam a última conferência de sessão (D1); escrita, sincronizar e menu conferem ao vivo.
 * Mesmo Worker, D1 SQLite e backend simulado de tests/worker_esteira.js (apenas o preparo, sem as jornadas). */
const fs = require('fs'), path = require('path'), vm = require('vm');
let harness = fs.readFileSync(path.join(__dirname, 'worker_esteira.js'), 'utf8').replace(/\r/g, '').split('  // acesso\n')[0];
harness = harness.replace('tk_ig_esteira.mjs', 'tk_ig_sessao_cache.mjs');
const cenarios = String.raw`
  delete env.SESSAO_CACHE;   // o aproveitamento é o padrão; os outros testes o desligam
  const f0 = globalThis.fetch; let vivas = 0, apiFora = false, segurar = null;
  globalThis.fetch = async (u, init) => {
    if (String(u).startsWith('https://api.fake/') && init && init.method === 'POST' && JSON.parse(init.body).action === 'sessao') {
      vivas++; if (apiFora) throw new Error('Apps Script fora do ar');
      if (segurar) { const resposta = await f0(u, init); await segurar; return resposta; }
    }
    return f0(u, init);
  };
  const pend = [], ctx2 = { waitUntil: (p) => { pend.push(p); } };
  const esperar = async () => { while (pend.length) await pend.shift(); };
  const Q = async (whats, rota, o = {}) => {
    const r = await w.fetch(new Request('https://ig.fake' + rota, { method: o.metodo || 'GET', headers: { 'Content-Type': 'application/json', 'X-TK-Whats': whats, 'X-TK-Sessao': o.sessao || 'tk3.sessao-' + whats, 'Origin': 'https://tenkitermodas.com.br' }, body: o.corpo ? JSON.stringify(o.corpo) : undefined }), env, ctx2);
    let j = null; try { j = await r.clone().json(); } catch (e) { /* sem corpo */ }
    return { r, j, status: r.status, timing: r.headers.get('Server-Timing') || '' };
  };
  const linhas = async () => (await env.DB.prepare("SELECT chave, dados, em FROM sessao_cache WHERE dados<>''").all()).results;
  const CX = '/esteira/caixa?pagina=1&ver=novas';

  let x = await Q(PABLO, CX); await esperar();
  chk('1ª leitura confere ao vivo e guarda a conferência', x.status === 200 && x.j.ok && vivas === 1 && (await linhas()).length === 1, { s: x.status, vivas });
  x = await Q(PABLO, CX); await esperar();
  chk('2ª leitura (menos de 30 s) usa o guardado, sem Apps Script, e é medida como sessao_cache', x.status === 200 && vivas === 1 && /sessao_cache;dur=/.test(x.timing), { vivas, t: x.timing });
  for (const rota of ['/esteira/hoje/primeiros', '/esteira/fotos', '/esteira/hoje/tarefas']) {
    x = await Q(PABLO, rota); await esperar();
    chk('leitura rápida ' + rota + ' também aproveita', x.status === 200 && vivas === 1, { rota, s: x.status, vivas });
  }


  // medidas anônimas enviadas pelos aparelhos (/esteira/medida)
  const M = (corpo) => Q(PABLO, '/esteira/medida', { metodo: 'POST', corpo });
  const vm0 = vivas;
  x = await M({ aba: 'hoje', via: 'frio', item_ms: 2400, util_ms: 3100, rede: '4g', cpu: 8, mem: 4, v: '7.80.0' }); await esperar();
  chk('medida válida é gravada e aproveita a sessão guardada (sem Apps Script)', x.status === 200 && x.j.ok && vivas === vm0, { s: x.status, vivas, vm0 });
  const med = (await env.DB.prepare('SELECT * FROM est_medida').all()).results;
  chk('a medida não guarda WhatsApp, sessão nem identidade', med.length === 1 && Object.keys(med[0]).sort().join() === 'aba,cpu,dia,em,id,item_ms,mem,rede,util_ms,versao,via' && !JSON.stringify(med[0]).includes(PABLO) && med[0].item_ms === 2400 && med[0].versao === '7.80.0', med);
  for (const [nome, corpo, esperado] of [
    ['aba fora da lista', { aba: 'x', via: 'frio', item_ms: 100 }, 400], ['via fora da lista', { aba: 'hoje', via: 'x', item_ms: 100 }, 400],
    ['tempo zero', { aba: 'hoje', via: 'frio', item_ms: 0 }, 400], ['tempo gigante', { aba: 'hoje', via: 'frio', item_ms: 999999 }, 400],
    ['tempo não inteiro', { aba: 'hoje', via: 'frio', item_ms: '12' }, 400], ['corpo enorme', { aba: 'hoje', via: 'frio', item_ms: 100, lixo: 'x'.repeat(2000) }, 413]]) {
    x = await M(corpo); await esperar();
    chk('medida inválida recusada: ' + nome, x.status === esperado, { s: x.status });
  }
  x = await Q('88999990099', '/esteira/medida', { metodo: 'POST', corpo: { aba: 'hoje', via: 'frio', item_ms: 100 } });
  chk('medida sem sessão válida é recusada e não grava', x.status === 401 && (await env.DB.prepare('SELECT COUNT(*) AS n FROM est_medida').first()).n === 1, { s: x.status });
  x = await M({ aba: 'fotos', via: 'toque', item_ms: 900, rede: 'rede-inventada', cpu: 500, mem: 3, v: '<script>' }); await esperar();
  const med2 = (await env.DB.prepare('SELECT * FROM est_medida ORDER BY id DESC LIMIT 1').first());
  chk('campos opcionais fora do padrão são zerados, nunca gravados como vieram', x.status === 200 && med2.rede === '' && med2.cpu === 0 && med2.mem === 0 && med2.versao === '', med2);

  let ao0 = vivas;
  x = await Q(PABLO, '/esteira/toque', { metodo: 'POST', corpo: { ids: ['1001'] } }); await esperar();
  chk('escrita (POST) confere sempre ao vivo', x.status === 200 && vivas === ao0 + 1, { s: x.status, vivas });
  x = await Q(PABLO, '/esteira/sincronizar?aba=hoje'); await esperar();
  chk('sincronizar confere sempre ao vivo', x.status === 200 && vivas === ao0 + 2, { s: x.status, vivas });
  x = await Q(PABLO, '/esteira/menu'); await esperar();
  chk('menu confere sempre ao vivo', x.status === 200 && vivas === ao0 + 3, { s: x.status, vivas });

  // passados 30 s: serve o guardado e confere ao vivo em segundo plano
  await env.DB.prepare('UPDATE sessao_cache SET em=?, reval=0').bind(Date.now() - 40000).run();
  const antes = vivas;
  x = await Q(PABLO, CX);
  chk('leitura com 40 s responde sem esperar o Apps Script', x.status === 200 && vivas === antes + 1 && /sessao_cache;dur=/.test(x.timing) === true, { vivas, antes });
  await esperar();
  chk('a conferência em segundo plano renova o guardado', vivas === antes + 1 && Date.now() - (await linhas())[0].em < 5000);

  // outra sessão ou outro WhatsApp nunca acertam a linha
  x = await Q(PABLO, CX, { sessao: 'tk3.outra-sessao' }); await esperar();
  chk('outra sessão do mesmo WhatsApp confere ao vivo e cria a sua própria linha', x.status === 200 && vivas === antes + 2 && (await linhas()).length === 2, { vivas, n: (await linhas()).length });
  x = await Q('88999990099', CX); await esperar();
  chk('sessão que o backend não reconhece é recusada e não deixa linha', x.status === 401 && (await linhas()).length === 2, { s: x.status });
  x = await Q('88999990099', CX); await esperar();
  chk('e continua recusada na requisição seguinte (nada guardado a favor dela)', x.status === 401);
  chk('o token da sessão nunca é gravado', (await linhas()).every((l) => !/tk3\./.test(l.dados) && !/tk3\./.test(l.chave) && /^[0-9a-f]{64}$/.test(l.chave)));

  // revogação: sincronizar (ao vivo) apaga; leitura com guardado vencido faz no máximo uma leitura de atraso
  const permissoesPablo = usuarios[PABLO].permissoes.slice();
  usuarios[PABLO].permissoes = [];
  x = await Q(PABLO, CX); await esperar();
  chk('revogado há menos de 30 s: a leitura guardada ainda passa (limite documentado)', x.status === 200);
  x = await Q(PABLO, '/esteira/sincronizar?aba=hoje'); await esperar();
  chk('sincronizar ao vivo recusa e apaga a linha', x.status === 403 && (await linhas()).length === 1, { s: x.status, n: (await linhas()).length });
  x = await Q(PABLO, CX); await esperar();
  chk('a leitura seguinte já é recusada', x.status === 403, { s: x.status });
  usuarios[PABLO].permissoes = permissoesPablo;
  x = await Q(PABLO, CX); await esperar();
  chk('acesso devolvido: volta a abrir (ao vivo) e guarda de novo', x.status === 200);
  usuarios[PABLO].permissoes = [];
  await env.DB.prepare('UPDATE sessao_cache SET em=?, reval=0').bind(Date.now() - 40000).run();
  x = await Q(PABLO, CX);
  chk('revogado com guardado vencido: no máximo UMA leitura de atraso', x.status === 200);
  await esperar();
  x = await Q(PABLO, CX); await esperar();
  chk('…e a leitura seguinte já é recusada (a conferência em segundo plano apagou a linha)', x.status === 403, { s: x.status });
  usuarios[PABLO].permissoes = permissoesPablo;


  // corrida: uma conferência em segundo plano que começou ANTES da revogação e termina DEPOIS não ressuscita o acesso.
  // O relógio fica parado para o pior caso: início da conferência lenta e da que revoga no MESMO milissegundo.
  const relogioReal = Date.now, agoraFixo = relogioReal(); Date.now = () => agoraFixo;
  x = await Q(PABLO, CX); await esperar();
  await env.DB.prepare('UPDATE sessao_cache SET em=?, reval=0 WHERE dados<>\'\'').bind(Date.now() - 40000).run();
  let soltar; segurar = new Promise((ok) => { soltar = ok; });
  x = await Q(PABLO, CX);                               // serve o guardado e deixa a conferência lenta pendente (resposta ainda com permissões)
  chk('corrida: a leitura vencida é servida enquanto a conferência lenta segue pendente', x.status === 200 && pend.length === 1);
  usuarios[PABLO].permissoes = [];
  const lenta = pend.shift(); segurar = null;
  x = await Q(PABLO, '/esteira/sincronizar?aba=hoje'); await esperar();
  chk('corrida: a conferência ao vivo posterior invalida o acesso', x.status === 403);
  soltar(); await lenta;
  x = await Q(PABLO, CX); await esperar();
  chk('corrida: a resposta lenta, de antes da revogação, NÃO regrava as permissões antigas', x.status === 403 && (await linhas()).filter((l) => l.chave).length <= 1, { s: x.status });
  usuarios[PABLO].permissoes = permissoesPablo;
  Date.now = relogioReal;


  // uma só conferência em segundo plano por vez: 5 leituras paralelas com o guardado vencido => 1 chamada ao Apps Script
  x = await Q(PABLO, CX); await esperar();
  await env.DB.prepare("UPDATE sessao_cache SET em=?, reval=0 WHERE dados<>''").bind(Date.now() - 40000).run();
  const vp = vivas;
  const par = await Promise.all([1, 2, 3, 4, 5].map(() => Q(PABLO, CX)));
  chk('paralelas com o guardado vencido: todas respondem sem esperar o Apps Script', par.every((q) => q.status === 200));
  await esperar();
  chk('…e só UMA conferência em segundo plano é disparada', vivas === vp + 1, { vivas, vp });
  const antesReserva = vivas;
  await env.DB.prepare("UPDATE sessao_cache SET em=? WHERE dados<>''").bind(Date.now() - 40000).run();
  await Q(PABLO, CX); await esperar();
  chk('a reserva segura novas conferências por 20 s (leitura seguinte não dispara outra)', vivas === antesReserva, { vivas, antesReserva });


  // aquecimento da sessão pela Gestão (/esteira/aquecer)
  await env.DB.prepare('DELETE FROM sessao_cache').run();
  const va = vivas;
  x = await Q(PABLO, '/esteira/aquecer'); await esperar();
  chk('aquecer: 1ª chamada confere ao vivo, guarda a sessão e não devolve dado algum', x.status === 200 && x.j.ok === true && Object.keys(x.j).join() === 'ok' && vivas === va + 1 && (await linhas()).length === 1, { s: x.status, vivas, va });
  x = await Q(PABLO, '/esteira/aquecer'); await esperar();
  const vb = vivas;
  x = await Q(PABLO, CX); await esperar();
  chk('aquecer: a leitura seguinte (Esteira aberta em seguida) usa a sessão guardada, sem Apps Script', x.status === 200 && vivas === vb && /sessao_cache;dur=/.test(x.timing), { vivas, vb });
  x = await Q('88999990099', '/esteira/aquecer'); await esperar();
  chk('aquecer: sessão inválida é recusada (401) e não deixa linha', x.status === 401 && (await linhas()).length === 1, { s: x.status });
  x = await w.fetch(new Request('https://ig.fake/esteira/aquecer'), env, ctx2);
  chk('aquecer: sem cabeçalhos de sessão é recusado (401)', x.status === 401);

  // trava de gravação testada direto (empate de milissegundos entre processos diferentes)
  const T0 = Date.now(), regs = (c) => W.sessaoRegistrar_(env, c, { lista: ['esteira'], perfis: [], nome: 'T', configuraveis: true, msgModelos: {} }, T0);
  await env.DB.prepare('DELETE FROM sessao_cache').run();
  await env.DB.prepare('INSERT INTO sessao_cache (chave, dados, em) VALUES (?, ?, ?)').bind('c1', '', T0).run();
  await regs('c1');
  chk('trava: conferência com o MESMO instante da invalidação não ressuscita o acesso', (await env.DB.prepare("SELECT dados FROM sessao_cache WHERE chave='c1'").first()).dados === '');
  await W.sessaoRegistrar_(env, 'c1', { lista: ['esteira'], perfis: [], nome: 'T', configuraveis: true, msgModelos: {} }, T0 + 1);
  chk('trava: conferência mais nova que a invalidação volta a valer', (await env.DB.prepare("SELECT dados FROM sessao_cache WHERE chave='c1'").first()).dados !== '');
  await W.sessaoRegistrar_(env, 'c1', { lista: [], perfis: [], nome: '', configuraveis: false, msgModelos: {} }, T0 + 1);
  chk('trava: invalidação no mesmo instante da conferência vale (lado seguro)', (await env.DB.prepare("SELECT dados FROM sessao_cache WHERE chave='c1'").first()).dados === '');
  const r1 = W.sessaoRelogio_(), r2 = W.sessaoRelogio_(), r3 = W.sessaoRelogio_();
  chk('relógio da sessão nunca repete valor, mesmo no mesmo milissegundo', r2 > r1 && r3 > r2, [r1, r2, r3]);

  // validade máxima e backend fora do ar
  x = await Q(PABLO, CX); await esperar();
  await env.DB.prepare('UPDATE sessao_cache SET em=?, reval=0').bind(Date.now() - 700000).run();
  const v0 = vivas;
  x = await Q(PABLO, CX); await esperar();
  chk('guardado com mais de 10 min não vale: confere ao vivo', x.status === 200 && vivas === v0 + 1);
  await env.DB.prepare('UPDATE sessao_cache SET em=?, reval=0').bind(Date.now() - 40000).run();
  apiFora = true;
  x = await Q(PABLO, CX); await esperar();
  chk('backend fora do ar não apaga o guardado nem derruba a leitura', x.status === 200 && (await linhas()).length >= 1, { s: x.status });
  await env.DB.prepare('UPDATE sessao_cache SET em=?, reval=0').bind(Date.now() - 700000).run();
  x = await Q(PABLO, CX); await esperar();
  chk('sem guardado válido e com o backend fora, falha fechada (503), sem confundir com sessão inválida', x.status === 503, { s: x.status });
  apiFora = false;

  // desligar pelo Worker
  env.SESSAO_CACHE = 'off';
  const n0 = (await linhas()).length, v1 = vivas;
  await Q(PABLO, CX); await Q(PABLO, CX); await esperar();
  chk("SESSAO_CACHE='off' volta a conferir ao vivo em toda leitura e não grava", vivas === v1 + 2 && (await linhas()).length === n0, { vivas, v1 });
  delete env.SESSAO_CACHE;

  // fora da Esteira nada muda (Mensageiro continua com o cache da borda)
  const antesMsg = (await linhas()).length;
  await Q(PABLO, '/msg/acesso'); await esperar();
  chk('rotas fora da Esteira não passam pela linha do D1', (await linhas()).length === antesMsg);
  console.log(ok + ' ok, ' + falhas.length + ' falhas'); if (falhas.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
`;
// o harness termina o IIFE assíncrono no fim do arquivo original; aqui abrimos só o preparo e anexamos os cenários
vm.runInThisContext('(function(require,__dirname,__import){' + harness.replace('await import(', 'await __import(') + cenarios + '})', { filename: __filename })(require, __dirname, (u) => import(u));
