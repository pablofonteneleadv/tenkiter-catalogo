(function(){"use strict";
const ui=window.TKPostagensControles,$=id=>document.getElementById(id);
if(!ui){$("feedback").textContent="Controles não disponíveis.";return;}
const pecas=Object.freeze([
 Object.freeze({ID:"TREINO-001",Codigo:"TREINO-001",Nome:"Blusa fictícia",Preco:29.9,Foto_URL:""}),
 Object.freeze({ID:"TREINO-002",Codigo:"TREINO-002",Nome:"Vestido fictício",Preco:39.9,Foto_URL:""}),
 Object.freeze({ID:"TREINO-003",Codigo:"TREINO-003",Nome:"Saia fictícia",Preco:34.9,Foto_URL:""})
]);
const midias=Object.freeze([{tipo:"imagem",url:""},{tipo:"imagem",url:""},{tipo:"video",url:""}]);
let s;
function reset(){s={modo:"peca",destinos:[],ids:[],agrupamento:"",formato:"",midia:[],quando:"",legenda:"",data:""};$("revisao").hidden=true;$("fim").hidden=true;document.querySelector("section.card:not(#revisao):not(#fim)").hidden=false;render();}
function filtradas(){const q=($("po-busca")?.value||"").trim().toLocaleLowerCase("pt-BR");return pecas.filter(p=>(p.Nome+" "+p.Codigo).toLocaleLowerCase("pt-BR").includes(q));}
function renderPecas(){const lista=filtradas();$("grade").innerHTML=ui.gradePecas(lista,s.ids);$("acoes").innerHTML=ui.acoesPecas(s.ids,lista.length,lista.length>0&&lista.every(p=>s.ids.includes(p.ID)));$("selecao").textContent=s.ids.length+" peça(s) selecionada(s)"+(s.agrupamento?" · "+(s.agrupamento==="juntas"?"Juntas":"Uma por vez"):"");}
function render(){ $("modos").innerHTML=ui.modos(s.modo);$("destinos").innerHTML=ui.destinos(s.destinos);$("busca").innerHTML=ui.buscaPecas("");renderPecas();$("formatos").innerHTML=ui.formatos(s.formato,s.destinos.length>0&&s.destinos.every(x=>x!=="instagram"));$("midias").innerHTML=ui.midias(midias.map((m,i)=>({...m,sel:s.midia.includes(i)})));$("legenda").innerHTML=ui.legenda(s.legenda);$("quando").innerHTML=ui.quando(s.quando);$("horario").hidden=s.quando!=="data";if(s.data)$("data-hora").value=s.data;}
function erro(msg){$("feedback").textContent=msg;return false;}
$("busca").addEventListener("input",()=>renderPecas());
document.querySelector("section.card:not(#revisao):not(#fim)").addEventListener("click",e=>{
 const b=e.target.closest("button");if(!b)return;const d=b.dataset;
 if(d.modo){s.modo=d.modo;s.ids=[];s.agrupamento="";render();}
 else if(d.destino){const novos=d.destino==="todos"?["instagram","whatsapp","grupo"]:s.destinos.includes(d.destino)?s.destinos.filter(x=>x!==d.destino):[...s.destinos,d.destino];s.destinos=d.destino==="todos"&&s.destinos.length===3?[]:novos;if(s.destinos.length&&!s.destinos.includes("instagram")&&s.formato!=="story")s.formato="story";$("destinos").innerHTML=ui.destinos(s.destinos);$("formatos").innerHTML=ui.formatos(s.formato,s.destinos.length>0&&s.destinos.every(x=>x!=="instagram"));}
 else if(d.psel){s.ids=s.ids.includes(d.psel)?s.ids.filter(x=>x!==d.psel):[...s.ids,d.psel];s.agrupamento="";renderPecas();}
 else if(d.a==="pecas-todas"){const lista=filtradas().map(p=>p.ID),todas=lista.every(id=>s.ids.includes(id));s.ids=todas?s.ids.filter(id=>!lista.includes(id)):[...new Set([...s.ids,...lista])];s.agrupamento="";renderPecas();}
 else if(d.a==="usarpecas"&&s.ids.length){s.agrupamento="separadas";renderPecas();}
 else if(d.a==="usarjuntas"&&s.ids.length>1&&s.ids.length<=8){s.agrupamento="juntas";renderPecas();}
 else if(d.tipo){s.formato=d.tipo;$("formatos").innerHTML=ui.formatos(s.formato,s.destinos.length>0&&s.destinos.every(x=>x!=="instagram"));}
 else if(d.m!==undefined){const i=Number(d.m);s.midia=s.midia.includes(i)?s.midia.filter(x=>x!==i):[...s.midia,i];$("midias").innerHTML=ui.midias(midias.map((m,j)=>({...m,sel:s.midia.includes(j)})));}
 else if(d.quando){s.quando=d.quando;$("quando").innerHTML=ui.quando(s.quando);$("horario").hidden=s.quando!=="data";}
});
$("revisar").addEventListener("click",()=>{
 s.legenda=$("po-legenda").value.trim();s.data=$("data-hora").value;
 if(!s.destinos.length)return erro("Selecione pelo menos um destino.");
 if(s.modo==="peca"&&(!s.ids.length||!s.agrupamento))return erro("Selecione peças e confirme como serão usadas.");
 if(!s.formato)return erro("Escolha um formato.");
 if(!s.midia.length)return erro("Escolha pelo menos uma mídia fictícia.");
 if(s.legenda.length<10)return erro("Escreva uma legenda com pelo menos 10 caracteres.");
 if(!s.quando)return erro("Escolha quando publicar.");
 if(s.quando==="data"&&(!s.data||new Date(s.data).getTime()<=Date.now()))return erro("Escolha uma data e hora futuras.");
 $("feedback").textContent="";
 const r=$("resumo");r.replaceChildren();
 const linha=(rotulo,valor)=>{const p=document.createElement("p"),b=document.createElement("strong");b.textContent=rotulo+": ";p.append(b,document.createTextNode(valor));r.append(p);};
 linha("Modo",s.modo);linha("Destinos",s.destinos.join(", "));linha("Peças",s.ids.length?s.ids.map(id=>pecas.find(p=>p.ID===id).Nome).join(", "):"Sem peça");
 linha("Uso das peças",s.agrupamento||"Não aplicável");linha("Formato",s.formato);linha("Mídias fictícias",String(s.midia.length));linha("Legenda",s.legenda);linha("Programação",s.quando==="data"?s.data:s.quando);
 $("confirmado").checked=false;$("revisao").hidden=false;$("revisao").scrollIntoView({block:"start"});
});
$("voltar").addEventListener("click",()=>{$("revisao").hidden=true;});
$("concluir").addEventListener("click",()=>{if(!$("confirmado").checked)return erro("Confira e marque a confirmação antes de concluir.");$("revisao").hidden=true;$("fim").hidden=false;$("fim").scrollIntoView({block:"start"});});
$("refazer").addEventListener("click",reset);
reset();
})();