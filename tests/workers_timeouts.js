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
console.log(`${ok} ok, ${falhas} falhas`);
process.exit(falhas ? 1 : 0);
