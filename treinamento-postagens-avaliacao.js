(function(root){"use strict";
function criarAvaliacao(){
 let tentativas=0,correcoes=0;const historico=[];
 function registrar(tipo,descricao){if(!["erro","correcao"].includes(tipo))throw Error("Evento inválido");if(tipo==="erro")tentativas++;else correcoes++;historico.push({tipo,descricao:String(descricao||"").slice(0,120)});}
 function resultado(fila){const itens=Array.isArray(fila)?fila:[];const concluidos=itens.filter(x=>x.estado==="concluido").length,descartados=itens.filter(x=>x.estado==="cancelado").length,pendentes=itens.filter(x=>!["concluido","cancelado"].includes(x.estado)).length;return{concluidos,descartados,pendentes,erros:tentativas,correcoes,aprovado:pendentes===0&&concluidos>0&&descartados===0&&tentativas<=2,orientacao:pendentes?"Finalize os itens pendentes.":descartados?"Refaça o exercício e conclua todos os destinos.":tentativas>2?"Pratique novamente com atenção às orientações.":concluidos?"Parabéns! Você concluiu a prática com segurança.":"Simule pelo menos uma conclusão bem-sucedida.",historico:historico.map(x=>({...x}))};}
 return Object.freeze({registrar,resultado});
}
const api=Object.freeze({criarAvaliacao});if(typeof module!=="undefined"&&module.exports)module.exports=api;if(root)root.TKPostagensAvaliacao=api;
})(typeof window!=="undefined"?window:null);