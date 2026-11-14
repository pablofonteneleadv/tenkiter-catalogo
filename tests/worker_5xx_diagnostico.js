/* Observabilidade segura de 5xx: o erro bruto e a URL do cliente nunca saem no log.
 * Executa o Worker real como modulo, mas SEM requisicoes, D1 ou dados reais. */
'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
const src=fs.readFileSync(path.join(__dirname,'..','instagram-worker','worker.js'),'utf8');
const tmp=path.join(os.tmpdir(),'tk_http5xx_'+process.pid+'.mjs');
fs.writeFileSync(tmp,src+'\nexport {classeFalhaHTTP_,rotaErroHTTP_};\n');
(async()=>{
 let passed=0;
 const chk=(name,condition)=>{assert.ok(condition,name);passed++;console.log('PASS: '+name)};
 try {
  const W=await import(pathToFileURL(tmp).href);
  const cat=W.classeFalhaHTTP_,rota=W.rotaErroHTTP_;
  chk('SQLite e D1 classificados como banco',cat('D1_ERROR SQLITE_BUSY: database locked')==='banco');
  chk('Coluna ausente classificada como banco',cat('no such column: segredo')==='banco');
  chk('Timeout classificado como tempo',cat('Deadline exceeded, authorization refused')==='tempo');
  chk('Quota classificada como limite',cat('Quota exceeded')==='limite');
  chk('Falha externa classificada como externo',cat('fetch failed, gateway unavailable')==='externo');
  chk('Erro generico nao cria categoria inventada',cat('Nao foi possivel continuar')==='indeterminado');
  const segredo='token-super-secreto-abc',telefone='5588999887766';
  const resultado=JSON.stringify({tipo:cat('Falha '+segredo+' '+telefone),rota:rota('/msg/pessoa/'+telefone)});
  chk('Erro arbitrario nao divulga segredo ou telefone',!resultado.includes(segredo)&&!resultado.includes(telefone));
  chk('Rota de acesso preservada',rota('/msg/acesso')==='/msg/acesso');
  chk('Rota de tempo real preservada',rota('/msg/tempo-real')==='/msg/tempo-real');
  chk('Rota mobile com path dinamico e anonima',rota('/msg/mobile/'+telefone)==='/msg/mobile');
  chk('Rota de caixa com caminho e anonima',rota('/esteira/caixa/'+telefone)==='/esteira/caixa');
  chk('Conferencia e hoje identificaveis',rota('/esteira/conferir')==='/esteira/conferir'&&rota('/esteira/hoje')==='/esteira/hoje');
  for(const aba of ['menu','preparacao','fotos','pedidos','painel','config']){
    const base='/esteira/'+aba;
    chk('Falha de '+aba+' agrupa o caminho sem expor o sufixo',rota(base+'/'+telefone)===base);
  }
  chk('Caminho de ficha com telefone e anonimo',rota('/msg/pessoa/'+telefone)==='/outras');
  chk('Prefixo parecido nao vira rota conhecida',rota('/msg/acessos')==='/outras');
  const log=src.slice(src.indexOf("evento:'tk_http5xx'"),src.indexOf("evento:'tk_http5xx'")+170);
  chk('Logger de erros integrado no adaptador de respostas',src.includes('if (Number(s) >= 500)')&&log.includes('rotaErroHTTP_(url.pathname)'));
  chk('Log tem so categoria, status e rota, nao escreve mensagem bruta',log.includes('classeFalhaHTTP_(c?.erro)')&&!log.includes('req.headers')&&!log.includes('req.url'));
  const origem='https://tenkitermodas.com.br',consoleError=console.error,fetchAntes=globalThis.fetch,cacheAntes=globalThis.caches,logs=[];
  try{
    console.error=(s)=>logs.push(JSON.parse(s));
    globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,usuario:{permissoes:['gerir_acessos']}}));
    globalThis.caches={default:{async put(){}}};
    const env={API_URL:'https://catalogo.fake/exec',DB:{prepare(){throw Error('D1_ERROR: '+segredo+' '+telefone)}}};
    const r=await W.default.fetch(new Request('https://worker.fake/esteira/preparacao?depois='+telefone,{headers:{Origin:origem,'X-TK-Whats':telefone,'X-TK-Sessao':'tk3.simulada'}}),env,{});
    chk('Erro D1 em Preparação preserva a resposta genérica',r.status===500&&(await r.json()).erro.startsWith('A Esteira não respondeu'));
    chk('Erro D1 em Preparação registra somente rota, status e categoria',JSON.stringify(logs)===JSON.stringify([{evento:'tk_http5xx',rota:'/esteira/preparacao',codigo:500,tipo:'banco'}]));
  }finally{globalThis.fetch=fetchAntes;globalThis.caches=cacheAntes;console.error=consoleError;}
  console.log('PASS 5xx seguro:',passed,'verificacoes');
 }catch(e){console.error('FAIL 5xx seguro:',e);process.exitCode=1;}
 finally{fs.rmSync(tmp,{force:true});}
})();
