const assert=require("node:assert/strict"),fs=require("node:fs");
const js=fs.readFileSync("treinamento-postagens-fase1.js","utf8"),html=fs.readFileSync("treinamento-postagens-fase1.html","utf8");
assert.match(js,/Toque em uma das fotos fictícias para selecioná-la/);
assert.match(js,/alvo\.scrollIntoView/);
assert.match(js,/\$\("midia-ajuda"\)\.textContent/);
assert.match(html,/id="midia-ajuda"/);
assert.match(html,/Selecionada/);
assert.match(html,/Toque para selecionar/);
console.log("UX da mídia: orientação, seleção e foco em erro OK");