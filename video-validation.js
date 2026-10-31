/* TENKiTER — validação compartilhada de vídeos no navegador. Sem serviços externos. */
(function (global) {
  'use strict';
  const MIME_OK = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
  function lerMetadados(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file), video = document.createElement('video');
      let terminou = false;
      const fim = (resultado) => {
        if (terminou) return;
        terminou = true; video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); resolve(resultado);
      };
      video.preload = 'metadata';
      video.onloadedmetadata = () => fim({ ok: Number.isFinite(video.duration) && video.duration > 0, duration: video.duration, width: video.videoWidth, height: video.videoHeight });
      video.onerror = () => fim({ ok: false });
      video.src = url;
      try { video.load(); } catch (_) { fim({ ok: false }); }
      setTimeout(() => fim({ ok: false }), 10000);
    });
  }
  async function validar(file, options) {
    options = options || {};
    const maxMB = Number(options.maxMB) || 20, maxBytes=Number(options.maxBytes)||maxMB*1048576, erros = [], mime = String(file && file.type || '').toLowerCase(), nome = String(file && file.name || 'vídeo');
    if (!file || (!mime.startsWith('video/') && !/\.(mp4|mov|webm)$/i.test(nome))) return { ok: false, erros: ['Selecione um arquivo de vídeo MP4, MOV ou WebM.'] };
    if (!MIME_OK.has(mime) && !/\.(mp4|mov|webm)$/i.test(nome)) return { ok: false, erros: ['Formato não reconhecido. Use MP4, MOV ou WebM.'] };
    if (file.size > maxBytes) erros.push('O arquivo tem ' + (file.size / 1048576).toFixed(1) + ' MiB; o limite desta tela é ' + (maxBytes/1048576).toFixed(1) + ' MiB.');
    if (!file.size) erros.push('O arquivo está vazio.');
    let meta = { ok: false };
    if (!erros.length) meta = await lerMetadados(file);
    if (!erros.length && !meta.ok) erros.push('Não consegui ler a duração e a resolução deste vídeo. Ele pode estar incompleto ou usar formato incompatível. Exporte novamente como MP4 e tente outra vez.');
    if (!erros.length && options.maxDurationSeconds && meta.duration > options.maxDurationSeconds) erros.push('O vídeo dura ' + Math.round(meta.duration) + ' segundos; o limite desta publicação é ' + options.maxDurationSeconds + ' segundos.');
    if(!erros.length && options.minDurationSeconds && meta.duration < options.minDurationSeconds)erros.push('O vídeo precisa de pelo menos '+options.minDurationSeconds+' segundos para esta publicação.');
    return erros.length ? { ok: false, erros, metadata: meta } : { ok: true, erros: [], metadata: meta };
  }
  global.TKVideoValidation = Object.freeze({ validar, inspecionar:lerMetadados });
})(window);

/* Dois perfis comuns: Mensageiro preserva duração; Postagens reutiliza uma mídia. */
(function(global){
  'use strict';
  const perfis=Object.freeze({mensageiro:{bytes:15000000,max:0,min:0},postagens:{bytes:9961472,max:30,min:3}});
  async function preparar(file,op){
    const perfil=perfis[op.perfil];if(!perfil)throw Error('Perfil de vídeo indisponível.');
    if(!file.size||file.size>40*1048576)throw Error('A preparação aceita originais de até 40 MiB. Preserve o original e use um link para arquivos maiores.');
    const meta=await global.TKVideoValidation.inspecionar(file);
    const buf=await file.arrayBuffer(),ascii=new TextDecoder('latin1').decode(buf);
    const compativel=file.type==='video/mp4'&&/avc1|avc3/.test(ascii)&&!/hvc1|hev1/.test(ascii);
    if(meta.ok&&compativel&&file.size<=perfil.bytes&&(!perfil.max||meta.duration<=perfil.max)&&meta.duration>=perfil.min)return file;
    if(op.perfil==='postagens'&&meta.ok&&meta.duration<3)throw Error('Para usar o mesmo vídeo em Status, Grupo e Story, escolha um vídeo de pelo menos 3 segundos.');
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buf)),x=>x.toString(16).padStart(2,'0')).join('');
    return new Promise((resolve,reject)=>{
      const fundo=document.createElement('div');fundo.id='tk-video-preparo';fundo.style.cssText='position:fixed;inset:0;z-index:11000;background:#0009;display:flex;align-items:center;justify-content:center;padding:16px';
      const box=document.createElement('section');box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','Preparar vídeo');box.style.cssText='width:min(100%,480px);max-height:90dvh;overflow:auto;padding:20px;border-radius:16px;background:#fff;color:#292b25;display:grid;gap:12px';
      const title=document.createElement('h3');title.textContent='Preparar vídeo';title.style.margin='0';
      const info=document.createElement('p');info.textContent=op.perfil==='mensageiro'?'Vamos preparar um MP4 compatível, preservando a duração inteira. O tamanho será ajustado quando necessário.':'Uma única mídia de 3 a 30 segundos, até 9,5 MiB, para Status, Grupo e Story.';info.style.margin='0';
      const video=document.createElement('video'),local=URL.createObjectURL(file);video.src=local;video.controls=true;video.preload='metadata';video.style.cssText='width:100%;max-height:28dvh;background:#111';
      const faixa=document.createElement('label');faixa.textContent='Início do trecho (segundos)';const start=document.createElement('input');start.type='number';start.min='0';start.step='0.1';start.value='0';start.style.cssText='width:100%;min-height:44px';faixa.appendChild(start);
      const tempo=document.createElement('label');tempo.textContent='Duração do trecho (3 a 30 segundos)';const dur=document.createElement('input');dur.type='number';dur.min='3';dur.max='30';dur.step='0.1';dur.value=String(Math.min(30,meta.ok?meta.duration:30));dur.style.cssText=start.style.cssText;tempo.appendChild(dur);
      const dividir=op.perfil==='postagens'&&meta.ok&&meta.duration>30,recortar=op.perfil==='postagens'&&!meta.ok;faixa.hidden=!recortar;tempo.hidden=!(recortar||dividir);if(dividir){tempo.firstChild.textContent='Duração máxima de cada parte (3 a 30 segundos)';info.textContent='O vídeo inteiro será dividido em partes, na ordem original. Cada parte terá até 9,5 MiB. A última pode ser menor.';}
      start.addEventListener('input',()=>{if(Number.isFinite(Number(start.value)))video.currentTime=Number(start.value);});
      const status=document.createElement('p');status.setAttribute('role','status');status.style.margin='0';status.textContent='O processamento pode levar alguns minutos. O original será preservado; nada será enviado automaticamente.';
      const go=document.createElement('button');go.type='button';go.textContent=dividir?'Preparar todas as partes':recortar?'Preparar este trecho':'Preparar vídeo';go.style.cssText='min-height:48px;background:#292b25;color:#fff;border:0;border-radius:8px;font:inherit;font-weight:700';
      const fechar=document.createElement('button');fechar.type='button';fechar.textContent='Cancelar';fechar.style.cssText='min-height:44px;background:#fff;color:#292b25;border:1px solid #ccc;border-radius:8px;font:inherit';
      box.append(title,info,video,faixa,tempo,status,go,fechar);fundo.appendChild(box);document.body.appendChild(fundo);
      let ativo=true,iniciado=false,urlPreparado=null;const urlsPartes=[];const anterior=document.activeElement;
      const fim=(erro,resultado)=>{if(!ativo)return;ativo=false;fundo.remove();video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(local);if(urlPreparado)URL.revokeObjectURL(urlPreparado);urlsPartes.forEach(u=>URL.revokeObjectURL(u));if(global.TKCamadas?.aberta('tk-video-preparo'))TKCamadas.desempilhar('tk-video-preparo');anterior?.focus?.({preventScroll:true});erro?reject(erro):resolve(resultado);};
      if(global.TKCamadas)TKCamadas.empilhar('tk-video-preparo',()=>fim(Error(iniciado?'Preparação continua no servidor. Selecione o mesmo original para recuperar; nada foi enviado.':'Preparação cancelada. O original foi preservado.')));
      fechar.onclick=()=>fim(Error(iniciado?'Preparação continua no servidor. Selecione o mesmo original para recuperar; nada foi enviado.':'Preparação cancelada.'));
      box.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();fechar.click();return;}if(e.key!=='Tab')return;const alvos=[...box.querySelectorAll('button,input,video')].filter(x=>!x.disabled&&x.getClientRects().length);if(e.shiftKey&&document.activeElement===alvos[0]){e.preventDefault();alvos.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===alvos.at(-1)){e.preventDefault();alvos[0].focus();}});
      go.focus();
      go.onclick=async()=>{
        const inicio=dividir?Number(dur.value):recortar?Number(start.value):0,seg=op.perfil==='postagens'?(dividir?meta.duration:recortar?Number(dur.value):meta.duration):0;
        if(!Number.isFinite(inicio)||inicio<0||(op.perfil==='postagens'&&(!Number.isFinite(seg)||seg<3||(!dividir&&seg>30)||(dividir&&(!Number.isFinite(inicio)||inicio<3||inicio>30))||(!dividir&&meta.ok&&inicio+seg>meta.duration+.01)))){status.textContent='Escolha um trecho dentro do vídeo, com duração de 3 a 30 segundos.';return;}
        go.disabled=true;start.disabled=dur.disabled=true;iniciado=true;fechar.textContent='Fechar e recuperar depois';
        const key=(dividir?'tk-video-partes-v1:':'tk-video-v1:')+op.conta+':'+op.perfil+':'+hash+':'+inicio+':'+seg;
        const rota=op.base.replace(/\/$/,'')+(op.perfil==='mensageiro'?'/msg/video-preparar':'/post/video-preparar')+(dividir?'?partes=1':'');
        const query=dividir?'&':'?';
        const chamar=async(url,body)=>{const r=await fetch(url,{method:body?'POST':'GET',headers:op.headers,body,signal:AbortSignal.timeout(body?120000:30000)});const j=await r.json();if(!r.ok||!j.ok)throw Error(j.erro||'Não foi possível preparar agora.');return j;};
        try{
          let id;try{id=sessionStorage.getItem(key);}catch(_){}
          if(id){try{await chamar(rota+query+'id='+encodeURIComponent(id));}catch(_){id=null;}}
          if(!id){status.textContent='Enviando o original para preparação privada…';const r=await chamar(rota+query+'inicio='+inicio+'&duracao='+seg,file);id=r.id;try{sessionStorage.setItem(key,id);}catch(_){}}
          const limite=Date.now()+15*60000;
          while(ativo&&Date.now()<limite){
            const r=await chamar(rota+query+'id='+encodeURIComponent(id));
            if(!ativo)return;
            if(r.estado==='erro'){try{sessionStorage.removeItem(key);}catch(_){}throw Error(r.erro||'Conversão não concluída.');}
            if(r.estado==='pronto'){
              if(dividir){
                const ps=r.partes||[],n=Math.ceil(meta.duration/inicio);if(ps.length!==n)throw Error('A preparação não contém todas as partes do original.');
                const arquivos=[];
                for(const pt of ps){
                  if(!ativo)return;status.textContent='Conferindo parte '+pt.ordem+' de '+n+'…';
                  const res=await fetch(rota+query+'arquivo=1&id='+encodeURIComponent(id)+'&parte='+pt.ordem,{headers:op.headers,signal:AbortSignal.timeout(60000)});if(!res.ok)throw Error('Não consegui recuperar todas as partes. Selecione novamente o original.');
                  const f=new File([await res.blob()],file.name.replace(/\.[^.]+$/,'')+'-parte-'+String(pt.ordem).padStart(2,'0')+'-de-'+n+'.mp4',{type:'video/mp4'});
                  const v=await global.TKVideoValidation.validar(f,{maxBytes:perfil.bytes,maxDurationSeconds:30,minDurationSeconds:3});if(!v.ok||Math.abs(v.metadata.duration-pt.duracao)>.15)throw Error('Uma das partes não passou na conferência.');
                  f.tkParte={preparo:id,ordem:pt.ordem,total:n};arquivos.push(f);urlsPartes.push(URL.createObjectURL(f));
                }
                const nav=document.createElement('div');nav.style.cssText='display:flex;gap:8px;flex-wrap:wrap';nav.setAttribute('aria-label','Prévia das partes');
                arquivos.forEach((f,i)=>{const b=document.createElement('button');b.type='button';b.textContent='Parte '+(i+1)+'/'+n;b.style.cssText='min-height:44px;min-width:44px;font:inherit';b.onclick=()=>{video.src=urlsPartes[i];video.load();};nav.appendChild(b);});
                video.src=urlsPartes[0];video.load();box.insertBefore(nav,status);title.textContent='Partes prontas';info.textContent=n+' vídeos em ordem. Confira a imagem e o som. A primeira parte respeita o agendamento; as seguintes aguardam a confirmação da anterior.';
                status.textContent='Nada foi enviado. O original foi preservado.';faixa.hidden=tempo.hidden=true;go.textContent='Usar as '+n+' partes';go.disabled=false;go.onclick=()=>fim(null,arquivos);fechar.textContent='Descartar resultados';iniciado=false;go.focus();return;
              }
              status.textContent='Conferindo o resultado…';const resposta=await fetch(rota+query+'arquivo=1&id='+encodeURIComponent(id),{headers:op.headers,signal:AbortSignal.timeout(60000)});if(!resposta.ok)throw Error('Não foi possível recuperar o vídeo pronto. Selecione o mesmo original para tentar de novo.');
              const blob=await resposta.blob(),saida=new File([blob],file.name.replace(/\.[^.]+$/,'')+'-preparado.mp4',{type:'video/mp4'});
              const v=await global.TKVideoValidation.validar(saida,{maxBytes:perfil.bytes,maxDurationSeconds:perfil.max,minDurationSeconds:perfil.min});
              if(!v.ok)throw Error(v.erros.join(' '));if(op.perfil==='postagens'&&Math.abs(v.metadata.duration-seg)>.15)throw Error('O resultado não corresponde ao trecho escolhido.');if(op.perfil==='mensageiro'&&meta.ok&&Math.abs(v.metadata.duration-meta.duration)>.15)throw Error('A duração mudou. O vídeo preparado não será usado.');
              urlPreparado=URL.createObjectURL(saida);video.src=urlPreparado;video.load();title.textContent='Vídeo pronto';info.textContent='Confira a imagem e o som antes de usar. '+v.metadata.duration.toFixed(1).replace('.',',')+' s · '+(saida.size/1048576).toFixed(1).replace('.',',')+' MiB.';status.textContent='Nada foi enviado. O original está preservado.';faixa.hidden=tempo.hidden=true;go.textContent='Usar este vídeo';go.disabled=false;go.onclick=()=>fim(null,saida);fechar.textContent='Descartar resultado';iniciado=false;go.focus();return;
            }
            status.textContent=r.estado==='processando'?'Comprimindo o vídeo…':'Na fila de preparação. Pode levar alguns minutos; você pode fechar e recuperar depois.';
            await new Promise(ok=>setTimeout(ok,5000));
          }
          if(ativo)throw Error('Ainda não terminou. Selecione o mesmo original para recuperar depois; nada foi enviado.');
        }catch(e){if(ativo){status.textContent=e.message||'Não foi possível preparar agora.';go.disabled=false;go.textContent='Tentar novamente';start.disabled=dur.disabled=false;}}
      };
    });
  }
  global.TKVideoPreparation=Object.freeze({preparar,perfis});
})(window);
