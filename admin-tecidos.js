/* Cadastro de tecidos: sugestões reais e nomes compartilhados, edição só pelo Admin total. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),api=window.TKTecido;let ultimo='';
 if(!api||!$('tecido'))return;
 const admin=()=>{try{return typeof usuarioAdmin!=='undefined'&&usuarioAdmin&&temPermissao(usuarioAdmin,'gerir_acessos');}catch(_){return false;}};
 const produtos=()=>typeof tkProdutosLista==='function'?tkProdutosLista():[];
 function desenhar(){
  const nomes=api.opcoes(produtos()),valor=$('tecido').value,dl=$('tecidos-opcoes'),chips=$('tecidos-rapidos');
  const assinatura=JSON.stringify(nomes);if(ultimo===assinatura){chips.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(api.resolver(valor)===b.textContent)));$('tecidos-gerenciar').hidden=!admin();return;}ultimo=assinatura;dl.replaceChildren();chips.replaceChildren();
  nomes.forEach(nome=>{const o=document.createElement('option');o.value=nome;dl.appendChild(o);const b=document.createElement('button');b.type='button';b.className='chip';b.textContent=nome;b.setAttribute('aria-pressed',String(api.resolver(valor)===nome));b.addEventListener('click',()=>{$('tecido').value=nome;$('tecido').dispatchEvent(new Event('input',{bubbles:true}));});chips.appendChild(b);});
  $('tecidos-gerenciar').hidden=!admin();
 }
 let overlay,anterior;
 function fechar(){if(typeof fecharComHistorico_==='function')fecharComHistorico_('overlay-tecidos');else overlay.classList.remove('aberto');if(anterior?.isConnected)anterior.focus();}
 function montar(){
  if(overlay)return;
  overlay=document.createElement('div');overlay.id='overlay-tecidos';overlay.className='overlay-sheet';
  const sheet=document.createElement('div');sheet.className='sheet sheet-tecidos';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-labelledby','tecidos-titulo');
  sheet.innerHTML='<div class="sheet-topo"><h2 id="tecidos-titulo">Nomes de tecidos</h2><button type="button" class="sheet-x" aria-label="Fechar nomes de tecidos">✕</button></div><div class="sheet-corpo tk-tecido-gestao"><p>Corrija o nome para atualizar sua apresentação nos produtos e filtros.</p><label for="tecidos-antigo">Tecido</label><select id="tecidos-antigo"></select><label for="tecidos-novo">Nome</label><input id="tecidos-novo" type="text" maxlength="80" autocomplete="off"><p id="tecidos-status" role="status"></p><button type="button" class="btn-primario" id="tecidos-salvar">Salvar nome</button></div>';
  const rodape=document.createElement('div');rodape.className='tk-tecido-rodape';rodape.appendChild(sheet.querySelector('#tecidos-salvar'));sheet.appendChild(rodape);
  overlay.appendChild(sheet);document.body.appendChild(overlay);sheet.querySelector('.sheet-x').addEventListener('click',fechar);
  overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();fechar();}if(e.key==='Tab'){const alvos=[...sheet.querySelectorAll('button,input,select')].filter(x=>!x.disabled&&x.getClientRects().length),primeiro=alvos[0],ultimo=alvos.at(-1);if(e.shiftKey&&document.activeElement===primeiro){e.preventDefault();ultimo.focus();}else if(!e.shiftKey&&document.activeElement===ultimo){e.preventDefault();primeiro.focus();}}});
  $('tecidos-antigo').addEventListener('change',()=>{$('tecidos-novo').value=$('tecidos-antigo').value;$('tecidos-novo').focus();});
  $('tecidos-salvar').addEventListener('click',async()=>{
   if(!admin())return;const b=$('tecidos-salvar'),i=$('tecidos-novo'),sel=$('tecidos-antigo');b.disabled=true;i.disabled=true;sel.disabled=true;$('tecidos-status').textContent='Salvando…';
   try{const nome=i.value.trim();if(!nome)throw new Error('Escreva o nome do tecido.');await api.salvar(sel.value,nome);const f=$('tecido');if(f.value)f.value=api.resolver(f.value);popular(nome);$('tecidos-status').textContent='Nome salvo. Produtos e filtros usam o nome atualizado.';}
   catch(e){$('tecidos-status').textContent=e.message||'Não foi possível salvar. Tente novamente.';}
   finally{b.disabled=false;i.disabled=false;sel.disabled=false;b.focus();}
  });
 }
 function popular(valor){const sel=$('tecidos-antigo');sel.replaceChildren();const novo=document.createElement('option');novo.value='';novo.textContent='Adicionar novo tecido';sel.appendChild(novo);api.opcoes(produtos()).forEach(nome=>{const o=document.createElement('option');o.value=nome;o.textContent=nome;sel.appendChild(o);});sel.value=valor||'';$('tecidos-novo').value=valor||'';}
 $('tecidos-gerenciar').addEventListener('click',async()=>{if(!admin())return;anterior=document.activeElement;montar();popular(api.resolver($('tecido').value));$('tecidos-status').textContent='';if(typeof abrirComHistorico_==='function')abrirComHistorico_('overlay-tecidos');else overlay.classList.add('aberto');$('tecidos-antigo').focus();try{await api.carregar();if(overlay.classList.contains('aberto'))popular($('tecidos-antigo').value);}catch(_){$('tecidos-status').textContent='Não foi possível atualizar a lista agora. Tente novamente ao salvar.';}});
 $('tecido').addEventListener('input',desenhar);
 window.addEventListener('tk:tecidos-atualizados',()=>{desenhar();if(typeof renderizarProdutos==='function')renderizarProdutos();});
 // A lista do catálogo chega depois do login e também é atualizada por cópia/edição.
 new MutationObserver(()=>desenhar()).observe($('lista-produtos'),{childList:true});
 document.addEventListener('tk:usuario-atualizado',desenhar);document.addEventListener('tk:tecido-form',desenhar);$('form-produto').addEventListener('focusin',desenhar);
 desenhar();
})();
