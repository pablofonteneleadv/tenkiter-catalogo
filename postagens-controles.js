(function(root){"use strict";
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function destinos(selecionados){const ds=Array.isArray(selecionados)?selecionados:[];return '<div class="po-canal" id="po-canal" role="group" aria-label="Destinos da postagem">'+[["instagram","Instagram"],["whatsapp","WhatsApp Status"],["grupo","Grupo clientes"]].map(([id,nome])=>'<button type="button" data-destino="'+id+'" aria-pressed="'+ds.includes(id)+'">'+nome+'</button>').join("")+'<button type="button" data-destino="todos" aria-pressed="'+(ds.length===3)+'">Os 3</button></div>';}
function formatos(selecionado){return '<div class="po-chips" role="group" aria-label="Tipo de postagem">'+[["story","Story"],["feed","Feed"],["carrossel","Carrossel"],["reels","Reels"]].map(([id,nome])=>'<button type="button" data-tipo="'+id+'" aria-pressed="'+(selecionado===id)+'">'+nome+'</button>').join("")+'</div>';}
function modos(selecionado){return '<div class="po-chips" role="group" aria-label="Tipo de conteúdo">'+[["peca","🛍️ Com peça"],["livre","✍️ Livre"],["cliente","🧡 Ela usa TM"]].map(([id,nome])=>'<button type="button" data-modo="'+id+'" aria-pressed="'+(selecionado===id)+'">'+nome+'</button>').join("")+'</div>';}
function produto(p){return '<button type="button" class="po-card" data-psel="'+esc(p.ID)+'" aria-pressed="false"><b>'+esc(p.Nome)+'</b><small>'+esc(p.Codigo)+' · R$ '+Number(p.Preco).toFixed(2).replace(".",",")+'</small></button>';}
const api=Object.freeze({destinos,formatos,modos,produto});
if(typeof module!=="undefined"&&module.exports)module.exports=api;
if(root)root.TKPostagensControles=api;
})(typeof window!=="undefined"?window:null);
