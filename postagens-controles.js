(function(root){"use strict";
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function destinos(selecionados){const ds=Array.isArray(selecionados)?selecionados:[];return '<div class="po-canal" id="po-canal" role="group" aria-label="Destinos da postagem">'+[["instagram","Instagram"],["whatsapp","WhatsApp Status"],["grupo","Grupo clientes"]].map(([id,nome])=>'<button type="button" data-destino="'+id+'" aria-pressed="'+ds.includes(id)+'">'+nome+'</button>').join("")+'<button type="button" data-destino="todos" aria-pressed="'+(ds.length===3)+'">Os 3</button></div>';}
function formatos(selecionado,apenasStory){return '<div class="po-chips" role="group" aria-label="Tipo de postagem">'+(apenasStory?[["story","Story"]]:[["story","Story"],["feed","Feed"],["carrossel","Carrossel"],["reels","Reels"]]).map(([id,nome])=>'<button type="button" data-tipo="'+id+'" aria-pressed="'+(selecionado===id)+'">'+nome+'</button>').join("")+'</div>';}
function modos(selecionado){return '<div class="po-chips" role="group" aria-label="Tipo de conteúdo">'+[["peca","🛍️ Com peça"],["livre","✍️ Livre"],["cliente","🧡 Ela usa TM"]].map(([id,nome])=>'<button type="button" data-modo="'+id+'" aria-pressed="'+(selecionado===id)+'">'+nome+'</button>').join("")+'</div>';}
function produto(p){return '<button type="button" class="po-card" data-psel="'+esc(p.ID)+'" aria-pressed="false"><b>'+esc(p.Nome)+'</b><small>'+esc(p.Codigo)+' · R$ '+Number(p.Preco).toFixed(2).replace(".",",")+'</small></button>';}
function midias(lista){return '<div class="po-midias asp-9" role="group" aria-label="Mídias da peça">'+(lista||[]).map((m,i)=>'<button type="button" class="po-m" data-m="'+i+'" aria-pressed="'+!!m.sel+'" aria-label="'+(m.tipo==="video"?"Vídeo":"Foto "+(i+1))+(m.sel?", escolhida":", não escolhida")+'">'+(m.url?'<img src="'+esc(m.url)+'" alt="" loading="lazy">':'<span>🖼️ Foto fictícia</span>')+'</button>').join("")+'</div>';}
function quando(opcao){return '<div class="po-chips" role="group" aria-label="Quando publicar">'+[["sequencia","Na sequência"],["agora","Agora mesmo"],["data","Dia e hora"]].map(([id,label])=>'<button type="button" data-quando="'+id+'" aria-pressed="'+(opcao===id)+'">'+label+'</button>').join("")+'</div>';}
function buscaPecas(busca){return '<label for="po-busca" class="po-ajuda">Procure pelo nome ou código</label><input type="search" id="po-busca" value="'+esc(busca||"")+'" autocomplete="off" placeholder="Nome ou código da peça">';}
function gradePecas(lista,selecionados,opcoes){
 const itens=Array.isArray(lista)?lista:[],sel=Array.isArray(selecionados)?selecionados:[],cfg=opcoes||{};
 const foto=typeof cfg.foto==="function"?cfg.foto:p=>p.Foto_URL||"";
 const preco=typeof cfg.preco==="function"?cfg.preco:p=>Number(p.Preco)>0?"R$ "+Number(p.Preco).toFixed(2).replace(".",","):"Consulte valor";
 return '<div class="po-grade" role="group" aria-label="Peças">'+(itens.length?itens.map(p=>{
  const on=sel.includes(String(p.ID));
  return '<button type="button" class="po-card" data-psel="'+esc(p.ID)+'" aria-pressed="'+on+'"><span class="po-ck" aria-hidden="true">'+(on?"✓":"")+'</span><img src="'+esc(foto(p))+'" alt="" loading="lazy"><b>'+esc(p.Nome)+'</b><small>'+esc(p.Codigo||"")+' · '+esc(preco(p))+'</small></button>';
 }).join(""):'<p class="po-ajuda" style="padding:10px;grid-column:1/-1">Nenhuma peça com esses filtros.</p>')+'</div>';
}
function acoesPecas(selecionados,quantidadeVisivel,todas){
 const sel=Array.isArray(selecionados)?selecionados:[],q=Number(quantidadeVisivel)||0;
 return '<div class="po-barra-sel"><button type="button" class="po-oc" data-a="pecas-todas">'+(todas?"☐ Desmarcar as "+q:"☑ Marcar as "+q+" da lista")+'</button><button type="button" class="po-enviar" data-a="usarpecas"'+(sel.length?"":" disabled")+">"+(sel.length>1?"➡ Usar as "+sel.length+" peças (uma por vez)":sel.length?"➡ Usar esta peça":"Marque pelo menos uma peça")+"</button>"+(sel.length>1?'<button type="button" class="po-enviar" data-a="usarjuntas"'+(sel.length>8?" disabled":"")+">🧩 Usar as "+sel.length+" peças juntas"+(sel.length>8?" (máx. 8)":"")+"</button>":"")+"</div>";
}
function legenda(valor){return '<label for="po-legenda">Legenda da postagem</label><textarea id="po-legenda" placeholder="Descreva a peça">'+esc(valor||"")+'</textarea>';}
const api=Object.freeze({destinos,formatos,modos,produto,midias,quando,buscaPecas,gradePecas,acoesPecas,legenda});
if(typeof module!=="undefined"&&module.exports)module.exports=api;
if(root)root.TKPostagensControles=api;
})(typeof window!=="undefined"?window:null);
