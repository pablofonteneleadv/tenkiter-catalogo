(function(root){"use strict";
function criarFila(){
 let sequencia=0;const itens=[];
 const copia=x=>({...x}),listar=()=>itens.map(copia);
 function adicionar(dados){if(!dados||!Array.isArray(dados.destinos)||!dados.destinos.length)throw Error("Destino obrigatório");const id="SIM-"+String(++sequencia).padStart(3,"0");const item={id,estado:"aguardando",tentativas:0,destinos:[...dados.destinos],pecas:[...(dados.pecas||[])],formato:String(dados.formato||"story"),legenda:String(dados.legenda||"")};itens.push(item);return copia(item);}
 function alterar(id,acao){const x=itens.find(v=>v.id===id);if(!x)return{ok:false,motivo:"Item não encontrado"};const e=x.estado;const permitido={iniciar:["aguardando","falhou"],sucesso:["enviando"],falhar:["enviando"],cancelar:["aguardando","falhou"],repetir:["falhou"]};if(!permitido[acao]?.includes(e))return{ok:false,motivo:"Ação indisponível para "+e};if(acao==="iniciar"){x.estado="enviando";x.tentativas++;}if(acao==="sucesso")x.estado="concluido";if(acao==="falhar")x.estado="falhou";if(acao==="cancelar")x.estado="cancelado";if(acao==="repetir")x.estado="aguardando";return{ok:true,item:copia(x)};}
 return Object.freeze({adicionar,alterar,listar});
}
const api=Object.freeze({criarFila});if(typeof module!=="undefined"&&module.exports)module.exports=api;if(root)root.TKPostagensFilaTreino=api;
})(typeof window!=="undefined"?window:null);