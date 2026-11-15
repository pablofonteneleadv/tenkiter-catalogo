// Guarda: toda consulta de sessão/catálogo ao Apps Script nos Workers tem prazo (AbortSignal.timeout) e o og não engole falha do KV em silêncio.
const fs = require('fs');
let ok = 0, falhas = 0;
const chk = (nome, c) => { if (c) { ok++; console.log('  ✔ ' + nome); } else { falhas++; console.log('  ✘ ' + nome); } };
const ler = (p) => fs.readFileSync(p, 'utf8');
for (const p of ['instagram-worker/worker.js', 'midia-worker/worker.js']) {
  const linhas = ler(p).split('\n').filter((l) => /fetch\(env\.API_URL/.test(l) && /action: 'sessao'/.test(l));
  chk(p + ': ' + linhas.length + ' consulta(s) de sessão, todas com prazo', linhas.length >= 1 && linhas.every((l) => /AbortSignal\.timeout\(\d+\)/.test(l)));
}
const og = ler('og-worker/worker.js');
chk('og: consulta do catálogo com prazo', /fetch\(API_URL \+ '\?action=list'[^\n]*AbortSignal\.timeout\(\d+\)/.test(og));
chk('og: falha ao gravar no KV é registrada', !/kv\.put\([^\n]*catch \(e\) \{\}/.test(og) && /falha ao gravar a lista no KV/.test(og));
const ig = ler('instagram-worker/worker.js');
chk('ig: existe o registrador de falhas em segundo plano', /function falhou_\(rotulo, nulo\)/.test(ig) && /tk_falha_segundo_plano/.test(ig));
const cron = ig.split(/\r?\n/).filter((l) => /ctx\.waitUntil\((processar(PushMobile|FilaZernio|Entradas|Agenda)_|indexarNomesGoogle_|estCatalogoAquecer_|estRetratoCron_)/.test(l));
chk('ig: tarefas do cron (' + cron.length + ') registram a falha em vez de engolir', cron.length >= 6 && cron.every((l) => /falhou_\('/.test(l) && !/catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(l)));
chk('ig: push, foto IA e resposta automática também registram', ['push_mobile', 'foto_ia', 'resposta_automatica', 'complementos'].every((r) => ig.includes("falhou_('" + r + "'")));
console.log(`${ok} ok, ${falhas} falhas`);
process.exit(falhas ? 1 : 0);
