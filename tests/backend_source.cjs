'use strict';
// Localiza código privado sem copiá-lo para o checkout público.
const fs = require('node:fs'), path = require('node:path');
const raiz = path.resolve(__dirname, '..');
function localizar(prefixo, minimo = [0, 0]) {
  if (!['catalogo', 'funcionario'].includes(prefixo)) throw new Error('Backend desconhecido.');
  const pastas = process.env.TK_COFRE_DIR
    ? [path.resolve(process.env.TK_COFRE_DIR)]
    : [path.resolve(raiz, '..', 'Tenkiter-cofre'), path.resolve(raiz, '..', 'tenkiter-cofre'), raiz];
  for (const pasta of [...new Set(pastas)]) {
    if (!fs.existsSync(pasta)) continue;
    const arquivos = fs.readdirSync(pasta).filter(nome => {
      const m = nome.match(new RegExp('^' + prefixo + '-codigo-(\\d+)\\.(\\d+)\\.gs\\.txt$'));
      return m && (Number(m[1]) > minimo[0] || Number(m[1]) === minimo[0] && Number(m[2]) >= minimo[1]);
    }).sort((a, b) => {
      const ver = nome => nome.match(/(\d+)\.(\d+)\.gs\.txt$/).slice(1).map(Number);
      const aa = ver(a), bb = ver(b); return aa[0] - bb[0] || aa[1] - bb[1];
    });
    if (arquivos.length) {
      const nome = arquivos.at(-1), caminho = path.join(pasta, nome);
      return { pasta, arquivos, nome, caminho, fonte: fs.readFileSync(caminho, 'utf8') };
    }
  }
  throw new Error('Backend privado ' + prefixo + ' ausente. Configure TK_COFRE_DIR para o Cofre; não copie .gs.txt para o repositório público.');
}
module.exports = { localizar };
if (require.main === module) {
  try { console.log(localizar(process.argv[2]).nome); } catch (erro) { console.error(erro.message); process.exitCode = 2; }
}
