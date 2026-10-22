/* TENKiTER — núcleo isolado do treinamento de postagens.
 * Nunca compartilhe este adaptador com o cliente de produção.
 * A integração visual deve reutilizar os controles reais, mas injetar este serviço.
 */
(function(root){
 "use strict";
 const ITEM=Object.freeze({ID:"TREINO-001",Codigo:"TREINO-001",Nome:"Blusa de demonstração",Preco:29.9,Categoria:"Blusas",Genero:"Feminino",Foto_URL:"",Fotos_Galeria:"",Estoque:1});
 const PASSOS=Object.freeze([
  {id:"modo",label:"Selecionar Com peça",test:a=>a.tipo==="modo"&&a.valor==="peca"},
  {id:"destino",label:"Selecionar Instagram",test:a=>a.tipo==="destino"&&a.valor==="instagram"},
  {id:"produto",label:"Selecionar a peça fictícia",test:a=>a.tipo==="produto"&&a.valor===ITEM.ID},
  {id:"formato",label:"Selecionar Story",test:a=>a.tipo==="formato"&&a.valor==="story"},
  {id:"midia",label:"Selecionar a mídia fictícia",test:a=>a.tipo==="midia"&&a.valor==="TREINO-MIDIA"},
  {id:"legenda",label:"Escrever uma legenda",test:a=>a.tipo==="legenda"&&String(a.valor||"").trim().length>=10},
  {id:"quando",label:"Selecionar Na sequência",test:a=>a.tipo==="quando"&&a.valor==="sequencia"},
  {id:"revisao",label:"Revisar a postagem",test:a=>a.tipo==="revisao"&&a.valor===true},
  {id:"conclusao",label:"Concluir sem publicar",test:a=>a.tipo==="conclusao"&&a.valor===true}
 ]);
 function criarTreino(){
  let etapa=0,erros=0;const eventos=[];
  const copia=()=>({etapa,total:PASSOS.length,erros,concluido:etapa===PASSOS.length,proximo:PASSOS[etapa]?PASSOS[etapa].label:null,eventos:eventos.map(x=>({...x}))});
  return Object.freeze({
   estado:copia,
   agir(acao){if(etapa===PASSOS.length)return{ok:false,motivo:"Treinamento concluído",estado:copia()};const passo=PASSOS[etapa],ok=!!(acao&&passo.test(acao));eventos.push({passo:passo.id,tipo:String(acao&&acao.tipo||""),ok});if(ok)etapa++;else erros++;return{ok,motivo:ok?"Correto. Continue.":"Tente novamente: "+passo.label,estado:copia()};},
   reiniciar(){etapa=0;erros=0;eventos.length=0;return copia();}
  });
 }
 function criarServicoSimulado(){
  const treino=criarTreino();const registros=[];
  const negar=async()=>({ok:false,erro:"BLOQUEADO: operações remotas desativadas no treinamento."});
  return Object.freeze({
   treino,produto:()=>({...ITEM}),produtos:async()=>({ok:true,produtos:[{...ITEM}]}),
   midias:async()=>({ok:true,midias:[{id:"TREINO-MIDIA",tipo:"imagem",url:""}]}),
   registrarLocal:(evento)=>{registros.push({...evento});return{ok:true};},
   relatorio:()=>({estado:treino.estado(),registros:registros.map(x=>({...x}))}),
   publicar:negar,agendar:negar,enfileirar:negar,excluir:negar,
   atualizarProduto:negar,upload:negar,requisitar:negar
  });
 }
 const api=Object.freeze({criarTreino,criarServicoSimulado,PASSOS,ITEM});
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 if(root)root.TKPostagensTreino=api;
})(typeof window!=="undefined"?window:null);
