const fs=require("node:fs"),assert=require("node:assert/strict");
const html=fs.readFileSync("treinamento-postagens-real.html","utf8"),js=fs.readFileSync("treinamento-postagens-real.js","utf8"),admin=fs.readFileSync("admin.html","utf8"),painel=fs.readFileSync("admin-postagens.js","utf8");
assert.match(html,/connect-src 'none'/);assert.match(html,/form-action 'none'/);
for(const file of ["postagens-controles.js","treinamento-postagens-nucleo.js","treinamento-postagens-real.js"])assert.ok(html.includes('src="'+file+'"'));
assert.ok(admin.includes('src="postagens-controles.js"'));
assert.ok(painel.includes("TKPostagensControles.destinos(ds)"));
assert.ok(js.includes("ui.buscaPecas(")&&js.includes("ui.gradePecas(")&&js.includes("ui.legenda("));
assert.ok(painel.includes("TKPostagensControles.buscaPecas(n.busca)"));
assert.ok(js.includes("ui.destinos([])")&&js.includes("ui.formatos(")&&js.includes("ui.modos(")&&js.includes("ui.gradePecas([p],[])"));
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

assert.match(ui.gradePecas([{ID:"TREINO-001",Nome:"Blusa fictícia",Codigo:"TREINO-001",Preco:29.9,Foto_URL:""}],["TREINO-001"]),/aria-pressed="true"/);
assert.match(ui.gradePecas([],[]),/Nenhuma peça/);
assert.match(ui.acoesPecas(["TREINO-001"],1,true),/data-a="usarpecas"/);
assert.match(ui.acoesPecas([],0,false),/data-a="usarpecas" disabled/);
console.log("Grade e barra de seleção reutilizáveis: OK");
