(function(){"use strict";
const $=id=>document.getElementById(id),api=window.TKPostagensTreino,ui=window.TKPostagensControles;
if(!api||!ui){$("feedback").textContent="Componentes indisponíveis. Avise a gestão.";return;}
let servico=api.criarServicoSimulado(),etapa=0,erros=0,legendaTreino="";
const foco=()=>{const el=$("instrucao");if(el){el.setAttribute("tabindex","-1");el.focus({preventScroll:true});}};
const rotulos=["Toque em Com peça","Escolha Instagram como único destino","Busque a peça fictícia, selecione e toque em Usar esta peça","Escolha Story","Selecione a mídia fictícia","Escreva uma legenda com pelo menos dez caracteres","Escolha Na sequência","Confira os dados e confirme a revisão","Conclua a simulação sem publicar"];
const botao=(atributo,valor,rotulo)=>'<button type="button" '+atributo+'="'+valor+'">'+rotulo+'</button>';
function salvar(){const registro={versao:2,data:new Date().toISOString(),colaborador:$("colaborador").value.trim().slice(0,60),etapasConcluidas:9,totalEtapas:9,publicacaoReal:false,...servico.relatorio()};try{const key="tk_postagens_treino_resultados_v2",old=JSON.parse(localStorage.getItem(key)||"[]");old.push(registro);localStorage.setItem(key,JSON.stringify(old.slice(-30)));}catch(e){$("feedback").textContent="Resultado não pôde ser salvo neste aparelho; baixe o relatório."; }return registro;}
let ultimo=null,rascunhoLegenda="";
function agir(tipo,valor){const r=servico.treino.agir({tipo,valor});erros=r.estado.erros;const feedback=$("feedback");feedback.textContent=r.motivo;feedback.style.color=r.ok?"#17603a":"#a42d1c";if(r.ok){if(tipo==="legenda")legendaTreino=String(valor).trim();etapa=r.estado.etapa;desenhar();}}
function desenhar(){
 const nomes=["Modo","Destinos","Peça","Formato","Mídia","Legenda","Programação","Revisão","Conclusão"];
 $("visao").innerHTML=nomes.map((nome,i)=>'<div class="'+(i<etapa?"feito":i===etapa?"atual":"")+'" aria-current="'+(i===etapa?"step":"false")+'"><strong>'+(i<etapa?"✓ ":i===etapa?"➜ ":"")+nome+'</strong><small>'+(i<etapa?"Concluído":i===etapa?"Pratique aqui":"Aguardando")+'</small></div>').join("");
 $("progresso").value=etapa;$("contador").textContent=etapa+" de 9 etapas concluídas · "+(9-etapa)+" restantes";
 if(etapa===9){$("area").hidden=true;$("final").hidden=false;ultimo=salvar();$("resumo").textContent="Acertos: 9/9 · Correções: "+erros+" · Nenhum envio realizado.";return;}
 $("instrucao").textContent=(etapa+1)+". "+rotulos[etapa];$("feedback").textContent="";
 let h="";const p=servico.produto();
 switch(etapa){
 case 0:h=ui.modos("peca");break;
 case 1:h=ui.destinos([]);break;
 case 2:h=ui.buscaPecas("")+'<div id="pecas"></div><div id="acoes-pecas"></div>';break;
 case 3:h=ui.formatos("");break;
 case 4:h='<p>Foto de treinamento — nenhuma mídia real</p>'+ui.midias([{tipo:"imagem",url:"",sel:false}]);break;
 case 5:h=ui.legenda(rascunhoLegenda)+botao("data-acao","legenda","Confirmar legenda");break;
 case 6:h=ui.quando("");break;
 case 7:h='<p><b>Peça:</b> '+p.Nome+' · '+p.Codigo+'</p><p><b>Destino:</b> Instagram · <b>Formato:</b> Story · <b>Programação:</b> Na sequência</p><p><b>Legenda:</b> <span id="legenda-revisao"></span></p><label><input type="checkbox" id="revisado" style="width:auto"> Revisei os dados</label>'+botao("data-acao","revisao","Confirmar revisão");break;
 case 8:h='<p>Este botão apenas conclui a prática. Não existe ligação com a fila.</p>'+botao("data-acao","conclusao","Concluir sem publicar");break;
 }
 $("controles").innerHTML=h;
 if(etapa===7)$("legenda-revisao").textContent=legendaTreino;
 if(etapa===5){const campo=$("po-legenda");if(campo){campo.value=rascunhoLegenda;campo.addEventListener("input",()=>{rascunhoLegenda=campo.value;});}}
 const esperado=[ '[data-modo="peca"]','[data-destino="instagram"]','[data-psel="TREINO-001"]','[data-tipo="story"]','[data-m="0"]','[data-acao="legenda"]','[data-quando="sequencia"]','[data-acao="revisao"]','[data-acao="conclusao"]'][etapa];
 function marcar(){const el=$("controles").querySelector(esperado);if(el)el.classList.add("alvo");}
 if(etapa===2){const busca=$("po-busca");busca.addEventListener("input",()=>{$("pecas").innerHTML=busca.value.trim().toUpperCase()===p.Codigo?ui.gradePecas([p],[]):'<small>Digite TREINO-001 para encontrar a peça fictícia.</small>';marcar();});}
 marcar();
 foco();
}
$("controles").addEventListener("click",ev=>{const b=ev.target.closest("button");if(!b)return;
 const d=b.dataset;
 if(d.modo!==undefined)agir("modo",d.modo);
 else if(d.destino!==undefined)agir("destino",d.destino);
 else if(d.psel!==undefined){const item=$("controles").querySelector('[data-psel="'+d.psel+'"]');if(item){item.setAttribute("aria-pressed","true");const marca=item.querySelector(".po-ck");if(marca)marca.textContent="✓";$("acoes-pecas").innerHTML=ui.acoesPecas([d.psel],1,true);}}
 else if(d.a==="usarpecas"&&$("acoes-pecas")&&$("acoes-pecas").querySelector('[data-a="usarpecas"]:not([disabled])'))agir("produto","TREINO-001");
 else if(d.tipo!==undefined)agir("formato",d.tipo);
 else if(d.m!==undefined)agir("midia",d.m==="0"?"TREINO-MIDIA":d.m);
 else if(d.quando!==undefined)agir("quando",d.quando);
 else if(d.acao==="legenda")agir("legenda",$("po-legenda").value);
 else if(d.acao==="revisao")agir("revisao",$("revisado").checked);
 else if(d.acao==="conclusao")agir("conclusao",true);
});
$("refazer").addEventListener("click",()=>{if(!window.confirm("Reiniciar a prática? O progresso atual será apagado, mas relatórios já baixados serão preservados."))return;servico=api.criarServicoSimulado();etapa=0;erros=0;legendaTreino="";rascunhoLegenda="";ultimo=null;$("area").hidden=false;$("final").hidden=true;desenhar();});
$("exportar").addEventListener("click",()=>{if(!ultimo)return;const blob=new Blob([JSON.stringify(ultimo,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="tenkiter-treino-postagens-"+new Date().toISOString().slice(0,10)+".json";a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);});
desenhar();
})();
