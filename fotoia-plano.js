/* Plano de uma foto: pessoas explícitas, roupas por pessoa e identidade estável de envio.
 * Sem DOM/rede/credenciais. Compartilhado pela página e seus testes de contrato. */
(function(root){
  'use strict';
  const id = () => crypto.randomUUID();
  const copiar = x => typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x));
  const novaPessoa = () => ({ id:id(), modo:'look', pose:'frente', publico:'cadastro', roupa:{} });
  const novaFoto = () => ({ id:id(), pedidoId:id(), titulo:'', pessoas:[novaPessoa()], visual:{cenario:'loja',estilo:'natural',composicao:'lado_a_lado'}, destino:'status', motor:'klein4b', extra:'', estado:'rascunho', job:null, erro:'' });
  const novaBase = foto => { const f=copiar(foto);f.id=id();f.pedidoId=id();f.estado='rascunho';f.job=null;f.erro='';delete f.tentativa;f.pessoas.forEach(p=>{p.id=id()});return f; };
  const semAc = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function tipoPeca(p){
    if(/^\s*looks?\b/.test(semAc(p.Nome))||/\blooks?\b/.test(semAc(p.Categoria)))return 'look';
    const t=' '+semAc((p.Categoria||'')+' '+(p.Nome||''))+' ';
    if(/\b(vestido\w*|macac\w*|macaquinho\w*|conjunto\w*|fantasia\w*|biquini\w*|maio\w*|pijama\w*)\b/.test(t))return 'look';
    if(/\b(calca\w*|short\w*|saia\w*|bermuda\w*|legging\w*|pantalona\w*|jogger\w*|calcoes)\b/.test(t))return 'baixo';
    if(/\b(blusa\w*|camiseta\w*|camisa\w*|cropped\w*|top\w*|regata\w*|body|bodies|jaqueta\w*|casaco\w*|colete\w*|moletom\w*|cardigan\w*|bata\w*)\b/.test(t))return 'cima';
    return '';
  }
  const papeis = pessoa => pessoa.modo==='par'?['cima','baixo']:['look'];
  function referencias(foto){
    const refs=[],looks=[];
    foto.pessoas.forEach(p=>{const l=[];papeis(p).forEach(papel=>{const r=p.roupa[papel];if(!r)return;const chave=[r.produto||'',r.url||r.id||'',papel].join('|');let i=refs.findIndex(x=>x.chave===chave);if(i<0){i=refs.length;refs.push({...r,chave,papel})}l.push(i)});looks.push(l)});
    return {refs,looks};
  }
  function validar(f, info){
    const erros=[];
    if(!f.pessoas.length||f.pessoas.length>6)erros.push('Escolha de uma a seis pessoas nesta foto.');
    f.pessoas.forEach((p,i)=>{
      papeis(p).forEach(k=>{if(!p.roupa[k])erros.push('Pessoa '+(i+1)+': falta escolher '+({look:'o look completo',cima:'a peça de cima',baixo:'a peça de baixo'})[k]+'.')});
      if(papeis(p).every(k=>p.roupa[k])&&!papeis(p).some(k=>p.roupa[k].produto)&&p.publico==='cadastro')erros.push('Pessoa '+(i+1)+': informe o público para as fotos do aparelho.');
      if(p.modo==='par')for(const k of ['cima','baixo'])if(p.roupa[k]&&['cima','baixo'].includes(p.roupa[k].tipo)&&p.roupa[k].tipo!==k)erros.push('Pessoa '+(i+1)+': confira a posição da peça '+p.roupa[k].nome+'.');
      if(p.modo==='look' && p.roupa.look && ['cima','baixo'].includes(p.roupa.look.tipo))erros.push('Pessoa '+(i+1)+': esta é uma peça '+(p.roupa.look.tipo==='cima'?'de cima':'de baixo')+'. Use Cima e baixo para completar a roupa sem inventar peças.');
    });
    const {refs}=referencias(f);
    if(refs.length>6)erros.push('Esta foto usa '+refs.length+' referências. O máximo é seis; distribua as combinações em mais fotos.');
    if(refs.length>4&&f.motor!=='auto')erros.push('Os motores Cloudflare aceitam quatro referências. Para '+refs.length+', escolha o padrão da gestão com Gemini habilitado ou distribua as pessoas em mais fotos.');
    if(info){
      const provedores=info.config.provedores||[];
      if(f.motor!=='auto'&&(!info.cloudflare?.disponivel||!provedores.includes('cloudflare')))erros.push('O Cloudflare está desabilitado. Peça ao gestor para habilitar ou escolha o padrão da gestão.');
      if(refs.length>4&&(!info.temChave||!provedores.includes('gemini')))erros.push('Esta foto exige Gemini com geração de imagens habilitada. Ele não está configurado; reduza as referências para até quatro.');
      if(!info.config.ligado)erros.push('A criação de fotos está pausada pelo gestor. O planejamento pode ser salvo.');
    }
    return [...new Set(erros)];
  }
  function pacote(foto){
    const {refs,looks}=referencias(foto);
    const pecas=refs.map(r=>({produto:r.produto||'',codigo:r.codigo||'',nome:r.nome||'Foto do aparelho',avista:Number(r.avista)>0?Number(r.avista):null}));
    return {pedidoId:foto.pedidoId,versaoPlano:2,nome:foto.titulo.trim()||pecas.map(p=>p.nome).filter((n,i,a)=>a.indexOf(n)===i).join(' + ').slice(0,120),produto: new Set(pecas.map(p=>p.codigo)).size===1?pecas[0]?.codigo||'':'',papeis:refs.map(r=>r.papel),looks,pessoas:foto.pessoas.map(p=>({pose:p.pose,publico:p.publico})),visual:{...foto.visual},rotulos:pecas.map(p=>p.nome),pecas,destino:foto.destino,quem:'mulheres',motor:foto.motor,extra:foto.extra};
  }
  const api={id,copiar,novaPessoa,novaFoto,novaBase,semAc,tipoPeca,papeis,referencias,validar,pacote};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TKFotoIAPlano=api;
})(typeof window!=='undefined'?window:globalThis);
