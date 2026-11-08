/* Integração Fotos IA. Sessão comum; rascunho IndexedDB por conta, sem token/senha. */
(function(root){
  'use strict';
  const cacheFotos=new Map();
  function erroLegivel(j,padrao){const t=String(j?.erro||'').trim();return t&&!/^[\s]*[\[{<]/.test(t)?t:padrao||'Não foi possível concluir agora. Tente de novo.';}
  async function pedir(rota,corpo){
    const s=getSessao();if(!s)return{ok:false,exigeLogin:true,erro:'Entre na sua conta para continuar.'};
    const ctrl=new AbortController(), t=setTimeout(()=>ctrl.abort(),45000);
    try{
      const r=await fetch(INSTAGRAM_URL+rota,{method:corpo?'POST':'GET',headers:{'Content-Type':'application/json','X-TK-Whats':s.whatsapp,'X-TK-Sessao':s.sessao},body:corpo?JSON.stringify(corpo):undefined,signal:ctrl.signal});
      const j=await r.json().catch(()=>({ok:false,erro:'O servidor não confirmou a operação. Tente de novo.'}));
      if(r.status===401)j.exigeLogin=true;
      if(!r.ok)j.ok=false;
      j.http=r.status;return j;
    }catch(e){return{ok:false,semRede:true,incerto:!!corpo,erro:e.name==='AbortError'?'A confirmação demorou mais que o esperado. Confira o envio antes de tentar de novo.':'A conexão falhou. Seu trabalho foi mantido neste aparelho.'};}
    finally{clearTimeout(t)}
  }
  async function catalogo(){try{const r=await fetch(API_URL+'?action=list&todos=true',{cache:'no-store'});const j=await r.json();if(!r.ok||!Array.isArray(j?.produtos))throw Error();return j.produtos}catch(e){throw Error('Não consegui carregar os produtos do catálogo. Confira sua conexão e tente de novo.')}}
  function atualizar(dados,esperado){const s=getSessao();if(esperado&&String(s?.whatsapp||'')!==esperado)return Promise.resolve({ok:false,erro:'A conta mudou. Entre novamente na conta de origem para concluir.'});if(!s)return Promise.resolve({ok:false,erro:'Entre na sua conta.'});return apiPost({...dados,pin:s.sessao,sessao:s.sessao,whatsapp:s.whatsapp});}
  function fontesProduto(p){return [...new Set([p.Foto_URL].concat(String(p.Fotos_Galeria||'').split(',')).map(s=>String(s||'').trim()).filter(u=>/^https:\/\//i.test(u)&&!(/\.(mp4|mov|webm)(?:\?|$)/i.test(u))))];}
  async function adicionarFotoProduto(p,url,capa,conta){
    const todas=[...new Set(fontesProduto(p).concat(url))],novaCapa=capa||!p.Foto_URL?url:p.Foto_URL;
    if(todas.filter(u=>u!==novaCapa).length>8)throw Error('A galeria de '+p.Nome+' está completa. Organize as fotos no cadastro antes de acrescentar outra.');
    const r=await atualizar({action:'update',id:p.ID,fotoUrlExistente:novaCapa,fotosGaleriaExistentes:todas.filter(u=>u!==novaCapa).join(',')},conta);if(!r?.ok)throw Error(erroLegivel(r));
  }
  const origens=(job,produtos)=>[...new Map((job.plano?.pecas||[]).map(o=>{const p=produtos.find(p=>o.produto?String(p.ID)===String(o.produto):p.Codigo===o.codigo);return [p?.ID,p]}).filter(([id])=>id)).values()];
  async function incorporar(job,escolhas,progresso){
    const conta=dono(),salvos=[];const copia=await pedir('/fotoia/incorporar',{id:job.id});if(!copia.ok)throw Error(erroLegivel(copia));
    const ps=await catalogo();
    for(const e of escolhas){const p=ps.find(p=>String(p.ID)===e.id);if(!p)throw Error('O produto selecionado não foi encontrado. Atualize o catálogo.');progresso?.('Salvando em '+p.Nome+'…');try{await adicionarFotoProduto(p,copia.url,e.capa,conta);salvos.push(p.Nome)}catch(err){throw Error((salvos.length?'Já salvo em '+salvos.join(', ')+'. ':'')+err.message)}}
    return {url:copia.url,total:salvos.length};
  }
  async function misto(job,nome){
    const conta=dono();
    const copia=await pedir('/fotoia/incorporar',{id:job.id});if(!copia.ok)throw Error(erroLegivel(copia));
    const ps=await catalogo(),fontes=origens(job,ps);if(fontes.length<2)throw Error('O misto precisa de pelo menos dois produtos de origem cadastrados.');
    const anterior=await pedir('/fotoia/composicao?id='+job.id);if(!anterior.ok)throw Error(erroLegivel(anterior));
    const chave='tk_fotoia_misto_'+job.id;let id=anterior.produto||'';try{if(!id)id=localStorage.getItem(chave)||''}catch(e){}
    if(!id){const uniao=k=>[...new Set(fontes.flatMap(p=>String(p[k]||'').split(',').map(t=>t.trim()).filter(Boolean)))].join(', ');const r=await atualizar({action:'create',opId:'fotoia-misto-'+job.id,nome,categoria:uniao('Categoria'),genero:uniao('Genero'),preco:'0',consultarValor:true,estoque:'',tamanhos:'',cores:'',descricao:'Composição com produtos vendidas separadamente. Consulte a disponibilidade de cada produto.',novidade:false,notificarPush:false,fotoUrlExistente:copia.url,fotosGaleriaExistentes:''},conta);if(!r?.ok||!r.id)throw Error(erroLegivel(r,'Não consegui confirmar o cadastro. Tente de novo com o mesmo pedido.'));id=String(r.id);try{localStorage.setItem(chave,id)}catch(e){}}
    const existente=ps.find(p=>String(p.ID)===id);if(existente&&existente.Foto_URL!==copia.url)await adicionarFotoProduto(existente,copia.url,true,conta);
    if(dono()!==conta)throw Error('A conta mudou. Retome a associação na conta de origem.');
    const r=await pedir('/fotoia/composicao',{id:job.id,produto:id});if(!r.ok)throw Error('O cadastro foi confirmado, mas faltou vincular os produtos. Tente de novo para concluir sem duplicar. '+erroLegivel(r));return id;
  }
  async function imagem(blob,max){
    const url=URL.createObjectURL(blob);try{const im=await new Promise((ok,no)=>{const x=new Image();x.onload=()=>ok(x);x.onerror=()=>no(Error('Não consegui ler esta imagem. Use uma foto JPG, PNG ou WEBP.'));x.src=url});
      const escala=Math.min(1,max/Math.max(im.naturalWidth,im.naturalHeight)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.naturalWidth*escala));c.height=Math.max(1,Math.round(im.naturalHeight*escala));const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(im,0,0,c.width,c.height);
      let out=c.toDataURL('image/jpeg',.88);for(const q of [.8,.7,.6]){if(out.length*3/4<=1500*1024)break;out=c.toDataURL('image/jpeg',q)}if(out.length*3/4>1600*1024)throw Error('A foto ainda ficou grande. Escolha outra referência.');return out;
    }finally{URL.revokeObjectURL(url)}
  }
  async function preparar(ref){
    const key=ref.id||ref.url;
    if(!cacheFotos.has(key))cacheFotos.set(key,(async()=>{let blob=ref.arquivo;if(!blob){const ctrl=new AbortController(),t=setTimeout(()=>ctrl.abort(),25000);try{const r=await fetch(ref.url,{signal:ctrl.signal});if(!r.ok)throw Error();blob=await r.blob()}catch(e){throw Error('Não consegui baixar a referência de '+ref.nome+'. Troque a foto ou use uma foto do aparelho.')}finally{clearTimeout(t)}}
      return {grande:await imagem(blob,1280),pequena:await imagem(blob,500)};
    })().catch(e=>{cacheFotos.delete(key);throw e}));return cacheFotos.get(key);
  }
  async function corpo(foto){const p=TKFotoIAPlano.pacote(foto),refs=TKFotoIAPlano.referencias(foto).refs;p.fotos=[];p.refs=[];
    for(const r of refs){const f=await preparar(r);p.fotos.push({mime:'image/jpeg',data:f.grande.split(',')[1]});if(refs.length<=4)p.refs.push({mime:'image/jpeg',data:f.pequena.split(',')[1]})}return p;
  }
  async function arquivo(file){if(!/^image\/(jpeg|png|webp)$/i.test(file.type))throw Error('Escolha uma foto JPG, PNG ou WEBP.');if(file.size>30*1024*1024)throw Error('A foto passa de 30 MB. Reduza o arquivo ou escolha outra foto.');const data=await imagem(file,1280);const blob=await fetch(data).then(r=>r.blob());return {id:crypto.randomUUID(),nome:file.name,arquivo:blob,produto:'',codigo:'',tipo:''};}
  let dbPromise;
  function db(){if(!dbPromise)dbPromise=new Promise((ok,no)=>{const r=indexedDB.open('tk_fotoia_planejamento_v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('rascunhos',{keyPath:'dono'});r.onsuccess=()=>ok(r.result);r.onerror=()=>{dbPromise=null;no(Error('Não foi possível abrir o rascunho neste aparelho.'))}});return dbPromise;}
  const dono=()=>String(getSessao()?.whatsapp||'');
  async function guardar(estado,esperado){const quem=dono();if(esperado&&esperado!==quem)throw Error('A conta mudou. O planejamento anterior foi mantido para a conta de origem.');if(!quem)throw Error('Entre na conta para salvar o rascunho.');const d=await db();await new Promise((ok,no)=>{const t=d.transaction('rascunhos','readwrite');t.objectStore('rascunhos').put({dono:quem,estado,em:Date.now()});t.oncomplete=ok;t.onerror=()=>no(Error('Não consegui salvar o rascunho no aparelho. Mantenha a página aberta e tente de novo.'));t.onabort=t.onerror;});}
  async function recuperar(){const quem=dono();if(!quem)return null;const d=await db();return new Promise((ok,no)=>{const r=d.transaction('rascunhos').objectStore('rascunhos').get(quem);r.onsuccess=()=>ok(r.result?.estado||null);r.onerror=()=>no(Error('Não consegui recuperar o rascunho salvo.'))})}
  async function baixar(url,nome){const r=await fetch(url);if(!r.ok)throw Error('Não consegui baixar a foto. Tente de novo.');const u=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=u;a.download=nome;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000)}
  root.TKFotoIAServico={pedir,erroLegivel,catalogo,atualizar,fontesProduto,adicionarFotoProduto,origens,incorporar,misto,imagem,preparar,corpo,arquivo,guardar,recuperar,baixar};
})(window);
