// Regression tests for the actual TKEsteiraRetomada implementation.
// Run: node --test tests/esteira-retomada-indexeddb.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto').webcrypto;
const source=fs.readFileSync(require('node:path').join(__dirname,'../esteira-fluidez.js'),'utf8');
function setup(delay=0){
 const records=new Map();
 const store={
  get(k){return request(()=>records.get(k));},
  put(v,k){return request(()=>records.set(k,v));},
  delete(k){return request(()=>records.delete(k));},
  openCursor(){return request(()=>null)}
 };
 let tx;
 function request(fn){
  const req={result:null};
  setTimeout(()=>{req.result=fn();req.onsuccess?.({target:req});if(req!==tx?.cursor)setTimeout(()=>tx?.oncomplete?.(),0)},0);
  return req;
 }
 const db={transaction(){tx={objectStore(){return store}};return tx;}};
 const indexedDB={open(){const req={result:db};setTimeout(()=>req.onsuccess?.(),delay);return req;}};
 const context={window:{},indexedDB,crypto,TextEncoder,Uint8Array,Date,Promise,setTimeout};
 vm.runInNewContext(source,context,{filename:'esteira-fluidez.js'});
 return {cache:context.window.TKEsteiraRetomada(),records};
}
const a={whatsapp:'88900000000',sessao:'session-A'},b={whatsapp:'88900000000',sessao:'session-B'};
const item=()=>({em:Date.now(),aba:'fotos',leituras:[['/esteira/fotos',{ok:true}],['/esteira/caixa?pagina=1',{ok:true}]]});
test('slow IndexedDB opens and restores Fotos and Caixa without a network API',async()=>{
 const {cache}=setup(350);
 await cache.gravar(a,item(),()=>true);
 const restored=await cache.ler(a);
 assert.equal(restored.aba,'fotos');
 assert.equal(restored.leituras.length,2);
});
test('missing, expired and isolated session snapshots are not restored',async()=>{
 const {cache}=setup();
 assert.equal(await cache.ler(a),null);
 await cache.gravar(a,{...item(),em:Date.now()-21*60*1000},()=>true);
 assert.equal(await cache.ler(a),null);
 await cache.gravar(a,item(),()=>true);
 assert.equal(await cache.ler(b),null);
 assert.ok(await cache.ler(a));
 await cache.limpar(a);
 assert.equal(await cache.ler(a),null);
});
test('revoked write permission does not persist a snapshot',async()=>{
 const {cache}=setup();
 await cache.gravar(a,item(),()=>false);
 assert.equal(await cache.ler(a),null);
});
