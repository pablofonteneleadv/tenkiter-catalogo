const assert=require("node:assert/strict");
const {criarServicoSimulado,PASSOS}=require("../treinamento-postagens-nucleo.js");
(async()=>{
 const s=criarServicoSimulado();assert.equal(PASSOS.length,9);
 const wrong=s.treino.agir({tipo:"conclusao",valor:true});assert.equal(wrong.ok,false);assert.equal(wrong.estado.etapa,0);
 assert.equal(s.treino.voltar().ok,false);
 const a=[["modo","peca"],["destino","instagram"],["produto","TREINO-001"],["formato","story"],["midia","TREINO-MIDIA"],["legenda","Confira nossa peça de demonstração"],["quando","sequencia"],["revisao",true],["conclusao",true]];
 for(const [tipo,valor]of a)assert.equal(s.treino.agir({tipo,valor}).ok,true);
 assert.equal(s.treino.estado().concluido,true);
 assert.equal(s.treino.voltar().ok,false);
 s.treino.reiniciar();
 assert.equal(s.treino.agir({tipo:"modo",valor:"peca"}).ok,true);
 assert.equal(s.treino.voltar().estado.etapa,0);
 for(const [tipo,valor] of a)assert.equal(s.treino.agir({tipo,valor}).ok,true);
 for(const name of ["publicar","agendar","enfileirar","excluir","atualizarProduto","upload","requisitar"])assert.equal((await s[name]()).ok,false,name);
 assert.equal((await s.produtos()).produtos.length,1);
 assert.equal(s.treino.reiniciar().etapa,0);
 console.log("9 etapas e 7 bloqueios remotos: OK");
})().catch(e=>{console.error(e);process.exitCode=1});
