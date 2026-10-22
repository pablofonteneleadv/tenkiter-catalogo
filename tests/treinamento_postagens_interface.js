const fs=require("node:fs"),assert=require("node:assert/strict");
const html=fs.readFileSync("treinamento-postagens-real.html","utf8"),js=fs.readFileSync("treinamento-postagens-real.js","utf8"),admin=fs.readFileSync("admin.html","utf8"),painel=fs.readFileSync("admin-postagens.js","utf8");
assert.match(html,/connect-src 'none'/);assert.match(html,/form-action 'none'/);
for(const file of ["postagens-controles.js","treinamento-postagens-nucleo.js","treinamento-postagens-real.js"])assert.ok(html.includes('src="'+file+'"'));
assert.ok(admin.includes('src="postagens-controles.js"'));
assert.ok(painel.includes("TKPostagensControles.destinos(ds)"));
assert.ok(js.includes("ui.destinos([])")&&js.includes("ui.formatos(")&&js.includes("ui.modos(")&&js.includes("ui.produto(p)"));
assert.doesNotMatch(js,/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
assert.ok(js.includes("localStorage.setItem")&&js.includes("JSON.stringify(ultimo"));
console.log("Controles compartilhados, isolamento e relatorio local: OK");

const ui=require("../postagens-controles.js");
assert.match(ui.formatos("story",true),/Story/);
assert.doesNotMatch(ui.formatos("story",true),/Feed|Carrossel|Reels/);
assert.match(ui.formatos("feed",false),/Carrossel/);
assert.match(ui.destinos(["instagram"]),/data-destino="instagram"/);
assert.match(ui.modos("peca"),/data-modo="peca"/);
console.log("Controles compartilhados: modos, destinos e formatos OK");

assert.match(ui.midias([{tipo:"imagem",url:"",sel:false}]),/data-m="0"/);
assert.match(ui.quando(""),/data-quando="sequencia"/);
assert.match(fs.readFileSync("treinamento-postagens-real.js","utf8"),/ui\.midias\(/);
assert.match(fs.readFileSync("treinamento-postagens-real.js","utf8"),/ui\.quando\(/);
console.log("Controles de mídia e agendamento no treinamento: OK");
