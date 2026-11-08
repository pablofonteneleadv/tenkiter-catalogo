/* Registros de clientes em segundo plano: guarda fotos e descrição no aparelho antes de liberar a tela.
 * Retoma ao reabrir o Mensageiro, na conta de origem. Nunca guarda credenciais.
 * O servidor recebe sempre os mesmos identificadores (opId) do pedido e de cada foto, então repetir é seguro. */
(function(){
  'use strict';
  window.TKRegistrosCliente=function(cfg){
    const NOME='tk_mensagens_registros_v1',aba=crypto.randomUUID();
    let dbp,rodando=false,solicitado=false,itens=[];
    const dono=()=>String(cfg.dono()||'');
    function db(){return dbp||(dbp=new Promise((ok,no)=>{const r=indexedDB.open(NOME,1);r.onupgradeneeded=()=>{r.result.createObjectStore('itens',{keyPath:'id'});r.result.createObjectStore('controle',{keyPath:'id'})};r.onsuccess=()=>ok(r.result);r.onerror=r.onblocked=()=>{dbp=null;no(Error('Não consegui guardar os arquivos neste aparelho. Libere espaço e tente de novo.'))}}))}
    async function gravar(j){const b=await db();return new Promise((ok,no)=>{const t=b.transaction('itens','readwrite');t.objectStore('itens').put(structuredClone(j));t.oncomplete=ok;t.onerror=t.onabort=()=>no(Error('Não consegui guardar o envio neste aparelho. Seus arquivos continuam no formulário.'))})}
    async function ler(){const b=await db();return new Promise((ok,no)=>{const t=b.transaction('itens'),r=t.objectStore('itens').getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>no(Error('Não consegui recuperar os envios guardados.'))})}
    async function atualizar(){const conta=dono();itens=(await ler()).filter(j=>j.dono===conta).sort((a,b)=>a.criado-b.criado);cfg.mudou?.(itens);return itens}
    async function reserva(conta,soltar=false){const b=await db();return new Promise((ok,no)=>{const t=b.transaction('controle','readwrite'),s=t.objectStore('controle'),r=s.get(conta);let livre=false;r.onsuccess=()=>{const x=r.result;if(soltar){if(x?.aba===aba)s.delete(conta);livre=true}else if(!x||x.aba===aba||x.ate<Date.now()){s.put({id:conta,aba,ate:Date.now()+120000});livre=true}};t.oncomplete=()=>ok(livre);t.onerror=t.onabort=()=>no(Error('Não consegui reservar o envio neste aparelho.'))})}
    async function executar(comTrava=false){const conta=dono();if(!conta||!comTrava&&!await reserva(conta))return;const timer=comTrava?null:setInterval(()=>{void reserva(conta).catch(()=>{})},20000);
      try{await atualizar();for(const j of itens.filter(j=>['fila','processando'].includes(j.estado))){
        const conferir=()=>{if(dono()!==j.dono)throw Error('Entre na conta de origem para continuar este envio.')};
        try{conferir();j.estado='processando';j.erro='';await gravar(j);await atualizar();
          await cfg.executar(j,async()=>{conferir();await gravar(j);await atualizar()},conferir);
          conferir();j.estado='ok';j.etapa='Concluído';j.fotos.forEach(f=>{delete f.file;delete f.blob});await gravar(j);cfg.concluiu?.(j);
        }catch(e){j.estado='erro';j.erro=String(e?.message||'Não consegui concluir o envio. Tente de novo.');await gravar(j)}
        await atualizar();if(dono()!==conta)break;
      }}finally{clearInterval(timer);if(!comTrava)await reserva(conta,true)}
    }
    async function processar(){if(rodando){solicitado=true;return}rodando=true;solicitado=false;try{if(navigator.locks)await navigator.locks.request(NOME+':'+dono(),{ifAvailable:true},l=>l?executar(true):undefined);else await executar()}catch(e){cfg.erro?.(e.message)}finally{rodando=false;await atualizar().catch(()=>{});if(solicitado){solicitado=false;void processar()}}}
    async function adicionar(dados){const conta=dono();if(!conta)throw Error('Entre na sua conta para guardar o envio.');await atualizar();const existente=itens.find(j=>j.chave===dados.chave&&j.estado!=='ok');if(existente)return existente.id;
      const j=structuredClone({...dados,dono:conta,criado:Date.now(),estado:'fila',etapa:'Guardado neste aparelho',erro:''});await gravar(j);await atualizar();void processar();return j.id;
    }
    async function tentar(id){await atualizar();const j=itens.find(j=>j.id===id&&j.estado==='erro');if(!j)return;j.estado='fila';await gravar(j);await atualizar();void processar()}
    async function remover(id){await atualizar();const j=itens.find(j=>j.id===id&&j.estado==='ok');if(!j)return;const b=await db();await new Promise((ok,no)=>{const t=b.transaction('itens','readwrite');t.objectStore('itens').delete(id);t.oncomplete=ok;t.onerror=t.onabort=no});await atualizar()}
    window.addEventListener('tk:sessao',()=>{itens=[];cfg.mudou?.(itens);void atualizar().then(processar).catch(e=>cfg.erro?.(e.message))});
    window.addEventListener('tk:mensagens-sair',()=>{itens=[];cfg.mudou?.(itens)});
    setInterval(()=>{if(dono()&&!document.hidden)void processar()},15000);
    // Uma aba fechada não mantém JavaScript executando. Os arquivos guardados retomam ao abrir.
    void atualizar().then(processar).catch(e=>cfg.erro?.(e.message));
    return{adicionar,tentar,remover,atualizar,listar:()=>itens.filter(j=>j.dono===dono()),processar};
  };
})();
