'use strict';
const fs=require('fs'),vm=require('vm'),crypto=require('crypto'),assert=require('assert');
const file=process.env.BACKEND_CATALOGO;
if(!file)throw Error('Informe BACKEND_CATALOGO');
const s=fs.readFileSync(file,'utf8'),code=s.slice(s.indexOf('function acZapHash_'));
function ambiente(){
 const props=new Map(),envios=[],log=[];let now=Date.now(),codigo='',linhas=[{__row:2,senha:'old',status:'Ativo'}];
 const c={Date:{now:()=>now},AC_MIN_SENHA_:8,Utilities:{getUuid:()=>{const id=crypto.randomUUID();codigo=id.replace(/-/g,'').slice(0,10).toUpperCase();return id;},DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(a,v)=>crypto.createHash(a).update(v).digest()},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k),getProperties:()=>Object.fromEntries(props)})},
 LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},acResolverIdentificador_:x=>x==='exists'?'85999999999':'',acWhats_:x=>x,acLinhasDoWhats_:w=>w?linhas:[],waflyConfigurada_:()=>true,waflyCredenciais_:()=>({clientToken:'fake'}),waflyUrl_:()=> 'https://example.test',
 UrlFetchApp:{fetch:(url,o)=>envios.push(JSON.parse(o.payload))},acPlanilha_:()=>({}),acCabecalhos_:()=>[],acGuardarSenha_:p=>'hash:'+p,acRegravarLinha_:(sh,h,row,v)=>{linhas[0].senha=v.senha;},acLimpaFalhas_(){},acLog_:(...x)=>log.push(x)};
 vm.createContext(c);vm.runInContext(code,c);return {c,props,envios,log,get codigo(){return codigo;},advance:()=>now+=600001,linhas};
}
let a=ambiente(),r=a.c.acZapIniciar_({identificador:'exists',telefone:'attacker'}),codigo=a.codigo;
assert.equal(a.envios.length,1);assert.equal(a.envios[0].phone,'5585999999999');
assert(!JSON.stringify([...a.props]).includes(codigo));
assert.equal(a.c.acZapConcluir_({desafio:r.desafio,codigo,novaSenha:'new-pass123'}).ok,true);
assert.equal(a.c.acZapConcluir_({desafio:r.desafio,codigo,novaSenha:'other-pass'}).ok,false);
assert.equal(a.linhas[0].senha,'hash:new-pass123');
a=ambiente();r=a.c.acZapIniciar_({identificador:'missing'});assert.equal(r.ok,true);assert.equal(a.envios.length,0);
a=ambiente();r=a.c.acZapIniciar_({identificador:'exists'});codigo=a.codigo;a.advance();assert.equal(a.c.acZapConcluir_({desafio:r.desafio,codigo,novaSenha:'new-pass123'}).ok,false);
a=ambiente();r=a.c.acZapIniciar_({identificador:'exists'});codigo=a.codigo;
for(let i=0;i<5;i++)assert.equal(a.c.acZapConcluir_({desafio:r.desafio,codigo:'0000000000',novaSenha:'new-pass123'}).ok,false);
assert.equal(a.c.acZapConcluir_({desafio:r.desafio,codigo,novaSenha:'new-pass123'}).ok,false);
a=ambiente();for(let i=0;i<4;i++)a.c.acZapIniciar_({identificador:'exists'});assert.equal(a.envios.length,3);
a=ambiente();r=a.c.acZapIniciar_({identificador:'exists'});codigo=a.codigo;a.linhas[0].senha='changed';assert.equal(a.c.acZapConcluir_({desafio:r.desafio,codigo,novaSenha:'new-pass123'}).ok,false);
a=ambiente();r=a.c.acZapIniciar_({identificador:'exists'});codigo=a.codigo;a.linhas[0].status='Inativo';assert.equal(a.c.acZapConcluir_({desafio:r.desafio,codigo,novaSenha:'new-pass123'}).ok,false);
console.log('PASS recuperação: destino fixo, hash, consumo único, expiração, 5 erros, rate limit, conta ausente/inativa e senha alterada.');
