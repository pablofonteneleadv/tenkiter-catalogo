/* Disponibilidade rápida: retirada de opções cadastradas e fila local por usuário.
 * A fila guarda apenas ações de catálogo, nunca credenciais. O servidor valida cada ação.
 */
(function () {
  'use strict';
  const PREFIXO = 'tk_disponibilidade_v1:';
  const lista = v => [...new Set((Array.isArray(v) ? v : String(v || '').split(',')).map(x => String(x).trim()).filter(Boolean))];
  const novo = (tag, cls, texto) => { const x = document.createElement(tag); if(cls)x.className=cls; if(texto)x.textContent=texto; return x; };
  function aplicar(p, ops) {
    for(const op of ops) {
      if(op.action === 'update') { if('tamanhos' in op)p.Tamanhos=op.tamanhos; if('cores' in op)p.Cores=op.cores; }
      if(op.action === 'arquivarRapido')p.Status='Inativo';
      if(op.action === 'arquivarMidia' && op.tipo === 'foto') {
        const fotos=lista([p.Foto_URL,...lista(p.Fotos_Galeria)]).filter(u=>u!==op.url);
        p.Foto_URL=fotos.shift()||'';p.Fotos_Galeria=fotos.join(',');
      }
      if(op.action === 'arquivarMidia' && op.tipo === 'video') {
        const videos=lista([p.Video_URL,...lista(p.Videos_URL),...lista(p.Videos)]).filter(u=>u!==op.url);
        p.Video_URL=videos[0]||'';p.Videos=videos;p.Videos_URL=videos.slice(1).join(',');
      }
    }
    return p;
  }
  function criar(ctx) {
    let rodando=false;
    const chaves = () => {
      const dono=ctx.conta();if(!dono)return [];
      const prefixo=PREFIXO+dono+':';
      return Object.keys(localStorage).filter(k=>k.startsWith(prefixo)).sort();
    };
    const trabalhos = () => { try { return chaves().map(k=>{try {
      const j=JSON.parse(localStorage.getItem(k));
      if(!j||!Array.isArray(j.ops)||!Number.isInteger(j.indice)||j.indice<0||j.indice>j.ops.length||
        !j.ops.every(op=>op&&String(op.id)===String(j.id)&&['update','arquivarRapido','arquivarMidia'].includes(op.action)&&
          Object.keys(op).every(k=>['action','id',...(op.action==='update'?['tamanhos','cores']:op.action==='arquivarMidia'?['tipo','url']:[])].includes(k))))throw Error();
      return {...j,chave:k};
    }catch(_){return {chave:k,invalido:true,erro:true};}}); } catch(_){ return []; } };
    const notificar = () => { ctx.atualizar();window.dispatchEvent(new CustomEvent('tk:disponibilidade')); };
    async function processar() {
      if(rodando||!ctx.conta()||!ctx.pode()||!navigator.onLine)return;
      const dono=ctx.conta();rodando=true;
      const executar=async()=>{
        for(const job of trabalhos()) {
          if(job.invalido)continue;
          if(ctx.conta()!==dono||!ctx.pode())break;
          if(job.erro)break; // manter a ordem; a pessoa decide quando tentar novamente
          try {
            while(job.indice<job.ops.length) {
              if(ctx.conta()!==dono||!ctx.pode())return;
              const op=job.ops[job.indice];
              const r=await ctx.enviar(op);
              // Se a resposta anterior se perdeu, mídia já retirada equivale a sucesso.
              const jaRetirada=op.action==='arquivarMidia'&&/^(Essa foto|Esse vídeo) já não está no produto/.test(r?.erro||'');
              if(!r?.ok&&!jaRetirada)throw Error(r?.erro||'Não foi possível confirmar o salvamento.');
              job.indice++;
              localStorage.setItem(job.chave,JSON.stringify(job));
            }
            localStorage.removeItem(job.chave);
            if(ctx.conta()===dono){ctx.avisar('Disponibilidade salva.');notificar();}
            try{localStorage.setItem('tk_produto_atendimento_atualizado',JSON.stringify({id:job.id,em:Date.now()}));}catch(_){}
          } catch(_) {
            job.erro=true;
            try{localStorage.setItem(job.chave,JSON.stringify(job));}catch(_){}
            if(ctx.conta()===dono){ctx.avisar('Alteração pendente. Em Produtos, toque em Tentar novamente.');notificar();}
            break;
          }
        }
      };
      try {
        if(navigator.locks)await navigator.locks.request('tk-disponibilidade:'+dono,{ifAvailable:true},lock=>lock?executar():undefined);
        else await executar();
      } finally {rodando=false;}
    }
    function tentar() {
      try{for(const job of trabalhos()){if(job.invalido)continue;job.erro=false;localStorage.setItem(job.chave,JSON.stringify(job));}notificar();void processar();}
      catch(_){ctx.avisar('Não consegui acessar as alterações pendentes neste aparelho.');}
    }
    function atualizarAviso(box) {
      const jobs=trabalhos();box.hidden=!jobs.length;box.replaceChildren();if(!jobs.length)return;
      const invalidos=jobs.filter(j=>j.invalido);
      if(invalidos.length){box.append(novo('span','','Um registro local não pôde ser lido. Reabra a peça e confira a disponibilidade.'));const limpar=novo('button','','Descartar registro inválido');limpar.type='button';limpar.onclick=()=>{try{invalidos.forEach(j=>localStorage.removeItem(j.chave));notificar();}catch(_){ctx.avisar('Não consegui limpar o registro local.');}};box.append(limpar);return;}
      const erro=jobs.some(j=>j.erro);
      box.append(novo('span','',erro?'Não foi possível salvar. Alterações guardadas neste aparelho.':navigator.onLine?'Salvando disponibilidade… Você pode continuar.':'Sem conexão. Alterações guardadas neste aparelho.'));
      if(erro||!navigator.onLine){const b=novo('button','','Tentar novamente');b.type='button';b.onclick=tentar;box.append(b);}
    }
    function abrir(p) {
      if(!ctx.pode()){ctx.avisar('Seu acesso não permite alterar a disponibilidade.');return;}
      if(document.getElementById('ms-edicao-tamanhos'))return;
      const id=String(p.ID||'');if(!/^[A-Za-z0-9_-]{1,90}$/.test(id))return;
      const dono=ctx.conta(), anterior=document.activeElement;
      const fotos=lista([p.Foto_URL,...lista(p.Fotos_Galeria)]), videos=lista([p.Video_URL,...lista(p.Videos_URL),...lista(p.Videos)]);
      // Cada token original é preservado; retirar um nunca cria numerações/idades novas.
      const tokens=lista(p.Tamanhos).flatMap(t=>/^Etiqueta:/i.test(t)?t.replace(/^Etiqueta:\s*/i,'').split('/').map(x=>'Etiqueta: '+x.trim()):[t]);
      const tamanhoChave=t=>t.replace(/^Etiqueta:\s*/i,'');
      const tamanhos=lista(tokens.map(tamanhoChave));
      const cores=lista(p.Cores);
      const removidos={foto:new Set(),video:new Set(),tamanho:new Set(),cor:new Set()};
      let arquivar=false, guardado=false;
      const fundo=novo('div','tk-disp-fundo');fundo.id='ms-edicao-tamanhos';
      const painel=novo('section','tk-disp-painel');painel.setAttribute('role','dialog');painel.setAttribute('aria-modal','true');painel.setAttribute('aria-labelledby','tk-disp-titulo');
      const cab=novo('header','tk-disp-cab'), titulo=novo('h3','','Disponibilidade');titulo.id='tk-disp-titulo';
      const fechar=novo('button','tk-disp-fechar','×');fechar.type='button';fechar.setAttribute('aria-label','Fechar sem salvar');cab.append(titulo,fechar);
      const corpo=novo('div','tk-disp-corpo'), nome=novo('strong','',p.Nome||'Peça');
      corpo.append(nome,novo('small','tk-disp-info',[p.Codigo,typeof window.TKTecido!=='undefined'&&TKTecido.ler(p)].filter(Boolean).join(' · ')));
      const status=novo('p','tk-disp-status','Retire o que acabou. As outras informações ficam como estão.');status.setAttribute('role','status');
      function grupo(rotulo,itens,tipo,midia) {
        if(!itens.length)return;
        const sec=novo('section','tk-disp-grupo'), h=novo('h4','',rotulo), box=novo('div',midia?'tk-disp-midias':'tk-disp-chips');sec.append(h,box);corpo.append(sec);
        itens.forEach((valor,i)=>{
          const item=novo('div',midia?'tk-disp-midia':'tk-disp-item');
          if(midia&&tipo==='foto'){const template=novo('template');template.innerHTML='<img '+(typeof atribSrc==='function'?atribSrc(valor):'')+'>';const img=template.content.firstElementChild;img.alt='Foto '+(i+1);img.loading='lazy';if(typeof atribSrc!=='function')img.src=valor;item.append(img);}
          else item.append(novo('span','',midia?'Vídeo '+(i+1):valor.replace(/^Idade:\s*/i,'').replace(/^Veste:\s*/i,'Veste ')));
          const b=novo('button','','×');b.type='button';b.setAttribute('aria-label','Retirar '+(midia?rotulo.toLowerCase()+' '+(i+1):valor));
          b.onclick=()=>{removidos[tipo].add(valor);const prox=item.nextElementSibling?.querySelector('button')||item.previousElementSibling?.querySelector('button');item.remove();(prox||salvar).focus();
            if(!box.childElementCount)box.append(novo('small','','Nenhuma opção restante.'));
            status.textContent=precisaArquivar()?(fotos.length&&removidos.foto.size===fotos.length?'Sem fotos: a peça inteira será arquivada ao salvar.':'Sem disponibilidade restante: a peça será arquivada ao salvar.'):'Retirada preparada. Toque em Salvar alterações.';};
          item.append(b);box.append(item);
        });
      }
      const precisaArquivar=()=>arquivar||(fotos.length>0&&removidos.foto.size===fotos.length)||(tamanhos.length>0&&removidos.tamanho.size===tamanhos.length)||(cores.length>0&&removidos.cor.size===cores.length);
      grupo('Fotos',fotos,'foto',true);grupo('Vídeos',videos,'video',true);
      grupo('Tamanhos e idades',tamanhos,'tamanho');grupo('Cores e estampas',cores,'cor');
      const detalhes=novo('details','tk-disp-detalhes'), resumo=novo('summary','','Informações da peça');detalhes.append(resumo);
      const dl=novo('dl');for(const [r,v] of [['Categoria',p.Categoria],['Gênero',p.Genero],['Descrição',window.TKTecido?TKTecido.semDescricao(p.Descricao):p.Descricao],['Preço',typeof moeda==='function'?moeda(p.Preco):p.Preco],['Estoque',p.Estoque]]){if(v!==''&&v!=null){dl.append(novo('dt','',r),novo('dd','',String(v)));}}detalhes.append(dl);corpo.append(detalhes);
      const arq=novo('button','tk-disp-arquivar','× Arquivar produto inteiro');arq.type='button';arq.onclick=()=>{arquivar=!arquivar;arq.setAttribute('aria-pressed',String(arquivar));arq.textContent=arquivar?'↶ Manter produto':'× Arquivar produto inteiro';status.textContent=arquivar?'A peça inteira será arquivada ao salvar.':'Produto mantido. Confira as retiradas antes de salvar.';};arq.setAttribute('aria-pressed','false');corpo.append(arq);
      const rodape=novo('footer','tk-disp-rodape'), cancelar=novo('button','','Cancelar'), salvar=novo('button','tk-disp-salvar','Salvar alterações');cancelar.type=salvar.type='button';rodape.append(cancelar,salvar);painel.append(cab,corpo,status,rodape);fundo.append(painel);
      function encerrar(){fundo.remove();if(window.TKCamadas&&TKCamadas.aberta('ms-edicao-tamanhos'))TKCamadas.desempilhar('ms-edicao-tamanhos');if(anterior?.isConnected)anterior.focus({preventScroll:true});}
      fechar.onclick=cancelar.onclick=encerrar;fundo.onclick=e=>{if(e.target===fundo)encerrar();};
      fundo.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();encerrar();}if(e.key==='Tab'){const bs=[...painel.querySelectorAll('button,summary')].filter(x=>x.getClientRects().length&&!x.disabled);if(e.shiftKey&&document.activeElement===bs[0]){e.preventDefault();bs.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===bs.at(-1)){e.preventDefault();bs[0].focus();}}};
      salvar.onclick=()=>{
        if(guardado)return;
        if(ctx.conta()!==dono||!ctx.pode()){status.textContent='Seu acesso mudou. Feche e abra Produtos novamente.';return;}
        const ops=[];
        if(precisaArquivar())ops.push({action:'arquivarRapido',id});
        else {
          const patch={action:'update',id};
          if(removidos.tamanho.size)patch.tamanhos=tokens.filter(x=>!removidos.tamanho.has(tamanhoChave(x))).join(', ');
          if(removidos.cor.size)patch.cores=cores.filter(x=>!removidos.cor.has(x)).join(', ');
          if('tamanhos' in patch||'cores' in patch)ops.push(patch);
          for(const tipo of ['foto','video'])for(const url of removidos[tipo])ops.push({action:'arquivarMidia',id,tipo,url});
        }
        if(!ops.length){encerrar();return;}
        try {
          const chave=PREFIXO+dono+':'+Date.now()+':'+crypto.randomUUID();
          localStorage.setItem(chave,JSON.stringify({id,ops,indice:0,erro:false}));
          guardado=true;aplicar(p,ops);encerrar();notificar();ctx.avisar('Alteração guardada. Salvando em segundo plano…');void processar();
        }catch(_){status.textContent='Não consegui guardar a alteração neste aparelho. Libere espaço e tente salvar novamente.';}
      };
      document.body.append(fundo);if(window.TKCamadas)TKCamadas.empilhar('ms-edicao-tamanhos',encerrar);fechar.focus({preventScroll:true});
    }
    window.addEventListener('online',tentar);
    window.addEventListener('storage',e=>{if(e.key?.startsWith(PREFIXO)){notificar();void processar();}});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void processar();});
    setInterval(()=>void processar(),15000);setTimeout(()=>void processar(),3000);
    return {abrir,pode:ctx.pode,projetar:ps=>{for(const j of trabalhos()){if(j.invalido)continue;const p=ps.find(p=>String(p.ID)===j.id);if(p)aplicar(p,j.ops);}return ps;},aviso:()=>{const x=novo('div','tk-disp-pendente');x.setAttribute('role','status');atualizarAviso(x);return x;},atualizarAviso};
  }
  window.TKDisponibilidade={criar};
})();
